# Notes for Claude sessions

- Read `docs/SPEC.md` first. Wireframes live in a private Claude artifact linked at the top of the spec.
- **This repo is public.** Never commit booking references, PINs, confirmation codes, the personal itinerary,
  travellers' details or anything about the owner's home. Those belong in the private data store only.
- **Don't invent facts.** Unknown values stay empty (the UI shows "[…]"); ask the owner when a fact is theirs to give.
- Researched places follow `docs/SPEC.md` §7: sources on every place, `origin: "claude"`, reviewed in the app's Research inbox.
- Target devices: iPhone 15 Pro Max, iPhone 16 Pro Max, iPhone 16 Pro, iPad Pro 9.7" (iPadOS 16 → Safari 16 baseline).

## Updating the shared trip from a session

- The owner may ask for places, bookings or list items to be added or changed from a chat. Use `tools/trip_admin.py`
  (same Firestore data the app uses). Phone and iPad entry in the app stays as it is.
- The trip key comes from the `NIPPON_TRIP_KEY` environment variable, set in the cloud environment's settings. Never print it,
  commit it or ask for it in chat; if it's missing, ask the owner to add that variable.
- Write any JSON you prepare to the scratchpad, never into the repo. Check field shapes against `docs/SPEC.md` §5.
- Places the owner names go in directly with `origin: "manual"` (cite looked-up facts in `research.sources`).
  Places Claude proposes go through a research batch and the inbox instead.
