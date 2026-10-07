// high_school_interior.js  (STEP 3: the ground floor of the DELTA HIGH SCHOOL, built like the immigration office)
//
// Local space: the school's centre is (0,0). The front door is on the +Z (south) wall, facing the road. The rooms fill the school's
// footprint (x -14.6..14.6, z -9.7..8.2, measured from the model), so the player never teleports: game.js hides the outside model
// and shows this interior while the player is inside.
//
//   buildHighSchoolInterior() -> { group, marker, halfW, halfD, cz, setInside(bool), setCamera(relX, relZ) }
//   HS_INTERIOR_BOXES         -> solid parts (walls with doorways, desks, counter ...) for game.js collisions
//
// FLOOR PLAN (north is -Z, the front door is at the bottom):
//
//   +--------+--------+--------+--------+
//   | JSS 1A | JSS 1B | JSS 2A | JSS 2B |     4 classrooms: board on the north wall, 9 two-seater desks, teacher's table
//   +--[ ]---+--[ ]---+--[ ]---+--[ ]---+
//   |            CORRIDOR (3 m)         |
//   +------+---------------------+------+
//   |BOYS  |  HALL / RECEPTION   |GIRLS |     toilets open onto the corridor
//   |TOILET|  desk, benches,     |TOILET|
//   +------+  trophy cabinet     +------+
//   |STORE |        [front door] |PRINC.|     cleaners' store (west), principal's office (east), both open onto the hall
//   +------+---------------------+------+
//
// Props used from your upload: reception_desk.glb, toilet_stalls_4.glb, pbr_material_floor_tiles.glb (floor), gta_marker_blue.glb.
// From props_library.js: office_chair, personal_computer, standing_fan, water_dispenser, filing_cabinet, bench_3seat, toilet, sink_wall,
// fire_extinguisher, plant_pot, plant_monstera, bin_office.
// New (shrunk by me): globe_optimised.glb, water_drum_optimised.glb, bucket_optimised.glb, bookshelf_optimised.glb.
// Built in code: walls, desks, boards, teacher tables, trophy cabinet, notice boards, plaques, principal's desk, flag stand, door signs.
//
// If you move the front door (the doorway in the south wall): change DOOR_X below. It is centred on the steps now (x = 1.9).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { loadProp, PROPS_DIR } from './props_library.js';

// ---------- size and layout (metres, school centre = 0,0) ----------

const X0 = -14.6, X1 = 14.6, Z0 = -9.7, Z1 = 8.2;          // the school's footprint (outer faces of the walls)
export const HALF_W = 14.6, HALF_D = 8.95, CZ = -0.75;      // half sizes and the z of the middle of the footprint (game.js uses these)
const WALL_H = 3.1, LOW_H = 1.1, DOOR_H = 2.2, GAP = 1.3;
const T_OUT = 0.24, T_IN = 0.2;
const DOOR_X = 1.9, DOOR_HALF = 1.3;                        // front doorway: centre and half width

const N_IN = Z0 + T_OUT, S_IN = Z1 - T_OUT, W_IN = X0 + T_OUT, E_IN = X1 - T_OUT;   // inner faces of the outer walls

const Z_CLASS = -3.7;                                       // wall between the classrooms and the corridor
const Z_TOI = -0.7;                                         // wall between the corridor and the hall / toilets
const Z_STORE = 4.5;                                        // wall between the toilets and the store / principal's office
const X_TW = -10.6, X_TE = 10.6;                            // inner walls of the west and east blocks
const CLASS_X = [X0, -7.3, 0, 7.3, X1];
const CLASS_C = [-10.95, -3.65, 3.65, 10.95];               // classroom centres (the doorway of each is here)
const CLASS_NAMES = ['JSS 1A', 'JSS 1B', 'JSS 2A', 'JSS 2B'];
const DOOR_TOI = 12.6;                                      // toilet doorways at x = -12.6 and +12.6
const DOOR_SIDE_Z = 6.35;                                   // doorways of the store and the principal's office (on the hall side)

