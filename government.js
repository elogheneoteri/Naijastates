// government.js  (the Government compound: City Hall + Government Office, one compound made from the two plots in city.js)
//
// Exports:  buildGovernment() -> { group }      GOV_BOXES -> solid parts for collisions      GOV_ZONES -> the areas that show the name at the top left
//
// WORLD-ALIGNED: this building is NOT turned by game.js (rotY 0 in the BUILDINGS entry), because the two halves face different ways:
//   City Hall         faces WEST  (towards the Government Office)
//   Government Office faces NORTH (towards the main road)
// so the layout below is in real world metres, and every building turns itself.  +X = east, +Z = south, -Z = north.
//
// FILES (main folder, next to rental_office.glb): city_hall.glb and government_office.glb. Both are SHRUNK copies of your models:
//   20,000 triangles each, ONE colour picture of 2048 px, a normal map and a shine map of 1024 px (were three pictures of 2048 px, 7 MB and 14 MB).
//   Each file is the same shape as your original: centred on x/z, base at y = 0, door on its +Z side, size in its own units (about 1.9 wide), scaled by SCALE below.
//
// THE PLOTS (from city.js):  Government plot  x 138 to 198, z 36 to 86   (60 x 50 m)      City Hall plot  x 200 to 222, z 37 to 59   (22 x 22 m)
// WHAT IS HERE: the two buildings with their name boards, and now the whole compound round them:
//   * a green hedge fence (hedge_fence_optimised.glb) round both plots, with an open gateway in the north side (the road side), on the line of the Government Office door
//   * a security post (security_booth_optimised.glb) just inside the gate, its door facing the driveway
//   * a driveway from the road to the office, with the animated fountain (fountain_animated_optimised.glb) on a round stone island in the middle of it
//   * a car park with painted bays, east of the driveway (the side of City Hall)
//   * 6 street lamps (street_lamp.glb, the same one as the school), looks only: no real lights
//   * a garden west of the driveway made with your school hedge (hedge.glb): a hedged bed with ONE sour orange tree (sour_orange_optimised.glb, the school one)
//     and elephant ear bushes (elephant_ear_bush_optimised.glb), more bushes along the front hedge fence and in front of the office
//   All the new props are in the props/ folder (the first four names are the files you sent me, the other three are the ones the school uses).
//
// THINGS YOU MAY WANT TO CHANGE
//   SCALE      how big each building is (City Hall 8.5 -> about 16.2 m wide, 15.6 m deep, 5 m high; Government Office 16 -> about 29.6 m wide, 30.4 m deep, 11.9 m high)
//   x, z       where the building stands (its centre). Move it and the walls follow by themselves.
//   sign.text  the words on the name board
//   GATE       where the gateway is (x of its middle, and how wide)         FENCE_Z   the north fence line (the road side)
//   BUSHES, LAMPS, ORANGE, BOOTH, FOUNTAIN, CAR_PARK   the places of the decorations, in world metres (x, z); delete a line to remove a bush or a lamp
//   SHOW       switch a whole group on or off (false = not built)
//
// KEEPING IT FAST: the hedge fence, the school hedges and the bushes are InstancedMesh (every copy of a piece shares one mesh), the ground paint is a few flat
//   pictures, nothing in the compound casts shadows except the buildings. Only the fountain is animated (its own animation, a single mixer).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS_DIR } from './props_library.js';

export const GOV_ORIGIN = { x: 168, z: 61 };            // the centre this compound is placed at: it MUST be the x / z of the BUILDINGS entry in game.js

// ---- the two plots, and the strip kept free behind each building for a fence ----
const GOV_PLOT = { x0: 138, x1: 198, z0: 36, z1: 86 };
const HALL_PLOT = { x0: 200, x1: 222, z0: 37, z1: 59 };
const BACK_GAP = 3.0;                                    // metres between the back of a building and the back edge of its plot

