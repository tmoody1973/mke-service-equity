import type {DatabaseHealthResponse} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {createDatabaseClient} from "./client";
import {readRuntimeDatabaseUrl} from "./env";

type DatabaseEnvironment = Record<string, string | undefined>;

export interface DatabaseHealthClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type DatabaseHealthClientFactory = (databaseUrl: string) => DatabaseHealthClient;

export async function checkDatabaseHealth(
  environment: DatabaseEnvironment = process.env,
  createClient: DatabaseHealthClientFactory = createDatabaseClient,
): Promise<DatabaseHealthResponse> {
  if (!environment.DATABASE_URL?.trim()) {
    return {
      status: "unconfigured",
      database: "unconfigured",
      postgisVersion: null,
    };
  }

  let client: DatabaseHealthClient;
  try {
    const databaseUrl = readRuntimeDatabaseUrl(environment);
    client = createClient(databaseUrl);
    await client.execute(sql`select current_database() as database_name`);
  } catch {
    return {status: "error", database: "unreachable", postgisVersion: null};
  }

  try {
    const result = await client.execute(sql`select postgis_lib_version() as postgis_version`);
    const postgisVersion = result.rows[0]?.postgis_version;

    if (typeof postgisVersion !== "string" || postgisVersion.trim().length === 0) {
      return {status: "error", database: "reachable", postgisVersion: null};
    }

    return {
      status: "ok",
      database: "reachable",
      postgisVersion: postgisVersion.trim(),
    };
  } catch {
    return {status: "error", database: "reachable", postgisVersion: null};
  }
}
