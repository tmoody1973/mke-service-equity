// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it} from "vitest";

import {ComparisonEvidence} from "./comparison-evidence";
import {
  completeComparisonTract,
  makeComparison,
  observedMeasurement,
} from "./comparison-test-fixture";

describe("ComparisonEvidence", () => {
  it("groups all 13 Equity indicators and keeps every metric's evidence within one interaction", async () => {
    const user = userEvent.setup();
    const comparison = makeComparison([
      completeComparisonTract({
        geoid: "55079000101",
        index: 0,
        name: "Census Tract 1.01",
        metricOverrides: {
          housing_cost_burden: {
            measurement: observedMeasurement({reliability: "use_with_caution", value: 61.3}),
          },
        },
      }),
      completeComparisonTract({geoid: "55079000200", index: 1, name: "Census Tract 2"}),
    ]);

    render(<ComparisonEvidence comparison={comparison} />);

    expect(screen.getByRole("heading", {name: "Food access measure details"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Demographic and structural indicators"}))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Socioeconomic indicators"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Health indicators"})).toBeInTheDocument();
    expect(screen.getAllByRole("button", {name: /View evidence for/i})).toHaveLength(17);

    await user.click(screen.getByRole("button", {name: /View evidence for Housing cost burden/i}));

    expect(screen.getByText(/Approved definition for Housing cost burden/)).toBeInTheDocument();
    expect(screen.getAllByText(/Data year: 2024 ACS 5-year/).length).toBeGreaterThan(0);
    expect(screen.getByText("Use with caution")).toBeInTheDocument();
    expect(screen.getByText(/Likely range \(Census 90% confidence\): 56.3% to 66.3%/i))
      .toBeInTheDocument();
    expect(screen.getAllByText(/Approved limitation for Housing cost burden/)).toHaveLength(2);
    expect(screen.getAllByRole("link", {name: "View source data"}).length).toBeGreaterThan(0);
  });
});
