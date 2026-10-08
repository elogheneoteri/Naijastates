// school.js  (SCHOOL STEP 1: the receptionist, the admission form, the school uniform)
//
//   * Madam Ngozi sits behind the reception counter of the Delta High School (hall, downstairs). Walk up to her: "Talk to Madam Ngozi".
//   * She gives you the ADMISSION FORM: your name and gender come from immigration (shown, not editable). You choose a STREAM
//     (Science / Arts / Commercial) and STUDENT TYPE (Hostel / Day). The stream and the student type are used by the next steps
//     (the classes and the hostel).
//   * When the form is sent you get a SCHOOL UNIFORM in your bag (the bag button). Tap it: Wear / Remove.
//   * Wearing it re-colours the shirt to white and the trousers to navy on YOUR character (the shape and the folds stay).
//     Every character gets the same colours, so boys and girls match. Characters not set up yet are listed in the console.
//   * Two test buttons are added under the minimap: "Test: uniform on/off" and "Test: reset school".
//
// game.js calls initSchool() once the world exists and school.update(dt) every frame (after nin.update).
// nin.js shows the bag; it lists whatever is in world.bagItems (school.js adds the uniform there).
//
// NOTE: for now the school record (admitted, stream, student type, uniform) is kept in this browser (localStorage).
// Later it should move to server.js, like the NIN card, so it cannot be edited and follows the account to other devices.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- settings you may want to change ----------
const SCHOOL_NAME = 'Delta High School';
const RECEPTIONIST = {
  name: 'Madam Ngozi',
  title: 'School Receptionist',
  file: 'characters/npc/corporate_confidence_portrait.glb',
  // where she sits, in the SCHOOL's own space (centre = 0,0; same numbers as RECEPTION in high_school_interior.js: the counter is at x -4.5,
  // z 3.0 facing east, the staff chair behind it at x -5.8). rotY = which way she faces (PI/2 = east, towards the counter).
  x: -5.8, z: 3.0, rotY: Math.PI / 2,
  scale: 1,        // 1 = use the model's own size. If she looks too big or small, open the browser console: it prints her size.
  lift: 0,         // metres up (+) or down (-) if she floats above or sinks into the chair
};
const TALK_RANGE = 3.4;                   // metres from her at which "Talk to ..." appears
const STREAMS = ['Science', 'Arts', 'Commercial'];
const UNIFORM_TOP = [236, 238, 240];      // white shirt
const UNIFORM_BOTTOM = [26, 36, 70];      // navy trousers
const TEST_BUTTONS = true;                // the two test buttons under the minimap. Set false when you are happy.

// ---------- which parts of a character become the uniform ----------
// By material name (Mixamo names look like "m13_Vestmat"; the "m13_" and "mat" are ignored). Any character not listed here uses the
// GENERIC words. A texture that holds the whole body in one picture (male_civilian) uses 'atlas': rectangles of the texture, in pixels
// of a 1024 x 1024 picture [x, y, width, height]. To see the material names of a character, add ?names=1 to the web address.
const RULES = {
  male_civilian: { atlas: { top: [384, 893, 132, 131], bottom: [256, 893, 128, 131] } },   // jacket panels, jeans panels
  female_emma: { top: [/^Full_Body$/i], bottom: [/^Vest$/i] },                                // best guess from her textures: check on screen
};
const GENERIC = {
  top: [/shirt|blouse|top$|^top|vest|jacket|tee|hoodie|sweater|cardigan|dress|coat|jersey/i],
  bottom: [/pant|trouser|jean|short|skirt|legging|denim/i],
};
const plainName = n => (n || '').replace(/^m\d+_/i, '').replace(/mat$/i, '');
const genderOf = id => (String(id || '').startsWith('female') ? 'Female' : 'Male');

// ---------- re-colouring ----------
// Draws the material's picture on a canvas and re-colours the chosen area: every pixel becomes the uniform colour, darker or lighter
// by how much darker or lighter the old pixel was than the average of the area (so folds, seams and shading stay). Transparency stays.
function tintArea(g, rect, color) {
  const [x, y, w, h] = rect;
  const img = g.getImageData(x, y, w, h), d = img.data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 16) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
  const mean = n ? Math.max(sum / n, 1) : 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= 16) continue;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const k = THREE.MathUtils.clamp(1 + (l / mean - 1) * 0.9, 0.42, 1.55);
    d[i] = Math.min(255, color[0] * k); d[i + 1] = Math.min(255, color[1] * k); d[i + 2] = Math.min(255, color[2] * k);
  }
  g.putImageData(img, x, y);
}

