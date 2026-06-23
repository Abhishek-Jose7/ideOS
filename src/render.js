import path from 'node:path'
import { serializeCheckpoint, titleFromId } from './db.js'
import { synthesizeHandoff } from './groq.js'
import { statusMark, workerStatus } from './status.js'
import { ago, duration } from './time.js'

export function featureSummary(store, feature) {
  const checkpoints = store.db.prepare('SELECT * FROM checkpoints WHERE feature_id = ? ORDER BY created_at DESC').all(feature.id).map(serializeCheckpoint)
  const decisions = store.db.prepare('SELECT * FROM decisions WHERE feature_id = ? OR feature_id IS NULL ORDER BY created_at DESC').all(feature.id)
  const sessions = store.db.prepare('SELECT * FROM sessions WHERE feature_id = ? ORDER BY started_at DESC').all(feature.id)
  const latest = checkpoints[0]
  return { feature, checkpoints, decisions, sessions, latest }
}

export function findFeature(store, query) {
  return store.db.prepare('SELECT * FROM features WHERE id = ? OR lower(name) = lower(?)').get(query, query)
}

export function getLocalState(store) {
  const db = store.db
  const features = db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
  const decisions = db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all()
  const checkpoints = db.prepare('SELECT * FROM checkpoints ORDER BY created_at DESC').all()
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all()
  const workers = db.prepare('SELECT * FROM workers ORDER BY COALESCE(last_heartbeat, last_file_activity, last_git_activity) DESC').all()
  const recent_activity = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50').all()
  return {
    features,
    decisions,
    checkpoints,
    sessions,
    active_workers: workers,
    recent_activity
  }
}

function normalizeState(state) {
  const checkpoints = (state.checkpoints || []).map((c) => {
    let files_touched = c.files_touched || []
    if (typeof files_touched === 'string') {
      try { files_touched = JSON.parse(files_touched) } catch { files_touched = [] }
    }
    let blockers = c.blockers || []
    if (typeof blockers === 'string') {
      try { blockers = JSON.parse(blockers) } catch { blockers = [] }
    }
    let next_steps = c.next_steps || c.nextSteps || []
    if (typeof next_steps === 'string') {
      try { next_steps = JSON.parse(next_steps) } catch { next_steps = [] }
    }
    return {
      ...c,
      files_touched,
      blockers,
      next_steps
    }
  })
  const features = (state.features || []).map((f) => {
    let progress = f.progress
    if (progress === undefined) {
      const latest = checkpoints.find((c) => c.feature_id === f.id)
      progress = latest ? latest.progress : 0
    }
    return { ...f, progress }
  })
  return {
    ...state,
    features,
    checkpoints,
    decisions: state.decisions || [],
    sessions: state.sessions || [],
    active_workers: state.active_workers || []
  }
}

export function getOverlapWarning(state) {
  const activeWorkers = (state.active_workers || []).filter(w => workerStatus(w) !== 'inactive')
  if (activeWorkers.length < 2) return null
  
  const workerDirs = {}
  const tenMinutesAgo = new Date(Date.now() - 600000).toISOString()
  
  for (const worker of activeWorkers) {
    const checkpoints = (state.checkpoints || []).filter(c => c.worker_id === worker.id && c.created_at >= tenMinutesAgo)
    const dirs = new Set()
    for (const checkpoint of checkpoints) {
      let files = checkpoint.files_touched || []
      if (typeof files === 'string') {
        try { files = JSON.parse(files) } catch {}
      }
      if (Array.isArray(files)) {
        for (const file of files) {
          const dir = path.dirname(file).replaceAll(path.sep, '/')
          if (dir && dir !== '.') {
            dirs.add(dir + '/')
          }
        }
      }
    }
    if (dirs.size > 0) {
      workerDirs[worker.id] = {
        name: titleFromId(worker.ide),
        dirs: [...dirs]
      }
    }
  }
  
  const keys = Object.keys(workerDirs)
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const w1 = workerDirs[keys[i]]
      const w2 = workerDirs[keys[j]]
      const common = w1.dirs.filter(d => w2.dirs.includes(d))
      if (common.length > 0) {
        return `⚠  Overlap: ${w1.name} + ${w2.name} both near ${common[0]}`
      }
    }
  }
  return null
}

