import AxeBuilder from "@axe-core/playwright";
import {expect, test} from "@playwright/test";

const FOOD_SITE_ID = "data-you-can-use:pantries-2026:18";
const previewRunId = process.env.MKE_ATLAS_PREVIEW_RUN_ID;

test("shows the credited, non-scoring food-site context layer safely", async ({page}, testInfo) => {
  test.skip(!previewRunId, "Requires the explicit local validated-preview run.");

  await page.goto(`/?context=food_sites&site=${encodeURIComponent(FOOD_SITE_ID)}`);

  const map = page.locator("[data-map-container]");
  await expect(map).toHaveAttribute("data-map-status", "ready");
  await expect(map).toHaveAttribute("data-food-sites-visible", "true");
  await expect(map).toHaveAttribute("data-food-site-count", "89");

  const width = testInfo.project.use.viewport?.width ?? 0;
  if (width < 1200) {
    await page.getByRole("button", {name: "View food-site details"}).click();
  }

  await expect(page.getByRole("heading", {name: "All Saints Catholic Church"}).last()).toBeVisible();
  await expect(page.getByText(/current hours and services have not been independently confirmed/i).last())
    .toBeVisible();
  await expect(page.getByRole("link", {name: /Milwaukee Food Environment Map/}).last()).toBeVisible();
  await expect(page.getByRole("switch", {name: "Show food pantries and meal sites"}))
    .toBeChecked();
  await expect(page.getByText(/never changes a tract’s score or priority/i).last()).toBeVisible();
  await expect(page).toHaveURL(/context=food_sites/);
  await expect(page).toHaveURL(/site=data-you-can-use%3Apantries-2026%3A18/);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  const accessibility = await new AxeBuilder({page})
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
