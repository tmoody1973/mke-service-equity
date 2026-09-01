import {expect, test, type Locator, type Page} from "@playwright/test";

import {
  captureAnalyzeScreenshot,
  configuredViewportWidth,
  expectForcedColors,
  expectNegligibleMotion,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectPracticalTarget,
  expectReducedMotion,
  expectVisibleFocus,
  observeAnalyzeBrowserErrors,
} from "./analyze-helpers";

const previewRunId = process.env.MKE_ATLAS_PREVIEW_RUN_ID;

async function openFilters(page: Page, isNarrow: boolean): Promise<Locator> {
  if (!isNarrow) {
    return page.locator('aside[aria-label="Opportunity filters"]');
  }
  const trigger = page.getByRole("button", {name: "Open filters"});
  await expectPracticalTarget(trigger);
  await trigger.focus();
  await expectVisibleFocus(trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {name: "Choose conditions"});
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", {name: "Close filters"});
  await expectPracticalTarget(close);
  await expectVisibleFocus(close);
  await expectNegligibleMotion(dialog);
  return dialog;
}

test("Opportunity Explorer supports accessible planning filters at the configured width", async ({page}, testInfo) => {
  test.skip(!previewRunId, "Requires the explicit local validated-preview run.");
  test.setTimeout(150_000);

  const browserErrors = observeAnalyzeBrowserErrors(page);
  const width = configuredViewportWidth(testInfo);
  const isNarrow = width <= 768;
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto("/analyze/opportunity?priorities=1");

  await expect(page.getByRole("heading", {level: 1, name: "Opportunity Explorer"})).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("region", {name: "Map of matching areas"})).toBeVisible();
  await expectPracticalTarget(page.locator(".maplibregl-ctrl-zoom-in"));
  await expect(page.getByText(/Results are not ranked/i)).toBeVisible();

  if (isNarrow) {
    await expect(page.getByRole("button", {name: "Open filters"})).toBeVisible();
    await expect(page.getByRole("button", {name: /Open 18 matching areas/i})).toBeVisible();
    await expect(page.locator('aside[aria-label="Opportunity filters"]')).toBeHidden();
  } else {
    await expect(page.getByText(/18 matching census tracts/i)).toBeVisible();
    const desktopFilters = page.locator('aside[aria-label="Opportunity filters"]');
    const desktopResults = page.locator('aside[aria-label="Matching areas and selected-area evidence"]');
    const map = page.getByRole("region", {name: "Map of matching areas"});
    await expect(desktopFilters).toBeVisible();
    await expect(desktopResults).toBeVisible();
    const filterBox = await desktopFilters.boundingBox();
    const mapBox = await map.boundingBox();
    const resultsBox = await desktopResults.boundingBox();
    expect(filterBox).not.toBeNull();
    expect(mapBox).not.toBeNull();
    expect(resultsBox).not.toBeNull();
    expect((mapBox?.x ?? 0) > (filterBox?.x ?? 0)).toBe(true);
    if (width < 1280) {
      expect((resultsBox?.y ?? 0) > (mapBox?.y ?? 0)).toBe(true);
    } else {
      expect((resultsBox?.x ?? 0) > (mapBox?.x ?? 0)).toBe(true);
      expect(Math.abs((resultsBox?.y ?? 0) - (mapBox?.y ?? 0))).toBeLessThan(2);
    }
  }

  let filters = await openFilters(page, isNarrow);
  if (isNarrow) {
    await page.keyboard.press("Shift+Tab");
    expect(await filters.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(filters.getByRole("button", {name: "Close filters"})).toBeFocused();
  }
  const priority2 = filters.getByRole("checkbox", {name: "Food Equity Priority: Priority 2"});
  await priority2.focus();
  await expectVisibleFocus(priority2);
  await page.keyboard.press("Space");
  const highEquity = filters.getByRole("checkbox", {name: "Equity Baseline band: High"});
  await highEquity.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/priorities=1$/);
  if (!isNarrow) {
    await expect(page.getByText(/18 matching census tracts/i)).toBeVisible();
  }

  const apply = filters.getByRole("button", {name: "Apply filters"});
  await expectPracticalTarget(apply);
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/priorities=1&priorities=2&equity-bands=high/);
  await expect(page.getByRole("status", {name: "Applied filter update"})).toContainText("3 filters applied");

  if (isNarrow) {
    const dialog = page.getByRole("dialog", {name: "Choose conditions"});
    if (await dialog.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", {name: "Open filters"})).toBeFocused();
    }
    filters = await openFilters(page, true);
  } else {
    filters = await openFilters(page, false);
  }

  const removePriority2 = filters.getByRole("button", {name: "Remove applied filter Priority 2"});
  await removePriority2.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/priorities=1&equity-bands=high/);
  if (isNarrow && await page.getByRole("dialog", {name: "Choose conditions"}).isVisible()) {
    await page.keyboard.press("Escape");
  }
  filters = await openFilters(page, isNarrow);
  const clearAll = filters.getByRole("button", {name: "Clear all applied filters"});
  await clearAll.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/analyze\/opportunity$/);

  if (isNarrow && await page.getByRole("dialog", {name: "Choose conditions"}).isVisible()) {
    await page.keyboard.press("Escape");
  }
  await page.goto("/analyze/opportunity?no-vehicle-minimum-percent=0");
  if (isNarrow) {
    const missingCountTrigger = page.getByRole("button", {name: /Open 299 matching areas/i});
    await missingCountTrigger.focus();
    await page.keyboard.press("Enter");
    const missingCountDialog = page.getByRole("dialog", {name: "Matching areas"});
    await expect(missingCountDialog.getByText(/3 other census tracts were left out because a value required by the filters was missing/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(missingCountTrigger).toBeFocused();
  } else {
    await expect(page.getByText(/3 other census tracts were left out because a value required by the filters was missing/i)).toBeVisible();
  }
  await expect(page.getByText(/population data unavailable and .* not included in the people total/i)).toHaveCount(0);

  const sharedUrl = page.url();
  expect(sharedUrl).not.toContain(previewRunId);
  await page.reload();
  expect(page.url()).toBe(sharedUrl);
  await page.goto("/analyze/opportunity?grocery-walk-minimum-minutes=1000");
  if (isNarrow) {
    const noMatchesTrigger = page.getByRole("button", {name: "Open 0 matching areas"});
    await noMatchesTrigger.focus();
    await page.keyboard.press("Enter");
    const noMatchesDialog = page.getByRole("dialog", {name: "Matching areas"});
    await expect(noMatchesDialog.getByText("0 matching census tracts", {exact: true})).toBeVisible();
    await expect(noMatchesDialog.getByText(/No Census tracts match every applied condition/i)).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(page.getByText("0 matching census tracts", {exact: true})).toBeVisible();
    await expect(page.getByText(/No Census tracts match every applied condition/i)).toBeVisible();
  }
  await page.goBack();
  await expect(page).toHaveURL(sharedUrl);
  await page.goForward();
  await expect(page).toHaveURL(/grocery-walk-minimum-minutes=1000/);
  await expectNoAxeViolations(page);

  await page.goto("/analyze/opportunity?priorities=99");
  await expect(page.getByRole("heading", {name: "Some filter settings are not valid"})).toBeVisible();
  await expect(page.getByText(/did not run a partial search/i)).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/analyze/opportunity?priorities=1");
  if (isNarrow) {
    const resultsTrigger = page.getByRole("button", {name: /Open 18 matching areas/i});
    await expectPracticalTarget(resultsTrigger);
    await resultsTrigger.focus();
    await page.keyboard.press("Enter");
    const resultsDialog = page.getByRole("dialog", {name: "Matching areas"});
    await expect(resultsDialog).toBeVisible();
    const closeResults = resultsDialog.getByRole("button", {name: "Close matching areas"});
    await expectPracticalTarget(closeResults);
    await expectVisibleFocus(closeResults);
    await expectNegligibleMotion(resultsDialog);
    await page.keyboard.press("Shift+Tab");
    expect(await resultsDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    const result = resultsDialog.getByRole("button", {name: /Census Tract 1\.01, Census tract ID 55079000101/i});
    await expectPracticalTarget(result);
    await result.focus();
    await page.keyboard.press("Enter");
    await expect(resultsDialog).toBeHidden();
  } else {
    const result = page.locator('aside[aria-label="Matching areas and selected-area evidence"]')
      .getByRole("button", {name: /Census Tract 1\.01, Census tract ID 55079000101/i});
    await expectPracticalTarget(result);
    await result.focus();
    await page.keyboard.press("Enter");
    await expect(result).toHaveAttribute("aria-pressed", "true");
  }
  const selectedProfile = page.locator("[data-profile-tract='55079000101']:visible");
  await expect(selectedProfile).toBeVisible();
  await expect(selectedProfile.getByText(/Census tract ID 55079000101/i)).toBeVisible();

  await expectReducedMotion(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
  await expectForcedColors(page);
  await expect(page.getByText(/Validated preview — not published/i)).toBeVisible();
  await expect(selectedProfile.getByText("Priority 1", {exact: true}).first()).toBeVisible();
  await captureAnalyzeScreenshot(page, "opportunity", testInfo);

  expect(browserErrors).toEqual([]);
});
