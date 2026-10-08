// clothing.js  (CLOTHING TEST: put one character's outfit on another character)
//
// How it works (all Mixamo characters share the same 65-bone skeleton, so one set of animations drives all of them):
//   1. The wearer (the player's character, for example Elizabeth) is loaded as usual.
//   2. The outfit source (for example Emma) is loaded once and kept (game.js caches it).
//   3. The outfit's clothing parts (Emma's Vest, Full_Body, Sneakers1) are copied and re-attached to the WEARER's bones by bone name.
//   4. The wearer's own clothing parts (Elizabeth's blinn1, blinn2, blinn3) are hidden. Face, hair and skin stay.
//   5. Taking the outfit off removes the copies and shows the hidden parts again.
//
// If anything is missing or goes wrong, the character is left exactly as it was and the reason is written in the browser console
// (look for lines starting with [clothing]).
//
// Two test buttons are added under the minimap:  "Test: be Elizabeth"  and  "Test: next outfit".
//
// To add more characters later:
//   * BASE_CLOTHES: for each character that can WEAR outfits, the names of its own clothing parts (these get hidden).
//   * OUTFITS: for each outfit, the character file id it comes from and the names of the parts to take.
// A "part name" is the material name without the "m13_" at the start and the "mat" at the end (add ?names=1 to the web address to see them).

import * as THREE from 'three';

// own clothing parts of each character (hidden while it wears another outfit)
const BASE_CLOTHES = {
  female_elizabeth: ['blinn1', 'blinn2', 'blinn3'],          // top, bottoms, shoes (best guess from the model's shape: check on screen)
  female_emma: ['Vest', 'Full_Body', 'Sneakers1'],
};

// outfits: source = the character id it is taken from (must be loadable by the game), take = part names
const OUTFITS = {
  emma_sport: { label: 'Emma sport outfit', source: 'female_emma', take: ['Vest', 'Full_Body', 'Sneakers1'] },
};

const TEST_BUTTONS = true;                                     // the two buttons under the minimap. Set false when you are happy.
const TEST_WEARER = 'female_elizabeth';

const plain = m => { const x = Array.isArray(m) ? m[0] : m; return ((x && x.name) || '').replace(/^m\d+_/i, '').replace(/mat$/i, ''); };
const log = (...a) => console.log('[clothing]', ...a);
const warn = (...a) => console.warn('[clothing]', ...a);

export function initClothing(opts) {
  const { world, applyCharacter, loadSource } = opts;

  let wanted = null;               // the outfit id the player should be wearing (null = own clothes)
  let dressed = null;              // { model, outfit } what is on the screen right now
  let busy = false;

  // ----- take an outfit off a model (own clothes come back) -----
  function strip(model) {
    if (!model || !model.userData.outfitParts) return;
    model.userData.outfitParts.added.forEach(m => { if (m.parent) m.parent.remove(m); if (m.skeleton) m.skeleton.dispose(); });
    model.userData.outfitParts.hidden.forEach(m => { m.visible = true; });
    model.userData.outfitParts = null;
  }

  // ----- put an outfit on a model. Returns true when it worked. Nothing changes unless everything is ready. -----
  async function dress(model, characterId, outfitId) {
    const outfit = OUTFITS[outfitId];
    if (!outfit) { warn('unknown outfit', outfitId); return false; }
    const hideNames = BASE_CLOTHES[characterId];
    if (!hideNames) {
      const names = new Set(); model.traverse(o => { if (o.isSkinnedMesh) names.add(plain(o.material)); });
      warn(characterId + ' cannot wear outfits yet. Add it to BASE_CLOTHES in clothing.js. Its parts are: ' + [...names].join(', '));
      return false;
    }
    let src;
    try { src = await loadSource(outfit.source); } catch (e) { warn('could not load the outfit source', outfit.source, e); return false; }
    if (model !== world.player.userData.model) return false;                // the character changed while we waited

    strip(model);
    src.scene.updateMatrixWorld(true); model.updateMatrixWorld(true);

    // the wearer's bones, by name, and its own clothing parts
    const baseBones = {}, hidden = []; let baseMesh = null;
    model.traverse(o => {
      if (o.isBone) baseBones[o.name] = o;
      if (o.isSkinnedMesh) { baseMesh = baseMesh || o; if (hideNames.includes(plain(o.material))) hidden.push(o); }
    });
    if (!baseMesh) { warn('the wearer has no body parts'); return false; }
    if (!hidden.length) warn('none of the wearer\'s own clothing parts were found (' + hideNames.join(', ') + '): the outfit will be added on top');

    // build every copy first; only add them if all of them are fine
    const srcInv = new THREE.Matrix4().copy(src.scene.matrixWorld).invert();
    const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const parent = baseMesh.parent;
    const parentRel = new THREE.Matrix4().multiplyMatrices(modelInv, parent.matrixWorld);
    const parentRelInv = parentRel.clone().invert();
    const copies = [], missing = new Set(), found = new Set();
    src.scene.traverse(sm => {
      if (!sm.isSkinnedMesh) return;
      const name = plain(sm.material);
      if (!outfit.take.includes(name)) return;
      found.add(name);
      const bones = sm.skeleton.bones.map(b => { const nb = baseBones[b.name]; if (!nb) missing.add(b.name); return nb; });
      if (bones.some(b => !b)) return;
      const rel = new THREE.Matrix4().multiplyMatrices(srcInv, sm.matrixWorld);       // where this part sits inside the character
      const local = new THREE.Matrix4().multiplyMatrices(parentRelInv, rel);
      const copy = sm.clone();
      copy.matrix.copy(local); copy.matrix.decompose(copy.position, copy.quaternion, copy.scale);
      copy.castShadow = true; copy.receiveShadow = true; copy.frustumCulled = false;
      copy.userData.outfitPart = name;
      copy.userData.pending = { bones, inverses: sm.skeleton.boneInverses.map(m => m.clone()), bind: sm.bindMatrix.clone() };
      copies.push(copy);
    });
    const lost = outfit.take.filter(n => !found.has(n));
    if (missing.size) { warn('bones missing on the wearer, outfit not put on:', [...missing].join(', ')); return false; }
    if (lost.length) { warn('parts not found in the outfit source:', lost.join(', ')); if (!copies.length) return false; }

    hidden.forEach(m => { m.visible = false; });
    copies.forEach(copy => {
      const p = copy.userData.pending; delete copy.userData.pending;
      parent.add(copy); copy.updateMatrixWorld(true);
      copy.bind(new THREE.Skeleton(p.bones, p.inverses), p.bind);
    });
    model.userData.outfitParts = { added: copies, hidden };
    log(outfit.label + ' put on ' + characterId + ': ' + copies.length + ' parts added, ' + hidden.length + ' own parts hidden.');
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

  // ----- test buttons -----
  if (TEST_BUTTONS) {
    const info = document.getElementById('info'), before = document.getElementById('logoutButton');
    const cycle = [null, ...Object.keys(OUTFITS)];
    [['Test: be Elizabeth', () => { wanted = null; applyCharacter(TEST_WEARER); world.say3d('Loading Elizabeth...'); }],
     ['Test: next outfit', () => { const i = cycle.indexOf(wanted); setOutfit(cycle[(i + 1) % cycle.length]); }]].forEach(([label, fn]) => {
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
