# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import subprocess
import sys


# PyInstaller exposes SPECPATH as the directory containing this spec file.
ROOT = Path(SPECPATH).parent
LORE_RUNTIME = ROOT / "packaging" / "lore-runtime"
LORE_ENTRY = LORE_RUNTIME / "node_modules" / "@jordanhindo" / "lore" / "dist" / "cli" / "lore.js"


def resolve_node_executable() -> str:
    """Ask the Node runtime on PATH for its exact platform executable path."""
    try:
        result = subprocess.run(
            ["node", "-p", "process.execPath"],
            text=True,
            capture_output=True,
            shell=False,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"Node.js could not be resolved for the desktop release bundle: {error}") from error
    node_path = Path(result.stdout.strip()) if result.returncode == 0 else Path()
    if result.returncode != 0 or not node_path.is_file():
        detail = result.stderr.strip() or result.stdout.strip() or "node -p process.execPath failed"
        raise SystemExit(f"Node.js must be available while building the desktop release bundle: {detail}")
    return str(node_path)


if not LORE_ENTRY.is_file():
    raise SystemExit(
        "Bundled Lore runtime is missing. Build the pinned Lore source into packaging/lore-runtime before PyInstaller."
    )

NODE = resolve_node_executable()

bridge_datas = [
    (str(ROOT / "bin"), "bridge/bin"),
    (str(ROOT / "src"), "bridge/src"),
    (str(ROOT / "package.json"), "bridge"),
    (str(ROOT / "browser-extension"), "browser-extension"),
    (str(LORE_RUNTIME), "lore-runtime"),
    (str(ROOT / "LICENSE"), "."),
    (str(ROOT / "NOTICE"), "."),
]
node_binaries = [(NODE, "runtime")]

app_analysis = Analysis(
    [str(ROOT / "desktop" / "continuity_bridge_workstation.py")],
    pathex=[str(ROOT / "desktop")],
    binaries=node_binaries,
    datas=bridge_datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

lore_analysis = Analysis(
    [str(ROOT / "desktop" / "continuity_bridge_lore.py")],
    pathex=[str(ROOT / "desktop")],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

# Keep both entrypoints independently analyzable. They still share one physical
# COLLECT directory, but avoiding MERGE removes cross-executable dependency
# archives that are fragile inside macOS .app bundles.
app_pyz = PYZ(app_analysis.pure)
app_exe = EXE(
    app_pyz,
    app_analysis.scripts,
    [],
    exclude_binaries=True,
    name="ContinuityBridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

lore_pyz = PYZ(lore_analysis.pure)
lore_exe = EXE(
    lore_pyz,
    lore_analysis.scripts,
    [],
    exclude_binaries=True,
    name="ContinuityBridgeLore",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

collection = COLLECT(
    app_exe,
    lore_exe,
    app_analysis.binaries,
    app_analysis.datas,
    lore_analysis.binaries,
    lore_analysis.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="ContinuityBridge",
)

if sys.platform == "darwin":
    app = BUNDLE(
        collection,
        name="ContinuityBridge.app",
        icon=None,
        bundle_identifier="com.acrinym.continuitybridge",
        info_plist={
            "CFBundleName": "ContinuityBridge",
            "CFBundleDisplayName": "ContinuityBridge",
            "CFBundleShortVersionString": "1.0.0",
            "NSHighResolutionCapable": True,
        },
    )
