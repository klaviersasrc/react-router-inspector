# Chrome Web Store — listing & submission guide

Everything needed to publish or **update** **React Router Inspector** on the
Chrome Web Store: ready-to-paste listing copy, the "What's new" note, the assets
to supply, the permission & privacy answers review requires, and a step-by-step
runbook for both a first submission and an update to the existing item.

> **Current live version:** 1.0.8 · **This release:** 1.0.11 (item id
> `mejdpbjabihgbdgppfpcelmgpncknakj`).
> Jump straight to **§6 Update the existing listing** if the item is already
> published and you just want to ship 1.0.11.

> **Choose a distribution mode.** For your team only, publish **Unlisted**
> (installable via direct link) or **Private** to your Workspace org, or push it
> via the Google Admin console (force-install by extension ID). For the React
> Router community at large, **Public** is fine but expect heavier review of the
> broad optional host permission (it is optional and user-approved — see §3).

---

## 1. Listing copy (paste-ready)

**Name** (≤ 45 chars)
```
React Router Inspector
```

**Summary** (≤ 132 chars)
```
See React Router loader/action data, SSR API calls, and server + browser logs — decoded, per route — in one DevTools tab.
```

**Category:** Developer Tools  **Language:** English

**Detailed description** (paste into the description box):
```
Stop guessing what your React Router app is doing.

React Router v7 (framework mode) moves your data in ways the browser's Network
tab can't show you: loader/action payloads are encoded (turbo-stream, not JSON),
and the API calls that actually fetch your data run on the SERVER during SSR —
invisible to any normal browser tool. Debugging means squinting at the terminal
and decoding wire formats by hand.

React Router Inspector puts all of it in one DevTools panel, decoded and
organized the way you already read the Network tab.

WHAT YOU GET
• Loader & action data, decoded — the real values (Dates, Maps, BigInts and all),
  per route, live from the running router. No more reading turbo-stream by hand.
• A loader-data diff — one toggle highlights exactly what changed in a route's
  data since the previous navigation (added / changed / removed keys).
• A Routes tab — the full matched-route tree for a navigation, each route's
  params and its own loader-data slice.
• Every call as a row — client .data requests, GraphQL operations, REST calls, and
  (uniquely) the SERVER-SIDE SSR fetches your loaders make — each with URL,
  query params, request + response headers, status, timing, size, and the decoded
  response body. Sort them at a glance with status/duration/size columns, color-
  coded call types, and an Errors filter.
• Copy anything — hover any value to copy it, or copy a whole request as JSON, a
  URL, or a ready-to-run cURL command.
• Find in pane (Ctrl/Cmd+F) — search the active data tree; matches expand and
  highlight as you step through them.
• A console that finally makes sense — browser logs AND server/SSR logs together
  in a dockable, drag-resizable split pane you can keep open beside your events,
  grouped so a logged object is one collapsible entry (not 15 fragmented lines),
  with source (browser/server) and level filter chips.
• Share a repro — export a captured session to JSON (auth/cookie headers redacted)
  and import it later, or on another machine.
• Built for real work — a filter mini-syntax (status:5xx, method:POST,
  kind:graphql, -exclude), full keyboard navigation, a per-request summary header,
  a truncation marker that shows exactly where a capped body was cut off, error
  highlighting, group-by-navigation, a Preserve toggle across navigations, and
  preferences that persist across reloads.

WHY IT'S DIFFERENT
Other React Router devtools inject an overlay into your app and reconstruct a
fake "network" view. This is a real Chrome DevTools panel that reads the actual
browser records and the actual router state — and a tiny dev-only server bridge
surfaces the SSR side that the browser physically cannot see. One install works
across all your apps. Works on localhost out of the box; enable any deployed
origin on demand. Nothing ships in production.

Pairs with the companion dev-only Vite plugin (vite-plugin-rr-inspector) to
stream server logs and SSR API calls into the panel.

Does not collect, store, or transmit any data. Everything stays on your machine.
```

