// NIN card quest: Ivory (NPC at the Immigration Office), the form, the 2-minute wait, the card in the bag.
// game.js calls initNin() once the world exists and forwards the server messages 'init' (nin), 'nin' and 'nin_error' to it.
// The server (server.js) owns the rules: age 16-40, the 2-minute timer, the unique NIN. This file only shows things.
//
// Card picture: props/nin_card_template.webp with the player's details drawn on it (fields measured from your design).
// Signature font: loaded from Google Fonts, so no font file is needed.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import * as OFFICE from './immigration_office.js';
// (read through the namespace so an old cached immigration_office.js cannot stop the game from starting)
const IVORY_SPOT = OFFICE.IVORY_SPOT || { x: -7.7, z: 3.2, rotY: Math.PI / 2 };

const TEMPLATE_URL = 'props/nin_card_template.webp';
const IVORY_FILE = 'characters/npc/female_ivory.glb';
const TALK_RANGE = 3.6;            // metres from Ivory at which "Talk to Ivory" appears
const AGE_MIN = 16, AGE_MAX = 40;  // the server checks this too
const NAME_RE = /^[A-Za-z][A-Za-z'\- ]{1,19}$/;

// ===== QR START ==========================================================================================================
// A small QR code maker (byte mode, error level M, versions 1 to 6 = up to 106 bytes). Returns rows of true/false.
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; }
const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);
function rsEncode(data, eccLen) {
  let gen = [1];
  for (let i = 0; i < eccLen; i++) {                       // gen = gen * (x - alpha^i)
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= gfMul(c, GF_EXP[i]); });
    gen = next;
  }
  const rem = new Array(eccLen).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift(); rem.push(0);
    if (f) for (let i = 0; i < eccLen; i++) rem[i] ^= gfMul(gen[i + 1], f);
  }
  return rem;
}
const QR_M = [null, { total: 26, ecc: 10, blocks: 1 }, { total: 44, ecc: 16, blocks: 1 }, { total: 70, ecc: 26, blocks: 1 },
  { total: 100, ecc: 18, blocks: 2 }, { total: 134, ecc: 24, blocks: 2 }, { total: 172, ecc: 16, blocks: 4 }];
const QR_ALIGN = [null, null, 18, 22, 26, 30, 34];

function makeQR(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  const dataCw = v => QR_M[v].total - QR_M[v].ecc * QR_M[v].blocks;
  while (ver <= 6 && dataCw(ver) * 8 < 12 + bytes.length * 8) ver++;
  if (ver > 6) throw new Error('QR text too long');
  const cap = dataCw(ver) * 8, bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(4, 4); push(bytes.length, 8); bytes.forEach(b => push(b, 8));
  push(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
  const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  const { ecc, blocks } = QR_M[ver], per = cw.length / blocks;
  const dBlocks = [], eBlocks = [];
  for (let b = 0; b < blocks; b++) { const d = cw.slice(b * per, (b + 1) * per); dBlocks.push(d); eBlocks.push(rsEncode(d, ecc)); }
  const all = [];
  for (let i = 0; i < per; i++) dBlocks.forEach(d => all.push(d[i]));
  for (let i = 0; i < ecc; i++) eBlocks.forEach(e => all.push(e[i]));

  const size = 17 + 4 * ver;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      // timing lines
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (QR_ALIGN[ver]) {                                                                    // one alignment pattern (versions 2 to 6)
    const c = QR_ALIGN[ver];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const data = mask; let rem = data;                                                    // error level M = 00
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412, bit = i => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);                                                               // the always-dark module
  };
  drawFormat(0);                                                                          // reserves the format areas

  // data bits, zig-zag from the bottom right
  let k = 0; const total = all.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && k < total) { mod[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0; k++; }
    }
  }
  const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0;
    const line = get => {                                                                 // runs of 5+ and finder-like 1:1:3:1:1 patterns
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        for (let b = 0; b + 10 < size; b++) {
          const s = []; for (let t = 0; t < 11; t++) s.push(get(a, b + t) ? 1 : 0);
          const j = s.join('');
          if (j === '10111010000' || j === '00001011101') p += 40;
        }
      }
    };
    line((a, b) => mod[a][b]); line((a, b) => mod[b][a]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
    let dark = 0; for (const r of mod) for (const c of r) if (c) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
  applyMask(best); drawFormat(best);
  return mod;
}
// ===== QR END ============================================================================================================

