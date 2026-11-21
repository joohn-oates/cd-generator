// A "design" is a plain object describing one CD.
// Simple designs are stored entirely in the link (?c=...).
// Designs with an uploaded image are saved as a file in /designs and loaded with ?d=name.

export const DEFAULTS = {
  // Front: a blank CD-R brand style ('tdk' | 'maxell' | 'imation' | 'verbatim' | 'sony'),
  // or 'custom' for your own printed label below.
  front: 'tdk',

  // Custom printed label (front: 'custom')
  bgStyle: 'linear',        // 'solid' | 'linear' | 'radial'
  bg1: '#ff4f6e',
  bg2: '#6a5cff',
  title: 'NEW SINGLE',
  subtitle: 'Artist Name',
  textColor: '#ffffff',
  finish: 'gloss',          // 'gloss' | 'matte'
  knockouts: true,          // transparent parts of uploaded artwork become bare mirror
  grain: 0.35,              // 0..1 film grain + uneven ink on the print
  texture: 0.5,             // 0..1 raised paper/ink texture that catches light

  // Disc (shiny data side + plastic hub)
  discType: 'pressed',      // see discTypes.js (dye + reflective layer)
  tint: '#ffffff',          // only used when discType is 'custom'
  rainbow: 1,               // 0..1 strength of the moving rainbow streaks
  shine: 0.85,              // 0..1 (1 = mirror)
  hub: 'clear',             // 'clear' | 'silver'
  hubText1: '',             // text printed around the top of the hub ring
  hubText2: '',             // around the bottom (blank = repeat the top text)
  hubTextColor: '#ffffff',
  wear: 0.25,               // 0..1 scratches (glint as the disc moves)
  scuffs: 0.1,              // 0..1 hazy worn patches
  dust: 0.1,                // 0..1 specks and grime
  rot: 0,                   // 0..1 disc rot: flaking foil, see-through holes, milky stains
  chips: 0,                 // 0..1 bites out of the edge with cracks
  damageSeed: 1,            // which random damage pattern

  // Motion
  motion: 'turntable',      // 'turntable' | 'spin' | 'float' | 'none'
  speed: 1,
  tilt: 12,                 // degrees
  drag: true,
  marker: false,            // visitors can write on the embed with a marker (you always can in the editor)
  ink: '',                  // writing saved into the design (see ink.js)
};

// Keys that only exist in design files, never in links.
const FILE_ONLY = ['labelImage', 'labelRendered', 'name'];

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Only store settings that differ from the defaults, to keep links short.
export function encodeDesign(design) {
  const diff = {};
  for (const [k, v] of Object.entries(design)) {
    if (FILE_ONLY.includes(k)) continue;
    if (k === 'tint' && design.discType !== 'custom') continue;
    if (k === 'front' || (k in DEFAULTS && DEFAULTS[k] !== v)) diff[k] = v; // front always stored
  }
  return toBase64Url(JSON.stringify(diff));
}

// Designs made before disc types existed used a free tint: keep them as "custom".
// Designs made before brand fronts existed always had a custom printed label.
function upgrade(d) {
  if (!('front' in d)) d.front = 'custom';
  if (!('discType' in d) && d.tint && d.tint !== DEFAULTS.tint) d.discType = 'custom';
  return d;
}

export function decodeDesign(str) {
  try {
    return { ...DEFAULTS, ...upgrade(JSON.parse(fromBase64Url(str))) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function slugify(name) {
  return (
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'my-cd'
  );
}

// Reads ?c=... (design in the link) or ?d=name (design file in /designs).
export async function loadDesignFromLocation(baseUrl = location.href) {
  const params = new URL(location.href).searchParams;
  if (params.has('d')) {
    const name = slugify(params.get('d'));
    const url = new URL(`designs/${name}.json`, baseUrl);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Design "${name}" not found (${url.pathname})`);
    return { ...DEFAULTS, ...upgrade(await res.json()), name };
  }
  if (params.has('c')) return decodeDesign(params.get('c'));
  return { ...DEFAULTS };
}
