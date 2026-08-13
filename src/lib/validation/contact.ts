import { z } from "zod";

export const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  projectId: z.string().nullable().optional(),
});

export const contactUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  projectId: z.string().nullable().optional(),
});
