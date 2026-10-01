// GET /api/reviews — a browser REST call, shows as an `api` row.
export function loader({ request }: { request: Request }) {
  const product = new URL(request.url).searchParams.get("product") ?? "1";
  const reviews = Array.from({ length: 6 }, (_, i) => ({
    id: `rev-${product}-${i + 1}`,
    author: ["Ada", "Grace", "Linus", "Margaret", "Alan", "Radia"][i],
    stars: 3 + ((i * 7) % 3),
    body: "Solid build, shipped fast. Would buy again.",
  }));
  return Response.json(reviews);
}
