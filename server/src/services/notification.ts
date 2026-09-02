import { prisma } from "../lib/prisma.js";
import { daysUntil, getReminderWindows, getReminderWindowsByType, DEFAULT_REMINDER_WINDOWS, type ReminderWindows } from "./reminders.js";
import { defaultPageSize, getSetting } from "./setting.js";

// ---------- generation ----------

// Data shared across all users in a single sweep run. Loading this once
// instead of per user / per vehicle turns an O(users × vehicles) stream of
// settings queries into a handful — the old sweep issued tens of thousands of
// getSetting/findFirst round-trips per hour at fleet scale.
interface SweepContext {
  windows: ReminderWindows;
  windowsByType: Record<string, ReminderWindows>;
  enableReg: string;
  enableIns: string;
}

async function loadSweepContext(): Promise<SweepContext> {
  const [windows, windowsByType, enableReg, enableIns] = await Promise.all([
    getReminderWindows(),
    getReminderWindowsByType(),
    getSetting("notify_registration", "true"),
    getSetting("notify_insurance", "true"),
  ]);
  return { windows, windowsByType, enableReg, enableIns };
}

function windowsFor(ctx: SweepContext, type: string | null | undefined): ReminderWindows {
  if (!type) return ctx.windows;
  return ctx.windowsByType[type] ?? ctx.windows;
}

export async function generateNotifications(userId: string) {
  const ctx = await loadSweepContext();
  return generateNotificationsWith(userId, ctx);
}

async function generateNotificationsWith(userId: string, ctx: SweepContext) {
  const windows = ctx.windows;
  const horizonDays = Math.max(...windows);
  const horizon = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  let count = 0;

  if (ctx.enableReg !== "false") {
    const expiringRegs = await prisma.vehicleRegistration.findMany({
      where: {
        expiryDate: { lte: horizon },
        status: { notIn: ["SUSPENDED", "ARCHIVED"] },
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, type: true } },
      },
    });

    for (const reg of expiringRegs) {
      const typeWindows = windowsFor(ctx, reg.vehicle.type);
      const typeHorizon = Math.max(...typeWindows);
      const days = daysUntil(reg.expiryDate);
      const expired = days !== null && days < 0;
      // Skip entries outside this type's (narrower) horizon so per-type
      // preferences actually gate what a user is reminded about.
      if (!expired && days !== null && days > typeHorizon) continue;
      const stage = getReminderStage(days, typeWindows, typeHorizon);
      const title = expired ? "Registration Expired" : "Registration Expiring Soon";
      const message = expired
        ? `${reg.vehicle.plateNumber} (${reg.vehicle.vehicleCode}) registration expired on ${reg.expiryDate.toLocaleDateString("en-GB")}. Renew immediately.`
        : `${reg.vehicle.plateNumber} (${reg.vehicle.vehicleCode}) registration expires in ${days} day${days === 1 ? "" : "s"}.`;
      const link = `/vehicles/${reg.vehicle.id}`;
      const meta = JSON.stringify({ vehicleId: reg.vehicle.id, plateNumber: reg.vehicle.plateNumber, vehicleCode: reg.vehicle.vehicleCode, stage });

      if (await shouldCreate(userId, "REGISTRATION_REMINDER", link, title, stage)) {
        await create(userId, "REGISTRATION_REMINDER", title, message, link, meta);
        count++;
      }
    }
  }

  if (ctx.enableIns !== "false") {
    const expiringIns = await prisma.vehicleInsurance.findMany({
      where: { endDate: { lte: horizon } },
      include: {
        vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, type: true } },
      },
    });

    for (const ins of expiringIns) {
      const typeWindows = windowsFor(ctx, ins.vehicle.type);
      const typeHorizon = Math.max(...typeWindows);
      const days = daysUntil(ins.endDate);
      const expired = days !== null && days < 0;
      if (!expired && days !== null && days > typeHorizon) continue;
      const stage = getReminderStage(days, typeWindows, typeHorizon);
      const title = expired ? "Insurance Expired" : "Insurance Expiring Soon";
      const message = expired
        ? `${ins.vehicle.plateNumber} (${ins.vehicle.vehicleCode}) insurance expired on ${ins.endDate.toLocaleDateString("en-GB")}. Renew immediately.`
        : `${ins.vehicle.plateNumber} (${ins.vehicle.vehicleCode}) insurance expires in ${days} day${days === 1 ? "" : "s"}.`;
      const link = `/vehicles/${ins.vehicle.id}`;
      const meta = JSON.stringify({ vehicleId: ins.vehicle.id, plateNumber: ins.vehicle.plateNumber, vehicleCode: ins.vehicle.vehicleCode, stage });

      if (await shouldCreate(userId, "INSURANCE_REMINDER", link, title, stage)) {
        await create(userId, "INSURANCE_REMINDER", title, message, link, meta);
        count++;
      }
    }
  }

  return count;
}

export async function generateNotificationsForAllUsers() {
  const [users, ctx] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    }),
    loadSweepContext(),
  ]);

  let created = 0;
  for (const user of users) {
    created += await generateNotificationsWith(user.id, ctx).catch(() => 0);
  }

  return created;
}

