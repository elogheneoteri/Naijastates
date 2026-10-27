// hotel.js  (the Hotel compound: the Hotel, the Club House and the Swimming Pool on the Hotel plot from city.js)
//
// Exports:  buildHotel() -> { group, update }      HOTEL_BOXES -> solid parts for collisions      HOTEL_ORIGIN -> the centre this compound is placed at
//           cutPoolHole(shader) -> makes the pool-shaped HOLE in the ground (game.js calls it for the ground and the far plane, next to cutRiverHole)
//
// WORLD-ALIGNED: like government.js, the compound is NOT turned by game.js (rotY 0 in the BUILDINGS entry), so the layout below is in real world metres
// and every building turns itself.  +X = east, +Z = south, -Z = north.   Both buildings face NORTH, towards the main road.
//
// FILES (main folder, next to city_hall.glb): hotel.glb, club_house.glb and swimming_pool.glb. Both are SHRUNK copies of your Rodin models (colour 2048 px, normal 2048 px, shine 1024 px):
//   hotel.glb        20,000 triangles, 2.6 MB (was 8.1 MB)      club_house.glb   4,326 triangles, 1.5 MB (was 6.6 MB)
//   swimming_pool.glb 20,000 triangles, 1.5 MB (was 10.3 MB)
//   PROPS FOLDER: pool_ladder.glb (your ladder, as it is) and water_animation_optimised.glb (the one the river uses: it is the water in the pool).
//   Each file is centred on x/z with its base at y = 0 and its front (door side) on +Z, size in its own units (about 1.9 wide), scaled by SCALE below.
//
// THE PLOT (from city.js):  Hotel plot  x 238 to 312, z 36 to 86   (74 x 50 m)
// WHAT IS HERE: the two buildings with their name boards (HOTEL and CLUB HOUSE) and the swimming pool in the strip west of the hotel (x 242 to 250, z 66 to 80),
//   sunk into the ground (the ground has a hole cut in it, like the river), with two ladders on its east wall and animated water. The space in front of the buildings
//   (z 37 to 63) is kept empty for the gate, driveway, fountain and car park, and 3 m is kept free behind them for the fence.
//   The pool is 11.8 m long and 5.2 m wide inside, 1.5 m deep at the shallow end (south) and 2.3 m deep at the deep end (north). Nobody can walk into it (it is a solid box),
//   the deck round it is walkable.
//
// THINGS YOU MAY WANT TO CHANGE
//   SCALE      how big each building is (Hotel 15.7 -> about 30 m wide, 20 m deep, 10.4 m high; Club House 8.3 -> about 15 m wide, 15.8 m deep, 6.9 m high)
//   x, z       where the building stands (its centre). Move it and the walls follow by themselves.
//   sign.text  the words on the name board
//   POOL       where the pool is (x, z = its middle) and how big (scale 7.4 = 11.8 m long inside); WATER_DROP = how far the water is below the edge (0.15 m)
//   LADDERS    where the two ladders are along the pool wall (-1 = shallow end, +1 = deep end)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS_DIR } from './props_library.js';

export const HOTEL_ORIGIN = { x: 275, z: 61 };           // the centre this compound is placed at: it MUST be the x / z of the BUILDINGS entry in game.js

const PLOT = { x0: 238, x1: 312, z0: 36, z1: 86 };
const BACK_GAP = 3.0;                                    // metres between the back of a building and the back edge of the plot

// model sizes (half width x, half depth z, height), in the model's own units
const HOTEL_MODEL = { hw: 0.954, hd: 0.637, h: 0.664 };
const CLUB_MODEL = { hw: 0.915, hd: 0.950, h: 0.833 };
const HOTEL_SCALE = 15.7, CLUB_SCALE = 8.3;

// both stand with their back to the south edge of the plot and their door to the north (the road)
const backZ = PLOT.z1 - BACK_GAP;
const PARTS = [
  { file: 'hotel.glb', scale: HOTEL_SCALE, x: 268, z: backZ - HOTEL_MODEL.hd * HOTEL_SCALE, rotY: 180, half: HOTEL_MODEL,
    sign: { text: 'HOTEL', x: 0.010, y: 0.4715, z: 0.561, w: 0.190, h: 0.058 } },          // the white board above the glass lobby
  { file: 'club_house.glb', scale: CLUB_SCALE, x: 300, z: backZ - CLUB_MODEL.hd * CLUB_SCALE, rotY: 180, half: CLUB_MODEL,
    sign: { text: 'CLUB HOUSE', x: 0.003, y: 0.5725, z: 0.695, w: 0.350, h: 0.085 } }       // the grey board above the entrance canopy
];

