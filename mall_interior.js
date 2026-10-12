// mall_interior.js  (STEP 1 + 2 + 3 of the mall interior: the five floors, the entrance, the escalators, the lift, and the SUPERMARKET on the ground floor.
//                    The other floors are still empty: their shops come in the next steps)
//
// Exports:  buildMallInterior() -> { group, marker, halfW, halfD, cz, setInside(bool), setCamera(relX, relZ), setLevel(0..4), update(dt, ctx) }
//           MALL_INTERIOR_BOXES -> solid parts for collisions: [minX, maxX, minZ, maxZ, level]   (level missing = every floor)
//           MALL_STAIRS         -> the floor heights and the two escalator lanes, for stairs.js (it lifts the characters)
//           MALL_SHELL          -> the wall numbers, so commercial_exterior.js can leave the doorway open
//           FLOOR_Y, ROOF_Y, FLOORS, floorName(level), ESCALATOR, ELEVATOR  (numbers the next steps will use)
//
// SPACE: the same "plot-local" space as commercial_exterior.js (plot centre = 0,0, the road / front side is +Z),
// so the interior sits exactly inside the mall model. The mall centre is MALL_Z (= -9.52, the same number as MALL.z in commercial_exterior.js).
//
// THE FIVE FLOORS (your plan)                      floor level = the height of the floor above the ground
//   Level 4   FURNITURE (west)  |  ELECTRONICS (east)        25.76 m
//   Level 3   FASHION                                         19.05 m
//   Level 2   SPA (west)        |  GYM (east)                 12.34 m
//   Level 1   CAFE (west)       |  RESTAURANT (east)           5.64 m
//   Level 0   SUPERMARKET  (+ the entrance lobby)              0 m
//
// The heights come from your mall model: its glass bands start at 5.64, 12.34, 19.05 and 25.76 m and the roof is at 32.46 m,
// so every floor is about 6.7 m tall (nice and airy for a mall). If the floor lines do not match the windows,
// test live without editing anything: add  ?floorh=6.5  to the web address (equal floors of that height).
//
// EVERY FLOOR (same plan, so the next steps are easy):
//
//   back wall (north, -Z)
//   +----------------------------------------------+
//   |                                              |
//   |        SHOP AREA (one or two zones,          |      the zones are coloured patches on the floor with their name,
//   |        painted on the floor)                 |      the shops get built inside them in the next steps
//   |                                              |
//   +----------------------------------------------+
//   |  [ESCALATOR VOID]       [door]     [LIFT]    |      LOBBY: the escalators (a hole in the floor above the ground),
//   +--------------------[front wall]--------------+      the entrance door (ground floor only), the lift shaft
//
//   ESCALATORS = a hole in floors 1 to 4 (10 m x 3.6 m) with TWO lanes side by side, between every pair of floors.
//        Lane A (north lane): low end WEST, high end EAST   -> goes UP when you step on at the west end.
//        Lane B (south lane): high end WEST, low end EAST   -> goes DOWN when you step on at the west end.
//        Both belts carry you EAST (that is how a real pair of escalators works: one up, one down). You can also walk the other way, against the belt.
//   LIFT = a lift shaft (3.2 m x 3.2 m) on every floor. Stand on the yellow "CALL LIFT" patch in front of its door: the doors open and a
//        panel with the five floors appears. Tap a floor and you are taken there (a short fade; the lift is not drawn travelling).
//
// game.js uses: interior: buildMallInterior, boxes: [...COMM_BOXES, ...MALL_INTERIOR_BOXES], stairs: MALL_STAIRS (see game.js).

import * as THREE from 'three';
import { ESC_SPEED } from './stairs.js';
import { PROPS, loadProp } from './props_library.js';

// ---------- size and layout (metres) ----------
export const MALL_Z = -9.52;                       // z of the mall centre in plot space (MALL.z in commercial_exterior.js)
const HW = 16.0, HD = 11.4;                        // inner half width (x) and half depth (z) of every floor, measured from the mall model
const T = 0.3;                                     // thickness of the walls and the floor slabs
const DOOR_X = 3.3, DOOR_HALF = 2.5, DOOR_H = 3.4; // front entrance on the ground floor (same x as ENTRANCE_X in commercial_exterior.js)
const LOBBY_Z = 4.5;                               // the lobby strip is z 4.5 .. 11.4 (front); the shop area is behind it
const RAIL_H = 1.1;

