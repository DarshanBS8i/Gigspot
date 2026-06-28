-- ============================================================
-- GigSpot Database Schema
-- Part-time Job Locator & Hoster
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- Stores both providers and workers with role distinction
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    role            VARCHAR(20) NOT NULL CHECK (role IN ('provider', 'worker')),
    avatar_url      TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    email_verified  BOOLEAN DEFAULT FALSE,
    last_login      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Index for fast email lookups during auth
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- PROVIDER PROFILES
-- Extended info for job providers / employers
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_profiles (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name        VARCHAR(255),
    business_type       VARCHAR(100),
    description         TEXT,
    website             VARCHAR(255),
    address             TEXT,
    latitude            DECIMAL(10,8),
    longitude           DECIMAL(11,8),
    rating              DECIMAL(3,2) DEFAULT 0.00,
    total_reviews       INTEGER DEFAULT 0,
    total_jobs_posted   INTEGER DEFAULT 0,
    verified            BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- WORKER PROFILES
-- Extended info for job seekers / workers
-- ============================================================
CREATE TABLE IF NOT EXISTS worker_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    skills                  TEXT[],
    experience_years        INTEGER DEFAULT 0,
    hourly_rate_min         DECIMAL(10,2),
    hourly_rate_max         DECIMAL(10,2),
    availability_status     VARCHAR(20) DEFAULT 'available' 
                            CHECK (availability_status IN ('available', 'busy', 'offline')),
    latitude                DECIMAL(10,8),
    longitude               DECIMAL(11,8),
    bio                     TEXT,
    rating                  DECIMAL(3,2) DEFAULT 0.00,
    total_reviews           INTEGER DEFAULT 0,
    total_jobs_completed    INTEGER DEFAULT 0,
    preferred_radius_km     INTEGER DEFAULT 10,
    available_from          TIME,
    available_to            TIME,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_availability ON worker_profiles(availability_status);
CREATE INDEX IF NOT EXISTS idx_worker_location ON worker_profiles(latitude, longitude);

-- ============================================================
-- JOB CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE,
    icon    VARCHAR(50),
    color   VARCHAR(7) DEFAULT '#6C63FF'
);

-- ============================================================
-- JOBS TABLE
-- Core job listing table
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id              SERIAL PRIMARY KEY,
    provider_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    category_id     INTEGER REFERENCES categories(id),
    pay_rate        DECIMAL(10,2) NOT NULL,
    pay_type        VARCHAR(20) DEFAULT 'hourly' 
                    CHECK (pay_type IN ('hourly', 'fixed', 'daily')),
    currency        VARCHAR(5) DEFAULT 'INR',
    location_name   VARCHAR(255),
    latitude        DECIMAL(10,8) NOT NULL,
    longitude       DECIMAL(11,8) NOT NULL,
    start_date      DATE,
    end_date        DATE,
    start_time      TIME,
    end_time        TIME,
    slots           INTEGER DEFAULT 1,
    filled_slots    INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'open' 
                    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
    urgency         VARCHAR(20) DEFAULT 'normal' 
                    CHECK (urgency IN ('low', 'normal', 'urgent')),
    requirements    TEXT,
    perks           TEXT[],
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_provider ON jobs(provider_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);

-- ============================================================
-- APPLICATIONS TABLE
-- Workers apply to jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
    id          SERIAL PRIMARY KEY,
    job_id      INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status      VARCHAR(20) DEFAULT 'pending' 
                CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'completed')),
    message     TEXT,
    applied_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(job_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_worker ON applications(worker_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- ============================================================
-- REVIEWS TABLE
-- Mutual review system between providers and workers
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
    id              SERIAL PRIMARY KEY,
    reviewer_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    job_id          INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    rating          INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(reviewer_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);

-- ============================================================
-- NOTIFICATIONS TABLE
-- In-app notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255),
    message         TEXT,
    type            VARCHAR(50) DEFAULT 'info'
                    CHECK (type IN ('info', 'success', 'warning', 'application', 'review', 'job_update')),
    read            BOOLEAN DEFAULT FALSE,
    reference_id    INTEGER,
    reference_type  VARCHAR(50),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

-- ============================================================
-- SAVED JOBS (Bookmarks)
-- Workers can save/bookmark jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_jobs (
    id          SERIAL PRIMARY KEY,
    worker_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    job_id      INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    saved_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(worker_id, job_id)
);

-- ============================================================
-- MESSAGES TABLE
-- Direct messaging between providers and workers
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id              SERIAL PRIMARY KEY,
    sender_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    job_id          INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    content         TEXT NOT NULL,
    read            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id);

-- ============================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_profiles_updated_at BEFORE UPDATE ON provider_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_profiles_updated_at BEFORE UPDATE ON worker_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
