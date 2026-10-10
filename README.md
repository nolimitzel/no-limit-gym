# No Limit — Gym Tracker (PWA)

Your personal 5-day muscle-building tracker. Offline-first, on-device, no login.

## What it does
- **Today** — shows today's session ("Today is gym day — Push"), a 7-day cycle strip, and quick stats.
- **Train** — log weight × reps × sets for every exercise. Your last session's numbers pre-fill so you always know what to beat (progressive overload).
- **Progress** — bodyweight trend, per-lift progress charts, and automatic personal records (PRs).
- **Log** — daily bodyweight + calories/protein vs your 72→76 kg lean-gain targets, with a 7-day protein chart.
- **Plan** — your full programme reference (warm-up, all 5 days, rules, nutrition, supplements) + set-up and data tools.
- **Reminders** — downloads a Calendar (.ics) file with a weekly alert for each training day (the iPhone-friendly way to get "today is gym day" nudges).

All data is stored **on your device only** (localStorage). Nothing leaves your phone. Use **Plan → Back up my data** to export a file, and **Restore** to load it back (e.g. on a new phone).

## Install on your iPhone (recommended)
The app needs to be served over HTTPS to install. Easiest route — same as your other sites:

1. Go to **app.netlify.com → Add new site → Deploy manually**.
2. Drag the whole **`gym-tracker`** folder onto the upload area.
3. Open the Netlify URL it gives you **in Safari on your iPhone**.
4. Tap the **Share** icon → **Add to Home Screen**.
5. Launch it from your home screen — it runs full-screen and works offline in the gym.

To get reminders: open the app → **Add gym-day reminders to Calendar** → open the downloaded file → Add All to your iPhone Calendar.

## Run locally (on this Mac)
```bash
node gym-tracker/serve.js
# then open http://localhost:4173
```

## Set your schedule
First launch assumes **today = Push**. If that's wrong, go to **Plan → "What is today in your cycle?"** and pick the right session. The rolling cycle is: Push · Pull · Legs · Rest · Chest+Back · Arms · Rest.

## Files
- `index.html` · `styles.css` — shell + theme
- `data.js` — the programme (edit here to change exercises/targets)
- `app.js` — all logic (logging, charts, PRs, calendar, backup)
- `sw.js` · `manifest.webmanifest` — offline + installable
- `icons/` — app icons
- `serve.js` — local preview server
