from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from continuity_bridge_desktop import runtime  # noqa: E402
from continuity_bridge_desktop.lore_runtime import initialize_lore  # noqa: E402


class BundledLoreRuntimeTests(unittest.TestCase):
    def test_packaged_build_prefers_sibling_lore_launcher_for_default_setting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / ("ContinuityBridge.exe" if runtime.os.name == "nt" else "ContinuityBridge")
            launcher = root / ("ContinuityBridgeLore.exe" if runtime.os.name == "nt" else "ContinuityBridgeLore")
            app.write_text("app", encoding="utf-8")
            launcher.write_text("lore", encoding="utf-8")
            with (
                patch.object(runtime, "bundle_root", return_value=root / "_internal"),
                patch.object(runtime.sys, "executable", str(app)),
                patch.dict(runtime.os.environ, {}, clear=True),
            ):
                self.assertEqual(runtime.default_lore_command(), str(launcher))
                self.assertEqual(runtime.lore_command_for_setting("lore"), str(launcher))
                self.assertEqual(runtime.lore_command_for_setting(""), str(launcher))
                self.assertEqual(runtime.lore_command_for_setting("/custom/lore"), "/custom/lore")

    def test_lore_environment_override_wins(self) -> None:
        with patch.dict(runtime.os.environ, {"CONTINUITYBRIDGE_LORE": "/override/lore"}, clear=False):
            self.assertEqual(runtime.default_lore_command(), "/override/lore")

    def test_initialize_lore_is_explicit_shell_free_setup_command(self) -> None:
        completed = subprocess.CompletedProcess(
            ["/bundle/ContinuityBridgeLore", "setup"],
            0,
            stdout="Indexed 2 sources\n",
            stderr="",
        )
        with patch(
            "continuity_bridge_desktop.lore_runtime.subprocess.run",
            return_value=completed,
        ) as run:
            result = initialize_lore("/bundle/ContinuityBridgeLore")
        self.assertEqual(result.command, "/bundle/ContinuityBridgeLore")
        self.assertIn("Indexed 2 sources", result.output)
        run.assert_called_once_with(
            ["/bundle/ContinuityBridgeLore", "setup"],
            text=True,
            capture_output=True,
            check=False,
            shell=False,
        )


if __name__ == "__main__":
    unittest.main()
