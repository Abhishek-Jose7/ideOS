import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repo = path.resolve(import.meta.dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ideos-watch-'))
const cli = path.join(repo, 'src', 'cli.js')
const mcp = path.join(repo, 'src', 'mcp.js')

execFileSync(process.execPath, [cli, 'init', '--yes'], { cwd: tmp, encoding: 'utf8' })

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp'],
  env: { ...process.env, IDEOS_WORKSPACE: path.join(tmp, '.ideos') }
})
const client = new Client({ name: 'ideos-watcher-test', version: '0.1.0' })
await client.connect(transport)

await new Promise((resolve) => setTimeout(resolve, 1_500))
fs.writeFileSync(path.join(tmp, 'watch-me.txt'), `saved ${Date.now()}\n`)
await new Promise((resolve) => setTimeout(resolve, 34_000))
await client.listTools()

const checkpoints = JSON.parse(fs.readFileSync(path.join(tmp, '.ideos', 'exports', 'checkpoints.json'), 'utf8'))
const found = checkpoints.some((checkpoint) => checkpoint.source === 'file_watch' && checkpoint.feature_id === 'unclassified-work')

await client.close()

if (!found) {
  console.error(`Temp project: ${tmp}`)
  console.error(JSON.stringify(checkpoints, null, 2))
  throw new Error('file watcher did not write a file_watch checkpoint')
}
console.log(`ideOS watcher test passed in ${tmp}`)
