// mall_interior.js  (the five floors, the entrance, the escalators, the lift, and the SUPERMARKET on the ground floor.
//                    The other floors are still empty: their shops come in the next steps)
//
// Exports:  buildMallInterior() -> { group, marker, halfW, halfD, cz, setInside(bool), setCamera(relX, relZ), setLevel(0..4), update(dt, ctx) }
//           MALL_INTERIOR_BOXES -> solid parts for collisions: [minX, maxX, minZ, maxZ, level]   (level missing = every floor)
//           MALL_STAIRS         -> the floor heights and the two escalator lanes, for stairs.js (it lifts the characters)
//           MALL_SHELL          -> the wall numbers, so commercial_exterior.js can leave the doorway open
//           FLOOR_Y, ROOF_Y, FLOORS, floorName(level), ESCALATOR, ELEVATOR  (numbers the next steps will use)
//
// SPACE: the same "plot-local" space as commercial_exterior.js (plot centre = 0,0, the road / front side is +Z),
// so the interior sits exactly inside the mall model. The mall centre is MALL_Z (= -9.52, the same number as MALL.z in commercial_exterior.js).
//
// THE FIVE FLOORS (your plan)                      floor level = the height of the floor above the ground
//   Level 4   FURNITURE (west)  |  ELECTRONICS (east)        25.76 m
//   Level 3   FASHION                                         19.05 m
//   Level 2   SPA (west)        |  GYM (east)                 12.34 m
//   Level 1   CAFE (west)       |  RESTAURANT (east)           5.64 m
//   Level 0   SUPERMARKET  (+ the entrance lobby)              0 m
//
// The heights come from your mall model: its glass bands start at 5.64, 12.34, 19.05 and 25.76 m and the roof is at 32.46 m.
// If the floor lines do not match the windows, test live without editing anything: add  ?floorh=6.5  to the web address (equal floors of that height).
//
// EVERY FLOOR (same plan, so the next steps are easy):
//
//   back wall (north, -Z)
//   +----------------------------------------------+
//   |                                              |
//   |        SHOP AREA                             |      floors 1-4: coloured patches on the floor with the zone name,
//   |                                              |      the shops get built inside them in the next steps
//   |                                              |
//   +----------------------------------------------+
//   |  [ESCALATORS]           [door]      [LIFT]   |      LOBBY: the escalators (a hole in the floor above the ground),
//   +--------------------[front wall]--------------+      the entrance door (ground floor only), the lift
//
//   ESCALATORS = your metaretail escalator (mall_escalator_lane_new_optimised.glb): ONE lane, at its real proportions (1.5 m wide, 33 degrees),
//        two lanes side by side between every pair of floors, like your layout picture. Open hole in the floor, your glass balustrade round it, no walls.
//        Lane A (north lane): low end WEST, high end EAST   -> goes UP when you step on at the west end.
//        Lane B (south lane): high end WEST, low end EAST   -> goes DOWN when you step on at the west end.
//        (the treads do not move: the lane was lengthened to reach every floor, which cannot keep the original tread animation)
//   LIFT = your elevator_animated.glb in a shaft on every floor. Stand in front of its door (there is no painted label any more): the real animated
//        doors open and a panel with the five floors appears. Tap a floor and you are taken there (a short fade).
//   NO LABELS inside: no painted floor names, no signs, no yellow lines.
//   WALLS = your slat wall panel (mall_wall_panel.glb) on every outer wall and on the shop side of the restrooms and the staff room.
//   FLOORS = your dark tile (mall_floor_tile_optimised.glb); the restrooms have your checkered floor (bathroom_floor_optimised.glb).
//   RESTROOMS = your toilet_stalls_4.glb (4 stalls each), your toilet and your sink_wall.
//
// THE SUPERMARKET (ground floor, behind the lobby line z = 4.5):
//
//   back wall (north)
//   +--------+-------------------------------------------+---------+
//   |RESTRMS | drinks wall | FRIDGES (doors open when you | chips   | STAFF   |   restrooms (men | women) in the north-west corner,
//   |men|wmn |             |  walk up to them)            | wall    | ONLY    |   STAFF ONLY room in the north-east corner (lockers, table, fridge)
//   +--[ ]-[ ]------------------------------------------------+--[ ]---------+
//   |  (free)  |  aisle 1 | aisle 2 |  main aisle  | aisle 3 | aisle 4 | snacks |   4 aisles of stocked gondolas
//   | tables  |          |         |  (the door)  |         |         |        |
//   |        [CHECKOUT 1] [2] [3] [4]                                          |   4 checkouts, cashier's side faces east, belt starts on the shop side
//   +---------------------- lobby line z = 4.5 -----------------------------+
//
// The shelves are stocked with INSTANCED products (sm_products_optimised.glb): thousands of items cost only a few draw calls.
// If the game runs slowly on a weak tablet, lower DENSITY below (0.5 = half as many items on the shelves).
//
// game.js uses: interior: buildMallInterior, boxes: [...COMM_BOXES, ...MALL_INTERIOR_BOXES], stairs: MALL_STAIRS (see game.js).
//
// FILES NEEDED in props/ (new ones from this step are marked *):
//   mall_escalator_lane_new_optimised.glb *   mall_balustrade_optimised.glb *   mall_wall_panel.glb *   mall_floor_tile_optimised.glb *   bathroom_floor_optimised.glb *
//   toilet_stalls_4.glb (you already have it)
//   supermarket_chips_shelf_optimised.glb, supermarket_drinks_shelf_optimised.glb, gta_marker_red.glb   (you already have these)
//   elevator_animated.glb *   fridge_animated.glb *   register_optimised.glb *   sm_checkout_optimised.glb *   sm_gondola_optimised.glb *
//   sm_products_optimised.glb *
//   and from props_library.js: toilet, sink_wall, locker_bank, office_table, plastic_chair, fridge, filing_cabinet (the staff room and restrooms use them if they are registered).
// If a file is missing the game keeps running and that item is skipped (see the browser console).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS, PROPS_DIR, loadProp } from './props_library.js';

// ---------- size and layout (metres) ----------
export const MALL_Z = -9.52;                       // z of the mall centre in plot space (MALL.z in commercial_exterior.js)
const HW = 16.0, HD = 11.4;                        // inner half width (x) and half depth (z) of every floor, measured from the mall model
const T = 0.3;                                     // thickness of the walls and the floor slabs
const DOOR_X = 3.3, DOOR_HALF = 2.5, DOOR_H = 3.4; // front entrance on the ground floor (same x as ENTRANCE_X in commercial_exterior.js)
const LOBBY_Z = 4.5;                               // the lobby strip is z 4.5 .. 11.4 (front); the shop area is behind it

export const ESCALATOR = { x0: -15.7, x1: -2.05, z0: 6.2, z1: 9.8 };  // hole in the floors 1-4 (mall-centre space), 13.65 m long = your escalator lane; two lanes, split at the middle
const ESC_XC = (ESCALATOR.x0 + ESCALATOR.x1) / 2, ESC_LOW_PLATE = 5.788, ESC_HIGH_PLATE = 6.548, ESC_RISE = 6.705;   // measured from the lane file: the plates' far ends from its middle, and its height
const ZM = (ESCALATOR.z0 + ESCALATOR.z1) / 2;                          // the line between lane A (north, z < ZM) and lane B (south, z > ZM)
export const ELEVATOR  = { x0: 12.0,  x1: 15.2, z0: 6.4, z1: 9.6 };   // lift shaft, solid on every floor

