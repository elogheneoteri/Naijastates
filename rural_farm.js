// rural_farm.js  (the Rural District plot, next to the High School across the avenue)
//
// Exports:  buildRuralFarm() -> { group, update }   FARM_BOXES -> solid parts for collisions (the fence, the feeding trough and the pigs;
//                                                   the crops are still walk-through)
//           FARM_AREAS -> the reserved areas (river, animals, warehouse + van bays), in metres from the plot centre
//
// LOCAL SPACE is the same as the other buildings: the plot centre is (0,0), the front / road side is +Z (south), the back is -Z (north,
// the world edge), +X is east. game.js turns the plot to face the main road (rotY 0 here).
//
// THE PLOT (74 m wide x 22 m deep), seen from above, north at the top:
//
//        (no fence: the river side is left open)
//   +---------------------------------------------------------------------------+
//   |  RIVER GAP (5 m, left empty for your open river along the world edge)      |
//   F-----------------+-------------------------------------------+-------------F
//   F                 |  4 rows of CASSAVA        (2 blocks of 5)  |  WAREHOUSE  F
//   F  FARM ANIMALS   |  ------ footpath ------                    |  area and   F
//   F  (west side)    |  5 rows of TOMATOES + PEPPER (2 blocks)    |  3 VAN bays F
//   F-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF    gap    FFFFFFFFFFFFFFFF   <- the main road is in front (south)
//                                                   van entrance          (F = fence)
//
//   THE FENCE (wood_fence.glb): three sides only. West side, south side and east side. The north side (the river) has no fence.
//   The south fence has one wide opening in front of the 3 van bays, so delivery vans can drive in and out to the warehouse.
//   The fence is solid: players cannot walk through it, but they can walk through the van entrance.
//
//   THE ANIMALS (west side):  pigs (ps1_pig.glb) standing by small mud puddles, a feeding trough (feeding_trough_optimised.glb)
//   right beside them, and chickens (chicken_rig.glb) on the dry side. The pigs and chickens keep their own animation (they are
//   copied with SkeletonUtils, so every animal has its own skeleton and its own animation clock).
//   The brown "trodden earth" patch that used to mark the animal area is gone: the animals stand on the ordinary red sand.
//
// FILES (all go in your props folder):
//   wood_fence.glb                    your fence (70 triangles, already small)
//   ps1_pig.glb                       your pig (728 triangles, 256 px picture, already small)
//   chicken_rig.glb                   your chicken, SMALLER: 1541 triangles, picture shrunk from 410 KB to 113 KB, whole file 722 KB -> 426 KB. Same animation.
//   feeding_trough_optimised.glb      your trough, SMALLER: 16 pieces joined into 1 (1 draw call instead of 16), 748 triangles, file 2.8 MB -> 96 KB
//   cassava_row.glb, tomato_row.glb   the crops (unchanged)
//
// KEEPING THE GAME FAST
//   * the whole fence is 2 draw calls (InstancedMesh: one for the panels, one for the posts): 39 panels + 41 posts, about 2,900 triangles in all
//   * 4 pigs (about 2,900 triangles) + 9 chickens (about 14,000 triangles) + the trough (748): small next to the crops
//   * no shadows from the fence or the crops. The animals do cast a small shadow.
//   * the puddles are flat shapes (about 60 triangles each)
//
// THINGS YOU MAY WANT TO CHANGE
//   RIVER_DEPTH      how deep the river gap along the north edge is (metres)
//   FENCE_INSET      how far inside the plot edge the fence stands
//   GATE             the van entrance in the south fence (x0 to x1, metres from the plot centre)
//   PIGS / CHICKENS / TROUGH / PUDDLES   one line per animal or puddle: x, z (metres from the plot centre), which way it faces (rot) and its size
//   PIG_SCALE / CHICKEN_SCALE            how big the animals are (0.2 makes a pig 1.3 m long; the chicken file is already life size, 0.42 m tall)
//   PIG_TURN / CHICKEN_TURN              if the animals face the wrong way (tail towards the trough), set this to 3.1416 to turn every one of them round
//   MARK_AREAS       false = no painted patches at all (the warehouse yard and the van bay lines)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PROPS_DIR } from './props_library.js';

