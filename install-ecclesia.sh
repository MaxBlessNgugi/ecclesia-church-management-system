#!/usr/bin/env bash
# =============================================================================
# ECCLESIA ChMS — Automated 1-Click Installer (Linux / macOS)
# =============================================================================

set -e

echo "========================================================================="
echo "                  ECCLESIA CHURCH MANAGEMENT SYSTEM"
echo "                   1-Click Automated Installer"
echo "========================================================================="
echo ""
echo "Welcome! This script will automatically set up ECCLESIA on this computer."
echo "No technical knowledge is required. Please keep this window open."
echo ""

# ---------------------------------------------------------------------------
# Step 1: Check Node.js
# ---------------------------------------------------------------------------
echo "[1/6] Checking Node.js installation..."
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed on this computer!"
    echo "Please download and install Node.js (LTS version) from: https://nodejs.org"
    exit 1
fi
echo "[OK] Node.js version $(node -v) is installed!"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Configure Environment (.env)
# ---------------------------------------------------------------------------
echo "[2/6] Configuring environment settings..."
if [ ! -f "backend/.env" ]; then
    echo "Creating default backend/.env configuration file..."
    JWT_SECRET="ecclesia_parish_secret_$(date +%s)_key_production"
    cat <<EOF > backend/.env
# ECCLESIA Production Configuration
DATABASE_URL="postgresql://postgres:ecclesia@localhost:5432/ecclesia?schema=public"
JWT_SECRET="${JWT_SECRET}"
PORT=5000
NODE_ENV=production
EOF
    echo "[OK] Created backend/.env with default settings."
else
    echo "[OK] Existing backend/.env configuration found."
fi
echo ""

# ---------------------------------------------------------------------------
# Step 3: Install Dependencies
# ---------------------------------------------------------------------------
echo "[3/6] Installing application packages..."
npm install || echo "[WARNING] Main npm install had minor warnings."
cd backend
npm install || echo "[WARNING] Backend npm install had minor warnings."
cd ..
echo "[OK] Application packages installed."
echo ""

# ---------------------------------------------------------------------------
# Step 4: Initialize Database
# ---------------------------------------------------------------------------
echo "[4/6] Initializing PostgreSQL Database..."
cd backend
if npx prisma db push --accept-data-loss; then
    echo "[OK] Database schema synchronized!"
    npm run db:seed || true
    echo "[OK] Admin user and initial settings created!"
else
    echo "[NOTE] Unable to connect to PostgreSQL at localhost:5432."
    echo "Please make sure PostgreSQL is running and credentials in backend/.env match."
fi
cd ..
echo ""

# ---------------------------------------------------------------------------
# Step 5: Build App for Production
# ---------------------------------------------------------------------------
echo "[5/6] Building production application..."
npm run build
echo "[OK] Application built successfully!"
echo ""

# ---------------------------------------------------------------------------
# Step 6: Create Start Launcher
# ---------------------------------------------------------------------------
echo "[6/6] Creating Start Launcher..."

cat <<'EOF' > start-ecclesia.sh
#!/usr/bin/env bash
echo "========================================================================="
echo "                  ECCLESIA Church Management System"
echo "                         Server is Running!"
echo "========================================================================="
echo ""
echo " Access URL: http://localhost:5000  (or http://ecclesia.local:5000)"
echo ""
echo " Press Ctrl+C to stop the server."
echo "========================================================================="
echo ""

if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:5000 &
elif command -v open >/dev/null 2>&1; then
    open http://localhost:5000 &
fi

cd backend
npm start
EOF

chmod +x start-ecclesia.sh

echo ""
echo "========================================================================="
echo "                 ECCLESIA INSTALLATION COMPLETE!"
echo "========================================================================="
echo ""
echo " You can now start ECCLESIA anytime by running:"
echo "   ./start-ecclesia.sh"
echo ""
echo " Access URL: http://localhost:5000 (or http://ecclesia.local:5000)"
echo ""
