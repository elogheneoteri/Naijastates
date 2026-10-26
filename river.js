// river.js  (the river along the north edge of the Rural District, for fishing)
//
// Exports:  buildRiver(world) -> { group, update }     RIVER_BOXES -> the invisible wall where the river ends for the players
//           cutRiverHole(shader)                        makes the river-shaped hole in the ground (game.js calls it for the ground and the far plane)
//           riverDip(x, z)  how far a character sinks (negative metres)      riverSpeed(x, z)  walking speed factor (1 on land, slower in deep water)
//
// WHAT YOU SEE (world metres, north is the top of the map = smaller z; the world ends at z = 0):
//
//     z = -110  +  far shore (the river is a big, wide river that fades into the fog; it bends and gets wider to the north)
//               |
//     z = 0     +---- world edge --------------------------+   (nobody can go past this line)
//     z = 2.3   |  <== the players can wade this far ==>    |   end of the rural plot: an invisible wall
//               |   deeper . . . . . . . . . . . . . . .   |
//     z = 4.5-6.3  ~~~~ the shore: it goes in and out, it is NOT a straight line ~~~~
//               |           the farm (rural_farm.js)        |
//
//   * NOTHING IS A STRAIGHT LINE ANY MORE: the south shore, the east and west banks, the sandy beach round the water and the far shore all
//     wander (sums of sine waves, SHORE / BEACH / BANK_L / BANK_R / FAR_SHORE below). The river itself also bends to the north (MEANDER).
//     The same numbers are used in the game and in the ground shader, so the hole in the ground follows the water exactly.
//   * the ground has a river-shaped HOLE (cutRiverHole). In the hole there is a sloping river BED (ground-coloured sand at the edge,
//     paler sand, mud and then dark in the deep), and over it the WATER: a grid that moves with the waves of your
//     water_animation_optimised.glb, with a depth colour and your river_water picture drifting slowly on it.
//   * players walk down the bed, so they sink the deeper they go (about chest deep at the wall), walk slower, and make ripples.
//   * REAL GRASS: your single_grass.glb is planted along the shore and the banks. REAL SEAWEED: your sea_weed.glb sways under the water.
//   * LOTS OF FISH (about 55), in groups (shoals) in front of the wading area, some further north. They swim away when a player comes close.
//
// FILES (all in your props folder): water_animation_optimised.glb, single_grass.glb, sea_weed.glb, and the fish:
//                                   tuna_fish_optimised.glb, bluefin_tuna_optimised.glb, koi_fish_optimised.glb,
//                                   school_of_fish_optimised.glb, fish_3d.glb, animated_low_poly_fish.glb
//
// THINGS YOU MAY WANT TO CHANGE
//   FISH            one line per kind of fish: file, how many (n), length in metres (len), the deepest water it needs (minDepth), its speed
//   SHORE, BEACH, BANK_L, BANK_R, MEANDER   the wavy lines: each row is [how big in metres, how fast it wiggles, where it starts]. Make the first number bigger = rougher
//   WIDEN           how fast the river gets wider to the north (0.6 = 0.6 m wider on each side for every metre north)
//   D_WALL          how deep the water is where the players must stop (1.4 m)
//   GRASS_SHORE / GRASS_BANK / WEED_COUNT   how many grass tufts and seaweed plants
//   Z_WALK_END      where the invisible wall is (2.3 = the north edge of the rural plot)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROPS_DIR } from './props_library.js';
import { plotAt } from './city.js';

// ===== MATH START (the shape of the river: the same formulas are written again in GLSL for the ground shader) =====
const PLOT = plotAt('rural');                         // x 275, z 13, 74 m wide, 22 m deep (from city.js)
const CX = PLOT.x, HW0 = PLOT.w / 2;                  // the river is as wide as the plot where it starts
const Z_WALK_END = PLOT.z - PLOT.d / 2 + 0.3;         // 2.3: the players can wade as far as the end of the rural plot
const Z_S0 = 4.9;                                     // the middle of the south shore (the farm's river gap ends at 7.0)
const Z_TOP = 7.6;                                    // the water mesh starts here (under the ground, so it never shows)
const Z_FAR = -110;                                   // the far shore of the big river (hidden in the fog)
const WIDEN = 0.6;                                    // metres wider on each side for every metre north of the world edge
const D_WALL = 1.4;                                   // depth of the water at the wall
const WATER_Y = -0.12, BED_EDGE_Y = -0.06;            // water level; the bed where it meets the ground (the ground is at -0.04, so the bed hides under it)