const FILE_CASSAVA = PROPS_DIR + 'cassava_row.glb', FILE_TOMATO = PROPS_DIR + 'tomato_row.glb';   // in the props folder
const FILE_FENCE = PROPS_DIR + 'wood_fence.glb', FILE_PIG = PROPS_DIR + 'ps1_pig.glb', FILE_CHICKEN = PROPS_DIR + 'chicken_rig.glb';
const FILE_TROUGH = PROPS_DIR + 'feeding_trough_optimised.glb';
const PLOT_W = 74, PLOT_D = 22;                       // the plot (from city.js)
const X0 = -PLOT_W / 2, X1 = PLOT_W / 2, Z0 = -PLOT_D / 2, Z1 = PLOT_D / 2;
const MODULE_L = 3.8;                                 // length of one row piece (metres): they sit end to end
const MARK_AREAS = true;

// ----- the reserved areas -----
const RIVER_DEPTH = 5.0, ANIMAL_W = 16, WAREHOUSE_W = 16;
const RIVER = { x0: X0, x1: X1, z0: Z0, z1: Z0 + RIVER_DEPTH };                     // along the north (world) edge: left empty
const ANIMALS = { x0: X0, x1: X0 + ANIMAL_W, z0: RIVER.z1, z1: Z1 };                // west side: farm animals
const WAREHOUSE = { x0: X1 - WAREHOUSE_W, x1: X1, z0: RIVER.z1, z1: Z1 };           // east side: small warehouse + van bays (next to the road)
// three van bays on the road side of the warehouse area (vans drive in from the main road, in front)
const BAY_W = 3.2, BAY_L = 6.0, BAYS_X0 = (WAREHOUSE.x0 + WAREHOUSE.x1) / 2 - 1.5 * BAY_W, BAYS_Z0 = Z1 - 0.8 - BAY_L;
const BAYS = { x0: BAYS_X0, x1: BAYS_X0 + 3 * BAY_W, z0: BAYS_Z0, z1: BAYS_Z0 + BAY_L };
// the small warehouse itself goes here later (north part of its area, loading side facing the bays)
const WAREHOUSE_SPOT = { x0: WAREHOUSE.x0 + 1.5, x1: WAREHOUSE.x1 - 1.5, z0: RIVER.z1 + 0.8, z1: BAYS_Z0 - 3.0 };
export const FARM_AREAS = { river: RIVER, animals: ANIMALS, warehouse: WAREHOUSE, warehouseSpot: WAREHOUSE_SPOT, vanBays: BAYS };

// ----- the crop field: between the two side areas, a footpath down the middle -----
const FIELD_X0 = ANIMALS.x1 + 1, FIELD_X1 = WAREHOUSE.x0 - 1;                       // -20 .. 20
const PATH_W = 2.0;
const pieces = (a, b) => { const n = Math.round((b - a) / MODULE_L); return Array.from({ length: n }, (_, i) => a + MODULE_L * (i + 0.5)); };
const WEST_X = pieces(FIELD_X0, -PATH_W / 2), EAST_X = pieces(PATH_W / 2, FIELD_X1);   // 5 row pieces in each block
const CASSAVA_ROWS = [-4.55, -2.65, -0.75, 1.15];                                   // the north rows (next to the river)
const TOMATO_ROWS = [3.335, 4.835, 6.335, 7.835, 9.335];                            // the south rows (next to the road)

// ----- the fence: west, south and east sides. The north side (the river) stays open. -----
const FENCE_INSET = 0.25;                                                           // the fence stands this far inside the plot edge
const FENCE_W = X0 + FENCE_INSET, FENCE_E = X1 - FENCE_INSET, FENCE_S = Z1 - FENCE_INSET;   // the west line, the east line, the south line
const FENCE_N = RIVER.z1;                                                           // the west and east fences stop here, where the river gap starts
const GATE = { x0: BAYS.x0 - 0.6, x1: BAYS.x1 + 0.6 };                             // the van entrance: a gap in the south fence in front of the 3 bays (about 10.6 m)
const PANEL_L = 2.491;                                                              // length of one fence panel in wood_fence.glb (metres)
const FENCE_THICK = 0.3;                                                            // thickness of the invisible wall that stops the players
// every straight piece of fence: from (x0, z0) to (x1, z1)
const FENCE_RUNS = [
  [FENCE_W, FENCE_N, FENCE_W, FENCE_S],        // west side, from the river gap to the south corner
  [FENCE_E, FENCE_N, FENCE_E, FENCE_S],        // east side, from the river gap to the south corner
  [FENCE_W, FENCE_S, GATE.x0, FENCE_S],        // south side, west part (up to the van entrance)
  [GATE.x1, FENCE_S, FENCE_E, FENCE_S]         // south side, east part (from the van entrance to the east corner)
];