// model sizes (half width x, half depth z, height), in the model's own units
const HALL_MODEL = { hw: 0.954, hd: 0.917, h: 0.582 };
const OFFICE_MODEL = { hw: 0.924, hd: 0.950, h: 0.744 };
const HALL_SCALE = 8.5, OFFICE_SCALE = 16;

// City Hall stands in the same place as before; it is only turned to face WEST. (hd is the depth, along x when turned)
const hallX = HALL_PLOT.x0 + 1.3 + HALL_MODEL.hd * HALL_SCALE;      // same spot as before: only the direction it faces was changed
const hallZ = (HALL_PLOT.z0 + HALL_PLOT.z1) / 2;
// Government Office faces NORTH: its back is the SOUTH side of its plot.
const officeX = (GOV_PLOT.x0 + GOV_PLOT.x1) / 2;
const officeZ = GOV_PLOT.z1 - BACK_GAP - OFFICE_MODEL.hd * OFFICE_SCALE;

// ---- the buildings. Signs: x, y, z = the middle of the empty board on the model (model units), w, h = board size (model units) ----
const PARTS = [
  { file: 'city_hall.glb', scale: HALL_SCALE, x: hallX, z: hallZ, rotY: 270, half: HALL_MODEL,
    sign: { text: 'CITY HALL', x: 0, y: 0.450, z: 0.758, w: 0.250, h: 0.062 } },            // the grey board above the entrance canopy
  { file: 'government_office.glb', scale: OFFICE_SCALE, x: officeX, z: officeZ, rotY: 180, half: OFFICE_MODEL,
    sign: { text: 'GOVERNMENT OFFICE', x: 0, y: 0.710, z: 0.885, w: 0.340, h: 0.042 } }      // the long board on the roof, facing the front
];

// ============================ THE COMPOUND (all in WORLD metres: +X east, +Z south, the road is NORTH, at z 27 .. 30.5) ============================
const SHOW = { fence: true, booth: true, fountain: true, driveway: true, carPark: true, lamps: true, garden: true, bushes: true, orange: true };

const GATE = { x: 168, w: 10 };                          // the open gateway, on the line of the Government Office door (x 168)
const FENCE_Z = 37.5, FENCE_E = 221, FENCE_W = 139, FENCE_S = 85, FENCE_DOOR_X = 197, HALL_S = 58;   // lines of the hedge fence
// each run: [x0, z0, x1, z1]. Every piece has its stone pillar at the START of its run, so the runs begin at the gate posts and at the corners.
const FENCE_RUNS = [
  [GATE.x + GATE.w / 2, FENCE_Z, FENCE_E, FENCE_Z],      // north, east of the gate (to the City Hall corner)
  [FENCE_E, FENCE_Z, FENCE_E, HALL_S],                   // City Hall plot, east side
  [FENCE_E, HALL_S, FENCE_DOOR_X, HALL_S],               // City Hall plot, south side (and across the 2 m between the plots)
  [FENCE_DOOR_X, HALL_S, FENCE_DOOR_X, FENCE_S],         // Government plot, east side (below the hall)
  [FENCE_DOOR_X, FENCE_S, FENCE_W, FENCE_S],             // south (the back)
  [FENCE_W, FENCE_S, FENCE_W, FENCE_Z],                  // west side
  [GATE.x - GATE.w / 2, FENCE_Z, FENCE_W, FENCE_Z]       // north, west of the gate
];

const BOOTH = { x: 159.6, z: 40.3, rotY: -Math.PI / 2 };      // security post just inside the gate (west of it); its door (the -Z side of the model) turned to face EAST, onto the driveway
const FOUNTAIN = { x: 168, z: 45.0, island: 4.3 };            // the fountain (7 m across) on a round stone island in the middle of the driveway
const DRIVE = { x0: 161, x1: 175, z0: 37.4, z1: 51.8 };       // the driveway inside the gate (14 m wide, so cars pass either side of the fountain)
const APRON = { x0: GATE.x - GATE.w / 2, x1: GATE.x + GATE.w / 2, z0: 32.2, z1: 37.6 };   // from the pavement of the main road to the gate
const CAR_PARK = { x0: 175, x1: 195.5, z0: 38.6, z1: 51.8, bayX0: 177, bayW: 2.5, bays: 7 };   // two rows of 7 bays with an aisle between them

