import * as THREE from 'three';
import { INK_COLORS as COLORS, INK_SIZES as SIZES, drawStroke } from './ink.js';

// "Sharpie mode": a toolbar over the 3D view. While writing, the disc holds still facing
// the viewer and pointer strokes are drawn onto the ink layer above the label.
//
// Two layers of writing:
//   saved – part of the design (written in the editor); visitors can't undo or clear it
//   own   – this person's writing. In the editor, own writing *is* the saved writing.

// Icons (24×24). The marker is from the Figma design; the others are drawn to match its style.
const ICONS = {
  marker:
    '<svg viewBox="0 0 20.53 20.53" width="20" height="20" fill="none" aria-hidden="true"><path d="M11 .53 6.707 4.823a1 1 0 0 0 0 1.414l7.586 7.586a1 1 0 0 0 1.414 0L20 9.53" stroke="currentColor" stroke-width="1.5"/><path d="M7.571 6.53 5.414 8.688a2 2 0 0 0 0 2.828l3.6 3.6a2 2 0 0 0 2.829 0L14 12.959" stroke="currentColor" stroke-width="1.5"/><path d="M3 13.673 5.143 11.53 9 15.388 6.857 17.53 1 20.53l-1-1 3-5.857Z" fill="currentColor"/></svg>',
  undo:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5 4 10l4.5-4.5"/><path d="M4.5 10H14a5 5 0 0 1 0 10h-3"/></svg>',
  redo:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 14.5 20 10l-4.5-4.5"/><path d="M19.5 10H10a5 5 0 0 0 0 10h3"/></svg>',
  save:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v15"/><path d="m6 13 6 6 6-6"/></svg>',
  clear:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5h16"/><path d="M9.5 6.5V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6 6.5 7 19a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12.5"/><path d="M10 10.5v6M14 10.5v6"/></svg>',
};

// Swatch colours shown in the toolbar (from the Figma design). The ink itself uses the
// realistic permanent-marker colours from ink.js.
const SWATCH = { Black: '#303030', Red: '#ff383c', Blue: '#0088ff' };

const FONT_URL = new URL('../fonts/geist-sans-latin-600-normal.woff2', import.meta.url).href;
const CSS = `
@font-face { font-family: "Geist"; src: url(${FONT_URL}) format("woff2"); font-weight: 600; font-display: swap; }
.cdm { position: absolute; left: 19px; top: 20px; z-index: 5; display: flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 3.5px; border-radius: 38px; box-sizing: border-box;
  background: rgba(225, 225, 226, 0.92); border: 0.5px solid rgba(129, 129, 129, 0.3);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font: 600 13px "Geist", Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color: #1e1e1e;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; user-select: none; }
.cdm[hidden] { display: none; }
.cdm button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center;
  justify-content: center; height: 32px; padding: 4px 9px; border-radius: 28px; color: #1e1e1e; }
.cdm button:hover { background: rgba(118, 118, 128, 0.12); }
.cdm button:focus-visible { outline: 2px solid #00c0e8; outline-offset: 1px; }
.cdm .pen { width: 42px; }
.cdm.on .pen { background: rgba(118, 118, 128, 0.12); box-shadow: inset 0 0 0 0.5px rgba(129, 129, 129, 0.3); }
.cdm .tools { display: none; align-items: center; gap: 8px; }
.cdm.on .tools { display: inline-flex; }
.cdm .swatch { width: 24px; height: 24px; padding: 0; border-radius: 99px; }
.cdm .swatch:hover { background: var(--c); filter: brightness(1.1); }
.cdm .swatch[aria-pressed=true] { box-shadow: 0 0 0 2px rgba(225, 225, 226, 0.95), 0 0 0 3.5px currentColor; }
.cdm .sep { width: 1px; height: 32px; background: rgba(49, 49, 49, 0.1); }
.cdm .seg { display: inline-flex; gap: 2px; align-items: center; height: 32px; }
.cdm .seg button { height: 25px; padding: 4px 8px; border-radius: 26px; color: #757575; }
.cdm .seg button[aria-pressed=true] { background: #fff; color: #1e1e1e;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.3), 0 1px 1.5px rgba(0, 0, 0, 0.15); }
.cdm .icons { display: inline-flex; gap: 2px; }
.cdm .done { background: rgba(118, 118, 128, 0.12); box-shadow: inset 0 0 0 0.5px rgba(129, 129, 129, 0.3); }
.cdm .done:hover { background: rgba(118, 118, 128, 0.22); }
.cdm .tip { position: absolute; left: calc(100% + 4px); top: 50%; transform: translateY(-50%);
  padding: 8.5px 12.5px; border-radius: 8px; background: #303030; border: 0.5px solid rgba(129, 129, 129, 0.3);
  color: #f3f3f3; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.15s ease; }
.cdm:not(.on) .pen:hover + .tip, .cdm:not(.on) .pen:focus-visible + .tip { opacity: 1; }
.cdm.on .tip { display: none; }
`;

