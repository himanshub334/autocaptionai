"""
Transcription Worker
Handles audio extraction, speech-to-text via Faster-Whisper,
speaker diarization via Pyannote, and subtitle file generation.
"""

import os
import json
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

import redis
import ffmpeg

logger = logging.getLogger("autocaption.worker.transcription")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_conn = redis.from_url(REDIS_URL)

# Lazy model cache
_whisper_model = None
_diarization_pipeline = None


def get_whisper_model(model_size: str = "base"):
    """Lazy-load Faster-Whisper model (cached)."""
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        device = os.getenv("DEVICE", "cpu")
        compute_type = os.getenv("COMPUTE_TYPE", "int8")
        logger.info(f"Loading Faster-Whisper model: {model_size} on {device}")
        _whisper_model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
        )
        logger.info("Whisper model loaded successfully")
    return _whisper_model


def get_diarization_pipeline():
    """Lazy-load Pyannote speaker diarization pipeline."""
    global _diarization_pipeline
    if _diarization_pipeline is None:
        try:
            from pyannote.audio import Pipeline
            logger.info("Loading Pyannote diarization pipeline...")
            _diarization_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=os.getenv("HF_TOKEN"),
            )
            logger.info("Diarization pipeline loaded")
        except Exception as e:
            logger.warning(f"Diarization not available: {e}")
            _diarization_pipeline = None
    return _diarization_pipeline


def update_job_status(job_id: str, status: str, progress: int,
                      result: dict = None, error: str = None):
    """Update job status in Redis."""
    data = {"status": status, "progress": str(progress)}
    if result:
        data["result"] = json.dumps(result)
    if error:
        data["error"] = error
    redis_conn.hset(f"job:{job_id}", mapping=data)
    # Publish progress event
    redis_conn.publish(f"job_progress:{job_id}", json.dumps({
        "status": status, "progress": progress
    }))


def extract_audio(video_path: str, audio_path: str) -> bool:
    """Extract audio from video using FFmpeg."""
    try:
        (
            ffmpeg
            .input(video_path)
            .output(
                audio_path,
                acodec='pcm_s16le',
                ar=16000,
                ac=1,
                loglevel='error',
            )
            .overwrite_output()
            .run()
        )
        return True
    except ffmpeg.Error as e:
        logger.error(f"FFmpeg error: {e.stderr.decode()}")
        return False


def segments_to_srt(segments: List[Dict]) -> str:
    """Convert segments to SRT format."""
    lines = []
    for i, seg in enumerate(segments, 1):
        start = format_timestamp_srt(seg["start"])
        end = format_timestamp_srt(seg["end"])
        speaker = f"[{seg['speaker']}] " if seg.get("speaker") else ""
        lines.append(f"{i}\n{start} --> {end}\n{speaker}{seg['text'].strip()}\n")
    return "\n".join(lines)


def segments_to_vtt(segments: List[Dict]) -> str:
    """Convert segments to WebVTT format."""
    lines = ["WEBVTT\n"]
    for i, seg in enumerate(segments, 1):
        start = format_timestamp_vtt(seg["start"])
        end = format_timestamp_vtt(seg["end"])
        speaker = f"<v {seg['speaker']}>" if seg.get("speaker") else ""
        lines.append(f"{i}\n{start} --> {end}\n{speaker}{seg['text'].strip()}\n")
    return "\n".join(lines)


def segments_to_txt(segments: List[Dict]) -> str:
    """Convert segments to plain text."""
    return "\n".join(seg["text"].strip() for seg in segments)


def format_timestamp_srt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_timestamp_vtt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def assign_speakers_to_segments(whisper_segments: List[Dict],
                                 diarization) -> List[Dict]:
    """Merge Pyannote speaker labels into Whisper segments."""
    if diarization is None:
        return whisper_segments
    
    speaker_map = {}
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speaker_map[(turn.start, turn.end)] = speaker
    
    for seg in whisper_segments:
        seg_mid = (seg["start"] + seg["end"]) / 2
        best_speaker = "SPEAKER_00"
        for (start, end), speaker in speaker_map.items():
            if start <= seg_mid <= end:
                best_speaker = speaker
                break
        seg["speaker"] = best_speaker
    
    return whisper_segments


def download_from_minio(file_key: str, local_path: str) -> bool:
    """Download file from MinIO."""
    try:
        from utils.minio_client import get_minio_client
        client = get_minio_client()
        bucket = os.getenv("MINIO_BUCKET", "autocaption-videos")
        client.fget_object(bucket, file_key, local_path)
        return True
    except Exception as e:
        logger.error(f"MinIO download error: {e}")
        return False


