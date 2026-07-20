import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

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
      drivers: drivers.map((d) => ({ value: d.id, label: d.fullName })),
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
