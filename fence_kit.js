// fence_kit.js  (a fence with stone pillars, a low stone wall, black iron railings and an arched double gate that swings open when you walk up to it)
//
// This is a KIT: it is not tied to any compound. Any compound file (hotel, government, ...) can call it with its own fence lines.
//
//   import { buildFenceKit } from './fence_kit.js';
//   const fence = buildFenceKit({
//     runs:  [[x0, z0, x1, z1], ...],                 // each side of the fence, in WORLD metres (straight along x or along z)
//     gates: [{ x: 168, z: 37, inside: 'south' }]     // a gate standing on one of the runs; 'inside' = the way the gate leaves swing open
//   });
//   scene.add(fence.group);                           // the fence itself
//   fence.boxes                                       // solid fence lines, WORLD metres: [minX, maxX, minZ, maxZ]  (add to your collision list)
//   fence.liveBoxes                                   // the gate leaves: objects {x0,x1,z0,z1} that switch themselves off while the gate is open
//   fence.update(playerX, playerZ, dt)                // call every frame: opens / closes the gate, hides far-away fence pieces
//
// The gate is 5.1 m between its two tall pillars (4.7 m clear, wide enough for a car), 3 m tall at the arch.
// Fence height 1.9 m, gate pillars 2.3 m.
// FILE: compound_fence.glb in the props folder (1 MB: 6 small parts, cut out of your fence_baking.glb and sized in metres).
//   Part names inside the file:  pillar, panel, gatepillar, gatestatic, leafL, leafR   (each has a __Wall (stone) and a __Metal (iron) mesh)
//
// KEEPING THE GAME FAST
//   * every pillar and panel is a copy of the same meshes (InstancedMesh), in groups of 10 so far-away groups can be hidden
//   * groups further than SHOW_DIST metres from the player are not drawn
//
// THINGS YOU MAY WANT TO CHANGE
//   OPEN_DIST   how close you must be for the gate to open       SHOW_DIST   how far away the fence is still drawn
//   OPEN_ANGLE  how wide the leaves swing                        TINT_*      colours are set in the .glb (stone beige, iron black)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS_DIR } from './props_library.js';

const FILE = PROPS_DIR + 'compound_fence.glb';
const PITCH = 1.9327;            // pillar to pillar along the fence
const GATE_HALF = 2.569;         // from the middle of the gate to the middle of each gate pillar
const HINGE = 2.345;             // from the middle of the gate to each hinge
const OPEN_DIST = 7, SHOW_DIST = 110, OPEN_ANGLE = THREE.MathUtils.degToRad(100), OPEN_SPEED = 1.6;   // OPEN_SPEED: radians per second
const CHUNK = 10;                // panels per group
const HALF_T = 0.25;             // half thickness of the solid fence line

const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