---

## 1a. "What's new" note (paste into the update's What's-new field)

Plain text — the store does not render Markdown. Covers everything since the live
1.0.8.
```
v1.0.11 — a big inspection upgrade

• Routes tab — see the full matched-route tree for a navigation, each route's params and its own loader data.
• Loader-data diff — highlights exactly what changed vs the previous navigation to the same route.
• Copy anything — hover any value to copy it, or copy a whole request as JSON, a URL, or a ready-to-run cURL command.
• Find in pane (Ctrl/Cmd+F) — search the active data tree; hits expand and highlight as you step through them.
• Console is now a dockable split pane that docks where it fits — on the right when DevTools is docked to the bottom, along the bottom when docked to the side (Auto, or pin a side). Drag to resize; keep it open beside your events.
• Cleaner event list — status, duration, and size columns, color-coded call types, and an Errors filter.
• Filter mini-syntax — status:5xx, method:POST, kind:graphql, -exclude.
• Export / import a captured session as JSON (auth headers redacted) to share a repro.
• Truncation marker — capped responses now show exactly where the data was cut off.
• Keyboard navigation, a per-request summary header, group-by-navigation, and preferences that persist across reloads.

No app changes required. Works on localhost out of the box; enable any deployed origin on demand.
```

---

## 2. Required assets

| Asset | Spec | Status |
|-------|------|--------|
| Extension package | **.zip with `manifest.json` at the root** — build with `./scripts/package-store.sh` | ✅ `dist/react-router-inspector-store-v1.0.11.zip` |
| Store icon | 128×128 PNG | ✅ `icons/icon128.png` |
| Screenshots | **1280×800** PNG, 1–5 of them | ✅ 4 in `dist/store-shots/` (see §4) |
| Small promo tile *(optional)* | 440×280 PNG | ✅ `dist/store-shots/promo-small.jpg` *(regenerate if UI shown)* |
| Marquee promo *(optional, public only)* | 1400×560 PNG | ✅ `dist/store-shots/promo-marquee.jpg` *(regenerate if UI shown)* |

> ⚠️ Use `package-store.sh`, **not** `package.sh`. The Web Store requires
> `manifest.json` at the zip root; `package.sh` produces the load-unpacked team
> zip and may nest it. `package-store.sh` asserts manifest-at-root and fails loud
> otherwise.

---

## 3. Permissions & privacy answers (review will ask)

The manifest is already minimal — **nothing to strip before submitting**:
`permissions: ["scripting"]`, no `storage`, host permissions scoped to localhost,
broad HTTP(S) only under `optional_host_permissions`.

**Single purpose:**
> A DevTools panel that inspects React Router data flow (loader/action data,
> network and SSR API calls, and console logs) for React Router developers.

**Permission justifications:**
- **Host permissions (localhost only).** Required `host_permissions` + static
  content scripts are scoped to local development hosts only
  (`http://localhost/*`, `https://localhost/*`, `http://127.0.0.1/*`,
  `https://127.0.0.1/*`, `http://*.localhost/*`, `https://*.localhost/*`, any port).
- **`optional_host_permissions` (`http://*/*`, `https://*/*`).** Broad HTTP(S) is
  **optional** — a developer clicks **Enable this site** in the panel and approves
  only the exact deployed origin they are currently inspecting; the extension then
  dynamically registers the same read-only bridge for that one origin. Browser-side
  network decoding uses the DevTools network API and needs no host permission, so
  it works on every inspected origin even before access is granted.
- **`scripting`.** Registers the read-only bridge on a user-approved deployed
  origin. Never used until the user grants optional host access from the panel.
- **`devtools_page`.** Adds the panel. (Declared directly, not a listed permission.)

**Data usage disclosure:** select **"Does not collect user data."** The extension
reads page/router/log data locally to render the panel and transmits nothing. No
analytics, no remote code (the turbo-stream decoder is vendored).

