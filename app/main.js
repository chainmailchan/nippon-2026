// Boot, tabs and rendering.
import { applyLook, getPrefs, effectiveTheme } from './prefs.js';
import { store } from './store.js';
import { FIREBASE_CONFIG } from './config.js';
import { installActions, on, refreshPanels, closePanel, isOpen, toast } from './ui/core.js';
import { ui, onRender } from './state.js';
import { TripMap } from './map.js';
import { renderMapView, renderNear, initialArea } from './ui/mapview.js';
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
    if (a && ui.map) ui.map.map.setView(a.center, a.zoom);
  }
}

function boot() {
  applyLook();
  installActions(document.body);
  setWide();
  if (WIDE.addEventListener) WIDE.addEventListener('change', setWide); else if (WIDE.addListener) WIDE.addListener(setWide);

  ui.map = new TripMap(document.getElementById('map'), {
    onSelect: (id) => openPlace(id),
    onMapClick: () => closePanel('card'),
    onMoveEnd: () => renderNear(),
  });
  ui.map.map.on('dragstart', () => { userMoved = true; });
  ui.map.setStyle(getPrefs().mapStyle, effectiveTheme() === 'dark');

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
  const a = areaByKey(ui.area);
  if (a) ui.map.map.setView(a.center, a.zoom);

  const hash = (location.hash || '').slice(1);
  showTab(hash || (ui.wide ? 'today' : 'map'));

  loadBatches().then(scheduleRender);

  let firstFix = true;
  onPosition((pos) => {
    if (!pos) return;
    ui.map.setMe(pos);
    if (firstFix) {
      firstFix = false;
      const k = areaOf({ lat: pos.lat, lng: pos.lng });
      if (k && k !== 'other' && !userMoved) { ui.area = k; ui.map.flyTo([pos.lat, pos.lng], 15); }
    }
    scheduleRender();
  });
  startWatch();

  setTimeout(() => geocodeMissing().then((n) => { if (n) toast(`Placed ${n} pin${n > 1 ? 's' : ''} from addresses`); }), 4000);

  const restyle = () => ui.map.setStyle(getPrefs().mapStyle, effectiveTheme() === 'dark');
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
