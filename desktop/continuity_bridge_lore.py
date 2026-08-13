"""Stable executable boundary for the Lore runtime bundled with ContinuityBridge."""

from __future__ import annotations

import os
from pathlib import Path
import sys


def bundle_root() -> Path:
    root = getattr(sys, "_MEIPASS", None)
    if root:
        return Path(root)
    return Path(__file__).resolve().parents[1]


def bundled_node(root: Path) -> Path:
    candidates = (root / "runtime" / "node.exe", root / "runtime" / "node")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit("ContinuityBridge bundled Node runtime is missing.")


def bundled_lore_cli(root: Path) -> Path:
    candidate = root / "lore-runtime" / "node_modules" / "@jordanhindo" / "lore" / "dist" / "cli" / "lore.js"
    if candidate.is_file():
        return candidate
    raise SystemExit("ContinuityBridge bundled Lore runtime is missing.")


def main() -> None:
    root = bundle_root()
    node = bundled_node(root)
    lore = bundled_lore_cli(root)
    os.execv(str(node), [str(node), str(lore), *sys.argv[1:]])


if __name__ == "__main__":
    main()
