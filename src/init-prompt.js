import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { render, Box, Text, useApp } from 'ink'
import React, { useMemo, useState } from 'react'
import { MultiSelect, Select, TextInput } from '@inkjs/ui'
import { adapters } from './adapters.js'
import { exec } from 'node:child_process'

export async function promptInit({ root }) {
  if (!process.stdin.isTTY) return fallbackPrompt({ root })
  return new Promise((resolve) => {
    const app = render(React.createElement(InitWizard, { root, onDone: (value) => {
      resolve(value)
      app.unmount()
    } }))
  })
}

function InitWizard({ root, onDone }) {
  const { exit } = useApp()
  const [step, setStep] = useState('mode')
  const [mode, setMode] = useState('both')
  const detected = useMemo(() => adapters.filter((adapter) => adapter.detect(root)).map((adapter) => adapter.id), [root])
  const defaultSelected = detected.length ? detected : ['cursor', 'windsurf', 'zed']
  const [selected, setSelected] = useState(defaultSelected)
  const [backend, setBackend] = useState('local')

  const finish = (workspaceUrl = '') => {
    onDone({ mode, selected, backend, workspaceUrl })
    exit()
  }

  return React.createElement(Box, { flexDirection: 'column' }, [
    React.createElement(Box, { key: 'header', flexDirection: 'column', marginBottom: 1 }, [
      React.createElement(Text, { key: 'title', bold: true }, 'Scar - Development continuity.'),
      React.createElement(Text, { key: 'sub' }, 'Feature is the top-level abstraction.')
    ]),
    step === 'mode' && React.createElement(Box, { key: 'mode', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? How do you primarily work?'),
      React.createElement(Select, {
        key: 'select',
        defaultValue: mode,
        options: [
          { label: 'Sequential - I switch IDEs when credits run out', value: 'sequential' },
          { label: 'Parallel - I run multiple IDEs at the same time', value: 'parallel' },
          { label: 'Both', value: 'both' }
        ],
        onChange: (value) => {
          setMode(value)
          setStep('ides')
        }
      })
    ]),
    step === 'ides' && React.createElement(Box, { key: 'ides', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? IDEs detected:'),
      React.createElement(Text, { key: 'hint' }, 'Use Space to toggle, Enter to continue.'),
      React.createElement(MultiSelect, {
        key: 'multi',
        visibleOptionCount: Math.min(10, adapters.length),
        defaultValue: selected,
        options: adapters.map((adapter) => ({
          label: `${adapter.name} - ${detected.includes(adapter.id) ? 'found' : 'not found'}`,
          value: adapter.id
        })),
        onSubmit: (value) => {
          setSelected(value.length ? value : defaultSelected)
          setStep('backend')
        }
      })
    ]),
    step === 'backend' && React.createElement(Box, { key: 'backend', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? Where should state live?'),
      React.createElement(Select, {
        key: 'select',
        defaultValue: backend,
        options: [
          { label: 'Local - just me, this machine', value: 'local' },
          { label: 'Cloud - team or multiple machines', value: 'cloud' }
        ],
        onChange: (value) => {
          setBackend(value)
          if (value === 'cloud') setStep('workspaceUrl')
          else finish('')
        }
      })
    ]),
    step === 'workspaceUrl' && React.createElement(Box, { key: 'url', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? Scar workspace URL'),
      React.createElement(TextInput, {
        key: 'input',
        placeholder: 'https://your-scar-worker.your-subdomain.workers.dev',
        onSubmit: (value) => finish(value.trim())
      })
    ])
  ].filter(Boolean))
}

async function fallbackPrompt({ root }) {
  const rl = readline.createInterface({ input, output })
  try {
    const detected = adapters.filter((adapter) => adapter.detect(root)).map((adapter) => adapter.id)
    const selected = detected.length ? detected : ['cursor', 'windsurf', 'zed']
    const mode = await question(rl, 'How do you primarily work? sequential/parallel/both', 'both')
    const backend = await question(rl, 'Where should state live? local/cloud', 'local')
    const workspaceUrl = backend === 'cloud' ? await question(rl, 'Scar workspace URL', '') : ''
    return { mode, selected, backend, workspaceUrl }
  } finally {
    rl.close()
  }
}

async function question(rl, prompt, fallback) {
  const answer = await rl.question(`${prompt} [${fallback}]: `)
  return answer.trim() || fallback
}

export async function promptResume({ ides }) {
  if (!process.stdin.isTTY) return ides[0]?.value || 'cursor'
  return new Promise((resolve) => {
    const app = render(React.createElement(ResumeWizard, { ides, onDone: (value) => {
      resolve(value)
      app.unmount()
    } }))
  })
}

function ResumeWizard({ ides, onDone }) {
  const { exit } = useApp()
  return React.createElement(Box, { flexDirection: 'column' }, [
    React.createElement(Text, { key: 'q', bold: true }, '  Open in:'),
    React.createElement(Select, {
      key: 'select',
      options: ides,
      onChange: (value) => {
        onDone(value)
        exit()
      }
    })
  ])
}

export function launchIDE(ideId, dir) {
  let cmd = ''
  if (process.platform === 'darwin') {
    if (ideId === 'cursor') cmd = `open -a "Cursor" "${dir}"`
    else if (ideId === 'windsurf') cmd = `open -a "Windsurf" "${dir}"`
    else if (ideId === 'zed') cmd = `open -a "Zed" "${dir}"`
    else if (ideId === 'trae') cmd = `open -a "Trae" "${dir}"`
    else if (ideId === 'antigravity') cmd = `open -a "Antigravity" "${dir}"`
    else cmd = `code "${dir}"`
  } else {
    // Windows or Linux
    if (ideId === 'cursor') cmd = `cursor "${dir}"`
    else if (ideId === 'windsurf') cmd = `windsurf "${dir}"`
    else if (ideId === 'zed') cmd = `zed "${dir}"`
    else if (ideId === 'trae') cmd = `trae "${dir}"`
    else if (ideId === 'antigravity') cmd = `antigravity "${dir}"`
    else cmd = `code "${dir}"`
  }
  exec(cmd, (err) => {
    if (err) {
      console.error(`Failed to launch IDE: ${err.message}`)
    }
  })
}
