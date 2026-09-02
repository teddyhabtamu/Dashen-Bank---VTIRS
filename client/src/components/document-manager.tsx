import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileText, Image as ImageIcon, Trash2, Download, Eye, X, ChevronDown, ChevronRight, RotateCcw, RefreshCw, CheckCircle2, Paperclip } from "lucide-react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { DOCUMENT_CATEGORY_OPTIONS, IMAGE_CATEGORY_OPTIONS, label } from "@/lib/constants";
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
  expiresAt?: string | null;
  uploadedBy?: { fullName?: string } | null;
}
interface ImgItem {
  id: string;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
}

interface StagedFile {
  file: File;
  category: string;
  title: string;
  locked?: boolean;
}

function titleFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function groupByKey(docs: DocItem[]): Map<string, DocItem[]> {
  const map = new Map<string, DocItem[]>();
  for (const d of docs) {
    const key = `${d.title}|||${d.category}`;
    const arr = map.get(key) ?? [];
    arr.push(d);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => b.version - a.version);
  }
  return map;
}

function groupImagesByKey(imgs: ImgItem[]): Map<string, ImgItem[]> {
  const map = new Map<string, ImgItem[]>();
  for (const img of imgs) {
    const key = `${img.originalName}|||${img.category}`;
    const arr = map.get(key) ?? [];
    arr.push(img);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => b.version - a.version);
  }
  return map;
}

