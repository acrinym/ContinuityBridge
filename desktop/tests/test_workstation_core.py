from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop.lore_client import LoreLibraryClient  # noqa: E402
from continuity_bridge_desktop.state import WorkstationState  # noqa: E402


class WorkstationStateTests(unittest.TestCase):
    def test_recent_sources_and_handoffs_survive_restart(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state_path = Path(temporary) / "workstation.json"
            source = Path(temporary) / "chatgpt-export.zip"
            handoff = Path(temporary) / "portable" / "HANDOFF.md"
            state = WorkstationState()
            state.remember_source("chatgpt", source, conversation_count=42)
            state.remember_import("chatgpt", source, selected_count=42, detail="imported")
            state.remember_handoff(handoff, task="Continue the product train", bundle=handoff.parent)
            state.first_run_complete = True
            state.save(state_path)

            loaded = WorkstationState.load(state_path)
            self.assertTrue(loaded.first_run_complete)
            self.assertEqual(loaded.recent_sources[0]["conversation_count"], None)
            self.assertEqual(loaded.last_import["selected_count"], 42)
            self.assertEqual(loaded.recent_handoffs[0]["task"], "Continue the product train")
            self.assertEqual(loaded.recent_handoffs[0]["path"], str(handoff))

    def test_recent_source_is_deduplicated_by_provider_and_path(self) -> None:
        state = WorkstationState()
        state.remember_source("claude", "/tmp/export", conversation_count=1)
        state.remember_source("claude", "/tmp/export", conversation_count=2)
        self.assertEqual(len(state.recent_sources), 1)
        self.assertEqual(state.recent_sources[0]["conversation_count"], 2)


class LoreLibraryClientTests(unittest.TestCase):
    def test_search_returns_real_message_ids_for_continue_flow(self) -> None:
        def fake_run(command, **_kwargs):
            self.assertEqual(command[:2], ["lore-test", "search"])
            payload = {
                "hits": [
                    {
                        "messageId": "msg-real-123",
                        "sessionId": "session-9",
                        "source": "chatgpt",
                        "title": "Workstation design",
                        "text": "Build the cockpit, not more plumbing.",
                        "timestamp": "2026-08-12T13:00:00Z",
                    }
                ]
            }
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps(payload), stderr="")

        hits = LoreLibraryClient("lore-test", run_function=fake_run).search("cockpit")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].message_id, "msg-real-123")
        self.assertEqual(hits[0].session_id, "session-9")
        self.assertIn("cockpit", hits[0].text)

    def test_context_uses_exact_selected_message_id(self) -> None:
        commands: list[list[str]] = []

        def fake_run(command, **_kwargs):
            commands.append(list(command))
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps({"messageId": "msg-real-123", "messages": []}),
                stderr="",
            )

        payload = LoreLibraryClient("lore-test", run_function=fake_run).context("msg-real-123")
        self.assertEqual(commands[0], ["lore-test", "context", "msg-real-123", "--json"])
        self.assertEqual(payload["messageId"], "msg-real-123")


if __name__ == "__main__":
    unittest.main()
