import { prisma } from "../lib/prisma.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { deleteFile } from "../lib/storage.js";

interface Ctx { userId?: string | null; req?: AuditReq }

type DocOrImg = { id: string; vehicleId: string; path: string; title?: string };

// Finds either a document or an image by id (both are served through the same
// endpoints). Returns a normalized record plus the entity type.
async function findDocOrImg(id: string): Promise<{ kind: "doc" | "img"; row: DocOrImg } | null> {
  const doc = await prisma.vehicleDocument.findUnique({ where: { id } });
  if (doc) return { kind: "doc", row: { id: doc.id, vehicleId: doc.vehicleId, path: doc.path, title: doc.title } };
  const img = await prisma.vehicleImage.findUnique({ where: { id } });
  if (img) return { kind: "img", row: { id: img.id, vehicleId: img.vehicleId, path: img.path } };
  return null;
}

export async function updateDocument(id: string, data: { title?: string; category?: string }, ctx: Ctx = {}) {
  const doc = await prisma.vehicleDocument.findUnique({ where: { id } });
  if (!doc) return null;

  const updated = await prisma.vehicleDocument.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.category !== undefined && { category: data.category }),
    },
  });

  await writeAudit({
    action: "UPDATE",
    entity: "VehicleDocument",
    entityId: id,
    vehicleId: doc.vehicleId,
    userId: ctx.userId,
    oldValue: { title: doc.title, category: doc.category },
    newValue: { title: updated.title, category: updated.category },
    req: ctx.req,
  });

  return updated;
}

// Soft delete: marks the row as deleted but keeps the stored object so the
// document can be restored from the trash (or purged permanently).
export async function deleteDocument(id: string, ctx: Ctx = {}) {
  const found = await findDocOrImg(id);
  if (!found) return null;
  if (found.kind === "doc") {
    await prisma.vehicleDocument.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: ctx.userId ?? null },
    });
  } else {
    await prisma.vehicleImage.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: ctx.userId ?? null },
    });
  }
  return { ...found.row, kind: found.kind, deletedAt: new Date() };
}

// Restores a previously soft-deleted document from the trash.
export async function restoreDocument(id: string, ctx: Ctx = {}) {
  const found = await findDocOrImg(id);
  if (!found) return null;
  if (found.kind === "doc") {
    await prisma.vehicleDocument.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  } else {
    await prisma.vehicleImage.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  }
  await writeAudit({
    action: "RESTORE_TRASH",
    entity: found.kind === "doc" ? "VehicleDocument" : "VehicleImage",
    entityId: id,
    vehicleId: found.row.vehicleId,
    userId: ctx.userId,
    newValue: { restored: true },
    req: ctx.req,
  });
  return found.row;
}

// Hard delete: removes the stored object and the row permanently.
export async function purgeDocument(id: string, ctx: Ctx = {}) {
  const found = await findDocOrImg(id);
  if (!found) return null;
  await deleteFile(found.row.path);
  if (found.kind === "doc") {
    await prisma.vehicleDocument.delete({ where: { id } });
  } else {
    await prisma.vehicleImage.delete({ where: { id } });
  }
  await writeAudit({
    action: "PURGE",
    entity: found.kind === "doc" ? "VehicleDocument" : "VehicleImage",
    entityId: id,
    vehicleId: found.row.vehicleId,
    userId: ctx.userId,
    oldValue: { purged: true },
    req: ctx.req,
  });
  return found.row;
}