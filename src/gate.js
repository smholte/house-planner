/* ───────────── gate.js — a metal gate with railing (garden line kind 'gate') ─────────────
   Black powder-coated steel, like a classic garden gate: square posts with caps; the gate leaf with an arched top
   rail, bars ending in spear (fleur-de-lis) tips that follow the arch, a scroll ornament in the middle, a lock box
   and lever; either side of it a railing of the same bars and spears up to the line's height.
   The line: l.h = height of the gate (the spear tips over its arch; since 29 Oct evening – before it was the
   railing's height); the railing beside it is lower by the arch (about 30 cm); l.gate = { w: leaf width, at: where
   along the line (0 … 1, middle 0.5), side: 1 / -1 (the side it opens to, left / right of the line's direction) }.
   The leaf opens and closes like a door (tap it; walking into it opens it): app.doorState[l.id] = 'open'. */

const GATE_HIT = () => mat('g|gate-hit', () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
const GATE_MAT = () => mat('g|gate', () => new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.48, metalness: 0.55 }));

/** where the leaf, the posts and the railing runs go along the line (distances from its start) */
function gateLayout(l) {
  const P = gLinePath(l).filter((q, k, arr) => !k || V.dist(q, arr[k - 1]) > 0.005);
  let L = 0;
  const acc = [0];
  for (let i = 1; i < P.length; i++) { L += V.dist(P[i - 1], P[i]); acc.push(L); }
  const G = l.gate || {};
  const gw = clamp(G.w || 1.0, 0.5, Math.max(0.5, L - 0.25));
  const at = G.at != null ? G.at : 0.5;
  const c = clamp(at * L, gw / 2 + 0.1, Math.max(gw / 2 + 0.1, L - gw / 2 - 0.1));
  const s0 = c - gw / 2, s1 = c + gw / 2;
  const posts = [{ s: Math.max(0, s0 - 0.05), big: true }, { s: Math.min(L, s1 + 0.05), big: true }];
  const runs = [];
  if (s0 - 0.09 > 0.05) runs.push([0, s0 - 0.09]);
  if (s1 + 0.09 < L - 0.05) runs.push([s1 + 0.09, L]);
  for (const [a, b] of runs) {
    // a post at each end of a run and every 2 m between (and at the line's corners)
    const n = Math.max(1, Math.ceil((b - a) / 2.0));
    for (let k = 0; k <= n; k++) { const s = a + (b - a) * k / n; if (!posts.some(p => Math.abs(p.s - s) < 0.12)) posts.push({ s, big: false }); }
    for (let i = 1; i < acc.length - 1; i++) if (acc[i] > a && acc[i] < b && !posts.some(p => Math.abs(p.s - acc[i]) < 0.12)) posts.push({ s: acc[i], big: false });
  }
  posts.sort((a, b) => a.s - b.s);
  // a point and the line's direction at distance s
  const at3 = s => {
    let i = 1;
    while (i < acc.length - 1 && acc[i] < s) i++;
    const a = P[i - 1], b = P[i], d = V.norm(V.sub(b, a));
    return { p: V.add(a, V.mul(d, s - acc[i - 1])), d };
  };
  // the railing's height: the gate's height less its arch and spear tips
  const rise = Math.min(0.24, gw * 0.24), H = l.h || G_LINES.gate.h;
  return { P, L, s0, s1, gw, posts, runs, at3, side: G.side === -1 ? -1 : 1, rise, H, hr: Math.max(0.5, H - rise - 0.06) };
}

/** the gate and railing in 3D: { frame: the posts and the railing along the line, leaf: the gate's leaf in its own
 *  frame (x along the closed leaf from the hinge, y up from the ground, z across), hinge: where that frame stands } */
