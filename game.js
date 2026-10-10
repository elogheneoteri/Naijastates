// 3D version of the game (Three.js). Replaces the flat Phaser game.
// Your server.js does NOT change: it still thinks in the old pixel units.
// We convert: 1 metre in 3D = PX_PER_M pixels on the server.
//   server x  ->  3D X (east)      server y  ->  3D Z (south)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { buildRefugeeCamp, CAMP_BOXES } from './refugee_camp.js';
import { buildImmigrationOffice, IMMIGRATION_BOXES } from './immigration_office.js';
import { buildHighSchoolExterior, HS_EXTERIOR_BOXES } from './high_school_exterior.js';
import { buildHighSchoolInterior, HS_INTERIOR_BOXES } from './high_school_interior.js';
import { initNin, IVORY_FILE } from './nin.js';
import { initClothing } from './clothing.js';   // clothing test: wear another character's outfit
import { loadProp } from './props_library.js';
import { HS_STAIRS, STAIR_SPEED_FACTOR, STAIR_ANIM_SPEED, addStairs, groundHeight, onStairs } from './stairs.js';   // Step 2: the school steps
import { buildCity, cityClearRects, JUNCTION_GAPS_X, CITY, plotAt } from './city.js';

// >>> Your three values (same as before). <<<
const SERVER_URL = 'https://naija-server.onrender.com';
const SUPABASE_URL = 'https://imcfgubedcrxmydanabx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dUT0e10wO4IK7t0fzD02Yw_zmuh2ruE';

// ---------------- World settings ----------------

const PX_PER_M = 30;                       // server pixels per metre
const WORLD_W = 10800 / PX_PER_M;          // 360 m (the arrival area is the west strip; the city lies east of the gate)
const WORLD_H = 7200 / PX_PER_M;           // 240 m (the arrival area only uses z 0 to 52)
const SPEED = 5.0;                         // metres per second (server allows up to 190 px/s = 6.3 m/s)
const GATE_X = 2000 / PX_PER_M;            // border wall (66.7 m); server blocks players past x = 1995 px
const SEND_EVERY_MS = 66;
const PLAYER_RADIUS = 0.45;

const SPAWN = { x: 470 / PX_PER_M, z: 850 / PX_PER_M };
const ROAD_Z0 = 27.0, ROAD_Z1 = 30.5;      // main road (runs west to east, through the gate)

// Buildings. x/z = centre on the ground, rotY = turn in degrees.
// Both models are made facing +Z (south), so the Refugee Camp (south of the road) is turned 180
// to face north, towards the road.
// boxes = solid parts you cannot walk through: [minX, maxX, minZ, maxZ] relative to the centre,
// measured BEFORE rotation (the code rotates them for you).
const HS_PLOT = plotAt('high_school');       // the High School plot from city.js (centre and which way it faces)
const BUILDINGS = [
  {
    key: 'immigration', name: 'Immigration Office', file: 'immigration_office.glb',
    // Realistic office building (low_rise_wall_to_wall_office_building.glb, saved as immigration_office.glb).
    // The model is in centimetre-style units, so scale shrinks it to game metres.
    // Make it bigger or smaller with scale (0.008 = about 25.6 m wide, 23 m tall tower).
    // The code centres it on x/z and sits it on the ground; the glass front faces +Z (south, towards the road).
    scale: 0.008,
    x: 50, z: 11.8, rotY: 0,
    // The inside is built in code (immigration_office.js). Walk through the door in the south wall to go in:
    // the outside model hides and the office interior shows. Solid parts = the office walls (with the door gap) and furniture.
    interior: buildImmigrationOffice,
    boxes: IMMIGRATION_BOXES,
    fallback: [25.6, 23, 24.2]
  },
  {
    key: 'refugee', name: 'Refugee Camp', file: 'refugee_camp.glb',
    build: buildRefugeeCamp,                // built in code (refugee_camp.js); the .glb is no longer used
    x: 21, z: 40, rotY: 180,
    boxes: CAMP_BOXES,                      // big tent, small tents and fence (defined in refugee_camp.js)
    fallback: [19, 4, 19]
  },
  {
    key: 'high_school', name: 'High School', file: 'high_school.glb',
    // Realistic 3-storey school (your high_school.glb). The model is already in metres (47 m wide, 34.5 m deep with the steps),
    // so scale 0.62 shrinks it to fit the 84 x 22 m plot: about 29 m wide, 21 m deep and 11 m tall.
    // Make it bigger or smaller with scale (do not go above 0.64 or the front steps stick out of the plot).
    // Step 3: you can walk in. The front door is in the south wall (x = 1.9 from the school centre, in line with the steps), marked by the
    // blue marker outside. Inside, the outside model hides and the ground floor shows (high_school_interior.js).
    scale: 0.62,
    x: HS_PLOT.x, z: HS_PLOT.z, rotY: HS_PLOT.rotY,
    interior: buildHighSchoolInterior,     // Step 3: classrooms, corridor, hall, toilets, store, principal's office
    boxes: [
      ...HS_INTERIOR_BOXES,                // walls (with the front doorway and the room doorways), desks, counter, stalls ...
      [-1.9, 0.6, 8.1, 10.8],              // the front steps, left of the walkway to the door
      [3.2, 5.7, 8.1, 10.8],               // the front steps, right of the walkway to the door
      ...HS_EXTERIOR_BOXES                 // Step 2: trees, shed, tower, goals, lamps ... (high_school_exterior.js)
    ],
    extras: buildHighSchoolExterior,       // Step 2: the props around the school
    stairs: HS_STAIRS,                     // Step 2: the front steps (stairs.js): the floor rises towards the door and the stairs animation plays
    fallback: [29.2, 11.1, 21.4]
  },
  // ---- The new .glb buildings (assets/buildings/). Each one is already in metres, centred on the
  // origin, sitting on the ground and facing +Z (south), so scale just shrinks it to fit its plot.
  // The collision box is the scaled footprint, centred (before rotation). Tweak scale if you want
  // them bigger or smaller.
  { key: 'airport',     name: 'Airport',          file: 'assets/buildings/airport.glb',     scale: 0.85, x: 18,   z: 12,  rotY: 0,   boxes: [[-15.9, 15.9, -7.8, 7.8]],    fallback: [32, 8, 24] },
  { key: 'low_line',    name: 'Low Line Houses',  file: 'assets/buildings/low_line.glb',    scale: 0.57, x: 83.5, z: 13,  rotY: 0,   boxes: [[-12.5, 12.5, -5.9, 5.9]],    fallback: [25, 4, 22] },
  { key: 'low_bedsit',  name: 'Bedsits',          file: 'assets/buildings/low_bedsit.glb', scale: 0.69, x: 110,  z: 13,  rotY: 0,   boxes: [[-11.9, 11.9, -7.4, 7.4]],    fallback: [24, 5, 22] },
  { key: 'university',  name: 'University',       file: 'assets/buildings/university.glb', scale: 0.62, x: 202,  z: 188, rotY: 0,   boxes: [[-18.7, 18.7, -10.4, 10.4]], fallback: [38, 10, 37] },
  { key: 'rural',       name: 'Rural Compound',   file: 'assets/buildings/rural.glb',       scale: 0.81, x: 338,  z: 12,  rotY: 0,   boxes: [[-10.0, 10.0, -8.1, 8.1]],    fallback: [20, 5, 20] },
  { key: 'rental',      name: 'Rental Complex',   file: 'assets/buildings/rental.glb',      scale: 0.85, x: 83,   z: 49,  rotY: 180, boxes: [[-12.9, 12.9, -9.6, 9.6]],    fallback: [26, 6, 22] },
  { key: 'police',      name: 'Police Station',   file: 'assets/buildings/police.glb',      scale: 0.69, x: 110,  z: 49,  rotY: 90,  boxes: [[-12.0, 12.0, -7.9, 7.9]],    fallback: [24, 5, 22] },
  { key: 'judiciary',   name: 'Judiciary',        file: 'assets/buildings/judiciary.glb',   scale: 0.97, x: 96,   z: 76,  rotY: 90,  boxes: [[-25.6, 25.6, -9.9, 9.9]],    fallback: [52, 8, 20] },
  { key: 'government',  name: 'Government House', file: 'assets/buildings/government.glb',  scale: 0.61, x: 168,  z: 61,  rotY: 180, boxes: [[-30.2, 30.2, -13.9, 13.9]],fallback: [60, 10, 50] },
  { key: 'city_hall',   name: 'City Hall',        file: 'assets/buildings/city_hall.glb',   scale: 0.94, x: 211,  z: 48,  rotY: 90,  boxes: [[-11.0, 11.0, -10.2, 10.2]], fallback: [22, 12, 22] },
  { key: 'bank',        name: 'Bank',             file: 'assets/buildings/bank.glb',        scale: 0.95, x: 211,  z: 75,  rotY: 90,  boxes: [[-10.7, 10.7, -10.9, 10.9]], fallback: [22, 6, 22] },
{ key: 'hotel',      name: 'Grand Hotel',      file: 'assets/buildings/hotel.glb',       scale: 1.0,  x: 275,  z: 61,  rotY: 180, boxes: [[-36.8, 36.8, -24.9, 24.9]],fallback: [74, 24, 50] },
  { key: 'high_housing',name: 'High Rise Estate', file: 'assets/buildings/high_housing.glb',scale: 0.90, x: 180,  z: 127, rotY: 180, boxes: [[-41.9, 41.9, -22.1, 22.1]],fallback: [84, 9, 48] },
  { key: 'commercial',  name: 'Commercial Zone',  file: 'assets/buildings/commercial.glb',  scale: 1.01, x: 275,  z: 127, rotY: 180, boxes: [[-36.7, 36.7, -23.1, 23.1]],fallback: [74, 10, 48] },
  { key: 'mid_housing', name: 'Mid Rise Estate',  file: 'assets/buildings/mid_housing.glb', scale: 0.97, x: 96,   z: 188, rotY: 90,  boxes: [[-24.9, 24.9, -18.4, 18.4]], fallback: [52, 9, 37] }
];