export function renderResume(stateOrStore) {
  const state = normalizeState(stateOrStore.db ? getLocalState(stateOrStore) : stateOrStore)
  const lastSession = state.sessions[0]
  const feature = lastSession?.feature_id
    ? state.features.find((f) => f.id === lastSession.feature_id)
    : state.features[0]
    
  if (!feature) {
    return 'No ideOS feature state yet. Create one with `ideos checkpoint <feature> --summary "...".`'
  }
  
  const featureCheckpoints = state.checkpoints.filter((c) => c.feature_id === feature.id)
  const latest = featureCheckpoints[0]
  
  const done = featureCheckpoints.flatMap((c) => c.summary ? [c.summary] : []).slice(0, 3)
  const remaining = featureCheckpoints.flatMap((c) => c.next_steps || []).slice(0, 4)
  const blockers = featureCheckpoints.flatMap((c) => c.blockers || []).slice(0, 3)
  const files = [...new Set(featureCheckpoints.flatMap((c) => c.files_touched || []))].slice(0, 6)
  
  const featureDecisions = state.decisions.filter((d) => d.feature_id === feature.id || d.feature_id == null).slice(0, 4)
  const decisions = featureDecisions.map((d) => `${d.key}: ${d.value}`)
  
  const others = state.features.filter((f) => f.id !== feature.id).slice(0, 6)
  const otherLines = others.map((item) => {
    const workers = state.active_workers.filter((w) => w.current_feature === item.id)
    let workerStr = 'unclaimed'
    if (workers.length > 0) {
      const activeWorkers = workers.filter(w => workerStatus(w) !== 'inactive')
      if (activeWorkers.length > 0) {
        const primary = activeWorkers.sort((a, b) => {
          const tA = new Date(a.last_heartbeat || a.last_file_activity || a.last_git_activity || 0).getTime()
          const tB = new Date(b.last_heartbeat || b.last_file_activity || b.last_git_activity || 0).getTime()
          return tB - tA
        })[0]
        const statusText = workerStatus(primary) === 'active' ? 'active now' : 'likely active'
        workerStr = `${titleFromId(primary.ide)} · ${primary.name} · ${statusText}`
      } else {
        const primary = workers.sort((a, b) => {
          const tA = new Date(a.last_heartbeat || a.last_file_activity || a.last_git_activity || 0).getTime()
          const tB = new Date(b.last_heartbeat || b.last_file_activity || b.last_git_activity || 0).getTime()
          return tB - tA
        })[0]
        workerStr = `${titleFromId(primary.ide)} · ${primary.name} · inactive`
      }
    }
    return `  ○ ${pad(item.name, 18)} ${workerStr}`
  })
  
  const lastSessionStr = lastSession
    ? `Last session: ${titleFromId(lastSession.ide)} · ${ago(lastSession.ended_at || lastSession.started_at)} · ${duration(lastSession.started_at, lastSession.ended_at)}`
    : 'Last session: none recorded'
    
  return [
    `  ${lastSessionStr}`,
    '',
    `  Feature: ${feature.name}`,
    `  ─────────────────────────────────────────`,
    `  Progress:   ${latest?.progress ?? 0}% complete`,
    `  Done:       ${done.join(', ') || 'No checkpoints yet'}`,
    `  Remaining:  ${remaining.join(', ') || 'No next steps recorded'}`,
    `  Blockers:   ${blockers.join(', ') || 'None recorded'}`,
    `  Files:      ${files.join(', ') || 'None recorded'}`,
    `  Decisions:  ${decisions.join(' · ') || 'None recorded'}`,
    '',
    '  Other features:',
    ...otherLines,
    '',
    '  Open in:',
    '  ❯ Cursor',
    '    Windsurf',
    '    KiloCode'
  ].join('\n')
}

export async function renderHandoff(store, query) {
  const feature = findFeature(store, query)
  if (!feature) return `Feature not found: ${query}`
  const summary = featureSummary(store, feature)
  const workers = store.db.prepare('SELECT * FROM workers WHERE current_feature = ? ORDER BY last_heartbeat DESC').all(feature.id)
  const llm = await synthesizeHandoff({ ...summary, workers })
  if (llm?.brief) return llm.brief
  return renderExplain(store, query)
}

