# ECCLESIA Church Management System - Electron Desktop App

## Overview
This converts the existing ECCLESIA web application into a native Windows desktop application using Electron.

## Architecture
- **Main Process** (`electron/main.js`): Starts Express backend, creates BrowserWindow, manages system tray
- **Preload Script** (`electron/preload.js`): Secure contextBridge API for renderer communication
- **Renderer Process**: Existing React + Vite app (served by backend in production)
- **Backend**: Express + Prisma + SQLite (spawned as child process)

## Quick Start Commands

### Development
```bash
# Install all dependencies (run once)
npm install
npm run backend:setup

# Run in development mode (starts Vite + Backend + Electron)
npm run dev
```

### Production Build
```bash
# Build frontend + backend, then create Windows installer
npm run dist:win

# Output: release/ecclesia-church-management-system-setup-<version>.exe
```

### Other Platforms (future)
```bash
npm run dist:mac   # Creates .dmg for macOS
npm run dist:linux # Creates .AppImage for Linux
```

## Key Files Created

### `electron/main.js`
- Detects dev vs production (`!app.isPackaged`)
- Starts backend: `tsx watch` (dev) or `node dist/index.js` (prod)
- Forces SQLite to `app.getPath('userData')/ecclesia.db` via `DATABASE_URL`
- Creates 1400×900 window (min 1100×700)
- Dev: loads `http://localhost:3000` | Prod: loads `http://127.0.0.1:5000`
- Implements "close to tray" behavior
- System tray with "Open ECCLESIA" and "Quit"
- Properly kills backend on app quit

### `electron/preload.cjs` (CommonJS — required by the sandboxed renderer)
- Minimal secure bridge via `contextBridge`
- Exposes: `getVersion()`, `getPath()`, `platform`, `isElectron`
- Plus `windowControls` (minimize/maximize/close) for the frameless title bar
- Keeps `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Must stay CommonJS: sandboxed preloads cannot use ESM (`import`)

### `package.json` (updated)
- `"main": "electron/main.js"`
- New scripts: `dev`, `dist`, `dist:win`, `dist:mac`, `dist:linux`
- Complete `build` config for electron-builder
- `extraResources` includes backend dist, prisma, node_modules
- `asarUnpack` for Prisma query engine

### `electron/assets/`
- `icon.svg` - Vector source (matte charcoal tile + brushed-silver E+Cross monogram with ECCLESIA lettering)
- `icon.png` - 512px PNG (electron-builder Linux icon)
- `icon-16.png` … `icon-512.png` - Fixed-size PNGs (BrowserWindow, tray)
- `icon.ico` - Multi-size Windows icon (installer, shortcuts, taskbar)
- `icon.icns` - Multi-size macOS icon (app bundle)
- `installer.nsh` - Custom NSIS installer script

## Database Location
- **Development**: `backend/prisma/dev.db` (original)
- **Production (Electron)**: `%APPDATA%\ECCLESIA\ecclesia.db` (Windows)
  - Set via `DATABASE_URL=file:<userData>/ecclesia.db`
  - Backend already reads `process.env.DATABASE_URL` ✓
  - Backup system uses same env var ✓

## Prisma Packaging Notes
1. **Query Engine**: Packed via `asarUnpack` for `@prisma/client` and `.prisma`
2. **Schema**: Included in `extraResources` as `backend/prisma/`
3. **Generate**: Run `npm run db:generate` in backend before building
4. **Migrations**: `prisma db push` runs on first startup via backend setup

## Backend Requirements (already satisfied)
- Uses `env("DATABASE_URL")` in `schema.prisma` ✓
- `backup.ts` reads `process.env.DATABASE_URL` ✓
- Self-hosts frontend from `../dist` ✓

## Icons (Regenerate After Any Brand Change)
```bash
# Regenerate the entire icon set (PNGs, ICO, ICNS, SVGs) with the built-in
# dependency-free generator — no ImageMagick required.
node scripts/generate-icons.mjs
```
The generator renders the brand mark (dark charcoal radial tile + monoline
silver E+cross + ECCLESIA lettering) at every size with 6x supersampled
anti-aliasing and bundles native-size frames into `icon.ico` (16–256) and
`icon.icns` (16–1024) so the OS never downscales. It also emits the
PWA/favicon icons in `public/icons/` (including the full-bleed
`icon-maskable-512.png` referenced by the PWA manifest).

To eyeball the result, rebuild the self-contained preview page and open it:

```bash
node scripts/build-icon-preview.mjs
# then open icon-preview.html in a browser
```

## Troubleshooting

### Port 3000 in use during `npm run dev`
```bash
# Kill existing process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Prisma Client Missing in Packaged App
Ensure `asarUnpack` includes:
```json
"asarUnpack": [
  "backend/node_modules/@prisma/client/**/*",
  "backend/node_modules/.prisma/**/*"
]
```

### Database Not Found
- Check `%APPDATA%\ECCLESIA\ecclesia.db` exists
- Backend creates it automatically on first run via `prisma db push`

### Antivirus False Positives
- Electron apps often flagged by Windows Defender
- Sign the installer with a code signing certificate for production

## File Structure After Setup
```
project-root/
├── electron/
│   ├── main.js
│   ├── preload.js
│   └── assets/
│       ├── icon.svg
│       ├── icon.png
│       ├── icon.ico
│       └── installer.nsh
├── backend/
│   ├── dist/           # Compiled backend (included in build)
│   ├── prisma/         # Schema + migrations (included)
│   └── node_modules/   # Dependencies (included via extraResources)
├── dist/               # Frontend build (served by backend)
├── release/            # electron-builder output (.exe here)
└── package.json        # Updated with Electron config
```

## Next Steps
1. Replace placeholder icons in `electron/assets/`
2. Test `npm run dev` - verify window opens, tray works
3. Test `npm run dist:win` - verify installer creates and runs
4. Add code signing certificate for production distribution
5. Consider auto-updater (electron-updater) for future updates