#!/usr/bin/env node
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { adapterInventory, adapters, writeAgents } from './adapters.js'
import { cloudCall, useCloudBackend } from './cloud-client.js'
import { ensureFeature, exportState, insertCheckpoint, openStore, recordGitActivity } from './db.js'
import { inferFeature, inferFeatureSmart } from './infer.js'
import { normalizeDecision } from './groq.js'
import { projectRoot, scarDir } from './paths.js'
import { renderDashboard, renderExplain, renderHandoff, renderResume, renderTimeline } from './render.js'
import { lastCommitSummary, recentFiles } from './git.js'
import { nowIso } from './time.js'
import { promptInit } from './init-prompt.js'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const root = projectRoot()

try {
  await main()
} catch (error) {
  console.error(`scar: ${error.message}`)
  process.exitCode = 1
}

async function main() {
  switch (command) {
    case 'init':
      await init()
      break
    case 'resume':
      if (useCloudBackend()) console.log(renderCloudResume(await cloudCall('/state')))
      else await withStore((store) => console.log(renderResume(store)))
      break
    case 'explain':
      requireArg(positional(0), 'Usage: scar explain <feature>')
      if (useCloudBackend()) console.log(renderCloudExplain(await cloudCall('/state'), positional(0)))
      else await withStore((store) => console.log(renderExplain(store, positional(0))))
      break
    case 'timeline':
      requireArg(positional(0), 'Usage: scar timeline <feature>')
      if (useCloudBackend()) console.log(renderCloudTimeline(await cloudCall('/state'), positional(0)))
      else await withStore((store) => console.log(renderTimeline(store, positional(0))))
      break
    case 'start':
      await startDashboard()
      break
    case 'checkpoint':
      await checkpoint()
      break
    case 'claim':
      await claim()
      break
    case 'remember':
      await remember()
      break
    case 'recall':
      await recall()
      break
    case 'current-work':
      if (useCloudBackend()) console.log(JSON.stringify(await cloudCall('/tool/current-work', { method: 'POST', body: { files: recentFiles() } }), null, 2))
      else await withStore(async (store) => console.log(JSON.stringify(await inferFeatureSmart(store), null, 2)))
      break
    case 'handoff':
      requireArg(positional(0), 'Usage: scar handoff <feature>')
      if (useCloudBackend()) console.log((await cloudCall('/tool/handoff', { method: 'POST', body: { feature: positional(0) } })).brief)
      else await withStore(async (store) => console.log(await renderHandoff(store, positional(0))))
      break
    case 'ides':
      listIdes()
      break
    case 'done':
      await done()
      break
    case 'seed-demo':
      await seedDemo()
      break
    case 'doctor':
      await doctor()
      break
    case 'help':
    default:
      help()
      break
  }
}

async function startDashboard() {
  const render = async () => {
    if (useCloudBackend()) return renderCloudDashboard(await cloudCall('/state'))
    return withStore((store) => renderDashboard(store))
  }
  if (!process.stdin.isTTY || hasFlag('--once')) {
    console.log(await render())
    return
  }
  const rl = readline.createInterface({ input, output })
  try {
    while (true) {
      console.clear()
      console.log(await render())
      const answer = (await rl.question('\n[e] explain  [t] timeline  [r] resume  [q] quit > ')).trim().toLowerCase()
      if (answer === 'q') return
      if (answer === 'r') {
        console.clear()
        console.log(useCloudBackend() ? renderCloudResume(await cloudCall('/state')) : await withStore((store) => renderResume(store)))
        await rl.question('\nPress Enter to return.')
      }
      if (answer === 'e' || answer === 't') {
        const feature = await rl.question('Feature id/name: ')
        console.clear()
        if (answer === 'e') console.log(useCloudBackend() ? renderCloudExplain(await cloudCall('/state'), feature) : await withStore((store) => renderExplain(store, feature)))
        if (answer === 't') console.log(useCloudBackend() ? renderCloudTimeline(await cloudCall('/state'), feature) : await withStore((store) => renderTimeline(store, feature)))
        await rl.question('\nPress Enter to return.')
      }
    }
  } finally {
    rl.close()
  }
}

async function withStore(fn) {
  const store = openStore(root)
  try {
    return await fn(store)
  } finally {
    store.db.close()
  }
}

