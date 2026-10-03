// Editors: place, booking, list item.
import { store } from '../store.js';
import { getPrefs, effectiveTheme } from '../prefs.js';
import { CATEGORIES, LISTS, MEAL_LABEL } from '../config.js';
import { icon } from '../icons.js';
import { esc, uid, slugify, coordsFromMapsUrl, hasCoords, whenParts } from '../util.js';
import { on, openPanel, closePanel, setAfterPaint, toast, badge, seg } from './core.js';
import { ui, rerender } from '../state.js';
import { pickerMap } from '../map.js';
import { geocode, locateOnce, position } from '../geo.js';

// ======================= place =======================
let draft = null;
let picker = null;

export function openEditPlace(id) {
  const p = id ? store.get('places', id) : null;
  const start = p && hasCoords(p) ? { lat: p.lat, lng: p.lng } : (position() || (ui.map ? ui.map.center() : null));
  draft = p ? JSON.parse(JSON.stringify(p)) : { id: '', name: '', category: 'restaurant', meals: [], priority: 'want', origin: 'manual', practical: {}, photo: {}, gmaps: {} };
  draft.practical = draft.practical || {}; draft.photo = draft.photo || {}; draft.gmaps = draft.gmaps || {};
  draft._lat = start ? start.lat : null; draft._lng = start ? start.lng : null;
  draft._coordSet = !!(p && hasCoords(p));
  openPanel('edit-place', placeForm, { kind: 'full', keepOnRefresh: true, onClose: () => { if (picker) { picker.remove(); picker = null; } } });
  setAfterPaint('edit-place', mountPicker);
}

function field(label, name, value, { type = 'text', ph = '', cls = '', area = false } = {}) {
  const v = esc(value || '');
  return `<div class="field"><label for="f-${name}">${esc(label)}</label>${area
    ? `<textarea id="f-${name}" name="${name}" placeholder="${esc(ph)}" class="${cls}">${v}</textarea>`
    : `<input id="f-${name}" name="${name}" type="${type}" value="${v}" placeholder="${esc(ph)}" class="${cls}" autocomplete="off">`}</div>`;
}

function placeForm() {
  const d = draft;
  const isNew = !d.id;
  const cats = Object.entries(CATEGORIES).map(([k, c]) => `<button type="button" class="cat${d.category === k ? ' on' : ''}" data-action="draft-cat" data-value="${k}">${badge(k, 'sm')}${esc(c.label)}</button>`).join('');
  return `<div class="navbar"><button type="button" class="txtbtn mut" data-action="close-panel" data-id="edit-place">Cancel</button><div class="ttl">${isNew ? 'New place' : 'Edit place'}</div><button type="button" class="txtbtn" data-action="save-place">Save</button></div>
  <div class="scroll form">
    ${field('Name', 'name', d.name, { ph: 'English or romaji name' })}
    <div class="field"><label>Where</label>
      <div class="srcbtns">
        <button type="button" data-action="draft-here">${icon('locate')}I'm here</button>
        <button type="button" data-action="draft-geocode">${icon('search')}From address</button>
        <button type="button" data-action="draft-link">${icon('link')}From link</button>
      </div>
      <div class="minimap"><div id="picker"></div><div class="cross">${icon('pin', 'l')}</div></div>
      <p class="t-cap" id="coordline">${d._coordSet ? 'Pin set — drag the map to adjust' : 'Drag the map so the pin sits on the place, or use a button above.'}</p>
    </div>
    ${field('Google Maps link', 'gmurl', d.gmaps.url, { ph: 'Paste from Google Maps › Share' })}
    <div class="two">${field('Romaji', 'romaji', d.romaji, { ph: 'Optional' })}${field('日本語', 'ja', d.ja, { ph: '任意', cls: 'jpf' })}</div>
    ${field('Address', 'address_en', d.address_en)}
    ${field('住所', 'address_ja', d.address_ja, { cls: 'jpf' })}
    <div class="field"><label>Type</label></div>
    <div class="catgrid">${cats}</div>
    <div class="field"><label>Meals</label><div class="chips wrap">${['breakfast', 'lunch', 'dinner', 'late'].map((m) => `<button type="button" class="chip plain${(d.meals || []).includes(m) ? ' on' : ''}" data-action="draft-meal" data-value="${m}">${esc(MEAL_LABEL[m])}</button>`).join('')}</div></div>
    <div class="field"><label>Priority</label>${seg('Priority', [['must', 'Must'], ['want', 'Want'], ['maybe', 'Maybe']], d.priority || 'want', 'draft-priority')}</div>
    ${field('One-line summary', 'summary', d.summary, { ph: 'What it is, what to order' })}
    ${field('Notes', 'notes', d.notes, { area: true })}
    <details class="more"><summary>Hours, price, phone</summary>
      ${field('Hours', 'hours', d.practical.hours)}${field('Closed', 'closed', d.practical.closed, { ph: 'e.g. Mondays' })}
      ${field('Price', 'price', d.practical.price)}${field('Booking', 'reservation', d.practical.reservation, { ph: 'required / walk-in / how' })}
      ${field('Phone', 'phone', d.phone, { type: 'tel' })}${field('Website', 'website', d.website, { type: 'url' })}
    </details>
    <details class="more"><summary>Photo and video notes</summary>
      ${field('Shot', 'shot', d.photo.shot)}${field('Best time', 'best_time', d.photo.best_time)}
      ${field('Getting there', 'access', d.photo.access)}${field('Rules', 'rules', d.photo.rules, { ph: 'tripod, drone, flash' })}
      ${field('Video idea', 'video', d.photo.video)}${field('Gear', 'gear', d.photo.gear)}
    </details>
    ${!isNew ? `<p class="t-cap">${d.origin === 'claude' ? 'Researched by Claude — your edits keep that label.' : 'Added by ' + esc((d.added && d.added.by) || 'you')}</p>` : ''}
  </div>`;
}

