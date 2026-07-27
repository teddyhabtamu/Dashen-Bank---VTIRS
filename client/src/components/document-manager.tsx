import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Image as ImageIcon, Trash2, Download, Eye, X } from "lucide-react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Select } from "@/components/ui/select";
import { DOCUMENT_CATEGORY_OPTIONS, label } from "@/lib/constants";
import { csrfHeaders } from "@/lib/csrf";
import { formatFileSize, formatDate } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import { Tooltip } from "@/components/ui/tooltip";

interface DocItem {
  id: string;
  title: string;
  category: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
}
interface ImgItem {
  id: string;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface StagedFile {
  file: File;
  category: string;
  title: string;
}

function titleFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function DocumentManager({
  vehicleId,
  initialDocs,
  initialImages,
  canUpload,
  canDelete,
  onPendingChange,
}: {
  vehicleId: string;
  initialDocs: DocItem[];
  initialImages: ImgItem[];
  canUpload: boolean;
  canDelete: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const [images, setImages] = useState<ImgItem[]>(initialImages);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<{ id: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const hasPending = staged.length > 0;
  useEffect(() => { onPendingChange?.(hasPending); }, [hasPending, onPendingChange]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}`, { cache: "no-store" });
    const data = await res.json();
    setDocs(data.vehicle.documents ?? []);
    setImages(data.vehicle.images ?? []);
  }, [vehicleId]);

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: StagedFile[] = Array.from(files).map((f) => ({
      file: f,
      category: DOCUMENT_CATEGORY_OPTIONS[0],
      title: titleFromName(f.name),
    }));
    setStaged((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateStaged(index: number, patch: Partial<StagedFile>) {
    setStaged((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeStaged(index: number) {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  }

  async function doUpload() {
    if (staged.length === 0) return;
    setBusy(true); setErr(null);
    let ok = 0;
    try {
      for (const s of staged) {
        const fd = new FormData();
        fd.append("file", s.file);
        fd.append("vehicleId", vehicleId);
        fd.append("category", s.category);
        if (s.title.trim()) fd.append("title", s.title.trim());
        fd.append("kind", s.file.type.startsWith("image/") ? "image" : "document");
        const res = await fetch("/api/documents", { method: "POST", headers: csrfHeaders(), body: fd });
        if (!res.ok) {
          const d = await res.json();
          setErr(d.error ?? "Upload failed");
          break;
        }
        ok++;
      }
      if (ok > 0) {
        toast("success", `${ok} file(s) uploaded`);
        setStaged([]);
        await refresh();
      }
    } finally { setBusy(false); }
  }

  function askDelete(id: string, name: string) {
    setDeleteInfo({ id, name });
    setDeleteId(id);
  }
  async function doDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await fetch(`/api/documents/${deleteId}`, { method: "DELETE", headers: csrfHeaders() });
      await refresh();
    } finally { setBusy(false); setDeleteId(null); setDeleteInfo(null); }
  }

  const isImg = (m: string) => m.startsWith("image/");

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Choose file(s) (PDF, JPG, PNG)"}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => pickFiles(e.target.files)} />

          {staged.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">{staged.length} file(s) selected</p>
              <div className="space-y-2">
                {staged.map((s, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start gap-3">
                      {s.file.type.startsWith("image/") ? (
                        <ImageIcon className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
                      ) : (
                        <FileText className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-700">{s.file.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">{formatFileSize(s.file.size)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={s.category}
                            onChange={(v) => updateStaged(i, { category: v })}
                            options={DOCUMENT_CATEGORY_OPTIONS.map((c) => ({ value: c, label: label(c) }))}
                            placeholder="Category"
                            className="w-40"
                            searchable={false}
                          />
                          <input
                            value={s.title}
                            onChange={(e) => updateStaged(i, { title: e.target.value })}
                            placeholder="Title (optional)"
                            className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          />
                          <Tooltip content="Remove file">
                            <button
                              onClick={() => removeStaged(i)}
                              className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn-primary" onClick={doUpload} disabled={busy}>
                  <Upload className="h-4 w-4" /> {busy ? "Uploading…" : `Upload ${staged.length} file(s)`}
                </button>
                <button className="btn-outline" onClick={() => setStaged([])} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
          {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        </div>
      )}

      {/* Documents (images filtered out — shown in Photos below) */}
      <div>
        <div className="flex items-center gap-2 px-4 text-sm font-semibold text-slate-600">
          <FileText className="h-4 w-4" /> Documents ({docs.filter((d) => !isImg(d.mimeType)).length})
        </div>
        {docs.filter((d) => !isImg(d.mimeType)).length === 0 ? (
          <p className="mt-2 px-4 text-sm text-slate-400">No documents uploaded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {docs.filter((d) => !isImg(d.mimeType)).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  {isImg(d.mimeType) ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{d.title}</span>
                    <span className="badge bg-slate-100 text-slate-500">v{d.version}</span>
                    <span className="badge bg-primary/10 text-primary">{label(d.category)}</span>
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {d.originalName} · {formatFileSize(d.sizeBytes)} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Preview">
                    <Eye className="h-4 w-4" />
                  </a>
                  <a href={`/api/documents/${d.id}?download=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Download">
                    <Download className="h-4 w-4" />
                  </a>
                  {canDelete && (
                    <button onClick={() => askDelete(d.id, d.title)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Photos */}
      {images.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-4 text-sm font-semibold text-slate-600">
            <ImageIcon className="h-4 w-4" /> Photos ({images.length})
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((img) => (
              <div key={img.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-100">
                <a
                  href={`/api/documents/${img.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-32 items-center justify-center bg-slate-50"
                  title="Open full image"
                >
                  <img
                    src={`/api/documents/${img.id}`}
                    alt={img.originalName}
                    className="max-h-32 max-w-full object-contain"
                  />
                </a>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2">
                  <span className="badge max-w-full truncate bg-primary/10 text-primary">{label(img.category)}</span>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <a href={`/api/documents/${img.id}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="View">
                      <Eye className="h-4 w-4" />
                    </a>
                    <a href={`/api/documents/${img.id}?download=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Download">
                      <Download className="h-4 w-4" />
                    </a>
                    {canDelete && (
                      <button onClick={() => askDelete(img.id, img.originalName)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Delete Document"
        message={`Delete "${deleteInfo?.name ?? ""}"? The file will be permanently removed.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
