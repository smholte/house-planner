/* ───────────── wallviews.js — wall views per room (wandaanzichten) ─────────────
   Every wall of a room drawn flat, as you see it standing in the room: its length and height (up to the ceiling,
   under a sloped roof), doors and windows with their sizes and positions, the tiles laid out with the joints and
   where the cut tiles fall (from the start chosen per wall – centred, whole rows from the floor unless chosen –
   with the narrowest cut at each place and slivers marked, task 0036), the sockets, switches,
   water points and other things on it at their height and distance from the left corner, the kitchen units
   standing against it (the kitchen builder's front view), and the dimensions. Room details → Walls → "Wall views";
   one tap makes a PDF with a page per wall for the tiler, the electrician and the kitchen supplier. */

/** standing in the room looking at face f: the wall's u (metres from its start) → x in the view (0 = left corner) */
function faceFrame(f) {
  const w = f.wall, d = wallDir(w), n = V.perp(d);
  const F = V.mul(n, -f.side);          // the way you look
  const R = [-F[1], F[0]];              // your right hand (plan y runs down the screen)
  const sgn = V.dot(d, R) >= 0 ? 1 : -1;
  const L = f.u1 - f.u0;
  const ex = u => (sgn > 0 ? u - f.u0 : f.u1 - u);
  const uOf = p => V.dot(V.sub(p, w.a), d);
  return { L, ex, sgn, d, n, uOf, faceOff: f.side * w.t / 2 };
}

/** how the tiles fall on a wall L wide up to height top: centred, whole rows from the floor */
function tileFall(T, L, top) {
  const j = T.joint || 0, M = T.w + j, MH = T.h + j;
  let k = Math.max(0, Math.floor((L + j) / M));
  let side = (L - (k * M - j)) / 2;                       // what is left at each end (joint included)
  // a sliver at the ends is hard to cut and looks poor: one tile less, two bigger cuts
  if (k > 0 && side - j > 0.001 && side - j < T.w / 3) { k -= 1; side += M / 2; }
  const cut = Math.max(0, side - j);
  const rows = Math.max(0, Math.floor((top + j) / MH));
  const topCut = Math.max(0, top - rows * MH);
  return { k, side, cut, rows, topCut: topCut > 0.002 ? topCut : 0, M, MH, j };
}

/** everything on one wall of a room → plain data in the view's own coordinates (x from the left corner, y up) */
function wallViewData(app0, plan, f, st, items, S) {
  const fr = faceFrame(f), w = f.wall, H = wallHeight(w, st), ch = roomCeilH(f.room, st);
  const L = fr.L, N = Math.max(2, Math.ceil(L / 0.1));
  const top = [];
  for (let i = 0; i <= N; i++) { const u = f.u0 + L * i / N; top.push([fr.ex(u), Math.min(wallTopAt(w, u, H), ch)]); }
  top.sort((a, b) => a[0] - b[0]);
  const maxH = Math.max(...top.map(q => q[1]));
  const fin = faceFinish(w, f.room);
  const ops = faceOpenings(plan, f).map(op => {
    const a = fr.ex(Math.max(op.pos - op.w / 2, f.u0)), b = fr.ex(Math.min(op.pos + op.w / 2, f.u1));
    const y0 = op.kind === 'window' ? (op.sill || 0) : 0;
    return { kind: op.kind, x0: Math.min(a, b), x1: Math.max(a, b), y0, y1: y0 + op.h, w: op.w, h: op.h, sill: y0 };
  }).sort((a, b) => a.x0 - b.x0);
  // the tiles
  let tiles = null;
  if (fin.tiles) {
    const T = fin.tiles, tt = T.to > 0 ? Math.min(T.to, maxH) : maxH;
    tiles = { T, top: tt, fall: tileFall(T, L, tt), lay: faceTileLayout(plan, f, st, S, fin) };
  }
  // things on this side of the wall (sockets, switches …) and units standing against it
  const pts = [];
  for (const pt of plan.points || []) {
    if (pt.storey !== f.room.storey) continue;
    const K = ptKind(pt);
    if (K.wall) {
      if (pt.wall !== w.id || (pt.side != null && pt.side !== f.side)) continue;
      const u = fr.uOf([pt.x, pt.y]);
      if (u < f.u0 - 0.02 || u > f.u1 + 0.02) continue;
      pts.push({ pt, x: fr.ex(clamp(u, f.u0, f.u1)), y: ptHeight(pt, plan, st), name: ptName(pt) });
    } else if (K.unit) {
      const off = V.dot(V.sub([pt.x, pt.y], w.a), fr.n);
      const [uw, ud, uh] = unitSize(pt);
      if (Math.abs(off - fr.faceOff) > ud / 2 + 0.06 && Math.abs(off - fr.faceOff) > uw / 2 + 0.06) continue;
      if (Math.sign(off - fr.faceOff * 0.5) !== Math.sign(f.side)) continue;
      const u = fr.uOf([pt.x, pt.y]);
      if (u < f.u0 || u > f.u1) continue;
      const a = (pt.rot || 0) * Math.PI / 180, wDir = [Math.cos(a), Math.sin(a)];
      const across = Math.abs(V.dot(wDir, fr.d)) > 0.7 ? uw : ud;    // its width along the wall
      pts.push({ pt, unit: true, x: fr.ex(u), y: ptHeight(pt, plan, st), w: across, hh: uh, name: ptName(pt) });
    }
  }
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  // kitchen runs with their back against this wall
  const runs = [];
  for (const it of items || []) {
    if (it.storey !== f.room.storey || it.type !== 'krun') continue;
    const cs = furnCorners(it);
    let hit = false;
    for (let i = 0; i < 4; i++) {
      const p = cs[i], q = cs[(i + 1) % 4], e = V.sub(q, p), el = V.len(e);
      // only its back (a long side) against the wall, not an end of a run that stands against another wall
      if (Math.abs(el - it.w) > 0.02 || Math.abs(V.cross(e, fr.d)) / el > 0.05) continue;
      const o1 = V.dot(V.sub(p, w.a), fr.n) - fr.faceOff, o2 = V.dot(V.sub(q, w.a), fr.n) - fr.faceOff;
      if (Math.abs(o1) < 0.06 && Math.abs(o2) < 0.06) { const ua = fr.uOf(p), ub = fr.uOf(q); if (Math.min(ua, ub) < f.u1 - 0.05 && Math.max(ua, ub) > f.u0 + 0.05) hit = true; }
    }
    if (!hit) continue;
    const xc = fr.ex(fr.uOf([it.x, it.y])), xr = fr.ex(fr.uOf(furnToPlan(it, [it.w / 2, 0])));
    runs.push({ it, xc, flip: xr < xc, x0: xc - it.w / 2, x1: xc + it.w / 2 });
  }
  return { f, L, maxH, ch, top, ops, tiles, pts, runs, fin, letter: f.letter, fixtures: wallFixtures(f, items, st) };
}

