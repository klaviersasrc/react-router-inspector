# React Router Inspector

A Chrome DevTools extension that shows React Router's data flow the way the Network
tab shows request payload + response body: **per route, decoded, readable**. Built to
replace the in-app `react-router-devtools` panel for inspection work.

## What it does (POC scope)

- Adds a **React Router** panel to Chrome DevTools.
- Captures the single-fetch `.data` requests (loaders = GET, actions = POST) from the
  DevTools network feed — **no changes to your app required**.
- Splits each event into tabs: **Loader Data** (decoded), **Payload** (query params +
  form body), **Response** (decoded body), **Raw** (untouched wire text).
- Optional **page bridge** (MAIN-world script) that reads the live router state
  (`loaderData` / `actionData`) directly for the richest view — no app import needed,
  it self-injects; falls back silently if the router can't be reached.

Two data sources, shown by the badge in the toolbar:
- `network decode` — decoded from captured `.data` traffic (works on prod, any RR app).
- `live router bridge` — read straight from the running router (fullest data).

## Load it (unpacked)

1. Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top right).
3. **Load unpacked** → select this `rr-inspector/` folder.
4. Open DevTools on your RR app → **React Router** tab.
5. Navigate / submit a form in the app; events stream into the panel.

Reload the extension after any file edit (the ⟳ on its card), then re-open DevTools.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest; devtools page + bridge content scripts + relay worker |
| `devtools.html` / `src/devtools.js` | registers the DevTools panel |
| `panel.html` / `panel.css` / `src/panel.js` | the panel UI + network capture + rendering |
| `src/turbo-stream-decode.js` | decodes single-fetch payloads (see spike notes) |
| `src/json-tree.js` | collapsible JSON tree renderer |
| `src/injected.js` | MAIN-world page bridge (live router + fetch capture) |
| `src/content.js` | ISOLATED relay: page → extension |
| `src/background.js` | routes bridge messages to the right panel |

## Team distribution

Build a versioned, runtime-only zip for teammates:

```bash
./scripts/package.sh        # -> dist/react-router-inspector-v<version>.zip
```

The zip contains only the files Chrome loads (no `demo/`, `test/`, `server-bridge/`,
or docs) plus an `INSTALL.md`. Share the zip; teammates unzip it and **Load unpacked**
(see `INSTALL.md`). Bump `version` in `manifest.json` for each release. For one-click
installs later, the same zip can be uploaded to the Chrome Web Store as an **unlisted**
item, or hosted internally as a `.crx` with an update manifest for policy force-install.

The dev-only Vite plugin that feeds server logs / SSR calls lives in your monorepo
(`vite-plugin-rr-inspector`), already wired into each app's `vite.config`.

## Background

See `SPIKE.md` for the original feasibility findings and the architecture decision
(network decode vs. live router bridge vs. server bridge).
