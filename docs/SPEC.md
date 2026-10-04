# Nippon 2026 — trip app spec (v0.3)

Status: **v1 built, in testing** · wireframes v0.2 (private Claude artifact: https://claude.ai/artifact/4gTrtK6MS5cqWtsmDVaZSo).

> **This repository is public.** Never commit booking references, PINs, confirmation codes, the personal
> itinerary, travellers' details or anything about home. Those live only in the private data store (§4).

---

## 1. What the app is for

A home-screen web app for three travellers on a two-week trip in Japan, in three segments:
Tokyo Disney Resort → Tokyo city → self-drive around the Fuji Five Lakes, Odawara/Hakone and Kamakura.
All three travellers can add and edit.

Jobs, in priority order:

1. **On launch, show what's around us now** — filtered by type — with one tap to Google Maps (the place's page, or directions).
2. Keep **hard bookings, holds (double-bookings) and deadlines** in view.
3. Fill flexible days from a **pre-built database** of places instead of searching on the spot.
4. **Edit easily from an iPhone**, before and during the trip.

| Device | Viewport (CSS px) | Note |
|---|---|---|
| iPhone 16 Pro Max (main editor) | 440 × 956 | |
| iPhone 15 Pro Max | 430 × 932 | |
| iPhone 16 Pro | 402 × 874 | narrowest — every layout must fit |
| iPad Pro 9.7" (2016) | 768 × 1024 | maxes out at iPadOS 16 → **Safari 16 is the oldest engine to support**. Wi-Fi only, **no GPS**; used at night in the hotel to plan the next day |

---

## 2. Proposed decisions

### 2.1 One map with area presets — not one map per segment

- **One dataset, one map.** "Areas" are saved views: Tokyo Disney Resort · Tokyo · Fuji Five Lakes · Odawara/Hakone · Kamakura · Whole trip.
- Why: the segments overlap in space and time (Tokyo bookings fall inside the driving segment; the car is returned at Haneda;
  Disney sits next to Tokyo). Separate maps would duplicate data and force a choice of map before you can see what's near.
  (Agreed with the owner; area shortcuts to be tested in v1.)
- **Launch behaviour:** GPS available → nearest area + "Near you" list. No GPS → today's planned area. Before the trip → planning view.
  **iPad (no GPS):** opens on **Tomorrow** — next day's bookings, open meal slots, light times, and ideas measured from tonight's base.
- Each area remembers its own filters and a **default travel mode** for Directions (Disney: walk · Tokyo: transit · Fuji/Hakone/Kamakura: drive).

### 2.2 Pins — glyph first, colour second

- Every type has its **own pictogram** in a rounded-square badge (Japanese signage feel). ~32 glyphs: Lucide (ISC licence) plus custom
  ones (ramen, tsukemen, tonkatsu, nigiri, yakitori, izakaya lantern, torii, onsen, ryokan roof, Pokémon Center, card stack).
- Colour only groups **families** (food · sweets & café · drinks · konbini · see & do · shopping · Pokémon & cards · stay · transport · Disney).
- **States are drawn, not coloured:** booked = green ring + tick · held/deciding = dashed amber ring · must-do = star badge ·
  visited = faded · selected = enlarged with pointer · clusters show a count.
- User options: **Pin style** Signage (solid) / Outline / Mono · **Theme** Auto / Light / Dark · **Layout** Clean / Dense
  (Dense adds pin labels, hours, last order, price, queue notes).

### 2.3 Place card

- Name (English) · romaji · Japanese; type · area · distance; status chips (booked, open now / closes, last order, cash only, queue) when known.
- Buttons: **Google Maps** (place page) · **Directions** (area's default mode, changeable) · **Show in Japanese** (large-type name,
  address and two phrases for staff/taxis) · Call · Visited · More (edit, must-do, add to day, hide).
- **Photo & video block:** light times for that place and date (computed on device), the shot/vantage point, best time, access,
  rules (tripod/drone), video ideas, gear.
- Provenance footer: "Added by ‹person›" or "Researched by Claude · batch · n sources".

### 2.4 Manual vs researched places (provenance)

