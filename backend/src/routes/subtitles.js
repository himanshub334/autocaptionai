'use strict';
const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getPresignedUrl, getObject, putObject, BUCKET } = require('../config/minio');
const logger = require('../utils/logger');

const execAsync = promisify(exec);
const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

// Helper: check video ownership
async function getVideoForUser(videoId, userId) {
  const { rows } = await query(
    'SELECT * FROM videos WHERE id = $1 AND user_id = $2',
    [videoId, userId]
  );
  return rows[0] || null;
}

// ── GET /api/subtitles/:videoId/segments ─────────────────────────────────────
router.get('/:videoId/segments', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { rows } = await query(
    `SELECT * FROM subtitle_segments 
     WHERE video_id = $1 
     ORDER BY segment_index ASC`,
    [req.params.videoId]
  );

  res.json({ segments: rows, video_id: req.params.videoId });
});

// ── PUT /api/subtitles/:videoId/segments/:segId ──────────────────────────────
router.put('/:videoId/segments/:segId', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { text, start_time, end_time } = req.body;

  const { rows } = await query(
    `UPDATE subtitle_segments
     SET text = COALESCE($1, text),
         start_time = COALESCE($2, start_time),
         end_time = COALESCE($3, end_time)
     WHERE id = $4 AND video_id = $5
     RETURNING *`,
    [text, start_time, end_time, req.params.segId, req.params.videoId]
  );

  if (!rows.length) return res.status(404).json({ error: 'Segment not found' });
  res.json({ segment: rows[0] });
});

