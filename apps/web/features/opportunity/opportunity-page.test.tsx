// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn()}),
}));
import {OpportunityPage} from "./opportunity-page";
import {parseOpportunityUrlState} from "./opportunity-url-state";

describe("OpportunityPage", () => {
  it("fails closed when no public release exists", () => {
    render(
      <OpportunityPage
        response={{state: "unavailable", reason: "no_published_run"}}
        styleUrl="/map-style.json"
        tracts={null}
        urlState={parseOpportunityUrlState(new URLSearchParams())}
      />,
    );

    expect(screen.getByRole("heading", {level: 1, name: "Opportunity Explorer"}))
      .toBeInTheDocument();
    expect(screen.getByText("No published Food Equity results yet")).toBeInTheDocument();
  });

  it("does not run or imply a partial search for invalid filter values", () => {
    render(
      <OpportunityPage
        response={null}
        styleUrl="/map-style.json"
        tracts={null}
        urlState={parseOpportunityUrlState(new URLSearchParams(
          "utm_source=partner&priorities=1&priorities=9",
        ))}
      />,
    );

    expect(screen.getByRole("heading", {level: 2, name: "Some filter settings are not valid"}))
      .toBeInTheDocument();
    expect(screen.getByText(/We did not run a partial search/)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Use the cleaned-up filters"})).toHaveAttribute(
      "href",
      "/analyze/opportunity?utm_source=partner&priorities=1",
    );
  });
});