// ===== CARD START ========================================================================================================
// Field boxes on nin_card_template.webp (1200 x 822), measured from your design: [left, top, right, bottom]
const CARD_W = 1200, CARD_H = 822;
const BOX = {
  photo: [71, 253, 364, 621], name: [403, 259, 1143, 295], nin: [403, 325, 1143, 361], dob: [404, 392, 765, 427],
  sex: [795, 392, 1143, 427], nat: [404, 459, 897, 494], state: [404, 525, 897, 561], reg: [404, 592, 897, 627],
  qr: [938, 495, 1138, 694], doc: [932, 744, 1143, 779], sig: [71, 675, 891, 777]
};
const INK = '#0d2a1b', SIGN_INK = '#14245c';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const fmtDate = iso => { const [y, m, d] = String(iso).split('-').map(Number); return String(d).padStart(2, '0') + ' ' + MONTHS[m - 1] + ' ' + y; };
const fmtNin = n => String(n).replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');

let templatePromise = null;
const loadTemplate = () => templatePromise || (templatePromise = new Promise((ok, fail) => {
  const img = new Image(); img.onload = () => ok(img); img.onerror = () => fail(new Error('Could not load ' + TEMPLATE_URL)); img.src = TEMPLATE_URL;
}));

let fontPromise = null;
function loadSignatureFont() {
  if (!fontPromise) {
    const link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Mrs+Saint+Delafield&display=swap'; document.head.appendChild(link);
    fontPromise = Promise.race([
      Promise.all([document.fonts.load('64px "Mrs Saint Delafield"', 'Abc'), document.fonts.load('700 28px Inter', 'Abc')]).catch(() => {}),
      new Promise(r => setTimeout(r, 3500))                      // never wait more than 3.5 s: the fallback font is used then
    ]);
  }
  return fontPromise;
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size;
  for (; s > 12; s -= 1) { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; }
  return s;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Draws the finished card. photo = a canvas with the player's picture (or null for a plain silhouette).
async function drawCard(card, photo) {
  const [tpl] = await Promise.all([loadTemplate(), loadSignatureFont()]);
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(tpl, 0, 0, CARD_W, CARD_H);

  // photo (cover-fit, rounded)
  { const [x0, y0, x1, y1] = BOX.photo, w = x1 - x0, h = y1 - y0;
    ctx.save(); roundRect(ctx, x0, y0, w, h, 14); ctx.clip();
    ctx.fillStyle = '#dfe8ef'; ctx.fillRect(x0, y0, w, h);
    if (photo) {
      const s = Math.max(w / photo.width, h / photo.height), dw = photo.width * s, dh = photo.height * s;
      ctx.drawImage(photo, x0 + (w - dw) / 2, y0 + (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#9fb3c6'; ctx.beginPath(); ctx.arc(x0 + w / 2, y0 + h * 0.38, w * 0.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x0 + w / 2, y0 + h * 0.95, w * 0.38, h * 0.32, 0, 0, 7); ctx.fill();
    }
    ctx.restore(); }

  // text fields
  const text = (key, value) => {
    const [x0, y0, x1, y1] = BOX[key], pad = 14, family = 'Inter, "Segoe UI", Arial, sans-serif';
    const size = fitText(ctx, value, x1 - x0 - pad * 2, 27, 700, family);
    ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `700 ${size}px ${family}`;
    ctx.fillText(value, x0 + pad, (y0 + y1) / 2 + 1);
  };
  text('name', card.name); text('nin', fmtNin(card.nin)); text('dob', fmtDate(card.dob)); text('sex', card.sex);
  text('nat', card.nationality); text('state', card.state); text('reg', fmtDate(card.registered)); text('doc', card.doc);

  // signature: the name in a fine handwritten font
  { const [x0, y0, x1, y1] = BOX.sig, sign = card.first + ' ' + card.last, family = '"Mrs Saint Delafield", "Segoe Script", cursive';
    const size = fitText(ctx, sign, (x1 - x0) * 0.62, 92, 400, family);
    ctx.save(); ctx.fillStyle = SIGN_INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `400 ${size}px ${family}`;
    ctx.translate(x0 + 44, (y0 + y1) / 2 + 6); ctx.rotate(-0.045); ctx.fillText(sign, 0, 0); ctx.restore(); }

  // QR code (holds the NIN and document number)
  { const [x0, y0, x1, y1] = BOX.qr, m = makeQR('NAIJAVERSE|' + card.nin + '|' + card.doc), n = m.length, quiet = 3;
    const cell = Math.floor(Math.min(x1 - x0, y1 - y0) / (n + quiet * 2)), full = cell * (n + quiet * 2);
    const ox = x0 + ((x1 - x0) - full) / 2, oy = y0 + ((y1 - y0) - full) / 2;
    ctx.fillStyle = '#fff'; ctx.fillRect(ox, oy, full, full); ctx.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) ctx.fillRect(ox + (x + quiet) * cell, oy + (y + quiet) * cell, cell, cell); }
  return cv;
}
// ===== CARD END ==========================================================================================================

// A head-and-shoulders picture of the player's own character (drawn once, in a small private renderer).
function capturePhoto(player) {
  try {
    const src = player.userData.model; if (!src) return null;
    const model = cloneSkinned(src);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(300, 370, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd9e6f2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5)); const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(1.5, 2.5, 3); scene.add(sun);
    scene.add(model);
    const idle = player.userData.actions && player.userData.actions.idle;      // calm standing pose
    if (idle) { const mixer = new THREE.AnimationMixer(model); mixer.clipAction(idle.getClip()).play(); mixer.update(0.05); }
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), top = box.max.y;
    const cam = new THREE.PerspectiveCamera(26, 300 / 370, 0.05, 20);
    cam.position.set(0, top - 0.24, 1.55); cam.lookAt(0, top - 0.27, 0);
    renderer.render(scene, cam);
    const out = document.createElement('canvas'); out.width = 300; out.height = 370;
    out.getContext('2d').drawImage(renderer.domElement, 0, 0);
    renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
    return out;
  } catch (e) { console.warn('NIN photo not made:', e); return null; }
}

