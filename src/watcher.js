import path from 'node:path'
import chokidar from 'chokidar'
import { cloudCall, useCloudBackend } from './cloud-client.js'
import { ensureFeature, exportState, insertCheckpoint, openStore } from './db.js'
import { inferFeature } from './infer.js'
import { rel } from './paths.js'
import { nowIso } from './time.js'

export function startFileWatcher(root, { ide = process.env.SCAR_IDE || 'mcp', name = process.env.USERNAME || process.env.USER || 'developer' } = {}) {
  if (process.env.SCAR_WATCH === '0') return null
  debug(`watching ${root}`)
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
  const touched = new Set()
  let timer = null
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: [
      /(^|[/\\])\.git([/\\]|$)/,
      /(^|[/\\])node_modules([/\\]|$)/,
      /(^|[/\\])\.scar([/\\]|$)/,
      /(^|[/\\])\.wrangler([/\\]|$)/
    ],
    awaitWriteFinish: { stabilityThreshold: 700, pollInterval: 100 }
  })

  const onSave = (file) => {
    debug(`save ${file}`)
    touched.add(rel(root, path.resolve(file)))
    recordFileActivity(root, workerId, ide, name)
    clearTimeout(timer)
    timer = setTimeout(() => checkpointFileActivity(root, workerId, touched), 30_000)
  }

  watcher.on('add', onSave)
  watcher.on('change', onSave)
  watcher.on('ready', () => debug('ready'))
  watcher.on('error', (error) => debug(`error ${error.message}`))
  return watcher
}

function recordFileActivity(root, workerId, ide, name) {
  if (useCloudBackend()) {
    cloudCall('/tool/file-activity', { method: 'POST', body: { ide, name } }).catch(() => {})
    return
  }
  const store = openStore(root)
  try {
    store.db.prepare(`
      INSERT INTO workers (id, name, ide, last_file_activity)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_file_activity = excluded.last_file_activity
    `).run(workerId, name, ide, nowIso())
    exportState(store)
  } finally {
    store.db.close()
  }
}

function checkpointFileActivity(root, workerId, touched) {
  if (touched.size === 0) return
  const files = [...touched].slice(0, 30)
  debug(`checkpoint ${files.join(', ')}`)
  touched.clear()
  if (useCloudBackend()) {
    cloudCall('/tool/current-work', { method: 'POST', body: { files } })
      .then((inferred) => cloudCall('/tool/checkpoint', {
        method: 'POST',
        body: {
          feature: inferred.likely_feature || 'unclassified-work',
          worker_id: workerId,
          summary: `File-save snapshot after ${files.length} saved file${files.length === 1 ? '' : 's'}`,
          progress: 0,
          files_touched: files,
          blockers: [],
          next_steps: ['Review saved changes and create a richer checkpoint if needed'],
          source: 'file_watch'
        }
      }))
      .catch(() => {})
    return
  }
  const store = openStore(root)
  try {
    const inferred = inferFeature(store)
    const featureId = inferred.likely_feature || 'unclassified-work'
    ensureFeature(store, featureId, 'Automatically captured file-save activity that has not been assigned to a named feature yet.')
    insertCheckpoint(store, {
      feature: featureId,
      workerId,
      summary: `File-save snapshot after ${files.length} saved file${files.length === 1 ? '' : 's'}`,
      progress: 0,
      files,
      blockers: [],
      nextSteps: ['Review saved changes and create a richer checkpoint if needed'],
      source: 'file_watch'
    })
  } finally {
    store.db.close()
  }
}

function debug(message) {
  if (process.env.SCAR_WATCH_DEBUG === '1') console.error(`[scar-watch] ${message}`)
}
