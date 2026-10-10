// scripts/glbs/lib.mjs — shared procedural-building toolkit for build_glbs.mjs.
// Everything is built in metres, 1 unit = 1 m, y = 0 at ground, front (entrance) on local +Z.
// PBR materials with small canvas-baked textures so each GLB stays well under 8 MB.
import * as THREE from 'three';

// ---------------------------------------------------------------- canvas helpers
const _canvasCache = new Map();
function canvasTex(key, w, h, draw) {
  if (_canvasCache.has(key)) return _canvasCache.get(key);
  let tex;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    tex = new THREE.CanvasTexture(cv);
  } else {
    tex = nodeCanvasTex(key, w, h, draw);
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _canvasCache.set(key, tex);
  return tex;
}

// Node-side canvas via a minimal off-screen implementation (no native canvas needed):
// we rasterise with a pure-JS 1D noise painter into RGBA data and wrap in DataTexture.
function nodeCanvasTex(key, w, h, draw) {
  const data = new Uint8Array(w * h * 4);
  const ctx = {
    _img: null,
    fillStyle: '#ffffff',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    fillRect(x, y, rw, rh) {
      const [r, g, b] = parseColor(this.fillStyle);
      const a = parseAlpha(this.fillStyle) * this.globalAlpha;
      for (let yy = Math.max(0, y | 0); yy < Math.min(h, (y + rh) | 0); yy++) {
        for (let xx = Math.max(0, x | 0); xx < Math.min(w, (x + rw) | 0); xx++) {
          const i = (yy * w + xx) * 4;
          data[i] = data[i] * (1 - a) + r * a;
          data[i + 1] = data[i + 1] * (1 - a) + g * a;
          data[i + 2] = data[i + 2] * (1 - a) + b * a;
          data[i + 3] = 255;
        }
      }
    },
    fillText(t, x, y) { /* text handled by caller drawing bars; ignored in node */ },
    strokeRect(x, y, rw, rh) {
      const [r, g, b] = parseColor(this.strokeStyle);
      const lw = Math.max(1, this.lineWidth | 0);
      this.fillRect(x, y, rw, lw); this.fillRect(x, y + rh - lw, rw, lw);
      this.fillRect(x, y, lw, rh); this.fillRect(x + rw - lw, y, lw, rh);
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    clearRect() {},
    drawImage() {},
    save() {},
    restore() {},
  };
  draw(ctx, w, h);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function parseColor(s) {
  if (s.startsWith('#')) {
    const n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\((\d+)[ ]+(\d+)[ ]+(\d+)(?:[ ]+([\d.]+))?\)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [255, 255, 255];
}
function parseAlpha(s) {
  const m = s.match(/rgba?\([^)]*[ ]+([\d.]+)\)/);
  return m ? Math.min(1, +m[4] || 1) : 1;
}

// deterministic PRNG so builds are reproducible
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rngFor(code, salt = 0) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) + salt;
  return mulberry32(h >>> 0);
}

