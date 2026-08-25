# ECCLESIA Church Management System — Client Setup Guide

This guide explains how to connect client devices (desktops, laptops, tablets) to your ECCLESIA server over the local network.

## Quick Start

1. Open any modern web browser (Chrome, Firefox, Edge, Safari)
2. Enter the server address in the address bar:
   ```
   http://ecclesia.local
   ```
   or (if using HTTPS):
   ```
   https://ecclesia.local
   ```
3. You'll see the **Connect to Parish Server** screen (first time only)
4. The address should already be filled in as `ecclesia.local`
5. Click **Connect to Server**
6. Log in with your credentials

---

## First Launch

### Step 1: Connect to Server

When you first open ECCLESIA, you'll see:

```
┌─────────────────────────────────────────┐
│           [Cross Icon]                  │
│         Ecclesia CMS                    │
│     Church Management System            │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Connect to Parish Server        │   │
│  │                                 │   │
│  │ Enter the address of your       │   │
│  │ parish server to get started.   │   │
│  │                                 │   │
│  │ Server Address                  │   │
│  │ ┌─────────────────────────────┐ │   │
│  │ │ ecclesia.local               │ │   │
│  │ └─────────────────────────────┘ │   │
│  │                                 │   │
│  │ [ Connect to Server ]           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Need help? Contact your parish        │
│  administrator for the server address. │
└─────────────────────────────────────────┘
```

The server address should already be filled in as **ecclesia.local** (the default). Just click **Connect to Server**.

### If ecclesia.local doesn't work:

1. Ask your administrator for the server's IP address
2. Enter it in the Server Address field (e.g., `192.168.1.100`)
3. Click **Connect to Server**

### Step 2: Log In

After connecting, you'll see the login screen:

1. Enter your **email address** (e.g., `john@ecclesia.local`)
2. Enter your **password**
3. Check **Remember Session** if you want to stay logged in
4. Click **Sign In**

### Step 3: Change Password (First Login)

If this is your first time logging in with a temporary password, you'll be forced to change it:

1. Enter your **new password** (at least 8 characters)
2. **Confirm** the new password
3. Click **Save New Password**

### Step 4: Parish Setup (Admin Only)

If you're the first administrator, you'll see the parish setup wizard:

1. Enter your **parish name** (e.g., "St. Mary's Catholic Parish")
2. Enter **diocese**, **local church**, and other details
3. Upload your **parish logo** (optional)
4. Click **Complete Setup**

After setup, you'll enter the main application.

---

## Using ECCLESIA

### Navigation

- **Sidebar** (left): Click icons to switch between panels
- **Header** (top): Search, user menu, online status
- **Footer** (bottom): Parish info, system links

### Main Panels

| Icon | Panel | Description |
|------|-------|-------------|
| 📊 | Dashboard | Overview and quick actions |
| 👤 | Christian Registry | Manage parishioner records |
| 💰 | Activities | Contributions, transfers, billing |
| ⛪ | Sacraments | Baptism, confirmation, marriage records |
| 🏦 | Finance | Deposits, creditors, debtors, expenses |
| 📒 | Ledgers | Financial accounts and transfers |
| 📦 | Inventory | Stock management and sales |
| 📈 | Reports | Analytics and exports |
| 👥 | HR | Employees, payroll, leaves |
| ⚙️ | Administration | Users, permissions, settings |

### Real-Time Updates

When multiple users are connected, changes are synchronized automatically:
- A green "Online" indicator in the header shows the connection is active
- Changes made by other users appear in real-time
- No page refresh needed

---

## Changing Server Connection

If you need to connect to a different server (or the server address changed):

1. Open browser Developer Tools (F12)
2. Go to **Application** → **Local Storage**
3. Find and delete `ecclesia_server_url`
4. Refresh the page
5. You'll see the connection screen again

---

## Network Requirements

### Minimum Bandwidth

- **Upload/Download**: 1 Mbps recommended
- **Latency**: < 100ms to server (local network)

### Ports

- **Port 5000** (default): API and WebSocket
- Ensure this port is not blocked by firewalls

### WiFi vs Ethernet

- **Ethernet** (wired): More reliable, recommended for desktops
- **WiFi**: Works well for laptops and tablets
- Ensure strong WiFi signal in all areas

---

## Adding to Home Screen (Mobile/Tablet)

ECCLESIA works on tablets and phones through the web browser:

1. Open your mobile browser
2. Enter `http://ecclesia.local`
3. Add to home screen for app-like experience:
   - **iOS Safari**: Tap Share → Add to Home Screen
   - **Android Chrome**: Tap menu → Add to Home Screen

**Recommended devices:**
- iPad (any recent model)
- Android tablets (10" screen or larger)
- Phones work but smaller screens may be harder to use

---

## Troubleshooting

### "ecclesia.local" doesn't work

1. **Try the IP address:**
   - Ask your administrator for the server's IP address
   - Enter it in the Server Address field (e.g., `192.168.1.100`)

2. **Add a hosts file entry (temporary fix):**
   - **Windows:** Edit `C:\Windows\System32\drivers\etc\hosts`
   - **macOS/Linux:** Edit `/etc/hosts`
   
   Add this line (ask your administrator for the server's IP):
   ```
   192.168.1.100    ecclesia ecclesia.local
   ```

3. **Check with your administrator**

### "Cannot connect to server"

1. Server is powered on and running
2. You're on the same network as the server
3. Server address is correct
4. Port 5000 is not blocked

### Real-time updates not working

1. Check the "Online" indicator in the header
2. If offline, refresh the page
3. Contact administrator if problem persists

### Certificate warnings (HTTPS)

If using HTTPS with Caddy:
1. Click "Advanced" or "Show Details"
2. Click "Proceed to ecclesia.local (unsafe)" or "Accept the Risk"
3. The warning won't appear again for that browser

---

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Fully supported |
| Firefox | 88+ | ✅ Fully supported |
| Edge | 90+ | ✅ Fully supported |
| Safari | 14+ | ✅ Fully supported |
| Opera | 76+ | ✅ Fully supported |

**Note:** Internet Explorer is not supported.

---

## Security Tips

1. **Don't share your password** with others
2. **Log out** when using shared computers
3. **Don't save passwords** in shared browsers
4. **Report suspicious activity** to your administrator
5. **Keep your browser updated** for security patches

---

## Quick Reference

### Server Access

| URL | When to use |
|-----|-------------|
| `http://ecclesia.local` | Default (most common) |
| `https://ecclesia.local` | If HTTPS is configured |
| `http://<server-ip>:5000` | If ecclesia.local doesn't work |
| `https://<server-ip>` | HTTPS with IP address |

### Need Help?

Contact your parish administrator or IT support.

---

*Private — Max Bless Ngugi / Ecclesia*