function newTextureLike(canvas, old) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = old.flipY; t.colorSpace = old.colorSpace; t.wrapS = old.wrapS; t.wrapT = old.wrapT;
  t.repeat.copy(old.repeat); t.offset.copy(old.offset); t.anisotropy = old.anisotropy; t.channel = old.channel;
  return t;
}

// Finds what to re-colour on a character model. Returns [{ mat, jobs: [{ rect | null, color }] }].
function planUniform(model, characterId) {
  const rule = RULES[characterId] || {};
  const seen = new Set(), plan = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach(mat => {
      if (!mat || seen.has(mat)) return; seen.add(mat);
      const name = plainName(mat.name), jobs = [];
      if (rule.atlas && mat.map && mat.map.image) {
        const w = mat.map.image.width || 1024, s = w / 1024;
        for (const [part, color] of [['top', UNIFORM_TOP], ['bottom', UNIFORM_BOTTOM]]) {
          const r = rule.atlas[part]; if (r) jobs.push({ rect: r.map(v => Math.round(v * s)), color });
        }
      } else {
        const tops = rule.top || GENERIC.top, bottoms = rule.bottom || GENERIC.bottom;
        if (tops.some(re => re.test(name))) jobs.push({ rect: null, color: UNIFORM_TOP });
        else if (bottoms.some(re => re.test(name))) jobs.push({ rect: null, color: UNIFORM_BOTTOM });
      }
      if (jobs.length) plan.push({ mat, jobs });
    });
  });
  return plan;
}