// ---------------------------------------------------------------- material factory
export function makeMaterials(variant = {}) {
  const M = {};
  const paintColor = variant.paint || '#c9b458';
  const paint2 = variant.paint2 || '#7a8c5c';

  // painted rendered wall with rain streaks + rust
  M.wall = new THREE.MeshStandardMaterial({
    map: canvasTex('wall:' + paintColor + ':' + paint2, 256, 256, (g, w, h) => {
      g.fillStyle = paintColor; g.fillRect(0, 0, w, h);
      // blotchy render
      const rnd = mulberry32(7);
      g.globalAlpha = 0.08;
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rnd() > 0.5 ? paint2 : '#ffffff';
        g.fillRect(rnd() * w, rnd() * h, 20 + rnd() * 60, 10 + rnd() * 30);
      }
      // rain streaks
      g.globalAlpha = 0.16;
      for (let i = 0; i < 26; i++) {
        g.fillStyle = '#4a3b2a';
        const x = rnd() * w, len = 30 + rnd() * 120;
        g.fillRect(x, 0, 1.5, len);
      }
      // rust drips under window line
      g.globalAlpha = 0.25;
      g.fillStyle = '#7c4a1e';
      for (let i = 0; i < 14; i++) { const x = rnd() * w; g.fillRect(x, 120, 2, 20 + rnd() * 50); }
      g.globalAlpha = 1;
    }),
    roughness: 0.9, metalness: 0.02,
  });

  // plain rendered band (lintels / plinths)
  M.band = new THREE.MeshStandardMaterial({ color: new THREE.Color(variant.band || '#b9b2a6'), roughness: 0.92 });

  // concrete frame / columns
  M.concrete = new THREE.MeshStandardMaterial({
    map: canvasTex('concrete', 128, 128, (g, w, h) => {
      g.fillStyle = '#a7a49c'; g.fillRect(0, 0, w, h);
      const rnd = mulberry32(3);
      g.globalAlpha = 0.1;
      for (let i = 0; i < 60; i++) { g.fillStyle = rnd() > 0.5 ? '#8d8a82' : '#c2beb5'; g.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 14, 3 + rnd() * 14); }
      g.globalAlpha = 1;
    }),
    roughness: 0.95,
  });

  // corrugated zinc
  M.zinc = new THREE.MeshStandardMaterial({
    map: canvasTex('zinc', 128, 128, (g, w, h) => {
      g.fillStyle = '#9aa2a8'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = '#b7bdc2'; g.fillRect(x, 0, 7, h);
        g.fillStyle = '#6d747a'; g.fillRect(x + 12, 0, 3, h);
      }
      const rnd = mulberry32(11);
      g.globalAlpha = 0.18;
      for (let i = 0; i < 30; i++) { g.fillStyle = '#5b4632'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 8 + rnd() * 30); }
      g.globalAlpha = 1;
    }),
    roughness: 0.55, metalness: 0.7,
  });

  // long-span aluminium roof
  M.alu = new THREE.MeshStandardMaterial({
    map: canvasTex('alu', 128, 128, (g, w, h) => {
      g.fillStyle = '#8f9aa4'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = '#aab4bd'; g.fillRect(x, 0, 16, h); g.fillStyle = '#727c85'; g.fillRect(x + 28, 0, 3, h); }
    }),
    roughness: 0.4, metalness: 0.85,
  });

  // glass curtain
  M.glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.55 });
  M.glassFrame = new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.5, metalness: 0.6 });

  // burglar-proof grille / metalwork
  M.grille = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.45, metalness: 0.8 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.7 });
  M.redOxide = new THREE.MeshStandardMaterial({ color: 0x8a4a2b, roughness: 0.7, metalness: 0.3 });

  // boundary wall + gate
  M.boundWall = new THREE.MeshStandardMaterial({
    map: canvasTex('bound', 128, 128, (g, w, h) => {
      g.fillStyle = '#b7ad9d'; g.fillRect(0, 0, w, h);
      const rnd = mulberry32(5);
      g.globalAlpha = 0.12;
      for (let i = 0; i < 25; i++) { g.fillStyle = '#8f8574'; g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 20, 4 + rnd() * 12); }
      g.globalAlpha = 1;
      g.fillStyle = '#9c9283'; g.fillRect(0, 0, w, 10);
    }),
    roughness: 0.92,
  });
  M.gate = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.4, metalness: 0.85 });

  // road / tarmac (drop-off lanes, driveways)
  M.tarmac = new THREE.MeshStandardMaterial({
    map: canvasTex('tarmac', 128, 128, (g, w, h) => {
      g.fillStyle = '#3b3d40'; g.fillRect(0, 0, w, h);
      const rnd = mulberry32(21);
      g.globalAlpha = 0.25;
      for (let i = 0; i < 200; i++) { g.fillStyle = rnd() > 0.5 ? '#4a4c50' : '#2e3033'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      g.globalAlpha = 1;
    }),
    roughness: 0.98,
  });

  // brick
  M.brick = new THREE.MeshStandardMaterial({
    map: canvasTex('brick', 128, 128, (g, w, h) => {
      g.fillStyle = '#9c5b3c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8cfc0';
      for (let y = 0; y < h; y += 16) { g.fillRect(0, y, w, 2); const off = (y / 16) % 2 ? 16 : 0; for (let x = off; x < w; x += 32) g.fillRect(x, y, 2, 16); }
    }),
    roughness: 0.95,
  });

  // trees / planting
  M.leaf = new THREE.MeshStandardMaterial({ color: 0x3f6b2f, roughness: 0.9 });
  M.trunk = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95 });
  M.earth = new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 1 });

  // signage
  M.signBoard = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
  M.white = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.85 });
  M.blue = new THREE.MeshStandardMaterial({ color: 0x1f4e9c, roughness: 0.6 });
  M.yellow = new THREE.MeshStandardMaterial({ color: 0xd8b62a, roughness: 0.7 });
  M.red = new THREE.MeshStandardMaterial({ color: 0xb03028, roughness: 0.6 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.7 });

  M.pool = new THREE.MeshStandardMaterial({ color: 0x2f8fa3, roughness: 0.15, metalness: 0.1 });
  M.sand = new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 1 });
  M.whitePaint = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.85 });
  M.plasticTank = new THREE.MeshStandardMaterial({ color: 0x182026, roughness: 0.55, metalness: 0.1 });
  M.cream = new THREE.MeshStandardMaterial({ color: 0xefe6d0, roughness: 0.9 });
  M.nigerianFlag = new THREE.MeshStandardMaterial({ color: 0x1d8a43, roughness: 0.7, side: THREE.DoubleSide });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x8b5e34, roughness: 0.9 });
  return M;
}

