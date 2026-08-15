# Contributing

ContinuityBridge is intentionally a **product**, not an audit-machinery project. Contributions should improve the user journey, public contracts, correctness, portability, or documented behavior without creating recursive validation infrastructure for its own sake.

## Development requirements

- Node.js 22+
- Python 3.10+
- Git
- a source build of the pinned Lore runtime when exercising Lore-dependent flows

## Clone and install

```bash
git clone https://github.com/acrinym/ContinuityBridge.git
cd ContinuityBridge
npm install
pip install ./desktop
```

For the same Lore revision used by the packaged 1.0 release:

```bash
cd ..
git clone https://github.com/jordanhindo/lore.git
cd lore
git checkout 7d10369ef265fb73e539223235979ef2f367bdb8
npm ci
npm run build
npm link

cd ../ContinuityBridge
```

Do not replace that provenance with `npm install @jordanhindo/lore@0.2.0`; the 1.0 package is built from the immutable source revision and committed lockfile.

## Run checks

```bash
npm run check
npm run smoke
npm run check:desktop
```

Release-critical runtime/packaging paths also trigger the Windows/macOS/Linux package matrix on pull requests.

## Product contracts to preserve

- Lore remains the sole durable conversation/evidence store.
- ContinuityBridge does not introduce a second conversation database.
- Preview paths are non-mutating.
- AI-client configuration changes require explicit user confirmation.
- Capture is OFF by default and loopback-only when enabled.
- Browser capture is explicit-click, not background harvesting.
- Unsupported browser structures are refused rather than guessed.
- Attachment copying is explicitly selected and hash-verified.
- Repository links store lightweight coordinates, not copied conversations.
- Provider-private pointers and credential-bearing source URLs must not leak into portable output.
- Handoff evidence must be traceable to real Lore anchors.

## Pull requests

Keep PRs product-focused and describe:

- the user/developer outcome;
- the actual implementation;
- the checks run;
- any public-contract or privacy impact.

When review feedback identifies a valid code issue, fix it, reply to the relevant review thread with the disposition, and resolve only when the issue is genuinely addressed.

## Architecture

Read:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PRIVACY.md`](docs/PRIVACY.md)
- [`docs/WORKSTATION.md`](docs/WORKSTATION.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
