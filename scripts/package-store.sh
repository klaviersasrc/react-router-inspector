#!/usr/bin/env bash
# Build a Chrome Web Store upload zip of the extension.
#
#   ./scripts/package-store.sh
#
# The Web Store requires manifest.json at the ZIP ROOT. scripts/package.sh nests
# the runtime files under a `react-router-inspector/` folder (for "Load unpacked"
# team distribution), which the store REJECTS. This script stages the same
# runtime file set but zips the stage-dir *contents*, so manifest.json is at root.
#
# Output: dist/react-router-inspector-store-v<version>.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="react-router-inspector"
VER="$(node -e "process.stdout.write(require('./manifest.json').version)")"
OUT="dist"
STAGE="$OUT/_store_stage"
ZIP="$OUT/$NAME-store-v$VER.zip"

# Only the files Chrome actually loads — no demo/, test/, docs, git, scripts.
RUNTIME=(manifest.json devtools.html panel.html panel.css)

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp "${RUNTIME[@]}" "$STAGE/"
cp -R src "$STAGE/src"
cp -R icons "$STAGE/icons"
# Ship the dev-only Vite plugin so users can get it from the panel's Setup view.
mkdir -p "$STAGE/server-bridge"
cp server-bridge/vite-plugin-rr-inspector.mjs server-bridge/vite-plugin-rr-inspector.d.mts "$STAGE/server-bridge/"
find "$STAGE" -name '.DS_Store' -delete

# Zip the STAGE CONTENTS (note the trailing "."), not the stage folder itself —
# this is what puts manifest.json at the zip root.
( cd "$STAGE" && zip -rq "../$(basename "$ZIP")" . )
rm -rf "$STAGE"

echo "Built $ZIP"
command -v shasum >/dev/null && shasum -a 256 "$ZIP"

# Fail loudly if manifest.json is NOT at the zip root (the whole point).
if unzip -l "$ZIP" | awk '{print $4}' | grep -qx "manifest.json"; then
  echo "OK: manifest.json is at the zip root — store-ready."
else
  echo "ERROR: manifest.json is NOT at the zip root — the store will reject this." >&2
  exit 1
fi
