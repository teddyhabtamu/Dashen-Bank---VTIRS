import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/format";
import { User, Mail, Shield, Building2, KeyRound, Clock, Calendar, Save, LogOut } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  status: string;
  roleSlug: string;
  roleName: string;
  branchName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile ?? null);
        setFullName(d.profile?.fullName ?? "");
        setEmail(d.profile?.email ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile");
        return;
      }
      if (data.user) await refresh();
      setCurrentPassword("");
      setNewPassword("");
      toast("success", "Profile updated");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">My Profile</h2>
          <p className="text-sm text-slate-500">View and manage your account details</p>
        </div>
        <BrandLoader />
      </div>
    );
  }

  const initials =
    (user?.fullName ?? profile?.fullName ?? "?")
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">My Profile</h2>
          <p className="text-sm text-slate-500">View and manage your account details</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-5">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-800">
              {profile?.fullName ?? user?.fullName}
            </div>
            <div className="truncate text-sm text-slate-500">
              @{profile?.username ?? user?.username} · {profile?.roleName ?? user?.roleName}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
          <DetailRow icon={User} label="Username" value={profile?.username ?? user?.username ?? "—"} />
          <DetailRow icon={Mail} label="Email" value={profile?.email ?? "—"} />
          <DetailRow icon={Shield} label="Role" value={profile?.roleName ?? user?.roleName ?? "—"} />
          <DetailRow icon={Building2} label="Branch" value={profile?.branchName ?? "—"} />
          <DetailRow icon={Clock} label="Last login" value={profile?.lastLoginAt ? formatDateTime(profile.lastLoginAt) : "—"} />
          <DetailRow icon={Calendar} label="Member since" value={profile?.createdAt ? formatDate(profile.createdAt) : "—"} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <User className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Edit Profile</h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Full Name <span className="text-red-400">*</span>
              <input
                className="input mt-1"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="text-sm">
              Email <span className="text-red-400">*</span>
              <input
                className="input mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <h4 className="text-sm font-semibold text-slate-700">Change Password</h4>
            <span className="text-xs text-slate-400">(leave blank to keep current password)</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Current Password
              <input
                className="input mt-1"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={saving}
                autoComplete="current-password"
              />
            </label>
            <label className="text-sm">
              New Password
              <input
                className="input mt-1"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={saving}
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button className="btn-primary" onClick={saveProfile} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
            </button>
            <button className="btn-outline text-red-600 hover:bg-red-50" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="truncate text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}
