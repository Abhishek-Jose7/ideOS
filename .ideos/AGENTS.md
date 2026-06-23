# ideOS Agent Instructions

ideOS is the development continuity layer for this project.

- Feature is the top-level abstraction. Do not organize continuity around tasks or files.
- Call `ideos_workspace()` at session start if MCP is available.
- Call `ideos_heartbeat()` roughly every 60 seconds while actively working.
- Use `ideos_current_work()` to infer the likely feature before claiming.
- Use `ideos_claim(feature)` only after the user or context confirms the feature.
- Store durable decisions with `ideos_remember(key, value, feature?)`.
- Create checkpoints with `ideos_checkpoint(feature)` when progress, blockers, files, or next steps change.
- Before stopping, call `ideos_handoff(feature)` or `ideos_checkpoint(feature)`.
