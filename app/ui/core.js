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

// ---------- panels ----------
// kind: 'sheet' (bottom sheet over the map), 'full' (full screen), 'modal' (centred sheet on wide screens)
const stack = [];

export function openPanel(id, render, { kind = 'sheet', onClose, keepOnRefresh = false } = {}) {
  closePanel(id, true);
  const root = document.getElementById('overlays');
  const wrap = document.createElement('div');
  wrap.className = `panel panel-${kind}`;
  wrap.dataset.panel = id;
  wrap.innerHTML = `${kind !== 'card' ? '<div class="scrim" data-action="close-panel" data-id="' + esc(id) + '"></div>' : ''}<div class="panel-body" role="dialog" aria-modal="${kind === 'card' ? 'false' : 'true'}"></div>`;
  root.appendChild(wrap);
  const entry = { id, render, kind, wrap, onClose, keepOnRefresh };
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
  body.innerHTML = entry.render();
  const s2 = body.querySelector('.scroll');
  if (s2) s2.scrollTop = top;
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
