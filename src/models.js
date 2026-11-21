/* ───────────── models.js — real 3D models as furniture ─────────────
   1. The built-in library: 113 pieces of the Kenney Furniture Kit 2.0 (CC0 1.0, www.kenney.nl), packed by
      tools/pack-models.mjs into MODEL_LIB: names, real sizes, flags and top-view outlines (always there), and one
      gzip'd blob of geometry that is unpacked the first time a model is shown in 3D (a few milliseconds).
      The single file has the blob inside (MODEL_LIB_BLOB); the hosted versions take it from the asset library (library.js,
      item 'pack:kenney') the first time a model is shown.
   1b. Models of the asset library (task 0009; the owner's models in his library): key 'l:<name>', a .glb (meshopt-packed
      geometry) loaded the first time it is shown. On a device without that library a piece of it is a plain box in its
      colour, and its panel says the library is not loaded – the piece itself stays as it was saved. In Add furniture they
      are under Library, by room (the item's cat: the room column of the owner's contents.csv, task 0028), each with
      the picture made when the library was built (house/models/thumbs, tools/model-thumbs.py) – never drawn at start.
   2. Your own models: .glb / .gltf, .obj (+ .mtl and pictures) and .ifc files. They are kept with the house as a
      .glb asset (project.models[id] = { name, cat, asset, file, fix: {ry, zup, unit}, size, o, u, rev }), so they
      travel with an export.
   A model piece is a furniture item { type: 'model', model: 'k:<id>' | 'u:<id>', w, d, h, color, … }. The model is
   stretched to w × d × h, so any piece can be resized. Its 2D symbol is the model's outline seen from above
   (src/outline.js), filled with the piece's colour; its Colour changes the model's main material.
   Model frame (as all furniture): x right, y (3D: z) to the FRONT, back at -d/2; in 3D the model sits in the
   box x, z ∈ [-0.5, 0.5], y ∈ [0, 1] and is scaled by (w, h, d). Normals are stored for that unit box, so the
   scaling (inverse transpose) gives the right shading at any size. */

/* ───────── three.js add-ons (packed by build.py; unpacked on first use) ───────── */
let _addonMods = null;
const _addonDone = {};
async function addon(key) {
  if (!_addonMods) _addonMods = gunzipBase64(ADDONS_GZ).then(txt => new Function(txt)());
  const mods = await _addonMods;
  const req = k => _addonDone[k] || (_addonDone[k] = mods[k](THREE, req));
  return req(key);
}

/* ───────── the library ───────── */
const MLIB = new Map(((typeof MODEL_LIB !== 'undefined' && MODEL_LIB) ? MODEL_LIB.models : []).map(m => [m.id, m]));
const MLIB_MATS = (typeof MODEL_LIB !== 'undefined' && MODEL_LIB) ? MODEL_LIB.mats.map(m => m[0]) : [];
/* Kenney's colours are bright toy colours; these are calmer, closer to real furniture */
const MODEL_PALETTE = {
  wood: '#C9A27A', woodDark: '#8A6A4C', metal: '#C4CACC', metalLight: '#ECEEEE', metalMedium: '#7A8285', metalDark: '#3F4548',
  carpet: '#8E9196', carpetWhite: '#F3F2EF', carpetBlue: '#5F7896', carpetDarker: '#6E6862', glass: '#CFE0DC', lamp: '#FFF1C9',
  plant: '#5E8B4D', fur: '#A9794F', _defaultMat: '#F7F7F5',
};
const MODELS = {
  blob: null, blobP: null,     // the unpacked library geometry (ArrayBuffer)
  lib: new Map(),              // asset library model id ('l:…') → { state, obj (unit-box template), p }
  geo: new Map(),              // library id → [{ geo, mat }] (shared by every piece, never disposed)
  user: new Map(),             // your model id → { sig, state, obj (unit-box template), p }
  types: new Map(),            // furniture type objects of models (see modelType)
};

/** a model you import is kept inside the house (like a photo): every save, backup and export carries it and a phone
 *  holds it in memory while it is shown – 25 MB is about five of the owner's makers' sofas at full detail (task 0028) */
const MODEL_MAX_BYTES = 25 * 1024 * 1024;

/** the rooms of the library's models (the room column of contents.csv), in this order under Library */
const LIB_ROOMS = [
  ['living-room', 'Living room'], ['dining', 'Dining room'], ['kitchen', 'Kitchen'], ['bedroom', 'Bedroom'], ['office', 'Office'],
  ['bathroom', 'Bathroom'], ['outside', 'Outside'], ['lighting', 'Lighting'], ['decor', 'Decoration'], ['switches-sockets', 'Switches and sockets'], ['floors-materials', 'Floors and materials'],
];
const libRoomLabel = k => (LIB_ROOMS.find(r => r[0] === k) || [k, String(k || 'Other').replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase())])[1];
/** the models of the asset libraries on this device (the owner's), by room order then name */
function libModelList() {
  const order = k => { const i = LIB_ROOMS.findIndex(r => r[0] === k); return i < 0 ? 99 : i; };
  return [...LIB.items.values()].filter(it => it.kind === 'model').map(it => modelInfo(it.id)).filter(Boolean)
    .sort((a, b) => order(a.room) - order(b.room) || a.name.localeCompare(b.name));
}
/** models this build expects in its library (the owner's app: his models; 0 in the public app and the web version) */
const libModelsExpected = () => (typeof LIB_HOUSE_MODELS !== 'undefined' && LIB_HOUSE_MODELS) || 0;

function loadModelLib() {
  if (!MODELS.blobP) {
    const inside = typeof MODEL_LIB_BLOB !== 'undefined' && MODEL_LIB_BLOB;
    MODELS.blobP = (inside ? gunzipBase64Bytes(MODEL_LIB_BLOB)
      : typeof MODEL_LIB !== 'undefined' && MODEL_LIB ? libraryInit().then(() => { const it = libItem(MODEL_LIB.pack); return it ? libGunzip(it.files[0].f) : null; })
        .then(buf => { if (!buf) throw new Error('the models\' geometry is not in the library on this device'); return buf; })
        : Promise.reject(new Error('no library')))
      .then(buf => { MODELS.blob = buf; modelsLoaded(); return buf; })
      .catch(e => { console.warn('model library', e); MODELS.blobP = null; return null; });
  }
  return MODELS.blobP;
}

