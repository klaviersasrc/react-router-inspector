// MAIN-world page bridge. This app exposes the live data router as
// window.__reactRouterDataRouter, so we subscribe to it directly — clean
// loaderData/actionData per route, no turbo-stream decoding needed. We also
// patch fetch() to capture the raw .data request payload + response body.
// All findings are posted to the ISOLATED content script via window.postMessage.
(function () {
  function post(payload) {
    try { window.postMessage({ __rrInspector: true, payload }, "*"); } catch (e) { /* clone error */ }
  }
  function now() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  // Make loader/action data structured-clone-safe (drop fns/promises, keep Date/Map/Set).
  function sanitize(v, seen) {
    if (v === null || typeof v !== "object") {
      if (typeof v === "function") return "[fn]";
      return v; // primitives incl. bigint are cloneable
    }
    if (v instanceof Date || v instanceof RegExp) return v;
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    if (typeof v.then === "function") return "[Promise pending]";
    if (v instanceof Map) { const m = new Map(); for (const [k, val] of v) m.set(k, sanitize(val, seen)); return m; }
    if (v instanceof Set) { const s = new Set(); for (const val of v) s.add(sanitize(val, seen)); return s; }
    if (Array.isArray(v)) return v.map((x) => sanitize(x, seen));
    const o = {};
    for (const k of Object.keys(v)) o[k] = sanitize(v[k], seen);
    return o;
  }

  post({ type: "bridge-hello" });

  // ---- 1. Subscribe to the live data router --------------------------------
  // A data router is any object with .subscribe() and .state.loaderData. We probe
  // known globals first, then auto-discover by scanning window — so it works on
  // ANY React Router app regardless of how the global is named.
  function looksLikeRouter(v) {
    return (
      v && typeof v === "object" &&
      typeof v.subscribe === "function" &&
      v.state && typeof v.state === "object" && "loaderData" in v.state
    );
  }
  function getRouter() {
    const known = [
      window.__reactRouterDataRouter,
      window.__reactRouterContext && window.__reactRouterContext.router,
      window.__remixRouter,
      window.__remixContext && window.__remixContext.router,
    ];
    for (const c of known) if (looksLikeRouter(c)) return c;
    // Auto-discover: scan window for a data-router-like object under any name.
    try {
      for (const k of Object.getOwnPropertyNames(window)) {
        if (!/router|remix|hydrat|loader|__RR|dataRouter/i.test(k)) continue;
        let v;
        try { v = window[k]; } catch { continue; }
        if (looksLikeRouter(v)) return v;
        if (v && typeof v === "object" && looksLikeRouter(v.router)) return v.router;
      }
    } catch {}
    return null;
  }

  // SPA / data-mode fallback: no live router on window, but SSR hydration data is.
  let postedStatic = false;
  function tryStaticHydration() {
    if (postedStatic) return false;
    const h = window.__staticRouterHydrationData;
    if (!h || !h.loaderData) return false;
    postedStatic = true;
    post({
      type: "rr-initial",
      time: now(),
      location: location.pathname + location.search,
      matches: [],
      loaderData: sanitize(h.loaderData, new WeakSet()),
      actionData: sanitize(h.actionData ?? null, new WeakSet()),
      errors: sanitize(h.errors ?? null, new WeakSet()),
      formMethod: null,
    });
    return true;
  }

  function snapshot(state, kind) {
    return {
      type: kind, // "rr-initial" | "rr-nav"
      time: now(),
      location: state.location
        ? state.location.pathname + state.location.search
        : location.pathname + location.search,
      matches: (state.matches || []).map((m) => m.route && m.route.id).filter(Boolean),
      loaderData: sanitize(state.loaderData ?? null, new WeakSet()),
      actionData: sanitize(state.actionData ?? null, new WeakSet()),
      errors: sanitize(state.errors ?? null, new WeakSet()),
      formMethod: (state.navigation && state.navigation.formMethod) || null,
    };
  }

  let subscribed = false;
  let lastKey = "";
  function trySubscribe() {
    if (subscribed) return true;
    const r = getRouter();
    if (!r || !r.state || typeof r.subscribe !== "function") return false;
    subscribed = true;

    post(snapshot(r.state, "rr-initial"));
    lastKey = (r.state.location && r.state.location.key) || "";

    r.subscribe((state) => {
      // Only emit settled states (navigation finished), once per navigation/action.
      if (state.navigation && state.navigation.state !== "idle") return;
      const key = (state.location && state.location.key) || "";
      if (key === lastKey && !state.actionData) return;
      lastKey = key;
      post(snapshot(state, "rr-nav"));
    });
    return true;
  }

  if (!trySubscribe()) {
    tryStaticHydration(); // show initial data even before the router is ready
    let tries = 0;
    const iv = setInterval(() => {
      if (trySubscribe() || ++tries > 60) clearInterval(iv);
      else tryStaticHydration();
    }, 100);
  }

  // ---- 2. fetch() capture for raw .data payload + response ------------------
  function isData(url) {
    return /\.data(\?|$)/.test(url) || /[?&]_routes=/.test(url) || /[?&]_data=/.test(url);
  }
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      let url = "";
      try { url = typeof input === "string" ? input : input.url; } catch {}
      if (!isData(url)) return origFetch.apply(this, arguments);

      const method = (init && init.method) || (input && input.method) || "GET";
      let requestBody = null;
      try {
        const b = init && init.body;
        if (typeof b === "string") requestBody = b;
        else if (b instanceof URLSearchParams) requestBody = b.toString();
        else if (b instanceof FormData) {
          const o = {};
          b.forEach((v, k) => (o[k] = typeof v === "string" ? v : "[file]"));
          requestBody = JSON.stringify(o);
        }
      } catch {}

      return origFetch.apply(this, arguments).then((res) => {
        res.clone().text().then((text) => {
          post({ type: "rr-fetch", time: now(), url, method, status: res.status, requestBody, rawResponse: text });
        }).catch(() => {});
        return res;
      });
    };
  }

  // ---- 3. console capture (ON by default; toggle off from the panel) --------
  // Wrapping console.* inserts our frame into stack traces and reattributes the
  // console's source links to this file, so the panel offers a checkbox to turn
  // it OFF for pristine debugging. The preference is persisted in page
  // localStorage and read synchronously here, so it wraps early enough to catch
  // SSR/hydration logs on load.
  (function consoleCapture() {
    const KEY = "rrInspector.captureConsole";
    const levels = ["log", "info", "warn", "error", "debug", "trace", "dir", "dirxml", "table", "group", "groupCollapsed", "assert", "count"];
    const originals = {};
    let wrapped = false;

    function replacer(k, v) {
      if (typeof v === "function") return "[fn]";
      if (typeof v === "bigint") return String(v) + "n";
      return v;
    }
    function fmt(a) {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || (a.name + ": " + a.message);
      try { return JSON.stringify(a, replacer); } catch { return String(a); }
    }
    function jsonSafe(a) {
      const t = typeof a;
      if (a === null || t === "string" || t === "number" || t === "boolean") return a;
      if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack };
      try { return JSON.parse(JSON.stringify(a, replacer)); } catch { return String(a); }
    }
    function wrap() {
      if (wrapped) return;
      wrapped = true;
      for (const level of levels) {
        const orig = console[level];
        if (typeof orig !== "function") continue;
        originals[level] = orig;
        console[level] = function (...args) {
          try {
            post({
              type: "console",
              level,
              time: now(),
              location: location.pathname + location.search,
              text: args.map(fmt).join(" "),
              args: args.slice(0, 8).map(jsonSafe),
            });
          } catch {}
          return orig.apply(this, args);
        };
      }
    }
    function unwrap() {
      if (!wrapped) return;
      wrapped = false;
      for (const level of levels) if (originals[level]) console[level] = originals[level];
    }

    let enabled = true; // default on; only an explicit "0" disables
    try { enabled = localStorage.getItem(KEY) !== "0"; } catch {}
    if (enabled) wrap();

    // Live control from the panel (panel -> background -> content -> here).
    window.addEventListener("message", (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.__rrInspectorControl !== true) return;
      const p = d.payload || {};
      if (p.action === "setConsoleCapture") {
        try { localStorage.setItem(KEY, p.on ? "1" : "0"); } catch {}
        if (p.on) wrap(); else unwrap();
      }
    });
  })();

  // ---- 4. server-log stream (from a local or deployed bridge, if enabled) ----
  // Opens the bridge's same-origin SSE stream and forwards each server event to
  // the panel. The endpoint lives under the app base (e.g. /app/…) so the gateway
  // routes it — but the router (whence we read the basename) isn't ready at
  // document_start, so we retry, re-deriving the base each attempt, until the
  // stream opens. Gives up quietly if no bridge is enabled.
  (function serverLogStream() {
    let es = null;
    let everConnected = false;
    let failStreak = 0;
    let lastStatus = "";

    function report(status, url) {
      const key = `${status}|${url}`;
      if (key === lastStatus) return;
      lastStatus = key;
      post({ type: "server-stream-status", status, url });
    }

    function basePath() {
      const r = getRouter();
      let b =
        (r && r.basename) ||
        (window.__reactRouterContext && window.__reactRouterContext.basename) ||
        "";
      if (!b) {
        // Fallback: first path segment — apps often mount under a base path like /app/.
        const m = location.pathname.match(/^\/[^/]+\//);
        if (m) b = m[0];
      }
      if (b && !b.endsWith("/")) b += "/";
      return b || "/";
    }
    function endpoint() {
      const bp = basePath();
      const prefix = bp === "/" ? "" : bp.replace(/\/$/, "");
      return prefix + "/__rr-inspector/logs";
    }
    function open() {
      if (es && es.readyState !== 2 /* CLOSED */) return; // already (re)connecting/open
      let url;
      try { url = endpoint(); } catch { url = "/__rr-inspector/logs"; }
      report(everConnected ? "reconnecting" : "connecting", url);
      try { es = new EventSource(url); } catch { return; }
      es.onopen = () => {
        everConnected = true;
        failStreak = 0;
        report("connected", url);
      };
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          d.location = location.pathname + location.search;
          post(d); // { type:"console"|"net", source:"server", ... }
        } catch {}
      };
      es.onerror = () => {
        // Dropped (server restart), wrong base, or bridge unavailable: close and let
        // the retry loop re-open with a freshly-derived base.
        try { es.close(); } catch {}
        es = null;
        failStreak++;
        report(everConnected ? "reconnecting" : "unavailable", url);
      };
    }

    open();
    // Persistent reconnect: re-open whenever the stream is down, so it survives a
    // server restart. Back off only if it never connected (bridge unavailable).
    setInterval(() => {
      if (es) return;
      if (!everConnected && failStreak >= 8) return;
      open();
    }, 1500);
  })();
})();
