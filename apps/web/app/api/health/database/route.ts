import {databaseHealthResponseSchema} from "@mke/contracts";
import {checkDatabaseHealth} from "@mke/database/server";

export const runtime = "nodejs";

export async function GET() {
  const health = databaseHealthResponseSchema.parse(await checkDatabaseHealth());
  const status = health.status === "ok" ? 200 : 503;

  return Response.json(health, {status});
}
