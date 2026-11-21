import * as THREE from 'three';
import { applyGrain, labelSurfaceMap } from './textures.js';
import { makeDamage } from './damage.js';
import { drawHubText, SPAN as HUB_TEXT_SPAN } from './hubText.js';
import { discType } from './discTypes.js';

// Real CD proportions (120 mm disc), scaled so the radius is 1.
const R = 1;
const HOLE = 0.125;      // 15 mm centre hole
const PRINT_IN = 0.36;   // where the printed label / mirror area starts
const PRINT_OUT = 0.985;
const T = 0.02;          // 1.2 mm thick

// A flat ring whose UVs span the whole disc, so one square label image lines up across rings.
function ring(inner, outer, segments = 192) {
  const g = new THREE.RingGeometry(inner, outer, segments, 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / (2 * R) + 0.5, pos.getY(i) / (2 * R) + 0.5);
  }
  return g;
}

// The clear centre hub as a solid with real relief (the cross-section is spun around the
// axis): a bevel at the hole, a small ridge, the raised stacking ring and a fine ridge where
// the label starts. Each curved ridge catches the light as a thin arc, as on a real disc.
function hubGeometry() {
  const half = T / 2;
  const out = PRINT_IN + 0.006;
  const pts = [];
  const add = (r, z) => pts.push(new THREE.Vector2(r, z));
  // Smooth rounded ridge between r0 and r1, `h` high, on the side `s` (+1 top, -1 bottom)
  const ridge = (r0, r1, h, s, n = 10) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      add(r0 + (r1 - r0) * t, s * (half + h * Math.sin(Math.PI * t) ** 1.5));
    }
  };
  const surface = (s) => {
    const seq = [
      () => { add(HOLE + 0.002, s * (half - 0.0012)); add(HOLE + 0.007, s * half); }, // hole bevel
      () => ridge(0.19, 0.215, 0.0016, s),
      () => ridge(0.275, 0.335, s > 0 ? 0.003 : 0.0042, s, 16), // stacking ring (taller underneath)
      () => ridge(0.35, 0.36, 0.0009, s, 6),
      () => add(out, s * half),
    ];
    if (s > 0) seq.forEach((f) => f());
    else {
      // same features, walked inward
      const tmp = [];
      const keep = pts.length;
      seq.forEach((f) => f());
      tmp.push(...pts.splice(keep));
      pts.push(...tmp.reverse());
    }
  };
  add(HOLE, half - 0.004);
  surface(1);
  surface(-1);
  add(HOLE, -half + 0.004);
  add(HOLE, half - 0.004); // close the loop up the hole wall
  const g = new THREE.LatheGeometry(pts, 160);
  g.rotateX(Math.PI / 2); // lathe axis (y) becomes the disc axis (z)
  return g;
}

function tube(radius) {
  const g = new THREE.CylinderGeometry(radius, radius, T, 192, 1, true);
  g.rotateX(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Diffraction: a CD's data side is a grating of circular grooves ~1.6 µm apart.
// Light from each source splits into a spectrum along the radius wherever the
// grooves line up with the light and the viewer, giving the moving rainbow streaks.
// ---------------------------------------------------------------------------

// Virtual "room lights" (world space, xyz + brightness). Each one makes its own streak.
const LIGHTS = [
  new THREE.Vector4(-2.6, 1.8, 2.4, 1.0),
  new THREE.Vector4(2.8, 0.6, 2.2, 0.9),
  new THREE.Vector4(0.8, -2.8, 2.0, 0.7),
  new THREE.Vector4(1.6, 2.9, 3.0, 0.6),
  new THREE.Vector4(-1.8, -1.6, 3.4, 0.5),
];

// ---------------------------------------------------------------------------
// Damage (see damage.js): holes/chips are cut out of every part of the disc;
// scratches glint, scuffs haze and stains cloud the shiny and printed surfaces.
// ---------------------------------------------------------------------------
const DAMAGE_VERT_HEAD = `
uniform float uFlipX;
varying vec2 vDiscUv;
varying vec3 vAxisU;
varying vec3 vAxisV;`;
const DAMAGE_VERT = `
vDiscUv = vec2(uFlipX * position.x, position.y) * 0.5 + 0.5;
vAxisU = (modelViewMatrix * vec4(uFlipX, 0.0, 0.0, 0.0)).xyz;
vAxisV = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;`;
const DAMAGE_FRAG_HEAD = `
uniform sampler2D uDamageSurf;
uniform sampler2D uDamageBody;
uniform float uDamageSide;
uniform float uScratchGain;
varying vec2 vDiscUv;
varying vec3 vAxisU;
varying vec3 vAxisV;`;
const DAMAGE_CUT = `
if (texture2D(uDamageBody, vDiscUv).r < 0.5) discard;`;

function injectDamageVertex(shader, flipX) {
  shader.uniforms.uFlipX = { value: flipX ? -1 : 1 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>' + DAMAGE_VERT_HEAD)
    .replace('#include <project_vertex>', '#include <project_vertex>' + DAMAGE_VERT);
}

// Plastic parts, the ink layer etc.: only holes and chips.
function addCutout(material, damage, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, damage);
    injectDamageVertex(shader, false);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + DAMAGE_FRAG_HEAD)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + DAMAGE_CUT);
  };
  material.customProgramCacheKey = () => 'cd-cutout-' + key;
}

