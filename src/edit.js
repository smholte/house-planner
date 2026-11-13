/* ───────────── edit.js — drawing and editing (session 4): rooms follow the walls, dimension lines you can type into ─────────────

   Rooms follow the walls: before walls change, every room corner that lies on a wall face (or a wall's centre line) is
   anchored to it (roomAnchors); after the change the corner goes to where its faces cross now, or slides with its one
   face (followRooms). Used while dragging walls and wall ends, and when a length, thickness or dimension is typed.
   Settings: settings.roomFollow (default on). */

/** room corners and the wall faces they lie on, for one storey */
function roomAnchors(plan, sid) {
  const walls = plan.walls.filter(w => w.storey === sid && wallLen(w) > 0.02);
  const out = [];
  for (const r of plan.rooms) {
    if (r.storey !== sid) continue;
    r.poly.forEach((v, i) => {
      const att = [];
      for (const w of walls) {
        const d = wallDir(w), n = V.perp(d), L = wallLen(w);
        const along = V.dot(V.sub(v, w.a), d);
        if (along < -w.t / 2 - 0.03 || along > L + w.t / 2 + 0.03) continue;
        const off = V.dot(V.sub(v, w.a), n);
        for (const s of [1, -1]) if (Math.abs(off - s * w.t / 2) < 0.015) att.push({ id: w.id, side: s });
        if (w.t > 0.04 && Math.abs(off) < 0.015) att.push({ id: w.id, side: 0 });
      }
      if (att.length) out.push({ room: r.id, i, att, p0: [...v] });
    });
  }
  return out;
}
function faceLine(w, side) { const d = wallDir(w), n = V.perp(d); return { p: V.add(w.a, V.mul(n, side * w.t / 2)), d }; }
/** where two lines cross (null when about parallel) */
function lineX(l1, l2) {
  const c = V.cross(l1.d, l2.d);
  if (Math.abs(c) < 0.05) return null;
  const t = V.cross(V.sub(l2.p, l1.p), l2.d) / c;
  return V.add(l1.p, V.mul(l1.d, t));
}
/** move the anchored room corners to the walls as they are now → true when a room changed */
function followRooms(plan, anchors) {
  if (!anchors || !anchors.length) return false;
  let moved = false;
  for (const A of anchors) {
    const r = plan.rooms.find(x => x.id === A.room);
    if (!r || !r.poly[A.i]) continue;
    const lines = A.att.map(a => { const w = plan.walls.find(x => x.id === a.id); return w && wallLen(w) > 0.01 ? faceLine(w, a.side) : null; }).filter(Boolean);
    if (!lines.length) continue;
    let p = null;
    for (let i = 0; i < lines.length && !p; i++) for (let j = i + 1; j < lines.length && !p; j++) p = lineX(lines[i], lines[j]);
    if (!p) { const l = lines[0]; p = V.add(l.p, V.mul(l.d, V.dot(V.sub(A.p0, l.p), l.d))); }
    p = [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000];
    if (Math.abs(p[0] - r.poly[A.i][0]) > 1e-5 || Math.abs(p[1] - r.poly[A.i][1]) > 1e-5) { r.poly[A.i] = p; moved = true; }
  }
  return moved;
}
/** change walls with the rooms following (fn changes the plan) */
function withRoomsFollowing(plan, sid, fn) {
  const on = app.settings.roomFollow !== false;
  const anchors = on ? roomAnchors(plan, sid) : null;
  const res = fn(plan);
  if (on) followRooms(plan, anchors);
  return res;
}
/** a new length for a wall: the end with fewer walls attached moves (with the walls attached there) */
function setWallLength(plan, w, len, keep) {
  const L = wallLen(w);
  if (len < 0.02 || Math.abs(len - L) < 1e-6) return;
  const ca = connectedEnds(plan, w.storey, w.a, w.id), cb = connectedEnds(plan, w.storey, w.b, w.id);
  const moveEnd = keep === 'a' ? 'b' : keep === 'b' ? 'a' : (cb.length <= ca.length ? 'b' : 'a');
  const d = wallDir(w);
  if (moveEnd === 'b') {
    const nb = V.add(w.a, V.mul(d, len));
    for (const c of cb) { const o = plan.walls.find(x => x.id === c.wall.id); if (o) o[c.end] = [...nb]; }
    w.b = nb;
  } else {
    const na = V.sub(w.b, V.mul(d, len));
    for (const c of ca) { const o = plan.walls.find(x => x.id === c.wall.id); if (o) o[c.end] = [...na]; }
    // openings keep their place along the wall (measured from the start, which moved)
    for (const op of plan.openings) if (op.wall === w.id) op.pos += len - L;
    w.a = na;
  }
  for (const op of plan.openings) if (op.wall === w.id) { const LL = wallLen(w); op.w = Math.min(op.w, LL); op.pos = clamp(op.pos, op.w / 2, LL - op.w / 2); }
}

