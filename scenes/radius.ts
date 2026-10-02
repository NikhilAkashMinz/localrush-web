// Home page scene: the customer's 5 km circle with every nearby shop standing where
// it really is, relative to them. A scooter rides in from one shop after another.

import * as THREE from 'three';
import { createStage, flat, makeHouse, makeScooter, makeShop, pointer, seeded, sun, MARIGOLD, CHILLI } from './kit';

export type ShopDot = {
  id: string;
  color: string;
  /** km east and km south of the customer. */
  x: number;
  z: number;
  usable: boolean;
  inRange: boolean;
};

export type RadiusScene = {
  setShops(shops: ShopDot[], seed: number): void;
  highlight(id: string | null): void;
  dispose(): void;
};

type Callbacks = {
  onHover(id: string | null): void;
  onSelect(id: string): void;
};

// Road distance is about 1.3 times the straight line, so 5 km by road is this far on the map.
const RING = 5 / 1.3;
const OUTER = 5.5;

/**
 * Most shops sit within a kilometre or two, so a true-to-scale map would pile them
 * on top of the customer. Distances inside the ring are stretched with a square root:
 * directions stay exact, the ring stays at 5 km, and near shops get room to stand.
 */
function spread(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r < 0.001 || r >= RING) return { x, z };
  const k = (RING * Math.sqrt(r / RING)) / r;
  return { x: x * k, z: z * k };
}

