import { prisma } from "../lib/prisma.js";
import { daysUntil, getReminderHorizonDays } from "./reminders.js";
import { defaultPageSize, getSetting } from "./setting.js";

// ---------- generation ----------

export async function generateNotifications(userId: string) {
  const horizonDays = await getReminderHorizonDays();
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
      const title = expired ? "Registration Expired" : "Registration Expiring Soon";
      const message = expired
        ? `${reg.vehicle.plateNumber} (${reg.vehicle.vehicleCode}) registration expired on ${reg.expiryDate.toLocaleDateString("en-GB")}. Renew immediately.`
        : `${reg.vehicle.plateNumber} (${reg.vehicle.vehicleCode}) registration expires in ${days} day${days === 1 ? "" : "s"}.`;
      const link = `/vehicles/${reg.vehicle.id}`;
      const meta = JSON.stringify({ vehicleId: reg.vehicle.id, plateNumber: reg.vehicle.plateNumber, vehicleCode: reg.vehicle.vehicleCode });

      if (await shouldCreate(userId, "REGISTRATION_REMINDER", link, title)) {
        await create(userId, "REGISTRATION_REMINDER", title, message, link, meta);
        count++;
      }
    }
  }

  if (enableIns !== "false") {
    for (const ins of expiringIns) {
      const days = daysUntil(ins.endDate);
      const expired = days !== null && days < 0;
      const title = expired ? "Insurance Expired" : "Insurance Expiring Soon";
      const message = expired
        ? `${ins.vehicle.plateNumber} (${ins.vehicle.vehicleCode}) insurance expired on ${ins.endDate.toLocaleDateString("en-GB")}. Renew immediately.`
        : `${ins.vehicle.plateNumber} (${ins.vehicle.vehicleCode}) insurance expires in ${days} day${days === 1 ? "" : "s"}.`;
      const link = `/vehicles/${ins.vehicle.id}`;
      const meta = JSON.stringify({ vehicleId: ins.vehicle.id, plateNumber: ins.vehicle.plateNumber, vehicleCode: ins.vehicle.vehicleCode });

      if (await shouldCreate(userId, "INSURANCE_REMINDER", link, title)) {
        await create(userId, "INSURANCE_REMINDER", title, message, link, meta);
        count++;
      }
    }
  }

  return count;
}

// Only create if no matching unread notification exists, or if the status
// changed (e.g. "Expiring Soon" → "Expired") so we can send an update.
async function shouldCreate(userId: string, type: string, link: string, title: string): Promise<boolean> {
  const latest = await prisma.notification.findFirst({
    where: { userId, type, link },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return true;
  if (latest.title !== title) return true;
  if (!latest.isRead) return false;
  return false;
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
  }: {
    page?: number;
    pageSize?: number;
    type?: string;
    unreadOnly?: boolean;
  }
) {
  const ps = pageSize ?? await defaultPageSize();
  await generateNotifications(userId).catch(() => {});

  const where: Record<string, unknown> = { userId };
  if (type) where.type = type;
  if (unreadOnly) where.isRead = false;

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
  await generateNotifications(userId).catch(() => {});
  return prisma.notification.count({ where: { userId, isRead: false } as any });
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

export async function getNotificationTypes(userId: string): Promise<string[]> {
  const rows = await prisma.notification.groupBy({
    by: ["type"],
    where: { userId } as any,
    _count: { _all: true },
  });
  return rows.map((r) => r.type).sort();
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
