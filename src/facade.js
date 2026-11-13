/* ───────── Façade: an opening in an outside wall goes through all its layers ─────────
   The builder's outside walls are walls side by side: the inner leaf (drawn by the app), the insulation and the
   brick (both from the IFC model). A window put in one of them is made in all of them; moved, resized or deleted,
   the others follow. In 3D the model's brick is cut where a new or bigger opening is (with brick reveals and a
   sill), and an opening that is closed up gets bricked up. */

const ASM_GAP = 0.6;     // layers of one outside wall lie within this distance of each other

function isShellLayerWall(w) { return !!w && (w.kind === 'insulation' || (w.kind === 'exterior' && w.leaf === 'outer')); }

/** the other layers of an outside wall: parallel outside walls close by, overlapping along it */
function assemblyWalls(plan, w) {
  if (!w || w.kind === 'interior') return [];
  const L = wallLen(w);
  if (L < 0.05) return [];
  const d = wallDir(w), n = V.perp(d);
  return plan.walls.filter(w2 => {
    if (w2 === w || w2.storey !== w.storey || w2.kind === 'interior' || wallLen(w2) < 0.05) return false;
    if (Math.abs(V.cross(d, wallDir(w2))) > 0.02) return false;
    const off = Math.abs(V.dot(V.sub(V.lerp(w2.a, w2.b, 0.5), w.a), n));
    if (off > ASM_GAP || off < 0.005) return false;
    const ua = V.dot(V.sub(w2.a, w.a), d), ub = V.dot(V.sub(w2.b, w.a), d);
    return Math.max(ua, ub) > 0.05 && Math.min(ua, ub) < L - 0.05;
  });
}

/** the openings in the other layers that belong to this one (linked, or in the same place) */
function assemblyOpenings(plan, op) {
  const w = op && plan.walls.find(x => x.id === op.wall);
  if (!w || w.kind === 'interior') return [];
  const c = openingCenter(plan, op), d = wallDir(w);
  const out = [];
  for (const w2 of assemblyWalls(plan, w)) {
    let best = null, score = Infinity;
    for (const o of plan.openings) {
      if (o.wall !== w2.id || o === op) continue;
      const linked = (o.link && o.link === op.id) || (op.link && (op.link === o.id || o.link === op.link));
      const c2 = openingCenter(plan, o);
      if (!c2) continue;
      const along = Math.abs(V.dot(V.sub(c2, c), d));
      const y0 = Math.max(o.sill || 0, op.sill || 0), y1 = Math.min((o.sill || 0) + o.h, (op.sill || 0) + op.h);
      const fits = along < 0.15 && Math.abs(o.w - op.w) < 0.35 && y1 - y0 > 0.2;
      if (!linked && !fits) continue;
      const s = linked ? -1 : along;
      if (s < score) { score = s; best = o; }
    }
    if (best) out.push(best);
  }
  return out;
}

/** an opening of the façade, whose frame, glass and door leaves the builder's model brings (when it has a 3D model):
    not a door through a cavity wall between two rooms (two inner leaves with insulation between, e.g. into the
    berging), which the app draws */
function isModelDoor(plan, w, op) {
  if (!w || w.kind === 'interior') return false;
  if (op.leaf || isShellLayerWall(w)) return true;
  return !assemblyOpenings(plan, op).some(o => { const w2 = plan.walls.find(x => x.id === o.wall); return w2 && !isShellLayerWall(w2); });
}

