import {
  atlasPublicationManifestSchema,
  publicationCommandRequestSchema,
  type AtlasPublicationManifest,
  type PublicationCommandRequest,
} from "@mke/contracts";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createDatabaseClient} from "../client";
import {
  buildPublicationDryRunHash,
  parsePublicationDryRunRequest,
  PublicationCommandError,
  type PublicationDryRunRequest,
  validatePublicationCommandEnvironment,
  verifyPublicationDryRunHash,
} from "./command";
import {fingerprintPublicationManifest} from "./manifest";
import {reconcilePublicationManifest} from "./reconciliation";
import {
  publishAtlasRelease,
  readCurrentPublicationIdentity,
  readPublicationReconciliationEvidence,
  type PublicationOperationClient,
  withdrawAtlasRelease,
} from "./repository";
import {writePublicationReport} from "./report";

const commandVersion = "1";
const defaultReportRoot = fileURLToPath(
  new URL("../../../../data/reports/publication/", import.meta.url),
);
const commandNames = ["dry-run", "publish", "reconcile", "withdraw"] as const;
type CommandName = typeof commandNames[number];

type ParsedArguments = {
  command: CommandName;
  requestPath: string;
  manifestPath: string | null;
  reportRoot: string | undefined;
};

type CurrentIdentity = Awaited<ReturnType<typeof readCurrentPublicationIdentity>>;
type ReconciliationEvidence = Awaited<ReturnType<
  typeof readPublicationReconciliationEvidence
>>;

type CliDependencies = {
  environment: Record<string, string | undefined>;
  readJson(path: string): Promise<unknown>;
  createClient(databaseUrl: string): PublicationOperationClient;
  readCurrent(client: PublicationOperationClient): Promise<CurrentIdentity>;
  readEvidence(
    client: PublicationOperationClient,
    manifest: AtlasPublicationManifest,
  ): Promise<ReconciliationEvidence>;
  publish: typeof publishAtlasRelease;
  withdraw: typeof withdrawAtlasRelease;
  writeReport: typeof writePublicationReport;
  now(): Date;
  randomUuid(): string;
  writeOutput(message: string): void;
};

const defaultDependencies: CliDependencies = {
  environment: process.env,
  async readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
  },
  createClient(databaseUrl) {
    return createDatabaseClient(databaseUrl);
  },
  readCurrent: readCurrentPublicationIdentity,
  readEvidence: readPublicationReconciliationEvidence,
  publish: publishAtlasRelease,
  withdraw: withdrawAtlasRelease,
  writeReport: writePublicationReport,
  now: () => new Date(),
  randomUuid: randomUUID,
  writeOutput: (message) => process.stdout.write(`${message}\n`),
};

export function parsePublicationCliArguments(argv: ReadonlyArray<string>): ParsedArguments {
  const [rawCommand, ...rawOptions] = argv;
  if (!commandNames.includes(rawCommand as CommandName)) {
    throw new PublicationCommandError("command_invalid");
  }
  if (rawOptions.length % 2 !== 0) {
    throw new PublicationCommandError("arguments_invalid");
  }

  const options = new Map<string, string>();
  for (let index = 0; index < rawOptions.length; index += 2) {
    const name = rawOptions[index]!;
    const value = rawOptions[index + 1]!;
    if (!["--request", "--manifest", "--report-root"].includes(name) || options.has(name)) {
      throw new PublicationCommandError("arguments_invalid");
    }
    if (!value.trim() || value.startsWith("--")) {
      throw new PublicationCommandError("arguments_invalid");
    }
    options.set(name, value);
  }

  const requestPath = options.get("--request");
  if (!requestPath) {
    throw new PublicationCommandError("request_path_missing");
  }
  const manifestPath = options.get("--manifest") ?? null;
  if (["publish", "reconcile"].includes(rawCommand!) && !manifestPath) {
    throw new PublicationCommandError("manifest_path_missing");
  }

  return {
    command: rawCommand as CommandName,
    requestPath,
    manifestPath,
    reportRoot: options.get("--report-root"),
  };
}

function commandRequestFromDryRun(request: PublicationDryRunRequest): PublicationCommandRequest {
  return publicationCommandRequestSchema.parse({...request, dryRunHash: "0".repeat(64)});
}

