# ECCLESIA — Install & Run on Another PC

There are three ways to get ECCLESIA onto another PC. Pick the one that fits:

| Option | Best for | Needs internet? | Needs Node.js? |
|--------|----------|-----------------|----------------|
| **A. Windows installer (.exe)** | Normal parish PCs | Only on first install | ❌ No |
| **B. Run from source folder** | Portable / no-install setups | Yes (npm install) | ✅ Yes (18+) |
| **C. `install-parish.cmd`** | One-click parish setup with auto-start | Yes (npm install) | ✅ Yes (18+) |

**All options store the data in a local SQLite file** — no internet connection is needed
to use the app once installed (offline sync keeps working too).

---

## Option A — Windows Installer (recommended for a normal PC)

This is the easiest: copy one `.exe` file to the other PC, run it, done.

### On this PC (the one with the project)

1. Build the installer (or grab the ready-made copy):

   ```bash
   npm run dist:win
   ```

   The installer appears at **`release/ECCLESIA-ChMS-Setup-1.0.0.exe`**.

2. Copy that single `.exe` to a USB stick, shared folder, or email it to the other PC.

### On the other PC

1. **Copy** `ECCLESIA-ChMS-Setup-1.0.0.exe` anywhere (e.g. `C:\Users\<name>\Desktop`).
2. **Double-click it**.
   - If Windows shows **"Windows protected your PC" (SmartScreen)**, click
     **More info → Run anyway**. The installer isn't code-signed yet, so SmartScreen
     can't verify the publisher — this is expected.
3. Follow the installer wizard:
   - A **Getting Started** page explains what happens next (launch, first-run
     setup, where the data lives)
   - Choose the install folder (default `C:\Program Files\ECCLESIA Church Management System` is fine)
   - Leave the **Create desktop shortcut** and **Start Menu shortcut** boxes ticked
   - Click **Install**
4. When it finishes, click **Finish** — the app starts automatically (or launch it from the
   desktop / Start Menu shortcut called **ECCLESIA**).

### First launch — guided setup (creates your login)

The very first time the app opens on a fresh install it shows a **"Welcome to
ECCLESIA"** screen instead of the login form. This is your only chance to set up
the master administrator — no default password exists and nothing is printed:

1. **Administrator Name** — who manages the system (e.g. "Fr. John Mwangi").
2. **Email Address** — the login email for that person.
3. **Create Password** + **Confirm Password** — choose a strong password
   (at least 8 characters with upper & lower case, a number and a special character).
4. Click **Create Administrator & Sign In** — you land on the Dashboard as the
   **super admin** (full access). Only a super admin can add more users later
   (Administration → Rights Centre).

> **Write these credentials down.** They are the master login for the whole
> system. If you ever lose them, see the Troubleshooting table below.

### Signing in afterwards (every day)

| Field | Value |
|-------|-------|
| Email | The email you entered during the first-launch setup |
| Password | The password you chose during the first-launch setup |

If the login screen shows **"Sign in instead"**, setup was already completed —
just enter those credentials.

### Where the data lives (important!)

- Database: **`%APPDATA%\<app folder>\ecclesia.db`** — on a normal install this
  is `%APPDATA%\ECCLESIA Church Management System\ecclesia.db` (type it into the
  File Explorer address bar; the exact folder name is shown in the installer's
  Getting Started page).
- **Backup this folder** to protect parish records. The installer deliberately
  **never deletes it** — even when you uninstall the app, the data stays safe.

### How to run it every day

- Double-click the **ECCLESIA** shortcut (desktop or Start Menu).
- The app opens as a **native desktop window** with an icon in the system tray.
- **Closing the window hides it to the tray** — use the tray icon → **Quit** to fully stop it.

### Updating to a new version

1. Run the new installer over the old one (it upgrades in place).
2. Your data in `%APPDATA%\ECCLESIA` is untouched.

---

## Option B — Run from a Source Folder (portable, no install)

Useful when you want to run without installing, or on a PC where you can't run installers.

### 1. Copy the project folder

Copy the entire project folder (the one containing `package.json`, `start-app.cmd`,
`backend/`, `src/`, …) to the other PC — USB stick, network share, or zip + extract.
You can delete heavy/irrelevant subfolders first (`node_modules`, `release*`, `dist*`)
to make it much smaller — `npm run setup` recreates them.

### 2. Install prerequisites

Install **Node.js 18 or newer** from <https://nodejs.org> (the LTS version — "Install" button).
Just accept the defaults. Nothing else is needed.

### 3. One-time setup (first run only)

Open a terminal (or double-click `start-app.cmd` once — but the very first time, use a
terminal so you can see the admin password):

```bash
npm run setup
```

This installs dependencies, creates the local SQLite database, and seeds the super admin.
The seed prints the **admin email + temporary password once** — write it down.

### 4. Run it

- **Double-click `start-app.cmd`** — or in a terminal run:

  ```bash
  npm run dev
  ```

The native **ECCLESIA desktop window** opens (starts the backend + frontend + app window
automatically). Closing the window hides it to the tray; use tray → **Quit** to stop.

---

## Option C — `install-parish.cmd` (one-click parish setup + auto-start)

Designed for installing on a parish PC and having it **start automatically on boot**
(Windows service if NSSM is available, otherwise a startup scheduled task).

1. Copy the project folder to the parish PC (see Option B, step 1).
2. Install **Node.js 18+** (see Option B, step 2).
3. Double-click **`install-parish.cmd`** and follow the prompts:
   - **Delete existing database?** — say `y` for a truly fresh install, `n` to keep data.
   - **Super admin email** — press Enter for the default, or type a parish email.
   - **Super admin temp password** — type one (letters/numbers only), or leave blank to
     get a random one that's printed once.
4. The script installs deps, generates a strong `JWT_SECRET`, builds the app, creates the
   database, registers auto-start, starts the backend, then opens the **native app window**.
5. The final screen shows the admin email and password — **write them down**.

To stop the auto-start later: uninstall the service/task named **Ecclesia**
(`nssm remove Ecclesia` or remove the "Ecclesia" scheduled task).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Windows protected your PC" on the installer | Click **More info → Run anyway** (unsigned installer — normal until we add a code-signing certificate) |
| Antivirus flags the app | Electron apps are commonly false-flagged; add an exclusion for the install folder. The app only writes to `%APPDATA%\ECCLESIA` |
| App won't start, nothing happens | Close it from the tray first (old instance may be running), then relaunch |
| Port 3000 or 5000 already in use | Something else is on that port — close other ECCLESIA instances, or in a terminal: `netstat -ano \| findstr :5000` then `taskkill /PID <pid> /F` |
| Forgot the admin password | Installed app: use **Forgot Password?** on the login screen (another admin can issue the one-time reset code), or see `docs/OPERATIONS.md`. Source run: reset `SUPER_ADMIN_PASSWORD` in `backend/.env` and re-run `npm run db:seed` |
| Where is my data? | `%APPDATA%\ECCLESIA\ecclesia.db` (installed app) or `backend/prisma/dev.db` (source run) — back this up |
