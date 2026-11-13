// Pack the Kenney Furniture Kit (or any folder of .glb models) into build/models.json, the app's built-in
// model library:
//   node tools/pack-models.mjs "<folder with .glb files>" [config.json] [out.json]
// Each model: its parts per material (positions as 16-bit numbers in the model's box, normals as 8-bit, 16-bit
// indices; texture coordinates are dropped: these models use plain colours), the top-view outline for the 2D
// symbol (src/outline.js) and the settings from the config (name, category, real size, flags).
// All parts go in one gzip'd + base64 blob that the app unpacks the first time a model is shown in 3D.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(process.argv[3] || path.join(HERE, 'kenney-config.json'), 'utf8'));
const OUT = process.argv[4] || path.join(HERE, '..', 'build', 'models.json');
const outlineSrc = fs.readFileSync(path.join(HERE, '..', 'src', 'outline.js'), 'utf8');
const meshOutline = new Function(outlineSrc + '\nreturn meshOutline;')();

function mat4(t) {
  if (t.matrix) return t.matrix.slice();
  const [tx, ty, tz] = t.translation || [0, 0, 0], [x, y, z, w] = t.rotation || [0, 0, 0, 1], [sx, sy, sz] = t.scale || [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }

function readAccessor(gltf, bin, ai) {
  const acc = gltf.accessors[ai], bv = gltf.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[acc.componentType];
  const stride = bv.byteStride || comps * size, off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < comps; c++) {
    const p = off + i * stride + c * size;
    out[i * comps + c] = acc.componentType === 5126 ? bin.readFloatLE(p) : acc.componentType === 5125 ? bin.readUInt32LE(p) : acc.componentType === 5123 ? bin.readUInt16LE(p) : bin.readUInt8(p);
  }
  return out;
}

