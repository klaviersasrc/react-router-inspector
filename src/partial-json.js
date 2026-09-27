// Repair a mid-stream-truncated JSON string into a renderable partial, and mark
// WHERE it was cut. Pure → unit-testable; see test/partial-json.test.mjs.
// The tail after the last complete element is dropped and open containers are
// closed, but a sentinel value (window.RR_TRUNCATED) is injected into the deepest
// open container so the tree can show a "cut off here" marker at the exact spot.
(function (root) {
  const TRUNCATED = "rr-truncated"; // private-use sentinel; the tree renders it specially
  root.RR_TRUNCATED = TRUNCATED;

  root.rrRepairPartialJson = function (s) {
    if (typeof s !== "string") return null;
    const stack = [];
    let inStr = false, esc = false, safeLen = 0, safeClose = "", safeTop = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if (c === "}" || c === "]") stack.pop();
      if (c === "," || c === "}" || c === "]") {
        // A safe cut point: everything up to here is a complete value. Record the
        // close-string AND the innermost container's type at THIS point (not the end).
        safeLen = i + 1;
        safeClose = stack.slice().reverse().join("");
        safeTop = stack.length ? stack[stack.length - 1] : "";
      }
    }
    if (!safeLen) return null;
    const body = s.slice(0, safeLen).replace(/,\s*$/, "");
    if (safeTop) {
      // Inject the sentinel as the last member of the deepest still-open container.
      const marker = safeTop === "}" ? `"…":${JSON.stringify(TRUNCATED)}` : JSON.stringify(TRUNCATED);
      try { return JSON.parse(body + "," + marker + safeClose); } catch { /* fall through */ }
    }
    try { return JSON.parse(body + safeClose); } catch { return null; }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
