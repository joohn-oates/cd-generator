// Blank CD-R "fronts" styled after classic brands.
//
// Each front is drawn into two canvases:
//   color    – what you see
//   material – what each spot is made of, packed for three.js:
//              green = roughness, blue = metalness
// Three surface kinds:
//   face   – the printed metallic lacquer (satin metal; faint rainbow sheen)
//   ink    – opaque printed ink (not metallic)
//   mirror – knocked-out areas showing the bare reflective layer (full rainbow)
//
// Brand names are set in similar typefaces; logo marks are deliberately not reproduced.

const FONT_FILES = [
  ['Archivo Black', 'archivo-black-latin-400-normal.woff2', '400', 'normal'],
  ['Inter', 'inter-latin-300-normal.woff2', '300', 'normal'],
  ['Inter', 'inter-latin-400-normal.woff2', '400', 'normal'],
  ['Inter', 'inter-latin-700-normal.woff2', '700', 'normal'],
  ['Inter', 'inter-latin-800-normal.woff2', '800', 'normal'],
  ['Playfair Display', 'playfair-display-latin-400-normal.woff2', '400', 'normal'],
  ['Playfair Display', 'playfair-display-latin-700-normal.woff2', '700', 'normal'],
  ['Playfair Display', 'playfair-display-latin-700-italic.woff2', '700', 'italic'],
];

let fontsReady = null;
export function loadFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all(
      FONT_FILES.map(async ([family, file, weight, style]) => {
        const url = new URL(`../fonts/${file}`, import.meta.url);
        const face = new FontFace(family, `url(${url})`, { weight, style });
        document.fonts.add(await face.load());
      })
    ).catch((e) => console.warn('Font loading failed, using fallbacks', e));
  }
  return fontsReady;
}

const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
const HEAVY = '"Archivo Black", "Arial Black", sans-serif';
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';