const ROOMS = {
  c1: { x0: CLASS_X[0], x1: CLASS_X[1], z0: Z0, z1: Z_CLASS }, c2: { x0: CLASS_X[1], x1: CLASS_X[2], z0: Z0, z1: Z_CLASS },
  c3: { x0: CLASS_X[2], x1: CLASS_X[3], z0: Z0, z1: Z_CLASS }, c4: { x0: CLASS_X[3], x1: CLASS_X[4], z0: Z0, z1: Z_CLASS },
  tb: { x0: X0, x1: X_TW, z0: Z_TOI, z1: Z_STORE }, tg: { x0: X_TE, x1: X1, z0: Z_TOI, z1: Z_STORE },
  store: { x0: X0, x1: X_TW, z0: Z_STORE, z1: Z1 }, prin: { x0: X_TE, x1: X1, z0: Z_STORE, z1: Z1 },
};

const IN_WALLS = [
  ...[0, 1, 2, 3].map(i => ({ rooms: ['c' + (i + 1)], alongX: true, fixed: Z_CLASS, from: CLASS_X[i], to: CLASS_X[i + 1], gaps: [CLASS_C[i]] })),
  { rooms: ['c1', 'c2'], alongX: false, fixed: CLASS_X[1], from: Z0, to: Z_CLASS, gaps: [] },
  { rooms: ['c2', 'c3'], alongX: false, fixed: CLASS_X[2], from: Z0, to: Z_CLASS, gaps: [] },
  { rooms: ['c3', 'c4'], alongX: false, fixed: CLASS_X[3], from: Z0, to: Z_CLASS, gaps: [] },
  // boys toilet (west) and store
  { rooms: ['tb'], alongX: true, fixed: Z_TOI, from: X0, to: X_TW, gaps: [-DOOR_TOI] },
  { rooms: ['tb'], alongX: false, fixed: X_TW, from: Z_TOI, to: Z_STORE, gaps: [] },
  { rooms: ['tb', 'store'], alongX: true, fixed: Z_STORE, from: X0, to: X_TW, gaps: [] },
  { rooms: ['store'], alongX: false, fixed: X_TW, from: Z_STORE, to: Z1, gaps: [DOOR_SIDE_Z] },
  // girls toilet (east) and principal's office
  { rooms: ['tg'], alongX: true, fixed: Z_TOI, from: X_TE, to: X1, gaps: [DOOR_TOI] },
  { rooms: ['tg'], alongX: false, fixed: X_TE, from: Z_TOI, to: Z_STORE, gaps: [] },
  { rooms: ['tg', 'prin'], alongX: true, fixed: Z_STORE, from: X_TE, to: X1, gaps: [] },
  { rooms: ['prin'], alongX: false, fixed: X_TE, from: Z_STORE, to: Z1, gaps: [DOOR_SIDE_Z] },
];

// Classroom: students sit on the benches facing NORTH (the board is on the north wall). 3 columns x 3 rows of two-seater desks.
const DESK_COLS = [-2.1, 0, 2.1];
const DESK_ROWS = [-7.3, -6.3, -5.3];
const DESK_W = 1.2;
const TEACHER_Z = -8.5;
// Hall
const RECEPTION = { x: -4.5, z: 3.0 }, REC_W = 2.6;          // counter faces south (toward the door); staff chair behind it
const BENCHES = [{ x: 9.6, z: 1.2 }, { x: 9.6, z: 3.4 }];    // waiting benches along the east side, facing west
const TROPHY = { x: -8.0, z: S_IN - 0.25 };                  // trophy cabinet against the south wall
// Toilets: your 4-stall block, against the south wall of each toilet room, opening north. Numbers measured from toilet_stalls_4.glb.
const STALL_FILE = 'toilet_stalls_4.glb';
const STALL_W = 3.151, STALL_D = 1.641;
const STALL_WC = [-1.1625, -0.395, 0.3725, 1.1425];
const STALL_PLANES = [-1.5475, -0.7775, -0.0125, 0.7525, 1.5275];
const Z_TS = Z_STORE - T_IN / 2;                             // inner face of the toilets' south wall
const STALL_BLOCKS = [{ room: 'tb', cx: W_IN + STALL_W / 2 }, { room: 'tg', cx: E_IN - STALL_W / 2 }];
const STALL_CZ = Z_TS - STALL_D / 2;
const WC = STALL_BLOCKS.flatMap(b => STALL_WC.map(o => ({ x: b.cx - o, z: Z_TS - 0.33 })));
const SINKS = [{ x: X_TW - T_IN / 2 - 0.27, z: 1.0, rot: -Math.PI / 2 }, { x: X_TE + T_IN / 2 + 0.27, z: 1.0, rot: Math.PI / 2 }];
// Principal's office (SE corner)
const PRIN_DESK = { x: 13.3, z: 6.3 };
const PRIN_SHELF = { x: 12.5, z: S_IN - 0.29 };

