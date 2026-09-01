import { z } from "zod";

function emptyToUndef(v: unknown) {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

const dateField = z.preprocess(emptyToUndef, z.string().min(1, "Required").refine((v) => {
  const d = new Date(v as string);
  return !Number.isNaN(d.getTime());
}, "Invalid date"));

// `status` is intentionally NOT part of the schema: it is derived by the system
// (ACTIVE at creation, EXPIRED/PENDING_RENEWAL by the transition job, and the
// dedicated renew/suspend/archive/restore workflows) — never directly settable.
// `confirmSupersede` acknowledges that an existing live registration for the
// chosen vehicle will be archived; required when one exists (enforced in the
// service, since whether a vehicle already has a live registration is a
// data-dependent check).
export const registrationSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  regNumber: z.string().min(1, "Registration number is required"),
  regDate: dateField,
  expiryDate: dateField,
  office: z.string().optional().nullable(),
  confirmSupersede: z.boolean().optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;