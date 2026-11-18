/* ───────────── hpbake.js — Import bake…: the light Fresing Render baked for a house scene (.hpbake, task 0032) ─────────────
   The house scene format of smholte/house-scene-format (pinned tag v1.0.1, FORMAT.md sections 8 and 9). Fresing Render
   bakes the house scene of Export → For Fresing Render… (hpscene.js) and sends a .hpbake back: per moment (summer
   morning, winter night …) the light of every surface – on atlas pages (light maps on UV set 1) or per vertex –, snow
   layers per season, photos. This module
   1. reads it (zip, bake.json, pages, vertex files) and refuses what a reader must refuse, with a message;
   2. keeps it with the house version (version.bake: a small record; the files are assets of kind 'bake' – exported only
      "with baked light", never loaded when a house opens, never in the model library);
   3. matches it to the version as it is now: the version is laid out again as the export did (hpsSurfacesNow, with the
      settings the scene id carries) and every surface whose id and hash are the bake's gets its light; changed, new and
      deleted surfaces make their neighbours out of date (HPB_MARGIN, HPB_MARGIN_MOVED); moved furniture keeps its own;
   4. shows a moment in the 3D views: each drawn mesh learns, by its geometry, which surface (and where in its light map
      or which vertex) it is (attribute 'hpb', set before the meshes are merged – batch.js carries it), and the
      materials read the moment from a few textures (a table per surface, the pages, the light per vertex). Switching
      moments changes only those textures: nothing is built again. */

/** m round a changed, new or deleted surface (its old and new place): the light of what is near it is out of date too */
const HPB_MARGIN = 0.5;
/** m round a piece of furniture moved, added or removed (its old and new place) */
const HPB_MARGIN_MOVED = 0.3;
/** the format's major version this reader reads */
const HPB_MAJOR = 1;
/** light-map pages one moment can show at once (the materials' samplers); more: those surfaces stay live */
const HPB_PAGES = 4;
/** baked light up to this size can go into an exported house file (it is held as text in memory there) */
const HPB_EXPORT_MAX = 300 * 1024 * 1024;
/** surfaces that move as a whole: moved, they keep their own baked light (FORMAT.md section 9) */
const HPB_MOVABLE = new Set(['furniture']);
const HPB_PAGE_SIZES = [256, 512, 1024, 2048];
const HPB_COLOUR_CHUNKS = ['gAMA', 'iCCP', 'sRGB', 'cHRM', 'cICP', 'mDCV', 'cLLI', 'tRNS'];

function hpbError(msg) { const e = new Error(msg); e.hpb = true; return e; }

/* ───────── the zip (FORMAT.md section 2) ───────── */
async function hpbInflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw hpbError(t('This browser cannot unpack the file.'));
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
/** zip bytes → Map(name → Uint8Array); refuses what FORMAT.md section 2 forbids */
async function hpbUnzip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const broken = () => hpbError(t('The file is damaged (not a complete zip).'));
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw broken();
  const n = dv.getUint16(e + 10, true), cdOff = dv.getUint32(e + 16, true);
  if (cdOff === 0xffffffff || n === 0xffff) throw hpbError(t('The file is too big to read here (over 4 GB).'));
  const out = new Map();
  let o = cdOff;
  for (let k = 0; k < n; k++) {
    if (o + 46 > b.length || dv.getUint32(o, true) !== 0x02014b50) throw broken();
    const flags = dv.getUint16(o + 8, true), method = dv.getUint16(o + 10, true), crc = dv.getUint32(o + 16, true);
    const csize = dv.getUint32(o + 20, true), usize = dv.getUint32(o + 24, true);
    const nl = dv.getUint16(o + 28, true), xl = dv.getUint16(o + 30, true), cl = dv.getUint16(o + 32, true), lho = dv.getUint32(o + 42, true);
    const raw = b.subarray(o + 46, o + 46 + nl);
    o += 46 + nl + xl + cl;
    if (flags & 1) throw hpbError(t('The file is encrypted.'));
    let name;
    const ascii = raw.every(c => c < 128);
    if (!ascii && !(flags & 0x800)) throw hpbError(t('A name in the file is not UTF-8.'));
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch (err) { throw hpbError(t('A name in the file is not UTF-8.')); }
    const parts = name.replace(/\/$/, '').split('/');
    if (!name || name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name) || parts.some(x => !x || x === '.' || x === '..')) throw hpbError(t('The file holds a name that is not allowed: {n}', { n: name.slice(0, 80) }));
    if (out.has(name)) throw hpbError(t('The file holds “{n}” twice.', { n: name.slice(0, 80) }));
    if (name.endsWith('/')) continue;
    if (lho + 30 > b.length || dv.getUint32(lho, true) !== 0x04034b50) throw broken();
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (start + csize > b.length) throw broken();
    const data = b.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) bytes = await hpbInflate(data);
    else throw hpbError(t('The file is packed in a way this app cannot read.'));
    if (bytes.length !== usize || hpsCrc32(bytes) !== crc) throw broken();
    out.set(name, bytes);
  }
  return out;
}

/* ───────── bake.json and its files: what a reader must refuse (ERROR) or say (WARNING) ───────── */
/** a PNG light-map page's problem (FORMAT.md 8.3), or null; size = [w, h] it must have */
function hpbPngProblem(d, size) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!d || d.length < 33 || sig.some((x, i) => d[i] !== x)) return 'not a PNG';
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let pos = 8, first = true;
  while (pos + 8 <= d.length) {
    const len = dv.getUint32(pos), kind = String.fromCharCode(d[pos + 4], d[pos + 5], d[pos + 6], d[pos + 7]);
    if (first) {
      if (kind !== 'IHDR' || len !== 13) return 'no IHDR first';
      const w = dv.getUint32(pos + 8), hh = dv.getUint32(pos + 12), depth = d[pos + 16], type = d[pos + 17], inter = d[pos + 20];
      if (depth !== 8 || type !== 2) return `${depth}-bit colour type ${type} – pages are 8-bit RGB`;
      if (inter) return 'interlaced';
      if (size && (w !== size[0] || hh !== size[1])) return `${w} × ${hh} px, bake.json says ${size[0]} × ${size[1]}`;
      first = false;
    }
    if (HPB_COLOUR_CHUNKS.includes(kind)) return `it has a ${kind} chunk (a browser would change its numbers)`;
    if (kind === 'IEND') return null;
    pos += 12 + len;
  }
  return 'cut off';
}
/** no control characters in any text or key (FORMAT.md section 2) */
function hpbControl(x, at = '') {
  if (typeof x === 'string') return /[\u0000-\u001f\u007f]/.test(x) ? at || 'a text' : null;
  if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) { const r = hpbControl(x[i], `${at}[${i}]`); if (r) return r; } return null; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (/[\u0000-\u001f\u007f]/.test(k)) return at + ' (a key)'; const r = hpbControl(v, at ? `${at}.${k}` : k); if (r) return r; }
  return null;
}
const hpbNum = x => typeof x === 'number' && Number.isFinite(x);
/** read bake.json and check it with its files: { doc, errors, warnings, newerMinor } */
function hpbCheck(files) {
  const errors = [], warnings = [];
  const E = m => errors.push(m), W = m => warnings.push(m);
  const raw = files.get('bake.json');
  if (!raw) return { doc: null, errors: [t('This is not a bake from Fresing Render: it has no bake.json.')], warnings };
  let doc;
  try { doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch (e) { return { doc: null, errors: [t('bake.json cannot be read: {e}', { e: String(e && e.message || e).slice(0, 120) })], warnings }; }
  if (!doc || typeof doc !== 'object' || doc.format !== 'house-bake') return { doc: null, errors: [t('This is not a bake from Fresing Render (format “{f}”).', { f: String(doc && doc.format).slice(0, 40) })], warnings };
  const vm = /^(\d+)\.(\d+)$/.exec(String(doc.version || ''));
  if (!vm) return { doc: null, errors: [t('The bake has no format version.')], warnings };
  const major = +vm[1], minor = +vm[2];
  if (major > HPB_MAJOR) return { doc: null, errors: [t('This bake was made by a newer Fresing Render (format {v}). Update House Planner to read it.', { v: doc.version })], warnings };
  if (major < HPB_MAJOR) return { doc: null, errors: [t('This bake is of an old format ({v}) this House Planner cannot read. Bake it again.', { v: doc.version })], warnings };
  const ctl = hpbControl(doc);
  if (ctl) E(t('bake.json has a control character in {w}.', { w: ctl }));
  if (!['LIVE', 'SOFT', 'ALL'].includes(doc.light)) E(t('Unknown light “{l}”.', { l: String(doc.light).slice(0, 20) }));
  if (doc.uv1 !== 'hp-uv/1') E(t('Unknown light-map layout “{l}”.', { l: String(doc.uv1).slice(0, 20) }));
  if (!doc.scene || typeof doc.scene.id !== 'string' || !/^[0-9a-f]{32}$/.test(doc.scene.scene_hash || '')) E(t('The bake does not say which house scene it was made for.'));
  const surf = doc.surfaces && typeof doc.surfaces === 'object' && !Array.isArray(doc.surfaces) ? doc.surfaces : null;
  if (!surf) E(t('The bake has no list of surfaces.'));
  else for (const [id, s] of Object.entries(surf)) {
    if (!s || !/^[0-9a-f]{32}$/.test(s.hash || '') || !Array.isArray(s.box) || s.box.length !== 6 || !s.box.every(hpbNum)) { E(t('Surface {id} is incomplete.', { id: id.slice(0, 64) })); break; }
  }
  // pages and vertex files
  const pages = new Map(), vfiles = new Map();
  for (const pg of Array.isArray(doc.pages) ? doc.pages : []) {
    const f = pg && files.get(pg.file);
    if (!pg || !pg.id || !f) { E(t('A light-map page is missing: {f}', { f: String(pg && pg.file).slice(0, 80) })); continue; }
    const sz = Array.isArray(pg.size) ? pg.size : [];
    if (!HPB_PAGE_SIZES.includes(sz[0]) || !HPB_PAGE_SIZES.includes(sz[1])) { E(t('Page {p} has a size that is not allowed.', { p: pg.id })); continue; }
    const why = hpbPngProblem(f, sz);
    if (why) { E(t('Page {p} is not a light-map page: {w}.', { p: pg.id, w: why })); continue; }
    if (pg.ktx2 && !files.get(pg.ktx2)) W(t('The phone copy of page {p} is missing.', { p: pg.id }));
    pages.set(pg.id, pg);
  }
  for (const vf of Array.isArray(doc.vertex_files) ? doc.vertex_files : []) {
    const f = vf && files.get(vf.file);
    if (!vf || !vf.id || !f) { E(t('A file of light per vertex is missing: {f}', { f: String(vf && vf.file).slice(0, 80) })); continue; }
    if (f.length % 3) { E(t('{f} is not whole (3 bytes a vertex).', { f: vf.file })); continue; }
    vfiles.set(vf.id, f.length / 3);
  }
  // the moments
  const moments = Array.isArray(doc.moments) ? doc.moments : [];
  if (doc.light !== 'LIVE' && !moments.length) E(t('The bake has no moments.'));
  const ids = new Set();
  const rects = new Map();   // page → [[x, y, w, h, moment]]
  const ranges = new Map();  // vertex file → [[from, to]]
  const result = (mid, sid, r) => {
    if (r && r.page !== undefined) {
      const pg = pages.get(r.page), R = r.rect;
      if (!pg) { E(t('Moment {m}: {s} is on a page that is missing.', { m: mid, s: sid })); return; }
      if (!Array.isArray(R) || R.length !== 4 || !R.every(x => Number.isInteger(x)) || R[2] <= 0 || R[3] <= 0 || R[0] < 0 || R[1] < 0 || R[0] + R[2] > pg.size[0] || R[1] + R[3] > pg.size[1]) { E(t('Moment {m}: the light map of {s} does not lie on its page.', { m: mid, s: sid })); return; }
      if (!rects.has(r.page)) rects.set(r.page, []);
      rects.get(r.page).push([R[0], R[1], R[2], R[3], sid]);
    } else if (r && r.vertex !== undefined) {
      const len = vfiles.get(r.vertex);
      if (len === undefined) { E(t('Moment {m}: the light of {s} is in a file that is missing.', { m: mid, s: sid })); return; }
      if (!Number.isInteger(r.offset) || !Number.isInteger(r.count) || r.offset < 0 || r.count <= 0 || r.offset + r.count > len) { E(t('Moment {m}: the light of {s} lies outside its file.', { m: mid, s: sid })); return; }
      if (!ranges.has(r.vertex)) ranges.set(r.vertex, []);
      ranges.get(r.vertex).push([r.offset, r.offset + r.count, sid]);
    } else E(t('Moment {m}: {s} has no light.', { m: mid, s: sid }));
  };
  for (const m of moments) {
    if (!m || typeof m.id !== 'string' || ids.has(m.id)) { E(t('A moment has no name or one used twice.')); continue; }
    ids.add(m.id);
    const en = m.encoding || {};
    if (en.curve !== 2 || !hpbNum(en.scale) || en.scale <= 0 || !Array.isArray(en.reference) || en.reference.length !== 3 || !en.reference.every(hpbNum) || !hpbNum(en.exposure ?? 0)) { E(t('Moment {m}: its light encoding is not one this app reads.', { m: m.id })); continue; }
    if (m.sun_light != null && !(Array.isArray(m.sun_light) && m.sun_light.length === 3 && m.sun_light.every(hpbNum))) E(t('Moment {m}: its sun light is not three numbers.', { m: m.id }));
    for (const [sid, r] of Object.entries(m.maps || {})) result(m.id, sid, r);
    for (const set of Object.values(m.open || {})) for (const [sid, r] of Object.entries(set || {})) result(m.id, sid, r);
  }
  // rectangles on a page must not overlap; vertex ranges must not overlap
  for (const [pid, list] of rects) {
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < list.length && errors.length < 50; i++) for (let j = i + 1; j < list.length && list[j][0] < list[i][0] + list[i][2]; j++) {
      const A = list[i], B = list[j];
      if (A[1] < B[1] + B[3] && B[1] < A[1] + A[3]) { E(t('Page {p}: the light maps of {a} and {b} overlap.', { p: pid, a: A[4], b: B[4] })); break; }
    }
  }
  for (const [vid, list] of ranges) {
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i++) if (list[i][0] < list[i - 1][1]) { E(t('{f}: the light of {a} and {b} overlap.', { f: vid, a: list[i - 1][2], b: list[i][2] })); break; }
  }
  for (const sn of Array.isArray(doc.snow) ? doc.snow : []) {
    const f = sn && files.get(sn.file);
    if (!f || f.length < 12 || f[0] !== 0x67 || f[1] !== 0x6c || f[2] !== 0x54 || f[3] !== 0x46) E(t('The snow of {s} is missing or not a .glb file.', { s: String(sn && sn.season).slice(0, 30) }));
  }
  for (const ph of Array.isArray(doc.photos) ? doc.photos : []) if (!ph || !files.get(ph.file)) W(t('A photo is missing: {f}', { f: String(ph && ph.file).slice(0, 80) }));
  if (minor > 0) W(t('This bake was made by a newer Fresing Render (format {v}): some extras are not shown.', { v: doc.version }));
  return { doc, errors, warnings, newerMinor: minor > 0 };
}

