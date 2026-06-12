# Deployment Guide — Linux VPS

## 1. Server Sizing

| Whisper Model | Min RAM | Min vCPUs | Notes |
|---|---|---|---|
| tiny/base | 4GB | 2 | Good for testing, light load |
| small | 8GB | 4 | Balanced production default |
| medium | 16GB | 4-8 | High accuracy, slower |
| large-v3 | 32GB | 8+ | Best accuracy; GPU strongly recommended |

GPU (NVIDIA, ≥8GB VRAM) reduces transcription time by 5-10x for medium/large models.

## 2. Initial Server Setup (Ubuntu 22.04)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin (usually bundled with Docker Engine 20.10+)
docker compose version
```

## 3. Clone & Configure

```bash
git clone <your-repo-url> autocaption
cd autocaption
cp .env.example .env
nano .env   # set strong DB_PASSWORD, REDIS_PASSWORD, MINIO_SECRET_KEY, JWT_SECRET, JWT_REFRESH_SECRET
```

Generate strong secrets:
```bash
openssl rand -base64 32   # run twice for JWT_SECRET and JWT_REFRESH_SECRET
```

## 4. Start Services

```bash
docker compose up -d --build
docker compose ps          # verify all healthy
docker compose logs -f ai-service   # watch model download on first run
```

## 5. HTTPS with Let's Encrypt

Install Certbot:
```bash
sudo apt install certbot python3-certbot-nginx -y
```

Update `nginx/nginx.conf` to add a `server_name yourdomain.com;` block, then:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Mount the certs into the nginx container by adding to `docker-compose.yml`:
```yaml
volumes:
  - /etc/letsencrypt:/etc/nginx/ssl:ro
```
And add an HTTPS `server { listen 443 ssl; ... }` block referencing
`/etc/nginx/ssl/live/yourdomain.com/fullchain.pem` and `privkey.pem`.

Set up auto-renewal:
```bash
sudo systemctl enable certbot.timer
```

## 6. Systemd Auto-Start

Create `/etc/systemd/system/autocaption.service`:

```ini
[Unit]
Description=AutoCaption AI
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/autocaption
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable autocaption
sudo systemctl start autocaption
```

## 7. Backups

### PostgreSQL
```bash
docker compose exec postgres pg_dump -U autocaption autocaption | gzip > backup_$(date +%F).sql.gz
```
Schedule with cron:
```cron
0 2 * * * cd /path/to/autocaption && docker compose exec -T postgres pg_dump -U autocaption autocaption | gzip > /backups/db_$(date +\%F).sql.gz
```

### MinIO (video/subtitle storage)
```bash
docker run --rm -v autocaption_minio_data:/data -v /backups:/backup alpine \
  tar czf /backup/minio_$(date +%F).tar.gz -C /data .
```

Restore PostgreSQL:
```bash
gunzip -c backup_2026-06-12.sql.gz | docker compose exec -T postgres psql -U autocaption autocaption
```

## 8. Scaling AI Workers

For higher throughput, scale the worker service horizontally:
```bash
docker compose up -d --scale ai-worker=3
```
Each worker pulls jobs from the shared Redis queue (`transcription`/`translation`).
Note: each worker loads its own copy of the Whisper model into memory — size RAM accordingly
(e.g., 3 workers × `base` model ≈ 3GB+ just for models).

## 9. Monitoring & Logs

```bash
# Tail all logs
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f ai-worker

# Resource usage
docker stats
```

Backend logs are also written to `backend/logs/{combined,error}.log` (mounted volume recommended
for persistence — add `- ./backend/logs:/app/logs` to the backend service volumes).

## 10. Updating

```bash
git pull
docker compose up -d --build
docker compose exec backend node src/models/migrate.js   # if schema changed
```

## 11. Troubleshooting

| Issue | Fix |
|---|---|
| AI service OOM on `medium`/`large` | Increase VPS RAM or use smaller model |
| MinIO bucket not found | Check `MINIO_BUCKET` matches in both backend & ai-service env |
| Transcription stuck at "queued" | Check `ai-worker` logs: `docker compose logs ai-worker` |
| 401 errors after 15 min | Frontend should auto-refresh via `/api/auth/refresh` — check refresh token validity (7 days) |
| Diarization fails silently | Set `HF_TOKEN` and accept pyannote model terms on HuggingFace |