function gateGeometry(l, y0) {
  const lay = gateLayout(l);
  const geos = [], leafGeos = [];
  const h = lay.hr;
  const M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3();
  // pieces are made in a frame along the line at s: x along, y up, z across; the leaf's pieces (at s0) stay in the
  // leaf's own frame
  const put = (geo, s, du = 0) => {
    if (s === lay.s0) { leafGeos.push(geo); return; }
    const { p, d } = lay.at3(s);
    X.set(d[0], 0, d[1]); Z.set(-d[1], 0, d[0]);
    M.makeBasis(X, Y, Z).setPosition(p[0] + d[0] * du, y0, p[1] + d[1] * du);
    geos.push(geo.applyMatrix4(M));
  };
  const box = (s, cx, cy, w, hh, dd) => put(new THREE.BoxGeometry(w, hh, dd).translate(cx, cy, 0), s);
  const spear = (s, cx, y) => {
    put(new THREE.BoxGeometry(0.03, 0.014, 0.03).translate(cx, y + 0.007, 0), s);
    put(new THREE.ConeGeometry(0.02, 0.085, 4).rotateY(Math.PI / 4).translate(cx, y + 0.014 + 0.042, 0), s);
    for (const sg of [-1, 1]) put(new THREE.ConeGeometry(0.009, 0.05, 4).rotateZ(-sg * 0.75).translate(cx + sg * 0.018, y + 0.03, 0), s);
  };
  const tube = (pts3, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3), Math.max(8, pts3.length * 3), r, 5, false);
  // posts with caps (the hinge post just before the leaf belongs to the frame)
  for (const p of lay.posts) {
    const w = p.big ? 0.08 : 0.06, ph = p.big ? h + 0.14 : h - 0.04;
    box(p.s, 0, ph / 2, w, ph, w);
    box(p.s, 0, ph + 0.012, w + 0.02, 0.024, w + 0.02);
    if (p.big) box(p.s, 0, ph + 0.03, 0.035, 0.03, 0.035);
  }
  // railing runs: bottom and top rail, bars with spear tips
  for (const [a, b] of lay.runs) {
    const len = b - a;
    if (len < 0.08) continue;
    box(a, len / 2, 0.09, len, 0.03, 0.025);
    box(a, len / 2, h - 0.17, len, 0.03, 0.025);
    const n = Math.max(1, Math.round(len / 0.12));
    for (let k = 1; k < n; k++) {
      const u = len * k / n;
      box(a, u, (0.075 + h - 0.1) / 2, 0.016, h - 0.1 - 0.075, 0.016);
      spear(a, u, h - 0.1);
    }
  }
  // the leaf
  const { s0, gw, rise } = lay;
  const hs = h - 0.14, mid = gw / 2;
  const archY = u => hs + rise * (1 - ((u - mid) / mid) ** 2);
  box(s0, 0.02, (0.05 + hs) / 2, 0.035, hs - 0.05, 0.035);
  box(s0, gw - 0.02, (0.05 + hs) / 2, 0.035, hs - 0.05, 0.035);
  box(s0, mid, 0.06, gw - 0.04, 0.03, 0.03);
  box(s0, mid, 0.34, gw - 0.04, 0.03, 0.03);
  {
    const pts = [];
    for (let k = 0; k <= 16; k++) { const u = 0.02 + (gw - 0.04) * k / 16; pts.push(new THREE.Vector3(u, archY(u), 0)); }
    put(tube(pts, 0.014), s0);
  }
  const nb = Math.max(3, Math.round((gw - 0.08) / 0.13) | 1);
  for (let k = 1; k <= nb; k++) {
    const u = 0.02 + (gw - 0.04) * k / (nb + 1);
    const top = archY(u) + 0.1;
    box(s0, u, (0.06 + top) / 2, 0.016, top - 0.06, 0.016);
    spear(s0, u, top);
  }
  // the scroll in the middle: an S of two curls round the middle bar, and two small curls beside it
  const curl = (cx, cy, r0, turns, dir, start) => {
    const pts = [];
    for (let k = 0; k <= 24; k++) { const f = k / 24, a = start + dir * f * turns * Math.PI * 2, r = r0 * (1 - 0.75 * f); pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); }
    put(tube(pts, 0.006), s0);
  };
  const cy = (0.34 + archY(mid)) / 2;
  curl(mid + 0.035, cy + 0.09, 0.045, 1.1, 1, Math.PI);
  curl(mid - 0.035, cy - 0.09, 0.045, 1.1, 1, 0);
  curl(mid - 0.03, cy + 0.01, 0.022, 0.9, -1, 0);
  curl(mid + 0.03, cy - 0.01, 0.022, 0.9, -1, Math.PI);
  // hinges, lock box and lever (both sides)
  for (const y of [0.2, hs - 0.15]) box(s0, -0.012, y, 0.03, 0.06, 0.03);
  box(s0, gw - 0.03, 0.9, 0.05, 0.16, 0.06);
  for (const sg of [-1, 1]) put(new THREE.BoxGeometry(0.12, 0.018, 0.018).translate(gw - 0.09, 0.93, sg * 0.05), s0);
  const hinge = lay.at3(s0);
  return { frame: mergeBoxGeos(geos), leaf: mergeBoxGeos(leafGeos), hinge: { x: hinge.p[0], z: hinge.p[1], y: y0, ang: Math.atan2(-hinge.d[1], hinge.d[0]) }, side: lay.side };
}