const matNames = [], matColors = {};
const matIndex = name => { let i = matNames.indexOf(name); if (i < 0) { i = matNames.length; matNames.push(name); } return i; };
const chunks = [];
let offset = 0;
const list = [];
const files = fs.readdirSync(dir).filter(n => n.endsWith('.glb')).sort();
for (const f of files) {
  const id = f.replace(/\.glb$/, '');
  if ((cfg.skip || []).includes(id)) continue;
  const c = cfg.models[id];
  if (!c) { console.warn('not in the config, skipped:', id); continue; }
  const buf = fs.readFileSync(path.join(dir, f));
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const bin = buf.slice(20 + jsonLen + 8);
  const byMat = new Map(); // material name → {pos:[], nrm:[], idx:[]}
  const visit = (ni, parent) => {
    const node = gltf.nodes[ni];
    const m = mul(parent, mat4(node));
    if (node.mesh != null) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const mat = gltf.materials[prim.material] || { name: '_defaultMat' };
        const name = mat.name || '_defaultMat';
        const bc = (mat.pbrMetallicRoughness || {}).baseColorFactor || [1, 1, 1, 1];
        matColors[name] = bc.map(v => +v.toFixed(3));
        if (!byMat.has(name)) byMat.set(name, { pos: [], nrm: [], idx: [] });
        const g = byMat.get(name);
        const P = readAccessor(gltf, bin, prim.attributes.POSITION);
        const N = prim.attributes.NORMAL != null ? readAccessor(gltf, bin, prim.attributes.NORMAL) : null;
        const I = prim.indices != null ? readAccessor(gltf, bin, prim.indices) : [...Array(P.length / 3).keys()];
        const base = g.pos.length / 3;
        for (let i = 0; i < P.length; i += 3) {
          const x = P[i], y = P[i + 1], z = P[i + 2];
          g.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          if (N) {
            const a = N[i], b = N[i + 1], cc = N[i + 2];
            g.nrm.push(m[0] * a + m[4] * b + m[8] * cc, m[1] * a + m[5] * b + m[9] * cc, m[2] * a + m[6] * b + m[10] * cc);
          } else g.nrm.push(0, 1, 0);
        }
        for (const k of I) g.idx.push(base + k);
      }
    }
    for (const ch of node.children || []) visit(ch, m);
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of gltf.scenes[gltf.scene || 0].nodes) visit(r, I4);
  // the box of the whole model
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const g of byMat.values()) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
  const sz = mx.map((v, k) => Math.max(v - mn[k], 1e-6));
  const parts = [], tris = [];
  const areas = {};
  const start = offset;
  for (const [name, g] of byMat) {
    const v = g.pos.length / 3;
    if (v > 65535) throw new Error(id + ': too many vertices in one part');
    const pos = Buffer.alloc(v * 6), nrm = Buffer.alloc(v * 3 + (v * 3) % 2), idx = Buffer.alloc(g.idx.length * 2);
    const nx = [];
    for (let i = 0; i < v; i++) {
      for (let k = 0; k < 3; k++) {
        const u = (g.pos[i * 3 + k] - mn[k]) / sz[k];
        pos.writeUInt16LE(Math.round(Math.min(1, Math.max(0, u)) * 65535), i * 6 + k * 2);
      }
      // normals of the model squeezed into its box (see the note in src/models.js)
      let a = g.nrm[i * 3] * sz[0], b = g.nrm[i * 3 + 1] * sz[1], cc = g.nrm[i * 3 + 2] * sz[2];
      const L = Math.hypot(a, b, cc) || 1;
      a /= L; b /= L; cc /= L;
      nrm.writeInt8(Math.round(a * 127), i * 3); nrm.writeInt8(Math.round(b * 127), i * 3 + 1); nrm.writeInt8(Math.round(cc * 127), i * 3 + 2);
      nx.push([(g.pos[i * 3] - mn[0]) / sz[0] - 0.5, (g.pos[i * 3 + 1] - mn[1]) / sz[1], (g.pos[i * 3 + 2] - mn[2]) / sz[2] - 0.5]);
    }
    g.idx.forEach((k, j) => idx.writeUInt16LE(k, j * 2));
    let area = 0;
    for (let t = 0; t + 2 < g.idx.length; t += 3) {
      const A = nx[g.idx[t]], B = nx[g.idx[t + 1]], C = nx[g.idx[t + 2]];
      tris.push(...A, ...B, ...C);
      // area in real metres, for picking the main colour
      const s = [c.size[0], c.size[2], c.size[1]];
      const u = [0, 1, 2].map(k => (B[k] - A[k]) * s[k]), w = [0, 1, 2].map(k => (C[k] - A[k]) * s[k]);
      area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    }
    areas[name] = area;
    chunks.push(pos, idx, nrm);
    offset += pos.length + idx.length + nrm.length;
    parts.push([matIndex(name), v, g.idx.length]);
  }
  const ol = meshOutline(tris, c.size[0], c.size[1]);
  const main = c.main || Object.entries(areas).filter(([n]) => n !== 'glass').sort((a, b) => b[1] - a[1])[0][0];
  const flags = {};
  for (const k of ['wall', 'front', 'sides', 'tuck', 'flat', 'high', 'z', 'ceiling', 'light']) if (c[k] != null) flags[k] = c[k];
  list.push({ id, n: c.name, c: c.cat, s: c.size, f: flags, main, col: c.color || null, off: start, p: parts, o: ol.o, u: ol.u });
  if (!byMat.has(main)) console.warn(id + ': main material ' + main + ' is not in the model (' + [...byMat.keys()].join(', ') + ')');
}
const blob = Buffer.concat(chunks);
const gz = zlib.gzipSync(blob, { level: 9 });
const out = { source: 'Kenney Furniture Kit 2.0 (www.kenney.nl), CC0 1.0', mats: matNames.map(n => [n, ...matColors[n]]), models: list, bytes: blob.length, blob: gz.toString('base64') };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(list.length, 'models;', blob.length, 'bytes →', gz.length, 'gzip →', fs.statSync(OUT).size, 'json');
