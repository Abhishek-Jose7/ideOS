import { serializeCheckpoint } from './db.js'
import { statusMark, workerStatus } from './status.js'
import { ago, duration } from './time.js'

export function featureSummary(store, feature) {
  const checkpoints = store.db.prepare('SELECT * FROM checkpoints WHERE feature_id = ? ORDER BY created_at DESC').all(feature.id).map(serializeCheckpoint)
  const decisions = store.db.prepare('SELECT * FROM decisions WHERE feature_id = ? OR feature_id IS NULL ORDER BY created_at DESC').all(feature.id)
  const sessions = store.db.prepare('SELECT * FROM sessions WHERE feature_id = ? ORDER BY started_at DESC').all(feature.id)
  const latest = checkpoints[0]
  return { feature, checkpoints, decisions, sessions, latest }
}

export function renderResume(store) {
  const lastSession = store.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1').get()
  const feature = lastSession?.feature_id
    ? store.db.prepare('SELECT * FROM features WHERE id = ?').get(lastSession.feature_id)
    : store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC LIMIT 1').get()
  if (!feature) return 'No Scar feature state yet. Create one with `scar checkpoint <feature> --summary "...".`'
  const summary = featureSummary(store, feature)
  const latest = summary.latest
  const done = summary.checkpoints.flatMap((checkpoint) => checkpoint.summary ? [checkpoint.summary] : []).slice(0, 3)
  const remaining = summary.checkpoints.flatMap((checkpoint) => checkpoint.next_steps).slice(0, 4)
  const blockers = summary.checkpoints.flatMap((checkpoint) => checkpoint.blockers).slice(0, 3)
  const files = [...new Set(summary.checkpoints.flatMap((checkpoint) => checkpoint.files_touched))].slice(0, 6)
  const decisions = summary.decisions.slice(0, 4).map((decision) => `${decision.key}: ${decision.value}`)
  const others = store.db.prepare('SELECT * FROM features WHERE id <> ? ORDER BY updated_at DESC LIMIT 6').all(feature.id)
  return [
    lastSession ? `Last session: ${lastSession.ide} · ${ago(lastSession.ended_at || lastSession.started_at)} · ${duration(lastSession.started_at, lastSession.ended_at)}` : 'Last session: none recorded',
    '',
    `Feature: ${feature.name}`,
    '────────────────────────────────────────',
    `Progress:   ${latest?.progress ?? 0}% complete`,
    `Done:       ${done.join(', ') || 'No checkpoints yet'}`,
    `Remaining:  ${remaining.join(', ') || 'No next steps recorded'}`,
    `Blockers:   ${blockers.join(', ') || 'None recorded'}`,
    `Files:      ${files.join(', ') || 'None recorded'}`,
    `Decisions:  ${decisions.join(' · ') || 'None recorded'}`,
    '',
    'Other features:',
    ...(others.length ? others.map((item) => `○ ${item.name}     ${item.status}`) : ['○ none']),
    '',
    'Open in:',
    '› Cursor',
    '  Windsurf',
    '  KiloCode'
  ].join('\n')
}

export function renderExplain(store, query) {
  const feature = findFeature(store, query)
  if (!feature) return `Feature not found: ${query}`
  const summary = featureSummary(store, feature)
  const workers = store.db.prepare('SELECT * FROM workers WHERE current_feature = ? ORDER BY last_heartbeat DESC').all(feature.id)
  const files = [...new Set(summary.checkpoints.flatMap((checkpoint) => checkpoint.files_touched))].slice(0, 12)
  return [
    `Feature: ${feature.name}`,
    `Status:  ${feature.status} · ${summary.latest?.progress ?? 0}%`,
    '',
    'Goal',
    feature.description || 'No goal recorded yet.',
    '',
    'Active Workers',
    ...(workers.length ? workers.map((worker) => `${statusMark(workerStatus(worker))} ${worker.ide} (${worker.name})   last active ${ago(worker.last_heartbeat || worker.last_file_activity || worker.last_git_activity)}`) : ['○ none']),
    '',
    'Completed',
    ...(summary.checkpoints.length ? summary.checkpoints.slice(0, 8).map((checkpoint) => `→ ${checkpoint.summary}`) : ['→ none recorded']),
    '',
    'Remaining',
    ...unique(summary.checkpoints.flatMap((checkpoint) => checkpoint.next_steps)).map((step) => `→ ${step}`),
    ...(unique(summary.checkpoints.flatMap((checkpoint) => checkpoint.next_steps)).length ? [] : ['→ none recorded']),
    '',
    'Decisions',
    ...(summary.decisions.length ? summary.decisions.map((decision) => `→ ${decision.key}     ${decision.value}`) : ['→ none recorded']),
    '',
    'Files Touched',
    files.join(' · ') || 'none recorded'
  ].join('\n')
}

