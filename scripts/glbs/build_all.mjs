// Generates every building exterior GLB for the Naijastates world.
// Each generator builds a THREE.Group centred on the origin, sitting on y=0,
// facing +Z (south). Output: assets/buildings/<code>.glb (quantised/deduped).
import { installDocumentShim } from './node_shims.mjs';
installDocumentShim();
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  makeMaterials, box, cyl, wallWithOpenings, flatRoof, gableRoof, canopy, signBoard,
  markEntrance, boundaryWall, guardPost, genHouse, waterTank, dstvDish, acUnit, antenna,
  flagpole, colonnade, clockFace, coatOfArms, fountain, glassCurtain, exportGLB, optimizeGLB,
} from './lib.mjs';

mkdirSync('assets/buildings', { recursive: true });

// ---------------------------------------------------------------- local helpers
const rotY = (grp, deg) => { const r = new THREE.Group(); grp.rotation.y = deg * Math.PI / 180; r.add(grp); return r; };
const vec = (x, y, z) => { const v = new THREE.Vector3(x, y, z); v.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg2rad); return v; };
const deg2rad = (d) => d * Math.PI / 180;

// Window grid generator: returns an array of window specs for one wall run.
// cols are placed across [x0, x1] with a door gap skipped.
function winRow(x0, x1, y0, y1, cols, door = null) {
  const span = x1 - x0, out = [];
  const step = span / cols;
  for (let i = 0; i < cols; i++) {
    const wx0 = x0 + i * step + step * 0.22, wx1 = x0 + (i + 1) * step - step * 0.22;
    if (door && wx1 > door.x0 + 0.1 && wx0 < door.x1 - 0.1) continue;
    out.push({ x0: wx0, x1: wx1, y0, y1, glass: true, grille: true });
  }
  return out;
}
function doorsAt(x, w) { return [{ x0: x - w / 2, x1: x + w / 2, y0: 0, fill: 'darkMetal' }]; }

// Tree: trunk + 2-3 leaf blobs
function tree(parent, M, x, z, s = 1) {
  cyl(parent, M.trunk, 0.16 * s, 2.6 * s, x, 1.3 * s, z, 7);
  const rnd = Math.random;
  const blobs = [[0, 3.4, 0, 1.3], [0.7, 2.9, 0.4, 1.0], [-0.7, 3.0, -0.3, 0.9], [0.1, 4.1, -0.5, 0.8]];
  for (const [bx, by, bz, br] of blobs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(br * s, 8, 7), M.leaf);
    m.position.set(x + bx * s, by * s, z + bz * s); m.castShadow = true;
    parent.add(m);
  }
}

// Simple parked car (box body + cabin) — props make streets feel real
function car(parent, M, x, z, rotYdeg, color) {
  const g = new THREE.Group();
  box(g, M, color, 4.2, 0.55, 1.7, 0, 0.55, 0, 'body');
  box(g, M, color, 2.2, 0.5, 1.6, -0.2, 1.1, 0, 'cabin');
  box(g, M, 'black', 4.3, 0.4, 1.8, 0, 0.3, 0, 'base');
  for (const [wx, wz] of [[1.4, 0.75], [1.4, -0.75], [-1.4, 0.75], [-1.4, -0.75]]) {
    cyl(g, M.black, 0.34, 0.2, wx, 0.34, wz, 10).rotation.z = Math.PI / 2;
  }
  g.rotation.y = rotYdeg * Math.PI / 180;
  g.position.set(x, 0, z);
  parent.add(g);
}

// Pavement slab strip
function slab(parent, M, x0, x1, z0, z1, y = 0.03, mat = 'band') {
  box(parent, M, mat, x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, 'slab');
}

// ---------------------------------------------------------------- generators

const GEN = {};

// ===================== AERIAL / ARRIVAL =====================
// Plot 32 x 24. Front faces +Z.
GEN.airport = (M) => {
  const g = new THREE.Group(); g.name = 'airport';
  // Terminal block: 24 x 12, glass curtain front, flat roof
  const W = 24, D = 12, H = 6.4;
  wallWithOpenings(g, M, { x0: -W / 2, x1: W / 2, z: D / 2, th: 0.3, baseY: 0, h: H, mat: 'white',
    windows: winRow(-W / 2, W / 2, 1.0, 3.2, 8),
    doors: [{ x0: -1.6, x1: 1.6, y0: 0, fill: 'glass' }] });
  box(g, M, 'white', W, H, 0.3, 0, H / 2, -D / 2, 'back');
  box(g, M, 'white', 0.3, H, D, -W / 2, H / 2, 0, 'left');
  box(g, M, 'white', 0.3, H, D, W / 2, H / 2, 0, 'right');
  box(g, M, 'band', W + 0.4, 0.5, D + 0.4, 0, 0.25, 0, 'plinth');
  glassCurtain(g, M, -11, 11, D / 2 - 0.15, 0.4, 3.6, 8);
  flatRoof(g, M, -W / 2 - 0.6, W / 2 + 0.6, -D / 2 - 0.6, D / 2 + 0.6, H, 0.18, 'alu');
  canopy(g, M, -9, 9, D / 2, 3.6, 3.6, 6);
  signBoard(g, M, 'NAIJA INTL AIRPORT', 12, 1.4, 0, H - 0.9, D / 2 + 0.4, 'darkMetal');
  // Control tower on the west side
  const tx = -13, tz = -2;
  cyl(g, M.concrete, 1.6, 14, tx, 7, tz, 12, 'tower');
  box(g, M, 'darkMetal', 6.5, 3.2, 6.5, tx, 15.4, tz, 'cab');
  glassCurtain(g, M, tx - 2.9, tx + 2.9, tz + 3.25, 14.6, 16.4, 4);
  flatRoof(g, M, tx - 3.4, tx + 3.4, tz - 3.4, tz + 3.4, 17.0, 0.2, 'alu');
  antenna(g, M, tx, 17.2, tz);
  // Apron + taxiway markings
  slab(g, M, -14, 14, D / 2, 11.5, 0.01, 'tarmac');
  box(g, M, 'whitePaint', 0.3, 0.02, 4, 4, 0.04, 9.5, 'apronLine');
  box(g, M, 'whitePaint', 0.3, 0.02, 4, 9, 0.04, 9.5, 'apronLine2');
  return g;
};

