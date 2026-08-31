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
});
