-- Tracks last success/failure timestamps per cron job for /api/health monitoring
CREATE TABLE IF NOT EXISTS cron_health (
  job_name TEXT PRIMARY KEY,
  last_success INTEGER,
  last_failure INTEGER
);
