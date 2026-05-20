# =============================================================
# restore_db.ps1 — Restore PostgreSQL database IOC
# =============================================================
# Cach dung:
#   .\scripts\restore_db.ps1 -BackupFile "backups\ioc_backup_20260518_120000.sql"
#   .\scripts\restore_db.ps1          (tu dong chon backup moi nhat)
# =============================================================
param(
    [string]$BackupFile = "",
    [string]$DbName = "xa_dieu_hanh",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "changeme",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

# --- Tim psql va pg_dump ---
function Find-PgTool([string]$toolName) {
    $found = Get-Command $toolName -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    $pgDirs = @("C:\Program Files\PostgreSQL","C:\Program Files (x86)\PostgreSQL","C:\PostgreSQL")
    foreach ($base in $pgDirs) {
        if (Test-Path $base) {
            $bins = Get-ChildItem -Path $base -Filter "${toolName}.exe" -Recurse -ErrorAction SilentlyContinue |
                    Sort-Object FullName -Descending
            if ($bins) { return $bins[0].FullName }
        }
    }
    return $null
}

$psql = Find-PgTool "psql"
if (-not $psql) { Write-Error "Khong tim thay psql.exe."; exit 1 }

# --- Chon file backup ---
if (-not $BackupFile) {
    $backupRoot = Join-Path $root "backups"
    if (-not (Test-Path $backupRoot)) {
        Write-Error "Khong co thu muc backups. Hay chay backup_db.ps1 truoc."
        exit 1
    }
    $latest = Get-ChildItem -Path $backupRoot -Filter "ioc_backup_*.sql" |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1
    if (-not $latest) {
        Write-Error "Khong tim thay file backup nao trong $backupRoot"
        exit 1
    }
    $BackupFile = $latest.FullName
    Write-Host "[Auto] Chon backup moi nhat: $($latest.Name)" -ForegroundColor Yellow
} else {
    # Resolve relative path
    if (-not [System.IO.Path]::IsPathRooted($BackupFile)) {
        $BackupFile = Join-Path $root $BackupFile
    }
}

if (-not (Test-Path $BackupFile)) {
    Write-Error "File backup khong ton tai: $BackupFile"
    exit 1
}

$fileSize = [math]::Round((Get-Item $BackupFile).Length / 1MB, 2)

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "  IOC DATABASE RESTORE" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host "  Database : $DbName"
Write-Host "  Host     : ${DbHost}:${DbPort}"
Write-Host "  File     : $BackupFile"
Write-Host "  Size     : ${fileSize} MB"
Write-Host "  Time     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""
Write-Host "  [CANH BAO] Lenh nay se XUAT DU LIEU CU trong database!" -ForegroundColor Red
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Nhap 'YES' de xac nhan restore"
    if ($confirm -ne "YES") {
        Write-Host "Da huy. Khong co gi thay doi." -ForegroundColor Yellow
        exit 0
    }
}

# --- Backup hien tai truoc khi restore ---
Write-Host ""
Write-Host "[1/3] Backup database hien tai truoc khi restore..." -ForegroundColor Cyan
$safetyScript = Join-Path $PSScriptRoot "backup_db.ps1"
if (Test-Path $safetyScript) {
    & $safetyScript -Label "truoc_restore" -DbName $DbName -DbUser $DbUser -DbPassword $DbPassword -DbHost $DbHost -DbPort $DbPort
} else {
    Write-Host "[SKIP] Khong tim thay backup_db.ps1, bo qua safety backup" -ForegroundColor Yellow
}

# --- Drop va tao lai database ---
Write-Host ""
Write-Host "[2/3] Xoa du lieu cu va tao lai database..." -ForegroundColor Cyan
$env:PGPASSWORD = $DbPassword
try {
    # Ngat tat ca connections
    $disconnectSQL = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();"
    & $psql --host $DbHost --port $DbPort --username $DbUser --dbname postgres --command $disconnectSQL 2>&1

    # Drop database (neu ton tai)
    & $psql --host $DbHost --port $DbPort --username $DbUser --dbname postgres --command "DROP DATABASE IF EXISTS $DbName;" 2>&1

    # Tao lai database
    & $psql --host $DbHost --port $DbPort --username $DbUser --dbname postgres --command "CREATE DATABASE $DbName OWNER $DbUser ENCODING 'UTF8' LC_COLLATE='en-US' LC_CTYPE='en-US' TEMPLATE template0;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Thu khong co LC_COLLATE
        & $psql --host $DbHost --port $DbPort --username $DbUser --dbname postgres --command "CREATE DATABASE $DbName OWNER $DbUser;" 2>&1
    }
} finally {}

# --- Restore tu backup file ---
Write-Host ""
Write-Host "[3/3] Restore du lieu tu backup..." -ForegroundColor Cyan
try {
    & $psql `
        --host $DbHost `
        --port $DbPort `
        --username $DbUser `
        --dbname $DbName `
        --file $BackupFile `
        --single-transaction `
        --on-error-stop 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Restore that bai voi exit code $LASTEXITCODE"
        exit 1
    }
} finally {
    $env:PGPASSWORD = ""
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  RESTORE THANH CONG!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Database $DbName da duoc restore tu:"
Write-Host "  $BackupFile"
Write-Host ""
Write-Host "  Hay khoi dong lai backend de ket noi moi:" -ForegroundColor Yellow
Write-Host "  .\scripts\start_prod_local.ps1" -ForegroundColor Yellow
