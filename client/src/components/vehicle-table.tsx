import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Car, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, MoreVertical, Download } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { label } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable } from "@/lib/export";
import { useBrand } from "@/lib/brand-context";

interface VehicleRow {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  status: string;
  branch?: { name: string } | null;
  currentDriver?: {
    id: string;
    fullName: string;
    employeeId: string | null;
    licenseNo: string | null;
    phone: string | null;
    department: { name: string } | null;
    isActive: boolean;
  } | null;
  ownerName: string;
  purchaseCost?: number | null;
}

export function VehicleTable() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { companyName } = useBrand();

  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [driverDetail, setDriverDetail] = useState<VehicleRow['currentDriver'] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageSize, setPageSize] = useState(15);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkStatusing, setBulkStatusing] = useState(false);

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
      const res = await fetch(`/api/vehicles/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error || "Failed to delete");
        return;
      }
      setDeleteId(null);
      toast("success", "Vehicle deleted");
      load();
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((v) => v.id)));
    }
  }

  async function confirmBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/vehicles/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        toast("success", `${selectedIds.size} vehicle(s) deleted`);
        setSelectedIds(new Set());
        load();
      } else {
        const data = await res.json();
        toast("error", data.error || "Bulk delete failed");
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  async function confirmBulkStatus() {
    if (selectedIds.size === 0 || !bulkStatus) return;
    setBulkStatusing(true);
    try {
      const res = await fetch("/api/vehicles/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: bulkStatus }),
      });
      if (res.ok) {
        toast("success", `${selectedIds.size} vehicle(s) updated`);
        setSelectedIds(new Set());
        setBulkStatus("");
        load();
      } else {
        const data = await res.json();
        toast("error", data.error || "Bulk update failed");
      }
    } finally {
      setBulkStatusing(false);
    }
  }

  function exportVehicles(format: "csv" | "excel" | "pdf") {
    const data = rows.map((v) => ({
      Code: v.vehicleCode,
      Plate: v.plateNumber,
      Make: v.make,
      Model: v.model,
      Year: v.year,
      Branch: v.branch?.name ?? "",
      Driver: v.currentDriver?.fullName ?? "",
      Owner: v.ownerName,
      Cost: v.purchaseCost ?? "",
      Status: label(v.status),
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") exportCsv(`vehicles_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`vehicles_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable("Vehicles", data), "Vehicles", companyName);
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
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline justify-center text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "CSV", onClick: () => exportVehicles("csv") },
                { label: "Excel", onClick: () => exportVehicles("excel") },
                { label: "PDF", onClick: () => exportVehicles("pdf") },
              ]}
            />
          )}
          {can("vehicle:create") && (
            <Link to="/vehicles/new" className="btn-primary justify-center">
              <Plus className="h-4 w-4" /> Register Vehicle
            </Link>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-medium text-primary">{selectedIds.size} selected</span>
          <button
            className="btn-outline text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
          {can("vehicle:delete") && (
            <button
              className="btn-danger text-xs"
              onClick={confirmBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? "Deleting…" : "Delete Selected"}
            </button>
          )}
          <label className="flex items-center gap-2 text-slate-600">
            Status
            <Select
              value={bulkStatus}
              onChange={(v) => setBulkStatus(v)}
              placeholder="Change to…"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "ASSIGNED", label: "Assigned" },
                { value: "RESERVED", label: "Reserved" },
                { value: "UNDER_MAINTENANCE", label: "Under Maintenance" },
                { value: "DISPOSED", label: "Disposed" },
              ]}
            />
          </label>
          {can("vehicle:edit") && bulkStatus && (
            <button
              className="btn-primary text-xs"
              onClick={confirmBulkStatus}
              disabled={bulkStatusing}
            >
              {bulkStatusing ? "Updating…" : "Apply"}
            </button>
          )}
        </div>
      )}

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
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{v.plateNumber}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="truncate text-xs text-slate-400">{v.make} {v.model} · {v.year}</div>
                    </div>
                  </div>
                  <Dropdown
                    align="right"
                    trigger={({ toggle }) => (
                      <Tooltip content="Actions">
                        <button onClick={toggle} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </Tooltip>
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
                  <div className="truncate">
                    {v.currentDriver ? (
                      <button onClick={() => setDriverDetail(v.currentDriver)} className="text-primary hover:underline cursor-pointer">
                        {v.currentDriver.fullName}
                      </button>
                    ) : "No driver"}
                  </div>
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
                       <th className="px-4 py-3 w-10">
                         <input
                           type="checkbox"
                           className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                           checked={rows.length > 0 && selectedIds.size === rows.length}
                           onChange={toggleSelectAll}
                         />
                       </th>
                       <th className="px-4 py-3">Code</th>
                       <th className="px-4 py-3">Plate</th>
                       <th className="px-4 py-3">Make / Model</th>
                       <th className="px-4 py-3">Year</th>
                       <th className="px-4 py-3">Branch</th>
                       <th className="px-4 py-3">Driver</th>
                       <th className="px-4 py-3">Owner</th>
                       <th className="px-4 py-3">Cost</th>
                       <th className="px-4 py-3">Status</th>
                       <th className="px-4 py-3 text-right">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                            checked={selectedIds.has(v.id)}
                            onChange={() => toggleSelect(v.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.vehicleCode}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{v.plateNumber}</td>
                        <td className="px-4 py-3">{v.make} {v.model}</td>
                        <td className="px-4 py-3">{v.year}</td>
                        <td className="px-4 py-3 text-slate-600">{v.branch?.name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {v.currentDriver ? (
                            <button onClick={() => setDriverDetail(v.currentDriver)} className="text-primary hover:underline cursor-pointer">
                              {v.currentDriver.fullName}
                            </button>
                          ) : "—"}
                        </td>
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
              <Tooltip content="Previous page">
                <button className="btn-outline px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </Tooltip>
              <span>Page {page} / {totalPages}</span>
              <Tooltip content="Next page">
                <button className="btn-outline px-2 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Tooltip>
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

      <Modal open={!!driverDetail} onClose={() => setDriverDetail(null)} title={driverDetail?.fullName ?? ""} description="Driver details" size="sm">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Employee ID</dt>
            <dd className="font-medium text-slate-800">{driverDetail?.employeeId ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">License No</dt>
            <dd className="font-medium text-slate-800">{driverDetail?.licenseNo ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Phone</dt>
            <dd className="font-medium text-slate-800">{driverDetail?.phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Department</dt>
            <dd className="font-medium text-slate-800">{driverDetail?.department?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium">{driverDetail?.isActive ? <span className="text-emerald-600">Active</span> : <span className="text-red-500">Inactive</span>}</dd>
          </div>
        </dl>
      </Modal>
    </div>
  );
}
