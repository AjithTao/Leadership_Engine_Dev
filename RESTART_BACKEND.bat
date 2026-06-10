@echo off
REM Restart Backend Server Script
REM This will kill existing Python processes and restart the backend

echo.
echo ========================================
echo   BACKEND RESTART SCRIPT
echo ========================================
echo.

REM Kill existing Python processes
echo [1/3] Stopping existing backend processes...
taskkill /F /IM python.exe 2>nul
if %errorlevel% equ 0 (
    echo ✓ Python processes stopped
) else (
    echo ✗ No Python processes found (this is OK)
)

timeout /t 2 /nobreak

REM Navigate to backend directory
echo.
echo [2/3] Starting backend server...
cd /d "%~dp0backend"

REM Check if virtual environment exists
if exist venv\ (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
)

REM Start the backend
echo Starting FastAPI server...
python main.py

REM Keep window open if there's an error
if %errorlevel% neq 0 (
    echo.
    echo ✗ Backend failed to start. Check the error above.
    pause
)

