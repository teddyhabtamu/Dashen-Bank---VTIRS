import { useCallback, useEffect, useState } from "react";
import { Shield, Plus, ChevronDown, ChevronRight, Check, X, Save } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { csrfHeaders } from "@/lib/csrf";
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

const PERM_CATEGORY_LABELS: Record<string, string> = {
  vehicle: "Vehicle Registry",
  registration: "Registration Management",
  insurance: "Insurance",
  document: "Documents",
  report: "Reports",
  user: "User Management",
  role: "Roles & Permissions",
  branch: "Branches",
  audit: "Audit Trail",
  setting: "System Settings",
  notification: "Notifications",
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<GroupedPerms>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({ slug: "", name: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [r, p] = await Promise.all([
      fetch("/api/roles").then((r) => r.json()),
      fetch("/api/roles/permissions").then((r) => r.json()),
    ]);
    setRoles(r ?? []);
    setPermissions(p ?? {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function expand(role: Role) {
    if (expanded === role.id) {
      setExpanded(null);
      return;
    }
    setExpanded(role.id);
    setEditPerms(new Set(role.permissions.map((p) => p.id)));
    setErr(null);
  }

  function togglePerm(permId: string) {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  }

  async function savePermissions(roleId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionIds: Array.from(editPerms) }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error ?? "Failed to save");
        return;
      }
      await load();
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
      const res = await fetch(`/api/roles/${deleteId}`, { method: "DELETE", headers: csrfHeaders() });
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Shield className="h-5 w-5 text-primary" />
          Roles & Permissions
        </h2>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Role
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BrandLoader /></div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => {
            const open = expanded === role.id;
            return (
              <div key={role.id} className="overflow-hidden rounded-lg border bg-white">
                {/* Header */}
                <button
                  onClick={() => expand(role)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{role.name}</span>
                      <span className="badge bg-slate-100 text-slate-500 font-mono text-[10px]">{role.slug}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{role.description ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                    <span>{role.userCount} user(s)</span>
                    <span>{role.permissions.length} permission(s)</span>
                  </div>
                </button>

                {/* Expanded: permission toggles */}
                {open && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    {err && (
                      <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>
                    )}
                    <div className="space-y-4">
                      {Object.entries(permissions).map(([category, perms]) => (
                        <div key={category}>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {PERM_CATEGORY_LABELS[category] ?? label(category)}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {perms.map((p) => {
                              const isDefault = role.defaults.includes(p.code);
                              const isActive = editPerms.has(p.id);
                              return (
                                <label
                                  key={p.id}
                                  title={p.description ?? p.name}
                                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                                    isDefault
                                      ? "border-primary/30 bg-primary/5 text-primary"
                                      : isActive
                                        ? "border-blue-300 bg-blue-50 text-blue-700"
                                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={() => togglePerm(p.id)}
                                    disabled={isDefault}
                                    className="sr-only"
                                  />
                                  {isActive ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-30" />}
                                  <span>{p.name}</span>
                                  {isDefault && <span className="rounded bg-primary/10 px-1 text-[9px] font-medium text-primary">default</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
                      <button className="btn-primary text-xs" onClick={() => savePermissions(role.id)} disabled={busy}>
                        <Save className="mr-1 h-3.5 w-3.5" /> {busy ? "Saving…" : "Save Permissions"}
                      </button>
                      {role.userCount === 0 && role.slug !== "system_admin" && (
                        <button className="btn-outline border-red-200 text-xs text-red-600 hover:bg-red-50" onClick={() => { setDeleteId(role.id); setErr(null); }}>
                          Delete Role
                        </button>
                      )}
                      <span className="text-[10px] text-slate-400">
                        <strong>Default</strong> permissions (blue) are baked into the role and cannot be removed here.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title="New Role"
        size="md"
        footer={
          <><button className="btn-outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={doCreate} disabled={busy}>Create Role</button></>
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
        title="Delete Role"
        message="This permanently removes the role. Users with this role will lose access."
        confirmLabel="Delete"
      />
    </div>
  );
}
