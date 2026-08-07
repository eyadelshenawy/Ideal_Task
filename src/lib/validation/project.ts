import { z } from "zod";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().min(1, "Code is required").max(20).transform((v) => v.toUpperCase()),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  code: z.string().trim().min(1, "Code is required").max(20).transform((v) => v.toUpperCase()).optional(),
  slaTrackingEnabled: z.boolean().optional(),
});
