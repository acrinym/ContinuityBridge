# Train 005 — Evidence-backed Handoff Builder + Product Roadmap

## Product goal

Make ContinuityBridge useful at the moment a user switches AI tools: carry enough original conversation evidence and repository coordinates for another authorized AI to continue the task without a giant pasted transcript or a model-generated summary.

## User-facing delivery

- `continuity-bridge handoff` command.
- Search-driven Lore evidence selection.
- Repeatable explicit Lore message IDs.
- Bounded source context around each anchor.
- Git repository name, sanitized origin remote, branch, HEAD commit, and dirty/clean state.
- Markdown and JSON output.
- Optional local-path disclosure only by explicit opt-in.
- `continuity-bridge-handoff` desktop application with preview and save workflows.
- `docs/ROADMAP.md` through 1.0 and later opportunities.

## Architectural boundaries

- Lore remains the durable store, search engine, and MCP surface.
- Handoff Builder reads through Lore's public CLI envelopes.
- Git metadata comes from ordinary local Git commands.
- No model API is called.
- The handoff preserves evidence and provenance rather than inventing an interpretation layer.
- The receiving client is told to verify live repository state before modifying code.

## Privacy behavior

- HTTP(S) Git remotes have embedded credential userinfo removed.
- Absolute local repository paths are excluded by default.
- Handoffs contain only the bounded Lore evidence selected by query/message ID, not the whole database.
- No private profile, identity, archive, or proprietary implementation terminology is part of the public design.

## Validation

Train 005 adds coverage for:

- real search-returned Lore IDs being used by `get` and `context`;
- explicit message-ID handoffs;
- bounded context rendering;
- credential scrubbing from Git remotes;
- repository commit/branch/dirty-state coordinates;
- Markdown and JSON output;
- invalid handoff argument combinations;
- desktop command construction without shell interpolation.

## Roadmap rule

The product roadmap explicitly rejects recursive audit/review machinery. Focused tests and guardrails protect user-facing features; they do not become an independent meta-product.
