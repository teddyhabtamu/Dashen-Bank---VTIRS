import { prisma } from "../lib/prisma.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { deleteFile } from "../lib/storage.js";

interface Ctx { userId?: string | null; req?: AuditReq }

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

export async function deleteDocument(id: string, ctx: Ctx = {}) {
  const doc = await prisma.vehicleDocument.findUnique({ where: { id } });
  if (doc) {
    await deleteFile(doc.path);
    await prisma.vehicleDocument.delete({ where: { id } });
    await writeAudit({
      action: "DELETE",
      entity: "VehicleDocument",
      entityId: id,
      vehicleId: doc.vehicleId,
      userId: ctx.userId,
      oldValue: doc,
      req: ctx.req,
    });
    return doc;
  }

  // Fall back to vehicle images, which are served through the same endpoint.
  const img = await prisma.vehicleImage.findUnique({ where: { id } });
  if (img) {
    await deleteFile(img.path);
    await prisma.vehicleImage.delete({ where: { id } });
    await writeAudit({
      action: "DELETE",
      entity: "VehicleImage",
      entityId: id,
      vehicleId: img.vehicleId,
      userId: ctx.userId,
      oldValue: img,
      req: ctx.req,
    });
    return img;
  }

  return null;
}
