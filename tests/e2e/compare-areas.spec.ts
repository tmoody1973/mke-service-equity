import {expect, test} from "@playwright/test";

import {
  captureAnalyzeScreenshot,
  configuredViewportWidth,
  expectForcedColors,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectPracticalTarget,
  expectReducedMotion,
  expectVisibleFocus,
  observeAnalyzeBrowserErrors,
} from "./analyze-helpers";

const previewRunId = process.env.MKE_ATLAS_PREVIEW_RUN_ID;
const TWO_TRACTS = ["55079000101", "55079008400"];
const FIVE_TRACTS = [
  "55079000101",
  "55079008400",
  "55079185700",
  "55079090600",
  "55079187200",
];

function comparePath(tracts: ReadonlyArray<string>) {
  const search = new URLSearchParams();
  for (const tract of tracts) {
    search.append("tract", tract);
  }
  return `/analyze/compare?${search.toString()}`;
}

test("Compare Areas supports accessible two-to-five-area work at the configured width", async ({page}, testInfo) => {
  test.skip(!previewRunId, "Requires the explicit local validated-preview run.");
  test.setTimeout(120_000);

  const browserErrors = observeAnalyzeBrowserErrors(page);
  const width = configuredViewportWidth(testInfo);
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto(comparePath(TWO_TRACTS));

  await expect(page.getByRole("heading", {level: 1, name: "Compare Areas"})).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("region", {name: "Choose comparison areas"})).toBeVisible();
  await expect(page.getByRole("region", {name: "Comparison summary"})).toBeVisible();
  await expect(page.getByRole("region", {name: "Differences"})).toBeVisible();
  await expect(page.getByText("2 of 5 selected", {exact: true})).toBeVisible();

  if (width < 1024) {
    await expect(page.locator('[data-comparison-layout="mobile"]')).toBeVisible();
    await expect(page.getByRole("list", {name: "Comparison summary by tract"})).toBeVisible();
    await expect(page.locator('[data-comparison-layout="desktop"]')).toBeHidden();
  } else {
    await expect(page.getByRole("table", {name: "Comparison summary"})).toBeVisible();
    await expect(page.locator('[data-comparison-layout="mobile"]')).toBeHidden();
  }

  const removeFirst = page.getByRole("button", {name: "Remove Census Tract 1.01"});
  await expectPracticalTarget(removeFirst);
  const indicator = page.getByRole("button", {name: "View evidence for Housing cost burden"});
  await expectPracticalTarget(indicator);
  await indicator.focus();
  await expectVisibleFocus(indicator);
  await page.keyboard.press("Enter");
  await expect(indicator).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", {name: "View source data"}).first()).toBeVisible();

  await expectReducedMotion(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  const copiedTwoAreaUrl = page.url();
  await page.reload();
  await expect(page.getByText("2 of 5 selected", {exact: true})).toBeVisible();
  expect(page.url()).toBe(copiedTwoAreaUrl);

  await page.goto(comparePath(FIVE_TRACTS));
  await expect(page.getByText("5 of 5 selected", {exact: true})).toBeVisible();
  await expect(page.getByText(/selected the maximum of five areas/i)).toBeVisible();
  await expect(page.getByRole("searchbox", {name: "Find a tract or neighborhood"})).toHaveCount(0);

  const removeTract84 = page.getByRole("button", {name: "Remove Census Tract 84"});
  await removeTract84.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("4 of 5 selected", {exact: true})).toBeVisible();
  await expect(page).not.toHaveURL(/tract=55079008400/);
  await page.goBack();
  await expect(page.getByText("5 of 5 selected", {exact: true})).toBeVisible();
  await page.goForward();
  await expect(page.getByText("4 of 5 selected", {exact: true})).toBeVisible();

  const search = page.getByRole("searchbox", {name: "Find a tract or neighborhood"});
  await search.focus();
  await search.fill("55079008400");
  const searchResult = page.getByRole("list", {name: "Search results"}).getByRole("button").first();
  await expect(searchResult).toContainText("Census Tract 84");
  await searchResult.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("5 of 5 selected", {exact: true})).toBeVisible();

  const sharedFiveAreaUrl = page.url();
  expect(new URL(sharedFiveAreaUrl).searchParams.getAll("tract")).toEqual([
    "55079000101",
    "55079185700",
    "55079090600",
    "55079187200",
    "55079008400",
  ]);
  expect(sharedFiveAreaUrl).not.toContain(previewRunId);
  await page.goto("about:blank");
  await page.goto(sharedFiveAreaUrl);
  await expect(page.getByText("5 of 5 selected", {exact: true})).toBeVisible();

  await page.goto("/analyze/compare?tract=not-a-tract&tract=55079000101");
  await expect(page.getByRole("heading", {name: "This comparison link is not valid"})).toBeVisible();
  await expect(page.getByText(/did not load a partial comparison/i)).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto(sharedFiveAreaUrl);
  await expectForcedColors(page);
  await expect(page.getByText(/Validated preview — not published/i)).toBeVisible();
  await expect(page.getByText(/This is not a ranking/i).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await captureAnalyzeScreenshot(page, "compare", testInfo);

  expect(browserErrors).toEqual([]);
});