// ---------------------------------------------------------------- geometry helpers
export function box(parent, M, mat, w, h, d, x, y, z, name) {
  const material = (typeof mat === 'string' ? M[mat] : mat) || M;
  if (!material || !material.isMaterial) throw new Error('box: unknown material "' + mat + '"');
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (name) m.name = name;
  parent.add(m);
  return m;
}
export function cyl(parent, mat, r, h, x, y, z, seg = 10, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (name) m.name = name;
  parent.add(m);
  return m;
}

// A wall segment made of concrete/render pieces around window and door openings.
// wall: { x0,x1,z, th (thickness), baseY, h, mat, windows: [{x0,x1,y0,y1, glass, grille, louvre}], doors: [{x0,x1,y0}] }
export function wallWithOpenings(parent, M, wall) {
  const { x0, x1, z, th = 0.25, baseY = 0, h, mat = 'wall', windows = [], doors = [] } = wall;
  const W = x1 - x0;
  const mk = (wx, wy, ww, wh, m = mat) => box(parent, M, m, ww, wh, th, x0 + wx + ww / 2, baseY + wy + wh / 2, z);
  // sort openings by x
  const opens = [
    ...windows.map(o => ({ ...o, kind: 'w' })),
    ...doors.map(o => ({ ...o, kind: 'd' })),
  ].sort((a, b) => a.x0 - b.x0);
  // left/right/top pieces between openings
  let cursor = 0;
  for (const o of opens) {
    if (o.x0 > cursor) mk(cursor, 0, o.x0 - cursor, h);           // pier
    if (o.y0 > 0) mk(o.x0, 0, o.x1 - o.x0, o.y0);                  // below sill/door
    if (o.y1 < h) mk(o.x0, o.y1, o.x1 - o.x0, h - o.y1);           // above head
    cursor = Math.max(cursor, o.x1);
  }
  if (cursor < W) mk(cursor, 0, W - cursor, h);
  // glass + frames + grilles
  for (const o of opens) {
    const cw = o.x1 - o.x0, ch = o.y1 - o.y0;
    if (o.kind === 'w' && o.glass !== false) {
      box(parent, M, 'glass', cw - 0.08, ch - 0.08, 0.04, x0 + o.x0 + cw / 2, baseY + o.y0 + ch / 2, z);
      // frame
      const f = 0.06;
      box(parent, M, 'glassFrame', cw, f, th + 0.02, x0 + o.x0 + cw / 2, baseY + o.y0 + f / 2, z);
      box(parent, M, 'glassFrame', cw, f, th + 0.02, x0 + o.x0 + cw / 2, baseY + o.y1 - f / 2, z);
      box(parent, M, 'glassFrame', f, ch, th + 0.02, x0 + o.x0 + f / 2, baseY + o.y0 + ch / 2, z);
      box(parent, M, 'glassFrame', f, ch, th + 0.02, x0 + o.x1 - f / 2, baseY + o.y0 + ch / 2, z);
    }
    if (o.kind === 'w' && o.grille) {
      const bars = Math.max(2, Math.floor(cw / 0.22));
      for (let i = 0; i <= bars; i++) {
        const bx = x0 + o.x0 + (cw * i) / bars;
        box(parent, M, 'grille', 0.035, ch - 0.05, 0.03, bx, baseY + o.y0 + ch / 2, z + th / 2 + 0.03);
      }
      for (let j = 0; j <= 2; j++) {
        const by = baseY + o.y0 + (ch * j) / 2;
        box(parent, M, 'grille', cw - 0.05, 0.035, 0.03, x0 + o.x0 + cw / 2, by, z + th / 2 + 0.03);
      }
    }
    if (o.kind === 'w' && o.louvre) {
      const slats = Math.floor(ch / 0.12);
      for (let i = 0; i < slats; i++) {
        const s = box(parent, M, 'glassFrame', cw - 0.06, 0.05, 0.06, x0 + o.x0 + cw / 2, baseY + o.y0 + 0.06 + i * 0.11, z);
        s.rotation.x = 0.7;
      }
    }
    if (o.kind === 'd') {
      box(parent, M, 'glassFrame', cw, 0.08, th + 0.04, x0 + o.x0 + cw / 2, baseY + o.y1 - 0.04, z);
      if (o.fill !== 'open') box(parent, M, o.fill || 'darkMetal', cw - 0.06, o.y1 - 0.1, 0.06, x0 + o.x0 + cw / 2, baseY + (o.y1 - 0.1) / 2, z + 0.05);
    }
  }
}

