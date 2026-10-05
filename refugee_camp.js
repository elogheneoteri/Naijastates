// Refugee Camp, built entirely in code (no .glb file needed).
// Local space: camp centre is (0,0,0) on the ground, the gate faces +Z (game.js turns the camp 180 degrees
// so the gate faces north towards the road). The camp covers x -9.5..9.5, z -9.5..9.5.
// Exports: buildRefugeeCamp() -> { group, update }, and CAMP_BOXES (solid parts, for game.js collisions).

import * as THREE from 'three';
import { loadProp } from './props_library.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- layout (shared with the collision boxes) ----------

const TENTS = [
  { x: -7.3, z: -7.0, col: 0x5f7f93 }, { x: -7.3, z: -3.5, col: 0xc9b48a }, { x: -7.3, z: 0.0, col: 0x6b7a52 },
  { x: 7.3, z: -7.0, col: 0xd8d3c3 }, { x: 7.3, z: -3.5, col: 0x4f6f8c }, { x: 7.3, z: 0.0, col: 0xb8a27a },
  { x: -7.0, z: 5.4, col: 0x7b8a5a }, { x: 7.0, z: 5.4, col: 0xcfc8b4 },
];
const TENT_W = 2.4, TENT_H = 1.9, TENT_D = 2.6;

// Trees standing just outside the fence (x, z in camp space, trunk is solid). Edit freely.
const TREES = [
  { name: 'palm_4',      x: -12.8, z: -6.0,  rotY: 0.4 }, { name: 'palm_3',      x: 12.6,  z: -8.5,  rotY: 2.0 },
  { name: 'birch_2',     x: -12.6, z: 2.0,   rotY: 1.1 }, { name: 'birch_1',     x: -6.5,  z: -12.6, rotY: 0.2 },
  { name: 'dead_tree_1', x: 12.9,  z: 3.0,   rotY: 3.0 }, { name: 'dead_tree_3', x: 5.5,   z: -12.8, rotY: 1.6 },
  { name: 'birch_4',     x: 13.2,  z: -2.0,  rotY: 2.4 }, { name: 'palm_3',      x: -3.0,  z: -13.0, rotY: 4.0 },
];
// Small plants outside the fence and beside the gate
const PLANTS = [
  { name: 'flower_clump', x: -10.6, z: -3.0 }, { name: 'flower_clump', x: 10.7, z: -5.5 },
  { name: 'flower_1', x: -10.5, z: 3.0 }, { name: 'flower_1', x: 10.6, z: 1.0 },
];
const JERRY_SPOTS = [[-5.2, 7.6], [-5.0, 7.9], [-3.3, 7.7], [-3.1, 7.5]];

export const CAMP_BOXES = [
  ...TREES.map(t => [t.x - 0.3, t.x + 0.3, t.z - 0.3, t.z + 0.3]),               // tree trunks
  [-4.7, 4.7, -8.0, 0.0],                                                     // the big tent
  [-1.6, 1.6, -9.2, -8.2],                                                    // crate stack along the back fence
  ...TENTS.map(t => [t.x - TENT_W / 2, t.x + TENT_W / 2, t.z - TENT_D / 2, t.z + TENT_D / 2]),
  [-9.6, -9.2, -9.6, 9.5], [9.2, 9.6, -9.6, 9.5], [-9.6, 9.6, -9.6, -9.2],     // fence: left, right, back
  [-9.6, -2.0, 9.1, 9.5], [2.0, 9.6, 9.1, 9.5],                               // fence: front, either side of the gate
  [-2.3, -1.9, 9.1, 9.5], [1.9, 2.3, 9.1, 9.5],                               // gate posts
];

