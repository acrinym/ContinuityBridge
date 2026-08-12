from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from continuity_bridge_desktop.mcp_control import MCPControlClient, MCPControlError


class FakeProcess:
    def __init__(self, *, returncode=None, stderr="") -> None:
        self._returncode = returncode
        self._stderr = stderr
        self.terminated = False
        self.killed = False

    def poll(self):
        return self._returncode

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True

    def communicate(self, timeout=None):
        return "", self._stderr


class MCPControlClientTests(unittest.TestCase):
    def test_generates_current_client_configuration_shapes(self):
        client = MCPControlClient(lore_command="lore-custom", which_function=lambda _: "/bin/tool")

        codex = client.config_snippet("codex")
        self.assertIn("[mcp_servers.lore]", codex)
        self.assertIn('command = "lore-custom"', codex)
        self.assertIn('args = ["serve"]', codex)

        claude = json.loads(client.config_snippet("claude code"))
        cursor = json.loads(client.config_snippet("cursor"))
        expected = {"command": "lore-custom", "args": ["serve"], "env": {}}
        self.assertEqual(claude["mcpServers"]["lore"], expected)
        self.assertEqual(cursor["mcpServers"]["lore"], expected)

    def test_codex_and_claude_apply_commands_use_official_cli_paths(self):
        client = MCPControlClient(lore_command="lore", which_function=lambda _: "/bin/tool")

        self.assertEqual(
            client.apply_command("codex"),
            ["codex", "mcp", "add", "lore", "--", "lore", "serve"],
        )
        self.assertEqual(
            client.apply_command("claude"),
            [
                "claude",
                "mcp",
                "add",
                "lore",
                "--scope",
                "user",
                "--",
                "lore",
                "serve",
            ],
        )
        self.assertIsNone(client.apply_command("cursor"))

    def test_cursor_apply_preserves_existing_servers_and_writes_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config_path = home / ".cursor" / "mcp.json"
            config_path.parent.mkdir(parents=True)
            config_path.write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "existing": {"command": "existing-server", "args": []}
                        },
                        "otherSetting": True,
                    }
                ),
                encoding="utf-8",
            )
            client = MCPControlClient(
                lore_command="lore",
                home=home,
                which_function=lambda _: "/bin/tool",
            )

            result = client.apply_client("cursor")
            written = json.loads(config_path.read_text(encoding="utf-8"))

            self.assertIn("Updated", result)
            self.assertTrue(written["otherSetting"])
            self.assertIn("existing", written["mcpServers"])
            self.assertEqual(
                written["mcpServers"]["lore"],
                {"command": "lore", "args": ["serve"], "env": {}},
            )
            backups = list(config_path.parent.glob("mcp.json.backup-*"))
            self.assertEqual(len(backups), 1)

    def test_cursor_apply_refuses_malformed_existing_config(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config_path = home / ".cursor" / "mcp.json"
            config_path.parent.mkdir(parents=True)
            config_path.write_text("not-json", encoding="utf-8")
            client = MCPControlClient(
                lore_command="lore",
                home=home,
                which_function=lambda _: "/bin/tool",
            )

            with self.assertRaises(MCPControlError):
                client.apply_client("cursor")
            self.assertEqual(config_path.read_text(encoding="utf-8"), "not-json")

    def test_prove_continuity_spends_real_message_id_on_context(self):
        commands = []

        def fake_run(command, **_kwargs):
            commands.append(command)
            if command[1] == "search":
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout=json.dumps(
                        {
                            "count": 1,
                            "hits": [
                                {
                                    "messageId": "message-123",
                                    "sessionId": "session-456",
                                    "source": "chatgpt",
                                    "text": "the matched history",
                                }
                            ],
                        }
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps({"messages": [{"messageId": "message-123"}]}),
                stderr="",
            )

        client = MCPControlClient(
            lore_command="lore",
            run_function=fake_run,
            which_function=lambda _: "/bin/lore",
        )
        proof = client.prove_continuity("matched history")

        self.assertEqual(proof.hit_count, 1)
        self.assertEqual(proof.message_id, "message-123")
        self.assertEqual(proof.session_id, "session-456")
        self.assertEqual(commands[1], ["lore", "context", "message-123", "--json"])
        self.assertEqual(proof.context["messages"][0]["messageId"], "message-123")

    def test_health_check_verifies_cli_and_mcp_startup(self):
        calls = []
        process = FakeProcess(returncode=None)

        def fake_run(command, **_kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps({"count": 7, "sessions": []}),
                stderr="",
            )

        client = MCPControlClient(
            lore_command="lore",
            run_function=fake_run,
            popen_function=lambda *_args, **_kwargs: process,
            which_function=lambda _: "/bin/lore",
        )
        status = client.check_lore()

        self.assertTrue(status.installed)
        self.assertTrue(status.cli_ready)
        self.assertTrue(status.mcp_ready)
        self.assertEqual(status.session_count, 7)
        self.assertTrue(process.terminated)
        self.assertEqual(calls[0], ["lore", "sessions", "--json", "--limit", "1"])


if __name__ == "__main__":
    unittest.main()
