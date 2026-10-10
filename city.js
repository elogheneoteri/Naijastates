// city.js: the Naija city east of the border gate. Roads, junctions, pavements, street lamps, palms and EMPTY, labelled
// building plots (nothing is built on them yet). Every plot is a flat pad with a yellow border and a floating sign.
// Trees: mango_tree.glb and coconut_palm.glb from your props folder (use the light copies that came with this file).
//
// HOW TO PUT A BUILDING ON A PLOT LATER (in game.js, in the BUILDINGS list):
//   const P = plotAt('bank');                        // or look the plot up in PLOTS below
//   { key: 'bank', name: 'Bank', file: 'bank.glb', scale: 0.01, x: P.x, z: P.z, rotY: P.rotY, boxes: [...], fallback: [P.w, 8, P.d] }
// P.rotY already turns the building's front (+Z) towards the nearest road. Then delete that plot's line in PLOTS (or leave it:
// the pad just sits under the building).
//
// The layout (metres, the world is 360 m wide and 240 m deep; the gate is at x = 66.7; the main road at z = 28.75 is built in game.js):
//   avenues run north-south at x = 130, 230, 320.  Streets run east-west at z = 95, 160, 215 (between the avenues).
//   Zones follow your Delta order: north (housing, university, rural), central (police, courts, government, bank, hotel,
//   governor's villa, high-class housing), south (mid-class housing, hospital, school, market, transport, broadcasting).

import * as THREE from 'three';

export const CITY = {
  worldW: 360, worldH: 240,
  gateX: 2000 / 30,
  mainRoadZ: 28.75, mainRoadW: 3.5,
  avenuesX: [130, 230, 320], avenueW: 8,
  streetsZ: [95, 160, 215], streetW: 7,
  pave: 1.6,                                   // pavement width beside every road
  arrivalWallZ: 52                             // the arrival strip (camp + immigration + airport) ends at this wall
};

// code, label, centre x, centre z, width (x), depth (z). 'front' is worked out below from the nearest road.
const RAW_PLOTS = [
  // ----- arrival side (west of the gate, north of the main road, next to the immigration office, across from the camp) -----
  ['airport',        'Airport',                        18,  12, 32, 24],
  // ----- north strip (faces the main road) -----
  ['low_line',       'Low-Class Housing: Line Houses', 83.5, 13, 25, 22],
  ['low_bedsit',     'Low-Class Housing: Bed-Sitters', 110, 13, 24, 22],
  ['university',     'University',                    202, 188, 38, 37],   // swapped with the High School plot
  ['rural',          'Rural District',                275,  13, 74, 22],
  // ----- central zone -----
  ['rental',         'Rental Desk',                    83,  49, 26, 22],
  ['police',         'Police Station',                110,  49, 24, 22],
  ['judiciary',      'Judiciary (Courts)',             96,  76, 52, 20],
  ['government',     'Government Offices Area',       168,  61, 60, 50],
  ['city_hall',      'City Hall',                     211,  48, 22, 22],
  ['bank',           'Bank',                          211,  75, 22, 22],
  ['hotel',          'Hotel',                         275,  61, 74, 50],
  ['governor_villa', "Governor's Villa",               96, 127, 52, 48],
  ['high_housing',   'High-Class Housing',            180, 127, 84, 48],
  ['commercial',     'Commercial District',           275, 127, 74, 48],
  // ----- south zone -----
  ['mid_housing',    'Mid-Class Housing',              96, 188, 52, 37],
  ['hospital',       'Hospital',                      160, 188, 40, 37],
  ['high_school',    'High School',                   180,  13, 84, 22],   // swapped with the University plot (north strip, faces the main road)
  ['market',         'Market',                        275, 188, 74, 37],
  ['transport',      'Transport District',            180, 231, 84, 14],
  ['broadcasting',   'Broadcasting Station',          275, 231, 60, 14],
  // ----- east edge -----
  ['industrial',     'Industrial District',           343,  62, 28, 50],
  ['automotive',     'Automotive District',           343, 127, 28, 48],
  ['oil_well',       'Oil Well',                      343, 188, 28, 37]
];

