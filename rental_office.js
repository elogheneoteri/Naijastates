// rental_office.js  (the Rental Office plot)
//
// Exports:  buildRentalOffice() -> { group }      RENTAL_BOXES -> solid parts for collisions
//
// LOCAL SPACE is the same as the other buildings: the plot centre is (0,0), the front / road side is +Z, the back is -Z, +X is east.
// game.js turns the whole building to face the nearest road (the main road, so this one faces NORTH, rotY 180).
//
// rental_office.glb (put it next to line_house.glb, in the main folder) is your base_basic model, made smaller for the game:
//   0.35 MB instead of 7 MB (texture 2048 -> 1024 px, the normal and metal maps are not needed, 20,000 -> 5,500 triangles),
//   already sized in metres (11.39 m wide, 9.79 m deep, 5.35 m tall), centred on x/z, base at y = 0, door and signboard on its +Z side.
//   The green signboard above the door now reads RENTAL OFFICE (the text is part of the file, nothing is drawn in code).
//
// THINGS YOU MAY WANT TO CHANGE
//   FRONT_GAP     how far the front of the building stands from the front edge of the plot (the road side)
//   GRASS_TUFTS   how many small grass tufts are scattered on the sand around it; 0 = none
// The ground is the world's red sand: city.js no longer lays a grey pad under this plot.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILE = 'rental_office.glb';
const W = 11.39, D = 9.79;                       // size of the building in metres (from the file)
const PLOT_W = 26, PLOT_D = 22;                  // the plot (from city.js)
const FRONT_GAP = 3.2;
const BZ = PLOT_D / 2 - FRONT_GAP - D / 2;       // z of the building centre: the building leans towards the road
const GRASS_TUFTS = 60;

// solid walls: the wall is a little smaller than the roof, which hangs over your head (x +-4.9, z from the back wall to the front steps)
export const RENTAL_BOXES = [[-4.9, 4.9, BZ - 4.2, BZ + 4.3]];

function paintTuft(ctx, S) {                     // a small fan of grass blades on a transparent card (same as the line houses)
  ctx.clearRect(0, 0, S, S);
  const greens = ['#5f8f2e', '#6f9c36', '#4d7d28', '#7fa83f', '#86a845'];
  for (let i = 0; i < 16; i++) {
    const x0 = S * (0.30 + 0.40 * ((i * 0.6180339) % 1)), lean = (((i * 0.4142) % 1) - 0.5) * S * 0.55, h = S * (0.50 + 0.42 * ((i * 0.7321) % 1));
    ctx.strokeStyle = greens[i % greens.length]; ctx.lineWidth = S * 0.045; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, S * 0.98); ctx.quadraticCurveTo(x0 + lean * 0.3, S * 0.98 - h * 0.6, x0 + lean, S * 0.98 - h); ctx.stroke();
  }
}

function addTufts(group) {
  if (!GRASS_TUFTS) return;
  let seed = 20261027;                           // fixed seed: the tufts are in the same places every time
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const PX = PLOT_W / 2, PZ = PLOT_D / 2, spots = [];
  for (let tries = 0; spots.length < GRASS_TUFTS && tries < 4000; tries++) {
    const x = (rnd() * 2 - 1) * (PX + 1.2), z = (rnd() * 2 - 1) * (PZ + 1.2);
    if (z > PZ + 0.2) continue;                                                              // not onto the pavement of the road
    if (x > -W / 2 - 0.9 && x < W / 2 + 0.9 && z > BZ - D / 2 - 0.9 && z < BZ + D / 2 + 0.9) continue;   // not against the walls
    if (Math.abs(x) < 2.2 && z > BZ) continue;                                               // keep the walk to the door clear
    spots.push([x, z]);
  }
  const c = document.createElement('canvas'); c.width = c.height = 128; paintTuft(c.getContext('2d'), 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  [0, Math.PI / 2].forEach(rot => {                                                          // two crossed cards per tuft
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.4).translate(0, 0.2, 0).rotateY(rot), mat, spots.length), m = new THREE.Object3D(), col = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = 0.6 + rnd() * 0.7; m.position.set(x, -0.03, z); m.rotation.y = rnd() * 3.14; m.scale.set(k, k * (0.8 + rnd() * 0.5), k); m.updateMatrix();
      im.setMatrixAt(i, m.matrix); const t = 0.8 + rnd() * 0.35; im.setColorAt(i, col.setRGB(t, t, t * 0.92));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; group.add(im);
  });
}

export function buildRentalOffice() {
  const group = new THREE.Group();
  addTufts(group);
  new GLTFLoader().load(FILE, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    gltf.scene.position.set(0, 0, BZ);
    group.add(gltf.scene);
  }, undefined, e => {
    console.warn('rental_office: could not load ' + FILE, e);          // a plain block so the game keeps running
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, 4, D), new THREE.MeshStandardMaterial({ color: 0xe8d4b6 }));
    b.position.set(0, 2, BZ); group.add(b);
  });
  return { group };
}
