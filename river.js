// river.js  (the river along the north edge of the Rural District, for fishing)
//
// Exports:  buildRiver(world) -> { group, update }     RIVER_BOXES -> the invisible wall where the river ends for the players
//           cutRiverHole(shader)                        makes the river-shaped hole in the ground (game.js calls it for the ground and the far plane)
//           riverDip(x, z)  how far a character sinks (negative metres)      riverSpeed(x, z)  walking speed factor (1 on land, slower in deep water)
//
// WHAT YOU SEE (world metres, north is the top of the map = smaller z; the world ends at z = 0):
//
//     z = -110  +------------------------------------------+   far shore (the river is a big, wide lake that fades into the fog)
//               |   the river keeps widening to the north   |
//     z = 0     +---- world edge --------------------------+   (nobody can go past this line)
//     z = 2.3   |  <== the players can wade this far ==>    |   end of the rural plot: an invisible wall
//               |   deeper . . . . . . . . . . . . . . .   |
//     z = 6.7   +~~~~~~~~~ shore (wavy) ~~~~~~~~~~~~~~~~~~~+   the farm's river gap: the water starts here, shallow
//               |           the farm (rural_farm.js)        |
//
//   * the ground has a river-shaped HOLE (cutRiverHole). In the hole there is a sloping river BED (sand at the shore, mud and then dark in the deep),
//     and over it the WATER: a grid that moves with the waves of your water_animation_optimised.glb, with a depth colour
//     (clear and see-through at the shore, dark blue and deep to the north) and your river_water picture drifting slowly on it.
//   * players walk down the bed, so they sink the deeper they go (about chest deep at the wall), walk slower, and make ripples.
//   * the fish swim under the water, in the deeper part, and swim away when a player comes close.
//
// FILES (all in your props folder): water_animation_optimised.glb, tuna_fish_optimised.glb, bluefin_tuna_optimised.glb, koi_fish_optimised.glb,
//                                   school_of_fish_optimised.glb, fish_3d.glb, animated_low_poly_fish.glb
//
// THINGS YOU MAY WANT TO CHANGE
//   FISH        one line per kind of fish: file, how many (n), length in metres (len), the deepest water it needs (minDepth), its speed
//   WIDEN       how fast the river gets wider to the north (0.6 = 0.6 m wider on each side for every metre north)
//   profile()   how steep the bed is (the numbers 0.25 and 0.024); the depth at the wall is about 1.56 m
//   Z_WALK_END  where the invisible wall is (2.3 = the north edge of the rural plot)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PROPS_DIR } from './props_library.js';
import { plotAt } from './city.js';

const PLOT = plotAt('rural');                         // x 275, z 13, 74 m wide, 22 m deep (from city.js)
const CX = PLOT.x, HW0 = PLOT.w / 2;                  // the river is as wide as the plot
const Z_SHORE = PLOT.z - PLOT.d / 2 + 4.7;            // 6.7: where the water starts (the farm's river gap ends at 7.0)
const Z_HOLE = Z_SHORE + 0.5;                         // the hole in the ground starts here
const Z_WALK_END = PLOT.z - PLOT.d / 2 + 0.3;         // 2.3: the players can wade as far as the end of the rural plot
const Z_FAR = -110;                                   // the far shore of the big river (hidden in the fog)
const WIDEN = 0.6;                                    // metres wider on each side for every metre north of the world edge
const WATER_Y = -0.12, BED_EDGE_Y = -0.03;            // water level, and the bed where it meets the ground (the ground is at -0.04)

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const halfW = z => HW0 + WIDEN * Math.max(0, -z);
const wob = x => 0.22 * Math.sin(x * 0.31 + 0.7) + 0.14 * Math.sin(x * 0.77 + 2.1) + 0.08 * Math.sin(x * 1.9);   // the shore is not a straight line

