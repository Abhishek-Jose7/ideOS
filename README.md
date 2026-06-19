# Scar

Development doesn't stop when you do.

Scar is a development continuity layer for AI IDEs. It stores project memory by **feature**, not by task or file, so Cursor, Windsurf, Zed, Claude Code, Cline, Roo Code, Continue, Trae, Antigravity, and other MCP-aware tools can resume the same work without re-explaining the project.

## What You Get

- A `scar` CLI for setup, resume, explain, timeline, dashboard, checkpoints, and decisions.
- A `scar` CLI for setup, resume, explain, timeline, dashboard, checkpoints, decisions, and starting the MCP server.
- Local SQLite storage in `.scar/db.sqlite`.
- Mergeable JSON exports in `.scar/exports`.
- Groq-powered feature inference, handoffs, and decision normalization.
- Automatic file-save snapshots from the MCP server.
- Git post-commit snapshots.
- Optional Cloudflare Worker + D1 backend for teams.

Feature is the top-level abstraction. Everything important hangs off `feature_id`.

## Requirements

Install these first:

```bash
node --version
npm --version
git --version
```

Use Node.js 20 or newer.

## Step-by-Step Newbie Setup Guide

Follow this end-to-end flow to get Scar set up and running on your machine:

### 1. Install Requirements
Make sure you have Node.js (version 18 or newer), npm, and Git installed:
```bash
node --version
npm --version
git --version
```

### 2. Install Scar Globally
Install the Scar package globally on your machine so the `scar` command is available anywhere:
```bash
# From the project root folder:
npm install -g .
```

### 3. Set Up Environment Secrets
Create a `.env` file in your project root containing your Groq API key:
```bash
# On macOS/Linux:
cp .env.example .env

# On Windows (cmd):
copy .env.example .env
```
Edit `.env` and set:
```bash
GROQ_API_KEY=your_groq_api_key_here
SCAR_BACKEND=local
```
*(Do not commit `.env`. It is ignored on purpose. Optionally, set the key in your terminal session, e.g., in PowerShell: `$env:GROQ_API_KEY="your_groq_api_key_here"`)*

### 4. Initialize Scar in Your Project
Run the initialization wizard to create the local database, export folders, configure adapters, and set up git hooks:
```bash
# In your target project folder:
scar init
```
This wizard will:
- Write Layer 1 (MCP configurations in target IDE folders).
- Write Layer 2 (Rules files like `.cursor/rules`, `.windsurf/rules`, `.zed/rules`).
- Write Layer 3 (`.scar/AGENTS.md`) and Layer 4 (`.scar/context.md`).
- Install the git post-commit hook.

To run the initialization non-interactively (e.g. in CI or scripts), use:
```bash
scar init --yes
```

### 5. Verify IDE Configuration
List all available, detected, and configured IDE adapters to check setup status:
```bash
scar ides
```
> [!WARNING]
> While Scar writes the configuration files successfully (marking them `configured`), it cannot verify that your IDE account is logged in. Open Cursor, Windsurf, Zed, and other IDEs at least once to confirm you are properly logged in and that the MCP server is initialized and enabled.

### 6. Resume and Open Your IDE
Once you are ready to continue your development, run:
```bash
scar resume
```
This command displays the feature status and prompts you to select which IDE you want to launch. Pressing Enter will automatically open the selected IDE for the current workspace folder!

## Use The CLI

Now that `scar` is globally installed, you can use the `scar` command directly:

```bash
scar ides
scar current-work
scar claim authentication
scar checkpoint authentication --summary "JWT signing done" --progress 40 --files auth/jwt.ts
scar remember auth-strategy "JWT, RS256, stateless" --feature authentication
scar remember --prompt "For authentication we chose RS256 because multiple services need to verify tokens"
scar resume
scar explain authentication
scar timeline authentication
scar handoff authentication
scar start
scar start --once
```

`scar start` is the interactive terminal dashboard. Use `scar start --once` when you only want a single dashboard render for scripts or logs.

## IDE Adapter Inventory

Run:

```bash
scar ides
```

