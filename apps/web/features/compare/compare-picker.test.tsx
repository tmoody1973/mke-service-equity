// @vitest-environment jsdom

import {act, fireEvent, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: navigation.push}),
}));

import {ComparePicker} from "./compare-picker";

describe("ComparePicker", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("adds a searched tract in insertion order and preserves unrelated URL parameters", async () => {
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
    render(
      <ComparePicker
        currentSearchParams="utm_source=partner&tract=55079000101"
        selectedTracts={[{geoid: "55079000101", name: "Census Tract 1.01"}]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}), {
      target: {value: "Northridge"},
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", {name: /Northridge.*Census Tract 1857/i}));

    expect(navigation.push).toHaveBeenCalledWith(
      "/analyze/compare?utm_source=partner&tract=55079000101&tract=55079185700",
      {scroll: false},
    );
  });

  it("removes one tract without changing the remaining order", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <ComparePicker
        currentSearchParams="campaign=summer&tract=55079000101&tract=55079000200&tract=55079000300"
        selectedTracts={[
          {geoid: "55079000101", name: "Census Tract 1.01"},
          {geoid: "55079000200", name: "Census Tract 2"},
          {geoid: "55079000300", name: "Census Tract 3"},
        ]}
      />,
    );

    await user.click(screen.getByRole("button", {name: "Remove Census Tract 2"}));

    expect(navigation.push).toHaveBeenCalledWith(
      "/analyze/compare?campaign=summer&tract=55079000101&tract=55079000300",
      {scroll: false},
    );
  });

  it("disables duplicate search results and stops adding at five tracts", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({
        state: "available",
        query: "55079000101",
        neighborhoodReferenceStatus: "available",
        results: [{
          id: "tract:55079000101",
          kind: "tract",
          geoid: "55079000101",
          title: "Census Tract 1.01",
          subtitle: "Census tract ID 55079000101",
        }],
      }),
    })));
    const {rerender} = render(
      <ComparePicker
        currentSearchParams="tract=55079000101"
        selectedTracts={[{geoid: "55079000101", name: "Census Tract 1.01"}]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", {name: "Find a tract or neighborhood"}), {
      target: {value: "55079000101"},
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", {name: /Census Tract 1.01.*Already selected/i}))
      .toBeDisabled();

    rerender(
      <ComparePicker
        currentSearchParams="tract=55079000101&tract=55079000200&tract=55079000300&tract=55079000400&tract=55079000500"
        selectedTracts={[
          {geoid: "55079000101", name: "Census Tract 1.01"},
          {geoid: "55079000200", name: "Census Tract 2"},
          {geoid: "55079000300", name: "Census Tract 3"},
          {geoid: "55079000400", name: "Census Tract 4"},
          {geoid: "55079000500", name: "Census Tract 5"},
        ]}
      />,
    );

    const picker = screen.getByRole("region", {name: "Choose comparison areas"});
    expect(within(picker).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(picker).getByRole("status")).toHaveTextContent(
      "maximum of five areas",
    );
  });
});
