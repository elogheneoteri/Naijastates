// line_houses.js  (the Low-Class Housing: Line Houses plot)
//
// Exports:  buildLineHouses() -> { group }      LINE_HOUSE_BOXES -> solid parts for collisions
//
// One model (line_house.glb, made with Rodin) placed more than once. LOCAL SPACE is the same as the other buildings:
// the plot centre is (0,0), the front / road side is +Z. The model has its 4 doors on its +Z side and is centred on x/z with its base at y = 0.
// "Face me, I face you": two houses with their doors facing each other across a small yard.
//
// THINGS YOU MAY WANT TO CHANGE
//   FILE    the model file (in the same folder as index.html)
//   SCALE   size of the house. 5.6 makes the doors about 2 m tall (the house is then about 10.5 m wide, 9.2 m deep, 5.1 m to the roof ridge)
//   LAYOUT  one line per house: x, z (metres from the plot centre) and rotY (0 = doors face the road side, 180 = doors face the back, 90 / 270 = doors face the sides).
//           Add a line to add a house, delete a line to remove one. Keep rotY at 0, 90, 180 or 270 so the walls line up with the collision boxes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILE = 'line_house.glb';
const SCALE = 5.6;
const LAYOUT = [
  { x: 0, z: -6.4, rotY: 0 },        // back house, doors face the yard (and the road)
  { x: 0, z: 6.4, rotY: 180 }        // front house, doors face the yard (its plain back wall faces the road)
];

// size of the model in its own units (from the file): 1.884 wide (x), 1.642 deep (z), 0.917 high
const HALF_W = 0.942 * SCALE, HALF_D = 0.821 * SCALE;
const VERANDAH = 0.6;                                  // the strip in front of the doors that stays walkable (the steps)

// solid footprint of each house, [minX, maxX, minZ, maxZ] relative to the plot centre
export const LINE_HOUSE_BOXES = LAYOUT.map(h => {
  const turn = ((Math.round(h.rotY / 90) % 4) + 4) % 4;
  const swap = turn % 2 === 1;
  const hw = (swap ? HALF_D : HALF_W) - 0.2, hd = (swap ? HALF_W : HALF_D) - 0.2;
  let x0 = h.x - hw, x1 = h.x + hw, z0 = h.z - hd, z1 = h.z + hd;
  if (turn === 0) z1 -= VERANDAH; else if (turn === 2) z0 += VERANDAH; else if (turn === 1) x1 -= VERANDAH; else x0 += VERANDAH;
  return [x0, x1, z0, z1];
});

export function buildLineHouses() {
  const group = new THREE.Group();
  new GLTFLoader().load(FILE, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    LAYOUT.forEach(h => {
      const m = gltf.scene.clone(true);                // the same model and textures, shared between the copies
      m.scale.setScalar(SCALE);
      const holder = new THREE.Group();
      holder.position.set(h.x, 0, h.z);
      holder.rotation.y = THREE.MathUtils.degToRad(h.rotY);
      holder.add(m);
      group.add(holder);
    });
  }, undefined, e => {
    console.warn('line_houses: could not load ' + FILE, e);
    LAYOUT.forEach(h => {                              // plain block so the game keeps running
      const b = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 4, HALF_D * 2), new THREE.MeshStandardMaterial({ color: 0xc9b99a }));
      b.position.set(h.x, 2, h.z); group.add(b);
    });
  });
  return { group };
}
