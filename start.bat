@echo off
REM Trade Alerts - Full App Startup
REM   Backend  (Flask API)     -> http://localhost:5001
REM   Frontend (landing + UI)  -> http://localhost:8081  <-- OPEN THIS
REM Backend uses port 5001 so it never collides with other apps on 5000.

set BACKEND_PORT=5001
set FRONTEND_PORT=8081
set EXPO_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%

echo ================================
echo   Starting Trade Alerts
echo ================================
echo.

REM Free ONLY our ports, leave other apps alone.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%BACKEND_PORT%" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%FRONTEND_PORT%" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

echo [1/2] Starting backend API on port %BACKEND_PORT% ...
start "Trade Alerts Backend" cmd /k "cd /d "%~dp0" && set PORT=%BACKEND_PORT% && ".venv\Scripts\python.exe" app.py"

echo [2/2] Starting frontend (landing page) on port %FRONTEND_PORT% ...
start "Trade Alerts Frontend" cmd /k "cd /d "%~dp0mobile" && set EXPO_PUBLIC_API_URL=%EXPO_PUBLIC_API_URL% && npx expo start --web --port %FRONTEND_PORT%"

echo Waiting for the frontend to finish building (first run can take ~60s)...
set /a TRIES=0
:WAITLOOP
set /a TRIES+=1
curl.exe -s -o NUL http://localhost:%FRONTEND_PORT% && goto READY
if %TRIES% GEQ 60 goto READY
timeout /t 2 /nobreak >nul
goto WAITLOOP
:READY
start "" http://localhost:%FRONTEND_PORT%

echo.
echo ================================
echo   Trade Alerts Started!
echo ================================
echo.
echo   APP (open this):  http://localhost:%FRONTEND_PORT%
echo   Backend API:      http://localhost:%BACKEND_PORT%
echo.
echo If the page is blank, wait a few seconds for the build to finish, then refresh.
echo.
pause
