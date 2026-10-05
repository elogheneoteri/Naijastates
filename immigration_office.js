// Immigration Office interior, built in code from your props (no new .glb needed for the room itself).
// Local space: the building centre is (0,0,0) on the ground. The front door is on the +Z (south) wall, facing the road.
// The room fills the building's footprint, so the player never teleports: game.js simply hides the outside
// model and shows this room while the player is inside. (Your server checks for teleporting, so this matters.)
//
// Exports:
//   buildImmigrationOffice()  -> { group, marker, halfW, halfD, setInside(bool), setCamera(relX, relZ) }
//   IMMIGRATION_BOXES         -> solid parts (walls with a door gap, desks, counter, chairs) for game.js collisions
//
// Props used (all in your props folder): pbr_material_floor_tiles.glb (floor + wall tiles), psx_style_office_walls_pack.glb,
// psx_doors_pack.glb, office_table..glb, office_chair.glb (no plastic chairs in here), personal_computer.glb, laptop.glb,
// standing_fan.glb, water_dispenser.glb, air_conditioner.glb (wall units), standing_air_conditioner.glb.
// (The reception counter and cabinets are built in code.)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadProp, PROPS_DIR } from './props_library.js';

// ---------- room size and layout (edit freely; everything below is in metres, centre of the building = 0,0) ----------

export const HALF_W = 12.6;          // room is 25.2 m wide (x) ...
export const HALF_D = 12.0;          // ... and 24 m deep (z). Door is on the +z side.
const WALL_H = 3.1;                  // wall height
const DOOR_HALF = 1.3;               // the doorway is 2.6 m wide, centred on x = 0
const WALL_UNIT = { h: 2.22, len: 1.6 };   // size of one piece of psx_style_office_walls_pack ("Wall 1")

// Three service windows along the back (north) wall. Staff sit on the north side, the applicant on the south side.
const WIN_Z = -9.0;
const WINDOWS = [
  { x: -7.5, title: 'WINDOW 1', sub: 'Registration',     computer: 'personal_computer' },
  { x: 0.0,  title: 'WINDOW 2', sub: 'Verification',     computer: 'personal_computer' },
  { x: 7.5,  title: 'WINDOW 3', sub: 'Indigene status',  computer: 'laptop' },
];
// Information counter on the west side (built in code)
const REC = { x: -7.5, z: 3.0, w: 6.0, d: 0.9, h: 1.05 };
// Waiting area: two rows of chairs on the east side, facing the windows
const WAIT_ROWS_Z = [1.6, 3.4];
const WAIT_X = [2.0, 3.1, 4.2, 5.3, 6.4, 7.5, 8.6];
const FANS = [[-11.6, 10.8], [11.6, 10.8]];
// Water dispensers, tower ACs (both stand against the side walls) and wall-mounted split ACs. rotY turns the front toward the room.
const DISPENSERS = [{ x: 12.4, z: 0.2, rotY: -Math.PI / 2 }, { x: -12.4, z: -6.5, rotY: Math.PI / 2 }];
const TOWER_ACS = [{ x: -12.25, z: 7.2, rotY: Math.PI / 2 }, { x: 12.25, z: 7.2, rotY: -Math.PI / 2 }];
const WALL_AC_Y = 2.5;                                  // height of the bottom of each wall unit
const WALL_ACS = [
  { x: -HALF_W + 0.16, z: -6.0, rotY: Math.PI / 2 }, { x: -HALF_W + 0.16, z: 8.0, rotY: Math.PI / 2 },
  { x: HALF_W - 0.16, z: -8.5, rotY: -Math.PI / 2 }, { x: HALF_W - 0.16, z: 8.5, rotY: -Math.PI / 2 },
];
const CABINETS = [[-11.4, -11.5], [11.4, -11.5]];     // filing cabinets in the back corners

// Which way the computers face. If a screen looks away from the staff chair, change Math.PI to 0 here.
const COMPUTER_ROT = Math.PI;

