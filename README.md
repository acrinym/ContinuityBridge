# ContinuityBridge

> **Your AI tools should not forget each other.**

ContinuityBridge is a local-first desktop and command-line bridge that carries conversation history from chat products into the shared memory used by coding agents.

It currently imports **ChatGPT** and **Claude** exports into [Lore](https://github.com/jordanhindo/lore). After that, Codex, Claude Code, Cursor, OpenClaw, Hermes, and any compatible MCP client can search the same source conversations from the tools where work continues.

**No model API key. No API credits. No hosted memory service. Your history stays on your machine.**

```text
ChatGPT export ─┐
                ├──▶ ContinuityBridge Desktop / CLI
Claude export ──┘     browse · search · preview · select
                       normalize · preserve · redact
                                  │
                                  ▼
                                Lore
                     local SQLite · CLI · MCP
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
              Codex          Claude Code        Cursor
                 └──────── other Lore clients ────┘
```

## Why this exists

AI products usually remember only what happened inside their own application. A product discussion in ChatGPT is invisible to the coding agent in an IDE. A debugging breakthrough in Claude may be invisible when the next task opens in Codex. Context gets copied by hand, flattened into summaries, or lost after compaction.

ContinuityBridge treats conversation history as **user-owned continuity**:

1. Discuss a product, feature, or code problem in one AI tool.
2. Export that history through the provider's normal data-export path.
3. Browse and select the conversations locally.
4. Import them into Lore.
5. Retrieve the original evidence from another authorized AI client later.

The agents do not become the same assistant. They gain access to the same user-authorized records.

## What ships today

### Desktop application

The standard-library Python/Tkinter desktop application provides:

- ChatGPT and Claude provider selection.
- ZIP, extracted-folder, and JSON opening.
- Conversation counts before import.
- Searchable title, ID, and preview text.
- Multi-select conversation import.
- In-app message previews.
- Lore and/or portable JSONL destinations.
- Credential redaction enabled by default.
- Configurable Node, ContinuityBridge, and Lore executable paths.
- Background processing that keeps Tkinter work on the UI thread.
- Local settings stored outside the repository.

### Shared import core

- Reads standard ChatGPT and Claude conversation exports.
- Supports large ChatGPT exports split across numbered `conversations-*.json` files.
- Reconciles duplicate conversations by retaining the newest exported copy.
- Preserves full ChatGPT conversation trees, including alternate responses.
- Preserves Claude message order and explicit parent links when exported.
- Converts both providers to Lore's public normalized-record contract.
- Uses Lore-compatible stable message IDs so repeated imports are idempotent.
- Preserves code, structured text, model names, timestamps, and safe attachment descriptions.
- Suppresses signed URLs, opaque asset pointers, and provider file IDs.
- Redacts common API keys, tokens, passwords, and private-key blocks by default.
- Pushes through `lore push` or writes inspectable JSONL.

## Quick start

### 1. Install Lore

```bash
npm install -g @jordanhindo/lore
lore setup
```

### 2. Install ContinuityBridge

```bash
git clone https://github.com/acrinym/ContinuityBridge.git
cd ContinuityBridge
npm install
npm link
```

### 3A. Launch the desktop application

Python 3.10+ with Tkinter is required.

```bash
pip install ./desktop
continuity-bridge-gui
```

From a source checkout, this also works:

```bash
python desktop/continuity_bridge_gui.py
```

Choose **ChatGPT** or **Claude**, select an export ZIP/folder/JSON file, click **Analyze**, search or select conversations, and import them to Lore or JSONL.

### 3B. Use the CLI directly

```bash
continuity-bridge import-chatgpt ~/Downloads/chatgpt-export.zip --to-lore
continuity-bridge import-claude ~/Downloads/claude-export.zip --to-lore
```

### 4. Search from any Lore-connected client

```bash
lore search "a phrase from an old conversation" --relevant
```

Use the returned message and session IDs to retrieve only the surrounding evidence needed for the current task.

## Inspect before importing

Machine-readable inspection powers the desktop viewer and can also be used directly:

```bash
continuity-bridge inspect-chatgpt ./chatgpt-export.zip --json
continuity-bridge inspect-claude ./claude-export.zip --json
```

Validate without writing:

```bash
continuity-bridge import-chatgpt ./export.zip --dry-run
continuity-bridge import-claude ./export.zip --dry-run
```

Write normalized Lore batches to JSONL without changing the Lore store:

```bash
continuity-bridge import-chatgpt ./export.zip --output ./chatgpt-lore.jsonl
continuity-bridge import-claude ./export.zip --output ./claude-lore.jsonl
```

## CLI

```text
continuity-bridge import-chatgpt <path> [options]
continuity-bridge import-claude <path> [options]
continuity-bridge inspect-chatgpt <path> [options]
continuity-bridge inspect-claude <path> [options]
```

### Import options

| Option | Effect |
|---|---|
| `--to-lore` | Push each conversation through Lore's validated write path. |
| `--output <file>` | Write one normalized JSON batch per line. |
| `--dry-run` | Parse and validate without writing. |
| `--no-redact` | Disable credential redaction. |
| `--project <name>` | Assign one Lore project value to imported messages. |
| `--source <name>` | Override the default `chatgpt` or `claude` namespace. |
| `--lore-command <path>` | Use a non-default Lore executable. |
| `--conversation-id <id>` | Import one conversation; repeat for several. |
| `--limit <count>` | Import only the first N selected conversations. |
| `--quiet` | Hide per-conversation Lore progress. |

### Inspect options

| Option | Effect |
|---|---|
| `--json` | Return provider, counts, conversation metadata, and bounded previews. |
| `--no-redact` | Show credential-like strings verbatim in previews. |
| `--conversation-id <id>` | Inspect one conversation; repeat for several. |
| `--limit <count>` | Inspect only the first N selected conversations. |

## Privacy and ownership

ContinuityBridge performs local file processing and launches local child processes. It does not call OpenAI, Anthropic, Lore's author, this repository owner, or another hosted service while importing.

Credential-like strings are scrubbed before records are written to JSONL, shown in desktop previews, or sent to Lore. Use `--no-redact` or uncheck the desktop redaction option only when verbatim retention is deliberate.

The repository contains synthetic fixtures only. Real exports, local settings, Lore databases, generated JSONL, caches, and credentials must remain outside Git.

See [docs/PRIVACY.md](docs/PRIVACY.md).

## Conversation fidelity

ChatGPT exports represent conversations as trees rather than simple transcripts. ContinuityBridge walks every reachable branch deterministically and stores original parent-message relationships instead of silently discarding regenerated responses.

Claude exports are normalized from their ordered message collections. Explicit parent IDs are retained when present; otherwise the exported message order forms the conversation chain.

For both providers:

- stable source/session IDs enable safe re-import;
- model and timestamp metadata are preserved when available;
- unknown structured content remains readable without exposing raw signed pointers;
- oversized messages are bounded and marked as truncated;
- provider-specific filesystem paths are replaced with non-sensitive source URIs.

## Architecture

ContinuityBridge deliberately does **not** create another memory database.

- **Provider adapters** understand source-specific exports.
- **The normalized core** produces Lore-compatible records and inspection summaries.
- **The desktop app** is a local operator surface over the same CLI contract.
- **Lore** owns durable local storage, search, retrieval, exclusions, CLI, and MCP access.
- **AI clients remain replaceable.** Any authorized Lore client can retrieve the same indexed history.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESKTOP.md](docs/DESKTOP.md).

