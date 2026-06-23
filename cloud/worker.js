const jsonHeaders = { 'Content-Type': 'application/json' }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    await ensureSchema(env.DB)

    if (url.pathname === '/health') return json({ ok: true, backend: 'cloud' })
    if (url.pathname === '/state') return json(await state(env.DB))
    if (url.pathname === '/events') return events()
    if (url.pathname === '/tool/current-work') return json(await currentWork(request, env))
    if (url.pathname === '/tool/handoff') return json(await handoff(request, env))
    if (url.pathname === '/tool/claim') return json(await claim(request, env))
    if (url.pathname === '/tool/remember') return json(await remember(request, env))
    if (url.pathname === '/tool/checkpoint') return json(await checkpoint(request, env))
    if (url.pathname === '/tool/file-activity') return json(await fileActivity(request, env))
    if (url.pathname === '/tool/done') return json(await done(request, env))
    if (url.pathname === '/tool/heartbeat') return json(await heartbeat(request, env))
    if (url.pathname === '/tool/explain') return json(await explainFeature(request, env))

    return json({ error: 'Not found' }, 404)
  }
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS features (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT "planning", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, feature_id TEXT NOT NULL, worker_id TEXT, summary TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, files_touched TEXT, blockers TEXT, next_steps TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, feature_id TEXT, key TEXT NOT NULL, value TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, worker_id TEXT, ide TEXT NOT NULL, feature_id TEXT, started_at TEXT NOT NULL, ended_at TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, name TEXT NOT NULL, ide TEXT NOT NULL, last_heartbeat TEXT, last_file_activity TEXT, last_git_activity TEXT, current_feature TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, worker_id TEXT, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT "open", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS task_workers (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT "primary", joined_at TEXT NOT NULL, PRIMARY KEY (task_id, worker_id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS inferences (id TEXT PRIMARY KEY, worker_id TEXT REFERENCES workers(id), likely_feature TEXT REFERENCES features(id), confidence REAL NOT NULL DEFAULT 0, signals TEXT, confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)')
  ])
}

async function state(db) {
  const [features, decisions, checkpoints, sessions, workers, recent_activity] = await Promise.all([
    db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all(),
    db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all(),
    db.prepare('SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM workers ORDER BY COALESCE(last_heartbeat,last_file_activity,last_git_activity) DESC').all(),
    db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50').all()
  ])
  return {
    features: features.results,
    decisions: decisions.results,
    checkpoints: checkpoints.results,
    sessions: sessions.results,
    active_workers: workers.results,
    recent_activity: recent_activity.results
  }
}

async function currentWork(request, env) {
  const input = await request.json().catch(() => ({}))
  const features = (await env.DB.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()).results
  const fallback = localClassify({ features, branch: input.branch || '', files: input.files || [] })
  return groq(env, {
    system: 'Classify work into a feature. Return JSON only: {"likely_feature":"feature-id-or-null","confidence":0.0,"signals":["..."],"suggestion":"..."}',
    user: JSON.stringify({ ...input, features }),
    fallback
  })
}

async function handoff(request, env) {
  const { feature } = await request.json()
  const featureRow = await env.DB.prepare('SELECT * FROM features WHERE id = ?').bind(feature).first()
  if (!featureRow) return { error: 'feature not found' }
  const checkpoints = (await env.DB.prepare('SELECT * FROM checkpoints WHERE feature_id = ? ORDER BY created_at DESC').bind(feature).all()).results
  const decisions = (await env.DB.prepare('SELECT * FROM decisions WHERE feature_id = ? OR feature_id IS NULL ORDER BY created_at DESC').bind(feature).all()).results
  return groq(env, {
    system: 'Write a concise feature handoff. Return JSON only: {"brief":"markdown text","progress":0,"completed":["..."],"remaining":["..."],"blockers":["..."],"next_action":"..."}',
    user: JSON.stringify({ feature: featureRow, checkpoints, decisions }),
    fallback: { brief: `${featureRow.name}\n\n${checkpoints.map((row) => `- ${row.summary}`).join('\n')}` }
  })
}

async function remember(request, env) {
  const input = await request.json()
  const features = (await env.DB.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()).results
  const normalized = await groq(env, {
    system: 'Normalize an engineering decision. Return JSON only: {"key":"short-key","value":"decision","feature":"feature-id-or-null"}',
    user: JSON.stringify({ ...input, features }),
    fallback: { key: input.key, value: input.value, feature: input.feature || null }
  })
  if (!normalized.key || !normalized.value) return { error: 'Prompt-only remember requires GROQ_API_KEY. Or pass explicit key/value.' }
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), normalized.feature || null, normalized.key, normalized.value, input.created_by || 'cloud', now)
    .run()
  return { remembered: normalized.key, value: normalized.value, feature_id: normalized.feature || null }
}

