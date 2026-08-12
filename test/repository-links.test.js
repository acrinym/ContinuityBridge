import test from "node:test";
import assert from "node:assert/strict";

import { parseHandoffArgs } from "../src/handoff/cli.js";
import { renderHandoffMarkdown } from "../src/handoff/build.js";
import { sanitizeRepositoryReference } from "../src/handoff/repository.js";


test("handoff CLI carries repeatable issue and pull request refs", () => {
  const parsed = parseHandoffArgs([
    "--task",
    "Continue repository-aware work",
    "--message-id",
    "message-1",
    "--repo",
    ".",
    "--issue",
    "#42",
    "--issue",
    "https://github.com/example/repo/issues/9",
    "--pull-request",
    "#88",
  ]);

  assert.deepEqual(parsed.issueRefs, ["#42", "https://github.com/example/repo/issues/9"]);
  assert.deepEqual(parsed.pullRequestRefs, ["#88"]);
});

test("repository refs are rejected when repository coordinates are omitted", () => {
  assert.throws(
    () =>
      parseHandoffArgs([
        "--task",
        "Continue",
        "--message-id",
        "message-1",
        "--no-repo",
        "--issue",
        "#42",
      ]),
    /require repository coordinates/,
  );
});

test("repository reference sanitizer strips URL credentials and fragments", () => {
  assert.equal(
    sanitizeRepositoryReference("https://token@example.com/acme/widget/pull/7#discussion"),
    "https://example.com/acme/widget/pull/7",
  );
  assert.equal(sanitizeRepositoryReference("#123"), "#123");
});

test("handoff v3 markdown surfaces repository issue and PR coordinates", () => {
  const markdown = renderHandoffMarkdown({
    schema: "continuity-bridge/handoff-v3",
    createdAt: "2026-08-12T00:00:00.000Z",
    task: "Continue work",
    repository: {
      name: "widget",
      remote: "https://github.com/acme/widget.git",
      branch: "main",
      head: "abc123",
      dirty: false,
      issues: ["#42"],
      pullRequests: ["https://github.com/acme/widget/pull/88"],
    },
    lore: {
      query: null,
      evidence: [
        {
          anchor: {
            messageId: "message-1",
            sessionId: "session-1",
            source: "chatgpt",
            project: "widget",
          },
          search: null,
          context: [],
        },
      ],
    },
    attachments: null,
    continuationRules: ["Verify live state."],
  });

  assert.match(markdown, /Issues: `#42`/);
  assert.match(markdown, /Pull requests: `https:\/\/github.com\/acme\/widget\/pull\/88`/);
});