/** the bath, shower and washbasins standing against a wall face: where they are along it and how high the bath is */
function wallFixtures(f, items, st) {
  const fr = faceFrame(f), w = f.wall, out = [];
  for (const it of items || []) {
    if (it.storey !== f.room.storey) continue;
    const kind = furnType(it).kind;
    if (kind !== 'bath' && kind !== 'shower' && kind !== 'vanity') continue;
    const cs = furnCorners(it);
    let near = false;
    for (let i = 0; i < 4; i++) {
      const p = cs[i], q = cs[(i + 1) % 4], e = V.sub(q, p), el = V.len(e);
      if (el < 0.05 || Math.abs(V.cross(e, fr.d)) / el > 0.05) continue;
      const o1 = V.dot(V.sub(p, w.a), fr.n) - fr.faceOff, o2 = V.dot(V.sub(q, w.a), fr.n) - fr.faceOff;
      if (Math.abs(o1) < 0.12 && Math.abs(o2) < 0.12) near = true;
    }
    const u = fr.uOf([it.x, it.y]);
    if (!near || u < f.u0 || u > f.u1) continue;
    const top = kind === 'bath' ? furnZ(it, roomCeilH(f.room, st)) + (it.h || 0) : 0;
    out.push({ it, kind, name: furnName(it), xc: fr.ex(u), top });
  }
  return out.sort((a, b) => a.xc - b.xc);
}

/** the view as an SVG in metres (y up = negative) */
function wallViewSvg(D, opts = {}) {
  const { L, maxH } = D, pad = 0.35, fs = opts.fs || 0.075;
  const vb = [-pad, -(maxH + 0.42), L + 2 * pad, maxH + 0.42 + 0.62];
  const svg = s('svg', { class: 'wv', viewBox: vb.map(v => +v.toFixed(3)).join(' '), role: 'img', 'aria-label': t('Wall {l}', { l: D.letter }) });
  const Y = v => +(-v).toFixed(4), X = v => +v.toFixed(4);
  const txt = (x, y, str, cls = '', anchor = 'middle', size = fs) => svg.appendChild(s('text', { x: X(x), y: Y(y), class: 'wv-t ' + cls, 'text-anchor': anchor, 'font-size': size }, str));
  // the wall: up to the ceiling or under the slope
  const outline = [[0, 0], ...D.top, [L, 0]];
  const wallPath = 'M' + outline.map(([x, y]) => X(x) + ' ' + Y(y)).join('L') + 'Z';
  svg.appendChild(s('path', { d: wallPath, class: 'wv-wall' }));
  // the tiles (behind the openings)
  if (D.tiles) {
    const { T, top } = D.tiles, clipId = 'wvc-' + D.letter + '-' + Math.round(Math.random() * 1e6);
    const cp = s('clipPath', { id: clipId }); cp.appendChild(s('path', { d: wallPath })); svg.appendChild(cp);
    const g = s('g', { 'clip-path': `url(#${clipId})` });
    g.appendChild(s('rect', { x: 0, y: Y(top), width: X(L), height: X(top), class: 'wv-grout', fill: T.grout || '#C9C4BA' }));
    // the pieces of the grid from the wall's start: cut pieces lighter, slivers (under a third of a tile) marked
    for (const P of D.tiles.lay.count.pieces) {
      const sl = P.cut && ((P.x1 - P.x0) < T.w * SLIVER - 1e-6 || (P.y1 - P.y0) < T.h * SLIVER - 1e-6);
      g.appendChild(s('rect', { x: X(P.x0), y: Y(P.y1), width: X(P.x1 - P.x0), height: X(P.y1 - P.y0), class: 'wv-tile' + (P.cut ? ' cut' : '') + (sl ? ' sliver' : ''), fill: T.color || '#E9E6DF' }));
    }
    svg.appendChild(g);
    svg.appendChild(s('line', { x1: 0, y1: Y(top), x2: X(L), y2: Y(top), class: 'wv-tiletop' }));
  }
  // doors, windows and openings
  for (const o of D.ops) {
    svg.appendChild(s('rect', { x: X(o.x0), y: Y(Math.min(o.y1, maxH)), width: X(o.x1 - o.x0), height: X(Math.min(o.y1, maxH) - o.y0), class: 'wv-op wv-' + o.kind }));
    if (o.kind === 'door') svg.appendChild(s('path', { d: `M${X(o.x0)} ${Y(0)}L${X((o.x0 + o.x1) / 2)} ${Y(Math.min(o.y1, maxH))}L${X(o.x1)} ${Y(0)}`, class: 'wv-door-mark' }));
    txt((o.x0 + o.x1) / 2, (o.y0 + Math.min(o.y1, maxH)) / 2, `${fmtMM(o.w)} × ${fmtMM(o.h)}`, 'wv-small');
    if (o.kind === 'window' && o.sill > 0) txt((o.x0 + o.x1) / 2, o.sill / 2, t('sill {h}', { h: fmtMM(o.sill) }), 'wv-small');
  }
  // the kitchen against this wall: the builder's front view, in place
  for (const R of D.runs) {
    const el = runElevation(R.it, 'front', D.ch, -1, null);
    const g = s('g', { class: 'wv-kitchen kit-elev', transform: `translate(${X(R.xc)} 0) scale(${R.flip ? -1 : 1} 1)` });
    for (const c of [...el.childNodes]) if (!(c.classList && (c.classList.contains('ke-floor') || c.classList.contains('ke-ceil')))) g.appendChild(c);
    for (const n of g.querySelectorAll('.ke-n, .ke-hit')) n.remove();
    svg.appendChild(g);
  }
  // the ceiling, the floor
  svg.appendChild(s('line', { x1: X(-0.15), y1: 0, x2: X(L + 0.15), y2: 0, class: 'wv-floor' }));
  if (D.ch < maxH + 0.001) svg.appendChild(s('line', { x1: X(-0.08), y1: Y(D.ch), x2: X(L + 0.08), y2: Y(D.ch), class: 'wv-ceil' }));
  // the things on the wall, with their height
  for (const P of D.pts) {
    const K = ptKind(P.pt), cls = 'wv-pt pt-' + K.color;
    if (P.unit) {
      svg.appendChild(s('rect', { x: X(P.x - P.w / 2), y: Y(P.y + P.hh), width: X(P.w), height: X(P.hh), class: cls + ' wv-unit' }));
      txt(P.x, P.y + P.hh / 2, unitSpec(P.pt).tag, 'wv-small');
    } else {
      svg.appendChild(s('rect', { x: X(P.x - 0.04), y: Y(P.y + 0.04), width: 0.08, height: 0.08, rx: 0.012, class: cls }));
      txt(P.x, P.y + 0.065, fmtMM(P.y), 'wv-h', 'middle', fs * 0.82);
    }
  }
  // dimensions: the whole wall, and where the openings are, along the bottom; the height on the left
  const dimY = -0.22;
  const stops = [0, ...D.ops.flatMap(o => [o.x0, o.x1]), L].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.005);
  const dim = (x0, x1, y, label) => {
    svg.appendChild(s('line', { x1: X(x0), y1: Y(y), x2: X(x1), y2: Y(y), class: 'wv-dim' }));
    for (const x of [x0, x1]) svg.appendChild(s('line', { x1: X(x - 0.025), y1: Y(y - 0.025), x2: X(x + 0.025), y2: Y(y + 0.025), class: 'wv-dim' }));
    txt((x0 + x1) / 2, y + 0.025, label, 'wv-dimt', 'middle', fs * 0.85);
  };
  if (stops.length > 2) for (let i = 1; i < stops.length; i++) dim(stops[i - 1], stops[i], dimY, fmtMM(stops[i] - stops[i - 1]));
  dim(0, L, stops.length > 2 ? dimY - 0.2 : dimY, fmtMM(L));
  svg.appendChild(s('line', { x1: X(-0.2), y1: 0, x2: X(-0.2), y2: Y(maxH), class: 'wv-dim' }));
  txt(-0.24, maxH / 2, fmtMM(Math.min(maxH, D.ch)), 'wv-dimt wv-vert', 'middle', fs * 0.85).setAttribute('transform', `rotate(-90 ${X(-0.24)} ${Y(maxH / 2)})`);
  // how high the tiles go: a measure on the right (the cuts are written under the view)
  if (D.tiles) {
    const xr = L + 0.16, top = D.tiles.top;
    svg.appendChild(s('line', { x1: X(xr), y1: 0, x2: X(xr), y2: Y(top), class: 'wv-dim' }));
    for (const y of [0, top]) svg.appendChild(s('line', { x1: X(xr - 0.025), y1: Y(y - 0.025), x2: X(xr + 0.025), y2: Y(y + 0.025), class: 'wv-dim' }));
    txt(xr + 0.05, top / 2, fmtMM(top), 'wv-dimt wv-vert wv-tilenote', 'middle', fs * 0.85).setAttribute('transform', `rotate(-90 ${X(xr + 0.05)} ${Y(top / 2)})`);
    // the cut at each corner, just above the tiles
    const cuts = D.tiles.lay.cuts, yl = Math.min(top + 0.05, maxH + 0.12);
    for (const k of ['left', 'right']) {
      const c = cuts.find(x => x.k === k);
      if (c) txt(k === 'left' ? 0.02 : L - 0.02, yl, fmtMM(c.c), 'wv-cutt' + (c.sliver ? ' warn' : ''), k === 'left' ? 'start' : 'end', fs * 0.8);
    }
  }
  txt(-pad + 0.04, maxH + 0.3, t('Wall {l}', { l: D.letter }) + '  ·  ' + fmtMM(L) + ' mm', 'wv-title', 'start', fs * 1.25);
  return svg;
}

