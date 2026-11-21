import { loadFonts } from './fronts.js';

// Text printed around the clear centre hub, like "Is it live or is it Memorex?".
// Top arc: reads left to right, letters standing up. Bottom arc: reads left to right,
// letters hanging toward the centre (so both read without turning your head).
//
// The canvas covers the square from -SPAN to +SPAN disc units around the centre, which is
// much sharper than drawing this tiny text onto the full-disc label texture.

export const SPAN = 0.3;
const SIZE = 1024;
const PX = SIZE / (2 * SPAN); // pixels per disc unit
const TOP_BASELINE = 0.233; // radius of the top arc's baseline
const BOTTOM_BASELINE = 0.263; // radius of the bottom arc's baseline (letters reach inward)
const CAP = 0.026; // letter height in disc units (~1.6 mm on a real disc)
const MAX_ARC = Math.PI * 0.82; // longest an arc may run before the text shrinks

function arcText(ctx, text, radius, top, px) {
  const c = SIZE / 2;
  const r = radius * PX;
  let size = px;
  ctx.font = `500 ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;
  let width = ctx.measureText(text).width;
  if (width / r > MAX_ARC) {
    size *= MAX_ARC / (width / r);
    ctx.font = `500 ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;
    width = ctx.measureText(text).width;
  }
  const total = width / r;
  let along = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    const mid = (along + w / 2) / r;
    const a = top ? -Math.PI / 2 - total / 2 + mid : Math.PI / 2 + total / 2 - mid;
    ctx.save();
    ctx.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    along += w;
  }
}

// Returns a transparent canvas with the hub text, or null when there's no text.
export async function drawHubText(design) {
  const topText = (design.hubText1 || '').trim();
  const bottomText = (design.hubText2 || '').trim() || topText;
  if (!topText && !bottomText) return null;
  await loadFonts();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = design.hubTextColor || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Font size such that capital letters are about CAP tall
  const px = (CAP * PX) / 0.73;
  if (topText) arcText(ctx, topText, TOP_BASELINE, true, px);
  if (bottomText) arcText(ctx, bottomText, BOTTOM_BASELINE, false, px);
  return canvas;
}
