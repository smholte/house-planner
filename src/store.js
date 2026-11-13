/* ───────────── store.js — everything lives on this device (IndexedDB), nothing leaves it ─────────────
   stores:
     projects   current working state of each house (always up to date)
     snapshots  autosaves (rolling, max AUTO_KEEP per project), save points (never auto-deleted), backups
     trash      deleted projects / versions / save points, restorable until the trash is emptied
     assets     imported drawings (big images), shared by projects + snapshots
     meta       settings
*/

const DB_NAME = 'house-planner';
const DB_VER = 1;
const AUTO_EVERY_MS = 2 * 60 * 1000;   // rolling autosave interval
const AUTO_KEEP = 10;                  // rolling autosaves kept per project
const BACKUP_KEEP = 10;                // automatic safety backups kept per project
const EMERGENCY_KEY = 'house-planner.emergency';

const DB = {
  db: null,
  memory: false,
  mem: { projects: new Map(), snapshots: new Map(), trash: new Map(), assets: new Map(), meta: new Map() },

  async open() {
    try {
      if (!('indexedDB' in window)) throw new Error('no indexedDB');
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('snapshots')) {
            const st = db.createObjectStore('snapshots', { keyPath: 'id' });
            st.createIndex('projectId', 'projectId');
          }
          if (!db.objectStoreNames.contains('trash')) db.createObjectStore('trash', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
      this.db.onversionchange = () => { try { this.db.close(); } catch (e) { /* ignore */ } };
    } catch (e) {
      console.warn('IndexedDB unavailable, running in memory', e);
      this.memory = true;
    }
    return !this.memory;
  },

  _req(storeName, mode, fn) {
    if (this.memory) return Promise.resolve(fn(null));
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      const r = fn(store);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },
  get(store, key) {
    if (this.memory) return Promise.resolve(clone(this.mem[store].get(key)));
    return this._req(store, 'readonly', st => st.get(key));
  },
  put(store, value) {
    if (this.memory) { this.mem[store].set(value.id ?? value.key, clone(value)); return Promise.resolve(); }
    return this._req(store, 'readwrite', st => st.put(value));
  },
  del(store, key) {
    if (this.memory) { this.mem[store].delete(key); return Promise.resolve(); }
    return this._req(store, 'readwrite', st => st.delete(key));
  },
  all(store) {
    if (this.memory) return Promise.resolve([...this.mem[store].values()].map(clone));
    return this._req(store, 'readonly', st => st.getAll());
  },
  byProject(projectId) {
    if (this.memory) return Promise.resolve([...this.mem.snapshots.values()].filter(s => s.projectId === projectId).map(clone));
    return this._req('snapshots', 'readonly', st => st.index('projectId').getAll(projectId));
  },
  allKeys(store) {
    if (this.memory) return Promise.resolve([...this.mem[store].keys()]);
    return this._req(store, 'readonly', st => st.getAllKeys());
  },
};

