import { prisma } from "../lib/prisma.js";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { writeAudit, type AuditReq } from "../lib/audit.js";

interface Ctx { userId?: string | null; req?: AuditReq }

function uploadRoot() {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

async function deleteFileSafe(relPath: string) {
  try {
    await unlink(path.join(uploadRoot(), relPath));
  } catch {
    // file may already be missing; ignore
  }
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

export async function deleteDocument(id: string, ctx: Ctx = {}) {
  const doc = await prisma.vehicleDocument.findUnique({ where: { id } });
  if (doc) {
    await deleteFileSafe(doc.path);
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
    await deleteFileSafe(img.path);
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
