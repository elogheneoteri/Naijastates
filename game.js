// 3D version of the game (Three.js). Replaces the flat Phaser game.
// Your server.js does NOT change: it still thinks in the old pixel units.
// We convert: 1 metre in 3D = PX_PER_M pixels on the server.
//   server x  ->  3D X (east)      server y  ->  3D Z (south)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildRefugeeCamp, CAMP_BOXES } from './refugee_camp.js';
import { buildImmigrationOffice, IMMIGRATION_BOXES } from './immigration_office.js';

// >>> Your three values (same as before). <<<
const SERVER_URL = 'https://naija-server.onrender.com';
const SUPABASE_URL = 'https://imcfgubedcrxmydanabx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dUT0e10wO4IK7t0fzD02Yw_zmuh2ruE';

// ---------------- World settings ----------------

const PX_PER_M = 30;                       // server pixels per metre
const WORLD_W = 3900 / PX_PER_M;           // 130 m
const WORLD_H = 1500 / PX_PER_M;           // 50 m
const SPEED = 5.0;                         // metres per second (server allows up to 190 px/s = 6.3 m/s)
const GATE_X = 2000 / PX_PER_M;            // border wall (66.7 m); server blocks players past x = 1995 px
const SEND_EVERY_MS = 66;
const PLAYER_RADIUS = 0.45;

const SPAWN = { x: 470 / PX_PER_M, z: 850 / PX_PER_M };
const ROAD_Z0 = 27.0, ROAD_Z1 = 30.5;      // main road (runs west to east, through the gate)

// Buildings. x/z = centre on the ground, rotY = turn in degrees.
// Both models are made facing +Z (south), so the Refugee Camp (south of the road) is turned 180
// to face north, towards the road.
// boxes = solid parts you cannot walk through: [minX, maxX, minZ, maxZ] relative to the centre,
// measured BEFORE rotation (the code rotates them for you).
const BUILDINGS = [
  {
    key: 'immigration', name: 'Immigration Office', file: 'immigration_office.glb',
    // Realistic office building (low_rise_wall_to_wall_office_building.glb, saved as immigration_office.glb).
    // The model is in centimetre-style units, so scale shrinks it to game metres.
    // Make it bigger or smaller with scale (0.008 = about 25.6 m wide, 23 m tall tower).
    // The code centres it on x/z and sits it on the ground; the glass front faces +Z (south, towards the road).
    scale: 0.008,
    x: 50, z: 11.8, rotY: 0,
    // The inside is built in code (immigration_office.js). Walk through the door in the south wall to go in:
    // the outside model hides and the office interior shows. Solid parts = the office walls (with the door gap) and furniture.
    interior: buildImmigrationOffice,
    boxes: IMMIGRATION_BOXES,
    fallback: [25.6, 23, 24.2]
  },
  {
    key: 'refugee', name: 'Refugee Camp', file: 'refugee_camp.glb',
    build: buildRefugeeCamp,                // built in code (refugee_camp.js); the .glb is no longer used
    x: 21, z: 40, rotY: 180,
    boxes: CAMP_BOXES,                      // big tent, small tents and fence (defined in refugee_camp.js)
    fallback: [19, 4, 19]
  }
];

// ---------------- Login screen ----------------

const configured = !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const authBox = document.getElementById('auth');
const authMsg = document.getElementById('authMsg');
const authName = document.getElementById('authName');
const authEmail = document.getElementById('authEmail');
const authPass = document.getElementById('authPass');

function say(text) { authMsg.textContent = text; }

let gameStarted = false;
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  authBox.style.display = 'none';
  new World(document.getElementById('game'));
}

document.getElementById('btnSignup').addEventListener('click', async () => {
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  const name = authName.value.trim();
  if (!name) return say('Enter a display name first.');
  say('Creating account...');
  const { data, error } = await sb.auth.signUp({ email: authEmail.value.trim(), password: authPass.value });
  if (error) return say(error.message);
  localStorage.setItem('pendingName', name);
  if (!data.session) return say('Account created. Check your email to confirm, then log in.');
  startGame();
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  say('Logging in...');
  const { error } = await sb.auth.signInWithPassword({ email: authEmail.value.trim(), password: authPass.value });
  if (error) return say(error.message);
  startGame();
});

(async function boot() {
  authBox.style.display = 'flex';
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  const { data } = await sb.auth.getSession();
  if (data.session) startGame();
})();

