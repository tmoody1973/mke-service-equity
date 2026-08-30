import {loadAtlasSearch} from "../../../../features/atlas/server/load-atlas-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const response = await loadAtlasSearch(query);
  const status = response.state === "available"
    ? 200
    : response.reason === "invalid_query"
      ? 400
      : response.reason === "no_published_run"
        ? 404
        : 503;

  return Response.json(response, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
