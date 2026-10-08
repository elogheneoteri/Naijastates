// high_school_interior.js  (STEP 4: the DELTA HIGH SCHOOL, two floors: classrooms etc. downstairs, hostel rooms + cafeteria upstairs)
//
// Local space: the school's centre is (0,0). The front door is on the +Z (south) wall, facing the road. The rooms fill the school's
// footprint (x -14.6..14.6, z -9.7..8.2, measured from the model), so the player never teleports: game.js hides the outside model
// and shows this interior while the player is inside.
//
//   buildHighSchoolInterior() -> { group, marker, halfW, halfD, cz, setInside(bool), setCamera(relX, relZ), setLevel(0 | 1) }
//   HS_INTERIOR_BOXES         -> solid parts for game.js collisions: [minX, maxX, minZ, maxZ, level]. level 0 = only downstairs, 1 = only upstairs,
//                                missing = both (outer walls, the stair divider).
//
// FLOOR PLAN (north is -Z, the front door is at the bottom):
//
//   +--------+--------+--------+--------+
//   | JSS 1A | JSS 1B | JSS 2A | JSS 2B |     4 classrooms: board + teacher table on the north wall, 12 single desks
//   +--[ ]---+--[ ]---+--[ ]---+--[ ]---+
//   |            CORRIDOR (3 m)         |
//   +------+---------------------+------+
//   |BOYS  |  HALL / RECEPTION   |GIRLS |     toilets open onto the corridor (reception counter faces the benches)
//   |TOILET|  desk, benches,     |TOILET|
//   +------+  trophy cabinet     +------+
//   |STAIRS|        [front door] |PRINC.|     the STAIRS (west, where the store was), principal's office (east), both open onto the hall
//   +------+---------------------+------+
//
// Files in the props/ folder used here (new ones are marked *):
//   classroom_gameready_optimised.glb *  the board, clock, teacher's table + chair, globe and tools of every classroom, and the wooden classroom floor
//   school_desk_optimised.glb *          the student desk + chair (12 in every classroom, one model repeated)
//   cafeteria_tile_optimised.glb *       the floor of EVERY hall, corridor, cafeteria, washroom and office (the clean plank part of your scan, repeated without seams)
//   reception_desk.glb, toilet_stalls_4.glb, gta_marker_blue.glb.
// New props (props_library.js): bunk_bed, locker, locker_bank, cafeteria_table, fridge, kitchen_station, steel_shelving, shower_cubicle.
// From props_library.js: office_chair, personal_computer, standing_fan, water_dispenser, filing_cabinet, bench_3seat, toilet, sink_wall,
// fire_extinguisher, plant_pot, plant_monstera, bin_office.
// New (shrunk by me): globe_optimised.glb, water_drum_optimised.glb, bucket_optimised.glb, bookshelf_optimised.glb.
// Built in code: plain white walls, trophy cabinet, notice boards, plaques, principal's desk, flag stand, door signs.
//
// UPSTAIRS (same footprint, up the stairs in the west block):
//   +--------+--------+--------+--------+
//   |BOYS    |BOYS    |GIRLS   |GIRLS   |     4 hostel rooms (4 bunk beds, heads to the north wall, + 6 lockers along the side walls)
//   |HOSTEL A|HOSTEL B|HOSTEL A|HOSTEL B|
//   +--[ ]---+--[ ]---+--[ ]---+--[ ]---+
//   |            CORRIDOR (3 m)         |
//   +------+---------------------+------+
//   |BOYS  |      CAFETERIA      |GIRLS |     washrooms open onto the corridor
//   |WASH. |  9 folding tables   |WASH. |     (showers in the washrooms)
//   +------+                     +------+
//   |STAIRS|                     |KITCHEN|     (fridge, cooker + sink, shelving)
//   +------+---------------------+------+
//
// If you move the front door (the doorway in the south wall): change DOOR_X below. It is centred on the steps now (x = 1.9).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PROPS, loadProp, PROPS_DIR } from './props_library.js';
import { FLOOR_H, IN_STAIR } from './stairs.js';          // the stairs numbers are shared with stairs.js (it lifts the characters)

// ---------- size and layout (metres, school centre = 0,0) ----------

const X0 = -14.6, X1 = 14.6, Z0 = -9.7, Z1 = 8.2;          // the school's footprint (outer faces of the walls)
export const HALF_W = 14.6, HALF_D = 8.95, CZ = -0.75;      // half sizes and the z of the middle of the footprint (game.js uses these)
const WALL_H = 3.1, LOW_H = 1.1, DOOR_H = 2.2, GAP = 1.3;
const T_OUT = 0.24, T_IN = 0.2;
const DOOR_X = 1.9, DOOR_HALF = 1.3;                        // front doorway: centre and half width
const WALL_WHITE = 0xf0f0ee;                                // the plain white wall from walls_window_door.glb (a flat light grey, 221 of 255; a touch brighter so it reads as white under the game lights). Use 0xdddddd for the exact value.

const N_IN = Z0 + T_OUT, S_IN = Z1 - T_OUT, W_IN = X0 + T_OUT, E_IN = X1 - T_OUT;   // inner faces of the outer walls

