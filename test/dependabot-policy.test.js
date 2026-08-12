import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL(
  "../.github/workflows/dependabot-safe-automerge.yml",
  import.meta.url,
);
const configPath = new URL("../.github/dependabot.yml", import.meta.url);

test("Dependabot watches every shipped dependency ecosystem", async () => {
  const config = await readFile(configPath, "utf8");

  assert.match(config, /package-ecosystem: "npm"/);
  assert.match(config, /package-ecosystem: "pip"/);
  assert.match(config, /package-ecosystem: "github-actions"/);
  assert.match(config, /directory: "\/desktop"/);
  assert.match(config, /timezone: "America\/Detroit"/);

  const safeGroups = config.match(
    /update-types:\s*\n\s*- "minor"\s*\n\s*- "patch"/g,
  );
  assert.equal(safeGroups?.length, 3);
});

test("privileged Dependabot automation never checks out or executes PR code", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /actions\/checkout/i);
  assert.doesNotMatch(workflow, /gh pr checkout/i);
  assert.doesNotMatch(workflow, /git (checkout|fetch|clone)/i);
  assert.doesNotMatch(workflow, /npm (install|ci|test|run)/i);
  assert.doesNotMatch(workflow, /python\s+-m|pytest|pip install/i);
});

test("automatic merge is bounded by update type, paginated diffs, CI, and head SHA", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(
    workflow,
    /dependabot\/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98/,
  );
  assert.match(workflow, /version-update:semver-patch\|version-update:semver-minor/);
  assert.doesNotMatch(workflow, /semver-major\).*eligible=true/);
  assert.match(workflow, /Verify changed-file and workflow-diff boundaries/);
  assert.match(workflow, /gh api --paginate/);
  assert.match(workflow, /jq -s 'add'/);
  assert.match(workflow, /not an action reference/);
  assert.match(workflow, /select\(\.name == "CI"\)/);
  assert.match(workflow, /head_sha="\$HEAD_SHA"/);
  assert.match(workflow, /--match-head-commit "\$HEAD_SHA"/);
  assert.match(workflow, /--merge/);
  assert.doesNotMatch(workflow, /--squash/);
});
