// Map tab: top bar, chips, near-me sheet, area switcher, filters and map options.
import { store } from '../store.js';
import { getPrefs, setPrefs, setFilters, mapStyleKey } from '../prefs.js';
import { AREAS, AREA_ORDER, CHIPS, MAP_STYLES, MEAL_LABEL, MODES, GOOGLE_MAPS_KEY } from '../config.js';
import { icon } from '../icons.js';
import { esc, fmtDay, fmtDayShort, addDays, whenParts, minutesUntil, fmtIn, debounce, hasCoords } from '../util.js';
import { on, openPanel, closePanel, toast, neutralBadge, grab, closeBtn, seg, patch, isOpen } from './core.js';
import { ui, rerender } from '../state.js';
import { visiblePlaces, refPoint, sortByDistance, placeRow } from './places.js';
import { tripDays, dayArea, focusDay, nextUp, areaOf, areaByKey } from '../trip.js';
import { position, locateOnce } from '../geo.js';
import { pendingCount } from '../research.js';
import { openPlace } from './card.js';
import { openInbox } from './inbox.js';
import { applySheet, stepSheet } from './sheet.js';

// ---------- render ----------
export function renderMapTop() {
  const el = document.getElementById('map-top');
  if (!el) return;
  const prefs = getPrefs();
  const f = prefs.filters;
  const area = areaByKey(ui.area);
  const pend = pendingCount();
  const advanced = (f.mustOnly ? 1 : 0) + (f.source !== 'all' ? 1 : 0) + (f.meal ? 1 : 0) + (f.hideVisited ? 0 : 1) + (f.showHidden ? 1 : 0);
  patch(el, `
    <div class="toprow">
      <button type="button" class="pill" data-action="area-picker" aria-label="Change area">
        ${icon(area ? area.glyph : 'globe')}
        <span class="lbl"><b>${esc(area ? area.name : 'Whole trip')}</b><span>${esc(fmtDay(ui.day || focusDay()))}</span></span>
        ${icon('chevronDown', 's')}
      </button>
      <label class="search">
        ${icon('search')}
        <input id="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Name · romaji · 日本語" aria-label="Search places" value="${esc(ui.query)}" data-input="search">
        <button type="button" class="clear" data-action="search-clear" aria-label="Clear search">${icon('x', 's')}</button>
      </label>
      <button type="button" class="iconbtn" data-action="inbox" aria-label="Research inbox${pend ? ', ' + pend + ' to review' : ''}">${icon('inbox')}${pend ? '<span class="dot"></span>' : ''}</button>
    </div>
    <div class="chips" role="toolbar" aria-label="Filters">
      ${ui.pickFor ? `<button type="button" class="chip plain on focus" data-action="end-pick" aria-label="Stop adding ${esc(MEAL_LABEL[ui.pickFor.slot].toLowerCase())} options">${esc(MEAL_LABEL[ui.pickFor.slot])} options · ${esc(fmtDayShort(ui.pickFor.day))}${icon('x', 's')}</button>` : ''}
      ${ui.focus ? `<button type="button" class="chip plain on focus" data-action="clear-focus" aria-label="Stop showing only ${esc(ui.focus.label)}">${esc(ui.focus.label)}${icon('x', 's')}</button>` : ''}
      <button type="button" class="chip plain${advanced ? ' on' : ''}" data-action="filters">${icon('sliders', 's')}Filters${advanced ? ` · ${advanced}` : ''}</button>
      <button type="button" class="chip plain${f.bookedOnly ? ' on' : ''}" data-action="toggle-booked" aria-pressed="${f.bookedOnly}">${icon('check', 's ok')}Booked</button>
      ${CHIPS.map((c) => `<button type="button" class="chip${f.chips.includes(c.key) ? ' on' : ''}" data-action="chip" data-key="${c.key}" aria-pressed="${f.chips.includes(c.key)}"><span class="badge f-${c.fam}">${icon(c.glyph)}</span>${esc(c.label)}</button>`).join('')}
    </div>`);
}

let nearShown = null; // what the list is answering: a new search, filter or reference point starts at the top