/** a new opening in an outside wall: the same opening in its other layers (where they have room) */
function addAssemblyOpenings(plan, op) {
  const w = plan.walls.find(x => x.id === op.wall);
  if (!w || w.kind === 'interior') return [];
  const c = openingCenter(plan, op), added = [];
  for (const w2 of assemblyWalls(plan, w)) {
    const d2 = wallDir(w2), L2 = wallLen(w2);
    const pos = V.dot(V.sub(c, w2.a), d2);
    if (pos - op.w / 2 < -0.02 || pos + op.w / 2 > L2 + 0.02 || op.w > L2) continue;
    if (openingsOf(plan, w2.id).some(o => Math.abs(o.pos - pos) < (o.w + op.w) / 2 - 0.01)) continue;
    const o = { id: uid('o_'), wall: w2.id, kind: op.kind === 'window' ? 'window' : 'opening', pos: round(clamp(pos, op.w / 2, L2 - op.w / 2), 0.0005), w: op.w, h: op.h, sill: op.sill || 0, hinge: 'start', swing: 'left', leaf: true, link: op.id };
    plan.openings.push(o);
    added.push(o);
  }
  return added;
}

/** run fn (which changes or deletes the opening opId); the opening's other layers follow it */
function withAssembly(plan, opId, fn) {
  const op = plan.openings.find(o => o.id === opId);
  const asm = op ? assemblyOpenings(plan, op) : [];
  if (!asm.length) return fn(plan);
  const c0 = openingCenter(plan, op), w0 = op.w, h0 = op.h, s0 = op.sill || 0, k0 = op.kind;
  const res = fn(plan);
  const op1 = plan.openings.find(o => o.id === opId);
  if (!op1) { const gone = new Set(asm); plan.openings = plan.openings.filter(o => !gone.has(o)); return res; }
  const c1 = openingCenter(plan, op1);
  for (const o of asm) {
    const w2 = plan.walls.find(x => x.id === o.wall);
    if (!w2) continue;
    const L2 = wallLen(w2);
    if (c0 && c1) o.pos += V.dot(V.sub(c1, c0), wallDir(w2));
    o.w = clamp(o.w + op1.w - w0, 0.1, L2);
    o.h = Math.max(0.1, o.h + op1.h - h0);
    o.sill = Math.max(0, (o.sill || 0) + (op1.sill || 0) - s0);
    if (op1.kind !== k0) o.kind = op1.kind === 'window' ? 'window' : 'opening';
    o.pos = round(clamp(o.pos, o.w / 2, L2 - o.w / 2), 0.0005);
  }
  return res;
}

/** the openings deleted with these (their other layers) */
function withAssemblies(plan, ids) {
  const out = new Set(ids);
  for (const id of ids) { const op = plan.openings.find(o => o.id === id); if (op) for (const o of assemblyOpenings(plan, op)) out.add(o.id); }
  return out;
}

/* ───────── what changed in the façade, compared with the builder's house ───────── */
const FX_EPS = 0.004;
function sameOpeningShape(a, b) {
  return a.wall === b.wall && a.kind === b.kind && Math.abs(a.pos - b.pos) < FX_EPS && Math.abs(a.w - b.w) < FX_EPS && Math.abs(a.h - b.h) < FX_EPS && Math.abs((a.sill || 0) - (b.sill || 0)) < FX_EPS;
}
function sameWallLine(a, b) { return !!a && !!b && V.dist(a.a, b.a) < 0.002 && V.dist(a.b, b.b) < 0.002 && Math.abs(a.t - b.t) < 0.002; }

/** per storey: openings of the outside walls that are new or changed (fresh: ids in this plan), and on the
    brick/insulation layers the ones that went (removed) and came (added) */
function facadeDiff(orig, plan, sid) {
  const res = { fresh: new Set(), removed: [], added: [] };
  if (!orig || !plan || orig === plan) return res;
  const oW = new Map(orig.walls.map(w => [w.id, w])), nW = new Map(plan.walls.map(w => [w.id, w]));
  const oOps = new Map(orig.openings.map(o => [o.id, o]));
  const nOps = new Map(plan.openings.map(o => [o.id, o]));
  for (const op of plan.openings) {
    const w = nW.get(op.wall);
    if (!w || w.storey !== sid || w.kind === 'interior') continue;
    const o0 = oOps.get(op.id);
    if (!o0 || !sameOpeningShape(o0, op)) res.fresh.add(op.id);
  }
  // only the layers the model draws, and only where the layer wall itself did not move
  for (const w0 of orig.walls) {
    if (w0.storey !== sid || !isShellLayerWall(w0)) continue;
    const w1 = nW.get(w0.id);
    if (!sameWallLine(w0, w1)) continue;
    for (const o of orig.openings) if (o.wall === w0.id) { const n = nOps.get(o.id); if (!n || !sameOpeningShape(o, n)) res.removed.push({ wall: w0, op: o }); }
    for (const o of plan.openings) if (o.wall === w0.id) { const p0 = oOps.get(o.id); if (!p0 || !sameOpeningShape(p0, o)) res.added.push({ wall: w1, op: o }); }
  }
  return res;
}

