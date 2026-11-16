/* ───────────── share.js — "Export for viewing" and reading notes back ─────────────
   Owner: Export for viewing makes a copy of the house for family or suppliers, either
     • a page (.html): the whole app with the house inside, it opens in any browser, no install, or
     • a house file (.house.json) with a viewer mark, for someone who has House Planner.
   Viewer: the copy opens in View mode only (project.viewer = { sourceId, from, exported, title }, project id
     'v_' + the owner's id, so it never mixes with a house of their own). They look around, walk, and add notes
     (n.mine = true, n.by = their name); Send notes back writes a small notes file.
   Owner: Import a file → a notes file ({ format: 'house-planner-notes', projectId, from, notes, assets }) is
     merged into the house it belongs to (new notes added, changed ones updated); undo takes it back. */

const VIEWER_DATA_ID = 'hp-viewer-data';

Object.assign(app, {
  isViewer() { return !!(this.project && this.project.viewer); },

  /* ───────── owner: export for viewing ───────── */
  async viewerExportDialog(pp) {
    let p = pp || this.project;
    if (!p) return;
    if (this.project && p.id === this.project.id) { await Saver.flushNow(); p = this.project; }
    if (p.viewer) { this.toast(t('This is a viewer copy already; send your notes back instead.')); return; }
    migrateProject(p);
    const s = this.settings;
    const plans = p.versions.filter(v => v.kind !== 'original' && v.status !== 'disabled');
    const cur = getVersion(p, p.activeVersionId);
    const who = h('input', { class: 'input', id: 've-from', value: s.myName || '', placeholder: t('e.g. Alex'), autocomplete: 'name' });
    const verSel = h('select', { class: 'select', id: 've-ver' },
      ...plans.map(v => h('option', { value: v.id, selected: cur && cur.id === v.id }, v.name)),
      h('option', { value: '__orig', selected: !plans.length || !cur || cur.kind === 'original' }, t('Only the original')),
      plans.length > 1 ? h('option', { value: '__all' }, t('All versions')) : null);
    const lays = p.furniture.layouts;
    const laySel = h('select', { class: 'select', id: 've-lay' },
      ...lays.map(l => h('option', { value: l.id, selected: l.id === p.furniture.activeLayoutId }, l.name)),
      lays.length > 1 ? h('option', { value: '__all' }, t('All layouts')) : null,
      h('option', { value: '__none' }, t('No furniture')));
    const notesCb = h('input', { type: 'checkbox', id: 've-notes', checked: true });
    const drawCb = h('input', { type: 'checkbox', id: 've-draw' });
    const fmt = h('div', { class: 'seg wrap', role: 'radiogroup' });
    let format = 'html';
    const sizeEl = h('span', { class: 'num' }, '…');
    const paintFmt = () => {
      fmt.textContent = '';
      for (const [k, lab] of [['html', t('Page for any browser (.html)')], ['json', t('House file for the app (.house.json)')]]) fmt.appendChild(h('button', { role: 'radio', 'aria-checked': String(format === k), 'aria-pressed': String(format === k), 'data-fmt': k, onclick: () => { format = k; paintFmt(); prep(); } }, lab));
    };
    let built = null;
    const opts = () => ({ from: who.value.trim(), version: verSel.value, layout: laySel.value, notes: notesCb.checked, drawings: drawCb.checked });
    const prep = debounce(async () => {
      sizeEl.textContent = '…';
      built = await this.buildViewerFile(p, opts(), format);
      sizeEl.textContent = fmtBytes(built.blob.size);
    }, 120);
    for (const el of [who, verSel, laySel, notesCb, drawCb]) el.addEventListener('change', prep);
    paintFmt();
    const body = h('div', { style: { display: 'grid', gap: '12px' } },
      h('p', null, t('A copy of the house to look at, for family or suppliers. They can walk through it and add notes, and send their notes back to you. Nothing they do changes your house.')),
      h('div', { class: 'field' }, h('label', { for: 've-from' }, t('Your name (they see who sent it)')), who),
      h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', { for: 've-ver' }, t('Plan')), verSel), h('div', { class: 'field' }, h('label', { for: 've-lay' }, t('Furniture')), laySel)),
      h('label', { class: 'check', for: 've-notes' }, notesCb, h('span', null, t('Include the notes'))),
      h('label', { class: 'check', for: 've-draw' }, drawCb, h('span', null, t('Include the loaded drawings (PDF and photos under the plan)'))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('As')), fmt),
      h('div', { class: 'kv' }, h('dt', null, t('Size')), h('dd', null, sizeEl)),
      h('p', { class: 'note-muted' }, t('On a phone they open the page in the browser (Safari or Chrome), not in a preview. Their notes come into your house only when you import the notes file they send back.')));
    await new Promise(r => { prep(); setTimeout(r, 0); });
    const canShareFiles = !!(navigator.canShare && window.File);
    const choice = await UI.dialog({ title: t('Export for viewing'), body, wide: true, actions: [
      { label: t('Cancel'), value: null },
      { label: t('Save file'), value: 'save', icon: 'download', kind: canShareFiles ? '' : 'primary' },
      canShareFiles ? { label: t('Share…'), value: 'share', kind: 'primary', icon: 'share' } : null,
    ].filter(Boolean) });
    if (!choice) return;
    if (who.value.trim() !== (s.myName || '')) Settings.set('myName', who.value.trim());
    built = await this.buildViewerFile(p, opts(), format);
    if (choice === 'share') { if (await this.shareBlob(built.name, built.blob)) return; }
    this.downloadBlob(built.name, built.blob);
  },

  /** the viewer copy as data (the same format as an export, with a viewer mark) */
  async buildViewerData(p, o) {
    const c = clone(p);
    const orig = getOriginal(c);
    if (o.version === '__orig') { c.versions = [orig]; c.activeVersionId = orig.id; }
    else if (o.version !== '__all') { c.versions = c.versions.filter(v => v.kind === 'original' || v.id === o.version); c.activeVersionId = o.version; }
    else c.versions = c.versions.filter(v => v.kind === 'original' || v.status !== 'disabled');
    if (o.layout === '__none') { c.furniture.layouts = [{ id: uid('l_'), name: t('No furniture'), items: [], created: Date.now() }]; c.furniture.activeLayoutId = c.furniture.layouts[0].id; }
    else if (o.layout !== '__all') { c.furniture.layouts = c.furniture.layouts.filter(l => l.id === o.layout); c.furniture.activeLayoutId = o.layout; }
    c.furniture.sets = [];
    // your own 3D models: only those the furniture uses
    const used = new Set(c.furniture.layouts.flatMap(l => l.items.map(f => f.model)).filter(k => k && k.startsWith('u:')).map(k => k.slice(2)));
    c.models = Object.fromEntries(Object.entries(c.models || {}).filter(([id]) => used.has(id)));
    const vids = new Set(c.versions.map(v => v.id)), lids = new Set(c.furniture.layouts.map(l => l.id));
    c.notes = o.notes ? (c.notes || []).filter(n => (!n.versionId || vids.has(n.versionId)) && (!n.layoutId || lids.has(n.layoutId))).map(n => { const x = { ...n }; delete x.mine; return x; }) : [];
    if (!o.drawings) c.underlays = {};
    // what things cost stays at home, and so do the documents (quotes, drawings with your name)
    delete c.budget;
    delete c.docs;
    // baked light is far too big for a page to look at (task 0032), and the scenes sent to Fresing Render stay at home
    for (const v of c.versions) delete v.bake;
    delete c.hpScenes;
    const exported = Date.now();
    c.viewer = { sourceId: p.id, from: o.from || '', exported, title: p.name };
    const out = { format: 'house-planner', formatVersion: 1, exported, viewer: c.viewer, projects: [{ project: c, savePoints: [] }], assets: {} };
    for (const id of assetIdsOf(c)) {
      const a = await Assets.getRecord(id);
      if (a) out.assets[id] = a.kind === 'shell' ? { kind: 'shell', json: a.json } : { dataUrl: a.dataUrl, w: a.w, h: a.h, ...(a.kind ? { kind: a.kind } : {}) };
    }
    return out;
  },
  async buildViewerFile(p, o, format) {
    const data = await this.buildViewerData(p, o);
    const base = slugify(p.name) + '_' + t('viewer') + '_' + todayStamp();
    if (format === 'json') return { name: base + '.house.json', blob: new Blob([JSON.stringify(data)], { type: 'application/json' }) };
    // (made from the web version: the furniture models' geometry is in its library – the copy gets it inside)
    await modelPackB64();
    return { name: base + '.html', blob: new Blob([viewerPage(data)], { type: 'text/html' }) };
  },

  async shareBlob(fname, blob) {
    try {
      const f = new File([blob], fname, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: fname }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return true; console.warn('share failed', e); }
    this.toast(t('Sharing files is not supported here, so the file is saved instead.'));
    return false;
  },
  downloadBlob(fname, blob) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fname, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    this.toast(t('File saved: {n}', { n: fname }));
  },

  /** a viewer copy: the version pill only picks one of the versions in the copy */
  viewerVersionsMenu() {
    const p = this.project;
    const items = p.versions.filter(v => v.status !== 'disabled').map(v => ({ label: v.kind === 'original' ? t('Original') + ' · ' + v.name : v.name, icon: (v.kind === 'original' ? this.display === 'original' : this.display !== 'original' && p.activeVersionId === v.id) ? 'check' : 'layers',
      fn: () => this.setActiveVersion(v.id) }));
    UI.menu($('#btn-version'), items, { alignLeft: true });
  },

  /* ───────── viewer: opening a copy ───────── */
  /** the page itself carries a house (a viewer page): open it */
  async bootViewerPage() {
    const el = document.getElementById(VIEWER_DATA_ID);
    if (!el) return false;
    let data;
    try { data = JSON.parse(el.textContent); } catch (e) { this.toast(t('The house in this page could not be read.')); return false; }
    return this.openViewerData(data);
  },
  async openViewerData(data) {
    const entry = data && data.projects && data.projects[0];
    if (!entry || !data.viewer) return false;
    if (this.fileNewerToast(data)) return false;
    if (this.houseProblem(entry)) { this.toast(t('This copy of the house could not be used: it is damaged. Nothing was changed.')); return false; }
    const incoming = migrateProject(entry.project);
    const vid = 'v_' + data.viewer.sourceId;
    incoming.id = vid;
    incoming.viewer = { ...data.viewer };
    const existing = await DB.get('projects', vid);
    if (this.project && this.project.id === vid) await this.closeProject(true);
    for (const [id, a] of Object.entries(data.assets || {})) if (!(await Assets.getRecord(id))) await Assets.putRecord(a.kind === 'shell' ? { id, kind: 'shell', json: a.json, created: Date.now() } : { id, dataUrl: a.dataUrl, w: a.w, h: a.h, ...(a.kind ? { kind: a.kind } : {}), created: Date.now() });
    let fresh = true;
    if (existing && existing.viewer && existing.viewer.exported === incoming.viewer.exported) fresh = false;
    else if (existing) {
      // a newer copy of the same house: the house is replaced, your own notes, views and paths stay
      const ids = new Set(incoming.notes.map(n => n.id));
      incoming.notes.push(...(existing.notes || []).filter(n => n.mine && !ids.has(n.id)));
      if ((existing.viewpoints || []).length) incoming.viewpoints = existing.viewpoints;
      incoming.created = existing.created;
    }
    if (fresh) { incoming.updated = Date.now(); await DB.put('projects', incoming); }
    await this.openProject(vid);
    if (fresh) this.toast(existing ? t('A newer copy from {n}: the house is updated, your notes are kept.', { n: incoming.viewer.from || t('the owner') }) : t('Viewer copy opened. Look around, walk through it and add notes.'), { ms: 6000 });
    return true;
  },

  /* ───────── viewer: sending notes back ───────── */
  async sendNotesBack() {
    const p = this.project;
    if (!p || !p.viewer) return;
    await Saver.flushNow();
    const mine = (p.notes || []).filter(n => n.mine);
    if (!mine.length) { await UI.dialog({ title: t('Send notes back'), body: t('You have not added any notes yet. In View, tap “Note” and then the spot, or add a note to a room.'), actions: [{ label: t('OK'), value: true, kind: 'primary' }] }); return; }
    const who = h('input', { class: 'input', id: 'sn-name', value: this.settings.myName || '', placeholder: t('Your name'), autocomplete: 'name' });
    const body = h('div', { style: { display: 'grid', gap: '12px' } },
      h('p', null, t('{k} notes go into a small file. Send it to {n}; they import it and your notes appear in their house.', { k: mine.length, n: p.viewer.from || t('the owner') })),
      h('div', { class: 'field' }, h('label', { for: 'sn-name' }, t('Your name (shown with your notes)')), who));
    const canShareFiles = !!(navigator.canShare && window.File);
    const choice = await UI.dialog({ title: t('Send notes back'), body, actions: [
      { label: t('Cancel'), value: null },
      { label: t('Save file'), value: 'save', icon: 'download', kind: canShareFiles ? '' : 'primary', validate: () => { if (who.value.trim()) return true; who.focus(); this.toast(t('Fill in your name first.')); return false; } },
      canShareFiles ? { label: t('Share…'), value: 'share', kind: 'primary', icon: 'share', validate: () => { if (who.value.trim()) return true; who.focus(); this.toast(t('Fill in your name first.')); return false; } } : null,
    ].filter(Boolean) });
    if (!choice) return;
    const name = who.value.trim();
    if (name !== (this.settings.myName || '')) Settings.set('myName', name);
    // your name goes with your notes
    this.mutate(pp => { for (const n of pp.notes) if (n.mine) n.by = name; }, { project: true, keepInspector: true });
    const notes = this.project.notes.filter(n => n.mine).map(n => { const x = clone(n); delete x.mine; x.by = name; return x; });
    const out = { format: 'house-planner-notes', formatVersion: 1, projectId: p.viewer.sourceId, house: p.viewer.title || p.name, from: name, exported: Date.now(), viewerExported: p.viewer.exported, notes, assets: {} };
    for (const n of notes) for (const id of n.photos || []) { const a = await Assets.getRecord(id); if (a) out.assets[id] = { dataUrl: a.dataUrl, w: a.w, h: a.h }; }
    const fname = `${slugify(p.viewer.title || p.name)}_${t('notes')}_${slugify(name)}_${todayStamp()}.json`;
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    if (choice === 'share') { if (await this.shareBlob(fname, blob)) return; }
    this.downloadBlob(fname, blob);
  },

  /* ───────── owner: reading notes back ───────── */
  async importNotesFile(data) {
    const p0 = await DB.get('projects', data.projectId);
    if (!p0) { await UI.dialog({ title: t('Notes from {n}', { n: data.from || '?' }), body: t('These notes belong to “{h}”, which is not on this device.', { h: data.house || '?' }), actions: [{ label: t('OK'), value: true, kind: 'primary' }] }); return; }
    const have = new Map((p0.notes || []).map(n => [n.id, n]));
    const incoming = (data.notes || []).filter(n => n && n.id);
    const added = incoming.filter(n => !have.has(n.id));
    const changed = incoming.filter(n => have.has(n.id) && (n.updated || 0) > (have.get(n.id).updated || 0));
    if (!added.length && !changed.length) { this.toast(t('These notes are already in “{h}”.', { h: p0.name })); return; }
    const body = h('div', { style: { display: 'grid', gap: '10px' } },
      h('p', null, t('{n} sent notes for “{h}”.', { n: data.from || t('Someone'), h: p0.name })),
      h('dl', { class: 'kv' }, h('dt', null, t('New')), h('dd', { class: 'num' }, String(added.length)), h('dt', null, t('Changed')), h('dd', { class: 'num' }, String(changed.length)), h('dt', null, t('Sent')), h('dd', null, fmtDate(data.exported))),
      h('div', { class: 'note-list' }, ...[...added, ...changed].slice(0, 6).map(n => h('div', { class: 'note-row static' }, h('span', { class: 'nr-ic nt-' + n.type }, icon(NOTE_ICON[n.type] || 'note')), h('span', { class: 'nr-main' }, h('span', { class: 'nr-title' }, noteTitle(n)), h('span', { class: 'nr-where' }, noteTypeLabel(n.type)))))));
    const ok = await UI.dialog({ title: t('Notes from {n}', { n: data.from || '?' }), body, actions: [{ label: t('Cancel'), value: false }, { label: t('Add to the house'), value: true, kind: 'primary' }] });
    if (!ok) return;
    for (const [id, a] of Object.entries(data.assets || {})) if (!(await DB.get('assets', id))) await Assets.putRecord({ id, dataUrl: a.dataUrl, w: a.w, h: a.h, created: Date.now() });
    const apply = pp => {
      pp.notes = pp.notes || [];
      for (const n of added) { const x = clone(n); delete x.mine; x.by = x.by || data.from; x.photos = x.photos || []; pp.notes.push(x); }
      for (const n of changed) { const i = pp.notes.findIndex(x => x.id === n.id); if (i >= 0) { const x = clone(n); delete x.mine; x.by = x.by || data.from; pp.notes[i] = x; } }
    };
    if (!this.project || this.project.id !== p0.id) await this.openProject(p0.id);
    await Assets.ensure(assetIdsOf(this.project, false).concat(Object.keys(data.assets || {})));
    this.mutate(apply, { project: true });
    if (this.mode !== 'view') this.setMode('view');
    this.toast(t('{k} notes from {n} added.', { k: added.length + changed.length, n: data.from || t('someone') }), { action: { label: t('Undo'), fn: () => this.undo() } });
    this.notesSheet();
  },
});

