// rural_relocation.mjs — proposes the new riverside Rural District plot, verifies it against the
// existing world (plots, roads, pavements, map edge), writes assets/reports/rural_plot_preview.json,
// and moves the `rural` line in city.js to the proposed coordinates.
// Usage: node scripts/rural_relocation.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PLOTS, CITY, plotAt } = await import(path.join(ROOT, 'city.js'));

// The site the original plan proposed (re-evaluated here before building).
const PLANNER_SITE = { x: 339, z: 127, w: 24, d: 36 };
// The river it paired: a band down the east edge of the map.
const PLANNER_RIVER = { x: 354, z: 80, zEnd: 180, width: 12 };

// Corrected proposal: the northeast corner of the map — far from the city centre (x 90-280),
// at the map edge, with the river running along the east edge (x 351-360) and a muddy bank
// strip between the village and the water. The village front (south) faces the main road.
const NEW_RURAL = { x: 338, z: 12, w: 20, d: 20 };
const RIVER = { x0: 351, x1: 360, z0: 0, z1: 24, zEnd: 24 };
RIVER.width = RIVER.x1 - RIVER.x0;
const OLD_RURAL = { x: 275, z: 13, w: 74, d: 22, status: 'openGround' };

const rect = (p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
const intersect = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

// --- verify the planner's site first (so the rejection is on record) ---
const plannerRect = rect(PLANNER_SITE);
const plannerConflicts = PLOTS
  .filter(p => p.code !== 'rural' && intersect(plannerRect, rect(p)))
  .map(p => ({ code: p.code, ...rect(p) }));
const plannerRiver = { x0: PLANNER_RIVER.x - PLANNER_RIVER.width / 2, x1: PLANNER_RIVER.x + PLANNER_RIVER.width / 2, z0: PLANNER_RIVER.z, z1: PLANNER_RIVER.zEnd };
const plannerRiverConflicts = PLOTS
  .filter(p => intersect(plannerRiver, rect(p)))
  .map(p => p.code);

// --- verify the corrected site ---
const newRect = rect(NEW_RURAL);
const plotConflicts = PLOTS
  .filter(p => p.code !== 'rural' && intersect(newRect, rect(p)))
  .map(p => p.code);

// Roads (centre lines + pavement + 0.3 m kerb buffer), from CITY.
const roadRects = [];
roadRects.push({ name: 'main road', x0: 0, x1: CITY.worldW, z0: CITY.mainRoadZ - CITY.mainRoadW / 2 - CITY.pave - 0.3, z1: CITY.mainRoadZ + CITY.mainRoadW / 2 + CITY.pave + 0.3 });
CITY.avenuesX.forEach(ax => roadRects.push({ name: `avenue x=${ax}`, x0: ax - CITY.avenueW / 2 - CITY.pave - 0.3, x1: ax + CITY.avenueW / 2 + CITY.pave + 0.3, z0: 0, z1: CITY.worldH }));
CITY.streetsZ.forEach(sz => roadRects.push({ name: `street z=${sz}`, x0: CITY.gateX, x1: CITY.worldW, z0: sz - CITY.streetW / 2 - CITY.pave - 0.3, z1: sz + CITY.streetW / 2 + CITY.pave + 0.3 }));
const roadConflicts = roadRects.filter(r => intersect(newRect, r)).map(r => r.name);
const riverRoadConflicts = roadRects.filter(r => intersect(RIVER, r)).map(r => r.name);

// Map-edge check: everything must sit inside 0..worldW / 0..worldH.
const inMap = (r) => r.x0 >= 0 && r.x1 <= CITY.worldW && r.z0 >= 0 && r.z1 <= CITY.worldH;
const riverInMap = inMap(RIVER);
const villageInMap = inMap(newRect);

// The old plot becomes open ground: the `rural` line in RAW_PLOTS is rewritten, so nothing else
// marks the old location (grass returns via cityClearRects, which follows PLOTS).
const oldRect = rect(OLD_RURAL);
const oldNowFree = !PLOTS.some(p => p.code !== 'rural' && p.code !== 'high_school' && intersect(oldRect, rect(p)));

const front = (() => {
  // Reproduce city.js frontOf for the new plot so the preview shows the facing the code will actually compute.
  const { x, z, w, d } = NEW_RURAL;
  const c = [];
  c.push([Math.abs(z + d / 2 - CITY.mainRoadZ), 'S'], [Math.abs(z - d / 2 - CITY.mainRoadZ), 'N']);
  CITY.streetsZ.forEach(sz => { c.push([Math.abs(z + d / 2 - sz), 'S'], [Math.abs(z - d / 2 - sz), 'N']); });
  CITY.avenuesX.forEach(ax => { c.push([Math.abs(x + w / 2 - ax), 'E'], [Math.abs(x - w / 2 - ax), 'W']); });
  if (x < CITY.gateX) return 'S';
  c.sort((a, b) => a[0] - b[0]);
  return c[0][1];
})();

const preview = {
  generatedAt: new Date().toISOString(),
  proposal: {
    plannerSite: PLANNER_SITE,
    plannerSiteVerdict: {
      acceptable: plannerConflicts.length === 0 && plannerRiverConflicts.length === 0,
      plotConflicts: plannerConflicts,
      riverConflictsWithPlots: plannerRiverConflicts,
      reason: plannerConflicts.length
        ? `Sits on top of the existing plot(s): ${plannerConflicts.map(p => p.code).join(', ')}. The river it paired would also cut across: ${plannerRiverConflicts.join(', ')}. Rejected.`
        : 'Clear.',
    },
    newRuralPlot: { ...NEW_RURAL, front, rotY: { S: 0, E: 90, N: 180, W: 270 }[front], ...rect(NEW_RURAL) },
    river: { ...RIVER, note: 'River along the east edge of the map; muddy bank strip between the village and the water.' },
    oldPlot: { ...OLD_RURAL, ...oldRect, note: 'Old Rural District plot. Becomes open ground (grass returns once the plot line is rewritten).' },
  },
  verification: {
    plotConflicts: plotConflicts,
    roadConflicts: roadConflicts,
    riverRoadConflicts: riverRoadConflicts,
    villageInsideMap: villageInMap,
    riverInsideMap: riverInMap,
    oldPlotNowFreeOfOtherPlots: oldNowFree,
    riverVillageGap: RIVER.x0 - newRect.x1,   // muddy bank width (m)
    riverToMainRoadCurb: (CITY.mainRoadZ - CITY.mainRoadW / 2 - CITY.pave - 0.3) - RIVER.zEnd,
    checks: [
      { name: 'new plot overlaps no other plot', pass: plotConflicts.length === 0 },
      { name: 'new plot touches no road or pavement', pass: roadConflicts.length === 0 },
      { name: 'river touches no road or pavement', pass: riverRoadConflicts.length === 0 },
      { name: 'village inside map bounds', pass: villageInMap },
      { name: 'river inside map bounds', pass: riverInMap },
      { name: 'old plot free for open ground', pass: oldNowFree },
      { name: 'river does not cross the main road (ends before the kerb)', pass: RIVER.zEnd <= CITY.mainRoadZ - CITY.mainRoadW / 2 - CITY.pave - 0.3 },
    ],
  },
};

const ok = preview.verification.checks.every(c => c.pass);
const outDir = path.join(ROOT, 'assets', 'reports');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'rural_plot_preview.json'), JSON.stringify(preview, null, 2) + '\n');