export function createMarker({ container, canvasEl, camera, labelMesh, ink, onToggle, onChange = () => {}, snapshot, editor = false }) {
  if (!document.getElementById('cdm-style')) {
    const style = document.createElement('style');
    style.id = 'cdm-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const bar = document.createElement('div');
  bar.className = 'cdm';
  bar.innerHTML = `
    <button class="pen" type="button" aria-pressed="false" aria-label="Marker mode: write on the CD">${ICONS.marker}</button>
    <span class="tip" aria-hidden="true">Marker Mode</span>
    <span class="tools">
      ${COLORS.map((c, i) => `<button class="swatch" type="button" data-color="${c.value}" aria-pressed="${i === 0}" aria-label="${c.name} marker" title="${c.name}" style="--c:${SWATCH[c.name] || c.value};background:var(--c);color:var(--c)"></button>`).join('')}
      <span class="sep"></span>
      <span class="seg" role="group" aria-label="Tip size">
        <button class="size" type="button" data-size="fine" aria-pressed="true">Fine</button>
        <button class="size" type="button" data-size="bold" aria-pressed="false">Bold</button>
      </span>
      <span class="sep"></span>
      <span class="icons">
        <button class="undo" type="button" aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)">${ICONS.undo}</button>
        <button class="redo" type="button" aria-label="Redo" title="Redo (⌘⇧Z / Ctrl+Y)">${ICONS.redo}</button>
        <button class="save" type="button" aria-label="Save a picture of the CD" title="Save image">${ICONS.save}</button>
      </span>
      <span class="sep"></span>
      <button class="clear" type="button" aria-label="Clear writing" title="Clear">${ICONS.clear}</button>
      <span class="sep"></span>
      <button class="done" type="button">Done</button>
    </span>`;
  container.appendChild(bar);

  const ctx = ink.canvas.getContext('2d');
  const W = ink.canvas.width;
  // Finished strokes are kept on `base`; the stroke being drawn is added on top each move.
  const base = document.createElement('canvas');
  base.width = base.height = W;
  const bctx = base.getContext('2d');

  let saved = []; // from the design (viewer only)
  const strokes = []; // { color, width, points: [[x,y] | null] }  null = pen lifted off the label
  let color = COLORS[0].value;
  let size = 'fine';
  let writing = false;
  let current = null;
  let canDraw = () => true; // set by the stage: only once the disc has turned to face you

  function show() {
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(base, 0, 0);
    if (current) drawStroke(ctx, current);
    ink.texture.needsUpdate = true;
  }
  function redraw() {
    bctx.clearRect(0, 0, W, W);
    for (const s of saved) drawStroke(bctx, s);
    for (const s of strokes) drawStroke(bctx, s);
    show();
  }
  const changed = () => onChange(strokes.map((s) => ({ ...s, points: s.points.slice() })));

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitPoint(e) {
    const r = canvasEl.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(labelMesh, false)[0];
    if (!hit || !hit.uv) return null;
    return [hit.uv.x * W, (1 - hit.uv.y) * W];
  }

  function addPoint(e) {
    const p = hitPoint(e);
    const pts = current.points;
    const prev = pts[pts.length - 1];
    if (p || prev) pts.push(p);
  }

  function down(e) {
    if (!writing || e.button > 0 || !canDraw()) return;
    e.preventDefault();
    e.stopPropagation();
    canvasEl.setPointerCapture(e.pointerId);
    current = { color, width: SIZES[size], points: [] };
    addPoint(e);
    show();
  }
  function move(e) {
    if (!writing || !current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) addPoint(ev);
    show();
  }
  function up() {
    if (!current) return;
    const done = current;
    current = null;
    if (done.points.some(Boolean)) {
      strokes.push(done);
      undone.length = 0; // a new stroke ends the redo history
      drawStroke(bctx, done);
      changed();
    }
    show();
  }
  // Capture phase so the drag-to-rotate controls never see writing strokes.
  canvasEl.addEventListener('pointerdown', down, { capture: true });
  canvasEl.addEventListener('pointermove', move, { capture: true });
  canvasEl.addEventListener('pointerup', up);
  canvasEl.addEventListener('pointercancel', up);

  // --- toolbar -------------------------------------------------------------
  const pen = bar.querySelector('.pen');
  function setWriting(on) {
    if (writing === on) return;
    writing = on;
    bar.classList.toggle('on', on);
    pen.setAttribute('aria-pressed', String(on));
    canvasEl.style.cursor = on ? 'crosshair' : '';
    canvasEl.style.touchAction = on ? 'none' : 'pan-y';
    up();
    onToggle(on);
  }
  pen.addEventListener('click', () => setWriting(!writing));
  bar.querySelector('.done').addEventListener('click', () => setWriting(false));
  for (const b of bar.querySelectorAll('.swatch')) {
    b.addEventListener('click', () => {
      color = b.dataset.color;
      bar.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  }
  for (const b of bar.querySelectorAll('.size')) {
    b.addEventListener('click', () => {
      size = b.dataset.size;
      bar.querySelectorAll('.size').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  }
  const undone = []; // strokes taken back by undo, for redo
  function undo() {
    if (!strokes.length) return;
    undone.push(strokes.pop());
    redraw();
    changed();
  }
  function redo() {
    if (!undone.length) return;
    strokes.push(undone.pop());
    redraw();
    changed();
  }
  bar.querySelector('.undo').addEventListener('click', undo);
  bar.querySelector('.redo').addEventListener('click', redo);

  // Keyboard: Cmd/Ctrl+Z to undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) to redo, while the marker is out.
  // Text fields keep their own undo.
  window.addEventListener('keydown', (e) => {
    if (!writing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey)) {
      e.preventDefault();
      redo();
    }
  });
  bar.querySelector('.clear').addEventListener('click', () => {
    if (!strokes.length) return;
    strokes.length = 0;
    undone.length = 0;
    redraw();
    changed();
  });
  // Save a picture of the CD (transparent PNG)
  bar.querySelector('.save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = snapshot();
    a.download = 'my-cd.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  return {
    setAvailable(on) {
      on = on || editor; // you can always write in the editor
      bar.hidden = !on;
      if (!on) setWriting(false);
    },
    // Writing saved in the design. In the editor it becomes your editable writing.
    setSaved(list) {
      if (editor) {
        strokes.length = 0;
        strokes.push(...list);
      } else saved = list;
      redraw();
    },
    setCanDraw(fn) {
      canDraw = fn;
    },
    get writing() {
      return writing;
    },
  };
}
