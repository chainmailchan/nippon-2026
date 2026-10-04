// Settings and first-run (join) screens.
import { store } from '../store.js';
import { getPrefs, setPrefs, effectiveTheme } from '../prefs.js';
import { mapStyleRows } from './mapview.js';
import { APP_VERSION, FIREBASE_CONFIG, MODES, AREA_ORDER } from '../config.js';
import { icon } from '../icons.js';
import { esc, download } from '../util.js';
import { on, openPanel, closePanel, refreshPanel, toast, seg } from './core.js';
import { ui, rerender } from '../state.js';
import { areaByKey } from '../trip.js';

function syncLine() {
  const s = store.status || {};
  if (store.mode === 'local') return `${icon('cloudOff')}<span>This device only — nothing is shared yet</span>`;
  const glyph = s.state === 'synced' ? 'cloud' : s.state === 'error' ? 'alert' : 'cloudOff';
  return `${icon(glyph)}<span>${esc(s.detail || s.state || '')}</span>`;
}

function settingsHtml() {
  const p = getPrefs();
  const key = p.tripKey || '';
  return `<div class="navbar"><button type="button" class="txtbtn mut" data-action="close-panel" data-id="settings">Close</button><div class="ttl">Settings</div><span></span></div>
  <div class="scroll">
    <div class="ghead"><span class="t-over">Look</span></div>
    <div class="group">
      <div class="setrow stack"><b>Theme</b>${seg('Theme', [['auto', 'Auto', 'contrast'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']], p.theme, 'set-pref', 'data-key="theme"')}</div>
      <div class="setrow stack"><span class="lbl"><b>Layout</b><span class="t-sec">Dense shows more per row and labels every pin.</span></span>${seg('Layout', [['clean', 'Clean'], ['dense', 'Dense']], p.density, 'set-pref', 'data-key="density"')}</div>
      <div class="setrow stack"><b>Pin style</b>${seg('Pin style', [['signage', 'Signage'], ['outline', 'Outline'], ['mono', 'Mono']], p.pins, 'set-pref', 'data-key="pins"')}</div>
      <div class="setrow stack"><b>Pin labels</b>${seg('Pin labels', [['key', 'Booked & must'], ['all', 'All'], ['off', 'Off']], p.labels, 'set-pref', 'data-key="labels"')}</div>
    </div>

    <div class="ghead"><span class="t-over">Map</span></div>
    <div class="group">${mapStyleRows()}</div>

    <div class="ghead"><span class="t-over">Google Maps buttons</span></div>
    <div class="group">
      <div class="setrow stack"><span class="lbl"><b>Open in</b><span class="t-sec">If “Web link” opens a browser page instead of the Google Maps app, try “Google Maps app”.</span></span>
        ${seg('Open in', [['web', 'Web link'], ['app', 'Google Maps app']], p.linkMode, 'set-pref', 'data-key="linkMode"')}</div>
      ${AREA_ORDER.map((k) => { const a = areaByKey(k); const m = p.modes[k] || a.mode; return `<div class="setrow"><b>${esc(a.name)}</b>${seg(a.name, Object.entries(MODES).map(([mk, mv]) => [mk, mv.label]), m, 'set-mode-area', `data-area="${k}"`)}</div>`; }).join('')}
    </div>

    <div class="ghead"><span class="t-over">You</span></div>
    <div class="group">
      <div class="setrow stack"><label class="lbl" for="set-name"><b>Your name</b><span class="t-sec">Shown as “added by” on places you add.</span></label>
        <input id="set-name" class="input" value="${esc(p.name)}" placeholder="First name" data-change="set-name" autocomplete="given-name"></div>
    </div>

    <div class="ghead"><span class="t-over">Trip and sync</span></div>
    <div class="group">
      <div class="setrow syncline">${syncLine()}</div>
      ${store.mode === 'cloud' ? `<div class="setrow"><span class="lbl"><b>Trip key</b><span class="t-sec masked">${esc(ui.revealKey ? key : key.slice(0, 4) + '••••••••')}</span></span><button type="button" class="txtbtn" data-action="toggle-key">${ui.revealKey ? 'Hide' : 'Show'}</button></div>
        <button type="button" class="row" data-action="leave-trip">${icon('cloudOff')}<span class="main"><span class="name">Stop syncing on this device</span></span></button>`
      : `<button type="button" class="row" data-action="open-join">${icon('key')}<span class="main"><span class="name">Join the shared trip</span><span class="meta">${FIREBASE_CONFIG ? 'Enter the trip key' : 'Sync isn’t set up yet'}</span></span>${icon('chevronRight', 's')}</button>`}
    </div>

    <div class="ghead"><span class="t-over">Data</span></div>
    <div class="group">
      <button type="button" class="row" data-action="ics">${icon('calendarPlus')}<span class="main"><span class="name">Add bookings to Calendar</span><span class="meta">Includes free-cancellation deadlines</span></span></button>
      <button type="button" class="row" data-action="export">${icon('download')}<span class="main"><span class="name">Back up everything</span><span class="meta">Downloads one file</span></span></button>
      <button type="button" class="row" data-action="open-import">${icon('upload')}<span class="main"><span class="name">Import</span><span class="meta">Paste a backup or a data file</span></span></button>
      <div class="setrow"><span class="lbl"><b>Show researched places</b></span><button type="button" class="switch${p.showResearched ? ' on' : ''}" role="switch" aria-checked="${p.showResearched}" data-action="toggle-researched" aria-label="Show researched places"></button></div>
    </div>

    <p class="t-cap pad">Version ${APP_VERSION} · Map data © OpenStreetMap contributors · <a href="vendor/LICENSES.md" target="_blank" rel="noopener">Licences</a></p>
  </div>`;
}

