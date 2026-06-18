#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { installAdapters, writeAgents } from './adapters.js'
import { ensureFeature, exportState, insertCheckpoint, openStore } from './db.js'
import { inferFeature } from './infer.js'
import { asJson } from './json.js'
import { projectRoot, scarDir } from './paths.js'
import { renderDashboard, renderExplain, renderResume, renderTimeline } from './render.js'
import { lastCommitSummary, recentFiles } from './git.js'
import { nowIso } from './time.js'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const root = projectRoot()

try {
  switch (command) {
    case 'init':
      init()
      break
    case 'resume':
      withStore((store) => console.log(renderResume(store)))
      break
    case 'explain':
      requireArg(args[1], 'Usage: scar explain <feature>')
      withStore((store) => console.log(renderExplain(store, args[1])))
      break
    case 'timeline':
      requireArg(args[1], 'Usage: scar timeline <feature>')
      withStore((store) => console.log(renderTimeline(store, args[1])))
      break
    case 'start':
      withStore((store) => console.log(renderDashboard(store)))
      break
    case 'checkpoint':
      checkpoint()
      break
    case 'claim':
      claim()
      break
    case 'remember':
      remember()
      break
    case 'recall':
      recall()
      break
    case 'current-work':
      withStore((store) => console.log(JSON.stringify(inferFeature(store), null, 2)))
      break
    case 'done':
      done()
      break
    case 'seed-demo':
      seedDemo()
      break
    case 'doctor':
      doctor()
      break
    case 'help':
    default:
      help()
      break
  }
} catch (error) {
  console.error(`scar: ${error.message}`)
  process.exitCode = 1
}

function withStore(fn) {
  const store = openStore(root)
  try {
    return fn(store)
  } finally {
    store.db.close()
  }
}

function init() {
  const store = openStore(root)
  try {
    writeGitignore()
    writeAgents(root)
    installGitHook()
    exportState(store)
    const results = installAdapters(root, { all: hasFlag('--all') || hasFlag('--yes') })
    console.log('')
    console.log('  ┌──────────────────────────────────────────┐')
    console.log('  │  Scar — Development continuity.          │')
    console.log('  └──────────────────────────────────────────┘')
    console.log('')
    console.log('  State: Local · .scar/db.sqlite')
    console.log('')
    for (const result of results) {
      const status = result.verified ? '✓ installed · verified' : result.installed ? '○ installed · verify failed' : '○ not found'
      console.log(`  ${status.padEnd(24)} ${result.name}`)
    }
    console.log('  ✓ Git hooks installed')
    console.log('  ✓ Context files written')
    console.log('')
    console.log('  scar resume     → continue where you left off')
    console.log('  scar start      → open dashboard')
    console.log('  scar explain    → understand current project state')
  } finally {
    store.db.close()
  }
}

function checkpoint() {
  let inferred = null
  if (!args[1] && !flagValue('--feature')) {
    const store = openStore(root)
    try {
      inferred = inferFeature(store).likely_feature
    } finally {
      store.db.close()
    }
  }
  const feature = args[1] || flagValue('--feature') || inferred
  requireArg(feature, 'Usage: scar checkpoint <feature> --summary "..."')
  withStore((store) => {
    const summary = flagValue('--summary') || (hasFlag('--auto') ? lastCommitSummary() : 'Progress checkpoint')
    const progress = flagValue('--progress') || 0
    const files = splitList(flagValue('--files')) || recentFiles()
    const blockers = splitList(flagValue('--blockers')) || []
    const nextSteps = splitList(flagValue('--next')) || []
    const source = flagValue('--source') || (hasFlag('--auto') ? 'git_hook' : 'manual')
    insertCheckpoint(store, { feature, summary, progress, files, blockers, nextSteps, source })
    console.log(`Checkpoint saved for ${feature}.`)
  })
}

