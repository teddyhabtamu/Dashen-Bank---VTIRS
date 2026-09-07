import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  getDashboardKpis,
  getUpcomingRegistrations,
  getUpcomingInsurances,
  getVehicleDistributions,
  getRecentActivity,
} from "../services/dashboard.js";
import { getReminderWindows } from "../services/reminders.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Roles that always see org-wide numbers, even when assigned to a branch.
const HQ_ROLES = ["system_admin", "facilities_admin"];

router.get("/", requireAuth(), async (req, res) => {
  // The recent-activity feed exposes audit data (actions + usernames). The
  // Audit page requires AUDIT_VIEW; the dashboard must not leak the same rows
  // to users without it. Instead of erroring, we simply omit the feed.
  const canSeeActivity = req.session!.permissions.includes(PERMISSIONS.AUDIT_VIEW);

  // Branch scoping: users assigned to a branch (and not in an HQ role) see
  // only their branch's slice of every number below. HQ roles and unassigned
  // users keep the org-wide view.
  const session = req.session!;
  const candidateBranchId =
    session.branchId && !HQ_ROLES.includes(session.roleSlug) ? session.branchId : undefined;
  const scopeBranch = candidateBranchId
    ? await prisma.branch.findUnique({ where: { id: candidateBranchId }, select: { id: true, name: true } })
    : null;
  // A deleted branch resolves to no scope (org-wide) rather than filtering
  // every number down to zero while claiming otherwise.
  const scopeBranchId = scopeBranch ? scopeBranch.id : undefined;

  const [kpis, registrations, insurances, distributions, activity, windows] =
    await Promise.all([
      getDashboardKpis(scopeBranchId),
      getUpcomingRegistrations(undefined, 8, scopeBranchId),
      getUpcomingInsurances(undefined, 8, scopeBranchId),
      getVehicleDistributions(scopeBranchId),
      canSeeActivity ? getRecentActivity(8, true, scopeBranchId) : Promise.resolve([]),
      // Surface the configured windows so the client tiles never drift from
      // the admin settings (a hardcoded client list showed empty buckets
      // whenever the admin changed a window).
      getReminderWindows(),
    ]);
  res.json({
    kpis, registrations, insurances, distributions, activity, windows,
    asOf: new Date().toISOString(),
    scope: scopeBranch ? { branchId: scopeBranch.id, branchName: scopeBranch.name } : null,
  });
});

export default router;