// ---------------- Small helpers ----------------

function makeLabel(text, bg = 'rgba(0,0,0,0.6)', color = '#fff', size = 34) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${size}px Georgia, serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = size + 20;
  ctx.font = `${size}px Georgia, serif`;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = 0.0085;
  spr.scale.set(c.width * k, c.height * k, 1);
  return spr;
}

// Simple placeholder person (until the proper 3D character exists).
function makeBlockyAvatar(shirt) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.9 });
  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.46, 0.62, 0.26), cloth, 0, 1.08, 0);
  add(new THREE.SphereGeometry(0.17, 16, 12), skin, 0, 1.56, 0);
  const mkLimb = (geo, mat, x, y, drop) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); g.add(pivot);
    add(geo, mat, 0, -drop, 0, pivot); return pivot;
  };
  g.userData.legL = mkLimb(new THREE.BoxGeometry(0.17, 0.78, 0.2), pants, -0.12, 0.78, 0.39);
  g.userData.legR = mkLimb(new THREE.BoxGeometry(0.17, 0.78, 0.2), pants, 0.12, 0.78, 0.39);
  g.userData.armL = mkLimb(new THREE.BoxGeometry(0.12, 0.6, 0.14), cloth, -0.3, 1.36, 0.27);
  g.userData.armR = mkLimb(new THREE.BoxGeometry(0.12, 0.6, 0.14), cloth, 0.3, 1.36, 0.27);
  g.userData.phase = 0;
  return g;
}

function animateBlocky(av, speed, dt) {
  const u = av.userData;
  u.phase += dt * (3 + speed * 1.6);
  const amp = Math.min(speed / SPEED, 1) * 0.7;
  const s = Math.sin(u.phase) * amp;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s; u.armR.rotation.x = s;
}

// ---------- The 3D character (player_female_01.glb: has a skeleton and idle / walk / run animations) ----------

let characterLoad = null;
function loadCharacter() {
  if (!characterLoad) characterLoad = new Promise((ok, fail) => new GLTFLoader().load('player_female_01.glb', ok, undefined, fail));
  return characterLoad;
}

// Returns an empty holder straight away; the character appears inside it once the file has loaded.
// If the file cannot load, the old blocky person is used instead so the game still works.
function makeAvatar(shirt) {
  const holder = new THREE.Group();
  loadCharacter().then(gltf => {
    const model = cloneSkinned(gltf.scene);
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    holder.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    gltf.animations.forEach(c => { actions[c.name] = mixer.clipAction(c); });
    actions.idle.play();
    Object.assign(holder.userData, { mixer, actions, state: 'idle' });
  }).catch(() => {
    const b = makeBlockyAvatar(shirt);
    Object.assign(holder.userData, b.userData);
    while (b.children.length) holder.add(b.children[0]);
  });
  return holder;
}

function animateAvatar(av, speed, dt) {
  const u = av.userData;
  if (!u.mixer) { if (u.legL) animateBlocky(av, speed, dt); return; }
  const want = speed < 0.3 ? 'idle' : speed < 2.5 ? 'walk' : 'run';
  if (want !== u.state) {
    const next = u.actions[want], prev = u.actions[u.state];
    next.reset().play();
    next.crossFadeFrom(prev, 0.25, false);
    u.state = want;
  }
  if (want === 'walk') u.actions.walk.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.5, 1.6);
  if (want === 'run') u.actions.run.timeScale = THREE.MathUtils.clamp(speed / 3.6, 0.8, 1.6);
  u.mixer.update(dt);
}

function turnTowards(obj, angle, dt) {
  let d = angle - obj.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  obj.rotation.y += d * Math.min(1, dt * 12);
}

// ---------------- The world ----------------

class World {
  constructor(parent) {
    this.progress = 'arrived';
    this.devTools = false;
    this.others = new Map();
    this.myId = null;
    this.lastSent = 0;
    this.boxes = [];            // solid rectangles {x0,x1,z0,z1}
    this.animators = [];        // functions run every frame (waving flags)
    this.keys = {};
    this.stick = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0 };
    this.cam = { yaw: -Math.PI / 2, pitch: 0.42, dist: 9 };
    this.look = null;
    this.clock = new THREE.Clock();