/** the parts (geometry + material name) of a library model; null while the library is being unpacked */
function libParts(id) {
  let parts = MODELS.geo.get(id);
  if (parts) return parts;
  const m = MLIB.get(id);
  if (!m) return [];
  if (!MODELS.blob) { loadModelLib(); return null; }
  const B = MODELS.blob;
  let off = m.off;
  parts = [];
  for (const [mi, v, ic] of m.p) {
    const q = new Uint16Array(B, off, v * 3); off += v * 6;
    const idx = new Uint16Array(B, off, ic); off += ic * 2;
    const nb = new Int8Array(B, off, v * 3); off += v * 3 + (v * 3) % 2;
    const pos = new Float32Array(v * 3), nrm = new Float32Array(v * 3);
    for (let i = 0; i < v; i++) {
      pos[i * 3] = q[i * 3] / 65535 - 0.5; pos[i * 3 + 1] = q[i * 3 + 1] / 65535; pos[i * 3 + 2] = q[i * 3 + 2] / 65535 - 0.5;
      const a = nb[i * 3], b = nb[i * 3 + 1], c = nb[i * 3 + 2], L = Math.hypot(a, b, c) || 1;
      nrm[i * 3] = a / L; nrm[i * 3 + 1] = b / L; nrm[i * 3 + 2] = c / L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    g.userData.keep = true;
    parts.push({ geo: g, mat: MLIB_MATS[mi] });
  }
  MODELS.geo.set(id, parts);
  return parts;
}

/** what we know of a model: name, category, real size [w, d, h], flags, outline … (library or your own) */
function modelInfo(key) {
  if (!key) return null;
  if (key.startsWith('k:')) {
    const m = MLIB.get(key.slice(2));
    if (!m) return null;
    return m._info || (m._info = { key, lib: true, name: m.n, cat: m.c, size: m.s, flags: m.f || {}, o: m.o || [], u: m.u || [], main: m.main, color: m.col || MODEL_PALETTE[m.main] || '#B7B2A8' });
  }
  if (key.startsWith('l:')) {
    // (on a device without that library: unknown – a plain box, see modelMesh)
    const it = libItem(key);
    if (!it || it.kind !== 'model') return null;
    return it._info || (it._info = { key, lib: true, asset: true, name: it.name, cat: it.cat || 'other', room: it.cat || 'other', size: it.size, flags: it.flags || {}, o: it.o || [], u: it.u || [], color: it.color || '#B7B2A8',
      // (the free models of the public library say where they are from; the owner's own files don't)
      credit: !it.private && it.licence ? { source: String(it.source || '').replace(/\s*\(.*$/, ''), licence: it.licence } : null,
      thumb: (it.files || []).find(v => v.thumb) || null });
  }
  if (key.startsWith('u:')) {
    const rec = app.project && app.project.models && app.project.models[key.slice(2)];
    if (!rec) return null;
    return { key, lib: false, name: rec.name, cat: rec.cat || 'mine', size: rec.size || [1, 1, 1], flags: rec.flags || {}, o: rec.o || [], u: rec.u || [], color: '#B7B2A8', rec };
  }
  return null;
}

/** the furniture type of a model piece (furnType() comes here for type 'model') */
function modelType(item) {
  const info = modelInfo(item.model);
  const sig = (item.model || '') + (info && info.rec ? '|' + (info.rec.rev || 0) + '|' + info.rec.name : info ? '' : '|missing');
  let T = MODELS.types.get(sig);
  if (!T) {
    const f = (info && info.flags) || {};
    T = {
      id: 'model', kind: 'model', isModel: true, cat: info ? info.cat : 'other', name: info ? info.name : (item.model || '').startsWith('l:') ? '3D model (library not loaded)' : '3D model (missing)',
      w: info ? info.size[0] : 1, d: info ? info.size[1] : 1, h: info ? info.size[2] : 1, color: info ? info.color : '#B7B2A8',
      wall: !!f.wall, front: f.front, sides: f.sides, tuck: !!f.tuck, flat: !!f.flat, high: !!f.high, z: f.z,
      ceiling: !!f.ceiling, light: !!f.light, lamp: f.light || null,
      // a model kept under Outside (a car): it does not put its back against a wall
      noWall: !!(info && info.cat === 'outside'),
    };
    MODELS.types.set(sig, T);
  }
  return T;
}

/** a new piece of a model, at x, y on a storey */
function newModelPiece(key, storey, x, y, rot = 0) {
  const info = modelInfo(key);
  const s = info ? info.size : [1, 1, 1];
  return { id: uid('f_'), type: 'model', model: key, storey, x: +x.toFixed(3), y: +y.toFixed(3), rot, w: s[0], d: s[1], h: s[2], color: info ? info.color : '#B7B2A8', shop: {} };
}

/* ───────── 2D: the outline seen from above ───────── */
function modelSymbol(it) {
  const info = modelInfo(it.model);
  const X = fx(it.w / 2), Y = fx(it.d / 2);
  if (!info || !info.o.length) return [{ d: F2.rect(-X, -Y, X, Y), c: 'o' }, { d: F2.line(-X, -Y, X, Y) + F2.line(-X, Y, X, -Y), c: 'l' }];
  const path = loops => loops.map(l => { let s2 = ''; for (let i = 0; i < l.length; i += 2) s2 += (i ? 'L' : 'M') + fx(l[i] * it.w) + ' ' + fx(l[i + 1] * it.d); return s2 + 'Z'; }).join('');
  const out = [{ d: path(info.o), c: 'o' }];
  if (info.u.length) out.push({ d: path(info.u), c: 'l' });
  return out;
}

/* ───────── 3D ───────── */
const lum = hex => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
/** the material of one part of a library model; the piece's colour goes to its main material (and its darker
 *  shade, e.g. a rug's border) */
function libMat(name, it, info, evening, T) {
  let col = MODEL_PALETTE[name];
  if (!col) { const m = MODEL_LIB.mats.find(x => x[0] === name); col = m ? '#' + new THREE.Color(m[1], m[2], m[3]).getHexString() : '#B7B2A8'; }
  const main = info.main;
  if (it.color && main && (name === main || name === main + 'Dark' || name === main + 'Darker')) {
    col = name === main ? it.color : tint(it.color, clamp(lum(MODEL_PALETTE[name] || col) / Math.max(0.05, lum(MODEL_PALETTE[main] || col)), 0.3, 1.2));
  }
  if (name === 'glass') return fmat(col, { opacity: 0.32, rough: 0.12 });
  if (name === 'lamp') return fmat(col, evening && T.light ? { emissive: '#FFE2A8', ei: 1.6, rough: 0.6 } : { rough: 0.6 });
  if (name.startsWith('metal')) return fmat(col, { rough: 0.5, metal: 0.15 });
  return fmat(col);
}

function modelMesh(it, ceilingH, evening) {
  const T = furnType(it);
  const g = new THREE.Group();
  const key = it.model || '';
  const info = modelInfo(key);
  let inner = null;
  if (key.startsWith('k:') && info) {
    const parts = libParts(key.slice(2));
    if (parts) {
      inner = new THREE.Group();
      for (const p of parts) {
        const me = new THREE.Mesh(p.geo, libMat(p.mat, it, info, evening, T));
        me.castShadow = p.mat !== 'glass' && p.mat !== 'lamp'; me.receiveShadow = true; me.userData.keep = true;
        inner.add(me);
      }
    }
  } else if (key.startsWith('l:') && info) {
    const tpl = libModelTemplate(key);
    if (tpl) {
      inner = tpl.clone(true);
      inner.traverse(o => { if (o.isMesh) { o.userData.keep = true; o.castShadow = true; o.receiveShadow = true; } });
    }
  } else if (key.startsWith('u:') && info) {
    const tpl = userModelTemplate(key.slice(2));
    if (tpl) {
      inner = tpl.clone(true);
      inner.traverse(o => { if (o.isMesh) { o.userData.keep = true; o.castShadow = true; o.receiveShadow = true; } });
    }
  }
  if (inner) { inner.scale.set(Math.max(0.005, it.w), Math.max(0.005, it.h), Math.max(0.005, it.d)); g.add(inner); }
  else if (key.startsWith('l:') && (!info || (MODELS.lib.get(key) || {}).state === 'error')) {
    // a model of a library that is not on this device: a plain box of the piece's size, in its colour
    const me = new THREE.Mesh(new THREE.BoxGeometry(it.w, Math.max(0.01, it.h), it.d), fmat(it.color || '#B7B2A8'));
    me.position.y = Math.max(0.01, it.h) / 2;
    me.castShadow = me.receiveShadow = true;
    me.userData.libMissing = key;
    g.add(me);
  } else {
    // still unpacking (or missing): a see-through box of the right size
    const me = new THREE.Mesh(new THREE.BoxGeometry(it.w, Math.max(0.01, it.h), it.d), fmat(info ? '#9AA3A6' : '#C0504D', { opacity: 0.35 }));
    me.position.y = Math.max(0.01, it.h) / 2;
    g.add(me);
  }
  return g;
}

/** a model was unpacked or read: redo the furniture in the 3D views (the house stays) */
let _mlTimer = 0;
function modelsLoaded() {
  clearTimeout(_mlTimer);
  _mlTimer = setTimeout(() => {
    if (!app.project) return;
    for (const pane of app.panes || []) if (pane.kind === '3d' && pane.view && pane.view.ok && pane.view.spec) pane.view.updateFurniture();
    if (app.pip && app.pip.ok && app.pip.spec) app.pip.updateFurniture();
  }, 30);
}

/** a library came or went (Settings → Library): the pictures this device asks for, and the pieces of its models
 *  again (boxes become models, or the other way round) */
function libAfterLoad() {
  libUpgrade();
  MODELS.lib.clear();
  MODELS.types.clear();
  if (!MODELS.blob) MODELS.blobP = null;
  for (const it of LIB.items.values()) delete it._info;
  if (app.project) { app.refreshViews(false); if (app.renderInspector) app.renderInspector(); }
  // (documents whose files are in the library: copied into the open house now – task 0022)
  if (app.project && (app.project.docs || []).some(d => d.lib) && typeof docsFromLibrary === 'function') docsFromLibrary(app.project).catch(e => console.warn('docs', e));
}

/** the Kenney models' packed geometry as base64, for a copy for viewing made from a hosted version (which has it in its
 *  library only); null where the app has it inside or it can't be had */
async function modelPackB64() {
  if ((typeof MODEL_LIB_BLOB !== 'undefined' && MODEL_LIB_BLOB) || typeof MODEL_LIB === 'undefined' || !MODEL_LIB) return null;
  if (MODELS.packB64) return MODELS.packB64;
  try {
    await libraryInit();
    const it = libItem(MODEL_LIB.pack), b = it && await libBlob(it.files[0].f);
    MODELS.packB64 = b ? await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); }) : null;
  } catch (e) { MODELS.packB64 = null; }
  return MODELS.packB64;
}

