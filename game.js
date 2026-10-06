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

// >>> Your three values (same as before). <<<
const SERVER_URL = 'https://naija-server.onrender.com';
const SUPABASE_URL = 'https://imcfgubedcrxmydanabx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dUT0e10wO4IK7t0fzD02Yw_zmuh2ruE';

// ---------------- World settings ----------------

const PX_PER_M = 30;                       // server pixels per metre
const WORLD_W = 3900 / PX_PER_M;           // 130 m
const WORLD_H = 1500 / PX_PER_M;           // 50 m
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
  }
];

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
function afterLogin() { if (localStorage.getItem('characterId')) startGame(); else openChoose(); }

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
  const tag = document.createElement('div'); tag.textContent = 'build 2026-10-06 skin-shrink';
  tag.style.cssText = 'position:fixed;left:8px;bottom:4px;z-index:99;font:11px sans-serif;color:#7f8c8d;pointer-events:none';
  document.body.appendChild(tag);
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

// characters.json says which file belongs to which character id (free / premium / npc).
const CHARACTER_FILES = {};
const CHARACTER_NAMES = {};   // the "name" of each character in characters.json
try {
  const manifest = await (await fetch('characters.json')).json();
  for (const tier of ['free', 'premium', 'npc']) for (const c of manifest[tier] || []) { CHARACTER_FILES[c.id] = c.file; CHARACTER_NAMES[c.id] = c.name; }
} catch (e) { /* no characters.json: the old single character is used */ }

const DEFAULT_CHARACTER = 'male_civilian';

// ---------- Mixamo characters (rigged in Mixamo, downloaded "With Skin") ----------
// A character listed here is loaded straight from its Mixamo .fbx and animated with the shared animation files below.
// Any character NOT listed here keeps using its older .glb from characters.json.
// When the next character is rigged and uploaded, add ONE line, for example:
//   male_wong: 'characters/free/male_wong.fbx',
const MIXAMO_CHARACTERS = {
  male_civilian: 'characters/free/male_civilian_for_mixamo.fbx',
  female_sammie: 'characters/free/female_sammie_for_mixamo.fbx',
};
Object.assign(CHARACTER_FILES, MIXAMO_CHARACTERS);

// One animation set per gender (Mixamo: "FBX Binary", In Place, 30 fps). Every Mixamo character shares the same skeleton,
// so these files work for all characters of that gender.
const MIXAMO_ANIMS = {
  male:   { idle: 'animation/male/Idle.fbx',   walk: 'animation/male/Walking.fbx',   run: 'animation/male/Running.fbx' },
  female: { idle: 'animation/female/Idle.fbx', walk: 'animation/female/Walking.fbx', run: 'animation/female/Running.fbx' },
};

// The character the player picked (the choose-your-character screen will set this later).
function myCharacterId() { return localStorage.getItem('characterId') || DEFAULT_CHARACTER; }

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

const mixamoSetLoads = {};
const mixamoErrors = { male: [], female: [] };   // the real reason an animation file failed, shown in the red banner
function loadMixamoSet(gender) {
  if (!mixamoSetLoads[gender]) {
    mixamoSetLoads[gender] = Promise.all(Object.entries(MIXAMO_ANIMS[gender]).map(([name, file]) =>
      fbxLoader.loadAsync(file).then(fbx => {
        const clip = [...fbx.animations].sort((a, b) => b.duration - a.duration || b.tracks.length - a.tracks.length)[0];
        if (!clip) throw new Error('no animation inside ' + file);
        const h = hipsBone(fbx);
        return { name, clip, hipsY: h ? h.position.y : 0 };
      }).catch(e => { console.warn('Animation file missing or broken:', file, e); mixamoErrors[gender].push(file + ' -> ' + (e && e.message ? e.message : String(e))); return null; })
    )).then(list => Object.fromEntries(list.filter(Boolean).map(a => [a.name, a])));
  }
  return mixamoSetLoads[gender];
}

// share of a texture that is see-through (looks at a small copy of the picture)
async function emptyFraction(tex) {
  try {
    const img = tex.image; if (!img) return 0;
    if (img.decode) await img.decode().catch(() => {});
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 128) n++;
    return n / (64 * 64);
  } catch (e) { return 0; }
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

// average colour of a texture (small copy), used to recognise the skin material
async function meanColor(tex) {
  try {
    const img = tex.image; if (!img) return null;
    if (img.decode) await img.decode().catch(() => {});
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data; let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return n ? { r: r / n, g: gg / n, b: b / n } : null;
  } catch (e) { return null; }
}

