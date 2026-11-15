/* ───────────── hpscene.js — Export → For Fresing Render… : a house scene (.hpscene, task 0031) ─────────────
   The house scene format of smholte/house-scene-format (pinned tag v1.0.1, FORMAT.md): a zip with scene.json (place,
   storeys, the recipe: light, quality, what is in it, seasons and moments, cameras and photos) and house.glb (every
   surface of the house version as a glTF node with extras.hp: id, kind, storey, Show-button group, how it is baked, its
   hash hp-hash/1 and – for a light map – its UV set 1 laid out by hp-uv/1). Fresing Render opens it (File > Import >
   House Planner scene), bakes real light, snow and photos for it and sends a .hpbake back (part 2, task 0032).
   How: the house version is built in a hidden 3D view as the app draws it (view3d*.js, garden.js … unchanged, nothing
   merged), every mesh is named by what it is (its userData), and pieces of one thing become one surface. Ids are made
   only from the house's own ids and the order the build makes things in, so two exports of the same version give the
   same ids and the same hashes (FORMAT.md 4.1). */
const HPS_FORMAT = '1.0';
const HPS_GROUPS = ['house', 'garden', 'street', 'houses', 'park', 'furniture', 'installs', 'ceilItems'];
const HPS_SITE = ['garden', 'street', 'houses', 'park'];
/** texels per metre: the house, and the plot / street / neighbours / park (FORMAT.md section 11) */
const HPS_QUALITY = {
  DRAFT: { tpm: 16, groups: { garden: 6, street: 4, houses: 4, park: 4 } },
  NORMAL: { tpm: 24, groups: { garden: 8, street: 5, houses: 4, park: 5 } },
  FINE: { tpm: 40, groups: { garden: 10, street: 6, houses: 5, park: 6 } },
};
/** the moments on offer (clock times, Dutch time; the evening comes earlier in winter) */
const HPS_MOMENTS = {
  morning: { label: 'Morning', time: { summer: '09:00', winter: '09:30' } },
  afternoon: { label: 'Afternoon', time: { summer: '14:00', winter: '13:30' } },
  evening: { label: 'Evening', time: { summer: '20:30', winter: '17:00' } },
  night: { label: 'Night', time: { summer: '23:30', winter: '22:00' } },
};
const HPS_SEASONS = {
  summer: { label: 'Summer', date: '06-21', snow_cover: 0, wet: 0, foliage: 'full', clouds: 0.2, low: 0 },
  winter: { label: 'Winter', date: '01-15', snow_cover: 0.6, wet: 0.2, foliage: 'bare', clouds: 0.6, low: 0.3 },
};
/** surfaces that would be a light map but break into very many small flat pieces (a railing, a gate, a curved
 *  thing) get light per vertex instead: more charts than this, or small ones */
const HPS_MAX_CHARTS = 400, HPS_SMALL_CHART = 0.004;
/** light-map pages a moment may fill (the checker warns above 4, FORMAT.md section 11) */
const HPS_PAGES = 3.5;

/** text the format accepts: no control characters, at most n characters */
const hpsText = (s, n = 120, fallback = '-') => (String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || fallback);
/** a name part of an id: letters, digits and _ . - */
const hpsName = s => String(s).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'x';
const f32 = Math.fround;
const r6 = x => Math.round(x * 1e6) / 1e6;

/* ───────── zip (stored or deflated, FORMAT.md section 2) ───────── */
const HPS_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function hpsCrc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = HPS_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function hpsDeflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (e) { return null; }
}
/** files = [[name, Uint8Array, deflate?]] → zip bytes (the same files give the same bytes) */
async function hpsZip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, data, squeeze] of files) {
    const nm = new TextEncoder().encode(name);
    const z = squeeze ? await hpsDeflate(data) : null;
    const body = z && z.length < data.length ? z : data, method = body === data ? 0 : 8;
    const crc = hpsCrc32(data);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, method, true);
    loc.setUint16(10, 0, true); loc.setUint16(12, (2026 - 1980) << 9 | 1 << 5 | 1, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, body.length, true); loc.setUint32(22, data.length, true); loc.setUint16(26, nm.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, method, true);
    cen.setUint16(12, 0, true); cen.setUint16(14, (2026 - 1980) << 9 | 1 << 5 | 1, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, body.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, nm.length, true); cen.setUint32(42, off, true);
    parts.push(new Uint8Array(loc.buffer), nm, body);
    central.push(new Uint8Array(cen.buffer), nm);
    off += 30 + nm.length + body.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* ───────── glTF binary ───────── */
class HpsGlb {
  constructor() { this.doc = { asset: { version: '2.0', generator: 'House Planner' }, buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [] }; this.chunks = []; this.len = 0; }
  view(bytes, target) {
    const pad = (4 - (this.len % 4)) % 4;
    if (pad) { this.chunks.push(new Uint8Array(pad)); this.len += pad; }
    const bv = { buffer: 0, byteOffset: this.len, byteLength: bytes.byteLength };
    if (target) bv.target = target;
    this.chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.len += bytes.byteLength;
    this.doc.bufferViews.push(bv);
    return this.doc.bufferViews.length - 1;
  }
  accessor(arr, type, comp, target, minmax) {
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    const acc = { bufferView: this.view(arr, target), componentType: comp, count: arr.length / n, type };
    if (minmax) {
      const lo = Array(n).fill(Infinity), hi = Array(n).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const k = i % n; if (arr[i] < lo[k]) lo[k] = arr[i]; if (arr[i] > hi[k]) hi[k] = arr[i]; }
      acc.min = lo; acc.max = hi;
    }
    this.doc.accessors.push(acc);
    return this.doc.accessors.length - 1;
  }
  bytes() {
    const pad = (4 - (this.len % 4)) % 4;
    if (pad) { this.chunks.push(new Uint8Array(pad)); this.len += pad; }
    this.doc.buffers[0].byteLength = this.len;
    let json = new TextEncoder().encode(JSON.stringify(this.doc));
    const jp = (4 - (json.length % 4)) % 4;
    if (jp) { const j2 = new Uint8Array(json.length + jp).fill(0x20); j2.set(json); json = j2; }
    const head = new DataView(new ArrayBuffer(20));
    const total = 12 + 8 + json.length + 8 + this.len;
    head.setUint32(0, 0x46546c67, true); head.setUint32(4, 2, true); head.setUint32(8, total, true);
    head.setUint32(12, json.length, true); head.setUint32(16, 0x4e4f534a, true);
    const bh = new DataView(new ArrayBuffer(8));
    bh.setUint32(0, this.len, true); bh.setUint32(4, 0x004e4942, true);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of [new Uint8Array(head.buffer), json, new Uint8Array(bh.buffer), ...this.chunks]) { out.set(b, o); o += b.length; }
    return out;
  }
}

/* ───────── surfaces from the built view ───────── */
/** the geometry of one mesh (one primitive per material): world positions, normals, texture UVs (in the picture's own
 *  coordinates) and triangles */
