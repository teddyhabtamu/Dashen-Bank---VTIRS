
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Search, Download, Eye } from "lucide-react";
import { Select } from "@/components/ui/select";
import { BrandLoader } from "@/components/ui/brand-loader";
import { DOCUMENT_CATEGORY_OPTIONS, label } from "@/lib/constants";
import { formatFileSize, formatDate } from "@/lib/format";

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
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");

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

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `“${search}”`, clear: () => setSearch("") });
  if (cat) chips.push({ key: "cat", label: `Category: ${label(cat)}`, clear: () => setCat("") });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Documents</h2>
        <p className="text-sm text-slate-500">Fleet-wide document repository</p>
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
                <div className="flex flex-shrink-0 items-center gap-1">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Preview"><Eye className="h-4 w-4" /></a>
                  <a href={`/api/documents/${d.id}?download=1`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Download"><Download className="h-4 w-4" /></a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