/* ───────── the moments: names, the sun ───────── */
/** a moment's name in words: “Summer · Morning” for the moments of this app's export, else its id */
function hpbMomentLabel(id) {
  const m = /^(summer|winter)-(morning|afternoon|evening|night)$/.exec(id);
  return m ? `${t(HPS_SEASONS[m[1]].label)} · ${t(HPS_MOMENTS[m[2]].label)}` : id;
}
/** the sun of a moment: from the export's record in the house (p.hpScenes), else worked out again from its id and the
 *  year of the bake (the dates the export dialog starts with) */
function hpbMomentSun(p, sceneId, mid, created) {
  const rec = ((p && p.hpScenes) || []).find(x => x.id === sceneId);
  const m0 = rec && (rec.moments || []).find(x => x.id === mid);
  if (m0 && m0.sun) return { az: m0.sun.azimuth, el: m0.sun.elevation, season: m0.season, time: m0.time };
  const m = /^(summer|winter)-(morning|afternoon|evening|night)$/.exec(mid);
  if (!m) return null;
  const site = (p && p.site) || {};
  const year = +(String(created || '').slice(0, 4)) || new Date().getFullYear();
  const [Mo, D] = HPS_SEASONS[m[1]].date.split('-').map(Number), time = HPS_MOMENTS[m[2]].time[m[1]];
  const [hh, mm] = time.split(':').map(Number);
  const localMs = Date.UTC(year, Mo - 1, D, hh, mm);
  const off = dstOffsetNL(new Date(localMs - 2 * 3600000));
  const sun = sunPosition(site.lat ?? 52.1, site.lon ?? 5.1, new Date(localMs - off * 3600000));
  return { az: sun.az, el: sun.el, season: m[1], time };
}

/* ───────── the materials: baked light instead of the sky (and, with All light or at night, the sun) ─────────
   One set of uniforms for every material (HPB_U); each 3D view puts its own textures in before it draws (hpbBind). */
const HPB_U = {
  hpbOn: { value: 0 }, hpbTable: { value: null }, hpbVL: { value: null },
  hpbP0: { value: null }, hpbP1: { value: null }, hpbP2: { value: null }, hpbP3: { value: null },
  hpbGainI: { value: new THREE.Vector3(1, 1, 1) }, hpbGainD: { value: new THREE.Vector3(1, 1, 1) },
};
const HPB_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial']);
const HPB_PATCHED = new WeakSet();
let HPB_BLANK = null;
function hpbBlank() {
  if (!HPB_BLANK) {
    HPB_BLANK = new THREE.DataTexture(new Float32Array(8), 2, 1, THREE.RGBAFormat, THREE.FloatType);
    HPB_BLANK.needsUpdate = true;
  }
  return HPB_BLANK;
}
function hpbShader(sh) {
  for (const k of Object.keys(HPB_U)) sh.uniforms[k] = HPB_U[k];
  if (!HPB_U.hpbTable.value) { HPB_U.hpbTable.value = hpbBlank(); HPB_U.hpbVL.value = hpbBlank(); for (const k of ['hpbP0', 'hpbP1', 'hpbP2', 'hpbP3']) HPB_U[k].value = hpbBlank(); }
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 hpb;
uniform float hpbOn;
uniform highp sampler2D hpbTable;
uniform highp sampler2D hpbVL;
varying vec2 vHpbUv;
flat varying float vHpbMode;
flat varying float vHpbPage;
varying vec3 vHpbV;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vHpbMode = 0.0; vHpbPage = 0.0; vHpbUv = vec2(0.0); vHpbV = vec3(0.0);
if (hpbOn > 0.5 && hpb.w < 0.5) {
  int hpbS = int(hpb.z + 0.5) * 2;
  int hpbW = textureSize(hpbTable, 0).x;
  vec4 hpbA = texelFetch(hpbTable, ivec2(hpbS % hpbW, hpbS / hpbW), 0);
  vec4 hpbB = texelFetch(hpbTable, ivec2((hpbS + 1) % hpbW, (hpbS + 1) / hpbW), 0);
  if (hpb.w > -0.5) {
    if (hpbB.x > 0.5 && hpbB.x < 1.5) { vHpbMode = 1.0; vHpbPage = hpbB.y; vHpbUv = hpbA.xy + hpb.xy * hpbA.zw; }
  } else if (hpbB.x > 1.5) {
    int hpbI = int(hpbB.z + 0.5) + int(-hpb.w - 0.5);
    int hpbVW = textureSize(hpbVL, 0).x;
    vHpbV = texelFetch(hpbVL, ivec2(hpbI % hpbVW, hpbI / hpbVW), 0).rgb;
    vHpbMode = 2.0;
  }
}`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D hpbP0;
uniform sampler2D hpbP1;
uniform sampler2D hpbP2;
uniform sampler2D hpbP3;
uniform vec3 hpbGainI;
uniform vec3 hpbGainD;
varying vec2 vHpbUv;
flat varying float vHpbMode;
flat varying float vHpbPage;
varying vec3 vHpbV;`).replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( RE_IndirectDiffuse )
if (vHpbMode > 0.5) {
  vec3 hpbE = vHpbV;
  if (vHpbMode < 1.5) {
    if (vHpbPage < 0.5) hpbE = textureLod(hpbP0, vHpbUv, 0.0).rgb;
    else if (vHpbPage < 1.5) hpbE = textureLod(hpbP1, vHpbUv, 0.0).rgb;
    else if (vHpbPage < 2.5) hpbE = textureLod(hpbP2, vHpbUv, 0.0).rgb;
    else hpbE = textureLod(hpbP3, vHpbUv, 0.0).rgb;
  }
  irradiance = hpbE * hpbE * hpbGainI;
  iblIrradiance = vec3(0.0);
  reflectedLight.directDiffuse *= hpbGainD;
}
#endif`);
}
/** let a material read baked light (once; a mesh without the attribute reads it as "live") */
function hpbPatch(m) {
  if (!m || HPB_PATCHED.has(m) || !HPB_TYPES.has(m.type)) return;
  HPB_PATCHED.add(m);
  // (a patch of its own – the relief of High quality – runs first and stays part of the program's key)
  const own = k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null);
  const prev = own('onBeforeCompile'), prevKey = own('customProgramCacheKey');
  m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); hpbShader(sh); };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : prev ? prev.toString() : '') + '|hpb1'; };
  m.needsUpdate = true;
}

/* ───────── matching: the version as it is now against the bake ───────── */
/** the layout settings of the export a bake was made for: from the scene id (exports since version 54), or – a bake of
 *  an older export – the bake's own density and page size with the Draft densities of the plot, street and the rest */
