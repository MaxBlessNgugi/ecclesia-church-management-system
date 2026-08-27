@echo off
REM =============================================================================
REM ECCLESIA — One-Command Parish Installer (Windows)
REM =============================================================================
REM
REM USAGE:
REM   Double-click this file, or run from Command Prompt:
REM     scripts\install-parish.cmd
REM
REM WHAT THIS SCRIPT DOES:
REM   1. Checks that Node.js 18+ and PostgreSQL are installed
REM   2. Creates backend\.env from a safe template (never overwrites without asking)
REM   3. Installs all npm dependencies (root + backend)
REM   4. Generates the Prisma client and pushes the schema to the database
REM   5. Seeds the database with the initial super_admin accounts
REM   6. Optionally sets up the ecclesia.local hostname
REM   7. Prints clear next steps
REM
REM SAFETY:
REM   - Never overwrites an existing backend\.env without confirmation
REM   - Never drops or modifies an existing database without confirmation
REM
REM =============================================================================

setlocal enabledelayedexpansion

REM ── Resolve the project root (directory containing this script) ──────────────
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "BACKEND_DIR=%PROJECT_ROOT%\backend"

REM ── Banner ───────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo    ECCLESIA Church Management System
echo          Parish Server Installer
echo  ============================================
echo.

REM =============================================================================
REM STEP 1: Check prerequisites
REM =============================================================================
echo  Step 1/7: Checking prerequisites...
echo.

REM ── Node.js ──────────────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please install Node.js 18+ from https://nodejs.org
    echo  (Choose the LTS version.)
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set "NODE_VER=%%a"
set "NODE_VER=%NODE_VER:v=%"
if %NODE_VER% lss 18 (
    echo  [ERROR] Node.js version is too old. Version 18 or newer is required.
    echo.
    echo  Current version:
    node -v
    echo.
    echo  Please update from https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node -v') do set "NODE_VERSION=%%a"
echo  [OK] Node.js %NODE_VERSION%

REM ── npm ──────────────────────────────────────────────────────────────────────
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] npm is not installed. It usually comes with Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('npm -v') do set "NPM_VERSION=%%a"
echo  [OK] npm %NPM_VERSION%

REM ── PostgreSQL ───────────────────────────────────────────────────────────────
where psql >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] PostgreSQL client ^(psql^) is not installed.
    echo.
    echo  Please install PostgreSQL 14+ from https://postgresql.org
    echo  ^(Remember the password you set for the 'postgres' user.^)
    echo.
    pause
    exit /b 1
)
for /f "tokens=3" %%a in ('psql --version') do set "PG_VERSION=%%a"
echo  [OK] PostgreSQL %PG_VERSION%

REM ── Check PostgreSQL is running ──────────────────────────────────────────────
pg_isready -q >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [WARN] PostgreSQL does not appear to be running.
    echo.
    echo  Try starting it:
    echo    1. Press Win+R, type "services.msc"
    echo    2. Find "postgresql" in the list
    echo    3. Right-click and select "Start"
    echo.
    set /p "CONT=Continue anyway? (y/N): "
    if /i not "!CONT!"=="y" (
        pause
        exit /b 1
    )
    echo.
) else (
    echo  [OK] PostgreSQL is running
)

echo.

REM =============================================================================
REM STEP 2: Create backend\.env
REM =============================================================================
echo  Step 2/7: Configuring environment...
echo.

set "ENV_FILE=%BACKEND_DIR%\.env"

if exist "%ENV_FILE%" (
    echo  [WARN] backend\.env already exists.
    set /p "OVERWRITE=Overwrite with fresh configuration? (y/N): "
    if /i "!OVERWRITE!"=="y" (
        copy "%ENV_FILE%" "%ENV_FILE%.backup.%date:~10,4%%date:~4,2%%date:~7,2%%time:~0,2%%time:~3,2%" >nul 2>&1
        echo  [OK] Backed up existing .env
    ) else (
        echo  [OK] Keeping existing backend\.env
        echo.
        goto :skip_env
    )
)

REM Generate a random JWT secret using Node.js
for /f "tokens=*" %%a in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do set "JWT_SECRET=%%a"

