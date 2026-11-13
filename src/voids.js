/* ───────────── voids.js — openings in a floor (stairwell, vide) as zones you see and edit ─────────────
   plan.voids = [{ id, storey, kind: 'stair' | 'vide', poly }]. A floor opening stops the room's floor there (2D
   colour, 3D floor, slab and the ceiling below stay open). In Build it is drawn as a dashed zone with a cross
   (as on a drawing), can be selected, moved, resized by its corners and deleted; the Floor opening tool (H)
   draws a new one with two taps (opposite corners). Floor openings belong to the house as built, so a new one
   goes into every version, the original too, unless "All versions" is switched off; "Same in all versions"
   copies a changed one everywhere. */

const VOID_KINDS = [['stair', 'Stairwell'], ['vide', 'Open to below (vide)']];
const voidLabel = vd => t(vd.kind === 'vide' ? 'Vide' : 'Stairwell');
const isRect = poly => poly.length === 4 && poly.every((q, i) => { const r = poly[(i + 1) % 4]; return Math.abs(q[0] - r[0]) < 1e-6 || Math.abs(q[1] - r[1]) < 1e-6; });

Object.assign(PlanView.prototype, {
  drawVoids(g, en) {
    const vs = (en.plan.voids || []).filter(v => v.storey === en.storey.id && v.poly.length >= 3);
    if (!vs.length) return;
    const sel = this.spec.selection;
    const gg = s('g', { class: 'voids' + (this.spec.mode === 'build' ? ' build' : '') });
    for (const vd of vs) {
      const ring = 'M' + vd.poly.map(q => q[0].toFixed(4) + ' ' + q[1].toFixed(4)).join('L') + 'Z';
      const isSel = sel && sel.type === 'void' && sel.id === vd.id;
      gg.appendChild(s('path', { d: ring, class: 'void-zone' + (isSel ? ' sel' : ''), 'data-void': vd.id }));
      // the cross of an opening in a floor
      const bb = bboxOfPoints(vd.poly);
      const X = vd.poly.length === 4 ? `M${vd.poly[0].join(' ')}L${vd.poly[2].join(' ')}M${vd.poly[1].join(' ')}L${vd.poly[3].join(' ')}` : `M${bb.minX} ${bb.minY}L${bb.maxX} ${bb.maxY}M${bb.maxX} ${bb.minY}L${bb.minX} ${bb.maxY}`;
      gg.appendChild(s('path', { d: X, class: 'void-cross' }));
    }
    g.appendChild(gg);
  },
  drawVoidLabels(g, en, off) {
    if (this.cam.s < 22) return;
    for (const vd of (en.plan.voids || []).filter(v => v.storey === en.storey.id && v.poly.length >= 3)) {
      const bb = bboxOfPoints(vd.poly);
      if (Math.min(bb.w, bb.h) * this.cam.s < 40) continue;
      const p = this.toScreen([(bb.minX + bb.maxX) / 2 + off[0], (bb.minY + bb.maxY) / 2 + off[1]]);
      g.appendChild(s('text', { x: p[0], y: p[1], class: 'void-label' }, voidLabel(vd)));
      g.appendChild(s('text', { x: p[0], y: p[1] + 13, class: 'void-label dim' }, fmtMM(bb.w) + ' × ' + fmtMM(bb.h)));
    }
  },
  voidHit(p, en) {
    let best = null, area = Infinity;
    for (const vd of en.plan.voids || []) {
      if (vd.storey !== en.storey.id || vd.poly.length < 3 || !pointInPolygon(p, vd.poly)) continue;
      const a = Math.abs(polygonArea(vd.poly));
      if (a < area) { area = a; best = { type: 'void', id: vd.id }; }
    }
    return best;
  },
  /** the Floor opening tool: first tap one corner, then the opposite corner */
  voidTap(p, en) {
    if (!this.chain || this.chain.type !== 'void') { this.chain = { type: 'void', pts: [p], preview: null }; this.drawOverlay(); this.app.emit('chain'); return; }
    const a = this.chain.pts[0];
    this.chain = null; this.snapMark = null;
    const w = Math.abs(p[0] - a[0]), d = Math.abs(p[1] - a[1]);
    if (w < 0.2 || d < 0.2) { this.app.toast(t('Too small: tap two opposite corners at least 20 cm apart.')); this.drawOverlay(); this.app.emit('chain'); return; }
    const x0 = Math.min(a[0], p[0]), x1 = Math.max(a[0], p[0]), y0 = Math.min(a[1], p[1]), y1 = Math.max(a[1], p[1]);
    this.app.addVoid(en.storey.id, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(q => [round(q[0], 0.001), round(q[1], 0.001)]));
    this.drawOverlay();
    this.app.emit('chain');
  },
  /** dragging a corner: a rectangle stays a rectangle */
  moveVoidCorner(vd, i, q) {
    if (isRect(vd.poly)) {
      const P = vd.poly, prev = (i + 3) % 4, next = (i + 1) % 4;
      const old = P[i];
      P[i] = [...q];
      for (const j of [prev, next]) {
        if (Math.abs(P[j][0] - old[0]) < 1e-6) P[j] = [q[0], P[j][1]];
        else if (Math.abs(P[j][1] - old[1]) < 1e-6) P[j] = [P[j][0], q[1]];
      }
    } else vd.poly[i] = [...q];
  },
});

