import {z} from "zod";
import {currentAtlasPublicationSchema} from "./publication";

export const atlasModeSchema = z.enum(["published", "validated_preview"]);

export const atlasUnavailableReasonSchema = z.enum([
  "no_published_run",
  "preview_not_allowed",
  "run_not_found",
  "run_not_validated",
  "data_incomplete",
]);

export const atlasRunSummarySchema = z.strictObject({
  id: z.uuid(),
  methodologyVersion: z.string().trim().min(1),
  equityBaselineMethodologyVersion: z.string().trim().min(1),
  completedAt: z.iso.datetime({offset: true}),
  dataVintages: z.record(z.string().trim().min(1), z.string().trim().min(1)),
  publication: currentAtlasPublicationSchema.nullable().default(null),
});

export function refineAtlasRunPublication(
  value: {mode: z.infer<typeof atlasModeSchema>; run: z.infer<typeof atlasRunSummarySchema>},
  context: z.RefinementCtx,
): void {
  if (value.mode === "published" && value.run.publication === null) {
    context.addIssue({
      code: "custom",
      message: "Published Atlas data requires immutable publication identity.",
      path: ["run", "publication"],
    });
  }
  if (value.mode === "validated_preview" && value.run.publication !== null) {
    context.addIssue({
      code: "custom",
      message: "Validated preview cannot claim publication identity.",
      path: ["run", "publication"],
    });
  }
}

export type AtlasMode = z.infer<typeof atlasModeSchema>;
export type AtlasRunSummary = z.infer<typeof atlasRunSummarySchema>;
export type AtlasUnavailableReason = z.infer<typeof atlasUnavailableReasonSchema>;
