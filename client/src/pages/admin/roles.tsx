import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Check, X, Save, Lock, Trash2 } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { label } from "@/lib/constants";

interface Perm {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface Role {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Perm[];
  defaults: string[];
  createdAt: string;
}

type GroupedPerms = Record<string, Perm[]>;
type PermSets = Record<string, Set<string>>;

const PERM_CATEGORY_LABELS: Record<string, string> = {
  vehicle: "Vehicle Registry",
  registration: "Registration Management",
  insurance: "Insurance",
  document: "Documents",
  report: "Reports",
  driver: "Drivers",
  data: "Data Export",
  user: "User Management",
  role: "Roles & Permissions",
  branch: "Branches",
  audit: "Audit Trail",
  setting: "System Settings",
  notification: "Notifications",
};

// Grants that deserve a second look before saving: user/role administration,
// raw data export and system settings. Shown with an amber marker; the
// server-side self-lockout guard remains the hard backstop.
const SENSITIVE_CODES = new Set([
  "user:manage",
  "role:manage",
  "data:export",
  "setting:manage",
]);

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<GroupedPerms>({});
  const [loading, setLoading] = useState(true);
  // Working copy of every role's explicit grants, keyed by role id. Editing
  // happens directly in the matrix; Save persists all dirty roles at once.
  const [editState, setEditState] = useState<PermSets>({});
  const [initialState, setInitialState] = useState<PermSets>({});
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({ slug: "", name: "", description: "" });