// ===================== HOUSING: LINE HOUSES =====================
// Plot 25 x 22. Front faces +Z.
GEN.low_line = (M) => {
  const g = new THREE.Group(); g.name = 'low_line';
  const units = 5, uW = 5.0, D = 11, H = 3.2, W = units * uW;
  for (let i = 0; i < units; i++) {
    const cx = -W / 2 + i * uW + uW / 2;
    wallWithOpenings(g, M, { x0: cx - uW / 2, x1: cx + uW / 2, z: D / 2, th: 0.25, baseY: 0, h: H, mat: 'wall',
      windows: [{ x0: cx - 1.9, x1: cx - 0.5, y0: 1.0, y1: 2.5, grille: true }, { x0: cx + 0.5, x1: cx + 1.9, y0: 1.0, y1: 2.5, grille: true }],
      doors: [{ x0: cx - 0.6, x1: cx + 0.6, y0: 0, fill: 'darkMetal' }] });
    box(g, M, 'wall', uW, H, 0.25, cx, H / 2, -D / 2, 'back');
    box(g, M, 'wall', 0.25, H, D, cx - uW / 2, H / 2, 0, 'left');
    box(g, M, 'wall', 0.25, H, D, cx + uW / 2, H / 2, 0, 'right');
    box(g, M, 'glass', 1.4, 1.3, 0.06, cx, 1.6, -D / 2 - 0.1, 'backWin');
    gableRoof(g, M, cx - uW / 2 - 0.4, cx + uW / 2 + 0.4, -D / 2 - 0.4, D / 2 + 0.4, H, H + 1.6, 'zinc');
    for (const vx of [cx - 2, cx, cx + 2]) { cyl(g, M.concrete, 0.12, 2.4, vx, 1.2, D / 2 + 0.9, 8, 'vPillar'); }
    slab(g, M, cx - uW / 2, cx + uW / 2, D / 2, D / 2 + 1.6, 0.02, 'band');
  }
  boundaryWall(g, M, 24, 21, 2.0, 5, 1.2);
  slab(g, M, -12, 12, D / 2 + 1.6, 10.4, 0.02, 'band');
  car(g, M, -6, 9, 180, 'red'); car(g, M, 4, 9, 180, 'white');
  tree(g, M, -11.5, -9, 1.1); tree(g, M, 11.5, -9, 0.9);
  return g;
};

// ===================== HOUSING: BED-SITTERS =====================
// Plot 24 x 22. Two 2-storey bedsit blocks flanking a central passage.
GEN.low_bedsit = (M) => {
  const g = new THREE.Group(); g.name = 'low_bedsit';
  const block = (offX) => {
    const W = 11, D = 12, h = 3.0, F = 2;
    for (let f = 0; f < F; f++) {
      wallWithOpenings(g, M, { x0: offX - W / 2, x1: offX + W / 2, z: 5.5, th: 0.25, baseY: f * h, h, mat: 'wall',
        windows: winRow(offX - W / 2, offX + W / 2, 0.9, 2.4, 4, f === 0 ? { x0: offX - 1.1, x1: offX + 1.1 } : null),
        doors: f === 0 ? [{ x0: offX - 1.1, x1: offX + 1.1, y0: 0, fill: 'darkMetal' }] : [] });
      box(g, M, 'wall', W, h, 0.25, offX, f * h + h / 2, -D / 2 + 5.5, 'bBack');
      box(g, M, 'wall', 0.25, h, D, offX - W / 2, f * h + h / 2, 5.5 - D / 2, 'bLeft');
      box(g, M, 'wall', 0.25, h, D, offX + W / 2, f * h + h / 2, 5.5 - D / 2, 'bRight');
      if (f === F - 1) flatRoof(g, M, offX - W / 2 - 0.4, offX + W / 2 + 0.4, -D / 2 + 5.1, 5.9, F * h, 0.14, 'zinc');
    }
    waterTank(g, M, offX - 3, 1.5, 1.0, true);
    waterTank(g, M, offX + 3.5, 1.5, 0.9, true);
    dstvDish(g, M, offX - 1, 1.2, 5.6, 0);
    acUnit(g, M, offX + 1.5, 1.4, 5.6, 1);
  };
  block(-6); block(6);
  slab(g, M, -2.2, 2.2, -6.5, 7, 0.02, 'band');
  boundaryWall(g, M, 23, 21, 2.0, 4.5, 1.0);
  car(g, M, -9.5, 9.5, 180, 'blue');
  tree(g, M, 10.5, 9.5, 1.0); tree(g, M, -10.5, -9.5, 0.9);
  return g;
};

