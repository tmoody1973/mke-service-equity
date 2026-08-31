import AxeBuilder from "@axe-core/playwright";
import {expect, type Locator, type Page, type TestInfo} from "@playwright/test";
import {mkdir} from "node:fs/promises";
import path from "node:path";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

export function observeAnalyzeBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    // HeroUI Pro Sidebar's React Aria collection IDs differ only under Next's dev renderer.
    // Task 15 separately owns the production-mode browser proof, where no error is ignored.
    if (message.type() === "error" && !text.startsWith("A tree hydrated")) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  return errors;
}

export async function expectNoAxeViolations(page: Page) {
  const scan = await new AxeBuilder({page}).withTags(WCAG_TAGS).analyze();
  expect(
    scan.violations.map(({id, impact, nodes}) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
}

export async function expectPracticalTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, "Expected the interactive target to have a layout box").not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

export async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  expect(await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0)
      || style.boxShadow !== "none"
    );
  })).toBe(true);
}

export async function expectReducedMotion(page: Page) {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
}

export async function expectNegligibleMotion(locator: Locator) {
  expect(await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const milliseconds = `${style.animationDuration},${style.transitionDuration}`
      .split(",")
      .map((value) => value.trim())
      .map((value) => (value.endsWith("ms")
        ? Number.parseFloat(value)
        : Number.parseFloat(value) * 1000));
    return style.animationName === "none" || milliseconds.every((duration) => duration <= 1);
  })).toBe(true);
}

export async function expectForcedColors(page: Page) {
  await page.emulateMedia({forcedColors: "active", reducedMotion: "reduce"});
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await expect(page.getByRole("main")).toBeVisible();
  await page.emulateMedia({forcedColors: "none", reducedMotion: "reduce"});
}

export async function captureAnalyzeScreenshot(
  page: Page,
  route: "compare" | "opportunity",
  testInfo: TestInfo,
) {
  const directory = path.join("artifacts", "plan-5", "task-14", route);
  await mkdir(directory, {recursive: true});
  await page.addStyleTag({
    content: "nextjs-portal, .mke-skip-link:not(:focus-visible) { display: none !important; }",
  });
  await page.screenshot({
    fullPage: true,
    path: path.join(directory, `${testInfo.project.name}.png`),
  });
}
