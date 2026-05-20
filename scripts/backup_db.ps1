# =============================================================
# backup_db.ps1 — Backup PostgreSQL database IOC Xa Dieu Hanh
# =============================================================
# Cách dùng:
#   .\scripts\backup_db.ps1
#   .\scripts\backup_db.ps1 -Label "truoc_deploy_vps"
# =============================================================
param(
    [string]$Label = "",
    [string]$DbName = "xa_dieu_hanh",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "changeme",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432"
)

$ErrorActionPreference = "Stop"

# --- Tìm pg_dump ---
function Find-PgDump {
    # 1. Kiểm tra PATH trước
    $found = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }

    # 2. Tìm trong PostgreSQL install dirs
    $pgDirs = @(
        "C:\Program Files\PostgreSQL",
        "C:\Program Files (x86)\PostgreSQL",
        "C:\PostgreSQL"
    )
    foreach ($base in $pgDirs) {
        if (Test-Path $base) {
            $bins = Get-ChildItem -Path $base -Filter "pg_dump.exe" -Recurse -ErrorAction SilentlyContinue |
                    Sort-Object FullName -Descending
            if ($bins) { return $bins[0].FullName }
        }
    }
    return $null
}

$pgDump = Find-PgDump
if (-not $pgDump) {
    Write-Error "Khong tim thay pg_dump.exe. Hay cai PostgreSQL hoac them vao PATH."
    exit 1
}
Write-Host "[OK] pg_dump: $pgDump" -ForegroundColor Green

# --- Tao thu muc backup ---
$backupRoot = Join-Path (Split-Path $PSScriptRoot -Parent) "backups"
if (-not (Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
}

# --- Ten file backup ---
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$suffix = if ($Label) { "_$Label" } else { "" }
$backupFile = Join-Path $backupRoot "ioc_backup_${timestamp}${suffix}.sql"
$backupFileGz = "$backupFile.gz"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  IOC DATABASE BACKUP" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Database : $DbName"
Write-Host "  Host     : ${DbHost}:${DbPort}"
Write-Host "  Output   : $backupFile"
Write-Host "  Time     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# --- Chay pg_dump ---
$env:PGPASSWORD = $DbPassword
try {
    & $pgDump `
        --host $DbHost `
        --port $DbPort `
        --username $DbUser `
        --dbname $DbName `
        --format=plain `
        --no-owner `
        --no-acl `
        --verbose `
        --file $backupFile 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Error "pg_dump that bai voi exit code $LASTEXITCODE"
        exit 1
    }
} finally {
    $env:PGPASSWORD = ""
}

# --- Kiem tra kich thuoc ---
$size = (Get-Item $backupFile).Length
$sizeKB = [math]::Round($size / 1KB, 1)
$sizeMB = [math]::Round($size / 1MB, 2)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  BACKUP THANH CONG!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  File   : $backupFile"
Write-Host "  Size   : ${sizeMB} MB (${sizeKB} KB)"
Write-Host "  Lines  : $((Get-Content $backupFile | Measure-Object -Line).Lines)"
Write-Host ""

# --- Giu toi da 10 file backup gan nhat ---
$allBackups = Get-ChildItem -Path $backupRoot -Filter "ioc_backup_*.sql" |
              Sort-Object LastWriteTime -Descending
if ($allBackups.Count -gt 10) {
    $toDelete = $allBackups | Select-Object -Skip 10
    foreach ($old in $toDelete) {
        Remove-Item $old.FullName -Force
        Write-Host "[Xoa backup cu] $($old.Name)" -ForegroundColor Yellow
    }
}

# --- Liet ke tat ca backup hien co ---
Write-Host "--- Danh sach backup hien co ---" -ForegroundColor Cyan
Get-ChildItem -Path $backupRoot -Filter "ioc_backup_*.sql" |
    Sort-Object LastWriteTime -Descending |
    Format-Table Name, @{L="Size(MB)";E={[math]::Round($_.Length/1MB,2)}}, LastWriteTime -AutoSize

Write-Host "Backup da luu tai: $backupRoot" -ForegroundColor Green