// ===================== UNIVERSITY =====================
GEN.university = (M) => {
  const g = new THREE.Group(); g.name = 'university';
  // Main lecture hall: 2-storey concrete block with glass bands
  const WH = 21, WD = 13, fh = 3.6;
  for (let f = 0; f < 2; f++) {
    wallWithOpenings(g, M, { x0: -WH / 2, x1: WH / 2, z: WD / 2, th: 0.3, baseY: f * fh, h: fh, mat: 'concrete',
      windows: winRow(-WH / 2, WH / 2, 0.8, 2.9, 9, f === 0 ? { x0: -1.6, x1: 1.6 } : null),
      doors: f === 0 ? doorsAt(0, 3) : [] });
    box(g, M, 'concrete', WH, fh, 0.3, 0, f * fh + fh / 2, -WD / 2, 'hallBack');
    box(g, M, 'concrete', 0.3, fh, WD, -WH / 2, f * fh + fh / 2, 0, 'hallL');
    box(g, M, 'concrete', 0.3, fh, WD, WH / 2, f * fh + fh / 2, 0, 'hallR');
    if (f === 1) flatRoof(g, M, -WH / 2 - 0.5, WH / 2 + 0.5, -WD / 2 - 0.5, WD / 2 + 0.5, 2 * fh, 0.18, 'zinc');
    else box(g, M, 'concrete', WH + 0.4, 0.25, WD + 0.4, 0, fh + 0.125, 0, 'parapet1');
  }
  box(g, M, 'concrete', 10, 3, 0.6, 0, 4.5, WD / 2 + 0.3, 'porticoRoof');
  for (const px of [-4.5, -1.5, 1.5, 4.5]) cyl(g, M.concrete, 0.35, 3, px, 1.5, WD / 2 + 0.6, 12, 'porticoCol');
  signBoard(g, M, 'NAIJA STATE UNIVERSITY', 9, 1.1, 0, 6.4, WD / 2 + 0.5);
  flatRoof(g, M, -5.2, 5.2, WD / 2 + 0.1, WD / 2 + 1.4, 6.0, 0.12, 'alu');
  // Library tower at the west end
  const LT = 11, Lh = 3.4;
  for (let f = 0; f < 3; f++) {
    wallWithOpenings(g, M, { x0: -15 - LT / 2, x1: -15 + LT / 2, z: 6, th: 0.28, baseY: f * Lh, h: Lh, mat: 'whitePaint',
      windows: winRow(-15 - LT / 2, -15 + LT / 2, 0.7, 2.8, 5) });
    box(g, M, 'whitePaint', LT, Lh, 0.28, -15, f * Lh + Lh / 2, -6, 'libBack');
    box(g, M, 'whitePaint', 0.28, Lh, 12, -15 - LT / 2, f * Lh + Lh / 2, 0, 'libL');
    box(g, M, 'whitePaint', 0.28, Lh, 12, -15 + LT / 2, f * Lh + Lh / 2, 0, 'libR');
    if (f === 2) flatRoof(g, M, -15 - LT / 2 - 0.4, -15 + LT / 2 + 0.4, -6.4, 6.4, 3 * Lh, 0.15, 'alu');
  }
  box(g, M, 'darkMetal', 0.4, 2.2, 0.4, -15, 3 * Lh + 1.1, -3, 'libAnt');
  signBoard(g, M, 'LIBRARY', 6, 0.9, -15, 3 * Lh + 0.35, 6.3);
  // Sports field (east half)
  box(g, M, 'leaf', 14, 0.08, 24, 12, 0.04, 4, 'pitch');
  for (const [lx, lw] of [[5.6, 0.15], [18.4, 0.15]]) box(g, M, 'whitePaint', 0.15, 0.02, 23.6, lx, 0.1, 4);
  box(g, M, 'whitePaint', 12.6, 0.02, 0.15, 12, 0.1, 4);
  cyl(g, M.whitePaint, 0.9, 0.03, 12, 0.1, 4, 12, 'centerSpot');
  // boundary, flag, trees
  boundaryWall(g, M, 37, 36, 2.4, 6, 1.4);
  flagpole(g, M, -17, 15, 9);
  slab(g, M, -3, 3, 12, 16.8, 0.03, 'tarmac');
  tree(g, M, 17, -14, 1.3); tree(g, M, 18, 13, 1.1); tree(g, M, -18, 14, 1.2); tree(g, M, -17.5, -14, 1.0);
  return g;
};

// ===================== RURAL DISTRICT =====================
GEN.rural = (M) => {
  const g = new THREE.Group(); g.name = 'rural';
  // Three thatched-style huts with earth walls
  const hut = (hx, hz, s, ry) => {
    const w = 3.4 * s, d = 3.0 * s, h = 2.3 * s;
    const hg = new THREE.Group();
    box(hg, M, 'earth', w, h, d, 0, h / 2, 0, 'hutWall');
    box(hg, M, 'darkMetal', 0.8, 1.3, 0.06, -w / 4, 0.75, d / 2 + 0.01, 'hutDoor');
    box(hg, M, 'darkMetal', 0.9, 0.7, 0.05, w / 4, 1.2, d / 2 + 0.01, 'hutWin');
    gableRoof(hg, M, -w / 2 - 0.5, w / 2 + 0.5, -d / 2 - 0.5, d / 2 + 0.5, h - 0.05, h + 1.1, 'zinc');
    hg.position.set(hx, 0, hz); hg.rotation.y = ry;
    g.add(hg);
  };
  hut(-5.5, -4.5, 1.1, 0.3); hut(4.5, -5.5, 0.9, -0.4); hut(6.5, 3.5, 1.0, 2.4);
  // Farm rows
  for (let i = 0; i < 4; i++) box(g, M, 'sand', 10, 0.1, 1.1, -4.5, 0.05, 4.2 + i * 2.1, 'cropRow');
  // Borehole / well
  cyl(g, M.concrete, 0.6, 0.9, 1.5, 0.45, 6.5, 12, 'wellBase');
  cyl(g, M.darkMetal, 0.05, 1.2, 1.5, 1.5, 6.5, 6, 'wellPost1');
  cyl(g, M.darkMetal, 0.05, 1.2, 2.4, 1.5, 6.5, 6, 'wellPost2');
  cyl(g, M.darkMetal, 0.06, 1.1, 1.95, 2.15, 6.5, 6, 'wellBar');
  box(g, M, 'plasticTank', 0.35, 0.45, 0.3, 1.95, 1.6, 6.5, 'wellBucket');
  tree(g, M, -8.5, 6.5, 1.4); tree(g, M, -7.5, -7.5, 1.1); tree(g, M, 7.8, -1.5, 1.0);
  return g;
};

