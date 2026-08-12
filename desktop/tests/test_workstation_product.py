from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parent
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop.lore_client import LoreLibraryClient  # noqa: E402
from continuity_bridge_desktop.state import MAX_RECENT_SOURCES, WorkstationState  # noqa: E402


class WorkstationProductTests(unittest.TestCase):
    def test_recent_sources_are_user_owned_deduplicated_and_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "workstation.json"
            state = WorkstationState()
            for index in range(MAX_RECENT_SOURCES + 4):
                state.remember_source("chatgpt", Path(directory) / f"export-{index}.zip")
            state.remember_source("chatgpt", Path(directory) / "export-5.zip", conversation_count=42)
            state.first_run_complete = True
            state.save(path)

            loaded = WorkstationState.load(path)
            self.assertTrue(loaded.first_run_complete)
            self.assertEqual(len(loaded.recent_sources), MAX_RECENT_SOURCES)
            self.assertEqual(loaded.recent_sources[0]["conversation_count"], 42)
            self.assertEqual(
                sum(1 for item in loaded.recent_sources if item["path"].endswith("export-5.zip")),
                1,
            )

    def test_lore_library_search_returns_real_message_ids_and_context(self):
        commands = []

        def fake_run(command, **_kwargs):
            commands.append(command)
            if command[1] == "search":
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout=json.dumps(
                        {
                            "hits": [
                                {
                                    "messageId": "message-real-123",
                                    "sessionId": "session-456",
                                    "source": "chatgpt",
                                    "title": "Product direction",
                                    "text": "build the workstation",
                                    "timestamp": "2026-08-12T12:00:00Z",
                                }
                            ]
                        }
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps({"messages": [{"messageId": "message-real-123"}]}),
                stderr="",
            )

        client = LoreLibraryClient("lore", run_function=fake_run)
        hits = client.search("workstation", limit=12)
        context = client.context(hits[0].message_id)

        self.assertEqual(hits[0].message_id, "message-real-123")
        self.assertEqual(hits[0].title, "Product direction")
        self.assertEqual(commands[0], ["lore", "search", "workstation", "--relevant", "--json", "--limit", "12"])
        self.assertEqual(commands[1], ["lore", "context", "message-real-123", "--json"])
        self.assertEqual(context["messages"][0]["messageId"], "message-real-123")

    def test_default_desktop_entrypoint_is_guided_workstation(self):
        pyproject = (REPO_ROOT / "desktop" / "pyproject.toml").read_text(encoding="utf-8")
        launcher = (REPO_ROOT / "desktop" / "continuity_bridge_workstation.py").read_text(encoding="utf-8")
        self.assertIn('continuity-bridge-desktop = "continuity_bridge_desktop.onboarding:main"', pyproject)
        self.assertIn('continuity-bridge-gui = "continuity_bridge_desktop.onboarding:main"', pyproject)
        self.assertIn('continuity-bridge-import = "continuity_bridge_desktop.app:main"', pyproject)
        self.assertIn("continuity_bridge_desktop.onboarding import main", launcher)

    def test_release_workflow_builds_all_three_platform_bundles(self):
        workflow = (REPO_ROOT / ".github" / "workflows" / "release-desktop.yml").read_text(encoding="utf-8")
        spec = (REPO_ROOT / "packaging" / "continuitybridge.spec").read_text(encoding="utf-8")
        self.assertIn("windows-latest", workflow)
        self.assertIn("macos-latest", workflow)
        self.assertIn("ubuntu-latest", workflow)
        self.assertIn("actions/upload-artifact@v7", workflow)
        self.assertIn("actions/download-artifact@v8", workflow)
        self.assertIn('tags:\n      - "v*"', workflow)
        self.assertIn('(NODE, "runtime")', spec)
        self.assertIn('"bridge/bin"', spec)
        self.assertIn('"bridge/src"', spec)


if __name__ == "__main__":
    unittest.main()
