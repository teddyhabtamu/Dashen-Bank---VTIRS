import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// Shared list for the fleet-wide Documents page (repository + trash views).
//
// Documents and images live in two tables but render as one list. The naive
// approach (paginate each table separately, then merge) produces wrong pages:
// each query returned its OWN page 1, so the merged list is neither table's
// real page 1, and totals/pages drift. Instead we do coordinated pagination:
//
//   1. count both tables with the same filters
//   2. fetch `skip + take` rows from each table (merged-order guarantee:
//      the global page window can only contain rows from that prefix)
//   3. merge + sort with the view's ordering
//   4. slice out the exact global window
//
// This is O(skip+take) rows per table — bounded by pageSize, since we re-query
// with the page window rather than scanning everything.
// ---------------------------------------------------------------------------

export interface ListFilesOptions {
  scope: "active" | "trash";
  search?: string;
  category?: string;
  kind?: "document" | "image";
  expiryState?: "expired" | "expiring" | "valid";
  branchId?: string;
  vehicleId?: string;
  page?: number;
  pageSize?: number;
}

const EXPIRING_WINDOW_DAYS = 90;

function insensitive(v: string) {
  return { contains: v, mode: "insensitive" as const };
}

export async function listFiles(opts: ListFilesOptions) {
  const {
    scope, search, category, kind, expiryState, branchId, vehicleId,
    page = 1, pageSize = 25,
  } = opts;
  const take = Math.min(Math.max(1, pageSize), 100);
  const skip = (page - 1) * take;

  const deletedFilter = scope === "trash" ? { not: null } : null;
  const base: Record<string, unknown> = {};
  if (deletedFilter) base.deletedAt = deletedFilter;
  else base.deletedAt = null;

  const searchConditions = search
    ? {
        OR: [
          { title: insensitive(search) },
          { originalName: insensitive(search) },
          { vehicle: { plateNumber: insensitive(search) } },
          { vehicle: { vehicleCode: insensitive(search) } },
        ],
      }
    : {};
  const vehicleCond: Record<string, unknown> = {};
  if (branchId) vehicleCond.branchId = branchId;

  const mkWhere = (isDoc: boolean) => {
    const where: Record<string, any> = { ...base, ...searchConditions };
    if (category) where.category = category;
    if (Object.keys(vehicleCond).length) where.vehicle = vehicleCond;
    if (isDoc) {
      if (vehicleId) where.vehicleId = vehicleId;
      if (expiryState) {
        const now = new Date();
        const horizon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        if (expiryState === "expired") {
          where.expiresAt = { lt: now };
        } else if (expiryState === "expiring") {
          where.expiresAt = { gte: now, lte: horizon };
        } else {
          // "valid" = no expiry at all, or far in the future. Expressed as a
          // top-level OR because Prisma field filters can't nest OR.
          where.AND = [
            ...(Array.isArray(where.AND) ? where.AND : []),
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: horizon } },
              ],
            },
          ];
        }
      }
    }
    return where;
  };

  const wantDocs = kind !== "image";
  const wantImages = kind !== "document";

  const fileInclude = {
    vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, branch: { select: { name: true } } } },
    uploadedBy: { select: { fullName: true } },
  };

  const prefix = skip + take; // enough rows from each table to cover the window

  const [docs, images, docTotal, imgTotal] = await Promise.all([
    wantDocs
      ? prisma.vehicleDocument.findMany({
          where: mkWhere(true),
          include: fileInclude,
          orderBy: scope === "trash" ? { deletedAt: "desc" } : { createdAt: "desc" },
          take: prefix,
        })
      : Promise.resolve([]),
    wantImages
      ? prisma.vehicleImage.findMany({
          where: mkWhere(false),
          include: fileInclude,
          orderBy: scope === "trash" ? { deletedAt: "desc" } : { createdAt: "desc" },
          take: prefix,
        })
      : Promise.resolve([]),
    wantDocs ? prisma.vehicleDocument.count({ where: mkWhere(true) }) : Promise.resolve(0),
    wantImages ? prisma.vehicleImage.count({ where: mkWhere(false) }) : Promise.resolve(0),
  ]);

  const normalize = (isImage: boolean) => (f: any) => ({
    id: f.id,
    kind: isImage ? "image" : "document",
    uploadedBy: f.uploadedBy,
    title: isImage ? f.originalName : f.title,
    category: f.category,
    fileName: f.fileName,
    originalName: f.originalName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    version: f.version,
    expiresAt: isImage ? null : f.expiresAt ?? null,
    createdAt: f.createdAt,
    deletedAt: f.deletedAt ?? null,
    vehicle: f.vehicle,
  });

  const merged = [...docs.map(normalize(false)), ...images.map(normalize(true))].sort((a, b) => {
    const key = scope === "trash" ? "deletedAt" : "createdAt";
    return new Date((b as any)[key] ?? 0).getTime() - new Date((a as any)[key] ?? 0).getTime();
  });

  // Exact global window for this page.
  const pageRows = merged.slice(skip, skip + take);

  // "Latest" badge: max version within the same (title, category) group,
  // computed for the current page's groups via two grouped queries (one per
  // table) — replaces the old cross-vehicle raw-SQL lookup that misbadged
  // rows and interpolated strings into $queryRawUnsafe.
  const titles = Array.from(new Set(pageRows.map((f) => f.title)));
  const categories = Array.from(new Set(pageRows.map((f) => f.category)));

  const [docGroups, imgGroups] = titles.length
    ? await Promise.all([
        prisma.vehicleDocument.groupBy({
          by: ["title", "category"],
          where: { title: { in: titles }, category: { in: categories }, deletedAt: null },
          _max: { version: true },
        }),
        prisma.vehicleImage.groupBy({
          by: ["originalName", "category"],
          where: { originalName: { in: titles }, category: { in: categories }, deletedAt: null },
          _max: { version: true },
        }),
      ])
    : [[], []];

  const maxByPair = new Map<string, number>();
  for (const g of docGroups) maxByPair.set(`${g.title}|||${g.category}`, g._max.version ?? 0);
  for (const g of imgGroups) {
    const key = `${g.originalName}|||${g.category}`;
    maxByPair.set(key, Math.max(maxByPair.get(key) ?? 0, g._max.version ?? 0));
  }

  const total = docTotal + imgTotal;

  const enriched = pageRows.map((f) => ({
    ...f,
    isLatest: f.version >= (maxByPair.get(`${f.title}|||${f.category}`) ?? f.version),
  }));

  return {
    documents: enriched,
    total,
    page,
    pageSize: take,
    totalPages: Math.max(1, Math.ceil(total / take)),
  };
}
