from __future__ import annotations

from pathlib import Path
import sys
import unittest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PACKAGE_ROOT.parent
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop.client import BridgeClient, ImportOptions  # noqa: E402


class BridgeClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = BridgeClient(node_command="node-test", cli_path="/tmp/bridge.js")

    def test_builds_claude_inspection_without_shell_strings(self) -> None:
        command = self.client.build_inspect_command(
            "Claude", "/tmp/export with spaces.zip", redact=False, limit=4
        )
        self.assertEqual(command[:3], ["node-test", "/tmp/bridge.js", "inspect-claude"])
        self.assertIn("/tmp/export with spaces.zip", command)
        self.assertIn("--no-redact", command)
        self.assertEqual(command[-2:], ["--limit", "4"])

    def test_builds_selected_chatgpt_import(self) -> None:
        command = self.client.build_import_command(
            "ChatGPT",
            "/tmp/export.zip",
            ImportOptions(
                to_lore=True,
                output_path="/tmp/out.jsonl",
                project="demo",
                lore_command="lore-test",
                conversation_ids=("one", "two"),
            ),
        )
        self.assertIn("import-chatgpt", command)
        self.assertIn("--to-lore", command)
        self.assertIn("lore-test", command)
        self.assertEqual(command.count("--conversation-id"), 2)
        self.assertIn("/tmp/out.jsonl", command)

    def test_requires_at_least_one_destination(self) -> None:
        with self.assertRaisesRegex(ValueError, "choose Lore"):
            self.client.build_import_command(
                "Claude", "/tmp/export.json", ImportOptions(to_lore=False)
            )

    def test_uses_installed_cli_directly_when_path_is_not_javascript(self) -> None:
        client = BridgeClient(node_command="node-test", cli_path="continuity-bridge.cmd")
        command = client.build_inspect_command("ChatGPT", "export.json")
        self.assertEqual(command[0], "continuity-bridge.cmd")
        self.assertNotIn("node-test", command)

    def test_real_desktop_client_inspects_the_node_core(self) -> None:
        client = BridgeClient(
            node_command="node",
            cli_path=REPOSITORY_ROOT / "bin" / "continuity-bridge.js",
        )
        payload = client.inspect(
            "Claude", REPOSITORY_ROOT / "test" / "fixtures" / "claude-export"
        )
        self.assertEqual(payload["provider"], "claude")
        self.assertEqual(payload["conversationCount"], 2)
        self.assertEqual(payload["messageCount"], 4)


if __name__ == "__main__":
    unittest.main()
