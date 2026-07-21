import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Car, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Dropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { label } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";

interface VehicleRow {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  status: string;
  branch?: { name: string } | null;
  ownerName: string;
  purchaseCost?: number | null;
}

export function VehicleTable() {
  const { can } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageSize, setPageSize] = useState(15);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    const res = await fetch(`/api/vehicles?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(id: string) {
    setDeleteId(id);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/vehicles/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      toast("success", "Vehicle deleted");
      load();
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-full pl-9 sm:w-64"
              placeholder="Search plate, engine, VIN…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select
            className="w-full sm:w-44"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              ...["ACTIVE", "ASSIGNED", "RESERVED", "UNDER_MAINTENANCE", "DISPOSED"].map((s) => ({ value: s, label: label(s) })),
            ]}
          />
        </div>
        {can("vehicle:create") && (
          <Link to="/vehicles/new" className="btn-primary justify-center">
            <Plus className="h-4 w-4" /> Register Vehicle
          </Link>
        )}
      </div>

      {loading ? (
        <BrandLoader className="py-20" />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Car className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No vehicles found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {search || status
              ? "No vehicles match the current filters."
              : "Register a vehicle to start building the fleet registry."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="space-y-3 sm:hidden">
            {rows.map((v) => (
              <div key={v.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{v.plateNumber}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <div className="truncate text-xs text-slate-400">{v.make} {v.model} · {v.year}</div>
                  </div>
                  <Dropdown
                    align="right"
                    trigger={({ toggle }) => (
                      <button onClick={toggle} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    )}
                    items={[
                      { label: "View", icon: <Eye className="h-4 w-4" />, href: `/vehicles/${v.id}` },
                      ...(can("vehicle:edit") ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, href: `/vehicles/${v.id}/edit` }] : []),
                      ...(can("vehicle:delete") ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => handleDelete(v.id) }] : []),
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                  <div><span className="font-mono text-slate-600">{v.vehicleCode}</span></div>
                  <div>{v.ownerName}</div>
                  <div className="truncate">{v.branch?.name ?? "-"}</div>
                  <div>{v.purchaseCost != null ? formatCurrency(v.purchaseCost) : "-"}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Plate</th>
                      <th className="px-4 py-3">Make / Model</th>
                      <th className="px-4 py-3">Year</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Cost</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.vehicleCode}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{v.plateNumber}</td>
                        <td className="px-4 py-3">{v.make} {v.model}</td>
                        <td className="px-4 py-3">{v.year}</td>
                        <td className="px-4 py-3 text-slate-600">{v.branch?.name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{v.ownerName}</td>
                        <td className="px-4 py-3">{v.purchaseCost != null ? formatCurrency(v.purchaseCost) : "-"}</td>
                        <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Dropdown
                              align="right"
                              trigger={({ toggle }) => (
                                <button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions">
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              )}
                              items={[
                                { label: "View", icon: <Eye className="h-4 w-4" />, href: `/vehicles/${v.id}` },
                                ...(can("vehicle:edit") ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, href: `/vehicles/${v.id}/edit` }] : []),
                                ...(can("vehicle:delete") ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => handleDelete(v.id) }] : []),
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>{total} vehicle(s)</span>
            <div className="flex items-center gap-2">
              <button className="btn-outline px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>Page {page} / {totalPages}</span>
              <button className="btn-outline px-2 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete Vehicle"
        message="This will permanently remove the vehicle and its linked records. This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
