"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { AuthSession, AuthUser, UserRole } from "@/shared/types/auth";

const AUTH_KEY = "xyfrag.auth.v1";

const DEMO_USERS: Record<UserRole, AuthUser> = {
  admin: {
    id: "admin",
    name: "知识库管理员",
    email: "admin@xyfrag.cn",
    role: "admin",
  },
  user: {
    id: "user",
    name: "知识库用户",
    email: "user@xyfrag.cn",
    role: "user",
  },
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  ready: boolean;
  isAdmin: boolean;
  signIn: (role: UserRole) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        setSession(JSON.parse(stored) as AuthSession);
      } catch {
        window.localStorage.removeItem(AUTH_KEY);
      }
    }
    setReady(true);
  }, []);

  const signIn = useCallback((role: UserRole) => {
    const nextSession = {
      user: DEMO_USERS[role],
      issuedAt: Date.now(),
    };
    setSession(nextSession);
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(nextSession));
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    window.localStorage.removeItem(AUTH_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      ready,
      isAdmin: session?.user.role === "admin",
      signIn,
      signOut,
    }),
    [ready, session, signIn, signOut],
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