/** for the tiler: how high, where cut (the narrowest cut at each place) */
function wallViewTileNote(D) {
  if (!D.tiles) return '';
  const lay = D.tiles.lay, notes = [t('tiles to {h} mm', { h: fmtMM(D.tiles.top) })];
  const cl = lay.cuts.filter(c => c.k === 'left').reduce((m, c) => Math.min(m, c.c), Infinity), cr = lay.cuts.filter(c => c.k === 'right').reduce((m, c) => Math.min(m, c.c), Infinity);
  let list = cutsSummary(lay.cuts);
  if (isFinite(cl) && Math.abs(cl - cr) < 0.0005) { notes.push(t('cut at both ends: {c} mm', { c: fmtMM(cl) })); list = list.filter(x => x.place !== t('left corner') && x.place !== t('right corner')); }
  notes.push(...list.map(x => x.text));
  return tileLabel(D.tiles.T) + ' · ' + notes.join(' · ');
}
/** the slivers of a wall, and what to try instead → { lines, best } */
function wallViewWarnings(D, plan, st) {
  if (!D.tiles || !D.tiles.lay.slivers.length) return { lines: [], best: null };
  const best = bestTileStart(plan, D.f, st, D.fixtures);
  const cur = D.tiles.lay.cuts.reduce((m, c) => Math.min(m, c.c / c.size), 1);
  const by = new Map();
  for (const c of D.tiles.lay.slivers) { const k = cutPlace(c); if (!by.has(k) || c.c < by.get(k).c) by.set(k, c); }
  const tryIt = best && best.score > cur + 0.01 ? ' – ' + t('try {what}', { what: [best.S && best.S.x && best.S.x !== 'centre' || (best.S && best.S.dx) ? best.labelX : null, best.S && best.S.y ? best.labelY : null].filter(Boolean).join(', ') || t('Centre of the wall') }) : '';
  const lines = [...by.entries()].map(([k, c]) => t('{where} {c} mm is a sliver (under ⅓ tile)', { where: k.charAt(0).toUpperCase() + k.slice(1), c: fmtMM(c.c) }) + tryIt);
  return { lines, best };
}

/** a room's tiled floor seen from above (as in the plan): the tiles from its start, cut pieces lighter, slivers marked */
function floorViewSvg(r, lay, plan, opts = {}) {
  const bb = bboxOfPoints(r.poly), pad = 0.3, fs = opts.fs || 0.075;
  const W = bb.maxX - bb.minX, H = bb.maxY - bb.minY;
  const svg = s('svg', { class: 'wv wv-floorsvg', viewBox: [bb.minX - pad, bb.minY - pad - 0.12, W + 2 * pad, H + 2 * pad + 0.12].map(v => +v.toFixed(3)).join(' '), role: 'img', 'aria-label': t('Floor tiles') });
  const path = 'M' + r.poly.map(q => q[0].toFixed(4) + ' ' + q[1].toFixed(4)).join('L') + 'Z';
  const clipId = 'wvf-' + Math.round(Math.random() * 1e6);
  const cp = s('clipPath', { id: clipId }); cp.appendChild(s('path', { d: path })); svg.appendChild(cp);
  svg.appendChild(s('path', { d: path, class: 'wv-wall' }));
  const g = s('g', { 'clip-path': `url(#${clipId})` });
  g.appendChild(s('path', { d: path, class: 'wv-grout', fill: lay.F.grout }));
  const { tu, tv } = lay.G;
  for (const P of lay.count.pieces) {
    const sl = P.cut && ((P.x1 - P.x0) < tu * SLIVER - 1e-6 || (P.y1 - P.y0) < tv * SLIVER - 1e-6);
    const [x, y, w, hh] = lay.turn ? [P.y0, P.x0, P.y1 - P.y0, P.x1 - P.x0] : [P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0];
    g.appendChild(s('rect', { x: +x.toFixed(4), y: +y.toFixed(4), width: +w.toFixed(4), height: +hh.toFixed(4), class: 'wv-tile' + (P.cut ? ' cut' : '') + (sl ? ' sliver' : ''), fill: lay.F.color }));
  }
  svg.appendChild(g);
  for (const hl of roomHoles(plan, r) || []) svg.appendChild(s('path', { d: 'M' + hl.map(q => q[0].toFixed(4) + ' ' + q[1].toFixed(4)).join('L') + 'Z', class: 'wv-hole' }));
  svg.appendChild(s('path', { d: path, class: 'wv-floor-edge' }));
  svg.appendChild(s('text', { x: +(bb.minX - pad + 0.04).toFixed(3), y: +(bb.minY - 0.16).toFixed(3), class: 'wv-t wv-title', 'text-anchor': 'start', 'font-size': fs * 1.25 }, t('Floor') + '  ·  ' + fmtMM(W) + ' × ' + fmtMM(H) + ' mm'));
  return svg;
}

