import { useCallback, useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Building2, Bell, Monitor, ShieldCheck } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

interface SettingItem {
  id: string;
  key: string;
  value: string;
  label: string | null;
  group: string | null;
}

type Grouped = Record<string, SettingItem[]>;

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
    reminder_days_90: "Earliest window for expiry notifications",
    reminder_days_60: "Mid-range expiry notification window",
    reminder_days_30: "Warning window for upcoming expiries",
    reminder_days_7: "Critical window — items expiring within this period",
    items_per_page: "Number of rows shown in tables and list views",
    session_timeout_minutes: "0 = never expires",
    default_owner_name: "Pre-filled owner when registering a new vehicle",
    password_min_length: "Minimum characters required for user passwords",
    max_login_attempts: "Account locks after this many failed sign-in attempts",
    notify_registration: "Send push notifications when registrations are about to expire",
    notify_insurance: "Send push notifications when insurance is about to expire",
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
        setMessage({ type: "error", text: "Failed to save settings" });
        return;
      }
      const data = await res.json();
      setGrouped(data ?? {});
      setDirty(false);
      setMessage({ type: "success", text: "Settings saved successfully." });
      setTimeout(() => setMessage(null), 3000);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-800">System Settings</h2>
          <p className="text-xs text-slate-500">Configure application behavior and preferences</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
          <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
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
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, items]) => {
            const Icon = GROUP_ICONS[group] ?? SettingsIcon;
            return (
              <div key={group} className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100">
                    <Icon className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{group}</h3>
                    <p className="text-xs text-slate-400">{GROUP_DESCRIPTIONS[group] ?? ""}</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <div key={item.id} className="px-5 py-4 transition-colors hover:bg-slate-50/50">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`setting-${item.id}`} className="text-sm font-medium text-slate-700">
                            {item.label ?? item.key}
                          </label>
                          {helps(item.key) && (
                            <p className="mt-0.5 text-xs text-slate-400">{helps(item.key)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:w-48 sm:shrink-0">
                          {isNumericKey(item.key) ? (
                            <div className="flex w-full items-center rounded-md border border-slate-200 bg-white focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-r border-slate-200"
                                onClick={() => setValue(item.id, String(Math.max(0, Number(values[item.id] ?? 0) - (item.key === "session_timeout_minutes" ? 30 : 1))))}
                              >
                                −
                              </button>
                              <input
                                id={`setting-${item.id}`}
                                type="number"
                                min="0"
                                className="h-9 w-full min-w-0 border-0 bg-transparent px-2 text-center text-sm text-slate-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none outline-none"
                                value={values[item.id] ?? ""}
                                onChange={(e) => setValue(item.id, e.target.value)}
                              />
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-l border-slate-200"
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
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${values[item.id] === "true" ? "bg-primary" : "bg-slate-200"}`}
                              onClick={() => setValue(item.id, values[item.id] === "true" ? "false" : "true")}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${values[item.id] === "true" ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
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