function mountPicker(body) {
  const el = body.querySelector('#picker');
  if (!el || !window.L) return;
  if (picker) { picker.remove(); picker = null; }
  const start = draft._lat !== null ? { lat: draft._lat, lng: draft._lng } : null;
  picker = pickerMap(el, start, effectiveTheme() === 'dark', getPrefs().mapStyle);
  picker.on('moveend', () => {
    const c = picker.getCenter();
    draft._lat = c.lat; draft._lng = c.lng;
    if (picker._userMoved) { draft._coordSet = true; draft._src = 'pin'; setCoordLine('Pin set — drag the map to adjust'); }
  });
  picker.on('dragstart zoomstart', () => { picker._userMoved = true; });
  setTimeout(() => picker && picker.invalidateSize(), 260);
}

function setCoordLine(t) { const el = document.getElementById('coordline'); if (el) el.textContent = t; }
function val(name) { const el = document.querySelector(`[data-panel="edit-place"] [name="${name}"]`); return el ? el.value.trim() : ''; }
function syncInputs() {
  for (const k of ['name', 'romaji', 'ja', 'address_en', 'address_ja', 'summary', 'notes', 'phone', 'website']) draft[k] = val(k);
  draft.gmaps.url = val('gmurl');
  for (const k of ['hours', 'closed', 'price', 'reservation']) draft.practical[k] = val(k);
  for (const k of ['shot', 'best_time', 'access', 'rules', 'video', 'gear']) draft.photo[k] = val(k);
}
function moveTo(lat, lng, src, zoom = 17) { draft._lat = lat; draft._lng = lng; draft._coordSet = true; draft._src = src; if (picker) { picker._userMoved = false; picker.setView([lat, lng], zoom); } }

