/* ───────────── furnish.js — Furnish mode: layouts, placing and moving furniture, sets, the shopping list,
   "Check space", the furniture details, and the small live 3D view ───────────── */

const SHOP_STATUS = [['idea', 'Idea'], ['tobuy', 'To buy'], ['ordered', 'Ordered'], ['bought', 'Bought'], ['have', 'Have already']];
const shopStatusLabel = k => t((SHOP_STATUS.find(s => s[0] === k) || SHOP_STATUS[1])[1]);
const price = f => { const v = f.shop && parseFloat(f.shop.price); return isFinite(v) ? v : 0; };
function layoutTotals(lay) {
  const out = { total: 0, spent: 0, priced: 0, count: 0 };
  for (const f of (lay && lay.items) || []) {
    out.count++;
    const st = (f.shop && f.shop.status) || 'tobuy', v = price(f);
    if (v) out.priced++;
    if (st === 'have') continue;
    out.total += v;
    if (st === 'ordered' || st === 'bought') out.spent += v;
  }
  return out;
}

Object.assign(app, {
  /* ───────── layouts ───────── */
  layouts() { return (this.project && this.project.furniture && this.project.furniture.layouts) || []; },
  layoutById(id) { return this.layouts().find(l => l.id === id) || null; },
  activeLayout() { const p = this.project; return p && p.furniture ? this.layoutById(p.furniture.activeLayoutId) || this.layouts()[0] || null : null; },
  setActiveLayout(id) {
    if (!this.layoutById(id)) return;
    this.project.furniture.activeLayoutId = id;
    Saver.markDirty();
    if (this.selection && this.selection.type === 'furn') this.selection = null;
    this.refreshViews(false); this.renderInspector(); this.renderStageOverlays();
  },
  layoutMenu(anchor) {
    const cur = this.activeLayout();
    const items = this.layouts().map(l => ({ label: l.name + (l.items.length ? ` (${l.items.length})` : ''), icon: l === cur ? 'check' : 'sofa', fn: () => this.setActiveLayout(l.id) }));
    items.push('-',
      { label: t('New empty layout'), icon: 'plus', fn: () => this.newLayout(false) },
      { label: t('Copy this layout'), icon: 'copy', fn: () => this.newLayout(true) },
      { label: t('Rename this layout'), icon: 'edit', fn: () => this.renameLayout() });
    if (this.layouts().length > 1) items.push({ label: t('Delete this layout'), icon: 'trash', danger: true, fn: () => this.deleteLayout() });
    UI.menu(anchor, items, { alignLeft: true });
  },
  async newLayout(copy) {
    const cur = this.activeLayout();
    const name = await UI.prompt({ title: copy ? t('Copy layout') : t('New layout'), label: t('Name'), value: copy && cur ? cur.name + ' (copy)' : 'Layout ' + (this.layouts().length + 1), confirmLabel: t('Create') });
    if (name == null || !name.trim()) return;
    let made = null;
    this.mutate(p => {
      made = { id: uid('l_'), name: name.trim(), created: Date.now(), items: copy && cur ? cur.items.map(f => ({ ...clone(f), id: uid('f_') })) : [] };
      p.furniture.layouts.push(made);
      p.furniture.activeLayoutId = made.id;
    }, { project: true });
    this.selection = null;
    this.renderInspector(); this.renderStageOverlays();
    this.toast(t('Layout “{n}” made. The house versions are not changed.', { n: made.name }));
  },
  async renameLayout() {
    const cur = this.activeLayout();
    if (!cur) return;
    const name = await UI.prompt({ title: t('Rename layout'), label: t('Name'), value: cur.name });
    if (name == null || !name.trim()) return;
    this.mutate(() => { cur.name = name.trim(); }, { project: true });
    this.renderStageOverlays(); this.renderInspector();
  },
  async deleteLayout() {
    const cur = this.activeLayout();
    if (!cur || this.layouts().length < 2) return;
    const ok = await UI.confirm({ title: t('Delete layout “{n}”?', { n: cur.name }), message: t('Its {n} pieces go with it. You can undo this.', { n: cur.items.length }), confirmLabel: t('Delete'), danger: true });
    if (!ok) return;
    this.mutate(p => { p.furniture.layouts = p.furniture.layouts.filter(l => l !== cur); p.furniture.activeLayoutId = p.furniture.layouts[0].id; }, { project: true });
    this.selection = null;
    this.renderInspector(); this.renderStageOverlays();
    this.toast(t('Layout deleted.'), { action: { label: 'Undo', fn: () => this.undo() } });
  },

  /* ───────── furnish compare (side by side / compare slider): version + layout per side ───────── */
  startFurnCompare() {
    const others = this.layouts().filter(l => l !== this.activeLayout());
    if (!this.furnCompare || !this.layoutById(this.furnCompare.layoutId)) this.furnCompare = { versionId: this.shownVersion().id, layoutId: (others[0] || this.activeLayout()).id };
  },
  furnCompareBar() {
    const p = this.project, fc = this.furnCompare || {};
    const vSel = (val, fn) => { const s = h('select', { class: 'select sm' }, ...p.versions.map(v => h('option', { value: v.id, selected: v.id === val }, v.name))); s.onchange = () => fn(s.value); return s; };
    const lSel = (val, fn) => { const s = h('select', { class: 'select sm' }, ...this.layouts().map(l => h('option', { value: l.id, selected: l.id === val }, l.name))); s.onchange = () => fn(s.value); return s; };
    const L = this.layoutById(fc.layoutId), R = this.activeLayout();
    const tl = layoutTotals(L), tr = layoutTotals(R), diff = tr.total - tl.total;
    const side = (label, vs, ls, tot) => h('div', { class: 'fc-side' }, h('span', { class: 'fc-k' }, label), vs, ls, h('span', { class: 'fc-tot num', title: t('Total of the shopping list') }, fmtEuro(tot.total)));
    return h('div', { class: 'fcbar' },
      side(this.swipe ? t('Left') : t('Left'), vSel(fc.versionId, v => { this.furnCompare.versionId = v; this.refreshViews(false); this.renderStageOverlays(); }), lSel(fc.layoutId, l => { this.furnCompare.layoutId = l; this.refreshViews(false); this.renderStageOverlays(); }), tl),
      side(t('Right'), vSel(this.shownVersion().id, v => this.setActiveVersion(v)), lSel(R && R.id, l => this.setActiveLayout(l)), tr),
      h('span', { class: 'fc-diff num ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '') }, (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmtEuro(Math.abs(diff)).replace('€ ', '€ ')),
      h('button', { class: 'btn ghost icon sm', 'aria-label': t('Close compare'), title: t('Close compare'), onclick: () => this.swipe ? this.toggleSwipe() : this.toggleSideBySide() }, icon('close')));
  },

  /* ───────── changing furniture (all of it can be undone) ───────── */
  furnMutate(fn, opts = {}) {
    const lay = this.activeLayout();
    if (!lay) return false;
    this._furnOnly = true;
    return this.mutate(() => fn(lay), { project: true, keepInspector: opts.keepInspector, coalesce: opts.coalesce, gesture: opts.gesture });
  },
  furnItems(ids) { const lay = this.activeLayout(); return lay ? lay.items.filter(f => ids.includes(f.id)) : []; },

  /** where a new piece goes: the middle of what you look at, inside a room of the current storey */
  placementPoint() {
    const st = this.currentStorey() || sortedStoreys(this.project)[0];
    const plan = this.shownVersion().plan;
    let pt = null;
    const pane = this.panes.find(x => x.role === 'main');
    if (pane && pane.kind === '2d') { const v = pane.view, ins = v.insets || { top: 0, bottom: 0 }; pt = v.toWorld([v.W / 2, (v.H + ins.top - ins.bottom) / 2]); }
    else if (pane && pane.kind === '3d' && pane.view.ok) { const tg = pane.view.controls.target; pt = [tg.x, tg.z]; }
    // the middle of the room you look at (or the biggest room), so a new piece is never half in a wall
    const rooms = plan.rooms.filter(r => r.storey === st.id);
    const here = pt && rooms.filter(r => pointInPolygon(pt, r.poly)).sort((a, b) => roomArea(a) - roomArea(b))[0];
    const room = here || rooms.sort((a, b) => roomArea(b) - roomArea(a))[0];
    if (room) pt = labelPoint(room.poly, roomHoles(plan, room));
    return { storey: st.id, p: pt || [0, 0] };
  },

  addFurniture(typeId) {
    if (this.view.scope !== 'storey') { this.setScope('storey', this.view.storeyId || sortedStoreys(this.project)[0].id); }
    const { storey, p } = this.placementPoint();
    const it = newFurniture(typeId, storey, p[0], p[1], 0);
    // keep it out of what is already there: the nearest free spot in the room
    const spot = this.freeSpot(it);
    if (spot) { it.x = spot[0]; it.y = spot[1]; }
    this.furnMutate(l => { l.items.push(it); });
    this.select({ type: 'furn', ids: [it.id] });
    this.toast(t('{n} added. Drag it into place; the round handle turns it.', { n: furnName(it) }));
    return it;
  },
  /** the nearest spot (spiralling out from where the piece is) where it stands inside its room, clear of the
   *  walls and of the other pieces; null when there is none */
  freeSpot(it) {
    const plan = this.shownVersion().plan, lay = this.activeLayout();
    const others = lay.items.filter(f => f.storey === it.storey && f.id !== it.id && !furnType(f).flat && !furnType(f).high).map(f => furnCorners(f));
    if (furnType(it).flat || furnType(it).high) return null;
    const room = plan.rooms.filter(r => r.storey === it.storey && pointInPolygon([it.x, it.y], r.poly)).sort((a, b) => roomArea(a) - roomArea(b))[0];
    const walls = plan.walls.filter(w => w.storey === it.storey).map(w => wallPiecePoly(w, 0, wallLen(w), wallLen(w)));
    const ok = (x, y) => {
      const c = furnCorners({ ...it, x, y }, 0.02);
      if (room && !c.every(q => pointInPolygon(q, room.poly))) return false;
      if (walls.some(wp => overlapArea(c, wp) > 0.0004)) return false;
      return !others.some(o => overlapArea(c, o) > 0.0004);
    };
    if (ok(it.x, it.y)) return null;
    for (let r = 0.2; r <= 6; r += 0.2) {
      const n = Math.max(8, Math.round(2 * Math.PI * r / 0.2));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = it.x + Math.cos(a) * r, y = it.y + Math.sin(a) * r;
        if (ok(x, y)) return [+x.toFixed(3), +y.toFixed(3)];
      }
    }
    return null;
  },
  moveFurniture(ids, dx, dy, coalesce) {
    this.furnMutate(() => { for (const f of this.furnItems(ids)) { f.x = +(f.x + dx).toFixed(3); f.y = +(f.y + dy).toFixed(3); } }, { keepInspector: true, coalesce: coalesce ? 'fmove:' + ids.join(',') : null });
  },
  turnFurniture(ids, deg) {
    const items = this.furnItems(ids);
    if (!items.length) return;
    const c = items.length > 1 ? [items.reduce((s, f) => s + f.x, 0) / items.length, items.reduce((s, f) => s + f.y, 0) / items.length] : [items[0].x, items[0].y];
    const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    this.furnMutate(() => {
      for (const f of items) {
        const dx = f.x - c[0], dy = f.y - c[1];
        f.x = +(c[0] + dx * co - dy * si).toFixed(3); f.y = +(c[1] + dx * si + dy * co).toFixed(3);
        f.rot = (((f.rot || 0) + deg) % 360 + 360) % 360;
      }
    }, { keepInspector: false, coalesce: 'fturn:' + ids.join(',') });
  },
  updateFurn(id, fn, coalesce) {
    this.furnMutate(() => { const f = this.furnItems([id])[0]; if (f) fn(f); }, { keepInspector: !!coalesce, coalesce: coalesce ? coalesce + ':' + id : null });
  },
  deleteFurniture(ids) {
    const n = ids.length;
    if (!this.furnMutate(l => { l.items = l.items.filter(f => !ids.includes(f.id)); })) return;
    this.selection = null;
    this.renderInspector();
    this.toast(n > 1 ? t('{n} pieces deleted.', { n }) : t('Piece deleted.'), { action: { label: 'Undo', fn: () => this.undo() } });
  },
  duplicateFurniture(ids) {
    const copies = this.furnItems(ids).map(f => ({ ...clone(f), id: uid('f_'), x: +(f.x + 0.3).toFixed(3), y: +(f.y + 0.3).toFixed(3) }));
    if (!copies.length) return;
    this.furnMutate(l => { l.items.push(...copies); });
    this.select({ type: 'furn', ids: copies.map(f => f.id) });
  },
  /** dragging pieces (2D and 3D): d = { id (held), ids, orig: [{ id, x, y, rot }], start: plan point, en } */
  dragFurnMove(d, p, tol, e) {
    const lay = this.activeLayout();
    if (!lay) return;
    this._furnOnly = true;
    const find = id => lay.items.find(x => x.id === id);
    const snapOn = this.settings.furnSnap !== false && !(e && e.altKey);
    const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
    d.snapMarks = null;
    this.mutate(() => {
      for (const o of d.orig) { const f = find(o.id); if (f) { f.x = o.x + dx; f.y = o.y + dy; f.rot = o.rot; } }
      if (snapOn) {
        // snap the piece that is held; the others move along with it
        const held = find(d.id);
        if (held) {
          const others = lay.items.filter(x => x.storey === held.storey && !d.ids.includes(x.id));
          const res = snapFurniture(held, d.en.plan, d.en.storey.id, others, tol, d.orig.length === 1);
          if (res) {
            const mx = res.x - held.x, my = res.y - held.y, dr = res.rot - held.rot;
            for (const o of d.orig) {
              const f = find(o.id);
              if (!f) continue;
              if (dr && f !== held) { const a = dr * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), rx = f.x - held.x, ry = f.y - held.y; f.x = held.x + rx * c - ry * sn; f.y = held.y + rx * sn + ry * c; f.rot = ((f.rot + dr) % 360 + 360) % 360; }
              f.x += mx; f.y += my;
            }
            held.rot = ((res.rot % 360) + 360) % 360;
            d.snapMarks = res.marks;
          }
        }
      }
      for (const o of d.orig) { const f = find(o.id); if (f) { f.x = +f.x.toFixed(3); f.y = +f.y.toFixed(3); } }
    }, { project: true, gesture: true, keepInspector: true });
  },
  /** turning a piece by its handle: d = { id, f0: { x, y, rot }, start } */
  dragFurnRot(d, p, e) {
    const lay = this.activeLayout(), f = lay && lay.items.find(x => x.id === d.id);
    if (!f) return;
    this._furnOnly = true;
    const a0 = Math.atan2(d.start[1] - d.f0.y, d.start[0] - d.f0.x), a1 = Math.atan2(p[1] - d.f0.y, p[0] - d.f0.x);
    let rot = d.f0.rot + (a1 - a0) * 180 / Math.PI;
    const step = e && e.shiftKey ? 0 : (this.settings.furnRot ?? 90);
    rot = step ? Math.round(rot / step) * step : Math.round(rot);
    this.mutate(() => { f.rot = ((rot % 360) + 360) % 360; }, { project: true, gesture: true, keepInspector: true });
  },
  /** a tap on a piece (2D or 3D) */
  furnTapped(id, ev) {
    const sel = this.selection;
    const add = this.mode === 'furnish' && (this.multiSel || (ev && ev.shiftKey));
    if (add && sel && sel.type === 'furn') {
      const ids = sel.ids.includes(id) ? sel.ids.filter(x => x !== id) : [...sel.ids, id];
      this.select(ids.length ? { type: 'furn', ids } : null);
    } else this.select({ type: 'furn', ids: [id] });
  },

  /* ───────── sets: a few pieces saved together, to place again anywhere ───────── */
  async saveSet(ids) {
    const items = this.furnItems(ids);
    if (!items.length) { this.toast(t('Select the pieces for the set first.')); return; }
    const name = await UI.prompt({ title: t('Save as a furniture set'), label: t('Name of the set'), value: t('Seating area') + ' ' + String.fromCharCode(65 + (this.project.furniture.sets.length % 26)), confirmLabel: t('Save set'), hint: t('Place it in any layout on any version later; the pieces are free to move after placing.') });
    if (name == null || !name.trim()) return;
    const cx = items.reduce((s, f) => s + f.x, 0) / items.length, cy = items.reduce((s, f) => s + f.y, 0) / items.length;
    this.mutate(p => {
      p.furniture.sets.push({ id: uid('fs_'), name: name.trim(), created: Date.now(), items: items.map(f => { const { id, storey, x, y, ...rest } = clone(f); return { ...rest, dx: +(x - cx).toFixed(3), dy: +(y - cy).toFixed(3) }; }) });
    }, { project: true, keepInspector: true });
    this.toast(t('Set “{n}” saved with {k} pieces.', { n: name.trim(), k: items.length }));
  },
  placeSet(setId) {
    const set = this.project.furniture.sets.find(s2 => s2.id === setId);
    if (!set) return;
    if (this.view.scope !== 'storey') this.setScope('storey', this.view.storeyId || sortedStoreys(this.project)[0].id);
    const { storey, p } = this.placementPoint();
    const made = set.items.map(({ dx, dy, ...rest }) => ({ ...clone(rest), id: uid('f_'), storey, x: +(p[0] + dx).toFixed(3), y: +(p[1] + dy).toFixed(3), shop: { ...(rest.shop || {}) } }));
    this.furnMutate(l => { l.items.push(...made); });
    this.select({ type: 'furn', ids: made.map(f => f.id) });
    this.toast(t('“{n}” placed. Drag to move all of it; tap one piece to move it on its own.', { n: set.name }));
  },

  /* ───────── sheets ───────── */
  async catalogSheet() {
    if (this.comparing) { this.toast(t('Close the comparison to add furniture.')); return; }
    let cat = this._catLast || 'living', q = '';
    const grid = h('div', { class: 'cat-grid' });
    const tabs = h('div', { class: 'seg cat-tabs' });
    const search = h('input', { class: 'input', type: 'search', placeholder: t('Search, e.g. bed, sink, lamp'), 'aria-label': t('Search furniture'), autocomplete: 'off' });
    const mineList = h('div', { class: 'my-models' });
    let close = null;
    const pickModel = info => { this._catLast = cat; close(true); this.addModel(info.key); };
    const sub = (label, extra) => h('div', { class: 'cat-sub' }, h('span', null, label), extra ? h('span', { class: 'note-muted' }, extra) : null);
    const paint = () => {
      tabs.textContent = '';
      for (const [k, lab] of [...FURN_CATS, ['mine', 'My models']]) tabs.appendChild(h('button', { 'aria-pressed': String(!q && k === cat), 'data-cat': k, onclick: () => { cat = k; q = ''; search.value = ''; paint(); } }, t(lab)));
      grid.textContent = '';
      mineList.textContent = '';
      if (!q && cat === 'mine') {
        grid.appendChild(h('button', { class: 'cat-card import-card', onclick: async () => {
          const files = await pickFiles('.glb,.gltf,.obj,.mtl,.ifc,.bin,.png,.jpg,.jpeg,.webp,model/gltf-binary,model/gltf+json');
          if (!files.length) return;
          const res = await this.importModelFiles(files);
          if (res && res.place) { close(true); this.addModel('u:' + res.rec.id); } else paint();
        } }, h('span', { class: 'cc-pic' }, icon('upload')), h('span', { class: 'cc-name' }, t('Import a model …')), h('span', { class: 'cc-size' }, 'GLB · glTF · OBJ · IFC')));
        const mine = this.myModels('');
        for (const c of this.modelCards(mine, pickModel)) grid.appendChild(c);
        if (mine.length) for (const info of mine) mineList.appendChild(h('div', { class: 'room-row my-model' }, h('span', { class: 'sw', style: { background: 'var(--line)' } }), h('span', null, info.name, h('span', { class: 'note-muted' }, ' · ' + (info.rec.file || ''))),
          h('span', { class: 'ar' }, h('button', { class: 'btn ghost sm', onclick: async () => { await this.modelSettingsDialog(this.project.models[info.rec.id]); paint(); } }, icon('gear'), t('Settings')),
            h('button', { class: 'btn ghost sm danger', 'aria-label': t('Delete model'), onclick: async () => { await this.deleteModel(info.rec.id); paint(); } }, icon('trash')))));
        else mineList.appendChild(h('p', { class: 'note-muted' }, t('Models you import are kept with this house and go along when you export it. Free models: e.g. the IKEA planner, manufacturers’ sites (IFC, OBJ), Sketchfab or Poly Haven (GLB).')));
        return;
      }
      const list = FURN_TYPES.filter(T => !T.hidden && (q ? (t(T.name) + ' ' + T.name + ' ' + T.cat).toLowerCase().includes(q) : T.cat === cat));
      if (list.length) grid.appendChild(sub(t('Drawn pieces'), t('simple shapes, any size')));
      for (const T of list) {
        grid.appendChild(h('button', { class: 'cat-card', onclick: () => { this._catLast = T.cat; close(true); this.addFurniture(T.id); } },
          furnPreview({ type: T.id, w: T.w, d: T.d, h: T.h, color: T.color, rot: 0, x: 0, y: 0 }),
          h('span', { class: 'cc-name' }, t(T.name)),
          h('span', { class: 'cc-size num' }, `${Math.round(T.w * 100)} × ${Math.round(T.d * 100)}`)));
      }
      const models = [...this.libModels(cat, q), ...this.myModels(q).filter(i => q || i.cat === cat)];
      if (models.length) {
        grid.appendChild(sub(t('3D models'), t('Kenney Furniture Kit (CC0) and your own')));
        for (const c of this.modelCards(models, pickModel)) grid.appendChild(c);
      }
      if (!list.length && !models.length) grid.appendChild(h('p', { class: 'note-muted' }, t('Nothing found. Try another word, or take “Box (any size)”.')));
    };
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); paint(); });
    paint();
    loadModelLib();
    const body = h('div', { class: 'cat-body' }, search, tabs, grid, mineList, h('p', { class: 'note-muted' }, t('Every piece can be any size: change it in the details after placing. Sizes in cm, width × depth.')));
    await UI.dialog({ title: t('Add furniture'), body, wide: true, actions: [], onOpen: (dlg, c) => { close = c; } });
  },

  async setsSheet() {
    const p = this.project;
    const sel = this.selection && this.selection.type === 'furn' ? this.selection : null;
    let close = null;
    const body = h('div', { style: { display: 'grid', gap: '12px' } });
    const paint = () => {
      body.textContent = '';
      body.appendChild(h('p', { class: 'note-muted' }, t('A set is a group of pieces, like a seating area, that you can place in any layout on any version. After placing, the pieces move freely.')));
      body.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm primary', disabled: !sel, onclick: async () => { close(null); await this.saveSet(sel.ids); } }, icon('plus'), sel ? t('Save the {n} selected as a set', { n: sel.ids.length }) : t('Select pieces first to save a set'))));
      if (!p.furniture.sets.length) body.appendChild(h('p', { class: 'note-muted' }, t('No sets yet.')));
      for (const st of p.furniture.sets) {
        body.appendChild(h('div', { class: 'set-row' },
          setPreview(st),
          h('div', { class: 'set-meta' }, h('b', null, st.name), h('span', { class: 'note-muted' }, t('{n} pieces', { n: st.items.length }) + (st.items.some(f => price(f)) ? ' · ' + fmtEuro(st.items.reduce((s2, f) => s2 + price(f), 0)) : ''))),
          h('div', { class: 'set-acts' },
            h('button', { class: 'btn sm primary', onclick: () => { close(null); this.placeSet(st.id); } }, t('Place')),
            h('button', { class: 'btn sm ghost icon', 'aria-label': t('Rename set'), title: t('Rename'), onclick: async () => { const n = await UI.prompt({ title: t('Rename set'), label: t('Name'), value: st.name }); if (n && n.trim()) { this.mutate(() => { st.name = n.trim(); }, { project: true, keepInspector: true }); } this.setsSheet(); } }, icon('edit')),
            h('button', { class: 'btn sm ghost icon danger', 'aria-label': t('Delete set'), title: t('Delete'), onclick: () => { this.mutate(pp => { pp.furniture.sets = pp.furniture.sets.filter(x => x !== st); }, { project: true, keepInspector: true }); paint(); } }, icon('trash')))));
      }
    };
    paint();
    await UI.dialog({ title: t('Furniture sets'), body, actions: [{ label: t('Done'), value: null }], onOpen: (dlg, c) => { close = c; } });
  },

  async shoppingSheet() {
    const lay = this.activeLayout();
    if (!lay) return;
    const p = this.project;
    let other = this._shopCompare || null;
    const body = h('div', { class: 'shop-body' });
    const paint = () => {
      const keep = body.scrollTop;
      body.textContent = '';
      const tot = layoutTotals(lay);
      const cmpSel = h('select', { class: 'select sm', 'aria-label': t('Compare with') }, h('option', { value: '' }, t('— compare with another layout —')), ...this.layouts().filter(l => l !== lay).map(l => h('option', { value: l.id, selected: l.id === other }, l.name)));
      cmpSel.onchange = () => { other = this._shopCompare = cmpSel.value || null; paint(); };
      const O = other && this.layoutById(other), to = O && layoutTotals(O);
      body.appendChild(h('div', { class: 'shop-sum' },
        h('div', null, h('span', { class: 'k' }, t('Total')), h('b', { class: 'num' }, fmtEuro(tot.total))),
        h('div', null, h('span', { class: 'k' }, t('Ordered or bought')), h('b', { class: 'num' }, fmtEuro(tot.spent))),
        h('div', null, h('span', { class: 'k' }, t('Still to buy')), h('b', { class: 'num' }, fmtEuro(tot.total - tot.spent))),
        h('div', { class: 'shop-cmp' }, cmpSel, O ? h('span', { class: 'num' }, `${O.name}: ${fmtEuro(to.total)} (${to.total - tot.total >= 0 ? '+' : '−'}${fmtEuro(Math.abs(to.total - tot.total))})`) : null)));
      const storeys = sortedStoreys(p);
      const plan = this.shownVersion().plan;
      if (!lay.items.length) body.appendChild(h('p', { class: 'note-muted' }, t('This layout has no furniture yet.')));
      for (const st of storeys) {
        const items = lay.items.filter(f => f.storey === st.id);
        if (!items.length) continue;
        body.appendChild(h('div', { class: 'group-title' }, st.name));
        const tbl = h('div', { class: 'shop-table' });
        for (const f of items) {
          const room = plan.rooms.find(r => r.storey === st.id && pointInPolygon([f.x, f.y], r.poly));
          const shopIn = h('input', { class: 'input sm', value: f.shop.store || '', placeholder: t('Shop'), 'aria-label': t('Shop') });
          shopIn.oninput = () => this.updateFurn(f.id, x => { x.shop.store = shopIn.value; }, 'shop');
          const priceIn = h('input', { class: 'input sm num', value: f.shop.price != null ? String(f.shop.price).replace('.', ',') : '', inputmode: 'decimal', placeholder: '€', 'aria-label': t('Price') });
          priceIn.onchange = () => { const v = parseFloat(priceIn.value.replace(/[€\s.]/g, '').replace(',', '.')); this.updateFurn(f.id, x => { x.shop.price = isFinite(v) ? v : null; }, 'price'); paint(); };
          const stat = h('select', { class: 'select sm', 'aria-label': t('Status') }, ...SHOP_STATUS.map(([k, lab]) => h('option', { value: k, selected: (f.shop.status || 'tobuy') === k }, t(lab))));
          stat.onchange = () => { this.updateFurn(f.id, x => { x.shop.status = stat.value; }); paint(); };
          const linkIn = h('input', { class: 'input sm', value: f.shop.link || '', placeholder: t('Link'), 'aria-label': t('Link'), inputmode: 'url' });
          linkIn.oninput = () => this.updateFurn(f.id, x => { x.shop.link = linkIn.value.trim(); }, 'link');
          tbl.appendChild(h('div', { class: 'shop-row' },
            h('div', { class: 'sr-name' }, h('b', null, furnName(f)), h('span', { class: 'note-muted' }, `${Math.round(f.w * 100)} × ${Math.round(f.d * 100)} cm` + (room ? ' · ' + room.name : ''))),
            shopIn, priceIn, stat,
            h('div', { class: 'sr-link' }, linkIn, f.shop.link ? h('a', { class: 'btn sm ghost icon', href: safeUrl(f.shop.link), target: '_blank', rel: 'noopener', 'aria-label': t('Open link') }, icon('link')) : null)));
        }
        body.appendChild(tbl);
      }
      body.scrollTop = keep;
    };
    paint();
    await UI.dialog({ title: t('Shopping list — {n}', { n: lay.name }), body, wide: true, actions: [{ label: t('Download (CSV)'), value: 'csv', icon: 'download' }, { label: t('Done'), value: null, kind: 'primary' }] }).then(v => { if (v === 'csv') this.shoppingCsv(lay); });
    this.refreshViews(false); this.renderInspector();
  },
  shoppingCsv(lay) {
    const p = this.project, plan = this.shownVersion().plan;
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Storey', 'Room', 'Piece', 'Width cm', 'Depth cm', 'Height cm', 'Shop', 'Price', 'Status', 'Link'].map(q).join(';')];
    for (const f of lay.items) {
      const st = getStorey(p, f.storey), room = plan.rooms.find(r => r.storey === f.storey && pointInPolygon([f.x, f.y], r.poly));
      rows.push([st ? st.name : '', room ? room.name : '', furnName(f), Math.round(f.w * 100), Math.round(f.d * 100), Math.round(f.h * 100), f.shop.store || '', f.shop.price != null ? String(f.shop.price).replace('.', ',') : '', shopStatusLabel(f.shop.status), f.shop.link || ''].map(q).join(';'));
    }
    const text = '﻿' + rows.join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = h('a', { href: url, download: `${slugify(p.name)}_${slugify(lay.name)}_shopping.csv`, style: { display: 'none' } });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  },

  /* ───────── details panels ───────── */
  furnPanel(el, items) {
    const ro = this.mode !== 'furnish' || this.comparing;
    if (items.length > 1) return this.furnMultiPanel(el, items, ro);
    const f = items[0], T = furnType(f);
    const st = getStorey(this.project, f.storey);
    this.inspHead(el, furnName(f), t(T.name) + (st ? ' · ' + st.name : ''));
    const head = el.querySelector('.insp-head h3');
    const sec = h('div', { class: 'insp-sec' });
    const name = h('input', { class: 'input', id: 'f-furn-name', value: f.name || '', placeholder: t(T.name), disabled: ro, autocomplete: 'off' });
    name.addEventListener('input', () => { head.textContent = name.value || t(T.name); this.updateFurn(f.id, x => { x.name = name.value.trim() || undefined; }, 'fname'); });
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-furn-name' }, t('Name')), name));
    const cm = (label, id, val, fn, opts = {}) => {
      // (a field that can go below zero gets the keyboard with a minus sign: the number pad of iPhones has none)
      const inp = h('input', { class: 'input', id, type: 'text', inputmode: (opts.min ?? 1) < 0 ? 'text' : 'decimal', value: val == null ? '' : String(Math.round(val * 1000) / 10).replace('.', ','), disabled: ro, autocomplete: 'off', placeholder: opts.placeholder || '' });
      inp.addEventListener('change', () => { const v = parseFloat(inp.value.replace(',', '.').replace(/[\u2212\u2013]/g, '-').replace(/\s+/g, '')); if (inp.value.trim() === '' && opts.allowEmpty) { fn(null); return; } if (!isFinite(v) || v < (opts.min ?? 1)) { inp.value = val == null ? '' : String(Math.round(val * 1000) / 10); return; } fn(v / 100); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, 'cm')));
    };
    const run = T.kind === 'krun', model = T.kind === 'model';
    // a 3D model keeps its proportions unless that is switched off (f.free)
    const prop = model && !f.free;
    const sizeTo = (x, key, v, lo, hi) => { const nv = clamp(v, lo, hi); if (prop) { const k = nv / (x[key] || 1); x.w = +(x.w * k).toFixed(3); x.d = +(x.d * k).toFixed(3); x.h = +(x.h * k).toFixed(3); } else x[key] = nv; };
    sec.appendChild(h('div', { class: 'field-row three' },
      cm(t('Width'), 'f-furn-w', f.w, v => run ? this.updateRun(f.id, x => { const k = clamp(v, 0.3, 20) / x.w; for (const u of x.units) u.w = +(u.w * k).toFixed(3); }) : this.updateFurn(f.id, x => sizeTo(x, 'w', v, 0.02, 20))),
      cm(t('Depth'), 'f-furn-d', f.d, v => this.updateFurn(f.id, x => sizeTo(x, 'd', v, 0.02, 20))),
      cm(t('Height'), 'f-furn-h', f.h, v => this.updateFurn(f.id, x => sizeTo(x, 'h', v, 0.005, 5)))));
    if (model) {
      const info = modelInfo(f.model);
      sec.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'chip', 'aria-pressed': String(prop), disabled: ro, onclick: () => this.updateFurn(f.id, x => { x.free = !x.free || undefined; }) }, t('Keep proportions')),
        info ? h('button', { class: 'btn sm', disabled: ro, title: t('Back to the size of the model'), onclick: () => this.updateFurn(f.id, x => { x.w = info.size[0]; x.d = info.size[1]; x.h = info.size[2]; }) }, icon('restore'), t('Model size')) : null,
        info && !info.lib && !ro ? h('button', { class: 'btn sm', onclick: () => this.modelSettingsDialog(this.project.models[info.rec.id]) }, icon('gear'), t('Model settings')) : null));
      if (!info) sec.appendChild(h('p', { class: 'note-muted' }, t('The model of this piece is missing (deleted from your models).')));
    }
    const row2 = [];
    // (below zero: lower it into the floor – for a model whose underside is not where its shape starts)
    if (T.high || T.z || f.z != null || model) row2.push(cm(t('Above the floor'), 'f-furn-z', furnZ(f, st ? st.wallHeight : 2.6), v => this.updateFurn(f.id, x => { x.z = v; }), { min: -500, allowEmpty: true }));
    // (an island with its own cupboard depths has them in the kitchen builder)
    if (isIsland(f) && !f.cd) row2.push(cm(t('Worktop overhang (stools side)'), 'f-furn-ov', f.ov != null ? f.ov : T.ov, v => this.updateFurn(f.id, x => { x.ov = clamp(v, 0, x.d - 0.3); }), { min: 0 }));
    if (row2.length) sec.appendChild(h('div', { class: 'field-row' }, ...row2));
    if (model && !ro) sec.appendChild(h('p', { class: 'note-muted' }, t('Above the floor can go below zero (for example -5): that lowers a model that floats into the floor. Empty: back to normal.')));
    // turning
    const ang = h('input', { class: 'input', id: 'f-furn-rot', inputmode: 'numeric', value: String(Math.round(f.rot || 0)), disabled: ro, autocomplete: 'off' });
    ang.addEventListener('change', () => { const v = parseFloat(ang.value.replace(',', '.')); if (isFinite(v)) this.updateFurn(f.id, x => { x.rot = ((v % 360) + 360) % 360; }); });
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-furn-rot' }, t('Turned')),
      h('div', { class: 'row-inline' }, h('div', { class: 'input-unit', style: { maxWidth: '110px' } }, ang, h('span', { class: 'unit' }, '°')),
        h('button', { class: 'btn sm', disabled: ro, title: t('Turn left 90°'), onclick: () => this.turnFurniture([f.id], -90) }, icon('rotate', 'flipx'), '90°'),
        h('button', { class: 'btn sm', disabled: ro, title: t('Turn right 90°'), onclick: () => this.turnFurniture([f.id], 90) }, icon('rotate'), '90°'))));
    // colour (your own models keep the colours of their file)
    const ownModel = model && f.model && f.model.startsWith('u:');
    if (ownModel) sec.appendChild(h('p', { class: 'note-muted' }, t('The colours come from the model file.')));
    const col = h('input', { type: 'color', id: 'f-furn-col', value: f.color || T.color, disabled: ro, 'aria-label': t('Colour') });
    col.addEventListener('input', () => this.updateFurn(f.id, x => { x.color = col.value; }, 'fcol'));
    const sw = ['#ECE8E0', '#D9D2C5', '#B08A62', '#8A6A4C', '#5A4C40', '#7D8790', '#4B4B4B', '#2F3437', '#A5845F', '#5E7B4D'];
    // (a kitchen run has its colours in the builder's “The look”)
    if (!ownModel && !run) sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, model ? t('Colour (fabric, wood or the main part)') : t('Colour')),
      h('div', { class: 'color-row' }, col, h('div', { class: 'swatches' }, ...sw.map(c => h('button', { class: 'swatch', style: { background: c }, disabled: ro, 'aria-label': t('Colour') + ' ' + c, 'aria-pressed': String((f.color || '').toLowerCase() === c.toLowerCase()), onclick: () => this.updateFurn(f.id, x => { x.color = c; }) })))),
      ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { const c = await this.colourPicker({ value: f.color }); if (c) this.updateFurn(f.id, x => { x.color = c.hex; }); } }, icon('eye'), t('Colour library')))));
    el.appendChild(sec);
    if (run) this.runSection(el, f, ro);
    el.appendChild(this.shopSection(f, ro));
    if (!ro) el.appendChild(this.furnEditButtons([f.id]));
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => this.duplicateFurniture([f.id]) }, icon('dup'), t('Duplicate')),
      h('button', { class: 'btn sm', onclick: () => this.saveSet([f.id]) }, icon('group'), t('Save as set')),
      h('button', { class: 'btn sm danger', onclick: () => this.deleteFurniture([f.id]) }, icon('trash'), t('Delete'))),
      h('p', { class: 'note-muted' }, t('Drag to move; the round handle turns it, the square handles change the size. R turns, arrow keys nudge, Delete removes.'))));
  },
  shopSection(f, ro) {
    const s = f.shop || {};
    const store = h('input', { class: 'input', id: 'f-shop-store', value: s.store || '', placeholder: t('e.g. IKEA, Leen Bakker'), disabled: ro, autocomplete: 'off' });
    store.addEventListener('input', () => this.updateFurn(f.id, x => { x.shop.store = store.value; }, 'shop'));
    const pr = h('input', { class: 'input num', id: 'f-shop-price', value: s.price != null ? String(s.price).replace('.', ',') : '', placeholder: '0', inputmode: 'decimal', disabled: ro, autocomplete: 'off' });
    pr.addEventListener('change', () => { const v = parseFloat(pr.value.replace(/[€\s.]/g, '').replace(',', '.')); this.updateFurn(f.id, x => { x.shop.price = isFinite(v) ? v : null; }); });
    const stat = h('select', { class: 'select', id: 'f-shop-status', disabled: ro }, ...SHOP_STATUS.map(([k, lab]) => h('option', { value: k, selected: (s.status || 'tobuy') === k }, t(lab))));
    stat.addEventListener('change', () => this.updateFurn(f.id, x => { x.shop.status = stat.value; }));
    const link = h('input', { class: 'input', id: 'f-shop-link', value: s.link || '', placeholder: 'https://…', inputmode: 'url', disabled: ro, autocomplete: 'off' });
    link.addEventListener('input', () => this.updateFurn(f.id, x => { x.shop.link = link.value.trim(); }, 'link'));
    return h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Shopping')),
      h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', { for: 'f-shop-store' }, t('Shop')), store),
        h('div', { class: 'field' }, h('label', { for: 'f-shop-price' }, t('Price')), h('div', { class: 'input-unit' }, pr, h('span', { class: 'unit' }, '€')))),
      h('div', { class: 'field' }, h('label', { for: 'f-shop-status' }, t('Status')), stat),
      h('div', { class: 'field' }, h('label', { for: 'f-shop-link' }, t('Link')), h('div', { class: 'row-inline' }, link, s.link ? h('a', { class: 'btn sm', href: safeUrl(s.link), target: '_blank', rel: 'noopener' }, icon('link'), t('Open')) : null)));
  },
  furnMultiPanel(el, items, ro) {
    const ids = items.map(f => f.id);
    this.inspHead(el, t('{n} pieces', { n: items.length }), t('Selected together'));
    const total = items.reduce((s2, f) => s2 + price(f), 0);
    el.appendChild(h('div', { class: 'insp-sec' },
      h('div', { class: 'room-list' }, ...items.map(f => h('button', { class: 'room-row', onclick: () => this.select({ type: 'furn', ids: [f.id] }) }, h('span', { class: 'sw', style: { background: f.color } }), h('span', null, furnName(f)), h('span', { class: 'ar' }, price(f) ? fmtEuro(price(f)) : '')))),
      total ? h('div', { class: 'room-row total' }, h('span'), h('span', null, t('Together')), h('span', { class: 'ar' }, fmtEuro(total))) : null));
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      h('button', { class: 'btn sm primary', onclick: () => this.saveSet(ids) }, icon('group'), t('Save as set')),
      h('button', { class: 'btn sm', onclick: () => this.turnFurniture(ids, 90) }, icon('rotate'), t('Turn 90°')),
      h('button', { class: 'btn sm', onclick: () => this.duplicateFurniture(ids) }, icon('dup'), t('Duplicate')),
      h('button', { class: 'btn sm danger', onclick: () => this.deleteFurniture(ids) }, icon('trash'), t('Delete'))),
      h('p', { class: 'note-muted' }, t('Drag one of them to move them all. Shift-click (or “Several”) adds or removes a piece.'))));
    if (!ro) el.appendChild(this.furnEditButtons(ids));
  },
  /** Furnish mode, nothing selected: the layout, its pieces, the totals and the space check */
  furnOverview(el) {
    const lay = this.activeLayout();
    const p = this.project;
    this.inspHead(el, lay ? lay.name : t('Furniture'), t('Furniture layout'));
    const tot = layoutTotals(lay);
    el.appendChild(h('div', { class: 'insp-sec' },
      h('p', { class: 'note-muted' }, t('A layout is a set of furniture on its own: it is shown on whichever house version you pick. Make more layouts to compare (layout button at the top).')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn sm primary', disabled: this.comparing, onclick: () => this.catalogSheet() }, icon('catalog'), t('Add furniture')),
        h('button', { class: 'btn sm', onclick: () => this.setsSheet() }, icon('group'), t('Sets')),
        h('button', { class: 'btn sm', onclick: () => this.shoppingSheet() }, icon('cart'), t('Shopping list')))));
    this.spaceCheckSection(el);
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Pieces'), h('span', { class: 'num', style: { fontSize: '12px', letterSpacing: 0 } }, tot.total ? fmtEuro(tot.total) : '')));
    const list = h('div', { class: 'room-list' });
    for (const st of sortedStoreys(p)) {
      const items = (lay ? lay.items : []).filter(f => f.storey === st.id);
      if (!items.length) continue;
      list.appendChild(h('div', { class: 'group-title' }, st.name));
      for (const f of items) list.appendChild(h('button', { class: 'room-row', onclick: () => { if (this.view.storeyId !== f.storey || this.view.scope !== 'storey') this.setScope('storey', f.storey); this.select({ type: 'furn', ids: [f.id] }); } },
        h('span', { class: 'sw', style: { background: f.color } }), h('span', null, furnName(f)), h('span', { class: 'ar' }, price(f) ? fmtEuro(price(f)) : '')));
    }
    if (!lay || !lay.items.length) list.appendChild(h('p', { class: 'note-muted' }, t('No furniture yet. Tap “Add furniture”.')));
    sec.appendChild(list);
    el.appendChild(sec);
  },

  /* ───────── the small live 3D view next to the 2D plan (Build and Furnish) ─────────
     On or off per mode: Settings sets how it starts (Build off, Furnish on), the 3D chip switches it for now. */
  pipDefault(mode) {
    const s = this.settings;
    return mode === 'build' ? s.pipBuild === true : (s.pipFurnish ?? (s.pip !== false));
  },
  pipOn(mode = this.mode) {
    if (mode !== 'build' && mode !== 'furnish') return false;
    const st = this.pipState || (this.pipState = {});
    return mode in st ? st[mode] : this.pipDefault(mode);
  },
  pipPossible() { return this.view.dim === '2d' && this.view.scope === 'storey' && !this.comparing && !window.matchMedia('(max-width: 860px)').matches; },
  pipChip() {
    if (!this.pipPossible()) return null;
    const on = this.pipOn();
    return h('button', { class: 'chip pip-chip', id: 'pip-chip', 'aria-pressed': String(on), title: this.mode === 'build' ? t('A small live 3D view next to the plan') : t('A small live 3D view while you place furniture'),
      onclick: () => { (this.pipState || (this.pipState = {}))[this.mode] = !on; this.updatePip(); this.renderStageOverlays(); } }, icon('cube'), h('span', { class: 'hide-xs' }, '3D'));
  },
  updatePip() {
    const want = this.project && (this.mode === 'furnish' || this.mode === 'build') && this.pipOn() && this.pipPossible();
    const stage = $('#stage');
    if (!want) { if (this.pip) { this.pip.destroy(); this.pipEl && this.pipEl.remove(); this.pip = null; this.pipEl = null; } return; }
    if (this.pip && this.pipEl && this.pipEl.isConnected) { this.refreshPip(true); return; }
    if (this.pip) { this.pip.destroy(); this.pip = null; }
    this.pipEl = h('div', { class: 'pip' }, h('div', { class: 'pip-label' }, icon('cube'), '3D'));
    stage.appendChild(this.pipEl);
    this.pip = new View3D(this.pipEl, this, { mini: true });
    this._pipSig = null;
    this.refreshPip(true);
  },
  refreshPip(force) {
    const v3 = this.pip;
    if (!v3 || !v3.ok) return;
    const p = this.project, st = this.currentStorey();
    if (!st) return;
    const shown = this.shownVersion();
    const en = { storey: st, plan: shown.plan, offset: [0, 0], y: 0, versionId: shown.id, edit: false, bbox: this.storeyBBox([shown.plan], st, false), ...this.entryExtras(st, 'main') };
    const sig = [shown.id, shown.updated, st.id, this.display, JSON.stringify(VIEW_KEYS.map(k => this.settings[k])), (p.notes || []).length].join('|');
    if (!force && sig === this._pipSig && v3.spec) { v3.spec.selection = this.selection; v3.updateFurniture(() => en.furniture); this.pipFollow(); return; }
    this._pipSig = sig;
    v3.build({ entries: [en], cut: false, ground: this.settings.ground !== false, plinth: this.settings.plinth !== false, windows: this.settings.windows !== false, outside: this.settings.outside !== false, roof: false, floors: true, shell: this.shell, origPlan: (getOriginal(this.project) || {}).plan || null, scope: 'storey',
      sliceKey: 'pip|' + st.id, homeView: null, labels: false, selection: this.selection, fitKey: 'pip|' + st.id, mode: this.mode, light: this.settings.light === 'evening' ? 'evening' : 'day', ceilings: true });
    this.pipFollow();
  },
  /** the live view keeps the selected piece (Furnish) or room, wall, door or window (Build) in the middle */
  pipFollow() {
    const v3 = this.pip, sel = this.selection;
    if (!v3 || !sel) return;
    if (sel.type !== 'furn') return this.pipFollowBuild(sel);
    const items = this.furnItems(sel.ids);
    if (!items.length) return;
    const key = sel.ids.join(',');
    const c = new THREE.Vector3(items.reduce((s2, f) => s2 + f.x, 0) / items.length, 0.5, items.reduce((s2, f) => s2 + f.y, 0) / items.length);
    if (key !== this._pipFollowKey) {
      // a new selection: look at it from inside its room, from above at an angle
      this._pipFollowKey = key;
      const plan = this.shownVersion().plan;
      const room = plan.rooms.find(r => r.storey === items[0].storey && pointInPolygon([c.x, c.z], r.poly));
      let dir = room ? V.sub(labelPoint(room.poly, roomHoles(plan, room)), [c.x, c.z]) : furnToPlan(items[0], [0, 1]).map((v, i) => v - [items[0].x, items[0].y][i]);
      if (Math.hypot(dir[0], dir[1]) < 0.3) dir = furnToPlan(items[0], [0, 1]).map((v, i) => v - [items[0].x, items[0].y][i]);
      dir = V.norm(dir);
      v3.controls.target.copy(c);
      v3.camera.position.set(c.x + dir[0] * 3.6, 4.2, c.z + dir[1] * 3.6);
    } else {
      // the same piece moved: the view moves along
      const off = v3.camera.position.clone().sub(v3.controls.target);
      v3.controls.target.copy(c);
      v3.camera.position.copy(c).add(off);
    }
    v3.needs = true;
  },

  pipFollowBuild(sel) {
    const v3 = this.pip, plan = this.shownVersion().plan;
    let c = null, look = null;
    if (sel.type === 'room') { const r = plan.rooms.find(x => x.id === sel.id); if (r) c = labelPoint(r.poly, roomHoles(plan, r)); }
    else if (sel.type === 'wall') { const w = plan.walls.find(x => x.id === sel.id); if (w) { c = V.lerp(w.a, w.b, 0.5); look = V.perp(V.norm(V.sub(w.b, w.a))); } }
    else if (sel.type === 'opening') { const o = plan.openings.find(x => x.id === sel.id), w = o && plan.walls.find(x => x.id === o.wall); if (w) { c = V.add(w.a, V.mul(wallDir(w), o.pos)); look = V.perp(wallDir(w)); } }
    else if (sel.type === 'void') { const vd = (plan.voids || []).find(x => x.id === sel.id); if (vd) { const bb = bboxOfPoints(vd.poly); c = [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2]; } }
    if (!c) return;
    const key = sel.type + ':' + sel.id;
    if (key === this._pipFollowKey) return;
    this._pipFollowKey = key;
    const tgt = new THREE.Vector3(c[0], 0.8, c[1]);
    const off = look ? new THREE.Vector3(look[0] * 4, 4.2, look[1] * 4) : v3.camera.position.clone().sub(v3.controls.target).setLength(6.5);
    if (off.y < 2.5) off.y = 4.2;
    v3.controls.target.copy(tgt);
    v3.camera.position.copy(tgt).add(off);
    v3.needs = true;
  },

  /** the 3D pictures only need the furniture redone when nothing else changed */
  houseSig(pane, v) {
    const sel = this.selection;
    return [pane.role, v.id, v.updated, this.display, this.view.scope, this.view.storeyId, this.baseVersion().id, this.mode, !!this.walking, this.tool,
      JSON.stringify(this.project.homeViews || {}), document.documentElement.dataset.theme || '', cssVar('--paper'), this.settings.quality,
      sel && sel.type !== 'furn' ? JSON.stringify(sel) : '', JSON.stringify(VIEW_KEYS.map(k => this.settings[k])),
      JSON.stringify((this.project.notes || []).map(n => [n.id, n.at, n.type, n.status])), this.activeLayout() && this.activeLayout().id, JSON.stringify(this.project.site || null)].join('|');
  },
});