// ===================== RENTAL DESK =====================
GEN.rental = (M) => {
  const g = new THREE.Group(); g.name = 'rental';
  // 2-storey office block
  const W = 17, D = 10, fh = 3.4;
  for (let f = 0; f < 2; f++) {
    wallWithOpenings(g, M, { x0: -W / 2, x1: W / 2, z: D / 2, th: 0.25, baseY: f * fh, h: fh, mat: 'wall',
      windows: winRow(-W / 2, W / 2, 0.9, 2.7, 7, f === 0 ? { x0: -1.4, x1: 1.4 } : null),
      doors: f === 0 ? doorsAt(0, 2.8) : [] });
    box(g, M, 'wall', W, fh, 0.25, 0, f * fh + fh / 2, -D / 2, 'bBack');
    box(g, M, 'wall', 0.25, fh, D, -W / 2, f * fh + fh / 2, 0, 'bL');
    box(g, M, 'wall', 0.25, fh, D, W / 2, f * fh + fh / 2, 0, 'bR');
    if (f === 1) flatRoof(g, M, -W / 2 - 0.4, W / 2 + 0.4, -D / 2 - 0.4, D / 2 + 0.4, 2 * fh, 0.14, 'zinc');
  }
  signBoard(g, M, 'RENTAL DESK', 7.5, 1.0, 0, 2 * fh - 0.3, D / 2 + 0.35);
  canopy(g, M, -3.5, 3.5, D / 2, 2.7, 1.8, 3);
  waterTank(g, M, -5, -2, 0.9, true);
  dstvDish(g, M, 3, 1.2, D / 2 + 0.2, 0);
  acUnit(g, M, -4, 1.6, D / 2 + 0.2, 1);
  boundaryWall(g, M, 25, 21, 2.0, 4.5, 1.2);
  car(g, M, -8.5, 9, 180, 'yellow');
  tree(g, M, 10.5, -9, 1.1); tree(g, M, -10.5, 9, 0.9);
  guardPost(g, M, 11.4, 9.8, -0.6);
  return g;
};

// ===================== POLICE STATION =====================
// ===================== PUBLIC SAFETY: POLICE =====================
GEN.police = (M) => {
  const g = new THREE.Group(); g.name = 'police';
  // two wings of a single-storey station
  const wing = (offX) => {
    const W = 10, D = 8, h = 3.6;
    wallWithOpenings(g, M, { x0: offX - W / 2, x1: offX + W / 2, z: 4, th: 0.3, baseY: 0, h, mat: 'whitePaint',
      windows: winRow(offX - W / 2, offX + W / 2, 1.1, 2.5, 4, { x0: offX - 1.3, x1: offX + 1.3 }),
      doors: f === 0 ? [] : [] });
    box(g, M, 'whitePaint', W, h, 0.3, offX, h / 2, -D / 2 + 4);
    box(g, M, 'whitePaint', 0.3, h, D, offX - W / 2, h / 2, 4 - D / 2);
    box(g, M, 'whitePaint', 0.3, h, D, offX + W / 2, h / 2, 4 - D / 2);
    flatRoof(g, M, offX - W / 2 - 0.25, offX + W / 2 + 0.25, -D / 2 + 3.7, 4.25, h, 0.14, 'alu');
  };
  const f = 0; wing(-6.5); wing(6.5);
  // central hold-block between wings
  box(g, M, 'whitePaint', 5.4, 3.6, 8, 0, 1.8, 4 - 4);
  box(g, M, 'band', 6.0, 0.35, 8.6, 0, 3.78, 0);
  // double door + small porch
  wallWithOpenings(g, M, { x0: -2.7, x1: 2.7, z: 4, th: 0.3, baseY: 0, h: 3.6, mat: 'whitePaint',
    windows: [], doors: doorsAt(0, 3.0) });
  canopy(g, M, -2.6, 2.6, 4.15, 3.2, 1.6, 4);
  // station sign + flag + mast
  signBoard(g, M, 'POLICE', 7, 1.5, 0, 4.4, 4.2);
  flagpole(g, M, -7.5, 8, 7, 'green');
  cyl(g, M.darkMetal, 0.09, 7, 7.5, 3.5, -5, 8, 'lamp_mast');
  box(g, M, 'black', 0.9, 0.35, 0.35, 7.5, 7.1, -5, 'lamp_head');
  // perimeter with wide main gate + guard
  boundaryWall(g, M, 23, 21, 2.4, 7, 1.0);
  guardPost(g, M, 9.5, 9.5, Math.PI / 4);
  car(g, M, -5, 10, 180, 'white'); car(g, M, 4, 10, 180, 'blue');
  tree(g, M, -11, -8, 1.0);
  return g;
};