// ---------- collision boxes: [minX, maxX, minZ, maxZ] ----------

const spans = (from, to, gaps) => {
  const out = []; let a = from;
  [...gaps].sort((p, q) => p - q).forEach(g => { if (g - GAP / 2 > a) out.push([a, g - GAP / 2]); a = g + GAP / 2; });
  if (to > a) out.push([a, to]);
  return out;
};
const R = (x, z, hw, hd = hw) => [x - hw, x + hw, z - hd, z + hd];

export const HS_INTERIOR_BOXES = [
  // outer walls (the south wall has the front doorway)
  [X0 - 0.2, X1 + 0.2, Z0 - 0.2, N_IN],
  [X0 - 0.2, DOOR_X - DOOR_HALF, S_IN, Z1 + 0.2], [DOOR_X + DOOR_HALF, X1 + 0.2, S_IN, Z1 + 0.2],
  [X0 - 0.2, W_IN, Z0, Z1], [E_IN, X1 + 0.2, Z0, Z1],
  // interior walls (doorways left open)
  ...IN_WALLS.flatMap(w => spans(w.from, w.to, w.gaps).map(([a, b]) =>
    w.alongX ? [a - 0.1, b + 0.1, w.fixed - 0.15, w.fixed + 0.15] : [w.fixed - 0.15, w.fixed + 0.15, a - 0.1, b + 0.1])),
  // classrooms: desks, teacher's table, fan
  ...CLASS_C.flatMap(cx => [
    ...DESK_COLS.flatMap(o => DESK_ROWS.map(z => [cx + o - DESK_W / 2, cx + o + DESK_W / 2, z - 0.22, z + 0.57])),
    [cx - 0.65, cx + 0.65, TEACHER_Z - 0.3, TEACHER_Z + 0.3], R(cx + 3.1, -9.0, 0.3),
  ]),
  // hall
  [RECEPTION.x - REC_W / 2, RECEPTION.x + REC_W / 2, RECEPTION.z - 0.65, RECEPTION.z + 0.65],
  ...BENCHES.map(b => [b.x - 0.35, b.x + 0.35, b.z - 1.05, b.z + 1.05]),
  [TROPHY.x - 0.8, TROPHY.x + 0.8, TROPHY.z - 0.25, TROPHY.z + 0.25],
  R(-1.2, 7.4, 0.3), R(5.2, 7.4, 0.3), R(-9.8, 7.4, 0.3), R(9.8, 7.4, 0.3),
  [10.0, 10.5, 3.6, 4.2],                                                       // water dispenser
  // toilets: stalls, basins, drum and bucket
  ...WC.map(w => [w.x - 0.3, w.x + 0.3, Z_TS - 0.7, Z_TS]),
  ...STALL_BLOCKS.flatMap(b => STALL_PLANES.map(o => [b.cx - o - 0.07, b.cx - o + 0.07, Z_TS - STALL_D, Z_TS])),
  [X_TW - T_IN / 2 - 0.5, X_TW - T_IN / 2, 0.7, 1.3], [X_TE + T_IN / 2, X_TE + T_IN / 2 + 0.5, 0.7, 1.3],
  R(-14.05, 0.35, 0.3), R(14.05, 0.35, 0.3),
  // store: drums and buckets
  R(-13.8, 7.2, 0.3), R(-12.7, 7.3, 0.2), R(-13.4, 5.3, 0.2),
  // principal's office
  [PRIN_DESK.x - 0.35, PRIN_DESK.x + 0.35, PRIN_DESK.z - 0.75, PRIN_DESK.z + 0.75],
  [PRIN_SHELF.x - 1.55, PRIN_SHELF.x + 1.55, PRIN_SHELF.z - 0.29, PRIN_SHELF.z + 0.29],
  [10.85, 11.55, 4.6, 5.3], R(14.05, 4.85, 0.25),
];

