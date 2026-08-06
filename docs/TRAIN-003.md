# Train 003 — MCP Control Center

## Product outcome

ContinuityBridge now has a second installable desktop application that turns the Lore MCP path from manual assembly into a visible, user-controlled workflow.

The train delivers:

- Lore executable and database detection;
- Lore CLI and stdio MCP startup verification;
- Codex, Claude Code, and Cursor detection;
- client MCP configuration-status checks;
- exact configuration previews;
- explicit confirmed setup actions;
- safe Cursor JSON merge, backup, and atomic replacement;
- client reload guidance;
- bounded continuity proof using Lore search and context retrieval;
- package, documentation, and CI integration.

## Architectural decision

ContinuityBridge does not ship a competing MCP server or database. Lore continues to own durable local memory, retrieval, and `lore serve`. ContinuityBridge owns provider imports and the human setup/verification surface.

## Retrieval discipline

The proof flow follows search → returned ID → context. It never invents message IDs, guesses session IDs, or pours a complete archive into model context.

## Safety

- All subprocesses use arrays with `shell=False`.
- Configuration writes require an exact preview and explicit confirmation.
- Cursor's existing configuration is validated and backed up.
- Malformed Cursor JSON is refused unchanged.
- Codex and Claude use their supported MCP CLI management commands.
- No hosted service or model API is required.

## Qualification

The desktop suite covers:

- current Codex TOML and Claude/Cursor JSON server shapes;
- exact Codex and Claude setup command construction;
- preservation of unrelated Cursor servers and settings;
- backup creation;
- malformed-config refusal;
- Lore CLI and MCP startup health checks;
- continuity proof that spends the real message ID returned by search.
