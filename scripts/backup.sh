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

KEEP_WEEKLY=8    # giữ 8 bản tuần (~2 tháng)
KEEP_MONTHLY=12  # giữ 12 bản tháng (~1 năm)
KEEP_MANUAL=5

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

# ── 2. Backup Uploads ─────────────────────────────────────────
UPLOADS_FILE="$BACKUP_DIR/uploads_${PREFIX}.tar.gz"
log "Đang backup uploads..."

# Tìm volume uploads — thử nhiều vị trí
UPLOAD_PATHS=()
for p in "$PROJECT_DIR/backend/uploads" "$PROJECT_DIR/uploads"; do
  [ -d "$p" ] && UPLOAD_PATHS+=("$p")
done

# Lấy từ Docker volume nếu không tìm thấy folder
if [ ${#UPLOAD_PATHS[@]} -eq 0 ]; then
  VOLUME_NAME=$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{.Name}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -i upload | head -1 || true)
  if [ -n "$VOLUME_NAME" ]; then
    docker run --rm -v "${VOLUME_NAME}:/data" -v "$BACKUP_DIR:/backup" alpine \
      tar czf "/backup/uploads_${PREFIX}.tar.gz" /data 2>/dev/null && \
      log "✅ Uploads backup từ Docker volume: uploads_${PREFIX}.tar.gz"
  else
    warn "Không tìm thấy thư mục uploads — bỏ qua bước này"
  fi
else
  tar czf "$UPLOADS_FILE" "${UPLOAD_PATHS[@]}" 2>/dev/null || warn "Uploads backup có lỗi nhỏ (bỏ qua)"
  UP_SIZE=$(du -sh "$UPLOADS_FILE" | cut -f1)
  log "✅ Uploads backup: uploads_${PREFIX}.tar.gz ($UP_SIZE)"
fi

# ── 3. Dọn bản cũ ────────────────────────────────────────────
case "$BACKUP_TYPE" in
  weekly)  KEEP=$KEEP_WEEKLY  ;;
  monthly) KEEP=$KEEP_MONTHLY ;;
  *)       KEEP=$KEEP_MANUAL  ;;
esac

log "Giữ lại $KEEP bản ${BACKUP_TYPE} gần nhất..."

# Xóa DB cũ
ls -t "$BACKUP_DIR"/db_${BACKUP_TYPE}_*.sql.gz 2>/dev/null | tail -n +$((KEEP+1)) | while read f; do
  rm "$f" && log "  Đã xóa cũ: $(basename $f)"
done

# Xóa uploads cũ
ls -t "$BACKUP_DIR"/uploads_${BACKUP_TYPE}_*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | while read f; do
  rm "$f" && log "  Đã xóa cũ: $(basename $f)"
done

# ── 4. Tổng kết ───────────────────────────────────────────────
TOTAL=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
DISK=$(du -sh "$BACKUP_DIR" | cut -f1)
log "====== HOÀN TẤT [$BACKUP_TYPE] — $TOTAL bản DB, dung lượng thư mục: $DISK ======"
