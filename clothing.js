// clothing.js  (put one character's outfit on another character of the same gender)
//
// How it works (all Mixamo characters share the same 65-bone skeleton, so one set of animations drives all of them):
//   1. The wearer (the player's character) is loaded as usual.
//   2. The outfit source (any other character in characters.json: free, premium or clothing) is loaded once and kept (game.js caches it).
//   3. The outfit's clothing parts are copied and re-attached to the WEARER's bones by bone name.
//   4. The wearer's own clothing parts are hidden. Face, hair and skin stay.
//   5. The wearer's own body and legs are masked wherever the outfit is drawn on the screen (a stencil mask), so skin cannot poke
//      through even when the clothes were cut for another body. Arms, hands and head are never masked.
//   6. FITTING: before the copies are shown, every outfit point that is inside the wearer's skin (or touching it) is pushed straight out
//      to just above the skin, and the push is smoothed. So an outfit cut for another body is reshaped to the wearer's own body.
//      The result is kept for next time. It takes a moment the first time an outfit goes on a character.
//   7. Taking the outfit off removes the copies and shows the hidden parts again.
//
// If anything is missing or goes wrong, the character is left exactly as it was and the reason is written in the browser console
// (look for lines starting with [clothing]).
//
// Test buttons under the minimap:  "Test: next character" (cycles through the free characters) and one "Test: next ..." button per slot
// that has pieces in wardrobe.json (top, bottom, shoes, necklace, earrings), plus "Test: own clothes".
//
// ADDING A CHARACTER
//   1. Put its entry in characters.json (free, premium or clothing).
//   2. Add ONE line to CLOTHES below: the names of the parts that are its clothes. A part name is the material name without the
//      "m13_" at the start and the "mat" at the end. Add ?names=1 to the web address to see the names of the character you are playing.
//   Every character in CLOTHES can wear the outfits of every other character in CLOTHES of the same gender (the id starts with male_ or female_).
//
// URL helpers for testing:
//   ?outfitdebug=1   writes the size and place of every part to the console and adds a "Test: skin on/off" button
//                    (hides the wearer's skin, so you can see if the outfit parts are really there)
//   ?inflate=0       turns off the small growth of the outfit (see INFLATE_MM). ?inflate=8 grows it by 8 mm.
//   ?mask=0          turns off the skin mask, to compare with and without it
//   ?fit=0           turns off the fitting (the outfit keeps the shape it was made with)
//   ?clear=3         the gap kept between skin and outfit, in millimetres (default 3)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// each character's own clothing parts: hidden while it wears another outfit, copied when somebody else wears them
const CLOTHES = {
  female_char1:     ['singlet', 'shorts', 'shoes'],                                   // the three playable characters: singlet, shorts, shoes
  female_char2:     ['singlet', 'shorts', 'shoes'],
  female_char3:     ['singlet', 'shorts', 'shoes'],
  female_elizabeth: ['blinn1', 'blinn2', 'blinn3'],                                   // top, skirt, shoes
  female_emma:      ['Vest', 'Logo', 'Full_Body', 'Sneakers1'],                       // vest, its logo, tight body suit, sneakers
  female_jeans:     ['Female_T_Shirt', 'Denim_shorts', 'Canvas_shoes'],               // t-shirt, shorts, shoes
  female_rocker:    ['outfit_top', 'outfit_bottom', 'outfit_shoes', 'necklace', 'earring'],
  female_sammie:    ['Cloth', 'Leggings', 'sneaker_right', 'sneaker_front', 'eaglet', 'laces'],
};

const OUTFIT_LABELS = {
  female_elizabeth: 'Elizabeth striped outfit',
  female_emma: 'Emma sport outfit',
  female_jeans: 'Jeans outfit',
  female_rocker: 'Rocker outfit',
  female_sammie: 'Sammie outfit',
};

// ---- WARDROBE: single pieces that can be mixed freely ----
// Every piece is its own small .glb file, listed in clothing/female/wardrobe.json (id, slot, label, file).
// Folders: clothing/female/tops, bottoms, dresses, shoes, jewelry (hair comes later).
// ADDING A PIECE: put the .glb in the matching folder and add one entry to wardrobe.json. Nothing in this file changes.
const WARDROBE_URL = 'clothing/female/wardrobe.json';
const WARDROBE_BASE = 'clothing/female/';
const WARDROBE_SOURCE = 'female_wardrobe';                       // only used to tell the gender of a piece outfit
const PIECES = {};                                               // filled from wardrobe.json: id -> { slot, label, file }
const SLOTS = ['top', 'bottom', 'dress', 'shoes', 'necklace', 'earrings'];
const OWN_SLOT = { singlet: 'top', shorts: 'bottom', shoes: 'shoes' };      // which slot each of the playable characters' own parts fills
const slotsHidden = slots => slots.flatMap(s => s === 'dress' ? ['top', 'bottom'] : [s]);   // a dress covers the top and the bottom