function claim() {
  const featureName = args[1]
  requireArg(featureName, 'Usage: scar claim <feature> [--ide cursor] [--name Abhishek]')
  withStore((store) => {
    const feature = ensureFeature(store, featureName)
    const ide = flagValue('--ide') || process.env.SCAR_IDE || 'cli'
    const name = flagValue('--name') || process.env.USERNAME || process.env.USER || 'developer'
    const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
    const now = nowIso()
    store.db.prepare(`
      INSERT INTO workers (id, name, ide, last_heartbeat, current_feature)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = excluded.current_feature
    `).run(workerId, name, ide, now, feature.id)
    store.db.prepare('INSERT INTO sessions (id, worker_id, ide, feature_id, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), workerId, ide, feature.id, now)
    exportState(store)
    console.log(`${ide} claimed ${feature.name}.`)
  })
}

function remember() {
  const key = args[1]
  const value = args[2]
  requireArg(key && value, 'Usage: scar remember <key> <value> [--feature authentication]')
  withStore((store) => {
    const feature = flagValue('--feature')
    const featureRow = feature ? ensureFeature(store, feature) : null
    store.db.prepare('INSERT INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), featureRow?.id || null, key, value, process.env.USERNAME || process.env.USER || 'developer', nowIso())
    exportState(store)
    console.log(`Remembered ${key}.`)
  })
}

function recall() {
  withStore((store) => {
    const key = args[1]
    const feature = flagValue('--feature')
    const rows = key
      ? store.db.prepare('SELECT * FROM decisions WHERE key = ? ORDER BY created_at DESC').all(key)
      : feature
        ? store.db.prepare('SELECT * FROM decisions WHERE feature_id = ? ORDER BY created_at DESC').all(feature)
        : store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
    console.log(JSON.stringify(rows, null, 2))
  })
}

function done() {
  const featureName = args[1]
  requireArg(featureName, 'Usage: scar done <feature> --summary "..."')
  withStore((store) => {
    const feature = ensureFeature(store, featureName)
    const summary = flagValue('--summary') || 'Feature complete'
    const now = nowIso()
    store.db.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?').run('done', now, feature.id)
    insertCheckpoint(store, { feature: feature.id, summary, progress: 100, source: 'manual' })
    console.log(`${feature.name} marked done.`)
  })
}

function seedDemo() {
  withStore((store) => {
    insertCheckpoint(store, {
      feature: 'authentication',
      summary: 'JWT signing, auth middleware, login endpoint',
      progress: 60,
      files: ['auth/jwt.ts', 'middleware/auth.ts', 'types/auth.ts'],
      blockers: ['Refresh token rotation not started'],
      nextSteps: ['Refresh token rotation', 'Auth tests'],
      source: 'manual'
    })
    store.db.prepare('INSERT OR IGNORE INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), 'authentication', 'auth-strategy', 'JWT, RS256, stateless', 'demo', nowIso())
    exportState(store)
    console.log('Demo Scar state seeded.')
  })
}

function doctor() {
  withStore((store) => {
    const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
    console.log('Scar doctor')
    console.log(`Workspace: ${root}`)
    console.log(`State: ${path.join(scarDir(root), 'db.sqlite')}`)
    console.log(`Tables: ${tables.join(', ')}`)
    console.log(`Feature-centric schema: ${tables.includes('features') && tables.includes('checkpoints') ? 'ok' : 'missing'}`)
  })
}

function writeGitignore() {
  const file = path.join(root, '.gitignore')
  const line = '.scar/db.sqlite'
  const wal = '.scar/db.sqlite-*'
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const additions = [line, wal].filter((item) => !existing.split(/\r?\n/).includes(item))
  if (additions.length) fs.appendFileSync(file, `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}${additions.join('\n')}\n`)
}

function installGitHook() {
  const hooks = path.join(root, '.git', 'hooks')
  if (!fs.existsSync(hooks)) return
  const hook = path.join(hooks, 'post-commit')
  const snippet = '\n# Scar checkpoint\ncommand -v scar >/dev/null 2>&1 && scar checkpoint --auto --source git_hook >/dev/null 2>&1 || true\n'
  const existing = fs.existsSync(hook) ? fs.readFileSync(hook, 'utf8') : '#!/bin/sh\n'
  if (!existing.includes('Scar checkpoint')) fs.writeFileSync(hook, existing + snippet)
  try {
    fs.chmodSync(hook, 0o755)
  } catch {}
}

function help() {
  console.log([
    'Scar — Development continuity.',
    '',
    'Commands:',
    '  scar init [--yes]                         Initialize .scar, adapters, hooks, context',
    '  scar resume                               Continue where you left off',
    '  scar start                                Show parallel-mode dashboard',
    '  scar explain <feature>                    Explain feature state',
    '  scar timeline <feature>                   Show feature timeline',
    '  scar checkpoint <feature> --summary "..." Save progress under a feature_id',
    '  scar claim <feature>                      Claim a feature for this worker',
    '  scar remember <key> <value>               Store a project or feature decision',
    '  scar recall [key]                         Retrieve decisions',
    '  scar current-work                         Infer likely feature from branch/files',
    '  scar done <feature> --summary "..."       Mark a feature complete',
    '  scar doctor                               Validate local Scar state'
  ].join('\n'))
}

function requireArg(value, message) {
  if (!value) throw new Error(message)
}

function hasFlag(name) {
  return args.includes(name)
}

function flagValue(name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  return args[index + 1] || null
}

function splitList(value) {
  if (!value) return null
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}
