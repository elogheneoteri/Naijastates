// Immigration Office interior, rebuilt as separate rooms.
// Local space: the building centre is (0,0,0) on the ground. The front door is on the +Z (south) wall, facing the road.
// The room fills the building's footprint, so the player never teleports (game.js hides the outside model and shows
// this interior while the player is inside). Exports are unchanged, so game.js needs no edit:
//
//   buildImmigrationOffice()  -> { group, marker, halfW, halfD, setInside(bool), setCamera(relX, relZ) }
//   IMMIGRATION_BOXES         -> solid parts (walls with door gaps, desks, counter, chairs) for game.js collisions
//
// FLOOR PLAN (north is -Z, the door is at the bottom):
//
//   +-------------------------+-----------------+-----------------+
//   |  STAFF OFFICE           |  PRIVATE        |  PRIVATE        |
//   |  6 desks, separators    |  OFFICE 1       |  OFFICE 2       |
//   +--------[door]-----------+----[door]-------+----[door]-------+
//   |                                                             |
//   |  RECEPTION HALL: 2 reception desks (west), waiting area (east)
//   |                                                             |
//   +--------+                                          +--------+
//   | TOILET |                                          | TOILET |
//   | MALE   |   [front door]                           | FEMALE |
//   +--------+------------------------------------------+--------+
//
// Walls are clean painted walls (off-white with a grey-blue lower band), not the old wallpaper.
// Interior walls are shown at 1.1 m while the camera is outside a room, and full height when the camera is inside it,
// so the walls never hide the player. Outer walls still hide when the camera is behind them, as before.
//
// Props from your upload used here: reception_desk.glb, cubicle_v2.glb (desk part only, its cloth walls are hidden),
// room_partition_model_5175-5.glb (desk separators), noticeboard.glb, filing_cabinet.glb, air_conditioner.glb,
// carpet_staff.jpg + carpet_office.jpg (the two carpets, cut out of your empty room models so the big room files are not loaded).
// Props from your existing library: office_chair, personal_computer, standing_fan, water_dispenser, gta_marker_blue,
// pbr_material_floor_tiles.glb (hall and toilet floor).
// New props from props_library.js: toilet, sink_wall, bench_3seat, bookshelf, bin_office, fire_extinguisher, plant_pot,
// plant_monstera, printer_floor, printer_desk.
// NOT used: standing_air_conditioner.glb (about 1,000,000 triangles), mini_office_room_vr_scaled.glb (29 MB),
// office_table_.glb (folding table, 88,000 triangles), ac_outdoor_unit.glb (outside only), 3d_toilet_signage_board.glb (you asked for no signs),
// empty_office_space.glb (7 MB, only a texture would be used), ceiling_lights (there is no ceiling, and it is 21,000 triangles each).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadProp, PROPS_DIR } from './props_library.js';

// ---------- size and layout (metres, building centre = 0,0) ----------

export const HALF_W = 12.6;          // 25.2 m wide (x)
export const HALF_D = 12.0;          // 24 m deep (z); the door is on the +z side
const WALL_H = 3.1;                  // full wall height
const LOW_H = 1.1;                   // height of the lower band that is always visible
const DOOR_HALF = 1.3;               // front doorway is 2.6 m wide, centred on x = 0
const DOOR_H = 2.2;                  // height of every doorway
const GAP = 1.3;                     // width of the doorways between rooms
const T_OUT = 0.24;                  // outer wall thickness (inner face sits exactly on +-HALF)
const T_IN = 0.2;                    // interior wall thickness

const Z_BACK = -4.5;                 // the wall between the back rooms and the reception hall
const X_STAFF_E = -0.6;              // staff office | private office 1
const X_PO_SPLIT = 6.0;              // private office 1 | private office 2
const Z_TOILET = 7.6;                // north wall of the two toilets (front corners)
const X_TM = -8.2, X_TF = 8.2;       // inner walls of the male (west) and female (east) toilets

const DOOR_STAFF = -6.6, DOOR_PO1 = 2.7, DOOR_PO2 = 9.2;   // doorways in the back wall
const DOOR_TM = -10.3, DOOR_TF = 10.3;                      // toilet doorways

