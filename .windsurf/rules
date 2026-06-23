# ideOS continuity

- At the start of a session, call `ideos_workspace()` when MCP is available.
- Call `ideos_heartbeat()` about every 60 seconds while actively working.
- Use `ideos_current_work()` before claiming work.
- Treat Feature as the top-level unit of continuity. Store decisions, checkpoints, sessions, and handoffs under `feature_id`.
- Use `ideos_checkpoint(feature)` after meaningful progress and before stopping.
