// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {AtlasDataState} from "./atlas-data-state";

describe("AtlasDataState", () => {
  it("explains that a public run is not published", () => {
    render(<AtlasDataState response={{state: "unavailable", reason: "no_published_run"}} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No published Food Equity results are available yet.",
    );
  });

  it("labels validated preview data as not published", () => {
    render(<AtlasDataState response={{
      state: "available",
      mode: "validated_preview",
      run: {
        id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
        methodologyVersion: "food-equity-v1",
        equityBaselineMethodologyVersion: "equity-baseline-v1",
        completedAt: "2026-08-30T12:00:00.000Z",
        dataVintages: {acs: "2020-2024"},
      },
      tracts: {type: "FeatureCollection", features: []} as never,
      contextLayers: {
        foodSites: {state: "unavailable", reason: "snapshot_not_configured"},
      },
    }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preview only — checked, but not published.",
    );
  });

  it("uses safe copy for internal data failures", () => {
    render(<AtlasDataState response={{state: "unavailable", reason: "data_incomplete"}} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The Food Equity Atlas is temporarily unavailable. Please try again later.",
    );
    expect(screen.queryByText(/database|postgres|storage/i)).not.toBeInTheDocument();
  });
});
