#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'node:path'
import { ensureFeature, exportState, insertCheckpoint, openStore } from './db.js'
import { inferFeature } from './infer.js'
import { renderExplain, renderResume } from './render.js'
import { nowIso } from './time.js'

const workspace = process.env.SCAR_WORKSPACE
const root = workspace ? path.resolve(workspace, '..') : process.cwd()

const server = new McpServer({
  name: 'scar',
  version: '0.1.0'
})

server.registerResource(
  'scar-context',
  'scar://context',
  {
    title: 'Scar Workspace Context',
    description: 'Current feature-centric project continuity state',
    mimeType: 'text/markdown'
  },
  async () => withStore((store) => ({
    contents: [{ uri: 'scar://context', mimeType: 'text/markdown', text: renderResume(store) }]
  }))
)

server.registerTool(
  'scar_workspace',
  {
    title: 'Scar workspace',
    description: 'Return full project state from this IDE perspective.',
    inputSchema: {}
  },
  async () => withStore((store) => {
    const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
    const active_workers = store.db.prepare('SELECT * FROM workers ORDER BY last_heartbeat DESC').all()
    const decisions = store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
    const recent_activity = store.db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20').all()
    return json({ features, active_workers, decisions, recent_activity, my_context: renderResume(store) })
  })
)

server.registerTool(
  'scar_current_work',
  {
    title: 'Scar current work',
    description: 'Infer likely feature from branch, recent files, and known features.',
    inputSchema: {}
  },
  async () => withStore((store) => json(inferFeature(store)))
)

server.registerTool(
  'scar_claim',
  {
    title: 'Scar claim',
    description: 'Claim a feature after suggestion is confirmed.',
    inputSchema: {
      feature: z.string(),
      ide: z.string().optional(),
      name: z.string().optional()
    }
  },
  async ({ feature, ide = process.env.SCAR_IDE || 'mcp', name = process.env.USERNAME || process.env.USER || 'developer' }) => withStore((store) => {
    const row = ensureFeature(store, feature)
    const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
    const now = nowIso()
    const existing = store.db.prepare('SELECT * FROM workers WHERE current_feature = ? AND id <> ?').all(row.id, workerId)
    store.db.prepare(`
      INSERT INTO workers (id, name, ide, last_heartbeat, current_feature)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = excluded.current_feature
    `).run(workerId, name, ide, now, row.id)
    store.db.prepare('INSERT INTO sessions (id, worker_id, ide, feature_id, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), workerId, ide, row.id, now)
    exportState(store)
    return json({ claimed: row.id, conflicts: existing })
  })
)

server.registerTool(
  'scar_remember',
  {
    title: 'Scar remember',
    description: 'Store a decision, optionally scoped to a feature.',
    inputSchema: {
      key: z.string(),
      value: z.string(),
      feature: z.string().optional()
    }
  },
  async ({ key, value, feature }) => withStore((store) => {
    const target = feature ? ensureFeature(store, feature) : null
    store.db.prepare('INSERT INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), target?.id || null, key, value, process.env.USERNAME || process.env.USER || 'developer', nowIso())
    exportState(store)
    return json({ remembered: key, feature_id: target?.id || null })
  })
)

server.registerTool(
  'scar_recall',
  {
    title: 'Scar recall',
    description: 'Retrieve decisions.',
    inputSchema: {
      key: z.string().optional(),
      feature: z.string().optional()
    }
  },
  async ({ key, feature } = {}) => withStore((store) => {
    const rows = key
      ? store.db.prepare('SELECT * FROM decisions WHERE key = ? ORDER BY created_at DESC').all(key)
      : feature
        ? store.db.prepare('SELECT * FROM decisions WHERE feature_id = ? ORDER BY created_at DESC').all(feature)
        : store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
    return json(rows)
  })
)

server.registerTool(
  'scar_checkpoint',
  {
    title: 'Scar checkpoint',
    description: 'Save a progress snapshot under a feature_id.',
    inputSchema: {
      feature: z.string(),
      summary: z.string(),
      progress: z.number().optional(),
      files_touched: z.array(z.string()).optional(),
      blockers: z.array(z.string()).optional(),
      next_steps: z.array(z.string()).optional(),
      source: z.enum(['manual', 'file_watch', 'git_hook']).optional()
    }
  },
  async ({ feature, summary, progress = 0, files_touched = [], blockers = [], next_steps = [], source = 'manual' }) => withStore((store) => {
    insertCheckpoint(store, { feature, summary, progress, files: files_touched, blockers, nextSteps: next_steps, source })
    return json({ saved: true, feature_id: feature })
  })
)

server.registerTool(
  'scar_handoff',
  {
    title: 'Scar handoff',
    description: 'Return a structured feature brief for resuming work.',
    inputSchema: { feature: z.string() }
  },
  async ({ feature }) => withStore((store) => json({ feature, brief: renderExplain(store, feature) }))
)

server.registerTool(
  'scar_done',
  {
    title: 'Scar done',
    description: 'Mark a feature complete.',
    inputSchema: {
      feature: z.string(),
      summary: z.string()
    }
  },
  async ({ feature, summary }) => withStore((store) => {
    const row = ensureFeature(store, feature)
    store.db.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?').run('done', nowIso(), row.id)
    insertCheckpoint(store, { feature: row.id, summary, progress: 100, source: 'manual' })
    return json({ done: row.id })
  })
)

server.registerTool(
  'scar_heartbeat',
  {
    title: 'Scar heartbeat',
    description: 'Update heartbeat for a cooperating IDE.',
    inputSchema: {
      ide: z.string().optional(),
      name: z.string().optional(),
      feature: z.string().optional()
    }
  },
  async ({ ide = process.env.SCAR_IDE || 'mcp', name = process.env.USERNAME || process.env.USER || 'developer', feature } = {}) => withStore((store) => {
    const target = feature ? ensureFeature(store, feature) : null
    const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
    store.db.prepare(`
      INSERT INTO workers (id, name, ide, last_heartbeat, current_feature)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = COALESCE(excluded.current_feature, workers.current_feature)
    `).run(workerId, name, ide, nowIso(), target?.id || null)
    exportState(store)
    return json({ heartbeat: true, worker_id: workerId })
  })
)

function withStore(fn) {
  const store = openStore(root)
  try {
    return fn(store)
  } finally {
    store.db.close()
  }
}

function json(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

const transport = new StdioServerTransport()
await server.connect(transport)
