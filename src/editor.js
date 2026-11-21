import { createStage } from './stage.js';
import { DEFAULTS, encodeDesign, loadDesignFromLocation, slugify } from './design.js';
import { drawLabel, imageHasAlpha, loadImage } from './label.js';
import { drawTemplate } from './template.js';
import { encodeInk } from './ink.js';
import { CONDITIONS } from './damage.js';
import { DISC_TYPES, discType } from './discTypes.js';
import { FRONTS, frontById, drawFront, resolveFrontId } from './fronts.js';

const $ = (s) => document.querySelector(s);
const stageEl = $('#stage');
const stage = createStage(stageEl, {
  preserveDrawingBuffer: true,
  editor: true,
  // Writing in the editor is saved into the design.
  onInkChange: (strokes) => {
    design.ink = encodeInk(strokes);
    stage.inkSynced(design.ink);
    $('#output').hidden = true;
    updateInkInfo();
  },
});

const LABEL_KEYS = ['bgStyle', 'bg1', 'bg2', 'title', 'subtitle', 'textColor', 'grain', 'front', 'knockouts', 'finish'];
const hasCustomArt = () => design.front === 'custom' && !!design.labelImage;

let design = { ...DEFAULTS };
try {
  design = await loadDesignFromLocation(); // lets you reopen any embed link in the editor
  if (design.labelRendered && !design.labelImage) {
    // Old design file: keep its finished label as the artwork.
    design.labelImage = design.labelRendered;
    design.title = design.subtitle = '';
  }
  delete design.labelRendered;
  if (design.name) $('#name').value = design.name;
  design.front = resolveFrontId(design.front);
} catch (e) {
  console.warn(e);
}

// Bind every [data-key] control to the design object.
const controls = [...document.querySelectorAll('[data-key]')];
function syncControls() {
  for (const el of controls) {
    const v = design[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  $('.bg2').style.display = design.bgStyle === 'solid' ? 'none' : '';
  $('#removeArt').hidden = !design.labelImage;
  updateArtInfo();
  for (const b of document.querySelectorAll('#discTypes button')) {
    b.setAttribute('aria-checked', String(b.dataset.type === design.discType));
  }
  for (const b of document.querySelectorAll('#fronts button')) {
    b.setAttribute('aria-checked', String(b.dataset.front === design.front));
  }
  const front = frontById(design.front);
  $('#frontAbout').textContent = front ? front.note : 'Your own printed label: colours, text and artwork.';
  $('#customPrint').hidden = !!front;
  for (const b of document.querySelectorAll('#conditions button')) {
    const c = CONDITIONS.find((x) => x.id === b.dataset.condition);
    const match = DAMAGE_KEYS.every((k) => Math.abs((design[k] || 0) - c.values[k]) < 0.005);
    b.setAttribute('aria-checked', String(match));
  }
  const type = discType(design.discType);
  $('#discAbout').textContent = type.about;
  $('#tintRow').hidden = type.id !== 'custom';
}

// Front swatches: thumbnails are rendered from the real front artwork.
const CUSTOM_DOT = 'background: linear-gradient(135deg, #ff4f6e, #6a5cff)';
for (const f of [...FRONTS, { id: 'custom', name: 'Custom print' }]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.front = f.id;
  b.setAttribute('role', 'radio');
  b.innerHTML = `<span class="dot" style="${f.id === 'custom' ? CUSTOM_DOT : ''}"></span><span class="txt">${f.name}</span>`;
  b.addEventListener('click', () => {
    design.front = f.id;
    syncControls();
    update(true);
  });
  $('#fronts').appendChild(b);
  if (f.id !== 'custom') {
    drawFront(f.id, 96).then((r) => {
      b.querySelector('.dot').style.background = `center / cover url(${r.color.toDataURL()})`;
    });
  }
}

// Condition presets
const DAMAGE_KEYS = ['wear', 'scuffs', 'dust', 'rot', 'chips'];
for (const c of CONDITIONS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.condition = c.id;
  b.setAttribute('role', 'radio');
  b.textContent = c.name;
  b.addEventListener('click', () => {
    Object.assign(design, c.values);
    syncControls();
    update(false);
  });
  $('#conditions').appendChild(b);
}
$('#reroll').addEventListener('click', () => {
  design.damageSeed = (design.damageSeed || 1) + 1;
  update(false);
});

// Disc type swatches
for (const t of DISC_TYPES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.type = t.id;
  b.setAttribute('role', 'radio');
  b.title = t.layer ? `${t.name} dye, ${t.layer.toLowerCase()} layer` : t.name;
  const dot = t.color
    ? `background: radial-gradient(circle at 35% 30%, #fff 0 8%, transparent 40%), ${t.color}`
    : 'background: conic-gradient(#f66, #fd6, #6f9, #6cf, #a7f, #f66)';
  b.innerHTML = `<span class="dot" style="${dot}"></span><span class="txt">${t.name}<small>${t.layer}</small></span>`;
  b.addEventListener('click', () => {
    design.discType = t.id;
    syncControls();
    update(false);
  });
  $('#discTypes').appendChild(b);
}

function update(labelChanged) {
  $('#output').hidden = true;
  stage.setDesign(design, { labelChanged });
}

for (const el of controls) {
  el.addEventListener('input', () => {
    const k = el.dataset.key;
    if (el.type === 'checkbox') design[k] = el.checked;
    else if (el.type === 'range') design[k] = parseFloat(el.value);
    else design[k] = el.value;
    syncControls();
    update(LABEL_KEYS.includes(k));
  });
}

// Tells you whether the uploaded artwork has transparency (and so knockouts).
async function updateArtInfo() {
  const el = $('#artInfo');
  if (!design.labelImage) {
    el.hidden = true;
    return;
  }
  const alpha = imageHasAlpha(await loadImage(design.labelImage));
  el.hidden = false;
  el.textContent = alpha
    ? design.knockouts
      ? '✓ Transparency found: those areas are mirror knockouts.'
      : 'Transparency found, but knockouts are off: the background shows through instead.'
    : 'No transparency in this image, so it has no knockouts.';
}

// Artwork upload: crop to a square and shrink so design files stay small.
// Images with transparency are kept as PNG (for knockouts); others become JPG.
$('#artwork').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const scale = Math.max(size / img.width, size / img.height);
  c.getContext('2d').drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
  URL.revokeObjectURL(url);
  const px = c.getContext('2d').getImageData(0, 0, size, size).data;
  let keepAlpha = false;
  for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 245) { keepAlpha = true; break; }
  design.labelImage = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
  e.target.value = '';
  syncControls();
  update(true);
});