const Z_CLASS = -3.7;                                       // wall between the classrooms and the corridor
const Z_TOI = -0.7;                                         // wall between the corridor and the hall / toilets
const Z_STORE = 4.5;                                        // wall between the toilets and the store / principal's office
const X_TW = -10.6, X_TE = 10.6;                            // inner walls of the west and east blocks
const CLASS_X = [X0, -7.3, 0, 7.3, X1];
const CLASS_C = [-10.95, -3.65, 3.65, 10.95];               // classroom centres (the doorway of each is here)
const CLASS_NAMES = ['MATHEMATICS', 'ENGLISH', 'SCIENCE', 'GENERAL STUDIES'];
const DORM_NAMES = ['BOYS HOSTEL A', 'BOYS HOSTEL B', 'GIRLS HOSTEL A', 'GIRLS HOSTEL B'];
const DOOR_TOI = 12.6;                                      // toilet doorways at x = -12.6 and +12.6
const DOOR_SIDE_Z = 6.35;                                   // doorway of the principal's office (on the hall side)
const STAIR_DOOR_Z = 7.1;                                   // doorway of the stairs downstairs: in line with the first flight (south lane)
const STAIR_TOP_DOOR_Z = 5.5;                               // doorway of the stairs upstairs: in line with the top of the second flight (north lane)
const has = name => !!PROPS[name];                          // is this prop registered in props_library.js yet?

const ROOMS = {
  c1: { x0: CLASS_X[0], x1: CLASS_X[1], z0: Z0, z1: Z_CLASS }, c2: { x0: CLASS_X[1], x1: CLASS_X[2], z0: Z0, z1: Z_CLASS },
  c3: { x0: CLASS_X[2], x1: CLASS_X[3], z0: Z0, z1: Z_CLASS }, c4: { x0: CLASS_X[3], x1: CLASS_X[4], z0: Z0, z1: Z_CLASS },
  tb: { x0: X0, x1: X_TW, z0: Z_TOI, z1: Z_STORE }, tg: { x0: X_TE, x1: X1, z0: Z_TOI, z1: Z_STORE },
  store: { x0: X0, x1: X_TW, z0: Z_STORE, z1: Z1 }, prin: { x0: X_TE, x1: X1, z0: Z_STORE, z1: Z1 },
};

const makeInWalls = storeDoorZ => [
  ...[0, 1, 2, 3].map(i => ({ rooms: ['c' + (i + 1)], alongX: true, fixed: Z_CLASS, from: CLASS_X[i], to: CLASS_X[i + 1], gaps: [CLASS_C[i]] })),
  { rooms: ['c1', 'c2'], alongX: false, fixed: CLASS_X[1], from: Z0, to: Z_CLASS, gaps: [] },
  { rooms: ['c2', 'c3'], alongX: false, fixed: CLASS_X[2], from: Z0, to: Z_CLASS, gaps: [] },
  { rooms: ['c3', 'c4'], alongX: false, fixed: CLASS_X[3], from: Z0, to: Z_CLASS, gaps: [] },
  // boys toilet (west) and store
  { rooms: ['tb'], alongX: true, fixed: Z_TOI, from: X0, to: X_TW, gaps: [-DOOR_TOI] },
  { rooms: ['tb'], alongX: false, fixed: X_TW, from: Z_TOI, to: Z_STORE, gaps: [] },
  { rooms: ['tb', 'store'], alongX: true, fixed: Z_STORE, from: X0, to: X_TW, gaps: [] },
  { rooms: ['store'], alongX: false, fixed: X_TW, from: Z_STORE, to: Z1, gaps: [storeDoorZ] },
  // girls toilet (east) and principal's office
  { rooms: ['tg'], alongX: true, fixed: Z_TOI, from: X_TE, to: X1, gaps: [DOOR_TOI] },
  { rooms: ['tg'], alongX: false, fixed: X_TE, from: Z_TOI, to: Z_STORE, gaps: [] },
  { rooms: ['tg', 'prin'], alongX: true, fixed: Z_STORE, from: X_TE, to: X1, gaps: [] },
  { rooms: ['prin'], alongX: false, fixed: X_TE, from: Z_STORE, to: Z1, gaps: [DOOR_SIDE_Z] },
];
const IN_WALLS = makeInWalls(STAIR_DOOR_Z), IN_WALLS_UP = makeInWalls(STAIR_TOP_DOOR_Z);   // downstairs and upstairs wall plans (only the stairs doorway differs)


