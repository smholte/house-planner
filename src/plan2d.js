/* ───────────── plan2d.js — the 2D drawing: SVG in metres, pan/zoom/pinch, drawing + editing tools ───────────── */

class PlanView extends Emitter {
  constructor(host, app, opts = {}) {
    super();
    this.app = app;
    this.host = host;
    this.opts = opts;
    this.cam = { s: 50, tx: 40, ty: 40 };
    this._animId = 0;
    this.spec = { entries: [], editable: false };
    this.pointers = new Map();
    this.gesture = null;
    this.chain = null;          // wall / room-corner chains
    this.hover = null;          // last pointer position (world) for previews
    this.measure = null;
    this.guides = [];
    this.snapMark = null;
    this.linked = [];

    this.svg = s('svg', { class: 'plan-svg', role: 'img', 'aria-label': 'Floor plan' });
    this.gGrid = s('g', { class: 'grid' });
    this.root = s('g');
    this.gContent = s('g');
    this.root.appendChild(this.gContent);
    this.gLabels = s('g', { class: 'labels' });
    this.gOverlay = s('g', { class: 'overlay' });
    this.svg.append(this.gGrid, this.root, this.gLabels, this.gOverlay);
    this.stamp = h('div', { class: 'stamp', hidden: true });
    this.scalebar = h('div', { class: 'scalebar' }, h('div', { class: 'scalebar-bar' }), h('span', { class: 'scalebar-label' }));
    this.host.append(this.svg, this.stamp, this.scalebar);

    this.svg.addEventListener('pointerdown', e => this.onDown(e));
    this.svg.addEventListener('pointermove', e => this.onMove(e));
    this.svg.addEventListener('pointerup', e => this.onUp(e));
    this.svg.addEventListener('pointercancel', e => this.onUp(e, true));
    this.svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.pointers.size) { this.hover = null; this.drawOverlay(); } });
    this.svg.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    this.svg.addEventListener('dblclick', e => { e.preventDefault(); this.finishChain(); });
    this.svg.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // no auto-scroll on middle click
    this.svg.addEventListener('contextmenu', e => e.preventDefault());
    this._applyCam = rafThrottle(() => this.applyCam());
    this.ro = new ResizeObserver(() => { this.updateSize(); });
    this.ro.observe(this.host);
    this.updateSize();
  }

  destroy() { if (this._pendingTap) clearTimeout(this._pendingTap.timer); this._animId++; this.ro.disconnect(); this.host.innerHTML = ''; }

  updateSize() {
    const r = this.host.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    this.svg.setAttribute('width', r.width);
    this.svg.setAttribute('height', r.height);
    this.applyCam();
  }

  /** what the view looks at (the world point in the middle and the zoom), to carry over to a new pane */
  viewState() { return { kind: '2d', c: this.toWorld([this.W / 2, this.H / 2]), s: this.cam.s }; }
  setViewState(st) {
    if (!st || st.kind !== '2d') return;
    this._animId++;
    const r = this.host.getBoundingClientRect();
    if (r.width) { this.W = r.width; this.H = r.height; this.svg.setAttribute('width', r.width); this.svg.setAttribute('height', r.height); }
    this.cam = { s: st.s, tx: this.W / 2 - st.c[0] * st.s, ty: this.H / 2 - st.c[1] * st.s };
    this.applyCam();
  }

  /* ───────── coordinates ───────── */
  toScreen(p) { return [p[0] * this.cam.s + this.cam.tx, p[1] * this.cam.s + this.cam.ty]; }
  toWorld(sp) { return [(sp[0] - this.cam.tx) / this.cam.s, (sp[1] - this.cam.ty) / this.cam.s]; }
  eventScreen(e) { const r = this.svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  get editEntry() { return this.spec.editable ? this.spec.entries.find(en => en.edit) : null; }
  entryAt(wp) {
    // which storey sheet is under this world point (matters for side-by-side)
    let best = null, bestD = Infinity;
    for (const en of this.spec.entries) {
      if (en.wallsOnly) continue;
      const bb = en.bbox;
      if (!bb) continue;
      const x = wp[0] - en.offset[0], y = wp[1] - en.offset[1];
      const dx = Math.max(bb.minX - x, 0, x - bb.maxX), dy = Math.max(bb.minY - y, 0, y - bb.maxY);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = en; }
    }
    return best;
  }
  local(en, wp) { return [wp[0] - en.offset[0], wp[1] - en.offset[1]]; }

  /* ───────── camera ───────── */
  setSpec(spec) { this.spec = spec; this.render(); }
  applyCam() {
    const { s: sc, tx, ty } = this.cam;
    this.root.setAttribute('transform', `matrix(${sc} 0 0 ${sc} ${tx} ${ty})`);
    this.drawGrid();
    this.drawLabels();
    this.drawOverlay();
    this.updateScalebar();
    for (const v of this.linked) { if (v._syncing) continue; v._syncing = true; v.cam = { ...this.cam }; v.applyCam(); v._syncing = false; }
  }
  zoomAt(sp, factor) {
    const before = this.toWorld(sp);
    this.cam.s = clamp(this.cam.s * factor, 4, 1200);
    this.cam.tx = sp[0] - before[0] * this.cam.s;
    this.cam.ty = sp[1] - before[1] * this.cam.s;
    this._applyCam();
  }
  /** On phones a menu (top) or the details sheet (bottom) can cover part of the view: move the drawing into the
   *  open part (shift=false: a linked pane follows the first one), and bring a selected room into view. */
  setInsets(top, bottom, focus, shift = true) {
    const old = this.insets || { top: 0, bottom: 0 };
    this.insets = { top, bottom };
    if (!shift || !this.W) return;
    let dy = ((top - bottom) - (old.top - old.bottom)) / 2;
    if (focus) {
      const c = this.toScreen([(focus.minX + focus.maxX) / 2, (focus.minY + focus.maxY) / 2])[1] + dy;
      const lo = top + 40, hi = this.H - bottom - 40;
      if (hi > lo && (c < lo || c > hi)) dy += (lo + hi) / 2 - c;
    }
    if (Math.abs(dy) < 0.5) return;
    const id = ++this._animId, ty0 = this.cam.ty, t0 = performance.now(), dur = 220;
    const stepFn = () => {
      if (id !== this._animId) return;
      const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      this.cam.ty = ty0 + dy * e;
      this.applyCam();
      if (k < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }

  /** pan (and zoom in if needed) so a plan point (of the edited storey) sits in the open part of the view with about
   *  `span` metres around it – a new piece of furniture you can grab */
  showPoint(lp, span = 1.6) {
    const en = this.spec.entries.find(x => x.edit) || this.spec.entries.find(x => !x.wallsOnly);
    if (!en || !this.W) return;
    const wp = [lp[0] + en.offset[0], lp[1] + en.offset[1]];
    const ins = this.insets || { top: 0, bottom: 0 };
    const openH = Math.max(80, this.H - ins.top - ins.bottom - 60);
    const need = Math.min(this.W - 40, Math.min(openH, 300)) / (span * 2);   // ≈ 90 px per metre on a phone
    const s = Math.max(this.cam.s, clamp(need, 4, 1200));
    const id = ++this._animId;
    const to = { s, tx: this.W / 2 - wp[0] * s, ty: ins.top + (this.H - ins.top - ins.bottom) / 2 - wp[1] * s };
    const from = { ...this.cam }, t0 = performance.now(), dur = 260;
    const step = now => {
      if (id !== this._animId) return;
      const k0 = Math.min(1, (now - t0) / dur), k = 1 - Math.pow(1 - k0, 3);
      Object.assign(this.cam, k0 >= 1 ? to : { s: from.s + (to.s - from.s) * k, tx: from.tx + (to.tx - from.tx) * k, ty: from.ty + (to.ty - from.ty) * k });
      this.applyCam();
      if (k0 < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** back to the whole drawing, gliding there */
  home() { this.fit(36, true); }

  fit(pad = 36, animate = false) {
    const pts = [];
    for (const en of this.spec.entries) {
      if (en.bbox) {
        pts.push([en.bbox.minX + en.offset[0], en.bbox.minY + en.offset[1]], [en.bbox.maxX + en.offset[0], en.bbox.maxY + en.offset[1]]);
      }
    }
    const bb = bboxOfPoints(pts) || { minX: -1, minY: -1, maxX: 11, maxY: 11, w: 12, h: 12 };
    const ins = this.insets || { top: 0, bottom: 0 };
    // room for the tool bar and the scale bar (and a sheet); a low pane side by side (a turned phone) uses all its height
    const tight = this.linked.length && this.H < 300;
    const padTop = (tight ? 14 : 64) + ins.top, padBottom = (tight ? 14 : 40) + ins.bottom;
    const W = Math.max(50, this.W - pad * 2), H = Math.max(50, this.H - padTop - padBottom - (this.spec.entries.length > 1 ? 24 : 0));
    const sc = clamp(Math.min(W / Math.max(bb.w, 1), H / Math.max(bb.h, 1)), 4, 400);
    const to = { s: sc, tx: (this.W - bb.w * sc) / 2 - bb.minX * sc, ty: padTop + (H - bb.h * sc) / 2 - bb.minY * sc + (this.spec.entries.length > 1 ? 24 : 0) };
    const id = ++this._animId;
    if (!animate) { Object.assign(this.cam, to); this.applyCam(); return; }
    // glide: move the world point at the middle of the screen and zoom geometrically
    const mid = [this.W / 2, this.H / 2], from = { ...this.cam };
    const c0 = [(mid[0] - from.tx) / from.s, (mid[1] - from.ty) / from.s], c1 = [(mid[0] - to.tx) / to.s, (mid[1] - to.ty) / to.s];
    const t0 = performance.now(), dur = 320;
    const step = now => {
      if (id !== this._animId) return;
      let k = Math.min(1, (now - t0) / dur);
      k = 1 - Math.pow(1 - k, 3);
      const s = from.s * Math.pow(to.s / from.s, k), c = V.lerp(c0, c1, k);
      Object.assign(this.cam, k >= 1 ? to : { s, tx: mid[0] - c[0] * s, ty: mid[1] - c[1] * s });
      this.applyCam();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  link(other) { if (!this.linked.includes(other)) this.linked.push(other); }

  drawGrid() {
    const g = this.gGrid;
    g.textContent = '';
    if (!this.W) return;
    const sc = this.cam.s;
    let step = 0.1;
    for (const st of [0.1, 0.5, 1, 5, 10]) { step = st; if (st * sc >= 9) break; }
    const major = step < 1 ? 1 : step * 5;
    const tl = this.toWorld([0, 0]), br = this.toWorld([this.W, this.H]);
    let minor = '', maj = '';
    const x0 = Math.floor(tl[0] / step) * step, y0 = Math.floor(tl[1] / step) * step;
    for (let x = x0; x <= br[0]; x += step) {
      const sx = Math.round(x * sc + this.cam.tx) + 0.5;
      const isMaj = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      (isMaj ? (maj += `M${sx} 0V${this.H}`) : (minor += `M${sx} 0V${this.H}`));
    }
    for (let y = y0; y <= br[1]; y += step) {
      const sy = Math.round(y * sc + this.cam.ty) + 0.5;
      const isMaj = Math.abs(y / major - Math.round(y / major)) < 1e-6;
      (isMaj ? (maj += `M0 ${sy}H${this.W}`) : (minor += `M0 ${sy}H${this.W}`));
    }
    g.append(s('path', { d: minor, class: 'grid-minor' }), s('path', { d: maj, class: 'grid-major' }));
  }

  updateScalebar() {
    const target = 90; // px
    const metres = target / this.cam.s;
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find(n => n >= metres * 0.6) || 50;
    this.scalebar.querySelector('.scalebar-bar').style.width = (nice * this.cam.s) + 'px';
    this.scalebar.querySelector('.scalebar-label').textContent = nice >= 1 ? nice + ' m' : (nice * 1000) + ' mm';
  }

  /* ───────── drawing ───────── */
  render() {
    const g = this.gContent;
    g.textContent = '';
    for (const en of this.spec.entries) {
      const eg = s('g', { transform: `translate(${en.offset[0]} ${en.offset[1]})`, class: 'entry' + (en.faded ? ' faded' : '') + (en.wallsOnly ? ' ghost' : '') });
      if (en.underlay && !en.wallsOnly) {
        const u = en.underlay;
        eg.appendChild(s('image', { href: u.url, x: u.x, y: u.y, width: u.w, height: u.h, opacity: u.opacity, preserveAspectRatio: 'none', class: 'underlay' }));
      }
      if (!en.wallsOnly && en.site) this.drawGarden(eg, en);
      if (!en.wallsOnly) this.drawRooms(eg, en);
      if (!en.wallsOnly) this.drawFinishes(eg, en);
      if (!en.wallsOnly) this.drawHeat(eg, en);
      if (!en.wallsOnly) this.drawStairs(eg, en);
      if (!en.wallsOnly) this.drawVoids(eg, en);
      if (!en.wallsOnly && en.fixtures && en.fixtures.length) this.drawFixtures(eg, en.fixtures);
      this.drawWalls(eg, en);
      if (!en.wallsOnly) this.drawOpenings(eg, en);
      if (!en.wallsOnly && en.furniture && en.furniture.length) this.drawFurniture(eg, en);
      g.appendChild(eg);
    }
    this.drawLabels();
    this.drawOverlay();
    this.updateNorth();
    const ed = this.editEntry || this.spec.entries[0];
    this.stamp.hidden = !this.spec.stamp;
    if (this.spec.stamp) {
      this.stamp.innerHTML = '';
      this.stamp.append(
        h('div', { class: 'stamp-row stamp-version' }, h('span', { class: 'stamp-k' }, this.spec.stamp.kind), this.spec.stamp.version),
        h('div', { class: 'stamp-row' }, h('span', { class: 'stamp-k' }, 'Storey'), this.spec.stamp.storey),
      );
    }
  }

  drawFixtures(g, list) {
    let dStair = '', dRoof = '', dShaft = '', dCross = '';
    for (const f of list) {
      const p = f.p;
      let d = 'M' + p[0] + ' ' + p[1];
      for (let i = 2; i < p.length; i += 2) d += 'L' + p[i] + ' ' + p[i + 1];
      if (f.k === 'stair') dStair += d + 'Z';
      else if (f.k === 'shaft') {
        // a shaft: filled, with a cross corner to corner
        dShaft += d + 'Z';
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
        if (p.length === 8) dCross += `M${x0} ${y0}L${x1} ${y1}M${x1} ${y0}L${x0} ${y1}`;
      } else dRoof += d;
    }
    if (dShaft) g.appendChild(s('path', { d: dShaft, class: 'fx-shaft' }));
    if (dCross) g.appendChild(s('path', { d: dCross, class: 'fx-shaft-x' }));
    if (dStair) g.appendChild(s('path', { d: dStair, class: 'fx-stair' }));
    if (dRoof) g.appendChild(s('path', { d: dRoof, class: 'fx-roof' }));
  }

  /** over the garden: a plain sheet under the walls too – through the door and window openings and over the cavity
   *  between the layers of an outside wall – so the lawn doesn't show in them */
  drawWallSheet(g, en) {
    const plan = en.plan, sid = en.storey.id, rings = [];
    for (const w of plan.walls) {
      if (w.storey !== sid) continue;
      const L = wallLen(w);
      if (L < 0.01) continue;
      const d = wallDir(w), n = V.perp(d), h = w.t / 2;
      const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => V.add(w.a, V.add(V.mul(d, u), V.mul(n, v))));
      rings.push(rect(-h, L + h, -h, h));
      if (w.kind === 'interior') continue;
      // the gap to the next layers, on either side
      for (const w2 of assemblyWalls(plan, w)) {
        const [a2, b2] = fxWallV({ o: w.a, d, n }, w2);
        const gap = a2 >= h - 0.001 ? [h - 0.001, a2 + 0.001] : b2 <= -h + 0.001 ? [b2 - 0.001, -h + 0.001] : null;
        if (!gap || gap[1] - gap[0] > 0.3) continue;
        const ua = V.dot(V.sub(w2.a, w.a), d), ub = V.dot(V.sub(w2.b, w.a), d);
        // (a little past the ends, so the corner where two cavities meet is covered too)
        const k = Math.min(0.05, gap[1] - gap[0]);
        const u0 = Math.max(-h, Math.min(ua, ub)) - k, u1 = Math.min(L + h, Math.max(ua, ub)) + k;
        if (u1 - u0 > 0.01 + 2 * k) rings.push(rect(u0, u1, gap[0], gap[1]));
      }
    }
    if (rings.length) g.appendChild(s('path', { d: rings.map(r => 'M' + r.map(p => p[0].toFixed(4) + ' ' + p[1].toFixed(4)).join('L') + 'Z').join(''), class: 'room-under wall-sheet' }));
  }

  drawRooms(g, en) {
    const colorBy = this.spec.colorBy || 'floor';
    const sel = this.spec.selection;
    const changed = en.diff ? en.diff.changedRoomIds : null;
    if (en.site) this.drawWallSheet(g, en);
    for (const r of en.plan.rooms) {
      if (r.storey !== en.storey.id) continue;
      const pts = r.poly.map(p => p.join(',')).join(' ');
      let fill = 'none';
      if (colorBy === 'floor') fill = r.floor ? this.floorFill(r) : 'none';
      else if (colorBy === 'walls') fill = r.wallColor || 'none';
      else if (colorBy === 'progress') { const f = this.app.project ? roomProgress(tasksOf(this.app.project), r.id) : null; fill = f == null || !roomCounted(r) ? 'none' : progressColor(f); }
      const holes = roomHoles(en.plan, r);
      // over the garden: the room's floor on a plain sheet, not on the lawn
      if (en.site && !holes.length) g.appendChild(s('polygon', { points: pts, class: 'room-under' }));
      if (holes.length) {
        // the stairwell is open: no floor colour over it
        const ring = pl => 'M' + pl.map(p => p.join(',')).join('L') + 'Z';
        g.appendChild(s('path', { d: ring(r.poly) + holes.map(ring).join(''), 'fill-rule': 'evenodd', class: 'room' + (colorBy === 'none' ? ' plain' : ''), fill, 'data-room': r.id }));
      } else g.appendChild(s('polygon', { points: pts, class: 'room' + (colorBy === 'none' ? ' plain' : ''), fill, 'data-room': r.id }));
      if (sel && sel.type === 'room' && sel.id === r.id && en.edit !== false) g.appendChild(s('polygon', { points: pts, class: 'sel-room' }));
    }
    if (en.diff) {
      for (const r of en.diff.rooms.removed) {
        if (r.storey !== en.storey.id) continue;
        // a room that no longer exists: outline only
        g.appendChild(s('polygon', { points: r.poly.map(p => p.join(',')).join(' '), class: 'room-removed' }));
      }
    }
  }

  drawWalls(g, en) {
    const plan = en.plan, sid = en.storey.id;
    const sel = this.spec.selection;
    const diff = en.diff;
    const newByWall = new Map();
    if (diff) for (const p of diff.newParts) if (p.wall.storey === sid) { if (!newByWall.has(p.wall.id)) newByWall.set(p.wall.id, []); newByWall.get(p.wall.id).push([p.s, p.e]); }
    let dExt = '', dInt = '', dNew = '', dIns = '', dLoad = '';
    const poly = pts => 'M' + pts.map(p => p[0].toFixed(4) + ' ' + p[1].toFixed(4)).join('L') + 'Z';
    // load-bearing walls hatched (View → "Load-bearing walls"), not on printed plans
    const showLoad = this.app.settings.loadWalls !== false && !this.spec.print && !en.wallsOnly;
    for (const w of plan.walls) {
      if (w.storey !== sid) continue;
      const parts = wallParts(w, openingsOf(plan, w.id));
      if (showLoad && w.load === true) for (const [a, b] of parts.solids) if (b - a > 0.001) dLoad += poly(wallPiecePoly(w, a, b, parts.L));
      const news = newByWall.get(w.id) || [];
      for (const [a, b] of parts.solids) {
        const same = subtractIntervals([a, b], news.map(([x, y]) => [x - 0.0005, y + 0.0005]));
        // subtractIntervals drops tiny bits; keep the exact remaining pieces
        for (const [x, y] of same) { const d = poly(wallPiecePoly(w, x, y, parts.L)); if (w.kind === 'exterior') dExt += d; else if (w.kind === 'insulation') dIns += d; else dInt += d; }
        for (const [x, y] of news) {
          const s0 = Math.max(x, a), e0 = Math.min(y, b);
          if (e0 - s0 > 0.001) dNew += poly(wallPiecePoly(w, s0, e0, parts.L));
        }
        if (!news.length && !same.length && b - a > 0) { const d = poly(wallPiecePoly(w, a, b, parts.L)); if (w.kind === 'exterior') dExt += d; else if (w.kind === 'insulation') dIns += d; else dInt += d; }
      }
    }
    if (dIns) g.appendChild(s('path', { d: dIns, class: 'wall wall-ins' }));
    if (dInt) g.appendChild(s('path', { d: dInt, class: 'wall wall-int' }));
    if (dExt) g.appendChild(s('path', { d: dExt, class: 'wall wall-ext' }));
    if (dNew) g.appendChild(s('path', { d: dNew, class: 'wall wall-new' }));
    if (dLoad) {
      if (!this.svg.querySelector('#load-hatch')) {
        const defs = this.svg.querySelector('defs') || this.svg.insertBefore(s('defs'), this.svg.firstChild);
        const pat = s('pattern', { id: 'load-hatch', patternUnits: 'userSpaceOnUse', width: 0.07, height: 0.07, patternTransform: 'rotate(45)' });
        pat.appendChild(s('line', { x1: 0, y1: 0, x2: 0, y2: 0.07, class: 'load-hatch-line' }));
        defs.appendChild(pat);
      }
      g.appendChild(s('path', { d: dLoad, class: 'wall-load-hatch' }));
    }
    if (diff) {
      let dDemo = '';
      for (const p of diff.demoParts) if (p.wall.storey === sid) dDemo += poly(wallPiecePoly(p.wall, p.s, p.e, p.L));
      if (dDemo) g.appendChild(s('path', { d: dDemo, class: 'wall wall-demo' }));
    }
    if (sel && sel.type === 'wall' && en.edit) {
      const w = plan.walls.find(x => x.id === sel.id);
      if (w) {
        const L = wallLen(w);
        g.appendChild(s('path', { d: poly(wallPiecePoly(w, 0, L, L)), class: 'sel-wall' }));
      }
    }
  }

  openingPath(plan, op, closed = false) {
    const w = plan.walls.find(x => x.id === op.wall);
    if (!w) return null;
    const d = wallDir(w), n = V.perp(d), t2 = w.t / 2;
    const p0 = V.add(w.a, V.mul(d, op.pos - op.w / 2));
    const p1 = V.add(w.a, V.mul(d, op.pos + op.w / 2));
    const f = (p) => p[0].toFixed(4) + ' ' + p[1].toFixed(4);
    let jamb = `M${f(V.add(p0, V.mul(n, t2)))}L${f(V.sub(p0, V.mul(n, t2)))}M${f(V.add(p1, V.mul(n, t2)))}L${f(V.sub(p1, V.mul(n, t2)))}`;
    let sym = '', glass = null, dash = '';
    // sliding, pocket, folding and glass doors; window types
    const X = styledOpeningPath(op, w, p0, p1, d, n, t2, closed, f);
    if (X) return { jamb, sym: X.sym, glass: X.glass, dash: X.dash, p0, p1, wall: w };
    if (op.kind === 'door' && closed) {
      // a closed door: the leaf in the opening, the swing dashed
      const side = op.swing === 'right' ? V.mul(n, -1) : n, k = t2 * 0.6;
      sym = `M${f(V.add(p0, V.mul(side, k)))}L${f(V.add(p1, V.mul(side, k)))}`;
      const halves = op.leaves === 2 ? [[p0, V.lerp(p0, p1, 0.5), op.w / 2], [p1, V.lerp(p0, p1, 0.5), op.w / 2]] : [[op.hinge === 'end' ? p1 : p0, op.hinge === 'end' ? p0 : p1, op.w]];
      for (const [hg, o, r] of halves) {
        const hf = V.add(hg, V.mul(side, t2)), of = V.add(o, V.mul(side, t2)), leaf = V.add(hf, V.mul(side, r));
        const cross = V.cross(V.sub(leaf, hf), V.sub(of, hf));
        dash += `M${f(leaf)}A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${f(of)}`;
      }
    } else if (op.kind === 'door' && op.leaves === 2) {
      // a double door: a leaf from each jamb, meeting in the middle
      const side = op.swing === 'right' ? V.mul(n, -1) : n, hw = op.w / 2;
      const mid = V.lerp(p0, p1, 0.5);
      for (const [hg, o] of [[p0, mid], [p1, mid]]) {
        const hf = V.add(hg, V.mul(side, t2)), of = V.add(o, V.mul(side, t2)), leaf = V.add(hf, V.mul(side, hw));
        const cross = V.cross(V.sub(leaf, hf), V.sub(of, hf));
        sym += `M${f(hf)}L${f(leaf)}A${hw} ${hw} 0 0 ${cross > 0 ? 1 : 0} ${f(of)}`;
      }
    } else if (op.kind === 'door') {
      const hinge = op.hinge === 'end' ? p1 : p0;
      const other = op.hinge === 'end' ? p0 : p1;
      const side = op.swing === 'right' ? V.mul(n, -1) : n;
      const hf = V.add(hinge, V.mul(side, t2));
      const of = V.add(other, V.mul(side, t2));
      const leaf = V.add(hf, V.mul(side, op.w));
      const cross = V.cross(V.sub(leaf, hf), V.sub(of, hf));
      sym = `M${f(hf)}L${f(leaf)}A${op.w} ${op.w} 0 0 ${cross > 0 ? 1 : 0} ${f(of)}`;
    } else if (op.kind === 'window') {
      const k = t2 * 0.35;
      sym = `M${f(V.add(p0, V.mul(n, k)))}L${f(V.add(p1, V.mul(n, k)))}M${f(V.sub(p0, V.mul(n, k)))}L${f(V.sub(p1, V.mul(n, k)))}`;
      glass = [V.add(p0, V.mul(n, t2)), V.add(p1, V.mul(n, t2)), V.sub(p1, V.mul(n, t2)), V.sub(p0, V.mul(n, t2))];
    } else {
      sym = `M${f(p0)}L${f(p1)}`;
    }
    return { jamb, sym, glass, dash, p0, p1, wall: w };
  }

  drawOpenings(g, en) {
    const plan = en.plan;
    const sel = this.spec.selection;
    const newIds = en.diff ? new Set(en.diff.newOpenings.map(o => o.op.id)) : null;
    for (const op of plan.openings) {
      const w = plan.walls.find(x => x.id === op.wall);
      if (!w || w.storey !== en.storey.id) continue;
      const closed = op.kind === 'door' && this.app.isDoorClosed && this.app.isDoorClosed(op.id);
      const P = this.openingPath(plan, op, closed);
      const cls = 'op op-' + op.kind + (newIds && newIds.has(op.id) ? ' op-new' : '') + (closed ? ' op-closed' : '');
      const gg = s('g', { class: cls, 'data-op': op.id });
      if (P.glass) gg.appendChild(s('polygon', { points: P.glass.map(p => p.join(',')).join(' '), class: 'op-glass' }));
      gg.appendChild(s('path', { d: P.jamb, class: 'op-jamb' }));
      gg.appendChild(s('path', { d: P.sym, class: 'op-sym' + (op.kind === 'opening' ? ' op-gap' : '') }));
      if (P.dash) gg.appendChild(s('path', { d: P.dash, class: 'op-sym op-swing' }));
      g.appendChild(gg);
      if (sel && sel.type === 'opening' && sel.id === op.id && en.edit) {
        const n = V.perp(wallDir(w)), t2 = w.t / 2 + 0.03;
        const box = [V.add(P.p0, V.mul(n, t2)), V.add(P.p1, V.mul(n, t2)), V.sub(P.p1, V.mul(n, t2)), V.sub(P.p0, V.mul(n, t2))];
        g.appendChild(s('polygon', { points: box.map(p => p.join(',')).join(' '), class: 'sel-op' }));
      }
    }
    if (en.diff && en.basePlan) {
      for (const o of en.diff.removedOpenings) {
        if (o.wall.storey !== en.storey.id) continue;
        const P = this.openingPath(en.basePlan, o.op);
        if (!P) continue;
        const gg = s('g', { class: 'op op-removed op-' + o.op.kind });
        gg.appendChild(s('path', { d: P.jamb + P.sym, class: 'op-sym' }));
        g.appendChild(gg);
      }
    }
  }

  drawLabels() {
    const g = this.gLabels;
    g.textContent = '';
    if (!this.W) return;
    // the electrics first: room names and the dimension numbers you tap to type a size stay on top of them
    this.drawInstalls(g);
    const sc = this.cam.s;
    const showLabels = this.spec.labels !== false;
    for (const en of this.spec.entries) {
      if (en.wallsOnly) continue;
      const off = en.offset;
      if (this.spec.entries.filter(x => !x.wallsOnly).length > 1 && en.bbox) {
        const p = this.toScreen([en.bbox.minX + off[0], en.bbox.minY + off[1]]);
        g.appendChild(s('text', { x: p[0], y: p[1] - 14, class: 'sheet-label' }, en.label || en.storey.name));
      }
      if (showLabels) this.drawVoidLabels(g, en, off);
      if (showLabels && sc > 9) {
        // normal labels first; small-room labels after, and only where they don't run into another label
        const items = [];
        for (const r of en.plan.rooms) {
          if (r.storey !== en.storey.id) continue;
          const lp = labelPoint(r.poly, roomHoles(en.plan, r));
          const p = this.toScreen([lp[0] + off[0], lp[1] + off[1]]);
          const bb = bboxOfPoints(r.poly);
          let roomPx = Math.min(bb.w, bb.h) * sc, tiny = false;
          // a narrow room (meterkast, cupboard) still gets its name, smaller, when the name fits across it
          if (roomPx < 34) { if (bb.w * sc + 14 >= r.name.length * 5.4 && bb.h * sc >= 12) tiny = true; else continue; }
          const charW = tiny ? 5.4 : roomPx < 70 ? 6.6 : 7.6;
          const w = r.name.length * charW + 4, hgt = tiny ? 12 : roomPx >= 52 ? 30 : 16;
          items.push({ r, p, roomPx, tiny, rect: [p[0] - w / 2, p[1] - hgt / 2, p[0] + w / 2, p[1] + hgt / 2] });
        }
        items.sort((a, b) => (a.tiny - b.tiny) || (roomArea(b.r) - roomArea(a.r)));
        const placed = [];
        const hits = q => placed.some(o => q[0] < o[2] && q[2] > o[0] && q[1] < o[3] && q[3] > o[1]);
        for (const { r, p, roomPx, tiny, rect } of items) {
          if (tiny && hits(rect)) continue;
          placed.push(rect);
          const isChanged = en.diff && en.diff.changedRoomIds.has(r.id);
          const t = s('text', { x: p[0], y: p[1] + (tiny ? 4 : 0), class: 'room-label' + (tiny ? ' tiny' : roomPx < 70 ? ' small' : '') + (isChanged ? ' changed' : '') });
          t.appendChild(s('tspan', { x: p[0], dy: '-0.15em', class: 'rl-name' }, isChanged ? s('tspan', { class: 'rl-dot' }, '● ') : null, r.name));
          const prog = this.spec.colorBy === 'progress' && this.app.project && roomCounted(r) ? roomProgress(tasksOf(this.app.project), r.id) : null;
          if (!tiny && roomPx >= 52) t.appendChild(s('tspan', { x: p[0], dy: '1.25em', class: 'rl-area' + (prog != null ? ' rl-prog' : '') }, prog != null ? Math.round(prog * 100) + ' %' : fmtArea(roomArea(r))));
          g.appendChild(t);
        }
      }
      if (en.site && showLabels) this.drawGardenLabels(g, en, off);
      // dimension lines: the selected wall always, all walls when "Wall lengths" is on
      this.drawDimChains(g, en, off);
    }
    if (this.measure && this.measure.a) {
      const b = this.measure.b || this.hover;
      if (b) this.dimLabel(g, this.measure.a, b, this.measure.offset || [0, 0], 0, true, true);
    }
    this.drawFaceLabels(g);
    this.drawModeLabels(g);
  }

  dimLabel(g, a, b, off, outward, strong, measure) {
    const L = V.dist(a, b);
    if (L < 0.05) return;
    const pa = this.toScreen([a[0] + off[0], a[1] + off[1]]), pb = this.toScreen([b[0] + off[0], b[1] + off[1]]);
    let n = V.perp(V.norm(V.sub(pb, pa)));
    const offPx = outward * this.cam.s + (measure ? 0 : 12);
    const m = V.lerp(pa, pb, 0.5);
    const lp = V.add(m, V.mul(n, -offPx - (measure ? 14 : 0)));
    if (measure) {
      g.appendChild(s('line', { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], class: 'measure-line' }));
      for (const p of [pa, pb]) g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 3.5, class: 'measure-end' }));
    }
    let ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const txt = measure ? fmtMM(L) + ' mm' : fmtMM(L);
    g.appendChild(s('text', { x: lp[0], y: lp[1], transform: `rotate(${ang.toFixed(1)} ${lp[0]} ${lp[1]})`, class: 'dim-label' + (strong ? ' strong' : '') }, txt));
  }

  /* overlay: handles, previews, snap marker, guides (screen space) */
  drawOverlay() {
    const g = this.gOverlay;
    g.textContent = '';
    this.drawModeOverlay(g);
    const en = this.editEntry;
    if (!en) return;
    const sel = this.spec.selection;
    const tool = this.app.tool;
    for (const gd of this.guides) {
      const a = this.toScreen(gd.a), b = this.toScreen(gd.b);
      g.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'guide' }));
    }
    // several selected: an outline around each; the box being drawn
    if (sel && sel.type === 'multi') this.drawMultiOverlay(g, en, sel);
    if (this.drag && this.drag.kind === 'box' && this.drag.started) {
      const a = this.toScreen(this.drag.a), b = this.toScreen(this.drag.b);
      g.appendChild(s('rect', { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), class: 'sel-box' }));
    }
    if (tool === 'select' && sel && this.spec.editable) {
      for (const hd of this.handles()) {
        const p = this.toScreen(hd.p);
        g.appendChild(s('circle', { cx: p[0], cy: p[1], r: hd.small ? 5 : 7, class: 'handle' }));
      }
    }
    // chain preview
    if (this.chain && this.chain.pts.length) {
      const pts = this.chain.pts.map(p => this.toScreen(p));
      const live = this.chain.preview ? this.toScreen(this.chain.preview) : null;
      if (this.chain.type === 'void') {
        const a = pts[0];
        for (const p of pts) g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 4, class: 'chain-pt' }));
        if (live) {
          g.appendChild(s('rect', { x: Math.min(a[0], live[0]), y: Math.min(a[1], live[1]), width: Math.abs(live[0] - a[0]), height: Math.abs(live[1] - a[1]), class: 'chain-void' }));
          const w = Math.abs(this.chain.preview[0] - this.chain.pts[0][0]), d = Math.abs(this.chain.preview[1] - this.chain.pts[0][1]);
          g.appendChild(s('text', { x: (a[0] + live[0]) / 2, y: Math.min(a[1], live[1]) - 8, class: 'dim-label strong live' }, fmtMM(w) + ' × ' + fmtMM(d)));
        }
      } else if (this.chain.type === 'room' || this.chain.type === 'garea' || this.chain.type === 'gline') {
        const all = live ? [...pts, live] : pts;
        g.appendChild(s('polyline', { points: all.map(p => p.join(',')).join(' '), class: 'chain-room' }));
        for (const p of pts) g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 4, class: 'chain-pt' }));
      } else {
        const last = pts[pts.length - 1];
        for (const p of pts) g.appendChild(s('circle', { cx: p[0], cy: p[1], r: 4, class: 'chain-pt' }));
        if (live) {
          const t = (this.app.toolOpts.wallT || 0.1) * this.cam.s;
          g.appendChild(s('line', { x1: last[0], y1: last[1], x2: live[0], y2: live[1], class: 'chain-wall', 'stroke-width': Math.max(2, t) }));
          const L = V.dist(this.chain.pts[this.chain.pts.length - 1], this.chain.preview);
          const m = V.lerp(last, live, 0.5);
          g.appendChild(s('text', { x: m[0], y: m[1] - Math.max(10, t / 2 + 8), class: 'dim-label strong live' }, fmtMM(L)));
        }
      }
    }
    if (this.drag && this.drag.preview) {
      const a = this.toScreen(this.drag.preview.a), b = this.toScreen(this.drag.preview.b);
      const t = (this.app.toolOpts.wallT || 0.1) * this.cam.s;
      g.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'chain-wall', 'stroke-width': Math.max(2, t) }));
      const m = V.lerp(a, b, 0.5);
      g.appendChild(s('text', { x: m[0], y: m[1] - Math.max(10, t / 2 + 8), class: 'dim-label strong live' }, fmtMM(V.dist(this.drag.preview.a, this.drag.preview.b))));
    }
    if (this.calib && this.calib.pts.length) {
      for (const p of this.calib.pts) { const q = this.toScreen(p); g.appendChild(s('circle', { cx: q[0], cy: q[1], r: 6, class: 'calib-pt' })); }
      if (this.calib.pts.length === 1 && this.hover) { const a = this.toScreen(this.calib.pts[0]), b = this.toScreen(this.hover); g.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'measure-line' })); }
    }
    if (this.stairStart && this.app.tool === 'stair') {
      const q = this.toScreen(this.stairStart);
      g.appendChild(s('circle', { cx: q[0], cy: q[1], r: 6, class: 'chain-pt' }));
      if (this.hover) { const b = this.toScreen(this.local(en, this.hover)); g.appendChild(s('line', { x1: q[0], y1: q[1], x2: b[0], y2: b[1], class: 'measure-line' })); }
    }
    if (this.snapMark) {
      const p = this.toScreen(this.snapMark.p);
      const cls = 'snap snap-' + this.snapMark.kind;
      g.appendChild(this.snapMark.kind === 'end' ? s('rect', { x: p[0] - 5, y: p[1] - 5, width: 10, height: 10, class: cls }) : s('circle', { cx: p[0], cy: p[1], r: 4, class: cls }));
    }
  }

  handles() {
    const en = this.editEntry, sel = this.spec.selection;
    if (!en || !sel) return [];
    const plan = en.plan;
    if (sel.type === 'wall') {
      const w = plan.walls.find(x => x.id === sel.id);
      if (!w) return [];
      return [{ kind: 'wall-a', p: w.a }, { kind: 'wall-b', p: w.b }];
    }
    if (sel.type === 'room') {
      const r = plan.rooms.find(x => x.id === sel.id);
      if (!r) return [];
      return r.poly.map((p, i) => ({ kind: 'room-v', i, p, small: true }));
    }
    if (sel.type === 'garea' || sel.type === 'gline' || sel.type === 'plot') return this.gardenHandles(sel, en);
    if (sel.type === 'void') { const vd = (plan.voids || []).find(x => x.id === sel.id); return vd ? vd.poly.map((p, i) => ({ kind: 'void-v', i, p, small: true })) : []; }
    return [];
  }

  /* ───────── hit testing (plan coordinates of the edit entry) ───────── */
  hit(p, en) {
    const tol = 10 / this.cam.s;
    const plan = en.plan, sid = en.storey.id;
    let best = null;
    for (const op of plan.openings) {
      const w = plan.walls.find(x => x.id === op.wall);
      if (!w || w.storey !== sid) continue;
      const d = wallDir(w);
      const p0 = V.add(w.a, V.mul(d, op.pos - op.w / 2)), p1 = V.add(w.a, V.mul(d, op.pos + op.w / 2));
      const pr = projectOnSegment(p, p0, p1);
      if (pr.d < Math.max(w.t / 2 + 0.04, tol)) return { type: 'opening', id: op.id };
    }
    for (const w of plan.walls) {
      if (w.storey !== sid) continue;
      const pr = projectOnSegment(p, w.a, w.b);
      const lim = Math.max(w.t / 2 + 0.01, tol);
      if (pr.d < lim && (!best || pr.d < best.d)) best = { type: 'wall', id: w.id, d: pr.d };
    }
    if (best) return { type: best.type, id: best.id };
    // a floor opening (Build): it lies over the room
    if (this.spec.mode === 'build' || !this.spec.mode) { const vh = this.voidHit(p, en); if (vh) return vh; }
    // smallest room containing the point
    let room = null, area = Infinity;
    for (const r of plan.rooms) {
      if (r.storey !== sid) continue;
      if (pointInPolygon(p, r.poly)) { const a = roomArea(r); if (a < area) { area = a; room = r; } }
    }
    if (room) return { type: 'room', id: room.id };
    return null;
  }

  hitHandle(sp, pointerType) {
    const r = pointerType === 'mouse' ? 11 : 22;
    let best = null, bd = r;
    for (const hd of this.handles()) {
      const d = V.dist(this.toScreen(hd.p), sp);
      if (d < bd) { bd = d; best = hd; }
    }
    return best;
  }

  /* ───────── snapping ───────── */
  snap(p, opt = {}) {
    const en = this.editEntry;
    this.guides = [];
    if (!en) return { p, kind: 'free' };
    const tol = 14 / this.cam.s;
    const grid = this.app.settings.grid || 0;
    const walls = en.plan.walls.filter(w => w.storey === en.storey.id && !(opt.exclude || []).includes(w.id));
    // 1. endpoints
    let best = null;
    for (const w of walls) for (const q of [w.a, w.b]) {
      if (opt.skipPoint && V.eq(q, opt.skipPoint)) continue;
      const d = V.dist(p, q);
      if (d < tol && (!best || d < best.d)) best = { p: [...q], d, kind: 'end' };
    }
    if (best) return best;
    let q = [...p], kind = 'grid';
    let locked = null;
    // 2. angle lock from the previous point (0/45/90°)
    if (opt.from) {
      const v = V.sub(p, opt.from);
      const len = V.len(v);
      if (len > 1e-6) {
        const ang = Math.atan2(v[1], v[0]);
        const sa = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        if (Math.abs(ang - sa) < 6 * Math.PI / 180) {
          let l2 = grid ? Math.max(grid, round(len, grid)) : len;
          locked = [Math.cos(sa), Math.sin(sa)];
          q = V.add(opt.from, V.mul(locked, l2));
          kind = 'angle';
        }
      }
    }
    // 3. onto a wall line (T-junctions)
    for (const w of walls) {
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.d < tol * 0.8 && pr.t > 0.001 && pr.t < 0.999) {
        if (locked) {
          // intersect the locked ray with the wall line
          const d = V.sub(w.b, w.a), den = V.cross(locked, d);
          if (Math.abs(den) > 1e-6) {
            const tt = V.cross(V.sub(w.a, opt.from), d) / den;
            if (tt > 0) { q = V.add(opt.from, V.mul(locked, tt)); kind = 'line'; }
          }
        } else {
          q = pr.point;
          if (grid) {
            // keep it on the line but put it on the grid along the line
            const L = wallLen(w), along = round(pr.along, grid);
            q = V.add(w.a, V.mul(wallDir(w), clamp(along, 0, L)));
          }
          kind = 'line';
        }
        break;
      }
    }
    if (kind === 'grid' && grid) q = [round(q[0], grid), round(q[1], grid)];
    // 4. line up with existing corners (x / y guides)
    if (kind !== 'line') {
      const axisLockedX = locked && Math.abs(locked[0]) < 1e-6;   // vertical move → x fixed
      const axisLockedY = locked && Math.abs(locked[1]) < 1e-6;   // horizontal move → y fixed
      let gx = null, gy = null;
      for (const w of walls) for (const c of [w.a, w.b]) {
        if (opt.skipPoint && V.eq(c, opt.skipPoint)) continue;
        if (!axisLockedX && (!locked || axisLockedY) && Math.abs(c[0] - q[0]) < tol * 0.6 && (!gx || Math.abs(c[0] - q[0]) < Math.abs(gx[0] - q[0]))) gx = c;
        if (!axisLockedY && (!locked || axisLockedX) && Math.abs(c[1] - q[1]) < tol * 0.6 && (!gy || Math.abs(c[1] - q[1]) < Math.abs(gy[1] - q[1]))) gy = c;
      }
      if (gx) { q[0] = gx[0]; this.guides.push({ a: [gx[0], gx[1]], b: [gx[0], q[1]] }); }
      if (gy) { q[1] = gy[1]; this.guides.push({ a: [gy[0], gy[1]], b: [q[0], gy[1]] }); }
    }
    return { p: q, kind };
  }

  /* ───────── pointer handling ───────── */
  onWheel(e) {
    e.preventDefault();
    this._animId++;
    const sp = this.eventScreen(e);
    const k = e.ctrlKey ? 0.01 : 0.0015;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 30;
    this.zoomAt(sp, Math.exp(-dy * k));
  }

  onDown(e) {
    this._animId++;
    // a new first finger: no other finger is down any more – forget any whose lifting we never saw (the phone took the
    // touch, e.g. for a screenshot), or this one would count as the second finger of a pinch
    if (e.isPrimary && this.pointers.size) for (const id of [...this.pointers.keys()]) if (id !== e.pointerId) this.onUp({ pointerId: id, pointerType: e.pointerType }, true);
    try { this.svg.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer */ }
    const sp = this.eventScreen(e);
    this.pointers.set(e.pointerId, { sp, start: sp, t: performance.now() });
    if (this.pointers.size === 2) {
      // second finger: pinch / two-finger pan; drop whatever one finger was doing
      if (this.drag && this.drag.kind === 'draw-wall') this.drag = null;
      if (this.drag && this.drag.started) this.app.endGesture();
      this.drag = null;
      this.gesture = { kind: 'pinch', ...this.pinchState(), cam: { ...this.cam } };
      if (this.app.barsAway) this.app.barsAway(true);
      this.drawOverlay();
      return;
    }
    if (this.pointers.size > 2) return;
    // right click on a walking-path point deletes it
    if (e.button === 2 && this.spec.mode === 'view' && this.app.tool === 'path') {
      const n = this.nodeAt(sp, this.spec.entries.find(x => x.edit && !x.wallsOnly));
      if (n) { this.app.deletePathNode(n.id); return; }
    }
    const mid = e.button === 1 || e.button === 2 || (this.app.spaceDown && e.pointerType === 'mouse');
    const wp = this.toWorld(sp);
    this.hover = wp;
    if (mid) { this.gesture = { kind: 'pan', sp, cam: { ...this.cam }, button: e.button }; return; }
    this.gesture = { kind: 'press', sp, wp, moved: false };
    this._ptype = e.pointerType;
    // a dimension number: tap to type a new size
    const dimEl = e.target && e.target.closest ? e.target.closest('[data-dimv]') : null;
    if (dimEl && this.spec.mode === 'build' && this.spec.editable && this.app.tool === 'select') { this.gesture.dim = dimEl.getAttribute('data-dimv'); return; }
    if (this.spec.mode && this.spec.mode !== 'build') { this.modeDown(e, sp, wp); return; }
    const en = this.editEntry;
    const tool = this.app.tool;
    if (en && this.spec.editable) {
      const p = this.local(en, wp);
      if (tool === 'select') {
        const several = e.shiftKey || this.app.multiBuild;
        if (!several) { const hd = this.hitHandle(sp, e.pointerType); if (hd) { this.startHandleDrag(hd, en); return; } }
        // several at once: taps add or remove, a drag on a selected one moves them all, on empty space draws a box
        {
          const sel = this.spec.selection;
          const ptH = this.pointAt(sp, en), stH = !ptH && this.stairAt ? this.stairAt(p, en) : null;
          const hit = ptH ? { type: 'point', id: ptH.id } : stH ? { type: 'stair', id: stH.id } : this.hit(p, en);
          const inMulti = hit && sel && sel.type === 'multi' && sel.items.some(x => x.type === hit.type && x.id === hit.id);
          if (several) {
            this.gesture.multiTap = hit || false;
            if (inMulti) this.drag = this.app.multiDrag(en, p);
            else this.drag = { kind: 'box', a: p, b: p, started: false };
            return;
          }
          if (inMulti) { this.gesture.multiTap = { solo: hit }; this.drag = this.app.multiDrag(en, p); return; }
          if (stH) {
            if (!(sel && sel.type === 'stair' && sel.id === stH.id)) this.app.select({ type: 'stair', id: stH.id });
            this.drag = this.app.multiDrag(en, p); this.drag.single = true;
            return;
          }
        }
        // electrics sit on top of walls and rooms
        const pt = this.pointAt(sp, en);
        if (pt) {
          const sel = this.spec.selection;
          if (!(sel && sel.type === 'point' && sel.id === pt.id)) this.app.select({ type: 'point', id: pt.id });
          this.drag = { kind: 'body', type: 'point', id: pt.id, started: false };
          return;
        }
        const hit = this.hit(p, en) || (en.site ? this.gardenHit(p, en, true) : null);
        // on touch a room is selected by the tap itself (see onTap), so a double tap can go home instead
        if (hit && !(hit.type === 'room' && e.pointerType !== 'mouse')) {
          const sel = this.spec.selection;
          const already = sel && sel.type === hit.type && sel.id === hit.id;
          if (!already) this.app.select(hit);
          // remembered for the tap that follows (touch taps run 300 ms late, after the details panel has resized the
          // view): one tap = one pick, a wall never falls through to the room under it
          if (hit.type !== 'room') this.gesture.downHit = hit;
          if (hit.type !== 'room') this.prepareBodyDrag(hit, en, p);
          return;
        }
      } else if (tool === 'wall' && !this.calib) {
        const sn = this.snap(p, {});
        this.drag = { kind: 'draw-wall', startP: sn.p, started: false };
        return;
      }
    }
  }

  pinchState() {
    const pts = [...this.pointers.values()].map(p => p.sp);
    return { mid: V.lerp(pts[0], pts[1], 0.5), dist: V.dist(pts[0], pts[1]) || 1 };
  }

  onMove(e) {
    const sp = this.eventScreen(e);
    const pt = this.pointers.get(e.pointerId);
    if (pt) pt.sp = sp;
    const wp = this.toWorld(sp);
    this.hover = wp;
    const en = this.editEntry;
    if (this.gesture && this.gesture.kind === 'pinch' && this.pointers.size >= 2) {
      const st = this.pinchState();
      const g = this.gesture;
      const sc = clamp(g.cam.s * st.dist / g.dist, 4, 1200);
      const wMid = [(g.mid[0] - g.cam.tx) / g.cam.s, (g.mid[1] - g.cam.ty) / g.cam.s];
      this.cam.s = sc;
      this.cam.tx = st.mid[0] - wMid[0] * sc;
      this.cam.ty = st.mid[1] - wMid[1] * sc;
      this._applyCam();
      return;
    }
    if (this.gesture && this.gesture.kind === 'pan') {
      const g = this.gesture;
      this.cam.tx = g.cam.tx + sp[0] - g.sp[0];
      this.cam.ty = g.cam.ty + sp[1] - g.sp[1];
      this._applyCam();
      return;
    }
    if (this.gesture && this.gesture.kind === 'press') {
      const g = this.gesture;
      const far = V.dist(sp, g.sp) > (e.pointerType === 'mouse' ? 4 : 8);
      if (far && !g.moved) {
        g.moved = true;
        if (e.pointerType !== 'mouse' && this.app.barsAway) this.app.barsAway(true);
        if (this.drag && this.drag.mode) this.modeDragStart();
        else if (this.drag && this.drag.kind === 'draw-wall') { this.drag.started = true; this.chain = null; }
        else if (this.drag && (this.drag.kind === 'body' || this.drag.kind === 'handle')) { this.app.beginGesture(); this.drag.started = true; }
        else if (this.drag && this.drag.kind === 'box') { this.drag.started = true; }
        else { this.gesture = { kind: 'pan', sp: g.sp, cam: { ...this.cam } }; this.onMove(e); return; }
      }
      if (g.moved && this.drag) { if (this.drag.mode) this.modeDrag(wp, e); else this.updateDrag(this.local(en, wp)); return; }
      return;
    }
    if (this.spec.mode === 'view' && this.app.tool === 'measure' && this.measure && this.measure.a && !this.measure.b) { this.drawLabels(); return; }
    // hover (mouse): previews for the current tool
    if (!en || e.pointerType !== 'mouse') return;
    const p = this.local(en, wp);
    const tool = this.app.tool;
    if (tool === 'void' && this.chain) {
      const sn = this.snap(p, {});
      this.snapMark = sn;
      this.chain.preview = sn.p;
      this.drawOverlay();
    } else if (tool === 'wall' || ((tool === 'room' || tool === 'garden') && this.chain)) {
      const from = this.chain && this.chain.pts.length ? this.chain.pts[this.chain.pts.length - 1] : null;
      const sn = tool === 'garden' ? this.gardenSnap(p, { from }) : this.snap(p, { from: tool === 'wall' ? from : null });
      this.snapMark = sn;
      if (this.chain) this.chain.preview = sn.p;
      this.drawOverlay();
    } else if (tool === 'measure' && this.measure && this.measure.a && !this.measure.b) {
      this.drawLabels();
    } else if (this.calib) { this.drawOverlay(); }
    else if (this.snapMark) { this.snapMark = null; this.drawOverlay(); }
  }

  onUp(e, cancelled) {
    const pt = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size && this.app.barsAway && document.querySelector('#editor.bars-away')) this.app.barsAway(false);
    try { this.svg.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
    const g = this.gesture;
    if (g && g.kind === 'pinch') {
      if (this.pointers.size < 2) this.gesture = this.pointers.size === 1 ? { kind: 'pan', sp: [...this.pointers.values()][0].sp, cam: { ...this.cam } } : null;
      return;
    }
    if (this.pointers.size) return;
    this.gesture = null;
    // middle click without dragging: back to the whole drawing
    if (!cancelled && g && g.kind === 'pan' && g.button === 1 && V.dist(this.eventScreen(e), g.sp) < 5) { this.drag = null; this.home(); return; }
    if (cancelled) { if (this.drag && this.drag.started && this.drag.kind !== 'draw-wall') this.app.endGesture(); this.drag = null; this.guides = []; this.snapMark = null; this.drawOverlay(); return; }
    if (!g || g.kind !== 'press') { this.drag = null; return; }
    const sp = this.eventScreen(e);
    const wp = this.toWorld(sp);
    if (g.moved && this.drag) { if (this.drag.mode) this.modeDragEnd(); else this.finishDrag(); return; }
    clearTimeout(this._lp);
    this.drag = null;
    if (!g.moved && g.dim) { this.editDim(g.dim, sp); return; }
    if (!g.moved && g.multiTap !== undefined) { if (g.multiTap && g.multiTap.solo) this.app.select(g.multiTap.solo); else if (g.multiTap) this.app.multiToggle(g.multiTap); return; }
    if (!g.moved) { this._tapDownHit = g.downHit || null; this.onTap(wp, sp, e); this._tapDownHit = null; }
  }

  onTap(wp, sp, e, deferred = false, downHit = this._tapDownHit) {
    const en = this.editEntry;
    const tool = this.app.tool;
    // double tap (touch / pen) while not drawing: back to the whole drawing. A single tap waits a moment,
    // so the first tap of a double tap doesn't open the room details over the drawing.
    const drawing = this.calib || this.chain || (en && this.spec.editable && tool !== 'select') || (this.spec.mode === 'view' && tool !== 'select');
    if (!deferred && e.pointerType !== 'mouse' && !drawing) {
      const now = performance.now(), prev = this._pendingTap;
      if (prev) { clearTimeout(prev.timer); this._pendingTap = null; }
      if (prev && now - prev.t < 320 && V.dist(prev.sp, sp) < 40) { this.home(); return; }
      if (prev) prev.run();
      const run = () => { if (this.spec) this.onTap(wp, sp, e, true, downHit); };
      this._pendingTap = { t: now, sp, run, timer: setTimeout(() => { this._pendingTap = null; run(); }, 300) };
      return;
    }
    if (this.calib) {
      this.calib.pts.push(en ? this.local(en, wp) : wp);
      this.drawOverlay();
      if (this.calib.pts.length >= this.calib.need) { const c = this.calib; this.calib = null; this.drawOverlay(); c.done(c.pts); }
      return;
    }
    if (this.spec.mode && this.spec.mode !== 'build') { this.modeTap(wp, sp, e); return; }
    if (!en || !this.spec.editable) {
      // read-only views: tap selects a room for its details (a door swings)
      { const pin = this.pinAt(sp); if (pin) { this.app.selectNote(pin.pin.id); return; } }
      { const tg = this.entryAt(wp); const dr = tg && this.doorAt(tg, this.local(tg, wp)); if (dr && this.app.doorTapped(dr.id, e, '2d')) return; }
      const target = this.entryAt(wp);
      if (!target) { this.app.select(null); return; }
      const p = this.local(target, wp);
      let room = null, area = Infinity;
      for (const r of target.plan.rooms) if (r.storey === target.storey.id && pointInPolygon(p, r.poly)) { const a = roomArea(r); if (a < area) { area = a; room = r; } }
      this.app.select(room ? { type: 'room', id: room.id, storey: target.storey.id, versionId: target.versionId, readOnly: !target.edit } : null);
      return;
    }
    const p = this.local(en, wp);
    if (tool === 'select') {
      // a note pin first (they sit on top), then the electrics
      const pin = this.pinAt(sp);
      if (pin) { this.app.selectNote(pin.pin.id); return; }
      const pt = this.pointAt(sp, en);
      if (pt) { this.app.select({ type: 'point', id: pt.id }); return; }
      const hit = downHit || this.hit(p, en) || (en.site ? this.gardenHit(p, en, true) : null);
      if (!(downHit && this.app.selection && this.app.selection.type === downHit.type && this.app.selection.id === downHit.id)) this.app.select(hit);
      // a door: a small pop-up to open or close it
      if (hit && hit.type === 'opening') this.app.doorTapped(hit.id, e, '2d');
      return;
    }
    if (tool === 'wall') {
      const from = this.chain && this.chain.pts.length ? this.chain.pts[this.chain.pts.length - 1] : null;
      const sn = this.snap(p, { from });
      if (!this.chain) { this.chain = { type: 'wall', pts: [sn.p], preview: null }; }
      else {
        const last = this.chain.pts[this.chain.pts.length - 1];
        if (V.dist(last, sn.p) < 0.05) { this.finishChain(); return; }
        this.addWall(last, sn.p);
        this.chain.pts.push(sn.p);
        if (V.eq(sn.p, this.chain.pts[0], 0.002) && this.chain.pts.length > 2) { this.finishChain(); return; }
      }
      this.snapMark = sn;
      this.drawOverlay();
      this.app.emit('chain');
      return;
    }
    if (tool === 'door' || tool === 'window' || tool === 'opening') { this.placeOpening(p, en, tool); return; }
    if (tool === 'install') { this.app.placePoint(p, en); return; }
    if (tool === 'garden') { this.gardenTap(p, en, sp); return; }
    if (tool === 'void') { this.voidTap(this.snap(p, {}).p, en); return; }
    if (tool === 'stair') { this.app.stairTap(this.snap(p, {}).p, en, this); return; }
    if (tool === 'room') {
      if (this.app.toolOpts.roomMode === 'draw' || this.chain) {
        const sn = this.snap(p, {});
        if (!this.chain) this.chain = { type: 'room', pts: [sn.p], preview: null };
        else {
          if (this.chain.pts.length >= 3 && V.dist(this.toScreen(this.chain.pts[0]), this.toScreen(sn.p)) < 18) { this.finishChain(); return; }
          this.chain.pts.push(sn.p);
        }
        this.drawOverlay();
        this.app.emit('chain');
        return;
      }
      const res = detectRoom(en.plan, en.storey.id, p);
      if (res.error) { this.app.toast(res.error); return; }
      const existing = en.plan.rooms.find(r => r.storey === en.storey.id && pointInPolygon(p, r.poly));
      if (existing && Math.abs(roomArea(existing) - Math.abs(polygonArea(res.poly))) < 0.3) { this.app.select({ type: 'room', id: existing.id }); this.app.toast('This room already exists. Selected it.'); return; }
      this.app.addRoom(res.poly);
      return;
    }
    if (tool === 'measure') {
      const sn = this.snap(p, {});
      if (!this.measure || this.measure.b) this.measure = { a: sn.p, b: null };
      else this.measure.b = sn.p;
      this.drawLabels();
      return;
    }
  }

  finishChain() {
    if (!this.chain) return;
    const c = this.chain;
    this.chain = null;
    this.snapMark = null;
    this.guides = [];
    if (c.type === 'room' && c.pts.length >= 3) this.app.addRoom(cleanPoly(c.pts));
    if (c.type === 'garea' && c.pts.length >= 3) this.app.addGardenArea(this.app.toolOpts.gArea || 'tiles', c.pts);
    if (c.type === 'gline' && c.pts.length >= 2) this.app.addGardenLine(this.app.toolOpts.gLine || 'hedge', c.pts);
    this.drawOverlay();
    this.app.emit('chain');
  }
  cancelChain() { this.chain = null; this.measure = null; this.snapMark = null; this.guides = []; this.drawOverlay(); this.drawLabels(); this.app.emit('chain'); }

  addWall(a, b) {
    if (V.dist(a, b) < 0.05) return;
    const opts = this.app.toolOpts;
    this.app.addWall(a, b, opts.wallT, opts.wallKind);
  }

  placeOpening(p, en, kind) {
    const tol = Math.max(14 / this.cam.s, 0.2);
    let best = null;
    for (const w of en.plan.walls) {
      if (w.storey !== en.storey.id) continue;
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.d < Math.max(w.t / 2 + 0.05, tol) && (!best || pr.d < best.pr.d)) best = { w, pr };
    }
    if (!best) { this.app.toast(kind === 'door' ? t('Tap on a wall to place the door.') : kind === 'window' ? t('Tap on a wall to place the window.') : t('Tap on a wall to place the opening.')); return; }
    const o = this.app.toolOpts;
    const width = kind === 'door' ? o.doorW : kind === 'window' ? o.winW : o.gapW;
    const L = wallLen(best.w);
    if (width > L - 0.02) { this.app.toast('This wall is too short for a ' + fmtMM(width) + ' mm ' + kind + '.'); return; }
    let pos = clamp(round(best.pr.along, 0.01), width / 2, L - width / 2);
    const overlap = openingsOf(en.plan, best.w.id).some(x => Math.abs(x.pos - pos) < (x.w + width) / 2 - 0.001);
    if (overlap) { this.app.toast('There is already an opening there.'); return; }
    this.app.addOpening(best.w.id, kind, pos, width);
  }

  /* ───────── dragging selected things ───────── */
  prepareBodyDrag(hit, en, p) {
    const plan = en.plan;
    if (hit.type === 'wall') {
      const w = plan.walls.find(x => x.id === hit.id);
      this.drag = { kind: 'body', type: 'wall', id: w.id, start: p, a0: [...w.a], b0: [...w.b], attached: attachedEnds(plan, w).map(x => ({ id: x.wall.id, end: x.end, p0: [...x.wall[x.end]] })), rooms: this.app.settings.roomFollow !== false ? roomAnchors(plan, w.storey) : null, started: false };
    } else if (hit.type === 'opening') {
      const op = plan.openings.find(x => x.id === hit.id);
      this.drag = { kind: 'body', type: 'opening', id: op.id, start: p, pos0: op.pos, started: false };
    } else if (hit.type === 'void') {
      const vd = (plan.voids || []).find(x => x.id === hit.id);
      if (vd) this.drag = { kind: 'body', type: 'void', id: vd.id, start: p, orig: clone(vd), started: false };
    } else if (hit.type === 'plant' || hit.type === 'garea' || hit.type === 'gline') {
      const gd = plan.garden;
      const it = hit.type === 'plant' ? gd.plants.find(x => x.id === hit.id) : hit.type === 'garea' ? gd.areas.find(x => x.id === hit.id) : gd.lines.find(x => x.id === hit.id);
      if (it) this.drag = { kind: 'body', type: hit.type, id: hit.id, start: p, orig: clone(it), started: false };
    }
  }

  startHandleDrag(hd, en) {
    const sel = this.spec.selection;
    const plan = en.plan;
    if (hd.kind === 'wall-a' || hd.kind === 'wall-b') {
      const w = plan.walls.find(x => x.id === sel.id);
      const end = hd.kind === 'wall-a' ? 'a' : 'b';
      this.drag = { kind: 'handle', type: 'wall-end', id: w.id, end, other: [...w[end === 'a' ? 'b' : 'a']], connected: connectedEnds(plan, en.storey.id, w[end], w.id).map(x => ({ id: x.wall.id, end: x.end })), rooms: this.app.settings.roomFollow !== false ? roomAnchors(plan, en.storey.id) : null, started: false };
    } else if (hd.kind === 'room-v') {
      this.drag = { kind: 'handle', type: 'room-v', id: sel.id, i: hd.i, started: false };
    } else if (hd.kind === 'garea-v' || hd.kind === 'gline-v' || hd.kind === 'plot-v' || hd.kind === 'void-v') {
      this.drag = { kind: 'handle', type: hd.kind, id: sel.id, i: hd.i, started: false };
    }
  }

  updateDrag(p) {
    const d = this.drag;
    if (!d) return;
    const en = this.editEntry;
    if (d.kind === 'box') { d.b = p; this.drawOverlay(); return; }
    if (d.type === 'multi') { this.app.mutate(plan => this.app.moveMulti(plan, d, p), { gesture: true }); return; }
    if (d.kind === 'draw-wall') {
      const sn = this.snap(p, { from: d.startP });
      d.preview = { a: d.startP, b: sn.p };
      this.snapMark = sn;
      this.drawOverlay();
      return;
    }
    const grid = this.app.settings.grid || 0;
    if (d.type === 'wall-end') {
      const sn = this.snap(p, { from: d.other, exclude: [d.id, ...d.connected.map(c => c.id)] });
      this.snapMark = sn;
      this.app.mutate(plan => {
        const w = plan.walls.find(x => x.id === d.id);
        if (!w) return;
        w[d.end] = [...sn.p];
        for (const c of d.connected) { const o = plan.walls.find(x => x.id === c.id); if (o) o[c.end] = [...sn.p]; }
        this.clampOpenings(plan, [d.id, ...d.connected.map(c => c.id)]);
        followRooms(plan, d.rooms);
      }, { gesture: true });
    } else if (d.type === 'wall') {
      const n = V.perp(V.norm(V.sub(d.b0, d.a0)));
      let off = V.dot(V.sub(p, d.start), n);
      if (grid) {
        // keep the wall's line on the grid when it is axis-aligned
        const ref = Math.abs(n[0]) > 0.999 ? d.a0[0] : Math.abs(n[1]) > 0.999 ? d.a0[1] : null;
        if (ref != null) { const sign = Math.abs(n[0]) > 0.999 ? Math.sign(n[0]) : Math.sign(n[1]); off = (round(ref + off * sign, grid) - ref) * sign; }
        else off = round(off, grid);
      }
      const mv = V.mul(n, off);
      this.app.mutate(plan => {
        const w = plan.walls.find(x => x.id === d.id);
        if (!w) return;
        w.a = V.add(d.a0, mv); w.b = V.add(d.b0, mv);
        for (const at of d.attached) { const o = plan.walls.find(x => x.id === at.id); if (o) o[at.end] = V.add(at.p0, mv); }
        this.clampOpenings(plan, d.attached.map(a => a.id));
        followRooms(plan, d.rooms);
      }, { gesture: true });
    } else if (d.type === 'opening') {
      this.app.mutate(plan => withAssembly(plan, d.id, () => {
        const op = plan.openings.find(x => x.id === d.id);
        const w = op && plan.walls.find(x => x.id === op.wall);
        if (!w) return;
        const delta = V.dot(V.sub(p, d.start), wallDir(w));
        const L = wallLen(w);
        op.pos = clamp(round(d.pos0 + delta, grid ? Math.min(grid, 0.05) : 0.01), op.w / 2, L - op.w / 2);
      }), { gesture: true });
    } else if (d.type === 'point') {
      this.app.mutate(plan => { this.app.movePoint(plan, d.id, p, en.storey.id); }, { gesture: true });
    } else if (d.type === 'room-v') {
      const sn = this.snap(p, {});
      this.snapMark = sn;
      this.app.mutate(plan => {
        const r = plan.rooms.find(x => x.id === d.id);
        if (!r) return;
        r.poly[d.i] = [...sn.p];
      }, { gesture: true });
    } else if (d.type === 'garea-v' || d.type === 'gline-v') {
      const gd = en.plan.garden;
      const it = d.type === 'garea-v' ? gd.areas.find(x => x.id === d.id) : gd.lines.find(x => x.id === d.id);
      const own = it ? (d.type === 'garea-v' ? it.poly[d.i] : it.pts[d.i]) : null;
      const sn = this.gardenSnap(p, { skip: own ? [own] : [] });
      this.snapMark = sn;
      this.app.mutate(plan => {
        const g = plan.garden, x = d.type === 'garea-v' ? g.areas.find(y => y.id === d.id) : g.lines.find(y => y.id === d.id);
        if (!x) return;
        (d.type === 'garea-v' ? x.poly : x.pts)[d.i] = [round(sn.p[0], 0.001), round(sn.p[1], 0.001)];
      }, { gesture: true });
    } else if (d.type === 'void-v') {
      const sn = this.snap(p, {});
      this.snapMark = sn;
      this.app.mutate(plan => { const vd = (plan.voids || []).find(x => x.id === d.id); if (vd) this.moveVoidCorner(vd, d.i, [round(sn.p[0], 0.001), round(sn.p[1], 0.001)]); }, { gesture: true });
    } else if (d.type === 'void') {
      let mv = V.sub(p, d.start);
      if (grid) mv = [round(mv[0], grid), round(mv[1], grid)];
      this.app.mutate(plan => { const vd = (plan.voids || []).find(x => x.id === d.id); if (vd) vd.poly = d.orig.poly.map(q => [round(q[0] + mv[0], 0.001), round(q[1] + mv[1], 0.001)]); }, { gesture: true });
    } else if (d.type === 'plot-v') {
      const sn = this.snap(p, {});
      this.app.mutate(pr => { if (pr.site) pr.site.plot[d.i] = [round(sn.p[0], 0.01), round(sn.p[1], 0.01)]; }, { project: true, gesture: true });
    } else if (d.type === 'plant' || d.type === 'garea' || d.type === 'gline') {
      let mv = V.sub(p, d.start);
      if (grid) mv = [round(mv[0], grid), round(mv[1], grid)];
      this.app.mutate(plan => {
        const g = plan.garden;
        if (d.type === 'plant') { const x = g.plants.find(y => y.id === d.id); if (x) { x.x = round(d.orig.x + mv[0], 0.01); x.y = round(d.orig.y + mv[1], 0.01); } }
        else if (d.type === 'garea') { const x = g.areas.find(y => y.id === d.id); if (x) x.poly = d.orig.poly.map(q => [round(q[0] + mv[0], 0.001), round(q[1] + mv[1], 0.001)]); }
        else { const x = g.lines.find(y => y.id === d.id); if (x) x.pts = d.orig.pts.map(q => [round(q[0] + mv[0], 0.001), round(q[1] + mv[1], 0.001)]); }
      }, { gesture: true });
    }
  }

  clampOpenings(plan, wallIds) {
    for (const op of plan.openings) {
      if (!wallIds.includes(op.wall)) continue;
      const w = plan.walls.find(x => x.id === op.wall);
      const L = wallLen(w);
      op.pos = clamp(op.pos, Math.min(op.w / 2, L / 2), Math.max(L - op.w / 2, L / 2));
    }
  }

  finishDrag() {
    const d = this.drag;
    this.drag = null;
    this.snapMark = null;
    this.guides = [];
    if (d && d.kind === 'box') { if (d.started && this.editEntry) this.app.selectBox(d.a, d.b, this.editEntry); this.drawOverlay(); return; }
    if (d && d.kind === 'draw-wall') {
      if (d.preview && V.dist(d.preview.a, d.preview.b) >= 0.05) {
        this.addWall(d.preview.a, d.preview.b);
      }
      this.drawOverlay();
      return;
    }
    if (d && d.started) this.app.endGesture();
    this.drawOverlay();
  }

  /* calibration / origin picking for imported drawings */
  pickPoints(need, done) { this.calib = { need, pts: [], done }; this.drawOverlay(); }
  cancelPick() { this.calib = null; this.drawOverlay(); }
}
