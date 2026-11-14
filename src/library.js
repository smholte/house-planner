/* ───────────── library.js — the asset library: pictures and models outside the app file (task 0009) ─────────────
   A library is a folder lib/ (or a zip of it): library.json (tools/build-library.py, build.py) and its files, each named
   by its content. Items: picture sets (kind 'tex', texlib.js), skies ('sky'), the Kenney models' geometry ('pack'), the
   KTX2 reader ('code') and – the owner's library only – models ('model', key 'l:<name>').
   Where it comes from:
     - the web version and the app folder: lib/ next to index.html – the list at start, each file the first time it is
       needed;
     - the single file: Settings → Library → Load library… (house-planner-library.zip from the release).
   What was fetched or loaded is kept in a database of its own, house-planner-lib (stores: files, libs) – never in the
   houses' database, and the service worker leaves lib/ alone: an app update does not download it again, and offline the
   kept copy is used. A file that is not on this device and can't be fetched is simply missing: the caller falls back
   (texlib.js: the built-in or drawn pictures; models.js: a plain box). Nothing of a saved house changes. */

const LIB_DB = 'house-planner-lib';
const LIB = {
  db: null, memory: null,     // the database (or, where there is none, a Map in memory)
  libs: new Map(),            // name → { name, man, from: 'web' | 'zip', at }
  items: new Map(),           // item id → item (the house library over the public one)
  served: null,               // the list of lib/ next to index.html (web, app folder), when it could be read
  pending: new Map(),         // file → Promise<Blob | null>
  urls: new Map(),            // file → object URL
  fetched: 0, stored: 0,      // files fetched from lib/ / read from the database (this session)
  ready: null,
};
const libHosted = () => /^https?:$/.test(location.protocol);

