import { prisma } from "./prisma.js";

export type AuditReq = { headers: Headers | Record<string, unknown> };

interface AuditInput {
  action: string; // CREATE | UPDATE | DELETE | LOGIN | EXPORT | APPROVE
  entity: string; // Vehicle | User | Document ...
  entityId?: string | null;
  userId?: string | null;
  vehicleId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  req?: AuditReq;
}

function getHeader(req: AuditInput["req"], name: string): string | undefined {
  if (!req) return undefined;
  const h = req.headers;
  if (h instanceof Headers) return h.get(name) ?? undefined;
  const v = (h as Record<string, unknown>)[name];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const ip =
      getHeader(input.req, "x-forwarded-for")?.split(",")[0]?.trim() ||
      getHeader(input.req, "x-real-ip");
    const ua = getHeader(input.req, "user-agent");

    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        vehicleId: input.vehicleId ?? null,
        oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
        newValue: input.newValue ? JSON.stringify(input.newValue) : null,
        ipAddress: ip,
        userAgent: ua,
      },
    });
  } catch (err) {
    // Audit failures must never break the main transaction.
    console.error("[audit] failed to write log", err);
  }
}