export function renderExplain(stateOrStore, query) {
  const state = normalizeState(stateOrStore.db ? getLocalState(stateOrStore) : stateOrStore)
  const feature = state.features.find((f) => f.id === query || f.name.toLowerCase() === String(query).toLowerCase())
  if (!feature) return `Feature not found: ${query}`
  
  const checkpoints = state.checkpoints.filter((c) => c.feature_id === feature.id)
  const latest = checkpoints[0]
  
  const decisions = state.decisions.filter((d) => d.feature_id === feature.id || d.feature_id == null)
  const workers = state.active_workers.filter((w) => w.current_feature === feature.id)
  const files = [...new Set(checkpoints.flatMap((c) => c.files_touched || []))].slice(0, 12)
  
  const completed = checkpoints.slice(0, 8).map((c) => `→ ${c.summary}`)
  const remaining = unique(checkpoints.flatMap((c) => c.next_steps || [])).map((step) => `→ ${step}`)
  const decisionLines = decisions.map((d) => `→ ${pad(d.key, 22)} ${d.value}`)
  
  let statusStr = 'Planning'
  if (feature.status === 'active') statusStr = 'In Progress'
  else if (feature.status === 'done') statusStr = 'Completed'
  else if (feature.status === 'blocked') statusStr = 'Blocked'
  
  const activeWorkersLines = workers.map((worker) => {
    const status = workerStatus(worker)
    const timeDetail = status === 'inactive'
      ? 'idle'
      : `last active ${ago(worker.last_heartbeat || worker.last_file_activity || worker.last_git_activity)}`
    return `${statusMark(status)} ${titleFromId(worker.ide)} (${worker.name})   ${timeDetail}`
  })
  
  return [
    `  Feature: ${feature.name}`,
    `  Status:  ${statusStr} · ${latest?.progress ?? 0}%`,
    '',
    '  Goal',
    `  ${feature.description || 'No goal recorded yet.'}`,
    '',
    '  Active Workers',
    ...(activeWorkersLines.length ? activeWorkersLines.map(line => `  ${line}`) : ['  ○ none']),
    '',
    '  Completed',
    ...(completed.length ? completed.map(line => `  ${line}`) : ['  → none recorded']),
    '',
    '  Remaining',
    ...(remaining.length ? remaining.map(line => `  ${line}`) : ['  → none recorded']),
    '',
    '  Decisions',
    ...(decisionLines.length ? decisionLines.map(line => `  ${line}`) : ['  → none recorded']),
    '',
    '  Files Touched',
    `  ${files.join(' · ') || 'none recorded'}`
  ].join('\n')
}

export function renderTimeline(stateOrStore, query) {
  const state = normalizeState(stateOrStore.db ? getLocalState(stateOrStore) : stateOrStore)
  const feature = state.features.find((f) => f.id === query || f.name.toLowerCase() === String(query).toLowerCase())
  if (!feature) return `Feature not found: ${query}`
  
  const featureSessions = state.sessions.filter((s) => s.feature_id === feature.id)
  const featureCheckpoints = state.checkpoints.filter((c) => c.feature_id === feature.id)
  const featureDecisions = state.decisions.filter((d) => d.feature_id === feature.id)
  
  const events = []
  
  for (const s of featureSessions) {
    const worker = state.active_workers.find((w) => w.id === s.worker_id)
    const workerName = worker ? worker.name : 'developer'
    events.push({
      at: s.started_at,
      type: 'session_start',
      leftText: `${titleFromId(s.ide)} · ${workerName}`,
      rightText: 'session started'
    })
    if (s.ended_at) {
      events.push({
        at: s.ended_at,
        type: 'session_end',
        leftText: '─ session ended',
        rightText: duration(s.started_at, s.ended_at)
      })
    }
  }
  
  for (const c of featureCheckpoints) {
    events.push({
      at: c.created_at,
      type: 'checkpoint',
      leftText: '─ checkpoint',
      rightText: c.summary
    })
  }
  
  for (const d of featureDecisions) {
    events.push({
      at: d.created_at,
      type: 'decision',
      leftText: '─ decision',
      rightText: d.key
    })
  }
  
  events.sort((a, b) => a.at.localeCompare(b.at))
  
  if (events.length === 0) {
    return [
      `  ${feature.name} · Development Timeline`,
      '',
      '  No timeline events yet.'
    ].join('\n')
  }
  
  const days = {}
  for (const event of events) {
    const d = new Date(event.at)
    if (Number.isNaN(d.getTime())) continue
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
    if (!days[dateStr]) days[dateStr] = []
    days[dateStr].push(event)
  }
  
  const lines = [
    `  ${feature.name} · Development Timeline`,
    ''
  ]
  
  for (const day of Object.keys(days)) {
    lines.push(`  ${day}`)
    for (const event of days[day]) {
      const d = new Date(event.at)
      const timeStr = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
      const leftCol = pad(event.leftText, 23)
      lines.push(`  ${timeStr}  ${leftCol}${event.rightText}`)
    }
    lines.push('')
  }
  
  return lines.join('\n').trimEnd()
}

