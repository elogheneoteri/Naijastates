// props_library.js: one place your game picks props from.
//
// HOW TO USE (in refugee_camp.js, game.js, anything):
//   import { loadProp, scatterProp } from './props_library.js';
//   const tank = await loadProp('overhead_tank');   // returns a THREE.Group, feet on the ground, centred
//   tank.position.set(-4.2, 0, 6.2); scene.add(tank);
//
// FOLDER LAYOUT: put every model and texture file in a folder called "props" next to index.html
// (keep the file names). Three models live one level up, next to index.html: medieval_tent.glb, clothes_line.glb,
// rope_fence.glb (they are written as '../name' below, so leave them where they are or move them into props and drop the '../').
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
  // Sizing options (use ONE of them):  height = real height in metres | maxXZ = longest side in metres |
  // unit = metres per model unit (use it when the model has loose ropes or stakes that confuse height).
  // center = [x, z] point of the model (in model units) to treat as its middle.  groundAt = model height that is the ground.
  // node = use only the named part of a model file.  rotY = which way the front faces.  cutout = leaf/cloth cut-out edges.

  // ----- tents and camp structures -----
  tent_big:       { file: '../medieval_tent.glb', unit: 0.12, center: [-17.5, 0], groundAt: 0, cutout: true, tags: ['camp', 'tent'] },
  tent_small:     { file: 'tent.glb', unit: 0.0085, center: [0, 0], groundAt: 0, rotY: Math.PI, cutout: true, tags: ['camp', 'tent'] },
  clothes_line:   { file: '../clothes_line.glb', maxXZ: 5.4, rotY: Math.PI / 2, cutout: true, tags: ['camp'] },
  rope_fence:     { file: '../rope_fence.glb', height: 1.0, tags: ['camp', 'fence'] },
  fence_panel:    { file: 'fence.glb', unit: 1.0, tags: ['camp', 'fence'] },        // one 2.5 m chain-link panel with a pillar at each end (1.6 m tall)

  // ----- registration desk -----
  office_table:   { file: 'office_table..glb', height: 0.78, tags: ['camp', 'furniture'] },   // two tables pushed together: about 1.6 m x 0.8 m
  plastic_chair:  { file: 'plastic_chair (1).glb', height: 0.85, rotY: Math.PI / 2, tags: ['camp', 'furniture'] },   // front faces +Z

  // ----- immigration office interior -----
  office_chair:    { file: 'office_chair.glb', height: 0.95, tags: ['office', 'furniture'] },            // front faces +Z
  personal_computer: { file: 'personal_computer.glb', height: 0.5, tags: ['office', 'computer'] },     // monitor + keyboard + tower
  laptop:          { file: 'laptop.glb', maxXZ: 0.36, tags: ['office', 'computer'] },
  standing_fan:    { file: 'standing_fan.glb', height: 1.35, tags: ['office', 'cooling'] },             // front faces +Z
  water_dispenser: { file: 'water_dispenser.glb', height: 1.1, rotY: -Math.PI / 2, tags: ['office'] },  // taps are on the +X side of the file, so turned to face +Z
  ac_wall:         { file: 'air_conditioner.glb', maxXZ: 0.95, tags: ['office', 'cooling'] },           // wall-mounted split unit, about 0.95 m wide
  ac_tower:        { file: 'standing_air_conditioner.glb', height: 1.7, rotY: -Math.PI / 2, tags: ['office', 'cooling'] },
  office_partition: { file: 'office_partition.glb', unit: 1.0, tags: ['office', 'furniture'] },   // desk divider, 2.64 m long x 1.41 m tall, runs along z (glass strip on top)
  filing_cabinet:  { file: 'filing_cabinet.glb', height: 1.3, rotY: Math.PI, tags: ['office', 'furniture'] },   // front faces +Z
  gta_marker_blue: { file: 'gta_marker_blue.glb', maxXZ: 1.9, glow: true, tags: ['marker'] },     // blue gradient entrance / exit marker (government)
  door_a:          { file: 'psx_doors_pack.glb', node: 'Door#1_Texture_0', height: 2.2, tags: ['office', 'door'] },
  door_b:          { file: 'psx_doors_pack.glb', node: 'Door#2_Texture_0', height: 2.2, tags: ['office', 'door'] },

  // ----- firewood -----
  wood_logs:      { file: 'wood-logs.glb', unit: 0.0143, tags: ['camp', 'wood'] },   // three logs stacked, about 1 m long
  wood_pile:      { file: 'wood_pile.glb', maxXZ: 1.8, tags: ['camp', 'wood'] },     // loose pile of long logs

  // ----- water & containers -----
  jerry_can:      { file: '20l_water_jerry_can__h20_container__military.glb', height: 0.48, tags: ['camp', 'water'] },
  overhead_tank:  { file: 'overhead_water_tank.glb',  height: 1.0,  tags: ['camp', 'water', 'tank'] },   // a long horizontal tank (about 2.8 m long at this height)
  plastic_tank:   { file: 'plastic_water_tank.glb',   height: 1.2,  tags: ['camp', 'water', 'tank'] },   // upright round tank

  // ----- cooking -----
  clay_pot:       { file: 'clay_cooking_pot.glb',     height: 0.30, tags: ['camp', 'cooking'] },
  camp_pots:      { file: 'camping_cooking_pots.glb', height: 0.22, tags: ['camp', 'cooking'] },

  // ----- crates and barrel (all cut out of crates.glb, one part each) -----
  crate_small:    { file: 'crates.glb', node: 'cratesmall', unit: 0.0075, tags: ['camp', 'crate'] },
  crate_tall:     { file: 'crates.glb', node: 'cratetall',  unit: 0.0075, tags: ['camp', 'crate'] },
  crate_wide:     { file: 'crates.glb', node: 'cratewide',  unit: 0.0075, tags: ['camp', 'crate'] },
  barrel:         { file: 'crates.glb', node: 'barrel',     unit: 0.0075, tags: ['camp', 'crate'] },
  crate_pile:     { file: 'crates.glb', node: 'cratesmerged2', unit: 0.0055, tags: ['camp', 'crate'] },
  crate_store:    { file: 'crates_and_boxes_at_the_back_of_an_asian_store.glb', height: 1.4, rotY: Math.PI / 2, tags: ['camp', 'crate'] },

  // ----- sacks -----
  sack_burlap:    { file: 'burlap_sack.glb', unit: 1.0, tags: ['camp', 'sack'] },
  sack_coffee:    { file: 'coffee_sack_group_asset.glb', unit: 0.9, tags: ['camp', 'sack'] },
  sack_wheat:     { file: 'wheat_sack.glb', unit: 1.0, tags: ['camp', 'sack'] },

  // ----- trees (African trees; the birch and dead trees are gone) -----
  // center [0,0] + groundAt 0 = the trunk base sits exactly on the x/z you place it at (the bent coconut leans toward -X of the file).
  coconut_palm:   { file: 'coconut_palm.glb',        height: 7.5, center: [0, 0], groundAt: 0, cutout: true, tags: ['tree', 'palm', 'coconut'] },
  coconut_bent:   { file: 'bended_coconut_tree.glb', height: 7.0, center: [0, 0], groundAt: 0, cutout: true, tags: ['tree', 'palm', 'coconut'] },
  mango_tree:     { file: 'mango_tree.glb',          height: 6.5, center: [0, 0], groundAt: 0, cutout: true, tags: ['tree', 'mango'] },
  palm_3:         { file: 'PalmTree_3.fbx', height: 6.0, tags: ['tree', 'palm'] },    // stylised palms kept in the list, not used right now
  palm_4:         { file: 'PalmTree_4.fbx', height: 7.0, tags: ['tree', 'palm'] },

  // ----- plants -----
  bush_flowers:   { file: 'Bush_Flowers.fbx',    height: 1.0, tags: ['plant'] },
  flower_1:       { file: 'Flower_1.fbx',        height: 0.45, tags: ['plant'] },
  flower_clump:   { file: 'Flower_2_Clump.fbx',  height: 0.45, tags: ['plant'] },
};