export const ESCALATOR = { x0: -12.5, x1: -2.5, z0: 6.2, z1: 9.8 };   // hole in the floors 1-4 (mall-centre space); two lanes, split at the middle
const ZM = (ESCALATOR.z0 + ESCALATOR.z1) / 2;                          // the line between lane A (north, z < ZM) and lane B (south, z > ZM)
export const ELEVATOR  = { x0: 12.0,  x1: 15.2, z0: 6.4, z1: 9.6 };   // lift shaft, solid on every floor

const URL_H = parseFloat(new URLSearchParams(location.search).get('floorh'));
const EQUAL = Number.isFinite(URL_H) && URL_H > 2 && URL_H < 12;
export const FLOOR_Y = EQUAL ? [0, 1, 2, 3, 4].map(i => i * URL_H) : [0, 5.64, 12.34, 19.05, 25.76];
export const ROOF_Y  = EQUAL ? 5 * URL_H : 32.46;
const floorH = i => (i < 4 ? FLOOR_Y[i + 1] : ROOF_Y) - FLOOR_Y[i];

// the shop areas of each floor (x0, x1 in mall-centre space; they all run from the back wall to the lobby)
export const FLOORS = [
  { name: 'GROUND FLOOR', title: 'SUPERMARKET', zones: [{ name: 'SUPERMARKET', x0: -HW, x1: HW, col: '#2e7d32' }] },
  { name: 'LEVEL 1', title: 'CAFE & RESTAURANT', zones: [{ name: 'CAFE', x0: -HW, x1: 0, col: '#8d5524' }, { name: 'RESTAURANT', x0: 0, x1: HW, col: '#b23a2a' }] },
  { name: 'LEVEL 2', title: 'SPA & GYM', zones: [{ name: 'SPA', x0: -HW, x1: 0, col: '#1f8a8a' }, { name: 'GYM', x0: 0, x1: HW, col: '#44546a' }] },
  { name: 'LEVEL 3', title: 'FASHION', zones: [{ name: 'FASHION', x0: -HW, x1: HW, col: '#8e3b8e' }] },
  { name: 'LEVEL 4', title: 'FURNITURE & ELECTRONICS', zones: [{ name: 'FURNITURE', x0: -HW, x1: 0, col: '#a9742f' }, { name: 'ELECTRONICS', x0: 0, x1: HW, col: '#1d5fa8' }] },
];
export const floorName = level => (FLOORS[level] ? FLOORS[level].name : '');

export const MALL_SHELL = { hw: HW, hd: HD, t: T, doorX: DOOR_X, doorHalf: DOOR_HALF };

// For stairs.js (plot space): how high each floor is, and the two escalator lanes. low = the end where the lane touches the LOWER floor.
export const MALL_STAIRS = {
  floorsY: FLOOR_Y,
  footprint: { x0: -HW, x1: HW, z0: MALL_Z - HD, z1: MALL_Z + HD },
  lanes: [
    { id: 'A', low: 'W', x0: ESCALATOR.x0, x1: ESCALATOR.x1, z0: ESCALATOR.z0 + MALL_Z, z1: ZM + MALL_Z },
    { id: 'B', low: 'E', x0: ESCALATOR.x0, x1: ESCALATOR.x1, z0: ZM + MALL_Z, z1: ESCALATOR.z1 + MALL_Z },
  ],
};