// each row: [size in metres, speed, start]
const SHORE = [[0.60, 0.13, 0.7], [0.40, 0.31, 2.1], [0.20, 0.71, 4.0], [0.10, 1.30, 1.2]];             // the south shore goes in and out (+-1.3 m)
const BEACH = [[0.25, 0.37, 1.0], [0.12, 0.90, 0.0]];                                                    // the sandy strip between the water and the ground (0.13 to 0.87 m)
const BANK_L = [[0.55, 0.21, 1.0], [0.38, 0.47, 2.2], [0.20, 0.95, 0.3]];                                 // the west bank
const BANK_R = [[0.55, 0.19, 4.1], [0.38, 0.43, 0.6], [0.20, 1.05, 2.7]];                                 // the east bank
const BEACH_SIDE = [[0.25, 0.60, 0.5]];                                                                   // the beach along the banks (0.35 to 0.85 m)
const MEANDER = [[11, 0.045, 1.3], [5, 0.113, 0.4]];                                                      // the river bends to the north (only north of the world edge)
const FAR_SHORE = [[4, 0.05, 1.0], [2.5, 0.13, 2.0]];                                                     // the far shore is not straight either

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sum = (T, v) => T.reduce((s, [a, f, p]) => s + a * Math.sin(f * v + p), 0);
const zShore = x => Z_S0 + sum(SHORE, x);                                    // z of the water's edge at x
const beachS = x => 0.5 + sum(BEACH, x);
const halfW = z => HW0 + WIDEN * Math.max(0, -z);
const meander = z => smooth(0, 45, -z) * sum(MEANDER, z);
const kRough = z => 1 + 1.5 * smooth(0, 60, -z);                             // the banks get rougher far to the north
const bankL = z => CX + meander(z) - halfW(z) - kRough(z) * sum(BANK_L, z);   // x of the west water's edge at z
const bankR = z => CX + meander(z) + halfW(z) + kRough(z) * sum(BANK_R, z);
const beachSide = z => 0.6 + sum(BEACH_SIDE, z);
const zFar = x => Z_FAR + sum(FAR_SHORE, x);
// the hole in the ground = water + beach
const inHole = (x, z) => z < zShore(x) + beachS(x) && z > zFar(x) && x > bankL(z) - beachSide(z) && x < bankR(z) + beachSide(z);

// depth of the bed below the ground
function depthAt(x, z) {
  if (z > Z_TOP || z < Z_FAR - 12) return 0;
  const zs = zShore(x);
  if (z >= zs) return 0;
  const side = Math.min(x - bankL(z), bankR(z) - x);
  if (side <= 0) return 0;
  let d;
  const u = (zs - z) / Math.max(zs - Z_WALK_END, 2.4);                       // 0 at the shore, 1 at the wall (where the shore is close to the wall the slope is eased)
  d = Math.min(5.2, D_WALL * (0.5 * u + 0.5 * u * u));                       // gentle at first, then steeper, and deep (5 m) just north of the wall
  return d * smooth(0, 2.6, side) * smooth(0, 14, z - zFar(x));              // the banks rise at the sides and at the far shore
}
// ===== MATH END =====

export { depthAt };
export const riverDip = (x, z) => { const d = depthAt(x, z); return d > 0.06 ? -d : 0; };
export const riverSpeed = (x, z) => 1 - 0.5 * Math.min(1, depthAt(x, z) / 1.3);

// the end of the river for the players: an invisible wall along the north edge of the plot
export const RIVER_BOXES = [{ x0: CX - HW0 - 3, x1: CX + HW0 + 3, z0: -4, z1: Z_WALK_END }];

