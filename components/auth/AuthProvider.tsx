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
import { isAdminRole } from "@/lib/auth/types";
import {
  clearAuthSession,
  clearRegistrationDraft,
  saveAuthSession,
  syncProfileToLegacyStorage,
  type UserProfile,
} from "@/lib/user-api";
import { readCachedAuthUser } from "@/lib/cached-auth-user";
import { invalidatePortalCache } from "@/lib/portal-data-client";

type LoginOptions = {
  portal?: "admin" | "user";
  expectedRole?: "admin" | "super-admin";
};

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  isOrganizer: boolean;
  isAdmin: boolean;
  login: (
    email: string,
    password: string,
    options?: LoginOptions,
  ) => Promise<{ ok: boolean; error?: string; user?: SessionUser; redirectTo?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Always start null so server HTML and the first client render match.
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const cached = readCachedAuthUser();
    const hadCachedUser = Boolean(cached);
    if (cached) setUser(cached);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        if (!hadCachedUser) setUser(null);
        return;
      }
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user);
      // Keep local profile name in sync so every page header resolves the same value.
      if (data.user?.name && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("dcspace_auth");
          if (raw) {
            const parsed = JSON.parse(raw) as {
              token: string;
              user: UserProfile;
            };
            if (parsed?.user) {
              const parts = data.user.name.trim().split(/\s+/).filter(Boolean);
              parsed.user.fullName = data.user.name;
              if (!parsed.user.firstName && parts[0]) parsed.user.firstName = parts[0];
              if (!parsed.user.lastName && parts.length > 1) {
                parsed.user.lastName = parts.slice(1).join(" ");
              }
              window.localStorage.setItem("dcspace_auth", JSON.stringify(parsed));
              syncProfileToLegacyStorage(parsed.user);
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      if (!hadCachedUser) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep header name in sync when profile is saved/hydrated from local session.
  useEffect(() => {
    const onProfileUpdated = () => {
      const cached = readCachedAuthUser();
      if (!cached) return;
      setUser((prev) =>
        prev
          ? {
              ...prev,
              name: cached.name || prev.name,
              role: cached.role || prev.role,
              isOrganizer: cached.isOrganizer,
              isAdmin: cached.isAdmin,
            }
          : cached,
      );
    };
    window.addEventListener("dcspace-profile-updated", onProfileUpdated);
    return () => window.removeEventListener("dcspace-profile-updated", onProfileUpdated);
  }, []);

  const login = useCallback(
    async (email: string, password: string, options?: LoginOptions) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          portal: options?.portal || "user",
          expectedRole: options?.expectedRole,
        }),
      });
      const data = (await res.json()) as {
        user?: SessionUser;
        error?: string;
        token?: string;
        profile?: UserProfile;
        redirectTo?: string;
      };
      if (!res.ok || !data.user) {
        return {
          ok: false,
          error: data.error || "Unable to sign in.",
          redirectTo: data.redirectTo,
        };
      }

      // Drop previous account's portal/joined cache before switching users.
      invalidatePortalCache({ resetUi: true });

      if (data.token && data.profile) {
        saveAuthSession(data.token, data.profile);
        syncProfileToLegacyStorage(data.profile);
      }

      if (data.user.isAdmin || isAdminRole(data.user.role)) {
        try {
          localStorage.setItem("dc_admin_role", data.user.role);
        } catch {
          /* ignore */
        }
      }

      setUser(data.user);
      return { ok: true, user: data.user };
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* still clear local session */
    }
    clearAuthSession();
    clearRegistrationDraft();
    try {
      window.sessionStorage.removeItem("dcspaceLoggedIn");
      window.sessionStorage.removeItem("dcspaceCurrentUser");
      window.localStorage.removeItem("dc_admin_role");
      document.body.classList.remove("is-super-admin");
      invalidatePortalCache({ resetUi: true });
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
      isAdmin: Boolean(user?.isAdmin || isAdminRole(user?.role)),
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
