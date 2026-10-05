// Google Maps base map (Maps JavaScript API, no map ID: raster tiles, JSON styles for dark mode).
// Same interface as the Leaflet TripMap in map.js. Pins are our own HTML in one overlay layer,
// clustered in screen space, so they look identical on both maps.
import { hasCoords } from './util.js';
import { pinHtml, pinSize } from './pins.js';

let loading = null;

// Loads the Maps JavaScript API once. English labels; Japan as the region.
export function loadGoogleMaps(key) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Google Maps took too long to load')), 15000);
    window.__nipponMapsReady = () => {
      clearTimeout(timer);
      google.maps.importLibrary('maps').then(() => resolve(google.maps), reject);
    };
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
      '&v=weekly&language=en&region=JP&loading=async&callback=__nipponMapsReady';
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error('Google Maps could not be reached')); };
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

// Dark or light comes from Google's colorScheme (fixed when a map is created; main.js rebuilds the map
// when the theme flips). These embedded styles only quieten shop and clinic icons so our pins stand out;
// Google may ignore them, which is harmless.
const QUIET = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
];
const scheme = (gm, dark) => (gm.ColorScheme ? (dark ? gm.ColorScheme.DARK : gm.ColorScheme.LIGHT) : (dark ? 'DARK' : 'LIGHT'));

const BASE = {
  disableDefaultUI: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
  keyboardShortcuts: false,
  minZoom: 5,
  maxZoom: 20,
};

const ll = (c) => (Array.isArray(c) ? { lat: c[0], lng: c[1] } : { lat: c.lat, lng: c.lng });

// Group pins that overlap on screen (like Leaflet.markercluster's radius). The selected pin stays single.
function clusterize(items, radius, keep) {
  const groups = [];
  for (const it of items) {
    if (it.p.id === keep) { groups.push({ items: [it], x: it.x, y: it.y }); continue; }
    let g = null;
    for (const c of groups) {
      if (c.items[0].p.id === keep) continue;
      const dx = c.x - it.x, dy = c.y - it.y;
      if (dx * dx + dy * dy <= radius * radius) { g = c; break; }
    }
    if (g) {
      g.items.push(it);
      g.x += (it.x - g.x) / g.items.length;
      g.y += (it.y - g.y) / g.items.length;
    } else groups.push({ items: [it], x: it.x, y: it.y });
  }
  return groups;
}

function makeLayer(gm, owner) {
  class PinLayer extends gm.OverlayView {
    onAdd() {
      this.div = document.createElement('div');
      this.div.className = 'gpins';
      this.getPanes().overlayMouseTarget.appendChild(this.div);
      gm.OverlayView.preventMapHitsFrom(this.div);
      this.div.addEventListener('click', (e) => {
        const pin = e.target.closest('[data-pid]');
        if (pin) { owner.opts.onSelect && owner.opts.onSelect(pin.dataset.pid); return; }
        const cl = e.target.closest('[data-cluster]');
        if (cl) owner.zoomToGroup(this.groups[+cl.dataset.cluster]);
      });
    }
    onRemove() { if (this.div) this.div.remove(); this.div = null; }
    draw() {
      const proj = this.getProjection();
      if (!this.div || !proj) return;
      const zoom = owner.map.getZoom();
      const items = owner.places.map((p) => {
        const pt = proj.fromLatLngToDivPixel(new gm.LatLng(p.lat, p.lng));
        return { p, x: pt.x, y: pt.y };
      });
      this.groups = zoom >= 16 ? items.map((it) => ({ items: [it], x: it.x, y: it.y })) : clusterize(items, 42, owner.selected);
      const size = pinSize(owner.ctx);
      let html = '';
      this.groups.forEach((g, i) => {
        if (g.items.length > 1) {
          html += `<div class="clusterwrap" data-cluster="${i}" style="left:${Math.round(g.x - 20)}px;top:${Math.round(g.y - 20)}px;z-index:100"><div class="cluster">${g.items.length}</div></div>`;
          return;
        }
        const { p, x, y } = g.items[0];
        const pin = pinHtml(p, p.id === owner.selected, owner.ctx);
        html += `<div class="pinwrap" data-pid="${p.id.replace(/"/g, '')}" title="${p.name.replace(/"/g, '&quot;')}" style="left:${Math.round(x - size / 2)}px;top:${Math.round(y - size / 2)}px;width:${size}px;height:${size}px;z-index:${200 + pin.z}">${pin.html}</div>`;
      });
      if (owner.mePos) {
        const pt = proj.fromLatLngToDivPixel(new gm.LatLng(owner.mePos.lat, owner.mePos.lng));
        html += `<div class="mewrap" style="left:${Math.round(pt.x - 9)}px;top:${Math.round(pt.y - 9)}px;z-index:2000"><div class="me"></div></div>`;
      }
      this.div.innerHTML = html;
    }
  }
  return new PinLayer();
}

export class GoogleTripMap {
  constructor(el, opts, gm, dark) {
    this.el = el;
    this.gm = gm;
    this.provider = 'google';
    this.opts = opts;
    this.places = [];
    this.ctx = { labels: 'key', dense: false };
    this.selected = null;
    this.mePos = null;
    this.dark = dark;
    el.classList.add('gmap');
    this.map = new gm.Map(el, { ...BASE, center: { lat: 35.679, lng: 139.769 }, zoom: 13, colorScheme: scheme(gm, dark), styles: QUIET, backgroundColor: dark ? '#1d2024' : '#f1f3f4' });
    this.layer = makeLayer(gm, this);
    this.layer.setMap(this.map);
    this.map.addListener('click', () => this.opts.onMapClick && this.opts.onMapClick());
    this.map.addListener('idle', () => this.opts.onMoveEnd && this.opts.onMoveEnd());
  }

