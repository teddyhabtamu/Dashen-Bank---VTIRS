import { prisma } from "../lib/prisma.js";
import { daysUntil, getReminderWindows, DEFAULT_REMINDER_WINDOWS, type ReminderWindows } from "./reminders.js";
import { defaultPageSize, getSetting } from "./setting.js";

// ---------- generation ----------

export async function generateNotifications(userId: string) {
  const windows = await getReminderWindows();
  const horizonDays = Math.max(...windows);
  const horizon = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  const [enableReg, enableIns] = await Promise.all([
    getSetting("notify_registration", "true"),
    getSetting("notify_insurance", "true"),
  ]);

  const [expiringRegs, expiringIns] = await Promise.all([
    prisma.vehicleRegistration.findMany({
      where: {
        expiryDate: { lte: horizon },
        status: { notIn: ["SUSPENDED", "ARCHIVED"] },
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, vehicleCode: true } },
      },
    }),
    prisma.vehicleInsurance.findMany({
      where: { endDate: { lte: horizon } },
      include: {
        vehicle: { select: { id: true, plateNumber: true, vehicleCode: true } },
      },
    }),
  ]);

  let count = 0;

  if (enableReg !== "false") {
    for (const reg of expiringRegs) {
      const days = daysUntil(reg.expiryDate);
      const expired = days !== null && days < 0;
      const stage = getReminderStage(days, windows, horizonDays);
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

  if (enableIns !== "false") {
    for (const ins of expiringIns) {
      const days = daysUntil(ins.endDate);
      const expired = days !== null && days < 0;
      const stage = getReminderStage(days, windows, horizonDays);
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
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  let created = 0;
  for (const user of users) {
    created += await generateNotifications(user.id).catch(() => 0);
  }

  return created;
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

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.notification.count({ where: where as any }),
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
// does not grow unbounded. Dismissed rows no longer suppress regeneration, so
// removing them is safe.
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
