@echo off
setlocal EnableDelayedExpansion

:: TaskFlow — start script (run from project root)
cd /d "%~dp0"

if /I "%~1"=="docker" goto :docker
if /I "%~1"=="stop" goto :stop
if /I "%~1"=="setup-db" goto :setupdb
if /I "%~1"=="help" goto :help
goto :dev

:help
echo.
echo TaskFlow run.bat
echo.
echo   run.bat            Local dev (backend + frontend)
echo   run.bat setup-db   Configure PostgreSQL + seed database
echo   run.bat docker     Start with Docker Compose
echo   run.bat stop       Stop Docker services
echo   run.bat help       Show this help
echo.
goto :eof

:setupdb
call "%~dp0setup-postgres.bat"
goto :eof

:stop
echo Stopping Docker services...
docker compose down
goto :eof

:docker
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not in PATH.
    exit /b 1
)

echo.
echo === TaskFlow (Docker) ===
echo.

echo [1/3] Building and starting containers...
docker compose up --build -d
if errorlevel 1 (
    echo [ERROR] docker compose failed.
    exit /b 1
)

echo [2/3] Waiting for database...
timeout /t 8 /nobreak >nul

echo [3/3] Seeding database (safe to re-run)...
docker compose exec -T backend npx tsx prisma/seed.ts

echo.
echo Ready!
echo   App:  http://localhost
echo   API:  http://localhost:3001/api/v1
echo.
echo Login: lakhan@pramukhalpha.com / Admin@123
echo.
start "" "http://localhost"
goto :eof

:dev
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Install Node 20+ from https://nodejs.org
    exit /b 1
)

echo.
echo === TaskFlow (Local Dev) ===
echo.

:: Backend setup
if not exist "backend\.env" (
    echo Creating backend\.env from .env.example...
    copy /Y "backend\.env.example" "backend\.env" >nul
    powershell -Command "(Get-Content 'backend\.env') -replace '@postgres:', '@localhost:' | Set-Content 'backend\.env'"
)

:: Quick DB connectivity check before starting
findstr /C:"localhost:5432" "backend\.env" >nul 2>&1
if errorlevel 1 (
    echo [WARN] backend\.env may not point to localhost. Run setup-postgres.bat first.
)

if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    pushd backend
    call npm install
    if errorlevel 1 goto :fail
    popd
)

echo Syncing database schema...
pushd backend
call npx prisma generate
call npx prisma db push
if errorlevel 1 (
    echo.
    echo [WARN] Database sync failed. Is PostgreSQL running?
    echo        Update DATABASE_URL in backend\.env if needed.
    echo        Or use: run.bat docker
    echo.
)
call npm run db:seed
popd

:: Frontend setup
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    if errorlevel 1 goto :fail
    popd
)

echo.
echo Starting backend (port 3001) and frontend (port 5173)...
echo.

start "TaskFlow Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
timeout /t 3 /nobreak >nul
start "TaskFlow Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo Ready (give servers a few seconds to start)
echo   App:  http://localhost:5173
echo   API:  http://localhost:3001/api/v1
echo.
echo Login: lakhan@pramukhalpha.com / Admin@123
echo.
start "" "http://localhost:5173"
goto :eof

:fail
echo [ERROR] Setup failed.
exit /b 1