// Classroom (your classroom_gameready file, baked at real size): the board and the teacher's table are on the north wall, the students face north.
// 4 columns x 3 rows of your single school desks (12 per room, a wide aisle in the middle, in line with the doorway). Numbers are measured from the optimised files.
const CLASS_FILE = 'classroom_gameready_optimised.glb', DESK_FILE = 'school_desk_optimised.glb', TILE_FILE = 'cafeteria_tile_optimised.glb';
const DESK_COLS = [-2.7, -0.9, 0.9, 2.7];                   // x from the classroom centre: 4 desks per row, 1 m of walking space between the columns
const DESK_ROWS = [-6.9, -5.65, -4.4];                     // z of the middle of each desk + chair
const DESK_HW = 0.4, DESK_HD = 0.5;                         // half width / half depth of one desk + chair
const TABLE_X = [-3.36, -1.07], TABLE_DEPTH = 1.95;         // the teacher's table: x from the classroom centre, depth out from the north wall
const WAIT_TILE_W = 1.67, WAIT_TILE_D = 1.45;               // size in metres of one repeat of the waiting hall floor picture
const CLASS_FLOOR_PER = 3.0;                                // size in metres of one repeat of the classroom wood floor picture
// Hall
const RECEPTION = { x: -4.5, z: 3.0 }, REC_W = 2.6;          // counter faces EAST (toward the waiting benches), 2.6 m long along z; the staff chair is behind it (west)
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
// Wash basins: hung on the wall that divides each toilet from the hall (boys on the west side, girls on the east side). hangSink() below turns each one so its back is on the wall.
// If a basin still looks wrong, set SINK_BACK to the side of the model file where the tap and pipes are: 'x+', 'x-', 'z+' or 'z-' (null = work it out from the shape).
const SINK_BACK = null;
const SINK_TURN = 1;                                        // extra quarter turn for the basins: 1 or -1 (turns the other way), 0 = none
const SINK_Z = 1.0;
const SINK_WALL_BOYS = X_TW - T_IN / 2, SINK_WALL_GIRLS = X_TE + T_IN / 2;     // the wall faces the basins touch
// Upstairs: 9 folding cafeteria tables (cafeteria_table.glb: table with the two benches attached, 3.67 m x 1.3 m, long side along x)
const CAF_COLS = [-5.5, 0, 5.5], CAF_ROWS = [1.4, 4.0, 6.6], CAF_HW = 1.85, CAF_HD = 0.65;
const CAF_TABLES = CAF_COLS.flatMap(x => CAF_ROWS.map(z => ({ x, z })));
// Hostel rooms: 4 bunk beds (8 beds) and 6 lockers per room.
// Upstairs hostel rooms. Positions are measured from each room's centre (x) and the north wall (z).
const BUNK_X = [-2.65, -1.5, 1.5, 2.65], BUNK_HW = 0.57, BUNK_LEN = 2.0;       // 4 bunk beds side by side along the north wall (1.13 m x 2.0 m each), heads to the wall (8 beds per room)
const LOCKER_Z = [-6.6, -5.8, -5.0], LOCKER_X = 3.24;                          // 3 lockers against the east wall and 3 against the west wall (0.61 m deep, touching the wall)
// Locker banks (3 doors each) along the north wall of the downstairs corridor, between the classroom doorways and the name plates
const LBANK_X = [-13.0, -5.8, 1.5, 8.8], LBANK_Z = Z_CLASS + T_IN / 2 + 0.25;
// Kitchen (upstairs, SE room): fridge on the east wall, shelving on the north wall, cooker + sink unit on the south wall, all facing into the room
const FRIDGE = { x: E_IN - 0.385, z: 5.15 }, SHELF = { x: 12.5, z: Z_STORE + T_IN / 2 + 0.3 }, STATION = { x: 12.6, z: S_IN - 0.4 };
// Washroom showers (upstairs): one cubicle in the north-west corner of the boys washroom and the mirrored one in the girls washroom
const SHOWERS = [{ x: -13.5, z: Z_TOI + T_IN / 2 + 0.475 }, { x: 13.5, z: Z_TOI + T_IN / 2 + 0.475 }];
// Principal's office (SE corner)
const PRIN_DESK = { x: 12.55, z: 6.3 };                     // moved 0.75 m west: the principal's chair was half inside the east wall
const PRIN_SHELF = { x: 12.5, z: S_IN - 0.29 };

// ---------- collision boxes: [minX, maxX, minZ, maxZ] ----------

const spans = (from, to, gaps) => {
  const out = []; let a = from;
  [...gaps].sort((p, q) => p - q).forEach(g => { if (g - GAP / 2 > a) out.push([a, g - GAP / 2]); a = g + GAP / 2; });
  if (to > a) out.push([a, to]);
  return out;
};
const R = (x, z, hw, hd = hw) => [x - hw, x + hw, z - hd, z + hd];

const wallBoxes = list => list.flatMap(w => spans(w.from, w.to, w.gaps).map(([a, b]) =>
  w.alongX ? [a - 0.1, b + 0.1, w.fixed - 0.15, w.fixed + 0.15] : [w.fixed - 0.15, w.fixed + 0.15, a - 0.1, b + 0.1]));

// both floors: the outer walls (the south wall has the front doorway downstairs; upstairs nobody is near it) and the wall between the two flights of stairs
const BOTH_BOXES = [
  [X0 - 0.2, X1 + 0.2, Z0 - 0.2, N_IN],
  [X0 - 0.2, DOOR_X - DOOR_HALF, S_IN, Z1 + 0.2], [DOOR_X + DOOR_HALF, X1 + 0.2, S_IN, Z1 + 0.2],
  [X0 - 0.2, W_IN, Z0, Z1], [E_IN, X1 + 0.2, Z0, Z1],
  [IN_STAIR.sx + IN_STAIR.dividerFrom, IN_STAIR.sx + IN_STAIR.dividerTo, IN_STAIR.sz - IN_STAIR.dividerHalf, IN_STAIR.sz + IN_STAIR.dividerHalf],
];

