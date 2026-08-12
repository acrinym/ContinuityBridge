"""Locate ContinuityBridge runtime assets in source and packaged desktop builds."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import sys


def bundle_root() -> Path | None:
    root = getattr(sys, "_MEIPASS", None)
    return Path(root) if root else None


def default_bridge_cli() -> Path:
    bundled = bundle_root()
    if bundled:
        candidate = bundled / "bridge" / "bin" / "continuity-bridge.js"
        if candidate.exists():
            return candidate

    installed = Path(__file__).resolve()
    repository_candidate = installed.parents[2] / "bin" / "continuity-bridge.js"
    if repository_candidate.exists():
        return repository_candidate
    return Path("continuity-bridge")


def default_node_command() -> str:
    override = os.environ.get("CONTINUITYBRIDGE_NODE", "").strip()
    if override:
        return override

    bundled = bundle_root()
    if bundled:
        candidates = [
            bundled / "runtime" / "node.exe",
            bundled / "runtime" / "node",
        ]
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)

    return shutil.which("node") or "node"


def packaged_lore_launcher() -> Path | None:
    if bundle_root() is None:
        return None
    executable = Path(sys.executable)
    suffix = ".exe" if os.name == "nt" else ""
    candidate = executable.with_name(f"ContinuityBridgeLore{suffix}")
    return candidate if candidate.is_file() else None


def default_lore_command() -> str:
    override = os.environ.get("CONTINUITYBRIDGE_LORE", "").strip()
    if override:
        return override
    packaged = packaged_lore_launcher()
    if packaged:
        return str(packaged)
    return shutil.which("lore") or "lore"


def lore_command_for_setting(value: object) -> str:
    saved = str(value or "").strip()
    if bundle_root() is not None and (not saved or saved == "lore"):
        return default_lore_command()
    return saved or default_lore_command()


def runtime_summary() -> dict[str, str | bool]:
    cli = default_bridge_cli()
    node = default_node_command()
    node_path = Path(node)
    lore = default_lore_command()
    lore_path = Path(lore)
    return {
        "packaged": bundle_root() is not None,
        "bridge_cli": str(cli),
        "bridge_available": cli.exists() if cli.suffix.lower() == ".js" else bool(shutil.which(str(cli))),
        "node_command": node,
        "node_available": node_path.exists() if node_path.parent != Path(".") else bool(shutil.which(node)),
        "lore_command": lore,
        "lore_available": lore_path.is_file() if lore_path.parent != Path(".") else bool(shutil.which(lore)),
        "bundled_lore": packaged_lore_launcher() is not None,
    }