// Which way the front of a building on this plot should face: towards the nearest road centre-line.
function frontOf(x, z, w, d) {
  const c = [];                                                    // [distance, direction]
  c.push([Math.abs(z + d / 2 - CITY.mainRoadZ) , 'S'], [Math.abs(z - d / 2 - CITY.mainRoadZ), 'N']);    // main road lies south of the north strip, north of the rest
  CITY.streetsZ.forEach(sz => { c.push([Math.abs(z + d / 2 - sz), 'S'], [Math.abs(z - d / 2 - sz), 'N']); });
  CITY.avenuesX.forEach(ax => { c.push([Math.abs(x + w / 2 - ax), 'E'], [Math.abs(x - w / 2 - ax), 'W']); });
  if (x < CITY.gateX) return 'S';                                  // the airport faces the main road
  c.sort((a, b) => a[0] - b[0]);
  return c[0][1];
}
const ROT = { S: 0, E: 90, N: 180, W: 270 };                       // building models face +Z (south) at rotY 0
const FACE_NAME = { S: 'south', N: 'north', E: 'east', W: 'west' };

export const PLOTS = RAW_PLOTS.map(([code, label, x, z, w, d]) => {
  const front = frontOf(x, z, w, d);
  return { code, label, x, z, w, d, front, rotY: ROT[front] };
});
export const plotAt = code => PLOTS.find(p => p.code === code);

// Rectangles where grass must not grow (roads, pavements, plots): game.js adds these to its keep-clear list.
export function cityClearRects() {
  const { avenuesX, streetsZ, avenueW, streetW, pave, worldW, worldH, gateX } = CITY;
  const r = [];
  avenuesX.forEach(ax => r.push({ x0: ax - avenueW / 2 - pave - 0.3, x1: ax + avenueW / 2 + pave + 0.3, z0: 0, z1: worldH }));
  streetsZ.forEach(sz => r.push({ x0: gateX, x1: worldW, z0: sz - streetW / 2 - pave - 0.3, z1: sz + streetW / 2 + pave + 0.3 }));
  PLOTS.forEach(p => r.push({ x0: p.x - p.w / 2 - 1, x1: p.x + p.w / 2 + 1, z0: p.z - p.d / 2 - 1, z1: p.z + p.d / 2 + 1 }));
  return r;
}

// The main road (game.js) has pavement and kerbs along its whole length. They skip these x ranges so the avenues can join it.
export const JUNCTION_GAPS_X = CITY.avenuesX.map(ax => [ax - CITY.avenueW / 2 - 0.2, ax + CITY.avenueW / 2 + 0.2]);

