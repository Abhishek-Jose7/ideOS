import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { render, Box, Text } from 'ink'
import React from 'react'
import { adapters } from './adapters.js'

function Header() {
  return React.createElement(Box, { flexDirection: 'column', marginBottom: 1 }, [
    React.createElement(Text, { key: 'title', bold: true }, 'Scar — Development continuity.'),
    React.createElement(Text, { key: 'sub' }, 'Feature is the top-level abstraction.')
  ])
}

export async function promptInit({ root }) {
  const ink = render(React.createElement(Header))
  ink.unmount()
  const rl = readline.createInterface({ input, output })
  try {
    const mode = await choose(rl, 'How do you primarily work?', [
      ['sequential', 'Sequential - I switch IDEs when credits run out'],
      ['parallel', 'Parallel - I run multiple IDEs at the same time'],
      ['both', 'Both']
    ], 'both')
    const detected = adapters.filter((adapter) => adapter.detect(root)).map((adapter) => adapter.id)
    const selected = await toggleList(rl, 'Which IDE adapters should Scar initialize?', adapters.map((adapter) => [
      adapter.id,
      `${adapter.name}${detected.includes(adapter.id) ? ' - detected' : ' - not detected'}`
    ]), detected.length ? detected : ['cursor', 'windsurf', 'zed'])
    const backend = await choose(rl, 'Where should state live?', [
      ['local', 'Local - just me, this machine'],
      ['cloud', 'Cloud - team or multiple machines']
    ], 'local')
    let workspaceUrl = ''
    if (backend === 'cloud') {
      workspaceUrl = await rl.question('Scar workspace URL (for example https://scar.example.workers.dev): ')
    }
    return { mode, selected, backend, workspaceUrl }
  } finally {
    rl.close()
  }
}

async function choose(rl, question, options, fallback) {
  output.write(`\n? ${question}\n`)
  options.forEach(([value, label], index) => output.write(`  ${index + 1}. ${label}\n`))
  const answer = await rl.question(`Choose [${options.findIndex(([value]) => value === fallback) + 1}]: `)
  const index = Number(answer || options.findIndex(([value]) => value === fallback) + 1) - 1
  return options[index]?.[0] || fallback
}

async function toggleList(rl, question, options, defaults) {
  output.write(`\n? ${question}\n`)
  options.forEach(([value, label], index) => output.write(`  ${index + 1}. ${label}\n`))
  output.write(`Default: ${defaults.join(', ')}\n`)
  const answer = await rl.question('Enter numbers separated by commas, or press Enter for default: ')
  if (!answer.trim()) return defaults
  return answer.split(',').map((part) => {
    const index = Number(part.trim()) - 1
    return options[index]?.[0]
  }).filter(Boolean)
}
