import {databaseHealthResponseSchema} from "@mke/contracts";
import {checkDatabaseHealth} from "@mke/database/server";
import {describe, expect, it} from "vitest";

describe.skipIf(!process.env.DATABASE_URL)("database health integration", () => {
  it("reaches the isolated database and reports PostGIS", async () => {
    const result = databaseHealthResponseSchema.parse(await checkDatabaseHealth());

    expect(result.status).toBe("ok");
    expect(result.database).toBe("reachable");
    expect(result.postgisVersion).toEqual(expect.any(String));
    expect(result.postgisVersion).not.toHaveLength(0);
  });
});