export const IMMIGRATION_BOXES = [
  // walls (the south wall has the door gap)
  [-HALF_W - 0.2, HALF_W + 0.2, -HALF_D - 0.2, -HALF_D + 0.2],
  [-HALF_W - 0.2, -DOOR_HALF, HALF_D - 0.2, HALF_D + 0.2],
  [DOOR_HALF, HALF_W + 0.2, HALF_D - 0.2, HALF_D + 0.2],
  [-HALF_W - 0.2, -HALF_W + 0.2, -HALF_D, HALF_D],
  [HALF_W - 0.2, HALF_W + 0.2, -HALF_D, HALF_D],
  // furniture
  ...WINDOWS.map(w => [w.x - 0.85, w.x + 0.85, WIN_Z - 0.45, WIN_Z + 0.45]),
  [REC.x - REC.w / 2, REC.x + REC.w / 2, REC.z - REC.d / 2 - 0.1, REC.z + REC.d / 2 + 0.1],
  ...WAIT_ROWS_Z.map(z => [WAIT_X[0] - 0.4, WAIT_X[WAIT_X.length - 1] + 0.4, z - 0.35, z + 0.35]),
  ...FANS.map(([x, z]) => [x - 0.3, x + 0.3, z - 0.3, z + 0.3]),
  ...DISPENSERS.map(d => [d.x - 0.2, d.x + 0.2, d.z - 0.2, d.z + 0.2]),
  ...TOWER_ACS.map(a => [a.x - 0.3, a.x + 0.3, a.z - 0.3, a.z + 0.3]),
  ...CABINETS.map(([x, z]) => [x - 0.45, x + 0.45, z - 0.3, z + 0.3]),
];

// ---------- small helpers ----------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signTex(w, h, bg, lines) {
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f3efe0'; g.lineWidth = h * 0.04;
    g.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h * 0.86);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(l => { g.font = `bold ${l.size}px Arial, sans-serif`; g.fillStyle = l.color || '#f7f3e4'; g.fillText(l.t, w / 2, l.y); });
  });
}

function noticeBoardTex() {
  return canvasTex(512, 384, g => {
    g.fillStyle = '#8a6a45'; g.fillRect(0, 0, 512, 384);
    g.fillStyle = '#b08a5a'; g.fillRect(14, 14, 484, 356);
    const cols = ['#f4f1e6', '#e8d98a', '#cfe3ef', '#f1c9c0', '#d9ead3'];
    let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 11; i++) {
      const x = 30 + (i % 4) * 118 + r() * 14, y = 34 + Math.floor(i / 4) * 110 + r() * 12, w = 86 + r() * 12, h = 92 + r() * 8;
      g.fillStyle = cols[i % cols.length]; g.fillRect(x, y, w, h);
      g.fillStyle = '#b3261e'; g.beginPath(); g.arc(x + w / 2, y + 7, 4, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k = 0; k < 6; k++) g.fillRect(x + 8, y + 22 + k * 11, w - 16 - r() * 24, 3);
    }
  });
}

// ---------- the room ----------

