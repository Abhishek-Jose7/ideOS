# Scar

### Development doesn't stop when you do.

```
Friday    → Windsurf
Saturday  → Cursor
Monday    → Teammate
Wednesday → New hire
```

Nobody re-explains anything.

---

## What It Is

Scar is a development continuity layer. It lives in your project directory and gives every AI IDE — running simultaneously or used sequentially — a shared, persistent understanding of the project.

It is not an IDE. It is not an AI agent. It is not a task board.
It is the memory layer underneath all of them.

---

## What It Looks Like

### First time in a project

```
$ scar init

  ┌──────────────────────────────────────────┐
  │  Scar — Development continuity.         │
  └──────────────────────────────────────────┘

  ? How do you primarily work?
    ❯ Sequential   I switch IDEs when credits run out
      Parallel     I run multiple IDEs at the same time
      Both

  ? IDEs detected:
    ✅ Windsurf     found
    ✅ Cursor       found
    ✅ KiloCode     found
    ○  Trae         not found
    ○  Zed          not found

  ? Where should state live?
    ❯ Local     just me, this machine
      Cloud     team or multiple machines
                (needs a Scar workspace URL)

  Connecting...
  ✓ Windsurf    installed · verified
  ✓ Cursor      installed · verified
  ✓ KiloCode    installed · verified
  ✓ Git hooks installed
  ✓ Context files written

  scar resume     → continue where you left off
  scar start      → open dashboard
  scar explain    → understand current project state
```

Run once. Never again.

---

### Resuming work

```
$ scar resume

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

  [Enter]
```

The chosen IDE opens with this context pre-loaded. The AI continues immediately. No re-explaining, no re-indexing, no lost decisions.

---

### Understanding a feature

```
$ scar explain authentication

  Feature: Authentication
  Status:  In Progress · 60%

  Goal
  Stateless JWT authentication for the REST API.

  Active Workers
  ● Windsurf (Abhishek)   last active 4h ago
  ○ Cursor (Sarah)        idle

  Completed
  → JWT signing with RS256
  → Auth middleware
  → Login endpoint

  Remaining
  → Refresh token rotation
  → Auth test suite
  → Connect to user DB

  Decisions
  → JWT not sessions     stateless API requirement
  → RS256 not HS256      multi-service token verification
  → No DB refresh store  Redis planned later

  Files Touched
  auth/jwt.ts · middleware/auth.ts · types/auth.ts · config/auth.ts
```

---

### Feature timeline

```
$ scar timeline authentication

  Authentication · Development Timeline

  Mon Jun 16
  09:23  Windsurf · Abhishek    session started
  11:47  ─ checkpoint           JWT signing done
  12:01  ─ session ended        2h 38m

  Tue Jun 17
  10:15  Cursor · Abhishek      session started
  13:22  ─ checkpoint           login endpoint wired
  13:45  ─ session ended        3h 30m

  Wed Jun 18
  09:00  KiloCode · Sarah       session started
  12:00  ─ decision             RS256 not HS256
  12:15  ─ checkpoint           auth tests added
  12:30  ─ session ended        3h 15m
```

All data already exists from sessions, checkpoints, and decisions. Timeline is a read-only view.

---

### Parallel mode dashboard

```
$ scar start

┌─ Scar ──────────────────────────────── my-project ──────────┐
│                                                              │
│  Active                                                      │
│  ● Windsurf   authentication   (inferred 94%)    8s        │
│  ◑ Cursor     dashboard-ui     (claimed)          2m        │
│  ○ KiloCode   idle                                3h        │
│                                                              │
│  ⚠  Overlap: Windsurf + Cursor both near auth/utils/       │
│                                                              │
│  Features                                                    │
│  🔒 authentication    Windsurf · 60%    in progress         │
│  🔒 dashboard-ui      Cursor · 30%      in progress         │
│  ○  api-endpoints     unclaimed                             │
│  ○  tests             unclaimed                             │
│                                                              │
│  Decisions                                                   │
│  auth-strategy  → JWT, RS256, stateless                     │
│  api-format     → REST not tRPC                             │
│  db             → PostgreSQL via Supabase                   │
│                                                              │
│  Last snapshot: 6 min ago                                   │
│                                                              │
│  [e] explain  [t] timeline  [r] resume  [q] quit            │
└──────────────────────────────────────────────────────────────┘
```

Worker status has three states, not two:
- `●` active — MCP heartbeat within 90s
- `◑` likely active — file or git activity within 5 min, no heartbeat
- `○` inactive — no signals

Binary active/inactive breaks when IDEs don't send heartbeats. Three-state handles partial IDE cooperation gracefully.

---

## How It Works

### The File Structure

