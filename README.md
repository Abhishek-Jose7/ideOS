# ideOS

### Your project memory, across every IDE.

**ideOS** is a development continuity layer that gives Cursor, Windsurf, Zed, Claude Code, Antigravity, and Trae a shared, persistent understanding of your project.

---

## The Scenario

### The Problem
You are building a feature in **Cursor**. After a few hours of intense debugging, you hit your daily fast request credit limit. You switch to **Windsurf** to keep working, but Windsurf has no idea what you just did, what decisions you made, or which files were changed. You spend 15 minutes copying logs, pasting code snippets, and re-explaining the context to the AI—wasting both time and tokens.

### The Solution
With **ideOS** running in the background:
1. You close Cursor.
2. You open Windsurf and run `ideos resume`.
3. The IDE launches pre-loaded with the exact feature progress, touched files, design decisions, and blockers.

The AI picks up right where you left off. **Nobody re-explains anything.**

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
| `ideos status` | Print single-line status for shell prompts (PS1). | `ideos status` |
| `ideos diff` | Show what changed since your last session. | `ideos diff` |
| `ideos import` | Backfill features and checkpoints from git history. | `ideos import --limit 100` |
| `ideos reset` | Wipe a feature's state and all associated data. | `ideos reset auth-system` |
| `ideos onboard` | Generate a structured briefing for new team members. | `ideos onboard` |
| `ideos doctor` | Validate local state and auto-repair with `--fix`. | `ideos doctor --fix` |
| `ideos ides` | List all available IDE adapters. | `ideos ides` |
| `ideos detect` | Scan your machine for installed IDEs & extensions. | `ideos detect` |
| `ideos version` | Print package version. | `ideos version` |

Run `ideos <command> --help` for subcommand-specific flags.

### Understanding Key CLI Commands

While `ideos` provides several commands, here is how the primary setup and inspection commands differ:

* **`ideos ides` (Info Only)**: Prints a list of all editors that ideOS supports out-of-the-box, where it expects to write their config, and if they are currently set up in this repo. *It does not check if they are installed on your computer.*
* **`ideos detect` (Scan Only)**: Runs a system-wide scan of your computer's folders (Applications, AppData, PATH) and prints which editors you actually have installed. *It does not install or write files.*
* **`ideos init` (Setup)**:
  * Creates the local database `.ideos/db.sqlite` and git hooks.
  * Runs a system-wide scan (like `detect`).
  * Shows an **Interactive Checklist**: Prompts you to pick which of those detected editors you want to configure.
  * Automatically writes the correct config file (e.g. `.cursor/mcp.json`, `.antigravity/mcp.json`, etc.) to register the `ideos` MCP server in those selected IDEs.
* **`ideos start` (The Dashboard)**: Launches a terminal dashboard that refreshes in real-time. It visualizes:
  * **Active Workers**: What IDEs you currently have open, what they are working on, and how long ago they wrote code.
  * **Features**: A checklist of features under development, their progress %, and who claimed them.
  * **Conflicts**: Warnings if two editors are accidentally modifying files in the same feature area at the same time.

---

## IDE Support

| IDE | Free Tier | MCP Configuration | Status |
| :--- | :--- | :--- | :--- |
| **Cursor** | ✅ Yes | `.cursor/mcp.json` | Production |
| **Windsurf** | ✅ Yes | `~/.codeium/windsurf/mcp_config.json` | Production |
| **Codex** | ✅ Yes | `.vscode/settings.json` | Production |
| **Zed** | ✅ Yes | `~/.config/zed/settings.json` | Production |
| **Trae** | ✅ Yes | `.trae/mcp.json` | Production |
| **Antigravity** | ✅ Yes | `.antigravity/mcp.json` | Production |
| **Claude Code**| ◑ Partial | `.claude/mcp.json` | Production |
| **KiloCode** | ✅ Yes | `.vscode/settings.json` | Production |
| **QCoder** | ✅ Yes | `.mcp.json` | Production |
| **Continue** | ✅ Yes | `.continue/mcpServers.json` | Production |
| **Cline** | ◑ BYOK | `.cline/mcp.json` | Production |
| **Roo Code** | ◑ BYOK | `.roo/mcp.json` | Production |