// ---------- STEP 3: the supermarket (ground floor) ----------
// Everything here is in mall-centre space: x across, z from the middle of the mall (back wall z = -HD, the lobby starts at z = LOBBY_Z).
// The props are your optimised files in the props folder (already in metres, so unit: 1.0 keeps their size). They are added to the
// props library from here, so props_library.js does not need to change.
const SM_PROPS = {
  sm_chips_shelf:  { file: 'supermarket_chips_shelf_optimised.glb',  unit: 1.0, tags: ['mall', 'supermarket'] },   // 2.73 m long, 1.33 m tall, front faces +Z
  sm_drinks_shelf: { file: 'supermarket_drinks_shelf_optimised.glb', unit: 1.0, tags: ['mall', 'supermarket'] },   // 1.80 m long, 1.23 m tall, front faces +Z
  sm_fridge:       { file: 'fridge_double_door_optimised.glb',       unit: 1.0, tags: ['mall', 'supermarket'] },   // 0.91 m wide, 1.87 m tall, doors face +Z
  sm_gondola:      { file: 'gondola_optimised.glb',                  unit: 1.0, tags: ['mall', 'supermarket'] },   // double-sided island shelf: 1.93 m long (along z), 0.62 m wide, 4 shelves
  sm_checkout:     { file: 'cash_counter_optimised.glb',             unit: 1.0, tags: ['mall', 'supermarket'] },   // 2.84 m long, the cashier's chair is on the -Z side
  sm_register:     { file: 'cash_register_optimised.glb',            unit: 1.0, tags: ['mall', 'supermarket'] },   // till, 0.42 m
  sm_flour:        { file: 'king_arthur_flour_optimised.glb',        unit: 1.0, tags: ['mall', 'supermarket'] },   // two flour bags, 0.36 m wide
  sm_bread:        { file: 'sandwich_bread_optimised.glb',           unit: 1.0, tags: ['mall', 'supermarket'] },   // two loaves, 0.38 m wide (shown at 60 % so they fit the shelf)
  gta_marker_red:  { file: 'gta_marker_red.glb', maxXZ: 1.9, glow: true,  tags: ['marker'] },                       // red gradient marker = commercial building (blue = public building)
};
Object.entries(SM_PROPS).forEach(([k, v]) => { if (!PROPS[k]) PROPS[k] = v; });

const SM_SIZE = {                                        // footprint [along the prop's own x, along its own z], measured from the optimised files
  sm_chips_shelf: [2.733, 0.586], sm_drinks_shelf: [1.803, 0.379], sm_fridge: [0.909, 0.867], sm_gondola: [0.622, 1.934], sm_checkout: [2.84, 0.86],
};
const MARKER_OUT = 2.2;                                  // how far in front of the mall's front face (z = 2.96 in plot space) the entrance marker lies on the plaza
const SM_ITEMS = (() => {
  const L = [], put = (prop, x, z, rot = 0, extra = {}) => L.push({ prop, x, z, rot, ...extra });
  const wallZ = prop => -HD + 0.03 + SM_SIZE[prop][1] / 2;                                  // touching the back wall
  for (let i = 0; i < 6; i++) put('sm_drinks_shelf', -14.6 + i * 1.9, wallZ('sm_drinks_shelf'));        // back wall, west: drinks
  for (let i = 0; i < 6; i++) put('sm_fridge', -3.2 + i * 0.95, wallZ('sm_fridge'));                     // back wall, middle: chilled and dairy
  for (let i = 0; i < 4; i++) put('sm_chips_shelf', 4.1 + i * 2.8, wallZ('sm_chips_shelf'));             // back wall, east: snacks
  [-7.0, -4.2].forEach(z => {                                                                            // side walls: snack shelves facing into the shop
    put('sm_chips_shelf', -HW + 0.03 + 0.293, z, Math.PI / 2);
    put('sm_chips_shelf', HW - 0.03 - 0.293, z, -Math.PI / 2);
  });
  // three rows of island gondolas (4 on the west side, 4 on the east side; the middle stays open so you can walk in from the door).
  // `stock` puts flour or bread on that gondola; the rest are empty racks for now.
  [-8.2, -5.0, -1.8].forEach((z, r) => {
    [-11.0, -9.05, -7.1, -5.15, 6.5, 8.45, 10.4, 12.35].forEach((x, i) => {
      const stock = r < 2 && i % 2 === 0 ? (x < 0 ? 'sm_flour' : 'sm_bread') : null;
      put('sm_gondola', x, z, Math.PI / 2, { stock });
    });
  });
  // four checkouts along the lobby side of the shop; the cashier stands on the lobby (south) side
  [-12.0, -8.1, 9.0, 12.9].forEach((x, i) => put('sm_checkout', x, 2.6, Math.PI, { lane: i + 1 }));
  return L;
})();

