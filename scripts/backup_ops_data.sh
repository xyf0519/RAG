#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${XYFRAG_DATA_DIR:-/opt/xyfrag/data}"
MODELS_DIR="${XYFRAG_MODELS_DIR:-/opt/xyfrag/models}"
BACKUP_DIR="${XYFRAG_BACKUPS_DIR:-/opt/xyfrag/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/xyfrag-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"
tar -czf "${TARGET}" \
  -C "$(dirname "${DATA_DIR}")" "$(basename "${DATA_DIR}")" \
  -C "$(dirname "${MODELS_DIR}")" "$(basename "${MODELS_DIR}")"

echo "Created ${TARGET}"
