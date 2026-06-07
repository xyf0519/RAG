export type UserRole = "user" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string | null;
  emailVerifiedAt?: number | null;
  createdAt?: number | null;
  lastLoginAt?: number | null;
  disabledAt?: number | null;
  coreAdmin?: boolean;
};

export type AuthSession = {
  user: AuthUser;
  issuedAt: number;
};

export type AuthSessionResponse = {
  ok: boolean;
  user: AuthUser | null;
};