// ---------- the hole in the ground (and in the far ground beyond the world edge): the same formulas, written in GLSL ----------
const f5 = n => n.toFixed(5);
const gl = (T, v) => T.map(([a, f, p]) => `${f5(a)}*sin(${f5(f)}*${v}+${f5(p)})`).join('+');
const GLSL_FUNCS = `
float rvSm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float rvZShore(float x) { return ${f5(Z_S0)} + ${gl(SHORE, 'x')}; }
float rvBeachS(float x) { return 0.5 + ${gl(BEACH, 'x')}; }
float rvHalfW(float z) { return ${f5(HW0)} + ${f5(WIDEN)} * max(0.0, -z); }
float rvMeander(float z) { return rvSm(0.0, 45.0, -z) * (${gl(MEANDER, 'z')}); }
float rvK(float z) { return 1.0 + 1.5 * rvSm(0.0, 60.0, -z); }
float rvBankL(float z) { return ${f5(CX)} + rvMeander(z) - rvHalfW(z) - rvK(z) * (${gl(BANK_L, 'z')}); }
float rvBankR(float z) { return ${f5(CX)} + rvMeander(z) + rvHalfW(z) + rvK(z) * (${gl(BANK_R, 'z')}); }
float rvBeachSide(float z) { return 0.6 + ${gl(BEACH_SIDE, 'z')}; }
float rvZFar(float x) { return ${f5(Z_FAR)} + ${gl(FAR_SHORE, 'x')}; }
`;
export function cutRiverHole(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRiverW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRiverW;\n' + GLSL_FUNCS)
    .replace('void main() {', `void main() {
  { float rx = vRiverW.x, rz = vRiverW.z;
    if (rz < ${f5(Z_TOP)} && rz > ${f5(Z_FAR - 12)}) {
      if (rz < rvZShore(rx) + rvBeachS(rx) && rz > rvZFar(rx) && rx > rvBankL(rz) - rvBeachSide(rz) && rx < rvBankR(rz) + rvBeachSide(rz)) discard;
    } }`);
}

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- the fish ----------
// a = the way the fish faces in its file (degrees from +Z towards +X), L = its length along that way in the file, c = the middle of the file's fish.
// minDepth = the shallowest water it will swim in.
const FISH = [
  { file: 'tuna_fish_optimised.glb',      n: 3,  len: 1.25, minDepth: 1.0, speed: [0.55, 0.85], a: 16.8,  L: 4.732, c: [0.108, -0.031, 0.134] },
  { file: 'bluefin_tuna_optimised.glb',   n: 8,  len: 0.90, minDepth: 0.8, speed: [0.60, 0.95], a: -2.9,  L: 0.565, c: [0.002, 0.155, -0.012] },
  { file: 'koi_fish_optimised.glb',       n: 14, len: 0.60, minDepth: 0.7, speed: [0.30, 0.55], a: -86.2, L: 6.394, c: [0.060, 0.268, 0.017] },
  { file: 'fish_3d.glb',                  n: 8,  len: 0.75, minDepth: 0.8, speed: [0.35, 0.60], a: 90.0,  L: 9.343, c: [-0.916, 0.276, 0.088] },
  { file: 'animated_low_poly_fish.glb',   n: 16, len: 0.50, minDepth: 0.6, speed: [0.40, 0.70], a: -51.6, L: 1.995, c: [0.283, 0.070, -0.093] },
  { file: 'school_of_fish_optimised.glb', n: 4,  len: 1.80, minDepth: 1.1, speed: [0.35, 0.55], a: 53.1,  L: 7.811, c: [-0.853, 0.009, 0.000] }
];
// the shoals: groups of fish that stay together in front of the wading area (x from the river's middle, z), each fish swims round its shoal
const SHOALS = [[-31, -3], [-21, -7], [-11, -2], [-2, -8], [8, -3], [18, -7], [28, -2], [-26, -13], [0, -14], [24, -13]];

