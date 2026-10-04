// Pin markup shared by both map engines (Leaflet and Google): glyph badge, status ring, label.
import { icon } from './icons.js';
import { esc } from './util.js';
import { placeStatus, catOf } from './trip.js';

export function pinSize(ctx) { return ctx.dense ? 28 : 34; }

// Inner HTML of a pin, plus the stacking order it should get.
export function pinHtml(p, sel, ctx) {
  const cat = catOf(p);
  const st = placeStatus(p);
  const cls = ['pin', 'f-' + cat.fam, st.booked ? 'booked' : '', st.hold ? 'hold' : '', st.visited ? 'done' : '', sel ? 'sel' : ''].filter(Boolean).join(' ');
  const badge = st.booked ? `<span class="bdg ok">${icon('check')}</span>` : (st.must ? `<span class="bdg must">${icon('star')}</span>` : '');
  const showLabel = sel || ctx.labels === 'all' || (ctx.labels === 'key' && (st.booked || st.must || st.hold));
  const label = showLabel ? `<span class="plabel">${esc(p.name)}</span>` : '';
  return { html: `<div class="${cls}">${icon(cat.glyph)}${badge}</div>${label}`, z: sel ? 1000 : st.booked ? 500 : st.must ? 300 : 0 };
}
