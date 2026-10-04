// Trip view: every day, grouped by area.
import { store } from '../store.js';
import { AREA_ORDER, MEAL_LABEL } from '../config.js';
import { icon } from '../icons.js';
import { esc, fmtDay, fmtDayShort, whenParts, download, todayJST } from '../util.js';
import { on, emptyState, patch } from './core.js';
import { ui, rerender } from '../state.js';
import { tripDays, dayArea, areaByKey, dayNumber, dayTimeline, mealSlots, activeBookings, tripRange } from '../trip.js';
import { entryRow } from './today.js';

let filter = 'all';
let drawn = null; // the filter on screen: a new one starts at the top

export function renderTrip() {
  const el = document.getElementById('view-trip');
  if (!el) return;
  const days = tripDays();
  const r = tripRange();
  const toCancel = activeBookings().filter((b) => b.status === 'to_cancel');
  const holds = activeBookings().filter((b) => b.status === 'hold');
  const openMeals = days.reduce((n, d) => n + mealSlots(d).filter((m) => !m.coveredBy).length, 0);
  const areasUsed = AREA_ORDER.filter((k) => days.some((d) => dayArea(d) === k));
  let lastArea = null;
  const today = todayJST();

  const dayBlocks = days.filter((d) => filter === 'all' || dayArea(d) === filter).map((d) => {
    const k = dayArea(d);
    const a = areaByKey(k);
    const head = k !== lastArea && a ? `<div class="seghead"><b>${esc(a.name)}</b><span class="bar"></span></div>` : '';
    lastArea = k;
    const dn = dayNumber(d);
    const tl = dayTimeline(d).filter((e) => e.kind !== 'slot');
    const open = mealSlots(d).filter((m) => !m.coveredBy).map((m) => m.meal);
    return `${head}<div class="dayhead${d === today ? ' is-today' : ''}"><b>${esc(fmtDay(d))}</b><span>${dn ? 'Day ' + dn.n : ''}${d === today ? ' · today' : ''}</span></div>
      <div class="group">${tl.map((e) => entryRow(e, d, { compact: true })).join('')}
      ${open.length ? `<div class="tli"><span class="time na">Open</span><div class="chips wrap">${open.map((m) => `<button type="button" class="chip plain small" data-action="find-meal" data-meal="${m}" data-day="${d}">${esc(MEAL_LABEL[m])}</button>`).join('')}</div></div>` : ''}
      ${!tl.length && !open.length ? '<div class="tli"><span class="time na">—</span><span class="t-sec">Free</span></div>' : ''}</div>`;
  }).join('');

  const settle = [];
  if (toCancel.length) settle.push(`cancel ${toCancel.map((b) => esc(b.title)).join(', ')}`);
  if (holds.length) settle.push(`${holds.length} held booking${holds.length > 1 ? 's' : ''} to decide`);
  if (openMeals) settle.push(`${openMeals} open meals`);

  patch(el, `
    <div class="head">
      <div class="vstack"><h1>Trip</h1><span class="sub">${r ? esc(`${fmtDayShort(r.start)} – ${fmtDayShort(r.end)}`) : 'No dates yet'}</span></div>
      <div class="hstack">
        <button type="button" class="iconbtn flat" data-action="new-booking" aria-label="Add a booking">${icon('plus')}</button>
        <button type="button" class="iconbtn flat" data-action="ics" aria-label="Add bookings to Calendar">${icon('calendarPlus')}</button>
      </div>
    </div>
    ${areasUsed.length > 1 ? `<div class="chips trip-areas" role="toolbar" aria-label="Show area">${[['all', 'All'], ...areasUsed.map((k) => [k, areaByKey(k).short])].map(([k, l]) => `<button type="button" class="chip plain${filter === k ? ' on' : ''}" data-action="trip-filter" data-value="${k}" aria-pressed="${filter === k}">${esc(l)}</button>`).join('')}</div>` : ''}
    <div class="scroll body">
      ${settle.length ? `<div class="banner">${icon('hourglass')}<span><b>To settle:</b> ${settle.join(' · ')}</span></div>` : ''}
      ${days.length ? dayBlocks : emptyState('No bookings yet', 'Bookings you add appear here day by day.', '<button type="button" class="btn sec sm" data-action="new-booking">Add a booking</button>')}
    </div>`);
  if (drawn !== filter) { drawn = filter; el.querySelector('.scroll.body').scrollTop = 0; }
}

on('trip-filter', (d) => { filter = d.value; renderTrip(); });

// Calendar export: bookings and free-cancellation deadlines.
on('ics', () => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//nippon-2026//trip//EN', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const fmtUTC = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const txt = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  for (const b of activeBookings()) {
    const s = whenParts(b.start), e = whenParts(b.end);
    const place = b.place_id ? store.get('places', b.place_id) : null;
    lines.push('BEGIN:VEVENT', `UID:${b.id}@nippon-2026`, `DTSTAMP:${stamp}`, `SUMMARY:${txt((b.status === 'to_cancel' ? 'CANCEL? ' : '') + (b.title || 'Booking'))}`);
    if (s.time) {
      lines.push(`DTSTART:${fmtUTC(s.ms)}`);
      lines.push(`DTEND:${fmtUTC(e.time && b.kind !== 'hotel' ? e.ms : s.ms + 3600000)}`);
    } else if (s.date) {
      lines.push(`DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`);
    }
    if (place) lines.push(`LOCATION:${txt([place.name, place.address_en || place.address_ja].filter(Boolean).join(', '))}`);
    if (b.details) lines.push(`DESCRIPTION:${txt(b.details)}`);
    lines.push('END:VEVENT');
    if (b.cancel_by) {
      lines.push('BEGIN:VEVENT', `UID:${b.id}-cancel@nippon-2026`, `DTSTAMP:${stamp}`, `SUMMARY:${txt('Last day to cancel: ' + (b.title || 'booking'))}`,
        `DTSTART;VALUE=DATE:${b.cancel_by.replace(/-/g, '')}`, 'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${txt('Cancel-by deadline')}`, 'END:VALARM', 'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  download('nippon-2026.ics', lines.join('\r\n'), 'text/calendar');
});
