/* ───────────── toolbox.js — Send to Fresing Render through the Toolbox folder (task 0042) ─────────────
   House Planner's side of the toolbox format 0.1 (smholte/toolbox-format, tag v0.1). The folder work itself is the
   format's reference code, toolbox-folder.js (ToolboxFolder), copied unchanged; this file adds what is House Planner's:
   1. only on a PC in Chrome / Edge (showDirectoryPicker, a mouse) and never in a copy for viewing;
   2. Connect: the owner picks C:\Users\<name>\Toolbox once; a folder without toolbox-folder.json is refused and nothing
      is written there (only a program like Fresing Render makes the folder); the handle stays on this device
      (ToolboxFolder.remember: IndexedDB). Disconnect forgets it. Permission is asked only from a click (Send, Check);
   3. our manifest tools/nl.fresing.house-planner/toolbox.json: one action, import-bake (hpbake) – written when the
      folder is connected and once a session after that (its app_version follows the app);
   4. Send: the house scene (hpsceneMake) as a job in Fresing Render's inbox, "return": "import-bake"; the device list
      of sent jobs (IndexedDB "house-planner.toolbox", never in the house, Undo, export or merge);
   5. what happens: status.json of the sent job in the export dialog and in a small bar under the top bar; Stop writes
      cancel.json;
   6. the reply: our inbox is read every 2 s while a job of ours is out and the tab is visible, every 10 s otherwise
      (one window of this site at a time: ToolboxFolder's Web Lock); a reply checked by name, size and type by content
      (ToolboxFolder.take), then by the bake's scene id: the open house sent it → hpbakeImport, both jobs deleted;
      another house of this copy → status "waiting" with that house's name, taken in when it opens; no house of this
      copy → left alone for another copy of the app; a bad one → status "failed" with a code, deleted a day later;
   7. a .hpbake double-clicked (installed web app: launchQueue, manifest file_handlers in build.py) → its house. */
const TB_ME = 'nl.fresing.house-planner';
const TB_RENDER = 'nl.fresing.render';
const TB_URL = 'https://smholte.github.io/house-planner/';
const TB_FAST = 2000, TB_SLOW = 10000;
const TB_DAY = 24 * 3600 * 1000;

/** the manifest House Planner writes (FORMAT.md 4): only what the app can take today */
function tbManifest() {
  return {
    format: 'toolbox-tool', version: ToolboxFolder.VERSION, id: TB_ME, name: 'House Planner', app_version: String(APP_VERSION.n),
    description: 'Plan a house in 2D and 3D.', homepage: TB_URL, kind: 'web', url: TB_URL,
    actions: [{ id: 'import-bake', label: 'Import baked light', accepts: ['hpbake'] }],
    sends: ['hpscene'], handover: ['inbox'],
  };
}

