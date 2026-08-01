# Train 001 — ChatGPT History to Shared Lore Memory

## Product outcome

A user can take a standard ChatGPT data export and make its conversations searchable from every AI client that reads the same Lore store.

## Delivered behavior

- Accepts ZIP, extracted directory, `conversations.json`, and numbered `conversations-*.json` inputs.
- Reconciles duplicate conversations across split export files.
- Preserves alternate response branches and parent-message relationships.
- Normalizes roles, timestamps, model names, content, and attachment descriptions.
- Scrubs common credentials by default.
- Produces stable, idempotent Lore message IDs.
- Writes portable JSONL batches and/or sends them through `lore push`.
- Stores no local filesystem path or raw asset pointer in searchable memory.

## Acceptance receipts

- `npm run check`
- `npm run smoke`
- Synthetic fixtures only
- ZIP extraction exercised
- Fake Lore process verifies the actual stdin write boundary
- Public-boundary scan contains none of the prohibited private system names