/* ───────── assets (imported drawings) — kept in memory as object URLs for drawing ───────── */
const Assets = {
  cache: new Map(), // id -> {url, w, h}
  fresh: new Set(), // made in this session: never cleaned up before the next start
  async put(dataUrl, w, h) {
    const id = uid('as_');
    this.fresh.add(id);
    await DB.put('assets', { id, dataUrl, w, h, created: Date.now() });
    this.cache.set(id, { url: dataUrl, w, h });
    return id;
  },
  /** an imported 3D model, kept as a .glb data URL */
  async putModel(dataUrl) {
    const id = uid('md_');
    this.fresh.add(id);
    await DB.put('assets', { id, kind: 'model', dataUrl, w: 0, h: 0, created: Date.now() });
    this.cache.set(id, { url: dataUrl, w: 0, h: 0 });
    return id;
  },
  async putShell(json) {
    const id = uid('sh_');
    this.fresh.add(id);
    await DB.put('assets', { id, kind: 'shell', json, created: Date.now() });
    this.cache.set(id, { kind: 'shell', json });
    return id;
  },
  async ensure(ids) {
    const missing = ids.filter(id => id && !this.cache.has(id));
    for (const id of missing) {
      const a = await DB.get('assets', id);
      if (a) this.cache.set(id, a.kind === 'shell' ? { kind: 'shell', json: a.json } : { url: a.dataUrl, w: a.w, h: a.h });
    }
  },
  /** the decoded 3D shell of a project (façade, roof … from an IFC model), or null */
  shell(id) {
    const c = id && this.cache.get(id);
    if (!c || c.kind !== 'shell') return null;
    if (!c.decoded) { try { c.decoded = decodeShell(c.json); } catch (e) { console.warn('shell decode failed', e); c.decoded = null; } }
    return c.decoded;
  },
  get(id) { return this.cache.get(id) || null; },
  async getRecord(id) { return DB.get('assets', id); },
  async putRecord(rec) { this.fresh.add(rec.id); await DB.put('assets', rec); this.cache.set(rec.id, rec.kind === 'shell' ? { kind: 'shell', json: rec.json } : { url: rec.dataUrl, w: rec.w, h: rec.h }); },
  /** delete assets nobody references any more (projects, snapshots, trash) */
  async collectGarbage() {
    try {
      const used = new Set();
      const scan = p => { if (!p) return; for (const id of assetIdsOf(p)) used.add(id); };
      for (const p of await DB.all('projects')) scan(p);
      // the house that is open (its latest changes may not be written yet) and anything made in this session
      if (Saver.project) scan(Saver.project);
      for (const id of this.fresh) used.add(id);
      for (const sn of await DB.all('snapshots')) scan(sn.project);
      for (const t of await DB.all('trash')) {
        if (t.payload && t.payload.project) scan(t.payload.project);
        if (t.payload && t.payload.snapshots) for (const sn of t.payload.snapshots) scan(sn.project);
        if (t.payload && t.payload.snapshot) scan(t.payload.snapshot.project);
      }
      for (const id of await DB.allKeys('assets')) if (!used.has(id)) { await DB.del('assets', id); this.cache.delete(id); }
    } catch (e) { console.warn('asset GC failed', e); }
  },
};

function assetIdsOf(project) {
  const ids = Object.values(project.underlays || {}).map(u => u && u.assetId).filter(Boolean);
  if (project.shell && project.shell.assetId) ids.push(project.shell.assetId);
  // photos in notes
  for (const n of project.notes || []) for (const id of n.photos || []) if (id) ids.push(id);
  // imported 3D models
  for (const m of Object.values(project.models || {})) if (m && m.asset) ids.push(m.asset);
  // wallpaper pictures and the photos of budget items
  for (const im of Object.values(project.images || {})) if (im && im.asset) ids.push(im.asset);
  for (const it of (project.budget && project.budget.items) || []) if (it.photo) ids.push(it.photo);
  // documents: the file and the small picture of its first page
  for (const d of project.docs || []) { if (d.asset) ids.push(d.asset); if (d.thumb) ids.push(d.thumb); }
  return ids;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** packed shell (Int32 millimetres + indices, base64) → typed arrays in metres */
function decodeShell(json) {
  const pack = typeof json === 'string' ? JSON.parse(json) : json;
  const storeys = {};
  for (const [sid, groups] of Object.entries(pack.storeys || {})) {
    storeys[sid] = [];
    for (const [key, g] of Object.entries(groups)) {
      const pb = b64ToBytes(g.p), ib = b64ToBytes(g.i);
      const mm = new Int32Array(pb.buffer, pb.byteOffset, pb.byteLength / 4);
      const pos = new Float32Array(mm.length);
      for (let i = 0; i < mm.length; i++) pos[i] = mm[i] / 1000;
      let idx = g.big ? new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4) : new Uint16Array(ib.buffer, ib.byteOffset, ib.byteLength / 2);
      // frames, glass and door leaves are boxes; shells made before 28 Oct have them inside out (only their far
      // faces were drawn, so they looked like loose planes): turn them the right way
      const m = (pack.materials || {})[key] || {};
      if (m.win || m.odoor || /^(frame|glass|leaf|metal|groove|bead|door)(\||$)/.test(key)) idx = outwardBoxes(pos, idx);
      storeys[sid].push({ key, pos, idx });
    }
  }
  // outside doors whose leaves can swing (newer shells only)
  const doorOps = new Set(Object.values(pack.materials || {}).filter(m => m && m.door).map(m => m.door));
  return { materials: pack.materials || {}, storeys, fixtures2d: pack.fixtures2d || {}, doorOps };
}