function buildFish(world, group) {
  const fishes = [];
  const loader = new GLTFLoader();
  const pickSpot = (f) => {                                       // somewhere the water is deep enough: round the fish's shoal, or anywhere for the far fish
    for (let k = 0; k < 40; k++) {
      let x, z;
      if (f.shoal) { x = f.shoal.x + rand(-9, 9); z = Math.min(4.2, f.shoal.z + rand(-6, 6)); }
      else { z = f.zone === 'mid' ? rand(-40, -14) : rand(-85, -40); x = (bankL(z) + bankR(z)) / 2 + rand(-1, 1) * ((bankR(z) - bankL(z)) / 2 - 6); }
      if (depthAt(x, z) >= f.spec.minDepth) return { x, z };
    }
    return f.shoal ? { x: f.shoal.x, z: f.shoal.z } : { x: CX, z: -20 };
  };
  let fishNo = 0;
  FISH.forEach(spec => loader.load(PROPS_DIR + spec.file, gltf => {
    const clip = gltf.animations && gltf.animations[0];
    const theta = -spec.a * Math.PI / 180, s = spec.len / spec.L;          // turn the file's fish so it faces +Z, and size it
    const centre = new THREE.Vector3(...spec.c).multiplyScalar(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), theta);
    for (let i = 0; i < spec.n; i++) {
      const obj = cloneSkinned(gltf.scene);
      obj.scale.setScalar(s); obj.rotation.y = theta; obj.position.set(-centre.x, -centre.y, -centre.z);
      obj.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
      const holder = new THREE.Group(); holder.add(obj); group.add(holder);
      const no = fishNo++, r = no % 10;                                    // 6 in 10 fish live in a shoal in front of the wading area, 2 in 10 further north, 2 in 10 far out
      const f = { holder, spec, speed: rand(...spec.speed), flee: 0, mixer: null, action: null, wander: rand(0, 10), vis: true, y: -0.7 };
      if (r < 6) { const sh = SHOALS[(no * 7 + (no >> 2)) % SHOALS.length]; f.shoal = { x: CX + sh[0], z: sh[1] }; } else f.zone = r < 8 ? 'mid' : 'far';
      const p = pickSpot(f); f.x = p.x; f.z = p.z; f.target = pickSpot(f); f.heading = rand(0, 6.28);
      holder.position.set(f.x, f.y, f.z);
      if (clip) {
        f.mixer = new THREE.AnimationMixer(obj); f.action = f.mixer.clipAction(clip);
        f.action.time = Math.random() * clip.duration; f.action.timeScale = 0.8 + f.speed; f.action.play();
      }
      fishes.push(f);
    }
  }, undefined, e => console.warn('river: could not load ' + spec.file, e)));

  const update = (dt, px, pz, playerNear) => {
    for (const f of fishes) {
      const { spec } = f;
      const dp = Math.hypot(f.x - px, f.z - pz);
      const show = dp < 75; if (show !== f.vis) { f.vis = show; f.holder.visible = show; }
      if (!show) continue;                                                  // far from the player: not drawn, not moved
      let dx = f.target.x - f.x, dz = f.target.z - f.z, dist = Math.hypot(dx, dz);
      if (dist < 0.8) { f.target = pickSpot(f); dx = f.target.x - f.x; dz = f.target.z - f.z; dist = Math.hypot(dx, dz); }
      let want = Math.atan2(dx, dz), v = f.speed;
      if (playerNear) {                                                     // a player close by: swim away from them for a moment
        const ex = f.x - px, ez = f.z - pz;
        if (dp < 2.4) f.flee = 1.4;
        if (f.flee > 0 && dp < 6) want = Math.atan2(ex, ez);
      }
      if (f.flee > 0) { f.flee -= dt; v *= 2.0; }
      let da = want - f.heading; da = Math.atan2(Math.sin(da), Math.cos(da));
      f.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
      f.x += Math.sin(f.heading) * v * dt; f.z += Math.cos(f.heading) * v * dt;
      if (depthAt(f.x, f.z) < spec.minDepth * 0.8) { f.x -= Math.sin(f.heading) * v * dt; f.z -= Math.cos(f.heading) * v * dt; f.heading += 1.5 * dt; }
      // depth: always in the top 0.8 m of the water, where you can see it, and above the bed
      f.wander += dt;
      const bed = BED_EDGE_Y - depthAt(f.x, f.z);
      const wantY = Math.min(WATER_Y - 0.25, Math.max(bed + 0.3, WATER_Y - 0.5 - 0.25 * Math.sin(f.wander * 0.4 + f.speed * 7)));
      f.y += (wantY - f.y) * Math.min(1, dt * 1.5);
      f.holder.position.set(f.x, f.y, f.z); f.holder.rotation.y = f.heading;
      if (f.mixer && dp < 45) { f.action.timeScale = 0.7 + v * (f.flee > 0 ? 1.4 : 1.1); f.mixer.update(dt); }
    }
  };
  return { update, count: () => fishes.length };
}

// ---------- real grass (single_grass.glb) along the shore and the banks, and real seaweed (sea_weed.glb) under the water ----------
const GRASS_SHORE = 70, GRASS_BANK = 44, GRASS_SHALLOW = 16, WEED_COUNT = 26;
function groundY(z) { return z >= 0 ? -0.04 : -0.08; }

