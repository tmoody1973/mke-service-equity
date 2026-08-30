import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";

const previewRunId = process.env.MKE_ATLAS_PREVIEW_RUN_ID;

function observeBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("A tree hydrated")) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

test("finds a tract from the approved City neighborhood reference", async ({page}, testInfo) => {
  test.skip(!previewRunId, "Requires the explicit local validated-preview run.");

  const browserErrors = observeBrowserErrors(page);
  const width = testInfo.project.use.viewport?.width ?? 0;
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto("/");

  if (width < 1200) {
    await page.getByRole("button", {name: "Browse census tracts"}).click();
  }

  const search = page.getByRole("searchbox", {name: "Find a tract or neighborhood"});
  await expect(search).toBeVisible();
  await expect(search).toHaveAccessibleDescription(/ZIP and address search are not available yet/i);
  await search.fill("Northridge");

  const results = page.getByRole("list", {name: "Search results"});
  await expect(results).toBeVisible();
  const northridge = results.getByRole("button").filter({hasText: /^NORTHRIDGE/}).first();
  await expect(northridge).toContainText("Census Tract 1.01");
  await expect(northridge).toContainText("42.8% of its City-covered area");
  await northridge.click();

  await expect(page).toHaveURL(/tract=55079000101/);
  await expect(page.locator("[data-profile-tract='55079000101']:visible")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  const accessibilityScan = await new AxeBuilder({page})
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibilityScan.violations).toEqual([]);
  expect(browserErrors).toEqual([]);
});