function hpsPieces(mesh, matrix) {
  const g = mesh.geometry, P = g && g.attributes && g.attributes.position;
  if (!P || P.count < 3) return [];
  const Nm = g.attributes.normal, U = g.attributes.uv, I = g.index;
  const nmat = new THREE.Matrix3().getNormalMatrix(matrix);
  const flip = matrix.determinant() < 0;
  const mats = [].concat(mesh.material);
  const groups = Array.isArray(mesh.material) && g.groups.length ? g.groups : [{ start: 0, count: I ? I.count : P.count, materialIndex: 0 }];
  const out = [];
  const v = new THREE.Vector3();
  for (const gr of groups) {
    const mat = mats[gr.materialIndex || 0] || mats[0];
    if (!mat || mat.visible === false) continue;
    const total = I ? I.count : P.count;
    const s = Math.max(0, gr.start), e = Math.min(total, gr.start + (Number.isFinite(gr.count) ? gr.count : total));
    const map = new Map(), pos = [], nrm = [], uv = [], idx = [];
    const tex = mat.map && mat.map.isTexture ? mat.map : null;
    if (tex && tex.matrixAutoUpdate) tex.updateMatrix();
    const m3 = tex ? tex.matrix.elements : null;
    const vert = k => {
      let j = map.get(k);
      if (j !== undefined) return j;
      j = pos.length / 3; map.set(k, j);
      v.fromBufferAttribute(P, k).applyMatrix4(matrix); pos.push(v.x, v.y, v.z);
      if (Nm) { v.fromBufferAttribute(Nm, k).applyMatrix3(nmat).normalize(); nrm.push(v.x, v.y, v.z); }
      if (U) { const a = U.getX(k), b = U.getY(k); uv.push(m3 ? m3[0] * a + m3[3] * b + m3[6] : a, m3 ? m3[1] * a + m3[4] * b + m3[7] : b); } else uv.push(0, 0);
      return j;
    };
    for (let i = s; i + 2 < e; i += 3) {
      let a = I ? I.getX(i) : i, b = I ? I.getX(i + 1) : i + 1, c = I ? I.getX(i + 2) : i + 2;
      if (a === b || b === c || a === c) continue;
      if (flip) [b, c] = [c, b];
      idx.push(vert(a), vert(b), vert(c));
    }
    if (!idx.length) continue;
    if (!Nm) {   // no normals: the faces' own
      const n = new Float64Array(pos.length);
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        for (const q of [a, b, c]) { n[q] += cx; n[q + 1] += cy; n[q + 2] += cz; }
      }
      for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; nrm.push(n[i] / l, n[i + 1] / l, n[i + 2] / l); }
    }
    out.push({ mat, pos, nrm, uv, idx });
  }
  return out;
}

/** is this a see-through material (glass, water)? */
const hpsClear = m => !!m && ((m.transparent && m.opacity < 0.9) || (m.transmission || 0) > 0.1 || /glass/i.test((m.userData && m.userData.key) || m.name || ''));
const hpsMatKey = m => String((m && m.userData && m.userData.key) || (m && m.name) || '');

