import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import {ApplicationShell} from "./application-shell";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({push: vi.fn()}),
}));

function setViewport(width: number) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: query === "(max-width: 768px)" ? width <= 768 : false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  }));

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });

  return matchMedia;
}

describe("ApplicationShell", () => {
  it("provides one landmark hierarchy with grouped Explore and Analyze navigation", () => {
    pathname = "/";
    setViewport(1024);

    render(<ApplicationShell><p>Workspace content</p></ApplicationShell>);

    expect(screen.getByRole("link", {name: "Skip to the Food Equity Atlas"})).toHaveAttribute(
      "href",
      "#map-workspace",
    );
    const navigation = screen.getByRole("navigation", {name: "Primary"});
    expect(navigation).toBeInTheDocument();
    expect(screen.getAllByText("MKE Service Equity").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "map-workspace");
    expect(within(navigation).getByRole("tree", {name: "Explore"})).toBeInTheDocument();
    expect(within(navigation).getByRole("tree", {name: "Analyze"})).toBeInTheDocument();
    const atlasItem = within(navigation).getByRole("treeitem", {name: /Atlas.*Current page/i});
    expect(atlasItem).toHaveAttribute("href", "/");
    expect(atlasItem).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("treeitem", {name: "Compare Areas"})).toHaveAttribute(
      "href",
      "/analyze/compare",
    );
    expect(within(navigation).getByRole("treeitem", {name: "Opportunity Explorer"}))
      .toHaveAttribute("href", "/analyze/opportunity");
    expect(within(navigation).getByRole("treeitem", {name: "Download data"}))
      .toHaveAttribute("href", "/data");
  });

  it("derives the current item and route-specific shell labels from the pathname", () => {
    pathname = "/analyze/compare";
    setViewport(1024);

    render(
      <ApplicationShell
        mainId="compare-workspace"
        pageTitle="Compare Areas"
        skipLinkLabel="Skip to Compare Areas"
      >
        <p>Comparison content</p>
      </ApplicationShell>,
    );

    expect(screen.getByRole("link", {name: "Skip to Compare Areas"})).toHaveAttribute(
      "href",
      "#compare-workspace",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "compare-workspace");
    expect(screen.getByText("Compare Areas", {selector: "p"})).toBeInTheDocument();
    expect(screen.getByRole("treeitem", {name: /Compare Areas.*Current page/i}))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("treeitem", {name: "Atlas"})).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks Opportunity Explorer as the one current page on its route", () => {
    pathname = "/analyze/opportunity";
    setViewport(1024);

    render(
      <ApplicationShell
        mainId="opportunity-workspace"
        pageTitle="Opportunity Explorer"
        skipLinkLabel="Skip to Opportunity Explorer"
      >
        <p>Opportunity content</p>
      </ApplicationShell>,
    );

    const currentItems = screen.getAllByRole("treeitem").filter(
      (item) => item.getAttribute("aria-current") === "page",
    );
    expect(currentItems).toHaveLength(1);
    expect(currentItems[0]).toHaveAccessibleName(/Opportunity Explorer.*Current page/i);
    expect(currentItems[0]).toHaveClass("min-h-11");
  });

  it("opens and closes mobile navigation at the 768px boundary and returns focus", async () => {
    pathname = "/";
    const user = userEvent.setup();
    const matchMedia = setViewport(768);

    render(<ApplicationShell><p>Workspace content</p></ApplicationShell>);

    const openNavigation = screen.getByRole("button", {name: "Open navigation"});
    await user.click(openNavigation);
    const mobileNavigation = screen.getByRole("navigation", {name: "Primary"});
    expect(mobileNavigation).toBeVisible();

    await user.click(screen.getByRole("button", {name: "Close navigation"}));
    expect(screen.queryByRole("navigation", {name: "Primary"})).not.toBeInTheDocument();
    expect(openNavigation).toHaveFocus();
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
  });

  it("keeps the desktop sidebar persistent above the 768px boundary", () => {
    pathname = "/";
    const matchMedia = setViewport(769);

    render(<ApplicationShell><p>Workspace content</p></ApplicationShell>);

    expect(screen.getByRole("complementary")).toHaveAttribute("data-collapsible", "offcanvas");
    expect(screen.getByRole("navigation", {name: "Primary"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Close navigation"})).not.toBeInTheDocument();
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
  });
});