// a selection like 'top=hoodie_aras;shoes=sneakers_azat' -> an outfit made of those pieces (own parts of the other slots stay)
function resolveOutfit(id) {
  if (!id) return null;
  if (OUTFITS[id]) return OUTFITS[id];
  if (!String(id).includes('=')) return null;
  const sel = {}, colors = {};
  String(id).split(';').forEach(p => {
    const [slot, rest = ''] = p.split('='), [name, colour] = rest.split(':');          // 'top=hoodie_aras:#ff0000' or 'top=top_khustup:teal'
    if (PIECES[name] && PIECES[name].slot === slot) { sel[slot] = name; if (colour) colors[name] = colour; }
  });
  const names = Object.values(sel); if (!names.length) return null;
  return { label: names.map(n => PIECES[n].label).join(' + '), source: WARDROBE_SOURCE, pieces: names, take: names, slots: Object.keys(sel), colors };
}

// The clothes are cut for another body, so a little of the wearer's skin can poke through. Each outfit part is grown by this
// much (millimetres) along its surface to cover it. 0 = off.
const INFLATE_MM = 0;                               // the skin mask below does this job now, so growing is off by default (?inflate=4 turns it back on)

const TEST_BUTTONS = true;                                // the buttons under the minimap. Set false when you are happy.

const params = new URLSearchParams(location.search);
const DEBUG = params.get('outfitdebug') === '1';
const inflateMM = params.has('inflate') ? parseFloat(params.get('inflate')) || 0 : INFLATE_MM;

// Skin mask: outfit parts are drawn first and mark their pixels in the stencil buffer. The wearer's body and legs are then not drawn
// on those pixels. Jewellery, logos and laces do not mark pixels (hiding skin under them would leave a hole).
const MASK = params.get('mask') !== '0';
const SKIP_MASK = /necklace|earring|logo|lace|eaglet/i;
const FIT = params.get('fit') !== '0';
const FIT_CLEAR_M = (params.has('clear') ? parseFloat(params.get('clear')) || 0 : 3) / 1000;   // metres on a 1.38 m tall body, scaled for other sizes
const FIT_REACH_M = 0.05, FIT_MAX_M = 0.05;                   // how far from the skin a point is looked at, and the most it can be moved
const COLLIDERS = /^(std_skin_|skin_)?(body|arms?|legs?)\d*$/i;      // the wearer's skin parts that outfits must stay outside of (not the head)
const SKIN_MASKED = /^(std_skin_|skin_)?(body|legs?)\d*$/i;

// outfits: one for every character in CLOTHES. The outfit id is the character id without male_ / female_
const idOf = c => c.replace(/^(fe)?male_/, '');
const OUTFITS = {};
for (const c of Object.keys(CLOTHES)) OUTFITS[idOf(c)] = { label: OUTFIT_LABELS[c] || (idOf(c) + ' outfit'), source: c, take: CLOTHES[c] };
const genderOf = c => String(c).split('_')[0];

const plain = m => { const x = Array.isArray(m) ? m[0] : m; return ((x && x.name) || '').replace(/^m\d+_/i, '').replace(/mat$/i, ''); };
const log = (...a) => console.log('[clothing]', ...a);
const warn = (...a) => console.warn('[clothing]', ...a);

// ---- fit core: plain maths on number arrays (no three.js) ----
// closest point on triangle abc to point p (Ericson, Real-Time Collision Detection 5.1.5); writes it to out[0..2]
function closestOnTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + abx * v; out[1] = ay + aby * v; out[2] = az + abz * v; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + acx * w; out[1] = ay + acy * w; out[2] = az + acz * w; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); out[0] = bx + (cx - bx) * w; out[1] = by + (cy - by) * w; out[2] = bz + (cz - bz) * w; return; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
}

const cellKey = (ix, iy, iz) => ((ix + 2048) * 4096 + (iy + 2048)) * 4096 + (iz + 2048);