// depth of the bed below the ground, t = metres north of the shore
const WALL_T = 4.4, WALL_D = 0.25 * WALL_T + 0.024 * WALL_T * WALL_T;     // 1.56 m deep at the wall
function profile(t) {
  if (t <= 0) return 0;
  if (t <= WALL_T) return 0.25 * t + 0.024 * t * t;                      // the part players can walk in: gentle, then a bit steeper
  return Math.min(5.2, WALL_D + 0.9 * (t - WALL_T));                     // north of the wall: down to 5 m (nobody goes there)
}
export function depthAt(x, z) {
  if (z > Z_HOLE || z < Z_FAR) return 0;
  const hw = halfW(z), side = hw - Math.abs(x - CX);
  if (side <= 0) return 0;
  const d = profile(Z_SHORE + wob(x) - z);
  return d * smooth(0, 2.6, side) * smooth(0, 14, z - Z_FAR);           // the banks rise at the sides and at the far shore
}
export const riverDip = (x, z) => { const d = depthAt(x, z); return d > 0.06 ? -d : 0; };
export const riverSpeed = (x, z) => 1 - 0.5 * Math.min(1, depthAt(x, z) / 1.3);

// the end of the river for the players: an invisible wall along the north edge of the plot
export const RIVER_BOXES = [{ x0: CX - HW0 - 1.5, x1: CX + HW0 + 1.5, z0: -4, z1: Z_WALK_END }];

// ---------- the hole in the ground (and in the far ground beyond the world edge) ----------
export function cutRiverHole(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRiverW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRiverW;')
    .replace('void main() {', `void main() {
  { float rz = vRiverW.z, hw = ${HW0.toFixed(2)} + ${WIDEN.toFixed(3)} * max(0.0, -rz);
    if (rz < ${Z_HOLE.toFixed(2)} && rz > ${Z_FAR.toFixed(2)} && abs(vRiverW.x - ${CX.toFixed(2)}) < hw) discard; }`);
}

// ---------- the fish ----------
// a = the way the fish faces in its file (degrees from +Z towards +X), L = its length along that way in the file, c = the middle of the file's fish.
// minDepth = the shallowest water it will swim in.
const FISH = [
  { file: 'tuna_fish_optimised.glb',     n: 1, len: 1.25, minDepth: 1.0, speed: [0.55, 0.85], a: 16.8,  L: 4.732, c: [0.108, -0.031, 0.134] },
  { file: 'bluefin_tuna_optimised.glb',  n: 2, len: 0.90, minDepth: 0.8, speed: [0.60, 0.95], a: -2.9,  L: 0.565, c: [0.002, 0.155, -0.012] },
  { file: 'koi_fish_optimised.glb',      n: 4, len: 0.60, minDepth: 0.7, speed: [0.30, 0.55], a: -86.2, L: 6.394, c: [0.060, 0.268, 0.017] },
  { file: 'fish_3d.glb',                 n: 2, len: 0.75, minDepth: 0.8, speed: [0.35, 0.60], a: 90.0,  L: 9.343, c: [-0.916, 0.276, 0.088] },
  { file: 'animated_low_poly_fish.glb',  n: 4, len: 0.50, minDepth: 0.6, speed: [0.40, 0.70], a: -51.6, L: 1.995, c: [0.283, 0.070, -0.093] },
  { file: 'school_of_fish_optimised.glb', n: 2, len: 1.80, minDepth: 1.1, speed: [0.35, 0.55], a: 53.1,  L: 7.811, c: [-0.853, 0.009, 0.000] }
];

const rand = (a, b) => a + Math.random() * (b - a);

