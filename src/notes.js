/* ───────────── notes.js — View mode: notes (pins in 2D and 3D, room notes, photos), the notes list,
   saved viewpoints, and the details panels of View mode ───────────── */

const NOTE_TYPES = [['question', 'Question'], ['todo', 'To do'], ['decision', 'Decision'], ['idea', 'Idea'], ['problem', 'Problem'], ['snag', 'Handover point']];
/* handover points (opleverpunten): found → reported to the builder → fixed → checked */
const SNAG_STATUS = [['open', 'Found'], ['reported', 'Reported'], ['fixed', 'Fixed'], ['done', 'Checked, OK']];
const snagStatusLabel = k => t((SNAG_STATUS.find(x => x[0] === k) || SNAG_STATUS[0])[1]);
const noteTypeLabel = k => t((NOTE_TYPES.find(x => x[0] === k) || NOTE_TYPES[1])[1]);
function noteTitle(n) {
  const first = String(n.text || '').trim().split('\n')[0];
  return first ? (first.length > 70 ? first.slice(0, 68) + '…' : first) : noteTypeLabel(n.type);
}

Object.assign(app, {
  /** notes that belong here: untagged ones, and those tagged with the version / layout on screen */
  visibleNotes() {
    const v = this.shownVersion(), lay = this.activeLayout();
    return (this.project.notes || []).filter(n => (!n.versionId || (v && n.versionId === v.id)) && (!n.layoutId || (lay && n.layoutId === lay.id)));
  },
  noteWhere(n) {
    const p = this.project;
    const st = n.at ? getStorey(p, n.at.storey) : n.room ? getStorey(p, n.storey) : null;
    let room = null;
    const plan = this.shownVersion().plan;
    if (n.room) room = plan.rooms.find(r => r.id === n.room);
    else if (n.at) room = plan.rooms.find(r => r.storey === n.at.storey && pointInPolygon([n.at.x, n.at.y], r.poly));
    return [room && room.name, st && st.name].filter(Boolean).join(' · ');
  },

  addNoteAt(pp, from3d) {
    const n = { id: uid('n_'), type: this._noteType || 'todo', status: 'open', text: '', created: Date.now(), updated: Date.now(), photos: [],
      at: { storey: pp.storey, x: pp.x, y: pp.y, h: from3d ? pp.h : null }, ...this.noteAuthor() };
    diaryInit(n);
    this.mutate(p => { numberSnag(p, n); p.notes.push(n); }, { project: true });
    if (this.tool === 'note') this.setTool('select', true);
    this.selectNote(n.id, true);
    this.toast(t('Note placed. Type it in the details; drag the pin in 2D to move it.'));
  },
  addRoomNote(room) {
    const n = { id: uid('n_'), type: this._noteType || 'todo', status: 'open', text: '', created: Date.now(), updated: Date.now(), photos: [], room: room.id, storey: room.storey, at: null, ...this.noteAuthor() };
    diaryInit(n);
    this.mutate(p => { numberSnag(p, n); p.notes.push(n); }, { project: true });
    this.selectNote(n.id, true);
  },
  /** in a viewer copy your notes are marked as yours (they go back with Send notes back) */
  noteAuthor() { return this.isViewer() ? { mine: true, ...(this.settings.myName ? { by: this.settings.myName } : {}) } : {}; },
  /** a viewer can change only the notes they made */
  noteLocked(n) { return this.comparing || (this.isViewer() && !n.mine); },
  selectNote(id, focus) {
    const n = (this.project.notes || []).find(x => x.id === id);
    if (!n) return;
    const sid = n.at ? n.at.storey : n.storey;
    if (sid && this.view.scope === 'storey' && this.view.storeyId !== sid) { this.view.storeyId = sid; this.renderEditorChrome(); this.selection = { type: 'note', id }; this.setupPanes(true); }
    this.select({ type: 'note', id });
    if (window.matchMedia('(max-width: 860px)').matches) this.toggleInspector(true);
    if (focus) setTimeout(() => { const el = $('#f-note-text'); if (el) el.focus(); }, 80);
  },
  updateNote(id, fn, coalesce) {
    this.mutate(p => { const n = p.notes.find(x => x.id === id); if (n) { fn(n); n.updated = Date.now(); numberSnag(p, n); } }, { project: true, keepInspector: !!coalesce, coalesce: coalesce ? coalesce + ':' + id : null });
  },
  /** set the status of a handover point; the date of each step is kept */
  setSnagStatus(id, st) {
    this.updateNote(id, n => { n.status = st; n.statusAt = n.statusAt || {}; if (st !== 'open') n.statusAt[st] = Date.now(); });
  },
  deleteNote(id) {
    if (!this.mutate(p => { p.notes = p.notes.filter(x => x.id !== id); }, { project: true })) return;
    if (this.selection && this.selection.type === 'note') this.selection = null;
    this.renderInspector();
    this.toast(t('Note deleted.'), { action: { label: 'Undo', fn: () => this.undo() } });
  },
  async addNotePhoto(id) {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const img = await loadImage(await readFileAs(file, 'dataurl'));
      // shrunk to at most 1600 px: about 200–400 kB in the house file
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cw = Math.round(img.naturalWidth * k), ch = Math.round(img.naturalHeight * k);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(img, 0, 0, cw, ch);
      const aid = await Assets.put(cv.toDataURL('image/jpeg', 0.8), cw, ch);
      this.updateNote(id, n => { n.photos.push(aid); });
    } catch (e) { console.error(e); this.toast(t('This picture could not be read.')); }
  },
  photoViewer(aid) {
    const a = Assets.get(aid);
    if (!a) return;
    UI.dialog({ title: t('Photo'), body: h('div', { class: 'photo-view' }, h('img', { src: a.url, alt: '' })), wide: true, actions: [{ label: t('Close'), value: null, kind: 'primary' }] });
  },

  notePanel(el, n) {
    const ro = this.noteLocked(n);
    this.inspHead(el, noteTitle(n), noteTypeLabel(n.type) + (this.noteWhere(n) ? ' · ' + this.noteWhere(n) : '') + (n.by ? ' · ' + t('from {n}', { n: n.by }) : ''));
    const head = el.querySelector('.insp-head h3');
    const sec = h('div', { class: 'insp-sec' });
    const types = h('div', { class: 'seg note-types' }, ...NOTE_TYPES.map(([k, lab]) => h('button', { class: 'nt-' + k, 'aria-pressed': String(n.type === k), disabled: ro, title: t(lab), onclick: () => { this._noteType = k; this.updateNote(n.id, x => { x.type = k; }); } }, icon(NOTE_ICON[k]), h('span', null, t(lab)))));
    sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Kind')), types));
    const txt = h('textarea', { class: 'textarea', id: 'f-note-text', disabled: ro, placeholder: t('What is it about? The first line is the title.') });
    txt.value = n.text || '';
    txt.addEventListener('input', () => { head.textContent = txt.value.trim().split('\n')[0] || noteTypeLabel(n.type); this.updateNote(n.id, x => { x.text = txt.value; }, 'ntext'); });
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-note-text' }, t('Note')), txt));
    const done = n.status === 'done';
    if (n.type === 'snag') {
      // handover point: its number and where it is in the process
      sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Handover point {n}', { n: n.no || '' })),
        h('div', { class: 'seg wrap snag-status' }, ...SNAG_STATUS.map(([k, lab]) => h('button', { 'aria-pressed': String((n.status || 'open') === k), 'data-st': k, disabled: ro, onclick: () => this.setSnagStatus(n.id, k) }, t(lab))))));
      const at = n.statusAt || {};
      const dates = SNAG_STATUS.filter(([k]) => k !== 'open' && at[k]).map(([k, lab]) => [t(lab), fmtDate(at[k])]);
      if (dates.length) sec.appendChild(h('dl', { class: 'kv' }, h('dt', null, t('Found')), h('dd', null, fmtDate(n.created)), ...dates.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
    } else sec.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn sm' + (done ? '' : ' primary'), disabled: ro, onclick: () => this.updateNote(n.id, x => { x.status = done ? 'open' : 'done'; }) }, icon(done ? 'restore' : 'check'), done ? t('Open again') : t('Mark as done')),
      h('span', { class: 'badge ' + (done ? 'ok' : '') }, done ? t('Done') : t('Open'))));
    el.appendChild(sec);
    // photos
    const ph = h('div', { class: 'photo-grid' });
    for (const aid of n.photos || []) {
      const a = Assets.get(aid);
      ph.appendChild(h('div', { class: 'photo-th' },
        a ? h('button', { class: 'ph-open', onclick: () => this.photoViewer(aid), 'aria-label': t('Show photo') }, h('img', { src: a.url, alt: '' })) : h('span', { class: 'note-muted' }, '?'),
        ro ? null : h('button', { class: 'ph-del', 'aria-label': t('Remove photo'), onclick: () => this.updateNote(n.id, x => { x.photos = x.photos.filter(y => y !== aid); }) }, icon('close'))));
    }
    el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Photos')), ph,
      ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => this.addNotePhoto(n.id) }, icon('camera'), t('Add photo'))),
      h('p', { class: 'note-muted' }, t('Photos are made smaller and kept in the house file.'))));
    // tags
    const p = this.project;
    const vSel = h('select', { class: 'select', id: 'f-note-ver', disabled: ro }, h('option', { value: '' }, t('All versions')), ...p.versions.map(v => h('option', { value: v.id, selected: n.versionId === v.id }, v.name)));
    vSel.onchange = () => this.updateNote(n.id, x => { x.versionId = vSel.value || null; });
    const lSel = h('select', { class: 'select', id: 'f-note-lay', disabled: ro }, h('option', { value: '' }, t('All layouts')), ...this.layouts().map(l => h('option', { value: l.id, selected: n.layoutId === l.id }, l.name)));
    lSel.onchange = () => this.updateNote(n.id, x => { x.layoutId = lSel.value || null; });
    el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Belongs to')),
      h('div', { class: 'field' }, h('label', { for: 'f-note-ver' }, t('House version')), vSel),
      h('div', { class: 'field' }, h('label', { for: 'f-note-lay' }, t('Furniture layout')), lSel),
      h('p', { class: 'note-muted' }, t('A note belongs to the house. With a version or layout picked, its pin only shows there.'))));
    el.appendChild(h('div', { class: 'insp-sec' },
      h('dl', { class: 'kv' }, h('dt', null, t('Made')), h('dd', null, fmtDate(n.created)), h('dt', null, t('Changed')), h('dd', null, fmtDate(n.updated))),
      ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm danger', onclick: () => this.deleteNote(n.id) }, icon('trash'), t('Delete note')))));
  },

  /** notes of a room, at the bottom of the room's details (every mode) */
  roomNotesSection(el, r) {
    const list = (this.project.notes || []).filter(n => !DIARY_TYPES.has(n.type)).filter(n => n.room === r.id || (n.at && n.at.storey === r.storey && pointInPolygon([n.at.x, n.at.y], r.poly)));
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Notes'), h('span', { class: 'num', style: { fontSize: '12px', letterSpacing: 0 } }, list.length ? String(list.length) : '')));
    for (const n of list) sec.appendChild(this.noteRow(n));
    if (!this.comparing) sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => this.addRoomNote(r) }, icon('plus'), t('Add a note to this room'))));
    el.appendChild(sec);
  },
  noteRow(n, opts = {}) {
    return h('button', { class: 'note-row' + (n.status === 'done' ? ' done' : ''), onclick: () => { if (opts.close) opts.close(); this.selectNote(n.id); } },
      h('span', { class: 'nr-ic nt-' + n.type }, icon(NOTE_ICON[n.type] || 'note')),
      h('span', { class: 'nr-main' }, h('span', { class: 'nr-title' }, (n.type === 'snag' && n.no ? '#' + n.no + ' ' : '') + noteTitle(n)), h('span', { class: 'nr-where' }, [noteTypeLabel(n.type), this.noteWhere(n), n.by ? t('from {n}', { n: n.by }) : (n.mine ? t('yours') : '')].filter(Boolean).join(' · '))),
      n.photos && n.photos.length ? h('span', { class: 'nr-ph' }, icon('camera'), String(n.photos.length)) : null,
      n.type === 'snag' ? h('span', { class: 'badge snag-' + (n.status || 'open') + (n.status === 'done' ? ' ok' : '') }, snagStatusLabel(n.status)) : n.status === 'done' ? h('span', { class: 'badge ok' }, t('Done')) : null);
  },

  async notesSheet() {
    const f = this._noteFilter || (this._noteFilter = { type: 'all', status: 'open', storey: 'all', tag: 'all' });
    const body = h('div', { class: 'notes-body' });
    let close = null;
    const paint = () => {
      body.textContent = '';
      const segOf = (key, opts) => h('div', { class: 'seg wrap' }, ...opts.map(([v, lab]) => h('button', { 'aria-pressed': String(f[key] === v), onclick: () => { f[key] = v; paint(); } }, lab)));
      body.appendChild(h('div', { class: 'nf-row' }, segOf('status', [['open', t('Open')], ['done', t('Done')], ['all', t('All')]])));
      body.appendChild(h('div', { class: 'nf-row' }, segOf('type', [['all', t('All kinds')], ...NOTE_TYPES.map(([k, lab]) => [k, t(lab)])])));
      const st = h('select', { class: 'select sm', 'aria-label': t('Storey') }, h('option', { value: 'all' }, t('All storeys')), ...sortedStoreys(this.project).map(s2 => h('option', { value: s2.id, selected: f.storey === s2.id }, s2.name)));
      st.onchange = () => { f.storey = st.value; paint(); };
      const tg = h('select', { class: 'select sm', 'aria-label': t('Belongs to') }, ...[['all', t('Any version or layout')], ['here', t('Only what is on screen')], ['untagged', t('Not tagged')]].map(([v, lab]) => h('option', { value: v, selected: f.tag === v }, lab)));
      tg.onchange = () => { f.tag = tg.value; paint(); };
      body.appendChild(h('div', { class: 'nf-row' }, st, tg));
      const here = new Set(this.visibleNotes().map(n => n.id));
      const list = (this.project.notes || []).filter(n => (f.status === 'all' || (f.status === 'open' ? n.status !== 'done' : n.status === f.status)) && (f.type === 'all' || n.type === f.type)
        && (f.storey === 'all' || (n.at ? n.at.storey : n.storey) === f.storey)
        && (f.tag === 'all' || (f.tag === 'here' ? here.has(n.id) : !n.versionId && !n.layoutId)))
        .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.updated - a.updated);
      body.appendChild(h('div', { class: 'note-muted' }, t('{n} notes', { n: list.length })));
      const box = h('div', { class: 'note-list' });
      for (const n of list) box.appendChild(this.noteRow(n, { close: () => close(null) }));
      if (!list.length) box.appendChild(h('p', { class: 'note-muted' }, (this.project.notes || []).length ? t('No notes match these filters.') : t('No notes yet. In View mode, tap “Note” and then the spot in 2D or 3D, or add one to a room.')));
      body.appendChild(box);
    };
    paint();
    await UI.dialog({ title: t('Notes'), body, actions: [{ label: t('Building diary'), value: 'diary', icon: 'camera' }, { label: t('New note on a spot'), value: 'pin', icon: 'pin' }, { label: t('Done'), value: null, kind: 'primary' }], onOpen: (dlg, c) => { close = c; } }).then(v => {
      if (v === 'pin') { if (this.mode !== 'view') this.setMode('view'); this.setTool('note'); }
      if (v === 'diary') this.diarySheet();
    });
  },

  /* ───────── saved viewpoints ───────── */
  viewpointsMenu(anchor) {
    const vps = this.project.viewpoints || [];
    const items = vps.map(vp => ({ label: vp.name, icon: vp.walk ? 'walk' : vp.dim === '3d' ? 'cube' : 'layers', fn: () => this.goViewpoint(vp.id) }));
    if (items.length) items.push('-');
    items.push({ label: t('Save this view…'), icon: 'plus', fn: () => this.saveViewpoint() });
    items.push({ label: t('Save a picture of this view'), icon: 'camera', fn: () => this.savePicture() });
    if (vps.length) items.push({ label: t('Rename or delete…'), icon: 'edit', fn: () => this.viewpointsSheet() });
    UI.menu(anchor, items, { alignLeft: true });
  },
  async saveViewpoint() {
    const pane = this.panes.find(x => x.role === 'main');
    if (!pane) return;
    const def = (this.walking ? t('Walking') + ' · ' : '') + (this.view.scope === 'storey' ? (this.currentStorey() || {}).name : this.view.scope === 'house' ? t('Whole house') : t('All storeys')) + ' ' + (this.project.viewpoints.length + 1);
    const name = await UI.prompt({ title: t('Save this view'), label: t('Name'), value: def, confirmLabel: t('Save') });
    if (name == null || !name.trim()) return;
    const v = pane.view;
    const vp = { id: uid('vp_'), name: name.trim(), dim: this.view.dim, scope: this.view.scope, storeyId: this.view.storeyId, display: this.display, created: Date.now() };
    if (this.walking && this.walker) vp.walk = this.walker.state();
    else if (pane.kind === '3d') vp.cam = v.cameraState();
    else { const st = v.viewState(); vp.cam2d = { c: st.c.map(x => +x.toFixed(3)), s: +st.s.toFixed(2) }; }
    this.mutate(p => { p.viewpoints.push(vp); }, { project: true, keepInspector: true });
    this.toast(t('View “{n}” saved.', { n: vp.name }));
    this.renderInspector();
  },
  goViewpoint(id) {
    const vp = (this.project.viewpoints || []).find(x => x.id === id);
    if (!vp) return;
    if (this.comparing) { this.sideBySide = false; this.swipe = false; }
    if (vp.walk) { this.startWalk(vp.walk); return; }
    if (this.walking) this.stopWalk(true);
    this.view.dim = vp.dim; this.view.scope = vp.scope;
    if (vp.storeyId && getStorey(this.project, vp.storeyId)) this.view.storeyId = vp.storeyId;
    if (vp.display && (vp.display === 'original' || this.planVersions().length)) this.display = vp.display;
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(true);
    this.renderInspector();
    const pane = this.panes.find(x => x.role === 'main');
    if (!pane) return;
    if (vp.cam && pane.kind === '3d') pane.view.setViewState({ kind: '3d', pos: new THREE.Vector3(...vp.cam.pos), target: new THREE.Vector3(...vp.cam.target) });
    if (vp.cam2d && pane.kind === '2d') pane.view.setViewState({ kind: '2d', c: vp.cam2d.c, s: vp.cam2d.s });
  },
  async viewpointsSheet() {
    const body = h('div', { style: { display: 'grid', gap: '8px' } });
    let close = null;
    const paint = () => {
      body.textContent = '';
      const vps = this.project.viewpoints;
      if (!vps.length) body.appendChild(h('p', { class: 'note-muted' }, t('No saved views.')));
      for (const vp of vps) {
        const name = h('input', { class: 'input', value: vp.name, 'aria-label': t('Name') });
        name.onchange = () => { if (name.value.trim()) this.mutate(() => { vp.name = name.value.trim(); }, { project: true, keepInspector: true }); };
        body.appendChild(h('div', { class: 'vp-row' }, icon(vp.walk ? 'walk' : vp.dim === '3d' ? 'cube' : 'layers'), name,
          h('button', { class: 'btn sm', onclick: () => { close(null); this.goViewpoint(vp.id); } }, t('Go')),
          h('button', { class: 'btn sm ghost icon danger', 'aria-label': t('Delete'), onclick: () => { this.mutate(p => { p.viewpoints = p.viewpoints.filter(x => x !== vp); }, { project: true, keepInspector: true }); paint(); } }, icon('trash'))));
      }
    };
    paint();
    await UI.dialog({ title: t('Saved views'), body, actions: [{ label: t('Done'), value: null, kind: 'primary' }], onOpen: (d, c) => { close = c; } });
    this.renderInspector();
  },

  /** View mode, nothing selected */
  viewOverview(el) {
    const p = this.project;
    this.inspHead(el, t('View'), this.shownVersion().name + (this.activeLayout() ? ' · ' + this.activeLayout().name : ''));
    if (p.viewer) {
      const mine = (p.notes || []).filter(n => n.mine).length;
      el.appendChild(h('div', { class: 'insp-sec viewer-sec' },
        h('div', { class: 'eyebrow' }, t('Viewer copy')),
        h('p', null, t('{f} sent you this copy of “{h}” on {d}. Look around, walk through it and add notes; then send your notes back. Nothing you do here changes their house.', { f: p.viewer.from || t('Someone'), h: p.viewer.title || p.name, d: fmtDate(p.viewer.exported) })),
        h('div', { class: 'actions' }, h('button', { class: 'btn sm primary', id: 'btn-notes-back', onclick: () => this.sendNotesBack() }, icon('share'), t('Send notes back') + (mine ? ' (' + mine + ')' : '')))));
    }
    const open = (p.notes || []).filter(n => n.status !== 'done');
    el.appendChild(h('div', { class: 'insp-sec' },
      h('div', { class: 'actions' },
        h('button', { class: 'btn sm primary', onclick: () => this.startWalk() }, icon('walk'), t('Walk through the house')),
        h('button', { class: 'btn sm', onclick: () => this.setTool('note') }, icon('pin'), t('Add a note'))),
      h('p', { class: 'note-muted' }, t('Nothing can be changed by accident here: walls and furniture stay as they are. Tap a door to open or close it.'))));
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Open notes'), h('button', { class: 'btn ghost sm', onclick: () => this.notesSheet() }, t('All notes'))));
    const counts = NOTE_TYPES.map(([k, lab]) => [k, lab, open.filter(n => n.type === k).length]).filter(x => x[2]);
    if (counts.length) sec.appendChild(h('div', { class: 'note-counts' }, ...counts.map(([k, lab, c]) => h('span', { class: 'nc nt-' + k }, icon(NOTE_ICON[k]), `${c} ${t(lab).toLowerCase()}`))));
    for (const n of open.slice().sort((a, b) => b.updated - a.updated).slice(0, 8)) sec.appendChild(this.noteRow(n));
    if (!open.length) sec.appendChild(h('p', { class: 'note-muted' }, t('No open notes.')));
    el.appendChild(sec);
    const vps = p.viewpoints || [];
    const vsec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Saved views'), h('button', { class: 'btn ghost sm', onclick: () => this.saveViewpoint() }, icon('plus'), t('Save this view'))));
    for (const vp of vps) vsec.appendChild(h('button', { class: 'room-row', onclick: () => this.goViewpoint(vp.id) }, icon(vp.walk ? 'walk' : vp.dim === '3d' ? 'cube' : 'layers'), h('span', null, vp.name), h('span', { class: 'ar' }, vp.walk ? t('walk') : vp.dim.toUpperCase())));
    if (!vps.length) vsec.appendChild(h('p', { class: 'note-muted' }, t('Save a view to come back to it with one tap (also while walking).')));
    el.appendChild(vsec);
    if (this.tool === 'path') this.pathsSection(el);
  },
});

