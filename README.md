# AutoCaption AI

> **Open-source, self-hosted subtitle generation platform** — zero recurring API costs.

Automatically generate accurate subtitles from videos using **Faster-Whisper**, edit them in a
professional in-browser editor, translate between Hindi ↔ English with **MarianMT/NLLB**, and
export SRT/VTT/TXT/JSON or burn captions directly into video with **FFmpeg**.

---

## ✨ Features

- 🎙️ **Local AI transcription** — Faster-Whisper (CPU or GPU), no OpenAI/AssemblyAI/Deepgram
- 🌐 **English, Hindi & Hinglish** support with automatic language detection
- 👥 **Speaker diarization** via Pyannote (optional, open-source)
- 🔁 **Translation** — Hindi ↔ English via Helsinki-NLP MarianMT / NLLB-200
- ✂️ **Professional subtitle editor** — split, merge, search & replace, live preview
- 🎬 **Burn-in export** — embed styled captions into video for Shorts/Reels/TikTok
- 📦 **4 export formats** — SRT, VTT, TXT, JSON (YouTube/Vimeo/OTT compatible)
- 🔐 **JWT auth** with refresh token rotation
- 📊 **Dashboards & analytics** — usage charts, language breakdown, project management
- ⚙️ **Async job queue** (Redis + RQ) with progress tracking and retries
- 🐳 **Fully dockerized** — one `docker-compose up` to run everything

---

## 🏗️ Architecture

```
┌──────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Frontend   │─────▶│   Backend    │─────▶│   AI Service     │
│  React + TS  │      │ Node/Express │      │ FastAPI + Python │
│  Tailwind    │◀─────│  PostgreSQL  │◀─────│  Faster-Whisper  │
└──────────────┘      └──────┬───────┘      │  Pyannote/NLLB   │
                              │              └────────┬─────────┘
                       ┌──────┴───────┐               │
                       │    MinIO     │◀──────────────┘
                       │  (S3 storage)│
                       └──────┬───────┘
                              │
                       ┌──────┴───────┐
                       │ Redis (RQ)   │  ← job queue + progress
                       └──────────────┘
```

| Layer        | Tech                                                      |
|--------------|------------------------------------------------------------|
| Frontend     | React 18, TypeScript, Tailwind CSS, Radix UI, Zustand     |
| Backend      | Node.js 20, Express, JWT auth, Multer, Archiver           |
| Database     | PostgreSQL 16                                              |
| Storage      | MinIO (S3-compatible)                                      |
| Job Queue    | Redis + RQ (Python workers)                                |
| AI – STT     | Faster-Whisper (CTranslate2)                               |
| AI – Translate | Helsinki-NLP MarianMT / Facebook NLLB-200               |
| AI – Diarization | Pyannote Audio 3.1                                    |
| Video        | FFmpeg                                                     |
| Proxy        | Nginx                                                      |

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose v2
- 4GB+ RAM (8GB+ recommended for `medium`/`large` Whisper models)
- (Optional) NVIDIA GPU + nvidia-container-toolkit for GPU acceleration

### 1. Clone & configure

```bash
cp .env.example .env
# Edit .env — set strong passwords/secrets
```

### 2. Start the stack

```bash
docker compose up -d --build
```

This launches: PostgreSQL, Redis, MinIO, AI service (+worker), Backend, Frontend, Nginx.

### 3. Access

- App: **http://localhost**
- MinIO console: **http://localhost:9001**
- Backend health: **http://localhost/health**

First run will download the Whisper `base` model (~150MB) on first transcription request.

---

## ⚙️ Configuration

### Whisper model selection (`.env`)

| Model     | RAM   | Speed     | Accuracy |
|-----------|-------|-----------|----------|
| tiny      | ~1GB  | Fastest   | Lower    |
| base      | ~1GB  | Fast      | Good (default) |
| small     | ~2GB  | Medium    | Better   |
| medium    | ~5GB  | Slow      | High     |
| large-v3  | ~10GB | Slowest   | Best     |

### GPU acceleration

Set in `.env`:
```
DEVICE=cuda
COMPUTE_TYPE=float16
```
And add `runtime: nvidia` + `deploy.resources.reservations.devices` to the `ai-service` and
`ai-worker` blocks in `docker-compose.yml` (requires NVIDIA Container Toolkit).

### Speaker diarization

Pyannote models require a free HuggingFace token (accept model terms once):
1. Create account at https://huggingface.co
2. Accept terms for `pyannote/speaker-diarization-3.1`
3. Generate token: https://huggingface.co/settings/tokens
4. Set `HF_TOKEN=hf_xxx` in `.env`

---

## 📡 API Overview

Full API docs: [`docs/API.md`](docs/API.md)

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login, returns JWT + refresh token |
| `/api/auth/refresh` | POST | Rotate access token |
| `/api/videos/upload` | POST | Upload video (multipart) → starts transcription |
| `/api/videos/:id/status` | GET | Poll processing progress |
| `/api/subtitles/:id/segments` | GET/PUT/POST/DELETE | Manage subtitle segments |
| `/api/subtitles/:id/search-replace` | POST | Bulk find & replace |
| `/api/subtitles/:id/download/:format` | GET | Download srt/vtt/txt/json |
| `/api/subtitles/:id/burn` | POST | Burn subtitles into video (FFmpeg) |
| `/api/subtitles/:id/translate` | POST | Translate segments (MarianMT/NLLB) |
| `/api/projects` | GET/POST | Project management |
| `/api/analytics/dashboard` | GET | Usage stats |

---

## 🧪 Testing

```bash
cd backend && npm test
```

---

## 🔒 Security Notes

- Change **all** secrets in `.env` before deploying publicly
- JWT access tokens expire in 15 minutes; refresh tokens rotate on use
- Rate limiting applied to `/api/auth/*` and `/api/videos/upload`
- Helmet.js security headers enabled
- Run behind HTTPS in production (configure `nginx/ssl/`)

---

## 📦 Deployment (Linux VPS)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a full guide covering:
- VPS sizing recommendations
- SSL with Let's Encrypt / Certbot
- Systemd service for auto-restart
- Backup strategy for PostgreSQL + MinIO volumes
- Scaling AI workers horizontally

---

## 📄 License

MIT — built entirely on open-source components. No paid APIs required.
