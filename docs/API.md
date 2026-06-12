# AutoCaption AI – API Documentation

Base URL: `http://localhost/api` (or your domain)

All authenticated endpoints require header:
```
Authorization: Bearer <accessToken>
```

---

## Authentication

### POST `/auth/register`
```json
// Request
{ "email": "user@example.com", "name": "Himanshu Sharma", "password": "SecurePass123" }

// Response 201
{
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "user" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```
Password must be ≥8 chars, contain at least one letter and one number.

### POST `/auth/login`
```json
{ "email": "user@example.com", "password": "SecurePass123" }
```
Returns same shape as register.

### POST `/auth/refresh`
```json
{ "refreshToken": "eyJ..." }
```
Returns new `{ accessToken, refreshToken }` (rotated).

### POST `/auth/logout` 🔒
```json
{ "refreshToken": "eyJ..." }
```

### GET `/auth/me` 🔒
Returns current user profile.

---

## Videos

### POST `/videos/upload` 🔒
`multipart/form-data`:
| Field | Type | Notes |
|---|---|---|
| `video` | file | mp4/mov/avi/mkv/webm, max 500MB |
| `language` | string | `auto`, `en`, `hi` |
| `model_size` | string | `tiny`/`base`/`small`/`medium`/`large-v3` |
| `enable_diarization` | string | `"true"`/`"false"` |
| `project_id` | string | optional UUID |

Response `202`:
```json
{ "video_id": "uuid", "status": "processing", "message": "..." }
```

### GET `/videos` 🔒
Query params: `page`, `limit`, `status`, `project_id`

### GET `/videos/:id` 🔒
Returns video with `playback_url` (presigned MinIO URL, 1hr expiry).

### GET `/videos/:id/status` 🔒
```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 65,
  "detected_language": null,
  "segment_count": 0
}
```
Poll this every 2s while `status` is `processing`/`queued`.

### POST `/videos/:id/reprocess` 🔒
Body (optional): `{ "language": "hi", "model_size": "medium", "enable_diarization": true }`

### DELETE `/videos/:id` 🔒
Deletes video, subtitles, and MinIO objects.

---

## Subtitles

### GET `/subtitles/:videoId/segments` 🔒
```json
{
  "segments": [
    {
      "id": "uuid",
      "segment_index": 0,
      "start_time": 0.0,
      "end_time": 3.42,
      "text": "Hello and welcome",
      "speaker": "SPEAKER_00",
      "translated_text": null
    }
  ]
}
```

### PUT `/subtitles/:videoId/segments/:segId` 🔒
```json
{ "text": "Updated text", "start_time": 0.5, "end_time": 3.0 }
```
All fields optional.

### POST `/subtitles/:videoId/segments` 🔒
Create new segment:
```json
{ "text": "New line", "start_time": 10.0, "end_time": 12.0 }
```

### DELETE `/subtitles/:videoId/segments/:segId` 🔒

### POST `/subtitles/:videoId/search-replace` 🔒
```json
{ "search": "gonna", "replace": "going to", "case_sensitive": false }
```
Uses PostgreSQL `REGEXP_REPLACE` — `search` supports regex.

### GET `/subtitles/:videoId/download/:format` 🔒
`format` ∈ `srt | vtt | txt | json`. Returns file with appropriate `Content-Disposition`.
Always regenerated from current (edited) DB segments.

### POST `/subtitles/:videoId/burn` 🔒
```json
{
  "font_size": 24,
  "font_color": "white",
  "bg_color": "black@0.5",
  "position": "bottom",
  "font_name": "Arial"
}
```
Response:
```json
{ "message": "Burn-in complete", "download_url": "https://minio/...", "file_key": "burned/..." }
```
⚠️ Synchronous — runs FFmpeg server-side, may take minutes for long videos.

### POST `/subtitles/:videoId/translate` 🔒
```json
{ "source_lang": "en", "target_lang": "hi" }
```
Dispatches async job to AI service (MarianMT/NLLB). Response `202`:
```json
{ "translation_job_id": "uuid", "message": "Translation queued" }
```

---

## Projects

### GET `/projects` 🔒 — list with video counts
### POST `/projects` 🔒 — `{ "name": "...", "description": "..." }`
### PUT `/projects/:id` 🔒
### DELETE `/projects/:id` 🔒

---

## Exports

### POST `/exports/archive/:videoId` 🔒
Returns a `.zip` containing SRT/VTT/TXT/JSON for a completed video.

---

## Analytics

### GET `/analytics/dashboard` 🔒
```json
{
  "stats": { "total_videos": 12, "completed": 10, "processing": 1, "failed": 1, "total_minutes": 45 },
  "languages": [{ "language": "en", "count": 8 }, { "language": "hi", "count": 4 }],
  "recent_activity": [ ... ]
}
```

### GET `/analytics/usage` 🔒
Daily video counts/duration for the last 30 days.

---

## AI Service (internal, port 8000)

Used internally by the backend — not exposed publicly by default.

### POST `/transcribe`
```json
{
  "job_id": "uuid",
  "file_key": "videos/user/uuid.mp4",
  "language": null,
  "model_size": "base",
  "enable_diarization": false,
  "task": "transcribe"
}
```

### GET `/job/{job_id}`
```json
{ "job_id": "uuid", "status": "transcribing", "progress": 30, "result": null, "error": null }
```

Status values: `queued → downloading → extracting_audio → transcribing → processing →
(diarizing) → generating_subtitles → completed | failed`

---

## Error Format

```json
{ "error": "Human-readable message" }
```
Validation errors:
```json
{ "errors": [{ "msg": "...", "param": "email", "location": "body" }] }
```