async function loadMixamoCharacter(file) {
  const base = file.split('/').pop();
  const gender = base.startsWith('female') ? 'female' : 'male';
  const [fbx, set] = await Promise.all([fbxLoader.loadAsync(file), loadMixamoSet(gender)]);
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

  // Materials: decide for each one whether its texture's "empty" parts are real or just export junk.
  //  - hair / eyelashes: cut out by the texture (soft strands kept)
  //  - a little empty space (rips in jeans): cut out, so the rip shows the body underneath
  //  - mostly empty (a jacket whose see-through channel is junk): ignore it, draw it solid
  const mats = new Set();
  fbx.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => mats.add(m)); });
  const forcedCutout = new URLSearchParams(location.search).get('cutout') === '1';
  await Promise.all([...mats].map(async m => {
    if (m.isMeshPhongMaterial) { m.shininess = 8; m.specular.setScalar(0.08); }
    const isHair = /hair|lash|brow|beard/i.test(m.name || '');
    if (m.map && !/hair|lash|brow|beard/i.test(m.name || '')) await repaintRips(m.map);
    // Skin sits only a few millimetres under tight clothes, so when she bends a knee it can poke through the jeans.
    // Pull the skin surface 3.5 mm inwards (and a touch deeper in the depth buffer) so clothes always cover it.
    const nm = m.name || '';
    let skin = /skin|^body|base|^legs?$|^arms?$|torso|nude/i.test(nm);
    if (!skin && m.map && !/cloth|shirt|top|jacket|coat|legging|jean|pant|trouser|short|skirt|dress|shoe|sneaker|boot|hair|lash|brow|eye|teeth|nail/i.test(nm)) {
      const c = await meanColor(m.map);
      skin = !!c && c.r > c.g * 1.12 && c.g > c.b * 1.05 && c.r - c.b > 40;
    }
    if (skin && new URLSearchParams(location.search).get('noshrink') !== '1') {
      m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
      m.onBeforeCompile = sh => {
        sh.uniforms.uShrink = { value: 0.35 };   // centimetres, because the file is in centimetres until it is scaled down
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uShrink;')
          .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ) - normalize( normal ) * uShrink;');
      };
      m.customProgramCacheKey = () => 'skinshrink';
    }
    const empty = m.map ? await emptyFraction(m.map) : 0;
    const cutout = forcedCutout || isHair || (empty > 0.002 && empty < 0.35);
    m.opacity = 1; m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide;
    m.alphaTest = isHair ? 0.25 : (cutout ? 0.5 : 0);
    if (!cutout) m.alphaMap = null;
    m.needsUpdate = true;
  }));

  // Keep the turning of every bone, and the up-and-down bounce of the hips (scaled to this character's size).
  const animations = Object.values(set).map(a => {
    const ratio = a.hipsY && charHipsY ? charHipsY / a.hipsY : 1;
    const tracks = [];
    for (const t of a.clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      if (prop === 'quaternion') tracks.push(t);
      else if (prop === 'position' && /Hips$/.test(bone)) {
        const v = Array.from(t.values, x => x * ratio);
        tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), v));
      }
    }
    return new THREE.AnimationClip(a.name, a.clip.duration, tracks);
  });

  const scene = new THREE.Group();
  scene.add(fbx);
  return { scene, animations, mixamoNative: true };
}

