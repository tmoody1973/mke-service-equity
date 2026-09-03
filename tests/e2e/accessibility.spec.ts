import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Locator, type Page} from "@playwright/test";

import {isKnownHeroUiReactAriaDevHydrationWarning} from "./browser-errors";

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

async function hasVisibleFocusIndicator(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== "none"
    );
  });
}

async function hasNegligibleMotion(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const transitionDurations = style.transitionDuration
      .split(",")
      .map((value) => value.trim())
      .map((value) => (value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000));

    return style.animationName === "none"
      && transitionDurations.every((duration) => duration <= 1);
  });
}

test("meets the accessibility contract at the configured width", async ({page}, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const width = testInfo.project.use.viewport?.width ?? 0;
  const isMobile = width <= 768;

  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto("/");

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

  await expect(page.getByRole("main")).toHaveCount(1);

  const skipLink = page.getByRole("link", {name: "Skip to the Food Equity Atlas"});
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  expect(await hasVisibleFocusIndicator(skipLink)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  if (isMobile) {
    const openNavigation = page.getByRole("button", {name: "Open navigation"});
    const triggerBox = await openNavigation.boundingBox();
    expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);

    await openNavigation.click();
    const sheet = page.locator(".sidebar__mobile-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"]:visible')).toHaveCount(1);
    await expect.poll(() => hasNegligibleMotion(sheet)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(openNavigation).toBeFocused();
  } else {
    const sidebar = page.getByRole("complementary", {name: "Application navigation"});
    await expect(page.locator('nav[aria-label="Primary"]:visible')).toHaveCount(1);
    await expect.poll(() => hasNegligibleMotion(sidebar)).toBe(true);
  }

  expect(browserErrors).toEqual([]);
});

test("keeps the Download data page accessible without depending on the map", async ({page}) => {
  const browserErrors = observeBrowserErrors(page);
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto("/data");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", {level: 1, name: "Download data"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "What each column means"})).toBeVisible();
  expect(await page.locator("html").evaluate((element) => (
    element.scrollWidth <= window.innerWidth
  ))).toBe(true);

  const accessibilityScan = await new AxeBuilder({page})
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibilityScan.violations).toEqual([]);
  expect(browserErrors).toEqual([]);
});
