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
