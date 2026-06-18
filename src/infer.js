import { currentBranch, recentFiles } from './git.js'

export function inferFeature(store) {
  const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
  const branch = currentBranch()
  const files = recentFiles()
  const haystack = `${branch} ${files.join(' ')}`.toLowerCase()
  let best = null
  for (const feature of features) {
    const tokens = new Set([feature.id, feature.name, ...(feature.description || '').split(/\W+/)].map((value) => String(value).toLowerCase()).filter(Boolean))
    const matches = [...tokens].filter((token) => token.length > 2 && haystack.includes(token)).length
    const score = matches / Math.max(3, tokens.size)
    if (!best || score > best.confidence) best = { feature, confidence: score }
  }
  if (!best || best.confidence === 0) {
    const branchFeature = branch.replace(/^feature[/-]|^feat[/-]/, '')
    return {
      likely_feature: branchFeature || null,
      confidence: branchFeature ? 0.55 : 0,
      signals: [`branch: ${branch || 'unknown'}`, `files: ${files.join(', ') || 'none'}`],
      suggestion: branchFeature ? `Should I claim ${branchFeature} for you?` : 'No strong feature signal yet.'
    }
  }
  const confidence = Math.min(0.94, Math.max(0.3, best.confidence + 0.45))
  return {
    likely_feature: best.feature.id,
    confidence,
    signals: [`branch: ${branch || 'unknown'}`, `files: ${files.join(', ') || 'none'}`],
    suggestion: `Should I claim ${best.feature.name} for you?`
  }
}
