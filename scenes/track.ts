// Order tracking scene: a small low-poly neighbourhood with the shop, the customer's
// home and a delivery scooter that follows the order's real progress.

import * as THREE from 'three';
import {
  createStage, emojiSprite, flat, makeHouse, makeScooter, makeShop, makeTree, pointer, seeded, sun,
  CHILLI, MARIGOLD, TEAL,
} from './kit';

export type TrackScene = {
  /** rider: 0 to 1 is the ride to the shop, 1 to 2 the ride to the customer. */
  set(rider: number, stage: number, done: boolean): void;
  dispose(): void;
};

const PITCH = 2.4;
const BLOCK = 1.8;
const node = (i: number, j: number) => new THREE.Vector3((i - 2.5) * PITCH, 0, (j - 2.5) * PITCH);

// Routes follow the streets, in street-corner coordinates.
const TO_SHOP: [number, number][] = [[0, 4], [0, 1], [1, 1]];
const TO_HOME: [number, number][] = [[1, 1], [3, 1], [3, 3], [5, 3], [5, 4]];

type Path = { pts: THREE.Vector3[]; lens: number[]; total: number };

function makePath(corners: [number, number][]): Path {
  const pts = corners.map(([i, j]) => node(i, j));
  const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
  return { pts, lens, total: lens.reduce((a, b) => a + b, 0) };
}

function along(path: Path, t: number, out: THREE.Vector3) {
  let d = Math.min(1, Math.max(0, t)) * path.total;
  for (let i = 0; i < path.lens.length; i++) {
    if (d <= path.lens[i] || i === path.lens.length - 1) {
      const a = path.pts[i];
      const b = path.pts[i + 1];
      out.copy(a).lerp(b, Math.min(1, d / path.lens[i]));
      return Math.atan2(b.x - a.x, b.z - a.z);
    }
    d -= path.lens[i];
  }
  return 0;
}