export function renderNear() {
  const el = document.getElementById('near');
  if (!el) return;
  const ref = refPoint();
  const list = sortByDistance(visiblePlaces(), ref);
  const q = ui.query.trim();
  let title, sub;
  if (q) { title = `Results for “${esc(q)}”`; sub = `${list.length} place${list.length === 1 ? '' : 's'}`; }
  else {
    title = ref && ref.kind === 'gps' ? 'Near you' : ref && ref.kind === 'base' ? `Around ${esc(ref.label)}` : 'Around the map centre';
    sub = `${list.length} place${list.length === 1 ? '' : 's'} · nearest first`;
  }
  const next = !q ? nextRow() : '';
  const full = ui.sheet === 'full';
  const limit = full ? 80 : 6;
  const rows = list.slice(0, limit).map(({ p, d }) => placeRow(p, d)).join('');
  const empty = !list.length ? `<div class="empty small"><b>${q ? 'Nothing matches' : 'No places here yet'}</b><p>${q ? 'Try the English name, romaji or Japanese.' : store.all('places').length ? 'Loosen the filters, or switch area.' : 'Add a place with ＋ or keep some from the research inbox.'}</p></div>` : '';
  patch(el, `
    <button type="button" class="near-head" data-action="near-toggle" aria-expanded="${full}" aria-label="${full ? 'Show less' : 'Show more'}: ${title}">
      ${grab()}
      <span class="hrow"><span class="vstack"><span class="t-title">${title}</span><span class="t-sec">${sub}</span></span>
      <span class="txtbtn">${full ? 'Less' : ui.sheet === 'min' ? 'Show' : 'All'}${icon(full ? 'chevronDown' : 'chevronUp', 's')}</span></span>
    </button>
    <div class="near-list scroll">${next}${rows}${empty}
      <div class="near-foot"><button type="button" class="btn sec sm" data-action="add-place">${icon('plus', 's')}Add a place</button></div>
    </div>`);
  const shown = JSON.stringify([q, getPrefs().filters, ui.focus, ref && ref.kind, ref && ref.kind !== 'gps' ? [ref.lat, ref.lng] : null]);
  if (shown !== nearShown) { nearShown = shown; el.querySelector('.near-list').scrollTop = 0; }
  if (!el.classList.contains('dragging')) applySheet();
}

function nextRow() {
  const n = nextUp();
  if (!n) return '';
  const mins = minutesUntil(n.ms);
  if (mins > 12 * 60) return '';
  const b = n.booking;
  const pid = n.kind === 'end' && b.place_id_end ? b.place_id_end : b.place_id;
  const p = pid ? store.get('places', pid) : null;
  const what = { hotel: n.kind === 'start' ? 'Check in' : 'Check out', car: n.kind === 'start' ? 'Car pick-up' : 'Car return', flight: n.kind === 'start' ? 'Flight' : 'Arrive', meal: 'Booked', ticket: 'Ticket' }[b.kind] || 'Next';
  return `<button type="button" class="row next" ${p ? `data-action="open-place" data-id="${esc(p.id)}"` : 'data-action="tab" data-tab="today"'}>
    <span class="badge neutral">${icon('clock')}</span>
    <span class="main"><span class="name">${esc(p ? p.name : b.title)}</span><span class="meta">${esc(what)} ${esc(n.time)} · ${esc(fmtIn(mins))}</span></span>
    <span class="end"><span class="tag now">Next</span></span>
  </button>`;
}

// The part of the map that's in view: below the search bar and chips, above the place card or the list (left of the
// card on wide screens). In the map element's own pixels, with its final size: the map and card may still be moving.
export function clearArea(mapEl) {
  const view = document.getElementById('view-map');
  const top = document.getElementById('map-top');
  if (!view || !mapEl || !view.clientHeight) return null;
  const m = mapEl.getBoundingClientRect();
  const v = view.getBoundingClientRect();
  const covered = ui.wide ? 0 : parseFloat(view.style.getPropertyValue('--sheet-h')) || 0;
  const height = mapEl.classList.contains('gmap') && !ui.wide ? v.bottom - covered - m.top : m.height; // Google's map stops at the cover
  const box = { left: 0, right: m.width, top: top ? top.getBoundingClientRect().bottom - m.top : 0, bottom: v.bottom - covered - m.top, width: m.width, height };
  if (ui.wide) {
    box.bottom = m.height;
    const card = isOpen('card') && document.querySelector('[data-panel="card"] .panel-body');
    if (card) box.right = Math.min(box.right, card.getBoundingClientRect().left - m.left);
  }
  return box;
}

export function refreshMarkers() {
  if (!ui.map) return;
  const prefs = getPrefs();
  ui.map.setPlaces(visiblePlaces(), { labels: prefs.labels, dense: prefs.density === 'dense' });
  if (ui.selected) ui.map.select(ui.selected, { pan: false });
}

// ---------- areas ----------
export function goToArea(key, { fly = true } = {}) {
  ui.area = key || '';
  setPrefs({ area: ui.area });
  if (fly && ui.map) {
    const a = areaByKey(key);
    if (a) ui.map.flyTo(a.center, a.zoom);
    else ui.map.fit(store.all('places').filter(hasCoords), 13);
  }
  rerender('map');
}

export function initialArea() {
  const pos = position();
  if (pos) { const k = areaOf({ lat: pos.lat, lng: pos.lng }); if (k && k !== 'other') return k; }
  const k = dayArea(ui.day || focusDay());
  if (k && k !== 'other') return k;
  return getPrefs().area || 'tokyo';
}

