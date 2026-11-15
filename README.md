# ideOS

### Your project memory, across every IDE.

**ideOS** is a development continuity layer that gives Cursor, Windsurf, Zed, Claude Code, Antigravity, and Trae a shared, persistent understanding of your project.

---

## The Scenario

### The Problem
You are building a feature in **Cursor**. After a few hours of intense debugging, you hit your daily fast request credit limit. You switch to **Windsurf** to keep working, but Windsurf has no idea what you just did, what decisions you made, or which files were changed. You spend 15 minutes copying logs, pasting code snippets, and re-explaining the context to the AI—wasting both time and tokens.

### The Solution
With **ideOS** configured in both IDEs:
1. You close Cursor.
2. You open Windsurf and run `ideos resume`.
3. ideOS prints the saved feature context and opens the selected IDE. The IDE can query the same context through MCP.

The AI can use the saved context without manually copying notes. Whether it loads that context automatically depends on the IDE honoring its MCP instructions.

---

## Install

Install ideOS globally:
```bash
npm install -g ideos-cli
```

Requires Node.js 20.19 or newer.

---

## Quick Start

```bash
cd your-project
git init
ideos init
ideos resume
```

`ideos resume` prints the latest recorded context, then lets you choose an available IDE to open. It remembers your last choice; use `ideos resume --ide <id>` or `IDEOS_PREFERRED_IDE=<id>` to override it.

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

