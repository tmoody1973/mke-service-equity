// @vitest-environment jsdom

import type {AtlasEvidenceItem, AtlasTractProfile} from "@mke/contracts";
import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {TractProfileContent} from "./profile-content";

const source = {
  sourceName: "American Community Survey 5-year estimates",
  publisher: "U.S. Census Bureau",
  datasetVersion: "2024 ACS 5-year",
  sourceUrl: "https://api.census.gov/data/2024/acs/acs5",
  retrievedAt: "2026-08-29T12:00:00.000Z",
  validFrom: null,
  validTo: null,
  methodologyUrl: "https://www.census.gov/programs-surveys/acs/methodology.html",
  limitation: null,
} as const;

function evidence(slug: string, name: string, index: number): AtlasEvidenceItem {
  const isCautionExample = slug === "housing_cost_burden";
  const value = isCautionExample ? 61.3 : 25 + index;
  const marginOfError = isCautionExample ? 22.5 : 1.5;
  return {
    slug,
    name,
    definition: slug === "limited_english_proficiency"
      ? "Share of people age 5 and older who report speaking English less than ‘very well.’ This measures English-language access, not literacy."
      : isCautionExample
        ? name
      : "A scored tract measure.",
    domain: index < 3 ? "demographic" : "socioeconomic",
    dataYear: "2024 ACS 5-year",
    measurement: {
      state: "observed",
      value,
      unit: "percent",
      qualityStatus: "verified",
      marginOfError,
      confidenceLow: Math.max(0, value - marginOfError),
      confidenceHigh: Math.min(100, value + marginOfError),
      confidenceLevel: 90,
      reliability: isCautionExample ? "use_with_caution" : "reliable",
    },
    countyPercentile: 80 - index,
    effectiveWeight: 0.1,
    contribution: 3 - (index / 10),
    higherIsWorse: true,
    provenance: [source],
    nearestResource: null,
    limitation: slug === "limited_english_proficiency"
      ? "This measure is about English-speaking access. It does not measure literacy."
      : null,
  };
}

const equityDrivers = Array.from({length: 13}, (_, index) => evidence(
  index === 0
    ? "limited_english_proficiency"
    : index === 3
      ? "housing_cost_burden"
      : `equity-${index}`,
  index === 0
    ? "Speaks English less than ‘very well,’ age 5+"
    : index === 3
      ? "Housing cost burden"
      : `Equity measure ${index}`,
  index,
));

const profile: AtlasTractProfile = {
  runId: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
  tract: {
    geoid: "55079000101",
    name: "Census Tract 1.01",
    population: 2_430,
    geographyVintage: "2020 TIGER/Line",
    foodEquityPriority: 1,
    foodAccessNeedBand: "very_high",
    equityBaselineBand: "high",
    qualityStatus: "complete",
    exclusionReasons: [],
  },
  explanation: "Priority 1 is based on very high Food Access Need and a high Equity Baseline.",
  scores: {
    foodAccessNeedPercentile: 84,
    equityBaselinePercentile: 74,
    retailAccessScore: 80,
    transportationConstraintScore: 70,
  },
  foodComponents: Array.from({length: 4}, (_, index) => evidence(
    `food-${index}`,
    `Food measure ${index}`,
    index,
  )),
  equityDrivers,
  neighborhoodContext: {state: "unavailable", reason: "snapshot_not_configured"},
  context: {state: "unavailable", reason: "not_pinned_to_run"},
  provenance: [source],
  limitations: ["Tract measures do not describe every person."],
};

describe("TractProfileContent", () => {
  it("explains the score, English-language measure, uncertainty, context, and provenance plainly", () => {
    render(<TractProfileContent idPrefix="test" profile={profile} />);

    expect(screen.getByRole("heading", {name: "What this means"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Why this result"})).toBeInTheDocument();
    expect(screen.getByText("Speaks English less than ‘very well,’ age 5+")).toBeInTheDocument();
    expect(screen.getAllByText(/does not measure literacy/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Effect on Equity Baseline:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Effect on Food Access Need:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/County comparison: .* percentile/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verified data").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Margin of error: plus or minus/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Use with caution")).toBeInTheDocument();
    expect(screen.getAllByText("Housing cost burden")).toHaveLength(1);
    expect(screen.getByText(/Likely range \(Census 90% confidence\): 38.8% to 83.8%/i))
      .toBeInTheDocument();
    expect(screen.getByText(/county percentile uses the estimate above/i)).toBeInTheDocument();
    expect(screen.getByText(/compare nearby tracts and confirm with local data and residents/i))
      .toBeInTheDocument();
    expect(screen.getByText(/This does not mean the tract has no resources/i))
      .toBeInTheDocument();
    expect(screen.getByText("American Community Survey 5-year estimates")).toBeInTheDocument();
  });

  it("hands the selected tract to Compare without putting score values in the URL", () => {
    render(<TractProfileContent idPrefix="test" profile={profile} />);

    const compareLink = screen.getByRole("link", {name: "Compare this tract"});
    expect(compareLink).toHaveAttribute(
      "href",
      "/analyze/compare?tract=55079000101",
    );
    expect(compareLink.getAttribute("href")).not.toMatch(/score|priority|percentile|run/i);
  });

  it("explains reportable neighborhood overlaps as area context", () => {
    render(<TractProfileContent
      idPrefix="test"
      profile={{
        ...profile,
        neighborhoodContext: {
          state: "available",
          labelKind: "spans",
          cityReferenceCoverage: 0.999,
          overlaps: [
            {sourceNeighborhoodId: 1, name: "NORTHRIDGE", coveredAreaShare: 0.428},
            {sourceNeighborhoodId: 2, name: "NORTHRIDGE LAKES", coveredAreaShare: 0.334},
          ],
          otherBoundarySliversShare: 0.008,
          source,
          limitation: "This is a City-published reference, not an official boundary.",
        },
      }}
    />);

    expect(screen.getByText(/spans NORTHRIDGE, NORTHRIDGE LAKES/i)).toBeInTheDocument();
    expect(screen.getByText(/NORTHRIDGE: 42.8% of the covered area/i)).toBeInTheDocument();
    expect(screen.getByText(/Other boundary slivers: 0.8%/i)).toBeInTheDocument();
    expect(screen.getByText(/not an official boundary/i)).toBeInTheDocument();
  });

  it.each([
    ["high_uncertainty", "High uncertainty", /Do not use this measure by itself/i],
    ["cv_not_computable", "Reliability unclear", /usual reliability check cannot be calculated/i],
  ] as const)("explains the %s survey state without relying on color", (state, label, explanation) => {
    render(<TractProfileContent
      idPrefix="test"
      profile={{
        ...profile,
        equityDrivers: profile.equityDrivers.map((item, index) => index === 0
          ? {
              ...item,
              measurement: item.measurement.state === "observed"
                ? {...item.measurement, reliability: state}
                : item.measurement,
            }
          : item),
      }}
    />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(explanation)).toBeInTheDocument();
  });
});
