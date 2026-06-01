"""SQLite-backed email authentication store."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import smtplib
import time
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from threading import RLock
import sqlite3


UserRole = str


@dataclass(frozen=True)
class AuthUserRecord:
    id: str
    email: str
    name: str
    role: UserRole
    email_verified_at: float | None
    created_at: float
    last_login_at: float | None
    disabled_at: float | None


class AuthError(ValueError):
    """Expected authentication workflow error."""


class AuthStore:
    """User, email-code, and audit metadata stored in SQLite."""

    def __init__(
        self,
        db_path: Path,
        allowed_domain: str = "zju.edu.cn",
        admin_emails: set[str] | None = None,
    ) -> None:
        self._db_path = db_path
        self._allowed_domain = allowed_domain.lower().lstrip("@")
        self._admin_emails = {email.lower() for email in (admin_emails or set())}
        self._lock = RLock()
        self._connect().close()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_schema(self) -> None:
        with self._lock, self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    email_verified_at REAL,
                    created_at REAL NOT NULL,
                    last_login_at REAL,
                    disabled_at REAL
                );

                CREATE TABLE IF NOT EXISTS email_codes (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    consumed_at REAL,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    email TEXT,
                    action TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at REAL NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_email_codes_lookup
                ON email_codes(email, purpose, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
                ON audit_logs(created_at DESC);
                """
            )

    def start_email_code(self, email: str, purpose: str) -> str:
        normalized_email = self.normalize_email(email)
        self.require_allowed_email(normalized_email)
        if purpose not in {"register", "password_reset"}:
            raise AuthError("验证码用途不正确。")
        if purpose == "register" and self.get_user_by_email(normalized_email):
            raise AuthError("该邮箱已注册，请直接登录。")
        if purpose == "password_reset" and not self.get_user_by_email(normalized_email):
            raise AuthError("该邮箱尚未注册。")

        now = time.time()
        with self._lock, self._connect() as connection:
            latest = connection.execute(
                """
                SELECT created_at FROM email_codes
                WHERE email = ? AND purpose = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (normalized_email, purpose),
            ).fetchone()
            if latest and now - float(latest["created_at"]) < 60:
                raise AuthError("验证码发送过于频繁，请稍后再试。")

            code = os.getenv("AUTH_DEV_CODE") or self._make_code()
            connection.execute(
                """
                INSERT INTO email_codes (
                    id, email, purpose, code_hash, expires_at, consumed_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, NULL, ?)
                """,
                (
                    f"code-{secrets.token_hex(12)}",
                    normalized_email,
                    purpose,
                    self._hash_secret(code),
                    now + 600,
                    now,
                ),
            )
        self.audit(None, normalized_email, f"{purpose}_code_requested")
        return code

    def register(self, email: str, password: str, code: str, name: str = "") -> AuthUserRecord:
        normalized_email = self.normalize_email(email)
        self.require_allowed_email(normalized_email)
        self._validate_password(password)
        if self.get_user_by_email(normalized_email):
            raise AuthError("该邮箱已注册，请直接登录。")
        self.consume_code(normalized_email, "register", code)

        now = time.time()
        user_id = f"user-{secrets.token_hex(12)}"
        role = self.role_for_email(normalized_email)
        display_name = name.strip() or normalized_email.split("@", 1)[0]
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id, email, password_hash, name, role, email_verified_at,
                    created_at, last_login_at, disabled_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    user_id,
                    normalized_email,
                    self._hash_password(password),
                    display_name,
                    role,
                    now,
                    now,
                    now,
                ),
            )
        self.audit(user_id, normalized_email, "register")
        return self.require_user(user_id)

    def login(self, email: str, password: str) -> AuthUserRecord:
        normalized_email = self.normalize_email(email)
        user_row = self._get_user_row_by_email(normalized_email)
        if not user_row or not self._verify_password(password, str(user_row["password_hash"])):
            self.audit(None, normalized_email, "login_failed")
            raise AuthError("邮箱或密码不正确。")
        if user_row["disabled_at"] is not None:
            raise AuthError("账号已停用，请联系管理员。")
        now = time.time()
        with self._lock, self._connect() as connection:
            connection.execute(
                "UPDATE users SET role = ?, last_login_at = ? WHERE id = ?",
                (
                    self.role_for_email(normalized_email, current_role=str(user_row["role"])),
                    now,
                    user_row["id"],
                ),
            )
        self.audit(str(user_row["id"]), normalized_email, "login")
        return self.require_user(str(user_row["id"]))

    def reset_password(self, email: str, code: str, new_password: str) -> AuthUserRecord:
        normalized_email = self.normalize_email(email)
        self._validate_password(new_password)
        user = self.get_user_by_email(normalized_email)
        if not user:
            raise AuthError("该邮箱尚未注册。")
        self.consume_code(normalized_email, "password_reset", code)
        with self._lock, self._connect() as connection:
            connection.execute(
                "UPDATE users SET password_hash = ?, role = ? WHERE id = ?",
                (
                    self._hash_password(new_password),
                    self.role_for_email(normalized_email, current_role=user.role),
                    user.id,
                ),
            )
        self.audit(user.id, normalized_email, "password_reset")
        return self.require_user(user.id)

    def list_users(self) -> list[AuthUserRecord]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM users
                ORDER BY
                    CASE role WHEN 'admin' THEN 0 ELSE 1 END,
                    COALESCE(last_login_at, created_at) DESC
                """
            ).fetchall()
        return [self._user_from_row(row) for row in rows]

    def update_user_role(self, user_id: str, role: UserRole, operator: AuthUserRecord) -> AuthUserRecord:
        if role not in {"user", "admin"}:
            raise AuthError("用户角色不正确。")
        target = self.require_user(user_id)
        if self.is_core_admin(target.email) and role != "admin":
            raise AuthError("核心管理员不能降级。")
        with self._lock, self._connect() as connection:
            connection.execute("UPDATE users SET role = ? WHERE id = ?", (role, target.id))
        self.audit(
            operator.id,
            operator.email,
            "user_role_updated",
            json.dumps(
                {
                    "target_user_id": target.id,
                    "target_email": target.email,
                    "role": role,
                },
                ensure_ascii=False,
            ),
        )
        return self.require_user(target.id)

    def consume_code(self, email: str, purpose: str, code: str) -> None:
        now = time.time()
        normalized_email = self.normalize_email(email)
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM email_codes
                WHERE email = ? AND purpose = ? AND consumed_at IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (normalized_email, purpose),
            ).fetchone()
            if not row or float(row["expires_at"]) < now:
                raise AuthError("验证码已过期，请重新获取。")
            if not self._verify_secret(code, str(row["code_hash"])):
                raise AuthError("验证码不正确。")
            connection.execute(
                "UPDATE email_codes SET consumed_at = ? WHERE id = ?",
                (now, row["id"]),
            )

    def get_user_by_email(self, email: str) -> AuthUserRecord | None:
        row = self._get_user_row_by_email(self.normalize_email(email))
        return self._user_from_row(row) if row else None

    def require_user(self, user_id: str) -> AuthUserRecord:
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise AuthError("登录状态已失效，请重新登录。")
        if row["disabled_at"] is not None:
            raise AuthError("账号已停用，请联系管理员。")
        role = self.role_for_email(str(row["email"]), current_role=str(row["role"]))
        if role != str(row["role"]):
            with self._lock, self._connect() as connection:
                connection.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
            row = self._get_user_row_by_email(str(row["email"]))
        return self._user_from_row(row)

    def audit(self, user_id: str | None, email: str | None, action: str, metadata: str = "{}") -> None:
        now = time.time()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO audit_logs (id, user_id, email, action, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (f"audit-{secrets.token_hex(12)}", user_id, email, action, metadata, now),
            )

    def role_for_email(self, email: str, current_role: UserRole | None = None) -> UserRole:
        return "admin" if self.is_core_admin(email) else current_role or "user"

    def is_core_admin(self, email: str) -> bool:
        return self.normalize_email(email) in self._admin_emails

    def require_allowed_email(self, email: str) -> None:
        if not email.endswith(f"@{self._allowed_domain}"):
            raise AuthError(f"仅支持 @{self._allowed_domain} 邮箱。")

    @staticmethod
    def normalize_email(email: str) -> str:
        return email.strip().lower()

    def _get_user_row_by_email(self, email: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as connection:
            return connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    @staticmethod
    def _user_from_row(row: sqlite3.Row) -> AuthUserRecord:
        return AuthUserRecord(
            id=str(row["id"]),
            email=str(row["email"]),
            name=str(row["name"]),
            role=str(row["role"]),
            email_verified_at=row["email_verified_at"],
            created_at=float(row["created_at"]),
            last_login_at=row["last_login_at"],
            disabled_at=row["disabled_at"],
        )

    @staticmethod
    def _make_code() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    @staticmethod
    def _hash_secret(secret: str) -> str:
        digest = hashlib.sha256(secret.encode("utf-8")).hexdigest()
        return f"sha256${digest}"

    @classmethod
    def _verify_secret(cls, secret: str, hashed: str) -> bool:
        return hmac.compare_digest(cls._hash_secret(secret), hashed)

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = os.urandom(16)
        iterations = 260_000
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return "pbkdf2_sha256${}${}${}".format(
            iterations,
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )

    @staticmethod
    def _verify_password(password: str, encoded: str) -> bool:
        try:
            algorithm, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(digest_b64)
            actual = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt,
                int(iterations),
            )
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

    @staticmethod
    def _validate_password(password: str) -> None:
        if len(password) < 8:
            raise AuthError("密码至少需要 8 位。")
        if len(password) > 128:
            raise AuthError("密码长度不能超过 128 位。")