Object.assign(app, {
  addVoid(storeyId, poly) {
    const all = this.toolOpts.voidAll !== false;
    const vd = { id: uid('fv_'), storey: storeyId, kind: 'stair', poly };
    let ok;
    if (all) ok = this.mutate((pr) => { for (const v of pr.versions) { v.plan.voids = v.plan.voids || []; v.plan.voids.push(clone(vd)); v.updated = Date.now(); } }, { project: true });
    else ok = this.mutate(plan => { (plan.voids = plan.voids || []).push(vd); });
    if (!ok) return;
    this.select({ type: 'void', id: vd.id });
    this.toast(all ? t('Floor opening added in every version (the original too). The floor stops here.') : t('Floor opening added in this version. The floor stops here.'));
  },
  /** copy this floor opening (as it is now) into every version, the original included */
  voidToAllVersions(vd) {
    const ok = this.mutate(pr => {
      for (const v of pr.versions) {
        v.plan.voids = v.plan.voids || [];
        const i = v.plan.voids.findIndex(x => x.id === vd.id);
        if (i >= 0) v.plan.voids[i] = clone(vd); else v.plan.voids.push(clone(vd));
        v.updated = Date.now();
      }
    }, { project: true, keepInspector: true });
    if (ok) this.toast(t('This floor opening is now the same in every version, the original too.'), { action: { label: t('Undo'), fn: () => this.undo() } });
  },
  deleteVoidEverywhere(vd) {
    const ok = this.mutate(pr => { for (const v of pr.versions) if (v.plan.voids && v.plan.voids.some(x => x.id === vd.id)) { v.plan.voids = v.plan.voids.filter(x => x.id !== vd.id); v.updated = Date.now(); } }, { project: true });
    if (ok) { this.selection = null; this.renderInspector(); this.toast(t('Floor opening deleted in every version.'), { action: { label: t('Undo'), fn: () => this.undo() } }); }
  },
  voidPanel(el, vd) {
    const shown = this.shownVersion();
    const ro = this.selection.readOnly || shown.locked || this.mode !== 'build' || !this.canEdit();
    const st = getStorey(this.project, vd.storey);
    const bb = bboxOfPoints(vd.poly);
    this.inspHead(el, voidLabel(vd), st ? st.name : '');
    const upd = (fn, opts = {}) => this.mutate(plan => { const x = (plan.voids || []).find(y => y.id === vd.id); if (x) fn(x); }, { keepInspector: true, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(this.segRow(t('What'), VOID_KINDS, vd.kind || 'stair', k => upd(x => { x.kind = k; }, { keepInspector: false }), ro, 'void-kind'));
    sec.appendChild(h('dl', { class: 'kv' }, h('dt', null, t('Size')), h('dd', null, fmtMM(bb.w) + ' × ' + fmtMM(bb.h) + ' mm'), h('dt', null, t('Area')), h('dd', null, fmtArea(Math.abs(polygonArea(vd.poly))))));
    if (isRect(vd.poly)) sec.appendChild(h('div', { class: 'field-row' },
      this.mmField(t('Width'), 'f-void-w', bb.w, v => upd(x => { const w = clamp(v, 0.2, 20); x.poly = x.poly.map(q => [Math.abs(q[0] - bb.maxX) < 1e-6 ? round(bb.minX + w, 0.001) : q[0], q[1]]); }, { keepInspector: false }), { disabled: ro }),
      this.mmField(t('Depth'), 'f-void-d', bb.h, v => upd(x => { const d = clamp(v, 0.2, 20); x.poly = x.poly.map(q => [q[0], Math.abs(q[1] - bb.maxY) < 1e-6 ? round(bb.minY + d, 0.001) : q[1]]); }, { keepInspector: false }), { disabled: ro })));
    sec.appendChild(h('p', { class: 'note-muted' }, t('An opening in this floor: the room gets no floor here, and the floor slab and the ceiling below stay open (3D and the quantities).')));
    const inAll = this.project.versions.every(v => (v.plan.voids || []).some(x => x.id === vd.id && JSON.stringify(x) === JSON.stringify(vd)));
    sec.appendChild(h('p', { class: 'note-muted void-all' }, inAll ? t('The same in every version, the original too.') : t('Not the same in every version.')));
    el.appendChild(sec);
    if (this.mode === 'build' && this.canEdit()) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      inAll ? null : h('button', { class: 'btn sm', id: 'void-all', onclick: () => this.voidToAllVersions(vd) }, icon('copy'), t('Same in all versions')),
      ro ? null : h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete')),
      h('button', { class: 'btn sm danger ghost', id: 'void-del-all', onclick: () => this.deleteVoidEverywhere(vd) }, icon('trash'), t('Delete in all versions'))),
      ro ? h('p', { class: 'note-muted' }, t('This version is locked. “Same in all versions” and “Delete in all versions” still change the floor openings everywhere, because they belong to the house as built.')) : h('p', { class: 'note-muted' }, t('Drag it to move it; drag a corner to change its size.'))));
  },
});
