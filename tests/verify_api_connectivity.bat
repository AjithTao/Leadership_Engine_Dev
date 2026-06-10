@echo off
REM Quick Jira and Confluence API Connection Verification Script
REM This script tests your API connections using native Windows tools

setlocal enabledelayedexpansion

REM Colors (for PowerShell output, but we'll use basic echo for CMD)
echo.
echo ========================================
echo API Connectivity Verification Script
echo ========================================
echo.

REM Check if .env file exists
if not exist "backend\config\.env" (
    echo [ERROR] .env file not found at backend\config\.env
    exit /b 1
)

REM Load environment variables from .env
echo [INFO] Loading configuration from .env...

REM Parse .env file and set variables
for /f "tokens=1,2 delims==" %%A in (backend\config\.env) do (
    if "%%A"=="JIRA_BASE_URL" set JIRA_BASE_URL=%%B
    if "%%A"=="JIRA_SERVICE_EMAIL" set JIRA_SERVICE_EMAIL=%%B
    if "%%A"=="CONFLUENCE_BASE_URL" set CONFLUENCE_BASE_URL=%%B
    if "%%A"=="CONFLUENCE_SERVICE_EMAIL" set CONFLUENCE_SERVICE_EMAIL=%%B
    if "%%A"=="SESSION_SECRET_KEY" set SESSION_SECRET_KEY=%%B
)

REM Display loaded configuration
echo.
echo ========================================
echo CONFIGURATION LOADED
echo ========================================
echo.
echo [JIRA Configuration]
echo   Base URL: %JIRA_BASE_URL%
echo   Service Email: %JIRA_SERVICE_EMAIL%
echo   Token: [ENCRYPTED]
echo.
echo [CONFLUENCE Configuration]
echo   Base URL: %CONFLUENCE_BASE_URL%
echo   Service Email: %CONFLUENCE_SERVICE_EMAIL%
echo   Token: [ENCRYPTED]
echo.
echo [Session]
echo   Secret Key: [CONFIGURED]
echo.

REM Test network connectivity
echo ========================================
echo NETWORK CONNECTIVITY TESTS
echo ========================================
echo.

echo [TEST 1] Testing Jira Base URL: %JIRA_BASE_URL%
powershell -NoProfile -Command "try { $result = Invoke-WebRequest -Uri '%JIRA_BASE_URL%' -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Status: ' $result.StatusCode } catch { Write-Host '[FAILED] Error: ' $_.Exception.Message }"
echo.

echo [TEST 2] Testing Confluence Base URL: %CONFLUENCE_BASE_URL%
powershell -NoProfile -Command "try { $result = Invoke-WebRequest -Uri '%CONFLUENCE_BASE_URL%' -UseBasicParsing -ErrorAction Stop; Write-Host '[SUCCESS] Status: ' $result.StatusCode } catch { Write-Host '[FAILED] Error: ' $_.Exception.Message }"
echo.

REM Check port connectivity
echo [TEST 3] Testing port 443 on projects.cdk.com
powershell -NoProfile -Command "$result = Test-NetConnection -ComputerName projects.cdk.com -Port 443 -WarningAction SilentlyContinue; if ($result.TcpTestSucceeded) { Write-Host '[SUCCESS] Port 443 is open' } else { Write-Host '[FAILED] Port 443 is closed or unreachable' }"
echo.

echo [TEST 4] Testing port 443 on confluence.cdk.com
powershell -NoProfile -Command "$result = Test-NetConnection -ComputerName confluence.cdk.com -Port 443 -WarningAction SilentlyContinue; if ($result.TcpTestSucceeded) { Write-Host '[SUCCESS] Port 443 is open' } else { Write-Host '[FAILED] Port 443 is closed or unreachable' }"
echo.

REM Summary
echo ========================================
echo NEXT STEPS
echo ========================================
echo.
echo If all tests passed, run:
echo   docker-compose up -d backend
echo   docker-compose logs -f backend
echo.
echo If tests failed, check:
echo   1. VPN connection (if required)
echo   2. Firewall rules (port 443)
echo   3. Base URLs in .env file
echo   4. Network connectivity
echo.
echo For detailed API testing, use Docker:
echo   docker-compose up -d
echo.

pause
