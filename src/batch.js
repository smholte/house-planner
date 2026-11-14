/* ───────────── batch.js — fewer draw calls: what never moves is drawn in one go per material ─────────────
   After a 3D view is built, the meshes of each storey (and of the garden) that never move – walls, floors, ceilings,
   window and door frames, the builder's model, stairs, the garden's areas, walls, hedges and trees – are copied into
   one mesh per material (and per shadow setting). Those merged meshes are drawn; the original meshes stay in the scene,
   hidden (visible = false, userData.merged = true), so tapping, walking, measuring and slices still find the wall,
   room or door they belong to (ray tests use the originals; a merged mesh never answers a ray).
   Not merged: what moves (doors and their leaves, the gate's leaf, furniture), see-through materials (their order
   matters), overlays (depthTest / depthWrite off, renderOrder), meshes with children, instanced meshes.
   Same look: the same materials and the same triangles, only fewer, bigger pieces. A 3D view built for drawings
   (sections, sun hours) is not merged: they change materials and hide pieces one by one.
   Task 0029 (a lighter site): a piece alone in its buckets (one big piece – the plot, a street, the houses around per
   material) is not copied: it stays as it is, drawn and found by rays itself. A piece with a light stand-in
   (userData.standIn: the houses around as seen from far, or nothing for reeds) keeps only that for rays once merged.
   The garden's trees, shrubs and grasses are not merged at all: they are one shape drawn many times (trees.js). */

const BATCH_MATS = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshBasicMaterial']);

/** can this mesh be drawn as part of a merged mesh? */
function batchable(o, moving) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.children.length) return false;
  if (o.renderOrder || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || !g.attributes.normal || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return false;
  if (o.customDepthMaterial || o.customDistanceMaterial) return false;
  const u = o.userData || {};
  if (u.furn || u.furnRing || u.hit || u.noBatch) return false;
  for (const m of [].concat(o.material)) {
    if (!m || !BATCH_MATS.has(m.type) || m.transparent || m.depthTest === false || m.depthWrite === false || m.wireframe) return false;
  }
  // inside something that moves (a door's leaf, the gate's leaf) or a piece of furniture
  for (let p = o.parent; p; p = p.parent) { if (moving.has(p) || (p.userData && (p.userData.furn || p.userData.furnRing))) return false; }
  return true;
}

/** merge what never moves under root (a storey group or the garden group); returns how many meshes were merged */
function batchStatic(root, moving, cell = 0) {
  root.updateMatrixWorld(true);
  const ctr = new THREE.Vector3();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), bucketsOf = new Map();
  const merged = [];
  root.traverse(o => {
    if (!batchable(o, moving)) return;
    const g = o.geometry, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const names = ['position', 'normal', ...['uv', 'uv1', 'color'].filter(n => g.attributes[n])];
    const sig = names.join(',') + '|' + names.map(n => g.attributes[n].itemSize).join(',');
    const parts = Array.isArray(o.material)
      ? (g.groups.length ? g.groups.map(gr => [o.material[gr.materialIndex], gr.start, gr.count]) : [[o.material[0], 0, Infinity]])
      : [[o.material, 0, Infinity]];
    // the garden in squares (cell metres): what is out of sight is still left out (trees behind you when walking)
    let where = '';
    if (cell) {
      if (!g.boundingSphere) g.computeBoundingSphere();
      ctr.copy(g.boundingSphere.center).applyMatrix4(M);
      // (big pieces – the plot, the canal, the streets – are one piece anyway)
      where = g.boundingSphere.radius > cell ? 'big' : Math.floor(ctr.x / cell) + ',' + Math.floor(ctr.z / cell);
    }
    for (const [m, start, count] of parts) {
      if (!m) continue;
      const key = m.uuid + '|' + sig + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + (m.vertexColors ? 1 : 0) + '|' + where;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { m, names, cast: o.castShadow, receive: o.receiveShadow, items: [] });
      b.items.push({ g, M, start, count, o });
      bucketsOf.has(o) ? bucketsOf.get(o).push(b) : bucketsOf.set(o, [b]);
    }
    merged.push(o);
  });
  // a piece alone in all its buckets (one big piece: the houses around, the plot, a street – already one mesh per
  // material) stays as it is, drawn and found by rays itself: a copy would only hold its triangles twice (task 0029)
  const alone = new Set(merged.filter(o => (bucketsOf.get(o) || []).every(b => b.items.length === 1)));
  // only worth it where pieces come together
  let n = 0;
  for (const b of buckets.values()) {
    if (b.items.length === 1 && alone.has(b.items[0].o)) continue;
    const geo = batchGeometry(b);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.m);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
    mesh.userData.batch = b.items.length;
    mesh.raycast = () => {};
    root.add(mesh);
    n++;
  }
  let k = 0;
  for (const o of merged) {
    if (alone.has(o)) { if (o.userData.standIn) o.userData.standIn.dispose(); delete o.userData.standIn; continue; }
    o.visible = false; o.userData.merged = true; k++;
    // a light stand-in for tapping instead of the hidden piece (task 0029: the houses around – their walls and roofs –
    // or nothing, for reeds): the piece's own triangles are only held in the merged mesh
    if ('standIn' in o.userData) {
      const g0 = o.geometry, sIn = o.userData.standIn;
      delete o.userData.standIn;
      if (sIn) o.geometry = sIn; else o.removeFromParent();
      if (!(o.userData && o.userData.keep)) g0.dispose();
    }
  }
  return k;
}