function joinHtml() {
  const p = getPrefs();
  const canSync = !!FIREBASE_CONFIG;
  return `<div class="join">
    <div class="scroll">
      <span class="t-over">Nippon 2026</span>
      <h1>Your trip, on one map</h1>
      <p class="t-sec">Bookings, day plans and every place we've saved — shared between the three of you.</p>
      <div class="field"><label for="j-name">Your name</label><input id="j-name" class="input" value="${esc(p.name)}" placeholder="First name" autocomplete="given-name"></div>
      ${canSync ? `<div class="field"><label for="j-key">Trip key</label><input id="j-key" class="input mono" value="" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
        <button type="button" class="btn pri" data-action="join">${icon('key', 's')}Join the trip</button>` : `<div class="banner">${icon('info')}<span>Sync isn't set up yet. You can try everything on this device; nothing is shared until sync is on.</span></div>`}
      <button type="button" class="btn ${canSync ? 'out' : 'pri'}" data-action="go-local">Try on this device only</button>
    </div>
  </div>`;
}

function importHtml() {
  return `<div class="sheet-head"><button type="button" class="txtbtn mut" data-action="close-panel" data-id="import">Cancel</button><h2 class="t-title">Import</h2><button type="button" class="txtbtn" data-action="do-import">Import</button></div>
  <div class="scroll form"><div class="field"><label for="imp">Paste data</label><textarea id="imp" class="tall mono" placeholder='{"places": {…}, "bookings": {…}}'></textarea></div>
  <p class="t-cap pad">Items with the same id are replaced. Everything imported is shared with the trip when sync is on.</p></div>`;
}

export function openSettings() { openPanel('settings', settingsHtml, { kind: 'full' }); }
export function openJoin() { openPanel('join', joinHtml, { kind: 'full', keepOnRefresh: true }); }

on('settings', () => openSettings());
on('set-pref', (d) => {
  setPrefs({ [d.key]: d.value });
  if (d.key === 'theme') document.dispatchEvent(new Event('mapstyle'));
  refreshPanel('settings'); rerender('*');
});
on('set-mode-area', (d) => { setPrefs({ modes: { ...getPrefs().modes, [d.area]: d.value } }); refreshPanel('settings'); });
on('set-name', (d, el) => { setPrefs({ name: el.value.trim() }); toast('Saved'); });
on('toggle-key', () => { ui.revealKey = !ui.revealKey; refreshPanel('settings'); });
on('toggle-researched', () => { setPrefs({ showResearched: !getPrefs().showResearched }); refreshPanel('settings'); rerender('map'); });
on('export', () => download(`nippon-2026-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.exportAll(), null, 2)));
on('open-import', () => openPanel('import', importHtml, { kind: 'sheet', keepOnRefresh: true }));
on('do-import', () => {
  const el = document.getElementById('imp');
  try {
    const obj = JSON.parse(el.value);
    const n = store.importAll(obj);
    closePanel('import'); toast(`Imported ${n} item${n === 1 ? '' : 's'}`); rerender('*');
  } catch (e) { toast('That isn’t valid data'); }
});
on('open-join', () => { closePanel('settings'); openJoin(); });
on('join', () => {
  const name = document.getElementById('j-name').value.trim();
  const key = document.getElementById('j-key').value.trim().toLowerCase();
  if (!name) { toast('Add your name'); return; }
  if (key.length < 12) { toast('Check the trip key'); return; }
  setPrefs({ name, tripKey: key, mode: 'cloud' });
  location.reload();
});
on('go-local', () => {
  const el = document.getElementById('j-name');
  setPrefs({ name: el ? el.value.trim() : getPrefs().name, mode: 'local' });
  closePanel('join');
  if (store.mode !== 'local') location.reload();
});
on('leave-trip', () => {
  if (!confirm('Stop syncing on this device? The shared trip is not affected.')) return;
  setPrefs({ mode: 'local', tripKey: '' });
  location.reload();
});
