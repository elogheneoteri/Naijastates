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
//               flagpole with a waving Nigerian flag, white-painted tyre planters with flowers.
//   West wing:  tuck shop under a zinc-roof shed (kiosk, two outdoor benches), borehole house + water tank on its steel stand,
//               generator under its own small roof, mango trees. Every roof is your zinc_roof.glb and every post is your iron rod.
//   East wing:  football pitch on laterite with painted lines and two goals, mango trees.
//   Road:       zebra crossing, two speed bumps, two SCHOOL signs, street lamps, an electric pole.
//
// PROPS USED FROM YOUR UPLOAD (nothing new needed to run this):
//   mango_tree, coconut_palm, plastic_tank, bush_flowers, flower_clump   (props_library.js)
//   kiosk_wooden.glb, generator.glb, street_lamp.glb, electric_pole.glb   (props/ folder)
//   NEW in props/:  zinc_roof.glb (all roofs), free_iron_rod.glb (all posts and beams), water_tank_stand.glb (the tank stand, cut from your water_tank.glb),
//                   old_outdoor_bench_optimised.glb (tuck shop benches, your old_outdoor_bench.glb shrunk from 3 MB to 116 KB)
// Everything else (signboard, flag, tyres, goals, markings) is built in code.
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
const TYRES = [[-3.9, 10.3, 0], [-4.8, 10.3, 1], [-5.7, 10.3, 0], [6.6, 10.3, 0], [7.5, 10.3, 1], [8.4, 10.3, 0]];   // x, z, colour (0 white, 1 green)
const BUSHES = [8.0, 9.8, 11.6, 13.4].map(x => ({ x, z: 9.2 }));

const TOWER = { x: -20.5, z: -7.0 };        // water tank on its steel stand
const STAND_FILE = 'water_tank_stand.glb';   // the stand cut from your water_tank.glb (legs lengthened so it is a proper tower)
const PUMP = { x: -23.6, z: -7.4 };         // borehole pump house
const GEN = { x: -18.2, z: 3.0 };           // generator shed
const SHED = { x: -31.0, z: 4.2, w: 7.2, d: 3.6 };   // tuck-shop shed
const KIOSK = { x: -32.8, z: 2.9 };
const BENCHES = [{ x: -30.4, z: 5.2 }, { x: -28.4, z: 5.2 }];
const BENCH_FILE = 'old_outdoor_bench_optimised.glb';   // your old outdoor bench; made 1.9 m long and a normal seat height (0.42 m)

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
const POLE = { x: -27, z: 13.5 };             // electric pole on the pavement, well away from the football pitch
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
  { have: true,  file: 'hedge.glb', height: 0.9, x: 18.0, z: 9.9, rotY: 0, hw: 1.2, hd: 0.75 },                                               // hedge, east front corner
  { have: true,  file: 'hedge.glb', height: 0.9, x: 20.4, z: 9.9, rotY: 0, hw: 1.2, hd: 0.75 },
  { have: true,  file: 'hedge.glb', height: 0.9, x: 22.8, z: 9.9, rotY: 0, hw: 1.2, hd: 0.75 },
  // bus stop: the open side of your model is +X, so rotY -90 degrees turns it to face the road. The solid box is only the back panel.
  { have: true,  file: 'bus_stop_shelter.glb', maxXZ: 2.8, x: 29.0, z: 12.1, rotY: -Math.PI / 2, hw: 1.4, hd: 0.2, boxDz: -0.5 },
  { have: true,  file: 'sour_orange_optimised.glb', height: 4.5, x: 33.5, z: 10.3, rotY: 0, hw: 0.35, hd: 0.35 },                          // your sour orange tree, shrunk from 26 MB / 340,000 triangles to 1.4 MB / 18,000
  { have: false, file: 'school_bell_gong.glb', height: 1.8, x: -15.5, z: 6.5, rotY: 0, hw: 0.4, hd: 0.4 },                                       // optional, not got yet
];

