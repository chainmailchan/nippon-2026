// Boot, tabs, rendering and the map engine (Google Maps or Leaflet/OpenStreetMap).
import { applyLook, getPrefs, effectiveTheme, mapStyleKey } from './prefs.js';
import { store } from './store.js';
import { FIREBASE_CONFIG, GOOGLE_MAPS_KEY, MAP_STYLES } from './config.js';
import { installActions, installPanelDrag, on, refreshPanels, closePanel, isOpen, toast } from './ui/core.js';
import { ui, onRender } from './state.js';
import { TripMap } from './map.js';
import { renderMapView, renderNear, initialArea, refreshMarkers } from './ui/mapview.js';
import { installSheet, applySheet } from './ui/sheet.js';
import { renderToday } from './ui/today.js';
import { renderTrip } from './ui/trip.js';
import { renderLists } from './ui/lists.js';
import { openJoin } from './ui/settings.js';
import { openPlace } from './ui/card.js';
import './ui/edit.js';
import './ui/inbox.js';
import { loadBatches } from './research.js';
import { startWatch, onPosition, geocodeMissing } from './geo.js';
import { focusDay, areaOf, areaByKey, tripDays } from './trip.js';

const WIDE = window.matchMedia('(min-width: 900px) and (min-height: 600px)');
const VIEWS = { today: renderToday, trip: renderTrip, lists: renderLists };

let pending = false;
function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; renderNow(); });
}

function renderNow() {
  maybeSettleStart();
  renderMapView();
  if (VIEWS[ui.tab]) VIEWS[ui.tab]();
  refreshPanels();
}

function setWide() {
  ui.wide = WIDE.matches;
  document.documentElement.classList.toggle('wide', ui.wide);
  applySheet();
  if (ui.map) setTimeout(() => ui.map.invalidate(), 60);
}

function showTab(tab) {
  if (!['map', 'today', 'trip', 'lists'].includes(tab)) tab = 'map';
  ui.tab = tab;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  document.querySelectorAll('.tabs .tab').forEach((b) => {
    const isOn = b.dataset.tab === tab;
    b.classList.toggle('on', isOn);
    if (isOn) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (tab !== 'map' && !ui.wide) closePanel('card');
  renderNow();
  applySheet();
  if (ui.map) setTimeout(() => ui.map.invalidate(), 40);
  try { history.replaceState(null, '', '#' + tab); } catch (e) { /* ignore */ }
}

on('tab', (d) => showTab(d.tab));
document.addEventListener('tab', (e) => showTab(e.detail));

// Once real trip data arrives, open on the right day and area (unless the user already moved).
let settled = false;
let userMoved = false;
function maybeSettleStart() {
  if (settled || !tripDays().length) return;
  settled = true;
  ui.day = focusDay();
  if (!userMoved) {
    ui.area = initialArea();
    const a = areaByKey(ui.area);
    if (a && ui.map) ui.map.setView(a.center, a.zoom);
  }
}

// ---------- map engine ----------
const mapOpts = {
  onSelect: (id) => openPlace(id),
  onMapClick: () => closePanel('card'),
  onMoveEnd: () => renderNear(),
};
let lastPos = null;

const wantsGoogle = (key) => !!(GOOGLE_MAPS_KEY && MAP_STYLES[key] && MAP_STYLES[key].provider === 'google');

async function makeMap(el, key) {
  const dark = effectiveTheme() === 'dark';
  if (wantsGoogle(key)) {
    try {
      const { loadGoogleMaps, GoogleTripMap } = await import('./gmap.js');
      const gm = await loadGoogleMaps(GOOGLE_MAPS_KEY);
      return new GoogleTripMap(el, mapOpts, gm, dark);
    } catch (e) {
      toast('Google Maps didn’t load — showing OpenStreetMap');
    }
  }
  const m = new TripMap(el, mapOpts);
  m.setStyle(wantsGoogle(key) ? 'osm' : key, dark);
  return m;
}

// Build or rebuild the map in a fresh element, keeping the view, the pins and the location dot.
let building = Promise.resolve();
function initMap(key = mapStyleKey()) {
  building = building.then(async () => {
    const prev = ui.map;
    const view = prev ? { c: prev.center(), z: prev.zoom() } : null;
    if (prev) { ui.map = null; prev.destroy(); }
    const old = document.getElementById('map');
    const el = document.createElement('div');
    el.id = 'map';
    el.setAttribute('role', 'application');
    el.setAttribute('aria-label', 'Map of places');
    old.replaceWith(el);
    const m = await makeMap(el, key);
    ui.map = m;
    m.onDragStart(() => { userMoved = true; });
    if (view) m.setView([view.c.lat, view.c.lng], view.z);
    else { const a = areaByKey(ui.area); if (a) m.setView(a.center, a.zoom); }
    if (lastPos) m.setMe(lastPos);
    refreshMarkers();
    scheduleRender();
  });
  return building;
}

function restyle() {
  const key = mapStyleKey();
  const dark = effectiveTheme() === 'dark';
  const google = !!ui.map && ui.map.provider === 'google';
  // Google's light/dark scheme is fixed per map, so a theme change rebuilds it.
  if (!ui.map || google !== wantsGoogle(key) || (google && ui.map.dark !== dark)) initMap(key);
  else ui.map.setStyle(key, dark);
}

// Google calls this when the key is refused (wrong site, billing off, API not enabled).
window.gm_authFailure = () => {
  toast('Google Maps key not accepted — showing OpenStreetMap');
  if (ui.map && ui.map.provider === 'google') initMap('osm');
};

// Stop Safari zooming the whole page with a pinch; the maps keep their own pinch zoom.
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => {
    if (!(e.target && e.target.closest && e.target.closest('#map, .minimap'))) e.preventDefault();
  }, { passive: false });
}

