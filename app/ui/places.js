// Shared place helpers: filters, distance reference, list rows.
import { store } from '../store.js';
import { getPrefs } from '../prefs.js';
import { CHIPS, CATEGORIES, AREAS } from '../config.js';
import { position } from '../geo.js';
import { nightBase, focusDay, placeStatus, catOf, areaOf } from '../trip.js';
import { distKm, fmtDist, hasCoords, esc, closedToday, todayJST, whenParts, fmtDay } from '../util.js';
import { icon } from '../icons.js';
import { badge } from './core.js';
import { ui } from '../state.js';

export function refPoint() {
  const pos = position();
  if (pos) return { lat: pos.lat, lng: pos.lng, label: 'you', kind: 'gps' };
  const base = nightBase(ui.day || focusDay());
  if (base && base.place && hasCoords(base.place)) return { lat: base.place.lat, lng: base.place.lng, label: base.place.name, kind: 'base' };
  if (ui.map) { const c = ui.map.center(); return { lat: c.lat, lng: c.lng, label: 'the map centre', kind: 'map' }; }
  return null;
}

function textOf(p) {
  const c = CATEGORIES[p.category];
  return [p.name, p.romaji, p.ja, (p.tags || []).join(' '), c && c.label, p.address_en, p.address_ja, p.near, p.station, p.summary, p.order]
    .filter(Boolean).join(' ').toLowerCase();
}

export function matches(p, f, q) {
  if (p.status === 'skipped' && !f.showHidden) return false;
  const prefs = getPrefs();
  if (!prefs.showResearched && p.origin === 'claude') return false;
  if (q) return textOf(p).includes(q.toLowerCase());
  const cat = catOf(p);
  if (f.chips && f.chips.length) {
    const ok = f.chips.some((k) => {
      const chip = CHIPS.find((c) => c.key === k);
      if (!chip) return false;
      return chip.cats ? chip.cats.includes(p.category) : chip.fam === cat.fam;
    });
    if (!ok) return false;
  }
  const st = placeStatus(p);
  if (f.bookedOnly && !(st.booked || st.hold)) return false;
  if (f.mustOnly && !st.must) return false;
  if (f.hideVisited && st.visited) return false;
  if (f.source === 'us' && p.origin === 'claude') return false;
  if (f.source === 'claude' && p.origin !== 'claude') return false;
  if (f.meal) {
    if (p.meals && p.meals.length) { if (!p.meals.includes(f.meal)) return false; }
    else if (cat.fam !== 'meal') return false;
  }
  return true;
}

export function visiblePlaces() {
  const f = getPrefs().filters;
  const all = store.all('places');
  if (ui.focus && !ui.query.trim()) {
    if (ui.focus.ids) return all.filter((p) => ui.focus.ids.includes(p.id));
    if (ui.focus.cat) return all.filter((p) => p.category === ui.focus.cat && (p.status !== 'skipped' || f.showHidden));
  }
  return all.filter((p) => matches(p, f, ui.query.trim()));
}

export function sortByDistance(list, ref) {
  return list.map((p) => ({ p, d: ref && hasCoords(p) ? distKm(ref, p) : null }))
    .sort((a, b) => (a.d === null) - (b.d === null) || (a.d || 0) - (b.d || 0));
}

export function areaLabel(p) {
  const k = areaOf(p);
  const a = AREAS.find((x) => x.key === k);
  return a ? a.name : '';
}

export function statusTags(p, day = todayJST()) {
  const st = placeStatus(p);
  const out = [];
  if (st.booked) out.push(`<span class="tag ok">${icon('check')}Booked</span>`);
  else if (st.hold) out.push('<span class="tag hold">Held</span>');
  else if (st.toCancel) out.push('<span class="tag hold">To cancel</span>');
  if (st.must && !st.booked) out.push(`<span class="tag now">${icon('star')}Must</span>`);
  if (closedToday(p, day)) out.push('<span class="tag dash">Closed today?</span>');
  return out.join('');
}

export function bookingLine(p) {
  const st = placeStatus(p);
  const b = st.bookings.find((x) => x.status === 'confirmed') || st.bookings[0];
  if (!b) return '';
  const s = whenParts(b.start);
  if (!s.date) return '';
  return `${fmtDay(s.date)}${s.time ? ' · ' + s.time : ''}`;
}

export function placeRow(p, d, { action = 'open-place', extraEnd = '' } = {}) {
  const cat = catOf(p);
  const prefs = getPrefs();
  const booking = bookingLine(p);
  const metaBits = [cat.label];
  if (booking) metaBits.push(booking);
  if (p.ja) metaBits.push(`<span class="jp">${esc(p.ja)}</span>`);
  if (prefs.density === 'dense' && p.practical && p.practical.hours) metaBits.push(esc(p.practical.hours));
  if (!hasCoords(p)) metaBits.push('no pin yet');
  return `<button type="button" class="row" data-action="${action}" data-id="${esc(p.id)}">
    ${badge(p.category)}
    <span class="main"><span class="name">${esc(p.name)}</span><span class="meta">${metaBits.join(' · ')}</span></span>
    <span class="end">${statusTags(p)}${d !== null && d !== undefined ? `<span class="dist">${fmtDist(d)}</span>` : ''}${extraEnd}</span>
  </button>`;
}