/** the list of things on the wall, for the electrician: what, how high, how far from the left corner */
function wallViewRows(D) {
  return D.pts.map(P => ({ what: P.name + (P.pt.label ? ' · ' + P.pt.label : ''), h: P.unit ? t('underside {h}', { h: fmtMM(P.y) }) : fmtMM(P.y) + ' mm', x: fmtMM(P.x) + ' mm', note: P.pt.note || '' }));
}

Object.assign(app, {
  /** the data of every wall of a room, in the shown version (S: a start to try on the wall with that letter) */
  roomWallViews(r, letter, S) {
    const v = this.shownVersion(), plan = v.plan, st = getStorey(this.project, r.storey);
    const lay = this.activeLayout ? this.activeLayout() : null;
    const rr = plan.rooms.find(x => x.id === r.id) || r;
    return roomFaces(plan, rr).filter(f => !letter || f.letter === letter).map(f => wallViewData(this, plan, f, st, lay ? lay.items : [], letter && S !== undefined ? S : undefined));
  },
  /** Room details → Walls → "Wall views"; opts.focus: a wall's letter or 'floor' to scroll to */
  wallViewsSheet(r, opts = {}) {
    const views = this.roomWallViews(r);
    const ro = !this.canEdit() || !!this.project.viewer;
    const body = h('div', { class: 'wv-body', id: 'wv-body' });
    if (!views.length) body.appendChild(h('p', { class: 'note-muted' }, t('No walls found along this room. Its corners should lie on the faces of the walls.')));
    for (const D0 of views) {
      const card = h('div', { class: 'wv-card', 'data-letter': D0.letter });
      const draw = h('div', { class: 'wv-draw' }), info = h('div', { class: 'wv-tileinfo' });
      card.append(draw, info);
      this.wallViewCard(r, D0, draw, info, ro);
      const rows = wallViewRows(D0);
      if (rows.length) card.appendChild(h('table', { class: 'wv-table' },
        h('thead', null, h('tr', null, h('th', null, t('On this wall')), h('th', null, t('Height')), h('th', null, t('From the left corner')))),
        h('tbody', null, ...rows.map(x => h('tr', null, h('td', null, x.what), h('td', { class: 'num' }, x.h), h('td', { class: 'num' }, x.x))))));
      card.appendChild(this.wallPhotoStrip(D0.f));
      body.appendChild(card);
    }
    const fcard = this.floorTileCard(r, ro);
    if (fcard) body.appendChild(fcard);
    // (Enter in a field of the tiles' start only stores it – it does not press the PDF button)
    const p = UI.dialog({ title: t('Wall views · {r}', { r: r.name }), body, wide: true, enterKey: false,
      actions: [{ label: t('Close'), value: null }, { label: t('PDF for the tiler, electrician and kitchen supplier'), icon: 'download', kind: 'primary', validate: async () => { await this.wallViewsPdf(r); return false; } }] });
    // the dialog puts the focus in its first field (and scrolls there): not here – open at the top, or at the wall asked for
    setTimeout(() => {
      if (document.activeElement && body.contains(document.activeElement)) document.activeElement.blur();
      const c = body.querySelector(opts.focus ? `.wv-card[data-letter="${opts.focus}"]` : '.wv-card');
      if (c) c.scrollIntoView({ block: 'start' });
    }, 80);
    return p;
  },
  /** one wall's drawing and its tiles: the cuts, slivers, and where the tiles start (task 0036); repaints itself */
  wallViewCard(r, D, draw, info, ro) {
    const plan = this.shownVersion().plan, st = getStorey(this.project, r.storey), letter = D.letter;
    draw.textContent = ''; info.textContent = '';
    draw.appendChild(wallViewSvg(D));
    if (!D.tiles) return;
    const lay = D.tiles.lay, S = lay.start || {};
    info.appendChild(h('p', { class: 'wv-tilenote-line note-muted' }, wallViewTileNote(D)));
    info.appendChild(h('p', { class: 'wv-count note-muted' }, icon('grid'), ' ', t('On this wall: {w} whole tiles and {c} cut pieces', { w: lay.count.whole, c: lay.count.cut })));
    const W = wallViewWarnings(D, plan, st);
    for (const line of W.lines) info.appendChild(h('p', { class: 'wv-warn' }, icon('alert'), ' ', line));
    // the start: across, a nudge, the rows; Best start
    const save = S2 => {
      const c = cleanTileStart(S2), fid = D.f.wall.id, rid = r.id;
      this.mutate(pl => {
        const ww = pl.walls.find(x => x.id === fid);
        if (!ww) return;
        if (c) ww.tileStart = { ...(ww.tileStart || {}), [rid]: c };
        else if (ww.tileStart) { delete ww.tileStart[rid]; if (!Object.keys(ww.tileStart).length) delete ww.tileStart; }
      }, { keepInspector: true });
      const D2 = this.roomWallViews(r, letter)[0];
      if (D2) this.wallViewCard(r, D2, draw, info, ro);
      return D2;
    };
    const ch = tileStartChoices(lay, D.fixtures);
    const xKey = !S.x || S.x === 'centre' ? 'centre' : S.x === 'left' || S.x === 'right' ? S.x : (ch.xs.find(c => c.S.x === 'at' && Math.abs(c.S.at - S.at) < 0.0015) || { key: 'kept' }).key;
    const xs = ch.xs.map(c => h('option', { value: c.key, selected: c.key === xKey }, c.label));
    if (xKey === 'kept') xs.push(h('option', { value: 'kept', selected: true }, t('Centre on a line at {x} mm', { x: fmtMM(S.at) })));
    const selX = h('select', { class: 'select ts-x', id: 'ts-x-' + letter, disabled: ro }, ...xs);
    selX.addEventListener('change', () => {
      const c = ch.xs.find(x => x.key === selX.value);
      if (!c) return;
      let X = { ...c.S };
      // on a window, door or fixture: a tile or a joint on its centre line, whichever cuts less
      if (X.x === 'at') {
        const a = faceTileLayout(plan, D.f, st, { ...S, ...X, joint: false, dx: 0 }), b = faceTileLayout(plan, D.f, st, { ...S, ...X, joint: true, dx: 0 });
        const sc = L2 => L2.cuts.filter(q => /^(left|right)$|-[lr]$/.test(q.k)).reduce((m, q) => Math.min(m, q.c / q.size), 1);
        if (sc(b) > sc(a) + 1e-6) X.joint = true;
      }
      save({ ...S, x: X.x, at: X.at, joint: X.joint, ref: X.ref, dx: 0 });
    });
    const dx = h('input', { class: 'input num ts-dx', id: 'ts-dx-' + letter, type: 'text', value: String(Math.round((+S.dx || 0) * 1000)), disabled: ro, autocomplete: 'off', 'aria-label': t('Shift (mm)') });
    const setDx = v => { if (isFinite(v)) save({ ...S, dx: clamp(v, -5000, 5000) / 1000 }); };
    dx.addEventListener('change', () => setDx(parseFloat(dx.value.replace(',', '.'))));
    dx.addEventListener('keydown', e => { if (e.key === 'Enter') dx.blur(); });
    const step = d => h('button', { class: 'btn sm ts-step', type: 'button', disabled: ro, 'data-d': String(d), 'aria-label': d < 0 ? t('10 mm to the left') : t('10 mm to the right'), onclick: () => setDx(Math.round((+S.dx || 0) * 1000) + d) }, d < 0 ? '◀' : '▶');
    const yKey = S.y === 'top' ? 'top' : S.y === 'at' ? ((ch.ys.find(c => c.S.y === 'at' && Math.abs(c.S.yh - S.yh) < 0.0015) || { key: 'height' }).key) : 'floor';
    const selY = h('select', { class: 'select ts-y', id: 'ts-y-' + letter, disabled: ro }, ...ch.ys.map(c => h('option', { value: c.key, selected: c.key === yKey }, c.label)), h('option', { value: 'height', selected: yKey === 'height' }, t('Whole row from a height I type')));
    selY.addEventListener('change', () => {
      if (selY.value === 'height') { save({ ...S, y: 'at', yh: S.yh > 0 ? S.yh : 0.6, yref: null }); return; }
      const c = ch.ys.find(x => x.key === selY.value);
      if (c) save({ ...S, y: c.S.y, yh: c.S.yh, yref: c.S.yref });
    });
    const box = h('div', { class: 'ts-box' },
      h('div', { class: 'field' }, h('label', { for: 'ts-x-' + letter }, t('Tiles start across')), selX),
      h('div', { class: 'field' }, h('label', { for: 'ts-dx-' + letter }, t('Shift')), h('div', { class: 'ts-nudge' }, step(-10), h('div', { class: 'input-unit' }, dx, h('span', { class: 'unit' }, 'mm')), step(10))),
      h('div', { class: 'field' }, h('label', { for: 'ts-y-' + letter }, t('Rows')), selY));
    if (yKey === 'height') box.appendChild(this.mmField(t('Whole row from'), 'ts-yh-' + letter, S.yh, v => save({ ...S, y: 'at', yh: clamp(v, 0.01, 6), yref: null }), { disabled: ro }));
    if (!ro) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm primary ts-best', id: 'ts-best-' + letter, type: 'button', onclick: () => { const B = bestTileStart(plan, D.f, st, D.fixtures); if (!B) return; const D2 = save(B.S || {}); const cs = D2 && D2.tiles ? D2.tiles.lay.cuts : []; this.toast(cs.length ? t('Best start: the smallest cut is now {c} mm.', { c: fmtMM(Math.min(...cs.map(c => c.c))) }) : t('Best start: no cut tiles.')); } }, icon('check'), t('Best start')),
      h('span', { class: 'note-muted ts-drag-hint' }, t('or drag the tiles sideways'))));
    info.appendChild(box);
    // drag the tiles sideways in the drawing: a live preview, kept when let go
    if (ro) return;
    draw.style.touchAction = 'pan-y';
    let drag = null;
    draw.onpointerdown = e => {
      if (e.button) return;
      const svg = draw.querySelector('svg'), m = svg && svg.getScreenCTM();
      if (!m) return;
      drag = { x: e.clientX, k: m.a, dx0: +S.dx || 0, on: false, S: null, id: e.pointerId };
    };
    draw.onpointermove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = (e.clientX - drag.x) / drag.k;
      if (!drag.on && Math.abs(e.clientX - drag.x) < 6) return;
      if (!drag.on) { drag.on = true; try { draw.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } draw.classList.add('dragging'); }
      drag.S = { ...S, dx: Math.round((drag.dx0 + d) * 1000) / 1000 };
      const D2 = this.roomWallViews(r, letter, drag.S)[0];
      if (D2) { draw.textContent = ''; draw.appendChild(wallViewSvg(D2)); }
    };
    const end = e => {
      if (!drag) return;
      const d = drag; drag = null;
      draw.classList.remove('dragging');
      if (d.on && d.S && e.type === 'pointerup') save(d.S); else if (d.on) this.wallViewCard(r, D, draw, info, ro);
    };
    draw.onpointerup = end; draw.onpointercancel = end;
  },
  /** the room's tiled floor: the grid from its start, cut pieces, slivers, the count, where the tiles start */
  floorTileCard(r, ro, card) {
    const plan = this.shownVersion().plan, rr = plan.rooms.find(x => x.id === r.id) || r;
    const lay = floorTileLayout(plan, rr);
    if (!lay) return card ? (card.remove(), null) : null;
    card = card || h('div', { class: 'wv-card wv-floor', 'data-letter': 'floor' });
    card.textContent = '';
    card.appendChild(h('div', { class: 'wv-draw' }, floorViewSvg(rr, lay, plan)));
    const S = lay.start || {};
    const waste = (qtySettings(this.project).floorWaste[lay.F.material] ?? 10);
    const n = Math.ceil((lay.count.whole + lay.count.cut) * (1 + waste / 100) - 1e-9);
    const list = floorCutsSummary(lay.cuts);
    card.appendChild(h('p', { class: 'wv-tilenote-line note-muted' }, `${t('Floor tiles')} · ${fmtMM(lay.F.l)} × ${fmtMM(lay.F.w)} mm` + (list.length ? ' · ' + list.map(x => x.text).join(' · ') : '')));
    card.appendChild(h('p', { class: 'wv-count note-muted' }, icon('grid'), ' ', t('{n} floor tiles: {w} whole and {c} cut pieces, with {p} % extra', { n, w: lay.count.whole, c: lay.count.cut, p: waste })));
    const best = lay.slivers.length ? bestFloorStart(plan, rr) : null;
    const cur = lay.cuts.reduce((m, c) => Math.min(m, c.c / c.size), 1);
    for (const x of list.filter(q => q.sliver)) card.appendChild(h('p', { class: 'wv-warn' }, icon('alert'), ' ', t('{where} {c} mm is a sliver (under ⅓ tile)', { where: x.place.charAt(0).toUpperCase() + x.place.slice(1), c: fmtMM(x.c) }) + (best && best.score > cur + 0.01 ? ' – ' + t('try {what}', { what: best.label }) : '')));
    const save = S2 => {
      const rid = r.id;
      this.mutate(pl => {
        const q = pl.rooms.find(x => x.id === rid);
        if (!q || !q.floor) return;
        const c = S2 && (S2.at && S2.at !== 'centre' || +S2.dx || +S2.dy) ? { at: S2.at || 'centre', ...(S2.at === 'door' ? { p: S2.p, n: S2.n } : {}), ...(+S2.dx ? { dx: +(+S2.dx).toFixed(4) } : {}), ...(+S2.dy ? { dy: +(+S2.dy).toFixed(4) } : {}) } : null;
        if (c) q.floor.start = c; else delete q.floor.start;
      }, { keepInspector: true });
      this.floorTileCard(r, ro, card);
    };
    const ch = floorStartChoices(plan, rr);
    const key = !S.at || S.at === 'centre' ? 'centre' : S.at === 'door' ? ((ch.find(c => c.S.at === 'door' && S.p && Math.hypot(c.S.p[0] - S.p[0], c.S.p[1] - S.p[1]) < 0.01) || { key: 'centre' }).key) : S.at;
    const sel = h('select', { class: 'select fs-at', id: 'fs-at', disabled: ro }, ...ch.map(c => h('option', { value: c.key, selected: c.key === key }, c.label)));
    sel.addEventListener('change', () => { const c = ch.find(x => x.key === sel.value); if (c) save({ ...c.S }); });
    const nud = (k, lab) => {
      const inp = h('input', { class: 'input num fs-' + k, id: 'fs-' + k, type: 'text', value: String(Math.round((+S[k] || 0) * 1000)), disabled: ro, autocomplete: 'off' });
      const set = v => { if (isFinite(v)) save({ ...S, [k]: clamp(v, -5000, 5000) / 1000 }); };
      inp.addEventListener('change', () => set(parseFloat(inp.value.replace(',', '.'))));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      const b = (d, txt) => h('button', { class: 'btn sm ts-step', type: 'button', disabled: ro, onclick: () => set(Math.round((+S[k] || 0) * 1000) + d) }, txt);
      return h('div', { class: 'field' }, h('label', { for: 'fs-' + k }, lab), h('div', { class: 'ts-nudge' }, b(-10, k === 'dx' ? '◀' : '▲'), h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, 'mm')), b(10, k === 'dx' ? '▶' : '▼')));
    };
    const box = h('div', { class: 'ts-box' }, h('div', { class: 'field' }, h('label', { for: 'fs-at' }, t('Floor tiles start')), sel), nud('dx', t('Shift left–right')), nud('dy', t('Shift up–down')));
    if (!ro) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm primary ts-best', id: 'fs-best', type: 'button', onclick: () => { const B = bestFloorStart(plan, rr); if (B) save(B.S); } }, icon('check'), t('Best start'))));
    card.appendChild(box);
    card.appendChild(h('p', { class: 'note-muted' }, t('In the plan and in 3D the floor pattern does not follow this start yet.')));
    return card;
  },
  /** one A4 page (landscape) per wall: the view as a picture, the list of things on it, the house and the date */
  async wallViewsPdf(r) {
    const views = this.roomWallViews(r);
    if (!views.length) return;
    const busy = UI.busy(t('Making the PDF…'));
    try {
      const pdf = new PdfWriter(), p = this.project, ver = this.shownVersion(), st = getStorey(p, r.storey);
      const theme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = 'light';
      const host = h('div', { class: 'wv-print', style: { position: 'fixed', left: '-9000px', top: '0', width: '1600px' } });
      document.body.appendChild(host);
      try {
        for (const D of views) {
          const svg = wallViewSvg(D, { fs: 0.08 });
          host.textContent = ''; host.appendChild(svg);
          const jpeg = await svgJpeg(svg, 2400);
          const pg = pdf.page(297, 210);
          pg.text(`${p.name} · ${r.name} · ${t('Wall {l}', { l: D.letter })}`, 12, 14, 13, { bold: true });
          pg.text(`${st ? st.name : ''} · ${ver.name} · ${fmtDate(Date.now(), false)} · ${fmtMM(D.L)} mm`, 12, 20, 9, { color: [0.35, 0.38, 0.4] });
          if (D.tiles) pg.text(wallViewTileNote(D).slice(0, 170), 12, 25, 9, { color: [0.35, 0.38, 0.4] });
          const rows = wallViewRows(D);
          const listH = rows.length ? Math.min(70, 8 + rows.length * 4.6) : 0;
          const top = D.tiles ? 29 : 26, boxW = 273, boxH = 210 - top - 12 - listH;
          const k = Math.min(boxW / jpeg.w, boxH / jpeg.h);
          pg.image(jpeg.data, jpeg.pxW, jpeg.pxH, 12 + (boxW - jpeg.w * k) / 2, top, jpeg.w * k, jpeg.h * k);
          if (rows.length) {
            let y = 210 - listH - 2;
            pg.text(t('On this wall'), 12, y, 9, { bold: true }); pg.text(t('Height'), 160, y, 9, { bold: true }); pg.text(t('From the left corner'), 200, y, 9, { bold: true });
            for (const x of rows.slice(0, 13)) { y += 4.6; pg.text(x.what.slice(0, 80), 12, y, 8.5); pg.text(x.h, 160, y, 8.5); pg.text(x.x, 200, y, 8.5); }
            if (rows.length > 13) pg.text(t('and {n} more', { n: rows.length - 13 }), 12, y + 4.6, 8.5);
          }
          // the photos of the bare wall: on pages of their own, six to a page, with the date and the text
          const photos = wallPhotosOf(p, D.f);
          if (photos.length) await Assets.ensure(photos.map(x => x.asset));
          for (let k = 0; k < photos.length; k += 6) {
            const pp = pdf.page(297, 210);
            pp.text(`${p.name} · ${r.name} · ${t('Wall {l}', { l: D.letter })} · ${t('photos of the bare wall')}` + (photos.length > 6 ? ` (${k / 6 + 1}/${Math.ceil(photos.length / 6)})` : ''), 12, 14, 13, { bold: true });
            pp.text(`${st ? st.name : ''} · ${t('before it was closed: pipes, cables and boxes')}`, 12, 20, 9, { color: [0.35, 0.38, 0.4] });
            photos.slice(k, k + 6).forEach((x, j) => {
              const a = Assets.get(x.asset);
              const cx = 12 + (j % 3) * 92, cy = 26 + Math.floor(j / 3) * 90, bw = 88, bh = 74;
              if (a && /^data:image\/jpeg;base64,/.test(a.url)) {
                const pw = a.w || x.w || 4, ph = a.h || x.h || 3, kk = Math.min(bw / pw, bh / ph);
                pp.image(b64ToBytes(a.url.slice(a.url.indexOf(',') + 1)), pw, ph, cx + (bw - pw * kk) / 2, cy, pw * kk, ph * kk);
              }
              pp.text(fmtDate(x.date, false), cx, cy + bh + 4.5, 8.5, { bold: true });
              if (x.text) pp.text(x.text.slice(0, 60), cx, cy + bh + 8.5, 8);
            });
          }
        }
        // the tiled floor: one page, its tiles from the start, the cuts at each side
        const rr = ver.plan.rooms.find(x => x.id === r.id) || r, fl = floorTileLayout(ver.plan, rr);
        if (fl) {
          const svg = floorViewSvg(rr, fl, ver.plan, { fs: 0.08 });
          host.textContent = ''; host.appendChild(svg);
          const jpeg = await svgJpeg(svg, 2400);
          const pg = pdf.page(297, 210);
          pg.text(`${p.name} · ${r.name} · ${t('Floor tiles')}`, 12, 14, 13, { bold: true });
          pg.text(`${fmtMM(fl.F.l)} × ${fmtMM(fl.F.w)} mm · ` + floorCutsSummary(fl.cuts).map(x => x.text).join(' · ').slice(0, 150), 12, 20, 9, { color: [0.35, 0.38, 0.4] });
          const k = Math.min(273 / jpeg.w, 172 / jpeg.h);
          pg.image(jpeg.data, jpeg.pxW, jpeg.pxH, 12 + (273 - jpeg.w * k) / 2, 26, jpeg.w * k, jpeg.h * k);
        }
      } finally { host.remove(); document.documentElement.dataset.theme = theme || ''; if (!theme) delete document.documentElement.dataset.theme; }
      this.downloadBlob(`${slugify(p.name)}_${slugify(r.name)}_${slugify(t('wall views'))}.pdf`, pdf.blob());
      this.lastWallViewsPdf = pdf;
    } finally { busy.close(); }
  },
});

