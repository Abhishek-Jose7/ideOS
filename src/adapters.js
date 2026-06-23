import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { homePath, projectRoot, ideosDir } from './paths.js'
import { readJson, writeJson } from './json.js'

function isBinaryInPath(binary) {
  try {
    const cmd = process.platform === 'win32' ? `where.exe ${binary}` : `which ${binary}`
    execSync(cmd, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
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
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.cursor', 'extensions')
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
  const env = { IDEOS_WORKSPACE: '${workspaceFolder}/.ideos' }
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
        return checkWinAppPaths('cursor', ['Cursor.exe', 'cursor.exe'])
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
        return checkWinAppPaths('Windsurf', ['Windsurf.exe', 'windsurf.exe'])
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
      if (isBinaryInPath('code')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Microsoft VS Code', ['Code.exe', 'code.exe'])
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Visual Studio Code.app')
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
        return checkWinAppPaths('Codex', ['Codex.exe', 'codex.exe'])
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
        return checkWinAppPaths('Trae', ['Trae.exe', 'trae.exe'])
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
    configPath: (root) => path.join(root, '.antigravity', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.antigravity', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.antigravity')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('antigravity') || isBinaryInPath('antigravity-ide')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Antigravity', ['Antigravity.exe', 'antigravity.exe', 'Antigravity IDE.exe'])
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Antigravity.app')
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
      return isBinaryInPath('claude')
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
        if (checkWinAppPaths('Zed', ['Zed.exe', 'zed.exe'])) return true
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
        return checkWinAppPaths('Qoder', ['Qoder.exe', 'qoder.exe'])
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
    name: 'Antigravity',
    id: 'antigravity',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.antigravity', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.antigravity', 'rules.md'),
    detect(root) {
      return this.detectSystem() && (fs.existsSync(path.join(root, '.antigravity')) || fs.existsSync(this.configPath(root)))
    },
    detectSystem() {
      if (isBinaryInPath('antigravity')) return true
      if (process.platform === 'win32') {
        return checkWinAppPaths('Antigravity', ['Antigravity.exe', 'antigravity.exe']) ||
               checkWinAppPaths('Antigravity IDE', ['Antigravity.exe', 'antigravity.exe'])
      }
      if (process.platform === 'darwin') {
        return fs.existsSync('/Applications/Antigravity.app') || fs.existsSync('/Applications/Antigravity IDE.app')
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
    detected: adapter.detect(root),
    configured: adapter.verify(root)
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
