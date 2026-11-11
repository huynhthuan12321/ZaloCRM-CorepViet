@echo off
echo ============================================
echo  Fix git lock + Commit + Push PR-04
echo ============================================

cd /d D:\ZaloCRM-CorepViet

echo.
echo [1/4] Deleting stale index.lock...
if exist ".git\index.lock" (
    del ".git\index.lock"
    echo    OK - index.lock deleted
) else (
    echo    OK - no lock file found
)

echo.
echo [2/4] Git add all changes...
git add -A
if %ERRORLEVEL% NEQ 0 (
    echo    FAILED - git add error
    pause
    exit /b 1
)
echo    OK

echo.
echo [3/4] Git commit...
git commit -m "PR-04: Production Hardening - circuit breaker, rate limiter, health checks, Caddy, error classifier, request ID sanitization"
if %ERRORLEVEL% NEQ 0 (
    echo    FAILED or nothing to commit
    pause
    exit /b 1
)
echo    OK

echo.
echo [4/4] Git push to origin main...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo    FAILED - push error
    pause
    exit /b 1
)

echo.
echo ============================================
echo  SUCCESS! Code pushed to GitHub.
echo  Now SSH to VPS and run:
echo    cd /root/ZaloCRM-CorepViet
echo    git pull origin main
echo    docker compose build app
echo    docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
echo ============================================
pause
