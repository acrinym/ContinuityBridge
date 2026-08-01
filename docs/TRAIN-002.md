# Train 002 — Desktop browser and Claude continuity

## Product outcome

A non-command-line user can open ChatGPT or Claude exports, inspect and search conversations, select the history they want, and import it into the same Lore memory used by coding agents.

## Delivered behavior

- Added a standard-library Tkinter desktop application.
- Added provider, file/folder, search, preview, destination, runtime, progress, and activity-log controls.
- Added selected-conversation import with repeatable stable IDs.
- Added Claude ZIP/folder/JSON resolution and normalized message parsing.
- Added redacted machine-readable inspection commands for both providers.
- Added safe attachment labels without signed URLs or opaque provider IDs.
- Added installable Python packaging and persisted local settings.
- Kept the GUI on the public CLI contract instead of creating a second parser.

## Extraction boundary

The desktop workflow was derived from an earlier private Python conversation-export utility with the author's permission. No private profiles, classifiers, archives, personal fixtures, or specialized terminology were copied. The public implementation was rebuilt against ContinuityBridge's provider-neutral contracts.

## Acceptance receipts

- Node test suite passes.
- Python desktop client tests pass.
- Python modules compile.
- ChatGPT and Claude CLI smoke tests pass.
- Desktop client performs an actual JSON inspection through the Node CLI.
- Public-boundary scan finds none of the forbidden private terms.
