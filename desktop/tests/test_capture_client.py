from __future__ import annotations

from pathlib import Path
import sys
import unittest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop.capture_client import CaptureClient, CaptureOptions  # noqa: E402


class CaptureClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = CaptureClient(node_command="node-test", cli_path="/tmp/bridge.js")

    def test_server_command_is_loopback_receiver_with_explicit_lore_destination(self) -> None:
        command = self.client.build_server_command(
            port=43119,
            token="local-token",
            options=CaptureOptions(
                lore_command="lore-test",
                project="project-live",
                source="chatgpt-live-test",
            ),
        )
        self.assertEqual(command[:4], ["node-test", "/tmp/bridge.js", "capture", "serve"])
        self.assertIn("--to-lore", command)
        self.assertIn("--lore-command", command)
        self.assertIn("lore-test", command)
        self.assertIn("--port", command)
        self.assertIn("43119", command)
        self.assertIn("--token", command)
        self.assertIn("local-token", command)

    def test_submit_command_preserves_explicit_mutation_and_redaction_defaults(self) -> None:
        command = self.client.build_submit_command(
            "/tmp/capture.json",
            CaptureOptions(lore_command="lore-test"),
        )
        self.assertEqual(command[:5], ["node-test", "/tmp/bridge.js", "capture", "submit", "/tmp/capture.json"])
        self.assertIn("--to-lore", command)
        self.assertNotIn("--no-redact", command)

    def test_inspect_command_has_no_mutation_flag(self) -> None:
        command = self.client.build_inspect_command("/tmp/capture.json")
        self.assertEqual(command, ["node-test", "/tmp/bridge.js", "capture", "inspect", "/tmp/capture.json", "--json"])
        self.assertNotIn("--to-lore", command)

    def test_server_refuses_missing_token_or_invalid_port(self) -> None:
        options = CaptureOptions()
        with self.assertRaisesRegex(ValueError, "token cannot be empty"):
            self.client.build_server_command(port=43119, token="", options=options)
        with self.assertRaisesRegex(ValueError, "between 1 and 65535"):
            self.client.build_server_command(port=0, token="token", options=options)


if __name__ == "__main__":
    unittest.main()
