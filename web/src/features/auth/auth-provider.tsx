"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";
import type { AuthSession, AuthUser } from "@/shared/types/auth";

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
      setSession(data.user ? { user: mapAuthUser(data.user), issuedAt: Date.now() } : null);
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
    setSession({ user: mapAuthUser(user), issuedAt: Date.now() });
    setReady(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
    }
  }, []);

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
