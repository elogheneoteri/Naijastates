// high_school_exterior.js  (STEP 2: the outside of the High School, no fence)
//
// Everything that stands AROUND the school building, in a Nigerian setting. game.js adds this next to the school model
// (see the three small game.js edits in the file I sent with this one).
//
// Exports:  buildHighSchoolExterior() -> { group, update }      HS_EXTERIOR_BOXES -> solid parts for collisions
//
// LOCAL SPACE (same as the school's collision boxes in game.js): the school centre is (0,0), the FRONT / road side is +Z,
// the plot is x -42..+42, z -11..+11. This file assumes the plot faces SOUTH (rotY 0), which is how city.js has it now.
// The main road is at local z 14.0 .. 17.5 and its pavement at z 12.4 .. 14.0.
//
// WHAT IS HERE
//   Frontage:   paved forecourt, green-and-white painted kerb (NOT a fence, you can walk over it anywhere), school signboard,
//               flagpole with a waving Nigerian flag, white-painted tyre planters with flowers, "Veronica" hand-wash bucket.
//   West wing:  tuck shop under a zinc-roof shed (kiosk, benches), borehole house + water tank on a steel tower,
//               generator under its own small roof, mango trees, a parked keke.
//   East wing:  football pitch on laterite with painted lines and two goals, mango trees.
//   Road:       zebra crossing, two speed bumps, two SCHOOL signs, street lamps, an electric pole.
//
// PROPS USED FROM YOUR UPLOAD (nothing new needed to run this):
//   mango_tree, coconut_palm, plastic_tank, bench_3seat, bush_flowers, flower_clump   (props_library.js)
//   kiosk_wooden.glb, generator.glb, street_lamp.glb, electric_pole.glb, autorikshaw_-_indian_tuk_tuk (2).glb   (props/ folder)
// Everything else (shed roofs, signboard, flag, tyres, tower, goals, markings) is built in code.
// If a .glb fails to load, the game keeps running (a plain stand-in shows or the item is skipped; see the console).
//
// ADDING THE NEW PROPS YOU GET (okada, neem tree, ...): see NEW_PROPS near the bottom. Drop the file in props/, set have: true.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadProp, PROPS_DIR } from './props_library.js';

const SCHOOL_NAME = 'DELTA HIGH SCHOOL';
const SCHOOL_MOTTO = 'Knowledge  \u00B7  Discipline  \u00B7  Integrity';

// ---------- layout (local metres). Change a number here and the picture and the collision box move together ----------

const KERB_Z = 10.9;                        // painted kerb along the front edge of the plot
const PATH_X = [-1.9, 5.7];                 // the school steps (x range); the paved path runs from here to the road

const FLAG = { x: -9, z: 10.2 };
const SIGN = { x: -19.5, z: 10.0, w: 4.6, h: 1.7 };
const BUCKET = { x: -2.9, z: 9.6 };
const TYRES = [[-3.9, 10.3, 0], [-4.8, 10.3, 1], [-5.7, 10.3, 0], [6.6, 10.3, 0], [7.5, 10.3, 1], [8.4, 10.3, 0]];   // x, z, colour (0 white, 1 green)
const BUSHES = [8.0, 9.8, 11.6, 13.4].map(x => ({ x, z: 9.2 }));

const TOWER = { x: -20.5, z: -7.0 };        // steel tower with the water tank
const PUMP = { x: -23.6, z: -7.4 };         // borehole pump house
const GEN = { x: -18.2, z: 3.0 };           // generator shed
const SHED = { x: -31.0, z: 4.2, w: 7.2, d: 3.6 };   // tuck-shop shed
const KIOSK = { x: -32.8, z: 2.9 };
const BENCHES = [{ x: -30.6, z: 5.2 }, { x: -28.5, z: 5.2 }];
const KEKE = { x: -25.0, z: 11.8, rotY: 0 };
const KEKE_FILE = 'keke_optimised.glb';   // your autorickshaw model, shrunk from 33 MB / 956,000 triangles to 0.5 MB / 24,000

const PITCH = { x: 28.5, z: 0, len: 22, wid: 18 };         // football pitch (east wing)
const GOAL_X = [PITCH.x - PITCH.len / 2, PITCH.x + PITCH.len / 2];      // the two goal lines
const GOAL_FILE = '3d_model_of_soccer__football_goal_post.glb';
const GOAL_HALF = 2.1;                                                  // half the width of the goal mouth