export const HS_EXTERIOR_BOXES = [
  ...TREES.map(t => R(t.x, t.z, t.r)),
  R(FLAG.x, FLAG.z, 0.35),
  R(SIGN.x, SIGN.z, SIGN.w / 2, 0.2),
  R(TOWER.x, TOWER.z, 0.95), R(PUMP.x, PUMP.z, 1.0, 0.9),
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => R(PUMP.x + sx * 1.1, PUMP.z + sz * 0.95, 0.1)),   // borehole shed posts
  R(GEN.x, GEN.z, 1.3, 0.9),
  R(KIOSK.x, KIOSK.z, 1.4, 0.8),
  ...BENCHES.map(b => R(b.x, b.z, 0.95, 0.3)),
  ...[-1, 0, 1].flatMap(sx => [-1, 1].map(sz => R(SHED.x + sx * (SHED.w / 2 - 0.15), SHED.z + sz * (SHED.d / 2 - 0.15), 0.12))),   // shed posts
  ...GOAL_X.flatMap(x => [R(x, PITCH.z - GOAL_HALF, 0.12), R(x, PITCH.z + GOAL_HALF, 0.12)]),
  ...LAMPS.map(l => R(l.x, l.z, 0.25)), R(POLE.x, POLE.z, 0.3),
  ...ZONE_SIGNS.map(s => R(s.x, s.z, 0.25)),
  ...NEW_PROPS.filter(p => p.have).map(p => R(p.x, p.z + (p.boxDz || 0), p.hw, p.hd)),
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
// foot: true     = the model's BASE (not the middle of the whole model) sits exactly on x, z. Use it for poles and lamps with arms.
// armToward: true = a lamp's arm is turned to point toward +z (the road)    alongX: true = the long way of the model runs along x
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
function footPoint(root, b) {                       // x/z middle of the lowest 4% of the model = where the pole stands
  const lim = b.min.y + (b.max.y - b.min.y) * 0.04, v = new THREE.Vector3();
  let sx = 0, sz = 0, n = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y <= lim) { sx += v.x; sz += v.z; n++; } }
  });
  return n ? new THREE.Vector3(sx / n, b.min.y, sz / n) : b.getCenter(new THREE.Vector3()).setY(b.min.y);
}
async function loadAny(file, { height, maxXZ, rotY = 0, rotX = 0, rotZ = 0, foot = false, armToward = false, alongX = false } = {}) {
  if (!modelCache.has(file)) modelCache.set(file, gltfLoader.loadAsync(PROPS_DIR + file));
  const gltf = await modelCache.get(file);
  const root = gltf.scene.clone(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = true;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && 'metalness' in m && m.metalness > 0.6 && !m.metalnessMap) m.metalness = 0.3; });
  });
  root.rotation.x = rotX; root.rotation.z = rotZ;   // stands up models that were exported lying down
  root.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(root);
  const size = b.getSize(new THREE.Vector3());
  let s = 1;
  if (height && size.y > 0) s = height / size.y; else if (maxXZ) s = maxXZ / Math.max(size.x, size.z, 1e-6);
  root.scale.multiplyScalar(s); root.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(root);
  const mid = b.getCenter(new THREE.Vector3());
  const c = foot ? footPoint(root, b) : mid;
  root.position.set(-c.x, -b.min.y, -c.z);
  let spin = rotY;
  if (alongX && (b.max.z - b.min.z) > (b.max.x - b.min.x)) spin += Math.PI / 2;
  if (armToward) { const dx = mid.x - c.x, dz = mid.z - c.z; if (Math.hypot(dx, dz) > 0.3) spin += -Math.atan2(dx, dz); }
  const pivot = new THREE.Group(); pivot.add(root); pivot.rotation.y = spin;
  const wrap = new THREE.Group(); wrap.add(pivot); return wrap;
}

// put a loaded thing at x, y, z. If it fails to load, log it and (optionally) show a stand-in.
const put = (parent, name, promise, x, y, z, fallback) =>
  promise.catch(e => { console.warn('high school exterior: could not load ' + name, e); return fallback ? fallback() : null; })
    .then(o => { if (!o) return null; o.position.set(x, y, z); parent.add(o); return o; });
const noShadow = o => { o.traverse(m => { if (m.isMesh) m.castShadow = false; }); return o; };

// ---------- your iron rod (free_iron_rod.glb): every post and beam ----------
const ROD_FILE = 'free_iron_rod.glb';
let rodPromise = null;
function getRod() {
  if (!rodPromise) rodPromise = gltfLoader.loadAsync(PROPS_DIR + ROD_FILE).then(g => {
    const root = g.scene; root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3());
    root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    root.position.sub(c);                                  // rod centred on its own middle, long way along x
    const tpl = new THREE.Group(); tpl.add(root);
    return { tpl, size: b.getSize(new THREE.Vector3()) };
  });
  return rodPromise;
}
// one rod, centred at x, y, z. dir 'y' = standing post, 'x' / 'z' = beam. len and thick in metres.
function addRod(parent, dir, len, x, y, z, thick = 0.1) {
  return getRod().then(({ tpl, size }) => {
    const inner = tpl.clone(true);
    inner.scale.set(len / size.x, thick / size.y, thick / size.z);
    const g = new THREE.Group(); g.add(inner);
    if (dir === 'y') g.rotation.z = Math.PI / 2; else if (dir === 'z') g.rotation.y = Math.PI / 2;
    g.position.set(x, y, z); parent.add(g); return g;
  }).catch(e => { console.warn('high school exterior: could not load ' + ROD_FILE, e); return null; });
}
const roofY = (cy, cz, tilt, z) => cy - (z - cz) * Math.tan(tilt);     // height of a roof (high at the back, low at the front) at depth z

