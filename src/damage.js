import { rng } from './textures.js';

// Wear and damage maps for the disc, in the same square layout as the label (radius = 512 px).
//
// surface: R = scratch strength, G = scratch direction (0–180°), B = scuff haze
// body:    R = intact (black = hole / chip), G = grime, B = milky stain (disc rot)
//
// The shader makes scratches glint only when the light catches them at the right angle,
// so they sparkle and fade as the disc moves, like real scratched plastic.

export const CONDITIONS = [
  { id: 'mint', name: 'Mint', values: { wear: 0, scuffs: 0, dust: 0, rot: 0, chips: 0 } },
  { id: 'light', name: 'Light use', values: { wear: 0.25, scuffs: 0.1, dust: 0.1, rot: 0, chips: 0 } },
  { id: 'loved', name: 'Well loved', values: { wear: 0.55, scuffs: 0.35, dust: 0.3, rot: 0, chips: 0 } },
  { id: 'scratched', name: 'Scratched up', values: { wear: 0.9, scuffs: 0.6, dust: 0.45, rot: 0, chips: 0.15 } },
  { id: 'trashed', name: 'Trashed', values: { wear: 1, scuffs: 0.85, dust: 0.7, rot: 0.7, chips: 0.6 } },
];

const SIZE = 1024;
const C = SIZE / 2;
const IN = 0.38 * C;   // inner edge of the data area
const OUT = 0.975 * C; // outer edge

function canvas(fill) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  return ctx;
}

// Random point in the data ring (area-uniform)
function ringPoint(rand, rMin = IN, rMax = OUT) {
  const r = Math.sqrt(rMin * rMin + rand() * (rMax * rMax - rMin * rMin));
  const a = rand() * Math.PI * 2;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r, r, a];
}

// Scratch colour: strength in red, direction (mod 180°) in green.
function scratchStyle(strength, angle) {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return `rgb(${Math.round(strength * 255)}, ${Math.round((a / Math.PI) * 255)}, 0)`;
}