export function buildFenceKit({ runs = [], gates = [] } = {}) {
  const group = new THREE.Group();
  const boxes = [], liveBoxes = [], chunks = [], gateObjs = [];
  const pillars = [], panels = [];                      // [x, z, rot, scaleAlong]
  const seen = new Set();
  const addPillar = (x, z, rot) => { const k = Math.round(x * 10) + ',' + Math.round(z * 10); if (seen.has(k)) return; seen.add(k); pillars.push([x, z, rot, 1]); };

  // ----- the gates: position, turn, and the leaves' solid boxes -----
  const gateSpecs = gates.map(g => {
    const axis = g.axis || 'x';                          // which way the fence line runs where the gate stands
    let rot = axis === 'x' ? 0 : -Math.PI / 2;
    const d = DIRS[g.inside || 'south'];
    if (Math.sin(rot) * d[0] + Math.cos(rot) * d[1] < 0) rot += Math.PI;        // turn the gate so the leaves swing to the 'inside'
    const ux = Math.cos(rot), uz = -Math.sin(rot);
    return { x: g.x, z: g.z, axis, rot, ux, uz };
  });

  // ----- the fence lines, cut where a gate stands -----
  runs.forEach(([x0, z0, x1, z1]) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (len < 0.1) return;
    const ux = dx / len, uz = dz / len, rot = Math.atan2(-uz, ux);
    const onRun = gateSpecs.filter(g => Math.abs((g.x - x0) * -uz + (g.z - z0) * ux) < 0.3 && ((g.x - x0) * ux + (g.z - z0) * uz) > 0 && ((g.x - x0) * ux + (g.z - z0) * uz) < len)
      .map(g => ({ g, t: (g.x - x0) * ux + (g.z - z0) * uz })).sort((a, b) => a.t - b.t);
    const segs = []; let t = 0, startIsGate = false;
    onRun.forEach(({ t: gt }) => { segs.push([t, gt - GATE_HALF, startIsGate, true]); t = gt + GATE_HALF; startIsGate = true; });
    segs.push([t, len, startIsGate, false]);
    segs.forEach(([a, b, aGate, bGate]) => {
      const L = b - a; if (L < 0.5) return;
      const n = Math.max(1, Math.round(L / PITCH)), step = L / n;
      for (let k = 0; k < n; k++) panels.push([x0 + ux * (a + step * (k + 0.5)), z0 + uz * (a + step * (k + 0.5)), rot, step / PITCH]);
      for (let k = 0; k <= n; k++) { if ((k === 0 && aGate) || (k === n && bGate)) continue; addPillar(x0 + ux * (a + step * k), z0 + uz * (a + step * k), rot); }
      // solid line (straight along x or along z only)
      const sx0 = x0 + ux * a, sz0 = z0 + uz * a, sx1 = x0 + ux * b, sz1 = z0 + uz * b;
      boxes.push([Math.min(sx0, sx1) - HALF_T, Math.max(sx0, sx1) + HALF_T, Math.min(sz0, sz1) - HALF_T, Math.max(sz0, sz1) + HALF_T]);
    });
  });

  gateSpecs.forEach(g => {                               // the closed gate is solid between its two pillars until it opens
    const hx = Math.abs(g.ux) > 0.5 ? GATE_HALF : HALF_T, hz = Math.abs(g.uz) > 0.5 ? GATE_HALF : HALF_T;
    const box = { x0: g.x - hx, x1: g.x + hx, z0: g.z - hz, z1: g.z + hz, _on: [g.x - hx, g.x + hx, g.z - hz, g.z + hz] };
    g.box = box; liveBoxes.push(box);
    const px = g.ux * GATE_HALF, pz = g.uz * GATE_HALF;
    boxes.push([g.x + px - 0.3, g.x + px + 0.3, g.z + pz - 0.3, g.z + pz + 0.3], [g.x - px - 0.3, g.x - px + 0.3, g.z - pz - 0.3, g.z - pz + 0.3]);   // the two tall pillars always stay solid
  });

  // ----- load the parts and make the copies -----
  new GLTFLoader().load(FILE, gltf => {
    const parts = {};                                     // name -> [{ geometry, material }]
    gltf.scene.traverse(o => { if (o.isMesh) { const [name] = o.name.split('__'); (parts[name] = parts[name] || []).push({ geometry: o.geometry, material: o.material }); } });
    const missing = ['pillar', 'panel', 'gatepillar', 'gatestatic', 'leafL', 'leafR'].filter(n => !parts[n]);
    if (missing.length) { console.warn('fence_kit: ' + FILE + ' is missing parts: ' + missing.join(', ')); return; }
    parts.pillar.concat(parts.panel, parts.gatepillar, parts.gatestatic, parts.leafL, parts.leafR).forEach(p => { if (p.material.map) p.material.map.anisotropy = 4; });

    const o = new THREE.Object3D(), mat4 = new THREE.Matrix4();
    const makeChunk = (list, partName) => {              // one group of copies (all meshes of one part)
      const holder = new THREE.Group(); let cx = 0, cz = 0;
      list.forEach(([x, z]) => { cx += x; cz += z; });
      holder.userData.c = [cx / list.length, cz / list.length];
      parts[partName].forEach(p => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, list.length);
        list.forEach(([x, z, rot, sx], i) => {
          o.position.set(x, 0, z); o.rotation.set(0, rot, 0); o.scale.set(sx, 1, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        });
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; holder.add(im);
      });
      group.add(holder); chunks.push(holder);
    };
    for (let i = 0; i < pillars.length; i += CHUNK) makeChunk(pillars.slice(i, i + CHUNK), 'pillar');
    for (let i = 0; i < panels.length; i += CHUNK) makeChunk(panels.slice(i, i + CHUNK), 'panel');

    // the gates: two tall pillars, the hinges, and two leaves that swing round their hinges
    gateSpecs.forEach(g => {
      const root = new THREE.Group(); root.position.set(g.x, 0, g.z); root.rotation.y = g.rot; group.add(root);
      const add = (partName, x, parent) => { const h = new THREE.Group(); h.position.x = x; parts[partName].forEach(p => { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = false; h.add(m); }); (parent || root).add(h); return h; };
      add('gatepillar', -GATE_HALF); add('gatepillar', GATE_HALF); add('gatestatic', 0);
      g.leafL = add('leafL', -HINGE); g.leafR = add('leafR', HINGE); g.open = 0; g.target = 0;
      gateObjs.push(g);
    });
  }, undefined, e => console.warn('fence_kit: could not load ' + FILE, e));

  // ----- every frame -----
  const update = (px, pz, dt = 0.016) => {
    chunks.forEach(c => { const dx = c.userData.c[0] - px, dz = c.userData.c[1] - pz; c.visible = dx * dx + dz * dz < SHOW_DIST * SHOW_DIST; });
    gateObjs.forEach(g => {
      const near = Math.hypot(g.x - px, g.z - pz) < (g.open > 0.01 ? OPEN_DIST + 1 : OPEN_DIST);      // a little extra room so it does not flutter at the edge
      g.target = near ? 1 : 0;
      const step = OPEN_SPEED * dt / OPEN_ANGLE;
      g.open = g.target > g.open ? Math.min(g.target, g.open + step) : Math.max(g.target, g.open - step);
      const e = g.open * g.open * (3 - 2 * g.open);       // ease in and out
      g.leafL.rotation.y = -e * OPEN_ANGLE; g.leafR.rotation.y = e * OPEN_ANGLE;      // inside = local +z, so the free edges swing towards +z
      const solid = g.open < 0.35, b = g.box;              // the gate blocks you until it is mostly open
      if (solid) { [b.x0, b.x1, b.z0, b.z1] = b._on; } else { b.x0 = b.x1 = b.z0 = b.z1 = -1e5; }
    });
  };
  return { group, boxes, liveBoxes, update };
}