function readGitCommit(environment: Record<string, string | undefined>): string {
  const gitCommit = environment.MKE_PUBLICATION_GIT_COMMIT?.trim();
  if (!gitCommit || !/^[0-9a-f]{7,64}$/i.test(gitCommit)) {
    throw new PublicationCommandError("git_commit_missing");
  }
  return gitCommit.toLowerCase();
}

function dryRunRequestFromCommand(request: PublicationCommandRequest): PublicationDryRunRequest {
  const {dryRunHash, ...rest} = request;
  void dryRunHash;
  return parsePublicationDryRunRequest(rest);
}

function assertCurrentMatches(
  request: PublicationDryRunRequest | PublicationCommandRequest,
  current: CurrentIdentity,
): void {
  if (request.expectedCurrentPublicationId !== (current?.id ?? null)) {
    throw new PublicationCommandError("expected_current_publication_mismatch");
  }
}

function requirePublishManifest(
  request: PublicationDryRunRequest | PublicationCommandRequest,
  rawManifest: unknown,
): AtlasPublicationManifest {
  if (request.action !== "publish") {
    throw new PublicationCommandError("publish_request_required");
  }
  const manifest = atlasPublicationManifestSchema.safeParse(rawManifest);
  if (!manifest.success) {
    throw new PublicationCommandError("manifest_invalid");
  }
  if (manifest.data.foodRun.id !== request.candidateFoodRunId) {
    throw new PublicationCommandError("candidate_manifest_mismatch");
  }
  return manifest.data;
}

function dryRunEvidence(input: {
  request: PublicationDryRunRequest;
  databaseHost: string;
  current: CurrentIdentity;
  bundleFingerprint: string | null;
  validation: Record<string, number>;
  gitCommit: string;
}) {
  return {
    schemaVersion: "publication-dry-run-v1",
    commandVersion,
    gitCommit: input.gitCommit,
    request: input.request,
    databaseHost: input.databaseHost,
    currentPublicationId: input.current?.id ?? null,
    bundleFingerprint: input.bundleFingerprint,
    validation: input.validation,
  };
}

async function inspectPublishCandidate(
  dependencies: CliDependencies,
  client: PublicationOperationClient,
  request: PublicationDryRunRequest | PublicationCommandRequest,
  rawManifest: unknown,
) {
  const manifest = requirePublishManifest(request, rawManifest);
  const evidence = await dependencies.readEvidence(client, manifest);
  const validation = reconcilePublicationManifest(manifest, evidence);
  return {
    manifest,
    validation,
    bundleFingerprint: fingerprintPublicationManifest(manifest),
  };
}

function safeFailureCode(error: unknown): string {
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    && /^[a-z0-9_]{1,100}$/.test(error.code)
  ) {
    return error.code;
  }
  return "publication_command_failed";
}

