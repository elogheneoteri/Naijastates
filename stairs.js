// stairs.js  (STEP 2 + 4: the front steps of the High School, and the indoor stairs to the upper floor)
//
// What this file does
//   1. Knows where the steps are and how high they go.
//   2. groundHeight(x, z) tells game.js how high the floor is under a given spot (0 on the grass, up to RISE on top of the steps,
//      RISE inside the school). game.js lifts the character to that height every frame, for you AND for the other players,
//      so nothing extra is sent to the server (it still only knows x and z).
//   3. onStairs(x, z) tells game.js the character is on the steps, so it can walk a bit slower there and play the stairs animation.
//   4. (Step 4) the indoor stairs: a two-flight staircase in the west block of the school (where the store was). Walk in from the hall, climb the
//      south flight, turn at the landing, climb the north flight and you are on the upper floor. The game only knows x and z, so every character
//      remembers which floor it is on (character.userData.level, 0 or 1); it changes when the character reaches the top of a flight.
//      The numbers of the stairs (IN_STAIR) are also used by high_school_interior.js, which draws them and puts the walls around them.
//
// The two stairs animations (animation/Walking Up The Stairs.fbx and animation/Descending Stairs.fbx) sit in the animation/ folder,
// NOT in male/ or female/, because boys and girls share them. game.js loads them for every Mixamo character.
//
// HOW TO MAKE THE STEPS HIGHER OR LOWER
//   Change RISE below, or test it live without editing anything: add  ?rise=0.6  to the web address.
//   If the characters float above the top step, make the number smaller. If their feet sink into it, make it bigger.

import * as THREE from 'three';

export const FLOOR_H = 3.1;   // metres from the downstairs floor to the upstairs floor (the walls are 3.1 m high)

const URL_RISE = parseFloat(new URLSearchParams(location.search).get('rise'));
export const RISE = Number.isFinite(URL_RISE) && URL_RISE >= 0 && URL_RISE < 3 ? URL_RISE : 0.8;   // metres from the pavement to the top step / school floor

// The front steps of the High School. Local space: the school centre is (0,0), the front (road side) is +Z.
//   x0..x1      the walkway to the door (the sides are solid blocks in game.js, so players only climb here)
//   zBottom     the foot of the steps (towards the road);  zTop = the front wall / door sill (where the school floor begins)
//   footprint   the school's footprint: inside it the floor is RISE high
// The indoor stairs (school space, metres): centre (sx, sz), drawn from stairs_optimised.glb turned 90 degrees and scaled by k.
//   Flight 1 (south lane, z > sz): from the hall door end (east, x = sx + lowDx) to the landing (west, x = sx + highDx), rising FLOOR_H / 2.
//   Landing: the west end. Flight 2 (north lane, z < sz): from the landing back east, rising another FLOOR_H / 2, to the upstairs doorway.
//   switchDx: east of this line (x > sx + switchDx) the north lane is upstairs and the south lane is downstairs.
export const IN_STAIR = {
  sx: -12.5, sz: 6.3, k: 1.183,
  halfX: 1.72, halfZ: 1.43,
  lowDx: 1.674, highDx: -0.621, switchDx: 1.2,
  dividerFrom: -0.639, dividerTo: 1.727, dividerHalf: 0.06,       // the wall between the two flights: collision box only (the picture of the wall is thicker, so the lanes stay wide enough to walk)
};

export const HS_STAIRS = {
  x0: 0.6, x1: 3.2, zTop: 8.2, zBottom: 10.8, rise: RISE,
  footprint: { x0: -14.6, x1: 14.6, z0: -9.7, z1: 8.2 },
  inner: IN_STAIR, floorH: FLOOR_H,
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

// How high the floor is at this world position (metres). u = the character's userData: u.level (0 downstairs, 1 upstairs) is read and updated here.
export function groundHeight(wx, wz, u) {
  let h = 0, inside = false;
  for (const s of placed) {
    const d = s.def, p = toLocal(s, wx, wz), f = d.footprint;
    if (p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z <= f.z1) {                                           // inside the school
      inside = true;
      let level = u ? (u.level || 0) : 0;
      const st = d.inner;
      if (st) {
        const dx = p.x - st.sx, dz = p.z - st.sz;
        if (Math.abs(dx) <= st.halfX && Math.abs(dz) <= st.halfZ) {                                         // on the indoor stairs
          if (dx > st.switchDx) { level = dz < 0 ? 1 : 0; if (u) u.level = level; }                         // reached the top of a flight: now on that floor
          const half = d.floorH / 2, t = Math.min(1, Math.max(0, (st.lowDx - dx) / (st.lowDx - st.highDx)));   // t: 0 at the east end of the flight, 1 at the landing
          h = Math.max(h, d.rise + (dz >= 0 ? half * t : half + half * (1 - t)));
          continue;
        }
      }
      h = Math.max(h, d.rise + (level ? d.floorH : 0));
      continue;
    }
    if (p.x >= d.x0 && p.x <= d.x1 && p.z > d.zTop && p.z < d.zBottom) {                                   // on the front steps: a smooth slope
      h = Math.max(h, d.rise * (d.zBottom - p.z) / (d.zBottom - d.zTop));
    }
  }
  if (!inside && u) u.level = 0;
  return h;
}

// Is this world position on the steps (front steps or indoor stairs)?
export function onStairs(wx, wz) {
  for (const s of placed) {
    const d = s.def, p = toLocal(s, wx, wz);
    if (p.x >= d.x0 - 0.2 && p.x <= d.x1 + 0.2 && p.z > d.zTop && p.z < d.zBottom) return true;
    const st = d.inner;
    if (st && Math.abs(p.x - st.sx) <= st.halfX && Math.abs(p.z - st.sz) <= st.halfZ) return true;
  }
  return false;
}