/** a part made of boxes (12 triangles each, in order): when most boxes face inwards, every triangle is turned */
function outwardBoxes(P, I) {
  if (!I.length || I.length % 36) return I;
  let inw = 0, outw = 0;
  for (let b = 0; b < I.length; b += 36) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 36; k++) { const j = I[b + k] * 3; cx += P[j]; cy += P[j + 1]; cz += P[j + 2]; }
    cx /= 36; cy /= 36; cz /= 36;
    for (let t = 0; t < 36; t += 3) {
      const i0 = I[b + t] * 3, i1 = I[b + t + 1] * 3, i2 = I[b + t + 2] * 3;
      const ax = P[i1] - P[i0], ay = P[i1 + 1] - P[i0 + 1], az = P[i1 + 2] - P[i0 + 2];
      const bx = P[i2] - P[i0], by = P[i2 + 1] - P[i0 + 1], bz = P[i2 + 2] - P[i0 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const d = nx * ((P[i0] + P[i1] + P[i2]) / 3 - cx) + ny * ((P[i0 + 1] + P[i1 + 1] + P[i2 + 1]) / 3 - cy) + nz * ((P[i0 + 2] + P[i1 + 2] + P[i2 + 2]) / 3 - cz);
      if (d > 1e-12) outw++; else if (d < -1e-12) inw++;
    }
  }
  if (inw <= outw) return I;
  const J = new (I.constructor)(I.length);
  for (let t = 0; t < I.length; t += 3) { J[t] = I[t]; J[t + 1] = I[t + 2]; J[t + 2] = I[t + 1]; }
  return J;
}

async function gunzipBase64(b64) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to unpack the example house.');
  const stream = new Blob([b64ToBytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
async function gunzipBase64Bytes(b64) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to unpack the built-in models.');
  const stream = new Blob([b64ToBytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}
/** data:…;base64,… → bytes */
function dataUrlBytes(url) { return b64ToBytes(url.slice(url.indexOf(',') + 1)); }
async function bytesToDataUrl(bytes, type) {
  return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(new Blob([bytes], { type })); });
}

/* ───────── snapshots ───────── */
const Snapshots = {
  async create(project, kind, name) {
    const snap = {
      id: uid('sn_'), projectId: project.id, kind, name: name || '',
      created: Date.now(), projectName: project.name, project: clone(project),
    };
    snap.size = JSON.stringify(snap.project).length;
    await DB.put('snapshots', snap);
    if (kind === 'auto') await this.prune(project.id, 'auto', AUTO_KEEP);
    if (kind === 'backup') await this.prune(project.id, 'backup', BACKUP_KEEP);
    return snap;
  },
  /** Only ever removes snapshots of the given automatic kind. Save points ('manual') are never touched here. */
  async prune(projectId, kind, keep) {
    if (kind === 'manual') return;
    const list = (await DB.byProject(projectId)).filter(s => s.kind === kind).sort((a, b) => b.created - a.created);
    for (const sn of list.slice(keep)) await DB.del('snapshots', sn.id);
  },
  async list(projectId) {
    return (await DB.byProject(projectId)).sort((a, b) => b.created - a.created);
  },
};

/* ───────── trash ───────── */
const Trash = {
  async add(type, name, payload, projectId) {
    const item = { id: uid('tr_'), type, name, deleted: Date.now(), projectId: projectId || null, payload };
    await DB.put('trash', item);
    return item;
  },
  async list() { return (await DB.all('trash')).sort((a, b) => b.deleted - a.deleted); },
  async remove(id) { await DB.del('trash', id); },
};

/* ───────── Saver: keeps the open project saved continuously ─────────
   - every change is written ~0.7 s later (and instantly when the app is hidden or closed)
   - a synchronous emergency copy goes to localStorage on hide/close, so even a hard close is recoverable
   - every AUTO_EVERY_MS with changes, a rolling autosave snapshot is stored (only the last AUTO_KEEP kept)
*/
const Saver = new (class extends Emitter {
  constructor() {
    super();
    this.project = null;
    this.state = 'idle'; // idle | saving | saved | error
    this.lastSaved = 0;
    this.lastAuto = 0;
    this.changedSinceAuto = false;
    this.pending = false;
    this._write = debounce(() => this.flush(), 700);
    this._timer = setInterval(() => this.tick(), 15000);
    const hide = () => { this.emergencyWrite(); this.flush(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide(); });
    window.addEventListener('pagehide', hide);
    window.addEventListener('beforeunload', () => this.emergencyWrite());
  }
  attach(project) {
    if (this.project && this.project !== project) { this.flushNow(); }
    this.project = project;
    this.lastAuto = Date.now();
    this.changedSinceAuto = false;
    this.pending = false;
    this.setState(project ? 'saved' : 'idle');
  }
  detach() { this.flushNow(); this.project = null; this.setState('idle'); }
  markDirty() {
    if (!this.project) return;
    this.project.updated = Date.now();
    this.pending = true;
    this.changedSinceAuto = true;
    this.setState('saving');
    this._write();
  }
  setState(st) { this.state = st; this.emit('state', st); }
  flushNow() { this._write.cancel(); return this.flush(); }
  async flush() {
    if (!this.project || !this.pending) return;
    const p = this.project;
    this.pending = false;
    try {
      await DB.put('projects', clone(p));
      this.lastSaved = Date.now();
      this.clearEmergency(p.id);
      if (!this.pending) this.setState(DB.memory ? 'memory' : 'saved');
    } catch (e) {
      console.error('save failed', e);
      this.pending = true;
      this.setState('error');
      this.emergencyWrite();
    }
  }
  async tick() {
    if (!this.project) return;
    if (this.changedSinceAuto && Date.now() - this.lastAuto >= AUTO_EVERY_MS) {
      await this.autosaveNow();
    }
  }
  async autosaveNow() {
    if (!this.project) return;
    this.changedSinceAuto = false;
    this.lastAuto = Date.now();
    try { await Snapshots.create(this.project, 'auto', 'Autosave'); this.emit('autosaved'); }
    catch (e) { console.warn('autosave failed', e); }
  }
  emergencyWrite() {
    if (!this.project) return;
    try { localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ id: this.project.id, updated: this.project.updated, project: this.project })); }
    catch (e) { /* quota or blocked — IndexedDB copy still exists */ }
  }
  clearEmergency(id) {
    try {
      const raw = localStorage.getItem(EMERGENCY_KEY);
      if (!raw) return;
      const em = JSON.parse(raw);
      if (em.id === id) localStorage.removeItem(EMERGENCY_KEY);
    } catch (e) { /* ignore */ }
  }
})();

