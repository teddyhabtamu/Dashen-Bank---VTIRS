import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  History, ChevronRight, ShieldCheck, RefreshCw, FilePlus2,
  XCircle, Trash2, ArrowLeft, PenSquare,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime, formatDate } from "@/lib/format";
import { label } from "@/lib/constants";

interface HistoryEntry {
  id: string;
  action: string;
  prevStatus: string | null;
  newStatus: string | null;
  prevStartDate: string | null;
  newStartDate: string | null;
  prevEndDate: string | null;
  newEndDate: string | null;
  note: string | null;
  performedById: string | null;
  performedBy: { id: string; fullName: string } | null;
  createdAt: string;
}

interface Insurance {
  id: string;
  company: string;
  policyNo: string;
  coverage: string;
  startDate: string;
  endDate: string;
  status: string;
  vehicle: { id: string; plateNumber: string; vehicleCode: string; make?: string; model?: string };
  history: HistoryEntry[];
}

const ACTION_ICONS: Record<string, any> = {
  CREATE: FilePlus2,
  CANCELLED: XCircle,
  AMEND: PenSquare,
  RENEW: RefreshCw,
  DELETE: Trash2,
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "text-green-600 bg-green-100",
  CANCELLED: "text-red-600 bg-red-100",
  AMEND: "text-slate-600 bg-slate-100",
  RENEW: "text-blue-600 bg-blue-100",
  DELETE: "text-stone-600 bg-stone-100",
};

function DateChange({ from, to }: { from: string | null; to: string | null }) {
  if (!from && !to) return null;
  if (!from || !to || from === to) {
    return <span>{to ? formatDate(to) : formatDate(from!)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      {formatDate(from)} <ChevronRight className="h-3 w-3" /> {formatDate(to)}
    </span>
  );
}

export default function InsuranceHistoryPage() {
  const { id } = useParams();
  const [ins, setIns] = useState<Insurance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/insurances/${id}`)
      .then((r) => r.json())
      .then((d) => setIns(d.insurance ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <BrandLoader label="Loading history…" />;

  if (!ins) {
    return (
      <div className="card flex flex-col items-center py-16 text-center">
        <XCircle className="mb-3 h-10 w-10 text-slate-300" />
        <h3 className="text-base font-semibold text-slate-700">Policy not found</h3>
        <Link to="/insurances" className="mt-2 text-sm text-primary hover:underline">Back to insurances</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/insurances" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-primary mb-1">
            <ArrowLeft className="h-3 w-3" /> Back to Insurances
          </Link>
          <h2 className="text-xl font-semibold text-slate-800">Policy History</h2>
          <p className="text-sm text-slate-500">
            {ins.policyNo} · {ins.company} ·{" "}
            <Link to={`/vehicles/${ins.vehicle.id}`} className="text-blue-600 hover:underline">{ins.vehicle.plateNumber}</Link>
          </p>
        </div>
        <StatusBadge status={ins.status} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4 text-center">
          <div className="text-xs text-slate-400">Current Status</div>
          <div className="mt-1 text-base font-semibold text-slate-800 sm:text-lg">{label(ins.status)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-slate-400">Policy No</div>
          <div className="mt-1 text-base font-semibold text-slate-800 sm:text-lg">{ins.policyNo}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-slate-400">Coverage</div>
          <div className="mt-1 text-sm font-semibold text-slate-800 sm:text-lg">{ins.coverage}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-slate-400">Total Events</div>
          <div className="mt-1 text-base font-semibold text-slate-800 sm:text-lg">{ins.history.length}</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <History className="h-4 w-4" /> Timeline
        </div>
        {ins.history.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No history entries recorded.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-2 h-[calc(100%-24px)] w-0.5 bg-slate-200" />
            <ul className="space-y-0">
              {ins.history.map((h) => {
                const Icon = ACTION_ICONS[h.action] || History;
                const color = ACTION_COLORS[h.action] || "text-slate-500 bg-slate-100";
                return (
                  <li key={h.id} className="relative flex gap-4 pb-6 last:pb-0">
                    <div className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-800">{h.action}</span>
                        <span className="text-[10px] text-slate-400">{formatDateTime(h.createdAt)}</span>
                        {h.performedBy && (
                          <span className="text-[10px] font-medium text-slate-400">by {h.performedBy.fullName}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {h.prevStatus && h.newStatus && h.prevStatus !== h.newStatus && (
                          <span className="inline-flex items-center gap-1">
                            <StatusBadge status={h.prevStatus} /> <ChevronRight className="h-3 w-3" /> <StatusBadge status={h.newStatus} />
                          </span>
                        )}
                        {(h.prevEndDate || h.newEndDate) && (
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            <DateChange from={h.prevEndDate} to={h.newEndDate} />
                          </span>
                        )}
                        {h.note && <span className="italic">&ldquo;{h.note}&rdquo;</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}