function grassSpots() {
  const spots = [];
  const add = (x, z, y, big) => spots.push({ x, z, y, h: big ? rand(0.9, 1.4) : rand(0.55, 1.0), r: rand(0, 6.28) });
  for (let i = 0; i < GRASS_SHORE; i++) {                                          // along the south shore, on the land side of the beach
    const x = CX + rand(-HW0 - 1, HW0 + 1), z = Math.min(7.35, zShore(x) + beachS(x) + rand(-0.2, i % 3 === 0 ? 1.4 : 0.7));
    add(x, z, groundY(z), i % 7 === 0);
  }
  for (let i = 0; i < GRASS_BANK; i++) {                                           // along the east and west banks
    const z = rand(6.5, -34), left = i % 2 === 0;
    const x = left ? bankL(z) - beachSide(z) - rand(-0.1, 0.9) : bankR(z) + beachSide(z) + rand(-0.1, 0.9);
    add(x, z, groundY(z), i % 6 === 0);
  }
  for (let i = 0; i < GRASS_SHALLOW; i++) {                                        // a few tufts standing in the shallows
    for (let k = 0; k < 20; k++) {
      const x = CX + rand(-HW0 + 2, HW0 - 2), z = zShore(x) + rand(-1.0, -0.15), d = depthAt(x, z);
      if (d > 0.04 && d < 0.35) { add(x, z, BED_EDGE_Y - d, false); break; }
    }
  }
  return spots;
}

function buildGrass(group) {
  new GLTFLoader().load(PROPS_DIR + 'single_grass.glb', gltf => {
    gltf.scene.updateMatrixWorld(true);
    const geos = []; let mat = null;
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      Object.keys(g.attributes).forEach(k => { if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
      geos.push(g.index ? g.toNonIndexed() : g); mat = mat || o.material;
    });
    if (!geos.length) { console.warn('river: single_grass.glb has no mesh'); return; }
    const geo = mergeGeometries(geos, false);                                       // the 54 grass cards of the file become one mesh
    geo.computeBoundingBox(); const bb = geo.boundingBox, hgt = bb.max.y - bb.min.y;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.computeBoundingSphere();
    const m = mat.clone(); m.transparent = false; m.alphaTest = 0.4; m.depthWrite = true; m.side = THREE.DoubleSide;
    const cells = new Map(), CELL = 24;                                             // planted in squares of 24 m: only the squares near the player are drawn
    grassSpots().forEach(sp => { const key = Math.floor(sp.x / CELL) + ',' + Math.floor(sp.z / CELL); (cells.get(key) || cells.set(key, []).get(key)).push(sp); });
    const o = new THREE.Object3D(), c = new THREE.Color(), chunks = [];
    cells.forEach(list => {
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((sp, i) => {
        const k = sp.h / hgt; o.position.set(sp.x, sp.y, sp.z); o.rotation.set(0, sp.r, 0); o.scale.set(k * rand(0.9, 1.2), k, k * rand(0.9, 1.2)); o.updateMatrix();
        im.setMatrixAt(i, o.matrix); const t = 1.15 + Math.random() * 0.5; im.setColorAt(i, c.setRGB(t, t * 1.05, t * 0.9));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false;
      if (im.computeBoundingSphere) { im.computeBoundingSphere(); im.frustumCulled = true; } else im.frustumCulled = false;
      group.add(im); chunks.push({ im, x: list[0].x, z: list[0].z });
    });
    group.userData.grassChunks = chunks;
  }, undefined, e => console.warn('river: could not load single_grass.glb', e));
}

function buildWeed(group, mixers) {
  new GLTFLoader().load(PROPS_DIR + 'sea_weed.glb', gltf => {
    const clip = gltf.animations && gltf.animations[0];
    gltf.scene.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(gltf.scene), hgt = Math.max(1e-3, b0.max.y - b0.min.y);
    gltf.scene.traverse(o => {                                                      // a little lighter, so it shows through the water
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.color) m.color.multiplyScalar(2.2); m.side = THREE.DoubleSide; });
    });
    for (let i = 0; i < WEED_COUNT; i++) {
      let x = 0, z = 0, d = 0;
      for (let k = 0; k < 60; k++) {
        x = CX + rand(-HW0 + 3, HW0 - 3); z = i < WEED_COUNT * 0.7 ? rand(-9, 5) : rand(-30, -9); d = depthAt(x, z);
        if (d > 0.35 && d < 1.9) break;
      }
      const obj = cloneSkinned(gltf.scene), s = rand(0.55, 1.1) / hgt;
      obj.scale.setScalar(s); obj.position.set(x, BED_EDGE_Y - d - b0.min.y * s, z); obj.rotation.y = rand(0, 6.28);
      obj.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
      group.add(obj);
      if (clip) { const mixer = new THREE.AnimationMixer(obj), a = mixer.clipAction(clip); a.time = Math.random() * clip.duration; a.timeScale = rand(0.7, 1.2); a.play(); mixers.push({ mixer, x, z }); }
    }
  }, undefined, e => console.warn('river: could not load sea_weed.glb', e));
}