function youBadge() {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = MARIGOLD;
  ctx.beginPath();
  ctx.roundRect(4, 4, 152, 60, 30);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(68, 62);
  ctx.lineTo(80, 78);
  ctx.lineTo(92, 62);
  ctx.fill();
  ctx.fillStyle = '#17142B';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('You', 80, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.9, 0.45, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function createRadiusScene(canvas: HTMLCanvasElement, label: HTMLElement, cb: Callbacks): RadiusScene | null {
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const dir = new THREE.Vector3(0, 0.54, 0.84).normalize();

  const world = new THREE.Group();
  const shopsGroup = new THREE.Group();
  const cityGroup = new THREE.Group();
  const scooter = makeScooter(CHILLI);
  scooter.scale.setScalar(0.5);
  scooter.visible = false;

  const trail = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.02, 1),
    new THREE.MeshBasicMaterial({ color: MARIGOLD, transparent: true, opacity: 0.9 }),
  );
  trail.visible = false;

  const pulses = [0, 1].map(() => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 72),
      new THREE.MeshBasicMaterial({ color: MARIGOLD, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    return m;
  });

  let shops: { dot: ShopDot; group: THREE.Group; base: number; lift: number }[] = [];
  let hovered: string | null = null;
  let pinned: string | null = null;
  let dragging = false;
  let spin = 0;
  let ride = { from: new THREE.Vector3(), t: 0, dur: 2, wait: 0.4, index: 0 };
  const ray = new THREE.Raycaster();
  const tmp = new THREE.Vector3();

  const stage = createStage({
    canvas,
    camera,
    shadows: true,
    onResize: (w, h) => {
      const aspect = w / h;
      const dist = Math.max(11, 20.5 / aspect);
      camera.position.copy(dir).multiplyScalar(dist);
      camera.lookAt(0, 0, 0.3);
    },
    onFrame: (dt, time) => {
      const active = hovered ?? pinned;
      if (!dragging && !active) world.rotation.y += dt * 0.07;
      world.rotation.y += spin;
      spin *= 0.9;

      pulses.forEach((p, i) => {
        const k = (time * 0.28 + i * 0.5) % 1;
        p.scale.setScalar(0.3 + k * (RING - 0.3));
        (p.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
      });

      for (const s of shops) {
        const target = s.dot.id === active ? 1 : 0;
        s.lift += (target - s.lift) * Math.min(1, dt * 10 + (stage?.reduced ? 1 : 0));
        s.group.scale.setScalar(s.base * (1 + s.lift * 0.3));
        s.group.position.y = s.lift * 0.12;
      }

      stepRide(dt);
      placeLabel(active);
    },
  });
  if (!stage) return null;

  stage.scene.add(world);
  sun(stage.scene, 7.5, '#F2FFFC', '#2E8F88');

  // Ground: an outer disc for what is too far, an inner one for what can be delivered.
  const outer = new THREE.Mesh(new THREE.CircleGeometry(OUTER, 72), flat('#0A4A47'));
  outer.rotation.x = -Math.PI / 2;
  outer.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(RING, 72), flat('#0F625D'));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.01;
  inner.receiveShadow = true;
  world.add(outer, inner, cityGroup, shopsGroup, scooter, trail, ...pulses);

  // The 5 km boundary, drawn as dashes so it reads as a limit rather than a wall.
  const dashCount = 56;
  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.03, 0.06),
    new THREE.MeshBasicMaterial({ color: MARIGOLD }),
    dashCount,
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < dashCount; i++) {
    const a = (i / dashCount) * Math.PI * 2;
    m4.makeRotationY(-a + Math.PI / 2);
    m4.setPosition(Math.cos(a) * RING, 0.03, Math.sin(a) * RING);
    dashes.setMatrixAt(i, m4);
  }
  world.add(dashes);

  const home = makeHouse(CHILLI);
  home.scale.setScalar(0.7);
  const you = youBadge();
  you.position.y = 1.05;
  world.add(home, you);

  function buildCity(seed: number, taken: { x: number; z: number }[]) {
    cityGroup.clear();
    const rnd = seeded(seed);
    const roadMat = flat('#15766F');
    for (let i = 0; i < 5; i++) {
      const angle = rnd() * Math.PI;
      const offset = (rnd() - 0.5) * OUTER * 1.3;
      const half = Math.sqrt(Math.max(0.2, OUTER * OUTER - offset * offset)) * 0.97;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.09), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = angle;
      road.position.set(-Math.sin(angle) * offset, 0.02, -Math.cos(angle) * offset);
      cityGroup.add(road);
    }
    const count = 120;
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), flat('#17807A'), count);
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < count; tries++) {
      const r = Math.sqrt(rnd()) * (OUTER - 0.3);
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (r < 1 || taken.some((t) => Math.hypot(t.x - x, t.z - z) < 0.8)) continue;
      const h = 0.08 + rnd() * rnd() * 0.42;
      scl.set(0.16 + rnd() * 0.24, h, 0.16 + rnd() * 0.24);
      pos.set(x, h / 2, z);
      quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI);
      m4.compose(pos, quat, scl);
      blocks.setMatrixAt(placed++, m4);
    }
    blocks.count = placed;
    blocks.instanceMatrix.needsUpdate = true;
    cityGroup.add(blocks);
  }

  function setShops(dots: ShopDot[], seed: number) {
    shopsGroup.clear();
    // Keep only what fits on the map, then nudge apart shops that share a street corner.
    const kept = dots
      .filter((d) => Math.hypot(d.x, d.z) < OUTER - 0.35)
      .map((d) => ({ dot: d, ...spread(d.x, d.z) }));
    for (let pass = 0; pass < 8; pass++) {
      for (const a of kept) {
        const r = Math.hypot(a.x, a.z);
        if (r < 1.25) {
          const k = r < 0.01 ? 1 : 1.25 / r;
          a.x = r < 0.01 ? 1.25 : a.x * k;
          a.z *= k;
        }
        for (const b of kept) {
          if (a === b) continue;
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          const d = Math.hypot(dx, dz) || 0.001;
          if (d < 0.95) {
            const push = (0.95 - d) / 2;
            a.x += (dx / d) * push;
            a.z += (dz / d) * push;
          }
        }
      }
    }
    shops = kept.map(({ dot, x, z }) => {
      const group = dot.usable
        ? makeShop(dot.color)
        : dot.inRange
          ? makeShop('#7FA7A3', '#C9D8D6')
          : makeShop('#2F8F88', '#3C9C95');
      const base = dot.usable ? 0.66 : dot.inRange ? 0.56 : 0.46;
      group.scale.setScalar(base);
      group.position.set(x, 0, z);
      group.rotation.y = Math.atan2(-x, -z); // face the customer
      group.traverse((o) => {
        o.userData.shop = dot.id;
      });
      shopsGroup.add(group);
      return { dot, group, base, lift: 0 };
    });
    buildCity(seed, kept);
    ride.index = 0;
    ride.wait = 0.4;
    ride.t = 0;
    scooter.visible = false;
    trail.visible = false;
    stage?.poke();
  }

  function stepRide(dt: number) {
    const usable = shops.filter((s) => s.dot.usable);
    if (!usable.length) {
      scooter.visible = false;
      trail.visible = false;
      return;
    }
    if (ride.wait > 0) {
      ride.wait -= dt;
      if (ride.wait <= 0) {
        const s = usable[ride.index % usable.length];
        ride.index++;
        ride.from.copy(s.group.position).setY(0);
        ride.dur = Math.min(3.4, Math.max(1.5, ride.from.length() * 0.85));
        ride.t = 0;
        scooter.visible = true;
        trail.visible = true;
      }
      return;
    }
    ride.t = Math.min(1, ride.t + dt / ride.dur);
    const k = ride.t * ride.t * (3 - 2 * ride.t);
    const stop = 0.7 / Math.max(0.8, ride.from.length());
    tmp.copy(ride.from).multiplyScalar(1 - k * (1 - stop));
    scooter.position.set(tmp.x, 0.02, tmp.z);
    scooter.rotation.y = Math.atan2(-ride.from.x, -ride.from.z);
    const len = ride.from.distanceTo(tmp);
    trail.scale.z = Math.max(0.001, len);
    trail.position.copy(ride.from).add(tmp).multiplyScalar(0.5).setY(0.045);
    trail.rotation.y = scooter.rotation.y;
    (trail.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - Math.max(0, (ride.t - 0.8) / 0.2));
    if (ride.t >= 1) {
      ride.wait = 0.9;
      trail.visible = false;
    }
  }

  function placeLabel(id: string | null) {
    const s = id ? shops.find((x) => x.dot.id === id) : undefined;
    if (!s || !stage) {
      label.dataset.show = 'false';
      return;
    }
    s.group.getWorldPosition(tmp);
    tmp.y += 1.15;
    tmp.project(camera);
    const x = ((tmp.x + 1) / 2) * stage.width;
    const y = ((1 - tmp.y) / 2) * stage.height;
    label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    label.dataset.show = 'true';
  }

  function pick(x: number, y: number) {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = ray.intersectObjects(shopsGroup.children, true)[0];
    return (hit?.object.userData.shop as string | undefined) ?? null;
  }

  const release = pointer(canvas, {
    onDrag: (dx) => {
      spin = dx * 0.0035;
      stage.poke();
    },
    onDragState: (d) => {
      dragging = d;
    },
    onHover: (x, y, inside) => {
      const id = inside && !dragging ? pick(x, y) : null;
      if (id !== hovered) {
        hovered = id;
        canvas.style.cursor = id ? 'pointer' : 'grab';
        cb.onHover(id);
        stage.poke();
      }
    },
    onTap: (x, y) => {
      const id = pick(x, y);
      if (id) cb.onSelect(id);
    },
  });

  return {
    setShops,
    highlight(id) {
      pinned = id;
      stage.poke();
    },
    dispose() {
      release();
      stage.dispose();
    },
  };
}
