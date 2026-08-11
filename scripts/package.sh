#!/usr/bin/env bash
# Build a distributable zip of the Chrome extension (runtime files only).
# Teammates unzip it and "Load unpacked" the resulting folder.
#
#   ./scripts/package.sh
#
# Output: dist/react-router-inspector-v<version>.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="react-router-inspector"
VER="$(node -e "process.stdout.write(require('./manifest.json').version)")"
OUT="dist"
STAGE="$OUT/$NAME"
ZIP="$OUT/$NAME-v$VER.zip"

# Only the files Chrome actually loads — no demo/, test/, server-bridge/, docs, git.
RUNTIME=(manifest.json devtools.html panel.html panel.css)

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE/src"
cp "${RUNTIME[@]}" "$STAGE/"
cp -R src/. "$STAGE/src/"
cp -R icons "$STAGE/icons"
# Ship the dev-only Vite plugin so users can get it from the panel's Setup view.
mkdir -p "$STAGE/server-bridge"
cp server-bridge/vite-plugin-rr-inspector.mjs server-bridge/vite-plugin-rr-inspector.d.mts "$STAGE/server-bridge/"
# Ship a short install note inside the folder.
cp INSTALL.md "$STAGE/README.md" 2>/dev/null || true
find "$STAGE" -name '.DS_Store' -delete

( cd "$OUT" && zip -rq "$(basename "$ZIP")" "$NAME" )
rm -rf "$STAGE"

echo "Built $ZIP"
command -v shasum >/dev/null && shasum -a 256 "$ZIP"