- Every place has `origin`: `manual` | `claude`. **It never changes**, even after edits.
- Researched places arrive in **batches**, land in the **Research inbox**, and reach the map only when kept. Skipped = hidden, never deleted.
- Researched entries must cite **sources**. Unknown fields stay empty and render as "[…]" — nothing is guessed.
- Editing a researched place keeps `origin: claude` and records `edited`.
- Map/list filter "Added by": Everyone · Us · Researched.

### 2.5 Bookings, holds and deadlines

- A booking links to a place and a time; status `confirmed | hold | to_cancel | cancelled`; optional `cancel_by`.
- Double-bookings share a `decision_group`. Choosing one sets the others to `to_cancel` and creates a task carrying the deadline.
- Refs and PINs are **masked by default** (tap to reveal).
- **Export to Calendar (.ics)** for bookings and cancel-by deadlines → dependable phone alerts without building push notifications.

### 2.6 Bases — distances without GPS

- Each night's accommodation is that night's **base**. Without GPS (the iPad, or location turned off) distances are measured from
  the base, or from any place the user picks ("From: ‹place› ▾").
- Meal slots know whether the base includes meals; slots not covered show as **Open**.

---

## 3. Screens (wireframes v0.2)

1 Map (launch) · 2 Map, Dense + dark · 3 Area switcher · 4 Filters · 5 Pin card, booked · 6 Pin card, photo spot (expanded) ·
7 Show in Japanese · 8 Today · 9 Trip · 10 Lists · 11 Add a place · 12 Research inbox · 13 Settings · 14 Pin styles & icon set · 15 iPad, planning tomorrow (no GPS).

Navigation: tab bar **Map · Today · Trip · Lists** on iPhone; on iPad a left rail + side list + map + floating card.

---

## 4. Stack (decided)

**No Google Cloud billing account.** Same approach as the owner's previous city-trip app, plus shared editing:

| Part | Choice | Notes |
|---|---|---|
| Base map | **Google Maps** (Maps JavaScript API) when `GOOGLE_MAPS_KEY` is set; otherwise Leaflet 1.9 + markercluster on OpenStreetMap | Google: sharp on high-DPI screens, English labels (`language=en`), dark mode via `colorScheme`; needs a browser key with billing (10,000 map loads a month free). OSM raster tiles look soft on iPhones but are cached for offline use; the app falls back to OSM when Google can't load or the key is refused. Pins are the app's own HTML on both, so they look the same. |
| Google Maps buttons | Google Maps URLs (no key) | Exact place page when a `place_id` or a pasted Google Maps link is stored; otherwise search by name + address. |
| Adding a place on the phone | Paste a Google Maps share link → confirm the pin ("I'm here" or move the map) | One extra step versus an in-app Google search. Short share links can't be resolved in the browser, so the pin is confirmed by hand. |
| Shared data | **Firebase, free plan** (Firestore + anonymous auth) | No card. Live sync across the three travellers' devices, local cache for offline. Needed because all three edit; the previous app was read-only. |
| Hosting | GitHub Pages (public repo) | Users open a web address; they never need repo access. |
| Access | Private **trip key**, entered once per device | No sign-in screens; works in home-screen mode. |
| Updates from a computer | `tools/trip_admin.py` in a Claude session | Same Firestore data over REST; trip key from the `NIPPON_TRIP_KEY` environment variable. |

Upgrade path, only if wanted later: a Google Maps API key (needs billing) would add in-app place search and exact place IDs for
researched places. Not needed for v1.

Booking data lives only in the data store, never in this repo. Front end: static PWA in plain ES modules (no build step), vendored
libraries in `vendor/`, service worker. Addresses are geocoded on the device (GSI, then Nominatim). Firestore rules template:
`firestore.rules` (the real trip key is pasted in the Firebase console, never committed).

---

## 5. Data model (draft)

