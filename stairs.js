// stairs.js  (STEP 2 + 4: the front steps of the High School, and the indoor stairs to the upper floor)
//   (+ the OUTSIDE STAIRS of the bed-sitter blocks: see extStairs() below; their numbers are in bedsitter.js, BEDSIT_STAIRS)
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

export const ESC_SPEED = 1.0;            // metres per second the mall escalator belts carry you (west, in the mall's own space)

export const STAIR_SPEED_FACTOR = 0.6;   // you walk at 60% of normal speed on the steps (so the feet look right)
export const STAIR_ANIM_SPEED = 1.5;     // the stairs animation plays at normal speed when you move this fast (m/s); change it if the feet slide

const placed = [];   // every set of steps in the world, with its position

// ---- the OUTSIDE STAIRS of the bed-sitter blocks (a def with ext: true; one def covers every block, def.blocks) ----
// Three flights hug the east wall of each block: the back flight F1 and the front flight F3 both go up from the ground to the landing (same
// height), the top flight F2 goes on up from the landing to the veranda deck of the top floor. Every character carries u.level, as at the school:
//   * on the back flight, the front flight and the east half of the landing you are on level 0 (ground side);
//   * on the west half of the landing (west of landing.gateX) you are on level 1: from there you can climb F2 to the deck and walk the veranda;
//   * on F2 and on the deck, level 1 keeps you up there (level 0 would mean you are on the ground underneath, which the collision boxes in
//     bedsitter.js do not let you reach under F2).
// q = the position in the block's own space (metres from the middle of the block); u = the character's userData. Returns { h } or null (not on the stairs).
const clamp01 = v => Math.min(1, Math.max(0, v));
function extStairs(d, q, u) {
  const inZ = z => q.x >= z.x0 && q.x <= z.x1 && q.z >= z.z0 && q.z <= z.z1;
  const level = u ? (u.level || 0) : 0;
  if (level === 1) {
    if (inZ(d.deck)) return { h: d.deck.h };                                                       // the veranda of the top floor
    if (inZ(d.F2)) return { h: d.F2.hLow + (d.F2.hHigh - d.F2.hLow) * clamp01((q.z - d.F2.z0) / (d.F2.z1 - d.F2.z0)) };   // the top flight
  }
  if (inZ(d.landing)) {                                                                            // the landing: flat, and it decides which way you are heading
    if (u) u.level = q.x < d.landing.gateX ? 1 : 0;
    return { h: d.landing.h };
  }
  if (inZ(d.F1)) { if (u) u.level = 0; return { h: d.F1.h * clamp01((q.z - d.F1.z0) / (d.F1.z1 - d.F1.z0)) }; }     // back flight (rises towards +z)
  if (inZ(d.F3)) { if (u) u.level = 0; return { h: d.F3.h * clamp01((d.F3.z1 - q.z) / (d.F3.z1 - d.F3.z0)) }; }     // front flight (falls towards +z)
  return null;
}

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
    if (d.ext) {                                                                                       // the BED-SITTERS: outside stairs + the top-floor veranda
      for (const blk of d.blocks) {
        const r = extStairs(d, { x: p.x - blk.x, z: p.z - blk.z }, u);
        if (r) { h = Math.max(h, r.h); break; }
      }
      if (u && u.level === 1) inside = true;                                                           // up there: do not reset the level below
      continue;
    }
    if (d.floorsY) {                                                                                       // the MALL: five floors + two escalator lanes (mall_interior.js)
      if (p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z <= f.z1) {
        inside = true;
        const level = u ? (u.level || 0) : 0, Y = d.floorsY;
        const lane = d.lanes.find(l => p.x >= l.x0 && p.x <= l.x1 && p.z >= l.z0 && p.z < l.z1);
        if (lane) {
          const t = (p.x - lane.x0) / (lane.x1 - lane.x0), low = lane.low === 'W' ? t : 1 - t;               // low: 0 at the end on the lower floor, 1 at the end on the upper floor
          if (u && u.escLane !== lane.id) {                                                                 // just stepped on: which pair of floors is this lane going between?
            u.escLane = lane.id;
            u.escK = ((t < 0.5) === (lane.low === 'W')) ? level : level - 1;                                // stepped on at the low end: going up from this floor; at the high end: going down from this floor
          }
          const k = Math.min(Y.length - 2, Math.max(0, u ? u.escK : level));
          h = Math.max(h, Y[k] + (Y[k + 1] - Y[k]) * low);
          if (u) { if (low > 0.9) u.level = k + 1; else if (low < 0.1) u.level = k; }                       // near an end: you are on that floor now
        } else {
          if (u) u.escLane = null;
          h = Math.max(h, Y[level]);
        }
      }
      continue;
    }
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
  if (!inside && u) { u.level = 0; u.escLane = null; }
  return h;
}

// The mall's escalator belts carry you WEST (the mall's own -x): the south lane (the side facing the entrance) rises towards the west, so it takes you UP; the north lane falls towards the west, so it brings you DOWN. Returns the push in world metres per second, { x, z }.
export function escalatorDrift(wx, wz) {
  for (const s of placed) {
    const d = s.def;
    if (!d.floorsY) continue;
    const p = toLocal(s, wx, wz);
    if (d.lanes.some(l => p.x >= l.x0 && p.x <= l.x1 && p.z >= l.z0 && p.z < l.z1)) return { x: -ESC_SPEED * Math.cos(s.a), z: ESC_SPEED * Math.sin(s.a) };
  }
  return { x: 0, z: 0 };
}

// Is this world position on the steps (front steps or indoor stairs)?
export function onStairs(wx, wz) {
  for (const s of placed) {
    const d = s.def, p = toLocal(s, wx, wz);
    if (d.ext) {                                                                                       // the bed-sitter stairs
      for (const blk of d.blocks) {
        const x = p.x - blk.x, z = p.z - blk.z;
        if (x >= d.on.x0 && x <= d.on.x1 && z >= d.on.z0 && z <= d.on.z1) return true;
      }
      continue;
    }
    if (p.x >= d.x0 - 0.2 && p.x <= d.x1 + 0.2 && p.z > d.zTop && p.z < d.zBottom) return true;
    const st = d.inner;
    if (st && Math.abs(p.x - st.sx) <= st.halfX && Math.abs(p.z - st.sz) <= st.halfZ) return true;
  }
  return false;
}





