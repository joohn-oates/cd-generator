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

export async function drawLabel(design, size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  // Pre-rendered label from a design file: use it as-is.
  if (design.labelRendered) {
    drawCover(ctx, await loadImage(design.labelRendered), size);
    return canvas;
  }

  // Background
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

  // Artwork
  if (design.labelImage) {
    try {
      drawCover(ctx, await loadImage(design.labelImage), size);
    } catch (e) {
      console.warn(e);
    }
  }

  // Text: title above the hole, subtitle below it
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
  return canvas;
}
