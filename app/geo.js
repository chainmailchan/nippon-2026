// Location: GPS position and address geocoding (on the device, where the internet is open).
import { store } from './store.js';
import { hasCoords } from './util.js';

let last = null;     // { lat, lng, acc, at }
let watchId = null;
const listeners = new Set();

export function position() {
  if (!last) return null;
  return Date.now() - last.at < 15 * 60000 ? last : null; // stale after 15 min
}

export function onPosition(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function startWatch() {
  if (!('geolocation' in navigator) || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition((pos) => {
    last = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: Date.now() };
    listeners.forEach((fn) => fn(last));
  }, (err) => {
    if (err && err.code === 1) { stopWatch(); listeners.forEach((fn) => fn(null, 'denied')); }
  }, { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 });
}

export function stopWatch() {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export function locateOnce() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('No location on this device')); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      last = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: Date.now() };
      listeners.forEach((fn) => fn(last));
      resolve(last);
    }, (err) => reject(err), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  });
}

// Strip the postcode and anything after the block number (building, floor): geocoders match the street part.
export function streetPart(address) {
  let a = String(address || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[－‐−–]/g, '-').trim();
  a = a.replace(/^〒?\s*\d{3}-\d{4}\s*/, '');
  const m = a.match(/^.*?\d+(?:\s*-\s*\d+)+/);
  return m ? m[0] : a;
}

// Geocode a Japanese address. GSI (Japan's mapping agency) first, then OpenStreetMap Nominatim.
export async function geocode(address) {
  if (!address) return null;
  const isJa = /[\u3040-\u30ff\u4e00-\u9fff]/.test(address);
  const q = isJa ? streetPart(address) : address;
  if (isJa) {
    try {
      const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
      const j = await r.json();
      if (Array.isArray(j) && j.length && j[0].geometry) {
        const [lng, lat] = j[0].geometry.coordinates;
        return { lat: +lat, lng: +lng, coord: 'gsi' };
      }
    } catch (e) { /* fall through */ }
  }
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'en' } });
    const j = await r.json();
    if (Array.isArray(j) && j.length) return { lat: +j[0].lat, lng: +j[0].lon, coord: 'osm' };
  } catch (e) { /* give up */ }
  return null;
}

// Fill in coordinates for places that only have an address. Runs quietly in the background;
// a call made while it's running queues one more pass (e.g. places kept from the inbox).
let running = null;
let again = false;
const failed = new Set(); // per session, so one device's network trouble doesn't block the others
export function geocodeMissing() {
  if (running) { again = true; return running; }
  running = (async () => {
    let n = 0;
    try {
      do {
        again = false;
        const todo = store.all('places').filter((p) => !hasCoords(p) && (p.address_ja || p.address_en) && !failed.has(p.id));
        for (const p of todo) {
          const hit = await geocode(p.address_ja || p.address_en);
          if (hit && !hasCoords(store.get('places', p.id) || {})) { store.patch('places', p.id, { lat: hit.lat, lng: hit.lng, coord: hit.coord }); n++; }
          else if (!hit) failed.add(p.id);
          await new Promise((r) => setTimeout(r, 1100)); // Nominatim asks for ≤ 1 request per second
        }
      } while (again);
    } finally { running = null; }
    return n;
  })();
  return running;
}
