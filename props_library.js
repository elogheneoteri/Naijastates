// props_library.js: one place your game picks props from.
//
// HOW TO USE (in refugee_camp.js, game.js, anything):
//   import { loadProp, scatterProp } from './props_library.js';
//   const tank = await loadProp('overhead_tank');   // returns a THREE.Group, feet on the ground, centred
//   tank.position.set(-4.2, 0, 6.2); scene.add(tank);
//
// FOLDER LAYOUT: put every model and texture file in a folder called "props" next to index.html
// (just the files you uploaded to me, keep the same names). Change PROPS_DIR if you use another folder.
//
// ADDING A NEW PROP LATER: add one line to PROPS below. `height` is the real-world height in metres,
// the loader rescales the model to that, so no model ever comes in giant or tiny again.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const PROPS_DIR = 'props/';

// type: glb | fbx.  height: metres.  rotY: spin the model (radians) if it faces the wrong way.
// rotX: tip the model if it was exported lying down.  tint: optional colour multiplier.
export const PROPS = {
  // ----- water & containers -----
  jerry_can:      { file: '20l_water_jerry_can__h20_container__military.glb', height: 0.48, tags: ['camp', 'water'] },
  overhead_tank:  { file: 'overhead_water_tank.glb',  height: 3.2,  tags: ['camp', 'water', 'tank'] },
  plastic_tank:   { file: 'plastic_water_tank.glb',   height: 1.6,  tags: ['camp', 'water', 'tank'] },

  // ----- cooking -----
  clay_pot:       { file: 'clay_cooking_pot.glb',     height: 0.35, tags: ['camp', 'cooking'] },
  camp_pots:      { file: 'camping_cooking_pots.glb', height: 0.32, tags: ['camp', 'cooking'] },

  // ----- trees (stylized pack) -----
  palm_3:         { file: 'PalmTree_3.fbx', height: 6.0, tags: ['tree', 'palm'] },
  palm_4:         { file: 'PalmTree_4.fbx', height: 7.0, tags: ['tree', 'palm'] },
  dead_tree_1:    { file: 'DeadTree_1.fbx', height: 4.5, tags: ['tree', 'dead'] },
  dead_tree_3:    { file: 'DeadTree_3.fbx', height: 5.0, tags: ['tree', 'dead'] },

  // ----- plants -----
  bush_flowers:   { file: 'Bush_Flowers.fbx',    height: 1.0, tags: ['plant'] },
  flower_1:       { file: 'Flower_1.fbx',        height: 0.45, tags: ['plant'] },
  flower_clump:   { file: 'Flower_2_Clump.fbx',  height: 0.45, tags: ['plant'] },
};

// Textures that came with the stylized pack. FBX files often lose their texture links,
// so any material whose name contains the key gets that image.
const TEXTURE_BY_NAME = [
  ['flower', 'Flowers.png'],
  ['grass',  'Grass.png'],
  ['leaf',   'Leaves_BW.png'],
  ['leaves', 'Leaves_BW.png'],
  ['palm',   'Leaves_BW.png'],
  ['bush',   'Leaves_BW.png'],
];

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
const cache = new Map();      // name -> loaded template (loaded once, cloned for every use)
const texCache = new Map();

function getTex(file) {
  if (!texCache.has(file)) {
    const t = texLoader.load(PROPS_DIR + file);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(file, t);
  }
  return texCache.get(file);
}

function fixMaterials(root, def) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m, i) => {
      if (!m) return;
      // Re-link missing textures on the stylized FBX props by material/mesh name.
      if (def.type === 'fbx' && !m.map) {
        const label = ((m.name || '') + ' ' + (o.name || '')).toLowerCase();
        const hit = TEXTURE_BY_NAME.find(([k]) => label.includes(k));
        if (hit) { m.map = getTex(hit[1]); m.needsUpdate = true; }
      }
      // Leaf/flower cards use cut-out edges: keep them solid-looking from both sides.
      if (m.map) { m.alphaTest = Math.max(m.alphaTest, 0.4); m.side = THREE.DoubleSide; }
      // Slightly matte so nothing looks like plastic under the game's sun.
      if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.7, 0.6);
      if ('metalness' in m && def.type === 'fbx') m.metalness = 0;
      if (def.tint) m.color && m.color.multiply(new THREE.Color(def.tint));
      mats[i] = m;
    });
  });
}

// Scale to the target height, centre on x/z, put the lowest point on y = 0.
function normalise(root, def) {
  if (def.rotX) root.rotation.x = def.rotX;
  if (def.rotY) root.rotation.y = def.rotY;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = size.y > 0 ? def.height / size.y : 1;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  root.position.set(root.position.x - c.x, root.position.y - box.min.y, root.position.z - c.z);
  wrapper.add(root);
  return wrapper;
}

function loadFile(def) {
  const url = PROPS_DIR + def.file;
  const type = def.type || def.file.split('.').pop().toLowerCase();
  def.type = type === 'gltf' ? 'glb' : type;
  return new Promise((resolve, reject) => {
    if (def.type === 'glb') gltfLoader.load(url, g => resolve(g.scene), undefined, reject);
    else if (def.type === 'fbx') fbxLoader.load(url, resolve, undefined, reject);
    else reject(new Error('props_library: unsupported file type ' + def.file));
  });
}

// Returns a fresh, ready-to-place THREE.Group. Safe to call many times for the same prop.
export async function loadProp(name, options = {}) {
  const def = PROPS[name];
  if (!def) throw new Error('props_library: no prop called "' + name + '". Check the PROPS list.');
  if (!cache.has(name)) {
    cache.set(name, loadFile(def).then(root => {
      fixMaterials(root, def);
      return normalise(root, def);
    }));
  }
  const template = await cache.get(name);
  const copy = template.clone(true);
  if (options.scale) copy.scale.multiplyScalar(options.scale);
  if (options.rotY !== undefined) copy.rotation.y = options.rotY;
  if (options.position) copy.position.copy(options.position);
  return copy;
}

// Plant many copies inside a rectangle. spots = how many, area = { x1, x2, z1, z2 },
// keepClear = optional function (x, z) => true if that spot is blocked.
export async function scatterProp(name, parent, spots, area, keepClear) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < spots; i++) {
    const x = area.x1 + rand() * (area.x2 - area.x1);
    const z = area.z1 + rand() * (area.z2 - area.z1);
    if (keepClear && keepClear(x, z)) continue;
    const p = await loadProp(name, { rotY: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.45 });
    p.position.set(x, 0, z);
    parent.add(p);
  }
}

// All prop names, optionally filtered by tag: listProps('tree')
export function listProps(tag) {
  return Object.keys(PROPS).filter(k => !tag || PROPS[k].tags?.includes(tag));
}
