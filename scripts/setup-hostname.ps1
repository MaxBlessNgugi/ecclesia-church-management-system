# =============================================================================
# ECCLESIA — Windows Server Hostname & mDNS Setup
# =============================================================================
#
# This script configures a Windows server to advertise itself as "ecclesia.local"
# on the local network using Bonjour Print Services (Apple) or mDNS.
#
# USAGE (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-hostname.ps1
#
# PREREQUISITES:
#   - Windows 10/11 or Windows Server 2016+
#   - Administrator access
#
# WHAT THIS SCRIPT DOES:
#   1. Sets the computer name to "ecclesia" (requires reboot)
#   2. Installs Bonjour Print Services for mDNS support
#   3. Configures Windows Firewall for port 5000
#   4. Updates the hosts file
#   5. Verifies the setup
#
# =============================================================================

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Error: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  ECCLESIA Server Hostname Setup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Step 1: Set the computer name
Write-Host "Step 1: Setting computer name to 'ecclesia'..." -ForegroundColor Yellow
$currentName = $env:COMPUTERNAME
if ($currentName -ne "ecclesia") {
    Write-Host "Current name: $currentName" -ForegroundColor Gray
    Write-Host "Note: Computer name change requires a reboot." -ForegroundColor Yellow
    $rename = Read-Host "Do you want to rename the computer to 'ecclesia'? (Y/N)"
    if ($rename -eq "Y" -or $rename -eq "y") {
        Rename-Computer -NewName "ecclesia" -Force
        Write-Host "✓ Computer name will be changed to 'ecclesia' after reboot" -ForegroundColor Green
        $needsReboot = $true
    }
} else {
    Write-Host "✓ Computer name is already 'ecclesia'" -ForegroundColor Green
}

# Step 2: Install Bonjour Print Services (for mDNS)
Write-Host ""
Write-Host "Step 2: Checking Bonjour Print Services..." -ForegroundColor Yellow

$bonjourPath = "C:\Program Files\Bonjour\mDNSResponder.exe"
if (Test-Path $bonjourPath) {
    Write-Host "✓ Bonjour Print Services already installed" -ForegroundColor Green
} else {
    Write-Host "Bonjour Print Services not found." -ForegroundColor Gray
    Write-Host "Please install from: https://support.apple.com/kb/DL999" -ForegroundColor Yellow
    Write-Host "Or search for 'Bonjour Print Services for Windows'" -ForegroundColor Gray
    
    $install = Read-Host "Do you want to open the download page? (Y/N)"
    if ($install -eq "Y" -or $install -eq "y") {
        Start-Process "https://support.apple.com/kb/DL999"
    }
    Write-Host "Please install Bonjour and run this script again." -ForegroundColor Yellow
}

# Step 3: Configure Windows Firewall
Write-Host ""
Write-Host "Step 3: Configuring Windows Firewall..." -ForegroundColor Yellow

$ruleName = "ECCLESIA Server (Port 5000)"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "✓ Firewall rule already exists" -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 5000 `
        -Action Allow `
        -Description "Allow inbound traffic for ECCLESIA Church Management System"
    Write-Host "✓ Firewall rule created for port 5000" -ForegroundColor Green
}

# Step 4: Update hosts file
Write-Host ""
Write-Host "Step 4: Updating hosts file..." -ForegroundColor Yellow

$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$hostsContent = Get-Content $hostsFile -Raw

if ($hostsContent -match "ecclesia") {
    Write-Host "✓ ecclesia entry already exists in hosts file" -ForegroundColor Green
} else {
    Add-Content -Path $hostsFile -Value "`n127.0.0.1    ecclesia ecclesia.local"
    Write-Host "✓ hosts file updated" -ForegroundColor Green
}

# Step 5: Verify setup
Write-Host ""
Write-Host "Step 5: Verifying setup..." -ForegroundColor Yellow
Write-Host ""

Write-Host "Computer Name: $env:COMPUTERNAME" -ForegroundColor Cyan
Write-Host "IP Address:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "Loopback*"} | Select-Object IPAddress, InterfaceAlias | Format-Table -AutoSize

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

if ($needsReboot) {
    Write-Host "IMPORTANT: You need to reboot the computer for the name change to take effect." -ForegroundColor Yellow
    Write-Host ""
    $reboot = Read-Host "Do you want to reboot now? (Y/N)"
    if ($reboot -eq "Y" -or $reboot -eq "y") {
        Restart-Computer -Force
    }
}

Write-Host "After reboot, your server will be accessible at:" -ForegroundColor Green
Write-Host "  http://ecclesia.local:5000" -ForegroundColor White
Write-Host ""
Write-Host "From other computers on the network, you can now:" -ForegroundColor Cyan
Write-Host "  1. Open a browser" -ForegroundColor White
Write-Host "  2. Go to http://ecclesia.local" -ForegroundColor White
Write-Host "  3. The ECCLESIA app should load" -ForegroundColor White
Write-Host ""
Write-Host "If ecclesia.local doesn't work, try the server's IP address:" -ForegroundColor Yellow
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "Loopback*"} | Select-Object -First 1).IPAddress
Write-Host "  http://${ipAddress}:5000" -ForegroundColor White
Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "  - Ensure port 5000 is open in Windows Firewall" -ForegroundColor White
Write-Host "  - Check if Bonjour service is running: services.msc -> Bonjour Service" -ForegroundColor White
Write-Host "  - Test mDNS: ping ecclesia.local" -ForegroundColor White
Write-Host ""