// downstairs only
const GROUND_BOXES = [
  // interior walls (doorways left open)
  ...wallBoxes(IN_WALLS),
  // classrooms: desks, teacher's table, fan
  ...CLASS_C.flatMap(cx => [
    ...DESK_COLS.flatMap(o => DESK_ROWS.map(z => [cx + o - DESK_HW, cx + o + DESK_HW, z - DESK_HD, z + DESK_HD])),
    [cx + TABLE_X[0], cx + TABLE_X[1], N_IN, N_IN + TABLE_DEPTH], R(cx + 3.1, -9.0, 0.3),
  ]),
  // hall
  [RECEPTION.x - 0.65, RECEPTION.x + 0.65, RECEPTION.z - REC_W / 2, RECEPTION.z + REC_W / 2],
  ...BENCHES.map(b => [b.x - 0.35, b.x + 0.35, b.z - 1.05, b.z + 1.05]),
  [TROPHY.x - 0.8, TROPHY.x + 0.8, TROPHY.z - 0.25, TROPHY.z + 0.25],
  R(-1.2, 7.4, 0.3), R(5.2, 7.4, 0.3), R(9.8, 7.4, 0.3),                      // plants (the pot in front of the stairs doorway is gone)
  ...LBANK_X.map(x => [x - 0.96, x + 0.96, LBANK_Z - 0.23, LBANK_Z + 0.23]),   // locker banks in the corridor
  [-10.5, -10.1, 3.2, 3.6],                                                     // water dispenser (west wall of the hall)
  // toilets: stalls, basins, drum and bucket
  ...WC.map(w => [w.x - 0.3, w.x + 0.3, Z_TS - 0.7, Z_TS]),
  ...STALL_BLOCKS.flatMap(b => STALL_PLANES.map(o => [b.cx - o - 0.07, b.cx - o + 0.07, Z_TS - STALL_D, Z_TS])),
  [X_TW - T_IN / 2 - 0.5, X_TW - T_IN / 2, 0.7, 1.3], [X_TE + T_IN / 2, X_TE + T_IN / 2 + 0.5, 0.7, 1.3],
  R(-14.05, 0.35, 0.3), R(14.05, 0.35, 0.3),
  // principal's office
  [PRIN_DESK.x - 0.35, PRIN_DESK.x + 0.35, PRIN_DESK.z - 0.75, PRIN_DESK.z + 0.75],
  [PRIN_SHELF.x - 1.55, PRIN_SHELF.x + 1.55, PRIN_SHELF.z - 0.29, PRIN_SHELF.z + 0.29],
  [10.85, 11.55, 4.6, 5.3], R(14.05, 4.85, 0.25),
];

// upstairs only
const UPPER_BOXES = [
  ...wallBoxes(IN_WALLS_UP),
  // hostel rooms (only when the bunk bed / locker props exist)
  ...CLASS_C.flatMap(cx => [
    ...(has('bunk_bed') ? BUNK_X.map(o => [cx + o - BUNK_HW, cx + o + BUNK_HW, N_IN, N_IN + BUNK_LEN]) : []),
    ...(has('locker') ? LOCKER_Z.flatMap(z => [[cx + LOCKER_X - 0.3, cx + LOCKER_X + 0.3, z - 0.3, z + 0.3], [cx - LOCKER_X - 0.3, cx - LOCKER_X + 0.3, z - 0.3, z + 0.3]]) : []),
    R(cx + 3.0, -4.3, 0.3),                                                                               // standing fan
  ]),
  // cafeteria
  ...CAF_TABLES.map(t => [t.x - CAF_HW, t.x + CAF_HW, t.z - CAF_HD, t.z + CAF_HD]),
  [-10.5, -10.1, 1.8, 2.2], [10.1, 10.5, 1.8, 2.2],                                                      // water dispensers
  R(-9.8, 7.4, 0.3), R(9.8, 7.4, 0.3),                                                                   // plants
  // washrooms (same stalls, toilets and basins as downstairs)
  ...WC.map(w => [w.x - 0.3, w.x + 0.3, Z_TS - 0.7, Z_TS]),
  ...STALL_BLOCKS.flatMap(b => STALL_PLANES.map(o => [b.cx - o - 0.07, b.cx - o + 0.07, Z_TS - STALL_D, Z_TS])),
  [X_TW - T_IN / 2 - 0.5, X_TW - T_IN / 2, 0.7, 1.3], [X_TE + T_IN / 2, X_TE + T_IN / 2 + 0.5, 0.7, 1.3],
  // showers
  ...SHOWERS.map(s => [s.x - 0.77, s.x + 0.77, s.z - 0.46, s.z + 0.46]),
  // kitchen: fridge, shelving, cooker + sink unit, water drum, bucket
  [FRIDGE.x - 0.4, FRIDGE.x + 0.4, FRIDGE.z - 0.5, FRIDGE.z + 0.5], [SHELF.x - 0.8, SHELF.x + 0.8, SHELF.z - 0.28, SHELF.z + 0.28],
  [STATION.x - 0.87, STATION.x + 0.87, STATION.z - 0.38, STATION.z + 0.38], R(14.1, 7.45, 0.3), R(11.1, 7.65, 0.2),
];

export const HS_INTERIOR_BOXES = [...BOTH_BOXES, ...GROUND_BOXES.map(b => [...b, 0]), ...UPPER_BOXES.map(b => [...b, 1])];

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