// ---------- textures ----------

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function dirtTex() {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8a6e4f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const v = 95 + rand() * 70;
      g.fillStyle = `rgba(${v + 35},${v + 8},${v - 30},${0.12 + rand() * 0.2})`;
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
    for (let i = 0; i < 30; i++) {                         // worn, paler paths and dark patches
      g.fillStyle = rand() < 0.5 ? 'rgba(190,160,120,0.10)' : 'rgba(60,45,30,0.10)';
      g.beginPath(); g.ellipse(rand() * w, rand() * h, 20 + rand() * 60, 10 + rand() * 30, rand() * 3, 0, 7); g.fill();
    }
  }, true);
  t.repeat.set(2, 2);
  return t;
}

function fabricTex() {
  return canvasTex(64, 64, g => {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1;
    for (let i = 0; i < 64; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,70,50,${rand() * 0.08})`; g.fillRect(rand() * 64, rand() * 64, 2, 2); }
  }, true);
}

function linkTex() {
  return canvasTex(64, 64, g => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(190,195,200,0.95)'; g.lineWidth = 2;
    for (let i = -64; i <= 128; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
      g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
    }
  }, true);
}

function signTex(w, h, bg, lines) {
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f3efe0'; g.lineWidth = h * 0.035;
    g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.88);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(l => { g.font = `bold ${l.size}px Arial, sans-serif`; g.fillStyle = l.color || '#f7f3e4'; g.fillText(l.t, w / 2, l.y); });
  });
}

// ---------- instancing helper (many copies of one part, one draw call) ----------

class Inst {
  constructor(mat, geo = BOX) { this.mat = mat; this.geo = geo; this.items = []; }
  add(x, y, z, sx, sy, sz, ry = 0, color = null) { this.items.push({ x, y, z, sx, sy, sz, ry, color }); }
  build() {
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    this.items.forEach((it, i) => {
      e.set(0, it.ry, 0); q.setFromEuler(e);
      m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, m);
      if (it.color !== null) im.setColorAt(i, new THREE.Color(it.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    return im;
  }
}

// ---------- the camp ----------

export function buildRefugeeCamp() {
  seed = 11;
  const g = new THREE.Group();
  const std = (color, rough = 0.9, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const fabric = fabricTex();
  const canvasMat = col => new THREE.MeshStandardMaterial({ map: fabric, color: col, roughness: 1, side: THREE.DoubleSide });
  const M = {
    wood: std(0x7a5a3a), post: std(0x5b4a3a), steel: std(0x9aa0a4, 0.5, 0.4), dark: std(0x1c1f22, 0.8), concrete: std(0xa9a7a0),
    tank: std(0x23272b, 0.6), yellow: std(0xd9b52c, 0.6), blue: std(0x2f6fb0, 0.7), tarp: std(0x2d6cb3, 0.75, 0, { side: THREE.DoubleSide }),
    sack: std(0xe3d9bd), stone: std(0x7d7a73), ember: std(0xff6a1a, 0.5, 0, { emissive: 0xff4a00, emissiveIntensity: 1.2 }),
    rope: std(0xc0392b, 0.8), green: std(0x0f7a3e, 0.7), bundle: std(0x9b6b4a),
  };

  const box = (mat, w, h, d, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m;
  };
  const signBoard = (w, h, x, y, z, tex, back = null) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.6 });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); f.position.set(x, y, z); g.add(f);
    if (back) {
      const mb = new THREE.MeshStandardMaterial({ map: back, emissiveMap: back, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.6 });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mb); b.rotation.y = Math.PI; b.position.set(x, y, z - 0.03); g.add(b);
    }
  };
  // a house-shaped (or triangular) prism running along z, for tents
  const prism = (mat, w, wallH, peakH, d, x, z) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0);
    if (wallH > 0) { s.lineTo(w / 2, wallH); s.lineTo(0, peakH); s.lineTo(-w / 2, wallH); } else s.lineTo(0, peakH);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };

  const I = {
    post: new Inst(M.post), steel: new Inst(M.steel), rope: new Inst(M.rope), jerry: new Inst(M.yellow), jerryB: new Inst(M.blue),
    wood: new Inst(M.wood),
  };
  // Simple built-in shapes: they only show if a real prop file fails to load, otherwise they are removed.
  const FB = { sack: new Inst(M.sack, new THREE.SphereGeometry(0.5, 10, 8)), bundle: new Inst(M.bundle, new THREE.SphereGeometry(0.5, 8, 6)), queueSteel: new Inst(M.steel), queueRope: new Inst(M.rope) };
  const old = { bigTent: [], tents: TENTS.map(() => []), crates: [], line: [] };

  // ----- ground -----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(19.2, 19.2), new THREE.MeshStandardMaterial({ map: dirtTex(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0.012, 0); ground.receiveShadow = true; g.add(ground);

  // ----- fence (chain link) and gate -----
  const link = linkTex();
  const linkMat = new THREE.MeshStandardMaterial({ map: link, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  const FH = 1.8;
  const panel = (len, x, z, ry) => {
    const geo = new THREE.PlaneGeometry(len, FH);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.45, uv.getY(i) * FH / 0.45);
    const m = new THREE.Mesh(geo, linkMat); m.position.set(x, FH / 2 + 0.05, z); m.rotation.y = ry; g.add(m);
    const n = Math.max(2, Math.round(len / 2));
    for (let i = 0; i <= n; i++) {
      const o = -len / 2 + (len * i) / n;
      I.post.add(x + Math.cos(ry) * o, FH / 2 + 0.05, z - Math.sin(ry) * o, 0.1, FH + 0.1, 0.1);
    }
  };
  panel(19, -9.4, 0, Math.PI / 2); panel(19, 9.4, 0, Math.PI / 2); panel(19, 0, -9.4, 0);
  panel(7.5, -5.75, 9.4, 0); panel(7.5, 5.75, 9.4, 0);
  [-2.1, 2.1].forEach(x => box(M.post, 0.4, 3.6, 0.4, x, 1.8, 9.4));
  box(M.post, 4.8, 0.25, 0.3, 0, 3.45, 9.4);
  signBoard(3.9, 0.85, 0, 4.05, 9.4, signTex(1024, 220, '#0b5a2e', [
    { t: 'REFUGEE CAMP', size: 100, y: 78 }, { t: 'Registration and aid', size: 44, y: 160 }]),
    signTex(1024, 220, '#0b5a2e', [{ t: 'WELCOME', size: 100, y: 78 }, { t: 'Rest, eat, then register', size: 44, y: 160 }]));

  // ----- the big tent (registration and aid) -----
  old.bigTent.push(prism(canvasMat(0xebe4d0), 9.2, 2.3, 4.3, 5.6, 0, -4.5));
  // entrance sign on two posts in front of the tent
  [-2.25, 2.25].forEach(x => I.post.add(x, 1.7, 0.1, 0.12, 3.4, 0.12));
  signBoard(4.2, 0.8, 0, 3.05, 0.04, signTex(1024, 200, '#7a2418', [{ t: 'REGISTRATION and AID', size: 74, y: 100 }]));

  // ----- small tents -----
  TENTS.forEach((t, i) => {
    old.tents[i].push(prism(canvasMat(t.col), TENT_W, 0, TENT_H, TENT_D, t.x, t.z));
    I.post.add(t.x, 0.35, t.z + TENT_D / 2 + 1.1, 0.12, 0.7, 0.12);                                // sitting log
  });

  // ----- registration desk under an open tarp shelter -----
  [[-1.9, 2.0], [1.9, 2.0], [-1.9, 4.6], [1.9, 4.6]].forEach(([x, z]) => I.post.add(x, 1.25, z, 0.12, 2.5, 0.12));
  const roof = new THREE.Mesh(BOX, M.tarp); roof.scale.set(4.4, 0.05, 3.1); roof.position.set(0, 2.6, 3.3); roof.rotation.x = 0.07; roof.castShadow = true; g.add(roof);
  box(M.wood, 2.6, 0.08, 0.8, 0, 0.82, 3.0); box(M.wood, 0.1, 0.8, 0.7, -1.2, 0.4, 3.0); box(M.wood, 0.1, 0.8, 0.7, 1.2, 0.4, 3.0);
  box(M.wood, 1.8, 0.4, 0.3, 0, 0.2, 4.2); box(M.wood, 1.8, 0.4, 0.3, 0, 0.2, 1.6);
  // queue lane from the gate (built-in posts and rope are replaced by the rope-fence props)
  [8.2, 7.1, 6.0, 5.3].forEach(z => [-1.1, 1.1].forEach(x => FB.queueSteel.add(x, 0.45, z, 0.07, 0.9, 0.07)));
  [[7.65, -1.1], [6.55, -1.1], [7.65, 1.1], [6.55, 1.1]].forEach(([z, x]) => FB.queueRope.add(x, 0.82, z, 0.03, 0.03, 1.1));

  // ----- water point -----
  box(M.concrete, 2.6, 0.12, 1.4, -4.2, 0.06, 6.6);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 20), M.tank);
  tank.position.set(-4.2, 0.67, 6.2); tank.castShadow = true; g.add(tank);
  JERRY_SPOTS.forEach(([x, z], i) => (i % 2 ? I.jerryB : I.jerry).add(x, 0.22, z, 0.32, 0.44, 0.2, rand() * 3));

  // ----- cooking area -----
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.38, 18), M.dark);   // fallback only
  pot.position.set(4.8, 0.19, 6.4); pot.castShadow = true; g.add(pot);
  [[3.5, 5.6], [6.0, 5.8], [5.9, 7.4]].forEach(([x, z]) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.3, 10), M.wood);
    log.rotation.z = Math.PI / 2; log.rotation.y = Math.atan2(z - 6.4, x - 4.8) + Math.PI / 2; log.position.set(x, 0.17, z); log.castShadow = true; g.add(log);
  });
  for (let i = 0; i < 8; i++) I.wood.add(6.6 + (i % 4) * 0.12 - 0.2, 0.08 + Math.floor(i / 4) * 0.14, 8.0 + (i % 2) * 0.05, 0.1, 0.1, 0.9);

  // ----- aid crates, sacks and bundles (fallback shapes; the real props are placed below) -----
  [[5.3, 1.5], [6.0, 1.9], [5.4, 2.4]].forEach(([x, z], i) => old.crates.push(box(M.wood, 0.75, 0.5 + (i % 2) * 0.1, 0.55, x, 0.27, z)));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) FB.sack.add(-5.6 + c * 0.55 + r * 0.27, 0.16 + r * 0.26, 2.0 + (c % 2) * 0.03, 0.6, 0.3, 0.42, rand() * 0.4);
  [[-3.4, 1.4], [-3.0, 2.0], [3.2, 2.2]].forEach(([x, z]) => FB.bundle.add(x, 0.25, z, 0.7, 0.5, 0.5, rand() * 3));

  // ----- clothesline (fallback; the real clothesline prop replaces it) -----
  [-8.7, -5.3].forEach(x => old.line.push(box(M.post, 0.1, 2.0, 0.1, x, 1.0, 2.8)));
  old.line.push(box(M.rope, 3.4, 0.02, 0.02, -7.0, 1.95, 2.8, false));
  const cloths = [];     // (the old waving cloth is gone; the update loop below still works with an empty list)

  // The built-in jerry cans stay as a fallback and are removed once the real model has loaded.
  const fallbackJerry = [I.jerry, I.jerryB].map(inst => { const m = inst.build(); g.add(m); return m; });
  Object.entries(I).forEach(([k, inst]) => { if (k !== 'jerry' && k !== 'jerryB' && inst.items.length) g.add(inst.build()); });
  const fbMeshes = {}; Object.entries(FB).forEach(([k, inst]) => { fbMeshes[k] = inst.build(); g.add(fbMeshes[k]); });

  // ----- real props from props_library.js -----
  // If a file is missing or fails to load, the simple code-made shapes above simply stay in place.
  const put = (name, x, y, z, opts) => loadProp(name, opts).then(p => { p.position.set(x, y, z); g.add(p); return p; });
  const warn = what => e => console.warn('refugee camp: could not load ' + what + ', keeping the built-in shape', e);

  put('plastic_tank', -4.2, 0.12, 6.2, { rotY: 0.5, scale: 1.25 }).then(() => g.remove(tank)).catch(warn('water tank'));
  put('clay_pot', 4.8, 0, 6.4).then(() => g.remove(pot)).catch(warn('cooking pot'));
  put('camp_pots', 3.7, 0, 7.4, { rotY: 0.8 }).catch(warn('camp pots'));
  Promise.all(JERRY_SPOTS.concat([[3.2, 8.0], [-8.4, 6.9]]).map(([x, z], i) =>
    loadProp('jerry_can', { rotY: 1.9 * i }).then(p => { p.position.set(x, 0, z); return p; })))
    .then(list => { fallbackJerry.forEach(m => g.remove(m)); list.forEach(p => g.add(p)); })
    .catch(warn('jerry cans'));

  // Big tent: takes the place of the old one
  put('tent_big', 0, 0, -4.5).then(() => old.bigTent.forEach(o => g.remove(o))).catch(warn('big tent'));

  // Small tents
  TENTS.forEach((t, i) => put('tent_small', t.x, 0, t.z).then(() => old.tents[i].forEach(o => g.remove(o))).catch(warn('small tent')));

  // Queue lane: one rope fence on each side
  Promise.all([-1.1, 1.1].map(x => loadProp('rope_fence', { rotY: Math.PI / 2 }).then(p => { p.position.set(x, 0, 6.75); return p; })))
    .then(list => { g.remove(fbMeshes.queueSteel); g.remove(fbMeshes.queueRope); list.forEach(p => g.add(p)); })
    .catch(warn('rope fences'));

  // Clothesline between the two left-hand tents
  put('clothes_line', -6.3, 0, 2.8).then(() => old.line.forEach(o => g.remove(o))).catch(warn('clothesline'));

  // Crates and barrels
  Promise.all([
    put('crate_small', 4.4, 0, 1.5, { rotY: 0.2 }), put('crate_small', 5.25, 0, 1.6, { rotY: -0.15 }), put('crate_small', 4.85, 0.69, 1.55, { rotY: 0.5 }),
    put('crate_tall', 6.3, 0, 2.3, { rotY: 0.3 }), put('crate_wide', 4.9, 0, 3.1, { rotY: Math.PI / 2 }),
    put('barrel', -2.6, 0, 6.5), put('barrel', -2.2, 0, 7.3, { rotY: 1 }),
  ]).then(() => old.crates.forEach(o => g.remove(o))).catch(warn('crates'));

  put('crate_store', 0, 0, -8.7).catch(warn('crate stack'));     // long stack of boxes along the back fence

  // Sacks
  Promise.all([
    put('sack_coffee', -3.4, 0, 1.6, { rotY: 0.3 }), put('sack_wheat', -2.9, 0, 2.9, { rotY: 1.2 }),
    put('sack_burlap', -2.4, 0, 0.9, { rotY: 0.6 }), put('sack_burlap', -4.5, 0, 0.7, { rotY: 2.1 }), put('sack_burlap', -2.2, 0, 2.2, { rotY: 3.4 }),
    put('sack_burlap', 3.2, 0, 2.2, { rotY: 1.7 }), put('sack_burlap', 3.55, 0, 2.7, { rotY: 0.2 }),
  ]).then(() => { g.remove(fbMeshes.sack); g.remove(fbMeshes.bundle); }).catch(warn('sacks'));

  TREES.forEach(t => put(t.name, t.x, 0, t.z, { rotY: t.rotY }).catch(warn(t.name)));
  PLANTS.forEach((p, i) => put(p.name, p.x, 0, p.z, { rotY: i * 1.3 }).catch(warn(p.name)));

  const update = () => {
    const t = performance.now() / 1000;
    cloths.forEach((c, i) => { c.rotation.z = Math.sin(t * 1.6 + i) * 0.08; c.rotation.y = Math.sin(t * 1.1 + i * 1.7) * 0.25; });
  };

  return { group: g, update };
}
