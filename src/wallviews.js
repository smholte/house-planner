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
      card.appendChild(this.wallPhotoStrip(D.f));
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
  return ((p && p.wallPhotos) || []).filter(x => x.wall === f.wall.id && x.side === f.side &&
    ((x.u >= f.u0 - 0.1 && x.u <= f.u1 + 0.1) || x.room === f.room.id)).sort((a, b) => (a.date || 0) - (b.date || 0) || a.created - b.created);
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
    const keys = e => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
    document.addEventListener('keydown', keys);
    paint();
    return UI.dialog({ title: t('Wall {l} · photo', { l: f.letter }), body: h('div', { class: 'wp-viewer' }, stage, info), wide: true,
      onOpen: (dlg, close) => { dlgClose = close; dlg.classList.add('wp-dialog'); },
      actions: [{ label: t('Close'), value: null, kind: 'primary' }] }).finally(() => document.removeEventListener('keydown', keys));
  },
  /** which faces of a room have photos: { faces, withPhotos } */
  roomWallPhotoCount(r, plan) {
    const faces = roomFaces(plan || this.shownVersion().plan, r);
    return { faces, n: faces.length, withPhotos: faces.filter(f => wallPhotosOf(this.project, f).length).length };
  },
});

/* room details → Each wall, and a wall's details (the 2D plan's wall pick): a camera mark on walls with photos, the
   count per room, and the photo strip in the open wall – added after finish.js has drawn those parts */
{
  const roomWalls = app.roomWallsSection, wallFinish = app.wallFinishSection;
  app.roomWallsSection = function (el, r, ro, upd, plan) {
    roomWalls.call(this, el, r, ro, upd, plan);
    try {
      const pl = plan || this.shownVersion().plan;
      const { faces, n, withPhotos } = this.roomWallPhotoCount(r, pl);
      if (!n) return;
      const byLetter = new Map(faces.map(f => [f.letter, f]));
      const list = el.querySelector('.face-list:last-of-type') || [...el.querySelectorAll('.face-list')].pop();
      if (!list) return;
      for (const row of list.querySelectorAll('.face-row')) {
        const f = byLetter.get((row.querySelector('.face-letter') || {}).textContent);
        if (!f) continue;
        const k = wallPhotosOf(this.project, f).length;
        if (k) row.querySelector('.face-letter').after(h('span', { class: 'wp-mark', title: t('{n} photos of the bare wall', { n: k }), 'aria-label': t('{n} photos of the bare wall', { n: k }) }, icon('camera'), h('span', { class: 'num' }, String(k))));
        // the open wall: its photos under its editor
        if (row.classList.contains('on') && row.nextElementSibling && !row.nextElementSibling.classList.contains('face-row')) {
          row.nextElementSibling.appendChild(this.wallPhotoStrip(f, () => this.renderInspector()));
        }
      }
      const actions = [...list.children].find(c => c.classList.contains('actions'));
      const line = h('p', { class: 'note-muted wp-count-line', id: 'wp-count' }, icon('camera'), ' ', t('{k} of {n} walls have photos of the bare wall', { k: withPhotos, n }));
      if (actions) actions.before(line); else list.appendChild(line);
    } catch (e) { console.error(e); }
  };
  app.wallFinishSection = function (el, w) {
    const before = el.childElementCount;
    wallFinish.call(this, el, w);
    try {
      if (el.childElementCount === before) return;
      const box = el.lastElementChild, v = this.shownVersion();
      const faces = wallFaces(v.plan, w.storey).filter(f => f.wall.id === w.id);
      [...box.querySelectorAll('.face-row')].forEach((row, i) => {
        const f0 = faces[i];
        if (!f0) return;
        const f = roomFaces(v.plan, f0.room).find(x => x.wall.id === w.id && Math.abs(x.u0 - f0.u0) < 0.01) || f0;
        const k = wallPhotosOf(this.project, f).length;
        if (k) row.querySelector('.face-letter').after(h('span', { class: 'wp-mark', 'aria-label': t('{n} photos of the bare wall', { n: k }) }, icon('camera'), h('span', { class: 'num' }, String(k))));
      });
    } catch (e) { console.error(e); }
  };
}
