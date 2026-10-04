// App-wide constants. Nothing private belongs in this file: the repo is public.

export const APP_VERSION = '0.2.1';

// Firebase web config (not secret — access is controlled by Firestore rules and the trip key).
// Set to null to run in "this device only" mode.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCPKnksE-JhwmMpdWqIrs5tLdY0HXdocJM',
  authDomain: 'nippon-2026.firebaseapp.com',
  projectId: 'nippon-2026',
  storageBucket: 'nippon-2026.firebasestorage.app',
  messagingSenderId: '26556021013',
  appId: '1:26556021013:web:01b46135a717f814b3911c',
};

// Google Maps JavaScript API browser key (public by design; restricted to the site's address in Google Cloud).
// Empty: OpenStreetMap only.
export const GOOGLE_MAPS_KEY = 'AIzaSyAvuAR18Za-xZAiracM8kVlUoSGCqcM27o';

export const TZ = 'Asia/Tokyo';

// Map areas. Dates come from the private trip data (each night's hotel), not from here.
export const AREAS = [
  { key: 'disney', short: 'Disney', name: 'Tokyo Disney Resort', ja: '東京ディズニーリゾート', sub: 'Maihama 舞浜', glyph: 'castle',
    center: [35.6310, 139.8830], zoom: 15, bbox: [35.612, 139.862, 35.648, 139.902], mode: 'walking' },
  { key: 'kamakura', short: 'Kamakura', name: 'Kamakura', ja: '鎌倉', sub: 'Kamakura 鎌倉', glyph: 'torii',
    center: [35.3170, 139.5450], zoom: 13, bbox: [35.27, 139.45, 35.38, 139.62], mode: 'driving' },
  { key: 'hakone', short: 'Odawara', name: 'Odawara · Hakone', ja: '小田原・箱根', sub: 'Odawara 小田原', glyph: 'onsen',
    center: [35.2560, 139.1300], zoom: 12, bbox: [35.10, 138.95, 35.40, 139.25], mode: 'driving' },
  { key: 'fuji', short: 'Fuji', name: 'Fuji Five Lakes', ja: '富士五湖', sub: 'Kawaguchiko 河口湖', glyph: 'mountain',
    center: [35.5050, 138.7650], zoom: 12, bbox: [35.33, 138.50, 35.66, 139.05], mode: 'driving' },
  { key: 'tokyo', short: 'Tokyo', name: 'Tokyo', ja: '東京', sub: 'Tokyo 東京', glyph: 'train',
    center: [35.6790, 139.7690], zoom: 14, bbox: [35.48, 139.40, 35.90, 140.00], mode: 'transit' },
];

export const AREA_ORDER = ['disney', 'tokyo', 'fuji', 'hakone', 'kamakura'];

export const FAMILIES = {
  meal:    { label: 'Food' },
  sweet:   { label: 'Sweets' },
  drink:   { label: 'Drinks' },
  konbini: { label: 'Konbini' },
  sight:   { label: 'See & do' },
  shop:    { label: 'Shopping' },
  poke:    { label: 'Pokémon' },
  stay:    { label: 'Stay' },
  move:    { label: 'Transport' },
  disney:  { label: 'Disney' },
};

