// commercial_exterior.js  (the OUTSIDE of the Commercial District mall; the inside is in mall_interior.js)
//
// Exports:  buildCommercialExterior() -> { group, exterior, update }      COMM_BOXES -> solid parts for collisions
//
// LOCAL SPACE (same idea as high_school_exterior.js): the plot centre is (0,0), the FRONT / road side is +Z,
// the plot is x -37..+37, z -24..+24. game.js turns the whole thing to face the way city.js says (plot.rotY).
// The street pavement is just outside the plot at z = 26.9 .. 28.5.
//
// WHAT IS HERE (every part has an on/off switch in SHOW below, and every position is a number you can change)
//   Mall:        mall_exterior_optimised.glb (already in metres: 35.7 wide, 25 deep, 32.6 tall), at the back of the plot.
//                You can walk in through the doorway under the canopy (mall_interior.js); game.js hides this model while you are inside (the `exterior` returned below).
//   Front:       paved plaza, entrance canopy on two columns, mall name sign, five shop signs (your sign-board model with new lettering), CCTV cameras
//   Parking:     asphalt lot with painted bay lines, kerbs with an entrance/exit gap, two speed bumps per lane,
//                security booth on the island between the two lanes, shopping-cart corral (no vehicles)
//   Boundary:    NO wall fence. Bollards along the front kerb (gold ones mark the entrance and the two walkways), hedges along the two sides and the back
//   Street side: the mall directory (your mall_directories model, five rows, back to back so one side faces each way along the road), two animated advertising light-boxes, bus stop
//   Back:        one big roadside billboard
//
// FILES NEEDED in props/ :  mall_exterior_optimised.glb, security_room_optimised.glb, surveillance_cam_optimised.glb,
//   billboard_optimised.glb, billboard_stand_optimised.glb, speed_bump_optimised.glb, shopping_cart.glb,
//   bollard_steel_optimised.glb, bollard_gold_optimised.glb, shop_sign_optimised.glb (the sign-board with its 5 name variants),
//   mall_directory_optimised.glb (your directory board with the five floors written on it), hedge.glb (yours),
//   and the bus stop from props_library.js ('bus_stop' = your bus_stop_shelter.glb).
// If a file fails to load the game keeps running and the item is skipped (see the browser console).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadProp, PROPS_DIR } from './props_library.js';
import { MALL_SHELL } from './mall_interior.js';        // wall numbers of the inside, so the doorway here lines up with the doorway there

// ---------- things you may want to change ----------
const MALL_NAME = 'DELTA CITY MALL';
const SIGN_NAMES = ['SUPERMARKET', 'CAFE & RESTAURANT', 'SPA & GYM', 'FASHION', 'FURNITURE & ELECTRONICS'];   // the five wall signs. They are painted into shop_sign_optimised.glb in this order; to change a name, ask for a new sign file
const SHOW = { plaza: true, parking: true, kerbs: true, canopy: true, nameSign: true, shopSigns: true, cameras: true, booth: true,
               bumps: true, carts: true, directory: true, stands: true, busStop: true, billboard: true, bollards: true, hedges: true };

