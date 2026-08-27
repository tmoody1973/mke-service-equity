import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const semanticTokens = [
  "--mke-canvas",
  "--mke-panel",
  "--mke-text",
  "--mke-muted",
  "--mke-accent",
  "--mke-focus",
  "--mke-radius-panel",
  "--mke-touch-target",
] as const;

describe("MKE semantic design tokens", () => {
  it("defines every project alias exactly once and preserves the touch target", async () => {
    const tokenPath = fileURLToPath(new URL("../src/tokens.css", import.meta.url));
    const css = await readFile(tokenPath, "utf8");

    for (const token of semanticTokens) {
      expect(css.match(new RegExp(`${token}:`, "g")), `${token} declaration count`).toHaveLength(1);
    }

    expect(css).toMatch(/--mke-touch-target:\s*44px\s*;/);
  });
});