/* ───────── dimension lines (maatvoering) ─────────
   A chain along each wall: wall start, the edges of every door, window and opening, wall end; with openings also the
   whole length further out. In Build, tap a number and type a new value: the wall gets longer or shorter (the free end
   moves, rooms follow), an opening gets wider, or the opening next to a gap moves. */
function dimChain(plan, w) {
  const L = wallLen(w);
  const ops = openingsOf(plan, w.id).map(op => ({ op, s: clamp(op.pos - op.w / 2, 0, L), e: clamp(op.pos + op.w / 2, 0, L) })).sort((a, b) => a.s - b.s);
  const segs = [];
  let cur = 0;
  ops.forEach((o, k) => {
    if (o.s - cur > 0.004) segs.push({ s: cur, e: o.s, kind: 'gap', next: o.op.id, prev: k ? ops[k - 1].op.id : null });
    segs.push({ s: o.s, e: o.e, kind: 'op', op: o.op.id });
    cur = o.e;
  });
  if (ops.length && L - cur > 0.004) segs.push({ s: cur, e: L, kind: 'gap', next: null, prev: ops[ops.length - 1].op.id });
  return { L, segs, ops };
}
/** which side of a wall its dimensions go: outside for outer walls, else the wall's left side */
function dimSide(plan, w, bb) {
  if (w.kind === 'exterior' && bb) {
    const c = [bb.minX + bb.w / 2, bb.minY + bb.h / 2], m = V.lerp(w.a, w.b, 0.5);
    return V.dot(V.sub(m, c), V.perp(wallDir(w))) >= 0 ? 1 : -1;
  }
  return 1;
}

Object.assign(PlanView.prototype, {
  /** the dimension lines: the selected wall always, every wall when "Wall lengths" is on */
  drawDimChains(g, en, off) {
    const sel = this.spec.selection, sc = this.cam.s;
    const editable = en.edit !== false && this.spec.editable && this.spec.mode === 'build';
    const all = this.spec.dims && sc > 22;
    const selWall = sel && en.edit !== false ? (sel.type === 'wall' ? sel.id : sel.type === 'opening' ? ((en.plan.openings.find(o => o.id === sel.id) || {}).wall) : null) : null;
    const pts = en.plan.walls.filter(w => w.storey === en.storey.id).flatMap(w => [w.a, w.b]);
    const bb = pts.length ? bboxOfPoints(pts) : null;
    for (const w of en.plan.walls) {
      if (w.storey !== en.storey.id) continue;
      const isSel = w.id === selWall;
      if (!isSel && !(all && w.kind !== 'insulation' && w.leaf !== 'outer')) continue;
      const C = dimChain(en.plan, w);
      if (C.L * sc < 26 && !isSel) continue;
      const side = dimSide(en.plan, w, bb);
      const d = wallDir(w), n = V.mul(V.perp(d), side);
      const at = u => this.toScreen(V.add(V.add(V.add(w.a, V.mul(d, u)), V.mul(n, w.t / 2)), off));
      const nS = V.norm(V.sub(this.toScreen(V.add(V.add(w.a, n), off)), this.toScreen(V.add(w.a, off))));
      const tiers = C.segs.length ? [{ gap: 14, segs: C.segs }, { gap: 30, segs: [{ s: 0, e: C.L, kind: 'len' }] }] : [{ gap: 14, segs: [{ s: 0, e: C.L, kind: 'len' }] }];
      const grp = s('g', { class: 'dimc' + (isSel ? ' sel' : '') });
      for (const tier of tiers) {
        const P = u => V.add(at(u), V.mul(nS, tier.gap));
        const a = P(0), b = P(C.L);
        grp.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'dim-line' }));
        const marks = new Set([0, C.L]);
        for (const sg of tier.segs) { marks.add(sg.s); marks.add(sg.e); }
        for (const u of marks) {
          const q = P(u), base = at(u);
          grp.appendChild(s('line', { x1: base[0] + nS[0] * 3, y1: base[1] + nS[1] * 3, x2: q[0] + nS[0] * 4, y2: q[1] + nS[1] * 4, class: 'dim-ext' }));
          const t1 = V.add(q, V.mul(V.add(nS, V.perp(nS)), 3.2)), t2 = V.sub(q, V.mul(V.add(nS, V.perp(nS)), 3.2));
          grp.appendChild(s('line', { x1: t1[0], y1: t1[1], x2: t2[0], y2: t2[1], class: 'dim-tick' }));
        }
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        for (const sg of tier.segs) {
          const len = sg.e - sg.s;
          const px = len * sc;
          const txt = fmtMM(len);
          if (px < txt.length * 6.2 + 4 && !isSel) continue;
          const m = V.add(P((sg.s + sg.e) / 2), V.mul(nS, 7));
          const target = JSON.stringify({ w: w.id, kind: sg.kind, op: sg.op || null, next: sg.next || null, prev: sg.prev || null, len: +len.toFixed(4) });
          grp.appendChild(s('text', { x: m[0], y: m[1], transform: `rotate(${ang.toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)})`, class: 'dim-label dim-num' + (editable ? ' dim-edit' : '') + (isSel ? ' strong' : '') + (sg.kind === 'op' ? ' dim-op' : ''), 'data-dimv': editable ? target : null }, txt));
        }
      }
      g.appendChild(grp);
    }
  },

  /** type a new value for a dimension */
  editDim(json, sp) {
    let T;
    try { T = JSON.parse(json); } catch (_) { return; }
    this.host.querySelector('.dim-input')?.remove();
    const inp = h('input', { class: 'dim-input', type: 'text', inputmode: 'numeric', value: fmtMM(T.len), 'aria-label': t('New size in mm') });
    inp.style.left = Math.round(sp[0] - 40) + 'px'; inp.style.top = Math.round(sp[1] - 16) + 'px';
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      const v = parseFloat(inp.value.replace(',', '.'));
      inp.remove();
      if (ok && isFinite(v) && v > 0) this.app.applyDim(T, v / 1000);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    inp.addEventListener('blur', () => finish(true));
    this.host.appendChild(inp);
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  },
});

