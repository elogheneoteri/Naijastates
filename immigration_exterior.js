// Immigration Office: exterior, built entirely in code (no .glb file needed).
// Local space: building centre is (0,0,0) on the ground, the front faces +Z (south, towards the road).
// Main body: x -7.4..7.4, z -7.3..3.9, so the collision box already in game.js still fits.
// Returns { group, update }. game.js adds the group and calls update() every frame (flags wave).

import * as THREE from 'three';
import { loadProp } from './props_library.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- textures (drawn with code, no image files) ----------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plasterTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#ece5d3'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${0.05 + rand() * 0.08})` : `rgba(90,75,55,${0.03 + rand() * 0.06})`;
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
    for (let i = 0; i < 46; i++) {           // rain streaks running down the wall
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(80,65,45,0)');
      gr.addColorStop(0.55, `rgba(80,65,45,${0.02 + rand() * 0.04})`);
      gr.addColorStop(1, `rgba(80,65,45,${0.07 + rand() * 0.08})`);
      g.fillStyle = gr; g.fillRect(rand() * w, 0, 5 + rand() * 22, h);
    }
    const gb = g.createLinearGradient(0, h * 0.84, 0, h);   // dirt near the ground
    gb.addColorStop(0, 'rgba(70,58,42,0)'); gb.addColorStop(1, 'rgba(70,58,42,0.28)');
    g.fillStyle = gb; g.fillRect(0, h * 0.84, w, h * 0.16);
  });
}

function glassTex() {
  return canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#a9d0e2'); gr.addColorStop(0.5, '#5f93aa'); gr.addColorStop(1, '#2f5b6f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.16)';             // diagonal reflection streaks
    g.beginPath(); g.moveTo(w * 0.1, h); g.lineTo(w * 0.45, h); g.lineTo(w * 0.95, 0); g.lineTo(w * 0.6, 0); g.fill();
    g.beginPath(); g.moveTo(w * 0.62, h); g.lineTo(w * 0.72, h); g.lineTo(w * 1.1, 0); g.lineTo(w * 1.0, 0); g.fill();
  });
}

function pavingTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f6165'; g.fillRect(0, 0, w, h);
    const bw = 32, bh = 16;
    for (let r = 0; r < h / bh; r++) {
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), v = 150 + rand() * 40;
        g.fillStyle = rand() < 0.18 ? `rgb(${v + 20},${v - 45},${v - 70})` : `rgb(${v},${v - 4},${v - 12})`;
        g.fillRect(x + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTex(w, h, bg, lines) {
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f3efe0'; g.lineWidth = h * 0.03;
    g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h * 0.9);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = Math.round(h * 0.02) + 'px';
    lines.forEach(l => {
      g.font = `bold ${l.size}px Arial, sans-serif`;
      g.fillStyle = l.color || '#f7f3e4';
      g.fillText(l.t, w / 2, l.y);
    });
  });
}

function flagTex() {
  return canvasTex(300, 160, (g, w, h) => {
    g.fillStyle = '#0f8a46'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7f7f2'; g.fillRect(w / 3, 0, w / 3, h);
  });
}

// ---------- instancing: many copies of one part drawn in a single call ----------

class Inst {
  constructor(mat, geo = BOX) { this.mat = mat; this.geo = geo; this.items = []; }
  add(x, y, z, sx, sy, sz, ry = 0, color = null) { this.items.push({ x, y, z, sx, sy, sz, ry, color }); }
  build() {
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    this.items.forEach((it, i) => {
      e.set(0, it.ry, 0); q.setFromEuler(e);
      m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, m);
      if (it.color !== null) im.setColorAt(i, new THREE.Color(it.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    return im;
  }
}

// ---------- the building ----------

export function buildImmigrationOffice() {
  seed = 7;
  const g = new THREE.Group();

  const std = (color, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: plasterTex(), roughness: 0.95 }),
    trim: std(0xf3efe3, 0.8),
    green: std(0x0f7a3e, 0.7),
    plinth: std(0x85878a, 0.95),
    roof: std(0x4a4e53, 0.95),
    concrete: std(0xb7b6b0, 0.95),
    step: std(0xa9a8a2, 0.95),
    frame: std(0x2a2d30, 0.5, 0.3),
    bar: std(0xf0eee4, 0.6),
    ac: std(0xf2f4f5, 0.6),
    dark: std(0x1f2327, 0.7),
    steel: std(0xc9cdd0, 0.4, 0.25),
    soil: std(0x3b2f26, 1),
    shrub: std(0xffffff, 0.9),
    glass: new THREE.MeshStandardMaterial({ map: glassTex(), roughness: 0.15, metalness: 0, emissive: 0x16394a, emissiveIntensity: 0.35 }),
  };

  const box = (mat, w, h, d, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    g.add(m); return m;
  };
  const sign = (w, h, x, y, z, tex) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.6 }));
    m.position.set(x, y, z); g.add(m); return m;
  };

  const I = {
    frame: new Inst(M.frame), glass: new Inst(M.glass), bar: new Inst(M.bar), trim: new Inst(M.trim),
    ac: new Inst(M.ac), dark: new Inst(M.dark), shrub: new Inst(M.shrub, new THREE.SphereGeometry(0.5, 10, 8)),
  };

  // Place a part in a wall's own space: lx along the wall, ly up, lz out from the wall.
  const put = (inst, cx, cy, cz, ry, lx, ly, lz, sx, sy, sz) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    inst.add(cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c, sx, sy, sz, ry);
  };

  function addWindow(cx, cy, cz, ry, w, h, bars = true) {
    const p = (inst, lx, ly, lz, sx, sy, sz) => put(inst, cx, cy, cz, ry, lx, ly, lz, sx, sy, sz);
    p(I.glass, 0, 0, 0.03, w, h, 0.04);
    p(I.frame, 0, h / 2, 0.07, w + 0.12, 0.1, 0.1);
    p(I.frame, 0, -h / 2, 0.07, w + 0.12, 0.1, 0.1);
    p(I.frame, -w / 2, 0, 0.07, 0.1, h, 0.1);
    p(I.frame, w / 2, 0, 0.07, 0.1, h, 0.1);
    p(I.frame, 0, 0, 0.07, 0.06, h, 0.08);
    p(I.frame, 0, h * 0.15, 0.07, w, 0.06, 0.08);
    p(I.trim, 0, h / 2 + 0.2, 0.06, w + 0.6, 0.26, 0.14);      // lintel
    p(I.trim, 0, -h / 2 - 0.1, 0.1, w + 0.5, 0.12, 0.3);       // sill
    p(I.trim, -w / 2 - 0.2, 0, 0.04, 0.2, h + 0.1, 0.1);
    p(I.trim, w / 2 + 0.2, 0, 0.04, 0.2, h + 0.1, 0.1);
    if (bars) {                                                 // burglar bars
      const n = Math.round(w / 0.2);
      for (let i = 0; i <= n; i++) p(I.bar, -w / 2 + 0.05 + i * (w - 0.1) / n, 0, 0.24, 0.03, h + 0.05, 0.03);
      p(I.bar, 0, h * 0.15, 0.24, w, 0.03, 0.03);
      p(I.bar, 0, -h * 0.3, 0.24, w, 0.03, 0.03);
    }
  }

  function addAC(cx, cy, cz, ry) {
    put(I.ac, cx, cy, cz, ry, 0, 0, 0.17, 0.95, 0.36, 0.3);
    put(I.dark, cx, cy, cz, ry, 0, -0.03, 0.315, 0.8, 0.05, 0.02);
  }

  // ----- body -----
  const W = 14.8, D = 11.2, ZC = -1.7, HT = 8.4;
  box(M.plinth, W + 0.3, 0.3, D + 0.3, 0, 0.15, ZC + 0.05);
  box(M.wall, W, HT, D, 0, HT / 2, ZC);
  box(M.trim, W + 0.2, 0.3, D + 0.2, 0, 4.2, ZC);              // floor band
  box(M.green, W + 0.12, 0.45, D + 0.12, 0, 7.7, ZC);          // green stripe
  box(M.trim, W + 0.3, 0.2, D + 0.3, 0, 8.5, ZC);              // parapet cap
  box(M.roof, W - 0.5, 0.12, D - 0.5, 0, 8.0, ZC, false);      // roof surface behind the parapet
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) =>   // corner pillars
    box(M.trim, 0.6, HT, 0.6, sx * 7.4, HT / 2, sz > 0 ? 3.9 : -7.3));

  // ----- front steps and forecourt paving -----
  box(M.step, 8.6, 0.12, 3.3, 0, 0.06, 5.55);
  box(M.step, 8.0, 0.24, 3.0, 0, 0.12, 5.4);
  const pave = pavingTex(); pave.repeat.set(20 / 3.2, 4.3 / 3.2);
  const fore = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.3), new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95 }));
  fore.rotation.x = -Math.PI / 2; fore.position.set(0, 0.01, 6.15); fore.receiveShadow = true; g.add(fore);

  // ----- portico (entrance porch with four columns) -----
  box(M.trim, 7.4, 0.9, 2.9, 0, 7.75, 5.35);                   // beam
  box(M.trim, 7.9, 0.2, 3.3, 0, 8.3, 5.45);                    // porch roof
  box(M.green, 7.9, 0.1, 0.05, 0, 8.18, 7.13);
  const colMat = std(0xf6f3ea, 0.7);
  [-3.3, -1.7, 1.7, 3.3].forEach(x => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 6.51, 20), colMat);
    col.position.set(x, 3.745, 6.2); col.castShadow = col.receiveShadow = true; g.add(col);
    box(M.trim, 0.8, 0.25, 0.8, x, 0.365, 6.2);
    box(M.trim, 0.8, 0.3, 0.8, x, 7.15, 6.2);
  });
  sign(6.4, 0.8, 0, 7.75, 6.81, signTex(2048, 256, '#0b5a2e', [
    { t: 'REPUBLIC OF NIGERIA', size: 48, y: 62 },
    { t: 'IMMIGRATION OFFICE', size: 108, y: 168 },
  ]));

  // ----- entrance door -----
  const y0 = 0.24;
  box(M.frame, 0.12, 3.6, 0.2, -1.26, y0 + 1.8, 3.97);
  box(M.frame, 0.12, 3.6, 0.2, 1.26, y0 + 1.8, 3.97);
  box(M.frame, 2.64, 0.12, 0.2, 0, y0 + 3.6, 3.97);
  box(M.frame, 2.4, 0.08, 0.12, 0, y0 + 3.0, 3.99);
  box(M.frame, 0.08, 2.9, 0.12, 0, y0 + 1.5, 3.99);
  box(M.glass, 1.12, 2.9, 0.05, -0.58, y0 + 1.5, 4.0);
  box(M.glass, 1.12, 2.9, 0.05, 0.58, y0 + 1.5, 4.0);
  box(M.glass, 2.4, 0.5, 0.05, 0, y0 + 3.3, 4.0);
  box(M.steel, 0.04, 0.9, 0.05, -0.16, y0 + 1.4, 4.08);
  box(M.steel, 0.04, 0.9, 0.05, 0.16, y0 + 1.4, 4.08);
  box(M.trim, 3.2, 0.25, 0.2, 0, y0 + 3.85, 3.98);
  sign(1.4, 0.7, -2.55, 2.4, 3.94, signTex(512, 256, '#0b5a2e', [
    { t: 'ARRIVALS', size: 56, y: 85 }, { t: '& NIN', size: 56, y: 165 }]));
  sign(1.4, 0.7, 2.55, 2.4, 3.94, signTex(512, 256, '#0b5a2e', [
    { t: 'PASSPORT', size: 56, y: 85 }, { t: '& PERMITS', size: 56, y: 165 }]));

  // ----- windows -----
  [-6.4, -4.6, 4.6, 6.4].forEach(x => { addWindow(x, 2.2, 3.9, 0, 1.4, 1.8); addWindow(x, 6.1, 3.9, 0, 1.4, 1.8); });
  [-1.3, 1.3].forEach(x => addWindow(x, 6.0, 3.9, 0, 2.0, 2.2, false));      // above the porch
  [-5.2, -1.7, 1.8].forEach(z => [2.2, 6.1].forEach(y => {
    addWindow(7.4, y, z, Math.PI / 2, 1.4, 1.8);
    addWindow(-7.4, y, z, -Math.PI / 2, 1.4, 1.8);
  }));
  [-5.4, -1.9, 1.9, 5.4].forEach(x => [2.2, 6.1].forEach(y => addWindow(x, y, -7.3, Math.PI, 1.4, 1.8)));
  [-3.45, 0.05].forEach(z => { addAC(7.4, 5.3, z, Math.PI / 2); addAC(-7.4, 5.3, z, -Math.PI / 2); });
  addAC(-3.6, 5.3, -7.3, Math.PI); addAC(3.6, 5.3, -7.3, Math.PI);

  // ----- back door -----
  box(M.green, 1.3, 2.4, 0.08, 0, 1.2, -7.34);
  box(M.trim, 1.7, 0.2, 0.2, 0, 2.5, -7.4);
  box(M.trim, 1.9, 0.1, 0.9, 0, 2.75, -7.75);
  box(M.step, 1.8, 0.14, 0.8, 0, 0.07, -7.75);

  // ----- roof extras: water tanks and satellite dish -----
  // Built-in tanks are the fallback; they are removed once the real overhead tank model has loaded.
  const oldTanks = [];
  const tank = (x, z, r, h) => {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => oldTanks.push(box(M.steel, 0.1, 0.8, 0.1, x + a * r * 0.7, 8.5, z + b * r * 0.7)));
    oldTanks.push(box(M.steel, r * 2.2, 0.1, r * 2.2, x, 8.95, z));
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), M.dark);
    t.position.set(x, 9.0 + h / 2, z); t.castShadow = true; g.add(t); oldTanks.push(t);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.12, 16), M.dark);
    lid.position.set(x, 9.0 + h + 0.06, z); g.add(lid); oldTanks.push(lid);
  };
  tank(-4.5, -4.5, 0.8, 1.5); tank(-2.2, -4.5, 0.6, 1.2);

  // Real overhead water tank (props_library.js) on one steel stand
  loadProp('overhead_tank').then(p => {
    oldTanks.forEach(o => g.remove(o));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(M.steel, 0.12, 0.8, 0.12, -3.4 + a * 1.5, 8.5, -4.5 + b * 0.95));
    box(M.steel, 3.5, 0.1, 2.3, -3.4, 8.95, -4.5);
    p.position.set(-3.4, 9.0, -4.5); g.add(p);
  }).catch(e => console.warn('immigration office: could not load the overhead tank, keeping the built-in tanks', e));
  box(M.steel, 0.08, 1.0, 0.08, 5, 8.6, -4);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf2f2f2, 0.5));
  dish.material.side = THREE.DoubleSide; dish.rotation.x = Math.PI + 1.0; dish.position.set(5, 9.2, -4); dish.castShadow = true; g.add(dish);

  // ----- planters with shrubs along the front -----
  [-1, 1].forEach(sx => {
    box(M.concrete, 3.4, 0.5, 0.8, sx * 5.3, 0.25, 4.3);
    box(M.soil, 3.2, 0.02, 0.6, sx * 5.3, 0.51, 4.3, false);
    for (let i = 0; i < 6; i++) {
      const s = 0.8 + rand() * 0.5, tone = new THREE.Color().setHSL(0.3 + rand() * 0.05, 0.5, 0.2 + rand() * 0.1);
      I.shrub.add(sx * (3.85 + i * 0.6), 0.5 + s * 0.32, 4.3 + (rand() - 0.5) * 0.15, s, s * 0.8, s, rand() * 3, tone.getHex());
    }
  });

  // ----- flag poles (Nigerian flag, waves in update) -----
  const ftex = flagTex(), flags = [];
  [-1, 1].forEach(sx => {
    const px = sx * 9.2;
    box(M.concrete, 0.8, 0.3, 0.8, px, 0.15, 5.8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 10.2, 12), M.steel);
    pole.position.set(px, 5.4, 5.8); pole.castShadow = true; g.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), std(0xd9b04a, 0.4, 0.5));
    ball.position.set(px, 10.58, 5.8); g.add(ball);
    const geo = new THREE.PlaneGeometry(2.4, 1.3, 18, 8);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ftex, side: THREE.DoubleSide, roughness: 0.8 }));
    mesh.position.set(px + 1.2, 9.8, 5.8); g.add(mesh);
    flags.push({ geo, base: geo.attributes.position.array.slice() });
  });

  // ----- guard booth on the right of the forecourt -----
  box(M.plinth, 2.4, 0.2, 2.4, 11, 0.1, 5.5);
  box(M.wall, 2.2, 2.5, 2.2, 11, 1.45, 5.5);
  box(M.green, 3.0, 0.15, 3.0, 11, 2.78, 5.5);
  box(M.glass, 1.4, 0.9, 0.05, 11, 1.6, 6.62);
  box(M.frame, 1.5, 0.08, 0.1, 11, 2.07, 6.62);
  box(M.frame, 1.5, 0.08, 0.1, 11, 1.13, 6.62);
  box(M.green, 0.08, 1.9, 0.9, 9.88, 1.15, 5.5);
  sign(1.4, 0.3, 11, 2.35, 6.63, signTex(512, 110, '#0b5a2e', [{ t: 'SECURITY', size: 64, y: 58 }]));

  // ----- add the instanced parts -----
  Object.values(I).forEach(inst => g.add(inst.build()));

  const update = () => {
    const t = performance.now() / 1000;
    flags.forEach(f => {
      const pos = f.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = (f.base[i * 3] + 1.2) / 2.4;               // 0 at the pole, 1 at the free end
        pos.setZ(i, Math.sin(u * 6 - t * 4) * 0.14 * u);
      }
      pos.needsUpdate = true;
      f.geo.computeVertexNormals();
    });
  };

  return { group: g, update };
}
