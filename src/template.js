// Artwork template: a 1024×1024 transparent PNG with guides showing what's visible on the disc.
// Use it as the top layer in Photoshop / Figma and hide it before exporting.

const SIZE = 1024;
const C = SIZE / 2;
// Same proportions as the 3D disc (radius = 512 px)
const HUB = 0.36 * C;        // hidden behind the clear hub
const EDGE = 0.985 * C;      // edge of the printable area
const SAFE_IN = HUB + 6;
const SAFE_OUT = EDGE - 15;

export function drawTemplate() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px Inter, "Helvetica Neue", Arial, sans-serif`;

  // Corners: cut off by the round disc
  ctx.fillStyle = 'rgba(255, 60, 90, 0.28)';
  ctx.beginPath();
  ctx.rect(0, 0, SIZE, SIZE);
  ctx.arc(C, C, EDGE, 0, Math.PI * 2, true);
  ctx.fill();

  // Centre: hidden behind the hub and hole
  ctx.fillStyle = 'rgba(255, 60, 90, 0.28)';
  ctx.beginPath();
  ctx.arc(C, C, HUB, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(C, C, 0.125 * C, 0, Math.PI * 2);
  ctx.fill();

  // Edge lines
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 40, 80, 0.95)';
  for (const r of [EDGE, HUB]) {
    ctx.beginPath();
    ctx.arc(C, C, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Safe zone (dashed)
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(0, 160, 255, 0.95)';
  for (const r of [SAFE_OUT, SAFE_IN]) {
    ctx.beginPath();
    ctx.arc(C, C, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Title / subtitle positions used by the editor's text fields
  ctx.strokeStyle = 'rgba(0, 160, 255, 0.5)';
  ctx.lineWidth = 1;
  for (const y of [C - SIZE * 0.3, C + SIZE * 0.3]) {
    ctx.beginPath();
    ctx.moveTo(C - SIZE * 0.31, y);
    ctx.lineTo(C + SIZE * 0.31, y);
    ctx.stroke();
  }

  // Labels
  const label = (text, x, y, color, px = 15, w = 700) => {
    ctx.font = font(w, px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  const red = 'rgb(220, 30, 70)';
  const blue = 'rgb(0, 120, 220)';
  label('HIDDEN (hub)', C, C - HUB + 34, red);
  label('CUT OFF', 70, 40, red);
  label('CUT OFF', SIZE - 70, SIZE - 40, red);
  label('SAFE ZONE: keep text and faces between the dashed lines', C, C + HUB + 34, blue, 14);
  label('Title line', C, C - SIZE * 0.3 - 14, blue, 12, 500);
  label('Subtitle line', C, C + SIZE * 0.3 - 14, blue, 12, 500);
  label('1024 × 1024 px · transparent areas become mirror knockouts', C, SIZE - 14, 'rgb(60,60,60)', 13, 500);
  return c;
}
