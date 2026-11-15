import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { homePath, projectRoot, ideosDir } from './paths.js'
import { readJson, writeJson } from './json.js'

const binaryPathCache = new Map()
function isBinaryInPath(binary) {
  if (binaryPathCache.has(binary)) return binaryPathCache.get(binary)
  if (process.platform === 'win32') {
    const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
    const hasExtension = path.extname(binary) !== ''
    const candidates = hasExtension ? [binary] : [binary, ...extensions.map((extension) => `${binary}${extension.toLowerCase()}`)]
    const found = dirs.some((dir) => candidates.some((candidate) => {
      try { return fs.statSync(path.join(dir, candidate)).isFile() } catch { return false }
    }))
    binaryPathCache.set(binary, found)
    return found
  }
  try {
    const result = spawnSync('which', [binary], { stdio: 'ignore' })
    const found = result.status === 0
    binaryPathCache.set(binary, found)
    return found
  } catch {
    binaryPathCache.set(binary, false)
    return false
  }
}

let windowsInstalledNames
function checkWinInstalledName(...names) {
  if (process.platform !== 'win32') return false
  if (!windowsInstalledNames) {
    windowsInstalledNames = []
    const keys = [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ]
    for (const key of keys) {
      const result = spawnSync('reg.exe', ['query', key, '/s'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
      const text = `${result.stdout || ''}\n${result.stderr || ''}`
      for (const match of text.matchAll(/DisplayName\s+REG_SZ\s+(.+)/gi)) windowsInstalledNames.push(match[1].trim().toLowerCase())
    }
  }
  return names.some((name) => windowsInstalledNames.some((item) => item.includes(name.toLowerCase())))
}

function checkDirExists(dir) {
  try {
    return fs.existsSync(dir)
  } catch {
    return false
  }
}

function checkExtensionInstalled(namePattern) {
  const home = os.homedir()
  const dirs = [
    ...['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.trae', '.antigravity', '.qoder']
      .map((editor) => path.join(home, editor, 'extensions'))
  ]
  for (const dir of dirs) {
    if (!checkDirExists(dir)) continue
    try {
      const files = fs.readdirSync(dir)
      if (files.some((f) => f.toLowerCase().includes(namePattern.toLowerCase()))) {
        return true
      }
    } catch {}
  }
  return false
}

function checkWinAppPaths(name, exeNames) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  
  const dirs = [
    path.join(localAppData, 'Programs', name),
    path.join(localAppData, 'Programs', name.toLowerCase()),
    path.join(localAppData, 'Programs', `${name} IDE`),
    path.join(localAppData, 'Programs', `${name.toLowerCase()}-ide`),
    path.join(localAppData, 'OpenAI', name, 'bin'), // For Codex
    path.join(localAppData, 'OpenAI', name),
    path.join(localAppData, name),
    path.join(programFiles, name),
    path.join(programFiles, `${name} IDE`),
    path.join(programFilesX86, name),
    path.join(programFilesX86, `${name} IDE`),
  ]
  
  for (const dir of dirs) {
    if (!checkDirExists(dir)) continue
    for (const exe of exeNames) {
      if (fs.existsSync(path.join(dir, exe))) return true
    }
  }
  return false
}

function mcpConfig(root = projectRoot(), config = {}) {
  const env = config.workspaceEnv === false ? {} : { IDEOS_WORKSPACE: '${workspaceFolder}/.ideos' }
  if (config.backend === 'cloud') {
    env.IDEOS_BACKEND = 'cloud'
    if (config.workspaceUrl) env.IDEOS_WORKSPACE_URL = config.workspaceUrl
  }
  return {
    mcpServers: {
      ideos: {
        command: 'npx',
        args: ['-y', 'ideos-cli', 'mcp'],
        env
      }
    }
  }
}

function mergeFreebuffConfig(root, config = {}) {
  const file = path.join(root, '.agents', 'mcp.json')
  const existing = readJson(file, {})
  const servers = {
    ...(existing.mcpServers || {}),
    ideos: {
      command: 'npx',
      args: ['-y', 'ideos-cli', 'mcp'],
      env: config.backend === 'cloud'
        ? { IDEOS_BACKEND: 'cloud', IDEOS_WORKSPACE_URL: config.workspaceUrl }
        : {}
    }
  }
  writeJson(file, { ...existing, mcpServers: servers })
}

function mergeMcpConfig(file, root, config = {}) {
  const existing = readJson(file, {})
  const servers = {
    ...(existing.mcpServers || {}),
    ...mcpConfig(root, config).mcpServers
  }
  delete servers.scar
  const next = {
    ...existing,
    mcpServers: servers
  }
  writeJson(file, next)
}

function writeRules(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = [
    '# ideOS continuity',
    '',
    '- At the start of a session, call `ideos_workspace()` when MCP is available.',
    '- Call `ideos_heartbeat()` about every 60 seconds while actively working.',
    '- Use `ideos_current_work()` before claiming work.',
    '- Treat Feature as the top-level unit of continuity. Store decisions, checkpoints, sessions, and handoffs under `feature_id`.',
    '- Use `ideos_checkpoint(feature)` after meaningful progress and before stopping.',
    ''
  ].join('\n')
  fs.writeFileSync(file, body)
}

export const adapters = [
  {
    name: 'Cursor',
    id: 'cursor',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.cursor', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.cursor', 'rules'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.cursor')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('cursor')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('cursor', ['Cursor.exe', 'cursor.exe']) || checkWinInstalledName('cursor')
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Cursor.app')
      }
      return fs.existsSync('/usr/share/cursor') || fs.existsSync('/usr/bin/cursor') || fs.existsSync('/opt/cursor')
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Windsurf',
    id: 'windsurf',
    transport: 'stdio',
    configPath: () => homePath('.codeium', 'windsurf', 'mcp_config.json'),
    rulesPath: (root) => path.join(root, '.windsurf', 'rules'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.windsurf')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('windsurf')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Windsurf', ['Windsurf.exe', 'windsurf.exe']) || checkWinInstalledName('windsurf')
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Windsurf.app')
      }
      return false
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'KiloCode',
    id: 'kilocode',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.vscode', 'settings.json'),
    rulesPath: (root) => path.join(root, '.kilocode', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.vscode')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      return checkExtensionInstalled('kilocode')
    },
    install(root, config = {}) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      const servers = {
        ...(existing['mcp.servers'] || {}),
        ideos: mcpConfig(root, config).mcpServers.ideos
      }
      delete servers.scar
      writeJson(file, {
        ...existing,
        'mcp.servers': servers
      })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.['mcp.servers']?.ideos)
    }
  },
  {
    name: 'Codex',
    id: 'codex',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.vscode', 'settings.json'),
    rulesPath: (root) => path.join(root, '.codex', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.vscode')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('codex')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Codex', ['Codex.exe', 'codex.exe']) || checkWinInstalledName('openai codex', 'codex')
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Codex.app')
      }
      return false
    },
    install(root, config = {}) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      const servers = {
        ...(existing['mcp.servers'] || {}),
        ideos: mcpConfig(root, config).mcpServers.ideos
      }
      delete servers.scar
      writeJson(file, {
        ...existing,
        'mcp.servers': servers
      })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.['mcp.servers']?.ideos)
    }
  },
  {
    name: 'Trae',
    id: 'trae',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.trae', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.trae', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.trae')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('trae')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Trae', ['Trae.exe', 'trae.exe']) || checkWinInstalledName('trae')
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Trae.app')
      }
      return false
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Antigravity',
    id: 'antigravity',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.agents', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.antigravity', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.antigravity')) || fs.existsSync(path.join(root, '.agents')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('antigravity') || isBinaryInPath('antigravity-ide')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Antigravity', ['Antigravity.exe', 'antigravity.exe', 'Antigravity IDE.exe']) || checkWinInstalledName('antigravity')
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Antigravity.app')
      }
      return false
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, { ...config, workspaceEnv: false })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Continue',
    id: 'continue',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.continue', 'mcpServers.json'),
    rulesPath: (root) => path.join(root, '.continue', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.continue')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      return checkExtensionInstalled('continue') || checkExtensionInstalled('sharegpt')
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Cline',
    id: 'cline',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.cline', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.cline', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.cline')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      return checkExtensionInstalled('saoudrizwan.claude-dev') || checkExtensionInstalled('saoudrizwan.cline') || checkExtensionInstalled('cline')
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Roo Code',
    id: 'roo-code',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.roo', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.roo', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.roo')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      return checkExtensionInstalled('roocode') || checkExtensionInstalled('roo-cline') || checkExtensionInstalled('roo-code')
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Claude Code',
    id: 'claude-code',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.claude', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.claude', 'CLAUDE.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.claude')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      return isBinaryInPath('claude') || checkWinInstalledName('claude')
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Zed',
    id: 'zed',
    transport: 'stdio',
    configPath: () => {
      if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || homePath('AppData', 'Roaming'), 'Zed', 'settings.json')
      }
      return homePath('.config', 'zed', 'settings.json')
    },
    rulesPath: (root) => path.join(root, '.zed', 'rules'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.zed')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('zed')) return true
      if (process.platform === 'win32') {
        if (checkWinAppPaths('Zed', ['Zed.exe', 'zed.exe']) || checkWinInstalledName('zed')) return true
        return fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'zed.exe'))
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Zed.app')
      }
      return fs.existsSync('/usr/bin/zed')
    },
    install(root, config = {}) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      const servers = {
        ...(existing.context_servers || {}),
        ideos: mcpConfig(root, config).mcpServers.ideos
      }
      delete servers.scar
      writeJson(file, {
        ...existing,
        context_servers: servers
      })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.context_servers?.ideos)
    }
  },
  {
    name: 'QCoder',
    id: 'qcoder',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.mcp.json'),
    rulesPath: (root) => path.join(root, '.qoder', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.qoder')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('qoder') || isBinaryInPath('qcoder')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Qoder', ['Qoder.exe', 'qoder.exe']) || checkWinInstalledName('qoder')
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Qoder.app') || fs.existsSync('/Applications/QCoder.app')
      }
      return false
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Freebuff CLI',
    id: 'freebuff',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.agents', 'mcp.json'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.agents')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('freebuff')) return true
      if (process.platform === 'win32') return checkWinAppPaths('Freebuff', ['freebuff.exe', 'Freebuff.exe'])
      return false
    },
    install(root, config = {}) {
      mergeFreebuffConfig(root, config)
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
    }
  },
  {
    name: 'Freebuff Desktop',
    id: 'freebuff-desktop',
    transport: 'manual',
    configPath: (root) => path.join(root, '.ideos', 'freebuff-desktop-mcp.json'),
    detect(root) { return this.detectSystem() && fs.existsSync(this.configPath(root)) },
    detectSystem() {
      if (process.platform === 'win32') return checkWinAppPaths('Freebuff', ['Freebuff.exe', 'freebuff.exe']) || checkWinInstalledName('freebuff')
      if (process.platform === 'darwin') return fs.existsSync('/Applications/Freebuff.app') || fs.existsSync(path.join(os.homedir(), 'Applications', 'Freebuff.app'))
      return isBinaryInPath('freebuff-desktop') || fs.existsSync('/opt/freebuff/Freebuff')
    },
    install(root, config = {}) {
      const file = this.configPath(root)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const env = config.backend === 'cloud'
        ? { IDEOS_BACKEND: 'cloud', IDEOS_WORKSPACE_URL: config.workspaceUrl }
        : {}
      writeJson(file, { mcpServers: { ideos: { command: 'npx', args: ['-y', 'ideos-cli', 'mcp'], env } } })
    },
    verify(root) { return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos) }
  }
]

