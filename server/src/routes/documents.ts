import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { prisma } from "../lib/prisma.js";
import { deleteDocument, purgeDocument, restoreDocument, updateDocument } from "../services/document.js";
import { writeAudit } from "../lib/audit.js";
import { copyFile, openFileStream, putFile } from "../lib/storage.js";
import { sha256, sniffMimeType } from "../lib/file-check.js";

const router = Router();

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

router.get("/", requireAuth(PERMISSIONS.DOCUMENT_VIEW), async (req, res) => {
  const q = (req.query.search as string) ?? "";
  const page = Number(req.query.page ?? "1");
  const pageSize = Number(req.query.pageSize ?? "25");
  const skip = (page - 1) * pageSize;
  const docWhere: any = q
    ? {
        deletedAt: null,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { originalName: { contains: q, mode: "insensitive" } },
          { vehicle: { plateNumber: { contains: q, mode: "insensitive" } } },
          { vehicle: { vehicleCode: { contains: q, mode: "insensitive" } } },
        ],
      }
    : { deletedAt: null };
  const imgWhere: any = q
    ? {
        deletedAt: null,
        OR: [
          { originalName: { contains: q, mode: "insensitive" } },
          { vehicle: { plateNumber: { contains: q, mode: "insensitive" } } },
          { vehicle: { vehicleCode: { contains: q, mode: "insensitive" } } },
        ],
      }
    : { deletedAt: null };

  const vehicleSelect = {
    select: { id: true, plateNumber: true, vehicleCode: true },
  };

  const [docs, images, docTotal, imgTotal] = await Promise.all([
    prisma.vehicleDocument.findMany({
      where: docWhere,
      include: { vehicle: vehicleSelect },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.vehicleImage.findMany({
      where: imgWhere,
      include: { vehicle: vehicleSelect },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.vehicleDocument.count({ where: docWhere }),
    prisma.vehicleImage.count({ where: imgWhere }),
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
    version: img.version,
    createdAt: img.createdAt,
    vehicle: img.vehicle,
  }));

  const allDocs = [...docs, ...normalizedImages].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Determine which documents are the latest version in their group.
  const docPairs = docs.map((d) => ({ title: d.title, category: d.category }));
  const imgPairs = normalizedImages.map((i) => ({ title: i.title, category: i.category }));
  const allPairs = [...docPairs, ...imgPairs];
  const uniquePairs = allPairs.filter(
    (p, i) => allPairs.findIndex((q) => q.title === p.title && q.category === p.category) === i
  );

  const maxVersions = new Map<string, number>();
  if (uniquePairs.length > 0) {
    const conditions = uniquePairs.map(
      (p) => `("title" = '${p.title.replace(/'/g, "''")}' AND "category" = '${p.category.replace(/'/g, "''")}')`
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ title: string; category: string; maxversion: number }>>(
      `SELECT "title", "category", MAX("version") as "maxversion" FROM "VehicleDocument" WHERE ${conditions.join(" OR ")} GROUP BY "title", "category"`
    );
    for (const r of rows) {
      maxVersions.set(`${r.title}|||${r.category}`, Number(r.maxversion));
    }
  }
  // Images also need max version check.
  if (uniquePairs.length > 0) {
    const conditions = uniquePairs.map(
      (p) => `("originalName" = '${p.title.replace(/'/g, "''")}' AND "category" = '${p.category.replace(/'/g, "''")}')`
    );
    const imgRows = await prisma.$queryRawUnsafe<Array<{ originalname: string; category: string; maxversion: number }>>(
      `SELECT "originalName", "category", MAX("version") as "maxversion" FROM "VehicleImage" WHERE ${conditions.join(" OR ")} GROUP BY "originalName", "category"`
    );
    for (const r of imgRows) {
      const key = `${r.originalname}|||${r.category}`;
      // Store separately to avoid cross-contamination with document keys.
      maxVersions.set(`img|||${key}`, Number(r.maxversion));
    }
  }

  const enriched = allDocs.map((d) => {
    const isImage = d.mimeType?.startsWith("image/");
    const key = `${d.title}|||${d.category}`;
    const maxVer = isImage ? maxVersions.get(`img|||${key}`) : maxVersions.get(key);
    return { ...d, isLatest: maxVer === undefined || d.version >= maxVer };
  });

  const total = docTotal + imgTotal;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  res.json({ documents: enriched, total, page, pageSize, totalPages });
});

router.post(
  "/",
  requireAuth(PERMISSIONS.DOCUMENT_UPLOAD),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    const { vehicleId, category, title, expiresAt } = req.body as {
      vehicleId?: string;
      category?: string;
      title?: string;
      expiresAt?: string;
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

    // Validate the file by its magic bytes, not the client-supplied MIME type.
    const actualMime = sniffMimeType(new Uint8Array(file.buffer));
    if (!actualMime) {
      return res.status(415).json({ error: "File content does not match an accepted type (PDF, JPG, PNG)." });
    }
    if (actualMime !== file.mimetype) {
      return res
        .status(415)
        .json({ error: `File signature (${actualMime}) does not match its declared type (${file.mimetype}).` });
    }

    // Duplicate detection: same content hash already stored for this vehicle.
    const contentHash = sha256(new Uint8Array(file.buffer));
    const dup = await prisma.vehicleDocument.findFirst({
      where: { vehicleId, contentHash, deletedAt: null },
      select: { title: true, category: true },
    });
    if (dup) {
      return res.status(409).json({
        error: "A file with identical content is already uploaded for this vehicle.",
        duplicate: { title: dup.title, category: dup.category },
      });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const ext = path.extname(file.originalname) || "";
    const storedName = `${randomUUID()}${ext}`;
    const sub = kind === "image" ? "images" : "documents";
    const objectKey = path.join(sub, storedName);
    await putFile(objectKey, file.buffer, actualMime);

    const baseTitle = (title && title.trim()) || file.originalname;
    const cat = category || "OTHER";

    let record: any;
    const parsedExpiry = expiresAt && !Number.isNaN(new Date(expiresAt).getTime())
      ? new Date(expiresAt)
      : null;
    if (kind === "image") {
      const existingImg = await prisma.vehicleImage.findFirst({
        where: { vehicleId, originalName: file.originalname, category: cat },
        orderBy: { version: "desc" },
      });
      const imgVersion = existingImg ? existingImg.version + 1 : 1;
      record = await prisma.vehicleImage.create({
        data: {
          vehicleId,
          category: cat,
          fileName: storedName,
          originalName: file.originalname,
          mimeType: actualMime,
          sizeBytes: file.size,
          path: objectKey,
          version: imgVersion,
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
          mimeType: actualMime,
          sizeBytes: file.size,
          path: objectKey,
          version,
          contentHash,
          documentRef: existing?.documentRef ?? randomUUID(),
          uploadedById: req.session!.userId,
          ...(parsedExpiry && { expiresAt: parsedExpiry }),
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

router.get("/trash", requireAuth(PERMISSIONS.DOCUMENT_VIEW), async (req, res) => {
  const q = (req.query.search as string) ?? "";
  const page = Number(req.query.page ?? "1");
  const pageSize = Number(req.query.pageSize ?? "25");
  const skip = (page - 1) * pageSize;
  const docWhere: any = q
    ? {
        deletedAt: { not: null },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { originalName: { contains: q, mode: "insensitive" } },
          { vehicle: { plateNumber: { contains: q, mode: "insensitive" } } },
          { vehicle: { vehicleCode: { contains: q, mode: "insensitive" } } },
        ],
      }
    : { deletedAt: { not: null } };
  const imgWhere: any = q
    ? {
        deletedAt: { not: null },
        OR: [
          { originalName: { contains: q, mode: "insensitive" } },
          { vehicle: { plateNumber: { contains: q, mode: "insensitive" } } },
          { vehicle: { vehicleCode: { contains: q, mode: "insensitive" } } },
        ],
      }
    : { deletedAt: { not: null } };

  const vehicleSelect = {
    select: { id: true, plateNumber: true, vehicleCode: true },
  };

  const [docs, images, docTotal, imgTotal] = await Promise.all([
    prisma.vehicleDocument.findMany({
      where: docWhere,
      include: { vehicle: vehicleSelect },
      orderBy: { deletedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.vehicleImage.findMany({
      where: imgWhere,
      include: { vehicle: vehicleSelect },
      orderBy: { deletedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.vehicleDocument.count({ where: docWhere }),
    prisma.vehicleImage.count({ where: imgWhere }),
  ]);

  const normalizedImages = images.map((img) => ({
    id: img.id,
    title: img.originalName,
    category: img.category,
    fileName: img.fileName,
    originalName: img.originalName,
    mimeType: img.mimeType,
    sizeBytes: img.sizeBytes,
    version: img.version,
    createdAt: img.createdAt,
    deletedAt: img.deletedAt,
    vehicle: img.vehicle,
  }));

  const allDocs = [...docs, ...normalizedImages].sort(
    (a, b) =>
      new Date(b.deletedAt ?? 0).getTime() - new Date(a.deletedAt ?? 0).getTime()
  );

  const total = docTotal + imgTotal;
  res.json({ documents: allDocs, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.post(
  "/trash/:id/restore",
  requireAuth(PERMISSIONS.DOCUMENT_DELETE),
  async (req, res) => {
    const restored = await restoreDocument(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!restored) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, record: restored });
  }
);

router.delete(
  "/trash/:id",
  requireAuth(PERMISSIONS.DOCUMENT_DELETE),
  async (req, res) => {
    const purged = await purgeDocument(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!purged) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }
);

router.get("/:id", requireAuth(PERMISSIONS.DOCUMENT_VIEW), async (req, res) => {
  // A stored file may be either a document or a vehicle image; both are
  // served through this endpoint by id.
  const file =
    (await prisma.vehicleDocument.findUnique({ where: { id: req.params.id } })) ??
    (await prisma.vehicleImage.findUnique({ where: { id: req.params.id } }));
  if (!file) return res.status(404).json({ error: "Not found" });

  const stream = await openFileStream(file.path);
  if (!stream) {
    return res.status(404).json({ error: "File missing on storage" });
  }

  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${encodeURIComponent(file.originalName)}"`
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  stream.pipe(res);
});

router.patch(
  "/:id",
  requireAuth(PERMISSIONS.DOCUMENT_UPLOAD),
  async (req, res) => {
    const { title, category, expiresAt } = req.body as { title?: string; category?: string; expiresAt?: string | null };
    if (!title?.trim() && !category && expiresAt === undefined) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await updateDocument(req.params.id, { title, category, expiresAt }, {
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

router.post(
  "/:id/restore",
  requireAuth(PERMISSIONS.DOCUMENT_UPLOAD),
  async (req, res) => {
    const doc = await prisma.vehicleDocument.findUnique({ where: { id: req.params.id } });
    const img = doc ? null : await prisma.vehicleImage.findUnique({ where: { id: req.params.id } });
    const source = doc ?? img;
    if (!source) return res.status(404).json({ error: "Not found" });

    const srcPath = source.path;
    try {
      const existing = await openFileStream(srcPath);
      if (!existing) {
        return res.status(404).json({ error: "Source file missing on storage" });
      }
      existing.destroy();
    } catch {
      return res.status(404).json({ error: "Source file missing on storage" });
    }

    const ext = path.extname(source.originalName) || "";
    const storedName = `${randomUUID()}${ext}`;
    const sub = source.path.startsWith("images") ? "images" : "documents";
    const destKey = path.join(sub, storedName);
    await copyFile(srcPath, destKey);

    const docTitle = doc?.title ?? source.originalName;
    const existing = await prisma.vehicleDocument.findFirst({
      where: { vehicleId: source.vehicleId, title: docTitle, category: source.category },
      orderBy: { version: "desc" },
    });
    const version = existing ? existing.version + 1 : 1;

    const record = await prisma.vehicleDocument.create({
      data: {
        vehicleId: source.vehicleId,
        category: source.category,
        title: docTitle,
        fileName: storedName,
        originalName: source.originalName,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        path: path.join(sub, storedName),
        version,
        contentHash: doc?.contentHash ?? undefined,
        documentRef: doc?.documentRef ?? undefined,
        uploadedById: req.session!.userId,
      },
    });

    await writeAudit({
      action: "RESTORE",
      entity: "VehicleDocument",
      entityId: record.id,
      vehicleId: source.vehicleId,
      userId: req.session!.userId,
      newValue: {
        title: record.title,
        category: record.category,
        version: record.version,
        restoredFrom: source.id,
      },
      req,
    });

    res.status(201).json({ ok: true, record });
  }
);

export default router;
