import * as THREE from 'three';
import { applyGrain, labelSurfaceMap, dataSurfaceMap } from './textures.js';
import { discType } from './discTypes.js';

// Real CD proportions (120 mm disc), scaled so the radius is 1.
const R = 1;
const HOLE = 0.125;      // 15 mm centre hole
const STACK_IN = 0.29;   // raised stacking ring
const STACK_OUT = 0.32;
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

// metalWeighted: rainbow strength follows the metalness map (used on brand fronts, where
// knocked-out mirror areas diffract strongly, the lacquer faintly and ink not at all).
function addDiffraction(material, uniforms, { metalWeighted = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

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
      .replace(
        '#include <common>',
        `#include <common>
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
#include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => (metalWeighted ? 'cd-diffraction-front' : 'cd-diffraction');
}

export function createCD() {
  const group = new THREE.Group();

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
  addDiffraction(labelMat, labelDiffraction, { metalWeighted: true });

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
  addDiffraction(dataMat, diffraction);

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

  const frostMat = new THREE.MeshPhysicalMaterial({
    color: 0xdfe5ea,
    roughness: 0.6,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Used when the centre hub is set to "Silver"
  const silverHubMat = new THREE.MeshPhysicalMaterial({ color: 0xcfd4d8, metalness: 1, roughness: 0.25 });

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
    opacity: 0.94,
    roughness: 0.32,       // permanent marker dries slightly glossy
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
    depthWrite: false,
    toneMapped: false,
    envMapIntensity: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const ink = new THREE.Mesh(ring(PRINT_IN, PRINT_OUT), inkMat);
  ink.position.z = top + 0.0003;
  ink.renderOrder = 1;
  group.add(ink);

  // Bottom: shiny rainbow data side
  const data = new THREE.Mesh(ring(PRINT_IN, PRINT_OUT - 0.005), dataMat);
  data.rotation.y = Math.PI;
  data.position.z = bottom;
  group.add(data);

  // Clear plastic hub, stacking ring, outer rim and edges
  const hubMeshes = [];
  for (const z of [top, bottom]) {
    const hub = new THREE.Mesh(ring(HOLE, PRINT_IN, 128), plasticMat);
    hub.position.z = z;
    hub.renderOrder = 2;
    hubMeshes.push(hub);
    group.add(hub);

    const rim = new THREE.Mesh(ring(PRINT_OUT, R, 192), plasticMat);
    rim.position.z = z;
    rim.renderOrder = 2;
    group.add(rim);

    const stack = new THREE.Mesh(ring(STACK_IN, STACK_OUT, 128), frostMat);
    stack.position.z = z + Math.sign(z) * 0.001;
    stack.renderOrder = 3;
    group.add(stack);
  }
  for (const r of [R, HOLE]) {
    const edge = new THREE.Mesh(tube(r), plasticMat);
    edge.renderOrder = 2;
    group.add(edge);
  }

  let labelTexture = null;
  let labelMatTexture = null;
  let lastLabelSurface = null;
  let lastDataSurface = null;

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
      for (const m of hubMeshes) m.material = design.hub === 'silver' ? silverHubMat : plasticMat;

      const labelKey = `${design.texture}|${design.wear}`;
      if (labelKey !== lastLabelSurface) {
        lastLabelSurface = labelKey;
        const on = design.texture > 0 || design.wear > 0;
        swap(labelMat, 'bumpMap', on ? labelSurfaceMap(design.texture, design.wear) : null);
      }
      if (design.wear !== lastDataSurface) {
        lastDataSurface = design.wear;
        swap(dataMat, 'bumpMap', dataSurfaceMap(design.wear));
        dataMat.bumpScale = 0.12;
      }
    },

    dispose() {
      group.traverse((o) => o.geometry && o.geometry.dispose());
      [labelMat, dataMat].forEach((m) => m.bumpMap && m.bumpMap.dispose());
      [labelMat, dataMat, plasticMat, frostMat, silverHubMat, inkMat].forEach((m) => m.dispose());
      inkTexture.dispose();
      if (labelTexture) labelTexture.dispose();
      if (labelMatTexture) labelMatTexture.dispose();
    },
  };
}
