// @vitest-environment jsdom

import {act, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AtlasSearch} from "./atlas-search";

describe("AtlasSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for two characters and explains the currently supported authorities", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AtlasSearch onSelect={vi.fn()} />);

    expect(screen.getByText(/ZIP and address search are not available yet/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}), {
      target: {value: "n"},
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Enter at least 2 characters");
  });

  it("shows tract-resolved neighborhood results and selects the canonical GEOID", async () => {
    const onSelect = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({
        state: "available",
        query: "Northridge",
        neighborhoodReferenceStatus: "available",
        results: [{
          id: "neighborhood:117:55079185700",
          kind: "neighborhood",
          geoid: "55079185700",
          title: "Northridge",
          subtitle: "Census Tract 1857 · 42.8% of its City-covered area",
          sourceNeighborhoodId: 117,
          coveredAreaShare: 0.428,
        }],
      }),
    })));
    render(<AtlasSearch onSelect={onSelect} />);

    fireEvent.change(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}), {
      target: {value: "Northridge"},
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("status")).toHaveTextContent("1 result");
    fireEvent.click(screen.getByRole("button", {name: /Northridge.*Census Tract 1857/i}));
    expect(onSelect).toHaveBeenCalledWith("55079185700");
  });

  it("shows a plain no-result state without inventing a location", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({
        state: "available",
        query: "Nowhere",
        neighborhoodReferenceStatus: "available",
        results: [],
      }),
    })));
    render(<AtlasSearch onSelect={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}), {
      target: {value: "Nowhere"},
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching census tracts or City neighborhoods",
    );
  });

  it("says when the exact neighborhood reference is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({
        state: "available",
        query: "Northridge",
        neighborhoodReferenceStatus: "unavailable",
        results: [],
      }),
    })));
    render(<AtlasSearch onSelect={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}), {
      target: {value: "Northridge"},
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("status")).toHaveTextContent(
      "City neighborhood search is unavailable for this data version",
    );
  });
});
