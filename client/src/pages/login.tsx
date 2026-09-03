import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { useBrand } from "@/lib/brand-context";
import { useToast } from "@/lib/toast-context";

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh, user, loading: authLoading } = useAuth();
  const { companyName, systemName } = useBrand();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, user, navigate]);

  function updateCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(typeof e.getModifierState === "function" ? e.getModifierState("CapsLock") : false);
  }

  function togglePasswordVisibility() {
    setShowPassword((v) => !v);
    // Keep typing context in the password field after toggling.
    requestAnimationFrame(() => {
      const el = passwordRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

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
        // Authentication failures stay inline only; a second toast for the
        // same error adds noise without helping recovery.
        setError(data.error ?? "Login failed");
        return;
      }
      await refresh();
      toast("success", "Signed in successfully");
      navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col overflow-y-auto md:flex-row">
      <section className="flex flex-col items-center justify-center gap-4 bg-white px-8 py-8 md:w-1/2 md:gap-6 md:py-16">
        <img
          src="/dashen-logo.svg"
          alt={companyName}
          className="h-16 w-auto md:h-40"
        />
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary md:text-3xl">
            {companyName}
          </h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-secondary">
            {systemName}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Vehicle Technical Identification &amp; Registration System
          </p>
          <p className="mt-1 text-xs text-slate-400">Facilities Department</p>
        </div>
      </section>

      <section className="pb-safe flex flex-1 items-center justify-center bg-gradient-to-br from-primary via-primary-600 to-secondary px-6 py-8 md:w-1/2 md:py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-white">
            <h2 className="text-xl font-semibold">Welcome back</h2>
            <p className="mt-1 text-sm text-white/70">Sign in to continue to {systemName}.</p>
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
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-base text-white placeholder-white/40 outline-none transition focus:border-white/50 focus:ring-2 focus:ring-white/20 sm:text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                autoFocus
                placeholder="Enter username"
                aria-describedby={error ? "login-error" : undefined}
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
              <div className="relative">
                <input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-3 pr-11 text-base text-white placeholder-white/40 outline-none transition focus:border-white/50 focus:ring-2 focus:ring-white/20 sm:text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={updateCapsLock}
                  onKeyUp={updateCapsLock}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  placeholder="••••••••"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLockOn && password.length > 0 && (
                <p className="mt-1 text-xs text-amber-200">Caps Lock is on</p>
              )}
            </div>

            {error && (
              <div id="login-error" role="alert" className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100 ring-1 ring-inset ring-red-400/40">
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
          </form>
        </div>
      </section>
    </main>
  );
}
