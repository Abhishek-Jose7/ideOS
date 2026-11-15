# ideOS Roadmap 🗺️

> **Mission**: Eliminate context fragmentation across AI-powered coding environments. Switch between Cursor, Windsurf, Claude Code, Zed, and other AI IDEs without losing progress, architectural decisions, or prompt tokens.

This document outlines the development direction for **ideOS**. It is a living document guided by community feedback and contributions.

---

## 📌 Status Legend
- 🟢 **Completed**: Shipped and available in latest release.
- 🟡 **In Progress / Current Focus**: Actively being designed or implemented.
- 🔵 **Planned**: Scheduled for upcoming minor releases.
- 🟣 **Under Consideration**: Exploring feasibility and community interest.

---

## 📦 Phase 1: Core Foundation & Stability (v0.1.x) — 🟢 Shipped & Stabilizing

The goal of Phase 1 was building a robust local-first continuity engine and proving multi-IDE interoperability.

- [x] **Universal MCP Server**: Built-in Model Context Protocol server exposing `ideos_workspace`, `ideos_feature`, `ideos_checkpoint`, and `ideos_decision` tools.
- [x] **Local SQLite Database**: Zero-config persistent store in `.ideos/db.sqlite` with automatic migrations and schema verification.
- [x] **Git Hook Automation**: Automatic post-commit hooks that record feature checkpoints whenever code is committed.
- [x] **12+ IDE Adapters**: Out-of-the-box support for Cursor, Windsurf, Codex, Zed, Trae, Antigravity, Claude Code, KiloCode, QCoder, Continue, Cline, and Roo Code.
- [x] **Terminal Dashboard (`ideos start`)**: Real-time terminal UI powered by React and Ink to monitor workers, active features, and file conflicts.
- [x] **Smart Git History Import (`ideos import`)**: Heuristic & LLM clustering that parses past git history into logical features and architectural decisions.
- [x] **Cloud Backend Sync (`cloud/worker.js`)**: Cloudflare Worker + D1 backend for team synchronization.
- [x] **Health Verification (`ideos doctor`)**: Built-in diagnostic tool with `--fix` to repair missing hooks and misconfigured MCP paths.

---

## 🚀 Phase 2: Ecosystem Expansion & DX (v0.2.x) — 🟡 Active Focus

The goal of Phase 2 is expanding tool adapters, strengthening test infrastructure, and making ideOS developer-friendly for open-source contributors.

### IDE & Tool Ecosystem
- [ ] **Community IDE Adapters** `[good first issue]` `[adapter]`
  - [ ] **Aider CLI** adapter support
  - [ ] **Goose CLI** (Block) adapter support
  - [ ] **Devin CLI** adapter support
  - [ ] **OpenCode** adapter support
  - [ ] **JetBrains AI Assistant** integration
- [ ] **Interactive Adapter Wizard**: CLI command (`ideos add-adapter`) to create custom MCP configurations for unlisted tools.

### Developer Experience & CLI Polish
- [ ] **Programmatic Output (`--json`)** `[good first issue]` `[cli]`
  - Add `--json` flag to `ideos recall`, `ideos explain`, `ideos timeline`, and `ideos status` for scripting and shell integrations.
- [ ] **Git Branch Awareness** `[enhancement]`
  - Automatically detect when git branch switches (e.g. `feature/auth`) and prompt or auto-switch the active claimed feature.
- [ ] **Cross-Platform Automated CI Matrix** `[good first issue]`
  - GitHub Actions workflow running unit and smoke tests across Node.js 18, 20, and 22 on Windows, macOS, and Ubuntu.
- [ ] **Optional Anonymous Telemetry** `[telemetry]`
  - Privacy-first, transparent usage metrics (e.g. counting editor switches and command frequency) with clear opt-out (`IDEOS_TELEMETRY=0`) to measure developer adoption.

---

## 🧠 Phase 3: Intelligent Context & Semantic Search (v0.3.x) — 🔵 Planned

The goal of Phase 3 is turning recorded history into active intelligence.

- [ ] **Semantic Decision Retrieval**: Vector embeddings or SQLite FTS5 full-text search to recall decisions with natural language queries (e.g. `ideos recall "why did we switch to RS256?"`).
- [ ] **Rules Synchronizer (`ideos sync-rules`)**:
  - Automatically keep `.cursorrules`, `CLAUDE.md`, `.windsurfrules`, and `.copilot-instructions.md` in sync with the project's recorded architectural decisions.
- [ ] **Lightweight Local Web Dashboard (`ideos ui`)**:
  - Optional zero-dependency browser UI for teams and developers who prefer graphical timelines and visual dependency graphs.
- [ ] **Monorepo & Workspace Scopes**:
  - Support for multi-package repos (pnpm / Turborepo / Nx) with sub-project `.ideos/` scoping or monorepo root aggregation.

---

## 👥 Phase 4: Multiplayer Team Collaboration (v1.0.x) — 🟣 Under Consideration

The goal of Phase 4 is seamless team collaboration and automated project handoffs.

- [ ] **Live Collision & Overlap Prevention**: Instant notifications when two developers or two AI agents touch related files or features simultaneously.
- [ ] **End-to-End Encrypted Cloud Sync**: Zero-knowledge encryption for team state stored in Cloudflare D1.
- [ ] **Pull Request Integration**: GitHub Action that summarizes all ideOS checkpoints and decisions made during a PR branch directly into the PR description.
- [ ] **Issue Tracker Sync**: Bi-directional status synchronization with Linear, Jira, and GitHub Issues.

---

## 🤝 How You Can Help Right Now

Looking to make an immediate impact? Check out these areas:

1. **Add a new IDE or coding agent adapter**: Adding an adapter in [`src/adapters.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/adapters.js) takes ~20 lines of code. See our [Adapter Guide](https://github.com/Abhishek-Jose7/ideOS/blob/main/CONTRIBUTING.md#adding-a-new-ide-adapter).
2. **Add `--json` output flags**: Enable headless script consumption for `recall`, `explain`, and `timeline`.
3. **Setup CI with GitHub Actions**: Help build our automated testing pipeline across operating systems.
4. **Browse Good First Issues**: Check open items with the [`good first issue`](https://github.com/Abhishek-Jose7/ideOS/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) label.

Have an idea that isn't on the roadmap? [Open a Feature Request](https://github.com/Abhishek-Jose7/ideOS/issues/new?template=feature_request.yml)!
