import { z } from "zod";

function emptyToUndef(v: unknown) {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

export const driverSchema = z.object({
  employeeId: z.preprocess(emptyToUndef, z.string().max(50).optional()),
  fullName: z.string().min(1, "Full name is required"),
  licenseNo: z.preprocess(emptyToUndef, z.string().optional()),
  phone: z.preprocess(emptyToUndef, z.string().optional()),
  departmentId: z.preprocess(emptyToUndef, z.string().optional()),
  isActive: z.boolean().optional(),
});

export type DriverInput = z.infer<typeof driverSchema>;
