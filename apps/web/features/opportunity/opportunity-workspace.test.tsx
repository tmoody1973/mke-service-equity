// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn()}),
}));

vi.mock("../atlas/profile/use-tract-profile", () => ({
  useTractProfile: (geoid: string | null, expectedRunId: string | null) => ({
    isLoading: false,
    response: null,
    testKey: `${expectedRunId}:${geoid}`,
  }),
}));

vi.mock("./opportunity-map", () => ({
  OpportunityMap: (props: {
    matchingGeoids: ReadonlyArray<string>;
    onSelect: (geoid: string) => void;
    selectedGeoid: string | null;
  }) => (
    <div
      data-testid="opportunity-map"
      data-matching-geoids={props.matchingGeoids.join(",")}
      data-selected-geoid={props.selectedGeoid ?? ""}
    >
      <button onClick={() => props.onSelect("55079000101")}>Select first map tract</button>
      <button onClick={() => props.onSelect("55079000301")}>Select non-match map tract</button>
    </div>
  ),
}));

import {OpportunityWorkspace} from "./opportunity-workspace";
import {OPPORTUNITY_RESPONSE, OPPORTUNITY_TRACTS} from "./opportunity-test-fixture";

describe("OpportunityWorkspace", () => {
  it("drives the semantic list and map from the exact same server result set", () => {
    render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    expect(screen.getByTestId("opportunity-map")).toHaveAttribute(
      "data-matching-geoids",
      "55079000101,55079000201",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("uses one shared selection for rows and polygons and ignores non-matching polygons", async () => {
    const user = userEvent.setup();
    render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    await user.click(screen.getByRole("button", {name: /Census Tract 2.01/}));
    expect(screen.getByTestId("opportunity-map")).toHaveAttribute(
      "data-selected-geoid",
      "55079000201",
    );
    expect(screen.getByRole("complementary", {name: /Evidence for Census Tract 2.01/}))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", {name: "Select first map tract"}));
    expect(screen.getByRole("complementary", {name: /Evidence for Census Tract 1.01/}))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", {name: "Select non-match map tract"}));
    expect(screen.getByRole("complementary", {name: /Evidence for Census Tract 1.01/}))
      .toBeInTheDocument();
  });

  it("does not revive a selection after filters remove it and history restores the result", async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    await user.click(screen.getByRole("button", {name: /Census Tract 2.01/}));
    expect(screen.getByRole("complementary", {name: /Evidence for Census Tract 2.01/}))
      .toBeInTheDocument();

    const oneMatch = {
      ...OPPORTUNITY_RESPONSE,
      summary: {
        ...OPPORTUNITY_RESPONSE.summary,
        matchingTractCount: 1,
        knownPopulationLivingInMatchingTracts: 2_430,
      },
      matchingAreas: OPPORTUNITY_RESPONSE.matchingAreas.slice(0, 1),
    };
    rerender(
      <OpportunityWorkspace
        currentSearchParams="priorities=1"
        response={oneMatch}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    rerender(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