```ts
type ISO = string;                    // ISO 8601 with offset, e.g. "2026-10-01T19:00+09:00"
type AreaKey = "disney" | "tokyo" | "fuji" | "hakone" | "kamakura";

interface Place {
  id: string;
  name: string;                       // English / common name
  romaji?: string;                    // Hepburn; shown only if it differs from name
  ja?: string;                        // Japanese script
  category: CategoryKey;              // glyph + family colour (§6)
  tags?: string[];                    // free tags: "late-night", "michelin", …
  meals?: ("breakfast" | "lunch" | "dinner" | "late")[];
  area: AreaKey;                      // derived from coordinates, editable
  lat: number; lng: number;
  address_ja?: string; address_en?: string;
  gmaps?: { place_id?: string; url?: string };
  near?: string;                      // locality hint for Maps search when there's no address yet
  station?: string;
  coord?: "source" | "gsi" | "osm" | "pin" | "link";  // where the pin came from
  phone?: string; website?: string;
  summary?: string;                   // one line on the card
  order?: string;                     // what to order
  notes?: string;                     // ours
  practical?: {
    hours?: string; closed?: string; last_order?: string;
    payment?: "cash" | "card" | "both"; queue?: string;
    reservation?: string; price?: string; seats?: string; rules?: string;
    as_of?: string;                   // when hours/prices were checked
  };
  photo?: { shot?: string; best_time?: string; access?: string; rules?: string; video?: string; gear?: string };
  priority?: "must" | "want" | "maybe";
  status?: "open" | "visited" | "skipped";
  planned?: { date: string; slot?: "breakfast" | "lunch" | "dinner" | "am" | "pm" | "night" };
                                      // a meal slot makes the place an *option* for that meal; several allowed
  origin: "manual" | "claude";        // never changes
  added: { by: string; at: ISO };
  edited?: { by: string; at: ISO };   // set by the place editor only
  research?: {
    batch: string; at: ISO;
    sources: { type: "S" | "G" | "T" | "P" | "M" | "K"; url: string; title?: string }[];
    confidence?: "high" | "medium" | "low";
    why?: string; notes?: string; open_questions?: string[];
    review: "pending" | "kept" | "skipped";
  };
}

interface Booking {
  id: string;
  place_id?: string;
  kind: "flight" | "hotel" | "meal" | "car" | "ticket" | "other";
  meal?: "breakfast" | "lunch" | "dinner" | "other"; // meal bookings: which meal it fills (else guessed from the time)
  start: ISO; end?: ISO;              // check-in/out, pick-up/return, departure/arrival
  status: "confirmed" | "hold" | "to_cancel" | "cancelled";
  decision_group?: string;            // double-bookings
  cancel_by?: ISO;
  ref?: string; secret?: string;      // masked in UI; never in git
  details?: string;                   // room type, car class, membership…
  party?: number;
}

interface Item {                      // itinerary entries that aren't bookings
  id: string; date: string; time?: string;
  kind: "slot" | "task" | "note" | "flexible";
  title: string;
  slot?: "breakfast" | "lunch" | "dinner";
  place_ids?: string[];               // candidates for an open slot
  done?: boolean;
}

interface ListItem {
  id: string;
  list: "eat" | "buy" | "see" | "bring" | "admin";
  title: string;
  place_ids?: string[];
  due?: string;
  done: boolean;
  research_request?: string;          // e.g. "omakase options near the hotel" → picked up in a Claude session
}

interface Area {
  key: AreaKey; name: string; ja: string;
  dates: [string, string][];          // planned date ranges (from trip data)
  bounds: [[number, number], [number, number]];
  mode: "walking" | "transit" | "driving";
  default_filters?: CategoryKey[];
}
```

Times are stored with offsets and shown in JST; flights show local time at each end.

---

## 6. Categories (v0.1)

| Family | Categories → glyph |
|---|---|
| Food | ramen → bowl + chopsticks* · tsukemen → noodles + dipping bowl* · tonkatsu → sliced cutlet* · sushi/omakase → nigiri* · yakiniku → `flame` · yakitori → skewer* · restaurant → `utensils` |
| Sweets & café | café → `coffee` · matcha → `leaf` · dessert → `ice-cream-cone` · bakery → `croissant` |
| Drinks | bar → `martini` · izakaya → lantern* |
| Everyday | konbini → `store` |
| See & do | shrine/sight → torii* · viewpoint → `mountain-snow` · photo spot → `camera` · onsen → ♨* |
| Shopping | clothing → `shirt` · shoes/insoles → `footprints` · other → `shopping-bag` |
| Pokémon & cards | Pokémon Center → ball* · card shop → card stack* |
| Stay | hotel → `bed-double` · ryokan → roof* · glamping → `tent` |
| Transport | car rental → `car-front` · fuel → `fuel` · parking → `square-parking` · station → `train-front` · airport → `plane` |
| Disney | attraction → `castle` |

