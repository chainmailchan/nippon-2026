// Leaflet map (vendored, global L) with glyph pins and clustering.
import { MAP_STYLES } from './config.js';
import { icon } from './icons.js';
import { esc, hasCoords } from './util.js';
import { placeStatus, catOf } from './trip.js';

export class TripMap {
  constructor(el, opts = {}) {
    const L = window.L;
    this.L = L;
    this.opts = opts;
    this.markers = new Map();
    this.selected = null;
    this.ctx = { labels: 'key', dense: false };
    // maxZoom on the map itself: the cluster layer needs it before any tile layer is added.
    this.map = L.map(el, { zoomControl: false, attributionControl: false, worldCopyJump: false, minZoom: 5, maxZoom: 19 });
    L.control.attribution({ position: 'bottomleft' }).addTo(this.map);
    this.map.setView([35.679, 139.769], 13);
    this.cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 42,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => L.divIcon({ html: `<div class="cluster">${c.getChildCount()}</div>`, className: 'clusterwrap', iconSize: [40, 40] }),
    });
    this.map.addLayer(this.cluster);
    this.map.on('click', () => this.opts.onMapClick && this.opts.onMapClick());
    this.map.on('moveend', () => this.opts.onMoveEnd && this.opts.onMoveEnd());
  }

  setStyle(key, dark) {
    const st = MAP_STYLES[key] || MAP_STYLES.osm;
    if (this.tiles) this.map.removeLayer(this.tiles);
    this.tiles = this.L.tileLayer(st.url, { maxZoom: 19, maxNativeZoom: st.maxZoom, attribution: st.attribution, className: dark ? 'tiles-dark' : 'tiles-light' });
    this.tiles.addTo(this.map);
  }

  iconFor(p, sel = false) {
    const cat = catOf(p);
    const st = placeStatus(p);
    const size = this.ctx.dense ? 28 : 34;
    const cls = ['pin', 'f-' + cat.fam, st.booked ? 'booked' : '', st.hold ? 'hold' : '', st.visited ? 'done' : '', sel ? 'sel' : ''].filter(Boolean).join(' ');
    const badge = st.booked ? `<span class="bdg ok">${icon('check')}</span>` : (st.must ? `<span class="bdg must">${icon('star')}</span>` : '');
    const showLabel = sel || this.ctx.labels === 'all' || (this.ctx.labels === 'key' && (st.booked || st.must || st.hold));
    const label = showLabel ? `<span class="plabel">${esc(p.name)}</span>` : '';
    return this.L.divIcon({ className: 'pinwrap', html: `<div class="${cls}">${icon(cat.glyph)}${badge}</div>${label}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  setPlaces(places, ctx) {
    this.ctx = { ...this.ctx, ...ctx };
    this.cluster.clearLayers();
    this.markers.clear();
    const layers = [];
    for (const p of places) {
      if (!hasCoords(p)) continue;
      const st = placeStatus(p);
      const m = this.L.marker([p.lat, p.lng], {
        icon: this.iconFor(p, p.id === this.selected),
        keyboard: false,
        title: p.name,
        zIndexOffset: st.booked ? 500 : (st.must ? 300 : 0),
      });
      m.on('click', (e) => { if (e.originalEvent) this.L.DomEvent.stopPropagation(e.originalEvent); this.opts.onSelect && this.opts.onSelect(p.id); });
      m._place = p;
      this.markers.set(p.id, m);
      layers.push(m);
    }
    this.cluster.addLayers(layers);
  }

  select(id, { pan = true } = {}) {
    const prev = this.selected && this.markers.get(this.selected);
    this.selected = id;
    if (prev) { prev.setIcon(this.iconFor(prev._place, false)); prev.setZIndexOffset(0); }
    const m = id && this.markers.get(id);
    if (!m) return;
    m.setIcon(this.iconFor(m._place, true));
    m.setZIndexOffset(1000);
    if (pan) {
      this._whenSized(() => this.cluster.zoomToShowLayer(m, () => {
        const pt = this.map.latLngToContainerPoint(m.getLatLng());
        const size = this.map.getSize();
        // keep the pin in the upper half (the card covers the lower half)
        const target = this.L.point(size.x / 2, size.y * 0.3);
        if (Math.abs(pt.y - target.y) > size.y * 0.18 || pt.x < 40 || pt.x > size.x - 40) {
          this.map.panBy(pt.subtract(target), { animate: true });
        }
      }));
    }
  }

  // Leaflet can't move a hidden map (zero size gives NaN coordinates): measure first, and if the map
  // is still hidden, hold the move until invalidate() runs once it's shown.
  _whenSized(fn) {
    this.map.invalidateSize(false);
    const s = this.map.getSize();
    if (s.x && s.y) { this._pending = null; fn(); } else this._pending = fn;
  }

  flyTo(center, zoom) { this._whenSized(() => this.map.flyTo(center, zoom, { duration: 0.6 })); }

  fit(points, maxZoom = 15) {
    const pts = points.filter((p) => hasCoords(p)).map((p) => [p.lat, p.lng]);
    if (!pts.length) return;
    this._whenSized(() => {
      if (pts.length === 1) this.map.flyTo(pts[0], maxZoom, { duration: 0.6 });
      else this.map.fitBounds(pts, { padding: [48, 48], maxZoom });
    });
  }

  setMe(pos) {
    if (!pos) { if (this.me) { this.map.removeLayer(this.me); this.me = null; } return; }
    const ll = [pos.lat, pos.lng];
    if (!this.me) {
      this.me = this.L.marker(ll, { icon: this.L.divIcon({ className: 'mewrap', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 2000 });
      this.me.addTo(this.map);
    } else this.me.setLatLng(ll);
  }

  center() { const c = this.map.getCenter(); return { lat: c.lat, lng: c.lng }; }
  bounds() { return this.map.getBounds(); }
  invalidate() {
    this.map.invalidateSize();
    const s = this.map.getSize();
    if (this._pending && s.x && s.y) { const fn = this._pending; this._pending = null; fn(); }
  }
}

// A small map used to place or move a pin (edit form): the pin sits under a fixed crosshair.
export function pickerMap(el, start, dark, styleKey) {
  const L = window.L;
  const st = MAP_STYLES[styleKey] || MAP_STYLES.osm;
  const m = L.map(el, { zoomControl: false, attributionControl: false, minZoom: 5, maxZoom: 19 });
  L.tileLayer(st.url, { maxZoom: 19, maxNativeZoom: st.maxZoom, className: dark ? 'tiles-dark' : 'tiles-light' }).addTo(m);
  m.setView(start ? [start.lat, start.lng] : [35.679, 139.769], start ? 17 : 12);
  return m;
}
