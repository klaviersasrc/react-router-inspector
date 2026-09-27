// Build a `curl` command for a captured request. Exposes window.rrToCurl(ev).
// Pure (no DOM) so it's unit-testable in Node — see test/curl.test.mjs.
(function (root) {
  // Headers curl must not replay: pseudo-headers (":authority") and hop-by-hop.
  const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding", "keep-alive", "upgrade", "te", "trailer", "proxy-connection"]);
  const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"; // POSIX single-quote escape

  function bodyText(ev) {
    const b = ev.payload && ev.payload.body;
    if (b == null) return null;
    if (typeof b === "string") return b;
    // extractPayload decodes form bodies into an object; re-encode them for the wire.
    const ct = ev.reqHeaders && Object.entries(ev.reqHeaders).find(([k]) => k.toLowerCase() === "content-type");
    if (ct && /x-www-form-urlencoded/i.test(ct[1]) && typeof b === "object" && !Array.isArray(b)) {
      return new URLSearchParams(b).toString();
    }
    return JSON.stringify(b);
  }

  function toCurl(ev) {
    if (!ev || !ev.url) return "";
    const lines = ["curl " + sq(ev.url)];
    const method = (ev.method || "GET").toUpperCase();
    if (method !== "GET") lines.push("-X " + method);
    for (const [k, v] of Object.entries(ev.reqHeaders || {})) {
      if (k.startsWith(":") || SKIP.has(k.toLowerCase())) continue;
      lines.push("-H " + sq(k + ": " + v));
    }
    const body = bodyText(ev);
    if (body != null && method !== "GET") lines.push("--data-raw " + sq(body));
    return lines.join(" \\\n  ");
  }

  root.rrToCurl = toCurl;
})(typeof globalThis !== "undefined" ? globalThis : this);