const URL_H = parseFloat(new URLSearchParams(location.search).get('floorh'));
const EQUAL = Number.isFinite(URL_H) && URL_H > 2 && URL_H < 12;
export const FLOOR_Y = EQUAL ? [0, 1, 2, 3, 4].map(i => i * URL_H) : [0, 5.64, 12.34, 19.05, 25.76];
export const ROOF_Y  = EQUAL ? 5 * URL_H : 32.46;
const floorH = i => (i < 4 ? FLOOR_Y[i + 1] : ROOF_Y) - FLOOR_Y[i];

// the shop areas of each floor (x0, x1 in mall-centre space; they all run from the back wall to the lobby)
export const FLOORS = [
  { name: 'GROUND FLOOR', title: 'SUPERMARKET', zones: [{ name: 'SUPERMARKET', x0: -HW, x1: HW, col: '#2e7d32' }] },
  { name: 'LEVEL 1', title: 'CAFE & RESTAURANT', zones: [{ name: 'CAFE', x0: -HW, x1: 0, col: '#8d5524' }, { name: 'RESTAURANT', x0: 0, x1: HW, col: '#b23a2a' }] },
  { name: 'LEVEL 2', title: 'SPA & GYM', zones: [{ name: 'SPA', x0: -HW, x1: 0, col: '#1f8a8a' }, { name: 'GYM', x0: 0, x1: HW, col: '#44546a' }] },
  { name: 'LEVEL 3', title: 'FASHION', zones: [{ name: 'FASHION', x0: -HW, x1: HW, col: '#8e3b8e' }] },
  { name: 'LEVEL 4', title: 'FURNITURE & ELECTRONICS', zones: [{ name: 'FURNITURE', x0: -HW, x1: 0, col: '#a9742f' }, { name: 'ELECTRONICS', x0: 0, x1: HW, col: '#1d5fa8' }] },
];
export const floorName = level => (FLOORS[level] ? FLOORS[level].name : '');

export const MALL_SHELL = { hw: HW, hd: HD, t: T, doorX: DOOR_X, doorHalf: DOOR_HALF };

// For stairs.js (plot space): how high each floor is, and the two escalator lanes. low = the end where the lane touches the LOWER floor.
export const MALL_STAIRS = {
  floorsY: FLOOR_Y,
  footprint: { x0: -HW, x1: HW, z0: MALL_Z - HD, z1: MALL_Z + HD },
  lanes: [
    { id: 'A', low: 'W', x0: ESC_XC - ESC_LOW_PLATE, x1: ESC_XC + ESC_HIGH_PLATE, z0: ESCALATOR.z0 + MALL_Z, z1: ZM + MALL_Z },     // from the far end of the lower plate to the far end of the upper plate
    { id: 'B', low: 'E', x0: ESC_XC - ESC_HIGH_PLATE, x1: ESC_XC + ESC_LOW_PLATE, z0: ZM + MALL_Z, z1: ESCALATOR.z1 + MALL_Z },
  ],
};



// ---------- STEP 3 (rebuilt): the supermarket ----------
// Everything here is in mall-centre space: x across, z from the middle of the mall (back wall z = -HD, the lobby starts at z = LOBBY_Z).
const SM_PROPS = {                                       // props you already had
  sm_chips_shelf:  { file: 'supermarket_chips_shelf_optimised.glb',  unit: 1.0, tags: ['mall', 'supermarket'] },   // 2.73 m long, 1.33 m tall, front faces +Z
  sm_drinks_shelf: { file: 'supermarket_drinks_shelf_optimised.glb', unit: 1.0, tags: ['mall', 'supermarket'] },   // 1.80 m long, 1.23 m tall, front faces +Z
  gta_marker_red:  { file: 'gta_marker_red.glb', maxXZ: 1.9, glow: true, tags: ['marker'] },                       // red gradient marker = commercial building
};
Object.entries(SM_PROPS).forEach(([k, v]) => { if (!PROPS[k]) PROPS[k] = v; });

const FILES = {                                          // the new files of this step (all in props/)
  gondola: 'sm_gondola_optimised.glb',                   // double-sided island shelf: 2.01 m long (along z), 0.65 m wide, 4 shelves   (0.03 MB)
  checkout: 'sm_checkout_optimised.glb',                 // checkout counter 3.34 m long (belt starts at +x, scanner at -x, drawers + cashier on the +z side)
  register: 'register_optimised.glb',                    // cash register, 0.40 m wide, its feet are at y = 0, keys face +z
  products: 'sm_products_optimised.glb',                 // 22 packaged products, one named item each
  fridge: 'fridge_animated.glb',                         // your double-door fridge with its two door animations (0.9 m wide, 1.87 m tall, doors face +Z)
  lift: 'elevator_animated.glb',                         // your lift with the sliding doors animation (the doors face +X in the file, we turn it)
  escalator: 'mall_escalator_lane_new_optimised.glb',    // one escalator lane of your metaretail escalator (13.65 m long, 1.5 m wide, 6.705 m high, low end at +x in the file)
  rail: 'mall_balustrade_optimised.glb',                 // one balustrade segment: 3.14 m of glass with a post (length along z)
  wall: 'mall_wall_panel.glb',                           // one slat panel: 0.402 m wide x 2.492 m tall, origin at its bottom-left corner, face towards +z
  floor: 'mall_floor_tile_optimised.glb',                // your dark tile (the picture is repeated; 6 x 6 tiles = 2 m)
  checker: 'bathroom_floor_optimised.glb',               // your checkered floor (6 x 6 squares per picture)
  stalls: 'toilet_stalls_4.glb',                         // your 4-stall block (3.151 m x 1.641 m); the stalls open towards +z in the file
};

// ---- knobs ----
const DENSITY = 0.9;                                     // 0..1: how full the shelves are (1 = every slot has a product). Lower it if the game runs slowly.
const PRODUCT_SCALE = 1.2;                               // products are real size (a can is 7 cm); 1.2 makes them readable from the game camera
const PRODUCT_FACE = 0;                                  // if the labels face INTO the shelf, set this to Math.PI
const CHECKOUT_FLIP = 0;                                 // if a counter faces the wrong way, set this to Math.PI (turns all four round)
const FRIDGE_OPEN_T = 3.2, LIFT_OPEN_T = 2.4;            // clip time at which the doors are fully open (the animations hold that pose for a while)
const MARKER_OUT = 2.2;                                  // how far in front of the mall's front face (z = 2.96 in plot space) the entrance marker lies on the plaza
const FRIDGE_RANGE = 1.7;                                // metres from the fridge front at which its doors open