// ===================== JUSTICE: JUDICIARY =====================
GEN.judiciary = (M) => {
  const g = new THREE.Group(); g.name = 'judiciary';
  // wide single-storey court block with a deep column portico
  const W = 30, D = 12, h = 4.6;
  box(g, M, 'concrete', W, h, D, 0, h / 2, -1);
  wallWithOpenings(g, M, { x0: -W / 2 + 0.5, x1: W / 2 - 0.5, z: 5, th: 0.3, baseY: 0, h, mat: 'concrete',
    windows: winRow(-W / 2 + 0.5, W / 2 - 0.5, 1.5, 3.3, 9, { x0: -4.5, x1: 4.5 }),
    doors: [] });
  colonnade(g, M, -W / 2 + 2, W / 2 - 2, 5.1, 0, h, 8, 0.6);
  // portico slab roof
  flatRoof(g, M, -W / 2 - 0.5, W / 2 + 0.5, -D / 2 - 1.5 + 1, D / 2 - 1.5 + 1, h, 0.2, 'alu');
  // grand double doors
  wallWithOpenings(g, M, { x0: -4.5, x1: 4.5, z: 5, th: 0.3, baseY: 0, h: 4.6, mat: 'concrete',
    windows: [], doors: doorsAt(0, 3.6) });
  canopy(g, M, -4.5, 4.5, 5.15, 4.2, 2.4, 5);
  signBoard(g, M, 'COURT OF JUSTICE', 9, 1.4, 0, 5.4, 5.2);
  coatOfArms(g, M, -8.5, 4.9, 5.15, 0.9, 0);
  coatOfArms(g, M, 8.5, 4.9, 5.15, 0.9, 0);
  flagpole(g, M, -13, 7, 8, 'green');
  boundaryWall(g, M, 51, 19, 2.2, 5, 1.2);
  guardPost(g, M, -22, 8, 0);
  car(g, M, -6, 11, 180, 'black'); car(g, M, 7, 11, 180, 'white');
  return g;
};

// ===================== GOVERNMENT OFFICES AREA =====================
GEN.government = (M) => {
  const g = new THREE.Group(); g.name = 'government';
  const floors = 3, fh = 3.4;
  const main = (x0, x1, z0, z1, ox = 0, oz = 0) => {
    for (let f = 0; f < floors; f++) {
      wallWithOpenings(g, M, { x0, x1, z: z1 + oz, th: 0.3, baseY: f * fh, h: fh, mat: 'concrete',
        windows: winRow(x0, x1, 0.9, fh - 0.7, Math.max(3, Math.floor((x1 - x0) / 3)), f === 0 && ox ? { x0: (x0 + x1) / 2 - 1.6, x1: (x0 + x1) / 2 + 1.6 } : null),
        doors: f === 0 && ox ? doorsAt((x0 + x1) / 2, 3.2) : [] });
    }
    box(g, M, 'concrete', x1 - x0, floors * fh, 0.3, (x0 + x1) / 2 + ox, (floors * fh) / 2, z0 + oz);
    box(g, M, 'concrete', 0.3, floors * fh, z1 - z0, x0 + ox, (floors * fh) / 2, (z0 + z1) / 2 + oz);
    box(g, M, 'concrete', 0.3, floors * fh, z1 - z0, x1 + ox, (floors * fh) / 2, (z0 + z1) / 2 + oz);
    flatRoof(g, M, x0 - 0.3 + ox, x1 + 0.3 + ox, z0 - 0.3 + oz, z1 + 0.3 + oz, floors * fh, 0.18, 'alu');
  };
  main(-16, 16, -20, -8, 0, 0);   // main administration block
  main(-28, -16, -12, 2, 0, 0);   // west annex
  main(16, 28, -12, 2, 0, 0);     // east annex
  // roof plant on main block
  waterTank(g, M, -12, -15, 1.2, true);
  dstvDish(g, M, -8, floors * fh + 1.2, -8.5, 0);
  acUnit(g, M, 10, floors * fh + 0.3, -8, 1);
  // forecourt + flag plaza
  slab(g, M, -18, 18, -8, 10, 0.03, 'band');
  flagpole(g, M, 0, 6, 10, 'green');
  fountain(g, M, -12, 4, 1.0);
  fountain(g, M, 12, 4, 1.0);
  signBoard(g, M, 'GOVERNMENT OFFICES', 10, 1.6, 0, floors * fh + 1.4, -7.8);
  boundaryWall(g, M, 58, 48, 2.4, 8, 1.4);
  guardPost(g, M, -24, 20, 0);
  guardPost(g, M, 24, 20, Math.PI);
  car(g, M, -8, 21, 180, 'white'); car(g, M, 6, 21, 180, 'black');
  tree(g, M, -24, -20, 1.1); tree(g, M, 24, -20, 1.1); tree(g, M, -24, 8, 1.0); tree(g, M, 24, 8, 1.0);
  return g;
};

// ===================== CITY HALL =====================
GEN.city_hall = (M) => {
  const g = new THREE.Group(); g.name = 'city_hall';
  // main hall block
  const W = 12, D = 10, h = 5;
  box(g, M, 'cream', W, h, D, 0, h / 2, 0);
  wallWithOpenings(g, M, { x0: -W / 2 + 0.4, x1: W / 2 - 0.4, z: D / 2, th: 0.3, baseY: 0, h, mat: 'cream',
    windows: winRow(-W / 2 + 0.4, W / 2 - 0.4, 1.4, 3.6, 5, { x0: -2.2, x1: 2.2 }),
    doors: [] });
  wallWithOpenings(g, M, { x0: -2.2, x1: 2.2, z: D / 2, th: 0.3, baseY: 0, h, mat: 'cream',
    windows: [], doors: doorsAt(0, 2.6) });
  colonnade(g, M, -5.5, 5.5, D / 2 + 0.2, 0, h, 4, 0.6);
  flatRoof(g, M, -W / 2 - 0.4, W / 2 + 0.4, -D / 2 - 0.4, D / 2 + 0.4, h, 0.16, 'alu');
  // clock tower
  const tx = 0, tz = -D / 2 + 2, tw = 4;
  box(g, M, 'cream', tw, 12, tw, tx, 6, tz);
  box(g, M, 'band', tw + 0.3, 0.4, tw + 0.3, tx, h + 0.2, tz);
  clockFace(g, M, tx, 9.5, tz + tw / 2 + 0.06, 0.95, 0);
  clockFace(g, M, tx, 9.5, tz - tw / 2 - 0.06, 0.95, Math.PI);
  // tower top: hip cap + finial
  gableRoof(g, M, tx - tw / 2 - 0.3, tx + tw / 2 + 0.3, tz - tw / 2 - 0.3, tz + tw / 2 + 0.3, 12, 14.2, 'zinc');
  antenna(g, M, tx, 14.2, tz);
  flagpole(g, M, -8, 8, 8, 'green');
  coatOfArms(g, M, -4.5, h - 0.9, D / 2 + 0.25, 0.8, 0);
  coatOfArms(g, M, 4.5, h - 0.9, D / 2 + 0.25, 0.8, 0);
  signBoard(g, M, 'CITY HALL', 7, 1.3, 0, h + 0.9, D / 2 + 0.3);
  boundaryWall(g, M, 21, 21, 2.2, 5, 1.2);
  fountain(g, M, 0, 10, 0.9);
  tree(g, M, -10, -9, 1.0); tree(g, M, 10, -9, 1.0);
  return g;
};

