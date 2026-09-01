import { z } from "zod";
import { INSURANCE_COVERAGE_OPTIONS } from "../lib/constants.js";

function emptyToUndef(v: unknown) {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

const dateField = z.preprocess(emptyToUndef, z.string().min(1, "Required").refine((v) => {
  const d = new Date(v as string);
  return !Number.isNaN(d.getTime());
}, "Invalid date"));

// A real motor policy covers at least a month; anything shorter is a data entry
// mistake (miss-swapped start/end) rather than a legitimate short-term policy.
export const MIN_INSURANCE_DAYS = 30;

const crossDate = {
  // Only enforced when BOTH dates are provided (full create / full edit), so a
  // partial update touching just one date stays valid.
  endAfterStart: (d: { startDate?: string; endDate?: string }) => {
    const s = new Date(d.startDate as string);
    const e = new Date(d.endDate as string);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return true;
    return e.getTime() > s.getTime();
  },
  minPeriod: (d: { startDate?: string; endDate?: string }) => {
    const s = new Date(d.startDate as string);
    const e = new Date(d.endDate as string);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return true;
    return e.getTime() - s.getTime() >= MIN_INSURANCE_DAYS * 24 * 60 * 60 * 1000;
  },
};

const baseInsuranceSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  company: z.string().min(1, "Insurance company is required").max(100, "Company name is too long"),
  policyNo: z.string().min(1, "Policy number is required").max(80, "Policy number is too long"),
  coverage: z
    .string()
    .min(1, "Coverage type is required")
    .max(100, "Coverage type is too long")
    .refine((v) => INSURANCE_COVERAGE_OPTIONS.includes(v as (typeof INSURANCE_COVERAGE_OPTIONS)[number]), {
      message: `Unsupported coverage type. Use: ${INSURANCE_COVERAGE_OPTIONS.join(", ")}`,
    }),
  startDate: dateField,
  endDate: dateField,
});

export const insuranceSchema = baseInsuranceSchema
  .refine(crossDate.endAfterStart, {
    path: ["endDate"],
    message: "End date must be after start date",
  })
  .refine(crossDate.minPeriod, {
    path: ["endDate"],
    message: `Coverage must be at least ${MIN_INSURANCE_DAYS} days`,
  });

const updateSchema = baseInsuranceSchema.partial();

export const insuranceUpdateSchema = updateSchema
  .refine(crossDate.endAfterStart, {
    path: ["endDate"],
    message: "End date must be after start date",
  })
  .refine(crossDate.minPeriod, {
    path: ["endDate"],
    message: `Coverage must be at least ${MIN_INSURANCE_DAYS} days`,
  });

export type InsuranceUpdateInput = z.infer<typeof insuranceUpdateSchema>;

export type InsuranceInput = z.infer<typeof insuranceSchema>;