export const CATEGORIES = {
  ramen:      { label: 'Ramen', fam: 'meal', glyph: 'ramen' },
  tsukemen:   { label: 'Tsukemen', fam: 'meal', glyph: 'tsukemen' },
  tonkatsu:   { label: 'Tonkatsu', fam: 'meal', glyph: 'tonkatsu' },
  sushi:      { label: 'Sushi · omakase', fam: 'meal', glyph: 'sushi' },
  yakiniku:   { label: 'Yakiniku', fam: 'meal', glyph: 'flame' },
  yakitori:   { label: 'Yakitori', fam: 'meal', glyph: 'skewer' },
  restaurant: { label: 'Restaurant', fam: 'meal', glyph: 'utensils' },
  cafe:       { label: 'Café', fam: 'sweet', glyph: 'coffee' },
  matcha:     { label: 'Matcha', fam: 'sweet', glyph: 'leaf' },
  dessert:    { label: 'Dessert', fam: 'sweet', glyph: 'icecream' },
  bakery:     { label: 'Bakery', fam: 'sweet', glyph: 'croissant' },
  bar:        { label: 'Bar', fam: 'drink', glyph: 'martini' },
  izakaya:    { label: 'Izakaya', fam: 'drink', glyph: 'lantern' },
  konbini:    { label: 'Konbini', fam: 'konbini', glyph: 'store' },
  sight:      { label: 'Shrine · sight', fam: 'sight', glyph: 'torii' },
  viewpoint:  { label: 'Viewpoint', fam: 'sight', glyph: 'mountain' },
  photo:      { label: 'Photo spot', fam: 'sight', glyph: 'camera' },
  onsen:      { label: 'Onsen', fam: 'sight', glyph: 'onsen' },
  pokemon:    { label: 'Pokémon Center', fam: 'poke', glyph: 'pokeball' },
  cards:      { label: 'Card shop', fam: 'poke', glyph: 'cards' },
  clothing:   { label: 'Clothing', fam: 'shop', glyph: 'shirt' },
  shoes:      { label: 'Shoes · insoles', fam: 'shop', glyph: 'footprints' },
  shop:       { label: 'Shops', fam: 'shop', glyph: 'bag' },
  hotel:      { label: 'Hotel', fam: 'stay', glyph: 'bed' },
  ryokan:     { label: 'Ryokan', fam: 'stay', glyph: 'roof' },
  glamping:   { label: 'Glamping', fam: 'stay', glyph: 'tent' },
  car:        { label: 'Car rental', fam: 'move', glyph: 'car' },
  fuel:       { label: 'Fuel', fam: 'move', glyph: 'fuel' },
  parking:    { label: 'Parking', fam: 'move', glyph: 'parking' },
  station:    { label: 'Station', fam: 'move', glyph: 'train' },
  airport:    { label: 'Airport', fam: 'move', glyph: 'plane' },
  disney:     { label: 'Disney', fam: 'disney', glyph: 'castle' },
};

// Chips on the map, in order. Each selects one or more categories.
export const CHIPS = [
  { key: 'meal',    label: 'Food',     glyph: 'utensils', fam: 'meal' },
  { key: 'sweet',   label: 'Sweets',   glyph: 'icecream', fam: 'sweet' },
  { key: 'drink',   label: 'Drinks',   glyph: 'martini',  fam: 'drink' },
  { key: 'konbini', label: 'Konbini',  glyph: 'store',    fam: 'konbini' },
  { key: 'photo',   label: 'Photo',    glyph: 'camera',   fam: 'sight', cats: ['photo', 'viewpoint'] },
  { key: 'sight',   label: 'See & do', glyph: 'torii',    fam: 'sight', cats: ['sight', 'onsen'] },
  { key: 'shop',    label: 'Shopping', glyph: 'bag',      fam: 'shop' },
  { key: 'poke',    label: 'Pokémon',  glyph: 'pokeball', fam: 'poke' },
  { key: 'stay',    label: 'Stay',     glyph: 'bed',      fam: 'stay' },
  { key: 'move',    label: 'Transport', glyph: 'car',     fam: 'move' },
  { key: 'disney',  label: 'Disney',   glyph: 'castle',   fam: 'disney' },
];

export const MAP_STYLES = {
  google: {
    label: 'Google Maps',
    note: 'Sharp at any zoom, English labels. Needs a connection; without one the app shows OpenStreetMap.',
    provider: 'google',
  },
  osm: {
    label: 'OpenStreetMap',
    note: 'Standard map. Labels in Japan are mostly in Japanese. Works offline for areas already viewed.',
    provider: 'leaflet',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  osmde: {
    label: 'OpenStreetMap, Latin names',
    note: 'German community style that writes non-Latin names in Latin script.',
    provider: 'leaflet',
    url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · tiles openstreetmap.de',
    maxZoom: 18,
  },
};

export const MODES = {
  walking: { label: 'Walk', gm: 'walking', app: 'walking' },
  transit: { label: 'Transit', gm: 'transit', app: 'transit' },
  driving: { label: 'Drive', gm: 'driving', app: 'driving' },
};

export const MEALS = ['breakfast', 'lunch', 'dinner'];
export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', late: 'Late night' };
export const MEAL_TIME = { breakfast: '08:00', lunch: '12:30', dinner: '19:00' };

export const LISTS = [
  { key: 'eat', label: 'Eat' },
  { key: 'buy', label: 'Buy' },
  { key: 'see', label: 'See' },
  { key: 'bring', label: 'Bring' },
  { key: 'admin', label: 'Admin' },
];

export const SOURCE_TYPES = {
  S: 'Official site', G: 'Google listing', T: 'Tabelog', P: 'Press · guide', M: 'Michelin', K: 'Claude, unverified',
};