/** an SVG on the page → a JPEG of about pxW pixels wide (its colours written in, as on screen in light) */
async function svgJpeg(svg, pxW) {
  const clone = svg.cloneNode(true);
  const all = [svg, ...svg.querySelectorAll('*')], allC = [clone, ...clone.querySelectorAll('*')];
  const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order', 'display', 'visibility'];
  all.forEach((el, i) => { const cs = getComputedStyle(el), out = allC[i]; if (out && out.setAttribute && out.tagName !== 'clipPath') out.setAttribute('style', props.map(pp => `${pp}:${cs.getPropertyValue(pp)}`).join(';')); });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svg.viewBox.baseVal, ratio = vb.height / vb.width;
  const W = pxW, H = Math.round(pxW * ratio);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  const img = await loadImage(url);
  const cv = makeCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0, W, H);
  return { data: await canvasJpeg(cv, 0.9), pxW: W, pxH: H, w: W, h: H };
}

/* ───────── photos of the bare walls (I25) ─────────
   On a building visit: a photo of each wall before plaster and tiles close it (pipes, cables, boxes), attached to that
   wall. The photos show the house as built, so they belong to the house, not to one version: project.wallPhotos =
   [{ id, wall, side, u, room, asset, thumb, w, h, date, text, created }] – the wall's id (kept when a version is
   copied), its side, where along it (u, metres from its start: one wall can run along two rooms) and the room it was
   taken in. A wall view shows the photos of its wall side in every version that has that wall. The picture is made
   smaller on the device (at most 1600 px, JPEG, as note photos) with a small thumbnail beside it; both are Assets, so
   they go with exports, backups, merges and viewer copies (assetIdsOf). */
