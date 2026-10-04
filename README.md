# nippon-2026

Home-screen trip companion for a Japan trip: one map of places, bookings and day plans, with one-tap hand-off to Google Maps.
Design and data model: [`docs/SPEC.md`](docs/SPEC.md).

**This repo is public.** Bookings and the itinerary live only in the private Firestore database, never here.

## Run it

Static files, no build step. Locally: `python3 -m http.server` in the repo root, then open http://localhost:8000.
Hosted: GitHub Pages from the repo root. On an iPhone or iPad, open the page in Safari › Share › Add to Home Screen.

Without sync set up, "Try on this device only" keeps everything in the browser on that device.

## Shared sync (Firebase, free plan)

1. Create a Firebase project. Add **Firestore** (location `asia-northeast1`) and enable **Anonymous** sign-in under Authentication.
2. Add a web app and paste its config into `FIREBASE_CONFIG` in `app/config.js` (it isn't secret; the rules guard the data).
3. Paste `firestore.rules` into Firestore › Rules, replacing `REPLACE_WITH_TRIP_KEY` with your trip key. Don't commit the key.
4. Each traveller opens the app once and types their name and the trip key.

## Google Maps (optional)

Without a key the app uses OpenStreetMap. To switch to Google Maps (sharper on iPhones, English labels):

1. In Google Cloud, use a project **other than the Firebase one** (billing on the Firebase project would move it off the free plan),
   link a billing account, and enable **Maps JavaScript API**. Google gives 10,000 map loads a month free.
2. Create an API key. Restrict it to websites `https://chainmailchan.github.io/*` and to the Maps JavaScript API only.
   Optionally cap map loads per day under Quotas and add a budget alert.
3. Put the key in `GOOGLE_MAPS_KEY` in `app/config.js`. It is visible in the page by design; the restrictions protect it.

## Updating from a computer

Ask Claude in a Claude Code session to add or change places, bookings or list items. It uses `tools/trip_admin.py`,
which reads the trip key from the `NIPPON_TRIP_KEY` environment variable. Editing on the phones and iPad is unchanged.

## Research batches

Places researched by Claude are published in `data/research/` (public information only, with sources) and reviewed in the
app's Research inbox before they reach the map. See SPEC §7.

## Licences

Map data © OpenStreetMap contributors. Vendored libraries: see [`vendor/LICENSES.md`](vendor/LICENSES.md).
