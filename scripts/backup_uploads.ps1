# =============================================================
# backup_uploads.ps1 — Backup toan bo thu muc uploads
# =============================================================
# Bao gom:
#   - uploads/         (tasks, ocr, reports)
#   - directive_uploads/
#   - doc_uploads/
#
# Cach dung:
#   .\scripts\backup_uploads.ps1
#   .\scripts\backup_uploads.ps1 -Label "truoc_deploy"
# =============================================================
param(
    [string]$Label = ""
)

$root = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $root "backend"
$backupRoot = Join-Path $root "backups"

if (-not (Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$suffix = if ($Label) { "_$Label" } else { "" }
$backupName = "uploads_backup_${timestamp}${suffix}"
$backupPath = Join-Path $backupRoot $backupName

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  IOC UPLOADS BACKUP" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Source  : $backendDir"
Write-Host "  Output  : $backupPath"
Write-Host "  Time    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# Danh sach thu muc can backup
$sourceDirs = @(
    @{ Path = (Join-Path $backendDir "uploads");           Name = "uploads" },
    @{ Path = (Join-Path $backendDir "directive_uploads"); Name = "directive_uploads" },
    @{ Path = (Join-Path $backendDir "doc_uploads");       Name = "doc_uploads" }
)

$totalFiles = 0
$totalBytes = 0

New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

foreach ($src in $sourceDirs) {
    if (Test-Path $src.Path) {
        $destDir = Join-Path $backupPath $src.Name
        $files = Get-ChildItem -Path $src.Path -Recurse -File -ErrorAction SilentlyContinue
        $fileCount = $files.Count
        $bytes = ($files | Measure-Object -Property Length -Sum).Sum

        Write-Host "  Copying $($src.Name): $fileCount files ($([math]::Round($bytes/1MB,2)) MB)..." -ForegroundColor Gray
        Copy-Item -Path $src.Path -Destination $destDir -Recurse -Force -ErrorAction SilentlyContinue

        $totalFiles += $fileCount
        $totalBytes += $bytes
    } else {
        Write-Host "  [SKIP] $($src.Name) — thu muc khong ton tai" -ForegroundColor Yellow
    }
}

# Tao file manifest
$manifest = @{
    backup_time = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    total_files = $totalFiles
    total_size_mb = [math]::Round($totalBytes/1MB, 2)
    label = $Label
    dirs = $sourceDirs | ForEach-Object { $_.Name }
}
$manifest | ConvertTo-Json | Out-File -FilePath (Join-Path $backupPath "MANIFEST.json") -Encoding UTF8

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  UPLOADS BACKUP THANH CONG!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Thu muc : $backupPath"
Write-Host "  Files   : $totalFiles"
Write-Host "  Size    : $([math]::Round($totalBytes/1MB,2)) MB"
Write-Host ""

# Giu toi da 5 uploads backup
$allBackups = Get-ChildItem -Path $backupRoot -Directory -Filter "uploads_backup_*" |
              Sort-Object LastWriteTime -Descending
if ($allBackups.Count -gt 5) {
    $toDelete = $allBackups | Select-Object -Skip 5
    foreach ($old in $toDelete) {
        Remove-Item $old.FullName -Recurse -Force
        Write-Host "[Xoa uploads backup cu] $($old.Name)" -ForegroundColor Yellow
    }
}
