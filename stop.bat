@echo off
REM Trade Alerts - Stop Script
REM Stops all Node.js and Python processes

echo ================================
echo   Stopping Trade Alerts
echo ================================
echo.

echo Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo Stopping Python processes...
taskkill /F /IM python.exe >nul 2>&1

echo.
echo ================================
echo   Trade Alerts Stopped
echo ================================
echo.
echo All Node.js and Python processes terminated.
echo.
pause