const WP_MAX = 1600, WP_THUMB = 320;

/** the photos of one wall face (a wall, one side, the part along one room), oldest first */
function wallPhotosOf(p, f) {
  const inF = (x, g) => x.u >= g.u0 - 0.1 && x.u <= g.u1 + 0.1;
  let sib = null;   // the room's other faces of the same wall and side (an L-shaped room can meet one wall twice)
  const others = () => sib || (sib = roomFaces(app.shownVersion().plan, f.room).filter(g => g.wall.id === f.wall.id && g.side === f.side && Math.abs(g.u0 - f.u0) > 0.01));
  // where along the wall it was taken; if the wall changed in this version, the room it was taken in (the nearest face)
  return ((p && p.wallPhotos) || []).filter(x => x.wall === f.wall.id && x.side === f.side &&
    (inF(x, f) || (x.room === f.room.id && !others().some(g => inF(x, g) || Math.abs(x.u - (g.u0 + g.u1) / 2) < Math.abs(x.u - (f.u0 + f.u1) / 2)))))
    .sort((a, b) => (a.date || 0) - (b.date || 0) || (a.created || 0) - (b.created || 0));
}

/** the date a JPEG was taken (EXIF DateTimeOriginal, else DateTime), or null */
async function photoTakenAt(file) {
  try {
    const b = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (b.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o + 10 < b.byteLength) {
      const m = b.getUint16(o), len = b.getUint16(o + 2);
      if ((m & 0xFF00) !== 0xFF00) return null;
      if (m === 0xFFE1 && b.getUint32(o + 4) === 0x45786966) {
        const T = o + 10, le = b.getUint16(T) === 0x4949;
        const u16 = x => b.getUint16(T + x, le), u32 = x => b.getUint32(T + x, le);
        const find = (ifd, tag) => { const n = u16(ifd); for (let i = 0; i < n && i < 500; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e; } return -1; };
        const str = e => { let s0 = ''; const at = u32(e + 8); for (let i = 0; i < 19; i++) s0 += String.fromCharCode(b.getUint8(T + at + i)); return s0; };
        const ifd0 = u32(4);
        let s0 = null;
        const ex = find(ifd0, 0x8769);
        if (ex >= 0) { const d = find(u32(ex + 8), 0x9003); if (d >= 0) s0 = str(d); }
        if (!s0) { const d = find(ifd0, 0x0132); if (d >= 0) s0 = str(d); }
        const q = s0 && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s0);
        if (!q || +q[1] < 1990) return null;
        const tm = new Date(+q[1], +q[2] - 1, +q[3], +q[4], +q[5], +q[6]).getTime();
        return isFinite(tm) ? tm : null;
      }
      if (m === 0xFFDA) return null;
      o += 2 + len;
    }
  } catch (_) { /* not a JPEG we can read: no date */ }
  return null;
}

