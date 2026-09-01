import {
  publicationCommandRequestSchema,
  type PublicationCommandRequest,
} from "@mke/contracts";
import {createHash} from "node:crypto";

type PublicationEnvironment = Record<string, string | undefined>;

export type PublicationDryRunRequest = PublicationCommandRequest extends infer Request
  ? Request extends PublicationCommandRequest
    ? Omit<Request, "dryRunHash">
    : never
  : never;

export class PublicationCommandError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PublicationCommandError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function parsePublicationDryRunRequest(raw: unknown): PublicationDryRunRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || "dryRunHash" in raw) {
    throw new PublicationCommandError("dry_run_request_invalid");
  }
  const parsed = publicationCommandRequestSchema.safeParse({
    ...raw,
    dryRunHash: "0".repeat(64),
  });
  if (!parsed.success) {
    throw new PublicationCommandError("dry_run_request_invalid");
  }
  const {dryRunHash: _dryRunHash, ...request} = parsed.data;
  void _dryRunHash;
  return request;
}

export function buildPublicationDryRunHash(evidence: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(evidence)), "utf8")
    .digest("hex");
}

export function verifyPublicationDryRunHash(
  request: PublicationCommandRequest,
  expectedDryRunHash: string,
): void {
  const parsed = publicationCommandRequestSchema.parse(request);
  if (parsed.dryRunHash !== expectedDryRunHash) {
    throw new PublicationCommandError("dry_run_hash_mismatch");
  }
}

export function validatePublicationCommandEnvironment(
  rawRequest: PublicationCommandRequest,
  environment: PublicationEnvironment,
) {
  const request = publicationCommandRequestSchema.parse(rawRequest);
  if (environment.MKE_PUBLICATION_ENV !== request.environment) {
    throw new PublicationCommandError("environment_mismatch");
  }
  if (environment.MKE_PIPELINE_ENV !== request.environment) {
    throw new PublicationCommandError("pipeline_environment_mismatch");
  }

  const rawDatabaseUrl = environment.DATABASE_URL_UNPOOLED?.trim();
  if (!rawDatabaseUrl) {
    throw new PublicationCommandError("database_url_missing");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new PublicationCommandError("database_url_invalid");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new PublicationCommandError("database_url_invalid");
  }

  const expectedHost = environment.MKE_PUBLICATION_EXPECTED_HOST?.trim();
  if (!expectedHost || databaseUrl.hostname !== expectedHost) {
    throw new PublicationCommandError("database_host_mismatch");
  }

  if (
    request.environment === "production"
    && environment.MKE_PUBLICATION_GATE3_APPROVAL_ID !== request.gate3ApprovalId
  ) {
    throw new PublicationCommandError("gate3_approval_mismatch");
  }

  return {
    databaseUrl: rawDatabaseUrl,
    databaseHost: databaseUrl.hostname,
    environment: request.environment,
  };
}
