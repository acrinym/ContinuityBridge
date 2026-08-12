from __future__ import annotations

import unittest

from continuity_bridge_desktop.handoff_client import HandoffClient, HandoffOptions


class HandoffClientTests(unittest.TestCase):
    def test_builds_process_safe_handoff_command(self) -> None:
        client = HandoffClient(node_command="node", cli_path="bin/continuity-bridge.js")
        command = client.build_command(
            HandoffOptions(
                task="Continue parser work",
                query="parser ambiguity",
                message_ids=("message-1",),
                repository_path="/repo",
                lore_command="lore-custom",
                limit=4,
                context_messages=9,
                output_path="HANDOFF.md",
            )
        )
        self.assertEqual(command[:3], ["node", "bin/continuity-bridge.js", "handoff"])
        self.assertIn("--task", command)
        self.assertIn("Continue parser work", command)
        self.assertIn("--message-id", command)
        self.assertIn("message-1", command)
        self.assertIn("--repo", command)
        self.assertIn("/repo", command)
        self.assertIn("--output", command)

    def test_requires_task_and_evidence(self) -> None:
        client = HandoffClient(cli_path="continuity-bridge")
        with self.assertRaisesRegex(ValueError, "Task is required"):
            client.build_command(HandoffOptions(task="", query="anything"))
        with self.assertRaisesRegex(ValueError, "search query"):
            client.build_command(HandoffOptions(task="Continue"))

    def test_no_repository_is_explicit(self) -> None:
        client = HandoffClient(cli_path="continuity-bridge")
        command = client.build_command(
            HandoffOptions(task="Continue", message_ids=("m1",), no_repository=True)
        )
        self.assertIn("--no-repo", command)
        self.assertNotIn("--repo", command)


if __name__ == "__main__":
    unittest.main()
