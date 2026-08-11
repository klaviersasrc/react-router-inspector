#!/usr/bin/env bash
# Cut a release on a self-hosted (Gitea-compatible) Git mirror for the current
# manifest version and attach the built zip. For GitHub releases, just push a
# `v*` tag — the .github/workflows/release.yml workflow builds and publishes.
#
#   ./scripts/release.sh [--notes <file.md>] [--force]
#
# Reads the version from manifest.json (tag = v<version>). Handles the mirror's
# quirks: the tag must exist first, and assets upload as a RAW body. Verifies the
# live download's SHA-256 against the local build.
#
# Config lives in a gitignored .release.env (not committed):
#   GW_HOST=https://your-git-host   GW_OWNER=you   GW_REPO=your-repo
#   GW_BOT=/path/to/token-helper.sh   # prints a PAT for `$GW_BOT pat <repo>`
#
#   --notes <file>  use <file> as the release body (default: a short blurb)
#   --force         if a release already exists for the tag, delete + recreate it
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f "$ROOT/.release.env" ] && . "$ROOT/.release.env"
OWNER="${GW_OWNER:?set GW_OWNER in .release.env}"
REPO="${GW_REPO:?set GW_REPO in .release.env}"
HOST="${GW_HOST:?set GW_HOST in .release.env}"
API="$HOST/api/v1/repos/$OWNER/$REPO"
WEB="$HOST/$OWNER/$REPO/releases"
BOT="${GW_BOT:-$ROOT/../tools/gitworld-bot.sh}"

NOTES=""; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --notes) NOTES="${2:?--notes needs a file}"; shift 2;;
    --force) FORCE=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

VER="$(node -e "process.stdout.write(require('./manifest.json').version)")"
TAG="v$VER"
ZIP="dist/react-router-inspector-v$VER.zip"
PAT="$("$BOT" pat "$REPO")"
[ -n "$PAT" ] || { echo "no bot PAT in keychain for $REPO" >&2; exit 1; }

echo "==> Building $ZIP"
./scripts/package.sh >/dev/null
[ -f "$ZIP" ] || { echo "build did not produce $ZIP" >&2; exit 1; }

echo "==> Ensuring tag $TAG (release-create won't create it)"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git tag -a "$TAG" -m "react-router-inspector $TAG"
# Never block on a credential prompt (e.g. no TTY); the API step fails clearly if
# the tag never reached the remote.
GIT_TERMINAL_PROMPT=0 git push -q origin "$TAG" 2>/dev/null || echo "    (tag push skipped/failed — assuming it's already on the remote)"

echo "==> Publishing release via GitWorld API"
PAT="$PAT" API="$API" VER="$VER" TAG="$TAG" ZIP="$ZIP" FORCE="$FORCE" NOTES="$NOTES" WEB="$WEB" node - <<'JS'
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { PAT, API, VER, TAG, ZIP, FORCE, NOTES, WEB } = process.env;
const H = { Authorization: `Bearer ${PAT}` };
const j = (r) => r.json();

(async () => {
  const list = await fetch(`${API}/releases`, { headers: H }).then(j);
  const existing = (list.releases || []).find((r) => r.tag === TAG);
  if (existing) {
    if (FORCE !== "1") { console.error(`release ${TAG} already exists (id ${existing.id}); re-run with --force to replace`); process.exit(1); }
    console.log(`    deleting existing release ${existing.id} (--force)`);
    await fetch(`${API}/releases/${existing.id}`, { method: "DELETE", headers: H });
  }

  const body = NOTES && fs.existsSync(NOTES)
    ? fs.readFileSync(NOTES, "utf8")
    : `React Router Inspector v${VER}. Download the zip, unzip, and **Load unpacked** in chrome://extensions (Developer mode). See INSTALL.md.`;

  const rel = await fetch(`${API}/releases`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: TAG, name: `${TAG} — React Router Inspector`, body, draft: false, prerelease: false }),
  }).then(j);
  if (!rel.id) { console.error("create failed:", JSON.stringify(rel).slice(0, 300)); process.exit(1); }
  console.log(`    release id ${rel.id}`);

  const buf = fs.readFileSync(ZIP);
  const up = await fetch(`${API}/releases/${rel.id}/assets?name=${encodeURIComponent(path.basename(ZIP))}`, {
    method: "POST", headers: { ...H, "Content-Type": "application/zip" }, body: buf,
  });
  if (up.status !== 201) { console.error("asset upload failed:", up.status, (await up.text()).slice(0, 200)); process.exit(1); }
  const asset = await up.json();
  console.log(`    uploaded ${asset.name} (${asset.size} bytes)`);

  // Verify the live download matches the local build.
  const relist = await fetch(`${API}/releases`, { headers: H }).then(j);
  const aid = (relist.releases || []).find((r) => String(r.id) === String(rel.id))?.assets?.[0]?.id;
  const dl = Buffer.from(await fetch(`${API}/releases/assets/${aid}`, { headers: H }).then((r) => r.arrayBuffer()));
  const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
  if (sha(dl) !== sha(buf)) { console.error("download SHA MISMATCH ❌"); process.exit(1); }
  console.log("    download SHA matches build ✅");
  console.log(`\nReleased ${TAG}: ${WEB}`);
})().catch((e) => { console.error(e); process.exit(1); });
JS