export function createTrackScene(
  canvas: HTMLCanvasElement,
  opts: { shopEmoji: string; shopColor: string },
): TrackScene | null {
  const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 80);
  const world = new THREE.Group();
  const pathShop = makePath(TO_SHOP);
  const pathHome = makePath(TO_HOME);

  const shopPos = node(1, 1).add(new THREE.Vector3(0.62, 0, -0.62));
  const homePos = node(5, 4).add(new THREE.Vector3(-0.62, 0, 0.62));
  const reserved = new Set(['1,0', '4,4']);

  const scooter = makeScooter(CHILLI);
  scooter.scale.setScalar(0.72);
  scooter.visible = false;

  let rider = 0;
  let riderGoal = 0;
  let stageIndex = 0;
  let done = false;
  let first = true;
  let heading = 0;
  let spin = 0;
  let dragging = false;
  let burst = -1;
  const focus = new THREE.Vector3();
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const camOffset = new THREE.Vector3(9, 10.5, 9);

  const stage = createStage({
    canvas,
    camera,
    shadows: true,
    onResize: (w, h) => {
      const aspect = w / h;
      const half = aspect >= 1.15 ? 5.3 : 6.2;
      camera.top = half;
      camera.bottom = -half;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.updateProjectionMatrix();
    },
    onFrame: (dt, time) => {
      world.rotation.y += spin;
      spin *= 0.9;
      if (!dragging) world.rotation.y += (0 - world.rotation.y) * Math.min(1, dt * 0.6);

      // Scooter: ease towards the latest reported position so it glides between updates.
      rider += (riderGoal - rider) * Math.min(1, dt * 5 + (first || stage?.reduced ? 1 : 0));
      scooter.visible = stageIndex >= 3;
      if (scooter.visible) {
        const angle = rider <= 1 ? along(pathShop, rider, tmp) : along(pathHome, rider - 1, tmp);
        let diff = angle - heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        heading += diff * Math.min(1, dt * 10 + (stage?.reduced ? 1 : 0));
        scooter.position.set(tmp.x, 0.05 + (done ? 0 : Math.abs(Math.sin(time * 14)) * 0.012), tmp.z);
        scooter.rotation.y = heading;
      }
      setRibbon(doneShop, pathShop, stageIndex >= 3 ? Math.min(1, rider) : 0);
      setRibbon(doneHome, pathHome, stageIndex >= 4 ? Math.min(1, rider - 1) : 0);

      // Pulse at the shop while the order is being packed or waiting for a partner.
      const waiting = stageIndex < 3;
      pulse.visible = waiting;
      if (waiting) {
        const reach = stageIndex === 2 ? 3.4 : 1.5;
        const k = (time * (stageIndex === 2 ? 0.55 : 0.8)) % 1;
        pulse.scale.setScalar(0.4 + k * reach);
        (pulse.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.6;
      }

      shopPin.position.y = 1.75 + Math.sin(time * 2.2) * 0.06;
      homePin.position.y = 1.7 + Math.sin(time * 2.2 + 1.5) * 0.06;

      // Camera follows whatever matters right now.
      if (done) focus.copy(homePos);
      else if (stageIndex >= 3) focus.copy(scooter.position);
      else focus.copy(shopPos);
      focus.lerp(mid, 0.6);
      world.localToWorld(tmp.copy(focus));
      target.lerp(tmp, first || stage?.reduced ? 1 : Math.min(1, dt * 2.2));
      first = false;
      camera.position.copy(target).add(camOffset);
      camera.lookAt(target);

      stepConfetti(dt);
    },
  });
  if (!stage) return null;
  stage.scene.add(world);
  sun(stage.scene, 13, '#FFFFFF', '#DCE4F0');

  const mid = shopPos.clone().lerp(homePos, 0.5);

  // Ground and blocks
  const size = PITCH * 7;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), flat('#FFFFFF'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const rnd = seeded(41);
  const slabGeo = new THREE.BoxGeometry(BLOCK, 0.06, BLOCK);
  const slab = flat('#DDE5F0');
  const park = flat('#CBE7C6');
  const blockData: { x: number; z: number; h: number; w: number; d: number; c: string }[] = [];
  const tones = ['#FFFFFF', '#FFFFFF', '#EEF2F8', '#DCE5F1', '#C9D7E8', '#BFE3DF', '#FFE2A8'];
  for (let bi = -1; bi <= 5; bi++) {
    for (let bj = -1; bj <= 5; bj++) {
      const cx = (bi - 2) * PITCH;
      const cz = (bj - 2) * PITCH;
      const key = `${bi},${bj}`;
      const isPark = reserved.has(key) || rnd() < 0.12;
      const s = new THREE.Mesh(slabGeo, isPark ? park : slab);
      s.position.set(cx, 0.03, cz);
      s.receiveShadow = true;
      world.add(s);
      if (isPark) {
        const anchor = key === '1,0' ? shopPos : key === '4,4' ? homePos : null;
        for (let k = 0; k < 4; k++) {
          const t = makeTree(0.9 + rnd() * 0.5);
          t.position.set(cx + (rnd() - 0.5) * 1.3, 0.06, cz + (rnd() - 0.5) * 1.3);
          if (anchor && Math.hypot(t.position.x - anchor.x, t.position.z - anchor.z) < 0.95) continue;
          world.add(t);
        }
        continue;
      }
      const cells = rnd() < 0.5 ? 2 : 1;
      for (let a = 0; a < cells; a++) {
        for (let b = 0; b < cells; b++) {
          if (rnd() < 0.12) continue;
          const cell = BLOCK / cells;
          const edge = bi === -1 || bj === -1 || bi === 5 || bj === 5;
          blockData.push({
            x: cx - BLOCK / 2 + cell * (a + 0.5),
            z: cz - BLOCK / 2 + cell * (b + 0.5),
            w: cell * (0.62 + rnd() * 0.2),
            d: cell * (0.62 + rnd() * 0.2),
            h: (0.22 + rnd() * rnd() * 0.75) * (edge ? 0.8 : 1),
            c: tones[Math.floor(rnd() * tones.length)],
          });
        }
      }
    }
  }
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), flat('#FFFFFF'), blockData.length);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  blockData.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d);
    m4.setPosition(b.x, 0.06 + b.h / 2, b.z);
    buildings.setMatrixAt(i, m4);
    buildings.setColorAt(i, col.set(b.c));
  });
  world.add(buildings);

  // Route ribbons: the planned route underneath, the travelled part on top.
  function ribbon(path: Path, color: string, y: number, width: number) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color });
    path.pts.slice(1).forEach((b, i) => {
      const a = path.pts[i];
      const len = a.distanceTo(b);
      const geo = new THREE.BoxGeometry(width, 0.02, 1);
      geo.translate(0, 0, 0.5); // grow from the start of the segment
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(a).setY(y);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      m.scale.z = len;
      m.userData.len = len;
      group.add(m);
    });
    world.add(group);
    return group;
  }
  function setRibbon(group: THREE.Group, path: Path, t: number) {
    let d = t * path.total;
    group.children.forEach((child) => {
      const len = child.userData.len as number;
      const part = Math.min(len, Math.max(0, d));
      child.visible = part > 0.001;
      child.scale.z = Math.max(0.001, part);
      d -= len;
    });
  }
  ribbon(pathShop, '#C3CEDF', 0.02, 0.2);
  ribbon(pathHome, '#8FD0CB', 0.02, 0.2);
  const doneShop = ribbon(pathShop, MARIGOLD, 0.035, 0.2);
  const doneHome = ribbon(pathHome, TEAL, 0.035, 0.2);

  // Shop and home
  const shop = makeShop(opts.shopColor);
  shop.scale.setScalar(1.05);
  shop.position.copy(shopPos).setY(0.06);
  shop.rotation.y = 0; // faces the street on its +z side
  const home = makeHouse(CHILLI);
  home.scale.setScalar(1.1);
  home.position.copy(homePos).setY(0.06);
  home.rotation.y = Math.PI / 2; // faces the street on its +x side
  const shopPin = emojiSprite(opts.shopEmoji, opts.shopColor, 0.95);
  shopPin.position.copy(shopPos);
  const homePin = emojiSprite('🏠', CHILLI, 0.95);
  homePin.position.copy(homePos);
  world.add(shop, home, shopPin, homePin, scooter);

  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 48),
    new THREE.MeshBasicMaterial({ color: MARIGOLD, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.copy(node(1, 1)).setY(0.05);
  world.add(pulse);

  // Confetti for the moment the order is delivered.
  const bits = 70;
  const confetti = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.12, 0.07),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    bits,
  );
  confetti.visible = false;
  const colors = [MARIGOLD, CHILLI, TEAL, '#5C7CFA', '#FFFFFF'];
  const vel: THREE.Vector3[] = [];
  const pos: THREE.Vector3[] = [];
  const crnd = seeded(7);
  for (let i = 0; i < bits; i++) {
    confetti.setColorAt(i, col.set(colors[i % colors.length]));
    vel.push(new THREE.Vector3());
    pos.push(new THREE.Vector3());
  }
  world.add(confetti);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);

  function startConfetti() {
    burst = 0;
    confetti.visible = true;
    for (let i = 0; i < bits; i++) {
      pos[i].copy(homePos).setY(1.2);
      const a = crnd() * Math.PI * 2;
      const s = 0.8 + crnd() * 2.2;
      vel[i].set(Math.cos(a) * s, 3 + crnd() * 3.5, Math.sin(a) * s);
    }
  }
  function stepConfetti(dt: number) {
    if (burst < 0) return;
    burst += dt;
    for (let i = 0; i < bits; i++) {
      vel[i].y -= 9 * dt;
      pos[i].addScaledVector(vel[i], dt);
      if (pos[i].y < 0.08) {
        pos[i].y = 0.08;
        vel[i].set(0, 0, 0);
      }
      e.set(burst * 6 + i, burst * 4 + i * 2, i);
      m4.compose(pos[i], q.setFromEuler(e), one);
      confetti.setMatrixAt(i, m4);
    }
    confetti.instanceMatrix.needsUpdate = true;
    if (burst > 4.5) {
      burst = -1;
      confetti.visible = false;
    }
  }

  const release = pointer(canvas, {
    onDrag: (dx) => {
      spin = dx * 0.004;
      stage.poke();
    },
    onDragState: (d) => {
      dragging = d;
      canvas.style.cursor = d ? 'grabbing' : 'grab';
    },
  });

  let seen = false;
  return {
    set(r, s, d) {
      if (seen && d && !done && !stage.reduced) startConfetti();
      seen = true;
      riderGoal = r;
      stageIndex = s;
      done = d;
      stage.poke();
    },
    dispose() {
      release();
      stage.dispose();
    },
  };
}