// ----- the animals (x, z in metres from the plot centre; rot = which way the animal faces, in radians) -----
const PIG_SCALE = 0.2;                                // the pig file is 6.5 units long: 0.2 makes it 1.3 m
const CHICKEN_SCALE = 1.0;                            // the chicken file is already life size (0.42 m tall)
const PIG_TURN = 0, CHICKEN_TURN = 0;                 // added to every animal's rot (3.1416 turns them round)
const TROUGH = { x: -29.6, z: 3.4, length: 1.6 };     // long way along x, right beside the pigs
const PIGS = [
  { x: -30.4, z: 0.5, rot: 0.27, s: 1.0 },            // by the big puddle, looking at the trough
  { x: -28.4, z: 1.0, rot: -0.46, s: 0.95 },          // by the east puddle, looking at the trough
  { x: -34.0, z: 3.6, rot: 2.2, s: 1.05 },            // standing in the west puddle
  { x: -31.6, z: 2.6, rot: 1.19, s: 0.55 }            // a piglet next to the trough
];
const CHICKENS = [                                    // on the dry south-east side of the animal area, away from the mud
  { x: -24.5, z: 7.5, rot: 0.6, s: 1.0 }, { x: -23.2, z: 8.6, rot: 3.4, s: 0.95 }, { x: -25.8, z: 9.2, rot: 5.0, s: 1.05 },
  { x: -22.6, z: 6.3, rot: 1.9, s: 1.0 }, { x: -26.8, z: 6.6, rot: 4.2, s: 0.95 }, { x: -24.0, z: 5.6, rot: 2.6, s: 1.0 },
  { x: -27.5, z: 8.4, rot: 0.1, s: 1.05 }, { x: -34.5, z: 8.4, rot: 3.0, s: 1.0 }, { x: -33.2, z: 9.4, rot: 5.6, s: 0.95 }
];
// mud puddles for the pigs: centre, half width (rx, along x) and half depth (rz, along z)
const PUDDLES = [
  { x: -31.0, z: -1.2, rx: 2.2, rz: 1.4 }, { x: -26.6, z: 1.8, rx: 1.5, rz: 1.0 },
  { x: -34.2, z: 4.4, rx: 1.3, rz: 0.9 }, { x: -30.6, z: -3.6, rx: 0.9, rz: 0.6 }
];

// ----- solid parts: the fence, the trough and the pigs (the crops and the chickens are walk-through) -----
const FENCE_BOXES = FENCE_RUNS.map(([ax, az, bx, bz]) => {
  const h = FENCE_THICK / 2;
  return [Math.min(ax, bx) - h, Math.max(ax, bx) + h, Math.min(az, bz) - h, Math.max(az, bz) + h];
});
const TROUGH_BOX = [TROUGH.x - TROUGH.length / 2, TROUGH.x + TROUGH.length / 2, TROUGH.z - 0.55, TROUGH.z + 0.55];
const PIG_BOXES = PIGS.map(p => {                       // a box round the pig, made a little larger when the pig is turned
  const hl = 0.55 * p.s, hw = 0.2 * p.s, c = Math.abs(Math.cos(p.rot)), s = Math.abs(Math.sin(p.rot));
  const hx = s * hl + c * hw, hz = c * hl + s * hw;
  return [p.x - hx, p.x + hx, p.z - hz, p.z + hz];
});
export const FARM_BOXES = [...FENCE_BOXES, TROUGH_BOX, ...PIG_BOXES];       // crops are walk-through; add [x0, x1, z0, z1] here to make something solid

// ---------- small helpers ----------
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// frustum culling ON for a set of copies: they are skipped when off screen (needs three r155 or newer, which you have: 0.160)
function cull(im) {
  if (typeof im.computeBoundingSphere === 'function') { im.computeBoundingSphere(); im.frustumCulled = true; } else im.frustumCulled = false;
}

function patch(group, r, color, y, level) {                                         // a flat painted rectangle on the ground
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0),
    new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -level, polygonOffsetUnits: -level }));
  m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  m.receiveShadow = true; group.add(m); return m;
}