function hpbParams(doc) {
  const P = hpsDecode(doc.scene && doc.scene.id);
  if (P) return { ...P, fromId: true };
  const big = Math.max(1024, ...((doc.pages || []).map(pg => Math.max(...((pg && pg.size) || [0])))));
  const tpm = (doc.quality && doc.quality.texels_per_m) || HPS_QUALITY.DRAFT.tpm;
  const pre = Object.values(HPS_QUALITY).find(q => q.tpm === tpm) || HPS_QUALITY.DRAFT;
  return { tpm, pageSize: big >= 2048 ? 2048 : 1024, groups: HPS_GROUPS.slice(), byGroup: { ...pre.groups }, vertexGroups: new Set(), fromId: false };
}
/** does a triangle touch a box? (separating axes, Akenine-Möller) a, b, c = [x, y, z]; lo, hi the box */
function hpbTriBox(a, b, c, lo, hi) {
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
  const hx = (hi[0] - lo[0]) / 2, hy = (hi[1] - lo[1]) / 2, hz = (hi[2] - lo[2]) / 2;
  const v = [[a[0] - cx, a[1] - cy, a[2] - cz], [b[0] - cx, b[1] - cy, b[2] - cz], [c[0] - cx, c[1] - cy, c[2] - cz]];
  const H = [hx, hy, hz];
  for (let k = 0; k < 3; k++) { const m0 = Math.min(v[0][k], v[1][k], v[2][k]), m1 = Math.max(v[0][k], v[1][k], v[2][k]); if (m0 > H[k] || m1 < -H[k]) return false; }
  const e = [0, 1, 2].map(i => { const p = v[i], q = v[(i + 1) % 3]; return [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; });
  const sep = ax => {
    if (Math.abs(ax[0]) + Math.abs(ax[1]) + Math.abs(ax[2]) < 1e-12) return false;
    const p = v.map(w => w[0] * ax[0] + w[1] * ax[1] + w[2] * ax[2]);
    const r = hx * Math.abs(ax[0]) + hy * Math.abs(ax[1]) + hz * Math.abs(ax[2]);
    return Math.min(...p) > r || Math.max(...p) < -r;
  };
  const n = [e[0][1] * e[1][2] - e[0][2] * e[1][1], e[0][2] * e[1][0] - e[0][0] * e[1][2], e[0][0] * e[1][1] - e[0][1] * e[1][0]];
  if (sep(n)) return false;
  for (const ed of e) for (const ax of [[0, -ed[2], ed[1]], [ed[2], 0, -ed[0]], [-ed[1], ed[0], 0]]) if (sep(ax)) return false;
  return true;
}
const hpbBoxNear = (A, B, m) => A[0] - m <= B[3] && B[0] <= A[3] + m && A[1] - m <= B[4] && B[1] <= A[4] + m && A[2] - m <= B[5] && B[2] <= A[5] + m;

/** the match of a bake to the surfaces of a version now (hpsSurfacesNow): which surface each one is, which are out of
 *  date and why, and the look-up tables that tell a drawn mesh which surface it shows (hpbTransfer) */
function hpbMatchBuild(now, doc, P) {
  const surfaces = [], byId = new Map(), mks = new Map();
  const mkOf = k => { if (!mks.has(k)) mks.set(k, mks.size); return mks.get(k); };
  let ntri = 0, nvert = 0;
  for (const S of now.surfaces) {
    const T = S.translation || [0, 0, 0];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let nv = 0;
    for (const Q of S.prims) {
      nv += Q.pos.length / 3;
      for (let i = 0; i < Q.pos.length; i += 3) for (let k = 0; k < 3; k++) { const x = Q.pos[i + k] + T[k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
      if (S.hp.bake === 'MAP') ntri += Q.idx.length / 3;
      else if (S.hp.bake === 'VERTEX') nvert += Q.pos.length / 3;
    }
    byId.set(S.hp.id, surfaces.length);
    surfaces.push({ id: S.hp.id, kind: S.hp.kind, group: S.hp.group, storey: S.hp.storey, bake: S.hp.bake, source: S.hp.source || null, hash: S.hash, box: [...lo, ...hi], nv, px: S.hp.uv1_px || null });
  }
  // light maps: every triangle with its plane and its UV set 1, in a grid of 1 m cells
  const TS = 24, tri = new Float64Array(ntri * TS), triS = new Int32Array(ntri), triM = new Int32Array(ntri);
  const grid = new Map(), big = [];
  let t = 0;
  now.surfaces.forEach((S, si) => {
    if (S.hp.bake !== 'MAP') return;
    for (const Q of S.prims) {
      const mk = mkOf(Q.key || '');
      for (let i = 0; i < Q.idx.length; i += 3) {
        const [a, b, c] = [Q.idx[i], Q.idx[i + 1], Q.idx[i + 2]];
        const p0 = [Q.pos[a * 3], Q.pos[a * 3 + 1], Q.pos[a * 3 + 2]];
        const e1 = [Q.pos[b * 3] - p0[0], Q.pos[b * 3 + 1] - p0[1], Q.pos[b * 3 + 2] - p0[2]];
        const e2 = [Q.pos[c * 3] - p0[0], Q.pos[c * 3 + 1] - p0[1], Q.pos[c * 3 + 2] - p0[2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const l = Math.hypot(...n);
        if (l < 1e-10) continue;
        n = n.map(x => x / l);
        const d00 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d01 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d11 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
        const den = d00 * d11 - d01 * d01;
        if (Math.abs(den) < 1e-16) continue;
        const o = t * TS;
        tri.set(p0, o); tri.set(e1, o + 3); tri.set(e2, o + 6); tri.set(n, o + 9);
        tri[o + 12] = -(n[0] * p0[0] + n[1] * p0[1] + n[2] * p0[2]);
        tri[o + 13] = d00; tri[o + 14] = d01; tri[o + 15] = d11; tri[o + 16] = 1 / den;
        tri[o + 17] = Q.uv1[a * 2]; tri[o + 18] = Q.uv1[a * 2 + 1]; tri[o + 19] = Q.uv1[b * 2]; tri[o + 20] = Q.uv1[b * 2 + 1]; tri[o + 21] = Q.uv1[c * 2]; tri[o + 22] = Q.uv1[c * 2 + 1];
        triS[t] = si; triM[t] = mk;
        const lo = [0, 1, 2].map(k => Math.floor((Math.min(p0[k], p0[k] + e1[k], p0[k] + e2[k]) - 0.01))), hi = [0, 1, 2].map(k => Math.floor((Math.max(p0[k], p0[k] + e1[k], p0[k] + e2[k]) + 0.01)));
        const cells = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
        if (cells > 4096) big.push(t);
        else for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
          const key = x + ',' + y + ',' + z;
          let L = grid.get(key);
          if (!L) grid.set(key, L = []);
          L.push(t);
        }
        t++;
      }
    }
  });
  // light per vertex: every vertex by its place (mm), with its normal
  const vS = new Int32Array(nvert), vJ = new Int32Array(nvert), vM = new Int32Array(nvert), vK = new Int32Array(nvert * 3), vN = new Float32Array(nvert * 3), vNext = new Int32Array(nvert).fill(-1);
  let cap = 1; while (cap < nvert * 2) cap <<= 1;
  const head = new Int32Array(cap).fill(-1);
  let v = 0;
  now.surfaces.forEach((S, si) => {
    if (S.hp.bake !== 'VERTEX') return;
    const T = S.translation || [0, 0, 0];
    let j = 0;
    for (const Q of S.prims) {
      const mk = mkOf(Q.key || '');
      for (let i = 0; i < Q.pos.length; i += 3, j++, v++) {
        const xi = Math.round((Q.pos[i] + T[0]) * 1000), yi = Math.round((Q.pos[i + 1] + T[1]) * 1000), zi = Math.round((Q.pos[i + 2] + T[2]) * 1000);
        vS[v] = si; vJ[v] = j; vM[v] = mk; vK[v * 3] = xi; vK[v * 3 + 1] = yi; vK[v * 3 + 2] = zi;
        vN[v * 3] = Q.nrm[i]; vN[v * 3 + 1] = Q.nrm[i + 1]; vN[v * 3 + 2] = Q.nrm[i + 2];
        const hsh = hpbHash(xi, yi, zi) & (cap - 1);
        vNext[v] = head[hsh]; head[hsh] = v;
      }
    }
  });
  const M = { surfaces, byId, P, roots: now.roots, groups: now.groups, mks, grid, big, tri: { n: t, d: tri, s: triS, m: triM }, vt: { n: v, s: vS, j: vJ, m: vM, k: vK, nrm: vN, next: vNext, head, cap } };
  hpbStatus(M, now, doc);
  return M;
}
function hpbHash(x, y, z) { return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0; }

/** which surfaces are out of date (FORMAT.md section 9, decided here):
 *  - id and hash as in the bake: its light is used;
 *  - furniture moved (same id, same size, as many vertices – its hash changes as it is written in place): keeps its own
 *    light; what lies within HPB_MARGIN_MOVED of its old and new place is out of date;
 *  - changed (hash), new (unknown id of a kind the bake has) or deleted: live light; what lies within HPB_MARGIN of its old
 *    and new place is out of date (furniture: HPB_MARGIN_MOVED) – measured from the triangles of each surface to the box;
 *    furniture only within its own storey, the house's parts within their storey and on the plot (the floor slab stands
 *    between storeys: a tall cupboard's box reaches the walls upstairs), the plot and what is around it everywhere
 *  - kinds the export left out (no surface of that kind in the bake) and parts without a result: live, no message.
 *  M.state[i]: 0 no result, 1 baked, 2 moved (baked), 3 out of date. M.changes = [{ id, how }], M.near = how many more */
function hpbStatus(M, now, doc) {
  const bs = doc.surfaces || {}, kindOf = id => String(id).split(':')[0];
  const kinds = new Set(Object.keys(bs).map(kindOf));
  const first = (doc.moments || [])[0] || {};
  const st = new Uint8Array(M.surfaces.length), changes = [], boxes = [];
  const sameSize = (a, b) => [0, 1, 2].every(k => Math.abs((a[k + 3] - a[k]) - (b[k + 3] - b[k])) < 0.02);
  M.surfaces.forEach((S, i) => {
    if (S.bake === 'NO') return;
    const b = bs[S.id];
    if (!b) {
      if (!kinds.has(S.kind)) return;
      st[i] = 3; changes.push({ id: S.id, how: 'new', i });
      boxes.push([S.box, HPB_MOVABLE.has(S.kind) ? HPB_MARGIN_MOVED : HPB_MARGIN, i, S.storey, HPB_MOVABLE.has(S.kind)]);
      return;
    }
    if (b.hash === S.hash) { st[i] = 1; return; }
    const r = (first.maps || {})[S.id];
    if (HPB_MOVABLE.has(S.kind) && sameSize(b.box, S.box) && (!r || r.count === undefined || r.count === S.nv)) {
      st[i] = 2; changes.push({ id: S.id, how: 'moved', i });
      boxes.push([b.box, HPB_MARGIN_MOVED, i, S.storey, true], [S.box, HPB_MARGIN_MOVED, i, S.storey, true]);
      return;
    }
    st[i] = 3; changes.push({ id: S.id, how: 'changed', i });
    const m = HPB_MOVABLE.has(S.kind) ? HPB_MARGIN_MOVED : HPB_MARGIN;
    boxes.push([b.box, m, i, S.storey, HPB_MOVABLE.has(S.kind)], [S.box, m, i, S.storey, HPB_MOVABLE.has(S.kind)]);
  });
  for (const [id, b] of Object.entries(bs)) {
    if (M.byId.has(id)) continue;
    changes.push({ id, how: 'deleted', i: -1 });
    boxes.push([b.box, HPB_MOVABLE.has(kindOf(id)) ? HPB_MARGIN_MOVED : HPB_MARGIN, -1, undefined, HPB_MOVABLE.has(kindOf(id))]);
  }
  // the neighbours: a surface with a triangle within the margin of a changed place
  let near = 0;
  const nearIds = [];
  now.surfaces.forEach((S, i) => {
    if (st[i] !== 1 && st[i] !== 2) return;
    const own = M.surfaces[i];
    // (a storey's floor slab stands between storeys: furniture touches only its own storey; the house's parts their
    // storey and the plot; the plot and what is around it – and a part whose storey is not known – everything)
    const zone = (st0, mov) => st0 == null || own.storey === st0 || (!mov && own.storey == null);
    const hits = boxes.filter(([B, m, k, st0, mov]) => k !== i && zone(st0, mov) && hpbBoxNear(own.box, B, m));
    if (!hits.length) return;
    const T = S.translation || [0, 0, 0];
    for (const [B, m] of hits) {
      const lo = [B[0] - m, B[1] - m, B[2] - m], hi = [B[3] + m, B[4] + m, B[5] + m];
      for (const Q of S.prims) {
        for (let k = 0; k < Q.idx.length; k += 3) {
          const p = [Q.idx[k], Q.idx[k + 1], Q.idx[k + 2]].map(x => [Q.pos[x * 3] + T[0], Q.pos[x * 3 + 1] + T[1], Q.pos[x * 3 + 2] + T[2]]);
          if (hpbTriBox(p[0], p[1], p[2], lo, hi)) { st[i] = 3; near++; nearIds.push(own.id); return; }
        }
      }
    }
  });
  M.state = st; M.changes = changes; M.near = near; M.nearIds = nearIds;
}

/** which surface a mesh's triangles and vertices show: the 'hpb' attribute (u, v, surface, how): how 0 = on a light
 *  map at (u, v), −1 − j = vertex j of a per-vertex surface, 1 = live. E maps the mesh's own numbers to the export's
 *  frame. Returns the surfaces it found (a Set), or null */
function hpbTransfer(mesh, M, E, vertexOnly) {
  const g0 = mesh.geometry, P = g0 && g0.attributes.position;
  if (!P || P.count < 3) return null;
  const I = g0.index, nC = I ? I.count : P.count, nV = P.count, N = g0.attributes.normal;
  const W = new Float64Array(nV * 3), WN = new Float32Array(nV * 3);
  const e = E.elements, nm = new THREE.Matrix3().getNormalMatrix(E), q = nm.elements;
  const flip = E.determinant() < 0;
  for (let i = 0; i < nV; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    W[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; W[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; W[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (N) {
      const a = N.getX(i), b = N.getY(i), c = N.getZ(i);
      let nx = q[0] * a + q[3] * b + q[6] * c, ny = q[1] * a + q[4] * b + q[7] * c, nz = q[2] * a + q[5] * b + q[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1; WN[i * 3] = nx / l; WN[i * 3 + 1] = ny / l; WN[i * 3 + 2] = nz / l;
    }
  }
  const mats = [].concat(mesh.material);
  const groups = Array.isArray(mesh.material) && g0.groups.length ? g0.groups : [{ start: 0, count: nC, materialIndex: 0 }];
  const C = new Float32Array(nC * 4);
  for (let i = 0; i < nC; i++) C[i * 4 + 3] = 1;
  const found = new Set();
  const T = M.tri, D = T.d, VT = M.vt;
  const vid = k => (I ? I.getX(k) : k);
  for (const gr of groups) {
    const mat = mats[gr.materialIndex || 0] || mats[0];
    const mk = M.mks.has(hpsMatKey(mat)) ? M.mks.get(hpsMatKey(mat)) : -2;
    const s0 = Math.max(0, gr.start), s1 = Math.min(nC, gr.start + (Number.isFinite(gr.count) ? gr.count : nC));
    for (let k = s0; k + 2 < s1; k += 3) {
      const a = vid(k), b = vid(k + 1), c = vid(k + 2);
      // the face: its middle and which way it looks
      const ux = W[b * 3] - W[a * 3], uy = W[b * 3 + 1] - W[a * 3 + 1], uz = W[b * 3 + 2] - W[a * 3 + 2];
      const vx = W[c * 3] - W[a * 3], vy = W[c * 3 + 1] - W[a * 3 + 1], vz = W[c * 3 + 2] - W[a * 3 + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      let hit = -1;
      if (l > 1e-12 && !vertexOnly && T.n) {
        if (flip) { nx = -nx; ny = -ny; nz = -nz; }
        nx /= l; ny /= l; nz /= l;
        const cx = (W[a * 3] + W[b * 3] + W[c * 3]) / 3, cy = (W[a * 3 + 1] + W[b * 3 + 1] + W[c * 3 + 1]) / 3, cz = (W[a * 3 + 2] + W[b * 3 + 2] + W[c * 3 + 2]) / 3;
        const cand = M.grid.get(Math.floor(cx) + ',' + Math.floor(cy) + ',' + Math.floor(cz));
        let best = -1;
        const test = tt => {
          const o = tt * TS_HPB;
          if (D[o + 9] * nx + D[o + 10] * ny + D[o + 11] * nz < 0.98) return;
          if (Math.abs(D[o + 9] * cx + D[o + 10] * cy + D[o + 11] * cz + D[o + 12]) > 0.004) return;
          const px = cx - D[o], py = cy - D[o + 1], pz = cz - D[o + 2];
          const d20 = px * D[o + 3] + py * D[o + 4] + pz * D[o + 5], d21 = px * D[o + 6] + py * D[o + 7] + pz * D[o + 8];
          const l1 = (D[o + 15] * d20 - D[o + 14] * d21) * D[o + 16], l2 = (D[o + 13] * d21 - D[o + 14] * d20) * D[o + 16];
          if (l1 < -1e-3 || l2 < -1e-3 || l1 + l2 > 1 + 1e-3) return;
          if (best < 0 || (T.m[tt] === mk && T.m[best] !== mk)) best = tt;
        };
        if (cand) for (const tt of cand) test(tt);
        for (const tt of M.big) test(tt);
        if (best >= 0) {
          hit = best;
          const o = best * TS_HPB;
          for (const [kk, vv] of [[k, a], [k + 1, b], [k + 2, c]]) {
            const px = W[vv * 3] - D[o], py = W[vv * 3 + 1] - D[o + 1], pz = W[vv * 3 + 2] - D[o + 2];
            const d20 = px * D[o + 3] + py * D[o + 4] + pz * D[o + 5], d21 = px * D[o + 6] + py * D[o + 7] + pz * D[o + 8];
            const l1 = (D[o + 15] * d20 - D[o + 14] * d21) * D[o + 16], l2 = (D[o + 13] * d21 - D[o + 14] * d20) * D[o + 16], l0 = 1 - l1 - l2;
            C[kk * 4] = l0 * D[o + 17] + l1 * D[o + 19] + l2 * D[o + 21];
            C[kk * 4 + 1] = l0 * D[o + 18] + l1 * D[o + 20] + l2 * D[o + 22];
            C[kk * 4 + 2] = T.s[best]; C[kk * 4 + 3] = 0;
          }
          found.add(T.s[best]);
        }
      }
      if (hit >= 0 || !VT.n) continue;
      // light per vertex: the vertex at the same place (to the millimetre), the same material first, then the normal
      for (const [kk, vv] of [[k, a], [k + 1, b], [k + 2, c]]) {
        const xi = Math.round(W[vv * 3] * 1000), yi = Math.round(W[vv * 3 + 1] * 1000), zi = Math.round(W[vv * 3 + 2] * 1000);
        let best = -1, bs = -Infinity;
        for (let dx = 0; dx < 27 && best < 0; dx++) {
          const ox = dx === 0 ? 0 : ((dx % 3) - 1), oy = dx === 0 ? 0 : ((Math.floor(dx / 3) % 3) - 1), oz = dx === 0 ? 0 : (Math.floor(dx / 9) - 1);
          if (dx > 0 && ox === 0 && oy === 0 && oz === 0) continue;
          const X = xi + ox, Y = yi + oy, Z = zi + oz;
          for (let j = VT.head[hpbHash(X, Y, Z) & (VT.cap - 1)]; j >= 0; j = VT.next[j]) {
            if (VT.k[j * 3] !== X || VT.k[j * 3 + 1] !== Y || VT.k[j * 3 + 2] !== Z) continue;
            const sc = (VT.m[j] === mk ? 10 : 0) + VT.nrm[j * 3] * WN[vv * 3] + VT.nrm[j * 3 + 1] * WN[vv * 3 + 1] + VT.nrm[j * 3 + 2] * WN[vv * 3 + 2];
            if (sc > bs) { bs = sc; best = j; }
          }
        }
        if (best < 0) continue;
        C[kk * 4] = 0; C[kk * 4 + 1] = 0; C[kk * 4 + 2] = VT.s[best]; C[kk * 4 + 3] = -1 - VT.j[best];
        found.add(VT.s[best]);
      }
    }
  }
  if (!found.size) return null;
  // one value per vertex where the corners agree; else every corner a vertex of its own
  let g = null, arr = null;
  if (I) {
    const per = new Float32Array(nV * 4), set = new Uint8Array(nV);
    let clash = false;
    for (let k = 0; k < nC && !clash; k++) {
      const vv = I.getX(k);
      if (!set[vv]) { set[vv] = 1; per.set(C.subarray(k * 4, k * 4 + 4), vv * 4); continue; }
      for (let c2 = 0; c2 < 4; c2++) if (per[vv * 4 + c2] !== C[k * 4 + c2]) { clash = true; break; }
    }
    if (clash) { g = g0.toNonIndexed(); arr = C; } else { g = g0.clone(); arr = per; for (let vv = 0; vv < nV; vv++) if (!set[vv]) per[vv * 4 + 3] = 1; }
  } else { g = g0.clone(); arr = C; }
  g.setAttribute('hpb', new THREE.BufferAttribute(arr, 4));
  mesh.geometry = g;
  mesh.userData.hpbOwn = true;
  return found;
}
const TS_HPB = 24;

/* ───────── a moment: its pages, its light per vertex, its snow; one table per view ───────── */
const hpbDataUrl = (bytes, type) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(new Blob([bytes], { type })); });
const HPB_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ktx2: 'image/ktx2', glb: 'model/gltf-binary', bin: 'application/octet-stream', json: 'application/json', mp4: 'video/mp4', webm: 'video/webm' };
const hpbMime = name => HPB_MIME[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';
let HPB_SNOW_MAT = null;
/** the app's own snow (FORMAT.md 8.6: House Planner shows the layers with its own snow material) */
function hpbSnowMat() {
  if (!HPB_SNOW_MAT) { HPB_SNOW_MAT = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.92, metalness: 0 }); HPB_SNOW_MAT.userData.key = 'snow'; hpbPatch(HPB_SNOW_MAT); }
  return HPB_SNOW_MAT;
}

/** the table of one view: per surface (and snow layer) where its light is – (x, y, w, h) of its rectangle on the page /
 *  the page, or the first of its vertices in the light per vertex. open = the storeys seen open from above here */
function hpbTable(M, md, open) {
  const N = M.surfaces.length, n = N + md.snow.length, W = 1024;
  const H = Math.max(1, Math.ceil((n * 2) / W));
  const d = new Float32Array(W * H * 4);
  const m = md.m, maps = m.maps || {}, opens = m.open || {};
  for (let i = 0; i < n; i++) {
    let S, ok, r, base;
    if (i < N) {
      S = M.surfaces[i];
      ok = M.state[i] === 1 || M.state[i] === 2;
      const useOpen = open.has(S.storey) && opens[S.storey] && opens[S.storey][S.id];
      r = useOpen ? opens[S.storey][S.id] : maps[S.id];
      base = useOpen ? md.vbo[i] : md.vb[i];
    } else {
      S = md.snow[i - N];
      const k = M.byId.get(S.on);
      ok = k !== undefined && (M.state[k] === 1 || M.state[k] === 2);
      r = maps[S.id]; base = md.vb[i];
    }
    if (!ok || !r) continue;
    const o = i * 8;
    if (r.page !== undefined) {
      const slot = md.slot.get(r.page), sz = md.size.get(r.page);
      if (slot === undefined || !sz || (S.px && (r.rect[2] !== S.px[0] || r.rect[3] !== S.px[1]))) continue;
      d[o] = r.rect[0] / sz[0]; d[o + 1] = r.rect[1] / sz[1]; d[o + 2] = r.rect[2] / sz[0]; d[o + 3] = r.rect[3] / sz[1];
      d[o + 4] = 1; d[o + 5] = slot;
    } else if (base >= 0) { d[o + 4] = 2; d[o + 6] = base; }
  }
  const tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

/** the gains of the materials (hpbShader) for a view: L / reference × the app's own sky light (factor), or L × 2^exposure
 *  (absolute: the night, or "As Fresing Render"); the sun live with Soft light, gone with All light and at night */
function hpbBind(view) {
  const st = view._hpb;
  if (!st || !st.md || !st.table || !view._hpbHit) { HPB_U.hpbOn.value = 0; return; }
  const md = st.md, en = md.m.encoding, ref = en.reference, sc = en.scale, ex = 2 ** (en.exposure || 0);
  HPB_U.hpbOn.value = 1;
  HPB_U.hpbTable.value = st.table;
  HPB_U.hpbVL.value = md.vl;
  for (let k = 0; k < 4; k++) HPB_U['hpbP' + k].value = md.pages[k] || hpbBlank();
  const abs = md.night || st.abs;
  if (abs) { const k = Math.PI * sc * ex; HPB_U.hpbGainI.value.set(k, k, k); }
  else {
    const H = [0, 0, 0];
    for (const L of view.scene.children) {
      if (!L.visible) continue;
      if (L.isHemisphereLight || L.isAmbientLight) { H[0] += L.color.r * L.intensity; H[1] += L.color.g * L.intensity; H[2] += L.color.b * L.intensity; }
    }
    HPB_U.hpbGainI.value.set(sc * H[0] / Math.max(ref[0], 1e-6), sc * H[1] / Math.max(ref[1], 1e-6), sc * H[2] / Math.max(ref[2], 1e-6));
  }
  const sun = view.sun;
  if (md.night || md.light === 'ALL') HPB_U.hpbGainD.value.set(0, 0, 0);
  else if (abs && md.m.sun_light && sun && sun.intensity > 0) {
    const s = md.m.sun_light, c = sun.color;
    HPB_U.hpbGainD.value.set(...[s[0] / Math.max(c.r, 1e-3), s[1] / Math.max(c.g, 1e-3), s[2] / Math.max(c.b, 1e-3)].map(x => Math.PI * x * ex / sun.intensity));
  } else HPB_U.hpbGainD.value.set(1, 1, 1);
}

Object.assign(View3D.prototype, {
  /** after a build (before the meshes are merged): every new mesh learns which surfaces of the bake it shows */
  hpbApply(roots, onlyNew) {
    const A = this.app;
    if (!A || this.opts.mini || !A.panes || !A.panes.some(pn => pn.view === this)) return;
    if (!this._hpbBound) { this._hpbBound = true; this.scene.onBeforeRender = () => hpbBind(this); }
    const M = A.hpbMatchFor ? A.hpbMatchFor(this) : null;
    if (!M) { if (!onlyNew) { this._hpbHit = 0; this._hpb = null; this.hpbSnow(null); } return; }
    const t0 = performance.now();
    const inv = new THREE.Matrix4(), E = new THREE.Matrix4();
    for (const r of roots) {
      const key = r.userData.storeyId || (r.userData.garden ? 'garden' : null);
      const R = key && M.roots[key];
      if (onlyNew && r.userData.hpbGen !== M.gen) continue;
      const found = onlyNew ? r.userData.hpbSurf : new Set();
      r.userData.hpbSurf = found; r.userData.hpbGen = M.gen;
      if (!R) continue;
      r.updateMatrixWorld(true);
      inv.copy(r.matrixWorld).invert();
      const mats = new Set();
      r.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry || (onlyNew && (o.geometry.attributes.hpb || o.userData.merged || o.userData.batch))) return;
        let U = false;
        for (let q = o; q && q !== r.parent; q = q.parent) { const u = q.userData || {}; if (u.hit || u.furnRing || u.pin || u.handleBox) return; if (u.furn || u.point || u.veg || u.plant) U = true; }
        E.multiplyMatrices(R, inv).multiply(o.matrixWorld);
        const got = hpbTransfer(o, M, E, U);
        if (!got) return;
        for (const s of got) found.add(s);
        for (const m of [].concat(o.material)) { hpbPatch(m); mats.add(m); }
      });
      // the pieces that share a material with a baked one carry the attribute too ("live"): merged with them, not apart
      if (mats.size) r.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry || o.geometry.attributes.hpb || !o.geometry.attributes.position) return;
        if (![].concat(o.material).some(m => mats.has(m))) return;
        const a = new Float32Array(o.geometry.attributes.position.count * 4);
        for (let i = 3; i < a.length; i += 4) a[i] = 1;
        o.geometry = o.geometry.clone(); o.geometry.setAttribute('hpb', new THREE.BufferAttribute(a, 4)); o.userData.hpbOwn = true;
      });
    }
    this.hpbCollect();
    this._hpbMs = Math.round(performance.now() - t0);
    if (!onlyNew) A.hpbViewBuilt(this);
    else this.needs = true;
  },
  /** the surfaces this view shows (all its roots built with the same match) */
  hpbCollect() {
    const M = this.app && this.app._hpb && this.app._hpb.M;
    const all = new Set();
    for (const r of this.group.children) if (r.userData.hpbSurf && M && r.userData.hpbGen === M.gen) for (const s of r.userData.hpbSurf) all.add(s);
    this._hpbSurf = all;
    this._hpbHit = all.size;
  },
  /** the snow layers of the moment's season, on the surfaces this view shows (null: none) */
  hpbSnow(md) {
    for (const o of this._hpbSnowMeshes || []) o.removeFromParent();
    this._hpbSnowMeshes = [];
    const M = this.app && this.app._hpb && this.app._hpb.M;
    if (!md || !M || !md.snow.length || !this._hpbSurf) return;
    hpbSnowMat();
    const inv = new THREE.Matrix4();
    md.snow.forEach(L => {
      const k = M.byId.get(L.on);
      if (k === undefined || !this._hpbSurf.has(k) || !(M.state[k] === 1 || M.state[k] === 2)) return;
      const root = this.group.children.find(r => (L.storey ? r.userData.storeyId === L.storey : r.userData.garden));
      const R = M.roots[L.storey || 'garden'];
      if (!root || !R) return;
      inv.copy(R).invert();
      const mesh = new THREE.Mesh(L.geo, HPB_SNOW_MAT);
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(inv);
      mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.userData = { keep: true, hpbSnowOf: L.on, noBatch: true };
      mesh.raycast = () => {};
      root.add(mesh);
      this._hpbSnowMeshes.push(mesh);
    });
    this.needs = true;
  },
  /** the view's light for a baked moment: the moment's sun (by day), or night */
  hpbLights(md) {
    if (!md) return;
    if (md.night) {
      this.sun.intensity = 0; this.sun.castShadow = false;
      this.hemi.color.set('#8d9bb8'); this.hemi.groundColor.set('#26231f'); this.hemi.intensity = 0.3;
      this.scene.background = new THREE.Color('#1d242b');
      this.sunInfo = null;
    } else if (md.sun) {
      this.scene.background = new THREE.Color(cssVar('--paper') || '#f2f2f2');
      this.applySun({ az: md.sun.az, el: md.sun.el });
    }
    this._aeLight = true;
    this.needs = true;
  },
});

