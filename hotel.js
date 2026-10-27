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
//   AROUND THE POOL (the pool terrace, x 240 to 252.6, z 62.5 to 84): grey hexagon paving (pool_paving.jpg), 8 lounge chairs (4 west of the pool with 2 blue umbrellas,
//   4 east of it with 2 red umbrellas), 2 patio sets (table, 4 chairs and umbrella) at the south end, and a lifeguard chair at the deep (north) end.
//   PROPS FOLDER (new): lounge_chair_optimised.glb, umbrella_blue.glb, umbrella_red.glb, patio_set_optimised.glb, lifeguard_chair_optimised.glb, pool_paving.jpg, pool_paving_n.jpg
//   KEEPING IT FAST: every kind of prop is a few InstancedMeshes (all copies of a chair share one mesh): about 9 draw calls for the whole pool area, about 45,000 triangles,
//   no shadows from any of it. The paving is 4 flat strips.
//   The pool is 11.8 m long and 5.2 m wide inside, 1.5 m deep at the shallow end (south) and 2.3 m deep at the deep end (north). Nobody can walk into it (it is a solid box),
//   the deck round it is walkable.
//
// THINGS YOU MAY WANT TO CHANGE
//   SCALE      how big each building is (Hotel 15.7 -> about 30 m wide, 20 m deep, 10.4 m high; Club House 8.3 -> about 15 m wide, 15.8 m deep, 6.9 m high)
//   x, z       where the building stands (its centre). Move it and the walls follow by themselves.
//   sign.text  the words on the name board
//   POOL       where the pool is (x, z = its middle) and how big (scale 7.4 = 11.8 m long inside); WATER_DROP = how far the water is below the edge (0.15 m)
//   TERRACE, LOUNGERS, UMBRELLAS, PATIOS, LIFEGUARD   where the things round the pool stand (world metres: x, z; turn in degrees); delete a line to remove one, SHOW_POOL_AREA = false switches the lot off
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
const POOL = { file: 'swimming_pool.glb', scale: 7.4, x: 246, z: 73, rotY: 90, deck: 0.346, openX: 0.80, openZ: 0.35, hw: 0.954, hd: 0.508 };   // rotY 90: the deep end (+x of the file) points north

// ---- the pool terrace: paving and furniture (world metres) ----
const SHOW_POOL_AREA = true;
const TERRACE = { x0: 239.9, x1: 252.6, z0: 62.5, z1: 84.0 };       // the paved area round the pool (the pool's own deck is inside it)
const PAVING_M = 2.0;                                                // one picture of paving = 2 m
// [x, z, turn in degrees]. A lounger's head end is its +x side in the file: turn 90 puts the head to the north.
const LOUNGERS = [[241.3, 67.5, 90], [241.3, 70.5, 90], [241.3, 73.5, 90], [241.3, 76.5, 90],        // west of the pool
                  [251.9, 68.0, 90], [251.9, 71.0, 90], [251.9, 74.0, 90], [251.9, 77.0, 90]];       // east of the pool
const UMBRELLAS_BLUE = [[240.5, 69.0, 0], [240.5, 75.0, 0]];         // between the west loungers
const UMBRELLAS_RED = [[250.9, 69.5, 0], [250.9, 75.5, 0]];          // between the east loungers
const PATIOS = [[244.2, 82.2, 0], [248.0, 82.2, 0]];                 // table + 4 chairs + umbrella, south end of the pool
const LIFEGUARD = [[246.0, 64.3, 0]];                                // at the deep end, facing the pool (south)
const PROP_FILES = { lounger: 'lounge_chair_optimised.glb', umbrellaBlue: 'umbrella_blue.glb', umbrellaRed: 'umbrella_red.glb', patio: 'patio_set_optimised.glb', lifeguard: 'lifeguard_chair_optimised.glb' };
const PAVING_FILE = 'pool_paving.jpg', PAVING_NORMAL = 'pool_paving_n.jpg';
const solid = (x, z, hw, hd = hw) => [x - hw - HOTEL_ORIGIN.x, x + hw - HOTEL_ORIGIN.x, z - hd - HOTEL_ORIGIN.z, z + hd - HOTEL_ORIGIN.z];
const FURNITURE_BOXES = !SHOW_POOL_AREA ? [] : [
  ...LOUNGERS.map(([x, z]) => solid(x, z, 0.3, 0.95)),
  ...UMBRELLAS_BLUE.concat(UMBRELLAS_RED).map(([x, z]) => solid(x, z, 0.12)),
  ...PATIOS.map(([x, z]) => solid(x, z, 0.95)),
  ...LIFEGUARD.map(([x, z]) => solid(x, z, 0.5, 0.6))
];
const WATER_DROP = 0.15;                                   // the water is this far below the edge of the pool
const LADDER_FILE = 'pool_ladder.glb', LADDER_SCALE = 0.01, LADDERS = [-0.45, 0.50];    // along the pool wall, in file units (x of the pool file); the wall is the pool's +z side (east)
const WATER_FILE = 'water_animation_optimised.glb';
const poolTurned = (Math.round(POOL.rotY / 90) % 2) !== 0;
const POOL_HX = (poolTurned ? POOL.openZ : POOL.openX) * POOL.scale, POOL_HZ = (poolTurned ? POOL.openX : POOL.openZ) * POOL.scale;   // half size of the opening, in world metres
const HOLE_PAD = 0.4;                                      // the ground hole is a little bigger than the opening (it hides under the deck)
const DECK_HX = (Math.round(POOL.rotY / 90) % 2 !== 0 ? POOL.hd : POOL.hw) * POOL.scale, DECK_HZ = (Math.round(POOL.rotY / 90) % 2 !== 0 ? POOL.hw : POOL.hd) * POOL.scale;   // half size of the whole pool slab, in world metres
export const POOL_HOLE = { x0: POOL.x - POOL_HX - HOLE_PAD, x1: POOL.x + POOL_HX + HOLE_PAD, z0: POOL.z - POOL_HZ - HOLE_PAD, z1: POOL.z + POOL_HZ + HOLE_PAD };
const POOL_BOX = [POOL.x - POOL_HX + 0.1 - HOTEL_ORIGIN.x, POOL.x + POOL_HX - 0.1 - HOTEL_ORIGIN.x, POOL.z - POOL_HZ + 0.1 - HOTEL_ORIGIN.z, POOL.z + POOL_HZ - 0.1 - HOTEL_ORIGIN.z];

