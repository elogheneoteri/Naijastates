// Temporary smoke test for the Node GLB export pipeline.
import { installDocumentShim } from './node_shims.mjs';
installDocumentShim();
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { makeMaterials, box, cyl, flatRoof, gableRoof, wallWithOpenings, waterTank, dstvDish, acUnit, exportGLB, optimizeGLB } from './lib.mjs';

const M = makeMaterials({ paint: '#c9b458', paint2: '#7a8c5c' });
const root = new THREE.Group();
root.name = 'smoke';
wallWithOpenings(root, M, { x0: -4, x1: 4, z: 3, th: 0.25, baseY: 0, h: 3.2, mat: 'wall', windows: [{ x0: -3, x1: -1.5, y0: 0.9, y1: 2.6, glass: true, grille: true }], doors: [{ x0: 1, x1: 2.4, y0: 0 }] });
box(root, M, 'wall', 8, 3.2, 0.25, 0, 1.6, -3, 'back');
flatRoof(root, M, -4.2, 4.2, -3.2, 3.2, 3.3);
waterTank(root, M, 2.5, -2, 1, true);
dstvDish(root, M, -2, 3.4, 0, 0.5);
acUnit(root, M, 0.5, 2.4, -2.9, -1);
writeFileSync('assets/buildings/_smoke_test.glb', (await (async () => {
  const raw = await exportGLB(root);
  return await optimizeGLB(raw);
})()));
console.log('SMOKE_OK');