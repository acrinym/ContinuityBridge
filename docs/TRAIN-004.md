# Train 004 — Incremental manifests and fast resume

## Product outcome

ContinuityBridge no longer pays the full import cost every time a refreshed ChatGPT or Claude export is delivered to Lore.

The train provides:

- a versioned local import manifest;
- provider resume-token comparison per conversation;
- destination-aware checkpoints;
- unchanged-conversation skipping;
- explicit re-import and no-manifest controls;
- dry-run planning;
- per-conversation checkpointing after successful Lore writes;
- crash-resume behavior;
- complete JSONL snapshot behavior independent of Lore skipping.

## User-visible behavior

The first Lore run imports every selected conversation. A repeated run reports how many are pending and how many are unchanged. A refreshed provider export only sends conversations whose resume token changed or that did not previously exist.

The desktop importer benefits automatically because its normal Lore imports use the same CLI contract.

## Failure behavior

Checkpoints are written only after a successful `lore push`. A failure stops the run and leaves the failed batch pending. Earlier successful batches remain checkpointed, so the next execution resumes at useful work.

## Data boundary

The manifest stores no message text. It contains destination keys, source-file IDs, resume tokens, message counts, session IDs, and timestamps. It remains local under `~/.continuity-bridge/` unless the user chooses another path.

## Qualification

Coverage includes:

- missing-manifest initialization;
- atomic save and reload;
- unchanged, changed, and new selection;
- destination isolation;
- forced re-import;
- malformed and unsupported manifest refusal;
- repeated CLI imports with a fake Lore executable;
- complete output-only JSONL snapshots;
- dry-run planning without checkpoint writes;
- partial failure where only confirmed pushes trigger checkpoint callbacks.
