#!/usr/bin/env node
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { adapterInventory, adapters, writeAgents } from './adapters.js'
import { cloudCall, useCloudBackend } from './cloud-client.js'
import { ensureFeature, exportState, insertCheckpoint, openStore, recordGitActivity, resetFeature, idFromName, titleFromId } from './db.js'
import { inferFeature, inferFeatureSmart } from './infer.js'
import { normalizeDecision, checkFeatureOverlap, hasGroq } from './groq.js'
import { projectRoot, ideosDir } from './paths.js'
import { renderDashboard, renderExplain, renderHandoff, renderResume, renderTimeline, renderStatus, renderDiff, getLocalState } from './render.js'
import { lastCommitSummary, recentFiles, git } from './git.js'
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
  if (args.includes('--version') || args.includes('-v') || command === 'version') {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    console.log(`ideos v${pkg.version}`)
    return
  }
  if (command !== 'help' && (args.includes('--help') || args.includes('-h'))) {
    subcommandHelp(command)
    return
  }
  switch (command) {
    case 'status':
      await statusCommand()
      break
    case 'diff':
      await diffCommand()
      break
    case 'import':
      await importCommand()
      break
    case 'reset':
      await resetCommand()
      break
    case 'onboard':
      await onboardCommand()
      break
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
  const fix = hasFlag('--fix')
  console.log('ideOS doctor')
  console.log(`Workspace: ${root}`)

  if (useCloudBackend()) {
    const health = await cloudCall('/health')
    console.log(`Backend: cloud`)
    console.log(`Health: ${health.ok ? 'ok' : 'failed'}`)
    return
  }

  console.log('Checking .gitignore...')
  const gitignorePath = path.join(root, '.gitignore')
  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
  const missingGitignore = ['.ideos/db.sqlite', '.ideos/db.sqlite-*', '.env'].filter(item => !gitignoreContent.split(/\r?\n/).includes(item))
  if (missingGitignore.length > 0) {
    if (fix) {
      writeGitignore()
      console.log('  [FIXED] Added missing items to .gitignore')
    } else {
      console.log(`  [FAIL] Missing entries in .gitignore: ${missingGitignore.join(', ')}. Run with --fix to repair.`)
    }
  } else {
    console.log('  [OK] .gitignore entries verified')
  }

  console.log('Checking git hooks...')
  const postCommitPath = path.join(root, '.git', 'hooks', 'post-commit')
  let hookOk = fs.existsSync(postCommitPath)
  if (hookOk) {
    const content = fs.readFileSync(postCommitPath, 'utf8')
    if (!content.includes('# ideOS checkpoint')) {
      hookOk = false
    }
  }
  if (!hookOk) {
    if (fix) {
      installGitHook()
      console.log('  [FIXED] post-commit git hook installed')
    } else {
      console.log('  [FAIL] post-commit git hook is missing or stale. Run with --fix to repair.')
    }
  } else {
    console.log('  [OK] post-commit git hook verified')
  }

  console.log('Checking database and exports...')
  await withStore((store) => {
    const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
    const schemaOk = tables.includes('features') && tables.includes('checkpoints') && tables.includes('decisions')
    if (!schemaOk) {
      console.log('  [FAIL] Database schema is missing tables.')
    } else {
      console.log('  [OK] Database schema verified')
    }

    if (fix) {
      exportState(store)
      console.log('  [FIXED] Exported latest state to exports/')
    }
  })

  console.log('Checking IDE configurations...')
  const inv = adapterInventory(root)
  for (const item of inv) {
    const adapter = adapters.find(a => a.id === item.id)
    if (item.detected) {
      if (!item.verified) {
        if (fix) {
          adapter.install(root, { backend: 'local' })
          console.log(`  [FIXED] Re-installed configuration for ${adapter.name}`)
        } else {
          console.log(`  [FAIL] ${adapter.name} configuration is not verified. Run with --fix to repair.`)
        }
      } else {
        console.log(`  [OK] ${adapter.name} verified`)
      }
    }
  }
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
    '  ideos doctor [--fix]                       Validate local ideOS state (auto-repair with --fix)',
    '  ideos status                               Print single-line status for shell prompts',
    '  ideos diff                                 Display changes made in the last session',
    '  ideos import [--limit <num>]               Import features and checkpoints from git history',
    '  ideos reset <feature>                      Wipe a feature\'s state and associated data',
    '  ideos onboard                              Generate a briefing for new team members',
    '  ideos version                              Show version',
    '',
    'Run "ideos <command> --help" for subcommand-specific flags.'
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

async function statusCommand() {
  if (useCloudBackend()) {
    try {
      const stateData = await cloudCall('/state')
      console.log(renderStatus(stateData))
    } catch {
      // Fail silently for shell prompts
    }
    return
  }
  try {
    await withStore((store) => {
      console.log(renderStatus(store))
    })
  } catch {
    // Fail silently for shell prompts
  }
}

async function diffCommand() {
  if (useCloudBackend()) {
    const stateData = await cloudCall('/state')
    console.log(renderDiff(stateData))
    return
  }
  await withStore((store) => {
    console.log(renderDiff(store))
  })
}

async function resetCommand() {
  const feature = positional(0)
  requireArg(feature, 'Usage: ideos reset <feature>')

  if (useCloudBackend()) {
    const result = await cloudCall('/tool/reset', { method: 'POST', body: { feature } })
    console.log(`Feature ${result.reset} reset successfully.`)
    return
  }

  await withStore((store) => {
    const res = resetFeature(store, feature)
    if (res) {
      console.log(`Feature ${res.name} (${res.id}) and all associated state reset successfully.`)
    } else {
      console.log(`Feature ${feature} not found.`)
    }
  })
}

async function onboardCommand() {
  let stateData
  if (useCloudBackend()) {
    stateData = await cloudCall('/state')
  } else {
    await withStore((store) => {
      stateData = getLocalState(store)
    })
  }

  const lines = [
    '# Project Onboarding Briefing',
    '',
    `Generated on: ${new Date().toLocaleDateString()}`,
    `Workspace: ${path.basename(root)}`,
    '',
    '## Active Features & Progress',
    ''
  ]

  const activeFeatures = stateData.features.filter(f => f.status !== 'done')
  if (activeFeatures.length === 0) {
    lines.push('No active features under development.')
  } else {
    for (const f of activeFeatures) {
      const checkpoints = stateData.checkpoints.filter(c => c.feature_id === f.id)
      const latest = checkpoints[0]
      const progress = latest?.progress ?? 0
      lines.push(`### 🔒 ${f.name} (${f.id}) — ${progress}% complete`)
      lines.push(`${f.description || '_No goal/description recorded._'}`)
      lines.push('')
      let nextSteps = latest?.next_steps || latest?.nextSteps || []
      if (typeof nextSteps === 'string') {
        try { nextSteps = JSON.parse(nextSteps) } catch { nextSteps = [] }
      }
      nextSteps = Array.isArray(nextSteps) ? nextSteps.filter(s => s && s.trim()) : []
      if (nextSteps.length > 0) {
        lines.push('**Next Steps:**')
        for (const step of nextSteps) {
          lines.push(`- [ ] ${step}`)
        }
        lines.push('')
      }
    }
  }

  lines.push('## Key Decisions', '')
  if (stateData.decisions.length === 0) {
    lines.push('No decisions recorded.')
  } else {
    for (const d of stateData.decisions) {
      lines.push(`- **${d.key}**: ${d.value}${d.feature_id ? ` (Feature: ${d.feature_id})` : ''}`)
    }
  }

  lines.push('', '## Recent Activity Checkpoints', '')
  if (stateData.checkpoints.length === 0) {
    lines.push('No checkpoints recorded.')
  } else {
    for (const c of stateData.checkpoints.slice(0, 10)) {
      lines.push(`- _${new Date(c.created_at).toLocaleString()}_ [${c.feature_id}]: ${c.summary}`)
    }
  }

  const onboardMarkdown = lines.join('\n')
  fs.writeFileSync(path.join(root, 'ONBOARDING.md'), onboardMarkdown)

  console.log(onboardMarkdown)
  console.log('\n  ✓ Briefing saved to ONBOARDING.md')
}

async function importCommand() {
  const limit = Number(flagValue('--limit') || 50)
  console.log(`Analyzing last ${limit} commits in git history...`)

  const logOutput = git(['log', `-${limit}`, '--name-only', '--pretty=format:COMMIT:%H|%cI|%an|%s'], '')
  if (!logOutput) {
    console.log('No git history found or git not available.')
    return
  }

  const commits = []
  let currentCommit = null

  const lines = logOutput.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('COMMIT:')) {
      if (currentCommit) commits.push(currentCommit)
      const parts = trimmed.slice(7).split('|')
      currentCommit = {
        hash: parts[0],
        date: parts[1],
        author: parts[2],
        message: parts[3] || '',
        files: []
      }
    } else if (currentCommit) {
      currentCommit.files.push(trimmed)
    }
  }
  if (currentCommit) commits.push(currentCommit)

  if (commits.length === 0) {
    console.log('No commits parsed.')
    return
  }

  console.log(`Found ${commits.length} commits. Clustering...`)

  let clustered = null
  if (hasGroq()) {
    const { clusterGitCommits } = await import('./groq.js')
    clustered = await clusterGitCommits({ commits })
  }

  if (!clustered || !clustered.features) {
    console.log('Using local heuristic clustering (Groq API not configured or failed)...')
    const featuresMap = new Map()

    for (const commit of commits) {
      let featureName = 'general-improvements'
      const match = commit.message.match(/^(?:feat|fix|docs|refactor|test|style|chore)\(([^)]+)\):|^([a-zA-Z0-9_-]+):/)
      if (match) {
        featureName = match[1] || match[2]
      }

      const featureId = idFromName(featureName)
      if (!featuresMap.has(featureId)) {
        featuresMap.set(featureId, {
          id: featureId,
          name: titleFromId(featureName),
          description: `Imported features under ${featureName}`,
          status: 'done',
          checkpoints: []
        })
      }

      featuresMap.get(featureId).checkpoints.push({
        summary: commit.message,
        progress: 100,
        files: commit.files,
        created_at: commit.date,
        author: commit.author
      })
    }
    clustered = { features: Array.from(featuresMap.values()) }
  }

  console.log(`Importing ${clustered.features.length} features...`)

  if (useCloudBackend()) {
    for (const f of clustered.features) {
      await cloudCall('/tool/claim', { method: 'POST', body: { feature: f.id } })
      for (const cp of f.checkpoints) {
        await cloudCall('/tool/checkpoint', {
          method: 'POST',
          body: {
            feature: f.id,
            summary: cp.summary,
            progress: cp.progress,
            files_touched: cp.files,
            source: 'git_hook',
            worker_id: `git:${cp.author.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')}`
          }
        })
      }
    }
  } else {
    await withStore((store) => {
      store.db.transaction(() => {
        for (const f of clustered.features) {
          store.db.prepare(`
            INSERT OR IGNORE INTO features (id, name, description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(f.id, f.name, f.description || '', f.status || 'done', f.checkpoints[f.checkpoints.length - 1]?.created_at || nowIso(), f.checkpoints[0]?.created_at || nowIso())

          for (const cp of f.checkpoints) {
            const workerId = `git:${cp.author.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')}`
            store.db.prepare(`
              INSERT OR IGNORE INTO workers (id, name, ide)
              VALUES (?, ?, 'git')
            `).run(workerId, cp.author)

            store.db.prepare(`
              INSERT INTO checkpoints (id, feature_id, worker_id, summary, progress, files_touched, blockers, next_steps, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'git_hook', ?)
            `).run(crypto.randomUUID(), f.id, workerId, cp.summary, cp.progress, JSON.stringify(cp.files), '[]', '[]', cp.created_at)
          }
        }
      })()
      exportState(store)
    })
  }

  console.log('  ✓ Git history import completed successfully.')
}