const CSS = `
#ninPrompt{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;display:none;
  font:700 17px Inter,system-ui,sans-serif;color:#111;padding:13px 26px;border:0;border-radius:999px;cursor:pointer;
  background:linear-gradient(180deg,#ffd84d,#ffb800);box-shadow:0 4px 18px rgba(255,184,0,.5);animation:ninPulse 1.4s ease-in-out infinite}
@keyframes ninPulse{50%{transform:translateX(-50%) scale(1.05)}}
#ninBubble{position:fixed;left:50%;bottom:calc(210px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;display:none;max-width:86vw;
  font:600 15px Inter,system-ui,sans-serif;color:#fff;padding:10px 16px;border-radius:16px;background:rgba(8,20,44,.88);border:1px solid #1f4a8a;text-align:center}
.nin-ov{position:fixed;inset:0;z-index:60;display:none;background:rgba(3,10,24,.55);font-family:Inter,system-ui,sans-serif;color:#f3f6ff}
.nin-sheet{box-sizing:border-box;position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(560px,100vw);max-height:92vh;overflow-y:auto;
  padding:18px 18px calc(18px + env(safe-area-inset-bottom));background:rgba(8,20,44,.95);border:1px solid #1f4a8a;border-bottom:0;border-radius:22px 22px 0 0}
.nin-who{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}.nin-who b{font-size:20px;color:#ffc61a}.nin-who span{font-size:13px;color:#9fb3d1}
.nin-say{font-size:16px;line-height:1.45;margin:4px 0 12px}
.nin-sheet input{width:100%;font:inherit;font-size:16px;padding:12px 16px;margin-bottom:10px;border-radius:999px;border:1px solid #1f4a8a;background:rgba(16,38,74,.65);color:#fff;outline:none;box-sizing:border-box}
.nin-sheet input:focus{border-color:#ffc61a}
.nin-err{min-height:18px;font-size:14px;color:#ffb3a8;margin:0 0 8px}
.nin-btns{display:flex;gap:10px;flex-wrap:wrap}
.nin-btns button{flex:1;min-width:120px;font:700 16px Inter,system-ui,sans-serif;padding:13px;border-radius:999px;border:1px solid #1f4a8a;cursor:pointer;color:#fff;background:rgba(16,38,74,.7)}
.nin-btns button.p{border:0;color:#111;background:linear-gradient(180deg,#ffd84d,#ffb800)}
.nin-btns button:disabled{opacity:.55}
.nin-mid{box-sizing:border-box;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,640px);max-height:92vh;overflow-y:auto;padding:16px;
  background:rgba(8,20,44,.96);border:1px solid #1f4a8a;border-radius:22px}
.nin-mid h2{margin:0 0 10px;font-size:20px}.nin-mid h2 b{color:#ffc61a}
.nin-mid canvas{width:100%;height:auto;display:block;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.5);margin-bottom:12px}
.nin-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.nin-slot{aspect-ratio:1;border-radius:14px;border:1px solid #1f4a8a;background:rgba(16,38,74,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:6px;font-size:12px;font-weight:700;color:#9fb3d1;text-align:center;padding:6px;cursor:default}
.nin-slot.has{cursor:pointer;border-color:#ffc61a;color:#ffc61a;background:rgba(40,60,20,.55)}
.nin-slot .ic{font-size:30px}.nin-empty{font-size:14px;color:#9fb3d1;margin:6px 0 14px}
`;

