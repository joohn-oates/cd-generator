import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { createCD } from './cd.js';
import { drawLabel } from './label.js';
import { drawFront, frontById } from './fronts.js';

// A bright white room with a few soft light panels, like a desk by a window.
// The shiny side reflects this, so it reads as pale silver instead of dark chrome.
function studioEnvironment() {
  const env = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#eef2f6');
  g.addColorStop(0.6, '#c9d0d8');
  g.addColorStop(1, '#9aa3ad');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));

  const panel = (w, h, pos, intensity, tint = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(6, 3, new THREE.Vector3(-4, 5, 4), 4);
  panel(3, 5, new THREE.Vector3(6, 1, 3), 3, 0xf2f6ff);
  panel(8, 2, new THREE.Vector3(0, 6, -4), 2.5);
  panel(4, 4, new THREE.Vector3(-5, -1, -5), 1.5, 0xfff6ea);
  return env;
}

// Creates the 3D scene inside `container` (fills it, transparent background).
export function createStage(container, { preserveDrawingBuffer = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'pan-y';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0xb9c8ff, 1.2);
  rimLight.position.set(-3, -1, -2);
  scene.add(rimLight);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.7;

  const tiltPivot = new THREE.Group();
  const motionPivot = new THREE.Group();
  const cd = createCD();
  tiltPivot.add(motionPivot);
  motionPivot.add(cd.object);
  scene.add(tiltPivot);

  let design = null;
  let labelVersion = 0;

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the disc (diameter 2 + margin) into the smaller side.
    const fit = 1.18 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = camera.aspect < 1 ? fit / camera.aspect : fit;
    camera.position.setLength(dist);
    if (camera.position.lengthSq() === 0) camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();
  }
  camera.position.set(0, 0, 1);
  new ResizeObserver(resize).observe(container);
  resize();

  // Pause rendering when off-screen or the tab is hidden.
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(container);

  const clock = new THREE.Clock();
  let t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible || document.hidden) return;
    if (design) {
      const s = design.speed;
      t += dt * s;
      if (design.motion === 'turntable') motionPivot.rotation.y += dt * s * 0.8;
      else if (design.motion === 'spin') motionPivot.rotation.z -= dt * s * 2;
      else if (design.motion === 'float') {
        motionPivot.rotation.y = Math.sin(t * 0.9) * 0.5;
        motionPivot.rotation.x = Math.sin(t * 0.6) * 0.15;
        motionPivot.position.y = Math.sin(t * 1.2) * 0.04;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    renderer,

    async setDesign(next, { labelChanged = true } = {}) {
      const prev = design;
      design = next;
      cd.setStyle(next);
      controls.enabled = !!next.drag;
      tiltPivot.rotation.x = -THREE.MathUtils.degToRad(next.tilt);
      if (!prev || prev.motion !== next.motion) {
        motionPivot.rotation.set(0, 0, 0);
        motionPivot.position.set(0, 0, 0);
      }
      if (labelChanged) {
        const v = ++labelVersion;
        const aniso = renderer.capabilities.getMaxAnisotropy();
        if (frontById(next.front)) {
          const f = await drawFront(next.front);
          if (v === labelVersion) cd.setLabel(f.color, next, aniso, f.material);
        } else {
          const label = await drawLabel(next);
          if (v === labelVersion) cd.setLabel(label.color, next, aniso, label.material);
        }
      }
    },

    // Transparent PNG of the current view.
    snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
  };
}