/** a small drawing of a piece for the catalogue (its 2D symbol) */
function furnPreview(it) {
  const pad = Math.max(it.w, it.d) * 0.12 + 0.05;
  const svg = s('svg', { class: 'furn-prev', viewBox: `${-it.w / 2 - pad} ${-it.d / 2 - pad} ${it.w + pad * 2} ${it.d + pad * 2}`, 'aria-hidden': 'true' });
  svg.appendChild(furnSymbolGroup(it, true));
  return svg;
}
function setPreview(set) {
  const pts = set.items.flatMap(f => furnCorners({ ...f, x: f.dx, y: f.dy }));
  const bb = bboxOfPoints(pts) || { minX: -1, minY: -1, w: 2, h: 2 };
  const pad = Math.max(bb.w, bb.h) * 0.08 + 0.05;
  const svg = s('svg', { class: 'furn-prev set', viewBox: `${bb.minX - pad} ${bb.minY - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}`, 'aria-hidden': 'true' });
  for (const f of set.items) svg.appendChild(furnSymbolGroup({ ...f, x: f.dx, y: f.dy }, true));
  return svg;
}
/** the SVG group of one piece (plan coordinates) */
function furnSymbolGroup(it, preview) {
  const g = s('g', { class: 'furn', transform: `translate(${fx(it.x)} ${fx(it.y)}) rotate(${fx(it.rot || 0)})${it.flip ? ' scale(-1 1)' : ''}` });
  const col = it.color || furnType(it).color;
  for (const part of furnSymbol(it)) {
    if (part.c === 't') { g.appendChild(s('text', { x: part.x, y: part.y, class: 'furn-t', 'font-size': part.size || Math.min(it.w, it.d) * 0.32 }, part.text)); continue; }
    const at = { d: part.d, class: 'furn-' + part.c };
    if (part.c === 'o') { at.style = `fill:${col}`; }
    g.appendChild(s('path', at));
  }
  return g;
}
function safeUrl(u) { const v = String(u || '').trim(); return /^https?:\/\//i.test(v) ? v : v ? 'https://' + v.replace(/^\/+/, '') : '#'; }
