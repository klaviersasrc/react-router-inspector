// GET /api/pricing — fetched SERVER-SIDE by the product loader, so it appears as
// an `ssr` row. The payload is intentionally large: with the demo's low maxBody,
// the panel marks exactly where the response was truncated.
export function loader({ request }: { request: Request }) {
  const id = new URL(request.url).searchParams.get("id") ?? "1";
  const tiers = Array.from({ length: 40 }, (_, i) => ({
    region: ["hkg", "sfo", "fra", "syd"][i % 4],
    qtyFrom: i * 10 + 1,
    unit: Number((100 - i * 0.75).toFixed(2)),
    currency: "USD",
    note: "volume tier — negotiated rate, subject to change",
  }));
  return Response.json({ productId: id, updatedAt: new Date().toISOString(), tiers });
}
