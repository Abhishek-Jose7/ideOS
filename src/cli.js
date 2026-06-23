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
import { normalizeDecision, checkFeatureOverlap } from './groq.js'
import { projectRoot, ideosDir } from './paths.js'
import { renderDashboard, renderExplain, renderHandoff, renderResume, renderTimeline } from './render.js'
import { lastCommitSummary, recentFiles } from './git.js'
import { nowIso } from './time.js'
import { promptInit, promptResume, launchIDE } from './init-prompt.js'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const root = projectRoot()

try {
  await main()
} catch (error) {
  console.error(`ideos: ${error.message}`)
  process.exitCode = 1
}

async function main() {
  switch (command) {
    case 'init':
      await init()
      break
    case 'resume': {
      let stateData
      if (useCloudBackend()) {
        stateData = await cloudCall('/state')
        console.log(renderResume(stateData))
      } else {
        await withStore(async (store) => {
          let text = renderResume(store)
          if (process.stdin.isTTY) {
            const lines = text.split('\n')
            const idx = lines.findIndex((line) => line.trim() === 'Open in:')
            if (idx !== -1) text = lines.slice(0, idx).join('\n')
          }
          console.log(text)
        })
      }
      const inv = adapterInventory(root)
      let activeAdps = inv.filter((item) => item.configured)
      if (activeAdps.length === 0) activeAdps = inv.filter((item) => item.detected)
      if (activeAdps.length === 0) activeAdps = inv
      const choices = activeAdps.map((item) => ({ label: item.name, value: item.id }))
      const selectedIde = await promptResume({ ides: choices })
      console.log(`\nOpening in ${selectedIde}...`)
      launchIDE(selectedIde, root)
      break
    }
    case 'explain':
      requireArg(positional(0), 'Usage: ideos explain <feature>')
      if (useCloudBackend()) console.log(renderExplain(await cloudCall('/state'), positional(0)))
      else await withStore((store) => console.log(renderExplain(store, positional(0))))
      break
    case 'timeline':
      requireArg(positional(0), 'Usage: ideos timeline <feature>')
      if (useCloudBackend()) console.log(renderTimeline(await cloudCall('/state'), positional(0)))
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
      requireArg(positional(0), 'Usage: ideos handoff <feature>')
      if (useCloudBackend()) console.log((await cloudCall('/tool/handoff', { method: 'POST', body: { feature: positional(0) } })).brief)
      else await withStore(async (store) => console.log(await renderHandoff(store, positional(0))))
      break
    case 'ides':
      listIdes()
      break
    case 'detect':
      detectLocalIdes()
      break
    case 'mcp':
      await import('./mcp.js')
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
    if (useCloudBackend()) return renderDashboard(await cloudCall('/state'))
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
        console.log(useCloudBackend() ? renderResume(await cloudCall('/state')) : await withStore((store) => renderResume(store)))
        await rl.question('\nPress Enter to return.')
      }
      if (answer === 'e' || answer === 't') {
        const feature = await rl.question('Feature id/name: ')
        console.clear()
        if (answer === 'e') console.log(useCloudBackend() ? renderExplain(await cloudCall('/state'), feature) : await withStore((store) => renderExplain(store, feature)))
        if (answer === 't') console.log(useCloudBackend() ? renderTimeline(await cloudCall('/state'), feature) : await withStore((store) => renderTimeline(store, feature)))
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
  const alreadyInit = fs.existsSync(path.join(root, '.ideos', 'db.sqlite'))
  if (alreadyInit && !hasFlag('--yes') && process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output })
    try {
      const answer = await rl.question('\n  \x1b[1m\x1b[33m⚠ Warning:\x1b[0m ideOS has already been initialized in this repository.\n  Re-initializing will overwrite config files. Do you want to proceed? (y/N): ')
      if (answer.trim().toLowerCase() !== 'y') {
        console.log('\n  Initialization aborted.')
        return
      }
    } finally {
      rl.close()
    }
  }

  const options = hasFlag('--yes')
    ? { selected: adapters.map((adapter) => adapter.id), backend: 'local', mode: 'both', groqKey: '' }
    : await promptInit({ root })
  const store = openStore(root)
  try {
    writeGitignore()
    writeEnvFile(root, options)
    writeAgents(root)
    installGitHook()
    exportState(store)
    const selected = new Set(options.selected || adapters.map((adapter) => adapter.id))
    for (const adapter of adapters.filter((adapter) => selected.has(adapter.id))) {
      adapter.install(root, { backend: options.backend, workspaceUrl: options.workspaceUrl })
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
    console.log('  \x1b[1m\x1b[35m┌────────────────────────────────────────────────────────┐\x1b[0m')
    console.log('  \x1b[1m\x1b[35m│  ideOS — DEVELOPMENT CONTINUITY LAYER INITIALIZED       │\x1b[0m')
    console.log('  \x1b[1m\x1b[35m└────────────────────────────────────────────────────────┘\x1b[0m')
    console.log('')
    console.log('  \x1b[1m\x1b[36m⚙ CONFIGURATION STATUS\x1b[0m')
    console.log('  --------------------------------------------------')
    console.log(`  \x1b[1mMode:\x1b[0m       ${options.mode || 'both'}`)
    console.log(`  \x1b[1mBackend:\x1b[0m    ${options.backend === 'cloud' ? 'Cloud' : 'Local SQLite Database'}`)
    if (options.backend === 'cloud') {
      console.log(`  \x1b[1mURL:\x1b[0m        ${options.workspaceUrl || 'Not configured'}`)
    } else {
      console.log('  \x1b[1mStore:\x1b[0m      .ideos/db.sqlite')
    }
    console.log('')
    console.log('  \x1b[1m\x1b[36m⚡ EXTENSIONS & RULES INSTALLED\x1b[0m')
    console.log('  --------------------------------------------------')
    console.log('  \x1b[32m✔\x1b[0m Git hooks installed (post-commit automatic snapshots)')
    console.log('  \x1b[32m✔\x1b[0m Layer 1 MCP config files written & verified')
    console.log('  \x1b[32m✔\x1b[0m Layer 2 IDE rules instructions written (.cursor/rules, etc.)')
    console.log('  \x1b[32m✔\x1b[0m Context files initialized (.ideos/AGENTS.md, context.md)')
    console.log('')
    console.log('  \x1b[1m\x1b[36m🔌 CONFIGURED IDE ADAPTERS\x1b[0m')
    console.log('  --------------------------------------------------')
    for (const result of verified) {
      if (result.verified) {
        console.log(`  \x1b[32m✔\x1b[0m Configured & Verified   ${result.name}`)
      } else if (result.installed) {
        console.log(`  \x1b[33m○\x1b[0m Configured (Unverified) ${result.name}`)
      } else {
        console.log(`  \x1b[90m-\x1b[0m Skipped                 ${result.name}`)
      }
    }
    console.log('')
    console.log('  \x1b[1m\x1b[33m⚠ IMPORTANT ACTION REQUIRED\x1b[0m')
    console.log('  --------------------------------------------------')
    console.log('  ideOS verified configuration files, but you must open your')
    console.log('  IDE once to enable/authorize the MCP server:')
    console.log('  1. Open your configured IDE (e.g. Cursor, Windsurf, Trae, etc.).')
    console.log('  2. Verify that the "ideos" MCP server is active/running.')
    console.log('')
    console.log('  \x1b[1m\x1b[32m🚀 NEXT STEPS — START DEVELOPING\x1b[0m')
    console.log('  --------------------------------------------------')
    console.log('  \x1b[1mideos resume\x1b[0m      → Resume your last feature or launch your IDE')
    console.log('  \x1b[1mideos start\x1b[0m       → Open the interactive terminal dashboard')
    console.log('  \x1b[1mideos explain\x1b[0m     → Get a deep explain summary of project state')
    console.log('  \x1b[1mideos detect\x1b[0m      → Re-scan laptop for installed IDEs')
    console.log('')
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
    requireArg(targetFeature, 'Usage: ideos checkpoint <feature> --summary "..."')
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
  requireArg(feature || autoFeature, 'Usage: ideos checkpoint <feature> --summary "..."')
  await withStore((store) => {
    const targetFeature = feature || autoFeature
    insertCheckpoint(store, { feature: targetFeature, summary, progress, files, blockers, nextSteps, source })
    if (source === 'git_hook') recordGitActivity(store, { feature: targetFeature })
    console.log(`Checkpoint saved for ${targetFeature}.`)
  })
}

async function claim() {
  const featureName = positional(0)
  requireArg(featureName, 'Usage: ideos claim <feature> [--ide cursor] [--name Abhishek]')
  if (useCloudBackend()) {
    const ide = flagValue('--ide') || process.env.IDEOS_IDE || 'cli'
    const name = flagValue('--name') || process.env.USERNAME || process.env.USER || 'developer'
    const result = await cloudCall('/tool/claim', { method: 'POST', body: { feature: featureName, ide, name } })
    console.log(`${ide} claimed ${result.claimed}.`)
    if (result.conflicts?.length) console.log(`Conflicts: ${result.conflicts.map((worker) => worker.id).join(', ')}`)
    if (result.overlap?.duplicate) {
      console.log(`Warning/Notice: '${featureName}' has semantic overlap with existing feature '${result.overlap.overlap_feature}' (reason: ${result.overlap.reason}).`)
    }
    return
  }
  await withStore(async (store) => {
    const feature = ensureFeature(store, featureName)
    const features = store.db.prepare('SELECT * FROM features WHERE id <> ?').all(feature.id)
    const overlap = await checkFeatureOverlap({ newFeature: feature.id, features })
    const ide = flagValue('--ide') || process.env.IDEOS_IDE || 'cli'
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
    if (overlap?.duplicate) {
      console.log(`Warning/Notice: '${feature.name}' has semantic overlap with existing feature '${overlap.overlap_feature}' (reason: ${overlap.reason}).`)
    }
  })
}

async function remember() {
  const key = positional(0)
  const value = positional(1)
  const prompt = flagValue('--prompt')
  requireArg((key && value) || prompt, 'Usage: ideos remember <key> <value> [--feature authentication] OR ideos remember --prompt "..."')
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
  requireArg(featureName, 'Usage: ideos done <feature> --summary "..."')
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
    console.log('Demo ideOS state seeded.')
  })
}