// tv: skin triangles, 9 numbers each (outward-facing). pts: points, 3 numbers each.
// A point inside the skin (or closer than `clear`) is moved straight out so it sits `clear` above the surface.
// Returns { disp (3 numbers per point), pushed (count), maxPush }
function pushOut(tv, pts, clear, reach, maxPush) {
  const nt = tv.length / 9, cell = reach / 2, grid = new Map();
  const nx = new Float32Array(nt), ny = new Float32Array(nt), nz = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const ux = tv[o + 3] - tv[o], uy = tv[o + 4] - tv[o + 1], uz = tv[o + 5] - tv[o + 2];
    const vx = tv[o + 6] - tv[o], vy = tv[o + 7] - tv[o + 1], vz = tv[o + 8] - tv[o + 2];
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z); if (l < 1e-14) continue;                       // a flat triangle is left out
    nx[t] = x / l; ny[t] = y / l; nz[t] = z / l;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const X = tv[o + k * 3], Y = tv[o + k * 3 + 1], Z = tv[o + k * 3 + 2];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
    }
    const ax = Math.floor((x0 - reach) / cell), bx = Math.floor((x1 + reach) / cell);
    const ay = Math.floor((y0 - reach) / cell), by = Math.floor((y1 + reach) / cell);
    const az = Math.floor((z0 - reach) / cell), bz = Math.floor((z1 + reach) / cell);
    for (let i = ax; i <= bx; i++) for (let j = ay; j <= by; j++) for (let k = az; k <= bz; k++) {
      const key = cellKey(i, j, k); let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(t);
    }
  }
  const np = pts.length / 3, disp = new Float32Array(pts.length), c = [0, 0, 0];
  let pushed = 0, maxP = 0;
  for (let i = 0; i < np; i++) {
    const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
    const list = grid.get(cellKey(Math.floor(px / cell), Math.floor(py / cell), Math.floor(pz / cell)));
    if (!list) continue;
    let best = Infinity, bt = -1, qx = 0, qy = 0, qz = 0;
    for (let n = 0; n < list.length; n++) {
      const t = list[n], o = t * 9;
      if (nx[t] === 0 && ny[t] === 0 && nz[t] === 0) continue;
      closestOnTri(px, py, pz, tv[o], tv[o + 1], tv[o + 2], tv[o + 3], tv[o + 4], tv[o + 5], tv[o + 6], tv[o + 7], tv[o + 8], c);
      const dx = px - c[0], dy = py - c[1], dz = pz - c[2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) { best = d2; bt = t; qx = c[0]; qy = c[1]; qz = c[2]; }
    }
    if (bt < 0) continue;
    const dist = Math.sqrt(best); if (dist > reach) continue;
    const sd = (px - qx) * nx[bt] + (py - qy) * ny[bt] + (pz - qz) * nz[bt];     // signed distance: negative = inside the skin
    let amt, dx, dy, dz;
    if (sd < 0) {
      if (dist > maxPush) continue;                                              // too deep to trust the nearest surface
      amt = Math.min(clear - sd, maxPush); dx = nx[bt]; dy = ny[bt]; dz = nz[bt];
    } else if (dist < clear) {
      amt = clear - dist;
      if (dist > 1e-9) { dx = (px - qx) / dist; dy = (py - qy) / dist; dz = (pz - qz) / dist; } else { dx = nx[bt]; dy = ny[bt]; dz = nz[bt]; }
    } else continue;
    disp[i * 3] = dx * amt; disp[i * 3 + 1] = dy * amt; disp[i * 3 + 2] = dz * amt;
    pushed++; if (amt > maxP) maxP = amt;
  }
  return { disp, pushed, maxPush: maxP };
}

// evens out the push between neighbouring points so the cloth does not get spiky (points closer than `radius` are averaged)
function smoothPush(pts, disp, radius, passes) {
  const np = pts.length / 3, grid = new Map();
  for (let i = 0; i < np; i++) {
    const key = cellKey(Math.floor(pts[i * 3] / radius), Math.floor(pts[i * 3 + 1] / radius), Math.floor(pts[i * 3 + 2] / radius));
    let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(i);
  }
  let cur = disp;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(cur.length), r2 = radius * radius;
    for (let i = 0; i < np; i++) {
      const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
      const ix = Math.floor(px / radius), iy = Math.floor(py / radius), iz = Math.floor(pz / radius);
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const list = grid.get(cellKey(ix + a, iy + b, iz + c)); if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const j = list[k], dx = pts[j * 3] - px, dy = pts[j * 3 + 1] - py, dz = pts[j * 3 + 2] - pz;
          if (dx * dx + dy * dy + dz * dz <= r2) { sx += cur[j * 3]; sy += cur[j * 3 + 1]; sz += cur[j * 3 + 2]; n++; }
        }
      }
      next[i * 3] = cur[i * 3] * 0.5 + (sx / n) * 0.5; next[i * 3 + 1] = cur[i * 3 + 1] * 0.5 + (sy / n) * 0.5; next[i * 3 + 2] = cur[i * 3 + 2] * 0.5 + (sz / n) * 0.5;
    }
    cur = next;
  }
  return cur;
}
// ---- end of fit core ----

