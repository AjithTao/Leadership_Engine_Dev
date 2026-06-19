@echo off
setlocal ENABLEDELAYEDEXPANSION
title Leadership Engine Starter
cd /d "%~dp0"

set "PROJECT_ROOT=%cd%"
set "LOG_DIR=%PROJECT_ROOT%\logs"
set "FRONTEND_LOG=%LOG_DIR%\frontend-dev.log"
set "BACKEND_LOG=%LOG_DIR%\backend-dev.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.
echo 👷 Worker: Hi boss, starting the Leadership Engine shift now.
echo.

call :say "Step 1: Making sure I'm standing in the right place..."
call :ensure_path "README.md" "Okay, project root confirmed." || goto :end
call :ensure_path "frontend" "Frontend found, ready to paint the UI." || goto :end
call :ensure_path "backend" "Backend found, ready to crunch data." || goto :end

call :say "Step 2: Checking my tools..."
call :find_python || goto :end
call :find_node || goto :end
call :say "Tools look good. Python: %PYTHON_CMD%, Node: %NODE_VERSION%"

call :say "Step 3: Sweeping ports 3000 and 8000 so nothing else is running..."
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%p >nul 2>&1
call :say "Ports are clear."

call :say "Step 4: Setting up the backend workspace..."
pushd backend >nul
if errorlevel 1 (
    call :oops "Could not navigate to backend directory. Make sure you're running from project root."
    goto :end
)

REM Show current directory for debugging
call :say "Current directory: %cd%"

if not exist venv (
    call :say "No virtual env yet. Creating one..."
    "%PYTHON_CMD%" -m venv venv || (
        call :oops "Couldn't build the virtual environment."
        popd >nul
        goto :end
    )
    call :say "Virtual env ready."
)

REM Verify we're in the right place and requirements.txt exists
if not exist "requirements.txt" (
    call :oops "requirements.txt not found in backend directory."
    call :oops "Current directory: %cd%"
    call :oops "Expected: %PROJECT_ROOT%\backend\requirements.txt"
    popd >nul
    goto :end
)

call venv\Scripts\activate.bat
set PYTHONUNBUFFERED=1
set "REQ_FILE=%PROJECT_ROOT%\backend\requirements.txt"
set "HASH_FILE=%PROJECT_ROOT%\backend\venv\.req_hash"

REM -- Hash-check: only pip install when requirements.txt has changed ----------
certutil -hashfile "%REQ_FILE%" MD5 2>nul | findstr /v "CertUtil" | findstr /v "^$" > "%TEMP%\.falconx_req_hash" 2>nul
set "DO_INSTALL=1"
if exist "%HASH_FILE%" (
    fc /b "%HASH_FILE%" "%TEMP%\.falconx_req_hash" >nul 2>&1
    if not errorlevel 1 set "DO_INSTALL=0"
)
if "%DO_INSTALL%"=="1" (
    call :say "requirements.txt changed (or first run) — installing packages..."
    pip install -q -r "%REQ_FILE%" || (
        call :oops "Failed to install requirements from: %REQ_FILE%"
        call venv\Scripts\deactivate.bat >nul 2>&1
        del "%TEMP%\.falconx_req_hash" >nul 2>&1
        popd >nul
        goto :end
    )
    copy "%TEMP%\.falconx_req_hash" "%HASH_FILE%" >nul 2>&1
    call :say "Packages installed and hash saved."
) else (
    call :say "Packages already up to date — skipping install."
)
del "%TEMP%\.falconx_req_hash" >nul 2>&1
REM ---------------------------------------------------------------------------

call venv\Scripts\deactivate.bat >nul 2>&1
popd >nul
call :say "Backend workspace is good."

call :say "Step 5: Starting the frontend quietly so backend logs stay clean."
pushd frontend >nul

