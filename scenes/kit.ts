// Shared building blocks for the three.js scenes: a render loop that pauses when
// off-screen, pointer handling, and a few low-poly props (shop, house, scooter).

import * as THREE from 'three';

export const INK = '#17142B';
export const TEAL = '#0B7A75';
export const MARIGOLD = '#FFB627';
export const CHILLI = '#E23D3D';

export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  reduced: boolean;
  width: number;
  height: number;
  /** Ask for one more frame (used when motion is reduced and nothing animates). */
  poke(): void;
  dispose(): void;
};

type StageOptions = {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  shadows?: boolean;
  onResize?: (width: number, height: number) => void;
  onFrame: (dt: number, time: number) => void;
};

/** Returns null when the browser cannot create a WebGL context. */
export function createStage(o: StageOptions): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (o.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  const scene = new THREE.Scene();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage: Stage = {
    renderer,
    scene,
    camera: o.camera,
    reduced,
    width: 1,
    height: 1,
    poke: () => {
      pokes = 2;
      wake();
    },
    dispose,
  };

  const host = o.canvas.parentElement ?? o.canvas;
  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    stage.width = w;
    stage.height = h;
    renderer.setSize(w, h, false);
    if (o.camera instanceof THREE.PerspectiveCamera) {
      o.camera.aspect = w / h;
      o.camera.updateProjectionMatrix();
    }
    o.onResize?.(w, h);
    stage.poke();
  }

  let raf = 0;
  let last = 0;
  let time = 0;
  let visible = true;
  let pokes = 2;
  let dead = false;

  function frame(t: number) {
    raf = 0;
    if (dead) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    time += dt;
    o.onFrame(reduced ? 0 : dt, time);
    renderer.render(scene, o.camera);
    if (pokes > 0) pokes--;
    wake();
  }

  function wake() {
    if (raf || dead || !visible || document.hidden) return;
    if (reduced && pokes <= 0) return;
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    last = 0;
    wake();
  });
  io.observe(o.canvas);
  const onVisibility = () => {
    last = 0;
    wake();
  };
  document.addEventListener('visibilitychange', onVisibility);

  function dispose() {
    dead = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const list = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of list) {
        const map = (mat as THREE.MeshStandardMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
    renderer.dispose();
  }

  resize();
  wake();
  return stage;
}

type PointerOptions = {
  onDrag?: (dx: number, dy: number) => void;
  onHover?: (x: number, y: number, inside: boolean) => void;
  onTap?: (x: number, y: number) => void;
  onDragState?: (dragging: boolean) => void;
};

/** Mouse and touch on a canvas. Coordinates are in normalised device space (-1 to 1). */
export function pointer(canvas: HTMLCanvasElement, o: PointerOptions) {
  let down = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  const ndc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)] as const;
  };

  const onDown = (e: PointerEvent) => {
    down = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    o.onDragState?.(true);
  };
  const onMove = (e: PointerEvent) => {
    const [x, y] = ndc(e);
    if (down) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      o.onDrag?.(dx, dy);
    }
    o.onHover?.(x, y, true);
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    down = false;
    o.onDragState?.(false);
    if (moved < 6) {
      const [x, y] = ndc(e);
      o.onTap?.(x, y);
    }
  };
  const onLeave = () => o.onHover?.(0, 0, false);

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
  };
}

export function flat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...extra });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A small shopfront, about 1 unit wide, standing on y = 0 and facing +z. */
export function makeShop(color: string, wall = '#FFFDF7') {
  const g = new THREE.Group();
  const walls = flat(wall);
  const accent = flat(color);
  g.add(mesh(new THREE.BoxGeometry(1, 0.62, 0.8), walls, 0, 0.31, 0));
  g.add(mesh(new THREE.BoxGeometry(1.08, 0.2, 0.88), accent, 0, 0.72, 0)); // signboard band
  const awning = mesh(new THREE.BoxGeometry(1.04, 0.05, 0.42), accent, 0, 0.5, 0.52);
  awning.rotation.x = 0.42;
  g.add(awning);
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.4, 0.04), flat('#2A3550'), -0.22, 0.2, 0.41)); // door
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.24, 0.04), flat('#BFE4F2'), 0.22, 0.3, 0.41)); // window
  return g;
}

/** A small house with a pitched roof. */
export function makeHouse(roof: string, wall = '#FFFDF7') {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.55, 0.8), flat(wall), 0, 0.275, 0));
  const top = mesh(new THREE.ConeGeometry(0.74, 0.46, 4), flat(roof), 0, 0.78, 0);
  top.rotation.y = Math.PI / 4;
  g.add(top);
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.34, 0.04), flat('#2A3550'), 0, 0.17, 0.41));
  return g;
}

export function makeTree(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 5), flat('#8A5A2B'), 0, 0.15, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.3, 0), flat('#4FA65B'), 0, 0.5, 0));
  g.scale.setScalar(scale);
  return g;
}

/** Delivery scooter with rider, about 1 unit long, facing +z. */
export function makeScooter(body = CHILLI) {
  const g = new THREE.Group();
  const dark = flat('#23263A');
  const wheelGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10);
  for (const z of [0.36, -0.36]) {
    const w = mesh(wheelGeo, dark, 0, 0.14, z);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.62), flat(body), 0, 0.24, -0.02)); // deck
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.3), flat(body), 0, 0.42, -0.26)); // seat block
  const stem = mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), flat(body), 0, 0.46, 0.34);
  stem.rotation.x = -0.25;
  g.add(stem);
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.06), dark, 0, 0.72, 0.28)); // handlebar
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.32, 0.3), flat(MARIGOLD), 0, 0.74, -0.42)); // delivery box
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.36, 0.2), flat('#2F62C9'), 0, 0.78, -0.12)); // rider body
  g.add(mesh(new THREE.IcosahedronGeometry(0.12, 1), flat('#FFFDF7'), 0, 1.08, -0.1)); // helmet
  return g;
}

/** Soft round shadow to sit under an object when real shadow maps are not worth it. */
export function blobShadow(radius: number, opacity = 0.28) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(23,20,43,${opacity})`);
  grad.addColorStop(1, 'rgba(23,20,43,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** A round badge with an emoji that always faces the camera. */
export function emojiSprite(emoji: string, ring: string, size = 1) {
  const s = 160;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${s * 0.5}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, s / 2, s / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.setScalar(size);
  sprite.renderOrder = 10;
  return sprite;
}

export function sun(scene: THREE.Scene, reach: number, sky = '#FFFFFF', ground = '#9FB7C9') {
  scene.add(new THREE.HemisphereLight(sky, ground, 1.6));
  const d = new THREE.DirectionalLight('#FFFFFF', 1.5);
  d.position.set(reach * 0.7, reach * 1.4, reach * 0.5);
  d.castShadow = true;
  d.shadow.mapSize.set(1024, 1024);
  d.shadow.camera.left = -reach;
  d.shadow.camera.right = reach;
  d.shadow.camera.top = reach;
  d.shadow.camera.bottom = -reach;
  d.shadow.camera.near = 0.1;
  d.shadow.camera.far = reach * 4;
  d.shadow.bias = -0.0015;
  scene.add(d);
  return d;
}

/** Small seeded random generator so a scene looks the same on every visit. */
export function seeded(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