/** On start: if the emergency copy is newer than what is in IndexedDB (app was killed mid-save), put it back. */
async function recoverEmergency() {
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    if (!raw) return null;
    const em = JSON.parse(raw);
    if (!em || !em.project || !em.id) return null;
    const stored = await DB.get('projects', em.id);
    if (!stored || (em.updated || 0) > (stored.updated || 0)) {
      if (stored) await Snapshots.create(stored, 'backup', 'Before recovering unsaved changes');
      await DB.put('projects', em.project);
      localStorage.removeItem(EMERGENCY_KEY);
      return em.project;
    }
    localStorage.removeItem(EMERGENCY_KEY);
  } catch (e) { console.warn('recovery check failed', e); }
  return null;
}

const Settings = {
  values: { grid: 0.05, theme: 'system', colorBy: 'floor', labels: true, dims: false, underlay: true, ghost: false, cut: false, ground: true, plinth: true, roof: true, windows: true, outside: true, floors: true, swipeMode: 'plan', explode: 0, introDismissed: false, showDisabled: false,
    // 3D look and the new modes
    quality: 'beautiful', ao: 'auto', light: 'day', ceilings: true, furniture: true, notesOn: true, furnSnap: true, furnRot: 90, walkMode: 'free', lang: 'en', installs: true, ptHeights: false, roomFollow: true, dimChains: true, garden: true },
  async load() {
    try { const m = await DB.get('meta', 'settings'); if (m && m.values) Object.assign(this.values, m.values); } catch (e) { /* defaults */ }
  },
  set(k, v) { this.values[k] = v; this.save(); },
  save: debounce(function () { DB.put('meta', { key: 'settings', values: Settings.values }).catch(() => {}); if (Settings.onSave) Settings.onSave(); }, 300),
};
