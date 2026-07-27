import { useCallback, useEffect, useState } from "react";
import { Building2, Briefcase, UserCog, Search, Plus, MoreVertical, Pencil, Trash2, Download } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { csrfHeaders } from "@/lib/csrf";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";
import { exportCsv } from "@/lib/export";

type Tab = "branches" | "departments" | "drivers";

interface FormState {
  code: string; name: string; region: string; address: string; isActive: boolean;
}

const TABS: { value: Tab; label: string; icon: any }[] = [
  { value: "branches", label: "Branches", icon: Building2 },
  { value: "departments", label: "Departments", icon: Briefcase },
  { value: "drivers", label: "Drivers", icon: UserCog },
];

export default function ReferencePage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("branches");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({ code: "", name: "", region: "", address: "", isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/reference/${tab}?${q}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch { setErr("Failed to load data"); }
    finally { setLoading(false); }
  }, [tab, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  function resetForm() {
    setForm({ code: "", name: "", region: "", address: "", isActive: true });
    setEditId(null);
    setErr(null);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      setErr("Code and name are required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const url = editId ? `/api/reference/${tab}/${editId}` : `/api/reference/${tab}`;
      const method = editId ? "PUT" : "POST";
      const body = JSON.stringify({
        code: form.code.trim(),
        name: form.name.trim(),
        region: form.region || undefined,
        address: form.address || undefined,
        isActive: form.isActive,
      });
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast("success", editId ? "Updated successfully" : "Created successfully");
      setFormOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reference/${tab}/${deleteId}`, { method: "DELETE", headers: csrfHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast("success", "Deleted successfully");
      setDeleteId(null);
      await load();
    } catch (e: any) {
      toast("error", e.message);
      setDeleteId(null);
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(r: any) {
    setForm({ code: r.code, name: r.name, region: r.region ?? "", address: r.address ?? "", isActive: r.isActive });
    setEditId(r.id);
    setErr(null);
    setFormOpen(true);
  }

  const columns = tab === "branches"
    ? ["code", "name", "region", "address", "isActive"]
    : tab === "departments"
      ? ["code", "name", "isActive"]
      : ["employeeId", "fullName", "licenseNo", "phone", "departmentName", "isActive"];

  const columnsLabel: Record<string, string> = {
    code: "Code", name: "Name", region: "Region", address: "Address",
    employeeId: "Employee ID", fullName: "Full Name", licenseNo: "License", phone: "Phone",
    departmentName: "Department", isActive: "Active",
  };

  const canManage = can("BRANCH_MANAGE");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Reference Data</h2>
        {canManage && (
          <button className="btn-primary text-xs" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add New
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.value} onClick={() => { setTab(t.value); setPage(1); setSearch(""); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.value ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <button className="btn-outline text-xs" onClick={() => exportCsv(tab, rows)}>
          <Download className="mr-1 h-3 w-3" /> Export CSV
        </button>
      </div>

      {loading && <BrandLoader />}

      {err && !loading && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-400">No records found.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {columnsLabel[c] ?? c}
                    </th>
                  ))}
                  {canManage && <th className="w-10 px-3 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    {columns.map((c) => (
                      <td key={c} className="px-4 py-2 text-slate-800">
                        {c === "isActive"
                          ? (r[c]
                              ? <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                              : <span className="badge bg-slate-100 text-slate-500">Inactive</span>)
                          : (r[c] ?? "-")}
                      </td>
                    ))}
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <Dropdown align="right"
                          trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                          items={[
                            { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(r.id) },
                          ]}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2 p-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-slate-800">{r.name}</span>
                  {canManage && (
                    <Dropdown align="right"
                      trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                      items={[
                        { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                        { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(r.id) },
                      ]}
                    />
                  )}
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <div>Code: {r.code}</div>
                  {tab === "branches" && r.region && <div>Region: {r.region}</div>}
                  {tab === "drivers" && r.fullName && <div>Name: {r.fullName}</div>}
                  <div>{r.isActive ? "Active" : "Inactive"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
          <div className="flex gap-2">
            <button className="btn-outline text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn-outline text-xs" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editId ? "Edit" : "Add"}
        footer={
          <>
            <button className="btn-outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </>
        }
      >
        <div className="space-y-4">
          {tab !== "drivers" && (
            <label className="text-sm">Code *
              <input className="input mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={busy} required />
            </label>
          )}
          <label className="text-sm">Name *
            <input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={busy} required />
          </label>
          {tab === "branches" && (
            <>
              <label className="text-sm">Region
                <input className="input mt-1" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} disabled={busy} />
              </label>
              <label className="text-sm">Address
                <input className="input mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={busy} />
              </label>
            </>
          )}
          {tab === "drivers" && (
            <>
              <label className="text-sm">Employee ID
                <input className="input mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={busy} />
              </label>
              <label className="text-sm">Phone
                <input className="input mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={busy} />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} disabled={busy} />
            Active
          </label>
          {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        </div>
      </Modal>

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={busy}
        title="Delete"
        message={`Delete this ${tab.slice(0, -1)}? This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}