async function init() {
  const options = hasFlag('--yes')
    ? { selected: adapters.map((adapter) => adapter.id), backend: 'local', mode: 'both' }
    : await promptInit({ root })
  const store = openStore(root)
  try {
    writeGitignore()
    writeAgents(root)
    installGitHook()
    exportState(store)
    const selected = new Set(options.selected || adapters.map((adapter) => adapter.id))
    for (const adapter of adapters.filter((adapter) => selected.has(adapter.id))) {
      adapter.install(root)
    }
    const verified = adapters.filter((adapter) => selected.has(adapter.id)).map((adapter) => ({
      name: adapter.name,
      detected: adapter.detect(root),
      installed: true,
      verified: adapter.verify(root)
    }))
    if (options.backend === 'cloud') {
      writeCloudEnvNotice(options.workspaceUrl)
    }
    console.log('')
    console.log('  ┌──────────────────────────────────────────┐')
    console.log('  │  Scar — Development continuity.          │')
    console.log('  └──────────────────────────────────────────┘')
    console.log('')
    console.log(`  Mode: ${options.mode || 'both'}`)
    console.log(`  State: ${options.backend === 'cloud' ? 'Cloud · SCAR_WORKSPACE_URL' : 'Local · .scar/db.sqlite'}`)
    console.log('')
    for (const result of verified) {
      const status = result.verified ? '✓ installed · verified' : result.installed ? '○ installed · verify failed' : '○ not found'
      console.log(`  ${status.padEnd(24)} ${result.name}`)
    }
    console.log('  ✓ Git hooks installed')
    console.log('  ✓ Context files written')
    console.log('  ✓ Layer 1 MCP config written')
    console.log('  ✓ Layer 2 IDE rules written')
    console.log('')
    console.log('  Notice: Scar can verify adapter files, but it cannot verify that each IDE is logged in.')
    console.log('  Open each IDE once and confirm its account/MCP settings are initialized.')
    console.log('')
    console.log('  scar resume     → continue where you left off')
    console.log('  scar start      → open dashboard')
    console.log('  scar explain    → understand current project state')
  } finally {
    store.db.close()
  }
}

async function checkpoint() {
  const summary = flagValue('--summary') || (hasFlag('--auto') ? lastCommitSummary() : 'Progress checkpoint')
  const progress = Number(flagValue('--progress') || 0)
  const files = splitList(flagValue('--files')) || recentFiles()
  const blockers = splitList(flagValue('--blockers')) || []
  const nextSteps = splitList(flagValue('--next')) || []
  const source = flagValue('--source') || (hasFlag('--auto') ? 'git_hook' : 'manual')
  if (useCloudBackend()) {
    const inferred = (!positional(0) && !flagValue('--feature')) ? (await cloudCall('/tool/current-work', { method: 'POST', body: { files } })).likely_feature : null
    const targetFeature = positional(0) || flagValue('--feature') || inferred || (hasFlag('--auto') ? 'unclassified-work' : null)
    requireArg(targetFeature, 'Usage: scar checkpoint <feature> --summary "..."')
    await cloudCall('/tool/checkpoint', { method: 'POST', body: { feature: targetFeature, summary, progress, files_touched: files, blockers, next_steps: nextSteps, source } })
    console.log(`Checkpoint saved for ${targetFeature}.`)
    return
  }
  let inferred = null
  if (!positional(0) && !flagValue('--feature')) {
    const store = openStore(root)
    try {
      inferred = inferFeature(store).likely_feature
    } finally {
      store.db.close()
    }
  }
  const feature = positional(0) || flagValue('--feature') || inferred
  const autoFeature = hasFlag('--auto') ? 'unclassified-work' : null
  requireArg(feature || autoFeature, 'Usage: scar checkpoint <feature> --summary "..."')
  await withStore((store) => {
    const targetFeature = feature || autoFeature
    insertCheckpoint(store, { feature: targetFeature, summary, progress, files, blockers, nextSteps, source })
    if (source === 'git_hook') recordGitActivity(store, { feature: targetFeature })
    console.log(`Checkpoint saved for ${targetFeature}.`)
  })
}