Object.assign(app, {
  /** a typed dimension: wall length, opening width, or the gap before / after an opening */
  applyDim(T, v) {
    const v0 = T.len;
    if (Math.abs(v - v0) < 0.0005) return;
    this.mutate(plan => {
      const w = plan.walls.find(x => x.id === T.w);
      if (!w) return;
      const L = wallLen(w);
      if (T.kind === 'len') { withRoomsFollowing(plan, w.storey, pl => setWallLength(pl, pl.walls.find(x => x.id === T.w), clamp(v, 0.05, 100))); return; }
      if (T.kind === 'op') {
        const op = plan.openings.find(o => o.id === T.op);
        if (!op) return;
        withAssembly(plan, op.id, () => { op.w = clamp(v, 0.1, L); op.pos = clamp(op.pos, op.w / 2, L - op.w / 2); });
        return;
      }
      // a gap: move the opening after it (or, for the last gap, the opening before it)
      const op = plan.openings.find(o => o.id === (T.next || T.prev));
      if (!op) return;
      const delta = (v - v0) * (T.next ? 1 : -1);
      withAssembly(plan, op.id, () => { op.pos = clamp(op.pos + delta, op.w / 2, L - op.w / 2); });
    });
    const after = this.shownVersion().plan;
    const w = after.walls.find(x => x.id === T.w);
    if (w && T.kind === 'len' && Math.abs(wallLen(w) - v) > 0.002) this.toast(t('The wall could not get that long.'));
  },
});

/* ───────── several at once (Build): select, move, delete, copy and paste (also to another storey or version),
   mirror, line up ─────────
   selection = { type: 'multi', items: [{ type: 'wall' | 'room' | 'opening' | 'point' | 'stair', id }] }.
   Shift-click / tap with "Several" on adds or removes; drag on empty space with Shift or "Several" draws a box.
   The clipboard (app.clip) keeps copied walls (with their doors and windows), rooms, electrics and stairs. */
const MULTI_KINDS = ['wall', 'room', 'opening', 'point', 'stair'];
const selItems = sel => !sel ? [] : sel.type === 'multi' ? sel.items : MULTI_KINDS.includes(sel.type) ? [{ type: sel.type, id: sel.id }] : [];
function planItem(plan, it) {
  if (it.type === 'wall') return plan.walls.find(x => x.id === it.id);
  if (it.type === 'room') return plan.rooms.find(x => x.id === it.id);
  if (it.type === 'opening') return plan.openings.find(x => x.id === it.id);
  if (it.type === 'point') return (plan.points || []).find(x => x.id === it.id);
  if (it.type === 'stair') return (plan.stairs || []).find(x => x.id === it.id);
  return null;
}
/** every plan point of a set of items (for the box around them) */
function itemPoints(plan, items) {
  const out = [];
  for (const it of items) {
    const o = planItem(plan, it);
    if (!o) continue;
    if (it.type === 'wall') out.push(o.a, o.b);
    else if (it.type === 'room') out.push(...o.poly);
    else if (it.type === 'point') out.push([o.x, o.y]);
    else if (it.type === 'opening') { const c = openingCenter(plan, o); if (c) out.push(c); }
    else if (it.type === 'stair') out.push(...stairOutline(o));
  }
  return out;
}

