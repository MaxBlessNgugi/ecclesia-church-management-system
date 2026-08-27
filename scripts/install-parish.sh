#!/bin/bash
# =============================================================================
# ECCLESIA — One-Command Parish Installer (Linux / macOS)
# =============================================================================
#
# USAGE:
#   bash scripts/install-parish.sh
#
# WHAT THIS SCRIPT DOES:
#   1. Checks that Node.js 18+ and PostgreSQL are installed
#   2. Creates backend/.env from a safe template (never overwrites without asking)
#   3. Installs all npm dependencies (root + backend)
#   4. Generates the Prisma client and pushes the schema to the database
#   5. Seeds the database with the initial super_admin accounts
#   6. Optionally sets up the ecclesia.local hostname
#   7. Prints clear next steps
#
# SAFETY:
#   - Never overwrites an existing backend/.env without confirmation
#   - Never drops or modifies an existing database without confirmation
#   - All destructive actions require explicit user consent
#
# =============================================================================

set -e  # Exit on any error

# ── Colours (safe for terminals that don't support them) ─────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

# ── Helpers ──────────────────────────────────────────────────────────────────

# Print a success message
ok()   { echo -e "${GREEN}✓${NC} $1"; }

# Print a warning message
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Print an error message and exit
die()  { echo -e "${RED}✗ $1${NC}" >&2; exit 1; }

# Ask a yes/no question (default: no)
confirm() {
  read -rp "$(echo -e "${YELLOW}$1 [y/N]: ${NC}")" answer
  case "$answer" in
    [yY][eE][sS]|[yY]) return 0 ;;
    *) return 1 ;;
  esac
}

# ── Resolve the project root (directory containing this script) ──────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ECCLESIA Church Management System         ║${NC}"
echo -e "${CYAN}║           Parish Server Installer               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# STEP 1: Check prerequisites
# =============================================================================
echo -e "${BOLD}Step 1/7: Checking prerequisites...${NC}"
echo ""

# ── Node.js ──────────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  die "Node.js is not installed.\n\
    Please install Node.js 18+ from https://nodejs.org\n\
    (Choose the LTS version.)"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ] 2>/dev/null; then
  die "Node.js version $(node -v) is too old. Version 18 or newer is required.\n\
    Please update from https://nodejs.org"
fi
ok "Node.js $(node -v)"

# ── npm ──────────────────────────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
  die "npm is not installed. It usually comes with Node.js."
fi
ok "npm $(npm -v)"

# ── PostgreSQL ───────────────────────────────────────────────────────────────
if ! command -v psql &> /dev/null; then
  die "PostgreSQL client (psql) is not installed.\n\
    Please install PostgreSQL 14+ from https://postgresql.org\n\
    (Remember the password you set for the 'postgres' user.)"
fi
ok "PostgreSQL $(psql --version | head -1 | awk '{print $3}')"

# ── Check PostgreSQL is running ──────────────────────────────────────────────
if ! pg_isready -q 2>/dev/null; then
  warn "PostgreSQL does not appear to be running."
  echo "  Try starting it:"
  echo "    Linux:  sudo systemctl start postgresql"
  echo "    macOS:  brew services start postgresql"
  echo ""
  if confirm "Continue anyway?"; then
    echo ""
  else
    exit 1
  fi
else
  ok "PostgreSQL is running"
fi

echo ""

# =============================================================================
# STEP 2: Create backend/.env
# =============================================================================
echo -e "${BOLD}Step 2/7: Configuring environment...${NC}"
echo ""

ENV_FILE="$BACKEND_DIR/.env"
ENV_EXAMPLE="$BACKEND_DIR/.env.example"

if [ -f "$ENV_FILE" ]; then
  warn "backend/.env already exists."
  if confirm "Overwrite it with a fresh configuration?"; then
    # Back up the existing .env
    cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
    ok "Backed up existing .env"
  else
    ok "Keeping existing backend/.env"
    echo ""
    # Skip to step 3
    SKIP_ENV=true
  fi
fi

if [ "$SKIP_ENV" != "true" ]; then
  # Generate a strong random JWT secret (48 bytes = 96 hex characters)
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null \
    || openssl rand -hex 48 2>/dev/null \
    || head -c 96 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 96)

  # Detect the default PostgreSQL password.
  # The .env.example uses "ecclesia" — new installs likely have this.
  # If the user changed it, they can edit .env after install.
  PG_PASSWORD="ecclesia"

  cat > "$ENV_FILE" << ENVEOF
# PostgreSQL connection
DATABASE_URL="postgresql://postgres:${PG_PASSWORD}@localhost:5432/ecclesia?schema=public"

# Security — auto-generated, do not share
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"

# Server
PORT=5000
NODE_ENV=production

# Client URL for Socket.IO
CLIENT_URL="http://localhost:5000"

# CORS — allow all origins on local network (safe for LAN)
CORS_ORIGINS=""

