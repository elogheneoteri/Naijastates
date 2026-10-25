// bedsitter.js  (the Low-Class Housing: Bed-Sitters plot)
//
// Exports:  buildBedsitter() -> { group }      BEDSIT_BOXES -> solid parts for collisions
//
// LOCAL SPACE is the same as the other buildings: the plot centre is (0,0), the front / road side is +Z (south), the back is -Z (north),
// +X is east. The model has its doors on its +Z side, is centred on x/z and has its base at y = 0.
//
// THE BUILDING (bedsitter.glb, made from your base_basic_pbr.glb): two floors, six rooms on each floor, a veranda (balcony with a rail) along the
// whole front of the top floor, and an outside staircase on the EAST end. Its textures were shrunk (7.1 MB -> 1.4 MB, the picture looks the same);
// the shape itself was not touched (20,000 triangles).
//
// THE LAYOUT: TWO blocks, both facing SOUTH (towards the main road), one IN FRONT OF the other, on the same line (x = 0). The south block stands at the
// front of the plot, the north block at the back. The open yard between them (SPACE_BETWEEN, see below) is kept free: that is where the two water
// tanks and the tap will go.
//
// STEP 1 (this file): the buildings are placed. The staircases are drawn but are SOLID BLOCKS for now (you cannot walk on them yet).
// The next steps will add the water tap and then the walkable stairs; both will change this file and nothing else.
//
// THINGS YOU MAY WANT TO CHANGE
//   FILE / SCALE   the model and its size. Two blocks one behind the other have to share the plot's 22 m depth, so 9.4 is as big as they can be
//                  and still leave a yard between them: doors about 1.74 m tall, each block about 17.9 m long, 8.8 m deep and 6.3 m high
//   EDGE           the gap between the roof edge of the front block and the front of the plot (and the back block and the back of the plot)
//   GRASS_TUFTS    how many small grass tufts are scattered on the sand; 0 = none

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILE = 'bedsitter.glb';
const SCALE = 9.4;
const PLOT_W = 24, PLOT_D = 22;                            // size of the plot, from city.js (24 x 22)

// measurements of the model in its own units (read from the file): the roof is 1.9 long (x) and 0.938 deep (z), 0.675 high
const ROOF_HALF_L = 0.95 * SCALE, ROOF_HALF_D = 0.469 * SCALE;      // the roof edge (the widest part)
const BODY_HALF_L = 0.81 * SCALE;                                   // the walls: 0.81 from the middle to each end
const BODY_BACK = -0.43 * SCALE, BODY_FRONT = 0.37 * SCALE;         // back wall and front wall (doors), measured from the model middle
const STAIR_X0 = 0.80 * SCALE, STAIR_X1 = 0.95 * SCALE;             // the staircase sticks out of the east wall, between these x values
const STAIR_Z0 = -0.31 * SCALE, STAIR_Z1 = 0.35 * SCALE;            // and runs along the wall between these z values

const APRON = 0.6;                                                  // the strip in front of the doors that stays walkable

// the two blocks, centred on x = 0, the south block at the front of the plot and the north block at the back; both rotY 0 = doors face south
const EDGE = 0.4;                                                   // roof edge to plot edge (front and back)
const BLD_Z = PLOT_D / 2 - EDGE - ROOF_HALF_D;                      // how far from the plot centre each block's middle is (6.2 m)
const LAYOUT = [
  { x: 0, z: -BLD_Z, rotY: 0 },                                     // north block (back of the plot)
  { x: 0, z: BLD_Z, rotY: 0 }                                       // south block (front of the plot, next to the road)
];
const SPACE_BETWEEN = BLD_Z - ROOF_HALF_D;                          // half the free yard between the two roofs: the yard runs from z = -this to +this (about 3.6 m wide in all)

// solid parts, [minX, maxX, minZ, maxZ] relative to the plot centre
export const BEDSIT_BOXES = LAYOUT.flatMap(b => [
  // the walls (pulled in 0.2 m so you can brush along them, and the strip in front of the doors is left open)
  [b.x - BODY_HALF_L + 0.2, b.x + BODY_HALF_L - 0.2, b.z + BODY_BACK + 0.2, b.z + BODY_FRONT - 0.2 - APRON],
  // the outside staircase on the east end: a solid block for now (the walkable stairs come in the stairs step)
  [b.x + BODY_HALF_L - 0.3, b.x + STAIR_X1, b.z + STAIR_Z0, b.z + STAIR_Z1]
]);