/** a picture file → { url (JPEG, at most WP_MAX px), thumb, w, h } – the big photo is decoded once, here */
async function shrinkWallPhoto(file) {
  let src, close = () => {};
  try { src = await createImageBitmap(file); close = () => src.close && src.close(); } catch (_) { src = await loadImage(await readFileAs(file, 'dataurl')); }
  try {
    const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
    if (!W || !H) throw new Error('empty picture');
    const draw = max => {
      const k = Math.min(1, max / Math.max(W, H)), cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
      return { cv, cw, ch };
    };
    const big = draw(WP_MAX), url = big.cv.toDataURL('image/jpeg', 0.8);
    const sm = draw(WP_THUMB), thumb = sm.cv.toDataURL('image/jpeg', 0.75);
    big.cv.width = big.cv.height = 0;
    return { url, w: big.cw, h: big.ch, thumb, tw: sm.cw, th: sm.ch };
  } finally { close(); }
}

/** a file input: on a phone `capture` opens the camera directly; on a PC it is a file picker */
function pickWallPhotos(camera) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept: 'image/*', class: 'wp-input', style: { position: 'fixed', left: '-1000px' } });
    if (camera) inp.setAttribute('capture', 'environment'); else inp.multiple = true;
    inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve([]); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}

const isTouchDevice = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

