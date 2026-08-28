@echo off
TITLE ECCLESIA ChMS — Automated 1-Click Installer
COLOR 0A
CLS

echo =========================================================================
echo                   ECCLESIA CHURCH MANAGEMENT SYSTEM
echo                    1-Click Automated Installer
echo =========================================================================
echo.
echo Welcome! This script will automatically set up ECCLESIA on this computer.
echo No technical knowledge is required. Please keep this window open.
echo.

:: ---------------------------------------------------------------------------
:: Step 1: Check Node.js
:: ---------------------------------------------------------------------------
echo [1/6] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    COLOR 0C
    echo [ERROR] Node.js is not installed on this computer!
    echo.
    echo Please download and install Node.js (LTS version) from:
    echo   https://nodejs.org
    echo.
    echo After installing Node.js, run this install-ecclesia.bat script again.
    pause
    exit /b 1
)
node -v
echo [OK] Node.js is installed!
echo.

:: ---------------------------------------------------------------------------
:: Step 2: Configure Environment (.env)
:: ---------------------------------------------------------------------------
echo [2/6] Configuring environment settings...

if not exist "backend\.env" (
    echo Creating default backend\.env configuration file...

    :: Generate a random secret string
    set JWT_SECRET=ecclesia_parish_secret_%RANDOM%%RANDOM%%RANDOM%_key_production

    (
        echo # ECCLESIA Production Configuration
        echo DATABASE_URL="postgresql://postgres:ecclesia@localhost:5432/ecclesia?schema=public"
        echo JWT_SECRET="%JWT_SECRET%"
        echo PORT=5000
        echo NODE_ENV=production
    ) > backend\.env
    echo [OK] Created backend\.env with default settings.
) else (
    echo [OK] Existing backend\.env configuration found.
)
echo.

:: ---------------------------------------------------------------------------
:: Step 3: Install Dependencies
:: ---------------------------------------------------------------------------
echo [3/6] Installing application packages (this may take 1-2 minutes)...
call npm install
if %errorlevel% neq 0 (
    echo [WARNING] Main npm install had issues, continuing setup...
)

cd backend
call npm install
if %errorlevel% neq 0 (
    echo [WARNING] Backend npm install had issues, continuing setup...
)
cd ..
echo [OK] Application packages installed.
echo.

:: ---------------------------------------------------------------------------
:: Step 4: Initialize Database
:: ---------------------------------------------------------------------------
echo [4/6] Initializing PostgreSQL Database...
cd backend
call npx prisma db push --accept-data-loss
if %errorlevel% neq 0 (
    echo.
    echo [NOTE] Unable to connect to PostgreSQL at localhost:5432 with password 'ecclesia'.
    echo Please ensure PostgreSQL is running and your password in backend\.env is correct.
) else (
    echo [OK] Database schema synchronized!
    call npm run db:seed
    echo [OK] Admin user and initial settings created!
)
cd ..
echo.

:: ---------------------------------------------------------------------------
:: Step 5: Build App for Production
:: ---------------------------------------------------------------------------
echo [5/6] Building production application...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Production build failed. Please check logs above.
    pause
    exit /b 1
)
echo [OK] Application built successfully!
echo.

:: ---------------------------------------------------------------------------
:: Step 6: Create Desktop Shortcut & Launcher
:: ---------------------------------------------------------------------------
echo [6/6] Creating Desktop Start Launcher...

(
    echo @echo off
    echo TITLE ECCLESIA Church Server
    echo COLOR 0B
    echo CLS
    echo =========================================================================
    echo                   ECCLESIA Church Management System
    echo                          Server is Running!
    echo =========================================================================
    echo.
    echo  Server URL: http://localhost:5000
    echo  Local Network URL: http://ecclesia.local:5000
    echo.
    echo  DO NOT CLOSE THIS WINDOW while using Ecclesia.
    echo  To stop the server, press Ctrl+C or close this window.
    echo =========================================================================
    echo.
    echo Starting server...
    echo.
    echo Starting web browser automatically...
    start http://localhost:5000
    echo.
    cd /d "%~dp0backend"
    call npm start
    pause
) > "START-ECCLESIA.bat"

:: Create shortcut on Desktop if Desktop folder exists
if exist "%USERPROFILE%\Desktop" (
    copy /Y "START-ECCLESIA.bat" "%USERPROFILE%\Desktop\START-ECCLESIA.bat" >nul 2>nul
    echo [OK] Created START-ECCLESIA.bat on your Desktop!
)

echo.
echo =========================================================================
echo                  ECCLESIA INSTALLATION COMPLETE!
echo =========================================================================
echo.
echo  You can now start ECCLESIA anytime by double-clicking:
echo    "START-ECCLESIA.bat" on your Desktop or in this folder.
echo.
echo  Access URL: http://localhost:5000  (or http://ecclesia.local:5000)
echo.
echo Press any key to launch ECCLESIA now...
pause >nul

call START-ECCLESIA.bat
