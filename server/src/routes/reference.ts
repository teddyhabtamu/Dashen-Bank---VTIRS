import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { ETHIOPIAN_PHONE_PATTERN } from "../validation/driver.js";

const router = Router();

// ── Branches ──────────────────────────────────────────────────────

router.get(
  "/branches",
  requireAuth(),
  async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      prisma.branch.findMany({ orderBy: { name: "asc" }, skip, take: pageSize }),
      prisma.branch.count(),
    ]);
    res.json({ rows, total, page, pageSize });
  }
);

router.post(
  "/branches",
  // Inline branch creation is part of vehicle registration (the vehicle
  // form's Add-new flow), so anyone who can create a vehicle can add a
  // branch there. Deleting branches remains BRANCH_MANAGE.
  requireAuth([PERMISSIONS.VEHICLE_CREATE, PERMISSIONS.BRANCH_MANAGE]),
  async (req, res) => {
    const { code, name, region, address } = req.body as {
      code?: string; name?: string; region?: string; address?: string;
    };
    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ error: "code and name are required" });
    }
    const branch = await prisma.branch.create({
      data: { code: code.trim(), name: name.trim(), region, address },
    });
    await writeAudit({ action: "CREATE", entity: "Branch", entityId: branch.id, userId: req.session!.userId, newValue: branch, req });
    res.status(201).json(branch);
  }
);

router.put(
  "/branches/:id",
  requireAuth(PERMISSIONS.BRANCH_MANAGE),
  async (req, res) => {
    const { code, name, region, address, isActive } = req.body as {
      code?: string; name?: string; region?: string; address?: string; isActive?: boolean;
    };
    const old = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.branch.update({
      where: { id: req.params.id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(region !== undefined && { region }),
        ...(address !== undefined && { address }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    await writeAudit({ action: "UPDATE", entity: "Branch", entityId: req.params.id, userId: req.session!.userId, oldValue: old, newValue: updated, req });
    res.json(updated);
  }
);

router.delete(
  "/branches/:id",
  requireAuth(PERMISSIONS.BRANCH_MANAGE),
  async (_req, res) => {
    const old = await prisma.branch.findUnique({ where: { id: _req.params.id } });
    if (!old) return res.status(404).json({ error: "Not found" });
    const activeVehicles = await prisma.vehicle.count({ where: { branchId: _req.params.id } });
    if (activeVehicles > 0) {
      return res.status(409).json({ error: "Cannot delete branch with active vehicles" });
    }
    await prisma.branch.delete({ where: { id: _req.params.id } });
    await writeAudit({ action: "DELETE", entity: "Branch", entityId: _req.params.id, userId: _req.session!.userId, oldValue: old, req: _req });
    res.json({ ok: true });
  }
);

// ── Departments ───────────────────────────────────────────────────

router.get(
  "/departments",
  requireAuth(),
  async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      prisma.department.findMany({ orderBy: { name: "asc" }, skip, take: pageSize }),
      prisma.department.count(),
    ]);
    res.json({ rows, total, page, pageSize });
  }
);

router.post(
  "/departments",
  // Same rationale as POST /branches: inline creation during vehicle
  // registration. Deletion remains BRANCH_MANAGE.
  requireAuth([PERMISSIONS.VEHICLE_CREATE, PERMISSIONS.BRANCH_MANAGE]),
  async (req, res) => {
    const { code, name } = req.body as { code?: string; name?: string };
    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ error: "code and name are required" });
    }
    const dept = await prisma.department.create({
      data: { code: code.trim(), name: name.trim() },
    });
    await writeAudit({ action: "CREATE", entity: "Department", entityId: dept.id, userId: req.session!.userId, newValue: dept, req });
    res.status(201).json(dept);
  }
);

router.put(
  "/departments/:id",
  requireAuth(PERMISSIONS.BRANCH_MANAGE),
  async (req, res) => {
    const { code, name, isActive } = req.body as { code?: string; name?: string; isActive?: boolean };
    const old = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: "Not found" });
    const updated = await prisma.department.update({
      where: { id: req.params.id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    await writeAudit({ action: "UPDATE", entity: "Department", entityId: req.params.id, userId: req.session!.userId, oldValue: old, newValue: updated, req });
    res.json(updated);
  }
);

router.delete(
  "/departments/:id",
  requireAuth(PERMISSIONS.BRANCH_MANAGE),
  async (_req, res) => {
    const old = await prisma.department.findUnique({ where: { id: _req.params.id } });
    if (!old) return res.status(404).json({ error: "Not found" });
    const activeDrivers = await prisma.driver.count({ where: { departmentId: _req.params.id } });
    const activeVehicles = await prisma.vehicle.count({ where: { departmentId: _req.params.id } });
    if (activeDrivers > 0 || activeVehicles > 0) {
      return res.status(409).json({ error: "Cannot delete department with active drivers or vehicles" });
    }
    await prisma.department.delete({ where: { id: _req.params.id } });
    await writeAudit({ action: "DELETE", entity: "Department", entityId: _req.params.id, userId: _req.session!.userId, oldValue: old, req: _req });
    res.json({ ok: true });
  }
);

// ── Drivers ───────────────────────────────────────────────────────

router.get(
  "/drivers",
  requireAuth(),
  async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 50);
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      prisma.driver.findMany({
        orderBy: { fullName: "asc" },
        include: { department: { select: { id: true, name: true } } },
        skip,
        take: pageSize,
      }),
      prisma.driver.count(),
    ]);
    res.json({ rows, total, page, pageSize });
  }
);

