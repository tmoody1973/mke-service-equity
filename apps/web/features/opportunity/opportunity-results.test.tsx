// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import {OPPORTUNITY_RESPONSE} from "./opportunity-test-fixture";
import {OpportunityResults} from "./opportunity-results";

describe("OpportunityResults", () => {
  it("renders the complete server-returned matching set as a semantic list", () => {
    render(
      <OpportunityResults
        onSelect={vi.fn()}
        response={OPPORTUNITY_RESPONSE}
        selectedGeoid={null}
      />,
    );

    const list = screen.getByRole("list", {name: "Matching areas"});
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", {name: /Census Tract 1.01/})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: /Census Tract 2.01/})).toBeInTheDocument();
    expect(screen.queryByText("Census Tract 3.01")).not.toBeInTheDocument();
  });

  it("selects a matching tract without implying a rank", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <OpportunityResults
        onSelect={onSelect}
        response={OPPORTUNITY_RESPONSE}
        selectedGeoid={null}
      />,
    );

    await user.click(screen.getByRole("button", {name: /Census Tract 2.01/}));

    expect(onSelect).toHaveBeenCalledWith("55079000201");
    expect(screen.getByText(/Results use Census tract order/)).toBeInTheDocument();
  });

  it("explains matching counts and known population in plain language", () => {
    render(
      <OpportunityResults
        onSelect={vi.fn()}
        response={OPPORTUNITY_RESPONSE}
        selectedGeoid={null}
      />,
    );

    expect(screen.getByText("2 matching census tracts")).toBeInTheDocument();
    expect(screen.getByText(
      "4,300 people live in matching tracts with known population.",
    )).toBeInTheDocument();
    expect(screen.queryByText(/affected population/i)).not.toBeInTheDocument();
  });

  it("separates matching tracts with unavailable population from filter exclusions", () => {
    const response = {
      ...OPPORTUNITY_RESPONSE,
      summary: {
        ...OPPORTUNITY_RESPONSE.summary,
        matchingTractsMissingPopulation: 1,
        excludedForMissingFilterData: 3,
      },
      matchingAreas: OPPORTUNITY_RESPONSE.matchingAreas.map((area, index) => (
        index === 1 ? {...area, tract: {...area.tract, population: null}} : area
      )),
    };

    render(
      <OpportunityResults onSelect={vi.fn()} response={response} selectedGeoid={null} />,
    );

    expect(screen.getByText(
      "1 matching census tract has population data unavailable and is not included in the people total.",
    )).toBeInTheDocument();
    expect(screen.getByText(
      "3 other census tracts were left out because a value required by the filters was missing.",
    )).toBeInTheDocument();
    expect(screen.getByText(
      "This missing-data count does not include tracts that had values and did not match.",
    )).toBeInTheDocument();
  });

  it("uses singular matching-area language and explains the unfiltered state", () => {
    const response = {
      ...OPPORTUNITY_RESPONSE,
      summary: {
        ...OPPORTUNITY_RESPONSE.summary,
        matchingTractCount: 1,
        knownPopulationLivingInMatchingTracts: 2_430,
      },
      matchingAreas: OPPORTUNITY_RESPONSE.matchingAreas.slice(0, 1),
    };

    render(
      <OpportunityResults onSelect={vi.fn()} response={response} selectedGeoid={null} />,
    );

    expect(screen.getByText("1 matching census tract")).toBeInTheDocument();
    expect(screen.getByText(
      "No filters are applied. Add conditions to narrow the matching areas.",
    )).toBeInTheDocument();
  });

  it("gives a short recovery step when no areas match", () => {
    const response = {
      ...OPPORTUNITY_RESPONSE,
      filters: {...OPPORTUNITY_RESPONSE.filters, priorities: [1 as const]},
      summary: {
        matchingTractCount: 0,
        knownPopulationLivingInMatchingTracts: 0,
        matchingTractsMissingPopulation: 0,
        excludedForMissingFilterData: 0,
      },
      matchingAreas: [],
    };

    render(
      <OpportunityResults onSelect={vi.fn()} response={response} selectedGeoid={null} />,
    );

    expect(screen.getByText("0 matching census tracts")).toBeInTheDocument();
    expect(screen.getByText(
      "No Census tracts match every applied condition. Remove a condition or clear the filters to see more areas.",
    )).toBeInTheDocument();
  });
});