export function renderDashboard(stateOrStore) {
  const state = normalizeState(stateOrStore.db ? getLocalState(stateOrStore) : stateOrStore)
  const rootDir = stateOrStore.root || process.cwd()
  const projectName = path.basename(rootDir)
  
  const boxWidth = 60
  const top = makeTopBorder(projectName, boxWidth + 4)
  const bottom = `└${'─'.repeat(boxWidth + 2)}┘`
  
  const wrap = (text = '') => `│ ${pad(text, boxWidth)} │`
  
  const activeWorkerLines = state.active_workers.map((worker) => {
    const status = workerStatus(worker)
    let featureText = 'idle'
    let detailText = ''
    
    if (worker.current_feature) {
      const feat = state.features.find((f) => f.id === worker.current_feature)
      featureText = feat ? feat.name.toLowerCase() : worker.current_feature
      detailText = '(claimed)'
    } else {
      const lastTime = new Date(worker.last_heartbeat || worker.last_file_activity || worker.last_git_activity || 0).getTime()
      if (Date.now() - lastTime < 600000) {
        const haystack = `${worker.last_file_activity} ${worker.last_git_activity}`.toLowerCase()
        let best = null
        for (const feature of state.features) {
          const tokens = new Set([feature.id, feature.name, ...(feature.description || '').split(/\W+/)].map((v) => String(v).toLowerCase()).filter(Boolean))
          const matches = [...tokens].filter((token) => token.length > 2 && haystack.includes(token)).length
          const score = matches / Math.max(3, tokens.size)
          if (!best || score > best.confidence) best = { feature, confidence: score }
        }
        if (best && best.confidence > 0) {
          featureText = best.feature.id
          detailText = `(inferred ${Math.round((best.confidence + 0.45) * 100)}%)`
        }
      }
    }
    
    const lastTime = new Date(worker.last_heartbeat || worker.last_file_activity || worker.last_git_activity || 0).getTime()
    const diffSec = Math.max(0, Math.floor((Date.now() - lastTime) / 1000))
    let timeStr = ''
    if (diffSec < 60) timeStr = `${diffSec}s`
    else if (diffSec < 3600) timeStr = `${Math.floor(diffSec / 60)}m`
    else timeStr = `${Math.floor(diffSec / 3600)}h`
    
    return `${statusMark(status)} ${pad(titleFromId(worker.ide), 10)} ${pad(featureText, 16)} ${pad(detailText, 18)} ${timeStr.padStart(5)}`
  })
  
  const overlapWarning = getOverlapWarning(state)
  
  const featureLines = state.features.slice(0, 6).map((feature) => {
    const workers = state.active_workers.filter((w) => w.current_feature === feature.id)
    const activeWorkers = workers.filter(w => workerStatus(w) !== 'inactive')
    const primaryWorker = activeWorkers[0] || workers[0]
    
    let claimStr = 'unclaimed'
    let symbol = '○ '
    if (primaryWorker) {
      symbol = '🔒'
      claimStr = `${titleFromId(primaryWorker.ide)} · ${feature.progress}%`
    }
    
    let statusText = 'unclaimed'
    if (primaryWorker) {
      if (feature.status === 'blocked') statusText = 'blocked'
      else if (feature.status === 'planning') statusText = 'planning'
      else statusText = 'in progress'
    }
    
    return `${symbol} ${pad(feature.id, 18)} ${pad(claimStr, 18)} ${statusText}`
  })
  
  const decisionLines = state.decisions.slice(0, 4).map((decision) => {
    return `${pad(decision.key, 16)} → ${decision.value}`
  })
  
  const latestCheckpoint = state.checkpoints[0]
  const lastSnapshotStr = latestCheckpoint ? ago(latestCheckpoint.created_at) : 'none'
  
  const lines = [
    top,
    wrap(''),
    wrap('  Active'),
    ...activeWorkerLines.map(line => wrap('  ' + line)),
    wrap(''),
    overlapWarning ? wrap('  ' + overlapWarning) : null,
    overlapWarning ? wrap('') : null,
    wrap('  Features'),
    ...featureLines.map(line => wrap('  ' + line)),
    wrap(''),
    wrap('  Decisions'),
    ...decisionLines.map(line => wrap('  ' + line)),
    wrap(''),
    wrap(`  Last snapshot: ${lastSnapshotStr} ago`),
    wrap(''),
    wrap('  [e] explain  [t] timeline  [r] resume  [q] quit'),
    bottom
  ].filter(line => line !== null)
  
  return lines.join('\n')
}

function makeTopBorder(projectName, width = 64) {
  const prefix = '┌─ ideOS ──'
  const suffix = '─┐'
  const name = ` ${projectName} `
  const remaining = width - prefix.length - suffix.length - name.length
  if (remaining < 2) {
    return `┌─ ideOS ─ ${projectName} ─┐`
  }
  const half = Math.floor(remaining / 2)
  const leftDash = '─'.repeat(half)
  const rightDash = '─'.repeat(remaining - half)
  return `${prefix}${leftDash}${name}${rightDash}${suffix}`
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function pad(value, width) {
  const text = String(value ?? '')
  return text.length > width ? text.slice(0, width - 1) + '…' : text.padEnd(width)
}
