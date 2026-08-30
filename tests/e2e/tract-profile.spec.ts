import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";
import {mkdir} from "node:fs/promises";
import path from "node:path";

const previewRunId = process.env.MKE_ATLAS_PREVIEW_RUN_ID;

function observeBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    // The HeroUI Pro Sidebar emits this React Aria ID warning only under Next's dev renderer.
    // The production five-width suite still rejects every console error.
    if (message.type() === "error" && !text.startsWith("A tree hydrated")) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  return errors;
}

test("renders the plain-language tract profile at the configured width", async ({page}, testInfo) => {
  test.skip(!previewRunId, "Requires the explicit local validated-preview run.");

  const browserErrors = observeBrowserErrors(page);
  const width = testInfo.project.use.viewport?.width ?? 0;

  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto("/?tract=55079000101");

  if (width < 1280) {
    const detailsButton = page.getByRole("button", {name: "View tract details"});
    await expect(detailsButton).toBeVisible();
    const box = await detailsButton.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await detailsButton.click();
  }

  const profile = page.locator("[data-profile-tract='55079000101']:visible");
  await expect(profile).toBeVisible();
  await expect(profile.getByRole("heading", {name: "What this means"})).toBeVisible();
  await expect(profile.getByRole("heading", {name: "Where this tract is"})).toBeVisible();
  await expect(profile.getByRole("heading", {name: "Why this result"})).toBeVisible();
  await expect(profile.getByRole("heading", {name: "Food access evidence"})).toBeVisible();
  await expect(profile.getByRole("heading", {name: "Community context"})).toBeVisible();
  await expect(profile.getByRole("heading", {name: "Data quality"})).toBeVisible();
  await expect(profile.getByRole("heading", {name: "Data and sources"})).toBeVisible();
  await expect(profile.getByText("Speaks English less than ‘very well,’ age 5+", {exact: true})).toBeVisible();
  await expect(profile.getByText(/English-language access, not literacy/i)).toBeVisible();
  await expect(profile.getByText(/not raw percentages, changes over time, causes, or recommendations/i)).toBeVisible();
  await expect(profile.getByRole("heading", {name: "How to read Equity Baseline"}))
    .toBeVisible();
  await expect(profile.getByText(/13 measures covering income and housing costs/i))
    .toBeVisible();
  await expect(profile.getByText(/does not rate or judge the people who live here/i))
    .toBeVisible();
  await expect(profile.getByText(/spans NORTHRIDGE, NORTHRIDGE LAKES, RIDGEVIEW, HILLTOP PARISH/i))
    .toBeVisible();
  await expect(profile.getByText(/NORTHRIDGE: 42.8% of the covered area/i)).toBeVisible();
  await expect(profile.getByText(/not an official City or neighborhood-association boundary/i))
    .toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  const accessibilityScan = await new AxeBuilder({page})
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    accessibilityScan.violations.map(({id, impact, nodes}) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);

  const screenshotDirectory = path.join("artifacts", "plan-4", "tract-profile");
  await mkdir(screenshotDirectory, {recursive: true});
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDirectory, `${testInfo.project.name}.png`),
  });

  expect(browserErrors).toEqual([]);
});
