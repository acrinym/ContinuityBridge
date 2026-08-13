# Architecture

## Purpose

ContinuityBridge translates user-authorized conversation evidence into a source-neutral record contract and gives users one workstation for import, capture, recall, repository context, MCP connection, and continuation packages.

Lore remains responsible for durable local storage, full-text search, retrieval, deletion/exclusions, CLI access, and MCP access. ContinuityBridge does not fork that storage layer.

## Data paths

```text
ChatGPT / Claude ZIP, folder, or JSON
                  │
                  ▼
          provider resolver/parser
                  │
                  ▼
            normalized batches ───────────────┐
                                               │
Explicit live-capture JSON / browser click     │
                  │                            │
                  ▼                            │
        live-capture normalizer                │
                  │                            │
                  └──────── normalized batch ──┤
                                               ▼
                                    incremental checkpoint
                                               │
                                               ▼
                                           lore push
                                               │
                                               ▼
                                        ~/.lore/lore.db
```

Inspection, JSONL export, attachment bundling, repository links, and handoff generation remain separate user-facing paths over the same evidence identifiers.

## Packaged 1.0 runtime

The downloadable application contains two executable boundaries in one PyInstaller one-folder bundle:

```text
ContinuityBridge       → Python/Tk Workstation
ContinuityBridgeLore   → stable Lore CLI/MCP launcher
```

Shared data includes:

```text
bridge/           ContinuityBridge Node engine
runtime/          target-platform Node executable
lore-runtime/     @jordanhindo/lore 0.2.0 + production dependencies
browser-extension/ explicit capture companion
```

`ContinuityBridgeLore` contains no alternate storage implementation. It locates the bundled Node executable and Lore `dist/cli/lore.js`, then uses process replacement so the resulting process has normal Lore argv/stdin/stdout/stderr behavior. This allows the Workstation and external MCP clients to use one stable executable path.

The release workflow installs the Lore runtime independently on each target runner before PyInstaller, so native Node dependencies are resolved for that operating system.

## Runtime selection

Packaged Workstation builds prefer the sibling `ContinuityBridgeLore` executable unless `CONTINUITYBRIDGE_LORE` explicitly overrides it. Source builds resolve `lore` from PATH.

Saved generic `lore` values and prior packaged `ContinuityBridgeLore` paths migrate to the launcher beside the currently running package. Explicit custom Lore paths remain explicit.

The selected command is used consistently by:

- History import through the Node bridge;
- Recall/context retrieval;
- MCP health and continuity proof;
- Codex/Claude Code/Cursor configuration;
- Handoff Builder;
- explicit live capture.

## Local-memory initialization

First-run **Initialize local memory** is an explicit call to the selected Lore runtime's `setup` command. Lore owns transcript-source detection, indexing, and retrieval verification. ContinuityBridge does not duplicate that logic and does not use the action to mutate MCP-client configuration.

## Provider export contract

A provider adapter implements export resolution, conversation loading/reconciliation, stable conversation IDs, Lore batch normalization, and bounded inspection summaries. Provider parsing remains in the Node engine. The GUI invokes the public CLI, so automation and humans receive the same import behavior.

## Normalized Lore boundary

Each conversation becomes one Lore source file and one logical session. Imported history uses `<provider>:<conversation-id>`. Live capture uses `live:<lore-source>:<conversation-id>` so active capture cannot collide with an export namespace by accident.

Each source file includes a source/session ID, source namespace, `primary` kind, non-sensitive virtual path, content resume token, and indexed timestamp. Each message carries a stable synthetic message ID, source/session IDs, deterministic/provider message UUID, parent UUID, sequence, normalized role, timestamp/model when available, project, searchable redacted text, and truncation state.

## Explicit live-capture contract

`continuity-bridge/live-capture-v1` is an input contract, not another database format. The normalizer strips sensitive source-URL components, redacts credential-like text by default, assigns a live source namespace, creates stable Lore IDs, and computes a resume token.

The HTTP receiver binds only to `127.0.0.1`, requires a bearer token, serializes capture writes, and calls the same ingestion function used by one-shot `capture submit`.

The Manifest V3 browser companion has no background capture loop. Its popup injects a one-shot visible-message extractor only after a user click.

## Incremental boundary

Imports and live capture share destination-aware incremental manifests. A batch is compared by resume token; unchanged batches are skipped; changed batches are sent through Lore; checkpoint state updates only after confirmed `lore push`.

## Fidelity

Export ingestion preserves provider-export fidelity, including alternate ChatGPT branches when supplied. Browser live capture intentionally represents only recognized visible conversation state at capture time; it does not claim hidden branch fidelity or hidden native-client transcript access.

## Why use Lore public boundaries

`lore push` is the validated write boundary and Lore CLI/MCP are the retrieval/client boundaries. ContinuityBridge does not write Lore SQLite tables directly, so Lore can evolve its schema independently and remain the single durable conversation store.

## Desktop process boundary

Python desktop clients construct argument arrays and use `shell=False`. Long-running work executes off the Tk main thread and UI changes return through the event queue. The live capture receiver is a child process owned by the Workstation. The bundled Lore launcher uses process replacement rather than a shell/proxy layer.

## Release boundary

Normal PR CI checks product code and desktop contracts. The existing manual/tag-driven release workflow owns target-platform runtime installation, PyInstaller assembly, `ContinuityBridgeLore help` verification, archive generation, and tagged GitHub Release publication. This keeps expensive three-platform packaging out of every product PR.

## Extension model

A new export provider should add an adapter and synthetic fixtures. A new live-capture surface should emit `live-capture-v1` or explicitly translate into it. Neither path should create another conversation database, hidden scraper, or provider-private API client unless the public/local contract genuinely proves insufficient.