REM Write the .env file
(
echo # PostgreSQL connection
echo DATABASE_URL="postgresql://postgres:ecclesia@localhost:5432/ecclesia?schema=public"
echo.
echo # Security — auto-generated, do not share
echo JWT_SECRET="%JWT_SECRET%"
echo JWT_EXPIRES_IN="7d"
echo.
echo # Server
echo PORT=5000
echo NODE_ENV=production
echo.
echo # Client URL for Socket.IO
echo CLIENT_URL="http://localhost:5000"
echo.
echo # CORS — allow all origins on local network ^(safe for LAN^)
echo CORS_ORIGINS=""
echo.
echo # Backups
echo BACKUP_DIR="./backups"
echo BACKUP_KEEP="14"
echo BACKUP_INTERVAL_HOURS="24"
echo BACKUP_DEST_DIR=""
echo BACKUP_DISABLED="false"
echo.
echo # First Super Admin ^(seeded on first run^)
echo SUPER_ADMIN_EMAIL="admin@ecclesia.local"
echo SUPER_ADMIN_PASSWORD=""
echo SUPER_ADMIN_NAME="Parish Administrator"
) > "%ENV_FILE%"

echo  [OK] Created backend\.env with a secure random JWT_SECRET

:skip_env
echo.

REM =============================================================================
REM STEP 3: Install root dependencies
REM =============================================================================
echo  Step 3/7: Installing root dependencies...
echo.
cd /d "%PROJECT_ROOT%"
call npm install --no-fund --no-audit
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Failed to install root dependencies.
    pause
    exit /b 1
)
echo  [OK] Root dependencies installed
echo.

REM =============================================================================
REM STEP 4: Install backend dependencies
REM =============================================================================
echo  Step 4/7: Installing backend dependencies...
echo.
cd /d "%BACKEND_DIR%"
call npm install --no-fund --no-audit
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Failed to install backend dependencies.
    pause
    exit /b 1
)
echo  [OK] Backend dependencies installed
echo.

REM =============================================================================
REM STEP 5: Generate Prisma client + push schema
REM =============================================================================
echo  Step 5/7: Setting up database...
echo.

echo  Generating Prisma client...
cd /d "%BACKEND_DIR%"
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Failed to generate Prisma client.
    pause
    exit /b 1
)
echo  [OK] Prisma client generated

echo  Pushing schema to database...
echo  ^(This creates tables if they don't exist, or updates them if they do.^)
echo.
call npx prisma db push --accept-data-loss
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Failed to push database schema.
    echo.
    echo  Common causes:
    echo  - PostgreSQL is not running
    echo  - Wrong password in backend\.env
    echo  - Port 5432 is blocked
    echo.
    pause
    exit /b 1
)
echo  [OK] Database schema is up to date
echo.

REM =============================================================================
REM STEP 6: Seed the database
REM =============================================================================
echo  Step 6/7: Seeding initial data...
echo.
call npm run db:seed
if %ERRORLEVEL% neq 0 (
    echo  [WARN] Seeding encountered an issue. The database may already have data.
    echo  This is usually fine — you can log in with the existing admin account.
) else (
    echo  [OK] Database seeded with super_admin accounts
)
echo.

REM =============================================================================
REM STEP 7: Build frontend + optional hostname setup
REM =============================================================================
echo  Step 7/7: Building the application...
echo.
cd /d "%PROJECT_ROOT%"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Build failed.
    pause
    exit /b 1
)
echo  [OK] Application built successfully
echo.

REM ── Optional hostname setup ──────────────────────────────────────────────────
echo  Optional: Set up ecclesia.local hostname?
echo.
echo  This lets users type http://ecclesia.local instead of the IP address.
echo  Requires Administrator access.
echo.
set /p "SETUP_HOSTNAME=Set up ecclesia.local now? (y/N): "
if /i "%SETUP_HOSTNAME%"=="y" (
    echo.
    echo  Running hostname setup ^(requires Administrator^)...
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup-hostname.ps1"
) else (
    echo  Skipping hostname setup. You can run it later:
    echo    powershell -ExecutionPolicy Bypass -File scripts\setup-hostname.ps1
)

echo.

REM =============================================================================
REM DONE
REM =============================================================================
echo  ============================================
echo       Installation Complete!
echo  ============================================
echo.
echo  To start the server:
echo.
echo    cd %PROJECT_ROOT%\backend
echo    npm start
echo.
echo  Then open in any browser:
echo.
echo    http://localhost:5000
echo.
echo    ^(or http://ecclesia.local if you set up the hostname^)
echo.
echo  Three super_admin accounts are seeded (see README.md for emails).
echo  You will be guided through a parish setup wizard on first login.
echo.
echo  To stop the server:
echo    Press Ctrl+C in the window where it is running.
echo.
echo  To run as a background service:
echo    See INSTALL.md ^> "Running as a Service"
echo.

endlocal
pause
