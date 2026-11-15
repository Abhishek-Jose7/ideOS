import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { render, Box, Text, useApp } from 'ink'
import React, { useMemo, useState } from 'react'
import { MultiSelect, PasswordInput, Select, TextInput } from '@inkjs/ui'
import { adapters } from './adapters.js'
import { spawn } from 'node:child_process'

const modeOptions = [
  { label: 'Both', value: 'both' },
  { label: 'Sequential - I switch IDEs when credits run out', value: 'sequential' },
  { label: 'Parallel - I run multiple IDEs at the same time', value: 'parallel' }
]

const backendOptions = [
  { label: 'Local - just me, this machine', value: 'local' },
  { label: 'Cloud - team or multiple machines', value: 'cloud' }
]

const providerOptions = [
  { label: 'No provider - use offline fallbacks', value: 'none' },
  { label: 'Groq', value: 'groq' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic (Claude)', value: 'anthropic' },
  { label: 'OpenRouter', value: 'openrouter' }
]

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
  const detected = useMemo(() => adapters.filter((adapter) => adapter.detectSystem ? adapter.detectSystem() : false).map((adapter) => adapter.id), [root])
  const defaultSelected = detected.length ? detected : ['cursor', 'windsurf', 'zed']
  const [selected, setSelected] = useState(defaultSelected)
  const [backend, setBackend] = useState('local')
  const [workspaceUrl, setWorkspaceUrl] = useState('')
  const [aiProvider, setAiProvider] = useState(() => process.env.IDEOS_AI_PROVIDER || 'none')

  const finish = (wUrl = '', key = '') => {
    onDone({ mode, selected, backend, workspaceUrl: wUrl, aiProvider, aiApiKey: key })
    exit()
  }

  return React.createElement(Box, { flexDirection: 'column' }, [
    React.createElement(Box, { key: 'header', flexDirection: 'column', marginBottom: 1 }, [
      React.createElement(Text, { key: 'title', bold: true }, 'ideOS - Development continuity.'),
      React.createElement(Text, { key: 'sub' }, 'Feature is the top-level abstraction.')
    ]),
    step === 'mode' && React.createElement(Box, { key: 'mode', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? How do you primarily work?'),
      React.createElement(Select, {
        key: 'select',
        options: modeOptions,
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
        visibleOptionCount: adapters.length,
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
        options: backendOptions,
        onChange: (value) => {
          setBackend(value)
          if (value === 'cloud') setStep('workspaceUrl')
          else setStep('provider')
        }
      })
    ]),
    step === 'workspaceUrl' && React.createElement(Box, { key: 'url', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? ideOS workspace URL'),
      React.createElement(TextInput, {
        key: 'input',
        placeholder: 'https://your-ideos-worker.your-subdomain.workers.dev',
        onSubmit: (value) => {
          setWorkspaceUrl(value.trim())
          setStep('provider')
        }
      })
    ]),
    step === 'provider' && React.createElement(Box, { key: 'provider', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, '? Which AI provider should ideOS use for summaries and decision help?'),
      React.createElement(Select, { key: 'select', options: providerOptions, onChange: (value) => {
        setAiProvider(value)
        if (value === 'none') finish(workspaceUrl)
        else setStep('apiKey')
      } })
    ]),
    step === 'apiKey' && React.createElement(Box, { key: 'apiKey', flexDirection: 'column' }, [
      React.createElement(Text, { key: 'q' }, `? Enter your ${{ openai: 'OpenAI', anthropic: 'Anthropic/Claude', groq: 'Groq', openrouter: 'OpenRouter' }[aiProvider]} API key (optional; press Enter to use offline fallbacks):`),
      React.createElement(Text, { key: 'billing' }, 'Provider API use may require billing or credits. The key is stored in this project’s ignored .env file.'),
      React.createElement(PasswordInput, {
        key: 'input',
        placeholder: 'API key',
        onSubmit: (value) => finish(workspaceUrl, value.trim())
      })
    ])
  ].filter(Boolean))
}

async function fallbackPrompt({ root }) {
  const rl = readline.createInterface({ input, output })
  try {
    const detected = adapters.filter((adapter) => adapter.detectSystem ? adapter.detectSystem() : false).map((adapter) => adapter.id)
    const selected = detected.length ? detected : ['cursor', 'windsurf', 'zed']
    const mode = await question(rl, 'How do you primarily work? sequential/parallel/both', 'both')
    const backend = await question(rl, 'Where should state live? local/cloud', 'local')
    const workspaceUrl = backend === 'cloud' ? await question(rl, 'ideOS workspace URL', '') : ''
    const providerLabels = { groq: 'Groq', openai: 'OpenAI', anthropic: 'Anthropic/Claude', openrouter: 'OpenRouter', none: 'offline fallbacks' }
    let aiProvider
    while (!aiProvider) {
      const provider = (await question(rl, 'Which AI provider should ideOS use? groq/openai/anthropic/openrouter/none', 'none')).toLowerCase()
      if (Object.hasOwn(providerLabels, provider)) aiProvider = provider
      else console.log('Choose groq, openai, anthropic, openrouter, or none.')
    }
    const aiApiKey = ''
    if (aiProvider !== 'none') console.log(`Add IDEOS_AI_API_KEY to the ignored .env file to enable ${providerLabels[aiProvider]}; this non-interactive prompt does not collect secrets.`)
    return { mode, selected, backend, workspaceUrl, aiProvider, aiApiKey }
  } finally {
    rl.close()
  }
}

async function question(rl, prompt, fallback) {
  const answer = await rl.question(`${prompt} [${fallback}]: `)
  return answer.trim() || fallback
}

export async function promptResume({ ides, preferred }) {
  const orderedIdes = [...ides].sort((a, b) => Number(b.value === preferred) - Number(a.value === preferred))
  if (!process.stdin.isTTY) return preferred || orderedIdes[0]?.value || 'cursor'
  return new Promise((resolve) => {
    const app = render(React.createElement(ResumeWizard, { ides: orderedIdes, onDone: (value) => {
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
  const cliCommands = {
    cursor: 'cursor',
    windsurf: 'windsurf',
    zed: 'zed',
    trae: 'trae',
    antigravity: 'antigravity',
    qcoder: 'qoder',
    codex: 'codex',
    'claude-code': 'claude',
    freebuff: 'freebuff'
  }
  const appNames = {
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    zed: 'Zed',
    trae: 'Trae',
    antigravity: 'Antigravity',
    qcoder: 'Qoder'
  }
  const command = cliCommands[ideId] || 'code'
  const cliOnly = ['codex', 'claude-code', 'freebuff'].includes(ideId)
  const args = cliOnly ? [] : [dir]
  let child

  if (process.platform === 'darwin' && appNames[ideId]) {
    child = spawn('open', ['-a', appNames[ideId], dir], { detached: true, stdio: 'ignore' })
  } else if (process.platform === 'win32') {
    const script = 'if ($args[0] -in @("codex", "claude", "freebuff")) { Start-Process -FilePath $args[0] -WorkingDirectory $args[1] } else { Start-Process -FilePath $args[0] -ArgumentList "." -WorkingDirectory $args[1] }'
    child = spawn('powershell.exe', ['-NoProfile', '-Command', script, command, dir], { detached: true, stdio: 'ignore' })
  } else {
    child = spawn(command, args, { cwd: dir, detached: true, stdio: 'ignore' })
  }

  child.once('error', (error) => {
    console.error(`Failed to launch ${ideId}: ${error.message}`)
  })
  child.once('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`Failed to launch ${ideId} (exit ${code}).`)
  })
  child.unref()
}