// Flat or gabled corrugated roof slab.
export function flatRoof(parent, M, x0, x1, z0, z1, y, th = 0.12, mat = 'zinc') {
  box(parent, M, mat, x1 - x0, th, z1 - z0, (x0 + x1) / 2, y + th / 2, (z0 + z1) / 2);
  // fascia
  box(parent, M, 'band', x1 - x0 + 0.1, 0.18, 0.08, (x0 + x1) / 2, y + 0.02, z0 - 0.02);
  box(parent, M, 'band', x1 - x0 + 0.1, 0.18, 0.08, (x0 + x1) / 2, y + 0.02, z1 + 0.02);
  box(parent, M, 'band', 0.08, 0.18, z1 - z0 + 0.1, x0 - 0.02, y + 0.02, (z0 + z1) / 2);
  box(parent, M, 'band', 0.08, 0.18, z1 - z0 + 0.1, x1 + 0.02, y + 0.02, (z0 + z1) / 2);
}
export function gableRoof(parent, M, x0, x1, z0, z1, eaveY, apexY, mat = 'zinc') {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const Lx = (x1 - x0) / 2, Lz = (z1 - z0) / 2;
  const rise = apexY - eaveY;
  const runZ = Lz;
  const ang = Math.atan2(rise, runZ);
  const lenZ = Math.hypot(rise, runZ) + 0.25;
  for (const s of [-1, 1]) {
    const slab = box(parent, M, mat, (x1 - x0) + 0.4, 0.08, lenZ, cx, eaveY + rise / 2 + 0.04, cz + (s * runZ) / 2);
    slab.rotation.x = s * ang;
  }
  // ridge + gable triangles (approx with thin boxes)
  box(parent, M, 'band', (x1 - x0) + 0.44, 0.12, 0.12, cx, apexY + 0.02, cz);
  for (const s of [-1, 1]) {
    const tri = box(parent, M, 'band', 0.1, rise, Lz * 0.96, x0 + 0.05 - (s < 0 ? 0 : (x1 - x0)), eaveY + rise / 2, cz);
    void tri;
    box(parent, M, 'band', 0.08, rise * 0.94, Lz * 0.9, x0 + 0.04, eaveY + rise * 0.47, cz);
    box(parent, M, 'band', 0.08, rise * 0.94, Lz * 0.9, x1 - 0.04, eaveY + rise * 0.47, cz);
  }
}

