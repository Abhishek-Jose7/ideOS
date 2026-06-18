# Scar continuity

- At the start of a session, call `scar_workspace()` when MCP is available.
- Call `scar_heartbeat()` about every 60 seconds while actively working.
- Use `scar_current_work()` before claiming work.
- Treat Feature as the top-level unit of continuity. Store decisions, checkpoints, sessions, and handoffs under `feature_id`.
- Use `scar_checkpoint(feature)` after meaningful progress and before stopping.
