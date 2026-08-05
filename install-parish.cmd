@echo off
setlocal EnableDelayedExpansion
title Ecclesia Parish PC Installer
cd /d "%~dp0"
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"

echo ============================================================
echo   ECCLESIA Parish PC Installer  (v1.0.0)
echo   One-click: clean DB, config, build, service, start.
echo ============================================================
echo.

rem ---------- 0. prerequisites ----------
where node.exe >nul 2>&1
if errorlevel 1 ( echo [ERROR] Node.js not found. Install Node.js LTS first: https://nodejs.org & pause & exit /b 1 )
where npm >nul 2>&1
if errorlevel 1 ( echo [ERROR] npm not found. & pause & exit /b 1 )

rem ---------- 1. fresh database ----------
echo [1/8] Database
set "DB=%BACKEND%\prisma\dev.db"
if exist "%DB%" (
  set /p WIPE="  An existing database was found. DELETE it and start fresh? [y/N]: "
  if /i "!WIPE!"=="y" (
    del /q "%DB%" 2>nul
    if exist "%DB%-journal" del /q "%DB%-journal"
    echo       Deleted old database.
  ) else (
    echo       Keeping existing data. NOTE: the admin password will NOT be reset.
  )
) else (
  echo       No existing database - clean install.
)

rem ---------- 2. install dependencies ----------
echo [2/8] Installing dependencies (first run only)
if not exist "%ROOT%node_modules" (
  call npm install >nul
  if errorlevel 1 ( echo [ERROR] npm install failed - check internet. & pause & exit /b 1 )
)
pushd "%BACKEND%"
if not exist "node_modules" (
  call npm install >nul
  if errorlevel 1 ( echo [ERROR] backend npm install failed - check internet. & pause & exit /b 1 )
)
popd

rem ---------- 3. JWT secret ----------
echo [3/8] Generating a strong JWT_SECRET
for /f "delims=" %%i in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do set "JWT_SECRET=%%i"
if not defined JWT_SECRET ( echo [ERROR] Could not generate JWT secret. & pause & exit /b 1 )

rem ---------- 4. configure .env ----------
echo [4/8] Configuring backend\.env
set "ENV=%BACKEND%\.env"
if not exist "%ENV%" copy /y "%BACKEND%\.env.example" "%ENV%" >nul

call :setenv NODE_ENV production
call :setenv JWT_SECRET "%JWT_SECRET%"

set "EMAIL="
set /p EMAIL="  Super admin email [maxblessngugi@ecclesia.local]: "
if not defined EMAIL set "EMAIL=maxblessngugi@ecclesia.local"
call :setenv SUPER_ADMIN_EMAIL "%EMAIL%"

echo   Use only letters and numbers in the password (no special characters).
set "PASS="
set /p PASS="  Super admin temp password [blank = random, printed once]: "
if defined PASS call :setenv SUPER_ADMIN_PASSWORD "%PASS%"

rem ---------- 5. build frontend ----------
echo [5/8] Building frontend
call npm run build >nul
if errorlevel 1 ( echo [ERROR] Frontend build failed. & pause & exit /b 1 )

rem ---------- 6. build backend + create database ----------
echo [6/8] Building backend and creating the database
pushd "%BACKEND%"
call npm run build >nul
if errorlevel 1 ( echo [ERROR] Backend build failed. & pause & exit /b 1 )
call npx prisma db push >nul
if errorlevel 1 ( echo [ERROR] Database sync failed. & pause & exit /b 1 )
call npm run db:seed > "%TEMP%\ecclesia-seed.log" 2>&1
popd
if not exist "%BACKEND%\dist\index.js" ( echo [ERROR] Backend build output missing. & pause & exit /b 1 )

rem capture the once-only admin credentials from the seed output
set "SEED_EMAIL="
set "SEED_PASS="
for /f "delims=" %%i in ('findstr /C:"Email:" "%TEMP%\ecclesia-seed.log" 2^>nul') do set "SEED_EMAIL=%%i"
for /f "delims=" %%i in ('findstr /C:"Pass:"  "%TEMP%\ecclesia-seed.log" 2^>nul') do set "SEED_PASS=%%i"
if exist "%TEMP%\ecclesia-seed.log" del /q "%TEMP%\ecclesia-seed.log"

rem ---------- 7. register auto-start service ----------
echo [7/8] Registering the app to start on boot
set "NODE_EXE="
for /f "delims=" %%i in ('where node.exe') do if not defined NODE_EXE set "NODE_EXE=%%i"

set "HAS_NSSM="
where nssm >nul 2>&1
if not errorlevel 1 set "HAS_NSSM=1"

if defined HAS_NSSM (
  echo       Using the NSSM service.
  nssm install Ecclesia "%NODE_EXE%" "%BACKEND%\dist\index.js" >nul
  if not exist "%BACKEND%\logs" mkdir "%BACKEND%\logs"
  nssm set Ecclesia AppDirectory "%BACKEND%" >nul
  nssm set Ecclesia AppStdout "%BACKEND%\logs\service.log" >nul
  nssm set Ecclesia AppStderr "%BACKEND%\logs\service.log" >nul
  nssm set Ecclesia Start SERVICE_AUTO_START >nul
  nssm start Ecclesia >nul
  set "SVC=NSSM service 'Ecclesia'"
) else (
  echo       NSSM not found - using Windows Task Scheduler instead.
  >  "%ROOT%start-parish.cmd" echo @echo off
  >> "%ROOT%start-parish.cmd" echo cd /d "%BACKEND%"
  >> "%ROOT%start-parish.cmd" echo node dist\index.js
  schtasks /create /tn "Ecclesia" /tr "\"%ROOT%start-parish.cmd\"" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul
  set "SVC=startup task 'Ecclesia'"
)

rem ---------- 8. start now ----------
echo [8/8] Starting the app
if defined HAS_NSSM (
  timeout /t 3 /nobreak >nul
) else (
  start "" cmd /c "%ROOT%start-parish.cmd"
  timeout /t 4 /nobreak >nul
)

echo.
echo ============================================================
echo   INSTALL COMPLETE
echo ============================================================
echo   App:      http://localhost:5000
echo   Email:    %EMAIL%
if defined SEED_PASS (
  echo   Password: %SEED_PASS%   ^<- WRITE THIS DOWN. Shown only once.
) else (
  echo   Password: as configured in backend\.env
)
echo   Auto-start: %SVC%
echo.
echo   First sign-in forces a password change.
echo ============================================================
start "" http://localhost:5000
echo.
pause
exit /b 0

rem ---------- helper: set-or-add a KEY="value" line in the .env ----------
:setenv
set "k=%~1"
set "v=%~2"
set "tmpf=%TEMP%\ecclesia-env.tmp"
findstr /v /b "%k%=" "%ENV%" > "%tmpf%"
echo %k%="%v%" >> "%tmpf%"
move /y "%tmpf%" "%ENV%" >nul
goto :eof
