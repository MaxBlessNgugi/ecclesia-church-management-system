@echo off
REM Ecclesia CMS - Open firewall ports for LAN access (run as Administrator).
REM Only the web UI (3001) and backend API (5000) are opened. Everything else stays blocked.
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator privileges...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Adding inbound allow rules for Ecclesia CMS on the LAN...
netsh advfirewall firewall delete rule name="Ecclesia Vite UI 3001" >nul 2>&1
netsh advfirewall firewall delete rule name="Ecclesia Backend API 5000" >nul 2>&1
netsh advfirewall firewall add rule name="Ecclesia Vite UI 3001" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="Ecclesia Backend API 5000" dir=in action=allow protocol=TCP localport=5000

echo.
echo Done. On another device, open:  http://192.168.100.169:3001
echo The backend listens on 0.0.0.0 (npm run dev already does this).
pause