/** the app as one page with a house inside (opened by bootViewerPage) */
function viewerPage(data) {
  if (!PRISTINE || !PRISTINE.script) throw new Error('The page could not be copied.');
  // "<" never appears as such inside the data, so the page can't be cut short
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return '<!doctype html>\n<html lang="' + PRISTINE.lang + '">\n<head>' + PRISTINE.head + '</head>\n<body>\n' + PRISTINE.app +
    '\n<script type="application/json" id="' + VIEWER_DATA_ID + '" data-lang="' + I18N.lang + '">' + json + '</script>\n<script>' + viewerScript(PRISTINE.script.textContent) + '</script>\n</body>\n</html>\n';
}
/** the app's script for a copy for viewing: without the big files of the house built into the app (its documents: a
 *  copy for viewing has no documents; they would only make it big and carry your drawings along unseen). build.py puts
 *  them between these two marks; HOUSE.viewerStub takes their place. */
function viewerScript(src) {
  if (MODELS.packB64) src = src.replace('const MODEL_LIB_BLOB = null;', () => "const MODEL_LIB_BLOB = '" + MODELS.packB64 + "';");
  const bar = '─'.repeat(9), a = '/* ' + bar + ' the big files of the house ' + bar + ' */', z = '/* ' + bar + ' end of the big files of the house ' + bar + ' */';
  const i = src.indexOf(a), j = i < 0 ? -1 : src.indexOf(z, i);
  return i < 0 || j < 0 ? src : src.slice(0, i) + HOUSE.viewerStub + src.slice(j + z.length);
}
