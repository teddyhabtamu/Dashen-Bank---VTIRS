import { z } from "zod";

function emptyToUndef(v: unknown) {
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

export const ETHIOPIAN_PHONE_PATTERN = /^\+251[97]\d{8}$/;

// Normalize free-form phone input (09…, 251…, +, spaces, dashes) to the
// canonical +2519/7XXXXXXXX Ethiopian format.
export function formatEthiopianPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("251")) national = national.slice(3);
  if (national.startsWith("0")) national = national.slice(1);
  return "+251" + national.slice(0, 9);
}

export const driverSchema = z.object({
  employeeId: z.preprocess(emptyToUndef, z.string().max(50).nullable().optional()),
  fullName: z.string().min(1, "Full name is required"),
  licenseNo: z.preprocess(emptyToUndef, z.string().nullable().optional()),
  licenseExpiry: z.preprocess(
    emptyToUndef,
    z
      .string()
      .refine((v) => !Number.isNaN(new Date(v as string).getTime()), "Invalid date")
      .nullable()
      .optional()
  ),
  phone: z.preprocess(
    emptyToUndef,
    z
      .string()
      .regex(
        ETHIOPIAN_PHONE_PATTERN,
        "Invalid phone number. Use the standard Ethiopian format, e.g. +251912345678 (+251 followed by 9 or 7 and 8 digits)"
      )
      .nullable()
      .optional()
  ),
  departmentId: z.preprocess(emptyToUndef, z.string().nullable().optional()),
  isActive: z.boolean().optional(),
});

export type DriverInput = z.infer<typeof driverSchema>;
