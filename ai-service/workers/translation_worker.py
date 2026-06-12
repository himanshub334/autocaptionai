"""
Translation Worker
Uses Helsinki-NLP MarianMT or NLLB models for Hindi <-> English translation.
Completely open-source, no paid APIs.
"""

import os
import json
import logging
from typing import Dict, Any, List

import redis

logger = logging.getLogger("autocaption.worker.translation")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_conn = redis.from_url(REDIS_URL)

# Cached pipelines
_translation_pipelines: Dict[str, Any] = {}


def get_translation_pipeline(source_lang: str, target_lang: str):
    """
    Lazy-load and cache MarianMT translation pipeline.
    Uses Helsinki-NLP models for hi<->en.
    Falls back to NLLB-200 for broader language support.
    """
    key = f"{source_lang}-{target_lang}"
    if key in _translation_pipelines:
        return _translation_pipelines[key]

    from transformers import pipeline, MarianMTModel, MarianTokenizer

    # Helsinki-NLP MarianMT models for hi <-> en
    model_map = {
        "hi-en": "Helsinki-NLP/opus-mt-hi-en",
        "en-hi": "Helsinki-NLP/opus-mt-en-hi",
        # For Hinglish (code-switched), we use English model as fallback
        "hinglish-en": "Helsinki-NLP/opus-mt-hi-en",
    }

    model_name = model_map.get(key)
    if not model_name:
        logger.warning(f"No model for {key}, trying NLLB...")
        # Fallback to NLLB-200-distilled-600M (supports 200 languages)
        nllb_lang_map = {
            "en": "eng_Latn",
            "hi": "hin_Deva",
        }
        src = nllb_lang_map.get(source_lang, "eng_Latn")
        tgt = nllb_lang_map.get(target_lang, "hin_Deva")
        
        pipe = pipeline(
            "translation",
            model="facebook/nllb-200-distilled-600M",
            src_lang=src,
            tgt_lang=tgt,
            max_length=512,
        )
        _translation_pipelines[key] = pipe
        return pipe

    logger.info(f"Loading translation model: {model_name}")
    tokenizer = MarianTokenizer.from_pretrained(model_name)
    model = MarianMTModel.from_pretrained(model_name)
    
    pipe = pipeline(
        "translation",
        model=model,
        tokenizer=tokenizer,
        max_length=512,
    )
    _translation_pipelines[key] = pipe
    logger.info(f"Translation model loaded: {model_name}")
    return pipe


def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate a single text string."""
    if source_lang == target_lang:
        return text
    pipe = get_translation_pipeline(source_lang, target_lang)
    result = pipe(text)
    return result[0]["translation_text"]


def translate_segments(segments: List[Dict], source_lang: str, target_lang: str) -> List[Dict]:
    """Translate all segments, preserving timing information."""
    pipe = get_translation_pipeline(source_lang, target_lang)
    
    # Batch translate for efficiency
    texts = [seg["text"].strip() for seg in segments]
    batch_size = 32
    translated_texts = []
    
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        results = pipe(batch)
        translated_texts.extend([r["translation_text"] for r in results])
    
    translated_segments = []
    for seg, translated_text in zip(segments, translated_texts):
        new_seg = dict(seg)
        new_seg["text"] = translated_text
        new_seg["original_text"] = seg["text"]
        translated_segments.append(new_seg)
    
    return translated_segments


def process_translation_job(job_data: Dict[str, Any]):
    """RQ worker entry point for translation jobs."""
    job_id = job_data["job_id"]
    source_lang = job_data["source_lang"]
    target_lang = job_data["target_lang"]
    
    # Can be either raw text or segments JSON
    text = job_data.get("text", "")
    segments = job_data.get("segments", [])

    logger.info(f"Starting translation job {job_id}: {source_lang} -> {target_lang}")

    def update(status, progress, result=None, error=None):
        data = {"status": status, "progress": str(progress)}
        if result:
            data["result"] = json.dumps(result, ensure_ascii=False)
        if error:
            data["error"] = error
        redis_conn.hset(f"job:{job_id}:translation", mapping=data)

    update("processing", 10)

    try:
        if segments:
            translated = translate_segments(segments, source_lang, target_lang)
            result = {
                "source_lang": source_lang,
                "target_lang": target_lang,
                "segments": translated,
            }
        else:
            translated_text = translate_text(text, source_lang, target_lang)
            result = {
                "source_lang": source_lang,
                "target_lang": target_lang,
                "text": translated_text,
            }

        update("completed", 100, result=result)
        logger.info(f"Translation job {job_id} completed")
        return result

    except Exception as e:
        logger.exception(f"Translation job {job_id} failed: {e}")
        update("failed", 0, error=str(e))
        raise
