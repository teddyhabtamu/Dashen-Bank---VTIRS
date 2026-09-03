import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  REPORT_BUILDERS,
  REPORT_META,
  REPORT_GROUPS,
  costByBranch,
  type ReportFilters,
} from "../services/reports.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", requireAuth(PERMISSIONS.REPORT_VIEW), async (req, res) => {
  const q = req.query;
  const filters: ReportFilters = {
    branchId: (q.branchId as string) || undefined,
    departmentId: (q.departmentId as string) || undefined,
    status: (q.status as string) || undefined,
    from: (q.from as string) || undefined,
    to: (q.to as string) || undefined,
  };
  const reportKey = (q.report as string) || "inventory";

  const [branches, departments] = await Promise.all([
    prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const builder = REPORT_BUILDERS[reportKey] ?? REPORT_BUILDERS.inventory;
  // renewalForecast is the only builder with an extra parameter — horizon in
  // months, allow-listed so arbitrary values can't trigger huge scans.
  const allowedMonths = [3, 6, 12];
  const months = allowedMonths.includes(Number(q.months)) ? Number(q.months) : 12;
  const result = reportKey === "renewalForecast"
    ? await (builder as (f: ReportFilters, months: number) => Promise<any>)(filters, months)
    : await builder(filters);

  let payload: any = result;
  if (reportKey === "cost") {
    payload = { ...result, byBranch: await costByBranch(filters) };
  }

  res.json({
    reports: { [reportKey]: payload },
    meta: REPORT_META,
    groups: REPORT_GROUPS,
    filters,
    branches,
    departments,
  });
});

export default router;
