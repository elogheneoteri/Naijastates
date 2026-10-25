// government.js  (the Government compound: City Hall + Government Office, one compound made from the two plots in city.js)
//
// Exports:  buildGovernment() -> { group }      GOV_BOXES -> solid parts for collisions      GOV_ZONES -> the areas that show the name at the top left
//
// WORLD-ALIGNED: this building is NOT turned by game.js (rotY 0 in the BUILDINGS entry), because the two halves face different ways:
//   City Hall         faces EAST  (towards the avenue at x = 230)
//   Government Office faces NORTH (towards the main road)
// so the layout below is in real world metres, and every building turns itself.  +X = east, +Z = south, -Z = north.
//
// FILES (main folder, next to rental_office.glb): city_hall.glb and government_office.glb. Both are SHRUNK copies of your models:
//   20,000 triangles each, ONE colour picture of 2048 px, a normal map and a shine map of 1024 px (were three pictures of 2048 px, 7 MB and 14 MB).
//   Each file is the same shape as your original: centred on x/z, base at y = 0, door on its +Z side, size in its own units (about 1.9 wide), scaled by SCALE below.
//
// THE PLOTS (from city.js):  Government plot  x 138 to 198, z 36 to 86   (60 x 50 m)      City Hall plot  x 200 to 222, z 37 to 59   (22 x 22 m)
// WHAT IS HERE: only the two buildings with their name boards. Nothing else yet: the front yards are kept empty for decorations later,
//   and a strip is kept free behind each building for a fence (see BACK_GAP).
//
// THINGS YOU MAY WANT TO CHANGE
//   SCALE      how big each building is (City Hall 8.5 -> about 16.2 m wide, 15.6 m deep, 5 m high; Government Office 16 -> about 29.6 m wide, 30.4 m deep, 11.9 m high)
//   x, z       where the building stands (its centre). Move it and the walls follow by themselves.
//   sign.text  the words on the name board

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const GOV_ORIGIN = { x: 168, z: 61 };            // the centre this compound is placed at: it MUST be the x / z of the BUILDINGS entry in game.js

// ---- the two plots, and the strip kept free behind each building for a fence ----
const GOV_PLOT = { x0: 138, x1: 198, z0: 36, z1: 86 };
const HALL_PLOT = { x0: 200, x1: 222, z0: 37, z1: 59 };
const BACK_GAP = 3.0;                                    // metres between the back of a building and the back edge of its plot

// model sizes (half width x, half depth z, height), in the model's own units
const HALL_MODEL = { hw: 0.954, hd: 0.917, h: 0.582 };
const OFFICE_MODEL = { hw: 0.924, hd: 0.950, h: 0.744 };
const HALL_SCALE = 8.5, OFFICE_SCALE = 16;

// City Hall faces EAST: its back is the WEST side of its plot. (hd is the depth, along x when turned)
const hallX = HALL_PLOT.x0 + 1.3 + HALL_MODEL.hd * HALL_SCALE;      // back wall 1.3 m inside the plot
const hallZ = (HALL_PLOT.z0 + HALL_PLOT.z1) / 2;
// Government Office faces NORTH: its back is the SOUTH side of its plot.
const officeX = (GOV_PLOT.x0 + GOV_PLOT.x1) / 2;
const officeZ = GOV_PLOT.z1 - BACK_GAP - OFFICE_MODEL.hd * OFFICE_SCALE;

// ---- the buildings. Signs: x, y, z = the middle of the empty board on the model (model units), w, h = board size (model units) ----
const PARTS = [
  { file: 'city_hall.glb', scale: HALL_SCALE, x: hallX, z: hallZ, rotY: 90, half: HALL_MODEL,
    sign: { text: 'CITY HALL', x: 0, y: 0.450, z: 0.758, w: 0.250, h: 0.062 } },            // the grey board above the entrance canopy
  { file: 'government_office.glb', scale: OFFICE_SCALE, x: officeX, z: officeZ, rotY: 180, half: OFFICE_MODEL,
    sign: { text: 'GOVERNMENT OFFICE', x: 0, y: 0.710, z: 0.885, w: 0.500, h: 0.060 } }      // the long board on the roof, facing the front
];

// ---- solid parts: the walls of each building, [minX, maxX, minZ, maxZ] relative to GOV_ORIGIN (the game does not turn them: rotY is 0) ----
const STEP = 0.5;                                          // the strip in front of each door that stays walkable
export const GOV_BOXES = PARTS.map(p => {
  const turned = (Math.round(p.rotY / 90) % 2) !== 0;     // 90 or 270: the building lies sideways
  const hw = (turned ? p.half.hd : p.half.hw) * p.scale - 0.2, hd = (turned ? p.half.hw : p.half.hd) * p.scale - 0.2;
  let x0 = p.x - hw, x1 = p.x + hw, z0 = p.z - hd, z1 = p.z + hd;
  const turn = ((Math.round(p.rotY / 90) % 4) + 4) % 4;   // which way the door side points: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
  if (turn === 0) z1 -= STEP; else if (turn === 1) x1 -= STEP; else if (turn === 2) z0 += STEP; else x0 += STEP;
  return [x0 - GOV_ORIGIN.x, x1 - GOV_ORIGIN.x, z0 - GOV_ORIGIN.z, z1 - GOV_ORIGIN.z];
});

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

export function buildGovernment() {
  const group = new THREE.Group();
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
  return { group };
}