/* ───────── the jobs this device sent: a small IndexedDB of its own (not the house's) ───────── */
const TbJobs = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      const r = indexedDB.open('house-planner.toolbox', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('sent', { keyPath: 'job' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async _req(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => { const tx = d.transaction('sent', mode), q = fn(tx.objectStore('sent')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
  },
  async all() { try { return ((await this._req('readonly', s => s.getAll())) || []).sort((a, b) => a.sent - b.sent); } catch (e) { return []; } },
  async put(rec) { try { await this._req('readwrite', s => s.put(rec)); } catch (e) { /* the list only shows progress */ } },
  async del(job) { try { await this._req('readwrite', s => s.delete(job)); } catch (e) { /* gone */ } },
  /** keep the last 20 */
  async trim() { const all = await this.all(); for (const r of all.slice(0, Math.max(0, all.length - 20))) await this.del(r.job); },
};

/** the bake's scene id (bake.json → scene.id) of a .hpbake file, or null */
async function tbSceneOf(file) {
  try {
    const files = await hpbUnzip(new Uint8Array(await file.arrayBuffer()));
    const doc = JSON.parse(new TextDecoder().decode(files.get('bake.json')));
    return doc && doc.scene && typeof doc.scene.id === 'string' ? doc.scene.id : null;
  } catch (e) { return null; }
}

Object.assign(app, {
  /** the Toolbox folder can work here: Chrome / Edge on a PC, not a copy for viewing */
  tbAvailable() {
    if (!ToolboxFolder.supported()) return false;
    if (this.project && this.project.viewer) return false;
    if (document.getElementById(VIEWER_DATA_ID)) return false;
    // a phone or tablet (touch only) has no Toolbox folder
    const mm = q => window.matchMedia && window.matchMedia(q).matches;
    if (mm('(pointer: coarse)') && !mm('(any-pointer: fine)')) return false;
    return true;
  },
  _tbState() { return this._tb || (this._tb = { root: null, box: null, jobs: [], open: false, timer: 0, busy: false, seen: {}, places: {}, wrote: false, last: 0 }); },

  /** at start: the folder kept from an earlier visit; read only when the browser still holds the permission */
  async tbInit() {
    if (!this.tbAvailable()) return;
    const S = this._tbState();
    if (S.inited) return;
    S.inited = true;
    try { S.root = await ToolboxFolder.remembered(); } catch (e) { S.root = null; }
    S.jobs = await TbJobs.all();
    const wake = () => this.tbTick(true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    window.addEventListener('focus', wake);
    // nothing is imported while a finger or the mouse is down (dragging)
    window.addEventListener('pointerdown', () => { S.down = true; }, true);
    const up = () => { S.down = false; };
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    if (!S.root) return;
    if (await ToolboxFolder.permission(S.root, false) === 'granted') { await this.tbOpenBox(); this.tbTick(true); }
    else if (S.jobs.some(j => !ToolboxFolder.FINAL.includes(j.state))) this.tbBar();
  },

  /** the open box, or null; reads and writes only with a granted permission (ask: from a click) */
  async tbOpenBox(ask = false) {
    const S = this._tbState();
    if (S.box) return S.box;
    if (!S.root) return null;
    const perm = await ToolboxFolder.permission(S.root, ask);
    if (perm !== 'granted') return null;
    try { S.box = await ToolboxFolder.open(S.root, TB_ME); } catch (e) { S.box = null; S.boxError = e; return null; }
    // our manifest: once a session (FORMAT.md 9: when the folder is picked and when the version changes)
    if (!S.wrote) { try { await S.box.writeManifest(tbManifest()); S.wrote = true; } catch (e) { console.warn('[toolbox] manifest', e); } }
    this.tbSchedule();
    return S.box;
  },

  /** Connect to Fresing Render…: what to pick, the picker, the check; nothing is written in another folder */
  async tbConnect() {
    const S = this._tbState();
    const go = await UI.dialog({ title: t('Connect to Fresing Render'), body: h('div', { id: 'tb-connect', style: { display: 'grid', gap: '8px' } },
      h('p', null, t('House Planner and Fresing Render hand files to each other through the Toolbox folder on this PC.')),
      h('p', null, t('In the next window pick the folder Toolbox in your user folder: C:\\Users\\<your name>\\Toolbox.'))),
      actions: [{ label: 'Cancel', value: null }, { label: t('Pick the folder…'), value: 'pick', kind: 'primary', icon: 'folder' }] });
    if (!go) return null;
    let root;
    try { root = await window.showDirectoryPicker({ id: 'toolbox', mode: 'readwrite' }); }
    catch (e) { return null; }                                    // closed without a folder
    return this.tbUseRoot(root);
  },
  /** check a picked folder (also the tests' way in: a folder of the browser's private file system) */
  async tbUseRoot(root) {
    const S = this._tbState();
    let box;
    try {
      if (await ToolboxFolder.permission(root, true) !== 'granted') return null;
      box = await ToolboxFolder.open(root, TB_ME);
    } catch (e) {
      const ver = e && e.code === 'version';
      await UI.dialog({ title: ver ? t('A newer Toolbox folder') : t('This is not the Toolbox folder'), body: h('div', { id: 'tb-wrong', style: { display: 'grid', gap: '8px' } },
        ver ? h('p', null, t('This Toolbox folder is of a newer version. Update House Planner to use it.'))
          : h('p', null, t('“{f}” is not the Toolbox folder: it has no toolbox-folder.json. Nothing was written there.', { f: root.name })),
        ver ? null : h('p', null, t('Open Fresing Render once (it makes the folder), then pick C:\\Users\\<your name>\\Toolbox.'))),
        actions: [{ label: t('OK'), value: true, kind: 'primary' }] });
      return null;
    }
    S.root = root; S.box = box; S.wrote = false;
    try { await ToolboxFolder.remember(root); } catch (e) { /* kept for this visit only */ }
    try { await box.writeManifest(tbManifest()); S.wrote = true; } catch (e) { console.warn('[toolbox] manifest', e); }
    this.tbSchedule();
    this.toast(t('Connected to the Toolbox folder.'));
    return box;
  },
  async tbDisconnect() {
    const S = this._tbState();
    try { await ToolboxFolder.forget(); } catch (e) { /* not kept */ }
    S.root = null; S.box = null; S.wrote = false;
    clearTimeout(S.timer);
    this.tbBar();
    this.toast(t('The Toolbox folder is no longer used on this device.'));
  },

  /** the row in Export → For Fresing Render…: connected or not */
  tbRow(onChange) {
    const S = this._tbState(), row = h('div', { class: 'tb-row', id: 'tb-row' });
    const draw = () => {
      row.textContent = '';
      if (S.root) row.append(h('span', { class: 'note-muted' }, t('Toolbox folder: {f}', { f: S.root.name })),
        h('button', { type: 'button', class: 'btn ghost sm', id: 'tb-disconnect', onclick: async () => { await this.tbDisconnect(); draw(); onChange && onChange(); } }, t('Disconnect')));
      else row.append(h('span', { class: 'note-muted' }, t('Not connected to Fresing Render yet.')),
        h('button', { type: 'button', class: 'btn ghost sm', id: 'tb-connect-btn', onclick: async () => { await this.tbConnect(); draw(); onChange && onChange(); } }, t('Connect to Fresing Render…')));
    };
    draw();
    return row;
  },

  /** Send to Fresing Render: (from a click) the folder, Fresing Render's manifest, the scene, the job. true when sent */
  async tbSend(o, status) {
    const S = this._tbState();
    const say = msg => { if (status) status.textContent = msg; };
    if (Saver.readonly) { say(t('This house is open in another window: send it from the window that saves it.')); return false; }
    if (!S.root) { await this.tbConnect(); if (!S.root) return false; }
    const box = await this.tbOpenBox(true);
    if (!box) {
      if (S.boxError) { say(t('The Toolbox folder cannot be read: {e}', { e: S.boxError.message })); S.boxError = null; }
      else say(t('House Planner may not use the Toolbox folder: allow it when the browser asks.'));
      return false;
    }
    let render;
    try { render = await box.tool(TB_RENDER); } catch (e) { say(e.code === 'version' ? t('Fresing Render in this folder is of another version: update both apps.') : t('Fresing Render’s file in the Toolbox folder cannot be read.')); return false; }
    const act = render && render.manifest.actions.find(a => a.accepts.includes('hpscene'));
    if (!render || !act) { say(t('Fresing Render is not set up in this folder yet – open it once.')); return false; }
    let res;
    try { res = await this.hpsceneMake(o, msg => say(msg)); }
    catch (e) { console.error(e); say(t('The house scene could not be made: {e}', { e: String(e && e.message || e) })); return false; }
    say(t('Handing the house to Fresing Render…'));
    const p = this.project, v = p.versions.find(x => x.id === o.versionId) || this.shownVersion();
    const title = [p.name, res.doc.house.version_name].filter(Boolean).join(' – ');
    let job;
    try { job = await box.send({ to: TB_RENDER, action: act.id, files: [new File([res.blob], res.name)], ret: 'import-bake', title }); }
    catch (e) { console.error(e); say(t('The house could not be handed over: {e}', { e: String(e && e.message || e) })); return false; }
    const rec = { job, to: TB_RENDER, houseId: p.id, houseName: p.name, versionId: v && v.id, sceneId: res.doc.id, title, sent: Date.now(), state: 'sent', text: '', open: render.open };
    S.jobs = [...S.jobs.filter(j => j.job !== job), rec];
    await TbJobs.put(rec); await TbJobs.trim();
    S.open = render.open;
    say('');
    this.tbBar();
    this.tbSchedule(true);
    return true;
  },

  /** the line for a sent job */
  tbText(j) {
    if (!j) return '';
    const S = this._tbState();
    switch (j.state) {
      case 'sent': return (j.open ?? S.open) ? t('Sent. Fresing Render is open and will pick the house up.') : t('Sent. Open Fresing Render and it will pick the house up.');
      case 'waiting': return j.text ? t('Fresing Render: {t}', { t: j.text }) : t('Waiting in Fresing Render.');
      case 'working': {
        if (ToolboxFolder.stalled({ state: 'working', updated: j.updated })) return t('Nothing heard from Fresing Render for a while.');
        const pct = typeof j.fraction === 'number' ? ` (${Math.round(j.fraction * 100)} %)` : '';
        return (j.text ? t('Baking: {t}', { t: j.text }) : t('Baking…')) + pct;
      }
      case 'done': return t('Baked – the light is coming in.');
      case 'imported': return t('The baked light is in.');
      case 'failed': return t('Fresing Render could not bake it: {t}', { t: j.text || t('no reason given') });
      case 'cancelled': return t('The bake was stopped.');
      default: return '';
    }
  },
  /** the job the bar and the dialog show: the newest one still going, else the newest one */
  tbCurrent() {
    const S = this._tbState(), jobs = S.jobs.filter(j => !j.hidden);
    return jobs.filter(j => !['failed', 'cancelled', 'imported', 'gone'].includes(j.state)).pop() || jobs.filter(j => j.state !== 'gone').pop() || null;
  },
  /** the small bar under the top bar (and the line in an open export dialog) */
  tbBar() {
    const S = this._tbState();
    let bar = document.getElementById('tb-bar');
    const j = this.tbCurrent();
    for (const el of document.querySelectorAll('.tb-line')) el.textContent = this.tbText(j);
    const going = j && ['sent', 'waiting', 'working'].includes(j.state);
    // the browser no longer holds the permission and jobs are out: one click to look
    const check = S.root && !S.box && S.jobs.some(x => ['sent', 'waiting', 'working', 'done'].includes(x.state));
    if (!S.root || (!j && !check) || document.querySelector('#sheet-root .hps-dialog') || !this.tbAvailable()) { if (bar) bar.remove(); return; }
    const text = check ? t('Fresing Render may have sent something.') : this.tbText(j);
    if (!text) { if (bar) bar.remove(); return; }
    if (!bar) { bar = h('div', { class: 'tb-bar', id: 'tb-bar', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(bar); }
    bar.textContent = '';
    bar.append(h('span', { class: 'tb-ic', 'aria-hidden': 'true' }, icon('sun')), h('span', { class: 'tb-text', id: 'tb-text' }, text));
    if (check) bar.append(h('button', { class: 'btn sm primary', id: 'tb-check', onclick: async () => { if (await this.tbOpenBox(true)) this.tbTick(true); else this.tbBar(); } }, t('Check')));
    else if (going) bar.append(h('button', { class: 'btn sm', id: 'tb-stop', title: t('Ask Fresing Render to stop'), onclick: () => this.tbStop(j) }, t('Stop')));
    if (!going || check) bar.append(h('button', { class: 'btn sm ghost', id: 'tb-close', 'aria-label': t('Close'), title: t('Close'), onclick: async () => { if (j) { j.hidden = true; await TbJobs.put(j); } S.jobs.forEach(x => { if (check) x.hidden = true; }); bar.remove(); } }, icon('close')));
  },
  async tbStop(j) {
    const box = await this.tbOpenBox(true);
    if (!box || !j) return;
    try { await box.cancel(j.to, j.job); this.toast(t('Fresing Render was asked to stop.')); } catch (e) { this.toast(t('Could not ask Fresing Render to stop: {e}', { e: String(e.message || e) })); }
    this.tbTick(true);
  },

  /** the next look: often while a job of ours is out and the tab shows, seldom otherwise */
  tbSchedule(soon) {
    const S = this._tbState();
    clearTimeout(S.timer);
    if (!S.box) return;
    const out = S.jobs.some(j => ['sent', 'waiting', 'working', 'done'].includes(j.state));
    const ms = soon ? 300 : (out && document.visibilityState === 'visible' ? TB_FAST : TB_SLOW);
    S.timer = setTimeout(() => this.tbTick(), ms);
  },
  /** one look at the folder: the status of what we sent, then our inbox */
  async tbTick(wake) {
    const S = this._tbState();
    if (!S.box) { if (wake && S.root && await ToolboxFolder.permission(S.root, false) === 'granted') await this.tbOpenBox(); if (!S.box) return; }
    if (S.busy) return;
    S.busy = true;
    try {
      // the device list again (another tab of this site may have sent or closed a job)
      const all = await TbJobs.all();
      if (all.length || !S.jobs.length) S.jobs = all;
      await this.tbLookAtSent();
      await S.box.exclusively(() => this.tbReadInbox());
    } catch (e) {
      // the folder went away (deleted, a stick pulled out): say so once, keep the handle for a later visit
      if (e && (e.name === 'NotFoundError' || e.name === 'NotAllowedError' || e.name === 'SecurityError')) { S.box = null; }
      else console.warn('[toolbox]', e);
    } finally { S.busy = false; }
    this.tbBar();
    this.tbSchedule();
  },
  async tbLookAtSent() {
    const S = this._tbState(), box = S.box;
    try { const r = await box.tool(TB_RENDER); S.open = !!(r && r.open); } catch (e) { S.open = false; }
    for (const j of S.jobs) {
      if (!['sent', 'waiting', 'working', 'done'].includes(j.state)) continue;
      const st = await box.status(j.to, j.job);
      const was = j.state + '|' + j.text + '|' + j.fraction;
      // gone: Fresing Render or another copy cleaned it up (a done job a day later, while its reply may still wait)
      if (!st) j.state = 'gone';
      else if (st.state !== 'sent') { j.state = st.state; j.text = st.text || ''; j.fraction = st.fraction; j.updated = st.updated; j.reply = st.reply; }
      j.open = S.open;
      // a final status that brings nothing back: the sent job may go (7.4)
      if (st && (st.state === 'failed' || st.state === 'cancelled')) await box.remove(j.to, j.job);
      if (was !== j.state + '|' + j.text + '|' + j.fraction) await TbJobs.put(j);
    }
  },

  /** our inbox: replies (6.3), jobs left waiting for another house, and the clean-up of a day-old final job (7.4) */
  async tbReadInbox() {
    const S = this._tbState(), box = S.box, me = tbManifest();
    // waiting: for another house of this copy; working: being taken in – by a copy that stopped, after 5 minutes
    const left = (await box.unfinished()).filter(u => u.status.state === 'waiting' || (u.status.state === 'working' && ToolboxFolder.stalled(u.status)));
    const ids = [...await box.pending(), ...left.map(u => u.id)];
    for (const id of ids) {
      if (S.taken && S.taken.has(id)) continue;                     // taken in already; its delete failed (Windows held it)
      if (S.retry && S.retry[id] > Date.now()) continue;            // a passing problem: tried again later
      try { await this.tbOneJob(id, me); }
      catch (e) { if (e && e.name === 'NotFoundError' && !(await box.status(TB_ME, id))) continue; if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e; console.warn('[toolbox] job', id, e); }
    }
    await this.tbClean();
  },
  /** one job of our inbox */
  async tbOneJob(id, me) {
    const S = this._tbState(), box = S.box;
    {
      let got;
      try { got = await box.take(me, id); }
      catch (e) {
        if (!(e instanceof ToolboxFolder.TbError)) throw e;
        if (e.code === 'not-complete') {
          // a file still being written gets a minute
          S.seen[id] = S.seen[id] || Date.now();
          if (Date.now() - S.seen[id] < 60000) return;
        }
        const code = ['bad-job', 'unknown-action', 'wrong-type'].includes(e.code) ? e.code : 'bad-job';
        const newer = /is version (\d+\.\d+)/.exec(e.message);
        const text = newer ? t('This job was written by a newer tool (toolbox format {v}). Update House Planner to read it.', { v: newer[1] }) : t('House Planner cannot take this: {e}', { e: e.message });
        await box.writeStatus(id, 'failed', { code, text });
        this.toast(t('Something arrived from the Toolbox folder that House Planner cannot take: {e}', { e: text }), { ms: 9000 });
        return;
      }
      const file = got.files[0].file;
      const scene = S.places[id] !== undefined ? S.places[id].scene : await tbSceneOf(file);
      if (!scene) {
        const text = t('House Planner cannot take this: {e}', { e: t('the bake has no scene House Planner can read') });
        await box.writeStatus(id, 'failed', { code: 'bad-job', text });
        this.toast(t('Something arrived from the Toolbox folder that House Planner cannot take: {e}', { e: text }), { ms: 9000 });
        return;
      }
      // which house of this copy sent that scene?
      const open = this.project;
      if (open && scene && (open.hpScenes || []).some(x => x.id === scene)) {
        if (!this.tbQuiet()) return;                                // later: a dialog is open or something is dragged
        if (Saver.readonly) return;                                 // another window writes this house
        await this.tbImport(got, file, scene);
        return;
      }
      let house = S.places[id] && S.places[id].house;
      if (house === undefined) {
        house = null;
        try { for (const p of await DB.all('projects')) if (!p.viewer && (p.hpScenes || []).some(x => x.id === scene)) { house = { id: p.id, name: p.name }; break; } } catch (e) { /* no list */ }
        S.places[id] = { scene, house };
      }
      if (!house) return;                                           // not this copy's: left alone for another one
      const text = t('Baked light for “{name}” has arrived – open that house to take it in.', { name: house.name });
      const st = await box.status(TB_ME, id);
      if (!st || st.state !== 'waiting' || st.text !== text) {
        await box.writeStatus(id, 'waiting', { text });
        this.toast(text, { ms: 9000, action: { label: t('Open'), fn: () => this.openProject(house.id) } });
      }
    }
  },
  /** nothing in the way: no dialog, no sheet, nothing being dragged */
  tbQuiet() {
    const S = this._tbState();
    return !S.down && !document.querySelector('#sheet-root .scrim') && !document.querySelector('body > .menu');
  },
  /** a reply for the open house: to its version, through Import bake; then both jobs go */
  async tbImport(got, file, scene) {
    const S = this._tbState(), box = S.box, p = this.project, id = got.job.job;
    const rec = (p.hpScenes || []).find(x => x.id === scene);
    // the version it was sent from is gone: not into whatever version shows
    if (!rec || (rec.versionId && !getVersion(p, rec.versionId))) {
      const text = t('Baked light for a version of “{name}” that is no longer there: not taken in.', { name: p.name });
      await box.writeStatus(id, 'failed', { code: 'error', text });
      this.toast(text, { ms: 9000 });
      return;
    }
    // taken: other copies (the other kind of copy has another Web Lock) leave a job with a status alone
    await box.writeStatus(id, 'working', { text: t('Taking the baked light in.') });
    if (rec.versionId && this.shownVersion().id !== rec.versionId) {
      const v = getVersion(p, rec.versionId);
      this.setActiveVersion(rec.versionId);
      this.toast(t('Baked light for “{v}”: that version is shown now.', { v: v.name || t('Original') }), { ms: 6000 });
    }
    const sent = S.jobs.find(j => got.job.reply_to && j.job === got.job.reply_to.job && j.to === got.job.from);
    if (sent) { sent.state = 'done'; await TbJobs.put(sent); this.tbBar(); }
    if (this.project !== p) { await box.writeStatus(id, 'waiting', { text: t('Baked light has arrived – open its house to take it in.') }); return; }
    const why = {};
    const ok = await this.hpbakeImport(new File([file], file.name || 'bake.hpbake'), why);
    if (ok) {
      // final first: should the delete fail (Windows holds a file), the job is not taken in twice
      await box.writeStatus(id, 'done', { text: t('The baked light is in.') });
      (S.taken || (S.taken = new Set())).add(id);
      await box.remove(TB_ME, id);
      // the job it answers: only one this device sent to that tool (7.4)
      if (sent) await box.remove(sent.to, sent.job);
      if (sent) { sent.state = 'imported'; await TbJobs.put(sent); }
    } else if (why.reason === 'declined') {
      await box.writeStatus(id, 'cancelled', { text: t('The owner kept the baked light the house had.') });
      if (sent) { sent.state = 'cancelled'; await TbJobs.put(sent); }
    } else if (why.reason === 'refused') {
      await box.writeStatus(id, 'failed', { code: 'error', text: t('House Planner did not take this bake in.') });
      if (sent) { sent.state = 'failed'; sent.text = t('House Planner did not take this bake in.'); await TbJobs.put(sent); }
    } else {
      // a passing problem (no room, no 3D, an error): kept, tried again in 5 minutes
      await box.writeStatus(id, 'waiting', { text: t('Not taken in yet – House Planner tries again.') });
      (S.retry || (S.retry = {}))[id] = Date.now() + 5 * 60000;
    }
    delete S.places[id];
  },
  /** jobs of our inbox whose status became final a day ago go (7.4) */
  async tbClean() {
    const S = this._tbState();
    if (Date.now() - (S.cleaned || 0) < 60000) return;
    S.cleaned = Date.now();
    let inbox;
    try { inbox = await (await S.box.tools.getDirectoryHandle(TB_ME)).getDirectoryHandle('inbox'); } catch (e) { return; }
    for await (const [name, hd] of inbox.entries()) {
      if (hd.kind !== 'directory' || !ToolboxFolder.isJobId(name)) continue;
      try {
        const f = await (await hd.getFileHandle('status.json')).getFile();
        const st = ToolboxFolder.parseJson(new Uint8Array(await f.arrayBuffer()));
        const age = Date.now() - Date.parse(st.updated);
        if ((ToolboxFolder.FINAL.includes(st.state) && age > TB_DAY) || age > 30 * TB_DAY) await S.box.remove(TB_ME, name);
      } catch (e) { /* no status, or being replaced: next time */ }
    }
  },

  /** a .hpbake opened with the installed app (double-click): to the house that sent its scene */
  async tbOpenBakeFile(file) {
    const scene = await tbSceneOf(file);
    if (this.project && !(this.project.hpScenes || []).some(x => x.id === scene)) {
      let other = null;
      try { other = (await DB.all('projects')).find(p => !p.viewer && (p.hpScenes || []).some(x => x.id === scene)); } catch (e) { /* none */ }
      if (other) await this.openProject(other.id);
    } else if (!this.project) {
      let other = null;
      try { other = (await DB.all('projects')).find(p => !p.viewer && (p.hpScenes || []).some(x => x.id === scene)); } catch (e) { /* none */ }
      if (!other) { this.toast(t('This bake is for a house that is not in House Planner on this device.'), { ms: 7000 }); return false; }
      await this.openProject(other.id);
    }
    const rec = (this.project.hpScenes || []).find(x => x.id === scene);
    if (rec && rec.versionId && getVersion(this.project, rec.versionId) && this.shownVersion().id !== rec.versionId) this.setActiveVersion(rec.versionId);
    return this.hpbakeImport(file);
  },
});

/* the installed web app: a .hpbake opened from Explorer (manifest file_handlers) – after the app has started */
if ('launchQueue' in window && window.launchQueue && window.launchQueue.setConsumer) {
  window.launchQueue.setConsumer(async params => {
    const files = (params && params.files) || [];
    for (let i = 0; i < 600 && !(app.settings && (app.project || !document.getElementById('home').hidden)); i++) await new Promise(r => setTimeout(r, 100));
    for (const fh of files) {
      try { const f = await fh.getFile(); if (/\.hpbake$/i.test(f.name)) await app.tbOpenBakeFile(f); } catch (e) { console.error(e); }
    }
  });
}
