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
const EMERGENCY_KEY = 'house-planner.emergency';   // + '.' + house id: one emergency copy per house (task 0027)
const ASSET_GRACE_MS = 24 * 3600 * 1000;   // the clean-up leaves files younger than this alone (another copy may use them)
const SAVE_RETRY_MS = 30 * 1000;           // a save that failed is tried again this often
const WRITER_LOCK = 'house-planner.writer.';  // + house id: the Web Lock of the one copy that writes it

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
  async put(store, value) {
    if (this.memory) { this.mem[store].set(value.id ?? value.key, clone(value)); return; }
    // a house another copy of the app writes is not written from here (a merge, a rename in the list – task 0027)
    if (store === 'projects' && value && value.id && await writerElsewhere(value.id)) throw elsewhereError();
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
  /** write the open house unless another copy wrote it since `base` (its `updated` when this copy last read or
      wrote it): false then, and nothing is written. Read and write are one transaction (task 0027). */
  putProject(value, base) {
    if (this.memory) { this.mem.projects.set(value.id, clone(value)); return Promise.resolve(true); }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('projects', 'readwrite');
      const st = tx.objectStore('projects');
      let ok = true, err = null;
      const g = st.get(value.id);
      g.onsuccess = () => {
        const cur = g.result;
        if (cur && base != null && (cur.updated || 0) !== base) { ok = false; return; }
        try { st.put(value); } catch (e) { err = e; try { tx.abort(); } catch (e2) { /* already over */ } }
      };
      tx.oncomplete = () => resolve(ok);
      tx.onerror = () => reject(err || tx.error);
      tx.onabort = () => reject(err || tx.error || new Error('Transaction aborted'));
    });
  },
  allKeys(store) {
    if (this.memory) return Promise.resolve([...this.mem[store].keys()]);
    return this._req(store, 'readonly', st => st.getAllKeys());
  },
};