Object.assign(app, {
  /** add photos to wall face f; the files: from the camera (phone) or chosen; true when one was added */
  async addWallPhotos(f, camera) {
    if (this.project.viewer) return false;
    const files = await pickWallPhotos(camera);
    if (!files.length) return false;
    const busy = UI.busy(t('Making the photo smaller…'));
    const add = [];
    try {
      for (const file of files) {
        try {
          const date = (await photoTakenAt(file)) || Date.now();
          const s0 = await shrinkWallPhoto(file);
          const asset = await Assets.put(s0.url, s0.w, s0.h), thumb = await Assets.put(s0.thumb, s0.tw, s0.th);
          add.push({ id: uid('wp_'), wall: f.wall.id, side: f.side, u: +((f.u0 + f.u1) / 2).toFixed(3), room: f.room.id, asset, thumb, w: s0.w, h: s0.h, date, text: '', created: Date.now() });
        } catch (e) { console.error(e); this.toast(t('This picture could not be read.')); }
      }
    } finally { busy.close(); }
    if (!add.length) return false;
    this.mutate(p => { (p.wallPhotos = p.wallPhotos || []).push(...add); }, { project: true, keepInspector: true });
    this.toast(add.length === 1 ? t('Photo added to wall {l}.', { l: f.letter }) : t('{n} photos added to wall {l}.', { n: add.length, l: f.letter }));
    return true;
  },
  /** the photo strip of a wall face: thumbnails (loaded when shown), Take photo / Choose photos; repaints itself */
  wallPhotoStrip(f, onChange) {
    const box = h('div', { class: 'wp-strip', 'data-wall': f.wall.id, 'data-side': String(f.side) });
    const ro = !!this.project.viewer;
    const paint = async () => {
      const list = wallPhotosOf(this.project, f);
      await Assets.ensure(list.flatMap(x => [x.thumb, x.asset]).filter(Boolean));
      box.textContent = '';
      box.appendChild(h('div', { class: 'wp-head' }, icon('camera'), h('span', { class: 'wp-title' }, list.length ? t('Photos of the bare wall ({n})', { n: list.length }) : t('No photo of the bare wall yet'))));
      if (list.length) {
        const grid = h('div', { class: 'wp-grid' });
        list.forEach((x, i) => {
          const a = Assets.get(x.thumb) || Assets.get(x.asset);
          grid.appendChild(h('button', { class: 'wp-th', 'data-id': x.id, 'aria-label': t('Show photo'), onclick: () => this.wallPhotoViewer(f, i, after) },
            a ? h('img', { src: a.url, alt: '', loading: 'lazy' }) : h('span', { class: 'note-muted' }, '?'),
            h('span', { class: 'wp-date' }, fmtDate(x.date, false))));
        });
        box.appendChild(grid);
      }
      if (!ro) {
        const acts = h('div', { class: 'actions wp-acts' });
        if (isTouchDevice()) {
          acts.appendChild(h('button', { class: 'btn primary wp-camera', onclick: async () => { if (await this.addWallPhotos(f, true)) after(); } }, icon('camera'), t('Take photo')));
          acts.appendChild(h('button', { class: 'btn wp-gallery', onclick: async () => { if (await this.addWallPhotos(f, false)) after(); } }, icon('image'), t('From the gallery')));
        } else acts.appendChild(h('button', { class: 'btn sm wp-add', onclick: async () => { if (await this.addWallPhotos(f, false)) after(); } }, icon('camera'), t('Add photo')));
        box.appendChild(acts);
        if (!list.length) box.appendChild(h('p', { class: 'note-muted wp-hint' }, t('Photograph the bare wall (kale muur) before it is closed: pipes, cables and boxes. Years later you know where not to drill.')));
      }
    };
    const after = () => { paint(); if (onChange) onChange(); };
    paint();
    box.repaint = paint;
    return box;
  },
  /** a wall's photos full screen: swipe or arrows between them, the date and the text, change the text, delete */
  wallPhotoViewer(f, start, onChange) {
    let list = wallPhotosOf(this.project, f), i = clamp(start, 0, list.length - 1);
    if (!list.length) return;
    const ro = !!this.project.viewer;
    const img = h('img', { alt: '', class: 'wp-big', draggable: 'false' });
    const info = h('div', { class: 'wp-info' });
    const count = h('span', { class: 'wp-count num' });
    const prev = h('button', { class: 'btn ghost icon wp-prev', 'aria-label': t('Previous photo'), onclick: () => go(-1) }, icon('back'));
    const next = h('button', { class: 'btn ghost icon wp-next', 'aria-label': t('Next photo'), onclick: () => go(1) }, icon('forward'));
    const stage = h('div', { class: 'wp-stage' }, prev, img, next);
    const paint = async () => {
      const x = list[i];
      await Assets.ensure([x.asset]);
      const a = Assets.get(x.asset) || Assets.get(x.thumb);
      img.src = a ? a.url : '';
      count.textContent = `${i + 1} / ${list.length}`;
      prev.disabled = i === 0; next.disabled = i === list.length - 1;
      info.textContent = '';
      info.appendChild(h('div', { class: 'wp-meta' }, count, ' · ', t('Wall {l}', { l: f.letter }), ' · ', fmtDate(x.date, false)));
      info.appendChild(h('div', { class: 'wp-text' + (x.text ? '' : ' note-muted') }, x.text || (ro ? '' : t('No text yet – for example “cable to the switch at 1.10 m”.'))));
      if (!ro) info.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm wp-edit', onclick: editText }, icon('edit'), t('Text')),
        h('button', { class: 'btn sm danger wp-del', onclick: del }, icon('trash'), t('Delete photo'))));
    };
    const go = d => { const j = clamp(i + d, 0, list.length - 1); if (j !== i) { i = j; paint(); } };
    const editText = async () => {
      const x = list[i];
      const v = await UI.prompt({ title: t('Text with the photo'), label: t('What is on it (optional)'), value: x.text || '', placeholder: t('cable to the switch at 1.10 m') });
      if (v == null) return;
      this.mutate(p => { const y = (p.wallPhotos || []).find(z => z.id === x.id); if (y) y.text = String(v).trim().slice(0, 200); }, { project: true, keepInspector: true });
      list = wallPhotosOf(this.project, f); paint(); if (onChange) onChange();
    };
    const del = async () => {
      const x = list[i];
      if (!(await UI.confirm({ title: t('Delete photo'), message: t('Delete this photo of wall {l}? It goes in every version.', { l: f.letter }), confirmLabel: t('Delete'), danger: true }))) return;
      this.mutate(p => { p.wallPhotos = (p.wallPhotos || []).filter(z => z.id !== x.id); }, { project: true, keepInspector: true });
      list = wallPhotosOf(this.project, f);
      if (onChange) onChange();
      if (!list.length) { dlgClose && dlgClose(null); return; }
      i = Math.min(i, list.length - 1); paint();
    };
    // swipe: a quick sideways move over the photo
    let sx = null, sy = 0;
    stage.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    stage.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1); });
    stage.addEventListener('pointercancel', () => { sx = null; });
    stage.addEventListener('dragstart', e => e.preventDefault());
    let dlgClose = null;
    let dlgEl = null;
    const keys = e => {
      // not while typing, and only when this window is on top (not under the text prompt)
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || (dlgEl && document.querySelector('#sheet-root > .scrim:last-child .dialog') !== dlgEl)) return;
      if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', keys);
    paint();
    return UI.dialog({ title: t('Wall {l} · photo', { l: f.letter }), body: h('div', { class: 'wp-viewer' }, stage, info), wide: true,
      onOpen: (dlg, close) => { dlgClose = close; dlgEl = dlg; dlg.classList.add('wp-dialog'); },
      actions: [{ label: t('Close'), value: null, kind: 'primary' }] }).finally(() => document.removeEventListener('keydown', keys));
  },
  /** which faces of a room have photos: { faces, withPhotos } */
  roomWallPhotoCount(r, plan) {
    const faces = roomFaces(plan || this.shownVersion().plan, r);
    return { faces, n: faces.length, withPhotos: faces.filter(f => wallPhotosOf(this.project, f).length).length };
  },
});
