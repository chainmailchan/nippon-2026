import { TZ } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = '') {
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix + id;
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || uid();
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- dates (Japan time) ----------
const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function jstParts(d = new Date()) {
  const o = {};
  for (const p of partsFmt.formatToParts(d)) o[p.type] = p.value;
  return { y: o.year, m: o.month, d: o.day, hh: o.hour === '24' ? '00' : o.hour, mm: o.minute };
}

export function todayJST(d = new Date()) {
  const p = jstParts(d); return `${p.y}-${p.m}-${p.d}`;
}

export function nowHHMM(d = new Date()) {
  const p = jstParts(d); return `${p.hh}:${p.mm}`;
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a, b) { // b - a in days
  const ta = Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v));
  const tb = Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v));
  return Math.round((tb - ta) / 86400000);
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function wdShort(ymd) { return WD[weekday(ymd)]; }
export function wdLong(ymd) { return WD_LONG[weekday(ymd)]; }
export function fmtDay(ymd) { // "Thu 22 Oct"
  const [, m, d] = ymd.split('-').map(Number);
  return `${wdShort(ymd)} ${d} ${MON[m - 1]}`;
}
export function fmtDayShort(ymd) { // "22 Oct"
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MON[m - 1]}`;
}

// Event times are stored as local ISO strings with an offset ("2026-10-17T19:00+09:00") or a bare date.
export function whenParts(s) {
  if (!s) return { date: null, time: null, ms: null };
  const date = s.slice(0, 10);
  const time = s.length >= 16 && s[10] === 'T' ? s.slice(11, 16) : null;
  const ms = time ? Date.parse(s.length === 16 ? s + ':00+09:00' : s) : Date.parse(date + 'T00:00:00+09:00');
  return { date, time, ms };
}

export function minutesUntil(ms, now = Date.now()) { return Math.round((ms - now) / 60000); }

export function fmtIn(mins) {
  if (mins < 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const d = Math.round(h / 24); return `in ${d} day${d > 1 ? 's' : ''}`;
}

export function fmtClock(d) { // Date → "HH:MM" JST
  if (!d) return '—';
  const p = jstParts(d); return `${p.hh}:${p.mm}`;
}

// ---------- geo ----------
export function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function fmtDist(km) {
  if (km == null) return '';
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function hasCoords(p) { return p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng); }

// Coordinates inside a pasted Google Maps URL (full URLs only; short maps.app.goo.gl links carry none).
export function coordsFromMapsUrl(url) {
  if (!url) return null;
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], quality: 'link' };
  m = url.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (m) return { lat: +m[1], lng: +m[2], quality: 'link' };
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], quality: 'link-view' };
  return null;
}

// ---------- Google Maps hand-off ----------
function textQuery(p) {
  const name = p.ja || p.name || '';
  const addr = p.address_ja || p.address_en || p.near || ''; // near: locality hint when there's no address yet
  return [name, addr].filter(Boolean).join(' ').trim();
}

export function gmPlaceUrl(p, linkMode = 'web') {
  if (p.gmaps && p.gmaps.url) return p.gmaps.url; // a pasted link already opens the exact place
  const q = textQuery(p) || (hasCoords(p) ? `${p.lat},${p.lng}` : p.name);
  let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  if (p.gmaps && p.gmaps.place_id) url += `&query_place_id=${encodeURIComponent(p.gmaps.place_id)}`;
  return linkMode === 'app' ? url.replace(/^https:\/\//, 'comgooglemapsurl://') : url;
}

export function gmDirUrl(p, mode = 'transit', linkMode = 'web') {
  let dest;
  if (p.gmaps && p.gmaps.place_id) dest = p.ja || p.name;
  else if (p.address_ja || p.address_en || p.near) dest = textQuery(p);
  else if (hasCoords(p)) dest = `${p.lat},${p.lng}`;
  else dest = p.name;
  if (linkMode === 'app') {
    const target = hasCoords(p) && !(p.address_ja || p.address_en) ? `${p.lat},${p.lng}` : dest;
    return `comgooglemaps://?daddr=${encodeURIComponent(target)}&directionsmode=${mode}`;
  }
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`;
  if (p.gmaps && p.gmaps.place_id) url += `&destination_place_id=${encodeURIComponent(p.gmaps.place_id)}`;
  return url;
}

// ---------- misc ----------
export function closedToday(p, ymd) {
  const c = p && p.practical && p.practical.closed;
  if (!c) return false;
  const wd = weekday(ymd);
  const en = [/\bsun/i, /\bmon/i, /\btue/i, /\bwed/i, /\bthu/i, /\bfri/i, /\bsat/i][wd];
  const ja = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'][wd];
  if (/irregular|不定休/i.test(c) && !en.test(c) && !c.includes(ja)) return false;
  return en.test(c) || c.includes(ja);
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
