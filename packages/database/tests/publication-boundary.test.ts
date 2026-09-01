import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

describe("publication capability boundary", () => {
  it("keeps mutation modules out of the public server export", async () => {
    const serverSource = await readFile(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );
    const packageManifest = JSON.parse(await readFile(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as {exports?: Record<string, string>};

    expect(serverSource).toContain("selectAtlasRun");
    expect(serverSource).not.toMatch(/publishAtlasRelease|withdrawAtlasRelease|publication\/cli/);
    expect(packageManifest.exports).toEqual({"./server": "./src/server.ts"});
  });
});
