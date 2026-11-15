import React, { useState, useEffect, useMemo } from 'react'
import { render, Box, Text, useApp, useInput, useStdout } from 'ink'
import { openStore, exportState } from './db.js'
import { getLocalState, getOverlapWarning } from './render.js'
import { cloudCall, useCloudBackend } from './cloud-client.js'
import { workerStatus, statusMark } from './status.js'
import { titleFromId } from './db.js'
import { ago, duration } from './time.js'
import path from 'node:path'

// ── Color Palette ──────────────────────────────────────────────
const C = {
  brand:      '#c084fc',   // purple-400
  brandDim:   '#7c3aed',   // purple-600
  green:      '#4ade80',   // green-400
  greenDim:   '#16a34a',   // green-600
  yellow:     '#facc15',   // yellow-400
  yellowDim:  '#ca8a04',   // yellow-600
  red:        '#f87171',   // red-400
  blue:       '#60a5fa',   // blue-400
  cyan:       '#22d3ee',   // cyan-400
  dim:        '#6b7280',   // gray-500
  dimmer:     '#4b5563',   // gray-600
  text:       '#e5e7eb',   // gray-200
  textBright: '#f9fafb',   // gray-50
  muted:      '#9ca3af',   // gray-400
  bg:         '#111827',   // gray-900
}

function statusColor(status) {
  if (status === 'active') return C.green
  if (status === 'likely_active') return C.yellow
  return C.dim
}

function featureStatusColor(status) {
  if (status === 'done') return C.green
  if (status === 'active') return C.blue
  if (status === 'blocked') return C.red
  return C.dim
}

function progressBar(pct, width = 16) {
  const clamped = Math.max(0, Math.min(100, pct))
  const filled = Math.round((clamped / 100) * width)
  const empty = width - filled
  const color = clamped >= 80 ? C.green : clamped >= 40 ? C.yellow : C.red
  return { filled: '█'.repeat(filled), empty: '░'.repeat(empty), color }
}

// ── Data fetching ──────────────────────────────────────────────
function normalizeState(raw) {
  const checkpoints = (raw.checkpoints || []).map(c => {
    let files_touched = c.files_touched || []
    if (typeof files_touched === 'string') { try { files_touched = JSON.parse(files_touched) } catch { files_touched = [] } }
    let blockers = c.blockers || []
    if (typeof blockers === 'string') { try { blockers = JSON.parse(blockers) } catch { blockers = [] } }
    let next_steps = c.next_steps || c.nextSteps || []
    if (typeof next_steps === 'string') { try { next_steps = JSON.parse(next_steps) } catch { next_steps = [] } }
    return { ...c, files_touched, blockers, next_steps }
  })
  const features = (raw.features || []).map(f => {
    let progress = f.progress
    if (progress === undefined) {
      const latest = checkpoints.find(c => c.feature_id === f.id)
      progress = latest ? latest.progress : 0
    }
    return { ...f, progress }
  })
  return {
    ...raw,
    features,
    checkpoints,
    decisions: raw.decisions || [],
    sessions: raw.sessions || [],
    active_workers: raw.active_workers || []
  }
}

function fetchState(root) {
  if (useCloudBackend()) {
    return cloudCall('/state').then(normalizeState)
  }
  const store = openStore(root)
  try {
    return normalizeState(getLocalState(store))
  } finally {
    store.db.close()
  }
}

// ── Sub-Components ─────────────────────────────────────────────

function Header({ projectName, tick }) {
  const dots = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const spinner = dots[tick % dots.length]
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={C.brand} bold>{'┌─ ideOS '}</Text>
        <Text color={C.brandDim}>{'── '}</Text>
        <Text color={C.textBright} bold>{projectName}</Text>
        <Text color={C.brandDim}>{' ──────────────────────────────────────'}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={C.cyan}>{spinner} </Text>
        <Text color={C.dim}>{'Live · refreshing every 3s'}</Text>
      </Box>
    </Box>
  )
}

