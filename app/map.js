// Leaflet map (vendored, global L) with glyph pins and clustering: OpenStreetMap styles.
// gmap.js provides the same interface on Google Maps; main.js picks one.
import { MAP_STYLES } from './config.js';
import { hasCoords } from './util.js';
import { pinHtml, pinSize } from './pins.js';

export class TripMap {
  constructor(el, opts = {}) {
    const L = window.L;
    this.L = L;
    this.el = el;
    this.provider = 'leaflet';
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
    const st = MAP_STYLES[key] && MAP_STYLES[key].url ? MAP_STYLES[key] : MAP_STYLES.osm;
    if (this.tiles) this.map.removeLayer(this.tiles);
    this.tiles = this.L.tileLayer(st.url, { maxZoom: 19, maxNativeZoom: st.maxZoom, attribution: st.attribution, className: dark ? 'tiles-dark' : 'tiles-light' });
    this.tiles.addTo(this.map);
  }

  iconFor(p, sel = false) {
    const size = pinSize(this.ctx);
    return this.L.divIcon({ className: 'pinwrap', html: pinHtml(p, sel, this.ctx).html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  setPlaces(places, ctx) {
    this.ctx = { ...this.ctx, ...ctx };
    this.cluster.clearLayers();
    this.markers.clear();
    const layers = [];
    for (const p of places) {
      if (!hasCoords(p)) continue;
      const m = this.L.marker([p.lat, p.lng], {
        icon: this.iconFor(p, p.id === this.selected),
        keyboard: false,
        title: p.name,
        zIndexOffset: pinHtml(p, false, this.ctx).z,
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
    if (prev) { prev.setIcon(this.iconFor(prev._place, false)); prev.setZIndexOffset(pinHtml(prev._place, false, this.ctx).z); }
    const m = id && this.markers.get(id);
    if (!m) return;
    m.setIcon(this.iconFor(m._place, true));
    m.setZIndexOffset(1000);
    if (pan) this._whenSized(() => this.cluster.zoomToShowLayer(m, () => this.reveal(m.getLatLng())));
  }

  // Bring a pin into the part of the map in view (see clearArea() in ui/mapview.js), unless it's already there.
  reveal(latlng) {
    const size = this.map.getSize();
    let box = this.opts.clearArea && this.opts.clearArea(this.el);
    if (!box || box.bottom - box.top < 60) box = { left: 0, right: size.x, top: 0, bottom: size.y * 0.6 };
    const pt = this.map.latLngToContainerPoint(latlng);
    if (pt.x > box.left + 40 && pt.x < box.right - 40 && pt.y > box.top + 30 && pt.y < box.bottom - 30) return;
    this.map.panBy(pt.subtract(this.L.point((box.left + box.right) / 2, (box.top + box.bottom) / 2)), { animate: true });
  }

  // Leaflet can't move a hidden map (zero size gives NaN coordinates): measure first, and if the map
  // is still hidden, hold the move until invalidate() runs once it's shown.
  _whenSized(fn) {
    this.map.invalidateSize(false);
    const s = this.map.getSize();
    if (s.x && s.y) { this._pending = null; fn(); } else this._pending = fn;
  }

  flyTo(center, zoom) { this._whenSized(() => this.map.flyTo(center, zoom, { duration: 0.6 })); }

  setView(center, zoom) { this.map.setView(center, zoom); }

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

  onDragStart(fn) { this.map.on('dragstart', fn); }
  center() { const c = this.map.getCenter(); return { lat: c.lat, lng: c.lng }; }
  zoom() { return this.map.getZoom(); }
  invalidate() {
    this.map.invalidateSize();
    const s = this.map.getSize();
    if (this._pending && s.x && s.y) { const fn = this._pending; this._pending = null; fn(); }
  }
  destroy() { this.map.remove(); }
}

// A small map used to place or move a pin (edit form): the pin sits under a fixed crosshair.
// Same interface as googlePicker() in gmap.js.
export function leafletPicker(el, start, dark, styleKey) {
  const L = window.L;
  const st = MAP_STYLES[styleKey] && MAP_STYLES[styleKey].url ? MAP_STYLES[styleKey] : MAP_STYLES.osm;
  const m = L.map(el, { zoomControl: false, attributionControl: false, minZoom: 5, maxZoom: 19 });
  L.tileLayer(st.url, { maxZoom: 19, maxNativeZoom: st.maxZoom, className: dark ? 'tiles-dark' : 'tiles-light' }).addTo(m);
  m.setView(start ? [start.lat, start.lng] : [35.679, 139.769], start ? 17 : 12);
  const picker = {
    userMoved: false,
    prog: false, // a move we started ourselves, not the user
    onMove(fn) { m.on('moveend', () => { fn(); picker.prog = false; }); },
    center() { const c = m.getCenter(); return { lat: c.lat, lng: c.lng }; },
    setView(lat, lng, zoom) { picker.prog = true; picker.userMoved = false; m.setView([lat, lng], zoom); },
    invalidate() { m.invalidateSize(); },
    remove() { m.remove(); },
  };
  m.on('dragstart', () => { picker.userMoved = true; });
  m.on('zoomstart', () => { if (!picker.prog) picker.userMoved = true; });
  return picker;
}