// Drawing helper: every call paints both canvases. Coordinates are in disc units
// (centre = 0,0; radius = 1; y down).
function painter(size, face) {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const color = mk();
  const material = mk();
  const cc = color.getContext('2d');
  const mc = material.getContext('2d');
  const S = size / 2;
  const X = (v) => S + v * S;
  const U = (v) => v * S;

  const kinds = {
    face: { rough: face.rough, metal: face.metal },
    ink: { rough: 0.5, metal: 0 },
    mirror: { rough: 0.04, metal: 1 },
  };
  let current = 'face';

  const both = (fn) => {
    fn(cc);
    fn(mc);
  };

  const p = {
    kind(kind, colour) {
      current = kind;
      const k = kinds[kind];
      const m = `rgb(0, ${Math.round(k.rough * 255)}, ${Math.round(k.metal * 255)})`;
      cc.fillStyle = cc.strokeStyle = colour;
      mc.fillStyle = mc.strokeStyle = m;
      return p;
    },
    face(colour = face.color) {
      return p.kind('face', colour);
    },
    ink(colour) {
      return p.kind('ink', colour);
    },
    mirror(colour = '#e9edf1') {
      return p.kind('mirror', colour);
    },
    fillAll() {
      both((c) => c.fillRect(0, 0, size, size));
      return p;
    },
    ring(r1, r2) {
      both((c) => {
        c.beginPath();
        c.arc(S, S, U(r2), 0, Math.PI * 2);
        c.arc(S, S, U(r1), 0, Math.PI * 2, true);
        c.fill();
      });
      return p;
    },
    // font: [weight/style string, size in disc units, family]
    text(str, x, y, [style, px, family], align = 'left', spacing = 0) {
      both((c) => {
        c.font = `${style} ${U(px)}px ${family}`;
        c.textAlign = align;
        c.textBaseline = 'alphabetic';
        if ('letterSpacing' in c) c.letterSpacing = `${U(spacing)}px`;
        c.fillText(str, X(x), X(y));
        if ('letterSpacing' in c) c.letterSpacing = '0px';
      });
      return p;
    },
    width(str, [style, px, family], spacing = 0) {
      cc.font = `${style} ${U(px)}px ${family}`;
      if ('letterSpacing' in cc) cc.letterSpacing = `${U(spacing)}px`;
      const w = cc.measureText(str).width / S;
      if ('letterSpacing' in cc) cc.letterSpacing = '0px';
      return w;
    },
    rect(x, y, w, h, r = 0, stroke = 0) {
      both((c) => {
        c.beginPath();
        c.roundRect(X(x), X(y), U(w), U(h), U(r));
        if (stroke) {
          c.lineWidth = U(stroke);
          c.stroke();
        } else c.fill();
      });
      return p;
    },
    line(points, width) {
      both((c) => {
        c.beginPath();
        points.forEach(([x, y], i) => (i ? c.lineTo(X(x), X(y)) : c.moveTo(X(x), X(y))));
        c.lineWidth = U(width);
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.stroke();
      });
      return p;
    },
    path(build, width) {
      both((c) => {
        c.beginPath();
        build(c, X);
        c.lineWidth = U(width);
        c.stroke();
      });
      return p;
    },
    // Write-on line across the disc at height y, inset from the rim by `inset`.
    writeLine(y, inset, width = 0.006, shift = 0) {
      const half = Math.sqrt(Math.max(0, 0.97 * 0.97 - y * y)) - inset;
      return p.line([[-half + shift, y], [half + shift, y]], width);
    },
    // Small four-point sparkle
    // Text slanted like an italic logo (skew < 0 leans right)
    slanted(str, x, y, [style, px, family], align = 'left', skew = -0.22) {
      both((c) => {
        c.save();
        c.translate(X(x), X(y));
        c.transform(1, 0, skew, 1, 0, 0);
        c.font = `${style} ${U(px)}px ${family}`;
        c.textAlign = align;
        c.textBaseline = 'alphabetic';
        c.fillText(str, 0, 0);
        c.restore();
      });
      return p;
    },
    // Text curving around the disc, letters standing outward, centred on `centre` (radians;
    // -π/2 = top), reading clockwise.
    arcText(str, radius, centre, [style, px, family], spacing = 0) {
      both((c) => {
        c.font = `${style} ${U(px)}px ${family}`;
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
        const R = U(radius);
        const gap = U(spacing);
        const chars = [...str];
        const widths = chars.map((ch) => c.measureText(ch).width);
        const total = widths.reduce((a, w) => a + w + gap, -gap);
        let along = 0;
        chars.forEach((ch, i) => {
          const a = centre - total / (2 * R) + (along + widths[i] / 2) / R;
          c.save();
          c.translate(S + Math.cos(a) * R, S + Math.sin(a) * R);
          c.rotate(a + Math.PI / 2);
          c.fillText(ch, 0, 0);
          c.restore();
          along += widths[i] + gap;
        });
      });
      return p;
    },
    sparkle(x, y, r) {
      both((c) => {
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const rr = i % 2 ? r * 0.28 : r;
          c.lineTo(X(x + Math.cos(a) * rr), X(y + Math.sin(a) * rr));
        }
        c.closePath();
        c.fill();
      });
      return p;
    },
    done() {
      return { color, material };
    },
  };
  return p;
}

// Shared base: lacquered face, mirror band around the hub, dye edge at the rim.
function base(size, face) {
  const p = painter(size, face);
  p.face().fillAll();
  p.mirror(face.hubBand || '#9ea5ab').ring(0.355, 0.405);
  p.mirror(face.rim || '#b9c4c2').ring(0.968, 1.0);
  return p;
}

// ---------------------------------------------------------------------------
// Image fronts: designed elsewhere (e.g. Figma, using the artwork template) and
// exported as a square PNG with transparency into the /fronts folder.
//
// mode 'print'    – transparent = bare mirror; your shapes are printed ink on top
// mode 'knockout' – the face is solid lacquer; your shapes are knocked out to mirror
// ---------------------------------------------------------------------------

