import * as THREE from 'three';
import { INK_COLORS as COLORS, INK_SIZES as SIZES, drawStroke } from './ink.js';

// "Sharpie mode": a toolbar over the 3D view. While writing, the disc holds still facing
// the viewer and pointer strokes are drawn onto the ink layer above the label.
//
// Two layers of writing:
//   saved – part of the design (written in the editor); visitors can't undo or clear it
//   own   – this person's writing. In the editor, own writing *is* the saved writing.

const ICONS = {
  marker:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M14.5 3.5l6 6-9.5 9.5H5v-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 13l6 6M3 21l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  undo:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 7L4 12l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h10a6 6 0 010 12h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="translate(0 -6)"/></svg>',
  save:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clear:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const CSS = `
.cdm { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px;
  padding: 6px; border-radius: 999px; background: rgba(20,20,24,.78); color: #fff;
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  font: 600 13px system-ui, -apple-system, "Segoe UI", sans-serif; z-index: 5; user-select: none;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); }
.cdm[hidden] { display: none; }
.cdm button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center;
  justify-content: center; min-width: 34px; height: 34px; border-radius: 999px; color: #fff; }
.cdm button:hover { background: rgba(255,255,255,.12); }
.cdm button:focus-visible { outline: 2px solid #8fb3ff; outline-offset: 1px; }
.cdm .tools { display: none; align-items: center; gap: 4px; }
.cdm.on .tools { display: inline-flex; }
.cdm .swatch { min-width: 26px; width: 26px; height: 26px; margin: 0 2px; border: 2px solid rgba(255,255,255,.35); }
.cdm .swatch[aria-pressed=true] { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
.cdm .size { padding: 0 10px; font-size: 12px; }
.cdm .done { padding: 0 14px; background: #fff; color: #111; }
.cdm .done:hover { background: #e9e9ee; }
.cdm .sep { width: 1px; height: 20px; background: rgba(255,255,255,.2); margin: 0 2px; }
.cdm.on .pen { background: rgba(255,255,255,.16); }
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
    <button class="pen" type="button" aria-pressed="false" aria-label="Write on the CD" title="Write on the CD">${ICONS.marker}</button>
    <span class="tools">
      ${COLORS.map((c, i) => `<button class="swatch" type="button" data-color="${c.value}" aria-pressed="${i === 0}" aria-label="${c.name} marker" title="${c.name}" style="background:${c.value}"></button>`).join('')}
      <button class="size" type="button" aria-label="Marker tip size" title="Tip size">Fine</button>
      <span class="sep"></span>
      <button class="undo" type="button" aria-label="Undo" title="Undo">${ICONS.undo}</button>
      <button class="clear" type="button" aria-label="Clear writing" title="Clear">${ICONS.clear}</button>
      <button class="save" type="button" aria-label="Save a picture of the CD" title="Save image">${ICONS.save}</button>
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
  const sizeBtn = bar.querySelector('.size');
  sizeBtn.addEventListener('click', () => {
    size = size === 'fine' ? 'bold' : 'fine';
    sizeBtn.textContent = size === 'fine' ? 'Fine' : 'Bold';
  });
  bar.querySelector('.undo').addEventListener('click', () => {
    if (!strokes.length) return;
    strokes.pop();
    redraw();
    changed();
  });
  bar.querySelector('.clear').addEventListener('click', () => {
    if (!strokes.length) return;
    strokes.length = 0;
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
