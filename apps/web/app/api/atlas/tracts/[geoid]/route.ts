import {loadTractProfile} from "../../../../../features/atlas/server/load-tract-profile";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {params}: {params: Promise<{geoid: string}>},
) {
  const {geoid} = await params;
  const response = await loadTractProfile(geoid);
  const status = response.state === "available"
    ? 200
    : response.reason === "invalid_tract"
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
