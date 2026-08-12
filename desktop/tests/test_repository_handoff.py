from __future__ import annotations

from pathlib import Path
import sys
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


if __name__ == "__main__":
    unittest.main()
