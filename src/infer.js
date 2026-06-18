import { currentBranch, recentFiles } from './git.js'
import { classifyCurrentWork } from './groq.js'

export function inferFeature(store) {
  const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
  const branch = currentBranch()
  const files = recentFiles()
  return inferFeatureFromSignals({ features, branch, files })
}

export async function inferFeatureSmart(store) {
  const features = store.db.prepare('SELECT * FROM features ORDER BY updated_at DESC').all()
  const branch = currentBranch()
  const files = recentFiles()
  const llm = await classifyCurrentWork({ branch, files, features })
  if (llm && typeof llm.confidence === 'number') {
    const confidence = Math.max(0, Math.min(1, llm.confidence))
    const likely = llm.likely_feature || null
    if (likely && !features.some((feature) => feature.id === likely)) {
      llm.suggestion ||= `Should I create and claim ${likely} for you?`
    }
    return {
      likely_feature: likely,
      confidence,
      signals: Array.isArray(llm.signals) ? llm.signals : [`branch: ${branch || 'unknown'}`, `files: ${files.join(', ') || 'none'}`],
      suggestion: llm.suggestion || (likely ? `Should I claim ${likely} for you?` : 'No strong feature signal yet.')
    }
  }
  return inferFeatureFromSignals({ features, branch, files })
}

function inferFeatureFromSignals({ features, branch, files }) {
  const haystack = `${branch} ${files.join(' ')}`.toLowerCase()
  let best = null
  for (const feature of features) {
    const tokens = new Set([feature.id, feature.name, ...(feature.description || '').split(/\W+/)].map((value) => String(value).toLowerCase()).filter(Boolean))
    const matches = [...tokens].filter((token) => token.length > 2 && haystack.includes(token)).length
    const score = matches / Math.max(3, tokens.size)
    if (!best || score > best.confidence) best = { feature, confidence: score }
  }
  if (!best || best.confidence === 0) {
    const branchFeature = /^(feature|feat)[/-]/.test(branch) ? branch.replace(/^feature[/-]|^feat[/-]/, '') : ''
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