// ---------------------------------------------------------------- facade extras
export function canopy(parent, M, x0, x1, zEdge, y, depth = 1.6, posts = 3) {
  box(parent, M, 'alu', x1 - x0, 0.1, depth, (x0 + x1) / 2, y, zEdge + depth / 2);
  const n = posts;
  for (let i = 0; i < n; i++) {
    const px = x0 + ((x1 - x0) * (i + 0.5)) / n;
    cyl(parent, M.darkMetal, 0.07, y - 0.05, px, (y - 0.05) / 2, zEdge + depth - 0.15, 8);
  }
}
export function signBoard(parent, M, text, w, h, x, y, z, mat = 'signBoard', rotY = 0) {
  const grp = new THREE.Group();
  box(grp, M, mat, w, h, 0.08, 0, 0, 0);
  box(grp, M, 'band', w + 0.1, h + 0.1, 0.05, 0, 0, -0.03);
  // simple bar-lettering so the board reads as signage without text meshes
  const rnd = mulberry32(hashStr(text));
  const bars = Math.max(6, Math.min(26, Math.floor(w / 0.45)));
  for (let i = 0; i < bars; i++) {
    const bx = -w / 2 + 0.3 + ((w - 0.6) * i) / bars + rnd() * 0.12;
    const bh = h * (0.3 + rnd() * 0.45);
    box(grp, M, 'whitePaint', 0.14, bh, 0.05, bx, -h / 2 + bh / 2 + h * 0.1, 0.06);
  }
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;
  parent.add(grp);
  return grp;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- entrance marker
// The game places the model at rotY 0 facing +Z, so the road-facing edge is always local +Z.
export function markEntrance(parent, x, z, w = 2.4) {
  const g = new THREE.Group();
  g.name = 'entrance';
  box(g, M0, 'band', w, 0.05, 1.0, 0, 0.025, 0.3); // invisible-in-play mat, just a named node
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}
const M0 = makeMaterials();
// ---------------------------------------------------------------- boundary wall + gate
// Perimeter wall with a gate gap in the front (+Z) edge. inset keeps it off the plot edge.
export function boundaryWall(parent, M, W, D, h = 2.2, gateW = 4, inset = 1.6, mat = 'boundWall') {
  const x0 = -W / 2 + inset, x1 = W / 2 - inset, z1 = D / 2 - inset, z0 = -D / 2 + inset;
  const th = 0.22;
  // back, left, right
  box(parent, M, mat, x1 - x0, h, th, 0, h / 2, z0);
  box(parent, M, mat, th, h, z1 - z0, x0, h / 2, 0);
  box(parent, M, mat, th, h, z1 - z0, x1, h / 2, 0);
  // front, split around gate
  const g0 = -gateW / 2, g1 = gateW / 2;
  if (g0 > x0) box(parent, M, mat, g0 - x0, h, th, (x0 + g0) / 2, h / 2, z1);
  if (x1 > g1) box(parent, M, mat, x1 - g1, h, th, (g1 + x1) / 2, h / 2, z1);
  // coping + bottle caps
  for (const [cx, cz, Lx, Lz] of [[0, z0, x1 - x0, th], [x0, 0, th, z1 - z0], [x1, 0, th, z1 - z0],
    [((x0 + g0) / 2 + x0) / 2 + x0 / 2 - x0 / 2, z1, Math.max(0.1, (g0 - x0) / 2), th]]) {
    box(parent, M, 'band', Lx + 0.06, 0.07, Lz + 0.06, cx, h + 0.035, cz);
  }
  if (x0 < g0) {
    const w1 = g0 - x0;
    box(parent, M, 'band', w1 + 0.06, 0.07, th + 0.06, x0 + w1 / 2, h + 0.035, z1);
  }
  if (g1 < x1) {
    const w2 = x1 - g1;
    box(parent, M, 'band', w2 + 0.06, 0.07, th + 0.06, x1 - w2 / 2, h + 0.035, z1);
  }
  // gate posts + bars
  for (const px of [g0 - 0.25, g1 + 0.25]) {
    box(parent, M, 'band', 0.5, h + 0.5, 0.5, px, (h + 0.5) / 2, z1);
    cyl(parent, M.gate, 0.06, 0.4, px, h + 0.7, z1, 8);
  }
  const bars = Math.floor(gateW / 0.35);
  for (let i = 0; i <= bars; i++) {
    const bx = g0 + (gateW * i) / bars;
    box(parent, M, 'gate', 0.05, h - 0.3, 0.05, bx, (h - 0.3) / 2 + 0.15, z1);
  }
  box(parent, M, 'gate', gateW, 0.08, 0.05, 0, h - 0.2, z1);
  box(parent, M, 'gate', gateW, 0.08, 0.05, 0, 0.35, z1);
}

// Small guard hut on a corner of the boundary.
export function guardPost(parent, M, x, z, rotY = 0) {
  const g = new THREE.Group();
  const w = 2.6, d = 2.6, h = 2.6;
  box(g, M, 'band', w, 0.4, d, 0, 0.2, 0);
  box(g, M, 'whitePaint', w - 0.2, h - 0.6, d - 0.2, 0, 0.4 + (h - 0.6) / 2, 0);
  wallWithOpenings(g, M, {
    x0: -w / 2 + 0.2, x1: w / 2 - 0.2, z: d / 2 - 0.12, th: 0.1, baseY: 0.5, h: h - 0.6, mat: 'whitePaint',
    windows: [{ x0: 0.3, x1: w - 0.9, y0: 0.4, y1: 1.3, glass: true, grille: true }],
  });
  gableRoof(g, M, -w / 2 - 0.25, w / 2 + 0.25, -d / 2 - 0.25, d / 2 + 0.25, h - 0.05, h + 0.75, 'zinc');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

// Generator house: small locked box with louvred vents and a chimney pipe.
export function genHouse(parent, M, x, z, rotY = 0, s = 1) {
  const g = new THREE.Group();
  const w = 3.2 * s, d = 2.6 * s, h = 2.5 * s;
  box(g, M, 'concrete', w, 0.35, d, 0, 0.175, 0);
  box(g, M, 'whitePaint', w - 0.1, h - 0.4, d - 0.1, 0, 0.35 + (h - 0.4) / 2, 0);
  wallWithOpenings(g, M, {
    x0: -w / 2 + 0.05, x1: w / 2 - 0.05, z: d / 2 - 0.1, th: 0.1, baseY: 0.35, h: h - 0.4, mat: 'whitePaint',
    windows: [
      { x0: 0.2, x1: w - 0.5, y0: 0.5, y1: h - 0.9, glass: false, louvre: true },
      { x0: w - 1.4, x1: w - 0.2, y0: 0.3, y1: 1.6, glass: false, fill: 'darkMetal' },
    ],
  });
  flatRoof(g, M, -w / 2 - 0.15, w / 2 + 0.15, -d / 2 - 0.15, d / 2 + 0.15, h, 0.1, 'alu');
  cyl(g, M.darkMetal, 0.09, 1.2, -w / 4, h + 0.7, -d / 4, 10, 'gen_chimney');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- roof equipment
export function waterTank(parent, M, x, z, s = 1, overhead = true) {
  const g = new THREE.Group();
  g.name = 'roof_water_tank';
  const r = 0.55 * s;
  if (overhead) {
    for (const [lx, lz] of [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]]) {
      box(g, M, 'darkMetal', 0.08, 1.9 * s, 0.08, lx * s, 0.95 * s, lz * s);
    }
    box(g, M, 'darkMetal', 1.6 * s, 0.08, 1.3 * s, 0, 1.95 * s, 0);
  }
  cyl(g, M.plasticTank, r, 0.9 * s, 0, (overhead ? 1.95 * s : 0) + 0.45 * s, 0, 14, 'tank_body');
  box(g, M, 'plasticTank', r * 1.9, 0.12, r * 1.9, 0, (overhead ? 1.95 * s : 0) + 0.95 * s, 0); // lid
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}
export function dstvDish(parent, M, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  g.name = 'dstv_dish';
  cyl(g, M.whitePaint, 0.3, 0.04, 0, 0.12, 0, 12);
  g.children[0].rotation.z = Math.PI / 2;
  box(g, M, 'darkMetal', 0.05, 0.3, 0.05, 0, -0.15, 0); // arm down to roof
  box(g, M, 'darkMetal', 0.04, 0.06, 0.3, 0.28, 0.12, 0); // LNB arm
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}
export function acUnit(parent, M, x, y, z, face = 1) {
  const g = new THREE.Group();
  g.name = 'ac_outdoor_unit';
  box(g, M, 'whitePaint', 0.85, 0.55, 0.32, 0, 0, 0);
  box(g, M, 'grille', 0.7, 0.4, 0.02, 0, 0, 0.17);
  box(g, M, 'band', 0.9, 0.05, 0.36, 0, -0.3, 0);
  g.position.set(x, y, z);
  if (face === 1) g.rotation.y = 0;
  else if (face === -1) g.rotation.y = Math.PI;
  else if (face === 2) g.rotation.y = -Math.PI / 2;
  else g.rotation.y = Math.PI / 2;
  parent.add(g);
  return g;
}
export function antenna(parent, M, x, y, z) {
  const g = new THREE.Group();
  g.name = 'antenna';
  cyl(g, M.darkMetal, 0.02, 1.6, 0, 0.8, 0, 6);
  for (let i = 0; i < 5; i++) {
    const w = 1.1 - i * 0.2;
    box(g, M, 'darkMetal', w, 0.03, 0.03, 0, 0.5 + i * 0.28, 0);
  }
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- site furniture
export function flagpole(parent, M, x, z, h = 7, flag = 'green') {
  const g = new THREE.Group();
  g.name = 'flagpole';
  cyl(g, M.whitePaint, 0.07, h, 0, h / 2, 0, 8);
  box(g, M, 'band', 0.18, 0.18, 0.18, 0, h, 0);
  box(g, M, flag === 'green' ? 'nigerianFlag' : 'blue', 1.9, 1.25, 0.04, 1.0, h - 0.95, 0, 'flag_cloth');
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}
export function colonnade(parent, M, x0, x1, zEdge, yBase, h, n = 4, gap = 0.6) {
  const g = new THREE.Group();
  g.name = 'colonnade';
  const span = x1 - x0;
  for (let i = 0; i < n; i++) {
    const px = x0 + gap + (span - gap * 2) * (i / (n - 1));
    cyl(g, M.concrete, 0.28, h, px, yBase + h / 2, zEdge, 10, `column_${i}`);
    box(g, M, 'concrete', 0.8, 0.14, 0.8, px, yBase, zEdge);
    box(g, M, 'concrete', 0.8, 0.14, 0.8, px, yBase + h, zEdge);
  }
  box(g, M, 'concrete', span + 0.5, 0.35, 1.1, (x0 + x1) / 2, yBase + h + 0.25, zEdge, 'entablature');
  box(g, M, 'concrete', span + 0.8, 0.2, 1.3, (x0 + x1) / 2, yBase + h + 0.5, zEdge, 'cornice');
  parent.add(g);
  return g;
}
export function clockFace(parent, M, x, y, z, r = 0.9, rotY = 0) {
  const g = new THREE.Group();
  g.name = 'clock';
  cyl(g, M.whitePaint, r, 0.12, 0, 0, 0, 24, 'clock_body');
  g.children[0].rotation.x = Math.PI / 2;
  cyl(g, M.whitePaint, r, 0.05, 0, 0, 0.07, 24, 'clock_face');
  g.children[1].rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(g, M, 'darkMetal', 0.05, 0.12, 0.02, Math.sin(a) * (r - 0.14), Math.cos(a) * (r - 0.14), 0.1, `tick_${i}`);
  }
  box(g, M, 'darkMetal', 0.05, 0.55, 0.02, 0, 0.27, 0.11, 'clock_hour');
  box(g, M, 'darkMetal', 0.035, 0.72, 0.02, 0.16, 0.42, 0.11, 'clock_min');
  g.children[g.children.length - 2].rotation.z = -Math.PI / 3;
  g.children[g.children.length - 1].rotation.z = -Math.PI * 0.75;
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}
export function coatOfArms(parent, M, x, y, z, s = 1, rotY = 0) {
  const g = new THREE.Group();
  g.name = 'coat_of_arms';
  box(g, M, 'cream', 1.5 * s, 1.5 * s, 0.12 * s, 0, 0, 0, 'panel');
  box(g, M, 'nigerianFlag', 1.2 * s, 0.16 * s, 0.14 * s, 0, 0.45 * s, 0);
  cyl(g, M.darkMetal, 0.28 * s, 0.16 * s, 0, 0, 0.06 * s, 12, 'eagle_body');
  box(g, M, 'darkMetal', 0.5 * s, 0.08 * s, 0.1 * s, 0, 0.1 * s, 0.06 * s);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}
export function fountain(parent, M, x, z, s = 1) {
  const g = new THREE.Group();
  g.name = 'fountain';
  cyl(g, M.concrete, 1.6 * s, 0.5 * s, 0, 0.25 * s, 0, 20, 'basin_ring');
  cyl(g, M.pool, 1.45 * s, 0.06 * s, 0, 0.42 * s, 0, 20, 'water_surface');
  cyl(g, M.concrete, 0.18 * s, 1.1 * s, 0, 1.0 * s, 0, 10);
  cyl(g, M.concrete, 0.55 * s, 0.12 * s, 0, 1.55 * s, 0, 16, 'upper_basin');
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}
export function glassCurtain(parent, M, x0, x1, z, y0, y1, bays = 6) {
  const g = new THREE.Group();
  g.name = 'glass_curtain';
  const span = x1 - x0, hgt = y1 - y0, ymid = (y0 + y1) / 2;
  box(parent, M, 'glass', span, hgt, 0.06, (x0 + x1) / 2, ymid, z, 'glass_sheet');
  const bw = span / bays;
  for (let i = 0; i <= bays; i++) {
    box(parent, M, 'darkMetal', 0.1, hgt, 0.14, x0 + i * bw, ymid, z, `mullion_${i}`);
  }
  for (let j = 0; j <= 1; j++) {
    box(parent, M, 'darkMetal', span, 0.12, 0.14, (x0 + x1) / 2, y0 + j * hgt, z, `transom_${j}`);
  }
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- export / compress
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, quantize, flatten } from '@gltf-transform/functions';

export async function exportGLB(root, outPath) {
  const exporter = new GLTFExporter();
  const glb = await new Promise((res, rej) => exporter.parse(root, res, rej, { binary: true, onlyVisible: true }));
  return Buffer.from(glb);
}

export async function optimizeGLB(raw) {
  const io = new NodeIO();
  const doc = await io.readBinary(raw);
  const steps = [
    ['flatten', flatten()],
    ['quantize', quantize({ excludeAttributes: [] })],
    ['dedup', dedup()],
    ['prune', prune()],
  ];
  for (const [, t] of steps) {
    await doc.transform(t);
  }
  const out = await io.writeBinary(doc);
  return Buffer.from(out);
}