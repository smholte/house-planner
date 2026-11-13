/* ───────────── wallviews.js — wall views per room (wandaanzichten) ─────────────
   Every wall of a room drawn flat, as you see it standing in the room: its length and height (up to the ceiling,
   under a sloped roof), doors and windows with their sizes and positions, the tiles laid out with the joints and
   where the cut tiles fall (the layout centred on the wall, whole rows from the floor), the sockets, switches,
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
function wallViewData(app0, plan, f, st, items) {
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
    tiles = { T, top: tt, fall: tileFall(T, L, tt) };
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
  return { f, L, maxH, ch, top, ops, tiles, pts, runs, fin, letter: f.letter };
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
    const { T, top, fall } = D.tiles, clipId = 'wvc-' + D.letter + '-' + Math.round(Math.random() * 1e6);
    const cp = s('clipPath', { id: clipId }); cp.appendChild(s('path', { d: wallPath })); svg.appendChild(cp);
    const g = s('g', { 'clip-path': `url(#${clipId})` });
    g.appendChild(s('rect', { x: 0, y: Y(top), width: X(L), height: X(top), class: 'wv-grout', fill: T.grout || '#C9C4BA' }));
    const { M, MH, side } = fall;
    const rows = Math.ceil(top / MH);
    for (let r = 0; r < rows; r++) {
      const y0 = r * MH, y1 = Math.min(top, y0 + T.h);
      const off = T.lay === 'half' && r % 2 ? M / 2 : 0;
      for (let x = side + off - M * Math.ceil((side + off) / M); x < L; x += M) {
        const a = Math.max(0, x), b = Math.min(L, x + T.w);
        if (b - a < 0.001) continue;
        const cut = b - a < T.w - 0.001 || y1 - y0 < T.h - 0.001;
        g.appendChild(s('rect', { x: X(a), y: Y(y1), width: X(b - a), height: X(y1 - y0), class: 'wv-tile' + (cut ? ' cut' : ''), fill: T.color || '#E9E6DF' }));
      }
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
  }
  txt(-pad + 0.04, maxH + 0.3, t('Wall {l}', { l: D.letter }) + '  ·  ' + fmtMM(L) + ' mm', 'wv-title', 'start', fs * 1.25);
  return svg;
}

/** for the tiler: how high, where cut */
function wallViewTileNote(D) {
  if (!D.tiles) return '';
  const F = D.tiles.fall, notes = [t('tiles to {h} mm', { h: fmtMM(D.tiles.top) })];
  if (F.cut > 0.002) notes.push(t('cut at both ends: {c} mm', { c: fmtMM(F.cut) }));
  if (F.topCut) notes.push(t('top row: {c} mm', { c: fmtMM(F.topCut) }));
  return tileLabel(D.tiles.T) + ' · ' + notes.join(' · ');
}

/** the list of things on the wall, for the electrician: what, how high, how far from the left corner */
function wallViewRows(D) {
  return D.pts.map(P => ({ what: P.name + (P.pt.label ? ' · ' + P.pt.label : ''), h: P.unit ? t('underside {h}', { h: fmtMM(P.y) }) : fmtMM(P.y) + ' mm', x: fmtMM(P.x) + ' mm', note: P.pt.note || '' }));
}

Object.assign(app, {
  /** the data of every wall of a room, in the shown version */
  roomWallViews(r) {
    const v = this.shownVersion(), plan = v.plan, st = getStorey(this.project, r.storey);
    const lay = this.activeLayout ? this.activeLayout() : null;
    return roomFaces(plan, r).map(f => wallViewData(this, plan, f, st, lay ? lay.items : []));
  },
  /** Room details → Walls → "Wall views" */
  wallViewsSheet(r) {
    const views = this.roomWallViews(r);
    const body = h('div', { class: 'wv-body', id: 'wv-body' });
    if (!views.length) body.appendChild(h('p', { class: 'note-muted' }, t('No walls found along this room. Its corners should lie on the faces of the walls.')));
    for (const D of views) {
      const card = h('div', { class: 'wv-card', 'data-letter': D.letter });
      card.appendChild(wallViewSvg(D));
      if (D.tiles) card.appendChild(h('p', { class: 'wv-tilenote-line note-muted' }, wallViewTileNote(D)));
      const rows = wallViewRows(D);
      if (rows.length) card.appendChild(h('table', { class: 'wv-table' },
        h('thead', null, h('tr', null, h('th', null, t('On this wall')), h('th', null, t('Height')), h('th', null, t('From the left corner')))),
        h('tbody', null, ...rows.map(x => h('tr', null, h('td', null, x.what), h('td', { class: 'num' }, x.h), h('td', { class: 'num' }, x.x))))));
      body.appendChild(card);
    }
    UI.dialog({ title: t('Wall views · {r}', { r: r.name }), body, wide: true,
      actions: [{ label: t('Close'), value: null }, { label: t('PDF for the tiler, electrician and kitchen supplier'), icon: 'download', kind: 'primary', validate: async () => { await this.wallViewsPdf(r); return false; } }] });
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
          if (D.tiles) pg.text(wallViewTileNote(D).slice(0, 150), 12, 25, 9, { color: [0.35, 0.38, 0.4] });
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
