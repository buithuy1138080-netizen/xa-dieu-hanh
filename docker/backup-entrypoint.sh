#!/bin/sh
# Chạy pg_dump hàng ngày lúc 02:00, giữ 7 bản gần nhất
set -e

mkdir -p /backups

# Ghi script backup (bao gồm env vars) vào file
cat > /tmp/do-backup.sh << SCRIPT
#!/bin/sh
DATE=\$(date +%Y%m%d_%H%M%S)
DEST="/backups/ioc_backup_\${DATE}.dump"

export PGPASSWORD='${POSTGRES_PASSWORD}'

pg_dump -h db -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -Fc -f "\${DEST}" \
  && echo "\$(date '+%Y-%m-%d %H:%M:%S') [OK] \${DEST}" >> /var/log/backup.log \
  || { echo "\$(date '+%Y-%m-%d %H:%M:%S') [FAIL] pg_dump error" >> /var/log/backup.log; exit 1; }

# Xóa backup cũ hơn 7 ngày
find /backups -name "ioc_backup_*.dump" -mtime +7 -delete

# Đếm số file còn lại
COUNT=\$(ls /backups/ioc_backup_*.dump 2>/dev/null | wc -l)
echo "\$(date '+%Y-%m-%d %H:%M:%S') [INFO] Hiện có \${COUNT} bản backup" >> /var/log/backup.log
SCRIPT

chmod +x /tmp/do-backup.sh

# Lịch cron: mỗi ngày 02:00
echo "0 2 * * * /tmp/do-backup.sh" | crontab -

echo "=== Backup service started ==="
echo "    Schedule : daily at 02:00"
echo "    Retention: 7 days"
echo "    Directory: /backups"

# Chạy backup ngay khi khởi động để kiểm tra kết nối
echo "Running initial backup..."
/tmp/do-backup.sh && echo "Initial backup OK" || echo "Initial backup failed (will retry at 02:00)"

# Khởi crond (chạy foreground để container không thoát)
crond -f -l 6
