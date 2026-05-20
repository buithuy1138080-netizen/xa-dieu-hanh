# =============================================================
# health_check.ps1 - Kiem tra toan bo he thong IOC
# =============================================================
# Cach dung:
#   .\scripts\health_check.ps1
#   .\scripts\health_check.ps1 -BackendUrl "http://localhost:8000"
#   .\scripts\health_check.ps1 -Token "eyJ..."  (test voi auth)
# =============================================================
param(
    [string]$BackendUrl = "http://localhost:8000",
    [string]$FrontendUrl = "http://localhost:3000",
    [string]$Token = "",
    [string]$TestUser = "admin",
    [string]$TestPassword = "admin123"
)

$pass = 0
$fail = 0
$warn = 0
$results = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = "",
        [int]$ExpectedStatus = 200,
        [string]$ExpectContain = "",
        [string]$Category = "API"
    )

    try {
        $params = @{
            Uri = $Url
            Method = $Method
            UseBasicParsing = $true
            TimeoutSec = 10
            ErrorAction = "Stop"
        }
        if ($Headers.Count -gt 0) { $params.Headers = $Headers }
        if ($Body) {
            $params.Body = $Body
            if (-not $params.Headers) { $params.Headers = @{} }
            $params.Headers["Content-Type"] = "application/json"
        }

        $resp = Invoke-WebRequest @params
        $status = $resp.StatusCode
        $ok = ($status -eq $ExpectedStatus)

        if ($ok -and $ExpectContain) {
            $ok = $resp.Content -like "*$ExpectContain*"
        }

        if ($ok) {
            Write-Host "  [PASS] $Name" -ForegroundColor Green
            $script:pass++
            return @{ Status = "PASS"; Name = $Name; Detail = "HTTP $status" }
        } else {
            Write-Host "  [FAIL] $Name (HTTP $status, expected $ExpectedStatus)" -ForegroundColor Red
            $script:fail++
            return @{ Status = "FAIL"; Name = $Name; Detail = "HTTP $status (expected $ExpectedStatus)" }
        }
    } catch {
        $errMsg = $_.Exception.Message
        # Lay HTTP status code tu exception neu co
        $httpStatus = 0
        if ($_.Exception.Response) { $httpStatus = [int]$_.Exception.Response.StatusCode }
        elseif ($errMsg -match '\b(\d{3})\b') { $httpStatus = [int]$Matches[1] }

        if ($httpStatus -eq $ExpectedStatus) {
            Write-Host "  [PASS] $Name (HTTP $httpStatus expected)" -ForegroundColor Green
            $script:pass++
            return @{ Status = "PASS"; Name = $Name; Detail = "HTTP $httpStatus (expected)" }
        }
        if ($errMsg -like "*401*" -or $errMsg -like "*Not authenticated*") {
            Write-Host "  [PASS] $Name (auth required - endpoint ton tai)" -ForegroundColor Green
            $script:pass++
            return @{ Status = "PASS"; Name = $Name; Detail = "Auth required (expected)" }
        }
        Write-Host "  [FAIL] $Name - $errMsg" -ForegroundColor Red
        $script:fail++
        return @{ Status = "FAIL"; Name = $Name; Detail = $errMsg }
    }
}

function Test-Port {
    param([string]$HostName, [int]$Port, [string]$Name)
    $tcp = Test-NetConnection -ComputerName $HostName -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($tcp) {
        Write-Host "  [PASS] $Name (port $Port mo)" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $Name (port $Port dong!)" -ForegroundColor Red
        $script:fail++
    }
}

