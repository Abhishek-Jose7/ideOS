import fs from 'node:fs'
import path from 'node:path'
import { homePath, projectRoot, scarDir } from './paths.js'
import { readJson, writeJson } from './json.js'

function mcpConfig(root = projectRoot(), config = {}) {
  const env = { SCAR_WORKSPACE: '${workspaceFolder}/.scar' }
  if (config.backend === 'cloud') {
    env.SCAR_BACKEND = 'cloud'
    if (config.workspaceUrl) env.SCAR_WORKSPACE_URL = config.workspaceUrl
  }
  return {
    mcpServers: {
      scar: {
        command: 'npx',
        args: ['-y', 'scar', 'mcp'],
        env
      }
    }
  }
}

function mergeMcpConfig(file, root, config = {}) {
  const existing = readJson(file, {})
  const next = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      ...mcpConfig(root, config).mcpServers
    }
  }
  writeJson(file, next)
}

function writeRules(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = [
    '# Scar continuity',
    '',
    '- At the start of a session, call `scar_workspace()` when MCP is available.',
    '- Call `scar_heartbeat()` about every 60 seconds while actively working.',
    '- Use `scar_current_work()` before claiming work.',
    '- Treat Feature as the top-level unit of continuity. Store decisions, checkpoints, sessions, and handoffs under `feature_id`.',
    '- Use `scar_checkpoint(feature)` after meaningful progress and before stopping.',
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
      return fs.existsSync(path.join(root, '.cursor')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'Windsurf',
    id: 'windsurf',
    transport: 'stdio',
    configPath: () => homePath('.codeium', 'windsurf', 'mcp_config.json'),
    rulesPath: (root) => path.join(root, '.windsurf', 'rules'),
    detect(root) {
      return fs.existsSync(path.join(root, '.windsurf')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'KiloCode',
    id: 'kilocode',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.vscode', 'settings.json'),
    rulesPath: (root) => path.join(root, '.kilocode', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.vscode')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      writeJson(file, {
        ...existing,
        'mcp.servers': {
          ...(existing['mcp.servers'] || {}),
          scar: mcpConfig(root, config).mcpServers.scar
        }
      })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.['mcp.servers']?.scar)
    }
  },
  {
    name: 'Trae',
    id: 'trae',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.trae', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.trae', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.trae')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'Antigravity',
    id: 'antigravity',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.antigravity', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.antigravity', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.antigravity')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'Continue',
    id: 'continue',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.continue', 'mcpServers.json'),
    rulesPath: (root) => path.join(root, '.continue', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.continue')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'Cline',
    id: 'cline',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.cline', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.cline', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.cline')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'Roo Code',
    id: 'roo-code',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.roo', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.roo', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.roo')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
    }
  },
  {
    name: 'Claude Code',
    id: 'claude-code',
    transport: 'stdio',
    configPath: (root) => path.join(root, '.claude', 'mcp.json'),
    rulesPath: (root) => path.join(root, '.claude', 'CLAUDE.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.claude')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      mergeMcpConfig(this.configPath(root), root, config)
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.mcpServers?.scar)
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
      return fs.existsSync(path.join(root, '.zed')) || fs.existsSync(this.configPath(root))
    },
    install(root, config = {}) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      writeJson(file, {
        ...existing,
        context_servers: {
          ...(existing.context_servers || {}),
          scar: mcpConfig(root, config).mcpServers.scar
        }
      })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.context_servers?.scar)
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
  fs.mkdirSync(scarDir(root), { recursive: true })
  fs.writeFileSync(path.join(scarDir(root), 'AGENTS.md'), [
    '# Scar Agent Instructions',
    '',
    'Scar is the development continuity layer for this project.',
    '',
    '- Feature is the top-level abstraction. Do not organize continuity around tasks or files.',
    '- Call `scar_workspace()` at session start if MCP is available.',
    '- Call `scar_heartbeat()` roughly every 60 seconds while actively working.',
    '- Use `scar_current_work()` to infer the likely feature before claiming.',
    '- Use `scar_claim(feature)` only after the user or context confirms the feature.',
    '- Store durable decisions with `scar_remember(key, value, feature?)`.',
    '- Create checkpoints with `scar_checkpoint(feature)` when progress, blockers, files, or next steps change.',
    '- Before stopping, call `scar_handoff(feature)` or `scar_checkpoint(feature)`.',
    ''
  ].join('\n'))
}
