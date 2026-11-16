/* ───────────── app.js — the controller: screens, views, editing, undo ───────────── */

const app = new (class App extends Emitter {
  constructor() {
    super();
    this.settings = Settings.values;
    this.project = null;
    this.tool = 'select';
    this.toolOpts = { wallT: 0.1, wallKind: 'interior', doorW: 0.93, winW: 1.2, gapW: 0.9, roomMode: 'auto' };
    this.display = 'plan';
    this.view = { dim: '2d', scope: 'storey', storeyId: null };
    this.selection = null;
    this.undoStack = [];
    this.redoStack = [];
    this.panes = [];
    this.sideBySide = false;
    this.swipe = false;          // compare slider: the original under the plan, a line to drag across
    this.swipePos = 0.5;
    this.compareBaseId = null;
    this.compareShownId = null;  // side by side: the version on the right when it is not the open one (task 0034)
    this.mode = 'build';         // build | furnish | view
    this.furnCompare = null;     // furnish mode, side by side / compare: {versionId, layoutId} of the left side
    this.spaceDown = false;
    this.inGesture = false;
    this.inspOpen = false;
    this.layoutKey = null;
    this._invalidate = rafThrottle(() => this.flushInvalidate());
  }

  toast(msg, opts) { UI.toast(msg, opts); }

  /* ───────── start-up ───────── */
  async boot() {
    this.applyTheme();
    await DB.open();
    await Settings.load();
    this.settings = Settings.values;
    // (the pictures were chosen before the settings were read: again, if they ask for other sizes – task 0009)
    if (TEXLIB.ready) libUpgrade(); else if (window.__hp_texlib) window.__hp_texlib.then(ok => ok && libUpgrade());
    Settings.onSave = () => this.syncViewSettings();
    // language: English, Dutch or Norwegian (Settings); ?lang=nl in the address overrides it
    const ql = new URLSearchParams(location.search).get('lang');
    // a viewer page opens in the language of whoever made it, until you choose one yourself
    const vd = document.getElementById(VIEWER_DATA_ID);
    const lang = ql || (!this.settings.langChosen && vd && vd.dataset.lang) || this.settings.lang || 'en';
    if (lang !== 'en') await loadLangs();
    setLang(lang);
    i18nWatch();
    this.applyTheme();
    const recovered = await recoverEmergency();
    this.wireStatic();
    Saver.on('state', () => { this.renderSaveStatus(); this.renderSaveBar(); });
    Saver.on('autosaved', () => this.renderSaveStatus());
    Saver.on('failed', () => this.renderSaveBar());
    Saver.on('recovered', () => this.toast(t('Saved again.')));
    // the other copy let go of the open house: this one reads it again and writes it from now on
    Saver.on('free', id => { if (this.project && this.project.id === id && Saver.readonly) this.writerFree(id); });
    Saver.on('kept', () => this.toast(t('What this window had not saved is kept under Save points → Automatic backups.'), { ms: 7000 }));
    // a write refused because another copy has the house (a merge or rename here): said, not an error
    window.addEventListener('unhandledrejection', e => { if (e.reason && e.reason.code === 'HP_ELSEWHERE') { e.preventDefault(); this.toast(e.reason.message, { ms: 6000 }); } });
    setInterval(() => this.renderSaveStatus(), 20000);
    let last = null;
    try { last = localStorage.getItem('house-planner.last'); } catch (e) { /* ignore */ }
    // Settings → "Open the last house at start" (on): also after Back to the projects page; off: the projects page every time
    if (this.settings.openLast !== false && !last) last = this.settings.lastProject || null;
    if (recovered) last = recovered.id;
    const exists = last && await DB.get('projects', last);
    // a viewer page (Export for viewing) opens the house it carries
    if (await this.bootViewerPage()) { /* opened */ }
    else if (exists) await this.openProject(last);
    else await this.showHome();
    if (recovered) this.toast('Recovered changes that were not saved when the app closed.', { ms: 6000 });
    if (DB.memory) this.toast('This browser does not allow storage here. Use Export to keep your work.', { ms: 9000 });
    setTimeout(() => Assets.collectGarbage(), 8000);
    Saver.on('state', st => { if (st === 'saved') this.folderSoon(); });
    setTimeout(() => this.folderInit(), 2500);
    this.registerServiceWorker();
  }

  /** hosted copies: the service worker keeps the app offline; a new version waits and the update bar offers it (0019, I6) */
  registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      this._swReg = reg;
      const offer = w => { if (w && navigator.serviceWorker.controller) this.updateBar(w); };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // look for a new version now, and whenever the app comes back to the front
      let lastCheck = 0;
      const check = () => { if (Date.now() - lastCheck < 6e5) return; lastCheck = Date.now(); try { reg.update().catch(() => {}); } catch (e) { /* offline */ } };
      check();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('focus', check);
    }).catch(() => {});
  }

  updateBar(worker) {
    if (document.getElementById('update-bar')) return;
    const bar = h('div', { class: 'update-bar', id: 'update-bar', role: 'status' },
      h('span', null, t('A new version is ready.')),
      h('button', { class: 'btn sm primary', id: 'update-restart', onclick: () => this.restartForUpdate(worker, bar) }, t('Restart')),
      h('button', { class: 'btn sm ghost', 'aria-label': t('Later'), title: t('Later'), onclick: () => bar.remove() }, icon('close')));
    document.getElementById('app').appendChild(bar);
  }

  /** Restart: what is open is saved first, then the waiting version takes over and the page loads once */
  async restartForUpdate(worker, bar) {
    const btn = bar && bar.querySelector('button.primary');
    if (btn) btn.disabled = true;
    // a save that is being written is waited for (task 0027); what could not be written goes into the emergency copy
    const wait = (async () => { try { await Saver.flushNow(); await Settings.flushNow(); } catch (e) { console.warn('save before update', e); } })();
    await Promise.race([wait, new Promise(r => setTimeout(r, 8000))]);   // a write that never ends: the emergency copy
    Saver.emergencyWrite();
    let reloaded = false;
    const reload = () => { if (reloaded) return; reloaded = true; location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    try { ((this._swReg && this._swReg.waiting) || worker).postMessage('skip-waiting'); } catch (e) { reload(); }
    // when no controller change comes (the worker was replaced already), reload anyway
    setTimeout(reload, 4000);
  }

  applyTheme() {
    const t = this.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  async requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) { /* not supported */ }
  }

  wireStatic() {
    const lbl = (sel, ic, text) => { const b = $(sel); b.textContent = ''; if (ic) b.appendChild(icon(ic)); if (text) b.appendChild(h('span', null, text)); return b; };
    this.barsWire();
    const fchip = $('#folder-status');
    if (fchip) fchip.onclick = e => this.folderChip(e.currentTarget);
    lbl('#btn-new', 'plus', 'New project').onclick = () => this.newProjectDialog();
    lbl('#btn-import', 'upload', 'Import house file').onclick = () => this.importFlow();
    lbl('#btn-example', 'home', 'Open example house').onclick = () => this.openExample();
    if (typeof EXAMPLE_HOUSE === 'undefined') { $('#btn-example').hidden = true; if ($('#intro-example')) $('#intro-example').hidden = true; }
    $('#btn-hide-intro').onclick = () => { Settings.set('introDismissed', true); $('#intro').hidden = true; };
    lbl('#btn-trash', 'trash', 'Trash').onclick = () => this.trashSheet();
    lbl('#btn-backup', 'download', 'Back up everything').onclick = () => this.exportAll();
    lbl('#btn-settings', 'settings', 'Settings').onclick = () => this.settingsSheet();
    lbl('#btn-install', 'install', 'Install app').onclick = () => this.installApp();
    lbl('#btn-back', 'back').onclick = () => this.showHome();
    $('#btn-project-name').onclick = () => this.renameProject();
    $('#btn-version').appendChild(icon('chevron'));
    $('#btn-version').onclick = () => this.versionsSheet();
    lbl('#btn-savepoint', 'save', 'Save point').onclick = () => this.savePointDialog();
    lbl('#btn-share', 'share', 'Export').onclick = () => this.exportDialog();
    $('#btn-share').setAttribute('aria-label', t('Export'));
    lbl('#btn-menu', 'more').onclick = e => this.editorMenu(e.currentTarget);
    lbl('#btn-search', 'search').onclick = () => this.searchOpen();
    // the whole screen for the app (fullscreen.js)
    $('#btn-fullscreen').onclick = () => this.toggleFullscreen();
    this.renderFullscreenBtn();
    $('#save-status').onclick = () => this.savePointsSheet();
    lbl('#btn-viewopts', 'eye', 'View').onclick = e => this.viewMenu(e.currentTarget);
    lbl('#btn-fit', 'fit').onclick = () => this.fitViews();
    lbl('#btn-compare', 'split', 'Side by side').onclick = () => this.toggleSideBySide();
    lbl('#btn-swipe', 'swipe', 'Compare').onclick = () => this.toggleSwipe();
    for (const b of $$('#display-toggle button')) b.onclick = () => this.setDisplay(b.dataset.mode);
    $('#btn-display').onclick = e => this.displayMenu(e.currentTarget);
    for (const b of $$('#dim-toggle button')) b.onclick = () => this.setDim(b.dataset.dim);
    for (const b of $$('#mode-switch button')) {
      const m = b.dataset.mode, ic = { build: 'build', furnish: 'sofa', view: 'eye' }[m], name = { build: 'Build', furnish: 'Furnish', view: 'View' }[m];
      b.textContent = '';
      b.append(icon(ic), h('span', null, t(name)));
      b.title = t({ build: 'Build: walls, doors, windows and rooms', furnish: 'Furnish: furniture layouts', view: 'View: look around, notes and walking' }[m]);
      b.onclick = () => this.setMode(m);
    }

    window.addEventListener('appinstalled', () => { this.requestPersistence().then(() => this.renderStorageNote()); });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installEvent = e; $('#btn-install').hidden = false; });
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isIOS && !standalone && /^https?:$/.test(location.protocol)) $('#btn-install').hidden = false;

    document.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('resize', () => { this.syncSlimBars(); if (this.swipe && this.swipeEls) this.setSwipePos(this.swipePos); this.updateInsets(); });
    window.addEventListener('hp-menu', () => requestAnimationFrame(() => this.updateInsets()));
    document.addEventListener('keyup', e => { if (e.code === 'Space') this.spaceDown = false; if (this.walking) this.walkKey(e, false); });
    window.addEventListener('blur', () => { this.spaceDown = false; if (this.walking) this.walkKey(null, false); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (this.project && this.view.dim === '3d') this.refreshViews(false); });
  }

  async installApp() {
    if (this.installEvent) { this.installEvent.prompt(); try { await this.installEvent.userChoice; } catch (e) { /* ignore */ } this.installEvent = null; $('#btn-install').hidden = true; return; }
    UI.dialog({ title: 'Install on iPhone or iPad', body: h('div', { class: 'dlg-body-inner' },
      h('p', null, 'Tap the Share button in Safari, then choose "Add to Home Screen". The app then opens full screen and works without internet.')),
      actions: [{ label: 'OK', value: true, kind: 'primary' }] });
  }

  /* ───────── home ───────── */
  async showHome() {
    if (this.project) await this.closeProject();
    $('#editor').hidden = true;
    $('#home').hidden = false;
    document.title = 'House Planner';
    try { localStorage.removeItem('house-planner.last'); } catch (e) { /* ignore */ }
    $('#intro').hidden = !!this.settings.introDismissed;
    await this.renderProjectList();
    this.renderStorageNote();
    this.renderAppVersion();
  }

  /** the app's version at the bottom of the projects page (APP_VERSION, util.js): which one this device runs */
  renderAppVersion() {
    const el = $('#app-version');
    if (!el) return;
    const [y, mo, d] = APP_VERSION.date.split('-').map(Number), built = /^[0-9a-f]{10}$/.test(APP_VERSION.build);
    el.textContent = t('App version {n} · {d}', { n: APP_VERSION.n, d: fmtDate(new Date(y, mo - 1, d).getTime(), false) }) + (built ? ' · build ' + APP_VERSION.build : '');
    el.title = t('Which version of the app this device runs. After an update has been put online: close the app and open it again.');
  }

  async renderProjectList() {
    const list = (await DB.all('projects')).map(migrateProject).sort((a, b) => b.updated - a.updated);
    const el = $('#project-list');
    el.textContent = '';
    $('#project-count').textContent = list.length ? `${list.length} on this device` : '';
    if (!list.length) {
      el.appendChild(h('div', { class: 'empty-projects', style: { gridColumn: '1 / -1' } },
        h('strong', null, 'No projects on this device yet'),
        h('span', null, 'Start a new project, open the example, or import a house file someone sent you or the builder\'s IFC model.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => this.newProjectDialog() }, icon('plus'), 'New project'),
          h('button', { class: 'btn', onclick: () => this.openExample() }, icon('home'), 'Example house'),
          h('button', { class: 'btn', onclick: () => this.importFlow() }, icon('upload'), 'Import file'))));
      return;
    }
    for (const p of list) el.appendChild(this.projectCard(p));
  }

  projectCard(p) {
    const plans = p.versions.filter(v => v.kind !== 'original' && v.status !== 'disabled');
    const active = getVersion(p, p.activeVersionId) || getOriginal(p);
    const open = () => this.openProject(p.id);
    const more = h('button', { class: 'btn ghost icon sm', 'aria-label': 'More for ' + p.name }, icon('more'));
    more.onclick = () => UI.menu(more, [
      { label: 'Rename', icon: 'edit', fn: () => this.renameProject(p) },
      { label: 'Duplicate', icon: 'copy', fn: () => this.duplicateProject(p) },
      { label: 'Export', icon: 'share', fn: () => this.exportDialog(p) },
      '-',
      { label: 'Move to trash', icon: 'trash', danger: true, fn: () => this.deleteProject(p) },
    ]);
    return h('article', { class: 'pcard' },
      h('button', { class: 'pcard-thumb', onclick: open, 'aria-label': 'Open ' + p.name }, this.thumbnail(p, active)),
      h('div', { class: 'pcard-body' },
        h('div', { class: 'pcard-title', title: p.name }, p.name, p.viewer ? h('span', { class: 'badge viewer-badge' }, t('Viewer copy')) : null),
        h('div', { class: 'pcard-meta' },
          p.viewer && p.viewer.from ? h('span', null, t('from {n}', { n: p.viewer.from })) : null,
          h('span', null, `${p.storeys.length} storeys`),
          h('span', null, plans.length ? (plans.length > 1 ? t('{n} planned versions', { n: plans.length }) : t('1 planned version')) : t('Original only')),
          h('span', null, t('Changed {when}', { when: fmtAgo(p.updated) }))),
          this.exportedLine(p),
        h('div', { class: 'pcard-actions' },
          h('button', { class: 'btn primary sm', onclick: open }, 'Open'),
          h('button', { class: 'btn sm', onclick: () => this.exportDialog(p) }, icon('share'), 'Export'),
          more)));
  }

  thumbnail(p, version) {
    const plan = version.plan;
    const st = sortedStoreys(p).find(s => plan.walls.some(w => w.storey === s.id)) || sortedStoreys(p)[0];
    const svg = s('svg', { viewBox: '0 0 100 60', preserveAspectRatio: 'xMidYMid meet' });
    if (!st) return svg;
    const walls = plan.walls.filter(w => w.storey === st.id);
    const rooms = plan.rooms.filter(r => r.storey === st.id);
    const bb = bboxOfPoints([...walls.flatMap(w => [w.a, w.b]), ...rooms.flatMap(r => r.poly)]);
    if (!bb) { svg.appendChild(s('text', { x: 50, y: 33, 'text-anchor': 'middle', 'font-size': 5, fill: 'var(--ink-3)' }, 'Nothing drawn yet')); return svg; }
    const pad = Math.max(bb.w, bb.h) * 0.12 + 0.4;
    svg.setAttribute('viewBox', `${bb.minX - pad} ${bb.minY - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}`);
    for (const r of rooms) svg.appendChild(s('polygon', { points: r.poly.map(q => q.join(',')).join(' '), fill: r.floor.color, 'fill-opacity': 0.45 }));
    for (const w of walls) {
      const parts = wallParts(w, openingsOf(plan, w.id));
      for (const [a, b] of parts.solids) svg.appendChild(s('polygon', { points: wallPiecePoly(w, a, b, parts.L).map(q => q.join(',')).join(' '), fill: w.kind === 'exterior' ? 'var(--ink)' : 'var(--wall-int)' }));
    }
    return svg;
  }

  /** the projects page's storage line: protected from clean-up or not (task 0019, I4) */
  async renderStorageNote() {
    const el = $('#storage-note');
    let persisted = false, est = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { /* ignore */ }
    try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { /* ignore */ }
    const bad = !persisted || DB.memory;
    el.classList.toggle('warn', bad);
    el.dataset.protected = String(!!persisted && !DB.memory);
    const used = est && est.usage != null ? ' · ' + fmtBytes(est.usage) : '';
    const txt = el.querySelector('.txt');
    txt.textContent = DB.memory ? t('Storage is blocked in this browser. Export to keep your work.')
      : persisted ? t('Protected on this device') + used
        : t('Not protected – export a copy now and then') + used;
    let btn = el.querySelector('.sn-export');
    if (bad && !btn && !DB.memory) {
      btn = h('button', { class: 'btn ghost sm sn-export', onclick: () => this.exportFromHome() }, t('Export'));
      el.appendChild(btn);
    } else if (!bad && btn) btn.remove();
  }

  /** the storage line's Export button: the one house, or all of them */
  async exportFromHome() {
    const list = await DB.all('projects');
    if (list.length === 1) this.exportDialog(migrateProject(list[0])); else this.exportAll();
  }

  /* ───────── projects ───────── */
  async newProjectDialog() {
    const name = h('input', { class: 'input', id: 'np-name', value: 'Our house', autocomplete: 'off' });
    const storeys = h('textarea', { class: 'textarea', id: 'np-storeys', rows: 3, style: { minHeight: '84px' } });
    storeys.value = I18N.lang === 'no' ? '1. etasje\n2. etasje\n3. etasje' : 'Begane grond\n1e verdieping\n2e verdieping';
    const body = h('div', { class: 'dlg-body-inner', style: { display: 'grid', gap: '12px' } },
      h('div', { class: 'field' }, h('label', { for: 'np-name' }, 'Project name'), name),
      h('div', { class: 'field' }, h('label', { for: 'np-storeys' }, 'Storeys, from the bottom up (one per line)'), storeys),
      h('p', { class: 'note-muted' }, 'You can rename, add or remove storeys later.'));
    const ok = await UI.dialog({ title: 'New project', body, actions: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, kind: 'primary' }] });
    if (!ok) return;
    const names = storeys.value.split('\n').map(x => x.trim()).filter(Boolean);
    const p = newProject(name.value.trim() || 'Our house', names.length ? names : ['Ground floor']);
    await DB.put('projects', p);
    this.requestPersistence();
    await this.openProject(p.id);
    this.toast('Project created. Start by loading the drawing of each storey.');
  }

  async openExample() {
    let p;
    try { p = await buildExampleProject(); } catch (e) { this.toast(e.message || 'Could not open the example house.'); return; }
    await DB.put('projects', p);
    this.requestPersistence();
    await this.openProject(p.id);
  }

  async renameProject(pp) {
    const p = pp || this.project;
    const v = await UI.prompt({ title: 'Rename project', label: 'Name', value: p.name });
    if (v == null || !v.trim()) return;
    if (this.project && p.id === this.project.id) {
      this.mutate((proj) => { proj.name = v.trim(); }, { project: true });
      this.renderEditorChrome();
    } else {
      // the house as stored now (another window may have changed it since this list was drawn): only its name changes
      const cur = await DB.get('projects', p.id) || p;
      cur.name = v.trim(); cur.updated = Date.now();
      try { await DB.put('projects', cur); } catch (e) { this.toast(e.message || String(e), { ms: 6000 }); }
      this.renderProjectList();
    }
  }

  async duplicateProject(p) {
    const c = clone(p);
    c.id = uid('p_');
    c.name = p.name + ' (copy)';
    c.created = c.updated = Date.now();
    await DB.put('projects', c);
    this.toast('Duplicated.');
    this.renderProjectList();
  }

  async deleteProject(p) {
    const ok = await UI.confirm({ title: `Move “${p.name}” to the trash?`, message: 'You can restore it from the trash on the projects screen until you empty the trash.', confirmLabel: 'Move to trash', danger: true });
    if (!ok) return;
    const snaps = await Snapshots.list(p.id);
    await Trash.add('project', p.name, { project: p, snapshots: snaps }, p.id);
    for (const sn of snaps) await DB.del('snapshots', sn.id);
    await DB.del('projects', p.id);
    if (this.project && this.project.id === p.id) { this.project = null; Saver.detach(); await this.showHome(); }
    else this.renderProjectList();
    this.toast('Moved to trash.');
  }

  /** opts.takeOver: another copy of the app has this house open – this copy takes it over (task 0027) */
  async openProject(id, opts = {}) {
    let p = await DB.get('projects', id);
    if (!p) { this.toast('That project is no longer on this device.'); return this.showHome(); }
    if (this.project) await this.closeProject(true);
    // one copy of the app writes a house at a time; the other shows it and saves nothing until it takes over
    const writes = await Saver.claim(id, !!opts.takeOver);
    if (opts.takeOver) {
      // what the other copy wrote last (a write it had started may still land: a moment's wait)
      await new Promise(r => setTimeout(r, 300));
      p = await DB.get('projects', id) || p;
    }
    migrateProject(p);
    this.project = p;
    Saver.attach(p, { readonly: !writes });
    this.loadProjectView(p);
    this.undoStack = []; this.redoStack = [];
    // files a house's own data brings along (documents) onto this device, then everything it uses into memory
    if (typeof docsEnsureFiles === 'function') await docsEnsureFiles(p);
    await Assets.ensure(assetIdsOf(p));
    this.shell = p.shell ? Assets.shell(p.shell.assetId) : null;
    try { localStorage.setItem('house-planner.last', id); } catch (e) { /* ignore */ }
    if (this.settings.lastProject !== id) Settings.set('lastProject', id);
    if (!this._persistAsked) { this._persistAsked = true; this.requestPersistence(); }
    const ui = this.loadUi(id);
    const storeys = sortedStoreys(p);
    const hasPlans = p.versions.some(v => v.kind !== 'original');
    this.view = { dim: ui.dim || '2d', scope: ui.scope || 'storey', storeyId: ui.storeyId && getStorey(p, ui.storeyId) ? ui.storeyId : (storeys[0] && storeys[0].id) };
    if (this.view.scope === 'house' && this.view.dim === '2d') this.view.scope = 'side';
    // a house opens on its planned version (the original and the changes are one tap away)
    this.display = hasPlans ? 'plan' : 'original';
    this.selection = null; this.tool = 'select'; this.sideBySide = false; this.swipe = false; this.compareBaseId = null; this.compareShownId = null;
    this.comparePair = Array.isArray(ui.pair) ? ui.pair : null;
    this.mode = ['build', 'furnish', 'view'].includes(ui.mode) ? ui.mode : 'build';
    // a copy to look at (Export for viewing) only has View
    if (p.viewer) this.mode = 'view';
    this.furnCompare = null; this.spaceCheck = null;
    if (this.walking) this.stopWalk(true);
    this.inspOpen = false;
    $('#home').hidden = true;
    $('#editor').hidden = false;
    document.title = p.name + ' — House Planner';
    this.layoutKey = null;
    this.layoutProject = null;
    this.renderEditorChrome();
    this.setupPanes(true);
    this.renderInspector();
    clearTimeout(this._remindT);
    this._remindT = setTimeout(() => { if (this.project === p) this.backupReminder(); }, 2500);
  }

  async closeProject(keepHome) {
    await Saver.flushNow();
    for (const pane of this.panes) pane.view.destroy();
    this.panes = [];
    this.layoutKey = null;
    this.project = null;
    this.shell = null;
    Saver.detach();
    $('#stage').textContent = '';
  }

  loadUi(id) { try { return JSON.parse(localStorage.getItem('house-planner.ui.' + id) || '{}'); } catch (e) { return {}; } }
  saveUi() {
    if (!this.project) return;
    try { localStorage.setItem('house-planner.ui.' + this.project.id, JSON.stringify({ dim: this.view.dim, scope: this.view.scope, storeyId: this.view.storeyId, display: this.display, mode: this.mode, pair: this.comparePair || undefined })); } catch (e) { /* ignore */ }
  }

  /* ───────── versions ───────── */
  planVersions() { return this.project.versions.filter(v => v.kind !== 'original'); }
  shownVersion() {
    const p = this.project;
    if (!p) return null;
    // side by side (Build / View): the right side can show any version, the open one stays open
    if (this.sideBySide && this.mode !== 'furnish' && this.compareShownId) { const c = getVersion(p, this.compareShownId); if (c) return c; }
    if (this.display === 'original') return getOriginal(p);
    return getVersion(p, p.activeVersionId) || getOriginal(p);
  }
  baseVersion() {
    const p = this.project;
    // furnish mode: the left side shows the version (and layout) picked for it
    if (this.mode === 'furnish' && this.comparing) return (this.furnCompare && getVersion(p, this.furnCompare.versionId)) || this.shownVersion();
    if (this.swipe) return getOriginal(p);
    const b = this.compareBaseId && getVersion(p, this.compareBaseId);
    const shown = this.shownVersion();
    if (b && shown && b.id === shown.id) return getOriginal(p).id === shown.id ? b : getOriginal(p);
    return b || getOriginal(p);
  }
  /** walls, doors, rooms … can only be changed in Build mode */
  canEdit() { const v = this.shownVersion(); return this.mode === 'build' && !!v && !v.locked && !this.comparing; }
  /** side by side or the compare slider: both show two versions, nothing can be edited */
  get comparing() { return this.sideBySide || this.swipe; }

  async ensurePlanVersion() {
    if (this.planVersions().length) return true;
    if (this.project.viewer) { this.toast(t('This copy only has the original.')); return false; }
    const ok = await UI.confirm({ title: 'Make a planned version?', message: 'Your plans go into a copy of the original, so the original stays exactly as delivered. The original will be locked; you can unlock it later if you need to fix the tracing.', confirmLabel: 'Make planned version' });
    if (!ok) return false;
    this.createVersionFrom(getOriginal(this.project).id, 'Plan 1');
    return true;
  }

  createVersionFrom(srcId, name) {
    let created = null;
    this.mutate(p => {
      const orig = getOriginal(p);
      if (!orig.locked && srcId === orig.id) orig.locked = true;
      created = duplicateVersion(p, srcId, name);
      p.activeVersionId = created.id;
    }, { project: true });
    this.display = 'plan';
    this.selection = null;
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(false);
    this.renderInspector();
    return created;
  }

  async setDisplay(mode) {
    if (!this.project) return;
    if ((mode === 'plan' || mode === 'diff') && !this.planVersions().length) {
      if (!(await this.ensurePlanVersion())) return;
    }
    const furn = this.mode === 'furnish';
    if (this.swipe && mode === 'original' && !furn) this.swipe = false;
    if (this.swipe && !furn && (mode === 'plan' || mode === 'diff')) Settings.set('swipeMode', mode);
    if (this.display === mode && mode !== 'diff') return;
    this.display = mode;
    if (mode !== 'diff' && !furn) this.sideBySide = false;
    if (this.selection && this.selection.readOnly) this.selection = null;
    if (this.tool !== 'select' && !this.canEdit()) this.setTool('select', true);
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(false);
    this.renderInspector();
  }

  setActiveVersion(id) {
    const p = this.project;
    const v = getVersion(p, id);
    if (!v) return;
    if (v.kind === 'original') { this.setDisplay('original'); return; }
    p.activeVersionId = id;
    Saver.markDirty();
    if (this.display === 'original') this.display = 'plan';
    if (this.compareBaseId === id) this.compareBaseId = null;
    this.compareShownId = null;
    this.selection = null;
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(false);
    this.renderInspector();
  }

  /** side by side with a pair: left and right version ids (none: the pair compared last in this house, else the
   *  Original on the left and the open version on the right) */
  toggleSideBySide(pair) {
    if (!this.sideBySide || pair) {
      const go = async () => {
        if (this.mode === 'furnish') this.startFurnCompare();
        else if (this.display !== 'diff') { await this.setDisplay('diff'); if (this.display !== 'diff') return; }
        if (this.mode !== 'furnish') this.choosePair(pair || this.comparePair);
        this.sideBySide = true;
        this.swipe = false;
        this.setTool('select', true);
        this.selection = null;
        this.renderEditorChrome(); this.setupPanes(true); this.renderInspector();
      };
      go();
    } else {
      this.sideBySide = false;
      this.compareShownId = null;
      this.renderEditorChrome(); this.setupPanes(true); this.renderInspector();
    }
  }

  /** the two versions side by side; a version that is gone (or both the same) falls back to Original | the open one */
  choosePair(pair) {
    const p = this.project, orig = getOriginal(p);
    const open = getVersion(p, p.activeVersionId) || orig;
    let [l, r] = (pair || []).map(id => id && getVersion(p, id));
    if (!r) r = open;
    if (!l || l.id === r.id) l = r.id === orig.id ? (this.planVersions()[0] || orig) : orig;
    this.compareBaseId = l.id;
    this.compareShownId = r.id === open.id && this.display !== 'original' ? null : r.id;
    this.comparePair = [l.id, r.id];
    this.saveUi();
  }

  /** a side's ▾: pick a version (the other side's version: the two swap) */
  pickPaneVersion(role, id) {
    const [l, r] = [this.baseVersion().id, this.shownVersion().id];
    let pair = role === 'base' ? [id, r] : [l, id];
    if (pair[0] === pair[1]) pair = [r, l];
    this.choosePair(pair);
    this.selection = null;
    this.renderEditorChrome(); this.refreshViews(false); this.renderInspector();
  }

  swapPanes() { this.pickPaneVersion('base', this.shownVersion().id); }

  paneVersionMenu(anchor, role) {
    const cur = role === 'base' ? this.baseVersion() : this.shownVersion();
    const show = !!this.settings.showDisabled;
    UI.menu(anchor, [{ heading: t(role === 'base' ? 'Left side' : 'Right side') },
      ...this.project.versions.filter(v => v.status !== 'disabled' || show || v.id === cur.id).map(v => ({
        label: v.name, icon: v.id === cur.id ? 'check' : (v.kind === 'original' ? 'lock' : 'blank'), fn: () => this.pickPaneVersion(role, v.id) }))], { alignLeft: true });
  }

  /** compare slider: Original on the left, Planned (or Changes) on the right, with a line to drag */
  async toggleSwipe() {
    if (this.swipe) {
      this.swipe = false;
      this.renderEditorChrome(); this.setupPanes(true); this.renderInspector();
      return;
    }
    if (this.mode === 'furnish') this.startFurnCompare();
    else {
      if (!this.planVersions().length && !(await this.ensurePlanVersion())) return;
      // Planned the first time, after that whichever was used last (Planned or Changes)
      this.display = this.settings.swipeMode === 'diff' ? 'diff' : 'plan';
    }
    this.swipe = true;
    this.sideBySide = false;
    this.setTool('select', true);
    this.selection = null;
    this.saveUi();
    this.renderEditorChrome(); this.setupPanes(true); this.renderInspector();
  }

  setSwipePos(x) {
    this.swipePos = clamp(x, 0, 1);
    const stage = $('#stage');
    stage.style.setProperty('--sw', (this.swipePos * 100).toFixed(2) + '%');
    const el = this.swipeEls;
    if (!el) return;
    el.bar.setAttribute('aria-valuenow', String(Math.round(this.swipePos * 100)));
    // the names next to the handle get the room there is on their side (and hide when there is none)
    const W = stage.clientWidth || 0;
    for (const [lab, room] of [[el.left, this.swipePos * W - 34], [el.right, (1 - this.swipePos) * W - 34]]) {
      lab.style.maxWidth = Math.max(0, room - 8) + 'px';
      lab.style.visibility = room < 56 ? 'hidden' : '';
    }
  }

  buildSwipeBar(stage) {
    const left = h('span', { class: 'sw-lab sw-left' }), right = h('span', { class: 'sw-lab sw-right' });
    const knob = h('div', { class: 'sw-knob' }, icon('swipearrows'));
    const bar = h('div', { class: 'swipe-bar', role: 'slider', tabindex: '0', 'aria-label': 'Compare line: drag left or right', 'aria-valuemin': '0', 'aria-valuemax': '100' },
      h('div', { class: 'sw-line' }), h('div', { class: 'sw-mid' }, left, knob, right));
    let drag = null;
    const at = e => { const r = stage.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
    bar.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      drag = { id: e.pointerId, dx: at(e) - this.swipePos };
      try { bar.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      bar.classList.add('dragging');
    });
    bar.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) this.setSwipePos(at(e) - drag.dx); });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; bar.classList.remove('dragging'); } };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bar.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.setSwipePos(this.swipePos - step); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.setSwipePos(this.swipePos + step); }
      else if (e.key === 'Home') { e.preventDefault(); this.setSwipePos(0); }
      else if (e.key === 'End') { e.preventDefault(); this.setSwipePos(1); }
    });
    stage.prepend(bar);
    this.swipeEls = { bar, left, right };
    this.setSwipePos(this.swipePos);
  }

  /* ───────── 3D home views (one per view: whole house, all storeys, each storey), saved in the project ───────── */
  homeKey() { return this.view.scope === 'storey' ? 'storey:' + this.view.storeyId : this.view.scope; }
  homeLabel() {
    if (this.view.scope === 'house') return 'Whole house';
    if (this.view.scope === 'side') return 'All storeys';
    const st = getStorey(this.project, this.view.storeyId);
    return st ? st.name : 'this storey';
  }
  setHomeView(cam) {
    if (!cam) return;
    const key = this.homeKey(), label = this.homeLabel();
    this.mutate(p => { p.homeViews = p.homeViews || {}; p.homeViews[key] = { ...cam, set: Date.now() }; }, { project: true });
    this.toast(`Home view set for ${label}.`, { action: { label: 'Undo', fn: () => this.undo() } });
  }
  resetHomeView() {
    const key = this.homeKey(), label = this.homeLabel();
    if (!(this.project.homeViews || {})[key]) return;
    this.mutate(p => { delete p.homeViews[key]; }, { project: true });
    for (const pane of this.panes) if (pane.kind === '3d') { if (pane.view.spec) pane.view.spec.homeView = null; pane.view.home(); }
    this.toast(`Home view for ${label} is back to the default.`, { action: { label: 'Undo', fn: () => this.undo() } });
  }

  setDim(dim) {
    if (this.view.dim === dim) return;
    this.view.dim = dim;
    if (dim === '2d' && this.view.scope === 'house') this.view.scope = 'side';
    if (dim === '3d') { this.setTool('select', true); }
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(true);
    this.renderInspector();
  }

  setScope(scope, storeyId) {
    this.view.scope = scope;
    if (storeyId) this.view.storeyId = storeyId;
    if (scope === 'house' && this.view.dim === '2d') this.view.dim = '3d';
    if (scope !== 'storey') this.setTool('select', true);
    if (this.selection && this.selection.storey && storeyId && this.selection.storey !== storeyId) this.selection = null;
    if (this.selection && scope === 'storey' && this.selection.type !== 'room') this.selection = null;
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(false);
    this.renderInspector();
  }

  /* ───────── chrome ───────── */
  renderEditorChrome() {
    const p = this.project;
    if (!p) return;
    $('#btn-project-name').textContent = p.name;
    const shown = this.shownVersion();
    const pill = $('#btn-version');
    pill.querySelector('.vp-kind').textContent = shown.kind === 'original' ? 'Original' : 'Version';
    pill.querySelector('.vp-name').textContent = shown.kind === 'original' ? (shown.locked ? 'Locked' : 'Editable') : shown.name;
    pill.setAttribute('aria-label', t('Versions') + ': ' + (shown.kind === 'original' ? t('Original') : shown.name));
    pill.title = pill.getAttribute('aria-label');
    for (const b of $$('#display-toggle button')) b.setAttribute('aria-pressed', String(b.dataset.mode === this.display));
    // phones: one button for original / planned / changes (and side by side, compare, home view)
    const dp = $('#btn-display');
    dp.textContent = '';
    dp.append(h('span', null, t({ original: 'Original', plan: 'Planned', diff: 'Changes' }[this.display] || 'Planned')), icon('chevron'));
    dp.classList.toggle('primary', !!(this.sideBySide || this.swipe));
    for (const b of $$('#dim-toggle button')) b.setAttribute('aria-pressed', String(b.dataset.dim === this.view.dim));
    const tabs = $('#storey-tabs');
    tabs.textContent = '';
    // the names in full, and short on phones (BG · 1e · 2e)
    const two = (long, short) => [h('span', { class: 'st-long' }, long), h('span', { class: 'st-short', 'aria-hidden': 'true' }, short)];
    for (const st of sortedStoreys(p)) {
      tabs.appendChild(h('button', { 'aria-pressed': String(this.view.scope === 'storey' && this.view.storeyId === st.id), title: st.name, onclick: () => this.setScope('storey', st.id) }, ...two(st.name, shortStoreyName(st.name))));
    }
    tabs.appendChild(h('button', { 'aria-pressed': String(this.view.scope === 'side'), title: 'All storeys next to each other', onclick: () => this.setScope('side') }, icon('layers'), ...two('All storeys', t('All'))));
    tabs.appendChild(h('button', { 'aria-pressed': String(this.view.scope === 'house'), title: 'The whole house in 3D', onclick: () => this.setScope('house') }, icon('cube'), ...two('Whole house', t('House'))));
    tabs.appendChild(h('button', { title: 'Storeys', 'aria-label': 'Edit storeys', onclick: () => this.storeysSheet() }, icon('edit')));
    $('#btn-compare').setAttribute('aria-pressed', String(this.sideBySide));
    $('#btn-compare').classList.toggle('primary', this.sideBySide);
    $('#btn-swipe').setAttribute('aria-pressed', String(this.swipe));
    $('#btn-swipe').classList.toggle('primary', this.swipe);
    for (const b of $$('#mode-switch button')) b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode));
    document.body.dataset.mode = this.mode;
    // a viewer copy: View only, and Export becomes "Send notes back"
    const viewer = !!p.viewer;
    if (viewer) document.body.dataset.viewer = '1'; else delete document.body.dataset.viewer;
    const share = $('#btn-share');
    if (share.dataset.viewer !== String(viewer)) {
      share.dataset.viewer = String(viewer);
      share.textContent = '';
      share.append(icon('share'), h('span', null, viewer ? t('Send notes back') : 'Export'));
      share.setAttribute('aria-label', viewer ? t('Send notes back') : t('Export'));
    }
    this.renderToolrail();
    this.renderSaveStatus();
  }

  /** phones: Original / Planned / Changes, side by side, compare and the home view in one menu */
  displayMenu(anchor) {
    const tick = on => (on ? 'check' : null);
    UI.menu(anchor, [
      ...[['original', 'Original'], ['plan', 'Planned'], ['diff', 'Changes']].map(([m, lab]) => ({ label: t(lab), icon: tick(this.display === m) || 'blank', fn: () => this.setDisplay(m) })),
      '-',
      { label: t('Side by side'), icon: this.sideBySide ? 'check' : 'split', fn: () => this.toggleSideBySide() },
      { label: t('Compare'), icon: this.swipe ? 'check' : 'swipe', fn: () => this.toggleSwipe() },
      { label: t('Home view'), icon: 'fit', fn: () => this.fitViews() },
    ], { alignLeft: true });
  }

  /** phones: the bars above the drawing step aside while you pan, zoom or draw in 2D, and come back after; a thin strip
      of the top bar stays: tap it or pull it down to have them back at once. Computers (and wide screens) always show them. */
  barsWire() {
    const pull = $('#bars-pull');
    if (pull) {
      pull.setAttribute('aria-label', t('Show the bars')); pull.title = t('Show the bars');
      let y0 = null;
      pull.addEventListener('pointerdown', e => { y0 = e.clientY; e.stopPropagation(); });
      pull.addEventListener('pointermove', e => { if (y0 != null && e.clientY - y0 > 8) { y0 = null; this.barsBack(); } });
      pull.addEventListener('pointerup', () => { y0 = null; });
      pull.addEventListener('click', () => this.barsBack());
    }
    // every finger on the screen, wherever it is: when the last one lifts, the bars come back (also when the drawing
    // never saw it lift – a new first finger means none of the earlier ones is still down)
    const down = new Set();
    window.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; if (e.isPrimary) down.clear(); down.add(e.pointerId); }, true);
    const up = e => { if (!down.delete(e.pointerId) || down.size) return; if (document.querySelector('#editor.bars-away')) this.barsAway(false); };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }
  barsBack() {
    clearTimeout(this._barsT);
    const ed = $('#editor');
    // side by side on a turned phone: the handle opens the bars (they stay open until side by side closes or the phone is turned upright)
    if (ed && ed.classList.contains('bars-slim')) { this.slimOpen = true; this.syncSlimBars(); return; }
    this.setBarsAway(false);
  }
  /** side by side on a turned phone (low and wide): the top bars fold to a thin strip with a handle, so each side gets height */
  syncSlimBars() {
    const ed = $('#editor');
    if (!ed) return;
    const slim = !!this.sideBySide && this.view.dim === '2d' && window.matchMedia('(orientation: landscape) and (max-height: 520px) and (max-width: 1000px)').matches;
    if (!slim) this.slimOpen = false;
    ed.classList.toggle('bars-slim', slim && !this.slimOpen);
    ed.classList.toggle('bars-slim-open', slim && !!this.slimOpen);
  }
  barsAway(on) {
    const ed = $('#editor');
    clearTimeout(this._barsT);
    if (!on) { this._barsT = setTimeout(() => this.setBarsAway(false), 1400); return; }
    if (!window.matchMedia('(max-width: 600px) and (pointer: coarse)').matches || this.view.dim !== '2d' || !ed) return;
    this.setBarsAway(true);
  }
  setBarsAway(on) {
    const ed = $('#editor'), stage = $('#stage');
    if (!ed || !stage || ed.classList.contains('bars-away') === on) return;
    const top0 = stage.getBoundingClientRect().top;
    ed.classList.toggle('bars-away', on);
    const dy = top0 - stage.getBoundingClientRect().top;
    // the drawing stays where it is on the screen (the stage grew or shrank at the top)
    if (dy) for (const pn of this.panes) if (pn.kind === '2d' && pn.view && pn.view.cam) {
      const v = pn.view, g = v.gesture;
      v.cam.ty += dy;
      // a gesture that is going on: its screen points move with the drawing area
      if (g) { if (g.sp) g.sp = [g.sp[0], g.sp[1] + dy]; if (g.mid) g.mid = [g.mid[0], g.mid[1] + dy]; if (g.cam) g.cam = { ...g.cam, ty: g.cam.ty + dy }; }
      if (v.pointers) for (const pt of v.pointers.values()) if (pt.sp) pt.sp = [pt.sp[0], pt.sp[1] + dy];
      v.updateSize();
    }
  }

  /** take the open house over from the other copy of the app that has it: read again from storage, then write it here */
  async takeOver() {
    const p = this.project;
    if (!p) return;
    await Saver.keepUnsaved();
    await this.openProject(p.id, { takeOver: true });
    if (Saver.readonly) this.toast(t('The other window still has this house. Close it there, then try again.'), { ms: 6000 });
    else this.toast(t('This window saves the house now.'));
  }

  async writerFree(id) {
    await Saver.keepUnsaved();
    await this.openProject(id);
    if (!Saver.readonly) this.toast(t('This window saves the house now.'));
  }

  /** the bar over the view when the open house is not being saved (task 0027): another copy writes it, or a save failed */
  renderSaveBar() {
    const old = document.getElementById('save-bar');
    const st = Saver.project ? Saver.state : 'idle';
    if (st !== 'elsewhere' && st !== 'error') { if (old) old.remove(); this._saveBarKey = null; this._savePrep = null; return; }
    if (old && this._savePrep) this._savePrep();
    const quota = Saver.lastError && /quota/i.test(Saver.lastError.name + ' ' + Saver.lastError.message);
    const longFail = st === 'error' && Saver.failures >= 3;
    const key = st + '|' + Saver.why + '|' + quota + '|' + longFail + '|' + (Saver.project && Saver.project.id);
    if (old && this._saveBarKey === key) return;
    if (old) old.remove();
    this._saveBarKey = key;
    let msg, btn;
    if (st === 'elsewhere') {
      msg = Saver.why === 'changed' ? t('This house was changed in another window – changes here are not saved.') : t('This house is open in another window – changes here are not saved.');
      btn = h('button', { class: 'btn sm primary', id: 'save-takeover', onclick: () => this.takeOver() }, t('Take over'));
    } else if (!longFail) {
      msg = (quota ? t('Not saved – this device is full.') : t('Not saved – the browser did not store the change.')) + ' ' + t('Trying again every 30 seconds.');
    } else {
      msg = t('Still not saved. Export a copy now so nothing is lost.');
      const p = Saver.project;
      // the file is made now: a phone's share sheet needs the tap itself (as the backup reminder)
      // (made again when the house changed since – the copy has everything up to the tap)
      let prep = null, at = 0;
      const make = () => { at = p.updated; try { prep = this.quickBackupPrep(p); prep.catch(() => {}); } catch (e) { prep = null; } };
      make();
      this._savePrep = debounce(() => { if (p.updated !== at && document.getElementById('save-export')) make(); }, 1500);
      btn = h('button', { class: 'btn sm primary', id: 'save-export', onclick: () => { if (p.updated !== at) make(); this.quickBackup(p, prep); } }, t('Export now'));
    }
    const bar = h('div', { class: 'update-bar save-bar', id: 'save-bar', role: 'alert', 'data-state': st }, h('span', null, msg), btn || null);
    document.getElementById('app').appendChild(bar);
  }

  renderSaveStatus() {
    const el = $('#save-status');
    if (!el) return;
    const st = Saver.state;
    el.dataset.state = st;
    el.querySelector('.txt').textContent = st === 'saving' ? 'Saving…' : st === 'error' || st === 'elsewhere' ? 'Not saved' : st === 'memory' ? 'Not stored' : 'Saved';
    el.title = st === 'elsewhere' ? t('This house is open in another window – changes here are not saved.')
      : st === 'error' ? t('Not saved – the browser did not store the change.') + ' ' + t('Trying again every 30 seconds.')
      : st === 'memory' ? t('This browser blocks storage. Export to keep your work.') + ' ' + t('Tap for save points.')
      : (Saver.lastSaved ? t('Saved on this device at {t}.', { t: fmtTime(Saver.lastSaved) }) : t('Saved on this device.')) + ' ' + t('Autosave every 2 minutes; the last 10 are kept.') + ' ' + t('Tap for save points.');
  }

  renderToolrail() {
    const rail = $('#toolrail');
    if (!rail || !this.project) return;
    rail.textContent = '';
    if (this.mode !== 'build') { this.renderModeRail(rail); return; }
    const edit2d = this.view.dim === '2d' && this.view.scope === 'storey' && !this.comparing;
    const can = this.canEdit();
    const tools = [['select', 'Select', 'V'], ['wall', 'Wall', 'W'], ['door', 'Door', 'D'], ['window', 'Window', 'N'], ['room', 'Room', 'R'], ['measure', 'Measure', 'M'], ['opening', 'Opening', 'O'], ['install', t('Electrics'), 'E'], ['stair', t('Stair'), 'T'], ['void', t('Floor opening'), 'H'], ['garden', t('Garden'), 'G']];
    const box = h('div', { class: 'rail-tools' });
    if (edit2d) {
      for (const [id, label, key] of tools) {
        const disabled = !can && !['select', 'measure'].includes(id);
        box.appendChild(h('button', { class: 'tool', 'aria-pressed': String(this.tool === id), 'data-tool': id, disabled, title: `${label} (${key})`, 'aria-label': label, onclick: () => this.setTool(id) }, icon(id), h('span', { class: 'tl' }, label), h('span', { class: 'key' }, key)));
      }
    }
    rail.appendChild(box);
    const end = h('div', { class: 'rail-end' });
    if (edit2d) end.appendChild(h('div', { class: 'rail-sep' }));
    end.appendChild(h('button', { class: 'tool compact', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', disabled: !this.undoStack.length, onclick: () => this.undo() }, icon('undo'), h('span', { class: 'tl' }, 'Undo')));
    end.appendChild(h('button', { class: 'tool compact', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', disabled: !this.redoStack.length, onclick: () => this.redo() }, icon('redo'), h('span', { class: 'tl' }, 'Redo')));
    end.appendChild(this.historyButton());
    const isDiff = this.display === 'diff';
    end.appendChild(h('button', { class: 'tool mobile-only', 'aria-pressed': String(this.inspOpen), 'aria-label': isDiff ? 'Changes' : 'Details', onclick: () => this.toggleInspector() }, icon(isDiff ? 'layers' : 'info'), h('span', { class: 'tl' }, isDiff ? 'Changes' : 'Details')));
    rail.appendChild(end);
  }

  setTool(t, silent) {
    if (this.mode !== 'build') { this.setModeTool(t, silent); return; }
    if (t !== 'select' && t !== 'measure' && !this.canEdit()) { if (!silent) this.lockedNotice(); return; }
    if (t !== 'select' && (this.view.dim !== '2d' || this.view.scope !== 'storey')) { if (silent) t = 'select'; else { this.view.dim = '2d'; this.view.scope = 'storey'; this.renderEditorChrome(); this.setupPanes(true); } }
    // the garden is drawn on the ground floor: go there, and show the whole plot
    if (t === 'garden' && !silent) {
      const low = lowestStorey(this.project);
      if (low && this.view.storeyId !== low.id) { this.view.storeyId = low.id; this.renderEditorChrome(); this.setupPanes(true); }
      setTimeout(() => { for (const pane of this.panes) if (pane.kind === '2d' && pane.view.fitPlot) pane.view.fitPlot(false); }, 60);
    }
    for (const pane of this.panes) if (pane.kind === '2d') { pane.view.cancelChain(); pane.view.stairStart = null; pane.el.dataset.tool = t; }
    const was = this.tool;
    this.tool = t;
    // the Electrics tool shows every point, also when Electrics or Ceiling is switched off in the View menu
    if ((t === 'install') !== (was === 'install') && (this.settings.installs === false || !ceilShown(this.settings))) this.refreshViews(false);
    if (t !== 'select' && this.selection && this.selection.type !== 'room') { /* keep */ }
    this.renderToolrail();
    this.renderStageOverlays();
    if (!silent) for (const pane of this.panes) if (pane.kind === '2d') pane.view.drawOverlay();
  }

  lockedNotice() {
    const v = this.shownVersion();
    if (this.sideBySide) { this.toast('Close side by side to edit.'); return; }
    if (this.swipe) { this.toast('Close compare to edit.'); return; }
    if (v && v.kind === 'original') this.toast('The original is locked. Make a planned version, or unlock it from the versions list.', { action: { label: 'Versions', fn: () => this.versionsSheet() } });
    else this.toast('This version is locked.');
  }

  toggleInspector(force) {
    this.inspOpen = force != null ? force : !this.inspOpen;
    $('#inspector').classList.toggle('open', this.inspOpen);
    this.renderToolrail();
    this.updateInsets();
  }

  /** Phones: the details sheet (bottom) and an open menu (top) cover part of the drawing. Tell the views, so they
   *  move the house into the part that is still free (and a selected room with it). */
  updateInsets() {
    const stage = $('#stage');
    if (!stage || !this.panes) return;
    const sr = stage.getBoundingClientRect();
    let top = 0, bottom = 0;
    if (window.matchMedia('(max-width: 860px)').matches && sr.height) {
      const insp = $('#inspector');
      if (this.inspOpen && insp && getComputedStyle(insp).position === 'fixed') bottom = Math.max(0, sr.bottom - (window.innerHeight - insp.offsetHeight));
      const menu = document.querySelector('.menu');
      if (menu) { const mr = menu.getBoundingClientRect(); if (mr.bottom > sr.top && mr.top < sr.top + sr.height / 2) top = Math.max(0, Math.min(mr.bottom, sr.bottom) - sr.top); }
      const cap = sr.height * 0.72;
      top = Math.min(top, cap); bottom = Math.min(bottom, cap);
    }
    // things at the bottom of the view (slice panel, legend) move up above the sheet
    stage.style.setProperty('--inset-b', bottom + 'px');
    const key = top + '|' + bottom;
    const sel = this.selection, target = sel && (sel.type === 'room' || sel.type === 'furn') && this.view.scope === 'storey' ? this.selectionTarget() : null;
    // a selected room or piece of furniture stays in view
    const focus = target && target.poly ? bboxOfPoints(target.poly) : Array.isArray(target) ? bboxOfPoints(target.flatMap(f => furnCorners(f))) : null;
    const fid = sel && (sel.id || (sel.ids && sel.ids.join(',')));
    if (key === this._insetKey && !(focus && this._insetFocus !== fid)) return;
    this._insetKey = key; this._insetFocus = fid;
    this.panes.forEach((pane, i) => { if (pane.view.setInsets) pane.view.setInsets(top, bottom, focus, i === 0 || pane.kind === '3d'); });
  }

  /* ───────── panes + views ───────── */
  setupPanes(fit) {
    const stage = $('#stage');
    const roles = this.comparing ? ['base', 'main'] : ['main'];
    const key = roles.join(',') + '|' + this.view.dim + '|' + (this.swipe ? 'swipe' : '');
    let keep = null;
    if (this.layoutKey !== key) {
      // only the layout changes (side by side / compare on or off): keep looking at the same spot
      const old = this.panes.find(p => p.role === 'main');
      if (old && old.kind === this.view.dim && this.layoutProject === (this.project && this.project.id) && old.view.viewState && !(this.sideBySide && this.view.dim === '2d')) keep = old.view.viewState();
      for (const pane of this.panes) pane.view.destroy();
      this.panes = [];
      stage.textContent = '';
      stage.classList.toggle('split', this.sideBySide);
      stage.classList.toggle('swipe', this.swipe);
      this.swipeEls = null;
      for (const role of roles) {
        const el = h('div', { class: 'pane', 'data-role': role, 'data-tool': this.tool });
        stage.appendChild(el);
        const view = this.view.dim === '2d' ? new PlanView(el, this) : new View3D(el, this);
        this.panes.push({ el, role, kind: this.view.dim, view });
      }
      if (this.panes.length === 2) { this.panes[0].view.link(this.panes[1].view); this.panes[1].view.link(this.panes[0].view); }
      this.overlayEl = h('div', { class: 'stage-top' });
      stage.appendChild(this.overlayEl);
      if (this._ovRO) this._ovRO.disconnect();
      // (the bars changing size, and the panes: a wider or narrower window moves the corner also when the bars keep their
      //  size – measured again once the panes have their final size)
      this._splitSize = null;
      if (window.ResizeObserver) { this._ovRO = new ResizeObserver(() => { this.overlayPush(); this.refitSplit(); }); this._ovRO.observe(this.overlayEl); for (const pn of this.panes) this._ovRO.observe(pn.el); }
      if (this.swipe) this.buildSwipeBar(stage);
      this.layoutKey = key;
      this.layoutProject = this.project && this.project.id;
      fit = true;
      this.lastFitKey = null;
    }
    const fresh = this.layoutKey !== this._insetLayout;
    this._insetLayout = this.layoutKey;
    if (fresh) this._insetKey = null;
    this.refreshViews(fit);
    if (keep) for (const pane of this.panes) if (pane.view.setViewState) pane.view.setViewState(keep);
    if (fresh) this.updateInsets();
    this.updatePip();
    this.syncSlimBars();
  }

  /** side by side in 2D: a new pane size (the phone turned, the window resized) fits both panes to the storey again */
  refitSplit() {
    if (!this.sideBySide || this.view.dim !== '2d' || this.panes.length !== 2) return;
    const r = this.panes[0].el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const key = Math.round(r.width) + 'x' + Math.round(r.height);
    if (this._splitSize && this._splitSize !== key) for (const pn of this.panes) { pn.view.updateSize(); pn.view.fit(); }
    this._splitSize = key;
  }

  fitViews() {
    for (const pane of this.panes) if (pane.view && pane.view.home) pane.view.home();
  }

  storeyBBox(plans, st, underlay) {
    const pts = [];
    for (const plan of plans) {
      for (const w of plan.walls) if (w.storey === st.id) pts.push(w.a, w.b);
      for (const r of plan.rooms) if (r.storey === st.id) pts.push(...r.poly);
    }
    if (underlay) { const u = this.underlaySpec(st); if (u) pts.push([u.x, u.y], [u.x + u.w, u.y + u.h]); }
    return bboxOfPoints(pts);
  }

  underlaySpec(st) {
    const u = this.project.underlays[st.id];
    if (!u || !this.settings.underlay || u.visible === false) return null;
    const a = Assets.get(u.assetId);
    if (!a) return null;
    return { url: a.url, x: u.x, y: u.y, w: a.w * u.mPerPx, h: a.h * u.mPerPx, opacity: u.opacity ?? 0.5 };
  }

  sideOffsets(plans) {
    const out = new Map();
    let x = 0;
    for (const st of sortedStoreys(this.project)) {
      const bb = this.storeyBBox(plans, st, false) || { minX: 0, minY: 0, maxX: 8, maxY: 8, w: 8, h: 8 };
      out.set(st.id, { offset: [x - bb.minX, 0], bbox: bb });
      x += bb.w + 3;
    }
    return out;
  }

  refreshViews(fit) {
    const p = this.project;
    if (!p) return;
    const fitKey = [this.view.dim, this.view.scope, this.view.storeyId, this.sideBySide, this.swipe].join('|');
    const doFit = fit || fitKey !== this.lastFitKey;
    this.lastFitKey = fitKey;
    const shown = this.shownVersion(), base = this.baseVersion();
    // the pair side by side is remembered for this house (also when the Changes details pick the left one)
    if (this.sideBySide && this.mode !== 'furnish' && (!this.comparePair || this.comparePair[0] !== base.id || this.comparePair[1] !== shown.id)) { this.comparePair = [base.id, shown.id]; this.saveUi(); }
    // after an edit: the 3D views may keep the storeys that did not change (reuse.js)
    const reuse = !!this._editRefresh; this._editRefresh = false;
    // only the furniture (or its selection) changed: the 3D views redo just the furniture
    const furnOnly = this._furnOnly; this._furnOnly = false;
    const diffOn = this.display === 'diff' && base && base.id !== shown.id;
    const diff = diffOn ? diffPlans(base.plan, shown.plan, p) : null;
    this.currentDiff = diff;
    const refPlans = [getOriginal(p).plan, shown.plan, base.plan];
    const storeys = sortedStoreys(p);
    const st = getStorey(p, this.view.storeyId) || storeys[0];
    for (const pane of this.panes) {
      const isBase = pane.role === 'base';
      const v = isBase ? base : shown;
      const paneDiff = isBase ? null : diff;
      const edit = !isBase && !this.comparing;
      pane.el.dataset.tool = this.tool;
      // furniture, note pins and walking paths of each storey (the left side can show another layout)
      const ex = s2 => this.entryExtras(s2, pane.role, v);
      if (pane.kind === '2d') {
        const entries = [];
        if (this.view.scope === 'storey' && st) {
          const idx = storeys.indexOf(st);
          if (this.settings.ghost && idx > 0) entries.push({ storey: storeys[idx - 1], plan: v.plan, offset: [0, 0], wallsOnly: true });
          entries.push({ storey: st, plan: v.plan, offset: [0, 0], edit, underlay: this.underlaySpec(st), diff: paneDiff, basePlan: base.plan, bbox: this.storeyBBox(refPlans, st, true), versionId: v.id, fixtures: this.shell && this.shell.fixtures2d[st.id], ...ex(st), ...this.gardenEntryProps(st, v) });
        } else {
          const offs = this.sideOffsets(refPlans);
          for (const s2 of storeys) {
            const o = offs.get(s2.id);
            entries.push({ storey: s2, plan: v.plan, offset: o.offset, bbox: o.bbox, diff: paneDiff, basePlan: base.plan, label: s2.name, versionId: v.id, edit: false, fixtures: this.shell && this.shell.fixtures2d[s2.id], ...ex(s2) });
          }
        }
        const kindLabel = isBase ? (base.kind === 'original' ? 'Original' : 'Compare') : (v.kind === 'original' ? 'Original' : (this.display === 'diff' ? 'Changes' : 'Version'));
        pane.view.setSpec({
          entries,
          editable: edit && this.canEdit() && this.view.scope === 'storey',
          selection: this.selection,
          colorBy: this.settings.colorBy, labels: this.settings.labels, dims: this.settings.dims,
          mode: this.mode, tool: this.tool, furnEdit: edit && this.mode === 'furnish' && this.view.scope === 'storey', spaceCheck: !isBase ? this.spaceCheckFor(v) : null,
          stamp: { kind: kindLabel, version: v.kind === 'original' ? v.name : v.name, storey: this.view.scope === 'storey' ? st.name : 'All storeys' },
        });
        if (doFit) pane.view.fit();
      } else {
        const entries = [];
        if (this.view.scope === 'storey' && st) {
          entries.push({ storey: st, plan: v.plan, offset: [0, 0], y: 0, diff: paneDiff, basePlan: base.plan, versionId: v.id, edit, bbox: this.storeyBBox([v.plan], st, false), ...ex(st) });
        } else if (this.view.scope === 'side') {
          const offs = this.sideOffsets(refPlans);
          for (const s2 of storeys) { const o = offs.get(s2.id); entries.push({ storey: s2, plan: v.plan, offset: o.offset, y: 0, bbox: o.bbox, diff: paneDiff, basePlan: base.plan, versionId: v.id, edit, label: s2.name, ...ex(s2) }); }
        } else {
          const explode = this.walking ? 0 : (this.settings.explode || 0);
          storeys.forEach((s2, i) => entries.push({ storey: s2, plan: v.plan, offset: [0, 0], y: s2.elevation + explode * 3 * i, diff: paneDiff, basePlan: base.plan, versionId: v.id, edit, bbox: this.storeyBBox(refPlans, s2, false), label: s2.name, ...ex(s2) }));
        }
        const hs = this.houseSig(pane, v);
        const build = () => (pane.view._houseSig = hs, pane.view.build({
          entries, cut: !!this.settings.cut && !this.walking, ground: this.settings.ground !== false,
          mode: this.mode, light: this.settings.light === 'evening' ? 'evening' : 'day', ceilings: this.settings.ceilings !== false, walk: !!this.walking, plinth: this.settings.plinth !== false, windows: this.settings.windows !== false, outside: this.settings.outside !== false, roof: this.settings.roof !== false, floors: this.settings.floors !== false, shell: this.shell, origPlan: (getOriginal(p) || {}).plan || null, scope: this.view.scope, ...this.garden3d(entries, v), ...this.sunSpec(),
          sliceKey: [this.project.id, this.view.scope, this.view.scope === 'storey' ? this.view.storeyId : ''].join('|'),
          homeView: (this.project.homeViews || {})[this.homeKey()] || null, homeLabel: this.homeLabel(),
          labels: this.settings.labels && !this.walking && (this.view.scope !== 'house' || (this.settings.explode || 0) > 0.25),
          selection: this.selection, fitKey, reuse,
        }));
        // a build that was still waiting (from just before) must not come after this one
        if (doFit || !pane.buildLater) { if (pane.buildLater && pane.buildLater.cancel) pane.buildLater.cancel(); build(); pane.buildLater = debounce(() => {}, 0); }
        else if (furnOnly && pane.view.spec && pane.view._houseSig === hs) { pane.buildLater.cancel(); pane.view.spec.selection = this.selection; pane.view.updateFurniture(sid => ex(getStorey(p, sid)).furniture); }
        else { pane.buildLater.cancel(); pane.buildLater = debounce(build, 90); pane.buildLater(); }
      }
    }
    this.renderStageOverlays();
    this.refreshPip();
  }

  flushInvalidate() {
    if (!this.project) return;
    this.refreshViews(false);
    if (this._inspDirty) { this._inspDirty = false; this.renderInspector(); }
    this.renderToolrail();
  }
  invalidate(keepInspector) { if (!keepInspector) this._inspDirty = true; this._invalidate(); }

  renderStageOverlays() {
    const top = this.overlayEl;
    if (!top) return;
    top.textContent = '';
    const stage = $('#stage');
    stage.querySelectorAll('.legend, .stage-empty, .pane-label').forEach(e => e.remove());
    const p = this.project;
    const shown = this.shownVersion();
    const edit2d = this.view.dim === '2d' && this.view.scope === 'storey' && !this.comparing;
    const pane2d = this.panes.find(x => x.kind === '2d' && x.role === 'main');
    // picking points for a drawing
    if (this.picking) {
      top.appendChild(h('div', { class: 'banner' }, h('span', null, this.picking.text), h('button', { class: 'btn ghost sm', onclick: () => this.cancelPicking() }, 'Cancel')));
      return;
    }
    // furnish and view mode: their own bar (layout, snap, walking …)
    if (this.mode !== 'build') this.modeOverlays(top);
    if (edit2d && shown.locked && this.mode === 'build') {
      top.appendChild(h('div', { class: 'banner' }, icon('lock'),
        h('span', null, shown.kind === 'original' ? 'The original is locked, so it stays as delivered.' : 'This version is locked.'),
        shown.kind === 'original' && !this.planVersions().length ? h('button', { class: 'btn sm primary', onclick: () => this.setDisplay('plan') }, 'Make a planned version') : null,
        h('button', { class: 'btn ghost sm', onclick: () => this.toggleLock(shown) }, icon('unlock'), 'Unlock')));
    }
    if (edit2d && this.tool !== 'select' && this.mode === 'build') { const to = this.toolOptions(pane2d && pane2d.view); const pc = this.pipChip(); if (pc) to.insertBefore(pc, to.firstChild); top.appendChild(to); }
    else if (edit2d && this.mode === 'build' && !shown.locked && this.canEdit()) top.appendChild(h('div', { class: 'modebar build-bar' }, this.pipChip(), this.multiBuildChip(),
      this.clip && this.clip.kind === 'build' ? h('button', { class: 'btn sm', id: 'btn-paste', title: t('Paste (Ctrl+V)'), onclick: () => this.pasteClipboard() }, icon('dup'), h('span', { class: 'hide-xs' }, t('Paste'))) : null,
      this.multiBuild ? h('span', { class: 'hint' }, t('Tap things to add or remove them; drag to draw a box around more.')) : null));
    else if (edit2d && this.mode === 'build' && this.pipChip()) top.appendChild(h('div', { class: 'modebar build-bar' }, this.pipChip()));
    // the real sun: day and time
    // (also while walking: under the walking bar)
    if (this.settings.light !== 'sun') this._sunFold = false;   // (the sun bar is open each time the light is set to Sun)
    if (this.view.dim === '3d' && this.settings.light === 'sun') top.appendChild(this.sunBar());
    // legend for changes
    if (this.display === 'diff' && this.currentDiff) {
      const lg = h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'lg-new' }), 'New'),
        h('span', null, h('i', { class: 'lg-demo' }), 'Demolish'),
        h('span', null, h('i', { class: 'lg-room' }), 'Room changed'));
      const host = this.panes[this.panes.length - 1].el;
      lg.style.top = 'auto'; lg.style.bottom = this.view.dim === '2d' ? '40px' : '12px';
      host.appendChild(lg);
    } else if (this.display === 'diff' && !this.currentDiff) {
      top.appendChild(h('div', { class: 'banner' }, h('span', null, 'This version is the one it is compared with. Pick another version to compare.'), h('button', { class: 'btn ghost sm', onclick: () => this.versionsSheet() }, 'Versions')));
    }
    if (this.sideBySide) {
      const base = this.baseVersion();
      const lay = role => this.mode === 'furnish' ? ' · ' + ((role === 'base' ? this.layoutById(this.furnCompare && this.furnCompare.layoutId) : this.activeLayout()) || {}).name : '';
      if (this.mode === 'furnish') this.panes.forEach(pn => pn.el.appendChild(h('div', { class: 'pane-label' }, (pn.role === 'base' ? base.name : shown.name) + lay(pn.role))));
      else this.panes.forEach(pn => {
        // each side's name is a picker: any version, the Original included; ⇄ swaps the two
        const v = pn.role === 'base' ? base : shown;
        const pick = h('button', { class: 'pane-pick', 'data-role': pn.role, 'aria-haspopup': 'menu', title: t('Pick a version for this side') }, h('span', { class: 'pp-name' }, v.name), icon('chevron'));
        pick.onclick = () => this.paneVersionMenu(pick, pn.role);
        const swap = pn.role === 'base' ? h('button', { class: 'pane-swap', 'aria-label': t('Swap the two sides'), title: t('Swap the two sides'), onclick: () => this.swapPanes() }, icon('swipearrows')) : null;
        pn.el.appendChild(h('div', { class: 'pane-label pane-label-pick' }, pick, swap));
      });
    }
    if (this.swipe && this.mode === 'furnish') {
      if (this.swipeEls) {
        const { left, right } = this.swipeEls, L = this.layoutById(this.furnCompare && this.furnCompare.layoutId), R = this.activeLayout();
        left.textContent = L ? L.name : ''; right.textContent = R ? R.name : '';
        this.setSwipePos(this.swipePos);
      }
    } else if (this.swipe) {
      // which two are compared stays in view while the slider is on
      const pick = (mode, label) => h('button', { 'aria-pressed': String(this.display === mode), onclick: () => this.setDisplay(mode) }, label);
      top.appendChild(h('div', { class: 'swipe-pick' }, h('span', { class: 'sp-k' }, icon('swipe'), h('span', { class: 'sp-t' }, 'Original vs')),
        h('div', { class: 'seg' }, pick('plan', 'Planned'), pick('diff', 'Changes')),
        h('button', { class: 'btn ghost icon sm', 'aria-label': 'Close compare', title: 'Close compare', onclick: () => this.toggleSwipe() }, icon('close'))));
      if (this.swipeEls) {
        const { left, right } = this.swipeEls;
        left.textContent = 'Original'; left.title = this.baseVersion().name;
        right.textContent = this.display === 'diff' ? 'Changes' : 'Planned'; right.title = shown.name;
        this.setSwipePos(this.swipePos);
      }
    }
    // empty storey
    if (this.view.scope === 'storey' && !this.comparing && this.mode === 'build') {
      const st = getStorey(p, this.view.storeyId);
      const empty = st && !shown.plan.walls.some(w => w.storey === st.id) && !shown.plan.rooms.some(r => r.storey === st.id) && !p.underlays[st.id];
      if (empty && this.tool === 'select') {
        const box = h('div', { class: 'stage-empty' }, h('div', null,
          h('h3', null, `Nothing on ${st.name} yet`),
          h('p', null, 'Load the builder\'s drawing for this storey (PDF or photo) and trace over it, or start drawing walls straight away.'),
          h('div', { class: 'row' },
            shown.locked ? null : h('button', { class: 'btn primary', onclick: () => this.importDrawing(st.id) }, icon('image'), 'Load drawing'),
            shown.locked ? null : h('button', { class: 'btn', onclick: () => this.setTool('wall') }, icon('wall'), 'Draw walls'))));
        this.panes[0].el.appendChild(box);
      }
    }
    this.overlayPush();
  }

  /** the bars over the view (the sun bar on a phone, a long tool bar) may reach the top right corner, where the view
   *  cube and the Slice button are: then those move down below the bars (--ov-push on the pane), back up when the bars
   *  get shorter or are folded away */
  overlayPush() {
    const top = this.overlayEl;
    if (!top || !this.panes) return;
    for (const pn of this.panes) {
      const el = pn.el, pr = el.getBoundingClientRect();
      const corner = [el.querySelector(':scope > .viewcube'), el.querySelector(':scope > .slice-dock')].filter(x => x && x.offsetParent);
      if (!corner.length || !pr.width) { el.style.removeProperty('--ov-push'); continue; }
      const old = parseFloat(el.style.getPropertyValue('--ov-push')) || 0;
      // where the corner things are when not pushed
      let left = Infinity, cTop = Infinity;
      for (const c of corner) { const r = c.getBoundingClientRect(); left = Math.min(left, r.left); cTop = Math.min(cTop, r.top - pr.top - old); }
      let bottom = 0;
      for (const c of top.children) {
        const r = c.getBoundingClientRect();
        if (!r.width || !r.height || r.right <= left || r.left >= pr.right || r.bottom <= pr.top) continue;
        bottom = Math.max(bottom, r.bottom - pr.top);
      }
      const push = bottom > cTop - 4 ? Math.ceil(bottom + 6 - cTop) : 0;
      if (Math.abs(push - old) > 1) el.style.setProperty('--ov-push', push + 'px');
    }
  }

  toolOptions(view) {
    const t2 = tx;   // t is the tool's name here
    const o = this.toolOpts;
    const box = h('div', { class: 'toolopts' });
    const chip = (label, pressed, fn) => h('button', { class: 'chip', 'aria-pressed': String(!!pressed), onclick: () => { fn(); this.renderStageOverlays(); } }, label);
    const chain = view && view.chain;
    const t = this.tool;
    if (t === 'wall') {
      box.appendChild(h('span', { class: 'lbl' }, 'Wall'));
      for (const [mm, kind, label] of [[70, 'interior', '70'], [100, 'interior', '100'], [150, 'interior', '150'], [300, 'exterior', '300 outer']]) {
        box.appendChild(chip(label, Math.abs(o.wallT - mm / 1000) < 1e-6 && o.wallKind === kind, () => { o.wallT = mm / 1000; o.wallKind = kind; }));
      }
      box.appendChild(h('span', { class: 'hint' }, chain ? 'Tap the next corner. Tap the last point again to stop.' : 'Drag to draw a wall, or tap corner to corner.'));
      if (chain) box.appendChild(h('button', { class: 'btn sm primary', onclick: () => view.finishChain() }, icon('check'), 'Done'));
    } else if (t === 'door' || t === 'window' || t === 'opening') {
      const key = t === 'door' ? 'doorW' : t === 'window' ? 'winW' : 'gapW';
      const opts = t === 'door' ? [730, 830, 930, 1030] : t === 'window' ? [600, 900, 1200, 1800, 2400] : [800, 900, 1200, 2000];
      box.appendChild(h('span', { class: 'lbl' }, 'Width'));
      for (const mm of opts) box.appendChild(chip(String(mm), Math.abs(o[key] - mm / 1000) < 1e-6, () => { o[key] = mm / 1000; }));
      this.openingTypeChips(box, chip, t);
      box.appendChild(h('span', { class: 'hint' }, t === 'opening' ? 'Tap a wall to make an opening without a door.' : (t === 'door' ? 'Tap a wall to place the door.' : 'Tap a wall to place the window.')));
    } else if (t === 'room') {
      box.appendChild(chip('Tap inside walls', o.roomMode === 'auto' && !chain, () => { o.roomMode = 'auto'; view && view.cancelChain(); }));
      box.appendChild(chip('Draw corners', o.roomMode === 'draw' || chain, () => { o.roomMode = 'draw'; }));
      box.appendChild(h('span', { class: 'hint' }, chain ? 'Tap each corner. Tap the first corner to close.' : o.roomMode === 'auto' ? 'Tap inside an area closed by walls.' : 'Tap each corner of the room.'));
      if (chain) box.appendChild(h('button', { class: 'btn sm primary', disabled: chain.pts.length < 3, onclick: () => view.finishChain() }, icon('check'), 'Done'));
    } else if (t === 'install') {
      this.installOptions(box, chip);
    } else if (t === 'stair') {
      this.stairOptions(box, chip, view);
    } else if (t === 'garden') {
      this.gardenOptions(box, chip, view);
    } else if (t === 'void') {
      box.appendChild(h('span', { class: 'lbl' }, t2('Floor opening')));
      box.appendChild(h('button', { class: 'chip', id: 'void-all-chip', 'aria-pressed': String(o.voidAll !== false), title: t2('Put it in every version, the original too (it is part of the house as built)'), onclick: () => { o.voidAll = o.voidAll === false; this.renderStageOverlays(); } }, t2('All versions')));
      box.appendChild(h('span', { class: 'hint' }, chain ? t2('Now tap the opposite corner.') : t2('Tap one corner of the opening in the floor, then the opposite corner.')));
    } else if (t === 'measure') {
      box.appendChild(h('span', { class: 'hint' }, 'Tap two points to measure.'));
      if (view && view.measure) box.appendChild(h('button', { class: 'btn sm ghost', onclick: () => { view.measure = null; view.drawLabels(); this.renderStageOverlays(); } }, 'Clear'));
    }
    if (chain) box.appendChild(h('button', { class: 'btn sm ghost', onclick: () => view.cancelChain() }, 'Cancel'));
    box.appendChild(h('button', { class: 'btn sm ghost icon', 'aria-label': 'Back to select', title: 'Back to select (Esc)', onclick: () => this.setTool('select') }, icon('close')));
    return box;
  }

  /* ───────── selection + editing ───────── */
  select(sel) {
    // from one piece of furniture to another (or none): the 3D views only redo the furniture
    const isF = x => !x || x.type === 'furn';
    this._furnOnly = isF(sel) && isF(this.selection) && !!(sel || this.selection);
    if (sel && sel.type === 'room' && sel.storey && this.view.scope === 'storey' && sel.storey !== this.view.storeyId) {
      this.view.storeyId = sel.storey;
      this.renderEditorChrome();
      this.selection = sel;
      this.setupPanes(true);
    } else {
      const same = JSON.stringify(sel) === JSON.stringify(this.selection);
      this.selection = sel;
      if (!same) this.refreshViews(false);
    }
    this.renderInspector();
    if (window.matchMedia('(max-width: 860px)').matches) this.toggleInspector(!!sel || (this.inspOpen && !sel && false));
  }

  editPlan() { const v = this.shownVersion(); return v && !v.locked ? v.plan : null; }
  currentStorey() { return getStorey(this.project, this.view.storeyId); }

  mutate(fn, opts = {}) {
    const p = this.project;
    if (!p) return false;
    let target;
    if (opts.project) target = p;
    else {
      const v = this.shownVersion();
      if (p.viewer) { this.toast(t('This is a viewer copy: you can look around, walk through it and add notes.')); return false; }
      if (this.mode !== 'build') { this.toast(t('Switch to Build to change walls, doors and rooms.'), { action: { label: t('Build'), fn: () => this.setMode('build') } }); return false; }
      if (!v || v.locked || (this.comparing && !opts.allowSide)) { this.lockedNotice(); return false; }
      target = v.plan;
      v.updated = Date.now();
    }
    if (opts.gesture) { if (!this.inGesture) { this.pushUndo(); this.inGesture = true; } }
    else if (opts.coalesce) {
      const now = Date.now();
      if (this._co !== opts.coalesce || now - this._coT > 2500) this.pushUndo();
      this._co = opts.coalesce; this._coT = now;
    } else { this.pushUndo(); this._co = null; }
    fn(target, p);
    Saver.markDirty();
    // the next 3D build may keep the storeys this edit did not touch (reuse.js)
    this._editRefresh = true;
    this.invalidate(opts.keepInspector);
    return true;
  }
  beginGesture() { if (!this.inGesture) { this.pushUndo(); this.inGesture = true; } }
  endGesture() { this.inGesture = false; this._editRefresh = true; this.invalidate(); }

  pushUndo() {
    // (each step: the house as it was before, and when the change was made – history.js names it)
    const s = JSON.stringify(this.project);
    this.undoStack.push({ s, t: Date.now(), b: undoBytes(s) });
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack.length = 0;
    this.trimUndo();
  }
  /** the history is kept under a size (task 0027): oldest steps go first, the newest one always stays */
  trimUndo() {
    const cap = undoCap();
    const size = e => e.b || (e.b = undoBytes(e.s));
    let total = 0;
    for (const e of this.undoStack) total += size(e);
    for (const e of this.redoStack) total += size(e);
    while (total > cap && this.undoStack.length > 1) total -= size(this.undoStack.shift());
    return total;
  }
  undoSize() { let n = 0; for (const e of this.undoStack) n += e.b || (e.b = undoBytes(e.s)); for (const e of this.redoStack) n += e.b || (e.b = undoBytes(e.s)); return n; }
  restoreState(json, keepView) {
    const data = JSON.parse(json);
    const p = this.project;
    // undo / redo leave what is saved without an undo step alone: the shown version and layout, doors open or
    // closed, slices, view settings, a document page turned, a drawing's opacity (task 0027, audit finding 7)
    if (keepView) keepViewState(p, data);
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, data);
    p.updated = Date.now();
    Saver.markDirty();
    if (this.selection && !this.selectionTarget()) this.selection = null;
    const sameStorey = !!getStorey(p, this.view.storeyId);
    if (!sameStorey) this.view.storeyId = sortedStoreys(p)[0]?.id;
    this.renderEditorChrome();
    // undo / redo: the views stay (no new 3D views); they are drawn again, keeping the storeys that did not change
    if (sameStorey && this.panes.length) { this._editRefresh = true; this.refreshViews(false); this.renderToolrail(); }
    else this.setupPanes(false);
    this.renderInspector();
  }
  undo() { this.historyJump(1); }
  redo() { this.historyJump(-1); }
  /** n steps back (n > 0) or forward (n < 0) at once: the house is put back once, at the end */
  historyJump(n) {
    let cur = JSON.stringify(this.project), moved = 0;
    for (; n > 0 && this.undoStack.length; n--, moved++) { const e = this.undoStack.pop(); this.redoStack.push({ s: cur, t: e.t }); cur = e.s; }
    for (; n < 0 && this.redoStack.length; n++, moved++) { const e = this.redoStack.pop(); this.undoStack.push({ s: cur, t: e.t }); cur = e.s; }
    if (!moved) return;
    this.restoreState(cur, true);
    this._co = null;
  }

  selectionTarget() {
    const sel = this.selection;
    if (!sel || !this.project) return null;
    const v = sel.versionId ? getVersion(this.project, sel.versionId) : this.shownVersion();
    if (!v) return null;
    const plan = v.plan;
    if (sel.type === 'wall') return plan.walls.find(x => x.id === sel.id) || null;
    if (sel.type === 'opening') return plan.openings.find(x => x.id === sel.id) || null;
    if (sel.type === 'room') return plan.rooms.find(x => x.id === sel.id) || null;
    if (sel.type === 'furn') { const lay = this.activeLayout(); const items = lay ? lay.items.filter(f => sel.ids.includes(f.id)) : []; return items.length ? items : null; }
    if (sel.type === 'note') return (this.project.notes || []).find(n => n.id === sel.id) || null;
    if (sel.type === 'point') return (plan.points || []).find(x => x.id === sel.id) || null;
    if (sel.type === 'stair') return (plan.stairs || []).find(x => x.id === sel.id) || null;
    if (sel.type === 'void') return (plan.voids || []).find(x => x.id === sel.id) || null;
    if (sel.type === 'garea') return ((plan.garden && plan.garden.areas) || []).find(x => x.id === sel.id) || null;
    if (sel.type === 'gline') return ((plan.garden && plan.garden.lines) || []).find(x => x.id === sel.id) || null;
    if (sel.type === 'plant') return ((plan.garden && plan.garden.plants) || []).find(x => x.id === sel.id) || null;
    if (sel.type === 'plot') return this.project.site || null;
    if (sel.type === 'multi') { const items = sel.items.map(it => planItem(plan, it)).filter(Boolean); return items.length ? items : null; }
    return null;
  }

  addWall(a, b, t, kind) {
    const st = this.currentStorey();
    if (!st) return;
    this.mutate(plan => { plan.walls.push({ id: uid('w_'), storey: st.id, a: [...a], b: [...b], t: t || 0.1, kind: kind || 'interior', h: null }); });
  }

  addOpening(wallId, kind, pos, w) {
    const op = { id: uid('o_'), wall: wallId, kind, pos, w, h: kind === 'window' ? DEFAULTS.winH : DEFAULTS.doorH, sill: kind === 'window' ? DEFAULTS.winSill : 0, hinge: 'start', swing: 'left' };
    if (kind === 'window' && w >= 2.0) { op.sill = 0; op.h = 2.3; }
    if (kind === 'opening') op.h = DEFAULTS.doorH;
    // the type picked in the tool bar (hinged, sliding … / fixed, tilt-turn …)
    const o = this.toolOpts;
    if (kind === 'door' && o.doorStyle && o.doorStyle !== 'hinged') setOpeningStyle(op, o.doorStyle);
    if (kind === 'window' && o.winStyle && o.winStyle !== 'fixed') setOpeningStyle(op, o.winStyle);
    // in an outside wall of layers (inner leaf, insulation, brick) the opening goes through all of them
    let layers = 0;
    let load = false;
    if (this.mutate(plan => { plan.openings.push(op); layers = addAssemblyOpenings(plan, op).length; const w = plan.walls.find(x => x.id === wallId); load = !!(w && w.load === true); })) {
      this.select({ type: 'opening', id: op.id });
      if (load) this.toast(t('A load-bearing wall: an opening needs a lintel and the builder\'s approval – check with your builder.') + (layers ? ' ' + t('Made through the whole outside wall (also in the insulation and the brick).') : ''), { action: { label: t('Undo'), fn: () => this.undo() } });
      else if (layers) this.toast(t('Made through the whole outside wall (also in the insulation and the brick).'));
    }
  }

  addRoom(poly) {
    const st = this.currentStorey();
    const plan = this.editPlan();
    if (!st || !plan) return;
    const n = plan.rooms.filter(r => r.storey === st.id).length + 1;
    const room = { id: uid('r_'), storey: st.id, name: 'Room ' + n, poly: poly.map(p => [round(p[0], 0.001), round(p[1], 0.001)]), floor: { material: 'screed', color: '#B9B5AC' }, wallColor: WALL_FINISH_DEFAULT, wallColorName: '', notes: '', items: [] };
    if (polygonArea(room.poly) < 0) room.poly.reverse();
    if (this.mutate(pl => { pl.rooms.push(room); })) {
      this.select({ type: 'room', id: room.id });
      this.toast(`Room added (${fmtArea(roomArea(room))}). Give it a name in the details.`);
      setTimeout(() => { const el = $('#f-room-name'); if (el && !window.matchMedia('(max-width: 860px)').matches) { el.focus(); el.select(); } }, 60);
    }
  }

  deleteSelection(sure) {
    const sel = this.selection;
    if (!sel || sel.readOnly) return;
    // a load-bearing wall: ask first (the builder's IFC says it carries the floor or roof above)
    if (!sure && (sel.type === 'wall' || sel.type === 'multi')) {
      const plan = this.editPlan ? this.editPlan() : this.shownVersion().plan;
      const ids = sel.type === 'wall' ? [sel.id] : sel.items.filter(x => x.type === 'wall').map(x => x.id);
      const load = plan && plan.walls.filter(w => ids.includes(w.id) && w.load === true);
      if (load && load.length) {
        UI.confirm({ title: t('Delete a load-bearing wall?'), message: t('This wall carries the floor or roof above it (from the builder\'s IFC model). Taking it out needs a structural engineer, a steel beam or lintel and the builder\'s approval – check with your builder first. In the plan you can undo it.'), confirmLabel: t('Delete anyway'), danger: true })
          .then(ok => { if (ok) this.deleteSelection(true); });
        return;
      }
    }
    const label = { wall: 'Wall', opening: 'Opening', room: 'Room', point: t('Point'), stair: t('Stair'), multi: t('Selection'), garea: t('Area'), gline: t('Line'), plant: t('Plant'), void: t('Floor opening') }[sel.type];
    if (sel.type === 'plot') return;
    const ok = this.mutate(plan => {
      if (sel.type === 'multi') {
        const ids = k => new Set(sel.items.filter(x => x.type === k).map(x => x.id));
        const W = ids('wall'), R = ids('room'), O = withAssemblies(plan, [...ids('opening')]), P = ids('point'), S = ids('stair');
        plan.walls = plan.walls.filter(w => !W.has(w.id));
        plan.openings = plan.openings.filter(o => !O.has(o.id) && !W.has(o.wall));
        plan.rooms = plan.rooms.filter(r => !R.has(r.id));
        plan.points = (plan.points || []).filter(x => !P.has(x.id));
        plan.stairs = (plan.stairs || []).filter(x => !S.has(x.id));
      }
      if (sel.type === 'stair') plan.stairs = (plan.stairs || []).filter(x => x.id !== sel.id);
      if (sel.type === 'void') plan.voids = (plan.voids || []).filter(x => x.id !== sel.id);
      if (sel.type === 'wall') { plan.walls = plan.walls.filter(w => w.id !== sel.id); plan.openings = plan.openings.filter(o => o.wall !== sel.id); }
      if (sel.type === 'opening') withAssembly(plan, sel.id, pl => { pl.openings = pl.openings.filter(o => o.id !== sel.id); });
      if (sel.type === 'room') plan.rooms = plan.rooms.filter(r => r.id !== sel.id);
      if (sel.type === 'point') plan.points = (plan.points || []).filter(x => x.id !== sel.id);
      if (sel.type === 'garea' && plan.garden) plan.garden.areas = plan.garden.areas.filter(x => x.id !== sel.id);
      if (sel.type === 'gline' && plan.garden) plan.garden.lines = plan.garden.lines.filter(x => x.id !== sel.id);
      if (sel.type === 'plant' && plan.garden) plan.garden.plants = plan.garden.plants.filter(x => x.id !== sel.id);
    });
    if (ok) { this.selection = null; this.renderInspector(); this.toggleInspector(false); this.toast(label + ' deleted.', { action: { label: 'Undo', fn: () => this.undo() } }); }
  }

  toggleLock(v) {
    const p = this.project;
    const ver = getVersion(p, v.id);
    if (!ver) return;
    const run = () => {
      this.mutate(() => { ver.locked = !ver.locked; }, { project: true });
      if (ver.locked && this.tool !== 'select' && this.shownVersion() === ver) this.setTool('select', true);
      this.renderEditorChrome();
      this.refreshViews(false);
      this.renderInspector();
      this.toast(ver.locked ? `“${ver.name}” is locked.` : `“${ver.name}” can be edited now.`);
    };
    if (ver.locked && ver.kind === 'original') {
      UI.confirm({ title: 'Unlock the original?', message: 'Only do this to correct the tracing of the house as delivered. Your plans belong in a planned version.', confirmLabel: 'Unlock' }).then(ok => ok && run());
    } else run();
  }

  /* ───────── keyboard ───────── */
  onKey(e) {
    if (!this.project || !$('#home').hidden) return;
    if ($('#sheet-root').children.length) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { if (typing) return; e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && (e.key === 'h' || e.key === 'H') && this.project) { if (typing) return; e.preventDefault(); this.historySheet(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { if (typing) return; e.preventDefault(); this.redo(); return; }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.savePointDialog(); return; }
    if (mod && (e.key === 'k' || e.key === 'K') && this.project) { e.preventDefault(); this.searchOpen(); return; }
    if (typing) return;
    // the search box and the help
    if (!mod && !e.altKey && e.key === '/' && this.project) { e.preventDefault(); this.searchOpen(); return; }
    if (!mod && !e.altKey && (e.key === '?' || e.key === 'F1') && this.project) { e.preventDefault(); this.helpOverlay(); return; }
    const view = this.panes.find(p => p.kind === '2d' && p.role === 'main');
    // copy, paste, duplicate (Build and Furnish)
    if (mod && !e.shiftKey && (this.mode === 'build' || this.mode === 'furnish')) {
      const k0 = e.key.toLowerCase();
      if (k0 === 'c') { e.preventDefault(); this.copySelection(); return; }
      if (k0 === 'v') { e.preventDefault(); this.pasteClipboard(); return; }
      if (k0 === 'd' && this.mode === 'build') { e.preventDefault(); this.duplicateSelection(); return; }
    }
    if (this.walking && this.walkKey(e, true)) return;
    if (e.code === 'Space') { this.spaceDown = true; if (e.target === document.body) e.preventDefault(); return; }
    if (this.mode !== 'build' && this.modeKey(e, view && view.view)) return;
    if (e.key === 'Escape') {
      if (this.picking) { this.cancelPicking(); return; }
      if (view && (view.view.chain || view.view.measure)) { view.view.cancelChain(); this.renderStageOverlays(); return; }
      if (this.tool !== 'select') { this.setTool('select'); return; }
      if (this.multiBuild) { this.multiBuild = false; this.renderStageOverlays(); }
      if (this.selection) this.select(null);
      return;
    }
    if (e.key === 'Enter' && view && view.view.chain) { view.view.finishChain(); this.renderStageOverlays(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection) { e.preventDefault(); this.deleteSelection(); return; }
    if (this.selection && this.selection.type === 'multi' && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const st = e.shiftKey ? 0.1 : 0.01;
      this.nudgeSelection(e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0);
      return;
    }
    if (mod || e.altKey) return;
    const map = { v: 'select', w: 'wall', d: 'door', n: 'window', o: 'opening', r: 'room', m: 'measure', e: 'install', t: 'stair', h: 'void', g: 'garden' };
    const k = e.key.toLowerCase();
    if (map[k]) { this.setTool(map[k]); return; }
    if (k === 'f') { this.fitViews(); return; }
  }
})();

app.on('chain', () => app.renderStageOverlays());

/* ───────── undo history size (task 0027, audit finding 7) ─────────
   A step is the whole house as a JSON string: one byte a character in V8 while every character is Latin-1, two
   otherwise. Phones (touch, or 4 GB or less) keep 15 MB – his house is ~0.36 MB a step, so ~40 steps; the Pixel
   drops a tab in the background long before its 16 GB are used. Computers keep 60 MB. Never more than 80 steps. */
function undoBytes(s) { return s.length * (/[^\u0000-\u00ff]/.test(s) ? 2 : 1); }
function undoCap() {
  if (window.__hpUndoCap) return window.__hpUndoCap;    // tests
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = navigator.deviceMemory && navigator.deviceMemory <= 4;
  return (coarse || small ? 15 : 60) * 1024 * 1024;
}
/** copy what is saved without an undo step from the house as it is (cur) into the house undo brings back (data) */
function keepViewState(cur, data) {
  if (cur.activeVersionId && (data.versions || []).some(v => v.id === cur.activeVersionId)) data.activeVersionId = cur.activeVersionId;
  if (cur.furniture && data.furniture && (data.furniture.layouts || []).some(l => l.id === cur.furniture.activeLayoutId)) data.furniture.activeLayoutId = cur.furniture.activeLayoutId;
  for (const k of ['doorState', 'slices', 'viewSettings']) { if (cur[k] === undefined) delete data[k]; else data[k] = clone(cur[k]); }
  const docs = new Map((cur.docs || []).map(d => [d.id, d]));
  for (const d of data.docs || []) { const c = docs.get(d.id); if (!c) continue; if (c.rot === undefined) delete d.rot; else d.rot = c.rot; if (c.thumb !== undefined) d.thumb = c.thumb; }
  for (const [k, u] of Object.entries(data.underlays || {})) {
    const c = cur.underlays && cur.underlays[k];
    if (!u || !c) continue;
    for (const f of ['opacity', 'visible']) { if (c[f] === undefined) delete u[f]; else u[f] = c[f]; }
  }
}