def admin_emails_from_env() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def allowed_domain_from_env() -> str:
    return os.getenv("ALLOWED_EMAIL_DOMAIN", "zju.edu.cn").lower().lstrip("@")


def send_email_code(email: str, code: str, purpose: str) -> None:
    """Send an email code or log it in development mode."""

    smtp_host = os.getenv("SMTP_HOST")
    smtp_from = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
    username = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    if not smtp_host or not smtp_from or not username or not password:
        print(f"[xyfRAG auth] {purpose} code for {email}: {code}")
        return

    message = EmailMessage()
    message["Subject"] = "xyfRAG 邮箱验证码"
    message["From"] = smtp_from
    message["To"] = email
    message.set_content(f"你的 xyfRAG 验证码是：{code}\n\n验证码 10 分钟内有效，请勿转发。")

    port = int(os.getenv("SMTP_PORT", "465"))
    mode = os.getenv("SMTP_SECURITY", os.getenv("SMTP_TLS", "ssl")).lower()

    if mode in {"ssl", "smtps", "true"}:
        with smtplib.SMTP_SSL(smtp_host, port, timeout=10) as smtp:
            smtp.login(username, password)
            smtp.send_message(message)
    elif mode in {"starttls", "tls"}:
        with smtplib.SMTP(smtp_host, port, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(username, password)
            smtp.send_message(message)
    elif mode in {"none", "plain", "false"}:
        with smtplib.SMTP(smtp_host, port, timeout=10) as smtp:
            smtp.login(username, password)
            smtp.send_message(message)
    else:
        raise AuthError("SMTP_SECURITY 只能是 ssl、starttls 或 none。")


def check_smtp_settings() -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_from = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
    username = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    missing = [
        name
        for name, value in {
            "SMTP_HOST": smtp_host,
            "SMTP_USER": username,
            "SMTP_PASSWORD": password,
            "SMTP_FROM": smtp_from,
        }.items()
        if not value
    ]
    if missing:
        raise AuthError(f"SMTP 配置不完整：{', '.join(missing)}。")

    port = int(os.getenv("SMTP_PORT", "465"))
    mode = os.getenv("SMTP_SECURITY", os.getenv("SMTP_TLS", "ssl")).lower()
    if mode in {"ssl", "smtps", "true"}:
        with smtplib.SMTP_SSL(smtp_host, port, timeout=10) as smtp:
            smtp.login(username, password)
            smtp.noop()
    elif mode in {"starttls", "tls"}:
        with smtplib.SMTP(smtp_host, port, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(username, password)
            smtp.noop()
    elif mode in {"none", "plain", "false"}:
        with smtplib.SMTP(smtp_host, port, timeout=10) as smtp:
            smtp.login(username, password)
            smtp.noop()
    else:
        raise AuthError("SMTP_SECURITY 只能是 ssl、starttls 或 none。")
