import fs from 'node:fs'
import path from 'node:path'
import { git } from './git.js'
import { groqJson, hasGroq } from './groq.js'
import { idFromName, titleFromId } from './db.js'

/**
 * Analyze an existing repository to understand its current state.
 * Returns structured data about the project: features, architecture, active work.
 */
export async function analyzeRepo(root) {
  const results = {
    features: [],
    decisions: [],
    architecture: {
      languages: [],
      frameworks: [],
      directories: [],
      entryPoints: []
    },
    activeBranches: [],
    todos: [],
    recentHotspots: []
  }

  // 1. Directory structure analysis
  results.architecture.directories = analyzeDirectories(root)

  // 2. Package.json / framework detection
  const pkgAnalysis = analyzePackageJson(root)
  if (pkgAnalysis) {
    results.architecture.frameworks = pkgAnalysis.frameworks
    results.decisions.push(...pkgAnalysis.decisions)
  }

  // 3. Detect languages from file extensions
  results.architecture.languages = detectLanguages(root)

  // 4. Active git branches
  results.activeBranches = detectActiveBranches()

  // 5. TODO/FIXME scanning
  results.todos = scanTodos(root)

  // 6. Recent file change hotspots
  results.recentHotspots = detectHotspots()

  // 7. Read existing docs for context
  const docs = readProjectDocs(root)

  // 8. Cluster into features
  if (hasGroq()) {
    const clustered = await clusterAnalysis({
      directories: results.architecture.directories,
      frameworks: results.architecture.frameworks,
      branches: results.activeBranches,
      todos: results.todos,
      hotspots: results.recentHotspots,
      docs
    })
    if (clustered?.features) {
      results.features = clustered.features
    }
  }

  // Fallback: derive features from branches and directory structure
  if (results.features.length === 0) {
    results.features = deriveFeaturesFallback(results)
  }

  return results
}

// ── 1. Directory structure ──────────────────────────────────────
function analyzeDirectories(root) {
  const dirs = []
  const ignore = new Set(['.git', 'node_modules', '.ideos', '.wrangler', '.next', 'dist', 'build', '__pycache__', '.venv', 'vendor', 'target'])
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') && ignore.has(entry.name)) continue
      if (ignore.has(entry.name)) continue
      const sub = path.join(root, entry.name)
      const files = countFiles(sub, 0)
      dirs.push({ name: entry.name, fileCount: files })
    }
  } catch {}
  return dirs.sort((a, b) => b.fileCount - a.fileCount)
}

function countFiles(dir, depth) {
  if (depth > 3) return 0
  let count = 0
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      if (entry.isFile()) count++
      else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name), depth + 1)
    }
  } catch {}
  return count
}

// ── 2. Package.json analysis ───────────────────────────────────
function analyzePackageJson(root) {
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    // Try other project files
    return analyzePyProject(root) || analyzeGoMod(root) || analyzeCargoToml(root) || null
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const frameworks = []
    const decisions = []
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    // Detect frameworks
    const detectors = [
      { key: 'next', name: 'Next.js' },
      { key: 'react', name: 'React' },
      { key: 'vue', name: 'Vue.js' },
      { key: 'svelte', name: 'Svelte' },
      { key: 'angular', name: 'Angular' },
      { key: 'express', name: 'Express' },
      { key: 'fastify', name: 'Fastify' },
      { key: 'hono', name: 'Hono' },
      { key: 'prisma', name: 'Prisma ORM' },
      { key: 'drizzle-orm', name: 'Drizzle ORM' },
      { key: '@modelcontextprotocol/sdk', name: 'MCP SDK' },
      { key: 'tailwindcss', name: 'Tailwind CSS' },
      { key: 'typescript', name: 'TypeScript' },
      { key: 'jest', name: 'Jest' },
      { key: 'vitest', name: 'Vitest' },
      { key: 'playwright', name: 'Playwright' },
      { key: 'better-sqlite3', name: 'SQLite (better-sqlite3)' },
      { key: 'pg', name: 'PostgreSQL' },
      { key: 'mongoose', name: 'MongoDB (Mongoose)' },
      { key: 'redis', name: 'Redis' },
      { key: 'ink', name: 'Ink (Terminal UI)' },
      { key: 'stripe', name: 'Stripe' },
    ]

    for (const d of detectors) {
      if (deps[d.key] || deps[`@${d.key.split('/')[0]}`]) {
        frameworks.push(d.name)
        decisions.push({
          key: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          value: `${d.name} ${deps[d.key] || 'detected'}`,
          source: 'package.json'
        })
      }
    }

    // Project metadata decisions
    if (pkg.name) decisions.push({ key: 'project-name', value: pkg.name, source: 'package.json' })
    if (pkg.type === 'module') decisions.push({ key: 'module-system', value: 'ES Modules', source: 'package.json' })
    if (pkg.type === 'commonjs' || !pkg.type) decisions.push({ key: 'module-system', value: pkg.type || 'CommonJS (default)', source: 'package.json' })

    // Scripts as decisions
    if (pkg.scripts) {
      const importantScripts = ['dev', 'build', 'start', 'test', 'deploy', 'lint']
      for (const s of importantScripts) {
        if (pkg.scripts[s]) {
          decisions.push({ key: `script-${s}`, value: pkg.scripts[s], source: 'package.json' })
        }
      }
    }

    return { frameworks, decisions }
  } catch { return null }
}