function areaRanges(key) {
  const days = tripDays().filter((d) => dayArea(d) === key);
  if (!days.length) return '';
  const ranges = [];
  let s = days[0], prev = days[0];
  for (const d of days.slice(1)) {
    if (d !== addDays(prev, 1)) { ranges.push([s, prev]); s = d; }
    prev = d;
  }
  ranges.push([s, prev]);
  return ranges.map(([a, b]) => a === b ? fmtDayShort(a) : `${fmtDayShort(a).split(' ')[0]}–${fmtDayShort(b)}`).join(' · ');
}

function areaPicker() {
  const prefs = getPrefs();
  const rows = AREA_ORDER.map((k) => {
    const a = areaByKey(k);
    const dates = areaRanges(k);
    const mode = MODES[prefs.modes[k] || a.mode].label;
    return `<button type="button" class="row${ui.area === k ? ' current' : ''}" data-action="go-area" data-key="${k}">
      ${neutralBadge(a.glyph)}
      <span class="main"><span class="name">${esc(a.name)}</span><span class="meta">${esc(a.sub)}${dates ? ' · ' + esc(dates) : ''}</span></span>
      <span class="end"><span class="tag neutral">${esc(mode)}</span>${ui.area === k ? icon('check', 's ok') : ''}</span></button>`;
  }).join('');
  return `${grab()}
    <div class="sheet-head"><h2 class="t-title">Jump to area</h2>${closeBtn('areas')}</div>
    <div class="rows scroll">
      <button type="button" class="row" data-action="go-near-me">${neutralBadge('locate')}<span class="main"><span class="name">Near me</span><span class="meta">Uses your location</span></span></button>
      ${rows}
      <button type="button" class="row${ui.area === '' ? ' current' : ''}" data-action="go-area" data-key="">${neutralBadge('globe')}<span class="main"><span class="name">Whole trip</span><span class="meta">Every pin</span></span></button>
      <p class="t-sec pad">Each area keeps its own travel mode for Directions. It's one set of places — nothing is duplicated.</p>
    </div>`;
}

// ---------- filters ----------
function filtersPanel() {
  const f = getPrefs().filters;
  const toggle = (key, label, glyph) => `<button type="button" class="chip plain${f[key] ? ' on' : ''}" data-action="filter-toggle" data-key="${key}" aria-pressed="${!!f[key]}">${glyph ? icon(glyph, 's') : ''}${esc(label)}</button>`;
  return `${grab()}
    <div class="sheet-head"><button type="button" class="txtbtn mut" data-action="filters-reset">Reset</button><h2 class="t-title">Filters</h2><button type="button" class="txtbtn" data-action="close-panel" data-id="filters">Done</button></div>
    <div class="scroll pad-lg">
      <div class="fgroup"><span class="t-over">Show</span><div class="chips wrap">
        ${toggle('bookedOnly', 'Booked only', 'check')}${toggle('mustOnly', 'Must-do only', 'star')}${toggle('hideVisited', 'Hide visited', 'eyeOff')}${toggle('showHidden', 'Show hidden', 'eye')}
      </div></div>
      <div class="fgroup"><span class="t-over">Added by</span>
        ${seg('Added by', [['all', 'Everyone'], ['us', 'Us'], ['claude', 'Researched']], f.source, 'filter-source')}
      </div>
      <div class="fgroup"><span class="t-over">Meal</span><div class="chips wrap">
        ${['breakfast', 'lunch', 'dinner', 'late'].map((m) => `<button type="button" class="chip plain${f.meal === m ? ' on' : ''}" data-action="filter-meal" data-value="${m}">${esc(MEAL_LABEL[m])}</button>`).join('')}
      </div><p class="t-cap">Places without meal info stay visible if they're food.</p></div>
      <div class="fgroup"><span class="t-over">Types</span><div class="chips wrap">
        ${CHIPS.map((c) => `<button type="button" class="chip${f.chips.includes(c.key) ? ' on' : ''}" data-action="chip" data-key="${c.key}"><span class="badge f-${c.fam}">${icon(c.glyph)}</span>${esc(c.label)}</button>`).join('')}
      </div></div>
    </div>`;
}

// ---------- map options ----------
// Map style choices (Google Maps only when a key is configured). Shared with Settings.
export function mapStyleRows() {
  const cur = mapStyleKey();
  return Object.entries(MAP_STYLES).filter(([k]) => k !== 'google' || GOOGLE_MAPS_KEY).map(([k, s]) =>
    `<button type="button" class="row choice${cur === k ? ' current' : ''}" data-action="map-style" data-value="${k}">
      <span class="main"><span class="name">${esc(s.label)}</span><span class="meta wrap">${esc(s.note)}</span></span>${cur === k ? icon('check', 's ok') : ''}</button>`).join('');
}

