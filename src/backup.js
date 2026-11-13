/* ───────────── backup.js — reminders to make a backup, and automatic copies into a folder ─────────────
   Your houses live in this browser. A file you export is the backup. When a house has changed and its last backup
   is older than a week (Settings: every week, every 2 weeks or never) the app reminds you once a day.
   On a computer with Chrome or Edge you can choose a folder (for example a Proton Drive or OneDrive folder that is
   synced): after each change a compressed copy of every house is written there, and one dated copy per day is kept
   in the folder "older" (the last 14 days). The folder is remembered; after restarting the browser it asks once
   to continue. A small chip in the top bar shows the last copy (or "Paused": click to continue); the folder can be
   set from Settings, the Export window, ⋯ and Search. The reminder's button saves a copy at once: on a phone through
   the share sheet (Proton Drive, Files, mail …), elsewhere as a download. */

const BACKUP_KEEP_DAYS = 14;
const FOLDER_FLAG = 'house-planner.folder', FOLDER_READING = 'house-planner.folder-reading';
/** the folder handle lives in its own small database, apart from the houses: if reading it ever fails
    badly, the app forgets the folder instead of failing to start */
const FolderStore = {
  name: 'house-planner-backup',
  open() { return new Promise((res, rej) => { const r = indexedDB.open(this.name, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get() { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get('dir'); q.onsuccess = () => { db.close(); res(q.result || null); }; q.onerror = () => { db.close(); rej(q.error); }; }); },
  async put(v) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, 'dir'); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); },
  clear() { try { indexedDB.deleteDatabase(this.name); } catch (e) { /* ignore */ } },
};
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

