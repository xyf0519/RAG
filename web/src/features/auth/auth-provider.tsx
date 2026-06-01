"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { AuthSession, AuthUser } from "@/shared/types/auth";

const IS_DESKTOP_MODE = process.env.NEXT_PUBLIC_APP_MODE === "desktop";

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
      const data = (await response.json()) as { user?: AuthUser | null };
      setSession(data.user ? { user: data.user, issuedAt: Date.now() } : null);
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
    setSession({ user, issuedAt: Date.now() });
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
