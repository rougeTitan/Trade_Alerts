# Trade Alerts - Startup Script
# Runs Flask backend + React Native frontend

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Starting Trade Alerts" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Start Flask Backend
Write-Host "[1/2] Starting Flask backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Trade Alerts'; python app.py" -WindowStyle Normal

# Wait for backend
Start-Sleep -Seconds 3

# Start React Native Frontend
Write-Host "[2/2] Starting React Native frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Trade Alerts\mobile'; npm start" -WindowStyle Normal

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "  Trade Alerts Running" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend API:  http://127.0.0.1:5000" -ForegroundColor White
Write-Host "Dashboard:    http://localhost:8081" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
