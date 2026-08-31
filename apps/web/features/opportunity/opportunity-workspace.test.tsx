// @vitest-environment jsdom

import {render, screen, within} from "@testing-library/react";
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
    expect(screen.getAllByRole("complementary", {name: /Evidence for Census Tract 2.01/}))
      .toHaveLength(2);

    await user.click(screen.getByRole("button", {name: "Select first map tract"}));
    expect(screen.getAllByRole("complementary", {name: /Evidence for Census Tract 1.01/}))
      .toHaveLength(2);

    await user.click(screen.getByRole("button", {name: "Select non-match map tract"}));
    expect(screen.getAllByRole("complementary", {name: /Evidence for Census Tract 1.01/}))
      .toHaveLength(2);
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
    expect(screen.getAllByRole("complementary", {name: /Evidence for Census Tract 2.01/}))
      .toHaveLength(2);

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
    expect(screen.queryAllByRole("complementary", {name: /Evidence for/})).toHaveLength(0);

    rerender(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );
    expect(screen.queryAllByRole("complementary", {name: /Evidence for/})).toHaveLength(0);
  });

  it("keeps one map in a coordinated wide workspace and exposes mobile sheet triggers", () => {
    render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    expect(screen.getAllByTestId("opportunity-map")).toHaveLength(1);
    expect(screen.getByTestId("opportunity-wide-workspace").className)
      .toContain("lg:grid-cols-");
    expect(screen.getByRole("complementary", {name: "Opportunity filters"}))
      .toBeInTheDocument();
    expect(screen.getByRole("complementary", {
      name: "Matching areas and selected-area evidence",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Open filters"})).toHaveClass("min-h-11");
    expect(screen.getByRole("button", {name: "Open 2 matching areas"})).toHaveClass("min-h-11");
  });

  it("preserves a draft when the filter sheet closes and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    const trigger = screen.getByRole("button", {name: "Open filters"});
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {name: "Choose conditions"});
    expect(dialog).toHaveFocus();

    const field = within(dialog).getByRole("spinbutton", {
      name: "Households with no vehicle available",
    });
    await user.type(field, "25");
    await user.click(within(dialog).getByRole("button", {name: "Close filters"}));
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(within(screen.getByRole("dialog", {name: "Choose conditions"})).getByRole(
      "spinbutton",
      {name: "Households with no vehicle available"},
    )).toHaveValue(25);
  });

  it("closes a sheet with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    const trigger = screen.getByRole("button", {name: "Open filters"});
    await user.click(trigger);
    expect(screen.getByRole("dialog", {name: "Choose conditions"})).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", {name: "Choose conditions"}))
      .not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens matching areas in a sheet and keeps row, map, and profile selection together", async () => {
    const user = userEvent.setup();
    render(
      <OpportunityWorkspace
        currentSearchParams=""
        response={OPPORTUNITY_RESPONSE}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    const trigger = screen.getByRole("button", {name: "Open 2 matching areas"});
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {name: "Matching areas"});
    await user.click(within(dialog).getByRole("button", {name: /Census Tract 2.01/}));

    expect(screen.queryByRole("dialog", {name: "Matching areas"})).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId("opportunity-map")).toHaveAttribute(
      "data-selected-geoid",
      "55079000201",
    );
    expect(screen.getAllByRole("complementary", {name: /Evidence for Census Tract 2.01/}))
      .toHaveLength(2);
  });
});
