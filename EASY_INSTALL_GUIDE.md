# ECCLESIA ChMS — Ultra-Detailed Non-Technical Installation & Operating Manual

Welcome to **ECCLESIA Church Management System (Parish ERP)**!

This guide is written specifically for **non-technical users** (Church Secretaries, Treasurers, Pastors, and Parish Administrators). You do **NOT** need any background in IT or software engineering to install and run this system. Every single step is explained in extreme detail below.

---

## Table of Contents

1. [System Requirements & Overview](#1-system-requirements--overview)
2. [Step-by-Step Installation for Windows (Minute-by-Minute)](#2-step-by-step-installation-for-windows)
3. [Step-by-Step Installation for Mac & Linux](#3-step-by-step-installation-for-mac--linux)
4. [First-Time Parish Setup Wizard (Walkthrough)](#4-first-time-parish-setup-wizard)
5. [Connecting Workstations on the Parish Local Network (LAN)](#5-connecting-workstations-on-the-parish-local-network)
6. [Day-to-Day Operations & Module Guide](#6-day-to-day-operations--module-guide)
7. [Backups & Data Protection](#7-backups--data-protection)
8. [Troubleshooting & Frequently Asked Questions](#8-troubleshooting--frequently-asked-questions)

---

## 1. System Requirements & Overview

ECCLESIA runs on **one computer in your parish office** (called the **Server PC**). All other computers in the parish office (Secretaries, Treasurers, Father In-Charge) connect to it using their normal web browsers (Chrome, Edge, Firefox, or Safari).

### What You Need on the Main Server Computer:
1. **Operating System:** Windows 10/11, macOS, or Linux (Ubuntu/Debian).
2. **Node.js:** A free, safe software program required to run web applications.
3. **PostgreSQL:** A free, safe database program that stores your parish data safely.
4. **Network:** Wi-Fi or Ethernet router connecting your office computers together.

---

## 2. Step-by-Step Installation for Windows

Follow these steps **one by one**. Do not skip any step!

---

### Phase A: Installing Node.js (2 Minutes)

1. Open your internet browser (e.g. Google Chrome or Microsoft Edge).
2. Go to: **https://nodejs.org**
3. On the homepage, click the big button that says **"20.x.x LTS (Recommended for Most Users)"** or **"LTS"**.
4. Once the installer file (`node-v...msi`) downloads, double-click it in your Downloads folder to open it.
5. In the installer window:
   - Click **Next**.
   - Check the box that says *"I accept the terms in the License Agreement"* and click **Next**.
   - Click **Next** on the destination folder screen.
   - Click **Next** on the custom setup screen.
   - Click **Next** on the native modules screen.
   - Click **Install**.
6. When prompted by Windows *"Do you want to allow this app to make changes?"*, click **Yes**.
7. Click **Finish**. Node.js is now installed!

---

### Phase B: Installing PostgreSQL Database (3 Minutes)

1. Open your browser and go to: **https://www.postgresql.org/download/windows/**
2. Click **"Download the installer"**.
3. Choose **PostgreSQL 15 or 16** for Windows x86-64 and click **Download**.
4. Open the downloaded file (`postgresql-15...exe`).
5. In the setup wizard:
   - Click **Next**.
   - Click **Next** for Installation Directory.
   - Click **Next** for Select Components (keep all selected).
   - Click **Next** for Data Directory.
   - **IMPORTANT (Password Screen):** You will be asked to enter a password for the `postgres` superuser.
     - Type: `ecclesia`
     - Re-type: `ecclesia`
     - *(Note: Keeping the password as `ecclesia` allows the automated installer script to connect automatically!).*
   - Click **Next** for Port (keep it as `5432`).
   - Click **Next** for Advanced Options.
   - Click **Next** through the summary screens until installation begins.
6. When installation finishes, uncheck the box that says *"Launch Stack Builder"* and click **Finish**.

---

### Phase C: Running the 1-Click Automated Installer (1 Minute)

1. Download the ECCLESIA folder or extract the downloaded **`ecclesia-church-management-system.zip`** file to your computer (e.g., to `C:\Ecclesia`).
2. Open the `ecclesia-church-management-system` folder.
3. Find the file named **`install-ecclesia.bat`**.
4. **Double-click `install-ecclesia.bat`**.
5. A black terminal window will open and automatically perform all setup tasks:
   - Checking Node.js
   - Creating configuration files
   - Installing packages
   - Setting up the database
   - Creating the default administrator account
   - Building the production application
   - Creating a shortcut on your Desktop!
6. When it says **"ECCLESIA INSTALLATION COMPLETE!"**, press any key.

---

### Phase D: Launching ECCLESIA

1. Look on your Desktop for the file named **`START-ECCLESIA.bat`**.
2. **Double-click `START-ECCLESIA.bat`**.
3. The server window will open, and your web browser will automatically pop open to **`http://localhost:5000`**!

---

## 3. Step-by-Step Installation for Mac & Linux

### On macOS / Linux:
1. Install Node.js LTS from **https://nodejs.org**
2. Install PostgreSQL 14+ (or install via Homebrew `brew install postgresql@15` or `sudo apt install postgresql`). Ensure postgres service is running (`pg_ctl` or `sudo systemctl start postgresql`).
3. Open Terminal in the `ecclesia-church-management-system` folder.
4. Run:
   ```bash
   chmod +x install-ecclesia.sh
   ./install-ecclesia.sh
   ```
5. To start ECCLESIA anytime, run:
   ```bash
   ./start-ecclesia.sh
   ```

---

## 4. First-Time Parish Setup Wizard

When you open ECCLESIA for the very first time, you will see the **Guided Setup Screen**:

### Step 1: Create Your First Admin Account
- **Full Name:** Enter your name (e.g., *Fr. John Mary* or *Secretary Mary*).
- **Email Address:** Enter your official email (e.g., *admin@ourparish.org*).
- **Password:** Create a secure password (must contain at least 8 characters, uppercase, lowercase, number, and symbol e.g., `Parish2026!`).
- Click **Complete First-Run Setup**.

### Step 2: Configure Parish Identity
In the Parish Identity screen:
- **Parish Name:** (e.g. *St. Austin's Catholic Parish*)
- **Diocese:** (e.g. *Archdiocese of Nairobi*)
- **Local Church / Outstation:** (e.g. *Central Church*)
- **SCC Label:** (e.g. *Jumuiya* or *Small Christian Community*)
- **Upload Logo:** Click to upload your church logo (appears on official printed receipts and certificates).
- Click **Save Parish Settings**.

---

## 5. Connecting Workstations on the Parish Local Network

You do **NOT** need to install anything on other office PCs or tablets!

### On Other Computers in the Office:
1. Make sure the computer is connected to the same Wi-Fi or router network as the Server PC.
2. Open Chrome, Edge, Safari, or Firefox.
3. Type into the web address bar:
   ```
   http://ecclesia.local:5000
   ```
   *(Or type the Server PC's IP address, e.g., `http://192.168.1.100:5000`).*
4. Click **Connect to Server**.
5. Log in with your email and password.
6. All changes made on one PC appear instantly across all workstations in real time!

---

## 6. Day-to-Day Operations & Module Guide

| Module | What You Can Do |
| :--- | :--- |
| **Dashboard** | View real-time member counts, active membership totals, weekly giving totals, recent expenses, and quick activity feeds. |
| **Christians** | Register new members, search by name/national ID/SCC, edit details, record sacraments, or bulk-import members from Excel/CSV files. |
| **Sacraments** | View and print registers for Baptism, First Holy Communion, Confirmation, Holy Matrimony, and Deceased Members. |
| **Finance** | Record bank deposits, manage creditors (bills owed to suppliers), track debtors (member pledges/unpaid fees), and record daily parish expenses. |
| **Ledgers** | Manage cash books (e.g., Main Cash Book, Parish Bank Account, M-Pesa Ledger) and perform inter-ledger transfers with automatic validation. |
| **Inventory** | Track church property, liturgical supplies, candles, books, record sales, stock-takes, and track price changes over time. |
| **HR & Staff** | Maintain staff profiles, process monthly payrolls, calculate allowances/deductions, manage leave requests, and post vacancies. |
| **Reports** | Generate and print official PDF/print-ready reports for sacraments, financial giving, inventory sales, and cashier reconciliations. |
| **Admin** | Manage user accounts, assign custom panel permissions, set up M-Pesa push payments, view the audit log, and restore deleted items from the Trash. |

---

## 7. Backups & Data Protection

ECCLESIA protects your data automatically:

### 1-Click Backup (Manual)
1. Go to **Admin > System Operations**.
2. Click **Trigger Database Backup**.
3. A `.sql` file containing your full database will be saved in `backend/backups/`.

### Full Data Export (JSON)
1. Go to **Admin > System Operations**.
2. Click **Export All Parish Data**.
3. A JSON backup file will download to your computer.

### Restoring Deleted Items (Trash Can)
1. If anyone accidentally deletes a member, expense, or inventory item, go to **Admin > Trash & Audit**.
2. Find the deleted item and click **Restore**.
3. The item immediately returns to its active module!

---

## 8. Troubleshooting & Frequently Asked Questions

### Q: "I double-clicked `START-ECCLESIA.bat` but it closed immediately!"
- **Fix:** Right-click `START-ECCLESIA.bat` and click *Run as Administrator*. Ensure Node.js and PostgreSQL are installed.

### Q: "Other computers cannot connect to `http://ecclesia.local:5000`"
- **Fix 1:** Ensure the main server PC is powered on and `START-ECCLESIA.bat` is running.
- **Fix 2:** Check that both computers are connected to the same Wi-Fi router.
- **Fix 3:** Use the server's IP address instead (e.g., `http://192.168.1.100:5000`). To find your server IP on Windows, open Command Prompt and type `ipconfig`.

### Q: "I forgot my password!"
- **Fix:** Ask your Super Admin (Father In-Charge or Main Secretary) to go to **Admin > Users**, click your user, and click **Reset Password**.

---

*Private & Confidential — ECCLESIA ChMS*