## What this is not

ContinuityBridge does not:

- bypass provider account security;
- scrape another person's conversations;
- expose a hidden API to ordinary ChatGPT or Claude account history;
- make different models share an identity or private internal state;
- upload an entire archive into every prompt;
- require a model to summarize or rewrite source history.

It gives user-authorized tools a bounded, searchable route to the user's own records.

## Development

Requires Node.js 22+. Desktop work additionally requires Python 3.10+.

```bash
npm install
npm run check
npm run smoke
python -m unittest discover -s desktop/tests -v
python -m py_compile \
  desktop/continuity_bridge_desktop/client.py \
  desktop/continuity_bridge_desktop/app.py
```

The synthetic test suite covers ChatGPT and Claude parsing, ZIP/folder/JSON resolution, split-export reconciliation, branch preservation, secret redaction, attachment-pointer suppression, stable identifiers, selected-conversation import, inspection JSON, desktop command construction, and the `lore push` boundary.

## Roadmap

The next coherent product trains are:

1. Incremental manifests and fast resume for repeatedly refreshed exports.
2. Additional export formats and safe attachment copying.
3. Explicit, user-controlled live capture from supported desktop or browser surfaces.
4. IDE handoff envelopes that attach selected conversation evidence to a coding session.
5. Source-aware links between conversations, repositories, branches, issues, and pull requests.

The goal is simple: **one user-owned continuity layer, reachable from every AI tool the user chooses.**

## Relationship to Lore

ContinuityBridge uses Lore's public `push` contract and compatible stable message-ID algorithm. Lore is an independent MIT-licensed project by Jordan Hindo. See [NOTICE](NOTICE).

## License

MIT. See [LICENSE](LICENSE).