function line(ctx, x0, y0, x1, y1, width) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// Irregular blob with smooth, wavy edges (for flakes, chips and stains)
function blob(ctx, x, y, radius, rand, jag = 0.45, points = 48) {
  const ph = [rand() * 6.3, rand() * 6.3, rand() * 6.3, rand() * 6.3];
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wave = 0.45 * Math.sin(2 * a + ph[0]) + 0.3 * Math.sin(3 * a + ph[1]) + 0.17 * Math.sin(5 * a + ph[2]) + 0.08 * Math.sin(9 * a + ph[3]);
    const r = radius * (1 + jag * wave);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function softSpot(ctx, x, y, radius, rgb, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function makeDamage({ wear = 0, scuffs = 0, dust = 0, rot = 0, chips = 0 }, seed = 1) {
  const rand = rng(seed * 7919 + 13);
  const scr = canvas('#000');   // scratches: strength + direction
  const haze = canvas('#000');  // scuffs
  const hole = canvas('#fff');  // intact = white
  const grime = canvas('#000');
  const stain = canvas('#000');
  scr.lineCap = 'round';

  // --- Scratches: sweeping arcs from spinning in a drive / case, and straight gouges
  const n = Math.round(Math.pow(wear, 1.3) * 750);
  for (let i = 0; i < n; i++) {
    const strength = 0.35 + rand() * 0.65;
    const width = 0.6 + Math.pow(rand(), 3) * 2;
    if (rand() < 0.35) {
      // Arc around an off-centre point
      const cx = C + (rand() - 0.5) * C * 0.6;
      const cy = C + (rand() - 0.5) * C * 0.6;
      const [px, py] = ringPoint(rand);
      const r = Math.hypot(px - cx, py - cy);
      let a = Math.atan2(py - cy, px - cx);
      const span = (0.08 + rand() * 0.6) * (rand() < 0.5 ? 1 : -1);
      const steps = Math.max(2, Math.ceil(Math.abs(span) / 0.04));
      for (let k = 0; k < steps; k++) {
        const a2 = a + span / steps;
        scr.strokeStyle = scratchStyle(strength, a + Math.PI / 2);
        line(scr, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, width);
        a = a2;
      }
    } else {
      const [x, y] = ringPoint(rand);
      const ang = rand() * Math.PI * 2;
      const len = 6 + Math.pow(rand(), 2.2) * 260;
      scr.strokeStyle = scratchStyle(strength, ang);
      line(scr, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, width);
    }
  }

  // --- Scuffs: hazy worn patches made of dense micro-scratches
  const patches = Math.round(scuffs * 26);
  for (let i = 0; i < patches; i++) {
    const [x, y] = ringPoint(rand);
    const size = 25 + rand() * 90 * (0.5 + scuffs);
    softSpot(haze, x, y, size, '255,255,255', 0.35 + scuffs * 0.4);
    const micro = 30 + Math.round(rand() * 90);
    const dirBias = rand() * Math.PI;
    for (let k = 0; k < micro; k++) {
      const r = Math.sqrt(rand()) * size;
      const a = rand() * Math.PI * 2;
      const mx = x + Math.cos(a) * r;
      const my = y + Math.sin(a) * r;
      const ang = dirBias + (rand() - 0.5) * 0.9;
      const len = 3 + rand() * 14;
      scr.strokeStyle = scratchStyle(0.2 + rand() * 0.35, ang);
      line(scr, mx, my, mx + Math.cos(ang) * len, my + Math.sin(ang) * len, 0.7);
    }
  }

  // --- Dust: glinting specks + dark grime
  const specks = Math.round(dust * 900);
  for (let i = 0; i < specks; i++) {
    const [x, y] = ringPoint(rand, IN * 0.9, OUT);
    scr.fillStyle = scratchStyle(0.4 + rand() * 0.6, rand() * Math.PI);
    scr.beginPath();
    scr.arc(x, y, 0.6 + rand() * 1.1, 0, Math.PI * 2);
    scr.fill();
  }
  const dirt = Math.round(dust * 220);
  for (let i = 0; i < dirt; i++) {
    const [x, y] = ringPoint(rand, IN * 0.9, OUT);
    grime.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
    blob(grime, x, y, 0.8 + Math.pow(rand(), 3) * 5, rand, 0.4, 10);
  }
  if (dust > 0.4) {
    // smudgy fingerprints of grime
    for (let i = 0; i < Math.round((dust - 0.4) * 10); i++) {
      const [x, y] = ringPoint(rand);
      softSpot(grime, x, y, 30 + rand() * 50, '255,255,255', 0.25);
    }
  }

  // --- Disc rot: the reflective layer flakes away (see-through holes) with milky staining
  const flakes = Math.round(rot * 11);
  for (let i = 0; i < flakes; i++) {
    const [x, y] = ringPoint(rand, IN * 1.05, OUT * 0.97);
    const r = (5 + Math.pow(rand(), 1.5) * 32) * (0.5 + rot);
    // stain halo first
    softSpot(stain, x, y, r * (2.2 + rand() * 1.5), '255,255,255', 0.75);
    stain.fillStyle = 'rgba(255,255,255,0.5)';
    blob(stain, x, y, r * 1.6, rand, 0.5);
    // the hole itself
    hole.fillStyle = '#000';
    blob(hole, x, y, r, rand, 0.45);
    // flaky foil edge catches the light
    scr.strokeStyle = scratchStyle(0.9, rand() * Math.PI);
    scr.lineWidth = 1.2;
    scr.beginPath();
    scr.arc(x, y, r * 1.08, 0, Math.PI * 2);
    scr.stroke();
  }
  // big milky clouds (water damage / bronzing)
  for (let i = 0; i < Math.round(rot * 9); i++) {
    const [x, y] = ringPoint(rand);
    const r = 50 + rand() * 150;
    softSpot(stain, x, y, r, '255,255,255', 0.45 + rot * 0.4);
  }

  // --- Chips: bites out of the edge, with cracks running inward
  const nChips = chips > 0 ? 1 + Math.round(chips * 2.5) : 0;
  for (let i = 0; i < nChips; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.05 + rand() * 0.11) * C * (0.6 + chips);
    const x = C + Math.cos(a) * C * 1.0;
    const y = C + Math.sin(a) * C * 1.0;
    hole.fillStyle = '#000';
    blob(hole, x, y, r, rand, 0.3, 24);
    // stress whitening + cracks
    softSpot(haze, C + Math.cos(a) * (C - r), C + Math.sin(a) * (C - r), r * 1.4, '255,255,255', 0.6);
    const cracks = 1 + Math.round(rand() * 2);
    for (let k = 0; k < cracks; k++) {
      let ca = a + (rand() - 0.5) * 0.15;
      let cr = C - r * 0.8;
      const end = cr - (0.08 + rand() * 0.3) * C * chips * 1.4;
      while (cr > Math.max(end, IN)) {
        const nr = cr - 6 - rand() * 10;
        const na = ca + (rand() - 0.5) * 0.04;
        scr.strokeStyle = scratchStyle(1, na);
        line(scr, C + Math.cos(ca) * cr, C + Math.sin(ca) * cr, C + Math.cos(na) * nr, C + Math.sin(na) * nr, 1.4);
        cr = nr;
        ca = na;
      }
    }
  }

  // --- Merge into the two maps
  const surface = canvas();
  const body = canvas();
  const S = scr.getImageData(0, 0, SIZE, SIZE).data;
  const Hz = haze.getImageData(0, 0, SIZE, SIZE).data;
  const Ho = hole.getImageData(0, 0, SIZE, SIZE).data;
  const G = grime.getImageData(0, 0, SIZE, SIZE).data;
  const St = stain.getImageData(0, 0, SIZE, SIZE).data;
  const so = surface.createImageData(SIZE, SIZE);
  const bo = body.createImageData(SIZE, SIZE);
  for (let i = 0; i < so.data.length; i += 4) {
    so.data[i] = S[i];
    so.data[i + 1] = S[i + 1];
    so.data[i + 2] = Hz[i];
    so.data[i + 3] = 255;
    bo.data[i] = Ho[i];
    bo.data[i + 1] = G[i];
    bo.data[i + 2] = St[i];
    bo.data[i + 3] = 255;
  }
  surface.putImageData(so, 0, 0);
  body.putImageData(bo, 0, 0);
  return { surface: surface.canvas, body: body.canvas };
}
