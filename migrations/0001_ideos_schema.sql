CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ide TEXT NOT NULL,
  last_heartbeat TEXT,
  last_file_activity TEXT,
  last_git_activity TEXT,
  current_feature TEXT REFERENCES features(id)
);

CREATE TABLE IF NOT EXISTS task_workers (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (task_id, worker_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  worker_id TEXT REFERENCES workers(id),
  ide TEXT NOT NULL,
  feature_id TEXT REFERENCES features(id),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  worker_id TEXT REFERENCES workers(id),
  summary TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  files_touched TEXT,
  blockers TEXT,
  next_steps TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  feature_id TEXT REFERENCES features(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inferences (
  id TEXT PRIMARY KEY,
  worker_id TEXT REFERENCES workers(id),
  likely_feature TEXT REFERENCES features(id),
  confidence REAL NOT NULL DEFAULT 0,
  signals TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  worker_id TEXT REFERENCES workers(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
