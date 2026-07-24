import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Search, MoreVertical, Eye, Download, Pencil, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown } from "@/components/ui/dropdown";
import { DOCUMENT_CATEGORY_OPTIONS, label } from "@/lib/constants";
import { formatFileSize, formatDate } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import { exportCsv } from "@/lib/export";

interface Doc {
  id: string;
  title: string;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
  vehicle: { id: string; plateNumber: string; vehicleCode: string };
}

export default function DocumentsPage() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCat, setEditCat] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    fetch(`/api/documents?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .finally(() => setLoading(false));
  }, [search]);

  const filtered = cat ? docs.filter((d) => d.category === cat) : docs;

  async function handleEditSave() {
    if (!editingDoc) return;
    const body: Record<string, string> = {};
    if (editTitle.trim()) body.title = editTitle.trim();
    if (editCat) body.category = editCat;
    const res = await fetch(`/api/documents/${editingDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast("error", "Failed to update document");
      return;
    }
    const { record } = await res.json();
    setDocs((prev) =>
      prev.map((d) => (d.id === editingDoc.id ? { ...d, title: record.title, category: record.category } : d))
    );
    toast("success", "Document updated");
    setEditingDoc(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("error", "Failed to delete"); return; }
    setDocs((prev) => prev.filter((d) => d.id !== id));
    toast("success", "Document deleted");
    setDeleteId(null);
  }

  function exportDocuments() {
    exportCsv(`documents_${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((d) => ({
        Title: d.title,
        Category: label(d.category),
        "File Name": d.originalName,
        Type: d.mimeType,
        Size: String(d.sizeBytes),
        Version: d.version,
        Vehicle: `${d.vehicle.plateNumber} (${d.vehicle.vehicleCode})`,
        "Created At": d.createdAt,
      }))
    );
  }

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `"${search}"`, clear: () => setSearch("") });
  if (cat) chips.push({ key: "cat", label: `Category: ${label(cat)}`, clear: () => setCat("") });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Documents</h2>
          <p className="text-sm text-slate-500">Fleet-wide document repository</p>
        </div>
        {filtered.length > 0 && (
          <button className="btn-outline text-xs" onClick={exportDocuments}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search title or filename…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select
            className="w-auto"
            value={cat}
            onChange={setCat}
            placeholder="All categories"
            options={[{ value: "", label: "All categories" }, ...DOCUMENT_CATEGORY_OPTIONS.map((c) => ({ value: c, label: label(c) }))]}
          />
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Active:</span>
            {chips.map((c) => (
              <button key={c.key} onClick={c.clear}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                {c.label} <span className="text-primary/60">✕</span>
              </button>
            ))}
            <button onClick={() => { setSearch(""); setCat(""); }} className="text-xs text-slate-400 underline hover:text-slate-600">Clear all</button>
          </div>
        )}
      </div>

      {loading ? (
        <BrandLoader />
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No documents found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {search || cat ? "No documents match the current filters." : "Upload documents from a vehicle's detail page to populate the repository."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">{filtered.length} document(s)</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {filtered.map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                {d.mimeType.startsWith("image/") ? (
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100"
                    title="Open image"
                  >
                    <img src={`/api/documents/${d.id}`} alt={d.originalName} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileText className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{d.title}</span>
                    <span className="badge bg-primary/10 text-primary">{label(d.category)}</span>
                    <span className="badge bg-slate-100 text-slate-500">v{d.version}</span>
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    <Link to={`/vehicles/${d.vehicle.id}`} className="text-blue-600 hover:underline">{d.vehicle.plateNumber}</Link>
                    {" · "}{d.vehicle.vehicleCode} · {formatFileSize(d.sizeBytes)} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <Dropdown
                  align="right"
                  trigger={({ toggle }) => (
                    <button onClick={toggle} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Actions">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  )}
                  items={[
                    { label: "Preview", icon: <Eye className="h-4 w-4" />, onClick: () => window.open(`/api/documents/${d.id}`, "_blank") },
                    { label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => window.open(`/api/documents/${d.id}?download=1`, "_blank") },
                    { label: "Edit metadata", icon: <Pencil className="h-4 w-4" />, onClick: () => { setEditingDoc(d); setEditTitle(d.title); setEditCat(d.category); } },
                    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(d.id) },
                  ]}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={!!editingDoc}
        onClose={() => setEditingDoc(null)}
        title="Edit document metadata"
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditingDoc(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEditSave}>Save</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
            <Select
              value={editCat}
              onChange={setEditCat}
              options={DOCUMENT_CATEGORY_OPTIONS.map((c) => ({ value: c, label: label(c) }))}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId!)}
        title="Delete document?"
        message="This will permanently remove the file from the server."
        confirmLabel="Delete"
      />
    </div>
  );
}
