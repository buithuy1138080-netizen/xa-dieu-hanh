# IOC XA DIEU HANH — Local Production Test Guide

## Mục tiêu
Test hệ thống IOC trong môi trường giống production thật, trước khi deploy VPS.  
Dữ liệu test được giữ nguyên. Không reset database.

---

## Cấu trúc thư mục scripts

```
scripts/
  start_prod_local.ps1   — Build frontend + khởi động cả 2 services
  health_check.ps1       — Kiểm tra toàn bộ hệ thống (10 categories)
  backup_db.ps1          — Backup PostgreSQL database
  restore_db.ps1         — Restore PostgreSQL từ backup
  backup_uploads.ps1     — Backup toàn bộ file uploads
backups/                 — Nơi lưu backup (tự tạo)
```

---

## Bước 1: Backup trước khi test

```powershell
# Backup database (luôn làm trước mỗi lần test lớn)
.\scripts\backup_db.ps1 -Label "truoc_prod_test"

# Backup uploads (nếu có files quan trọng)
.\scripts\backup_uploads.ps1 -Label "truoc_prod_test"
```

---

## Bước 2: Chạy Production Test

### Cách nhanh nhất (1 lệnh)
```powershell
.\scripts\start_prod_local.ps1
```
Script này sẽ tự động:
1. Kiểm tra PostgreSQL đang chạy
2. Tạo các thư mục uploads nếu chưa có
3. Build frontend (`npm run build`)
4. Khởi động backend không có `--reload` (production mode)
5. Phục vụ frontend qua `vite preview`

### Nếu muốn skip build (đã build rồi)
```powershell
.\scripts\start_prod_local.ps1 -SkipBuild
```

### Chỉ khởi động backend
```powershell
.\scripts\start_prod_local.ps1 -BackendOnly
```

---

## Bước 3: Chạy Health Check

```powershell
# Kiểm tra tự động tất cả 10 categories
.\scripts\health_check.ps1

# Có token (test đầy đủ hơn)
.\scripts\health_check.ps1 -Token "eyJ..."

# Custom backend URL
.\scripts\health_check.ps1 -BackendUrl "http://localhost:8000"
```

Health check kiểm tra:
1. **Ports** — Backend (8000), Frontend (3000), PostgreSQL (5432)
2. **Health endpoints** — `/health`, OpenAPI, Frontend
3. **Authentication** — Login, `/users/me`
4. **Core APIs** — Tasks, Departments, Staff, Documents, Directives, KPI, NQ57, Dashboard
5. **Notifications** — List, unread count, WebSocket endpoint
6. **Storage** — Tất cả thư mục uploads tồn tại
7. **OCR Engine** — pytesseract, pymupdf, tesseract binary
8. **Advanced modules** — Strategic Projects, Reports, OCR
9. **Database** — Query, migration staff FK (assignee_staff_id)
10. **Frontend Build** — dist/, index.html, PWA manifest

---

## Bước 4: Kiểm tra thủ công

### 4.1 Login & Auth
- Mở http://localhost:3000
- Đăng nhập với tài khoản admin
- Kiểm tra token còn hiệu lực 8 giờ

### 4.2 Dashboard Realtime
- Mở Dashboard
- Kiểm tra charts, stats load đúng
- Kiểm tra WebSocket connection (notifications bell)
- Mở tab khác, tạo nhiệm vụ → kiểm tra notification realtime

### 4.3 Tasks Module
- Tạo task mới với "Người thực hiện" từ nhân sự
- Kiểm tra staff không có tài khoản vẫn chọn được
- Kiểm tra filter theo trạng thái
- Upload attachment

### 4.4 KPI Module
- Tạo KPI mới, chọn cán bộ phụ trách từ Staff
- Cập nhật tiến độ
- Kiểm tra chart KPI

### 4.5 NQ57 Module
- Tạo nhiệm vụ NQ57, chọn cán bộ từ Staff
- Cập nhật tiến độ

### 4.6 Documents & Directives
- Upload file PDF
- Download lại file đã upload
- Kiểm tra OCR (nếu Tesseract đã cài)

### 4.7 Responsive (Mobile)
- Mở Chrome DevTools → Mobile preview
- Test trên iPhone 14 Pro (390px)
- Test menu, forms, tables
- Test PWA install prompt

### 4.8 Notifications
- Kiểm tra badge số thông báo
- Mark as read
- Kiểm tra Zalo notification (nếu đã config)

