-- AutoCaption AI – PostgreSQL Schema
-- Run once on fresh database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    password    VARCHAR(255) NOT NULL,
    role        VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    avatar_url  TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Refresh Tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(512) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    thumbnail_url   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ── Videos ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- File info
    original_name   VARCHAR(500) NOT NULL,
    file_key        TEXT NOT NULL,           -- MinIO object key
    file_size       BIGINT NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    duration        FLOAT,                   -- seconds
    width           INTEGER,
    height          INTEGER,
    
    -- Processing
    status          VARCHAR(50) DEFAULT 'uploaded' CHECK (
                        status IN ('uploaded', 'queued', 'processing',
                                   'completed', 'failed', 'cancelled')
                    ),
    job_id          VARCHAR(255),            -- AI service job ID
    progress        INTEGER DEFAULT 0,
    error_message   TEXT,
    
    -- AI results
    detected_language   VARCHAR(10),
    language_confidence FLOAT,
    
    -- Subtitle keys in MinIO
    subtitle_srt_key    TEXT,
    subtitle_vtt_key    TEXT,
    subtitle_txt_key    TEXT,
    subtitle_json_key   TEXT,
    
    -- Processing options used
    model_size          VARCHAR(20) DEFAULT 'base',
    enable_diarization  BOOLEAN DEFAULT FALSE,
    
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_job_id ON videos(job_id);

-- ── Subtitles (editable segments) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtitle_segments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    
    segment_index   INTEGER NOT NULL,
    start_time      FLOAT NOT NULL,   -- seconds
    end_time        FLOAT NOT NULL,   -- seconds
    text            TEXT NOT NULL,
    speaker         VARCHAR(100),
    words           JSONB,            -- word-level timestamps
    
    -- Translation
    translated_text         TEXT,
    translation_language    VARCHAR(10),
    
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(video_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_segments_video ON subtitle_segments(video_id);
CREATE INDEX IF NOT EXISTS idx_segments_text_search ON subtitle_segments USING gin(to_tsvector('english', text));

-- ── Subtitle Exports ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtitle_exports (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    format      VARCHAR(10) NOT NULL CHECK (format IN ('srt', 'vtt', 'txt', 'json')),
    file_key    TEXT NOT NULL,
    
    -- Burn-in options
    is_burned_in    BOOLEAN DEFAULT FALSE,
    burn_options    JSONB,
    
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exports_video ON subtitle_exports(video_id);

-- ── Analytics ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processing_stats (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id        UUID REFERENCES videos(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    
    video_duration  FLOAT,
    processing_time FLOAT,
    model_size      VARCHAR(20),
    language        VARCHAR(10),
    segment_count   INTEGER,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Triggers: auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER videos_updated_at
    BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER segments_updated_at
    BEFORE UPDATE ON subtitle_segments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
