"""Send a real xyfRAG verification email for SMTP validation."""

from __future__ import annotations

import argparse

from xyfrag.auth_store import AuthError, check_smtp_settings, send_email_code
from xyfrag.config import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Send a test xyfRAG email verification code.")
    parser.add_argument("email", help="Recipient email address.")
    parser.add_argument("--code", default="123456", help="Verification code to send.")
    args = parser.parse_args()

    get_settings()
    check_smtp_settings()
    send_email_code(args.email, args.code, "smtp_test")
    print(f"sent test code {args.code} to {args.email}")


if __name__ == "__main__":
    try:
        main()
    except AuthError as exc:
        raise SystemExit(str(exc)) from exc