REM -- Hash-check: only npm install when package.json has changed --------------
set "PKG_FILE=%PROJECT_ROOT%\frontend\package.json"
set "NPM_HASH=%PROJECT_ROOT%\frontend\node_modules\.pkg_hash"
certutil -hashfile "%PKG_FILE%" MD5 2>nul | findstr /v "CertUtil" | findstr /v "^$" > "%TEMP%\.falconx_pkg_hash" 2>nul
set "DO_NPM=1"
if exist "%NPM_HASH%" (
    fc /b "%NPM_HASH%" "%TEMP%\.falconx_pkg_hash" >nul 2>&1
    if not errorlevel 1 set "DO_NPM=0"
)
if "%DO_NPM%"=="1" (
    call :say "package.json changed (or first run) — running npm install..."
    call npm install --prefer-offline
    copy "%TEMP%\.falconx_pkg_hash" "%NPM_HASH%" >nul 2>&1
) else (
    call :say "npm packages already up to date — skipping install."
)
del "%TEMP%\.falconx_pkg_hash" >nul 2>&1
REM ---------------------------------------------------------------------------

if exist "%FRONTEND_LOG%" del "%FRONTEND_LOG%" >nul 2>&1
start "frontend-dev" /B cmd /c "cd /d ""%PROJECT_ROOT%\frontend"" && set NODE_OPTIONS=--max-old-space-size=4096 && for /L %%i in (0,0,1) do (echo [%%DATE%% %%TIME%%] frontend runner start >> ""%FRONTEND_LOG%"" && call npm run dev >> ""%FRONTEND_LOG%"" 2>&1 && echo [%%DATE%% %%TIME%%] frontend exited, restarting in 2s >> ""%FRONTEND_LOG%"" && timeout /t 2 /nobreak >nul)"
call :say "Frontend is warming up on http://localhost:3000 (logs: %FRONTEND_LOG%)."
popd >nul

call :say "Step 6: Bringing the backend online with full logs."
pushd backend >nul

REM Verify we're in backend directory and run_server.py exists
if not exist "run_server.py" (
    call :oops "run_server.py not found in backend directory. Current dir: %cd%"
    popd >nul
    goto :end
)

if exist "%BACKEND_LOG%" del "%BACKEND_LOG%" >nul 2>&1
call venv\Scripts\activate.bat
set PYTHONUNBUFFERED=1
call :say "Backend starting at http://localhost:8000 (logs also in %BACKEND_LOG%)."
call :say "I'll keep talking here while writing the same story into the log file."
python run_server.py
set "BACKEND_EXIT=%ERRORLEVEL%"
call venv\Scripts\deactivate.bat >nul 2>&1
popd >nul

call :say "Backend stopped, so I'm clocking out shortly."
call :say "Cleaning leftover processes just to be safe."
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%p >nul 2>&1

echo.
echo 👷 Worker: Shift summary
echo    • Frontend log: %FRONTEND_LOG%
echo    • Backend log: %BACKEND_LOG%
echo    • Exit code : %BACKEND_EXIT%
echo.

:end
echo 👷 Worker: Press any key when you’re done reading the log above.
pause >nul
endlocal
exit /b %BACKEND_EXIT%

:say
echo 👷 %~1
exit /b 0

:oops
echo ❌ %~1
exit /b 0

:ensure_path
if exist "%~1" (
    call :say "%~2"
    exit /b 0
) else (
    call :oops "I was expecting %~1 but couldn't find it."
    exit /b 1
)

:find_python
set "PYTHON_CMD="
if exist "C:\Program Files\Python312\python.exe" set "PYTHON_CMD=C:\Program Files\Python312\python.exe"
if not defined PYTHON_CMD (
    for /f "delims=" %%P in ('python -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON_CMD=%%P"
)
if not defined PYTHON_CMD (
    for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON_CMD=%%P"
)
if not defined PYTHON_CMD (
    call :oops "Python 3 is missing. Please install it."
    exit /b 1
)
for /f "delims=" %%v in ('"%PYTHON_CMD%" --version') do set "PY_VERSION=%%v"
call :say "Python check: %PY_VERSION%"
exit /b 0

:find_node
node --version >nul 2>&1 || (
    call :oops "Node.js not found. Please install it."
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
call :say "Node check: %NODE_VERSION%"
exit /b 0