// street lamps (the arm turns towards 'face': 0 = south, 90 = east, 180 = north, 270 = west): x, z, face in degrees
const LAMPS = [
  [161.8, 38.9, 90], [174.2, 38.9, 270],                  // either side of the driveway, just inside the gate
  [161.0, 50.6, 90], [175.0, 50.6, 270],                  // either side of the driveway, in front of the office
  [183.5, 45.5, 0], [192.5, 45.5, 0]                      // the car park aisle
];

// the garden (west of the driveway): a bed with a low hedge round it (your school hedge, 0.9 m high), the orange tree and bushes inside it
const GARDEN = { x0: 142, x1: 155, z0: 42.5, z1: 49.5 };
const ORANGE = { x: 148.5, z: 46.0, height: 4.5 };            // the same sour orange as the school (4.5 m)
const HEDGE_H = 0.9;
const LOW_HEDGES = [                                          // [x0, z0, x1, z1]
  [GARDEN.x0, GARDEN.z0, GARDEN.x1, GARDEN.z0], [GARDEN.x1, GARDEN.z0, GARDEN.x1, GARDEN.z1],
  [GARDEN.x1, GARDEN.z1, GARDEN.x0, GARDEN.z1], [GARDEN.x0, GARDEN.z1, GARDEN.x0, GARDEN.z0],
  [153.8, 50.2, 160.6, 50.2], [175.4, 50.2, 182.2, 50.2]      // in front of the office, either side of the driveway
];
// elephant ear bushes: x, z, size (1 = 2.4 m wide)
const BUSHES = [
  [144.2, 44.2, 1.0], [152.8, 44.2, 1.0], [144.2, 47.8, 1.0], [152.8, 47.8, 1.0],                     // the four corners inside the garden bed
  [142.8, 39.3, 1.1], [146.0, 39.3, 1.0], [149.2, 39.3, 1.1], [152.4, 39.3, 1.0], [155.6, 39.3, 1.1],   // in front of the hedge fence, north-west
  [155.6, 51.5, 1.0], [158.6, 51.5, 1.0], [177.4, 51.5, 1.0], [180.4, 51.5, 1.0],                      // between the office wall and its front hedges
  [195.2, 62.0, 1.0], [195.2, 66.0, 1.1], [195.2, 70.0, 1.0], [195.2, 74.0, 1.1], [195.2, 78.0, 1.0]  // along the east fence (below City Hall)
];

// ---- solid parts: the walls of each building, [minX, maxX, minZ, maxZ] relative to GOV_ORIGIN (the game does not turn them: rotY is 0) ----
const STEP = 0.5;                                          // the strip in front of each door that stays walkable
const BUILDING_BOXES = PARTS.map(p => {
  const turned = (Math.round(p.rotY / 90) % 2) !== 0;     // 90 or 270: the building lies sideways
  const hw = (turned ? p.half.hd : p.half.hw) * p.scale - 0.2, hd = (turned ? p.half.hw : p.half.hd) * p.scale - 0.2;
  let x0 = p.x - hw, x1 = p.x + hw, z0 = p.z - hd, z1 = p.z + hd;
  const turn = ((Math.round(p.rotY / 90) % 4) + 4) % 4;   // which way the door side points: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
  if (turn === 0) z1 -= STEP; else if (turn === 1) x1 -= STEP; else if (turn === 2) z0 += STEP; else x0 += STEP;
  return [x0 - GOV_ORIGIN.x, x1 - GOV_ORIGIN.x, z0 - GOV_ORIGIN.z, z1 - GOV_ORIGIN.z];
});

