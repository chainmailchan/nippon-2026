// Today (and Tomorrow) view.
import { store } from '../store.js';
import { getPrefs, setFilters } from '../prefs.js';
import { MEAL_LABEL } from '../config.js';
import { icon } from '../icons.js';
import { esc, fmtDay, addDays, todayJST, daysBetween, fmtClock, hasCoords, minutesUntil, fmtIn, whenParts } from '../util.js';
import { on, badge, neutralBadge, emptyState, tag } from './core.js';
import { ui, rerender } from '../state.js';
import { dayTimeline, dayNumber, dayArea, areaByKey, tripDays, tripRange, nightBase, nextUp, mealSlots, placeStatus } from '../trip.js';
import { lightTimes } from '../sun.js';
import { openPlace } from './card.js';
import { goToArea } from './mapview.js';

const KIND_GLYPH = { checkin: 'bed', checkout: 'bed', depart: 'plane', arrive: 'plane', pickup: 'car', return: 'car', meal: 'utensils', ticket: 'ticket', other: 'calendar' };

function mask(ref) { const s = String(ref); return s.length <= 4 ? '••••' : '•'.repeat(Math.min(s.length - 4, 8)) + s.slice(-4); }

export function entryRow(e, day, { compact = false } = {}) {
  const time = e.time || (e.kind === 'plan' && e.slotLabel ? (MEAL_LABEL[e.slotLabel] || e.slotLabel) : (e.kind === 'slot' ? MEAL_LABEL[e.meal] : ''));
  const timeCls = e.time ? 'time' : 'time na';
  if (e.kind === 'slot') {
    if (e.covered) {
      return `<div class="tli"><span class="${timeCls}">${esc(MEAL_LABEL[e.meal])}</span><div class="what">${badge('restaurant', 'sm')}<div class="main"><span class="ttl">At ${esc(e.base ? e.base.name : 'the hotel')}</span><span class="t-sec">Included with the stay</span></div></div></div>`;
    }
    return `<div class="tli"><span class="${timeCls}">${esc(MEAL_LABEL[e.meal])}</span><div class="slot"><div class="vstack"><b>Open</b>${!compact ? `<span class="t-sec">${esc(e.base ? 'Near ' + e.base.name : 'Pick somewhere nearby')}</span>` : ''}</div><button type="button" class="btn sm sec" data-action="find-meal" data-meal="${e.meal}" data-day="${day}">Find</button></div></div>`;
  }
  if (e.kind === 'task') {
    const it = e.item;
    return `<div class="tli"><span class="time na">To do</span><div class="what"><button type="button" class="chk${it.done ? ' on' : ''}" data-action="toggle-item" data-id="${esc(it.id)}" aria-pressed="${!!it.done}" aria-label="Done">${icon('check')}</button><div class="main"><span class="ttl${it.done ? ' done-text' : ''}">${esc(it.title)}</span>${it.notes && !compact ? `<span class="t-sec">${esc(it.notes)}</span>` : ''}</div></div></div>`;
  }
  const b = e.booking;
  const p = e.place;
  const glyphBadge = p ? badge(p.category, 'sm') : neutralBadge(KIND_GLYPH[e.kind] || 'calendar', 'sm');
  const sub = [];
  if (e.sub) sub.push(esc(e.sub));
  if (b && b.details && !compact) sub.push(esc(b.details));
  if (b && b.ref && !compact) sub.push(`Ref <span class="masked">${esc(ui.revealed.has(b.id) ? b.ref : mask(b.ref))}</span>`);
  if (b && b.notes && !compact) sub.push(esc(b.notes));
  if (e.kind === 'plan') sub.push('Planned');
  const tags = b ? (b.status === 'to_cancel' ? '<span class="tag hold">To cancel</span>' : b.status === 'hold' ? '<span class="tag hold">Held</span>' : '') : '';
  const open = p ? `data-action="open-from-list" data-id="${esc(p.id)}"` : '';
  return `<div class="tli"><span class="${timeCls}">${esc(time || '—')}</span>
    <${p ? 'button type="button"' : 'div'} class="what${p ? ' tap' : ''}" ${open}>${glyphBadge}<span class="main"><span class="ttl">${esc(e.title)}</span>${sub.length ? `<span class="t-sec">${sub.join(' · ')}</span>` : ''}${tags ? `<span class="tags">${tags}</span>` : ''}</span></${p ? 'button' : 'div'}></div>`;
}

function lightCard(day) {
  const area = areaByKey(dayArea(day));
  const base = nightBase(day);
  const pt = base && base.place && hasCoords(base.place) ? base.place : (area ? { lat: area.center[0], lng: area.center[1] } : null);
  if (!pt) return '';
  const t = lightTimes(day, pt.lat, pt.lng);
  const tm = lightTimes(addDays(day, 1), pt.lat, pt.lng);
  const where = base && base.place ? base.place.name : (area ? area.name : '');
  return `<div class="card light-card">${icon('sunset', 'hold')}
    <div class="vstack grow"><b class="num">Golden ${fmtClock(t.goldenPM[0])}–${fmtClock(t.goldenPM[1])} · sunset ${fmtClock(t.sunset)} · blue to ${fmtClock(t.bluePM[1])}</b>
    <span class="t-sec num">Next sunrise ${fmtClock(tm.sunrise)} · golden ${fmtClock(tm.goldenAM[0])}–${fmtClock(tm.goldenAM[1])} · ${esc(where)}</span></div></div>`;
}