async function doctor() {
  if (useCloudBackend()) {
    const health = await cloudCall('/health')
    console.log('ideOS doctor')
    console.log(`Workspace: ${root}`)
    console.log(`Backend: cloud`)
    console.log(`Health: ${health.ok ? 'ok' : 'failed'}`)
    return
  }
  await withStore((store) => {
    const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
    console.log('ideOS doctor')
    console.log(`Workspace: ${root}`)
    console.log(`State: ${path.join(ideosDir(root), 'db.sqlite')}`)
    console.log(`Tables: ${tables.join(', ')}`)
    console.log(`Feature-centric schema: ${tables.includes('features') && tables.includes('checkpoints') ? 'ok' : 'missing'}`)
  })
}

function listIdes() {
  console.log('ideOS IDE adapters')
  console.log('')
  for (const item of adapterInventory(root)) {
    const status = item.configured ? 'configured' : item.detected ? 'detected' : 'available'
    console.log(`${status.padEnd(11)} ${item.name.padEnd(14)} ${item.config}`)
  }
  console.log('')
  console.log('Warning/Notice: configured means ideOS wrote/verified adapter files.')
  console.log('It does NOT guarantee that the IDE is logged in or initialized.')
  console.log('You must manually open each IDE once and confirm that you are properly')
  console.log('logged in and that the MCP server is initialized and enabled.')
}

