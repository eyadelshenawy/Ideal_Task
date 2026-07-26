import { z } from "zod";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});