/** another copy of the app (tab, installed app) holds the writer lock of house `id` – not this one */
async function writerElsewhere(id) {
  if (Saver._lock && Saver._lock.id === id && Saver._lock.held) return false;
  try {
    if (!(navigator.locks && navigator.locks.query)) return false;
    return ((await navigator.locks.query()).held || []).some(l => l.name === WRITER_LOCK + id);
  } catch (e) { return false; }
}
function elsewhereError() {
  const e = new Error(t('This house is open in another window – changes here are not saved.'));
  e.code = 'HP_ELSEWHERE';
  return e;
}

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
  /** delete assets nobody references any more (projects, snapshots, trash) – only ones older than ASSET_GRACE_MS:
      another copy of the app (a second tab, the installed app) may have just added a photo its house refers to but
      has not written yet (task 0027) */
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
      const old = Date.now() - ASSET_GRACE_MS;
      for (const id of await DB.allKeys('assets')) {
        if (used.has(id)) continue;
        const rec = await DB.get('assets', id);
        if (rec && rec.created && rec.created > old) continue;
        await DB.del('assets', id); this.cache.delete(id);
      }
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
  async create(project, kind, name, keepDays) {
    const snap = {
      id: uid('sn_'), projectId: project.id, kind, name: name || '',
      created: Date.now(), projectName: project.name, project: clone(project),
    };
    if (keepDays) snap.keepUntil = Date.now() + keepDays * 864e5;   // not pushed out by newer automatic ones (before an import or merge)
    snap.size = JSON.stringify(snap.project).length;
    await DB.put('snapshots', snap);
    if (kind === 'auto') await this.prune(project.id, 'auto', AUTO_KEEP);
    if (kind === 'backup') await this.prune(project.id, 'backup', BACKUP_KEEP);
    return snap;
  },
  /** Only ever removes snapshots of the given automatic kind. Save points ('manual') are never touched here. */
  async prune(projectId, kind, keep) {
    if (kind === 'manual') return;
    const list = (await DB.byProject(projectId)).filter(s => s.kind === kind && !(s.keepUntil > Date.now())).sort((a, b) => b.created - a.created);
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
   - one writer (task 0027): the copy of the app that opened a house first holds a Web Lock on it; another copy (a
     second tab, the installed app beside a browser tab) shows it but saves nothing ('elsewhere') until it takes
     over. Each write also checks that nobody wrote the house since this copy read it (no Web Locks, a frozen tab).
   - a failed write ('error') is tried again every SAVE_RETRY_MS; 'failed' tells the app (message, Export now)
   states: idle | saving | saved | memory | error | elsewhere
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
    this.readonly = false;      // another copy writes this house (task 0027)
    this.why = null;            // 'open' (it holds the lock) | 'changed' (it wrote in between)
    this.base = null;           // the stored house's `updated` as this copy last read or wrote it
    this.failures = 0;          // writes failed in a row
    this.lastError = null;
    this.retryMs = SAVE_RETRY_MS;
    this._lock = null;
    this._inflight = null;
    this._retry = null;
    this._write = debounce(() => this.flush(), 700);
    this._timer = setInterval(() => this.tick(), 15000);
    const hide = () => { this.emergencyWrite(); this.flush(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide(); });
    window.addEventListener('pagehide', hide);
    window.addEventListener('beforeunload', () => this.emergencyWrite());
  }
  /** become the one copy that writes house `id` (steal: take it from the copy that has it). true = this copy writes. */
  async claim(id, steal) {
    this.release();
    if (DB.memory || !(navigator.locks && navigator.locks.request)) return true;
    const token = { id };
    this._lock = token;
    const held = new Promise(r => { token.release = r; });
    const keep = lock => { token.held = true; return held; };
    // wait for the other copy to let go (it closes the house or its window): then this copy writes (app: 'free')
    const waitFree = () => {
      if (this._lock !== token || token.wait) return;
      token.wait = new AbortController();
      navigator.locks.request(WRITER_LOCK + id, { signal: token.wait.signal }, lock => {
        token.wait = null;
        if (this._lock !== token) return undefined;
        const r = keep(lock);
        this.emit('free', id);
        return r;
      }).catch(ended);
    };
    const ended = e => {
      // another copy took the house over (steal): this one stops writing it, and waits for it to come free
      if (this._lock === token && token.held) { token.held = false; this.lost('open'); waitFree(); }
    };
    try {
      const got = await new Promise(resolve => {
        navigator.locks.request(WRITER_LOCK + id, steal ? { steal: true } : { ifAvailable: true }, lock => {
          if (!lock) { resolve(false); return undefined; }
          resolve(true);
          return keep(lock);
        }).catch(e => {
          // a lock that was never given (a browser that refuses locks here): write anyway, the check in putProject stays
          if (!token.held) { console.warn('writer lock', e); resolve(true); token.nolock = true; return; }
          ended(e);
        });
      });
      if (!got) waitFree();
      return got;
    } catch (e) { console.warn('writer lock', e); return true; }
  }
  release() {
    const tk = this._lock;
    this._lock = null;
    if (!tk) return;
    if (tk.wait) { try { tk.wait.abort(); } catch (e) { /* given already */ } }
    if (tk.release) { tk.held = false; tk.release(); }
  }
  /** this copy may not write the open house any more: another copy has it ('open') or wrote it ('changed').
      What it had not written yet is kept as a backup of the house (Save points → Automatic backups). */
  lost(why) {
    if (!this.project) return;
    this._write.cancel();
    clearTimeout(this._retry);
    this.keepUnsaved();
    this.readonly = true;
    this.why = why;
    this.setState('elsewhere');
  }
  /** the open house as this copy has it, when it holds changes not written: a backup snapshot (task 0027 review) */
  async keepUnsaved() {
    const p = this.project;
    if (!p || !this.pending || this._kept === p.updated) return false;
    this._kept = p.updated;
    try { await Snapshots.create(p, 'backup', 'Unsaved changes from another window'); this.emit('kept'); return true; }
    catch (e) { console.warn('keep unsaved', e); return false; }
  }
  attach(project, opts = {}) {
    if (this.project && this.project !== project) { this.flushNow(); }
    this.project = project;
    this.lastAuto = Date.now();
    this.changedSinceAuto = false;
    this.pending = false;
    this.failures = 0; this.lastError = null; clearTimeout(this._retry);
    this.base = project ? (project.updated || 0) : null;
    this.readonly = !!(project && opts.readonly);
    this.why = this.readonly ? 'open' : null;
    this.setState(!project ? 'idle' : this.readonly ? 'elsewhere' : DB.memory ? 'memory' : 'saved');
  }
  detach() { this.flushNow(); this.release(); this.project = null; this.readonly = false; this.why = null; clearTimeout(this._retry); this.setState('idle'); }
  markDirty() {
    if (!this.project) return;
    this.project.updated = Date.now();
    this.pending = true;
    this.changedSinceAuto = true;
    if (this.readonly) { this.setState('elsewhere'); return; }
    this.setState(this.state === 'error' ? 'error' : 'saving');
    this._write();
  }
  setState(st) { this.state = st; this.emit('state', st); }
  /** write what is waiting now; resolves when nothing of it is still being written (Restart waits for this) */
  async flushNow() {
    this._write.cancel();
    if (this._inflight) { try { await this._inflight; } catch (e) { /* reported by flush */ } }
    return this.flush();
  }
  flush() {
    // one write at a time: a change made while one is written goes in the next one
    if (this._inflight) return this._inflight.then(() => this.flush());
    if (!this.project || !this.pending || this.readonly) return Promise.resolve();
    const run = this._flush();
    this._inflight = run;
    return run.finally(() => { if (this._inflight === run) this._inflight = null; });
  }
  async _flush() {
    const p = this.project;
    this.pending = false;
    clearTimeout(this._retry);
    const copy = clone(p);
    try {
      const ok = await DB.putProject(copy, this.base);
      if (this.project !== p) return;
      if (!ok) {
        // another copy wrote this house since this one read it: nothing written, this copy stops saving it
        this.pending = true;
        this.lost('changed');
        return;
      }
      this.base = copy.updated || 0;
      this.lastSaved = Date.now();
      this.clearEmergency(p.id);
      const was = this.failures;
      this.failures = 0; this.lastError = null;
      if (!this.pending) this.setState(DB.memory ? 'memory' : 'saved');
      if (was) this.emit('recovered');
    } catch (e) {
      console.error('save failed', e);
      // the browser closed the database (another version of the app opened it): open it again for the next try
      if (e && e.name === 'InvalidStateError') { try { await DB.open(); } catch (e2) { /* next try */ } }
      if (this.project !== p) return;
      this.pending = true;
      this.failures++;
      this.lastError = e;
      this.setState('error');
      this.emergencyWrite();
      this.emit('failed', { count: this.failures, error: e });
      this._retry = setTimeout(() => { if (this.project === p && this.pending) this.flush(); }, this.retryMs);
    }
  }
  async tick() {
    if (!this.project || this.readonly) return;
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
    // a copy that does not write this house leaves the emergency copy alone (it would bring back its older house)
    if (!this.project || this.readonly) return;
    if (!this.pending && !this._inflight && this.state !== 'error') return;   // nothing unsaved
    try { localStorage.setItem(EMERGENCY_KEY + '.' + this.project.id, JSON.stringify({ id: this.project.id, updated: this.project.updated, project: this.project })); }
    catch (e) { /* quota or blocked — IndexedDB copy still exists */ }
  }
  clearEmergency(id) {
    try {
      localStorage.removeItem(EMERGENCY_KEY + '.' + id);
      // the one shared slot of versions before 0027
      const raw = localStorage.getItem(EMERGENCY_KEY);
      if (raw && JSON.parse(raw).id === id) localStorage.removeItem(EMERGENCY_KEY);
    } catch (e) { /* ignore */ }
  }
})();