// ---------- a touch of grass on the bare sand ----------
// The ground here is the world's red sand (city.js no longer lays a grey pad under this plot). Small grass tufts are scattered in the yard,
// at the sides and just outside the plot edges, never against the walls and never in the yard between the two blocks (that is kept free for the tanks and the tap).
const GRASS_TUFTS = 70;

function paintTuft(ctx, S) {                             // a small fan of grass blades on a transparent card
  ctx.clearRect(0, 0, S, S);
  const greens = ['#5f8f2e', '#6f9c36', '#4d7d28', '#7fa83f', '#86a845'];
  for (let i = 0; i < 16; i++) {
    const x0 = S * (0.30 + 0.40 * ((i * 0.6180339) % 1)), lean = (((i * 0.4142) % 1) - 0.5) * S * 0.55, h = S * (0.50 + 0.42 * ((i * 0.7321) % 1));
    ctx.strokeStyle = greens[i % greens.length]; ctx.lineWidth = S * 0.045; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, S * 0.98); ctx.quadraticCurveTo(x0 + lean * 0.3, S * 0.98 - h * 0.6, x0 + lean, S * 0.98 - h); ctx.stroke();
  }
}

function addTufts(group) {
  if (!GRASS_TUFTS) return;
  let seed = 20261025;                                   // fixed seed: the tufts are in the same places every time
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const solids = LAYOUT.map(b => [b.x - ROOF_HALF_L, b.x + ROOF_HALF_L, b.z - ROOF_HALF_D, b.z + ROOF_HALF_D]);     // everything under each roof edge
  const PX = PLOT_W / 2, PZ = PLOT_D / 2;
  const spots = [];
  for (let tries = 0; spots.length < GRASS_TUFTS && tries < 4000; tries++) {
    const x = (rnd() * 2 - 1) * (PX + 1.5), z = (rnd() * 2 - 1) * (PZ + 1.5);
    if (z > PZ + 0.5) continue;                                                             // not onto the pavement of the main road
    if (solids.some(b => x > b[0] - 0.6 && x < b[1] + 0.6 && z > b[2] - 0.6 && z < b[3] + 0.6)) continue;   // not against the buildings
    if (Math.abs(z) < SPACE_BETWEEN + 0.6 && Math.abs(x) < ROOF_HALF_L) continue;                          // not in the yard between the blocks
    spots.push([x, z]);
  }
  const c = document.createElement('canvas'); c.width = c.height = 128; paintTuft(c.getContext('2d'), 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  [0, Math.PI / 2].forEach(rot => {                                                         // two crossed cards per tuft
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.4).translate(0, 0.2, 0).rotateY(rot), mat, spots.length), m = new THREE.Object3D(), col = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = 0.6 + rnd() * 0.7; m.position.set(x, -0.03, z); m.rotation.y = rnd() * 3.14; m.scale.set(k, k * (0.8 + rnd() * 0.5), k); m.updateMatrix();
      im.setMatrixAt(i, m.matrix); const t = 0.8 + rnd() * 0.35; im.setColorAt(i, col.setRGB(t, t, t * 0.92));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; group.add(im);
  });
}

function plainBlock(group, h) {                          // a plain block so the game keeps running if the model is missing
  const b = new THREE.Mesh(new THREE.BoxGeometry(BODY_HALF_L * 2, 6, (BODY_FRONT - BODY_BACK)), new THREE.MeshStandardMaterial({ color: 0xc9b99a }));
  b.position.set(h.x, 3, h.z + (BODY_FRONT + BODY_BACK) / 2); group.add(b);
}

export function buildBedsitter() {
  const group = new THREE.Group();
  addTufts(group);
  new GLTFLoader().load(FILE, gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.anisotropy = 4; });
    });
    LAYOUT.forEach(h => {                                // the same model and textures, shared between the two blocks
      const holder = new THREE.Group();
      holder.position.set(h.x, 0, h.z);
      holder.rotation.y = THREE.MathUtils.degToRad(h.rotY);
      const m = gltf.scene.clone(true);
      m.scale.setScalar(SCALE);
      holder.add(m);
      group.add(holder);
    });
  }, undefined, e => { console.warn('bedsitter: could not load ' + FILE, e); LAYOUT.forEach(h => plainBlock(group, h)); });
  return { group };
}
