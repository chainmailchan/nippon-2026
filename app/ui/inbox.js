// Research inbox: review places Claude researched before they reach the map.
import { store } from '../store.js';
import { CATEGORIES, SOURCE_TYPES } from '../config.js';
import { icon } from '../icons.js';
import { esc, fmtDayShort } from '../util.js';
import { on, openPanel, refreshPanel, toast, badge } from './core.js';
import { rerender } from '../state.js';
import { loadBatches, isPending, reviewOf, keep, skip, undo } from '../research.js';
import { geocodeMissing } from '../geo.js';

let batches = [];
let openBatch = null;

export async function openInbox() {
  batches = await loadBatches(true);
  if (!openBatch && batches.length) {
    const firstPending = batches.find((b) => (b.places || []).some(isPending));
    openBatch = (firstPending || batches[0]).batch;
  }
  openPanel('inbox', inboxHtml, { kind: 'full' });
}

function itemHtml(b, p) {
  const r = reviewOf(p.id);
  const kept = store.get('places', p.id);
  const cat = CATEGORIES[p.category] || CATEGORIES.restaurant;
  const pr = p.practical || {};
  const rs = p.research || {};
  const sources = rs.sources || [];
  const status = r ? (r.decision === 'kept' ? `<span class="tag ok">${icon('check')}Kept</span>` : '<span class="tag neutral">Skipped</span>') : (kept ? `<span class="tag ok">${icon('check')}On the map</span>` : '');
  const facts = [['Price', pr.price], ['Hours', pr.hours], ['Closed', pr.closed], ['Booking', pr.reservation]].filter(([, v]) => v);
  return `<div class="icard${r && r.decision === 'skipped' ? ' dimmed' : ''}">
    <div class="top-line">${badge(p.category)}
      <div class="vstack grow">
        <b>${esc(p.name)}</b>
        ${p.ja || (p.romaji && p.romaji !== p.name) ? `<span class="t-sec">${p.ja ? `<span class="jp">${esc(p.ja)}</span>` : ''}${p.ja && p.romaji && p.romaji !== p.name ? ' · ' : ''}${p.romaji && p.romaji !== p.name ? `<span class="romaji">${esc(p.romaji)}</span>` : ''}</span>` : ''}
        <span class="t-sec">${esc([cat.label, p.station || p.near, rs.confidence ? rs.confidence + ' confidence' : ''].filter(Boolean).join(' · '))}</span>
      </div>${status}
    </div>
    ${p.summary ? `<div class="why">${esc(p.summary)}</div>` : ''}
    ${rs.why ? `<div class="t-sec"><b>Why</b> ${esc(rs.why)}</div>` : ''}
    ${p.order ? `<div class="t-sec"><b>Order</b> ${esc(p.order)}</div>` : ''}
    ${facts.length ? `<dl class="kv">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${rs.notes ? `<div class="t-sec">${esc(rs.notes)}</div>` : ''}
    ${rs.open_questions && rs.open_questions.length ? `<div class="t-cap"><b>Unconfirmed</b><ul class="qs">${rs.open_questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
    ${sources.length ? `<div class="prov">${icon('link')}${sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title || '')}">${esc(SOURCE_TYPES[s.type] || 'Source')}</a>`).join(' · ')}</div>` : ''}
    <div class="minis">${r || kept
      ? `<button type="button" class="btn out" data-action="inbox-undo" data-batch="${esc(b.batch)}" data-id="${esc(p.id)}">${icon('undo', 's')}Undo</button>`
      : `<button type="button" class="btn out" data-action="inbox-skip" data-batch="${esc(b.batch)}" data-id="${esc(p.id)}">Skip</button><button type="button" class="btn pri" data-action="inbox-keep" data-batch="${esc(b.batch)}" data-id="${esc(p.id)}">Keep</button>`}
    </div>
  </div>`;
}

function inboxHtml() {
  const blocks = batches.map((b) => {
    const places = b.places || [];
    const pending = places.filter(isPending).length;
    const isOpen = openBatch === b.batch;
    return `<div class="card batch">
      <button type="button" class="batch-head" data-action="inbox-open" data-batch="${esc(b.batch)}" aria-expanded="${isOpen}">
        <span class="vstack grow"><span class="t-over">${esc(b.batch)} · ${esc(b.created ? fmtDayShort(b.created.slice(0, 10)) : '')}</span><b class="big">${esc(b.title)}</b>
        <span class="t-sec">${places.length} place${places.length === 1 ? '' : 's'}${pending ? ` · ${pending} to review` : ' · all reviewed'}</span></span>
        ${icon(isOpen ? 'chevronUp' : 'chevronDown', 's')}
      </button>
      ${isOpen ? `${b.brief ? `<p class="t-sec">${esc(b.brief)}</p>` : ''}
        ${b.notes ? `<p class="t-sec note">${esc(b.notes)}</p>` : ''}
        ${pending ? `<div class="minis"><button type="button" class="btn pri" data-action="inbox-keep-all" data-batch="${esc(b.batch)}">Keep all ${pending}</button></div>` : ''}
        <div class="group flush">${places.map((p) => itemHtml(b, p)).join('')}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="navbar"><button type="button" class="txtbtn mut" data-action="close-panel" data-id="inbox">Close</button><div class="ttl">Research inbox</div><span></span></div>
  <div class="scroll">
    <div class="banner ai">${icon('sparkles')}<span>Places I research land here first. Keep what you want on the map. Skipped ones are hidden, not deleted.</span></div>
    ${blocks || '<div class="empty"><b>Nothing to review</b><p>New research batches will appear here.</p></div>'}
  </div>`;
}

function find(batchId, id) {
  const b = batches.find((x) => x.batch === batchId);
  const p = b && (b.places || []).find((x) => x.id === id);
  return { b, p };
}

on('inbox-open', (d) => { openBatch = openBatch === d.batch ? null : d.batch; refreshPanel('inbox'); });
function placePins() { geocodeMissing().then((n) => { if (n) toast(`Placed ${n} pin${n > 1 ? 's' : ''} from addresses`); }); }
on('inbox-keep', (d) => { const { b, p } = find(d.batch, d.id); if (p) { keep(b, p); refreshPanel('inbox'); rerender('map'); placePins(); } });
on('inbox-skip', (d) => { const { b, p } = find(d.batch, d.id); if (p) { skip(b, p); refreshPanel('inbox'); rerender('map'); } });
on('inbox-undo', (d) => { const { p } = find(d.batch, d.id); if (p) { undo(p); refreshPanel('inbox'); rerender('map'); } });
on('inbox-keep-all', (d) => {
  const b = batches.find((x) => x.batch === d.batch);
  let n = 0;
  for (const p of (b && b.places) || []) if (isPending(p)) { keep(b, p); n++; }
  toast(`Kept ${n}`); refreshPanel('inbox'); rerender('map'); placePins();
});
