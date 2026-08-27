import {readFile} from "node:fs/promises";

const config = await readFile(new URL("../playwright.config.ts", import.meta.url), "utf8");
const requiredProjects = ["width-375", "width-430", "width-768", "width-1024", "width-1440"];

const invalidProjects = requiredProjects.filter((name) => {
  const occurrences = config.match(new RegExp(`name: ["']${name}["']`, "g")) ?? [];
  return occurrences.length !== 1;
});

if (invalidProjects.length > 0) {
  console.error(`Responsive project contract failed: ${invalidProjects.join(", ")}`);
  process.exit(1);
}

console.log("Responsive project contract passed for all five required widths.");
