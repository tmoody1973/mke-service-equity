import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {DataPage} from "./data-page";

const available = {
  state: "available" as const,
  publication: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    publishedAt: "2026-09-02T12:00:00.000Z",
    bundleFingerprint: "a".repeat(64),
  },
  tractCount: 302 as const,
};

describe("DataPage", () => {
  it("explains the complete public file before offering its download", () => {
    render(<DataPage availability={available} />);

    expect(screen.getByRole("heading", {name: "Download data"})).toBeInTheDocument();
    expect(screen.getByText(/all 302 Milwaukee County Census tracts/i)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: /download all tract data/i}))
      .toHaveAttribute("href", "/api/exports/tract-evidence.csv");
    expect(screen.getByText(/missing is not the same as zero/i)).toBeInTheDocument();
    expect(screen.getByText(/neighborhood names describe area overlap/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "What each column means"})).toBeInTheDocument();
  });

  it("does not offer a download when no safe public file exists", () => {
    render(<DataPage availability={{state: "unavailable", reason: "no_published_run"}} />);

    expect(screen.getByText(/no public data file is available yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", {name: /download all tract data/i})).not.toBeInTheDocument();
  });
});
