// node tools/convert.mjs IND.ifc GEV.ifc [config.json] → writes OUT (json)
import fs from 'fs';
import zlib from 'zlib';
import { loadSrc } from './load.mjs';
const lib = loadSrc(['util.js', 'model.js', 'ifc.js', 'ifc2house.js'], ['IFC', 'IfcHouse', 'roomArea', 'polygonArea', 'labelPoint']);
const { IFC, IfcHouse } = lib;
const files = process.argv.slice(2).filter(f => f.endsWith('.ifc'));
const cfgFile = process.argv.slice(2).find(f => f.endsWith('.json'));
const cfg = cfgFile ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const t0 = Date.now();
const models = files.map(f => IFC.parse(fs.readFileSync(f, 'utf8')));
const res = IfcHouse.convert(models, { ...cfg, debugStorage: !!process.env.DBG, log: s => console.log('  ' + s) });
console.log('converted in', Date.now() - t0, 'ms');
for (const st of res.storeys) {
  console.log(`== ${st.name} elev ${st.elevation} wallH ${st.wallHeight} height ${st.height}`);
  for (const r of res.plan.rooms.filter(r => r.storey === st.id)) {
    const lp = lib.labelPoint(r.poly);
    const X = lp[0] + res.origin.X0, Y = res.origin.Y1 - lp[1];
    console.log(`   ${r.name.padEnd(22)} ${lib.roomArea(r).toFixed(2).padStart(6)} m²  at IFC [${X.toFixed(2)}, ${Y.toFixed(2)}]  floor ${r.floor.material} ${r.wallColorName}`);
  }
}
const pack = IfcHouse.packShell(res.shell);
const shellJson = JSON.stringify(pack);
const gz = zlib.gzipSync(Buffer.from(shellJson), { level: 9 });
let tris = 0; for (const g of Object.values(res.shell.storeys)) for (const a of Object.values(g)) tris += a.length / 9;
console.log('shell triangles', Math.round(tris), 'json', (shellJson.length / 1024).toFixed(0), 'KB, gzip', (gz.length / 1024).toFixed(0), 'KB');
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ storeys: res.storeys, plan: res.plan, origin: res.origin, shellGz: gz.toString('base64') }));