export function initNin(opts) {
  const { world, building, makeAvatar, animateAvatar } = opts;
  const b = building;
  const style = document.createElement('style'); style.id = 'ninStyle'; style.textContent = CSS; document.head.appendChild(style);
  loadSignatureFont();                                                  // start loading the handwriting font early

  // ----- Ivory -----
  const ivory = makeAvatar(0xffffff, 'female_ivory');
  ivory.position.set(b.x + IVORY_SPOT.x, 0, b.z + IVORY_SPOT.z);
  ivory.rotation.y = IVORY_SPOT.rotY;
  ivory.visible = false;
  world.scene.add(ivory);
  world.setLabel(ivory, 'Ivory');

  // ----- screen pieces -----
  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
  const prompt = el('button', { id: 'ninPrompt', type: 'button', textContent: 'Talk to Ivory' });
  const bubble = el('div', { id: 'ninBubble' });
  const dlg = el('div', { className: 'nin-ov', id: 'ninDlg' }, `<div class="nin-sheet">
    <div class="nin-who"><b>Ivory</b><span>Immigration Officer</span></div><div class="nin-say" id="ninSay"></div>
    <div id="ninForm" style="display:none">
      <input id="ninFirst" placeholder="First name" maxlength="20" autocomplete="off" autocapitalize="words">
      <input id="ninLast" placeholder="Last name" maxlength="20" autocomplete="off" autocapitalize="words">
      <input id="ninAge" placeholder="Age (${AGE_MIN} to ${AGE_MAX})" inputmode="numeric" maxlength="2" autocomplete="off">
      <div class="nin-err" id="ninErr"></div></div>
    <div class="nin-btns" id="ninBtns"></div></div>`);
  const bag = el('div', { className: 'nin-ov', id: 'ninBag' }, `<div class="nin-mid"><h2>Inventory</h2><div id="ninSlots" class="nin-slots"></div>
    <div id="ninEmpty" class="nin-empty"></div><div class="nin-btns"><button type="button" class="p" id="ninBagClose">Close</button></div></div>`);
  const view = el('div', { className: 'nin-ov', id: 'ninView' }, `<div class="nin-mid"><h2 id="ninViewTitle"></h2><div id="ninViewBox"></div>
    <div class="nin-btns"><button type="button" class="p" id="ninViewClose">Close</button></div></div>`);
  const $ = id => document.getElementById(id);
  const say = $('ninSay'), form = $('ninForm'), err = $('ninErr'), btns = $('ninBtns');

  // typing in the form must not move the player (game.js listens to every key on the window)
  ['ninFirst', 'ninLast', 'ninAge'].forEach(id => ['keydown', 'keyup'].forEach(t => $(id).addEventListener(t, e => e.stopPropagation())));

  // ----- state -----
  let st = { status: 'loading' }, readyAt = 0, pending = null, inRange = false, dialogOpen = false, lastBubble = -1e9, lastQuestText = '';
  const quest = document.getElementById('questTask');
  const msLeft = () => Math.max(0, readyAt - performance.now());
  const clock = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function questText() {
    if (world.progress === 'indigene') return 'TASK: Explore Naija';
    if (st.status === 'none') return 'TASK: Go to the Immigration Office and get your NIN';
    if (st.status === 'waiting') return 'TASK: Wait in the waiting area (' + clock(msLeft()) + ')';
    if (st.status === 'ready') return 'TASK: Collect your NIN card from Ivory';
    if (st.status === 'issued') return 'TASK: Become Indigene';
    return 'TASK: Become Indigene';                                      // loading / not set up: the old task
  }
  function refreshQuest() {
    if (!quest) return;
    const t = questText(); if (t !== lastQuestText) { quest.textContent = t; lastQuestText = t; }
  }

  // ----- dialogue -----
  function open(el2) { el2.style.display = 'block'; }
  function close(el2) { el2.style.display = 'none'; }
  function closeDialog() { close(dlg); dialogOpen = false; pending = null; world.keys = {}; }
  function showDialog(text, buttons, withForm = false) {
    dialogOpen = true; prompt.style.display = 'none'; world.keys = {};
    say.textContent = text; form.style.display = withForm ? 'block' : 'none'; err.textContent = '';
    btns.innerHTML = '';
    buttons.forEach(bt => { const x = document.createElement('button'); x.type = 'button'; x.textContent = bt.label; if (bt.primary) x.className = 'p'; x.addEventListener('click', bt.onClick); btns.appendChild(x); });
    open(dlg);
  }
  const okButton = [{ label: 'OK', primary: true, onClick: closeDialog }];

  function talk() {
    if (st.status === 'none') {
      showDialog('Welcome to Naija. Fill in your details.', [
        { label: 'Submit', primary: true, onClick: submitForm }, { label: 'Cancel', onClick: closeDialog }], true);
    } else if (st.status === 'waiting') {
      showDialog('Please keep waiting. Your card is not ready yet. About ' + clock(msLeft()) + ' left. You can wait in the waiting area.', okButton);
    } else if (st.status === 'ready') {
      showDialog('Thank you for waiting. Your NIN card is ready.', [
        { label: 'Collect NIN card', primary: true, onClick: collect }, { label: 'Later', onClick: closeDialog }]);
    } else if (st.status === 'disabled') {
      showDialog('Sorry, my computer is down today. Please come back later.', okButton);
    }
  }

  function submitForm() {
    const first = $('ninFirst').value.trim().replace(/\s+/g, ' '), last = $('ninLast').value.trim().replace(/\s+/g, ' '), age = Number($('ninAge').value);
    if (!NAME_RE.test(first) || !NAME_RE.test(last)) { err.textContent = 'Names use letters only (2 to 20 characters).'; return; }
    if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) { err.textContent = 'Age must be between ' + AGE_MIN + ' and ' + AGE_MAX + '.'; return; }
    if (!world.socket || !world.socket.connected) { err.textContent = 'Not connected to the server. Try again.'; return; }
    pending = 'submit'; err.textContent = '';
    [...btns.children].forEach(x => { x.disabled = true; });
    world.socket.emit('nin_submit', { first, last, age });
  }
  function collect() {
    if (!world.socket || !world.socket.connected) return;
    pending = 'collect'; [...btns.children].forEach(x => { x.disabled = true; });
    world.socket.emit('nin_collect');
  }

  // ----- the card, the bag -----
  let cardCache = null;                                                   // { key, canvas }
  let photoCache = null;
  async function cardCanvas() {
    const card = st.card, cid = world.player.userData.characterId || '';
    const key = card.nin + '|' + cid;
    if (cardCache && cardCache.key === key) return cardCache.canvas;
    if (!photoCache || photoCache.cid !== cid) { const photo = capturePhoto(world.player); photoCache = photo ? { cid, photo } : null; }
    const canvas = await drawCard(card, photoCache ? photoCache.photo : null);
    cardCache = { key, canvas }; return canvas;
  }
  async function showCard(title) {
    $('ninViewTitle').innerHTML = title; const box = $('ninViewBox'); box.textContent = 'Preparing your card...';
    open(view);
    try { const c = await cardCanvas(); const copy = document.createElement('canvas'); copy.width = c.width; copy.height = c.height; copy.getContext('2d').drawImage(c, 0, 0); box.textContent = ''; box.appendChild(copy); }
    catch (e) { console.error(e); box.textContent = 'Could not draw the card: ' + (e && e.message ? e.message : e); }
  }
  function openBag() {
    const slots = $('ninSlots'); slots.innerHTML = '';
    if (st.status === 'issued') {
      const s = document.createElement('div'); s.className = 'nin-slot has'; s.innerHTML = '<div class="ic">\u{1FAAA}</div>NIN Card';
      s.addEventListener('click', () => { close(bag); showCard('Your <b>NIN</b> card'); }); slots.appendChild(s);
    }
    $('ninEmpty').textContent = st.status === 'issued' ? 'Tap an item to look at it.' : 'Your bag is empty.';
    open(bag);
  }
  // take over the bag button (capture phase, so it runs before anything else bound to it)
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#btnBag'); if (!t) return;
    e.stopImmediatePropagation(); e.preventDefault(); openBag();
  }, true);
  $('ninBagClose').addEventListener('click', () => close(bag));
  $('ninViewClose').addEventListener('click', () => close(view));
  prompt.addEventListener('click', talk);

  // ----- messages from the server (game.js forwards them) -----
  function setState(s) {
    if (!s) return;
    const before = st.status;
    st = s;
    if (s.status === 'waiting') readyAt = performance.now() + s.remainingMs;
    refreshQuest();
    if (pending === 'submit' && s.status === 'waiting') {
      pending = null;
      showDialog('Thank you. Please wait 2 minutes in the waiting area. I will call you when your card is ready.', okButton);
    } else if (pending === 'collect' && s.status === 'issued') {
      pending = null; closeDialog(); showCard('NIN card added to your <b>inventory</b>');
    } else if (pending === 'collect' && s.status === 'waiting') {          // asked a moment too early: she says keep waiting
      pending = null; talk();
    } else if (dialogOpen && pending === null && before !== s.status && s.status !== 'waiting') { closeDialog(); }
  }
  function error(msg) {
    if (dialogOpen) {
      err.textContent = msg; pending = null; [...btns.children].forEach(x => { x.disabled = false; });
      if (form.style.display === 'none') say.textContent = msg;
    } else world.say3d(msg);
  }

  // dev helpers (only when the server runs with DEV_TOOLS=true)
  let devMade = false;
  function setDev(on) {
    if (!on || devMade) return; devMade = true;
    const info = document.getElementById('info'), before = document.getElementById('logoutButton');
    [['Test: reset NIN', 'reset'], ['Test: skip wait', 'skip']].forEach(([label, action]) => {
      const x = document.createElement('button'); x.className = 'ibtn'; x.textContent = label;
      x.addEventListener('click', () => world.socket && world.socket.emit('dev_nin', action));
      if (info) info.insertBefore(x, before); else document.body.appendChild(x);
    });
  }

  // ----- every frame -----
  let tick = 0;
  function update(dt) {
    ivory.visible = !!b.inside;
    if (ivory.visible) animateAvatar(ivory, 0, dt);
    const p = world.player.position, d = Math.hypot(p.x - ivory.position.x, p.z - ivory.position.z);
    const near = ivory.visible && d < TALK_RANGE;

    if (st.status === 'waiting' && msLeft() <= 0) { st = { status: 'ready' }; refreshQuest(); }          // the server confirms when she is asked
    if ((tick += dt) > 0.25) { tick = 0; if (st.status === 'waiting') refreshQuest(); }

    const canTalk = near && !dialogOpen && ['none', 'waiting', 'ready', 'disabled'].includes(st.status);
    prompt.style.display = canTalk ? 'block' : 'none';
    prompt.textContent = st.status === 'ready' ? 'Talk to Ivory \u2728' : 'Talk to Ivory';

    // after the card is collected she only has a short line for you
    if (near && st.status === 'issued' && !inRange && performance.now() - lastBubble > 20000) {
      lastBubble = performance.now(); bubble.textContent = 'Ivory: Welcome to Naija! Your NIN card is in your bag.'; bubble.style.display = 'block';
      setTimeout(() => { bubble.style.display = 'none'; }, 4500);
    }
    inRange = near;
    if (dialogOpen && !near) closeDialog();                                                               // walked away
  }

  refreshQuest();
  return { setState, error, setDev, update, refreshQuest, ivory };
}

export { IVORY_FILE };