**Privacy policy:** a one-line policy suffices (see `docs/PRIVACY.md`), e.g.:
> "React Router Inspector processes page and log data locally in your browser
> to render the DevTools panel. It does not collect, store, or transmit any data."
Host it anywhere reachable and paste the URL.

---

## 4. Screenshots (1280×800) — already generated

Four store screenshots ship pre-rendered in `dist/store-shots/` (regenerated for
the current (1.0.11) UI):

1. `shot-1-loader-data.png` — event list + a decoded **Loader Data** tree with the
   diff toggle (Dates / Maps / BigInts, added/changed highlights).
2. `shot-2-routes.png` — the **Routes** tab: matched-route hierarchy with params
   and per-route loader data.
3. `shot-3-console.png` — the **Console** split pane with source/level filter chips
   and the response truncation marker.
4. `shot-4-payload.png` — a request's **Payload** tab with Copy JSON / URL / cURL.

**To regenerate them** (e.g. after a UI change) from the source mock, no live
extension needed:
```bash
# 1. edit docs/store/store-shots.html if the UI changed, then:
node -e '
const fs=require("fs");
const html=fs.readFileSync("docs/store/store-shots.html","utf8");
const style=html.match(/<style>[\s\S]*?<\/style>/)[0];
const shots=html.match(/<section class="shot">[\s\S]*?<\/section>/g);
const names=["shot-1-loader-data","shot-2-routes","shot-3-console","shot-4-payload"];
fs.mkdirSync("/tmp/rri-shots",{recursive:true});
shots.forEach((s,i)=>fs.writeFileSync(`/tmp/rri-shots/${names[i]}.html`,
  `<!doctype html><html><head><meta charset=utf-8>${style}</head><body>${s}</body></html>`));
'
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for n in shot-1-loader-data shot-2-routes shot-3-console shot-4-payload; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1280,800 --screenshot="dist/store-shots/$n.png" "file:///tmp/rri-shots/$n.html"
done
```
Each `.shot` in the mock is exactly 1280×800, so the capture is pixel-exact.

---

## 4a. Live capture (optional — real data instead of the mock)

The §4 renders come from the mock, with illustrative data. To grab the real panel
with your own app's traffic, follow this. Result: four **1280×800** PNGs.

**Prep the app**
1. Run a React Router v7 (framework mode) app locally with the dev-only Vite
   plugin wired in (see `USER-GUIDE.md` → "Server-side"), so `ssr` rows and
   `server` logs appear: `npm run dev`.
2. Chrome → open the app → DevTools (⌥⌘I) → **React Router** tab. Zoom 100%
   (⌘0). Keep **Preserve** on (default).
3. In the app, navigate between 2–3 routes and trigger a mutation or two, so the
   list has `router` + `data` + `gql`/`api` + `ssr` rows and the console has both
   a browser and a `server` line. Visit at least one route **twice** (the diff
   needs a previous snapshot).

**Frame DevTools to a known size**
4. Undock DevTools into its own window (DevTools **⋮** → *Dock side* → *Undock into
   separate window*) — a separate window lets you frame just the panel.
5. Size that window roughly 16:10 around the panel. Don't fight the exact pixels
   here; capture a little large and normalize in step 11.

**Capture each shot** — macOS: **⌘⇧4**, drag a region (hold **Space** to grab a
whole window). On a Retina display a region is captured at 2× (a 1280×800 region →
2560×1600 file); that's fine, step 11 normalizes it.

6. **Shot 1 — Loader Data + diff:** select a row whose route you visited twice;
   Loader Data tab active; click the **Diff** toggle so added/changed highlights
   show. Frame list + detail.
7. **Shot 2 — Routes:** same selection → **Routes** tab; expand the matched-route
   tree so `params` and a `loaderData` slice are visible.
8. **Shot 3 — Console:** click **Console** in the toolbar to open the bottom split
   pane; ensure a **SERVER** badge and a browser line are both visible and a few
   level chips show; select a `data`/`ssr` row above so a decoded body (or the
   truncation marker) shows in the top pane.
