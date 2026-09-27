// Minimal collapsible JSON tree renderer. No deps. Exposes window.renderJsonTree.
(function () {
  function typeOf(v) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (Array.isArray(v)) return "array";
    if (v instanceof Date) return "date";
    if (v instanceof Map) return "map";
    if (v instanceof Set) return "set";
    if (typeof v === "bigint") return "bigint";
    return typeof v; // string | number | boolean | object | function
  }
  function leaf(v) {
    const t = typeOf(v);
    const span = document.createElement("span");
    if (v === window.RR_TRUNCATED) { span.className = "trunc-mark"; span.textContent = "⚠ truncated — response cut off here"; return span; }
    if (t === "string") { span.className = "s"; span.textContent = JSON.stringify(v); }
    else if (t === "number") { span.className = "n"; span.textContent = String(v); }
    else if (t === "bigint") { span.className = "n"; span.textContent = String(v) + "n"; }
    else if (t === "boolean") { span.className = "b"; span.textContent = String(v); }
    else if (t === "null") { span.className = "nul"; span.textContent = "null"; }
    else if (t === "undefined") { span.className = "nul"; span.textContent = "undefined"; }
    else if (t === "date") { span.className = "s"; span.textContent = `Date(${v.toISOString()})`; }
    else { span.textContent = String(v); }
    return span;
  }
  function entriesOf(t, v) {
    if (t === "array") return v.map((x, i) => [i, x]);
    if (t === "set") return [...v].map((x, i) => [i, x]);
    if (t === "map") return [...v.entries()].map(([k, x]) => [typeof k === "object" ? JSON.stringify(k) : String(k), x]);
    return Object.entries(v);
  }
  // Collapsed previews are Chrome-style: `key: value` pairs (not just key names),
  // with short inline values, truncated by WIDTH (a char budget) rather than a
  // fixed key count, so a collapsed node still tells you what's inside.
  const PREVIEW_BUDGET = 70;
  function keyStr(k) {
    k = typeof k === "object" ? JSON.stringify(k) : String(k);
    return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
  }
  // One value, rendered short enough to sit inside a preview.
  function short(v) {
    if (v === window.RR_TRUNCATED) return "⚠ truncated";
    const t = typeOf(v);
    if (t === "string") return JSON.stringify(v.length > 24 ? v.slice(0, 24) + "…" : v);
    if (t === "number" || t === "boolean") return String(v);
    if (t === "bigint") return String(v) + "n";
    if (t === "null") return "null";
    if (t === "undefined") return "undefined";
    if (t === "date") return `Date(${v.toISOString()})`;
    if (t === "array") return `Array(${v.length})`;
    if (t === "set") return `Set(${v.size})`;
    if (t === "map") return `Map(${v.size})`;
    if (t === "object") return "{…}";
    return String(v);
  }
  // Join parts until the budget is spent, then close with a trailing "…".
  function joinBudget(parts, open, close) {
    let out = "";
    for (const p of parts) {
      const next = out ? out + ", " + p : p;
      if (next.length > PREVIEW_BUDGET) return `${open}${out ? out + ", " : ""}…${close}`;
      out = next;
    }
    return `${open}${out}${close}`;
  }
  function preview(v) {
    const t = typeOf(v);
    if (t === "array") return v.length ? `(${v.length}) ` + joinBudget(v.map(short), "[", "]") : "[]";
    if (t === "set") return `Set(${v.size}) ` + joinBudget([...v].map(short), "{", "}");
    if (t === "map") return `Map(${v.size}) ` + joinBudget([...v.entries()].map(([k, x]) => `${keyStr(k)} => ${short(x)}`), "{", "}");
    if (t === "object") {
      const keys = Object.keys(v);
      return keys.length ? joinBudget(keys.map((k) => `${keyStr(k)}: ${short(v[k])}`), "{", "}") : "{}";
    }
    return "";
  }
  // A string is "long" when it wouldn't read well inline — multi-line (e.g. a
  // GraphQL query, full of \n) or simply very long (base64, big payload fields).
  function isLongString(v) {
    return typeof v === "string" && (v.indexOf("\n") !== -1 || v.length > 120);
  }
  // Render a long string like a container: a twisty + one-line preview, collapsed
  // by default; expanded shows the full text with real newlines preserved (.jt is
  // white-space: pre-wrap), so a GraphQL query reads properly instead of as a wall.
  function longString(row, tw, val, depth) {
    const wrap = document.createElement("div");
    wrap.appendChild(row);

    const firstLine = val.split("\n", 1)[0];
    const clipped = firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine;
    const pv = document.createElement("span");
    pv.className = "preview";
    pv.textContent = `${JSON.stringify(clipped)}  (${val.length.toLocaleString()} chars)`;
    row.appendChild(pv);
    addCopy(row, val);

    const children = document.createElement("div");
    children.className = "children";
    const block = document.createElement("div");
    block.className = "s strval";
    block.style.paddingLeft = (depth + 1) * 14 + "px";
    block.textContent = val;
    children.appendChild(block);
    wrap.appendChild(children);

    tw.textContent = "▸";
    wrap.classList.add("collapsed");
    const toggle = () => {
      const c = wrap.classList.toggle("collapsed");
      tw.textContent = c ? "▸" : "▾";
    };
    tw.addEventListener("click", toggle);
    pv.addEventListener("click", toggle);
    return wrap;
  }
  // ---- copy support ----------------------------------------------------------
  // Serialize any tree value (incl. Map/Set/BigInt/Date/undefined) to plain JSON.
  function toPlain(v) {
    if (v === window.RR_TRUNCATED) return "[truncated — raise maxBody]";
    const t = typeOf(v);
    if (t === "map") { const o = {}; for (const [k, x] of v.entries()) o[typeof k === "object" ? JSON.stringify(k) : String(k)] = toPlain(x); return o; }
    if (t === "set") return [...v].map(toPlain);
    if (t === "array") return v.map(toPlain);
    if (t === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = toPlain(v[k]); return o; }
    if (t === "bigint") return String(v);
    if (t === "date") return v.toISOString();
    if (t === "undefined") return null;
    return v;
  }
  // What a node copies: raw string (unquoted, Chrome-style) for strings; JSON for containers.
  function copyText(v) {
    if (v === window.RR_TRUNCATED) return "[truncated — raise maxBody]";
    const t = typeOf(v);
    if (t === "string") return v;
    if (t === "number" || t === "boolean" || t === "bigint" || t === "null" || t === "undefined") return String(v);
    if (t === "date") return v.toISOString();
    return JSON.stringify(toPlain(v), null, 2);
  }
  // Write to the clipboard and flash the trigger button. Shared with panel.js.
  window.rrToPlain = toPlain;
  window.rrCopyText = async function (text, btn, label) {
    try { await navigator.clipboard.writeText(text); } catch { return false; }
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = label || "Copied ✓";
      btn.classList.add("ok");
      setTimeout(() => { btn.textContent = prev; btn.classList.remove("ok"); }, 1200);
    }
    return true;
  };
  // Hover-copy affordance at the end of a row: copies that node's value.
  function addCopy(row, val) {
    const b = document.createElement("button");
    b.className = "cp";
    b.type = "button";
    b.title = "Copy value";
    b.textContent = "⧉";
    b.addEventListener("click", (e) => { e.stopPropagation(); window.rrCopyText(copyText(val), b, "✓"); });
    row.appendChild(b);
  }
  // Compact display of a previous (changed) value, for the "was …" diff hint.
  function shortOld(v) {
    const t = typeOf(v);
    if (t === "string") return JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v);
    if (t === "object" || t === "array" || t === "map" || t === "set") return preview(v);
    return copyText(v);
  }
  // opts (optional): { marks: Map<path,{status,old?}>, open: Set<path> } for the
  // diff view — marks color a row added/changed/removed, open force-expands the
  // path to every change. path is "/a/b" (root ""), matching src/diff.js.
  function node(key, val, depth, path, opts) {
    path = path || "";
    const mark = opts && opts.marks ? opts.marks.get(path) : null;
    const row = document.createElement("div");
    row.className = "row" + (mark ? " d-" + mark.status : "");
    row.style.paddingLeft = depth * 14 + "px";
    const t = typeOf(val);
    const isContainer = t === "object" || t === "array" || t === "map" || t === "set";

    const tw = document.createElement("span");
    tw.className = "tw";
    row.appendChild(tw);

    if (key !== null) {
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
      row.appendChild(k);
      row.appendChild(document.createTextNode(": "));
    }

    if (!isContainer) {
      if (t === "string" && isLongString(val)) return longString(row, tw, val, depth);
      row.appendChild(leaf(val));
      if (mark && mark.status === "changed" && "old" in mark) {
        const was = document.createElement("span");
        was.className = "d-was";
        was.textContent = "  was " + shortOld(mark.old);
        row.appendChild(was);
      }
      addCopy(row, val);
      return row;
    }

    const wrap = document.createElement("div");
    wrap.appendChild(row);
    const pv = document.createElement("span");
    pv.className = "preview";
    pv.textContent = preview(val);
    row.appendChild(pv);
    addCopy(row, val);

    const children = document.createElement("div");
    children.className = "children";
    const entries = entriesOf(t, val);
    for (const [k, v] of entries) children.appendChild(node(String(k), v, depth + 1, path + "/" + k, opts));
    wrap.appendChild(children);

    const forceOpen = !!(opts && opts.open && opts.open.has(path));
    const openTop = depth < 1 || forceOpen;
    tw.textContent = openTop ? "▾" : "▸";
    if (!openTop) wrap.classList.add("collapsed");
    const toggle = () => {
      const c = wrap.classList.toggle("collapsed");
      tw.textContent = c ? "▸" : "▾";
    };
    tw.addEventListener("click", toggle);
    pv.addEventListener("click", toggle);
    return wrap;
  }
  window.renderJsonTree = function (value, opts) {
    const root = document.createElement("div");
    root.className = "jt";
    root.appendChild(node(null, value, 0, "", opts || null));
    return root;
  };
})();