Object.assign(app, {
  /** a tap with Shift or "Several": add or remove one thing */
  multiToggle(hit) {
    if (!hit) return;
    const cur = selItems(this.selection);
    const has = cur.some(x => x.type === hit.type && x.id === hit.id);
    const items = has ? cur.filter(x => !(x.type === hit.type && x.id === hit.id)) : [...cur, { type: hit.type, id: hit.id }];
    this.select(items.length > 1 ? { type: 'multi', items } : items.length ? { ...items[0], ...(items[0].type === 'room' ? { storey: this.view.storeyId } : {}) } : null);
  },
  /** everything inside a box drawn on the plan */
  selectBox(a, b, en) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const inside = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const plan = en.plan, sid = en.storey.id, items = [];
    for (const w of plan.walls) if (w.storey === sid && inside(w.a) && inside(w.b)) items.push({ type: 'wall', id: w.id });
    for (const r of plan.rooms) if (r.storey === sid && r.poly.every(inside)) items.push({ type: 'room', id: r.id });
    for (const pt of plan.points || []) if (pt.storey === sid && inside([pt.x, pt.y])) items.push({ type: 'point', id: pt.id });
    for (const st of plan.stairs || []) if (st.storey === sid && stairOutline(st).every(inside)) items.push({ type: 'stair', id: st.id });
    const prev = this.selection && this.selection.type === 'multi' ? this.selection.items : selItems(this.selection);
    const all = [...prev];
    for (const it of items) if (!all.some(x => x.type === it.type && x.id === it.id)) all.push(it);
    this.select(all.length > 1 ? { type: 'multi', items: all } : all.length ? all[0] : null);
    if (!items.length) this.toast(t('Nothing lies completely inside the box.'));
  },

  /** start moving several things: remember where everything was */
  multiDrag(en, p) {
    const plan = en.plan, items = selItems(this.selection);
    const ids = k => new Set(items.filter(x => x.type === k).map(x => x.id));
    const W = ids('wall'), R = ids('room'), P = ids('point'), S = ids('stair');
    const orig = { walls: {}, rooms: {}, points: {}, stairs: {} };
    for (const w of plan.walls) if (W.has(w.id)) orig.walls[w.id] = { a: [...w.a], b: [...w.b] };
    for (const r of plan.rooms) if (R.has(r.id)) orig.rooms[r.id] = r.poly.map(q => [...q]);
    for (const pt of plan.points || []) if (P.has(pt.id)) orig.points[pt.id] = [pt.x, pt.y];
    for (const st of plan.stairs || []) if (S.has(st.id)) orig.stairs[st.id] = [st.x, st.y];
    // walls not selected but touching a moved wall stretch with it
    const attached = [];
    for (const id of W) { const w = plan.walls.find(x => x.id === id); for (const at of attachedEnds(plan, w)) if (!W.has(at.wall.id) && !attached.some(x => x.id === at.wall.id && x.end === at.end)) attached.push({ id: at.wall.id, end: at.end, p0: [...at.wall[at.end]] }); }
    const anchors = this.settings.roomFollow !== false ? roomAnchors(plan, en.storey.id).filter(A => !R.has(A.room)) : null;
    return { kind: 'body', type: 'multi', start: p, orig, attached, rooms: anchors, started: false };
  },
  moveMulti(plan, d, p) {
    const g = this.settings.grid || 0;
    let mv = V.sub(p, d.start);
    if (g) mv = [round(mv[0], g), round(mv[1], g)];
    for (const [id, o] of Object.entries(d.orig.walls)) { const w = plan.walls.find(x => x.id === id); if (w) { w.a = V.add(o.a, mv); w.b = V.add(o.b, mv); } }
    for (const [id, poly] of Object.entries(d.orig.rooms)) { const r = plan.rooms.find(x => x.id === id); if (r) r.poly = poly.map(q => V.add(q, mv)); }
    for (const [id, q] of Object.entries(d.orig.points)) { const pt = plan.points.find(x => x.id === id); if (pt) { pt.x = +(q[0] + mv[0]).toFixed(4); pt.y = +(q[1] + mv[1]).toFixed(4); } }
    for (const [id, q] of Object.entries(d.orig.stairs)) { const st = plan.stairs.find(x => x.id === id); if (st) { st.x = +(q[0] + mv[0]).toFixed(4); st.y = +(q[1] + mv[1]).toFixed(4); } }
    for (const at of d.attached) { const o = plan.walls.find(x => x.id === at.id); if (o) o[at.end] = V.add(at.p0, mv); }
    followRooms(plan, d.rooms);
  },
  nudgeSelection(dx, dy) {
    const items = selItems(this.selection);
    if (!items.length) return;
    const en = { plan: this.shownVersion().plan, storey: this.currentStorey() };
    const d = this.multiDrag(en, [0, 0]);
    this.mutate(plan => this.moveMulti(plan, d, [dx, dy]), { coalesce: 'nudge' });
  },

  /* clipboard */
  copySelection() {
    const plan = this.shownVersion().plan;
    if (this.mode === 'furnish') return this.copyFurniture();
    const items = selItems(this.selection);
    const W = new Set(items.filter(x => x.type === 'wall').map(x => x.id));
    const clip = { kind: 'build', from: { version: this.shownVersion().id, storey: this.view.storeyId }, walls: [], openings: [], rooms: [], points: [], stairs: [] };
    for (const w of plan.walls) if (W.has(w.id)) clip.walls.push(clone(w));
    for (const op of plan.openings) if (W.has(op.wall)) clip.openings.push(clone(op));
    for (const it of items) {
      const o = planItem(plan, it);
      if (!o) continue;
      if (it.type === 'room') clip.rooms.push(clone(o));
      if (it.type === 'point') clip.points.push(clone(o));
      if (it.type === 'stair') clip.stairs.push(clone(o));
    }
    const n = clip.walls.length + clip.rooms.length + clip.points.length + clip.stairs.length;
    if (!n) { this.toast(t('Select walls, rooms, electrics or stairs to copy.')); return false; }
    this.clip = clip;
    this.toast(t('Copied: {w}. Paste with Ctrl+V or the Paste button, also on another storey or version.', { w: clipSummary(clip) }));
    return true;
  },
  pasteClipboard() {
    if (this.mode === 'furnish') return this.pasteFurniture();
    const c = this.clip;
    if (!c || c.kind !== 'build') { this.toast(t('Nothing copied yet.')); return; }
    const st = this.currentStorey();
    if (!st || this.view.scope !== 'storey') { this.toast(t('Pick a storey to paste on.')); return; }
    const same = c.from.version === this.shownVersion().id && c.from.storey === st.id;
    const off = same ? [0.5, 0.5] : [0, 0];
    const map = new Map(), out = [];
    const ok = this.mutate(plan => {
      for (const w of c.walls) { const id = uid('w_'); map.set(w.id, id); plan.walls.push({ ...clone(w), id, storey: st.id, a: V.add(w.a, off), b: V.add(w.b, off) }); out.push({ type: 'wall', id }); }
      // openings get new ids; one linked to another (the layers of an outside wall) stays linked to its copy
      const opMap = new Map(c.openings.map(op => [op.id, uid('o_')]));
      for (const op of c.openings) { const o = { ...clone(op), id: opMap.get(op.id), wall: map.get(op.wall) }; if (o.link) { if (opMap.has(o.link)) o.link = opMap.get(o.link); else delete o.link; } plan.openings.push(o); }
      for (const r of c.rooms) { const id = uid('r_'); plan.rooms.push({ ...clone(r), id, storey: st.id, poly: r.poly.map(q => V.add(q, off)) }); out.push({ type: 'room', id }); }
      for (const pt of c.points) { const id = uid('pt_'); (plan.points = plan.points || []).push({ ...clone(pt), id, storey: st.id, x: +(pt.x + off[0]).toFixed(4), y: +(pt.y + off[1]).toFixed(4), wall: map.get(pt.wall) || pt.wall }); out.push({ type: 'point', id }); }
      for (const s2 of c.stairs) { const id = uid('sr_'); (plan.stairs = plan.stairs || []).push({ ...clone(s2), id, storey: st.id, x: +(s2.x + off[0]).toFixed(4), y: +(s2.y + off[1]).toFixed(4) }); out.push({ type: 'stair', id }); }
      // a wall's own finish belongs to a room: kept for the rooms that came along
      const roomMap = new Map(c.rooms.map((r, i) => [r.id, out.filter(o => o.type === 'room')[i].id]));
      for (const w of plan.walls) {
        if (![...map.values()].includes(w.id) || !w.fin) continue;
        const fin = {};
        for (const [k, v] of Object.entries(w.fin)) if (roomMap.has(k)) fin[roomMap.get(k)] = v;
        if (Object.keys(fin).length) w.fin = fin; else delete w.fin;
      }
    });
    if (!ok) return;
    this.select(out.length > 1 ? { type: 'multi', items: out } : out[0] || null);
    this.toast(t('Pasted on {s}: {w}.', { s: st.name, w: clipSummary(c) }));
  },
  duplicateSelection() { if (this.copySelection()) this.pasteClipboard(); },

  /** mirror the selection about the middle of its box: 'x' = left ↔ right, 'y' = front ↔ back */
  mirrorSelection(axis) {
    if (this.mode === 'furnish') return this.mirrorFurniture(axis);
    const plan0 = this.shownVersion().plan, items = selItems(this.selection);
    const bb = bboxOfPoints(itemPoints(plan0, items));
    if (!bb) return;
    const c = axis === 'x' ? bb.minX + bb.w / 2 : bb.minY + bb.h / 2;
    const M = q => axis === 'x' ? [+(2 * c - q[0]).toFixed(4), q[1]] : [q[0], +(2 * c - q[1]).toFixed(4)];
    const ids = k => new Set(items.filter(x => x.type === k).map(x => x.id));
    const W = ids('wall'), R = ids('room'), P = ids('point'), S = ids('stair');
    this.mutate(plan => {
      for (const w of plan.walls) if (W.has(w.id)) { w.a = M(w.a); w.b = M(w.b); }
      // mirroring turns left into right: doors open to the other side
      for (const op of plan.openings) if (W.has(op.wall)) op.swing = op.swing === 'right' ? 'left' : 'right';
      for (const r of plan.rooms) if (R.has(r.id)) r.poly = r.poly.map(M).reverse();
      for (const pt of plan.points || []) if (P.has(pt.id)) { const q = M([pt.x, pt.y]); pt.x = q[0]; pt.y = q[1]; if (pt.rot != null) pt.rot = axis === 'x' ? 180 - pt.rot : -pt.rot; if (pt.side) pt.side = -pt.side; }
      for (const s2 of plan.stairs || []) if (S.has(s2.id)) mirrorStair(s2, axis, c);
    });
  },
  /** walls parallel to the first selected wall are moved onto its line (attached walls stretch, rooms follow) */
  lineUpWalls() {
    const plan0 = this.shownVersion().plan, items = selItems(this.selection).filter(x => x.type === 'wall');
    const first = items.length && planItem(plan0, items[0]);
    if (!first) return;
    const d = wallDir(first), n = V.perp(d);
    let moved = 0;
    this.mutate(plan => withRoomsFollowing(plan, first.storey, pl => {
      for (const it of items.slice(1)) {
        const w = pl.walls.find(x => x.id === it.id);
        if (!w || Math.abs(V.cross(wallDir(w), d)) > 0.02) continue;
        const off = V.dot(V.sub(first.a, w.a), n);
        if (Math.abs(off) < 0.0005) continue;
        const mv = V.mul(n, off);
        const att = attachedEnds(pl, w).filter(x => !items.some(i => i.id === x.wall.id));
        w.a = V.add(w.a, mv); w.b = V.add(w.b, mv);
        for (const at of att) at.wall[at.end] = V.add(at.wall[at.end], mv);
        moved++;
      }
    }));
    this.toast(moved ? t('{n} walls lined up.', { n: moved }) : t('No parallel walls to line up.'));
  },
  /** the same height for all selected wall things (sockets, switches …) as the first one */
  sameHeight() {
    const plan0 = this.shownVersion().plan;
    const pts = selItems(this.selection).filter(x => x.type === 'point').map(x => planItem(plan0, x)).filter(pt => pt && ptKind(pt).wall);
    if (pts.length < 2) return;
    const hh = pts[0].h ?? ptKind(pts[0]).h;
    this.mutate(plan => { for (const pt of plan.points) if (pts.some(x => x.id === pt.id)) pt.h = hh; });
    this.toast(t('{n} at {h} mm.', { n: pts.length, h: fmtMM(hh) }));
  },

  /** the details of several things */
  multiPanel(el, sel) {
    const plan = this.shownVersion().plan;
    const items = sel.items.filter(it => planItem(plan, it));
    const ro = !this.canEdit() || this.mode !== 'build';
    const count = k => items.filter(x => x.type === k).length;
    const parts = [[count('wall'), 'walls'], [count('room'), 'rooms'], [count('opening'), 'doors and windows'], [count('point'), 'electrics'], [count('stair'), 'stairs']].filter(x => x[0]).map(([n, k]) => `${n} ${t(k)}`);
    this.inspHead(el, t('{n} selected', { n: items.length }), parts.join(' · '));
    const list = h('div', { class: 'room-list' });
    for (const it of items) {
      const o = planItem(plan, it);
      const label = it.type === 'wall' ? `${t('Wall')} ${fmtMM(wallLen(o))} mm` : it.type === 'room' ? o.name : it.type === 'point' ? ptName(o) : it.type === 'stair' ? t('Stair') : t({ door: 'Door', window: 'Window', opening: 'Opening' }[o.kind] || 'Opening') + ' ' + fmtMM(o.w);
      list.appendChild(h('div', { class: 'room-row multi-row' }, h('span', { class: 'sw ms-' + it.type }), h('button', { class: 'linklike', onclick: () => this.select(it.type === 'room' ? { ...it, storey: o.storey } : it) }, label),
        h('button', { class: 'btn ghost icon sm', 'aria-label': t('Take out of the selection'), onclick: () => this.multiToggle(it) }, icon('close'))));
    }
    el.appendChild(h('div', { class: 'insp-sec' }, list));
    const parallel = items.filter(x => x.type === 'wall').length >= 2;
    const wallPts = items.filter(x => x.type === 'point').length >= 2;
    el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions multi-actions' },
      h('button', { class: 'btn sm', id: 'ms-copy', onclick: () => this.copySelection() }, icon('copy'), t('Copy')),
      ro ? null : h('button', { class: 'btn sm', id: 'ms-paste', disabled: !this.clip || this.clip.kind !== 'build', onclick: () => this.pasteClipboard() }, icon('dup'), t('Paste')),
      ro ? null : h('button', { class: 'btn sm', id: 'ms-mirror-x', onclick: () => this.mirrorSelection('x') }, icon('flip'), t('Mirror ↔')),
      ro ? null : h('button', { class: 'btn sm', id: 'ms-mirror-y', onclick: () => this.mirrorSelection('y') }, h('span', { class: 'rot90' }, icon('flip')), t('Mirror ↕')),
      !ro && parallel ? h('button', { class: 'btn sm', id: 'ms-lineup', onclick: () => this.lineUpWalls() }, icon('ruler'), t('Line up walls')) : null,
      !ro && wallPts ? h('button', { class: 'btn sm', id: 'ms-height', onclick: () => this.sameHeight() }, icon('socket'), t('Same height')) : null,
      ro ? null : h('button', { class: 'btn sm danger', id: 'ms-delete', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete all'))),
      h('p', { class: 'note-muted' }, t('Drag one of them to move them all (walls attached to them stretch, rooms follow). Shift-click, or “Several”, adds or removes one; drag from a spot that is not selected to add everything in a box. Ctrl+C / Ctrl+V copy and paste, also on another storey or version.'))));
  },
  /** "Several" in Build: taps add or remove, drags on empty space draw a box */
  multiBuildChip() {
    return h('button', { class: 'btn sm' + (this.multiBuild ? ' primary' : ''), id: 'btn-several', 'aria-pressed': String(!!this.multiBuild), onclick: () => { this.multiBuild = !this.multiBuild; this.renderInspector(); this.renderStageOverlays(); } }, icon('group'), t('Several'));
  },
});
function clipSummary(c) {
  return [[c.walls.length, 'walls'], [c.rooms.length, 'rooms'], [c.points.length, 'electrics'], [c.stairs.length, 'stairs']].filter(x => x[0]).map(([n, k]) => `${n} ${t(k)}`).join(', ');
}