function analyzePyProject(root) {
  for (const f of ['pyproject.toml', 'requirements.txt', 'setup.py']) {
    if (fs.existsSync(path.join(root, f))) {
      const decisions = [{ key: 'language', value: 'Python', source: f }]
      const frameworks = ['Python']
      try {
        const content = fs.readFileSync(path.join(root, f), 'utf8')
        if (content.includes('fastapi')) { frameworks.push('FastAPI'); decisions.push({ key: 'framework', value: 'FastAPI', source: f }) }
        if (content.includes('django')) { frameworks.push('Django'); decisions.push({ key: 'framework', value: 'Django', source: f }) }
        if (content.includes('flask')) { frameworks.push('Flask'); decisions.push({ key: 'framework', value: 'Flask', source: f }) }
      } catch {}
      return { frameworks, decisions }
    }
  }
  return null
}

function analyzeGoMod(root) {
  if (!fs.existsSync(path.join(root, 'go.mod'))) return null
  const decisions = [{ key: 'language', value: 'Go', source: 'go.mod' }]
  return { frameworks: ['Go'], decisions }
}

function analyzeCargoToml(root) {
  if (!fs.existsSync(path.join(root, 'Cargo.toml'))) return null
  const decisions = [{ key: 'language', value: 'Rust', source: 'Cargo.toml' }]
  return { frameworks: ['Rust'], decisions }
}

// ── 3. Language detection ──────────────────────────────────────
function detectLanguages(root) {
  const extMap = {
    '.js': 'JavaScript', '.ts': 'TypeScript', '.jsx': 'React JSX', '.tsx': 'React TSX',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby',
    '.php': 'PHP', '.cs': 'C#', '.swift': 'Swift', '.kt': 'Kotlin',
    '.vue': 'Vue', '.svelte': 'Svelte'
  }
  const found = new Map()
  walkFiles(root, (file) => {
    const ext = path.extname(file)
    if (extMap[ext]) found.set(extMap[ext], (found.get(extMap[ext]) || 0) + 1)
  }, 0)
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([lang, count]) => ({ language: lang, fileCount: count }))
}

function walkFiles(dir, cb, depth) {
  if (depth > 4) return
  const ignore = new Set(['node_modules', '.git', '.ideos', 'dist', 'build', '__pycache__', '.next', 'vendor', 'target', '.wrangler'])
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(entry.name)) continue
      if (entry.name.startsWith('.') && depth === 0) continue
      const full = path.join(dir, entry.name)
      if (entry.isFile()) cb(full)
      else if (entry.isDirectory()) walkFiles(full, cb, depth + 1)
    }
  } catch {}
}

// ── 4. Active git branches ─────────────────────────────────────
function detectActiveBranches() {
  const output = git(['branch', '--list', '--format=%(refname:short)|%(objectname:short)|%(committerdate:iso-strict)|%(subject)'], '')
  if (!output) return []
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const [name, hash, date, subject] = line.split('|')
    return { name, hash, date, subject, isFeatureBranch: /^(feature|feat|fix|hotfix|bugfix)[/-]/.test(name) }
  }).filter(b => b.name !== 'main' && b.name !== 'master')
}

