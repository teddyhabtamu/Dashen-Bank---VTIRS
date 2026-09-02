import { useCallback, useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Building2, Bell, Monitor, ShieldCheck } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
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
};

const GROUP_DESCRIPTIONS: Record<string, string> = {
  General: "Organization name and system identifiers",
  Reminders: "How many days before expiry to trigger notifications",
  Display: "UI preferences, list sizes, formatting",
  Security: "Session and access control settings",
};

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
    required_document_categories: "Document categories every vehicle must have to be considered compliant",
  };
  return H[key] ?? "";
}

export default function SettingsPage() {
  const [grouped, setGrouped] = useState<Grouped>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setGrouped(data ?? {});
      const flat: Record<string, string> = {};
      for (const items of Object.values(data ?? {}) as SettingItem[][]) {
        for (const item of items) {
          flat[item.id] = item.value;
        }
      }
      setValues(flat);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setDirty(true);
    setMessage(null);
  }

  function isNumericKey(key: string): boolean {
    return ["items_per_page", "session_timeout_minutes", "password_min_length", "max_login_attempts", "reminder_days_90", "reminder_days_60", "reminder_days_30", "reminder_days_7"].includes(key);
  }

  function isBooleanKey(key: string): boolean {
    return ["notify_registration", "notify_insurance"].includes(key);
  }

  function isRequiredCatKey(key: string): boolean {
    return key === "required_document_categories";
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

  async function save() {
    setSaving(true);
    setMessage(null);
    const updates = Object.entries(values).map(([id, value]) => ({ id, value }));
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        toast("error", "Failed to save settings");
        return;
      }
      const data = await res.json();
      setGrouped(data ?? {});
      setDirty(false);
      toast("success", "Settings saved");
    } finally {
      setSaving(false);
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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">System Settings</h2>
          <p className="text-sm text-slate-500">Configure application behavior and preferences</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </button>
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
                  {items.map((item) => (
                    <div key={item.id} className="px-4 py-3 transition-colors hover:bg-slate-50/50">
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
                          {isNumericKey(item.key) ? (
                            <div className="flex w-full items-center rounded-md border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200">
                              <button
                                type="button"
                                className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-r border-slate-200"
                                onClick={() => setValue(item.id, String(Math.max(0, Number(values[item.id] ?? 0) - (item.key === "session_timeout_minutes" ? 30 : 1))))}
                              >
                                −
                              </button>
                              <input
                                id={`setting-${item.id}`}
                                type="number"
                                min="0"
                                className="h-8 w-full min-w-0 border-0 bg-transparent px-2 text-center text-sm text-slate-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none outline-none"
                                value={values[item.id] ?? ""}
                                onChange={(e) => setValue(item.id, e.target.value)}
                              />
                              <button
                                type="button"
                                className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-l border-slate-200"
                                onClick={() => setValue(item.id, String(Number(values[item.id] ?? 0) + (item.key === "session_timeout_minutes" ? 30 : 1)))}
                              >
                                +
                              </button>
                            </div>
                          ) : isBooleanKey(item.key) ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={values[item.id] === "true"}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${values[item.id] === "true" ? "bg-primary" : "bg-slate-200"}`}
                              onClick={() => setValue(item.id, values[item.id] === "true" ? "false" : "true")}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${values[item.id] === "true" ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                          ) : isRequiredCatKey(item.key) ? (
                            <div className="flex w-full flex-wrap gap-1.5 sm:justify-end">
                              {(() => {
                                let arr: string[] = [];
                                try { arr = JSON.parse(values[item.id] ?? "[]"); } catch { arr = []; }
                                if (!Array.isArray(arr)) arr = [];
                                return DOCUMENT_CATEGORY_OPTIONS.map((c) => {
                                  const on = arr.includes(c);
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => toggleRequiredCat(item.id, c, values[item.id] ?? "[]")}
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${on ? "bg-primary text-white" : "border border-slate-200 text-slate-500 hover:border-slate-300"}`}
                                    >
                                      {on ? "✓ " : ""}{label(c)}
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            <input
                              id={`setting-${item.id}`}
                              className="input w-full"
                              value={values[item.id] ?? ""}
                              onChange={(e) => setValue(item.id, e.target.value)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
