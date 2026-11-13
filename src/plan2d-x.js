/* ───────────── plan2d-x.js — the 2D plan, part 2: furniture (symbols, dragging, turning, sizing, snapping
   against walls and other pieces), note pins, walking paths, space-check marks, and taps in Furnish and View ───────────── */

/** kinds that stand with their back against a wall */
const FURN_WALL_KINDS = new Set(['sofa', 'corner', 'bed', 'wardrobe', 'cabinet', 'bookcase', 'desk', 'toilet', 'vanity', 'bath', 'towelrad', 'washer', 'kbase', 'ktall', 'kwall', 'khood', 'tv', 'crib', 'krun']);
const NOTE_GLYPH = { question: '?', todo: '✓', decision: '⚑', idea: '✦', problem: '!', snag: '◎' };

Object.assign(PlanView.prototype, {
  /** the entry whose furniture can be moved (Furnish mode, one storey, not comparing) */
  furnEntry() { return this.spec.furnEdit ? this.spec.entries.find(en => en.edit && !en.wallsOnly) : null; },

  drawFurniture(g, en) {
    const sel = this.spec.selection;
    const ids = sel && sel.type === 'furn' ? new Set(sel.ids) : null;
    const bad = this.spec.spaceCheck ? new Set(this.spec.spaceCheck.results.filter(r => r.level === 'problem').flatMap(r => r.ids || [])) : null;
    const box = s('g', { class: 'furn-layer' + (en.faintFurn ? ' faint' : '') });
    // rugs first, things hanging above (wall cabinets, lights) last
    const order = f => (furnType(f).flat ? 0 : furnType(f).high ? 2 : 1);
    for (const f of [...en.furniture].sort((a, b) => order(a) - order(b))) {
      if (f.storey !== en.storey.id) continue;
      const fg = furnSymbolGroup(f);
      fg.setAttribute('data-furn', f.id);
      if (ids && ids.has(f.id) && en.edit) fg.classList.add('sel');
      if (bad && bad.has(f.id) && en.edit) fg.classList.add('bad');
      box.appendChild(fg);
    }
    g.appendChild(box);
  },
  furnAt(en, p) {
    // the top-most piece under the point (hanging ones first, rugs last)
    const list = (en.furniture || []).filter(f => f.storey === en.storey.id);
    const order = f => (furnType(f).high ? 0 : furnType(f).flat ? 2 : 1);
    const tol = 4 / this.cam.s;
    return list.slice().sort((a, b) => order(a) - order(b) || (a.w * a.d) - (b.w * b.d)).find(f => furnHit(f, p, tol)) || null;
  },

  /* ───────── overlay (screen space): selection outline and handles ───────── */
  drawModeOverlay(g) {
    if (this.spec.mode !== 'furnish') return;
    const en = this.furnEntry();
    const sel = this.spec.selection;
    if (!en || !sel || sel.type !== 'furn') return;
    const items = en.furniture.filter(f => sel.ids.includes(f.id));
    for (const f of items) {
      const pts = furnCorners(f).map(q => this.toScreen([q[0] + en.offset[0], q[1] + en.offset[1]]));
      g.appendChild(s('polygon', { points: pts.map(q => q.join(',')).join(' '), class: 'furn-selbox' }));
    }
    if (items.length !== 1) return;
    for (const hd of this.furnHandles(en, items[0])) {
      if (hd.kind === 'rot') {
        g.appendChild(s('line', { x1: hd.from[0], y1: hd.from[1], x2: hd.p[0], y2: hd.p[1], class: 'furn-rotline' }));
        g.appendChild(s('circle', { cx: hd.p[0], cy: hd.p[1], r: 8, class: 'handle furn-rot' }));
        g.appendChild(s('path', { d: `M${hd.p[0] - 3.5} ${hd.p[1] - 2}a4 4 0 1 1 1 4.5`, class: 'furn-rot-ic' }));
      } else g.appendChild(s('rect', { x: hd.p[0] - 5, y: hd.p[1] - 5, width: 10, height: 10, class: 'handle furn-size', transform: `rotate(${(items[0].rot || 0).toFixed(1)} ${hd.p[0]} ${hd.p[1]})` }));
    }
    // size while dragging or sizing
    const d = this.drag;
    if (d && d.started && (d.mode === 'furn-size' || d.mode === 'furn-move' || d.mode === 'furn-rot')) {
      const f = items[0];
      const c = this.toScreen([f.x + en.offset[0], f.y + en.offset[1]]);
      const txt = d.mode === 'furn-rot' ? Math.round(f.rot || 0) + '°' : `${Math.round(f.w * 100)} × ${Math.round(f.d * 100)}`;
      g.appendChild(s('text', { x: c[0], y: c[1] - 4, class: 'dim-label strong live' }, txt));
    }
    if (d && d.started && d.mode === 'furn-move' && d.snapMarks) for (const m of d.snapMarks) {
      const a = this.toScreen([m.a[0] + en.offset[0], m.a[1] + en.offset[1]]), b = this.toScreen([m.b[0] + en.offset[0], m.b[1] + en.offset[1]]);
      g.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'guide snapline' }));
    }
  },
  furnHandles(en, f) {
    const off = en.offset;
    const S = q => this.toScreen([q[0] + off[0], q[1] + off[1]]);
    const front = S(furnToPlan(f, [0, f.d / 2])), centre = S([f.x, f.y]);
    const dir = V.norm(V.sub(front, centre).some(v => Math.abs(v) > 0.01) ? V.sub(front, centre) : [0, 1]);
    return [
      { kind: 'rot', p: V.add(front, V.mul(dir, 26)), from: front },
      { kind: 'size-w', p: S(furnToPlan(f, [f.w / 2, 0])) },
      { kind: 'size-d', p: S(furnToPlan(f, [0, f.d / 2])) },
    ];
  },

  /* ───────── note pins, walking paths and space-check marks (screen space, drawn with the labels) ───────── */
  drawModeLabels(g) {
    for (const en of this.spec.entries) {
      if (en.wallsOnly) continue;
      const off = en.offset;
      if (en.paths) this.drawPaths(g, en);
      for (const pin of en.pins || []) {
        const p = this.toScreen([pin.x + off[0], pin.y + off[1]]);
        const pDone = pin.status === 'done' && !DIARY_TYPES.has(pin.type);   // a diary entry is a record: not faded, its own sign
        const pg = s('g', { class: 'pin2d pin-' + pin.type + (pDone ? ' done' : '') + (pin.sel ? ' sel' : ''), transform: `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`, 'data-note': pin.id });
        pg.appendChild(s('path', { d: 'M0 0C-3 -6 -10 -9 -10 -16a10 10 0 1 1 20 0c0 7 -7 10 -10 16z', class: 'pin-shape' }));
        pg.appendChild(s('text', { x: 0, y: -12.5, class: 'pin-glyph' + (pin.no ? ' num' : '') }, pDone ? '✓' : pin.no ? String(pin.no) : (NOTE_GLYPH[pin.type] || '•')));
        pg.appendChild(s('title', null, pin.title));
        g.appendChild(pg);
      }
    }
    const sc = this.spec.spaceCheck;
    const en = this.spec.entries.find(x => x.edit && !x.wallsOnly);
    if (sc && en) {
      sc.results.forEach((r, i) => {
        if (r.storey !== en.storey.id || !r.at) return;
        const p = this.toScreen([r.at[0] + en.offset[0], r.at[1] + en.offset[1]]);
        if (r.cells) for (const c of r.cells) { const q = this.toScreen([c[0] + en.offset[0], c[1] + en.offset[1]]); g.appendChild(s('circle', { cx: q[0], cy: q[1], r: Math.max(2, 0.05 * this.cam.s), class: 'sc-cell' })); }
        if (r.poly) g.appendChild(s('polygon', { points: r.poly.map(q => this.toScreen([q[0] + en.offset[0], q[1] + en.offset[1]]).join(',')).join(' '), class: 'sc-zone ' + r.level }));
        const mk = s('g', { class: 'sc-mark ' + r.level, transform: `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})` });
        mk.appendChild(s('circle', { r: 9 }));
        mk.appendChild(s('text', { y: 4 }, String(i + 1)));
        mk.appendChild(s('title', null, r.text));
        g.appendChild(mk);
      });
    }
  },
  drawPaths(g, en) {
    const W = en.paths, sid = en.storey.id, off = en.offset;
    const byId = new Map(W.nodes.map(n => [n.id, n]));
    const S = n => this.toScreen([n.x + off[0], n.y + off[1]]);
    let d = '';
    const cross = new Set();
    for (const [a, b] of W.edges) {
      const A = byId.get(a), B = byId.get(b);
      if (!A || !B) continue;
      if (A.storey === sid && B.storey === sid) { const p = S(A), q = S(B); d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }
      else if (A.storey === sid) cross.add(A.id); else if (B.storey === sid) cross.add(B.id);
    }
    if (d) g.appendChild(s('path', { d, class: 'walk-edge' }));
    const selId = this.app.pathSel;
    for (const n of W.nodes) {
      if (n.storey !== sid) continue;
      const p = S(n);
      g.appendChild(s('circle', { cx: p[0], cy: p[1], r: n.id === selId ? 8 : 6, class: 'walk-node' + (n.id === selId ? ' sel' : '') + (n.auto ? ' auto' : ''), 'data-node': n.id }));
      if (cross.has(n.id)) g.appendChild(s('path', { d: `M${p[0] - 5} ${p[1] + 4}h3v-3h3v-3h3`, class: 'walk-stair' }));
    }
    if (this.app.walking && this.app.walker && this.app.walker.view) {
      const st = this.app.walker.state();
      if (st.storey === sid) { const p = this.toScreen([st.x + off[0], st.y + off[1]]); g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 7, class: 'walk-me' })); }
    }
  },
  pinAt(sp) {
    let best = null, bd = 16;
    for (const en of this.spec.entries) for (const pin of en.pins || []) {
      const p = this.toScreen([pin.x + en.offset[0], pin.y + en.offset[1]]);
      const dd = Math.hypot(sp[0] - p[0], sp[1] - (p[1] - 14));
      if (dd < bd) { bd = dd; best = { pin, en }; }
    }
    return best;
  },
  nodeAt(sp, en) {
    if (!en || !en.paths) return null;
    let best = null, bd = 14;
    for (const n of en.paths.nodes) {
      if (n.storey !== en.storey.id) continue;
      const p = this.toScreen([n.x + en.offset[0], n.y + en.offset[1]]);
      const dd = Math.hypot(sp[0] - p[0], sp[1] - p[1]);
      if (dd < bd) { bd = dd; best = n; }
    }
    return best;
  },

  /* ───────── pointer: Furnish and View ───────── */
  modeDown(e, sp, wp) {
    const mode = this.spec.mode;
    if (mode === 'furnish') {
      const en = this.furnEntry();
      if (!en) return false;
      const p = this.local(en, wp);
      const sel = this.spec.selection;
      if (sel && sel.type === 'furn' && sel.ids.length === 1) {
        const f = en.furniture.find(x => x.id === sel.ids[0]);
        if (f) {
          // a handle wins when it is close; on the piece itself only when the finger is right on the handle
          const inside = furnHit(f, p);
          const r = e.pointerType === 'mouse' ? 11 : inside ? 12 : 22;
          const hd = this.furnHandles(en, f).map(hh => ({ hh, d: V.dist(hh.p, sp) })).filter(x => x.d < r).sort((a, b) => a.d - b.d).map(x => x.hh)[0];
          if (hd) { this.drag = { mode: hd.kind === 'rot' ? 'furn-rot' : 'furn-size', which: hd.kind, id: f.id, en, f0: { ...f }, start: p, started: false }; return true; }
        }
      }
      const f = this.furnAt(en, p);
      if (f) { this.drag = { mode: 'furn-move', id: f.id, en, start: p, started: false, shift: e.shiftKey }; return true; }
      return false;
    }
    if (mode === 'view') {
      const hit = this.pinAt(sp);
      const sel = this.spec.selection;
      if (hit && sel && sel.type === 'note' && sel.id === hit.pin.id && !this.app.comparing) { this.drag = { mode: 'pin-move', id: hit.pin.id, en: hit.en, started: false }; return true; }
      if (this.app.tool === 'path') {
        const en = this.spec.entries.find(x => x.edit && !x.wallsOnly);
        const n = this.nodeAt(sp, en);
        if (n) { this.drag = { mode: 'node-move', id: n.id, en, started: false, t0: performance.now(), sp }; if (e.pointerType !== 'mouse') this.armLongPress(n.id, sp); return true; }
      }
    }
    return false;
  },
  armLongPress(id, sp) {
    clearTimeout(this._lp);
    this._lp = setTimeout(() => { if (this.drag && this.drag.mode === 'node-move' && !this.drag.started && this.drag.id === id) { this.drag = null; this.gesture = null; this.app.deletePathNode(id); } }, 650);
  },
  modeDragStart() {
    const d = this.drag;
    clearTimeout(this._lp);
    d.started = true;
    if (d.mode === 'furn-move') {
      const sel = this.spec.selection;
      const ids = sel && sel.type === 'furn' ? sel.ids : [];
      let move;
      if (ids.includes(d.id)) move = ids;
      else if (d.shift || this.app.multiSel) move = [...ids, d.id];
      else move = [d.id];
      if (!(ids.length === move.length && move.every(x => ids.includes(x)))) this.app.select({ type: 'furn', ids: move });
      d.ids = move;
      d.orig = move.map(id => { const f = d.en.furniture.find(x => x.id === id); return f ? { id, x: f.x, y: f.y, rot: f.rot || 0 } : null; }).filter(Boolean);
    }
    this.app.beginGesture();
  },
  modeDrag(wp, e) {
    const d = this.drag, app = this.app;
    if (d.mode === 'pin-move' || d.mode === 'node-move') {
      const p = this.local(d.en, wp);
      if (d.mode === 'pin-move') app.mutate(pr => { const n = pr.notes.find(x => x.id === d.id); if (n && n.at) { n.at.x = +p[0].toFixed(3); n.at.y = +p[1].toFixed(3); } }, { project: true, gesture: true, keepInspector: true });
      else app.mutate(pr => { const n = pr.walk.nodes.find(x => x.id === d.id); if (n) { n.x = +p[0].toFixed(3); n.y = +p[1].toFixed(3); } }, { project: true, gesture: true, keepInspector: true });
      return;
    }
    const en = d.en, p = this.local(en, wp);
    const lay = app.activeLayout();
    app._furnOnly = true;
    const find = id => lay.items.find(x => x.id === id);
    const snapOn = app.settings.furnSnap !== false && !(e && e.altKey);
    if (d.mode === 'furn-move') app.dragFurnMove(d, p, Math.max(0.05, 12 / this.cam.s), e);
    else if (d.mode === 'furn-rot') app.dragFurnRot(d, p, e);
    else if (d.mode === 'furn-size') {
      const f = find(d.id);
      if (!f) return;
      // the opposite edge stays where it is (the back stays against the wall)
      const q = furnLocal(d.f0, p);
      const grid = 0.01;
      // a 3D model keeps its proportions (unless "Keep proportions" is off): the back and the left side stay
      const prop = furnType(f).kind === 'model' && !f.free;
      app.mutate(() => {
        if (prop) {
          const k = d.which === 'size-w' ? Math.max(0.1, q[0] + d.f0.w / 2) / d.f0.w : Math.max(0.1, q[1] + d.f0.d / 2) / d.f0.d;
          const nw = +(d.f0.w * k).toFixed(3), nd = +(d.f0.d * k).toFixed(3);
          const c = furnToPlan(d.f0, [(nw - d.f0.w) / 2, (nd - d.f0.d) / 2]);
          f.w = nw; f.d = nd; f.h = +(d.f0.h * k).toFixed(3); f.x = +c[0].toFixed(3); f.y = +c[1].toFixed(3);
        } else if (d.which === 'size-w') {
          const nw = Math.max(0.1, Math.round((q[0] + d.f0.w / 2) / grid) * grid);
          const c = furnToPlan(d.f0, [(nw - d.f0.w) / 2, 0]);
          // a kitchen run: the units grow or shrink with it
          if (furnType(f).kind === 'krun') { const base = runUnits(d.f0), sum = base.reduce((s2, u) => s2 + u.w, 0) || 1; f.units = base.map(u => ({ ...u, w: +(u.w * nw / sum).toFixed(3) })); }
          f.w = +nw.toFixed(3); f.x = +c[0].toFixed(3); f.y = +c[1].toFixed(3);
        } else {
          const nd = Math.max(0.1, Math.round((q[1] + d.f0.d / 2) / grid) * grid);
          const c = furnToPlan(d.f0, [0, (nd - d.f0.d) / 2]);
          f.d = +nd.toFixed(3); f.x = +c[0].toFixed(3); f.y = +c[1].toFixed(3);
        }
      }, { project: true, gesture: true, keepInspector: true });
    }
  },
  modeDragEnd() {
    const d = this.drag;
    this.drag = null;
    clearTimeout(this._lp);
    if (d && d.started) this.app.endGesture();
    if (d && d.mode && d.mode.startsWith('furn')) this.app.renderInspector();
    this.drawOverlay();
  },

  /** a tap in Furnish or View mode */
  modeTap(wp, sp, e) {
    const app = this.app, mode = this.spec.mode;
    const target = this.entryAt(wp);
    if (!target) { app.select(null); return; }
    const p = this.local(target, wp);
    // note pins first
    const pinHit = this.pinAt(sp);
    if (pinHit && app.tool !== 'path') { app.selectNote(pinHit.pin.id); return; }
    if (mode === 'view' && app.tool === 'note') { app.addNoteAt({ storey: target.storey.id, x: +p[0].toFixed(3), y: +p[1].toFixed(3) }, false); return; }
    if (mode === 'view' && app.tool === 'path') { app.pathTap(target, p, this.nodeAt(sp, target), e); return; }
    if (mode === 'view' && app.tool === 'measure') {
      const sn = this.snapPoint(target, p);
      if (!this.measure || this.measure.b) this.measure = { a: sn, b: null, offset: target.offset }; else this.measure.b = sn;
      this.drawLabels();
      return;
    }
    // doors swing
    const door = this.doorAt(target, p);
    if (door) { app.doorTapped(door.id, e, '2d'); return; }
    // furniture
    const f = this.furnAt(target, p);
    if (f && (mode === 'furnish' ? target.edit : true)) { app.furnTapped(f.id, e); return; }
    if (mode === 'furnish' && (app.multiSel || e.shiftKey)) return;
    // rooms (details, notes)
    let room = null, area = Infinity;
    for (const r of target.plan.rooms) if (r.storey === target.storey.id && pointInPolygon(p, r.poly)) { const a = roomArea(r); if (a < area) { area = a; room = r; } }
    app.select(room ? { type: 'room', id: room.id, storey: target.storey.id, versionId: target.versionId, readOnly: !target.edit } : null);
  },
  doorAt(en, p) {
    const tol = Math.max(0.12, 8 / this.cam.s);
    for (const op of en.plan.openings) {
      if (op.kind !== 'door') continue;
      const w = en.plan.walls.find(x => x.id === op.wall);
      if (!w || w.storey !== en.storey.id) continue;
      const d = wallDir(w);
      const p0 = V.add(w.a, V.mul(d, op.pos - op.w / 2)), p1 = V.add(w.a, V.mul(d, op.pos + op.w / 2));
      const pr = projectOnSegment(p, p0, p1);
      if (pr.d < Math.max(w.t / 2 + 0.03, tol)) return op;
    }
    return null;
  },
  /** measuring in View mode: snap to wall corners and faces nearby */
  snapPoint(en, p) {
    const tol = 10 / this.cam.s;
    let best = p, bd = tol;
    for (const w of en.plan.walls) {
      if (w.storey !== en.storey.id) continue;
      for (const q of wallPiecePoly(w, 0, wallLen(w), wallLen(w))) { const dd = V.dist(q, p); if (dd < bd) { bd = dd; best = q; } }
    }
    return [...best];
  },
});