function boot() {
  applyLook();
  installActions(document.body);
  installPanelDrag(document.getElementById('overlays'));
  installSheet(() => renderNear());
  setWide();
  if (WIDE.addEventListener) WIDE.addEventListener('change', setWide); else if (WIDE.addListener) WIDE.addListener(setWide);

  const prefs = getPrefs();
  if (prefs.mode === 'cloud' && FIREBASE_CONFIG && prefs.tripKey) {
    store.startCloud(FIREBASE_CONFIG, prefs.tripKey).catch(() => toast('Sync could not start — showing saved data'));
  } else {
    store.startLocal();
    if (!prefs.mode) openJoin();
  }
  store.addEventListener('change', scheduleRender);
  store.addEventListener('status', () => { if (isOpen('settings')) refreshPanels(); });
  onRender(scheduleRender);

  ui.day = focusDay();
  ui.area = initialArea();

  const hash = (location.hash || '').slice(1);
  showTab(hash || (ui.wide ? 'today' : 'map'));
  initMap();

  loadBatches().then(scheduleRender);

  let firstFix = true;
  onPosition((pos) => {
    if (!pos) return;
    lastPos = pos;
    if (ui.map) ui.map.setMe(pos);
    if (firstFix) {
      firstFix = false;
      const k = areaOf({ lat: pos.lat, lng: pos.lng });
      if (k && k !== 'other' && !userMoved) { ui.area = k; if (ui.map) ui.map.flyTo([pos.lat, pos.lng], 15); }
    }
    scheduleRender();
  });
  startWatch();

  setTimeout(() => geocodeMissing().then((n) => { if (n) toast(`Placed ${n} pin${n > 1 ? 's' : ''} from addresses`); }), 4000);

  document.addEventListener('mapstyle', restyle);
  window.addEventListener('themechange', () => { restyle(); scheduleRender(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const d = focusDay();
    if (d !== ui.day && ui.tab !== 'today') ui.day = d;
    scheduleRender();
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
