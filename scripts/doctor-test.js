import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(repo, 'src', 'cli.js')
const requiredIgnoreEntries = [
  '.ideos/db.sqlite',
  '.ideos/db.sqlite-*',
  '.ideos/preferences.json',
  '.env'
]

function createWorkspace({ validGitignore = true, hookContent } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ideos-doctor-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  if (validGitignore) fs.writeFileSync(path.join(root, '.gitignore'), `${requiredIgnoreEntries.join('\n')}\n`)
  const hookPath = path.join(root, '.git', 'hooks', 'post-commit')
  if (hookContent !== undefined) {
    fs.mkdirSync(path.dirname(hookPath), { recursive: true })
    fs.writeFileSync(hookPath, hookContent)
  } else {
    fs.rmSync(hookPath, { force: true })
  }
  return { root, hookPath }
}

function runDoctor(root, env = process.env) {
  return spawnSync(process.execPath, [cli, 'doctor'], {
    cwd: root,
    env,
    encoding: 'utf8'
  })
}

function withWorkspace(options, check) {
  const workspace = createWorkspace(options)
  try {
    check(workspace)
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true })
  }
}

withWorkspace({}, ({ root }) => {
  const result = runDoctor(root)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /\[WARN\] ideOS post-commit hook is not installed/)
  assert.doesNotMatch(result.stdout, /\[FAIL\]/)
})

withWorkspace({ hookContent: '#!/bin/sh\necho user hook\n' }, ({ root }) => {
  const result = runDoctor(root)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /\[WARN\] Existing post-commit hook does not contain the ideOS handler/)
})

withWorkspace({}, ({ root }) => {
  const binDir = path.join(root, 'test-bin')
  fs.mkdirSync(binDir)
  const cursorPath = path.join(binDir, process.platform === 'win32' ? 'cursor.cmd' : 'cursor')
  fs.writeFileSync(cursorPath, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\nexit 0\n')
  if (process.platform !== 'win32') fs.chmodSync(cursorPath, 0o755)
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}` }
  const result = runDoctor(root, env)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /\[WARN\] Cursor is installed but its ideOS configuration is missing or unverified/)
})

withWorkspace({ validGitignore: false }, ({ root }) => {
  const result = runDoctor(root)
  assert.equal(result.status, 1, result.stderr || result.stdout)
  assert.match(result.stdout, /\[FAIL\] Missing entries in \.gitignore/)
})

console.log('ideOS doctor tests passed (optional setup warns; genuine project errors fail).')