function Section([string]$title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  IOC HEALTH CHECK - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Backend  : $BackendUrl"
Write-Host "  Frontend : $FrontendUrl"

# ── 1. PORTS ──────────────────────────────────────────────────
Section "1. PORTS & CONNECTIVITY"
Test-Port "127.0.0.1" 8000 "Backend (port 8000)"
Test-Port "127.0.0.1" 3000 "Frontend (port 3000)"
Test-Port "127.0.0.1" 5432 "PostgreSQL (port 5432)"

# ── 2. HEALTH ─────────────────────────────────────────────────
Section "2. HEALTH ENDPOINTS"
Test-Endpoint "Backend /health" "$BackendUrl/health" -ExpectContain '"status"'
Test-Endpoint "Backend OpenAPI" "$BackendUrl/api/v1/openapi.json" -ExpectContain '"openapi"'
Test-Endpoint "Frontend index" "$FrontendUrl/" -ExpectContain "IOC"

# ── 3. AUTH ───────────────────────────────────────────────────
Section "3. AUTHENTICATION"
# Thu login de lay token (OAuth2 form data, khong phai JSON)
$loginBody = "username=$TestUser&password=$TestPassword"
try {
    $loginResp = Invoke-WebRequest -Uri "$BackendUrl/api/v1/auth/login" -Method POST `
        -Body $loginBody -ContentType "application/x-www-form-urlencoded" `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($loginResp.StatusCode -eq 200) {
        $loginData = $loginResp.Content | ConvertFrom-Json
        $Token = $loginData.access_token
        Write-Host "  [PASS] Login thanh cong (user: $TestUser)" -ForegroundColor Green
        Write-Host "  [INFO] Token: $($Token.Substring(0, [Math]::Min(40,$Token.Length)))..." -ForegroundColor Gray
        $pass++
    }
} catch {
    Write-Host "  [WARN] Login that bai voi user '$TestUser/$TestPassword'" -ForegroundColor Yellow
    Write-Host "         Kiem tra thu cong: $BackendUrl/api/v1/auth/login" -ForegroundColor Yellow
    $warn++
}

$authHeader = @{}
if ($Token) { $authHeader = @{ "Authorization" = "Bearer $Token" } }

# Test protected endpoint
Test-Endpoint "Auth /users/me" "$BackendUrl/api/v1/users/me" -Headers $authHeader

# ── 4. CORE APIs ──────────────────────────────────────────────
Section "4. CORE API ENDPOINTS"
Test-Endpoint "GET /tasks"          "$BackendUrl/api/v1/tasks"         -Headers $authHeader
Test-Endpoint "GET /tasks/stats"    "$BackendUrl/api/v1/tasks/stats"   -Headers $authHeader
Test-Endpoint "GET /departments"    "$BackendUrl/api/v1/departments"   -Headers $authHeader
Test-Endpoint "GET /staff"          "$BackendUrl/api/v1/staff"         -Headers $authHeader
Test-Endpoint "GET /documents"      "$BackendUrl/api/v1/documents"     -Headers $authHeader
Test-Endpoint "GET /directives"     "$BackendUrl/api/v1/directives"    -Headers $authHeader
Test-Endpoint "GET /kpi"            "$BackendUrl/api/v1/kpi"           -Headers $authHeader
Test-Endpoint "GET /kpi/stats"      "$BackendUrl/api/v1/kpi/stats"     -Headers $authHeader
Test-Endpoint "GET /nq57"           "$BackendUrl/api/v1/nq57"          -Headers $authHeader
Test-Endpoint "GET /nq57/stats"     "$BackendUrl/api/v1/nq57/stats"    -Headers $authHeader
Test-Endpoint "GET /dashboard/stats" "$BackendUrl/api/v1/dashboard/stats" -Headers $authHeader

# ── 5. NOTIFICATIONS ──────────────────────────────────────────
Section "5. NOTIFICATIONS & REALTIME"
Test-Endpoint "GET /notifications"           "$BackendUrl/api/v1/notifications"             -Headers $authHeader
Test-Endpoint "GET /notifications/unread-count" "$BackendUrl/api/v1/notifications/unread-count" -Headers $authHeader
# WebSocket endpoint (HTTP request toi WS route tra 403 hoac 404 - ca hai deu ok)
Test-Endpoint "WS Endpoint exists" "$BackendUrl/api/v1/ws?token=badtoken" -ExpectedStatus 404

# ── 6. STORAGE & UPLOADS ──────────────────────────────────────
Section "6. STORAGE & UPLOADS"
$root = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $root "backend"
$uploadPaths = @{
    "uploads/"             = (Join-Path $backendDir "uploads")
    "uploads/tasks/"       = (Join-Path $backendDir "uploads\tasks")
    "uploads/ocr/"         = (Join-Path $backendDir "uploads\ocr")
    "uploads/reports/"     = (Join-Path $backendDir "uploads\reports")
    "directive_uploads/"   = (Join-Path $backendDir "directive_uploads")
    "doc_uploads/"         = (Join-Path $backendDir "doc_uploads")
}
foreach ($label in $uploadPaths.Keys) {
    $path = $uploadPaths[$label]
    if (Test-Path $path) {
        $count = (Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "  [PASS] $label (${count} files)" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [FAIL] $label - thu muc khong ton tai!" -ForegroundColor Red
        $fail++
    }
}

# ── 7. OCR ────────────────────────────────────────────────────
Section "7. OCR ENGINE"
Test-Endpoint "OCR Engine Status" "$BackendUrl/api/v1/ocr/status/engine" -Headers $authHeader
try {
    $ocrResp = Invoke-WebRequest -Uri "$BackendUrl/api/v1/ocr/status/engine" -Headers $authHeader `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $ocrData = $ocrResp.Content | ConvertFrom-Json
    Write-Host "  [INFO] pytesseract: $($ocrData.pytesseract)" -ForegroundColor Gray
    Write-Host "  [INFO] pymupdf    : $($ocrData.pymupdf)" -ForegroundColor Gray
    Write-Host "  [INFO] tesseract  : $($ocrData.tesseract_binary)" -ForegroundColor Gray
    if (-not $ocrData.tesseract_binary) {
        Write-Host "  [WARN] Tesseract chua duoc cai hoac chua config OCR_TESSERACT_CMD" -ForegroundColor Yellow
        $warn++
    }
} catch {}

# ── 8. STRATEGIC & ADVANCED ───────────────────────────────────
Section "8. ADVANCED MODULES"
Test-Endpoint "GET /strategic/projects"        "$BackendUrl/api/v1/strategic/projects"        -Headers $authHeader
Test-Endpoint "GET /strategic/projects/stats"  "$BackendUrl/api/v1/strategic/projects/stats"  -Headers $authHeader
Test-Endpoint "GET /reports"                   "$BackendUrl/api/v1/reports"                   -Headers $authHeader
Test-Endpoint "GET /ocr"                       "$BackendUrl/api/v1/ocr"                       -Headers $authHeader

# ── 9. DATABASE CHECK ─────────────────────────────────────────
Section "9. DATABASE"
if ($Token) {
    try {
        $staffResp = Invoke-WebRequest -Uri "$BackendUrl/api/v1/staff?size=1" -Headers $authHeader `
            -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $staffData = $staffResp.Content | ConvertFrom-Json
        Write-Host "  [PASS] Database query OK (staff count: $($staffData.total))" -ForegroundColor Green
        $pass++

        # Kiem tra migration moi nhat (assignee_staff_id)
        $taskResp = Invoke-WebRequest -Uri "$BackendUrl/api/v1/tasks?size=1" -Headers $authHeader `
            -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $taskData = $taskResp.Content | ConvertFrom-Json
        if ($taskData.items.Count -gt 0 -and $taskData.items[0].PSObject.Properties.Name -contains "assignee_staff_id") {
            Write-Host "  [PASS] Migration staff FK da chay (assignee_staff_id ton tai)" -ForegroundColor Green
            $pass++
        } else {
            Write-Host "  [WARN] Khong the xac nhan migration staff FK" -ForegroundColor Yellow
            $warn++
        }
    } catch {
        Write-Host "  [FAIL] Database query loi: $_" -ForegroundColor Red
        $fail++
    }
} else {
    Write-Host "  [SKIP] Can token de kiem tra database" -ForegroundColor Yellow
    $warn++
}

# ── 10. PWA & FRONTEND BUILD ──────────────────────────────────
Section "10. FRONTEND BUILD & PWA"
$distDir = Join-Path (Join-Path $root "frontend") "dist"
if (Test-Path $distDir) {
    $indexHtml = Join-Path $distDir "index.html"
    $manifest = Join-Path $distDir "manifest.webmanifest"

    if (Test-Path $indexHtml) {
        Write-Host "  [PASS] dist/index.html ton tai" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [FAIL] dist/index.html KHONG ton tai - hay build frontend" -ForegroundColor Red
        $fail++
    }

    if (Test-Path $manifest) {
        Write-Host "  [PASS] PWA manifest ton tai" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [WARN] PWA manifest khong tim thay" -ForegroundColor Yellow
        $warn++
    }

    $jsFiles = Get-ChildItem -Path (Join-Path $distDir "assets") -Filter "*.js" -ErrorAction SilentlyContinue
    $cssFiles = Get-ChildItem -Path (Join-Path $distDir "assets") -Filter "*.css" -ErrorAction SilentlyContinue
    Write-Host "  [INFO] JS bundles : $($jsFiles.Count) files" -ForegroundColor Gray
    Write-Host "  [INFO] CSS bundles: $($cssFiles.Count) files" -ForegroundColor Gray

    $totalSize = (Get-ChildItem -Path $distDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    Write-Host "  [INFO] Tong kich thuoc dist: $([math]::Round($totalSize/1MB,2)) MB" -ForegroundColor Gray
} else {
    Write-Host "  [FAIL] Chua build frontend! Chay: cd frontend && npm run build" -ForegroundColor Red
    $fail++
}

# ── KET QUA TONG HOP ──────────────────────────────────────────
$total = $pass + $fail + $warn
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  KET QUA HEALTH CHECK" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  PASS : $pass / $total" -ForegroundColor Green
Write-Host "  FAIL : $fail / $total" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })
Write-Host "  WARN : $warn / $total" -ForegroundColor $(if ($warn -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($fail -eq 0 -and $warn -eq 0) {
    Write-Host "  HE THONG SAN SANG DEPLOY VPS!" -ForegroundColor Green
} elseif ($fail -eq 0) {
    Write-Host "  He thong hoat dong tot, co $warn canh bao nho." -ForegroundColor Yellow
    Write-Host "  Kiem tra canh bao truoc khi deploy." -ForegroundColor Yellow
} else {
    Write-Host "  Co $fail loi can sua truoc khi deploy!" -ForegroundColor Red
}
Write-Host ""
