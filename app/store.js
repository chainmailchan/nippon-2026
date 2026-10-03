// Shared trip data. Two modes:
//  - local: this device only (localStorage) — for trying the app before sync is set up;
//  - cloud: Firestore under trips/{tripKey}/… with an on-device cache, shared by all travellers.
import { getPrefs } from './prefs.js';

export const COLLS = ['places', 'bookings', 'items', 'lists', 'reviews'];
const LOCAL_KEY = 'nippon:data:v1';

function emptyData() {
  const d = {}; for (const c of COLLS) d[c] = {}; return d;
}

function clean(obj) { // Firestore rejects undefined
  return JSON.parse(JSON.stringify(obj));
}

class Store extends EventTarget {
  constructor() {
    super();
    this.mode = 'none';
    this.data = emptyData();
    this.meta = {};
    this.status = { state: 'idle', detail: '' };
    this.cloud = null;
  }

  // ---------- lifecycle ----------
  startLocal() {
    this.mode = 'local';
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const c of COLLS) this.data[c] = saved[c] || {};
        this.meta = saved.meta || {};
      }
    } catch (e) { /* ignore */ }
    this._status('local', 'This device only');
    this._emit('*');
  }

  async startCloud(config, tripKey) {
    this.mode = 'cloud';
    this._status('connecting', 'Connecting…');
    const { startCloud } = await import('./cloud.js');
    this.cloud = await startCloud(config, tripKey, this);
  }

  // ---------- reads ----------
  all(coll) { return Object.values(this.data[coll] || {}); }
  get(coll, id) { return (this.data[coll] || {})[id] || null; }

  // ---------- writes ----------
  who() { return getPrefs().name || 'Someone'; }

  put(coll, doc) {
    if (!doc.id) throw new Error('doc needs an id');
    const now = new Date().toISOString();
    const prev = this.get(coll, doc.id);
    const next = clean({ ...doc, added: doc.added || (prev && prev.added) || { by: this.who(), at: now }, updated: { by: this.who(), at: now } });
    this.data[coll][doc.id] = next;
    if (this.mode === 'cloud' && this.cloud) this.cloud.write(coll, doc.id, next);
    else this._saveLocal();
    this._emit(coll);
    return next;
  }

  patch(coll, id, patch) {
    const prev = this.get(coll, id);
    if (!prev) return null;
    return this.put(coll, { ...prev, ...patch });
  }

  remove(coll, id) {
    delete this.data[coll][id];
    if (this.mode === 'cloud' && this.cloud) this.cloud.remove(coll, id);
    else this._saveLocal();
    this._emit(coll);
  }

  putMeta(patch) {
    this.meta = clean({ ...this.meta, ...patch });
    if (this.mode === 'cloud' && this.cloud) this.cloud.writeMeta(this.meta);
    else this._saveLocal();
    this._emit('meta');
  }

  importAll(obj) {
    let n = 0;
    for (const c of COLLS) for (const doc of Object.values((obj && obj[c]) || {})) { this.put(c, doc); n++; }
    if (obj && obj.meta) this.putMeta(obj.meta);
    return n;
  }

  exportAll() {
    const out = { exported: new Date().toISOString(), meta: this.meta };
    for (const c of COLLS) out[c] = this.data[c];
    return out;
  }

  // ---------- called by cloud.js ----------
  _applyChanges(coll, changes) {
    for (const ch of changes) {
      if (ch.type === 'removed') delete this.data[coll][ch.id];
      else this.data[coll][ch.id] = { ...ch.data, id: ch.id };
    }
    if (changes.length) this._emit(coll);
  }
  _applyMeta(meta) { this.meta = meta || {}; this._emit('meta'); }

  _status(state, detail = '') {
    this.status = { state, detail };
    this.dispatchEvent(new CustomEvent('status', { detail: this.status }));
  }

  // ---------- internals ----------
  _saveLocal() {
    if (this.mode !== 'local') return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...this.data, meta: this.meta })); }
    catch (e) { this._status('error', 'Could not save on this device'); }
  }
  _emit(coll) { this.dispatchEvent(new CustomEvent('change', { detail: { coll } })); }
}

export const store = new Store();