function subcommandHelp(cmd) {
  const helps = {
    init: [
      'Usage: ideos init [--yes]',
      '',
      'Initialize .ideos database, git hooks, IDE configuration, and context files.',
      '',
      'Flags:',
      '  --yes  Automate prompts and use default settings'
    ],
    resume: [
      'Usage: ideos resume',
      '',
      'Continue where you left off by opening your IDE at the active feature.'
    ],
    start: [
      'Usage: ideos start [--once]',
      '',
      'Open the interactive terminal dashboard to monitor and manage features.',
      '',
      'Flags:',
      '  --once  Render the dashboard once and exit instead of entering interactive loop'
    ],
    explain: [
      'Usage: ideos explain <feature>',
      '',
      'Show a detailed summary of a feature\'s current status and key decisions.'
    ],
    timeline: [
      'Usage: ideos timeline <feature>',
      '',
      'Show the chronological timeline of progress checkpoints for a feature.'
    ],
    checkpoint: [
      'Usage: ideos checkpoint <feature> --summary "..." [--progress <0-100>] [--files <list>] [--blockers <list>] [--next <list>] [--auto] [--source <src>]',
      '',
      'Save a progress checkpoint under a feature_id.',
      '',
      'Flags:',
      '  --summary "..."   Description of the progress (Required unless --auto is used)',
      '  --progress <num>  Estimated progress percentage (0-100)',
      '  --files <list>    Comma-separated list of files touched',
      '  --blockers <list> Comma-separated list of active blockers',
      '  --next <list>     Comma-separated list of next steps',
      '  --auto            Auto-detect settings',
      '  --source <src>    Source of checkpoint (e.g. \'manual\', \'git_hook\')'
    ],
    claim: [
      'Usage: ideos claim <feature> [--ide <name>] [--name <developer>]',
      '',
      'Claim a feature for the current worker/session.',
      '',
      'Flags:',
      '  --ide <name>      IDE being used (defaults to IDEOS_IDE or \'cli\')',
      '  --name <dev>      Name of developer claiming the feature'
    ],
    remember: [
      'Usage: ideos remember <key> <value> [--feature <id>] OR ideos remember --prompt "..." [--feature <id>]',
      '',
      'Store a project or feature decision.',
      '',
      'Flags:',
      '  --feature <id>    Associate the decision with a specific feature',
      '  --prompt "..."    Normalize decision content using Groq LLM'
    ],
    recall: [
      'Usage: ideos recall [key] [--feature <id>]',
      '',
      'Retrieve recorded decisions.',
      '',
      'Flags:',
      '  --feature <id>    Filter decisions by feature ID'
    ],
    'current-work': [
      'Usage: ideos current-work',
      '',
      'Infer the likely active feature based on the current git branch and recently modified files.'
    ],
    handoff: [
      'Usage: ideos handoff <feature>',
      '',
      'Generate a handoff brief summarizing what was done, decisions made, and next steps.'
    ],
    ides: [
      'Usage: ideos ides',
      '',
      'List all supported IDE adapters and their configuration status.'
    ],
    detect: [
      'Usage: ideos detect',
      '',
      'Scan the system for installed IDEs and extensions.'
    ],
    mcp: [
      'Usage: ideos mcp',
      '',
      'Start the ideOS Model Context Protocol (MCP) stdio server.'
    ],
    done: [
      'Usage: ideos done <feature> --summary "..."',
      '',
      'Mark a feature as done.'
    ],
    doctor: [
      'Usage: ideos doctor [--fix]',
      '',
      'Validate local ideOS database, state, and files.',
      '',
      'Flags:',
      '  --fix  Auto-repair found issues (MCP config, DB health, etc.)'
    ],
    status: [
      'Usage: ideos status',
      '',
      'Print a single-line status for shell prompts.'
    ],
    diff: [
      'Usage: ideos diff',
      '',
      'Display changes made in the last session.'
    ],
    import: [
      'Usage: ideos import [--limit <number>]',
      '',
      'Import features and checkpoints from git history.',
      '',
      'Flags:',
      '  --limit <num>  Number of recent commits to analyze (default: 50)'
    ],
    reset: [
      'Usage: ideos reset <feature>',
      '',
      'Wipe a feature\'s state and all associated checkpoints, decisions, and tasks.'
    ],
    onboard: [
      'Usage: ideos onboard',
      '',
      'Generate a structured markdown briefing document for new team members.'
    ]
  }

  const lines = helps[cmd] || [`No help available for subcommand: ${cmd}`, 'Run "ideos help" for global usage.']
  for (const line of lines) {
    console.log(line)
  }
}

