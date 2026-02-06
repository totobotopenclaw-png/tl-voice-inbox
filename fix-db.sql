-- Fix missing columns in jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_letter_at TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jobs_cancelled_at ON jobs(cancelled_at) WHERE cancelled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_dead_letter_at ON jobs(dead_letter_at) WHERE dead_letter_at IS NOT NULL;
