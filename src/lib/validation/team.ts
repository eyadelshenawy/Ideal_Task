import { z } from "zod";

export const teamCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export const teamUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  resetPassword: z.boolean().optional(),
});
