# Desktop application

ContinuityBridge Desktop is a local Tkinter operator surface over the same Node CLI used by automation and agents.

## Product flow

1. Choose ChatGPT or Claude.
2. Open an export ZIP, extracted folder, or conversation JSON file.
3. Analyze without writing.
4. Search titles, IDs, and bounded redacted previews.
5. Select one, several, or every conversation.
6. Import into Lore, write JSONL, or do both.

## Runtime boundary

The GUI never reparses provider formats itself. It executes:

```text
continuity-bridge inspect-<provider> ... --json
continuity-bridge import-<provider> ...
```

This keeps CLI and GUI behavior aligned and prevents a second incompatible parser from developing inside the Python package.

`subprocess.run` receives an argument list with `shell=False`; export paths and conversation titles are never interpolated into a shell command.

## Threading

File parsing and Lore imports run on worker threads. Workers put results on a queue. Only the Tkinter main thread reads the queue and updates widgets.

## Settings

Settings are stored in:

```text
~/.continuity-bridge/desktop.json
```

They include provider, last source, destination choices, executable paths, and the redaction preference. Conversation content is not stored in the settings file.

## Packaging

```bash
pip install ./desktop
continuity-bridge-gui
```

The Python package has no third-party runtime dependency. The app requires:

- Python 3.10+ with Tkinter;
- Node.js 22+;
- ContinuityBridge's Node CLI;
- Lore only when the user selects the Lore destination.
