import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { listAuditLogs, getAuditActions, getAuditEntities } from "../services/audit.js";

const router = Router();

router.get(
  "/",
  requireAuth(PERMISSIONS.AUDIT_VIEW),
  async (req, res) => {
    const q = req.query;
    const result = await listAuditLogs({
      page: Number(q.page ?? "1"),
      pageSize: Number(q.pageSize ?? "20"),
      action: (q.action as string) ?? undefined,
      entity: (q.entity as string) ?? undefined,
      userId: (q.userId as string) ?? undefined,
      from: (q.from as string) ?? undefined,
      to: (q.to as string) ?? undefined,
    });
    res.json(result);
  }
);

router.get(
  "/actions",
  requireAuth(PERMISSIONS.AUDIT_VIEW),
  async (_req, res) => {
    const actions = await getAuditActions();
    res.json(actions);
  }
);

router.get(
  "/entities",
  requireAuth(PERMISSIONS.AUDIT_VIEW),
  async (_req, res) => {
    const entities = await getAuditEntities();
    res.json(entities);
  }
);

export default router;
