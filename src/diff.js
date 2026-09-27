// Structural diff of two JSON values for the Loader Data "Diff vs previous" view.
// Pure (no DOM) so it's unit-testable in Node — see test/diff.test.mjs.
// Exposes window.rrDiff(prev, cur) → { marks, open, merged, counts }:
//   marks  Map<path, {status: "added"|"changed"|"removed", old?}>  (path like "/user/age")
//   open   Set<path> of every ancestor of a change, so the tree renders them expanded
//   merged `cur` with removed entries re-inserted from `prev`, so they can render struck-through
//   counts { added, changed, removed }
(function (root) {
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; } };

  function diff(prev, cur) {
    const marks = new Map();
    const open = new Set();
    const counts = { added: 0, changed: 0, removed: 0 };

    function mark(path, status, old) {
      marks.set(path, old === undefined ? { status } : { status, old });
      counts[status]++;
      const parts = path.split("/"); // "/a/b" → ["", "a", "b"]; ancestors: "", "/a"
      open.add("");
      for (let i = 2; i < parts.length; i++) open.add(parts.slice(0, i).join("/"));
    }

    function walk(p, c, path) {
      if (isObj(p) && isObj(c)) {
        const out = {};
        for (const k of Object.keys(c)) {
          const sub = path + "/" + k;
          if (!(k in p)) { out[k] = c[k]; mark(sub, "added"); }
          else out[k] = walk(p[k], c[k], sub);
        }
        for (const k of Object.keys(p)) if (!(k in c)) { out[k] = p[k]; mark(path + "/" + k, "removed"); }
        return out;
      }
      if (Array.isArray(p) && Array.isArray(c)) {
        const out = [];
        for (let i = 0; i < Math.max(p.length, c.length); i++) {
          const sub = path + "/" + i;
          if (i >= p.length) { out.push(c[i]); mark(sub, "added"); }
          else if (i >= c.length) { out.push(p[i]); mark(sub, "removed"); }
          else out.push(walk(p[i], c[i], sub));
        }
        return out;
      }
      if (!same(p, c)) mark(path, "changed", p);
      return c;
    }

    const merged = walk(prev, cur, "");
    return { marks, open, merged, counts };
  }

  root.rrDiff = diff;
})(typeof globalThis !== "undefined" ? globalThis : this);
