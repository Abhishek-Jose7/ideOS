import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { asJson, fromJson, readJson, writeJson } from './json.js'
import { dbPath, ensureDir, exportsDir, ideosDir } from './paths.js'
import { nowIso } from './time.js'

const exportTables = ['features', 'decisions', 'checkpoints', 'sessions']
const exportOrder = {
  features: 'created_at',
  decisions: 'created_at',
  checkpoints: 'created_at',
  sessions: 'started_at'
}

export function openStore(root = process.cwd()) {
  ensureDir(ideosDir(root))
  ensureDir(exportsDir(root))
  const db = new Database(dbPath(root))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  hydrateFromExports(db, root)
  return { db, root }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','done','blocked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','blocked')),
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
      role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','supporting')),
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
      source TEXT NOT NULL CHECK (source IN ('manual','file_watch','git_hook')),
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
  `)
}

function hydrateFromExports(db, root) {
  const dir = exportsDir(root)
  if (!fs.existsSync(dir)) return
  for (const table of exportTables) {
    const exported = readJson(path.join(dir, `${table}.json`), [])
    const rows = Array.isArray(exported) ? exported : (exported?.data || [])
    if (!Array.isArray(rows) || rows.length === 0) continue
    for (const row of rows) upsertExportRow(db, table, row)
  }
}

function upsertExportRow(db, table, row) {
  const keys = Object.keys(row)
  if (!keys.includes('id')) return
  const columns = keys.join(', ')
  const placeholders = keys.map((key) => `@${key}`).join(', ')
  const updates = keys.filter((key) => key !== 'id').map((key) => `${key} = excluded.${key}`).join(', ')
  db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`).run(row)
}

export function exportState(store) {
  const { db, root } = store
  ensureDir(exportsDir(root))
  for (const table of exportTables) {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${exportOrder[table]} ASC`).all()
    writeJson(path.join(exportsDir(root), `${table}.json`), {
      version: '1.0',
      data: rows
    })
  }
  writeContext(store)
}

export function writeContext(store) {
  const { db, root } = store
  const features = db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
  const decisions = db.prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT 20').all()
  const checkpoints = db.prepare('SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 20').all()
  const lines = [
    '# ideOS Context',
    '',
    'This file is regenerated by ideOS on state changes. It is a passive fallback for IDEs or agents that do not load MCP resources.',
    '',
    '## Features',
    ''
  ]
  for (const feature of features) {
    const latest = checkpoints.find((checkpoint) => checkpoint.feature_id === feature.id)
    lines.push(`- ${feature.name} (${feature.id}) - ${feature.status}${latest ? ` - ${latest.progress}% - ${latest.summary}` : ''}`)
  }
  lines.push('', '## Decisions', '')
  for (const decision of decisions) {
    lines.push(`- ${decision.key}: ${decision.value}${decision.feature_id ? ` [${decision.feature_id}]` : ''}`)
  }
  lines.push('', '## Recent Checkpoints', '')
  for (const checkpoint of checkpoints) {
    lines.push(`- ${checkpoint.created_at} - ${checkpoint.feature_id} - ${checkpoint.summary}`)
  }
  fs.writeFileSync(path.join(ideosDir(root), 'context.md'), `${lines.join('\n')}\n`)
}

export function idFromName(name) {
  return String(name || 'feature')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `feature-${Date.now()}`
}

export function ensureFeature(store, nameOrId, description = '') {
  const id = idFromName(nameOrId)
  const existing = store.db.prepare('SELECT * FROM features WHERE id = ? OR lower(name) = lower(?)').get(id, nameOrId)
  if (existing) return existing
  const now = nowIso()
  store.db.prepare(`
    INSERT INTO features (id, name, description, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(id, titleFromId(nameOrId), description, now, now)
  const feature = store.db.prepare('SELECT * FROM features WHERE id = ?').get(id)
  logActivity(store, null, 'feature_created', `${feature.name} (${feature.id})`)
  exportState(store)
  return feature
}

export function resetFeature(store, nameOrId) {
  const id = idFromName(nameOrId)
  const feature = store.db.prepare('SELECT * FROM features WHERE id = ? OR lower(name) = lower(?)').get(id, nameOrId)
  if (!feature) return null

  store.db.transaction(() => {
    store.db.prepare('DELETE FROM sessions WHERE feature_id = ?').run(feature.id)
    store.db.prepare('DELETE FROM checkpoints WHERE feature_id = ?').run(feature.id)
    store.db.prepare('DELETE FROM decisions WHERE feature_id = ?').run(feature.id)
    store.db.prepare('DELETE FROM features WHERE id = ?').run(feature.id)
  })()

  exportState(store)
  return feature
}

export function titleFromId(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function logActivity(store, workerId, action, detail = '') {
  store.db.prepare('INSERT INTO activity_log (id, worker_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), workerId, action, detail, nowIso())
}

export function serializeCheckpoint(row) {
  if (!row) return row
  return {
    ...row,
    files_touched: fromJson(row.files_touched, []),
    blockers: fromJson(row.blockers, []),
    next_steps: fromJson(row.next_steps, [])
  }
}

export function insertCheckpoint(store, { feature, workerId = null, summary, progress = 0, files = [], blockers = [], nextSteps = [], source = 'manual' }) {
  const target = ensureFeature(store, feature)
  const now = nowIso()
  store.db.prepare(`
    INSERT INTO checkpoints (id, feature_id, worker_id, summary, progress, files_touched, blockers, next_steps, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), target.id, workerId, summary, Number(progress) || 0, asJson(files), asJson(blockers), asJson(nextSteps), source, now)
  store.db.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?').run('active', now, target.id)
  logActivity(store, workerId, 'checkpoint', `${target.id}: ${summary}`)
  exportState(store)
}

export function recordGitActivity(store, { workerId = 'git:post-commit', ide = 'git', name = 'git hook', feature = null } = {}) {
  const now = nowIso()
  store.db.prepare(`
    INSERT INTO workers (id, name, ide, last_git_activity, current_feature)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_git_activity = excluded.last_git_activity, current_feature = COALESCE(excluded.current_feature, workers.current_feature)
  `).run(workerId, name, ide, now, feature)
  logActivity(store, workerId, 'git_activity', feature || 'post-commit')
  exportState(store)
}