// ---- products: [width, height, depth] in metres (measured from the file) ----
const PRODUCT = {
  bleach: [0.168, 0.300, 0.168], water_bottle: [0.047, 0.187, 0.047], can_b: [0.066, 0.125, 0.065], can_c: [0.065, 0.125, 0.065], can_d: [0.065, 0.082, 0.066],
  can_e: [0.065, 0.082, 0.065], can_h: [0.072, 0.063, 0.072], can_i: [0.072, 0.063, 0.072], cereal: [0.158, 0.186, 0.069], coffee_box: [0.128, 0.216, 0.042],
  detergent_liquid: [0.114, 0.227, 0.091], detergent_powder_a: [0.082, 0.225, 0.082], detergent_powder_b: [0.158, 0.186, 0.082], detergent_powder_c: [0.041, 0.134, 0.044],
  dish_liquid: [0.098, 0.222, 0.059], juice_carton: [0.121, 0.237, 0.109], milk_bottle: [0.089, 0.234, 0.088], olive_oil: [0.062, 0.231, 0.063], pasta: [0.094, 0.252, 0.060],
  porridge: [0.148, 0.216, 0.039], protein_jar: [0.147, 0.191, 0.147], salt: [0.095, 0.216, 0.079], sauce: [0.076, 0.191, 0.060],
};
const AISLES = [                                         // which products each aisle sells (they are repeated in runs of 2-5, like a real shelf)
  { name: 'AISLE 1', sub: 'CANNED FOOD',          items: ['can_b', 'can_c', 'can_d', 'can_e', 'can_h', 'can_i'] },
  { name: 'AISLE 2', sub: 'BREAKFAST & PASTA',    items: ['cereal', 'porridge', 'pasta', 'coffee_box', 'salt', 'olive_oil'] },
  { name: 'AISLE 3', sub: 'HOUSEHOLD',            items: ['detergent_liquid', 'detergent_powder_a', 'detergent_powder_b', 'detergent_powder_c', 'dish_liquid', 'bleach'] },
  { name: 'AISLE 4', sub: 'DRINKS & SAUCES',      items: ['water_bottle', 'juice_carton', 'milk_bottle', 'protein_jar', 'sauce'] },
];

// ---- the gondolas (island shelves, stocked on both sides) ----
const GOND = { len: 2.011, wid: 0.647, tops: [0.091, 0.507, 0.931, 1.362], half: 0.271 };   // shelf board tops (y) and how far a board reaches from the middle post
const Z4 = [-7.6, -5.67, -3.74, -1.81], Z2 = [-3.74, -1.81];
const ROWS = [{ x: -6.6, aisle: 0, zs: Z4 }, { x: -3.2, aisle: 1, zs: Z4 }, { x: 7.6, aisle: 2, zs: Z4 }, { x: 11.0, aisle: 3, zs: Z2 }];
const GONDOLAS = ROWS.flatMap(r => r.zs.map((z, i) => ({ x: r.x, z, aisle: r.aisle, first: i === 0, last: i === r.zs.length - 1 })));

// ---- the walls of the shop: size of each of your wall shelves [along its own x, along its own z] ----
const SM_SIZE = { sm_chips_shelf: [2.733, 0.586], sm_drinks_shelf: [1.803, 0.379], fridge: [0.909, 0.695] };
const BACK = {                                           // everything against the back wall, centres in x
  drinks: [-8.7, -6.9, -5.1],
  fridges: [0, 1, 2, 3, 4, 5].map(i => -3.6 + i * 0.95),
  chips: [3.2, 6.0, 8.8],
};
const WALL_CHIPS_E = [-3.8, -0.9];                       // chips shelves on the east wall (facing west): their z
const wallZ = prop => -HD + 0.03 + SM_SIZE[prop][1] / 2; // z of a shelf touching the back wall

// ---- checkouts: along z, the belt starts on the shop side (north), the scanner end and the cashier are on the lobby side (south); cashier on the east side ----
const CHECKOUT_X = [-9.4, -6.6, -3.8, -1.0], CHECKOUT_Z = 2.55, CHECKOUT_LEN = 3.344, CHECKOUT_WID = 1.008;

// ---- the two rooms in the back corners (walls have a low part that always shows and an upper part that shows when the camera is inside) ----
const TW = 0.2, GAPW = 1.1, DOORH = 2.1, WALLTOP = 3.0, LOWH = 1.1;
const STALL_SIZE = 2.85, STALL_K = STALL_SIZE / 3.151, STALL_D = 1.641 * STALL_K;     // your 4-stall block, made a little narrower to fit between the walls of one restroom
const STALL_WC = [-1.1625, -0.395, 0.3725, 1.1425].map(o => o * STALL_K);               // the four toilets across the block, from its middle
const STALL_PLANES = [-1.5475, -0.7775, -0.0125, 0.7525, 1.5275].map(o => o * STALL_K);  // the five partitions
const SINK_Z = -8.35, SINK_FLIP = true;                                                  // the basins hang on the side walls (flip = the same half turn as in your school)
const SLAT_W = 1.5;                                                                      // each wall panel is stretched to 1.5 x its width (fewer pieces, same look)
const RESTROOM = { x0: -HW, x1: -9.8, z0: -HD, z1: -7.4, split: -12.9, doors: [-14.45, -11.35] };   // men (west) | women (east), doors on the shop side
const STAFF = { x0: 10.4, x1: HW, z0: -HD, z1: -6.8, door: 13.2 };                                  // STAFF ONLY, door on the shop side

const spansOf = (from, to, gaps) => {                    // a wall from..to with doorway gaps cut out -> list of [a, b]
  const out = []; let a = from;
  [...gaps].sort((p, q) => p - q).forEach(g => { if (g - GAPW / 2 > a) out.push([a, g - GAPW / 2]); a = g + GAPW / 2; });
  if (to > a) out.push([a, to]);
  return out;
};

// collision boxes of the supermarket, mall-centre space: [minX, maxX, minZ, maxZ]
function smBoxes() {
  const out = [], R = (x, z, hw, hd = hw) => [x - hw, x + hw, z - hd, z + hd];
  GONDOLAS.forEach(g => out.push(R(g.x, g.z, GOND.wid / 2 + 0.02, GOND.len / 2)));
  BACK.drinks.forEach(x => out.push(R(x, wallZ('sm_drinks_shelf') , SM_SIZE.sm_drinks_shelf[0] / 2, SM_SIZE.sm_drinks_shelf[1] / 2)));
  BACK.fridges.forEach(x => out.push(R(x, -HD + 0.03 + SM_SIZE.fridge[1] / 2, 0.47, SM_SIZE.fridge[1] / 2)));
  BACK.chips.forEach(x => out.push(R(x, wallZ('sm_chips_shelf'), SM_SIZE.sm_chips_shelf[0] / 2, SM_SIZE.sm_chips_shelf[1] / 2)));
  WALL_CHIPS_E.forEach(z => out.push(R(HW - 0.03 - SM_SIZE.sm_chips_shelf[1] / 2, z, SM_SIZE.sm_chips_shelf[1] / 2, SM_SIZE.sm_chips_shelf[0] / 2)));
  CHECKOUT_X.forEach(x => out.push(R(x, CHECKOUT_Z, CHECKOUT_WID / 2, CHECKOUT_LEN / 2)));
  // restroom walls
  spansOf(RESTROOM.x0, RESTROOM.x1, RESTROOM.doors).forEach(([a, b]) => out.push([a, b, RESTROOM.z1 - 0.12, RESTROOM.z1 + 0.12]));
  out.push([RESTROOM.x1 - 0.12, RESTROOM.x1 + 0.12, RESTROOM.z0, RESTROOM.z1], [RESTROOM.split - 0.1, RESTROOM.split + 0.1, RESTROOM.z0, RESTROOM.z1]);
  [-14.45, -11.35].forEach(cx => {
    STALL_WC.forEach(o => out.push(R(cx + o, -HD + 0.4, 0.32, 0.42)));                                      // toilets
    STALL_PLANES.forEach(o => out.push([cx + o - 0.03, cx + o + 0.03, -HD, -HD + STALL_D - 0.25]));          // stall partitions
  });
  out.push(R(-HW + 0.32, SINK_Z, 0.32, 0.32), R(RESTROOM.x1 - TW / 2 - 0.32, SINK_Z, 0.32, 0.32));          // basins
  // staff room walls and furniture
  spansOf(STAFF.x0, STAFF.x1, [STAFF.door]).forEach(([a, b]) => out.push([a, b, STAFF.z1 - 0.12, STAFF.z1 + 0.12]));
  out.push([STAFF.x0 - 0.12, STAFF.x0 + 0.12, STAFF.z0, STAFF.z1]);
  out.push([10.54, 14.46, -HD, -HD + 0.5], R(13.0, -8.7, 0.9, 0.45), R(15.55, -8.6, 0.4, 0.5));        // locker banks, table, fridge
  return out;
}

