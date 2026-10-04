// Place card (bottom sheet over the map) and the "Show in Japanese" screen.
import { store } from '../store.js';
import { getPrefs, setPrefs } from '../prefs.js';
import { MODES, SOURCE_TYPES, MEAL_LABEL } from '../config.js';
import { icon } from '../icons.js';
import { esc, gmPlaceUrl, gmDirUrl, hasCoords, distKm, fmtDist, fmtClock, fmtDay, whenParts, todayJST, addDays } from '../util.js';
import { on, openPanel, closePanel, refreshPanel, toast, badge, grab, closeBtn, isOpen } from './core.js';
import { ui, rerender } from '../state.js';
import { placeStatus, catOf, areaOf, areaByKey, tripDays, focusDay } from '../trip.js';
import { refPoint, statusTags } from './places.js';
import { lightTimes } from '../sun.js';
import { openEditPlace } from './edit.js';

export function openPlace(id) {
  const p = store.get('places', id);
  if (!p) return;
  ui.selected = id;
  ui.cardExpanded = false;
  if (ui.map) ui.map.select(id);
  openPanel('card', () => cardHtml(ui.selected), {
    kind: 'card',
    onClose: () => { ui.selected = null; if (ui.map) ui.map.select(null); },
    expand: { get: () => ui.cardExpanded, set: (v) => { ui.cardExpanded = v; setCardSize(); } },
  });
  setCardSize();
}

function setCardSize() {
  const w = document.querySelector('[data-panel="card"]');
  if (w) w.classList.toggle('expanded', ui.cardExpanded);
}

function modeFor(p) {
  const prefs = getPrefs();
  const a = areaByKey(areaOf(p));
  const key = a ? (prefs.modes[a.key] || a.mode) : 'transit';
  return MODES[key] ? key : 'transit';
}

function bookingBox(b) {
  const s = whenParts(b.start), e = whenParts(b.end);
  const shown = ui.revealed.has(b.id);
  const statusTag = b.status === 'confirmed' ? `<span class="tag ok">${icon('check')}Booked</span>`
    : b.status === 'hold' ? '<span class="tag hold">Held</span>' : b.status === 'to_cancel' ? '<span class="tag hold">To cancel</span>' : '';
  const when = b.kind === 'hotel'
    ? `${s.date ? fmtDay(s.date) : ''}${s.time ? ' ' + s.time : ''} → ${e.date ? fmtDay(e.date) : ''}${e.time ? ' ' + e.time : ''}`
    : `${s.date ? fmtDay(s.date) : ''}${s.time ? ' · ' + s.time : ''}`;
  const ref = b.ref ? `<div class="hrow"><span class="vstack"><span class="t-cap">Reference</span><span class="masked strong">${esc(shown ? b.ref : mask(b.ref))}</span></span>
    <button type="button" class="reveal" data-action="reveal" data-id="${esc(b.id)}">${icon(shown ? 'eyeOff' : 'eye', 's')}${shown ? 'Hide' : 'Show'}</button></div>` : '';
  const secret = b.secret ? `<div class="t-cap">PIN ${esc(shown ? b.secret : '••••')}</div>` : '';
  return `<div class="bookbox ${b.status}">
    <div class="hrow"><b>${esc(b.title || 'Booking')}</b>${statusTag}</div>
    <div class="t-sec">${esc(when)}</div>
    ${b.details ? `<div class="t-sec">${esc(b.details)}</div>` : ''}
    ${(b.meals_included || []).length ? `<div class="t-sec">Meals included: ${esc(b.meals_included.map((m) => MEAL_LABEL[m] || m).join(', '))}</div>` : ''}
    ${b.cancel_by ? `<div class="t-sec">Free cancel until ${esc(b.cancel_by)}</div>` : ''}
    ${b.notes ? `<div class="t-sec">${esc(b.notes)}</div>` : ''}
    ${ref}${secret}
    <button type="button" class="txtbtn sm" data-action="edit-booking" data-id="${esc(b.id)}">${icon('pencil', 's')}Edit booking</button>
  </div>`;
}

