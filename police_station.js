// police_station.js  (the Police Station plot)
//
// Exports:  buildPoliceStation() -> { group }      POLICE_BOXES -> solid parts for collisions
//
// LOCAL SPACE is the same as the other buildings: the plot centre is (0,0), the front / road side is +Z, the back is -Z, +X is east.
// game.js turns the whole building to face the nearest road (the main road, so this one faces NORTH, rotY 180), like the Rental Office.
//
// FILES: police_station.glb goes next to rental_office.glb (main folder); police_fence.glb and fig_tree.glb go in the props folder. All three are SHRUNK copies of your models:
//   police_station.glb   your base_basic building: 1 texture of 1024 px (was three of 2048 px, 12 MB; now 1.7 MB), already sized in metres
//                        (13.7 m wide, 12.8 m deep, 5.5 m tall), centred on x/z, base at y = 0, door and signboard on its +Z side.
//   police_fence.glb     ONE 1.63 m chain-link panel and ONE post (texture 512 px, was 3 x 1024 px). The code copies them round the plot.
//   fig_tree.glb         the fig tree without the fruit, twigs and leaf stalks, 6 textures of 256 px or less (was 17 textures, up to 1024 px).
//
// KEEPING THE GAME FAST
//   * the fence is 2 draw calls in total (InstancedMesh: every panel is one copy, every post is one copy)
//   * the trees are 6 draw calls in total (the same trick: all trees share the same 6 meshes)
//   * no shadows from the fence or the trees, no grass tufts
//   * the text POLICE STATION is one small picture (1536 x 170) laid on the empty signboard of the building
//
// THINGS YOU MAY WANT TO CHANGE
//   TREES        where the fig trees stand: [x, z, size, turn]  (size 1 = 5.1 m tall). Delete a line for fewer trees.
//   GATE_W       the width of the open gateway in the front fence (6 m = a car can drive through)
//   BZ           how far the building stands from the middle of the plot (+ = towards the road)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS_DIR } from './props_library.js';

const FILE_BUILDING = 'police_station.glb';                          // next to rental_office.glb, in the main folder
const FILE_FENCE = PROPS_DIR + 'police_fence.glb', FILE_TREE = PROPS_DIR + 'fig_tree.glb';   // in the props folder
const PLOT_W = 24, PLOT_D = 22;                       // the plot (from city.js)
const W = 13.7, D = 12.8;                             // size of the building in metres (from the file)
const BZ = 0;                                         // z of the building centre

// ----- signboard: the empty board above the door, in metres from the building centre (measured on your model) -----
const SIGN = { x: -0.007, y: 3.355, z: 5.69, w: 3.6, h: 0.4, text: 'POLICE STATION' };

// ----- fence round the plot (1 m inside the plot edge), with an open gateway in the middle of the front -----
const FX = PLOT_W / 2 - 1.0, FB = -(PLOT_D / 2 - 1.0), FF = PLOT_D / 2 - 1.0;
const GATE_W = 6.0;
const PANEL_W = 1.632;                                // width of the panel in the file
const RUNS = [                                        // [x0, z0, x1, z1]: each side of the fence, front is split by the gateway
  [-FX, FB, FX, FB],                                  // back
  [-FX, FB, -FX, FF],                                 // west side
  [FX, FB, FX, FF],                                   // east side
  [-FX, FF, -GATE_W / 2, FF],                         // front, left of the gateway
  [GATE_W / 2, FF, FX, FF]                            // front, right of the gateway
];

// ----- fig trees: [x, z, size, turn] -----
const TREES = [
  [-8.7, -8.0, 1.00, 0.4], [8.7, -8.2, 0.90, 2.1],
  [-8.8, -1.0, 1.10, 4.0], [8.9, 0.5, 1.00, 1.2],
  [-8.6, 7.8, 0.90, 5.3], [8.7, 7.6, 1.05, 3.3]
];

