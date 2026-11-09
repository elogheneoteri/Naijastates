// industrial.js  (the Industrial District: the Textile Factory and the Food Factory on the Industrial plot from city.js)
//
// Exports:  buildIndustrial() -> { group, update }      INDUSTRIAL_BOXES -> solid parts for collisions      INDUSTRIAL_ORIGIN -> the centre this district is placed at
//
// WORLD-ALIGNED, like hotel.js: game.js does NOT turn it (rotY 0 in the BUILDINGS entry), the layout below is in real world metres and each building turns itself.
// +X = east, +Z = south, -Z = north.   Both factories FACE WEST, towards the avenue at x = 320 (the nearest road, so the plot's own 'front' is west).
//
// FILES (main folder, next to hotel.glb): textile_factory.glb and food_factory.glb. Both are optimised copies of your Rodin models:
//   textile_factory.glb   4,993 triangles, 3.5 MB      food_factory.glb   7,841 triangles, 2.9 MB      (were 20,000 each)
//   The name boards ("TEXTILE FACTORY" and "FOOD FACTORY") are part of the files: nothing to add in code.
//   Each file is centred on x/z with its base at y = 0 and its front on +Z, about 1.9 units wide, scaled by SCALE below.
//
// THE PLOT (from city.js):  Industrial District  x 329 to 357, z 37 to 87   (28 x 50 m)
// WHAT IS HERE: the Textile Factory in the north half and the Food Factory in the south half, side by side along the avenue, each about 22 m wide, with 2.5 m between the
//   plot edge and the front walls. The 12 m behind them is kept empty (yard / fence / loading area later).
//
// THINGS YOU MAY WANT TO CHANGE
//   SCALE   how big the factories are (11.5 -> about 22 m wide, Textile 10 m deep and 7.6 m high, Food 13.6 m deep and 8 m high)
//   x, z    where a building stands (its centre). Move it and the walls follow by themselves.
//   FILL_WEST / FILL_NORTH   how much light the shaded walls get (see brightenShadedWalls)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const INDUSTRIAL_ORIGIN = { x: 343, z: 62 };       // the centre of the plot: it MUST be the x / z of the BUILDINGS entry in game.js
const PLOT = { x0: 329, x1: 357, z0: 37, z1: 87 };

const SCALE = 11.5;
const TEXTILE_MODEL = { hw: 0.95, hd: 0.44, h: 0.66 };    // half width, half depth, height of textile_factory.glb in its own units
const FOOD_MODEL = { hw: 0.95, hd: 0.59, h: 0.70 };       // the same for food_factory.glb
const FRONT_X = PLOT.x0 + 2.5;                            // the line the front walls stand on (the west side of the buildings)

// rotY 270 = the front (+Z of the file) points WEST.  x, z = the centre of the building.
const PARTS = [
  { file: 'textile_factory.glb', scale: SCALE, x: FRONT_X + TEXTILE_MODEL.hd * SCALE, z: 49.9, rotY: 270, half: TEXTILE_MODEL },
  { file: 'food_factory.glb',    scale: SCALE, x: FRONT_X + FOOD_MODEL.hd * SCALE,    z: 74.3, rotY: 270, half: FOOD_MODEL }
];

// ---- solid parts, [minX, maxX, minZ, maxZ] relative to INDUSTRIAL_ORIGIN (the game does not turn them: rotY is 0) ----
const STEP = 0.5;                                          // the strip in front of each door that stays walkable
export const INDUSTRIAL_BOXES = PARTS.map(p => {
  const turned = (Math.round(p.rotY / 90) % 2) !== 0;
  const hw = (turned ? p.half.hd : p.half.hw) * p.scale - 0.2, hd = (turned ? p.half.hw : p.half.hd) * p.scale - 0.2;
  let x0 = p.x - hw, x1 = p.x + hw, z0 = p.z - hd, z1 = p.z + hd;
  const turn = ((Math.round(p.rotY / 90) % 4) + 4) % 4;   // which way the door side points: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
  if (turn === 0) z1 -= STEP; else if (turn === 1) x1 -= STEP; else if (turn === 2) z0 += STEP; else x0 += STEP;
  return [x0 - INDUSTRIAL_ORIGIN.x, x1 - INDUSTRIAL_ORIGIN.x, z0 - INDUSTRIAL_ORIGIN.z, z1 - INDUSTRIAL_ORIGIN.z];
});

// The game's sun shines from the south-east, so walls that face WEST or NORTH never get sun (these fronts face west). This adds a soft glow of the wall's own colour to
// west- and north-facing surfaces only. 0 = off, about 0.6 = as bright as a sunny wall.
const FILL_WEST = 0.6, FILL_NORTH = 0.4;
function brightenShadedWalls(mat) {
  if (!mat || mat.userData.shadeFill) return; mat.userData.shadeFill = true;
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  vec3 nWorldFill = normalize((vec4(normal, 0.0) * viewMatrix).xyz);\n  totalEmissiveRadiance += diffuseColor.rgb * (clamp(-nWorldFill.x, 0.0, 1.0) * ' + FILL_WEST.toFixed(3) + ' + clamp(-nWorldFill.z, 0.0, 1.0) * ' + FILL_NORTH.toFixed(3) + ');');
  };
  mat.customProgramCacheKey = () => 'industrialFill';
  mat.needsUpdate = true;
}

export function buildIndustrial() {
  const group = new THREE.Group();
  PARTS.forEach(p => {
    const holder = new THREE.Group();                      // turned to face the right way, standing at its place (relative to INDUSTRIAL_ORIGIN)
    holder.position.set(p.x - INDUSTRIAL_ORIGIN.x, 0, p.z - INDUSTRIAL_ORIGIN.z);
    holder.rotation.y = THREE.MathUtils.degToRad(p.rotY);
    group.add(holder);
    new GLTFLoader().load(p.file, gltf => {
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; brightenShadedWalls(o.material); } });
      gltf.scene.scale.setScalar(p.scale);
      holder.add(gltf.scene);
    }, undefined, e => {
      console.warn('industrial: could not load ' + p.file, e);          // a plain block so the game keeps running
      const b = new THREE.Mesh(new THREE.BoxGeometry(p.half.hw * 2 * p.scale, p.half.h * p.scale, p.half.hd * 2 * p.scale), new THREE.MeshStandardMaterial({ color: 0xd8d2c4 }));
      b.position.y = p.half.h * p.scale / 2; holder.add(b);
    });
  });
  return { group, update: () => {} };
}
