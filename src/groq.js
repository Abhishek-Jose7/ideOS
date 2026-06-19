const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = process.env.SCAR_GROQ_MODEL || 'llama-3.3-70b-versatile'

export function hasGroq() {
  return Boolean(process.env.GROQ_API_KEY)
}

export async function groqJson({ system, user, fallback }) {
  if (!hasGroq()) return fallback
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    })
    if (!response.ok) return fallback
    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    return text ? JSON.parse(text) : fallback
  } catch {
    return fallback
  }
}

export async function classifyCurrentWork({ branch, files, features }) {
  const fallback = null
  return groqJson({
    fallback,
    system: [
      'You classify developer activity into an existing or new product feature.',
      'Feature is the top-level abstraction. Never classify as a task or file.',
      'Return JSON only: {"likely_feature":"feature-id-or-null","confidence":0.0,"signals":["..."],"suggestion":"..."}'
    ].join('\n'),
    user: JSON.stringify({ branch, files, features }, null, 2)
  })
}

export async function synthesizeHandoff({ feature, checkpoints, decisions, sessions, workers }) {
  return groqJson({
    fallback: null,
    system: [
      'You write concise development handoffs for a feature.',
      'Feature is the top-level abstraction. Summarize goal, completed work, remaining work, blockers, decisions, files, and next action.',
      'Return JSON only: {"brief":"markdown text","progress":0,"completed":["..."],"remaining":["..."],"blockers":["..."],"next_action":"..."}'
    ].join('\n'),
    user: JSON.stringify({ feature, checkpoints, decisions, sessions, workers }, null, 2)
  })
}

export async function normalizeDecision({ prompt, key, value, feature, features }) {
  return groqJson({
    fallback: key && value ? { key, value, feature } : null,
    system: [
      'You normalize durable engineering decisions for Scar.',
      'Feature is the top-level abstraction. If a decision belongs to a feature, return that feature id; otherwise null.',
      'Return JSON only: {"key":"short-stable-key","value":"clear decision value","feature":"feature-id-or-null"}'
    ].join('\n'),
    user: JSON.stringify({ prompt, key, value, feature, features }, null, 2)
  })
}

export async function checkFeatureOverlap({ newFeature, features }) {
  const fallback = { duplicate: false, overlap_feature: null, reason: '' }
  return groqJson({
    fallback,
    system: [
      'You analyze whether a newly claimed feature has high semantic overlap/duplication with any existing features.',
      'For example, "login flow" overlaps heavily with "authentication", and "DB schema setup" overlaps with "database migration".',
      'Return JSON only: {"duplicate":true|false,"overlap_feature":"existing-feature-id-or-null","reason":"explanation of overlap"}'
    ].join('\n'),
    user: JSON.stringify({ newFeature, features }, null, 2)
  })
}
