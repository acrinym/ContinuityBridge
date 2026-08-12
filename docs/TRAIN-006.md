# Train 006 — Safe Attachment Continuity

Version: `0.6.0`

## Product outcome

ContinuityBridge can now carry user-selected **local artifacts referenced by supported ChatGPT and Claude exports** alongside an evidence-backed handoff.

The attachment path remains local-first and deliberately separate from provider-private retrieval. ContinuityBridge does not follow signed URLs, use opaque provider file IDs to fetch content, or crawl unrelated filesystem locations. It only considers files physically present inside the selected export root.

## User journey

### 1. Inspect attachment references

```bash
continuity-bridge attachments chatgpt ./chatgpt-export --json
continuity-bridge attachments claude ./claude-export.zip
```

Inspection reports, for every discovered attachment reference:

- a stable ContinuityBridge attachment ID;
- filename and media type when the export provides them;
- whether a matching local artifact is available, missing, or ambiguous;
- safe relative export path when a unique local file exists;
- size when local;
- conversation ID, message ID, provider, role, and attachment position;
- a one-way SHA-256 fingerprint of provider-private reference fields when they existed in the source export.

Inspection never emits the raw provider pointer, signed URL, or private file ID.

### 2. Explicitly select what to carry

Copying never happens during inspection. A bundle requires either repeatable attachment IDs:

```bash
continuity-bridge attachments chatgpt ./chatgpt-export \
  --bundle ./portable-bundle \
  --attachment-id <id> \
  --attachment-id <id>
```

or an explicit `--all` choice:

```bash
continuity-bridge attachments claude ./claude-export \
  --bundle ./portable-bundle \
  --all
```

Unavailable references remain in the manifest. They are not silently omitted.

### 3. Receive a portable artifact bundle

The bundle contains:

```text
portable-bundle/
├── attachments.json
└── attachments/
    └── <stable-id>-<safe-filename>
```

For every copied artifact, `attachments.json` records:

- bundle-relative path;
- SHA-256 content hash;
- byte size;
- conversation/message/provider provenance.

A copy is hashed before and after transfer. If the hashes differ, ContinuityBridge removes the failed copy and reports an error.

Existing bundle artifacts are reused only when their hashes already match. A different existing file causes refusal unless the user explicitly supplies `--overwrite`.

## Handoff Builder integration

The Handoff Builder can carry the same selected attachments:

```bash
continuity-bridge handoff \
  --task "Continue implementation" \
  --message-id <lore-message-id> \
  --repo . \
  --attachment-provider chatgpt \
  --attachment-export ./chatgpt-export \
  --attachment-id <attachment-id> \
  --attachment-bundle ./portable-handoff
```

When `--attachment-bundle` is present:

- the generated handoff is written inside the bundle;
- the default filename is `HANDOFF.md` or `HANDOFF.json`;
- an explicit `--output` must still resolve inside the bundle;
- `attachments.json` is referenced relative to the handoff;
- every copied artifact is referenced relative to the handoff;
- SHA-256 values and source provenance appear in the handoff;
- missing or ambiguous references remain visible.

A receiving AI can therefore move the entire directory to another machine or path and resolve the same artifact evidence without provider credentials.

Without `--attachment-bundle`, selected attachment references may still appear in a preview as `selected-not-copied`; no file mutation occurs and no content hash is claimed.

## Desktop workflow

`continuity-bridge-handoff` exposes the same core contract through Tkinter:

1. choose ChatGPT or Claude;
2. choose an export ZIP, JSON file, or extracted folder;
3. click **Scan**;
4. inspect local/unavailable state;
5. select exactly the references to carry;
6. preview the handoff without copying;
7. choose a bundle directory;
8. build the portable handoff bundle.

The Python surface does not implement its own attachment parser. It invokes the public Node CLI just like the existing desktop import and handoff flows.

## Safety boundaries

### Export-root confinement

Artifact discovery starts at the resolved export root only. Relative candidates containing parent traversal, URLs, data URLs, or absolute filesystem paths are rejected as local resolution candidates.

The recursive export scan only follows ordinary directories and files returned by the filesystem directory listing. Symbolic links are not followed as files or directories by the resolver.

### No provider-private retrieval

Provider-private fields can help identify that a source object is an attachment reference, but their raw values are never published in ContinuityBridge inspection results, bundle manifests, or handoffs.

ContinuityBridge does not download from:

- signed attachment URLs;
- provider download URLs;
- opaque `file_id` values;
- ChatGPT asset pointers;
- image/audio remote pointers.

If the corresponding artifact is not physically present in the export, its state is `missing`.

### Ambiguity is explicit

A full relative-path match wins. If only a basename is available, ContinuityBridge accepts it only when exactly one file inside the selected export has that basename. Multiple matching files produce `ambiguous` rather than an arbitrary choice.

### Public fixtures remain synthetic

The repository contains only synthetic attachment references and synthetic local artifact files. The Train 006 fixtures intentionally include:

- one locally available ChatGPT attachment;
- one locally available Claude attachment;
- one Claude attachment reference whose signed remote URL is present in the synthetic source record but whose local file is absent.

The last case proves that unavailable artifacts stay explicit and that private remote references are not copied into product output.

## Acceptance journey

Train 006 is complete when all of the following work together:

1. open a supported export containing attachment references;
2. enumerate those references without exposing remote provider secrets;
3. distinguish local, missing, and ambiguous artifacts;
4. explicitly select what to carry;
5. create a bundle containing only selected local files;
6. verify every copied file by SHA-256;
7. preserve unavailable selections in the manifest;
8. generate an evidence-backed handoff inside the bundle;
9. reference the manifest and artifacts using relative paths;
10. move the directory and continue using the same local evidence without provider credentials.

This is product functionality, not a new storage layer. Lore remains the durable conversation backend; ContinuityBridge owns the explicit portability workflow around it.
