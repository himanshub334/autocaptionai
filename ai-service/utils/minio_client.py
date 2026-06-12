"""MinIO client utility for AI service."""
import os
import logging
from minio import Minio
from minio.error import S3Error

logger = logging.getLogger("autocaption.minio")

_client = None

def get_minio_client() -> Minio:
    global _client
    if _client is None:
        endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
        access_key = os.getenv("MINIO_ACCESS_KEY", "autocaption")
        secret_key = os.getenv("MINIO_SECRET_KEY", "autocaption_minio_secret")
        secure = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
        _client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
    return _client

def ensure_bucket(client: Minio, bucket_name: str):
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            logger.info(f"Created MinIO bucket: {bucket_name}")
    except S3Error as e:
        logger.error(f"MinIO bucket error: {e}")
        raise

def generate_presigned_url(object_key: str, expires_hours: int = 24) -> str:
    from datetime import timedelta
    client = get_minio_client()
    bucket = os.getenv("MINIO_BUCKET", "autocaption-videos")
    url = client.presigned_get_object(bucket, object_key, expires=timedelta(hours=expires_hours))
    return url
