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

// ---------------------------------------------------------------------------
// Serial number: small black dot-matrix characters (5×7 dots), like the inkjet code
// stamped on the innermost ring of real discs.
// ---------------------------------------------------------------------------
const DOTS = {
  0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e], 1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  2: [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f], 3: [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02], 5: [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  6: [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e], 7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e], 9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11], B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e], D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f], F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f], H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e], J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d], R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e], T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a], X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x11, 0x0a, 0x04, 0x04, 0x04], Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '-': [0, 0, 0, 0x1f, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0x0c, 0x0c], '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};
const SERIAL_BASELINE = 0.152; // radius of the serial's baseline (letters reach outward)
const SERIAL_HEIGHT = 0.024;   // character height in disc units (~1.4 mm)
const SERIAL_CENTRE = Math.PI; // centred on the left of the hole, reading upward

function drawSerial(ctx, text, color) {
  const c = SIZE / 2;
  const pitch = (SERIAL_HEIGHT * PX) / 7; // spacing between dots
  const r = SERIAL_BASELINE * PX;
  const chars = [...text.toUpperCase()].map((ch) => DOTS[ch] || DOTS[' ']);
  const charW = pitch * 6; // 5 dots + 1 gap
  const total = (chars.length * charW) / r;
  ctx.fillStyle = color;
  chars.forEach((rows, i) => {
    const a = SERIAL_CENTRE - total / 2 + ((i + 0.5) * charW) / r;
    ctx.save();
    ctx.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2); // letters stand outward, reading clockwise (up the left side)
    rows.forEach((bits, row) => {
      for (let col = 0; col < 5; col++) {
        if (!(bits & (16 >> col))) continue;
        ctx.globalAlpha = 0.9 + (((i * 31 + row * 7 + col * 13) % 10) / 10) * 0.1; // inkjet dots vary a little
        ctx.beginPath();
        ctx.arc((col - 2) * pitch, -(6 - row) * pitch - pitch / 2, pitch * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

// A realistic-looking code, e.g. "ZDA711XS207RA03"
export function randomSerial() {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return pick(L, 3) + pick('0123456789', 3) + pick(L, 2) + pick('0123456789', 3) + pick(L, 2) + pick('0123456789', 2);
}

// Returns a transparent canvas with the hub text, or null when there's no text.
export async function drawHubText(design) {
  const topText = (design.hubText1 || '').trim();
  const bottomText = (design.hubText2 || '').trim() || topText;
  const serial = (design.hubSerial || '').trim();
  if (!topText && !bottomText && !serial) return null;
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
  if (serial) drawSerial(ctx, serial, design.hubSerialColor || '#0b0c0d');
  return canvas;
}
