# ContinuityBridge Workstation

ContinuityBridge 1.0 is the primary desktop product for the complete local continuity journey: import, explicit live capture, Recall, AI-client connections, repository-aware continuity, safe attachments, and handoff generation.

## What the Workstation does

The intended packaged journey is:

1. launch ContinuityBridge without separately installing Node or Lore;
2. check the bundled local continuity runtime;
3. optionally initialize supported existing local transcript sources;
4. import/refresh ChatGPT or Claude history, or explicitly capture a supported active conversation;
5. search original evidence in Recall and inspect exact source context;
6. optionally link that evidence to a Git repository with issue/PR references;
7. preview and explicitly connect an installed AI client to the local Lore MCP server;
8. send exact evidence into Continue;
9. recover related repository evidence/prior handoffs when useful;
10. optionally add current repository state and explicitly selected local artifacts;
11. preview without copying files;
12. build the portable continuation package.

ContinuityBridge never needs a model API key to perform this journey.

## First run

Packaged 1.0 releases contain the ContinuityBridge Node engine, a platform Node runtime, pinned Lore runtime, and browser capture companion.

The first launch checks the bundled runtime, Lore database/MCP readiness, optional Git availability, and supported AI-client state. When the bundled Lore launcher exists, the Workstation automatically uses the sibling `ContinuityBridgeLore` executable. No global npm Lore install is required.

### Initialize local memory

**Initialize local memory** is an explicit first-run action. It runs the selected local Lore runtime's `setup` command, allowing Lore to detect/index supported local transcript sources and verify search. It does not silently configure Codex, Claude Code, or Cursor.

You can skip it and bring evidence in explicitly through History or Capture instead.

Source/developer installs continue to resolve a developer-managed `lore` command from PATH unless `CONTINUITYBRIDGE_LORE` or a custom saved Lore path is supplied.

## Runtime selection and updates

Packaged runtime precedence is:

1. explicit `CONTINUITYBRIDGE_LORE` environment override;
2. sibling packaged `ContinuityBridgeLore` launcher;
3. PATH fallback when not packaged.

Saved generic `lore` settings and saved paths whose executable name is `ContinuityBridgeLore` are retargeted to the launcher beside the currently running packaged application. This keeps replacement-folder updates from pinning the Workstation to an old install path. Explicit custom Lore paths remain untouched.

## Home

Home summarizes:

- ContinuityBridge/Node runtime readiness;
- selected Lore CLI/database/MCP readiness;
- optional Git support;
- Codex, Claude Code, and Cursor installation/connection state;
- recent provider export and generated handoff paths.

Recent paths are convenience metadata only; the Workstation does not copy conversation content into another database.

## History

History opens supported ChatGPT/Claude ZIP, folder, and JSON exports. Analyze is local and non-mutating. Import selected or Import all/Refresh sends normalized records through Lore's public push boundary and the existing incremental/resume engine. Unchanged conversations are skipped; confirmed writes are checkpointed.

Credential-like redaction remains enabled by default.

## Capture

Capture is explicit live ingestion.

The receiver is **OFF** until started. When ON it binds only to `127.0.0.1`, requires the fresh browser token shown by the Workstation, uses the selected Lore runtime, and stops when the Workstation closes.

The bundled Manifest V3 browser companion has no background page observer. On recognized ChatGPT/Claude pages, it extracts visible supported message containers only after **Capture current conversation** is clicked. Unsupported page structures refuse rather than guessing arbitrary page text.

A local/desktop tool can instead emit `continuity-bridge/live-capture-v1`. **Inspect** validates without mutation; **Submit to Lore** is explicit mutation.

Repeated unchanged captures are skipped by the same destination-aware checkpoint mechanism used for export refreshes.

## Recall

Recall searches Lore and displays the real returned message ID, source/session metadata, and bounded source context retrieved with that exact ID. Imported and live-captured conversations therefore share one evidence surface.

### Repository-aware Recall

Evidence can be explicitly linked to a local Git repository plus optional issue/PR references. The repository filter narrows real Lore results by linked IDs without adding another search index or message store.

Recall → Continue restores repository/ref context only when the relationship is unambiguous or the active repository filter disambiguates it. Otherwise existing Continue context is preserved and the user chooses the intended repository.

