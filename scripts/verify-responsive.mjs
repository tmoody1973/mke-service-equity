import {readFile} from "node:fs/promises";

const config = await readFile(new URL("../playwright.config.ts", import.meta.url), "utf8");
const requiredProjects = [
  {name: "width-375", width: 375},
  {name: "width-430", width: 430},
  {name: "width-768", width: 768},
  {name: "width-1024", width: 1024},
  {name: "width-1440", width: 1440},
];
const configuredProjects = [...config.matchAll(
  /\{height:\s*\d+,\s*name:\s*["']([^"']+)["'],\s*width:\s*(\d+)\}/g,
)].map(([, name, width]) => ({name, width: Number(width)}));

const invalidProjects = requiredProjects.filter((expected) => {
  const matches = configuredProjects.filter(({name}) => name === expected.name);
  return matches.length !== 1 || matches[0]?.width !== expected.width;
});

if (invalidProjects.length > 0) {
  console.error(
    `Responsive project contract failed: ${invalidProjects.map(({name}) => name).join(", ")}`,
  );
  process.exit(1);
}

console.log("Responsive project contract passed for all five required widths.");