// inner faces of the outer walls
const N_IN = -HALF_D + T_OUT, S_IN = HALF_D - T_OUT, W_IN = -HALF_W + T_OUT, E_IN = HALF_W - T_OUT;

// rooms (used to show the upper part of interior walls when the camera is inside the room)
const ROOMS = {
  staff: { x0: -HALF_W, x1: X_STAFF_E, z0: -HALF_D, z1: Z_BACK },
  po1:   { x0: X_STAFF_E, x1: X_PO_SPLIT, z0: -HALF_D, z1: Z_BACK },
  po2:   { x0: X_PO_SPLIT, x1: HALF_W, z0: -HALF_D, z1: Z_BACK },
  tm:    { x0: -HALF_W, x1: X_TM, z0: Z_TOILET, z1: HALF_D },
  tf:    { x0: X_TF, x1: HALF_W, z0: Z_TOILET, z1: HALF_D },
};

// Interior walls. 'rooms' = which rooms they belong to (their upper part shows when the camera is in one of them).
const IN_WALLS = [
  { rooms: ['staff'], alongX: true, fixed: Z_BACK, from: -HALF_W, to: X_STAFF_E, gaps: [DOOR_STAFF] },
  { rooms: ['po1'],   alongX: true, fixed: Z_BACK, from: X_STAFF_E, to: X_PO_SPLIT, gaps: [DOOR_PO1] },
  { rooms: ['po2'],   alongX: true, fixed: Z_BACK, from: X_PO_SPLIT, to: HALF_W, gaps: [DOOR_PO2] },
  { rooms: ['staff', 'po1'], alongX: false, fixed: X_STAFF_E, from: -HALF_D, to: Z_BACK, gaps: [] },
  { rooms: ['po1', 'po2'],   alongX: false, fixed: X_PO_SPLIT, from: -HALF_D, to: Z_BACK, gaps: [] },
  { rooms: ['tm'], alongX: true,  fixed: Z_TOILET, from: -HALF_W, to: X_TM, gaps: [DOOR_TM] },
  { rooms: ['tm'], alongX: false, fixed: X_TM, from: Z_TOILET, to: HALF_D, gaps: [] },
  { rooms: ['tf'], alongX: true,  fixed: Z_TOILET, from: X_TF, to: HALF_W, gaps: [DOOR_TF] },
  { rooms: ['tf'], alongX: false, fixed: X_TF, from: Z_TOILET, to: HALF_D, gaps: [] },
];

// Staff office: two rows of three desks (back to the north wall, and back toward the south), a divider between desks.
const DESK_X = [-10.9, -8.6, -6.3];
const STAFF_DESKS = [
  ...DESK_X.map(x => ({ x, z: N_IN + 0.99, rot: 0 })),          // north row, back against the north wall
  ...DESK_X.map(x => ({ x, z: -7.0, rot: Math.PI })),           // south row, facing the aisle
];
const DIVIDER_X = [-9.75, -7.45, -5.15];                        // between desks, and at the east end
const DIVIDER_H = 1.5;                                          // divider height; length follows the model (about 1.06 m)
// Private offices: a desk against the north wall and two visitor chairs.
const PRIVATE_DESKS = [{ x: DOOR_PO1, z: N_IN + 0.99, rot: 0 }, { x: DOOR_PO2, z: N_IN + 0.99, rot: 0 }];
// Reception: two L-shaped counters facing the door, staff chairs behind them.
const RECEPTION = [{ x: -7.6, z: -1.8 }, { x: -4.7, z: -1.8 }];
const REC_W = 2.6;                                              // counter width (the model is 2.5 : 1.3 deep)
// Waiting area: two rows of chairs in the east half of the hall, facing north.
const WAIT_ROWS_Z = [2.2, 3.9];
const WAIT_BENCH_X = [3.0, 5.2, 7.4];                           // centres of the 3-seat benches in each row
const BENCH_W = 2.1;                                            // bench length (matches props_library.js)
// Toilets: two toilets against the south wall of each room (facing north), a wall basin on the wall next to the hall.
const WC = [-11.4, -9.4, 9.4, 11.4].map(x => ({ x, z: S_IN - 0.33 }));
const SINKS = [{ x: X_TM - T_IN / 2 - 0.27, z: 9.6, rot: -Math.PI / 2 }, { x: X_TF + T_IN / 2 + 0.27, z: 9.6, rot: Math.PI / 2 }];
// Bookshelves on the west wall of each private office (the shelf front faces +x).
const SHELVES = [X_STAFF_E + T_IN / 2 + 0.33, X_PO_SPLIT + T_IN / 2 + 0.33].map(x => ({ x, z: -5.95 }));
const PRINTER = { x: -4.4, z: N_IN + 0.33 };                    // floor copier in the staff office, against the north wall
const PLANTS = [{ x: -2.6, z: 11.2, p: 'plant_monstera' }, { x: 2.6, z: 11.2, p: 'plant_pot' }, { x: 11.6, z: 8.5, p: 'plant_pot' },
                { x: X_PO_SPLIT - T_IN / 2 - 0.5, z: N_IN + 0.5, p: 'plant_pot' }, { x: E_IN - 0.5, z: N_IN + 0.5, p: 'plant_pot' }];