// ---- wardrobe.json and the piece files ----
async function loadWardrobe() {
  try {
    const list = await (await fetch(WARDROBE_URL)).json();
    for (const p of (Array.isArray(list) ? list : list.pieces || [])) if (p.id && p.slot && p.file) PIECES[p.id] = { slot: p.slot, label: p.label || p.id, file: p.file, colors: p.colors || [], custom: p.custom || null };
    log('wardrobe: ' + Object.keys(PIECES).length + ' pieces');
  } catch (e) { warn('wardrobe.json could not be read (' + WARDROBE_URL + '):', e); }
}
const pieceLoads = new Map();     // piece id -> promise of its loaded .glb (each file is read once)
function loadPiece(id) {
  if (!pieceLoads.has(id)) pieceLoads.set(id, new GLTFLoader().loadAsync(WARDROBE_BASE + PIECES[id].file));
  return pieceLoads.get(id);
}
// ---- colours: a piece can have ready-made colour textures (wardrobe.json "colors") and/or take any colour ("#rrggbb") ----
// A ready-made colour swaps the texture. Any other colour uses the piece's grey texture ("custom") multiplied by that colour,
// so the fabric detail stays and the colour can be anything (light colours look best).
const textureLoads = new Map();
function loadTexture(url) {
  if (!textureLoads.has(url)) textureLoads.set(url, new THREE.TextureLoader().loadAsync(url).then(t => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }));
  return textureLoads.get(url);
}
async function applyColour(copy, pieceId, token) {
  const p = PIECES[pieceId]; if (!p || !token) return;
  let file = null, tint = null;
  if (/^#[0-9a-f]{6}$/i.test(token)) { file = p.custom; tint = token; }
  else { const c = (p.colors || []).find(c => c.id === token); if (c) file = c.file; }
  if (!file) { warn('colour not available for ' + pieceId + ': ' + token); return; }
  const tex = await loadTexture(WARDROBE_BASE + file);
  const m = (Array.isArray(copy.material) ? copy.material[0] : copy.material).clone();      // a private copy, the shared material is untouched
  m.map = tex; m.color.set(tint || 0xffffff); m.needsUpdate = true;
  copy.material = m;
}

export function initClothing(opts) {
  const { world, applyCharacter, loadSource } = opts;
  const testWearers = (opts.characters && opts.characters.length ? opts.characters : Object.keys(CLOTHES)).filter(c => CLOTHES[c]);

  let wanted = null;               // the outfit id the player should be wearing (null = own clothes)
  let dressed = null;              // { model, outfit } what is on the screen right now
  let busy = false;

  // outfits the given wearer can put on (same gender, not its own)
  const outfitsFor = id => Object.keys(OUTFITS).filter(o => genderOf(OUTFITS[o].source) === genderOf(id) && OUTFITS[o].source !== id);

  // a copy of a material whose surface is pushed outwards a little (the shared original is not touched)
  const grown = new Map();
  function grow(mat, amount) {
    if (!amount) return mat;
    if (Array.isArray(mat)) return mat.map(m => grow(m, amount));
    const key = mat.uuid + ':' + amount;
    if (!grown.has(key)) {
      const m = mat.clone();
      m.onBeforeCompile = sh => {
        sh.uniforms.uInflate = { value: amount };
        sh.vertexShader = 'uniform float uInflate;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * uInflate;');
      };
      m.customProgramCacheKey = () => 'outfit-inflate';
      grown.set(key, m);
    }
    return grown.get(key);
  }

  // ----- fitting -----
  // where every vertex of a skinned mesh is right now, in world space
  function skinnedWorld(mesh) {
    const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
    const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
    const out = new Float32Array(pos.count * 3), v = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix); acc.set(0, 0, 0);
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], s = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      for (let k = 0; k < 4; k++) if (w[k]) acc.addScaledVector(t.copy(v).applyMatrix4(bm[s[k]]), w[k]);
      acc.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
      out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
    return out;
  }

  const fitCache = new Map();          // 'wearer|outfit|part' -> the fitted positions (so the work is done once)

  // reshape the outfit copies so they sit outside the wearer's skin. Returns a short text for the log.
  function fitCopies(model, copies, characterId, outfitId) {
    const colliders = [];
    model.traverse(o => { if (o.isSkinnedMesh && !o.userData.outfitPart && COLLIDERS.test(plain(o.material))) colliders.push(o); });
    if (!colliders.length) return 'fit skipped: no skin parts found';
    if (copies.every(c => fitCache.has(characterId + '|' + outfitId + '|' + c.userData.outfitPart))) {
      copies.forEach(c => { const a = c.geometry.attributes.position; a.array.set(fitCache.get(characterId + '|' + outfitId + '|' + c.userData.outfitPart)); a.needsUpdate = true; c.geometry.computeBoundingSphere(); });
      return 'fit reused';
    }
    // the wearer's skin as triangles, at its current pose
    const tri = []; let y0 = Infinity, y1 = -Infinity;
    colliders.forEach(m => {
      m.updateMatrixWorld(true);
      const P = skinnedWorld(m), g = m.geometry, ix = g.index, n = ix ? ix.count : g.attributes.position.count, flip = m.matrixWorld.determinant() < 0;
      for (let i = 0; i + 2 < n; i += 3) {
        const a = ix ? ix.getX(i) : i, b = ix ? ix.getX(i + (flip ? 2 : 1)) : i + (flip ? 2 : 1), c = ix ? ix.getX(i + (flip ? 1 : 2)) : i + (flip ? 1 : 2);
        tri.push(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
      }
      for (let i = 1; i < P.length; i += 3) { if (P[i] < y0) y0 = P[i]; if (P[i] > y1) y1 = P[i]; }
    });
    const tv = Float32Array.from(tri);
    const U = Math.max(0.2, (y1 - y0) / 1.38);                  // 1 = a body the size of the ones we measured (metres)
    const clear = FIT_CLEAR_M * U, reach = FIT_REACH_M * U, maxPush = FIT_MAX_M * U;
    let totalPushed = 0, totalPoints = 0, worst = 0;
    const m3 = new THREE.Matrix3(), full = new THREE.Matrix4(), mv = new THREE.Matrix4(), d = new THREE.Vector3();
    copies.forEach(c => {
      c.updateMatrixWorld(true);
      const P = skinnedWorld(c), np = P.length / 3;
      const res = pushOut(tv, P, clear, reach, maxPush);
      const disp = np <= 20000 ? smoothPush(P, res.disp, 0.02 * U, 1) : res.disp;
      totalPushed += res.pushed; totalPoints += np; worst = Math.max(worst, res.maxPush / U);
      // turn the push (world space) into a change of the mesh's own vertex positions (undoing the skinning for each vertex)
      const g = c.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const bones = c.skeleton.bones, inv = c.skeleton.boneInverses;
      const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]).elements);
      const c1 = new THREE.Matrix4().multiplyMatrices(c.matrixWorld, c.bindMatrixInverse);
      for (let i = 0; i < np; i++) {
        const dx = disp[i * 3], dy = disp[i * 3 + 1], dz = disp[i * 3 + 2];
        if (!dx && !dy && !dz) continue;
        const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], s = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
        mv.elements.fill(0);
        for (let k = 0; k < 4; k++) if (w[k]) { const e = bm[s[k]]; for (let q = 0; q < 16; q++) mv.elements[q] += w[k] * e[q]; }
        full.multiplyMatrices(c1, mv).multiply(c.bindMatrix);
        m3.setFromMatrix4(full);
        if (Math.abs(m3.determinant()) < 1e-12) continue;
        m3.invert(); d.set(dx, dy, dz).applyMatrix3(m3);
        pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
      }
      pos.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
      fitCache.set(characterId + '|' + outfitId + '|' + c.userData.outfitPart, new Float32Array(pos.array));
    });
    return 'fitted: ' + totalPushed + ' of ' + totalPoints + ' points moved out of the skin, the most by ' + (worst * 1000).toFixed(0) + ' mm';
  }

  // a copy of a material that takes part in the skin mask ('outfit' marks pixels, 'skin' is not drawn on marked pixels)
  const stenciled = new Map();
  function withStencil(mat, kind) {
    if (Array.isArray(mat)) return mat.map(m => withStencil(m, kind));
    const key = mat.uuid + ':' + kind;
    if (!stenciled.has(key)) {
      const m = mat.clone();
      m.onBeforeCompile = mat.onBeforeCompile; m.customProgramCacheKey = mat.customProgramCacheKey;
      m.stencilWrite = true; m.stencilRef = 1; m.stencilFuncMask = 0xff; m.stencilWriteMask = 0xff;
      m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp;
      if (kind === 'outfit') { m.stencilFunc = THREE.AlwaysStencilFunc; m.stencilZPass = THREE.ReplaceStencilOp; }
      else { m.stencilFunc = THREE.NotEqualStencilFunc; m.stencilZPass = THREE.KeepStencilOp; }
      stenciled.set(key, m);
    }
    return stenciled.get(key);
  }

  // ----- take an outfit off a model (own clothes come back) -----
  function strip(model) {
    if (!model) return;
    const d = model.userData.debugSkin; if (d) { d.parts.forEach(m => { m.visible = true; }); model.userData.debugSkin = null; }
    if (!model.userData.outfitParts) return;
    model.userData.outfitParts.added.forEach(m => { if (m.parent) m.parent.remove(m); if (m.skeleton) m.skeleton.dispose(); if (m.userData.ownGeometry) m.geometry.dispose(); });
    model.userData.outfitParts.hidden.forEach(m => { m.visible = true; });
    (model.userData.outfitParts.skinSwaps || []).forEach(s => { s.mesh.material = s.material; s.mesh.renderOrder = s.order; });
    model.userData.outfitParts = null;
  }

  // ----- put an outfit on a model. Returns true when it worked. Nothing changes unless everything is ready. -----
  async function dress(model, characterId, outfitId) {
    const outfit = resolveOutfit(outfitId);
    if (!outfit) { warn('unknown outfit', outfitId); return false; }
    const ownNames = CLOTHES[characterId];
    const hideSlots = outfit.slots ? slotsHidden(outfit.slots) : null;
    const hideNames = ownNames && hideSlots ? ownNames.filter(n => hideSlots.includes(OWN_SLOT[n])) : ownNames;   // a piece only hides the own part of its slot
    if (!hideNames) {
      const names = new Set(); model.traverse(o => { if (o.isSkinnedMesh) names.add(plain(o.material)); });
      warn(characterId + ' cannot wear outfits yet. Add it to CLOTHES in clothing.js. Its parts are: ' + [...names].join(', '));
      return false;
    }
    if (genderOf(characterId) !== genderOf(outfit.source)) { warn('an outfit only fits the same gender: ' + characterId + ' / ' + outfit.source); return false; }
    if (outfit.source === characterId) { strip(model); return true; }                 // the character's own outfit is simply its own clothes
    let src;
    try { src = outfit.pieces ? { scenes: (await Promise.all(outfit.pieces.map(loadPiece))).map(g => g.scene) } : { scenes: [(await loadSource(outfit.source)).scene] }; }
    catch (e) { warn('could not load the outfit source', outfit.source || outfit.pieces, e); return false; }
    if (model !== world.player.userData.model) return false;                          // the character changed while we waited

    strip(model);
    model.updateMatrixWorld(true);

    // the wearer's bones, by name, and its own clothing parts
    const baseBones = {}, hidden = []; let baseMesh = null;
    model.traverse(o => {
      if (o.isBone) baseBones[o.name] = o;
      if (o.isSkinnedMesh) { baseMesh = baseMesh || o; if (hideNames.includes(plain(o.material))) hidden.push(o); }
    });
    if (!baseMesh) { warn('the wearer has no body parts'); return false; }
    if (!hidden.length && hideNames.length) warn('none of the wearer\'s own clothing parts were found (' + hideNames.join(', ') + '): the outfit will be added on top');
    else if (hidden.length && hidden.length < hideNames.length) warn('some of the wearer\'s own clothing parts were not found. Found: ' + hidden.map(m => plain(m.material)).join(', '));

    // the size of one metre in the source file's units (the files are either in metres or in centimetres)
    let tall = 0;
    src.scenes.forEach(sc => sc.traverse(sm => {
      if (!sm.isSkinnedMesh) return;
      if (!sm.geometry.boundingBox) sm.geometry.computeBoundingBox();
      tall = Math.max(tall, sm.geometry.boundingBox.max.y - sm.geometry.boundingBox.min.y);
    }));
    const amount = (inflateMM / 1000) * (tall > 10 ? 100 : 1);

    // build every copy first; only add them if all of them are fine
    const parent = baseMesh.parent;
    const copies = [], missing = new Set(), found = new Set();
    src.scenes.forEach(sc => sc.traverse(sm => {
      if (!sm.isSkinnedMesh) return;
      const name = plain(sm.material);
      if (!outfit.take.includes(name)) return;
      found.add(name);
      const bones = sm.skeleton.bones.map(b => { const nb = baseBones[b.name]; if (!nb) missing.add(b.name); return nb; });
      if (bones.some(b => !b)) return;
      const copy = sm.clone();
      if (FIT) copy.geometry = sm.geometry.clone();                                    // the fitting changes the copy's own shape, never the shared original
      const masks = MASK && !SKIP_MASK.test(name);
      copy.material = masks ? withStencil(grow(sm.material, amount), 'outfit') : grow(sm.material, amount);
      if (masks) copy.renderOrder = -1;                                               // drawn before the skin, so the mask is ready
      copy.castShadow = true; copy.receiveShadow = true; copy.frustumCulled = false;
      copy.userData = { outfitPart: name, ownGeometry: FIT, pending: { bones, inverses: sm.skeleton.boneInverses.map(m => m.clone()), bind: sm.bindMatrix.clone() } };
      copies.push(copy);
    }));
    const lost = outfit.take.filter(n => !found.has(n));
    if (missing.size) { warn('bones missing on the wearer, outfit not put on:', [...missing].join(', ')); return false; }
    if (lost.length) { warn('parts not found in the outfit source:', lost.join(', ')); if (!copies.length) return false; }

    if (outfit.colors) { try { await Promise.all(copies.map(c => applyColour(c, c.userData.outfitPart, outfit.colors[c.userData.outfitPart]))); } catch (e) { warn('colour failed, the piece keeps its own colour:', e); } }
    if (model !== world.player.userData.model) return false;
    hidden.forEach(m => { m.visible = false; });
    copies.forEach(copy => {
      const p = copy.userData.pending; delete copy.userData.pending;
      parent.add(copy); copy.updateMatrixWorld(true);
      copy.bind(new THREE.Skeleton(p.bones, p.inverses), p.bind);                     // the part now follows the wearer's bones
    });
    let fitInfo = 'fit off';
    if (FIT) { try { fitInfo = fitCopies(model, copies, characterId, String(outfitId).replace(/:[^;]+/g, '')); } catch (e) { fitInfo = 'fit failed'; warn('fitting failed, the outfit keeps the shape it was made with:', e); } }
    const skinSwaps = [];
    if (MASK) model.traverse(o => { if (o.isSkinnedMesh && !o.userData.outfitPart && !hidden.includes(o) && SKIN_MASKED.test(plain(o.material))) skinSwaps.push({ mesh: o, material: o.material, order: o.renderOrder }); });
    skinSwaps.forEach(s => { s.mesh.material = withStencil(s.material, 'skin'); s.mesh.renderOrder = 1; });
    model.userData.outfitParts = { added: copies, hidden, skinSwaps, fit: fitInfo };
    log(outfit.label + ' put on ' + characterId + ': ' + copies.length + ' parts added (' + copies.map(c => c.userData.outfitPart).join(', ') + '), ' + hidden.length + ' own parts hidden, grown ' + (amount ? inflateMM + ' mm' : 'not at all') + ', ' + fitInfo + ', skin masked on ' + skinSwaps.length + ' parts (' + skinSwaps.map(s => plain(s.material)).join(', ') + ').');
    if (DEBUG) {
      const box = o => { const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()); return 'y ' + b.min.y.toFixed(2) + ' to ' + b.max.y.toFixed(2) + ', width ' + s.x.toFixed(2) + ', depth ' + s.z.toFixed(2); };
      hidden.forEach(m => log('  hidden own part ' + plain(m.material) + ': ' + box(m)));
      copies.forEach(c => log('  added part ' + c.userData.outfitPart + ': ' + box(c)));
    }
    return true;
  }

  // ----- public: choose the outfit (null = own clothes) -----
  async function setOutfit(id) {
    wanted = id || null;
    await sync();
  }
  async function sync() {
    const u = world.player.userData;
    if (busy || !u.model) return;
    if (dressed && dressed.model === u.model && dressed.outfit === wanted) return;
    busy = true;
    try {
      const model = u.model;
      if (dressed && dressed.model === model) { strip(model); dressed = null; }
      if (wanted) {
        const ok = await dress(model, u.characterId, wanted);
        if (ok) {
          dressed = { model, outfit: wanted };
          const f = (model.userData.outfitParts && model.userData.outfitParts.fit) || '';          // shown on screen, so you can see it without the console
          world.say3d(resolveOutfit(wanted).label + ' is on' + (/^fit(ted| reused)/.test(f) ? ' (fitted)' : f === 'fit failed' ? ' (fit FAILED)' : '') + '.');
        }
        else { world.say3d('Could not put that outfit on this character (see the browser console).'); wanted = null; dressed = { model, outfit: null }; }
      } else { dressed = { model, outfit: null }; world.say3d('Own clothes.'); }
    } catch (e) { console.error('[clothing] failed:', e); wanted = null; } finally { busy = false; }
  }

  // debug: hide / show the wearer's skin (the outfit parts stay), to see whether the outfit is really on
  function toggleSkin() {
    const model = world.player.userData.model; if (!model) return;
    if (model.userData.debugSkin) { const d = model.userData.debugSkin; d.parts.forEach(m => { m.visible = true; }); model.userData.debugSkin = null; world.say3d('Skin shown.'); return; }
    const parts = [];
    model.traverse(o => { if (o.isSkinnedMesh && !o.userData.outfitPart && o.visible && /^(body|arms?|legs?|avatarbody|head|std_skin_\w+)\d*$/i.test(plain(o.material))) parts.push(o); });
    parts.forEach(m => { m.visible = false; });
    model.userData.debugSkin = { parts };
    world.say3d('Skin hidden: ' + parts.map(m => plain(m.material)).join(', '));
  }

  // ----- wardrobe: the pieces chosen for each slot -----
  const emptyPieces = () => Object.fromEntries(SLOTS.map(s => [s, null]));
  let piece = emptyPieces(), colour = emptyPieces();
  const pieceKey = () => SLOTS.filter(s => piece[s]).map(s => s + '=' + piece[s] + (colour[s] ? ':' + colour[s] : '')).join(';') || null;
  function setPiece(slot, name, col) {                  // name = a piece id, or null for the character's own part; col = optional colour (see below)
    if (!SLOTS.includes(slot) || (name && (!PIECES[name] || PIECES[name].slot !== slot))) { warn('unknown piece', slot, name); return Promise.resolve(); }
    piece[slot] = name || null; colour[slot] = name && col ? col : null;
    if (name && slot === 'dress') { piece.top = null; piece.bottom = null; colour.top = colour.bottom = null; }          // a dress replaces the top and the bottom
    if (name && (slot === 'top' || slot === 'bottom')) { piece.dress = null; colour.dress = null; }
    return setOutfit(pieceKey());
  }
  // colour of the piece worn in a slot: a colour id from wardrobe.json (e.g. 'teal'), any '#rrggbb', or null for the piece's own colour
  function setColour(slot, col) {
    if (!piece[slot]) { warn('no piece in slot ' + slot + ' to colour'); return Promise.resolve(); }
    colour[slot] = col || null; return setOutfit(pieceKey());
  }
  function cyclePiece(slot) {
    const options = [null, ...Object.keys(PIECES).filter(n => PIECES[n].slot === slot)];
    setPiece(slot, options[(options.indexOf(piece[slot]) + 1) % options.length]);
  }
  function cycleColour(slot) {
    const p = PIECES[piece[slot]]; if (!p) { world.say3d('Put a ' + slot + ' piece on first.'); return; }
    const ids = [null, ...(p.colors || []).map(c => c.id)];
    if (ids.length < 3 && !p.custom) { world.say3d(p.label + ' has only one colour.'); return; }
    setColour(slot, ids[(ids.indexOf(colour[slot]) + 1) % ids.length]);
  }
  function randomColour(slot) {
    const p = PIECES[piece[slot]]; if (!p) { world.say3d('Put a ' + slot + ' piece on first.'); return; }
    if (!p.custom) { world.say3d(p.label + ' cannot take any colour.'); return; }
    setColour(slot, '#' + new THREE.Color().setHSL(Math.random(), 0.65, 0.6).getHexString());
  }

  // ----- test buttons (made once wardrobe.json has been read, so only slots that have pieces get a button) -----
  function makeButtons() {
    if (!TEST_BUTTONS) return;
    const info = document.getElementById('info'), before = document.getElementById('logoutButton');
    const buttons = [
      ['Test: next character', () => {
        const cur = world.player.userData.characterId, i = testWearers.indexOf(cur), next = testWearers[(i + 1) % testWearers.length];
        wanted = null; piece = emptyPieces(); colour = emptyPieces(); applyCharacter(next); world.say3d('Loading ' + next + '...');
      }],
      ...SLOTS.filter(slot => Object.values(PIECES).some(p => p.slot === slot)).map(slot => ['Test: next ' + slot, () => cyclePiece(slot)]),
      ...['top', 'bottom', 'shoes'].filter(slot => Object.values(PIECES).some(p => p.slot === slot && (p.colors.length > 1 || p.custom))).flatMap(slot =>
        [['Test: ' + slot + ' colour', () => cycleColour(slot)], ['Test: ' + slot + ' random colour', () => randomColour(slot)]]),
      ['Test: own clothes', () => { piece = emptyPieces(); colour = emptyPieces(); setOutfit(null); }],
    ];
    if (DEBUG) buttons.push(['Test: skin on/off', toggleSkin]);
    buttons.forEach(([label, fn]) => {
      const x = document.createElement('button'); x.className = 'ibtn'; x.textContent = label; x.addEventListener('click', fn);
      if (info) info.insertBefore(x, before); else document.body.appendChild(x);
    });
  }
  const ready = loadWardrobe().then(makeButtons);

  // ----- every frame: a new model (character change, reload) gets the chosen outfit put on again -----
  let tick = 0;
  function update(dt) {
    if ((tick += dt) < 0.3) return; tick = 0;
    const u = world.player.userData;
    if (u.model && (!dressed || dressed.model !== u.model)) sync();
  }

  return { update, setOutfit, setPiece, setColour, PIECES, OUTFITS, ready };
}


