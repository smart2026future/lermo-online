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

## 🔐 ADMIN SECURITY

A first-run administrator account is created automatically.
For security, the login page no longer shows any default credentials.
Change the administrator password immediately after first login.

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

## Production Upgrade Notes - v3

This package adds production-focused security and online features.

### Security and database
- Passwords are now hashed with bcrypt. Existing plain-text users are migrated automatically on next login.
- New registrations can require admin approval. By default `AUTO_APPROVE_USERS=false`, so the admin approves users from Admin Panel.
- Admin actions are checked server-side before changing users, rooms, backups, or approvals.
- PostgreSQL is supported through Railway. Add a Railway PostgreSQL database and set `DATABASE_URL`; LERMO will store users, rooms, messages, meetings, games, settings, and logs in PostgreSQL automatically.
- If `DATABASE_URL` is not set, LERMO still works using JSON files for local testing.

### New features
- Book meetings between users from the new Meetings screen.
- Users can accept or decline meeting invitations.
- Notification sound plays when new messages, meeting invitations, or game invitations arrive.
- Two-player online Tic Tac Toe is available from Games.
- Big Ben chime remains available in Settings > Design Studio.
- Admin can export a complete backup from Admin Panel.

### Railway recommended settings
Use the repository root as Railway root directory:

```
Root Directory: /
Build Command: npm run build
Start Command: npm start
```

Optional variables:

```
DATABASE_URL=provided by Railway PostgreSQL
JWT_SECRET=your-long-random-secret
AUTO_APPROVE_USERS=false
UPLOAD_DIR=/app/backend/data/uploads
```

### PostgreSQL setup on Railway
1. Open your Railway project.
2. Click Add/New.
3. Add PostgreSQL.
4. Railway will create `DATABASE_URL` automatically for services in the same project.
5. Redeploy the LERMO service.
6. Check logs for: `PostgreSQL storage enabled for LERMO.`

## v4 Upgrade Notes
- Removed the visible default admin credentials from the login page.
- Added email-based password reset endpoints (requires SMTP_* environment variables).
- Added scheduled JSON backup snapshots in backend/data/backups or BACKUP_DIR.
- Added richer user roles: admin, manager, member, guest.
- Added city suggestions/autocomplete in the weather search box.
- Improved status synchronization so admin/member status changes update immediately.
- Enhanced the hologram/glass design across the login page and modules.
- Added accept/decline flow and result display for two-player online Tic Tac Toe.


## v5 Enterprise Additions
- Optional Cloudflare R2 uploads. If R2 variables are set, file/image uploads go to R2; otherwise they continue using Railway volume/local uploads.
- Activity Hub with competitive leaderboard, storage status, latest audit log, game counts, and system intelligence.
- Added Connect Four as a real two-player online game in addition to Tic Tac Toe.
- Multiplayer games now support invitation accept/decline and result display.

### Cloudflare R2 variables
Set these in Railway only if you want R2 uploads:
```
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret
R2_BUCKET=your_bucket_name
R2_PUBLIC_URL=https://your-public-r2-domain-or-custom-domain
```

### Railway volume fallback
If you do not set R2, keep:
```
UPLOAD_DIR=/app/data/uploads
BACKUP_DIR=/app/data/backups
```
Then attach a Railway volume mounted at `/app/data`.


## LERMO V7 Professional UI/UX Redesign

This package is a stronger visual and layout rebuild based on the stable V5 codebase.

### Included in V7
- Stable login/app separation so the login panel cannot remain on top after sign-in.
- Professional hologram command-center UI with glass panels, responsive grid layout, and readable contrast.
- Redesigned main shell: sidebar, chat workspace, right intelligence panel, and message composer.
- Redesigned admin, settings, activity, games, statistics, and meetings modules.
- Activity Hub rendering is fixed and now refreshes when opened.
- Games lobby keeps two-player invitations, accept/decline, Tic Tac Toe, Connect Four, moves, and result display.
- Weather city suggestions, password reset, roles, audit logs, PostgreSQL, backups, Railway volume uploads, and optional Cloudflare R2 support are preserved.

### Railway settings
Root Directory: /
Build Command: npm run build
Start Command: npm start

### Recommended Railway variables
UPLOAD_DIR=/app/data/uploads
BACKUP_DIR=/app/data/backups
BACKUP_INTERVAL_HOURS=24

Optional R2 variables remain supported if you decide to use Cloudflare R2 later.


## V8 Polish and Weather Fix
- Weather widget now uses the backend `/api/weather` endpoint and never displays raw HTML.
- Added safe fallback weather values for common cities if the external weather service is unavailable.
- Refined colors, fonts, spacing, panels, chat bubbles, buttons, and topbar for a clearer professional command-center look.
- Kept the same concept and workflow; this update is visual polish plus weather stability.


## LERMO V10 Quantum Command UI
This version applies a major design revolution inspired by the uploaded Hospital OS reference:
- cleaner 3050 cockpit layout,
- no overlapping sidebar/admin buttons,
- split biometric login experience,
- improved command-style topbar and weather display,
- stronger Admin Control Center, Settings, Activity, Games and Meetings styling,
- better dark/day mode readability,
- protected Railway port support.
