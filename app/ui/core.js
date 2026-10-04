// UI plumbing: action dispatch, panels (sheets / full screens), toasts, small markup helpers.
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { CATEGORIES } from '../config.js';

// ---------- actions ----------
const actions = new Map();
export function on(name, fn) { actions.set(name, fn); }

export function installActions(root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = actions.get(el.dataset.action);
    if (!fn) return;
    if (el.tagName === 'A' && el.getAttribute('href') && !el.dataset.prevent) { fn(el.dataset, el, e); return; }
    e.preventDefault();
    fn(el.dataset, el, e);
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = actions.get(el.dataset.change);
    if (fn) fn(el.dataset, el, e);
  });
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const fn = actions.get(el.dataset.input);
    if (fn) fn(el.dataset, el, e);
  });
}

// ---------- updating markup in place ----------
// Screens are redrawn often (data syncing in, location fixes, the minute tick). patch() brings the live
// DOM in line with new markup node by node and leaves unchanged nodes alone, so scroll positions (even
// mid-fling), the field being typed in and the keyboard all survive a redraw.
export function patch(el, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  morph(el, t.content);
}

function morph(cur, next) {
  const a = Array.from(cur.childNodes);
  const b = Array.from(next.childNodes);
  b.forEach((n, i) => {
    const o = a[i];
    if (!o) cur.appendChild(n);
    else if (o.nodeName !== n.nodeName) cur.replaceChild(n, o);
    else if (o.nodeType === 1) syncElement(o, n);
    else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
  });
  for (let i = b.length; i < a.length; i++) a[i].remove();
}

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function syncElement(o, n) {
  // Read the new field value first: morphing the children moves nodes out of n.
  const field = FIELDS.has(o.nodeName) && o !== document.activeElement ? { value: n.value, checked: n.checked } : null;
  const own = (name) => o.nodeName === 'DETAILS' && name === 'open'; // an opened section stays as the traveller left it
  for (const { name } of Array.from(o.attributes)) if (!n.hasAttribute(name) && !own(name)) o.removeAttribute(name);
  for (const { name, value } of Array.from(n.attributes)) if (o.getAttribute(name) !== value && !own(name)) o.setAttribute(name, value);
  morph(o, n);
  // A field being typed in keeps what's typed; other fields show the new value.
  if (field) {
    if (o.value !== field.value) o.value = field.value;
    if (o.checked !== field.checked) o.checked = field.checked;
  }
}

// ---------- panels ----------
// kind: 'sheet' (bottom sheet over the map), 'full' (full screen), 'modal' (centred sheet on wide screens)
const stack = [];

// expand: { get, set } lets a card be dragged up to expand and down to collapse before it closes.
export function openPanel(id, render, { kind = 'sheet', onClose, keepOnRefresh = false, expand = null } = {}) {
  closePanel(id, true);
  const root = document.getElementById('overlays');
  const wrap = document.createElement('div');
  wrap.className = `panel panel-${kind}`;
  wrap.dataset.panel = id;
  wrap.innerHTML = `${kind !== 'card' ? '<div class="scrim" data-action="close-panel" data-id="' + esc(id) + '"></div>' : ''}<div class="panel-body" role="dialog" aria-modal="${kind === 'card' ? 'false' : 'true'}"></div>`;
  root.appendChild(wrap);
  const entry = { id, render, kind, wrap, onClose, keepOnRefresh, expand };
  stack.push(entry);
  paint(entry);
  requestAnimationFrame(() => wrap.classList.add('open'));
  document.documentElement.classList.toggle('has-panel', stack.some((s) => s.kind !== 'card'));
  return entry;
}

function paint(entry) {
  const body = entry.wrap.querySelector('.panel-body');
  const scroller = body.querySelector('.scroll');
  const top = scroller ? scroller.scrollTop : 0;
  patch(body, entry.render());
  const s2 = body.querySelector('.scroll');
  if (s2 && s2 !== scroller) s2.scrollTop = top; // only a rebuilt scroller needs its place back
  if (entry.afterPaint) entry.afterPaint(body);
}

export function setAfterPaint(id, fn) {
  const e = stack.find((s) => s.id === id);
  if (e) { e.afterPaint = fn; fn(e.wrap.querySelector('.panel-body')); }
}

export function refreshPanels() {
  for (const e of stack) if (!e.keepOnRefresh) paint(e);
}

export function refreshPanel(id) {
  const e = stack.find((s) => s.id === id);
  if (e) paint(e);
}

export function isOpen(id) { return stack.some((s) => s.id === id); }
export function topPanel() { return stack[stack.length - 1] || null; }