// ---------- helpers ----------

const glbCache = new Map();
const gltfLoader = new GLTFLoader();
const loadGLB = file => {
  if (!glbCache.has(file)) glbCache.set(file, gltfLoader.loadAsync(PROPS_DIR + file));
  return glbCache.get(file);
};
// loads one of your .glb files, sizes it in metres (axis 'x' | 'y' | 'z'), centres it on the floor, optionally hides parts by name
async function fit(file, { axis = 'y', size = 1, rotY = 0, hide = null } = {}) {
  const gltf = await loadGLB(file);
  const inner = SkeletonUtils.clone(gltf.scene);
  const wrap = new THREE.Group(); wrap.add(inner);
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  inner.scale.setScalar(size / box.getSize(new THREE.Vector3())[axis]);
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  inner.traverse(o => {
    if (!o.isMesh) return;
    if (hide && hide.test(o.name)) o.visible = false;
    o.castShadow = false; o.receiveShadow = true;
  });
  const g = new THREE.Group(); g.add(wrap); g.rotation.y = rotY;
  return g;
}
async function borrowMap(file) {
  const gltf = await loadGLB(file);
  let map = null;
  gltf.scene.traverse(o => {
    if (map || !o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!map && m.map) map = m.map; });
  });
  if (!map) throw new Error('no texture found in ' + file);
  return map;
}
const tiled = (map, w, d, per) => {
  const t = map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / per, d / per); t.anisotropy = 4; t.needsUpdate = true; return t;
};
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const fitText = (g, text, maxW, start, weight = 'bold') => {
  let size = start; do { g.font = `${weight} ${size}px Arial, sans-serif`; size -= 2; } while (g.measureText(text).width > maxW && size > 12);
};
const BOX = new THREE.BoxGeometry(1, 1, 1);
const std = (color, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

// one two-seater Nigerian school desk (writing top and an attached bench), merged into a single geometry
function deskGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  add(1.2, 0.04, 0.45, 0, 0.74, 0);                                   // writing top
  add(1.2, 0.03, 0.26, 0, 0.45, 0.46);                                // bench seat
  add(1.2, 0.2, 0.03, 0, 0.55, -0.2);                                 // front panel
  [-0.55, 0.55].forEach(x => {
    add(0.04, 0.72, 0.04, x, 0.36, -0.18); add(0.04, 0.72, 0.04, x, 0.36, 0.14); add(0.04, 0.44, 0.04, x, 0.22, 0.56);
    add(0.04, 0.04, 0.78, x, 0.3, 0.2);                               // runner joining desk and bench
  });
  return (BGU.mergeGeometries || BGU.mergeBufferGeometries)(parts);
}

// ---------- the building ----------