// ===================== BANK =====================
GEN.bank = (M) => {
  const g = new THREE.Group(); g.name = 'bank';
  const W = 14, D = 10, h = 4.2;
  // dark stone base course + render body
  box(g, M, 'darkMetal', W, 0.5, D, 0, 0.25, 0);
  box(g, M, 'whitePaint', W, h - 0.5, D, 0, 0.5 + (h - 0.5) / 2, 0);
  // glass curtain lobby front with mullions
  wallWithOpenings(g, M, { x0: -W / 2 + 0.5, x1: W / 2 - 0.5, z: D / 2, th: 0.3, baseY: 0, h, mat: 'whitePaint',
    windows: [{ x0: -5.6, x1: 5.6, y0: 0.6, y1: h - 0.6, glass: true }],
    doors: [] });
  glassCurtain(g, M, -5.6, 5.6, D / 2 + 0.16, 0.6, h - 0.6, 6);
  wallWithOpenings(g, M, { x0: -1.7, x1: 1.7, z: D / 2, th: 0.3, baseY: 0, h, mat: 'whitePaint',
    windows: [], doors: doorsAt(0, 2.4) });
  canopy(g, M, -3, 3, D / 2 + 0.1, h - 0.2, 2.2, 3);
  // side windows
  for (const sx of [-1, 1]) {
    wallWithOpenings(g, M, { x0: -D / 2 + 1, x1: D / 2 - 1, z: 0, th: 0.28, baseY: 0, h, mat: 'whitePaint',
      windows: winRow(-D / 2 + 1, D / 2 - 1, 1.4, 3.0, 3), doors: [] });
    const side = new THREE.Group();
    side.rotation.y = Math.PI / 2 * sx;
    side.position.x = sx * (W / 2 - 0.14);
    g.add(side);
  }
  flatRoof(g, M, -W / 2 - 0.3, W / 2 + 0.3, -D / 2 - 0.3, D / 2 + 0.3, h, 0.16, 'alu');
  // gold band + signage
  box(g, M, 'yellow', W + 0.1, 0.3, 0.12, 0, h - 0.75, D / 2 + 0.15);
  signBoard(g, M, 'COMMUNITY BANK', 9, 1.4, 0, h + 1.0, D / 2 + 0.2, 'blue');
  // ATM pod
  box(g, M, 'darkMetal', 2.4, 2.6, 1.4, W / 2 + 1.6, 1.3, D / 2 - 1.5, 'atm_pod');
  box(g, M, 'glass', 1.6, 1.0, 0.05, W / 2 + 1.6, 1.5, D / 2 - 0.78, 'atm_glass');
  boundaryWall(g, M, 21, 21, 2.2, 4.5, 1.2);
  guardPost(g, M, -9, 9, Math.PI / 4);
  car(g, M, 5, 10, 180, 'black');
  tree(g, M, -10, -9, 1.0);
  return g;
};

