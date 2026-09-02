import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  bulkMarkRead,
  bulkDismiss,
  getNotificationTypes,
  deleteNotification,
  clearAllNotifications,
} from "../services/notification.js";

const router = Router();

router.get("/", requireAuth(), async (req, res) => {
  const q = req.query;
  const result = await listNotifications(req.session!.userId, {
    page: Number(q.page ?? "1"),
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    type: (q.type as string) ?? undefined,
    unreadOnly: q.unreadOnly === "true",
  });
  res.json(result);
});

router.get("/unread-count", requireAuth(), async (req, res) => {
  const count = await getUnreadCount(req.session!.userId);
  res.json({ count });
});

router.get("/types", requireAuth(), async (req, res) => {
  const types = await getNotificationTypes(req.session!.userId);
  res.json(types);
});

router.patch("/:id/read", requireAuth(), async (req, res) => {
  await markRead(req.params.id, req.session!.userId);
  res.json({ ok: true });
});

router.post("/read-all", requireAuth(), async (req, res) => {
  await markAllRead(req.session!.userId);
  res.json({ ok: true });
});

// Bulk actions from the multi-select UI: { action: "read" | "dismiss", ids: string[] }
router.post("/bulk", requireAuth(), async (req, res) => {
  const { action, ids } = (req.body ?? {}) as { action?: string; ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
    return res.status(422).json({ error: "ids (string[]) is required" });
  }
  if (ids.length > 500) {
    return res.status(422).json({ error: "Too many ids at once (max 500)" });
  }
  if (action === "read") {
    const result = await bulkMarkRead(req.session!.userId, ids);
    return res.json({ ok: true, updated: result.updated });
  }
  if (action === "dismiss") {
    const result = await bulkDismiss(req.session!.userId, ids);
    return res.json({ ok: true, updated: result.updated });
  }
  return res.status(422).json({ error: "action must be 'read' or 'dismiss'" });
});

router.delete("/:id", requireAuth(), async (req, res) => {
  await deleteNotification(req.params.id, req.session!.userId);
  res.json({ ok: true });
});

router.delete("/", requireAuth(), async (req, res) => {
  await clearAllNotifications(req.session!.userId);
  res.json({ ok: true });
});

export default router;
