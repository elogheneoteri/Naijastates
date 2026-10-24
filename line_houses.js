// line_houses.js  (the Low-Class Housing: Line Houses plot)
//
// Exports:  buildLineHouses() -> { group }      LINE_HOUSE_BOXES -> solid parts for collisions
//
// LOCAL SPACE is the same as the other buildings: the plot centre is (0,0), the front / road side is +Z (south), the back is -Z (north),
// +X is east. The models have their doors on their +Z side, are centred on x/z and have their base at y = 0.
//
// "Face me, I face you": FOUR line houses, two on the west side and two on the east side, with their doors facing each other across a yard
// (the west houses face east, the east houses face west). The outdoor bathroom and toilet stands in the yard at the north end, doors facing south.
//
// THINGS YOU MAY WANT TO CHANGE
//   FILE / SCALE        the line house model and its size (5.6 makes the doors about 2 m tall; the house is then about 10.5 m long, 9.2 m deep)
//   YARD                the width of the yard between the west row and the east row (the plot is 25 m wide, so about 6.4 m is the most that fits)
//   BATH_FILE / BATH_SCALE   the outdoor bathroom and toilet (2.4 makes its doors about 1.9 m tall: the building is then about 4.6 m wide, 4.1 m deep)
//   BATH_MARGIN               how far from the north edge of the plot the bathroom/toilet building stands (BATH_MARGIN)
//   GRASS_TUFTS         how many small grass tufts are scattered on the sand (a touch of grass); 0 = none
//   LAYOUT              one line per line house: x, z (metres from the plot centre) and rotY
//                       (0 = doors face south, 90 = doors face east, 180 = doors face north, 270 = doors face west).
//                       Keep rotY at 0, 90, 180 or 270 so the walls line up with the collision boxes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILE = 'line_house.glb';
const SCALE = 5.6;
const PLOT_D = 22;                                       // depth of the plot (north-south), from city.js

// size of the line house model in its own units (from the file): 1.884 wide (x), 1.642 deep (z), 0.917 high
const HALF_W = 0.942 * SCALE, HALF_D = 0.821 * SCALE;    // half the length of the house along its row, half its depth
const VERANDAH = 0.6;                                    // the strip in front of the doors that stays walkable (the steps)

const YARD = 6.4;
const ROW_X = YARD / 2 + HALF_D;                         // the houses stand with their back walls this far from the middle
const ROW_Z = HALF_W + 0.05;                             // two houses in a row, one north, one south (a small gap between them)
const LAYOUT = [
  { x: -ROW_X, z: -ROW_Z, rotY: 90 },                    // west row, north house, doors face east
  { x: -ROW_X, z: ROW_Z, rotY: 90 },                     // west row, south house, doors face east
  { x: ROW_X, z: -ROW_Z, rotY: 270 },                    // east row, north house, doors face west
  { x: ROW_X, z: ROW_Z, rotY: 270 }                      // east row, south house, doors face west
];

// the outdoor bathroom and toilet (two doors on its +Z side), in the yard at the north end, facing south
const BATH_FILE = 'bathroom_toilet.glb';
const BATH_SCALE = 2.4;
const BATH_HALF_W = 0.951 * BATH_SCALE, BATH_HALF_D = 0.845 * BATH_SCALE;    // from the file: 1.902 wide, 1.69 deep, 1.344 high
const BATH_MARGIN = 0.6;                                                  // gap between the building and the north edge of the plot
const BATH = { x: 0, z: -PLOT_D / 2 + BATH_MARGIN + BATH_HALF_D, rotY: 0 };
const BATH_APRON = 0.6;                                                   // the strip in front of its doors that stays walkable

// solid footprint of each house, [minX, maxX, minZ, maxZ] relative to the plot centre
function footprint(h, halfW, halfD, apron) {
  const turn = ((Math.round(h.rotY / 90) % 4) + 4) % 4;
  const swap = turn % 2 === 1;
  const hw = (swap ? halfD : halfW) - 0.2, hd = (swap ? halfW : halfD) - 0.2;
  let x0 = h.x - hw, x1 = h.x + hw, z0 = h.z - hd, z1 = h.z + hd;
  if (turn === 0) z1 -= apron; else if (turn === 2) z0 += apron; else if (turn === 1) x1 -= apron; else x0 += apron;
  return [x0, x1, z0, z1];
}
export const LINE_HOUSE_BOXES = [
  ...LAYOUT.map(h => footprint(h, HALF_W, HALF_D, VERANDAH)),
  footprint(BATH, BATH_HALF_W, BATH_HALF_D, BATH_APRON)
];

// ---------- a touch of grass on the bare sand ----------
// The ground here is the world's red sand (city.js no longer lays a grey pad under this plot). A few small grass tufts are scattered in the yard,
// around the bathroom and toilet, and just outside the plot edges. They never stand in the walkway of the yard or in front of the doors.
const GRASS_TUFTS = 90;

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
  let seed = 20261024;                                   // fixed seed: the tufts are in the same places every time
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const solids = [...LAYOUT.map(h => footprint(h, HALF_W, HALF_D, 0)), footprint(BATH, BATH_HALF_W, BATH_HALF_D, 0)];
  const PLOT_W = 25, PX = PLOT_W / 2, PZ = PLOT_D / 2;
  const spots = [];
  for (let tries = 0; spots.length < GRASS_TUFTS && tries < 4000; tries++) {
    const x = (rnd() * 2 - 1) * (PX + 1.5), z = (rnd() * 2 - 1) * (PZ + 1.5);
    if (z > PZ + 0.5) continue;                                                             // not onto the pavement of the main road
    if (solids.some(b => x > b[0] - 0.7 && x < b[1] + 0.7 && z > b[2] - 0.7 && z < b[3] + 0.7)) continue;      // not against the walls
    if (Math.abs(x) < YARD / 2 && Math.abs(x) < 1.6) continue;                              // keep the middle of the yard clear for walking
    if (Math.abs(x) < YARD / 2 + 0.2 && z > -PZ + BATH_MARGIN + 2 * BATH_HALF_D + 0.5) continue;   // and the strips in front of the doors (only the bathroom end stays grassy)
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

function place(group, gltf, scale, h) {
  const m = gltf.scene.clone(true);                      // the same model and textures, shared between the copies
  m.scale.setScalar(scale);
  const holder = new THREE.Group();
  holder.position.set(h.x, 0, h.z);
  holder.rotation.y = THREE.MathUtils.degToRad(h.rotY);
  holder.add(m);
  group.add(holder);
}

function plainBlock(group, w, d, h) {                    // a plain block so the game keeps running if a model is missing
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), new THREE.MeshStandardMaterial({ color: 0xc9b99a }));
  b.position.set(h.x, 2, h.z); b.rotation.y = THREE.MathUtils.degToRad(h.rotY); group.add(b);
}

export function buildLineHouses() {
  const group = new THREE.Group();
  addTufts(group);
  const load = (file, onLoad, onFail) => new GLTFLoader().load(file, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    onLoad(gltf);
  }, undefined, e => { console.warn('line_houses: could not load ' + file, e); onFail(); });

  load(FILE, gltf => LAYOUT.forEach(h => place(group, gltf, SCALE, h)),
       () => LAYOUT.forEach(h => plainBlock(group, HALF_W * 2, HALF_D * 2, h)));
  load(BATH_FILE, gltf => place(group, gltf, BATH_SCALE, BATH),
       () => plainBlock(group, BATH_HALF_W * 2, BATH_HALF_D * 2, BATH));
  return { group };
}