// ---------- layout (local metres) ----------
const MALL_W = 35.66, MALL_D = 24.96, MALL_H = 32.6;          // size of mall_exterior_optimised.glb
const MALL = { x: 0, z: -22 + MALL_D / 2 };                      // back of the mall 2 m from the back edge of the plot
const FRONT_Z = MALL.z + MALL_D / 2;                             // the shop-front wall (z = 2.96)
const ENTRANCE_X = 3.3;                                          // middle of the doorway (must equal DOOR_X in mall_interior.js; move both if the real doors are elsewhere)
const LOT = { x0: -34, x1: 34, z0: 6.2, z1: 23.6 };              // parking lot rectangle
const DRIVE = { x0: -6.4, x1: 6.4 };                             // the entrance / exit gap in the kerb (two lanes, booth island between)
const WALKWAYS = [[-21, -18], [18, 21]];                         // two walkway gaps for people on foot (the east one is next to the bus stop)
const BOOTH = { x: 0, z: 20.5 };                                 // security booth, long side runs along z
const LANES = [-3.9, 3.9];                                       // lane centres (x)
const BUMPS = [[-4.9, 16.2], [-2.9, 16.2], [2.9, 16.2], [4.9, 16.2]];   // x, z of each 2 m speed bump piece
const CANOPY = { x: ENTRANCE_X, w: 9, d: 3.4, y: 5.1, t: 0.3 };  // canopy slab over the entrance
const BILLBOARD = { x: 28.5, z: -17.5, rotY: -Math.PI / 2 };      // the poster side faces the road (use Math.PI / 2 to turn it round)
const STANDS = [{ x: 30, z: 22.0 }, { x: -31, z: 22.0 }];        // animated advertising light-boxes (face the street)
const STAND_SCALE = 3.6 / 32.41;                                 // the light-box file is in its own big units; this makes it 3.6 m tall (the animation is not affected)
const DIRECTORY_BOARD = { x: -24, z: 21.5 };                     // the mall directory: two boards back to back, one facing each way along the road (each is 2.85 m wide, 5.1 m tall)
const BUS_STOP = { x: 18, z: 25.4 };                             // on the strip between the plot and the pavement; it turns its open side to the road by itself
const CARTS = [[-3.4, 3.7], [-3.4, 4.1], [-3.4, 4.5], [-3.4, 4.9]];   // nested trolleys beside the entrance
const SIGNS_FRONT = [-14.0, -9.8, -5.6, 11.0, 15.2];             // x of the five shop signs on the front wall (same order as SIGN_NAMES)
const CAMERAS = [                                                // x, y (bottom of the arm), z, rotY (lens points +Z at rotY 0)
  [-15.5, 5.3, FRONT_Z, 0], [ENTRANCE_X - 4.2, 4.5, FRONT_Z, 0], [ENTRANCE_X + 4.2, 4.5, FRONT_Z, 0], [15.5, 5.3, FRONT_Z, 0],
  [MALL_W / 2, 4.6, MALL.z + 4, Math.PI / 2], [-MALL_W / 2, 4.6, MALL.z + 4, -Math.PI / 2]
];

// ---------- the boundary: bollards on the front kerb, hedges on the sides and the back ----------
const BOLLARD_Z = LOT.z1 + 0.15, BOLLARD_STEP = 1.1;             // a line of bollards on the kerb; close enough that people cannot squeeze between
const GAPS = [[DRIVE.x0, DRIVE.x1], ...WALKWAYS];                // where the bollard line is open
const GOLD_PTS = GAPS.flatMap(([a, b]) => [[a - 0.55, BOLLARD_Z], [b + 0.55, BOLLARD_Z]]);   // gold bollards mark both sides of every gap
const STEEL_PTS = [];
for (let x = LOT.x0 + 0.6; x <= LOT.x1 - 0.6; x += BOLLARD_STEP) {
  if (GAPS.some(([a, b]) => x > a - 0.3 && x < b + 0.3)) continue;
  if (GOLD_PTS.some(([gx]) => Math.abs(gx - x) < 0.7)) continue;
  STEEL_PTS.push([x, BOLLARD_Z]);
}
const HEDGE_H = 0.9, HEDGE_X = 36.1, HEDGE_BACK_Z = -23.2;       // hedge height (same as your school hedges); the side hedges stand just inside the plot edge
const HEDGE_RUNS = [[-HEDGE_X, HEDGE_BACK_Z, -HEDGE_X, 23.4], [HEDGE_X, HEDGE_BACK_Z, HEDGE_X, 23.4], [-HEDGE_X, HEDGE_BACK_Z, HEDGE_X, HEDGE_BACK_Z]];   // west side, east side, back

