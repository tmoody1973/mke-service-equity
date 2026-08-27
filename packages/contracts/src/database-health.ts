import {z} from "zod";

export const databaseHealthResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    database: z.literal("reachable"),
    postgisVersion: z.string().min(1),
  }),
  z.object({
    status: z.literal("unconfigured"),
    database: z.literal("unconfigured"),
    postgisVersion: z.null(),
  }),
  z.object({
    status: z.literal("error"),
    database: z.union([z.literal("reachable"), z.literal("unreachable")]),
    postgisVersion: z.null(),
  }),
]);

export type DatabaseHealthResponse = z.infer<typeof databaseHealthResponseSchema>;