/* ───────── your own models ───────── */
async function parseGlbBytes(buf) {
  const { GLTFLoader } = await addon('loaders/GLTFLoader.js');
  // (the library's models have their geometry packed with meshopt)
  const { MeshoptDecoder } = await addon('libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return await new Promise((res, rej) => loader.parse(buf, '', g => res(g.scene), e => rej(e && e.message ? new Error(e.message) : new Error('The model could not be read.'))));
}
/** a model's pictures no larger than this device asks for (libWantPx: 512 unless 0010 says more; the Pixel's PowerVR
 *  driver is fragile, and a maker's model brings four or five 1024 px pictures – 10 of the owner's models were 11.5
 *  million pixels before, task 0028); returns how many were made smaller */
function capModelTextures(obj, max = libWantPx()) {
  const seen = new Set();
  let n = 0;
  obj.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) for (const k in m) {
      const tx = m[k];
      if (!tx || !tx.isTexture || seen.has(tx)) continue;
      seen.add(tx);
      const im = tx.image;
      const w = im && (im.width || im.naturalWidth), hh = im && (im.height || im.naturalHeight);
      if (!w || !hh || Math.max(w, hh) <= max) continue;
      try {
        const k2 = max / Math.max(w, hh), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * k2)); cv.height = Math.max(1, Math.round(hh * k2));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        if (im.close) im.close();
        tx.image = cv; tx.needsUpdate = true; n++;
      } catch (e) { /* kept as it is */ }
    }
  });
  return n;
}
/** the unit-box template of a model of the asset library ('l:…'); null while it is being read (or not on this device) */
function libModelTemplate(key) {
  const cur = MODELS.lib.get(key);
  if (cur) return cur.state === 'ready' ? cur.obj : null;
  const entry = { state: 'loading', obj: null };
  entry.p = (async () => {
    try {
      const it = libItem(key);
      const b = it && await libBlob(it.files[0].f);
      if (!b) throw new Error('not on this device');
      const obj = await parseGlbBytes(await b.arrayBuffer());
      capModelTextures(obj);
      entry.obj = unitTemplate(obj);
      entry.state = 'ready';
    } catch (e) { entry.state = 'error'; entry.err = e; console.warn('library model', key, e); }
    modelsLoaded();
    return entry;
  })();
  MODELS.lib.set(key, entry);
  return null;
}