const imageCache = new Map();
function loadFrontImage(file) {
  if (!imageCache.has(file)) {
    imageCache.set(
      file,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load front image ${file}`));
        img.src = new URL(`../fronts/${file}`, import.meta.url).href;
      })
    );
  }
  return imageCache.get(file);
}

const MATERIAL = (k) => `rgb(0, ${Math.round(k.rough * 255)}, ${Math.round(k.metal * 255)})`;
const MIRROR_KIND = { rough: 0.04, metal: 1 };

// Draws `img` onto `target`; with `fill`, the image's shapes are recoloured to that fill.
function overlay(target, img, fill) {
  const size = target.width;
  if (!fill) {
    target.getContext('2d').drawImage(img, 0, 0, size, size);
    return;
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = size;
  const t = tmp.getContext('2d');
  t.drawImage(img, 0, 0, size, size);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = fill;
  t.fillRect(0, 0, size, size);
  target.getContext('2d').drawImage(tmp, 0, 0);
}

function imageFront({ id, name, note, file, mode = 'print', face, ink = { rough: 0.5, metal: 0 }, mirror = '#e9edf1' }) {
  return {
    id,
    name,
    note,
    async draw(size) {
      const img = await loadFrontImage(file);
      // Full-size renders use the image's own resolution (up to 2048) so text stays crisp.
      const S = size >= 1024 ? Math.min(2048, Math.max(size, img.width)) : size;
      let p;
      if (mode === 'print') {
        p = painter(S, face);
        p.mirror(mirror).fillAll();
        p.mirror(face.hubBand || '#9ea5ab').ring(0.355, 0.405);
      } else {
        p = base(S, face);
      }
      const { color, material } = p.done();
      if (mode === 'print') {
        overlay(color, img, null);
        overlay(material, img, MATERIAL(ink));
      } else {
        overlay(color, img, mirror);
        overlay(material, img, MATERIAL(MIRROR_KIND));
      }
      return { color, material };
    },
  };
}

export const FRONTS = [
  {
    id: 'tdk',
    name: 'TDK',
    note: 'Pale blue-silver with grey and blue print',
    draw(size) {
      const p = base(size, { color: '#a3bddb', metal: 0.6, rough: 0.3, hubBand: '#7e868d', rim: '#b4c8c2' });
      p.ink('#7c858e').text('TDK', -0.43, 0.02, ['400', 0.17, HEAVY], 'right', 0.004);
      p.ink('#8f979e').text('Life on Record', -0.43, 0.12, ['400', 0.052, SANS], 'right');
      p.ink('#4f8ad6').text('CD-R', 0.45, 0.0, ['300', 0.14, SANS]);
      p.ink('#4f8ad6').text('RECORDABLE | AUDIO', 0.455, 0.085, ['700', 0.045, SANS]);
      p.ink('#6596d6').text('80MIN | 700MB', 0.455, 0.155, ['400', 0.045, SANS]);
      return p.done();
    },
  },
  {
    id: 'maxell',
    name: 'Maxell',
    note: 'Gunmetal with knocked-out holographic lettering',
    draw(size) {
      const p = base(size, { color: '#8d969d', metal: 0.72, rough: 0.3, hubBand: '#7a838a', rim: '#c9d0d4' });
      const big = ['400', 0.3, HEAVY];
      const w = p.width('maxell', big, -0.004);
      const fit = Math.min(1, 1.28 / w);
      p.mirror().text('maxell', 0, -0.5, ['400', 0.3 * fit, HEAVY], 'center', -0.004);
      p.mirror().text('CD-R', -0.66, -0.0, ['400', 0.13, HEAVY], 'center');
      p.mirror().rect(-0.9, 0.05, 0.27, 0.15, 0.025);
      p.face('#7d868d').text('700MB', -0.765, 0.115, ['800', 0.05, SANS], 'center');
      p.face('#7d868d').text('80 MIN', -0.765, 0.175, ['800', 0.04, SANS], 'center');
      p.mirror().rect(-0.6, 0.05, 0.19, 0.15, 0.025);
      p.face('#7d868d').text('UP TO', -0.505, 0.1, ['700', 0.028, SANS], 'center');
      p.face('#7d868d').text('52X', -0.505, 0.17, ['800', 0.06, SANS], 'center');
      p.mirror().text('COMPACT', 0.67, -0.07, ['700', 0.03, SANS], 'center', 0.006);
      p.mirror().text('CD', 0.67, 0.03, ['400', 0.11, HEAVY], 'center');
      p.mirror().rect(0.5, 0.055, 0.34, 0.06, 0.012);
      p.face('#7d868d').text('Recordable', 0.67, 0.1, ['700', 0.042, SANS], 'center');
      p.mirror('#c5ccd1').writeLine(0.5, 0.16, 0.005, 0.05);
      p.mirror('#c5ccd1').writeLine(0.63, 0.2, 0.005, -0.03);
      p.mirror('#c5ccd1').writeLine(0.76, 0.18, 0.005, 0.04);
      return p.done();
    },
  },
  {
    id: 'imation',
    name: 'Imation',
    note: 'Bright silver with black print',
    draw(size) {
      const p = base(size, { color: '#c8c8cb', metal: 0.68, rough: 0.22, hubBand: '#8e9196', rim: '#c2c6c4' });
      p.ink('#161616').text('imation', -0.45, 0.03, ['400', 0.1, SANS], 'right', -0.002);
      const w = p.width('imation', ['400', 0.1, SANS], -0.002);
      const sx = -0.45 - w - 0.05;
      p.ink('#161616').sparkle(sx, -0.005, 0.03).sparkle(sx - 0.05, -0.055, 0.018).sparkle(sx + 0.01, -0.08, 0.013);
      p.ink('#161616').text('CD-R', 0.45, -0.005, ['800', 0.075, SANS]);
      const cw = p.width('CD-R', ['800', 0.075, SANS]);
      p.ink('#161616').text('| 1x-52x', 0.45 + cw + 0.02, -0.005, ['400', 0.07, SANS]);
      p.ink('#161616').text('700MB, 80 min', 0.45, 0.085, ['400', 0.055, SANS]);
      return p.done();
    },
  },
  {
    id: 'verbatim',
    name: 'Verbatim',
    note: 'Satin grey with serif wordmark and info boxes',
    draw(size) {
      const p = base(size, { color: '#a6a8aa', metal: 0.7, rough: 0.28, hubBand: '#7d8185', rim: '#bfc4c6' });
      p.ink('#77797b').text('Verbatim', 0.06, -0.62, ['400', 0.2, SERIF], 'center');
      // Raised step line arching over the hub
      p.mirror('#d4d8db').path((c, X) => {
        c.moveTo(X(-0.96), X(-0.36));
        c.lineTo(X(-0.42), X(-0.36));
        c.quadraticCurveTo(X(-0.36), X(-0.36), X(-0.3), X(-0.44));
        c.lineTo(X(0.3), X(-0.44));
        c.quadraticCurveTo(X(0.36), X(-0.36), X(0.42), X(-0.36));
        c.lineTo(X(0.96), X(-0.36));
      }, 0.007);
      p.ink('#161616').text('CD-R', -0.64, 0.01, ['700', 0.1, SANS], 'center');
      const boxes = [['700', 'MB'], ['52x', 'speed'], ['80', 'min']];
      boxes.forEach(([big, small], i) => {
        const y = -0.24 + i * 0.165;
        p.ink('#5f5a52').rect(0.47, y, 0.36, 0.13, 0.02, 0.007);
        p.ink('#6d6152').text(big, 0.6, y + 0.095, ['700', 0.075, SANS], 'center');
        p.ink('#6d6152').text(small, 0.735, y + 0.09, ['400', 0.04, SANS], 'center');
      });
      p.mirror('#cdd1d4').writeLine(0.45, 0.06, 0.005);
      p.mirror('#cdd1d4').writeLine(0.57, 0.08, 0.005);
      p.mirror('#cdd1d4').writeLine(0.69, 0.12, 0.005);
      p.mirror('#cdd1d4').writeLine(0.81, 0.16, 0.005);
      return p.done();
    },
  },
  {
    id: 'sony',
    name: 'Sony',
    note: 'Champagne gold with dark serif print',
    draw(size) {
      const p = base(size, { color: '#dcbd96', metal: 0.62, rough: 0.24, hubBand: '#2b2a2a', rim: '#9fb8a8' });
      p.ink('#2b2a2a').ring(0.355, 0.405);
      p.ink('#2a2420').text('SONY', -0.66, -0.1, ['700', 0.08, SERIF], 'center', 0.012);
      p.ink('#3a302a').text('CD-R', -0.67, 0.07, ['italic 700', 0.14, SERIF], 'center');
      p.ink('#2a2420').text('700', 0.58, 0.12, ['700', 0.16, SERIF], 'center');
      p.ink('#2a2420').text('MB', 0.79, 0.12, ['700', 0.075, SERIF], 'center');
      p.ink('#3a3836').text('SUPREMAS', 0.75, -0.13, ['700', 0.034, SANS], 'center', 0.004);
      for (let i = 0; i < 3; i++) p.ink('#3a3836').line([[0.6, -0.1 + i * 0.022], [0.9, -0.1 + i * 0.022]], 0.006);
      return p.done();
    },
  },
  {
    id: 'memorex',
    name: 'Memorex',
    note: 'Champagne gold with a grid of holographic squares',
    draw(size) {
      const p = base(size, { color: '#ecdc9c', metal: 0.58, rough: 0.26, hubBand: '#f1e8c4', rim: '#cfd6cf' });
      // Grid of small squares: mostly holographic knockouts, some printed in muted colours
      const inks = ['#c79aa3', '#93b894', '#8fa6c8', '#a7a39a', '#c4ad72'];
      const hash = (i, j) => {
        let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      };
      const step = 0.088;
      const sq = 0.024;
      const keepOut = (x, y) => {
        const r = Math.hypot(x, y);
        if (r < 0.44 || r > 0.9) return true;
        if (x < -0.4 && y > -0.1 && y < 0.08) return true; // wordmark
        if (x > 0.44 && y > -0.08 && y < 0.1) return true; // CD-R
        if (y < -0.62 && r > 0.72) return true; // edge text
        return false;
      };
      for (let i = -11; i <= 11; i++) {
        for (let j = -11; j <= 11; j++) {
          const x = i * step;
          const y = j * step;
          if (keepOut(x, y)) continue;
          const h = hash(i + 50, j + 50);
          if (h < 0.08) continue; // a few gaps, like the real print
          if (h < 0.72) p.mirror('#eef1f2');
          else p.ink(inks[Math.floor(hash(j + 9, i + 3) * inks.length)]);
          p.rect(x - sq / 2, y - sq / 2, sq, sq);
        }
      }
      // Thin wavy lines sweeping around the top and bottom
      for (const sign of [-1, 1]) {
        p.ink('#7b7563').path((c, X) => {
          for (let k = 0; k <= 80; k++) {
            const t = k / 80;
            const a = sign * (Math.PI / 2) + (t - 0.5) * Math.PI * 0.7;
            const r = 0.8 + 0.035 * Math.sin(t * Math.PI * 3) - 0.04 * Math.sin(t * Math.PI);
            const px = X(Math.cos(a) * r);
            const py = X(Math.sin(a) * r);
            k ? c.lineTo(px, py) : c.moveTo(px, py);
          }
        }, 0.0045);
      }
      p.ink('#f7f4e8').arcText('recordable ■ 52X ■ 700MB ■ 80min', 0.86, -Math.PI / 2, ['400', 0.05, SANS], 0.002);
      p.ink('#3b4140').slanted('Memorex', -0.455, 0.035, ['400', 0.092, HEAVY], 'right', -0.24);
      p.mirror().slanted('CD', 0.49, 0.045, ['400', 0.11, HEAVY], 'left', -0.12);
      const cdW = p.width('CD', ['400', 0.11, HEAVY]);
      p.ink('#2e55c8').slanted('-R', 0.49 + cdW + 0.005, 0.045, ['400', 0.11, HEAVY], 'left', -0.12);
      return p.done();
    },
  },
  imageFront({
    id: 'oatey',
    name: 'Oatey',
    note: 'Red-tinted satin metal with mirror knockout lettering',
    file: 'oatey_cd.png',
    mode: 'knockout',
    // Same satin metal lacquer as the Verbatim-style front, tinted red
    face: { color: '#c0392b', metal: 0.7, rough: 0.28, hubBand: '#7e6f6f', rim: '#c4bfc0' },
  }),
];

// Retired front ids that should keep working in existing links.
const ALIASES = { 'oatey-knockout': 'oatey' };
export function resolveFrontId(id) {
  return ALIASES[id] || id;
}

export function frontById(id) {
  id = resolveFrontId(id);
  return FRONTS.find((f) => f.id === id) || null;
}

export async function drawFront(id, size = 1024) {
  const front = frontById(id);
  if (!front) return null;
  await loadFonts();
  return await front.draw(size);
}
