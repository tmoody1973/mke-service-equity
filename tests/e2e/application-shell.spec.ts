import {expect, test, type Page} from "@playwright/test";
import {mkdir} from "node:fs/promises";
import path from "node:path";

import {isKnownHeroUiReactAriaDevHydrationWarning} from "./browser-errors";

const validatedPreview = process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
  && Boolean(process.env.MKE_ATLAS_PREVIEW_RUN_ID);
const runtimeDatabaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

function observeBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    // HeroUI Pro's React Aria IDs differ only under Next's development renderer.
    // Public production-mode coverage continues to reject every console error.
    if (message.type() === "error" && !isKnownHeroUiReactAriaDevHydrationWarning(text)) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  return errors;
}

test("renders and operates the shell at the configured width", async ({page}, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const width = testInfo.project.use.viewport?.width ?? 0;
  const isMobile = width <= 768;

  await page.goto("/");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  const skipLink = page.getByRole("link", {name: "Skip to the Food Equity Atlas"});
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  const mapWorkspace = page.getByRole("region", {name: "Map workspace"});
  const mapContainer = page.locator("[data-map-container]");
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  const originalCanvas = await canvas.elementHandle();
  await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).toBeVisible();
  await expect(attribution).toBeInViewport();
  await expect(attribution).toContainText("MapLibre GL JS");
  if (validatedPreview) {
    await expect(
      page.getByText("Preview only — checked, but not published.", {exact: true}),
    ).toBeVisible();
  } else if (!runtimeDatabaseConfigured) {
    await expect(
      page.getByText(
        "The Food Equity Atlas is temporarily unavailable. Please try again later.",
        {exact: true},
      ),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText("No published Food Equity results are available yet.", {exact: true}),
    ).toBeVisible();
  }

  const mapWorkspaceBox = await mapWorkspace.boundingBox();
  const mapContainerBox = await mapContainer.boundingBox();
  expect(mapContainerBox?.height).toBeGreaterThanOrEqual((mapWorkspaceBox?.height ?? 0) - 1);

  const desktopSidebar = page.getByRole("complementary", {name: "Application navigation"});
  const openNavigation = page.getByRole("button", {name: "Open navigation"});

  if (isMobile) {
    await expect(desktopSidebar).toBeHidden();
    await expect(openNavigation).toBeVisible();
    await expect(page.getByRole("main").locator("header").getByText("Food Equity Atlas")).toBeVisible();

    await openNavigation.click();
    const sheet = page.locator(".sidebar__mobile-sheet");
    await expect(sheet).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.width).toBeCloseTo(Math.min(width * 0.8, 500), 0);

    const primaryNavigation = page.locator('nav[aria-label="Primary"]:visible');
    const menu = primaryNavigation.getByRole("treegrid", {name: "Explore"});
    const atlas = primaryNavigation.getByRole("row", {name: "Atlas"});
    await expect(menu).toBeVisible();
    await expect(atlas).toHaveAttribute("data-current", "true");
    await expect(atlas.getByRole("gridcell", {name: /Atlas.*Current page/i})).toBeVisible();
    await atlas.focus();
    await expect(atlas).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(openNavigation).toBeFocused();

    await openNavigation.click();
    await page.getByRole("button", {name: "Close navigation"}).click();
    await expect(sheet).toBeHidden();
    await expect(openNavigation).toBeFocused();

    await openNavigation.click();
    await page
      .locator('nav[aria-label="Primary"]:visible')
      .getByRole("row", {name: "Atlas"})
      .press("Enter");
    await expect(sheet).toBeHidden();
    await expect(canvas).toHaveCount(1);
    const currentCanvas = await canvas.elementHandle();
    expect(
      await originalCanvas?.evaluate((node, current) => node === current, currentCanvas),
    ).toBe(true);
  } else {
    await expect(desktopSidebar).toBeVisible();
    await expect(openNavigation).toBeHidden();
    await expect(page.getByRole("main").locator("header")).toBeHidden();
    await expect(page.locator(".sidebar__mobile-sheet")).toHaveCount(0);

    const sidebarBox = await desktopSidebar.boundingBox();
    expect(sidebarBox?.width).toBeCloseTo(240, 0);
    const atlas = desktopSidebar.getByRole("row", {name: "Atlas"});
    await expect(atlas).toHaveAttribute("data-current", "true");
    await expect(atlas.getByRole("gridcell", {name: /Atlas.*Current page/i})).toBeVisible();
  }

  const screenshotDirectory = path.join("artifacts", "plan-1");
  await mkdir(screenshotDirectory, {recursive: true});
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDirectory, `${testInfo.project.name}.png`),
  });

  expect(browserErrors).toEqual([]);
});
