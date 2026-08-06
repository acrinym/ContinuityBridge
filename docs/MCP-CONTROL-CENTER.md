# MCP Control Center

ContinuityBridge does not duplicate Lore's MCP server. The desktop Control Center manages and verifies the existing local path:

```text
ContinuityBridge import
        ↓
Lore local store
        ↓
lore serve
        ↓
Codex / Claude Code / Cursor
```

Launch it after installing the desktop package:

```bash
continuity-bridge-connections
```

## Health checks

**Check everything** performs local checks only:

1. Resolve the configured Lore executable.
2. Locate the Lore database from `LORE_DB` or `~/.lore/lore.db`.
3. Run `lore sessions --json --limit 1` to verify readable CLI access.
4. Start `lore serve` briefly and confirm the stdio MCP process remains alive.
5. Detect Codex, Claude Code, and Cursor Agent.
6. Ask each installed client for its MCP list and report whether Lore appears configured.

The server probe terminates its temporary process. Each MCP client starts its own normal Lore stdio process after configuration.

## Configuration model

The Control Center previews the exact change before enabling **Apply after confirmation**.

### Codex

Codex is configured through its MCP CLI with the equivalent TOML:

```toml
[mcp_servers.lore]
command = "lore"
args = ["serve"]
enabled = true
required = false
```

### Claude Code

Claude Code is configured at user scope through its MCP CLI. The equivalent JSON server definition is:

```json
{
  "mcpServers": {
    "lore": {
      "command": "lore",
      "args": ["serve"],
      "env": {}
    }
  }
}
```

### Cursor

Cursor uses the same JSON server shape in the global `~/.cursor/mcp.json` file. ContinuityBridge reads and validates the existing document, preserves unrelated settings and servers, creates a timestamped backup, writes through a temporary file, and then atomically replaces the original.

Malformed or non-object JSON is refused rather than overwritten.

## Prove continuity

A configuration is not called useful merely because a file exists. The proof flow performs the same bounded retrieval loop an MCP client should use:

1. Search Lore for a user-provided phrase with relevance ranking.
2. Read the real `messageId` and `sessionId` returned by Lore.
3. Call Lore context retrieval with that exact message ID.
4. Display the matched text and neighboring messages.

No message or session IDs are fabricated. A zero-hit search still proves the Lore command is reachable, but the UI clearly distinguishes that from a successful continuity retrieval.

## Safety boundaries

- No shell command strings; child processes use argument arrays and `shell=False`.
- No automatic configuration changes on startup.
- Exact previews and a confirmation dialog precede every write.
- Cursor configuration is backed up and merged, never replaced blindly.
- Lore data, client configuration, and proof output remain local.
- ContinuityBridge remains an operator and provider adapter; Lore remains the store and MCP server.