## Connections

Connections detects Codex, Claude Code, and Cursor and previews the exact MCP configuration before any mutation.

In packaged 1.0 builds, that preview/configuration uses the absolute `ContinuityBridgeLore` launcher with `serve` as the argument. The configured AI client therefore uses the same packaged Lore build that the Workstation just checked locally.

Cursor configuration preserves unrelated JSON settings and backs up existing configuration. Codex and Claude Code use their supported MCP command paths. Nothing is configured merely because Lore is bundled.

## Continue

Continue builds an evidence-backed package for another AI.

Evidence can come from a Lore query, exact message IDs, a Recall selection, or exact IDs linked to the selected repository. Query-derived handoffs backlink using the actual resolved Lore anchor IDs from the handoff file written to disk.

### Repository continuity

A selected Git repository can contribute sanitized remote, branch, HEAD, and working-tree state. **Find related continuity** surfaces linked exact Lore IDs, prior handoffs, issue refs, and PR refs. Issue/PR refs require a resolvable repository and are coordinates only; their live state must be verified by the consumer.

### Safe attachments

Choose a supported provider export, scan local references, inspect available/missing/ambiguous state, select only the artifacts to carry, and choose a portable bundle. ContinuityBridge stays inside the selected export root and never follows provider-private signed download URLs.

### Preview and Build

Preview is non-mutating. Build writes the handoff and, when selected, SHA-256-verified local artifacts. Portable bundles use relative artifact paths.

## User-owned data locations

ContinuityBridge state:

```text
~/.continuity-bridge/
```

Lore's durable database:

```text
~/.lore/lore.db
```

or configured `LORE_DB`.

The bundled Lore runtime is application code; the Lore database is user data and remains outside the application package.

## Packaged releases

The release workflow produces:

- `ContinuityBridge-windows-x64.zip`;
- `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`;
- `ContinuityBridge-linux-x64.tar.gz`;
- `SHA256SUMS.txt` with archive integrity digests on tagged releases.

Each 1.0 package contains:

- `ContinuityBridge` GUI executable;
- `ContinuityBridgeLore` stable Lore launcher;
- platform Node runtime;
- ContinuityBridge Node engine;
- Lore 0.2.0 built from immutable source commit `7d10369ef265fb73e539223235979ef2f367bdb8` plus lock-resolved production dependencies for that OS;
- explicit browser capture companion;
- license/notice files.

For release-critical package/runtime changes, the Windows/macOS/Linux matrix runs before merge. Each platform build checks out that exact Lore source commit, builds from its committed lockfile, freezes the application, then runs packaged `ContinuityBridgeLore setup` and `status --json` against an isolated temporary `LORE_DB` to prove the real Node/Lore/native-SQLite write/read path. The produced archive is then inspected to confirm both application entrypoints exist.

Tagged `v*` builds use the same path and publish the platform archives plus `SHA256SUMS.txt` through GitHub Releases.

The current 1.0 packages are unsigned/not notarized, so Windows SmartScreen or macOS Gatekeeper may show the normal warning for an unsigned internet-downloaded application. Use the official GitHub Release, verify checksums when needed, and use normal OS review/allow controls rather than disabling platform security globally.

## Update

Close ContinuityBridge and replace the previous application package with the newer release. Saved packaged Lore paths retarget to the new sibling launcher. User-owned Lore/ContinuityBridge data is not replaced by the application update.

## Uninstall

Delete the packaged folder or `.app` bundle. User data remains unless you separately and intentionally remove:

- `~/.continuity-bridge/`;
- `~/.lore/` or configured `LORE_DB`;
- portable handoff bundles.

## Source/developer launch

Build the same pinned Lore source revision used by packaged 1.0, then install/launch the desktop package:

```bash
git clone https://github.com/jordanhindo/lore.git
cd lore
git checkout 7d10369ef265fb73e539223235979ef2f367bdb8
npm ci
npm run build
npm link

cd /path/to/ContinuityBridge
pip install ./desktop
continuity-bridge-desktop
```

Compatibility entrypoints remain:

```bash
continuity-bridge-gui
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

See `docs/TRAIN-010.md` for the 1.0 release contract.