export function buildHighSchoolInterior() {
  const group = new THREE.Group();          // everything inside (shown only while the player is inside)
  const marker = new THREE.Group();         // the door marker outside (shown only while the player is outside)
  const M = {
    paint: std(0xf0ecdf), dado: std(0x2e7d4f, 0.8), skirt: std(0x2b2f33, 0.7), rail: std(0xe6e9ec, 0.6),
    tile: std(0xc7cdd2, 0.55), concrete: std(0xa7a49b, 1), wood: std(0x8b5a2b, 0.85), darkwood: std(0x5a3a1c, 0.8),
    gold: std(0xd6a62a, 0.35, 0.6), glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
    steel: std(0x6a7077, 0.5, 0.5), white: std(0xf1efe8, 0.8),
  };
  const warn = what => e => console.warn('high school interior: could not load ' + what, e);
  const lib = (parent, name, x, y, z, rotY = 0) =>
    loadProp(name).then(p => { p.position.set(x, y, z); p.rotation.y = rotY; parent.add(p); return p; }).catch(warn(name));
  const mine = (parent, file, opts, x, y, z) =>
    fit(file, opts).then(p => { p.position.set(x, y, z); parent.add(p); return p; }).catch(warn(file));
  const box = (parent, mat, w, h, d, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; parent.add(m); return m;
  };
  const cylM = (parent, mat, r0, r1, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 12), mat); m.position.set(x, y, z); parent.add(m); return m;
  };

  // ----- floors -----
  const plane = (x0, x1, z0, z1, y, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; group.add(m); return m;
  };
  const hallFloor = plane(X0, X1, Z0, Z1, 0.01, M.tile);                         // hall, corridor, toilets, store, office
  const classFloors = CLASS_X.slice(0, 4).map((x, i) => plane(x, CLASS_X[i + 1], Z0, Z_CLASS, 0.02, M.concrete));
  borrowMap('pbr_material_floor_tiles.glb').then(map => {
    hallFloor.material = new THREE.MeshStandardMaterial({ map: tiled(map, X1 - X0, Z1 - Z0, 2.0), roughness: 0.55, metalness: 0.05 });
  }).catch(warn('floor tiles (keeping the plain floor)'));
  void classFloors;

  // ----- walls: lower band always visible, upper part only while the camera is in that room (as in the immigration office) -----
  const addWall = (lowG, upG, alongX, fixed, from, to, gaps, thick) => {
    const put = (mat, a, b, y0, y1, g, extra = 0) => {
      const len = b - a, c = (a + b) / 2, h = y1 - y0;
      box(g, mat, alongX ? len : thick + extra, h, alongX ? thick + extra : len, alongX ? c : fixed, y0 + h / 2, alongX ? fixed : c);
    };
    spans(from, to, gaps).forEach(([a, b]) => {
      put(M.dado, a, b, 0, LOW_H, lowG);                          // Nigerian green lower band
      put(M.skirt, a, b, 0, 0.1, lowG, 0.03);
      put(M.rail, a, b, LOW_H - 0.02, LOW_H + 0.03, lowG, 0.05);
      put(M.paint, a, b, LOW_H + 0.03, WALL_H, upG);
    });
    gaps.forEach(g => put(M.paint, g - GAP / 2, g + GAP / 2, DOOR_H, WALL_H, upG));
  };
  const side = { N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
  Object.values(side).forEach(g => group.add(g));
  addWall(side.N, side.N, true, Z0 + T_OUT / 2, X0, X1, [], T_OUT);
  addWall(side.S, side.S, true, Z1 - T_OUT / 2, X0, DOOR_X - DOOR_HALF, [], T_OUT);
  addWall(side.S, side.S, true, Z1 - T_OUT / 2, DOOR_X + DOOR_HALF, X1, [], T_OUT);
  addWall(side.W, side.W, false, X0 + T_OUT / 2, Z0, Z1, [], T_OUT);
  addWall(side.E, side.E, false, X1 - T_OUT / 2, Z0, Z1, [], T_OUT);
  box(side.S, M.paint, DOOR_HALF * 2, WALL_H - DOOR_H, T_OUT, DOOR_X, DOOR_H + (WALL_H - DOOR_H) / 2, Z1 - T_OUT / 2);   // beam over the front door

  const lowG = new THREE.Group(); group.add(lowG);
  const uppers = [];
  IN_WALLS.forEach(w => {
    const up = new THREE.Group(); group.add(up); uppers.push({ up, rooms: w.rooms });
    addWall(lowG, up, w.alongX, w.fixed, w.from, w.to, w.gaps, T_IN);
  });

  // ----- exit marker (inside the front door) -----
  lib(group, 'gta_marker_blue', DOOR_X, 0.02, Z1 - 1.7);

  // ----- classrooms -----
  const deskGeo = deskGeometry();
  const deskPlaces = CLASS_C.flatMap(cx => DESK_COLS.flatMap(o => DESK_ROWS.map(z => [cx + o, z])));
  const desks = new THREE.InstancedMesh(deskGeo, M.wood, deskPlaces.length);
  const dm = new THREE.Object3D();
  deskPlaces.forEach(([x, z], i) => { dm.position.set(x, 0, z); dm.updateMatrix(); desks.setMatrixAt(i, dm.matrix); });
  desks.frustumCulled = false; desks.receiveShadow = true; group.add(desks);

  CLASS_C.forEach((cx, i) => {
    // chalkboard on the north wall (it belongs to the north wall group, so it hides with it)
    const boardTex = canvasTex(1024, 384, (g, w, h) => {
      g.fillStyle = '#25392f'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.07)'; for (let k = 0; k < 40; k++) g.fillRect(Math.random() * w, Math.random() * h, 90, 5);
      g.fillStyle = '#f4f1e6'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = 'bold 76px "Comic Sans MS", Arial, sans-serif'; g.fillText(CLASS_NAMES[i], 50, 80);
      g.font = '46px "Comic Sans MS", Arial, sans-serif';
      g.fillText('Date: ______________', 50, 170); g.fillText('Subject: Mathematics', 50, 235); g.fillText('Topic: Algebra', 50, 300);
    });
    box(side.N, M.darkwood, 3.4, 1.4, 0.05, cx, 1.55, N_IN + 0.03);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 }));
    board.position.set(cx, 1.55, N_IN + 0.065); side.N.add(board);
    box(group, M.darkwood, 1.3, 0.04, 0.6, cx, 0.76, TEACHER_Z);                         // teacher's table
    [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]].forEach(([dx, dz]) => box(group, M.darkwood, 0.05, 0.74, 0.05, cx + dx, 0.37, TEACHER_Z + dz));
    lib(group, 'office_chair', cx, 0, TEACHER_Z - 0.55, 0);                              // teacher's chair, facing the class
    lib(group, 'standing_fan', cx + 3.1, 0, -9.0, 0.5);
    // name plate beside each doorway, on the corridor side (low, so it is always visible)
    const signTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#2e7d4f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 64px Arial, sans-serif'; g.fillText(CLASS_NAMES[i], w / 2, h / 2 + 4);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 }));
    sign.position.set(cx + 1.15, 0.82, Z_CLASS + T_IN / 2 + 0.012); lowG.add(sign);
  });

  // ----- hall / reception -----
  mine(group, 'reception_desk.glb', { axis: 'x', size: REC_W }, RECEPTION.x, 0, RECEPTION.z);          // front faces south (toward the door)
  lib(group, 'office_chair', RECEPTION.x, 0, RECEPTION.z - 1.3, 0);
  BENCHES.forEach(b => lib(group, 'bench_3seat', b.x, 0, b.z, -Math.PI / 2));                          // benches face west
  lib(group, 'water_dispenser', 10.25, 0, 3.9, -Math.PI / 2);
  lib(group, 'plant_monstera', -1.2, 0, 7.4); lib(group, 'plant_pot', 5.2, 0, 7.4);
  lib(group, 'plant_pot', -9.8, 0, 7.4); lib(group, 'plant_pot', 9.8, 0, 7.4);
  lib(side.S, 'fire_extinguisher', 5.0, 1.2, S_IN - 0.12, Math.PI);
  lib(side.E, 'fire_extinguisher', E_IN - 0.12, 1.2, -2.2, -Math.PI / 2);
  lib(side.W, 'standing_fan', W_IN + 0.4, 0, -2.2, Math.PI / 2);

  // trophy cabinet against the south wall
  {
    const g = new THREE.Group(); g.position.set(TROPHY.x, 0, TROPHY.z); group.add(g);
    box(g, M.darkwood, 1.6, 1.9, 0.04, 0, 0.95, -0.23);                                 // back
    [-0.78, 0.78].forEach(x => box(g, M.darkwood, 0.04, 1.9, 0.5, x, 0.95, 0));
    box(g, M.darkwood, 1.6, 0.05, 0.5, 0, 1.9, 0); box(g, M.darkwood, 1.6, 0.6, 0.5, 0, 0.3, 0);   // top, lower cupboard
    [0.9, 1.3, 1.65].forEach(y => box(g, M.glass, 1.5, 0.02, 0.44, 0, y, 0));            // glass shelves
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), M.glass); front.position.set(0, 1.25, 0.24); g.add(front);
    [0.92, 1.32, 1.67].forEach((y, r) => [-0.55, -0.18, 0.18, 0.55].forEach((x, k) => {
      const h = 0.1 + ((r + k) % 3) * 0.04;
      cylM(g, M.gold, 0.06, 0.06, 0.03, x, y + 0.02, -0.02);                             // base
      cylM(g, M.gold, 0.012, 0.012, h, x, y + 0.03 + h / 2, -0.02);                      // stem
      cylM(g, M.gold, 0.07, 0.035, 0.1, x, y + 0.04 + h + 0.05, -0.02);                  // cup
    }));
  }
  // notice board and the national motto plaque on the south wall (they hide with that wall)
  const noticeTex = canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#b98a58'; g.fillRect(0, 0, w, h);
    const colors = ['#f4f1e6', '#ffe9a0', '#cfe6c8', '#cfd9ee', '#f6d3d0'];
    for (let k = 0; k < 11; k++) {
      g.fillStyle = colors[k % 5]; const x = 20 + (k % 4) * 120 + Math.random() * 14, y = 20 + Math.floor(k / 4) * 98 + Math.random() * 10;
      g.fillRect(x, y, 96, 80); g.fillStyle = '#6a6a6a'; for (let l = 0; l < 4; l++) g.fillRect(x + 8, y + 14 + l * 15, 70 + Math.random() * 14, 3);
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x + 48, y + 5, 4, 0, 6.3); g.fill();
    }
  });
  box(side.S, M.darkwood, 1.9, 1.1, 0.04, 6.6, 1.6, S_IN - 0.02);
  const nb = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshStandardMaterial({ map: noticeTex, roughness: 1 }));
  nb.position.set(6.6, 1.6, S_IN - 0.045); nb.rotation.y = Math.PI; side.S.add(nb);
  const mottoTex = canvasTex(768, 256, (g, w, h) => {
    g.fillStyle = '#0a7d3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 70, w, 116);
    g.strokeStyle = '#d6a62a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#0a7d3e'; fitText(g, 'UNITY AND FAITH, PEACE AND PROGRESS', w - 70, 50); g.fillText('UNITY AND FAITH, PEACE AND PROGRESS', w / 2, 128);
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial, sans-serif'; g.fillText('FEDERAL REPUBLIC OF NIGERIA', w / 2, 36); g.fillText('DELTA HIGH SCHOOL', w / 2, 222);
  });
  const motto = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshStandardMaterial({ map: mottoTex, roughness: 0.8 }));
  motto.position.set(-2.4, 2.3, S_IN - 0.02); motto.rotation.y = Math.PI; side.S.add(motto);
  // corridor notice board on the west end wall
  const nb2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshStandardMaterial({ map: noticeTex, roughness: 1 }));
  nb2.position.set(W_IN + 0.03, 1.55, -2.25); nb2.rotation.y = Math.PI / 2; side.W.add(nb2);

  // ----- toilets (boys west, girls east): your stalls, toilets, basin, a water drum and a bucket -----
  const stallUp = { tb: new THREE.Group(), tg: new THREE.Group() };
  Object.entries(stallUp).forEach(([room, g]) => { group.add(g); uppers.push({ up: g, rooms: [room] }); });
  STALL_BLOCKS.forEach(b => {
    mine(group, STALL_FILE, { axis: 'x', size: STALL_W, rotY: Math.PI, hide: /StallHigh/ }, b.cx, 0, STALL_CZ);
    mine(stallUp[b.room], STALL_FILE, { axis: 'x', size: STALL_W, rotY: Math.PI, hide: /StallLow/ }, b.cx, 0, STALL_CZ);
  });
  WC.forEach(w => lib(group, 'toilet', w.x, 0, w.z, Math.PI));
  SINKS.forEach(k => lib(group, 'sink_wall', k.x, 0.4, k.z, k.rot));
  [-1, 1].forEach(s => {
    mine(group, 'water_drum_optimised.glb', { axis: 'y', size: 0.9 }, s * 14.05, 0, 0.35);
    mine(group, 'bucket_optimised.glb', { axis: 'y', size: 0.3 }, s * 13.55, 0, 0.3);
  });

  // ----- cleaners' store (SW): drums and buckets -----
  mine(group, 'water_drum_optimised.glb', { axis: 'y', size: 0.9 }, -13.8, 0, 7.2);
  mine(group, 'bucket_optimised.glb', { axis: 'y', size: 0.3 }, -12.7, 0, 7.3);
  mine(group, 'bucket_optimised.glb', { axis: 'y', size: 0.3 }, -13.4, 0, 5.3);

  // ----- principal's office (SE): desk, chairs, computer, globe, bookshelf, filing cabinet, flag -----
  box(group, M.darkwood, 0.7, 0.05, 1.5, PRIN_DESK.x, 0.76, PRIN_DESK.z);
  box(group, M.darkwood, 0.62, 0.7, 1.4, PRIN_DESK.x, 0.35, PRIN_DESK.z);
  lib(group, 'office_chair', PRIN_DESK.x + 0.95, 0, PRIN_DESK.z, -Math.PI / 2);                 // principal's chair (east), faces west
  lib(group, 'office_chair', 12.3, 0, PRIN_DESK.z - 0.4, Math.PI / 2);                          // visitor chairs (west), face east
  lib(group, 'office_chair', 12.3, 0, PRIN_DESK.z + 0.4, Math.PI / 2);
  lib(group, 'personal_computer', PRIN_DESK.x, 0.785, PRIN_DESK.z + 0.2, Math.PI / 2);
  mine(group, 'globe_optimised.glb', { axis: 'y', size: 0.45 }, PRIN_DESK.x, 0.785, PRIN_DESK.z - 0.45);
  mine(group, 'bookshelf_optimised.glb', { axis: 'y', size: 2.2, rotY: Math.PI / 2 }, PRIN_SHELF.x, 0, PRIN_SHELF.z);   // books face north
  lib(group, 'filing_cabinet', 11.2, 0, 4.94, 0);
  {                                                                                             // flag on a stand in the corner
    cylM(group, M.steel, 0.2, 0.2, 0.04, 14.05, 0.02, 4.85); cylM(group, M.steel, 0.015, 0.015, 1.9, 14.05, 0.97, 4.85);
    const ft = canvasTex(96, 48, (g, w, h) => { g.fillStyle = '#0a7d3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 3, 0, w / 3, h); });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide }));
    fl.position.set(14.05 - 0.31, 1.7, 4.85); group.add(fl);
  }

  // ----- doorway beams have no door leaves: the classrooms, toilets and offices are open doorways (like many schools) -----

  // ----- door marker (outside): in front of the steps, so players can see where to walk in -----
  loadProp('gta_marker_blue').then(p => { p.position.set(DOOR_X, 0.02, Z1 + 3.5); marker.add(p); }).catch(warn('entrance marker'));

  // ----- hooks used by game.js -----
  const setInside = inside => { group.visible = inside; marker.visible = !inside; };
  const inRoom = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const setCamera = (relX, relZ) => {
    side.N.visible = !(relZ < Z0);
    side.S.visible = !(relZ > Z1);
    side.W.visible = !(relX < X0);
    side.E.visible = !(relX > X1);
    uppers.forEach(u => { u.up.visible = u.rooms.some(n => inRoom(ROOMS[n], relX, relZ)); });
  };
  setInside(false);
  setCamera(0, 0);

  return { group, marker, halfW: HALF_W, halfD: HALF_D, cz: CZ, setInside, setCamera };
}
