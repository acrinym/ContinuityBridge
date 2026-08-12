from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop.repository_links import (  # noqa: E402
    GitRepositoryClient,
    RepositoryContext,
    RepositoryLinkStore,
    normalize_remote,
    sanitize_reference,
)


class RepositoryLinkStoreTests(unittest.TestCase):
    def test_normalizes_https_and_ssh_remotes_to_same_identity(self) -> None:
        self.assertEqual(normalize_remote("https://token@github.com/acme/widget.git"), "github.com/acme/widget")
        self.assertEqual(normalize_remote("git@github.com:acme/widget.git"), "github.com/acme/widget")
        self.assertEqual(normalize_remote("ssh://deploy:secret@github.com/acme/widget.git"), "github.com/acme/widget")
        self.assertNotIn("secret", normalize_remote("ssh://deploy:secret@github.com/acme/widget.git") or "")

    def test_sanitizes_explicit_refs_without_credentials_queries_or_fragments(self) -> None:
        self.assertEqual(sanitize_reference("#42"), "#42")
        self.assertEqual(
            sanitize_reference(
                "https://token@github.com/acme/widget/pull/8?access_token=secret#discussion"
            ),
            "https://github.com/acme/widget/pull/8",
        )

    def test_links_survive_restart_and_match_message_or_session(self) -> None:
        context = RepositoryContext(
            key="remote:github.com/acme/widget",
            name="widget",
            remote="github.com/acme/widget",
            branch="main",
            head="abc123",
            dirty=False,
            local_path="/work/widget",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "repository-links.json"
            store = RepositoryLinkStore()
            store.link_evidence(
                context,
                message_id="message-1",
                session_id="session-1",
                issue_refs=("#42",),
                pull_request_refs=("https://github.com/acme/widget/pull/8",),
            )
            store.link_handoff(
                context,
                path="/handoffs/HANDOFF.md",
                message_ids=("message-2",),
            )
            store.save(path)

            loaded = RepositoryLinkStore.load(path)
            self.assertTrue(loaded.matches(context.key, message_id="message-1"))
            self.assertTrue(loaded.matches(context.key, message_id="other", session_id="session-1"))
            related = loaded.related(context.key)
            self.assertEqual(related["messageIds"], ["message-1", "message-2"])
            self.assertEqual(related["issues"], ["#42"])
            self.assertEqual(related["handoffs"], ["/handoffs/HANDOFF.md"])

    def test_git_inspection_uses_real_coordinates_from_command_outputs(self) -> None:
        root = str(Path.cwd())

        def fake_run(command, **_kwargs):
            args = command[1:]
            outputs = {
                ("rev-parse", "--show-toplevel"): root,
                ("rev-parse", "HEAD"): "deadbeef",
                ("branch", "--show-current"): "feature/repo-links",
                ("status", "--porcelain"): " M README.md",
                ("remote", "get-url", "origin"): "git@github.com:acme/widget.git",
            }
            return subprocess.CompletedProcess(command, 0, stdout=outputs[tuple(args)] + "\n", stderr="")

        context = GitRepositoryClient(run_function=fake_run).inspect(root)
        self.assertEqual(context.remote, "github.com/acme/widget")
        self.assertEqual(context.key, "remote:github.com/acme/widget")
        self.assertEqual(context.branch, "feature/repo-links")
        self.assertTrue(context.dirty)


if __name__ == "__main__":
    unittest.main()
