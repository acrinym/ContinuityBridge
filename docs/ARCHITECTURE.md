# Architecture

## Purpose

ContinuityBridge translates conversational history from chat products into a source-neutral record contract. It does not replace the memory store. Lore remains responsible for durable local storage, full-text search, retrieval, deletion, exclusions, CLI access, and MCP access.

## Train 1 data path

```text
ZIP / directory / conversations.json
                │
                ▼
        export resolver
                │
                ▼
       ChatGPT tree parser
                │
                ▼
    privacy scrub + size bound
                │
                ▼
      Lore-normalized batches
          │             │
          ▼             ▼
     JSONL archive    lore push
                           │
                           ▼
                    ~/.lore/lore.db
```

## Boundary contract

Each conversation becomes one Lore source file and one logical session:

- `sourceFileId`: `chatgpt:<conversation-id>`
- `sessionId`: same as `sourceFileId`
- `source`: `chatgpt` by default
- `kind`: `primary`
- `resumeToken`: a SHA-256 hash of the exported conversation object
- `path`: a non-sensitive `chatgpt-export://` URI, never the user's filesystem path

Each message carries:

- stable synthetic `messageId`
- source and session IDs
- original message UUID
- parent UUID
- deterministic sequence
- normalized role
- timestamp
- model name when exported
- searchable text
- truncation state

## Why use `lore push`

The push interface is Lore's validated universal write boundary. Using it avoids coupling ContinuityBridge to Lore's SQLite schema or migrations. Lore can evolve its database internals without requiring this project to write tables directly.

## Branch fidelity

A ChatGPT conversation can contain regenerated answers and alternate child branches. Flattening only the active branch destroys useful history. The parser therefore:

1. Finds every root.
2. Traverses children in timestamp and ID order.
3. Retains every message exactly once.
4. Stores the original parent relation.
5. Adds any disconnected nodes deterministically.

The resulting sequence is stable across repeated imports.

## Extension model

New chat sources should implement two operations:

1. Resolve the source package or history location.
2. Produce Lore-normalized batches.

They should not create another database, another MCP server, or another search engine unless the shared-store contract proves insufficient.