const tiledXY = (map, w, d, tw, td) => {
  const t = map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / tw, d / td); t.anisotropy = 8; t.needsUpdate = true; return t;
};

// Hangs a wash basin on a wall so its BACK (tap and pipes) touches the wall and its front looks into the room.
// wallSide = +1 when the wall is on the +X side of the basin, -1 when it is on the -X side. The model's own front/back is worked out from its shape
// (a wall basin is shallower than it is wide, and the tap and pipes sit at the back), unless SINK_BACK says otherwise.
async function hangSink(parent, wallFaceX, z, wallSide) {
  const p = await loadProp('sink_wall');
  p.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  p.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); pts.push([v.x, v.y, v.z]); }
  });
  if (!pts.length) throw new Error('sink_wall has no geometry');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  pts.forEach(q => q.forEach((c, k) => { if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; }));
  const sx = hi[0] - lo[0], sz = hi[2] - lo[2], h = hi[1] - lo[1], bx = (lo[0] + hi[0]) / 2, bz = (lo[2] + hi[2]) / 2;
  const mean = sel => { const m = [0, 0, 0]; sel.forEach(q => { m[0] += q[0]; m[2] += q[2]; m[1]++; }); return m[1] ? [m[0] / m[1] - bx, m[2] / m[1] - bz] : [0, 0]; };
  const top = mean(pts.filter(q => q[1] > hi[1] - 0.2 * h)), bottom = mean(pts.filter(q => q[1] < lo[1] + 0.45 * h));
  const cue = [top[0] + bottom[0], top[1] + bottom[1]];                       // the tap (top) and the pipes (bottom) lean towards the back
  let back;                                                                   // direction of the model's back, in the model's own axes
  if (SINK_BACK) back = { 'x+': [1, 0], 'x-': [-1, 0], 'z+': [0, 1], 'z-': [0, -1] }[SINK_BACK];
  else {
    const axis = sx < sz * 0.9 ? 0 : sz < sx * 0.9 ? 1 : (Math.abs(cue[0]) > Math.abs(cue[1]) ? 0 : 1);     // the shallow side is the front-to-back side
    const sign = Math.abs(cue[axis]) > 0.004 ? Math.sign(cue[axis]) : -1;
    back = axis === 0 ? [sign, 0] : [0, sign];
  }
  if (SINK_TURN) back = SINK_TURN > 0 ? [back[1], -back[0]] : [-back[1], back[0]];     // extra quarter turn (the basin was facing the wrong way)
  const depth = back[0] !== 0 ? sx : sz;
  p.rotation.y = Math.atan2(wallSide, 0) - Math.atan2(back[0], back[1]);       // turn the back to face the wall
  p.position.set(wallFaceX - wallSide * (depth / 2 + 0.01), 0.4, z);
  parent.add(p);
  return p;
}

// ---------- the building ----------

