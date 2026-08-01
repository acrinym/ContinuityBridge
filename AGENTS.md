# Agent instructions

ContinuityBridge is a public, local-first interoperability project.

- Build complete user-facing ingestion paths, not placeholder commands.
- Keep the core free of hosted-service requirements and API-credit assumptions.
- Use synthetic fixtures only.
- Never commit conversation exports, local databases, secrets, signed asset URLs, or personal data.
- Preserve compatibility through Lore's public normalized-record and `push` contracts rather than writing Lore's SQLite tables directly.
- Keep source adapters independent from the shared store.
- Validate with `npm run check` before publishing changes.
