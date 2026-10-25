// rural_farm.js  (the Rural District plot, next to the High School across the avenue)
//
// Exports:  buildRuralFarm() -> { group }      FARM_BOXES -> solid parts for collisions (none: you walk between and through the crops)
//           FARM_AREAS -> the reserved areas (river, animals, warehouse + van bays), in metres from the plot centre
//
// LOCAL SPACE is the same as the other buildings: the plot centre is (0,0), the front / road side is +Z (south), the back is -Z (north,
// the world edge), +X is east. game.js turns the plot to face the main road (rotY 0 here).
//
// THE PLOT (74 m wide x 22 m deep), seen from above, north at the top:
//
//   +---------------------------------------------------------------------------+
//   |  RIVER GAP (5 m, left empty for your open river along the world edge)      |
//   +-----------------+-------------------------------------------+-------------+
//   |                 |  4 rows of CASSAVA        (2 blocks of 5)  |  WAREHOUSE  |
//   |  FARM ANIMALS   |  ------ footpath ------                    |  area and   |
//   |  (west side)    |  5 rows of TOMATOES + PEPPER (2 blocks)    |  3 VAN bays |
//   +-----------------+-------------------------------------------+-------------+   <- the main road is in front (south)
//
// FILES (both go in your props folder). They are made from your two 20,000-triangle row models:
//   cassava_row.glb      ONE 3.8 m row piece of cassava on its soil bed: 130 triangles, one 1024 x 512 picture (was 20,000 triangles, 3 pictures of 2048 px)
//   tomato_row.glb       ONE 3.8 m row piece of tomatoes and peppers on a soil bed: 130 triangles, one 1024 x 512 picture (was 20,000 triangles, 3 pictures)
//   Every plant is built from crossed leaf cards that carry pictures of your plants (4 upright cards + 1 flat card for each plant).
//   Seen from the road or from the footpath it looks like your model; very close up the leaves are flat pictures.
//
// KEEPING THE GAME FAST
//   * 90 row pieces in the whole farm = about 11,700 triangles (the same farm made from your original models would be 1,800,000)
//   * 4 draw calls for all the crops (InstancedMesh: 2 crops x the west and the east block). Each block is only drawn while it is on screen.
//   * no shadows from the crops, no grass tufts on the plot
//   * the reserved areas are 3 flat patches (a few triangles each)
//
// THINGS YOU MAY WANT TO CHANGE
//   RIVER_DEPTH      how deep the river gap along the north edge is (metres)
//   ANIMAL_W / WAREHOUSE_W   how wide the animal area (west) and the warehouse area (east) are
//   CASSAVA_ROWS / TOMATO_ROWS   the z of each row (metres from the plot centre); delete a number for one row less
//   MARK_AREAS       false = no painted patches at all (the reserved areas stay bare red sand)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS_DIR } from './props_library.js';

const FILE_CASSAVA = PROPS_DIR + 'cassava_row.glb', FILE_TOMATO = PROPS_DIR + 'tomato_row.glb';   // in the props folder
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

export const FARM_BOXES = [];                                                       // crops are walk-through; add [x0, x1, z0, z1] here to make something solid

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
  patch(group, { x0: ANIMALS.x0 + 0.5, x1: ANIMALS.x1 - 0.5, z0: ANIMALS.z0 + 0.5, z1: ANIMALS.z1 - 0.8 }, 0x7a6244, 0.012, 1);          // trodden earth for the animals
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

export function buildRuralFarm() {
  const group = new THREE.Group();
  if (MARK_AREAS) markAreas(group);
  buildCrop(group, FILE_CASSAVA, CASSAVA_ROWS);
  buildCrop(group, FILE_TOMATO, TOMATO_ROWS);
  return { group };
}