// Cubicle desk: the model's own centre is the middle of its 2 x 2 m footprint. The desk is an L (back band + left arm);
// the open corner is where the chair goes. These offsets are measured from the model.
const SEAT = { x: 0.5, z: 0.35, rot: -2.27 };                   // chair, facing the desk corner
const PC = { x: -0.45, y: 0.765, z: -0.45, rot: 0.87 };         // computer in the desk corner (desk top is 0.765 m high)
const HIDE_CUBICLE = /^(CubicleWall|Wall\d|Corner|Lock_|TablePt\d_TableRubber|CubicTables_TableRubber)/;   // cloth walls, lock, rubber edging

// ---------- collision boxes: [minX, maxX, minZ, maxZ] ----------

const spans = (from, to, gaps) => {
  const out = []; let a = from;
  [...gaps].sort((p, q) => p - q).forEach(g => { if (g - GAP / 2 > a) out.push([a, g - GAP / 2]); a = g + GAP / 2; });
  if (to > a) out.push([a, to]);
  return out;
};
// desk footprint boxes (the L shape) turned by 0 or PI around (x, z)
const deskBoxes = (x, z, rot) => {
  const flip = Math.abs(rot) > 1 ? -1 : 1;
  const r = (x0, x1, z0, z1) => {
    const ax = x + flip * x0, bx = x + flip * x1, az = z + flip * z0, bz = z + flip * z1;
    return [Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)];
  };
  return [r(-1.0, -0.25, -1.0, 1.0), r(-0.25, 1.0, -1.0, -0.25)];
};

export const IMMIGRATION_BOXES = [
  // outer walls (the south wall has the door gap)
  [-HALF_W - 0.2, HALF_W + 0.2, -HALF_D - 0.2, N_IN],
  [-HALF_W - 0.2, -DOOR_HALF, S_IN, HALF_D + 0.2],
  [DOOR_HALF, HALF_W + 0.2, S_IN, HALF_D + 0.2],
  [-HALF_W - 0.2, W_IN, -HALF_D, HALF_D],
  [E_IN, HALF_W + 0.2, -HALF_D, HALF_D],
  // interior walls (door gaps left open)
  ...IN_WALLS.flatMap(w => spans(w.from, w.to, w.gaps).map(([a, b]) =>
    w.alongX ? [a - 0.1, b + 0.1, w.fixed - 0.15, w.fixed + 0.15] : [w.fixed - 0.15, w.fixed + 0.15, a - 0.1, b + 0.1])),
  // reception counters
  ...RECEPTION.map(r => [r.x - REC_W / 2, r.x + REC_W / 2, r.z - 0.7, r.z + 0.7]),
  // waiting chairs
  ...WAIT_ROWS_Z.map(z => [WAIT_BENCH_X[0] - BENCH_W / 2, WAIT_BENCH_X[WAIT_BENCH_X.length - 1] + BENCH_W / 2, z - 0.35, z + 0.35]),
  // toilets, basins, bookshelves, copier, plants
  ...WC.map(w => [w.x - 0.3, w.x + 0.3, S_IN - 0.7, S_IN]),
  [X_TM - T_IN / 2 - 0.5, X_TM - T_IN / 2, 9.3, 9.9], [X_TF + T_IN / 2, X_TF + T_IN / 2 + 0.5, 9.3, 9.9],
  ...SHELVES.map(b => [b.x - 0.33, b.x + 0.33, b.z - 1.35, b.z + 1.35]),
  [PRINTER.x - 0.55, PRINTER.x + 0.55, N_IN, N_IN + 0.66],
  ...PLANTS.map(q => [q.x - 0.3, q.x + 0.3, q.z - 0.3, q.z + 0.3]),
  // desks and dividers
  ...STAFF_DESKS.flatMap(d => deskBoxes(d.x, d.z, d.rot)),
  ...PRIVATE_DESKS.flatMap(d => deskBoxes(d.x, d.z, d.rot)),
  ...DIVIDER_X.flatMap(x => [[x - 0.12, x + 0.12, N_IN, N_IN + 1.1], [x - 0.12, x + 0.12, -7.1, -6.0]]),
  // cabinets (staff area behind reception, staff office, private offices), dispensers, fans
  [-12.25, -10.85, -4.4, -3.7],
  ...[-3.1, -2.4, -1.7].map(x => [x - 0.35, x + 0.35, N_IN, N_IN + 0.7]),
  ...[-5.4, -6.1].map(z => [5.9 - 0.7, 5.9, z - 0.35, z + 0.35]),
  ...[-5.4, -6.1].map(z => [E_IN - 0.7, E_IN, z - 0.35, z + 0.35]),
  [-1.3, -0.7, -8.8, -8.2], [E_IN - 0.45, E_IN, -2.5, -1.9],
  [-1.8, -1.2, -5.5, -4.9], [-7.7, -7.1, 10.5, 11.1], [7.1, 7.7, 10.5, 11.1],
];