// ---------- collision boxes (plot space) ----------
const B = (x0, x1, z0, z1, level) => (level == null ? [x0, x1, z0 + MALL_Z, z1 + MALL_Z] : [x0, x1, z0 + MALL_Z, z1 + MALL_Z, level]);
export const MALL_INTERIOR_BOXES = (() => {
  const out = [], E = ESCALATOR;
  out.push(B(-HW - T, HW + T, -HD - T, -HD));                               // north wall
  out.push(B(-HW - T, -HW, -HD, HD), B(HW, HW + T, -HD, HD));               // west and east walls
  out.push(B(-HW - T, DOOR_X - DOOR_HALF, HD, HD + T, 0), B(DOOR_X + DOOR_HALF, HW + T, HD, HD + T, 0));   // front wall with the doorway (ground floor)
  for (let l = 0; l < 5; l++) {
    if (l > 0) out.push(B(-HW - T, HW + T, HD, HD + T, l));                 // front wall, no doorway upstairs
    out.push(B(ELEVATOR.x0, ELEVATOR.x1, ELEVATOR.z0, ELEVATOR.z1, l));    // the lift shaft
    out.push(B(E.x0, E.x1, E.z0 - 0.1, E.z0, l), B(E.x0, E.x1, E.z1, E.z1 + 0.1, l));   // the two long sides of the escalators (nobody climbs over)
    out.push(B(E.x0, E.x1, ZM - 0.05, ZM + 0.05, l));                       // the wall between the two lanes
  }
  // the ends of the lanes that lead nowhere (no floor below the ground floor, none above level 4)
  out.push(B(E.x1, E.x1 + 0.3, E.z0, ZM, 0), B(E.x0 - 0.3, E.x0, ZM, E.z1, 0));       // ground floor: lane A east end, lane B west end
  out.push(B(E.x0 - 0.3, E.x0, E.z0, ZM, 4), B(E.x1, E.x1 + 0.3, ZM, E.z1, 4));       // level 4: lane A west end, lane B east end
  SM_ITEMS.forEach(it => {                                                  // the supermarket furniture is solid on the ground floor
    const turned = Math.abs(Math.sin(it.rot)) > 0.5, [w, d] = SM_SIZE[it.prop];
    const hx = (turned ? d : w) / 2, hz = (turned ? w : d) / 2;
    out.push(B(it.x - hx, it.x + hx, it.z - hz, it.z + hz, 0));
  });
  return out;
})();

// ---------- small helpers ----------
const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function fitFont(ctx, text, maxW, size) {
  for (let s = size; s > 12; s -= 2) { ctx.font = `bold ${s}px "Segoe UI", Arial, sans-serif`; if (ctx.measureText(text).width <= maxW) return s; }
  return 12;
}
function tileTexture() {                                                   // light polished mall tiles, 2 m squares
  const t = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d9d5cc'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = 205 + Math.random() * 25; ctx.fillStyle = `rgb(${v},${v - 3},${v - 9})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    ctx.strokeStyle = '#b9b4a8'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function zoneTexture(name, col, wM, dM) {                                  // coloured patch with the zone name, 40 px per metre
  const PX = 40;
  return canvasTex(Math.round(wM * PX), Math.round(dM * PX), (ctx, w, h) => {
    ctx.fillStyle = '#e4e0d6'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${fitFont(ctx, name, w * 0.8, 200)}px "Segoe UI", Arial, sans-serif`; ctx.fillText(name, w / 2, h / 2);
  });
}
function labelTexture(text, col, w = 512, h = 128, fg = '#fff') {
  return canvasTex(w, h, (ctx, W, H) => {
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${fitFont(ctx, text, W - 40, 80)}px "Segoe UI", Arial, sans-serif`; ctx.fillText(text, W / 2, H / 2 - 4);
  });
}
function beltTexture(repeatX, wM) {                                         // grooved rubber belt with arrows, one picture = 0.8 m
  const t = canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#34373c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4a4e55'; for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 6, h);
    ctx.strokeStyle = '#f2b705'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w * 0.35, h * 0.28); ctx.lineTo(w * 0.62, h * 0.5); ctx.lineTo(w * 0.35, h * 0.72); ctx.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, 1); return t;
}
function subtract(r, h) {                                                  // rectangle r minus rectangle h -> up to 4 rectangles
  if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
  const out = [], zz0 = Math.max(r.z0, h.z0), zz1 = Math.min(r.z1, h.z1);
  if (h.z0 > r.z0) out.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: h.z0 });
  if (h.z1 < r.z1) out.push({ x0: r.x0, x1: r.x1, z0: h.z1, z1: r.z1 });
  if (h.x0 > r.x0) out.push({ x0: r.x0, x1: h.x0, z0: zz0, z1: zz1 });
  if (h.x1 < r.x1) out.push({ x0: h.x1, x1: r.x1, z0: zz0, z1: zz1 });
  return out;
}
const minus = (rect, holes) => holes.reduce((list, h) => list.flatMap(r => subtract(r, h)), [rect]);