function buildFish(world, group, mixers) {
  const fishes = [];
  const loader = new GLTFLoader();
  const pickSpot = (minDepth, near) => {                                  // somewhere in the river where the water is deep enough
    for (let k = 0; k < 40; k++) {
      const z = near ? rand(Z_WALK_END - 0.2, 5.0) : rand(Z_FAR + 20, 4.5);
      const x = CX + rand(-1, 1) * (halfW(z) - 4);
      if (depthAt(x, z) >= minDepth) return { x, z };
    }
    return { x: CX, z: 3.2 };
  };
  FISH.forEach(spec => loader.load(PROPS_DIR + spec.file, gltf => {
    const clip = gltf.animations && gltf.animations[0];
    const theta = -spec.a * Math.PI / 180, s = spec.len / spec.L;          // turn the file's fish so it faces +Z, and size it
    const centre = new THREE.Vector3(...spec.c).multiplyScalar(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), theta);
    for (let i = 0; i < spec.n; i++) {
      const obj = cloneSkinned(gltf.scene);
      obj.scale.setScalar(s); obj.rotation.y = theta; obj.position.set(-centre.x, -centre.y, -centre.z);
      obj.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
      const holder = new THREE.Group(); holder.add(obj); group.add(holder);
      const near = i % 2 === 0;                                           // half of each kind near the wading area, half further out
      const p = pickSpot(spec.minDepth, near);
      const f = { holder, x: p.x, z: p.z, y: -0.9, heading: rand(0, 6.28), speed: rand(...spec.speed), spec, near, target: pickSpot(spec.minDepth, near), flee: 0, mixer: null, action: null, wander: rand(0, 10) };
      holder.position.set(f.x, f.y, f.z);
      if (clip) {
        f.mixer = new THREE.AnimationMixer(obj); f.action = f.mixer.clipAction(clip);
        f.action.time = Math.random() * clip.duration; f.action.timeScale = 0.8 + f.speed; f.action.play();
      }
      fishes.push(f);
    }
  }, undefined, e => console.warn('river: could not load ' + spec.file, e)));

  const away = new THREE.Vector2();
  const update = (dt, px, pz, playerNear) => {
    for (const f of fishes) {
      const { spec } = f;
      // choose a new place to swim to when this one is reached
      let dx = f.target.x - f.x, dz = f.target.z - f.z, dist = Math.hypot(dx, dz);
      if (dist < 0.8) { f.target = pickSpot(spec.minDepth, f.near); dx = f.target.x - f.x; dz = f.target.z - f.z; dist = Math.hypot(dx, dz); }
      let want = Math.atan2(dx, dz), v = f.speed;
      // a player close by: swim away from them for a moment
      if (playerNear) {
        const ex = f.x - px, ez = f.z - pz, d = Math.hypot(ex, ez);
        if (d < 2.6) { f.flee = 1.4; }
        if (f.flee > 0) { away.set(ex, ez); if (d < 6) { want = Math.atan2(ex, ez); } }
      }
      if (f.flee > 0) { f.flee -= dt; v *= 2.0; }
      // turn smoothly (at most 1.6 rad per second) and swim
      let da = want - f.heading; da = Math.atan2(Math.sin(da), Math.cos(da));
      f.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
      f.x += Math.sin(f.heading) * v * dt; f.z += Math.cos(f.heading) * v * dt;
      // stay inside the water: if the bed is too shallow here, turn back to the target and do not move on
      if (depthAt(f.x, f.z) < spec.minDepth * 0.8) { f.x -= Math.sin(f.heading) * v * dt; f.z -= Math.cos(f.heading) * v * dt; f.heading += 1.5 * dt; }
      // depth: below the surface, above the bed, with a slow up-and-down drift
      f.wander += dt;
      const bed = BED_EDGE_Y - depthAt(f.x, f.z);
      const wantY = Math.min(WATER_Y - 0.35, Math.max(bed + 0.4, WATER_Y - 0.7 - 0.35 * Math.sin(f.wander * 0.4 + f.speed * 7)));
      f.y += (wantY - f.y) * Math.min(1, dt * 1.5);
      f.holder.position.set(f.x, f.y, f.z); f.holder.rotation.y = f.heading;
      if (f.mixer) { f.action.timeScale = 0.7 + v * (f.flee > 0 ? 1.4 : 1.1); f.mixer.update(dt); }
    }
  };
  return { update, count: () => fishes.length };
}

// ---------- the water: a grid that follows the waves of water_animation_optimised.glb ----------
const NX = 77;
function makeRows() {
  const rows = [Z_HOLE]; let z = Z_HOLE, step = 0.3;
  while (z > Z_FAR) { z -= step; step *= 1.07; rows.push(Math.max(z, Z_FAR)); }
  return rows;
}