export function installAdapters(root, { all = true } = {}) {
  return adapters.map((adapter) => {
    const detected = adapter.detect(root)
    if (all || detected) adapter.install(root)
    return {
      name: adapter.name,
      detected,
      installed: all || detected,
      verified: adapter.verify(root)
    }
  })
}

export function adapterInventory(root) {
  return adapters.map((adapter) => ({
    name: adapter.name,
    id: adapter.id,
    transport: adapter.transport,
    config: adapter.configPath(root),
    detected: adapter.detectSystem(),
    configured: adapter.verify(root),
    projectAdapter: adapter.detect(root)
  }))
}

export function writeAgents(root = projectRoot()) {
  fs.mkdirSync(ideosDir(root), { recursive: true })
  fs.writeFileSync(path.join(ideosDir(root), 'AGENTS.md'), [
    '# ideOS Agent Instructions',
    '',
    'ideOS is the development continuity layer for this project.',
    '',
    '- Feature is the top-level abstraction. Do not organize continuity around tasks or files.',
    '- Call `ideos_workspace()` at session start if MCP is available.',
    '- Call `ideos_heartbeat()` roughly every 60 seconds while actively working.',
    '- Use `ideos_current_work()` to infer the likely feature before claiming.',
    '- Use `ideos_claim(feature)` only after the user or context confirms the feature.',
    '- Store durable decisions with `ideos_remember(key, value, feature?)`.',
    '- Create checkpoints with `ideos_checkpoint(feature)` when progress, blockers, files, or next steps change.',
    '- Before stopping, call `ideos_handoff(feature)` or `ideos_checkpoint(feature)`.',
    ''
  ].join('\n'))
}