/** On start: if an emergency copy is newer than what is in IndexedDB (app was killed mid-save), put it back.
    One copy per house (task 0027; the single slot of older versions too). A house another copy of the app has open
    is left alone – that copy is alive and writes it itself. Returns the last house brought back, or null. */
async function recoverEmergency() {
  let back = null;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === EMERGENCY_KEY || (k && k.startsWith(EMERGENCY_KEY + '.'))) keys.push(k); }
    let busy = new Set();
    try { if (navigator.locks && navigator.locks.query) busy = new Set(((await navigator.locks.query()).held || []).map(l => l.name)); } catch (e) { /* no locks */ }
    for (const key of keys) {
      try {
        const em = JSON.parse(localStorage.getItem(key) || 'null');
        if (!em || !em.project || !em.id) { localStorage.removeItem(key); continue; }
        if (busy.has(WRITER_LOCK + em.id)) continue;
        const stored = await DB.get('projects', em.id);
        if (!stored || (em.updated || 0) > (stored.updated || 0)) {
          if (stored) await Snapshots.create(stored, 'backup', 'Before recovering unsaved changes');
          await DB.put('projects', em.project);
          if (!back || (em.updated || 0) > (back.updated || 0)) back = em.project;
        }
        localStorage.removeItem(key);
      } catch (e) { console.warn('recovery of', key, e); }
    }
  } catch (e) { console.warn('recovery check failed', e); }
  return back;
}

const Settings = {
  values: { grid: 0.05, theme: 'system', colorBy: 'floor', labels: true, dims: false, underlay: true, ghost: false, cut: false, ground: true, plinth: true, roof: true, windows: true, outside: true, floors: true, swipeMode: 'plan', explode: 0, introDismissed: false, showDisabled: false,
    // 3D look and the new modes
    quality: 'beautiful', ao: 'auto', light: 'day', ceilings: true, furniture: true, notesOn: true, furnSnap: true, furnRot: 90, walkMode: 'free', lang: 'en', installs: true, ptHeights: false, roomFollow: true, dimChains: true, garden: true },
  async load() {
    try { const m = await DB.get('meta', 'settings'); if (m && m.values) Object.assign(this.values, m.values); } catch (e) { /* defaults */ }
  },
  set(k, v) { this.values[k] = v; this.save(); },
  /** write the settings now (before a reload) */
  flushNow() { this.save.cancel && this.save.cancel(); return DB.put('meta', { key: 'settings', values: Settings.values }).catch(() => {}); },
  save: debounce(function () { DB.put('meta', { key: 'settings', values: Settings.values }).catch(() => {}); if (Settings.onSave) Settings.onSave(); }, 300),
};