// ===================== HOSPITALITY: HOTEL =====================
// Plot 74 x 50. Front faces +Z.
GEN.hotel = (M) => {
  const g = new THREE.Group(); g.name = 'hotel';
  // Central tower: 18 x 16 footprint, 7 floors
  const TW = 18, TD = 16, FH = 3.2, F = 7;
  for (let i = 0; i < F; i++) {
    const y = i * FH;
    box(g, M, i % 2 ? 'cream' : 'white', TW, FH, TD, 0, y + FH / 2, -6, `tower_f${i}`);
    // balcony slabs + glass curtain on front
    box(g, M, 'zinc', TW + 0.6, 0.18, 1.4, 0, y + 0.09, TD / 2 - 6 - 0.7 - 0.3);
    if (i > 0) glassCurtain(g, M, -TW / 2 + 0.6, TW / 2 - 0.6, TD / 2 - 6 + 0.04, y + 0.6, y + FH - 0.4, 8);
  }
  box(g, M, 'band', TW + 0.2, 0.5, TD + 0.2, 0, F * FH + 0.1, -6, 'tower_crown');
  // rooftop pool + bar
  box(g, M, 'pool', 7, 0.35, 5, 0, F * FH + 0.55, -7, 'rooftop_pool');
  box(g, M, 'darkMetal', 3, 1.6, 2, 5.5, F * FH + 0.9, -9.5, 'roof_bar');
  signBoard(g, M, 'EMPIRE HOTEL', 8, 1.2, 0, F * FH + 1.5, -6 + TD / 2 + 0.2, 'yellow');
  // Low wings flanking the tower
  for (const sx of [-1, 1]) {
    box(g, M, 'cream', 13, 6.8, 11, sx * 15.5, 3.4, -3, `wing_${sx > 0 ? 'R' : 'L'}`);
    for (let i = 0; i < 2; i++) {
      glassCurtain(g, M, sx * 15.5 - 5 + i * 6, sx * 15.5 + 0.5 + i * 6, 2.55, 1.2, 5.4, 3);
    }
    flatRoof(g, M, sx * 15.5 - 6.5, sx * 15.5 + 6.5, -8.6, 2.7, 6.8, 0.14, 'zinc');
    for (const wx of [-3.5, 0, 3.5]) acUnit(g, M, sx * 15.5 + wx, 7.0, -3, sx > 0 ? 1 : -1);
  }
  // Reception lobby: glass front with tall columns
  glassCurtain(g, M, -5, 5, TD / 2 - 6 + 0.06, 0, 3.1, 3);
  canopy(g, M, -6, 6, TD / 2 - 5.6, 3.4, 3.4, 4);
  colonnade(g, M, -8, 8, TD / 2 - 5.4, 0, 3.4, 6, 0.6);
  // car park forecourt
  box(g, M, 'tarmac', 60, 0.1, 16, 0, 0.05, 16, 'forecourt');
  for (let i = 0; i < 6; i++) box(g, M, 'yellow', 0.15, 0.02, 2, -20 + i * 8, 0.12, 18, `line_${i}`);
  car(g, M, -12, 17, 180, 'black'); car(g, M, -4, 17, 0, 'white');
  car(g, M, 4, 17, 180, 'blue'); car(g, M, 12, 17, 0, 'red');
  // ground pool
  box(g, M, 'sand', 12, 0.3, 8, -19, 0.15, 12, 'pool_deck');
  box(g, M, 'pool', 9, 0.28, 5.5, -19, 0.22, 12, 'pool_water');
  boundaryWall(g, M, 70, 46, 2.2, 6, 1.4, 'boundWall');
  guardPost(g, M, -30, 20, Math.PI / 4); guardPost(g, M, 30, 20, -Math.PI / 4);
  tree(g, M, -26, 18, 1.1); tree(g, M, 26, 18, 1.1); tree(g, M, -26, -18, 1.0);
  tree(g, M, 26, -18, 1.0);
  return g;
};

// ===================== LUXURY: HIGH-CLASS HOUSING =====================
// Plot 84 x 48. Detached duplexes on paved drives.
GEN.high_housing = (M) => {
  const g = new THREE.Group(); g.name = 'high_housing';
  box(g, M, 'tarmac', 76, 0.08, 4, 0, 0.04, 0, 'estate_road');
  for (let i = 0; i < 4; i++) box(g, M, 'white', 0.2, 0.02, 2.5, -30 + i * 10, 0.1, 0, `mark_${i}`);
  const homes = [[-30, 14], [30, 14], [-30, -14], [30, -14], [0, 15], [0, -15]];
  homes.forEach(([hx, hz], i) => {
    const h = new THREE.Group();
    h.name = `duplex_${i}`;
    const W = 13, D = 11, h1 = 3.4, h2 = 3.2;
    box(h, M, 'white', W, h1, D, 0, h1 / 2, 0, 'g1');
    box(h, M, 'cream', W - 2, h2, D - 2, 0, h1 + h2 / 2, 0, 'g2');
    gableRoof(h, M, -W / 2 + 1, W / 2 - 1, -D / 2 + 1, D / 2 - 1, h1 + h2, h1 + h2 + 2.0, 'zinc');
    glassCurtain(h, M, -W / 2 + 1.2, W / 2 - 1.2, D / 2 + 0.04, 0.8, h1 - 0.3, 4);
    wallWithOpenings(h, M, { x0: -W / 2, x1: W / 2, z: -D / 2, th: 0.26, baseY: 0, h: h1 + h2, mat: 'white',
      windows: winRow(-W / 2, W / 2, 1.1, h1 + 0.8, 5, { x0: -1.3, x1: 1.3 }), doors: doorsAt(0, 2.6) });
    box(h, M, 'darkMetal', W + 0.5, 0.25, D + 0.5, 0, h1 + 0.12, 0, 'balcony');
    waterTank(h, M, W / 2 - 1.5, -D / 2 + 1.5, 0.9, true);
    dstvDish(h, M, -W / 2 + 1.2, h1 + 1.0, D / 2 + 0.3, 0);
    for (const px of [-W / 2 + 1, W / 2 - 1]) acUnit(h, M, px, h1 + 0.8, D / 2 + 0.15, 1);
    // paved plot + gate
    box(h, M, 'sand', W + 8, 0.07, D + 8, 0, 0.03, 0, 'plot');
    box(h, M, 'tarmac', 3.4, 0.09, D + 8, 0, 0.045, 0, 'drive');
    boundaryWall(h, M, W + 8, D + 8, 2.0, 3.4, 1.0);
    h.position.set(hx, 0, hz);
    if (hz < 0) h.rotation.y = Math.PI;
    g.add(h);
  });
  tree(g, M, -38, 18, 1.2); tree(g, M, 38, 18, 1.2); tree(g, M, -38, -18, 1.2);
  tree(g, M, 38, -18, 1.2); tree(g, M, 0, 0, 1.3);
  car(g, M, 24, 16, 90, 'white'); car(g, M, -24, -16, -90, 'black');
  return g;
};