`name` = Lucide icon · `*` = custom glyph. "Booked" is a state, not a category.

---

## 7. Research batches (how Claude adds places)

- File: `data/research/<batch-id>.json` — **public place information only**, listed in `data/research/index.json`.
  No trip dates, party size or other itinerary details in batch text.
- Shape: `{ "batch": "R1-savoy", "title": "…", "created": "YYYY-MM-DD", "brief": "what was asked", "notes": "batch-wide caveats",
  "places": [ Place… ] }` with `origin: "claude"`; the inbox review is stored per place in the shared `reviews` collection.
- Rules:
  - Every place cites at least one source URL; hours and prices carry `practical.as_of`.
  - Unknown → omit the field. Never infer hours, prices, rules or names.
  - Japanese name and romaji come from sources; romaji in Hepburn.
  - Coordinates must be checked against a map source; `gmaps.place_id` only when actually obtained.
    Claude Code sessions have **no Google Places lookup**, so researched places normally link by name + address; a wrong link is
    fixed by pasting the correct Google Maps link into the place.
  - Each source carries a type tag (as in the previous app): `G` Google Maps listing · `T` Tabelog · `S` official site ·
    `P` press/guides · `K` Claude's general knowledge (unverified — shown as such).
- In the app: Research inbox → Keep / Skip (or Keep all). Kept places join the map with the "Researched" label.

---

## 8. Platform notes

- **Google Maps hand-off** (no API key needed):
  - Place page: `https://www.google.com/maps/search/?api=1&query=<name, address>&query_place_id=<place_id>`
  - Directions: `https://www.google.com/maps/dir/?api=1&destination=<lat,lng>&destination_place_id=<place_id>&travelmode=<walking|transit|driving>`
    (+ `&dir_action=navigate` to start navigation at once).
  - To verify on each device: from a home-screen app these should open the Google Maps app; fallback is the `comgooglemaps://` scheme.
- **Home-screen app:** manifest `display: standalone`, `apple-mobile-web-app-capable`, status bar `black-translucent`,
  `viewport-fit=cover` with safe-area insets. No fake status bar in the UI.
- **Offline:** service worker caches the app shell and data; Firestore keeps a local cache.
- **Light times:** computed on device for the place and date. Golden = sun between −4° and +6°; blue = −6° to −4°. Flat horizon,
  so hills make real sunrise later — the card says so.
- **Type:** as in the owner's Milano app — Inter for text (400–600), Fraunces for titles, headings and place names; BIZ UDPGothic for Japanese; system fonts as fallback. Section labels in sentence case.
- **Accessibility:** 44 px minimum targets; 4.5:1 text contrast in both themes.

---

## 9. Decisions

Settled: one map with areas · glyph pins · all three travellers edit · iPad = Wi-Fi-only night planner ·
Firebase free plan · public repo on GitHub Pages · no Info/Guide tab · no figurine photo spots or dessert benchmarking ·
Google Maps base map (owner's Google Cloud project with billing, separate from Firebase), OpenStreetMap as fallback ·
bottom sheets drag between three heights; page zoom is blocked outside the maps.

Open:
1. After testing v1: area shortcuts, research inbox, default pin style, theme, layout and map style.

## 10. Lessons from the previous app (single-file Leaflet app)

Keep: free OSM map · Google Maps URLs with `query_place_id` · source tags on every place · "closed today" badges ·
category intros.
Change: colour-only teardrop pins → glyph pins · single fixed base → GPS or per-night base · read-only data → shared editing ·
dark only → light/dark/auto.

## 11. Phasing

| Step | Scope |
|---|---|
| Decide | §9 answers; booking gaps filled in privately — done except testing feedback |
| Build v1 | Map, pins, filters, near-me, cards, Google Maps hand-off, Today / Trip / Lists, add & edit, research inbox, theme/layout/pin options, offline — **done** |
| Data | Bookings into the private store; research batches (Tokyo food, Pokémon & card shops, clothing, insoles, Disney food & photo spots, Fuji/Hakone photo spots, onsen, fuel near the car return) |
| Test | Install on all four devices; GPS, Google Maps hand-off, dark mode, offline |
| Later | Push reminders, weather / Fuji visibility, expenses |
