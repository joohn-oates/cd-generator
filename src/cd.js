import * as THREE from 'three';

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

// Shiny side: silver with rainbow diffraction bands and fine grooves, like light hitting a real CD.
function drawDataSide(strength, size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  ctx.fillStyle = '#d9dde2';
  ctx.fillRect(0, 0, size, size);

  if (strength > 0 && ctx.createConicGradient) {
    // Two opposite rainbow bands, the classic CD look.
    const g = ctx.createConicGradient(-Math.PI / 3, c, c);
    const silver = 'rgba(217,221,226,0)';
    const band = (from, to) => {
      g.addColorStop(from, silver);
      const hues = [280, 220, 180, 120, 60, 30, 0, 320];
      hues.forEach((h, i) => {
        const t = from + ((to - from) * (i + 1)) / (hues.length + 1);
        g.addColorStop(t, `hsla(${h}, 90%, 62%, ${strength})`);
      });
      g.addColorStop(to, silver);
    };
    band(0.0, 0.22);
    band(0.5, 0.72);
    g.addColorStop(1, silver);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Fine concentric grooves
  ctx.lineWidth = 1;
  for (let r = size * 0.18; r < c; r += 3) {
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCD() {
  const group = new THREE.Group();

  // toneMapped: false keeps label colours true to what you pick in the editor.
  const labelMat = new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, toneMapped: false, envMapIntensity: 0.75 });

  const dataMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.85,
    roughness: 0.15,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [300, 700],
    side: THREE.DoubleSide,
  });

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

  const top = T / 2 + 0.0005;
  const bottom = -T / 2 - 0.0005;

  // Top: printed label
  const label = new THREE.Mesh(ring(PRINT_IN, PRINT_OUT), labelMat);
  label.position.z = top;
  group.add(label);

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

  // Used when the centre hub is set to "Silver"
  const silverHubMat = new THREE.MeshPhysicalMaterial({ color: 0xcfd4d8, metalness: 1, roughness: 0.25 });

  let currentTexture = null;
  let dataRainbow = null;

  return {
    object: group,

    setLabel(canvas, maxAnisotropy = 8) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      labelMat.map = tex;
      labelMat.needsUpdate = true;
      if (currentTexture) currentTexture.dispose();
      currentTexture = tex;
    },

    setStyle(design) {
      dataMat.color.set(design.tint);
      dataMat.iridescence = design.rainbow * 0.6;
      if (dataRainbow !== design.rainbow) {
        dataRainbow = design.rainbow;
        if (dataMat.map) dataMat.map.dispose();
        dataMat.map = drawDataSide(design.rainbow);
        dataMat.needsUpdate = true;
      }
      dataMat.roughness = 0.02 + (1 - design.shine) * 0.5;
      labelMat.roughness = design.finish === 'matte' ? 0.85 : 0.35;
      labelMat.clearcoat = design.finish === 'matte' ? 0 : 1;
      for (const m of hubMeshes) m.material = design.hub === 'silver' ? silverHubMat : plasticMat;
    },

    dispose() {
      group.traverse((o) => o.geometry && o.geometry.dispose());
      [labelMat, dataMat, plasticMat, frostMat, silverHubMat].forEach((m) => m.dispose());
      if (currentTexture) currentTexture.dispose();
      if (dataMat.map) dataMat.map.dispose();
    },
  };
}
