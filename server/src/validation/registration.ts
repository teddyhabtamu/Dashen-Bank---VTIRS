import { z } from "zod";
import {
  REGISTRATION_STATUS_OPTIONS,
} from "../lib/constants.js";

function emptyToUndef(v: unknown) {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

const dateField = z.preprocess(emptyToUndef, z.string().min(1, "Required").refine((v) => {
  const d = new Date(v as string);
  return !Number.isNaN(d.getTime());
}, "Invalid date"));

export const registrationSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  regNumber: z.string().min(1, "Registration number is required"),
  regDate: dateField,
  expiryDate: dateField,
  office: z.string().optional().nullable(),
  status: z.enum(REGISTRATION_STATUS_OPTIONS as [string, ...string[]]).default("ACTIVE"),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export const insuranceSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  company: z.string().min(1, "Insurance company is required"),
  policyNo: z.string().min(1, "Policy number is required"),
  coverage: z.string().min(1, "Coverage type is required"),
  startDate: dateField,
  endDate: dateField,
});

export type InsuranceInput = z.infer<typeof insuranceSchema>;
