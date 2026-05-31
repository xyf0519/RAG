export type UserRole = "user" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type AuthSession = {
  user: AuthUser;
  issuedAt: number;
};

export type AuthSessionResponse = {
  ok: boolean;
  user: AuthUser | null;
};
