# =============================================================
# start_prod_local.ps1 — Khoi dong LOCAL PRODUCTION TEST
# =============================================================
# Chay script nay de:
#   1. Build frontend (production)
#   2. Khoi dong backend (production mode, khong --reload)
#   3. Phuc vu frontend qua vite preview
#
# Cach dung:
#   .\scripts\start_prod_local.ps1
#   .\scripts\start_prod_local.ps1 -SkipBuild     (neu da build roi)
#   .\scripts\start_prod_local.ps1 -BackendOnly    (chi start backend)
# =============================================================
param(
    [switch]$SkipBuild = $false,
    [switch]$BackendOnly = $false,
    [switch]$FrontendOnly = $false
)

$root = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   IOC XA DIEU HANH — LOCAL PRODUCTION TEST" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Root     : $root"
Write-Host "  Backend  : $backendDir"
Write-Host "  Frontend : $frontendDir"
Write-Host "  Time     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ── Kiem tra .env.production ton tai ──────────────────────────
$prodEnv = Join-Path $backendDir ".env.production"
if (-not (Test-Path $prodEnv)) {
    Write-Host "[WARN] Khong tim thay backend\.env.production" -ForegroundColor Yellow
    Write-Host "       Dang su dung backend\.env (development)" -ForegroundColor Yellow
    $envFile = Join-Path $backendDir ".env"
} else {
    Write-Host "[OK] Dang dung production env: $prodEnv" -ForegroundColor Green
    $envFile = $prodEnv
}

# ── Tao thu muc uploads neu chua co ───────────────────────────
$uploadDirs = @(
    (Join-Path $backendDir "uploads"),
    (Join-Path $backendDir "uploads\tasks"),
    (Join-Path $backendDir "uploads\ocr"),
    (Join-Path $backendDir "uploads\reports"),
    (Join-Path $backendDir "directive_uploads"),
    (Join-Path $backendDir "doc_uploads")
)
foreach ($dir in $uploadDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "[CREATE] $dir" -ForegroundColor Gray
    }
}
Write-Host "[OK] Upload directories san sang" -ForegroundColor Green

# ── Kiem tra PostgreSQL ────────────────────────────────────────
Write-Host ""
Write-Host "[CHECK] Kiem tra PostgreSQL..." -ForegroundColor Cyan
try {
    $pgResult = Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($pgResult) {
        Write-Host "[OK] PostgreSQL dang chay tai port 5432" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Khong ket noi duoc PostgreSQL port 5432!" -ForegroundColor Red
        Write-Host "        Hay khoi dong PostgreSQL service truoc." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[WARN] Khong the kiem tra port 5432: $_" -ForegroundColor Yellow
}

# ── BUILD FRONTEND ─────────────────────────────────────────────
if (-not $BackendOnly -and -not $SkipBuild) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  STEP 1: BUILD FRONTEND (Production)" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan

    $nodeModules = Join-Path $frontendDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "[npm install] Cai dependencies..." -ForegroundColor Yellow
        Set-Location $frontendDir
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Error "npm install that bai"; exit 1 }
    }

    Set-Location $frontendDir
    Write-Host "[npm run build] Dang build..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm run build that bai"
        exit 1
    }

    $distDir = Join-Path $frontendDir "dist"
    if (Test-Path $distDir) {
        $distSize = (Get-ChildItem -Path $distDir -Recurse | Measure-Object -Property Length -Sum).Sum
        Write-Host "[OK] Build thanh cong! Dist size: $([math]::Round($distSize/1MB,2)) MB" -ForegroundColor Green
    }
} elseif ($SkipBuild) {
    Write-Host "[SKIP] Bo qua build frontend (--SkipBuild)" -ForegroundColor Yellow
    $distDir = Join-Path $frontendDir "dist"
    if (-not (Test-Path $distDir)) {
        Write-Host "[ERROR] Khong co dist/. Hay chay lai khong co -SkipBuild" -ForegroundColor Red
        exit 1
    }
}

# ── KHOI DONG BACKEND ─────────────────────────────────────────
if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  STEP 2: KHOI DONG BACKEND (Production Mode)" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan

    $uvicorn = Join-Path $backendDir ".venv\Scripts\uvicorn.exe"
    if (-not (Test-Path $uvicorn)) {
        Write-Error "Khong tim thay uvicorn tai $uvicorn"
        exit 1
    }

    Write-Host "[START] Backend: http://localhost:8000" -ForegroundColor Green
    Write-Host "        Env    : $envFile" -ForegroundColor Gray
    Write-Host "        Mode   : production (khong --reload)" -ForegroundColor Gray
    Write-Host ""

    # Dung process hien tai neu dang chay o port 8000
    $existing = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "[INFO] Dang co process dung port 8000. Dang dung..." -ForegroundColor Yellow
        $oldPid = $existing[0].OwningProcess
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    # Start backend trong cua so moi
    $backendCmd = "& '$uvicorn' app.main:app --host 0.0.0.0 --port 8000 --workers 1 --env-file '$envFile'"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; $backendCmd" -WindowStyle Normal

    # Cho backend khoi dong
    Write-Host "[WAIT] Cho backend khoi dong..." -ForegroundColor Yellow
    $maxWait = 30
    $waited = 0
    do {
        Start-Sleep -Seconds 2
        $waited += 2
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                Write-Host "[OK] Backend san sang!" -ForegroundColor Green
                break
            }
        } catch {}
        Write-Host "     Dang cho... ($waited/$maxWait s)" -ForegroundColor Gray
    } while ($waited -lt $maxWait)

    if ($waited -ge $maxWait) {
        Write-Host "[WARN] Backend chua san sang sau ${maxWait}s. Kiem tra log o cua so backend." -ForegroundColor Yellow
    }
}

# ── KHOI DONG FRONTEND PREVIEW ────────────────────────────────
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  STEP 3: PHUC VU FRONTEND (vite preview)" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan

    # Dung process hien tai neu dang chay o port 3000
    $existing3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($existing3000) {
        Write-Host "[INFO] Dang co process dung port 3000. Dang dung..." -ForegroundColor Yellow
        $oldPid3000 = $existing3000[0].OwningProcess
        Stop-Process -Id $oldPid3000 -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }

    Write-Host "[START] Frontend: http://localhost:3000" -ForegroundColor Green
    Write-Host "        Proxy  : /api -> http://localhost:8000" -ForegroundColor Gray
    Write-Host ""

    $frontendCmd = "npm run preview"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; $frontendCmd" -WindowStyle Normal
    Start-Sleep -Seconds 3
}

# ── TONG KET ──────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "   PRODUCTION TEST SAN SANG!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend  : http://localhost:3000" -ForegroundColor White
Write-Host "  Backend   : http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs  : http://localhost:8000/api/v1/openapi.json" -ForegroundColor White
Write-Host "  Health    : http://localhost:8000/health" -ForegroundColor White
Write-Host ""
Write-Host "  Chay kiem tra day du:" -ForegroundColor Cyan
Write-Host "  .\scripts\health_check.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  De backup database:" -ForegroundColor Cyan
Write-Host "  .\scripts\backup_db.ps1 -Label 'prod_test'" -ForegroundColor Cyan
Write-Host ""

Set-Location $root
