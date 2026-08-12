from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop.handoff_client import HandoffClient, HandoffOptions  # noqa: E402


class RepositoryHandoffTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = HandoffClient(node_command="node-test", cli_path="/tmp/bridge.js")

    def test_builds_repeatable_issue_and_pull_request_coordinates(self) -> None:
        command = self.client.build_command(
            HandoffOptions(
                task="Continue repository work",
                message_ids=("message-1",),
                repository_path="/work/widget",
                issue_refs=("#42", "https://github.com/acme/widget/issues/9"),
                pull_request_refs=("#88",),
            )
        )
        self.assertEqual(command.count("--issue"), 2)
        self.assertEqual(command.count("--pull-request"), 1)
        self.assertIn("#42", command)
        self.assertIn("#88", command)

    def test_rejects_repository_refs_with_no_repository(self) -> None:
        with self.assertRaisesRegex(ValueError, "require repository coordinates"):
            self.client.build_command(
                HandoffOptions(
                    task="Continue",
                    message_ids=("message-1",),
                    no_repository=True,
                    issue_refs=("#42",),
                )
            )

    def test_reads_exact_resolved_ids_from_written_markdown_handoff(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "HANDOFF.md"
            path.write_text(
                "# ContinuityBridge Handoff\n\n"
                "### Evidence 1\n\n- Anchor message: `query-hit-1`\n\n"
                "### Evidence 2\n\n- Anchor message: `explicit-2`\n",
                encoding="utf-8",
            )
            options = HandoffOptions(
                task="Continue",
                query="repository continuity",
                output_path=str(path),
            )
            self.assertEqual(
                self.client.resolved_evidence_ids(options),
                ("query-hit-1", "explicit-2"),
            )

    def test_reads_exact_resolved_ids_from_written_json_handoff(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "HANDOFF.json"
            path.write_text(
                json.dumps(
                    {
                        "lore": {
                            "evidence": [
                                {"anchor": {"messageId": "query-hit-1"}},
                                {"anchor": {"messageId": "query-hit-2"}},
                            ]
                        }
                    }
                ),
                encoding="utf-8",
            )
            options = HandoffOptions(
                task="Continue",
                query="repository continuity",
                output_path=str(path),
                output_format="json",
            )
            self.assertEqual(
                self.client.resolved_evidence_ids(options),
                ("query-hit-1", "query-hit-2"),
            )


if __name__ == "__main__":
    unittest.main()