// ---------- your zinc roof (zinc_roof.glb): real corrugated sheets laid side by side ----------
const ROOF_FILE = 'zinc_roof.glb';
let sheetPromise = null;
function loadSheets() {
  if (!sheetPromise) sheetPromise = gltfLoader.loadAsync(PROPS_DIR + ROOF_FILE).then(g => {
    g.scene.updateMatrixWorld(true);
    const out = {};
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox();
      const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -c.y, -c.z);                    // sheet centred, width along x, length along z
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      mat.side = THREE.DoubleSide;
      if ('metalness' in mat && mat.metalness > 0.6 && !mat.metalnessMap) mat.metalness = 0.4;
      out[/rust/i.test(mat.name || o.name) ? 'rust' : 'plain'] = { geo, mat, w: bb.max.x - bb.min.x, l: bb.max.z - bb.min.z };
    });
    return out;
  });
  return sheetPromise;
}
// jobs: [cx, cy, cz, width, depth, tilt]. The roof is high at the back (-z) and low at the front (+z).
function buildRoofs(parent, jobs) {
  loadSheets().then(sh => {
    const kinds = ['plain', 'rust'].filter(k => sh[k]);
    if (!kinds.length) return;
    const lists = { plain: [], rust: [] }, o = new THREE.Object3D();
    jobs.forEach(([cx, cy, cz, w, d, tilt]) => {
      const n = Math.max(1, Math.round(w / 0.82)), pitch = w / n, len = d / Math.cos(tilt) + 0.3;
      for (let i = 0; i < n; i++) {
        let k = (i * 7 + Math.round(cx * 3)) % 6 === 4 ? 'rust' : 'plain';     // a rusty sheet here and there
        if (!sh[k]) k = kinds[0];
        o.position.set(cx - w / 2 + pitch * (i + 0.5), cy, cz); o.rotation.set(tilt, 0, 0);
        o.scale.set((pitch + 0.06) / sh[k].w, 1, len / sh[k].l);              // 6 cm overlap between sheets
        o.updateMatrix(); lists[k].push(o.matrix.clone());
      }
    });
    kinds.forEach(k => {
      if (!lists[k].length) return;
      const im = new THREE.InstancedMesh(sh[k].geo, sh[k].mat, lists[k].length);
      lists[k].forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; parent.add(im);
    });
  }).catch(e => console.warn('high school exterior: could not load ' + ROOF_FILE, e));
}

// ---------- the build ----------