function WorkersPanel({ workers }) {
  if (!workers || workers.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1} marginLeft={2}>
        <Text color={C.brand} bold>{'⚡ Active Workers'}</Text>
        <Box marginLeft={2}><Text color={C.dim}>{'No active workers.'}</Text></Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      <Text color={C.brand} bold>{'⚡ Active Workers'}</Text>
      {workers.map((w, i) => {
        const status = workerStatus(w)
        const color = statusColor(status)
        const lastTime = new Date(w.last_heartbeat || w.last_file_activity || w.last_git_activity || 0).getTime()
        const diffSec = Math.max(0, Math.floor((Date.now() - lastTime) / 1000))
        let timeStr = ''
        if (diffSec < 60) timeStr = `${diffSec}s`
        else if (diffSec < 3600) timeStr = `${Math.floor(diffSec / 60)}m`
        else timeStr = `${Math.floor(diffSec / 3600)}h`
        const feature = w.current_feature || 'idle'
        return (
          <Box key={i} marginLeft={2}>
            <Text color={color}>{statusMark(status)} </Text>
            <Text color={C.textBright} bold>{pad(titleFromId(w.ide), 12)}</Text>
            <Text color={C.muted}>{pad(w.name || 'dev', 10)}</Text>
            <Text color={C.cyan}>{pad(feature, 20)}</Text>
            <Text color={C.dim}>{timeStr}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

function FeaturesPanel({ features, selectedIdx, workers }) {
  if (!features || features.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1} marginLeft={2}>
        <Text color={C.brand} bold>{'📋 Features'}</Text>
        <Box marginLeft={2}><Text color={C.dim}>{'No features tracked yet. Run '}<Text color={C.cyan} bold>ideos import</Text>{' or '}<Text color={C.cyan} bold>ideos checkpoint</Text></Text></Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      <Text color={C.brand} bold>{'📋 Features'}</Text>
      <Box marginLeft={2}>
        <Text color={C.dimmer}>{pad('', 2)}{pad('Feature', 22)}{pad('Progress', 22)}{pad('Owner', 14)}{'Status'}</Text>
      </Box>
      {features.slice(0, 8).map((f, i) => {
        const bar = progressBar(f.progress)
        const isSelected = i === selectedIdx
        const pointer = isSelected ? '❯' : ' '
        const pointerColor = isSelected ? C.cyan : C.dim

        const worker = (workers || []).find(w => w.current_feature === f.id)
        const owner = worker ? titleFromId(worker.ide) : 'unclaimed'
        const ownerColor = worker ? C.cyan : C.dim

        let statusText = f.status || 'planning'
        const sColor = featureStatusColor(statusText)

        return (
          <Box key={i} marginLeft={2}>
            <Text color={pointerColor} bold>{pointer} </Text>
            <Text color={isSelected ? C.textBright : C.text} bold={isSelected}>{pad(f.name || f.id, 22)}</Text>
            <Text color={bar.color}>{bar.filled}</Text>
            <Text color={C.dimmer}>{bar.empty}</Text>
            <Text color={C.muted}>{` ${String(f.progress).padStart(3)}% `}</Text>
            <Text color={ownerColor}>{pad(owner, 14)}</Text>
            <Text color={sColor}>{statusText}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

function DecisionsPanel({ decisions }) {
  if (!decisions || decisions.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1} marginLeft={2}>
        <Text color={C.brand} bold>{'💡 Decisions'}</Text>
        <Box marginLeft={2}><Text color={C.dim}>{'No decisions recorded.'}</Text></Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      <Text color={C.brand} bold>{'💡 Decisions'}</Text>
      {decisions.slice(0, 5).map((d, i) => (
        <Box key={i} marginLeft={2}>
          <Text color={C.yellow}>{pad(d.key, 20)}</Text>
          <Text color={C.dim}>{'→ '}</Text>
          <Text color={C.text}>{d.value}</Text>
        </Box>
      ))}
    </Box>
  )
}

function WarningPanel({ warning }) {
  if (!warning) return null
  return (
    <Box marginLeft={2} marginBottom={1}>
      <Text color={C.red} bold>{'⚠  '}</Text>
      <Text color={C.yellow}>{warning}</Text>
    </Box>
  )
}

function SnapshotInfo({ checkpoints }) {
  const latest = checkpoints?.[0]
  const str = latest ? ago(latest.created_at) : 'none'
  return (
    <Box marginLeft={2} marginBottom={1}>
      <Text color={C.dim}>{'Last snapshot: '}</Text>
      <Text color={latest ? C.muted : C.dim}>{str}</Text>
      <Text color={C.dim}>{'  ·  '}</Text>
      <Text color={C.dim}>{`${checkpoints?.length || 0} total checkpoints`}</Text>
    </Box>
  )
}

function Footer({ view }) {
  if (view === 'main') {
    return (
      <Box marginLeft={2} marginTop={1}>
        <Text color={C.brandDim}>{'─'.repeat(56)}</Text>
        <Text>{'\n'}</Text>
        <Text color={C.dim}>{'  '}</Text>
        <Text color={C.cyan} bold>↑↓</Text><Text color={C.dim}>{' navigate  '}</Text>
        <Text color={C.cyan} bold>Enter</Text><Text color={C.dim}>{' explain  '}</Text>
        <Text color={C.cyan} bold>t</Text><Text color={C.dim}>{' timeline  '}</Text>
        <Text color={C.cyan} bold>r</Text><Text color={C.dim}>{' resume  '}</Text>
        <Text color={C.cyan} bold>q</Text><Text color={C.dim}>{' quit'}</Text>
      </Box>
    )
  }
  return (
    <Box marginLeft={2} marginTop={1}>
      <Text color={C.brandDim}>{'─'.repeat(56)}</Text>
      <Text>{'\n'}</Text>
      <Text color={C.dim}>{'  '}</Text>
      <Text color={C.cyan} bold>Esc</Text><Text color={C.dim}>{' back  '}</Text>
      <Text color={C.cyan} bold>q</Text><Text color={C.dim}>{' quit'}</Text>
    </Box>
  )
}

// ── Explain View ───────────────────────────────────────────────
function ExplainView({ feature, state }) {
  if (!feature) {
    return <Box marginLeft={2}><Text color={C.dim}>Feature not found.</Text></Box>
  }
  const checkpoints = state.checkpoints.filter(c => c.feature_id === feature.id)
  const latest = checkpoints[0]
  const decisions = state.decisions.filter(d => d.feature_id === feature.id || d.feature_id == null)
  const workers = state.active_workers.filter(w => w.current_feature === feature.id)
  const files = [...new Set(checkpoints.flatMap(c => c.files_touched || []))].slice(0, 12)
  const remaining = feature.status === 'done'
    ? []
    : [...new Set(checkpoints.flatMap(c => c.next_steps || []))].filter(Boolean)
  const blockers = [...new Set(checkpoints.flatMap(c => c.blockers || []))].filter(Boolean)

  const bar = progressBar(latest?.progress ?? 0, 20)

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box marginBottom={1}>
        <Text color={C.brand} bold>{'🔍 '}</Text>
        <Text color={C.textBright} bold>{feature.name || feature.id}</Text>
        <Text color={C.dim}>{`  (${feature.id})`}</Text>
      </Box>

      <Box marginLeft={2} marginBottom={1}>
        <Text color={C.dim}>Status: </Text>
        <Text color={featureStatusColor(feature.status)} bold>{feature.status || 'planning'}</Text>
        <Text color={C.dim}>  ·  </Text>
        <Text color={bar.color}>{bar.filled}</Text>
        <Text color={C.dimmer}>{bar.empty}</Text>
        <Text color={C.muted}>{` ${latest?.progress ?? 0}%`}</Text>
      </Box>

      {feature.description && (
        <Box marginLeft={2} marginBottom={1}>
          <Text color={C.dim}>Goal: </Text>
          <Text color={C.text}>{feature.description}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginLeft={2} marginBottom={1}>
        <Text color={C.yellow} bold>Workers</Text>
        {workers.length === 0
          ? <Box marginLeft={1}><Text color={C.dim}>none assigned</Text></Box>
          : workers.map((w, i) => {
              const s = workerStatus(w)
              return (
                <Box key={i} marginLeft={1}>
                  <Text color={statusColor(s)}>{statusMark(s)} </Text>
                  <Text color={C.text}>{titleFromId(w.ide)} ({w.name})</Text>
                  <Text color={C.dim}>{`  ${ago(w.last_heartbeat || w.last_file_activity || w.last_git_activity)}`}</Text>
                </Box>
              )
            })
        }
      </Box>

      <Box flexDirection="column" marginLeft={2} marginBottom={1}>
        <Text color={C.green} bold>Completed</Text>
        {checkpoints.slice(0, 6).map((c, i) => (
          <Box key={i} marginLeft={1}><Text color={C.dim}>→ </Text><Text color={C.text}>{c.summary}</Text></Box>
        ))}
        {checkpoints.length === 0 && <Box marginLeft={1}><Text color={C.dim}>none recorded</Text></Box>}
      </Box>

      {remaining.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Text color={C.cyan} bold>Remaining</Text>
          {remaining.slice(0, 5).map((s, i) => (
            <Box key={i} marginLeft={1}><Text color={C.dim}>→ </Text><Text color={C.text}>{s}</Text></Box>
          ))}
        </Box>
      )}

      {blockers.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Text color={C.red} bold>Blockers</Text>
          {blockers.map((b, i) => (
            <Box key={i} marginLeft={1}><Text color={C.red}>! </Text><Text color={C.text}>{b}</Text></Box>
          ))}
        </Box>
      )}

      {decisions.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Text color={C.yellow} bold>Decisions</Text>
          {decisions.slice(0, 5).map((d, i) => (
            <Box key={i} marginLeft={1}>
              <Text color={C.yellow}>{pad(d.key, 18)}</Text>
              <Text color={C.dim}>→ </Text>
              <Text color={C.text}>{d.value}</Text>
            </Box>
          ))}
        </Box>
      )}

      {files.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Text color={C.blue} bold>Files Touched</Text>
          <Box marginLeft={1}><Text color={C.dim}>{files.join('  ·  ')}</Text></Box>
        </Box>
      )}
    </Box>
  )
}

// ── Timeline View ──────────────────────────────────────────────
function TimelineView({ feature, state }) {
  if (!feature) {
    return <Box marginLeft={2}><Text color={C.dim}>Feature not found.</Text></Box>
  }
  const sessions = state.sessions.filter(s => s.feature_id === feature.id)
  const checkpoints = state.checkpoints.filter(c => c.feature_id === feature.id)
  const decisions = state.decisions.filter(d => d.feature_id === feature.id)

  const events = []
  for (const s of sessions) {
    events.push({ at: s.started_at, type: 'session', text: `${titleFromId(s.ide)} session started`, color: C.blue })
    if (s.ended_at) events.push({ at: s.ended_at, type: 'session_end', text: `session ended (${duration(s.started_at, s.ended_at)})`, color: C.dim })
  }
  for (const c of checkpoints) {
    events.push({ at: c.created_at, type: 'checkpoint', text: c.summary, color: C.green })
  }
  for (const d of decisions) {
    events.push({ at: d.created_at, type: 'decision', text: `${d.key}: ${d.value}`, color: C.yellow })
  }
  events.sort((a, b) => a.at.localeCompare(b.at))

  if (events.length === 0) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text color={C.brand} bold>{'📅 '}{feature.name} · Timeline</Text>
        <Box marginLeft={2}><Text color={C.dim}>No events yet.</Text></Box>
      </Box>
    )
  }

  // Group by day
  const days = {}
  for (const e of events) {
    const d = new Date(e.at)
    if (Number.isNaN(d.getTime())) continue
    const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
    if (!days[key]) days[key] = []
    days[key].push(e)
  }

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box marginBottom={1}>
        <Text color={C.brand} bold>{'📅 '}</Text>
        <Text color={C.textBright} bold>{feature.name}</Text>
        <Text color={C.dim}>{' · Timeline'}</Text>
      </Box>
      {Object.entries(days).map(([day, events]) => (
        <Box key={day} flexDirection="column" marginBottom={1}>
          <Box marginLeft={1}><Text color={C.muted} bold>{day}</Text></Box>
          {events.map((e, i) => {
            const d = new Date(e.at)
            const time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
            const icon = e.type === 'checkpoint' ? '●' : e.type === 'decision' ? '◆' : '○'
            return (
              <Box key={i} marginLeft={2}>
                <Text color={C.dim}>{time}  </Text>
                <Text color={e.color}>{icon} </Text>
                <Text color={C.text}>{e.text}</Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
function Dashboard({ root }) {
  const { exit } = useApp()
  const projectName = path.basename(root)
  const [state, setState] = useState(null)
  const [tick, setTick] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [view, setView] = useState('main')  // main | explain | timeline
  const [viewFeature, setViewFeature] = useState(null)

  // Fetch state
  useEffect(() => {
    const load = async () => {
      try {
        const s = await fetchState(root)
        setState(s)
      } catch (err) {
        // silently retry on next tick
      }
    }
    load()
    const interval = setInterval(() => {
      load()
      setTick(t => t + 1)
    }, 3000)
    return () => clearInterval(interval)
  }, [root])

  // Keyboard input
  useInput((input, key) => {
    if (input === 'q') {
      exit()
      return
    }

    if (view !== 'main') {
      if (key.escape || input === 'b') {
        setView('main')
        setViewFeature(null)
      }
      return
    }

    const featureCount = state?.features?.length || 0

    if (key.upArrow) {
      setSelectedIdx(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIdx(i => Math.min(featureCount - 1, i + 1))
    } else if (key.return) {
      if (featureCount > 0) {
        setViewFeature(state.features[selectedIdx])
        setView('explain')
      }
    } else if (input === 't') {
      if (featureCount > 0) {
        setViewFeature(state.features[selectedIdx])
        setView('timeline')
      }
    } else if (input === 'r') {
      if (featureCount > 0) {
        setViewFeature(state.features[selectedIdx])
        setView('explain')
      }
    }
  })

  if (!state) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text color={C.brand} bold>ideOS</Text>
        <Text color={C.dim}>Loading workspace state...</Text>
      </Box>
    )
  }

  const overlapWarning = getOverlapWarning(state)

  if (view === 'explain') {
    return (
      <Box flexDirection="column">
        <Header projectName={projectName} tick={tick} />
        <ExplainView feature={viewFeature} state={state} />
        <Footer view="detail" />
      </Box>
    )
  }

  if (view === 'timeline') {
    return (
      <Box flexDirection="column">
        <Header projectName={projectName} tick={tick} />
        <TimelineView feature={viewFeature} state={state} />
        <Footer view="detail" />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header projectName={projectName} tick={tick} />
      <WorkersPanel workers={state.active_workers} />
      <FeaturesPanel features={state.features} selectedIdx={selectedIdx} workers={state.active_workers} />
      <DecisionsPanel decisions={state.decisions} />
      <WarningPanel warning={overlapWarning} />
      <SnapshotInfo checkpoints={state.checkpoints} />
      <Footer view="main" />
    </Box>
  )
}

// ── Utilities ──────────────────────────────────────────────────
function pad(text, width) {
  const s = String(text ?? '')
  return s.length > width ? s.slice(0, width - 1) + '…' : s.padEnd(width)
}

// ── Entry Point ────────────────────────────────────────────────
export function launchDashboard(root) {
  const app = render(React.createElement(Dashboard, { root }))
  return app
}