function markAreas(group) {
  // (the brown "trodden earth" patch under the animal area was here. It is removed: the animals stand on the plain red sand.)
  patch(group, { x0: WAREHOUSE.x0 + 0.5, x1: WAREHOUSE.x1 - 0.5, z0: WAREHOUSE.z0 + 0.5, z1: WAREHOUSE.z1 - 0.8 }, 0x9d9a92, 0.012, 1);  // concrete yard
  for (let i = 0; i <= 3; i++) {                                                                                                          // the 3 van bay lines
    const x = BAYS.x0 + i * BAY_W;
    patch(group, { x0: x - 0.06, x1: x + 0.06, z0: BAYS.z0, z1: BAYS.z1 }, 0xf1efe6, 0.02, 3);
  }
  patch(group, { x0: BAYS.x0 - 0.06, x1: BAYS.x1 + 0.06, z0: BAYS.z0 - 0.06, z1: BAYS.z0 + 0.06 }, 0xf1efe6, 0.02, 3);                   // back line of the bays
}

// ---------- the crops: one InstancedMesh for each crop and each block, every row piece is a copy of the same mesh ----------
function buildCrop(group, file, rows) {
  new GLTFLoader().load(file, gltf => {
    let part = null;
    gltf.scene.traverse(o => { if (o.isMesh && !part) part = o; });
    if (!part) { console.warn('rural_farm: ' + file + ' has no mesh'); return; }
    const o = new THREE.Object3D(), c = new THREE.Color();
    [WEST_X, EAST_X].forEach(xs => {                                               // west block, east block: 2 draw calls per crop
      const list = [];
      rows.forEach(z => xs.forEach(x => list.push([x, z])));
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach(([x, z], i) => {
        o.position.set(x, 0, z); o.rotation.set(0, rnd() < 0.5 ? 0 : Math.PI, 0);   // some pieces turned round so the rows do not look copied
        o.scale.set(1, 0.92 + rnd() * 0.18, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        const t = 0.84 + rnd() * 0.16; c.setRGB(t, t, t * (0.96 + rnd() * 0.04)); im.setColorAt(i, c);   // a little darker or lighter plant by plant
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false; cull(im); group.add(im);
    });
  }, undefined, e => console.warn('rural_farm: could not load ' + file, e));
}

// ---------- the fence: panels and posts, each one a copy of the same mesh (2 draw calls for the whole fence) ----------
function buildFence(group) {
  const panels = [], posts = new Map();
  FENCE_RUNS.forEach(([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / PANEL_L)), step = len / n;   // whole panels, stretched a hair to fit exactly
    const dx = (bx - ax) / len, dz = (bz - az) / len, rot = Math.atan2(-dz, dx);                             // turns the panel along the run
    for (let i = 0; i < n; i++) panels.push({ x: ax + dx * step * i, z: az + dz * step * i, rot, sx: step / PANEL_L });
    for (let i = 0; i <= n; i++) { const x = ax + dx * step * i, z = az + dz * step * i; posts.set(x.toFixed(2) + ',' + z.toFixed(2), { x, z }); }   // a post at each end of every panel (corners are shared)
  });
  new GLTFLoader().load(FILE_FENCE, gltf => {
    gltf.scene.updateMatrixWorld(true);
    let panelMesh = null, postMesh = null;
    gltf.scene.traverse(o => { if (!o.isMesh) return; if (o.name === 'panel') panelMesh = o; else if (o.name === 'post') postMesh = o; });
    if (!panelMesh && !postMesh) { console.warn('rural_farm: ' + FILE_FENCE + ' has no panel or post'); return; }
    const make = (mesh, list, stretch) => {
      if (!mesh) return;
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);            // the mesh as drawn in the file (its own position baked in)
      const mat = mesh.material.clone(); mat.side = THREE.DoubleSide;              // the panel must show from both sides (inside and outside the farm)
      const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
      list.forEach((p, i) => {
        o.position.set(p.x, 0, p.z); o.rotation.set(0, p.rot || 0, 0); o.scale.set(stretch ? p.sx : 1, 1, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      });
      im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; cull(im); group.add(im);
    };
    make(panelMesh, panels, true);
    make(postMesh, [...posts.values()], false);
  }, undefined, e => console.warn('rural_farm: could not load ' + FILE_FENCE, e));
}

// ---------- mud puddles for the pigs: a darker wet-earth ring and a glossy brown puddle on top, both with a wobbly outline ----------
function blobGeometry(rx, rz, phase) {
  const shape = new THREE.Shape(), N = 32;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + 0.10 * Math.sin(2 * a + phase) + 0.07 * Math.sin(3 * a + phase * 1.7) + 0.04 * Math.sin(5 * a + phase * 2.3);
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * rz * k;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);                    // lay it flat on the ground
}

function buildPuddles(group) {
  const wet = new THREE.MeshStandardMaterial({ color: 0x5a4129, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const water = new THREE.MeshStandardMaterial({ color: 0x6e4d2e, roughness: 0.1, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  PUDDLES.forEach((p, i) => {
    const phase = 1.3 + i * 2.1;
    const ring = new THREE.Mesh(blobGeometry(p.rx * 1.35, p.rz * 1.4, phase + 0.8), wet);
    ring.position.set(p.x, 0.013, p.z); ring.receiveShadow = true; group.add(ring);
    const pool = new THREE.Mesh(blobGeometry(p.rx, p.rz, phase), water);
    pool.position.set(p.x, 0.02, p.z); pool.receiveShadow = true; group.add(pool);
  });
}

// ---------- the animals: every copy has its own skeleton and its own animation (SkeletonUtils.clone), started at a different moment ----------
function buildAnimals(group, mixers) {
  const loader = new GLTFLoader();
  const addAnimals = (file, list, scale, lift, speedRange, turn) => loader.load(file, gltf => {
    const clip = gltf.animations && gltf.animations[0];
    list.forEach((p, i) => {
      const obj = cloneSkinned(gltf.scene), k = scale * p.s;
      obj.scale.setScalar(k); obj.position.set(p.x, lift * k, p.z); obj.rotation.y = p.rot + turn;
      obj.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      group.add(obj);
      if (clip) {                                                                  // keep the animation: play it on this copy only
        const mixer = new THREE.AnimationMixer(obj), action = mixer.clipAction(clip);
        action.time = ((i * 0.37) % 1) * clip.duration;                            // every animal starts at a different point of the loop
        action.timeScale = speedRange[0] + ((i * 0.53) % 1) * (speedRange[1] - speedRange[0]);
        action.play(); mixers.push(mixer);
      }
    });
  }, undefined, e => console.warn('rural_farm: could not load ' + file, e));
  addAnimals(FILE_PIG, PIGS, PIG_SCALE, 0.064, [0.85, 1.1], PIG_TURN);                       // the pig file's feet are 0.064 units below the ground line
  addAnimals(FILE_CHICKEN, CHICKENS, CHICKEN_SCALE, 0, [0.8, 1.15], CHICKEN_TURN);
}

// ---------- the feeding trough, right beside the pigs ----------
function buildTrough(group) {
  new GLTFLoader().load(FILE_TROUGH, gltf => {
    const root = gltf.scene;
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root), size = b.getSize(new THREE.Vector3());
    const k = TROUGH.length / Math.max(size.x, size.z, 1e-6);                      // scale so the long side is TROUGH.length metres
    const holder = new THREE.Group(); holder.add(root);
    root.scale.multiplyScalar(k); root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root), c = b2.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -b2.min.y, -c.z);                                      // centred on x and z, standing on the ground
    if (size.z > size.x) holder.rotation.y = Math.PI / 2;                          // make sure the long side runs along x
    holder.position.set(TROUGH.x, 0, TROUGH.z);
    group.add(holder);
  }, undefined, e => console.warn('rural_farm: could not load ' + FILE_TROUGH, e));
}

export function buildRuralFarm() {
  const group = new THREE.Group();
  const mixers = [];
  if (MARK_AREAS) markAreas(group);
  buildCrop(group, FILE_CASSAVA, CASSAVA_ROWS);
  buildCrop(group, FILE_TOMATO, TOMATO_ROWS);
  buildFence(group);
  buildPuddles(group);
  buildTrough(group);
  buildAnimals(group, mixers);
  const clock = new THREE.Clock();                                                 // game.js calls update() every frame: it moves the pigs and chickens
  const update = () => { const dt = Math.min(clock.getDelta(), 0.1); for (let i = 0; i < mixers.length; i++) mixers[i].update(dt); };
  return { group, update };
}