---

## Workflows

### Flow A: Starting a Brand New Project from Scratch
If you are starting a new codebase:
1. Initialize your project directory:
   ```bash
   mkdir my-project && cd my-project
   ```
2. Initialize Git (Git is required so ideOS auto-hooks can run):
   ```bash
   git init
   ```
3. Run initialization:
   ```bash
   ideos init
   ```
4. Select your editors (e.g., Cursor, Codex) from the interactive prompt.
5. Choose your backend (Local SQLite or Cloud Sync).
6. Open the project in your IDE. The IDE's built-in AI assistant will detect the `.ideos` MCP config and automatically query project history, saving feature checkpoints in the background as you code.

---

### Flow B: Configuring ideOS in an Existing Project
If you want to add continuity to a project you are already working on:
1. Navigate to your project directory:
   ```bash
   cd existing-project
   ```
2. Run initialization to set up local files and register MCP:
   ```bash
   ideos init
   ```
3. Import your project history:
   ```bash
   ideos import --limit 100
   ```
   > [!TIP]
   > This command is highly recommended! It reads your git commit history, groups past commits into logical features using LLMs/heuristics, and builds an instant memory base so the AI immediately understands what you worked on previously.
4. Open your IDE and continue coding.

---

### Flow C: The Daily Switch (Credit Depletion Flow)
When you need to switch editors (e.g. because of credit limits or tool preference):
1. You work on the feature `auth-system` in **Cursor**. Cursor automatically records checkpoints and notes that you updated `middleware/auth.ts` and selected RS256 token signing.
2. Your Cursor credits expire. You close Cursor.
3. In your terminal, run:
   ```bash
   ideos resume
   ```
4. Select **Codex** (or **Windsurf**, **Trae**, etc.) from the menu.
5. ideOS launches the editor pre-loaded with the active feature state. The AI immediately sees that you are 60% done with `auth-system` and need to finish refresh tokens. **No re-explaining necessary.**

---

### Flow D: Monitoring (The Live Dashboard)
To view the status of your team's workspace:
```bash
ideos start
```
This opens an interactive terminal dashboard that refreshes in real-time, displaying active workers, claimed features, and conflict warnings if two editors touch the same files.

---

### Flow E: Team Onboarding
To quickly catch up new team members:
```bash
ideos onboard
```
Generates an `ONBOARDING.md` briefing summarizing features, progress, decisions, and recent activity.

---

## Under the Hood & Troubleshooting

### Why does running `ideos mcp` directly do nothing?
`ideos mcp` starts the Model Context Protocol (MCP) server over stdin/stdout. It reads JSON-RPC requests from standard input (stdin) and writes responses to standard output (stdout). 
When run directly by a human in a terminal, it waits indefinitely for JSON-RPC messages from your keyboard, which looks like it hung.

To prevent confusion, running `ideos mcp` directly in an interactive terminal now detects standard input and prints diagnostic instructions to standard error (stderr):
```text
ideOS MCP Server started (stdio transport mode)
This process is designed to be launched by your AI IDE (Cursor, Windsurf, Trae, etc.) as an MCP client.
It listens on stdin/stdout and does not accept direct keyboard input.
Press Ctrl+C to terminate this process.
--------------------------------------------------
```

### Codex & QCoder Detection Details
- **Codex**: OpenAI Codex on Windows installs to `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe` instead of the standard `%LOCALAPPDATA%\Programs`. ideOS checks custom vendor search paths (like `OpenAI\<name>\bin`) to ensure Codex is successfully detected out-of-the-box.
- **QCoder**: During detection, all adapters are displayed and scrollable. The initialization wizard has been configured to display all available options, ensuring no adapters are silently truncated.

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