// ---------- the build ----------
export function buildMallInterior() {
  const root = new THREE.Group();                   // everything inside (shown only while the player is inside)
  root.position.z = MALL_Z;                         // from here on, z is measured from the mall centre
  const marker = new THREE.Group();                 // door marker outside (red gradient, plot space; shown only while the player is outside)
  const M = {
    wall: std(0xf0f0ee, 0.9), slab: std(0xbfbcb4, 0.9), steel: std(0x6a7077, 0.5, 0.5), rail: std(0x8aa4b4, 0.3, 0.4),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    tile: new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.45 }),
    door: std(0xb9bec4, 0.35, 0.7), liftIn: std(0xd8c9a8, 0.6), body: std(0x555a60, 0.5, 0.5), handrail: std(0x1d1f22, 0.5),
    ceil: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.95, side: THREE.FrontSide }),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const box = (parent, mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; parent.add(m); return m;
  };
  const rectBox = (parent, mat, r, y0, y1) => box(parent, mat, r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
  const floorPlane = (parent, r, mat, y, tile) => {                         // flat rectangle lying on the floor (tile = metres per texture repeat)
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
    if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (r.x1 - r.x0) / tile, uv.getY(i) * (r.z1 - r.z0) / tile); }
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2); m.receiveShadow = true; parent.add(m); return m;
  };
  const sign = (parent, tex, w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.6 }));
    m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  };

  const levels = [];                                // { group, side:{N,S,W,E} }
  const doors = [];                                 // the lift doors of each floor (index = floor)
  const beltTex = [];                               // the moving belts of the escalators
  const OUTER = { x0: -HW - T, x1: HW + T, z0: -HD - T, z1: HD + T };
  const INNER = { x0: -HW, x1: HW, z0: -HD, z1: HD };

  for (let i = 0; i < 5; i++) {
    const H = floorH(i), g = new THREE.Group(), info = FLOORS[i];
    g.position.y = FLOOR_Y[i]; root.add(g);
    const holes = i > 0 ? [ESCALATOR, ELEVATOR] : [ELEVATOR];
    g.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.9));

    // floor slab (a hole for the escalators on floors 1-4) and the floor surface
    if (i > 0) minus(OUTER, [ESCALATOR, ELEVATOR]).forEach(r => rectBox(g, M.slab, r, -T, 0));
    else floorPlane(g, OUTER, M.slab, -0.02);
    minus(INNER, holes).forEach(r => floorPlane(g, r, M.tile, 0.01, 2));       // tiles everywhere (lobby)

    // zone patches (name painted on the floor) over the shop area
    info.zones.forEach(z => {
      const r = { x0: z.x0, x1: z.x1, z0: -HD, z1: LOBBY_Z };
      floorPlane(g, r, new THREE.MeshStandardMaterial({ map: zoneTexture(z.name, z.col, r.x1 - r.x0, r.z1 - r.z0), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.02);
    });
    // a low line where the shop area meets the lobby
    box(g, std(0xf2b705, 0.6), HW * 2, 0.02, 0.12, 0, 0.03, LOBBY_Z);

    // lift shaft (solid) with its sign and sliding doors on the front (south) face
    const EV = ELEVATOR, evx = (EV.x0 + EV.x1) / 2, evz = EV.z1;
    box(g, M.steel, EV.x1 - EV.x0, H, EV.z1 - EV.z0, evx, H / 2, (EV.z0 + EV.z1) / 2);
    sign(g, labelTexture('LIFT', '#12315f', 256, 128), 2, 0.8, evx, 3.2, evz + 0.1, 0);
    sign(g, labelTexture('LIFT', '#12315f', 256, 128), 2, 1, evx, 2.6, EV.z0 - 0.02, Math.PI);
    box(g, M.liftIn, 1.8, 2.6, 0.02, evx, 1.3, evz + 0.015);                                       // the inside of the car, seen when the doors open
    const dA = box(g, M.door, 0.9, 2.6, 0.05, evx - 0.45, 1.3, evz + 0.05), dB = box(g, M.door, 0.9, 2.6, 0.05, evx + 0.45, 1.3, evz + 0.05);
    box(g, M.steel, (EV.x1 - EV.x0) / 2 - 0.9, 2.7, 0.08, (EV.x0 + evx - 0.9) / 2, 1.35, evz + 0.09);  // the fixed plates the doors slide behind
    box(g, M.steel, (EV.x1 - EV.x0) / 2 - 0.9, 2.7, 0.08, (evx + 0.9 + EV.x1) / 2, 1.35, evz + 0.09);
    box(g, M.steel, 1.8, 0.1, 0.08, evx, 2.65, evz + 0.09);
    doors.push({ a: dA, b: dB, x: evx, o: 0 });
    floorPlane(g, { x0: EV.x0, x1: EV.x1, z0: evz + 0.3, z1: evz + 1.6 }, new THREE.MeshStandardMaterial({
      map: labelTexture('CALL LIFT', '#f2b705', 512, 128, '#222'), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.02);

    // glass rail along the two long sides of the escalator hole (floors 1-4)
    const E = ESCALATOR;
    if (i > 0) {
      const rw = 0.08;
      [[E.x0, E.x1, E.z0 - rw, E.z0], [E.x0, E.x1, E.z1, E.z1 + rw]].forEach(([x0, x1, z0, z1]) => rectBox(g, M.glass, { x0, x1, z0, z1 }, 0, RAIL_H));
      rectBox(g, M.rail, { x0: E.x0 - 0.1, x1: E.x1 + 0.1, z0: E.z0 - 0.1, z1: E.z0 }, RAIL_H, RAIL_H + 0.05);
      rectBox(g, M.rail, { x0: E.x0 - 0.1, x1: E.x1 + 0.1, z0: E.z1, z1: E.z1 + 0.1 }, RAIL_H, RAIL_H + 0.05);
    }
    if (i === 4) {                                                              // the top floor has no escalator going up: close the ends that lead nowhere
      [[E.x0 - 0.08, E.x0, E.z0, ZM], [E.x1, E.x1 + 0.08, ZM, E.z1]].forEach(([x0, x1, z0, z1]) => rectBox(g, M.glass, { x0, x1, z0, z1 }, 0, RAIL_H));
    }
    floorPlane(g, { x0: E.x0, x1: E.x1, z0: E.z1 + 0.4, z1: E.z1 + 1.4 }, new THREE.MeshStandardMaterial({
      map: labelTexture('ESCALATORS', '#b6b2a6', 1280, 128, '#444'), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.02);

    // outer walls (grouped per side so the camera side can be hidden)
    const side = { N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
    Object.values(side).forEach(s => g.add(s));
    box(side.N, M.wall, OUTER.x1 - OUTER.x0, H + T, T, 0, (H - T) / 2, -HD - T / 2);
    box(side.W, M.wall, T, H + T, HD * 2, -HW - T / 2, (H - T) / 2, 0);
    box(side.E, M.wall, T, H + T, HD * 2, HW + T / 2, (H - T) / 2, 0);
    if (i === 0) {                                                              // front wall with the doorway
      const xa = -HW - T, xb = DOOR_X - DOOR_HALF, xc = DOOR_X + DOOR_HALF, xd = HW + T, zc = HD + T / 2;
      box(side.S, M.wall, xb - xa, H + T, T, (xa + xb) / 2, (H - T) / 2, zc);
      box(side.S, M.wall, xd - xc, H + T, T, (xc + xd) / 2, (H - T) / 2, zc);
      box(side.S, M.wall, xc - xb, H - DOOR_H, T, (xb + xc) / 2, DOOR_H + (H - DOOR_H) / 2, zc);   // above the door
      sign(side.S, labelTexture('WELCOME - DELTA CITY MALL', '#12315f', 1024, 128), 6, 0.75, DOOR_X, DOOR_H + 0.6, HD - 0.02, Math.PI);
    } else box(side.S, M.wall, OUTER.x1 - OUTER.x0, H + T, T, 0, (H - T) / 2, HD + T / 2);
    // floor sign on the front wall (west of the door)
    sign(side.S, labelTexture(`${info.name}  -  ${info.title}`, '#12315f', 1024, 128), 7, 0.9, -9.5, Math.min(H - 1.2, 4.6), HD - 0.02, Math.PI);

    // the roof over the top floor; the other floors are covered by the slab of the floor above
    if (i === 4) { const roof = new THREE.Group(); g.add(roof); rectBox(roof, M.ceil, OUTER, H, H + T); g.userData.roof = roof; roof.visible = false; }
    levels.push({ group: g, side });
  }

  // ----- the escalators: for every pair of floors (k, k+1) two sloping lanes, drawn in the group of the lower floor -----
  const E = ESCALATOR, LW = (E.z1 - E.z0) / 2, LEN = E.x1 - E.x0;
  for (let k = 0; k < 4; k++) {
    const R = FLOOR_Y[k + 1] - FLOOR_Y[k], ang = Math.atan2(R, LEN), slope = Math.hypot(LEN, R);
    [{ low: 'W', zc: E.z0 + LW / 2 }, { low: 'E', zc: E.z0 + LW * 1.5 }].forEach(lane => {
      const pivot = new THREE.Group();
      pivot.position.set((E.x0 + E.x1) / 2, R / 2, lane.zc);
      pivot.rotation.z = lane.low === 'W' ? ang : -ang;                         // lane A rises towards the east, lane B falls towards the east
      levels[k].group.add(pivot);
      box(pivot, M.body, slope, 0.3, LW - 0.04, 0, -0.15, 0);                    // the body of the escalator
      const tex = beltTexture(slope / 0.8, LW - 0.3); beltTex.push(tex);
      const belt = new THREE.Mesh(new THREE.PlaneGeometry(slope, LW - 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      belt.rotation.x = -Math.PI / 2; belt.position.y = 0.01; belt.receiveShadow = true; pivot.add(belt);
      [-1, 1].forEach(sd => {                                                    // glass sides with a black handrail on top
        box(pivot, M.glass, slope, 1.0, 0.04, 0, 0.5, sd * (LW / 2 - 0.05));
        box(pivot, M.handrail, slope, 0.07, 0.1, 0, 1.03, sd * (LW / 2 - 0.05));
      });
    });
  }

  // ----- STEP 3: the supermarket (ground floor) -----
  const g0 = levels[0].group;
  const warnLoad = what => e => console.warn('mall interior: could not load ' + what, e);
  const stockGondola = (G, prop) => {                                          // flour or bread on two shelves, both sides
    [1, -1].forEach(side => [0.49, 0.90].forEach(y => [-0.45, 0.45].forEach(dz => {
      loadProp(prop, prop === 'sm_bread' ? { scale: 0.6 } : {}).then(p => { p.position.set(side * 0.15, y, dz); p.rotation.y = side * Math.PI / 2; G.add(p); }).catch(warnLoad(prop));
    })));
  };
  SM_ITEMS.forEach(it => {
    loadProp(it.prop).then(p => {
      const G = new THREE.Group(); G.position.set(it.x, 0, it.z); G.rotation.y = it.rot; G.add(p); g0.add(G);
      if (it.stock) stockGondola(G, it.stock);
      if (it.prop === 'sm_checkout') loadProp('sm_register').then(r => { r.position.set(0.95, 0.9, -0.12); r.rotation.y = Math.PI; G.add(r); }).catch(warnLoad('sm_register'));
    }).catch(warnLoad(it.prop));
    if (it.lane) {                                                             // CHECKOUT 1..4 painted on the floor in front of each counter
      floorPlane(g0, { x0: it.x - 1.1, x1: it.x + 1.1, z0: it.z - 1.7, z1: it.z - 1.1 }, new THREE.MeshStandardMaterial({
        map: labelTexture('CHECKOUT ' + it.lane, '#c62828', 512, 128), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.02);
    }
  });
  // signs on the back wall
  sign(g0, labelTexture('FRESH MART SUPERMARKET', '#c62828', 1024, 128), 9, 1.1, 0, 4.6, -HD + 0.03, 0);
  sign(g0, labelTexture('DRINKS', '#12315f', 512, 128), 3.4, 0.6, -9.9, 2.5, -HD + 0.03, 0);
  sign(g0, labelTexture('CHILLED & DAIRY', '#12315f', 512, 128), 3.4, 0.6, -0.8, 2.5, -HD + 0.03, 0);
  sign(g0, labelTexture('SNACKS & CHIPS', '#12315f', 512, 128), 3.4, 0.6, 8.4, 2.5, -HD + 0.03, 0);
  // red gradient markers: one just inside the door (the exit) and one on the plaza in front of the doorway (the entrance, shown only while you are outside)
  loadProp('gta_marker_red').then(p => { p.position.set(DOOR_X, 0.02, HD - 1.6); g0.add(p); }).catch(warnLoad('gta_marker_red (exit)'));
  loadProp('gta_marker_red').then(p => { p.position.set(DOOR_X, 0.02, 2.96 + MARKER_OUT); marker.add(p); }).catch(warnLoad('gta_marker_red (entrance)'));

  // ----- the panel for the lift, the floor name badge and the fade -----
  let panel = null, badge = null, fade = null, gotoFn = null, panelLevel = -2;
  const makeUi = () => {
    if (panel) return;
    const css = (el, st) => Object.assign(el.style, st);
    panel = document.createElement('div');
    css(panel, { position: 'fixed', left: '50%', bottom: '24%', transform: 'translateX(-50%)', background: 'rgba(10,25,50,0.92)', color: '#fff', padding: '10px 12px 12px',
      borderRadius: '12px', zIndex: 30, display: 'none', font: '600 14px "Segoe UI", Arial, sans-serif', textAlign: 'center', boxShadow: '0 4px 18px rgba(0,0,0,.4)' });
    const title = document.createElement('div'); title.textContent = 'LIFT - choose a floor'; css(title, { marginBottom: '8px' }); panel.appendChild(title);
    panel.buttons = [];
    for (let i = 4; i >= 0; i--) {
      const b = document.createElement('button');
      b.textContent = (i === 0 ? 'G' : i) + '  ' + FLOORS[i].title;
      css(b, { display: 'block', width: '100%', minHeight: '44px', margin: '4px 0', padding: '6px 14px', border: '0', borderRadius: '8px', background: '#f2b705', color: '#222', font: 'inherit', cursor: 'pointer' });
      b.onclick = () => {
        if (!gotoFn) return;
        fade.style.opacity = '1';
        setTimeout(() => { if (gotoFn) gotoFn(i); fade.style.opacity = '0'; }, 280);
      };
      panel.buttons[i] = b; panel.appendChild(b);
    }
    badge = document.createElement('div');
    css(badge, { position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,25,50,0.85)', color: '#fff', padding: '6px 16px', borderRadius: '10px',
      zIndex: 29, display: 'none', font: '700 15px "Segoe UI", Arial, sans-serif', pointerEvents: 'none' });
    fade = document.createElement('div');
    css(fade, { position: 'fixed', inset: '0', background: '#000', opacity: '0', transition: 'opacity 0.25s', zIndex: 40, pointerEvents: 'none' });
    document.body.append(panel, badge, fade);
  };

  // ----- hooks used by game.js -----
  const setInside = inside => {
    root.visible = inside; marker.visible = !inside;
    if (!inside && panel) { panel.style.display = 'none'; badge.style.display = 'none'; panelLevel = -2; }
  };
  const update = (dt, ctx) => {                                                  // ctx: { x, z (plot space), level, goto(level) }
    makeUi();
    beltTex.forEach(t => { t.offset.x -= dt * ESC_SPEED / 0.8; });               // both belts carry you east
    const lx = ctx.x, lz = ctx.z - MALL_Z;
    const inZone = lx > ELEVATOR.x0 - 0.3 && lx < ELEVATOR.x1 + 0.3 && lz > ELEVATOR.z1 && lz < HD;
    doors.forEach((d, i) => {
      const target = inZone && ctx.level === i ? 1 : 0;
      d.o += (target - d.o) * Math.min(1, dt * 5);
      d.a.position.x = d.x - 0.45 - 0.75 * d.o; d.b.position.x = d.x + 0.45 + 0.75 * d.o;
    });
    gotoFn = ctx.goto;
    panel.style.display = inZone ? 'block' : 'none';
    if (inZone && panelLevel !== ctx.level) panel.buttons.forEach((b, i) => { b.disabled = i === ctx.level; b.style.opacity = i === ctx.level ? '0.45' : '1'; });
    if (panelLevel !== ctx.level) { badge.textContent = FLOORS[ctx.level].name + '  -  ' + FLOORS[ctx.level].title; panelLevel = ctx.level; }
    badge.style.display = 'block';
  };
  const setLevel = level => { levels.forEach((l, i) => { l.group.visible = i === level || i === level - 1; }); };   // the floor you are on, and the one below (seen through the escalator hole)
  const setCamera = (relX, relZ) => {
    const z = relZ - MALL_Z;
    levels.forEach(l => {
      l.side.N.visible = !(z < -HD);
      l.side.S.visible = !(z > HD);
      l.side.W.visible = !(relX < -HW);
      l.side.E.visible = !(relX > HW);
    });
  };
  setLevel(0); setCamera(0, MALL_Z); setInside(false);

  // halfW / halfD are a little bigger than the floors, so the mall counts as "inside" as soon as you are in the doorway (the model's front wall is thick)
  return { group: root, marker, halfW: HW + T + 0.1, halfD: HD + T + 0.42, cz: MALL_Z, setInside, setCamera, setLevel, update };
}
