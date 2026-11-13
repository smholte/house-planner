/* ───────────── space.js — "Check space": run by hand in Furnish mode, never in the background.
   Looks for: pieces in a wall, pieces on top of each other, pieces in a door's swing, too little room in front of
   cupboards, kitchen units, toilets … and beside beds, and doorways you can no longer reach with a walkway of the
   chosen width (70 cm by default). Results are listed in the details and numbered on the plan. ───────────── */

/** convex polygon overlap area (both convex) */
function overlapArea(a, b) {
  const c = clipToConvex(a, b);
  return c.length >= 3 ? Math.abs(polygonArea(c)) : 0;
}
/** a door's swing as a convex polygon (hinge, the open leaf, the arc) */
function doorSwingPolys(plan, op) {
  const w = plan.walls.find(x => x.id === op.wall);
  if (!w) return [];
  const d = wallDir(w), n = V.perp(d), t2 = w.t / 2;
  const p0 = V.add(w.a, V.mul(d, op.pos - op.w / 2)), p1 = V.add(w.a, V.mul(d, op.pos + op.w / 2));
  const side = op.swing === 'right' ? V.mul(n, -1) : n;
  const leaves = op.leaves === 2 ? [[p0, V.lerp(p0, p1, 0.5), op.w / 2], [p1, V.lerp(p0, p1, 0.5), op.w / 2]] : [[op.hinge === 'end' ? p1 : p0, op.hinge === 'end' ? p0 : p1, op.w]];
  return leaves.map(([hg, o, r]) => {
    const hf = V.add(hg, V.mul(side, t2)), along = V.norm(V.sub(o, hg));
    const pts = [hf];
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; pts.push(V.add(hf, V.add(V.mul(along, Math.cos(a) * r), V.mul(side, Math.sin(a) * r)))); }
    return pts;
  });
}
const zRange = (f, H) => { const z = furnZ(f, H); return [z, z + Math.max(0.01, f.h)]; };
const zOverlap = (a, b) => a[0] < b[1] - 0.01 && b[0] < a[1] - 0.01;

/* ───────── the walkway check: free space on a 5 cm grid ───────── */
function freeGrid(plan, sid, obstacles, bb, res) {
  const nx = Math.ceil(bb.w / res) + 2, ny = Math.ceil(bb.h / res) + 2;
  const x0 = bb.minX - res, y0 = bb.minY - res;
  const inside = new Uint8Array(nx * ny), blocked = new Uint8Array(nx * ny);
  const rooms = plan.rooms.filter(r => r.storey === sid);
  const fill = (poly, arr, v = 1, test = pointInPolygon) => {
    const b = bboxOfPoints(poly);
    const i0 = Math.max(0, Math.floor((b.minX - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((b.maxX - x0) / res));
    const j0 = Math.max(0, Math.floor((b.minY - y0) / res)), j1 = Math.min(ny - 1, Math.ceil((b.maxY - y0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (test([x0 + (i + 0.5) * res, y0 + (j + 0.5) * res], poly)) arr[j * nx + i] = v;
  };
  for (const r of rooms) { fill(r.poly, inside); for (const hl of roomHoles(plan, r)) fill(hl, inside, 0); }
  for (const o of obstacles) fill(o, blocked);
  return { nx, ny, x0, y0, res, inside, blocked, fill };
}
/** distance (m) of every free cell to the nearest blocked or outside cell (exact, Felzenszwalb) */
function distField(G) {
  const { nx, ny, res } = G, INF = 1e20;
  const f = new Float64Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) f[k] = G.inside[k] && !G.blocked[k] ? INF : 0;
  const dt1 = (src, n) => {
    const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s2;
      while (true) { s2 = ((src[q] + q * q) - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s2 <= z[k] && k > 0) k--; else break; }
      k++; v[k] = q; z[k] = s2; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + src[v[k]]; }
    return d;
  };
  const tmp = new Float64Array(Math.max(nx, ny));
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) tmp[j] = f[j * nx + i]; const d = dt1(tmp.subarray(0, ny), ny); for (let j = 0; j < ny; j++) f[j * nx + i] = d[j]; }
  for (let j = 0; j < ny; j++) { const row = f.slice(j * nx, j * nx + nx); const d = dt1(row, nx); for (let i = 0; i < nx; i++) f[j * nx + i] = d[i]; }
  const out = new Float32Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) out[k] = Math.sqrt(f[k]) * res;
  return out;
}
function components(G, dist, half, corridor) {
  const { nx, ny } = G, lab = new Int32Array(nx * ny).fill(-1);
  const ok = k => G.inside[k] && !G.blocked[k] && (dist[k] >= half || corridor[k]);
  let id = 0;
  const stack = [];
  for (let k = 0; k < nx * ny; k++) {
    if (lab[k] >= 0 || !ok(k)) continue;
    lab[k] = id; stack.push(k);
    while (stack.length) {
      const c = stack.pop(), i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const q = jj * nx + ii;
        if (lab[q] < 0 && ok(q)) { lab[q] = id; stack.push(q); }
      }
    }
    id++;
  }
  return lab;
}