// solid parts of the compound (the game does not turn them): the hedge fences, the booth, the fountain, lamps, the orange trunk, the bushes
const rel = (x0, x1, z0, z1) => [x0 - GOV_ORIGIN.x, x1 - GOV_ORIGIN.x, z0 - GOV_ORIGIN.z, z1 - GOV_ORIGIN.z];
const around = (x, z, hx, hz = hx) => rel(x - hx, x + hx, z - hz, z + hz);
const lineBox = ([x0, z0, x1, z1], t) => rel(Math.min(x0, x1) - t, Math.max(x0, x1) + t, Math.min(z0, z1) - t, Math.max(z0, z1) + t);
const YARD_BOXES = [
  ...(SHOW.fence ? FENCE_RUNS.map(r => lineBox(r, 0.45)) : []),
  ...(SHOW.garden ? LOW_HEDGES.map(r => lineBox(r, 0.4)) : []),
  ...(SHOW.booth ? [around(BOOTH.x, BOOTH.z, 1.45, 1.5)] : []),
  ...(SHOW.fountain ? [around(FOUNTAIN.x, FOUNTAIN.z, 3.4, 1.4), around(FOUNTAIN.x, FOUNTAIN.z, 1.4, 3.4), around(FOUNTAIN.x, FOUNTAIN.z, 2.6, 2.6)] : []),   // a plus-shaped block that hugs the round basin
  ...(SHOW.lamps ? LAMPS.map(([x, z]) => around(x, z, 0.25)) : []),
  ...(SHOW.orange ? [around(ORANGE.x, ORANGE.z, 0.4)] : []),
  ...(SHOW.bushes ? BUSHES.map(([x, z, k]) => around(x, z, 0.5 * k)) : [])
];
export const GOV_BOXES = [...BUILDING_BOXES, ...YARD_BOXES];

// areas that show "Government Area" at the top left (relative to nothing: world metres)
export const GOV_ZONES = [
  { x0: GOV_PLOT.x0, x1: 199, z0: GOV_PLOT.z0, z1: GOV_PLOT.z1 },
  { x0: 199, x1: HALL_PLOT.x1, z0: HALL_PLOT.z0, z1: HALL_PLOT.z1 }
];

// ---------- the text on a name board ----------
function signTexture(text, ratio) {
  const c = document.createElement('canvas'); c.width = 1536; c.height = Math.max(64, Math.round(1536 / ratio));
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = c.height * 0.9;                              // biggest letters that fit
  for (; size > 30; size -= 4) { g.font = `800 ${size}px "Segoe UI", Arial, Helvetica, sans-serif`; if (g.measureText(text).width <= c.width * 0.92) break; }
  g.lineJoin = 'round'; g.lineWidth = size * 0.05; g.strokeStyle = '#ffffff'; g.strokeText(text, c.width / 2, c.height / 2 + 3);
  g.fillStyle = '#0a2a66'; g.fillText(text, c.width / 2, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ============================ helpers for the compound ============================
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
const getModel = file => { if (!modelCache.has(file)) modelCache.set(file, gltfLoader.loadAsync(PROPS_DIR + file)); return modelCache.get(file); };

// one model sized in metres (height, or as it is), feet on the ground, centred; rotY in radians
async function loadFitted(file, { height, rotY = 0 } = {}) {
  const gltf = await getModel(file), root = gltf.scene.clone(true);
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(root);
  if (height) { root.scale.multiplyScalar(height / Math.max(b.max.y - b.min.y, 1e-6)); root.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(root); }
  const c = b.getCenter(new THREE.Vector3()); root.position.set(-c.x, -b.min.y, -c.z);
  const pivot = new THREE.Group(); pivot.add(root); pivot.rotation.y = rotY;
  const wrap = new THREE.Group(); wrap.add(pivot); return wrap;
}
// a street lamp the way the school does it: its FOOT stands on x, z and its arm is turned to 'face' (radians: 0 = south, +90 degrees = east)
function footPoint(root, b) {
  const lim = b.min.y + (b.max.y - b.min.y) * 0.04, v = new THREE.Vector3(); let sx = 0, sz = 0, n = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y <= lim) { sx += v.x; sz += v.z; n++; } }
  });
  return n ? new THREE.Vector3(sx / n, b.min.y, sz / n) : b.getCenter(new THREE.Vector3()).setY(b.min.y);
}
async function loadLamp(height, face) {
  const gltf = await getModel('street_lamp.glb'), root = gltf.scene.clone(true);
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(root);
  root.scale.multiplyScalar(height / Math.max(b.max.y - b.min.y, 1e-6)); root.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(root);
  const mid = b.getCenter(new THREE.Vector3()), c = footPoint(root, b);
  root.position.set(-c.x, -b.min.y, -c.z);
  let spin = 0; const dx = mid.x - c.x, dz = mid.z - c.z;
  if (Math.hypot(dx, dz) > 0.3) spin = -Math.atan2(dx, dz);                  // the arm (the side the lamp leans to) now points to +z = south
  const pivot = new THREE.Group(); pivot.add(root); pivot.rotation.y = spin + face;
  const wrap = new THREE.Group(); wrap.add(pivot); return wrap;
}