/** the model turned upright and facing the front, centred, standing on y = 0, squeezed into the unit box:
 *  root (scale = the piece's size) → unit (1 / model size) → off (centre) → fix (turns) → the model */
function unitTemplate(obj, fix = {}) {
  const fixG = new THREE.Group();
  fixG.add(obj);
  if (fix.zup) obj.rotation.x = -Math.PI / 2;
  fixG.rotation.y = -(fix.ry || 0) * Math.PI / 180;
  const off = new THREE.Group(); off.add(fixG);
  const unit = new THREE.Group(); unit.add(off);
  const root = new THREE.Group(); root.add(unit);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fixG, true);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  off.position.set(-c.x, -box.min.y, -c.z);
  unit.scale.set(1 / Math.max(size.x, 1e-6), 1 / Math.max(size.y, 1e-6), 1 / Math.max(size.z, 1e-6));
  root.updateMatrixWorld(true);
  root.userData.size = [size.x, size.z, size.y];   // as [w, d, h] in the model's own units
  return root;
}

/** the unit-box template of one of your models; null while it is being read */
function userModelTemplate(id) {
  const rec = app.project && app.project.models && app.project.models[id];
  if (!rec) return null;
  const sig = rec.asset + '|' + JSON.stringify(rec.fix || {});
  const cur = MODELS.user.get(id);
  if (cur && cur.sig === sig) return cur.state === 'ready' ? cur.obj : null;
  const entry = { sig, state: 'loading', obj: null };
  entry.p = (async () => {
    try {
      await Assets.ensure([rec.asset]);
      const a = Assets.get(rec.asset);
      if (!a) throw new Error('The model file is missing.');
      const bytes = dataUrlBytes(a.url);
      const obj = await parseGlbBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      capModelTextures(obj);
      entry.obj = unitTemplate(obj, rec.fix);
      entry.state = 'ready';
    } catch (e) { entry.state = 'error'; entry.err = e; console.warn('model', id, e); }
    modelsLoaded();
    return entry;
  })();
  MODELS.user.set(id, entry);
  return null;
}
async function modelReady(key) {
  if (key.startsWith('k:')) { await loadModelLib(); return; }
  if (key.startsWith('l:')) { libModelTemplate(key); const e = MODELS.lib.get(key); if (e && e.p) await e.p; return; }
  const id = key.slice(2);
  userModelTemplate(id);
  const e = MODELS.user.get(id);
  if (e && e.p) await e.p;
}

/** triangles of an object in its unit box (9 numbers per triangle), for the 2D outline */
function unitTris(root) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    const M = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
    for (let i = 0; i < n; i++) {
      const k = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(pos, k).applyMatrix4(M);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

/** an IFC file (a kitchen, a bath from a manufacturer …) → one object, y up */
function ifcObject(text) {
  const m = IFC.parse(text);
  const skip = new Set(['IFCOPENINGELEMENT', 'IFCSPACE', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCPROJECT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT']);
  const byCol = new Map();
  for (const e of m.ents.values()) {
    if (skip.has(e.t) || !e.a || e.a.length < 7 || !e.a[6]) continue;
    const pds = m.get(e.a[6]);
    if (!pds || pds.t !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    let groups;
    try { groups = m.productPolys(e.id); } catch (err) { continue; }
    for (const g of groups) {
      const st = g.style;
      const col = st ? '#' + new THREE.Color(st.rgb[0], st.rgb[1], st.rgb[2]).getHexString() : '#B7B2A8';
      const key = col + '|' + (st && st.alpha < 0.99 ? st.alpha.toFixed(2) : '1');
      if (!byCol.has(key)) byCol.set(key, []);
      const arr = byCol.get(key);
      for (const p of IFC.polysToTris(g.polys)) arr.push(p[0], p[2], -p[1]);   // IFC z up → y up
    }
  }
  const root = new THREE.Group();
  for (const [key, arr] of byCol) {
    if (!arr.length) continue;
    const [col, a] = key.split('|');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    geo.computeVertexNormals();
    const alpha = parseFloat(a);
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.75, transparent: alpha < 1, opacity: alpha })));
  }
  if (!root.children.length) throw new Error('No shapes found in this IFC file.');
  return root;
}

