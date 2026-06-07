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
from html import escape
from pathlib import Path
from threading import RLock
import sqlite3


UserRole = str
EMAIL_CODE_TTL_SECONDS = 600
EMAIL_CODE_COOLDOWN_SECONDS = 60


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
            if latest and now - float(latest["created_at"]) < EMAIL_CODE_COOLDOWN_SECONDS:
                raise AuthError("验证码发送过于频繁，请稍后再试。")

            code = self._make_code()
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
                    now + EMAIL_CODE_TTL_SECONDS,
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
    """Send an email verification code or log it in development mode."""

    smtp_host = os.getenv("SMTP_HOST")
    smtp_from = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
    username = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    if not smtp_host or not smtp_from or not username or not password:
        print(f"[xyfRAG auth] {purpose} code for {email}: {code}")
        return

    message = build_email_code_message(email, code, purpose, smtp_from)

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


def build_email_code_message(email: str, code: str, purpose: str, sender: str) -> EmailMessage:
    """Build the xyfRAG verification email with text and HTML bodies."""

    purpose_title, purpose_action = _email_purpose_copy(purpose)
    message = EmailMessage()
    message["Subject"] = f"{code} 是你的 xyfRAG 验证码"
    message["From"] = sender
    message["To"] = email
    message.set_content(_build_email_text_body(code, purpose_title, purpose_action))
    message.add_alternative(
        _build_email_html_body(
            email=email,
            code=code,
            purpose_title=purpose_title,
            purpose_action=purpose_action,
        ),
        subtype="html",
    )
    return message


def _email_purpose_copy(purpose: str) -> tuple[str, str]:
    if purpose == "register":
        return "注册 xyfRAG 账号", "完成账号注册"
    if purpose == "password_reset":
        return "重置 xyfRAG 密码", "完成密码重置"
    if purpose == "smtp_test":
        return "验证 SMTP 配置", "确认邮件通道可用"
    return "验证邮箱", "完成邮箱验证"


def _build_email_text_body(code: str, purpose_title: str, purpose_action: str) -> str:
    return "\n".join(
        [
            "xyfRAG 邮箱验证码",
            "",
            f"用途：{purpose_title}",
            f"验证码：{code}",
            "",
            f"请在 10 分钟内使用此验证码{purpose_action}。",
            "如果不是你本人操作，可以忽略这封邮件。",
            "",
            "此邮件由系统自动发送，请勿回复。",
        ]
    )


def _build_email_html_body(email: str, code: str, purpose_title: str, purpose_action: str) -> str:
    escaped_email = escape(email)
    escaped_code = escape(code)
    escaped_purpose_title = escape(purpose_title)
    escaped_purpose_action = escape(purpose_action)
    code_digits = "".join(
        f'<span style="display:inline-block;min-width:28px">{escape(char)}</span>'
        for char in code
    )
    return f"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>xyfRAG 邮箱验证码</title>
  </head>
  <body style="margin:0;background:#f6f8fa;color:#24292f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fa;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8dee4;border-radius:14px;overflow:hidden;box-shadow:0 16px 40px rgba(27,31,36,0.08);">
            <tr>
              <td style="padding:32px 36px 22px;text-align:center;border-bottom:1px solid #d8dee4;background:#ffffff;">
                <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:50%;background:#0969da;color:#ffffff;font-size:20px;font-weight:700;text-align:center;">xR</div>
                <h1 style="margin:18px 0 0;font-size:22px;line-height:1.35;font-weight:700;color:#24292f;">邮箱验证码</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#57606a;">用于 {escaped_purpose_title}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 36px 34px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#24292f;">你好，{escaped_email}：</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#24292f;">请使用下面的验证码{escaped_purpose_action}。</p>
                <div style="margin:0 auto 22px;padding:18px 12px;border:1px solid #d8dee4;border-radius:12px;background:#f6f8fa;text-align:center;">
                  <div style="font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;line-height:1.2;font-weight:700;letter-spacing:4px;color:#0969da;">{code_digits}</div>
                </div>
                <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#57606a;">验证码将在 <strong style="color:#24292f;">10 分钟</strong> 后失效。请勿转发或泄露给他人。</p>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#57606a;">如果不是你本人操作，可以安全忽略这封邮件。</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px;background:#f6f8fa;border-top:1px solid #d8dee4;text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6e7781;">xyfRAG 自动发送，请勿回复。</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#6e7781;">验证码：<span style="font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;">{escaped_code}</span></p>
        </td>
      </tr>
    </table>
  </body>
</html>"""


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
