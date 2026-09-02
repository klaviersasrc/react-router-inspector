# React Router Inspector — Privacy Policy

_Effective date: 2 September 2026_

React Router Inspector is a Chrome DevTools extension for developers. The short
version: **it does not collect, store, transmit, or sell any data.** Everything it
does happens locally in your browser.

## What the extension accesses, and why

To render its DevTools panel, the extension reads — locally, and only while
DevTools is open on a page you are inspecting:

- React Router state (loader/action data) from that page;
- the network requests and responses of the inspected tab (via Chrome's built-in
  DevTools APIs);
- the inspected page's console output.

This information is shown to you in the DevTools panel and is used for no other
purpose.

## What it does not do

- It does **not** send any data to the developer or to any third party.
- It has **no** analytics, tracking, or advertising.
- It does **not** sell or share data.
- It contains **no remote code** — all logic ships inside the extension.

## Local storage

The extension saves a few interface preferences (for example, the panel layout and
whether console capture is enabled) in your browser's local storage. These never
leave your machine.

## Host access

The extension's content scripts run automatically only on local development hosts
(`localhost`, `127.0.0.1`, `*.localhost`). For any other HTTP(S) site, the user must
explicitly click **Enable this site** in the DevTools panel and approve access to
that exact origin. The extension reads page state to display it and never modifies
the pages you visit.

## The optional developer plugin

The optional server bridge streams request-scoped server events and server-side
`fetch` calls to the panel over a same-origin connection. Local development uses
the Vite bridge; deployed environments may expose the same stream behind their
existing authenticated application session. That data is displayed in the panel
and is never sent anywhere else.

## Changes

If this policy changes, the updated version will accompany the extension's next
release.

## Contact

For privacy questions, contact the developer through the extension's Chrome Web
Store listing.
