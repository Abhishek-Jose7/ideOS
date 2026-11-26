<div align="center">

# ⚡ ideOS

### Persistent project memory and development continuity across AI IDEs.

**Switch between Cursor, Windsurf, Claude Code, Zed, and Trae without losing context, decisions, or progress.**

<br />

[![npm version](https://img.shields.io/npm/v/ideos-cli.svg?style=for-the-badge&color=0969DA&label=npm)](https://www.npmjs.com/package/ideos-cli)
[![npm total downloads](https://img.shields.io/npm/dt/ideos-cli.svg?style=for-the-badge&color=2EA043&label=total%20downloads)](https://www.npmjs.com/package/ideos-cli)
[![Repo Views](https://img.shields.io/badge/Repo_Views-232-8B5CF6?style=for-the-badge)](https://github.com/Abhishek-Jose7/ideOS)
[![Git Clones](https://img.shields.io/badge/Git_Clones-125-0969DA?style=for-the-badge&logo=git&logoColor=white)](https://github.com/Abhishek-Jose7/ideOS)
[![Protocol](https://img.shields.io/badge/Protocol-MCP%20Standard-8B5CF6?style=for-the-badge&logo=anthropic&logoColor=white)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-E3B341?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-22C55E?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

<br />

<p align="center">
  <img src="https://img.shields.io/badge/Cursor-000000?style=flat-square&logo=cursor&logoColor=white" alt="Cursor" />
  <img src="https://img.shields.io/badge/Windsurf-0284C7?style=flat-square&logo=codeium&logoColor=white" alt="Windsurf" />
  <img src="https://img.shields.io/badge/Claude_Code-D97706?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Code" />
  <img src="https://img.shields.io/badge/Codex-00A67E?style=flat-square&logo=openai&logoColor=white" alt="Codex" />
  <img src="https://img.shields.io/badge/Zed-2563EB?style=flat-square" alt="Zed" />
  <img src="https://img.shields.io/badge/Trae-10B981?style=flat-square" alt="Trae" />
  <img src="https://img.shields.io/badge/Antigravity-6366F1?style=flat-square" alt="Antigravity" />
  <img src="https://img.shields.io/badge/Continue-E11D48?style=flat-square" alt="Continue" />
  <img src="https://img.shields.io/badge/Cline-8B5CF6?style=flat-square" alt="Cline" />
  <img src="https://img.shields.io/badge/Roo_Code-EC4899?style=flat-square" alt="Roo Code" />
  <img src="https://img.shields.io/badge/Freebuff_CLI-F59E0B?style=flat-square" alt="Freebuff" />
</p>

<p align="center">
  <a href="#-quick-start"><b>Quick Start</b></a> •
  <a href="#-the-problem--solution"><b>The Scenario</b></a> •
  <a href="#-supported-ides"><b>Supported IDEs</b></a> •
  <a href="#-core-workflows"><b>Workflows</b></a> •
  <a href="#-commands-cheat-sheet"><b>CLI Commands</b></a> •
  <a href="#-contributing--community"><b>Contributing</b></a>
</p>

---

</div>

<br />

## 💡 The Problem & Solution

### The Context Reset Tax 💸

You’re building an authentication module in **Cursor**. After three hours of intense development and debugging, you hit your daily fast-request credit quota. You switch to **Windsurf** or **Claude Code** to continue, but your new editor is completely blind:

* ❌ It doesn't know what files you just modified (`auth/jwt.ts`, `middleware/auth.ts`).
* ❌ It doesn't know why you chose RS256 over HS256 tokens.
* ❌ It doesn't know you're 60% done and only need to implement refresh token rotation.
* ❌ You burn 15 minutes copying notes, dumping commit logs, and burning hundreds of prompt tokens just catching the assistant up.

### The ideOS Fix ⚡

**ideOS** introduces a persistent, local-first continuity layer across every editor using the open **Model Context Protocol (MCP)** standard.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Cursor    │     │   Windsurf   │     │ Claude Code  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ (MCP)              │ (MCP)              │ (MCP)
       ▼                    ▼                    ▼
   ══════════════════════════════════════════════════════
               ⚡ ideOS Project Memory Engine
          (.ideos/db.sqlite  •  Git Auto-Hooks)
   ══════════════════════════════════════════════════════
                            │
               (Optional Cloudflare D1 Sync)
                            ▼
                  ☁️ Team Cloud Backend
```

1. You wrap up in Cursor — progress snapshots save automatically on git commits or via the MCP server.
2. You open Windsurf and run `ideos resume`.
3. The IDE launches pre-loaded with active context, decisions, and blockers. **Nobody re-explains anything.**

---

## ⚡ Quick Start

### 1. Install Globally

```bash
npm install -g ideos-cli
```

> **Requirement**: Node.js `>= 18.0.0` (v20+ or v22+ recommended).

### 2. Initialize Your Project

Navigate to any git-backed project repository:

```bash
cd your-project
git init          # If not already initialized
ideos init
```

The interactive setup wizard will:
* Detect all installed AI editors on your laptop.
* Let you select which IDEs to configure automatically.
* Write required MCP configurations (`.cursor/mcp.json`, `.agents/mcp.json`, etc.).
* Offer to import past git history to backfill project memory.

### 3. Resume from Any Editor

```bash
ideos resume
```

```text
$ ideos resume

  Last session: Windsurf · 4h ago · 2h 14m

  Feature: Authentication
  ────────────────────────────────────────────────────────
  Progress:   60% complete
  Done:       JWT signing, auth middleware, login endpoint
  Remaining:  Refresh token rotation, auth tests
  Blockers:   Refresh token rotation not started
  Files:      auth/jwt.ts, middleware/auth.ts, types/auth.ts
  Decisions:  RS256 over HS256 · stateless, no sessions

  Other features:
  ○ Dashboard UI     Cursor · Sarah · active now
  ○ API Endpoints    unclaimed

  Open in:
  ❯ Cursor
    Windsurf
    Zed
```

---

## 🖥️ Live Terminal HUD

Run `ideos start` to launch an interactive, real-time terminal monitoring dashboard built with React and [Ink](https://github.com/vadimdemedes/ink):

```bash
ideos start
```

```text
┌─ ideOS Workspace HUD ────────────────────────────────────────────────────────┐
│ Project: my-app  •  Backend: Local (SQLite)  •  Status: Synced              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ACTIVE WORKERS                                                               │
│  ● Cursor        Abhishek    auth-system      updated 2m ago                 │
│  ● Windsurf      Sarah       dashboard-ui     updated 14m ago                │
│                                                                              │
│ FEATURES IN FLIGHT                                                           │
│  [■■■■■■░░░░] 60%  auth-system    (Cursor / Abhishek)                        │
│  [■■■■■■■■░░] 80%  dashboard-ui   (Windsurf / Sarah)                         │
│  [░░░░░░░░░░]  0%  api-endpoints  (Unclaimed)                                │
│                                                                              │
│ CONFLICT DETECTION                                                           │
│  ✓ Zero overlapping file modifications detected across editors               │
└──────────────────────────────────────────────────────────────────────────────┘
  [e] explain  [t] timeline  [r] resume  [q] quit >
```

---

## 🔌 Supported IDEs

ideOS automatically detects, configures, and launches your favorite AI development tools:

| Editor / Tool | Free Tier | Configuration Path | MCP Support |
| :--- | :---: | :--- | :---: |
| **Cursor** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.cursor/mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Windsurf** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `~/.codeium/windsurf/mcp_config.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Claude Code** | ![Partial](https://img.shields.io/badge/BYOK-D97706?style=flat-square) | `.claude/mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Codex** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.vscode/settings.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Zed** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `~/.config/zed/settings.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Trae** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.trae/mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Antigravity** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.agents/mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **KiloCode** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.vscode/settings.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Qoder** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Continue** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.continue/mcpServers.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Cline** | ![BYOK](https://img.shields.io/badge/BYOK-8B5CF6?style=flat-square) | `.cline/mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Roo Code** | ![BYOK](https://img.shields.io/badge/BYOK-EC4899?style=flat-square) | `.roo/mcp.json` | ![Production](https://img.shields.io/badge/Native_MCP-0969DA?style=flat-square) |
| **Freebuff CLI** | ![Free Tier](https://img.shields.io/badge/Yes-2EA043?style=flat-square) | `.agents/mcp.json` | ![Production](https://img.shields.io/badge/CLI_Approved-F59E0B?style=flat-square) |

> Run `ideos ides` to inspect all available adapters or `ideos detect` to run a live scan of what is installed on your operating system.

---

## 🛠️ Commands Cheat Sheet

### Continuity & Sessions
| Command | Description | Example |
| :--- | :--- | :--- |
| `ideos init` | Set up database, git hooks, and register MCP servers | `ideos init` |
| `ideos resume` | Inspect latest saved state and launch preferred editor | `ideos resume --ide cursor` |
| `ideos start` | Launch interactive terminal HUD dashboard | `ideos start` |
| `ideos claim` | Explicitly claim ownership of an active feature | `ideos claim auth-system` |
| `ideos handoff` | Synthesize a context brief for teammates or other IDEs | `ideos handoff auth-system` |
| `ideos done` | Mark feature complete (100% progress & unclaim) | `ideos done auth-system` |

### Memory & Decisions
| Command | Description | Example |
| :--- | :--- | :--- |
| `ideos checkpoint` | Record manual progress snapshot with summary & files | `ideos checkpoint auth --progress 60` |
| `ideos remember` | Store architectural decision (normalized via LLM/offline) | `ideos remember auth-strategy "JWT RS256"` |
| `ideos recall` | Retrieve stored decisions and architectural choices | `ideos recall` |
| `ideos explain` | Deep explain summary of features, workers, & decisions | `ideos explain auth-system` |
| `ideos timeline` | Print chronological history of checkpoints and commits | `ideos timeline auth-system` |
| `ideos import` | Analyze past git history & cluster into features | `ideos import --limit 100` |

### Diagnostics & Inspection
| Command | Description | Example |
| :--- | :--- | :--- |
| `ideos doctor` | Run full health diagnostic check (use `--fix` to auto-repair) | `ideos doctor --fix` |
| `ideos detect` | System-wide scan for installed AI IDEs and extensions | `ideos detect` |
| `ideos ides` | Print all supported editor adapter paths and status | `ideos ides` |
| `ideos status` | One-line status string formatted for shell prompts (PS1) | `ideos status` |
| `ideos diff` | Review file changes made since your last saved checkpoint | `ideos diff` |
| `ideos onboard` | Generate an `ONBOARDING.md` briefing for new devs | `ideos onboard` |

---

## 🧠 Using ideOS with Your AI Assistant

Once you run `ideos init` and open your project in an IDE:

1. Verify that the `ideos` MCP server is connected and authorized.
2. Ask your assistant to consult the ideOS workspace context:
   ```text
   Check the ideOS workspace and my current feature, load the relevant context,
   then help me implement the next step. Record a checkpoint when done.
   ```
3. The AI assistant automatically invokes MCP tools:
   * `ideos_workspace`: Queries global features, workers, and project decisions.
   * `ideos_checkpoint`: Saves progress percentage, files touched, and blockers.
   * `ideos_remember`: Records critical architectural decisions.

---

## 🤖 AI Provider & Offline Setup

ideOS is **100% functional offline** using local heuristics. Optionally, you can connect an LLM provider to power natural-language decision normalization and intelligent git history clustering:

```bash
# Saved securely in your ignored project .env file:
IDEOS_AI_PROVIDER=groq        # Options: groq | openai | anthropic | openrouter | offline
IDEOS_AI_API_KEY=gsk_your_key_here
# Optional OpenRouter model override:
# IDEOS_AI_MODEL=openai/gpt-4o-mini
```

| Provider | Getting an API Key | Default Model |
| :--- | :--- | :--- |
| **Groq** | [console.groq.com](https://console.groq.com/keys) (Free tier available) | `llama-3.3-70b-versatile` |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `claude-3-5-haiku-latest` |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai/settings/keys) | `openai/gpt-4o-mini` |
| **Offline** | Zero configuration needed | Local regex heuristics |

---

## ☁️ Cloud / Team Mode (Cloudflare D1)

Need to sync development context across multiple machines or a distributed team? ideOS provides a serverless team backend built on Cloudflare Workers and D1:

```bash
# Add to .env in your project root
IDEOS_BACKEND=cloud
IDEOS_WORKSPACE_URL=https://your-ideos-worker.your-subdomain.workers.dev
IDEOS_API_KEY=your-32-byte-secret-key
```

Generate a secure bearer token:
```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Configure your worker:
```bash
npx wrangler secret put IDEOS_API_KEY
npx wrangler secret put IDEOS_AI_PROVIDER
npx wrangler secret put IDEOS_AI_API_KEY
```

*For worker deployment and migrations, see the [Cloud Setup Guide](ideos-final.md#the-two-backends).*

---

## 🤝 Contributing & Community

We are building the universal continuity layer for AI-assisted software engineering. Whether you want to add an adapter for your favorite AI tool or build new MCP capabilities, we would love your help!

<br />

<p align="center">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing_Guide-Read_First-blue?style=for-the-badge&logo=gitbook&logoColor=white" alt="Contributing Guide" /></a>
  &nbsp;
  <a href="ROADMAP.md"><img src="https://img.shields.io/badge/Project_Roadmap-Explore_Phases-0e8a16?style=for-the-badge&logo=target&logoColor=white" alt="Roadmap" /></a>
  &nbsp;
  <a href="https://github.com/Abhishek-Jose7/ideOS/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22"><img src="https://img.shields.io/badge/Good_First_Issues-View_Open-7057ff?style=for-the-badge&logo=github&logoColor=white" alt="Good First Issues" /></a>
</p>

<br />

### High-Impact Ways to Help:
* 🔌 **Add a New IDE Adapter**: Each adapter in [`src/adapters.js`](src/adapters.js) is self-contained and takes **under 25 lines of code**! See [Adapter Guide](CONTRIBUTING.md#2-adding-a-new-ide--tool-adapter).
* 📊 **CLI Polish**: Implement `--json` output flags for `recall`, `explain`, and `timeline` ([Issue #2](https://github.com/Abhishek-Jose7/ideOS/issues/2)).
* 🧪 **CI Pipeline**: Expand GitHub Actions automated test matrix across Windows, macOS, and Linux ([Issue #3](https://github.com/Abhishek-Jose7/ideOS/issues/3)).
* 🐛 **Report Issues**: Found a bug or edge case? [Open a Bug Report](https://github.com/Abhishek-Jose7/ideOS/issues/new?template=bug_report.yml).

### Running Checks Locally

```bash
git clone https://github.com/Abhishek-Jose7/ideOS.git
cd ideOS
npm install

# Run doctor and verify environment
npm run check

# Run end-to-end smoke test suite (CLI + MCP client in a temp sandbox)
npm run smoke

# Run file-watcher integration test
npm run test:watcher
```

---

<div align="center">

Made with ☕ and open standards for developers who love switching editors.

**[⭐ Star ideOS on GitHub](https://github.com/Abhishek-Jose7/ideOS)** if this saved you from context loss!

<br />

[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![npm total downloads](https://img.shields.io/npm/dt/ideos-cli.svg?style=flat-square&color=2EA043&label=npm%20downloads)](https://www.npmjs.com/package/ideos-cli)
[![Repo Views](https://img.shields.io/badge/Repo_Views-232-8B5CF6?style=flat-square)](https://github.com/Abhishek-Jose7/ideOS)
[![Git Clones](https://img.shields.io/badge/Git_Clones-125-0969DA?style=flat-square&logo=git&logoColor=white)](https://github.com/Abhishek-Jose7/ideOS)
[![GitHub stars](https://img.shields.io/github/stars/Abhishek-Jose7/ideOS?style=flat-square&color=gold)](https://github.com/Abhishek-Jose7/ideOS/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Abhishek-Jose7/ideOS?style=flat-square&color=gray)](https://github.com/Abhishek-Jose7/ideOS/network/members)

</div>
