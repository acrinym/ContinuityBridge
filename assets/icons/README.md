# ContinuityBridge icon assets

Generated from the canonical `../brand/continuitybridge-mark.svg`.

- `continuitybridge-256.png` — application icon source passed to PyInstaller.
- PyInstaller converts the raster source to the native Windows/macOS icon format during platform builds; release tooling installs Pillow so that conversion is available.
- Browser-specific 16/32/48/128 PNGs live under `browser-extension/icons/` because Manifest V3 requires raster icon files at declared paths.

Keep the PNG and browser sizes visually aligned with the canonical SVG mark.