/** the snow layers of a snow .glb (FORMAT.md 8.6): each layer one geometry in the scene's frame, its vertices in the
 *  file's order, with its place in the table (index) */
/** a .glb's nodes with extras.hp: [{ hp, matrix (world), prims: [{ pos, nrm, uv1, idx, color }] }] (numbers as stored) */
function hpbGlbNodes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return [];
  const jl = dv.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl)));
  const binAt = 20 + jl + 8, bin = 20 + jl + 8 <= bytes.length ? bytes.subarray(binAt, binAt + dv.getUint32(20 + jl, true)) : new Uint8Array(0);
  const read = (ai, n) => {
    const a = doc.accessors[ai], bv = doc.bufferViews[a.bufferView];
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType], stride = bv.byteStride || size * n;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0), d = new DataView(bin.buffer, bin.byteOffset + base);
    const out = new Float64Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
      const o = i * stride + k * size;
      out[i * n + k] = a.componentType === 5126 ? d.getFloat32(o, true) : a.componentType === 5125 ? d.getUint32(o, true) : a.componentType === 5123 ? d.getUint16(o, true) : d.getUint8(o);
    }
    return out;
  };
  const local = node => {
    const M = new THREE.Matrix4();
    if (node.matrix) M.fromArray(node.matrix);
    else M.compose(new THREE.Vector3(...(node.translation || [0, 0, 0])), new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
    return M;
  };
  const out = [];
  const walk = (ni, parent) => {
    const node = doc.nodes[ni], W = parent.clone().multiply(local(node));
    const hp = node.extras && node.extras.hp;
    if (hp && node.mesh !== undefined) {
      const prims = (doc.meshes[node.mesh].primitives || []).map(pr => {
        const P = read(pr.attributes.POSITION, 3), nv = P.length / 3;
        const mat = pr.material !== undefined && doc.materials ? doc.materials[pr.material] : null;
        return { pos: P, nrm: pr.attributes.NORMAL !== undefined ? read(pr.attributes.NORMAL, 3) : null, uv1: pr.attributes.TEXCOORD_1 !== undefined ? read(pr.attributes.TEXCOORD_1, 2) : null,
          idx: pr.indices !== undefined ? read(pr.indices, 1) : Float64Array.from({ length: nv }, (_, i) => i), color: mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor, matName: (mat && mat.name) || '' };
      });
      out.push({ hp, matrix: W, prims });
    }
    for (const c of node.children || []) walk(c, W);
  };
  const sc = doc.scenes && doc.scenes[doc.scene || 0];
  for (const ni of (sc ? sc.nodes : (doc.nodes || []).map((_, i) => i))) walk(ni, new THREE.Matrix4());
  return out;
}
function hpbSnowLayers(bytes, first) {
  const layers = [];
  for (const node of hpbGlbNodes(bytes)) {
    const hp = node.hp;
    if (hp.kind !== 'snow') continue;
    const M = node.matrix;
    const pos = [], nrm = [], idx = [];
    for (const pr of node.prims) {
      const P = pr.pos, N = pr.nrm;
      const base = pos.length / 3;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(N ? N[i] : (i % 3 === 1 ? 1 : 0)); }
      for (const x of pr.idx) idx.push(base + x);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.applyMatrix4(M);
    const nv = pos.length / 3, k = first + layers.length, h = new Float32Array(nv * 4);
    for (let j = 0; j < nv; j++) { h[j * 4 + 2] = k; h[j * 4 + 3] = -1 - j; }
    g.setAttribute('hpb', new THREE.BufferAttribute(h, 4));
    layers.push({ id: hp.id, on: hp.on, storey: hp.storey || null, group: hp.group, nv, geo: g });
  }
  return layers;
}