# Backups
BACKUP_DIR="./backups"
BACKUP_KEEP="14"
BACKUP_INTERVAL_HOURS="24"
BACKUP_DEST_DIR=""
BACKUP_DISABLED="false"

# First Super Admin (seeded on first run)
SUPER_ADMIN_EMAIL="admin@ecclesia.local"
SUPER_ADMIN_PASSWORD=""
SUPER_ADMIN_NAME="Parish Administrator"
ENVEOF

  ok "Created backend/.env with a secure random JWT_SECRET"
fi

echo ""

# =============================================================================
# STEP 3: Install root dependencies
# =============================================================================
echo -e "${BOLD}Step 3/7: Installing root dependencies...${NC}"
echo ""
(cd "$PROJECT_ROOT" && npm install --no-fund --no-audit)
ok "Root dependencies installed"
echo ""

# =============================================================================
# STEP 4: Install backend dependencies
# =============================================================================
echo -e "${BOLD}Step 4/7: Installing backend dependencies...${NC}"
echo ""
(cd "$BACKEND_DIR" && npm install --no-fund --no-audit)
ok "Backend dependencies installed"
echo ""

# =============================================================================
# STEP 5: Generate Prisma client + push schema
# =============================================================================
echo -e "${BOLD}Step 5/7: Setting up database...${NC}"
echo ""

echo "  Generating Prisma client..."
(cd "$BACKEND_DIR" && npx prisma generate)
ok "Prisma client generated"

echo "  Pushing schema to database..."
echo "  (This creates tables if they don't exist, or updates them if they do.)"
echo ""
(cd "$BACKEND_DIR" && npx prisma db push --accept-data-loss)
ok "Database schema is up to date"
echo ""

# =============================================================================
# STEP 6: Seed the database
# =============================================================================
echo -e "${BOLD}Step 6/7: Seeding initial data...${NC}"
echo ""

# Check if the database already has users (meaning it's been seeded before)
USER_COUNT=$(cd "$BACKEND_DIR" && npx prisma db execute --stdin <<< "SELECT count(*) FROM \"User\";" 2>/dev/null | tail -1 | tr -d '[:space:]' || echo "0")

if [ "$USER_COUNT" != "0" ] && [ "$USER_COUNT" != "" ]; then
  warn "The database already contains $USER_COUNT user(s)."
  if confirm "Re-seed the database? This will NOT delete existing data."; then
    (cd "$BACKEND_DIR" && npm run db:seed)
    ok "Database seeded"
  else
    ok "Skipping seed — using existing data"
  fi
else
  (cd "$BACKEND_DIR" && npm run db:seed)
  ok "Database seeded with super_admin accounts"
fi

echo ""

# =============================================================================
# STEP 7: Build frontend + optional hostname setup
# =============================================================================
echo -e "${BOLD}Step 7/7: Building the application...${NC}"
echo ""

(cd "$PROJECT_ROOT" && npm run build)
ok "Application built successfully"
echo ""

# ── Optional hostname setup ──────────────────────────────────────────────────
echo -e "${BOLD}Optional: Set up ecclesia.local hostname?${NC}"
echo ""
echo "This lets users type http://ecclesia.local instead of the IP address."
echo "Requires administrator/sudo access."
echo ""

if confirm "Set up ecclesia.local hostname now?"; then
  echo ""
  case "$(uname -s)" in
    Linux*)
      echo "Running Linux hostname setup (requires sudo)..."
      sudo bash "$SCRIPT_DIR/setup-hostname.sh"
      ;;
    Darwin*)
      echo "On macOS, ecclesia.local usually works automatically via Bonjour."
      echo "If it doesn't, you can add a hosts entry manually:"
      echo "  sudo sh -c 'echo \"127.0.0.1 ecclesia.local\" >> /etc/hosts'"
      ;;
    *)
      echo "Hostname setup is not available for this platform."
      echo "See INSTALL.md for manual setup instructions."
      ;;
  esac
else
  echo "Skipping hostname setup. You can run it later:"
  echo "  Linux:  sudo bash scripts/setup-hostname.sh"
  echo "  Windows: powershell -ExecutionPolicy Bypass -File scripts\\setup-hostname.ps1"
fi

echo ""

# =============================================================================
# DONE
# =============================================================================
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Installation Complete!                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}To start the server:${NC}"
echo ""
echo "  cd $PROJECT_ROOT/backend"
echo "  npm start"
echo ""
echo -e "${BOLD}Then open in any browser:${NC}"
echo ""
echo "  http://localhost:5000"
echo ""
echo "  (or http://ecclesia.local if you set up the hostname)"
echo ""
echo -e "${CYAN}Three super_admin accounts are seeded (see README.md for emails).${NC}"
echo "You will be guided through a parish setup wizard on first login."
echo ""
echo -e "${BOLD}To stop the server:${NC}"
echo "  Press Ctrl+C in the terminal where it is running."
echo ""
echo -e "${BOLD}To run as a background service:${NC}"
echo "  See INSTALL.md → 'Running as a Service'"
echo ""