export function buildHighSchoolInterior() {
  const root = new THREE.Group();           // everything inside, both floors (shown only while the player is inside); game.js lifts it onto the steps
  const group = new THREE.Group();          // downstairs
  const up = new THREE.Group();             // upstairs (FLOOR_H higher), shown while the player is upstairs
  root.add(group, up); up.position.y = FLOOR_H; up.visible = false;
  const marker = new THREE.Group();         // the door marker outside (shown only while the player is outside)
  const M = {
    paint: std(WALL_WHITE, 0.9), skirt: std(0xd2d0ca, 0.7),
    tile: std(0xcdc6b8, 0.5), classFloor: std(0xb98a52, 0.7), wood: std(0x8b5a2b, 0.85), darkwood: std(0x5a3a1c, 0.8),
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
  const plane = (x0, x1, z0, z1, y, mat, parent = group) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; parent.add(m); return m;
  };
  const hallFloor = plane(X0, X1, Z0, Z1, 0.01, M.tile);                         // hall, reception, corridor, toilets, store, office: ONE floor, the waiting-hall tiles everywhere
  const classFloors = CLASS_X.slice(0, 4).map((x, i) => plane(x, CLASS_X[i + 1], Z0, Z_CLASS, 0.02, M.classFloor));
  // upstairs floors: the same tiles everywhere except the stairwell (west block, south part), wooden floors in the 4 hostel rooms
  const upTileFloors = [plane(X_TW, X1, Z0, Z1, 0.01, M.tile, up), plane(X0, X_TW, Z0, Z_STORE, 0.01, M.tile, up)];
  const dormFloors = CLASS_X.slice(0, 4).map((x, i) => plane(x, CLASS_X[i + 1], Z0, Z_CLASS, 0.02, M.classFloor, up));
  borrowMap(TILE_FILE).then(map => {                                                                             // your waiting-hall tile: clean planks, seamless
    [hallFloor, ...upTileFloors].forEach(f => {
      const w = f.geometry.parameters.width, d = f.geometry.parameters.height;
      f.material = new THREE.MeshStandardMaterial({ map: tiledXY(map, w, d, WAIT_TILE_W, WAIT_TILE_D), roughness: 0.5, metalness: 0.05 });
    });
  }).catch(warn('floor tiles (keeping the plain floor)'));
  loadGLB(CLASS_FILE).then(gltf => {                                                                             // the wooden floor of your classroom
    let map = null; gltf.scene.traverse(o => { if (o.isMesh && o.name === 'FloorTile' && o.material.map) map = o.material.map; });
    if (!map) throw new Error('no FloorTile in ' + CLASS_FILE);
    [...classFloors, ...dormFloors].forEach((f, i) => {
      f.material = new THREE.MeshStandardMaterial({ map: tiledXY(map, CLASS_X[(i % 4) + 1] - CLASS_X[i % 4], Z_CLASS - Z0, CLASS_FLOOR_PER, CLASS_FLOOR_PER), roughness: 0.7 });
    });
  }).catch(warn('classroom floor (keeping a plain floor)'));

  // ----- walls: lower band always visible, upper part only while the camera is in that room (as in the immigration office) -----
  const addWall = (lowG, upG, alongX, fixed, from, to, gaps, thick) => {
    const put = (mat, a, b, y0, y1, g, extra = 0) => {
      const len = b - a, c = (a + b) / 2, h = y1 - y0;
      box(g, mat, alongX ? len : thick + extra, h, alongX ? thick + extra : len, alongX ? c : fixed, y0 + h / 2, alongX ? fixed : c);
    };
    spans(from, to, gaps).forEach(([a, b]) => {
      put(M.paint, a, b, 0, LOW_H, lowG);                         // plain white wall, lower part (always visible)
      put(M.skirt, a, b, 0, 0.1, lowG, 0.03);
      put(M.paint, a, b, LOW_H, WALL_H, upG);                     // plain white wall, upper part
    });
    gaps.forEach(g => put(M.paint, g - GAP / 2, g + GAP / 2, DOOR_H, WALL_H, upG));
  };
  // one set of walls for a floor: the outer walls hide when the camera is outside them, the inner walls' upper parts hide unless the camera is in that room
  const buildWalls = (parent, inWalls, frontDoor) => {
    const side = { N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
    Object.values(side).forEach(g => parent.add(g));
    addWall(side.N, side.N, true, Z0 + T_OUT / 2, X0, X1, [], T_OUT);
    if (frontDoor) {
      addWall(side.S, side.S, true, Z1 - T_OUT / 2, X0, DOOR_X - DOOR_HALF, [], T_OUT);
      addWall(side.S, side.S, true, Z1 - T_OUT / 2, DOOR_X + DOOR_HALF, X1, [], T_OUT);
      box(side.S, M.paint, DOOR_HALF * 2, WALL_H - DOOR_H, T_OUT, DOOR_X, DOOR_H + (WALL_H - DOOR_H) / 2, Z1 - T_OUT / 2);   // beam over the front door
    } else addWall(side.S, side.S, true, Z1 - T_OUT / 2, X0, X1, [], T_OUT);
    addWall(side.W, side.W, false, X0 + T_OUT / 2, Z0, Z1, [], T_OUT);
    addWall(side.E, side.E, false, X1 - T_OUT / 2, Z0, Z1, [], T_OUT);
    const lowG = new THREE.Group(); parent.add(lowG);
    const uppers = [];
    inWalls.forEach(w => {
      const u = new THREE.Group(); parent.add(u); uppers.push({ up: u, rooms: w.rooms });
      addWall(lowG, u, w.alongX, w.fixed, w.from, w.to, w.gaps, T_IN);
    });
    return { side, lowG, uppers };
  };
  const W0 = buildWalls(group, IN_WALLS, true);          // downstairs
  const W1 = buildWalls(up, IN_WALLS_UP, false);         // upstairs
  const { side, lowG, uppers } = W0;

  // small name plate on a wall (canvas picture)
  const plate = (parent, text, x, y, z, rotY, w = 0.9, bg = '#2e7d4f') => {
    const tex = canvasTex(512, 128, (g, cw, ch) => {
      g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, cw - 12, ch - 12);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, text, cw - 50, 68); g.fillText(text, cw / 2, ch / 2 + 4);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m); return m;
  };

  // ----- exit marker (inside the front door) -----
  lib(group, 'gta_marker_blue', DOOR_X, 0.02, Z1 - 1.7);

  // ----- classrooms: your classroom_gameready file (board, clock, teacher's table + chair, globe, tools) and your school desks -----
  const deskPlaces = CLASS_C.flatMap(cx => DESK_COLS.flatMap(o => DESK_ROWS.map(z => [cx + o, z])));
  loadGLB(DESK_FILE).then(gltf => {                                                                           // one desk model, repeated in every classroom
    const dm = new THREE.Object3D();
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, deskPlaces.length);
      deskPlaces.forEach(([x, z], i) => { dm.position.set(x, 0, z); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); });   // every desk faces north, towards the board
      im.frustumCulled = false; im.receiveShadow = true; group.add(im);
    });
  }).catch(warn(DESK_FILE));

  CLASS_C.forEach((cx, i) => {
    // the board and clock hang on the north wall, so they belong to the north wall group (they hide with it); the table, chair and globe stand on the floor
    const gWall = new THREE.Group(), gFloor = new THREE.Group();
    gWall.position.set(cx, 0, N_IN); gFloor.position.set(cx, 0, N_IN); side.N.add(gWall); group.add(gFloor);
    loadGLB(CLASS_FILE).then(gltf => {
      const copy = SkeletonUtils.clone(gltf.scene);
      copy.children.slice().forEach(o => {
        if (o.name === 'FloorTile') return;
        o.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
        (/^(Blackboard|Clock|Arrow2?)$/.test(o.name) ? gWall : gFloor).add(o);
      });
    }).catch(warn(CLASS_FILE));
    lib(group, 'standing_fan', cx + 3.1, 0, -9.0, 0.5);
    plate(lowG, CLASS_NAMES[i], cx + 1.15, 0.82, Z_CLASS + T_IN / 2 + 0.012, 0, 0.9);       // name plate beside each doorway, on the corridor side (low, so it is always visible)
  });

  // ----- hall / reception -----
  mine(group, 'reception_desk.glb', { axis: 'x', size: REC_W, rotY: Math.PI / 2 }, RECEPTION.x, 0, RECEPTION.z);   // turned so the front faces EAST, towards the waiting benches
  lib(group, 'office_chair', RECEPTION.x - 1.3, 0, RECEPTION.z, Math.PI / 2);                          // receptionist's chair behind the counter (west), faces the counter
  BENCHES.forEach(b => lib(group, 'bench_3seat', b.x, 0, b.z, -Math.PI / 2));                          // benches face west
  lib(group, 'water_dispenser', -10.3, 0, 3.4, Math.PI / 2);                                          // on the west wall of the hall, facing east (it used to stand behind the benches)
  lib(group, 'plant_monstera', -1.2, 0, 7.4); lib(group, 'plant_pot', 5.2, 0, 7.4);
  lib(group, 'plant_pot', 9.8, 0, 7.4);                                                              // (the pot at x = -9.8 stood in front of the stairs doorway: removed)
  lib(side.S, 'fire_extinguisher', 5.0, 1.2, S_IN - 0.12, Math.PI);
  lib(side.E, 'fire_extinguisher', E_IN - 0.12, 1.2, -2.2, -Math.PI / 2);
  lib(side.W, 'standing_fan', W_IN + 0.4, 0, -2.2, Math.PI / 2);
  LBANK_X.forEach(x => lib(group, 'locker_bank', x, 0, LBANK_Z, 0));                                  // locker banks on the corridor's north wall, doors facing the corridor

  // trophy cabinet against the south wall
  {
    const g = new THREE.Group(); g.position.set(TROPHY.x, 0, TROPHY.z); g.rotation.y = Math.PI; group.add(g);   // turned round: the glass front looks north, into the hall (it was facing the wall)
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
  hangSink(group, SINK_WALL_BOYS, SINK_Z, +1).catch(warn('sink_wall (boys)'));                         // boys: basin west of the wall, back on the wall
  hangSink(group, SINK_WALL_GIRLS, SINK_Z, -1).catch(warn('sink_wall (girls)'));                       // girls: basin east of the wall, back on the wall
  [-1, 1].forEach(s => {
    mine(group, 'water_drum_optimised.glb', { axis: 'y', size: 0.9 }, s * 14.05, 0, 0.35);
    mine(group, 'bucket_optimised.glb', { axis: 'y', size: 0.3 }, s * 13.55, 0, 0.3);
  });

  // ----- the stairs (SW, where the cleaners' store was): your stairs.glb, turned so you walk in from the hall door and climb west, turn at the landing and come back east to the upper floor -----
  loadGLB('stairs_optimised.glb').then(gltf => {
    const st = SkeletonUtils.clone(gltf.scene);
    st.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    const holder = new THREE.Group();
    holder.position.set(IN_STAIR.sx, 0, IN_STAIR.sz); holder.rotation.y = Math.PI / 2; holder.scale.setScalar(IN_STAIR.k);
    holder.add(st); group.add(holder);
  }).catch(warn('stairs_optimised.glb'));
  plate(lowG, 'STAIRS', X_TW + T_IN / 2 + 0.012, 0.85, 5.4, Math.PI / 2, 0.7, '#1f4e79');   // sign on the hall side of the stairs wall

  // ----- principal's office (SE): desk, chairs, computer, globe, bookshelf, filing cabinet, flag -----
  box(group, M.darkwood, 0.7, 0.05, 1.5, PRIN_DESK.x, 0.76, PRIN_DESK.z);
  box(group, M.darkwood, 0.62, 0.7, 1.4, PRIN_DESK.x, 0.35, PRIN_DESK.z);
  lib(group, 'office_chair', PRIN_DESK.x + 0.9, 0, PRIN_DESK.z, -Math.PI / 2);                  // principal's chair (east), faces west; its back is 0.65 m from the wall now
  lib(group, 'office_chair', PRIN_DESK.x - 0.9, 0, PRIN_DESK.z - 0.4, Math.PI / 2);             // visitor chairs (west), face east
  lib(group, 'office_chair', PRIN_DESK.x - 0.9, 0, PRIN_DESK.z + 0.4, Math.PI / 2);
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

  // ======================= UPSTAIRS: hostel rooms, cafeteria, washrooms, kitchen =======================
  // The floor plan is the same as downstairs; everything here uses props_library props, nothing is built from boxes.
  // Hostel rooms: bunk beds and lockers (props you still have to add, see the has(...) checks), a standing fan in each room.
  CLASS_C.forEach((cx, i) => {
    if (has('bunk_bed')) BUNK_X.forEach(o => lib(up, 'bunk_bed', cx + o, 0, N_IN + BUNK_LEN / 2, 0));      // heads against the north wall
    if (has('locker')) LOCKER_Z.forEach(z => { lib(up, 'locker', cx + LOCKER_X, 0, z, -Math.PI / 2); lib(up, 'locker', cx - LOCKER_X, 0, z, Math.PI / 2); });
    lib(up, 'standing_fan', cx + 3.0, 0, -4.3, Math.PI);
    plate(W1.lowG, DORM_NAMES[i], cx + 1.15, 0.82, Z_CLASS + T_IN / 2 + 0.012, 0, 0.9, i < 2 ? '#1f4e79' : '#8a2b5c');
  });

  // Cafeteria: 9 folding tables (benches attached), long side along x
  CAF_TABLES.forEach(t => lib(up, 'cafeteria_table', t.x, 0, t.z, 0));
  lib(up, 'water_dispenser', -10.3, 0, 2.0, Math.PI / 2); lib(up, 'water_dispenser', 10.3, 0, 2.0, -Math.PI / 2);
  lib(up, 'plant_pot', -9.8, 0, 7.4); lib(up, 'plant_pot', 9.8, 0, 7.4);
  lib(up, 'bin_office', -8.5, 0, 7.6); lib(up, 'bin_office', 8.5, 0, 7.6);
  lib(W1.side.S, 'fire_extinguisher', 5.0, 1.2, S_IN - 0.12, Math.PI); lib(W1.side.S, 'fire_extinguisher', -5.0, 1.2, S_IN - 0.12, Math.PI);
  plate(W1.lowG, 'STAIRS', X_TW + T_IN / 2 + 0.012, 0.85, STAIR_TOP_DOOR_Z + 1.05, Math.PI / 2, 0.7, '#1f4e79');

  // Washrooms (boys west, girls east): the same stalls, toilets and basins as downstairs
  const stallUpU = { tb: new THREE.Group(), tg: new THREE.Group() };
  Object.entries(stallUpU).forEach(([room, g]) => { up.add(g); W1.uppers.push({ up: g, rooms: [room] }); });
  STALL_BLOCKS.forEach(b => {
    mine(up, STALL_FILE, { axis: 'x', size: STALL_W, rotY: Math.PI, hide: /StallHigh/ }, b.cx, 0, STALL_CZ);
    mine(stallUpU[b.room], STALL_FILE, { axis: 'x', size: STALL_W, rotY: Math.PI, hide: /StallLow/ }, b.cx, 0, STALL_CZ);
  });
  WC.forEach(w => lib(up, 'toilet', w.x, 0, w.z, Math.PI));
  hangSink(up, SINK_WALL_BOYS, SINK_Z, +1).catch(warn('sink_wall (upstairs boys)'));
  hangSink(up, SINK_WALL_GIRLS, SINK_Z, -1).catch(warn('sink_wall (upstairs girls)'));
  plate(W1.lowG, 'BOYS WASHROOM', -11.3, 0.85, Z_TOI - T_IN / 2 - 0.012, Math.PI, 0.9, '#1f4e79');
  plate(W1.lowG, 'GIRLS WASHROOM', 11.3, 0.85, Z_TOI - T_IN / 2 - 0.012, Math.PI, 0.9, '#8a2b5c');

  // Showers (one cubicle in each washroom, back to the north wall). If a cubicle opens the wrong way, change the 0 to Math.PI.
  SHOWERS.forEach(s => lib(up, 'shower_cubicle', s.x, 0, s.z, 0));

  // Kitchen (SE): fridge, shelving, cooker + sink unit, water drum and bucket
  lib(up, 'fridge', FRIDGE.x, 0, FRIDGE.z, -Math.PI / 2);              // on the east wall, door faces west into the room
  lib(up, 'steel_shelving', SHELF.x, 0, SHELF.z, 0);                  // on the north wall, shelves face south
  lib(up, 'kitchen_station', STATION.x, 0, STATION.z, Math.PI);       // against the south wall, faces north
  mine(up, 'water_drum_optimised.glb', { axis: 'y', size: 0.9 }, 14.1, 0, 7.45);
  mine(up, 'bucket_optimised.glb', { axis: 'y', size: 0.3 }, 11.1, 0, 7.65);
  plate(W1.lowG, 'KITCHEN', X_TE - T_IN / 2 - 0.012, 0.85, DOOR_SIDE_Z - 1.15, -Math.PI / 2, 0.7, '#7a4a1a');

  // ----- hooks used by game.js -----
  const setInside = inside => { root.visible = inside; marker.visible = !inside; };
  const setLevel = level => { up.visible = level === 1; };      // downstairs always stays (you see it through the stairwell); upstairs only when you are up there
  const inRoom = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const setCamera = (relX, relZ) => {
    [W0, W1].forEach(w => {
      w.side.N.visible = !(relZ < Z0);
      w.side.S.visible = !(relZ > Z1);
      w.side.W.visible = !(relX < X0);
      w.side.E.visible = !(relX > X1);
      w.uppers.forEach(u => { u.up.visible = u.rooms.some(n => inRoom(ROOMS[n], relX, relZ)); });
    });
  };
  setInside(false);
  setCamera(0, 0);

  return { group: root, marker, halfW: HALF_W, halfD: HALF_D, cz: CZ, setInside, setCamera, setLevel };
}
