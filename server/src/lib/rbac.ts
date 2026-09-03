// Centralized permission codes (spec §3 Expected Users, §5 RBAC).
// Format: "<resource>:<action>"
// resource: vehicle, registration, insurance, document, report,
//           user, role, branch, audit, setting, notification

export const PERMISSIONS = {
  // Vehicle registry
  VEHICLE_VIEW: "vehicle:view",
  VEHICLE_CREATE: "vehicle:create",
  VEHICLE_EDIT: "vehicle:edit",
  VEHICLE_DELETE: "vehicle:delete",

  // Registration
  REGISTRATION_MANAGE: "registration:manage",
  REGISTRATION_RENEW: "registration:renew",
  REGISTRATION_SUSPEND: "registration:suspend",

  // Insurance
  INSURANCE_MANAGE: "insurance:manage",
  INSURANCE_VIEW: "insurance:view",
  INSURANCE_RENEW: "insurance:renew",

  // Documents
  DOCUMENT_UPLOAD: "document:upload",
  DOCUMENT_VIEW: "document:view",
  DOCUMENT_DELETE: "document:delete",

  // Reports
  REPORT_VIEW: "report:view",
  REPORT_EXPORT: "report:export",

  // Drivers
  DRIVER_MANAGE: "driver:manage",

  // Admin
  USER_MANAGE: "user:manage",
  ROLE_MANAGE: "role:manage",
  BRANCH_MANAGE: "branch:manage",
  AUDIT_VIEW: "audit:view",
  SETTING_MANAGE: "setting:manage",
  NOTIFICATION_MANAGE: "notification:manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Default permission sets per role (spec §3)
export const ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  facilities_admin: [
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.VEHICLE_CREATE,
    PERMISSIONS.VEHICLE_EDIT,
    PERMISSIONS.VEHICLE_DELETE,
    PERMISSIONS.DRIVER_MANAGE,
    PERMISSIONS.REGISTRATION_MANAGE,
    PERMISSIONS.REGISTRATION_RENEW,
    PERMISSIONS.REGISTRATION_SUSPEND,
    PERMISSIONS.INSURANCE_MANAGE,
    PERMISSIONS.INSURANCE_VIEW,
    PERMISSIONS.INSURANCE_RENEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.NOTIFICATION_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
  facilities_officer: [
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.VEHICLE_CREATE,
    PERMISSIONS.VEHICLE_EDIT,
    PERMISSIONS.DRIVER_MANAGE,
    PERMISSIONS.REGISTRATION_MANAGE,
    PERMISSIONS.REGISTRATION_RENEW,
    PERMISSIONS.INSURANCE_MANAGE,
    PERMISSIONS.INSURANCE_VIEW,
    PERMISSIONS.INSURANCE_RENEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  management: [
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.INSURANCE_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
  ],
  system_admin: [
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.VEHICLE_CREATE,
    PERMISSIONS.VEHICLE_EDIT,
    PERMISSIONS.VEHICLE_DELETE,
    PERMISSIONS.DRIVER_MANAGE,
    PERMISSIONS.REGISTRATION_MANAGE,
    PERMISSIONS.REGISTRATION_RENEW,
    PERMISSIONS.REGISTRATION_SUSPEND,
    PERMISSIONS.INSURANCE_MANAGE,
    PERMISSIONS.INSURANCE_VIEW,
    PERMISSIONS.INSURANCE_RENEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.BRANCH_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.SETTING_MANAGE,
    PERMISSIONS.NOTIFICATION_MANAGE,
  ],
};

export const ROLE_DEFINITIONS: {
  slug: string;
  name: string;
  description: string;
}[] = [
  {
    slug: "facilities_admin",
    name: "Facilities Administrator",
    description: "Full CRUD, document upload and reports.",
  },
  {
    slug: "facilities_officer",
    name: "Facilities Officer",
    description: "Daily record keeping: register, edit, upload, search.",
  },
  {
    slug: "management",
    name: "Management",
    description: "Read-only dashboard and report access.",
  },
  {
    slug: "system_admin",
    name: "System Administrator",
    description: "User, role, permission, audit and configuration management.",
  },
];
