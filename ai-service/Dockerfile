FROM python:3.11-slim

WORKDIR /app

# System deps: ffmpeg + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    curl \
    build-essential \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper model at build time (optional; can be lazy-loaded)
ARG WHISPER_MODEL=base
ENV MODEL_SIZE=${WHISPER_MODEL}

COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