// ===================== COMMERCE: COMMERCIAL DISTRICT =====================
// Plot 74 x 48. Mall + kiosks + food court.
GEN.commercial = (M) => {
  const g = new THREE.Group(); g.name = 'commercial';
  box(g, M, 'tarmac', 70, 0.08, 42, 0, 0.04, 0, 'district_pave');
  // Shopping mall: 34 x 22, two levels
  const W = 34, D = 22, h1 = 4.2, h2 = 3.6;
  box(g, M, 'white', W, h1, D, 0, h1 / 2, -8, 'mall_g1');
  box(g, M, 'zinc', W + 0.4, 0.3, D + 0.4, 0, h1 + 0.15, -8, 'mall_slab');
  glassCurtain(g, M, -W / 2 + 1, W / 2 - 1, D / 2 - 8 + 0.05, h1 + 0.5, h1 + h2 - 0.4, 8);
  box(g, M, 'glass', W - 2, 2.6, 0.08, 0, h1 + 1.5, D / 2 - 8 + 0.02, 'mall_glass');
  glassCurtain(g, M, -W / 2 + 1, W / 2 - 1, D / 2 - 8 + 0.06, 0.8, h1 - 0.4, 8);
  flatRoof(g, M, -W / 2 - 0.3, W / 2 + 0.3, -D / 2 - 8 - 0.3, D / 2 - 8 + 0.3, h1 + h2, 0.16, 'alu');
  signBoard(g, M, 'STARLIGHT MALL', 12, 1.6, 0, h1 + h2 + 1.0, D / 2 - 8 + 0.4, 'yellow');
  // food court block
  box(g, M, 'cream', 14, 4.4, 12, 24, 2.2, 10, 'foodcourt');
  flatRoof(g, M, 24 - 7.4, 24 + 7.4, 10 - 6.4, 10 + 6.4, 4.4, 0.14, 'zinc');
  signBoard(g, M, 'FOOD COURT', 7, 1.1, 24, 5.3, 10 + 6.1, 'red');
  canopy(g, M, 24 - 6, 24 + 6, 10 + 6.2, 3.8, 1.8, 3);
  // open-air market kiosks along the front
  for (let i = 0; i < 5; i++) {
    const kx = -30 + i * 6;
    box(g, M, 'wood', 4.5, 2.6, 3.5, kx, 1.3, 18, `kiosk_${i}`);
    gableRoof(g, M, kx - 2.6, kx + 2.6, 18 - 2.1, 18 + 2.1, 2.6, 3.7, i % 2 ? 'zinc' : 'red');
    box(g, M, 'signBoard', 4, 0.7, 0.1, kx, 3.1, 18 + 1.8, `kiosk_sign_${i}`);
  }
  // service yard + tankers
  box(g, M, 'tarmac', 16, 0.1, 14, -24, 0.05, -17, 'yard');
  box(g, M, 'concrete', 4, 2.6, 7, -27, 1.3, -17, 'delivery_van');
  car(g, M, -19, -15, 45, 'white'); car(g, M, -21, -19, -30, 'yellow');
  tree(g, M, 12, 19, 1.0); tree(g, M, 18, 19, 1.0); tree(g, M, -8, 19, 1.0);
  boundaryWall(g, M, 72, 46, 2.2, 8, 1.2);
  return g;
};

// ===================== MID-CLASS HOUSING =====================
// Plot 52 x 37. Two-storey terrace houses.
GEN.mid_housing = (M) => {
  const g = new THREE.Group(); g.name = 'mid_housing';
  box(g, M, 'tarmac', 46, 0.08, 5, 0, 0.04, 2, 'street');
  const cols = 6, span = 36;
  for (let row = 0; row < 2; row++) {
    const zOff = row === 0 ? 12.5 : -12.5;
    for (let i = 0; i < cols; i++) {
      const h = new THREE.Group();
      h.name = `terrace_${row}_${i}`;
      const W = span / cols - 0.8, D = 9, h1 = 3.2, h2 = 3.0;
      box(h, M, row ? 'cream' : 'white', W, h1, D, 0, h1 / 2, 0);
      box(h, M, 'white', W, h2, D, 0, h1 + h2 / 2, 0);
      gableRoof(h, M, -W / 2, W / 2, -D / 2, D / 2, h1 + h2, h1 + h2 + 1.6, 'zinc');
      wallWithOpenings(h, M, { x0: -W / 2, x1: W / 2, z: D / 2, th: 0.24, baseY: 0, h: h1, mat: 'cream',
        windows: winRow(-W / 2, W / 2, 1.0, h1 - 0.6, 2), doors: doorsAt(0, 2.2) });
      box(h, M, 'white', W - 1, 1.2, 1.0, 0, h1 + 0.6, D / 2 + 0.3, 'balcony');
      box(h, M, 'darkMetal', W - 1.2, 0.8, 0.06, 0, h1 + 1.4, D / 2 + 0.75, 'rail');
      waterTank(h, M, W / 2 - 1, -D / 2 + 1, 0.8, true);
      dstvDish(h, M, -W / 2 + 0.8, h1 + 1.2, D / 2 + 0.2, 0);
      h.position.set(-span / 2 + (i + 0.5) * (span / cols), 0, zOff);
      if (row === 1) h.rotation.y = Math.PI;
      g.add(h);
    }
  }
  boundaryWall(g, M, 50, 35, 2.2, 5, 1.2);
  tree(g, M, -22, 2, 1.0); tree(g, M, 0, 2, 1.0); tree(g, M, 22, 2, 1.0);
  car(g, M, -15, 2, 0, 'white'); car(g, M, 15, 2, 180, 'blue');
  return g;
};

// ---------------------------------------------------------------- build & export all
const codes = Object.keys(GEN);
console.log('Generating '+codes.length+' building GLBs...');
for (const code of codes) {
  const M = makeMaterials();
  const g = GEN[code](M);
  const raw = await exportGLB(g);
  const out = await optimizeGLB(raw);
  writeFileSync('assets/buildings/' + code + '.glb', out);
  console.log('  ' + code + '.glb  ' + (out.length/1024).toFixed(1) + ' KB');
}
console.log('DONE: ' + codes.length + ' GLBs written to assets/buildings/');
