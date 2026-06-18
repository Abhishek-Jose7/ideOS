# Scar

Development doesn't stop when you do.

Scar is a development continuity layer for AI IDEs. It lives inside a project directory, stores feature-centered state in `.scar/db.sqlite`, exports mergeable JSON, and exposes the same continuity through a CLI and MCP server.

## Install

```bash
npm install -g scar
cd my-project
scar init
```

For local development in this repository:

```bash
npm install
node ./src/cli.js init --yes
node ./src/cli.js resume
```

## Commands

```bash
scar init
scar resume
scar start
scar explain <feature>
scar timeline <feature>
scar checkpoint <feature> --summary "..." --progress 60
scar claim <feature>
scar remember <key> <value> --feature <feature>
scar recall
scar current-work
scar done <feature> --summary "..."
```

## MCP

Scar exposes these tools to connected IDEs:

- `scar_workspace`
- `scar_current_work`
- `scar_claim`
- `scar_remember`
- `scar_recall`
- `scar_checkpoint`
- `scar_handoff`
- `scar_done`
- `scar_heartbeat`

The installed MCP config points IDEs at:

```json
{
  "mcpServers": {
    "scar": {
      "command": "npx",
      "args": ["-y", "scar-mcp"],
      "env": { "SCAR_WORKSPACE": "${workspaceFolder}/.scar" }
    }
  }
}
```

## State Model

Feature is the top-level abstraction. Tasks, sessions, checkpoints, decisions, inferences, and workers all relate to the current feature through `feature_id` or `current_feature`.

Local state:

```text
.scar/db.sqlite
.scar/exports/features.json
.scar/exports/decisions.json
.scar/exports/checkpoints.json
.scar/exports/sessions.json
.scar/AGENTS.md
.scar/context.md
```

`db.sqlite` is ignored. JSON exports and context files are safe to commit.
