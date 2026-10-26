// hotel.js  (the Hotel compound: the Hotel and the Club House on the Hotel plot from city.js)
//
// Exports:  buildHotel() -> { group }      HOTEL_BOXES -> solid parts for collisions      HOTEL_ORIGIN -> the centre this compound is placed at
//
// WORLD-ALIGNED: like government.js, the compound is NOT turned by game.js (rotY 0 in the BUILDINGS entry), so the layout below is in real world metres
// and every building turns itself.  +X = east, +Z = south, -Z = north.   Both buildings face NORTH, towards the main road.
//
// FILES (main folder, next to city_hall.glb): hotel.glb and club_house.glb. Both are SHRUNK copies of your Rodin models (colour 2048 px, normal 2048 px, shine 1024 px):
//   hotel.glb        20,000 triangles, 2.6 MB (was 8.1 MB)      club_house.glb   4,326 triangles, 1.5 MB (was 6.6 MB)
//   Each file is centred on x/z with its base at y = 0 and its front (door side) on +Z, size in its own units (about 1.9 wide), scaled by SCALE below.
//
// THE PLOT (from city.js):  Hotel plot  x 238 to 312, z 36 to 86   (74 x 50 m)
// WHAT IS HERE: only the two buildings with their name boards (HOTEL and CLUB HOUSE). Nothing else yet. The space in front of both (z 37 to 63) is kept empty for the
//   gate, driveway, fountain and car park, the strip beside the hotel (west, x 238 to 253) is kept empty for the swimming pool, and 3 m is kept free behind them for the fence.
//
// THINGS YOU MAY WANT TO CHANGE
//   SCALE      how big each building is (Hotel 15.7 -> about 30 m wide, 20 m deep, 10.4 m high; Club House 8.3 -> about 15 m wide, 15.8 m deep, 6.9 m high)
//   x, z       where the building stands (its centre). Move it and the walls follow by themselves.
//   sign.text  the words on the name board

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HOTEL_ORIGIN = { x: 275, z: 61 };           // the centre this compound is placed at: it MUST be the x / z of the BUILDINGS entry in game.js

const PLOT = { x0: 238, x1: 312, z0: 36, z1: 86 };
const BACK_GAP = 3.0;                                    // metres between the back of a building and the back edge of the plot

// model sizes (half width x, half depth z, height), in the model's own units
const HOTEL_MODEL = { hw: 0.954, hd: 0.637, h: 0.664 };
const CLUB_MODEL = { hw: 0.915, hd: 0.950, h: 0.833 };
const HOTEL_SCALE = 15.7, CLUB_SCALE = 8.3;

// both stand with their back to the south edge of the plot and their door to the north (the road)
const backZ = PLOT.z1 - BACK_GAP;
const PARTS = [
  { file: 'hotel.glb', scale: HOTEL_SCALE, x: 268, z: backZ - HOTEL_MODEL.hd * HOTEL_SCALE, rotY: 180, half: HOTEL_MODEL,
    sign: { text: 'HOTEL', x: 0.010, y: 0.4715, z: 0.561, w: 0.190, h: 0.058 } },          // the white board above the glass lobby
  { file: 'club_house.glb', scale: CLUB_SCALE, x: 300, z: backZ - CLUB_MODEL.hd * CLUB_SCALE, rotY: 180, half: CLUB_MODEL,
    sign: { text: 'CLUB HOUSE', x: 0.003, y: 0.5725, z: 0.695, w: 0.350, h: 0.085 } }       // the grey board above the entrance canopy
];

// ---- solid parts: the walls of each building, [minX, maxX, minZ, maxZ] relative to HOTEL_ORIGIN (the game does not turn them: rotY is 0) ----
const STEP = 0.5;                                          // the strip in front of each door that stays walkable
export const HOTEL_BOXES = PARTS.map(p => {
  const turned = (Math.round(p.rotY / 90) % 2) !== 0;
  const hw = (turned ? p.half.hd : p.half.hw) * p.scale - 0.2, hd = (turned ? p.half.hw : p.half.hd) * p.scale - 0.2;
  let x0 = p.x - hw, x1 = p.x + hw, z0 = p.z - hd, z1 = p.z + hd;
  const turn = ((Math.round(p.rotY / 90) % 4) + 4) % 4;   // which way the door side points: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
  if (turn === 0) z1 -= STEP; else if (turn === 1) x1 -= STEP; else if (turn === 2) z0 += STEP; else x0 += STEP;
  return [x0 - HOTEL_ORIGIN.x, x1 - HOTEL_ORIGIN.x, z0 - HOTEL_ORIGIN.z, z1 - HOTEL_ORIGIN.z];
});

// ---------- the text on a name board ----------
function signTexture(text, ratio) {
  const c = document.createElement('canvas'); c.width = 1536; c.height = Math.max(64, Math.round(1536 / ratio));
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = c.height * 0.8;                              // biggest letters that fit
  for (; size > 30; size -= 4) { g.font = `800 ${size}px "Segoe UI", Arial, Helvetica, sans-serif`; if (g.measureText(text).width <= c.width * 0.86) break; }
  g.lineJoin = 'round'; g.lineWidth = size * 0.05; g.strokeStyle = '#ffffff'; g.strokeText(text, c.width / 2, c.height / 2 + 3);
  g.fillStyle = '#0a2a66'; g.fillText(text, c.width / 2, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildHotel() {
  const group = new THREE.Group();
  PARTS.forEach(p => {
    const holder = new THREE.Group();                      // turned to face the right way, standing at its place (relative to HOTEL_ORIGIN)
    holder.position.set(p.x - HOTEL_ORIGIN.x, 0, p.z - HOTEL_ORIGIN.z);
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
      console.warn('hotel: could not load ' + p.file, e);          // a plain block so the game keeps running
      const b = new THREE.Mesh(new THREE.BoxGeometry(p.half.hw * 2 * p.scale, p.half.h * p.scale, p.half.hd * 2 * p.scale), new THREE.MeshStandardMaterial({ color: 0xd8d2c4 }));
      b.position.y = p.half.h * p.scale / 2; holder.add(b);
    });
  });
  return { group };
}
