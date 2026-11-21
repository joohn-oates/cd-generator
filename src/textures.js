import * as THREE from 'three';

// Seeded random numbers, so a design's grain and scratches look identical every time it loads.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Soft blotchy noise (uneven ink / paper), drawn by upscaling a tiny random image.
function mottle(ctx, size, rand, cells, alpha) {
  const small = canvas(cells);
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, size, size);
  ctx.restore();
}

// Fine scratches: mostly short arcs around the centre (how CDs get scuffed), plus a few straight ones.
function scratches(ctx, size, rand, amount, arcs = 0.7) {
  const c = size / 2;
  const count = Math.round(amount * 160);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const light = rand() > 0.35;
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.35 + rand() * 0.5})` : `rgba(0,0,0,${0.25 + rand() * 0.4})`;
    ctx.lineWidth = 0.6 + rand() * 1.4;
    ctx.beginPath();
    if (rand() < arcs) {
      const r = c * (0.38 + rand() * 0.6);
      const a = rand() * Math.PI * 2;
      ctx.arc(c, c, r, a, a + (0.05 + rand() * 0.35) * (rand() < 0.5 ? 1 : -1));
    } else {
      const x = rand() * size;
      const y = rand() * size;
      const ang = rand() * Math.PI * 2;
      const len = size * (0.02 + rand() * 0.12);
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Film-grain + mottling baked onto the printed label colours.
export function applyGrain(labelCanvas, amount, seed = 7) {
  if (amount <= 0) return;
  const size = labelCanvas.width;
  const ctx = labelCanvas.getContext('2d');
  const rand = rng(seed);

  // Uneven ink: soft light/dark patches
  const m = canvas(size);
  mottle(m.getContext('2d'), size, rand, 24, 1);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = amount * 0.55;
  ctx.drawImage(m, 0, 0);
  ctx.restore();

  // Per-pixel grain
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const strength = amount * 95;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t; // linear data (not colour)
}

// Height map for the printed side: paper/ink texture + scratches. Used as a bump map.
export function labelSurfaceMap(texture, wear, seed = 11, size = 1024) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  if (texture > 0) {
    mottle(ctx, size, rand, 90, 0.25 * texture);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 70 * texture;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }
  if (wear > 0) scratches(ctx, size, rand, wear * 0.4, 0);
  return toTexture(c);
}

// Height map for the shiny side: faint grooves + scratches that catch the light.
export function dataSurfaceMap(wear, seed = 23, size = 1024) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  if (wear > 0) scratches(ctx, size, rand, wear);
  return toTexture(c);
}