/** a handover point gets the next number the first time it is one (numbers are never reused) */
function numberSnag(p, n) {
  if (n.type !== 'snag' || n.no) return;
  p.snagNo = Math.max(p.snagNo || 0, ...(p.notes || []).map(x => x.no || 0)) + 1;
  n.no = p.snagNo;
}

/* ───────── the handover list (opleverpunten): all handover points, to print, save as PDF or as a spreadsheet ───────── */
Object.assign(app, {
  snags() { return (this.project.notes || []).filter(n => n.type === 'snag').sort((a, b) => (a.no || 0) - (b.no || 0)); },
  snagWhere(n) {
    const p = this.project, plan = this.shownVersion().plan;
    const sid = n.at ? n.at.storey : n.storey, st = getStorey(p, sid);
    const room = n.room ? plan.rooms.find(r => r.id === n.room) : n.at ? plan.rooms.find(r => r.storey === n.at.storey && pointInPolygon([n.at.x, n.at.y], r.poly)) : null;
    return { storey: st ? st.name : '', room: room ? room.name : '' };
  },
  async handoverSheet() {
    const f = this._snagFilter || (this._snagFilter = 'all');
    let filter = f;
    const body = h('div', { class: 'notes-body snag-body' });
    let close = null;
    const paint = () => {
      body.textContent = '';
      const all = this.snags();
      const counts = Object.fromEntries(SNAG_STATUS.map(([k]) => [k, all.filter(n => (n.status || 'open') === k).length]));
      body.appendChild(h('p', { class: 'note-muted' }, t('Everything to put right at the handover (oplevering): tap “Handover point” and the spot, describe it and add a photo. Print the list or save it as a PDF for the builder, and tick the points off as they are fixed.')));
      body.appendChild(h('div', { class: 'nf-row' }, h('div', { class: 'seg wrap' }, ...[['all', t('All') + ' · ' + all.length], ...SNAG_STATUS.map(([k, lab]) => [k, t(lab) + ' · ' + counts[k]])].map(([k, lab]) => h('button', { 'aria-pressed': String(filter === k), onclick: () => { filter = this._snagFilter = k; paint(); } }, lab)))));
      const list = all.filter(n => filter === 'all' || (n.status || 'open') === filter);
      const box = h('div', { class: 'note-list' });
      for (const n of list) box.appendChild(this.noteRow(n, { close: () => close(null) }));
      if (!list.length) box.appendChild(h('p', { class: 'note-muted' }, all.length ? t('No handover points with this status.') : t('No handover points yet.')));
      body.appendChild(box);
    };
    paint();
    const v = await UI.dialog({ title: t('Handover list'), body, wide: true, onOpen: (d, c) => { close = c; }, actions: [
      { label: t('New handover point'), value: 'new', icon: 'snag' },
      { label: t('Spreadsheet (.csv)'), value: 'csv', icon: 'download' },
      { label: t('Print or save as PDF'), value: 'print', icon: 'print', kind: 'primary' },
    ] });
    if (v === 'new') { if (this.mode !== 'view') this.setMode('view'); this._noteType = 'snag'; this.setTool('note'); this.toast(t('Tap the spot of the handover point, in 2D or 3D.')); }
    if (v === 'csv') this.handoverCsv();
    if (v === 'print') this.handoverPrint();
  },
  handoverCsv() {
    const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const rows = [[t('No.'), t('Status'), t('Storey'), t('Room'), t('Description'), t('Found'), t('Reported'), t('Fixed'), t('Checked, OK'), t('Photos'), t('From')].map(q).join(';')];
    const d = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
    for (const n of this.snags()) {
      const w = this.snagWhere(n), at = n.statusAt || {};
      rows.push([n.no, snagStatusLabel(n.status), w.storey, w.room, (n.text || '').replace(/\s*\n\s*/g, ' / '), d(n.created), d(at.reported), d(at.fixed), d(at.done), (n.photos || []).length, n.by || ''].map(q).join(';'));
    }
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' });
    this.downloadBlob(`${slugify(this.project.name)}_${t('handover')}_${todayStamp()}.csv`, blob);
  },
  /** the list as a page to print: number, status, where, text and the photos */
  handoverHtml() {
    const p = this.project, esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const list = this.snags();
    const items = list.map(n => {
      const w = this.snagWhere(n), at = n.statusAt || {};
      const photos = (n.photos || []).map(id => Assets.get(id)).filter(Boolean).map(a => `<img src="${a.url}" alt="">`).join('');
      const dates = [[t('Found'), n.created], ...SNAG_STATUS.filter(([k]) => k !== 'open' && at[k]).map(([k, lab]) => [t(lab), at[k]])].map(([a, b]) => `${esc(a)} ${esc(fmtDate(b))}`).join(' · ');
      return `<tr><td class="no">${esc(n.no)}</td><td><b>${esc(noteTitle(n))}</b>${(n.text || '').includes('\n') ? '<div class="more">' + esc(n.text.split('\n').slice(1).join('\n')) + '</div>' : ''}<div class="where">${esc([w.room, w.storey].filter(Boolean).join(' · '))}${n.by ? ' · ' + esc(t('from {n}', { n: n.by })) : ''}</div><div class="dates">${dates}</div>${photos ? '<div class="ph">' + photos + '</div>' : ''}</td><td class="st st-${esc(n.status || 'open')}">${esc(snagStatusLabel(n.status))}</td><td class="tick"></td></tr>`;
    }).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(t('Handover list'))} · ${esc(p.name)}</title><style>
      body { font: 13px/1.4 system-ui, sans-serif; color: #1a2326; margin: 24px; }
      h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #5b6669; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6669; border-bottom: 2px solid #1a2326; padding: 6px 8px; }
      td { vertical-align: top; border-bottom: 1px solid #d5dbdb; padding: 8px; } td.no { font-weight: 700; width: 36px; } td.st { width: 110px; } td.tick { width: 60px; }
      .more { white-space: pre-wrap; margin-top: 2px; } .where, .dates { color: #5b6669; font-size: 12px; margin-top: 2px; }
      .ph img { height: 110px; margin: 6px 6px 0 0; border-radius: 3px; } tr { page-break-inside: avoid; }
      .st-done { color: #2f7d4f; font-weight: 600; } .st-open { color: #c0352a; font-weight: 600; }
      @media print { body { margin: 10mm; } }
    </style></head><body><h1>${esc(t('Handover list'))} · ${esc(p.name)}</h1>
    <div class="sub">${esc(t('{n} points', { n: list.length }))} · ${esc(fmtDate(Date.now()))}</div>
    <table><thead><tr><th>${esc(t('No.'))}</th><th>${esc(t('Description'))}</th><th>${esc(t('Status'))}</th><th>${esc(t('OK'))}</th></tr></thead><tbody>${items || `<tr><td colspan="4">${esc(t('No handover points yet.'))}</td></tr>`}</tbody></table></body></html>`;
  },
  handoverPrint() {
    const html = this.handoverHtml();
    const fr = h('iframe', { class: 'print-frame', title: t('Handover list'), style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
    fr.srcdoc = html;
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); if (document.activeElement === fr) fr.blur(); window.focus(); } catch (e) { this.downloadBlob(`${slugify(this.project.name)}_${t('handover')}.html`, new Blob([html], { type: 'text/html' })); } setTimeout(() => fr.remove(), 60000); };
    document.body.appendChild(fr);
  },
});