async function claim() {
  const featureName = positional(0)
  requireArg(featureName, 'Usage: scar claim <feature> [--ide cursor] [--name Abhishek]')
  if (useCloudBackend()) {
    const ide = flagValue('--ide') || process.env.SCAR_IDE || 'cli'
    const name = flagValue('--name') || process.env.USERNAME || process.env.USER || 'developer'
    const result = await cloudCall('/tool/claim', { method: 'POST', body: { feature: featureName, ide, name } })
    console.log(`${ide} claimed ${result.claimed}.`)
    if (result.conflicts?.length) console.log(`Conflicts: ${result.conflicts.map((worker) => worker.id).join(', ')}`)
    return
  }
  await withStore((store) => {
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

async function remember() {
  const key = positional(0)
  const value = positional(1)
  const prompt = flagValue('--prompt')
  requireArg((key && value) || prompt, 'Usage: scar remember <key> <value> [--feature authentication] OR scar remember --prompt "..."')
  if (useCloudBackend()) {
    const result = await cloudCall('/tool/remember', { method: 'POST', body: { key, value, feature: flagValue('--feature'), prompt, created_by: process.env.USERNAME || process.env.USER || 'developer' } })
    if (result.error) throw new Error(result.error)
    console.log(`Remembered ${result.remembered}.`)
    return
  }
  await withStore(async (store) => {
    const feature = flagValue('--feature')
    const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
    const normalized = await normalizeDecision({ prompt, key, value, feature, features })
    const finalKey = normalized?.key || key
    const finalValue = normalized?.value || value
    if (!finalKey || !finalValue) throw new Error('Prompt-only remember requires GROQ_API_KEY. Or pass explicit <key> <value>.')
    const finalFeature = normalized?.feature || feature
    const featureRow = finalFeature ? ensureFeature(store, finalFeature) : null
    store.db.prepare('INSERT INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), featureRow?.id || null, finalKey, finalValue, process.env.USERNAME || process.env.USER || 'developer', nowIso())
    exportState(store)
    console.log(`Remembered ${finalKey}.`)
  })
}

async function recall() {
  if (useCloudBackend()) {
    const state = await cloudCall('/state')
    const key = positional(0)
    const feature = flagValue('--feature')
    const rows = state.decisions.filter((decision) => (!key || decision.key === key) && (!feature || decision.feature_id === feature))
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  await withStore((store) => {
    const key = positional(0)
    const feature = flagValue('--feature')
    const rows = key
      ? store.db.prepare('SELECT * FROM decisions WHERE key = ? ORDER BY created_at DESC').all(key)
      : feature
        ? store.db.prepare('SELECT * FROM decisions WHERE feature_id = ? ORDER BY created_at DESC').all(feature)
        : store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
    console.log(JSON.stringify(rows, null, 2))
  })
}

async function done() {
  const featureName = positional(0)
  requireArg(featureName, 'Usage: scar done <feature> --summary "..."')
  if (useCloudBackend()) {
    const result = await cloudCall('/tool/done', { method: 'POST', body: { feature: featureName, summary: flagValue('--summary') || 'Feature complete' } })
    console.log(`${result.done} marked done.`)
    return
  }
  await withStore((store) => {
    const feature = ensureFeature(store, featureName)
    const summary = flagValue('--summary') || 'Feature complete'
    const now = nowIso()
    store.db.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?').run('done', now, feature.id)
    insertCheckpoint(store, { feature: feature.id, summary, progress: 100, source: 'manual' })
    console.log(`${feature.name} marked done.`)
  })
}

async function seedDemo() {
  await withStore((store) => {
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

async function doctor() {
  if (useCloudBackend()) {
    const health = await cloudCall('/health')
    console.log('Scar doctor')
    console.log(`Workspace: ${root}`)
    console.log(`Backend: cloud`)
    console.log(`Health: ${health.ok ? 'ok' : 'failed'}`)
    return
  }
  await withStore((store) => {
    const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
    console.log('Scar doctor')
    console.log(`Workspace: ${root}`)
    console.log(`State: ${path.join(scarDir(root), 'db.sqlite')}`)
    console.log(`Tables: ${tables.join(', ')}`)
    console.log(`Feature-centric schema: ${tables.includes('features') && tables.includes('checkpoints') ? 'ok' : 'missing'}`)
  })
}

function listIdes() {
  console.log('Scar IDE adapters')
  console.log('')
  for (const item of adapterInventory(root)) {
    const status = item.configured ? 'configured' : item.detected ? 'detected' : 'available'
    console.log(`${status.padEnd(11)} ${item.name.padEnd(14)} ${item.config}`)
  }
  console.log('')
  console.log('Notice: configured means Scar wrote/verified adapter files. It does not prove the IDE is logged in.')
  console.log('Open each IDE once and confirm the account and MCP server are enabled.')
}

function renderCloudResume(state) {
  const feature = state.features?.[0]
  if (!feature) return 'No cloud Scar feature state yet.'
  const checkpoints = (state.checkpoints || []).filter((row) => row.feature_id === feature.id)
  const latest = checkpoints[0]
  return [
    'Backend: Cloud',
    '',
    `Feature: ${feature.name}`,
    '------------------------------',
    `Progress:   ${latest?.progress ?? 0}% complete`,
    `Done:       ${latest?.summary || 'No checkpoints yet'}`,
    `Remaining:  ${jsonList(latest?.next_steps) || 'No next steps recorded'}`,
    `Blockers:   ${jsonList(latest?.blockers) || 'None recorded'}`,
    `Files:      ${jsonList(latest?.files_touched) || 'None recorded'}`
  ].join('\n')
}

function renderCloudExplain(state, query) {
  const feature = findCloudFeature(state, query)
  if (!feature) return `Feature not found: ${query}`
  const checkpoints = (state.checkpoints || []).filter((row) => row.feature_id === feature.id)
  const decisions = (state.decisions || []).filter((row) => row.feature_id === feature.id || row.feature_id == null)
  return [
    `Feature: ${feature.name}`,
    `Status:  ${feature.status}`,
    '',
    'Completed',
    ...(checkpoints.length ? checkpoints.map((row) => `- ${row.summary}`) : ['- none recorded']),
    '',
    'Decisions',
    ...(decisions.length ? decisions.map((row) => `- ${row.key}: ${row.value}`) : ['- none recorded'])
  ].join('\n')
}

function renderCloudTimeline(state, query) {
  const feature = findCloudFeature(state, query)
  if (!feature) return `Feature not found: ${query}`
  const events = [
    ...(state.checkpoints || []).filter((row) => row.feature_id === feature.id).map((row) => [row.created_at, 'checkpoint', row.summary]),
    ...(state.decisions || []).filter((row) => row.feature_id === feature.id).map((row) => [row.created_at, 'decision', `${row.key}: ${row.value}`]),
    ...(state.sessions || []).filter((row) => row.feature_id === feature.id).map((row) => [row.started_at, `${row.ide} session started`, ''])
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return [`${feature.name} · Cloud Timeline`, '', ...(events.length ? events.map(([at, label, detail]) => `${at}  ${label}${detail ? `   ${detail}` : ''}`) : ['No timeline events yet.'])].join('\n')
}

function renderCloudDashboard(state) {
  return [
    'Scar Cloud Dashboard',
    '',
    'Workers',
    ...((state.active_workers || []).length ? state.active_workers.map((worker) => `- ${worker.ide} ${worker.current_feature || 'idle'}`) : ['- none']),
    '',
    'Features',
    ...((state.features || []).length ? state.features.map((feature) => `- ${feature.id} ${feature.status}`) : ['- none']),
    '',
    'Decisions',
    ...((state.decisions || []).slice(0, 5).map((decision) => `- ${decision.key}: ${decision.value}`))
  ].join('\n')
}

function findCloudFeature(state, query) {
  return (state.features || []).find((feature) => feature.id === query || feature.name?.toLowerCase() === String(query).toLowerCase())
}

function jsonList(value) {
  if (!value) return ''
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed.join(', ') : String(parsed)
  } catch {
    return String(value)
  }
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
  const snippet = '\n# Scar checkpoint\nif command -v node >/dev/null 2>&1 && [ -f "./src/cli.js" ]; then\n  node ./src/cli.js checkpoint --auto --source git_hook >/dev/null 2>&1 || true\nelif command -v scar >/dev/null 2>&1; then\n  scar checkpoint --auto --source git_hook >/dev/null 2>&1 || true\nfi\n'
  const existing = fs.existsSync(hook) ? fs.readFileSync(hook, 'utf8') : '#!/bin/sh\n'
  const next = existing.includes('# Scar checkpoint')
    ? existing.replace(/\n# Scar checkpoint\n[\s\S]*?(?=\n# |\n?$)/, snippet)
    : existing + snippet
  fs.writeFileSync(hook, next)
  try {
    fs.chmodSync(hook, 0o755)
  } catch {}
}

function writeCloudEnvNotice(workspaceUrl) {
  const file = path.join(root, '.scar', 'cloud.env.example')
  fs.writeFileSync(file, [
    'SCAR_BACKEND=cloud',
    `SCAR_WORKSPACE_URL=${workspaceUrl || 'https://your-scar-worker.your-subdomain.workers.dev'}`,
    ''
  ].join('\n'))
}

function help() {
  console.log([
    'Scar — Development continuity.',
    '',
    'Commands:',
    '  scar init [--yes]                         Initialize .scar, adapters, hooks, context',
    '  scar resume                               Continue where you left off',
    '  scar start [--once]                       Show interactive terminal dashboard',
    '  scar explain <feature>                    Explain feature state',
    '  scar timeline <feature>                   Show feature timeline',
    '  scar checkpoint <feature> --summary "..." Save progress under a feature_id',
    '  scar claim <feature>                      Claim a feature for this worker',
    '  scar remember <key> <value>               Store a project or feature decision',
    '  scar remember <key> <value> --prompt "..." Store a Groq-normalized decision',
    '  scar recall [key]                         Retrieve decisions',
    '  scar current-work                         Infer likely feature from branch/files',
    '  scar handoff <feature>                    Generate a Groq-backed handoff brief',
    '  scar ides                                 Show all available IDE adapters',
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

function positional(index) {
  return args.slice(1).filter((arg, i, all) => {
    if (arg.startsWith('--')) return false
    return !all[i - 1]?.startsWith('--')
  })[index] || null
}
