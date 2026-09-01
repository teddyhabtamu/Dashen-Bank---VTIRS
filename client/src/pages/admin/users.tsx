import { useCallback, useEffect, useState } from "react";
import { Users, Search, Plus, MoreVertical, Pencil, Trash2, Download } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown } from "@/components/ui/dropdown";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/format";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable } from "@/lib/export";
import { useBrand } from "@/lib/brand-context";
import { Tooltip } from "@/components/ui/tooltip";

interface UserRow {
  id: string;
  username: string;
  email: string;
  fullName: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  roleSlug: string;
  roleName: string;
  branchName: string | null;
  branchId: string | null;
}

interface RoleOption {
  id: string;
  slug: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export default function UsersPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { companyName } = useBrand();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  const [form, setForm] = useState({
    username: "",
    email: "",
    fullName: "",
    password: "",
    roleId: "",
    branchId: "",
    status: "ACTIVE",
  });
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/users/roles").then((r) => r.json()).then(setRoles).catch(() => {});
    fetch("/api/reference/lookups")
      .then((r) => r.json())
      .then((d) => setBranches((d.branches ?? []).map((b: { value: string; label: string }) => ({ id: b.value, name: b.label }))))
      .catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (search) qs.set("search", search);
    if (roleFilter) qs.set("role", roleFilter);
    if (statusFilter) qs.set("status", statusFilter);
    const res = await fetch(`/api/users?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setLoading(false);
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function exportUsers(format: "csv" | "excel" | "pdf") {
    const data = rows.map((u) => ({
      Username: u.username,
      "Full Name": u.fullName,
      Email: u.email,
      Role: u.roleName,
      Branch: u.branchName ?? "",
      Status: u.status,
      "Last Login": u.lastLoginAt ?? "",
      "Created At": u.createdAt,
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") exportCsv(`users_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`users_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable("Users", data), "Users", companyName);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function resetForm() {
    setForm({ username: "", email: "", fullName: "", password: "", roleId: "", branchId: "", status: "ACTIVE" });
    setFieldErrors({});
    setErr(null);
  }

  async function openCreate() {
    resetForm();
    setEditId(null);
    setFormOpen(true);
  }

  async function openEdit(row: UserRow) {
    resetForm();
    setEditId(row.id);
    setForm({
      username: row.username,
      email: row.email,
      fullName: row.fullName,
      password: "",
      roleId: roles.find((r) => r.slug === row.roleSlug)?.id ?? "",
      branchId: row.branchId ?? "",
      status: row.status,
    });
    setFormOpen(true);
  }

  async function doSave() {
    setBusy(true);
    setErr(null);
    setFieldErrors({});

    const url = editId ? `/api/users/${editId}` : "/api/users";
    const method = editId ? "PATCH" : "POST";
    const body: Record<string, unknown> = {
      fullName: form.fullName,
      email: form.email,
      roleId: form.roleId,
      status: form.status,
    };
    if (!editId) {
      body.username = form.username;
      body.password = form.password;
    }
    if (form.password && editId) body.password = form.password;
    if (form.branchId) body.branchId = form.branchId;
    else body.branchId = null;

    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (data.issues) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.issues)) {
            if (Array.isArray(v)) flat[k] = v[0] as string;
          }
          setFieldErrors(flat);
        }
        setErr(data.error ?? "Failed to save user");
        return;
      }
      setFormOpen(false);
      toast("success", editId ? "User updated" : "User created");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${deleteId}`, { method: "DELETE" });
      if (!res.ok) return;
      setDeleteId(null);
      toast("success", "User deleted");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-500">Manage system users, roles &amp; access</p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "CSV", onClick: () => exportUsers("csv") },
                { label: "Excel", onClick: () => exportUsers("excel") },
                { label: "PDF", onClick: () => exportUsers("pdf") },
              ]}
            />
          )}
          {can("user:manage") && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add User
            </button>
          )}
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-full pl-9"
            placeholder="Search name, username, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); load(); } }}
          />
        </div>
        <Select
          className="w-full sm:w-44"
          value={roleFilter}
          onChange={(v) => { setRoleFilter(v); setPage(1); }}
          placeholder="All Roles"
          options={[
            { value: "", label: "All Roles" },
            ...roles.map((r) => ({ value: r.slug, label: r.name })),
          ]}
        />
        <Select
          className="w-full sm:w-36"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={STATUS_OPTIONS}
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <BrandLoader />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-700">No users found</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-400">No users match the current filters.</p>
          </div>
        ) : (
          <>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-600">{total} user(s)</span>
          <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
        </div>
        <div className="hidden min-w-0 sm:block">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="text-sm hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.username}</td>
                  <td className="px-4 py-3 text-slate-600">{row.email}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-blue-100 text-blue-700">{row.roleName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Dropdown
                      align="right"
                      trigger={({ toggle }) => (
                        <button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                      items={[
                        { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(row) },
                        { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(row.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 sm:hidden">
          {rows.map((row) => (
            <div key={row.id} className="space-y-2 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-800">{row.fullName}</div>
                  <div className="font-mono text-xs text-slate-500">@{row.username}</div>
                </div>
                <span className={`badge whitespace-nowrap ${row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {row.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-slate-500">Email:</span>
                <span className="text-slate-700">{row.email}</span>
                <span className="text-slate-500">Role:</span>
                <span className="text-slate-700">{row.roleName}</span>
                {row.branchName && <><span className="text-slate-500">Branch:</span><span className="text-slate-700">{row.branchName}</span></>}
                <span className="text-slate-500">Last Login:</span>
                <span className="text-slate-400">{row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "—"}</span>
              </div>
              <div className="flex justify-end pt-1">
                <Dropdown
                  align="right"
                  trigger={({ toggle }) => (
                    <button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  )}
                  items={[
                    { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(row) },
                    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(row.id) },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:px-5">
          <span className="text-sm font-medium text-slate-600">{total} user(s)</span>
          <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editId ? "Edit User" : "Create User"}
        size="lg"
        footer={
          <>
            <button className="btn-outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={doSave} disabled={busy}>
              {busy ? "Saving…" : editId ? "Save Changes" : "Create User"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Full Name *
            <input className={`input mt-1 ${fieldErrors.fullName ? "border-red-400" : ""}`}
              value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={busy} />
            {fieldErrors.fullName && <p className="mt-0.5 text-xs text-red-500">{fieldErrors.fullName}</p>}
          </label>
          <label className="text-sm">
            Email *
            <input className={`input mt-1 ${fieldErrors.email ? "border-red-400" : ""}`}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={busy || !!editId} />
            {fieldErrors.email && <p className="mt-0.5 text-xs text-red-500">{fieldErrors.email}</p>}
          </label>
          <label className="text-sm">
            Username *
            <input className={`input mt-1 ${fieldErrors.username ? "border-red-400" : ""}`}
              value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={busy || !!editId} />
            {fieldErrors.username && <p className="mt-0.5 text-xs text-red-500">{fieldErrors.username}</p>}
          </label>
          <label className="text-sm">
            {editId ? "New Password (leave blank to keep)" : "Password *"}
            <input type="password" className={`input mt-1 ${fieldErrors.password ? "border-red-400" : ""}`}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} disabled={busy} />
            {fieldErrors.password && <p className="mt-0.5 text-xs text-red-500">{fieldErrors.password}</p>}
          </label>
          <label className="text-sm">
            Role *
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.roleId}
                onChange={(v) => setForm({ ...form, roleId: v })}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>
          </label>
          <label className="text-sm">
            Branch
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.branchId}
                onChange={(v) => setForm({ ...form, branchId: v })}
                options={[
                  { value: "", label: "No branch" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          </label>
          <label className="text-sm">
            Status
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            </div>
          </label>
        </div>

        {err && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}
      </Modal>

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Delete User"
        message="This permanently removes the user. They will no longer be able to log in."
        confirmLabel="Delete"
      />
    </div>
  );
}
