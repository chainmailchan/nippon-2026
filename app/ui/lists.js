// Lists: eat / buy / see / bring / admin.
import { store } from '../store.js';
import { LISTS, CATEGORIES } from '../config.js';
import { icon } from '../icons.js';
import { esc, fmtDay } from '../util.js';
import { on, emptyState } from './core.js';
import { ui, rerender } from '../state.js';
import { placeStatus } from '../trip.js';
import { goToArea } from './mapview.js';

export function renderLists() {
  const el = document.getElementById('view-lists');
  if (!el) return;
  const items = store.all('lists');
  const groups = LISTS.map((l) => {
    const its = items.filter((i) => i.list === l.key).sort((a, b) => (a.done - b.done) || (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title));
    if (!its.length) return '';
    const done = its.filter((i) => i.done || linkedBooked(i)).length;
    return `<div class="ghead" id="list-${l.key}"><span class="t-over">${esc(l.label)}</span><span class="t-cap">${done} of ${its.length}</span></div>
      <div class="group">${its.map(itemRow).join('')}</div>`;
  }).join('');
  el.innerHTML = `
    <div class="head">
      <div class="vstack"><h1>Lists</h1><span class="sub">Eat · buy · see · bring · admin</span></div>
      <div class="hstack"><button type="button" class="iconbtn flat" data-action="new-item" data-list="eat" aria-label="Add item">${icon('plus')}</button></div>
    </div>
    <div class="pad-x"><div class="seg">${LISTS.map((l) => `<button type="button" data-action="list-jump" data-key="${l.key}">${esc(l.label)}</button>`).join('')}</div></div>
    <div class="scroll body">${groups || emptyState('No lists yet', 'Add things to eat, buy, see, bring and do.', '<button type="button" class="btn sec sm" data-action="new-item" data-list="eat">Add an item</button>')}</div>`;
}

function linkedPlaces(it) { return (it.place_ids || []).map((id) => store.get('places', id)).filter(Boolean); }
function linkedBooked(it) { return linkedPlaces(it).some((p) => placeStatus(p).booked); }

function itemRow(it) {
  const places = linkedPlaces(it);
  const booked = places.find((p) => placeStatus(p).booked);
  const meta = [];
  if (booked) meta.push('Booked');
  if (it.due) meta.push(fmtDay(it.due));
  if (it.notes) meta.push(esc(it.notes));
  const canFind = places.length || it.find;
  return `<div class="row">
    <button type="button" class="chk${it.done ? ' on' : ''}${booked && !it.done ? ' booked' : ''}" data-action="toggle-item" data-id="${esc(it.id)}" aria-pressed="${!!it.done}" aria-label="Done">${icon('check')}</button>
    <button type="button" class="main tap" data-action="edit-item" data-id="${esc(it.id)}"><span class="name${it.done ? ' done-text' : ''}">${esc(it.title)}</span>${meta.length ? `<span class="meta">${meta.join(' · ')}</span>` : ''}</button>
    ${it.research_request ? `<span class="tag ai">${icon('sparkles')}Research asked</span>` : ''}
    ${canFind ? `<button type="button" class="btn sm sec" data-action="find-item" data-id="${esc(it.id)}">Find</button>` : ''}
  </div>`;
}

on('list-jump', (d) => { const t = document.getElementById('list-' + d.key); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
on('find-item', (d) => {
  const it = store.get('lists', d.id);
  const places = linkedPlaces(it);
  ui.focus = places.length ? { ids: places.map((p) => p.id), label: it.title } : { cat: it.find, label: CATEGORIES[it.find] ? CATEGORIES[it.find].label : it.title };
  document.dispatchEvent(new CustomEvent('tab', { detail: 'map' }));
  ui.sheet = 'full';
  if (places.length && ui.map) { ui.map.fit(places, 15); rerender('map'); } else goToArea('', { fly: true });
});