---

## Bước 5: Backup sau test thành công

```powershell
# Backup toàn bộ trước khi deploy
.\scripts\backup_db.ps1 -Label "sau_prod_test_ok"
.\scripts\backup_uploads.ps1 -Label "sau_prod_test_ok"
```

---

## Cấu hình Production

### Backend `.env.production`
```
DATABASE_URL=postgresql+asyncpg://postgres:changeme@localhost:5432/xa_dieu_hanh
SECRET_KEY=8ca001d9e1a6129135bd2f7f1b4d58e467361990679567a54f20444a234560e8
ENVIRONMENT=production
CORS_ORIGINS=["http://localhost:3000","http://localhost:4173"]
UPLOAD_DIR=uploads
OCR_TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

### Khi deploy VPS — Cần thay đổi
| Biến | Local Test | VPS Production |
|------|-----------|----------------|
| `DATABASE_URL` | localhost:5432 | VPS DB host |
| `SECRET_KEY` | Key hiện tại | Key mới, mạnh hơn |
| `CORS_ORIGINS` | localhost:3000 | Domain thật |
| `ENVIRONMENT` | production | production |
| `UPLOAD_DIR` | uploads | /var/www/ioc/uploads |
| `OCR_TESSERACT_CMD` | Local path | /usr/bin/tesseract |

---

## Upload Backup Strategy

### Thư mục uploads hiện tại
```
backend/
  uploads/
    tasks/      — Task attachments
    ocr/        — OCR uploaded files
    reports/    — Generated report exports (.docx, .xlsx)
  directive_uploads/
    {id}/       — Directive attachments theo ID
  doc_uploads/
    {id}/       — Document files theo ID
```

### Backup strategy
- **Trước mỗi test lớn**: `backup_db.ps1` + `backup_uploads.ps1`
- **Giữ tối đa**: 10 database backups, 5 uploads backups
- **Khi deploy VPS**: Copy toàn bộ `backups/` lên VPS
- **Trên VPS**: Setup cron backup hàng ngày

### Restore khi cần
```powershell
# Restore backup mới nhất
.\scripts\restore_db.ps1

# Restore backup cụ thể
.\scripts\restore_db.ps1 -BackupFile "backups\ioc_backup_20260518_120000.sql"
```

---

## OCR Setup (Windows)

```powershell
# 1. Download Tesseract for Windows:
#    https://github.com/UB-Mannheim/tesseract/wiki
#    Chọn tesseract-ocr-w64-setup-5.x.x.exe

# 2. Cài đặt với Vietnamese language pack (vie.traineddata)

# 3. Cập nhật .env.production:
#    OCR_TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

# 4. Verify
& "C:\Program Files\Tesseract-OCR\tesseract.exe" --version
```

---

## Checklist Deploy VPS

- [ ] `backup_db.ps1` — Backup local DB
- [ ] `backup_uploads.ps1` — Backup uploads
- [ ] Health check PASS > 90%
- [ ] Login/auth hoạt động
- [ ] Task assignment với Staff hoạt động
- [ ] WebSocket/Notifications realtime hoạt động
- [ ] Upload/download files hoạt động
- [ ] Mobile responsive OK
- [ ] Cập nhật `.env` VPS (SECRET_KEY, CORS_ORIGINS, DB URL)
- [ ] Migration VPS: `alembic upgrade head`
- [ ] Copy uploads lên VPS
- [ ] Tắt `--reload` trên VPS uvicorn
- [ ] Setup nginx reverse proxy
- [ ] Setup HTTPS (Let's Encrypt)
- [ ] Setup backup cron VPS

---

## Troubleshooting

### Backend không khởi động
```powershell
# Check log trong cua so backend
# Hoặc chạy thủ công:
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --env-file .env.production
```

### Frontend không load
```powershell
# Rebuild
cd frontend
npm run build
npm run preview
```

### Database connection error
```powershell
# Kiểm tra PostgreSQL service
Get-Service -Name "postgresql*"
# Start nếu stopped
Start-Service -Name "postgresql*"
```

### CORS error trong browser
```
# Thêm port frontend vào CORS_ORIGINS trong backend/.env.production
CORS_ORIGINS=["http://localhost:3000","http://localhost:4173"]
```

### WebSocket không kết nối
```
# Kiểm tra proxy config trong vite.config.ts có ws: true
# Kiểm tra token còn hạn
# Kiểm tra console browser
```
