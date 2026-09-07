import { useCallback, useEffect, useState } from "react";
import { Link, useBlocker } from "react-router-dom";
import { Settings as SettingsIcon, Save, Building2, Bell, Monitor, ShieldCheck, FileText, RotateCcw, History } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/components/auth-context";
import { PERMISSIONS } from "@/lib/rbac";
import { useToast } from "@/lib/toast-context";
import { DOCUMENT_CATEGORY_OPTIONS, label } from "@/lib/constants";

interface SettingItem {
  id: string;
  key: string;
  value: string;
  label: string | null;
  group: string | null;
}

type Grouped = Record<string, SettingItem[]>;

const REMINDER_LABELS: Record<string, string> = {
  reminder_days_90: "Primary reminder window",
  reminder_days_60: "Secondary reminder window",
  reminder_days_30: "Warning reminder window",
  reminder_days_7: "Critical reminder window",
};

const GROUP_ICONS: Record<string, typeof Building2> = {
  General: Building2,
  Reminders: Bell,
  Display: Monitor,
  Security: ShieldCheck,
  Documents: FileText,
};

const GROUP_DESCRIPTIONS: Record<string, string> = {
  General: "Organization name and system identifiers",
  Reminders: "How many days before expiry to trigger notifications",
  Display: "UI preferences, list sizes, formatting",
  Security: "Session and access control settings",
  Documents: "Which document categories every vehicle must hold to be compliant",
};

// Reminder window keys in descending-display order: [primary, secondary, warning, critical].
const WINDOW_KEYS = ["reminder_days_90", "reminder_days_60", "reminder_days_30", "reminder_days_7"];
const WINDOW_SHORT = ["Pri", "Sec", "Warn", "Crit"];
const WINDOW_FULL = ["Primary", "Secondary", "Warning", "Critical"];

