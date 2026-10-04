// Derived trip logic: days, nightly bases, areas, meal slots, timelines.
import { store } from './store.js';
import { AREAS, MEALS, MEAL_LABEL, MEAL_TIME, CATEGORIES } from './config.js';
import { whenParts, addDays, todayJST, daysBetween, hasCoords } from './util.js';

const STAY = new Set(['hotel', 'ryokan', 'glamping']);

export function areaOf(p) {
  if (!p) return null;
  if (p.area) return p.area;
  if (!hasCoords(p)) return null;
  for (const a of AREAS) {
    const [s, w, n, e] = a.bbox;
    if (p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e) return a.key;
  }
  return 'other';
}

export function areaByKey(k) { return AREAS.find((a) => a.key === k) || null; }

export function activeBookings() {
  return store.all('bookings').filter((b) => b.status !== 'cancelled');
}

export function bookingsForPlace(pid) {
  return activeBookings().filter((b) => b.place_id === pid || b.place_id_end === pid);
}

// Status used by pins and cards.
export function placeStatus(p) {
  const bs = bookingsForPlace(p.id);
  return {
    booked: bs.some((b) => b.status === 'confirmed'),
    hold: bs.some((b) => b.status === 'hold'),
    toCancel: bs.some((b) => b.status === 'to_cancel') && !bs.some((b) => b.status === 'confirmed'),
    must: p.priority === 'must',
    visited: p.status === 'visited',
    bookings: bs,
  };
}

export function tripRange() {
  const m = store.meta || {};
  if (m.start && m.end) return { start: m.start, end: m.end, day1: m.day1 || m.start };
  const dates = [];
  for (const b of activeBookings()) {
    if (b.start) dates.push(b.start.slice(0, 10));
    if (b.end) dates.push(b.end.slice(0, 10));
  }
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1], day1: dates[0] };
}