/** one geometry (in the root's frame) from the triangles of the items in a bucket */
function batchGeometry(b) {
  // count vertices and triangles first
  let nv = 0, ni = 0;
  const plan = b.items.map(it => {
    const g = it.g, idx = g.index, total = idx ? idx.count : g.attributes.position.count;
    const s = Math.max(0, it.start), e = Math.min(total, it.count === Infinity ? total : s + it.count);
    if (e <= s) return null;
    // the vertices this range uses (indexed: only those, renumbered)
    let map = null, used = 0;
    if (idx) {
      map = new Int32Array(g.attributes.position.count).fill(-1);
      for (let i = s; i < e; i++) { const v = idx.getX(i); if (map[v] < 0) map[v] = used++; }
    } else used = e - s;
    nv += used; ni += e - s;
    return { ...it, s, e, map, used };
  }).filter(Boolean);
  if (!plan.length || !ni) return null;
  const out = {};
  for (const name of b.names) out[name] = new Float32Array(nv * b.items[0].g.attributes[name].itemSize);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v3 = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const p of plan) {
    const g = p.g, A = g.attributes;
    nm.getNormalMatrix(p.M);
    const flip = p.M.determinant() < 0;
    // vertices: positions and normals into the root's frame, the rest as they are
    const P = out.position, N = out.normal, extra = b.names.filter(nn => nn !== 'position' && nn !== 'normal');
    const copyVertex = (from, to) => {
      v3.fromBufferAttribute(A.position, from).applyMatrix4(p.M); P[to * 3] = v3.x; P[to * 3 + 1] = v3.y; P[to * 3 + 2] = v3.z;
      v3.fromBufferAttribute(A.normal, from).applyMatrix3(nm).normalize(); N[to * 3] = v3.x; N[to * 3 + 1] = v3.y; N[to * 3 + 2] = v3.z;
      for (const name of extra) {
        const at = A[name], k = at.itemSize, o2 = out[name];
        for (let c = 0; c < k; c++) o2[to * k + c] = at.getComponent(from, c);
      }
    };
    if (p.map) {
      for (let v = 0; v < p.map.length; v++) if (p.map[v] >= 0) copyVertex(v, vo + p.map[v]);
      const idx = g.index;
      for (let i = p.s; i < p.e; i += 3) {
        const a = p.map[idx.getX(i)], b2 = p.map[idx.getX(i + 1)], c = p.map[idx.getX(i + 2)];
        index[io++] = vo + a; index[io++] = vo + (flip ? c : b2); index[io++] = vo + (flip ? b2 : c);
      }
    } else {
      for (let i = p.s; i < p.e; i++) copyVertex(i, vo + (i - p.s));
      for (let i = 0; i < p.e - p.s; i += 3) { index[io++] = vo + i; index[io++] = vo + (flip ? i + 2 : i + 1); index[io++] = vo + (flip ? i + 1 : i + 2); }
    }
    vo += p.used;
  }
  const geo = new THREE.BufferGeometry();
  for (const name of b.names) geo.setAttribute(name, new THREE.BufferAttribute(out[name], b.items[0].g.attributes[name].itemSize));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

Object.assign(View3D.prototype, {
  /** is this view merged? (not the views that make drawings) */
  batchOn() { return !(this.opts.noBatch || (typeof window !== 'undefined' && window.__hpNoBatch)); },
  /** after a build: merge the storeys and the garden (not for the views that make drawings) */
  batchAll() {
    if (!this.batchOn()) return;
    const moving = new Set();
    for (const list of this.doorMap.values()) for (const d of list) moving.add(d.grp);
    let n = 0;
    for (const root of [...this.group.children]) {
      // a storey kept from the last build (reuse.js) is merged already
      if (root.userData.nBatched == null) root.userData.nBatched = batchStatic(root, moving, root.userData && root.userData.garden ? 16 : 0);
      n += root.userData.nBatched;
    }
    this.batched = n;
  },
});
