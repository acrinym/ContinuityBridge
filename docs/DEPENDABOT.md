# Dependabot automation

ContinuityBridge uses Dependabot for the three dependency surfaces that ship in this repository:

- npm manifests in the repository root;
- Python packaging in `desktop/`;
- GitHub Actions under `.github/workflows/`.

Dependabot checks each ecosystem every Monday morning in the `America/Detroit` timezone. Patch and minor updates are grouped by ecosystem so routine maintenance does not create a pile of nearly identical pull requests. Major updates remain separate.

## Automatic-merge policy

A Dependabot pull request is squash-merged automatically only when every guard below passes:

1. The pull request author is exactly `dependabot[bot]`.
2. `dependabot/fetch-metadata` classifies the update as SemVer patch or minor.
3. Every changed file stays inside the dependency boundary:
   - root npm manifests and lockfiles;
   - Python manifests and lockfiles under `desktop/`;
   - GitHub Actions workflow YAML.
4. Workflow-file patches change only `uses: action@version-or-digest` references; script, permission, trigger, and job rewrites are rejected.
5. The pull request head has not changed while the policy is running.
6. The repository's `CI` workflow completes successfully for that exact head commit.
7. GitHub accepts a squash merge using `--match-head-commit`.

Major updates, non-SemVer updates, unexpected file changes, workflow rewrites, failed CI, cancelled CI, and stale heads are never merged automatically.

## Security model

The merge workflow uses `pull_request_target` because it needs a write-capable repository token. It therefore follows a strict rule: **the privileged workflow never checks out, downloads, imports, builds, or executes pull-request code.** It reads GitHub metadata only, waits for the separate unprivileged `CI` workflow, and merges only the exact commit that CI qualified.

The metadata action is pinned to a complete commit SHA. The repository test suite also checks the workflow text for the critical no-checkout, SemVer, changed-file, workflow-diff, CI, and head-SHA guardrails.

## Repository setting

GitHub Actions must be allowed to use a read/write `GITHUB_TOKEN` for the final merge command. In the repository settings, this is under **Actions → General → Workflow permissions**. Approval is attempted as a best-effort convenience; automatic merging does not rely on the approval step unless branch rules require it.

## Manual handling

When automation stops, review the Dependabot PR normally. In particular, major releases deserve release notes, compatibility review, and the full test suite before a human merge decision.