on('draft-cat', (d, el) => { syncInputs(); draft.category = d.value; document.querySelectorAll('[data-action="draft-cat"]').forEach((b) => b.classList.toggle('on', b === el)); });
on('draft-meal', (d, el) => { const m = draft.meals || []; draft.meals = m.includes(d.value) ? m.filter((x) => x !== d.value) : [...m, d.value]; el.classList.toggle('on'); });
on('draft-priority', (d, el) => { draft.priority = d.value; el.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }); });
on('draft-here', async () => {
  try { const p = await locateOnce(); moveTo(p.lat, p.lng, 'pin'); setCoordLine(`Pin set from your location (±${Math.round(p.acc)} m)`); }
  catch (e) { toast('Location isn’t available on this device'); }
});
on('draft-geocode', async () => {
  syncInputs();
  const a = draft.address_ja || draft.address_en;
  if (!a) { toast('Add an address first'); return; }
  setCoordLine('Looking up the address…');
  const hit = await geocode(a);
  if (hit) { moveTo(hit.lat, hit.lng, hit.coord); setCoordLine('Pin set from the address — check it sits on the place'); }
  else setCoordLine('Couldn’t find that address. Drag the map to place the pin.');
});
on('draft-link', () => {
  syncInputs();
  const c = coordsFromMapsUrl(draft.gmaps.url);
  if (c) { moveTo(c.lat, c.lng, 'link'); setCoordLine('Pin set from the link'); }
  else toast(draft.gmaps.url ? 'Short share links don’t carry a location — drag the map to place the pin' : 'Paste a Google Maps link first');
});
on('save-place', () => {
  syncInputs();
  if (!draft.name) { toast('Give it a name'); return; }
  if (!draft._coordSet) { const c = coordsFromMapsUrl(draft.gmaps.url); if (c) moveTo(c.lat, c.lng, 'link'); }
  const out = { ...draft };
  if (!out.id) out.id = slugify(out.name) + '-' + uid().slice(0, 4);
  if (draft._coordSet && draft._lat !== null) {
    const moved = !hasCoords(draft) || Math.abs(draft.lat - draft._lat) > 1e-7 || Math.abs(draft.lng - draft._lng) > 1e-7;
    out.lat = draft._lat; out.lng = draft._lng;
    if (moved) out.coord = draft._src || 'pin';
  }
  delete out._lat; delete out._lng; delete out._coordSet; delete out._src;
  if (draft.id) out.edited = { by: store.who(), at: new Date().toISOString() };
  for (const k of ['practical', 'photo', 'gmaps']) {
    const o = out[k] || {};
    for (const key of Object.keys(o)) if (!o[key]) delete o[key];
    if (!Object.keys(o).length) delete out[k];
  }
  for (const k of Object.keys(out)) if (out[k] === '') delete out[k];
  store.put('places', out);
  closePanel('edit-place');
  toast(draft.id ? 'Saved' : 'Added');
  rerender('*');
});
on('add-place', () => openEditPlace(null));

// ======================= booking =======================
let bdraft = null;

export function openEditBooking(id, placeId) {
  const b = id ? store.get('bookings', id) : null;
  bdraft = b ? JSON.parse(JSON.stringify(b)) : { id: '', kind: 'meal', status: 'confirmed', place_id: placeId || '', title: '' };
  openPanel('edit-booking', bookingForm, { kind: 'full', keepOnRefresh: true });
}