function facadeInfo(spec, en) {
  if (en._facade) return en._facade;
  const orig = spec && spec.origPlan;
  en._facade = facadeDiff(orig, en.plan, en.storey.id);
  return en._facade;
}

/* ───────── cutting the model's façade ───────── */

/** an opening's box, in the frame of its wall: u along, v across (from the wall's line), y up */
function fxBox(w, op, grow) {
  const d = wallDir(w), g = grow || {};
  const s = op.pos - op.w / 2, e = op.pos + op.w / 2;
  return { o: w.a, d, n: V.perp(d), u0: s - (g.u || 0), u1: e + (g.u || 0), y0: (op.sill || 0) - (g.down || 0), y1: (op.sill || 0) + op.h + (g.up || 0), sill: op.sill || 0, kind: op.kind, walls: [w] };
}
/** the same box seen from another (parallel) frame */
function fxRebase(b, frame) {
  const p0 = V.add(b.o, V.mul(b.d, b.u0)), p1 = V.add(b.o, V.mul(b.d, b.u1));
  const u = [V.dot(V.sub(p0, frame.o), frame.d), V.dot(V.sub(p1, frame.o), frame.d)];
  return { u0: Math.min(...u), u1: Math.max(...u) };
}
/** boxes of the layers of one opening together: one box through the wall */
function fxCluster(items) {
  const out = [];
  for (const b of items) {
    const c = V.add(b.o, V.mul(b.d, (b.u0 + b.u1) / 2));
    const hit = out.find(k => Math.abs(V.cross(k.d, b.d)) < 0.02 && Math.abs(V.dot(V.sub(c, k.o), k.n)) < 0.8 && (() => { const r = fxRebase(b, k); return r.u1 > k.u0 + 0.02 && r.u0 < k.u1 - 0.02; })() && b.y1 > k.y0 + 0.05 && b.y0 < k.y1 - 0.05);
    if (!hit) { out.push({ ...b, walls: [...b.walls] }); continue; }
    const r = fxRebase(b, hit);
    hit.u0 = Math.min(hit.u0, r.u0); hit.u1 = Math.max(hit.u1, r.u1);
    hit.y0 = Math.min(hit.y0, b.y0); hit.y1 = Math.max(hit.y1, b.y1);
    hit.sill = Math.min(hit.sill, b.sill);
    if (b.kind === 'window') hit.kind = 'window';
    for (const w of b.walls) if (!hit.walls.includes(w)) hit.walls.push(w);
  }
  return out;
}
/** where a wall's two faces are, across a box's frame */
function fxWallV(frame, w) { const vc = V.dot(V.sub(w.a, frame.o), frame.n); return [vc - w.t / 2, vc + w.t / 2]; }

const FX_SKIP = m => m.roof || m.floor || m.door;
const FX_OPENING_PART = (key, m) => m.win || m.odoor || /^(frame|glass|leaf|metal|groove|bead)(\||$)/.test(key);