// many copies of one model: one InstancedMesh for every part of it. pieces: [x, z, rotY, stretchAlongX, scale]. height = size it to this many metres (optional);
// the model is turned so its long side runs along x. Returns the size of one piece in metres.
async function instancePieces(group, file, pieces, { height, castShadow = false } = {}) {
  const gltf = await getModel(file), root = gltf.scene.clone(true);
  root.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(root), size = b.getSize(new THREE.Vector3());
  if (size.z > size.x * 1.05) { root.rotation.y = Math.PI / 2; root.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(root); size = b.getSize(new THREE.Vector3()); }
  const k = height ? height / Math.max(size.y, 1e-6) : 1, c = b.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4().makeTranslation(-c.x * k, -b.min.y * k, -c.z * k).multiply(new THREE.Matrix4().makeScale(k, k, k));
  if (!pieces.length) return { length: size.x * k, size: size.clone().multiplyScalar(k) };          // only measuring one piece
  const parts = []; root.traverse(o => { if (o.isMesh) parts.push(o); });
  const place = new THREE.Matrix4(), rot = new THREE.Matrix4(), scl = new THREE.Matrix4(), m = new THREE.Matrix4();
  parts.forEach(part => {
    const im = new THREE.InstancedMesh(part.geometry, part.material, pieces.length);
    pieces.forEach(([x, z, ry, sx = 1, sc = 1], i) => {
      place.makeTranslation(x, 0, z); rot.makeRotationY(ry); scl.makeScale(sx * sc, sc, sc);
      m.copy(place).multiply(rot).multiply(scl).multiply(fit).multiply(part.matrixWorld); im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true; im.castShadow = castShadow; im.receiveShadow = false; im.computeBoundingSphere(); group.add(im);
  });
  return { length: size.x * k, size: size.clone().multiplyScalar(k) };
}
// a straight row of pieces from (x0,z0) to (x1,z1), each stretched a little so there are no gaps; the piece's start (its -x end) is at the run's start
function runPieces(runs, length) {
  const out = [];
  runs.forEach(([x0, z0, x1, z1]) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / length)), step = len / n, ux = dx / len, uz = dz / len, rot = Math.atan2(-uz, ux);
    for (let i = 0; i < n; i++) out.push([x0 + ux * step * (i + 0.5), z0 + uz * step * (i + 0.5), rot, step / length]);
  });
  return out;
}