export function DocumentManager({
  vehicleId,
  initialDocs,
  initialImages,
  canUpload,
  canDelete,
  onPendingChange,
  requiredCategories,
}: {
  vehicleId: string;
  initialDocs: DocItem[];
  initialImages: ImgItem[];
  canUpload: boolean;
  canDelete: boolean;
  onPendingChange?: (pending: boolean) => void;
  requiredCategories?: string[];
}) {
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const [images, setImages] = useState<ImgItem[]>(initialImages);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<{ id: string; name: string } | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [expandedImgs, setExpandedImgs] = useState<Set<string>>(new Set());
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string; mimeType: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const hasPending = staged.length > 0;
  useEffect(() => { onPendingChange?.(hasPending); }, [hasPending, onPendingChange]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}`, { cache: "no-store" });
    const data = await res.json();
    setDocs(data.vehicle.documents ?? []);
    setImages(data.vehicle.images ?? []);
  }, [vehicleId]);

  const docGroups = useMemo(() => groupByKey(docs), [docs]);
  const imgGroups = useMemo(() => groupImagesByKey(images), [images]);

  const nonImageDocs = useMemo(() => docs.filter((d) => !d.mimeType.startsWith("image/")), [docs]);

  // Required-category compliance: true when at least one non-deleted doc exists for the category.
  const requiredCatStatus = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (!requiredCategories?.length) return map;
    const present = new Set(docs.map((d) => d.category));
    for (const cat of requiredCategories) map[cat] = present.has(cat);
    return map;
  }, [requiredCategories, docs]);

  const requiredStagedCount = useMemo(
    () => (requiredCategories ?? []).filter((c) => staged.some((s) => s.locked && s.category === c)).length,
    [requiredCategories, staged]
  );

  const requiredComplete = useMemo(
    () => (requiredCategories ?? []).every((c) => requiredCatStatus[c]),
    [requiredCategories, requiredCatStatus]
  );

  // Hidden file input reused for per-category uploads; category is captured when the picker opens.
  const requiredInputRef = useRef<HTMLInputElement>(null);
  const requiredPickCat = useRef<string | null>(null);

  function pickRequiredFile(category: string) {
    if (busy) return;
    requiredPickCat.current = category;
    requiredInputRef.current?.click();
  }

  function onRequiredFiles(e: React.ChangeEvent<HTMLInputElement>) {
    // Snapshot the FileList into a plain array FIRST — clearing input.value
    // empties the live FileList, so reading it afterwards yields 0 files.
    const picked = e.target.files ? Array.from(e.target.files) : [];
    const category = requiredPickCat.current;
    requiredPickCat.current = null;
    if (requiredInputRef.current) requiredInputRef.current.value = "";
    if (picked.length === 0 || !category) return;
    // A required category maps to a single document — if a file is already
    // staged for it, the new pick replaces it instead of queueing a duplicate.
    const last = picked[picked.length - 1];
    const stagedForCategory: StagedFile = {
      file: last,
      category,
      title: titleFromName(last.name),
      locked: true,
    };
    setStaged((prev) => {
      const withoutCat = prev.filter((s) => !(s.locked && s.category === category));
      return [...withoutCat, stagedForCategory];
    });
  }

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: StagedFile[] = Array.from(files).map((f) => {
      const isImage = f.type.startsWith("image/");
      return {
        file: f,
        category: isImage ? IMAGE_CATEGORY_OPTIONS[0] : DOCUMENT_CATEGORY_OPTIONS[0],
        title: titleFromName(f.name),
      };
    });
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
        const res = await fetch("/api/documents", { method: "POST", body: fd });
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
      await fetch(`/api/documents/${deleteId}`, { method: "DELETE" });
      toast("success", "Moved to trash");
      await refresh();
    } finally { setBusy(false); setDeleteId(null); setDeleteInfo(null); }
  }

  async function doRestore() {
    if (!restoreId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${restoreId}/restore`, { method: "POST" });
      if (res.ok) {
        toast("success", "Version restored as new document");
        await refresh();
      } else {
        const d = await res.json();
        toast("error", d.error ?? "Restore failed");
      }
    } finally { setBusy(false); setRestoreId(null); }
  }

  function toggleDocGroup(key: string) {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleImgGroup(key: string) {
    setExpandedImgs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Required documents — one upload row per admin-configured category */}
      {requiredCategories && requiredCategories.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Required documents</h3>
              <p className="text-xs text-slate-400">Every vehicle must have these on file to be compliant.</p>
            </div>
            <span className={`badge ${requiredComplete ? "bg-green-100 text-green-700" : requiredStagedCount > 0 ? "bg-blue-50 text-blue-600" : "bg-amber-100 text-amber-700"}`}>
              {requiredComplete
                ? "All complete"
                : requiredStagedCount > 0
                  ? `${requiredStagedCount} file${requiredStagedCount > 1 ? "s" : ""} ready to upload`
                  : "Incomplete"}
            </span>
          </div>
          <input
            ref={requiredInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            multiple
            hidden
            onChange={(e) => onRequiredFiles(e)}
          />
          <div className="divide-y divide-slate-100">
            {requiredCategories.map((cat) => {
              const has = requiredCatStatus[cat] ?? false;
              const stagedFile = staged.find((s) => s.locked && s.category === cat);
              const stagedForCat = Boolean(stagedFile);
              return (
                <div key={cat} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${stagedForCat ? "bg-blue-500" : has ? "bg-green-500" : "bg-red-400"}`} />
                    <span className="truncate text-sm font-medium text-slate-700">{label(cat)}</span>
                    {stagedForCat ? (
                      <span className="badge max-w-[12rem] shrink-0 bg-blue-50 text-blue-600">
                        <Paperclip className="mr-1 h-3 w-3 shrink-0" />
                        <span className="truncate">{stagedFile!.file.name}</span>
                      </span>
                    ) : has ? (
                      <span className="badge shrink-0 bg-green-100 text-green-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Complete
                      </span>
                    ) : (
                      <span className="badge shrink-0 bg-red-100 text-red-700">Missing</span>
                    )}
                  </div>
                  {canUpload && (
                    <button
                      type="button"
                      onClick={() => pickRequiredFile(cat)}
                      disabled={busy}
                      title={stagedForCat ? "Pick a different file for this category" : has ? "Upload a newer version of this document" : "Upload this document"}
                      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        stagedForCat
                          ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          : has
                            ? "border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-primary"
                            : "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                      }`}
                    >
                      {stagedForCat ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Change file
                        </>
                      ) : has ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Replace / add version
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" />
                          Upload
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (busy) return;
            pickFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl border border-dashed p-4 transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-slate-300 bg-slate-50"}`}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${dragOver ? "border-primary text-primary" : "border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary"}`}
          >
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : dragOver ? "Drop file(s) to upload" : "Other documents — choose or drag file(s)"}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => pickFiles(e.target.files)} />

          {staged.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">{staged.length} file(s) selected</p>
              <div className="space-y-2">
                {staged.map((s, i) => {
                  const isImage = s.file.type.startsWith("image/");
                  const catOptions = isImage ? IMAGE_CATEGORY_OPTIONS : DOCUMENT_CATEGORY_OPTIONS;
                  return (
                    <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-start gap-3">
                        {isImage ? (
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
                            {s.locked ? (
                              <span className="badge bg-primary/10 text-primary" title="Category set by the required-documents section">
                                {label(s.category)}
                              </span>
                            ) : (
                              <Select
                                value={s.category}
                                onChange={(v) => updateStaged(i, { category: v })}
                                options={catOptions.map((c) => ({ value: c, label: label(c) }))}
                                placeholder="Category"
                                className="w-full sm:w-40"
                                searchable={false}
                              />
                            )}
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
                  );
                })}
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

      {/* Documents */}
      <div>
        <div className="flex items-center gap-2 px-4 text-sm font-semibold text-slate-600">
          <FileText className="h-4 w-4" /> Documents ({nonImageDocs.length})
        </div>
        {nonImageDocs.length === 0 ? (
          <p className="mt-2 px-4 text-sm text-slate-400">No documents uploaded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {Array.from(docGroups.entries())
              .filter(([key]) => {
                const [title, cat] = key.split("|||");
                return nonImageDocs.some((d) => d.title === title && d.category === cat);
              })
              .map(([key, versions]) => {
                const latest = versions[0];
                const hasHistory = versions.length > 1;
                const expanded = expandedDocs.has(key);
                return (
                  <li key={key}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-slate-800">{latest.title}</span>
                          <span className="badge shrink-0 bg-slate-100 text-slate-500">v{latest.version}</span>
                          {hasHistory && (
                            <span className="badge shrink-0 bg-blue-50 text-blue-600">{versions.length} versions</span>
                          )}
                          <span className="badge shrink-0 bg-primary/10 text-primary">{label(latest.category)}</span>
                          {latest.expiresAt && new Date(latest.expiresAt).getTime() < Date.now() &&
                            <span className="badge shrink-0 bg-red-100 text-red-700" title={`Expired ${formatDate(latest.expiresAt)}`}>Expired</span>}
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {latest.originalName} · {formatFileSize(latest.sizeBytes)} · {formatDate(latest.createdAt)}
                          {latest.uploadedBy?.fullName ? ` · by ${latest.uploadedBy.fullName}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPreview({ id: latest.id, name: latest.originalName, mimeType: latest.mimeType })} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Preview">
                          <Eye className="h-4 w-4" />
                        </button>
                        <a href={`/api/documents/${latest.id}?download=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Download">
                          <Download className="h-4 w-4" />
                        </a>
                        {canDelete && (
                          <button onClick={() => askDelete(latest.id, latest.title)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {hasHistory && (
                          <button onClick={() => toggleDocGroup(key)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Version history">
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded && hasHistory && (
                      <ul className="border-t border-slate-50 bg-slate-50/50">
                        {versions.slice(1).map((v) => (
                          <li key={v.id} className="flex items-center gap-3 px-4 py-2.5 pl-16">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-600">v{v.version}</span>
                                <span className="text-xs text-slate-400">{formatDate(v.createdAt)}</span>
                                <span className="text-xs text-slate-400">{formatFileSize(v.sizeBytes)}</span>
                              </div>
                              <div className="truncate text-xs text-slate-400">{v.originalName}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setPreview({ id: v.id, name: v.originalName, mimeType: v.mimeType })} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Preview">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <a href={`/api/documents/${v.id}?download=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Download">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <Tooltip content="Restore this version">
                                <button onClick={() => setRestoreId(v.id)} className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50" title="Restore">
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              </Tooltip>
                              {canDelete && (
                                <button onClick={() => askDelete(v.id, v.title)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
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
            {Array.from(imgGroups.entries()).map(([key, versions]) => {
              const latest = versions[0];
              const hasHistory = versions.length > 1;
              const expanded = expandedImgs.has(key);
              return (
                <div key={key} className="flex flex-col overflow-hidden rounded-xl border border-slate-100">
                  <a
                    href={`/api/documents/${latest.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-32 items-center justify-center bg-slate-50"
                    title="Open full image"
                  >
                    <img
                      src={`/api/documents/${latest.id}`}
                      alt={latest.originalName}
                      className="max-h-32 max-w-full object-contain"
                    />
                  </a>
                  <div className="border-t border-slate-100 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="badge max-w-full truncate shrink-0 bg-primary/10 text-primary">{label(latest.category)}</span>
                          <span className="badge shrink-0 bg-slate-100 text-slate-500">v{latest.version}</span>
                          {hasHistory && (
                            <span className="badge shrink-0 bg-blue-50 text-blue-600">{versions.length} versions</span>
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-400">{formatFileSize(latest.sizeBytes)} · {formatDate(latest.createdAt)}</div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <a href={`/api/documents/${latest.id}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="View">
                          <Eye className="h-4 w-4" />
                        </a>
                        <a href={`/api/documents/${latest.id}?download=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Download">
                          <Download className="h-4 w-4" />
                        </a>
                        {canDelete && (
                          <button onClick={() => askDelete(latest.id, latest.originalName)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {hasHistory && (
                          <button onClick={() => toggleImgGroup(key)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Version history">
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded && hasHistory && (
                      <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                        {versions.slice(1).map((v) => (
                          <div key={v.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-medium text-slate-600">v{v.version}</span>
                                <span className="text-slate-400">{formatDate(v.createdAt)}</span>
                                <span className="text-slate-400">{formatFileSize(v.sizeBytes)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <a href={`/api/documents/${v.id}`} target="_blank" rel="noreferrer" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" title="View">
                                <Eye className="h-3.5 w-3.5" />
                              </a>
                              <a href={`/api/documents/${v.id}?download=1`} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" title="Download">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <Tooltip content="Restore this version">
                                <button onClick={() => setRestoreId(v.id)} className="rounded-md p-1 text-amber-600 hover:bg-amber-50" title="Restore">
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              </Tooltip>
                              {canDelete && (
                                <button onClick={() => askDelete(v.id, v.originalName)} className="rounded-md p-1 text-red-500 hover:bg-red-50" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Move to Trash"
        message={`Move "${deleteInfo?.name ?? ""}" to the trash? It can be restored from the Documents → Trash view or deleted permanently later.`}
        confirmLabel="Move to trash"
      />

      <ConfirmModal
        open={restoreId !== null}
        onClose={() => setRestoreId(null)}
        onConfirm={doRestore}
        loading={busy}
        title="Restore Version"
        message="This will create a new document entry from the selected version. The current latest version is preserved."
        confirmLabel="Restore"
      />

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? "Preview"}
        size="xl"
      >
        {preview && (
          preview.mimeType.startsWith("image/") ? (
            <div className="flex items-center justify-center bg-slate-50">
              <img src={`/api/documents/${preview.id}`} alt={preview.name} className="max-h-[65dvh] rounded-lg object-contain" />
            </div>
          ) : (
            <iframe
              src={`/api/documents/${preview.id}`}
              title={preview.name}
              className="h-[65dvh] w-full rounded-lg border border-slate-200 bg-white"
            />
          )
        )}
      </Modal>
    </div>
  );
}
