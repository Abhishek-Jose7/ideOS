# ideOS

### Development continuity layer for AI-assisted software engineering.

[![NPM Version](https://img.shields.io/npm/v/ideos-cli?color=indigo)](https://www.npmjs.com/package/ideos-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Support](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

ideOS bridges context across AI coding assistants (such as Cursor, Windsurf, Zed, Claude Code, Trae, Cline, and Roo Code) by establishing a local and cloud-compatible project memory layer. It preserves active features, key design decisions, session histories, and file-watching checkpoints so that developer tools can resume work seamlessly without duplicating work or losing structural context.

---

> [!TIP]
> **View Full Documentation on GitHub**
> For the complete documentation, interactive console guides, architecture details, and project updates, please visit the official [ideOS GitHub Repository](https://github.com/Abhishek-Jose7/ideOS).

---

## The Core Concept

When switching between different AI tools or collaborating on a team, context drift, duplicate effort, and credit exhaustion can disrupt momentum. 

ideOS operates underneath your development environment to synchronize feature-centric progress. It collects file edits, git activities, and explicit checkpoints into a single state, exposing them as **Model Context Protocol (MCP)** resources and native editor rule definitions.

```
                  ┌───────────────────────────────┐
                  │          ideOS Core           │
                  │  (Local SQLite + Git Hooks)   │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │  MCP Server   │
                          └───────┬───────┘
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   Cursor Rules            Windsurf Rules             Zed Rules
 (Cursor/Claude)         (Windsurf/Cody)             (Zed/Trae)
```

---

## Key Pillars

* **Feature-Level Scope:** Groups tasks, files modified, and progress under distinct `feature_id` definitions rather than individual directories or files.
* **Auto-Debounced Snapshots:** A background file watcher automatically captures progress checkpoints on file saves and git commits, ensuring zero-dependency recovery.
* **Passive Rule Injection:** Automatically updates configuration rules (e.g. `.cursor/rules`, `.windsurf/rules`, `.ideos/context.md`) so that even offline/non-MCP tools stay aligned.
* **Flexible Storage Backends:** Runs as a local SQLite database (`.ideos/db.sqlite`) for solo developers, with one-line configuration shifts to Cloudflare D1 for shared teams.

---

## Command Reference

### Setup & Health
* `ideos init` — Setup directory integration, install post-commit hooks, and register IDE rules.
* `ideos ides` — List all compatible IDE adapters and verify their configuration status.
* `ideos detect` — Search local workstation for installed AI editors.
* `ideos doctor` — Diagnose the health of the local SQLite workspace database.

### Workflow Management
* `ideos claim <feature>` — Claim ownership of a feature task for your active worker.
* `ideos checkpoint <feature> --summary "..."` — Manually save progress (percentage, touched files, blockers, next steps).
* `ideos done <feature>` — Mark a feature completed (100% progress).
* `ideos current-work` — Auto-infer the active feature using active git branch and modified files.

### Shared Decisions & Handoffs
* `ideos remember <key> <value>` — Register a project decision (e.g. choice of package, pattern).
* `ideos remember --prompt "..."` — Save a Groq-normalized natural language choice.
* `ideos recall [key]` — Query stored decisions.
* `ideos handoff <feature>` — Compile a structured, Groq-summarized handoff brief to transition the task.
* `ideos timeline <feature>` — View an activity timeline of sessions, commits, and milestones.

---

## Quick Start

### 1. Installation
Install ideOS globally:
```bash
npm install -g ideos-cli
```

### 2. Initialization
Run the setup wizard within your git project root:
```bash
ideos init
```
This detects installed editors, configures MCP settings, creates `.ideos/` database folders, and configures post-commit hooks.

### 3. Claiming Features
Mark your active task feature:
```bash
ideos claim feature-authentication
```

### 4. Running the Dashboard
Open the interactive terminal dashboard to monitor concurrent worker activity, file overlaps, and project decisions:
```bash
ideos start
```

---

## File Structure

Your project maintains the following footprint:
```text
your-project/
  .ideos/
    db.sqlite             ← Local SQLite database (git-ignored)
    exports/
      features.json       ← Human-readable JSON snapshots (safe to commit)
      decisions.json
      checkpoints.json
      sessions.json
    AGENTS.md             ← Instructions loaded by MCP AI engines
    context.md            ← Plain text state snapshot
  .cursor/rules/          ← Generated adapter rules
  .windsurf/rules/        ← Generated adapter rules
```

---

## Tech Stack

* **Runtime:** Node.js (ESM)
* **Local Storage:** SQLite via `better-sqlite3`
* **CLI Rendering:** React + Ink + `@inkjs/ui`
* **File Watching:** Chokidar
* **LLM Integration:** Groq SDK (`llama-3.3-70b-versatile`)
* **Cloud Sync:** Cloudflare Workers + D1 database

---

## License

MIT © Abhishek Jose
