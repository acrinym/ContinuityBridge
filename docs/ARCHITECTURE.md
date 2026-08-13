# Architecture

## Purpose

ContinuityBridge translates user-authorized conversation evidence into a source-neutral record contract. It does not replace the memory store. Lore remains responsible for durable local storage, full-text search, retrieval, deletion, exclusions, CLI access, and MCP access.

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

## Provider export contract

A provider adapter implements export resolution, conversation loading/reconciliation, stable conversation IDs, Lore batch normalization, and bounded inspection summaries. Provider parsing remains outside the desktop package. The GUI invokes the public CLI, so automation and humans receive the same behavior.

## Normalized Lore boundary

Each conversation becomes one Lore source file and one logical session. Imported history uses `<provider>:<conversation-id>`. Live capture uses `live:<lore-source>:<conversation-id>` so active capture cannot collide with a provider export namespace by accident.

Each source file includes a source/session ID, source namespace, `primary` kind, non-sensitive virtual path, content resume token, and indexed timestamp. Each message carries a stable synthetic message ID, source/session IDs, deterministic or provider message UUID, parent UUID, sequence, normalized role, timestamp/model when available, project, searchable redacted text, and truncation state.

## Explicit live-capture contract

`continuity-bridge/live-capture-v1` is an input contract, not another database format. It carries provider/source identity, conversation ID/title/source URL, and ordered user/assistant/system messages.

The normalizer removes credentials/query/fragment data from source URLs, redacts credential-like message text by default, assigns a separate live source namespace, creates stable Lore message IDs, and computes a content resume token.

The HTTP receiver is a transport around this same function. It binds only to `127.0.0.1`, requires a bearer token, serializes capture writes, and calls the same ingestion function used by one-shot `capture submit`.

The Manifest V3 browser companion has no background capture loop. Its popup injects a one-shot visible-message extractor only after a user click and then POSTs the public payload to the loopback receiver.

## Incremental boundary

Imports and live capture share the same destination-aware incremental manifest machinery. A batch is compared by its resume token; unchanged batches are skipped; changed batches are sent through Lore; checkpoint state is updated only after a confirmed `lore push`.

This keeps capture refresh semantics aligned with export refresh semantics and avoids a second persistence subsystem.

## ChatGPT fidelity

Export ingestion retains regenerated/alternate branches where the export supplies them. Browser live capture intentionally represents only the recognized visible conversation state at capture time; it does not claim hidden branch fidelity that the page does not expose.

## Claude fidelity

Claude exports preserve ordered messages and explicit parent IDs when available. Browser live capture similarly represents recognized visible message containers only.

## Why use `lore push`

The push interface is Lore's validated universal write boundary. ContinuityBridge does not write Lore's SQLite tables directly, so Lore can evolve its storage schema independently.

## Desktop process boundary

The Python desktop client constructs argument arrays and uses `shell=False`. Long-running work executes on worker threads; UI changes happen on Tkinter's main thread through a queue. The live receiver is a child process owned by the Workstation and is terminated when that Workstation closes.

## Extension model

A new export provider should add an adapter and synthetic fixtures, then expose matching inspection/import commands. A new live-capture surface should emit `live-capture-v1` or translate explicitly into that contract. Neither path should create another database, MCP server, hidden scraper, or provider-private API client unless the public/local contract genuinely proves insufficient.