// ---------- helpers ----------

const glbCache = new Map();
const gltfLoader = new GLTFLoader();
const loadGLB = file => {
  if (!glbCache.has(file)) glbCache.set(file, gltfLoader.loadAsync(PROPS_DIR + file));
  return glbCache.get(file);
};

// Loads one of your .glb files, scales it to a real-world size (axis 'x' | 'y' | 'z' = size in metres), centres it on the
// floor at (0,0,0), and optionally hides parts by name. The size is measured from the model, so it never depends on the
// units the model was exported in.
async function fit(file, { axis = 'y', size = 1, rotY = 0, hide = null } = {}) {
  const gltf = await loadGLB(file);
  const inner = SkeletonUtils.clone(gltf.scene);
  const wrap = new THREE.Group(); wrap.add(inner);
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  const ext = box.getSize(new THREE.Vector3());
  inner.scale.setScalar(size / ext[axis]);
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);         // centre taken from the FULL model, before parts are hidden
  inner.traverse(o => {
    if (!o.isMesh) return;
    if (hide && hide.test(o.name)) o.visible = false;
    o.castShadow = false; o.receiveShadow = true;
  });
  const g = new THREE.Group(); g.add(wrap); g.rotation.y = rotY;
  return g;
}

// Takes the colour picture (texture) out of a model, used for the carpet.
async function borrowMap(file, materialName) {
  const gltf = await loadGLB(file);
  let map = null;
  gltf.scene.traverse(o => {
    if (map || !o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { if (!map && m.map && (!materialName || m.name === materialName)) map = m.map; });
  });
  if (!map) throw new Error('no texture found in ' + file);
  return map;
}

// Loads a plain image file as a texture (flipY off so it matches the pictures that came inside the glb files).
const loadTex = async file => {
  const t = await new THREE.TextureLoader().loadAsync(PROPS_DIR + file);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const tiled = (map, w, d, per) => {
  const t = map.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / per, d / per); t.anisotropy = 4; t.needsUpdate = true;
  return t;
};

// ---------- the building ----------

