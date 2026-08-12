# ContinuityBridge Desktop

Standard-library Tkinter desktop applications for ContinuityBridge.

```bash
pip install ./desktop
```

Two commands are installed:

```bash
continuity-bridge-gui
continuity-bridge-connections
```

## Import and browse

`continuity-bridge-gui` opens the ChatGPT and Claude export browser. It analyzes ZIP, folder, and JSON exports, previews and filters conversations, then imports selected history into Lore or portable JSONL.

The GUI delegates provider parsing to ContinuityBridge's public Node CLI. It does not maintain a second parser.

## MCP Control Center

`continuity-bridge-connections` opens the local connection manager. It:

- detects Lore, its local database, CLI health, and whether `lore serve` can start;
- detects Codex, Claude Code, and Cursor;
- previews the exact Lore MCP configuration before changing anything;
- uses each supported client's official MCP CLI where available;
- merges Cursor's global `~/.cursor/mcp.json` safely and creates a timestamped backup;
- re-checks whether each client reports Lore configured;
- proves continuity by searching Lore, taking a real returned message ID, and retrieving its context.

No client configuration is changed until the user confirms the preview. All child processes use argument arrays with `shell=False`.

## Runtime requirements

- Python 3.10+ with Tkinter
- Node.js 22+
- ContinuityBridge's Node CLI
- Lore for durable memory and MCP access
- One or more optional MCP clients: Codex, Claude Code, or Cursor

Conversation exports and Lore data remain local. Credentials are redacted by default before import or preview.
