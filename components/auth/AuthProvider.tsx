"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SessionUser } from "@/lib/auth/types";
import {
  clearAuthSession,
  clearRegistrationDraft,
  saveAuthSession,
  syncProfileToLegacyStorage,
  type UserProfile,
} from "@/lib/user-api";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  isOrganizer: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; user?: SessionUser }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as {
      user?: SessionUser;
      error?: string;
      token?: string;
      profile?: UserProfile;
    };
    if (!res.ok || !data.user) {
      return { ok: false, error: data.error || "Unable to sign in." };
    }

    // Persist Mongo JWT + profile fields for legacy pages / profile hydration.
    if (data.token && data.profile) {
      saveAuthSession(data.token, data.profile);
      syncProfileToLegacyStorage(data.profile);
    }

    setUser(data.user);
    return { ok: true, user: data.user };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearAuthSession();
    clearRegistrationDraft();
    try {
      window.sessionStorage.removeItem("dcspaceLoggedIn");
      window.sessionStorage.removeItem("dcspaceCurrentUser");
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isOrganizer: Boolean(user?.isOrganizer),
      login,
      logout,
      refresh,
    }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
