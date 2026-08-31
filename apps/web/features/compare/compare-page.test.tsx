// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn()}),
}));
import {parseCompareUrlState} from "./compare-url-state";
import {makeComparison} from "./comparison-test-fixture";
import {ComparePage} from "./compare-page";

describe("ComparePage", () => {
  it("renders an honest one-tract setup state in validated preview", () => {
    render(
      <ComparePage
        availability={{state: "available", mode: "validated_preview"}}
        comparison={null}
        urlState={parseCompareUrlState(new URLSearchParams("tract=55079000101"))}
      />,
    );

    expect(screen.getByRole("heading", {level: 1, name: "Compare Areas"})).toBeInTheDocument();
    expect(screen.getByText("Validated preview — not published")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("heading", {level: 2, name: "Add one more area"}))
      .toBeInTheDocument();
    expect(screen.getByText(/Census tract ID 55079000101 is selected/)).toBeInTheDocument();
    expect(screen.getByRole("region", {name: "Choose comparison areas"})).toBeInTheDocument();
    expect(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}))
      .toBeInTheDocument();
  });

  it("fails closed when no public release exists", () => {
    render(
      <ComparePage
        availability={{state: "unavailable", reason: "no_published_run"}}
        comparison={null}
        urlState={parseCompareUrlState(new URLSearchParams())}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "No published Food Equity results yet",
    );
    expect(screen.queryByText(/validated preview/i)).not.toBeInTheDocument();
  });

  it("rejects an invalid URL with a tract-free recovery link", () => {
    render(
      <ComparePage
        availability={null}
        comparison={null}
        urlState={parseCompareUrlState(new URLSearchParams(
          "utm_source=partner&tract=55079000101&tract=55079000101",
        ))}
      />,
    );

    expect(screen.getByRole("heading", {level: 2, name: "This comparison link is not valid"}))
      .toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Start a new comparison"})).toHaveAttribute(
      "href",
      "/analyze/compare?utm_source=partner",
    );
  });

  it("puts the responsive comparison summary before the directly reachable Differences view", () => {
    render(
      <ComparePage
        availability={{state: "available", mode: "validated_preview"}}
        comparison={makeComparison()}
        urlState={parseCompareUrlState(new URLSearchParams(
          "tract=55079000101&tract=55079000200",
        ))}
      />,
    );

    const summaryHeading = screen.getByRole("heading", {name: "Comparison summary"});
    const differencesHeading = screen.getByRole("heading", {name: "Differences"});
    expect(summaryHeading.compareDocumentPosition(differencesHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(document.querySelector('[data-comparison-layout="desktop"]'))
      .toHaveClass("hidden", "lg:block");
    expect(document.querySelector('[data-comparison-layout="mobile"]'))
      .toHaveClass("lg:hidden");
  });

  it.each([
    ["invalid_request", "This analysis link is not valid"],
    ["unknown_tract", "One area is not available"],
    ["comparison_incomplete", "Analysis temporarily unavailable"],
  ] as const)("renders the %s comparison failure without partial evidence", (reason, title) => {
    render(
      <ComparePage
        availability={{state: "available", mode: "validated_preview"}}
        comparison={{state: "unavailable", reason}}
        urlState={parseCompareUrlState(new URLSearchParams(
          "tract=55079000101&tract=55079000200",
        ))}
      />,
    );

    expect(screen.getByRole("heading", {name: title})).toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "Comparison summary"})).not.toBeInTheDocument();
  });
});