9. **Shot 4 — Payload:** select a `gql`/`api` row → **Payload** tab; full URL +
   query/variables visible; keep the **Copy JSON / URL / cURL** buttons in frame.

**Normalize to exactly 1280×800** (Retina-safe):
```bash
for n in shot-1-loader-data shot-2-routes shot-3-console shot-4-payload; do
  sips -Z 1280 "$n.png" >/dev/null            # longest side -> 1280 (keeps aspect; halves a 2x capture)
  sips -c 800 1280 "$n.png" >/dev/null        # center-crop to exactly 1280x800 (no distortion)
  sips -g pixelWidth -g pixelHeight "$n.png"  # verify: 1280 x 800
done
```
If a crop frames too tight, the source aspect wasn't ~16:10 — re-capture a wider
region, or force it with `sips --resampleHeightWidth 800 1280 "$n.png"` (accepts a
hair of distortion). Then move the four into `dist/store-shots/`, replacing the
mock renders.

**Before upload**
- Match the DevTools theme to your other assets — **dark** reads better for a
  devtool (the mock is dark).
- Keep internal names/domains/data out of frame (use a demo app or the bundled
  `demo/`); redact anything sensitive.
- Store wants 1280×800 (or 640×400), PNG/JPEG, no borders or rounded corners.

---

## 5. First submission — step by step

Skip to **§6** if the item is already published.

1. **Developer account.** Chrome Web Store Developer Dashboard
   (`chrome.google.com/webstore/devconsole`), pay the one-time **$5** fee. Use an
   **org-owned account or a Group Publisher** so the item survives personnel
   changes — not a personal login.
2. **Build the package.** `./scripts/package-store.sh` →
   `dist/react-router-inspector-store-v<version>.zip` (manifest at root).
3. **New item →** upload the zip.
4. **Store listing** — paste name, summary, description (§1); pick *Developer
   Tools*; upload `icons/icon128.png` and the four screenshots (§4).
5. **Privacy practices** — single purpose, permission justifications, "does not
   collect user data," privacy policy URL (§3).
6. **Distribution** — **Unlisted** / **Private** / **Public** (see the banner).
7. **Submit for review.** Approval is typically hours–days; you'll get an email.
8. **Distribute** — share the item link (Unlisted), or force-install by extension
   ID via the Google Admin console (team).

---

## 6. Update the existing listing to 1.0.11 — step by step

The item is already live at 1.0.8; this ships 1.0.11.

1. **Confirm the version bump.** `manifest.json` is at **1.0.11** (already done).
   The store rejects an upload whose version is ≤ the published one.
2. **Build the store zip:**
   ```bash
   ./scripts/package-store.sh
   ```
   → `dist/react-router-inspector-store-v1.0.11.zip` (prints "manifest.json is at
   the zip root — store-ready" and a SHA-256).
3. **Open the dashboard.** `chrome.google.com/webstore/devconsole` → your
   publisher → **React Router Inspector** (`mejdpbjabihgbdgppfpcelmgpncknakj`).
4. **Package tab → Upload new package** → select the zip from step 2. Wait for the
   version to register as 1.0.11.
5. **Store listing tab:**
   - Replace the **Description** with the block in §1.
   - Confirm the **Summary** (§1) and category (Developer Tools).
   - **Screenshots:** remove the old images and upload the four from
     `dist/store-shots/` (§4). Order them 1→4.
   - *(Optional)* refresh the promo tiles if you use them.
6. **Privacy practices tab:** nothing changed — the answers in §3 still apply
   (still `scripting` + optional host access, still "does not collect user data").
   Just confirm the privacy-policy URL is still set.
7. **"What's new" / release notes:** paste the note from §1a.
8. **Save draft → Submit for review.** Users on 1.0.8 auto-update once it's
   approved.
9. **GitWorld release** (source of truth) is already cut: `v1.0.11` at
   `gitworld.lasiako.com/kennard/fmdsReactRouterInspector/releases`.
