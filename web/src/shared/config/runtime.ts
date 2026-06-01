import type { AuthUser } from "@/shared/types/auth";

export function isDesktopMode() {
  return process.env.APP_MODE === "desktop" || process.env.NEXT_PUBLIC_APP_MODE === "desktop";
}

export const DESKTOP_USER: AuthUser = {
  id: "desktop-local-user",
  name: "本机用户",
  email: "local@desktop.xyfrag",
  role: "user",
  emailVerifiedAt: null,
  createdAt: null,
  lastLoginAt: null,
  disabledAt: null,
  coreAdmin: false,
};
