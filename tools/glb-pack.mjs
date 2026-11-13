// Models for the asset library (task 0009), called by build.py:  node tools/glb-pack.mjs < jobs.json
//   jobs: [{ in, out }] – each .glb made lighter for phones: shared parts once (dedup), unused parts out (prune),
//   pictures as WebP at most 1024 px, geometry packed with meshopt (EXT_meshopt_compression: the app unpacks it with
//   three.js' MeshoptDecoder). The shape is not simplified. Prints per model one JSON line: { out, bytes, size [w, d, h]
//   in metres as the model is (y up), o / u: the top-view outline for the 2D symbol (src/outline.js, as the Kenney
//   models) }.
// Needs: npm ci --prefix tools (pinned in tools/package.json).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const meshOutline = new Function(fs.readFileSync(path.join(HERE, '..', 'src', 'outline.js'), 'utf8') + '\nreturn meshOutline;')();
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const jobs = JSON.parse(fs.readFileSync(0, 'utf8'));
const quiet = { debug() {}, info() {}, warn() {}, error: console.error };

/** every triangle of the scene in world space (y up) */
function triangles(doc) {
  const out = [];
  const visit = (node, M) => {
    const W = mul(M, node.getMatrix());
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
      if (!pos) continue;
      const n = idx ? idx.getCount() : pos.getCount(), v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(idx ? idx.getScalar(i) : i, v);
        out.push(W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]);
      }
    }
    for (const c of node.listChildren()) visit(c, W);
  };
  for (const sc of doc.getRoot().listScenes()) for (const nd of sc.listChildren()) visit(nd, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return out;
}
function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }

for (const j of jobs) {
  const doc = await io.read(j.in);
  doc.setLogger(quiet);
  const t = triangles(doc);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], t[i + k]); mx[k] = Math.max(mx[k], t[i + k]); }
  const sz = [0, 1, 2].map(k => Math.max(1e-6, mx[k] - mn[k]));
  // in the unit box as the app's models: x, z ∈ [-0.5, 0.5], y ∈ [0, 1]
  const unit = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 3) { unit[i] = (t[i] - mn[0]) / sz[0] - 0.5; unit[i + 1] = (t[i + 1] - mn[1]) / sz[1]; unit[i + 2] = (t[i + 2] - mn[2]) / sz[2] - 0.5; }
  const ol = meshOutline(unit, sz[0], sz[2]);
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(j.out, bin);
  console.log(JSON.stringify({ out: j.out, bytes: bin.length, tris: t.length / 9, size: [sz[0], sz[2], sz[1]].map(v => +v.toFixed(4)), o: ol.o, u: ol.u }));
}