/** the triangles of a part, cut by boxes: kept outside them, dropped inside (convex pieces, same winding) */
function fxCutPart(part, boxes) {
  const P = part.pos, I = part.idx;
  // a box's corners in the world, for a quick test
  const aabbs = boxes.map(b => {
    const xs = [], zs = [];
    for (const u of [b.u0, b.u1]) for (const v of [b.v0, b.v1]) { const p = V.add(b.o, V.add(V.mul(b.d, u), V.mul(b.n, v))); xs.push(p[0]); zs.push(p[1]); }
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: b.y0, y1: b.y1 };
  });
  const out = [];
  let touched = false;
  const tri = new Array(3);
  for (let t = 0; t < I.length; t += 3) {
    for (let k = 0; k < 3; k++) { const i = I[t + k] * 3; tri[k] = [P[i], P[i + 1], P[i + 2]]; }
    let polys = null;
    for (let bi = 0; bi < boxes.length; bi++) {
      const A = aabbs[bi];
      const list = polys || [tri.map(p => p.slice())];
      // all pieces clear of this box?
      let near = false;
      for (const poly of list) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2]; }
        if (x1 > A.x0 && x0 < A.x1 && y1 > A.y0 && y0 < A.y1 && z1 > A.z0 && z0 < A.z1) { near = true; break; }
      }
      if (!near) continue;
      const b = boxes[bi], next = [];
      for (const poly of list) for (const piece of fxSubtract(poly, b)) next.push(piece);
      polys = next;
      touched = true;
    }
    if (!polys) { out.push(tri[0][0], tri[0][1], tri[0][2], tri[1][0], tri[1][1], tri[1][2], tri[2][0], tri[2][1], tri[2][2]); continue; }
    for (const poly of polys) for (let k = 1; k < poly.length - 1; k++) out.push(...poly[0], ...poly[k], ...poly[k + 1]);
  }
  if (!touched) return null;
  return out;
}
/** a convex polygon minus a box: the pieces outside it */
function fxSubtract(poly, b) {
  const coord = p => { const dx = p[0] - b.o[0], dz = p[2] - b.o[1]; return [dx * b.d[0] + dz * b.d[1], dx * b.n[0] + dz * b.n[1], p[1]]; };
  let cur = poly.map(p => ({ p, c: coord(p) }));
  const out = [];
  const planes = [[0, b.u0, 1], [0, b.u1, -1], [1, b.v0, 1], [1, b.v1, -1], [2, b.y0, 1], [2, b.y1, -1]];
  for (const [k, bound, sign] of planes) {
    const ins = [], outs = [];
    for (let i = 0; i < cur.length; i++) {
      const A = cur[i], B = cur[(i + 1) % cur.length];
      const da = sign * (A.c[k] - bound), db = sign * (B.c[k] - bound);
      if (da >= 0) ins.push(A);
      if (da <= 0) outs.push(A);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db);
        const X = { p: [0, 1, 2].map(j => A.p[j] + (B.p[j] - A.p[j]) * t), c: [0, 1, 2].map(j => A.c[j] + (B.c[j] - A.c[j]) * t) };
        ins.push(X); outs.push(X);
      }
    }
    if (outs.length >= 3 && fxArea(outs) > 1e-9) out.push(outs.map(x => x.p));
    if (ins.length < 3 || fxArea(ins) <= 1e-9) return out;
    cur = ins;
  }
  return out;   // what is left lies inside the box
}
function fxArea(poly) {
  let x = 0, y = 0, z = 0;
  const p0 = poly[0].p || poly[0];
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[i].p || poly[i], b = poly[i + 1].p || poly[i + 1];
    const ux = a[0] - p0[0], uy = a[1] - p0[1], uz = a[2] - p0[2], vx = b[0] - p0[0], vy = b[1] - p0[1], vz = b[2] - p0[2];
    x += uy * vz - uz * vy; y += uz * vx - ux * vz; z += ux * vy - uy * vx;
  }
  return Math.hypot(x, y, z) / 2;
}
/** a flat quad (box-frame corners [u, v, y]) as two triangles, turned to face `normal` (world) */
function fxQuad(out, b, corners, normal) {
  const W = corners.map(([u, v, y]) => { const p = V.add(b.o, V.add(V.mul(b.d, u), V.mul(b.n, v))); return [p[0], y, p[1]]; });
  const e1 = [W[1][0] - W[0][0], W[1][1] - W[0][1], W[1][2] - W[0][2]], e2 = [W[2][0] - W[0][0], W[2][1] - W[0][1], W[2][2] - W[0][2]];
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (cr[0] * normal[0] + cr[1] * normal[1] + cr[2] * normal[2] < 0) W.reverse();
  out.push(...W[0], ...W[1], ...W[2], ...W[0], ...W[2], ...W[3]);
}
const fxN = (b, s) => [b.n[0] * s, 0, b.n[1] * s];
const fxD = (b, s) => [b.d[0] * s, 0, b.d[1] * s];