// ---- solid parts: the walls of each building, [minX, maxX, minZ, maxZ] relative to HOTEL_ORIGIN (the game does not turn them: rotY is 0) ----
const STEP = 0.5;                                          // the strip in front of each door that stays walkable
export const HOTEL_BOXES = [POOL_BOX, ...FURNITURE_BOXES, ...PARTS.map(p => {
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

// ---------- the pool area: paving + furniture (every kind is a few InstancedMeshes, all copies share the same meshes) ----------
function buildPoolArea(group) {
  // paving: 4 flat strips round the pool slab (so nothing covers the pool opening)
  const dx0 = POOL.x - DECK_HX, dx1 = POOL.x + DECK_HX, dz0 = POOL.z - DECK_HZ, dz1 = POOL.z + DECK_HZ, T = TERRACE;
  const strips = [[T.x0, T.x1, T.z0, dz0], [T.x0, T.x1, dz1, T.z1], [T.x0, dx0, dz0, dz1], [dx1, T.x1, dz0, dz1]];     // north, south, west, east
  const tl = new THREE.TextureLoader();
  const map = tl.load(PROPS_DIR + PAVING_FILE), nmap = tl.load(PROPS_DIR + PAVING_NORMAL);
  map.colorSpace = THREE.SRGBColorSpace;
  [map, nmap].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; });
  const mat = new THREE.MeshStandardMaterial({ map, normalMap: nmap, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  strips.forEach(([x0, x1, z0, z1]) => {
    const w = x1 - x0, d = z1 - z0; if (w < 0.05 || d < 0.05) return;
    const g = new THREE.PlaneGeometry(w, d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / PAVING_M, -(z1 - uv.getY(i) * d) / PAVING_M);     // paving lines up across the strips
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2 - HOTEL_ORIGIN.x, 0.005, (z0 + z1) / 2 - HOTEL_ORIGIN.z); m.receiveShadow = false; group.add(m);
  });

  // furniture: spots = [x, z, turn in degrees]
  const place = (file, spots) => {
    if (!spots.length) return;
    new GLTFLoader().load(PROPS_DIR + file, gltf => {
      gltf.scene.updateMatrixWorld(true);
      const o = new THREE.Object3D(), m4 = new THREE.Matrix4();
      gltf.scene.traverse(part => {
        if (!part.isMesh) return;
        const im = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
        spots.forEach(([x, z, turn], i) => {
          o.position.set(x - HOTEL_ORIGIN.x, 0, z - HOTEL_ORIGIN.z); o.rotation.set(0, THREE.MathUtils.degToRad(turn), 0); o.scale.set(1, 1, 1); o.updateMatrix();
          m4.multiplyMatrices(o.matrix, part.matrixWorld); im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; group.add(im);
      });
    }, undefined, e => console.warn('hotel: could not load ' + PROPS_DIR + file, e));
  };
  place(PROP_FILES.lounger, LOUNGERS); place(PROP_FILES.umbrellaBlue, UMBRELLAS_BLUE); place(PROP_FILES.umbrellaRed, UMBRELLAS_RED);
  place(PROP_FILES.patio, PATIOS); place(PROP_FILES.lifeguard, LIFEGUARD);
}

export function buildHotel() {
  const group = new THREE.Group(), animators = [];
  buildPool(group, animators);
  if (SHOW_POOL_AREA) buildPoolArea(group);
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
