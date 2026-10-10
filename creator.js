// creator.js  (STEP 2 of character creation: choose top, bottoms, shoes, jewelry and colour, for players joining for the first time)
//
// Flow: choose-your-character screen (step 1)  ->  "Next: Customize"  ->  this screen (step 2)  ->  "Play"
//   * it lives INSIDE the same choose-your-character panel and uses the same 3D preview, so you see the outfit on your character
//   * the camera moves to the part of the body you are choosing for (head for earrings, feet for shoes ...), drag to turn the character
//   * tabs = the slots that have pieces in clothing/female/wardrobe.json (a new piece or slot shows up by itself)
//   * colour = the ready-made colours of the piece, plus any colour you like when the piece has a "custom" texture
//   * "Play" saves the look on this device (localStorage "wardrobeLook"); when the game world starts, restoreSavedLook() puts it on
//   * only players with no saved character see this (game.js: afterLogin). Players already in the game never see it.
// The real dressing is done by clothing.js (setPiece / setColour / clearAll / setLook / getState); nothing about fitting changes.
// Only female pieces exist for now, so a male character skips this step and goes straight to Play.

import * as THREE from 'three';

const STORE_KEY = 'wardrobeLook';

const SLOT_TABS = {
  top:      { label: 'Tops',     none: 'Default' },
  bottom:   { label: 'Bottoms',  none: 'Default' },
  dress:    { label: 'Dresses',  none: 'None' },
  shoes:    { label: 'Shoes',    none: 'Default' },
  necklace: { label: 'Necklace', none: 'None' },
  earrings: { label: 'Earrings', none: 'None' },
};
const SLOT_ORDER = ['top', 'bottom', 'dress', 'shoes', 'necklace', 'earrings'];

// where the preview camera looks for each tab: y = height on the body, d = distance (both as a share of the body height)
const FOCUS = {
  all:      { y: 0.52, d: 1.32 },
  top:      { y: 0.68, d: 0.72 },       // head to hips
  bottom:   { y: 0.50, d: 1.10 },       // the whole figure: head to feet
  dress:    { y: 0.52, d: 1.15 },
  shoes:    { y: 0.08, d: 0.42 },       // the feet in the middle of the picture
  necklace: { y: 0.84, d: 0.42 },
  earrings: { y: 0.91, d: 0.36 },
};
const PREVIEW_FOV_K = 1.041 / 0.536;                 // visible height = 2*dist*tan(fov/2): the main camera (55 deg) numbers above, converted to the preview camera (30 deg)