const TREES = [
  { name: 'mango_tree', x: -36.5, z: -5.5, rotY: 0.6, r: 0.45 }, { name: 'mango_tree', x: -27.5, z: -8.0, rotY: 2.1, r: 0.45 },
  { name: 'mango_tree', x: -37.5, z: 7.5, rotY: 4.0, r: 0.45 },  { name: 'mango_tree', x: 24.0, z: -10.0, rotY: 1.2, r: 0.45 },
  { name: 'mango_tree', x: 41.3, z: 10.0, rotY: 3.3, r: 0.45 },
  { name: 'coconut_palm', x: -13.6, z: 10.2, rotY: 0.4, r: 0.3 }, { name: 'coconut_palm', x: 13.0, z: 10.2, rotY: 2.0, r: 0.3 },
  { name: 'coconut_palm', x: -40.5, z: 10.3, rotY: 1.1, r: 0.3 }, { name: 'coconut_palm', x: 16.5, z: -10.3, rotY: 4.4, r: 0.3 },
];

// along the pavement (z 12.4 .. 14.0)
const LAMPS = [-38, -16, 11, 36].map(x => ({ x, z: 13.4 }));
const POLE = { x: 22, z: 13.3 };
const ZONE_SIGNS = [{ x: -6, z: 13.4 }, { x: 14, z: 13.4 }];
const ZEBRA_X = 2.0;                                       // centre of the zebra crossing (in line with the school steps)
const BUMPS_X = [-12, 16];

// ---------- collision boxes: [minX, maxX, minZ, maxZ] ----------
const R = (x, z, hw, hd = hw) => [x - hw, x + hw, z - hd, z + hd];

// New props you switch on below add their own box here.
const NEW_PROPS = [
  // have: true = the file is in props/ and is loaded. have: false = skipped (nothing loaded, nothing blocked).
  // maxXZ / height = size in metres, hw/hd = half width / half depth of the collision box, rotY turns it round (radians),
  // rotX stands up a model that was saved lying down.
  { have: true,  file: 'red_motorcycle.glb', maxXZ: 2.0, rotX: -Math.PI / 2, x: -21.5, z: 11.8, rotY: Math.PI / 2 + 0.15, hw: 1.0, hd: 0.45 },   // okada 1
  { have: true,  file: 'red_motorcycle.glb', maxXZ: 2.0, rotX: -Math.PI / 2, x: -18.9, z: 11.9, rotY: Math.PI / 2 - 0.1,  hw: 1.0, hd: 0.45 },   // okada 2
  { have: true,  file: 'hedge.glb', height: 0.9, x: 18.0, z: 9.9, rotY: 0, hw: 1.2, hd: 0.75 },                                               // hedge, east front corner
  { have: true,  file: 'hedge.glb', height: 0.9, x: 20.4, z: 9.9, rotY: 0, hw: 1.2, hd: 0.75 },
  { have: true,  file: 'hedge.glb', height: 0.9, x: 22.8, z: 9.9, rotY: 0, hw: 1.2, hd: 0.75 },
  { have: true,  file: 'bus_stop_shelter.glb', maxXZ: 3.0, x: 29.0, z: 13.0, rotY: 0, hw: 1.4, hd: 0.15 },                                      // bus stop on the pavement (turn with rotY if it faces the wrong way)
  { have: true,  file: 'sour_orange_optimised.glb', height: 4.5, x: 33.5, z: 10.3, rotY: 0, hw: 0.35, hd: 0.35 },                          // your sour orange tree, shrunk from 26 MB / 340,000 triangles to 1.4 MB / 18,000
  { have: false, file: 'school_bell_gong.glb', height: 1.8, x: -15.5, z: 6.5, rotY: 0, hw: 0.4, hd: 0.4 },                                       // optional, not got yet
];