// ---------- collision boxes: [minX, maxX, minZ, maxZ] ----------
const R = (x, z, hw, hd) => [x - hw, x + hw, z - hd, z + hd];
// The mall is NOT one solid block any more: only the shell round the inside is solid here (the inside walls, the floors and the lifts are in mall_interior.js).
const WX = MALL_SHELL.hw + MALL_SHELL.t, ZFIN = MALL.z + MALL_SHELL.hd + MALL_SHELL.t, ZBIN = MALL.z - MALL_SHELL.hd - MALL_SHELL.t;   // outer face of the inside walls
export const COMM_BOXES = [
  [MALL.x - MALL_W / 2, -WX, MALL.z - MALL_D / 2, FRONT_Z],                       // west part of the model's wall
  [WX, MALL.x + MALL_W / 2, MALL.z - MALL_D / 2, FRONT_Z],                        // east part
  [-WX, WX, MALL.z - MALL_D / 2, ZBIN],                                           // back part
  [-WX, ENTRANCE_X - MALL_SHELL.doorHalf, ZFIN, FRONT_Z],                         // front part, left of the doorway
  [ENTRANCE_X + MALL_SHELL.doorHalf, WX, ZFIN, FRONT_Z],                          // front part, right of the doorway
  R(BOOTH.x, BOOTH.z, 1.5, 3.3),
  R(DIRECTORY_BOARD.x, DIRECTORY_BOARD.z, 0.75, 1.5),
  R(BILLBOARD.x, BILLBOARD.z, 1.2, 1.2),
  ...STANDS.map(s => R(s.x, s.z, 0.75, 0.75)),                                   // the round foot of each light-box (1.3 m across)
  R(CANOPY.x - CANOPY.w / 2 + 0.4, FRONT_Z + CANOPY.d - 0.4, 0.3, 0.3), R(CANOPY.x + CANOPY.w / 2 - 0.4, FRONT_Z + CANOPY.d - 0.4, 0.3, 0.3),
  ...STEEL_PTS.map(([x, z]) => R(x, z, 0.16, 0.16)), ...GOLD_PTS.map(([x, z]) => R(x, z, 0.12, 0.12)),
  [-HEDGE_X - 0.7, -HEDGE_X + 0.7, HEDGE_BACK_Z - 0.75, 23.4], [HEDGE_X - 0.7, HEDGE_X + 0.7, HEDGE_BACK_Z - 0.75, 23.4],   // hedge sides
  [-HEDGE_X, HEDGE_X, HEDGE_BACK_Z - 0.75, HEDGE_BACK_Z + 0.75]                                                             // hedge back
];

// ---------- helpers ----------
const loader = new GLTFLoader();
const cache = new Map();
function getModel(file) {                                         // each file is downloaded once (the whole glTF: scene + animations), then cloned
  if (!cache.has(file)) cache.set(file, new Promise((res, rej) => loader.load(PROPS_DIR + file, g => res(g), undefined, rej)));
  return cache.get(file);
}
function firstMesh(root) { let m = null; root.traverse(o => { if (o.isMesh && !m) m = o; }); return m; }
async function put(group, file, x, y, z, rotY = 0, scale = 1) {
  try {
    const m = (await getModel(file)).scene.clone(true);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    m.position.set(x, y, z); m.rotation.y = rotY; m.scale.setScalar(scale);
    group.add(m); return m;
  } catch (e) { console.warn('commercial_exterior: could not load', file, e); return null; }
}
async function putInstances(group, file, pts) {                    // many copies of a one-piece model in a single draw call (the bollards)
  try {
    const src = firstMesh((await getModel(file)).scene);
    const im = new THREE.InstancedMesh(src.geometry, src.material, pts.length), m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; group.add(im);
  } catch (e) { console.warn('commercial_exterior: could not load', file, e); }
}
async function fitHeight(file, height) {                           // a model scaled to a height, centred on x/z, standing on the ground (the same way your other hedges are placed)
  const m = (await getModel(file)).scene.clone(true);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  let box = new THREE.Box3().setFromObject(m); m.scale.multiplyScalar(height / (box.max.y - box.min.y));
  box = new THREE.Box3().setFromObject(m); const c = box.getCenter(new THREE.Vector3());
  m.position.set(-c.x, -box.min.y, -c.z);
  const wrap = new THREE.Group(); wrap.add(m); return { obj: wrap, size: box.getSize(new THREE.Vector3()) };
}
async function hedgeRun(group, ax, az, bx, bz) {                   // a straight row of hedge pieces from a to b, each stretched a little so there are no gaps
  try {
    const base = await fitHeight('hedge.glb', HEDGE_H);
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), alongX = Math.abs(dx) >= Math.abs(dz);
    const longX = base.size.x >= base.size.z, L = Math.max(base.size.x, base.size.z);
    const n = Math.max(1, Math.round(len / L)), f = len / n / L;
    for (let i = 0; i < n; i++) {
      const piece = new THREE.Group(), inner = base.obj.clone(true);
      if (alongX !== longX) inner.rotation.y = Math.PI / 2;        // turn the long side along the row
      piece.add(inner); piece.scale.set(alongX ? f : 1, 1, alongX ? 1 : f);
      piece.position.set(ax + dx * (i + 0.5) / n, 0, az + dz * (i + 0.5) / n); group.add(piece);
    }
  } catch (e) { console.warn('commercial_exterior: hedge', e); }
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function fitText(ctx, text, maxW, size, weight = 'bold') {        // biggest font size that fits maxW
  for (let s = size; s > 10; s -= 2) { ctx.font = `${weight} ${s}px "Segoe UI", Arial, sans-serif`; if (ctx.measureText(text).width <= maxW) return s; }
  return 10;
}
function signMat(tex) { return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6 }); }
function flat(group, w, d, x, y, z, mat) {                         // flat rectangle lying on the ground
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; group.add(m); return m;
}
const offsetMat = (map, f = -4) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });

