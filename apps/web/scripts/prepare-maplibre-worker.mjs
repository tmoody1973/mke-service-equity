import {copyFile, mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const targetDirectory = fileURLToPath(new URL("../public/vendor/", import.meta.url));
const modules = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(targetDirectory, {recursive: true});

for (const moduleName of modules) {
  const source = fileURLToPath(
    new URL(`../node_modules/maplibre-gl/dist/${moduleName}`, import.meta.url),
  );
  const target = fileURLToPath(new URL(`../public/vendor/${moduleName}`, import.meta.url));
  await copyFile(source, target);
}
