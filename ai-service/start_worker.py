#!/usr/bin/env python3
"""
Start RQ workers for transcription and translation queues.
Run this alongside the FastAPI service.
"""
import os
import logging
import redis
from rq import Worker, Queue

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("autocaption.rq-worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

if __name__ == "__main__":
    conn = redis.from_url(REDIS_URL)
    queues = [
        Queue("transcription", connection=conn),
        Queue("translation", connection=conn),
    ]
    worker = Worker(queues, connection=conn)
    logger.info("RQ Worker started – listening on: transcription, translation")
    worker.work(with_scheduler=True)
