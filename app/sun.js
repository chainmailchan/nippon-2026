// Sun position and light windows, computed on the device (no network).
// Golden hour = sun between −4° and +6°; blue hour = sun between −6° and −4°.
// Sunrise/sunset use −0.833° (refraction + solar radius). Flat horizon: hills delay real sunrise.

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

export function sunAltitude(ms, lat, lng) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;          // days since J2000.0
  const g = rad((357.529 + 0.98560028 * d) % 360);           // mean anomaly
  const q = (280.459 + 0.98564736 * d) % 360;                // mean longitude
  const L = rad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)); // ecliptic longitude
  const e = rad(23.439 - 0.00000036 * d);                    // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
  const ha = rad(gmst * 15 + lng) - ra;
  const phi = rad(lat);
  return deg(Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)));
}

// Times (ms) when altitude crosses `alt` on the JST calendar day `ymd`, morning (rising) and evening (setting).
function crossings(ymd, lat, lng, alt) {
  const start = Date.parse(ymd + 'T00:00:00+09:00');
  const step = 5 * 60000;
  let rising = null, setting = null;
  let prev = sunAltitude(start, lat, lng) - alt;
  for (let t = start + step; t <= start + 86400000; t += step) {
    const cur = sunAltitude(t, lat, lng) - alt;
    if (prev < 0 && cur >= 0 && rising === null) rising = refine(t - step, t, lat, lng, alt);
    if (prev >= 0 && cur < 0 && setting === null) setting = refine(t - step, t, lat, lng, alt);
    prev = cur;
  }
  return { rising, setting };
}

function refine(a, b, lat, lng, alt) {
  let fa = sunAltitude(a, lat, lng) - alt;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2, fm = sunAltitude(m, lat, lng) - alt;
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

export function lightTimes(ymd, lat, lng) {
  const c6 = crossings(ymd, lat, lng, -6);
  const c4 = crossings(ymd, lat, lng, -4);
  const c0 = crossings(ymd, lat, lng, -0.833);
  const p6 = crossings(ymd, lat, lng, 6);
  const D = (ms) => (ms === null ? null : new Date(ms));
  return {
    blueAM: [D(c6.rising), D(c4.rising)],
    goldenAM: [D(c4.rising), D(p6.rising)],
    sunrise: D(c0.rising),
    sunset: D(c0.setting),
    goldenPM: [D(p6.setting), D(c4.setting)],
    bluePM: [D(c4.setting), D(c6.setting)],
  };
}