// ---------- loading your .glb files (each file is downloaded once) ----------
const gltfLoader = new GLTFLoader();
const glbCache = new Map();
const loadGLB = file => {
  if (!glbCache.has(file)) glbCache.set(file, gltfLoader.loadAsync(PROPS_DIR + file).then(g => { g.scene.updateMatrixWorld(true); return g; }));
  return glbCache.get(file);
};
const gameSafeCache = new Map();                         // the game's lights have no reflections, so fully metal materials would look black: cap the metal look
const gameSafe = (m, fix) => {
  if (!gameSafeCache.has(m)) { const c = m.clone(); if (c.metalness > 0.3) c.metalness = 0.3; if (fix) fix(c); gameSafeCache.set(m, c); }
  return gameSafeCache.get(m);
};
const safeScene = (scene, fix) => scene.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => gameSafe(m, fix)) : gameSafe(o.material, fix); });

// Many copies of small things cost almost nothing when INSTANCED: one draw call per product type, however many are on the shelves.
class InstanceBatch {
  constructor(file) { this.file = file; this.spots = new Map(); this.count = 0; }
  add(name, x, y, z, rotY = 0, scale = 1) { if (!this.spots.has(name)) this.spots.set(name, []); this.spots.get(name).push([x, y, z, rotY, scale]); this.count++; }
  async build(parent) {
    let g; try { g = await loadGLB(this.file); } catch (e) { console.warn('mall interior: could not load ' + this.file, e); return; }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [name, list] of this.spots) {
      const node = g.scene.getObjectByName(name);
      if (!node) { console.warn('mall interior: ' + this.file + ' has no item called ' + name); continue; }
      const meshes = []; node.traverse(o => { if (o.isMesh) meshes.push(o); });
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      meshes.forEach(mesh => {
        const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
        list.forEach(([x, y, z, ry, sc], i) => { q.setFromAxisAngle(up, ry); p.set(x, y, z); s.set(sc, sc, sc); m4.compose(p, q, s).multiply(rel); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; parent.add(im);
      });
    }
  }
}
function makeRng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// fills both sides of one gondola, 4 shelves each, with its aisle's products (rows of the same product, like a real shelf)
function stockGondola(batch, rng, g) {
  const items = AISLES[g.aisle].items, SC = PRODUCT_SCALE;
  [1, -1].forEach(side => GOND.tops.forEach(ty => {
    let z = g.z - GOND.len / 2 + 0.07, name = null, run = 0;
    const zEnd = g.z + GOND.len / 2 - 0.07;
    for (let guard = 0; guard < 80; guard++) {
      if (run === 0) { name = items[(rng() * items.length) | 0]; run = 2 + ((rng() * 4) | 0); }
      const [w, , d] = PRODUCT[name], ww = w * SC, dd = d * SC;
      if (z + ww > zEnd) break;
      if (rng() < DENSITY) batch.add(name, g.x + side * (GOND.half - dd / 2 - 0.015), ty, z + ww / 2, side * Math.PI / 2 + PRODUCT_FACE, SC);
      z += ww + 0.012; run--;
    }
  }));
}

// ---------- collision boxes (plot space) ----------
const B = (x0, x1, z0, z1, level) => (level == null ? [x0, x1, z0 + MALL_Z, z1 + MALL_Z] : [x0, x1, z0 + MALL_Z, z1 + MALL_Z, level]);
export const MALL_INTERIOR_BOXES = (() => {
  const out = [], E = ESCALATOR;
  out.push(B(-HW - T, HW + T, -HD - T, -HD));                               // north wall
  out.push(B(-HW - T, -HW, -HD, HD), B(HW, HW + T, -HD, HD));               // west and east walls
  out.push(B(-HW - T, DOOR_X - DOOR_HALF, HD, HD + T, 0), B(DOOR_X + DOOR_HALF, HW + T, HD, HD + T, 0));   // front wall with the doorway (ground floor)
  for (let l = 0; l < 5; l++) {
    if (l > 0) out.push(B(-HW - T, HW + T, HD, HD + T, l));                 // front wall, no doorway upstairs
    out.push(B(ELEVATOR.x0, ELEVATOR.x1, ELEVATOR.z0, ELEVATOR.z1, l));    // the lift shaft
    out.push(B(E.x0, E.x1, E.z0 - 0.1, E.z0, l), B(E.x0, E.x1, E.z1, E.z1 + 0.1, l));   // the two long sides of the escalators (nobody climbs over)
    out.push(B(E.x0, E.x1, ZM - 0.05, ZM + 0.05, l));                       // the wall between the two lanes
  }
  // the ends of the lanes that lead nowhere (no floor below the ground floor, none above level 4)
  out.push(B(E.x1, E.x1 + 0.3, E.z0, ZM, 0), B(E.x0 - 0.3, E.x0, ZM, E.z1, 0));       // ground floor: lane A east end, lane B west end
  out.push(B(E.x0 - 0.3, E.x0, E.z0, ZM, 4), B(E.x1, E.x1 + 0.3, ZM, E.z1, 4));       // level 4: lane A west end, lane B east end
  smBoxes().forEach(b => out.push(B(b[0], b[1], b[2], b[3], 0)));          // the supermarket (shelves, fridges, counters, tables, restrooms, staff room): solid on the ground floor
  return out;
})();

// ---------- small helpers ----------
const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
// ---- your models used as materials and fixtures ----
async function borrowMap(file) {                                           // the picture of one of your files, to repeat as a floor
  const gltf = await loadGLB(file); let map = null;
  gltf.scene.traverse(o => { if (map || !o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!map && m.map) map = m.map; }); });
  if (!map) throw new Error('no picture found in ' + file);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; return map;
}
async function fitMine(file, { axis = 'y', size = 1, rotY = 0, hide = null } = {}) {      // sizes one of your files in metres, centres it on the floor, can hide parts by name
  const gltf = await loadGLB(file), inner = gltf.scene.clone(true), wrap = new THREE.Group(); wrap.add(inner); wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  inner.scale.setScalar(size / box.getSize(new THREE.Vector3())[axis]); wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap); const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  inner.traverse(o => { if (!o.isMesh) return; if (hide && hide.test(o.name)) o.visible = false; o.castShadow = false; o.receiveShadow = true; });
  safeScene(inner);
  const g = new THREE.Group(); g.add(wrap); g.rotation.y = rotY; return g;
}
// Hangs a wash basin on a wall so its BACK touches the wall and its front looks into the room (the same helper as your school; wallSide = +1 when the wall is on the +X side of the basin).
async function hangSink(parent, wallFaceX, z, wallSide) {
  const p = await loadProp('sink_wall'); p.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  p.traverse(o => { if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); pts.push([v.x, v.y, v.z]); } });
  if (!pts.length) throw new Error('sink_wall has no geometry');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  pts.forEach(q => q.forEach((c, k) => { if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; }));
  const sx = hi[0] - lo[0], sz = hi[2] - lo[2], h = hi[1] - lo[1], bx = (lo[0] + hi[0]) / 2, bz = (lo[2] + hi[2]) / 2;
  const mean = sel => { const m = [0, 0, 0]; sel.forEach(q => { m[0] += q[0]; m[2] += q[2]; m[1]++; }); return m[1] ? [m[0] / m[1] - bx, m[2] / m[1] - bz] : [0, 0]; };
  const top = mean(pts.filter(q => q[1] > hi[1] - 0.2 * h)), bottom = mean(pts.filter(q => q[1] < lo[1] + 0.45 * h));
  const cue = [top[0] + bottom[0], top[1] + bottom[1]];
  const axis = sx < sz * 0.9 ? 0 : sz < sx * 0.9 ? 1 : (Math.abs(cue[0]) > Math.abs(cue[1]) ? 0 : 1);
  const sign = Math.abs(cue[axis]) > 0.004 ? Math.sign(cue[axis]) : -1;
  let back = axis === 0 ? [sign, 0] : [0, sign];
  if (SINK_FLIP) back = [-back[0], -back[1]];
  const depth = back[0] !== 0 ? sx : sz;
  p.rotation.y = Math.atan2(wallSide, 0) - Math.atan2(back[0], back[1]);
  p.position.set(wallFaceX - wallSide * (depth / 2 + 0.01), 0.4, z);
  parent.add(p); return p;
}
// Your slat wall panel, repeated along a wall (instanced: two draw calls per wall). w = { ax: 'x' | 'z' (the wall runs along), fixed (the other coordinate), from, to, face: +1 | -1 (which way the room is), y0, y1 }
async function addSlats(parent, w) {
  let g; try { g = await loadGLB(FILES.wall); } catch (e) { console.warn('mall interior: could not load ' + FILES.wall, e); return; }
  const len = w.to - w.from, y1 = w.y1, y0 = w.y0; if (len < 0.2 || y1 - y0 < 0.2) return;
  const PW = 0.402, n = Math.max(1, Math.ceil(len / (PW * SLAT_W))), sx = len / (n * PW), sy = (y1 - y0) / 2.492, step = PW * sx;
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(sx, sy, 1), m4 = new THREE.Matrix4();
  let rot, start, dx = 0, dz = 0;
  if (w.ax === 'x') { if (w.face > 0) { rot = 0; start = [w.from, w.fixed + 0.003]; dx = 1; } else { rot = Math.PI; start = [w.to, w.fixed - 0.003]; dx = -1; } }
  else { if (w.face > 0) { rot = Math.PI / 2; start = [w.fixed + 0.003, w.to]; dz = -1; } else { rot = -Math.PI / 2; start = [w.fixed - 0.003, w.from]; dz = 1; } }
  q.setFromAxisAngle(up, rot);
  g.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const mat = gameSafe(mesh.material, c => { c.side = THREE.DoubleSide; });
    const im = new THREE.InstancedMesh(mesh.geometry, mat, n);
    for (let k = 0; k < n; k++) { p.set(w.ax === 'x' ? start[0] + dx * k * step : start[0], y0, w.ax === 'x' ? start[1] : start[1] + dz * k * step); m4.compose(p, q, s).multiply(mesh.matrixWorld); im.setMatrixAt(k, m4); }
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.receiveShadow = true; parent.add(im);
  });
}
// Your balustrade, repeated: list of { x, z, rot (0 = runs along z, PI/2 = runs along x), len }
async function addRails(parent, list) {
  let g; try { g = await loadGLB(FILES.rail); } catch (e) { console.warn('mall interior: could not load ' + FILES.rail, e); return; }
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), m4 = new THREE.Matrix4();
  g.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((r, k) => { q.setFromAxisAngle(up, r.rot); p.set(r.x, 0, r.z); s.set(1, 1, r.len / 3.141); m4.compose(p, q, s).multiply(mesh.matrixWorld); im.setMatrixAt(k, m4); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; if (mesh.material.transparent) im.renderOrder = 2; parent.add(im);
  });
}
function subtract(r, h) {                                                  // rectangle r minus rectangle h -> up to 4 rectangles
  if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
  const out = [], zz0 = Math.max(r.z0, h.z0), zz1 = Math.min(r.z1, h.z1);
  if (h.z0 > r.z0) out.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: h.z0 });
  if (h.z1 < r.z1) out.push({ x0: r.x0, x1: r.x1, z0: h.z1, z1: r.z1 });
  if (h.x0 > r.x0) out.push({ x0: r.x0, x1: h.x0, z0: zz0, z1: zz1 });
  if (h.x1 < r.x1) out.push({ x0: h.x1, x1: r.x1, z0: zz0, z1: zz1 });
  return out;
}
const minus = (rect, holes) => holes.reduce((list, h) => list.flatMap(r => subtract(r, h)), [rect]);

