# Agent instructions

ContinuityBridge is a public, local-first interoperability project.

- Build complete user-facing ingestion paths, not placeholder commands.
- Keep the core free of hosted-service requirements and API-credit assumptions.
- Use synthetic fixtures only.
- Never commit conversation exports, local databases, secrets, signed asset URLs, personal data, or screenshots of private conversations.
- Preserve compatibility through Lore's public normalized-record and `push` contracts rather than writing Lore's SQLite tables directly.
- Keep provider adapters independent from the shared store and keep the desktop GUI on the public CLI contract.
- Any code extracted from a private utility must be rebuilt around generic public concepts. Do not copy private profiles, classifiers, archives, specialized datasets, personal names, or private fixtures.
- Run `npm run check`, `npm run smoke`, and `npm run check:desktop` before publishing changes.
