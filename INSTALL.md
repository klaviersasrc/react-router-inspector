# React Router Inspector — install

A Chrome DevTools panel for inspecting React Router data flow in React Router v7 (framework mode) apps:
loader/action data, per-call network (incl. SSR fetches), and server + browser
console logs — all in one tab.

## Install (one time, ~30 seconds)

1. Unzip this folder somewhere permanent (don't delete it — Chrome loads it from here).
2. Open **chrome://extensions**
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this unzipped folder (the one with `manifest.json`).
5. Done. Open any React Router app, open **DevTools** (⌥⌘I), and pick the **React Router** tab.
   - The tab only registers when DevTools *opens*, so if it's missing, close and reopen DevTools.

## Using it

- **Left list** — every event: router loads (`router`), `.data` requests (`data`),
  GraphQL/REST calls (`gql`/`api`), and server-side SSR fetches (`ssr`).
- **Tabs** — Loader Data · Payload (URL + params) · Headers · Response · Raw.
- **Console** — browser + server logs, grouped & collapsible, with source/level filter chips.
- Drag the divider to resize; **Preserve** keeps events across navigations; **Logs**
  toggles console capture.

## Server-side logs & SSR calls (optional)

To also see your **server** logs and **SSR** fetches, add the bundled dev-only Vite
plugin: click **⚙ Server setup** in the panel → **Download** or **Copy** the plugin →
add it to your `vite.config` (before `reactRouter()`), then restart the dev server.
The `server`-tagged logs and `ssr` rows then appear automatically. Full steps are in
the Setup dialog.

## Updating

When a new version is shared, replace this folder's contents and click the **↻ reload**
icon on the extension's card in `chrome://extensions`.
