# Scar Agent Instructions

Scar is the development continuity layer for this project.

- Feature is the top-level abstraction. Do not organize continuity around tasks or files.
- Call `scar_workspace()` at session start if MCP is available.
- Call `scar_heartbeat()` roughly every 60 seconds while actively working.
- Use `scar_current_work()` to infer the likely feature before claiming.
- Use `scar_claim(feature)` only after the user or context confirms the feature.
- Store durable decisions with `scar_remember(key, value, feature?)`.
- Create checkpoints with `scar_checkpoint(feature)` when progress, blockers, files, or next steps change.
- Before stopping, call `scar_handoff(feature)` or `scar_checkpoint(feature)`.