// ---- the swimming pool (swimming_pool.glb: a deck slab with the pool cut into it; its top face is the deck) ----
// In the model's own units: the deck top is 0.346 high, the opening is 0.80 long each way along x and 0.35 each way along z (floor 0.70 x 0.31), x = the long way,
// the floor is 0.15 high at the shallow end (x < -0.3), slopes up to 0.04 at x = 0.19, and stays 0.04 to the deep end.
const POOL = { file: 'swimming_pool.glb', scale: 7.4, x: 246, z: 73, rotY: 90, deck: 0.346, openX: 0.80, openZ: 0.35 };   // rotY 90: the deep end (+x of the file) points north
const WATER_DROP = 0.15;                                   // the water is this far below the edge of the pool
const LADDER_FILE = 'pool_ladder.glb', LADDER_SCALE = 0.01, LADDERS = [-0.45, 0.50];    // along the pool wall, in file units (x of the pool file); the wall is the pool's +z side (east)
const WATER_FILE = 'water_animation_optimised.glb';
const poolTurned = (Math.round(POOL.rotY / 90) % 2) !== 0;
const POOL_HX = (poolTurned ? POOL.openZ : POOL.openX) * POOL.scale, POOL_HZ = (poolTurned ? POOL.openX : POOL.openZ) * POOL.scale;   // half size of the opening, in world metres
const HOLE_PAD = 0.4;                                      // the ground hole is a little bigger than the opening (it hides under the deck)
export const POOL_HOLE = { x0: POOL.x - POOL_HX - HOLE_PAD, x1: POOL.x + POOL_HX + HOLE_PAD, z0: POOL.z - POOL_HZ - HOLE_PAD, z1: POOL.z + POOL_HZ + HOLE_PAD };
const POOL_BOX = [POOL.x - POOL_HX + 0.1 - HOTEL_ORIGIN.x, POOL.x + POOL_HX - 0.1 - HOTEL_ORIGIN.x, POOL.z - POOL_HZ + 0.1 - HOTEL_ORIGIN.z, POOL.z + POOL_HZ - 0.1 - HOTEL_ORIGIN.z];

// ---- solid parts: the walls of each building, [minX, maxX, minZ, maxZ] relative to HOTEL_ORIGIN (the game does not turn them: rotY is 0) ----
const STEP = 0.5;                                          // the strip in front of each door that stays walkable
export const HOTEL_BOXES = [POOL_BOX, ...PARTS.map(p => {
  const turned = (Math.round(p.rotY / 90) % 2) !== 0;
  const hw = (turned ? p.half.hd : p.half.hw) * p.scale - 0.2, hd = (turned ? p.half.hw : p.half.hd) * p.scale - 0.2;
  let x0 = p.x - hw, x1 = p.x + hw, z0 = p.z - hd, z1 = p.z + hd;
  const turn = ((Math.round(p.rotY / 90) % 4) + 4) % 4;   // which way the door side points: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
  if (turn === 0) z1 -= STEP; else if (turn === 1) x1 -= STEP; else if (turn === 2) z0 += STEP; else x0 += STEP;
  return [x0 - HOTEL_ORIGIN.x, x1 - HOTEL_ORIGIN.x, z0 - HOTEL_ORIGIN.z, z1 - HOTEL_ORIGIN.z];
})];

