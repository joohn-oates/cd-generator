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
];

export function frontById(id) {
  return FRONTS.find((f) => f.id === id) || null;
}

export async function drawFront(id, size = 1024) {
  const front = frontById(id);
  if (!front) return null;
  await loadFonts();
  return front.draw(size);
}