/** one moment of a bake for a match: its pages (the four with the most surfaces) as textures, the light per vertex of
 *  every surface (and with the storeys above left out), the snow of its season. src = { key, bytes(name), has(name) };
 *  rm = the moment's record (season, night, sun) */
async function hpbMomentData(src, doc, M, mid, rm, phone, old) {
  const m = (doc.moments || []).find(x => x.id === mid);
  if (!m) return null;
  const t0 = performance.now();
  const count = new Map();
  const each = f => { for (const r of Object.values(m.maps || {})) f(r); for (const set of Object.values(m.open || {})) for (const r of Object.values(set || {})) f(r); };
  each(r => { if (r && r.page !== undefined) count.set(r.page, (count.get(r.page) || 0) + 1); });
  const ids = [...count.keys()].sort((a, b) => count.get(b) - count.get(a));
  const slot = new Map(), size = new Map(), pages = [];
  for (const pid of ids.slice(0, HPB_PAGES)) {
    const pg = (doc.pages || []).find(x => x.id === pid);
    const tex = pg && await hpbPageTex(src, pg, phone, old);
    if (!tex) continue;
    slot.set(pid, pages.length); size.set(pid, pg.size); pages.push(tex);
  }
  // the snow of the moment's season
  const season = rm.season || ((/^(\w+)-/.exec(mid) || [])[1]);
  const sn = (doc.snow || []).find(s => s.season === season);
  let snow = [];
  const snowKey = sn ? src.key + '|' + sn.file + '|' + M.gen : '';
  if (sn && src.has(sn.file)) {
    if (old && old.snowKey === snowKey) snow = old.snow;
    else { try { snow = hpbSnowLayers(await src.bytes(sn.file), M.surfaces.length); } catch (e) { console.warn('snow', e); } }
  }
  // the light per vertex: each surface's values (and its values with the storeys above left out)
  const N = M.surfaces.length, n = N + snow.length;
  const vb = new Int32Array(n).fill(-1), vbo = new Int32Array(n).fill(-1);
  const parts = [];
  let total = 0;
  const take = (i, r, nv, arr) => { if (r && r.vertex !== undefined && r.count === nv) { arr[i] = total; parts.push([total, r]); total += nv; } };
  for (let i = 0; i < n; i++) {
    const S = i < N ? M.surfaces[i] : snow[i - N];
    if (i < N && S.bake !== 'VERTEX') continue;
    take(i, (m.maps || {})[S.id], S.nv, vb);
    if (i < N && S.storey && m.open && m.open[S.storey]) take(i, m.open[S.storey][S.id], S.nv, vbo);
  }
  const W = 2048, Hh = Math.max(1, Math.ceil(total / W));
  const data = new Uint8Array(W * Hh * 4);
  const files = new Map();
  for (const [at, r] of parts) {
    if (!files.has(r.vertex)) { const vf = (doc.vertex_files || []).find(x => x.id === r.vertex); files.set(r.vertex, vf && src.has(vf.file) ? await src.bytes(vf.file) : null); }
    const b = files.get(r.vertex);
    if (!b) continue;
    for (let j = 0; j < r.count; j++) { const s = (r.offset + j) * 3, d = (at + j) * 4; data[d] = b[s]; data[d + 1] = b[s + 1]; data[d + 2] = b[s + 2]; data[d + 3] = 255; }
  }
  const vl = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat, THREE.UnsignedByteType);
  vl.needsUpdate = true;
  const night = rm.night != null ? rm.night : !!(rm.sun ? rm.sun.el < 0 : !m.sun_light);
  const md = { gen: M.gen, id: mid, m, light: doc.light, night, sun: rm.sun || null, pages, slot, size, vb, vbo, vl, snow, snowKey, pageIds: ids.slice(0, HPB_PAGES), skipped: Math.max(0, ids.length - HPB_PAGES) };
  md.ms = Math.round(performance.now() - t0);
  md.bytes = pages.reduce((s, tx) => s + (tx.userData.bytes || 0), 0) + data.length + n * 2 * 16;
  return md;
}
/** one moment at a time: what the old one had and the new one does not use goes */
function hpbMomentDrop(old, md) {
  if (!old) return;
  for (const tx of old.pages) if (!md || !md.pages.includes(tx)) tx.dispose();
  if (!md || old.vl !== md.vl) old.vl.dispose();
  if (!md || old.snow !== md.snow) for (const L of old.snow) L.geo.dispose();
}
/** a page as a texture: raw numbers (no colour change, no flip, no mipmaps); 1024 px on a phone (or its KTX2 copy) */
async function hpbPageTex(src, pg, phone, old) {
  const key = src.key + '|' + pg.file + '|' + (phone ? 1 : 0);
  const prev = old && old.pages.find(tx => tx.userData.page === key);
  if (prev) return prev;
  let tex = null;
  if (phone && pg.ktx2 && src.has(pg.ktx2) && typeof libWantGpu === 'function' && libWantGpu()) {
    try {
      await libKtx2(null);
      const loader = await TEXLIB.ktx, b = loader && await src.bytes(pg.ktx2);
      if (b) tex = await new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), res, rej));
      if (tex && tex.mipmaps && tex.mipmaps.length > 1) tex.mipmaps = tex.mipmaps.slice(0, 1);
    } catch (e) { tex = null; }
  }
  if (!tex) {
    const b = await src.bytes(pg.file);
    if (!b) return null;
    let img = await createImageBitmap(new Blob([b], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    if (phone && img.width > 1024) {
      // (a phone holds 1024 px pages: a PC bake's 2048 px pages drawn at half size)
      const c = document.createElement('canvas');
      c.width = Math.round(img.width / 2); c.height = Math.round(img.height / 2);
      const cx = c.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      img = c;
    }
    tex = new THREE.Texture(img);
    tex.userData.bytes = img.width * img.height * 4;
  } else tex.userData.bytes = pg.size[0] * pg.size[1];
  tex.colorSpace = THREE.NoColorSpace; tex.flipY = false; tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.userData.page = key;
  return tex;
}

let HPB_GEN = 0;
/** a house as an export without baked light writes it: each bake record marked filesLeftOut (the files stay home) */
function hpbLeftOut(p) {
  if (!(p.versions || []).some(v => v && v.bake)) return p;
  return { ...p, versions: p.versions.map(v => (v && v.bake ? { ...v, bake: { ...v.bake, filesLeftOut: true } } : v)) };
}
Object.assign(app, {
  /** the bake of a version (its record), or null */
  hpbRec(v) { v = v || (this.project && this.shownVersion()); return v && v.bake && v.bake.json ? v.bake : null; },
  /** is baked light shown? (the shown version has a bake and one of its moments is chosen) */
  hpbOn() { const r = this.hpbRec(); return !!(r && this.settings.bakeMoment && (r.moments || []).some(m => m.id === this.settings.bakeMoment)); },
  /** what a 3D build of the shown version needs to know: the match it was built with (reuse.js) */
  hpbReuseKey() { return this.hpbOn() && this._hpb && this._hpb.M ? 'b' + this._hpb.M.gen : '-'; },
  /** the build's light with baked light on: day light (the moment's sun is set after the build: hpbLights) */
  bakeSpec() { return this.hpbOn() ? { light: 'day', sun: null, siteSun: (this.project && this.project.site) || null } : {}; },
  /** what the export's hidden build makes the surfaces from: when it changes, the match is made again */
  hpbGeoKey(v) {
    const p = this.project;
    return sigHash(JSON.stringify([v.id, v.plan, p.site || null, p.doorState || null, p.furniture || null, Object.keys(p.models || {}), p.storeys, quality3d(this.settings), this.shell ? 1 : 0]));
  },
  /** a bake file's bytes (an asset of kind 'bake'): never kept in the asset cache */
  async hpbBytes(id) {
    const rec = id && await Assets.getRecord(id);
    if (!rec || !rec.dataUrl) return null;
    return new Uint8Array(await (await fetch(rec.dataUrl)).arrayBuffer());
  },
  async hpbDoc(rec) {
    if (this._hpbDoc && this._hpbDoc.id === rec.id) return this._hpbDoc.doc;
    const b = await this.hpbBytes(rec.json);
    if (!b) return null;
    const doc = JSON.parse(new TextDecoder().decode(b));
    this._hpbDoc = { id: rec.id, doc };
    return doc;
  },

  /** the match for a 3D view (null: none, or not yet – it is made in a moment and the views are built again) */
  hpbMatchFor(view) {
    if (!this.hpbOn()) return null;
    const v = this.shownVersion(), rec = this.hpbRec(v);
    const en = view.spec && view.spec.entries && view.spec.entries[0];
    if (en && en.versionId && en.versionId !== v.id) return null;
    const key = rec.id + '|' + this.hpbGeoKey(v), H = this._hpb;
    if (H && H.key === key && H.M) return H.M;
    this.hpbSchedule(v, rec, key, !H || H.rec !== rec.id || H.v !== v.id);
    // (the last match while the new one is made: what did not change shows its light already)
    return H && H.M && H.rec === rec.id && H.v === v.id ? H.M : null;
  },
  hpbSchedule(v, rec, key, soon) {
    if (this._hpbJob && this._hpbJob.key === key) return;
    if (this._hpbJob) clearTimeout(this._hpbJob.timer);
    const job = { key };
    job.timer = setTimeout(() => this.hpbRun(v.id, rec.id, key, job), soon ? 30 : 1200);
    this._hpbJob = job;
  },
  async hpbRun(vid, rid, key, job) {
    const v = this.project && this.shownVersion(), rec = this.hpbRec(v);
    if (this._hpbJob !== job) return;
    if (!v || v.id !== vid || !rec || rec.id !== rid || !this.hpbOn()) { this._hpbJob = null; return; }
    const doc = await this.hpbDoc(rec).catch(() => null);
    if (this._hpbJob !== job) return;
    if (!doc) { this._hpbJob = null; this._hpbMissing = rec.id; this.renderStageOverlays(); return; }
    this._hpbBusy = true; this.renderStageOverlays();
    await new Promise(r => setTimeout(r, 40));
    if (this._hpbJob !== job) return;
    let M = null;
    try {
      const t0 = performance.now();
      const now = this.hpsSurfacesNow(v, hpbParams(doc));
      if (now) { M = hpbMatchBuild(now, doc, hpbParams(doc)); M.gen = ++HPB_GEN; M.ms = Math.round(performance.now() - t0); }
    } catch (e) { console.error('bake match', e); }
    this._hpbBusy = false;
    if (this._hpbJob !== job) return;
    this._hpbJob = null;
    if (!M) { this.renderStageOverlays(); return; }
    // (the current state again: an edit meanwhile makes another match later)
    this._hpb = { key: this.hpbGeoKey(v) === key.split('|').slice(1).join('|') ? key : '', M, rec: rec.id, v: v.id };
    await this.hpbLoadMoment(this.settings.bakeMoment);
    this.refreshViews(false);
    this.renderStageOverlays();
  },

  /** load a moment of the shown version's bake for the current match (pages, light per vertex, snow) */
  async hpbLoadMoment(mid) {
    const rec = this.hpbRec(), H = this._hpb;
    if (!rec || !H || !H.M || H.rec !== rec.id || !mid) return null;
    const doc = await this.hpbDoc(rec);
    if (!doc || !(doc.moments || []).some(x => x.id === mid)) return null;
    const old = this._hpbMd;
    if (old && old.gen === H.M.gen && old.id === mid) return old;
    const src = { key: rec.id, bytes: name => this.hpbBytes(rec.files[name]), has: name => !!rec.files[name] };
    const md = await hpbMomentData(src, doc, H.M, mid, (rec.moments || []).find(x => x.id === mid) || {}, level3d(this.settings) === 'phone', old);
    if (!md) return null;
    hpbMomentDrop(old, md);
    this._hpbMd = md;
    for (const pn of this.panes || []) if (pn.view && pn.view._hpbBound) this.hpbViewBuilt(pn.view, true);
    return md;
  },
  /** the storeys a view shows open from above (no storey above them is drawn) */
  hpbOpenOf(view) {
    const st = ((view.spec && view.spec.entries) || []).map(en => en.storey).filter(Boolean);
    return new Set(st.filter(s => !st.some(o => (o.level ?? 0) > (s.level ?? 0))).map(s => s.id));
  },
  /** a view built (or a moment loaded): its table, its light, its snow */
  hpbViewBuilt(view, light) {
    const md = this._hpbMd, H = this._hpb;
    if (view._hpb && view._hpb.table) view._hpb.table.dispose();
    if (!md || !H || !H.M || md.gen !== H.M.gen || !this.hpbOn() || md.id !== this.settings.bakeMoment) { view._hpb = null; view.hpbSnow(null); return; }
    if (view._hpbHit && view.group.children.some(r => r.userData.hpbGen && r.userData.hpbGen !== H.M.gen)) view.hpbCollect();
    view._hpb = { md, table: hpbTable(H.M, md, this.hpbOpenOf(view)), abs: !!this.settings.bakeAbs };
    view.hpbSnow(md);
    if (light) view.hpbLights(md);
    view.needs = true;
  },

  /** choose a moment (null: live light) */
  async hpbSetMoment(id) {
    const was = this.hpbOn();
    Settings.set('bakeMoment', id || null);
    const on = this.hpbOn();
    if (!on) {
      hpbMomentDrop(this._hpbMd, null);
      this._hpbMd = null;
      for (const pn of this.panes || []) if (pn.view && pn.view._hpbBound) { pn.view._hpb = null; pn.view.hpbSnow(null); }
      if (was) this.refreshViews(false);
      this.renderStageOverlays();
      return;
    }
    if (!was) this.refreshViews(false);
    await this.hpbLoadMoment(id);
    this.renderStageOverlays();
  },
  /** "As Fresing Render": the moment's own brightness by day too (L × 2^exposure, the sun at its baked strength) */
  hpbSetAbs(on) {
    Settings.set('bakeAbs', !!on);
    for (const pn of this.panes || []) if (pn.view && pn.view._hpb) { pn.view._hpb.abs = !!on; pn.view._aeLight = true; pn.view.needs = true; }
    this.renderStageOverlays();
  },

  /* ───────── import ───────── */
  /** Import bake…: read, check, match to the shown version, keep it with the version */
  /** why (optional, task 0042): why.reason is set when it returns false – 'refused' (the file is not for this), 'declined'
      (the owner said no), 'passing' (no 3D, no room, an error: try again later) */
  async hpbakeImport(file, why = {}) {
    const p = this.project;
    why.reason = 'passing';
    if (!p || !file) return false;
    if (p.viewer) { this.toast(t('A copy for viewing cannot take baked light.')); return false; }
    const v = this.shownVersion();
    const busy = UI.busy(t('Reading the bake…'));
    const refuse = async (msgs, title, reason = 'refused') => {
      why.reason = reason;
      busy.close();
      await UI.dialog({ title: title || t('This bake cannot be used'), body: h('div', { class: 'hpb-refuse', style: { display: 'grid', gap: '8px' } }, ...msgs.slice(0, 6).map(m => h('p', null, m)), msgs.length > 6 ? h('p', { class: 'note-muted' }, t('… and {n} more.', { n: msgs.length - 6 })) : null), actions: [{ label: t('OK'), value: true, kind: 'primary' }] });
      return false;
    };
    try {
      await new Promise(r => setTimeout(r, 30));
      const bytes = new Uint8Array(await file.arrayBuffer());
      let files;
      try { files = await hpbUnzip(bytes); } catch (e) { return refuse([e.hpb ? e.message : t('The file is damaged (not a complete zip).')]); }
      const rep = hpbCheck(files);
      if (rep.errors.length) return refuse(rep.errors);
      const doc = rep.doc, P = hpbParams(doc);
      busy.set(t('Matching it to the house…'));
      await new Promise(r => setTimeout(r, 30));
      const t0 = performance.now();
      const now = this.hpsSurfacesNow(v, P);
      if (!now) return refuse([t('3D is not available on this device.')], undefined, 'passing');
      const M = hpbMatchBuild(now, doc, P);
      M.gen = ++HPB_GEN; M.ms = Math.round(performance.now() - t0);
      const same = M.state.filter(x => x === 1 || x === 2).length;
      // another house: no part of this version is the bake's (same id and hash) and this house did not send that scene
      const ours = (p.hpScenes || []).some(x => x.id === doc.scene.id);
      if (!same && !ours) return refuse([t('This bake was made for another house: none of its {n} parts is in “{v}”.', { n: Object.keys(doc.surfaces || {}).length, v: v.name || t('Original') }), t('Open the house and version it was exported from, then import it there.')], t('Another house'));
      busy.close();
      if (v.bake) {
        const ok = await UI.confirm({ title: t('Replace the baked light?'), message: t('“{v}” has baked light from {f}. The new bake takes its place; the old one stays in Save points for 30 days.', { v: v.name, f: v.bake.file }), confirmLabel: t('Replace') });
        if (!ok) { why.reason = 'declined'; return false; }
        await Saver.flushNow();
        await Snapshots.create(this.project, 'backup', t('Before importing a bake ({d})', { d: fmtDate(Date.now()) }), 30);
      }
      const busy2 = UI.busy(t('Keeping the bake with the house…'));
      try {
        // the files the bake uses, each an asset of its own
        const need = new Set(['bake.json']);
        for (const pg of doc.pages || []) { need.add(pg.file); if (pg.ktx2 && files.has(pg.ktx2)) need.add(pg.ktx2); }
        for (const vf of doc.vertex_files || []) need.add(vf.file);
        for (const sn of doc.snow || []) need.add(sn.file);
        for (const ph of doc.photos || []) if (files.has(ph.file)) need.add(ph.file);
        for (const vd of doc.videos || []) if (vd && files.has(vd.file)) need.add(vd.file);
        const ids = {};
        let size = 0;
        for (const name of need) if (files.get(name)) size += files.get(name).length;
        // room on this device? (kept as text: about 4/3 of the file, twice for safety)
        try {
          const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
          if (est && est.quota && est.quota - (est.usage || 0) < size * 2.7) { busy2.close(); return refuse([t('There is not enough room on this device for this bake ({s}). Free some space, or bake fewer moments.', { s: fmtBytes(size) })], t('Not enough room'), 'passing'); }
        } catch (e) { /* unknown: try */ }
        try {
          for (const name of need) {
            const b = files.get(name);
            if (!b) continue;
            const id = uid('bk_');
            Assets.fresh.add(id);
            ids[name] = id;
            await BakeDB.put({ id, kind: 'bake', dataUrl: await hpbDataUrl(b, hpbMime(name)), w: 0, h: 0, created: Date.now() });
          }
        } catch (e) {
          // nothing half kept: the files written so far go again
          for (const id of Object.values(ids)) { try { await BakeDB.del(id); } catch (e2) { /* gone */ } Assets.fresh.delete(id); }
          busy2.close();
          if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))) return refuse([t('There is not enough room on this device for this bake ({s}). Free some space, or bake fewer moments.', { s: fmtBytes(size) })], t('Not enough room'), 'passing');
          throw e;
        }
        const moments = (doc.moments || []).map(m => {
          const sun = hpbMomentSun(p, doc.scene.id, m.id, doc.created);
          return { id: m.id, label: hpbMomentLabel(m.id), season: sun ? sun.season : ((/^(\w+)-/.exec(m.id) || [])[1] || null), night: sun ? sun.el < 0 : !m.sun_light, sun: sun ? { az: Math.round(sun.az * 1000) / 1000, el: Math.round(sun.el * 1000) / 1000 } : null };
        });
        const rec = { id: uid('bk_'), file: hpsText(file.name, 120, 'bake.hpbake'), size, imported: Date.now(), created: typeof doc.created === 'string' ? doc.created.slice(0, 30) : null,
          generator: hpsText(((doc.generator || {}).app || 'Fresing Render') + ' ' + ((doc.generator || {}).version || ''), 60), scene: doc.scene.id, light: doc.light, version: doc.version,
          moments, snow: (doc.snow || []).map(s => s.season), photos: (doc.photos || []).filter(ph => ids[ph.file]).length,
          problems: (doc.problems || []).slice(0, 20).map(x => hpsText(x, 300)), warnings: rep.warnings.slice(0, 10), json: ids['bake.json'], files: ids };
        this.mutate((proj) => { const vv = proj.versions.find(x => x.id === v.id); if (vv) vv.bake = rec; }, { project: true });
        this._hpbDoc = { id: rec.id, doc };
        this._hpb = { key: rec.id + '|' + this.hpbGeoKey(v), M, rec: rec.id, v: v.id };
        this._hpbMd = null;
        busy2.close();
      } catch (e) { busy2.close(); throw e; }
      if (!v.bake || !v.bake.json) return false;
      const first = (v.bake.moments.find(m => !m.night && /afternoon/.test(m.id)) || v.bake.moments.find(m => !m.night) || v.bake.moments[0] || {}).id;
      if (first) await this.hpbSetMoment(first);
      const out = M.changes.filter(c => c.how !== 'moved').length;
      const msgs = [t('Baked light of {n} moments for “{v}”: {a} of {b} parts match.', { n: v.bake.moments.length, v: v.name || t('Original'), a: same, b: M.surfaces.filter(S => S.bake !== 'NO').length })];
      if (out) msgs.push(t('{n} parts changed since the bake – bake again to see their light.', { n: out }));
      if (!P.fromId) msgs.push(t('This bake comes from an older export: parts whose layout differs show live light.'));
      for (const w of rep.warnings.slice(0, 3)) msgs.push(w);
      for (const x of v.bake.problems.slice(0, 5)) msgs.push(t('Fresing Render: {p}', { p: x }));
      this.toast(msgs.join(' '), { ms: 9000 });
      return true;
    } catch (e) {
      console.error(e);
      busy.close();
      this.toast(t('The bake could not be read: {e}', { e: String(e && e.message || e).slice(0, 160) }), { ms: 8000 });
      return false;
    }
  },
  async hpbImportFlow() {
    const files = await pickFiles('.hpbake,application/zip');
    if (files && files[0]) return this.hpbakeImport(files[0]);
    return false;
  },
  /** take the baked light away from the shown version (kept in Save points for 30 days) */
  async hpbRemove() {
    const v = this.shownVersion(), rec = this.hpbRec(v);
    if (!rec) return;
    const others = this.project.versions.filter(x => x !== v && x.bake && x.bake.id === rec.id).length;
    const ok = await UI.confirm({ title: t('Remove the baked light?'), message: others ? t('From “{v}” only: {n} other versions keep it.', { v: v.name, n: others }) : t('“{v}” shows live light again. The bake stays in Save points for 30 days.', { v: v.name }), confirmLabel: t('Remove'), danger: true });
    if (!ok) return;
    await Saver.flushNow();
    await Snapshots.create(this.project, 'backup', t('Before removing baked light ({d})', { d: fmtDate(Date.now()) }), 30);
    this.mutate(proj => { const vv = proj.versions.find(x => x.id === v.id); if (vv) delete vv.bake; }, { project: true });
    await this.hpbSetMoment(null);
    this.toast(t('Baked light removed.'));
  },

  /* ───────── what the owner sees ───────── */
  /** the changed parts in words: “Wall (side a) · Ground floor”, “Sofa”, “Floor of Kitchen” … */
  hpbPartName(id) {
    const p = this.project, v = this.shownVersion(), plan = v.plan;
    const [kind, a, b] = String(id).split(':');
    const room = rid => (plan.rooms.find(r => r.id === rid) || {}).name;
    const st = sid => ((p.storeys || []).find(s => s.id === sid) || {}).name;
    if (kind === 'wall' && a && !a.includes('.')) { const w = plan.walls.find(x => x.id === a); return t('Wall') + (w ? ' ' + fmtM(V.dist(w.a, w.b)) + ' · ' + (st(w.storey) || '') : '') + (b === 'edge' ? ' (' + t('edge') + ')' : ''); }
    if (kind === 'floor') return room(a) ? t('Floor of {r}', { r: room(a) }) : t('Floor');
    if (kind === 'ceiling') return room(a) ? t('Ceiling of {r}', { r: room(a) }) : t('Ceiling');
    if (kind === 'furniture') { const it = (this.activeLayout() || { items: [] }).items.find(f => hpsName(f.id) === a); return it ? furnName(it) : t('Furniture'); }
    if (kind === 'opening') { const o = plan.openings.find(x => hpsName(x.id) === a); return o ? t({ door: 'Door', window: 'Window' }[o.kind] || 'Opening') : t('Door or window'); }
    if (kind === 'lamp' || kind === 'install') return t({ lamp: 'Lamp', install: 'Electrics' }[kind]);
    const words = { roof: 'Roof', stair: 'Stair', 'slab-edge': 'Floor edge', ground: 'Ground', garden: 'Garden', plant: 'Plant', foliage: 'Leaves', street: 'Street', neighbour: 'Neighbours', park: 'Water & park', other: 'Other part' };
    return t(words[kind] || 'Other part');
  },
  hpbStatusText() {
    const H = this._hpb, rec = this.hpbRec();
    if (!rec) return '';
    if (this._hpbMissing === rec.id) return t('The bake’s files are not on this device: import the house with baked light, or import the bake again.');
    if (this._hpbBusy || !H || !H.M || H.rec !== rec.id) return t('Matching the bake to the house…');
    const ch = H.M.changes.filter(c => c.how !== 'moved').length, mv = H.M.changes.filter(c => c.how === 'moved').length;
    if (!ch && !H.M.near && !mv) return t('Every part matches the bake.');
    const out = [];
    if (ch) out.push(t('{n} parts changed since the bake – bake again', { n: ch }));
    if (mv) out.push(t('{n} pieces moved (their own light kept)', { n: mv }));
    if (H.M.near) out.push(t('{n} parts near them show live light', { n: H.M.near }));
    return out.join(' · ');
  },
  /** the bar over the 3D view while baked light is shown: the moment, what changed, Fresing's brightness, live */
  bakeBar() {
    const rec = this.hpbRec(), cur = this.settings.bakeMoment;
    const sel = h('select', { id: 'bake-moment', 'aria-label': t('Baked moment'), onchange: e => this.hpbSetMoment(e.target.value || null) },
      h('option', { value: '' }, t('Live light')), ...(rec.moments || []).map(m => h('option', { value: m.id, selected: m.id === cur }, m.label || hpbMomentLabel(m.id))));
    const md = this._hpbMd;
    const day = md && !md.night;
    const H = this._hpb, out = H && H.M && H.rec === rec.id ? H.M.changes.length + H.M.near : 0;
    return h('div', { class: 'modebar bake-bar', id: 'bake-bar' },
      h('span', { class: 'bake-ic', 'aria-hidden': 'true' }, icon('sun')), sel,
      h('span', { class: 'bake-status', id: 'bake-status', 'aria-live': 'polite' }, this.hpbStatusText()),
      out ? h('button', { class: 'btn ghost sm', id: 'bake-which', onclick: () => this.hpbWhich() }, t('Which?')) : null,
      day ? h('button', { class: 'chip', id: 'bake-abs', 'aria-pressed': String(!!this.settings.bakeAbs), title: t('Brightness as Fresing Render shows this moment'), onclick: () => this.hpbSetAbs(!this.settings.bakeAbs) }, t('As Fresing')) : null,
      h('button', { class: 'btn ghost sm icon-only', id: 'bake-more', title: t('Baked light…'), 'aria-label': t('Baked light…'), onclick: () => this.bakeSheet() }, icon('more')));
  },
  /** which parts changed since the bake, in words */
  async hpbWhich() {
    const H = this._hpb;
    if (!H || !H.M) return;
    const how = { changed: t('changed'), new: t('new'), deleted: t('gone'), moved: t('moved') };
    const rows = H.M.changes.slice(0, 60).map(c => h('li', null, this.hpbPartName(c.id), ' – ', how[c.how] || c.how));
    await UI.dialog({ title: t('Changed since the bake'), body: h('div', { id: 'bake-which-list', style: { display: 'grid', gap: '8px' } },
      h('p', null, t('These parts show live light: export the house again for Fresing Render and bake it again to see their baked light.')),
      h('ul', { class: 'bake-list' }, ...rows), H.M.changes.length > 60 ? h('p', { class: 'note-muted' }, t('… and {n} more.', { n: H.M.changes.length - 60 })) : null,
      H.M.near ? h('p', { class: 'note-muted' }, t('{n} parts near them show live light too: their shadows may have changed.', { n: H.M.near })) : null),
      actions: [{ label: t('OK'), value: true, kind: 'primary' }] });
  },
  /** View → 3D: baked light…: the bake of this version, its moments, import and remove */
  async bakeSheet() {
    const p = this.project, v = this.shownVersion(), rec = this.hpbRec(v);
    const body = h('div', { class: 'bake-sheet', style: { display: 'grid', gap: '12px' } });
    let close = () => {};
    if (!rec) {
      body.append(h('p', null, t('Baked light comes from Fresing Render on your PC: export this version with Export → For Fresing Render…, bake it there, then import the .hpbake file here.')),
        h('div', { class: 'bake-actions' }, h('button', { class: 'btn primary', id: 'bake-import', onclick: async () => { close(); await this.hpbImportFlow(); } }, icon('upload'), t('Import bake…'))));
    } else {
      const cur = this.settings.bakeMoment;
      const mBtn = (id, label) => h('button', { class: 'chip bake-m', id: 'bake-m-' + (id || 'live'), 'aria-pressed': String((cur || '') === (id || '') || (!id && !this.hpbOn())), onclick: async () => { close(); await this.hpbSetMoment(id); if (id && this.view.dim !== '3d' && this.setDim) this.setDim('3d'); } }, label);
      const shared = p.versions.filter(x => x.bake && x.bake.id === rec.id).length;
      body.append(
        h('div', { class: 'bake-moments', role: 'group', 'aria-label': t('Moments') }, mBtn(null, t('Live light')), ...rec.moments.map(m => mBtn(m.id, m.label || hpbMomentLabel(m.id)))),
        h('dl', { class: 'kv' },
          h('dt', null, t('File')), h('dd', { style: { overflowWrap: 'anywhere' } }, rec.file),
          h('dt', null, t('Imported')), h('dd', null, fmtDate(rec.imported)),
          rec.created ? h('dt', null, t('Baked')) : null, rec.created ? h('dd', null, fmtDate(Date.parse(rec.created) || rec.imported)) : null,
          h('dt', null, t('Made by')), h('dd', null, rec.generator),
          h('dt', null, t('Light')), h('dd', null, { SOFT: t('Soft (the sun stays live)'), ALL: t('All baked'), LIVE: t('Live (snow and photos only)') }[rec.light] || rec.light),
          h('dt', null, t('Size')), h('dd', null, fmtBytes(rec.size || 0)),
          shared > 1 ? h('dt', null, t('Versions')) : null, shared > 1 ? h('dd', null, t('{n} versions share it', { n: shared })) : null),
        h('p', { class: 'note-muted', id: 'bake-sheet-status' }, this.hpbStatusText()),
        h('p', { class: 'note-muted' }, t('Backups and exports leave baked light out unless you tick “With baked light” in Export: keep the .hpbake file too.')),
        (rec.problems || []).length ? h('div', null, h('b', null, t('From Fresing Render')), h('ul', { class: 'bake-list' }, ...rec.problems.map(x => h('li', null, x)))) : null,
        h('div', { class: 'bake-actions' },
          h('button', { class: 'btn', id: 'bake-import', onclick: async () => { close(); await this.hpbImportFlow(); } }, icon('upload'), t('Import bake…')),
          h('button', { class: 'btn danger', id: 'bake-remove', onclick: async () => { close(); await this.hpbRemove(); } }, icon('trash'), t('Remove'))));
    }
    await UI.dialog({ title: t('Baked light'), body, onOpen: (d, c) => { close = () => c(null); }, actions: [{ label: t('Close'), value: null }] });
  },
});

