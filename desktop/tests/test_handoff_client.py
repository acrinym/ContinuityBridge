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

    def test_builds_explicit_attachment_bundle_command(self) -> None:
        client = HandoffClient(node_command="node", cli_path="bin/continuity-bridge.js")
        command = client.build_command(
            HandoffOptions(
                task="Continue with evidence",
                message_ids=("message-1",),
                no_repository=True,
                attachment_provider="chatgpt",
                attachment_export="/exports/chatgpt",
                attachment_ids=("attachment-a", "attachment-b"),
                attachment_bundle="/bundles/portable",
                overwrite_attachments=True,
            )
        )
        self.assertIn("--attachment-provider", command)
        self.assertIn("chatgpt", command)
        self.assertEqual(command.count("--attachment-id"), 2)
        self.assertIn("attachment-a", command)
        self.assertIn("--attachment-bundle", command)
        self.assertIn("/bundles/portable", command)
        self.assertIn("--overwrite-attachments", command)

    def test_builds_attachment_scan_command(self) -> None:
        client = HandoffClient(node_command="node", cli_path="bin/continuity-bridge.js")
        command = client.build_attachment_scan_command("Claude", "/exports/claude.zip")
        self.assertEqual(
            command,
            [
                "node",
                "bin/continuity-bridge.js",
                "attachments",
                "claude",
                "/exports/claude.zip",
                "--json",
            ],
        )

    def test_requires_task_and_evidence(self) -> None:
        client = HandoffClient(cli_path="continuity-bridge")
        with self.assertRaisesRegex(ValueError, "Task is required"):
            client.build_command(HandoffOptions(task="", query="anything"))
        with self.assertRaisesRegex(ValueError, "search query"):
            client.build_command(HandoffOptions(task="Continue"))

    def test_attachment_options_require_provider_export_and_selection(self) -> None:
        client = HandoffClient(cli_path="continuity-bridge")
        with self.assertRaisesRegex(ValueError, "provider and export"):
            client.build_command(
                HandoffOptions(
                    task="Continue",
                    message_ids=("m1",),
                    attachment_provider="chatgpt",
                )
            )
        with self.assertRaisesRegex(ValueError, "Select at least one attachment"):
            client.build_command(
                HandoffOptions(
                    task="Continue",
                    message_ids=("m1",),
                    attachment_provider="chatgpt",
                    attachment_export="export",
                )
            )
        with self.assertRaisesRegex(ValueError, "Attachment provider"):
            client.build_attachment_scan_command("other", "export")

    def test_no_repository_is_explicit(self) -> None:
        client = HandoffClient(cli_path="continuity-bridge")
        command = client.build_command(
            HandoffOptions(task="Continue", message_ids=("m1",), no_repository=True)
        )
        self.assertIn("--no-repo", command)
        self.assertNotIn("--repo", command)


if __name__ == "__main__":
    unittest.main()
