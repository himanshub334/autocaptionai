"""
AutoCaption AI – AI Service
FastAPI application providing transcription, translation, and speaker diarization
using open-source models (Faster-Whisper, MarianMT/NLLB, Pyannote).
"""

import os
import json
import logging
import asyncio
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

import redis
from rq import Queue, Worker
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from workers.transcription_worker import process_transcription_job
from workers.translation_worker import process_translation_job
from utils.minio_client import get_minio_client, ensure_bucket

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("autocaption.ai")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AutoCaption AI Service",
    description="Open-source speech-to-text and translation service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Redis / RQ ────────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_conn = redis.from_url(REDIS_URL)
transcription_queue = Queue("transcription", connection=redis_conn, default_timeout=3600)
translation_queue = Queue("translation", connection=redis_conn, default_timeout=600)

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    logger.info("AutoCaption AI Service starting up...")
    try:
        minio = get_minio_client()
        ensure_bucket(minio, os.getenv("MINIO_BUCKET", "autocaption-videos"))
        logger.info("MinIO bucket ready")
    except Exception as e:
        logger.warning(f"MinIO init warning (will retry): {e}")

# ── Models ────────────────────────────────────────────────────────────────────
class TranscriptionRequest(BaseModel):
    job_id: str
    file_key: str            # MinIO object key
    language: Optional[str] = None   # auto-detect if None
    model_size: str = "base"
    enable_diarization: bool = False
    task: str = "transcribe"  # "transcribe" | "translate"

class TranslationRequest(BaseModel):
    job_id: str
    text: str
    source_lang: str
    target_lang: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    result: Optional[dict] = None
    error: Optional[str] = None

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "autocaption-ai"}

@app.post("/transcribe")
async def transcribe(req: TranscriptionRequest, background_tasks: BackgroundTasks):
    """Enqueue a transcription job."""
    logger.info(f"Enqueuing transcription job {req.job_id}")
    
    # Set initial status in Redis
    redis_conn.hset(f"job:{req.job_id}", mapping={
        "status": "queued",
        "progress": 0,
    })
    
    job = transcription_queue.enqueue(
        process_transcription_job,
        args=(req.dict(),),
        job_id=f"transcribe-{req.job_id}",
        result_ttl=86400,
        failure_ttl=86400,
    )
    
    return {"queued": True, "rq_job_id": job.id}

@app.post("/translate")
async def translate(req: TranslationRequest):
    """Enqueue a translation job."""
    redis_conn.hset(f"job:{req.job_id}:translation", mapping={
        "status": "queued",
        "progress": 0,
    })
    
    job = translation_queue.enqueue(
        process_translation_job,
        args=(req.dict(),),
        job_id=f"translate-{req.job_id}",
        result_ttl=3600,
    )
    
    return {"queued": True, "rq_job_id": job.id}

@app.get("/job/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get current job status from Redis."""
    data = redis_conn.hgetall(f"job:{job_id}")
    if not data:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Decode bytes
    decoded = {k.decode(): v.decode() for k, v in data.items()}
    
    result = None
    if decoded.get("result"):
        try:
            result = json.loads(decoded["result"])
        except Exception:
            pass
    
    return JobStatusResponse(
        job_id=job_id,
        status=decoded.get("status", "unknown"),
        progress=int(decoded.get("progress", 0)),
        result=result,
        error=decoded.get("error"),
    )

@app.get("/supported-languages")
async def supported_languages():
    return {
        "languages": [
            {"code": "en", "name": "English"},
            {"code": "hi", "name": "Hindi"},
            {"code": "auto", "name": "Auto Detect"},
        ],
        "translation_pairs": [
            {"source": "en", "target": "hi"},
            {"source": "hi", "target": "en"},
        ]
    }

@app.get("/models")
async def available_models():
    return {
        "whisper_models": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        "current_model": os.getenv("MODEL_SIZE", "base"),
        "device": os.getenv("DEVICE", "cpu"),
    }
