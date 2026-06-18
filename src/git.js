import { execFileSync } from 'node:child_process'

export function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return fallback
  }
}

export function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], '')
}

export function recentFiles(limit = 12) {
  const changed = git(['diff', '--name-only'], '')
    .split(/\r?\n/)
    .filter(Boolean)
  const staged = git(['diff', '--cached', '--name-only'], '')
    .split(/\r?\n/)
    .filter(Boolean)
  const committed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], '')
    .split(/\r?\n/)
    .filter(Boolean)
  return [...new Set([...changed, ...staged, ...committed])].slice(0, limit)
}

export function lastCommitSummary() {
  return git(['log', '-1', '--pretty=%s'], 'working snapshot')
}
