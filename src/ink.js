// Permanent-marker ink: how strokes look, and how they're stored in designs.

export const INK_COLORS = [
  { name: 'Black', value: '#141414' },
  { name: 'Red', value: '#c4161c' },
  { name: 'Blue', value: '#1d3fa6' },
];
// Ink canvas is 1024 px across the 120 mm disc (~8.5 px per mm).
export const INK_SIZES = { fine: 8, bold: 17 };

// ---------------------------------------------------------------------------
// Felt-tip look
// - edges slightly darker than the middle (ink pools at the edge of a marker line)
// - faint streaky texture where the felt tip skips
// - darker blots where the pen starts, stops or moves slowly
// - each stroke is semi-opaque, so crossing strokes look darker, like real marker
// ---------------------------------------------------------------------------

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

let grain = null;
function grainPattern(ctx) {
  if (!grain) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    let seed = 99;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      // sparse light speckles + faint streaks along x
      const streak = (i / 4) % 96 < 48 && rand() < 0.08 ? 0.35 : 0;
      img.data[i + 3] = Math.round(255 * Math.min(1, rand() * 0.1 + streak * 0.7));
    }
    g.putImageData(img, 0, 0);
    grain = c;
  }
  return ctx.createPattern(grain, 'repeat');
}

// Splits a stroke's points at pen lifts (nulls) into runs of points.
function runs(points) {
  const out = [];
  let run = [];
  for (const p of points) {
    if (p) run.push(p);
    else if (run.length) {
      out.push(run);
      run = [];
    }
  }
  if (run.length) out.push(run);
  return out;
}

// Smooth path through the points using midpoint quadratic curves.
function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) {
    ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

let scratch = null;
// Draws one stroke onto `target` (a 2D context).
export function drawStroke(target, stroke) {
  const size = target.canvas.width;
  if (!scratch || scratch.width !== size) {
    scratch = document.createElement('canvas');
    scratch.width = scratch.height = size;
  }
  const ctx = scratch.getContext('2d');
  const w = stroke.width;
  const parts = runs(stroke.points);
  if (!parts.length) return;

  // Bounding box (keeps the texture pass cheap)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const run of parts) for (const [x, y] of run) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const pad = w * 1.5;
  const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad));
  const bw = Math.min(size, Math.ceil(x1 + pad)) - bx, bh = Math.min(size, Math.ceil(y1 + pad)) - by;
  ctx.clearRect(bx, by, bw, bh);

  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  for (const run of parts) {
    // Edge (darker), then body
    tracePath(ctx, run);
    ctx.strokeStyle = shade(stroke.color, -0.25);
    ctx.lineWidth = w;
    ctx.stroke();
    tracePath(ctx, run);
    ctx.strokeStyle = shade(stroke.color, 0.03);
    ctx.lineWidth = w * 0.68;
    ctx.stroke();
  }

  // Ink pooling: start, end and slow spots (points bunched close together)
  ctx.fillStyle = shade(stroke.color, -0.35);
  for (const run of parts) {
    const pools = [run[0], run[run.length - 1]];
    for (let i = 1; i < run.length; i++) {
      const dx = run[i][0] - run[i - 1][0], dy = run[i][1] - run[i - 1][1];
      if (dx * dx + dy * dy < (w * 0.12) ** 2) pools.push(run[i]);
    }
    ctx.globalAlpha = 0.28;
    for (const [x, y] of pools) {
      ctx.beginPath();
      ctx.arc(x, y, w * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Felt-tip texture: knock tiny speckles/streaks out of the ink
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(bx, by, bw, bh);
  ctx.globalCompositeOperation = 'source-over';

  // Semi-opaque, so overlapping strokes build up darker
  target.save();
  target.globalAlpha = 0.95;
  target.drawImage(scratch, bx, by, bw, bh, bx, by, bw, bh);
  target.restore();
}

// ---------------------------------------------------------------------------
// Storage: strokes packed into a short base64url string for links / design files.
// Per stroke: header byte (colour index, bold flag), point count, then
// zig-zag varint deltas of the 1024-px coordinates.
// ---------------------------------------------------------------------------

function pushVarint(out, n) {
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
}
const zig = (n) => (n << 1) ^ (n >> 31);
const unzig = (n) => (n >>> 1) ^ -(n & 1);

export function encodeInk(strokes) {
  const out = [];
  for (const s of strokes) {
    const color = Math.max(0, INK_COLORS.findIndex((c) => c.value === s.color));
    const bold = s.width >= INK_SIZES.bold ? 1 : 0;
    for (const run of runs(s.points)) {
      out.push((color << 1) | bold);
      pushVarint(out, run.length);
      let px = 0, py = 0;
      for (const [x, y] of run) {
        const ix = Math.round(x), iy = Math.round(y);
        pushVarint(out, zig(ix - px));
        pushVarint(out, zig(iy - py));
        px = ix;
        py = iy;
      }
    }
  }
  let bin = '';
  for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeInk(str) {
  if (!str) return [];
  try {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    let i = 0;
    const varint = () => {
      let n = 0, shift = 0, b;
      do {
        b = bytes[i++];
        n |= (b & 127) << shift;
        shift += 7;
      } while (b & 128);
      return n >>> 0;
    };
    const strokes = [];
    while (i < bytes.length) {
      const h = bytes[i++];
      const color = INK_COLORS[(h >> 1) % INK_COLORS.length].value;
      const width = h & 1 ? INK_SIZES.bold : INK_SIZES.fine;
      const count = varint();
      const points = [];
      let x = 0, y = 0;
      for (let k = 0; k < count; k++) {
        x += unzig(varint());
        y += unzig(varint());
        points.push([x, y]);
      }
      strokes.push({ color, width, points });
    }
    return strokes;
  } catch (e) {
    console.warn('Could not read saved writing', e);
    return [];
  }
}