/** which part (material) a stretch of a layer is made of, and where its faces really are (from the model) */
function fxLayerLook(parts, materials, b, va, vb) {
  const area = new Map();
  const faces = [];
  const reach = 1.2;
  for (const part of parts) {
    const m = materials[part.key] || {};
    if (FX_SKIP(m) || FX_OPENING_PART(part.key, m)) continue;
    const P = part.pos, I = part.idx;
    let a = 0;
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3;
      const cx = (P[i0] + P[i1] + P[i2]) / 3, cy = (P[i0 + 1] + P[i1 + 1] + P[i2 + 1]) / 3, cz = (P[i0 + 2] + P[i1 + 2] + P[i2 + 2]) / 3;
      if (cy < b.y0 - 0.5 || cy > b.y1 + 0.5) continue;
      const dx = cx - b.o[0], dz = cz - b.o[1];
      const u = dx * b.d[0] + dz * b.d[1], v = dx * b.n[0] + dz * b.n[1];
      if (u < b.u0 - reach || u > b.u1 + reach || v < va - 0.03 || v > vb + 0.03) continue;
      // the triangle's normal across the wall
      const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2], wx = P[i2] - P[i0], wy = P[i2 + 1] - P[i0 + 1], wz = P[i2 + 2] - P[i0 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;
      const across = (nx * b.n[0] + nz * b.n[1]) / len;
      if (Math.abs(across) > 0.95) { a += len / 2; faces.push(v); }
    }
    if (a > 0) area.set(part.key, (area.get(part.key) || 0) + a);
  }
  let key = null, best = 0, keyOut = null, bestOut = 0;
  for (const [k, a] of area) {
    if (a > best) { best = a; key = k; }
    const m = materials[k] || {};
    if ((m.out || m.kind === 'brick') && !m.plinth && a > bestOut) { bestOut = a; keyOut = k; }
  }
  const inRange = faces.filter(v => v >= va - 0.03 && v <= vb + 0.03);
  return { key, keyOut, v0: inRange.length ? Math.min(...inRange) : va, v1: inRange.length ? Math.max(...inRange) : vb };
}

const FACADE_CACHE = new WeakMap();   // shell → Map(signature → parts)
const FX_SILL_MAT = { kind: 'plain', color: [0.56, 0.57, 0.56], out: true };