function mapOptions() {
  const prefs = getPrefs();
  return `${grab()}
    <div class="sheet-head"><h2 class="t-title">Map</h2>${closeBtn('mapopts')}</div>
    <div class="scroll pad-lg">
      <div class="fgroup"><span class="t-over">Map style</span>${mapStyleRows()}</div>
      <div class="fgroup"><span class="t-over">Pin labels</span>${seg('Pin labels', [['key', 'Booked & must'], ['all', 'All'], ['off', 'Off']], prefs.labels, 'pref-labels')}</div>
      <div class="fgroup"><span class="t-over">Pin style</span>${seg('Pin style', [['signage', 'Signage'], ['outline', 'Outline'], ['mono', 'Mono']], prefs.pins, 'pref-pins')}</div>
    </div>`;
}

// ---------- actions ----------
const search = debounce(() => { renderNear(); refreshMarkers(); }, 160);
on('search', (d, el) => { ui.query = el.value; if (el.value) ui.sheet = 'full'; search(); });
on('search-clear', () => {
  ui.query = '';
  const field = document.getElementById('search');
  if (field) field.value = ''; // a focused field keeps its text through a redraw, so clear it here
  renderMapTop(); renderNear(); refreshMarkers();
});
on('near-toggle', () => stepSheet());
on('chip', (d) => {
  const f = getPrefs().filters;
  const chips = f.chips.includes(d.key) ? f.chips.filter((k) => k !== d.key) : [...f.chips, d.key];
  setFilters({ chips }); rerender('map'); refreshFiltersPanel();
});
on('toggle-booked', () => { setFilters({ bookedOnly: !getPrefs().filters.bookedOnly }); rerender('map'); });
on('filters', () => openPanel('filters', filtersPanel));
on('filter-toggle', (d) => { setFilters({ [d.key]: !getPrefs().filters[d.key] }); rerender('map'); refreshFiltersPanel(); });
on('filter-source', (d) => { setFilters({ source: d.value }); rerender('map'); refreshFiltersPanel(); });
on('filter-meal', (d) => { setFilters({ meal: getPrefs().filters.meal === d.value ? '' : d.value }); rerender('map'); refreshFiltersPanel(); });
on('filters-reset', () => { setFilters({ chips: [], bookedOnly: false, mustOnly: false, hideVisited: true, showHidden: false, source: 'all', meal: '' }); rerender('map'); refreshFiltersPanel(); });
function refreshFiltersPanel() { const p = document.querySelector('[data-panel="filters"] .panel-body'); if (p) patch(p, filtersPanel()); }

on('area-picker', () => openPanel('areas', areaPicker));
on('go-area', (d) => { closePanel('areas'); goToArea(d.key); });
on('go-near-me', async () => {
  closePanel('areas');
  try {
    const pos = await locateOnce();
    const k = areaOf({ lat: pos.lat, lng: pos.lng });
    ui.area = k && k !== 'other' ? k : ui.area;
    if (ui.map) { ui.map.setMe(pos); ui.map.flyTo([pos.lat, pos.lng], 16); }
    rerender('map');
  } catch (e) { toast('Location isn’t available on this device'); }
});
on('locate', async () => {
  try {
    const pos = await locateOnce();
    if (ui.map) { ui.map.setMe(pos); ui.map.flyTo([pos.lat, pos.lng], 16); }
    renderNear();
  } catch (e) { toast('Location isn’t available — distances use tonight’s hotel'); }
});
on('map-options', () => openPanel('mapopts', mapOptions));
on('map-style', (d) => {
  setPrefs({ mapStyle: d.value, mapStyleSet: true });
  document.dispatchEvent(new Event('mapstyle')); // main.js restyles, or swaps map engines
  refreshPanelBody('mapopts', mapOptions);
  if (document.querySelector('[data-panel="settings"]')) rerender('settings');
});
on('pref-labels', (d) => { setPrefs({ labels: d.value }); refreshMarkers(); refreshPanelBody('mapopts', mapOptions); });
on('pref-pins', (d) => { setPrefs({ pins: d.value }); refreshPanelBody('mapopts', mapOptions); rerender('*'); });
on('open-place', (d) => openPlace(d.id));
on('clear-focus', () => { ui.focus = null; rerender('map'); });

// Leaving "adding options" puts the filters back as they were before Find.
export function endPick() {
  if (!ui.pickFor) return;
  if (ui.pickFor.prevFilters) setFilters(ui.pickFor.prevFilters);
  ui.pickFor = null;
  rerender('*');
}
on('end-pick', () => endPick());
on('inbox', () => openInbox());

function refreshPanelBody(id, fn) { const p = document.querySelector(`[data-panel="${id}"] .panel-body`); if (p) patch(p, fn()); }
