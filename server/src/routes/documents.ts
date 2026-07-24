import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { prisma } from "../lib/prisma.js";
import { deleteDocument, updateDocument } from "../services/document.js";
import { writeAudit } from "../lib/audit.js";

const router = Router();

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function uploadRoot() {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

router.get("/", requireAuth(PERMISSIONS.DOCUMENT_VIEW), async (req, res) => {
  const q = (req.query.search as string) ?? "";
  const docWhere: any = q
    ? { OR: [{ title: { contains: q } }, { originalName: { contains: q } }] }
    : {};
  const imgWhere: any = q ? { originalName: { contains: q } } : {};

  const vehicleSelect = {
    select: { id: true, plateNumber: true, vehicleCode: true },
  };

  const [docs, images] = await Promise.all([
    prisma.vehicleDocument.findMany({
      where: docWhere,
      include: { vehicle: vehicleSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.vehicleImage.findMany({
      where: imgWhere,
      include: { vehicle: vehicleSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // Normalize images into the same shape the client uses for documents so
  // both appear together in the repository list.
  const normalizedImages = images.map((img) => ({
    id: img.id,
    title: img.originalName,
    category: img.category,
    fileName: img.fileName,
    originalName: img.originalName,
    mimeType: img.mimeType,
    sizeBytes: img.sizeBytes,
    version: 1,
    createdAt: img.createdAt,
    vehicle: img.vehicle,
  }));

  const documents = [...docs, ...normalizedImages].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ documents });
});

router.post(
  "/",
  requireAuth(PERMISSIONS.DOCUMENT_UPLOAD),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    const { vehicleId, category, title } = req.body as {
      vehicleId?: string;
      category?: string;
      title?: string;
    };
    const kind = (req.body.kind as string) || "document";

    if (!file) return res.status(400).json({ error: "No file provided" });
    if (!vehicleId) {
      return res.status(400).json({ error: "vehicleId is required" });
    }
    if (!ALLOWED.has(file.mimetype)) {
      return res
        .status(415)
        .json({ error: "Unsupported file type. Allowed: PDF, JPG, PNG." });
    }
    if (file.size > MAX_BYTES) {
      return res.status(413).json({ error: "File too large (max 10 MB)." });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const ext = path.extname(file.originalname) || "";
    const storedName = `${randomUUID()}${ext}`;
    const sub = kind === "image" ? "images" : "documents";
    const destDir = path.join(uploadRoot(), sub);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, storedName), file.buffer);

    const baseTitle = (title && title.trim()) || file.originalname;
    const cat = category || "OTHER";

    let record: any;
    if (kind === "image") {
      record = await prisma.vehicleImage.create({
        data: {
          vehicleId,
          category: cat,
          fileName: storedName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          path: path.join(sub, storedName),
          uploadedById: req.session!.userId,
        },
      });
    } else {
      const existing = await prisma.vehicleDocument.findFirst({
        where: { vehicleId, title: baseTitle, category: cat },
        orderBy: { version: "desc" },
      });
      const version = existing ? existing.version + 1 : 1;
      record = await prisma.vehicleDocument.create({
        data: {
          vehicleId,
          category: cat,
          title: baseTitle,
          fileName: storedName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          path: path.join(sub, storedName),
          version,
          uploadedById: req.session!.userId,
        },
      });
    }

    await writeAudit({
      action: "UPLOAD",
      entity: kind === "image" ? "VehicleImage" : "VehicleDocument",
      entityId: record.id,
      vehicleId,
      userId: req.session!.userId,
      newValue: {
        title: baseTitle,
        category: cat,
        version: record.version,
        mimeType: file.mimetype,
      },
      req,
    });

    res.status(201).json({ ok: true, record });
  }
);

router.get("/:id", requireAuth(PERMISSIONS.DOCUMENT_VIEW), async (req, res) => {
  // A stored file may be either a document or a vehicle image; both are
  // served through this endpoint by id.
  const file =
    (await prisma.vehicleDocument.findUnique({ where: { id: req.params.id } })) ??
    (await prisma.vehicleImage.findUnique({ where: { id: req.params.id } }));
  if (!file) return res.status(404).json({ error: "Not found" });

  const full = path.join(uploadRoot(), file.path);
  if (!existsSync(full)) {
    return res.status(404).json({ error: "File missing on disk" });
  }

  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${encodeURIComponent(file.originalName)}"`
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  createReadStream(full).pipe(res);
});

router.patch(
  "/:id",
  requireAuth(PERMISSIONS.DOCUMENT_UPLOAD),
  async (req, res) => {
    const { title, category } = req.body as { title?: string; category?: string };
    if (!title?.trim() && !category) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await updateDocument(req.params.id, { title, category }, {
      userId: req.session!.userId,
      req,
    });

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, record: updated });
  }
);

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.DOCUMENT_DELETE),
  async (req, res) => {
    const deleted = await deleteDocument(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }
);

export default router;
