// Draws the printed label (top side of the CD) onto a square canvas.
// The canvas spans the full disc diameter; the centre hole and clear hub are cut out by the 3D model.

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function drawCover(ctx, img, size) {
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
}

function fitText(ctx, text, weight, startPx, maxWidth) {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  } while (px > 10);
  return px;
}

// True if the image has any meaningfully transparent pixels (checked at low resolution, cached).
const alphaCache = new Map();
export function imageHasAlpha(img) {
  const key = img.src;
  if (alphaCache.has(key)) return alphaCache.get(key);
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  drawCover(ctx, img, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  let found = false;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 245) {
      found = true;
      break;
    }
  }
  if (alphaCache.size > 20) alphaCache.clear();
  alphaCache.set(key, found);
  return found;
}

// Colour of the bare reflective layer under knockouts (tinted by the disc type in the shader).
const MIRROR = '#eef1f4';

function newCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function drawBackground(ctx, design, size) {
  const c = size / 2;
  if (design.bgStyle === 'linear') {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, design.bg1);
    g.addColorStop(1, design.bg2);
    ctx.fillStyle = g;
  } else if (design.bgStyle === 'radial') {
    const g = ctx.createRadialGradient(c, c, size * 0.15, c, c, c);
    g.addColorStop(0, design.bg1);
    g.addColorStop(1, design.bg2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = design.bg1;
  }
  ctx.fillRect(0, 0, size, size);
}

function drawText(ctx, design, size) {
  const c = size / 2;
  ctx.save();
  ctx.fillStyle = design.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = size * 0.01;
  const maxW = size * 0.62;
  if (design.title) {
    fitText(ctx, design.title, 800, Math.round(size * 0.085), maxW);
    ctx.fillText(design.title, c, c - size * 0.3);
  }
  if (design.subtitle) {
    fitText(ctx, design.subtitle, 500, Math.round(size * 0.05), maxW);
    ctx.fillText(design.subtitle, c, c + size * 0.3);
  }
  ctx.restore();
}

// Draws the custom printed label.
// Returns { color, material, knockouts }:
//   color     – the label image
//   material  – only when knockouts are active: per-pixel roughness (green) / metalness (blue);
//               transparent parts of the artwork become bare mirror
//   knockouts – whether the label has knockouts
// With { bake: true } the print layer is returned with transparency intact (for design files).
export async function drawLabel(design, size = 1024, { bake = false } = {}) {
  const art = design.labelRendered || design.labelImage;
  let img = null;
  if (art) {
    try {
      img = await loadImage(art);
    } catch (e) {
      console.warn(e);
    }
  }
  const knockouts = !!(design.knockouts && img && imageHasAlpha(img));
  const baked = !!design.labelRendered; // design files already contain background + text

  // The print layer: what the ink covers.
  const layer = newCanvas(size);
  const ctx = layer.getContext('2d');
  if (!knockouts && !baked) drawBackground(ctx, design, size);
  if (img) drawCover(ctx, img, size);
  if (!baked) drawText(ctx, design, size);

  if (!knockouts || bake) return { color: layer, material: null, knockouts };

  // Finished label: bare mirror under the print.
  const color = newCanvas(size);
  const cctx = color.getContext('2d');
  cctx.fillStyle = MIRROR;
  cctx.fillRect(0, 0, size, size);
  cctx.drawImage(layer, 0, 0);

  // Material: ink where printed, mirror where knocked out, blended by transparency.
  const printRough = design.finish === 'matte' ? 0.85 : 0.35;
  const material = newCanvas(size);
  const mctx = material.getContext('2d');
  const src = ctx.getImageData(0, 0, size, size).data;
  const out = mctx.createImageData(size, size);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = src[i + 3] / 255;
    d[i + 1] = Math.round((printRough * a + 0.04 * (1 - a)) * 255);
    d[i + 2] = Math.round((1 - a) * 255);
    d[i + 3] = 255;
  }
  mctx.putImageData(out, 0, 0);
  return { color, material, knockouts };
}
