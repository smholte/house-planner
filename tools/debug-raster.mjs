import fs from 'fs';
import { loadSrc } from './load.mjs';
const lib = loadSrc(['util.js', 'model.js', 'ifc.js', 'ifc2house.js'], ['IFC', 'IfcHouse']);
const files = process.argv.slice(2);
const models = files.map(f => lib.IFC.parse(fs.readFileSync(f, 'utf8')));
lib.IfcHouse.convert(models, { debugRaster: (name, R) => {
  if (!/Tweede/.test(name)) return;
  fs.writeFileSync('/tmp/claude-0/-home-claude/d1cd8a19-bb20-52ed-a0c2-031844f52589/scratchpad/raster.bin', Buffer.from(R.solid));
  fs.writeFileSync('/tmp/claude-0/-home-claude/d1cd8a19-bb20-52ed-a0c2-031844f52589/scratchpad/raster.json', JSON.stringify({ W: R.W, H: R.H, ox: R.ox, oy: R.oy, res: R.res }));
} });
