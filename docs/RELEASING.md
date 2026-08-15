# Releasing ContinuityBridge

This document is for maintainers preparing a public release.

## 1. Finish the release candidate

Before tagging:

- `main` contains the intended release tree;
- version metadata agrees across Node, desktop, browser extension, and macOS bundle;
- ordinary CI is green on the exact `main` commit;
- the release-critical Windows/macOS/Linux package matrix has passed on the release code;
- actionable review threads are resolved;
- `RELEASE_NOTES.md` describes the release truthfully;
- README/download documentation names the exact archives produced by the workflow.

## 2. Release assets

The workflow publishes:

- `ContinuityBridge-windows-x64.zip`
- `ContinuityBridge-macos.zip`
- `ContinuityBridge-linux-x64.tar.gz`
- `SHA256SUMS.txt`

Brand/release artwork lives under `assets/brand/`.

Canonical 1.0 release artwork:

- `assets/brand/continuitybridge-mark.svg`
- `assets/brand/release-v1.0.0.svg`

Platform icon sources live under `assets/icons/`.

## 3. Create the tag

Tag the **exact qualified `main` commit**:

```bash
git fetch origin
git checkout main
git pull --ff-only
git tag -a v1.0.0 <QUALIFIED_MAIN_SHA> -m "ContinuityBridge v1.0.0"
git push origin v1.0.0
```

Never move an already-published release tag to make later fixes look like the original release. Publish a patch version instead.

## 4. What the tag workflow proves

For each target OS, the release workflow:

1. checks out the exact tag;
2. builds the pinned Lore source revision;
3. freezes ContinuityBridge;
4. executes packaged `ContinuityBridgeLore setup` and `status` against a temporary SQLite store;
5. verifies that store exists;
6. creates the platform archive;
7. verifies both packaged entrypoints exist;
8. uploads the archive.

The publish job downloads all three archives, generates `SHA256SUMS.txt`, and creates/updates the GitHub Release using `RELEASE_NOTES.md`.

## 5. Post-publish verification

Verify the release page contains all four expected assets.

Download at least one archive and compare its digest to `SHA256SUMS.txt`.

Check the release body renders the tracked release notes and the README/download links point to the correct version.

## 6. Repository presentation

GitHub repository settings are not all represented by tracked source.

Rasterize `assets/brand/release-v1.0.0.svg` (or the canonical mark composition) to 1280×640 for the repository social preview when configured through GitHub's repository settings.

Recommended topics:

`ai`, `ai-continuity`, `local-first`, `mcp`, `lore`, `chatgpt`, `claude`, `cursor`, `codex`, `developer-tools`.
