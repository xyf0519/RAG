"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";
import type { AuthSession, AuthUser } from "@/shared/types/auth";

const IS_DESKTOP_MODE = process.env.NEXT_PUBLIC_APP_MODE === "desktop";
const DESKTOP_PROFILE_KEY = "maverella.desktop.profile";

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  ready: boolean;
  isAdmin: boolean;
  refreshSession: () => Promise<void>;
  setAuthenticatedUser: (user: AuthUser) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await response.json()) as { user?: BackendAuthUser | null };
      const nextUser = data.user ? mapAuthUser(data.user) : null;
      setSession(nextUser ? { user: IS_DESKTOP_MODE ? mergeDesktopProfile(nextUser) : nextUser, issuedAt: Date.now() } : null);
    } catch {
      setSession(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const setAuthenticatedUser = useCallback((user: AuthUser) => {
    const nextUser = mapAuthUser(user);
    if (IS_DESKTOP_MODE) {
      saveDesktopProfile(nextUser);
    }
    setSession({ user: nextUser, issuedAt: Date.now() });
    setReady(true);
  }, []);

  const signOut = useCallback(async () => {
    if (IS_DESKTOP_MODE) {
      await refreshSession();
      return;
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
    }
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      ready,
      isAdmin: session?.user.role === "admin",
      refreshSession,
      setAuthenticatedUser,
      signOut,
    }),
    [ready, refreshSession, session, setAuthenticatedUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function mergeDesktopProfile(user: AuthUser): AuthUser {
  try {
    const raw = window.localStorage.getItem(DESKTOP_PROFILE_KEY);
    const profile = raw ? (JSON.parse(raw) as Partial<AuthUser>) : {};
    return {
      ...user,
      name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : user.name,
      avatarUrl: typeof profile.avatarUrl === "string" && profile.avatarUrl ? profile.avatarUrl : null,
    };
  } catch {
    return user;
  }
}

function saveDesktopProfile(user: AuthUser) {
  try {
    window.localStorage.setItem(DESKTOP_PROFILE_KEY, JSON.stringify({
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
    }));
  } catch {
    // Local profile persistence is best-effort in desktop mode.
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