export function closePanel(id, silent = false) {
  const i = stack.findIndex((s) => s.id === id);
  if (i < 0) return;
  const [e] = stack.splice(i, 1);
  e.wrap.classList.remove('open');
  const done = () => e.wrap.remove();
  if (silent) done(); else setTimeout(done, 220);
  if (e.onClose && !silent) e.onClose();
  document.documentElement.classList.toggle('has-panel', stack.some((s) => s.kind !== 'card'));
}

export function closeTop() { const t = topPanel(); if (t) closePanel(t.id); }

on('close-panel', (d) => closePanel(d.id || (topPanel() && topPanel().id)));

// ---------- dragging sheets by their handle ----------
// Sheets: drag the handle or header down to close. Place card: drag up to expand, down to collapse, then close.
const ZONES = { sheet: '.grab, .sheet-head', card: '.grab, .card-toggle, .nameblock' };
let pdrag = null;
let quietUntil = 0;

export function installPanelDrag(root) {
  root.addEventListener('pointerdown', (e) => {
    if ((e.button !== undefined && e.button > 0) || document.documentElement.classList.contains('wide')) return;
    const wrap = e.target.closest('.panel');
    const entry = wrap && stack.find((s) => s.wrap === wrap);
    if (!entry || !ZONES[entry.kind] || !e.target.closest(ZONES[entry.kind])) return;
    const body = wrap.querySelector('.panel-body');
    pdrag = { entry, wrap, body, id: e.pointerId, y0: e.clientY, h0: body.getBoundingClientRect().height, moved: false, pts: [{ y: e.clientY, t: e.timeStamp }] };
    // Followed on window: a mouse or trackpad pointer can leave the sheet mid-drag.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
  const move = (e) => {
    const d = pdrag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0; // down is positive
    if (!d.moved) {
      if (Math.abs(dy) < 6) return;
      d.moved = true;
      d.wrap.classList.add('dragging');
    }
    d.pts.push({ y: e.clientY, t: e.timeStamp });
    if (d.pts.length > 5) d.pts.shift();
    const exp = d.entry.expand;
    if (dy < 0 && exp && !exp.get()) {
      d.body.style.transform = '';
      d.body.style.height = Math.min(d.h0 - dy, window.innerHeight - 40) + 'px';
    } else {
      d.body.style.height = '';
      d.body.style.transform = `translateY(${dy > 0 ? dy : dy / 4}px)`;
    }
  };
  const end = (e) => {
    const d = pdrag;
    if (!d || e.pointerId !== d.id) return;
    pdrag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (!d.moved) return;
    quietUntil = Date.now() + 400;
    const a = d.pts[0], b = d.pts[d.pts.length - 1];
    const v = (b.y - a.y) / Math.max(1, b.t - a.t); // px per ms, down is positive
    const dy = b.y - d.y0;
    const exp = d.entry.expand;
    d.wrap.classList.remove('dragging');
    requestAnimationFrame(() => {
      d.body.style.transform = '';
      d.body.style.height = '';
      if (dy > 90 || v > 0.5) { if (exp && exp.get()) exp.set(false); else closePanel(d.entry.id); }
      else if (exp && !exp.get() && (dy < -60 || v < -0.5)) exp.set(true);
    });
  };
  // The tap that ends a drag shouldn't also press a button.
  root.addEventListener('click', (e) => { if (Date.now() < quietUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// ---------- toast ----------
let toastT;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 1900);
}

// ---------- markup helpers ----------
export function badge(catKey, size = '') {
  const c = CATEGORIES[catKey] || CATEGORIES.restaurant;
  return `<span class="badge ${size} f-${c.fam}">${icon(c.glyph)}</span>`;
}

export function neutralBadge(glyph, size = '') {
  return `<span class="badge neutral ${size}">${icon(glyph)}</span>`;
}

export function tag(text, kind = 'neutral', glyph = '') {
  return `<span class="tag ${kind}">${glyph ? icon(glyph) : ''}${esc(text)}</span>`;
}

export function grab() { return '<div class="grab" aria-hidden="true"></div>'; }

export function closeBtn(id) {
  return `<button type="button" class="closebtn" data-action="close-panel" data-id="${esc(id)}" aria-label="Close">${icon('x', 's')}</button>`;
}

export function seg(name, options, value, action, extra = '') {
  return `<div class="seg" role="group" aria-label="${esc(name)}">${options.map(([v, label, glyph]) =>
    `<button type="button" class="${v === value ? 'on' : ''}" aria-pressed="${v === value}" data-action="${action}" data-value="${esc(v)}" ${extra}>${glyph ? icon(glyph, 's') : ''}${esc(label)}</button>`).join('')}</div>`;
}

export function emptyState(title, text, button = '') {
  return `<div class="empty"><b>${esc(title)}</b><p>${esc(text)}</p>${button}</div>`;
}
