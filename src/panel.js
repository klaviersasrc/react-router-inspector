// Panel logic: capture React Router data traffic from the DevTools network feed,
// merge in live router state from the optional page bridge, and render it.
(function () {
  const listEl = document.getElementById("list");
  const filterEl = document.getElementById("filter");
  const preserveEl = document.getElementById("preserve");
  const modeEl = document.getElementById("mode");
  const panes = {
    loader: document.querySelector('[data-pane="loader"]'),
    payload: document.querySelector('[data-pane="payload"]'),
    headers: document.querySelector('[data-pane="headers"]'),
    response: document.querySelector('[data-pane="response"]'),
    raw: document.querySelector('[data-pane="raw"]'),
    console: document.querySelector('[data-pane="console"]'),
  };

  /** @type {Array<Event>} */
  const events = [];
  const consoleLogs = [];
  const seenServer = new Set(); // dedup SSE-replayed server events across reconnects
  const hiddenSources = new Set(); // console filter chips: hidden sources
  const hiddenLevels = new Set(); // console filter chips: hidden levels
  const LEVEL_ORDER = ["error", "warn", "info", "debug", "log", "trace", "dir", "dirxml", "table", "group", "groupCollapsed", "assert", "count"];
  let selected = null;
  let sawBridge = false;

  // ---- React Router request heuristics ---------------------------------------
  // Framework mode (single fetch): GET/POST to a URL whose pathname ends in ".data",
  // often with a ?_routes= param. Older Remix used ?_data=.
  function isRRDataRequest(req) {
    try {
      const u = new URL(req.request.url);
      if (u.pathname.endsWith(".data")) return true;
      if (u.searchParams.has("_routes")) return true;
      if (u.searchParams.has("_data")) return true;
      return false;
    } catch {
      return false;
    }
  }

  function routeLabel(url) {
    try {
      const u = new URL(url);
      let p = u.pathname.replace(/\.data$/, "") || "/";
      const routes = u.searchParams.get("_routes");
      return routes ? `${p}  ·  ${routes}` : p;
    } catch {
      return url;
    }
  }

  // ---- Ingest from DevTools network ------------------------------------------
  // Capture RR .data requests AND the app's own API calls (xhr/fetch) — GraphQL
  // and REST — so each underlying call is inspectable like the Network tab:
  // method, URL, request/response headers, payload, decoded response.
  chrome.devtools.network.onRequestFinished.addListener((req) => {
    const rtype = (req._resourceType || "").toLowerCase();
    const isData = isRRDataRequest(req);
    // Keep RR data + real API calls; drop documents, scripts, css, images, fonts,
    // SSE/eventsource (e.g. the NotificationsProvider stream), websockets, media.
    if (!isData && rtype !== "xhr" && rtype !== "fetch") return;

    const url = req.request.url;
    const method = req.request.method;
    const status = req.response.status;
    const payload = extractPayload(req);
    const kind = isData ? "data" : (isGraphql(url, payload) ? "graphql" : "api");
    const ev = {
      id: cryptoId(),
      source: "network",
      kind,
      time: req.startedDateTime,
      method,
      status,
      url,
      route: buildLabel(kind, url, payload),
      reqHeaders: harHeaders(req.request.headers),
      resHeaders: harHeaders(req.response.headers),
      payload,
      response: { raw: null, decoded: null, mime: (req.response.content && req.response.content.mimeType) || "" },
      error: status >= 400,
    };
    events.push(ev);
    renderList();
    // Response body arrives async; JSON or turbo-stream decoded lazily.
    req.getContent(async (body, encoding) => {
      const text = encoding === "base64" ? safeAtob(body) : body;
      ev.response.raw = text;
      ev.response.decoded = await tryDecode(text);
      renderList();
      if (selected === ev.id) renderDetail(ev);
    });
  });

  function harHeaders(arr) {
    const o = {};
    if (Array.isArray(arr)) for (const h of arr) o[h.name] = h.value;
    return Object.keys(o).length ? o : null;
  }

  function isGraphql(url, payload) {
    if (/graphql/i.test(url)) return true;
    const b = payload && payload.body;
    return !!(b && typeof b === "object" && typeof b.query === "string" && /\b(query|mutation|subscription)\b/.test(b.query));
  }

  function buildLabel(kind, url, payload) {
    if (kind === "data") return routeLabel(url);
    let path = url;
    try { const u = new URL(url); path = u.pathname; } catch {}
    if (kind === "graphql") {
      const b = payload && payload.body;
      const op =
        (b && b.operationName) ||
        (b && typeof b.query === "string" && (b.query.match(/\b(?:query|mutation|subscription)\s+(\w+)/) || [])[1]) ||
        "anonymous";
      return `GraphQL · ${op}`;
    }
    return path;
  }

  function extractPayload(req) {
    // Query params carry loader/GET inputs; POST body carries action/mutation inputs.
    let query = {};
    try {
      new URL(req.request.url).searchParams.forEach((v, k) => {
        if (k === "_routes") return;
        query[k] = v;
      });
    } catch {}
    let body = null;
    const pd = req.request.postData;
    if (pd && pd.text) {
      if ((pd.mimeType || "").includes("application/x-www-form-urlencoded")) {
        body = {};
        new URLSearchParams(pd.text).forEach((v, k) => (body[k] = v));
      } else {
        body = tryJson(pd.text) ?? pd.text;
      }
    }
    return { query: Object.keys(query).length ? query : null, body };
  }

  // ---- Ingest from page bridge (optional, richest data) ----------------------
  let port = null;
  const onPortMessage = async (msg) => {
    if (msg.type === "bridge-hello") {
      sawBridge = true;
      setMode("bridge");
      return;
    }
    // Captured console.* call (incl. SSR/loader logs surfaced during hydration).
    if (msg.type === "console") {
      sawBridge = true;
      if (msg.source === "server") {
        // Many server HTTP clients also print their own "HTTP Request/Response"
        // text dumps, which the structured "ssr" network rows supersede — drop
        // those to de-noise the Console (generic pattern, not any one logger).
        if (/\bHTTP (Request|Response)\b\s*:/i.test(msg.text || "")) return;
        const key = "c|" + msg.time + "|" + msg.text;
        if (seenServer.has(key)) return;
        seenServer.add(key);
      }
      consoleLogs.push(msg);
      updateConsoleCount();
      if (consoleTabActive()) renderConsole();
      return;
    }
    // Structured SSR fetch (server-side upstream call) -> a network row.
    if (msg.type === "net") {
      sawBridge = true;
      const nkey = "n|" + msg.time + "|" + msg.method + "|" + msg.url + "|" + msg.status;
      if (seenServer.has(nkey)) return;
      seenServer.add(nkey);
      let query = null;
      try {
        const qp = new URL(msg.url, location.href).searchParams;
        query = {};
        qp.forEach((v, k) => (query[k] = v));
        if (!Object.keys(query).length) query = null;
      } catch {}
      let path = msg.url;
      try { path = new URL(msg.url, location.href).pathname; } catch {}
      const ev = {
        id: cryptoId(),
        source: "server",
        kind: "ssr",
        time: msg.time,
        method: msg.method || "GET",
        status: msg.status || 0,
        url: msg.url,
        route: `${path}${msg.durationMs != null ? "  ·  " + msg.durationMs + "ms" : ""}`,
        reqHeaders: msg.reqHeaders || null,
        resHeaders: msg.resHeaders || null,
        payload: { query, body: msg.reqBody != null ? (tryJson(msg.reqBody) ?? msg.reqBody) : null },
        response: {
          raw: msg.resBody != null ? msg.resBody : (msg.error || null),
          decoded: msg.resBody != null ? (tryJson(msg.resBody) ?? msg.resBody) : (msg.error ? { error: msg.error } : null),
          mime: "SSR fetch",
        },
        error: msg.ok === false || (msg.status || 0) >= 400 || !!msg.error,
      };
      events.push(ev);
      renderList();
      if (selected === ev.id) renderDetail(ev);
      return;
    }
    // Live router snapshots: initial load and each settled navigation/action,
    // read straight from window.__reactRouterDataRouter.state (already decoded).
    if (msg.type === "rr-initial" || msg.type === "rr-nav") {
      sawBridge = true;
      setMode("bridge");
      const initial = msg.type === "rr-initial";
      const method = msg.formMethod || "GET";
      let query = null;
      try {
        const qp = new URL(msg.location, location.href).searchParams;
        query = {};
        qp.forEach((v, k) => (k === "_routes" ? null : (query[k] = v)));
        if (!Object.keys(query).length) query = null;
      } catch {}
      const routeIds = (msg.matches && msg.matches.length) ? msg.matches[msg.matches.length - 1] : "";
      const ev = {
        id: cryptoId(),
        source: "bridge",
        initial,
        time: msg.time,
        method,
        status: msg.errors ? 500 : 200,
        url: msg.location || "(initial load)",
        route: `${(msg.location || "/").split("?")[0]}  ·  ${initial ? "initial load" : "navigation"}${routeIds ? " · " + routeIds : ""}`,
        payload: { query, body: msg.actionData ? "(see Response/actionData)" : null },
        response: { raw: null, decoded: pickResponse(msg), mime: "live router state" },
        loaderData: msg.loaderData,
        actionData: msg.actionData,
        error: !!msg.errors,
      };
      if (initial) events.unshift(ev); else events.push(ev);
      renderList();
      if (selected === ev.id) renderDetail(ev);
      return;
    }
    // A .data fetch captured in-page (carries the raw turbo-stream text to decode).
    if (msg.type === "rr-fetch") {
      sawBridge = true;
      const ev = {
        id: cryptoId(),
        source: "bridge",
        time: msg.time,
        method: msg.method || "GET",
        status: msg.status || 0,
        url: msg.url,
        route: routeLabel(msg.url),
        payload: extractPayloadFromParts(msg.url, msg.method, msg.requestBody),
        response: { raw: msg.rawResponse || null, decoded: null, mime: "turbo-stream (in-page)" },
        error: (msg.status || 0) >= 400,
      };
      ev.response.decoded = await tryDecode(msg.rawResponse);
      events.push(ev);
      renderList();
      if (selected === ev.id) renderDetail(ev);
      return;
    }
  };

  // Keep a live connection to the (MV3, ephemeral) service worker: reconnect if it
  // gets recycled, and ping it so it isn't killed after ~30s idle — which would
  // otherwise silently stop the page→panel relay after working for a while.
  function connectPort() {
    port = chrome.runtime.connect({ name: "rr-panel" });
    port.postMessage({ type: "init", tabId: chrome.devtools.inspectedWindow.tabId });
    port.onMessage.addListener(onPortMessage);
    port.onDisconnect.addListener(() => { port = null; setTimeout(connectPort, 500); });
  }
  connectPort();
  setInterval(() => { try { if (port) port.postMessage({ type: "keepalive" }); } catch {} }, 20000);

  function pickResponse(msg) {
    // The "response" of a data request is the loader data (+ action data / errors).
    const out = {};
    if (msg.loaderData != null) out.loaderData = msg.loaderData;
    if (msg.actionData != null) out.actionData = msg.actionData;
    if (msg.errors != null) out.errors = msg.errors;
    return Object.keys(out).length ? out : null;
  }

  function extractPayloadFromParts(url, method, bodyText) {
    let query = {};
    try {
      new URL(url, location.href).searchParams.forEach((v, k) => {
        if (k === "_routes") return;
        query[k] = v;
      });
    } catch {}
    let body = null;
    if (bodyText) {
      body = tryJson(bodyText);
      if (body === undefined) {
        body = {};
        try { new URLSearchParams(bodyText).forEach((v, k) => (body[k] = v)); } catch { body = bodyText; }
      }
    }
    return { query: Object.keys(query).length ? query : null, body };
  }

  function setMode(kind) {
    modeEl.className = "badge " + kind;
    modeEl.textContent = kind === "bridge" ? "live router bridge" : "network decode";
  }
  // Default to network mode until/unless a bridge announces itself.
  setMode("network");

  // ---- Rendering -------------------------------------------------------------
  function renderList() {
    const f = filterEl.value.trim().toLowerCase();
    listEl.textContent = "";
    for (const ev of events) {
      if (f && !(ev.route + " " + ev.url).toLowerCase().includes(f)) continue;
      const li = document.createElement("li");
      li.dataset.id = ev.id;
      if (ev.error) li.classList.add("err");
      if (selected === ev.id) li.classList.add("sel");
      const kind = ev.kind || (ev.source === "bridge" ? "router" : "api");
      const tag = document.createElement("span");
      tag.className = "tag tag-" + kind;
      tag.textContent = kind === "graphql" ? "gql" : kind;
      const m = document.createElement("span");
      m.className = "method " + (ev.method === "GET" ? "get" : "post");
      m.textContent = ev.method;
      const r = document.createElement("span");
      r.className = "route";
      r.textContent = ev.route;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${ev.status || ""}${ev.source === "bridge" ? " ·bridge" : ""}`;
      li.append(tag, m, r, meta);
      li.addEventListener("click", () => {
        selected = ev.id;
        renderList();
        renderDetail(ev);
      });
      listEl.appendChild(li);
    }
  }

  function jsonInto(pane, value, emptyMsg) {
    pane.textContent = "";
    if (value === null || value === undefined) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = emptyMsg;
      pane.appendChild(e);
      return;
    }
    // A raw string (non-JSON or truncated body) — show it as plain wrapped text,
    // not through the tree (which would JSON-escape every quote into a \" mess).
    if (typeof value === "string") {
      const pre = document.createElement("pre");
      pre.className = "jt";
      pre.textContent = value;
      pane.appendChild(pre);
      return;
    }
    pane.appendChild(window.renderJsonTree(value));
  }

  function buildPayloadView(ev) {
    // Lead with the full request line so the URL + params are always visible.
    const out = {};
    if (ev.url) out.url = ev.url;
    if (ev.method) out.method = ev.method;
    if (ev.payload && ev.payload.query) out.query = ev.payload.query;
    if (ev.payload && ev.payload.body != null) out.body = ev.payload.body;
    return Object.keys(out).length ? out : null;
  }

  function renderDetail(ev) {
    const isApiCall = ev.kind === "api" || ev.kind === "graphql" || ev.kind === "ssr";
    // "Loader Data" only applies to RR loader/router events; API calls have none.
    jsonInto(
      panes.loader,
      isApiCall ? null : (ev.loaderData ?? ev.response.decoded),
      isApiCall ? "API call — no loader data. See the Response tab." : "No decoded loader data. See Raw tab."
    );
    jsonInto(panes.payload, buildPayloadView(ev), "No payload (no URL, query params, or request body).");
    jsonInto(
      panes.headers,
      (ev.reqHeaders || ev.resHeaders) ? { request: ev.reqHeaders, response: ev.resHeaders } : null,
      "No headers captured (bridge/router event — open the same call under a network row for headers)."
    );
    jsonInto(panes.response, ev.response.decoded, ev.response.raw ? "Could not decode; see Raw." : "Waiting for response body…");
    const raw = panes.raw;
    raw.textContent = "";
    const pre = document.createElement("pre");
    pre.className = "jt";
    pre.textContent = ev.response.raw ?? "(no raw body — router event; data read from live state)";
    raw.appendChild(pre);
  }

  // ---- console view ----------------------------------------------------------
  function consoleTabActive() {
    const b = document.querySelector('#tabs button[data-tab="console"]');
    return b && b.classList.contains("active");
  }
  function updateConsoleCount() {
    const el = document.getElementById("consoleCount");
    if (el) el.textContent = consoleLogs.length ? String(consoleLogs.length) : "";
  }
  function chip(label, key, hiddenSet, count) {
    const b = document.createElement("button");
    b.className = "chip" + (hiddenSet.has(key) ? " off" : "");
    b.textContent = count != null ? `${label} ${count}` : label;
    b.addEventListener("click", () => {
      if (hiddenSet.has(key)) hiddenSet.delete(key);
      else hiddenSet.add(key);
      renderConsole();
    });
    return b;
  }
  function renderConsole() {
    const pane = panes.console;
    const f = filterEl.value.trim().toLowerCase();
    pane.textContent = "";

    // Filter chips: sources (only if >1) + levels, each toggleable.
    const srcCounts = {};
    const lvlCounts = {};
    for (const l of consoleLogs) {
      const s = l.source || "browser";
      srcCounts[s] = (srcCounts[s] || 0) + 1;
      lvlCounts[l.level] = (lvlCounts[l.level] || 0) + 1;
    }
    const sources = Object.keys(srcCounts);
    if (consoleLogs.length) {
      const bar = document.createElement("div");
      bar.className = "log-filters";
      if (sources.length > 1) {
        for (const s of sources) bar.appendChild(chip(s, s, hiddenSources, srcCounts[s]));
        const sep = document.createElement("span");
        sep.className = "log-filters-sep";
        bar.appendChild(sep);
      }
      for (const lv of LEVEL_ORDER) {
        if (lvlCounts[lv]) bar.appendChild(chip(lv, lv, hiddenLevels, lvlCounts[lv]));
      }
      pane.appendChild(bar);
    }

    const rows = consoleLogs.filter(
      (l) =>
        !hiddenSources.has(l.source || "browser") &&
        !hiddenLevels.has(l.level) &&
        (!f || (l.level + " " + l.text + " " + (l.location || "")).toLowerCase().includes(f))
    );
    if (!rows.length) {
      const e = document.createElement("div");
      e.className = "empty";
      const off = document.getElementById("captureConsole") && !document.getElementById("captureConsole").checked;
      e.textContent = consoleLogs.length
        ? "No console messages match the filter."
        : off
          ? "Console capture is OFF. Enable “Logs” in the toolbar, then reload the page to capture (incl. SSR/hydration logs)."
          : "No console messages captured yet — they stream in as the app logs (including SSR/loader logs during hydration).";
      pane.appendChild(e);
      return;
    }
    for (const l of rows) {
      const row = document.createElement("div");
      row.className = "log log-" + l.level + (l.source === "server" ? " log-server" : "");
      if (l.source === "server") {
        const src = document.createElement("span");
        src.className = "log-src";
        src.textContent = "server";
        row.appendChild(src);
      }
      const lvl = document.createElement("span");
      lvl.className = "log-lvl";
      lvl.textContent = l.level;
      const loc = document.createElement("span");
      loc.className = "log-loc";
      loc.textContent = (l.location || "").split("?")[0];
      const msg = document.createElement("span");
      msg.className = "log-msg";
      const text = typeof l.text === "string" ? l.text : String(l.text ?? "");
      const nl = text.indexOf("\n");
      if (nl >= 0) {
        // Multi-line entry (a logged object) -> collapsible: summary + indented body.
        const tw = document.createElement("span");
        tw.className = "tw log-tw";
        tw.textContent = "▸";
        msg.textContent = text.slice(0, nl);
        msg.style.cursor = "pointer";
        const body = document.createElement("pre");
        body.className = "log-body";
        body.textContent = text.slice(nl + 1);
        const toggle = () => {
          const open = body.style.display === "none";
          body.style.display = open ? "block" : "none";
          tw.textContent = open ? "▾" : "▸";
        };
        body.style.display = "none";
        tw.addEventListener("click", toggle);
        msg.addEventListener("click", toggle);
        row.append(lvl, loc, tw, msg, body);
      } else {
        msg.textContent = text;
        row.append(lvl, loc, msg);
      }
      const objArgs = (l.args || []).filter((a) => a && typeof a === "object");
      if (objArgs.length) {
        const tree = window.renderJsonTree(objArgs.length === 1 ? objArgs[0] : objArgs);
        tree.classList.add("log-tree");
        row.appendChild(tree);
      }
      pane.appendChild(row);
    }
    pane.scrollTop = pane.scrollHeight;
  }

  // ---- tabs ------------------------------------------------------------------
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === btn.dataset.tab));
    if (btn.dataset.tab === "console") renderConsole();
  });

  document.getElementById("clear").addEventListener("click", () => {
    events.length = 0;
    consoleLogs.length = 0;
    selected = null;
    renderList();
    updateConsoleCount();
    Object.values(panes).forEach((p) => (p.textContent = ""));
  });
  filterEl.addEventListener("input", () => {
    renderList();
    if (consoleTabActive()) renderConsole();
  });

  // Console-capture toggle (panel -> page bridge). Persisted so it sticks.
  const captureConsoleEl = document.getElementById("captureConsole");
  try {
    const pref = localStorage.getItem("rrInspector.captureConsole.ui");
    if (pref !== null) captureConsoleEl.checked = pref !== "0";
  } catch {}
  captureConsoleEl.addEventListener("change", () => {
    const on = captureConsoleEl.checked;
    try { localStorage.setItem("rrInspector.captureConsole.ui", on ? "1" : "0"); } catch {}
    if (port) port.postMessage({ type: "to-page", payload: { action: "setConsoleCapture", on } });
    if (consoleTabActive()) renderConsole();
  });

  chrome.devtools.network.onNavigated.addListener(() => {
    if (!preserveEl.checked) {
      events.length = 0;
      selected = null;
      renderList();
    }
  });

  // ---- server-setup overlay --------------------------------------------------
  (function initSetup() {
    const overlay = document.getElementById("setup");
    const codeEl = document.getElementById("pluginCode");
    const copyOk = document.getElementById("copyOk");
    const PLUGIN_URL = "server-bridge/vite-plugin-rr-inspector.mjs";
    let code = null;

    async function loadCode() {
      if (code != null) return code;
      try {
        code = await (await fetch(PLUGIN_URL)).text();
      } catch {
        code = "// Could not load the bundled plugin.\n// Find it in this extension's server-bridge/ folder.";
      }
      codeEl.textContent = code;
      return code;
    }
    const open = () => { overlay.hidden = false; loadCode(); };
    const close = () => { overlay.hidden = true; };

    document.getElementById("setupBtn").addEventListener("click", open);
    document.getElementById("setupClose").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });

    document.getElementById("pluginCopy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(await loadCode());
        copyOk.hidden = false;
        setTimeout(() => (copyOk.hidden = true), 1500);
      } catch { /* clipboard unavailable */ }
    });
    document.getElementById("pluginDownload").addEventListener("click", async () => {
      const blob = new Blob([await loadCode()], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vite-plugin-rr-inspector.mjs";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  })();

  // ---- resizable split -------------------------------------------------------
  (function initResizer() {
    const split = document.getElementById("split");
    const resizer = document.getElementById("resizer");
    const KEY = "rrInspector.listWidth";
    const saved = Number(localStorage.getItem(KEY));
    if (saved > 120) listEl.style.flex = `0 0 ${saved}px`;
    let dragging = false;
    resizer.addEventListener("mousedown", (e) => {
      dragging = true;
      resizer.classList.add("dragging");
      document.body.classList.add("col-resizing");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const rect = split.getBoundingClientRect();
      const w = Math.max(120, Math.min(e.clientX - rect.left, rect.width - 200));
      listEl.style.flex = `0 0 ${w}px`;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("dragging");
      document.body.classList.remove("col-resizing");
      localStorage.setItem(KEY, String(Math.round(listEl.getBoundingClientRect().width)));
    });
    resizer.addEventListener("dblclick", () => {
      listEl.style.flex = "0 0 42%";
      localStorage.removeItem(KEY);
    });
  })();

  // ---- helpers ---------------------------------------------------------------
  async function tryDecode(text) {
    if (!text) return null;
    // 1) plain JSON (older Remix _data, or JSON resource routes)
    const j = tryJson(text);
    if (j !== undefined) return j;
    // 2) turbo-stream (RR v7 single fetch)
    if (window.decodeTurboStream) {
      try {
        return await window.decodeTurboStream(text);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  function tryJson(t) {
    try { return JSON.parse(t); } catch { return undefined; }
  }
  function safeAtob(b) {
    try {
      const bin = atob(b);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch { return b; }
  }
  function cryptoId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
})();