// ---------- the text on a name board ----------
function signTexture(text, ratio) {
  const c = document.createElement('canvas'); c.width = 1536; c.height = Math.max(64, Math.round(1536 / ratio));
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = c.height * 0.8;                              // biggest letters that fit
  for (; size > 30; size -= 4) { g.font = `800 ${size}px "Segoe UI", Arial, Helvetica, sans-serif`; if (g.measureText(text).width <= c.width * 0.86) break; }
  g.lineJoin = 'round'; g.lineWidth = size * 0.05; g.strokeStyle = '#ffffff'; g.strokeText(text, c.width / 2, c.height / 2 + 3);
  g.fillStyle = '#0a2a66'; g.fillText(text, c.width / 2, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- the hole in the ground (game.js calls this for the ground and for the far plane, so the pool shows) ----------
export function cutPoolHole(sh) {
  const f = v => v.toFixed(3);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPoolW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPoolW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPoolW;')
    .replace('void main() {', `void main() {
  if (vPoolW.x > ${f(POOL_HOLE.x0)} && vPoolW.x < ${f(POOL_HOLE.x1)} && vPoolW.z > ${f(POOL_HOLE.z0)} && vPoolW.z < ${f(POOL_HOLE.z1)}) discard;`);
}

// ---------- the pool, its ladders and its water ----------
function buildPool(group, animators) {
  const holder = new THREE.Group();                        // at ground level, turned like the pool
  holder.position.set(POOL.x - HOTEL_ORIGIN.x, 0, POOL.z - HOTEL_ORIGIN.z);
  holder.rotation.y = THREE.MathUtils.degToRad(POOL.rotY);
  group.add(holder);
  const S = POOL.scale, deckY = POOL.deck * S;             // the file is sunk so that its deck top is at ground level
  new GLTFLoader().load(POOL.file, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    gltf.scene.scale.setScalar(S); gltf.scene.position.y = -deckY;
    holder.add(gltf.scene);
  }, undefined, e => console.warn('hotel: could not load ' + POOL.file, e));

  // two ladders on the +z wall (the wall nearest the hotel), hanging 1.48 m below the edge, steps towards the water
  new GLTFLoader().load(PROPS_DIR + LADDER_FILE, gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, metalness: 0.35, roughness: 0.3 }); o.castShadow = false; o.receiveShadow = true;
    });
    LADDERS.forEach(lx => {
      const l = gltf.scene.clone(true), pivot = new THREE.Group();
      l.scale.setScalar(LADDER_SCALE); pivot.add(l);
      pivot.rotation.y = Math.PI;                          // in the file the steps face +z: turn them to face the water (-z)
      pivot.position.set(lx * S, -1.48, POOL.openZ * S - 0.21);     // the arch ends rest on the edge of the pool; the top of the arch is 0.42 m above the deck
      holder.add(pivot);
    });
  }, undefined, e => console.warn('hotel: could not load ' + PROPS_DIR + LADDER_FILE, e));

  // the water: the 41 x 41 grid with the 26 wave pictures of water_animation_optimised.glb, stretched to fit the pool and played in a loop
  new GLTFLoader().load(PROPS_DIR + WATER_FILE, gltf => {
    const w = gltf.scene, W = 2 * POOL.openX * S - 0.12, L = 2 * POOL.openZ * S - 0.12;
    w.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false;
      o.material = new THREE.MeshStandardMaterial({ color: 0x4fcde6, transparent: true, opacity: 0.74, roughness: 0.06, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false });
    });
    w.scale.set(W / 100, 0.03, L / 100);                   // the file's water is 100 x 100 units wide; its waves are about 1 unit high (3 cm here)
    w.position.y = -WATER_DROP;
    holder.add(w);
    if (gltf.animations.length) {
      const mixer = new THREE.AnimationMixer(w); mixer.clipAction(gltf.animations[0]).play();
      const clock = new THREE.Clock(); animators.push(() => mixer.update(Math.min(clock.getDelta(), 0.1)));
    }
  }, undefined, e => console.warn('hotel: could not load ' + PROPS_DIR + WATER_FILE + ' (the pool stays empty)', e));
}

export function buildHotel() {
  const group = new THREE.Group(), animators = [];
  buildPool(group, animators);
  PARTS.forEach(p => {
    const holder = new THREE.Group();                      // turned to face the right way, standing at its place (relative to HOTEL_ORIGIN)
    holder.position.set(p.x - HOTEL_ORIGIN.x, 0, p.z - HOTEL_ORIGIN.z);
    holder.rotation.y = THREE.MathUtils.degToRad(p.rotY);
    group.add(holder);
    new GLTFLoader().load(p.file, gltf => {
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      gltf.scene.scale.setScalar(p.scale);
      holder.add(gltf.scene);
      // the name on the empty board (a plain card just in front of the board: the letters only, the board shows through)
      const s = p.sign, w = s.w * p.scale, h = s.h * p.scale;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: signTexture(s.text, w / h), transparent: true, alphaTest: 0.3, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      sign.position.set(s.x * p.scale, s.y * p.scale, s.z * p.scale + 0.012);
      holder.add(sign);
    }, undefined, e => {
      console.warn('hotel: could not load ' + p.file, e);          // a plain block so the game keeps running
      const b = new THREE.Mesh(new THREE.BoxGeometry(p.half.hw * 2 * p.scale, p.half.h * p.scale, p.half.hd * 2 * p.scale), new THREE.MeshStandardMaterial({ color: 0xd8d2c4 }));
      b.position.y = p.half.h * p.scale / 2; holder.add(b);
    });
  });
  return { group, update: () => { for (const f of animators) f(); } };
}