function nextCard(day) {
  if (day !== todayJST()) return '';
  const n = nextUp();
  if (!n) return '';
  const mins = minutesUntil(n.ms);
  if (mins > 18 * 60) return '';
  const b = n.booking;
  const pid = n.kind === 'end' && b.place_id_end ? b.place_id_end : b.place_id;
  const p = pid ? store.get('places', pid) : null;
  const what = { hotel: n.kind === 'start' ? 'Check in' : 'Check out', car: n.kind === 'start' ? 'Car pick-up' : 'Car return', flight: n.kind === 'start' ? 'Departure' : 'Arrival', meal: 'Booked meal', ticket: 'Ticket' }[b.kind] || 'Next';
  return `<div class="card hero">
    <div class="hrow"><span class="tag now">Next · ${esc(n.time)}</span><span class="t-cap">${esc(fmtIn(mins))}</span></div>
    <div class="hstack top">${p ? badge(p.category) : neutralBadge('clock')}<div class="vstack grow"><b class="big">${esc(what)}${p ? ' · ' + esc(p.name) : ''}</b>${b.details ? `<span class="t-sec">${esc(b.details)}</span>` : ''}${b.notes ? `<span class="t-sec strong">${esc(b.notes)}</span>` : ''}</div></div>
    ${p ? `<div class="hstack"><button type="button" class="btn pri" data-action="open-from-list" data-id="${esc(p.id)}">${icon('navigation', 's')}Open</button><button type="button" class="btn sec" data-action="show-ja" data-id="${esc(p.id)}">${icon('languages', 's')}Japanese</button></div>` : ''}
  </div>`;
}

export function renderToday() {
  const el = document.getElementById('view-today');
  if (!el) return;
  const days = tripDays();
  const today = todayJST();
  if (!ui.day) ui.day = days.length ? (today < days[0] ? days[0] : today > days[days.length - 1] ? days[days.length - 1] : today) : today;
  const day = ui.day;
  const dn = dayNumber(day);
  const area = areaByKey(dayArea(day));
  const r = tripRange();
  const before = r && today < r.start ? daysBetween(today, r.start) : null;
  const isTomorrow = day === addDays(today, 1);
  const label = day === today ? 'Today' : isTomorrow ? 'Tomorrow' : '';
  const tl = dayTimeline(day);
  const tomorrow = addDays(day, 1);
  const tmr = days.includes(tomorrow) ? dayTimeline(tomorrow).filter((e) => e.kind !== 'slot' || !e.covered) : [];
  const openMeals = days.includes(tomorrow) ? mealSlots(tomorrow).filter((m) => !m.coveredBy).length : 0;

  el.innerHTML = `
    <div class="head">
      <div class="vstack">
        <span class="t-over">${[label, dn ? `Day ${dn.n} of ${dn.total}` : '', area ? area.name : ''].filter(Boolean).map(esc).join(' · ') || 'Trip'}</span>
        <h1>${esc(fmtDay(day))}</h1>
      </div>
      <div class="hstack">
        <button type="button" class="iconbtn flat" data-action="day-step" data-step="-1" aria-label="Previous day">${icon('chevronLeft')}</button>
        <button type="button" class="iconbtn flat" data-action="day-step" data-step="1" aria-label="Next day">${icon('chevronRight')}</button>
        <button type="button" class="iconbtn flat" data-action="settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </div>
    <div class="scroll body">
      ${days.length ? `<div class="quickdays">
        <button type="button" class="chip plain${day === today ? ' on' : ''}" data-action="day-go" data-day="${today}">Today</button>
        <button type="button" class="chip plain${isTomorrow ? ' on' : ''}" data-action="day-go" data-day="${addDays(today, 1)}">Tomorrow</button>
        ${before !== null ? `<span class="t-sec">Trip starts in ${before} day${before === 1 ? '' : 's'}</span>` : ''}
      </div>` : ''}
      ${!days.length ? emptyState('No trip data yet', store.mode === 'local' ? 'This device has no trip loaded. Join the shared trip in Settings, or add bookings yourself.' : 'Waiting for the trip to load…', '<button type="button" class="btn sec sm" data-action="settings">Open settings</button>') : ''}
      ${nextCard(day)}
      ${lightCard(day)}
      ${tl.length ? `<div class="ghead"><span class="t-over">${esc(label || fmtDay(day))}</span><span class="t-cap">Times in local time</span></div><div class="group">${tl.map((e) => entryRow(e, day)).join('')}</div>` : (days.length ? '<div class="card t-sec">Nothing fixed — a free day. Open meals and ideas are on the map.</div>' : '')}
      ${tmr.length ? `<div class="ghead"><span class="t-over">${esc(isTomorrow ? 'The day after' : 'Tomorrow')} · ${esc(fmtDay(tomorrow))}</span>${openMeals ? `<span class="t-cap">${openMeals} open meal${openMeals > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="group">${tmr.filter((e) => e.kind !== 'slot').slice(0, 4).map((e) => entryRow(e, tomorrow, { compact: true })).join('') || '<div class="tli"><span class="time na">—</span><span class="t-sec">Nothing fixed</span></div>'}</div>` : ''}
    </div>`;
}

on('day-step', (d) => {
  const days = tripDays();
  const next = addDays(ui.day, +d.step);
  if (days.length && (next < days[0] || next > days[days.length - 1])) return;
  ui.day = next; rerender('*');
});
on('day-go', (d) => { ui.day = d.day; rerender('*'); });
on('toggle-item', (d) => { const it = store.get('lists', d.id); if (it) store.patch('lists', d.id, { done: !it.done }); });
on('open-from-list', (d) => { ui.selected = d.id; if (!ui.wide) document.dispatchEvent(new CustomEvent('tab', { detail: 'map' })); openPlace(d.id); });
on('find-meal', (d) => {
  setFilters({ chips: ['meal'], meal: d.meal });
  const k = dayArea(d.day);
  document.dispatchEvent(new CustomEvent('tab', { detail: 'map' }));
  ui.sheet = 'full';
  goToArea(k || ui.area);
});