// ---------- textures drawn in code ----------
function parkingTexture() {                                        // 30 pixels per metre; canvas top = back of the lot
  const PX = 30, W = (LOT.x1 - LOT.x0) * PX, H = (LOT.z1 - LOT.z0) * PX;
  const X = x => (x - LOT.x0) * PX, Z = z => (z - LOT.z0) * PX;
  return canvasTex(W, H, ctx => {
    ctx.fillStyle = '#3d3f42'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { const v = 50 + Math.random() * 26; ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    ctx.strokeStyle = '#f2f2ee'; ctx.lineWidth = 4; ctx.lineCap = 'butt';
    const BAY = 2.6, rows = [[6.5, 12.0], [17.8, 23.3]];
    rows.forEach(([za, zb], r) => {
      for (let x = -33.8; x <= 33.9; x += BAY) {
        if (r === 1 && x > DRIVE.x0 - 0.4 && x < DRIVE.x1 + 0.4) continue;        // no bay lines across the entrance lanes
        ctx.beginPath(); ctx.moveTo(X(x), Z(za)); ctx.lineTo(X(x), Z(zb)); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(X(-33.8), Z(r === 0 ? za : zb)); ctx.lineTo(X(33.8), Z(r === 0 ? za : zb)); ctx.stroke();   // line at the car end of the bays
    });
    // two blue accessible bays by the mall end of row A (near the entrance)
    ctx.fillStyle = '#1f5fbf'; [ENTRANCE_X - 1.3, ENTRANCE_X + 1.3].forEach(cx => { ctx.fillRect(X(cx) - 22, Z(7.4), 44, 44); ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.textAlign = 'center'; ctx.fillText('P', X(cx), Z(7.4) + 36); ctx.fillStyle = '#1f5fbf'; });
    // arrows along the aisle
    ctx.fillStyle = '#e8e8e2';
    for (let x = -28; x <= 28; x += 14) { if (Math.abs(x) < 8) continue; const ax = X(x), az = Z(14.9), dir = x < 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(ax + dir * 26, az); ctx.lineTo(ax + dir * 6, az - 16); ctx.lineTo(ax + dir * 6, az + 16); ctx.closePath(); ctx.fill(); ctx.fillRect(Math.min(ax - dir * 30, ax + dir * 6), az - 5, 36, 10); }
    // ENTRY / EXIT words on the two lanes (read from the street)
    ctx.fillStyle = '#f5d000'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center';
    [[LANES[0], 'ENTRY'], [LANES[1], 'EXIT']].forEach(([lx, t]) => { ctx.save(); ctx.translate(X(lx), Z(19.0)); ctx.rotate(Math.PI); ctx.fillText(t, 0, 0); ctx.restore(); });
    // painted lane edges at the gap
    ctx.strokeStyle = '#f5d000'; ctx.lineWidth = 3; [DRIVE.x0, DRIVE.x1].forEach(x => { ctx.beginPath(); ctx.moveTo(X(x), Z(17.8)); ctx.lineTo(X(x), Z(23.6)); ctx.stroke(); });
  });
}
function paverTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c9c4b8'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { const v = 190 + Math.random() * 30; ctx.fillStyle = `rgb(${v},${v - 4},${v - 12})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    ctx.strokeStyle = '#a49f94'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, w, h); ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  }, [(LOT.x1 - LOT.x0) / 1.2, (LOT.z0 - FRONT_Z) / 1.2]);
}
function nameTexture() {
  return canvasTex(1024, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#12315f'); g.addColorStop(1, '#0a1c3a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2b705'; ctx.fillRect(0, 0, w, 10); ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${fitText(ctx, MALL_NAME, w - 80, 110)}px "Segoe UI", Arial, sans-serif`; ctx.fillText(MALL_NAME, w / 2, h / 2 + 4);
  });
}
// ---------- the shop sign boards (your sign-board model; shop_sign_optimised.glb holds five name variants side by side in one picture) ----------
async function shopSign(group, i, x, y, z, rotY) {
  try {
    const src = firstMesh((await getModel('shop_sign_optimised.glb')).scene);
    const geo = src.geometry.clone(), uv = geo.attributes.uv, col = i % 3, row = Math.floor(i / 3);      // the picture is a grid of 3 x 2 variants
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) + col) / 3, (uv.getY(k) + row) / 2);
    uv.needsUpdate = true;
    const mat = src.material.clone(); mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.3;
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.position.set(x, y, z); m.rotation.y = rotY; group.add(m);
  } catch (e) { console.warn('commercial_exterior: shop sign', e); }
}