router.post(
  "/drivers",
  requireAuth(PERMISSIONS.DRIVER_MANAGE),
  async (req, res) => {
    const { employeeId, fullName, licenseNo, phone, departmentId } = req.body as {
      employeeId?: string; fullName?: string; licenseNo?: string; phone?: string; departmentId?: string;
    };
    if (!fullName?.trim()) {
      return res.status(400).json({ error: "fullName is required" });
    }
    if (phone && !ETHIOPIAN_PHONE_PATTERN.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number. Use the standard Ethiopian format, e.g. +251912345678" });
    }
    const driver = await prisma.driver.create({
      data: { employeeId: employeeId || undefined, fullName: fullName.trim(), licenseNo, phone, departmentId: departmentId || undefined },
    });
    await writeAudit({ action: "CREATE", entity: "Driver", entityId: driver.id, userId: req.session!.userId, newValue: driver, req });
    res.status(201).json(driver);
  }
);

router.put(
  "/drivers/:id",
  requireAuth(PERMISSIONS.BRANCH_MANAGE),
  async (req, res) => {
    const { employeeId, fullName, licenseNo, phone, departmentId, isActive } = req.body as {
      employeeId?: string; fullName?: string; licenseNo?: string; phone?: string; departmentId?: string; isActive?: boolean;
    };
    const old = await prisma.driver.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: "Not found" });
    if (phone && !ETHIOPIAN_PHONE_PATTERN.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number. Use the standard Ethiopian format, e.g. +251912345678" });
    }
    const updated = await prisma.driver.update({
      where: { id: req.params.id },
      data: {
        ...(employeeId !== undefined && { employeeId }),
        ...(fullName !== undefined && { fullName }),
        ...(licenseNo !== undefined && { licenseNo }),
        ...(phone !== undefined && { phone }),
        ...(departmentId !== undefined && { departmentId }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    await writeAudit({ action: "UPDATE", entity: "Driver", entityId: req.params.id, userId: req.session!.userId, oldValue: old, newValue: updated, req });
    res.json(updated);
  }
);

router.delete(
  "/drivers/:id",
  requireAuth(PERMISSIONS.DRIVER_MANAGE),
  async (_req, res) => {
    const old = await prisma.driver.findUnique({ where: { id: _req.params.id } });
    if (!old) return res.status(404).json({ error: "Not found" });
    const activeAssignments = await prisma.vehicleAssignment.count({ where: { driverId: _req.params.id, returnedAt: null } });
    if (activeAssignments > 0) {
      return res.status(409).json({ error: "Cannot delete driver with active vehicle assignments" });
    }
    await prisma.driver.delete({ where: { id: _req.params.id } });
    await writeAudit({ action: "DELETE", entity: "Driver", entityId: _req.params.id, userId: _req.session!.userId, oldValue: old, req: _req });
    res.json({ ok: true });
  }
);

router.get(
  "/lookups",
  requireAuth(PERMISSIONS.VEHICLE_VIEW),
  async (_req, res) => {
    const [branches, departments, drivers, manufacturers, types, categories] =
      await Promise.all([
        prisma.branch.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        }),
        prisma.department.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        }),
        prisma.driver.findMany({
          where: { isActive: true },
          orderBy: { fullName: "asc" },
          include: { _count: { select: { vehicles: true } } },
        }),
        prisma.manufacturer.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        }),
        prisma.vehicle.findMany({
          select: { type: true },
          distinct: ["type"],
          where: { type: { not: "" } },
        }),
        prisma.vehicle.findMany({
          select: { category: true },
          distinct: ["category"],
          where: { category: { not: "" } },
        }),
      ]);

    res.json({
      branches: branches.map((b) => ({ value: b.id, label: b.name })),
      departments: departments.map((d) => ({ value: d.id, label: d.name })),
      drivers: drivers.map((d) => ({ value: d.id, label: d.fullName, phone: d.phone, occupied: d._count.vehicles > 0 })),
      manufacturers: manufacturers.map((m) => ({ value: m.id, label: m.name })),
      vehicleTypes: types.map((t) => ({ value: t.type, label: t.type })),
      vehicleCategories: categories.map((c) => ({
        value: c.category,
        label: c.category,
      })),
    });
  }
);

export default router;
