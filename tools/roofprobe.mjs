import fs from 'fs';
import { loadSrc } from './load.mjs';
const { IFC } = loadSrc(['ifc.js'], ['IFC']);
const m = IFC.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const e of m.all('IFCROOF')) {
  const name = e.a[2];
  const pds = m.get(e.a[6]);
  const reps = (pds.a[2]||[]).map(r => m.get(r));
  console.log('ROOF', name, reps.map(r => r.a[1] + '/' + r.a[2] + ':' + r.a[3].map(i => m.get(i).t).join(',')).join(' ; '));
  const inv = m.inverse();
  // parts aggregated into the roof?
  const parts = m.all('IFCRELAGGREGATES').filter(r => r.a[4].id === e.id).flatMap(r => r.a[5].map(x => m.get(x)));
  for (const p of parts) console.log('   part', p.t, p.a[2]);
  const polys = m.productPolys(e.id).flatMap(g => g.polys);
  if (!/puntkap/.test(name)) continue;
  // vertical probe at X = 1.0 (IFC), along Y
  for (let Y = 38.0; Y <= 47.2; Y += 0.4) {
    const zs = [];
    for (const p of polys) for (let i = 1; i < p.vs.length - 1; i++) {
      const [a, b, c] = [p.vs[0], p.vs[i], p.vs[i + 1]];
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-9) continue;
      const l1 = ((b[1] - c[1]) * (1.0 - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det;
      const l2 = ((c[1] - a[1]) * (1.0 - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      zs.push((l1 * a[2] + l2 * b[2] + l3 * c[2]).toFixed(2) + (p.plane.n[2] > 0 ? '^' : 'v'));
    }
    console.log('Y', Y.toFixed(1), zs.sort().join(' '));
  }
}
