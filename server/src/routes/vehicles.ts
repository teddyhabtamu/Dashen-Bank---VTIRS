import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
  DuplicateVehicleError,
} from "../services/vehicle.js";
import { vehicleSchema } from "../validation/vehicle.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", requireAuth(PERMISSIONS.VEHICLE_VIEW), async (req, res) => {
  const q = req.query;
  const result = await listVehicles({
    search: (q.search as string) ?? undefined,
    status: (q.status as string) ?? undefined,
    branchId: (q.branchId as string) ?? undefined,
    page: Number(q.page ?? "1"),
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  });
  res.json(result);
});

router.post("/", requireAuth(PERMISSIONS.VEHICLE_CREATE), async (req, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Validation failed",
      issues: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const vehicle = await createVehicle(parsed.data, {
      userId: req.session!.userId,
      req,
    });
    res.status(201).json({ vehicle });
  } catch (e) {
    if (e instanceof DuplicateVehicleError) {
      return res.status(409).json({ error: e.message, field: e.field });
    }
    throw e;
  }
});

router.get("/:id", requireAuth(PERMISSIONS.VEHICLE_VIEW), async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: req.params.id },
    include: {
      branch: true,
      department: true,
      currentDriver: true,
      registrations: { orderBy: { createdAt: "desc" }, take: 5 },
      insurances: { orderBy: { endDate: "desc" }, take: 5 },
      documents: true,
      images: true,
    },
  });
  if (!vehicle) return res.status(404).json({ error: "Not found" });
  res.json({ vehicle });
});

router.patch("/:id", requireAuth(PERMISSIONS.VEHICLE_EDIT), async (req, res) => {
  const parsed = vehicleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Validation failed",
      issues: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const vehicle = await updateVehicle(req.params.id, parsed.data, {
      userId: req.session!.userId,
      req,
    });
    if (!vehicle) return res.status(404).json({ error: "Not found" });
    res.json({ vehicle });
  } catch (e) {
    if (e instanceof DuplicateVehicleError) {
      return res.status(409).json({ error: e.message, field: e.field });
    }
    throw e;
  }
});

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.VEHICLE_DELETE),
  async (req, res) => {
    const deleted = await deleteVehicle(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }
);

export default router;
