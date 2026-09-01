import {randomUUID} from "node:crypto";
import {mkdir, rename, writeFile} from "node:fs/promises";
import {join} from "node:path";

const sensitiveKey = /(api.?key|credential|database.?url|password|secret|token)/i;
const credentialUrl = /(?:postgres|postgresql):\/\/[^\s"]+/gi;

export function redactPublicationReport(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactPublicationReport);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [
          key,
          sensitiveKey.test(key) ? "[REDACTED]" : redactPublicationReport(child),
        ]),
    );
  }
  if (typeof value === "string") {
    return value.replace(credentialUrl, "[REDACTED]");
  }
  return value;
}

export async function writePublicationReport(
  report: Record<string, unknown>,
  reportRoot = "data/reports/publication",
  now = new Date(),
) {
  await mkdir(reportRoot, {recursive: true});
  const timestamp = now.toISOString().replaceAll(":", "").replaceAll(".", "");
  const action = typeof report.action === "string"
    ? report.action.replaceAll(/[^a-z0-9_-]/gi, "-")
    : "unknown";
  const destination = join(reportRoot, `${timestamp}-${action}.json`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const redacted = redactPublicationReport(report);
  const content = `${JSON.stringify(redacted, null, 2)}\n`;
  await writeFile(temporary, content, {encoding: "utf8", flag: "wx"});
  await rename(temporary, destination);
  return destination;
}
