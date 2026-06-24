#!/usr/bin/env node
import 'dotenv/config'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'node:path'
import { cloudCall, useCloudBackend } from './cloud-client.js'
import { ensureFeature, exportState, insertCheckpoint, openStore } from './db.js'
import { currentBranch, recentFiles } from './git.js'
import { inferFeatureSmart } from './infer.js'
import { normalizeDecision, checkFeatureOverlap } from './groq.js'
import { renderExplain, renderHandoff, renderResume, findFeature, featureSummary } from './render.js'
import { startFileWatcher } from './watcher.js'
import { nowIso } from './time.js'

const workspace = process.env.IDEOS_WORKSPACE
const root = workspace ? path.resolve(workspace, '..') : process.cwd()

const server = new McpServer({
  name: 'ideos',
  version: '0.1.0'
})

startFileWatcher(root)

server.registerResource(
  'ideos-context',
  'ideos://context',
  {
    title: 'ideOS Workspace Context',
    description: 'Current feature-centric project continuity state',
    mimeType: 'text/markdown'
  },
  async () => {
    let text
    if (useCloudBackend()) {
      const stateData = await cloudCall('/state')
      text = renderResume(stateData)
    } else {
      text = await withStore((store) => renderResume(store))
    }
    return {
      contents: [{ uri: 'ideos://context', mimeType: 'text/markdown', text }]
    }
  }
)

server.registerResource(
  'ideos-decisions',
  'ideos://decisions',
  {
    title: 'ideOS Workspace Decisions',
    description: 'Engineering decisions recorded in this project',
    mimeType: 'application/json'
  },
  async () => {
    let decisions
    if (useCloudBackend()) {
      const stateData = await cloudCall('/state')
      decisions = stateData.decisions
    } else {
      decisions = await withStore((store) => store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all())
    }
    return {
      contents: [{ uri: 'ideos://decisions', mimeType: 'application/json', text: JSON.stringify(decisions, null, 2) }]
    }
  }
)

server.registerResource(
  'ideos-feature-detail',
  new ResourceTemplate('ideos://feature/{id}', {
    list: async () => {
      let features
      if (useCloudBackend()) {
        const stateData = await cloudCall('/state')
        features = stateData.features
      } else {
        features = await withStore((store) => store.db.prepare('SELECT * FROM features').all())
      }
      return {
        resources: features.map((feature) => ({
          uri: `ideos://feature/${feature.id}`,
          name: feature.name,
          mimeType: 'text/markdown'
        }))
      }
    }
  }),
  {
    title: 'ideOS Feature Detail',
    description: 'Detailed explanation of a specific feature'
  },
  async (uri, variables) => {
    const id = variables.id
    let text
    if (useCloudBackend()) {
      const stateData = await cloudCall('/state')
      text = renderExplain(stateData, id)
    } else {
      text = await withStore((store) => renderExplain(store, id))
    }
    return {
      contents: [{ uri: uri.toString(), mimeType: 'text/markdown', text }]
    }
  }
)