export function buildImmigrationOffice() {
  const group = new THREE.Group();          // everything inside (shown only while the player is inside)
  const marker = new THREE.Group();         // the door marker outside (shown only while the player is outside)
  const std = (color, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const M = {
    paint: std(0xeeebe3), dado: std(0x8da2b5, 0.8), skirt: std(0x3b4047, 0.7), rail: std(0xd3d9de, 0.6),
    tile: std(0xc9d1d8, 0.55), carpet: std(0x55575b, 1), carpet2: std(0x4a4c50, 1),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const warn = what => e => console.warn('immigration office: could not load ' + what, e);
  const add = (parent, obj, x, y, z) => { obj.position.set(x, y, z); parent.add(obj); return obj; };
  const lib = (parent, name, x, y, z, rotY = 0) =>
    loadProp(name).then(p => { p.position.set(x, y, z); p.rotation.y = rotY; parent.add(p); return p; }).catch(warn(name));
  const mine = (parent, file, opts, x, y, z) =>
    fit(file, opts).then(p => { p.position.set(x, y, z); parent.add(p); return p; }).catch(warn(file));

  // ----- floors -----
  const plane = (x0, x1, z0, z1, y, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; group.add(m); return m;
  };
  const hallFloor = plane(-HALF_W, HALF_W, -HALF_D, HALF_D, 0.01, M.tile);          // hall + toilets
  const staffFloor = plane(ROOMS.staff.x0, ROOMS.staff.x1, ROOMS.staff.z0, ROOMS.staff.z1, 0.02, M.carpet2);
  const po1Floor = plane(ROOMS.po1.x0, ROOMS.po1.x1, ROOMS.po1.z0, ROOMS.po1.z1, 0.02, M.carpet);
  const po2Floor = plane(ROOMS.po2.x0, ROOMS.po2.x1, ROOMS.po2.z0, ROOMS.po2.z1, 0.02, M.carpet);
  const sized = r => [r.x1 - r.x0, r.z1 - r.z0];
  // carpets: small jpg files cut out of your empty room models; hall tiles from the existing floor tile model
  loadTex('carpet_staff.jpg').then(map => {
    staffFloor.material = new THREE.MeshStandardMaterial({ map: tiled(map, ...sized(ROOMS.staff), 2.0), roughness: 1 });
  }).catch(warn('staff office carpet (keeping plain floor)'));
  loadTex('carpet_office.jpg').then(map => {
    [po1Floor, po2Floor].forEach((f, i) => { f.material = new THREE.MeshStandardMaterial({ map: tiled(map, ...sized(i ? ROOMS.po2 : ROOMS.po1), 2.0), roughness: 1 }); });
  }).catch(warn('private office carpet (keeping plain floor)'));
  borrowMap('pbr_material_floor_tiles.glb').then(map => {
    hallFloor.material = new THREE.MeshStandardMaterial({ map: tiled(map, HALF_W * 2, HALF_D * 2, 2.0), roughness: 0.55, metalness: 0.05 });
  }).catch(warn('floor tiles (keeping the plain floor)'));

  // ----- walls -----
  // One wall: lower band (always visible) + upper part and the beam over each doorway (lowG / upG).
  const addWall = (lowG, upG, alongX, fixed, from, to, gaps, thick) => {
    const put = (mat, a, b, y0, y1, g, extra = 0) => {
      const m = new THREE.Mesh(BOX, mat);
      const len = b - a, c = (a + b) / 2, h = y1 - y0;
      m.scale.set(alongX ? len : thick + extra, h, alongX ? thick + extra : len);
      m.position.set(alongX ? c : fixed, y0 + h / 2, alongX ? fixed : c);
      m.receiveShadow = true; g.add(m);
    };
    spans(from, to, gaps).forEach(([a, b]) => {
      put(M.dado, a, b, 0, LOW_H, lowG);
      put(M.skirt, a, b, 0, 0.1, lowG, 0.03);
      put(M.rail, a, b, LOW_H - 0.02, LOW_H + 0.03, lowG, 0.05);
      put(M.paint, a, b, LOW_H + 0.03, WALL_H, upG);
    });
    gaps.forEach(g => put(M.paint, g - GAP / 2, g + GAP / 2, DOOR_H, WALL_H, upG));
  };

  // outer walls: one group per side so game.js can hide the side the camera is behind
  const side = { N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
  Object.values(side).forEach(g => group.add(g));
  const front = [-DOOR_HALF, DOOR_HALF];
  addWall(side.N, side.N, true, -HALF_D + T_OUT / 2, -HALF_W, HALF_W, [], T_OUT);
  addWall(side.S, side.S, true, HALF_D - T_OUT / 2, -HALF_W, front[0], [], T_OUT);
  addWall(side.S, side.S, true, HALF_D - T_OUT / 2, front[1], HALF_W, [], T_OUT);
  addWall(side.W, side.W, false, -HALF_W + T_OUT / 2, -HALF_D, HALF_D, [], T_OUT);
  addWall(side.E, side.E, false, HALF_W - T_OUT / 2, -HALF_D, HALF_D, [], T_OUT);
  // beam over the front doorway
  const lintel = new THREE.Mesh(BOX, M.paint);
  lintel.scale.set(DOOR_HALF * 2, WALL_H - DOOR_H, T_OUT); lintel.position.set(0, DOOR_H + (WALL_H - DOOR_H) / 2, HALF_D - T_OUT / 2);
  side.S.add(lintel);

  // interior walls
  const lowG = new THREE.Group(); group.add(lowG);
  const uppers = [];
  IN_WALLS.forEach(w => {
    const up = new THREE.Group(); group.add(up); uppers.push({ up, rooms: w.rooms });
    addWall(lowG, up, w.alongX, w.fixed, w.from, w.to, w.gaps, T_IN);
  });

  // ----- exit marker (inside) -----
  lib(group, 'gta_marker_blue', 0, 0.02, HALF_D - 1.7);

  // ----- a workstation: your cubicle desk (no cloth walls), computer in the corner, chair in the open corner -----
  const workstation = (x, z, rot) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; group.add(g);
    mine(g, 'cubicle_v2.glb', { axis: 'x', size: 2.0, hide: HIDE_CUBICLE }, 0, 0, 0);
    lib(g, 'personal_computer', PC.x, PC.y, PC.z, PC.rot);
    lib(g, 'office_chair', SEAT.x, 0, SEAT.z, SEAT.rot);
  };

  // ----- reception hall -----
  RECEPTION.forEach(r => {
    mine(group, 'reception_desk.glb', { axis: 'x', size: REC_W }, r.x, 0, r.z);   // front faces the door (+z)
    lib(group, 'office_chair', r.x - 0.3, 0, r.z - 1.5);                          // staff chair behind the counter
  });
  WAIT_ROWS_Z.forEach(z => WAIT_BENCH_X.forEach(x => lib(group, 'bench_3seat', x, 0, z, Math.PI)));   // benches face north
  lib(group, 'filing_cabinet', -11.9, 0, -4.05);
  lib(group, 'filing_cabinet', -11.2, 0, -4.05);
  lib(group, 'water_dispenser', E_IN - 0.25, 0, -2.2, -Math.PI / 2);
  lib(group, 'standing_fan', -7.4, 0, 10.8, 2.4);
  lib(group, 'standing_fan', 7.4, 0, 10.8, -2.4);
  mine(group, 'noticeboard.glb', { axis: 'z', size: 1.5, rotY: Math.PI }, E_IN - 0.04, 1.55, 1.5);      // east wall, faces west
  mine(group, 'noticeboard.glb', { axis: 'z', size: 1.5, rotY: -Math.PI / 2 }, 6.0, 1.55, Z_BACK + T_IN / 2 + 0.04);   // back wall, faces the hall
  lib(side.E, 'ac_wall', E_IN - 0.16, 2.5, 3.0, -Math.PI / 2);
  lib(side.W, 'ac_wall', W_IN + 0.16, 2.5, 1.0, Math.PI / 2);
  lib(side.W, 'fire_extinguisher', W_IN + 0.12, 1.2, 4.5, Math.PI / 2);
  lib(side.E, 'fire_extinguisher', E_IN - 0.12, 1.2, 0.0, -Math.PI / 2);
  lib(group, 'bin_office', E_IN - 0.3, 0, -1.2);

  // ----- staff office -----
  STAFF_DESKS.forEach(d => workstation(d.x, d.z, d.rot));
  DIVIDER_X.forEach(x => {
    mine(group, 'room_partition_model_5175-5.glb', { axis: 'y', size: DIVIDER_H, rotY: Math.PI / 2 }, x, 0, N_IN + 0.55);   // north row
    mine(group, 'room_partition_model_5175-5.glb', { axis: 'y', size: DIVIDER_H, rotY: Math.PI / 2 }, x, 0, -6.55);          // south row
  });
  [-3.1, -2.4, -1.7].forEach(x => lib(group, 'filing_cabinet', x, 0, N_IN + 0.335));
  lib(group, 'water_dispenser', -1.0, 0, -8.5, -Math.PI / 2);
  lib(group, 'standing_fan', -1.5, 0, -5.2, -2.4);
  mine(group, 'noticeboard.glb', { axis: 'z', size: 1.5, rotY: Math.PI / 2 }, -3.0, 1.55, Z_BACK - T_IN / 2 - 0.04);
  lib(side.N, 'ac_wall', -8.6, 2.5, N_IN + 0.16, 0);
  lib(side.N, 'ac_wall', -3.4, 2.5, N_IN + 0.16, 0);
  lib(group, 'printer_floor', PRINTER.x, 0, PRINTER.z, Math.PI);          // copier, front faces south
  lib(group, 'printer_desk', -2.4, 1.3, N_IN + 0.335, Math.PI);           // desktop printer on top of the middle filing cabinet

  // ----- private offices -----
  PRIVATE_DESKS.forEach(d => {
    workstation(d.x, d.z, d.rot);
    lib(group, 'office_chair', d.x - 0.7, 0, -8.4, Math.PI);       // visitor chairs
    lib(group, 'office_chair', d.x + 0.7, 0, -8.4, Math.PI);
    lib(side.N, 'ac_wall', d.x, 2.5, N_IN + 0.16, 0);
    lib(group, 'bin_office', d.x + 1.4, 0, N_IN + 0.3);
  });
  SHELVES.forEach(b => lib(group, 'bookshelf', b.x, 0, b.z, 0));
  [-5.4, -6.1].forEach(z => {
    lib(group, 'filing_cabinet', X_PO_SPLIT - T_IN / 2 - 0.335, 0, z, -Math.PI / 2);   // private office 1, east wall
    lib(group, 'filing_cabinet', E_IN - 0.335, 0, z, -Math.PI / 2);                    // private office 2, east wall
  });
  mine(group, 'noticeboard.glb', { axis: 'z', size: 1.5, rotY: 0 }, X_STAFF_E + T_IN / 2 + 0.04, 1.55, -8.0);   // private office 1, west wall
  mine(group, 'noticeboard.glb', { axis: 'z', size: 1.5, rotY: 0 }, X_PO_SPLIT + T_IN / 2 + 0.04, 1.55, -8.0);  // private office 2, west wall

  // ----- toilets -----
  WC.forEach(w => lib(group, 'toilet', w.x, 0, w.z, Math.PI));            // bowl faces north, into the room
  SINKS.forEach(k => lib(group, 'sink_wall', k.x, 0.4, k.z, k.rot));      // basin hung at 0.4 m, on the wall next to the hall
  lib(group, 'bin_office', X_TM - T_IN / 2 - 0.3, 0, Z_TOILET + 0.4);
  lib(group, 'bin_office', X_TF + T_IN / 2 + 0.3, 0, Z_TOILET + 0.4);

  // ----- plants -----
  PLANTS.forEach(q => lib(group, q.p, q.x, 0, q.z));

  // ----- door marker (outside): blue gradient marker in front of the door, so players can see where to walk in -----
  loadProp('gta_marker_blue').then(p => { p.position.set(0, 0.02, HALF_D + 1.5); marker.add(p); }).catch(warn('entrance marker'));

  // ----- hooks used by game.js -----
  const setInside = inside => { group.visible = inside; marker.visible = !inside; };
  // relX / relZ = camera position relative to the building centre.
  // Outer walls hide when the camera is behind them. Interior walls drop to their 1.1 m lower band unless the camera
  // is inside one of the rooms they bound, so the walls never block the view of the player.
  const inRoom = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const setCamera = (relX, relZ) => {
    side.N.visible = !(relZ < -HALF_D);
    side.S.visible = !(relZ > HALF_D);
    side.W.visible = !(relX < -HALF_W);
    side.E.visible = !(relX > HALF_W);
    uppers.forEach(u => { u.up.visible = u.rooms.some(n => inRoom(ROOMS[n], relX, relZ)); });
  };
  setInside(false);
  setCamera(0, 0);

  return { group, marker, halfW: HALF_W, halfD: HALF_D, setInside, setCamera };
}