// ---------------- Procedural textures for the ground, road and pavement ----------------
// (drawn in code, so there are no image files to download)
function makeRng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// draw a soft round blob; copies are drawn across the tile edges so the texture tiles without seams
function wrapBlob(ctx, W, H, x, y, r, rgba) {
  for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
    const px = x + dx, py = y + dy;
    if (px < -r || px > W + r || py < -r || py > H + r) continue;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
  }
}
function paintGrass(ctx, W, H, rnd) {
  ctx.fillStyle = '#6c8749'; ctx.fillRect(0, 0, W, H);
  const blotch = ['rgba(128,150,84,0.40)', 'rgba(92,122,62,0.40)', 'rgba(140,146,78,0.30)', 'rgba(70,100,48,0.40)'];
  for (let i = 0; i < 46; i++) wrapBlob(ctx, W, H, rnd() * W, rnd() * H, 40 + rnd() * 90, blotch[(rnd() * blotch.length) | 0]);
  for (let i = 0; i < 9000; i++) {                    // fine blades of grass
    const x = rnd() * W, y = rnd() * H, a = -1.57 + (rnd() - 0.5) * 1.1, l = 3 + rnd() * 6;
    const v = rnd();
    ctx.strokeStyle = v < 0.5 ? `rgba(${60 + rnd() * 30},${105 + rnd() * 45},${40 + rnd() * 25},0.55)` : `rgba(${130 + rnd() * 40},${150 + rnd() * 40},${60 + rnd() * 30},0.45)`;
    ctx.lineWidth = 1 + rnd(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${110 + rnd() * 40},${90 + rnd() * 30},${60 + rnd() * 20},0.45)`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }
}
function paintSand(ctx, W, H, rnd) {                  // red-orange sandy soil (laterite), one tile = 10 m
  ctx.fillStyle = '#c47a48'; ctx.fillRect(0, 0, W, H);
  const blotch = ['rgba(150,82,46,0.38)', 'rgba(226,160,106,0.32)', 'rgba(176,96,56,0.38)', 'rgba(214,138,84,0.30)', 'rgba(120,70,44,0.26)'];
  for (let i = 0; i < 60; i++) wrapBlob(ctx, W, H, rnd() * W, rnd() * H, 30 + rnd() * 90, blotch[(rnd() * blotch.length) | 0]);
  for (let i = 0; i < 14000; i++) {                   // fine grains
    const v = rnd(); ctx.fillStyle = v < 0.5 ? `rgba(${120 + rnd() * 40},${64 + rnd() * 24},${36 + rnd() * 18},0.40)` : `rgba(${226 + rnd() * 24},${160 + rnd() * 30},${110 + rnd() * 30},0.34)`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.8, 1 + rnd() * 1.8);
  }
  for (let i = 0; i < 140; i++) {                     // small pale stones
    const x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 2.2;
    ctx.fillStyle = `rgba(${200 + rnd() * 40},${170 + rnd() * 30},${140 + rnd() * 30},0.55)`; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, 6.2832); ctx.fill();
  }
}
function paintAsphalt(ctx, W, H, rnd) {               // one tile = 4 m along the road, full road width across
  ctx.fillStyle = '#3a3d42'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 34; i++) wrapBlob(ctx, W, H, rnd() * W, rnd() * H, 60 + rnd() * 160, rnd() < 0.5 ? 'rgba(18,20,24,0.28)' : 'rgba(84,86,92,0.22)');
  for (const f of [0.30, 0.70]) {                     // darker, polished wheel paths
    const g = ctx.createLinearGradient(0, H * f - 90, 0, H * f + 90);
    g.addColorStop(0, 'rgba(10,10,12,0)'); g.addColorStop(0.5, 'rgba(10,10,12,0.30)'); g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H * f - 90, W, 180);
  }
  for (let i = 0; i < 16000; i++) { const v = 60 + rnd() * 90; ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + rnd() * 0.4})`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  ctx.lineCap = 'round';                              // hairline cracks
  for (let i = 0; i < 12; i++) {
    let x = rnd() * W, y = rnd() * H; ctx.strokeStyle = 'rgba(8,8,10,0.65)'; ctx.lineWidth = 0.8 + rnd() * 1.4; ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.3) * 40; y += (rnd() - 0.5) * 26; ctx.lineTo(x, y); } ctx.stroke();
  }
  ctx.fillStyle = '#e9e4cc';                          // centre dashes + solid edge lines
  ctx.fillRect(W * 0.09, H / 2 - 11, W * 0.45, 22);
  ctx.globalAlpha = 0.88; ctx.fillRect(0, 66, W, 18); ctx.fillRect(0, H - 84, W, 18); ctx.globalAlpha = 1;
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(${52 + rnd() * 16},${55 + rnd() * 16},${60 + rnd() * 16},${0.45 + rnd() * 0.4})`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }   // worn paint
}
function paintPavers(ctx, W, H, rnd) {                // 4 x 4 paving slabs per tile
  ctx.fillStyle = '#86837a'; ctx.fillRect(0, 0, W, H);
  const n = 4, tw = W / n, th = H / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 168 + rnd() * 28; ctx.fillStyle = `rgb(${v},${v - 4},${v - 12})`; ctx.fillRect(i * tw + 3, j * th + 3, tw - 6, th - 6);
  }
  for (let i = 0; i < 4000; i++) { const v = 120 + rnd() * 90; ctx.fillStyle = `rgba(${v},${v - 3},${v - 10},0.35)`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
}
function paintTuft(ctx, S, rnd) {                     // a clump of grass blades on a transparent card
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const x0 = S * (0.3 + rnd() * 0.4), lean = (rnd() - 0.5) * S * 0.5, h = S * (0.5 + rnd() * 0.45), w = 3 + rnd() * 4;
    ctx.fillStyle = `rgb(${70 + rnd() * 50},${120 + rnd() * 55},${40 + rnd() * 30})`;
    ctx.beginPath(); ctx.moveTo(x0 - w, S); ctx.quadraticCurveTo(x0, S - h * 0.6, x0 + lean, S - h); ctx.quadraticCurveTo(x0 + w * 0.2, S - h * 0.5, x0 + w, S); ctx.fill();
  }
}

// ---------------- Where the grass grows ----------------
// One value per spot of the world: 255 = grass, 0 = bare sand. Made from smooth random noise (so the edges look natural),
// pushed towards sand beside the road and around the buildings, and towards grass at the edges of the world.
function makeGrassMask(w, h, clear, roadMid, roadHalf, rnd) {
  const N = 64, lat = [0, 1, 2, 3].map(() => { const a = new Float32Array(N * N); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; });
  const vn = (g, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (i, j) => g[((j & 63) << 6) | (i & 63)];
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const data = new Uint8Array(w * h), canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const Z = (j + 0.5) / h * WORLD_H;
    for (let i = 0; i < w; i++) {
      const X = (i + 0.5) / w * WORLD_W;
      let n = 0.52 * vn(lat[0], X / 15, Z / 15) + 0.28 * vn(lat[1], X / 5.5, Z / 5.5) + 0.14 * vn(lat[2], X / 1.8, Z / 1.8) + 0.06 * vn(lat[3], X / 0.5, Z / 0.5);
      n -= 0.40 * (1 - ss(0, 6, Math.abs(Z - roadMid) - roadHalf));                       // sandy shoulders beside the road
      let nearest = 99;
      for (const r of clear) nearest = Math.min(nearest, Math.hypot(Math.max(r.x0 - X, 0, X - r.x1), Math.max(r.z0 - Z, 0, Z - r.z1)));
      n -= 0.42 * (1 - ss(0, 5, nearest));                                                  // bare ground around buildings
      n += 0.40 * (1 - ss(0, 6, Math.min(X, WORLD_W - X, Z, WORLD_H - Z)));                 // grass at the world edge, so it meets the horizon
      const g = Math.round(255 * ss(0.46, 0.53, n)), k = (j * w + i);
      data[k] = g; img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = g; img.data[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { data, w, h, canvas, at: (x, z) => data[Math.min(h - 1, Math.max(0, (z / WORLD_H * h) | 0)) * w + Math.min(w - 1, Math.max(0, (x / WORLD_W * w) | 0))] / 255 };
}

// ---------------- Login / sign-up / choose character ----------------

const configured = !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = id => document.getElementById(id);
const authBox = $('auth'), authMsg = $('authMsg'), authEmail = $('authEmail'), authPass = $('authPass');
function say(text) { authMsg.textContent = text; }
function showPanel(id) { for (const p of ['pLanding', 'pSignup', 'pChoose']) $(p).style.display = p === id ? 'flex' : 'none'; authBox.classList.toggle('choosing', id === 'pChoose'); say(''); }

let gameStarted = false;
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  stopPreview();
  authBox.style.display = 'none';
  new World($('game'));
}
// A player with no saved choice on this device picks a character first.
function afterLogin() { if (FREE_IDS.includes(localStorage.getItem('characterId'))) startGame(); else openChoose(); }   // a saved character that is no longer in characters.json sends the player to the choose screen

$('btnCreate').addEventListener('click', () => showPanel('pSignup'));
$('btnBack').addEventListener('click', () => showPanel('pLanding'));

$('btnSignup').addEventListener('click', async () => {
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  say('Creating account...');
  const { data, error } = await sb.auth.signUp({ email: authEmail.value.trim(), password: authPass.value });
  if (error) return say(error.message);
  if (!data.session) return say('Account created. Check your email to confirm, then log in.');
  openChoose();
});

$('btnLogin').addEventListener('click', async () => {
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  say('Logging in...');
  const { error } = await sb.auth.signInWithPassword({ email: authEmail.value.trim(), password: authPass.value });
  if (error) return say(error.message);
  afterLogin();
});

async function boot() {
  // small build tag in the corner, so you can see at once whether the newest game.js is the one running
  const tag = document.createElement('div'); tag.textContent = 'build 2026-10-08 clothes-1';
  tag.style.cssText = 'position:fixed;left:8px;bottom:4px;z-index:99;font:11px sans-serif;color:#7f8c8d;pointer-events:none';
  document.body.appendChild(tag); window.__buildTag = tag;
  authBox.style.display = 'flex'; showPanel('pLanding');
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  const { data } = await sb.auth.getSession();
  if (data.session) afterLogin();
}

// ---------------- Small helpers ----------------

function makeLabel(text, bg = 'rgba(0,0,0,0.6)', color = '#fff', size = 34) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${size}px Georgia, serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = size + 20;
  ctx.font = `${size}px Georgia, serif`;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = 0.0085;
  spr.scale.set(c.width * k, c.height * k, 1);
  return spr;
}

// Shows a red message at the top of the screen when a character or animation file fails to load.
function showLoadError(msg) {
  let box = document.getElementById('loadError');
  if (!box) {
    box = document.createElement('div'); box.id = 'loadError';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b00020;color:#fff;font:14px sans-serif;padding:8px 12px;white-space:pre-wrap';
    document.body.appendChild(box);
  }
  box.textContent += (box.textContent ? '\n' : '') + msg;
}

// ---------- The 3D character (player_female_01.glb: has a skeleton and idle / walk / run animations) ----------

// characters.json says which file belongs to which character id:
//   free     = playable, shown on the choose-your-character screen (all Mixamo .fbx)
//   premium  = shop characters (empty for now)
//   clothing = not playable, only used as an outfit source (clothing.js)
//   npc      = staff and officers (not playable)
// Every file ending in .fbx is loaded as a Mixamo character and animated with the shared animation files below.
const CHARACTER_FILES = {};
const CHARACTER_NAMES = {};   // the "name" of each character in characters.json
const FREE_IDS = [];          // the playable free characters, in the order of characters.json
try {
  const manifest = await (await fetch('characters.json')).json();
  for (const tier of ['free', 'premium', 'clothing', 'npc']) for (const c of manifest[tier] || []) {
    CHARACTER_FILES[c.id] = c.file; CHARACTER_NAMES[c.id] = c.name;
    if (tier === 'free') FREE_IDS.push(c.id);
  }
} catch (e) { console.error('characters.json could not be read:', e); }

const DEFAULT_CHARACTER = FREE_IDS[0] || 'female_emma';
if (!CHARACTER_FILES.female_ivory) CHARACTER_FILES.female_ivory = IVORY_FILE;   // Ivory, the NPC at the Immigration Office (nin.js)

// One animation set per gender (Mixamo: "FBX Binary", In Place, 30 fps). Every Mixamo character shares the same skeleton,
// so these files work for all characters of that gender.
const MIXAMO_ANIMS = {
  male:   { idle: 'animation/male/Idle.fbx',   walk: 'animation/male/Walking.fbx',   run: 'animation/male/Running.fbx' },
  female: { idle: 'animation/female/Idle.fbx', walk: 'animation/female/Walking.fbx', run: 'animation/female/Running.fbx' },
};

// The character the player picked (the choose-your-character screen will set this later).
function myCharacterId() { const id = localStorage.getItem('characterId'); return FREE_IDS.includes(id) ? id : DEFAULT_CHARACTER; }

// ---------- Mixamo animations (FBX) retargeted onto our own skeleton ----------
// Put the Mixamo files (download "FBX Binary", "Without Skin", 30 fps) in the animation/ folder.
// Any file that is missing is skipped and the old idle / walk / run inside the character .glb is used instead.
const MIXAMO_FILES = { idle: 'animation/Idle.fbx', walk: 'animation/Walking.fbx', run: 'animation/Running.fbx' };

// Mixamo bone name (without "mixamorig") -> our bone name from build_rig.py
const MIXAMO_TO_RIG = {
  Hips: 'Hips', Spine: 'Spine', Spine2: 'Chest', Neck: 'Neck', Head: 'Head',
  LeftArm: 'UpperArm_L', LeftForeArm: 'LowerArm_L', LeftHand: 'Hand_L',
  RightArm: 'UpperArm_R', RightForeArm: 'LowerArm_R', RightHand: 'Hand_R',
  LeftUpLeg: 'UpperLeg_L', LeftLeg: 'LowerLeg_L', LeftFoot: 'Foot_L',
  RightUpLeg: 'UpperLeg_R', RightLeg: 'LowerLeg_R', RightFoot: 'Foot_R',
};
const mixKey = n => n.replace(/^mixamorig:?/, '');

// Our bones have no rest rotation, so each Mixamo rotation is converted into world space
// (parent rest * rotation * inverse of own rest) and written onto the matching bone. Position tracks are dropped (in-place movement).
function retargetMixamo(fbx, name) {
  fbx.updateMatrixWorld(true);
  const bones = {};
  fbx.traverse(o => { if (o.isBone) bones[mixKey(o.name)] = o; });
  const src = [...fbx.animations].sort((x, y) => y.tracks.length - x.tracks.length || y.duration - x.duration)[0];
  if (!src) throw new Error('no animation in ' + name);
  const q = new THREE.Quaternion(), parentRest = new THREE.Quaternion(), restInv = new THREE.Quaternion();
  const tracks = [];
  for (const t of src.tracks) {
    const dot = t.name.lastIndexOf('.');
    const key = mixKey(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
    const bone = bones[key], target = MIXAMO_TO_RIG[key];
    if (!bone || !target || prop !== 'quaternion') continue;
    bone.getWorldQuaternion(restInv).invert();
    if (bone.parent) bone.parent.getWorldQuaternion(parentRest); else parentRest.identity();
    const v = Array.from(t.values);
    for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i).premultiply(parentRest).multiply(restInv); q.toArray(v, i); }
    tracks.push(new THREE.QuaternionKeyframeTrack(target + '.quaternion', Array.from(t.times), v));
  }
  return new THREE.AnimationClip(name, src.duration, tracks);
}

let mixamoClipsPromise = null;
function loadMixamoClips() {
  if (!mixamoClipsPromise) {
    const loader = new FBXLoader();
    mixamoClipsPromise = Promise.all(Object.entries(MIXAMO_FILES).map(([name, file]) =>
      loader.loadAsync(file).then(f => retargetMixamo(f, name)).catch(e => { console.warn('Mixamo clip skipped:', file, e); return null; })
    )).then(list => Object.fromEntries(list.filter(Boolean).map(c => [c.name, c])));
  }
  return mixamoClipsPromise;
}

// ---- loading a Mixamo character (.fbx) together with its gender's animation files ----
const fbxLoader = new FBXLoader();
const TARGET_HEIGHT = 1.75;   // only used if a character comes out a strange size
const hipsBone = root => { let h = null; root.traverse(o => { if (!h && o.isBone && /Hips$/.test(o.name)) h = o; }); return h; };

// ---- the stairs animations: ONE pair of files shared by males and females (they are in animation/, not in male/ or female/) ----
const STAIR_ANIMS = { stairsUp: 'animation/Walking Up The Stairs.fbx', stairsDown: 'animation/Descending Stairs.fbx' };
let stairLoad = null;
function loadStairClips() {
  if (!stairLoad) stairLoad = Promise.all(Object.entries(STAIR_ANIMS).map(([name, file]) =>
    fbxLoader.loadAsync(encodeURI(file)).then(fbx => {            // encodeURI: the file names have spaces in them
      const clip = [...fbx.animations].sort((a, b) => b.duration - a.duration || b.tracks.length - a.tracks.length)[0];
      if (!clip) throw new Error('no animation inside ' + file);
      const h = hipsBone(fbx);
      return { name, clip, hipsY: h ? h.position.y : 0, stairs: true, rest: restOf(fbx) };
    }).catch(e => {                                                // a missing file does not stop the game: the normal walk is used on the steps
      console.warn('Stairs animation missing or broken:', file, e);
      showLoadError('Stairs animation not loaded: ' + file + ' -> ' + (e && e.message ? e.message : String(e)));
      return null;
    })
  )).then(list => Object.fromEntries(list.filter(Boolean).map(a => [a.name, a])));
  return stairLoad;
}

const mixamoSetLoads = {};
const mixamoErrors = { male: [], female: [] };   // the real reason an animation file failed, shown in the red banner
function loadMixamoSet(gender) {
  if (!mixamoSetLoads[gender]) {
    mixamoSetLoads[gender] = Promise.all(Object.entries(MIXAMO_ANIMS[gender]).map(([name, file]) =>
      fbxLoader.loadAsync(file).then(fbx => {
        const clip = [...fbx.animations].sort((a, b) => b.duration - a.duration || b.tracks.length - a.tracks.length)[0];
        if (!clip) throw new Error('no animation inside ' + file);
        const h = hipsBone(fbx);
        return { name, clip, hipsY: h ? h.position.y : 0, rest: restOf(fbx) };
      }).catch(e => { console.warn('Animation file missing or broken:', file, e); mixamoErrors[gender].push(file + ' -> ' + (e && e.message ? e.message : String(e))); return null; })
    )).then(list => Object.fromEntries(list.filter(Boolean).map(a => [a.name, a])));
  }
  return mixamoSetLoads[gender];
}

// share of a texture that is see-through (looks at a small copy of the picture). A .jpg is never see-through; a .png may be.
async function emptyFraction(tex) {
  try {
    const img = tex.image; if (!img) return 0;
    if (img.decode) await img.decode().catch(() => {});
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 128, 128);
    const d = x.getImageData(0, 0, 128, 128).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 128) n++;
    return n / (128 * 128);
  } catch (e) { return 0; }
}

// Hair, lashes and brows are thin strands on a mostly empty picture (Elizabeth's hair picture is 94% empty). The graphics card shrinks
// the picture for far-away characters, and the strands fade below the cut-out limit, so the hair vanishes. This builds the shrunken
// copies by hand and boosts their see-through channel, so the same share of the picture stays solid at every size (the hair stays).
async function keepCutoutCoverage(tex, cutoff) {
  try {
    if (tex.userData.coverageKept) return;
    const img = tex.image; if (!img) return;
    if (img.decode) await img.decode().catch(() => {});
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    if (!w || !h || (w & (w - 1)) || (h & (h - 1))) return;               // power-of-two pictures only
    const make = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
    const lim = cutoff * 255;
    const share = d => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] >= lim) n++; return n / (d.length / 4); };
    const c0 = make(w, h); const x0 = c0.getContext('2d', { willReadFrequently: true }); x0.drawImage(img, 0, 0);
    const base = share(x0.getImageData(0, 0, w, h).data);
    if (base < 0.001) return;
    const raw = [c0], out = [c0];                                         // raw = plain shrunken copies, out = copies with boosted see-through channel
    let pw = w, ph = h;
    while (pw > 1 || ph > 1) {
      const nw = Math.max(1, pw >> 1), nh = Math.max(1, ph >> 1);
      const r = make(nw, nh), rx = r.getContext('2d', { willReadFrequently: true });
      rx.imageSmoothingEnabled = true; rx.imageSmoothingQuality = 'high'; rx.drawImage(raw[raw.length - 1], 0, 0, nw, nh);
      raw.push(r);
      const o = make(nw, nh), ox = o.getContext('2d', { willReadFrequently: true });
      const im = rx.getImageData(0, 0, nw, nh), d = im.data;
      let lo = 1, hi = 32;                                                // find the boost that keeps the same share of the picture solid
      for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] * m >= lim) n++; if (n / (nw * nh) < base) lo = m; else hi = m; }
      for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i] * hi);
      ox.putImageData(im, 0, 0); out.push(o);
      pw = nw; ph = nh;
    }
    tex.mipmaps = out; tex.generateMipmaps = false; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.userData.coverageKept = true; tex.needsUpdate = true;
  } catch (e) { console.warn('Hair coverage fix skipped:', e); }
}

// Some jeans have the "rips" painted into the picture as skin-coloured patches. Paint those patches in the denim colour.
// Only touches a texture that is mostly grey/dark with a small orange share (so skin, leather and hair are left alone).
async function repaintRips(tex) {
  try {
    const img = tex.image; if (!img || tex.userData.repainted) return;
    if (img.decode) await img.decode().catch(() => {});
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight; if (!w || !h) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const im = x.getImageData(0, 0, w, h), d = im.data;
    const isOrange = i => d[i + 3] > 128 && d[i] > 90 && d[i] - d[i + 2] > 28 && d[i] > d[i + 1] * 1.12;
    let orange = 0, other = 0, sr = 0, sg = 0, sb = 0, sat = 0;
    for (let i = 0; i < d.length; i += 16) {          // sample every 4th pixel
      if (d[i + 3] < 128) continue;
      if (isOrange(i)) orange++; else { other++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); }
    }
    const total = orange + other; if (!total || !other) return;
    const share = orange / total;
    if (share < 0.001 || share > 0.06 || sat / other > 40) return;   // not a grey garment with a few skin patches
    const R = sr / other, G = sg / other, B = sb / other;
    for (let i = 0; i < d.length; i += 4) if (isOrange(i)) { d[i] = R; d[i + 1] = G; d[i + 2] = B; }
    x.putImageData(im, 0, 0);
    tex.image = c; tex.userData.repainted = true; tex.needsUpdate = true;
  } catch (e) { /* leave the texture as it is */ }
}

async function loadMixamoCharacter(file) {
  const base = file.split('/').pop();
  const gender = base.startsWith('female') ? 'female' : 'male';
  const [fbx, set, stairClips] = await Promise.all([fbxLoader.loadAsync(file), loadMixamoSet(gender), loadStairClips()]);
  if (!set.idle) throw new Error('the ' + gender + ' idle animation could not be loaded. ' + mixamoErrors[gender].join(' | '));

  const hips = hipsBone(fbx);
  const charHipsY = hips ? hips.position.y : 0;

  // Mixamo files are in centimetres: shrink to metres (or fit to a normal height if the size looks wrong)
  fbx.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(fbx).getSize(new THREE.Vector3()).y || 170;
  let scale = 0.01;
  if (height * scale < 1.2 || height * scale > 2.4) scale = TARGET_HEIGHT / height;
  fbx.scale.setScalar(scale);
  fbx.updateMatrixWorld(true);
  fbx.position.y -= new THREE.Box3().setFromObject(fbx).min.y;   // feet on the ground

  // Materials: a texture that has a real see-through channel (a .png: hair, lashes, brows, tear lines, scalp) is cut out by it.
  // Everything else (the .jpg skin, tops, trousers, shoes) is drawn solid, whatever its see-through channel says.
  const mats = new Set();
  fbx.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => mats.add(m)); });
  // Mixamo names look like "m4_Legsmat": drop the "m4_" at the start and the "mat" at the end
  const plain = n => (n || '').replace(/^m\d+_/i, '').replace(/mat$/i, '');
  const matNames = [...mats].map(m => m.name || '');
  if (new URLSearchParams(location.search).get('names') === '1' && window.__buildTag) {
    window.__buildTag.style.cssText += ';white-space:normal;max-width:90vw;font-size:14px;color:#fff;background:#000a;padding:4px';
    window.__buildTag.textContent = 'materials: ' + matNames.join(', ');
  }
  const forcedCutout = new URLSearchParams(location.search).get('cutout') === '1';
  await Promise.all([...mats].map(async m => {
    if (m.isMeshPhongMaterial) { m.shininess = 8; m.specular.setScalar(0.08); }
    const name = plain(m.name);
    const isHair = /hair|lash|brow|scalp|beard|tear|occlusion|reflection|transparency/i.test(name);
    // some jeans have the "rips" painted into the picture as skin-coloured patches: only trousers get that repaint
    if (m.map && /jean|denim|short|pant|trouser/i.test(name)) await repaintRips(m.map);
    const empty = m.map ? await emptyFraction(m.map) : 0;
    const cutout = forcedCutout || empty > 0.01;
    const cutoff = isHair ? 0.3 : 0.5;
    m.opacity = 1; m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide;
    m.alphaTest = cutout ? cutoff : 0;
    m.alphaToCoverage = cutout;                                           // soft edges (the game draws with antialiasing)
    if (!cutout) m.alphaMap = null;
    if (cutout && m.map) await keepCutoutCoverage(m.map, cutoff);
    m.needsUpdate = true;
  }));

  // Keep the turning of every bone, and the up-and-down bounce of the hips (scaled to this character's size).
  const animations = Object.values({ ...set, ...stairClips }).map(a => {
    const ratio = a.hipsY && charHipsY ? charHipsY / a.hipsY : 1;
    const tracks = [];
    for (const t of a.clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      if (prop === 'quaternion') tracks.push(t);
      else if (prop === 'position' && /Hips$/.test(bone)) {
        let v = Array.from(t.values, x => x * ratio);
        if (a.stairs) {
          // A stairs clip may carry the climb itself in the hips (the hips drift forward / upward during the clip). The game already moves
          // and lifts the character, so take that drift out: the hips only keep their small up-and-down bounce and the clip loops cleanly.
          const n = t.times.length, T = (t.times[n - 1] - t.times[0]) || 1;
          for (let k = 0; k < n; k++) {
            const f = (t.times[k] - t.times[0]) / T;
            for (let c = 0; c < 3; c++) v[k * 3 + c] = (t.values[k * 3 + c] - (t.values[(n - 1) * 3 + c] - t.values[c]) * f) * ratio;
          }
        }
        tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), v));
      }
    }
    return new THREE.AnimationClip(a.name, a.clip.duration, tracks);
  });

  const scene = new THREE.Group();
  scene.add(fbx);
  return { scene, animations, mixamoNative: true };
}

// ---------- Mixamo-rigged .glb characters (file name ends in _mixamo.glb) ----------
// These have the Mixamo skeleton (mixamorig:Hips ...) but were exported from Blender, so their bones are turned differently from the
// Mixamo .fbx files. Every animation rotation is therefore re-aimed bone by bone:  q_glb = (parentRest_glb^-1 * parentRest_fbx) * q_fbx * (rest_fbx^-1 * rest_glb)
// where "rest" is the bone's rotation in the T-pose, in world space. The hips only keep their up-and-down bounce.
const GLB_TARGET_HEIGHT = 1.68;   // metres: these .glb characters are exported small, so they are scaled to a normal height

// world-space T-pose rotation of every bone (and of its parent), keyed by the Mixamo name without "mixamorig"
function restOf(root) {
  root.updateMatrixWorld(true);
  const out = {};
  root.traverse(o => {
    if (!o.isBone) return;
    const w = new THREE.Quaternion(), pw = new THREE.Quaternion();
    o.getWorldQuaternion(w);
    if (o.parent) o.parent.getWorldQuaternion(pw);
    out[mixKey(o.name)] = { name: o.name, w, pw };
  });
  return out;
}

async function loadMixamoGlbCharacter(file) {
  const base = file.split('/').pop();
  const gender = base.startsWith('female') ? 'female' : 'male';
  const [gltf, set, stairClips] = await Promise.all([new GLTFLoader().loadAsync(file), loadMixamoSet(gender), loadStairClips()]);
  if (!set.idle) throw new Error('the ' + gender + ' idle animation could not be loaded. ' + mixamoErrors[gender].join(' | '));
  const model = gltf.scene;

  // the embedded T-pose animation is not used: the shared Mixamo clips below replace it
  model.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y || 1;
  model.scale.setScalar(GLB_TARGET_HEIGHT / height);
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;   // feet on the ground
  model.updateMatrixWorld(true);

  // materials: same treatment as the .fbx characters (hair / lashes / brows are cut out by their see-through channel, the rest is solid)
  const mats = new Set();
  model.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => mats.add(m)); });
  const plainName = n => (n || '').replace(/^m\d+_/i, '').replace(/mat$/i, '');
  await Promise.all([...mats].map(async m => {
    const isHair = /hair|lash|brow|scalp|beard|tear|occlusion|reflection|transparency/i.test(plainName(m.name));
    const empty = m.map ? await emptyFraction(m.map) : 0;
    const cutout = empty > 0.01;
    const cutoff = isHair ? 0.3 : 0.5;
    m.opacity = 1; m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide;
    m.alphaTest = cutout ? cutoff : 0;
    m.alphaToCoverage = cutout;
    if (!cutout) m.alphaMap = null;
    if (cutout && m.map) await keepCutoutCoverage(m.map, cutoff);
    m.needsUpdate = true;
  }));

  // bones of this character
  const mine = restOf(model);
  const hips = mine.Hips && model.getObjectByName(mine.Hips.name);
  const hipsWorld = new THREE.Vector3(); if (hips) hips.getWorldPosition(hipsWorld);
  const hipsParentInv = new THREE.Matrix4(); if (hips && hips.parent) hipsParentInv.copy(hips.parent.matrixWorld).invert();
  const hipsHeight = hipsWorld.y;                       // metres above the ground

  const qs = new THREE.Quaternion(), cp = new THREE.Quaternion(), cb = new THREE.Quaternion(), tmp = new THREE.Vector3();
  const animations = Object.values({ ...set, ...stairClips }).map(a => {
    const tracks = [];
    for (const t of a.clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const key = mixKey(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
      const src = a.rest && a.rest[key], dst = mine[key];
      if (!src || !dst) continue;
      if (prop === 'quaternion') {
        cp.copy(dst.pw).invert().multiply(src.pw);        // parentRest_glb^-1 * parentRest_fbx
        cb.copy(src.w).invert().multiply(dst.w);          // rest_fbx^-1 * rest_glb
        const v = Array.from(t.values);
        for (let i = 0; i < v.length; i += 4) { qs.fromArray(v, i); qs.premultiply(cp).multiply(cb); qs.toArray(v, i); }
        tracks.push(new THREE.QuaternionKeyframeTrack(dst.name + '.quaternion', Array.from(t.times), v));
      } else if (prop === 'position' && key === 'Hips' && hips && a.hipsY) {
        // keep only the bounce: height as a share of the standing hip height, taken to this character's hip height
        const n = t.times.length, T = (t.times[n - 1] - t.times[0]) || 1;
        const v = new Array(n * 3);
        for (let k = 0; k < n; k++) {
          let y = t.values[k * 3 + 1];
          if (a.stairs) { const f = (t.times[k] - t.times[0]) / T; y -= (t.values[(n - 1) * 3 + 1] - t.values[1]) * f; }   // take the climb out of the stairs clips
          tmp.set(hipsWorld.x, hipsWorld.y + hipsHeight * (y / a.hipsY - 1), hipsWorld.z).applyMatrix4(hipsParentInv);
          tmp.toArray(v, k * 3);
        }
        tracks.push(new THREE.VectorKeyframeTrack(dst.name + '.position', Array.from(t.times), v));
      }
    }
    return new THREE.AnimationClip(a.name, a.clip.duration, tracks);
  });

  const scene = new THREE.Group();
  scene.add(model);
  return { scene, animations, mixamoNative: true };
}

const characterLoads = new Map();
function loadCharacterFile(file) {
  if (!characterLoads.has(file)) characterLoads.set(file, /\.fbx$/i.test(file)
    ? loadMixamoCharacter(file)
    : /_mixamo\.glb$/i.test(file) ? loadMixamoGlbCharacter(file)
    : new Promise((ok, fail) => new GLTFLoader().load(file, ok, undefined, fail)));
  return characterLoads.get(file);
}

// Returns an empty holder straight away; the character appears inside it once the file has loaded.
function makeAvatar(shirt, characterId) {
  const holder = new THREE.Group();
  applyCharacter(holder, shirt, characterId);
  return holder;
}

// Puts (or swaps) the character model inside a holder. Safe to call again when a player changes character.
// If a character file cannot load, a red message names the file (no fallback character).
function applyCharacter(holder, shirt, characterId) {
  const u = holder.userData;
  const token = (u.charToken = (u.charToken || 0) + 1);
  u.characterId = characterId;
  const file = CHARACTER_FILES[characterId] || CHARACTER_FILES[DEFAULT_CHARACTER];
  loadCharacterFile(file).then(gltf => {
    if (u.charToken !== token) return;
    if (u.model) holder.remove(u.model);
    const model = cloneSkinned(gltf.scene);
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    holder.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    gltf.animations.forEach(c => { actions[c.name] = mixer.clipAction(c); });
    // test link: add ?pose=walk, ?pose=run, ?pose=idle or ?pose=tpose to the web address to see one pose only
    const pose = new URLSearchParams(location.search).get('pose');
    if (pose === 'tpose') { /* no animation: the plain T-pose */ }
    else if (pose && actions[pose]) actions[pose].play();
    else {
      actions.idle.play();
      if (u.freeze) { mixer.update(0); actions.idle.paused = true; }   // the select screen shows the calm first frame
    }
    Object.assign(u, { model, mixer, actions, state: 'idle' });
    // swap in the Mixamo clips as soon as they have loaded (the .glb clips above are the fallback)
    if (!gltf.mixamoNative) loadMixamoClips().then(clips => {
      if (u.charToken !== token || u.mixer !== mixer) return;
      for (const [name, clip] of Object.entries(clips)) {
        const old = u.actions[name], a = mixer.clipAction(clip);
        if (old) old.stop();
        u.actions[name] = a;
        if (pose === 'tpose') continue;
        if (pose ? pose === name : u.state === name) {
          a.play();
          if (name === 'idle' && u.freeze) { mixer.update(0); a.paused = true; }
        }
      }
    });
  }).catch(err => {
    console.error('Could not load character file:', file, err);
    showLoadError('Could not load ' + file + ': ' + (err && err.message ? err.message : 'file not found (check the name and capital letters)'));
  });
}

// ---- the choose-your-character screen: a live 3D preview ----
const pick = { gender: 'female', id: null };
let pv = null;

function resizePreview() {
  if (!pv) return;
  const r = pv.stage.getBoundingClientRect();
  const w = Math.max(Math.floor(r.width), 100), h = Math.max(Math.floor(r.height), 100);
  pv.renderer.setSize(w, h, false);
  pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
}
function startPreview() {
  if (pv) return;
  const cv = $('prev');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 3); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 0.9, 0);
  const holder = new THREE.Group(); scene.add(holder);
  holder.userData.freeze = true;
  pv = { renderer, scene, cam, holder, stage: $('stage'), clock: new THREE.Clock(), run: true };
  resizePreview();
  addEventListener('resize', resizePreview);
  (function loop() {
    if (!pv || !pv.run) return;
    const dt = pv.clock.getDelta();
    holder.rotation.y += dt * 0.6;
    if (holder.userData.mixer) holder.userData.mixer.update(dt);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })();
}
function stopPreview() { if (pv) { pv.run = false; removeEventListener('resize', resizePreview); pv.renderer.dispose(); pv = null; } }

function listFree(gender) { return FREE_IDS.filter(id => id.startsWith(gender + '_') && CHARACTER_FILES[id]); }
function choose(id) {
  pick.id = id;
  [...$('cards').children].forEach(c => c.classList.toggle('on', c.dataset.id === id));
  applyCharacter(pv.holder, 0xffffff, id);
}
function showGender(gender) {
  pick.gender = gender;
  $('tabMale').classList.toggle('on', gender === 'male'); $('tabFemale').classList.toggle('on', gender === 'female');
  const box = $('cards'); box.innerHTML = '';
  listFree(gender).forEach(id => {
    const b = document.createElement('button'); b.className = 'card'; b.dataset.id = id; b.textContent = CHARACTER_NAMES[id] || id;
    b.addEventListener('click', () => choose(id)); box.appendChild(b);
  });
  const first = listFree(gender)[0]; if (first) choose(first);
}
function openChoose() {
  showPanel('pChoose'); startPreview(); resizePreview();
  const hasMale = listFree('male').length > 0;                 // no free male characters at the moment: hide the Male tab
  $('tabMale').style.display = hasMale ? '' : 'none';
  showGender(hasMale ? pick.gender : 'female');
}
$('tabMale').addEventListener('click', () => showGender('male'));
$('tabFemale').addEventListener('click', () => showGender('female'));
$('btnPlay').addEventListener('click', () => {
  if (!pick.id) return;
  localStorage.setItem('characterId', pick.id);
  startGame();
});

function animateAvatar(av, speed, dt) {
  const u = av.userData;
  if (!u.mixer) return;
  let want = speed < 0.3 ? 'idle' : speed < 2.5 ? 'walk' : 'run';
  // Step 2: on the steps (u.stairDir is set every frame by updateElevation: 1 = going up, -1 = coming down) play the stairs animation.
  // Characters without stairs clips (the old .glb ones) just keep walking.
  if (u.stairDir && speed >= 0.3) { const sa = u.stairDir > 0 ? 'stairsUp' : 'stairsDown'; if (u.actions[sa]) want = sa; }
  if (want !== u.state) {
    const next = u.actions[want], prev = u.actions[u.state];
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, 0.25, false);
    u.state = want;
  }
  if (want === 'walk') u.actions.walk.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.5, 1.6);
  if (want === 'run') u.actions.run.timeScale = THREE.MathUtils.clamp(speed / 3.6, 0.8, 1.6);
  if (want === 'stairsUp' || want === 'stairsDown') u.actions[want].timeScale = THREE.MathUtils.clamp(speed / STAIR_ANIM_SPEED, 0.7, 1.6);
  u.mixer.update(dt);
}

// Step 2: lifts a character to the floor height under it (grass 0, steps rising, school floor) and works out whether it is
// climbing or descending. Used for you and for every other player (their height is worked out from x and z, nothing extra is sent).
function updateElevation(av, x, z, dt) {
  const u = av.userData, y = groundHeight(x, z, u);   // Step 4: u.level (0 downstairs, 1 upstairs) is kept up to date by groundHeight
  const vy = u.lastY === undefined ? 0 : (y - u.lastY) / Math.max(dt, 0.001);
  u.lastY = y;
  av.position.y = y;
  const th = u.stairDir ? 0.05 : 0.2;                  // a little hysteresis, so the animation does not flicker at the ends
  u.stairDir = vy > th ? 1 : vy < -th ? -1 : 0;
}

function turnTowards(obj, angle, dt) {
  let d = angle - obj.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  obj.rotation.y += d * Math.min(1, dt * 12);
}

// ---------------- The world ----------------

class World {
  constructor(parent) {
    this.progress = 'arrived';
    this.devTools = false;
    this.others = new Map();
    this.myId = null;
    this.lastSent = 0;
    this.boxes = [];            // solid rectangles {x0,x1,z0,z1}
    this.animators = [];        // functions run every frame (waving flags)
    this.keys = {};
    this.stick = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0 };
    this.cam = { yaw: -Math.PI / 2, pitch: 0.42, dist: 9 };
    this.look = null;
    this.clock = new THREE.Clock();

    this.initThree(parent);
    this.buildGround();
    this.buildBorder();
    BUILDINGS.forEach(b => this.addBuilding(b));
    this.buildPlayer();
    this.buildHud();
    this.initMinimap();
    this.bindInput();
    this.applyGate();
    try {                                // the NIN card quest: Ivory, the form, the wait, the card (nin.js)
      this.nin = initNin({ world: this, building: BUILDINGS.find(b => b.key === 'immigration'), makeAvatar, animateAvatar });
    } catch (e) { console.error('NIN quest could not start:', e); this.nin = null; }
    try {                                // clothing test: put one character's outfit on another (clothing.js)
      this.clothing = initClothing({
        world: this,
        applyCharacter: id => applyCharacter(this.player, 0x2c6e9b, id),
        loadSource: id => loadCharacterFile(CHARACTER_FILES[id]),
        characters: FREE_IDS,                                   // the test button cycles through these
      });
    } catch (e) { console.error('Clothing could not start:', e); this.clothing = null; }
    this.connect();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ----- three.js setup -----
  initThree(parent) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;   // cinematic contrast instead of flat colours
    this.renderer.toneMappingExposure = 1.05;
    parent.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    { // sky: deep blue at the top fading to a warm haze at the horizon
      const c = document.createElement('canvas'); c.width = 2; c.height = 256;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#2f6fc0'); gr.addColorStop(0.55, '#8fc2ea'); gr.addColorStop(1, '#f3dcb8');
      g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
      const sky = new THREE.CanvasTexture(c); sky.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = sky;
    }
    this.scene.fog = new THREE.Fog(0xd5d9d6, 60, 200);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5a45, 0.9));
    this.sun = new THREE.DirectionalLight(0xffe2b0, 2.6);   // warmer, stronger sun = visible shadows and depth
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  // ----- ground, road, border wall and gate -----
  buildGround() {
    const rnd = makeRng(1337);
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tex = (w, h, paint, rx, ry, srgb = true) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h, rnd);
      const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = aniso; return t;
    };
    const cz = (ROAD_Z0 + ROAD_Z1) / 2, roadW = ROAD_Z1 - ROAD_Z0;

    // Keep-clear boxes around the buildings (no grass clumps there, and the ground is bare sand)
    const clear = BUILDINGS.map(b => { const [w, , d] = b.fallback || [20, 0, 20]; return { x0: b.x - w / 2 - 2, x1: b.x + w / 2 + 2, z0: b.z - d / 2 - 2, z1: b.z + d / 2 + 2 }; }).concat(cityClearRects());

    // Ground = red sand (10 m tiles) mixed with grass (10 m tiles). A map of the whole world says where each one shows.
    const sand = tex(512, 512, paintSand, WORLD_W / 10, WORLD_H / 10);
    const grass = tex(512, 512, paintGrass, WORLD_W / 10, WORLD_H / 10);
    const mask = makeGrassMask(1024, Math.round(1024 * WORLD_H / WORLD_W), clear, cz, roadW / 2, rnd);
    const maskTex = new THREE.CanvasTexture(mask.canvas); maskTex.anisotropy = aniso;
    const groundMat = new THREE.MeshStandardMaterial({ map: sand, bumpMap: sand, bumpScale: 0.6, roughness: 1 });
    groundMat.onBeforeCompile = sh => {
      sh.uniforms.tGrass = { value: grass }; sh.uniforms.tMask = { value: maskTex }; sh.uniforms.uRep = { value: new THREE.Vector2(WORLD_W / 10, WORLD_H / 10) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tMask;\nuniform vec2 uRep;')
        .replace('#include <map_fragment>', `
          float grassAmt = texture2D(tMask, vMapUv / uRep).r;
          diffuseColor *= mix(texture2D(map, vMapUv), texture2D(tGrass, vMapUv), grassAmt);`);
    };
    groundMat.customProgramCacheKey = () => 'sand-grass-ground';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD_W / 2, -0.04, WORLD_H / 2); ground.receiveShadow = true; this.scene.add(ground);

    // Beyond the world edge: more ground so the horizon is not a cliff
    const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x6b8348, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(WORLD_W / 2, -0.08, WORLD_H / 2); this.scene.add(far);

    // Asphalt road with worn lane markings baked in (one tile = 4 m of road)
    const asphalt = tex(1024, 896, paintAsphalt, WORLD_W / 4, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, roadW), new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphalt, bumpScale: 0.5, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2; road.position.set(WORLD_W / 2, -0.02, cz); road.receiveShadow = true; this.scene.add(road);

    // Pavements + kerbs on both sides of the road (flat enough that walking is unaffected)
    const pave = tex(512, 512, paintPavers, WORLD_W / 2, 0.8);
    const paveMat = new THREE.MeshStandardMaterial({ map: pave, bumpMap: pave, bumpScale: 0.5, roughness: 0.95 });
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xaaa79f, roughness: 0.9 });
    // (the pavement and kerb are cut into pieces so the city avenues can join the main road)
    const pieces = []; { let a = 0; JUNCTION_GAPS_X.forEach(([g0, g1]) => { pieces.push([a, g0]); a = g1; }); pieces.push([a, WORLD_W]); }
    [-1, 1].forEach(side => {
      const edge = side < 0 ? ROAD_Z0 : ROAD_Z1;
      pieces.forEach(([x0, x1]) => {
        const len = x1 - x0, mx = (x0 + x1) / 2;
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.15), kerbMat);
        kerb.position.set(mx, 0.03, edge + side * 0.075); kerb.receiveShadow = true; this.scene.add(kerb);
        const pm = pave.clone(); pm.needsUpdate = true; pm.repeat.set(len / 2, 0.8);
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.6), new THREE.MeshStandardMaterial({ map: pm, bumpMap: pm, bumpScale: 0.5, roughness: 0.95 }));
        walk.rotation.x = -Math.PI / 2; walk.position.set(mx, -0.01, edge + side * (0.15 + 0.8)); walk.receiveShadow = true; this.scene.add(walk);
      });
    });

    // Grass tufts: two crossed cards per clump, 1 draw call each, kept away from the road and the buildings
    const tc = document.createElement('canvas'); tc.width = tc.height = 128; paintTuft(tc.getContext('2d'), 128, rnd);
    const tuftTex = new THREE.CanvasTexture(tc); tuftTex.colorSpace = THREE.SRGBColorSpace; tuftTex.anisotropy = aniso;
    const tuftMat = new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    const spots = [];
    for (let tries = 0; spots.length < 5500 && tries < 60000; tries++) {
      const x = rnd() * WORLD_W, z = rnd() * WORLD_H;
      const gm = mask.at(x, z); if (rnd() > gm * gm + 0.03) continue;           // thick on the grass, a few stray ones on the sand
      if (z > ROAD_Z0 - 2.4 && z < ROAD_Z1 + 2.4) continue;
      if (Math.abs(x - GATE_X) < 1) continue;
      if (clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
      spots.push([x, z]);
    }
    [0, Math.PI / 2].forEach(rot => {
      const g = new THREE.PlaneGeometry(0.5, 0.4).translate(0, 0.2, 0).rotateY(rot);
      const im = new THREE.InstancedMesh(g, tuftMat, spots.length), m = new THREE.Object3D(), col = new THREE.Color();
      spots.forEach(([x, z], i) => {
        const s = 0.7 + rnd() * 0.9; m.position.set(x, -0.04, z); m.rotation.y = rnd() * 3.14; m.scale.set(s, s * (0.8 + rnd() * 0.5), s); m.updateMatrix();
        im.setMatrixAt(i, m.matrix); const t = 0.75 + rnd() * 0.4; im.setColorAt(i, col.setRGB(t, t, t * 0.9));
      });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; this.scene.add(im);
    });

    this.addGrassClumps(mask, clear, rnd).catch(e => console.warn('grass clumps not added', e));
  }

  // Your grass models (grass_04, realistics_grass_06, realistics_grass_10), planted only on the grassy parts of the ground.
  // They are cut into 16 m squares so the phone only draws the squares near the player.
  async addGrassClumps(mask, clear, rnd) {
    const KINDS = [['grass_clump_a', 120, 0.9, 1.5], ['grass_clump_b', 20, 0.8, 1.3], ['grass_clump_c', 16, 0.8, 1.3]];   // prop, how many, smallest and biggest scale
    const CELL = 16;
    this.grassChunks = [];
    for (const [name, count, s0, s1] of KINDS) {
      let model;
      try { model = await loadProp(name); } catch (e) { console.warn('grass prop missing: ' + name, e); continue; }
      model.updateMatrixWorld(true);
      const parts = [];
      model.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material }); });
      const cells = new Map();
      for (let tries = 0, got = 0; got < count && tries < count * 60; tries++) {
        const x = rnd() * WORLD_W, z = rnd() * WORLD_H;
        if (mask.at(x, z) < 0.8) continue;
        if (z > ROAD_Z0 - 2.4 && z < ROAD_Z1 + 2.4) continue;
        if (Math.abs(x - GATE_X) < 1.5) continue;
        if (clear.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
        const key = ((x / CELL) | 0) + ',' + ((z / CELL) | 0);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push([x, z]); got++;
      }
      cells.forEach((list, key) => {
        const [ci, cj] = key.split(',').map(Number), m = new THREE.Object3D(), col = new THREE.Color();
        parts.forEach(({ geo, mat }) => {
          const im = new THREE.InstancedMesh(geo, mat, list.length);
          list.forEach(([x, z], i) => {
            const sc = s0 + rnd() * (s1 - s0); m.position.set(x, -0.04, z); m.rotation.set(0, rnd() * 6.283, 0); m.scale.set(sc, sc * (0.85 + rnd() * 0.4), sc); m.updateMatrix();
            im.setMatrixAt(i, m.matrix); const t = 0.8 + rnd() * 0.3; im.setColorAt(i, col.setRGB(t, t, t * 0.92));
          });
          im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
          if (im.computeBoundingSphere) im.computeBoundingSphere();
          this.scene.add(im);
          this.grassChunks.push({ mesh: im, cx: (ci + 0.5) * CELL, cz: (cj + 0.5) * CELL });
        });
      });
    }
  }

  buildBorder() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.9 });
    const H = 3.6, T = 0.5, gx = GATE_X;
    const seg = (z0, z1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(T, H, z1 - z0), wallMat);
      m.position.set(gx + T / 2 - 0.2, H / 2, (z0 + z1) / 2);
      m.castShadow = m.receiveShadow = true; this.scene.add(m);
      this.boxes.push({ x0: gx - 0.2, x1: gx - 0.2 + T, z0, z1 });
    };
    seg(0, ROAD_Z0 - 0.6);
    seg(ROAD_Z1 + 0.6, WORLD_H);

    // The arrival area (refugee camp, immigration office, airport) ends at a wall; everything south of it is not part of the map.
    { const wz = CITY.arrivalWallZ, m = new THREE.Mesh(new THREE.BoxGeometry(gx, H, T), wallMat);
      m.position.set(gx / 2, H / 2, wz + T / 2); m.castShadow = m.receiveShadow = true; this.scene.add(m);
      this.boxes.push({ x0: 0, x1: gx, z0: wz, z1: wz + T }); }

    // The city east of the gate: roads, junctions, lamps, palms and the empty, labelled building plots (city.js)
    this.city = buildCity(loadProp); this.scene.add(this.city.group);

    // Checkpoint barrier in the road gap: closed until the server says progress = indigene
    this.gateGroup = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
    const gz0 = ROAD_Z0 - 0.6, gz1 = ROAD_Z1 + 0.6, n = 8, step = (gz1 - gz0) / n;
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, step), i % 2 ? white : red);
      b.position.set(gx + 0.05, 1.0, gz0 + step * (i + 0.5)); b.castShadow = true; this.gateGroup.add(b);
    }
    [gz0 + 0.1, gz1 - 0.1].forEach(z => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), wallMat);
      p.position.set(gx + 0.05, 1.1, z); p.castShadow = true; this.gateGroup.add(p);
    });
    this.gateLabel = makeLabel('Locked: finish immigration', '#7a2418', '#ffd9d4', 34);
    this.gateLabel.position.set(gx - 0.3, 3.0, (ROAD_Z0 + ROAD_Z1) / 2);
    this.gateGroup.add(this.gateLabel);
    this.scene.add(this.gateGroup);
    this.gateBox = { x0: gx - 0.2, x1: gx + 0.3, z0: gz0, z1: gz1 };
    this.gateClosed = true;
  }

  // ----- buildings (the .glb files) -----
  addBuilding(b) {
    const root = new THREE.Group();
    root.position.set(b.x, 0, b.z);
    root.rotation.y = THREE.MathUtils.degToRad(b.rotY);
    this.scene.add(root);

    // Collision boxes: rotate the relative boxes by rotY (multiples of 90 only)
    const r = ((Math.round(b.rotY / 90) % 4) + 4) % 4;
    b.boxes.forEach(([x0, x1, z0, z1, lv]) => {      // lv (optional): 0 = only solid downstairs, 1 = only solid upstairs, missing = both floors
      let a = [x0, x1, z0, z1];
      for (let i = 0; i < r; i++) a = [a[2], a[3], -a[1], -a[0]];   // 90 degrees turn
      this.boxes.push({ x0: b.x + a[0], x1: b.x + a[1], z0: b.z + a[2], z1: b.z + a[3], lv });
    });

    // Name zone for the top-left text
    b.zone = { x0: b.x - 14, x1: b.x + 14, z0: b.z - 14, z1: b.z + 14 };

    if (b.interior) {                    // a room you can walk into: hidden until the player is inside
      b.room = b.interior();
      b.inside = false;
      root.add(b.room.group, b.room.marker);
      if (b.stairs) b.room.group.position.y = b.stairs.rise;     // Step 2: the school floor sits on top of the steps (the marker outside stays on the pavement)
    }
    if (b.stairs) addStairs(b.stairs, b.x, b.z, b.rotY);          // Step 2: the steps (stairs.js)

    if (b.extras) {                      // props around the building (kept visible when the player is inside)
      const ex = b.extras();
      root.add(ex.group);
      if (ex.update) this.animators.push(ex.update);
    }

    if (b.build) {                       // building made in code instead of a .glb file
      const built = b.build();
      root.add(built.group);
      if (built.update) this.animators.push(built.update);
      return;
    }

    new GLTFLoader().load(b.file, gltf => {
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      b.exterior = gltf.scene;           // kept so it can be hidden while the player is inside
      gltf.scene.visible = !b.inside;
      if (b.scale) {                     // shrink to game size, centre on x/z, sit on the ground
        gltf.scene.scale.setScalar(b.scale);
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        gltf.scene.position.x -= (box.min.x + box.max.x) / 2;
        gltf.scene.position.z -= (box.min.z + box.max.z) / 2;
        gltf.scene.position.y -= box.min.y;
      }
      root.add(gltf.scene);
    }, undefined, () => {
      // File missing or wrong name: show a plain block so the game still works
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.fallback), new THREE.MeshStandardMaterial({ color: 0xbbbbbb }));
      m.position.y = b.fallback[1] / 2; root.add(m);
      b.exterior = m; m.visible = !b.inside;
      this.say3d('Could not load ' + b.file + ' (check the file name)');
    });
  }

  // ----- the player -----
  buildPlayer() {
    this.player = makeAvatar(0x2c6e9b, myCharacterId());
    this.player.position.set(SPAWN.x, 0, SPAWN.z);
    this.scene.add(this.player);
    this.pvel = { x: 0, z: 0 };
  }

  setLabel(holder, name) {
    holder.remove(holder.userData.label || new THREE.Object3D());
    const l = makeLabel(name);
    l.position.y = 2.1;
    holder.add(l); holder.userData.label = l;
  }

  // ----- HUD (the layout lives in index.html + hud.css; here we only grab the pieces we update) -----
  buildHud() {
    const css = document.createElement('style');
    css.textContent = `
      #stickBase, #stickKnob { position: fixed; border-radius: 50%; z-index: 6; display: none; pointer-events: none; }
      #stickBase { width: 110px; height: 110px; background: #ffffff26; }
      #stickKnob { width: 52px; height: 52px; background: #ffffff73; }`;
    document.head.appendChild(css);
    this.zoneText = document.getElementById('zoneText');
    this.statusText = document.getElementById('statusText');
    this.testButton = document.getElementById('testButton');
    this.testButton.addEventListener('click', () => this.toggleProgressTest());
    this.logoutButton = document.getElementById('logoutButton');
    this.logoutButton.addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    this.stickBase = document.createElement('div'); this.stickBase.id = 'stickBase';
    this.stickKnob = document.createElement('div'); this.stickKnob.id = 'stickKnob';
    document.body.append(this.stickBase, this.stickKnob);
  }

  // ----- minimap: a real top-down render of the 3D scene, drawn into the round HUD canvas -----
  initMinimap() {
    const cv = document.getElementById('hudMap');
    if (!cv) return;
    const S = 256, half = 30;                       // 256 px image, shows 60 m x 60 m around the player
    const lut = new Uint8Array(256);                // linear -> sRGB, because render targets are not colour-encoded
    for (let i = 0; i < 256; i++) { const l = i / 255; lut[i] = Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055) * 255); }
    const lights = []; this.scene.traverse(o => { if (o.isLight) lights.push(o); });
    this.mm = {
      cv, ctx: cv.getContext('2d'), S, half, lut, lights, acc: 99,
      arrow: document.getElementById('hudArrow'),
      rt: new THREE.WebGLRenderTarget(S, S, { samples: 4 }),
      cam: new THREE.OrthographicCamera(-half, half, half, -half, 1, 400),
      px: new Uint8Array(S * S * 4),
      img: cv.getContext('2d').createImageData(S, S),
      bg: new THREE.Color(0x0b1a33)
    };
  }

  updateMinimap(dt) {
    const m = this.mm;
    if (!m) return;
    const p = this.player.position;
    if (m.arrow) m.arrow.style.transform = `rotate(${(-this.cam.yaw * 180 / Math.PI).toFixed(1)}deg)`;   // north is up
    m.acc += dt;
    if (m.acc < 0.12) return;
    m.acc = 0;
    try {
      const r = this.renderer, sc = this.scene;
      m.cam.position.set(p.x, 150, p.z); m.cam.up.set(0, 0, -1); m.cam.lookAt(p.x, 0, p.z);
      const bg = sc.background, fog = sc.fog, rt0 = r.getRenderTarget(), shadowAuto = r.shadowMap.autoUpdate;
      const pv = this.player.visible, old = m.lights.map(l => l.intensity);
      sc.background = m.bg; sc.fog = null; r.shadowMap.autoUpdate = false;
      m.lights.forEach(l => { l.intensity *= 0.5; });                 // the render target clips at 1.0, so tame the sun a bit
      this.player.visible = false; this.others.forEach(o => { o.av.visible = false; });
      r.setRenderTarget(m.rt); r.render(sc, m.cam);
      r.readRenderTargetPixels(m.rt, 0, 0, m.S, m.S, m.px);
      r.setRenderTarget(rt0);
      sc.background = bg; sc.fog = fog; r.shadowMap.autoUpdate = shadowAuto;
      m.lights.forEach((l, i) => { l.intensity = old[i]; });
      this.player.visible = pv; this.others.forEach(o => { o.av.visible = true; });

      const S = m.S, d = m.img.data, src = m.px, lut = m.lut;
      for (let y = 0; y < S; y++) {                                   // GL rows run bottom-to-top: flip while copying
        let si = (S - 1 - y) * S * 4, di = y * S * 4;
        for (let x = 0; x < S; x++, si += 4, di += 4) { d[di] = lut[src[si]]; d[di + 1] = lut[src[si + 1]]; d[di + 2] = lut[src[si + 2]]; d[di + 3] = 255; }
      }
      m.ctx.putImageData(m.img, 0, 0);
      m.ctx.lineWidth = 2; m.ctx.strokeStyle = '#0b1a33'; m.ctx.fillStyle = '#ffffff';   // other players = white dots
      this.others.forEach(o => {
        const x = (o.av.position.x - p.x) / (2 * m.half) * S + S / 2, y = (o.av.position.z - p.z) / (2 * m.half) * S + S / 2;
        if (x < 0 || y < 0 || x > S || y > S) return;
        m.ctx.beginPath(); m.ctx.arc(x, y, 5, 0, Math.PI * 2); m.ctx.stroke(); m.ctx.fill();
      });
    } catch (e) { console.warn('minimap disabled:', e); this.mm = null; }
  }

  say3d(t) { this.statusText.textContent = t; }

  // ----- input: WASD/arrows, mouse drag to look, touch stick (left) + drag to look (right) -----
  bindInput() {
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('wheel', e => {
      this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + e.deltaY * 0.01, 4, 20); e.preventDefault();
    }, { passive: false });

    const drags = new Map();
    this.canvas.addEventListener('pointerdown', e => {
      this.canvas.setPointerCapture(e.pointerId);
      const touch = e.pointerType === 'touch';
      if (touch && e.clientX < window.innerWidth * 0.5 && e.clientY > 180 && !this.stick.active) {
        this.stick.active = true; this.stick.id = e.pointerId; this.stick.sx = e.clientX; this.stick.sy = e.clientY;
        this.stick.x = this.stick.y = 0;
        this.stickBase.style.cssText = `display:block;left:${e.clientX - 55}px;top:${e.clientY - 55}px`;
        this.stickKnob.style.cssText = `display:block;left:${e.clientX - 26}px;top:${e.clientY - 26}px`;
      } else {
        drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (this.stick.active && e.pointerId === this.stick.id) {
        let dx = e.clientX - this.stick.sx, dy = e.clientY - this.stick.sy;
        const len = Math.hypot(dx, dy), max = 55;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        this.stick.x = dx / max; this.stick.y = dy / max;
        this.stickKnob.style.left = (this.stick.sx + dx - 26) + 'px';
        this.stickKnob.style.top = (this.stick.sy + dy - 26) + 'px';
        return;
      }
      const d = drags.get(e.pointerId);
      if (!d) return;
      this.cam.yaw -= (e.clientX - d.x) * 0.006;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + (e.clientY - d.y) * 0.005, 0.12, 1.25);
      d.x = e.clientX; d.y = e.clientY;
    });
    const end = e => {
      drags.delete(e.pointerId);
      if (this.stick.active && e.pointerId === this.stick.id) {
        this.stick.active = false; this.stick.x = this.stick.y = 0;
        this.stickBase.style.display = 'none'; this.stickKnob.style.display = 'none';
      }
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  // ----- multiplayer (same messages as before; only the units are converted) -----
  connect() {
    if (SERVER_URL.includes('YOUR-SERVER-NAME')) { this.say3d('Set SERVER_URL at the top of game.js'); return; }
    this.say3d('Connecting... the server may take about a minute to wake up.');
    this.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) { this.say3d('Please log in again.'); return; }
      this.socket.emit('join', { token: data.session.access_token, name: localStorage.getItem('pendingName') || '', character: myCharacterId() });
    });

    this.socket.on('init', data => {
      this.myId = data.you;
      this.progress = data.progress;
      this.devTools = data.devTools;
      this.player.position.set(data.x / PX_PER_M, 0, data.y / PX_PER_M);
      this.setLabel(this.player, data.name);
      // the server is the authority on which character this account uses
      if (data.character && data.character !== this.player.userData.characterId) {
        localStorage.setItem('characterId', data.character);
        applyCharacter(this.player, 0x2c6e9b, data.character);
      }
      data.players.forEach(p => { if (p.id !== this.myId) this.addOther(p); });
      this.applyGate();
      if (this.nin) { this.nin.setDev(this.devTools); this.nin.setState(data.nin); }
      this.updateStatus();
    });

    this.socket.on('progress', d => { this.progress = d.progress; this.applyGate(); if (this.nin) this.nin.refreshQuest(); });
    this.socket.on('renamed', d => {                      // a player's name tag changed (their NIN card was issued)
      if (d.id === this.myId) this.setLabel(this.player, d.name);
      else { const o = this.others.get(d.id); if (o) this.setLabel(o.av, d.name); }
    });
    this.socket.on('nin', s => { if (this.nin) this.nin.setState(s); });
    this.socket.on('nin_error', msg => { if (this.nin) this.nin.error(msg); else this.say3d(msg); });
    this.socket.on('correct', d => { this.player.position.set(d.x / PX_PER_M, 0, d.y / PX_PER_M); });
    this.socket.on('joined', p => { this.addOther(p); this.updateStatus(); });
    this.socket.on('character', d => {
      const av = d.id === this.myId ? this.player : (this.others.get(d.id) || {}).av;
      if (!av) return;
      if (d.id === this.myId) localStorage.setItem('characterId', d.character);
      applyCharacter(av, d.id === this.myId ? 0x2c6e9b : 0xd9822b, d.character);
    });
    this.socket.on('left', id => { this.removeOther(id); this.updateStatus(); });
    this.socket.on('moved', d => {
      const o = this.others.get(d.id);
      if (o) { o.tx = d.x / PX_PER_M; o.tz = d.y / PX_PER_M; }
    });
    this.socket.on('join_error', async msg => {
      this.say3d(msg);
      if (msg.includes('log in')) { await sb.auth.signOut(); }
    });
    this.socket.on('kicked', () => this.say3d('Logged in somewhere else. Reload to play here.'));
    this.socket.on('full', () => this.say3d('Server is full. Try again later.'));
    this.socket.on('disconnect', () => this.say3d('Disconnected. Reconnecting...'));
    this.socket.on('connect_error', () => this.say3d('Cannot reach the server yet. Retrying...'));
  }

  addOther(p) {
    if (this.others.has(p.id)) return;
    const av = makeAvatar(0xd9822b, p.character);
    av.position.set(p.x / PX_PER_M, 0, p.y / PX_PER_M);
    this.setLabel(av, p.name);
    this.scene.add(av);
    this.others.set(p.id, { av, tx: p.x / PX_PER_M, tz: p.y / PX_PER_M });
  }

  removeOther(id) {
    const o = this.others.get(id);
    if (!o) return;
    this.scene.remove(o.av);
    this.others.delete(id);
  }

  updateStatus() { this.say3d('Online: ' + (this.others.size + 1)); }

  // Called by the choose-your-character screen (next step)
  chooseCharacter(id) { if (this.socket) this.socket.emit('set_character', id); }

  // ----- gate and progress -----
  applyGate() {
    const open = this.progress === 'indigene';
    this.gateClosed = !open;
    this.gateGroup.visible = !open;
    if (window.NaijaHUD) window.NaijaHUD.set({ role: open ? 'Indigene' : 'Refugee' });          // status on the player card
    this.testButton.style.display = this.devTools ? 'block' : 'none';
    this.testButton.textContent = open ? 'Test: reset to arrived' : 'Test: become indigene';
  }

  toggleProgressTest() {
    if (!this.socket) return;
    this.socket.emit('dev_progress', this.progress === 'indigene' ? 'arrived' : 'indigene');
  }

  // ----- walking and collisions -----
  collide(pos) {
    const all = this.gateClosed ? this.boxes.concat([this.gateBox]) : this.boxes;
    const level = (this.player && this.player.userData.level) || 0;          // Step 4: which floor of the school you are on
    for (const b of all) {
      if (b.lv !== undefined && b.lv !== level) continue;                    // a wall or desk of the other floor
      const cx = THREE.MathUtils.clamp(pos.x, b.x0, b.x1);
      const cz = THREE.MathUtils.clamp(pos.z, b.z0, b.z1);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = PLAYER_RADIUS - d;
          pos.x += dx / d * push; pos.z += dz / d * push;
        } else {                       // centre is inside the box: push out the nearest side
          const l = pos.x - b.x0, r = b.x1 - pos.x, t = pos.z - b.z0, u = b.z1 - pos.z, m = Math.min(l, r, t, u);
          if (m === l) pos.x = b.x0 - PLAYER_RADIUS; else if (m === r) pos.x = b.x1 + PLAYER_RADIUS;
          else if (m === t) pos.z = b.z0 - PLAYER_RADIUS; else pos.z = b.z1 + PLAYER_RADIUS;
        }
      }
    }
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const k = this.keys;
    let ix = 0, iy = 0;                                   // ix = right, iy = forward
    if (k.KeyA || k.ArrowLeft) ix -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1;
    if (k.KeyW || k.ArrowUp) iy += 1;
    if (k.KeyS || k.ArrowDown) iy -= 1;
    if (this.stick.active) { ix = this.stick.x; iy = -this.stick.y; }
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }

    const { yaw } = this.cam;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);       // forward on the ground
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);        // right
    const p = this.player.position;
    const sp = onStairs(p.x, p.z) ? SPEED * STAIR_SPEED_FACTOR : SPEED;       // Step 2: a bit slower on the steps
    const vx = (fx * iy + rx * ix) * sp;
    const vz = (fz * iy + rz * ix) * sp;

    p.x += vx * dt; p.z += vz * dt;
    p.x = THREE.MathUtils.clamp(p.x, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    this.collide(p);
    if (this.grassChunks && (this._gcTick = (this._gcTick || 0) + 1) % 20 === 0) {       // draw only the grass squares near the player
      for (const c of this.grassChunks) c.mesh.visible = Math.hypot(c.cx - p.x, c.cz - p.z) < 52;
    }
    this.collide(p);

    const speed = Math.hypot(vx, vz);
    if (speed > 0.2) turnTowards(this.player, Math.atan2(vx, vz), dt);
    updateElevation(this.player, p.x, p.z, dt);                                // Step 2: height + going up / down
    animateAvatar(this.player, speed, dt);
    for (const f of this.animators) f();

    // zone name
    const z = BUILDINGS.find(b => p.x >= b.zone.x0 && p.x <= b.zone.x1 && p.z >= b.zone.z0 && p.z <= b.zone.z1);
    this.zoneText.textContent = z ? z.name : 'Walking';

    // send position to the server (in the old pixel units)
    const now = performance.now();
    if (this.socket && this.socket.connected && this.myId && now - this.lastSent > SEND_EVERY_MS) {
      this.lastSent = now;
      this.socket.emit('move', { x: Math.round(p.x * PX_PER_M), y: Math.round(p.z * PX_PER_M), flip: false });
    }

    // other players glide to their latest position and face the way they walk
    const a = 1 - Math.exp(-12 * dt);
    this.others.forEach(o => {
      const dx = o.tx - o.av.position.x, dz = o.tz - o.av.position.z;
      o.av.position.x += dx * a; o.av.position.z += dz * a;
      const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001) * a;
      if (Math.hypot(dx, dz) > 0.02) turnTowards(o.av, Math.atan2(dx, dz), dt);
      updateElevation(o.av, o.av.position.x, o.av.position.z, dt);     // Step 2
      animateAvatar(o.av, Math.min(sp, SPEED), dt);
    });

    // camera follows from behind and above
    const c = this.cam;
    const target = new THREE.Vector3(p.x, 1.5 + p.y, p.z);
    const cp = Math.cos(c.pitch);
    const want = new THREE.Vector3(p.x + Math.sin(c.yaw) * cp * c.dist, 1.5 + p.y + Math.sin(c.pitch) * c.dist, p.z + Math.cos(c.yaw) * cp * c.dist);
    if (!this.look) { this.look = target.clone(); this.camera.position.copy(want); }
    const s = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(want, s);
    this.look.lerp(target, s);
    this.camera.lookAt(this.look);

    // buildings with an interior: show the room (and hide the outside model) while the player is inside it
    BUILDINGS.forEach(b => {
      if (!b.room) return;
      const inside = Math.abs(p.x - b.x) < b.room.halfW - 0.1 && Math.abs(p.z - (b.z + (b.room.cz || 0))) < b.room.halfD - 0.1;   // cz = the room's centre is not always the building centre (the school)
      if (inside !== b.inside) {
        b.inside = inside;
        b.room.setInside(inside);
        if (b.exterior) b.exterior.visible = !inside;
      }
      if (inside) {
        b.room.setCamera(this.camera.position.x - b.x, this.camera.position.z - b.z);
        if (b.room.setLevel) b.room.setLevel((this.player.userData.level) || 0);      // Step 4: show the upstairs floor while you are up there
      }
    });

    // Ivory, "Talk to Ivory", the countdown and the quest text (after the interior check above, which sets b.inside)
    if (this.nin) { try { this.nin.update(dt); } catch (e) { console.error('NIN quest stopped:', e); this.nin = null; } }
    if (this.clothing) { try { this.clothing.update(dt); } catch (e) { console.error('Clothing stopped:', e); this.clothing = null; } }

    // keep the sun's shadow box around the player
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.position.set(p.x + 30, 50, p.z + 20);

    this.renderer.render(this.scene, this.camera);
    this.updateMinimap(dt);
  }
}

// start only after everything above has been defined
boot();