function intIn(value: string, min: number, max: number): boolean {
  if (!value || !value.trim()) return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

// Single-field rules — mirrors the server's validateSettingValue so the UI
// refuses exactly what the API would reject.
function validateValue(key: string, value: string): string | null {
  const v = value ?? "";
  switch (key) {
    case "company_name":
    case "system_name":
      return v.trim() ? null : "This field is required.";
    case "items_per_page":
      return intIn(v, 1, 200) ? null : "Enter a whole number between 1 and 200.";
    case "session_timeout_minutes":
      return intIn(v, 0, 525600) ? null : "Enter 0 (never expires) or a positive whole number.";
    case "password_min_length":
      return intIn(v, 4, 64) ? null : "Enter a whole number between 4 and 64.";
    case "max_login_attempts":
      return intIn(v, 1, 20) ? null : "Enter a whole number between 1 and 20.";
    case "reminder_days_90":
    case "reminder_days_60":
    case "reminder_days_30":
    case "reminder_days_7":
      return intIn(v, 1, 3650) ? null : "Enter a whole number of 1 or more.";
    default:
      return null;
  }
}

function helps(key: string): string {
  const H: Record<string, string> = {
    company_name: "Displayed in the sidebar, login page, and PDF exports",
    system_name: "System acronym used across the UI and page titles",
    reminder_days_90: "Set the number of days before expiry for the earliest reminder",
    reminder_days_60: "Set the number of days before expiry for the mid-range reminder",
    reminder_days_30: "Set the number of days before expiry for the warning reminder",
    reminder_days_7: "Set the number of days before expiry for the critical reminder",
    items_per_page: "Number of rows shown in tables and list views",
    session_timeout_minutes: "0 = never expires",
    default_owner_name: "Pre-filled owner when registering a new vehicle",
    password_min_length: "Minimum characters required for user passwords",
    max_login_attempts: "Account locks after this many failed sign-in attempts",
    notify_registration: "Send push notifications when registrations are about to expire",
    notify_insurance: "Send push notifications when insurance is about to expire",
    notify_driver_license: "Send push notifications when driver licenses are about to expire",
    reminder_windows_by_type: "Override the default reminder windows for specific vehicle types. Fields are primary, secondary, warning, and critical days before expiry.",
    required_document_categories: "Document categories every vehicle must have to be considered compliant",
  };
  return H[key] ?? "";
}

export default function SettingsPage() {
  const { can } = useAuth();
  const canManageSettings = can(PERMISSIONS.SETTING_MANAGE);
  const [grouped, setGrouped] = useState<Grouped>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { toast } = useToast();

  // Unsaved-changes guard: in-app navigation blocks with a confirm dialog,
  // tab close/reload uses the native prompt. Mirrors vehicles/detail.tsx.
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") setBlockConfirm(true);
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    function onBefore(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    if (!canManageSettings) {
      setLoading(false);
      setForbidden(true);
      return;
    }
    try {
      const res = await fetch("/api/settings");
      if (res.status === 403) {
        setGrouped({});
        setValues({});
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      const { _vehicleTypes, ...groups } = data ?? {};
      setGrouped(groups ?? {});
      setVehicleTypes(Array.isArray(_vehicleTypes) ? _vehicleTypes : []);
      const flat: Record<string, string> = {};
      for (const items of Object.values(groups ?? {}) as SettingItem[][]) {
        for (const item of items) {
          flat[item.id] = item.value;
        }
      }
      setValues(flat);
    } catch {
      setGrouped({});
      setMessage({ type: "error", text: "Could not load settings. Please try again." });
    } finally {
      setLoading(false);
    }
  }, [canManageSettings]);

  useEffect(() => { load(); }, [load]);

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setDirty(true);
    setMessage(null);
    // Clear this field's error as soon as the admin starts fixing it.
    setErrors((prev) => {
      if (!Object.keys(prev).some((k) => k === id || k.startsWith(`${id}:`))) return prev;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k === id || k.startsWith(`${id}:`)) delete next[k];
      }
      return next;
    });
  }

  function allItems(): SettingItem[] {
    return Object.values(grouped).flat();
  }

  // Full-form validation. Returns error map; empty means valid. Covers
  // single-field rules plus the cross-field descending-window checks the
  // server enforces (global windows and every per-type override).
  function validateAll(): Record<string, string> {
    const errs: Record<string, string> = {};
    const items = allItems();
    const byKey = new Map(items.map((i) => [i.key, i]));
    for (const item of items) {
      const msg = validateValue(item.key, values[item.id] ?? "");
      if (msg) errs[item.id] = msg;
    }
    const winIds = WINDOW_KEYS.map((k) => byKey.get(k)?.id).filter((id): id is string => !!id);
    const wins = winIds.map((id) => Number(values[id] ?? NaN));
    if (
      winIds.length === 4 &&
      wins.every((n) => Number.isInteger(n)) &&
      !(wins[0] > wins[1] && wins[1] > wins[2] && wins[2] > wins[3])
    ) {
      for (const id of winIds) {
        if (!errs[id]) errs[id] = "Windows must descend: Primary > Secondary > Warning > Critical.";
      }
    }
    const ptItem = byKey.get("reminder_windows_by_type");
    if (ptItem && !errs[ptItem.id]) {
      const m = perTypeMap(values[ptItem.id] ?? "{}");
      for (const [type, win] of Object.entries(m)) {
        if (win.length !== 4 || win.some((n) => !Number.isInteger(n) || n < 1)) {
          errs[`${ptItem.id}:${type}`] = "Enter four whole numbers of 1 or more.";
        } else {
          const [a, b, c, d] = win;
          if (!(a > b && b > c && c > d)) {
            errs[`${ptItem.id}:${type}`] = "Windows must descend: Primary > Secondary > Warning > Critical.";
          }
        }
      }
    }
    return errs;
  }

  function scrollToFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    // Per-type errors are keyed `${settingId}:${type}` — scroll to the row.
    const rowId = first.includes(":") ? first.split(":")[0] : first;
    document.getElementById(`setting-row-${rowId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function isNumericKey(key: string): boolean {
    return ["items_per_page", "session_timeout_minutes", "password_min_length", "max_login_attempts", "reminder_days_90", "reminder_days_60", "reminder_days_30", "reminder_days_7"].includes(key);
  }

  function isBooleanKey(key: string): boolean {
    return ["notify_registration", "notify_insurance", "notify_driver_license"].includes(key);
  }

  function isRequiredCatKey(key: string): boolean {
    return key === "required_document_categories";
  }

  function isPerTypeKey(key: string): boolean {
    return key === "reminder_windows_by_type";
  }

  // Complex editors need the full row width — the 176px value column would
  // crush the per-type grid and the category chips.
  function isFullWidthKey(key: string): boolean {
    return isPerTypeKey(key) || isRequiredCatKey(key);
  }

  function perTypeMap(current: string): Record<string, number[]> {
    let m: Record<string, number[]> = {};
    try { m = JSON.parse(current); } catch { m = {}; }
    if (!m || typeof m !== "object" || Array.isArray(m)) m = {};
    return m;
  }

  function setTypeWindow(id: string, current: string, type: string, index: number, value: string) {
    const m = perTypeMap(current);
    const win = (m[type] ?? []).slice(0, 4);
    while (win.length < 4) win.push(0);
    win[index] = Number(value) || 0;
    m[type] = win;
    setValue(id, JSON.stringify(m));
  }

  function setTypeEnabled(id: string, current: string, type: string, enabled: boolean) {
    const m = perTypeMap(current);
    if (enabled) {
      if (!m[type]) m[type] = [90, 60, 30, 7];
    } else {
      delete m[type];
    }
    setValue(id, JSON.stringify(m));
  }

  function toggleRequiredCat(id: string, cat: string, current: string) {
    let arr: string[] = [];
    try { arr = JSON.parse(current); } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const next = arr.includes(cat) ? arr.filter((c) => c !== cat) : [...arr, cat];
    setValue(id, JSON.stringify(next));
  }

  function displayLabel(item: SettingItem): string {
    return REMINDER_LABELS[item.key] ?? item.label ?? item.key;
  }

  const errBorder = { borderColor: "#f87171" };

  function renderNumericControl(item: SettingItem, err?: string) {
    const step = item.key === "session_timeout_minutes" ? 30 : 1;
    const floor = item.key.startsWith("reminder_days_") ? 1 : 0;
    return (
      <div
        className="flex w-full items-center rounded-md border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200"
        style={err ? errBorder : undefined}
      >
        <button
          type="button"
          aria-label={`Decrease ${displayLabel(item)}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-r border-slate-200"
          onClick={() => setValue(item.id, String(Math.max(floor, Number(values[item.id] ?? 0) - step)))}
        >
          −
        </button>
        <input
          id={`setting-${item.id}`}
          type="number"
          min={floor}
          aria-invalid={!!err}
          className="h-8 w-full min-w-0 border-0 bg-transparent px-2 text-center text-sm text-slate-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none outline-none"
          value={values[item.id] ?? ""}
          onChange={(e) => setValue(item.id, e.target.value)}
        />
        <button
          type="button"
          aria-label={`Increase ${displayLabel(item)}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-l border-slate-200"
          onClick={() => setValue(item.id, String(Number(values[item.id] ?? 0) + step))}
        >
          +
        </button>
      </div>
    );
  }

  function renderBooleanControl(item: SettingItem) {
    const on = values[item.id] === "true";
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={displayLabel(item)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${on ? "bg-primary" : "bg-slate-200"}`}
        onClick={() => setValue(item.id, on ? "false" : "true")}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    );
  }

  function renderTextControl(item: SettingItem, err?: string) {
    return (
      <input
        id={`setting-${item.id}`}
        className="input w-full"
        style={err ? errBorder : undefined}
        aria-invalid={!!err}
        value={values[item.id] ?? ""}
        onChange={(e) => setValue(item.id, e.target.value)}
      />
    );
  }

  function renderPerTypeEditor(item: SettingItem) {
    if (vehicleTypes.length === 0) {
      return <div className="text-xs text-slate-400">No vehicle types on record. Add vehicles to configure per-type windows.</div>;
    }
    const m = perTypeMap(values[item.id] ?? "{}");
    return (
      <div className="space-y-2">
        {vehicleTypes.map((type) => {
          const stored = m[type] ?? null;
          // Always show four labeled inputs (pad/slice legacy shapes) so any
          // stored value is fixable through the UI.
          const shown = (stored ?? []).slice(0, 4);
          while (shown.length < 4) shown.push(0);
          const rowErr = errors[`${item.id}:${type}`];
          return (
            <div key={type} className="rounded-md border border-slate-100 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!stored}
                  aria-label={`Override reminder windows for ${type}`}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${stored ? "bg-primary" : "bg-slate-200"}`}
                  onClick={() => setTypeEnabled(item.id, values[item.id] ?? "{}", type, !stored)}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${stored ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <span className="min-w-20 text-xs font-medium text-slate-700">{type}</span>
                {stored ? (
                  <div className="flex flex-wrap items-end gap-1.5">
                    {shown.map((v, i) => (
                      <label key={i} className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400" title={WINDOW_FULL[i]}>{WINDOW_SHORT[i]}</span>
                        <input
                          type="number"
                          min="1"
                          aria-label={`${type} ${WINDOW_FULL[i]} window in days`}
                          aria-invalid={!!rowErr}
                          className="h-8 w-16 rounded-md border border-slate-200 px-1 text-center text-xs text-slate-700"
                          style={rowErr ? errBorder : undefined}
                          value={v}
                          onChange={(e) => setTypeWindow(item.id, values[item.id] ?? "{}", type, i, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Uses global windows</span>
                )}
              </div>
              {rowErr && <p className="mt-1.5 text-xs text-red-600">{rowErr}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  function renderRequiredCats(item: SettingItem) {
    let arr: string[] = [];
    try { arr = JSON.parse(values[item.id] ?? "[]"); } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {DOCUMENT_CATEGORY_OPTIONS.map((c) => {
          const on = arr.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggleRequiredCat(item.id, c, values[item.id] ?? "[]")}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${on ? "bg-primary text-white" : "border border-slate-200 text-slate-500 hover:border-slate-300"}`}
            >
              {on ? "✓ " : ""}{label(c)}
            </button>
          );
        })}
      </div>
    );
  }

  async function save() {
    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setMessage({ type: "error", text: "Some settings need attention before saving. Review the highlighted fields." });
      scrollToFirstError(errs);
      return;
    }
    setSaving(true);
    setMessage(null);
    const updates = Object.entries(values).map(([id, value]) => ({ id, value }));
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.status === 422) {
        // Server-side validation mirrors the client — surface it inline.
        const data = await res.json().catch(() => null);
        const serverErrs: Record<string, string> = {};
        for (const inv of data?.invalid ?? []) {
          if (inv?.id && inv?.message) serverErrs[inv.id] = inv.message;
        }
        setErrors(serverErrs);
        setMessage({ type: "error", text: data?.error ?? "Some settings are invalid." });
        scrollToFirstError(serverErrs);
        return;
      }
      if (!res.ok) {
        toast("error", "Failed to save settings");
        return;
      }
      const data = await res.json();
      setGrouped(data ?? {});
      // Re-sync from the server echo so the form never drifts from storage.
      const flat: Record<string, string> = {};
      for (const items of Object.values(data ?? {}) as SettingItem[][]) {
        if (!Array.isArray(items)) continue;
        for (const item of items) flat[item.id] = item.value;
      }
      setValues(flat);
      setErrors({});
      setDirty(false);
      toast("success", "Settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefaults() {
    setResetConfirm(false);
    setResetting(true);
    try {
      const res = await fetch("/api/settings/defaults");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const defaults = await res.json();
      const idByKey = new Map(allItems().map((i) => [i.key, i.id]));
      setValues((prev) => {
        const next = { ...prev };
        for (const d of defaults ?? []) {
          const id = idByKey.get(d?.key);
          if (id && typeof d?.value === "string") next[id] = d.value;
        }
        return next;
      });
      setErrors({});
      setDirty(true);
      setMessage(null);
      toast("success", "Factory defaults loaded — review and press Save to apply");
    } catch {
      toast("error", "Could not load factory defaults");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <SettingsIcon className="h-5 w-5 text-primary" />
          System Settings
        </h2>
        <div className="flex justify-center py-16"><BrandLoader /></div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-16 text-center">
        <h2 className="text-lg font-semibold text-slate-800">Settings are restricted</h2>
        <p className="text-sm text-slate-500">
          Your account does not have permission to view or change system settings. Contact an administrator if access is required.
        </p>
        <Link to="/dashboard" className="text-sm font-medium text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-800">System Settings</h2>
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              Configure application behavior and preferences
              {dirty && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/audit?entity=Setting"
              title="View change history"
              aria-label="View settings change history"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
            >
              <History className="h-4 w-4" />
            </Link>
            <button className="btn-outline" onClick={() => setResetConfirm(true)} disabled={saving || resetting} title="Load factory defaults into the form">
              <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">{resetting ? "Loading…" : "Reset"}</span>
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
          {message.text}
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <SettingsIcon className="mb-2 h-10 w-10" />
          <p>No settings configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([group, items]) => {
            const Icon = GROUP_ICONS[group] ?? SettingsIcon;
            return (
              <div key={group} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100">
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{group}</h3>
                    <p className="text-xs text-slate-400">
                      {GROUP_DESCRIPTIONS[group] ?? ""}
                      {group === "Reminders" ? " Values are editable days before expiry." : ""}
                    </p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const err = errors[item.id];
                    if (isFullWidthKey(item.key)) {
                      return (
                        <div key={item.id} id={`setting-row-${item.id}`} className="scroll-mt-32 px-4 py-3 transition-colors hover:bg-slate-50/50">
                          <div className="text-sm font-medium text-slate-700">{displayLabel(item)}</div>
                          {helps(item.key) && (
                            <p className="text-xs text-slate-400">{helps(item.key)}</p>
                          )}
                          <div className="mt-2">
                            {isPerTypeKey(item.key) ? renderPerTypeEditor(item) : renderRequiredCats(item)}
                          </div>
                          {err && <p className="mt-1.5 text-xs text-red-600">{err}</p>}
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} id={`setting-row-${item.id}`} className="scroll-mt-32 px-4 py-3 transition-colors hover:bg-slate-50/50">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <label htmlFor={`setting-${item.id}`} className="text-sm font-medium text-slate-700">
                              {displayLabel(item)}
                            </label>
                            {helps(item.key) && (
                              <p className="text-xs text-slate-400">{helps(item.key)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
                            {isNumericKey(item.key) ? renderNumericControl(item, err)
                              : isBooleanKey(item.key) ? renderBooleanControl(item)
                              : renderTextControl(item, err)}
                          </div>
                        </div>
                        {err && <p className="mt-1.5 text-xs text-red-600 sm:text-right">{err}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={blockConfirm}
        onClose={() => { setBlockConfirm(false); if (blocker.state === "blocked") blocker.reset(); }}
        onConfirm={() => { setBlockConfirm(false); if (blocker.state === "blocked") blocker.proceed(); }}
        title="Discard unsaved changes?"
        message="You have unsaved settings changes. Leaving now will lose them."
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
      />

      <ConfirmModal
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        onConfirm={resetToDefaults}
        title="Load factory defaults?"
        message="Your current values will be replaced in the form. Nothing is saved until you press Save."
        confirmLabel="Load defaults"
        cancelLabel="Cancel"
        variant="primary"
      />
    </div>
  );
}
