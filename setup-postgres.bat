@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
if not exist "%PSQL%" (
    for /d %%D in ("C:\Program Files\PostgreSQL\*") do (
        if exist "%%D\bin\psql.exe" set "PSQL=%%D\bin\psql.exe"
    )
)

if not exist "%PSQL%" (
    echo [ERROR] PostgreSQL not found.
    echo Install with: winget install PostgreSQL.PostgreSQL.18
    exit /b 1
)

echo.
echo === TaskFlow PostgreSQL Setup ===
echo.
echo Creates database "taskdb" and user "taskuser" / "taskpass"
echo.

sc query postgresql-x64-18 2>nul | find "RUNNING" >nul
if errorlevel 1 (
    echo Starting PostgreSQL service...
    net start postgresql-x64-18 2>nul
)

echo Enter the PostgreSQL admin password for user "postgres":
set /p PGPASSWORD=Password: 
set "PGPASSWORD=%PGPASSWORD%"
set "PGUSER=postgres"
set "PGHOST=localhost"

echo.
echo [1/5] Creating user taskuser...
"%PSQL%" -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'taskuser') THEN CREATE ROLE taskuser WITH LOGIN PASSWORD 'taskpass'; ELSE ALTER ROLE taskuser WITH LOGIN PASSWORD 'taskpass'; END IF; END $$;"
if errorlevel 1 goto :authfail

echo [2/5] Creating database taskdb...
"%PSQL%" -tc "SELECT 1 FROM pg_database WHERE datname = 'taskdb'" | find "1" >nul
if errorlevel 1 (
    "%PSQL%" -c "CREATE DATABASE taskdb OWNER taskuser;"
    if errorlevel 1 goto :fail
) else (
    echo        Database already exists, skipping.
)

echo [3/5] Granting privileges...
"%PSQL%" -d taskdb -c "GRANT ALL ON SCHEMA public TO taskuser; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO taskuser; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO taskuser;"
if errorlevel 1 goto :fail

echo [4/5] Writing backend\.env...
(
echo DATABASE_URL=postgresql://taskuser:taskpass@localhost:5432/taskdb?schema=public
echo JWT_ACCESS_SECRET=dev-access-secret-change-in-production-32chars
echo JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production-32chars
echo JWT_ACCESS_EXPIRY=15m
echo JWT_REFRESH_EXPIRY=7d
echo PORT=3001
echo NODE_ENV=development
echo FRONTEND_URL=http://localhost:5173
echo UPLOAD_DIR=./uploads
) > "%~dp0backend\.env"

echo [5/5] Applying Prisma schema and seed data...
pushd "%~dp0backend"
if not exist node_modules call npm install
call npx prisma generate
call npx prisma db push
if errorlevel 1 (
    popd
    goto :fail
)
call npm run db:seed
popd

echo.
echo === Setup complete ===
echo.
echo   Connection: postgresql://taskuser:taskpass@localhost:5432/taskdb
echo   Run app:    run.bat
echo   Login:      lakhan@pramukhalpha.com / Admin@123
echo.
goto :eof

:authfail
echo.
echo [ERROR] Wrong password or postgres user cannot connect.
echo         Use the password you set when installing PostgreSQL 18.
exit /b 1

:fail
echo.
echo [ERROR] Setup failed. See messages above.
exit /b 1
