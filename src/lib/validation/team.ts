import { z } from "zod";

export const teamCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["SUPER_ADMIN", "MEMBER"]).default("MEMBER"),
});

export const teamUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email("Enter a valid email").optional(),
  active: z.boolean().optional(),
  role: z.enum(["SUPER_ADMIN", "MEMBER"]).optional(),
  resetPassword: z.boolean().optional(),
  /** Switches off two-factor sign-in, e.g. when the member lost their phone. */
  resetMfa: z.boolean().optional(),
  /** Full-replacement set of project ids this member should administer. */
  projectAdminIds: z.array(z.string()).optional(),
});