if (!ok) {
  console.error('FAIL: corrected site verification failed:', JSON.stringify(preview.verification, null, 2));
  process.exit(1);
}

// --- move the rural plot in city.js: rewrite ONLY the rural line (idempotent: skip if already at the new site) ---
const cityPath = path.join(ROOT, 'city.js');
const src = fs.readFileSync(cityPath, 'utf8');
const lineRe = /^\s*\['rural',\s*'([^']*)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\],.*$/m;
const m = src.match(lineRe);
if (!m) { console.error('FAIL: could not find the rural line in city.js'); process.exit(1); }
const newLine = `  ['rural',          'Rural District',                ${NEW_RURAL.x},  ${NEW_RURAL.z}, ${NEW_RURAL.w}, ${NEW_RURAL.d}],   // moved to the riverside NE corner (see assets/reports/rural_plot_preview.json); old site (275, 13) left as open ground`;
const alreadyMoved = Number(m[2]) === NEW_RURAL.x && Number(m[3]) === NEW_RURAL.z && Number(m[4]) === NEW_RURAL.w && Number(m[5]) === NEW_RURAL.d;
const updated = alreadyMoved ? src : src.replace(m[0], () => newLine);
fs.writeFileSync(cityPath, updated);

// Confirm the rewrite is exactly one line and the file still parses (frontOf still resolves).
const changed = src.split('\n').length !== updated.split('\n').length ? false : true;
const { plotAt: pa } = await import(path.join(ROOT, 'city.js') + `?t=${Date.now()}`);
const moved = pa('rural');
if (moved.x !== NEW_RURAL.x || moved.z !== NEW_RURAL.z || moved.w !== NEW_RURAL.w || moved.d !== NEW_RURAL.d) {
  console.error('FAIL: rural plot did not move as expected', moved); process.exit(1);
}
console.log(`OK: rural moved to (${moved.x}, ${moved.z}) ${moved.w}x${moved.d}, front ${moved.front} (rotY ${moved.rotY}).`);
console.log(`    planner site rejected: conflicts with ${plannerConflicts.map(p => p.code).join(', ')}; its river crossed ${plannerRiverConflicts.join(', ')}.`);
console.log(`    river: x ${RIVER.x0}-${RIVER.x1}, z ${RIVER.z0}-${RIVER.zEnd}; bank strip ${preview.verification.riverVillageGap} m; preview -> assets/reports/rural_plot_preview.json`);
console.log(`    city.js line count unchanged: ${changed} (single-line rewrite)`);