/** Phong / Lambert materials (OBJ + MTL) → standard ones, which the .glb keeps best */
function standardMaterials(obj) {
  const conv = new Map();
  const one = m => {
    if (!m || m.isMeshStandardMaterial || m.isMeshBasicMaterial) return m;
    if (conv.has(m)) return conv.get(m);
    const n = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xcccccc, map: m.map || null, roughness: 0.8, metalness: 0, transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side, name: m.name });
    conv.set(m, n);
    return n;
  };
  obj.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  return obj;
}
async function exportGlb(obj) {
  standardMaterials(obj);
  const { GLTFExporter } = await addon('exporters/GLTFExporter.js');
  const res = await new GLTFExporter().parseAsync(obj, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  return new Uint8Array(res);
}

/** a guess at the unit of a model: metres unless it is far too big for furniture */
function guessUnit(size) {
  const m = Math.max(size[0], size[1], size[2]);
  if (m > 600) return 0.001;
  if (m > 8) return 0.01;
  return 1;
}

/* ───────── thumbnails for the catalogue (one small offscreen renderer, one picture at a time) ───────── */
const THUMB = { r: null, cache: new Map(), queue: Promise.resolve(), idle: 0 };
function modelThumb(key, color) {
  const info = modelInfo(key);
  const ck = key + '|' + (color || '') + '|' + (info && info.rec ? info.rec.rev || 0 : '');
  if (THUMB.cache.has(ck)) return THUMB.cache.get(ck);
  const p = THUMB.queue = THUMB.queue.then(() => renderThumb(key, color)).catch(e => { console.warn('thumb', e); return null; });
  THUMB.cache.set(ck, p);
  return p;
}
function thumbRenderer() {
  clearTimeout(THUMB.idle);
  THUMB.idle = setTimeout(() => { if (THUMB.r) { THUMB.r.dispose(); THUMB.r.forceContextLoss(); THUMB.r = null; } }, 20000);
  if (THUMB.r) return THUMB.r;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(240, 180, false);
  r.setClearColor(0x000000, 0);
  THUMB.r = r;
  return r;
}
async function renderThumb(key, color, opts = {}) {
  await modelReady(key);
  const info = modelInfo(key);
  if (!info) return null;
  const s3 = info.size;
  const it = { type: 'model', model: key, w: s3[0], d: s3[1], h: Math.max(0.02, s3[2]), color: color || info.color, rot: 0 };
  const obj = modelMesh(it, 2.6, false);
  const url = objThumb(obj, opts);
  obj.traverse(o => { if (o.isMesh && !o.userData.keep) o.geometry.dispose(); });
  return url;
}
/** a picture of a .glb (tools/model-thumbs.py makes the library's pictures with it when the library is built):
 *  as in the catalogue, at the model's real size [w, d, h] when given; a WebP data URL */
async function glbThumb(bytes, size) {
  const tpl = unitTemplate(await parseGlbBytes(bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  const s3 = size || tpl.userData.size;
  tpl.scale.set(Math.max(0.01, s3[0]), Math.max(0.01, s3[2]), Math.max(0.01, s3[1]));
  objThumb(tpl);
  return THUMB.r.domElement.toDataURL('image/webp', 0.86);
}
/** a picture of any object: from the front right, a little above (or straight from above) */
function objThumb(obj, opts = {}) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(2, 4, 3); scene.add(sun);
  const parent = obj.parent;
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
  const cam = new THREE.PerspectiveCamera(26, 4 / 3, 0.01, 1000);
  const dir = opts.top ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0.75, 0.62, 1.0).normalize();
  cam.position.copy(c).addScaledVector(dir, r / Math.sin(13 * Math.PI / 180) * 0.92);
  cam.lookAt(c);
  const R = thumbRenderer();
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(obj);
  if (parent) parent.add(obj);
  return url;
}

/* ───────── app: catalogue cards, adding, importing, your models ───────── */
Object.assign(app, {
  addModel(key) {
    if (this.view.scope !== 'storey') this.setScope('storey', this.view.storeyId || sortedStoreys(this.project)[0].id);
    const { storey, p } = this.placementPoint();
    const it = newModelPiece(key, storey, p[0], p[1], 0);
    const spot = this.freeSpot(it);
    if (spot) { it.x = spot[0]; it.y = spot[1]; }
    this.furnMutate(l => { l.items.push(it); });
    this.select({ type: 'furn', ids: [it.id] });
    modelReady(key);
    // (as addFurniture, task 0020: into view, big enough to grab)
    const main = (this.panes || []).find(x => x.role === 'main');
    if (main && main.kind === '2d' && main.view.showPoint) setTimeout(() => { if (main.view.showPoint && main.view.spec) main.view.showPoint([it.x, it.y], Math.max(1.6, Math.max(it.w, it.d) + 0.6)); }, 350);
    this.toast(t('{n} added. Drag it into place; the round handle turns it.', { n: furnName(it) }));
    return it;
  },

  /** catalogue cards for models (lazy 3D pictures) */
  modelCards(list, onPick) {
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); en.target._load(); }
    }, { rootMargin: '120px' }) : null;
    return list.map(info => {
      const prev = furnPreview({ type: 'model', model: info.key, w: info.size[0], d: info.size[1], h: info.size[2], color: info.color, rot: 0, x: 0, y: 0 });
      const holder = h('span', { class: 'cc-pic' }, prev);
      const card = h('button', { class: 'cat-card model-card', 'data-model': info.key, onclick: () => onPick(info) }, holder,
        h('span', { class: 'cc-name' }, t(info.name)),
        h('span', { class: 'cc-size num' }, `${Math.round(info.size[0] * 100)} × ${Math.round(info.size[1] * 100)}`, h('span', { class: 'cc-3d' }, '3D')));
      card._load = () => (info.thumb ? libUrl(info.thumb.f).then(u => u || modelThumb(info.key)) : modelThumb(info.key)).then(url => { if (url) { holder.textContent = ''; const img = h('img', { src: url, alt: '', class: 'cc-img' });
        // (a damaged library picture: drawn here after all)
        if (info.thumb && url.startsWith('blob:')) img.onerror = () => { img.onerror = null; modelThumb(info.key).then(u => { if (u) img.src = u; }); };
        holder.appendChild(img); } });
      if (io) io.observe(card); else card._load();
      return card;
    });
  },
  /** Add furniture → Library: the library's models by room (chips: All + the rooms there are), or – the single file
   *  without its library – one line on where to get it, with Load library… right there */
  libCatalog(grid, room, setRoom, onPick, repaint) {
    const all = libModelList();
    if (!all.length) {
      const inp = h('input', { type: 'file', accept: '.zip,application/zip', style: { display: 'none' } });
      const prog = h('span', { class: 'note-muted' });
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        prog.textContent = t('Reading the library… {a} of {b}', { a: 0, b: '…' });
        try {
          await libLoadZip(f, (a, b) => { prog.textContent = t('Reading the library… {a} of {b}', { a, b }); });
          libAfterLoad();
          repaint();
        } catch (e) { prog.textContent = t(e && e.message ? e.message : String(e)); }
      });
      grid.appendChild(h('div', { class: 'lib-hint' },
        h('p', null, t('Your {n} furniture models are in the library, which is not on this device yet. Get house-planner-library.zip from the release page (next to this app file) and load it here or in Settings → Library.', { n: libModelsExpected() })),
        h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'cat-lib-load', onclick: () => inp.click() }, icon('upload'), t('Load library…')), prog), inp));
      return;
    }
    const rooms = LIB_ROOMS.map(r => r[0]).filter(k => all.some(i => i.room === k));
    for (const i of all) if (!rooms.includes(i.room)) rooms.push(i.room);
    if (room !== 'all' && !rooms.includes(room)) room = 'all';
    grid.appendChild(h('div', { class: 'chips lib-rooms' }, ...['all', ...rooms].map(k => h('button', { class: 'chip', 'data-room': k, 'aria-pressed': String(k === room), onclick: () => setRoom(k) },
      k === 'all' ? t('All') : t(libRoomLabel(k)), h('span', { class: 'note-muted' }, ' ' + (k === 'all' ? all.length : all.filter(i => i.room === k).length))))));
    const shown = room === 'all' ? all : all.filter(i => i.room === room);
    for (const c of this.modelCards(shown, onPick)) grid.appendChild(c);
  },
  libModels(cat, q) {
    const out = [];
    for (const m of MLIB.values()) {
      const info = modelInfo('k:' + m.id);
      if (q ? (t(info.name) + ' ' + info.name + ' ' + info.cat + ' ' + m.id).toLowerCase().includes(q) : info.cat === cat) out.push(info);
    }
    // (the asset library's models – the owner's – come up in a search too; by room under Library)
    if (q) for (const info of libModelList()) if ((info.name + ' ' + t(libRoomLabel(info.room))).toLowerCase().includes(q)) out.push(info);
    return out;
  },
  myModels(q) {
    return Object.values(this.project.models || {}).map(r => modelInfo('u:' + r.id)).filter(i => i && (!q || (i.name + ' ' + (i.rec.file || '')).toLowerCase().includes(q)));
  },

  /** pick model files and read them */
  async importModelFlow() {
    if (!this.project) return;
    const files = await pickFiles('.glb,.gltf,.obj,.mtl,.ifc,.bin,.png,.jpg,.jpeg,.webp,model/gltf-binary,model/gltf+json');
    if (!files.length) return null;
    const res = await this.importModelFiles(files);
    if (res && res.place && this.mode === 'furnish') this.addModel('u:' + res.rec.id);
    return res;
  },
  async importModelFiles(files) {
    const main = files.find(f => /\.(glb|gltf|obj|ifc)$/i.test(f.name));
    if (!main) {
      const other = files.find(f => /\.(fbx|3ds|dae|blend|skp|max|stl|usdz?|3dm)$/i.test(f.name));
      if (other) await UI.dialog({ title: t('This kind of model can\'t be read yet'), body: t('{f}: the app reads .glb, .gltf, .obj and .ifc. Open it in Blender (free) and use File → Export → glTF 2.0 (.glb).', { f: other.name }), actions: [{ label: t('OK'), value: true, kind: 'primary' }] });
      else this.toast(t('Pick a .glb, .gltf, .obj or .ifc file (for .obj also its .mtl and pictures).'));
      return null;
    }
    // (a .glb as it is; a text model (.obj, .gltf, .ifc) with its files may be bigger before it is turned into a .glb –
    //  the .glb made of it is checked against the limit below)
    const total = ext0 => ext0 === 'glb' ? main.size : files.reduce((s2, f) => s2 + (f.size || 0), 0) / 3;
    if (total(main.name.split('.').pop().toLowerCase()) > MODEL_MAX_BYTES) {
      await UI.dialog({ title: t('This model is too big'), body: t('{n} – the limit is {m}. A model is kept inside the house, so every save, backup and export carries it, and a phone has to hold it in memory. Make it lighter first (fewer triangles, pictures of 1024 px), e.g. in Blender.', { n: fmtBytes(main.size), m: fmtBytes(MODEL_MAX_BYTES) }), actions: [{ label: t('OK'), value: true, kind: 'primary' }] });
      return null;
    }
    const ext = main.name.split('.').pop().toLowerCase();
    const busy = UI.busy(t('Reading {n} …', { n: main.name }));
    await new Promise(r => setTimeout(r, 30));
    let obj, glb, unit = 1, zup = false;
    const urls = [];
    try {
      // the other files (textures, .bin, .mtl) are found by their name
      const byName = new Map(files.map(f => [f.name.toLowerCase(), f]));
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(u => {
        const n = decodeURIComponent(u.split(/[\\/]/).pop().split('?')[0]).toLowerCase();
        const f = byName.get(n);
        if (!f) return u;
        const url = URL.createObjectURL(f); urls.push(url); return url;
      });
      if (ext === 'glb') {
        glb = new Uint8Array(await main.arrayBuffer());
        obj = await parseGlbBytes(glb.buffer);
      } else if (ext === 'gltf') {
        const { GLTFLoader } = await addon('loaders/GLTFLoader.js');
        const text = await main.text();
        obj = await new Promise((res, rej) => new GLTFLoader(manager).parse(text, '', g => res(g.scene), rej));
      } else if (ext === 'obj') {
        const { OBJLoader } = await addon('loaders/OBJLoader.js');
        const loader = new OBJLoader(manager);
        const mtlFile = files.find(f => /\.mtl$/i.test(f.name));
        if (mtlFile) {
          const { MTLLoader } = await addon('loaders/MTLLoader.js');
          const mats = new MTLLoader(manager).parse(await mtlFile.text(), '');
          mats.preload();
          loader.setMaterials(mats);
        }
        obj = loader.parse(await main.text());
        // let the pictures load before the model is written out
        await new Promise(r => { if (manager.itemsLoaded >= manager.itemsTotal) r(); else { manager.onLoad = r; setTimeout(r, 4000); } });
      } else {
        obj = ifcObject(await main.text());
      }
      let tris = 0;
      obj.traverse(o => { if (o.isMesh && o.geometry) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      if (!tris) throw new Error(t('No shapes found in this file.'));
      if (!glb) glb = await exportGlb(obj);
      if (glb.length > MODEL_MAX_BYTES) throw new Error(t('{n} – the limit is {m}. A model is kept inside the house, so every save, backup and export carries it, and a phone has to hold it in memory. Make it lighter first (fewer triangles, pictures of 1024 px), e.g. in Blender.', { n: fmtBytes(glb.length), m: fmtBytes(MODEL_MAX_BYTES) }));
      const tpl = unitTemplate(obj, {});
      const raw = tpl.userData.size;
      unit = ext === 'ifc' ? 1 : guessUnit(raw);
      busy.close();
      const name = main.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || t('My model');
      const rec = { id: uid('m_'), name, cat: 'mine', file: main.name, fix: { ry: 0, zup, unit }, size: raw.map(v => +(v * unit).toFixed(3)), tris: Math.round(tris), rev: 1, created: Date.now() };
      const done = await this.modelSettingsDialog(rec, { obj, isNew: true, bytes: glb.length });
      if (!done) return null;
      const dataUrl = await bytesToDataUrl(glb, 'model/gltf-binary');
      rec.asset = await Assets.putModel(dataUrl);
      this.mutate(p => { p.models[rec.id] = rec; }, { project: true, keepInspector: true });
      this.toast(t('“{n}” is in your models.', { n: rec.name }));
      return { rec, place: done === 'place' };
    } catch (e) {
      console.warn(e);
      busy.close();
      const msg = e && /draco|meshopt|KHR_draco|EXT_meshopt/i.test(String(e.message || e)) ? t('This model is compressed in a way the app cannot read (Draco / meshopt). Export it again without compression.') : (e && e.message) || String(e);
      await UI.dialog({ title: t('The model could not be read'), body: msg, actions: [{ label: t('OK'), value: true, kind: 'primary' }] });
      return null;
    } finally {
      busy.close();
      for (const u of urls) URL.revokeObjectURL(u);
    }
  },

  /** name, category, which side is the front, upright, size: for a new model (before it is kept) or one of yours */
  async modelSettingsDialog(rec0, opts = {}) {
    const rec = clone(rec0);
    rec.fix = { ry: 0, zup: false, unit: 1, ...(rec.fix || {}) };
    let obj = opts.obj || null;
    if (!obj) {
      const tpl = userModelTemplate(rec.id) || (await modelReady('u:' + rec.id), userModelTemplate(rec.id));
      if (!tpl) { this.toast(t('The model could not be read.')); return null; }
      obj = tpl.children[0].children[0].children[0].children[0];   // the model inside root → unit → off → fix
    }
    const work = obj.clone(true);
    work.rotation.set(0, 0, 0);
    const canvas = h('img', { class: 'model-prev', alt: t('Preview') });
    const topPrev = h('img', { class: 'model-prev top', alt: t('Seen from above') });
    const sizeTxt = h('span', { class: 'num' });
    const name = h('input', { class: 'input', id: 'md-name', value: rec.name, autocomplete: 'off' });
    const cat = h('select', { class: 'select', id: 'md-cat' }, h('option', { value: 'mine' }, t('My models')), ...FURN_CATS.map(([k, lab]) => h('option', { value: k, selected: rec.cat === k }, t(lab))));
    const UNITS = [[1, t('metres')], [0.01, t('centimetres')], [0.001, t('millimetres')], [0.0254, t('inches')]];
    const unitSel = h('select', { class: 'select', id: 'md-unit' });
    // (task 0028: the real width typed in sets the scale – the unit list then says so)
    const paintUnits = () => {
      const known = UNITS.some(([v]) => Math.abs(rec.fix.unit - v) < 1e-9);
      unitSel.replaceChildren(...UNITS.map(([v, lab]) => h('option', { value: String(v), selected: Math.abs(rec.fix.unit - v) < 1e-9 }, lab)),
        known ? null : h('option', { value: String(rec.fix.unit), selected: true }, t('as the width says')));
    };
    paintUnits();
    const widthIn = h('input', { class: 'input', id: 'md-width', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
    let raw = [1, 1, 1];
    // (as it is typed: Enter keeps the model at once, with this width)
    const applyWidth = final => {
      const v = parseFloat(widthIn.value.replace(',', '.'));
      if (!isFinite(v) || v < 1 || v > 2000 || !(raw[0] > 0)) { if (final) widthIn.value = String(Math.round(rec.size[0] * 1000) / 10).replace('.', ','); return; }
      rec.fix.unit = +(v / 100 / raw[0]).toPrecision(6);
      paintUnits(); refresh();
    };
    widthIn.addEventListener('input', () => applyWidth(false));
    widthIn.addEventListener('change', () => applyWidth(true));
    const zup = h('input', { type: 'checkbox', id: 'md-zup', checked: !!rec.fix.zup });
    const refresh = () => {
      // the model with these settings: its size, outline and two pictures
      const tpl = unitTemplate(work.clone(true), rec.fix);
      raw = tpl.userData.size;
      rec.size = raw.map(v => +(v * rec.fix.unit).toFixed(3));
      if (document.activeElement !== widthIn) widthIn.value = String(Math.round(rec.size[0] * 1000) / 10).replace('.', ',');
      const ol = meshOutline(unitTris(tpl), rec.size[0], rec.size[1]);
      rec.o = ol.o; rec.u = ol.u;
      sizeTxt.textContent = rec.size.map(v => Math.round(v * 100)).join(' × ') + ' cm';
      // two pictures of it at its real size
      const shown = tpl.clone(true);
      shown.scale.set(Math.max(0.01, rec.size[0]), Math.max(0.01, rec.size[2]), Math.max(0.01, rec.size[1]));
      canvas.src = objThumb(shown);
      topPrev.src = objThumb(shown, { top: true });
    };
    const turn = d => { rec.fix.ry = ((rec.fix.ry + d) % 360 + 360) % 360; refresh(); };
    zup.addEventListener('change', () => { rec.fix.zup = zup.checked; refresh(); });
    unitSel.addEventListener('change', () => { rec.fix.unit = parseFloat(unitSel.value); refresh(); });
    const body = h('div', { class: 'model-dlg' },
      h('div', { class: 'model-prevs' }, h('figure', null, canvas, h('figcaption', null, t('Front right'))), h('figure', null, topPrev, h('figcaption', null, t('From above: the front at the bottom')))),
      h('div', { class: 'field' }, h('label', { for: 'md-name' }, t('Name')), name),
      h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', { for: 'md-cat' }, t('Category')), cat), h('div', { class: 'field' }, h('label', { for: 'md-unit' }, t('The file is in')), unitSel)),
      h('div', { class: 'field' }, h('label', { for: 'md-width' }, t('Real width')), h('div', { class: 'input-unit', style: { maxWidth: '160px' } }, widthIn, h('span', { class: 'unit' }, 'cm')),
        h('span', { class: 'note-muted' }, t('Type the width from the shop or the maker: the model is scaled to it.'))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Which side is the front?')),
        h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => turn(-90) }, icon('rotate', 'flipx'), t('Turn left')), h('button', { class: 'btn sm', onclick: () => turn(90) }, icon('rotate'), t('Turn right')), h('button', { class: 'btn sm', onclick: () => turn(180) }, t('Turn around')))),
      h('label', { class: 'check', for: 'md-zup' }, zup, h('span', null, t('It lies on its back (made with Z up)'))),
      h('div', { class: 'kv' }, h('dt', null, t('Size')), h('dd', null, sizeTxt), h('dt', null, t('File')), h('dd', { style: { overflowWrap: 'anywhere' } }, (rec.file || '') + (opts.bytes ? ' · ' + fmtBytes(opts.bytes) : '')), rec.tris ? h('dt', null, t('Triangles')) : null, rec.tris ? h('dd', { class: 'num' }, rec.tris.toLocaleString('nl-NL')) : null),
      opts.bytes > 15e6 ? h('p', { class: 'note-muted' }, t('This is a big model: the house file grows by about as much.')) : null);
    refresh();
    const actions = opts.isNew
      ? [{ label: t('Cancel'), value: null }, { label: t('Keep'), value: 'keep' }, this.mode === 'furnish' ? { label: t('Keep and place'), value: 'place', kind: 'primary' } : null].filter(Boolean)
      : [{ label: t('Cancel'), value: null }, { label: t('Save'), value: 'save', kind: 'primary' }];
    const res = await UI.dialog({ title: opts.isNew ? t('New model') : t('Model settings'), body, wide: true, actions });
    if (!res) return null;
    rec.name = name.value.trim() || rec.name;
    rec.cat = cat.value;
    if (opts.isNew) Object.assign(rec0, rec);
    else {
      // existing pieces keep their size, turned along with the model
      const old = this.project.models[rec0.id];
      const turned = old && ((old.fix && old.fix.ry) || 0) !== rec.fix.ry && Math.abs(((old.fix.ry || 0) - rec.fix.ry) % 180) === 90;
      const flipped = old && !!(old.fix && old.fix.zup) !== !!rec.fix.zup;
      this.mutate(p => {
        const r = p.models[rec0.id];
        Object.assign(r, { name: rec.name, cat: rec.cat, fix: rec.fix, size: rec.size, o: rec.o, u: rec.u, rev: (r.rev || 0) + 1 });
        for (const l of p.furniture.layouts) for (const f of l.items) if (f.model === 'u:' + r.id) { if (turned) [f.w, f.d] = [f.d, f.w]; if (flipped) [f.d, f.h] = [f.h, f.d]; }
      }, { project: true });
      MODELS.types.clear();
    }
    return res;
  },

  async deleteModel(id) {
    const rec = this.project.models[id];
    if (!rec) return;
    const n = this.project.furniture.layouts.reduce((s2, l) => s2 + l.items.filter(f => f.model === 'u:' + id).length, 0);
    const ok = await UI.confirm({ title: t('Delete “{n}”?', { n: rec.name }), message: n ? t('{k} pieces in your layouts use this model; they are deleted too.', { k: n }) : t('No piece uses it.'), confirmLabel: t('Delete'), danger: true });
    if (!ok) return;
    this.mutate(p => { delete p.models[id]; for (const l of p.furniture.layouts) l.items = l.items.filter(f => f.model !== 'u:' + id); for (const s2 of p.furniture.sets) s2.items = s2.items.filter(f => f.model !== 'u:' + id); }, { project: true });
    MODELS.user.delete(id);
    this.toast(t('Model deleted.'), { action: { label: t('Undo'), fn: () => this.undo() } });
  },
});

/* drop model files on the app (Furnish mode): they are read as your models */
window.addEventListener('dragover', e => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async e => {
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (!files.length || !files.some(f => /\.(glb|gltf|obj|ifc)$/i.test(f.name))) return;
  e.preventDefault();
  if (!app.project || app.mode !== 'furnish' || app.comparing) { app.toast(t('Open a house in Furnish to add a 3D model.')); return; }
  const res = await app.importModelFiles(files);
  if (res && res.place) app.addModel('u:' + res.rec.id);
});