// ---------- the water: a grid that follows the waves of water_animation_optimised.glb ----------
const NX = 129;
function makeRows() {
  const rows = [Z_TOP]; let z = Z_TOP, step = 0.3;
  while (z > Z_FAR - 10) { z -= step; step *= 1.045; rows.push(z); }
  return rows;
}

export function buildRiver(world) {
  const group = new THREE.Group();
  const rows = makeRows(), NZ = rows.length, N = NX * NZ;
  const idx = (i, j) => j * NX + i;

  // grid positions + bed depth at each vertex. Each row is as wide as the river (and its beach) is anywhere in that part of the river.
  const X = new Float32Array(N), Z = new Float32Array(N), D = new Float32Array(N), E = new Float32Array(N), S = new Float32Array(N);
  for (let j = 0; j < NZ; j++) {
    const za = rows[Math.max(0, j - 1)], zb = rows[Math.min(NZ - 1, j + 1)];
    let lo = 1e9, hi = -1e9;
    for (let s = 0; s <= 6; s++) { const z = za + (zb - za) * s / 6; lo = Math.min(lo, bankL(z) - beachSide(z)); hi = Math.max(hi, bankR(z) + beachSide(z)); }
    lo -= 0.8; hi += 0.8;
    for (let i = 0; i < NX; i++) {
      const k = idx(i, j), x = lo + (hi - lo) * i / (NX - 1), z = rows[j];
      X[k] = x; Z[k] = z; D[k] = depthAt(x, z);
      S[k] = Math.min(zShore(x) + beachS(x) - z, x - (bankL(z) - beachSide(z)), (bankR(z) + beachSide(z)) - x, z - zFar(x));   // how far inside the hole this point is (negative = outside it, under the ground)
      E[k] = Math.max(0, S[k]);
    }
  }
  const indices = [];
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
    indices.push(a, b, d, a, d, c);
  }

  // ----- the river bed: ground-coloured sand at the edge, paler sand on the beach, mud, then dark where it is deep -----
  const bedPos = new Float32Array(N * 3), bedCol = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    // outside the hole the bed dives well under the ground, so it can never show through it (it used to lie only 2 cm under it and flicker through as a straight pale strip)
    const drop = S[k] < 0 ? Math.min(1.5, 0.15 - S[k] * 2.5) : 0;
    bedPos[k * 3] = X[k]; bedPos[k * 3 + 1] = BED_EDGE_Y - D[k] - drop; bedPos[k * 3 + 2] = Z[k];
    const m = smooth(0.0, 0.7, D[k]), dp = smooth(0.7, 3.2, D[k]), n = 0.92 + 0.08 * Math.sin(X[k] * 1.7) * Math.cos(Z[k] * 2.3);
    let r = 0.74 * (1 - m) + 0.50 * m * (1 - dp) + 0.20 * dp, g = 0.57 * (1 - m) + 0.42 * m * (1 - dp) + 0.19 * dp, b = 0.40 * (1 - m) + 0.30 * m * (1 - dp) + 0.17 * dp;
    const edge = smooth(0, 0.55, E[k]), wet = 0.78 + 0.22 * smooth(0, 0.35, D[k] + (E[k] > 0.25 ? 0.2 : 0));
    r = (0.72 * (1 - edge) + r * edge) * n; g = (0.42 * (1 - edge) + g * edge) * n; b = (0.25 * (1 - edge) + b * edge) * n;   // melts into the red sand of the ground at the edge
    const w = D[k] < 0.12 ? wet : 1; bedCol[k * 3] = r * w; bedCol[k * 3 + 1] = g * w; bedCol[k * 3 + 2] = b * w;
  }
  const bedGeo = new THREE.BufferGeometry();
  bedGeo.setAttribute('position', new THREE.BufferAttribute(bedPos, 3)); bedGeo.setAttribute('color', new THREE.BufferAttribute(bedCol, 3));
  bedGeo.setIndex(indices); bedGeo.computeVertexNormals(); bedGeo.computeBoundingSphere();
  const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  bed.receiveShadow = false; bed.frustumCulled = false; group.add(bed);

  // ----- the water surface -----
  const wPos = new Float32Array(N * 3), wNor = new Float32Array(N * 3), wUv = new Float32Array(N * 2), wCol = new Float32Array(N * 4);
  const TILE = 7;                                                           // metres per picture
  for (let k = 0; k < N; k++) {
    wPos[k * 3] = X[k]; wPos[k * 3 + 1] = WATER_Y; wPos[k * 3 + 2] = Z[k];
    wNor[k * 3 + 1] = 1; wUv[k * 2] = X[k] / TILE; wUv[k * 2 + 1] = Z[k] / TILE;
    // depth colour: clear and light at the shore, then blue, then dark and deep. Alpha: see-through in the shallows, still see-through enough to show the fish.
    const d = D[k], deep = smooth(0.15, 3.2, d), alpha = smooth(0.04, 0.5, d) * (0.48 + 0.36 * smooth(0.4, 2.6, d));
    wCol[k * 4] = 0.88 * (1 - deep) + 0.22 * deep; wCol[k * 4 + 1] = 1.0 * (1 - deep) + 0.46 * deep; wCol[k * 4 + 2] = 0.95 * (1 - deep) + 0.66 * deep; wCol[k * 4 + 3] = alpha;
  }
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute('normal', new THREE.BufferAttribute(wNor, 3));
  wGeo.setAttribute('uv', new THREE.BufferAttribute(wUv, 2)); wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 4));
  wGeo.setIndex(indices); wGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(CX, 0, (Z_TOP + Z_FAR) / 2), 220);
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
      amp[k] = (0.022 + 0.10 * smooth(0, 60, Z_S0 - Z[k])) * smooth(0.0, 0.7, D[k]);          // gentle at the shore, bigger far out, none where the water is too shallow
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

  // ----- rocks half in the water along the shore and the banks (real grass and seaweed are added below) -----
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1, flatShading: true }), 34);
  { const o = new THREE.Object3D();
    for (let k = 0; k < 34; k++) {
      let x, z; const south = k < 22;
      if (south) { x = CX + rand(-HW0 + 2, HW0 - 2); z = zShore(x) + rand(-0.4, 0.6); }
      else { z = rand(-3, 4.5); x = k % 2 ? bankR(z) - rand(-0.5, 1.2) : bankL(z) + rand(-0.5, 1.2); }
      const s = rand(0.25, 0.7);
      o.position.set(x, BED_EDGE_Y - depthAt(x, z) + s * 0.1, z); o.rotation.set(rand(0, 3), rand(0, 6), rand(0, 3)); o.scale.set(s * rand(0.9, 1.5), s * rand(0.5, 0.8), s * rand(0.9, 1.4));
      o.updateMatrix(); rocks.setMatrixAt(k, o.matrix);
    }
  }
  rocks.castShadow = false; rocks.frustumCulled = false; group.add(rocks);

  // ----- real grass and real seaweed -----
  buildGrass(group);
  const weedMixers = [];
  buildWeed(group, weedMixers);

  // ----- ripples round a player who is wading -----
  const ringGeo = new THREE.RingGeometry(0.3, 0.38, 32).rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 7 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; m.renderOrder = 6; group.add(m); return { m, age: 99 };
  });
  let rippleAt = 0, lastRx = 1e9, lastRz = 1e9, inWater = false;

  // ----- the fish -----
  const fish = buildFish(world, group);

  // ----- every frame -----
  const clock = new THREE.Clock(); let time = 0, normalTick = 0, grassTick = 0;
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

    // the grass: only the squares near the player are drawn
    const gc = group.userData.grassChunks;
    if (gc && (grassTick = (grassTick + 1) % 15) === 0) for (const c of gc) c.im.visible = Math.hypot(c.x - p.x, c.z - p.z) < 85;
    // the seaweed sways (only the plants near the player)
    for (const w of weedMixers) if (Math.hypot(w.x - p.x, w.z - p.z) < 55) w.mixer.update(dt);

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
    fish.update(dt, p.x, p.z, Math.abs(p.z - 0) < 22 && Math.abs(p.x - CX) < HW0 + 8);
  };

  return { group, update };
}