$('#removeArt').addEventListener('click', () => {
  delete design.labelImage;
  syncControls();
  update(true);
});

$('#previewBg').addEventListener('input', (e) => (stageEl.style.background = e.target.value));

// ---- Export ----
const viewerBase = new URL('viewer.html', location.href);

// Long writing makes the link too long for some places to accept, so it then goes in a design file.
const MAX_LINK_DESIGN = 6000;
const inkTooLong = () => encodeDesign(design).length > MAX_LINK_DESIGN;
const needsFile = () => hasCustomArt() || inkTooLong();

function updateInkInfo() {
  const n = design.ink ? Math.round((design.ink.length * 3) / 4) : 0;
  $('#inkInfo').textContent = !design.ink
    ? 'No saved writing yet.'
    : inkTooLong()
      ? `Saved writing: ${(n / 1024).toFixed(1)} KB. That's a lot, so this design will need a design file.`
      : `Saved writing: ${(n / 1024).toFixed(1)} KB. It fits in the embed link.`;
}

$('#getLink').addEventListener('click', () => {
  const name = slugify($('#name').value);
  $('#name').value = name;
  const link = new URL(viewerBase);
  $('#fileReason').textContent = hasCustomArt()
    ? 'This design has uploaded artwork'
    : 'This design has a lot of writing';
  if (needsFile()) {
    link.searchParams.set('d', name);
    $('#fileName').textContent = `${name}.json`;
  } else {
    link.searchParams.set('c', encodeDesign(design));
  }
  $('#link').value = link.href;
  $('#openLink').href = link.href;
  $('#fileSteps').hidden = !needsFile();
  $('#output').hidden = false;
});

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#link').value);
  } catch {
    $('#link').select();
    document.execCommand('copy');
  }
  $('#copy').textContent = 'Copied!';
  setTimeout(() => ($('#copy').textContent = 'Copy link'), 1500);
});

function download(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

$('#downloadFile').addEventListener('click', async () => {
  const name = slugify($('#name').value);
  // Bake the finished label (art + text) into one image so it looks identical everywhere.
  // With knockouts the transparency is kept (PNG); otherwise a smaller JPG.
  const file = { ...design };
  if (hasCustomArt()) {
    const label = await drawLabel(design, 1024, { bake: true });
    file.labelRendered = label.knockouts ? label.color.toDataURL('image/png') : label.color.toDataURL('image/jpeg', 0.9);
  }
  delete file.labelImage;
  delete file.name;
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `${name}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#template').addEventListener('click', () => download(drawTemplate().toDataURL('image/png'), 'cd-artwork-template-1024.png'));

$('#png').addEventListener('click', () => download(stage.snapshot(), `${slugify($('#name').value)}.png`));

syncControls();
updateInkInfo();
update(true);