Object.assign(View3D.prototype, {
  buildGate(l, lv, add, pick) {
    const G = gateGeometry(l, lv);
    const m = add(G.frame, GATE_MAT(), { cast: true, pick });
    m.userData.gate = true;
    // the leaf turns about its hinge: open, it stands at a right angle to the line, on its side (as drawn in 2D)
    const leaf = add(G.leaf, GATE_MAT(), { cast: true, pick: { ...pick, door: l.id } });
    leaf.userData.gate = true;
    const at = new THREE.Group(), swing = new THREE.Group();
    at.position.set(G.hinge.x, G.hinge.y, G.hinge.z);
    at.rotation.y = G.hinge.ang;
    leaf.parent.add(at);
    at.add(swing);
    swing.add(leaf);
    // a pane you can't see over the whole leaf: a tap between the bars still finds the gate
    G.leaf.computeBoundingBox();
    const bb = G.leaf.boundingBox, hit = new THREE.Mesh(new THREE.BoxGeometry(bb.max.x - bb.min.x, bb.max.y - bb.min.y, 0.05).translate((bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2, 0), GATE_HIT());
    Object.assign(hit.userData, pick, { door: l.id, gate: true, hit: true });
    swing.add(hit);
    const full = -G.side * Math.PI / 2;
    swing.rotation.y = this.doorClosed(l.id) ? 0 : full;
    this.registerDoor(l.id, swing, full);
    return m;
  },
});

/** walking: what of the garden lines stops you – walls, hedges, fences, the quay, the gate's railing; the gate's
 *  leaf while it is closed (it opens when you walk into it). Segments { a, b, t, y0, y1, door } in plan coordinates */
function gardenBlocks(garden, site, isOpen) {
  const out = [];
  if (!garden || !site) return out;
  const lv = site.level ?? -0.15;
  for (const l of garden.lines || []) {
    const P = gLinePath(l);
    if (P.length < 2) continue;
    const K = G_LINES[l.kind] || {};
    if (l.kind === 'gate') {
      const lay = gateLayout(l);
      for (const [a, b] of lay.runs) out.push({ a: lay.at3(a).p, b: lay.at3(b).p, t: 0.06, y0: lv - 1, y1: lv + lay.hr });
      // the posts either side of the leaf
      for (const s of [lay.s0 - 0.09, lay.s1 + 0.09]) { const q = lay.at3(Math.max(0, Math.min(lay.L, s))).p; out.push({ a: q, b: q, t: 0.12, y0: lv - 1, y1: lv + lay.hr }); }
      if (!isOpen(l.id)) out.push({ a: lay.at3(lay.s0).p, b: lay.at3(lay.s1).p, t: 0.05, y0: lv - 1, y1: lv + lay.H, door: l.id });
      continue;
    }
    if (!['wall', 'hedge', 'fence', 'quay'].includes(l.kind)) continue;
    const top = l.kind === 'quay' ? lv + 1.2 : lv + (l.h || K.h || 1);
    for (let i = 1; i < P.length; i++) out.push({ a: P[i - 1], b: P[i], t: l.t || K.t || 0.1, y0: lv - 3, y1: top });
  }
  return out;
}

/** 2D: the railing as a thin dark line with its posts, the leaf with its swing like a door */
function gateSvg(l, sel) {
  const lay = gateLayout(l);
  const out = [];
  const K = G_LINES.gate;
  const d = 'M' + lay.P.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L');
  // (a wider line underneath, so the gate is easy to tap)
  out.push(s('path', { d, class: 'g-line g-gate' + (sel ? ' sel' : ''), stroke: 'transparent', 'stroke-width': 0.3, 'data-gline': l.id }));
  for (const [a, b] of lay.runs) {
    const p = lay.at3(a).p, q = lay.at3(b).p;
    out.push(s('path', { d: `M${p[0].toFixed(3)} ${p[1].toFixed(3)}L${q[0].toFixed(3)} ${q[1].toFixed(3)}`, class: 'g-rail', stroke: K.color, 'stroke-width': 0.035 }));
  }
  let posts = '';
  for (const pt of lay.posts) { const { p } = lay.at3(pt.s); const r = pt.big ? 0.045 : 0.035; posts += `M${(p[0] - r).toFixed(3)} ${(p[1] - r).toFixed(3)}h${(2 * r).toFixed(3)}v${(2 * r).toFixed(3)}h${(-2 * r).toFixed(3)}Z`; }
  out.push(s('path', { d: posts, class: 'g-post', fill: K.color }));
  // the leaf, open at a right angle, and its swing
  const { p: h0, d: dd } = lay.at3(lay.s0);
  const n = V.mul([-dd[1], dd[0]], lay.side);
  const tip = V.add(h0, V.mul(n, lay.gw)), shut = V.add(h0, V.mul(dd, lay.gw));
  const sweep = (dd[0] * n[1] - dd[1] * n[0]) > 0 ? 0 : 1;
  out.push(s('path', { d: `M${h0[0].toFixed(3)} ${h0[1].toFixed(3)}L${tip[0].toFixed(3)} ${tip[1].toFixed(3)}`, class: 'g-gate-leaf', stroke: K.color, 'stroke-width': 0.04 }));
  out.push(s('path', { d: `M${tip[0].toFixed(3)} ${tip[1].toFixed(3)}A${lay.gw.toFixed(3)} ${lay.gw.toFixed(3)} 0 0 ${sweep} ${shut[0].toFixed(3)} ${shut[1].toFixed(3)}`, class: 'g-gate-swing', fill: 'none' }));
  return out;
}
