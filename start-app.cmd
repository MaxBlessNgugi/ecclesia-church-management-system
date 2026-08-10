@echo off
rem Ecclesia CMS - launch as a native desktop app (Electron window),
rem NOT in the browser. Starts Vite + backend + Electron together.
cd /d "%~dp0"
call npm run dev