// ---------- the bus stop: turned so its open side faces the road (+Z) ----------
function meanZ(obj) {                                              // where most of the shelter's surface is, front to back
  obj.updateMatrixWorld(true); const v = new THREE.Vector3(); let s = 0, n = 0;
  obj.traverse(o => { if (o.isMesh && o.geometry.attributes.position) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); s += v.z; n++; } } });
  return n ? s / n : 0;
}
async function putBusStop(group) {
  try {
    const p = await loadProp('bus_stop'); p.position.set(0, 0, 0); p.rotation.y = 0; p.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3());
    let rot = size.z > size.x ? Math.PI / 2 : 0;                   // long side along the road
    p.rotation.y = rot; p.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(p);
    if (meanZ(p) > (box.min.z + box.max.z) / 2) rot += Math.PI;    // the back wall and roof are heavier: that side must be away from the road
    p.rotation.y = rot; p.position.set(BUS_STOP.x, 0, BUS_STOP.z); group.add(p);
  } catch (e) { console.warn('commercial_exterior: bus stop', e); }
}

// ---------- the build ----------
export function buildCommercialExterior() {
  const group = new THREE.Group();
  const mixers = [], clock = new THREE.Clock();                    // the animated light-boxes

  // the mall itself (in its own pivot, so game.js can hide it while the player is inside)
  const mallPivot = new THREE.Group(); group.add(mallPivot);
  put(mallPivot, 'mall_exterior_optimised.glb', MALL.x, 0, MALL.z);

  // paved plaza in front of the shops
  if (SHOW.plaza) flat(group, LOT.x1 - LOT.x0, LOT.z0 - FRONT_Z, 0, 0.025, (FRONT_Z + LOT.z0) / 2, offsetMat(paverTexture(), -5));

  // parking lot with painted bays
  if (SHOW.parking) flat(group, LOT.x1 - LOT.x0, LOT.z1 - LOT.z0, (LOT.x0 + LOT.x1) / 2, 0.02, (LOT.z0 + LOT.z1) / 2, offsetMat(parkingTexture(), -4));

  // kerbs round the lot, open at the entrance / exit
  if (SHOW.kerbs) {
    const km = new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.9 });
    const kerb = (x0, x1, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.14, z1 - z0), km); m.position.set((x0 + x1) / 2, 0.07, (z0 + z1) / 2); m.receiveShadow = true; group.add(m); };
    kerb(LOT.x0, DRIVE.x0, LOT.z1, LOT.z1 + 0.3); kerb(DRIVE.x1, LOT.x1, LOT.z1, LOT.z1 + 0.3);     // front, with the gap
    kerb(LOT.x0 - 0.3, LOT.x0, LOT.z0, LOT.z1 + 0.3); kerb(LOT.x1, LOT.x1 + 0.3, LOT.z0, LOT.z1 + 0.3);   // two sides
  }

  // boundary: bollards on the front kerb (no wall fence), hedges on the sides and the back
  if (SHOW.bollards) { putInstances(group, 'bollard_steel_optimised.glb', STEEL_PTS); putInstances(group, 'bollard_gold_optimised.glb', GOLD_PTS); }
  if (SHOW.hedges) HEDGE_RUNS.forEach(([ax, az, bx, bz]) => hedgeRun(group, ax, az, bx, bz));

  // entrance canopy: a slab on two columns, with a lit strip along its edge
  if (SHOW.canopy) {
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x20324d, roughness: 0.6, metalness: 0.2 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CANOPY.w, CANOPY.t, CANOPY.d), slabMat);
    slab.position.set(CANOPY.x, CANOPY.y + CANOPY.t / 2, FRONT_Z + CANOPY.d / 2); slab.castShadow = true; slab.receiveShadow = true; group.add(slab);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(CANOPY.w, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xf2b705, emissive: 0xf2b705, emissiveIntensity: 0.6 }));
    edge.position.set(CANOPY.x, CANOPY.y + 0.06, FRONT_Z + CANOPY.d + 0.03); group.add(edge);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.7 });
    [-1, 1].forEach(s => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, CANOPY.y, 14), colMat); c.position.set(CANOPY.x + s * (CANOPY.w / 2 - 0.4), CANOPY.y / 2, FRONT_Z + CANOPY.d - 0.4); c.castShadow = true; group.add(c); });
  }

  // mall name sign on the front wall, above the canopy
  if (SHOW.nameSign) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), signMat(nameTexture()));
    m.position.set(ENTRANCE_X, 7.6, FRONT_Z + 0.5); group.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(14.3, 2.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x0a1c3a })); back.position.set(ENTRANCE_X, 7.6, FRONT_Z + 0.38); group.add(back);
  }

  // shop signs on the front wall, hung on your sign-board model (3.6 m wide)
  if (SHOW.shopSigns) SIGN_NAMES.forEach((n, i) => { if (SIGNS_FRONT[i] !== undefined) shopSign(group, i, SIGNS_FRONT[i], 3.6, FRONT_Z + 0.06, 0); });

  // CCTV cameras on the walls
  if (SHOW.cameras) CAMERAS.forEach(([x, y, z, ry]) => put(group, 'surveillance_cam_optimised.glb', x, y, z, ry));

  // security booth on the island between the two lanes
  if (SHOW.booth) put(group, 'security_room_optimised.glb', BOOTH.x, 0, BOOTH.z, 0);

  // speed bumps across the lanes
  if (SHOW.bumps) BUMPS.forEach(([x, z]) => put(group, 'speed_bump_optimised.glb', x, 0.02, z, 0));

  // shopping carts
  if (SHOW.carts) CARTS.forEach(([x, z], i) => put(group, 'shopping_cart.glb', x, 0.02, z, Math.PI / 2 + i * 0.03));

  // the mall directory: your directory board, two of them back to back so people walking either way along the road can read it
  if (SHOW.directory) { put(group, 'mall_directory_optimised.glb', DIRECTORY_BOARD.x, 0, DIRECTORY_BOARD.z, Math.PI / 2); put(group, 'mall_directory_optimised.glb', DIRECTORY_BOARD.x, 0, DIRECTORY_BOARD.z, -Math.PI / 2); }

  // animated advertising light-boxes (the panels turn; the model's own animation plays on a loop)
  if (SHOW.stands) STANDS.forEach(async (s, i) => {
    try {
      const gltf = await getModel('billboard_stand_optimised.glb'), m = gltf.scene.clone(true);
      m.traverse(o => { if (/^ground/i.test(o.name)) o.visible = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });   // hides the flat ground plate that comes with the model
      m.position.set(s.x, 0, s.z); m.scale.setScalar(STAND_SCALE); group.add(m);
      if (gltf.animations.length) { const mx = new THREE.AnimationMixer(m); mx.clipAction(gltf.animations[0]).play(); mx.setTime(i * 2.5); mixers.push(mx); }
    } catch (e) { console.warn('commercial_exterior: light-box', e); }
  });

  // roadside billboard
  if (SHOW.billboard) put(group, 'billboard_optimised.glb', BILLBOARD.x, 0, BILLBOARD.z, BILLBOARD.rotY);

  // bus stop (your bus_stop_shelter.glb through props_library.js)
  if (SHOW.busStop) putBusStop(group);

  const update = () => { const dt = Math.min(clock.getDelta(), 0.1); for (const m of mixers) m.update(dt); };
  return { group, exterior: mallPivot, update };
}