/* ───────── the format's own made-up house with a bake on it (tests and reports) ─────────
   The samples of house-scene-format are made for its own made-up house, not for a house of this app: a bake of them is
   refused for an app house (another house). This draws that house (its .hpscene) with a bake on it the way the 3D views
   draw baked light – the same matching, tables, pages and materials – so a test can look at both samples, Fresing
   Render's real Cycles bake among them. Returns numbers and a picture. */
async function hpbPreview(sceneBytes, bakeBytes, mid, o = {}) {
  const sf = await hpbUnzip(sceneBytes), bf = await hpbUnzip(bakeBytes);
  const rep = hpbCheck(bf);
  if (rep.errors.length) return { errors: rep.errors };
  const doc = rep.doc, scene = JSON.parse(new TextDecoder().decode(sf.get('scene.json')));
  const v3 = new THREE.Vector3();
  const surfaces = hpbGlbNodes(sf.get('house.glb')).map(nd => {
    const nm = new THREE.Matrix3().getNormalMatrix(nd.matrix);
    return { hp: nd.hp, hash: nd.hp.hash, translation: null, prims: nd.prims.map(pr => {
      const pos = new Float32Array(pr.pos.length), nrm = new Float32Array(pr.pos.length);
      for (let i = 0; i < pr.pos.length; i += 3) {
        v3.set(pr.pos[i], pr.pos[i + 1], pr.pos[i + 2]).applyMatrix4(nd.matrix); pos[i] = v3.x; pos[i + 1] = v3.y; pos[i + 2] = v3.z;
        if (pr.nrm) { v3.set(pr.nrm[i], pr.nrm[i + 1], pr.nrm[i + 2]).applyMatrix3(nm).normalize(); nrm[i] = v3.x; nrm[i + 1] = v3.y; nrm[i + 2] = v3.z; }
      }
      return { key: pr.matName, pos, nrm, uv1: pr.uv1 ? Float32Array.from(pr.uv1) : null, idx: Uint32Array.from(pr.idx), color: pr.color };
    }) };
  });
  const roots = { garden: new THREE.Matrix4() };
  for (const st of scene.storeys || []) roots[st.id] = new THREE.Matrix4();
  const M = hpbMatchBuild({ surfaces, roots, groups: [] }, doc, hpbParams(doc));
  M.gen = ++HPB_GEN;
  const sm = ((scene.recipe || {}).moments || []).find(x => x.id === mid) || {};
  const rm = { season: sm.season, sun: sm.sun ? { az: sm.sun.azimuth, el: sm.sun.elevation } : null, night: sm.sun ? sm.sun.elevation < 0 : undefined };
  const md = await hpbMomentData({ key: 'preview', bytes: async n => bf.get(n) || null, has: n => bf.has(n) }, doc, M, mid, rm, false, null);
  if (!md) return { errors: ['no moment ' + mid] };
  const W = o.width || 480, H = o.height || 320;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.toneMapping = THREE.NeutralToneMapping;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(md.night ? '#1d242b' : '#dde5ec');
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfcac2, md.night ? 0.3 : 1.45), sun = new THREE.DirectionalLight(0xfff6ea, md.night || !sm.sun ? 0 : 1.25);
  if (sm.sun) sun.position.set(sm.sun.direction[0] * 40, sm.sun.direction[1] * 40, sm.sun.direction[2] * 40);
  sc.add(hemi, sun);
  const I = new THREE.Matrix4(), mats = [], geos = [];
  for (const S of surfaces) {
    if (S.hp.bake === 'NO') continue;
    for (const P of S.prims) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(P.nrm, 3));
      g.setIndex(new THREE.BufferAttribute(P.idx, 1));
      const c = P.color || [0.8, 0.8, 0.8, 1];
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), roughness: 0.9, side: THREE.DoubleSide });
      mat.userData.key = P.key;
      hpbPatch(mat);
      const mesh = new THREE.Mesh(g, mat);
      if (!o.live) hpbTransfer(mesh, M, I, S.hp.bake === 'VERTEX');
      sc.add(mesh); mats.push(mat); geos.push(g, mesh.geometry);
    }
  }
  for (const L of md.snow) { const k = M.byId.get(L.on); if (k !== undefined && (M.state[k] === 1 || M.state[k] === 2)) sc.add(new THREE.Mesh(L.geo, hpbSnowMat())); }
  const view = { scene: sc, sun, _hpbHit: o.live ? 0 : 1, _hpb: o.live ? null : { md, table: hpbTable(M, md, new Set(o.open || [])), abs: !!o.abs } };
  sc.onBeforeRender = () => hpbBind(view);
  const cam = ((scene.recipe || {}).cameras || [])[0] || { position: [3.5, 1.7, 22], target: [3.5, 2.5, 4.5], fov: 50 };
  const camera = new THREE.PerspectiveCamera(cam.fov || 50, W / H, 0.1, 600);
  camera.position.set(...(o.position || cam.position)); camera.lookAt(...(o.target || cam.target));
  r.render(sc, camera);
  const gl = r.getContext(), px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
  const png = canvas.toDataURL('image/png');
  const res = { matched: M.state.filter(x => x === 1).length, surfaces: M.surfaces.filter(S => S.bake !== 'NO').length, snow: md.snow.length, pages: md.pages.length,
    night: md.night, mean: Math.round(sum / (W * H) * 10) / 10, png, ms: md.ms };
  if (view._hpb) view._hpb.table.dispose();
  hpbMomentDrop(md, null);
  for (const m of mats) m.dispose();
  for (const g of geos) g.dispose();
  r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
  return res;
}