Object.assign(app, {
  spaceCheckSig(lay, v) { return (lay ? lay.id + JSON.stringify(lay.items) : '') + '|' + v.id + '|' + v.updated + '|' + JSON.stringify(this.project.doorState || {}) + '|' + (this.settings.walkway || 0.7); },
  spaceCheckFor(v) {
    const sc = this.spaceCheck, lay = this.activeLayout();
    if (!sc || !sc.shown || !lay || !v || sc.layoutId !== lay.id || sc.versionId !== v.id) return null;
    return sc.sig === this.spaceCheckSig(lay, v) ? sc : null;
  },

  runSpaceCheck() {
    const p = this.project, v = this.shownVersion(), plan = v.plan, lay = this.activeLayout();
    if (!lay) return;
    const results = [];
    const W = this.settings.walkway || 0.7;
    const cm = m => Math.round(m * 100);
    for (const st of sortedStoreys(p)) {
      const items = lay.items.filter(f => f.storey === st.id);
      if (!items.length) continue;
      const H = st.wallHeight || 2.6;
      const walls = plan.walls.filter(w => w.storey === st.id);
      const wallSolids = [];
      for (const w of walls) {
        const parts = wallParts(w, openingsOf(plan, w.id));
        for (const [a, b] of parts.solids) wallSolids.push({ w, poly: wallPiecePoly(w, a, b, parts.L) });
        for (const hl of parts.holes) if (hl.op.kind === 'window' && hl.op.sill > 0.05) wallSolids.push({ w, poly: wallPiecePoly(w, hl.s, hl.e, parts.L), low: hl.op.sill });
      }
      const roomOf = q => plan.rooms.filter(r => r.storey === st.id && pointInPolygon(q, r.poly)).sort((a, b) => roomArea(a) - roomArea(b))[0] || null;
      const solid = items.filter(f => !furnType(f).flat);
      const C = new Map(items.map(f => [f.id, furnCorners(f)]));
      // 1. into a wall
      for (const f of solid) {
        const T = furnType(f);
        if (T.ceiling) continue;
        const zr = zRange(f, H);
        const hit = wallSolids.find(ws => (ws.low == null || zr[0] < ws.low) && overlapArea(C.get(f.id), ws.poly) > 0.0006);
        if (hit) results.push({ level: 'problem', kind: 'wall', ids: [f.id], storey: st.id, at: [f.x, f.y], text: t('{a} goes into a wall.', { a: furnName(f) }) });
      }
      // 2. on top of each other (chairs and stools may stand under a table)
      for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i], b = solid[j], A = furnType(a), B = furnType(b);
        if (A.ceiling || B.ceiling) continue;
        if (!zOverlap(zRange(a, H), zRange(b, H))) continue;
        // chairs and stools may stand under a table, a desk or the overhang of an island
        const tableLike = (T, f) => ['table', 'round', 'desk'].includes(T.kind) || (T.kind === 'krun' && isIsland(f));
        if ((A.tuck && tableLike(B, b)) || (B.tuck && tableLike(A, a))) continue;
        const ov = overlapArea(C.get(a.id), C.get(b.id));
        if (ov > 0.004) {
          const q = clipToConvex(C.get(a.id), C.get(b.id)), c = q.reduce((s2, x) => [s2[0] + x[0] / q.length, s2[1] + x[1] / q.length], [0, 0]);
          results.push({ level: 'problem', kind: 'overlap', ids: [a.id, b.id], storey: st.id, at: c, text: t('{a} and {b} are on top of each other.', { a: furnName(a), b: furnName(b) }) });
        }
      }
      // 3. in a door's swing
      for (const op of plan.openings) {
        if (op.kind !== 'door') continue;
        const w = walls.find(x => x.id === op.wall);
        if (!w) continue;
        for (const sw of doorSwingPolys(plan, op)) {
          for (const f of solid) {
            const T = furnType(f), zr = zRange(f, H);
            if (T.ceiling || zr[0] > op.h - 0.05) continue;
            if (overlapArea(C.get(f.id), sw) > 0.003) {
              const mid = V.lerp(sw[0], sw[Math.floor(sw.length / 2)], 0.6);
              const r = roomOf(mid);
              results.push({ level: 'problem', kind: 'door', ids: [f.id], storey: st.id, at: mid, poly: sw, text: t('{a} is in the way of a door', { a: furnName(f) }) + (r ? ' (' + r.name + ').' : '.') });
            }
          }
        }
      }
      // 4. room to use it: in front of cupboards, units, toilets …; beside beds
      const obstacleFor = f => [...wallSolids.map(ws => ws.poly), ...solid.filter(o => o !== f && !furnType(o).ceiling && !furnType(o).tuck && zOverlap(zRange(o, H), [0, 1.6])).map(o => C.get(o.id))];
      const freeDepth = (f, zone, axis, edge) => {
        // zone in the piece's own frame; how far from the edge is it free?
        let free = Infinity;
        for (const poly of obstacleFor(f)) {
          const local = poly.map(q => furnLocal(f, q));
          const part = clipToConvex(local, zone);
          if (part.length < 3 || Math.abs(polygonArea(part)) < 0.0004) continue;
          for (const q of part) free = Math.min(free, Math.abs(q[axis] - edge));
        }
        return free;
      };
      for (const f of solid) {
        const T = furnType(f);
        const zoneOf = (axis, sg, need) => {
          const e = axis === 1 ? f.d / 2 : f.w / 2, a = axis === 1 ? f.w / 2 - 0.02 : f.d / 2 - 0.15;
          const z0 = sg * e, z1 = sg * (e + need);
          return axis === 1 ? [[-a, Math.min(z0, z1)], [a, Math.min(z0, z1)], [a, Math.max(z0, z1)], [-a, Math.max(z0, z1)]] : [[Math.min(z0, z1), -a + 0.15], [Math.max(z0, z1), -a + 0.15], [Math.max(z0, z1), a], [Math.min(z0, z1), a]];
        };
        const check = (axis, sg, need, what) => {
          const zone = zoneOf(axis, sg, need), edge = sg * (axis === 1 ? f.d / 2 : f.w / 2);
          const free = freeDepth(f, zone, axis, edge);
          if (free < need - 0.02) return { free, zone: zone.map(q => furnToPlan(f, q)) };
          return null;
        };
        if (T.front) {
          const r = check(1, 1, T.front);
          if (r) results.push({ level: 'warning', kind: 'front', ids: [f.id], storey: st.id, at: furnToPlan(f, [0, f.d / 2 + Math.min(r.free, T.front) / 2]), poly: r.zone, text: t('Only {n} cm free in front of {a} (about {m} cm is good).', { n: cm(r.free === Infinity ? 0 : r.free), a: furnName(f), m: cm(T.front) }) });
        }
        if (T.back) {
          const r = check(1, -1, T.back);
          if (r) results.push({ level: 'warning', kind: 'front', ids: [f.id], storey: st.id, at: furnToPlan(f, [0, -f.d / 2 - Math.min(r.free, T.back) / 2]), poly: r.zone, text: t('Only {n} cm free behind {a} (about {m} cm is good).', { n: cm(r.free), a: furnName(f), m: cm(T.back) }) });
        }
        if (T.sides) {
          const L = check(0, -1, T.sides), R = check(0, 1, T.sides);
          const bad = T.oneSide ? (L && R ? [L.free > R.free ? L : R] : []) : [L, R].filter(Boolean);
          for (const r of bad) results.push({ level: 'warning', kind: 'bed', ids: [f.id], storey: st.id, at: V.lerp(r.zone[0], r.zone[2], 0.5), poly: r.zone, text: t('Only {n} cm beside {a} to get in and out (about {m} cm is good).', { n: cm(r.free), a: furnName(f), m: cm(T.sides) }) });
        }
      }
      // 5. walkways: every doorway you could reach with the walls alone should still be reachable, W wide
      const bb = bboxOfPoints(walls.flatMap(w => [w.a, w.b]));
      if (bb) {
        const wallPolys = wallSolids.map(ws => ws.poly);
        const furnPolys = solid.filter(f => !furnType(f).ceiling && zRange(f, H)[0] < 1.0 && f.h > 0.15).map(f => C.get(f.id));
        const G0 = freeGrid(plan, st.id, wallPolys, bb, 0.05), G1 = freeGrid(plan, st.id, wallPolys.concat(furnPolys), bb, 0.05);
        const corridor = new Uint8Array(G0.nx * G0.ny);
        const doorPts = [];
        for (const op of plan.openings) {
          if (op.kind === 'window') continue;
          const w = walls.find(x => x.id === op.wall);
          if (!w) continue;
          const d = wallDir(w), n = V.perp(d), c = V.add(w.a, V.mul(d, op.pos)), k = w.t / 2 + 0.45, hw = Math.max(0.05, op.w / 2 - 0.03);
          const rect = [V.add(V.add(c, V.mul(d, -hw)), V.mul(n, -k)), V.add(V.add(c, V.mul(d, hw)), V.mul(n, -k)), V.add(V.add(c, V.mul(d, hw)), V.mul(n, k)), V.add(V.add(c, V.mul(d, -hw)), V.mul(n, k))];
          G0.fill(rect, corridor);
          for (const sg of [1, -1]) { const q = V.add(c, V.mul(n, sg * k)); const r = roomOf(q); if (r) doorPts.push({ q, r, op }); }
          // the doorway itself is never blocked by its own jambs
          for (const G of [G0, G1]) G.fill(rect, G.inside);
        }
        const d0 = distField(G0), d1 = distField(G1);
        const cell = (G, q) => { const i = Math.floor((q[0] - G.x0) / G.res), j = Math.floor((q[1] - G.y0) / G.res); return j * G.nx + i; };
        const lab0 = components(G0, d0, W / 2, corridor), lab1 = components(G1, d1, W / 2, corridor);
        // furniture standing in the doorway corridor blocks it
        const reported = new Set();
        const groups = new Map();
        for (const dp of doorPts) { const k0 = lab0[cell(G0, dp.q)], k1 = lab1[cell(G1, dp.q)]; dp.k0 = k0; dp.k1 = G1.blocked[cell(G1, dp.q)] ? -2 : k1; if (k0 >= 0) { if (!groups.has(k0)) groups.set(k0, []); groups.get(k0).push(dp); } }
        for (const list of groups.values()) {
          // the part most doorways still reach is "the house"; the others are cut off
          const count = new Map();
          for (const dp of list) if (dp.k1 >= 0) count.set(dp.k1, (count.get(dp.k1) || 0) + 1);
          const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
          for (const dp of list) {
            if (main && dp.k1 === main[0]) continue;
            const key = dp.op.id + '|' + dp.r.id;
            if (reported.has(key)) continue;
            reported.add(key);
            // how wide is the best way there now?
            let width = 0;
            for (let ww = W - 0.05; ww >= 0.25; ww -= 0.05) {
              const lab = components(G1, d1, ww / 2, corridor), a = lab[cell(G1, dp.q)];
              const others = list.filter(o => o !== dp).map(o => lab[cell(G1, o.q)]);
              if (a >= 0 && others.includes(a)) { width = ww; break; }
            }
            results.push({ level: 'warning', kind: 'route', ids: [], storey: st.id, at: dp.q, text: width ? t('The way to the doorway of {r} is only about {n} cm wide (walkway {m} cm).', { r: dp.r.name, n: cm(width), m: cm(W) }) : t('The doorway of {r} can no longer be reached.', { r: dp.r.name }) });
          }
        }
      }
    }
    const order = { problem: 0, warning: 1 };
    results.sort((a, b) => order[a.level] - order[b.level]);
    this.spaceCheck = { results, shown: true, layoutId: lay.id, versionId: v.id, sig: this.spaceCheckSig(lay, v), at: Date.now(), W };
    this.selection = this.selection && this.selection.type === 'furn' ? this.selection : null;
    this.refreshViews(false);
    this.renderInspector();
    this.renderToolrail();
    if (window.matchMedia('(max-width: 860px)').matches && !this.selection) this.toggleInspector(true);
    const np = results.filter(r => r.level === 'problem').length, nw = results.length - np;
    const parts = [];
    if (np) parts.push(np === 1 ? t('1 problem') : t('{n} problems', { n: np }));
    if (nw) parts.push(nw === 1 ? t('1 thing to look at') : t('{n} things to look at', { n: nw }));
    this.toast(results.length ? parts.join(t(' and ')) + '. ' + t('They are numbered on the plan.') : t('Everything fits: no clashes, doors swing free, walkways of {n} cm.', { n: cm(W) }));
  },

  spaceCheckSection(el) {
    const v = this.shownVersion(), lay = this.activeLayout();
    const sc = this.spaceCheck && lay && this.spaceCheck.layoutId === lay.id && this.spaceCheck.versionId === v.id ? this.spaceCheck : null;
    const fresh = sc && sc.sig === this.spaceCheckSig(lay, v);
    const W = this.settings.walkway || 0.7;
    const wSeg = h('div', { class: 'seg' }, ...[0.6, 0.7, 0.8, 0.9].map(x => h('button', { 'aria-pressed': String(Math.abs(W - x) < 0.001), onclick: () => { Settings.set('walkway', x); this.renderInspector(); } }, String(Math.round(x * 100)))));
    const sec = h('div', { class: 'insp-sec space-sec' }, h('div', { class: 'eyebrow' }, t('Check space')),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Walkways at least (cm)')), wSeg),
      h('div', { class: 'actions' }, h('button', { class: 'btn sm primary', onclick: () => this.runSpaceCheck() }, icon('space'), sc ? t('Check again') : t('Check space')),
        sc ? h('button', { class: 'btn sm ghost', onclick: () => { this.spaceCheck = null; this.refreshViews(false); this.renderInspector(); this.renderToolrail(); } }, t('Clear')) : null));
    if (sc && !fresh) sec.appendChild(h('p', { class: 'note-muted warn' }, t('Things changed since the last check. Check again to see where it stands now.')));
    if (sc && fresh) {
      if (!sc.results.length) sec.appendChild(h('p', { class: 'sc-ok' }, icon('check'), t('Everything fits.')));
      sc.results.forEach((r, i) => {
        const st = getStorey(this.project, r.storey);
        sec.appendChild(h('button', { class: 'sc-row ' + r.level, onclick: () => {
          if (this.view.scope !== 'storey' || this.view.storeyId !== r.storey || this.view.dim !== '2d') { this.view = { ...this.view, dim: '2d', scope: 'storey', storeyId: r.storey }; this.renderEditorChrome(); this.setupPanes(true); }
          if (r.ids && r.ids.length) this.select({ type: 'furn', ids: r.ids });
        } }, h('span', { class: 'sc-n' }, String(i + 1)), h('span', { class: 'sc-t' }, r.text, st && sortedStoreys(this.project).length > 1 ? h('span', { class: 'note-muted' }, ' · ' + st.name) : null)));
      });
    }
    el.appendChild(sec);
  },
});
