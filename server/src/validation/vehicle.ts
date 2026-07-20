import { z } from "zod";
import {
  FUEL_TYPE_OPTIONS,
  TRANSMISSION_OPTIONS,
  DRIVE_TYPE_OPTIONS,
  VEHICLE_STATUS_OPTIONS,
} from "../lib/constants.js";

// Shared vehicle validation schema (single source of truth for API + UI).

// Normalize empty strings / null to undefined for optional fields.
const emptyToUndef = (v: unknown) =>
  v === "" || v === null ? undefined : v;

export const vehicleSchema = z.object({
  plateNumber: z
    .string()
    .min(2, "Plate number is required")
    .max(20)
    .transform((v) => v.trim().toUpperCase()),
  prevPlateNo: z.preprocess(emptyToUndef, z.string().max(20).optional()),
  category: z.string().min(1, "Category is required").max(50),
  type: z.string().min(1, "Type is required").max(50),
  make: z.string().min(1, "Make is required").max(50),
  model: z.string().min(1, "Model is required").max(50),
  trim: z.preprocess(emptyToUndef, z.string().max(50).optional()),
  year: z
    .number({ invalid_type_error: "Year is required" })
    .int()
    .min(1900, "Invalid year")
    .max(new Date().getFullYear() + 1, "Year is in the future"),
  color: z.preprocess(emptyToUndef, z.string().max(30).optional()),

  engineNo: z.string().min(1, "Engine number is required").max(60),
  chassisNo: z.string().min(1, "Chassis number (VIN) is required").max(60),
  engineCC: z.number().int().positive().optional().transform((v) => (v && !Number.isNaN(v) ? v : undefined)),
  fuelType: z.enum(FUEL_TYPE_OPTIONS as [string, ...string[]]),
  transmission: z.enum(TRANSMISSION_OPTIONS as [string, ...string[]]),
  driveType: z.enum(DRIVE_TYPE_OPTIONS as [string, ...string[]]).optional(),
  odometer: z.number().int().min(0).default(0),

  ownerName: z.string().min(1, "Owner name is required").max(100),
  departmentId: z.preprocess(emptyToUndef, z.string().max(30).optional()),
  branchId: z.preprocess(emptyToUndef, z.string().max(30).optional()),
  currentDriverId: z.preprocess(emptyToUndef, z.string().max(30).optional()),
  acquisitionDate: z.preprocess(emptyToUndef, z.string().optional()),
  purchaseCost: z.preprocess(
    emptyToUndef,
    z.number().nonnegative().optional()
  ),
  supplier: z.preprocess(emptyToUndef, z.string().max(100).optional()),

  status: z.enum(VEHICLE_STATUS_OPTIONS as [string, ...string[]]).default("ACTIVE"),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
