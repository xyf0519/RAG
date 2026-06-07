import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { proxyBackendJson } from "@/server/rag/client";
import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";
import type { AuthUser } from "@/shared/types/auth";

const SESSION_COOKIE = "xyfrag.session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  issuedAt: number;
};

type BackendAuthResponse = {
  ok: boolean;
  user?: BackendAuthUser | null;
  message?: string;
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

export function getAuthSecret() {
  return process.env.AUTH_SECRET ?? "xyfrag-dev-auth-secret-change-me";
}

export function signSession(userId: string) {
  const payload: SessionPayload = {
    userId,
    issuedAt: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySession(value: string | undefined): SessionPayload | null {
  if (!value) {
    return null;
  }
  const [body, signature] = value.split(".");
  if (!body || !signature) {
    return null;
  }
  const expected = crypto.createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || Date.now() - payload.issuedAt > SESSION_MAX_AGE_SECONDS * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: signSession(userId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function getCurrentUser(request?: NextRequest): Promise<AuthUser | null> {
  let cookieValue: string | undefined;
  if (request) {
    cookieValue = request.cookies?.get(SESSION_COOKIE)?.value ?? getCookieFromHeader(request.headers.get("cookie"));
  } else {
    const cookieStore = await cookies();
    cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
  }
  const payload = verifySession(cookieValue);
  if (!payload) {
    return null;
  }
  try {
    const data = (await proxyBackendJson(`/api/v1/auth/users/${payload.userId}`)) as BackendAuthResponse;
    return data.user ? mapAuthUser(data.user) : null;
  } catch {
    return null;
  }
}

function getCookieFromHeader(header: string | null) {
  if (!header) {
    return undefined;
  }
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export async function requireUser(request?: NextRequest): Promise<AuthResult> {
  const user = await getCurrentUser(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "请先登录。" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

export async function requireAdmin(request?: NextRequest): Promise<AuthResult> {
  const result = await requireUser(request);
  if (!result.ok) {
    return result;
  }
  if (result.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "需要管理员权限。" }, { status: 403 }),
    };
  }
  return result;
}
