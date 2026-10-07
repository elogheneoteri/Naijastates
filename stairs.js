// stairs.js  (STEP 2: walking up and down the front steps of the High School)
//
// What this file does
//   1. Knows where the steps are and how high they go.
//   2. groundHeight(x, z) tells game.js how high the floor is under a given spot (0 on the grass, up to RISE on top of the steps,
//      RISE inside the school). game.js lifts the character to that height every frame, for you AND for the other players,
//      so nothing extra is sent to the server (it still only knows x and z).
//   3. onStairs(x, z) tells game.js the character is on the steps, so it can walk a bit slower there and play the stairs animation.
//
// The two stairs animations (animation/Walking Up The Stairs.fbx and animation/Descending Stairs.fbx) sit in the animation/ folder,
// NOT in male/ or female/, because boys and girls share them. game.js loads them for every Mixamo character.
//
// HOW TO MAKE THE STEPS HIGHER OR LOWER
//   Change RISE below, or test it live without editing anything: add  ?rise=0.6  to the web address.
//   If the characters float above the top step, make the number smaller. If their feet sink into it, make it bigger.

import * as THREE from 'three';

const URL_RISE = parseFloat(new URLSearchParams(location.search).get('rise'));
export const RISE = Number.isFinite(URL_RISE) && URL_RISE >= 0 && URL_RISE < 3 ? URL_RISE : 0.8;   // metres from the pavement to the top step / school floor

// The front steps of the High School. Local space: the school centre is (0,0), the front (road side) is +Z.
//   x0..x1      the walkway to the door (the sides are solid blocks in game.js, so players only climb here)
//   zBottom     the foot of the steps (towards the road);  zTop = the front wall / door sill (where the school floor begins)
//   footprint   the school's footprint: inside it the floor is RISE high
export const HS_STAIRS = {
  x0: 0.6, x1: 3.2, zTop: 8.2, zBottom: 10.8, rise: RISE,
  footprint: { x0: -14.6, x1: 14.6, z0: -9.7, z1: 8.2 },
};

export const STAIR_SPEED_FACTOR = 0.6;   // you walk at 60% of normal speed on the steps (so the feet look right)
export const STAIR_ANIM_SPEED = 1.5;     // the stairs animation plays at normal speed when you move this fast (m/s); change it if the feet slide

const placed = [];   // every set of steps in the world, with its position

// Called once by game.js for each building that has steps (x, z, rotY = where the building stands, as in the BUILDINGS list)
export function addStairs(def, x, z, rotY) {
  placed.push({ def, x, z, a: THREE.MathUtils.degToRad(rotY || 0) });
}

// world position -> the building's own space (the opposite of how game.js turns the building)
function toLocal(s, wx, wz) {
  const dx = wx - s.x, dz = wz - s.z, c = Math.cos(s.a), n = Math.sin(s.a);
  return { x: dx * c - dz * n, z: dx * n + dz * c };
}

// How high the floor is at this world position (metres)
export function groundHeight(wx, wz) {
  let h = 0;
  for (const s of placed) {
    const d = s.def, p = toLocal(s, wx, wz), f = d.footprint;
    if (p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z <= f.z1) { h = Math.max(h, d.rise); continue; }       // inside the school
    if (p.x >= d.x0 && p.x <= d.x1 && p.z > d.zTop && p.z < d.zBottom) {                                   // on the steps: a smooth slope
      h = Math.max(h, d.rise * (d.zBottom - p.z) / (d.zBottom - d.zTop));
    }
  }
  return h;
}

// Is this world position on the steps?
export function onStairs(wx, wz) {
  for (const s of placed) {
    const d = s.def, p = toLocal(s, wx, wz);
    if (p.x >= d.x0 - 0.2 && p.x <= d.x1 + 0.2 && p.z > d.zTop && p.z < d.zBottom) return true;
  }
  return false;
}