// ---------- ground paint ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const noise = (g, w, h, base, spread, n, seed) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const v = base === '#3a3d41' ? 44 + r() * spread : 190 + r() * spread; g.fillStyle = `rgb(${v},${v + 1},${v + 4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
};
const groundMat = map => new THREE.MeshStandardMaterial({ map, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
function flatRect(group, r, mat, y, tile) {                    // flat rectangle on the ground; tile = metres per repeat of the picture (omit for a picture that fits the rectangle)
  const w = r.x1 - r.x0, d = r.z1 - r.z0, g = new THREE.PlaneGeometry(w, d);
  if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); }
  const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2); m.receiveShadow = true; group.add(m); return m;
}
function parkingTexture() {                                    // 35 pixels per metre; the top of the picture is the north (back) of the lot
  const PX = 35, W = Math.round((CAR_PARK.x1 - CAR_PARK.x0) * PX), H = Math.round((CAR_PARK.z1 - CAR_PARK.z0) * PX);
  const X = x => (x - CAR_PARK.x0) * PX, Z = z => (z - CAR_PARK.z0) * PX;
  return canvasTex(W, H, (g, w, h) => {
    noise(g, w, h, '#3a3d41', 26, 5000, 17);
    g.strokeStyle = '#ecece4'; g.lineWidth = 4; g.lineCap = 'butt';
    const rowA = [CAR_PARK.z0 + 0.3, CAR_PARK.z0 + 5.0], rowB = [CAR_PARK.z1 - 4.6, CAR_PARK.z1 - 0.2];        // the two rows of bays: [car end, kerb end]
    [rowA, rowB].forEach(([za, zb]) => {
      for (let i = 0; i <= CAR_PARK.bays; i++) { const x = CAR_PARK.bayX0 + i * CAR_PARK.bayW; g.beginPath(); g.moveTo(X(x), Z(za)); g.lineTo(X(x), Z(zb)); g.stroke(); }
      g.beginPath(); g.moveTo(X(CAR_PARK.bayX0), Z(za)); g.lineTo(X(CAR_PARK.bayX0 + CAR_PARK.bays * CAR_PARK.bayW), Z(za)); g.stroke();
    });
    g.fillStyle = '#ecece4';                                                                                       // two arrows in the aisle
    const az = (rowA[1] + rowB[0]) / 2;
    [CAR_PARK.bayX0 + 3, CAR_PARK.bayX0 + 12].forEach(ax => { g.beginPath(); g.moveTo(X(ax + 1.3), Z(az)); g.lineTo(X(ax + 0.2), Z(az - 0.5)); g.lineTo(X(ax + 0.2), Z(az - 0.18)); g.lineTo(X(ax - 1.3), Z(az - 0.18)); g.lineTo(X(ax - 1.3), Z(az + 0.18)); g.lineTo(X(ax + 0.2), Z(az + 0.18)); g.lineTo(X(ax + 0.2), Z(az + 0.5)); g.closePath(); g.fill(); });
  });
}

