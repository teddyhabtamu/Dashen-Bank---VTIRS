import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  deleteDriver,
  DuplicateDriverError,
} from "../services/driver.js";
import { transferDriver } from "../services/assignment.js";
import { driverSchema } from "../validation/driver.js";

const router = Router();

// Driver READS are open to every authenticated user: driver names already
// appear across the registry, vehicle detail, search and dashboards, and
// those surfaces link here — a read wall only produced 403 dead-ends.
// All mutations (create/edit/delete/transfer) require DRIVER_MANAGE.
router.get("/", requireAuth(), async (req, res) => {
  const q = req.query;
  const result = await listDrivers({
    search: (q.search as string) ?? undefined,
    departmentId: (q.departmentId as string) ?? undefined,
    status: (q.status as string) ?? undefined,
    branchId: (q.branchId as string) ?? undefined,
    unassigned: q.unassigned === "true",
    page: Number(q.page ?? "1"),
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  });
  res.json(result);
});

router.post("/", requireAuth(PERMISSIONS.DRIVER_MANAGE), async (req, res) => {
  const parsed = driverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Validation failed",
      issues: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const driver = await createDriver(parsed.data, {
      userId: req.session!.userId,
      req,
    });
    res.status(201).json({ driver });
  } catch (e) {
    if (e instanceof DuplicateDriverError) {
      return res.status(409).json({ error: e.message, field: e.field });
    }
    throw e;
  }
});

router.get("/:id", requireAuth(), async (req, res) => {
  const driver = await getDriver(req.params.id);
  if (!driver) return res.status(404).json({ error: "Not found" });
  res.json({ driver });
});

router.patch("/:id", requireAuth(PERMISSIONS.DRIVER_MANAGE), async (req, res) => {
  const parsed = driverSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Validation failed",
      issues: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const driver = await updateDriver(req.params.id, parsed.data, {
      userId: req.session!.userId,
      req,
    });
    if (!driver) return res.status(404).json({ error: "Not found" });
    res.json({ driver });
  } catch (e) {
    if (e instanceof DuplicateDriverError) {
      return res.status(409).json({ error: e.message, field: e.field });
    }
    throw e;
  }
});

router.delete("/:id", requireAuth(PERMISSIONS.DRIVER_MANAGE), async (req, res) => {
  try {
    const driver = await deleteDriver(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!driver) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Cannot delete driver")) {
      return res.status(409).json({ error: e.message });
    }
    throw e;
  }
});

// Transfer a vehicle to this driver (reassign between drivers).
router.post("/:id/transfer", requireAuth(PERMISSIONS.DRIVER_MANAGE), async (req, res) => {
  const { vehicleId } = req.body as { vehicleId?: string };
  if (!vehicleId) return res.status(400).json({ error: "vehicleId is required" });
  try {
    const result = await transferDriver(vehicleId, req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!result) return res.status(404).json({ error: "Vehicle not found" });
    res.json(result);
  } catch (e: any) {
    if (e.message === "Driver not found") return res.status(404).json({ error: e.message });
    if (e.message === "Driver is already assigned to this vehicle") return res.status(409).json({ error: e.message });
    if (e.message === "Cannot assign a driver to a disposed vehicle") return res.status(409).json({ error: e.message });
    throw e;
  }
});

export default router;