export function buildRiver(world) {
  const group = new THREE.Group();
  const rows = makeRows(), NZ = rows.length, N = NX * NZ;
  const idx = (i, j) => j * NX + i;

  // grid positions + bed depth at each vertex
  const X = new Float32Array(N), Z = new Float32Array(N), D = new Float32Array(N);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const z = rows[j], x = CX + ((i / (NX - 1)) * 2 - 1) * halfW(z), k = idx(i, j);
    X[k] = x; Z[k] = z; D[k] = depthAt(x, z);
  }
  const indices = [];
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
    indices.push(a, b, d, a, d, c);
  }

  // ----- the river bed: sand at the shore, mud, then dark where it is deep -----
  const bedPos = new Float32Array(N * 3), bedCol = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    bedPos[k * 3] = X[k]; bedPos[k * 3 + 1] = BED_EDGE_Y - D[k]; bedPos[k * 3 + 2] = Z[k];
    const m = smooth(0.0, 0.7, D[k]), dp = smooth(0.7, 3.2, D[k]), n = 0.92 + 0.08 * Math.sin(X[k] * 1.7) * Math.cos(Z[k] * 2.3);
    bedCol[k * 3] = (0.74 * (1 - m) + 0.50 * m * (1 - dp) + 0.20 * dp) * n;
    bedCol[k * 3 + 1] = (0.57 * (1 - m) + 0.42 * m * (1 - dp) + 0.19 * dp) * n;
    bedCol[k * 3 + 2] = (0.40 * (1 - m) + 0.30 * m * (1 - dp) + 0.17 * dp) * n;
  }
  const bedGeo = new THREE.BufferGeometry();
  bedGeo.setAttribute('position', new THREE.BufferAttribute(bedPos, 3)); bedGeo.setAttribute('color', new THREE.BufferAttribute(bedCol, 3));
  bedGeo.setIndex(indices); bedGeo.computeVertexNormals(); bedGeo.computeBoundingSphere();
  const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  bed.receiveShadow = false; bed.frustumCulled = false; group.add(bed);

  // ----- the water surface -----
  const wPos = new Float32Array(N * 3), wNor = new Float32Array(N * 3), wUv = new Float32Array(N * 2), wCol = new Float32Array(N * 4);
  const TILE = 7;                                                           // metres per picture
  for (let k = 0; k < N; k++) {
    wPos[k * 3] = X[k]; wPos[k * 3 + 1] = WATER_Y; wPos[k * 3 + 2] = Z[k];
    wNor[k * 3 + 1] = 1; wUv[k * 2] = X[k] / TILE; wUv[k * 2 + 1] = Z[k] / TILE;
    // depth colour: clear and light at the shore, then blue, then dark and deep. Alpha: see-through in the shallows.
    const d = D[k], deep = smooth(0.15, 3.2, d), alpha = smooth(0.04, 0.5, d) * (0.5 + 0.47 * smooth(0.4, 2.6, d));
    wCol[k * 4] = 0.88 * (1 - deep) + 0.22 * deep; wCol[k * 4 + 1] = 1.0 * (1 - deep) + 0.46 * deep; wCol[k * 4 + 2] = 0.95 * (1 - deep) + 0.66 * deep; wCol[k * 4 + 3] = alpha;
  }
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute('normal', new THREE.BufferAttribute(wNor, 3));
  wGeo.setAttribute('uv', new THREE.BufferAttribute(wUv, 2)); wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 4));
  wGeo.setIndex(indices); wGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(CX, 0, (Z_HOLE + Z_FAR) / 2), 200);
  const wMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, roughness: 0.18, metalness: 0.0, depthWrite: false });
  const water = new THREE.Mesh(wGeo, wMat); water.renderOrder = 5; water.frustumCulled = false; group.add(water);

  // ----- the waves: 26 pictures of the water, played in a loop (from water_animation_optimised.glb; if the file is missing, simple waves are made) -----
  const FRAMES = 26, PERIOD = 25 * (0.1333333);
  let heights = null;                                                       // heights[k] = Float32Array(N): the wave height of every vertex in picture k
  const GRID = 41, PAT = 40;                                                // the file's water is 41 x 41 points; one copy of it covers 40 m (mirrored beyond that)
  const mirror = s => { const m = ((s % 2) + 2) % 2; return m <= 1 ? m : 2 - m; };
  const buildHeights = pat => {                                             // pat[k][gy * 41 + gx]
    heights = [];
    const amp = new Float32Array(N), ia = new Int32Array(N * 4), wa = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) {
      amp[k] = (0.022 + 0.10 * smooth(0, 60, Z_SHORE - Z[k])) * smooth(0.0, 0.7, D[k]);        // gentle at the shore, bigger far out, none where the water is too shallow
      const gx = mirror(X[k] / PAT) * PAT, gz = mirror(Z[k] / PAT) * PAT;
      const x0 = Math.min(PAT - 1, Math.floor(gx)), z0 = Math.min(PAT - 1, Math.floor(gz)), fx = gx - x0, fz = gz - z0;
      ia[k * 4] = z0 * GRID + x0; ia[k * 4 + 1] = z0 * GRID + x0 + 1; ia[k * 4 + 2] = (z0 + 1) * GRID + x0; ia[k * 4 + 3] = (z0 + 1) * GRID + x0 + 1;
      wa[k * 4] = (1 - fx) * (1 - fz); wa[k * 4 + 1] = fx * (1 - fz); wa[k * 4 + 2] = (1 - fx) * fz; wa[k * 4 + 3] = fx * fz;
    }
    for (let f = 0; f < FRAMES; f++) {
      const H = new Float32Array(N), P = pat[f];
      for (let k = 0; k < N; k++) H[k] = amp[k] * (P[ia[k * 4]] * wa[k * 4] + P[ia[k * 4 + 1]] * wa[k * 4 + 1] + P[ia[k * 4 + 2]] * wa[k * 4 + 2] + P[ia[k * 4 + 3]] * wa[k * 4 + 3]);
      heights.push(H);
    }
  };
  const fallbackPattern = () => Array.from({ length: FRAMES }, (_, f) => {   // used only if the file is missing
    const P = new Float32Array(GRID * GRID);
    for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) P[gy * GRID + gx] = 1.6 * Math.sin(gx * 0.55 + f * 0.25 * Math.PI * 2 / 25 * 4) * Math.cos(gy * 0.45 + f * 0.25) + 0.8 * Math.sin((gx + gy) * 0.3 - f * 0.5);
    return P;
  });
  buildHeights(fallbackPattern());                                           // start with simple waves, replaced when the file has loaded
  new GLTFLoader().load(PROPS_DIR + 'water_animation_optimised.glb', gltf => {
    let mesh = null; gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return;
    const geo = mesh.geometry, base = geo.attributes.position, morphs = geo.morphAttributes.position;
    if (morphs && morphs.length >= FRAMES) {
      const pat = Array.from({ length: FRAMES }, () => new Float32Array(GRID * GRID));
      for (let v = 0; v < base.count; v++) {
        const gx = Math.round((base.getX(v) + 50) / 2.5), gy = Math.round((base.getY(v) + 50) / 2.5);
        if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) continue;
        for (let f = 0; f < FRAMES; f++) pat[f][gy * GRID + gx] = geo.morphTargetsRelative ? morphs[f].getZ(v) : morphs[f].getZ(v) - base.getZ(v);
      }
      buildHeights(pat);
    }
    if (mesh.material && mesh.material.map) {                                 // the river_water picture, repeating and drifting
      const t = mesh.material.map; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
      wMat.map = t; wMat.needsUpdate = true;
    }
  }, undefined, e => console.warn('river: could not load water_animation_optimised.glb (simple waves are used)', e));

  // ----- reeds and rocks along the banks -----
  const reedGeo = new THREE.ConeGeometry(0.035, 1.5, 4, 1).translate(0, 0.75, 0);
  const reeds = new THREE.InstancedMesh(reedGeo, new THREE.MeshStandardMaterial({ color: 0x5d7f3a, roughness: 0.9 }), 320);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1, flatShading: true }), 34);
  { const o = new THREE.Object3D(); let r = 0, q = 0;
    const put = (x, z) => {                                                 // a clump of reeds at the edge of the water
      const n = 3 + ((x * 7.3 + z * 3.1) % 3 | 0);
      for (let k = 0; k < n && r < 320; k++, r++) {
        o.position.set(x + rand(-0.35, 0.35), BED_EDGE_Y, z + rand(-0.35, 0.35)); o.rotation.set(rand(-0.18, 0.18), rand(0, 6.28), rand(-0.18, 0.18));
        o.scale.set(1, rand(0.7, 1.4), 1); o.updateMatrix(); reeds.setMatrixAt(r, o.matrix);
      }
    };
    for (let x = CX - HW0 + 1.2; x < CX + HW0 - 1; x += 2.6 + Math.random() * 1.6) if (Math.random() < 0.8) put(x, Z_SHORE + wob(x) + rand(0.1, 0.6));      // the south shore
    for (const side of [-1, 1]) for (let z = Z_SHORE - 0.5; z > -2; z -= 3.4 + Math.random() * 2) put(CX + side * (HW0 - 0.9 + rand(0, 0.5)), z);                  // the east and west banks
    reeds.count = r;
    for (let k = 0; k < 34; k++) {                                          // rocks half in the water along the shore and the banks
      const south = k < 22, x = south ? CX + rand(-HW0 + 2, HW0 - 2) : CX + (k % 2 ? 1 : -1) * (HW0 - rand(0.6, 2.2));
      const z = south ? Z_SHORE + wob(x) + rand(-0.3, 0.7) : rand(-3, Z_SHORE - 0.5), s = rand(0.25, 0.7);
      o.position.set(x, BED_EDGE_Y - depthAt(x, z) + s * 0.1, z); o.rotation.set(rand(0, 3), rand(0, 6), rand(0, 3)); o.scale.set(s * rand(0.9, 1.5), s * rand(0.5, 0.8), s * rand(0.9, 1.4));
      o.updateMatrix(); rocks.setMatrixAt(q++, o.matrix);
    }
  }
  reeds.castShadow = rocks.castShadow = false; reeds.frustumCulled = rocks.frustumCulled = false; group.add(reeds, rocks);

  // ----- ripples round a player who is wading -----
  const ringGeo = new THREE.RingGeometry(0.3, 0.38, 32).rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 7 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; m.renderOrder = 6; group.add(m); return { m, age: 99 };
  });
  let rippleAt = 0, lastRx = 1e9, lastRz = 1e9, inWater = false;

  // ----- the fish -----
  const mixers = [];
  const fish = buildFish(world, group, mixers);

  // ----- every frame -----
  const clock = new THREE.Clock(); let time = 0, normalTick = 0;
  const update = () => {
    const dt = Math.min(clock.getDelta(), 0.1); time += dt;
    const p = world.player && world.player.position; if (!p) return;
    const far = Math.hypot(p.x - CX, p.z - 10) > 170;                     // far away: nothing to animate (the fog hides the river)
    group.visible = !far; if (far) return;

    // waves
    const t = (time % PERIOD) / 0.1333333, k = Math.min(FRAMES - 2, Math.floor(t)), f = t - k, H0 = heights[k], H1 = heights[k + 1];
    for (let v = 0; v < N; v++) wPos[v * 3 + 1] = WATER_Y + H0[v] + (H1[v] - H0[v]) * f;
    wGeo.attributes.position.needsUpdate = true;
    if ((normalTick = (normalTick + 1) % 2) === 0) {                      // normals every second frame (the waves are slow)
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const l = idx(Math.max(i - 1, 0), j) * 3, r = idx(Math.min(i + 1, NX - 1), j) * 3, s = idx(i, Math.max(j - 1, 0)) * 3, n = idx(i, Math.min(j + 1, NZ - 1)) * 3;
        const ax = wPos[r] - wPos[l], ay = wPos[r + 1] - wPos[l + 1], az = wPos[r + 2] - wPos[l + 2];
        const cx = wPos[n] - wPos[s], cy = wPos[n + 1] - wPos[s + 1], cz = wPos[n + 2] - wPos[s + 2];
        let nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx; const len = Math.hypot(nx, ny, nz) || 1;
        const o = idx(i, j) * 3; wNor[o] = nx / len; wNor[o + 1] = ny / len; wNor[o + 2] = nz / len;
      }
      wGeo.attributes.normal.needsUpdate = true;
    }
    if (wMat.map) wMat.map.offset.set(time * 0.012, time * 0.006);        // the picture drifts slowly

    // the player in the water: a message, and ripples while moving
    const d = depthAt(p.x, p.z), now = d > 0.25;
    if (now !== inWater) { inWater = now; if (now) world.say3d('You are wading in the river'); else if (world.updateStatus) world.updateStatus(); }
    if (now && Math.hypot(p.x - lastRx, p.z - lastRz) > 0.45 && time - rippleAt > 0.12) {
      lastRx = p.x; lastRz = p.z; rippleAt = time;
      const r = ripples.find(q => q.age > 1.6) || ripples[0]; r.age = 0; r.m.position.set(p.x, WATER_Y + 0.02, p.z); r.m.visible = true;
    }
    for (const r of ripples) {
      if (r.age > 1.6) { r.m.visible = false; continue; }
      r.age += dt; const u = r.age / 1.6; r.m.scale.setScalar(0.5 + u * 3.2); r.m.material.opacity = 0.55 * (1 - u) * (1 - u);
    }

    // the fish
    fish.update(dt, p.x, p.z, Math.abs(p.z - 4) < 14 && Math.abs(p.x - CX) < HW0 + 6);
  };

  return { group, update };
}
