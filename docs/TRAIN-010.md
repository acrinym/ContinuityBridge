# Train 010 — Finished Public Continuity Workstation

## Product goal

ContinuityBridge 1.0 removes the last source-toolchain requirement from the downloadable desktop product. A packaged user should not need to install Node.js, install Lore globally through npm, clone this repository, or understand which runtime owns which feature.

The release package owns the application runtime. User-owned evidence remains outside the application bundle.

## Bundled continuity runtime

The existing packaged Workstation already carries:

- the ContinuityBridge Python desktop product;
- the ContinuityBridge Node engine;
- the platform Node.js runtime;
- the explicit browser capture companion.

Train 010 adds Lore 0.2.0 pinned to immutable source commit:

```text
7d10369ef265fb73e539223235979ef2f367bdb8
```

Lore 0.2.0 is not assumed to exist in the npm registry. Each platform release job checks out that exact source commit, verifies its declared version, installs from its committed lockfile, builds the CLI, prunes to production dependencies, and stages the runtime under `packaging/lore-runtime/`.

That build occurs independently on Windows, macOS, and Linux so native Node dependencies such as SQLite bindings are resolved for the target platform rather than copied from another operating system.

The generated `packaging/lore-runtime/` directory is build output and is not committed.

## Stable packaged Lore command

The release bundle contains a second executable:

```text
ContinuityBridgeLore
```

(`ContinuityBridgeLore.exe` on Windows.)

This is not another Lore implementation. It is a stable launcher whose whole job is to locate the bundled Node executable and bundled Lore CLI, then replace itself with:

```text
<bundled-node> <bundled-lore>/dist/cli/lore.js <original Lore arguments...>
```

That preserves normal Lore CLI and stdio MCP semantics while giving ContinuityBridge and external clients a durable command path that does not depend on PATH or a global npm installation.

Examples:

```text
ContinuityBridgeLore sessions --json
ContinuityBridgeLore push
ContinuityBridgeLore serve
```

## Workstation runtime selection

In a packaged application:

- `CONTINUITYBRIDGE_LORE` remains an explicit environment override;
- otherwise the sibling `ContinuityBridgeLore` executable is preferred;
- an old saved default value of `lore` migrates to the bundled launcher;
- an explicit custom saved Lore path is preserved.

In a source install, ContinuityBridge continues to resolve `lore` from PATH unless an explicit override is supplied.

All existing product surfaces continue to use the same selected Lore command:

- History import;
- Recall and context retrieval;
- MCP health/proof;
- Codex/Claude Code/Cursor configuration;
- Handoff Builder;
- explicit live capture.

## First-run local-memory initialization

Packaged first run includes **Initialize local memory**.

This is an explicit mutation. It runs:

```text
ContinuityBridgeLore setup
```

through the selected local runtime. Lore owns source detection, indexing, and retrieval verification. ContinuityBridge does not duplicate that logic and does not silently change AI-client configuration during this action.

Users who do not want detected local transcripts indexed can skip initialization and bring evidence in explicitly through History or Capture instead.

## AI-client MCP configuration

The Connections page keeps its existing preview/confirmation contract.

In a packaged build, the generated configuration points the selected AI client at the absolute packaged `ContinuityBridgeLore` command with `serve` as the argument. That means the configured MCP path uses the same Lore build that ContinuityBridge itself just proved locally.

No configuration mutation occurs merely because Lore is bundled.

## Release build

The release workflow now:

1. checks out ContinuityBridge;
2. installs Node 22 and Python build tooling on the target runner;
3. checks out Lore at immutable commit `7d10369ef265fb73e539223235979ef2f367bdb8`;
4. verifies Lore declares version 0.2.0, installs from its committed lockfile, builds it, prunes development dependencies, and stages only its packaged runtime plus lock-resolved production dependencies;
5. builds a PyInstaller multi-program one-folder bundle containing `ContinuityBridge` and `ContinuityBridgeLore` with shared Python dependencies;
6. runs packaged `ContinuityBridgeLore setup` and `status --json` against an isolated temporary `LORE_DB`, proving the final Node/Lore/native-SQLite write/read path on each target OS;
7. archives the platform package and verifies both application entrypoints exist inside the produced archive;
8. uploads the platform archive as a direct workflow artifact;
9. on a version tag, downloads all platform archives, emits `SHA256SUMS.txt`, and publishes them through GitHub Releases.

Ordinary product PRs retain lightweight CI. The three-platform release matrix also runs before merge when release-critical packaging/runtime paths change, so changes capable of breaking distribution are burned in without turning every PR into a platform-build tax.

## User-owned data remains separate

Bundling Lore does not bundle or relocate the user's Lore database.

Default durable data remains outside the app at:

```text
~/.lore/lore.db
```

or the user's configured `LORE_DB` path.

ContinuityBridge convenience/checkpoint metadata remains under:

```text
~/.continuity-bridge/
```

Replacing or deleting the application package therefore does not silently replace or delete conversation evidence.

## Third-party component boundary

Lore remains a distinct MIT-licensed project. ContinuityBridge's NOTICE already reproduces the Lore MIT notice. Packaged releases include the built Lore package and its lock-resolved production dependencies as build artifacts; package-local license files travel with that bundled runtime.

ContinuityBridge does not fork Lore storage behavior or write Lore SQLite tables directly.

## Acceptance journey

1. Download a ContinuityBridge 1.0 platform package.
2. Launch `ContinuityBridge` on a machine without a global `lore` command.
3. Home/first-run detects the packaged `ContinuityBridgeLore` runtime.
4. Choose **Initialize local memory**, or skip it and import/capture evidence explicitly.
5. Search real evidence in Recall.
6. Open Connections and preview a supported client's MCP configuration; verify it names the packaged Lore launcher.
7. Confirm the configuration and prove retrieval from Lore.
8. Build a portable continuation package using exact evidence plus optional repository/artifact continuity.
9. Close/update/uninstall the application without losing the user-owned Lore database or ContinuityBridge state.

## What this train does not add

- no second memory store;
- no hidden auto-index action at application startup;
- no silent MCP-client reconfiguration;
- no global npm mutation from the packaged application;
- no new provider-private integrations;
- no recursive release-audit subsystem.
