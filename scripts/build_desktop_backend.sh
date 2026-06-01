#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "${PYTHON:-}" ]]; then
  PYTHON="$PYTHON"
elif [[ -x "$ROOT/.venv/bin/python3" ]]; then
  PYTHON="$ROOT/.venv/bin/python3"
else
  PYTHON="python3"
fi

if ! "$PYTHON" -m PyInstaller --version >/dev/null 2>&1; then
  "$PYTHON" -m pip install -r requirements-desktop-build.txt
fi

rm -rf "$ROOT/build/pyinstaller" "$ROOT/dist/xyfrag-backend" "$ROOT/web/build/backend"
mkdir -p "$ROOT/web/build/backend"

"$PYTHON" -m PyInstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name xyfrag-backend \
  --workpath "$ROOT/build/pyinstaller" \
  --specpath "$ROOT/build/pyinstaller" \
  --distpath "$ROOT/dist" \
  --paths "$ROOT" \
  --paths "$ROOT/src" \
  --add-data "$ROOT/app:app" \
  --add-data "$ROOT/config:config" \
  --add-data "$ROOT/data/raw:data/raw" \
  "$ROOT/desktop/backend_entry.py"

cp "$ROOT/dist/xyfrag-backend" "$ROOT/web/build/backend/xyfrag-backend"
chmod +x "$ROOT/web/build/backend/xyfrag-backend"
echo "Built desktop backend: $ROOT/web/build/backend/xyfrag-backend"
