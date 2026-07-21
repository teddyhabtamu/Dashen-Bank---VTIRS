import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  getNotificationTypes,
} from "../services/notification.js";

const router = Router();

router.get("/", requireAuth(), async (req, res) => {
  const q = req.query;
  const result = await listNotifications(req.session!.userId, {
    page: Number(q.page ?? "1"),
    pageSize: Number(q.pageSize ?? "20"),
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

export default router;
