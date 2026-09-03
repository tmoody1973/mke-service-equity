import {expect, test, type Page} from "@playwright/test";

import {isKnownHeroUiReactAriaDevHydrationWarning} from "./browser-errors";

const validatedPreview = process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
  && Boolean(process.env.MKE_ATLAS_PREVIEW_RUN_ID);
const previewRunId = process.env.MKE_ATLAS_PREVIEW_RUN_ID;

function observeBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !isKnownHeroUiReactAriaDevHydrationWarning(text)) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.locator("html").evaluate((element) => (
    element.scrollWidth <= window.innerWidth
  ))).toBe(true);
}

test("keeps every public screen readable and shareable at the configured width", async ({page}) => {
  const errors = observeBrowserErrors(page);
  const screens = [
    {heading: "Food Equity Atlas", path: "/"},
    {heading: "Food Equity Atlas", path: "/?tract=55079000101"},
    {heading: "Compare Areas", path: "/analyze/compare"},
    {heading: "Opportunity Explorer", path: "/analyze/opportunity"},
    {heading: "Download data", path: "/data"},
  ] as const;

  for (const screen of screens) {
    await page.goto(screen.path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", {level: 1, name: screen.heading})).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await expect(page).toHaveURL(/\/data$/);
  await page.goto("/?tract=55079000101");
  if (validatedPreview) {
    await expect(page).toHaveURL(/\?tract=55079000101$/);
  } else {
    await expect(page).toHaveURL(/\/$/);
  }
  expect(page.url()).not.toContain(previewRunId ?? "__no_preview_run__");
  await expect(page.getByRole("main")).toContainText(/Food Equity Atlas|temporarily unavailable/i);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
