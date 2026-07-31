# Trade Alerts - Full App Startup
#   Backend  (Flask API)    -> http://localhost:5001
#   Frontend (landing + UI) -> http://localhost:8081  <-- the app opens here

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$BackendPort = 5001
$FrontendPort = 8081
$ApiUrl = "http://localhost:$BackendPort"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Starting Trade Alerts" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Free ONLY our ports so we don't touch other apps (e.g. one on 5000)
foreach ($p in @($BackendPort, $FrontendPort)) {
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Host "[1/2] Starting backend API on port $BackendPort ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; `$env:PORT=$BackendPort; & '$Python' app.py" -WindowStyle Normal

Write-Host "[2/2] Starting frontend (landing page) on port $FrontendPort ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\mobile'; `$env:EXPO_PUBLIC_API_URL='$ApiUrl'; npx expo start --web --port $FrontendPort" -WindowStyle Normal

# Poll until the frontend is actually serving, then open it (first build ~60s)
Write-Host "Waiting for the frontend to finish building (first run can take ~60s)..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        Invoke-WebRequest "http://localhost:$FrontendPort" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true; break
    } catch { Start-Sleep -Seconds 2 }
}
Start-Process "http://localhost:$FrontendPort"

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "  Trade Alerts Running" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "  APP (open this):  http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host "  Backend API:      http://localhost:$BackendPort" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
