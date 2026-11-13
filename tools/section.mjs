// horizontal sections through both models → segments JSON for drawing
import fs from 'fs';
import { loadSrc } from './load.mjs';
const { IFC } = loadSrc(['ifc.js'], ['IFC']);
const files = process.argv.slice(2, 4);
const levels = JSON.parse(process.argv[4]);   // [z,...]
const out = { levels, segs: [] };
const types = ['IFCWALLSTANDARDCASE','IFCWALL','IFCDOOR','IFCSLAB','IFCROOF','IFCCOVERING','IFCBEAM','IFCSTAIR','IFCRAILING','IFCFURNISHINGELEMENT','IFCFLOWTERMINAL'];
for (const [fi, f] of files.entries()) {
  const m = IFC.parse(fs.readFileSync(f, 'utf8'));
  for (const t of types) for (const e of m.all(t)) {
    const name = (e.a[2] || '').replace(/:\d+$/, '');
    if (/Maaiveld|Model Text|orientatie/.test(name)) continue;
    const groups = m.productPolys(e.id);
    for (const g of groups) {
      const tris = IFC.polysToTris(g.polys);
      for (const [li, z] of levels.entries()) {
        for (let i = 0; i < tris.length; i += 3) {
          const pts = [];
          for (let k = 0; k < 3; k++) {
            const a = tris[i + k], b = tris[i + (k + 1) % 3];
            if ((a[2] - z) * (b[2] - z) < 0) { const t = (z - a[2]) / (b[2] - a[2]); pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
          }
          if (pts.length === 2) out.segs.push([li, fi, t, name.slice(0, 40), pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
        }
      }
    }
  }
}
fs.writeFileSync(process.env.OUT, JSON.stringify(out));
console.log('segments', out.segs.length);
