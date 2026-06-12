'use strict';
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { putObject, getPresignedUrl, removeObject } = require('../config/minio');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE || '500');

const ALLOWED_MIME = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/webm', 'video/mpeg',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ── POST /api/videos/upload ──────────────────────────────────────────────────
router.post('/upload', authenticate, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file provided' });

  const {
    language = 'auto',
    model_size = 'base',
    enable_diarization = 'false',
    project_id,
  } = req.body;

  const jobId = uuidv4();
  const fileExt = req.file.originalname.split('.').pop().toLowerCase();
  const fileKey = `videos/${req.user.id}/${jobId}.${fileExt}`;

  try {
    // Upload to MinIO
    const buf = req.file.buffer;
    await putObject(fileKey, buf, buf.length, req.file.mimetype);
    logger.info(`Video uploaded to MinIO: ${fileKey}`);

    // Insert video record
    const { rows } = await query(
      `INSERT INTO videos 
        (id, user_id, project_id, original_name, file_key, file_size, mime_type, 
         status, job_id, model_size, enable_diarization)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, $9, $10)
       RETURNING *`,
      [
        jobId, req.user.id,
        project_id || null,
        req.file.originalname,
        fileKey,
        req.file.size,
        req.file.mimetype,
        jobId, // job_id same as video id for simplicity
        model_size,
        enable_diarization === 'true',
      ]
    );

    const video = rows[0];

    // Dispatch to AI service
    await axios.post(`${AI_SERVICE_URL}/transcribe`, {
      job_id: jobId,
      file_key: fileKey,
      language: language === 'auto' ? null : language,
      model_size,
      enable_diarization: enable_diarization === 'true',
    });

    // Update status to queued
    await query('UPDATE videos SET status = $1 WHERE id = $2', ['processing', jobId]);

    res.status(202).json({
      video_id: jobId,
      status: 'processing',
      message: 'Video uploaded and queued for transcription',
    });

  } catch (err) {
    logger.error('Upload error:', err);
    // Clean up MinIO on failure
    try { await removeObject(fileKey); } catch (_) {}
    await query('UPDATE videos SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', err.message, jobId]);
    res.status(500).json({ error: 'Upload processing failed' });
  }
});

// ── GET /api/videos ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 20, status, project_id } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereClause = 'WHERE v.user_id = $1';
  const params = [req.user.id];
  let paramIdx = 2;

  if (status) {
    whereClause += ` AND v.status = $${paramIdx++}`;
    params.push(status);
  }
  if (project_id) {
    whereClause += ` AND v.project_id = $${paramIdx++}`;
    params.push(project_id);
  }

  const { rows } = await query(
    `SELECT v.*, p.name as project_name,
            COUNT(ss.id) as segment_count
     FROM videos v
     LEFT JOIN projects p ON v.project_id = p.id
     LEFT JOIN subtitle_segments ss ON ss.video_id = v.id
     ${whereClause}
     GROUP BY v.id, p.name
     ORDER BY v.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, parseInt(limit), offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM videos v ${whereClause}`,
    params.slice(0, paramIdx - 2)
  );

  res.json({
    videos: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
    }
  });
});

// ── GET /api/videos/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT v.*, p.name as project_name
     FROM videos v
     LEFT JOIN projects p ON v.project_id = p.id
     WHERE v.id = $1 AND v.user_id = $2`,
    [req.params.id, req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Video not found' });

  const video = rows[0];

  // Generate presigned URLs for playback
  if (video.file_key) {
    try {
      video.playback_url = await getPresignedUrl(video.file_key, 3600);
    } catch (_) {}
  }

  res.json({ video });
});

// ── GET /api/videos/:id/status ───────────────────────────────────────────────
router.get('/:id/status', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT id, status, progress, error_message, detected_language, segment_count FROM videos v LEFT JOIN (SELECT video_id, COUNT(*) as segment_count FROM subtitle_segments GROUP BY video_id) s ON s.video_id = v.id WHERE v.id = $1 AND v.user_id = $2',
    [req.params.id, req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Video not found' });

  // Also poll AI service for live progress
  const video = rows[0];
  if (video.status === 'processing') {
    try {
      const redis = getRedis();
      const jobData = await redis.hGetAll(`job:${req.params.id}`);
      if (jobData?.progress) {
        video.progress = parseInt(jobData.progress);
        if (jobData.status === 'completed' && video.status !== 'completed') {
          await syncJobResult(req.params.id, JSON.parse(jobData.result || '{}'));
          video.status = 'completed';
        }
      }
    } catch (_) {}
  }

  res.json(video);
});

async function syncJobResult(videoId, result) {
  if (!result?.subtitle_keys) return;
  const { srt, vtt, txt, json: jsonKey } = result.subtitle_keys;
  
  await query(
    `UPDATE videos SET 
       status = 'completed',
       progress = 100,
       detected_language = $1,
       language_confidence = $2,
       duration = $3,
       subtitle_srt_key = $4,
       subtitle_vtt_key = $5,
       subtitle_txt_key = $6,
       subtitle_json_key = $7
     WHERE id = $8`,
    [result.language, result.language_probability, result.duration,
     srt, vtt, txt, jsonKey, videoId]
  );

  // Store segments in DB
  if (result.segments?.length) {
    for (const seg of result.segments) {
      await query(
        `INSERT INTO subtitle_segments 
           (video_id, segment_index, start_time, end_time, text, speaker, words)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (video_id, segment_index) DO UPDATE
         SET text = EXCLUDED.text, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time`,
        [videoId, seg.id, seg.start, seg.end, seg.text.trim(),
         seg.speaker || null, JSON.stringify(seg.words || [])]
      );
    }
  }
}

// ── DELETE /api/videos/:id ───────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM videos WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Video not found' });
  const video = rows[0];

  // Remove from MinIO
  const keys = [video.file_key, video.subtitle_srt_key, video.subtitle_vtt_key,
                 video.subtitle_txt_key, video.subtitle_json_key].filter(Boolean);
  for (const key of keys) {
    try { await removeObject(key); } catch (_) {}
  }

  await query('DELETE FROM videos WHERE id = $1', [req.params.id]);
  res.json({ message: 'Video deleted successfully' });
});

// ── POST /api/videos/:id/reprocess ──────────────────────────────────────────
router.post('/:id/reprocess', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM videos WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Video not found' });
  const video = rows[0];

  const { language, model_size, enable_diarization } = req.body;

  await query(
    `UPDATE videos SET status = 'processing', progress = 0, error_message = NULL WHERE id = $1`,
    [req.params.id]
  );

  await axios.post(`${AI_SERVICE_URL}/transcribe`, {
    job_id: video.id,
    file_key: video.file_key,
    language: language || null,
    model_size: model_size || video.model_size,
    enable_diarization: enable_diarization ?? video.enable_diarization,
  });

  res.json({ message: 'Reprocessing started', video_id: video.id });
});

module.exports = router;
