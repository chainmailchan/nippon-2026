# Nippon 2026 — trip app spec (v0.1, draft)

Status: **planning** · wireframes v0.1 (private Claude artifact: https://claude.ai/artifact/4gTrtK6MS5cqWtsmDVaZSo) · no app code yet.

> **This repository is public.** Never commit booking references, PINs, confirmation codes, the personal
> itinerary, travellers' details or anything about home. Those live only in the private data store (§4).

---

## 1. What the app is for

A home-screen web app for three travellers on a two-week trip in Japan, in three segments:
Tokyo Disney Resort → Tokyo city → self-drive around the Fuji Five Lakes and Odawara/Hakone (ending back in Tokyo).

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
| iPad Pro 9.7" (2016) | 768 × 1024 | maxes out at iPadOS 16 → **Safari 16 is the oldest engine to support** |

---

## 2. Proposed decisions

### 2.1 One map with area presets — not one map per segment

- **One dataset, one map.** "Areas" are saved views: Tokyo Disney Resort · Tokyo · Fuji Five Lakes · Odawara/Hakone · Whole trip.
- Why: the segments overlap in space and time (Tokyo bookings fall inside the driving segment; the car is returned at Haneda;
  Disney sits next to Tokyo). Separate maps would duplicate data and force a choice of map before you can see what's near.
- **Launch behaviour:** GPS available → nearest area + "Near you" list. No GPS → today's planned area. Before the trip → planning view.
- Each area remembers its own filters and a **default travel mode** for Directions (Disney: walk · Tokyo: transit · Fuji/Hakone: drive).

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

---

## 3. Screens (wireframes v0.1)

1 Map (launch) · 2 Map, Dense + dark · 3 Area switcher · 4 Filters · 5 Pin card, booked · 6 Pin card, photo spot (expanded) ·
7 Show in Japanese · 8 Today · 9 Trip · 10 Lists · 11 Add a place · 12 Research inbox · 13 Settings · 14 Pin styles & icon set · 15 iPad landscape.

Navigation: tab bar **Map · Today · Trip · Lists** on iPhone; on iPad a left rail + side list + map + floating card.

---

## 4. Stack (decision pending — see §9)

| | **A. Google + Firebase** (recommended) | **B. No billing account** |
|---|---|---|
| Base map | Google Maps JS (English labels, light/dark) | MapLibre + OpenStreetMap-based tiles, own light/dark style |
| Add a place | Search Google places → exact place, coords, address | Paste a Google Maps link · "I'm here" · drop a pin |
| "Google Maps" button | Opens the exact place page (place ID) | Searches name + address (usually right; check key ones) |
| Data & sync | Firestore — live across 3 devices, offline cache | Firestore (free plan) |
| Account needs | Google Cloud project **with billing**; usage expected inside Google's per-SKU free monthly caps; budget alert + quotas set | Firebase free plan only |

Common to both: static PWA (Vite + TypeScript + Preact), service worker for offline, hosted on **Firebase Hosting** (works with a
private repo) or GitHub Pages (public repo only). Access by a **private trip key** entered once per device — no sign-in screens,
works in home-screen mode. Booking data lives only in the data store, never in this repo.

---

## 5. Data model (draft)

```ts
type ISO = string;                    // ISO 8601 with offset, e.g. "2026-10-01T19:00+09:00"
type AreaKey = "disney" | "tokyo" | "fuji" | "hakone";

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
  phone?: string; website?: string;
  summary?: string;                   // one line on the card
  notes?: string;                     // ours
  practical?: {
    hours?: string; closed?: string; last_order?: string;
    payment?: "cash" | "card" | "both"; queue?: string;
    reservation?: "required" | "recommended" | "walk-in"; price?: string;
    as_of?: string;                   // when hours/prices were checked
  };
  photo?: { shot?: string; best_time?: string; access?: string; rules?: string; video?: string; gear?: string };
  priority?: "must" | "want" | "maybe";
  status?: "open" | "visited" | "skipped";
  planned?: { date: string; slot?: "breakfast" | "lunch" | "dinner" | "am" | "pm" | "night" };
  origin: "manual" | "claude";        // never changes
  added: { by: string; at: ISO };
  edited?: { by: string; at: ISO };
  research?: {
    batch: string; at: ISO; sources: string[];
    confidence?: "high" | "medium" | "low";
    review: "pending" | "kept" | "skipped";
  };
}

interface Booking {
  id: string;
  place_id?: string;
  kind: "flight" | "hotel" | "meal" | "car" | "ticket" | "other";
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

- File: `data/research/<batch-id>.json` — **public place information only**.
- Shape: `{ "batch": "R1-tokyo-tsukemen", "created": ISO, "brief": "what was asked", "places": [ Place… ] }`
  with `origin: "claude"` and `research.review: "pending"`.
- Rules:
  - Every place cites at least one source URL; hours and prices carry `practical.as_of`.
  - Unknown → omit the field. Never infer hours, prices, rules or names.
  - Japanese name and romaji come from sources; romaji in Hepburn.
  - Coordinates must be checked against a map source; `gmaps.place_id` only when actually obtained.
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
- **Type:** Atkinson Hyperlegible (Latin) + BIZ UDPGothic (Japanese), both legibility-focused; system fonts as fallback.
- **Accessibility:** 44 px minimum targets; 4.5:1 text contrast in both themes.

---

## 9. Open decisions

1. Stack A or B (§4).
2. Who edits — one editor or all three travellers?
3. Repo visibility — make private? (Then hosting moves to Firebase Hosting; GitHub Pages needs a public repo on the free plan.)
4. iPad: cellular (has GPS) or Wi-Fi only; used in the car or mainly for planning?
5. After review: default pin style, theme and layout.

## 10. Phasing

| Step | Scope |
|---|---|
| Decide | §9 answers; booking gaps filled in privately |
| Build v1 | Map, pins, filters, near-me, cards, Google Maps hand-off, Today / Trip / Lists, add & edit, research inbox, theme/layout/pin options, offline |
| Data | Bookings into the private store; research batches (Tokyo food, Pokémon & card shops, clothing, insoles, Disney food & photo spots, Fuji/Hakone photo spots, onsen, fuel near the car return) |
| Test | Install on all four devices; GPS, Google Maps hand-off, dark mode, offline |
| Later | Push reminders, weather / Fuji visibility, expenses |