/* ───────── snapping a piece against walls and other pieces ─────────
   Each side of the piece looks for a wall face (or a side of another piece) facing it, close by and running along
   it. The best side touches; with alignTurn, the back also turns flat against a wall within 30°. A second side then
   snaps into a corner if one is close. Returns {x, y, rot, marks} or null. */
function snapFurniture(f, plan, storeyId, others, tol, alignTurn) {
  const faces = [];
  // (a car does not put its back against a wall; it lines up with the other cars)
  for (const w of furnType(f).noWall ? [] : plan.walls) {
    if (w.storey !== storeyId) continue;
    const L = wallLen(w);
    if (L < 0.05) continue;
    const d = wallDir(w), n = V.perp(d);
    for (const sg of [1, -1]) {
      const nn = V.mul(n, sg), off = V.mul(nn, w.t / 2);
      faces.push({ a: V.add(w.a, off), b: V.add(w.b, off), n: nn, d, L, wall: true, holes: openingsOf(plan, w.id).filter(o => o.kind !== 'window' || o.sill < 0.3).map(o => [o.pos - o.w / 2, o.pos + o.w / 2]) });
    }
  }
  for (const o of others) {
    if (furnType(o).flat || furnType(o).high) continue;
    const c = furnCorners(o);
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], d = V.norm(V.sub(b, a)), mid = V.lerp(a, b, 0.5);
      let n = V.perp(d);
      if (V.dot(n, V.sub(mid, [o.x, o.y])) < 0) n = V.mul(n, -1);
      faces.push({ a, b, n, d, L: V.dist(a, b), wall: false, holes: [] });
    }
  }
  if (furnType(f).flat) return null;
  const wallPiece = (FURN_WALL_KINDS.has(furnType(f).kind) || !!furnType(f).wall) && !isIsland(f);
  // sides of the piece: local outward normal and half size
  const sides = [{ k: 'back', ln: [0, -1], e: f.d / 2, along: f.w / 2 }, { k: 'front', ln: [0, 1], e: f.d / 2, along: f.w / 2 }, { k: 'left', ln: [-1, 0], e: f.w / 2, along: f.d / 2 }, { k: 'right', ln: [1, 0], e: f.w / 2, along: f.d / 2 }];
  const rotV = (v, deg) => { const a = deg * Math.PI / 180; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; };
  const angOf = v => Math.atan2(v[1], v[0]) * 180 / Math.PI;
  const best = (rot, x, y, skipFace, needPerp) => {
    let out = null;
    for (const sd of sides) {
      const sn = rotV(sd.ln, rot);
      for (const fc of faces) {
        if (fc === skipFace) continue;
        // a sofa, bed or cupboard goes with its back to the wall (its sides can still go into a corner)
        if (wallPiece && fc.wall && !skipFace && sd.k !== 'back') continue;
        if (wallPiece && fc.wall && skipFace && sd.k === 'front') continue;
        if (needPerp && Math.abs(V.dot(fc.n, needPerp)) > 0.2) continue;
        // the side must face the face: its normal against the face's normal
        const dot = -V.dot(sn, fc.n);
        let turn = 0;
        if (dot < 0.999) {
          const diff = ((angOf(V.mul(fc.n, -1)) - angOf(sn) + 540) % 360) - 180;
          // pieces that belong against a wall (sofa, bed, cupboards, kitchen units …) turn their back to it
          const maxTurn = sd.k === 'back' ? (wallPiece && fc.wall ? 180 : 30) : 8;
          if (alignTurn && !skipFace && Math.abs(diff) <= maxTurn) turn = diff; else continue;
        }
        const r2 = rot + turn, sn2 = rotV(sd.ln, r2);
        void sn2;
        // distance from the middle of the piece to the face, along the face's normal
        const dist = V.dot(V.sub([x, y], fc.a), fc.n);
        if (dist < -0.02) continue;
        const delta = sd.e - dist;
        if (Math.abs(delta) > tol) continue;
        // the piece must run along the face (not past its ends, not over a door opening)
        const u = V.dot(V.sub([x, y], fc.a), fc.d);
        const halfAlong = Math.abs(V.dot(rotV(sd.k === 'back' || sd.k === 'front' ? [1, 0] : [0, 1], r2), fc.d)) * sd.along;
        if (u + halfAlong < 0.05 || u - halfAlong > fc.L - 0.05) continue;
        // a wall piece prefers its back against a wall (also when that means turning), other pieces the smallest move
        const backToWall = wallPiece && fc.wall && sd.k === 'back';
        const score = Math.abs(delta) + (backToWall ? -0.05 : Math.abs(turn) * 0.004) + (fc.wall ? 0 : 0.01);
        if (!out || score < out.score) out = { score, delta, turn, fc, sd };
      }
    }
    return out;
  };
  const first = best(f.rot || 0, f.x, f.y, null, null);
  if (!first) return null;
  let rot = (f.rot || 0) + first.turn;
  let x = f.x + first.fc.n[0] * first.delta, y = f.y + first.fc.n[1] * first.delta;
  const marks = [{ a: first.fc.a, b: first.fc.b }];
  // into a corner: a second face square to the first
  const second = best(rot, x, y, first.fc, first.fc.n);
  if (second && second.turn === 0 && Math.abs(V.dot(second.fc.n, first.fc.n)) < 0.2) {
    x += second.fc.n[0] * second.delta; y += second.fc.n[1] * second.delta;
    marks.push({ a: second.fc.a, b: second.fc.b });
  }
  return { x, y, rot, marks };
}