// ---------- the compound ----------
function buildYard(group, animators) {
  const warn = (what, e) => console.warn('government: could not build ' + what, e);

  // ground: apron, driveway, stone island, car park
  if (SHOW.driveway) {
    const asphalt = groundMat(noiseAsphalt());
    flatRect(group, APRON, asphalt, 0.03, 4); flatRect(group, DRIVE, asphalt, 0.03, 4);
    const stone = new THREE.Mesh(new THREE.CircleGeometry(FOUNTAIN.island, 48), groundMat(canvasTex(256, 256, (g, w, h) => {
      noise(g, w, h, '#cfc8b8', 40, 1500, 29); g.strokeStyle = '#a9a291'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }, [FOUNTAIN.island * 2 / 1.5, FOUNTAIN.island * 2 / 1.5])));
    stone.rotation.x = -Math.PI / 2; stone.position.set(FOUNTAIN.x, 0.05, FOUNTAIN.z); stone.receiveShadow = true; group.add(stone);
  }
  if (SHOW.carPark) flatRect(group, CAR_PARK, groundMat(parkingTexture()), 0.04);

  // the hedge fence round both plots (7 runs, 7 parts each: 49 draw calls in all, each run is only drawn while you can see it)
  if (SHOW.fence) {
    (async () => {
      try {
        const probe = await instancePieces(new THREE.Group(), 'hedge_fence_optimised.glb', []);           // size of one panel (no copies)
        const runs = FENCE_RUNS.map(r => runPieces([r], probe.length));
        for (const pieces of runs) await instancePieces(group, 'hedge_fence_optimised.glb', pieces);
      } catch (e) { warn('hedge fence', e); }
    })();
  }

  // security post inside the gate
  if (SHOW.booth) loadFitted('security_booth_optimised.glb', { rotY: BOOTH.rotY }).then(o => { o.position.set(BOOTH.x, 0, BOOTH.z); group.add(o); }).catch(e => warn('security booth', e));

  // the fountain: its own animation plays on a loop
  if (SHOW.fountain) {
    getModel('fountain_animated_optimised.glb').then(gltf => {
      const m = gltf.scene.clone(true);
      m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = true; } });
      m.position.set(FOUNTAIN.x, 0, FOUNTAIN.z); group.add(m);
      if (gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(m); gltf.animations.forEach(c => mixer.clipAction(c).play());
        const clock = new THREE.Clock(); animators.push(() => mixer.update(Math.min(clock.getDelta(), 0.1)));
      }
    }).catch(e => warn('fountain', e));
  }

  // street lamps
  if (SHOW.lamps) LAMPS.forEach(([x, z, deg]) => loadLamp(6.5, THREE.MathUtils.degToRad(deg)).then(o => { o.position.set(x, 0, z); group.add(o); }).catch(e => warn('street lamp', e)));

  // the garden: low hedge (school hedge.glb) round the bed and in front of the office, the orange tree, the bushes
  if (SHOW.garden) instancePieces(group, 'hedge.glb', [], { height: HEDGE_H }).then(probe => instancePieces(group, 'hedge.glb', runPieces(LOW_HEDGES, probe.length), { height: HEDGE_H })).catch(e => warn('garden hedge', e));
  if (SHOW.orange) loadFitted('sour_orange_optimised.glb', { height: ORANGE.height }).then(o => { o.position.set(ORANGE.x, 0, ORANGE.z); group.add(o); }).catch(e => warn('orange tree', e));
  if (SHOW.bushes) {
    let seed = 8801; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    instancePieces(group, 'elephant_ear_bush_optimised.glb', BUSHES.map(([x, z, k]) => [x, z, rnd() * 6.28, 1, k])).catch(e => warn('elephant ear bushes', e));
  }
}
let asphaltTexture = null;
function noiseAsphalt() { if (!asphaltTexture) asphaltTexture = canvasTex(256, 256, (g, w, h) => noise(g, w, h, '#3a3d41', 26, 2600, 11), [1, 1]); return asphaltTexture; }

export function buildGovernment() {
  const group = new THREE.Group();
  const animators = [];
  const yard = new THREE.Group();                         // the compound: written in world metres, moved so it lines up with GOV_ORIGIN
  yard.position.set(-GOV_ORIGIN.x, 0, -GOV_ORIGIN.z); group.add(yard);
  buildYard(yard, animators);
  PARTS.forEach(p => {
    const holder = new THREE.Group();                      // turned to face the right way, standing at its place (relative to GOV_ORIGIN)
    holder.position.set(p.x - GOV_ORIGIN.x, 0, p.z - GOV_ORIGIN.z);
    holder.rotation.y = THREE.MathUtils.degToRad(p.rotY);
    group.add(holder);
    new GLTFLoader().load(p.file, gltf => {
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      gltf.scene.scale.setScalar(p.scale);
      holder.add(gltf.scene);
      // the name on the empty board (a plain card just in front of the board: the letters only, the board shows through)
      const s = p.sign, w = s.w * p.scale, h = s.h * p.scale;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: signTexture(s.text, w / h), transparent: true, alphaTest: 0.3, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      sign.position.set(s.x * p.scale, s.y * p.scale, s.z * p.scale + 0.012);
      holder.add(sign);
    }, undefined, e => {
      console.warn('government: could not load ' + p.file, e);       // a plain block so the game keeps running
      const b = new THREE.Mesh(new THREE.BoxGeometry(p.half.hw * 2 * p.scale, p.half.h * p.scale, p.half.hd * 2 * p.scale), new THREE.MeshStandardMaterial({ color: 0xd8d2c4 }));
      b.position.y = p.half.h * p.scale / 2; holder.add(b);
    });
  });
  return { group, update: () => { for (const f of animators) f(); } };
}