export function buildImmigrationOffice() {
  const group = new THREE.Group();          // everything inside (shown only while the player is inside)
  const marker = new THREE.Group();         // the door marker outside (shown only while the player is outside)
  const std = (color, rough = 0.85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const M = {
    wood: std(0x6f4c33), woodTop: std(0xb98d5e, 0.6), cabinet: std(0x7f8a91, 0.5, 0.3), mat: std(0x1f5a3a, 1),
    post: std(0x20402f, 0.7), dark: std(0x23272b, 0.7), cap: std(0x4e5a63, 0.5, 0.2),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const box = (mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  };
  const board = (parent, w, h, x, y, z, ry, tex) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.7 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  };
  const warn = what => e => console.warn('immigration office: could not load ' + what, e);
  const put = (name, x, y, z, opts) => loadProp(name, opts).then(p => { p.position.set(x, y, z); group.add(p); return p; });

  // ----- floor (tiles from pbr_material_floor_tiles.glb; plain blue-grey until it loads) -----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), std(0x9fb4c8, 0.6));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true;
  group.add(floor);
  new GLTFLoader().loadAsync(PROPS_DIR + 'pbr_material_floor_tiles.glb').then(gltf => {
    let src = null;
    gltf.scene.traverse(o => { if (o.isMesh && !src) src = o.material; });
    if (!src || !src.map) throw new Error('no tile texture found');
    const t = src.map.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(HALF_W * 2 / 2.0, HALF_D * 2 / 2.0);          // one picture of the texture is about 2 m wide
    t.anisotropy = 4; t.needsUpdate = true;
    floor.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.05 });
    addWallTiles(src.map);
  }).catch(warn('floor tiles (keeping the plain floor)'));

  // ----- walls: one group per side so game.js can hide the side the camera is behind -----
  const side = { N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
  Object.values(side).forEach(g => group.add(g));

  const fallbackWall = (g, alongX, fixed, from, to) => {
    const len = to - from, c = (from + to) / 2;
    const m = new THREE.Mesh(BOX, std(0xd9d2c0));
    m.scale.set(alongX ? len : 0.2, WALL_H, alongX ? 0.2 : len);
    m.position.set(alongX ? c : fixed, WALL_H / 2, alongX ? fixed : c);
    m.receiveShadow = true; g.add(m);
  };
  const wallRun = (kit, g, alongX, fixed, from, to) => {
    if (!kit) return fallbackWall(g, alongX, fixed, from, to);
    const len = to - from, n = Math.max(1, Math.round(len / 2.2)), step = len / n;
    const meshes = kit.map(k => { const im = new THREE.InstancedMesh(k.geo, k.mat, n); im.frustumCulled = false; im.receiveShadow = true; g.add(im); return im; });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongX ? Math.PI / 2 : 0);   // a wall piece runs along local z
    for (let i = 0; i < n; i++) {
      const c = from + step * (i + 0.5);
      pos.set(alongX ? c : fixed, 0, alongX ? fixed : c);
      sc.set(1, WALL_H / WALL_UNIT.h, step / WALL_UNIT.len);
      m.compose(pos, q, sc);
      meshes.forEach(im => im.setMatrixAt(i, m));
    }
  };
  // Wall tiles: a band of the same tile picture along the bottom 1.1 m of every wall, with a grey cap strip on top.
  // Each band lives in its wall's group, so it hides together with that wall when the camera is behind it.
  const addWallTiles = baseMap => {
    const H = 1.1, OFF = 0.03;
    const seg = (g, alongX, fixed, from, to, nx, nz) => {       // (nx, nz) = the direction the band faces (into the room)
      const len = to - from, c = (from + to) / 2;
      const t = baseMap.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 2.0, H / 2.0); t.anisotropy = 4; t.needsUpdate = true;
      const band = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.05 }));
      const px = alongX ? c : fixed + nx * OFF, pz = alongX ? fixed + nz * OFF : c;
      band.position.set(px, H / 2, pz); band.rotation.y = Math.atan2(nx, nz); band.receiveShadow = true; g.add(band);
      const cap = new THREE.Mesh(BOX, M.cap);
      cap.scale.set(alongX ? len : 0.07, 0.05, alongX ? 0.07 : len); cap.position.set(px, H + 0.025, pz); g.add(cap);
    };
    seg(side.N, true, -HALF_D, -HALF_W, HALF_W, 0, 1);
    seg(side.S, true, HALF_D, -HALF_W, -DOOR_HALF, 0, -1);
    seg(side.S, true, HALF_D, DOOR_HALF, HALF_W, 0, -1);
    seg(side.W, false, -HALF_W, -HALF_D, HALF_D, 1, 0);
    seg(side.E, false, HALF_W, -HALF_D, HALF_D, -1, 0);
  };
  const buildWalls = kit => {
    wallRun(kit, side.N, true, -HALF_D, -HALF_W, HALF_W);
    wallRun(kit, side.S, true, HALF_D, -HALF_W, -DOOR_HALF);
    wallRun(kit, side.S, true, HALF_D, DOOR_HALF, HALF_W);
    wallRun(kit, side.W, false, -HALF_W, -HALF_D, HALF_D);
    wallRun(kit, side.E, false, HALF_W, -HALF_D, HALF_D);
  };
  // Wall kit: the wallpaper and trim pieces of psx_style_office_walls_pack.glb, baked into place and repeated along each wall.
  const findNode = (root, name) => { let hit = null; root.traverse(o => { if (!hit && o.name.replace(/\s+/g, '_') === name.replace(/\s+/g, '_')) hit = o; }); return hit; };
  new GLTFLoader().loadAsync(PROPS_DIR + 'psx_style_office_walls_pack.glb').then(gltf => {
    gltf.scene.updateMatrixWorld(true);
    const kit = ['Wall 1_Wallpaper_0', 'Wall 1_Trim_0'].map(name => {
      const mesh = findNode(gltf.scene, name);
      if (!mesh) throw new Error('no part called ' + name);
      const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld);
      const mat = mesh.material.clone(); mat.side = THREE.DoubleSide; mat.roughness = 1; mat.metalness = 0;
      return { geo, mat };
    });
    buildWalls(kit);
  }).catch(e => { warn('office wall pieces (using plain walls)')(e); buildWalls(null); });

  // ----- entrance: exit sign inside, door mat -----
  board(group, 1.6, 0.45, 0, 2.7, HALF_D - 0.06, Math.PI, signTex(512, 144, '#0b5a2e', [{ t: 'EXIT', size: 96, y: 76 }]));
  box(M.mat, 2.2, 0.03, 1.1, 0, 0.03, HALF_D - 1.0);

  // ----- signs on the walls -----
  WINDOWS.forEach(w => board(group, 2.6, 0.78, w.x, 2.45, -HALF_D + 0.06, 0,
    signTex(768, 230, '#12395c', [{ t: w.title, size: 90, y: 80 }, { t: w.sub, size: 52, y: 168, color: '#ffe9a8' }])));
  board(group, 2.4, 0.7, -HALF_W + 0.06, 2.45, REC.z, Math.PI / 2,
    signTex(768, 224, '#12395c', [{ t: 'INFORMATION', size: 84, y: 78 }, { t: 'Ask here first', size: 50, y: 164, color: '#ffe9a8' }]));
  board(group, 2.4, 0.7, HALF_W - 0.06, 2.45, 2.5, -Math.PI / 2,
    signTex(768, 224, '#5c3a12', [{ t: 'WAITING AREA', size: 78, y: 78 }, { t: 'Take a seat', size: 50, y: 164, color: '#ffe9a8' }]));
  board(group, 2.4, 1.8, HALF_W - 0.06, 1.55, -4.5, -Math.PI / 2, noticeBoardTex());

  // ----- information counter (built in code) -----
  box(M.wood, REC.w, REC.h, REC.d, REC.x, REC.h / 2, REC.z);
  box(M.woodTop, REC.w + 0.2, 0.07, REC.d + 0.2, REC.x, REC.h + 0.035, REC.z);
  const counterTop = REC.h + 0.07;

  // ----- filing cabinets -----
  CABINETS.forEach(([x, z]) => {
    box(M.cabinet, 0.9, 1.5, 0.5, x, 0.75, z);
    [0.3, 0.75, 1.2].forEach(y => box(M.dark, 0.7, 0.04, 0.02, x, y, z + 0.26));
  });

  // ----- real props -----
  // Service windows: table, staff chair behind, applicant chair in front, a computer on the table
  WINDOWS.forEach(w => {
    put('office_table', w.x, 0, WIN_Z).catch(warn('office table'));
    put('office_chair', w.x, 0, WIN_Z - 1.1).catch(warn('office chair'));
    put('office_chair', w.x, 0, WIN_Z + 1.3, { rotY: Math.PI }).catch(warn('office chair'));
    put(w.computer, w.x - 0.2, 0.78, WIN_Z, { rotY: COMPUTER_ROT }).catch(warn(w.computer));
  });
  // Information counter: two staff behind it, a PC and a laptop on top
  put('office_chair', REC.x - 1.5, 0, REC.z - 1.2).catch(warn('office chair'));
  put('office_chair', REC.x + 1.5, 0, REC.z - 1.2).catch(warn('office chair'));
  put('personal_computer', REC.x - 1.5, counterTop, REC.z, { rotY: COMPUTER_ROT }).catch(warn('personal computer'));
  put('laptop', REC.x + 1.5, counterTop, REC.z, { rotY: COMPUTER_ROT }).catch(warn('laptop'));
  // Waiting area: rows of office chairs facing the windows (north)
  WAIT_ROWS_Z.forEach(z => WAIT_X.forEach(x => put('office_chair', x, 0, z, { rotY: Math.PI }).catch(warn('office chair'))));
  // Fans in the front corners
  FANS.forEach(([x, z], i) => put('standing_fan', x, 0, z, { rotY: i ? -2.4 : 2.4 }).catch(warn('standing fan')));
  // Water dispensers, tower ACs, and split ACs high on the side walls
  DISPENSERS.forEach(d => put('water_dispenser', d.x, 0, d.z, { rotY: d.rotY }).catch(warn('water dispenser')));
  TOWER_ACS.forEach(a => put('ac_tower', a.x, 0, a.z, { rotY: a.rotY }).catch(warn('tower AC')));
  WALL_ACS.forEach(a => put('ac_wall', a.x, WALL_AC_Y, a.z, { rotY: a.rotY }).catch(warn('wall AC')));
  // Two staff doors in the back wall, with small signs
  [-3.75, 3.75].forEach((x, i) => {
    put(i ? 'door_b' : 'door_a', x, 0, -HALF_D + 0.14).catch(warn('staff door'));
    board(group, 1.1, 0.32, x, 2.6, -HALF_D + 0.06, 0, signTex(384, 112, '#7a2418', [{ t: 'STAFF ONLY', size: 46, y: 58 }]));
  });

  // ----- door marker (outside): so players can see where to walk in -----
  const frame = (w, h, d, x, y, z) => { const m = new THREE.Mesh(BOX, M.post); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; marker.add(m); };
  const mz = HALF_D + 0.35;
  frame(0.3, 3.2, 0.3, -DOOR_HALF - 0.15, 1.6, mz);
  frame(0.3, 3.2, 0.3, DOOR_HALF + 0.15, 1.6, mz);
  frame(DOOR_HALF * 2 + 0.6, 0.3, 0.3, 0, 3.2, mz);
  board(marker, 3.4, 0.9, 0, 3.85, mz, 0, signTex(1024, 270, '#0b5a2e', [{ t: 'IMMIGRATION OFFICE', size: 84, y: 100 }, { t: 'Walk in to register', size: 46, y: 192, color: '#ffe9a8' }]));
  const matOut = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), M.mat);
  matOut.rotation.x = -Math.PI / 2; matOut.position.set(0, 0.03, HALF_D + 0.9); matOut.receiveShadow = true; marker.add(matOut);

  // ----- hooks used by game.js -----
  const setInside = inside => { group.visible = inside; marker.visible = !inside; };
  // relX / relZ = camera position relative to the building centre. A wall is hidden when the camera is behind it,
  // so the walls never block the view of the room.
  const setCamera = (relX, relZ) => {
    side.N.visible = !(relZ < -HALF_D);
    side.S.visible = !(relZ > HALF_D);
    side.W.visible = !(relX < -HALF_W);
    side.E.visible = !(relX > HALF_W);
  };
  setInside(false);

  return { group, marker, halfW: HALF_W, halfD: HALF_D, setInside, setCamera };
}
