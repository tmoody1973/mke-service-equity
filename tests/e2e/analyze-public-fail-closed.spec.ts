import {expect, test, type Page} from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
} from "./analyze-helpers";

const VALIDATED_PREVIEW_RUN_ID = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";

function observeProductionBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectPublicUnavailable(page: Page, pageTitle: string) {
  await expect(page.getByRole("heading", {level: 1, name: pageTitle})).toBeVisible();
  await expect(page.getByRole("heading", {
    level: 2,
    name: "No published Food Equity results yet",
  })).toBeVisible();
  await expect(page.getByText(
    "A reviewed Food Equity data release has not been published yet. Nothing from a private preview is shown here.",
  )).toBeVisible();
  await expect(page.getByRole("link", {name: "Start over"})).toBeVisible();
  await expect(page.getByText(/Validated preview — not published/i)).toHaveCount(0);
  await expect(page.getByText(/matching census tracts/i)).toHaveCount(0);

  const html = await page.content();
  expect(html).not.toContain(VALIDATED_PREVIEW_RUN_ID);
  expect(html).not.toContain("validated_preview");
  expect(html).not.toContain("61.3%");

  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
}

test("Analyze public fail-closed hides unpublished data on both routes", async ({page}) => {
  test.skip(
    Boolean(process.env.MKE_ATLAS_PREVIEW_RUN_ID),
    "Requires the clean public mode with no validated-preview identity.",
  );
  test.setTimeout(120_000);
  const browserErrors = observeProductionBrowserErrors(page);

  await page.goto(
    "/analyze/compare?tract=55079000101&tract=55079008400",
    {waitUntil: "networkidle"},
  );
  await expectPublicUnavailable(page, "Compare Areas");

  await page.goto("/analyze/opportunity?priorities=1", {waitUntil: "networkidle"});
  await expectPublicUnavailable(page, "Opportunity Explorer");

  expect(browserErrors).toEqual([]);
});
