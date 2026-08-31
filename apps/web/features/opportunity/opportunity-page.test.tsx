// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {OpportunityPage} from "./opportunity-page";
import {parseOpportunityUrlState} from "./opportunity-url-state";

describe("OpportunityPage", () => {
  it("fails closed when no public release exists", () => {
    render(
      <OpportunityPage
        response={{state: "unavailable", reason: "no_published_run"}}
        urlState={parseOpportunityUrlState(new URLSearchParams())}
      />,
    );

    expect(screen.getByRole("heading", {level: 1, name: "Opportunity Explorer"}))
      .toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No published Food Equity results yet",
    );
  });

  it("does not run or imply a partial search for invalid filter values", () => {
    render(
      <OpportunityPage
        response={null}
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