function libDbOpen() {
  return new Promise(res => {
    try {
      if (!('indexedDB' in window)) throw new Error('no indexedDB');
      const req = indexedDB.open(LIB_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'f' });
        if (!db.objectStoreNames.contains('libs')) db.createObjectStore('libs', { keyPath: 'name' });
      };
      req.onsuccess = () => { req.result.onversionchange = () => { try { req.result.close(); } catch (e) { /* ignore */ } }; res(req.result); };
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
}
function libTx(store, mode, fn) {
  if (!LIB.db) {
    const m = LIB.memory[store];
    return Promise.resolve(fn(null, m));
  }
  return new Promise((resolve, reject) => {
    const tx = LIB.db.transaction(store, mode), st = tx.objectStore(store);
    let out;
    const r = fn(st);
    if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}
const libGet = (store, key) => libTx(store, 'readonly', (st, m) => st ? st.get(key) : m.get(key));
const libPut = (store, val) => libTx(store, 'readwrite', (st, m) => st ? st.put(val) : m.set(val.f || val.name, val));
const libDel = (store, key) => libTx(store, 'readwrite', (st, m) => st ? st.delete(key) : m.delete(key));
const libAll = store => libTx(store, 'readonly', (st, m) => st ? st.getAll() : [...m.values()]);
const libKeys = store => libTx(store, 'readonly', (st, m) => st ? st.getAllKeys() : [...m.keys()]);

/** the libraries on this device and, hosted, the list of lib/ (kept for offline) */
function libraryInit() {
  if (LIB.ready) return LIB.ready;
  LIB.ready = (async () => {
    LIB.db = await libDbOpen();
    if (!LIB.db) LIB.memory = { files: new Map(), libs: new Map() };
    try { for (const l of await libAll('libs')) if (l && libValid(l.man)) LIB.libs.set(l.name, l); } catch (e) { console.warn('library', e); }
    if (libHosted()) {
      // (asked again every time – never kept for good; a connection that hangs: the kept list after 6 s)
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ac && ac.abort(), 6000);
      try {
        const r = await fetch('lib/library.json', { cache: 'no-cache', signal: ac ? ac.signal : undefined });
        const man = r.ok ? await r.json() : null;
        if (libValid(man)) {
          LIB.served = man;
          const rec = { name: man.name, man, from: 'web', at: Date.now() };
          // (one library served here: an older one of another name that came from here goes)
          for (const l of [...LIB.libs.values()]) if (l.from === 'web' && l.name !== man.name) { LIB.libs.delete(l.name); libDel('libs', l.name).catch(() => {}); }
          LIB.libs.set(man.name, rec);
          libPut('libs', rec).catch(() => {});
        }
      } catch (e) { /* offline: the kept list */ }
      clearTimeout(timer);
      if (!LIB.served) { const w = [...LIB.libs.values()].filter(l => l.from === 'web').sort((a, b) => b.at - a.at)[0]; if (w) LIB.served = w.man; }
    }
    libIndex();
    // the built-in look on the first visit (the furniture models' geometry: small), so a second visit works offline
    LIB.kept = libHosted() ? Promise.all([...LIB.items.values()].filter(it => it.base && it.kind === 'pack').flatMap(it => it.files.map(v => libBlob(v.f)))) : Promise.resolve();
    return true;
  })();
  return LIB.ready;
}
/** a library list the app can use: every item with an id and kind, and the files of its kind ({ px, f, b } lists) –
 *  anything else is refused, so a broken list can never stop the 3D view later */
function libValid(man) {
  if (!man || man.kind !== 'house-planner-library' || typeof man.name !== 'string' || !Array.isArray(man.items)) return false;
  const files = l => Array.isArray(l) && l.length > 0 && l.every(v => v && typeof v.f === 'string' && !v.f.includes('..') && typeof v.b === 'number' && (v.px == null || typeof v.px === 'number'));
  return man.items.every(it => it && typeof it.id === 'string' && (
    it.kind === 'tex' ? it.maps && typeof it.maps === 'object' && it.meta && Object.values(it.maps).every(files) && Object.values(it.gpu || {}).every(files)
      : it.kind === 'sky' ? files(it.files) && it.files.every(v => typeof v.px === 'number')
        : ['pack', 'code', 'model'].includes(it.kind) ? files(it.files) && (it.kind !== 'model' || (Array.isArray(it.size) && it.size.length === 3))
          : true));
}
/** every item by its id: the public library first, the house's over it */
function libIndex() {
  LIB.items.clear();
  const order = [...LIB.libs.values()].sort((a, b) => (a.name === 'public' ? 0 : 1) - (b.name === 'public' ? 0 : 1));
  for (const l of order) for (const it of l.man.items || []) LIB.items.set(it.id, Object.assign({}, it, { lib: l.name }));
}
const libItem = id => LIB.items.get(id) || null;
/** the files an item lists (its pictures at every size, KTX2 copies, sky sizes, model, code) */
function libFilesOf(it) {
  const out = [];
  for (const g of ['maps', 'gpu']) for (const v of Object.values(it[g] || {})) out.push(...v);
  out.push(...(it.files || []));
  return out;
}
/** of a list of sizes ({ px, f, b }): the largest that is at most want, else the smallest there is */
function libPick(list, want) {
  if (!list || !list.length) return null;
  const s = [...list].sort((a, b) => a.px - b.px);
  let best = s[0];
  for (const v of s) if (v.px <= want) best = v;
  return best;
}
/** safe pictures (view3d.js: the Pixel's PowerVR driver crashed once): nothing larger than 512; KTX2 copies only with
 *  their first picture (no smaller copies, as the safe pictures – task 0010) */
const libSafe = () => (typeof SAFE_TEX !== 'undefined' && SAFE_TEX) || !!(typeof GPU_INFO !== 'undefined' && GPU_INFO && needSafeTex(GPU_INFO, (app && app.settings) || {}))
  || !!(app && app.settings && app.settings.safeTex);
const libLevel = () => (typeof levelKnobs === 'function' ? levelKnobs((app && app.settings) || {}) : { texPx: 512, ktx2: false });
/** the picture size this device asks for (settings.texSize, else its level – task 0010: Phone and Normal 512, PC high
 *  2048) */
const libWantPx = () => { const s = (app && app.settings) || {}; const v = Math.max(256, +(s.texSize || libLevel().texPx || 512)); return libSafe() ? Math.min(512, v) : v; };
/** GPU-compressed pictures (KTX2) where the library has them: settings.texGpu, else the level (task 0010: Phone);
 *  never with "Pictures as before" (settings.texPlain) */
const libWantGpu = () => { const s = (app && app.settings) || {}; return !s.texPlain && (s.texGpu != null ? !!s.texGpu : !!libLevel().ktx2); };

/** a library file as a Blob: kept on this device, else (hosted) fetched from lib/ and kept; null when it can't be had */
function libBlob(f) {
  if (!f) return Promise.resolve(null);
  if (LIB.pending.has(f)) return LIB.pending.get(f);
  const p = (async () => {
    try {
      const rec = await libGet('files', f);
      if (rec && rec.blob) { LIB.stored++; return rec.blob; }
    } catch (e) { /* not kept */ }
    if (!libHosted() || !LIB.served) return null;
    try {
      const r = await fetch('lib/' + f);
      if (!r.ok) return null;
      const blob = await r.blob();
      LIB.fetched++;
      libPut('files', { f, blob, lib: LIB.served.name, at: Date.now() }).catch(e => console.warn('library: not kept', f, e));
      return blob;
    } catch (e) { return null; }
  })();
  LIB.pending.set(f, p);
  // (not kept here once it arrived: the caller keeps what it needs; a model's bytes are not held twice)
  p.then(() => LIB.pending.delete(f));
  return p;
}
/** an object URL of a library file (made once) */
async function libUrl(f) {
  if (LIB.urls.has(f)) return LIB.urls.get(f);
  const b = await libBlob(f);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  LIB.urls.set(f, u);
  return u;
}
/** a gzip'd library file, unpacked */
async function libGunzip(f) {
  const b = await libBlob(f);
  if (!b) return null;
  return new Response(b.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/** files no library on this device lists any more are deleted (after a new list came, or a library was removed) */
async function libPrune() {
  if (LIB.loading) return 0;      // (a zip being read: its files are not listed yet)
  const keep = new Set();
  for (const l of LIB.libs.values()) for (const it of l.man.items || []) for (const v of libFilesOf(it)) keep.add(v.f);
  let n = 0;
  for (const f of await libKeys('files')) if (!keep.has(f)) { await libDel('files', f); n++; }
  return n;
}

/* ───────── a library zip (the single file: Settings → Library → Load library…) ─────────
   Read file by file from the zip (its central directory says where each one is), so a 50 MB zip is never in memory
   as a whole. Stored (not deflated) files are taken as they are; deflated ones are unpacked. */
async function libZipEntries(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not a zip file.');
  const n = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map();
  for (let i = 0, p = 0; i < n; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), size = cd.getUint32(p + 24, true);
    const nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lho = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
    if (flags & 1) throw new Error('The zip file is packed in a way the app can\'t read.');
    out.set(name.replace(/^\.?\//, ''), { method, csize, size, lho });
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function libZipRead(file, e) {
  const h = new DataView(await file.slice(e.lho, e.lho + 30).arrayBuffer());
  const start = e.lho + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  const raw = file.slice(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  throw new Error('The zip file is packed in a way the app can\'t read.');
}
/** a library zip into this device's library; onStep(done, total) while it reads; returns { name, items, bytes } */
async function libLoadZip(file, onStep) {
  await libraryInit();
  let ents;
  try { ents = await libZipEntries(file); } catch (e) { throw new Error(e instanceof RangeError ? 'The zip file is damaged.' : e.message); }
  // (a zip of the folder itself: house-planner/lib/library.json …)
  const key = [...ents.keys()].find(k => k === 'library.json' || k.endsWith('/library.json'));
  if (!key) throw new Error('This zip file is not a House Planner library (no library.json in it).');
  const pre = key.slice(0, key.length - 'library.json'.length);
  let man;
  try { man = JSON.parse(await (await libZipRead(file, ents.get(key))).text()); } catch (e) { throw new Error('The library list in this zip file can\'t be read.'); }
  if (!libValid(man)) throw new Error('This zip file is not a House Planner library.');
  const files = [];
  for (const it of man.items) for (const v of libFilesOf(it)) files.push(v);
  let done = 0, bytes = 0;
  LIB.loading = true;
  try {
    for (const v of files) {
      const e = ents.get(pre + v.f);
      if (!e) { done++; continue; }                 // (a library without its KTX2 copies: those are just not there)
      // (the size the list gives, before anything is unpacked: a damaged or doctored zip is not read into memory)
      if (e.size !== v.b || (e.method === 0 && e.csize !== v.b)) throw new Error('The zip file is damaged.');
      const have = await libGet('files', v.f).catch(() => null);
      if (!have || !have.blob || have.blob.size !== v.b) {
        const blob = await libZipRead(file, e);
        if (blob.size !== v.b) throw new Error('The zip file is damaged.');
        await libPut('files', { f: v.f, blob, lib: man.name, at: Date.now() });
      }
      bytes += v.b;
      if (onStep) onStep(++done, files.length);
    }
    const rec = { name: man.name, man, from: 'zip', at: Date.now() };
    await libPut('libs', rec);
    LIB.libs.set(man.name, rec);
    libIndex();
  } catch (e) {
    throw new Error(e instanceof RangeError ? 'The zip file is damaged.' : e && e.name === 'QuotaExceededError' ? 'There is not enough room on this device for the library.' : (e && e.message) || String(e));
  } finally {
    // (an older copy of this library's files, or what a failed read left behind, goes)
    LIB.loading = false;
    await libPrune().catch(() => 0);
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  return { name: man.name, items: man.items.length, bytes };
}
/** a library off this device (its files go when no other library lists them) */
async function libRemove(name) {
  await libraryInit();
  await libDel('libs', name);
  LIB.libs.delete(name);
  libIndex();
  return libPrune();
}
/** what is on this device: per library its items, pictures, models and the bytes kept */
async function libStatus() {
  await libraryInit();
  const kept = new Map();
  try { for (const r of await libAll('files')) kept.set(r.f, r.blob ? r.blob.size : 0); } catch (e) { /* none */ }
  return [...LIB.libs.values()].map(l => {
    let have = 0, total = 0, files = 0, on = 0;
    for (const it of l.man.items) for (const v of libFilesOf(it)) { files++; total += v.b; if (kept.has(v.f)) { on++; have += v.b; } }
    return { name: l.name, from: l.from, at: l.at, items: l.man.items.length, sets: l.man.items.filter(i => i.kind === 'tex').length,
      models: l.man.items.filter(i => i.kind === 'model').length, files, on, have, total };
  });
}