// metalWeighted: rainbow strength follows the metalness map (used on brand fronts, where
// knocked-out mirror areas diffract strongly, the lacquer faintly and ink not at all).
function addDiffraction(material, uniforms, { metalWeighted = false, flipX = false, damage } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, damage);
    injectDamageVertex(shader, flipX);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRadialView;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvRadialView = (modelViewMatrix * vec4(position.xy, 0.0, 0.0)).xyz;'
      );

    let frag = shader.fragmentShader;
    if (metalWeighted) {
      // Knocked-out mirror areas show the disc's dye colour (custom prints).
      frag = frag.replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
diffuseColor.rgb *= mix(vec3(1.0), uKnockTint, metalnessFactor * uKnockTintAmount);`
      );
    }
    shader.fragmentShader = frag
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + DAMAGE_CUT)
      .replace(
        '#include <common>',
        `#include <common>${DAMAGE_FRAG_HEAD}
varying vec3 vRadialView;
uniform vec4 uLights[${LIGHTS.length}];
uniform float uRainbow;
uniform vec3 uDye;         // dye hue: tints the rainbow streaks
uniform float uGroove;     // groove spacing in nm
uniform float uStreak;     // streak width
${metalWeighted ? 'uniform vec3 uKnockTint;\nuniform float uKnockTintAmount;' : ''}

// Wavelength (nm) -> RGB, violet to red, fading out at the ends of the visible range.
vec3 spectrum(float lam) {
  float x = (lam - 380.0) / 370.0;
  x = clamp(x, 0.0, 1.0);
  float h = 0.8 * (1.0 - x);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return pow(c, vec3(1.3));   // purer, more saturated bands
}`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 N = normal;
  vec3 P = -vViewPosition;
  vec3 V = normalize(vViewPosition);
  vec3 Tr = vRadialView - N * dot(vRadialView, N);
  float rl = length(Tr);
  if (rl > 1e-5 && uRainbow > 0.0) {
    Tr /= rl;
    vec3 Bt = normalize(cross(N, Tr));      // along the grooves
    vec3 rainbow = vec3(0.0);
    float mask = 0.0;
    for (int i = 0; i < ${LIGHTS.length}; i++) {
      vec3 Lp = (viewMatrix * vec4(uLights[i].xyz, 1.0)).xyz;
      vec3 L = normalize(Lp - P);
      if (dot(L, N) <= 0.0) continue;
      vec3 H = L + V;
      // Streak where the grooves line up with light + viewer (wedge shaped, like the real thing)
      float along = dot(Bt, H) / max(abs(dot(Tr, H)), 0.15);
      float streak = exp(-along * along / (uStreak * uStreak));
      float haze = exp(-along * along / (9.0 * uStreak * uStreak)) * 0.25;
      // Colour runs through the spectrum along the streak (diffraction order shifts with angle)
      float u = abs(dot(Tr, H));
      float lam = uGroove * u;
      float order = lam > 760.0 ? 2.0 : 1.0;
      vec3 c = spectrum(mod(lam / order, 380.0) + 380.0);
      float w = (streak + haze) * uLights[i].w * smoothstep(0.04, 0.2, u);
      rainbow += c * w;
      mask += w;
    }
    vec3 tint = rainbow / max(mask, 1e-4);
    tint *= mix(vec3(1.0), uDye, 0.5);
    float k = clamp(mask, 0.0, 1.0) * uRainbow${metalWeighted ? ' * pow(metalnessFactor, 5.0)' : ''};
    // Replace silver with saturated colour inside the streak, brighten slightly at its core
    outgoingLight = mix(outgoingLight, tint * (0.75 + 0.6 * k), k * 0.9);
  }
}
{
  // Wear and damage
  vec3 N = normal;
  vec3 P = -vViewPosition;
  vec3 V = normalize(vViewPosition);
  vec3 sf = texture2D(uDamageSurf, vDiscUv).rgb;
  vec3 bd = texture2D(uDamageBody, vDiscUv).rgb;
  outgoingLight *= 1.0 - bd.g * 0.7 * uDamageSide;                                     // grime
  outgoingLight = mix(outgoingLight, vec3(0.9, 0.87, 0.78), bd.b * 0.85 * uDamageSide);  // milky rot stain
  outgoingLight = mix(outgoingLight, vec3(0.86, 0.88, 0.9), sf.b * 0.75 * uDamageSide);  // scuff haze
  if (sf.r > 0.004) {
    // A scratch is a tiny groove: it flashes when light, groove direction and eye line up.
    float a = sf.g * PI;
    vec3 Ts = normalize(cos(a) * vAxisU - sin(a) * vAxisV);
    float g = 0.0;
    for (int i = 0; i < ${LIGHTS.length}; i++) {
      vec3 L = normalize((viewMatrix * vec4(uLights[i].xyz, 1.0)).xyz - P);
      if (dot(L, N) <= 0.0) continue;
      float x = dot(Ts, L + V);
      g += exp(-x * x / 0.012) * uLights[i].w;
    }
    outgoingLight += vec3(0.95, 0.97, 1.0) * sf.r * (0.16 + 2.6 * g) * uScratchGain;
  }
}
#include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => (metalWeighted ? 'cd-diffraction-front' : 'cd-diffraction');
}

export function createCD() {
  const group = new THREE.Group();

  // Damage maps shared by every part of the disc (start undamaged).
  const blank = (color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.fillRect(0, 0, 4, 4);
    return new THREE.CanvasTexture(c);
  };
  const damage = {
    uDamageSurf: { value: blank('#000') },
    uDamageBody: { value: blank('#f00') },
  };
  const side = (s, gain) => ({ ...damage, uDamageSide: { value: s }, uScratchGain: { value: gain } });

  // toneMapped: false keeps printed colours true (custom labels and brand fronts).
  const labelMat = new THREE.MeshPhysicalMaterial({
    roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    toneMapped: false, envMapIntensity: 0.5,
  });
  const labelDiffraction = {
    uKnockTint: { value: new THREE.Color(1, 1, 1) },
    uKnockTintAmount: { value: 0 },
    uLights: { value: LIGHTS },
    uRainbow: { value: 0 },
    uDye: { value: new THREE.Color(1, 1, 1) },
    uGroove: { value: 1600 },
    uStreak: { value: 0.085 },
  };
  addDiffraction(labelMat, labelDiffraction, { metalWeighted: true, damage: side(0.5, 0.22) });

  const diffraction = {
    uLights: { value: LIGHTS },
    uRainbow: { value: 1 },
    uDye: { value: new THREE.Color(1, 1, 1) },
    uGroove: { value: 1600 },
    uStreak: { value: 0.085 },
  };
  const dataMat = new THREE.MeshPhysicalMaterial({
    color: 0xedf2f7,
    metalness: 1,
    roughness: 0.1,
    envMapIntensity: 1,
    iridescence: 0.25,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [300, 600],
    side: THREE.DoubleSide,
  });
  addDiffraction(dataMat, diffraction, { flipX: true, damage: side(1, 1) });

  const plasticMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8eef2,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Clear polycarbonate hub: light, see-through plastic; the shader below draws the ridges.
  const clearHubMat = new THREE.MeshPhysicalMaterial({
    color: 0xe4e9ed,
    metalness: 0,
    roughness: 0.08,
    ior: 1.58,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Used when the centre hub is set to "Silver"
  const silverHubMat = new THREE.MeshPhysicalMaterial({ color: 0xcfd4d8, metalness: 1, roughness: 0.25 });
  addCutout(plasticMat, side(0, 0), 'plastic');
  // Clear ridges: sloped parts bend light (show as thin dark lines) and curved crests catch
  // the light (thin bright arcs that move as the disc turns).
  clearHubMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, side(0, 0), { uLights: { value: LIGHTS } });
    injectDamageVertex(shader, false);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAxisZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvAxisZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${DAMAGE_FRAG_HEAD}
varying vec3 vAxisZ;
uniform vec4 uLights[${LIGHTS.length}];`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + DAMAGE_CUT)
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 N = normalize(normal);
  vec3 V = normalize(vViewPosition);
  vec3 P = -vViewPosition;
  float c = abs(dot(N, vAxisZ));
  float slope = sqrt(max(1.0 - c * c, 0.0));         // 0 on flat plastic, higher on ridge sides
  float glint = 0.0;
  for (int i = 0; i < ${LIGHTS.length}; i++) {
    vec3 L = normalize((viewMatrix * vec4(uLights[i].xyz, 1.0)).xyz - P);
    glint += pow(max(dot(N, normalize(L + V)), 0.0), 140.0) * uLights[i].w;
  }
  float edge = smoothstep(0.04, 0.3, slope);
  outgoingLight = mix(outgoingLight, vec3(0.42, 0.45, 0.5), edge * 0.75); // refraction: dark ridge lines
  outgoingLight += vec3(1.0) * glint * 2.6;                               // moving bright arcs
  diffuseColor.a = clamp(diffuseColor.a + edge * 0.45 + glint * 0.7, 0.0, 0.95);
}
#include <opaque_fragment>`
      );
  };
  clearHubMat.customProgramCacheKey = () => 'cd-clear-hub';
  addCutout(silverHubMat, side(0, 0), 'silver');

  const top = T / 2 + 0.0005;
  const bottom = -T / 2 - 0.0005;

  // Top: printed label
  const label = new THREE.Mesh(ring(PRINT_IN, PRINT_OUT), labelMat);
  label.position.z = top;
  group.add(label);

  // Marker ink: a transparent layer just above the label that visitors can write on.
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = inkCanvas.height = 1024;
  const inkTexture = new THREE.CanvasTexture(inkCanvas);
  inkTexture.colorSpace = THREE.SRGBColorSpace;
  inkTexture.anisotropy = 8;
  const inkMat = new THREE.MeshPhysicalMaterial({
    map: inkTexture,
    transparent: true,
    opacity: 1,
    roughness: 0.38,       // permanent marker dries slightly glossy
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
    depthWrite: false,
    toneMapped: false,
    envMapIntensity: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  addCutout(inkMat, side(0, 0), 'ink');
  const ink = new THREE.Mesh(ring(PRINT_IN, PRINT_OUT), inkMat);
  ink.position.z = top + 0.0003;
  ink.renderOrder = 1;
  group.add(ink);

  // Bottom: shiny rainbow data side
  const data = new THREE.Mesh(ring(PRINT_IN, PRINT_OUT - 0.005), dataMat);
  data.rotation.y = Math.PI;
  data.position.z = bottom;
  group.add(data);

  // Clear hub with ridges, outer rim and edge
  const hub = new THREE.Mesh(hubGeometry(), clearHubMat);
  hub.renderOrder = 2;
  group.add(hub);

  // Text printed on the hub's flat band (between the small ridge and the stacking ring).
  // Double-sided: from the back you see it reversed through the clear plastic.
  const hubTextGeo = new THREE.RingGeometry(0.135, 0.278, 160, 2);
  {
    const pos = hubTextGeo.attributes.position;
    const uv = hubTextGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / (2 * HUB_TEXT_SPAN) + 0.5, pos.getY(i) / (2 * HUB_TEXT_SPAN) + 0.5);
    }
  }
  const hubTextMat = new THREE.MeshStandardMaterial({
    transparent: true,
    roughness: 0.45,
    toneMapped: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  addCutout(hubTextMat, side(0, 0), 'hubtext');
  const hubText = new THREE.Mesh(hubTextGeo, hubTextMat);
  hubText.position.z = T / 2 + 0.0003;
  hubText.renderOrder = 3;
  hubText.visible = false;
  group.add(hubText);
  let hubTextKey = null;
  for (const z of [top, bottom]) {
    const rim = new THREE.Mesh(ring(PRINT_OUT, R, 192), plasticMat);
    rim.position.z = z;
    rim.renderOrder = 2;
    group.add(rim);
  }
  const edge = new THREE.Mesh(tube(R), plasticMat);
  edge.renderOrder = 2;
  group.add(edge);

  let labelTexture = null;
  let labelMatTexture = null;
  let lastLabelSurface = null;
  let lastDamage = null;

  // How the printed side is lit: plain ink, or per-pixel materials (brand fronts / knockouts).
  let labelMapped = false;
  function applyLabelMode(design) {
    const brand = design.front && design.front !== 'custom';
    const matte = design.finish === 'matte';
    if (labelMapped) {
      // Values are multiplied by the per-pixel material map.
      labelMat.metalness = 1;
      labelMat.roughness = 1;
      labelMat.clearcoat = brand ? 0.6 : matte ? 0 : 1;
      labelMat.clearcoatRoughness = brand ? 0.12 : 0.08;
      labelMat.envMapIntensity = brand ? 0.8 : 0.7;
      labelDiffraction.uRainbow.value = design.rainbow;
      labelDiffraction.uKnockTintAmount.value = brand ? 0 : 1;
      labelMat.bumpScale = brand ? 0.12 : 0.25; // subtle on metal
    } else {
      labelMat.metalness = 0;
      labelMat.roughness = matte ? 0.85 : 0.35;
      labelMat.clearcoat = matte ? 0 : 1;
      labelMat.clearcoatRoughness = 0.08;
      labelMat.envMapIntensity = 0.5;
      labelDiffraction.uRainbow.value = 0;
      labelDiffraction.uKnockTintAmount.value = 0;
      labelMat.bumpScale = 0.35;
    }
  }

  function swap(mat, key, tex) {
    if (mat[key]) mat[key].dispose();
    mat[key] = tex;
    mat.needsUpdate = true;
  }

  return {
    object: group,
    labelMesh: label,

    // Hub ring text (async: waits for fonts)
    async setHubText(design) {
      const key = [design.hubText1, design.hubText2, design.hubTextColor, design.hubSerial].join('|');
      if (key === hubTextKey) return;
      hubTextKey = key;
      const canvas = await drawHubText(design);
      if (key !== hubTextKey) return; // a newer change arrived meanwhile
      if (hubTextMat.map) hubTextMat.map.dispose();
      if (canvas) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        hubTextMat.map = tex;
      } else hubTextMat.map = null;
      hubTextMat.needsUpdate = true;
      hubText.visible = !!canvas;
    },
    ink: { canvas: inkCanvas, texture: inkTexture },

    // `canvas` is the drawn label; grain is added here so design files stay grain-free.
    // `material` (brand fronts, or custom prints with knockouts) packs roughness (green)
    // and metalness (blue) per pixel.
    setLabel(canvas, design, maxAnisotropy = 8, material = null) {
      labelMapped = !!material;
      applyGrain(canvas, material ? design.grain * 0.5 : design.grain);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      labelMat.map = tex;
      if (labelTexture) labelTexture.dispose();
      labelTexture = tex;

      if (labelMatTexture) labelMatTexture.dispose();
      labelMatTexture = null;
      if (material) {
        labelMatTexture = new THREE.CanvasTexture(material);
        labelMatTexture.anisotropy = maxAnisotropy;
      }
      labelMat.metalnessMap = labelMat.roughnessMap = labelMatTexture;
      labelMat.needsUpdate = true;
      applyLabelMode(design);
    },

    setStyle(design) {
      // Disc type: real CD/CD-R dye + reflective layer colours, or a custom tint over silver.
      const type = discType(design.discType);
      if (type.color) dataMat.color.set(type.color);
      else dataMat.color.set(0xedf2f7).multiply(new THREE.Color(design.tint));
      const c = dataMat.color;
      diffraction.uDye.value.copy(c).multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1e-4));
      diffraction.uRainbow.value = design.rainbow;
      dataMat.iridescence = design.rainbow * 0.12;
      dataMat.roughness = 0.03 + (1 - design.shine) * 0.45;
      labelDiffraction.uKnockTint.value.copy(c);
      applyLabelMode(design);
      hub.material = design.hub === 'silver' ? silverHubMat : clearHubMat;

      if (design.texture !== lastLabelSurface) {
        lastLabelSurface = design.texture;
        swap(labelMat, 'bumpMap', design.texture > 0 ? labelSurfaceMap(design.texture, 0) : null);
      }

      const d = {
        wear: design.wear || 0,
        scuffs: design.scuffs || 0,
        dust: design.dust || 0,
        rot: design.rot || 0,
        chips: design.chips || 0,
      };
      const damageKey = JSON.stringify(d) + '|' + (design.damageSeed || 1);
      if (damageKey !== lastDamage) {
        lastDamage = damageKey;
        const none = Object.values(d).every((v) => v <= 0);
        const maps = none ? null : makeDamage(d, design.damageSeed || 1);
        const set = (u, canvas, fallback) => {
          damage[u].value.dispose();
          const tex = canvas ? new THREE.CanvasTexture(canvas) : blank(fallback);
          tex.anisotropy = 8;
          damage[u].value = tex;
        };
        set('uDamageSurf', maps && maps.surface, '#000');
        set('uDamageBody', maps && maps.body, '#f00');
      }
    },

    dispose() {
      group.traverse((o) => o.geometry && o.geometry.dispose());
      [labelMat, dataMat].forEach((m) => m.bumpMap && m.bumpMap.dispose());
      [labelMat, dataMat, plasticMat, clearHubMat, silverHubMat, inkMat, hubTextMat].forEach((m) => m.dispose());
      inkTexture.dispose();
      if (labelTexture) labelTexture.dispose();
      if (labelMatTexture) labelMatTexture.dispose();
    },
  };
}
