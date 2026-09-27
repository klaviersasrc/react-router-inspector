// Mini-syntax for the event-list filter. Pure → unit-testable; see test/filter.test.mjs.
// Tokens (space-separated): field:value where field ∈ status|method|kind
//   status:500 (prefix ok) · status:5xx (class) · method:POST · kind:graphql
// A leading "-" negates any token. Bare words match the row text (route + URL).
// All terms must hold (AND).
(function (root) {
  const FIELDS = { status: 1, method: 1, kind: 1 };
  function parse(q) {
    const terms = [];
    for (let t of (q || "").trim().split(/\s+/).filter(Boolean)) {
      let neg = false;
      if (t[0] === "-") { neg = true; t = t.slice(1); }
      if (!t) continue;
      const i = t.indexOf(":");
      const field = i > 0 ? t.slice(0, i).toLowerCase() : "";
      if (i > 0 && FIELDS[field]) terms.push({ neg, field, value: t.slice(i + 1).toLowerCase() });
      else terms.push({ neg, field: "text", value: t.toLowerCase() });
    }
    return terms;
  }
  function termMatch(term, ev) {
    const v = term.value;
    if (term.field === "status") {
      const s = String(ev.status == null ? "" : ev.status);
      if (/^\dxx$/.test(v)) return s.charAt(0) === v.charAt(0);
      return s === v || s.startsWith(v);
    }
    if (term.field === "method") return String(ev.method || "").toLowerCase().startsWith(v);
    if (term.field === "kind") return String(ev.kind || "").toLowerCase() === v;
    return String(ev.text || "").toLowerCase().includes(v);
  }
  // ev-lite: { status, method, kind, text }.
  root.rrFilterMatch = function (query, ev) {
    const terms = parse(query);
    for (const t of terms) if (t.neg === termMatch(t, ev)) return false;
    return true;
  };
  root.rrParseFilter = parse;
  // A human hint describing the recognized (non-plain-text) tokens, or "" if none.
  root.rrFilterHint = function (query) {
    const parts = parse(query)
      .filter((t) => t.field !== "text" || t.neg)
      .map((t) => (t.neg ? "not " : "") + (t.field === "text" ? `"${t.value}"` : `${t.field} ${t.value}`));
    return parts.length ? "Filtering: " + parts.join(" · ") : "";
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
