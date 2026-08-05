@echo off
rem Ecclesia CMS - start backend (:5000) and frontend (:3000) and open the app.
cd /d "%~dp0"
start "Ecclesia Backend" cmd /c "cd /d backend && npm run dev > ..\backend.log 2>&1"
start "Ecclesia Frontend" cmd /c "npm run dev > ..\frontend.log 2>&1"
timeout /t 8 /nobreak >nul
start "" http://localhost:3000
