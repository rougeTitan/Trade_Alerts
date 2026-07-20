@echo off
REM Trade Alerts - Unified Startup Script
REM Stops any running instances and starts fresh

echo ================================
echo   Starting Trade Alerts
echo ================================
echo.

echo Stopping any running Node.js and Python processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
echo Cleanup complete.
echo.

timeout /t 1 /nobreak >nul

echo Starting Flask Backend...
start "Trade Alerts Backend" cmd /k "cd /d "%~dp0" && python app.py"

timeout /t 2 /nobreak >nul

echo Starting React Native Frontend...
start "Trade Alerts Frontend" cmd /k "cd /d "%~dp0mobile" && npm start"

echo.
echo ================================
echo   Trade Alerts Started!
echo ================================
echo.
echo Backend:  http://127.0.0.1:5000
echo Frontend: http://localhost:8081
echo.
echo Two new windows opened for Backend and Frontend
echo Previous apps have been stopped to prevent conflicts.
echo.
pause