export const HS_EXTERIOR_BOXES = [
  ...TREES.map(t => R(t.x, t.z, t.r)),
  R(FLAG.x, FLAG.z, 0.35),
  R(SIGN.x, SIGN.z, SIGN.w / 2, 0.2),
  R(TOWER.x, TOWER.z, 1.1), R(PUMP.x, PUMP.z, 1.0, 0.9),
  R(GEN.x, GEN.z, 1.3, 0.9),
  R(KIOSK.x, KIOSK.z, 1.4, 0.8),
  ...BENCHES.map(b => R(b.x, b.z, 1.05, 0.4)),
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => R(SHED.x + sx * (SHED.w / 2 - 0.15), SHED.z + sz * (SHED.d / 2 - 0.15), 0.12)),   // shed posts
  R(KEKE.x, KEKE.z, 1.4, 0.7),
  ...GOAL_X.flatMap(x => [R(x, PITCH.z - GOAL_HALF, 0.12), R(x, PITCH.z + GOAL_HALF, 0.12)]),
  ...LAMPS.map(l => R(l.x, l.z, 0.25)), R(POLE.x, POLE.z, 0.3),
  ...ZONE_SIGNS.map(s => R(s.x, s.z, 0.25)),
  ...NEW_PROPS.filter(p => p.have).map(p => R(p.x, p.z, p.hw, p.hd)),
];

// ---------- small helpers ----------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);       // radius 1, height 1: scale (r, h, r)
const std = (color, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const NG_GREEN = 0x0a7d3e;
const M = {
  concrete: std(0xbdb9ae, 0.95), white: std(0xf1efe8, 0.8), green: std(NG_GREEN, 0.8), steel: std(0x5b6168, 0.5, 0.5),
  dark: std(0x2a2c2f, 0.9), wood: std(0x7a5435, 0.9), soil: std(0x4b3626, 1), blue: std(0x2f5f9e, 0.6), yellow: std(0xf2c200, 0.7),
  plaster: std(0xe4dccb, 0.95), pole: std(0xd9d6cc, 0.7),
};
const polyOff = (m, f) => { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = f; return m; };

function canvasTex(w, h, paint, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
const fitText = (g, text, maxW, start, weight = 'bold') => {
  let size = start; do { g.font = `${weight} ${size}px Arial, sans-serif`; size -= 2; } while (g.measureText(text).width > maxW && size > 14);
};
let seed = 23;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const mesh = (parent, geo, mat, sx, sy, sz, x, y, z, { ry = 0, rx = 0, shadow = false } = {}) => {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
};
const box = (parent, mat, w, h, d, x, y, z, o) => mesh(parent, BOX, mat, w, h, d, x, y, z, o);
const cyl = (parent, mat, r, h, x, y, z, o) => mesh(parent, CYL, mat, r, h, r, x, y, z, o);

// loads one of your own .glb files (not in props_library.js), sizes it in metres, feet on the ground, centred
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
async function loadAny(file, { height, maxXZ, rotY = 0, rotX = 0 } = {}) {
  if (!modelCache.has(file)) modelCache.set(file, gltfLoader.loadAsync(PROPS_DIR + file));
  const gltf = await modelCache.get(file);
  const root = gltf.scene.clone(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = true;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && 'metalness' in m && m.metalness > 0.6 && !m.metalnessMap) m.metalness = 0.3; });
  });
  root.rotation.x = rotX;                       // stands up models that were exported lying down (Z-up)
  root.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(root);
  const size = b.getSize(new THREE.Vector3());
  let s = 1;
  if (height && size.y > 0) s = height / size.y; else if (maxXZ) s = maxXZ / Math.max(size.x, size.z, 1e-6);
  root.scale.multiplyScalar(s); root.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(root);
  const c = b.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -b.min.y, -c.z);
  const pivot = new THREE.Group(); pivot.add(root); pivot.rotation.y = rotY;
  const wrap = new THREE.Group(); wrap.add(pivot); return wrap;
}

// put a loaded thing at x, y, z. If it fails to load, log it and (optionally) show a stand-in.
const put = (parent, name, promise, x, y, z, fallback) =>
  promise.catch(e => { console.warn('high school exterior: could not load ' + name, e); return fallback ? fallback() : null; })
    .then(o => { if (!o) return null; o.position.set(x, y, z); parent.add(o); return o; });
const noShadow = o => { o.traverse(m => { if (m.isMesh) m.castShadow = false; }); return o; };