async function claim(request, env) {
  const input = await request.json()
  const now = new Date().toISOString()
  await ensureFeature(env.DB, input.feature, now)
  const features = (await env.DB.prepare('SELECT * FROM features WHERE id <> ?').bind(input.feature).all()).results
  const overlap = await groq(env, {
    system: 'You analyze whether a newly claimed feature has high semantic overlap/duplication with any existing features. Return JSON only: {"duplicate":true|false,"overlap_feature":"existing-feature-id-or-null","reason":"explanation of overlap"}',
    user: JSON.stringify({ newFeature: input.feature, features }),
    fallback: { duplicate: false, overlap_feature: null, reason: '' }
  })
  const ide = input.ide || 'cloud'
  const name = input.name || 'developer'
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
  const conflicts = (await env.DB.prepare('SELECT * FROM workers WHERE current_feature = ? AND id <> ?').bind(input.feature, workerId).all()).results
  await env.DB.prepare('INSERT INTO workers (id, name, ide, last_heartbeat, current_feature) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = excluded.current_feature')
    .bind(workerId, name, ide, now, input.feature)
    .run()
  await env.DB.prepare('INSERT INTO sessions (id, worker_id, ide, feature_id, started_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), workerId, ide, input.feature, now)
    .run()
  return { claimed: input.feature, conflicts, overlap }
}

async function checkpoint(request, env) {
  const input = await request.json()
  const now = new Date().toISOString()
  await ensureFeature(env.DB, input.feature, now)
  await env.DB.prepare('INSERT INTO checkpoints (id, feature_id, worker_id, summary, progress, files_touched, blockers, next_steps, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), input.feature, input.worker_id || null, input.summary, input.progress || 0, JSON.stringify(input.files_touched || []), JSON.stringify(input.blockers || []), JSON.stringify(input.next_steps || []), input.source || 'manual', now)
    .run()
  if (input.source === 'git_hook') {
    const workerId = 'git:post-commit'
    const name = 'git hook'
    const ide = 'git'
    await env.DB.prepare(`
      INSERT INTO workers (id, name, ide, last_git_activity, current_feature)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_git_activity = excluded.last_git_activity, current_feature = COALESCE(excluded.current_feature, workers.current_feature)
    `).bind(workerId, name, ide, now, input.feature || null).run()
  }
  return { saved: true, feature_id: input.feature }
}

async function heartbeat(request, env) {
  const input = await request.json().catch(() => ({}))
  const ide = input.ide || 'cloud'
  const name = input.name || 'developer'
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
  await env.DB.prepare('INSERT INTO workers (id, name, ide, last_heartbeat, current_feature) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = COALESCE(excluded.current_feature, workers.current_feature)')
    .bind(workerId, name, ide, new Date().toISOString(), input.feature || null)
    .run()
  return { heartbeat: true, worker_id: workerId }
}

async function fileActivity(request, env) {
  const input = await request.json().catch(() => ({}))
  const ide = input.ide || 'cloud'
  const name = input.name || 'developer'
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, '-')
  await env.DB.prepare('INSERT INTO workers (id, name, ide, last_file_activity, current_feature) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_file_activity = excluded.last_file_activity, current_feature = COALESCE(excluded.current_feature, workers.current_feature)')
    .bind(workerId, name, ide, new Date().toISOString(), input.feature || null)
    .run()
  return { file_activity: true, worker_id: workerId }
}

async function done(request, env) {
  const input = await request.json()
  const now = new Date().toISOString()
  await ensureFeature(env.DB, input.feature, now)
  await env.DB.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?').bind('done', now, input.feature).run()
  await env.DB.prepare('INSERT INTO checkpoints (id, feature_id, worker_id, summary, progress, files_touched, blockers, next_steps, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), input.feature, null, input.summary || 'Feature complete', 100, '[]', '[]', '[]', 'manual', now)
    .run()
  return { done: input.feature }
}

async function explainFeature(request, env) {
  const { feature } = await request.json()
  const feat = await env.DB.prepare('SELECT * FROM features WHERE id = ? OR lower(name) = lower(?)').bind(feature, feature).first()
  if (!feat) return { error: `Feature not found: ${feature}` }
  const checkpoints = (await env.DB.prepare('SELECT * FROM checkpoints WHERE feature_id = ? ORDER BY created_at DESC').bind(feat.id).all()).results
  const decisions = (await env.DB.prepare('SELECT * FROM decisions WHERE feature_id = ? OR feature_id IS NULL ORDER BY created_at DESC').bind(feat.id).all()).results
  const sessions = (await env.DB.prepare('SELECT * FROM sessions WHERE feature_id = ? ORDER BY started_at DESC').bind(feat.id).all()).results
  const workers = (await env.DB.prepare('SELECT * FROM workers WHERE current_feature = ? ORDER BY last_heartbeat DESC').bind(feat.id).all()).results
  return {
    feature: feat,
    workers,
    checkpoints,
    decisions,
    sessions
  }
}

async function ensureFeature(db, id, now) {
  const name = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  await db.prepare('INSERT INTO features (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at')
    .bind(id, name, '', 'active', now, now)
    .run()
}

async function groq(env, { system, user, fallback }) {
  if (!env.GROQ_API_KEY) return fallback
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.IDEOS_GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  })
  if (!response.ok) return fallback
  const data = await response.json()
  return JSON.parse(data.choices[0].message.content)
}

function localClassify({ features, branch, files }) {
  const haystack = `${branch} ${files.join(' ')}`.toLowerCase()
  const found = features.find((feature) => haystack.includes(feature.id))
  return {
    likely_feature: found?.id || null,
    confidence: found ? 0.75 : 0,
    signals: [`branch: ${branch || 'unknown'}`, `files: ${files.join(', ') || 'none'}`],
    suggestion: found ? `Should I claim ${found.name} for you?` : 'No strong feature signal yet.'
  }
}

function events() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`))
    }
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  })
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: jsonHeaders })
}
