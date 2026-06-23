# ideOS
### The Development Continuity Layer for AI-Assisted Software Development

[![NPM Version](https://img.shields.io/npm/v/ideos-cli?color=indigo)](https://www.npmjs.com/package/ideos-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Support](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

ideOS is a developer infrastructure layer that coordinates multiple AI coding assistants (Claude Code, Cursor, Windsurf, Zed, Cline, Roo Code, Continue, Trae, Antigravity, Codex, QCoder) by providing shared memory, project intelligence, feature-level context, conflict prevention, and decision tracking.

---

## Why ideOS?

### The Problem
Modern developers switch between multiple AI coding assistants sequentially (e.g. running out of credits) or use them simultaneously:

```
Developer
   │
   ├── Cursor       ← thinks it owns auth.ts
   ├── Windsurf     ← also editing auth.ts
   ├── Zed          ← no idea what the others did yesterday
   ├── Trae         ← about to introduce a circular dependency
   └── Claude Code  ← duplicating work on tests
```

*Result: duplicated work, conflicting edits, forgotten context, and token-wasting re-indexing.*

### The Solution

```
Developer
    │
    ▼
  ideOS           ← shared continuity layer (.ideos/ + MCP)
    │
 ┌──┼─────────┐
 ▼  ▼         ▼
Cursor  Windsurf  Zed
```
*All agents share: Memory · Context · Feature Progress · Decisions · Active Sessions*

---

## Features & Core Pillars

| Pillar | Description |
| :--- | :--- |
| **Feature-Centric Memory** | Tracks all progress, files, and tasks under a `feature_id` rather than raw files or task boards. |
| **Agent Coordination** | Detects active workers and warns about potential editing overlaps or duplicate feature claims. |
| **Multi-IDE Compatibility** | Unifies Cursor, Windsurf, Zed, Continue, Cline, Roo Code, Trae, Antigravity, and Claude Code under a single MCP server. |
| **Passive Context Injection** | Regenerates rules (`.cursor/rules`, etc.), `.ideos/AGENTS.md`, and plain `.ideos/context.md` on every state change so non-cooperating models still stay updated. |
| **Team Cloud Sync** | Syncs local SQLite states to an optional Cloudflare Workers + D1 backend for team collaboration. |

---

## Commands

### Initialize & Info
* `ideos init` — Runs the setup wizard to detect IDEs, configure MCP servers, create rules files, and install git hooks.
* `ideos ides` — Lists all compatible IDE adapters and their setup status (`configured`, `detected`, or `available`).
* `ideos detect` — Re-scans the host machine for installed AI IDEs.
* `ideos doctor` — Validates the health of the local SQLite database and schema.

### Feature Management
* `ideos claim <feature>` — Claim ownership of a feature for the current active worker.
* `ideos checkpoint <feature> --summary "..."` — Record a progress snapshot including progress percentages, files touched, blockers, and next steps.
* `ideos done <feature> --summary "..."` — Mark a feature complete (progress to 100%).
* `ideos current-work` — Auto-infers the likely active feature based on the git branch, recent commits, and modified files.

### Shared Memory & Handoffs
* `ideos remember <key> <value> [--feature id]` — Store durable decisions (e.g. choice of library).
* `ideos remember --prompt "..."` — Store a Groq-normalized natural language decision.
* `ideos recall [key]` — Retrieve recorded decisions.
* `ideos handoff <feature>` — Groq-synthesized concise development handoff brief for transitioning work.
* `ideos explain <feature>` — Deep status report of workers, checkpoints, decisions, and sessions.
* `ideos timeline <feature>` — Interactive timeline replay of all activities associated with a feature.

### Active Monitoring
* `ideos start` — Launches the interactive terminal dashboard monitoring concurrent workers, claimed features, and decisions in real-time.
* `ideos start --once` — Output a single dashboard snapshot for logging/CI purposes.
* `ideos mcp` — Spawns the stdio Model Context Protocol (MCP) server child process.

---

## Quick Start

### Prerequisites
* **Node.js** `>= 18.0.0`
* **npm** or **yarn**
* **Git**

### Installation
Install the package globally from npm:
```bash
npm install -g ideos-cli
```

### Usage

1. **Initialize ideOS in your project root**:
   ```bash
   ideos init
   ```
   *(Accept the defaults to auto-detect and write configurations to Cursor, Windsurf, Zed, etc.)*

2. **Set up your Groq API Key** (optional, for smart features/decision normalization):
   Add to your `.env` file in the project root:
   ```bash
   GROQ_API_KEY=gsk_your_key_here
   IDEOS_BACKEND=local
   ```

3. **Claim your active feature**:
   ```bash
   ideos claim auth-system
   ```

4. **Launch your IDE and begin coding**:
   ```bash
   ideos resume
   ```
   *(Select your preferred IDE to launch the project pre-loaded with current context).*

---

## The Killer Demo

### 1. Initialize and Claim Features
```bash
# Initialize project-wide integration
ideos init --yes

# Team member Sarah claims UI layout in Cursor
ideos claim dashboard-ui --ide cursor --name Sarah

# You claim authorization in Windsurf
ideos claim auth-system --ide windsurf --name Abhishek
```

### 2. Capture Decisions & Progress Snapshots
```bash
# Record an engineering design decision
ideos remember token-strategy "JWT RS256 stateless" --feature auth-system

# Commit progress
ideos checkpoint auth-system --summary "JWT signing middleware added" --progress 45 --files src/auth/jwt.ts
```

### 3. Automatic Conflict Warnings
If another teammate opens Cursor and starts editing files in the `src/auth/` directory, ideOS will detect the concurrent workspace overlap and warning banner on the dashboard:
```
$ ideos start --once

┌─ ideOS ─────────────────────────────── my-project ──────────┐
│                                                              │
│  Active                                                      │
│  ● Windsurf   auth-system      (claimed)          3s        │
│  ● Cursor     dashboard-ui     (claimed)          1m        │
│                                                              │
│  ⚠  Overlap: Windsurf + Cursor both near src/auth/           │
│                                                              │
│  Features                                                    │
│  🔒 auth-system       Windsurf · 45%    in progress         │
│  🔒 dashboard-ui      Cursor · 20%      in progress         │
│                                                              │
│  Decisions                                                   │
│  token-strategy → JWT, RS256, stateless                      │
│                                                              │
│  [e] explain  [t] timeline  [r] resume  [q] quit            │
└──────────────────────────────────────────────────────────────┘
```

### 4. Review Full Reasoning & Replay Timeline
When resuming the next morning, query the timeline to see what happened:
```
$ ideos timeline auth-system

  auth-system · Development Timeline

  Mon Jun 22
  09:00  Windsurf · Abhishek    session started
  10:15  ─ decision             token-strategy
  10:30  ─ checkpoint           JWT signing middleware added
  11:00  ─ session ended        2h 00m
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         ideOS Core                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐     ┌───────────────┐     ┌─────────────┐│
│  │ File Watcher  │────▶│ SQLite DB     │◀────│ Git Hooks   ││
│  │  (chokidar)   │     │  (.ideos/db)  │     │(post-commit)││
│  └───────────────┘     └───────────────┘     └─────────────┘│
│                                │                            │
│                                ▼                            │
│                        ┌───────────────┐                    │
│                        │  MCP Server   │                    │
│                        │    (stdio)    │                    │
│                        └───────────────┘                    │
│                                │                            │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │   ideos CLI   │
                         └───────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
              Cursor          Windsurf          Zed
```

### Data Storage

Local files are written directly into the project workspace:
```text
your-project/
  .ideos/
    db.sqlite             ← Local SQLite database (git-ignored)
    exports/
      features.json       ← Human-readable JSON dumps (safe to commit)
      decisions.json
      checkpoints.json
      sessions.json
    AGENTS.md             ← Passive continuity instructions for AI agents
    context.md            ← plain text state description
```

Rules files created under IDE folders allow models to pick up parameters:
* `.cursor/rules`
* `.windsurf/rules`
* `.zed/rules`

---

## Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js (ESM) | CLI executor and server runner |
| **CLI Framework** | React + Ink + `@inkjs/ui` | Interactive console rendering |
| **Local Database** | SQLite (`better-sqlite3`) | Fast workspace transactions |
| **Code Watching** | Chokidar | File alteration change triggers |
| **Smart Layer** | Groq SDK (`llama-3.3-70b-versatile`) | Natural language normalization & handoffs |
| **Cloud Sync** | Cloudflare Workers + D1 Database | Team backend deployment |

---

## Documentation

* **Product Requirements:** [ideos-final.md](file:///c:/ideos/ideos-final.md)
* **API & System Context:** [.ideos/context.md](file:///c:/ideos/.ideos/context.md)
* **Agent Guidelines:** [.ideos/AGENTS.md](file:///c:/ideos/.ideos/AGENTS.md)
