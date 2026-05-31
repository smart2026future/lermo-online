# 🌸 LERMO — Secure Chat Platform
## Complete Setup & Usage Guide

---

## 🚀 QUICK START

### Windows
1. Double-click **START_LERMO_WINDOWS.bat**
2. A terminal opens showing your Wi-Fi address (e.g. `http://192.168.1.10:8888`)
3. Open that address in any browser — or share it with others on the same Wi-Fi

### Mac / Linux
1. Open Terminal in this folder
2. Run: `chmod +x START_LERMO_MAC_LINUX.sh && ./START_LERMO_MAC_LINUX.sh`
3. The terminal shows your Wi-Fi address — share it with others

---

## 📱 CONNECTING OTHER DEVICES (Same Wi-Fi)

Any device on the **same Wi-Fi network** can connect:

- **iPhone / iPad**: Open Safari → type the address shown in terminal
- **Android**: Open Chrome → type the address
- **Another laptop**: Open any browser → type the address
- **Add to Home Screen on iPhone**: Tap Share → "Add to Home Screen" for an app-like experience

---

## 🔐 DEFAULT ADMIN LOGIN

```
Username: admin
Password: Admin123!
```
**Change this password immediately after first login!**

---

## ✨ FEATURES

### For Members
- ✅ Register with your own chosen password
- ✅ Create public channels, group chats, or private rooms
- ✅ Send direct messages to any member
- ✅ Emoji reactions on messages
- ✅ Real-time chat (updates instantly for all connected users)
- ✅ Dark mode / Light mode (per user)
- ✅ Arabic / English language (per user — doesn't affect others)
- ✅ Change your password anytime

### Privacy (Private Rooms)
- ✅ Even the admin CANNOT see private room messages
- ✅ Only room creator and invited members can access
- ✅ Full member privacy protection

### For Admin
- ✅ Reset any member's password
- ✅ Remove/ban any member
- ✅ Delete rooms
- ✅ View security logs
- ✅ Live stats dashboard

---

## 🔧 REQUIREMENTS

- **Node.js** version 18 or higher
- Download from: https://nodejs.org (choose LTS)
- No other software needed — all dependencies install automatically

---

## 📁 FOLDER STRUCTURE

```
LERMO/
├── backend/
│   ├── server.js          ← Main server
│   ├── package.json       ← Dependencies
│   └── data/              ← Auto-created, stores all data
│       ├── users.json
│       ├── rooms.json
│       ├── messages.json
│       └── logs.json
├── frontend/
│   └── index.html         ← Complete app (served by server)
├── START_LERMO_WINDOWS.bat
├── START_LERMO_MAC_LINUX.sh
└── README.md
```

---

## 🌐 PORT & FIREWALL

The server runs on **port 8888**.

### Windows Firewall (first time only):
- Windows may ask "Allow this app through firewall?" → Click **Allow**
- Or run `SETUP_FIREWALL.bat` as Administrator

### Mac:
- macOS may ask "Allow incoming connections?" → Click **Allow**

---

## 💾 DATA BACKUP

All data is stored in `backend/data/` as JSON files.
To back up: copy the entire `data/` folder.
To restore: paste it back before starting the server.

---

## 🌍 DEPLOYING EXTERNALLY (Optional)

To make LERMO accessible from the internet (not just Wi-Fi):

### Free Options:
1. **Railway.app** (~$5/mo, easiest) — upload the `backend/` folder
2. **Render.com** (free tier) — connect to GitHub
3. **Fly.io** (free tier) — Docker deployment

### For external deployment, update the WS_URL in index.html:
Change line: `const WS_URL = ...`
To: `const WS_URL = 'wss://your-server-domain.com'`

---

## 🆘 TROUBLESHOOTING

**"Node.js not found"**: Install from https://nodejs.org

**"Address already in use"**: Another program uses port 8888.
Change PORT in `backend/server.js` line: `const PORT = 8888;`

**Others can't connect**: Make sure you're all on the same Wi-Fi.
Try turning off Windows Firewall temporarily to test.

**App doesn't load**: Make sure the terminal is still open (server running).

---

## 📞 SUPPORT

Built with ❤️ by LERMO Team
Tech Stack: Node.js + Express + WebSockets + Vanilla JS

## Upgrade Notes - May 2026
- Weather widget now uses a backend weather API and will never display raw HTML/code. It defaults to Erbil and shows a sun/moon/weather icon, temperature, and status when internet is available.
- Added Notification Center in the top-right. Incoming messages flash the bell and are listed in the center.
- Added Big Ben-style clock chime controls in Settings > Design Studio. Use Enable Chime once so the browser allows sound.
- Added admin user control panel fields for name, username, email, role, color, nickname/job title, and optional new password.
- Added nickname/job title during registration and profile settings. It is displayed under names in chat/member lists.
- Improved dark mode readability with bright white/gold text and added font/text color controls.
- Added Smart Tools quick message helpers in Settings.