// ---------- small helpers ----------
function canvasTex(w, h, paint, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
function asphaltPaint(vertical) {
  return (g, w, h) => {
    g.fillStyle = '#3a3d41'; g.fillRect(0, 0, w, h);
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) { const v = 44 + r() * 26; g.fillStyle = `rgb(${v},${v + 1},${v + 4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.fillStyle = '#e9e9e2';                                             // edge lines
    if (vertical) { g.fillRect(w * 0.04, 0, 3, h); g.fillRect(w * 0.96 - 3, 0, 3, h); } else { g.fillRect(0, h * 0.04, w, 3); g.fillRect(0, h * 0.96 - 3, w, 3); }
    g.fillStyle = '#f2c94c';                                             // dashed centre line
    if (vertical) { g.fillRect(w / 2 - 3, h * 0.08, 6, h * 0.34); g.fillRect(w / 2 - 3, h * 0.58, 6, h * 0.34); }
    else { g.fillRect(w * 0.08, h / 2 - 3, w * 0.34, 6); g.fillRect(w * 0.58, h / 2 - 3, w * 0.34, 6); }
  };
}
function plainAsphalt(g, w, h) {
  g.fillStyle = '#3a3d41'; g.fillRect(0, 0, w, h);
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { const v = 44 + r() * 26; g.fillStyle = `rgb(${v},${v + 1},${v + 4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
function signTexture(label, sub) {
  return canvasTex(768, 192, (g, w, h) => {
    g.fillStyle = 'rgba(10,24,52,0.92)'; g.beginPath(); if (g.roundRect) g.roundRect(6, 6, w - 12, h - 12, 26); else g.rect(6, 6, w - 12, h - 12); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#f2c200'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    let size = 62; do { g.font = `bold ${size}px Arial, sans-serif`; size -= 2; } while (g.measureText(label).width > w - 60 && size > 22);
    g.fillText(label, w / 2, h * 0.40);
    g.font = '34px Arial, sans-serif'; g.fillStyle = '#ffd966'; g.fillText(sub, w / 2, h * 0.76);
  }, 1, 1);
}

// ---------- the city ----------
export function buildCity(loadProp) {
  const group = new THREE.Group();
  const { avenuesX, streetsZ, avenueW, streetW, pave, worldH, worldW, gateX, mainRoadZ, mainRoadW } = CITY;
  const aT = canvasTex(256, 256, asphaltPaint(true)), sT = canvasTex(256, 256, asphaltPaint(false)), jT = canvasTex(128, 128, plainAsphalt);
  const mat = (map, offset) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
  const aMat = mat(aT, -1), sMat = mat(sT, -1), jMat = mat(jT, -3);
  const paveMat = new THREE.MeshStandardMaterial({ color: 0xaaa597, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const flat = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.receiveShadow = true; group.add(o); return o; };

  // x ranges of the streets between avenues (streets stop at the avenue edges; junction squares fill the crossings)
  const xEdges = [gateX + 1.5, ...avenuesX.flatMap(ax => [ax - avenueW / 2, ax + avenueW / 2]), worldW - 1];
  const streetSpans = [];
  for (let i = 0; i < xEdges.length; i += 2) streetSpans.push([xEdges[i], xEdges[i + 1]]);

  // avenues: full length. Streets: between avenues. Junction squares: plain asphalt where they meet.
  avenuesX.forEach(ax => {
    const tex = aT.clone(); tex.needsUpdate = true; tex.repeat.set(1, worldH / 8);
    flat(new THREE.PlaneGeometry(avenueW, worldH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), ax, -0.015, worldH / 2);
    [...streetsZ, mainRoadZ].forEach(sz => flat(new THREE.PlaneGeometry(avenueW, sz === mainRoadZ ? mainRoadW : streetW), jMat, ax, -0.005, sz));
  });
  streetsZ.forEach(sz => streetSpans.forEach(([x0, x1]) => {
    const len = x1 - x0, tex = sT.clone(); tex.needsUpdate = true; tex.repeat.set(len / 8, 1);
    flat(new THREE.PlaneGeometry(len, streetW), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), (x0 + x1) / 2, -0.015, sz);
  }));

  // pavements beside the avenues and streets (they stop where another road crosses)
  const gapsZ = [...streetsZ.map(s => [s - streetW / 2 - pave, s + streetW / 2 + pave]), [mainRoadZ - mainRoadW / 2 - pave - 0.2, mainRoadZ + mainRoadW / 2 + pave + 0.2]].sort((a, b) => a[0] - b[0]);
  const span = (from, to, gaps) => { const out = []; let a = from; gaps.forEach(([g0, g1]) => { if (g0 > a) out.push([a, Math.min(g0, to)]); a = Math.max(a, g1); }); if (a < to) out.push([a, to]); return out.filter(([p, q]) => q - p > 0.5); };
  avenuesX.forEach(ax => [-1, 1].forEach(side => span(0, worldH, gapsZ).forEach(([z0, z1]) =>
    flat(new THREE.PlaneGeometry(pave, z1 - z0), paveMat, ax + side * (avenueW / 2 + pave / 2), -0.01, (z0 + z1) / 2))));
  const gapsX = avenuesX.map(ax => [ax - avenueW / 2 - pave, ax + avenueW / 2 + pave]);
  streetsZ.forEach(sz => [-1, 1].forEach(side => span(gateX + 1.5, worldW - 1, gapsX).forEach(([x0, x1]) =>
    flat(new THREE.PlaneGeometry(x1 - x0, pave), paveMat, (x0 + x1) / 2, -0.01, sz + side * (streetW / 2 + pave / 2)))));

  // ----- empty building plots -----
// Plots that already have a building: they keep their plain ground pad, but lose the yellow border, front strip and floating sign.
const BUILT_PLOTS = ['high_school'];
  const padMat = new THREE.MeshStandardMaterial({ color: 0xb4ae9f, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.7, emissive: 0x5a4600, emissiveIntensity: 0.4 });
  PLOTS.forEach(p => {
    flat(new THREE.PlaneGeometry(p.w, p.d), padMat, p.x, 0.0, p.z);
    if (BUILT_PLOTS.includes(p.code)) return;
    const e = 0.35, top = 0.012;
    [[p.w, e, p.x, p.z - p.d / 2 + e / 2], [p.w, e, p.x, p.z + p.d / 2 - e / 2], [e, p.d - 2 * e, p.x - p.w / 2 + e / 2, p.z], [e, p.d - 2 * e, p.x + p.w / 2 - e / 2, p.z]]
      .forEach(([w, d, x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, top, d), edgeMat); m.position.set(x, top / 2 + 0.002, z); m.receiveShadow = true; group.add(m); });
    // a bright strip on the FRONT edge, so you can see which way a building will face
    const fw = p.front === 'N' || p.front === 'S' ? p.w * 0.5 : 0.9, fd = p.front === 'E' || p.front === 'W' ? p.d * 0.5 : 0.9;
    const fx = p.x + (p.front === 'E' ? p.w / 2 - 1.1 : p.front === 'W' ? -p.w / 2 + 1.1 : 0), fz = p.z + (p.front === 'S' ? p.d / 2 - 1.1 : p.front === 'N' ? -p.d / 2 + 1.1 : 0);
    const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.02, fd), edgeMat); f.position.set(fx, 0.012, fz); group.add(f);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(p.label, `Building site  \u00B7  ${p.w} \u00D7 ${p.d} m  \u00B7  front: ${FACE_NAME[p.front]}`), transparent: true, depthWrite: false }));
    const sw = Math.min(16, Math.max(9, p.w * 0.45)); sign.scale.set(sw, sw / 4, 1); sign.position.set(p.x, 4.6, p.z); group.add(sign);
  });

  // ----- street lamps along the avenues (looks only: no real lights, to keep phones fast) -----
  const lamps = [];
  avenuesX.forEach(ax => [-1, 1].forEach(side => { for (let z = 14; z < worldH - 6; z += 30) {
    if ([...streetsZ, mainRoadZ].some(sz => Math.abs(z - sz) < streetW / 2 + pave + 1.5)) continue;
    lamps.push([ax + side * (avenueW / 2 + pave / 2), z, side]);
  } }));
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0x4b5057, roughness: 0.6, metalness: 0.4 }), lamps.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), pole.material, lamps.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe9a0, emissiveIntensity: 0.9 }), lamps.length);
  const o = new THREE.Object3D();
  lamps.forEach(([x, z, side], i) => {
    o.rotation.set(0, 0, 0); o.position.set(x, 0, z); o.updateMatrix(); pole.setMatrixAt(i, o.matrix);
    o.position.set(x - side * 0.7, 6.0, z); o.updateMatrix(); arm.setMatrixAt(i, o.matrix);
    o.position.set(x - side * 1.35, 5.93, z); o.updateMatrix(); head.setMatrixAt(i, o.matrix);
  });
  [pole, arm, head].forEach(m => { m.castShadow = false; m.frustumCulled = false; group.add(m); });

  // ----- trees along the avenues: coconut palms with a mango tree every fourth spot (the light copies of your models, see props/) -----
  const insidePlot = (x, z) => PLOTS.some(p => Math.abs(x - p.x) < p.w / 2 + 1.5 && Math.abs(z - p.z) < p.d / 2 + 1.5);
  const spots = [];
  avenuesX.forEach((ax, ai) => [-1, 1].forEach(side => { for (let z = 29 + (side > 0 ? 15 : 0); z < worldH - 8; z += 30) {
    if ([...streetsZ, mainRoadZ].some(sz => Math.abs(z - sz) < streetW / 2 + pave + 3)) continue;
    const x = ax + side * (avenueW / 2 + pave + 0.9);
    if (insidePlot(x, z)) continue;
    spots.push([x, z, (spots.length + ai) % 4 === 3 ? 'mango_tree' : 'coconut_palm']);
  } }));
  (async () => {
    for (const [x, z, name] of spots) {
      try { const t = await loadProp(name, { rotY: (x * 7 + z * 13) % 6.28 }); t.position.set(x, 0, z); t.traverse(m => { if (m.isMesh) m.castShadow = false; }); group.add(t); }
      catch (e) { console.warn('city tree not loaded (' + name + ')', e); break; }
    }
  })();

  return { group };
}
