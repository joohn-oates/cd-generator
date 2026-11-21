import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { createCD } from './cd.js';
import { drawLabel } from './label.js';

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
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

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
        const canvas = await drawLabel(next);
        if (v === labelVersion) cd.setLabel(canvas, renderer.capabilities.getMaxAnisotropy());
      }
    },

    // Transparent PNG of the current view.
    snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
  };
}
