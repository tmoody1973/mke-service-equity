import {loadTractEvidenceCsv} from "../../../../features/data/server/load-tract-export";
import {
  createTractEvidenceCsvFilename,
  serializeTractEvidenceCsv,
} from "../../../../features/data/server/serialize-tract-csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const result = await loadTractEvidenceCsv();
    if (result.state === "unavailable") {
      const status = result.reason === "no_published_run" || result.reason === "preview_not_allowed"
        ? 404
        : 503;
      return Response.json(result, {status, headers: noStoreHeaders});
    }

    const filename = createTractEvidenceCsvFilename(result.data);
    const body = serializeTractEvidenceCsv(result.data);
    return new Response(body, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch {
    return Response.json(
      {state: "unavailable", reason: "export_unavailable"},
      {status: 503, headers: noStoreHeaders},
    );
  }
}
