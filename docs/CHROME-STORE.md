# Chrome Web Store — listing & submission guide

Everything needed to publish **React Router Inspector** to the Chrome Web
Store: the ready-to-paste listing copy, the assets you must supply, permission &
privacy answers the review requires, and a step-by-step submission checklist.

> **Choose a distribution mode.** If this is for your team only, publish it
> **Unlisted** (installable via direct link) or **Private** to your Google
> Workspace org, or push it via the Google Admin console (force-install by
> extension ID) — the most hands-off option for a team. If you intend it as a
> general tool for the React Router community, **Public** is fine, but expect
> heavier review of the broad host permissions (narrow them — see §3). If this
> started as an internal tool, confirm with your org before any public listing,
> and keep all screenshots/copy free of internal names, domains, and data.

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
• Every call as a row — client .data requests, GraphQL operations, REST calls, and
  (uniquely) the SERVER-SIDE SSR fetches your loaders make — each with URL,
  query params, request + response headers, timing, and decoded response body.
• Console that finally makes sense — browser logs AND server/SSR logs in one place,
  grouped so a logged object is one collapsible entry (not 15 fragmented lines),
  with source (browser/server) and level filter chips.
• Built for real work — resizable panes, wrapped URLs, error highlighting, a
  Preserve toggle across navigations, and a live router bridge that just works
  across every app you work on.

WHY IT'S DIFFERENT
Other React Router devtools inject an overlay into your app and reconstruct a
fake "network" view. This is a real Chrome DevTools panel that reads the actual
browser records and the actual router state — and a tiny dev-only server bridge
surfaces the SSR side that the browser physically cannot see. One install works
across all your apps; nothing ships in production.

Pairs with the companion dev-only Vite plugin (`vite-plugin-rr-inspector`) to
stream server logs and SSR API calls into the panel.

Does not collect, store, or transmit any data. Everything stays on your machine.
```

---

## 2. Required assets

| Asset | Spec | Status |
|-------|------|--------|
| Extension package | a **.zip** of the extension (use `./scripts/package.sh`) | ✅ `dist/…-v1.0.0.zip` |
| Store icon | 128×128 PNG | ✅ `icons/icon128.png` |
| Screenshots | **1280×800** or 640×400 PNG, 1–5 of them | ⬜ capture (see §4) |
| Small promo tile *(optional)* | 440×280 PNG | ⬜ optional |
| Marquee promo *(optional, public only)* | 1400×560 PNG | ⬜ optional |

---

## 3. Permissions & privacy answers (review will ask)

**Single purpose:**
> A DevTools panel that inspects React Router data flow (loader/action data,
> network and SSR API calls, and console logs) for React Router developers.

**Permission justifications:**
- `host_permissions` + content scripts scoped to **local dev hosts only**
  (`http://localhost/*`, `https://localhost/*`, `http://127.0.0.1/*`,
  `https://127.0.0.1/*`, `http://*.localhost/*`, `https://*.localhost/*`, any port).
  React Router apps run on localhost during development; the extension injects a
  read-only bridge there to read router state and relay the dev server's log
  stream. It only reads; it never modifies pages. (Browser-side network decoding
  uses the DevTools network API and needs no host permission, so it still works on
  any inspected origin.) If a developer's dev server runs on a custom host, they can
  widen the matches in the manifest — but localhost covers the vast majority.
- `devtools_page` — to add the panel. (Not a listed permission; declared directly.)
- **Remove `storage`** — the code uses page `localStorage`, not `chrome.storage`,
  so the `storage` permission is unused. Delete it from `manifest.json` before
  submitting (unused permissions are flagged).

**Data usage disclosure:** select **"Does not collect user data."** The extension
reads page/router/log data locally to render the panel and transmits nothing to
any server. No analytics, no remote code (the turbo-stream decoder is vendored).

**Privacy policy:** for "no data collected" a one-line policy suffices, e.g.:
> "React Router Inspector processes page and log data locally in your browser
> to render the DevTools panel. It does not collect, store, or transmit any data."
Host it anywhere reachable (an internal wiki page or a gist) and paste the URL.

---

## 4. Screenshots to capture (1280×800)

Load the extension (or open the bundled demo), size the window, and grab these:
1. **Hero** — the event list + a decoded **Loader Data** tree (Dates/Maps/BigInts).
2. **SSR call** — an `ssr` row selected with the **Headers** tab (request + response).
3. **Console** — server + browser logs with the source/level **filter chips**.
4. **Payload** — a GET row's **Payload** tab showing the full URL + query params.

macOS: `⌘⇧4` then space to grab the window, or size DevTools to 1280×800 and
`⌘⇧4` a region. (Reference shots live in `docs/screenshots/` if provided.)

---

## 5. Submit — step by step

1. **Developer account.** Go to the Chrome Web Store Developer Dashboard
   (`chrome.google.com/webstore/devconsole`). Pay the one-time **$5** registration
   fee. **Use an org-owned account or a Group Publisher** so the item survives
   personnel changes — not a personal login.
2. **Prep the package.** `./scripts/package.sh` → `dist/…-v<version>.zip`. First
   remove the unused `storage` permission (and optionally narrow host permissions).
3. **New item →** upload the zip.
4. Fill **Store listing** — paste the name, summary, description (§1), pick
   *Developer Tools*, upload the 128 icon and screenshots (§4).
5. Fill **Privacy practices** — single purpose, permission justifications, "does
   not collect user data," privacy policy URL (§3).
6. **Distribution** — choose **Unlisted** or **Private** (see the banner up top).
7. **Submit for review.** Approval is typically hours–days; broad permissions can
   extend it. You'll get an email on approval/rejection.
8. **Distribute** — share the item link (Unlisted), or push it via the Google
   Admin console (force-install by extension ID) for the team.

### Updating later
Bump `version` in `manifest.json`, rebuild (`./scripts/package.sh`), upload the new
zip to the same item, resubmit. Users auto-update.
