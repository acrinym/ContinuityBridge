"""Stable executable boundary for the Lore runtime bundled with ContinuityBridge."""

from __future__ import annotations

import os
from pathlib import Path
import sys


def asset_roots() -> tuple[Path, ...]:
    """Return plausible shared-data roots for PyInstaller one-folder/app layouts."""
    roots: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        roots.append(Path(meipass))

    executable_dir = Path(sys.executable).resolve().parent
    roots.extend(
        (
            executable_dir,
            executable_dir / "_internal",
            executable_dir.parent / "Frameworks",
            executable_dir.parent / "Resources",
        )
    )

    if not meipass:
        roots.append(Path(__file__).resolve().parents[1])

    unique: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root)
        if key not in seen:
            seen.add(key)
            unique.append(root)
    return tuple(unique)


def _find_asset(relative_candidates: tuple[Path, ...], description: str) -> Path:
    checked: list[str] = []
    for root in asset_roots():
        for relative in relative_candidates:
            candidate = root / relative
            checked.append(str(candidate))
            if candidate.is_file():
                return candidate
    detail = "\n".join(f"  - {path}" for path in checked)
    raise SystemExit(f"ContinuityBridge bundled {description} is missing. Checked:\n{detail}")


def bundled_node() -> Path:
    return _find_asset(
        (Path("runtime/node.exe"), Path("runtime/node")),
        "Node runtime",
    )


def bundled_lore_cli() -> Path:
    return _find_asset(
        (Path("lore-runtime/node_modules/@jordanhindo/lore/dist/cli/lore.js"),),
        "Lore runtime",
    )


def main() -> None:
    node = bundled_node()
    lore = bundled_lore_cli()
    os.execv(str(node), [str(node), str(lore), *sys.argv[1:]])


if __name__ == "__main__":
    main()