// Flights keep local time at each end, so each end carries its own UTC offset.
function tzField(label, name, value) {
  const opts = [];
  for (let h = -12; h <= 14; h++) {
    const v = `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`;
    opts.push(`<option value="${v}"${v === value ? ' selected' : ''}>UTC${h < 0 ? '−' : '+'}${Math.abs(h)}${h === 9 ? ' · Japan' : ''}</option>`);
  }
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${opts.join('')}</select></div>`;
}

function split(iso) { const w = whenParts(iso); return { date: w.date || '', time: w.time || '', off: iso && iso.length > 16 ? iso.slice(16) : '+09:00' }; }

function bookingForm() {
  const b = bdraft;
  const s = split(b.start), e = split(b.end);
  const places = store.all('places').sort((x, y) => x.name.localeCompare(y.name));
  const opt = (sel) => `<option value="">—</option>${places.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  const kinds = [['meal', 'Meal'], ['hotel', 'Stay'], ['car', 'Car'], ['flight', 'Flight'], ['ticket', 'Ticket'], ['other', 'Other']];
  return `<div class="navbar"><button type="button" class="txtbtn mut" data-action="close-panel" data-id="edit-booking">Cancel</button><div class="ttl">${b.id ? 'Edit booking' : 'New booking'}</div><button type="button" class="txtbtn" data-action="save-booking">Save</button></div>
  <div class="scroll form">
    <div class="field"><label>Kind</label><div class="chips wrap">${kinds.map(([k, l]) => `<button type="button" class="chip plain${b.kind === k ? ' on' : ''}" data-action="bdraft-kind" data-value="${k}">${l}</button>`).join('')}</div></div>
    <div class="field"><label>Status</label>${seg('Status', [['confirmed', 'Booked'], ['hold', 'Held'], ['to_cancel', 'To cancel'], ['cancelled', 'Cancelled']], b.status, 'bdraft-status')}</div>
    ${field('Title', 'title', b.title, { ph: 'e.g. Dinner, flight number, car rental' })}
    <div class="field"><label for="f-place">Place</label><select id="f-place" name="place_id">${opt(b.place_id)}</select></div>
    ${b.kind === 'car' || b.kind === 'flight' ? `<div class="field"><label for="f-place2">${b.kind === 'car' ? 'Return at' : 'Arrive at'}</label><select id="f-place2" name="place_id_end">${opt(b.place_id_end)}</select></div>` : ''}
    <div class="two">${field(b.kind === 'hotel' ? 'Check-in date' : 'Date', 'sdate', s.date, { type: 'date' })}${field('Time', 'stime', s.time, { type: 'time' })}</div>
    ${b.kind === 'flight' ? tzField('Departure time zone', 'soff', s.off) : ''}
    ${['hotel', 'car', 'flight'].includes(b.kind) ? `<div class="two">${field(b.kind === 'hotel' ? 'Check-out date' : b.kind === 'car' ? 'Return date' : 'Arrival date', 'edate', e.date, { type: 'date' })}${field('Time', 'etime', e.time, { type: 'time' })}</div>` : ''}
    ${b.kind === 'flight' ? tzField('Arrival time zone', 'eoff', e.off) : ''}
    ${b.kind === 'hotel' ? `<div class="field"><label>Meals included</label><div class="chips wrap">${['breakfast', 'dinner'].map((m) => `<button type="button" class="chip plain${(b.meals_included || []).includes(m) ? ' on' : ''}" data-action="bdraft-meal" data-value="${m}">${MEAL_LABEL[m]}</button>`).join('')}</div></div>` : ''}
    ${field('Reference', 'ref', b.ref, { ph: 'Confirmation number' })}
    ${field('PIN or code', 'secret', b.secret)}
    ${field('Details', 'details', b.details, { ph: 'Room, car class, party size…' })}
    ${field('Free cancellation until', 'cancel_by', b.cancel_by, { type: 'date' })}
    ${field('Notes', 'bnotes', b.notes, { area: true })}
    ${b.id ? `<button type="button" class="btn out danger" data-action="delete-booking">${icon('trash', 's')}Delete booking</button>` : ''}
  </div>`;
}

function bval(name) { const el = document.querySelector(`[data-panel="edit-booking"] [name="${name}"]`); return el ? el.value.trim() : ''; }
function bsync() {
  for (const k of ['title', 'ref', 'secret', 'details', 'cancel_by']) bdraft[k] = bval(k);
  bdraft.notes = bval('bnotes');
  bdraft.place_id = bval('place_id');
  if (document.querySelector('[data-panel="edit-booking"] [name="place_id_end"]')) bdraft.place_id_end = bval('place_id_end');
  const sd = bval('sdate'), st = bval('stime');
  const off = bval('soff') || '+09:00';
  if (sd) bdraft.start = st ? `${sd}T${st}${off}` : sd;
  const ed = bval('edate'), et = bval('etime');
  const eoff = bval('eoff') || '+09:00';
  if (document.querySelector('[data-panel="edit-booking"] [name="edate"]')) bdraft.end = ed ? (et ? `${ed}T${et}${eoff}` : ed) : '';
}
function brepaint() { const p = document.querySelector('[data-panel="edit-booking"] .panel-body'); if (p) { const top = p.querySelector('.scroll').scrollTop; p.innerHTML = bookingForm(); p.querySelector('.scroll').scrollTop = top; } }

on('bdraft-kind', (d) => { bsync(); bdraft.kind = d.value; brepaint(); });
on('bdraft-status', (d) => { bsync(); bdraft.status = d.value; brepaint(); });
on('bdraft-meal', (d) => { bsync(); const m = bdraft.meals_included || []; bdraft.meals_included = m.includes(d.value) ? m.filter((x) => x !== d.value) : [...m, d.value]; brepaint(); });
on('save-booking', () => {
  bsync();
  if (!bdraft.start) { toast('Add a date'); return; }
  const out = { ...bdraft };
  if (!out.id) out.id = 'b-' + uid().slice(0, 10);
  if (!out.title) { const p = out.place_id && store.get('places', out.place_id); out.title = p ? p.name : 'Booking'; }
  for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  store.put('bookings', out);
  closePanel('edit-booking');
  toast('Saved');
  rerender('*');
});
on('delete-booking', () => {
  if (!confirm('Delete this booking for everyone?')) return;
  store.remove('bookings', bdraft.id); closePanel('edit-booking'); rerender('*');
});
on('edit-booking', (d) => openEditBooking(d.id));
on('add-booking', (d) => { closePanel('more'); openEditBooking(null, d.id); });
on('new-booking', () => openEditBooking(null));

// ======================= list item =======================
let ldraft = null;

export function openEditItem(id, list) {
  const it = id ? store.get('lists', id) : null;
  ldraft = it ? JSON.parse(JSON.stringify(it)) : { id: '', list: list || 'eat', title: '', done: false };
  openPanel('edit-item', itemForm, { kind: 'sheet', keepOnRefresh: true });
}

function itemForm() {
  const it = ldraft;
  const cats = [['', '—'], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.label])];
  return `<div class="sheet-head"><button type="button" class="txtbtn mut" data-action="close-panel" data-id="edit-item">Cancel</button><h2 class="t-title">${it.id ? 'Edit item' : 'New item'}</h2><button type="button" class="txtbtn" data-action="save-item">Save</button></div>
  <div class="scroll form">
    ${field('What', 'ititle', it.title, { ph: 'e.g. Buy souvenirs' })}
    <div class="field"><label>List</label>${seg('List', LISTS.map((l) => [l.key, l.label]), it.list, 'ldraft-list')}</div>
    <div class="field"><label for="f-icat">“Find” shows</label><select id="f-icat" name="icat">${cats.map(([k, l]) => `<option value="${k}"${(it.find || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    ${field('Due date', 'idue', it.due, { type: 'date' })}
    ${field('Notes', 'inotes', it.notes, { area: true })}
    ${it.id ? `<button type="button" class="btn out danger" data-action="delete-item">${icon('trash', 's')}Delete</button>` : ''}
  </div>`;
}

function lval(name) { const el = document.querySelector(`[data-panel="edit-item"] [name="${name}"]`); return el ? el.value.trim() : ''; }
on('ldraft-list', (d, el) => { ldraft.list = d.value; el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); });
on('save-item', () => {
  ldraft.title = lval('ititle'); ldraft.find = lval('icat'); ldraft.due = lval('idue'); ldraft.notes = lval('inotes');
  if (!ldraft.title) { toast('Add a title'); return; }
  const out = { ...ldraft };
  if (!out.id) out.id = 'l-' + uid().slice(0, 10);
  for (const k of Object.keys(out)) if (out[k] === '') delete out[k];
  store.put('lists', out);
  closePanel('edit-item'); rerender('*');
});
on('delete-item', () => { if (!confirm('Delete this item?')) return; store.remove('lists', ldraft.id); closePanel('edit-item'); rerender('*'); });
on('edit-item', (d) => openEditItem(d.id));
on('new-item', (d) => openEditItem(null, d.list));