export function buildHighSchoolExterior() {
  const group = new THREE.Group();
  const updates = [];
  const roofs = [];                                        // every roof is collected here and built from zinc_roof.glb at the end
  const zincRoof = (cx, cy, cz, w, d, tilt) => roofs.push([cx, cy, cz, w, d, tilt]);

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

  // ----- borehole: pump house + water tank standing on the stand from your water_tank.glb -----
  (async () => {
    const tank = noShadow(await loadProp('plastic_tank', { scale: 1.5 }).catch(e => { console.warn('high school exterior: tank not loaded', e); return null; }) || new THREE.Group());
    let top = 0;
    try {
      const ts = new THREE.Box3().setFromObject(tank).getSize(new THREE.Vector3());
      const stand = await loadAny(STAND_FILE, { maxXZ: Math.max(ts.x, ts.z, 1.2) * 1.12 });      // stand a little wider than the tank
      top = new THREE.Box3().setFromObject(stand).max.y;
      stand.position.set(TOWER.x, 0, TOWER.z); group.add(stand);
    } catch (e) { console.warn('high school exterior: could not load ' + STAND_FILE, e); }
    tank.position.set(TOWER.x, top - 0.02, TOWER.z); group.add(tank);
  })();
  box(group, M.plaster, 2.0, 1.9, 1.8, PUMP.x, 0.95, PUMP.z, { shadow: true });
  box(group, M.blue, 0.8, 1.6, 0.06, PUMP.x, 0.8, PUMP.z + 0.92);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {          // iron rod posts at the four roof corners
    const h = roofY(2.06, PUMP.z, 0.12, PUMP.z + sz * 0.95) - 0.05;
    addRod(group, 'y', h, PUMP.x + sx * 1.1, h / 2, PUMP.z + sz * 0.95, 0.1);
  });
  [-0.95, 0.95].forEach(dz => addRod(group, 'x', 2.3, PUMP.x, roofY(2.06, PUMP.z, 0.12, PUMP.z + dz) - 0.1, PUMP.z + dz, 0.08));   // beams under the roof
  zincRoof(PUMP.x, 2.06, PUMP.z, 2.3, 2.1, 0.12);
  cyl(group, M.steel, 0.05, 1.2, PUMP.x + 1.25, 0.6, PUMP.z + 0.4);                                                               // pipe from the pump house

  // ----- generator under a small roof -----
  box(group, M.concrete, 2.6, 0.08, 1.8, GEN.x, 0.04, GEN.z);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const h = roofY(1.95, GEN.z, 0.08, GEN.z + sz * 0.8) - 0.05;
    addRod(group, 'y', h, GEN.x + sx * 1.2, h / 2, GEN.z + sz * 0.8, 0.09);
  });
  [-0.8, 0.8].forEach(dz => addRod(group, 'x', 2.5, GEN.x, roofY(1.95, GEN.z, 0.08, GEN.z + dz) - 0.09, GEN.z + dz, 0.07));   // beams under the roof
  zincRoof(GEN.x, 1.95, GEN.z, 2.8, 2.0, 0.08);
  put(group, 'generator', loadAny('generator.glb', { maxXZ: 1.1 }), GEN.x, 0.08, GEN.z,
    () => { const g = new THREE.Group(); box(g, std(0xc2452d, 0.6), 1.0, 0.7, 0.6, 0, 0.35, 0); return g; });

  // ----- tuck shop: zinc-roof shed, kiosk, benches (no platform, no signboard) -----
  [-1, 0, 1].forEach(sx => [-1, 1].forEach(sz => {
    const z = SHED.z + sz * (SHED.d / 2 - 0.15), h = roofY(2.9, SHED.z, 0.1, z) - 0.05;
    addRod(group, 'y', h, SHED.x + sx * (SHED.w / 2 - 0.15), h / 2, z, 0.12);
  }));
  [-1, 1].forEach(sz => {                                  // beams along the front and back, under the roof
    const z = SHED.z + sz * (SHED.d / 2 - 0.15);
    addRod(group, 'x', SHED.w, SHED.x, roofY(2.9, SHED.z, 0.1, z) - 0.1, z, 0.09);
  });
  zincRoof(SHED.x, 2.9, SHED.z, SHED.w + 0.5, SHED.d + 0.3, 0.1);
  put(group, 'kiosk', loadAny('kiosk_wooden.glb', { height: 2.3 }), KIOSK.x, 0, KIOSK.z);
  BENCHES.forEach(b => put(group, 'bench', loadAny(BENCH_FILE, { maxXZ: 1.9 }).then(o => { o.scale.y = 1.35; return o; }), b.x, 0, b.z));   // taller legs so the seat is about 0.42 m

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
  const zoneTex = canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 12; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 60px Arial, sans-serif'; g.fillText('SCHOOL', w / 2, h * 0.24);
    g.font = 'bold 60px Arial, sans-serif'; g.fillText('ZONE', w / 2, h * 0.46);
    g.fillRect(34, h * 0.58, w - 68, 8);
    g.fillStyle = '#b3121a'; g.font = 'bold 72px Arial, sans-serif'; g.fillText('SLOW', w / 2, h * 0.76);
  });
  ZONE_SIGNS.forEach(s => {                                  // flat, upright plate on a post, facing the road (+z)
    addRod(group, 'y', 2.8, s.x, 1.4, s.z, 0.1);
    const d = new THREE.Mesh(BOX, [M.steel, M.steel, M.steel, M.steel, new THREE.MeshStandardMaterial({ map: zoneTex, roughness: 0.6 }), M.steel]);
    d.scale.set(0.8, 1.0, 0.03); d.position.set(s.x, 2.2, s.z + 0.06); group.add(d);
  });
  // foot: true = the BASE of the pole stands on the pavement spot; armToward = the lamp arm reaches over the road; alongX = pole cross-arms run along the road
  LAMPS.forEach(l => put(group, 'street_lamp', loadAny('street_lamp.glb', { height: 6.5, foot: true, armToward: true }), l.x, 0, l.z));
  put(group, 'electric_pole', loadAny('electric_pole.glb', { height: 9, foot: true, alongX: true }), POLE.x, 0, POLE.z);

  // ----- new props you add later (see the props list file) -----
  NEW_PROPS.filter(p => p.have).forEach(p =>
    put(group, p.file, loadAny(p.file, { height: p.height, maxXZ: p.maxXZ, rotY: p.rotY || 0, rotX: p.rotX || 0 }), p.x, 0, p.z));

  buildRoofs(group, roofs);
  return { group, update: () => updates.forEach(f => f()) };
}