```

The context is available to the IDE through MCP after its `ideos` server is enabled. The CLI cannot inject a prompt into every IDE, so the AI may need to call `ideos_workspace` or the `ideos-resume` prompt.

---

## How It Works

ideOS writes a `.ideos/` directory in your project. Every AI IDE connects to it via MCP. Your context, decisions, and progress are available in every IDE, every session.

ideOS is language-neutral for continuity tracking; it does not build or compile your application. Its project analyzer recognizes JavaScript, TypeScript (`.ts`), JSX/TSX, Python, Go, Rust, Java, Ruby, PHP, C#, Swift, Kotlin, Vue, and Svelte files.

## Ways to Use ideOS

### With an AI coding assistant

Run `ideos init` in your project, select the IDE you use, then open the project and enable its `ideos` MCP server. Ask the assistant to load your ideOS workspace and current feature before making changes. For example:

> Check the ideOS workspace and current feature, load the relevant context, then help me implement the next step. Save a checkpoint when we finish.

The assistant can use ideOS through MCP once the host has connected and enabled the server. Confirm it has loaded the context before relying on it.

### From the terminal

Use `ideos init` for first-time setup and to choose your IDEs and optional AI provider. Use `ideos start` to view the interactive dashboard, or `ideos resume` to review saved work and open an IDE. You can also record progress directly with commands such as `ideos checkpoint` and `ideos remember`.

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
| `ideos remember` | Store a key-value choice, optionally normalized by the selected AI provider. | `ideos remember auth-strategy "JWT RS256"` |
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
  * Automatically writes the correct config file (e.g. `.cursor/mcp.json`, `.agents/mcp.json` for Antigravity, etc.) to register the `ideos` MCP server in those selected IDEs.
* **`ideos start` (The Dashboard)**: Launches a terminal dashboard that refreshes in real-time. It visualizes:
  * **Active Workers**: What IDEs you currently have open, what they are working on, and how long ago they wrote code.
  * **Features**: A checklist of features under development, their progress %, and who claimed them.
  * **Conflicts**: Warnings if two editors are accidentally modifying files in the same feature area at the same time.

---

## IDE Support

| IDE / tool | Free Tier | MCP configuration | Setup status |
| :--- | :--- | :--- | :--- |
| **Cursor** | ✅ Yes | `.cursor/mcp.json` | Config writer; verify in IDE |
| **Windsurf** | ✅ Yes | `~/.codeium/windsurf/mcp_config.json` | Config writer; verify in IDE |
| **Codex** | ✅ Yes | `.vscode/settings.json` | Config writer; verify in IDE |
| **Zed** | ✅ Yes | `~/.config/zed/settings.json` | Config writer; verify in IDE |
| **Trae** | ✅ Yes | `.trae/mcp.json` | Config writer; verify in IDE |
| **Antigravity** | ✅ Yes | `.agents/mcp.json` | Config writer; verify in IDE |
| **Claude Code**| ◑ Partial | `.claude/mcp.json` | Config writer; verify in IDE |
| **KiloCode** | ✅ Yes | `.vscode/settings.json` | Config writer; verify in IDE |
| **Qoder** | ✅ Yes | `.mcp.json` | Config writer; verify in IDE |
| **Continue** | ✅ Yes | `.continue/mcpServers.json` | Config writer; verify in IDE |
| **Cline** | ◑ BYOK | `.cline/mcp.json` | Config writer; verify in IDE |
| **Roo Code** | ◑ BYOK | `.roo/mcp.json` | Config writer; verify in IDE |
| **Freebuff CLI** | ✅ Yes | `.agents/mcp.json` | Config writer; CLI approval required |

These adapters write MCP configuration; they do not certify that every host version starts the server correctly. Freebuff support targets its CLI. Freebuff Desktop currently has a separate MCP approval flow, so this project config is not presented as Desktop support.

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
6. Open the project in your IDE and enable/approve the `ideos` MCP server. The MCP server watches file saves while the IDE keeps it running and records filenames in a delayed checkpoint. Use `ideos_checkpoint` or `ideos checkpoint` to save meaningful progress, decisions, blockers, and next steps; file watching cannot infer those details reliably.

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
1. You work on `auth-system` in **Cursor**. While the MCP server is running, ideOS records file-save activity. Record meaningful progress and decisions with MCP tools or `ideos checkpoint` / `ideos remember`.
2. Your Cursor credits expire. You close Cursor.
3. In your terminal, run:
   ```bash
   ideos resume
   ```
4. Select **Codex** (or **Windsurf**, **Trae**, etc.) from the menu.
5. ideOS prints the active feature summary and opens the selected editor. Once its MCP server is enabled, the AI can query the recorded state; check that it loaded the context before continuing.

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

## AI Provider Setup

During `ideos init`, choose Groq, OpenAI, Anthropic/Claude, OpenRouter, or offline mode. These are the provider APIs currently implemented for summaries and decision help. ideOS stores the selected provider's key in the project's ignored `.env` file.

```bash
# Example .env values (init writes these for you)
IDEOS_AI_PROVIDER=openrouter
IDEOS_AI_API_KEY=your_provider_api_key_here
# Optional OpenRouter model ID; defaults to openai/gpt-4o-mini.
# IDEOS_AI_MODEL=openai/gpt-4o-mini
```

Create a key from the account for the provider you selected: [Groq](https://console.groq.com/keys), [OpenAI](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key), [Anthropic/Claude](https://platform.claude.com/docs/en/get-api-key), or [OpenRouter](https://openrouter.ai/settings/keys). OpenRouter model IDs can be selected with `IDEOS_AI_MODEL`; choose a model that supports JSON output. OpenRouter can route to models from multiple providers, while arbitrary provider APIs are not automatically supported by ideOS. Provider use may require billing or credits. Never commit or share API keys. With no provider key or with offline mode, ideOS uses local fallbacks, so AI summaries and decision normalization are unavailable. In Cloud mode, set `IDEOS_AI_PROVIDER` and `IDEOS_AI_API_KEY` as Worker secrets; project `.env` values are not sent to the Worker.

## Freebuff CLI

Install [Freebuff CLI](https://freebuff.com/) and ideOS, then run `ideos init` in the repository and select **Freebuff CLI**. ideOS writes the standard MCP server entry to `.agents/mcp.json`. On the first CLI run, Freebuff may ask you to trust the project agent configuration; approve it only after reviewing the server command. Run `ideos resume` to launch Freebuff in the project directory.

The CLI adapter supports Freebuff's project MCP configuration (`.agents/mcp.json`); see Freebuff's [MCP config loader](https://github.com/CodebuffAI/freebuff/blob/main/sdk/src/agents/load-mcp-config.ts). Freebuff Desktop is detected separately and gets a snippet at `.ideos/freebuff-desktop-mcp.json`; add that server from Settings > MCP and approve it. See Freebuff's [Desktop MCP setup guide](https://freebuff.com/perspectives/docs/add-an-mcp-server-in-freebuff-desktop-settings).

Detection checks command paths, common install locations, Windows uninstall registry entries, and supported VS Code extension directories. It is best effort: new or portable IDE builds can be missed. `ideos ides` lists every supported adapter, including ones not detected, and `ideos detect` reports what this machine scan found. “Installed” only means a local install signal was found; it does not prove the app is signed in or that its MCP server connected.

---

## Cloud / Team Mode

ideOS supports team workspaces using a Cloudflare D1 backend.

```bash
# Add to .env in your project root
IDEOS_BACKEND=cloud
IDEOS_WORKSPACE_URL=https://your-ideos-worker.your-subdomain.workers.dev
IDEOS_API_KEY=your-long-random-secret
```

The workspace owner creates the key; ideOS does not issue accounts or keys. Generate one locally with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

From the Worker project directory, run `npx wrangler secret put IDEOS_API_KEY` and paste the generated value. Put that same value in each authorized teammate's ignored project `.env` as `IDEOS_API_KEY=...`. Share it privately; anyone holding it has full read and write access to that workspace. The Worker leaves `/health` public; all workspace state and write endpoints require the bearer key. Rotate the Worker secret and every project key together. Each Worker/D1 deployment is one shared workspace; deploy a separate instance and use a different key for each team. There is no multi-tenant user or role system yet.

For AI features in Cloud mode, also run `npx wrangler secret put IDEOS_AI_PROVIDER` (enter `groq`, `openai`, `anthropic`, or `openrouter`) and `npx wrangler secret put IDEOS_AI_API_KEY` (enter the matching provider key). Set `IDEOS_AI_MODEL` as a Worker secret to override the provider's default model. These are separate from `IDEOS_API_KEY`, which authorizes workspace access.

For Worker deployment and database migration setup, see [Cloud Setup](ideos-final.md#the-two-backends).

---

## Contributing & Community 🤝

We welcome all contributors! Whether you are adding an adapter for a new AI tool, improving CLI ergonomics, or polishing documentation, here is how you can jump in:

- 📖 **[Contributing Guide](CONTRIBUTING.md)**: Setup your local environment, understand project architecture, and submit a PR.
- 🗺️ **[Project Roadmap](ROADMAP.md)**: Explore what we've shipped, what is in progress, and planned milestones.
- 💡 **[Good First Issues](https://github.com/Abhishek-Jose7/ideOS/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)**: Bite-sized tasks ready for newcomers.

### Quick Ways to Help Right Now:
1. **Add an IDE / Tool Adapter**: Follow the documented adapter API and confirm the target tool supports the integration before adding configuration. See the [Adapter Guide](CONTRIBUTING.md#2-adding-a-new-ide--tool-adapter).
2. **Add `--json` Flags**: Help implement `--json` serialization for `ideos recall`, `explain`, and `timeline`.
3. **CI Coverage**: Report platform-specific failures and help expand automated coverage.
4. **Report Bugs & Ideas**: Found an edge case? [Open a Bug Report](https://github.com/Abhishek-Jose7/ideOS/issues/new?template=bug_report.yml) or [Propose a Feature](https://github.com/Abhishek-Jose7/ideOS/issues/new?template=feature_request.yml).

## Run Checks Locally

From a clone of the repository, install dependencies first:

```bash
npm install
```

Then run the checks from the repository root:

```bash
# Diagnose ideOS setup in the current workspace
npm run check

# Run the end-to-end CLI and MCP smoke check in a temporary workspace
npm run smoke

# Optional: check automatic file-save snapshots (takes about 35 seconds)
npm run test:watcher
```

If you edit the Ink dashboard source at `src/dashboard.jsx`, rebuild its generated bundle with `npm run build`. See the [Contributing Guide](CONTRIBUTING.md#-testing-guide) for development setup and check details.