export function renderTimeline(store, query) {
  const feature = findFeature(store, query)
  if (!feature) return `Feature not found: ${query}`
  const events = [
    ...store.db.prepare("SELECT started_at AS at, ide || ' session started' AS label, '' AS detail FROM sessions WHERE feature_id = ?").all(feature.id),
    ...store.db.prepare("SELECT ended_at AS at, ide || ' session ended' AS label, '' AS detail FROM sessions WHERE feature_id = ? AND ended_at IS NOT NULL").all(feature.id),
    ...store.db.prepare("SELECT created_at AS at, 'checkpoint' AS label, summary AS detail FROM checkpoints WHERE feature_id = ?").all(feature.id),
    ...store.db.prepare("SELECT created_at AS at, 'decision' AS label, key || ': ' || value AS detail FROM decisions WHERE feature_id = ?").all(feature.id)
  ].filter((event) => event.at).sort((a, b) => a.at.localeCompare(b.at))
  return [
    `${feature.name} · Development Timeline`,
    '',
    ...(events.length ? events.map((event) => `${formatShort(event.at)}  ${event.label}${event.detail ? `   ${event.detail}` : ''}`) : ['No timeline events yet.'])
  ].join('\n')
}

export function renderDashboard(store) {
  const workers = store.db.prepare('SELECT * FROM workers ORDER BY COALESCE(last_heartbeat, last_file_activity, last_git_activity) DESC').all()
  const features = store.db.prepare('SELECT f.*, COALESCE(c.progress, 0) AS progress FROM features f LEFT JOIN checkpoints c ON c.id = (SELECT id FROM checkpoints WHERE feature_id = f.id ORDER BY created_at DESC LIMIT 1) ORDER BY f.updated_at DESC').all()
  const decisions = store.db.prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT 5').all()
  return [
    '┌─ Scar ───────────────────────────────┐',
    '│ Active                               │',
    ...(workers.length ? workers.map((worker) => `│ ${statusMark(workerStatus(worker))} ${pad(worker.ide, 10)} ${pad(worker.current_feature || 'idle', 18)} ${pad(ago(worker.last_heartbeat || worker.last_file_activity || worker.last_git_activity), 8)} │`) : ['│ ○ no workers yet                     │']),
    '│                                      │',
    '│ Features                             │',
    ...(features.length ? features.map((feature) => `│ ${feature.status === 'active' ? '🔒' : '○'} ${pad(feature.id, 18)} ${pad(`${feature.progress}%`, 6)} ${pad(feature.status, 11)} │`) : ['│ ○ none                                │']),
    '│                                      │',
    '│ Decisions                            │',
    ...(decisions.length ? decisions.map((decision) => `│ ${pad(decision.key, 12)} → ${pad(decision.value, 18)} │`) : ['│ none recorded                         │']),
    '│                                      │',
    '│ [e] explain  [t] timeline  [r] resume │',
    '└──────────────────────────────────────┘'
  ].join('\n')
}

export function findFeature(store, query) {
  return store.db.prepare('SELECT * FROM features WHERE id = ? OR lower(name) = lower(?)').get(query, query)
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function pad(value, width) {
  const text = String(value ?? '')
  return text.length > width ? text.slice(0, width - 1) + '…' : text.padEnd(width)
}

function formatShort(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
