import {expect, test} from "@playwright/test";

import {isKnownHeroUiReactAriaDevHydrationWarning} from "./browser-errors";

test("keeps the Data page understandable and usable at every configured width", async ({page}, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !isKnownHeroUiReactAriaDevHydrationWarning(text)) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/data");

  await expect(page.getByRole("heading", {name: "Download data"})).toBeVisible();
  await expect(page.getByText(/all 302 Milwaukee County Census tracts/i)).toBeVisible();
  await expect(page.getByRole("heading", {name: "What each column means"})).toBeVisible();
  const isMobile = (testInfo.project.use.viewport?.width ?? 0) <= 768;
  if (isMobile) {
    await page.getByRole("button", {name: "Open navigation"}).click();
    const navigation = page.locator('nav[aria-label="Primary"]:visible');
    const dataRow = navigation.getByRole("row", {name: "Download data"});
    await expect(dataRow).toHaveAttribute("data-current", "true");
    await page.getByRole("button", {name: "Close navigation"}).click();
  } else {
    const dataRow = page.getByRole("complementary", {name: "Application navigation"})
      .getByRole("row", {name: "Download data"});
    await expect(dataRow).toHaveAttribute("data-current", "true");
  }
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