// ── 5. TODO/FIXME scanning ────────────────────────────────────
function scanTodos(root) {
  const todos = []
  const patterns = [/\bTODO\b[:\s]*(.*)/i, /\bFIXME\b[:\s]*(.*)/i, /\bHACK\b[:\s]*(.*)/i, /\bXXX\b[:\s]*(.*)/i]
  walkFiles(root, (file) => {
    try {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
          const match = lines[i].match(pattern)
          if (match) {
            const rel = path.relative(root, file).replaceAll(path.sep, '/')
            todos.push({
              file: rel,
              line: i + 1,
              type: match[0].split(/[:\s]/)[0].toUpperCase(),
              text: match[1]?.trim() || lines[i].trim()
            })
          }
        }
      }
    } catch {}
  }, 0)
  return todos.slice(0, 50)
}

// ── 6. Recent hotspots ─────────────────────────────────────────
function detectHotspots() {
  const output = git(['log', '--pretty=format:', '--name-only', '-20'], '')
  if (!output) return []
  const counts = new Map()
  for (const file of output.split(/\r?\n/).filter(Boolean)) {
    counts.set(file, (counts.get(file) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([file, count]) => ({ file, changeCount: count }))
}

// ── 7. Read project docs ──────────────────────────────────────
function readProjectDocs(root) {
  const docs = {}
  for (const name of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'ARCHITECTURE.md']) {
    const file = path.join(root, name)
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, 'utf8')
        docs[name] = content.slice(0, 3000)  // First 3k chars
      } catch {}
    }
  }
  return docs
}

// ── 8. LLM clustering ─────────────────────────────────────────
async function clusterAnalysis({ directories, frameworks, branches, todos, hotspots, docs }) {
  return groqJson({
    fallback: null,
    system: [
      'You analyze a software project\'s structure to identify logical product features that are either in-progress or need work.',
      'Feature is the top-level abstraction. Consider branches, TODO comments, hot files, and directory structure.',
      'For active branches (feature/*, fix/*), create corresponding features with status "active".',
      'For TODO/FIXME clusters in the same directory area, group them as potential features with status "planning".',
      'Return JSON only:',
      '{',
      '  "features": [',
      '    { "id": "feature-id", "name": "Feature Name", "description": "What this feature is about", "status": "active"|"planning"|"done", "files": ["file1", "file2"], "source": "branch|todos|structure" }',
      '  ]',
      '}'
    ].join('\n'),
    user: JSON.stringify({ directories, frameworks, branches: branches.slice(0, 10), todos: todos.slice(0, 25), hotspots: hotspots.slice(0, 10), docs_available: Object.keys(docs) }, null, 2)
  })
}

// ── Fallback feature derivation ────────────────────────────────
function deriveFeaturesFallback(results) {
  const features = []

  // Feature branches → active features
  for (const branch of results.activeBranches) {
    if (branch.isFeatureBranch) {
      const name = branch.name.replace(/^(feature|feat|fix|hotfix|bugfix)[/-]/, '')
      const id = idFromName(name)
      features.push({
        id,
        name: titleFromId(name),
        description: branch.subject || `Work from branch ${branch.name}`,
        status: 'active',
        files: [],
        source: 'branch'
      })
    }
  }

  // Group TODOs by directory into potential features
  const todoDirs = new Map()
  for (const todo of results.todos) {
    const dir = path.dirname(todo.file).split('/')[0] || 'root'
    if (!todoDirs.has(dir)) todoDirs.set(dir, [])
    todoDirs.get(dir).push(todo)
  }
  for (const [dir, todos] of todoDirs) {
    if (todos.length >= 2) {
      const id = idFromName(`${dir}-improvements`)
      // Don't duplicate if we already have a similar feature
      if (!features.some(f => f.id === id)) {
        features.push({
          id,
          name: titleFromId(`${dir} improvements`),
          description: `${todos.length} TODO/FIXME items in ${dir}/`,
          status: 'planning',
          files: [...new Set(todos.map(t => t.file))],
          source: 'todos'
        })
      }
    }
  }

  // Hot areas as potential features (if no features found yet)
  if (features.length === 0 && results.recentHotspots.length > 0) {
    const hotDirs = new Map()
    for (const h of results.recentHotspots) {
      const dir = path.dirname(h.file).split('/')[0] || 'root'
      if (!hotDirs.has(dir)) hotDirs.set(dir, { count: 0, files: [] })
      const d = hotDirs.get(dir)
      d.count += h.changeCount
      d.files.push(h.file)
    }
    for (const [dir, data] of [...hotDirs.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3)) {
      const id = idFromName(`${dir}-development`)
      features.push({
        id,
        name: titleFromId(`${dir} development`),
        description: `Active development area with ${data.count} recent changes`,
        status: 'active',
        files: data.files,
        source: 'hotspots'
      })
    }
  }

  return features
}
