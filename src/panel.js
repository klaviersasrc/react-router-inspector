// Panel logic: capture React Router data traffic from the DevTools network feed,
// merge in live router state from the optional page bridge, and render it.
(function () {
  const listEl = document.getElementById("list");
  const filterEl = document.getElementById("filter");
  const preserveEl = document.getElementById("preserve");
  const modeEl = document.getElementById("mode");
  const siteAccessEl = document.getElementById("siteAccess");
  const serverStatusEl = document.getElementById("serverStatus");
  const serverDiagnosticEl = document.getElementById("serverDiagnostic");
  const panes = {
    loader: document.querySelector('[data-pane="loader"]'),
    routes: document.querySelector('[data-pane="routes"]'),
    payload: document.querySelector('[data-pane="payload"]'),
    headers: document.querySelector('[data-pane="headers"]'),
    response: document.querySelector('[data-pane="response"]'),
    raw: document.querySelector('[data-pane="raw"]'),
    console: document.getElementById("consoleBody"),
  };

  /** @type {Array<Event>} */
  const events = [];
  const consoleLogs = [];
  const seenServer = new Set(); // dedup SSE-replayed server events across reconnects
  const hiddenSources = new Set(prefJson("hiddenSources", [])); // console filter chips: hidden sources (persisted)
  const hiddenLevels = new Set(prefJson("hiddenLevels", [])); // console filter chips: hidden levels (persisted)
  const hiddenKinds = new Set(prefJson("hiddenKinds", [])); // list filter chips: hidden call types (persisted)
  const LEVEL_ORDER = ["error", "warn", "info", "debug", "log", "trace", "dir", "dirxml", "table", "group", "groupCollapsed", "assert", "count"];
  let selected = null;
  let sawBridge = false;
  let lastNavStart = null; // time of the most recent rr-nav-start, stamped onto the next completed nav
  let siteAccessAction = null;
  let rawPretty = prefGet("rawPretty") === "1"; // Raw tab: pretty-print JSON? Persisted.
  let rawWrap = prefGet("rawWrap") !== "0"; // Raw tab: word-wrap long lines? Default on. Persisted.
  let errorsOnly = prefGet("errorsOnly") === "1"; // list: show only failed rows. Persisted.
  let loaderDiff = prefGet("loaderDiff") === "1"; // Loader tab: diff vs previous nav? Persisted.
  let groupNav = prefGet("groupNav") === "1"; // list: group events under their navigation? Persisted.
  const collapsedGroups = new Set(); // nav ids collapsed in group mode (session-local)
  // Tiny persisted-preference helpers (localStorage may be unavailable → no-ops).
  function prefGet(k) { try { return localStorage.getItem("rrInspector." + k); } catch { return null; } }
  function prefSet(k, v) { try { localStorage.setItem("rrInspector." + k, v); } catch {} }
  function prefJson(k, def) { try { const v = localStorage.getItem("rrInspector." + k); return v ? JSON.parse(v) : def; } catch { return def; } }
  function saveSet(k, s) { prefSet(k, JSON.stringify([...s])); }

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
      duration: req.time, // ms (HAR)
      size: (req.response.content && req.response.content.size) || req.response.bodySize || 0,
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
      setSiteAccessState("Site enabled", "enabled", null);
      return;
    }
    if (msg.type === "server-stream-status") {
      setServerStatus(msg.status, msg.url);
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
      const rb = msg.resBody != null ? decodeBody(msg.resBody) : null;
      const ev = {
        id: cryptoId(),
        source: "server",
        kind: "ssr",
        duration: msg.durationMs,
        time: msg.time,
        method: msg.method || "GET",
        status: msg.status || 0,
        url: msg.url,
        route: `${path}${msg.durationMs != null ? "  ·  " + msg.durationMs + "ms" : ""}`,
        reqHeaders: msg.reqHeaders || null,
        resHeaders: msg.resHeaders || null,
        payload: { query, body: msg.reqBody != null ? decodeBody(msg.reqBody).value : null },
        response: rb
          ? { raw: rb.raw, decoded: rb.value, truncated: rb.truncated, size: rb.size, mime: "SSR fetch" }
          : { raw: msg.error || null, decoded: msg.error ? { error: msg.error } : null, truncated: false, mime: "SSR fetch" },
        error: msg.ok === false || (msg.status || 0) >= 400 || !!msg.error,
      };
      events.push(ev);
      renderList();
      if (selected === ev.id) renderDetail(ev);
      return;
    }
    // Live router snapshots: initial load and each settled navigation/action,
    // read straight from window.__reactRouterDataRouter.state (already decoded).
    if (msg.type === "rr-nav-start") { lastNavStart = msg.time; return; }
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
      const lastMatch = (msg.matches && msg.matches.length) ? msg.matches[msg.matches.length - 1] : null;
      const routeIds = lastMatch ? (typeof lastMatch === "string" ? lastMatch : lastMatch.id) : "";
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
        matches: msg.matches || null,
        nav: true, // a navigation — heads a group in group-by-nav mode
        navStart: initial ? msg.time : lastNavStart, // window start for grouping its loaders
        error: !!msg.errors,
      };
      lastNavStart = null;
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

  function setSiteAccessState(label, kind, action) {
    siteAccessEl.hidden = false;
    siteAccessEl.textContent = label;
    siteAccessEl.className = `site-access ${kind || ""}`;
    siteAccessEl.disabled = !action;
    siteAccessAction = action;
  }

  function setServerStatus(status, url) {
    const label = {
      connected: "server: connected",
      connecting: "server: connecting",
      reconnecting: "server: reconnecting",
      unavailable: "server: unavailable",
    }[status] || "server: waiting";
    const className = {
      connected: "server-connected",
      reconnecting: "server-reconnecting",
      unavailable: "server-unavailable",
    }[status] || "server-waiting";

    serverStatusEl.className = `badge ${className}`;
    serverStatusEl.textContent = label;
    serverStatusEl.title = url ? `${label} — ${url}` : label;

    if (serverDiagnosticEl) {
      if (status === "connected") {
        serverDiagnosticEl.textContent = `Connected to ${url}.`;
      } else if (status === "unavailable") {
        serverDiagnosticEl.textContent =
          `The page bridge is enabled, but ${url} did not open as an SSE stream. ` +
          "Confirm the deployed server bridge and proxy route are enabled.";
      } else if (status === "reconnecting") {
        serverDiagnosticEl.textContent = `The server stream disconnected; reconnecting to ${url}.`;
      } else {
        serverDiagnosticEl.textContent = url
          ? `Connecting to ${url}…`
          : "Waiting for the page bridge…";
      }
    }
  }

  function inspectedUrl() {
    return new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval("location.href", (value, exception) => {
        resolve(exception ? null : value);
      });
    });
  }

  async function initSiteAccess() {
    const access = window.RRInspectorSiteAccess;
    const rawUrl = await inspectedUrl();
    if (!access || !rawUrl) return;

    let pattern;
    try {
      pattern = access.originPattern(rawUrl);
    } catch {
      return;
    }
    if (!pattern) return;

    if (access.isBuiltInOrigin(rawUrl)) {
      setSiteAccessState("Site enabled", "enabled", null);
      return;
    }

    try {
      const granted = await access.hasPermission(chrome, pattern);
      if (granted) {
        const registeredNow = await access.ensureRegistered(chrome, pattern);
        if (registeredNow && !sawBridge) {
          setSiteAccessState("Reload to enable", "needs-access", () => {
            chrome.devtools.inspectedWindow.reload();
          });
        } else {
          setSiteAccessState("Site enabled", "enabled", null);
        }
        return;
      }
    } catch {
      setSiteAccessState("Site access error", "error", initSiteAccess);
      return;
    }

    setSiteAccessState(`Enable ${new URL(rawUrl).host}`, "needs-access", async () => {
      setSiteAccessState("Requesting access…", "needs-access", null);
      try {
        const granted = await access.requestAndRegister(chrome, pattern);
        if (!granted) {
          setSiteAccessState("Access not granted", "error", initSiteAccess);
          return;
        }
        setSiteAccessState("Reloading…", "enabled", null);
        chrome.devtools.inspectedWindow.reload();
      } catch {
        setSiteAccessState("Site access error", "error", initSiteAccess);
      }
    });
  }

  siteAccessEl.addEventListener("click", () => {
    if (siteAccessAction) siteAccessAction();
  });
  initSiteAccess();

  // Default to network mode until/unless a bridge announces itself.
  setMode("network");

  // ---- Rendering -------------------------------------------------------------
  function kindOf(ev) {
    return ev.kind || (ev.source === "bridge" ? "router" : "api");
  }
  const KIND_LABELS = { data: "Data", graphql: "GraphQL", api: "API", ssr: "SSR", router: "Router" };
  const KIND_ORDER = ["data", "graphql", "api", "ssr", "router"];
  // Chip bar above the list: one toggle per call type present, with a live count.
  // Reuses the Console tab's .chip idiom; hidden types are dropped in renderList.
  function renderKindFilter() {
    const bar = document.getElementById("kindFilter");
    if (!bar) return;
    const counts = {};
    for (const ev of events) { const k = kindOf(ev); counts[k] = (counts[k] || 0) + 1; }
    const present = KIND_ORDER.filter((k) => counts[k]);
    for (const k of Object.keys(counts)) if (!KIND_ORDER.includes(k)) present.push(k);
    bar.textContent = "";
    // Nothing to filter with 0 or 1 type — hide the bar and clear any stale hides.
    const errs = events.filter((ev) => ev.error).length;
    const navs = events.some((ev) => ev.nav);
    // Nothing to offer with 0/1 type, no errors, and no navigations — hide the bar.
    if (present.length < 2 && !errs && !navs) { hiddenKinds.clear(); return; }
    const onKind = () => { saveSet("hiddenKinds", hiddenKinds); renderList(); };
    if (present.length >= 2) for (const k of present) { const c = chip(KIND_LABELS[k] || k, k, hiddenKinds, counts[k], onKind); c.classList.add("kchip", "k-" + k); bar.appendChild(c); }
    if (navs) {
      // Inverse toggle: on = grouped by navigation.
      const b = document.createElement("button");
      b.className = "chip group" + (groupNav ? " on" : "");
      b.textContent = "Group";
      b.title = groupNav ? "Grouped by navigation — click to flatten" : "Group events by navigation";
      b.addEventListener("click", () => { groupNav = !groupNav; prefSet("groupNav", groupNav ? "1" : "0"); renderList(); });
      bar.appendChild(b);
    }
    if (errs) {
      // "Errors N" is an inverse toggle (on = show only failures), so it's styled .on rather than .off.
      const b = document.createElement("button");
      b.className = "chip errors" + (errorsOnly ? " on" : "");
      b.textContent = `Errors ${errs}`;
      b.title = errorsOnly ? "Showing failed rows only — click to show all" : "Show only failed rows";
      b.addEventListener("click", () => { errorsOnly = !errorsOnly; prefSet("errorsOnly", errorsOnly ? "1" : "0"); renderList(); });
      bar.appendChild(b);
    }
  }
  function passesFilters(ev, f) {
    if (hiddenKinds.has(kindOf(ev))) return false;
    if (errorsOnly && !ev.error) return false;
    if (f && window.rrFilterMatch &&
        !window.rrFilterMatch(f, { status: ev.status, method: ev.method, kind: kindOf(ev), text: ev.route + " " + ev.url })) return false;
    return true;
  }
  function updateFilterHint() {
    const el = document.getElementById("filterHint");
    if (!el || !window.rrFilterHint) return;
    const h = window.rrFilterHint(filterEl.value);
    el.textContent = h;
    el.hidden = !h;
  }
  function makeRow(ev, nested) {
    const kind = kindOf(ev);
    const li = document.createElement("li");
    li.dataset.id = ev.id;
    li.title = ev.url || ev.route; // full path/URL on hover (list truncates with ellipsis)
    if (nested) li.classList.add("nested");
    if (ev.error) li.classList.add("err");
    if (selected === ev.id) li.classList.add("sel");
    const tag = document.createElement("span");
    tag.className = "tag tag-" + kind;
    tag.textContent = kind === "graphql" ? "gql" : kind;
    const m = document.createElement("span");
    m.className = "method " + (ev.method === "GET" ? "get" : "post");
    m.textContent = ev.method;
    const r = document.createElement("span");
    r.className = "route";
    r.textContent = ev.route;
    // Status code, colored by class (2xx accent / 3xx blue / 4xx amber / 5xx red).
    const st = document.createElement("span");
    const code = Number(ev.status) || 0;
    st.className = "status " + (code >= 500 ? "s5" : code >= 400 ? "s4" : code >= 300 ? "s3" : code >= 200 ? "s2" : "");
    st.textContent = ev.status || (ev.source === "bridge" ? "bridge" : "");
    // Duration + size as their own fixed, right-aligned columns so they line up.
    const bytes = ev.size || (ev.response && ev.response.raw ? ev.response.raw.length : 0);
    const dur = document.createElement("span");
    dur.className = "col-dur";
    dur.textContent = ev.duration != null ? fmtMs(ev.duration) : "";
    const size = document.createElement("span");
    size.className = "col-size";
    size.textContent = bytes ? fmtSize(bytes) : "";
    li.append(tag, m, r, st, dur, size);
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", selected === ev.id ? "true" : "false");
    li.tabIndex = -1;
    li.addEventListener("click", () => selectEvent(ev));
    return li;
  }
  // Group mode: each navigation (ev.nav) heads a collapsible group; the network
  // events that fired during it nest beneath. Events before the first nav render
  // flat at the top. Collapse state persists per-nav within the session.
  function renderGrouped(f) {
    const { leading, groups } = window.rrGroupByNav(events);
    for (const ev of leading) if (passesFilters(ev, f)) listEl.appendChild(makeRow(ev, false));
    for (const g of groups) {
      const members = g.members.filter((ev) => passesFilters(ev, f));
      if (!passesFilters(g.header, f) && !members.length) continue;
      const head = makeRow(g.header, false);
      head.classList.add("group-head");
      const gtw = document.createElement("span");
      gtw.className = "gtw";
      head.insertBefore(gtw, head.firstChild);
      listEl.appendChild(head);
      const memberLis = members.map((ev) => { const li = makeRow(ev, true); listEl.appendChild(li); return li; });
      const collapsed = collapsedGroups.has(g.header.id);
      gtw.textContent = collapsed ? "▸" : "▾";
      memberLis.forEach((li) => (li.hidden = collapsed));
      gtw.addEventListener("click", (e) => {
        e.stopPropagation();
        const willCollapse = !collapsedGroups.has(g.header.id);
        if (willCollapse) collapsedGroups.add(g.header.id); else collapsedGroups.delete(g.header.id);
        gtw.textContent = willCollapse ? "▸" : "▾";
        memberLis.forEach((li) => (li.hidden = willCollapse));
      });
    }
  }
  function renderList() {
    renderKindFilter();
    updateFilterHint();
    const f = filterEl.value.trim().toLowerCase();
    listEl.textContent = "";
    if (groupNav && window.rrGroupByNav && events.some((e) => e.nav)) renderGrouped(f);
    else for (const ev of events) if (passesFilters(ev, f)) listEl.appendChild(makeRow(ev, false));
    // Empty state: guide first-run users, or explain why filters hid everything.
    if (!listEl.childElementCount) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = events.length
        ? "No events match the current filters."
        : "Navigate or submit a form in your app to capture loader/action data. On a deployed site, click Enable this site first.";
      listEl.appendChild(empty);
    }
  }

  // ---- truncation handling ---------------------------------------------------
  // The dev plugin appends " …[truncated]" when a body exceeds its maxBody cap.
  // Detect that, strip the corrupting marker (so it doesn't invalidate the JSON),
  // and best-effort pretty-print the valid partial instead of a raw text wall.
  const TRUNC_MARK = " …[truncated]";
  function splitTruncation(s) {
    if (typeof s === "string" && s.endsWith(TRUNC_MARK)) {
      return { text: s.slice(0, -TRUNC_MARK.length), truncated: true };
    }
    return { text: s, truncated: false };
  }
  // Make a mid-stream-truncated JSON string renderable: trim the last incomplete
  // token and close any still-open structures. Returns a parsed value or null.
  // Repair + mark a truncated partial (src/partial-json.js): closes open
  // containers and injects the RR_TRUNCATED sentinel at the deepest cut point.
  function repairPartialJson(s) {
    return window.rrRepairPartialJson ? window.rrRepairPartialJson(s) : null;
  }
  // Decode a captured body: full JSON → object; truncated JSON → partial tree;
  // otherwise the raw (marker-stripped) string.
  function decodeBody(s) {
    const t = splitTruncation(s);
    if (t.text == null) return { value: null, raw: null, truncated: t.truncated, size: 0 };
    const value = tryJson(t.text) ?? (t.truncated ? repairPartialJson(t.text) : null) ?? t.text;
    return { value, raw: t.text, truncated: t.truncated, size: t.text.length };
  }
  function fmtMs(ms) { ms = Math.round(ms); return ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : ms + " ms"; }
  function fmtSize(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }
  // Pull an embedded JSON object/array out of a log line (e.g. a server stdout
  // line like `Precaching: [ {…} ]`) so it can render as a tree, not raw text.
  // The lookahead skips "[Prefix]" log tags and only matches a real JSON opener.
  function extractLogJson(text) {
    if (typeof text !== "string" || text.length < 8) return null;
    const m = text.match(/[\[{](?=\s*["\[{])/);
    if (!m || m.index == null) return null;
    const src = text.slice(m.index);
    const value = tryJson(src) ?? repairPartialJson(src);
    if (value && typeof value === "object") {
      return { prefix: text.slice(0, m.index).replace(/\s*$/, ""), value };
    }
    return null;
  }
  function makeTruncBanner(ev) {
    const b = document.createElement("div");
    b.className = "trunc-banner";
    const s = document.createElement("strong");
    s.textContent = "Response truncated";
    const span = document.createElement("span");
    const shown = ev.response.size || (ev.response.raw ? ev.response.raw.length : 0);
    span.textContent = ` — the dev plugin capped this body at ~${fmtSize(shown)}. Showing the valid partial below. Raise the cap with rrInspector({ maxBody: Infinity }) in vite.config to capture the full response.`;
    b.append(s, span);
    return b;
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

  // ---- pane action bars (Copy JSON / Copy URL / Copy as cURL) ----------------
  function actionBtn(label, title, onClick) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", () => onClick(b));
    return b;
  }
  function paneBar(pane, ...buttons) {
    const bar = document.createElement("div");
    bar.className = "pane-actions";
    for (const b of buttons) if (b) bar.appendChild(b);
    if (bar.childElementCount) pane.insertBefore(bar, pane.firstChild);
  }
  function copyJsonBtn(value) {
    if (value == null) return null;
    return actionBtn("Copy JSON", "Copy this pane as JSON", (b) => window.rrCopyText(JSON.stringify(window.rrToPlain(value), null, 2), b));
  }
  // ---- detail summary header ---------------------------------------------------
  // A compact request line above the tabs (kind · METHOD route · status · time · size)
  // so you never lose context while scanning panes. Refreshes as body/timing land.
  function summaryEl() { return document.getElementById("summary"); }
  function hideSummary() { const s = summaryEl(); if (s) { s.hidden = true; s.textContent = ""; } }
  function renderSummary(ev) {
    const s = summaryEl();
    if (!s) return;
    s.textContent = "";
    const kind = kindOf(ev);
    const tag = document.createElement("span");
    tag.className = "tag tag-" + kind;
    tag.textContent = kind === "graphql" ? "gql" : kind;
    const m = document.createElement("span");
    m.className = "method " + (ev.method === "GET" ? "get" : "post");
    m.textContent = ev.method || (ev.source === "bridge" ? "router" : "");
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = ev.route || ev.url || "";
    path.title = ev.url || ev.route || "";
    const code = Number(ev.status) || 0;
    const st = document.createElement("span");
    st.className = "status " + (code >= 500 ? "s5" : code >= 400 ? "s4" : code >= 300 ? "s3" : code >= 200 ? "s2" : "");
    st.textContent = ev.status || "";
    const meta = document.createElement("span");
    meta.className = "meta";
    const bytes = ev.size || (ev.response && ev.response.raw ? ev.response.raw.length : 0);
    meta.textContent = [
      ev.duration != null ? fmtMs(ev.duration) : "",
      bytes ? fmtSize(bytes) : "",
      ev.source === "bridge" ? "live router" : (ev.kind === "ssr" ? "ssr" : ""),
    ].filter(Boolean).join(" · ");
    s.append(tag, m, path, st, meta);
    if (ev.url) s.appendChild(actionBtn("⧉ URL", "Copy the request URL", (b) => window.rrCopyText(ev.url, b)));
    s.hidden = false;
  }
  // The route key a loader-data diff compares within: the URL pathname.
  function routeKey(ev) { try { return new URL(ev.url, "http://x").pathname; } catch { return ev.route || ""; } }
  // The most recent EARLIER loaderData snapshot for the same route (excluding ev).
  function prevLoader(ev) {
    const key = routeKey(ev);
    const evT = Date.parse(ev.time) || 0;
    let best = null, bestT = -Infinity;
    for (const e of events) {
      if (e === ev || e.loaderData == null || routeKey(e) !== key) continue;
      const t = Date.parse(e.time) || 0;
      if (t <= evT && t >= bestT) { best = e.loaderData; bestT = t; }
    }
    return best;
  }
  // Loader Data tab: normal tree, plus a "Diff vs previous" toggle when an earlier
  // snapshot of the same route exists — added/changed/removed keys highlight inline.
  function renderLoader(ev) {
    const pane = panes.loader;
    const isApiCall = ev.kind === "api" || ev.kind === "graphql" || ev.kind === "ssr";
    const val = isApiCall ? null : (ev.loaderData ?? ev.response.decoded);
    if (val == null) {
      jsonInto(pane, null, isApiCall ? "API call — no loader data. See the Response tab." : "No decoded loader data. See Raw tab.");
      return;
    }
    const prev = (!isApiCall && ev.loaderData != null) ? prevLoader(ev) : null;
    pane.textContent = "";
    const bar = document.createElement("div");
    bar.className = "pane-actions";
    bar.appendChild(actionBtn("Copy JSON", "Copy this pane as JSON", (b) => window.rrCopyText(JSON.stringify(window.rrToPlain(val), null, 2), b)));
    let diff = null;
    if (prev != null && window.rrDiff) {
      diff = window.rrDiff(window.rrToPlain(prev), window.rrToPlain(val));
      const db = actionBtn(loaderDiff ? "Diff ✓" : "Diff", "Compare to the previous navigation for this route", () => {
        loaderDiff = !loaderDiff; prefSet("loaderDiff", loaderDiff ? "1" : "0"); renderLoader(ev); applyFind();
      });
      db.classList.toggle("off", !loaderDiff);
      bar.appendChild(db);
      if (loaderDiff) {
        const c = diff.counts;
        const sum = document.createElement("span");
        sum.className = "diff-sum";
        sum.textContent = (c.added || c.changed || c.removed) ? `+${c.added} ~${c.changed} −${c.removed}` : "no change";
        bar.appendChild(sum);
      }
    }
    pane.appendChild(bar);
    pane.appendChild(diff && loaderDiff
      ? window.renderJsonTree(diff.merged, { marks: diff.marks, open: diff.open })
      : window.renderJsonTree(val));
  }
  function renderRoutes(ev) {
    const view = window.rrRoutesView ? window.rrRoutesView(ev.matches, ev.loaderData) : null;
    if (!view) {
      jsonInto(panes.routes, null, "No route matches — this is a network/SSR event, or the live router bridge isn't attached. Matches come from the bridge on navigation.");
      return;
    }
    panes.routes.textContent = "";
    paneBar(panes.routes, copyJsonBtn(view));
    panes.routes.appendChild(window.renderJsonTree(view));
  }
  function renderDetail(ev) {
    renderSummary(ev);
    const isApiCall = ev.kind === "api" || ev.kind === "graphql" || ev.kind === "ssr";
    renderLoader(ev);
    renderRoutes(ev);
    jsonInto(panes.payload, buildPayloadView(ev), "No payload (no URL, query params, or request body).");
    {
      const pv = buildPayloadView(ev);
      // cURL needs a real request line; router/bridge events have no wire request.
      const canCurl = !!(ev.url && ev.method && ev.source !== "bridge");
      if (pv) paneBar(panes.payload,
        copyJsonBtn(pv),
        ev.url ? actionBtn("Copy URL", "Copy the request URL", (b) => window.rrCopyText(ev.url, b)) : null,
        canCurl ? actionBtn("Copy as cURL", "Copy this request as a curl command", (b) => window.rrCopyText(window.rrToCurl(ev), b)) : null);
    }
    jsonInto(
      panes.headers,
      (ev.reqHeaders || ev.resHeaders) ? { request: ev.reqHeaders, response: ev.resHeaders } : null,
      "No headers captured (bridge/router event — open the same call under a network row for headers)."
    );
    if (ev.reqHeaders || ev.resHeaders) paneBar(panes.headers, copyJsonBtn({ request: ev.reqHeaders, response: ev.resHeaders }));
    jsonInto(panes.response, ev.response.decoded, ev.response.raw ? "Could not decode; see Raw." : "Waiting for response body…");
    if (ev.response.decoded != null) paneBar(panes.response, copyJsonBtn(ev.response.decoded));
    if (ev.response.truncated) panes.response.insertBefore(makeTruncBanner(ev), panes.response.firstChild);
    const raw = panes.raw;
    raw.textContent = "";
    if (ev.response.truncated) raw.appendChild(makeTruncBanner(ev));
    const rawText = ev.response.raw ?? "(no raw body — router event; data read from live state)";
    const pre = document.createElement("pre");
    pre.className = "jt";
    // Offer a Pretty toggle only when the raw body parses as JSON (API/GraphQL
    // responses). Turbo-stream / HTML bodies get no toggle. The choice is sticky.
    let prettyText = null;
    if (ev.response.raw) {
      try { prettyText = JSON.stringify(JSON.parse(ev.response.raw), null, 2); } catch { prettyText = null; }
    }
    const bar = document.createElement("div");
    bar.className = "raw-actions";
    const shown = () => (prettyText !== null && rawPretty ? prettyText : rawText);
    if (prettyText !== null) {
      const btn = document.createElement("button");
      btn.className = "chip";
      const apply = () => {
        btn.classList.toggle("off", !rawPretty);
        btn.textContent = rawPretty ? "Pretty ✓" : "Pretty";
        pre.textContent = shown();
      };
      btn.title = "Pretty-print the JSON body";
      btn.addEventListener("click", () => { rawPretty = !rawPretty; prefSet("rawPretty", rawPretty ? "1" : "0"); apply(); });
      bar.appendChild(btn);
      apply();
    } else {
      pre.textContent = rawText;
    }
    // Word-wrap toggle for long single-line bodies (default wrap on).
    const applyWrap = () => pre.classList.toggle("nowrap", !rawWrap);
    applyWrap();
    if (ev.response.raw) {
      const wb = document.createElement("button");
      wb.className = "chip";
      wb.title = "Toggle word-wrap for long lines";
      const wl = () => { wb.classList.toggle("off", !rawWrap); wb.textContent = rawWrap ? "Wrap ✓" : "Wrap"; };
      wb.addEventListener("click", () => { rawWrap = !rawWrap; prefSet("rawWrap", rawWrap ? "1" : "0"); applyWrap(); wl(); });
      bar.appendChild(wb);
      wl();
    }
    // Copy the body exactly as displayed (pretty or wire text).
    if (ev.response.raw) bar.appendChild(actionBtn("Copy", "Copy the body as shown", (b) => window.rrCopyText(shown(), b)));
    if (bar.childElementCount) raw.appendChild(bar);
    raw.appendChild(pre);
    applyFind(); // re-run any active find against the freshly rendered pane
  }

  // ---- console view ----------------------------------------------------------
  // The console now lives in a bottom split pane, toggled from the toolbar —
  // "active" just means the pane is open.
  let consoleShown = prefGet("consoleOpen") === "1";
  function consoleTabActive() { return consoleShown; }
  function setConsole(open) {
    consoleShown = open;
    const pane = document.getElementById("consolePane");
    const rz = document.getElementById("consoleResizer");
    const tg = document.getElementById("consoleToggle");
    if (pane) pane.hidden = !open;
    if (rz) rz.hidden = !open;
    if (tg) tg.classList.toggle("on", open);
    prefSet("consoleOpen", open ? "1" : "0");
    if (open) renderConsole();
  }
  function updateConsoleCount() {
    const el = document.getElementById("consoleCount");
    if (el) el.textContent = consoleLogs.length ? String(consoleLogs.length) : "";
  }
  function chip(label, key, hiddenSet, count, onToggle) {
    const b = document.createElement("button");
    b.className = "chip" + (hiddenSet.has(key) ? " off" : "");
    b.textContent = count != null ? `${label} ${count}` : label;
    b.addEventListener("click", () => {
      if (hiddenSet.has(key)) hiddenSet.delete(key);
      else hiddenSet.add(key);
      (onToggle || renderConsole)();
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
        for (const s of sources) bar.appendChild(chip(s, s, hiddenSources, srcCounts[s], () => { saveSet("hiddenSources", hiddenSources); renderConsole(); }));
        const sep = document.createElement("span");
        sep.className = "log-filters-sep";
        bar.appendChild(sep);
      }
      for (const lv of LEVEL_ORDER) {
        if (lvlCounts[lv]) bar.appendChild(chip(lv, lv, hiddenLevels, lvlCounts[lv], () => { saveSet("hiddenLevels", hiddenLevels); renderConsole(); }));
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
      const objArgs = (l.args || []).filter((a) => a && typeof a === "object");
      // Server logs are plain stdout text (no structured args). If the line has an
      // embedded JSON blob, pretty-print it as a collapsible tree instead of a
      // one-line wall of text. (Browser logs already get a tree from their args.)
      const embedded = objArgs.length ? null : extractLogJson(text);
      const nl = text.indexOf("\n");
      if (embedded) {
        const tw = document.createElement("span");
        tw.className = "tw log-tw";
        tw.textContent = "▸";
        msg.textContent = embedded.prefix || "JSON";
        msg.style.cursor = "pointer";
        const tree = window.renderJsonTree(embedded.value);
        tree.classList.add("log-tree");
        tree.style.display = "none";
        const toggle = () => {
          const open = tree.style.display === "none";
          tree.style.display = open ? "block" : "none";
          tw.textContent = open ? "▾" : "▸";
        };
        tw.addEventListener("click", toggle);
        msg.addEventListener("click", toggle);
        row.append(lvl, loc, tw, msg, tree);
      } else if (nl >= 0) {
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
      if (objArgs.length) {
        const tree = window.renderJsonTree(objArgs.length === 1 ? objArgs[0] : objArgs);
        tree.classList.add("log-tree");
        row.appendChild(tree);
      }
      pane.appendChild(row);
    }
    pane.scrollTop = pane.scrollHeight;
  }

  // ---- find in pane (⌘/Ctrl+F) -------------------------------------------------
  // Searches the ACTIVE pane's rendered JSON tree (keys + values + previews),
  // expands the path to every hit, highlights them, and steps with Enter /
  // Shift+Enter. Re-applied on tab switch and whenever the pane re-renders.
  const findEl = document.getElementById("find");
  const findCountEl = document.getElementById("findCount");
  let findHits = [];
  let findIdx = 0;
  function clearFindMarks(pane) {
    for (const r of pane.querySelectorAll(".jt .row.hit, .jt .row.cur")) r.classList.remove("hit", "cur");
  }
  function expandTo(row, pane) {
    for (let w = row.parentElement; w && w !== pane; w = w.parentElement) {
      if (w.classList && w.classList.contains("collapsed")) {
        w.classList.remove("collapsed");
        const tw = w.querySelector(":scope > .row > .tw");
        if (tw && tw.textContent) tw.textContent = "▾";
      }
    }
  }
  function rowText(row) {
    // A long string's full text lives in the sibling .strval, not the row.
    const kids = row.nextElementSibling;
    const sv = kids && kids.classList && kids.classList.contains("children") ? kids.querySelector(":scope > .strval") : null;
    return (row.textContent + " " + (sv ? sv.textContent : "")).toLowerCase();
  }
  function markCurrent() {
    for (const r of findHits) r.classList.remove("cur");
    const cur = findHits[findIdx];
    if (cur) { cur.classList.add("cur"); cur.scrollIntoView({ block: "nearest" }); }
    findCountEl.textContent = findHits.length ? `${findIdx + 1}/${findHits.length}` : (findEl.value ? "0" : "");
  }
  function applyFind() {
    const pane = document.querySelector(".pane.active");
    if (!pane || !findEl) return;
    clearFindMarks(pane);
    findHits = [];
    const q = findEl.value.trim().toLowerCase();
    if (!q) { findCountEl.textContent = ""; return; }
    for (const row of pane.querySelectorAll(".jt .row")) {
      if (!rowText(row).includes(q)) continue;
      row.classList.add("hit");
      expandTo(row, pane);
      findHits.push(row);
    }
    findIdx = 0;
    markCurrent();
  }
  function findStep(dir) {
    if (!findHits.length) return;
    findIdx = (findIdx + dir + findHits.length) % findHits.length;
    markCurrent();
  }
  function clearFind() {
    findEl.value = "";
    applyFind();
  }
  if (findEl) {
    findEl.addEventListener("input", applyFind);
    findEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); clearFind(); findEl.blur(); }
    });
    // ⌘F / Ctrl+F anywhere in the panel focuses the find box.
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        findEl.focus();
        findEl.select();
      }
    });
  }

  // ---- keyboard navigation -----------------------------------------------------
  // ↑/↓ (or j/k) move the selection, Enter focuses the active pane, 1–6 switch
  // tabs, ⌘/Ctrl+K jumps to the filter, Esc clears it. Typing in an input is
  // left alone (except Esc in the filter, and ⌘K which is a focus jump).
  function selectEvent(ev) {
    selected = ev.id;
    renderList();
    renderDetail(ev);
    const li = listEl.querySelector(`li[data-id="${ev.id}"]`);
    if (li) li.scrollIntoView({ block: "nearest" });
  }
  function moveSelection(dir) {
    const rows = [...listEl.querySelectorAll("li[data-id]:not([hidden])")]; // visible order (skips collapsed group members)
    if (!rows.length) return;
    let i = rows.findIndex((li) => li.dataset.id === selected);
    i = i < 0 ? (dir > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + dir));
    const ev = events.find((e) => e.id === rows[i].dataset.id);
    if (ev) selectEvent(ev);
  }
  function clearFilterText() {
    filterEl.value = "";
    prefSet("filter", "");
    renderList();
    updateFilterHint();
    if (consoleTabActive()) renderConsole();
  }
  const isTyping = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); filterEl.focus(); filterEl.select(); return; }
    if (isTyping(e.target)) {
      if (e.key === "Escape" && e.target === filterEl && filterEl.value) clearFilterText();
      return;
    }
    if (mod || e.altKey) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); moveSelection(1); }
    else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); moveSelection(-1); }
    else if (e.key === "Enter") { const p = document.querySelector(".pane.active"); if (p) { p.tabIndex = -1; p.focus(); } }
    else if (/^[1-6]$/.test(e.key)) { const b = document.querySelectorAll("#tabs button[data-tab]")[Number(e.key) - 1]; if (b) b.click(); }
    else if (e.key.toLowerCase() === "c") { setConsole(!consoleShown); }
    else if (e.key === "Escape" && filterEl.value) clearFilterText();
  });

  // ---- tabs ------------------------------------------------------------------
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === btn.dataset.tab));
    prefSet("tab", btn.dataset.tab);
    applyFind();
  });
  // Restore the last active tab.
  { const t = prefGet("tab"); const b = t && document.querySelector(`#tabs button[data-tab="${t}"]`); if (b && !b.classList.contains("active")) b.click(); }

  // ---- console split pane (toolbar toggle + X + drag-resize) ------------------
  {
    const toggle = document.getElementById("consoleToggle");
    const closeBtn = document.getElementById("consoleClose");
    if (toggle) toggle.addEventListener("click", () => setConsole(!consoleShown));
    if (closeBtn) closeBtn.addEventListener("click", () => setConsole(false));
    (function initConsoleResizer() {
      const main = document.getElementById("main");
      const pane = document.getElementById("consolePane");
      const rz = document.getElementById("consoleResizer");
      if (!main || !pane || !rz) return;
      const saved = Number(prefGet("consoleHeight"));
      if (saved > 80) pane.style.flexBasis = saved + "px";
      let dragging = false;
      rz.addEventListener("mousedown", (e) => { dragging = true; rz.classList.add("dragging"); document.body.classList.add("row-resizing"); e.preventDefault(); });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = main.getBoundingClientRect();
        const h = Math.max(80, Math.min(rect.bottom - e.clientY, rect.height - 120));
        pane.style.flexBasis = h + "px";
      });
      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false; rz.classList.remove("dragging"); document.body.classList.remove("row-resizing");
        prefSet("consoleHeight", String(Math.round(pane.getBoundingClientRect().height)));
      });
    })();
    setConsole(consoleShown); // restore persisted open state
  }

  function resetPanes() {
    selected = null;
    renderList();
    updateConsoleCount();
    Object.values(panes).forEach((p) => (p.textContent = ""));
    hideSummary();
  }
  document.getElementById("clear").addEventListener("click", () => {
    events.length = 0;
    consoleLogs.length = 0;
    collapsedGroups.clear();
    resetPanes();
  });

  // ---- export / import session -------------------------------------------------
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportBtn = document.getElementById("export");
  if (exportBtn) exportBtn.addEventListener("click", () => {
    const session = window.rrExportSession(events, consoleLogs, { redact: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    download(`rr-inspector-session-${ts}.json`, JSON.stringify(session, null, 2));
  });
  const importBtn = document.getElementById("import");
  const importFile = document.getElementById("importFile");
  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files && importFile.files[0];
      importFile.value = "";
      if (!file) return;
      try {
        const parsed = window.rrImportSession(JSON.parse(await file.text()));
        events.length = 0; events.push(...parsed.events);
        consoleLogs.length = 0; consoleLogs.push(...parsed.consoleLogs);
        collapsedGroups.clear();
        resetPanes();
      } catch (err) {
        const prev = importBtn.textContent;
        importBtn.textContent = "Bad file";
        importBtn.style.color = "var(--err)";
        setTimeout(() => { importBtn.textContent = prev; importBtn.style.color = ""; }, 1600);
      }
    });
  }
  { const f = prefGet("filter"); if (f) filterEl.value = f; } // restore last filter
  filterEl.addEventListener("input", () => {
    prefSet("filter", filterEl.value);
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

  // Preserve-log toggle persists like the others.
  { const p = prefGet("preserve"); if (p !== null) preserveEl.checked = p !== "0"; }
  preserveEl.addEventListener("change", () => prefSet("preserve", preserveEl.checked ? "1" : "0"));

  chrome.devtools.network.onNavigated.addListener(() => {
    if (!preserveEl.checked) {
      events.length = 0;
      selected = null;
      renderList();
      hideSummary();
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
    // Status badges are actionable: "detecting…" / "server: waiting" click through to the setup + diagnostic.
    for (const id of ["mode", "serverStatus"]) { const el = document.getElementById(id); if (el) el.addEventListener("click", open); }
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
    const col = document.getElementById("listCol");
    const KEY = "rrInspector.listWidth";
    const saved = Number(localStorage.getItem(KEY));
    if (saved > 120) col.style.flex = `0 0 ${saved}px`;
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
      col.style.flex = `0 0 ${w}px`;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("dragging");
      document.body.classList.remove("col-resizing");
      localStorage.setItem(KEY, String(Math.round(col.getBoundingClientRect().width)));
    });
    resizer.addEventListener("dblclick", () => {
      col.style.flex = "0 0 42%";
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
