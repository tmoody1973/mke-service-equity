import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

describe("Plan 1 database migration scope", () => {
  it("enables only PostGIS and creates no domain data", async () => {
    const migrationPath = fileURLToPath(
      new URL("../drizzle/0000_enable_postgis.sql", import.meta.url),
    );
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+postgis\s*;/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE/i);
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
    expect(migration).not.toMatch(/\b(scores?|resources?|geograph(?:y|ies|ic|ical))\b/i);
  });
});