// corrugated zinc roof: a thin tilted sheet, high at the back (-z), low at the front (+z)
const zincBase = canvasTex(64, 64, (g, w, h) => {
  for (let i = 0; i < 4; i++) {
    const grad = g.createLinearGradient(i * 16, 0, i * 16 + 16, 0);
    grad.addColorStop(0, '#8f979c'); grad.addColorStop(0.5, '#d3d9dc'); grad.addColorStop(1, '#8f979c');
    g.fillStyle = grad; g.fillRect(i * 16, 0, 16, h);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(140,84,52,0.18)'; g.fillRect(rand() * w, rand() * h, 2 + rand() * 6, 1 + rand() * 3); }   // a little rust
});
function zincRoof(parent, cx, cy, cz, w, d, tilt = 0.1) {
  const t = zincBase.clone(); t.needsUpdate = true; t.repeat.set(w / 0.72, 1);
  const m = box(parent, std(0xffffff, 0.45, 0.35), w, 0.05, d / Math.cos(tilt), cx, cy, cz, { rx: tilt, shadow: true });
  m.material.map = t; return m;
}

// ---------- the build ----------

export function buildHighSchoolExterior() {
  const group = new THREE.Group();
  const updates = [];

  // ----- paved forecourt along the front of the school, and the path to the road -----
  const paving = (w, d) => {
    const t = canvasTex(64, 64, (g, pw, ph) => { g.fillStyle = '#bdb8ab'; g.fillRect(0, 0, pw, ph); g.strokeStyle = '#8f8a7e'; g.lineWidth = 3; g.strokeRect(0, 0, pw, ph); }, w / 1.0, d / 1.0);
    return polyOff(new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), -3);
  };
  const slab = (x0, x1, z0, z1) => box(group, paving(x1 - x0, z1 - z0), x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  slab(-16, PATH_X[0], 8.4, KERB_Z);            // forecourt, west of the steps
  slab(PATH_X[1], 16, 8.4, KERB_Z);             // forecourt, east of the steps
  slab(PATH_X[0], PATH_X[1], 10.8, 12.4);       // path from the steps to the pavement

  // ----- painted kerb along the front edge (low, green and white, you can step over it anywhere) -----
  const kerbXs = [];
  for (let x = -41.5; x <= 41.5; x += 1.0) if (!(x > PATH_X[0] - 0.7 && x < PATH_X[1] + 0.7)) kerbXs.push(x);
  const kerb = new THREE.InstancedMesh(BOX, std(0xffffff, 0.85), kerbXs.length);
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  kerbXs.forEach((x, i) => {
    dummy.position.set(x, 0.08, KERB_Z); dummy.scale.set(0.98, 0.16, 0.3); dummy.updateMatrix();
    kerb.setMatrixAt(i, dummy.matrix); kerb.setColorAt(i, tint.set(i % 2 ? NG_GREEN : 0xf1efe8));
  });
  kerb.instanceColor.needsUpdate = true; kerb.frustumCulled = false; kerb.receiveShadow = true; group.add(kerb);

  // ----- school signboard on two posts -----
  const boardTex = canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0a7d3e'; g.fillRect(0, 0, w, 150); g.fillRect(0, h - 26, w, 26);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; fitText(g, SCHOOL_NAME, w - 80, 84); g.fillText(SCHOOL_NAME, w / 2, 78);
    g.fillStyle = '#1b1b1b'; fitText(g, SCHOOL_MOTTO, w - 100, 52, 'normal'); g.fillText(SCHOOL_MOTTO, w / 2, 214);
    g.fillStyle = '#0a7d3e'; fitText(g, 'SCHOOL ZONE  \u00B7  PLEASE DRIVE SLOWLY', w - 100, 40); g.fillText('SCHOOL ZONE  \u00B7  PLEASE DRIVE SLOWLY', w / 2, 292);
  });
  const edge = std(0x2d2f33, 0.8);
  const board = new THREE.Mesh(BOX, [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7 }), std(0xd9d6cc, 0.9)]);
  board.scale.set(SIGN.w, SIGN.h, 0.12); board.position.set(SIGN.x, 1.45, SIGN.z); board.receiveShadow = true; group.add(board);
  [-1, 1].forEach(s => box(group, M.concrete, 0.22, 2.4, 0.22, SIGN.x + s * (SIGN.w / 2 - 0.3), 1.2, SIGN.z - 0.02));

  // ----- flagpole and the Nigerian flag (green, white, green) -----
  cyl(group, M.concrete, 0.38, 0.3, FLAG.x, 0.15, FLAG.z);
  cyl(group, M.green, 0.34, 0.1, FLAG.x, 0.3, FLAG.z);
  cyl(group, M.steel, 0.05, 9, FLAG.x, 4.5, FLAG.z);
  mesh(group, new THREE.SphereGeometry(1, 10, 8), M.yellow, 0.1, 0.1, 0.1, FLAG.x, 9.05, FLAG.z);
  const flagTex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#0a7d3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(w / 3, 0, w / 3, h); });
  const FW = 1.8, FH = 0.9;
  const flagGeo = new THREE.PlaneGeometry(FW, FH, 14, 3); flagGeo.translate(FW / 2, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(FLAG.x + 0.06, 8.45, FLAG.z); group.add(flag);
  const base = flagGeo.attributes.position.array.slice();
  updates.push(() => {
    const t = performance.now() / 1000, p = flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      p.setZ(i, Math.sin(bx * 3.4 - t * 4) * 0.1 * (bx / FW) + Math.sin(by * 5 - t * 3) * 0.02);
    }
    p.needsUpdate = true;
  });

  // ----- tyre planters (painted white or green) with flowers -----
  const tyreGeo = new THREE.TorusGeometry(0.26, 0.11, 10, 20).rotateX(Math.PI / 2);
  TYRES.forEach(([x, z, c]) => {
    const paint = c ? M.green : M.white;
    mesh(group, tyreGeo, paint, 1, 1, 1, x, 0.11, z); mesh(group, tyreGeo, paint, 1, 1, 1, x, 0.33, z);
    cyl(group, M.soil, 0.25, 0.05, x, 0.36, z);
    put(group, 'flower_clump', loadProp('flower_clump').then(noShadow), x, 0.38, z);
  });
  BUSHES.forEach(b => put(group, 'bush_flowers', loadProp('bush_flowers', { rotY: rand() * 6 }).then(noShadow), b.x, 0, b.z));

  // ----- "Veronica" hand-wash bucket on a stand, by the steps -----
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(group, M.steel, 0.04, 0.85, 0.04, BUCKET.x + sx * 0.17, 0.425, BUCKET.z + sz * 0.17));
  box(group, M.steel, 0.42, 0.04, 0.42, BUCKET.x, 0.87, BUCKET.z);
  cyl(group, M.white, 0.19, 0.34, BUCKET.x, 1.06, BUCKET.z);
  cyl(group, M.blue, 0.2, 0.04, BUCKET.x, 1.25, BUCKET.z);
  cyl(group, M.blue, 0.025, 0.1, BUCKET.x, 0.98, BUCKET.z + 0.22, { rx: Math.PI / 2 });

  // ----- borehole: pump house + water tank on a steel tower -----
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(group, M.steel, 0.12, 4.3, 0.12, TOWER.x + sx * 0.85, 2.15, TOWER.z + sz * 0.85, { shadow: true }));
  [1.4, 2.8].forEach(y => [[0, -0.85], [0, 0.85]].forEach(([, z]) => box(group, M.steel, 1.7, 0.06, 0.06, TOWER.x, y, TOWER.z + z)));
  box(group, M.steel, 2.2, 0.1, 2.2, TOWER.x, 4.35, TOWER.z, { shadow: true });
  [[-0.14, 0], [0.14, 0]].forEach(([dx]) => box(group, M.steel, 0.04, 4.3, 0.04, TOWER.x + dx, 2.15, TOWER.z + 1.05));        // ladder rails
  for (let y = 0.4; y < 4.3; y += 0.35) box(group, M.steel, 0.28, 0.03, 0.03, TOWER.x, y, TOWER.z + 1.05);                       // ladder rungs
  put(group, 'plastic_tank', loadProp('plastic_tank', { scale: 1.5 }).then(noShadow), TOWER.x, 4.4, TOWER.z,
    () => { const g = new THREE.Group(); cyl(g, M.dark, 0.8, 1.7, 0, 0.85, 0); return g; });
  box(group, M.plaster, 2.0, 1.9, 1.8, PUMP.x, 0.95, PUMP.z, { shadow: true });
  box(group, M.blue, 0.8, 1.6, 0.06, PUMP.x, 0.8, PUMP.z + 0.92);
  zincRoof(group, PUMP.x, 2.0, PUMP.z, 2.3, 2.1, 0.12);
  cyl(group, M.steel, 0.05, 1.2, PUMP.x + 1.25, 0.6, PUMP.z + 0.4);                                                               // pipe from the pump house

  // ----- generator under a small roof -----
  box(group, M.concrete, 2.6, 0.08, 1.8, GEN.x, 0.04, GEN.z);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(group, M.steel, 0.08, 1.9, 0.08, GEN.x + sx * 1.2, 0.95, GEN.z + sz * 0.8));
  zincRoof(group, GEN.x, 1.95, GEN.z, 2.8, 2.0, 0.08);
  put(group, 'generator', loadAny('generator.glb', { maxXZ: 1.1 }), GEN.x, 0.08, GEN.z,
    () => { const g = new THREE.Group(); box(g, std(0xc2452d, 0.6), 1.0, 0.7, 0.6, 0, 0.35, 0); return g; });

  // ----- tuck shop: zinc-roof shed, kiosk, benches, signboard -----
  box(group, M.concrete, SHED.w, 0.06, SHED.d, SHED.x, 0.03, SHED.z);
  [[-1, -1, 3.1], [1, -1, 3.1], [-1, 1, 2.7], [1, 1, 2.7]].forEach(([sx, sz, h]) =>
    box(group, M.wood, 0.14, h, 0.14, SHED.x + sx * (SHED.w / 2 - 0.15), h / 2, SHED.z + sz * (SHED.d / 2 - 0.15), { shadow: true }));
  zincRoof(group, SHED.x, 2.9, SHED.z, SHED.w + 0.5, SHED.d + 0.3, 0.1);
  const tuckTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#0a7d3e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.font = 'bold 54px Arial, sans-serif'; g.fillText('TUCK SHOP', w / 2, 46);
    g.fillStyle = '#ffe9a0'; g.font = '28px Arial, sans-serif'; g.fillText('Pure Water  \u00B7  Meat Pie  \u00B7  Bread', w / 2, 94);
  });
  const tuck = new THREE.Mesh(BOX, [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: tuckTex, roughness: 0.7 }), edge]);
  tuck.scale.set(3.2, 0.8, 0.05); tuck.position.set(SHED.x, 2.2, SHED.z + SHED.d / 2 - 0.05); group.add(tuck);
  put(group, 'kiosk', loadAny('kiosk_wooden.glb', { height: 2.3 }), KIOSK.x, 0.06, KIOSK.z,
    () => { const g = new THREE.Group(); box(g, M.wood, 2.4, 2.2, 1.4, 0, 1.1, 0); return g; });
  BENCHES.forEach(b => put(group, 'bench_3seat', loadProp('bench_3seat').then(noShadow), b.x, 0.06, b.z));

  // ----- football pitch on laterite, painted lines, two goals -----
  const dirt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9794c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(226,160,106,0.30)' : 'rgba(140,82,48,0.30)'; g.beginPath(); g.arc(rand() * w, rand() * h, 10 + rand() * 30, 0, 6.3); g.fill(); }
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(96,128,60,0.35)'; g.beginPath(); g.arc(rand() * w, rand() * h, 6 + rand() * 18, 0, 6.3); g.fill(); }   // patchy grass
  }, (PITCH.len + 2) / 8, (PITCH.wid + 2) / 8);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.len + 2, PITCH.wid + 2), polyOff(new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }), -3));
  field.rotation.x = -Math.PI / 2; field.position.set(PITCH.x, 0.015, PITCH.z); field.receiveShadow = true; group.add(field);
  const PX = 42;                                                                    // canvas pixels per metre
  const linesTex = canvasTex(PITCH.len * PX, PITCH.wid * PX, (g, w, h) => {
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 7;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, h - 4); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 3.2 * PX, 0, 6.3); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 9, 0, 6.3); g.fill();
    [0, 1].forEach(side => {
      const bx = side ? w - 4 - 4 * PX : 4, gx = side ? w - 4 - 1.5 * PX : 4;
      g.strokeRect(bx, h / 2 - 5 * PX, 4 * PX, 10 * PX); g.strokeRect(gx, h / 2 - 2.75 * PX, 1.5 * PX, 5.5 * PX);
    });
  });
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.len, PITCH.wid), polyOff(new THREE.MeshStandardMaterial({ map: linesTex, transparent: true, roughness: 1 }), -5));
  lines.rotation.x = -Math.PI / 2; lines.position.set(PITCH.x, 0.02, PITCH.z); group.add(lines);
  // your goal model (the mouth faces +z in the file; the net is behind it). Plain white goal posts show if the file is missing.
  const plainGoal = dir => () => {
    const g = new THREE.Group();
    [-GOAL_HALF, GOAL_HALF].forEach(dz => cyl(g, M.white, 0.06, 2.1, 0, 1.05, dz));
    cyl(g, M.white, 0.06, GOAL_HALF * 2, 0, 2.1, 0, { rx: Math.PI / 2 });
    [-GOAL_HALF, GOAL_HALF].forEach(dz => box(g, M.white, 1.2, 0.04, 0.04, -dir * 0.6, 2.08, dz));
    return g;
  };
  GOAL_X.forEach((x, i) => {
    const dir = i === 0 ? 1 : -1;                                  // +1: the goal faces east into the pitch, -1: it faces west
    put(group, 'goal', loadAny(GOAL_FILE, { maxXZ: 5.2, rotY: dir * Math.PI / 2 }), x - dir * 1.1, 0, PITCH.z, plainGoal(dir));
  });

  // ----- trees -----
  (async () => {
    for (const t of TREES) {
      try { const o = noShadow(await loadProp(t.name, { rotY: t.rotY })); o.position.set(t.x, 0, t.z); group.add(o); }
      catch (e) { console.warn('high school exterior: tree not loaded (' + t.name + ')', e); break; }
    }
  })();

  // ----- keke parked at the front (your Indian tuk-tuk model stands in until you get a Nigerian keke, see the props list) -----
  put(group, 'keke', loadAny(KEKE_FILE, { maxXZ: 2.7, rotY: KEKE.rotY }), KEKE.x, 0, KEKE.z);

  // ----- road: zebra crossing, speed bumps, SCHOOL signs, lamps, pole (the main road is at z 14.0 .. 17.5 here) -----
  const zebraMat = polyOff(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9 }), -8);
  for (let i = -4; i <= 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3.1), zebraMat);
    s.rotation.x = -Math.PI / 2; s.position.set(ZEBRA_X + i * 0.8, 0.012, 15.75); s.receiveShadow = true; group.add(s);
  }
  BUMPS_X.forEach(x => {
    box(group, polyOff(std(0xf2c200, 0.8), -4), 0.55, 0.07, 3.4, x, 0.02, 15.75);
    box(group, polyOff(std(0x1d1d1d, 0.8), -6), 0.12, 0.075, 3.4, x, 0.02, 15.75);
  });
  const zoneTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 12; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 62px Arial, sans-serif'; g.fillText('SCHOOL', w / 2, h * 0.38);
    g.font = 'bold 40px Arial, sans-serif'; g.fillText('SLOW', w / 2, h * 0.68);
  });
  ZONE_SIGNS.forEach(s => {
    cyl(group, M.steel, 0.04, 2.6, s.x, 1.3, s.z);
    const d = new THREE.Mesh(BOX, [M.steel, M.steel, M.steel, M.steel, new THREE.MeshStandardMaterial({ map: zoneTex, roughness: 0.6 }), M.steel]);
    d.scale.set(0.75, 0.75, 0.03); d.position.set(s.x, 2.45, s.z + 0.05); d.rotation.z = Math.PI / 4; group.add(d);
  });
  LAMPS.forEach(l => put(group, 'street_lamp', loadAny('street_lamp.glb', { height: 6.5 }), l.x, 0, l.z));
  put(group, 'electric_pole', loadAny('electric_pole.glb', { height: 9 }), POLE.x, 0, POLE.z);

  // ----- new props you add later (see the props list file) -----
  NEW_PROPS.filter(p => p.have).forEach(p =>
    put(group, p.file, loadAny(p.file, { height: p.height, maxXZ: p.maxXZ, rotY: p.rotY || 0, rotX: p.rotX || 0 }), p.x, 0, p.z));

  return { group, update: () => updates.forEach(f => f()) };
}