    this.initThree(parent);
    this.buildGround();
    this.buildBorder();
    BUILDINGS.forEach(b => this.addBuilding(b));
    this.buildPlayer();
    this.buildHud();
    this.bindInput();
    this.applyGate();
    this.connect();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ----- three.js setup -----
  initThree(parent) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9d3ee);
    this.scene.fog = new THREE.Fog(0xa9d3ee, 70, 190);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x7a6a50, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  // ----- ground, road, border wall and gate -----
  buildGround() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#7d9059'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 90 + Math.random() * 60;
      ctx.fillStyle = `rgba(${v + 20},${v + 40},${v - 10},0.35)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(WORLD_W / 6, WORLD_H / 6);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, -0.04, WORLD_H / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Beyond the world edge: more ground so the horizon is not a cliff
    const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x748754, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(WORLD_W / 2, -0.08, WORLD_H / 2);
    this.scene.add(far);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3d4046, roughness: 0.95 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, ROAD_Z1 - ROAD_Z0), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(WORLD_W / 2, -0.02, (ROAD_Z0 + ROAD_Z1) / 2);
    road.receiveShadow = true;
    this.scene.add(road);
    const dash = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.9 });
    for (let x = 2; x < WORLD_W; x += 4) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.14), dash);
      d.rotation.x = -Math.PI / 2; d.position.set(x, -0.015, (ROAD_Z0 + ROAD_Z1) / 2); this.scene.add(d);
    }
  }

  buildBorder() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.9 });
    const H = 3.6, T = 0.5, gx = GATE_X;
    const seg = (z0, z1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(T, H, z1 - z0), wallMat);
      m.position.set(gx + T / 2 - 0.2, H / 2, (z0 + z1) / 2);
      m.castShadow = m.receiveShadow = true; this.scene.add(m);
      this.boxes.push({ x0: gx - 0.2, x1: gx - 0.2 + T, z0, z1 });
    };
    seg(0, ROAD_Z0 - 0.6);
    seg(ROAD_Z1 + 0.6, WORLD_H);

    // Checkpoint barrier in the road gap: closed until the server says progress = indigene
    this.gateGroup = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
    const gz0 = ROAD_Z0 - 0.6, gz1 = ROAD_Z1 + 0.6, n = 8, step = (gz1 - gz0) / n;
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, step), i % 2 ? white : red);
      b.position.set(gx + 0.05, 1.0, gz0 + step * (i + 0.5)); b.castShadow = true; this.gateGroup.add(b);
    }
    [gz0 + 0.1, gz1 - 0.1].forEach(z => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), wallMat);
      p.position.set(gx + 0.05, 1.1, z); p.castShadow = true; this.gateGroup.add(p);
    });
    this.gateLabel = makeLabel('Locked: finish immigration', '#7a2418', '#ffd9d4', 34);
    this.gateLabel.position.set(gx - 0.3, 3.0, (ROAD_Z0 + ROAD_Z1) / 2);
    this.gateGroup.add(this.gateLabel);
    this.scene.add(this.gateGroup);
    this.gateBox = { x0: gx - 0.2, x1: gx + 0.3, z0: gz0, z1: gz1 };
    this.gateClosed = true;
  }

  // ----- buildings (the .glb files) -----
  addBuilding(b) {
    const root = new THREE.Group();
    root.position.set(b.x, 0, b.z);
    root.rotation.y = THREE.MathUtils.degToRad(b.rotY);
    this.scene.add(root);

    // Collision boxes: rotate the relative boxes by rotY (multiples of 90 only)
    const r = ((Math.round(b.rotY / 90) % 4) + 4) % 4;
    b.boxes.forEach(([x0, x1, z0, z1]) => {
      let a = [x0, x1, z0, z1];
      for (let i = 0; i < r; i++) a = [a[2], a[3], -a[1], -a[0]];   // 90 degrees turn
      this.boxes.push({ x0: b.x + a[0], x1: b.x + a[1], z0: b.z + a[2], z1: b.z + a[3] });
    });

    // Name zone for the top-left text
    b.zone = { x0: b.x - 14, x1: b.x + 14, z0: b.z - 14, z1: b.z + 14 };

    if (b.interior) {                    // a room you can walk into: hidden until the player is inside
      b.room = b.interior();
      b.inside = false;
      root.add(b.room.group, b.room.marker);
    }

    if (b.build) {                       // building made in code instead of a .glb file
      const built = b.build();
      root.add(built.group);
      if (built.update) this.animators.push(built.update);
      return;
    }

    new GLTFLoader().load(b.file, gltf => {
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      b.exterior = gltf.scene;           // kept so it can be hidden while the player is inside
      gltf.scene.visible = !b.inside;
      if (b.scale) {                     // shrink to game size, centre on x/z, sit on the ground
        gltf.scene.scale.setScalar(b.scale);
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        gltf.scene.position.x -= (box.min.x + box.max.x) / 2;
        gltf.scene.position.z -= (box.min.z + box.max.z) / 2;
        gltf.scene.position.y -= box.min.y;
      }
      root.add(gltf.scene);
    }, undefined, () => {
      // File missing or wrong name: show a plain block so the game still works
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.fallback), new THREE.MeshStandardMaterial({ color: 0xbbbbbb }));
      m.position.y = b.fallback[1] / 2; root.add(m);
      b.exterior = m; m.visible = !b.inside;
      this.say3d('Could not load ' + b.file + ' (check the file name)');
    });
  }

  // ----- the player -----
  buildPlayer() {
    this.player = makeAvatar(0x2c6e9b);
    this.player.position.set(SPAWN.x, 0, SPAWN.z);
    this.scene.add(this.player);
    this.pvel = { x: 0, z: 0 };
  }

  setLabel(holder, name) {
    holder.remove(holder.userData.label || new THREE.Object3D());
    const l = makeLabel(name);
    l.position.y = 2.1;
    holder.add(l); holder.userData.label = l;
  }

  // ----- HUD (plain HTML on top of the 3D view) -----
  buildHud() {
    const css = document.createElement('style');
    css.textContent = `
      .hud { position: fixed; left: 12px; font-family: Georgia, serif; color: #fff; background: #00000088;
             padding: 6px 10px; border-radius: 4px; z-index: 5; user-select: none; }
      .hud.btn { cursor: pointer; background: #3a566d; font-size: 16px; }
      #stickBase, #stickKnob { position: fixed; border-radius: 50%; z-index: 6; display: none; pointer-events: none; }
      #stickBase { width: 110px; height: 110px; background: #ffffff26; }
      #stickKnob { width: 52px; height: 52px; background: #ffffff73; }`;
    document.head.appendChild(css);
    const mk = (id, top, extra = '') => {
      const d = document.createElement('div'); d.id = id; d.className = 'hud ' + extra; d.style.top = top + 'px';
      document.body.appendChild(d); return d;
    };
    this.zoneText = mk('zoneText', 10); this.zoneText.style.fontSize = '20px';
    this.testButton = mk('testButton', 50, 'btn'); this.testButton.style.background = '#2c6e9b'; this.testButton.style.display = 'none';
    this.testButton.addEventListener('click', () => this.toggleProgressTest());
    this.statusText = mk('statusText', 96); this.statusText.style.color = '#ffe9a8'; this.statusText.style.fontSize = '16px';
    this.logoutButton = mk('logoutButton', 134, 'btn'); this.logoutButton.textContent = 'Log out';
    this.logoutButton.addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    this.stickBase = document.createElement('div'); this.stickBase.id = 'stickBase';
    this.stickKnob = document.createElement('div'); this.stickKnob.id = 'stickKnob';
    document.body.append(this.stickBase, this.stickKnob);
  }

  say3d(t) { this.statusText.textContent = t; }

  // ----- input: WASD/arrows, mouse drag to look, touch stick (left) + drag to look (right) -----
  bindInput() {
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('wheel', e => {
      this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + e.deltaY * 0.01, 4, 20); e.preventDefault();
    }, { passive: false });

    const drags = new Map();
    this.canvas.addEventListener('pointerdown', e => {
      this.canvas.setPointerCapture(e.pointerId);
      const touch = e.pointerType === 'touch';
      if (touch && e.clientX < window.innerWidth * 0.5 && e.clientY > 180 && !this.stick.active) {
        this.stick.active = true; this.stick.id = e.pointerId; this.stick.sx = e.clientX; this.stick.sy = e.clientY;
        this.stick.x = this.stick.y = 0;
        this.stickBase.style.cssText = `display:block;left:${e.clientX - 55}px;top:${e.clientY - 55}px`;
        this.stickKnob.style.cssText = `display:block;left:${e.clientX - 26}px;top:${e.clientY - 26}px`;
      } else {
        drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (this.stick.active && e.pointerId === this.stick.id) {
        let dx = e.clientX - this.stick.sx, dy = e.clientY - this.stick.sy;
        const len = Math.hypot(dx, dy), max = 55;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        this.stick.x = dx / max; this.stick.y = dy / max;
        this.stickKnob.style.left = (this.stick.sx + dx - 26) + 'px';
        this.stickKnob.style.top = (this.stick.sy + dy - 26) + 'px';
        return;
      }
      const d = drags.get(e.pointerId);
      if (!d) return;
      this.cam.yaw -= (e.clientX - d.x) * 0.006;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + (e.clientY - d.y) * 0.005, 0.12, 1.25);
      d.x = e.clientX; d.y = e.clientY;
    });
    const end = e => {
      drags.delete(e.pointerId);
      if (this.stick.active && e.pointerId === this.stick.id) {
        this.stick.active = false; this.stick.x = this.stick.y = 0;
        this.stickBase.style.display = 'none'; this.stickKnob.style.display = 'none';
      }
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  // ----- multiplayer (same messages as before; only the units are converted) -----
  connect() {
    if (SERVER_URL.includes('YOUR-SERVER-NAME')) { this.say3d('Set SERVER_URL at the top of game.js'); return; }
    this.say3d('Connecting... the server may take about a minute to wake up.');
    this.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) { this.say3d('Please log in again.'); return; }
      this.socket.emit('join', { token: data.session.access_token, name: localStorage.getItem('pendingName') || '' });
    });

    this.socket.on('init', data => {
      this.myId = data.you;
      this.progress = data.progress;
      this.devTools = data.devTools;
      this.player.position.set(data.x / PX_PER_M, 0, data.y / PX_PER_M);
      this.setLabel(this.player, data.name);
      data.players.forEach(p => { if (p.id !== this.myId) this.addOther(p); });
      this.applyGate();
      this.updateStatus();
    });

    this.socket.on('progress', d => { this.progress = d.progress; this.applyGate(); });
    this.socket.on('correct', d => { this.player.position.set(d.x / PX_PER_M, 0, d.y / PX_PER_M); });
    this.socket.on('joined', p => { this.addOther(p); this.updateStatus(); });
    this.socket.on('left', id => { this.removeOther(id); this.updateStatus(); });
    this.socket.on('moved', d => {
      const o = this.others.get(d.id);
      if (o) { o.tx = d.x / PX_PER_M; o.tz = d.y / PX_PER_M; }
    });
    this.socket.on('join_error', async msg => {
      this.say3d(msg);
      if (msg.includes('log in')) { await sb.auth.signOut(); }
    });
    this.socket.on('kicked', () => this.say3d('Logged in somewhere else. Reload to play here.'));
    this.socket.on('full', () => this.say3d('Server is full. Try again later.'));
    this.socket.on('disconnect', () => this.say3d('Disconnected. Reconnecting...'));
    this.socket.on('connect_error', () => this.say3d('Cannot reach the server yet. Retrying...'));
  }

  addOther(p) {
    if (this.others.has(p.id)) return;
    const av = makeAvatar(0xd9822b);
    av.position.set(p.x / PX_PER_M, 0, p.y / PX_PER_M);
    this.setLabel(av, p.name);
    this.scene.add(av);
    this.others.set(p.id, { av, tx: p.x / PX_PER_M, tz: p.y / PX_PER_M });
  }

  removeOther(id) {
    const o = this.others.get(id);
    if (!o) return;
    this.scene.remove(o.av);
    this.others.delete(id);
  }

  updateStatus() { this.say3d('Online: ' + (this.others.size + 1)); }

  // ----- gate and progress -----
  applyGate() {
    const open = this.progress === 'indigene';
    this.gateClosed = !open;
    this.gateGroup.visible = !open;
    this.testButton.style.display = this.devTools ? 'block' : 'none';
    this.testButton.textContent = open ? 'Test: reset to arrived' : 'Test: become indigene';
  }

  toggleProgressTest() {
    if (!this.socket) return;
    this.socket.emit('dev_progress', this.progress === 'indigene' ? 'arrived' : 'indigene');
  }

  // ----- walking and collisions -----
  collide(pos) {
    const all = this.gateClosed ? this.boxes.concat([this.gateBox]) : this.boxes;
    for (const b of all) {
      const cx = THREE.MathUtils.clamp(pos.x, b.x0, b.x1);
      const cz = THREE.MathUtils.clamp(pos.z, b.z0, b.z1);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = PLAYER_RADIUS - d;
          pos.x += dx / d * push; pos.z += dz / d * push;
        } else {                       // centre is inside the box: push out the nearest side
          const l = pos.x - b.x0, r = b.x1 - pos.x, t = pos.z - b.z0, u = b.z1 - pos.z, m = Math.min(l, r, t, u);
          if (m === l) pos.x = b.x0 - PLAYER_RADIUS; else if (m === r) pos.x = b.x1 + PLAYER_RADIUS;
          else if (m === t) pos.z = b.z0 - PLAYER_RADIUS; else pos.z = b.z1 + PLAYER_RADIUS;
        }
      }
    }
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const k = this.keys;
    let ix = 0, iy = 0;                                   // ix = right, iy = forward
    if (k.KeyA || k.ArrowLeft) ix -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1;
    if (k.KeyW || k.ArrowUp) iy += 1;
    if (k.KeyS || k.ArrowDown) iy -= 1;
    if (this.stick.active) { ix = this.stick.x; iy = -this.stick.y; }
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }

    const { yaw } = this.cam;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);       // forward on the ground
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);        // right
    const vx = (fx * iy + rx * ix) * SPEED;
    const vz = (fz * iy + rz * ix) * SPEED;

    const p = this.player.position;
    p.x += vx * dt; p.z += vz * dt;
    p.x = THREE.MathUtils.clamp(p.x, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    this.collide(p);
    this.collide(p);

    const speed = Math.hypot(vx, vz);
    if (speed > 0.2) turnTowards(this.player, Math.atan2(vx, vz), dt);
    animateAvatar(this.player, speed, dt);
    for (const f of this.animators) f();

    // zone name
    const z = BUILDINGS.find(b => p.x >= b.zone.x0 && p.x <= b.zone.x1 && p.z >= b.zone.z0 && p.z <= b.zone.z1);
    this.zoneText.textContent = z ? z.name : 'Walking';

    // send position to the server (in the old pixel units)
    const now = performance.now();
    if (this.socket && this.socket.connected && this.myId && now - this.lastSent > SEND_EVERY_MS) {
      this.lastSent = now;
      this.socket.emit('move', { x: Math.round(p.x * PX_PER_M), y: Math.round(p.z * PX_PER_M), flip: false });
    }

    // other players glide to their latest position and face the way they walk
    const a = 1 - Math.exp(-12 * dt);
    this.others.forEach(o => {
      const dx = o.tx - o.av.position.x, dz = o.tz - o.av.position.z;
      o.av.position.x += dx * a; o.av.position.z += dz * a;
      const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001) * a;
      if (Math.hypot(dx, dz) > 0.02) turnTowards(o.av, Math.atan2(dx, dz), dt);
      animateAvatar(o.av, Math.min(sp, SPEED), dt);
    });

    // camera follows from behind and above
    const c = this.cam;
    const target = new THREE.Vector3(p.x, 1.5, p.z);
    const cp = Math.cos(c.pitch);
    const want = new THREE.Vector3(p.x + Math.sin(c.yaw) * cp * c.dist, 1.5 + Math.sin(c.pitch) * c.dist, p.z + Math.cos(c.yaw) * cp * c.dist);
    if (!this.look) { this.look = target.clone(); this.camera.position.copy(want); }
    const s = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(want, s);
    this.look.lerp(target, s);
    this.camera.lookAt(this.look);

    // buildings with an interior: show the room (and hide the outside model) while the player is inside it
    BUILDINGS.forEach(b => {
      if (!b.room) return;
      const inside = Math.abs(p.x - b.x) < b.room.halfW - 0.1 && Math.abs(p.z - b.z) < b.room.halfD - 0.1;
      if (inside !== b.inside) {
        b.inside = inside;
        b.room.setInside(inside);
        if (b.exterior) b.exterior.visible = !inside;
      }
      if (inside) b.room.setCamera(this.camera.position.x - b.x, this.camera.position.z - b.z);
    });

    // keep the sun's shadow box around the player
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.position.set(p.x + 30, 50, p.z + 20);

    this.renderer.render(this.scene, this.camera);
  }
}