const characterLoads = new Map();
function loadCharacterFile(file) {
  if (!characterLoads.has(file)) characterLoads.set(file, /\.fbx$/i.test(file)
    ? loadMixamoCharacter(file)
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
const FREE_IDS = ['male_civilian', 'male_wong', 'male_streetwear', 'female_floral', 'female_sammie', 'female_rocker'];
const pick = { gender: 'male', id: null };
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
  showPanel('pChoose'); startPreview(); resizePreview(); showGender(pick.gender);
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
  const want = speed < 0.3 ? 'idle' : speed < 2.5 ? 'walk' : 'run';
  if (want !== u.state) {
    const next = u.actions[want], prev = u.actions[u.state];
    next.reset().play();
    next.crossFadeFrom(prev, 0.25, false);
    u.state = want;
  }
  if (want === 'walk') u.actions.walk.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.5, 1.6);
  if (want === 'run') u.actions.run.timeScale = THREE.MathUtils.clamp(speed / 3.6, 0.8, 1.6);
  u.mixer.update(dt);
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
    this.bindInput();
    this.applyGate();
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
    parent.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9d3ee);
    this.scene.fog = new THREE.Fog(0xa9d3ee, 70, 190);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x7a6a50, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
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
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#7d9059'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 90 + Math.random() * 60;
      ctx.fillStyle = `rgba(${v + 20},${v + 40},${v - 10},0.35)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(WORLD_W / 6, WORLD_H / 6);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, -0.04, WORLD_H / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Beyond the world edge: more ground so the horizon is not a cliff
    const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x748754, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(WORLD_W / 2, -0.08, WORLD_H / 2);
    this.scene.add(far);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3d4046, roughness: 0.95 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, ROAD_Z1 - ROAD_Z0), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(WORLD_W / 2, -0.02, (ROAD_Z0 + ROAD_Z1) / 2);
    road.receiveShadow = true;
    this.scene.add(road);
    const dash = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.9 });
    for (let x = 2; x < WORLD_W; x += 4) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.14), dash);
      d.rotation.x = -Math.PI / 2; d.position.set(x, -0.015, (ROAD_Z0 + ROAD_Z1) / 2); this.scene.add(d);
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
    b.boxes.forEach(([x0, x1, z0, z1]) => {
      let a = [x0, x1, z0, z1];
      for (let i = 0; i < r; i++) a = [a[2], a[3], -a[1], -a[0]];   // 90 degrees turn
      this.boxes.push({ x0: b.x + a[0], x1: b.x + a[1], z0: b.z + a[2], z1: b.z + a[3] });
    });

    // Name zone for the top-left text
    b.zone = { x0: b.x - 14, x1: b.x + 14, z0: b.z - 14, z1: b.z + 14 };

    if (b.interior) {                    // a room you can walk into: hidden until the player is inside
      b.room = b.interior();
      b.inside = false;
      root.add(b.room.group, b.room.marker);
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

  // ----- HUD (plain HTML on top of the 3D view) -----
  buildHud() {
    const css = document.createElement('style');
    css.textContent = `
      .hud { position: fixed; left: 12px; font-family: Georgia, serif; color: #fff; background: #00000088;
             padding: 6px 10px; border-radius: 4px; z-index: 5; user-select: none; }
      .hud.btn { cursor: pointer; background: #3a566d; font-size: 16px; }
      #stickBase, #stickKnob { position: fixed; border-radius: 50%; z-index: 6; display: none; pointer-events: none; }
      #stickBase { width: 110px; height: 110px; background: #ffffff26; }
      #stickKnob { width: 52px; height: 52px; background: #ffffff73; }`;
    document.head.appendChild(css);
    const mk = (id, top, extra = '') => {
      const d = document.createElement('div'); d.id = id; d.className = 'hud ' + extra; d.style.top = top + 'px';
      document.body.appendChild(d); return d;
    };
    this.zoneText = mk('zoneText', 10); this.zoneText.style.fontSize = '20px';
    this.testButton = mk('testButton', 50, 'btn'); this.testButton.style.background = '#2c6e9b'; this.testButton.style.display = 'none';
    this.testButton.addEventListener('click', () => this.toggleProgressTest());
    this.statusText = mk('statusText', 96); this.statusText.style.color = '#ffe9a8'; this.statusText.style.fontSize = '16px';
    this.logoutButton = mk('logoutButton', 134, 'btn'); this.logoutButton.textContent = 'Log out';
    this.logoutButton.addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    this.stickBase = document.createElement('div'); this.stickBase.id = 'stickBase';
    this.stickKnob = document.createElement('div'); this.stickKnob.id = 'stickKnob';
    document.body.append(this.stickBase, this.stickKnob);
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
      this.updateStatus();
    });

    this.socket.on('progress', d => { this.progress = d.progress; this.applyGate(); });
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
    for (const b of all) {
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
    const vx = (fx * iy + rx * ix) * SPEED;
    const vz = (fz * iy + rz * ix) * SPEED;

    const p = this.player.position;
    p.x += vx * dt; p.z += vz * dt;
    p.x = THREE.MathUtils.clamp(p.x, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    this.collide(p);
    this.collide(p);

    const speed = Math.hypot(vx, vz);
    if (speed > 0.2) turnTowards(this.player, Math.atan2(vx, vz), dt);
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
      animateAvatar(o.av, Math.min(sp, SPEED), dt);
    });

    // camera follows from behind and above
    const c = this.cam;
    const target = new THREE.Vector3(p.x, 1.5, p.z);
    const cp = Math.cos(c.pitch);
    const want = new THREE.Vector3(p.x + Math.sin(c.yaw) * cp * c.dist, 1.5 + Math.sin(c.pitch) * c.dist, p.z + Math.cos(c.yaw) * cp * c.dist);
    if (!this.look) { this.look = target.clone(); this.camera.position.copy(want); }
    const s = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(want, s);
    this.look.lerp(target, s);
    this.camera.lookAt(this.look);

    // buildings with an interior: show the room (and hide the outside model) while the player is inside it
    BUILDINGS.forEach(b => {
      if (!b.room) return;
      const inside = Math.abs(p.x - b.x) < b.room.halfW - 0.1 && Math.abs(p.z - b.z) < b.room.halfD - 0.1;
      if (inside !== b.inside) {
        b.inside = inside;
        b.room.setInside(inside);
        if (b.exterior) b.exterior.visible = !inside;
      }
      if (inside) b.room.setCamera(this.camera.position.x - b.x, this.camera.position.z - b.z);
    });

    // keep the sun's shadow box around the player
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.position.set(p.x + 30, 50, p.z + 20);

    this.renderer.render(this.scene, this.camera);
  }
}

// start only after everything above has been defined
boot();
