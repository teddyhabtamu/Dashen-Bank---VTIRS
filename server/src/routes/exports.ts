import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { writeAudit } from "../lib/audit.js";
import {
  EXPORT_ENTITIES,
  MAX_EXPORT_ROWS,
  buildCsv,
  getExporter,
} from "../services/export.js";

const router = Router();

// Roles that always see org-wide data, even when assigned to a branch.
const HQ_ROLES = ["system_admin", "facilities_admin"];

// Server-side CSV export: permission-checked, branch-scoped like the
// dashboard, and audit-logged per download. Excel/PDF remain client-side
// (presentation concern); CSV is the interchange format.
router.get("/:entity", requireAuth(PERMISSIONS.DATA_EXPORT), async (req, res) => {
  const exporter = getExporter(req.params.entity);
  if (!exporter) {
    return res
      .status(404)
      .json({ error: `Unknown export entity. Use one of: ${EXPORT_ENTITIES.join(", ")}` });
  }

  const q = req.query;
  const session = req.session!;
  const scopedBranchId =
    session.branchId && !HQ_ROLES.includes(session.roleSlug) ? session.branchId : undefined;

  const { rows, total, overCap } = await exporter.fetch(q, scopedBranchId);
  if (overCap) {
    return res.status(422).json({
      error: `Too many rows (${total}). Narrow the filters and try again (max ${MAX_EXPORT_ROWS}).`,
    });
  }

  const hasFilters = Object.keys(q).some(
    (k) => !["page", "pageSize"].includes(k) && q[k] !== undefined && q[k] !== ""
  );
  const scope = scopedBranchId || hasFilters ? "filtered" : "all";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `dashen-vtirs_${req.params.entity}_${scope}_${stamp}.csv`;

  await writeAudit({
    action: "EXPORT",
    entity: exporter.label,
    userId: session.userId,
    newValue: { rows: rows.length, total, scope, branchId: scopedBranchId ?? null },
    req,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Row-Count", String(rows.length));
  res.send("\uFEFF" + buildCsv(rows));
});

export default router;