/* ───────── furniture: copy and paste (also to another storey or layout), mirror, align, spread ───────── */
Object.assign(app, {
  copyFurniture() {
    const sel = this.selection;
    const items = sel && sel.type === 'furn' ? this.furnItems(sel.ids) : [];
    if (!items.length) { this.toast(t('Select the pieces to copy first.')); return false; }
    this.clip = { kind: 'furn', from: { layout: this.activeLayout().id, storey: items[0].storey }, items: items.map(f => clone(f)) };
    this.toast(t('{n} pieces copied. Paste with Ctrl+V, also in another layout or on another storey.', { n: items.length }));
    return true;
  },
  pasteFurniture() {
    const c = this.clip;
    if (!c || c.kind !== 'furn') { this.toast(t('Nothing copied yet.')); return; }
    const st = this.currentStorey();
    const lay = this.activeLayout();
    if (!st || !lay) return;
    const same = c.from.layout === lay.id && c.from.storey === st.id;
    const off = same ? 0.3 : 0;
    const made = c.items.map(f => ({ ...clone(f), id: uid('f_'), storey: st.id, x: +(f.x + off).toFixed(3), y: +(f.y + off).toFixed(3), shop: { ...(f.shop || {}) } }));
    if (!this.furnMutate(l => { l.items.push(...made); })) return;
    this.select({ type: 'furn', ids: made.map(f => f.id) });
    this.toast(t('{n} pieces pasted in “{l}” on {s}.', { n: made.length, l: lay.name, s: st.name }));
  },
  /** mirror pieces about the middle of the selection: positions and the way they face */
  mirrorFurniture(axis) {
    const sel = this.selection;
    const items = sel && sel.type === 'furn' ? this.furnItems(sel.ids) : [];
    if (!items.length) return;
    const bb = bboxOfPoints(items.flatMap(f => furnCorners(f)));
    const c = axis === 'x' ? bb.minX + bb.w / 2 : bb.minY + bb.h / 2;
    this.furnMutate(() => {
      for (const f of items) {
        // a mirror image: the place, the way it faces, and the piece itself the other way round (corner sofa …)
        if (axis === 'x') { f.x = +(2 * c - f.x).toFixed(3); f.rot = ((360 - (f.rot || 0)) % 360 + 360) % 360; }
        else { f.y = +(2 * c - f.y).toFixed(3); f.rot = ((180 - (f.rot || 0)) % 360 + 360) % 360; }
        f.flip = !f.flip || undefined;
      }
    });
  },
  /** line pieces up on their boxes: left, centre, right, top (back), middle, bottom (front) */
  alignFurniture(how) {
    const sel = this.selection;
    const items = sel && sel.type === 'furn' ? this.furnItems(sel.ids) : [];
    if (items.length < 2) return;
    const boxes = items.map(f => ({ f, b: bboxOfPoints(furnCorners(f)) }));
    const ref = boxes[0].b;
    const target = { left: ref.minX, right: ref.maxX, centre: ref.minX + ref.w / 2, top: ref.minY, bottom: ref.maxY, middle: ref.minY + ref.h / 2 }[how];
    this.furnMutate(() => {
      for (const { f, b } of boxes.slice(1)) {
        if (how === 'left') f.x += target - b.minX; else if (how === 'right') f.x += target - b.maxX; else if (how === 'centre') f.x += target - (b.minX + b.w / 2);
        else if (how === 'top') f.y += target - b.minY; else if (how === 'bottom') f.y += target - b.maxY; else if (how === 'middle') f.y += target - (b.minY + b.h / 2);
        f.x = +f.x.toFixed(3); f.y = +f.y.toFixed(3);
      }
    });
  },
  /** equal space between three or more pieces, left to right or back to front */
  spreadFurniture(axis) {
    const sel = this.selection;
    const items = sel && sel.type === 'furn' ? this.furnItems(sel.ids) : [];
    if (items.length < 3) return;
    const k = axis === 'x' ? 0 : 1;
    const boxes = items.map(f => ({ f, b: bboxOfPoints(furnCorners(f)) })).sort((p, q) => (k ? p.b.minY - q.b.minY : p.b.minX - q.b.minX));
    const lo = k ? boxes[0].b.minY : boxes[0].b.minX, hi = k ? boxes[boxes.length - 1].b.maxY : boxes[boxes.length - 1].b.maxX;
    const sizes = boxes.map(x => k ? x.b.h : x.b.w);
    const gap = (hi - lo - sizes.reduce((a, v) => a + v, 0)) / (boxes.length - 1);
    this.furnMutate(() => {
      let cur = lo;
      boxes.forEach((x, i) => {
        const start = k ? x.b.minY : x.b.minX;
        if (k) x.f.y = +(x.f.y + cur - start).toFixed(3); else x.f.x = +(x.f.x + cur - start).toFixed(3);
        cur += sizes[i] + gap;
      });
    });
  },
  /** the furniture buttons for one or several pieces */
  furnEditButtons(ids) {
    const many = ids.length > 1;
    const row = [
      h('button', { class: 'btn sm', id: 'fe-copy', onclick: () => this.copyFurniture() }, icon('copy'), t('Copy')),
      this.clip && this.clip.kind === 'furn' ? h('button', { class: 'btn sm', id: 'fe-paste', onclick: () => this.pasteFurniture() }, icon('dup'), t('Paste')) : null,
      h('button', { class: 'btn sm', id: 'fe-mirror-x', onclick: () => this.mirrorFurniture('x') }, icon('flip'), t('Mirror ↔')),
      h('button', { class: 'btn sm', id: 'fe-mirror-y', onclick: () => this.mirrorFurniture('y') }, h('span', { class: 'rot90' }, icon('flip')), t('Mirror ↕')),
    ];
    const box = h('div', { class: 'insp-sec' }, h('div', { class: 'actions' }, ...row));
    if (many) {
      box.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Line up with the first piece')),
        h('div', { class: 'seg wrap align-seg' }, ...[['left', 'Left'], ['centre', 'Centre'], ['right', 'Right'], ['top', 'Back'], ['middle', 'Middle'], ['bottom', 'Front']].map(([k, lab]) => h('button', { 'data-k': k, onclick: () => this.alignFurniture(k) }, t(lab))))));
      if (ids.length > 2) box.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm', id: 'fe-spread-x', onclick: () => this.spreadFurniture('x') }, t('Spread left to right')),
        h('button', { class: 'btn sm', id: 'fe-spread-y', onclick: () => this.spreadFurniture('y') }, t('Spread back to front'))));
    }
    return box;
  },
});

Object.assign(PlanView.prototype, {
  /** several things selected: an outline around each */
  drawMultiOverlay(g, en, sel) {
    const off = en.offset || [0, 0];
    const S = q => this.toScreen([q[0] + off[0], q[1] + off[1]]);
    for (const it of sel.items) {
      const o = planItem(en.plan, it);
      if (!o) continue;
      let pts = null;
      if (it.type === 'wall') pts = wallPiecePoly(o, 0, wallLen(o), wallLen(o));
      else if (it.type === 'room') pts = o.poly;
      else if (it.type === 'stair') pts = stairOutline(o);
      else if (it.type === 'opening') { const w = en.plan.walls.find(x => x.id === o.wall); if (w) pts = wallPiecePoly(w, o.pos - o.w / 2, o.pos + o.w / 2, wallLen(w)).map(q => q); }
      if (pts) g.appendChild(s('polygon', { points: pts.map(S).map(q => q.join(',')).join(' '), class: 'multi-sel multi-' + it.type }));
      else if (it.type === 'point') { const q = S([o.x, o.y]); g.appendChild(s('circle', { cx: q[0], cy: q[1], r: 12, class: 'multi-sel' })); }
    }
  },
});
