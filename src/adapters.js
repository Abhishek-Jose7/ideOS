import fs from 'node:fs'
import path from 'node:path'
import { homePath, projectRoot, scarDir } from './paths.js'
import { readJson, writeJson } from './json.js'

function mcpConfig(root = projectRoot()) {
  return {
    mcpServers: {
      scar: {
        command: 'npx',
        args: ['-y', 'scar-mcp'],
        env: { SCAR_WORKSPACE: '${workspaceFolder}/.scar' }
      }
    }
  }
}

function mergeMcpConfig(file, root) {
  const existing = readJson(file, {})
  const next = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      ...mcpConfig(root).mcpServers
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
    install(root) {
      mergeMcpConfig(this.configPath(root), root)
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
    install(root) {
      mergeMcpConfig(this.configPath(root), root)
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
    install(root) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      writeJson(file, {
        ...existing,
        'mcp.servers': {
          ...(existing['mcp.servers'] || {}),
          scar: mcpConfig(root).mcpServers.scar
        }
      })
      writeRules(this.rulesPath(root))
    },
    verify(root) {
      return Boolean(readJson(this.configPath(root), {})?.['mcp.servers']?.scar)
    }
  },
  {
    name: 'Zed',
    id: 'zed',
    transport: 'stdio',
    configPath: () => homePath('.config', 'zed', 'settings.json'),
    rulesPath: (root) => path.join(root, '.zed', 'rules.md'),
    detect(root) {
      return fs.existsSync(path.join(root, '.zed')) || fs.existsSync(this.configPath(root))
    },
    install(root) {
      const file = this.configPath(root)
      const existing = readJson(file, {})
      writeJson(file, {
        ...existing,
        context_servers: {
          ...(existing.context_servers || {}),
          scar: mcpConfig(root).mcpServers.scar
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
