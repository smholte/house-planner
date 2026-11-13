// Node helper: load three.js + src/ifc.js (+ optionally other src files) into one scope
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = process.env.THREE_DIR || path.join(here, '..', 'vendor', 'three');
export const THREE = await import(path.join(THREE_DIR, 'build/three.module.min.js'));
export function loadSrc(files, exportsList) {
  const code = files.map(f => fs.readFileSync(path.join(here, '..', 'src', f), 'utf8')).join('\n');
  return new Function('THREE', code + '\nreturn {' + exportsList.join(',') + '};')(THREE);
}
