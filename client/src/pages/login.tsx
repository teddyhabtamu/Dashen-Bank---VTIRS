import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth-context";

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      await refresh();
      navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      {/* Brand panel — white so the logo text stays readable */}
      <section className="flex flex-col items-center justify-center gap-6 bg-white px-8 py-10 md:w-1/2 md:py-16">
        <img
          src="/dashen-logo.svg"
          alt="Dashen Bank"
          className="h-24 w-auto md:h-40"
        />
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary md:text-3xl">
            Dashen Bank
          </h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-secondary">
            VTIRS
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Vehicle Technical Identification &amp; Registration System
          </p>
          <p className="mt-1 text-xs text-slate-400">Facilities Department</p>
        </div>
      </section>

      {/* Form panel — brand gradient */}
      <section className="flex flex-1 items-center justify-center bg-gradient-to-br from-primary via-primary-600 to-secondary px-6 py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-6 text-white">
            <h2 className="text-xl font-semibold">Welcome back</h2>
            <p className="mt-1 text-sm text-white/70">Sign in to continue to VTIRS.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70"
                htmlFor="username"
              >
                Username
              </label>
              <input
                id="username"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/50 focus:ring-2 focus:ring-white/20"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. admin"
                required
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/50 focus:ring-2 focus:ring-white/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={error ? true : undefined}
                required
              />
            </div>

            {error && (
              <div role="alert" className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100 ring-1 ring-inset ring-red-400/40">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn w-full bg-white font-semibold text-primary hover:bg-white/90"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <p className="text-center text-xs text-white/50">
              Default admin — <span className="font-medium text-white/70">admin</span> /{" "}
              <span className="font-medium text-white/70">Admin@1234</span>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
