// Centralized domain constants for VTIRS.
// SQLite has no native enums, so allowed values live here and are reused
// across validation (zod), UI selects, and server logic.

export const BRAND = {
  name: "Dashen Bank",
  system: "Vehicle Technical Identification & Registration System",
  short: "VTIRS",
} as const;

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  LOCKED: "LOCKED",
} as const;
export const USER_STATUS_OPTIONS = Object.values(USER_STATUS);

export const FUEL_TYPE = {
  PETROL: "PETROL",
  DIESEL: "DIESEL",
  ELECTRIC: "ELECTRIC",
  HYBRID: "HYBRID",
  CNG: "CNG",
  LPG: "LPG",
} as const;
export const FUEL_TYPE_OPTIONS = Object.values(FUEL_TYPE);

export const TRANSMISSION = {
  MANUAL: "MANUAL",
  AUTOMATIC: "AUTOMATIC",
  CVT: "CVT",
  SEMI_AUTOMATIC: "SEMI_AUTOMATIC",
} as const;
export const TRANSMISSION_OPTIONS = Object.values(TRANSMISSION);

export const DRIVE_TYPE = {
  FWD: "FWD",
  RWD: "RWD",
  AWD: "AWD",
  FOUR_WD: "FOUR_WD",
} as const;
export const DRIVE_TYPE_OPTIONS = Object.values(DRIVE_TYPE);

export const VEHICLE_STATUS = {
  ACTIVE: "ACTIVE",
  UNDER_MAINTENANCE: "UNDER_MAINTENANCE",
  ASSIGNED: "ASSIGNED",
  RESERVED: "RESERVED",
  DISPOSED: "DISPOSED",
} as const;
export const VEHICLE_STATUS_OPTIONS = Object.values(VEHICLE_STATUS);

export const REGISTRATION_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING_RENEWAL: "PENDING_RENEWAL",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
} as const;
export const REGISTRATION_STATUS_OPTIONS = Object.values(REGISTRATION_STATUS);

export const DOCUMENT_CATEGORY = {
  REGISTRATION_CERT: "REGISTRATION_CERT",
  INSURANCE_CERT: "INSURANCE_CERT",
  PURCHASE_AGREEMENT: "PURCHASE_AGREEMENT",
  INSPECTION_CERT: "INSPECTION_CERT",
  SERVICE_RECORD: "SERVICE_RECORD",
  OTHER: "OTHER",
} as const;
export const DOCUMENT_CATEGORY_OPTIONS = Object.values(DOCUMENT_CATEGORY);

export const IMAGE_CATEGORY = {
  CHASSIS: "CHASSIS",
  ENGINE: "ENGINE",
  VEHICLE: "VEHICLE",
  OTHER: "OTHER",
} as const;
export const IMAGE_CATEGORY_OPTIONS = Object.values(IMAGE_CATEGORY);

export const NOTIFICATION_TYPE = {
  REGISTRATION_REMINDER: "REGISTRATION_REMINDER",
  INSURANCE_REMINDER: "INSURANCE_REMINDER",
  EXPIRED_DOCUMENT: "EXPIRED_DOCUMENT",
  SYSTEM: "SYSTEM",
} as const;
export const NOTIFICATION_TYPE_OPTIONS = Object.values(NOTIFICATION_TYPE);

// Human-friendly labels for enums (used in UI dropdowns & reports).
export const LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  LOCKED: "Locked",
  PETROL: "Petrol",
  DIESEL: "Diesel",
  ELECTRIC: "Electric",
  HYBRID: "Hybrid",
  CNG: "CNG",
  LPG: "LPG",
  MANUAL: "Manual",
  AUTOMATIC: "Automatic",
  CVT: "CVT",
  SEMI_AUTOMATIC: "Semi-Automatic",
  FWD: "Front-Wheel Drive",
  RWD: "Rear-Wheel Drive",
  AWD: "All-Wheel Drive",
  FOUR_WD: "4WD",
  UNDER_MAINTENANCE: "Under Maintenance",
  ASSIGNED: "Assigned",
  RESERVED: "Reserved",
  DISPOSED: "Disposed",
  PENDING_RENEWAL: "Pending Renewal",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  REGISTRATION_CERT: "Registration Certificate",
  INSURANCE_CERT: "Insurance Certificate",
  PURCHASE_AGREEMENT: "Purchase Agreement",
  INSPECTION_CERT: "Inspection Certificate",
  SERVICE_RECORD: "Service Record",
  OTHER: "Other",
  REGISTRATION_REMINDER: "Registration Reminder",
  INSURANCE_REMINDER: "Insurance Reminder",
  EXPIRED_DOCUMENT: "Expired Document",
  SYSTEM: "System",
};

export function label(value: string | null | undefined): string {
  if (!value) return "-";
  return LABELS[value] ?? value;
}