Object.assign(app, {
  /** what the dialog starts with: this version, Soft light, Draft, summer and winter afternoons, the Show buttons as
   *  they are now */
  hpsceneDefaults() {
    const s = this.settings || {}, gs = gShow(s), p = this.project;
    const groups = ['house'];
    if (s.furniture !== false) groups.push('furniture');
    if (s.installs !== false) groups.push('installs');
    if (ceilShown(s)) groups.push('ceilItems');
    if (p && p.site) for (const k of HPS_SITE) if (gs[k]) groups.push(k);
    const year = new Date().getFullYear();
    const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches;
    return { versionId: this.shownVersion().id, light: 'SOFT', preset: 'DRAFT', groups,
      seasons: { summer: { on: true, date: `${year}-${HPS_SEASONS.summer.date}` }, winter: { on: true, date: `${year}-${HPS_SEASONS.winter.date}` } },
      moments: ['morning', 'afternoon', 'evening'], open: true, cameras: ['current'], pageSize: phone ? 1024 : 2048 };
  },

  /** the cameras on offer: the view on screen now and the saved 3D viewpoints */
  hpsceneCameras() {
    const out = [];
    const pane = (this.panes || []).find(x => x.kind === '3d' && x.view && x.view.ok);
    const p = this.project;
    const lift = (vp, pos) => {
      if (vp.scope !== 'storey') return pos;
      const st = getStorey(p, vp.storeyId);
      return [pos[0], pos[1] + ((st && st.elevation) || 0), pos[2]];
    };
    if (pane && this.view.scope !== 'side') {
      const st = this.view.scope === 'storey' ? this.currentStorey() : null;
      const y = (st && st.elevation) || 0;
      const c = pane.view.camera.position, tg = pane.view.controls.target;
      out.push({ key: 'current', id: 'current-view', label: t('The view on screen now'), position: [c.x, c.y + y, c.z], target: [tg.x, tg.y + y, tg.z], fov: pane.view.camera.fov || 50 });
    }
    for (const vp of (p && p.viewpoints) || []) {
      if (!vp.cam || vp.scope === 'side' || !vp.cam.pos || !vp.cam.target) continue;
      out.push({ key: vp.id, id: hpsName(vp.id), label: hpsText(vp.name || t('View')), position: lift(vp, vp.cam.pos), target: lift(vp, vp.cam.target), fov: 50 });
    }
    return out;
  },

  /** build the version in a hidden 3D view: everything the recipe can include (the Show buttons are applied by
   *  leaving surfaces out, so each piece is known by the button that hides it) */
  hpsView(v, inc) {
    const p = this.project;
    const host = h('div', { class: 'drawing-host', 'aria-hidden': 'true', style: { position: 'fixed', left: '-12000px', top: '0', width: '640px', height: '400px', pointerEvents: 'none' } });
    document.body.appendChild(host);
    const dv = new View3D(host, this, { mini: true, noBatch: true });
    dv.visible = false;
    dv._hpsHost = host;
    if (!dv.ok) { host.remove(); return null; }
    // the garden's builders, watched: what each adds is the street, the neighbours or water and park
    const tag = (G, n0, key) => { for (let i = n0; i < G.children.length; i++) if (!G.children[i].userData.hpsGroup) G.children[i].userData.hpsGroup = key; };
    const base = View3D.prototype;
    dv.buildStreets = function (G, ...a) { const n0 = G.children.length; const r = base.buildStreets.call(this, G, ...a); tag(G, n0, 'street'); G.userData.hpsStreetAt = G.userData.hpsStreetAt ?? n0; return r; };
    dv.buildHood = function (G, ...a) { const n0 = G.children.length; const r = base.buildHood.call(this, G, ...a); tag(G, n0, 'houses'); G.userData.hpsStreetAt = G.userData.hpsStreetAt ?? n0; return r; };
    dv.buildAround = function (G, site, sl, add, show) {
      G.userData.hpsStreetAt = G.userData.hpsStreetAt ?? G.children.length;
      for (const k of ['houses', 'street', 'park']) {
        if (show && !show[k]) continue;
        const n0 = G.children.length;
        base.buildAround.call(this, G, site, sl, add, { houses: k === 'houses', street: k === 'street', park: k === 'park' });
        tag(G, n0, k);
      }
    };
    const s = this.settings, keep = { installs: s.installs, ceilItems: s.ceilItems, furniture: s.furniture };
    try {
      // (the hidden view builds what these switches show: all of it, for the moment of the build)
      Object.assign(s, { installs: true, ceilItems: true, furniture: true });
      const storeys = sortedStoreys(p).filter(st => inc.storeys.includes(st.id));
      const entries = storeys.map(st => ({ storey: st, plan: v.plan, offset: [0, 0], y: st.elevation || 0, diff: null, basePlan: v.plan, versionId: v.id, edit: false,
        bbox: this.storeyBBox([v.plan], st, false), ...this.entryExtras(st, 'main', v), pins: [], paths: null }));
      const site = p.site && HPS_SITE.some(k => inc.groups.includes(k));
      const low = lowestStorey(p);
      const gshow = { garden: true, street: true, houses: true, park: true };
      const lot3 = site && HOUSE.mirror && p.site.around && (p.site.around.blds || []).some(H => H.lot === HOUSE.mirror.lot) ? { storeys: sortedStoreys(p).map(st => ({ id: st.id, y: round((st.elevation || 0) - (low.elevation || 0), 0.001) })) } : null;
      dv.build({ entries, cut: false, ground: false, mode: 'view', light: 'day', ceilings: true, walk: false, plinth: true, windows: true, outside: true, roof: true, floors: true,
        shell: this.shell, origPlan: (getOriginal(p) || {}).plan || null, scope: 'house', sliceKey: '#hpscene', homeView: null, labels: false, selection: null, fitKey: 'hpscene',
        ...(site ? { site: p.site, garden: v.plan.garden || null, gardenAt: { offset: [0, 0], y: (low && low.elevation) || 0 }, gshow, lot3 } : {}) });
    } finally { Object.assign(s, keep); }
    // the hidden view shares materials with the views on screen: give those back their slices
    for (const pn of this.panes || []) if (pn.view && pn.view.applyClip && pn.view !== dv) pn.view.applyClip();
    dv.group.updateMatrixWorld(true);
    return dv;
  },
  hpsDrop(dv) {
    if (!dv) return;
    const host = dv._hpsHost;
    try { dv.destroy(); } catch (e) { /* gone */ }
    if (host) host.remove();
  },

  /** every mesh of the hidden view, named: [{ id, kind, storey, group, bake, source, mesh, matrix, light }] */
  hpsCollect(dv, v, inc) {
    const plan = v.plan, out = [], count = new Map();
    const next = pre => { const n = count.get(pre) || 0; count.set(pre, n + 1); return pre + n; };
    const shown = o => { for (let q = o; q && q !== dv.group; q = q.parent) if (q.visible === false) return false; return true; };
    const isLeaf = m => /leaf|hedge/.test(hpsMatKey(m)) || m.type === 'MeshLambertMaterial';
    const pushMesh = (o, info) => {
      const mats = [].concat(o.material);
      if (!mats.some(m => m && m.visible !== false && !(m.isMeshBasicMaterial && m.transparent && m.opacity < 0.05))) return;
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, im); out.push({ ...info, id: info.id + ':' + k, mesh: o, matrix: o.matrixWorld.clone().multiply(im) }); }
      } else out.push({ ...info, mesh: o, matrix: o.matrixWorld.clone() });
    };
    // the storeys
    for (const g of dv.group.children) {
      const sid = g.userData.storeyId;
      if (!sid) continue;
      g.traverse(o => {
        if (!o.isMesh || !shown(o)) return;
        const U = {};
        for (let q = o; q && q !== g.parent; q = q.parent) for (const [k, val] of Object.entries(q.userData || {})) if (!(k in U)) U[k] = val;
        if (U.hit || U.furnRing || U.pin || U.handleBox) return;
        const m0 = [].concat(o.material)[0] || {}, key = hpsMatKey(m0), clear = hpsClear(m0);
        const S = 'house';
        let info;
        if (U.furn) info = { id: `furniture:${hpsName(U.furn)}:0`, kind: clear ? 'glass' : 'furniture', group: 'furniture', bake: clear ? 'NO' : 'VERTEX', source: U.furn };
        else if (U.point) {
          const pt = (plan.points || []).find(x => x.id === U.point) || {};
          const K = ptKind(pt), lamp = pt.kind === 'light' || pt.kind === 'walllight';
          info = { id: `${lamp ? 'lamp' : 'install'}:${hpsName(U.point)}`, kind: lamp ? 'lamp' : 'install', group: K.ceil ? 'ceilItems' : 'installs', bake: 'VERTEX', source: U.point, point: U.point };
        } else if (clear) info = { id: U.door ? `glass:${hpsName(U.door)}` : next(`glass:${hpsName(sid)}.`), kind: 'glass', group: S, bake: 'NO', source: U.door };
        else if (U.wallId && !U.handle) info = { wall: U.wallId, id: `wall:${hpsName(U.wallId)}`, kind: 'wall', group: S, bake: 'MAP', source: U.wallId };
        else if (U.door || U.handle || U.reveal || U.winRail || U.threshold || /frame|leaf|door|metal|groove|bead|handle|sill/.test(key)) info = { id: U.door ? `opening:${hpsName(U.door)}` : next(`opening:${hpsName(sid)}.`), kind: 'opening', group: S, bake: 'VERTEX', source: U.door };
        else if (U.roomId) info = { id: `floor:${hpsName(U.roomId)}`, kind: 'floor', group: S, bake: 'MAP', source: U.roomId };
        else if (U.floorStrip) info = { id: `floor:${hpsName(sid)}.strips`, kind: 'floor', group: S, bake: 'MAP' };
        else if (U.ceiling) info = { id: `ceiling:${hpsName(U.ceiling)}`, kind: 'ceiling', group: S, bake: 'MAP', source: typeof U.ceiling === 'string' ? U.ceiling : undefined };
        else if (U.stair) info = { id: `stair:${hpsName(typeof U.stair === 'string' ? U.stair : sid)}`, kind: 'stair', group: S, bake: 'MAP', source: typeof U.stair === 'string' ? U.stair : undefined };
        else if (U.roofFlat || /roof/.test(key)) info = { id: next(`roof:${hpsName(sid)}:`), kind: 'roof', group: S, bake: 'MAP' };
        else if (U.slab) info = { id: next(`slab-edge:${hpsName(sid)}.`), kind: 'slab-edge', group: S, bake: 'MAP' };
        else if (/ceilfix/.test(key)) info = { id: next(`ceiling:${hpsName(sid)}.fix.`), kind: 'ceiling', group: S, bake: 'MAP' };
        else if (U.keep) info = { id: next(`${/brick|plaster|facade|wall/.test(key) ? 'wall' : 'other'}:${hpsName(sid)}.shell.`), kind: /brick|plaster|facade|wall/.test(key) ? 'wall' : 'other', group: S, bake: 'MAP' };
        else info = { id: next(`other:${hpsName(sid)}.`), kind: 'other', group: S, bake: 'MAP' };
        info.storey = sid;
        info.material = key;
        pushMesh(o, info);
      });
    }
    // the plot, the garden and what is around it
    const G = dv.group.children.find(c => c.userData.garden);
    if (G) {
      const ctxGroup = HPS_SITE.find(k => inc.groups.includes(k)) || 'garden';
      const streetAt = G.userData.hpsStreetAt ?? G.children.length;
      let afterPlot = false, inGarden = false;
      G.children.forEach((c, i) => {
        if (c.userData.plot) afterPlot = true;
        if (c.userData.garea || c.userData.gline || c.userData.plant) inGarden = true;
        // what the garden's own builder made: the world's grass first, then the canal (water and park), then (after
        // the street, the neighbours and the park) the plot, the street's corner pieces and the garden on the plot
        const key0 = hpsMatKey([].concat(c.material || [])[0]);
        const grp = c.userData.hpsGroup || (i === 0 ? ctxGroup : !afterPlot && i < streetAt ? 'park' : afterPlot && !inGarden && /\|path/.test(key0) ? 'street' : 'garden');
        c.traverse(o => {
          if (!o.isMesh || !shown(o)) return;
          const U = {};
          for (let q = o; q && q !== G; q = q.parent) for (const [k, val] of Object.entries(q.userData || {})) if (!(k in U)) U[k] = val;
          if (U.hit) return;
          const m0 = [].concat(o.material)[0] || {}, key = hpsMatKey(m0);
          const water = U.water || /\|water/.test(key);
          let info;
          if (water) info = { id: U.garea ? `water:${hpsName(U.garea)}` : next('water:'), kind: 'water', bake: 'NO', source: U.garea };
          else if (U.plot) info = { id: 'ground:plot', kind: 'ground', bake: 'MAP', source: 'plot' };
          else if (i === 0) info = { id: 'ground:around', kind: 'ground', bake: 'MAP' };
          else if (U.veg || U.plant) {
            const leaf = isLeaf(m0), src = U.plant || U.gline;
            info = { id: src ? `${leaf ? 'foliage' : 'plant'}:${hpsName(src)}` : next(leaf ? 'foliage:' : 'plant:'), kind: leaf ? 'foliage' : 'plant', bake: 'VERTEX', source: src };
          } else if (U.garea) info = { id: `garden:${hpsName(U.garea)}`, kind: 'garden', bake: 'MAP', source: U.garea };
          else if (U.gline) info = { id: `garden:${hpsName(U.gline)}${U.gate ? '.gate' : ''}`, kind: 'garden', bake: 'MAP', source: U.gline };
          else if (grp === 'houses' || U.around) info = { id: next('neighbour:'), kind: 'neighbour', bake: 'MAP' };
          else if (grp === 'street' || U.street) info = { id: next('street:'), kind: 'street', bake: 'MAP' };
          else if (grp === 'park') info = { id: next('park:'), kind: 'park', bake: 'MAP' };
          else info = { id: next('garden:x.'), kind: 'garden', bake: 'MAP' };
          info.group = grp; info.storey = null; info.material = key;
          if (U.around || grp === 'houses') info.group = 'houses';
          pushMesh(o, info);
        });
      });
    }
    return out.filter(x => inc.groups.includes(x.group));
  },

  /** the surfaces: pieces of one thing joined, walls split into side a, side b and edge, light maps laid out.
   *  Returns [{ hp, prims: [{ mat, pos (Float32Array), nrm, uv0, uv1, idx }], translation, light }] */
  hpsSurfaces(items, v, q) {
    const plan = v.plan, byId = new Map();
    for (const it of items) {
      const pieces = hpsPieces(it.mesh, it.matrix);
      if (!pieces.length) continue;
      if (it.wall) {
        // a wall's pieces split by which way their faces look: side a (left of a→b on the plan), side b, the edge
        const w = plan.walls.find(x => x.id === it.wall);
        const d = w ? V.norm(V.sub(w.b, w.a)) : null;
        const na = d ? [d[1], 0, -d[0]] : null;
        for (const pc of pieces) {
          const parts = { a: [], b: [], edge: [] };
          for (let i = 0; i < pc.idx.length; i += 3) {
            const [a, b, c] = [pc.idx[i] * 3, pc.idx[i + 1] * 3, pc.idx[i + 2] * 3], P = pc.pos;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, l = Math.hypot(cx, cy, cz) || 1;
            const k = na ? (cx * na[0] + cy * na[1] + cz * na[2]) / l : 0;
            parts[k > 0.985 ? 'a' : k < -0.985 ? 'b' : 'edge'].push(pc.idx[i], pc.idx[i + 1], pc.idx[i + 2]);
          }
          for (const side of ['a', 'b', 'edge']) {
            if (!parts[side].length) continue;
            const id = `${it.id}:${side}`;
            if (!byId.has(id)) byId.set(id, { info: { ...it, id }, pieces: [] });
            byId.get(id).pieces.push({ ...pc, idx: parts[side] });
          }
        }
        continue;
      }
      if (!byId.has(it.id)) byId.set(it.id, { info: it, pieces: [] });
      byId.get(it.id).pieces.push(...pieces);
    }
    const out = [];
    for (const { info, pieces } of byId.values()) {
      // one primitive per material
      const byMat = new Map();
      for (const pc of pieces) {
        if (!byMat.has(pc.mat)) byMat.set(pc.mat, { mat: pc.mat, pos: [], nrm: [], uv: [], idx: [] });
        const P = byMat.get(pc.mat), base = P.pos.length / 3;
        // only the corners the triangles use
        const used = new Map();
        for (const k of pc.idx) if (!used.has(k)) { used.set(k, base + used.size); P.pos.push(pc.pos[k * 3], pc.pos[k * 3 + 1], pc.pos[k * 3 + 2]); P.nrm.push(pc.nrm[k * 3], pc.nrm[k * 3 + 1], pc.nrm[k * 3 + 2]); P.uv.push(pc.uv[k * 2], pc.uv[k * 2 + 1]); }
        for (const k of pc.idx) P.idx.push(used.get(k));
      }
      let prims = [...byMat.values()];
      // a lamp: its node at the light, the fitting around it
      let translation = null, light = null;
      if (info.kind === 'lamp') {
        const spot = (q.lightSpots || []).find(s => s.point === info.point);
        if (spot) {
          translation = [r6(spot.pos.x), r6(spot.pos.y), r6(spot.pos.z)];
          for (const P of prims) for (let i = 0; i < P.pos.length; i += 3) { P.pos[i] -= translation[0]; P.pos[i + 1] -= translation[1]; P.pos[i + 2] -= translation[2]; }
          const ceil = spot.power > 2;
          light = { type: 'point', color: [1.0, 0.86, 0.7], intensity: ceil ? 64 : 32, range: 12 };
        }
      }
      const hp = { id: info.id, kind: info.kind, storey: info.storey, group: info.group, bake: info.bake };
      if (info.source) hp.source = hpsName(info.source);
      if (info.material) hp.material = hpsName(info.material);
      out.push(...this.hpsMap({ hp, prims, translation, light }, q));
    }
    out.sort((a, b) => (a.hp.id < b.hp.id ? -1 : a.hp.id > b.hp.id ? 1 : 0));
    return out;
  },

  /** float32 numbers and – for a light map – UV set 1 (hp-uv/1 rules); a surface too big for a page is split, one that
   *  breaks into too many little pieces gets light per vertex. Returns one or more surfaces. */
  hpsMap(S, q) {
    const store = P => ({ mat: P.mat, pos: Float32Array.from(P.pos), nrm: Float32Array.from(P.nrm), uv0: Float32Array.from(P.uv), uv1: null, idx: Uint32Array.from(P.idx) });
    if (S.hp.bake !== 'MAP') return [{ ...S, prims: S.prims.map(store) }];
    // all corners of all primitives in one list, as stored (float32)
    const pool = [], from = [], tris = [], triPrim = [];
    S.prims.forEach((P, pi) => {
      const base = pool.length / 3;
      for (let i = 0; i < P.pos.length; i++) pool.push(f32(P.pos[i]));
      for (let i = 0; i < P.pos.length / 3; i++) from.push([pi, i]);
      for (let i = 0; i < P.idx.length; i += 3) { tris.push(base + P.idx[i], base + P.idx[i + 1], base + P.idx[i + 2]); triPrim.push(pi); }
    });
    const { charts } = hpChartsOf(pool, tris);
    let area = 0;
    for (const c of charts) for (const t of c.tris) {
      const [a, b, cc] = [tris[t * 3] * 3, tris[t * 3 + 1] * 3, tris[t * 3 + 2] * 3];
      const ux = pool[b] - pool[a], uy = pool[b + 1] - pool[a + 1], uz = pool[b + 2] - pool[a + 2], vx = pool[cc] - pool[a], vy = pool[cc + 1] - pool[a + 1], vz = pool[cc + 2] - pool[a + 2];
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    const vertex = () => [{ ...S, hp: { ...S.hp, bake: 'VERTEX' }, prims: S.prims.map(store) }];
    if (q.vertexGroups && q.vertexGroups.has(S.hp.group)) return vertex();
    if (!charts.length || charts.length > HPS_MAX_CHARTS || (charts.length > 40 && area / charts.length < HPS_SMALL_CHART)) return vertex();
    const tpm0 = q.byGroup[S.hp.group] || q.tpm, maxPx = q.pageSize - 4;
    // charts too many for one page: split the surface (by place), one chart too big: a lower density of its own
    const sets = [];
    const split = (list, tpm) => {
      const L = this.hpsLayoutCharts(list, pool, tris, tpm);
      if (L && L.size[0] <= maxPx && L.size[1] <= maxPx) { sets.push({ list, tpm, L }); return; }
      if (list.length > 1) {
        const ctr = c => { let x = 0, z = 0; for (const t of c.tris) { x += pool[tris[t * 3] * 3]; z += pool[tris[t * 3] * 3 + 2]; } return [x / c.tris.length, z / c.tris.length]; };
        const cs = list.map(c => [c, ctr(c)]);
        const xs = cs.map(x => x[1][0]), zs = cs.map(x => x[1][1]);
        const ax = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs) ? 0 : 1;
        cs.sort((a, b) => a[1][ax] - b[1][ax] || a[1][1 - ax] - b[1][1 - ax]);
        const half = Math.ceil(cs.length / 2);
        split(cs.slice(0, half).map(x => x[0]), tpm); split(cs.slice(half).map(x => x[0]), tpm);
        return;
      }
      const big = L ? Math.max(...L.size) : Infinity;
      const t2 = Math.floor(tpm * (maxPx - 8) / big * 100) / 100;
      if (L && t2 >= 4 && t2 < tpm) { split(list, t2); return; }
      sets.push(null);
    };
    split(charts, tpm0);
    if (sets.includes(null)) return vertex();
    const out = [];
    sets.forEach((set, si) => {
      const id = sets.length > 1 ? `${S.hp.id}:${si}` : S.hp.id;
      const hp = { ...S.hp, id };
      if (set.tpm !== tpm0) hp.texels_per_m = set.tpm;
      hp.uv1_px = set.L.size;
      out.push({ ...S, hp, prims: this.hpsUvPrims(S.prims, from, tris, triPrim, set.L), mapOf: set });
    });
    if (out.some(s => !s.prims)) return vertex();
    return out;
  },

  /** lay out charts (folds found by the checker's own test are moved to charts of their own, up to six times) */
  hpsLayoutCharts(list, pool, tris, tpm) {
    let charts = list.slice();
    for (let round = 0; round < 6; round++) {
      const flat = charts.map(c => {
        c.verts = [...new Set(c.tris.flatMap(t => [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]]))];
        return hpProjectAny(c.verts.map(k => [pool[k * 3], pool[k * 3 + 1], pool[k * 3 + 2]]), c.normal);
      });
      const L = hpPack(flat, tpm);
      const [W, H] = L.size;
      if (W * H > 4 * 2048 * 2048) return { ...L, charts };
      // the stored UVs (float32), in texels; then the checker's fold test
      const tri = [], owner = [];
      charts.forEach((c, ci) => {
        const at = new Map(c.verts.map((k, j) => [k, j]));
        for (const t of c.tris) {
          tri.push([0, 1, 2].map(e => { const uv = L.uvs[ci][at.get(tris[t * 3 + e])]; return [f32(uv[0]) * W, f32(uv[1]) * H]; }));
          owner.push([ci, t]);
        }
      });
      const bad = hpFolds(tri, W, H);
      if (!bad.length) return { ...L, charts, tpm };
      const moved = new Map();
      for (const b of bad) { const [ci, t] = owner[b]; if (!moved.has(ci)) moved.set(ci, new Set()); moved.get(ci).add(t); }
      const next = [];
      charts.forEach((c, ci) => {
        const m = moved.get(ci);
        if (!m) { next.push(c); return; }
        for (const part of [c.tris.filter(t => !m.has(t)), c.tris.filter(t => m.has(t))]) {
          if (!part.length) continue;
          const sub = hpChartsOf(pool, part.flatMap(t => [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]]));
          for (const sc of sub.charts) next.push({ tris: sc.tris.map(i => part[i]), normal: sc.normal });
        }
      });
      charts = next;
    }
    return null;
  },

  /** the primitives of a laid-out surface: each corner once per chart it is in, with its UV set 1 */
  hpsUvPrims(prims, from, tris, triPrim, L) {
    const out = prims.map(P => ({ mat: P.mat, pos: [], nrm: [], uv0: [], uv1: [], idx: [], seen: new Map() }));
    L.charts.forEach((c, ci) => {
      const at = new Map(c.verts.map((k, j) => [k, j]));
      for (const t of c.tris) {
        const O = out[triPrim[t]];
        for (let e = 0; e < 3; e++) {
          const k = tris[t * 3 + e], key = k + ':' + ci;
          let j = O.seen.get(key);
          if (j === undefined) {
            const [pi, vi] = from[k], P = prims[pi];
            j = O.pos.length / 3; O.seen.set(key, j);
            O.pos.push(P.pos[vi * 3], P.pos[vi * 3 + 1], P.pos[vi * 3 + 2]); O.nrm.push(P.nrm[vi * 3], P.nrm[vi * 3 + 1], P.nrm[vi * 3 + 2]);
            O.uv0.push(P.uv[vi * 2], P.uv[vi * 2 + 1]);
            const uv = L.uvs[ci][at.get(k)];
            O.uv1.push(Math.min(1, Math.max(0, uv[0])), Math.min(1, Math.max(0, uv[1])));
          }
          O.idx.push(j);
        }
      }
    });
    return out.filter(O => O.idx.length).map(O => ({ mat: O.mat, pos: Float32Array.from(O.pos), nrm: Float32Array.from(O.nrm), uv0: Float32Array.from(O.uv0), uv1: Float32Array.from(O.uv1), idx: Uint32Array.from(O.idx) }));
  },

  /** a material's picture as PNG / JPEG bytes (drawn upside down when three.js reads it flipped, as glTF has no flip) */
  async hpsImage(tex, alpha, cache) {
    const im = tex && tex.image;
    if (!im || tex.isCompressedTexture) return null;
    const k = cache.keys.get(im);
    if (k && k.has(tex.flipY)) return k.get(tex.flipY);
    let w = im.naturalWidth || im.videoWidth || im.width, hh = im.naturalHeight || im.videoHeight || im.height;
    let res = null;
    try {
      if (w > 0 && hh > 0) {
        const sc = Math.min(1, 1024 / Math.max(w, hh));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(hh * sc));
        const cx = cv.getContext('2d');
        if (tex.flipY) { cx.translate(0, cv.height); cx.scale(1, -1); }
        if (im.data && !(im instanceof HTMLElement)) {
          if (!(im.data instanceof Uint8Array || im.data instanceof Uint8ClampedArray) || im.data.length !== w * hh * 4) throw new Error('not 8-bit RGBA');
          const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = hh;
          tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data.buffer, im.data.byteOffset, w * hh * 4), w, hh), 0, 0);
          cx.drawImage(tmp, 0, 0, cv.width, cv.height);
        } else cx.drawImage(im, 0, 0, cv.width, cv.height);
        const type = alpha ? 'image/png' : 'image/jpeg';
        const blob = await new Promise(r => cv.toBlob(r, type, 0.88));
        if (blob) res = { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || type };
      }
    } catch (e) { res = null; }
    if (!cache.keys.has(im)) cache.keys.set(im, new Map());
    cache.keys.get(im).set(tex.flipY, res);
    return res;
  },

  /** house.glb from the surfaces; fills in each surface's hash */
  async hpsGlb(surfaces) {
    const W = new HpsGlb(), doc = W.doc;
    doc.asset.generator = 'House Planner ' + APP_VERSION.n;
    doc.materials = []; doc.meshes = []; doc.nodes = [];
    const matIdx = new Map(), images = new Map(), cache = { keys: new Map() };
    const lights = [];
    const material = async m => {
      if (matIdx.has(m)) return matIdx.get(m);
      const c = m.color || new THREE.Color(1, 1, 1);
      const alpha = m.transparent ? clamp(m.opacity ?? 1, 0.02, 1) : 1;
      const out = { name: hpsText(hpsMatKey(m) || m.type, 60, 'material'), pbrMetallicRoughness: { baseColorFactor: [r6(clamp(c.r, 0, 1)), r6(clamp(c.g, 0, 1)), r6(clamp(c.b, 0, 1)), r6(alpha)],
        metallicFactor: r6(clamp(m.metalness ?? 0, 0, 1)), roughnessFactor: r6(clamp(m.roughness ?? 1, 0, 1)) } };
      if (alpha < 1) out.alphaMode = 'BLEND';
      if (alpha < 1 || m.side === THREE.DoubleSide) out.doubleSided = true;
      const img = m.map ? await this.hpsImage(m.map, alpha < 1 || m.alphaTest > 0, cache) : null;
      if (img) {
        if (!images.has(img)) {
          doc.images = doc.images || []; doc.textures = doc.textures || []; doc.samplers = doc.samplers || [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
          doc.images.push({ bufferView: W.view(img.bytes), mimeType: img.mime });
          doc.textures.push({ sampler: 0, source: doc.images.length - 1 });
          images.set(img, doc.textures.length - 1);
        }
        out.pbrMetallicRoughness.baseColorTexture = { index: images.get(img) };
        if (m.alphaTest > 0) { out.alphaMode = 'MASK'; out.alphaCutoff = r6(m.alphaTest); }
      }
      doc.materials.push(out);
      matIdx.set(m, doc.materials.length - 1);
      return doc.materials.length - 1;
    };
    for (const S of surfaces) {
      const prims = [];
      for (const P of S.prims) {
        const attrs = { POSITION: W.accessor(P.pos, 'VEC3', 5126, 34962, true), NORMAL: W.accessor(P.nrm, 'VEC3', 5126, 34962), TEXCOORD_0: W.accessor(P.uv0, 'VEC2', 5126, 34962) };
        if (P.uv1) attrs.TEXCOORD_1 = W.accessor(P.uv1, 'VEC2', 5126, 34962);
        prims.push({ attributes: attrs, indices: W.accessor(P.idx, 'SCALAR', 5125, 34963), material: await material(P.mat) });
      }
      S.hp.hash = hpSurfaceHash(S.prims.map(P => ({ pos: P.pos, uv1: P.uv1, idx: P.idx })), S.hp.bake === 'MAP' ? S.hp.uv1_px : null);
      doc.meshes.push({ name: S.hp.id, primitives: prims });
      const node = { name: S.hp.id, mesh: doc.meshes.length - 1, extras: { hp: S.hp } };
      if (S.translation) node.translation = S.translation;
      if (S.light) { lights.push({ ...S.light, name: S.hp.id }); node.extensions = { KHR_lights_punctual: { light: lights.length - 1 } }; }
      doc.nodes.push(node);
    }
    if (lights.length) { doc.extensionsUsed = ['KHR_lights_punctual']; doc.extensions = { KHR_lights_punctual: { lights } }; }
    doc.scenes = [{ name: 'house', nodes: doc.nodes.map((_, i) => i) }];
    doc.scene = 0;
    return W.bytes();
  },

  /** scene.json's recipe from the dialog's choices */
  hpsRecipe(o, q, inc, lamps) {
    const p = this.project, site = p.site || {};
    const lat = site.lat ?? 52.1, lon = site.lon ?? 5.1, north = [r6(Math.sin((site.north || 0) * Math.PI / 180)), r6(-Math.cos((site.north || 0) * Math.PI / 180))];
    const seasons = [], moments = [];
    for (const sk of ['summer', 'winter']) {
      const so = o.seasons[sk];
      if (!so || !so.on) continue;
      const S = HPS_SEASONS[sk];
      seasons.push({ id: sk, label: t(S.label), date: so.date, snow_cover: S.snow_cover, wet: S.wet, foliage: S.foliage });
      for (const mk of Object.keys(HPS_MOMENTS)) {
        if (!o.moments.includes(mk)) continue;
        const M = HPS_MOMENTS[mk], time = M.time[sk];
        const [Y, Mo, D] = so.date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
        // Dutch time (the app's sun works in it): +01:00 in winter, +02:00 in summer
        const localMs = Date.UTC(Y, Mo - 1, D, hh, mm);
        const off = dstOffsetNL(new Date(localMs - 2 * 3600000));
        const when = new Date(localMs - off * 3600000);
        const sun = sunPosition(lat, lon, when);
        const d = planDir(site, sun.az), e = sun.el * Math.PI / 180;
        moments.push({ id: `${sk}-${mk}`, label: t(M.label), season: sk, time, utc_offset: `+0${off}:00`,
          sun: { azimuth: Math.round(sun.az * 1000) / 1000 % 360, elevation: Math.round(sun.el * 1000) / 1000, direction: [r6(Math.cos(e) * d[0]), r6(Math.sin(e)), r6(Math.cos(e) * d[1])] },
          sky: { clouds: S.clouds, low_clouds: S.low, visibility: 40000 }, lamps: sun.el < 2 && lamps ? 'all' : 'none' });
      }
    }
    const cams = this.hpsceneCameras().filter(c => o.cameras.includes(c.key));
    const cameras = cams.map(c => ({ id: c.id, label: hpsText(c.label), position: c.position.map(r6), target: c.target.map(r6), fov: Math.round(clamp(c.fov, 10, 120) * 100) / 100 }))
      .filter(c => Math.hypot(c.position[0] - c.target[0], c.position[1] - c.target[1], c.position[2] - c.target[2]) > 0.01);
    const first = moments.find(m => m.sun.elevation > 5) || moments[0];
    const photos = first ? cameras.map((c, i) => ({ id: `photo-${i + 1}`, label: hpsText(c.label), camera: c.id, moment: first.id, size: [1920, 1080] })) : [];
    const levels = sortedStoreys(p).filter(st => inc.storeys.includes(st.id));
    return {
      place: { latitude: lat, longitude: lon, north, ground_level: r6(site.level ?? -0.15) },
      recipe: {
        light: o.light,
        quality: { preset: o.preset, texels_per_m: q.tpm, texels_per_m_by_group: Object.fromEntries(Object.entries(q.byGroup).filter(([k]) => inc.groups.includes(k))), samples: null, page_size: q.pageSize },
        include: { storeys: inc.storeys.slice(), groups: inc.groups.slice() },
        open_storeys: o.open ? levels.slice(0, -1).map(st => st.id) : [],
        seasons, moments, cameras, photos, videos: [],
      },
    };
  },

  /** make the .hpscene: { blob, name, doc, stats } */
  async hpsceneMake(o, progress = () => {}) {
    const p = this.project, v = p.versions.find(x => x.id === o.versionId) || this.shownVersion();
    const all = sortedStoreys(p);
    const inc = { storeys: all.map(st => st.id), groups: HPS_GROUPS.filter(g => o.groups.includes(g) && (p.site || !HPS_SITE.includes(g))) };
    if (!inc.groups.includes('house')) inc.groups.unshift('house');
    progress(t('Building the house…'));
    let dv = this.hpsView(v, inc);
    if (!dv) throw new Error(t('3D is not available on this device.'));
    try {
      // the material pictures the build asked for: wait for them, and build again with them
      if (TEXLIB && TEXLIB.idle) { const gen = dv._texGen; await TEXLIB.idle(20000); if (TEXLIB.gen !== gen) { this.hpsDrop(dv); dv = this.hpsView(v, inc); } }
      progress(t('Laying out the light maps…'));
      const items = this.hpsCollect(dv, v, inc);
      const P = HPS_QUALITY[o.preset] || HPS_QUALITY.DRAFT;
      const q = { tpm: P.tpm, byGroup: { ...P.groups }, pageSize: o.pageSize === 1024 ? 1024 : 2048, lightSpots: dv.lightSpots || [] };
      let surfaces = null;
      // too many texels for a moment (more pages than a phone should hold): first the plot, street, neighbours and park
      // at their lowest density, then – neighbours first, the own garden last – light per vertex for them, and only
      // then a lower density for the house itself
      const lower = ['houses', 'park', 'street', 'garden'];
      q.vertexGroups = new Set();
      for (let round = 0; round < 12; round++) {
        surfaces = this.hpsSurfaces(items, v, q);
        const texels = surfaces.reduce((s, S) => s + (S.hp.uv1_px ? S.hp.uv1_px[0] * S.hp.uv1_px[1] : 0), 0);
        const pages = texels / (q.pageSize * q.pageSize * 0.8);
        q.pages = pages; q.texels = texels;
        if (o.light === 'LIVE' || pages <= HPS_PAGES) break;
        const site = Object.keys(q.byGroup).filter(k => inc.groups.includes(k) && !q.vertexGroups.has(k));
        const g = lower.find(k => site.includes(k) && surfaces.some(S => S.hp.group === k && S.hp.uv1_px));
        if (site.some(k => q.byGroup[k] > 4)) for (const k of site) q.byGroup[k] = 4;
        else if (g) q.vertexGroups.add(g);
        else if (q.tpm > 4) q.tpm = Math.max(4, Math.floor(q.tpm * Math.sqrt(HPS_PAGES / pages) * 0.97 * 100) / 100);
        else break;
      }
      // ids must be unique: a second piece of the same name (should not happen) gets a number
      const seen = new Set();
      for (const S of surfaces) { let id = S.hp.id, n = 1; while (seen.has(id)) id = `${S.hp.id}.${n++}`; S.hp.id = id; seen.add(id); }
      progress(t('Writing the file…'));
      const glb = await this.hpsGlb(surfaces);
      const lamps = surfaces.filter(S => S.light).map(S => S.hp.id);
      const R = this.hpsRecipe(o, q, inc, lamps.length);
      const pairs = {};
      for (const S of surfaces) pairs[S.hp.id] = S.hp.hash;
      const intLevel = (st, i) => (Number.isInteger(st.level) ? st.level : i - Math.max(0, all.findIndex(s => (s.elevation || 0) >= -0.5)));
      const doc = {
        format: 'house-scene', version: HPS_FORMAT, generator: { app: 'House Planner', version: String(APP_VERSION.n) },
        id: 'hp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), created: new Date().toISOString(), title: hpsText(p.name, 120, 'House'),
        house: { version_id: hpsName(v.id), version_name: hpsText(v.name || (v.kind === 'original' ? t('Original') : t('Version'))) },
        files: { house: 'house.glb' }, hash: HP_HASH, uv1: HP_UV1, scene_hash: hpSceneHash(pairs),
        place: R.place,
        storeys: all.map((st, i) => ({ id: st.id, name: hpsText(st.name, 120, 'Storey ' + (i + 1)), level: intLevel(st, i), elevation: r6(st.elevation || 0), height: r6(st.height || st.wallHeight || 2.8) })),
        recipe: R.recipe,
      };
      const files = [['scene.json', new TextEncoder().encode(JSON.stringify(doc, null, 1)), true], ['house.glb', glb, false]];
      const blob = await hpsZip(files);
      const stats = { surfaces: surfaces.length, map: surfaces.filter(S => S.hp.bake === 'MAP').length, vertex: surfaces.filter(S => S.hp.bake === 'VERTEX').length,
        no: surfaces.filter(S => S.hp.bake === 'NO').length, lamps: lamps.length, texels: q.texels, pages: Math.round(q.pages * 100) / 100, tpm: q.tpm, byGroup: q.byGroup,
        glbBytes: glb.length, vertexGroups: [...q.vertexGroups], bytes: blob.size, triangles: surfaces.reduce((s, S) => s + S.prims.reduce((a, P) => a + P.idx.length / 3, 0), 0) };
      return { blob, name: `${slugify(p.name)}_${todayStamp()}.hpscene`, doc, stats, ids: surfaces.map(S => [S.hp.id, S.hp.hash]) };
    } finally { this.hpsDrop(dv); }
  },

  /** Export → For Fresing Render…: the recipe in a short dialog, the rest under More */
  async hpsceneDialog() {
    const p = this.project;
    if (!p) return;
    if (p.viewer) { this.toast(t('A copy for viewing cannot be exported for Fresing Render.')); return; }
    const o = this.hpsceneDefaults();
    const seg = (id, opts, val, on) => {
      const box = h('div', { class: 'seg', id, role: 'group' });
      const draw = () => { for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.k === String(val))); };
      for (const [k, label, title] of opts) box.appendChild(h('button', { type: 'button', 'data-k': k, title: title || null, onclick: () => { val = k; on(k); draw(); } }, label));
      draw();
      return box;
    };
    const chk = (id, label, on, change, note) => {
      const inp = h('input', { type: 'checkbox', id, checked: !!on });
      inp.addEventListener('change', () => change(inp.checked));
      return h('label', { class: 'check', for: id }, inp, h('span', null, label, note ? h('br') : null, note ? h('span', { class: 'note-muted' }, note) : null));
    };
    const verSel = h('select', { id: 'hps-version', onchange: e => { o.versionId = e.target.value; } },
      ...p.versions.map(x => h('option', { value: x.id, selected: x.id === o.versionId }, x.kind === 'original' ? `${x.name || t('Original')} (${t('original')})` : x.name)));
    const dateIn = (k) => { const d = h('input', { type: 'date', id: `hps-date-${k}`, value: o.seasons[k].date }); d.addEventListener('change', () => { if (/^\d{4}-\d\d-\d\d$/.test(d.value)) o.seasons[k].date = d.value; }); return d; };
    const groupsBox = h('div', { class: 'hps-groups', id: 'hps-groups' });
    const GL = [['house', t('House')], ['furniture', t('Furniture')], ['installs', t('Electrics')], ['ceilItems', t('Ceiling')], ['garden', t('Garden')], ['street', t('Street')], ['houses', t('Neighbours')], ['park', t('Water & park')]];
    for (const [k, label] of GL) {
      if (HPS_SITE.includes(k) && !p.site) continue;
      const c = chk(`hps-g-${k}`, label, o.groups.includes(k), on => { o.groups = on ? [...o.groups, k] : o.groups.filter(x => x !== k); });
      if (k === 'house') c.querySelector('input').disabled = true;
      groupsBox.appendChild(c);
    }
    const momentsBox = h('div', { class: 'hps-moments', id: 'hps-moments' });
    for (const k of Object.keys(HPS_MOMENTS)) momentsBox.appendChild(chk(`hps-m-${k}`, t(HPS_MOMENTS[k].label), o.moments.includes(k), on => { o.moments = on ? [...o.moments, k] : o.moments.filter(x => x !== k); }));
    const cams = this.hpsceneCameras();
    const camBox = h('div', { class: 'hps-cams', id: 'hps-cams' });
    for (const c of cams) camBox.appendChild(chk(`hps-c-${c.key}`, c.label, o.cameras.includes(c.key), on => { o.cameras = on ? [...o.cameras, c.key] : o.cameras.filter(x => x !== c.key); }));
    if (!cams.length) camBox.appendChild(h('span', { class: 'note-muted' }, t('No 3D view or saved viewpoint yet.')));
    const status = h('p', { class: 'note-muted', id: 'hps-status', 'aria-live': 'polite' });
    const body = h('div', { class: 'hps-dialog', style: { display: 'grid', gap: '12px' } },
      h('p', null, t('A house scene for Fresing Render on your PC: it bakes real light, snow and photos for this version. Open the file there with File > Import > House Planner scene.')),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, t('Version')), verSel),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Light')), seg('hps-light', [['SOFT', t('Soft'), t('Sky and bounce light baked, the sun stays live')], ['ALL', t('All'), t('Sun, sky and lamps baked')], ['LIVE', t('Live'), t('Nothing baked: only snow and photos')]], o.light, k => { o.light = k; })),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Quality')), seg('hps-quality', [['DRAFT', t('Draft')], ['NORMAL', t('Normal')], ['FINE', t('Fine')]], o.preset, k => { o.preset = k; })),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Seasons')),
        h('div', { class: 'hps-season' }, chk('hps-s-summer', t('Summer'), o.seasons.summer.on, on => { o.seasons.summer.on = on; }), dateIn('summer')),
        h('div', { class: 'hps-season' }, chk('hps-s-winter', t('Winter with snow'), o.seasons.winter.on, on => { o.seasons.winter.on = on; }), dateIn('winter'))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Moments')), momentsBox),
      h('details', { class: 'hps-more', id: 'hps-more' }, h('summary', null, t('More')),
        h('div', { style: { display: 'grid', gap: '10px', marginTop: '8px' } },
          h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('What to include')), groupsBox),
          chk('hps-open', t('Each storey also open from above'), o.open, on => { o.open = on; }, t('As the app shows one storey without the ones above it.')),
          h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Photos')), camBox),
          h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Light-map pages')), seg('hps-page', [['2048', t('PC (2048)')], ['1024', t('Phone (1024)')]], String(o.pageSize), k => { o.pageSize = +k; })))),
      status);
    const go = await UI.dialog({ title: t('For Fresing Render'), body, actions: [
      { label: 'Cancel', value: null },
      { label: t('Save file'), value: 'save', kind: 'primary', icon: 'download', validate: () => {
        if (!o.moments.length || !Object.values(o.seasons).some(s => s.on)) { status.textContent = t('Pick at least one season and one moment.'); return false; }
        return true;
      } },
    ] });
    if (!go) return;
    this.toast(t('Making the house scene…'));
    try {
      const res = await this.hpsceneMake(o, msg => { status.textContent = msg; });
      this._hpsLast = res;
      this.downloadBlob(res.name, res.blob);
      this.toast(t('{name} saved: {n} surfaces, {size}.', { name: res.name, n: res.stats.surfaces, size: fmtBytes(res.blob.size) }));
    } catch (e) {
      console.error(e);
      this.toast(t('The house scene could not be made: {e}', { e: String(e && e.message || e) }));
    }
  },
});
