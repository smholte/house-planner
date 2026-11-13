import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
process.env.THREE_DIR = process.env.THREE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'three');
const { loadSrc } = await import('../load.mjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const L = loadSrc(['util.js', 'model.js', 'ifc.js', 'ifc2house.js'], ['IFC', 'IfcHouse', 'roomArea']);
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'rooms.json'), 'utf8'));
const m = L.IFC.parse(fs.readFileSync(path.join(here, 'testhouse.ifc'), 'utf8'));
const res = L.IfcHouse.convert([m], { ...cfg, log: s => console.log(s) });
for (const s of res.storeys) {
  console.log('==', s.name, s.elevation, s.height, s.wallHeight);
  for (const r of res.plan.rooms.filter(r => r.storey === s.id)) console.log('  room', r.name, L.roomArea(r).toFixed(2));
  const ws = res.plan.walls.filter(w => w.storey === s.id);
  console.log('  walls', ws.length, ws.map(w => w.kind[0] + (w.leaf ? w.leaf[0] : '') + (w.knee ? 'K' : '') + (w.load ? 'L' : '')).join(' '));
  const ops = res.plan.openings.filter(o => ws.some(w => w.id === o.wall));
  console.log('  openings', ops.map(o => o.kind + (o.leaf ? '*' : '') + (o.leaves ? '2' : '') + ':' + o.w.toFixed(2)).join(' '));
}
console.log('voids', res.plan.voids.length, 'shell mats', Object.keys(res.shell.materials).length, Object.keys(res.shell.materials).join(' | '));
