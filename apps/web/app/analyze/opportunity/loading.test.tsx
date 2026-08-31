// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import OpportunityLoading from "./loading";

describe("OpportunityLoading", () => {
  it("names the page that is loading", () => {
    render(<OpportunityLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading Opportunity Explorer");
    expect(screen.queryByText(/Food Equity Atlas/)).not.toBeInTheDocument();
  });
});
