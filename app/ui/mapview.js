// Map tab: top bar, chips, near-me sheet, area switcher, filters and map options.
import { store } from '../store.js';
import { getPrefs, setPrefs, setFilters, effectiveTheme } from '../prefs.js';
import { AREAS, AREA_ORDER, CHIPS, MAP_STYLES, MEAL_LABEL, MODES } from '../config.js';
import { icon } from '../icons.js';
import { esc, fmtDay, fmtDayShort, addDays, whenParts, minutesUntil, fmtIn, debounce, hasCoords } from '../util.js';
import { on, openPanel, closePanel, toast, neutralBadge, grab, closeBtn, seg } from './core.js';
import { ui, rerender } from '../state.js';
import { visiblePlaces, refPoint, sortByDistance, placeRow } from './places.js';
import { tripDays, dayArea, focusDay, nextUp, areaOf, areaByKey } from '../trip.js';
import { position, locateOnce } from '../geo.js';
import { pendingCount } from '../research.js';
import { openPlace } from './card.js';
import { openInbox } from './inbox.js';

// ---------- render ----------
export function renderMapTop() {
  const el = document.getElementById('map-top');
  if (!el) return;
  const prefs = getPrefs();
  const f = prefs.filters;
  const area = areaByKey(ui.area);
  const pend = pendingCount();
  const advanced = (f.mustOnly ? 1 : 0) + (f.source !== 'all' ? 1 : 0) + (f.meal ? 1 : 0) + (f.hideVisited ? 0 : 1) + (f.showHidden ? 1 : 0);
  el.innerHTML = `
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
      ${ui.focus ? `<button type="button" class="chip plain on focus" data-action="clear-focus" aria-label="Stop showing only ${esc(ui.focus.label)}">${esc(ui.focus.label)}${icon('x', 's')}</button>` : ''}
      <button type="button" class="chip plain${advanced ? ' on' : ''}" data-action="filters">${icon('sliders', 's')}Filters${advanced ? ` · ${advanced}` : ''}</button>
      <button type="button" class="chip plain${f.bookedOnly ? ' on' : ''}" data-action="toggle-booked" aria-pressed="${f.bookedOnly}">${icon('check', 's ok')}Booked</button>
      ${CHIPS.map((c) => `<button type="button" class="chip${f.chips.includes(c.key) ? ' on' : ''}" data-action="chip" data-key="${c.key}" aria-pressed="${f.chips.includes(c.key)}"><span class="badge f-${c.fam}">${icon(c.glyph)}</span>${esc(c.label)}</button>`).join('')}
    </div>`;
}

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
  const limit = ui.nearExpanded ? 80 : 6;
  const rows = list.slice(0, limit).map(({ p, d }) => placeRow(p, d)).join('');
  const empty = !list.length ? `<div class="empty small"><b>${q ? 'Nothing matches' : 'No places here yet'}</b><p>${q ? 'Try the English name, romaji or Japanese.' : store.all('places').length ? 'Loosen the filters, or switch area.' : 'Add a place with ＋ or keep some from the research inbox.'}</p></div>` : '';
  el.className = 'near' + (ui.nearExpanded ? ' expanded' : '');
  el.innerHTML = `
    <button type="button" class="near-head" data-action="near-toggle" aria-expanded="${ui.nearExpanded}">
      ${grab()}
      <span class="hrow"><span class="vstack"><span class="t-title">${title}</span><span class="t-sec">${sub}</span></span>
      <span class="txtbtn">${ui.nearExpanded ? 'Less' : 'All'}${icon(ui.nearExpanded ? 'chevronDown' : 'chevronUp', 's')}</span></span>
    </button>
    <div class="near-list scroll">${next}${rows}${empty}
      <div class="near-foot"><button type="button" class="btn sec sm" data-action="add-place">${icon('plus', 's')}Add a place</button></div>
    </div>`;
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

export function refreshMarkers() {
  if (!ui.map) return;
  const prefs = getPrefs();
  ui.map.setPlaces(visiblePlaces(), { labels: prefs.labels, dense: prefs.density === 'dense' });
  if (ui.selected) ui.map.select(ui.selected, { pan: false });
}

export function renderMapView() { renderMapTop(); renderNear(); refreshMarkers(); }

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
function mapOptions() {
  const prefs = getPrefs();
  return `${grab()}
    <div class="sheet-head"><h2 class="t-title">Map</h2>${closeBtn('mapopts')}</div>
    <div class="scroll pad-lg">
      <div class="fgroup"><span class="t-over">Map style</span>
        ${Object.entries(MAP_STYLES).map(([k, s]) => `<button type="button" class="row choice${prefs.mapStyle === k ? ' current' : ''}" data-action="map-style" data-value="${k}">
          <span class="main"><span class="name">${esc(s.label)}</span><span class="meta wrap">${esc(s.note)}</span></span>${prefs.mapStyle === k ? icon('check', 's ok') : ''}</button>`).join('')}
      </div>
      <div class="fgroup"><span class="t-over">Pin labels</span>${seg('Pin labels', [['key', 'Booked & must'], ['all', 'All'], ['off', 'Off']], prefs.labels, 'pref-labels')}</div>
      <div class="fgroup"><span class="t-over">Pin style</span>${seg('Pin style', [['signage', 'Signage'], ['outline', 'Outline'], ['mono', 'Mono']], prefs.pins, 'pref-pins')}</div>
    </div>`;
}

// ---------- actions ----------
const search = debounce(() => { renderNear(); refreshMarkers(); }, 160);
on('search', (d, el) => { ui.query = el.value; ui.nearExpanded = !!el.value || ui.nearExpanded; search(); });
on('search-clear', () => { ui.query = ''; renderMapTop(); renderNear(); refreshMarkers(); });
on('near-toggle', () => { ui.nearExpanded = !ui.nearExpanded; renderNear(); });
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
function refreshFiltersPanel() { const p = document.querySelector('[data-panel="filters"] .panel-body'); if (p) p.innerHTML = filtersPanel(); }

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
on('map-style', (d) => { setPrefs({ mapStyle: d.value }); if (ui.map) ui.map.setStyle(d.value, effectiveTheme() === 'dark'); refreshPanelBody('mapopts', mapOptions); });
on('pref-labels', (d) => { setPrefs({ labels: d.value }); refreshMarkers(); refreshPanelBody('mapopts', mapOptions); });
on('pref-pins', (d) => { setPrefs({ pins: d.value }); refreshPanelBody('mapopts', mapOptions); rerender('*'); });
on('open-place', (d) => openPlace(d.id));
on('clear-focus', () => { ui.focus = null; rerender('map'); });
on('inbox', () => openInbox());

function refreshPanelBody(id, fn) { const p = document.querySelector(`[data-panel="${id}"] .panel-body`); if (p) p.innerHTML = fn(); }
