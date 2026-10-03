// Research batches published in data/research/ (public place info only) and the inbox review flow.
import { store } from './store.js';

let cache = null;

export async function loadBatches(force = false) {
  if (cache && !force) return cache;
  try {
    const idx = await fetch('data/research/index.json', { cache: 'no-cache' }).then((r) => r.json());
    const batches = [];
    for (const b of idx.batches || []) {
      try {
        const data = await fetch('data/research/' + b.file, { cache: 'no-cache' }).then((r) => r.json());
        batches.push({ ...b, ...data });
      } catch (e) { /* skip a broken batch */ }
    }
    cache = batches;
  } catch (e) {
    cache = cache || [];
  }
  return cache;
}

export function reviewOf(id) { return store.get('reviews', id); }

export function isPending(place) {
  return !reviewOf(place.id) && !store.get('places', place.id);
}

export function pendingCount() {
  if (!cache) return 0;
  let n = 0;
  for (const b of cache) for (const p of b.places || []) if (isPending(p)) n++;
  return n;
}

export function keep(batch, raw) {
  const place = {
    ...raw,
    origin: 'claude',
    research: { ...(raw.research || {}), batch: batch.batch, at: batch.created, review: 'kept' },
  };
  store.put('places', place);
  store.put('reviews', { id: raw.id, batch: batch.batch, decision: 'kept' });
}

export function skip(batch, raw) {
  store.put('reviews', { id: raw.id, batch: batch.batch, decision: 'skipped' });
}

export function undo(raw) {
  const r = reviewOf(raw.id);
  if (!r) return;
  if (r.decision === 'kept') {
    const p = store.get('places', raw.id);
    if (p && p.origin === 'claude') store.remove('places', raw.id);
  }
  store.remove('reviews', raw.id);
}
