import { useCallback, useEffect, useState } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

interface SettingItem {
  id: string;
  key: string;
  value: string;
  label: string | null;
  group: string | null;
}

type Grouped = Record<string, SettingItem[]>;

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto flex items-center gap-2 text-lg font-semibold text-slate-800">
          <SettingsIcon className="h-5 w-5 text-primary" />
          System Settings
        </h2>
        <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <SettingsIcon className="mb-2 h-10 w-10" />
          <p>No settings configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="overflow-hidden rounded-lg border bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-700">{group}</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`setting-${item.id}`} className="block text-sm font-medium text-slate-700">
                        {item.label ?? item.key}
                      </label>
                      <p className="mt-0.5 text-xs text-slate-400 font-mono">{item.key}</p>
                    </div>
                    <input
                      id={`setting-${item.id}`}
                      className="input sm:max-w-xs"
                      value={values[item.id] ?? ""}
                      onChange={(e) => setValue(item.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