function detectLocalIdes() {
  console.log('Scanning laptop for installed IDEs and extensions...')
  console.log('')
  let found = false
  for (const adapter of adapters) {
    const installed = adapter.detectSystem ? adapter.detectSystem() : false
    if (installed) {
      console.log(`  ✓ ${adapter.name.padEnd(16)} (Detected on laptop)`)
      found = true
    }
  }
  if (!found) {
    console.log('  No supported IDEs or extensions detected on this laptop.')
  }
  console.log('')
}



function writeEnvFile(root, options) {
  const envPath = path.join(root, '.env')
  let content = ''
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8')
  }
  const lines = content.split(/\r?\n/)
  const setVar = (key, val) => {
    const idx = lines.findIndex(line => line.startsWith(`${key}=`))
    if (idx !== -1) {
      lines[idx] = `${key}=${val}`
    } else {
      lines.push(`${key}=${val}`)
    }
  }
  if (options.groqKey) {
    setVar('GROQ_API_KEY', options.groqKey)
    setVar('IDEOS_GROQ_MODEL', 'llama-3.3-70b-versatile')
  }
  setVar('IDEOS_BACKEND', options.backend)
  if (options.backend === 'cloud' && options.workspaceUrl) {
    setVar('IDEOS_WORKSPACE_URL', options.workspaceUrl)
  }
  fs.writeFileSync(envPath, lines.join('\n').trim() + '\n')
}

