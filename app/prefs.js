// Per-device preferences (never synced).
const KEY = 'nippon:prefs:v1';

const DEFAULTS = {
  theme: 'auto',          // auto | light | dark
  density: 'clean',       // clean | dense
  pins: 'signage',        // signage | outline | mono
  mapStyle: 'osm',        // see MAP_STYLES
  linkMode: 'web',        // web | app (Google Maps app URL scheme)
  labels: 'key',          // key (booked & must-do) | all | off
  name: '',               // traveller name on this device
  tripKey: '',
  mode: '',               // '' (not chosen) | local | cloud
  area: '',               // last area shown
  modes: {},              // per-area directions mode override
  filters: { chips: [], bookedOnly: false, mustOnly: false, hideVisited: true, showHidden: false, source: 'all', meal: '' },
  showResearched: true,
};

let prefs = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...p, filters: { ...DEFAULTS.filters, ...(p.filters || {}) }, modes: { ...(p.modes || {}) } };
  } catch (e) {
    return { ...DEFAULTS, filters: { ...DEFAULTS.filters } };
  }
}

export function getPrefs() { return prefs; }

export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* private mode: keep in memory */ }
  applyLook();
  return prefs;
}

export function setFilters(patch) {
  return setPrefs({ filters: { ...prefs.filters, ...patch } });
}

const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function effectiveTheme() {
  if (prefs.theme === 'light' || prefs.theme === 'dark') return prefs.theme;
  return darkMQ && darkMQ.matches ? 'dark' : 'light';
}

export function applyLook() {
  const root = document.documentElement;
  const theme = effectiveTheme();
  root.dataset.theme = theme;
  root.dataset.density = prefs.density;
  root.dataset.pins = prefs.pins;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0E0F11' : '#F3F4F6');
}

if (darkMQ) {
  const onChange = () => { if (prefs.theme === 'auto') { applyLook(); window.dispatchEvent(new Event('themechange')); } };
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', onChange); else if (darkMQ.addListener) darkMQ.addListener(onChange);
}
