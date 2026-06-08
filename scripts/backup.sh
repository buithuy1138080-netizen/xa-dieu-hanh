#!/bin/bash
# =============================================================
# backup.sh — Tự động sao lưu DB + uploads (chạy trên VPS Linux)
# =============================================================
# Dùng:
#   ./scripts/backup.sh weekly     # chạy mỗi tuần
#   ./scripts/backup.sh monthly    # chạy mỗi tháng
#   ./scripts/backup.sh manual     # chạy tay
#
# Cài cron tự động:
#   ./scripts/backup.sh install-cron
# =============================================================

set -euo pipefail

# ── Cấu hình ─────────────────────────────────────────────────
BACKUP_TYPE="${1:-manual}"
PROJECT_DIR="/opt/xa_dieu_hanh"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$BACKUP_DIR/backup.log"

KEEP_WEEKLY=8    # giữ 8 bản DB tuần (~2 tháng)
KEEP_MONTHLY=6   # giữ 6 bản DB tháng (~6 tháng)
KEEP_MANUAL=5
KEEP_UPLOADS=3   # giữ 3 bản uploads (chỉ backup monthly) → tiết kiệm disk
# Tuần chỉ backup DB, tháng mới backup cả uploads

# ── Màu log ──────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERR${NC} $*" | tee -a "$LOG_FILE"; }

# ── Cài cron ─────────────────────────────────────────────────
install_cron() {
  SCRIPT_PATH="$PROJECT_DIR/scripts/backup.sh"
  chmod +x "$SCRIPT_PATH"

  # Xóa cron backup cũ nếu có
  crontab -l 2>/dev/null | grep -v "backup.sh" > /tmp/crontab_new || true

  # Thêm cron mới
  cat >> /tmp/crontab_new << EOF

# === Sao lưu tự động xa_dieu_hanh ===
# Hàng tuần: Chủ nhật 02:00 sáng
0 2 * * 0 $SCRIPT_PATH weekly >> $LOG_FILE 2>&1
# Hàng tháng: Mùng 1 mỗi tháng 01:00 sáng
0 1 1 * * $SCRIPT_PATH monthly >> $LOG_FILE 2>&1
EOF

  crontab /tmp/crontab_new
  rm /tmp/crontab_new

  echo -e "${GREEN}✅ Đã cài cron job:${NC}"
  echo "   Hàng tuần  : Chủ nhật 02:00 → $SCRIPT_PATH weekly"
  echo "   Hàng tháng : Mùng 1  01:00 → $SCRIPT_PATH monthly"
  echo ""
  echo "Xem cron hiện tại: crontab -l"
  exit 0
}

if [ "$BACKUP_TYPE" = "install-cron" ]; then
  install_cron
fi

# ── Chuẩn bị ─────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
PREFIX="${BACKUP_TYPE}_${TIMESTAMP}"

log "====== BẮT ĐẦU BACKUP [$BACKUP_TYPE] ======"

# ── Tìm container PostgreSQL ──────────────────────────────────
cd "$PROJECT_DIR"

DB_CONTAINER=$(docker compose ps -q db 2>/dev/null || docker-compose ps -q db 2>/dev/null || true)
if [ -z "$DB_CONTAINER" ]; then
  # Fallback: tìm theo tên container
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "db|postgres" | head -1 || true)
fi

if [ -z "$DB_CONTAINER" ]; then
  err "Không tìm thấy container PostgreSQL. Dừng lại."
  exit 1
fi
log "Container DB: $DB_CONTAINER"

# ── Đọc thông tin DB từ .env.production ──────────────────────
ENV_FILE="$PROJECT_DIR/.env.production"
if [ -f "$ENV_FILE" ]; then
  DB_NAME=$(grep "^POSTGRES_DB="     "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  DB_USER=$(grep "^POSTGRES_USER="   "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  DB_PASS=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
else
  DB_NAME="xa_dieu_hanh"
  DB_USER="postgres"
  DB_PASS="changeme"
  warn ".env.production không tìm thấy, dùng credentials mặc định"
fi

# ── 1. Backup Database ────────────────────────────────────────
DB_FILE="$BACKUP_DIR/db_${PREFIX}.sql.gz"
log "Đang backup database '$DB_NAME'..."

docker exec -e PGPASSWORD="$DB_PASS" "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$DB_FILE"

DB_SIZE=$(du -sh "$DB_FILE" | cut -f1)
log "✅ DB backup: db_${PREFIX}.sql.gz ($DB_SIZE)"

# ── 2. Backup Uploads (chỉ monthly & manual, không weekly) ───
if [ "$BACKUP_TYPE" != "weekly" ]; then
  UPLOADS_FILE="$BACKUP_DIR/uploads_${PREFIX}.tar.gz"
  log "Đang backup uploads..."

  UPLOAD_PATHS=()
  for p in "$PROJECT_DIR/backend/uploads" "$PROJECT_DIR/uploads"; do
    [ -d "$p" ] && UPLOAD_PATHS+=("$p")
  done

  if [ ${#UPLOAD_PATHS[@]} -eq 0 ]; then
    # Tìm từ Docker volume (backend container)
    BACKEND_CONTAINER=$(docker compose ps -q backend 2>/dev/null | head -1 || true)
    if [ -n "$BACKEND_CONTAINER" ]; then
      docker cp "${BACKEND_CONTAINER}:/app/uploads" "$BACKUP_DIR/uploads_tmp_${TIMESTAMP}" 2>/dev/null && \
        tar czf "$UPLOADS_FILE" -C "$BACKUP_DIR" "uploads_tmp_${TIMESTAMP}" 2>/dev/null && \
        rm -rf "$BACKUP_DIR/uploads_tmp_${TIMESTAMP}" && \
        log "✅ Uploads backup từ container: uploads_${PREFIX}.tar.gz ($(du -sh "$UPLOADS_FILE" | cut -f1))"
    else
      warn "Không tìm thấy container backend — bỏ qua uploads"
    fi
  else
    tar czf "$UPLOADS_FILE" "${UPLOAD_PATHS[@]}" 2>/dev/null || warn "Uploads backup có lỗi nhỏ (bỏ qua)"
    log "✅ Uploads backup: uploads_${PREFIX}.tar.gz ($(du -sh "$UPLOADS_FILE" | cut -f1))"
  fi

  # Dọn uploads cũ (chỉ giữ KEEP_UPLOADS bản)
  ls -t "$BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null | tail -n +$((KEEP_UPLOADS+1)) | while read f; do
    rm "$f" && log "  Đã xóa uploads cũ: $(basename $f)"
  done
else
  log "Weekly: bỏ qua backup uploads (tiết kiệm disk)"
fi

# ── 3. Dọn DB cũ ─────────────────────────────────────────────
case "$BACKUP_TYPE" in
  weekly)  KEEP=$KEEP_WEEKLY  ;;
  monthly) KEEP=$KEEP_MONTHLY ;;
  *)       KEEP=$KEEP_MANUAL  ;;
esac

log "Giữ lại $KEEP bản DB ${BACKUP_TYPE} gần nhất..."
ls -t "$BACKUP_DIR"/db_${BACKUP_TYPE}_*.sql.gz 2>/dev/null | tail -n +$((KEEP+1)) | while read f; do
  rm "$f" && log "  Đã xóa DB cũ: $(basename $f)"
done

# ── 4. Tổng kết ───────────────────────────────────────────────
TOTAL=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
DISK=$(du -sh "$BACKUP_DIR" | cut -f1)
log "====== HOÀN TẤT [$BACKUP_TYPE] — $TOTAL bản DB, dung lượng thư mục: $DISK ======"