/** text → gzip Blob (null when the browser can't compress) */
async function gzipText(text) {
  if (typeof CompressionStream === 'undefined') return null;
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
/** a house file to save: compressed (.house.gz) or plain (.house.json) */
async function packHouse(text, base, compress = true) {
  const gz = compress ? await gzipText(text) : null;
  return gz ? { name: base + '.house.gz', blob: new Blob([gz], { type: 'application/gzip' }) } : { name: base + '.house.json', blob: new Blob([text], { type: 'application/json' }) };
}
async function writeDirFile(dir, name, blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}
const HOUSE_ACCEPT = '.json,.house,.gz,.txt,application/json,application/gzip,application/x-gzip,text/plain';

Object.assign(app, {
  /* ───────── reminders ───────── */
  backupStamp(ids) {
    const b = { ...(this.settings.backups || {}) };
    for (const id of ids) b[id] = Date.now();
    Settings.set('backups', b);
  },
  lastBackupOf(p) { return (this.settings.backups || {})[p.id] || 0; },
  /** the house changed since its last backup, and that backup is older than the reminder period */
  backupDue(p, now = Date.now()) {
    const days = this.settings.backupRemind ?? 7;
    if (!days || !p || p.example || p.viewer) return false;
    if (this._folder && this._folder.ok) return false;
    const last = this.lastBackupOf(p);
    if (last && (p.updated || 0) <= last) return false;
    if (now - (last || p.created || now) < days * 864e5) return false;
    const snooze = (this.settings.backupSnooze || {})[p.id] || 0;
    return now - snooze > 20 * 3600e3;
  },
  backupReminder() {
    const p = this.project;
    if (!this.backupDue(p)) return;
    Settings.set('backupSnooze', { ...(this.settings.backupSnooze || {}), [p.id]: Date.now() });
    const last = this.lastBackupOf(p);
    const days = Math.floor((Date.now() - (last || p.created)) / 864e5);
    let msg = last ? t('Your last backup of “{n}” is {d} days old. Export a copy to keep it safe.', { n: p.name, d: days }) : t('There is no backup of “{n}” yet. Export a copy to keep it safe.', { n: p.name });
    if (this.folderSupported()) msg += ' ' + t('Or let the app do it: ⋯ → Automatic backup into a folder.');
    // the file is made now, so one tap later can hand it over at once (a phone's share sheet needs the tap itself)
    const prep = this.quickBackupPrep(p);
    prep.catch(() => {});
    this.toast(msg, { action: { label: t('Save a copy'), fn: () => this.quickBackup(p, prep) }, ms: 15000 });
  },
  quickBackupPrep(p) {
    return (async () => { const text = await this.buildExport([p], true); return { text, base: `${slugify(p.name)}_${todayStamp()}`, file: await packHouse(text, `${slugify(p.name)}_${todayStamp()}`) }; })();
  },
  /** one tap: a copy of this house – on a phone through the share sheet, elsewhere downloaded */
  async quickBackup(p, prepared) {
    let F;
    try { F = await (prepared || this.quickBackupPrep(p)); } catch (e) { this.toast(t('The copy could not be made: {e}', { e: (e && e.message) || e })); return false; }
    const phone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (phone && navigator.canShare && window.File) {
      try {
        const f = new File([F.file.blob], F.file.name, { type: F.file.blob.type });
        if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: F.file.name }); this.backupStamp([p.id]); return true; }
      } catch (e) { if (e && e.name === 'AbortError') return false; console.warn('share', e); }
      // phones that share no compressed files: the plain file (.house.json, else .txt)
      const tries = [[F.base + '.house.json', 'application/json'], [F.base + '.house.txt', 'text/plain']];
      for (const [n, type] of tries) {
        try { const f = new File([F.text], n, { type }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: n }); this.backupStamp([p.id]); return true; } }
        catch (e) { if (e && e.name === 'AbortError') return false; }
      }
    }
    this.downloadBlob(F.file.name, F.file.blob);
    this.backupStamp([p.id]);
    this.toast(t('A copy of “{n}” is saved: {f}', { n: p.name, f: F.file.name }), { ms: 5000 });
    return true;
  },

  /* ───────── folder backup (Chrome / Edge on a computer) ───────── */
  folderSupported() { return !!(this._dirPicker || ('showDirectoryPicker' in window && !/Android|iPhone|iPad/i.test(navigator.userAgent))); },
  async folderInit() {
    if (!this.folderSupported() || DB.memory) return;
    const info = lsGet(FOLDER_FLAG);
    if (!info) return;
    // the last try to read the folder did not finish: forget it rather than try again
    if (lsGet(FOLDER_READING)) {
      lsSet(FOLDER_READING, null); lsSet(FOLDER_FLAG, null); FolderStore.clear();
      this.toast(t('The automatic backup folder could not be opened again. Choose the folder again in Settings.'), { ms: 12000 });
      return;
    }
    let rec = null;
    lsSet(FOLDER_READING, '1');
    try { rec = await (window.__hpTestFolder ? window.__hpTestFolder() : FolderStore.get()); } catch (e) { console.warn('backup folder', e); }
    lsSet(FOLDER_READING, null);
    if (!rec || !rec.handle) { lsSet(FOLDER_FLAG, null); return; }
    let saved = {};
    try { saved = JSON.parse(info) || {}; } catch (e) { /* old */ }
    this._folder = { handle: rec.handle, ok: false, last: saved.last || 0, done: saved.done || {} };
    let perm = 'denied';
    try { perm = await rec.handle.queryPermission({ mode: 'readwrite' }); } catch (e) { /* gone */ }
    if (perm === 'granted') { this._folder.ok = true; this.folderSoon(2000); }
    else this.folderPaused();
    this.renderFolderStatus();
  },
  folderPaused() {
    if (!this._folder) return;
    this._folder.ok = false;
    this.renderFolderStatus();
    this.toast(t('The automatic backup into the folder “{n}” is paused until you allow it again.', { n: this._folder.handle.name }), { action: { label: t('Continue backup'), fn: () => this.folderResume() }, ms: 20000 });
  },
  async folderResume() {
    const F = this._folder;
    if (!F) return false;
    let perm = 'denied';
    try { perm = await F.handle.requestPermission({ mode: 'readwrite' }); } catch (e) { /* refused */ }
    if (perm !== 'granted') { this.toast(t('No permission for the folder. Choose it again in Settings.')); return false; }
    F.ok = true;
    this.renderFolderStatus();
    await this.folderBackupNow(true);
    return true;
  },
  async chooseBackupFolder() {
    const pick = this._dirPicker || (o => window.showDirectoryPicker(o));
    let handle;
    try { handle = await pick({ id: 'house-planner-backup', mode: 'readwrite' }); }
    catch (e) { if (!e || e.name !== 'AbortError') this.toast(t('This folder can not be used: {e}', { e: (e && e.message) || e })); return false; }
    this._folder = { handle, ok: true, last: 0, done: {} };
    if (!window.__hpTestFolder) { try { await FolderStore.put({ handle }); } catch (e) { console.warn('backup folder not remembered', e); } }
    lsSet(FOLDER_FLAG, JSON.stringify({ last: 0, done: {} }));
    await this.folderBackupNow(true);
    return true;
  },
  async stopFolderBackup() {
    clearTimeout(this._folderT);
    this._folder = null;
    lsSet(FOLDER_FLAG, null);
    FolderStore.clear();
    this.renderFolderStatus();
  },
  folderSoon(ms) {
    if (!this._folder || !this._folder.ok) return;
    clearTimeout(this._folderT);
    this._folderT = setTimeout(() => this.folderBackupNow(), ms ?? this._backupDelay ?? 20000);
  },
  /** write a copy of every house that changed (all of them with force) */
  async folderBackupNow(force) {
    const F = this._folder;
    if (!F || !F.ok) return 0;
    if (this._folderBusy) { this.folderSoon(3000); return 0; }
    this._folderBusy = true;
    let n = 0;
    try {
      if (this.project) await Saver.flushNow();
      const projects = (await DB.all('projects')).filter(p => !p.example && !p.viewer);
      const older = await F.handle.getDirectoryHandle('older', { create: true });
      const day = todayStamp();
      const written = [];
      for (const p of projects) {
        if (!force && F.done[p.id] === p.updated) continue;
        const base = slugify(p.name) + '_' + p.id.slice(-4);
        const f = await packHouse(await this.buildExport([p], true), base);
        await writeDirFile(F.handle, f.name, f.blob);
        await writeDirFile(older, f.name.replace(base, base + '_' + day), f.blob);
        // keep the newest dated copies of this house
        const dated = [];
        for await (const [name] of older.entries()) if (name.startsWith(base + '_') && /_\d{4}-\d\d-\d\d\.house/.test(name)) dated.push(name);
        dated.sort().reverse();
        for (const name of dated.slice(BACKUP_KEEP_DAYS)) { try { await older.removeEntry(name); } catch (e) { /* ignore */ } }
        F.done[p.id] = p.updated;
        written.push(p.id);
        n++;
      }
      F.last = Date.now();
      if (written.length) this.backupStamp(written);
      lsSet(FOLDER_FLAG, JSON.stringify({ last: F.last, done: F.done }));
      const st = document.getElementById('bk-folder-status');
      if (st) st.textContent = this.folderStatusText();
      this.renderFolderStatus();
    } catch (e) {
      console.warn('folder backup failed', e);
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) this.folderPaused();
      else if (e && e.name === 'NotFoundError') { this.toast(t('The backup folder is gone. Choose a folder again in Settings.'), { ms: 8000 }); await this.stopFolderBackup(); }
    } finally { this._folderBusy = false; }
    return n;
  },
  folderStatusText() {
    const F = this._folder;
    if (!F) return '';
    if (!F.ok) return t('Into “{n}”: paused.', { n: F.handle.name });
    return t('Into “{n}”.', { n: F.handle.name }) + ' ' + (F.last ? t('Last copy: {d}.', { d: fmtDate(F.last) }) : '');
  },

  /** the chip in the top bar (computers with a backup folder): the time of the last copy, or Paused */
  renderFolderStatus() {
    const b = document.getElementById('folder-status');
    if (!b) return;
    const F = this._folder;
    if (!F) { b.hidden = true; return; }
    b.hidden = false;
    b.dataset.state = F.ok ? 'ok' : 'paused';
    b.textContent = '';
    const when = F.last ? (new Date(F.last).toDateString() === new Date().toDateString() ? new Date(F.last).toLocaleTimeString(i18nLocale(), { hour: '2-digit', minute: '2-digit' }) : new Date(F.last).toLocaleDateString(i18nLocale(), { day: 'numeric', month: 'short' })) : '…';
    b.append(icon('folder'), h('span', { class: 'txt' }, F.ok ? when : t('Paused')));
    b.title = this.folderStatusText() + (F.ok ? '' : ' ' + t('Click to continue.'));
    b.setAttribute('aria-label', t('Automatic backup into a folder') + ': ' + b.title);
  },
  folderChip(anchor) {
    const F = this._folder;
    if (!F) return;
    if (!F.ok) { this.folderResume(); return; }
    UI.menu(anchor, [
      { node: h('div', { class: 'show-head fs-head' }, this.folderStatusText()) },
      { label: t('Back up now'), icon: 'download', fn: async () => { const n = await this.folderBackupNow(true); this.toast(t('{n} houses copied into the folder.', { n })); } },
      { label: t('Automatic backup into a folder…'), icon: 'folder', fn: () => this.folderDialog() },
    ]);
  },
  folderDialog() {
    UI.dialog({ title: t('Automatic backup into a folder'), body: h('div', { class: 'bk-dialog' }, this.folderPanel()), actions: [{ label: t('Close'), value: null }] });
  },
  /** the folder part: Settings → Backup, and the window from Export, ⋯ and Search */
  folderPanel() {
    const folderPart = h('div', { class: 'bk-folder' });
    const paintFolder = () => {
      folderPart.textContent = '';
      if (!this.folderSupported()) { folderPart.appendChild(h('p', { class: 'note-muted' }, t('Automatic backup into a folder works in Chrome or Edge on a computer.'))); return; }
      folderPart.appendChild(h('span', { class: 'flabel' }, t('Automatic backup into a folder')));
      folderPart.appendChild(h('p', null, t('On this computer, for example in a synced Proton Drive or OneDrive folder: a copy of every house after each change, and one copy per day for the last 14 days.')));
      if (!this._folder) {
        folderPart.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'bk-choose', onclick: async () => { if (await this.chooseBackupFolder()) { paintFolder(); this.toast(t('Backup folder set. Copies are written there after each change.')); } } }, icon('folder'), t('Choose folder…'))));
        return;
      }
      folderPart.appendChild(h('p', { id: 'bk-folder-status', class: 'bk-status' }, this.folderStatusText()));
      folderPart.appendChild(h('div', { class: 'actions' },
        this._folder.ok ? h('button', { class: 'btn sm', id: 'bk-now', onclick: async () => { const n = await this.folderBackupNow(true); this.toast(t('{n} houses copied into the folder.', { n })); paintFolder(); } }, icon('download'), t('Back up now'))
          : h('button', { class: 'btn sm primary', id: 'bk-resume', onclick: async () => { await this.folderResume(); paintFolder(); } }, t('Continue backup')),
        h('button', { class: 'btn sm', id: 'bk-change', onclick: async () => { if (await this.chooseBackupFolder()) paintFolder(); } }, t('Other folder…')),
        h('button', { class: 'btn sm ghost', id: 'bk-stop', onclick: async () => { await this.stopFolderBackup(); paintFolder(); } }, t('Stop'))));
    };
    paintFolder();
    return folderPart;
  },

  /** the Backup part of Settings */
  backupSettings() {
    const s = this.settings;
    const remind = s.backupRemind ?? 7;
    const seg = h('div', { class: 'seg', id: 'bk-remind' }, ...[[7, t('Every week')], [14, t('Every 2 weeks')], [0, t('Never')]].map(([v, l]) => h('button', { 'data-k': String(v), 'aria-pressed': String(remind === v), onclick: e => { Settings.set('backupRemind', v); for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); } }, l)));
    const box = h('div', { style: { display: 'grid', gap: '10px' } });
    const folderPart = this.folderPanel();
    box.append(
      h('p', null, t('One file with every house, all versions and save points.')),
      h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => this.exportAll() }, icon('download'), t('Back up everything')), h('button', { class: 'btn sm', onclick: () => this.importFlow() }, icon('upload'), t('Import a file'))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Remind me to make a backup')), seg),
      folderPart);
    return box;
  },
});