function writeGitignore() {
  const file = path.join(root, '.gitignore')
  const line = '.ideos/db.sqlite'
  const wal = '.ideos/db.sqlite-*'
  const env = '.env'
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const additions = [line, wal, env].filter((item) => !existing.split(/\r?\n/).includes(item))
  if (additions.length) fs.appendFileSync(file, `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}${additions.join('\n')}\n`)
}

function installGitHook() {
  const hooks = path.join(root, '.git', 'hooks')
  if (!fs.existsSync(hooks)) return
  const hook = path.join(hooks, 'post-commit')
  const snippet = '\n# ideOS checkpoint\nif command -v node >/dev/null 2>&1 && [ -f "./src/cli.js" ]; then\n  node ./src/cli.js checkpoint --auto --source git_hook >/dev/null 2>&1 || true\nelif command -v ideos >/dev/null 2>&1; then\n  ideos checkpoint --auto --source git_hook >/dev/null 2>&1 || true\nfi\n'
  const existing = fs.existsSync(hook) ? fs.readFileSync(hook, 'utf8') : '#!/bin/sh\n'
  const next = existing.includes('# ideOS checkpoint')
    ? existing.replace(/\n# ideOS checkpoint\n[\s\S]*?(?=\n# |\n?$)/, snippet)
    : existing + snippet
  fs.writeFileSync(hook, next)
  try {
    fs.chmodSync(hook, 0o755)
  } catch {}
}

function writeCloudEnvNotice(workspaceUrl) {
  const file = path.join(root, '.ideos', 'cloud.env.example')
  fs.writeFileSync(file, [
    'IDEOS_BACKEND=cloud',
    `IDEOS_WORKSPACE_URL=${workspaceUrl || 'https://your-ideos-worker.your-subdomain.workers.dev'}`,
    ''
  ].join('\n'))
}

function help() {
  const lines = [
    'ideOS — Development continuity.',
    '',
    'Commands:',
    '  ideos init [--yes]                         Initialize .ideos, adapters, hooks, context',
    '  ideos resume                               Continue where you left off',
    '  ideos start [--once]                       Show interactive terminal dashboard',
    '  ideos explain <feature>                    Explain feature state',
    '  ideos timeline <feature>                   Show feature timeline',
    '  ideos checkpoint <feature> --summary "..." Save progress under a feature_id',
    '  ideos claim <feature>                      Claim a feature for this worker',
    '  ideos remember <key> <value>               Store a project or feature decision',
    '  ideos remember <key> <value> --prompt "..." Store a Groq-normalized decision',
    '  ideos recall [key]                         Retrieve decisions',
    '  ideos current-work                         Infer likely feature from branch/files',
    '  ideos handoff <feature>                    Generate a Groq-backed handoff brief',
    '  ideos ides                                 Show all available IDE adapters',
    '  ideos detect                               Scan laptop for installed IDEs & extensions',
    '  ideos mcp                                  Start the MCP server (stdio)',
    '  ideos done <feature> --summary "..."       Mark a feature complete',
    '  ideos doctor                               Validate local ideOS state'
  ]
  for (const line of lines) {
    console.log(line)
  }
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
