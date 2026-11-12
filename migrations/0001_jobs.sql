CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'dead')),
  created_at INTEGER NOT NULL,
  available_at INTEGER NOT NULL,
  lease_token TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  finished_at INTEGER
);
CREATE INDEX jobs_ready ON jobs(state, available_at, created_at);
CREATE TABLE completions (id TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);
CREATE INDEX completions_age ON completions(completed_at);
