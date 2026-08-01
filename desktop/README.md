# ContinuityBridge Desktop

Standard-library Tkinter desktop client for ContinuityBridge.

```bash
pip install ./desktop
continuity-bridge-gui
```

The client delegates ChatGPT and Claude inspection/import to the repository's Node CLI. It does not maintain a second parser.

Runtime requirements:

- Python 3.10+ with Tkinter
- Node.js 22+
- ContinuityBridge's Node CLI
- Lore when importing into Lore

Conversation exports remain local. Credentials are redacted by default before import or preview.
