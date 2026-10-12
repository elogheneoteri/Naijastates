// commercial_exterior.js  (the OUTSIDE of the Commercial District mall; no interior yet)
//
// Exports:  buildCommercialExterior() -> { group }      COMM_BOXES -> solid parts for collisions
//
// LOCAL SPACE (same idea as high_school_exterior.js): the plot centre is (0,0), the FRONT / road side is +Z,
// the plot is x -37..+37, z -24..+24. game.js turns the whole thing to face the way city.js says (plot.rotY).
// The street pavement is just outside the plot at z = 26.9 .. 28.5.
//
// WHAT IS HERE (every part has an on/off switch in SHOW below, and every position is a number you can change)
//   Mall:        mall_exterior_optimised.glb (already in metres: 35.7 wide, 25 deep, 32.6 tall), at the back of the plot
//   Front:       paved plaza, entrance canopy on two columns, mall name sign, shop signs, CCTV cameras
//   Parking:     asphalt lot with painted bay lines, kerbs with an entrance/exit gap, two speed bumps per lane,
//                security booth on the island between the two lanes, shopping-cart corral (no vehicles)
//   Street side: pylon sign with the shop names, two advertising light-boxes, bus stop
//   Sides/back:  one big roadside billboard, a row of solar panels
//
// FILES NEEDED in props/ :  mall_exterior_optimised.glb, security_room_optimised.glb, surveillance_cam_optimised.glb,
//   solar_panel_optimised.glb, billboard_optimised.glb, billboard_stand_optimised.glb, speed_bump_optimised.glb, shopping_cart.glb
//   and the bus stop from props_library.js ('bus_stop' = your bus_stop_shelter.glb).
// If a file fails to load the game keeps running and the item is skipped (see the browser console).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadProp, PROPS_DIR } from './props_library.js';

// ---------- things you may want to change ----------
const MALL_NAME = 'DELTA CITY MALL';
const SHOPS = ['FRESH MART SUPERMARKET', 'PHARMACY PLUS', 'GADGET WORLD', 'STYLE HUB FASHION', 'FOOD COURT', 'BANK ATM'];
const SHOW = { plaza: true, parking: true, kerbs: true, canopy: true, nameSign: true, shopSigns: true, cameras: true, booth: true,
               bumps: true, carts: true, pylon: true, stands: true, busStop: true, billboard: true, solar: true };

// ---------- layout (local metres) ----------
const MALL_W = 35.66, MALL_D = 24.96, MALL_H = 32.6;          // size of mall_exterior_optimised.glb
const MALL = { x: 0, z: -22 + MALL_D / 2 };                      // back of the mall 2 m from the back edge of the plot
const FRONT_Z = MALL.z + MALL_D / 2;                             // the shop-front wall (z = 2.96)
const ENTRANCE_X = 3.3;                                          // middle of the storefront (move it if the real doors are elsewhere)
const LOT = { x0: -34, x1: 34, z0: 6.2, z1: 23.6 };              // parking lot rectangle
const DRIVE = { x0: -6.4, x1: 6.4 };                             // the entrance / exit gap in the kerb (two lanes, booth island between)
const BOOTH = { x: 0, z: 20.5 };                                 // security booth, long side runs along z
const LANES = [-3.9, 3.9];                                       // lane centres (x)
const BUMPS = [[-4.9, 16.2], [-2.9, 16.2], [2.9, 16.2], [4.9, 16.2]];   // x, z of each 2 m speed bump piece
const CANOPY = { x: ENTRANCE_X, w: 9, d: 3.4, y: 5.1, t: 0.3 };  // canopy slab over the entrance
const SOLAR = { x0: 22, z: -4.5, n: 4, gap: 2.3, rows: 2, rowGap: 2.4 };   // ground-mounted panels east of the mall
const BILLBOARD = { x: 28.5, z: -17.5, rotY: Math.PI / 2 };       // flip rotY to -Math.PI / 2 if the blank back faces the road
const STANDS = [{ x: 30, z: 22.0 }, { x: -31, z: 22.0 }];        // advertising light-boxes (face the street)
const PYLON = { x: -24, z: 21.5, w: 2.6, h: 5.6, d: 0.5 };
const BUS_STOP = { x: 18, z: 25.4, rotY: 0 };                    // on the strip between the plot and the pavement
const CARTS = [[-3.4, 3.7], [-3.4, 4.1], [-3.4, 4.5], [-3.4, 4.9]];   // nested trolleys beside the entrance
const CAMERAS = [                                                // x, y (bottom of the arm), z, rotY (lens points +Z at rotY 0)
  [-15.5, 4.6, FRONT_Z, 0], [ENTRANCE_X - 4.2, 4.5, FRONT_Z, 0], [ENTRANCE_X + 4.2, 4.5, FRONT_Z, 0], [15.5, 4.6, FRONT_Z, 0],
  [MALL_W / 2, 4.6, MALL.z + 4, Math.PI / 2], [-MALL_W / 2, 4.6, MALL.z + 4, -Math.PI / 2]
];

