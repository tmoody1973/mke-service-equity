import {checkDatabaseHealth} from "@mke/database/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {GET} from "./route";

vi.mock("@mke/database/server", () => ({
  checkDatabaseHealth: vi.fn(),
}));

const checkDatabaseHealthMock = vi.mocked(checkDatabaseHealth);

describe("GET /api/health/database", () => {
  beforeEach(() => {
    checkDatabaseHealthMock.mockReset();
  });

  it("returns a validated healthy database contract with HTTP 200", async () => {
    const health = {
      status: "ok" as const,
      database: "reachable" as const,
      postgisVersion: "3.5 USE_GEOS=1 USE_PROJ=1",
    };
    checkDatabaseHealthMock.mockResolvedValue(health);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(health);
  });

  it("returns the exact sanitized error contract with HTTP 503", async () => {
    const health = {
      status: "error" as const,
      database: "unreachable" as const,
      postgisVersion: null,
    };
    checkDatabaseHealthMock.mockResolvedValue(health);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(health);
  });
});
