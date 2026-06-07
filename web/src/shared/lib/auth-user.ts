import type { AuthUser, UserRole } from "@/shared/types/auth";

export type BackendAuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  email_verified_at?: number | null;
  emailVerifiedAt?: number | null;
  created_at?: number | null;
  createdAt?: number | null;
  last_login_at?: number | null;
  lastLoginAt?: number | null;
  disabled_at?: number | null;
  disabledAt?: number | null;
  core_admin?: boolean;
  coreAdmin?: boolean;
};

export function mapAuthUser(user: BackendAuthUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
    emailVerifiedAt: user.email_verified_at ?? user.emailVerifiedAt ?? null,
    createdAt: user.created_at ?? user.createdAt ?? null,
    lastLoginAt: user.last_login_at ?? user.lastLoginAt ?? null,
    disabledAt: user.disabled_at ?? user.disabledAt ?? null,
    coreAdmin: Boolean(user.core_admin ?? user.coreAdmin),
  };
}