// ---------- collision boxes: [minX, maxX, minZ, maxZ] ----------
const R = (x, z, hw, hd) => [x - hw, x + hw, z - hd, z + hd];
export const COMM_BOXES = [
  [MALL.x - MALL_W / 2, MALL.x + MALL_W / 2, MALL.z - MALL_D / 2, FRONT_Z],      // the whole mall (no way in yet)
  R(BOOTH.x, BOOTH.z, 1.5, 3.3),
  R(PYLON.x, PYLON.z, PYLON.w / 2, PYLON.d / 2 + 0.1),
  R(BILLBOARD.x, BILLBOARD.z, 1.2, 1.2),
  ...STANDS.map(s => R(s.x, s.z, 0.7, 0.7)),
  R(CANOPY.x - CANOPY.w / 2 + 0.4, FRONT_Z + CANOPY.d - 0.4, 0.3, 0.3), R(CANOPY.x + CANOPY.w / 2 - 0.4, FRONT_Z + CANOPY.d - 0.4, 0.3, 0.3),
  ...(SHOW.solar ? Array.from({ length: SOLAR.rows * SOLAR.n }, (_, i) => R(SOLAR.x0 + (i % SOLAR.n) * SOLAR.gap, SOLAR.z + Math.floor(i / SOLAR.n) * SOLAR.rowGap, 1.0, 0.45)) : [])
];

// ---------- helpers ----------
const loader = new GLTFLoader();
const cache = new Map();
function getModel(file) {                                         // each file is downloaded once, then cloned
  if (!cache.has(file)) cache.set(file, new Promise((res, rej) => loader.load(PROPS_DIR + file, g => res(g.scene), undefined, rej)));
  return cache.get(file);
}
async function put(group, file, x, y, z, rotY = 0, scale = 1) {
  try {
    const m = (await getModel(file)).clone(true);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    m.position.set(x, y, z); m.rotation.y = rotY; m.scale.setScalar(scale);
    group.add(m); return m;
  } catch (e) { console.warn('commercial_exterior: could not load', file, e); return null; }
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
const SHOP_COLOURS = ['#1a7f37', '#0b6bb5', '#c2410c', '#7c2d92'];
function shopTexture(name, i) {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = SHOP_COLOURS[i % SHOP_COLOURS.length]; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, h - 12, w, 12);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${fitText(ctx, name, w - 40, 64)}px "Segoe UI", Arial, sans-serif`; ctx.fillText(name, w / 2, h / 2 - 4);
  });
}
function pylonTexture() {
  return canvasTex(256, 640, (ctx, w, h) => {
    ctx.fillStyle = '#0f2a52'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f2b705'; ctx.fillRect(0, 118, w, 6);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${fitText(ctx, 'DELTA CITY', w - 24, 44)}px Arial`; ctx.fillText('DELTA CITY', w / 2, 40);
    ctx.font = `bold ${fitText(ctx, 'MALL', w - 24, 56)}px Arial`; ctx.fillText('MALL', w / 2, 90);
    SHOPS.forEach((s, i) => { ctx.fillStyle = i % 2 ? '#dfe8f5' : '#fff'; ctx.font = `bold ${fitText(ctx, s, w - 28, 24)}px Arial`; ctx.fillText(s, w / 2, 160 + i * 74); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(20, 196 + i * 74, w - 40, 2); });
  });
}