  setStyle() { /* one Google style; light/dark is fixed at creation (see main.js) */ }

  setPlaces(places, ctx) {
    this.places = places.filter(hasCoords);
    this.ctx = { ...this.ctx, ...ctx };
    this.layer.draw();
  }

  select(id, { pan = true } = {}) {
    this.selected = id;
    this.layer.draw();
    const p = id && this.places.find((x) => x.id === id);
    if (!p || !pan) return;
    this.reveal(p, this.map.getZoom() < 16 && this.isClustered(id) ? 16 : this.map.getZoom()); // a clustered pin needs a closer look
  }

  // Bring a pin into the part of the map in view (see clearArea() in ui/mapview.js), unless it's already there.
  // Worked out in world coordinates against the map's final size: Google keeps the centre when its box resizes
  // (the map shrinks to the card's top edge while the card slides in), so this holds whenever the resize lands.
  reveal(p, zoom) {
    const proj = this.map.getProjection();
    const box = this.opts.clearArea && this.opts.clearArea(this.el);
    if (!proj || !box || box.bottom - box.top < 60) { this.map.setZoom(zoom); this.map.panTo(ll(p)); return; }
    const scale = 2 ** zoom;
    const pin = proj.fromLatLngToPoint(new this.gm.LatLng(p.lat, p.lng));
    const c = proj.fromLatLngToPoint(this.map.getCenter());
    const x = box.width / 2 + (pin.x - c.x) * scale, y = box.height / 2 + (pin.y - c.y) * scale; // where it will sit
    const fits = x > box.left + 40 && x < box.right - 40 && y > box.top + 30 && y < box.bottom - 30;
    if (fits && zoom === this.map.getZoom()) return;
    const tx = (box.left + box.right) / 2, ty = (box.top + box.bottom) / 2;
    const center = proj.fromPointToLatLng(new this.gm.Point(pin.x - (tx - box.width / 2) / scale, pin.y - (ty - box.height / 2) / scale));
    if (zoom !== this.map.getZoom()) { this.map.setZoom(zoom); this.map.setCenter(center); } else this.map.panTo(center);
  }

  isClustered(id) {
    return (this.layer.groups || []).some((g) => g.items.length > 1 && g.items.some((it) => it.p.id === id));
  }

  zoomToGroup(g) {
    if (!g) return;
    const b = new this.gm.LatLngBounds();
    g.items.forEach((it) => b.extend(ll(it.p)));
    const ne = b.getNorthEast(), sw = b.getSouthWest();
    if (ne.lat() === sw.lat() && ne.lng() === sw.lng()) { this.map.setZoom(this.map.getZoom() + 2); this.map.panTo(ne); } else this.map.fitBounds(b, 60);
  }

  flyTo(center, zoom) { this.map.setZoom(zoom); this.map.panTo(ll(center)); }
  setView(center, zoom) { this.map.setCenter(ll(center)); this.map.setZoom(zoom); }

  fit(points, maxZoom = 15) {
    const pts = points.filter(hasCoords);
    if (!pts.length) return;
    if (pts.length === 1) { this.flyTo(pts[0], maxZoom); return; }
    const b = new this.gm.LatLngBounds();
    pts.forEach((p) => b.extend(ll(p)));
    this.map.fitBounds(b, 48);
    this.gm.event.addListenerOnce(this.map, 'idle', () => { if (this.map.getZoom() > maxZoom) this.map.setZoom(maxZoom); });
  }

  setMe(pos) { this.mePos = pos ? { lat: pos.lat, lng: pos.lng } : null; this.layer.draw(); }
  onDragStart(fn) { this.map.addListener('dragstart', fn); }
  center() { const c = this.map.getCenter(); return c ? { lat: c.lat(), lng: c.lng() } : { lat: 35.679, lng: 139.769 }; }
  zoom() { return this.map.getZoom() || 13; }
  invalidate() { /* Google tracks its container size itself */ }
  destroy() {
    this.layer.setMap(null);
    this.gm.event.clearInstanceListeners(this.map);
    this.el.classList.remove('gmap');
    this.el.innerHTML = '';
  }
}

// Pin picker for the place editor; same interface as leafletPicker() in map.js.
export function googlePicker(el, start, dark) {
  const gm = google.maps;
  const m = new gm.Map(el, { ...BASE, center: start ? ll(start) : { lat: 35.679, lng: 139.769 }, zoom: start ? 17 : 12, colorScheme: scheme(gm, dark), styles: QUIET });
  const picker = {
    userMoved: false,
    prog: false,
    onMove(fn) { m.addListener('idle', () => { fn(); picker.prog = false; }); },
    center() { const c = m.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
    setView(lat, lng, zoom) { picker.prog = true; picker.userMoved = false; m.setCenter({ lat, lng }); m.setZoom(zoom); },
    invalidate() {},
    remove() { gm.event.clearInstanceListeners(m); el.innerHTML = ''; },
  };
  m.addListener('dragstart', () => { picker.userMoved = true; });
  m.addListener('zoom_changed', () => { if (!picker.prog) picker.userMoved = true; });
  return picker;
}
