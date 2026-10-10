// audit_world.mjs — read-only survey of the Naijastates world, written to assets/reports/world_audit.json.
// Lists: every plot in city.js (x, z, w, d, front, rotY), every BUILDINGS entry in game.js,
// BUILT_PLOTS, and every file in props/. Exits non-zero if required codes/props are missing.
// Usage: node scripts/audit_world.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- 1. city.js: import the real module so PLOTS (incl. frontOf/rotY) come from the actual code ---
const citySrc = fs.readFileSync(path.join(ROOT, 'city.js'), 'utf8');
const { PLOTS } = await import(path.join(ROOT, 'city.js'));
const builtPlotsMatch = citySrc.match(/const BUILT_PLOTS\s*=\s*\[([\s\S]*?)\];/);
const builtPlots = builtPlotsMatch ? (builtPlotsMatch[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.replace(/['"]/g, '')) : [];

// --- 2. game.js: parse the BUILDINGS array from source (game.js needs a browser, so no import) ---
const gameSrc = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
const arrStart = gameSrc.indexOf('const BUILDINGS');
if (arrStart < 0) throw new Error('BUILDINGS not found in game.js');
const bracket = gameSrc.indexOf('[', arrStart);

// Scan to the matching ']' while skipping strings, template literals and comments.
function skipString(src, i) {
  const q = src[i]; let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') j += 2;
    else if (src[j] === q) return j + 1;
    else j++;
  }
  return j;
}
function scanBalanced(src, start, open, close) {
  let depth = 0, i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(src, i); continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new Error('unbalanced brackets in BUILDINGS');
}
const arrEnd = scanBalanced(gameSrc, bracket, '[', ']');
const arrBody = gameSrc.slice(bracket + 1, arrEnd);

// Split into top-level { ... } entry objects.
const entries = [];
{
  let depth = 0, objStart = -1, i = 0;
  while (i < arrBody.length) {
    const ch = arrBody[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(arrBody, i); continue; }
    if (ch === '/' && arrBody[i + 1] === '/') { while (i < arrBody.length && arrBody[i] !== '\n') i++; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0) entries.push(arrBody.slice(objStart + 1, i)); }
    else if (ch === '[' || ch === ']') { /* braces-only split: ignore, entries are objects */ }
    i++;
  }
  if (depth !== 0) throw new Error('BUILDINGS entries did not parse cleanly');
}

const FIELD_PREFIX = (name) => new RegExp(`(^|[\\s,{])${name}\\s*:\\s*`);
function field(obj, name) {
  const m = obj.match(FIELD_PREFIX(name));
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  while (i < obj.length) {
    const ch = obj[i];
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) break;
    i++;
  }
  return obj.slice(m.index + m[0].length, i).trim();
}
function fieldBlock(obj, name) {
  // For fields whose value may contain commas/braces (boxes, fallback): grab until the matching close at depth 0.
  const m = obj.match(new RegExp(`(^|[\\s,{])${name}\\s*:\\s*`, 'm'));
  if (!m) return null;
  const startIdx = m.index + m[0].length;
  let depth = 0, i = startIdx;
  while (i < obj.length) {
    const ch = obj[i];
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') { depth--; if (depth === 0) return obj.slice(startIdx, i + 1).trim(); }
    else if (ch === ',' && depth === 0) return obj.slice(startIdx, i).trim();
    i++;
  }
  return obj.slice(startIdx).trim();
}

const buildings = entries.map((obj, i) => {
  const entry = {
    index: i,
    key: field(obj, 'key'),
    name: field(obj, 'name'),
    file: field(obj, 'file'),
    scale: field(obj, 'scale'),
    x: field(obj, 'x'),
    z: field(obj, 'z'),
    rotY: field(obj, 'rotY'),
    interior: field(obj, 'interior'),
    build: field(obj, 'build'),
    fallback: fieldBlock(obj, 'fallback'),
    boxesRaw: fieldBlock(obj, 'boxes'),
  };
  entry.boxesSource = entry.boxesRaw === null ? null :
    /^\[/.test(entry.boxesRaw) ? 'inline' : entry.boxesRaw.replace(/\s+/g, ' ');
  return entry;
});

// --- 3. props/ inventory ---
const propsDir = path.join(ROOT, 'props');
const props = fs.readdirSync(propsDir, { withFileTypes: true })
  .filter(d => d.isFile())
  .map(d => ({ file: d.name, bytes: fs.statSync(path.join(propsDir, d.name)).size }))
  .sort((a, b) => a.file.localeCompare(b.file));

// --- 5. self-check ---
const plotRows = PLOTS.map(p => ({ code: p.code, label: p.label, x: p.x, z: p.z, w: p.w, d: p.d, front: p.front, rotY: p.rotY }));
const report = {
  generatedAt: new Date().toISOString(),
  world: { width: 360, depth: 240, mainRoadZ: 28.75, avenuesX: [130, 230, 320], streetsZ: [95, 160, 215] },
  plots: plotRows,
  plotsByCode: Object.fromEntries(plotRows.map(p => [p.code, p])),
  builtPlots,
  buildings,
  props,
};
const outDir = path.join(ROOT, 'assets', 'reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'world_audit.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');

// --- 5. self-check ---
const codes = new Set(report.plots.map(p => p.code));
const required = ['airport', 'oil_well', 'rural'];
const missing = required.filter(c => !codes.has(c));
const propCount = props.length;
if (missing.length) { console.error('FAIL: missing plot codes:', missing); process.exit(1); }
if (propCount < 1) { console.error('FAIL: no props listed'); process.exit(1); }
console.log(`OK world_audit.json: ${report.plots.length} plots, ${buildings.length} BUILDINGS entries, ${builtPlots.length} built plots, ${propCount} props -> ${path.relative(ROOT, outFile)}`);