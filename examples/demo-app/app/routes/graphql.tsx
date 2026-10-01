// POST /graphql — a browser GraphQL call. The panel labels the row by
// operationName and parses variables + query on the Payload tab.
export async function action({ request }: { request: Request }) {
  let op = "Query";
  try {
    const body = await request.json();
    op = body.operationName ?? op;
  } catch { /* ignore */ }

  const products = [
    { id: "1", name: "Blue Widget", price: 125 },
    { id: "2", name: "Red Gizmo", price: 98.5 },
    { id: "3", name: "Green Sprocket", price: 42 },
  ];
  return Response.json({ data: { __op: op, products } });
}

// A GET here just makes the route valid to open directly.
export function loader() {
  return Response.json({ ok: true, hint: "POST a GraphQL operation here" });
}
