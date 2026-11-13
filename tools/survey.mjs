import fs from 'fs';
import { loadSrc } from './load.mjs';
const { IFC } = loadSrc(['ifc.js'], ['IFC']);
const file = process.argv[2];
const t0 = Date.now();
const m = IFC.parse(fs.readFileSync(file, 'utf8'));
console.log('parsed', m.ents.size, 'entities in', Date.now() - t0, 'ms; length scale', m.lengthScale, 'angle', m.angleScale);
const types = ['IFCWALLSTANDARDCASE','IFCWALL','IFCDOOR','IFCWINDOW','IFCSLAB','IFCROOF','IFCCOVERING','IFCBEAM','IFCSTAIR','IFCRAILING','IFCFLOWTERMINAL','IFCFURNISHINGELEMENT','IFCENERGYCONVERSIONDEVICE','IFCBUILDINGELEMENTPROXY','IFCFLOWSEGMENT'];
let fail = 0, total = 0;
const bbAll = { mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] };
const rows = [];
const t1 = Date.now();
for (const t of types) for (const e of m.all(t)) {
  total++;
  let g;
  try { g = m.productPolys(e.id); } catch (err) { fail++; console.log('FAIL', t, e.a[2], err.message); continue; }
  const polys = g.flatMap(x => x.polys);
  if (!polys.length) { rows.push([t, e.a[2], 'EMPTY']); continue; }
  const bb = IFC.bboxOf(polys);
  for (let k = 0; k < 3; k++) { bbAll.mn[k] = Math.min(bbAll.mn[k], bb.mn[k]); bbAll.mx[k] = Math.max(bbAll.mx[k], bb.mx[k]); }
  const st = m.storeyOf(e.id);
  rows.push([t, (e.a[2]||'').replace(/:\d+$/, '').slice(0, 60), st ? st.a[2] : '-', bb.mn.map(v=>v.toFixed(2)).join(','), bb.mx.map(v=>v.toFixed(2)).join(','), polys.length, g[0].style ? g[0].style.rgb.map(v=>v.toFixed(2)).join('/') : 'nostyle']);
}
console.log('geometry for', total, 'elements in', Date.now() - t1, 'ms; failures', fail);
console.log('overall bbox', bbAll.mn.map(v=>v.toFixed(2)), bbAll.mx.map(v=>v.toFixed(2)));
if (process.argv[3] === 'rows') for (const r of rows) console.log(r.join(' | '));
