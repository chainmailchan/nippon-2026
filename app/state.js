// Shared UI state (not persisted unless noted).
export const ui = {
  tab: 'map',            // map | today | trip | lists
  selected: null,        // selected place id
  cardExpanded: false,
  sheet: 'peek',         // near-me sheet height: min | peek | full
  query: '',
  day: null,             // day shown in Today (YYYY-MM-DD)
  revealed: new Set(),   // booking ids whose refs are shown
  wide: false,           // iPad landscape / desktop layout
  map: null,             // TripMap instance
  area: null,            // current area key ('' = whole trip)
  focus: null,           // { ids:[...] } or { cat } — "Find" from Lists narrows the map to these
  revealKey: false,
};

const hooks = new Set();
export function onRender(fn) { hooks.add(fn); }
export function rerender(what = '*') { hooks.forEach((fn) => fn(what)); }
