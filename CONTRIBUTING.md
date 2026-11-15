# Contributing to ideOS 🤝

Thank you for your interest in contributing to **ideOS**!

ideOS is an open-source development continuity layer designed to eliminate context fragmentation across AI-powered coding environments (Cursor, Windsurf, Claude Code, Zed, Trae, Antigravity, and beyond).

Whether you're fixing a bug, adding an adapter for your favorite AI tool, improving documentation, or proposing new features, your help is welcome and valued.

---

## 🧭 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
  - [1. Good First Issues](#1-good-first-issues)
  - [2. Adding a New IDE / Tool Adapter (Easiest & High Impact!)](#2-adding-a-new-ide--tool-adapter)
  - [3. Improving the Terminal Dashboard & CLI](#3-improving-the-terminal-dashboard--cli)
  - [4. Expanding the MCP Server](#4-expanding-the-mcp-server)
  - [5. Reporting Bugs & Requesting Features](#5-reporting-bugs--requesting-features)
- [Local Development Setup](#-local-development-setup)
- [Project Architecture](#-project-architecture)
- [Testing Guide](#-testing-guide)
- [Pull Request Workflow](#-pull-request-workflow)

---

## 📜 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and kind in all discussions, pull requests, and issue comments.

---

## 🎯 How Can I Contribute?

### 1. Good First Issues
If you're new to the project, start by looking for issues with the [`good first issue`](https://github.com/Abhishek-Jose7/ideOS/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/Abhishek-Jose7/ideOS/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) labels. These are self-contained tasks with clear requirements designed to help you get familiar with the codebase.

### 2. Adding a New IDE / Tool Adapter
Adding support for a new AI IDE or coding tool is a useful way to contribute. Adapters live in [`src/adapters.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/adapters.js) and use the interfaces below. The exact implementation depends on the tool's documented configuration format and platform detection needs.

#### Structure of an Adapter:
```javascript
// Example: Adding an adapter in src/adapters.js
{
  name: 'My Tool Name',
  id: 'my-tool',
  transport: 'stdio',
  configPath(root) {
    // Use only a configuration path documented by the tool.
    return path.join(root, '.mytool', 'mcp.json')
  },
  detect(root) {
    return this.detectSystem() &&
      (fs.existsSync(path.join(root, '.mytool')) || fs.existsSync(this.configPath(root)))
  },
  detectSystem() {
    return isBinaryInPath('mytool')
  },
  install(root, config = {}) {
    // Preserve existing settings and other servers when editing config.
    mergeMcpConfig(this.configPath(root), root, config)
  },
  verify(root) {
    return Boolean(readJson(this.configPath(root), {})?.mcpServers?.ideos)
  }
}
```

The example uses helpers already defined in `src/adapters.js`; adapt the config merge and verification to the target tool's actual schema. Do not write an MCP entry into a file unless the tool documents MCP client support and that configuration format. If the tool does not support MCP, report that limitation clearly instead of claiming MCP was configured.

Add the adapter to `export const adapters = [...]` in [`src/adapters.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/adapters.js). Detection, setup, and verification use the adapter methods above. Launching is centralized in `launchIDE()` in [`src/init-prompt.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/init-prompt.js); update its command and platform handling when the new tool can be launched from ideOS. Do not add an adapter-level `launch()` method.

### 3. Improving the Terminal Dashboard & CLI
The CLI interface and live dashboard (`ideos start`) are powered by [Ink](https://github.com/vadimdemedes/ink) (React in the terminal).
- Files of interest: [`src/dashboard.jsx`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/dashboard.jsx), its generated Node-compatible output `src/dashboard.js`, [`src/render.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/render.js), and [`src/cli.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/cli.js). Regenerate the output with `npm run build` after editing the JSX source.
- Opportunities: Adding filters, keyboard shortcuts, improved color schemes, and progress bar animations.

### 4. Expanding the MCP Server
ideOS runs an official Model Context Protocol (MCP) server so that AI assistants in Cursor, Windsurf, Trae, etc., can query project state autonomously.
- File of interest: [`src/mcp.js`](https://github.com/Abhishek-Jose7/ideOS/blob/main/src/mcp.js).
- Opportunities: Exposing new MCP tools (e.g., querying git commit diffs, searching past decisions, or checking file collision risks).

### 5. Reporting Bugs & Requesting Features
- Found a bug? [Submit a Bug Report](https://github.com/Abhishek-Jose7/ideOS/issues/new?template=bug_report.yml) with logs and steps to reproduce.
- Want a new feature? [Open a Feature Request](https://github.com/Abhishek-Jose7/ideOS/issues/new?template=feature_request.yml) or review our [Roadmap](ROADMAP.md).

---

## 🛠️ Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) `>= 20.19.0`
- [Git](https://git-scm.com/)

### Step-by-Step Instructions

1. **Fork the Repository** on GitHub:
   Click the **Fork** button at the top right of [Abhishek-Jose7/ideOS](https://github.com/Abhishek-Jose7/ideOS).

2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/<your-username>/ideOS.git
   cd ideOS
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Test the CLI directly**:
   You can run the CLI directly from source:
   ```bash
   node ./src/cli.js --help
   node ./src/cli.js ides
   ```

5. **(Optional) Link globally for development**:
   ```bash
   npm link
   # Now running 'ideos' will execute your local development copy!
   ```

---

## 🏗️ Project Architecture

```text
ideOS/
├── src/
│   ├── cli.js           # CLI entry point, argument parsing, command handlers
│   ├── adapters.js      # IDE detection, configuration merging, and process launching
│   ├── dashboard.jsx   # Interactive React/Ink dashboard source
│   ├── dashboard.js    # Generated Node-compatible dashboard loaded by the CLI
│   ├── mcp.js           # Model Context Protocol stdio server implementation
│   ├── db.js            # SQLite database schema, migrations, and queries
│   ├── render.js        # Terminal UI formatting, boxes, status bars, and summaries
│   ├── analyze.js       # Git commit parsing, heuristic clustering, and decision extraction
│   ├── git.js           # Git command wrappers and post-commit hook setup
│   ├── watcher.js       # File watcher and conflict detection
│   └── paths.js         # Cross-platform path resolution and workspace directories
├── scripts/
│   ├── smoke-test.js    # End-to-end integration and smoke test suite
│   └── watcher-test.js  # File watcher test
├── cloud/
│   └── worker.js        # Cloudflare Worker + D1 backend for team sync
├── migrations/          # SQLite & D1 schema migrations
├── CONTRIBUTING.md      # This guide
├── ROADMAP.md           # Project roadmap and future milestones
└── package.json         # Package configuration, bin mapping, dependencies
```

---

## 🧪 Testing Guide

Run the checks relevant to your change before submitting a pull request:

```bash
# Diagnose the current workspace's ideOS state
npm run check

# End-to-end check in a temporary workspace, including CLI state and MCP tool calls
npm run smoke

# Optional: verify automatic file-save checkpoints (takes about 35 seconds)
npm run test:watcher

# Rebuild the generated dashboard bundle after changing src/dashboard.jsx
npm run build
```

`npm run check` runs `ideos doctor` for the current directory. The smoke and watcher scripts create workspaces under the operating system's temporary directory and leave them available for inspection; they do not use your project's `.ideos` database.

---

## 🚀 Pull Request Workflow

1. **Create a new branch** from `main`:
   ```bash
   git checkout -b feat/add-aider-adapter
   # or fix/issue-description
   ```

2. **Make your changes** cleanly. Write descriptive commit messages:
   ```bash
   git commit -m "feat(adapters): add support for Aider CLI"
   ```

3. **Run the relevant checks**:
   ```bash
   npm run check
   npm run smoke
   npm run test:watcher
   ```

4. **Push to your fork**:
   ```bash
   git push origin feat/add-aider-adapter
   ```

5. **Open a Pull Request**:
   Go to [Abhishek-Jose7/ideOS/pulls](https://github.com/Abhishek-Jose7/ideOS/pulls) and click **"New Pull Request"**. Fill in the PR template with details of your change and testing steps.

---

## 💬 Questions & Getting Help

If you run into any questions or need help while working on a contribution, feel free to open an issue with the [`question`](https://github.com/Abhishek-Jose7/ideOS/issues?q=is%3Aissue+is%3Aopen+label%3Aquestion) label. We are happy to help you get your PR merged!
