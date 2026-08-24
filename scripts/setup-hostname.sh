#!/bin/bash
# =============================================================================
# ECCLESIA — Linux Server Hostname & mDNS Setup
# =============================================================================
#
# This script configures a Linux server to advertise itself as "ecclesia.local"
# on the local network using Avahi (mDNS/Bonjour).
#
# USAGE:
#   sudo bash scripts/setup-hostname.sh
#
# PREREQUISITES:
#   - Ubuntu/Debian-based Linux (tested on Ubuntu 20.04+)
#   - Root/sudo access
#
# WHAT THIS SCRIPT DOES:
#   1. Sets the system hostname to "ecclesia"
#   2. Installs and configures Avahi daemon for mDNS
#   3. Creates an Avahi service file for the Ecclesia web app
#   4. Updates /etc/hosts for local resolution
#   5. Verifies the setup
#
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ECCLESIA Server Hostname Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
  exit 1
fi

# Step 1: Set the hostname
echo -e "${YELLOW}Step 1: Setting hostname to 'ecclesia'...${NC}"
hostnamectl set-hostname ecclesia
echo -e "${GREEN}✓ Hostname set to: $(hostname)${NC}"

# Step 2: Update /etc/hosts
echo -e "${YELLOW}Step 2: Updating /etc/hosts...${NC}"

# Remove any existing ecclesia entries
sed -i '/ecclesia/d' /etc/hosts

# Add ecclesia.local and ecclesia entries
echo "127.0.1.1    ecclesia ecclesia.local" >> /etc/hosts
echo -e "${GREEN}✓ /etc/hosts updated${NC}"

# Step 3: Install Avahi daemon
echo -e "${YELLOW}Step 3: Installing Avahi daemon...${NC}"

if ! command -v avahi-daemon &> /dev/null; then
    apt-get update
    apt-get install -y avahi-daemon avahi-utils
    echo -e "${GREEN}✓ Avahi installed${NC}"
else
    echo -e "${GREEN}✓ Avahi already installed${NC}"
fi

# Step 4: Configure Avahi hostname
echo -e "${YELLOW}Step 4: Configuring Avahi...${NC}"

# Backup original avahi-daemon.conf
if [ ! -f /etc/avahi/avahi-daemon.conf.bak ]; then
    cp /etc/avahi/avahi-daemon.conf /etc/avahi/avahi-daemon.conf.bak
fi

# Update avahi-daemon.conf
cat > /etc/avahi/avahi-daemon.conf << 'EOF'
# Avahi Daemon Configuration for ECCLESIA
[server]
hostname=ecclesia
domain-name=local
use-ipv4=yes
use-ipv6=yes
allow-interfaces=eth0,wlan0
publish-workstation=no

[publish]
publish-hinfo=no
publish-workstation=no
publish-addresses=yes

[reflector]
enable-reflector=no

[rlimits]
rlimit-nproc=3
rlimit-nofile=768
EOF

echo -e "${GREEN}✓ Avahi configuration updated${NC}"

# Step 5: Create Avahi service file for Ecclesia
echo -e "${YELLOW}Step 5: Creating Avahi service for Ecclesia...${NC}"

mkdir -p /etc/avahi/services

cat > /etc/avahi/services/ecclesia.service << 'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<!--
  This file defines the mDNS service advertisement for ECCLESIA Church Management System.
  It makes the server discoverable as ecclesia.local on the local network.
-->
<service-group>
  <name replace-wildcards="yes">Ecclesia Church Management - %h</name>
  <service>
    <type>_http._tcp</type>
    <port>5000</port>
    <txt-record>path=/</txt-record>
    <txt-record>description=ECCLESIA Church Management System</txt-record>
  </service>
</service-group>
EOF

echo -e "${GREEN}✓ Avahi service file created${NC}"

# Step 6: Restart Avahi
echo -e "${YELLOW}Step 6: Restarting Avahi daemon...${NC}"
systemctl restart avahi-daemon
systemctl enable avahi-daemon
echo -e "${GREEN}✓ Avahi daemon restarted and enabled${NC}"

# Step 7: Verify setup
echo -e "${YELLOW}Step 7: Verifying setup...${NC}"
echo ""

echo "Hostname: $(hostname)"
echo "Avahi status:"
systemctl is-active avahi-daemon

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your server is now accessible at:"
echo "  http://ecclesia.local:5000"
echo ""
echo "From other computers on the network, you can now:"
echo "  1. Open a browser"
echo "  2. Go to http://ecclesia.local"
echo "  3. The ECCLESIA app should load"
echo ""
echo "If ecclesia.local doesn't work, try the server's IP address:"
IP_ADDR=$(hostname -I | awk '{print $1}')
echo "  http://${IP_ADDR}:5000"
echo ""
echo "Troubleshooting:"
echo "  - Ensure port 5000 is open in the firewall"
echo "  - Check if Avahi is running: systemctl status avahi-daemon"
echo "  - Test mDNS resolution: avahi-resolve -n ecclesia.local"
echo ""