// Resolve stale reminders when the underlying record is fixed.
//
// Reminders point at /vehicles/:id and carry meta.vehicleId, so resolving by
// vehicle (rather than by record id) catches every reminder shape. Two modes:
//
//   resolveRemindersForVehicle(vehicleId, type) — hard delete every reminder
//     of that type for the vehicle (all users). Used when the item is fixed
//     (renewed / new policy) or removed (archived / deleted): the alert is no
//     longer actionable for anyone, and the hourly sweep will re-create it if
//     the item expires again.
//
//   markRemindersResolvedForVehicle(vehicleId, type) — keep this variant for
//     cases where history should be preserved.
export async function resolveRemindersForVehicle(vehicleId: string, type: "REGISTRATION_REMINDER" | "INSURANCE_REMINDER") {
  const result = await prisma.notification.deleteMany({
    where: {
      type,
      link: `/vehicles/${vehicleId}`,
    },
  });
  return { resolved: result.count };
}

// Only create if no matching unread or dismissed notification exists, or if
// the status changed (e.g. "Expiring Soon" → "Expired") so we can send an
// update.
async function shouldCreate(userId: string, type: string, link: string, title: string, stage: string | null): Promise<boolean> {
  const latest = await prisma.notification.findFirst({
    where: { userId, type, link },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return true;
  if (latest.title !== title) return true;

  const metaRaw = typeof latest.meta === "string" ? safeParse(latest.meta) : latest.meta;
  const metaObj = (metaRaw && typeof metaRaw === "object" ? metaRaw : {}) as Record<string, unknown>;
  const previousStage = metaObj.stage ?? null;
  if (previousStage !== stage) return true;

  return false;
}

function getReminderStage(
  days: number | null,
  windows: ReminderWindows = DEFAULT_REMINDER_WINDOWS,
  horizonDays: number = Math.max(...DEFAULT_REMINDER_WINDOWS),
): string {
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  const [w90, w60, w30, w7] = windows;
  if (days <= w7) return "critical";
  if (days <= w30) return "warning";
  if (days <= w60) return "secondary";
  if (days <= w90) return "primary";
  if (days <= horizonDays) return "primary";
  return "outside_horizon";
}

async function create(
  userId: string,
  type: string,
  title: string,
  message: string,
  link: string,
  meta: string,
) {
  await prisma.notification.create({
    data: { userId, type, title, message, link, meta },
  });
}

// ---------- queries ----------

export async function listNotifications(
  userId: string,
  {
    page = 1,
    pageSize,
    type,
    unreadOnly,
    showDismissed,
  }: {
    page?: number;
    pageSize?: number;
    type?: string;
    unreadOnly?: boolean;
    showDismissed?: boolean;
  }
) {
  const ps = pageSize ?? await defaultPageSize();

  const where: Record<string, unknown> = { userId };
  if (type) where.type = type;
  if (unreadOnly) where.isRead = false;
  if (!showDismissed) where.dismissed = false;

  // Unread count applies the same filter (type/unread) so the page can show a
  // correct "N unread" even when paginating — counting only the current page
  // slice under-reports badly.
  const unreadWhere: Record<string, unknown> = { ...where, isRead: false };

  const [items, total, unreadTotal] = await Promise.all([
    prisma.notification.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.notification.count({ where: where as any }),
    prisma.notification.count({ where: unreadWhere as any }),
  ]);

  return {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      isRead: n.isRead,
      meta: n.meta ? safeParse(n.meta) : null,
      createdAt: n.createdAt,
    })),
    total,
    unreadTotal,
    page,
    pageSize: ps,
    totalPages: Math.ceil(total / ps),
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false, dismissed: false } as any });
}

export async function markRead(id: string, userId: string) {
  await prisma.notification.updateMany({
    where: { id, userId } as any,
    data: { isRead: true },
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false } as any,
    data: { isRead: true },
  });
}

// Bulk actions for the multi-select UI. Both are scoped to the caller's own
// notifications (IDOR-safe) and ignore rows already in the target state.
export async function bulkMarkRead(userId: string, ids: string[]) {
  if (ids.length === 0) return { updated: 0 };
  const result = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, isRead: false } as any,
    data: { isRead: true },
  });
  return { updated: result.count };
}

export async function bulkDismiss(userId: string, ids: string[]) {
  if (ids.length === 0) return { updated: 0 };
  const result = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, dismissed: false } as any,
    data: { dismissed: true },
  });
  return { updated: result.count };
}

export async function deleteNotification(id: string, userId: string) {
  await prisma.notification.updateMany({
    where: { id, userId } as any,
    data: { dismissed: true },
  });
}

export async function clearAllNotifications(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, dismissed: false } as any,
    data: { dismissed: true },
  });
}

export async function getNotificationTypes(userId: string): Promise<string[]> {
  const rows = await prisma.notification.groupBy({
    by: ["type"],
    where: { userId, dismissed: false } as any,
    _count: { _all: true },
  });
  return rows.map((r) => r.type).sort();
}

// Hard-delete dismissed notifications older than `retentionDays` so the table
// does not grow unbounded. NOTE: dismissed rows DO suppress regeneration (see
// shouldCreate — it matches any latest row, read or dismissed), so deleting
// them only means "remind me again about still-expiring items", never
// duplicate spam within a sweep.
export async function cleanupOldNotifications(retentionDays = 30): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.notification.deleteMany({
    where: {
      dismissed: true,
      createdAt: { lt: cutoff },
    } as any,
  });
  return { deleted: result.count };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
