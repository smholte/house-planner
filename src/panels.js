/* ───────────── panels.js — inspector, sheets, export/import, drawings ───────────── */

Object.assign(app, {

  /* ───────── inspector ───────── */
  renderInspector() {
    const el = $('#inspector');
    if (!el || !this.project) return;
    const scroll = el.scrollTop;
    el.textContent = '';
    el.appendChild(this.inspGrip());
    const target = this.selectionTarget();
    if (this.selection && !target) this.selection = null;
    if (this.selection && target) {
      if (this.selection.type === 'wall') this.wallPanel(el, target);
      else if (this.selection.type === 'opening') this.openingPanel(el, target);
      else if (this.selection.type === 'room') this.roomPanel(el, target);
      else if (this.selection.type === 'furn') this.furnPanel(el, target);
      else if (this.selection.type === 'note') this.notePanel(el, target);
      else if (this.selection.type === 'point') this.pointPanel(el, target);
      else if (this.selection.type === 'stair') this.stairPanel(el, target);
      else if (this.selection.type === 'void') this.voidPanel(el, target);
      else if (this.selection.type === 'multi') this.multiPanel(el, this.selection);
      else if (this.selection.type === 'garea') this.gardenAreaPanel(el, target);
      else if (this.selection.type === 'gline') this.gardenLinePanel(el, target);
      else if (this.selection.type === 'plant') this.plantPanel(el, target);
      else if (this.selection.type === 'plot') this.plotPanel(el);
    } else if (this.walking) this.walkPanel(el);
    else if (this.mode === 'furnish') this.furnOverview(el);
    else if (this.mode === 'view') this.viewOverview(el);
    else this.overviewPanel(el);
    el.scrollTop = scroll;
  },

  /** phones: a handle on the details sheet — drag it to make the sheet taller or lower, tap it to switch
   *  between low and half height */
  inspGrip() {
    const g = h('div', { class: 'insp-grip', role: 'separator', 'aria-label': 'Drag to resize the details', title: 'Drag to resize, tap for low / half height' });
    let d = null;
    g.addEventListener('pointerdown', e => {
      const el = $('#inspector');
      d = { id: e.pointerId, y: e.clientY, h: el.offsetHeight, moved: false };
      try { g.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      e.preventDefault();
    });
    g.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const dy = d.y - e.clientY;
      if (!d.moved && Math.abs(dy) < 5) return;
      d.moved = true;
      this.setInspHeight(d.h + dy);
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const was = d;
      d = null;
      if (!was.moved) { const vh = window.innerHeight; this.setInspHeight($('#inspector').offsetHeight > vh * 0.42 ? vh * 0.3 : vh * 0.58); }
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    return g;
  },
  setInspHeight(px) {
    const vh = window.innerHeight, el = $('#inspector');
    px = clamp(px, vh * 0.2, vh * 0.88);
    el.style.setProperty('--insp-h', Math.round(px) + 'px');
    el.classList.add('sized');
    this.updateInsets();
  },

  inspHead(el, title, kind, extra) {
    el.appendChild(h('div', { class: 'insp-head' },
      h('div', { style: { minWidth: 0, flex: 1 } }, kind ? h('div', { class: 'kind' }, kind) : null, h('h3', null, title)),
      extra || null,
      h('button', { class: 'btn ghost icon sm insp-close', 'aria-label': 'Close details', onclick: () => { if (this.selection) this.select(null); this.toggleInspector(false); } }, icon('close'))));
  },

  /** number field in millimetres bound to a value in metres */
  mmField(label, id, valueM, onChange, opts = {}) {
    const inp = h('input', { class: 'input', id, type: 'text', inputmode: 'numeric', value: valueM == null ? '' : fmtMM(valueM), placeholder: opts.placeholder || '', disabled: opts.disabled, autocomplete: 'off' });
    const commit = () => {
      const raw = inp.value.trim().replace(',', '.');
      if (raw === '' && opts.allowEmpty) { onChange(null); return; }
      const v = parseFloat(raw);
      if (!isFinite(v) || v < 0 || (v === 0 && !opts.allowZero)) { inp.value = valueM == null ? '' : fmtMM(valueM); return; }
      onChange(v / 1000);
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); } });
    return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, 'mm')));
  },

  wallPanel(el, w) {
    const st = getStorey(this.project, w.storey);
    const L = wallLen(w);
    const ro = !this.canEdit();
    this.inspHead(el, fmtMM(L) + ' mm wall', st ? st.name : 'Wall');
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(h('div', { class: 'field-row' },
      this.mmField('Length', 'f-wall-len', L, v => this.mutate(plan => withRoomsFollowing(plan, w.storey, pl => { setWallLength(pl, pl.walls.find(x => x.id === w.id), v, 'a'); })), { disabled: ro }),
      this.mmField('Thickness', 'f-wall-t', w.t, v => this.mutate(plan => withRoomsFollowing(plan, w.storey, pl => { pl.walls.find(x => x.id === w.id).t = clamp(v, 0.03, 1); })), { disabled: ro })));
    sec.appendChild(h('div', { class: 'field-row' },
      this.mmField('Height', 'f-wall-h', w.h, v => this.mutate(plan => { plan.walls.find(x => x.id === w.id).h = v; }), { allowEmpty: true, placeholder: fmtMM(w.top && w.top.length > 1 ? wallTopMax(w) : (st ? st.wallHeight : DEFAULTS.wallHeight)), disabled: ro }),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Type'),
        h('div', { class: 'seg' },
          ...[['interior', 'Inner'], ['exterior', 'Outer'], ['insulation', 'Insulation']].map(([k, lab]) => h('button', { 'aria-pressed': String(w.kind === k), disabled: ro, onclick: () => this.mutate(plan => { plan.walls.find(x => x.id === w.id).kind = k; }) }, lab))))));
    if (w.ifc) sec.appendChild(h('p', { class: 'note-muted' }, 'From the IFC model: ' + w.ifc.replace(/^Basic Wall:/, '')));
    if (w.from) sec.appendChild(h('p', { class: 'note-muted' }, t('From the drawing: {d}', { d: w.from })));
    // load-bearing: from the builder's IFC (Pset_WallCommon.LoadBearing) or set here
    const lv = w.load === true ? 'yes' : w.load === false ? 'no' : '';
    sec.appendChild(this.segRow(t('Load-bearing'), [['yes', 'Yes'], ['no', 'No'], ['', 'Not known']], lv, k => this.mutate(plan => { const x = plan.walls.find(y => y.id === w.id); if (!x) return; if (k === '') delete x.load; else x.load = k === 'yes'; delete x.loadSrc; }), ro, 'wall-load'));
    if (w.load === true) sec.appendChild(h('p', { class: 'warn-line', id: 'wall-load-warn' }, icon('alert'), h('span', null, t('A load-bearing wall: taking it out or making an opening in it needs a structural engineer and the builder\'s approval.'))));
    if (w.load != null && w.loadSrc) sec.appendChild(h('p', { class: 'note-muted' }, w.loadSrc === 'ifc' ? t('From the builder\'s IFC model (Pset_WallCommon · LoadBearing).') : t('From the drawing.')));
    el.appendChild(sec);
    this.wallFinishSection(el, w);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' },
      h('div', { class: 'actions' },
        h('button', { class: 'btn sm', onclick: () => this.mutate(plan => { const ww = plan.walls.find(x => x.id === w.id); const w2 = splitWall(plan, ww, wallLen(ww) / 2); if (w2) setTimeout(() => this.toast('Split in two. Select one half to remove it.'), 0); }) }, icon('scissors'), 'Split in half'),
        h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), 'Delete wall')),
      h('p', { class: 'note-muted' }, 'Drag the wall to move it; connected walls follow. Drag a round handle to move an end.')));
  },

  openingPanel(el, op) {
    const plan = this.shownVersion().plan;
    const w = plan.walls.find(x => x.id === op.wall);
    const ro = !this.canEdit();
    const L = w ? wallLen(w) : 0;
    const names = { door: 'Door', window: 'Window', opening: 'Opening' };
    this.inspHead(el, `${names[op.kind]} ${fmtMM(op.w)}`, 'In a ' + fmtMM(L) + ' mm wall');
    const upd = fn => this.mutate(pl => withAssembly(pl, op.id, () => { const o = pl.openings.find(x => x.id === op.id); const ww = pl.walls.find(x => x.id === o.wall); fn(o, ww); const LL = wallLen(ww); o.w = Math.min(o.w, LL); o.pos = clamp(o.pos, o.w / 2, LL - o.w / 2); }));
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Kind'),
      h('div', { class: 'seg' }, ...['door', 'window', 'opening'].map(k => h('button', { 'aria-pressed': String(op.kind === k), disabled: ro, onclick: () => upd(o => { o.kind = k; delete o.style; if (k !== 'door') delete o.leaves; if (k === 'window') { o.sill = o.sill || DEFAULTS.winSill; o.h = Math.min(o.h, DEFAULTS.winH); } else { o.sill = 0; o.h = DEFAULTS.doorH; } }) }, names[k])))));
    const typeRow = this.openingTypeRow(op, ro, upd);
    if (typeRow) sec.appendChild(typeRow);
    sec.appendChild(h('div', { class: 'field-row' },
      this.mmField('Width', 'f-op-w', op.w, v => upd(o => { o.w = v; }), { disabled: ro }),
      this.mmField('Height', 'f-op-h', op.h, v => upd(o => { o.h = v; }), { disabled: ro })));
    sec.appendChild(h('div', { class: 'field-row' },
      op.kind === 'window' ? this.mmField('Sill height', 'f-op-sill', op.sill || 0.0001, v => upd(o => { o.sill = v; }), { disabled: ro }) : h('div'),
      this.mmField('Centre from wall start', 'f-op-pos', op.pos, v => upd(o => { o.pos = v; }), { disabled: ro })));
    if (op.kind === 'door') sec.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => this.setDoorClosed(op.id, !this.isDoorClosed(op.id)) }, icon('door'), this.isDoorClosed(op.id) ? t('Open door') : t('Close door')),
      h('button', { class: 'btn sm', disabled: ro, onclick: () => upd(o => { o.hinge = o.hinge === 'end' ? 'start' : 'end'; }) }, icon('flip'), 'Flip hinge'),
      h('button', { class: 'btn sm', disabled: ro, onclick: () => upd(o => { o.swing = o.swing === 'right' ? 'left' : 'right'; }) }, icon('flip'), 'Flip opening side')));
    // an outside wall of layers: the opening goes through all of them
    const layers = assemblyOpenings(plan, op).length;
    if (layers) sec.appendChild(h('p', { class: 'note-muted fx-note' }, t('Through the whole outside wall: the same opening is in {n} more layers (insulation, brick); they move and change with it.').replace('{n}', layers)));
    el.appendChild(sec);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' }, h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t({ door: 'Delete door', window: 'Delete window', opening: 'Delete opening' }[op.kind] || 'Delete'))),
      h('p', { class: 'note-muted' }, 'Drag it along the wall to move it.')));
  },

  roomPanel(el, r) {
    const sel = this.selection;
    const v = sel.versionId ? getVersion(this.project, sel.versionId) : this.shownVersion();
    const ro = sel.readOnly || !v || v.locked || this.comparing || this.mode !== 'build';
    const st = getStorey(this.project, r.storey);
    const upd = (fn, opts = {}) => this.mutate(pl => { const rr = pl.rooms.find(x => x.id === r.id); if (rr) fn(rr); }, { keepInspector: true, ...opts });
    this.inspHead(el, r.name, (st ? st.name : '') + (v && v.id !== this.shownVersion().id ? ' · ' + v.name : ''));
    const head = el.querySelector('.insp-head h3');
    const area = roomArea(r);
    // basics
    const name = h('input', { class: 'input', id: 'f-room-name', value: r.name, disabled: ro, autocomplete: 'off' });
    name.addEventListener('input', () => { head.textContent = name.value || 'Room'; upd(rr => { rr.name = name.value; }, { coalesce: 'name:' + r.id }); });
    el.appendChild(h('div', { class: 'insp-sec' },
      h('div', { class: 'field' }, h('label', { for: 'f-room-name' }, 'Name'), name),
      h('dl', { class: 'kv' }, h('dt', null, 'Floor area'), h('dd', null, fmtArea(area)), h('dt', null, 'Storey'), h('dd', { style: { fontFamily: 'var(--font-ui)' } }, st ? st.name : '—'))));
    // floor
    const mat = h('select', { class: 'select', id: 'f-floor-mat', disabled: ro }, ...FLOOR_MATERIALS.map(f => h('option', { value: f.id, selected: r.floor.material === f.id }, f.label)));
    mat.addEventListener('change', () => { const f = FLOOR_MATERIALS.find(x => x.id === mat.value); upd(rr => { rr.floor.material = mat.value; if (f && (!rr.floor.color || FLOOR_MATERIALS.some(x => x.color.toLowerCase() === (rr.floor.color || '').toLowerCase()))) rr.floor.color = f.color; }, { keepInspector: false }); });
    const fc = h('input', { type: 'color', id: 'f-floor-col', value: r.floor.color || '#b9b5ac', disabled: ro, 'aria-label': 'Floor colour' });
    fc.addEventListener('input', () => upd(rr => { rr.floor.color = fc.value; }, { coalesce: 'fc:' + r.id }));
    const floorSw = ['#C49A6C', '#A77B4F', '#D8C3A0', '#8C8780', '#8D9192', '#5E6266', '#D9D4CA', '#B9B5AC'];
    el.appendChild(h('div', { class: 'insp-sec' },
      h('div', { class: 'eyebrow' }, 'Floor'),
      h('div', { class: 'field' }, h('label', { for: 'f-floor-mat' }, 'Material'), mat),
      this.floorProductFields(r, ro, upd),
      r.heat && r.heat.on ? this.floorHeatLine(r) : null,
      this.floorPhotoControls(r, ro, upd),
      this.floorPatternControls(r, ro, upd),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Colour'),
        h('div', { class: 'color-row' }, fc, h('div', { class: 'swatches' }, ...floorSw.map(c => h('button', { class: 'swatch', style: { background: c }, disabled: ro, 'aria-label': 'Floor colour ' + c, 'aria-pressed': String((r.floor.color || '').toLowerCase() === c.toLowerCase()), onclick: () => upd(rr => { rr.floor.color = c; }, { keepInspector: false }) }))))),
      ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { const c = await this.colourPicker({ value: r.floor.color, title: t('Floor colour') }); if (c) upd(rr => { rr.floor.color = c.hex; }, { keepInspector: false }); } }, icon('eye'), t('Colour library')))));
    // walls (the room's finish, tiles, each wall) and the ceiling
    this.roomWallsSection(el, r, ro, upd, v.plan);
    this.roomCeilingSection(el, r, ro, upd, v.plan);
    this.roomInstallSection(el, r, ro, v.plan);
    this.roomTasksSection(el, r);
    this.roomQtySection(el, r, ro, v.plan);
    // notes + items
    const notes = h('textarea', { class: 'textarea', id: 'f-notes', disabled: ro, placeholder: 'What happens in this room: walls, electrics, heating, choices still open…' });
    notes.value = r.notes || '';
    notes.addEventListener('input', () => upd(rr => { rr.notes = notes.value; }, { coalesce: 'notes:' + r.id }));
    const items = h('div', { class: 'items' });
    (r.items || []).forEach((it, i) => {
      const inp = h('input', { class: 'input', value: it.text, disabled: ro, 'aria-label': 'Item ' + (i + 1), autocomplete: 'off' });
      inp.addEventListener('input', () => upd(rr => { const x = rr.items.find(y => y.id === it.id); if (x) x.text = inp.value; }, { coalesce: 'item:' + it.id }));
      items.appendChild(h('div', { class: 'item' }, inp, ro ? null : h('button', { class: 'btn ghost icon sm', 'aria-label': 'Remove item', onclick: () => upd(rr => { rr.items = rr.items.filter(y => y.id !== it.id); }, { keepInspector: false }) }, icon('close'))));
    });
    const add = h('input', { class: 'input', id: 'f-item-add', placeholder: 'Add item, e.g. walk-in shower 120 × 90', disabled: ro, autocomplete: 'off' });
    const addIt = () => { const t = add.value.trim(); if (!t) return; upd(rr => { (rr.items ||= []).push({ id: uid('i_'), text: t }); }, { keepInspector: false }); setTimeout(() => $('#f-item-add') && $('#f-item-add').focus(), 30); };
    add.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
    el.appendChild(h('div', { class: 'insp-sec' },
      h('div', { class: 'field' }, h('label', { for: 'f-notes' }, 'Notes'), notes),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Items (kitchen, bathroom, fittings…)'), items,
        ro ? null : h('div', { class: 'item' }, add, h('button', { class: 'btn sm', onclick: addIt }, icon('plus'), 'Add')))));
    // what changed vs the base
    const diff = this.currentDiff;
    if (this.display === 'diff' && diff && v && v.id === this.shownVersion().id) {
      const ch = diff.rooms.changed.find(c => c.room.id === r.id);
      const isNew = diff.rooms.added.some(x => x.id === r.id);
      if (ch || isNew) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, 'Compared with ' + this.baseVersion().name), isNew ? h('p', { class: 'note-muted' }, 'This room is new.') : this.changeRows(ch.changes)));
    }
    this.roomNotesSection(el, r);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' }, h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), 'Delete room')),
      this.view.dim === '2d' ? h('p', { class: 'note-muted' }, 'Drag the small handles to adjust the corners.') : null));
    else if (this.mode !== 'build' && !sel.readOnly) el.appendChild(h('div', { class: 'insp-sec' }, h('p', { class: 'note-muted' }, t('Switch to Build to change this room.'))));
  },

  changeRows(changes) {
    const box = h('div', { style: { display: 'grid', gap: '4px' } });
    for (const c of changes) {
      const val = (x) => c.swatch ? h('span', { class: 'mini-sw big', style: { background: x }, title: x }) : (c.long ? (x || '—').slice(0, 140) + ((x || '').length > 140 ? '…' : '') : (x || '—'));
      box.appendChild(h('div', { class: 'ch-change' }, h('span', { class: 'f' }, c.field),
        h('span', { class: 'v' }, c.long ? null : h('span', { class: 'from' }, val(c.from)), c.long ? null : ' → ', val(c.to))));
    }
    return box;
  },

  overviewPanel(el) {
    const p = this.project;
    const shown = this.shownVersion();
    const st = this.currentStorey();
    const scopeStorey = this.view.scope === 'storey';
    this.inspHead(el, this.display === 'diff' ? 'Changes' : (scopeStorey && st ? st.name : 'All storeys'), shown.kind === 'original' ? 'Original' : shown.name);
    if (this.display === 'diff') this.changesSection(el);
    // rooms of this storey (or all)
    const storeys = scopeStorey && st ? [st] : sortedStoreys(p);
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, 'Rooms', h('span', { class: 'num', style: { fontSize: '12px', letterSpacing: 0 } }, '')));
    let total = 0;
    const list = h('div', { class: 'room-list' });
    for (const s2 of storeys) {
      const rooms = shown.plan.rooms.filter(r => r.storey === s2.id);
      if (storeys.length > 1) list.appendChild(h('div', { class: 'group-title' }, s2.name));
      if (!rooms.length) list.appendChild(h('p', { class: 'note-muted' }, scopeStorey ? 'No rooms yet. Use the Room tool and tap inside the walls.' : 'No rooms.'));
      for (const r of rooms) {
        const a = roomArea(r); total += a;
        list.appendChild(h('button', { class: 'room-row', onclick: () => this.select({ type: 'room', id: r.id, storey: r.storey }) },
          h('span', { class: 'sw', style: { background: r.floor.color } }), h('span', null, r.name), h('span', { class: 'ar' }, fmtArea(a))));
      }
    }
    if (total > 0) list.appendChild(h('div', { class: 'room-row total' }, h('span'), h('span', null, 'Total floor area'), h('span', { class: 'ar' }, fmtArea(total))));
    sec.appendChild(list);
    // floor heating: floors that let too little heat through (ISSO 49)
    const tooWarm = shown.plan.rooms.filter(r => storeys.some(s2 => s2.id === r.storey) && r.heat && r.heat.on && floorHeatR(r.floor).verdict === 'bad');
    if (tooWarm.length) sec.appendChild(h('div', { class: 'warn-line', id: 'fh-warn-list' }, icon('alert'), h('span', null, t('Floor heating: the floor is too insulating in'), ' ',
      ...tooWarm.flatMap((r, i) => [i ? ', ' : '', h('button', { class: 'linkish', onclick: () => this.select({ type: 'room', id: r.id, storey: r.storey }) }, r.name)]))));
    el.appendChild(sec);
    // the garden (ground floor); fit-out: quantities, budget, tasks
    this.gardenOverviewSection(el);
    this.fitoutSection(el);
    // version note
    const note = h('textarea', { class: 'textarea', id: 'f-vnote', disabled: shown.locked, placeholder: 'What is this version about?' });
    note.value = shown.note || '';
    note.addEventListener('input', () => this.mutate(() => { shown.note = note.value; }, { project: true, coalesce: 'vnote:' + shown.id, keepInspector: true }));
    el.appendChild(h('div', { class: 'insp-sec vcard' },
      h('div', { class: 'eyebrow' }, shown.kind === 'original' ? 'Original' : 'Version', h('button', { class: 'btn ghost sm', onclick: () => this.versionsSheet() }, 'All versions')),
      h('div', { style: { fontWeight: 650 } }, shown.name, shown.locked ? h('span', { class: 'badge locked', style: { marginLeft: '8px' } }, 'Locked') : null),
      h('div', { class: 'note-muted' }, t('Changed {when}', { when: fmtAgo(shown.updated || p.updated) })),
      note));
    // drawing (underlay)
    if (scopeStorey && st && this.view.dim === '2d') this.drawingSection(el, st);
  },

  changesSection(el) {
    const diff = this.currentDiff;
    const base = this.baseVersion(), shown = this.shownVersion();
    const p = this.project;
    const sel = h('select', { class: 'select', id: 'f-compare-base' }, ...p.versions.filter(v => v.id !== shown.id).map(v => h('option', { value: v.id, selected: v.id === base.id }, v.kind === 'original' ? v.name + ' (original)' : v.name)));
    sel.addEventListener('change', () => { this.compareBaseId = sel.value; this.refreshViews(false); this.renderInspector(); });
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'field' }, h('label', { for: 'f-compare-base' }, `“${shown.name}” compared with`), sel));
    el.appendChild(sec);
    if (!diff) { sec.appendChild(h('p', { class: 'note-muted' }, 'Pick a different version to compare.')); return; }
    const box = h('div', { class: 'insp-sec changes' });
    if (!diff.count) box.appendChild(h('p', { class: 'note-muted' }, 'No differences.'));
    const cur = this.view.scope === 'storey' ? this.view.storeyId : null;
    const ordered = sortedStoreys(p).sort((a, b) => (b.id === cur) - (a.id === cur));
    for (const st of ordered) {
      const sum = diff.byStorey[st.id];
      if (!sum) continue;
      const g = h('div', { class: 'ch-storey' }, h('h4', null, st.name));
      if (sum.newLen > 0.01) g.appendChild(h('div', { class: 'ch-line' }, h('i', { style: { background: 'var(--new)' } }), h('span', null, `${fmtM(sum.newLen)} new wall`)));
      if (sum.demoLen > 0.01) g.appendChild(h('div', { class: 'ch-line' }, h('i', { style: { background: 'var(--demo)' } }), h('span', null, `${fmtM(sum.demoLen)} wall to demolish`)));
      // demolition in load-bearing walls (taken out, or an opening cut into one)
      const loadDemo = diff.demoParts.filter(q => q.wall.storey === st.id && q.wall.load === true).reduce((a, q) => a + (q.e - q.s), 0);
      if (loadDemo > 0.01) g.appendChild(h('div', { class: 'ch-line ch-warn', id: 'ch-load-' + st.id }, icon('alert'), h('span', null, t('{m} of it in load-bearing walls – check with your builder', { m: fmtM(loadDemo) }))));
      const parts = [];
      if (sum.newDoors) parts.push(`${sum.newDoors} door${sum.newDoors > 1 ? 's' : ''} / opening${sum.newDoors > 1 ? 's' : ''} added`);
      if (sum.removedDoors) parts.push(`${sum.removedDoors} removed`);
      if (sum.newWindows) parts.push(`${sum.newWindows} window${sum.newWindows > 1 ? 's' : ''} added`);
      if (sum.removedWindows) parts.push(`${sum.removedWindows} window${sum.removedWindows > 1 ? 's' : ''} removed`);
      if (parts.length) g.appendChild(h('div', { class: 'ch-line' }, h('i', { style: { background: 'var(--ink-3)' } }), h('span', null, parts.join(', '))));
      const roomBtn = (r, tag, tagCls, bodyNode) => h('button', { class: 'ch-room', onclick: () => this.select({ type: 'room', id: r.id, storey: r.storey, ...(tagCls === 'removed' ? { versionId: base.id, readOnly: true } : {}) }) },
        h('div', { class: 'ch-room-head' }, h('span', null, r.name), h('span', { class: 'tag ' + tagCls }, tag)), bodyNode);
      for (const r of diff.rooms.added.filter(x => x.storey === st.id)) g.appendChild(roomBtn(r, 'New', 'added', h('div', { class: 'note-muted' }, fmtArea(roomArea(r)) + ' · ' + floorLabel(r.floor.material))));
      for (const r of diff.rooms.removed.filter(x => x.storey === st.id)) g.appendChild(roomBtn(r, 'Gone', 'removed', h('div', { class: 'note-muted' }, 'No longer a separate room')));
      for (const c of diff.rooms.changed.filter(x => x.room.storey === st.id)) g.appendChild(roomBtn(c.room, 'Changed', 'changed', this.changeRows(c.changes)));
      box.appendChild(g);
    }
    // the garden
    const gch = gardenChanges(base.plan.garden, shown.plan.garden);
    if (gch.length) {
      const g = h('div', { class: 'ch-storey ch-garden' }, h('h4', null, t('Garden')));
      for (const line of gch) g.appendChild(h('div', { class: 'ch-line' }, h('i', { style: { background: 'var(--accent)' } }), h('span', null, line)));
      box.appendChild(g);
    }
    el.appendChild(box);
  },

  drawingSection(el, st) {
    const p = this.project;
    const u = p.underlays[st.id];
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, 'Drawing of ' + st.name));
    if (!u) {
      sec.appendChild(h('p', { class: 'note-muted' }, 'Load the builder\'s floor plan (PDF or photo) to trace over.'));
      sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => this.importDrawing(st.id) }, icon('image'), 'Load drawing'),
        (p.docs || []).length ? h('button', { class: 'btn sm', id: 'btn-draw-doc', onclick: () => this.drawingFromDocument(st.id) }, icon('doc'), t('From a document')) : null));
    } else {
      const op = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: u.opacity ?? 0.5, id: 'f-ul-op', style: { width: '100%', accentColor: 'var(--accent)' } });
      op.addEventListener('input', () => { u.opacity = parseFloat(op.value); Saver.markDirty(); this.refreshViews(false); });
      sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-ul-op' }, 'Visibility'), op));
      sec.appendChild(h('div', { class: 'note-muted num', style: { fontSize: '12px' } }, `Scale: 1 px = ${(u.mPerPx * 1000).toFixed(2)} mm` + (u.calibrated ? '' : ' (not set yet)')));
      sec.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm' + (u.calibrated ? '' : ' primary'), onclick: () => this.calibrate(st.id) }, icon('measure'), 'Set scale'),
        h('button', { class: 'btn sm', onclick: () => this.setOrigin(st.id) }, icon('target'), 'Set reference corner'),
        h('button', { class: 'btn sm', onclick: () => { u.visible = u.visible === false; Saver.markDirty(); this.refreshViews(false); this.renderInspector(); } }, icon('eye'), u.visible === false ? 'Show' : 'Hide'),
        h('button', { class: 'btn sm', onclick: () => this.importDrawing(st.id) }, icon('image'), 'Replace'),
        h('button', { class: 'btn sm danger', onclick: () => this.removeDrawing(st.id) }, icon('trash'), 'Remove')));
      sec.appendChild(h('p', { class: 'note-muted' }, 'Use the same outside corner as reference on every storey, so the storeys line up in 3D.'));
    }
    el.appendChild(sec);
    if (this.storeyDocsSection) this.storeyDocsSection(el, st);
  },

  /* ───────── drawings: import, scale, reference corner ───────── */
  async importDrawing(storeyId) {
    const file = await pickFile('image/*,application/pdf,.pdf');
    if (!file) return;
    let dataUrl, w, hgt;
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        this.toast('Reading the PDF…');
        ({ dataUrl, w, h: hgt } = await this.renderPdf(file));
      } else {
        const src = await readFileAs(file, 'dataurl');
        const img = await loadImage(src);
        ({ dataUrl, w, h: hgt } = this.downscale(img, img.naturalWidth, img.naturalHeight));
      }
    } catch (e) {
      console.error(e);
      if (e && e.message === 'cancelled') return;
      this.toast(e && e.message ? e.message : 'Could not read that file.', { ms: 7000 });
      return;
    }
    await this.useDrawing(storeyId, { dataUrl, w, h: hgt });
  },
  /** Load drawing → from the house's documents: which page of which document */
  async drawingFromDocument(storeyId) {
    const docs = (this.project.docs || []);
    if (!docs.length) { this.documentsSheet(); return; }
    const pre = docsOfStorey(this.project, storeyId)[0];
    const sel = h('select', { class: 'select', id: 'f-ddoc' }, ...docs.map(d => h('option', { value: d.id, selected: pre ? pre.doc.id === d.id : false }, d.name + ' · ' + docMeta(d))));
    const pg = h('input', { class: 'input', type: 'number', id: 'f-ddoc-page', min: 1, value: pre ? String(pre.page) : '1', inputmode: 'numeric' });
    const body = h('div', null, h('div', { class: 'field' }, h('label', { for: 'f-ddoc' }, t('Document')), sel), h('div', { class: 'field' }, h('label', { for: 'f-ddoc-page' }, t('Page')), pg));
    const v = await UI.dialog({ title: t('Drawing from a document'), body, actions: [{ label: t('Cancel'), value: null }, { label: t('Use it'), kind: 'primary', value: () => ({ id: sel.value, page: parseInt(pg.value, 10) || 1 }) }] });
    if (!v) return;
    const d = docs.find(x => x.id === v.id);
    if (d) await this.docAsDrawing(d, clamp(v.page, 1, d.pages || 1), storeyId);
  },

  downscale(img, w, hgt, max = 4096) {
    const k = Math.min(1, max / Math.max(w, hgt));
    const cw = Math.round(w * k), ch = Math.round(hgt * k);
    const cv = makeCanvas(cw, ch);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
    g.drawImage(img, 0, 0, cw, ch);
    return { dataUrl: cv.toDataURL('image/jpeg', 0.86), w: cw, h: ch };
  },

  /** the PDF reader (pdf.js) is built into the app: unpacked the first time a PDF is opened, no internet needed */
  async loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    const fail = () => new Error('The PDF reader could not be started in this browser. Load a screenshot or photo of the drawing instead.');
    let lib, worker;
    try { [lib, worker] = await Promise.all([gunzipBase64(PDFJS_GZ.lib), gunzipBase64(PDFJS_GZ.worker)]); } catch (e) { throw fail(); }
    const url = URL.createObjectURL(new Blob([lib], { type: 'text/javascript' }));
    await new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = url;
      sc.onload = resolve;
      sc.onerror = () => reject(fail());
      document.head.appendChild(sc);
    });
    if (!window.pdfjsLib) throw fail();
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
    return window.pdfjsLib;
  },

  async renderPdf(file) {
    const lib = await this.loadPdfJs();
    const data = new Uint8Array(await readFileAs(file, 'buffer'));
    const doc = await lib.getDocument({ data }).promise;
    let pageNo = 1;
    if (doc.numPages > 1) {
      const v = await UI.prompt({ title: 'Which page?', label: `This PDF has ${doc.numPages} pages. Which page shows this storey?`, value: '1', type: 'number', confirmLabel: 'Use page' });
      if (v == null) throw new Error('cancelled');
      pageNo = clamp(parseInt(v, 10) || 1, 1, doc.numPages);
    }
    const page = await doc.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4096 / Math.max(vp1.width, vp1.height), 6);
    const vp = page.getViewport({ scale });
    const cv = makeCanvas(Math.round(vp.width), Math.round(vp.height));
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return { dataUrl: cv.toDataURL('image/jpeg', 0.86), w: cv.width, h: cv.height };
  },

  mainPlanView() { const pn = this.panes.find(x => x.kind === '2d' && x.role === 'main'); return pn && pn.view; },

  startPicking(text, need, done) {
    const view = this.mainPlanView();
    if (!view) return;
    this.setTool('select', true);
    this.picking = { text };
    view.pickPoints(need, pts => { this.picking = null; this.renderStageOverlays(); done(pts); });
    this.renderStageOverlays();
  },
  cancelPicking() { const v = this.mainPlanView(); if (v) v.cancelPick(); this.picking = null; this.renderStageOverlays(); },

  calibrate(storeyId, fresh) {
    if (this.view.dim !== '2d' || this.view.scope !== 'storey' || this.view.storeyId !== storeyId) { this.view = { ...this.view, dim: '2d', scope: 'storey', storeyId }; this.renderEditorChrome(); this.setupPanes(true); }
    if (window.matchMedia('(max-width: 860px)').matches) this.toggleInspector(false);
    this.startPicking('Set the scale: tap both ends of a measurement you know, like the outside wall. Zoom in for accuracy.', 2, async pts => {
      const u = this.project.underlays[storeyId];
      if (!u) return;
      const cur = V.dist(pts[0], pts[1]);
      const v = await UI.prompt({ title: 'How long is that?', label: 'Real length between the two points', value: u.calibrated ? fmtMM(cur) : '', placeholder: 'e.g. 7200', unit: 'mm', type: 'text', confirmLabel: 'Set scale', hint: 'Use the dimension written on the drawing. Longer measurements give a more accurate scale.' });
      if (v == null) return;
      const D = parseFloat(String(v).replace(',', '.')) / 1000;
      if (!isFinite(D) || D <= 0) { this.toast('That is not a length. Try again with a number in millimetres.'); return; }
      const pxDist = cur / u.mPerPx;
      const nm = D / pxDist;
      const ip1 = [(pts[0][0] - u.x) / u.mPerPx, (pts[0][1] - u.y) / u.mPerPx];
      this.mutate(proj => {
        const uu = proj.underlays[storeyId];
        uu.mPerPx = nm; uu.x = pts[0][0] - ip1[0] * nm; uu.y = pts[0][1] - ip1[1] * nm; uu.calibrated = true;
      }, { project: true });
      this.refreshViews(true);
      this.renderInspector();
      if (fresh) {
        const plan = this.shownVersion().plan;
        const hasWalls = plan.walls.some(w => w.storey === storeyId);
        if (!hasWalls) this.setOrigin(storeyId, true);
      } else this.toast('Scale set.');
    });
  },

  setOrigin(storeyId, afterCalib) {
    this.startPicking('Tap the outside corner you want as the reference point (use the same corner on every storey).', 1, async pts => {
      const P = pts[0];
      const plan = this.shownVersion().plan;
      const hasWalls = plan.walls.some(w => w.storey === storeyId) || this.project.versions.some(v => v.plan.walls.some(w => w.storey === storeyId));
      if (hasWalls) {
        const ok = await UI.confirm({ title: 'Move the drawing?', message: 'This moves the drawing so that corner is the reference point. Walls already drawn on this storey stay where they are, so they may no longer line up with the drawing.', confirmLabel: 'Move drawing' });
        if (!ok) return;
      }
      this.mutate(proj => { const u = proj.underlays[storeyId]; u.x -= P[0]; u.y -= P[1]; }, { project: true });
      this.refreshViews(true);
      this.toast(afterCalib ? 'Drawing ready. Trace it with the Wall tool, then add doors, windows and rooms.' : 'Reference corner set.', { ms: 6000 });
      if (afterCalib && this.canEdit()) this.setTool('wall');
    });
  },

  async removeDrawing(storeyId) {
    const ok = await UI.confirm({ title: 'Remove this drawing?', message: 'The walls and rooms you traced stay. You can undo this.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    this.mutate(proj => { delete proj.underlays[storeyId]; }, { project: true });
    this.renderInspector();
  },

  /* ───────── menus ───────── */
  editorMenu(anchor) {
    const shown = this.shownVersion();
    if (this.isViewer()) {
      UI.menu(anchor, [
        { label: t('Send notes back…'), icon: 'share', fn: () => this.sendNotesBack() },
        { label: t('Save a picture of this view'), icon: 'camera', fn: () => this.savePicture() },
        { label: t('Drawings: façades and sections…'), icon: 'ruler', fn: () => this.drawingsSheet() },
        { label: t('Plans as PDF, to scale…'), icon: 'print', fn: () => this.plansPdfSheet() },
        { label: 'Settings', icon: 'settings', fn: () => this.settingsSheet() },
        this.fullscreenMenuItem(),
        { label: 'All projects', icon: 'home', fn: () => this.showHome() },
      ].filter(Boolean));
      return;
    }
    UI.menu(anchor, [
      { heading: t('This version') },
      { label: 'Versions…', icon: 'layers', fn: () => this.versionsSheet() },
      { label: 'New version from this one', icon: 'copy', fn: () => this.newVersionDialog(shown.id) },
      { label: 'Make a save point', icon: 'save', fn: () => this.savePointDialog() },
      { label: 'Save points and autosaves…', icon: 'history', fn: () => this.savePointsSheet() },
      { heading: t('Save and share') },
      { label: t('Export this house…'), icon: 'share', id: 'mi-export', fn: () => this.exportDialog() },
      { label: t('Export for viewing (family, suppliers)…'), icon: 'eye', fn: () => this.viewerExportDialog() },
      this.folderSupported() ? { label: t('Automatic backup into a folder…'), icon: 'folder', id: 'mi-folder', fn: () => this.folderDialog() } : null,
      { label: t('Save a picture of this view'), icon: 'camera', fn: () => this.savePicture() },
      { label: t('Photo render…'), icon: 'camera', id: 'mi-render-more', fn: () => this.renderSheet() },
      { label: 'Import a house file…', icon: 'upload', fn: () => this.importFlow() },
      { label: t('Merge a copy of this house…'), icon: 'split', fn: () => this.mergeFileFlow() },
      { heading: t('Lists') },
      { label: t('Quantities and materials…'), icon: 'table', fn: () => this.quantitiesSheet() },
      { label: t('Budget…'), icon: 'euro', fn: () => this.budgetSheet() },
      { label: t('Task board…'), icon: 'board', fn: () => this.tasksSheet() },
      { label: t('Documents (PDFs and pictures)…'), icon: 'doc', id: 'mi-docs', fn: () => this.documentsSheet() },
      { label: t('Drawings: façades and sections…'), icon: 'ruler', fn: () => this.drawingsSheet() },
      { label: t('Plans as PDF, to scale…'), icon: 'print', fn: () => this.plansPdfSheet() },
      { label: t('Colour library…'), icon: 'eye', fn: () => this.colourPicker() },
      { heading: t('House') },
      { label: 'Storeys…', icon: 'layers', fn: () => this.storeysSheet() },
      { label: 'Rename project', icon: 'edit', fn: () => this.renameProject() },
      { label: t('Undo history'), icon: 'history', fn: () => this.historySheet() },
      { heading: t('App') },
      // (task 0010: the Phone level's compressed pictures off – or on again – in two taps, for a chip that shows them wrong)
      this.setPicturesPlain && levelKnobs(this.settings).ktx2 ? { label: this.settings.texPlain ? t('3D pictures: compressed again') : t('3D pictures as before'), icon: 'eye', id: 'mi-pics', fn: () => {
        const plain = !this.settings.texPlain;
        this.setPicturesPlain(plain);
        this.toast(plain ? t('3D pictures as before on this device (Settings → 3D on this device).') : t('3D pictures compressed again (less memory).'));
      } } : null,
      { label: t('Search…'), icon: 'search', fn: () => this.searchOpen() },
      this.fullscreenMenuItem(),
      { label: t('Help: what each button does'), icon: 'question', fn: () => this.helpOverlay() },
      { label: t('Send feedback…'), icon: 'edit', id: 'mi-feedback', fn: () => this.feedbackDialog() },
      { label: 'Settings', icon: 'settings', fn: () => this.settingsSheet() },
      { label: 'All projects', icon: 'home', fn: () => this.showHome() },
    ].filter(Boolean));
  },

  viewMenu(anchor) {
    const s = this.settings;
    const set = (k, v) => { Settings.set(k, v); this.refreshViews(false); };
    const row = (label, node) => ({ node: h('div', { class: 'mrow' }, h('span', null, label), node) });
    const seg = (key, opts) => { const box = h('div', { class: 'seg' }); for (const [v, lab] of opts) { const b = h('button', { 'aria-pressed': String(s[key] === v), onclick: () => { set(key, v); for (const x of box.children) x.setAttribute('aria-pressed', String(x === b)); } }, lab); box.appendChild(b); } return box; };
    const toggle = (key) => { const b = h('button', { class: 'chip', 'aria-pressed': String(!!s[key]) }, s[key] ? 'On' : 'Off'); b.onclick = () => { set(key, !s[key]); b.setAttribute('aria-pressed', String(!!s[key])); b.textContent = s[key] ? 'On' : 'Off'; }; return b; };
    // roof and façade: one switch for the group, and one for each part
    const parts = [['roof', 'Roof'], ['plinth', 'Dark brick plinth'], ['outside', 'Outside walls'], ['windows', 'Windows & outside doors']];
    const onOf = k => s[k] !== false;
    const groupChip = h('button', { class: 'chip' });
    const subChips = {};
    const paint = () => {
      const n = parts.filter(([k]) => onOf(k)).length;
      groupChip.setAttribute('aria-pressed', String(n > 0));
      groupChip.textContent = n === parts.length ? 'On' : n ? 'Some' : 'Off';
      for (const [k] of parts) { subChips[k].setAttribute('aria-pressed', String(onOf(k))); subChips[k].textContent = onOf(k) ? 'On' : 'Off'; }
    };
    for (const [k] of parts) subChips[k] = h('button', { class: 'chip', onclick: () => { Settings.set(k, !onOf(k)); paint(); this.refreshViews(false); } });
    groupChip.onclick = () => {
      const all = parts.every(([k]) => onOf(k));
      for (const [k] of parts) s[k] = !all;
      Settings.save();
      paint();
      this.refreshViews(false);
    };
    // the parts fold away (folded on phones at first, so the menu stays short); the menu scrolls to show them
    const open0 = s.viewGroupOpen != null ? !!s.viewGroupOpen : !window.matchMedia('(max-width: 560px)').matches;
    const sub = h('div', { class: 'mgroup-sub', hidden: !open0 }, ...parts.map(([k, label]) => h('div', { class: 'mrow sub' }, h('span', null, label), subChips[k])));
    const fold = h('button', { class: 'mg-fold', 'aria-expanded': String(open0), title: 'Show or hide the parts' }, icon('chevron'), h('span', null, '3D: roof & façade'));
    fold.onclick = () => {
      const show = sub.hidden;
      sub.hidden = !show;
      fold.setAttribute('aria-expanded', String(show));
      s.viewGroupOpen = show; Settings.save();
      if (show) requestAnimationFrame(() => sub.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    const shellGroup = h('div', { class: 'mgroup' }, h('div', { class: 'mrow' }, fold, groupChip), sub);
    paint();
    const explode = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.explode || 0, 'aria-label': 'Explode storeys' });
    explode.addEventListener('input', () => { s.explode = parseFloat(explode.value); Settings.save(); this.refreshViews(false); });
    const lightSeg = h('div', { class: 'seg' }, ...[['day', 'sun', t('Day')], ['evening', 'moon', t('Evening')], ['sun', 'compass', t('Sun')]].map(([v, ic, lab]) => {
      const b = h('button', { 'aria-pressed': String((s.light || 'day') === v), onclick: () => { set('light', v); for (const x of b.parentNode.children) x.setAttribute('aria-pressed', String(x === b)); this.refreshPip && this.refreshPip(true); } }, icon(ic), lab);
      return b;
    }));
    const qSeg = this.qualitySeg('mi-quality');
    // what to show: big buttons at the top (the garden first), each one switches on and off
    const showBtn = (key, ic, label, title, get) => {
      const on = get || (() => s[key] !== false);
      const b = h('button', { class: 'show-btn', id: 'show-' + key, 'aria-pressed': String(on()), title }, icon(ic), h('span', null, label));
      b.onclick = () => {
        // Electrics and Ceiling are separate from the first touch on (until then Ceiling follows Electrics); so are
        // the garden, the street, the houses around and water and park (until then they follow Garden)
        if (key === 'installs' && s.ceilItems == null) Settings.set('ceilItems', ceilShown(s));
        if (G_SHOW_KEYS.includes(key)) { const cur = gShow(s); for (const k of G_SHOW_KEYS) if (s[k] == null) Settings.set(k, cur[k]); }
        set(key, !on()); b.setAttribute('aria-pressed', String(on()));
      };
      return b;
    };
    const site = (k) => () => gShow(s)[k];
    const showRow = h('div', { class: 'show-row', role: 'group', 'aria-label': t('Show') },
      showBtn('garden', 'plant', t('Garden'), t('Your garden: the plot and what is on it'), site('garden')),
      showBtn('street', 'path', t('Street'), t('The street: road, pavements, kerbs, street trees and lamps'), site('street')),
      showBtn('houses', 'home', t('Neighbours'), t('The houses around yours, as the site plan has them'), site('houses')),
      showBtn('park', 'map', t('Water & park'), t('The canals, quays, reeds and the park'), site('park')),
      showBtn('furniture', 'sofa', t('Furniture'), t('Furniture')),
      showBtn('notesOn', 'pin', t('Notes'), t('Notes (pins)')),
      showBtn('installs', 'socket', t('Electrics'), t('Electrics and installations on walls and floors')),
      showBtn('ceilItems', 'ceiling', t('Ceiling'), t('On the ceiling: lights, smoke alarms, ventilation valves'), () => ceilShown(s)));
    UI.menu(anchor, [
      { node: h('div', { class: 'show-head' }, t('Show')) },
      { node: showRow },
      { label: t('Photo render of this view'), icon: 'camera', id: 'mi-render', fn: () => this.renderSheet() },
      { label: t('AR: the plan in the real room'), icon: 'cube', id: 'mi-ar', fn: () => this.arStart() },
      '-',
      row('Colour rooms by', seg('colorBy', [['floor', 'Floor'], ['walls', 'Walls'], ['progress', t('Progress')], ['none', 'None']])),
      row('Room names', toggle('labels')),
      row('Wall lengths', toggle('dims')),
      row(t('Load-bearing walls (hatched)'), (() => { const on = () => s.loadWalls !== false; const b = h('button', { class: 'chip', id: 'mi-load', 'aria-pressed': String(on()) }, on() ? 'On' : 'Off'); b.onclick = () => { set('loadWalls', !on()); b.setAttribute('aria-pressed', String(on())); b.textContent = on() ? 'On' : 'Off'; }; return b; })()),
      row('Drawing underneath', toggle('underlay')),
      row('Storey below (faint)', toggle('ghost')),
      '-',
      row('3D: cut walls to see in', toggle('cut')),
      row('3D: pull storeys apart', explode),
      row('3D: ground under the house', toggle('ground')),
      row('3D: floors', toggle('floors')),
      row(t('3D: ceilings (seen from inside)'), toggle('ceilings')),
      row(t('3D: heights of sockets and switches'), (() => { const b = toggle('ptHeights'); b.id = 'mi-pt-heights'; return b; })()),
      row(t('3D: light'), lightSeg),
      row(t('3D: quality'), qSeg),
      row(t('3D: soft shadows in corners (Beautiful)'), (() => {
        const on = s.ao !== false;
        const b = h('button', { class: 'chip', id: 'mi-ao', 'aria-pressed': String(on) }, on ? 'On' : 'Off');
        b.onclick = () => { const nv = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(nv)); b.textContent = nv ? 'On' : 'Off'; Settings.set('ao', nv); for (const pane of this.panes) if (pane.view) pane.view.needs = true; };
        return b;
      })()),
      { node: shellGroup },
      '-',
      row('Snap to', seg('grid', [[0, 'Off'], [0.01, '1 cm'], [0.05, '5 cm'], [0.1, '10 cm']])),
      row(t('Rooms follow the walls'), (() => { const on = s.roomFollow !== false; const b = h('button', { class: 'chip', id: 'mi-follow', 'aria-pressed': String(on) }, on ? 'On' : 'Off'); b.onclick = () => { const nv = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(nv)); b.textContent = nv ? 'On' : 'Off'; Settings.set('roomFollow', nv); }; return b; })()),
    ], {});
  },

  /* ───────── versions ───────── */
  async versionsSheet() {
    const p = this.project;
    if (p && p.viewer) return this.viewerVersionsMenu();
    const shown = this.shownVersion();
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    const render = () => {
      body.textContent = '';
      const showDisabled = !!this.settings.showDisabled;
      const list = h('div', { class: 'list' });
      for (const v of p.versions) {
        if (v.status === 'disabled' && !showDisabled) continue;
        const isShown = v.id === this.shownVersion().id;
        const isOrig = v.kind === 'original';
        const actions = h('div', { class: 'lr-actions' });
        if (!isShown) actions.appendChild(h('button', { class: 'btn sm primary', onclick: () => { close(); this.setActiveVersion(v.id); } }, 'Open'));
        const more = h('button', { class: 'btn ghost icon sm', 'aria-label': 'More for ' + v.name }, icon('more'));
        more.onclick = () => UI.menu(more, [
          { label: 'Rename', icon: 'edit', fn: async () => { const n = await UI.prompt({ title: 'Rename version', label: 'Name', value: v.name }); if (n && n.trim()) { this.mutate(() => { v.name = n.trim(); }, { project: true }); this.renderEditorChrome(); render(); } } },
          { label: 'Copy into a new version', icon: 'copy', fn: () => { close(); this.newVersionDialog(v.id); } },
          !isShown ? { label: 'Compare with the open version', icon: 'split', fn: () => { close(); this.compareBaseId = v.id; this.setDisplay('diff'); } } : null,
          { label: v.locked ? 'Unlock' : 'Lock', icon: v.locked ? 'unlock' : 'lock', fn: () => { this.toggleLock(v); setTimeout(render, 50); } },
          !isOrig ? { label: v.status === 'disabled' ? 'Enable' : 'Disable (hide from list)', icon: 'eye', fn: () => this.toggleDisabled(v, render) } : null,
          !isOrig ? '-' : null,
          !isOrig ? { label: 'Move to trash', icon: 'trash', danger: true, fn: () => this.deleteVersion(v, render) } : null,
        ]);
        actions.appendChild(more);
        list.appendChild(h('div', { class: 'list-row' + (isShown ? ' current' : '') + (v.status === 'disabled' ? ' dim' : '') },
          h('div', { class: 'lr-main' },
            h('div', { class: 'lr-title' }, h('span', { class: 't' }, v.name),
              isOrig ? h('span', { class: 'badge' }, 'Original') : null,
              v.locked ? h('span', { class: 'badge locked' }, 'Locked') : null,
              v.status === 'disabled' ? h('span', { class: 'badge' }, 'Disabled') : null,
              isShown ? h('span', { class: 'badge accent' }, 'Open') : null),
            h('div', { class: 'lr-sub' }, (v.note ? v.note + ' · ' : '') + t('Changed {when}', { when: fmtAgo(v.updated || p.updated) }))),
          actions));
      }
      body.appendChild(list);
      const disabledCount = p.versions.filter(v => v.status === 'disabled').length;
      body.appendChild(h('div', { class: 'actions', style: { justifyContent: 'space-between' } },
        h('button', { class: 'btn', onclick: () => { close(); this.newVersionDialog(this.shownVersion().id); } }, icon('copy'), 'New version from “' + this.shownVersion().name + '”'),
        disabledCount ? h('button', { class: 'btn ghost sm', onclick: () => { Settings.set('showDisabled', !showDisabled); render(); } }, showDisabled ? 'Hide disabled' : `Show disabled (${disabledCount})`) : null));
    };
    let close = () => {};
    render();
    await UI.dialog({ title: 'Versions', body, wide: true, actions: [{ label: 'Close', value: null }], onOpen: (dlg, c) => { close = c; } });
    void shown;
  },

  async newVersionDialog(srcId) {
    const p = this.project;
    const src = getVersion(p, srcId);
    const n = p.versions.filter(v => v.kind !== 'original').length + 1;
    const name = await UI.prompt({ title: 'New version', label: `Copy of “${src.name}”. Name for the new version:`, value: src.kind === 'original' ? `Plan ${n}` : `${src.name} – variant`, confirmLabel: 'Create', hint: 'Tip: give it a name you will recognise when comparing, like “Oak floors” or “Grey tiles”.' });
    if (name == null || !name.trim()) return;
    this.createVersionFrom(srcId, name.trim());
    this.toast(`“${name.trim()}” created and opened.`);
  },

  toggleDisabled(v, after) {
    const p = this.project;
    const wasShown = this.shownVersion().id === v.id;
    this.mutate(() => { v.status = v.status === 'disabled' ? 'active' : 'disabled'; }, { project: true });
    if (v.status === 'disabled' && wasShown) {
      const next = this.planVersions().find(x => x.status !== 'disabled');
      if (next) this.setActiveVersion(next.id); else this.setDisplay('original');
    }
    this.toast(v.status === 'disabled' ? `“${v.name}” is disabled and hidden from the list.` : `“${v.name}” is enabled.`);
    after && after();
    void p;
  },

  async deleteVersion(v, after) {
    const ok = await UI.confirm({ title: `Move “${v.name}” to the trash?`, message: 'You can restore it from the trash later. Your other versions are not affected.', confirmLabel: 'Move to trash', danger: true });
    if (!ok) return;
    const p = this.project;
    await Trash.add('version', v.name, { version: clone(v), projectName: p.name }, p.id);
    this.mutate(proj => {
      proj.versions = proj.versions.filter(x => x.id !== v.id);
      if (proj.activeVersionId === v.id) proj.activeVersionId = (proj.versions.find(x => x.kind !== 'original' && x.status !== 'disabled') || getOriginal(proj)).id;
    }, { project: true });
    if (this.compareBaseId === v.id) this.compareBaseId = null;
    if (!this.planVersions().length) this.display = 'original';
    this.selection = null;
    this.renderEditorChrome(); this.setupPanes(false); this.renderInspector();
    this.toast('Version moved to trash.');
    after && after();
  },

  /* ───────── save points ───────── */
  async savePointDialog() {
    if (!this.project) return;
    const name = await UI.prompt({ title: 'Make a save point', label: 'Name', value: 'Save point ' + fmtDate(Date.now()), confirmLabel: 'Save', hint: 'Save points are kept until you delete them. Autosaves are separate: every 2 minutes, the last 10 are kept.' });
    if (name == null) return;
    await Saver.flushNow();
    await Snapshots.create(this.project, 'manual', name.trim() || 'Save point');
    this.toast('Save point made.');
  },

  async savePointsSheet() {
    if (!this.project) return;
    await Saver.flushNow();
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    let close = () => {};
    const render = async () => {
      const snaps = await Snapshots.list(this.project.id);
      body.textContent = '';
      const groups = [['manual', 'Save points', 'Kept until you delete them.'], ['auto', 'Autosaves', 'Every 2 minutes while you work. Only the last 10 are kept.'], ['backup', 'Automatic backups', 'Made before a restore or an import replaced this house.']];
      body.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: async () => { await this.savePointDialog(); render(); } }, icon('save'), 'Make a save point')));
      for (const [kind, title, sub] of groups) {
        const list = snaps.filter(sn => sn.kind === kind);
        if (!list.length && kind === 'backup') continue;
        body.appendChild(h('div', { class: 'group-title' }, title, h('span', { style: { textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-ui)', fontWeight: 400 } }, sub)));
        if (!list.length) { body.appendChild(h('p', { class: 'note-muted' }, kind === 'manual' ? 'No save points yet.' : 'No autosaves yet. The first one is made 2 minutes after you change something.')); continue; }
        const box = h('div', { class: 'list' });
        for (const sn of list) {
          const vcount = (sn.project.versions || []).length;
          box.appendChild(h('div', { class: 'list-row' },
            h('div', { class: 'lr-main' }, h('div', { class: 'lr-title' }, h('span', { class: 't' }, kind === 'auto' ? fmtDate(sn.created) : sn.name)),
              h('div', { class: 'lr-sub' }, (kind === 'auto' ? fmtAgo(sn.created) : fmtDate(sn.created)) + ` · ${vcount} version${vcount === 1 ? '' : 's'} · ${fmtBytes(sn.size || 0)}`)),
            h('div', { class: 'lr-actions' },
              h('button', { class: 'btn sm', onclick: async () => { if (await this.restoreSnapshot(sn)) close(); } }, icon('restore'), 'Restore'),
              h('button', { class: 'btn ghost icon sm', 'aria-label': 'Delete', onclick: async () => { if (await this.deleteSnapshot(sn)) render(); } }, icon('trash')))));
        }
        body.appendChild(box);
      }
    };
    await render();
    await UI.dialog({ title: 'Save points and autosaves', body, wide: true, actions: [{ label: 'Close', value: null }], onOpen: (d, c) => { close = c; } });
  },

  async restoreSnapshot(sn) {
    const ok = await UI.confirm({ title: 'Restore this save?', message: `The house goes back to how it was on ${fmtDate(sn.created)}. The current state is kept as an automatic backup first, so you can go back.`, confirmLabel: 'Restore' });
    if (!ok) return false;
    await Saver.flushNow();
    await Snapshots.create(this.project, 'backup', 'Before restoring ' + (sn.kind === 'auto' ? 'autosave of ' + fmtDate(sn.created) : sn.name));
    const data = clone(sn.project);
    data.id = this.project.id;
    this.pushUndo();
    this.restoreState(JSON.stringify(migrateProject(data)));
    await Assets.ensure(assetIdsOf(this.project));
    this.refreshViews(true);
    this.toast('Restored. The previous state is under Automatic backups.');
    return true;
  },

  async deleteSnapshot(sn) {
    if (sn.kind === 'manual') {
      const ok = await UI.confirm({ title: `Delete “${sn.name}”?`, message: 'It moves to the trash, where you can still restore it.', confirmLabel: 'Move to trash', danger: true });
      if (!ok) return false;
      await Trash.add('savepoint', sn.name, { snapshot: sn }, sn.projectId);
    } else {
      const ok = await UI.confirm({ title: 'Delete this autosave?', message: 'Autosaves are deleted for good.', confirmLabel: 'Delete', danger: true });
      if (!ok) return false;
    }
    await DB.del('snapshots', sn.id);
    return true;
  },

  /* ───────── trash ───────── */
  async trashSheet() {
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    let close = () => {};
    const render = async () => {
      const items = await Trash.list();
      body.textContent = '';
      if (!items.length) { body.appendChild(h('p', null, 'The trash is empty.')); return; }
      body.appendChild(h('p', null, 'Deleted projects, versions and save points stay here until you empty the trash.'));
      const list = h('div', { class: 'list' });
      const kinds = { project: 'Project', version: 'Version', savepoint: 'Save point' };
      for (const it of items) {
        list.appendChild(h('div', { class: 'list-row' },
          h('div', { class: 'lr-main' }, h('div', { class: 'lr-title' }, h('span', { class: 't' }, it.name), h('span', { class: 'badge' }, kinds[it.type])),
            h('div', { class: 'lr-sub' }, 'Deleted ' + fmtDate(it.deleted) + (it.payload.projectName ? ' · from ' + it.payload.projectName : ''))),
          h('div', { class: 'lr-actions' },
            h('button', { class: 'btn sm', onclick: async () => { await this.restoreTrash(it); render(); } }, icon('restore'), 'Restore'),
            h('button', { class: 'btn ghost icon sm', 'aria-label': 'Delete for good', onclick: async () => { if (await UI.confirm({ title: 'Delete for good?', message: `“${it.name}” cannot be restored after this.`, confirmLabel: 'Delete for good', danger: true })) { await Trash.remove(it.id); render(); Assets.collectGarbage(); } } }, icon('trash')))));
      }
      body.appendChild(list);
      body.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: async () => {
        if (await UI.confirm({ title: 'Empty the trash?', message: `${items.length} item${items.length > 1 ? 's' : ''} will be deleted for good.`, confirmLabel: 'Empty trash', danger: true })) { for (const it of items) await Trash.remove(it.id); render(); Assets.collectGarbage(); }
      } }, icon('trash'), 'Empty trash')));
    };
    await render();
    await UI.dialog({ title: 'Trash', body, wide: true, actions: [{ label: 'Close', value: null }], onOpen: (d, c) => { close = c; } });
    void close;
  },

  async restoreTrash(it) {
    if (it.type === 'project') {
      const p = it.payload.project;
      if (await DB.get('projects', p.id)) { p.id = uid('p_'); p.name += ' (restored)'; for (const sn of it.payload.snapshots || []) sn.projectId = p.id; }
      await DB.put('projects', p);
      for (const sn of it.payload.snapshots || []) await DB.put('snapshots', sn);
      await Trash.remove(it.id);
      this.toast(`“${p.name}” restored.`);
      if (!this.project) this.renderProjectList();
      return;
    }
    if (it.type === 'version') {
      const pid = it.projectId;
      const isOpen = this.project && this.project.id === pid;
      const p = isOpen ? this.project : await DB.get('projects', pid);
      if (!p) { this.toast('The project of this version is not on this device any more. Restore the project first.'); return; }
      const v = it.payload.version;
      if (p.versions.some(x => x.id === v.id)) v.id = uid('v_');
      if (isOpen) { this.mutate(proj => { proj.versions.push(v); }, { project: true }); this.renderEditorChrome(); }
      else { p.versions.push(v); p.updated = Date.now(); try { await DB.put('projects', p); } catch (e) { this.toast(e.message || String(e), { ms: 6000 }); return; } }
      await Trash.remove(it.id);
      this.toast(`Version “${v.name}” restored in “${p.name}”.`);
      return;
    }
    if (it.type === 'savepoint') {
      await DB.put('snapshots', it.payload.snapshot);
      await Trash.remove(it.id);
      this.toast('Save point restored.');
    }
  },

  /* ───────── storeys ───────── */
  async storeysSheet() {
    const p = this.project;
    if (p && p.viewer) { this.toast(t('This is a viewer copy: storeys can’t be changed here.')); return; }
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    let close = () => {};
    const render = () => {
      body.textContent = '';
      body.appendChild(h('p', null, 'Names and heights apply to every version. Elevation is the floor level above the ground floor.'));
      const list = h('div', { class: 'list' });
      const storeys = sortedStoreys(p);
      storeys.forEach((st, i) => {
        const name = h('input', { class: 'input', value: st.name, 'aria-label': 'Name', autocomplete: 'off' });
        name.addEventListener('change', () => { this.mutate(() => { st.name = name.value.trim() || st.name; }, { project: true }); this.renderEditorChrome(); });
        const num = (val, key, label) => { const inp = h('input', { class: 'input num', value: fmtMM(val), inputmode: 'numeric', 'aria-label': label, style: { width: '96px' } }); inp.addEventListener('change', () => { const v = parseFloat(inp.value.replace(',', '.')); if (isFinite(v)) { this.mutate(() => { st[key] = v / 1000; }, { project: true }); } }); return h('label', { class: 'field', style: { gap: '2px' } }, h('span', { class: 'flabel', style: { fontSize: '11px', color: 'var(--ink-2)' } }, label + ' (mm)'), inp); };
        list.appendChild(h('div', { class: 'list-row', style: { gridTemplateColumns: '1fr' } },
          h('div', { style: { display: 'grid', gap: '8px' } },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('span', { class: 'num', style: { color: 'var(--ink-3)', width: '18px' } }, String(i)), name,
              h('button', { class: 'btn ghost icon sm', 'aria-label': 'Delete storey', disabled: storeys.length < 2, onclick: () => this.deleteStorey(st, render) }, icon('trash'))),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '26px' } }, num(st.elevation, 'elevation', 'Elevation'), num(st.wallHeight, 'wallHeight', 'Wall height'), num(st.height, 'height', 'Floor to floor')))));
      });
      body.appendChild(list);
      body.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => this.addStorey(render) }, icon('plus'), 'Add storey on top')));
    };
    render();
    await UI.dialog({ title: 'Storeys', body, wide: true, actions: [{ label: 'Done', value: null, kind: 'primary' }], onOpen: (d, c) => { close = c; } });
    this.renderEditorChrome(); this.refreshViews(false); this.renderInspector();
    void close;
  },

  addStorey(after) {
    const p = this.project;
    const top = sortedStoreys(p).slice(-1)[0];
    const st = newStorey('Storey ' + (p.storeys.length + 1), top ? top.level + 1 : 0, top ? +(top.elevation + top.height).toFixed(3) : 0);
    this.mutate(proj => {
      proj.storeys.push(st);
      // copy the outer walls of the storey below into every version, as a starting point
      if (top) for (const v of proj.versions) {
        for (const w of v.plan.walls.filter(x => x.storey === top.id && x.kind === 'exterior')) v.plan.walls.push({ ...clone(w), id: uid('w_'), storey: st.id });
      }
    }, { project: true });
    this.toast('Storey added with the outer walls of the storey below.');
    after && after();
  },

  async deleteStorey(st, after) {
    const ok = await UI.confirm({ title: `Delete “${st.name}”?`, message: 'Everything on this storey is removed from all versions. A backup is made first, which you can restore from Save points.', confirmLabel: 'Delete storey', danger: true });
    if (!ok) return;
    await Saver.flushNow();
    await Snapshots.create(this.project, 'backup', 'Before deleting storey ' + st.name);
    this.mutate(proj => {
      proj.storeys = proj.storeys.filter(x => x.id !== st.id);
      delete proj.underlays[st.id];
      for (const v of proj.versions) {
        const wallIds = new Set(v.plan.walls.filter(w => w.storey === st.id).map(w => w.id));
        v.plan.walls = v.plan.walls.filter(w => w.storey !== st.id);
        v.plan.openings = v.plan.openings.filter(o => !wallIds.has(o.wall));
        v.plan.rooms = v.plan.rooms.filter(r => r.storey !== st.id);
      }
      sortedStoreys(proj).forEach((x, i) => { x.level = i; });
    }, { project: true });
    if (this.view.storeyId === st.id) this.view.storeyId = sortedStoreys(this.project)[0].id;
    this.selection = null;
    this.renderEditorChrome(); this.setupPanes(true);
    after && after();
  },

  /* ───────── settings ───────── */
  async settingsSheet() {
    const s = this.settings;
    const theme = h('div', { class: 'seg' }, ...[['system', 'Like the device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('button', { 'aria-pressed': String(s.theme === v), onclick: e => { Settings.set('theme', v); this.applyTheme(); for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); if (this.project) this.refreshViews(false); } }, l)));
    let persisted = false, est = null;
    try { persisted = await navigator.storage.persisted(); } catch (e) { /* ignore */ }
    try { est = await navigator.storage.estimate(); } catch (e) { /* ignore */ }
    const lang = h('div', { class: 'seg', id: 'set-lang', translate: 'no' }, ...LANGS.map(([v, l]) => h('button', { 'data-k': v, 'aria-pressed': String(I18N.lang === v), onclick: () => this.switchLanguage(v) }, l)));
    const body = h('div', { style: { display: 'grid', gap: '14px' } },
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Language')), lang),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Appearance'), theme),
      this.pipSettings(),
      this.qualitySettings ? this.qualitySettings() : null,
      this.levelSettings ? this.levelSettings() : null,
      this.walkSettings(),
      h('div', { class: 'field', id: 'set-library' }, h('span', { class: 'flabel' }, t('Library')), this.librarySettings()),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Start')),
        h('label', { class: 'row-inline', style: { gap: '8px' } },
          (() => { const c = h('input', { type: 'checkbox', id: 'set-openlast' }); c.checked = s.openLast !== false; c.onchange = () => Settings.set('openLast', c.checked); return c; })(),
          h('span', null, t('Open the last house when the app starts'))),
        h('p', { class: 'note-muted' }, t('The list of houses is one tap away: Back, top left.'))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Storage')),
        h('p', { id: 'set-storage-text' }, DB.memory ? t('This browser does not allow the app to store data here. Use Export to keep your work.') :
          (persisted ? t('Protected on this device: your houses are kept when the device runs low on space.') : t('Not protected: the browser may clear site data when the device runs out of space, so export a copy now and then.')) + (est && est.usage != null ? ' ' + t('Using {s}.', { s: fmtBytes(est.usage) }) : '')),
        persisted ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { await this.requestPersistence(); this.toast((await navigator.storage.persisted().catch(() => false)) ? t('Storage is now protected.') : t('The browser did not allow it. Installing the app usually helps.')); } }, t('Ask to protect storage')))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Backup')), this.backupSettings()),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'About'),
        h('p', null, 'House Planner works offline. Nothing is uploaded: your data only leaves this device when you export a file.'),
        h('p', { class: 'note-muted' }, 'Built with three.js (MIT) and pdf.js (Apache 2.0). 3D furniture models: Furniture Kit by Kenney (www.kenney.nl), CC0. Font: Barlow (OFL).')));
    await UI.dialog({ title: 'Settings', body, actions: [{ label: 'Done', value: null, kind: 'primary' }] });
  },

  /** Settings → Library (task 0009): what of the asset library is on this device, Load library… (a library zip: the
   *  single file's way to get it), Remove */
  librarySettings() {
    const box = h('div', { class: 'lib-settings', style: { display: 'grid', gap: '8px' } });
    const fill = async () => {
      let st = [];
      try { st = await libStatus(); } catch (e) { /* none */ }
      const lines = [];
      if (!st.length) lines.push(h('p', { class: 'lib-status' }, libHosted()
        ? t('The library is loaded from the web address as it is needed.')
        : t('Built-in pictures only. The library (sharper skies, more pictures and models) is not on this device: load it from the library zip of a release.')));
      for (const l of st) {
        const what = l.name === 'public' ? t('Public library') : t('Your library');
        lines.push(h('div', { class: 'row-inline lib-row', 'data-lib': l.name, style: { justifyContent: 'space-between', gap: '8px' } },
          h('p', { class: 'lib-status' }, what + ': ' + t('{n} items ({s} picture sets, {m} models)', { n: l.items, s: l.sets, m: l.models }) + ' · ' +
            (l.from === 'web' ? t('{a} of {b} on this device, the rest when it is needed', { a: fmtBytes(l.have), b: fmtBytes(l.total) }) : t('{a} on this device', { a: fmtBytes(l.have) }))),
          h('button', { class: 'btn sm ghost', onclick: async () => {
            if (!await UI.confirm({ title: t('Remove the library from this device?'), message: t('Your houses stay as they are. Models of the library show as plain boxes until you load it again.'), confirmLabel: t('Remove') })) return;
            await libRemove(l.name); libAfterLoad(); fill();
          } }, icon('trash'), t('Remove'))));
      }
      const inp = h('input', { type: 'file', accept: '.zip,application/zip', style: { display: 'none' }, id: 'lib-file' });
      const prog = h('p', { class: 'note-muted lib-progress' });
      inp.addEventListener('change', async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try {
          const r = await libLoadZip(file, (a, b) => { prog.textContent = t('Reading the library… {a} of {b}', { a, b }); });
          prog.textContent = '';
          this.toast(t('Library loaded: {n} items, {b}.', { n: r.items, b: fmtBytes(r.bytes) }));
          libAfterLoad();
        } catch (e) { prog.textContent = ''; UI.dialog({ title: t('The library could not be loaded'), body: h('p', null, e.message || String(e)) }); }
        fill();
      });
      box.replaceChildren(...lines, h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'lib-load', onclick: () => inp.click() }, icon('upload'), t('Load library…'))), inp, prog,
        h('p', { class: 'note-muted' }, t('Pictures and models outside the app file, kept on this device once. Your houses never depend on it: what is not here shows plainer.')));
    };
    fill();
    return box;
  },

  /** Settings: looking around with the mouse while walking */
  /** Fast / Beautiful / High (High only on computers): the 3D views are made again in the new quality */
  qualitySeg(id) {
    const cur = quality3d(this.settings);
    const opts = [['fast', t('Fast')], ['beautiful', t('Beautiful')]];
    if (canHighQuality()) opts.push(['high', t('High (PC)')]);
    return h('div', { class: 'seg', id }, ...opts.map(([v, lab]) => h('button', { 'data-q': v, 'aria-pressed': String(cur === v), onclick: e => {
      for (const x of e.currentTarget.parentNode.children) x.setAttribute('aria-pressed', String(x === e.currentTarget));
      this.setQuality(v);
    } }, lab)));
  },
  setQuality(v) {
    if ((this.settings.quality || 'beautiful') === v) return;
    Settings.set('quality', v);
    this.layoutKey = null;
    this.setupPanes(false);
    if (this.refreshPip) this.refreshPip(true);
  },
  /** Settings: the 3D quality, with what each one does */
  qualitySettings() {
    const high = canHighQuality();
    return h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('3D quality')),
      this.qualitySeg('set-quality'),
      h('p', { class: 'note-muted' }, t('Fast: simple shapes and light, for older devices. Beautiful: shadows, soft shadows in corners, detailed trees. High: surfaces with real depth (joints, tiles, stone and roof tiles react to the light and the angle you look from), contact shadows in every corner and seam, light from the sky and sharper sun shadows.')),
      high ? null : h('p', { class: 'note-muted', id: 'set-quality-nohigh' }, t('High is for computers (mouse and a big screen); this device uses Beautiful, so it stays smooth.')),
      // the exposure: following what you look at (autoexp.js), or fixed
      h('div', { class: 'pip-set-row' }, h('span', null, t('Exposure')), h('div', { class: 'seg', id: 'set-ae' }, ...[[true, t('Automatic')], [false, t('Always the same')]].map(([v, l]) => h('button', { 'data-k': String(v), 'aria-pressed': String((this.settings.autoExposure !== false) === v), onclick: e => {
        Settings.set('autoExposure', v);
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        for (const pn of this.panes || []) if (pn.view && pn.view.ok && pn.kind === '3d') { pn.view._aeDue = performance.now(); pn.view.needs = true; }
      } }, l)))),
      h('p', { class: 'note-muted' }, t('Automatic: a front in the shade or a close look at something dark is brought up a little, as your eyes do; a sunny view stays as it is. Not in the evening.')),
      h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'set-speed', disabled: !this.project, onclick: e => { const dlg = e.currentTarget.closest('.scrim'); const c = dlg && dlg.querySelector('.dlg-head button[aria-label]'); if (c) c.click(); setTimeout(() => this.speedCheck(), 50); } }, icon('gauge'), t('Speed check on this device'))));
  },

  walkSettings() {
    const s = this.settings;
    const sl = h('input', { type: 'range', id: 'set-walk-look', min: 0.3, max: 3, step: 0.1, value: s.walkLook || 1, 'aria-label': t('Mouse sensitivity') });
    const val = h('span', { class: 'num set-walk-val' }, (+(s.walkLook || 1)).toFixed(1) + '×');
    sl.addEventListener('input', () => { Settings.set('walkLook', +sl.value); val.textContent = (+sl.value).toFixed(1) + '×'; });
    const seg = (key, id, opts) => h('div', { class: 'seg', id }, ...opts.map(([v, l]) => h('button', { 'data-k': String(v), 'aria-pressed': String((s[key] ?? opts[0][0]) === v), onclick: e => { Settings.set(key, v); for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); } }, l)));
    return h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Walking: looking around with the mouse')),
      h('div', { class: 'pip-set-row' }, h('span', null, t('Mouse sensitivity')), h('span', { class: 'set-walk-sl' }, sl, val)),
      h('div', { class: 'pip-set-row' }, h('span', null, t('Mouse up / down')), seg('walkInvert', 'set-walk-inv', [[false, t('Normal')], [true, t('Inverted')]])),
      h('div', { class: 'pip-set-row' }, h('span', null, t('Smooth turning')), seg('walkSmooth', 'set-walk-smooth', [[true, t('On')], [false, t('Off')]])),
      h('p', { class: 'note-muted' }, t('Hold the right mouse button and move the mouse to look around, or press L for mouse look until Esc.')));
  },

  /** Settings: whether the small live 3D view starts on in Build and in Furnish */
  pipSettings() {
    const row = (mode, label) => {
      const cur = this.pipDefault(mode);
      const seg = h('div', { class: 'seg', id: 'set-pip-' + mode }, ...[[false, t('Off')], [true, t('On')]].map(([v, l]) => h('button', { 'data-k': String(v), 'aria-pressed': String(cur === v), onclick: e => {
        Settings.set(mode === 'build' ? 'pipBuild' : 'pipFurnish', v);
        if (this.pipState) delete this.pipState[mode];
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        if (this.project) { this.updatePip(); this.renderStageOverlays(); }
      } }, l)));
      return h('div', { class: 'pip-set-row' }, h('span', null, label), seg);
    };
    return h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Small 3D view next to the 2D plan')),
      row('build', t('Build')), row('furnish', t('Furnish')),
      h('p', { class: 'note-muted' }, t('How it starts. The 3D chip above the plan switches it on or off for now. Not on small screens.')));
  },

  /** a new language: saved, then the app starts again in that language (your work is saved first) */
  async switchLanguage(v) {
    if (v === I18N.lang) return;
    this.settings.lang = v;
    this.settings.langChosen = true;
    await Saver.flushNow();
    try { await DB.put('meta', { key: 'settings', values: Settings.values }); } catch (e) { /* memory only */ }
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    if (DB.memory) { setLang(v); this.toast(t('The language changes fully after restarting the app.')); return; }
    location.replace(u.toString());
  },

  /* ───────── export / import ───────── */
  async buildExport(projects, includeSaves) {
    const out = { format: 'house-planner', formatVersion: 1, appVersion: APP_VERSION.n, exported: Date.now(), projects: [], assets: {} };
    for (const p of projects) {
      const saves = includeSaves ? (await Snapshots.list(p.id)).filter(sn => sn.kind === 'manual') : [];
      out.projects.push({ project: p, savePoints: saves });
      for (const id of [...assetIdsOf(p), ...saves.flatMap(sn => assetIdsOf(sn.project))]) {
        if (out.assets[id]) continue;
        const a = await Assets.getRecord(id);
        if (a) out.assets[id] = a.kind === 'shell' ? { kind: 'shell', json: a.json } : { dataUrl: a.dataUrl, w: a.w, h: a.h, ...(a.kind ? { kind: a.kind } : {}) };
      }
    }
    return JSON.stringify(out);
  },

  async exportDialog(pp) {
    let p = pp || this.project;
    if (!p) return;
    if (p.viewer) { if (this.project && this.project.id === p.id) return this.sendNotesBack(); this.toast(t('Open this copy to send your notes back.')); return; }
    if (this.project && p.id === this.project.id) { await Saver.flushNow(); p = this.project; }
    const inc = h('input', { type: 'checkbox', id: 'ex-saves', checked: true });
    const zip = h('input', { type: 'checkbox', id: 'ex-zip', checked: this.settings.exportZip !== false && typeof CompressionStream !== 'undefined', disabled: typeof CompressionStream === 'undefined' });
    const sizeEl = h('span', { class: 'num' }, '…');
    const nameEl = h('dd', { style: { overflowWrap: 'anywhere' } }, '…');
    const base = `${slugify(p.name)}_${todayStamp()}`;
    let text = null, file = null;
    const prep = async () => { text = await this.buildExport([p], inc.checked); file = await packHouse(text, base, zip.checked); sizeEl.textContent = fmtBytes(file.blob.size); nameEl.textContent = file.name; };
    inc.addEventListener('change', prep);
    zip.addEventListener('change', () => { Settings.set('exportZip', zip.checked); prep(); });
    const versions = p.versions.length;
    const body = h('div', { style: { display: 'grid', gap: '12px' } },
      h('p', null, `One file with the whole house: ${versions} version${versions > 1 ? 's' : ''}, all storeys, rooms, notes and drawings. Send it to someone; they tap Import in their app.`),
      h('label', { class: 'check', for: 'ex-saves' }, inc, h('span', null, 'Include my save points', h('br'), h('span', { class: 'note-muted' }, 'Autosaves are never included.'))),
      h('label', { class: 'check', for: 'ex-zip' }, zip, h('span', null, t('Smaller file (compressed)'), h('br'), h('span', { class: 'note-muted' }, t('About three times smaller. Opens in House Planner like any house file.')))),
      h('div', { class: 'kv' }, h('dt', null, 'File'), nameEl, h('dt', null, 'Size'), h('dd', null, sizeEl)),
      h('div', { class: 'export-alt' }, h('div', null, h('b', null, t('For family or suppliers')), h('span', { class: 'note-muted' }, t('A copy to look at and add notes to, as a page that opens in any browser.'))),
        h('button', { class: 'btn sm', id: 'btn-export-viewer', onclick: () => { const d = body.closest('.dialog'); if (d && d.closeWith) d.closeWith(null); this.viewerExportDialog(p); } }, icon('eye'), t('Export for viewing…'))),
      this.folderSupported() ? h('div', { class: 'export-alt', id: 'ex-folder' }, h('div', null, h('b', null, t('Automatic backup into a folder')), h('span', { class: 'note-muted' }, this._folder ? this.folderStatusText() : t('A copy after each change, for example into your Proton Drive or OneDrive folder.'))),
        h('button', { class: 'btn sm', id: 'btn-export-folder', onclick: () => { const d = body.closest('.dialog'); if (d && d.closeWith) d.closeWith(null); this.folderDialog(); } }, icon('folder'), this._folder ? t('Folder…') : t('Choose folder…'))) : null);
    await prep();
    const canShareFiles = !!(navigator.canShare && window.File);
    const choice = await UI.dialog({ title: t('Export “{n}”', { n: p.name }), body, actions: [
      { label: 'Cancel', value: null },
      { label: 'Save file', value: 'save', icon: 'download' },
      canShareFiles ? { label: 'Share…', value: 'share', kind: 'primary', icon: 'share' } : null,
    ].filter(Boolean) });
    if (!choice) return;
    this.backupStamp([p.id]);
    if (choice === 'share') {
      if (file.blob.type === 'application/gzip') { try { const f = new File([file.blob], file.name, { type: 'application/gzip' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: file.name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; } }
      if (await this.shareText(base + '.house.json', text)) return;
    }
    this.downloadBlob(file.name, file.blob);
  },

  async shareText(fname, text) {
    const tries = [[fname, 'application/json'], [fname.replace(/\.json$/, '.txt'), 'text/plain']];
    for (const [n, type] of tries) {
      try {
        const f = new File([text], n, { type });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f], title: n });
          return true;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return true;
        console.warn('share failed', e);
      }
    }
    this.toast('Sharing files is not supported here, so the file is saved instead.');
    return false;
  },

  downloadText(fname, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: fname, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    this.toast('File saved: ' + fname);
  },

  /** builder's IFC model(s) → a new project with the house as a locked Original */
  async importIfc(files) {
    const busy = UI.busy('Reading the IFC model. This can take a few seconds…');
    await new Promise(r => setTimeout(r, 60));
    try {
      const models = [];
      for (const f of files) {
        busy.set(`Reading ${f.name}…`);
        await new Promise(r => setTimeout(r, 20));
        models.push(IFC.parse(await readFileAs(f, 'text')));
      }
      busy.set('Turning walls, doors and windows into a plan…');
      await new Promise(r => setTimeout(r, 20));
      const res = IfcHouse.convert(models, {});
      const proj = models[0].all('IFCPROJECT')[0];
      const base = (proj && proj.a[2] && !/^\d+$/.test(proj.a[2]) ? proj.a[2] : files[0].name.replace(/\.ifc$/i, '').replace(/^[0-9a-f]{8}-/, '')).slice(0, 60);
      const p = newProject(base, ['x']);
      p.storeys = res.storeys.map(({ ifcName, ...s }) => s);
      const orig = getOriginal(p);
      orig.name = 'Original (from IFC)';
      orig.note = 'Read from ' + files.map(f => f.name).join(', ') + '.';
      orig.plan = res.plan;
      orig.locked = true;
      p.shell = { assetId: await Assets.putShell(JSON.stringify(IfcHouse.packShell(res.shell))), source: 'IFC' };
      p.source = { kind: 'ifc', files: files.map(f => f.name), origin: res.origin };
      p.wallsJoined = true;
      await DB.put('projects', p);
      busy.close();
      this.requestPersistence();
      await this.openProject(p.id);
      this.toast(`Imported ${p.storeys.length} storeys, ${res.plan.walls.length} walls and ${res.plan.rooms.length} rooms. Give the rooms their names in the details.`, { ms: 8000 });
    } catch (e) {
      console.error(e);
      busy.close();
      this.toast('This IFC file could not be read: ' + (e && e.message ? e.message : e), { ms: 8000 });
    }
  },

  async exportAll() {
    if (this.project) await Saver.flushNow();
    const projects = await DB.all('projects');
    if (!projects.length) { this.toast('There are no projects to back up yet.'); return; }
    const text = await this.buildExport(projects, true);
    const f = await packHouse(text, `house-planner-backup_${todayStamp()}`, this.settings.exportZip !== false);
    this.downloadBlob(f.name, f.blob);
    this.backupStamp(projects.map(p => p.id));
  },

  async importFlow() {
    const files = await pickFiles(HOUSE_ACCEPT + ',.ifc');
    if (!files || !files.length) return;
    const ifcs = files.filter(f => /\.ifc$/i.test(f.name));
    if (ifcs.length) return this.importIfc(ifcs);
    const file = files[0];
    const data = await this.readHouseFileChecked(file);
    if (!data) return;
    if (data && data.format === 'house-planner-notes') return this.importNotesFile(data);
    if (!data || data.format !== 'house-planner' || !Array.isArray(data.projects)) { this.toast(t('This is not a House Planner file.')); return; }
    if (this.fileNewerToast(data)) return;
    // a copy someone made for you to look at
    if (data.viewer) return this.openViewerData(data);
    let lastId = null, count = 0;
    const broken = [];
    for (const entry of data.projects) {
      // every house is checked before anything of it is stored: a broken one is named and skipped, the others come in
      if (this.houseProblem(entry)) { broken.push((entry && entry.project && entry.project.name) || '?'); continue; }
      const incoming = migrateProject(entry.project);
      const existing = await DB.get('projects', incoming.id);
      let mode = 'new';
      if (existing) {
        const newer = (existing.updated || 0) > (incoming.updated || 0);
        const body = h('div', { style: { display: 'grid', gap: '10px' } },
          h('p', null, 'You already have this house on this device.'),
          h('dl', { class: 'kv' }, h('dt', null, 'Your copy changed'), h('dd', null, fmtDate(existing.updated)), h('dt', null, 'The file changed'), h('dd', null, fmtDate(incoming.updated))),
          newer ? h('p', { style: { color: 'var(--danger)' } }, 'Your copy is newer than the file.') : null,
          h('p', null, t('Merge shows each difference, so you take their changes and keep yours. Replace keeps an automatic backup of your copy, so you can go back from Save points.')));
        mode = await UI.dialog({ title: `“${incoming.name}”`, body, actions: [{ label: 'Skip', value: 'skip' }, { label: 'Keep both', value: 'both' }, { label: 'Replace my copy', value: 'replace' }, { label: t('Merge…'), value: 'merge', kind: 'primary' }], dismissValue: 'skip' });
        if (!mode || mode === 'skip') continue;
        // my copy is newer than the file: one more question, with both dates in words
        if (mode === 'replace' && newer) {
          const sure = await UI.dialog({ title: t('Replace your newer copy?'), dismissValue: 'no',
            body: h('div', { style: { display: 'grid', gap: '10px' } },
              h('p', { class: 'replace-dates' }, t('Your copy: {a} – the file: {b}', { a: fmtWhenWords(existing.updated), b: fmtWhenWords(incoming.updated) })),
              h('p', null, t('What you changed since then is lost from the house, but a copy of yours is kept in Save points for 30 days.'))),
            actions: [{ label: t('Keep my copy'), value: 'no', kind: 'primary' }, { label: t('Replace it'), value: 'yes' }] });
          if (sure !== 'yes') continue;
        }
      }
      if (mode === 'merge') {
        for (const [id, a] of Object.entries(data.assets || {})) if (!(await DB.get('assets', id))) await Assets.putRecord(a.kind === 'shell' ? { id, kind: 'shell', json: a.json, created: Date.now() } : { id, dataUrl: a.dataUrl, w: a.w, h: a.h, ...(a.kind ? { kind: a.kind } : {}), created: Date.now() });
        let mine = existing;
        if (this.project && this.project.id === existing.id) { await Saver.flushNow(); mine = clone(this.project); }
        if (await this.mergeDialog(mine, incoming, file.name)) { lastId = incoming.id; count++; this._merged = true; }
        continue;
      }
      for (const [id, a] of Object.entries(data.assets || {})) if (!(await DB.get('assets', id))) await Assets.putRecord(a.kind === 'shell' ? { id, kind: 'shell', json: a.json, created: Date.now() } : { id, dataUrl: a.dataUrl, w: a.w, h: a.h, ...(a.kind ? { kind: a.kind } : {}), created: Date.now() });
      if (mode === 'replace') {
        let mine = existing;
        if (this.project && this.project.id === existing.id) { await this.closeProject(); mine = await DB.get('projects', existing.id) || existing; }
        await Snapshots.create(mine, 'backup', 'Before importing a file (' + fmtDate(Date.now()) + ')', 30);
      }
      if (mode === 'both') { incoming.id = uid('p_'); incoming.name = incoming.name + ' (imported)'; }
      await DB.put('projects', incoming);
      for (const sn of entry.savePoints || []) {
        const copy = { ...sn, projectId: incoming.id };
        if (mode === 'both' || await DB.get('snapshots', copy.id)) copy.id = uid('sn_');
        if (mode === 'replace') { const mine = await Snapshots.list(incoming.id); if (mine.some(m => m.kind === 'manual' && m.created === sn.created && m.name === sn.name)) continue; }
        await DB.put('snapshots', copy);
      }
      this.backupStamp([incoming.id], false);
      lastId = incoming.id; count++;
    }
    if (broken.length) this.toast(t('{n} could not be used and was skipped: {names}.', { n: broken.length, names: broken.map(x => '“' + x + '”').join(', ') }) + (count ? ' ' + t('The other houses are imported.') : ''), { ms: 15000 });
    if (!count) return;
    if (this._merged && count === 1) { this._merged = false; this.requestPersistence(); await this.openProject(lastId); this.toast(t('Merged: {a} of {b} changes taken. Your copy before the merge is in Save points.', { a: this._lastMerge.taken, b: this._lastMerge.total }), { ms: 7000 }); return; }
    this._merged = false;
    if (!broken.length) this.toast(count === 1 ? 'House imported.' : `${count} houses imported.`);
    this.requestPersistence();
    if (count === 1) await this.openProject(lastId);
    else if (this.project) await this.openProject(this.project.id); else await this.showHome();
  },
});