export function tripDays() {
  const r = tripRange();
  if (!r) return [];
  const out = [];
  for (let d = r.start; d <= r.end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayNumber(day) {
  const r = tripRange();
  if (!r) return null;
  const n = daysBetween(r.day1, day) + 1;
  const total = daysBetween(r.day1, r.end) + 1;
  return n >= 1 && n <= total ? { n, total } : null;
}

// Hotel for the night that starts on `day`.
export function nightBase(day) {
  for (const b of activeBookings()) {
    if (b.kind !== 'hotel' || b.status !== 'confirmed' || !b.start || !b.end) continue;
    const s = b.start.slice(0, 10), e = b.end.slice(0, 10);
    if (s <= day && day < e) return { booking: b, place: store.get('places', b.place_id) };
  }
  return null;
}

export function dayArea(day) {
  const tonight = nightBase(day);
  if (tonight && tonight.place) return areaOf(tonight.place);
  const lastNight = nightBase(addDays(day, -1));
  if (lastNight && lastNight.place) return areaOf(lastNight.place);
  return null;
}

// Keep a day inside the trip (before the trip → first day, after → last day).
export function clampDay(day) {
  const days = tripDays();
  if (!days.length) return day || todayJST();
  if (!day || day < days[0]) return days[0];
  if (day > days[days.length - 1]) return days[days.length - 1];
  return day;
}

// The day the app should open on: today during the trip, else the first day.
export function focusDay() {
  const t = todayJST();
  const days = tripDays();
  if (!days.length) return t;
  if (t < days[0]) return days[0];
  if (t > days[days.length - 1]) return days[days.length - 1];
  return t;
}

function placeName(id) { const p = id && store.get('places', id); return p ? p.name : ''; }

function mealFromTime(time) {
  if (!time) return null;
  if (time < '10:30') return 'breakfast';
  if (time < '15:30') return 'lunch';
  return 'dinner';
}

// Which meal a meal booking is for: the traveller's choice in the booking, else guessed from its time.
// 'other' (drinks, a snack) fills no meal slot.
export function bookingMeal(b) {
  if (b.meal === 'other') return null;
  if (MEALS.includes(b.meal)) return b.meal;
  return mealFromTime(whenParts(b.start).time);
}

// Timeline entries for a day: bookings, planned places, tasks, and meal slots.
export function dayTimeline(day) {
  const out = [];
  const push = (e) => out.push(e);
  for (const b of activeBookings()) {
    const s = whenParts(b.start), e = whenParts(b.end);
    const place = b.place_id ? store.get('places', b.place_id) : null;
    const placeEnd = b.place_id_end ? store.get('places', b.place_id_end) : place;
    if (b.kind === 'hotel') {
      if (s.date === day) push({ kind: 'checkin', time: s.time, sort: s.time || '15:00', title: `Check in · ${placeName(b.place_id) || b.title}`, booking: b, place });
      if (e.date === day) push({ kind: 'checkout', time: e.time, sort: e.time || '10:00', title: `Check out · ${placeName(b.place_id) || b.title}`, booking: b, place });
    } else if (b.kind === 'flight') {
      if (s.date === day) push({ kind: 'depart', time: s.time, sort: s.time || '12:00', title: b.title || 'Flight', sub: 'Departs (local time)', booking: b, place });
      if (e.date === day) push({ kind: 'arrive', time: e.time, sort: e.time || '12:00', title: `Arrive · ${placeEnd ? placeEnd.name : ''}`.trim(), sub: b.title, booking: b, place: placeEnd });
    } else if (b.kind === 'car') {
      if (s.date === day) push({ kind: 'pickup', time: s.time, sort: s.time || '09:00', title: `Car pick-up · ${placeName(b.place_id)}`, booking: b, place });
      if (e.date === day) push({ kind: 'return', time: e.time, sort: e.time || '17:00', title: `Car return · ${placeName(b.place_id_end)}`, sub: e.time ? `By ${e.time}` : '', booking: b, place: placeEnd });
    } else if (b.kind === 'meal') {
      const m = bookingMeal(b);
      if (s.date === day) push({ kind: 'meal', meal: m, time: s.time, sort: s.time || (m ? MEAL_TIME[m] : '12:00'), title: `${MEAL_LABEL[m] || 'Meal'} · ${placeName(b.place_id) || b.title}`, booking: b, place });
    } else {
      if (s.date === day) push({ kind: b.kind || 'other', time: s.time, sort: s.time || '09:00', title: b.title || placeName(b.place_id), booking: b, place });
    }
  }
  // Places added to a meal are options for it (several allowed); other plans are just "planned".
  for (const p of store.all('places')) {
    if (p.planned && p.planned.date === day && p.status !== 'skipped') {
      const slot = p.planned.slot || '';
      const meal = MEALS.includes(slot) ? slot : null;
      const sortBy = meal ? MEAL_TIME[meal] + '~' : { am: '10:00', pm: '15:00', night: '21:00' }[slot] || '13:00';
      push({ kind: 'plan', meal, option: !!meal, time: null, slotLabel: slot, sort: sortBy, title: p.name, place: p });
    }
  }
  for (const it of store.all('lists')) {
    if (it.due === day) push({ kind: 'task', time: null, sort: '07:00', title: it.title, item: it });
  }
  for (const m of mealSlots(day)) {
    if (m.coveredBy !== 'booking') push({ kind: 'slot', meal: m.meal, sort: MEAL_TIME[m.meal], time: null, covered: m.coveredBy === 'base', options: m.options, base: m.base, title: MEAL_LABEL[m.meal] });
  }
  out.sort((a, b) => (a.sort || '').localeCompare(b.sort || ''));
  return out;
}

// Which meals are covered on `day`: 'base' (the hotel's), 'booking', 'options' (places added to the meal,
// nothing booked yet), 'travel' (flight), or null (open). `options` counts the places added to each meal.
export function mealSlots(day) {
  const r = tripRange();
  if (!r || day < r.day1 || day > r.end) return [];
  const lastNight = nightBase(addDays(day, -1));
  const tonight = nightBase(day);
  const covered = { breakfast: null, lunch: null, dinner: null };
  const bases = { breakfast: lastNight, dinner: tonight };
  if (lastNight && (lastNight.booking.meals_included || []).includes('breakfast')) covered.breakfast = 'base';
  if (tonight && (tonight.booking.meals_included || []).includes('dinner')) covered.dinner = 'base';
  for (const b of activeBookings()) {
    if (b.kind !== 'meal') continue;
    if (whenParts(b.start).date === day) { const m = bookingMeal(b); if (m && !covered[m]) covered[m] = 'booking'; }
  }
  const options = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const p of store.all('places')) {
    if (p.planned && p.planned.date === day && p.status !== 'skipped' && MEALS.includes(p.planned.slot)) {
      options[p.planned.slot]++;
      if (!covered[p.planned.slot]) covered[p.planned.slot] = 'options';
    }
  }
  // Flight days: no breakfast slot on the arrival morning, no dinner slot on the departure evening.
  for (const b of activeBookings()) {
    if (b.kind !== 'flight') continue;
    if (whenParts(b.end).date === day && whenParts(b.end).time && whenParts(b.end).time > '06:00') covered.breakfast = covered.breakfast || 'travel';
    if (whenParts(b.start).date === day && whenParts(b.start).time && whenParts(b.start).time >= '18:00') covered.dinner = covered.dinner || 'travel';
  }
  return MEALS.map((meal) => ({ meal, coveredBy: covered[meal], options: options[meal], base: bases[meal] ? bases[meal].place : null }))
    .filter((m) => m.coveredBy !== 'travel');
}

// Next timed event from now (during the trip), for the "Next" card.
export function nextUp(now = Date.now()) {
  const evs = [];
  for (const b of activeBookings()) {
    for (const [w, kind] of [[b.start, 'start'], [b.end, 'end']]) {
      const p = whenParts(w);
      if (!p.time || p.ms < now) continue;
      if (b.kind === 'hotel' && kind === 'end' && !p.time) continue;
      evs.push({ ms: p.ms, booking: b, kind, date: p.date, time: p.time });
    }
  }
  evs.sort((a, b) => a.ms - b.ms);
  return evs[0] || null;
}

export function isStayCategory(cat) { return STAY.has(cat); }
export function catOf(p) { return CATEGORIES[p && p.category] || CATEGORIES.restaurant; }
