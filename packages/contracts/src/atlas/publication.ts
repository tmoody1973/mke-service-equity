import {z} from "zod";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const boundedText = z.string().trim().min(1).max(500);
const termsUrlSchema = z.url().max(2_000).nullable();

export const atlasPublicationStateSchema = z.enum(["published", "superseded"]);

export const publicationRedistributionDecisionSchema = z.enum([
  "public_derived_results",
  "public_direct_display",
  "internal_reproduction_only",
  "prohibited_public_use",
]);

export const publicationSourceRoleSchema = z.enum([
  "canonical_geography",
  "equity_input",
  "food_scoring_input",
  "food_context_input",
]);

export const publicationResourceRoleSchema = z.enum([
  "scoring_inventory",
  "public_display",
]);

export const currentAtlasPublicationSchema = z.strictObject({
  id: z.uuid(),
  publishedAt: z.iso.datetime({offset: true}),
  bundleFingerprint: hashSchema,
});

const publicationRunIdentitySchema = z.strictObject({
  id: z.uuid(),
  outputHash: hashSchema,
  runFingerprint: hashSchema,
});

const scoreMemberSchema = z.strictObject({
  geographyId: z.uuid(),
  foodScoreId: z.uuid(),
  equityScoreId: z.uuid(),
});

const equityComponentMemberSchema = z.strictObject({
  componentId: z.uuid(),
  indicatorValueId: z.uuid(),
});

const foodComponentMemberSchema = z.strictObject({
  componentId: z.uuid(),
  accessMetricValueId: z.uuid(),
});

const sourceSnapshotMemberSchema = z.strictObject({
  snapshotId: z.uuid(),
  role: publicationSourceRoleSchema,
  redistributionDecision: publicationRedistributionDecisionSchema,
  termsUrl: termsUrlSchema,
  attribution: boundedText,
  warning: boundedText.nullable(),
}).superRefine((value, context) => {
  if (
    value.redistributionDecision === "public_direct_display"
    || value.redistributionDecision === "public_derived_results"
  ) {
    if (!value.termsUrl) {
      context.addIssue({
        code: "custom",
        message: "Public source use requires a terms URL.",
        path: ["termsUrl"],
      });
    }
  }
});

const resourceVersionMemberSchema = z.strictObject({
  resourceVersionId: z.uuid(),
  role: publicationResourceRoleSchema,
  redistributionDecision: publicationRedistributionDecisionSchema,
  termsUrl: termsUrlSchema,
  attribution: boundedText,
  warning: boundedText.nullable(),
}).superRefine((value, context) => {
  if (value.role === "public_display") {
    if (value.redistributionDecision !== "public_direct_display") {
      context.addIssue({
        code: "custom",
        message: "A public-display resource requires an explicit direct-display decision.",
        path: ["redistributionDecision"],
      });
    }
    if (!value.termsUrl) {
      context.addIssue({
        code: "custom",
        message: "A public-display resource requires a terms URL.",
        path: ["termsUrl"],
      });
    }
  }
  if (
    value.role === "scoring_inventory"
    && value.redistributionDecision === "public_direct_display"
  ) {
    context.addIssue({
      code: "custom",
      message: "Scoring inventory is not automatically approved for direct display.",
      path: ["redistributionDecision"],
    });
  }
});

function orderedUniqueArray<T extends z.ZodType>(
  itemSchema: T,
  key: (value: z.output<T>) => string,
  maximum: number,
) {
  return z.array(itemSchema).min(1).max(maximum).superRefine((values, context) => {
    const keys = values.map(key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({code: "custom", message: "Publication members must be unique."});
    }
    for (let index = 1; index < keys.length; index += 1) {
      if (keys[index - 1]! >= keys[index]!) {
        context.addIssue({
          code: "custom",
          message: "Publication members must use canonical ascending order.",
          path: [index],
        });
        break;
      }
    }
  });
}

export const atlasPublicationManifestSchema = z.strictObject({
  schemaVersion: z.literal("atlas-publication-manifest-v1"),
  foodRun: publicationRunIdentitySchema,
  equityBaselineRun: publicationRunIdentitySchema,
  scoreMembers: orderedUniqueArray(
    scoreMemberSchema,
    (value) => value.geographyId,
    400,
  ),
  equityComponentMembers: orderedUniqueArray(
    equityComponentMemberSchema,
    (value) => value.componentId,
    5_000,
  ),
  foodComponentMembers: orderedUniqueArray(
    foodComponentMemberSchema,
    (value) => value.componentId,
    5_000,
  ),
  sourceSnapshotMembers: orderedUniqueArray(
    sourceSnapshotMemberSchema,
    (value) => value.snapshotId,
    128,
  ),
  resourceVersionMembers: orderedUniqueArray(
    resourceVersionMemberSchema,
    (value) => value.resourceVersionId,
    10_000,
  ),
});

const publicationCommandCommonShape = {
  environment: z.enum(["development", "production"]),
  expectedCurrentPublicationId: z.uuid().nullable(),
  approvalId: boundedText,
  idempotencyKey: z.uuid(),
  dryRunHash: hashSchema,
  confirmation: boundedText,
  actor: boundedText,
  reason: boundedText,
  gate3ApprovalId: boundedText.nullable(),
} as const;

const publicationPublishRequestSchema = z.strictObject({
  action: z.literal("publish"),
  ...publicationCommandCommonShape,
  candidateFoodRunId: z.uuid(),
}).superRefine((value, context) => {
  if (value.confirmation !== value.candidateFoodRunId) {
    context.addIssue({
      code: "custom",
      message: "Publish confirmation must equal the candidate Food run ID.",
      path: ["confirmation"],
    });
  }
});

const publicationWithdrawRequestSchema = z.strictObject({
  action: z.literal("withdraw"),
  ...publicationCommandCommonShape,
  candidateFoodRunId: z.null(),
  expectedCurrentPublicationId: z.uuid(),
}).superRefine((value, context) => {
  if (value.confirmation !== value.expectedCurrentPublicationId) {
    context.addIssue({
      code: "custom",
      message: "Withdrawal confirmation must equal the current publication ID.",
      path: ["confirmation"],
    });
  }
});

export const publicationCommandRequestSchema = z.union([
  publicationPublishRequestSchema,
  publicationWithdrawRequestSchema,
]).superRefine((value, context) => {
  if (value.environment === "production" && !value.gate3ApprovalId) {
    context.addIssue({
      code: "custom",
      message: "Production publication requires explicit Gate 3 approval evidence.",
      path: ["gate3ApprovalId"],
    });
  }
  if (value.environment === "development" && value.gate3ApprovalId !== null) {
    context.addIssue({
      code: "custom",
      message: "Development requests cannot claim Gate 3 approval.",
      path: ["gate3ApprovalId"],
    });
  }
});

export type AtlasPublicationManifest = z.infer<typeof atlasPublicationManifestSchema>;
export type CurrentAtlasPublication = z.infer<typeof currentAtlasPublicationSchema>;
export type PublicationCommandRequest = z.infer<typeof publicationCommandRequestSchema>;
export type PublicationRedistributionDecision = z.infer<
  typeof publicationRedistributionDecisionSchema
>;
