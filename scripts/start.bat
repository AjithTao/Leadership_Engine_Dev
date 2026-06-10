@echo off
REM Leadership Quality Tool - Windows Startup Script
REM This script ensures both frontend and backend are running properly

echo 🚀 Starting Leadership Quality Tool...
echo ==================================

REM Check if we're in the right directory
if not exist "README.md" (
    echo ❌ Error: Please run this script from the project root directory
    pause
    exit /b 1
)
if not exist "frontend" (
    echo ❌ Error: Frontend directory not found
    pause
    exit /b 1
)
if not exist "backend" (
    echo ❌ Error: Backend directory not found
    pause
    exit /b 1
)

echo 📁 Project structure verified

REM Check Python installation
set PYTHON_CMD=C:\Program Files\Python312\python.exe
"C:\Program Files\Python312\python.exe" --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check Node.js installation
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed or not in PATH
    pause
    exit /b 1
)

echo ✅ Python and Node.js are installed
echo Using Python: %PYTHON_CMD%

REM Kill any existing processes on ports 8000 and 3000
echo 🧹 Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1

REM Start Backend
echo 🔧 Starting Backend Server...
cd backend

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    "C:\Program Files\Python312\python.exe" -m venv venv
    echo Virtual environment created successfully.
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install/update dependencies
echo Installing backend dependencies...
pip install -r requirements.txt

REM Start backend in a visible window so logs are visible
echo 🚀 Starting backend server on port 8000...
echo 📋 Backend logs will appear in a separate window
start "Backend Server - Port 8000" /d "%~dp0..\backend" cmd /k "venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info --access-log"

REM Wait for backend to start
echo ⏳ Waiting for backend to start...
timeout /t 5 /nobreak >nul
:backend_check
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:8000/health' -Method Get -TimeoutSec 5 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto backend_check
)
echo ✅ Backend is running!

REM Go back to project root
cd ..

REM Start Frontend
echo 🎨 Starting Frontend Server...
cd frontend

REM Install/update dependencies
echo Installing frontend dependencies...
call npm install

REM Start frontend in a visible window so logs are visible
echo 🚀 Starting frontend server on port 3000...
echo 📋 Frontend logs will appear in a separate window
start "Frontend Server - Port 3000" /d "%~dp0..\frontend" cmd /k "npm run dev"

REM Wait for frontend to start
echo ⏳ Waiting for frontend to start...
timeout /t 10 /nobreak >nul
:frontend_check
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000' -Method Get -TimeoutSec 5 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto frontend_check
)
echo ✅ Frontend is running!

REM Go back to project root
cd ..

echo.
echo 🎉 Leadership Quality Tool is now running!
echo ==================================
echo 📱 Frontend: http://localhost:3000
echo 🔧 Backend API: http://localhost:8000
echo 📊 API Docs: http://localhost:8000/docs
echo.
echo 💡 Tips:
echo • Configure your Jira integration in the frontend
echo • Set OPENAI_API_KEY in backend/config.env for intelligent AI features
echo • Use the AI chat for leadership insights and strategic recommendations
echo • Ask about team performance, project health, and quality metrics
echo • Try natural questions like "What's Ashwin working on?" or "Compare CCM and TI projects"
echo.
echo 🛑 To stop the servers, close this window or press Ctrl+C

REM Keep script running
echo 🔄 Servers are running. Press any key to stop...
pause >nul

REM Cleanup
echo.
echo 🛑 Shutting down servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1
echo ✅ Servers stopped
pause