// ----- solid parts: the walls of the building (the roof and the veranda hang over your head), the fence, the tree trunks -----
const T = 0.15;                                       // half thickness of a fence line
export const POLICE_BOXES = [
  [-6.05, 6.05, BZ - 5.75, BZ + 4.05],                // the building walls
  [-FX - T, FX + T, FB - T, FB + T],                  // fence: back
  [-FX - T, -FX + T, FB, FF], [FX - T, FX + T, FB, FF],   // fence: sides
  [-FX - T, -GATE_W / 2, FF - T, FF + T], [GATE_W / 2, FX + T, FF - T, FF + T],   // fence: front, either side of the gateway
  ...TREES.map(([x, z]) => [x - 0.3, x + 0.3, z - 0.3, z + 0.3])   // tree trunks
];

// ---------- the text on the signboard ----------
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 170;
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 150;                                     // biggest letters that fit
  for (; size > 40; size -= 4) { g.font = `800 ${size}px "Segoe UI", Arial, Helvetica, sans-serif`; if (g.measureText(SIGN.text).width <= c.width * 0.94) break; }
  g.lineJoin = 'round'; g.lineWidth = size * 0.05; g.strokeStyle = '#ffffff'; g.strokeText(SIGN.text, c.width / 2, c.height / 2 + 4);   // thin light edge
  g.fillStyle = '#0a2a66'; g.fillText(SIGN.text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- the fence: every panel and every post is a copy of the same two meshes ----------
function buildFence(group) {
  new GLTFLoader().load(FILE_FENCE, gltf => {
    let panel = null, post = null;
    gltf.scene.traverse(o => { if (o.isMesh) { if (o.name.startsWith('panel')) panel = o; else if (o.name.startsWith('post')) post = o; } });
    if (!panel || !post) { console.warn('police_station: ' + FILE_FENCE + ' has no panel/post'); return; }
    const panels = [], posts = [];
    RUNS.forEach(([x0, z0, x1, z1]) => {
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / PANEL_W)), step = len / n;
      const ux = dx / len, uz = dz / len, rot = Math.atan2(-uz, ux);
      for (let k = 0; k < n; k++) panels.push([x0 + ux * step * k, z0 + uz * step * k, rot, step / PANEL_W]);
      for (let k = 0; k <= n; k++) posts.push([x0 + ux * step * k, z0 + uz * step * k, rot, 1]);
    });
    const make = (mesh, list) => {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length), o = new THREE.Object3D();
      list.forEach(([x, z, rot, sx], i) => { o.position.set(x, 0, z); o.rotation.set(0, rot, 0); o.scale.set(sx, 1, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; group.add(im);
    };
    make(panel, panels); make(post, posts);
  }, undefined, e => console.warn('police_station: could not load ' + FILE_FENCE, e));
}

// ---------- the trees: one InstancedMesh for each part of the tree (bark, branches, leaves), shared by all the trees ----------
function buildTrees(group) {
  new GLTFLoader().load(FILE_TREE, gltf => {
    gltf.scene.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), o = new THREE.Object3D();
    gltf.scene.traverse(part => {
      if (!part.isMesh) return;
      if (part.material.map) part.material.map.anisotropy = 2;
      const im = new THREE.InstancedMesh(part.geometry, part.material, TREES.length);
      TREES.forEach(([x, z, s, turn], i) => {
        o.position.set(x, 0, z); o.rotation.set(0, turn, 0); o.scale.setScalar(s); o.updateMatrix();
        m.multiplyMatrices(o.matrix, part.matrixWorld); im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; group.add(im);
    });
  }, undefined, e => console.warn('police_station: could not load ' + FILE_TREE, e));
}

export function buildPoliceStation() {
  const group = new THREE.Group();
  new GLTFLoader().load(FILE_BUILDING, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    gltf.scene.position.set(0, 0, BZ);
    group.add(gltf.scene);
    // POLICE STATION on the empty signboard (a plain card just in front of the board, text only, the board shows through)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.h),
      new THREE.MeshStandardMaterial({ map: signTexture(), transparent: true, alphaTest: 0.3, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    sign.position.set(SIGN.x, SIGN.y, BZ + SIGN.z + 0.012);
    group.add(sign);
  }, undefined, e => {
    console.warn('police_station: could not load ' + FILE_BUILDING, e);      // a plain block so the game keeps running
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, 4, D), new THREE.MeshStandardMaterial({ color: 0xe8e0cc }));
    b.position.set(0, 2, BZ); group.add(b);
  });
  buildFence(group);
  buildTrees(group);
  return { group };
}