// Puts the uniform on a character model. Returns true if something was re-coloured.
// (Characters of the same kind share their materials, so this works on private copies: nobody else's character changes colour.)
function wearUniform(model, characterId) {
  if (!model) return false;
  const plan = planUniform(model, characterId);
  if (!plan.length) {
    const names = new Set(); model.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => names.add(m && m.name)); });
    console.warn('[school] no uniform parts known for', characterId, '- its materials are:', [...names].join(', '),
      '\nAdd it to RULES in school.js (top / bottom = material names).');
    return false;
  }
  const copies = new Map();                                   // original material -> private copy
  model.traverse(o => {
    if (!o.isMesh) return;
    const swap = m => { if (!m) return m; if (!copies.has(m)) { const c = m.clone(); c.userData.schoolOrig = { map: m.map, color: m.color && m.color.clone() }; copies.set(m, c); } return copies.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  model.userData.schoolMats = [...copies.values()];
  for (const { mat, jobs } of plan) {
    const c = copies.get(mat), old = c.map;
    if (old && old.image) {
      const w = old.image.width || 1024, h = old.image.height || 1024;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      try {
        g.drawImage(old.image, 0, 0);
        for (const j of jobs) tintArea(g, j.rect || [0, 0, w, h], j.color);
        c.map = newTextureLike(cv, old);
        if (c.color && !jobs.some(j => j.rect)) c.color.set(0xffffff);
        c.needsUpdate = true; continue;
      } catch (e) { console.warn('[school] could not re-colour', mat.name, e); }
    }
    if (c.color) { c.color.setRGB(jobs[0].color[0] / 255, jobs[0].color[1] / 255, jobs[0].color[2] / 255, THREE.SRGBColorSpace); c.needsUpdate = true; }
  }
  return true;
}

// Takes the uniform off again (the materials go back to the shared originals).
function removeUniform(model) {
  if (!model) return;
  const back = new Map();
  (model.userData.schoolMats || []).forEach(c => back.set(c, c));
  model.traverse(o => {
    if (!o.isMesh) return;
    const restore = m => { if (m && m.userData.schoolOrig) { const orig = m.userData.schoolOrig; if (m.map && m.map !== orig.map) m.map.dispose(); m.map = orig.map; if (orig.color) m.color.copy(orig.color); m.needsUpdate = true; } return m; };
    [].concat(o.material).forEach(restore);
  });
  model.userData.schoolMats = null;
}

// ---------- the school ----------
const CSS = `
#schPrompt{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;display:none;
  font:700 17px Inter,system-ui,sans-serif;color:#111;padding:13px 26px;border:0;border-radius:999px;cursor:pointer;
  background:linear-gradient(180deg,#ffd84d,#ffb800);box-shadow:0 4px 18px rgba(255,184,0,.5);animation:schPulse 1.4s ease-in-out infinite}
@keyframes schPulse{50%{transform:translateX(-50%) scale(1.05)}}
.sch-ov{position:fixed;inset:0;z-index:60;display:none;background:rgba(3,10,24,.55);font-family:Inter,system-ui,sans-serif;color:#f3f6ff}
.sch-sheet{box-sizing:border-box;position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(560px,100vw);max-height:92vh;overflow-y:auto;
  padding:18px 18px calc(18px + env(safe-area-inset-bottom));background:rgba(8,20,44,.95);border:1px solid #1f4a8a;border-bottom:0;border-radius:22px 22px 0 0}
.sch-mid{box-sizing:border-box;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(88vw,340px);padding:16px;
  background:rgba(8,20,44,.96);border:1px solid #1f4a8a;border-radius:22px}
.sch-mid h2{margin:0 0 6px;font-size:18px}.sch-mid p{margin:0 0 12px;font-size:14px;color:#9fb3d1}
.sch-who{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}.sch-who b{font-size:20px;color:#ffc61a}.sch-who span{font-size:13px;color:#9fb3d1}
.sch-say{font-size:16px;line-height:1.45;margin:4px 0 12px}
.sch-row{display:flex;justify-content:space-between;gap:10px;padding:8px 14px;margin-bottom:6px;border-radius:12px;background:rgba(16,38,74,.55);font-size:15px}
.sch-row span{color:#9fb3d1}
.sch-lab{margin:10px 0 6px;font-size:13px;font-weight:700;color:#9fb3d1;text-transform:uppercase;letter-spacing:.04em}
.sch-chips{display:flex;gap:8px;flex-wrap:wrap}
.sch-chips button{flex:1;min-width:90px;font:700 15px Inter,system-ui,sans-serif;padding:11px 8px;border-radius:999px;border:1px solid #1f4a8a;cursor:pointer;color:#fff;background:rgba(16,38,74,.7)}
.sch-chips button.on{border-color:#ffc61a;color:#111;background:linear-gradient(180deg,#ffd84d,#ffb800)}
.sch-err{min-height:18px;font-size:14px;color:#ffb3a8;margin:8px 0 6px}
.sch-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.sch-btns button{flex:1;min-width:120px;font:700 16px Inter,system-ui,sans-serif;padding:13px;border-radius:999px;border:1px solid #1f4a8a;cursor:pointer;color:#fff;background:rgba(16,38,74,.7)}
.sch-btns button.p{border:0;color:#111;background:linear-gradient(180deg,#ffd84d,#ffb800)}
`;

const STORE = 'naijaSchool_v1_';
const EMPTY = () => ({ admitted: false, stream: '', student: '', admissionNo: '', uniformOwned: false, uniformWorn: false });

export function initSchool(opts) {
  const { world, building: b } = opts;
  const style = document.createElement('style'); style.id = 'schStyle'; style.textContent = CSS; document.head.appendChild(style);

  // ----- saved record -----
  let key = '', rec = EMPTY();
  function record() {
    const k = STORE + (world.myName || 'player');
    if (k !== key) { key = k; try { rec = Object.assign(EMPTY(), JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { rec = EMPTY(); } }
    return rec;
  }
  function save() { try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e) { /* private mode: it just will not be remembered */ } }

  // ----- where things are in the world (the school may be turned: city.js gives it a rotY in degrees) -----
  const turn = THREE.MathUtils.degToRad(b.rotY || 0), cos = Math.cos(turn), sin = Math.sin(turn);
  const toWorld = (lx, lz) => ({ x: b.x + lx * cos + lz * sin, z: b.z - lx * sin + lz * cos });
  const floorY = b.stairs ? b.stairs.rise : 0;                          // the school floor sits on top of the front steps

  // ----- Madam Ngozi -----
  const R = RECEPTIONIST, npc = new THREE.Group();
  const spot = toWorld(R.x, R.z);
  npc.position.set(spot.x, floorY + R.lift, spot.z);
  npc.rotation.y = R.rotY + turn;
  npc.visible = false;
  world.scene.add(npc);
  let npcMixer = null;
  new GLTFLoader().load(R.file, gltf => {
    const m = gltf.scene;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    let box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
    let s = R.scale;
    if (size.y > 6) s *= 0.01;                                          // looks like centimetres: shrink to metres
    m.scale.setScalar(s); m.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(m);
    m.position.y -= box.min.y;                                          // rest on the floor
    m.position.x -= (box.min.x + box.max.x) / 2; m.position.z -= (box.min.z + box.max.z) / 2;
    const fin = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    console.log('[school] ' + R.name + ' is ' + fin.x.toFixed(2) + ' x ' + fin.y.toFixed(2) + ' x ' + fin.z.toFixed(2) + ' m (width x height x depth). Seated is about 1.2 to 1.4 m high; change scale / lift in RECEPTIONIST if needed.');
    npc.add(m);
    if (gltf.animations && gltf.animations.length) { npcMixer = new THREE.AnimationMixer(m); npcMixer.clipAction(gltf.animations[0]).play(); }
  }, undefined, err => { console.error('[school] could not load', R.file, err); world.say3d('Could not load ' + R.file + ' (check the name and the folder)'); });
  world.setLabel(npc, R.name);
  npc.userData.label.position.y = 1.55;                                // she sits, so her name is lower than a standing character's

  // ----- screen pieces -----
  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
  const prompt = el('button', { id: 'schPrompt', type: 'button', textContent: 'Talk to ' + R.name });
  const dlg = el('div', { className: 'sch-ov', id: 'schDlg' }, `<div class="sch-sheet">
    <div class="sch-who"><b>${R.name}</b><span>${R.title}</span></div><div class="sch-say" id="schSay"></div>
    <div id="schForm" style="display:none">
      <div class="sch-row"><span>Name</span><b id="schName"></b></div>
      <div class="sch-row"><span>Gender</span><b id="schGender"></b></div>
      <div class="sch-lab">Stream</div><div class="sch-chips" id="schStream"></div>
      <div class="sch-lab">Student type</div><div class="sch-chips" id="schStudent"></div>
      <div class="sch-err" id="schErr"></div></div>
    <div class="sch-btns" id="schBtns"></div></div>`);
  const uni = el('div', { className: 'sch-ov', id: 'schUni' }, `<div class="sch-mid"><h2>School uniform</h2><p id="schUniTxt"></p>
    <div class="sch-btns"><button type="button" class="p" id="schUniGo"></button><button type="button" id="schUniClose">Close</button></div></div>`);
  const $ = id => document.getElementById(id);
  const say = $('schSay'), form = $('schForm'), err = $('schErr'), btns = $('schBtns');
  let dialogOpen = false, pick = { stream: '', student: '' };

  const open = e => { e.style.display = 'block'; }, close = e => { e.style.display = 'none'; };
  function closeDialog() { close(dlg); dialogOpen = false; world.keys = {}; }
  function showDialog(text, buttons, withForm = false) {
    dialogOpen = true; prompt.style.display = 'none'; world.keys = {};
    say.textContent = text; form.style.display = withForm ? 'block' : 'none'; err.textContent = '';
    btns.innerHTML = '';
    buttons.forEach(bt => { const x = document.createElement('button'); x.type = 'button'; x.textContent = bt.label; if (bt.primary) x.className = 'p'; x.addEventListener('click', bt.onClick); btns.appendChild(x); });
    open(dlg);
  }
  const okButton = [{ label: 'OK', primary: true, onClick: closeDialog }];

  function chips(boxId, list, field) {
    const box = $(boxId); box.innerHTML = '';
    list.forEach(v => {
      const x = document.createElement('button'); x.type = 'button'; x.textContent = v === 'Hostel' ? 'Hostel student' : v === 'Day' ? 'Day student' : v;
      x.addEventListener('click', () => { pick[field] = v; [...box.children].forEach(c => c.classList.toggle('on', c === x)); err.textContent = ''; });
      box.appendChild(x);
    });
  }

  // ----- the talk -----
  function talk() {
    const r = record();
    if (!r.admitted) {
      showDialog('Good day, and welcome to ' + SCHOOL_NAME + '. Would you like to fill the admission form?', [
        { label: 'Fill admission form', primary: true, onClick: openForm }, { label: 'Leave', onClick: closeDialog }]);
    } else {
      showDialog('You are already admitted, ' + (world.myName || 'student') + '. Your admission number is ' + r.admissionNo + ' (' + r.stream + ', ' + (r.student === 'Hostel' ? 'hostel student' : 'day student') + '). '
        + (r.uniformOwned ? 'Wear your uniform to class.' : 'Here is your uniform again.'), [
        ...(r.uniformOwned ? [] : [{ label: 'Collect uniform', primary: true, onClick: () => { giveUniform(); closeDialog(); } }]),
        { label: 'OK', primary: r.uniformOwned, onClick: closeDialog }]);
    }
  }
  function openForm() {
    pick = { stream: '', student: '' };
    $('schName').textContent = world.myName || 'Your account name';
    $('schGender').textContent = genderOf(world.player.userData.characterId) + ' (from immigration)';
    chips('schStream', STREAMS, 'stream'); chips('schStudent', ['Hostel', 'Day'], 'student');
    showDialog('Your name and gender are already on record from immigration. Choose your stream and whether you will sleep in the hostel.', [
      { label: 'Submit form', primary: true, onClick: submitForm }, { label: 'Cancel', onClick: closeDialog }], true);
  }
  function submitForm() {
    if (!pick.stream) { err.textContent = 'Please choose a stream.'; return; }
    if (!pick.student) { err.textContent = 'Please choose hostel student or day student.'; return; }
    const r = record();
    r.admitted = true; r.stream = pick.stream; r.student = pick.student;
    r.admissionNo = 'DHS/' + String(new Date().getFullYear()).slice(2) + '/' + String(Math.floor(1000 + Math.random() * 9000));
    giveUniform();
    showDialog('Admission granted! Your admission number is ' + r.admissionNo + '. Here is your school uniform; it is in your bag. Wear it to class.', okButton);
  }

  // ----- the uniform in the bag -----
  function giveUniform() { const r = record(); r.uniformOwned = true; save(); }
  world.bagItems = world.bagItems || [];
  world.bagItems.push(() => record().uniformOwned ? { icon: '\u{1F454}', label: 'Uniform', open: openUniformCard } : null);
  function openUniformCard() {
    const r = record();
    $('schUniTxt').textContent = r.uniformWorn ? 'You are wearing the ' + SCHOOL_NAME + ' uniform.' : 'The ' + SCHOOL_NAME + ' uniform: white shirt and navy trousers.';
    const go = $('schUniGo'); go.textContent = r.uniformWorn ? 'Remove uniform' : 'Wear uniform';
    go.onclick = () => { setWorn(!record().uniformWorn); close(uni); };
    open(uni);
  }
  $('schUniClose').addEventListener('click', () => close(uni));

  // ----- wearing it -----
  let dressedModel = null;                                              // the model that has the uniform on right now
  function setWorn(on) {
    const r = record(), u = world.player.userData;
    if (on) {
      if (!u.model) { world.say3d('Your character is still loading.'); return; }
      if (dressedModel && dressedModel !== u.model) dressedModel = null;
      const ok = wearUniform(u.model, u.characterId);
      if (!ok) { world.say3d('This outfit cannot wear the uniform yet (see the browser console).'); return; }
      dressedModel = u.model; r.uniformWorn = true;
    } else {
      removeUniform(u.model); dressedModel = null; r.uniformWorn = false;
    }
    save();
  }

  // ----- test buttons (under the minimap, with the other test buttons) -----
  if (TEST_BUTTONS) {
    const info = document.getElementById('info'), before = document.getElementById('logoutButton');
    [['Test: uniform on/off', () => { const r = record(); if (!r.uniformOwned) giveUniform(); setWorn(!r.uniformWorn); }],
     ['Test: reset school', () => { setWorn(false); rec = EMPTY(); save(); world.say3d('School record cleared.'); }]].forEach(([label, fn]) => {
      const x = document.createElement('button'); x.className = 'ibtn'; x.textContent = label; x.addEventListener('click', fn);
      if (info) info.insertBefore(x, before); else document.body.appendChild(x);
    });
  }

  prompt.addEventListener('click', talk);

  // ----- every frame -----
  function update(dt) {
    const r = record(), u = world.player.userData;
    // she is only there while you are inside the school, downstairs
    npc.visible = !!b.inside && !u.level;
    if (npc.visible && npcMixer) npcMixer.update(dt);

    // the uniform follows the player: a new model (character change, reload) gets it put on again
    if (r.uniformWorn && u.model && u.model !== dressedModel) {
      if (!wearUniform(u.model, u.characterId)) r.uniformWorn = false; else dressedModel = u.model;
    }

    const p = world.player.position, d = Math.hypot(p.x - npc.position.x, p.z - npc.position.z);
    const near = npc.visible && d < TALK_RANGE;
    prompt.style.display = near && !dialogOpen && uni.style.display !== 'block' ? 'block' : 'none';
    if (dialogOpen && !near) closeDialog();                              // walked away
  }

  return { update, record, setWorn, npc };
}
