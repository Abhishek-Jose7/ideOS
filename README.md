# ideOS

### Your project memory, across every IDE.

**ideOS** is a development continuity layer that gives Cursor, Windsurf, Zed, Claude Code, and Trae a shared, persistent understanding of your project.

---

## The Scenario

```text
Friday    → Windsurf
Saturday  → Cursor
Monday    → Teammate
Wednesday → New hire

Nobody re-explains anything.
```

---

## Install

Install ideOS globally:
```bash
npm install -g ideos-cli
```

---

## Quick Start

```bash
cd your-project
git init
ideos init
ideos resume
```

Running `ideos resume` launches your chosen IDE pre-loaded with active context:

```text
$ ideos resume

  Last session: Windsurf · 4h ago · 2h 14m

  Feature: Authentication
  ─────────────────────────────────────────
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
    KiloCode
```

---

## How It Works

ideOS writes a `.ideos/` directory in your project. Every AI IDE connects to it via MCP. Your context, decisions, and progress are available in every IDE, every session.

---

## Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `ideos init` | Setup directory database, git hooks, and rules. | `ideos init` |
| `ideos resume` | Continue a feature task or open your preferred IDE. | `ideos resume` |
| `ideos start` | Open interactive console monitoring dashboard. | `ideos start` |
| `ideos explain` | View deep feature status, workers, and decisions. | `ideos explain auth-system` |
| `ideos timeline` | Print history of sessions and commits. | `ideos timeline auth-system` |
| `ideos claim` | Set active feature ownership for this editor. | `ideos claim auth-system` |
| `ideos checkpoint` | Record manual progress snapshot and description. | `ideos checkpoint auth-system --progress 60` |
| `ideos remember` | Store a key-value or Groq-normalized project choice. | `ideos remember auth-strategy "JWT RS256"` |
| `ideos recall` | Retrieve recorded project and feature decisions. | `ideos recall` |
| `ideos current-work`| Auto-classify feature from active git branch and files. | `ideos current-work` |
| `ideos handoff` | Synthesize a resume brief for other IDEs or teammates. | `ideos handoff auth-system` |
| `ideos done` | Mark feature task as complete (100% progress). | `ideos done auth-system` |
| `ideos doctor` | Run health checks on local database schema. | `ideos doctor` |
| `ideos version` | Print package version. | `ideos version` |

---

## IDE Support

| IDE | Free Tier | MCP Configuration | Status |
| :--- | :--- | :--- | :--- |
| **Cursor** | ✅ Yes | `.cursor/mcp.json` | Production |
| **Windsurf** | ✅ Yes | `~/.codeium/windsurf/mcp_config.json` | Production |
| **Zed** | ✅ Yes | `~/.config/zed/settings.json` | Production |
| **Trae** | ✅ Yes | Built-in VS Code settings adapter | Production |
| **Claude Code**| ◑ Partial | CLI tools adapter | Production |
| **Continue** | ✅ Yes | `config.json` | Production |
| **Cline** | ◑ BYOK | VS Code extension server settings | Production |
| **Roo Code** | ◑ BYOK | VS Code extension server settings | Production |
| **KiloCode** | ✅ Yes | settings.json | Production |
| **JetBrains** | ❌ No | Community plugins | Preview |

---

## Groq Setup

To enable natural language decision normalization and smart context summaries, configure your Groq key:

```bash
# Create .env in your project root
GROQ_API_KEY=gsk_your_key_here
```

* **Where to get a key:** Create a free API key at the [Groq Console](https://console.groq.com/).
* **Fallback behavior:** If no key is set, ideOS runs completely offline using local heuristics for context indexing.

---

## Cloud / Team Mode

ideOS supports team workspaces using a Cloudflare D1 backend.

```bash
# Add to .env in your project root
IDEOS_BACKEND=cloud
IDEOS_WORKSPACE_URL=https://your-ideos-worker.your-subdomain.workers.dev
```

*For workers deployment and database migrations setups, refer to the [Cloud Setup documentation](https://github.com/Abhishek-Jose7/ideOS/blob/main/ideos-final.md#the-two-backends).*

---

## Contributing

We welcome issues and pull requests to improve ideOS. To report bugs, request features, or contribute adapters, visit the [GitHub issues page](https://github.com/Abhishek-Jose7/ideOS/issues).
