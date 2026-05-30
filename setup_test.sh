#!/bin/bash
# ============================================================
# Script tự động cài hệ thống TEST song song
# Chạy trên VPS bằng lệnh:  bash setup_test.sh
# ============================================================

set -e  # Dừng ngay nếu có lỗi

REPO="https://github.com/buithuy1138080-netizen/xa-dieu-hanh.git"
DIR="/opt/xa_test"
PROJECT="xa_test"
PORT="8080"
DB_NAME="xa_test"
DB_PASS="TestIOC@$(date +%Y)!"
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

echo ""
echo "=================================================="
echo "  CÀI HỆ THỐNG TEST IOC tại $DIR (cổng $PORT)"
echo "=================================================="
echo ""

# ── 1. Clone repo ──────────────────────────────────────────
echo "[1/6] Clone repo..."
if [ -d "$DIR" ]; then
  echo "  Thư mục $DIR đã tồn tại → cập nhật code mới"
  cd "$DIR" && git pull
else
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi

# ── 2. Tạo .env.production ────────────────────────────────
echo "[2/6] Tạo .env.production..."
cat > "$DIR/.env.production" <<EOF
POSTGRES_DB=$DB_NAME
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$DB_PASS
SECRET_KEY=$SECRET
ENVIRONMENT=production
EOF
echo "  .env.production đã tạo"

# ── 3. Tạo docker-compose.test.yml ───────────────────────
echo "[3/6] Tạo docker-compose.test.yml..."
cat > "$DIR/docker-compose.test.yml" <<'EOF'
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - xa_test_db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    restart: unless-stopped
    env_file: .env.production
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - xa_test_uploads:/app/uploads

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
      args:
        VITE_API_URL: /api
    restart: unless-stopped
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
      - frontend

volumes:
  xa_test_db:
  xa_test_uploads:
EOF
echo "  docker-compose.test.yml đã tạo"

# ── 4. Build và khởi động ────────────────────────────────
echo "[4/6] Build Docker images (có thể mất 5-10 phút)..."
cd "$DIR"
docker compose -f docker-compose.test.yml -p "$PROJECT" up -d --build
echo "  Containers đã khởi động"

# ── 5. Chờ backend sẵn sàng ──────────────────────────────
echo "[5/6] Chờ backend khởi động..."
BACKEND_CONTAINER="${PROJECT}-backend-1"
for i in $(seq 1 30); do
  if docker exec "$BACKEND_CONTAINER" python3 -c "import app.main" 2>/dev/null; then
    break
  fi
  echo "  Chờ... ($i/30)"
  sleep 3
done

# ── 6. Migration + tạo admin ─────────────────────────────
echo "[6/6] Chạy migration database..."
docker exec "$BACKEND_CONTAINER" alembic upgrade head

echo "  Tạo tài khoản admin..."
docker exec "$BACKEND_CONTAINER" python3 -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash

async def go():
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        existing = (await db.execute(select(User).where(User.username == 'admin'))).scalar_one_or_none()
        if existing:
            print('Admin đã tồn tại')
            return
        db.add(User(
            username='admin',
            full_name='Quản trị viên',
            hashed_password=get_password_hash('Admin@123456'),
            role='admin',
            is_active=True,
        ))
        await db.commit()
        print('Admin tạo thành công')

asyncio.run(go())
"

# ── Kết quả ───────────────────────────────────────────────
IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo "=================================================="
echo "  ✅ CÀI ĐẶT HOÀN TẤT!"
echo "=================================================="
echo ""
echo "  🌐 Truy cập:    http://$IP:8080"
echo "  👤 Tài khoản:   admin"
echo "  🔑 Mật khẩu:    Admin@123456  (đổi ngay sau khi đăng nhập)"
echo ""
echo "  📋 Thông tin hệ thống test:"
echo "     Thư mục:     $DIR"
echo "     Database:    $DB_NAME"
echo "     DB Password: $DB_PASS"
echo "     Cổng:        $PORT"
echo ""
echo "  📌 Lệnh quản lý:"
echo "     Xem log:     docker compose -p $PROJECT logs backend --tail 30"
echo "     Dừng:        docker compose -p $PROJECT down"
echo "     Xóa hoàn toàn (kể cả dữ liệu):"
echo "                  docker compose -p $PROJECT down -v"
echo ""
echo "  ⚠️  Hệ thống production vẫn chạy bình thường tại http://xabacha.com"
echo ""
