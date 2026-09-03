import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Search, MoreVertical, Eye, Download, Pencil, Trash2, RotateCcw, Trash, Inbox, X, AlertOctagon, Check } from "lucide-react";
import { Select } from "@/components/ui/select";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown } from "@/components/ui/dropdown";
import { DOCUMENT_CATEGORY_OPTIONS, IMAGE_CATEGORY_OPTIONS, label } from "@/lib/constants";
import { formatFileSize, formatDate, formatRelative } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable, reportFilename, type ExportMeta } from "@/lib/export";
import { useBrand } from "@/lib/brand-context";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth-context";
import { PERMISSIONS } from "@/lib/rbac";

interface Doc {
  id: string;
  kind: "document" | "image";
  title: string;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  isLatest: boolean;
  createdAt: string;
  expiresAt?: string | null;
  deletedAt?: string | null;
  uploadedBy?: { fullName?: string } | null;
  vehicle: { id: string; plateNumber: string; vehicleCode: string; branch?: { name: string } | null };
}

const PAGE_SIZES = [15, 25, 50, 100];

export default function DocumentsPage() {
  const { toast } = useToast();
  const { can, user } = useAuth();
  const { companyName } = useBrand();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"all" | "trash">("all");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [kind, setKind] = useState<"" | "document" | "image">("");
  const [expiry, setExpiry] = useState<"" | "expired" | "expiring" | "valid">("");
  const [branchId, setBranchId] = useState<string | null>(searchParams.get("branch"));
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(searchParams.get("vehicle"));
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editExpires, setEditExpires] = useState("");
  const [editErr, setEditErr] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"restore" | "purge" | null>(null);
  const [bulkResult, setBulkResult] = useState<{ restored?: number; purged?: number; failed: number; errors: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/reference/lookups")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.branches) setBranches(d.branches); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    if (search) qs.set("search", search);
    if (cat) qs.set("category", cat);
    if (kind) qs.set("kind", kind);
    if (expiry) qs.set("expiry", expiry);
    if (branchId) qs.set("branchId", branchId);
    if (vehicleFilter) qs.set("vehicleId", vehicleFilter);
    const url = view === "trash" ? "/api/documents/trash" : "/api/documents";
    try {
      const res = await fetch(`${url}?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const d = await res.json();
      setDocs(d.documents ?? []);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [view, search, cat, kind, expiry, branchId, vehicleFilter, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // Selection hygiene: clear whenever anything that changes row identity flips.
  useEffect(() => { setSelected(new Set()); }, [view, search, cat, kind, expiry, branchId, vehicleFilter, page, pageSize]);

  async function handleEditSave() {
    if (!editingDoc) return;
    if (!editTitle.trim()) {
      setEditErr("Title is required");
      return;
    }
    setEditErr(null);
    const body: Record<string, unknown> = {};
    // Always send title + category explicitly — the old version skipped empty
    // values, so "clearing" a field silently kept the old one.
    body.title = editTitle.trim();
    body.category = editCat || "OTHER";
    const currentExpiry = editingDoc.expiresAt?.slice(0, 10) ?? "";
    if (editExpires !== currentExpiry) {
      body.expiresAt = editExpires ? new Date(editExpires).toISOString() : null;
    }
    const res = await fetch(`/api/documents/${editingDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setEditErr(d?.error ?? "Failed to update document");
      return;
    }
    const { record } = await res.json();
    setDocs((prev) => prev.map((d) => (d.id === editingDoc.id ? { ...d, title: record.title, category: record.category, expiresAt: record.expiresAt ?? null } : d)));
    toast("success", "Document updated");
    setEditingDoc(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Failed to delete"); return; }
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast("success", "Moved to trash");
    setDeleteId(null);
  }

  async function handleRestore(id: string) {
    const res = await fetch(`/api/documents/trash/${id}/restore`, { method: "POST" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Failed to restore"); return; }
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast("success", "Document restored");
  }

  async function handlePurge(id: string) {
    const res = await fetch(`/api/documents/trash/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Failed to purge"); return; }
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast("success", "Document permanently deleted");
    setPurgeId(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = docs.length > 0 && docs.every((d) => selected.has(d.id));

  async function bulkAction(action: "restore" | "purge") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(action);
    try {
      const res = await fetch(`/api/documents/trash/bulk-${action === "restore" ? "restore" : "purge"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const d = await res.json().catch(() => ({ failed: ids.length, errors: [] as string[] }));
      if (!res.ok) {
        toast("error", d?.errors?.[0] ?? d?.error ?? "Bulk action failed");
        return;
      }
      if (d.failed > 0) setBulkResult(d);
      else toast("success", `${d.restored ?? d.purged} document(s) ${action === "restore" ? "restored" : "permanently deleted"}`);
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleEmptyTrash() {
    setBulkBusy("purge");
    try {
      const res = await fetch("/api/documents/trash/empty", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast("error", d?.error ?? "Failed to empty trash"); return; }
      toast("success", `Trash emptied — ${d.purged} document(s) permanently removed`);
      setEmptyConfirm(false);
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  const exportColumns = (d: Doc) => ({
    Title: d.title,
    Category: label(d.category),
    Type: d.kind === "image" ? "Image" : "Document",
    "File Name": d.originalName,
    Size: formatFileSize(d.sizeBytes),
    Version: d.version,
    "Expires At": d.expiresAt ? d.expiresAt.slice(0, 10) : "",
    Vehicle: `${d.vehicle.plateNumber} (${d.vehicle.vehicleCode})`,
    Branch: d.vehicle.branch?.name ?? "",
    "Uploaded By": d.uploadedBy?.fullName ?? "",
    "Created At": d.createdAt.slice(0, 10),
  });

  function exportMeta(scope: string): ExportMeta {
    const parts: string[] = [];
    if (search) parts.push(`Search: "${search}"`);
    if (cat) parts.push(`Category: ${label(cat)}`);
    if (kind) parts.push(kind === "image" ? "Images only" : "Documents only");
    if (expiry) parts.push(expiry === "expired" ? "Expired" : expiry === "expiring" ? "Expiring soon" : "No expiry issues");
    if (branchId) parts.push(`Branch: ${branches.find((b) => b.value === branchId)?.label ?? branchId}`);
    if (vehicleFilter) parts.push("One vehicle");
    if (view === "trash") parts.push("Trash");
    return {
      title: view === "trash" ? "Documents — Trash" : "Document Repository",
      subtitle: parts.length ? `${scope} · ${parts.join(" · ")}` : scope,
      generatedBy: user?.fullName,
    };
  }

  function toPdfMeta(meta: ExportMeta, rowCount: number) {
    return { subtitle: meta.subtitle, generatedBy: meta.generatedBy, rowCount, summary: [{ label: "Files", value: String(rowCount) }] };
  }

  function exportPage(format: "csv" | "excel" | "pdf") {
    const data = docs.map(exportColumns);
    const meta = exportMeta(`page ${page} of ${totalPages}`);
    const name = reportFilename(view === "trash" ? "Documents Trash" : "Document Repository", `page-${page}-of-${totalPages}`);
    if (format === "csv") exportCsv(`${name}.csv`, data);
    else if (format === "excel") exportXlsx(`${name}.xlsx`, data, meta);
    else exportPdf(rowsToHtmlTable(`Documents (page ${page} of ${totalPages})`, data), `Documents (page ${page} of ${totalPages})`, companyName, toPdfMeta(meta, data.length));
  }

  async function exportAll(format: "csv" | "excel" | "pdf") {
    const allRows: Doc[] = [];
    const qs = new URLSearchParams();
    qs.set("pageSize", "100");
    if (search) qs.set("search", search);
    if (cat) qs.set("category", cat);
    if (kind) qs.set("kind", kind);
    if (expiry) qs.set("expiry", expiry);
    if (branchId) qs.set("branchId", branchId);
    if (vehicleFilter) qs.set("vehicleId", vehicleFilter);
    const url = view === "trash" ? "/api/documents/trash" : "/api/documents";
    try {
      for (let p = 1; p <= 100; p++) {
        qs.set("page", String(p));
        const res = await fetch(`${url}?${qs.toString()}`);
        if (!res.ok) throw new Error("Export fetch failed");
        const data = await res.json();
        const items = data.documents ?? [];
        allRows.push(...items);
        if (allRows.length >= (data.total ?? 0) || items.length === 0) break;
      }
    } catch {
      toast("error", "Could not collect rows for export");
      return;
    }
    if (allRows.length === 0) { toast("error", "Nothing to export"); return; }
    const scope = hasFilters ? "filtered" : "all";
    const title = view === "trash" ? "Documents — Trash" : "Document Repository";
    const meta = exportMeta(scope === "all" ? (view === "trash" ? "Full trash" : "Full repository") : `Filtered view (${allRows.length} of ${total})`);
    const data = allRows.map(exportColumns);
    const name = reportFilename(title, scope);
    if (format === "csv") exportCsv(`${name}.csv`, data);
    else if (format === "excel") exportXlsx(`${name}.xlsx`, data, meta);
    else exportPdf(rowsToHtmlTable(`${title} (${scope})`, data), `${title} (${scope})`, companyName, toPdfMeta(meta, allRows.length));
    toast("success", `Exported ${allRows.length} document(s)`);
  }

  const hasFilters = Boolean(search || cat || kind || expiry || branchId || vehicleFilter);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `"${search}"`, clear: () => setSearch("") });
  if (cat) chips.push({ key: "cat", label: `Category: ${label(cat)}`, clear: () => setCat("") });
  if (kind) chips.push({ key: "kind", label: kind === "image" ? "Images only" : "Documents only", clear: () => setKind("") });
  if (expiry) chips.push({ key: "expiry", label: expiry === "expired" ? "Expired documents" : expiry === "expiring" ? "Expiring soon" : "No expiry issues", clear: () => setExpiry("") });
  if (branchId) chips.push({ key: "branch", label: `Branch: ${branches.find((b) => b.value === branchId)?.label ?? "…"}`, clear: () => setBranchId(null) });
  if (vehicleFilter) chips.push({ key: "vehicle", label: "One vehicle's files", clear: () => { setVehicleFilter(null); navigate("/documents", { replace: true }); } });

  function clearAllFilters() {
    setSearch(""); setCat(""); setKind(""); setExpiry(""); setBranchId(null); setVehicleFilter(null);
    setPage(1);
    navigate("/documents", { replace: true });
  }

  const canEditMeta = can(PERMISSIONS.DOCUMENT_UPLOAD);
  const canDelete = can(PERMISSIONS.DOCUMENT_DELETE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Documents</h2>
          <p className="text-sm text-slate-500">Fleet-wide document repository</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => { setView("all"); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "all" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <FileText className="h-3.5 w-3.5" /> Repository
            </button>
            <button
              onClick={() => { setView("trash"); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "trash" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <Inbox className="h-3.5 w-3.5" /> Trash
            </button>
          </div>
          {docs.length > 0 && !loading && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "Current view — all pages", header: true },
                { label: "CSV", onClick: () => exportAll("csv") },
                { label: "Excel", onClick: () => exportAll("excel") },
                { label: "PDF", onClick: () => exportAll("pdf") },
                { label: `This page only (${docs.length} rows)`, header: true },
                { label: "CSV", onClick: () => exportPage("csv") },
                { label: "Excel", onClick: () => exportPage("excel") },
                { label: "PDF", onClick: () => exportPage("pdf") },
              ]}
            />
          )}
          {view === "trash" && total > 0 && canDelete && (
            <button className="btn-outline text-xs text-red-600 hover:bg-red-50" onClick={() => setEmptyConfirm(true)} disabled={bulkBusy !== null}>
              <Trash className="mr-1 h-3.5 w-3.5" /> Empty trash
            </button>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search title, filename or plate number…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select
            className="w-auto"
            value={cat}
            onChange={(v) => { setCat(v); setPage(1); }}
            placeholder="All categories"
            options={[
              { value: "", label: "All categories" },
              ...DOCUMENT_CATEGORY_OPTIONS.map((c) => ({ value: c, label: label(c) })),
              ...IMAGE_CATEGORY_OPTIONS.map((c) => ({ value: c, label: `${label(c)} (image)` })),
            ]}
          />
          {view === "all" && (
            <Select
              className="w-auto"
              value={kind}
              onChange={(v) => { setKind(v as "" | "document" | "image"); setPage(1); }}
              placeholder="All types"
              options={[
                { value: "", label: "All types" },
                { value: "document", label: "Documents only" },
                { value: "image", label: "Images only" },
              ]}
            />
          )}
          {view === "all" && (
            <Select
              className="w-auto"
              value={expiry}
              onChange={(v) => { setExpiry(v as "" | "expired" | "expiring" | "valid"); setPage(1); }}
              placeholder="Any expiry"
              options={[
                { value: "", label: "Any expiry" },
                { value: "expired", label: "Expired" },
                { value: "expiring", label: "Expiring soon (≤90d)" },
                { value: "valid", label: "No expiry issues" },
              ]}
            />
          )}
          <Select
            className="w-auto"
            value={branchId ?? ""}
            onChange={(v) => { setBranchId(v || null); setPage(1); }}
            placeholder="All branches"
            options={[{ value: "", label: "All branches" }, ...branches]}
          />
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Active:</span>
            {chips.map((c) => (
              <button key={c.key} onClick={c.clear}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={clearAllFilters} className="text-xs text-slate-400 underline hover:text-slate-600">Clear all</button>
          </div>
        )}
      </div>

      {view === "trash" && docs.length > 0 && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-medium text-primary">{selected.size} selected</span>
          <button className="btn-outline text-xs" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn-outline text-xs" onClick={() => bulkAction("restore")} disabled={bulkBusy !== null}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> {bulkBusy === "restore" ? "Restoring…" : "Restore"}
          </button>
          <button className="btn-outline text-xs text-red-600 hover:bg-red-50" onClick={() => bulkAction("purge")} disabled={bulkBusy !== null}>
            <Trash className="mr-1 h-3.5 w-3.5" /> {bulkBusy === "purge" ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      )}

      {error ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertOctagon className="h-10 w-10 text-red-300" />
          <h3 className="text-base font-semibold text-slate-700">Couldn't load documents</h3>
          <p className="text-sm text-slate-400">{error}</p>
          <button className="btn-outline mt-1" onClick={() => load()}>Try again</button>
        </div>
      ) : loading ? (
        <BrandLoader />
      ) : docs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          {view === "trash" ? <Inbox className="mb-3 h-10 w-10 text-slate-300" /> : <FileText className="mb-3 h-10 w-10 text-slate-300" />}
          <h3 className="text-base font-semibold text-slate-700">{view === "trash" ? "Trash is empty" : "No documents found"}</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {view === "trash"
              ? "Documents you delete are moved here and can be restored or permanently removed."
              : hasFilters ? "No documents match the current filters." : "Upload documents from a vehicle's detail page to populate the repository."}
          </p>
          {view === "all" && hasFilters && (
            <button className="btn-outline mt-3" onClick={clearAllFilters}>Clear filters</button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">{total} document(s)</span>
            {view === "trash" && (
              <button onClick={() => setSelected(allOnPageSelected ? new Set() : new Set(docs.map((d) => d.id)))}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${allOnPageSelected ? "border-primary bg-primary text-white" : "border-slate-300"}`}>
                  {allOnPageSelected && <Check className="h-3 w-3" />}
                </span>
                {allOnPageSelected ? "Deselect page" : "Select page"}
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {docs.map((d) => {
              const isImage = d.mimeType.startsWith("image/");
              const expired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now();
              return (
                <li key={d.id} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                  {view === "trash" && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={selected.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                    />
                  )}
                  {isImage ? (
                    <button
                      onClick={() => setPreview(d)}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100"
                      title="Preview image"
                    >
                      <img src={`/api/documents/${d.id}`} alt={d.originalName} className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <FileText className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setPreview(d)} className="truncate text-sm font-semibold text-slate-800 hover:text-primary" title="Preview">
                        {d.title}
                      </button>
                      <span className={`badge ${isImage ? "bg-purple-50 text-purple-600" : "bg-primary/10 text-primary"}`}>{label(d.category)}</span>
                      <span className="badge bg-slate-100 text-slate-500">v{d.version}</span>
                      {view === "all" && d.isLatest && <span className="badge bg-green-100 text-green-700">Latest</span>}
                      {view === "trash" && d.deletedAt && <span className="badge bg-amber-100 text-amber-700">Deleted {formatDate(d.deletedAt)}</span>}
                      {view === "all" && expired && (
                        <span className="badge bg-red-100 text-red-700" title={`Expired ${formatDate(d.expiresAt)}`}>Expired</span>
                      )}
                      {view === "all" && d.expiresAt && !expired && (
                        <span className={`badge ${new Date(d.expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                          Expires {formatDate(d.expiresAt)}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      <Link to={`/vehicles/${d.vehicle.id}`} className="text-blue-600 hover:underline">{d.vehicle.plateNumber}</Link>
                      {" · "}{d.vehicle.vehicleCode}
                      {d.vehicle.branch?.name ? ` · ${d.vehicle.branch.name}` : ""}
                      {" · "}{formatFileSize(d.sizeBytes)} · {formatRelative(d.createdAt)}
                      {d.uploadedBy?.fullName ? ` · by ${d.uploadedBy.fullName}` : ""}
                    </div>
                  </div>
                  <Dropdown
                    align="right"
                    trigger={({ toggle }) => (
                      <button onClick={toggle} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Actions">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    )}
                    items={view === "all"
                      ? [
                          { label: "Preview", icon: <Eye className="h-4 w-4" />, onClick: () => setPreview(d) },
                          { label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => window.open(`/api/documents/${d.id}?download=1`, "_blank") },
                          ...(canEditMeta ? [{ label: "Edit metadata", icon: <Pencil className="h-4 w-4" />, onClick: () => { setEditingDoc(d); setEditTitle(d.title); setEditCat(d.category); setEditExpires(d.expiresAt?.slice(0, 10) ?? ""); setEditErr(null); } }] : []),
                          ...(canDelete ? [{ label: "Move to trash", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(d.id) }] : []),
                        ]
                      : [
                          { label: "Preview", icon: <Eye className="h-4 w-4" />, onClick: () => setPreview(d) },
                          { label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => window.open(`/api/documents/${d.id}?download=1`, "_blank") },
                          ...(canDelete ? [
                            { label: "Restore", icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(d.id) },
                            { label: "Delete permanently", icon: <Trash className="h-4 w-4" />, danger: true, onClick: () => setPurgeId(d.id) },
                          ] : []),
                        ]}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <div className="flex items-center gap-3">
              <span>{total} document(s)</span>
              <span className="hidden items-center gap-1.5 sm:flex">
                Rows per page
                <Select
                  className="w-20"
                  value={String(pageSize)}
                  onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                  searchable={false}
                />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-outline px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span>Page {page} / {totalPages}</span>
              <button className="btn-outline px-2 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!editingDoc}
        onClose={() => setEditingDoc(null)}
        title="Edit document metadata"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={() => setEditingDoc(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEditSave}>Save</button>
          </div>
        }
      >
        {editErr && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{editErr}</div>}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
            <input className="input" value={editTitle} onChange={(e) => { setEditTitle(e.target.value); setEditErr(null); }} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
            <Select
              value={editCat}
              onChange={setEditCat}
              options={DOCUMENT_CATEGORY_OPTIONS.map((c) => ({ value: c, label: label(c) }))}
            />
            <p className="mt-1 text-[11px] text-slate-400">Leaving it unchanged keeps the current category.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Expiry date (optional)</label>
            <input type="date" className="input w-full" value={editExpires} onChange={(e) => setEditExpires(e.target.value)} />
            <p className="mt-1 text-[11px] text-slate-400">Clear the date to remove the expiry entirely.</p>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId!)}
        title="Move to trash?"
        message="The document will be hidden from the repository and stored in the trash. You can restore or permanently delete it later."
        confirmLabel="Move to trash"
      />

      <ConfirmModal
        open={!!purgeId}
        onClose={() => setPurgeId(null)}
        onConfirm={() => handlePurge(purgeId!)}
        title="Delete permanently?"
        message="This permanently removes the file from storage. This action cannot be undone."
        confirmLabel="Delete permanently"
      />

      <ConfirmModal
        open={emptyConfirm}
        onClose={() => setEmptyConfirm(false)}
        onConfirm={handleEmptyTrash}
        loading={bulkBusy !== null}
        title={`Empty trash (${total} item${total === 1 ? "" : "s"})?`}
        message="Every document in the trash will be permanently removed from storage. This action cannot be undone."
        confirmLabel="Empty trash"
      />

      <Modal
        open={bulkResult !== null}
        onClose={() => setBulkResult(null)}
        title={`${bulkResult?.failed ?? 0} item(s) failed`}
        description="Per-file results"
        size="md"
        footer={<button className="btn-primary" onClick={() => setBulkResult(null)}>Close</button>}
      >
        <p className="mb-3 text-sm text-slate-500">
          {(bulkResult?.restored ?? 0) > 0 && `${bulkResult!.restored} restored. `}
          {(bulkResult?.purged ?? 0) > 0 && `${bulkResult!.purged} permanently deleted. `}
          The following file(s) were skipped:
        </p>
        <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs text-slate-600">
          {bulkResult?.errors.map((err, i) => (
            <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">{err}</li>
          ))}
        </ul>
      </Modal>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.title ?? "Preview"} size="xl">
        {preview && (
          preview.mimeType.startsWith("image/") ? (
            <div className="flex items-center justify-center bg-slate-50">
              <img src={`/api/documents/${preview.id}`} alt={preview.title} className="max-h-[65dvh] rounded-lg object-contain" />
            </div>
          ) : (
            <iframe
              src={`/api/documents/${preview.id}`}
              title={preview.title}
              className="h-[65dvh] w-full rounded-lg border border-slate-200 bg-white"
            />
          )
        )}
      </Modal>
    </div>
  );
}