```
your-project/
  .scar/
    db.sqlite             ← local only, .gitignored
    exports/
      features.json       ← committed to git
      decisions.json      ← committed to git
      checkpoints.json    ← committed to git
      sessions.json       ← committed to git
    AGENTS.md             ← committed to git
  .cursor/rules           ← written by scar init
  .windsurf/rules         ← written by scar init
```

`db.sqlite` is never committed. Binary files cannot be merged in git. Instead, Scar exports human-readable JSON on every state change. Git merges JSON cleanly. When a teammate clones the repo and runs `scar init`, it reads `exports/` and hydrates a fresh local database instantly.

### How IDEs Connect

`scar init` writes a config snippet into each detected IDE's config file. The format is identical across all IDEs — only the file path differs:

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

Each IDE spawns `npx scar-mcp` as a child process on demand. No background daemon. No port. Nothing running unless an IDE needs it. All IDE instances — open simultaneously or used days apart — hit the same `.scar/db.sqlite`.

### IDE Adapters

MCP is the standard. The config details differ per IDE. Each IDE gets its own adapter class:

```typescript
interface IDEAdapter {
  name: string
  transport: 'stdio' | 'sse'
  detect(): Promise<boolean>
  install(config: ScarConfig): Promise<void>
  verify(): Promise<boolean>
}
```

`scar init` runs detect → install → verify for each adapter. If verify fails, it tells you exactly what went wrong. Not a silent failure.

### Context Injection — Four Layers

AGENTS.md is not a guaranteed protocol. Some IDEs follow it. Some partially follow it. Some ignore it. Scar writes four layers and assumes any combination of them might work:

```
Layer 1: MCP Resources
         Some IDEs auto-load these before the AI starts.
         No AI cooperation needed.

Layer 2: Per-IDE rules files
         .cursor/rules, .windsurf/rules, .zed/rules
         Written directly by scar init.
         IDE reads them natively, no AI needed.

Layer 3: .scar/AGENTS.md
         Instructions for the AI: call scar_workspace() at start,
         scar_heartbeat() every 60s, etc.
         Best effort — works when IDE cooperates.

Layer 4: .scar/context.md
         Regenerated on every state change.
         Plain markdown snapshot of current project state.
         Passive fallback — even if nothing else works,
         a developer can paste this into any AI manually.
```

Scar works even if the AI never calls a single MCP tool. Continuity is guaranteed at the file level. MCP cooperation makes it richer and more automatic.

### Snapshots — Automatic, No AI Needed

Two triggers that require zero AI cooperation:

**File save debounce:** File watcher detects saves. After 30 seconds of inactivity, lightweight snapshot saved. Covers "3 hours worked, zero commits, credits exhausted."

**Git post-commit hook:** Richer snapshot on every commit. Includes diff. Both triggers write to the checkpoints table and re-export JSON.

Explicit `scar_checkpoint()` from the AI is additive — richer content, better summaries — but never the only mechanism.

### Heartbeat — Three Signal Sources

```typescript
type WorkerStatus = 'active' | 'likely_active' | 'inactive'

function getStatus(worker: Worker): WorkerStatus {
  const now = Date.now()
  if (now - worker.last_heartbeat    < 90_000)  return 'active'
  if (now - worker.last_file_activity < 300_000) return 'likely_active'
  if (now - worker.last_git_activity  < 600_000) return 'likely_active'
  return 'inactive'
}
```

Heartbeat is one signal, not the only signal. File watcher and git hook update `last_file_activity` and `last_git_activity` automatically. No AI cooperation required for either.

### The Two Backends

```
Local (default):
  Transport:  stdio
  Storage:    .scar/db.sqlite
  For:        solo, one machine

Cloud (set SCAR_BACKEND=cloud + SCAR_WORKSPACE_URL=...):
  Transport:  HTTP SSE
  Storage:    Cloudflare D1
  For:        teams, multiple machines
```

Same MCP tools. Same schema. Same everything. One environment variable switches between them. The cloud backend is a Cloudflare Worker wrapping the same business logic with D1 instead of SQLite.

---

## MCP Tools

What every connected IDE gets. Called by the AI during sessions.

**`scar_workspace()`**
Called at session start. Returns full project state from this IDE's perspective.
```json
{
  "features": [],
  "active_workers": [],
  "decisions": [],
  "recent_activity": [],
  "my_context": "You last worked on authentication 4h ago. Files: jwt.ts, middleware.ts"
}
```

**`scar_current_work()`**
Infers what the IDE is working on without explicit claiming. Reads git branch, recently modified files, last checkpoint. One Groq call classifies these into a feature. Returns a suggestion, not an auto-claim.
```json
{
  "likely_feature": "authentication",
  "confidence": 0.94,
  "signals": ["branch: feature/auth-jwt", "files: jwt.ts, middleware.ts"],
  "suggestion": "Should I claim authentication for you?"
}
```