// Textures that came with the stylized pack. FBX files often lose their texture links,
// so any material whose name contains the key gets that image.
const TEXTURE_BY_NAME = [
  ['flowers', 'Flowers.png'],       // material called "Flowers" uses the flower sheet
  ['leaves',  'Leaves_BW.png'],     // PalmTree_Leaves, BirchTree_Leaves, Bush_Leaves use the leaf cut-out
];
const LEAF_GREEN = 0x5f8a2a;        // used when a leaf material comes in grey or white

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
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map(m => {
      if (!m) return m;
      const label = ((m.name || '') + ' ' + (o.name || '')).toLowerCase();
      if (def.type === 'fbx') {
        // FBX files from this pack have no linked textures: rebuild each material cleanly.
        const std = new THREE.MeshStandardMaterial({ name: m.name, color: m.color ? m.color.clone() : 0xffffff, roughness: 0.85, metalness: 0 });
        const hit = TEXTURE_BY_NAME.find(([k]) => label.includes(k));
        if (hit) {
          std.map = getTex(hit[1]);
          std.alphaTest = 0.4; std.side = THREE.DoubleSide; std.transparent = false;
          if (hit[0] === 'flowers') std.color.set(0xffffff);                      // show the flower sheet in its own colours
          else { const hsl = {}; std.color.getHSL(hsl); if (hsl.s < 0.2) std.color.set(LEAF_GREEN); }   // grey leaves become green
        }
        m = std;
      } else {
        if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.7, 0.55);
        if ('metalness' in m && m.metalness > 0.6 && !m.metalnessMap) m.metalness = 0.3;   // avoid black "mirror" look without an environment map
        if (def.cutout && m.map) {            // leaf / cloth edges cut out cleanly instead of blending
          if (m.transparent || m.alphaTest > 0) { m.alphaTest = Math.max(m.alphaTest, 0.4); m.transparent = false; m.depthWrite = true; }
          m.side = THREE.DoubleSide;
        }
      }
      if (def.glow && m.map) {                // GTA-style marker: bright gradient, blends with what is behind it
        m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 1.0;
        m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; m.needsUpdate = true;
      }
      if (def.tint && m.color) m.color.multiply(new THREE.Color(def.tint));
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// Scale, centre on x/z, and put the ground at y = 0. Spin (rotY) happens around the centre.
function normalise(root, def) {
  if (def.rotX) root.rotation.x = def.rotX;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (def.unit) s = def.unit;
  else if (def.maxXZ) s = def.maxXZ / Math.max(size.x, size.z, 1e-6);
  else if (def.height && size.y > 0) s = def.height / size.y;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const c = def.center ? new THREE.Vector3(def.center[0] * s, 0, def.center[1] * s) : box.getCenter(new THREE.Vector3());
  const ground = def.groundAt !== undefined ? def.groundAt * s : box.min.y;
  root.position.set(root.position.x - c.x, root.position.y - ground, root.position.z - c.z);
  const pivot = new THREE.Group();
  pivot.add(root);
  pivot.rotation.y = def.rotY || 0;
  const wrapper = new THREE.Group();
  wrapper.add(pivot);
  return wrapper;
}

const fileCache = new Map();   // file name -> the loaded model (each file is downloaded and fixed once)

function loadFile(def) {
  if (!fileCache.has(def.file)) {
    const url = PROPS_DIR + def.file;
    const type = def.file.split('.').pop().toLowerCase();
    def.type = type === 'gltf' ? 'glb' : type;
    fileCache.set(def.file, new Promise((resolve, reject) => {
      if (def.type === 'glb') gltfLoader.load(url, g => resolve(g.scene), undefined, reject);
      else if (def.type === 'fbx') fbxLoader.load(url, resolve, undefined, reject);
      else reject(new Error('props_library: unsupported file type ' + def.file));
    }).then(root => { fixMaterials(root, def); root.updateMatrixWorld(true); return root; }));
  }
  return fileCache.get(def.file);
}

// Returns a fresh, ready-to-place THREE.Group. Safe to call many times for the same prop.
export async function loadProp(name, options = {}) {
  const def = PROPS[name];
  if (!def) throw new Error('props_library: no prop called "' + name + '". Check the PROPS list.');
  if (!cache.has(name)) {
    cache.set(name, loadFile(def).then(scene => {
      let source = scene;
      if (def.node) {                                   // use just one named part of the file
        const part = scene.getObjectByName(def.node);
        if (!part) throw new Error('props_library: no part called "' + def.node + '" in ' + def.file);
        source = new THREE.Group();
        const c = part.clone(true);
        part.matrixWorld.decompose(c.position, c.quaternion, c.scale);
        source.add(c);
      } else {
        source = scene.clone(true);
      }
      return normalise(source, def);
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
