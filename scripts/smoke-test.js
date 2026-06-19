import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repo = path.resolve(import.meta.dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scar-smoke-'))
const cli = path.join(repo, 'src', 'cli.js')
const mcp = path.join(repo, 'src', 'mcp.js')

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: tmp, encoding: 'utf8' })
}

run(['init', '--yes'])
run(['checkpoint', 'authentication', '--summary', 'JWT signing, auth middleware, login endpoint', '--progress', '60', '--files', 'auth/jwt.ts,middleware/auth.ts'])
run(['remember', 'auth-strategy', 'JWT, RS256, stateless', '--feature', 'authentication'])

const resume = run(['resume'])
if (!resume.includes('Feature: Authentication')) throw new Error('resume did not render Authentication')

const timeline = run(['timeline', 'authentication'])
if (!timeline.includes('checkpoint')) throw new Error('timeline did not include checkpoint')

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp'],
  env: { ...process.env, SCAR_WORKSPACE: path.join(tmp, '.scar') }
})
const client = new Client({ name: 'scar-smoke', version: '0.1.0' })
await client.connect(transport)
const tools = await client.listTools()
if (!tools.tools.some((tool) => tool.name === 'scar_workspace')) throw new Error('MCP tool missing')
const workspace = await client.callTool({ name: 'scar_workspace', arguments: {} })
if (!workspace.content[0].text.includes('authentication')) throw new Error('MCP workspace missing feature')
await client.close()

console.log(`Scar smoke test passed in ${tmp}`)