function mask(ref) { const s = String(ref); return s.length <= 4 ? '••••' : '•'.repeat(Math.min(s.length - 4, 8)) + s.slice(-4); }

function lightBlock(p, day) {
  if (!hasCoords(p)) return '';
  const t = lightTimes(day, p.lat, p.lng);
  const r = (a) => `${fmtClock(a[0])}–${fmtClock(a[1])}`;
  return `<div class="sect">
    <h3>${icon('sun', 's')}Light · ${esc(fmtDay(day))}</h3>
    <div class="light">
      <div class="lcell blue"><span>Blue</span><b>${r(t.blueAM)}</b></div>
      <div class="lcell gold"><span>Golden</span><b>${r(t.goldenAM)}</b></div>
      <div class="lcell gold"><span>Golden</span><b>${r(t.goldenPM)}</b></div>
      <div class="lcell blue"><span>Blue</span><b>${r(t.bluePM)}</b></div>
    </div>
    <div class="t-cap">Sunrise ${fmtClock(t.sunrise)} · sunset ${fmtClock(t.sunset)}. Golden: low, warm light. Blue: sun just below the horizon — deep-blue sky, lights on. Flat-horizon times; hills make sunrise later.</div>
  </div>`;
}

function kv(rows) {
  const r = rows.filter(([, v]) => v);
  if (!r.length) return '';
  return `<dl class="kv">${r.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function cardHtml(id) {
  const p = store.get('places', id);
  if (!p) return `${grab()}<div class="pad">This place was removed.</div>`;
  const prefs = getPrefs();
  const cat = catOf(p);
  const st = placeStatus(p);
  const ref = refPoint();
  const d = ref && ref.kind !== 'map' && hasCoords(p) ? distKm(ref, p) : null; // distance from the map centre means nothing here
  const a = areaByKey(areaOf(p));
  const mode = modeFor(p);
  const day = ui.day || focusDay();
  const alt = [p.ja ? `<span class="jp">${esc(p.ja)}</span>` : '', p.romaji && p.romaji !== p.name ? `<span class="romaji">${esc(p.romaji)}</span>` : ''].filter(Boolean).join(' · ');
  const pr = p.practical || {};
  const ph = p.photo || {};
  const practical = kv([['Hours', pr.hours], ['Closed', pr.closed], ['Last order', pr.last_order], ['Price', pr.price], ['Payment', pr.payment],
    ['Booking', pr.reservation], ['Queue', pr.queue], ['Seats', pr.seats], ['Rules', pr.rules], ['Station', p.station], ['Phone', p.phone],
    ['Address', p.address_en], ['住所', p.address_ja], ['Area', !p.address_en && !p.address_ja ? p.near : '']]);
  const pinNote = !hasCoords(p) ? 'No pin yet. Edit the place and drag the map onto it. Pasting its Google Maps link also makes the Maps buttons exact.'
    : p.coord === 'gsi' || p.coord === 'osm' ? 'Pin placed from the address — it may be off by a block.' : '';
  const photo = kv([['Shot', ph.shot], ['Best time', ph.best_time], ['Getting there', ph.access], ['Rules', ph.rules], ['Video', ph.video], ['Gear', ph.gear]]);
  const sources = (p.research && p.research.sources) || [];
  const rs = p.research || {};
  const edited = p.edited && p.edited.by ? ' · edited by ' + esc(p.edited.by) : '';
  const prov = p.origin === 'claude'
    ? `${icon('sparkles')}<span>Researched by Claude${rs.at ? ' · ' + esc(rs.at.slice(0, 10)) : ''}${rs.confidence ? ' · ' + esc(rs.confidence) + ' confidence' : ''}${edited}</span>`
    : `${icon('pencil')}<span>Added by ${esc((p.added && p.added.by) || 'you')}${edited}</span>`;

  return `${grab()}
  <button type="button" class="card-toggle" data-action="card-toggle" aria-label="${ui.cardExpanded ? 'Collapse' : 'Expand'} card"></button>
  <div class="scroll card-scroll">
    <div class="nameblock">
      ${badge(p.category, 'lg')}
      <div class="main">
        <h2>${esc(p.name)}</h2>
        ${alt ? `<div class="alt">${alt}</div>` : ''}
        <div class="t-sec">${esc(cat.label)}${a ? ' · ' + esc(a.name) : ''}${d !== null ? ' · ' + fmtDist(d) + (ref.kind === 'base' ? ' from ' + esc(ref.label) : '') : ''}</div>
        <div class="tags">${statusTags(p, day)}</div>
      </div>
      ${closeBtn('card')}
    </div>

    ${st.bookings.map(bookingBox).join('')}
    ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
    ${p.order ? `<p class="summary order"><b>Order</b> ${esc(p.order)}</p>` : ''}

    <div class="btnrow">
      <a class="btn out" href="${esc(gmPlaceUrl(p, prefs.linkMode))}" target="_blank" rel="noopener">${icon('external', 's')}Google Maps</a>
      <a class="btn pri" href="${esc(gmDirUrl(p, MODES[mode].gm, prefs.linkMode))}" target="_blank" rel="noopener">${icon('navigation', 's')}Directions <span class="sub">${esc(MODES[mode].label)}</span></a>
    </div>
    <div class="modes">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="mini${k === mode ? ' on' : ''}" data-action="set-mode" data-area="${esc(a ? a.key : '')}" data-value="${k}">${esc(m.label)}</button>`).join('')}</div>

    <div class="qa">
      <button type="button" data-action="show-ja" data-id="${esc(p.id)}">${icon('languages')}Japanese</button>
      ${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}Call</a>` : `<button type="button" disabled>${icon('phone')}Call</button>`}
      <button type="button" data-action="toggle-visited" data-id="${esc(p.id)}" class="${st.visited ? 'on' : ''}">${icon('check')}${st.visited ? 'Visited' : 'Visited?'}</button>
      <button type="button" data-action="toggle-must" data-id="${esc(p.id)}" class="${st.must ? 'on' : ''}">${icon('star')}Must-do</button>
    </div>

    ${lightBlock(p, day)}
    ${photo ? `<div class="sect"><h3>${icon('video', 's')}Photo and video</h3>${photo}</div>` : ''}
    ${practical || p.website ? `<div class="sect"><h3>${icon('info', 's')}Practical</h3>${practical}${p.website ? `<a class="weblink" href="${esc(p.website)}" target="_blank" rel="noopener">${icon('external', 's')}Website</a>` : ''}${pr.as_of ? `<div class="t-cap">Checked ${esc(pr.as_of)} — confirm before a long trip across town.</div>` : ''}${pinNote ? `<div class="t-cap">${esc(pinNote)}</div>` : ''}</div>` : (pinNote ? `<div class="sect"><div class="t-cap">${esc(pinNote)}</div></div>` : '')}
    ${p.notes ? `<div class="sect"><h3>${icon('pencil', 's')}Notes</h3><p class="t-body">${esc(p.notes)}</p></div>` : ''}
    ${p.planned ? `<div class="sect"><h3>${icon('calendar', 's')}Planned</h3><p class="t-body">${esc(fmtDay(p.planned.date))}${p.planned.slot ? ' · ' + esc(MEAL_LABEL[p.planned.slot] || p.planned.slot) : ''} <button type="button" class="txtbtn sm" data-action="unplan" data-id="${esc(p.id)}">Remove</button></p></div>` : ''}

    <div class="sect">
      <div class="prov">${prov}</div>
      ${rs.why ? `<p class="why">${esc(rs.why)}</p>` : ''}
      ${rs.notes ? `<p class="t-sec">${esc(rs.notes)}</p>` : ''}
      ${rs.open_questions && rs.open_questions.length ? `<div class="t-sec"><b>Unconfirmed</b><ul class="qs">${rs.open_questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
      ${sources.length ? `<ul class="sources">${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a> <span class="t-cap">${esc(SOURCE_TYPES[s.type] || '')}</span></li>`).join('')}</ul>` : ''}
      <div class="minis">
        <button type="button" class="btn sec" data-action="add-to-day" data-id="${esc(p.id)}">${icon('calendarPlus', 's')}Add to day</button>
        <button type="button" class="btn sec" data-action="edit-place" data-id="${esc(p.id)}">${icon('pencil', 's')}Edit</button>
        <button type="button" class="btn sec" data-action="place-more" data-id="${esc(p.id)}">${icon('ellipsis', 's')}More</button>
      </div>
    </div>
  </div>`;
}

// ---------- Japanese screen ----------
function japaneseHtml(id) {
  const p = store.get('places', id);
  if (!p) return '';
  const st = placeStatus(p);
  const noJa = !p.ja && !p.address_ja;
  return `<div class="jwrap">
    <div class="hrow pad-top">${closeBtn('ja')}<button type="button" class="btn sm sec" data-action="copy-ja" data-id="${esc(p.id)}">${icon('copy', 's')}Copy</button></div>
    <div class="scroll">
      <span class="t-over">Show this screen</span>
      ${noJa ? '<p class="t-sec">No Japanese name or address saved yet — edit the place to add them.</p>' : ''}
      ${p.ja ? `<p class="jbig">${esc(p.ja)}</p>` : `<p class="jbig latin">${esc(p.name)}</p>`}
      ${p.address_ja ? `<p class="jmid">${esc(p.address_ja)}</p>` : ''}
      ${p.romaji ? `<p class="romaji big">${esc(p.romaji)}</p>` : ''}
      ${p.address_en ? `<p class="t-sec">${esc(p.address_en)}</p>` : ''}
      <div class="divider"></div>
      <p class="jmid">ここまでお願いします。</p>
      <p class="t-sec"><span class="romaji">Koko made onegaishimasu</span> — please take me here.</p>
      ${st.booked ? `<p class="jmid">予約しています。</p><p class="t-sec"><span class="romaji">Yoyaku shite imasu</span> — I have a reservation.</p>` : ''}
    </div>
    <div class="jfoot">
      ${p.phone ? `<a class="btn sec" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${icon('phone', 's')}Call</a>` : ''}
      <a class="btn pri" href="${esc(gmDirUrl(p, MODES[modeFor(p)].gm, getPrefs().linkMode))}" target="_blank" rel="noopener">${icon('navigation', 's')}Directions</a>
    </div>
  </div>`;
}

// ---------- add to day ----------
function addToDayHtml(id) {
  const p = store.get('places', id);
  const days = tripDays();
  const cur = (p && p.planned) || {};
  const slots = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['am', 'Morning'], ['pm', 'Afternoon'], ['night', 'Evening']];
  return `${grab()}
    <div class="sheet-head"><h2 class="t-title">Add to a day</h2>${closeBtn('addday')}</div>
    <div class="scroll pad-lg">
      <p class="t-sec">${esc(p ? p.name : '')}</p>
      ${days.length ? '' : '<p class="t-sec">Trip dates appear once bookings are loaded.</p>'}
      <div class="daygrid">${days.map((d) => `<button type="button" class="daybtn${cur.date === d ? ' on' : ''}" data-action="plan-day" data-id="${esc(id)}" data-day="${d}">${esc(fmtDay(d))}</button>`).join('')}</div>
      <span class="t-over">Slot</span>
      <div class="chips wrap">${slots.map(([k, l]) => `<button type="button" class="chip plain${cur.slot === k ? ' on' : ''}" data-action="plan-slot" data-id="${esc(id)}" data-slot="${k}">${esc(l)}</button>`).join('')}</div>
    </div>`;
}

// ---------- more menu ----------
function moreHtml(id) {
  const p = store.get('places', id);
  return `${grab()}
    <div class="sheet-head"><h2 class="t-title">${esc(p ? p.name : '')}</h2>${closeBtn('more')}</div>
    <div class="rows">
      <button type="button" class="row" data-action="copy-coords" data-id="${esc(id)}">${icon('copy')}<span class="main"><span class="name">Copy coordinates</span></span></button>
      <button type="button" class="row" data-action="add-booking" data-id="${esc(id)}">${icon('calendarPlus')}<span class="main"><span class="name">Add a booking here</span></span></button>
      ${p && p.status === 'skipped'
        ? `<button type="button" class="row" data-action="unhide-place" data-id="${esc(id)}">${icon('eye')}<span class="main"><span class="name">Show this place again</span><span class="meta">Back on the map and in lists</span></span></button>`
        : `<button type="button" class="row" data-action="hide-place" data-id="${esc(id)}">${icon('eyeOff')}<span class="main"><span class="name">Hide this place</span><span class="meta">Hidden from map and lists; Filters › Show hidden brings it back</span></span></button>`}
      <button type="button" class="row danger" data-action="delete-place" data-id="${esc(id)}">${icon('trash')}<span class="main"><span class="name">Delete</span><span class="meta">Removes it for everyone</span></span></button>
    </div>`;
}

// ---------- actions ----------
on('card-toggle', () => { ui.cardExpanded = !ui.cardExpanded; setCardSize(); });
on('reveal', (d) => { if (ui.revealed.has(d.id)) ui.revealed.delete(d.id); else ui.revealed.add(d.id); refreshPanel('card'); rerender('trip'); });
on('set-mode', (d) => {
  const modes = { ...getPrefs().modes };
  if (d.area) modes[d.area] = d.value;
  setPrefs({ modes }); refreshPanel('card');
});
on('show-ja', (d) => openPanel('ja', () => japaneseHtml(d.id), { kind: 'full' }));
on('copy-ja', async (d) => {
  const p = store.get('places', d.id);
  const text = [p.ja, p.address_ja, p.phone].filter(Boolean).join('\n') || p.name;
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast('Copy not allowed here'); }
});
on('toggle-visited', (d) => { const p = store.get('places', d.id); store.patch('places', d.id, { status: p.status === 'visited' ? 'open' : 'visited' }); });
on('toggle-must', (d) => { const p = store.get('places', d.id); store.patch('places', d.id, { priority: p.priority === 'must' ? 'want' : 'must' }); });
on('add-to-day', (d) => openPanel('addday', () => addToDayHtml(d.id)));
on('plan-day', (d) => { const p = store.get('places', d.id); store.patch('places', d.id, { planned: { ...(p.planned || {}), date: d.day } }); refreshPanel('addday'); toast('Added to ' + fmtDay(d.day)); });
on('plan-slot', (d) => {
  const p = store.get('places', d.id);
  const date = (p.planned && p.planned.date) || ui.day || focusDay();
  store.patch('places', d.id, { planned: { date, slot: d.slot } }); refreshPanel('addday');
});
on('unplan', (d) => { const p = store.get('places', d.id); const { planned, ...rest } = p; store.put('places', rest); });
on('edit-place', (d) => openEditPlace(d.id));
on('place-more', (d) => openPanel('more', () => moreHtml(d.id)));
on('copy-coords', async (d) => {
  const p = store.get('places', d.id);
  if (!hasCoords(p)) { toast('No pin yet'); return; }
  try { await navigator.clipboard.writeText(`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`); toast('Coordinates copied'); } catch (e) { toast('Copy not allowed here'); }
  closePanel('more');
});
on('hide-place', (d) => { store.patch('places', d.id, { status: 'skipped' }); closePanel('more'); closePanel('card'); toast('Hidden'); });
on('unhide-place', (d) => { store.patch('places', d.id, { status: 'open' }); closePanel('more'); toast('Shown again'); });
on('delete-place', (d) => {
  const p = store.get('places', d.id);
  if (!confirm(`Delete “${p.name}” for everyone?`)) return;
  store.remove('places', d.id); closePanel('more'); closePanel('card'); toast('Deleted');
});

export function refreshCard() { if (isOpen('card')) refreshPanel('card'); }
