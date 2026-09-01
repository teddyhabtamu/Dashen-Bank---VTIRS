import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  roleName: string;
  permissions: string[];
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  can: (permission: string | string[]) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Periodically validate the session to catch expired JWTs.
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok && window.location.pathname !== "/login") {
        setUser(null);
        window.location.href = "/login";
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  }

  function can(permission: string | string[]): boolean {
    const perms = user?.permissions ?? [];
    const required = Array.isArray(permission) ? permission : [permission];
    return required.some((p) => perms.includes(p));
  }

  return (
    <AuthContext.Provider value={{ user, loading, can, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