/** the model's parts of one storey with the façade changes worked in (or the parts as they are) */
function facadeShellParts(shell, sid, plan, fx, inDiff) {
  const parts = shell.storeys[sid];
  if (!parts || (!fx.removed.length && !fx.added.length)) return parts;
  const sig = sid + '|' + (inDiff ? 1 : 0) + '|' + JSON.stringify(fx.removed.map(r => [r.op.id, r.op.pos, r.op.w, r.op.h, r.op.sill])) + JSON.stringify(fx.added.map(r => [r.op.id, r.wall.id, r.op.pos, r.op.w, r.op.h, r.op.sill, r.op.kind]));
  let cache = FACADE_CACHE.get(shell);
  if (!cache) FACADE_CACHE.set(shell, cache = new Map());
  if (cache.has(sig)) return cache.get(sig);
  const M = shell.materials;
  const layerRange = (b, walls) => { let a = Infinity, z = -Infinity; for (const w of walls) { const [p, q] = fxWallV(b, w); a = Math.min(a, p); z = Math.max(z, q); } return [a, z]; };
  // 1. openings that went: clear them (frame, glass, sill and the brick around; not below the opening), then brick and insulation in
  // (in the comparison the app draws the filled-in piece in red: there only the window itself goes)
  const gone = fxCluster(fx.removed.map(r => fxBox(r.wall, r.op, inDiff ? {} : { u: 0.06, down: (r.op.sill || 0) > 0.05 ? 0 : 0.03, up: 0.03 })));
  const clears = [], patches = [];
  for (const b of gone) {
    // across the whole outside wall (the inner leaf is drawn by the app), plus what sticks out (sills)
    const lay = [...b.walls];
    for (const w of b.walls) for (const w2 of assemblyWalls(plan, w)) if (!lay.includes(w2)) lay.push(w2);
    const [va, vb] = layerRange(b, lay);
    clears.push({ ...b, v0: va - 0.14, v1: vb + 0.14 });
    if (!inDiff) for (const w of b.walls) { const [p, q] = fxWallV(b, w); patches.push({ b, w, va: p, vb: q }); }
  }
  // 2. openings that came: cut through the brick and insulation, with reveals and a sill
  const come = fxCluster(fx.added.map(r => fxBox(r.wall, r.op, { down: r.op.kind === 'window' && (r.op.sill || 0) > 0.25 ? 0.06 : 0 })));
  const cuts = [];
  for (const b of come) {
    const [va, vb] = layerRange(b, b.walls);
    // which side is outside: away from the inner leaf
    const inner = assemblyWalls(plan, b.walls[0]).concat(b.walls).find(w => w.kind === 'exterior' && w.leaf !== 'outer' && !isShellLayerWall(w));
    const out = inner ? (V.dot(V.sub(inner.a, b.o), b.n) < (va + vb) / 2 ? 1 : -1) : 0;
    // the model's faces can sit a little off the plan's wall lines: cut to where they really are
    const look = fxLayerLook(parts, M, b, va, vb);
    // and through what sticks out of the brick there (bands, sills)
    cuts.push({ ...b, v0: Math.min(va, look.v0) - (out < 0 ? 0.09 : 0.012), v1: Math.max(vb, look.v1) + (out > 0 ? 0.09 : 0.012), out, look });
  }
  const looks = patches.map(pt => ({ pt, look: fxLayerLook(parts, M, pt.b, pt.va, pt.vb) }));
  const cutLooks = cuts.map(b => ({ b, look: b.look }));
  // clear, then add the patches, then cut
  const byKey = new Map();
  for (const part of parts) {
    const m = M[part.key] || {};
    if (FX_SKIP(m) || !clears.length) { byKey.set(part.key, { part, tris: null }); continue; }
    const tris = fxCutPart(part, clears);
    byKey.set(part.key, { part, tris });
  }
  const extra = new Map();   // key → triangles added
  const addTo = (key, tris) => { if (!extra.has(key)) extra.set(key, []); extra.get(key).push(...tris); };
  for (const { pt, look } of looks) {
    if (!look.key) continue;
    const b = pt.b, inset = 0;
    const v0 = Math.max(pt.va - 0.02, Math.min(look.v0, pt.vb)) + inset, v1 = Math.min(pt.vb + 0.02, Math.max(look.v1, pt.va)) - inset;
    if (v1 - v0 < 0.005) continue;
    const t = [];
    fxQuad(t, b, [[b.u0, v1, b.y0], [b.u1, v1, b.y0], [b.u1, v1, b.y1], [b.u0, v1, b.y1]], fxN(b, 1));
    fxQuad(t, b, [[b.u0, v0, b.y0], [b.u1, v0, b.y0], [b.u1, v0, b.y1], [b.u0, v0, b.y1]], fxN(b, -1));
    addTo(look.key, t);
  }
  // merge: kept triangles + patches, then cut the new openings out of everything that is not a door
  const result = [];
  const cutKeys = new Set();
  for (const [key, { part, tris }] of byKey) {
    const m = M[key] || {};
    let pos = tris ? tris : null;
    if (extra.has(key)) { if (!pos) pos = fxFlat(part); pos = pos.concat(extra.get(key)); }
    let p2 = pos ? fxPart(key, pos) : part;
    if (cuts.length && !FX_SKIP(m)) {
      const cut = fxCutPart(p2, cuts);
      if (cut) { p2 = fxPart(key, cut); cutKeys.add(key); }
    }
    result.push(p2);
  }
  // reveals (in the brick's look) and a sill under new windows
  for (const { b, look } of cutLooks) {
    const k0 = look.keyOut || look.key;
    const key = k0 && byKey.has(k0) ? k0 : null;
    if (!key) continue;
    const v0 = Math.max(b.v0, look.v0), v1 = Math.min(b.v1, look.v1);
    if (v1 - v0 < 0.01) continue;
    const t = [];
    const sillY = b.kind === 'window' && b.sill > 0.25 ? b.sill : b.y0;
    fxQuad(t, b, [[b.u0, v0, sillY], [b.u0, v1, sillY], [b.u0, v1, b.y1], [b.u0, v0, b.y1]], fxD(b, 1));
    fxQuad(t, b, [[b.u1, v0, sillY], [b.u1, v1, sillY], [b.u1, v1, b.y1], [b.u1, v0, b.y1]], fxD(b, -1));
    fxQuad(t, b, [[b.u0, v0, b.y1], [b.u1, v0, b.y1], [b.u1, v1, b.y1], [b.u0, v1, b.y1]], [0, -1, 0]);
    if (sillY > 0.02 && sillY === b.y0) fxQuad(t, b, [[b.u0, v0, b.y0], [b.u1, v0, b.y0], [b.u1, v1, b.y0], [b.u0, v1, b.y0]], [0, 1, 0]);
    const i = result.findIndex(p => p.key === key);
    result[i] = fxPart(key, fxFlat(result[i]).concat(t));
    // a sill (raamdorpel) under a window: from the inside of the brick to just outside it
    if (sillY !== b.y0 && b.out) {
      const s = [];
      const vin = b.out > 0 ? v0 : v1, vout = b.out > 0 ? v1 + 0.045 : v0 - 0.045;
      const lo = Math.min(vin, vout), hi = Math.max(vin, vout), y0 = b.y0, y1 = sillY;
      fxQuad(s, b, [[b.u0, lo, y1], [b.u1, lo, y1], [b.u1, hi, y1], [b.u0, hi, y1]], [0, 1, 0]);
      fxQuad(s, b, [[b.u0, lo, y0], [b.u1, lo, y0], [b.u1, hi, y0], [b.u0, hi, y0]], [0, -1, 0]);
      const vo = b.out > 0 ? hi : lo;
      fxQuad(s, b, [[b.u0, vo, y0], [b.u1, vo, y0], [b.u1, vo, y1], [b.u0, vo, y1]], fxN(b, b.out));
      fxQuad(s, b, [[b.u0, lo, y0], [b.u0, hi, y0], [b.u0, hi, y1], [b.u0, lo, y1]], fxD(b, -1));
      fxQuad(s, b, [[b.u1, lo, y0], [b.u1, hi, y0], [b.u1, hi, y1], [b.u1, lo, y1]], fxD(b, 1));
      const sp = fxPart('fx:sill', s);
      sp.mat = FX_SILL_MAT;
      result.push(sp);
    }
  }
  // keep the last few; the geometry of older ones is let go
  while (cache.size >= 16) {
    const [k, old] = cache.entries().next().value;
    cache.delete(k);
    for (const p of old) if (p.fx && typeof SHELL_GEO !== 'undefined' && SHELL_GEO.has(p)) SHELL_GEO.get(p).dispose();
  }
  cache.set(sig, result);
  return result;
}
function fxFlat(part) {
  const out = [], P = part.pos, I = part.idx;
  for (let t = 0; t < I.length; t++) { const i = I[t] * 3; out.push(P[i], P[i + 1], P[i + 2]); }
  return out;
}
function fxPart(key, flat) {
  const pos = new Float32Array(flat);
  const idx = new Uint32Array(pos.length / 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  return { key, pos, idx, fx: true };
}

/* ───────── upstands: the low walls on which the façade of an upper storey stands, above a lower roof ─────────
   The builder models them in aerated concrete with the roofing up against them; seen from outside they should be
   part of the brick façade (no white band, no slot at the corner). */
/** ids of the low walls (≤ 0.6 m) of an upper storey that stand in the line of its façade brick */
function facadeUpstands(plan, st, storeys) {
  const out = new Set();
  const lowest = storeys.length ? Math.min(...storeys.map(s2 => s2.elevation || 0)) : 0;
  if ((st.elevation || 0) <= lowest + 0.01) return out;
  const brick = plan.walls.filter(w => w.storey === st.id && w.kind === 'exterior' && w.leaf === 'outer');
  for (const w of plan.walls) {
    if (w.storey !== st.id || isShellLayerWall(w) || wallLen(w) < 0.05) continue;
    if (!(w.h > 0) || w.h > 0.6) continue;
    const d = wallDir(w), m = V.lerp(w.a, w.b, 0.5);
    const near = brick.some(b => {
      const db = wallDir(b);
      if (Math.abs(d[0] * db[1] - d[1] * db[0]) > 0.03) return false;
      const pr = projectOnSegment(m, b.a, b.b);
      return pr.d < 0.08 || projectOnSegment(w.a, b.a, b.b).d < 0.08 || projectOnSegment(w.b, b.a, b.b).d < 0.08;
    });
    if (near) out.add(w.id);
  }
  return out;
}
/** the façade's own brick (the darker brick of the model: the white brick is only for accents) */
function facadeBrickMat(shell) {
  // the brick the model uses most (by area), leaving out light accent brick
  const mats = (shell && shell.materials) || {};
  const area = new Map();
  for (const parts of Object.values((shell && shell.storeys) || {})) for (const part of parts) {
    const key = part.key, m = mats[key];
    if (!m || m.kind !== 'brick' || !m.color) continue;
    if (0.2126 * m.color[0] + 0.7152 * m.color[1] + 0.0722 * m.color[2] > 0.6) continue;
    area.set(key, (area.get(key) || 0) + (part.idx ? part.idx.length : 0));
  }
  let best = null;
  for (const [key, n] of area) if (!best || n > best.n) best = { key, n };
  return best ? shellMaterial(best.key, mats[best.key]) : brickMat();
}
Object.assign(View3D.prototype, {
  /** where two upstands meet at a corner (their ends a few cm apart), a piece of the same brick closes the gap */
  buildUpstandCorners(g, plan, ids, m, st, cutH) {
    const ws = plan.walls.filter(w => ids.has(w.id));
    const done = new Set();
    for (const w of ws) for (const p of [w.a, w.b]) for (const w2 of ws) {
      if (w2 === w) continue;
      for (const q of [w2.a, w2.b]) {
        const D = V.dist(p, q), key = [w.id, w2.id].sort().join('|');
        if (D < 0.01 || D > 0.35 || done.has(key)) continue;
        done.add(key);
        let h = Math.min(w.h, w2.h);
        if (cutH != null) h = Math.min(h, cutH);
        const t = Math.max(w.t, w2.t) + 0.006, d = V.norm(V.sub(q, p));
        const geo = new THREE.BoxGeometry(D + t, h, t);
        // UVs in metres, like the walls (the brick keeps its size)
        const uv = geo.attributes.uv, dims = [[t, h], [t, h], [D + t, t], [D + t, t], [D + t, h], [D + t, h]];
        for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
        const mesh = new THREE.Mesh(geo, m);
        const c = V.lerp(p, q, 0.5);
        mesh.position.set(c[0], h / 2, c[1]);
        mesh.rotation.y = Math.atan2(-d[1], d[0]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.upstandCorner = true;
        g.add(mesh);
      }
    }
  },
});
