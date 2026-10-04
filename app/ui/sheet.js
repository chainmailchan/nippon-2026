// The near-me sheet over the map: three heights (min, peek, full), dragged or flicked by its header.
// The map buttons, the map attribution and (for Google Maps) the map's bottom edge follow its height.
import { ui } from '../state.js';

const ORDER = ['min', 'peek', 'full'];
let onChange = () => {};
let drag = null;
let quietUntil = 0;

const near = () => document.getElementById('near');
const view = () => document.getElementById('view-map');

export function heights() {
  const n = near(), v = view(), top = document.getElementById('map-top');
  const head = n && n.querySelector('.near-head');
  const H = v ? v.clientHeight : 0;
  const below = top ? top.offsetTop + top.offsetHeight + 8 : 130;
  const peek = Math.min(300, Math.round(H * 0.42));
  return {
    min: head ? head.offsetHeight + 4 : 76,
    peek,
    full: Math.max(peek + 40, H - below),
  };
}

// Size the sheet for ui.sheet (or an explicit height while dragging).
export function applySheet(px) {
  const n = near(), v = view();
  if (!n || !v) return;
  if (ui.wide) { n.style.height = ''; v.style.removeProperty('--sheet-h'); n.classList.remove('min', 'expanded'); return; }
  if (!v.clientHeight) return; // map tab hidden: size it when shown
  const h = px !== undefined ? px : heights()[ui.sheet] || heights().peek;
  n.style.height = h + 'px';
  v.style.setProperty('--sheet-h', h + 'px');
  if (px === undefined) {
    n.classList.toggle('expanded', ui.sheet === 'full');
    n.classList.toggle('min', ui.sheet === 'min');
  }
}

export function setSheet(state) {
  if (!ORDER.includes(state)) state = 'peek';
  const changed = state !== ui.sheet;
  ui.sheet = state;
  applySheet();
  if (changed) onChange();
}

// Tap on the header: min → peek → full → peek.
export function stepSheet() {
  if (Date.now() < quietUntil) return; // the tap that ended a drag
  setSheet(ui.sheet === 'min' ? 'peek' : ui.sheet === 'peek' ? 'full' : 'peek');
}

export function installSheet(changed) {
  onChange = changed;
  const n = near();
  // Moves are followed on window: a mouse or trackpad pointer can leave the sheet mid-drag.
  n.addEventListener('pointerdown', (e) => {
    if (ui.wide || (e.button !== undefined && e.button > 0) || !e.target.closest('.near-head')) return;
    drag = { id: e.pointerId, y0: e.clientY, h0: n.getBoundingClientRect().height, moved: false, pts: [{ y: e.clientY, t: e.timeStamp }] };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y0 - e.clientY; // up is positive
    if (!drag.moved) {
      if (Math.abs(dy) < 6) return;
      drag.moved = true;
      n.classList.add('dragging');
      view().classList.add('sheet-drag');
    }
    const H = heights();
    let h = drag.h0 + dy;
    if (h < H.min) h = H.min - (H.min - h) / 4; // rubber band past the ends
    if (h > H.full) h = H.full + (h - H.full) / 4;
    applySheet(Math.round(h));
    drag.pts.push({ y: e.clientY, t: e.timeStamp });
    if (drag.pts.length > 5) drag.pts.shift();
  };
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (!d.moved) return;
    quietUntil = Date.now() + 400;
    n.classList.remove('dragging');
    view().classList.remove('sheet-drag');
    const a = d.pts[0], b = d.pts[d.pts.length - 1];
    const v = (a.y - b.y) / Math.max(1, b.t - a.t); // px per ms, up is positive
    const h = n.getBoundingClientRect().height;
    const H = heights();
    let target;
    if (Math.abs(v) > 0.45) {
      const up = ORDER.filter((s) => H[s] > h + 8);
      const down = ORDER.filter((s) => H[s] < h - 8);
      target = v > 0 ? (up[0] || 'full') : (down[down.length - 1] || 'min');
    } else {
      target = ORDER.reduce((best, s) => (Math.abs(H[s] - h) < Math.abs(H[best] - h) ? s : best), 'peek');
    }
    const was = ui.sheet;
    ui.sheet = target;
    applySheet();
    if (target !== was) onChange();
  };
  // The tap that ends a drag shouldn't also open a row.
  n.addEventListener('click', (e) => { if (Date.now() < quietUntil && !e.target.closest('.near-head')) { e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener('resize', () => applySheet());
}
