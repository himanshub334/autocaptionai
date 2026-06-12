'use strict';
const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ── Projects Router ───────────────────────────────────────────────────────────
const projectRouter = express.Router();

projectRouter.get('/', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, COUNT(v.id) as video_count
     FROM projects p
     LEFT JOIN videos v ON v.project_id = p.id
     WHERE p.user_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json({ projects: rows });
});

projectRouter.post('/', authenticate, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });

  const { rows } = await query(
    'INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, name, description || null]
  );
  res.status(201).json({ project: rows[0] });
});

projectRouter.put('/:id', authenticate, async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await query(
    `UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description)
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [name, description, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: rows[0] });
});

projectRouter.delete('/:id', authenticate, async (req, res) => {
  await query(
    'DELETE FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  res.json({ message: 'Project deleted' });
});

// ── Analytics Router ──────────────────────────────────────────────────────────
const analyticsRouter = express.Router();

analyticsRouter.get('/dashboard', authenticate, async (req, res) => {
  const [videoStats, langStats, recentActivity] = await Promise.all([
    query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'processing') as processing,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) as total,
         COALESCE(SUM(duration) FILTER (WHERE status = 'completed'), 0) as total_duration_seconds
       FROM videos WHERE user_id = $1`,
      [req.user.id]
    ),
    query(
      `SELECT detected_language as language, COUNT(*) as count
       FROM videos WHERE user_id = $1 AND detected_language IS NOT NULL
       GROUP BY detected_language ORDER BY count DESC`,
      [req.user.id]
    ),
    query(
      `SELECT id, original_name, status, progress, created_at, duration, detected_language
       FROM videos WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [req.user.id]
    ),
  ]);

  const stats = videoStats.rows[0];
  res.json({
    stats: {
      total_videos: parseInt(stats.total),
      completed: parseInt(stats.completed),
      processing: parseInt(stats.processing),
      failed: parseInt(stats.failed),
      total_minutes: Math.round(parseFloat(stats.total_duration_seconds) / 60),
    },
    languages: langStats.rows,
    recent_activity: recentActivity.rows,
  });
});

analyticsRouter.get('/usage', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT 
       DATE_TRUNC('day', created_at) as date,
       COUNT(*) as videos,
       SUM(duration) as duration_seconds
     FROM videos
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY DATE_TRUNC('day', created_at)
     ORDER BY date ASC`,
    [req.user.id]
  );
  res.json({ usage: rows });
});

// ── Exports Router ────────────────────────────────────────────────────────────
const exportsRouter = express.Router();
const archiver = require('archiver');
const { getObject } = require('../config/minio');

exportsRouter.post('/archive/:videoId', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM videos WHERE id = $1 AND user_id = $2 AND status = $3',
    [req.params.videoId, req.user.id, 'completed']
  );

  if (!rows.length) return res.status(404).json({ error: 'Completed video not found' });
  const video = rows[0];

  const { rows: segments } = await query(
    'SELECT * FROM subtitle_segments WHERE video_id = $1 ORDER BY segment_index',
    [req.params.videoId]
  );

  const baseName = video.original_name.replace(/\.[^.]+$/, '');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_subtitles.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  // Generate all formats from DB
  const srtContent = generateSRT(segments);
  const vttContent = generateVTT(segments);
  const txtContent = segments.map(s => s.text.trim()).join('\n');
  const jsonContent = JSON.stringify({ video_id: video.id, segments }, null, 2);

  archive.append(srtContent, { name: `${baseName}.srt` });
  archive.append(vttContent, { name: `${baseName}.vtt` });
  archive.append(txtContent, { name: `${baseName}.txt` });
  archive.append(jsonContent, { name: `${baseName}.json` });

  archive.finalize();
});

function formatTimeSRT(s) {
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${sec},${ms}`;
}

function generateSRT(segments) {
  return segments.map((seg, i) =>
    `${i + 1}\n${formatTimeSRT(seg.start_time)} --> ${formatTimeSRT(seg.end_time)}\n${seg.text.trim()}`
  ).join('\n\n') + '\n';
}

function generateVTT(segments) {
  return ['WEBVTT', '', ...segments.map((seg, i) =>
    `${i + 1}\n${formatTimeSRT(seg.start_time).replace(',', '.')} --> ${formatTimeSRT(seg.end_time).replace(',', '.')}\n${seg.text.trim()}`
  )].join('\n\n');
}

// ── Admin Router ──────────────────────────────────────────────────────────────
const adminRouter = express.Router();
const { requireAdmin } = require('../middleware/auth');

adminRouter.get('/stats', authenticate, requireAdmin, async (req, res) => {
  const [users, videos] = await Promise.all([
    query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'7 days\') as new_this_week FROM users'),
    query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'completed\') as completed, COUNT(*) FILTER (WHERE status = \'failed\') as failed FROM videos'),
  ]);
  res.json({
    users: users.rows[0],
    videos: videos.rows[0],
  });
});

module.exports = { projectRouter, analyticsRouter, exportsRouter, adminRouter };
