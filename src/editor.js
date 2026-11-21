import { createStage } from './stage.js';
import { DEFAULTS, encodeDesign, loadDesignFromLocation, slugify } from './design.js';
import { drawLabel } from './label.js';

const $ = (s) => document.querySelector(s);
const stageEl = $('#stage');
const stage = createStage(stageEl, { preserveDrawingBuffer: true });

const LABEL_KEYS = ['bgStyle', 'bg1', 'bg2', 'title', 'subtitle', 'textColor'];

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

// Artwork upload: crop to a square and shrink so design files stay small.
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
  design.labelImage = c.toDataURL('image/jpeg', 0.88);
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

$('#getLink').addEventListener('click', () => {
  const name = slugify($('#name').value);
  $('#name').value = name;
  const link = new URL(viewerBase);
  if (design.labelImage) {
    link.searchParams.set('d', name);
    $('#fileName').textContent = `${name}.json`;
  } else {
    link.searchParams.set('c', encodeDesign(design));
  }
  $('#link').value = link.href;
  $('#openLink').href = link.href;
  $('#fileSteps').hidden = !design.labelImage;
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
  const label = await drawLabel(design, 1024);
  const file = { ...design, labelRendered: label.toDataURL('image/jpeg', 0.9) };
  delete file.labelImage;
  delete file.name;
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `${name}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#png').addEventListener('click', () => download(stage.snapshot(), `${slugify($('#name').value)}.png`));

syncControls();
update(true);
