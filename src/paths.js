import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function projectRoot(cwd = process.cwd()) {
  return path.resolve(cwd)
}

export function scarDir(root = projectRoot()) {
  return path.join(root, '.scar')
}

export function dbPath(root = projectRoot()) {
  return path.join(scarDir(root), 'db.sqlite')
}

export function exportsDir(root = projectRoot()) {
  return path.join(scarDir(root), 'exports')
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function homePath(...parts) {
  return path.join(os.homedir(), ...parts)
}

export function rel(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}