// ---------- the build ----------
export function buildCommercialExterior() {
  const group = new THREE.Group();
  const ready = [];                                                // promises, so nothing blocks the game

  // the mall itself
  ready.push(put(group, 'mall_exterior_optimised.glb', MALL.x, 0, MALL.z));

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

  // shop signs along the ground-floor front (two each side of the canopy)
  if (SHOW.shopSigns) {
    [-12.5, -6.2, 13.0, 8.4].forEach((x, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), signMat(shopTexture(SHOPS[i], i)));
      m.position.set(x, 4.5, FRONT_Z + 0.32); group.add(m);
    });
  }

  // CCTV cameras on the walls
  if (SHOW.cameras) CAMERAS.forEach(([x, y, z, ry]) => ready.push(put(group, 'surveillance_cam_optimised.glb', x, y, z, ry)));

  // security booth on the island between the two lanes
  if (SHOW.booth) ready.push(put(group, 'security_room_optimised.glb', BOOTH.x, 0, BOOTH.z, 0));

  // speed bumps across the lanes
  if (SHOW.bumps) BUMPS.forEach(([x, z]) => ready.push(put(group, 'speed_bump_optimised.glb', x, 0.02, z, 0)));

  // shopping carts
  if (SHOW.carts) CARTS.forEach(([x, z], i) => ready.push(put(group, 'shopping_cart.glb', x, 0.02, z, Math.PI / 2 + i * 0.03)));

  // pylon sign with the shop names (both faces)
  if (SHOW.pylon) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(PYLON.w, PYLON.h, PYLON.d), new THREE.MeshStandardMaterial({ color: 0x0f2a52, roughness: 0.6 }));
    body.position.set(PYLON.x, PYLON.h / 2, PYLON.z); body.castShadow = true; group.add(body);
    const tex = pylonTexture(), mat = signMat(tex);
    [1, -1].forEach(s => { const f = new THREE.Mesh(new THREE.PlaneGeometry(PYLON.w - 0.2, PYLON.h - 0.3), mat); f.position.set(PYLON.x, PYLON.h / 2, PYLON.z + s * (PYLON.d / 2 + 0.01)); if (s < 0) f.rotation.y = Math.PI; group.add(f); });
  }

  // advertising light-boxes
  if (SHOW.stands) STANDS.forEach(s => ready.push(put(group, 'billboard_stand_optimised.glb', s.x, 0, s.z, 0)));

  // roadside billboard
  if (SHOW.billboard) ready.push(put(group, 'billboard_optimised.glb', BILLBOARD.x, 0, BILLBOARD.z, BILLBOARD.rotY));

  // solar panels
  if (SHOW.solar) for (let r = 0; r < SOLAR.rows; r++) for (let i = 0; i < SOLAR.n; i++) ready.push(put(group, 'solar_panel_optimised.glb', SOLAR.x0 + i * SOLAR.gap, 0, SOLAR.z + r * SOLAR.rowGap, 0));

  // bus stop (your bus_stop_shelter.glb through props_library.js)
  if (SHOW.busStop) loadProp('bus_stop').then(p => { p.position.set(BUS_STOP.x, 0, BUS_STOP.z); p.rotation.y = BUS_STOP.rotY; group.add(p); }).catch(e => console.warn('commercial_exterior: bus stop', e));

  Promise.all(ready).catch(() => {});
  return { group };
}