// ---------- the build ----------
export function buildMallInterior() {
  const root = new THREE.Group();                   // everything inside (shown only while the player is inside)
  root.position.z = MALL_Z;                         // from here on, z is measured from the mall centre
  const marker = new THREE.Group();                 // door marker outside (red gradient, plot space; shown only while the player is outside)
  const M = {
    wall: std(0xf0f0ee, 0.9), slab: std(0xbfbcb4, 0.9), steel: std(0x6a7077, 0.5, 0.5), rail: std(0x8aa4b4, 0.3, 0.4),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    tile: new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.4 }),                                   // your dark tile goes on as soon as mall_floor_tile_optimised.glb has loaded
    checker: new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),   // your checkered floor (restrooms)
    door: std(0xb9bec4, 0.35, 0.7), liftIn: std(0xd8c9a8, 0.6), body: std(0x555a60, 0.5, 0.5), handrail: std(0x1d1f22, 0.5),
    ceil: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.95, side: THREE.FrontSide }),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const box = (parent, mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; parent.add(m); return m;
  };
  const rectBox = (parent, mat, r, y0, y1) => box(parent, mat, r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
  const floorPlane = (parent, r, mat, y, tile) => {                         // flat rectangle lying on the floor (tile = metres per texture repeat)
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
    if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (r.x1 - r.x0) / tile, uv.getY(i) * (r.z1 - r.z0) / tile); }
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2); m.receiveShadow = true; parent.add(m); return m;
  };

  const levels = [];                                // { group, side:{N,S,W,E} }
  const railList = [[], [], [], [], []];            // balustrade pieces of each floor (built after the loop)
  const lifts = [];                                 // the lift of each floor (index = floor): { o: how open the doors are 0..1, mixer }
  const fridges = [];                               // the animated fridges: { x, z, p, mixer }
  const roomUppers = [];                            // upper walls of the restrooms and the staff room: shown only while the camera is inside that room
  const warnLoad = what => e => console.warn('mall interior: could not load ' + what, e);
  const addLift = (parent, x, z) => {               // your animated lift: the wall and floor plane that come with the file are cut off, only the doors are animated
    const st = { o: 0, mixer: null };
    loadGLB(FILES.lift).then(gl => {
      const m = gl.scene.clone(true), cut = [];
      m.traverse(o => { if (/^(Wall|Plane)/.test(o.name)) cut.push(o); });
      cut.forEach(o => o.parent && o.parent.remove(o));
      safeScene(m); m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      const wrap = new THREE.Group(); wrap.add(m);
      wrap.position.set(x, 0, z - 0.28); wrap.rotation.y = -Math.PI / 2;      // the file's doors face +x: turn them to face south, frame flush with the shaft front
      parent.add(wrap);
      st.mixer = new THREE.AnimationMixer(m);
      gl.animations.forEach(clip => { const c = clip.clone(); c.tracks = c.tracks.filter(t => /Door/.test(t.name)); st.mixer.clipAction(c).play(); });
      st.mixer.setTime(0);
    }).catch(warnLoad(FILES.lift));
    return st;
  };
  const OUTER = { x0: -HW - T, x1: HW + T, z0: -HD - T, z1: HD + T };
  const INNER = { x0: -HW, x1: HW, z0: -HD, z1: HD };

  for (let i = 0; i < 5; i++) {
    const H = floorH(i), g = new THREE.Group(), info = FLOORS[i];
    g.position.y = FLOOR_Y[i]; root.add(g);
    const holes = i > 0 ? [ESCALATOR, ELEVATOR] : [ELEVATOR];
    g.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.9));

    // floor slab (a hole for the escalators on floors 1-4) and the floor surface
    if (i > 0) minus(OUTER, [ESCALATOR, ELEVATOR]).forEach(r => rectBox(g, M.slab, r, -T, 0));
    else floorPlane(g, OUTER, M.slab, -0.02);
    minus(INNER, holes).forEach(r => floorPlane(g, r, M.tile, 0.01, 2.0));     // your tile over the WHOLE floor, shop and lobby (one picture = 2 m)

    // lift shaft: three walls and a front wall with a doorway; your animated lift (elevator_animated.glb) stands inside (see addLift)
    const EV = ELEVATOR, evx = (EV.x0 + EV.x1) / 2, evz = EV.z1, SW = 0.15, OPEN = 1.1, LIFT_DOOR_H = 3.05;
    box(g, M.steel, SW, H, EV.z1 - EV.z0, EV.x0 + SW / 2, H / 2, (EV.z0 + EV.z1) / 2);
    box(g, M.steel, SW, H, EV.z1 - EV.z0, EV.x1 - SW / 2, H / 2, (EV.z0 + EV.z1) / 2);
    box(g, M.steel, EV.x1 - EV.x0, H, SW, evx, H / 2, EV.z0 + SW / 2);
    box(g, M.steel, evx - OPEN - EV.x0, H, SW, (EV.x0 + evx - OPEN) / 2, H / 2, evz - SW / 2);              // front wall, left of the doorway
    box(g, M.steel, EV.x1 - evx - OPEN, H, SW, (evx + OPEN + EV.x1) / 2, H / 2, evz - SW / 2);              // front wall, right of the doorway
    box(g, M.steel, OPEN * 2, H - LIFT_DOOR_H, SW, evx, (H + LIFT_DOOR_H) / 2, evz - SW / 2);                // above the doorway
    lifts.push(addLift(g, evx, evz));


    // your balustrade round the escalator hole (floors 1-4): along the two long sides, and across the ends that lead nowhere on the top floor
    const E = ESCALATOR;
    if (i > 0) {
      const nSeg = 5, segLen = (E.x1 - E.x0) / nSeg;
      for (let k = 0; k < nSeg; k++) { const x = E.x0 + segLen * (k + 0.5); railList[i].push({ x, z: E.z0 - 0.07, rot: Math.PI / 2, len: segLen }, { x, z: E.z1 + 0.07, rot: Math.PI / 2, len: segLen }); }
      if (i === 4) railList[i].push({ x: E.x0 - 0.07, z: (E.z0 + ZM) / 2, rot: 0, len: ZM - E.z0 }, { x: E.x1 + 0.07, z: (ZM + E.z1) / 2, rot: 0, len: E.z1 - ZM });   // the ends of lane A (west) and lane B (east) lead nowhere
    }

    // outer walls (grouped per side so the camera side can be hidden)
    const side = { N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
    Object.values(side).forEach(s => g.add(s));
    box(side.N, M.wall, OUTER.x1 - OUTER.x0, H + T, T, 0, (H - T) / 2, -HD - T / 2);
    box(side.W, M.wall, T, H + T, HD * 2, -HW - T / 2, (H - T) / 2, 0);
    box(side.E, M.wall, T, H + T, HD * 2, HW + T / 2, (H - T) / 2, 0);
    if (i === 0) {                                                              // front wall with the doorway
      const xa = -HW - T, xb = DOOR_X - DOOR_HALF, xc = DOOR_X + DOOR_HALF, xd = HW + T, zc = HD + T / 2;
      box(side.S, M.wall, xb - xa, H + T, T, (xa + xb) / 2, (H - T) / 2, zc);
      box(side.S, M.wall, xd - xc, H + T, T, (xc + xd) / 2, (H - T) / 2, zc);
      box(side.S, M.wall, xc - xb, H - DOOR_H, T, (xb + xc) / 2, DOOR_H + (H - DOOR_H) / 2, zc);   // above the door
    } else box(side.S, M.wall, OUTER.x1 - OUTER.x0, H + T, T, 0, (H - T) / 2, HD + T / 2);
    // your slat wall panels on the inside of the four outer walls (the camera-side wall is hidden together with its panels)
    const yTop = i < 4 ? H - T : H;
    addSlats(side.N, { ax: 'x', fixed: -HD, from: -HW, to: HW, face: 1, y0: 0, y1: yTop });
    addSlats(side.W, { ax: 'z', fixed: -HW, from: -HD, to: HD, face: 1, y0: 0, y1: yTop });
    addSlats(side.E, { ax: 'z', fixed: HW, from: -HD, to: HD, face: -1, y0: 0, y1: yTop });
    if (i === 0) {
      addSlats(side.S, { ax: 'x', fixed: HD, from: -HW, to: DOOR_X - DOOR_HALF, face: -1, y0: 0, y1: yTop });
      addSlats(side.S, { ax: 'x', fixed: HD, from: DOOR_X + DOOR_HALF, to: HW, face: -1, y0: 0, y1: yTop });
      addSlats(side.S, { ax: 'x', fixed: HD, from: DOOR_X - DOOR_HALF, to: DOOR_X + DOOR_HALF, face: -1, y0: DOOR_H, y1: yTop });
    } else addSlats(side.S, { ax: 'x', fixed: HD, from: -HW, to: HW, face: -1, y0: 0, y1: yTop });

    // the roof over the top floor; the other floors are covered by the slab of the floor above
    if (i === 4) { const roof = new THREE.Group(); g.add(roof); rectBox(roof, M.ceil, OUTER, H, H + T); g.userData.roof = roof; roof.visible = false; }
    levels.push({ group: g, side });
  }

  for (let i = 1; i < 5; i++) addRails(levels[i].group, railList[i]);

  // ----- the escalators: your metaretail escalator lane, at its own proportions (only its height is adjusted a little to each floor), two lanes for every pair of floors -----
  const E = ESCALATOR, LW = (E.z1 - E.z0) / 2;
  loadGLB(FILES.escalator).then(ge => {
    for (let k = 0; k < 4; k++) {
      [{ low: 'W', zc: E.z0 + LW / 2 }, { low: 'E', zc: E.z0 + LW * 1.5 }].forEach(lane => {
        const m = ge.scene.clone(true); safeScene(m);
        m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
        const wrap = new THREE.Group(); wrap.add(m);                          // in the file the low plate's top is at y = 0 and the high plate's top at 6.705 m
        wrap.scale.set(1, (FLOOR_Y[k + 1] - FLOOR_Y[k]) / ESC_RISE, 1);
        wrap.position.set(ESC_XC, 0, lane.zc);
        wrap.rotation.y = lane.low === 'W' ? Math.PI : 0;                     // the file's low end is at +x: lane A (low end west) is turned round
        levels[k].group.add(wrap);
      });
    }
  }).catch(warnLoad(FILES.escalator));

  // your floor pictures
  borrowMap(FILES.floor).then(map => { M.tile.map = map; M.tile.color.set(0xffffff); M.tile.needsUpdate = true; }).catch(warnLoad(FILES.floor));
  borrowMap(FILES.checker).then(map => { M.checker.map = map; M.checker.color.set(0xffffff); M.checker.needsUpdate = true; }).catch(warnLoad(FILES.checker));

  // ----- STEP 3 (rebuilt): the supermarket -----
  const g0 = levels[0].group;
  Object.assign(M, { wood: std(0x8b5a2b, 0.85), dark: std(0x5a3a1c, 0.85), part: std(0x9fb4c4, 0.6), porc: std(0xf4f6f7, 0.25),
    mirror: new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.05, metalness: 0.3 }) });
  const rng = makeRng(20261012);
  const lib = (parent, name, x, y, z, rot = 0) => {                              // a prop from props_library.js (skipped, with a console note, if it is not registered)
    if (!PROPS[name]) { console.warn('mall interior: props_library has no prop called ' + name); return Promise.resolve(null); }
    return loadProp(name).then(p => { p.position.set(x, y, z); p.rotation.y = rot; parent.add(p); return p; }).catch(warnLoad(name));
  };
  const putGLB = (parent, file, x, y, z, rot = 0, fix = null) => loadGLB(file).then(g => {   // one of the new files, centred on its feet
    const m = g.scene.clone(true); m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); safeScene(m, fix);
    const w = new THREE.Group(); w.add(m); w.position.set(x, y, z); w.rotation.y = rot; parent.add(w); return w;
  }).catch(warnLoad(file));

  // the island shelves, fully stocked on both sides, with an aisle board on each end
  GONDOLAS.forEach(gd => putGLB(g0, FILES.gondola, gd.x, 0, gd.z));
  const stock = new InstanceBatch(FILES.products);
  GONDOLAS.forEach(gd => stockGondola(stock, rng, gd));
  stock.build(g0);


  // the back wall: drinks, the fridges (the doors open when you walk up to them), snacks
  BACK.drinks.forEach(x => lib(g0, 'sm_drinks_shelf', x, 0, wallZ('sm_drinks_shelf')));
  BACK.chips.forEach(x => lib(g0, 'sm_chips_shelf', x, 0, wallZ('sm_chips_shelf')));
  WALL_CHIPS_E.forEach(z => lib(g0, 'sm_chips_shelf', HW - 0.03 - SM_SIZE.sm_chips_shelf[1] / 2, 0, z, -Math.PI / 2));
  loadGLB(FILES.fridge).then(gf => {
    const probe = new THREE.Box3().setFromObject(gf.scene), cx = (probe.min.x + probe.max.x) / 2, cz = (probe.min.z + probe.max.z) / 2, depth = probe.max.z - probe.min.z;
    BACK.fridges.forEach(x => {
      const m = gf.scene.clone(true);
      safeScene(m, c => { if (c.name === 'mainMetal') { c.color.set(0xd8dce1); c.roughness = 0.4; c.metalness = 0.15; } });   // the file's doors are almost black: make them steel
      m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      m.position.set(-cx, -probe.min.y, -cz);
      const w = new THREE.Group(); w.add(m); w.position.set(x, 0, -HD + 0.03 + depth / 2); g0.add(w);
      const mixer = new THREE.AnimationMixer(m);
      gf.animations.forEach(clip => mixer.clipAction(clip).play());
      mixer.setTime(0);
      fridges.push({ x, z: -HD + 0.03 + depth / 2, p: 0, mixer });
    });
  }).catch(warnLoad(FILES.fridge));

  // checkouts: belt starts on the shop (north) side, scanner end and cashier on the lobby (south) side, the register stands on the counter next to the scanner
  CHECKOUT_X.forEach((x, n) => {
    const G = new THREE.Group(); G.position.set(x, 0, CHECKOUT_Z); G.rotation.y = Math.PI / 2 + CHECKOUT_FLIP; g0.add(G);
    putGLB(G, FILES.checkout, 0, 0, 0);
    putGLB(G, FILES.register, -0.45, 0.835, 0.12);                                // 0.835 = the top of the counter, so the register sits ON it
  });

  // walls of the restrooms and the staff room: a low band that always shows, an upper part that shows when the camera is inside
  const wallBand = (low, up, alongX, fixed, from, to, gaps) => {
    spansOf(from, to, gaps).forEach(([a, b]) => {
      const len = b - a, c = (a + b) / 2;
      box(low, M.wall, alongX ? len : TW, LOWH, alongX ? TW : len, alongX ? c : fixed, LOWH / 2, alongX ? fixed : c);
      box(up, M.wall, alongX ? len : TW, WALLTOP - LOWH, alongX ? TW : len, alongX ? c : fixed, (LOWH + WALLTOP) / 2, alongX ? fixed : c);
    });
    gaps.forEach(gp => box(up, M.wall, alongX ? GAPW : TW, WALLTOP - DOORH, alongX ? TW : GAPW, alongX ? gp : fixed, (DOORH + WALLTOP) / 2, alongX ? fixed : gp));   // beam over each doorway
  };
  const makeRoom = rect => { const up = new THREE.Group(); g0.add(up); roomUppers.push({ up, rect }); return up; };

  // restrooms (north-west): MEN (west) | WOMEN (east). Your 4-stall block, your toilets, your wall basin, your checkered floor
  const upR = makeRoom(RESTROOM);
  wallBand(g0, upR, true, RESTROOM.z1, RESTROOM.x0, RESTROOM.x1, RESTROOM.doors);
  wallBand(g0, upR, false, RESTROOM.x1, RESTROOM.z0, RESTROOM.z1, []);
  wallBand(g0, upR, false, RESTROOM.split, RESTROOM.z0, RESTROOM.z1, []);
  floorPlane(g0, { x0: RESTROOM.x0, x1: RESTROOM.x1, z0: RESTROOM.z0, z1: RESTROOM.z1 }, M.checker, 0.03, 2.4);
  [(RESTROOM.x0 + RESTROOM.split) / 2, (RESTROOM.split + RESTROOM.x1) / 2].forEach(cx => {
    const zc = -HD + STALL_D / 2;
    fitMine(FILES.stalls, { axis: 'x', size: STALL_SIZE, hide: /StallHigh/ }).then(p => { p.position.set(cx, 0, zc); g0.add(p); }).catch(warnLoad(FILES.stalls));     // the low parts always show
    fitMine(FILES.stalls, { axis: 'x', size: STALL_SIZE, hide: /StallLow/ }).then(p => { p.position.set(cx, 0, zc); upR.add(p); }).catch(warnLoad(FILES.stalls));     // the high parts show while the camera is in the room
    STALL_WC.forEach(o => lib(g0, 'toilet', cx + o, 0, -HD + 0.33, 0));
  });
  hangSink(g0, -HW, SINK_Z, -1).catch(warnLoad('sink_wall (men)'));                                  // men: basin on the west wall
  hangSink(g0, RESTROOM.x1 - TW / 2, SINK_Z, 1).catch(warnLoad('sink_wall (women)'));                // women: basin on the east wall
  [{ x: -HW + 0.012, ry: Math.PI / 2 }, { x: RESTROOM.x1 - TW / 2 - 0.012, ry: -Math.PI / 2 }].forEach(b => {                          // a mirror above each basin
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), M.mirror); mir.position.set(b.x, 1.55, SINK_Z); mir.rotation.y = b.ry; upR.add(mir);
  });

  // staff room (north-east): lockers, a table with two chairs, a fridge
  const upS = makeRoom(STAFF);
  wallBand(g0, upS, true, STAFF.z1, STAFF.x0, STAFF.x1, [STAFF.door]);
  wallBand(g0, upS, false, STAFF.x0, STAFF.z0, STAFF.z1, []);
  // your slat panels on the shop side of the room walls: the low part always shows, the high part shows with the rest of the room's walls
  const roomSlats = (ax, fixed, from, to, face, upper) => { addSlats(g0, { ax, fixed, from, to, face, y0: 0, y1: LOWH }); addSlats(upper, { ax, fixed, from, to, face, y0: LOWH, y1: WALLTOP }); };
  spansOf(RESTROOM.x0, RESTROOM.x1, RESTROOM.doors).forEach(([a, b]) => roomSlats('x', RESTROOM.z1 + TW / 2, a, b, 1, upR));
  roomSlats('z', RESTROOM.x1 + TW / 2, RESTROOM.z0, RESTROOM.z1, 1, upR);
  spansOf(STAFF.x0, STAFF.x1, [STAFF.door]).forEach(([a, b]) => roomSlats('x', STAFF.z1 + TW / 2, a, b, 1, upS));
  roomSlats('z', STAFF.x0 - TW / 2, STAFF.z0, STAFF.z1, -1, upS);
  [11.5, 13.5].forEach(x => lib(g0, 'locker_bank', x, 0, -HD + 0.25, 0));
  lib(g0, 'office_table', 13.0, 0, -8.7, 0);
  lib(g0, 'plastic_chair', 12.4, 0, -9.35, 0); lib(g0, 'plastic_chair', 13.6, 0, -8.05, Math.PI);
  lib(g0, 'fridge', 15.55, 0, -8.6, -Math.PI / 2);

  // red gradient markers: one just inside the door (the exit) and one on the plaza in front of the doorway (the entrance, shown only while you are outside)
  loadProp('gta_marker_red').then(p => { p.position.set(DOOR_X, 0.02, HD - 1.6); g0.add(p); }).catch(warnLoad('gta_marker_red (exit)'));
  loadProp('gta_marker_red').then(p => { p.position.set(DOOR_X, 0.02, 2.96 + MARKER_OUT); marker.add(p); }).catch(warnLoad('gta_marker_red (entrance)'));

  // ----- the panel for the lift, the floor name badge and the fade -----
  let panel = null, badge = null, fade = null, gotoFn = null, panelLevel = -2;
  const makeUi = () => {
    if (panel) return;
    const css = (el, st) => Object.assign(el.style, st);
    panel = document.createElement('div');
    css(panel, { position: 'fixed', left: '50%', bottom: '24%', transform: 'translateX(-50%)', background: 'rgba(10,25,50,0.92)', color: '#fff', padding: '10px 12px 12px',
      borderRadius: '12px', zIndex: 30, display: 'none', font: '600 14px "Segoe UI", Arial, sans-serif', textAlign: 'center', boxShadow: '0 4px 18px rgba(0,0,0,.4)' });
    const title = document.createElement('div'); title.textContent = 'LIFT - choose a floor'; css(title, { marginBottom: '8px' }); panel.appendChild(title);
    panel.buttons = [];
    for (let i = 4; i >= 0; i--) {
      const b = document.createElement('button');
      b.textContent = (i === 0 ? 'G' : i) + '  ' + FLOORS[i].title;
      css(b, { display: 'block', width: '100%', minHeight: '44px', margin: '4px 0', padding: '6px 14px', border: '0', borderRadius: '8px', background: '#f2b705', color: '#222', font: 'inherit', cursor: 'pointer' });
      b.onclick = () => {
        if (!gotoFn) return;
        fade.style.opacity = '1';
        setTimeout(() => { if (gotoFn) gotoFn(i); fade.style.opacity = '0'; }, 280);
      };
      panel.buttons[i] = b; panel.appendChild(b);
    }
    badge = document.createElement('div');
    css(badge, { position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,25,50,0.85)', color: '#fff', padding: '6px 16px', borderRadius: '10px',
      zIndex: 29, display: 'none', font: '700 15px "Segoe UI", Arial, sans-serif', pointerEvents: 'none' });
    fade = document.createElement('div');
    css(fade, { position: 'fixed', inset: '0', background: '#000', opacity: '0', transition: 'opacity 0.25s', zIndex: 40, pointerEvents: 'none' });
    document.body.append(panel, badge, fade);
  };

  // ----- hooks used by game.js -----
  const setInside = inside => {
    root.visible = inside; marker.visible = !inside;
    if (!inside && panel) { panel.style.display = 'none'; badge.style.display = 'none'; panelLevel = -2; }
  };
  const update = (dt, ctx) => {                                                  // ctx: { x, z (plot space), level, goto(level) }
    makeUi();
    const lx = ctx.x, lz = ctx.z - MALL_Z;
    const inZone = lx > ELEVATOR.x0 - 0.3 && lx < ELEVATOR.x1 + 0.3 && lz > ELEVATOR.z1 && lz < HD;
    const step = (d, target, secs, clipT) => {                                  // move the doors towards open (1) or shut (0) and show that moment of the animation
      if (d.o === target) return;
      d.o += Math.sign(target - d.o) * dt / secs;
      if ((target === 1 && d.o > 1) || (target === 0 && d.o < 0)) d.o = target;
      if (d.mixer) d.mixer.setTime(d.o * clipT);
    };
    lifts.forEach((d, i) => step(d, inZone && ctx.level === i ? 1 : 0, 1.5, LIFT_OPEN_T));
    fridges.forEach(f => {
      f.o = f.p; step(f, ctx.level === 0 && Math.hypot(lx - f.x, lz - (f.z + 0.75)) < FRIDGE_RANGE ? 1 : 0, 1.4, FRIDGE_OPEN_T); f.p = f.o;
    });
    gotoFn = ctx.goto;
    panel.style.display = inZone ? 'block' : 'none';
    if (inZone && panelLevel !== ctx.level) panel.buttons.forEach((b, i) => { b.disabled = i === ctx.level; b.style.opacity = i === ctx.level ? '0.45' : '1'; });
    if (panelLevel !== ctx.level) { badge.textContent = FLOORS[ctx.level].name + '  -  ' + FLOORS[ctx.level].title; panelLevel = ctx.level; }
    badge.style.display = 'block';
  };
  const setLevel = level => { levels.forEach((l, i) => { l.group.visible = i === level || i === level - 1; }); };   // the floor you are on, and the one below (seen through the escalator hole)
  const setCamera = (relX, relZ) => {
    const z = relZ - MALL_Z;
    levels.forEach(l => {
      l.side.N.visible = !(z < -HD);
      l.side.S.visible = !(z > HD);
      l.side.W.visible = !(relX < -HW);
      l.side.E.visible = !(relX > HW);
    });
    roomUppers.forEach(r => { r.up.visible = relX > r.rect.x0 && relX < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1; });   // the upper walls of a small room show only while the camera is in it
  };
  setLevel(0); setCamera(0, MALL_Z); setInside(false);

  // halfW / halfD are a little bigger than the floors, so the mall counts as "inside" as soon as you are in the doorway (the model's front wall is thick)
  return { group: root, marker, halfW: HW + T + 0.1, halfD: HD + T + 0.42, cz: MALL_Z, setInside, setCamera, setLevel, update };
}