export async function runPublicationCli(
  argv: ReadonlyArray<string>,
  overrides: Partial<CliDependencies> = {},
): Promise<Record<string, unknown>> {
  const dependencies = {...defaultDependencies, ...overrides};
  let parsed: ParsedArguments | null = null;
  let safeAction = "unknown";
  try {
    parsed = parsePublicationCliArguments(argv);
    safeAction = parsed.command.replace("-", "_");
    const rawRequest = await dependencies.readJson(parsed.requestPath);
    const isReadOnly = parsed.command === "dry-run" || parsed.command === "reconcile";
    const dryRequest = isReadOnly
      ? parsePublicationDryRunRequest(rawRequest)
      : dryRunRequestFromCommand(publicationCommandRequestSchema.parse(rawRequest));
    const request = isReadOnly
      ? commandRequestFromDryRun(dryRequest)
      : publicationCommandRequestSchema.parse(rawRequest);
    const environmentGuard = validatePublicationCommandEnvironment(
      request,
      dependencies.environment,
    );
    const gitCommit = readGitCommit(dependencies.environment);
    const client = dependencies.createClient(environmentGuard.databaseUrl);
    const current = await dependencies.readCurrent(client);
    assertCurrentMatches(request, current);
    const rawManifest = parsed.manifestPath
      ? await dependencies.readJson(parsed.manifestPath)
      : null;

    let candidate: Awaited<ReturnType<typeof inspectPublishCandidate>> | null = null;
    if (request.action === "publish") {
      candidate = await inspectPublishCandidate(dependencies, client, request, rawManifest);
    } else if (parsed.command === "publish" || parsed.command === "reconcile") {
      throw new PublicationCommandError("publish_request_required");
    }

    const validation = candidate?.validation ?? {};
    const evidenceInput = dryRunEvidence({
      request: dryRequest,
      databaseHost: environmentGuard.databaseHost,
      current,
      bundleFingerprint: candidate?.bundleFingerprint ?? current?.bundleFingerprint ?? null,
      validation,
      gitCommit,
    });
    const dryRunHash = buildPublicationDryRunHash(evidenceInput);

    let result: Record<string, unknown> = {};
    if (parsed.command === "publish") {
      if (request.action !== "publish" || !candidate) {
        throw new PublicationCommandError("publish_request_required");
      }
      verifyPublicationDryRunHash(request, dryRunHash);
      const publicationId = dependencies.randomUuid();
      result = await dependencies.publish(client, request, candidate.manifest, {
        publicationId,
        auditEventId: dependencies.randomUuid(),
        bundleFingerprint: candidate.bundleFingerprint,
        publicationProcess: "mke-publication-cli",
        commandVersion,
        gitCommit,
        validationSummary: validation,
        requestHash: buildPublicationDryRunHash({request}),
      });
    } else if (parsed.command === "withdraw") {
      if (request.action !== "withdraw") {
        throw new PublicationCommandError("withdraw_request_required");
      }
      verifyPublicationDryRunHash(request, dryRunHash);
      result = await dependencies.withdraw(client, request, {
        auditEventId: dependencies.randomUuid(),
        requestHash: buildPublicationDryRunHash({request}),
      });
    }

    const report = {
      action: safeAction,
      intendedAction: request.action,
      status: "succeeded",
      environment: request.environment,
      databaseHost: environmentGuard.databaseHost,
      candidateFoodRunId: request.candidateFoodRunId,
      expectedCurrentPublicationId: request.expectedCurrentPublicationId,
      currentPublicationId: current?.id ?? null,
      bundleFingerprint: candidate?.bundleFingerprint ?? current?.bundleFingerprint ?? null,
      dryRunHash,
      approvalId: request.approvalId,
      idempotencyKey: request.idempotencyKey,
      actor: request.actor,
      reason: request.reason,
      publicationProcess: "mke-publication-cli",
      commandVersion,
      gitCommit,
      validation,
      result,
      completedAt: dependencies.now().toISOString(),
    };
    const reportPath = await dependencies.writeReport(
      report,
      parsed.reportRoot ?? defaultReportRoot,
      dependencies.now(),
    );
    const output = {...report, reportPath};
    dependencies.writeOutput(JSON.stringify(output));
    return output;
  } catch (error) {
    const failure = {
      action: safeAction,
      status: "failed",
      errorCode: safeFailureCode(error),
      completedAt: dependencies.now().toISOString(),
    };
    try {
      const reportPath = await dependencies.writeReport(
        failure,
        parsed?.reportRoot ?? defaultReportRoot,
        dependencies.now(),
      );
      dependencies.writeOutput(JSON.stringify({...failure, reportPath}));
    } catch {
      dependencies.writeOutput(JSON.stringify(failure));
    }
    throw error;
  }
}

export async function main(): Promise<void> {
  if (["--help", "-h"].includes(process.argv[2] ?? "")) {
    process.stdout.write([
      "Usage: npm run publication -- <dry-run|publish|reconcile|withdraw> --request <file> [--manifest <file>] [--report-root <directory>]",
      "",
      "dry-run and reconcile use a request JSON without dryRunHash.",
      "publish and withdraw use a request JSON containing the exact prior dryRunHash.",
      "publish and reconcile require --manifest; a publish dry-run also requires --manifest.",
      "",
    ].join("\n"));
    return;
  }
  try {
    await runPublicationCli(process.argv.slice(2));
  } catch {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
