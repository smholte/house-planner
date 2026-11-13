/* ───────────── modes.js — Build · Furnish · View: switching, tool rails, bars over the views, doors,
   and what is kept with the house (slices, view settings) ───────────── */

/** view settings that travel with the house file (the theme, quality and language stay with the device) */
const VIEW_KEYS = ['colorBy', 'labels', 'dims', 'underlay', 'ghost', 'cut', 'ground', 'plinth', 'roof', 'windows', 'outside', 'floors', 'explode', 'grid', 'ceilings', 'light', 'furniture', 'notesOn', 'furnSnap', 'furnRot', 'walkMode', 'installs', 'ceilItems', 'ptHeights', 'loadWalls', 'garden'];

Object.assign(app, {
  /* ───────── modes ───────── */
  setMode(m) {
    if (!this.project || m === this.mode) return;
    if (this.project.viewer && m !== 'view') { this.toast(t('This is a viewer copy: you can look around, walk through it and add notes.')); return; }
    if (this.walking) this.stopWalk(true);
    if (this.comparing) { this.sideBySide = false; this.swipe = false; }
    this.mode = m;
    this.tool = 'select';
    this.closeDoorPopup();
    // a selection that belongs to another mode goes
    const sel = this.selection;
    if (sel && (sel.type === 'furn' ? m !== 'furnish' : (sel.type === 'wall' || sel.type === 'opening') ? m !== 'build' : false)) this.selection = null;
    if (m === 'furnish' && this.display === 'diff') this.display = this.planVersions().length ? 'plan' : 'original';
    this.saveUi();
    this.renderEditorChrome();
    this.setupPanes(false);
    this.renderInspector();
    this.updatePip();
    const msg = { build: 'Build: change walls, doors, windows and rooms.', furnish: 'Furnish: add furniture and compare layouts. The walls stay as they are.', view: 'View: look around, add notes and walk through the house.' }[m];
    // the first time in this session only (the bar and the tools say the rest)
    this._modeTold = this._modeTold || new Set();
    if (!this._modeTold.has(m)) { this._modeTold.add(m); this.toast(t(msg)); }
  },

  renderModeRail(rail) {
    const box = h('div', { class: 'rail-tools' });
    const btn = (id, label, ic, fn, pressed, extra = {}) => box.appendChild(h('button', { class: 'tool', 'aria-pressed': pressed == null ? null : String(!!pressed), title: label + (extra.key ? ` (${extra.key})` : ''), 'aria-label': label, disabled: extra.disabled, onclick: fn, 'data-tool': id }, icon(ic), h('span', { class: 'tl' }, extra.short || label), extra.key ? h('span', { class: 'key' }, extra.key) : null));
    if (this.mode === 'furnish') {
      const can = !this.comparing;
      btn('select', t('Select'), 'select', () => this.setTool('select'), this.tool === 'select', { key: 'V' });
      btn('add', t('Add furniture'), 'catalog', () => this.catalogSheet(), null, { short: t('Add'), key: 'A', disabled: !can });
      btn('sets', t('Furniture sets'), 'group', () => this.setsSheet(), null, { short: t('Sets'), disabled: !can });
      btn('shop', t('Shopping list'), 'cart', () => this.shoppingSheet(), null, { short: t('Shopping') });
      btn('space', t('Check space'), 'space', () => this.runSpaceCheck(), !!(this.spaceCheck && this.spaceCheck.shown), { short: t('Check') });
    } else {
      btn('select', t('Look and select'), 'select', () => this.setTool('select'), this.tool === 'select', { short: t('Select'), key: 'V' });
      btn('note', t('Add a note'), 'pin', () => this.setTool(this.tool === 'note' ? 'select' : 'note'), this.tool === 'note', { short: t('Note'), key: 'N' });
      btn('notes', t('All notes'), 'note', () => this.notesSheet(), null, { short: t('Notes') });
      btn('views', t('Saved viewpoints'), 'bookmark', e => this.viewpointsMenu(e.currentTarget), null, { short: t('Views') });
      btn('walk', t('Walk through the house'), 'walk', () => this.walking ? this.stopWalk() : this.startWalk(), !!this.walking, { short: t('Walk'), key: 'K' });
      btn('path', t('Walking paths (2D)'), 'path', () => this.setTool(this.tool === 'path' ? 'select' : 'path'), this.tool === 'path', { short: t('Paths') });
      btn('measure', t('Measure (2D and 3D)'), 'measure', () => this.setTool(this.tool === 'measure' ? 'select' : 'measure'), this.tool === 'measure', { short: t('Measure'), key: 'M' });
      btn('handover', t('Handover list (opleverpunten)'), 'snag', () => this.handoverSheet(), null, { short: t('Handover') });
      btn('tasks', t('Task board'), 'board', () => this.tasksSheet(), null, { short: t('Tasks') });
      btn('docs', t('Documents (PDFs and pictures)'), 'doc', () => this.documentsSheet(), null, { short: t('Docs') });
    }
    rail.appendChild(box);
    const end = h('div', { class: 'rail-end' });
    end.appendChild(h('div', { class: 'rail-sep' }));
    end.appendChild(h('button', { class: 'tool compact', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', disabled: !this.undoStack.length, onclick: () => this.undo() }, icon('undo'), h('span', { class: 'tl' }, 'Undo')));
    end.appendChild(h('button', { class: 'tool compact', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', disabled: !this.redoStack.length, onclick: () => this.redo() }, icon('redo'), h('span', { class: 'tl' }, 'Redo')));
    end.appendChild(this.historyButton());
    end.appendChild(h('button', { class: 'tool mobile-only', 'aria-pressed': String(this.inspOpen), 'aria-label': 'Details', onclick: () => this.toggleInspector() }, icon('info'), h('span', { class: 'tl' }, 'Details')));
    rail.appendChild(end);
  },

  setModeTool(tl, silent) {
    const ok = this.mode === 'furnish' ? ['select'] : ['select', 'note', 'path', 'measure'];
    if (!ok.includes(tl)) tl = 'select';
    const needs2d = tl === 'path';
    if (needs2d && !silent && (this.view.dim !== '2d' || this.view.scope !== 'storey')) {
      if (this.walking) this.stopWalk(true);
      this.view.dim = '2d'; if (this.view.scope !== 'storey') this.view.scope = 'storey';
      this.tool = tl;
      this.saveUi(); this.renderEditorChrome(); this.setupPanes(true); this.renderInspector();
      return;
    }
    for (const pane of this.panes) if (pane.kind === '2d') { pane.view.cancelChain(); pane.el.dataset.tool = tl; }
    const was = this.tool;
    this.tool = tl;
    if (was === 'measure' && tl !== 'measure') for (const pane of this.panes) if (pane.view.clearMeasure3d) pane.view.clearMeasure3d();
    this.renderToolrail();
    this.renderStageOverlays();
    if (was !== tl && (was === 'path' || tl === 'path')) this.refreshViews(false);
    if (tl === 'path' && !silent) this.renderInspector();
  },

  /** the bar at the top of the view in Furnish and View mode */
  modeOverlays(top) {
    const furn = this.mode === 'furnish';
    if (this.walking) { top.appendChild(this.walkBar()); return; }
    const bar = h('div', { class: 'modebar' });
    const lay = this.activeLayout();
    const layBtn = h('button', { class: 'btn sm layout-pill', title: t('Furniture layout'), onclick: e => this.layoutMenu(e.currentTarget) }, icon('sofa'), h('span', { class: 'lp-name' }, lay ? lay.name : '—'), icon('chevron'));
    if (furn && this.comparing) { top.appendChild(this.furnCompareBar()); return; }
    bar.appendChild(layBtn);
    if (furn) {
      const s = this.settings;
      bar.appendChild(h('button', { class: 'chip', 'aria-pressed': String(s.furnSnap !== false), title: t('Pieces snap against walls and each other'), onclick: () => { Settings.set('furnSnap', s.furnSnap === false); this.renderStageOverlays(); } }, icon('magnet'), h('span', { class: 'hide-xs' }, t('Snap'))));
      const rot = h('div', { class: 'seg rotseg', title: t('Turning steps') }, icon('rotate'));
      for (const [v, lab] of [[90, '90°'], [15, '15°'], [0, t('Free')]]) rot.appendChild(h('button', { 'aria-pressed': String((s.furnRot ?? 90) === v), onclick: () => { Settings.set('furnRot', v); this.renderStageOverlays(); } }, lab));
      bar.appendChild(rot);
      bar.appendChild(h('button', { class: 'chip', 'aria-pressed': String(!!this.multiSel), title: t('Tap pieces to add them to the selection (or hold Shift)'), onclick: () => { this.multiSel = !this.multiSel; this.renderStageOverlays(); } }, icon('group'), h('span', { class: 'hide-xs' }, t('Several'))));
      const pc = this.pipChip();
      if (pc) bar.appendChild(pc);
    } else {
      if (this.isViewer()) bar.appendChild(h('span', { class: 'chip viewer-chip', title: t('A copy to look at, from {n}', { n: this.project.viewer.from || '?' }) }, icon('eye'), h('span', { class: 'hide-xs' }, this.project.viewer.from ? t('Copy from {n}', { n: this.project.viewer.from }) : t('Viewer copy'))));
      if (this.tool === 'note') bar.appendChild(h('span', { class: 'hint' }, t('Tap where the note goes.')));
      else if (this.tool === 'path') bar.appendChild(h('span', { class: 'hint' }, t('Tap to add points; tap a point to go on from it. Long press or right click deletes.')));
      else if (this.tool === 'measure') bar.appendChild(h('span', { class: 'hint' }, this.view.dim === '3d' ? t('Tap two points on the house to measure (corners snap).') : t('Tap two points to measure.')));
    }
    top.appendChild(bar);
  },

  /* ───────── doors ───────── */
  /** outside doors of the builder's model that can swing: closed unless opened ('open'); other doors are open
   *  unless closed ('closed') */
  isOuterDoor(id) { return !!(this.shell && this.shell.doorOps && this.shell.doorOps.has(id)); },
  /** a garden gate (garden line of kind 'gate'): closed unless opened, like an outside door */
  isGate(id) { const v = this.shownVersion && this.shownVersion(), g = v && v.plan.garden; return !!(g && g.lines.some(l => l.id === id && l.kind === 'gate')); },
  isDoorClosed(id) {
    const ds = this.project && this.project.doorState;
    if (this.isOuterDoor(id) || this.isGate(id)) return !(ds && ds[id] === 'open');
    return !!(ds && ds[id] === 'closed');
  },
  setDoorClosed(id, closed) {
    const p = this.project;
    p.doorState = p.doorState || {};
    if (this.isOuterDoor(id) || this.isGate(id)) { if (closed) delete p.doorState[id]; else p.doorState[id] = 'open'; }
    else if (closed) p.doorState[id] = 'closed'; else delete p.doorState[id];
    Saver.markDirty();
    for (const pane of this.panes) { if (pane.kind === '3d') pane.view.swingDoor(id, closed); else pane.view.render(); }
    if (this.pip) this.pip.swingDoor(id, closed);
    if (this.walker) this.walker.collect();
    if (this.selection && (this.selection.type === 'opening' || this.selection.type === 'gline') && this.selection.id === id) this.renderInspector();
  },
  /** a door was tapped: Build shows a small pop-up, Furnish and View swing it straight away */
  doorTapped(id, ev, where) {
    const v = this.shownVersion(), plan = v && v.plan;
    // the garden gate: Build asks, Furnish and View swing it straight away
    if (this.isGate(id)) {
      if (this.mode === 'build') { this.doorPopup(id, ev.clientX, ev.clientY, true); return true; }
      this.setDoorClosed(id, !this.isDoorClosed(id));
      return true;
    }
    const op = plan && plan.openings.find(o => o.id === id);
    if (!op || op.kind !== 'door') return false;
    const w = plan.walls.find(x => x.id === op.wall);
    const facade = w && w.kind !== 'interior' && this.shell && this.shell.storeys[w.storey] && isModelDoor(plan, w, op);
    if (facade && !this.isOuterDoor(id)) { if (this.mode !== 'build') this.toast(t('Outside doors of this model can\'t be opened: import the builder\'s IFC again to make them work.')); return false; }
    if (this.mode === 'build') { this.doorPopup(id, ev.clientX, ev.clientY); return true; }
    this.setDoorClosed(id, !this.isDoorClosed(id));
    return true;
  },
  doorPopup(id, x, y, gate) {
    this.closeDoorPopup();
    const closed = this.isDoorClosed(id);
    const el = h('div', { class: 'door-pop', role: 'dialog', 'aria-label': gate ? t('Gate') : t('Door') },
      h('button', { class: 'btn sm primary', onclick: () => { this.setDoorClosed(id, !closed); this.closeDoorPopup(); } }, icon('door'), gate ? (closed ? t('Open the gate') : t('Close the gate')) : closed ? t('Open door') : t('Close door')),
      h('button', { class: 'btn sm ghost icon', 'aria-label': t('Close'), onclick: () => this.closeDoorPopup() }, icon('close')));
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = clamp(x - r.width / 2, 8, window.innerWidth - r.width - 8) + 'px';
    el.style.top = clamp(y - r.height - 14, 8, window.innerHeight - r.height - 8) + 'px';
    const outside = e => { if (!el.contains(e.target)) this.closeDoorPopup(); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); this.closeDoorPopup(); } };
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
    this._doorPop = { el, off: () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); } };
  },
  closeDoorPopup() { if (this._doorPop) { this._doorPop.off(); this._doorPop.el.remove(); this._doorPop = null; } },

  /* ───────── what each storey shows besides the walls ───────── */
  entryExtras(st, role, ver) {
    const p = this.project;
    const storeys = sortedStoreys(p);
    const i = storeys.findIndex(s2 => s2.id === st.id);
    const upperId = storeys[i + 1] ? storeys[i + 1].id : null;
    const lay = role === 'base' && this.mode === 'furnish' && this.furnCompare ? this.layoutById(this.furnCompare.layoutId) : this.activeLayout();
    const showFurn = this.settings.furniture !== false;
    let furniture = showFurn && lay ? lay.items.filter(f => f.storey === st.id) : [];
    // the original is the garden as delivered: what stands outside the house (cars, garden chairs) is not there
    const v = ver || (role === 'base' ? null : this.shownVersion());
    if (v && v.kind === 'original' && p.site && furniture.length) furniture = furniture.filter(f => !outdoorsAt(p, v.plan, st.id, [f.x, f.y]));
    const sel = this.selection;
    const pins = this.settings.notesOn === false || role === 'base' ? [] : this.visibleNotes().filter(n => n.at && n.at.storey === st.id)
      .map(n => ({ id: n.id, storey: st.id, x: n.at.x, y: n.at.y, h: n.at.h, type: n.type, status: n.status, no: n.type === 'snag' ? n.no : null, title: (n.type === 'snag' && n.no ? '#' + n.no + ' ' : '') + noteTitle(n), sel: !!(sel && sel.type === 'note' && sel.id === n.id) }));
    const paths = this.mode === 'view' && (this.tool === 'path' || this.walking) ? this.project.walk : null;
    return { furniture, pins, upperId, faintFurn: this.mode === 'build', paths };
  },

  /* ───────── kept with the house ───────── */
  loadProjectView(p) {
    for (const key of [...SLICE.sets.keys()]) if (key.startsWith(p.id + '|')) SLICE.sets.delete(key);
    for (const [k, list] of Object.entries(p.slices || {})) {
      try { SLICE.sets.set(p.id + '|' + k, list.map(sliceFromJSON)); } catch (e) { console.warn('slices not read', e); }
    }
    if (p.viewSettings) {
      for (const k of VIEW_KEYS) if (k in p.viewSettings) this.settings[k] = p.viewSettings[k];
      Settings.save();
    }
  },
  persistSlices(key, list) {
    const p = this.project;
    if (!p || !key || !key.startsWith(p.id + '|')) return;
    const k = key.slice(p.id.length + 1);
    p.slices = p.slices || {};
    if (list.length) p.slices[k] = list.map(sliceToJSON); else delete p.slices[k];
    Saver.markDirty();
  },
  /** after any change to the view settings: keep a copy in the house */
  syncViewSettings() {
    const p = this.project;
    if (!p) return;
    const vs = {};
    for (const k of VIEW_KEYS) if (this.settings[k] !== undefined) vs[k] = this.settings[k];
    if (JSON.stringify(vs) === JSON.stringify(p.viewSettings || null)) return;
    p.viewSettings = vs;
    Saver.markDirty();
  },

  /* ───────── keys in Furnish and View ───────── */
  modeKey(e, view2d) {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (this.mode === 'furnish') {
      const sel = this.selection && this.selection.type === 'furn' ? this.selection : null;
      if (k === 'Escape') { if (this.multiSel) { this.multiSel = false; this.renderStageOverlays(); } if (sel) this.select(null); return true; }
      if (sel && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); this.deleteFurniture(sel.ids); return true; }
      if (sel && mod && (k === 'd' || k === 'D')) { e.preventDefault(); this.duplicateFurniture(sel.ids); return true; }
      if (mod || e.altKey) return false;
      if (sel && (k === 'r' || k === 'R')) { this.turnFurniture(sel.ids, (e.shiftKey ? -1 : 1) * (this.settings.furnRot || 15)); return true; }
      if (sel && k.startsWith('Arrow')) {
        e.preventDefault();
        const st = e.shiftKey ? 0.1 : 0.01, dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0;
        this.moveFurniture(sel.ids, dx, dy, 'nudge');
        return true;
      }
      if (k === 'a' || k === 'A') { this.catalogSheet(); return true; }
      if (k === 'v' || k === 'V') { this.setTool('select'); return true; }
      if (k === 'f' || k === 'F') { this.fitViews(); return true; }
      return true;
    }
    // view mode
    if (k === 'Escape') {
      if (view2d && (view2d.chain || view2d.measure)) { view2d.cancelChain(); this.renderStageOverlays(); return true; }
      if (this.tool !== 'select') { this.setTool('select'); return true; }
      if (this.selection) this.select(null);
      return true;
    }
    if (this.selection && this.selection.type === 'note' && (k === 'Delete') ) { this.deleteNote(this.selection.id); return true; }
    if (mod || e.altKey) return false;
    const map = { v: 'select', n: 'note', m: 'measure' };
    if (map[k.toLowerCase()]) { this.setTool(map[k.toLowerCase()]); return true; }
    if (k === 'k' || k === 'K') { this.walking ? this.stopWalk() : this.startWalk(); return true; }
    if (k === 'f' || k === 'F') { this.fitViews(); return true; }
    return false;
  },
});