server.registerPrompt(
  'ideos-resume',
  {
    title: 'ideOS Resume Prompt',
    description: 'Get the latest ideOS feature context to resume development'
  },
  async () => {
    let text
    if (useCloudBackend()) {
      const stateData = await cloudCall('/state')
      text = renderResume(stateData)
    } else {
      text = await withStore((store) => renderResume(store))
    }
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Here is the current ideOS project context to resume work:\n\n${text}`
        }
      }]
    }
  }
)

server.registerTool(
  'ideos_workspace',
  {
    title: 'ideOS workspace',
    description: 'Return full project state from this IDE perspective.',
    inputSchema: {}
  },
  async () => withStore((store) => {
    if (useCloudBackend()) return cloudCall('/state').then(json)
    const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
    const active_workers = store.db.prepare('SELECT * FROM workers ORDER BY last_heartbeat DESC').all()
    const decisions = store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
    const recent_activity = store.db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20').all()
    return json({ features, active_workers, decisions, recent_activity, my_context: renderResume(store) })
  })
)

server.registerTool(
  'ideos_current_work',
  {
    title: 'ideOS current work',
    description: 'Infer likely feature from branch, recent files, and known features.',
    inputSchema: {}
  },
  async () => {
    if (useCloudBackend()) return json(await cloudCall('/tool/current-work', { method: 'POST', body: { branch: currentBranch(), files: recentFiles() } }))
    return withStore((store) => inferFeatureSmart(store).then(json))
  }
)

server.registerTool(
  'ideos_claim',
  {
    title: 'ideOS claim',
    description: 'Claim a feature after suggestion is confirmed.',
    inputSchema: {
      feature: z.string(),
      ide: z.string().optional(),
      name: z.string().optional()
    }
  },
  async ({ feature, ide = process.env.IDEOS_IDE || 'mcp', name = process.env.USERNAME || process.env.USER || 'developer' }) => {
    if (useCloudBackend()) return cloudCall('/tool/claim', { method: 'POST', body: { feature, ide, name } }).then(json)
    return withStore(async (store) => {
      const row = ensureFeature(store, feature)
      const features = store.db.prepare('SELECT * FROM features WHERE id <> ?').all(row.id)
      const overlap = await checkFeatureOverlap({ newFeature: row.id, features })
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
      return json({ claimed: row.id, conflicts: existing, overlap })
    })
  }
)

server.registerTool(
  'ideos_remember',
  {
    title: 'ideOS remember',
    description: 'Store a decision, optionally scoped to a feature.',
    inputSchema: {
      key: z.string().optional(),
      value: z.string().optional(),
      feature: z.string().optional(),
      prompt: z.string().optional()
    }
  },
  async ({ key, value, feature, prompt }) => {
    if (useCloudBackend()) return json(await cloudCall('/tool/remember', { method: 'POST', body: { key, value, feature, prompt } }))
    return withStore(async (store) => {
    const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
    const normalized = await normalizeDecision({ prompt, key, value, feature, features })
    const finalKey = normalized?.key || key
    const finalValue = normalized?.value || value
    if (!finalKey || !finalValue) return json({ error: 'ideos_remember needs key/value or a prompt that Groq can normalize.' })
    const targetFeature = normalized?.feature || feature
    const target = targetFeature ? ensureFeature(store, targetFeature) : null
    store.db.prepare('INSERT INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), target?.id || null, finalKey, finalValue, process.env.USERNAME || process.env.USER || 'developer', nowIso())
    exportState(store)
    return json({ remembered: finalKey, value: finalValue, feature_id: target?.id || null })
    })
  }
)

server.registerTool(
  'ideos_recall',
  {
    title: 'ideOS recall',
    description: 'Retrieve decisions.',
    inputSchema: {
      key: z.string().optional(),
      feature: z.string().optional()
    }
  },
  async ({ key, feature } = {}) => {
    if (useCloudBackend()) return json(await cloudCall('/state'))
    return withStore((store) => {
    const rows = key
      ? store.db.prepare('SELECT * FROM decisions WHERE key = ? ORDER BY created_at DESC').all(key)
      : feature
        ? store.db.prepare('SELECT * FROM decisions WHERE feature_id = ? ORDER BY created_at DESC').all(feature)
        : store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
    return json(rows)
    })
  }
)

server.registerTool(
  'ideos_checkpoint',
  {
    title: 'ideOS checkpoint',
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
  async ({ feature, summary, progress = 0, files_touched = [], blockers = [], next_steps = [], source = 'manual' }) => {
    if (useCloudBackend()) return json(await cloudCall('/tool/checkpoint', { method: 'POST', body: { feature, summary, progress, files_touched, blockers, next_steps, source } }))
    return withStore((store) => {
    insertCheckpoint(store, { feature, summary, progress, files: files_touched, blockers, nextSteps: next_steps, source })
    return json({ saved: true, feature_id: feature })
    })
  }
)

server.registerTool(
  'ideos_handoff',
  {
    title: 'ideOS handoff',
    description: 'Return a structured feature brief for resuming work.',
    inputSchema: { feature: z.string() }
  },
  async ({ feature }) => {
    if (useCloudBackend()) return json(await cloudCall('/tool/handoff', { method: 'POST', body: { feature } }))
    return withStore((store) => renderHandoff(store, feature).then((brief) => json({ feature, brief })))
  }
)

server.registerTool(
  'ideos_done',
  {
    title: 'ideOS done',
    description: 'Mark a feature complete.',
    inputSchema: {
      feature: z.string(),
      summary: z.string()
    }
  },
  async ({ feature, summary }) => {
    if (useCloudBackend()) return json(await cloudCall('/tool/done', { method: 'POST', body: { feature, summary } }))
    return withStore((store) => {
    const row = ensureFeature(store, feature)
    store.db.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?').run('done', nowIso(), row.id)
    insertCheckpoint(store, { feature: row.id, summary, progress: 100, source: 'manual' })
    return json({ done: row.id })
    })
  }
)

server.registerTool(
  'ideos_heartbeat',
  {
    title: 'ideOS heartbeat',
    description: 'Update heartbeat for a cooperating IDE.',
    inputSchema: {
      ide: z.string().optional(),
      name: z.string().optional(),
      feature: z.string().optional()
    }
  },
  async ({ ide = process.env.IDEOS_IDE || 'mcp', name = process.env.USERNAME || process.env.USER || 'developer', feature } = {}) => {
    if (useCloudBackend()) return json(await cloudCall('/tool/heartbeat', { method: 'POST', body: { ide, name, feature } }))
    return withStore((store) => {
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
  }
)

server.registerTool(
  'ideos_explain',
  {
    title: 'ideOS explain',
    description: 'Explain detailed status, active workers, checkpoints, and decisions for a feature.',
    inputSchema: {
      feature: z.string()
    }
  },
  async ({ feature }) => {
    if (useCloudBackend()) return json(await cloudCall('/tool/explain', { method: 'POST', body: { feature } }))
    return withStore((store) => {
      const feat = findFeature(store, feature)
      if (!feat) return json({ error: `Feature not found: ${feature}` })
      const summary = featureSummary(store, feat)
      const workers = store.db.prepare('SELECT * FROM workers WHERE current_feature = ? ORDER BY last_heartbeat DESC').all(feat.id)
      return json({
        feature: feat,
        workers,
        checkpoints: summary.checkpoints,
        decisions: summary.decisions,
        sessions: summary.sessions
      })
    })
  }
)

async function withStore(fn) {
  const store = openStore(root)
  try {
    return await fn(store)
  } finally {
    store.db.close()
  }
}

function json(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

const transport = new StdioServerTransport()
await server.connect(transport)
