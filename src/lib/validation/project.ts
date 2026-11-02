import { z } from "zod";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().min(1, "Code is required").max(20).transform((v) => v.toUpperCase()),
  slaTrackingEnabled: z.boolean().optional(),
  slaBusinessHours: z.boolean().optional(),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  code: z.string().trim().min(1, "Code is required").max(20).transform((v) => v.toUpperCase()).optional(),
  slaTrackingEnabled: z.boolean().optional(),
  slaBusinessHours: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  // The number the next new task's code will get, e.g. 41 -> "ABM-0041".
  nextCodeNumber: z.number().int().min(1, "Next number must be 1 or more").max(999999).optional(),
});
