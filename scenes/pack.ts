// Product page scene: a 3D pack built from the product's shape, colour and label.
// Drag to turn it; left alone, it turns slowly on its own.

import * as THREE from 'three';
import { blobShadow, createStage, pointer, seeded } from './kit';

export type PackSpec = {
  id: string;
  name: string;
  unit: string;
  emoji: string;
  shape: 'box' | 'carton' | 'bottle' | 'can' | 'jar' | 'pouch' | 'round' | 'tube' | 'strip' | 'book';
  color: string;
};

export type PackScene = { set(spec: PackSpec): void; dispose(): void };

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const LONG = new Set(['banana', 'carrot', 'chilli', 'coriander']);

function isLight(color: string) {
  const c = new THREE.Color(color);
  return c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 0.62;
}

function shade(color: string, k: number) {
  return '#' + new THREE.Color(color).multiplyScalar(k).getHexString();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** Draw one label panel centred on cx. */
function drawPanel(ctx: CanvasRenderingContext2D, spec: PackSpec, cx: number, w: number, h: number, family: string) {
  const light = isLight(spec.color);
  const ink = light ? '#17142B' : '#FFFFFF';
  const r = Math.min(w, h) * 0.27;
  const cy = h * 0.34;
  ctx.fillStyle = light ? 'rgba(23,20,43,0.08)' : 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${r * 1.15}px ${EMOJI_FONT}`;
  ctx.fillText(spec.emoji, cx, cy + r * 0.06);

  const size = Math.round(h * (w > h ? 0.11 : 0.09));
  ctx.fillStyle = ink;
  ctx.font = `800 ${size}px ${family}`;
  const lines = wrapText(ctx, spec.name, w * 0.84);
  let y = cy + r + size * 1.1;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += size * 1.12;
  }
  ctx.globalAlpha = 0.8;
  ctx.font = `600 ${Math.round(size * 0.62)}px ${family}`;
  ctx.fillText(spec.unit, cx, y + size * 0.1);
  ctx.globalAlpha = 1;
}

function labelTexture(spec: PackSpec, wrap: boolean, family: string, maxAniso: number) {
  const c = document.createElement('canvas');
  c.width = wrap ? 1024 : 512;
  c.height = wrap ? 512 : 660;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, c.width, c.height);
  // A darker band along the bottom, like the printed strip on most packs.
  ctx.fillStyle = 'rgba(23,20,43,0.14)';
  ctx.fillRect(0, c.height * 0.93, c.width, c.height * 0.07);
  if (wrap) {
    drawPanel(ctx, spec, c.width * 0.25, c.width / 2, c.height, family);
    drawPanel(ctx, spec, c.width * 0.75, c.width / 2, c.height, family);
  } else {
    drawPanel(ctx, spec, c.width / 2, c.width, c.height, family);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

function std(color: string, rough = 0.6) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
}

function build(spec: PackSpec, family: string, maxAniso: number) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const side = std(shade(spec.color, 0.86));
  const face = () => new THREE.MeshStandardMaterial({ map: labelTexture(spec, false, family, maxAniso), roughness: 0.55 });
  const band = () => new THREE.MeshStandardMaterial({ map: labelTexture(spec, true, family, maxAniso), roughness: 0.5 });

  switch (spec.shape) {
    case 'box': {
      add(new THREE.BoxGeometry(1.45, 1.87, 0.55), [side, side, side, side, face(), face()]);
      break;
    }
    case 'book': {
      const pages = std('#F6F3EA', 0.9);
      const spine = std(shade(spec.color, 0.7));
      add(new THREE.BoxGeometry(1.4, 1.8, 0.24), [pages, spine, pages, pages, face(), std(spec.color)]);
      break;
    }
    case 'carton': {
      add(new THREE.BoxGeometry(1.1, 1.42, 1.1), [face(), face(), side, side, face(), face()], 0, -0.2, 0);
      const tri = new THREE.Shape();
      tri.moveTo(-0.55, 0);
      tri.lineTo(0.55, 0);
      tri.lineTo(0, 0.42);
      tri.closePath();
      const roof = new THREE.ExtrudeGeometry(tri, { depth: 1.1, bevelEnabled: false });
      roof.translate(0, 0, -0.55);
      const r = add(roof, std('#FFFDF7', 0.7), 0, 0.51, 0);
      r.rotation.y = Math.PI / 2;
      add(new THREE.BoxGeometry(1.1, 0.16, 0.06), std('#FFFDF7', 0.7), 0, 0.99, 0);
      break;
    }
    case 'pouch': {
      const geo = new THREE.BoxGeometry(1.5, 1.9, 0.56, 14, 14, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const nx = p.getX(i) / 0.75;
        const ny = p.getY(i) / 0.95;
        const f = (1 - nx * nx) * (1 - Math.pow(Math.abs(ny), 3));
        p.setZ(i, p.getZ(i) * (0.16 + 0.95 * Math.max(0, f)));
      }
      geo.computeVertexNormals();
      add(geo, [side, side, side, side, face(), face()]);
      break;
    }
    case 'bottle': {
      const pts = [
        [0, -1], [0.5, -1], [0.54, -0.92], [0.54, 0.22], [0.47, 0.44], [0.24, 0.66], [0.2, 0.74], [0.2, 0.92], [0, 0.92],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, 48), std(spec.color, 0.3));
      add(new THREE.CylinderGeometry(0.23, 0.23, 0.2, 32), std(isLight(spec.color) ? '#17142B' : '#FFFDF7', 0.5), 0, 1.0, 0);
      add(new THREE.CylinderGeometry(0.552, 0.552, 0.82, 48, 1, true), band(), 0, -0.36, 0).rotation.y = -Math.PI / 2;
      break;
    }
    case 'can': {
      const metal = std('#CCD2DA', 0.35);
      add(new THREE.CylinderGeometry(0.58, 0.58, 1.6, 48), [band(), metal, metal]).rotation.y = -Math.PI / 2;
      break;
    }
    case 'jar': {
      add(new THREE.CylinderGeometry(0.72, 0.72, 1.2, 48), [band(), side, side], 0, -0.14, 0).rotation.y = -Math.PI / 2;
      add(new THREE.CylinderGeometry(0.76, 0.76, 0.24, 48), std('#FFFDF7', 0.5), 0, 0.58, 0);
      break;
    }
    case 'tube': {
      const geo = new THREE.CylinderGeometry(0.38, 0.38, 1.7, 40, 12);
      geo.rotateY(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + 0.85) / 1.7;
        const k = Math.min(1, Math.max(0, (t - 0.35) / 0.65));
        const s = k * k * (3 - 2 * k);
        p.setZ(i, p.getZ(i) * (1 - 0.93 * s));
        p.setX(i, p.getX(i) * (1 + 0.42 * s));
      }
      geo.computeVertexNormals();
      add(geo, [band(), side, side], 0, 0.12, 0);
      add(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 24), std('#FFFDF7', 0.5), 0, -0.88, 0);
      break;
    }
    case 'strip': {
      const foil = std('#D5DBE2', 0.3);
      add(new THREE.BoxGeometry(1.3, 2.0, 0.06), [foil, foil, foil, foil, foil, face()]);
      const pill = std(isLight(spec.color) ? '#FFFFFF' : spec.color, 0.4);
      const pillGeo = new THREE.SphereGeometry(0.2, 20, 12);
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 2; col++) {
          const m = add(pillGeo, pill, col ? 0.32 : -0.32, 0.72 - row * 0.36, 0.035);
          m.scale.set(1.15, 0.72, 0.42);
        }
      }
      break;
    }
    case 'round': {
      const wood = std('#C99B5C', 0.9);
      const slatX = new THREE.BoxGeometry(1.9, 0.2, 0.07);
      const slatZ = new THREE.BoxGeometry(0.07, 0.2, 1.26);
      add(new THREE.BoxGeometry(1.9, 0.07, 1.3), wood, 0, -0.78, 0);
      for (const y of [-0.62, -0.36]) {
        add(slatX, wood, 0, y, 0.63);
        add(slatX, wood, 0, y, -0.63);
        add(slatZ, wood, 0.92, y, 0);
        add(slatZ, wood, -0.92, y, 0);
      }
      const rnd = seeded(spec.id.length * 97 + spec.id.charCodeAt(0));
      const long = LONG.has(spec.id);
      const geo = long ? new THREE.CapsuleGeometry(0.13, 0.62, 4, 10) : new THREE.IcosahedronGeometry(0.31, 2);
      const spots: [number, number, number][] = [
        [-0.58, -0.5, -0.28], [0, -0.5, -0.3], [0.58, -0.5, -0.28], [-0.58, -0.5, 0.28], [0, -0.5, 0.3], [0.58, -0.5, 0.28],
        [-0.3, -0.12, 0], [0.3, -0.12, 0], [0, 0.18, 0],
      ];
      for (const [x, y, z] of spots) {
        const tone = shade(spec.color, 0.88 + rnd() * 0.22);
        const m = add(geo, std(tone, 0.55), x + (rnd() - 0.5) * 0.08, y + 0.02, z + (rnd() - 0.5) * 0.08);
        if (long) m.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.5, 0, Math.PI / 2 + (rnd() - 0.5) * 0.8);
        else m.scale.set(1, 0.9 + rnd() * 0.12, 1);
      }
      // Price card on a stick, the way a vendor marks a crate.
      add(new THREE.BoxGeometry(0.04, 1.0, 0.04), wood, 0.72, 0.12, -0.5);
      const card = add(new THREE.BoxGeometry(0.74, 0.95, 0.03), [side, side, side, side, face(), face()], 0.72, 0.82, -0.5);
      card.rotation.y = -0.2;
      g.position.y = 0.12;
      break;
    }
  }
  return g;
}

export function createPackScene(canvas: HTMLCanvasElement): PackScene | null {
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.55, 7.4);
  camera.lookAt(0, 0, 0);

  const holder = new THREE.Group();
  let current: THREE.Group | null = null;
  let velocity = 0;
  let tilt = 0.08;
  let tiltTarget = 0.08;
  let idleAfter = 0;
  let dragging = false;
  let grow = 1;

  const stage = createStage({
    canvas,
    camera,
    onResize: (w, h) => {
      // Keep the pack fully in view on tall, narrow canvases.
      camera.position.z = w / h < 0.9 ? 7.4 / (w / h) * 0.9 : 7.4;
    },
    onFrame: (dt) => {
      if (!dragging) {
        idleAfter -= dt;
        if (idleAfter <= 0) velocity += (0.45 * dt - velocity) * 0.04;
        tiltTarget += (0.08 - tiltTarget) * Math.min(1, dt * 1.5);
      }
      holder.rotation.y += velocity;
      if (dragging || idleAfter > 0) velocity *= 0.93;
      tilt += (tiltTarget - tilt) * 0.2;
      holder.rotation.x = tilt;
      grow += (1 - grow) * Math.min(1, dt * 7 + (stage?.reduced ? 1 : 0));
      holder.scale.setScalar(grow);
    },
  });
  if (!stage) return null;

  stage.scene.add(new THREE.HemisphereLight('#FFFFFF', '#D5DAE3', 1.9));
  const key = new THREE.DirectionalLight('#FFFFFF', 1.25);
  key.position.set(3, 5, 6);
  stage.scene.add(key);
  const rim = new THREE.DirectionalLight('#DDEBFF', 0.5);
  rim.position.set(-4, 2, -4);
  stage.scene.add(rim);
  const shadow = blobShadow(1.5, 0.3);
  shadow.position.y = -1.12;
  stage.scene.add(shadow, holder);

  const release = pointer(canvas, {
    onDrag: (dx, dy) => {
      velocity = dx * 0.012;
      tiltTarget = Math.max(-0.5, Math.min(0.6, tiltTarget + dy * 0.006));
      idleAfter = 2.2;
      stage.poke();
    },
    onDragState: (d) => {
      dragging = d;
      canvas.style.cursor = d ? 'grabbing' : 'grab';
    },
  });

  function clear() {
    if (!current) return;
    current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
    });
    holder.remove(current);
    current = null;
  }

  return {
    set(spec) {
      clear();
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
      current = build(spec, family, stage.renderer.capabilities.getMaxAnisotropy());
      holder.add(current);
      holder.rotation.y = -0.45;
      velocity = 0;
      idleAfter = 0.6;
      grow = stage.reduced ? 1 : 0.7;
      stage.poke();
    },
    dispose() {
      release();
      clear();
      stage.dispose();
    },
  };
}
