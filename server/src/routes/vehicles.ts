import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
  bulkDeleteVehicles,
  bulkUpdateVehicleStatus,
  DuplicateVehicleError,
} from "../services/vehicle.js";
import { listAssignments, assignDriver, returnDriver } from "../services/assignment.js";
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
    if ((e as Error).message === "Driver not found") {
      return res.status(404).json({ error: "Driver not found" });
    }
    if ((e as Error).message === "Driver is already assigned to another vehicle") {
      return res.status(409).json({ error: "Driver is already assigned to another vehicle" });
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
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { fullName: true } } } },
      images: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { fullName: true } } } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: { driver: true, branch: true },
      },
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
    if ((e as Error).message === "Driver not found") {
      return res.status(404).json({ error: "Driver not found" });
    }
    if ((e as Error).message === "Driver is already assigned to another vehicle") {
      return res.status(409).json({ error: "Driver is already assigned to another vehicle" });
    }
    throw e;
  }
});

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.VEHICLE_DELETE),
  async (req, res) => {
    try {
      const deleted = await deleteVehicle(req.params.id, {
        userId: req.session!.userId,
        req,
      });
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Cannot delete vehicle:")) {
        return res.status(409).json({ error: e.message });
      }
      throw e;
    }
  }
);

// ── Bulk operations ──────────────────────────────────────────

router.delete(
  "/bulk-delete",
  requireAuth(PERMISSIONS.VEHICLE_DELETE),
  async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids is required" });
    }
    try {
      const result = await bulkDeleteVehicles(ids, {
        userId: req.session!.userId,
        req,
      });
      res.json(result);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Cannot delete vehicle:")) {
        return res.status(409).json({ error: e.message });
      }
      throw e;
    }
  }
);

router.patch(
  "/bulk-status",
  requireAuth(PERMISSIONS.VEHICLE_EDIT),
  async (req, res) => {
    const { ids, status } = req.body as { ids: string[]; status: string };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids is required" });
    }
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }
    const result = await bulkUpdateVehicleStatus(ids, status, {
      userId: req.session!.userId,
      req,
    });
    res.json(result);
  }
);

// ── Assignments ────────────────────────────────────────────────────

router.get("/:vehicleId/assignments", requireAuth(PERMISSIONS.VEHICLE_VIEW), async (req, res) => {
  const assignments = await listAssignments(req.params.vehicleId);
  res.json({ assignments });
});

router.post("/:vehicleId/assignments", requireAuth(PERMISSIONS.VEHICLE_EDIT), async (req, res) => {
  const { driverId, branchId, note } = req.body as { driverId?: string; branchId?: string; note?: string };
  if (!driverId) return res.status(400).json({ error: "driverId is required" });
  try {
    const assignment = await assignDriver(req.params.vehicleId, { driverId, branchId: branchId ?? null, note: note ?? null }, {
      userId: req.session!.userId,
      req,
    });
    if (!assignment) return res.status(404).json({ error: "Vehicle not found" });
    res.status(201).json({ assignment });
  } catch (e: any) {
    if (e.message === "Driver not found") return res.status(404).json({ error: e.message });
    if (e.message === "Driver is already assigned to another vehicle") return res.status(409).json({ error: e.message });
    if (e.message === "Cannot assign a driver to a disposed vehicle") return res.status(409).json({ error: e.message });
    throw e;
  }
});

router.patch("/:vehicleId/assignments/:id/return", requireAuth(PERMISSIONS.VEHICLE_EDIT), async (req, res) => {
  const assignment = await returnDriver(req.params.vehicleId, req.params.id, {
    userId: req.session!.userId,
    req,
  });
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  res.json({ assignment });
});

export default router;
