@echo off
setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"
title Leadership Engine - Dev Runner

set "PROJECT_ROOT=%cd%"
set "LOG_DIR=%PROJECT_ROOT%\logs"
set "FRONTEND_LOG=%LOG_DIR%\frontend-dev.log"
set "BACKEND_LOG=%LOG_DIR%\backend-dev.log"

if not exist "%LOG_DIR%" (
    mkdir "%LOG_DIR%"
)

call :print_banner
call :ensure_directory "backend" || goto :end
call :ensure_directory "frontend" || goto :end
call :section "Toolchain Checks"
call :detect_python || goto :end
call :detect_node || goto :end
call :section "Backend Environment"
call :prepare_backend_env || goto :end
call :section "Frontend Dev Server"
call :start_frontend || goto :end
call :section "Backend API Server"
call :start_backend
set "SERVER_EXIT=%ERRORLEVEL%"
call :cleanup_servers

:end
echo.
if defined FRONTEND_LOG (
    echo 🧾 Frontend logs are being written to:
    echo     %FRONTEND_LOG%
)
if defined BACKEND_LOG (
    echo 🧾 Backend logs are mirrored to:
    echo     %BACKEND_LOG%
)
if defined SERVER_EXIT (
    if not "%SERVER_EXIT%"=="0" (
        echo ⚠️ Backend exited with code %SERVER_EXIT%
    ) else (
        echo ✅ Backend stopped cleanly.
    )
)
echo.
echo Press any key to close this window...
pause >nul
endlocal
exit /b %SERVER_EXIT%

:print_banner
echo ========================================
echo 🚀 Leadership Engine - Integrated Run
echo ========================================
echo This window will stream backend logs including:
echo    • LDAP connections
echo    • AI enablement status
echo    • Generated JQL queries per request
echo ========================================
echo.
exit /b 0

:section
echo.
echo ---------- %~1 ----------
exit /b 0

:ensure_directory
if exist %~1 (
    echo ✅ Found %~1 directory
    exit /b 0
) else (
    echo ❌ Required directory %~1 not found. Run this script from project root.
    exit /b 1
)

:detect_python
set "PYTHON_CMD="
if exist "C:\Program Files\Python312\python.exe" (
    set "PYTHON_CMD=C:\Program Files\Python312\python.exe"
) else (
    for %%I in ("python" "py -3") do (
        if not defined PYTHON_CMD (
            for /f "delims=" %%P in ('%%~I -c "import sys; print(sys.executable)" 2^>nul') do (
                set "PYTHON_CMD=%%P"
            )
        )
    )
)
if not defined PYTHON_CMD (
    echo ❌ Python 3 not found. Install Python or update run.bat.
    exit /b 1
)
echo 🐍 Using Python: %PYTHON_CMD%
"%PYTHON_CMD%" --version
exit /b 0

:detect_node
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed or not in PATH.
    exit /b 1
)
for /f "delims=" %%N in ('node --version') do set "NODE_VERSION=%%N"
echo 🟢 Node.js %NODE_VERSION%
exit /b 0

:prepare_backend_env
pushd backend >nul
if not exist venv (
    echo 🧱 Creating backend virtual environment...
    "%PYTHON_CMD%" -m venv venv || (
        echo ❌ Failed to create virtual environment.
        popd >nul
        exit /b 1
    )
    echo ✅ Virtual environment created.
)
popd >nul
exit /b 0

:start_frontend
pushd frontend >nul
if not exist node_modules (
    echo Installing frontend dependencies (npm install)...
    call npm install || (
        popd >nul
        exit /b 1
    )
)
if exist "%FRONTEND_LOG%" del "%FRONTEND_LOG%" >nul 2>&1
echo 📄 Frontend logs -> %FRONTEND_LOG%
echo    (use Notepad or VS Code to inspect compile status)
start "frontend-dev" /B cmd /c "cd /d ""%PROJECT_ROOT%\frontend"" && call npm run dev > ""%FRONTEND_LOG%"" 2>&1"
echo 🎨 Frontend is launching in the background on http://localhost:3000
popd >nul
exit /b 0

:start_backend
pushd backend >nul
call venv\Scripts\activate.bat >nul 2>&1
set PYTHONUNBUFFERED=1
if exist "%BACKEND_LOG%" del "%BACKEND_LOG%" >nul 2>&1
echo.
echo Backend URL   : http://localhost:8000
echo API Docs      : http://localhost:8000/docs
echo.
if defined BACKEND_LOG (
    echo Backend log file: %BACKEND_LOG%
)
echo 🛑 Press Ctrl+C to stop the backend when finished.
echo ========================================
python run_server.py
set "EXIT_CODE=%ERRORLEVEL%"
call venv\Scripts\deactivate.bat >nul 2>&1
popd >nul
exit /b %EXIT_CODE%

:cleanup_servers
echo.
echo 🧹 Cleaning up background servers (ports 3000 & 8000)...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%p >nul 2>&1
echo ✅ Cleanup complete.
exit /b 0