**`scar_claim(feature)`**
Claim a feature after suggestion is confirmed. Returns conflict info if already claimed.

**`scar_remember(key, value, feature?)`**
Store a decision, optionally scoped to a feature.

**`scar_recall(key?, feature?)`**
Retrieve decisions. No args returns everything.

**`scar_checkpoint(feature)`**
Explicit progress snapshot. AI fills summary, files touched, blockers, next steps.

**`scar_handoff(feature)`**
Groq synthesizes all feature state into a structured brief. Used internally by `scar resume`.

**`scar_done(feature, summary)`**
Mark feature complete.

**`scar_heartbeat()`**
Called every 60s by cooperating IDEs. One of three worker activity signals.

---

## LLM Calls — Three, Total

| Where | Input | Output |
|---|---|---|
| `scar_current_work()` | branch name + recent files + feature list | feature classification + confidence |
| `scar_handoff()` | all feature state | structured resume brief |
| `scar_claim()` — duplicate check | new claim + existing features | semantic similarity score |

All three use Groq + llama-3.3-70b-versatile. ~5-10 calls per day across a full session. Cost is negligible.

---

## Database Schema

```sql
features (
  id, name, description,
  status,      -- planning | active | done | blocked
  created_at, updated_at
)

tasks (
  id, feature_id,
  name, description,
  status,      -- open | in_progress | done | blocked
  created_at, updated_at
)

task_workers (
  task_id, worker_id,
  role,        -- primary | supporting
  joined_at
)

sessions (
  id, worker_id,
  ide,         -- windsurf | cursor | kilocode | trae | zed | ...
  feature_id,
  started_at,
  ended_at     -- null if active
)

checkpoints (
  id, feature_id, worker_id,
  summary, progress,
  files_touched,  -- JSON array
  blockers,       -- JSON array
  next_steps,     -- JSON array
  source,         -- manual | file_watch | git_hook
  created_at
)

decisions (
  id, feature_id,  -- null = project-wide
  key, value,
  created_by,
  created_at
)

inferences (
  id, worker_id,
  likely_feature, confidence,
  signals,     -- JSON
  confirmed,   -- 0 | 1
  created_at
)

workers (
  id, name, ide,
  last_heartbeat,
  last_file_activity,
  last_git_activity,
  current_feature
)

activity_log (
  id, worker_id,
  action, detail,
  created_at
)
```

---

## IDE Support

Every IDE on this list works with zero Scar-specific code beyond the adapter config layer. MCP is the universal bus.

**Full MCP support — production ready:**

| IDE | Free Tier | Notes |
|---|---|---|
| Cursor | ✅ | `.cursor/mcp.json` |
| Windsurf | ✅ | `~/.codeium/windsurf/mcp_config.json` |
| KiloCode | ✅ | VS Code extension, settings.json |
| Continue | ✅ fully free | VS Code + JetBrains |
| Cline | ✅ BYOK | VS Code extension |
| Roo Code | ✅ BYOK | VS Code extension |
| Trae | ✅ fully free | ByteDance |
| Antigravity | ✅ | |
| Zed | ✅ | `~/.config/zed/settings.json` |
| Claude Code | ✅ limited | CLI |

**MCP support, preview or partial:**

| IDE | Notes |
|---|---|
| All JetBrains IDEs | IntelliJ, PyCharm, WebStorm, GoLand, Rider, etc. |
| VS Code + Copilot | Agent mode required |
| Visual Studio | Preview |
| Xcode | Via GitHub Copilot |
| Replit | |
| Cody (Sourcegraph) | Via OpenCTX |

**Community MCP support:**

| IDE | Notes |
|---|---|
| Neovim | Community plugins |
| Emacs | Community plugins |

Any IDE that adds MCP support in the future gets Scar compatibility automatically. No code change required.

---

## Publishing

```
npm publish scar-mcp   ← MCP server. IDEs pull this via npx. Users never install it.
npm publish scar       ← CLI. Developers install this once.
```

```bash
npm install -g scar
cd my-project
scar init
```

Done. The IDEs handle the rest.

**Distribution:**
- MCP registries first: mcpservers.com, mcp.so, glama.ai — developers actively browse these to find servers for their IDEs
- Windsurf MCP Marketplace — listed inside the IDE
- GitHub README — the demo is `scar resume` output followed by the IDE opening with full context. 60 seconds, no voiceover, no explanation needed
- r/cursor, r/ChatGPTCoding, r/LocalLLaMA

---

## Positioning

**Category:** Development Continuity

**One line:** Development doesn't stop when you do.

**What that covers:**
- Switching IDEs when free tier credits run out → resume
- Coming back after a weekend → resume
- Teammate picking up your work → resume
- New hire onboarding to an existing project → resume

Memory is how it works. Continuity is what users buy.