  function snapshot(rs: Role[]): PermSets {
    const s: PermSets = {};
    for (const r of rs) s[r.id] = new Set(r.permissions.map((p) => p.id));
    return s;
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [r, p] = await Promise.all([
      fetch("/api/roles").then((r) => r.json()),
      fetch("/api/roles/permissions").then((r) => r.json()),
    ]);
    const nextRoles: Role[] = r ?? [];
    setRoles(nextRoles);
    setPermissions(p ?? {});
    const snap = snapshot(nextRoles);
    setEditState(snap);
    setInitialState(Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, new Set(v)])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function togglePerm(roleId: string, permId: string, locked: boolean) {
    if (locked) return;
    setEditState((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? []);
      if (set.has(permId)) set.delete(permId);
      else set.add(permId);
      next[roleId] = set;
      return next;
    });
  }

  function setsEqual(a: Set<string> = new Set(), b: Set<string> = new Set()): boolean {
    if (a.size !== b.size) return false;
    for (const id of a) if (!b.has(id)) return false;
    return true;
  }

  function dirtyRoleIds(): string[] {
    return roles.filter((r) => !setsEqual(editState[r.id], initialState[r.id])).map((r) => r.id);
  }
  const dirtyCount = dirtyRoleIds().length;

  // Effective permissions = explicit DB links ∪ code defaults (what the role
  // can actually do — mirrors resolveSession server-side). Computed from the
  // working copy so the count reacts live as you toggle.
  const permCodeById = (() => {
    const m = new Map<string, string>();
    for (const perms of Object.values(permissions)) for (const p of perms) m.set(p.id, p.code);
    return m;
  })();

  function effectiveCount(role: Role): number {
    const codes = new Set(role.defaults);
    for (const id of editState[role.id] ?? []) {
      const code = permCodeById.get(id);
      if (code) codes.add(code);
    }
    return codes.size;
  }

  async function saveAll() {
    const dirty = dirtyRoleIds();
    if (dirty.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      for (const roleId of dirty) {
        const res = await fetch(`/api/roles/${roleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionIds: Array.from(editState[roleId] ?? []) }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const name = roles.find((r) => r.id === roleId)?.name ?? roleId;
          throw new Error(data.error ?? `Failed to save ${name}`);
        }
        // Mark this role clean immediately so a later failure doesn't
        // re-submit already-saved roles on retry.
        setInitialState((prev) => ({ ...prev, [roleId]: new Set(editState[roleId] ?? []) }));
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error ?? "Failed to create role");
        return;
      }
      setCreateOpen(false);
      setForm({ slug: "", name: "", description: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roles/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error ?? "Failed to delete");
        return;
      }
      setDeleteId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const createValid = form.name.trim().length > 0 && form.slug.trim().length > 0;
  const deleteRole = roles.find((r) => r.id === deleteId) ?? null;
  const categories = Object.entries(permissions);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Roles &amp; Permissions</h2>
          <p className="text-sm text-slate-500">Compare roles side by side — toggle grants directly in the matrix</p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-xs font-medium text-amber-700">
              {dirtyCount} role{dirtyCount === 1 ? "" : "s"} changed
            </span>
          )}
          <button
            className="btn-primary"
            onClick={saveAll}
            disabled={busy || dirtyCount === 0}
            title={dirtyCount === 0 ? "No changes to save" : `Save changes to ${dirtyCount} role(s)`}
          >
            <Save className="mr-1 h-4 w-4" /> {busy ? "Saving…" : "Save All Changes"}
          </button>
          <button className="btn-outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Role
          </button>
        </div>
      </div>

      {loading ? (
        <BrandLoader />
      ) : roles.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-base font-semibold text-slate-700">No roles found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">Create a role to start assigning permissions.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {err && (
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>
            </div>
          )}
          <div className="overflow-x-auto [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 min-w-[220px] bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Permission
                  </th>
                  {roles.map((role) => (
                    <th key={role.id} className="min-w-[150px] px-3 py-3 text-center align-top">
                      <div className="flex flex-col items-center gap-1">
                        <span className="max-w-[170px] truncate font-semibold text-slate-800" title={role.description ?? role.name}>
                          {role.name}
                        </span>
                        <span className="badge bg-slate-100 font-mono text-[10px] text-slate-500">{role.slug}</span>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Link
                            to={`/admin/users?role=${role.slug}`}
                            className="hover:text-primary hover:underline"
                            title={`View users with the ${role.name} role`}
                          >
                            {role.userCount} user{role.userCount === 1 ? "" : "s"}
                          </Link>
                          <span title="Explicit grants plus built-in defaults — what this role can actually do">
                            {effectiveCount(role)} effective
                          </span>
                          {role.userCount === 0 && role.slug !== "system_admin" && (
                            <button
                              onClick={() => { setDeleteId(role.id); setErr(null); }}
                              className="rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 sm:p-0.5"
                              title={`Delete the ${role.name} role`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(([category, perms]) => (
                  <Fragment key={category}>
                    <tr key={`cat-${category}`} className="bg-slate-50/70">
                      <td
                        colSpan={roles.length + 1}
                        className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                      >
                        {PERM_CATEGORY_LABELS[category] ?? label(category)}
                      </td>
                    </tr>
                    {perms.map((p) => (
                      <tr key={p.id} className="group border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-slate-50">
                          <div className="flex items-center gap-1.5">
                            {SENSITIVE_CODES.has(p.code) && (
                              <span
                                className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"
                                title="Sensitive grant — review carefully before assigning"
                              />
                            )}
                            <span className="truncate text-[13px] text-slate-700" title={p.description ?? p.name}>
                              {p.name}
                            </span>
                          </div>
                        </td>
                        {roles.map((role) => {
                          const locked = role.defaults.includes(p.code);
                          const granted = locked || (editState[role.id]?.has(p.id) ?? false);
                          return (
                            <td key={role.id} className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => togglePerm(role.id, p.id, locked)}
                                disabled={locked}
                                title={
                                  locked
                                    ? `${p.name} is baked into ${role.name} and cannot be removed here`
                                    : granted
                                      ? `Revoke ${p.name} from ${role.name}`
                                      : `Grant ${p.name} to ${role.name}`
                                }
                                aria-pressed={granted}
                                aria-label={`${p.name} for ${role.name}: ${locked ? "locked default" : granted ? "granted" : "denied"}`}
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors sm:h-6 sm:w-6 ${
                                  locked
                                    ? "cursor-not-allowed border-primary/30 bg-primary/5 text-primary"
                                    : granted
                                      ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                      : "border-slate-200 text-transparent hover:border-slate-300 hover:text-slate-300"
                                }`}
                              >
                                {locked ? (
                                  <Lock className="h-3 w-3" />
                                ) : granted ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <span className="text-[11px] text-slate-400">
              <Lock className="mr-1 inline h-3 w-3" />
              Locked = baked into the role and cannot be removed here. Amber dots mark sensitive grants.
            </span>
            <button
              className="btn-primary text-xs"
              onClick={saveAll}
              disabled={busy || dirtyCount === 0}
            >
              <Save className="mr-1 h-3.5 w-3.5" /> {busy ? "Saving…" : dirtyCount > 0 ? `Save All Changes (${dirtyCount})` : "Save All Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title="New Role"
        size="md"
        footer={
          <>
            <button className="btn-outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
            <button
              className="btn-primary"
              onClick={doCreate}
              disabled={busy || !createValid}
              title={createValid ? "Create role" : "Name and slug are required"}
            >
              Create Role
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="text-sm">Name *
            <input className="input mt-1" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              disabled={busy} placeholder="e.g. Fleet Manager" />
          </label>
          <label className="text-sm">Slug *
            <input className="input mt-1 font-mono text-xs" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              disabled={busy} placeholder="fleet_manager" />
          </label>
          <label className="text-sm">Description
            <textarea className="input mt-1" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={busy} placeholder="What this role can do…" />
          </label>
          {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        </div>
      </Modal>

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={doDelete}
        loading={busy}
        title={`Delete Role${deleteRole ? ` "${deleteRole.name}"` : ""}`}
        message="This permanently removes the role. Users with this role will lose access."
        confirmLabel="Delete"
      />
    </div>
  );
}
