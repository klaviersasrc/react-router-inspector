// Validates the EXACT decode path the panel uses: turbo-stream text -> decoded value.
import { encode, decode } from "../src/vendor/turbo-stream.mjs";

// Simulate a real single-fetch .data body: object keyed by route id, values are
// { data } / { error }, including non-JSON types (Date, Map, BigInt, undefined).
const serverValue = {
  root: { data: { user: { name: "caitlin.hern", roles: ["approver"] } } },
  "routes/invoice": {
    data: {
      page: 0,
      showAdvanced: true,
      approvedBy: "caitlin.hern",
      createdAt: new Date("2026-08-10T12:00:00.000Z"),
      totals: new Map([["qtd", 41250.5], ["ytd", 183900]]),
      bigId: 90071992547409910n,
      note: undefined,
      rows: [{ id: 1, vendor: "Acme" }, { id: 2, vendor: "Globex" }],
    },
  },
};

// 1) Encode to a turbo-stream ReadableStream, then serialize to the STRING the
//    DevTools Network API (getContent) would hand us.
function streamToString(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  return (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += typeof value === "string" ? value : dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  })();
}

const wireText = await streamToString(encode(serverValue));
console.log("--- WIRE TEXT (what getContent returns) ---");
console.log(JSON.stringify(wireText));

// 2) The panel's decode wrapper, verbatim.
async function decodeTurboStream(text) {
  const stream = new Response(text).body;
  const { value, done } = await decode(stream);
  await done;
  return value;
}

const decoded = await decodeTurboStream(wireText);

// 3) Assert the non-JSON types survived.
const inv = decoded["routes/invoice"].data;
const checks = {
  routeKeyed: !!decoded.root && !!decoded["routes/invoice"],
  dateIsDate: inv.createdAt instanceof Date && inv.createdAt.toISOString() === "2026-08-10T12:00:00.000Z",
  mapIsMap: inv.totals instanceof Map && inv.totals.get("qtd") === 41250.5,
  bigint: typeof inv.bigId === "bigint" && inv.bigId === 90071992547409910n,
  undefinedPreserved: "note" in inv && inv.note === undefined,
  nestedArray: Array.isArray(inv.rows) && inv.rows[1].vendor === "Globex",
  userFromRoot: decoded.root.data.user.name === "caitlin.hern",
};
console.log("--- DECODED ---");
console.log(inv);
console.log("--- CHECKS ---");
console.log(checks);
const allPass = Object.values(checks).every(Boolean);
console.log(allPass ? "\nALL CHECKS PASS ✅" : "\nFAILED ❌");
process.exit(allPass ? 0 : 1);
