# Middelburg International JC Register

Read-only, offline copy of the job card register for iPhone, Android and the web.

- The job card data is in `data.enc`, encrypted with AES-256. The site is public, but without the password it shows only the lock screen.
- New cards, edits and the review queue stay in the Claude register. After each batch, replace `data.enc` here with the new one.
- Works offline after it has been opened once online.

Files: `index.html`, `app.js` (the app), `data.enc` (encrypted data), `sw.js` (offline cache), `manifest.webmanifest` and `icons/` (home-screen icon), `xlsx.full.min.js` (Excel export).
