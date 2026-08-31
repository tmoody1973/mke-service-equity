import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticDirectory = path.resolve(scriptDirectory, "../.next/static");

const forbiddenPatterns = [
  ["DATABASE_URL", /\bDATABASE_URL\b/],
  ["DATABASE_URL_UNPOOLED", /\bDATABASE_URL_UNPOOLED\b/],
  [
    "preview environment variable",
    /MKE_ATLAS_DATA_MODE|MKE_ATLAS_PREVIEW_RUN_ID|MKE_PIPELINE_ENV/,
  ],
  ["validated preview run ID", /97bd1cdf-bf96-573f-8fcf-92e8676925d4/],
  ["database connection URI", /postgres(?:ql)?:\/\//i],
  ["database package import", /@mke\/database|drizzle-orm|server-only/],
  ["raw SELECT statement", /(?:^|["'`])\s*select\s+(?:distinct\s+)?(?:\*|["`][a-z_]|[a-z_]+\.)/i],
  ["raw INSERT statement", /(?:^|["'`])\s*insert\s+into\s+(?:["`][a-z_]|[a-z_][\w.]*\s*\()/i],
  ["raw UPDATE statement", /(?:^|["'`])\s*update\s+(?:["`][a-z_]|[a-z_][\w.]*)[^;]{0,160}\s+set\s+/i],
  ["raw DELETE statement", /(?:^|["'`])\s*delete\s+from\s+(?:["`][a-z_]|[a-z_][\w.]*)/i],
];

async function clientJavaScriptFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return clientJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  }));
  return files.flat();
}

async function main() {
  let files;
  try {
    files = await clientJavaScriptFiles(staticDirectory);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("Client bundle not found. Run the web production build first.");
    }
    throw error;
  }

  if (files.length === 0) {
    throw new Error("No JavaScript assets were found in the production client bundle.");
  }

  const findings = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const [label, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        findings.push(`${label}: ${path.relative(staticDirectory, file)}`);
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(`Forbidden analysis data found in client assets:\n${findings.join("\n")}`);
  }

  console.log(`Verified ${files.length} production client assets; no analysis secrets or server-only code found.`);
}

await main();
