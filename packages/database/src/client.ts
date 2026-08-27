import {neon} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-http";

export function createDatabaseClient(databaseUrl: string) {
  const client = neon(databaseUrl);

  return drizzle({client});
}