// ── POST /api/subtitles/:videoId/segments ────────────────────────────────────
router.post('/:videoId/segments', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { text, start_time, end_time, insert_after_index } = req.body;

  // Get max index
  const maxIdx = await query(
    'SELECT MAX(segment_index) as max_idx FROM subtitle_segments WHERE video_id = $1',
    [req.params.videoId]
  );
  const newIndex = (maxIdx.rows[0].max_idx || 0) + 1;

  const { rows } = await query(
    `INSERT INTO subtitle_segments (video_id, segment_index, start_time, end_time, text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.videoId, newIndex, start_time, end_time, text]
  );

  res.status(201).json({ segment: rows[0] });
});

// ── DELETE /api/subtitles/:videoId/segments/:segId ───────────────────────────
router.delete('/:videoId/segments/:segId', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  await query(
    'DELETE FROM subtitle_segments WHERE id = $1 AND video_id = $2',
    [req.params.segId, req.params.videoId]
  );

  res.json({ message: 'Segment deleted' });
});

// ── POST /api/subtitles/:videoId/search-replace ──────────────────────────────
router.post('/:videoId/search-replace', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { search, replace, case_sensitive = false } = req.body;
  if (!search) return res.status(400).json({ error: 'Search term required' });

  const flag = case_sensitive ? 'g' : 'gi';
  const { rows } = await query(
    `UPDATE subtitle_segments
     SET text = REGEXP_REPLACE(text, $1, $2, $3)
     WHERE video_id = $4
     RETURNING id, text`,
    [search, replace || '', flag, req.params.videoId]
  );

  res.json({ updated_count: rows.length, segments: rows });
});

// ── GET /api/subtitles/:videoId/download/:format ─────────────────────────────
router.get('/:videoId/download/:format', authenticate, async (req, res) => {
  const { format } = req.params;
  if (!['srt', 'vtt', 'txt', 'json'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format' });
  }

  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  // Regenerate from current DB segments (includes any edits)
  const { rows: segments } = await query(
    'SELECT * FROM subtitle_segments WHERE video_id = $1 ORDER BY segment_index',
    [req.params.videoId]
  );

  let content, contentType, filename;
  const baseName = video.original_name.replace(/\.[^.]+$/, '');

  switch (format) {
    case 'srt':
      content = generateSRT(segments);
      contentType = 'text/plain';
      filename = `${baseName}.srt`;
      break;
    case 'vtt':
      content = generateVTT(segments);
      contentType = 'text/vtt';
      filename = `${baseName}.vtt`;
      break;
    case 'txt':
      content = segments.map(s => s.text.trim()).join('\n');
      contentType = 'text/plain';
      filename = `${baseName}.txt`;
      break;
    case 'json':
      content = JSON.stringify({ video_id: video.id, segments }, null, 2);
      contentType = 'application/json';
      filename = `${baseName}.json`;
      break;
  }

  res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
});

// ── POST /api/subtitles/:videoId/burn ────────────────────────────────────────
router.post('/:videoId/burn', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  if (video.status !== 'completed') {
    return res.status(400).json({ error: 'Video must be fully transcribed first' });
  }

  const {
    font_size = 24,
    font_color = 'white',
    bg_color = 'black@0.5',
    position = 'bottom',  // bottom | top | center
    font_name = 'Arial',
  } = req.body;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autocaption-burn-'));
  const videoLocalPath = path.join(tmpDir, 'input_video');
  const srtLocalPath = path.join(tmpDir, 'subs.srt');
  const outputPath = path.join(tmpDir, 'output_burned.mp4');

  try {
    // Download video from MinIO
    const { getMinio } = require('../config/minio');
    const minio = getMinio();
    await minio.fGetObject(BUCKET, video.file_key, videoLocalPath);

    // Generate fresh SRT from DB segments
    const { rows: segments } = await query(
      'SELECT * FROM subtitle_segments WHERE video_id = $1 ORDER BY segment_index',
      [req.params.videoId]
    );
    await fs.writeFile(srtLocalPath, generateSRT(segments), 'utf8');

    // Determine subtitle position
    const yPos = position === 'top' ? '10' : position === 'center' ? '(h-text_h)/2' : 'h-50';
    const alignment = position === 'top' ? 2 : position === 'center' ? 2 : 2;

    // FFmpeg burn-in command
    const ffmpegCmd = [
      'ffmpeg -y',
      `-i "${videoLocalPath}"`,
      `-vf "subtitles='${srtLocalPath}':force_style='FontName=${font_name},FontSize=${font_size},PrimaryColour=&H${colorToHex(font_color)}&,BackColour=&H${colorToHex(bg_color)}&,Alignment=${alignment},MarginV=30'"`,
      `-c:a copy`,
      `-preset fast`,
      `"${outputPath}"`,
    ].join(' ');

    await execAsync(ffmpegCmd, { timeout: 600000 }); // 10 min timeout

    // Upload burned video to MinIO
    const burnedKey = `burned/${req.user.id}/${uuidv4()}.mp4`;
    await minio.fPutObject(BUCKET, burnedKey, outputPath, {
      'Content-Type': 'video/mp4',
    });

    const downloadUrl = await getPresignedUrl(burnedKey, 3600);

    res.json({
      message: 'Burn-in complete',
      download_url: downloadUrl,
      file_key: burnedKey,
    });

  } catch (err) {
    logger.error('Burn-in error:', err);
    res.status(500).json({ error: 'Burn-in failed: ' + err.message });
  } finally {
    // Cleanup temp files
    try { await fs.rm(tmpDir, { recursive: true }); } catch (_) {}
  }
});

// ── POST /api/subtitles/:videoId/translate ───────────────────────────────────
router.post('/:videoId/translate', authenticate, async (req, res) => {
  const video = await getVideoForUser(req.params.videoId, req.user.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { target_lang, source_lang } = req.body;
  if (!target_lang) return res.status(400).json({ error: 'target_lang required' });

  const { rows: segments } = await query(
    'SELECT * FROM subtitle_segments WHERE video_id = $1 ORDER BY segment_index',
    [req.params.videoId]
  );

  const jobId = uuidv4();

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/translate`, {
      job_id: jobId,
      source_lang: source_lang || video.detected_language || 'en',
      target_lang,
      segments: segments.map(s => ({ id: s.id, text: s.text, start: s.start_time, end: s.end_time })),
    });

    res.status(202).json({
      translation_job_id: jobId,
      message: 'Translation queued',
    });
  } catch (err) {
    logger.error('Translation dispatch error:', err);
    res.status(500).json({ error: 'Translation failed to start' });
  }
});

// ── Subtitle generators ───────────────────────────────────────────────────────
function formatTimeSRT(s) {
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${sec},${ms}`;
}

function formatTimeVTT(s) {
  return formatTimeSRT(s).replace(',', '.');
}

function generateSRT(segments) {
  return segments.map((seg, i) => {
    const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
    return `${i + 1}\n${formatTimeSRT(seg.start_time)} --> ${formatTimeSRT(seg.end_time)}\n${speaker}${seg.text.trim()}`;
  }).join('\n\n') + '\n';
}

function generateVTT(segments) {
  const lines = ['WEBVTT', ''];
  segments.forEach((seg, i) => {
    const speaker = seg.speaker ? `<v ${seg.speaker}>` : '';
    lines.push(`${i + 1}`);
    lines.push(`${formatTimeVTT(seg.start_time)} --> ${formatTimeVTT(seg.end_time)}`);
    lines.push(`${speaker}${seg.text.trim()}`);
    lines.push('');
  });
  return lines.join('\n');
}

function colorToHex(color) {
  const map = { white: 'FFFFFF', black: '000000', yellow: '00FFFF', red: '0000FF', blue: 'FF0000' };
  return map[color] || 'FFFFFF';
}

module.exports = router;
