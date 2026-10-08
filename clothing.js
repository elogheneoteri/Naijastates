// clothing.js  (put one character's outfit on another character of the same gender)
//
// How it works (all Mixamo characters share the same 65-bone skeleton, so one set of animations drives all of them):
//   1. The wearer (the player's character) is loaded as usual.
//   2. The outfit source (any other character in characters.json: free, premium or clothing) is loaded once and kept (game.js caches it).
//   3. The outfit's clothing parts are copied and re-attached to the WEARER's bones by bone name.
//   4. The wearer's own clothing parts are hidden. Face, hair and skin stay.
//   5. The wearer's own body and legs are masked wherever the outfit is drawn on the screen (a stencil mask), so skin cannot poke
//      through even when the clothes were cut for another body. Arms, hands and head are never masked.
//   6. Taking the outfit off removes the copies and shows the hidden parts again.
//
// If anything is missing or goes wrong, the character is left exactly as it was and the reason is written in the browser console
// (look for lines starting with [clothing]).
//
// Test buttons under the minimap:  "Test: next character" (cycles through the free characters)  and  "Test: next outfit".
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

import * as THREE from 'three';

// each character's own clothing parts: hidden while it wears another outfit, copied when somebody else wears them
const CLOTHES = {
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
const SKIN_MASKED = /^(std_skin_)?(body|legs?)\d*$/i;

// outfits: one for every character in CLOTHES. The outfit id is the character id without male_ / female_
const idOf = c => c.replace(/^(fe)?male_/, '');
const OUTFITS = {};
for (const c of Object.keys(CLOTHES)) OUTFITS[idOf(c)] = { label: OUTFIT_LABELS[c] || (idOf(c) + ' outfit'), source: c, take: CLOTHES[c] };
const genderOf = c => String(c).split('_')[0];

const plain = m => { const x = Array.isArray(m) ? m[0] : m; return ((x && x.name) || '').replace(/^m\d+_/i, '').replace(/mat$/i, ''); };
const log = (...a) => console.log('[clothing]', ...a);
const warn = (...a) => console.warn('[clothing]', ...a);

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
    model.userData.outfitParts.added.forEach(m => { if (m.parent) m.parent.remove(m); if (m.skeleton) m.skeleton.dispose(); });
    model.userData.outfitParts.hidden.forEach(m => { m.visible = true; });
    (model.userData.outfitParts.skinSwaps || []).forEach(s => { s.mesh.material = s.material; s.mesh.renderOrder = s.order; });
    model.userData.outfitParts = null;
  }

  // ----- put an outfit on a model. Returns true when it worked. Nothing changes unless everything is ready. -----
  async function dress(model, characterId, outfitId) {
    const outfit = OUTFITS[outfitId];
    if (!outfit) { warn('unknown outfit', outfitId); return false; }
    const hideNames = CLOTHES[characterId];
    if (!hideNames) {
      const names = new Set(); model.traverse(o => { if (o.isSkinnedMesh) names.add(plain(o.material)); });
      warn(characterId + ' cannot wear outfits yet. Add it to CLOTHES in clothing.js. Its parts are: ' + [...names].join(', '));
      return false;
    }
    if (genderOf(characterId) !== genderOf(outfit.source)) { warn('an outfit only fits the same gender: ' + characterId + ' / ' + outfit.source); return false; }
    if (outfit.source === characterId) { strip(model); return true; }                 // the character's own outfit is simply its own clothes
    let src;
    try { src = await loadSource(outfit.source); } catch (e) { warn('could not load the outfit source', outfit.source, e); return false; }
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
    if (!hidden.length) warn('none of the wearer\'s own clothing parts were found (' + hideNames.join(', ') + '): the outfit will be added on top');
    else if (hidden.length < hideNames.length) warn('some of the wearer\'s own clothing parts were not found. Found: ' + hidden.map(m => plain(m.material)).join(', '));

    // the size of one metre in the source file's units (the files are either in metres or in centimetres)
    let tall = 0;
    src.scene.traverse(sm => {
      if (!sm.isSkinnedMesh) return;
      if (!sm.geometry.boundingBox) sm.geometry.computeBoundingBox();
      tall = Math.max(tall, sm.geometry.boundingBox.max.y - sm.geometry.boundingBox.min.y);
    });
    const amount = (inflateMM / 1000) * (tall > 10 ? 100 : 1);

    // build every copy first; only add them if all of them are fine
    const parent = baseMesh.parent;
    const copies = [], missing = new Set(), found = new Set();
    src.scene.traverse(sm => {
      if (!sm.isSkinnedMesh) return;
      const name = plain(sm.material);
      if (!outfit.take.includes(name)) return;
      found.add(name);
      const bones = sm.skeleton.bones.map(b => { const nb = baseBones[b.name]; if (!nb) missing.add(b.name); return nb; });
      if (bones.some(b => !b)) return;
      const copy = sm.clone();
      const masks = MASK && !SKIP_MASK.test(name);
      copy.material = masks ? withStencil(grow(sm.material, amount), 'outfit') : grow(sm.material, amount);
      if (masks) copy.renderOrder = -1;                                               // drawn before the skin, so the mask is ready
      copy.castShadow = true; copy.receiveShadow = true; copy.frustumCulled = false;
      copy.userData = { outfitPart: name, pending: { bones, inverses: sm.skeleton.boneInverses.map(m => m.clone()), bind: sm.bindMatrix.clone() } };
      copies.push(copy);
    });
    const lost = outfit.take.filter(n => !found.has(n));
    if (missing.size) { warn('bones missing on the wearer, outfit not put on:', [...missing].join(', ')); return false; }
    if (lost.length) { warn('parts not found in the outfit source:', lost.join(', ')); if (!copies.length) return false; }

    hidden.forEach(m => { m.visible = false; });
    copies.forEach(copy => {
      const p = copy.userData.pending; delete copy.userData.pending;
      parent.add(copy); copy.updateMatrixWorld(true);
      copy.bind(new THREE.Skeleton(p.bones, p.inverses), p.bind);                     // the part now follows the wearer's bones
    });
    const skinSwaps = [];
    if (MASK) model.traverse(o => { if (o.isSkinnedMesh && !o.userData.outfitPart && !hidden.includes(o) && SKIN_MASKED.test(plain(o.material))) skinSwaps.push({ mesh: o, material: o.material, order: o.renderOrder }); });
    skinSwaps.forEach(s => { s.mesh.material = withStencil(s.material, 'skin'); s.mesh.renderOrder = 1; });
    model.userData.outfitParts = { added: copies, hidden, skinSwaps };
    log(outfit.label + ' put on ' + characterId + ': ' + copies.length + ' parts added (' + copies.map(c => c.userData.outfitPart).join(', ') + '), ' + hidden.length + ' own parts hidden, grown ' + (amount ? inflateMM + ' mm' : 'not at all') + ', skin masked on ' + skinSwaps.length + ' parts (' + skinSwaps.map(s => plain(s.material)).join(', ') + ').');
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
        if (ok) { dressed = { model, outfit: wanted }; world.say3d(OUTFITS[wanted].label + ' is on.'); }
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

  // ----- test buttons -----
  if (TEST_BUTTONS) {
    const info = document.getElementById('info'), before = document.getElementById('logoutButton');
    const buttons = [
      ['Test: next character', () => {
        const cur = world.player.userData.characterId, i = testWearers.indexOf(cur), next = testWearers[(i + 1) % testWearers.length];
        wanted = null; applyCharacter(next); world.say3d('Loading ' + next + '...');
      }],
      ['Test: next outfit', () => {
        const cycle = [null, ...outfitsFor(world.player.userData.characterId)];
        const i = cycle.indexOf(wanted); setOutfit(cycle[(i + 1) % cycle.length]);
      }],
    ];
    if (DEBUG) buttons.push(['Test: skin on/off', toggleSkin]);
    buttons.forEach(([label, fn]) => {
      const x = document.createElement('button'); x.className = 'ibtn'; x.textContent = label; x.addEventListener('click', fn);
      if (info) info.insertBefore(x, before); else document.body.appendChild(x);
    });
  }

  // ----- every frame: a new model (character change, reload) gets the chosen outfit put on again -----
  let tick = 0;
  function update(dt) {
    if ((tick += dt) < 0.3) return; tick = 0;
    const u = world.player.userData;
    if (u.model && (!dressed || dressed.model !== u.model)) sync();
  }

  return { update, setOutfit, OUTFITS };
}
