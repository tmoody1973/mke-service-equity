// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {parseCompareUrlState} from "./compare-url-state";
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
    expect(screen.getByRole("status")).toHaveTextContent("Validated preview — not published");
    expect(screen.getByRole("heading", {level: 2, name: "Add one more area"}))
      .toBeInTheDocument();
    expect(screen.getByText(/Census tract ID 55079000101 is selected/)).toBeInTheDocument();
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
});