const PRESETS = ['#ffffff', '#111111', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#ec407a', '#795548', '#9e9e9e'];

const ICONS = {
  top: '<path d="M20.4 5.4 16 3a4 4 0 0 1-8 0L3.6 5.4a2 2 0 0 0-1.1 2.2l.9 3.3a1 1 0 0 0 1 .8H6v9h12v-9h1.6a1 1 0 0 0 1-.8l.9-3.3a2 2 0 0 0-1.1-2.2z"/>',
  bottom: '<path d="M7 3h10l1.2 18h-5l-1.2-10-1.2 10H5.8z"/><path d="M7 7h10"/>',
  dress: '<path d="M9 3h6l.8 6L19 21H5l3.2-12z"/><path d="M9 3c0 2 1.3 3 3 3s3-1 3-3"/>',
  shoes: '<path d="M3 17v-3c0-1 .6-1.7 1.6-1.9L8 11l2-4h3.2l.6 2.6c.3 1.3 1.2 2.2 2.6 2.6l3 .8c1.1.3 1.6 1.1 1.6 2.2V17z"/><path d="M3 20h18"/>',
  necklace: '<path d="M4 4c0 9 3.5 13 8 13s8-4 8-13"/><circle cx="12" cy="19.5" r="2.3"/>',
  earrings: '<circle cx="12" cy="4.5" r="1.6"/><path d="M12 6.1v3"/><path d="M12 9.6l3.2 4.7L12 20l-3.2-5.7z"/>',
  none: '<circle cx="12" cy="12" r="8"/><path d="M6.3 17.7 17.7 6.3"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
};
const svg = name => '<svg class="cr-ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.top) + '</svg>';

const CSS = `
#creator { display: none; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; flex: 1; }
#creator.open { display: flex; }
#creator .cr-ic { width: 22px; height: 22px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
#creator .cr-tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; flex: none; }
#creator .cr-tabs::-webkit-scrollbar { display: none; }
#creator .cr-tab { flex: none; display: flex; align-items: center; gap: 6px; min-height: 42px; padding: 0 12px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700;
  color: #fff; background: rgba(16,38,74,.65); border: 2px solid var(--line); border-radius: 14px; -webkit-tap-highlight-color: transparent; }
#creator .cr-tab .cr-ic { width: 18px; height: 18px; }
#creator .cr-tab.on { border-color: var(--gold); color: var(--gold); background: var(--navy2); box-shadow: 0 0 12px rgba(255,198,26,.3); }
#creator .cr-grid { flex: 0 1 auto; min-height: 84px; max-height: clamp(110px, 34vh, 300px); overflow-y: auto; display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: min-content; gap: 8px; align-content: start; padding: 8px 6px 4px 2px; -webkit-overflow-scrolling: touch; }
#creator .cr-card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 84px; padding: 8px 4px; cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 700; line-height: 1.2; text-align: center;
  color: #fff; border: 2px solid var(--line); border-radius: 16px; background: linear-gradient(180deg, rgba(24,56,108,.8), rgba(10,24,52,.9)); -webkit-tap-highlight-color: transparent; }
#creator .cr-card .cr-ic { width: 32px; height: 32px; fill: var(--sw, rgba(255,255,255,.12)); stroke: rgba(255,255,255,.65); }
#creator .cr-card.none .cr-ic { fill: none; }
#creator .cr-card.on { border-color: var(--gold); color: var(--gold); box-shadow: 0 0 16px rgba(255,198,26,.45); }
#creator .cr-card.on::after { content: "\\2713"; position: absolute; top: -9px; right: -7px; width: 22px; height: 22px; border-radius: 50%; background: var(--gold); color: #111; font-size: 12px; line-height: 22px; }
#creator .cr-col { flex: none; max-height: 30vh; overflow-y: auto; }
#creator .cr-sec { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: .1em; color: #fff; flex: none; }
#creator .cr-hint { font-style: normal; font-size: 11.5px; font-weight: 500; letter-spacing: 0; color: var(--mut); text-align: right; }
#creator .cr-sws { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; min-height: 38px; }
#creator .cr-bar { width: 1px; height: 26px; background: var(--line); margin: 0 2px; }
#creator .cr-dot { position: relative; width: 36px; height: 36px; padding: 0; cursor: pointer; display: grid; place-items: center; overflow: hidden; color: #fff;
  background: var(--c, #888); border: 2px solid rgba(255,255,255,.3); border-radius: 50%; -webkit-tap-highlight-color: transparent; }
#creator .cr-dot.on { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(255,198,26,.5); }
#creator .cr-dot .cr-ic { width: 16px; height: 16px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
#creator .cr-dot.wheel { background: conic-gradient(#f44, #fd4, #4d6, #4df, #64f, #f4d, #f44); }
#creator .cr-dot.wheel input { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); opacity: 0; cursor: pointer; border: 0; padding: 0; }
#creator .cr-dot.dice { background: rgba(16,38,74,.65); }
#creator .cr-foot { display: flex; gap: 8px; flex: none; margin-top: auto; }
#creator .cr-foot .alt { flex: none; padding: 13px 20px; }
#creator .cr-foot .big { flex: 1; }
#creator .cr-status { font-size: 12px; color: var(--gold); min-height: 15px; text-align: center; flex: none; }
@media (orientation:landscape) and (max-height:600px) {
  #creator { gap: 6px; }
  #creator .cr-grid { max-height: none; min-height: 60px; }
  #creator .cr-col { max-height: 26vh; }
  #creator .cr-card { min-height: 66px; } #creator .cr-card .cr-ic { width: 24px; height: 24px; }
  #creator .cr-tab { min-height: 36px; } #creator .cr-dot { width: 30px; height: 30px; }
  #creator .cr-foot .alt { padding: 10px 16px; }
}
`;

// put the look saved by the creation screen on the player in the game world (call once, after initClothing)
export async function restoreSavedLook(world, clothing) {
  try {
    await clothing.ready;
    const raw = localStorage.getItem(STORE_KEY); if (!raw) return;
    if (!Object.keys(clothing.PIECES).length) { world.say3d('Your outfit could not be put on: the outfit list (wardrobe.json) did not load.'); return; }
    const look = JSON.parse(raw);
    if (!look || !look.piece || !Object.values(look.piece).some(Boolean)) return;
    if (!/^female_/.test(String(world.player.userData.characterId || ''))) return;     // the pieces are female for now
    clothing.setLook(look);
  } catch (e) { console.warn('[creator] could not restore the saved look:', e); }
}

// opts: clothing (the clothing.js instance dressing the preview), side (the right-hand column of the choose screen),
//       stage (the preview canvas box), title (the h1), holder (the preview character's group),
//       setView(y, dist) (moves the preview camera), setSpin(on) (the preview turns by itself while choosing a character),
//       onPlay() (save the character and start the game), onBack() (back to choosing a character)
export function initCreator(opts) {
  const { clothing, side, stage, title, holder, setView, setSpin, onPlay, onBack } = opts;
  if (!clothing || !clothing.getState || !clothing.setLook || !clothing.clearAll) throw new Error('creator.js needs the edited clothing.js (getState, setLook, clearAll)');
  const PIECES = clothing.PIECES;

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'creator';
  root.innerHTML =
    '<div class="cr-tabs"></div>' +
    '<div class="cr-grid"></div>' +
    '<div class="cr-col"><div class="cr-sec"><span>COLOUR</span><em class="cr-hint"></em></div><div class="cr-sws"></div></div>' +
    '<div class="cr-status"></div>' +
    '<div class="cr-foot"><button type="button" class="alt" data-act="back">Back</button><button type="button" class="alt" data-act="reset">' + svg('reset') + '</button><button type="button" class="big" data-act="play">Play</button></div>';
  side.appendChild(root);
  const q = sel => root.querySelector(sel);
  const tabsEl = q('.cr-tabs'), gridEl = q('.cr-grid'), swEl = q('.cr-sws'), hintEl = q('.cr-hint'), statusEl = q('.cr-status');

  let slot = null, open = false, poll = 0, lastSig = '', lastBusy = false, pickTimer = 0, oldTitle = '';
  const hidden = []; let sideStyle = ['', '', ''];
  const slotsWithPieces = () => SLOT_ORDER.filter(s => Object.values(PIECES).some(p => p.slot === s));

  // does this character get a customize step? (female pieces only for now)
  const available = id => /^female_/.test(String(id || '')) && slotsWithPieces().length > 0;

  function save() { try { const s = clothing.getState(); localStorage.setItem(STORE_KEY, JSON.stringify({ piece: s.piece, colour: s.colour })); } catch (e) { /* storage blocked: fine */ } }

  // ---------- the camera of the preview ----------
  function bodyBox() {                                                             // { H: body height, base: height of the feet }, measured from the skeleton
    const m = holder.userData && holder.userData.model; if (!m) return { H: 1.7, base: 0 };
    if (m.userData.creatorBox) return m.userData.creatorBox;
    m.updateMatrixWorld(true);
    let lo = Infinity, hi = -Infinity; const v = new THREE.Vector3();
    m.traverse(o => { if (o.isBone) { o.getWorldPosition(v); if (v.y < lo) lo = v.y; if (v.y > hi) hi = v.y; } });
    const h = (hi - lo) * 1.05;
    const box = h > 0.5 && h < 3 ? { H: h, base: lo } : { H: 1.7, base: 0 };
    m.userData.creatorBox = box; return box;
  }
  function focus() {
    const f = FOCUS[slot] || FOCUS.all, b = bodyBox();
    setView(b.base + f.y * b.H, f.d * b.H * PREVIEW_FOV_K);
  }

  // ---------- drawing ----------
  function renderTabs() {
    const slots = slotsWithPieces();
    if (!slot || !slots.includes(slot)) slot = slots[0] || null;
    tabsEl.innerHTML = '';
    slots.forEach(s => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cr-tab' + (s === slot ? ' on' : '');
      b.innerHTML = svg(s) + '<span>' + SLOT_TABS[s].label + '</span>';
      b.addEventListener('click', () => { slot = s; holder.rotation.y = Math.round(holder.rotation.y / (Math.PI * 2)) * Math.PI * 2; renderTabs(); renderGrid(); renderColours(); focus(); });
      tabsEl.appendChild(b);
    });
  }
  function renderGrid() {
    gridEl.innerHTML = '';
    if (!slot) return;
    const current = clothing.getState().piece[slot];
    const add = (id, label, icon, sw, isNone) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'cr-card' + (isNone ? ' none' : '') + (current === id ? ' on' : '');
      if (sw) b.style.setProperty('--sw', sw);
      b.innerHTML = svg(icon); const t = document.createElement('span'); t.textContent = label; b.appendChild(t);
      b.addEventListener('click', () => choose(id));
      gridEl.appendChild(b);
    };
    add(null, SLOT_TABS[slot].none, 'none', null, true);
    Object.keys(PIECES).filter(id => PIECES[id].slot === slot).forEach(id => {
      const first = (PIECES[id].colors || [])[0];
      add(id, PIECES[id].label, slot, first ? first.swatch : '#ffc61a', false);
    });
  }
  function renderColours() {
    swEl.innerHTML = '';
    const st = clothing.getState(), id = slot && st.piece[slot], p = id && PIECES[id], cur = slot ? st.colour[slot] : null;
    if (!p) { hintEl.textContent = slot ? 'Pick an item first' : ''; return; }
    const ready = (p.colors || []).filter(c => c.id !== 'default');           // 'default' is the same look as "Original"
    if (!ready.length && !p.custom) { hintEl.textContent = 'This item has one colour'; return; }
    hintEl.textContent = p.custom ? 'Lighter colours show best' : '';
    const dot = (colour, label, on, click, cls) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cr-dot' + (cls ? ' ' + cls : '') + (on ? ' on' : '');
      b.title = label; b.setAttribute('aria-label', label); if (colour) b.style.setProperty('--c', colour);
      b.addEventListener('click', click); swEl.appendChild(b); return b;
    };
    dot(((p.colors || [])[0] || {}).swatch || '#9aa5b1', 'Original', !cur, () => paint(null)).innerHTML = svg('reset');
    ready.forEach(c => dot(c.swatch, c.label || c.id, cur === c.id, () => paint(c.id)));
    if (p.custom) {
      const bar = document.createElement('i'); bar.className = 'cr-bar'; swEl.appendChild(bar);
      PRESETS.forEach(h => dot(h, h, cur && cur.toLowerCase() === h, () => paint(h)));
      const wheel = document.createElement('div'); wheel.className = 'cr-dot wheel'; wheel.title = 'Any colour';
      if (cur && cur[0] === '#' && !PRESETS.includes(cur.toLowerCase())) wheel.classList.add('on');
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = (cur && cur[0] === '#') ? cur : '#c0392b';
      const fire = () => { clearTimeout(pickTimer); pickTimer = setTimeout(() => paint(inp.value, true), 140); };      // dragging on the wheel sends many values: wait a moment
      inp.addEventListener('input', fire); inp.addEventListener('change', fire);
      wheel.appendChild(inp); swEl.appendChild(wheel);
      dot(null, 'Random colour', false, () => paint('#' + new THREE.Color().setHSL(Math.random(), 0.65, 0.6).getHexString()), 'dice').innerHTML = svg('dice');
    }
  }
  function status() { const b = clothing.getState().busy; statusEl.textContent = b ? 'Putting it on...' : ''; lastBusy = b; }
  const signature = () => { const s = clothing.getState(); return JSON.stringify([s.piece, s.colour]); };
  function refresh(full) { lastSig = signature(); if (full) renderTabs(); renderGrid(); renderColours(); status(); }

  function choose(id) { if (!slot) return; clothing.setPiece(slot, id || null); save(); refresh(false); }
  function paint(token, keepWheel) {
    if (!slot) return;
    clothing.setColour(slot, token || null); save();
    if (keepWheel) { lastSig = signature(); renderGrid(); status(); return; }       // do not rebuild the colour wheel while it is open
    refresh(false);
  }

  // ---------- show / hide (inside the choose-your-character panel) ----------
  function begin() {
    if (open) return;
    open = true;
    hidden.length = 0; sideStyle = [side.style.minHeight, side.style.justifyContent, side.style.minWidth];
    side.style.minHeight = '0'; side.style.minWidth = '0'; side.style.justifyContent = 'flex-start';              // the column may shrink to the screen; its buttons stay in view
    [...side.children].forEach(c => { if (c !== root) { hidden.push([c, c.style.display]); c.style.display = 'none'; } });
    root.classList.add('open');
    if (title) { oldTitle = title.innerHTML; title.innerHTML = 'Customize Your <b>Look</b>'; }
    setSpin(false); holder.rotation.y = 0;                                           // the character faces you while you choose
    refresh(true); focus();
    poll = setInterval(() => { if (signature() !== lastSig) refresh(false); else if (clothing.getState().busy !== lastBusy) status(); }, 250);
  }
  function end() {
    if (!open) return;
    open = false; clearInterval(poll); clearTimeout(pickTimer);
    root.classList.remove('open');
    hidden.forEach(([c, d]) => { c.style.display = d; });
    side.style.minHeight = sideStyle[0]; side.style.justifyContent = sideStyle[1]; side.style.minWidth = sideStyle[2];
    if (title) title.innerHTML = oldTitle;
    setSpin(true);
    const b = bodyBox(); setView(b.base + FOCUS.all.y * b.H, FOCUS.all.d * b.H * PREVIEW_FOV_K);
  }
  q('[data-act="back"]').addEventListener('click', () => { end(); onBack(); });
  q('[data-act="reset"]').addEventListener('click', () => { clothing.clearAll(); save(); refresh(false); });
  q('[data-act="play"]').addEventListener('click', () => { save(); end(); onPlay(); });

  // ---------- drag on the preview to turn the character ----------
  let dragX = null;
  stage.addEventListener('pointerdown', e => { if (!open) return; dragX = e.clientX; try { stage.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
  stage.addEventListener('pointermove', e => { if (!open || dragX === null) return; holder.rotation.y += (e.clientX - dragX) * 0.012; dragX = e.clientX; });
  const lift = () => { dragX = null; };
  stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
  stage.style.touchAction = 'none';

  return { available, begin, end, isOpen: () => open };
}