It shows every supported adapter:

- Cursor
- Windsurf
- KiloCode
- Trae
- Antigravity
- Continue
- Cline
- Roo Code
- Claude Code
- Zed

Statuses mean:

- `configured`: Scar wrote and verified the adapter config file.
- `detected`: Scar found an IDE folder but has not configured Scar there yet.
- `available`: Scar knows how to configure it, but it was not detected.

Warning/Notice: configured means Scar wrote/verified adapter files. It does NOT guarantee that the IDE is logged in or initialized. You must manually open each IDE once and verify that you are properly logged in and that the MCP server is initialized and enabled.

## MCP Tools

Scar exposes:

- `scar_workspace`
- `scar_current_work`
- `scar_claim`
- `scar_remember`
- `scar_recall`
- `scar_checkpoint`
- `scar_handoff`
- `scar_done`
- `scar_heartbeat`

The IDE config points at:

```json
{
  "mcpServers": {
    "scar": {
      "command": "npx",
      "args": ["-y", "scar", "mcp"],
      "env": {
        "SCAR_WORKSPACE": "${workspaceFolder}/.scar"
      }
    }
  }
}
```

When an IDE spawns `scar mcp`, Scar also starts a file-save watcher. Saves update `last_file_activity`. After 30 seconds of quiet, Scar writes a `file_watch` checkpoint and re-exports JSON.

## Git Hook Verification

Scar installs `.git/hooks/post-commit`.

Verify manually:

```bash
scar checkpoint --auto --source git_hook
scar recall
```

Verify through Git:

```bash
git -c user.name="Scar Hook Test" -c user.email="scar-hook-test@example.invalid" commit --allow-empty -m "verify scar git hook"
scar timeline unclassified-work
```

The hook should:

- Write a `git_hook` checkpoint.
- Re-export `.scar/exports/checkpoints.json`.
- Update `workers.last_git_activity` for `git:post-commit`.

## Groq Integration

Set:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

Groq powers:

- `scar_current_work`: classifies branch and file signals into a feature.
- `scar_handoff`: synthesizes a resume brief.
- `scar_remember --prompt`: turns natural language into a stable decision key, value, and optional `feature_id`.

If `GROQ_API_KEY` is missing, Scar still works with local fallbacks, but prompt-only decision capture requires Groq.

## Local State

```text
.scar/
  db.sqlite
  exports/
    features.json
    decisions.json
    checkpoints.json
    sessions.json
  AGENTS.md
  context.md
```

`db.sqlite` is ignored. JSON exports and markdown context are safe to commit.

## Cloud Backend

Cloud mode uses:

- Cloudflare Worker in `cloud/worker.js`.
- D1 database with migrations in `migrations/`.
- HTTP JSON endpoints plus `/events` for SSE.
- `SCAR_BACKEND=cloud` and `SCAR_WORKSPACE_URL` to switch CLI/MCP storage to cloud.

Install Wrangler:

```bash
npm install
npx wrangler --version
```

Log in:

```bash
npx wrangler login
```

Create D1:

```bash
npx wrangler d1 create scar-cloud
```

Copy the returned `database_id` into `wrangler.jsonc`.

Apply migrations locally:

```bash
npx wrangler d1 migrations apply scar-cloud --local
```

Apply migrations remotely:

```bash
npx wrangler d1 migrations apply scar-cloud --remote
```

Set the Groq secret for the Worker:

```bash
npx wrangler secret put GROQ_API_KEY
```

Deploy:

```bash
npx wrangler deploy
```

Set your local environment:

```powershell
$env:SCAR_BACKEND="cloud"
$env:SCAR_WORKSPACE_URL="https://your-scar-worker.your-subdomain.workers.dev"
```

Verify:

```bash
scar doctor
scar current-work
scar checkpoint authentication --summary "Cloud checkpoint works"
scar resume
```

## Test The Package

```bash
npm run smoke
npm pack --dry-run
```

The smoke test creates a fresh temporary project, runs init/checkpoint/remember/resume/timeline, starts the MCP server, lists tools, and calls `scar_workspace`.