def upload_to_minio(local_path: str, object_key: str) -> bool:
    """Upload result to MinIO."""
    try:
        from utils.minio_client import get_minio_client
        client = get_minio_client()
        bucket = os.getenv("MINIO_BUCKET", "autocaption-videos")
        client.fput_object(bucket, object_key, local_path)
        return True
    except Exception as e:
        logger.error(f"MinIO upload error: {e}")
        return False


def process_transcription_job(job_data: Dict[str, Any]):
    """
    Main transcription worker function.
    Called by RQ worker process.
    """
    job_id = job_data["job_id"]
    file_key = job_data["file_key"]
    language = job_data.get("language")  # None = auto-detect
    model_size = job_data.get("model_size", "base")
    enable_diarization = job_data.get("enable_diarization", False)
    task = job_data.get("task", "transcribe")

    logger.info(f"Starting transcription job {job_id}")
    update_job_status(job_id, "downloading", 5)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_dir = Path(tmp_dir)
        video_path = str(tmp_dir / "input_video")
        audio_path = str(tmp_dir / "audio.wav")

        # 1. Download video from MinIO
        if not download_from_minio(file_key, video_path):
            update_job_status(job_id, "failed", 0, error="Failed to download video file")
            return

        update_job_status(job_id, "extracting_audio", 15)

        # 2. Extract audio
        if not extract_audio(video_path, audio_path):
            update_job_status(job_id, "failed", 0, error="Failed to extract audio from video")
            return

        update_job_status(job_id, "transcribing", 30)

        # 3. Transcribe with Faster-Whisper
        try:
            model = get_whisper_model(model_size)
            
            whisper_segments, info = model.transcribe(
                audio_path,
                language=language if language != "auto" else None,
                task=task,
                beam_size=5,
                best_of=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
                word_timestamps=True,
            )

            detected_language = info.language
            logger.info(f"Detected language: {detected_language} (confidence: {info.language_probability:.2f})")

            # Convert generator to list with progress updates
            segments_list = []
            for seg in whisper_segments:
                segments_list.append({
                    "id": seg.id,
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                    "words": [
                        {"word": w.word, "start": w.start, "end": w.end, "probability": w.probability}
                        for w in (seg.words or [])
                    ],
                    "avg_logprob": seg.avg_logprob,
                    "no_speech_prob": seg.no_speech_prob,
                })

        except Exception as e:
            logger.exception(f"Transcription failed: {e}")
            update_job_status(job_id, "failed", 0, error=f"Transcription error: {str(e)}")
            return

        update_job_status(job_id, "processing", 70)

        # 4. Optional speaker diarization
        if enable_diarization:
            update_job_status(job_id, "diarizing", 75)
            try:
                pipeline = get_diarization_pipeline()
                if pipeline:
                    diarization = pipeline(audio_path)
                    segments_list = assign_speakers_to_segments(segments_list, diarization)
            except Exception as e:
                logger.warning(f"Diarization failed (skipping): {e}")

        update_job_status(job_id, "generating_subtitles", 85)

        # 5. Generate subtitle files
        try:
            srt_content = segments_to_srt(segments_list)
            vtt_content = segments_to_vtt(segments_list)
            txt_content = segments_to_txt(segments_list)
            json_content = json.dumps({
                "language": detected_language,
                "duration": info.duration,
                "segments": segments_list
            }, indent=2, ensure_ascii=False)

            base_key = f"subtitles/{job_id}"
            
            for ext, content in [("srt", srt_content), ("vtt", vtt_content),
                                   ("txt", txt_content), ("json", json_content)]:
                local_file = str(tmp_dir / f"subtitles.{ext}")
                with open(local_file, "w", encoding="utf-8") as f:
                    f.write(content)
                upload_to_minio(local_file, f"{base_key}.{ext}")

        except Exception as e:
            logger.exception(f"Subtitle generation failed: {e}")
            update_job_status(job_id, "failed", 0, error=f"Subtitle generation error: {str(e)}")
            return

        # 6. Final result
        result = {
            "language": detected_language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 2),
            "segments": segments_list,
            "segment_count": len(segments_list),
            "subtitle_keys": {
                "srt": f"{base_key}.srt",
                "vtt": f"{base_key}.vtt",
                "txt": f"{base_key}.txt",
                "json": f"{base_key}.json",
            }
        }

        update_job_status(job_id, "completed", 100, result=result)
        logger.info(f"Job {job_id} completed: {len(segments_list)} segments, lang={detected_language}")
        return result
