/* ───────────── model.js — the house: projects → versions → storeys → walls / openings / rooms ─────────────
   All lengths are metres. Plan x → right, plan y → "down" the drawing (towards the back of the house).
   A version is a full copy of the plan; element ids are kept when copying, so rooms can be compared by id.
*/

const SCHEMA = 1;

const FLOOR_MATERIALS = [
  { id: 'screed', label: 'Screed (dekvloer)', color: '#B9B5AC' },
  { id: 'casco', label: 'Casco – no screed yet (the pipes on the slab)', color: '#A29D94' },
  { id: 'oak', label: 'Wood / parquet', color: '#C49A6C' },
  { id: 'laminate', label: 'Laminate', color: '#B8946A' },
  { id: 'pvc', label: 'PVC / vinyl', color: '#A89F92' },
  { id: 'tiles', label: 'Tiles', color: '#8D9192' },
  { id: 'stone', label: 'Natural stone', color: '#CFCAC0' },
  { id: 'cast', label: 'Cast floor (gietvloer)', color: '#A7A9A6' },
  { id: 'carpet', label: 'Carpet', color: '#8E8478' },
  { id: 'other', label: 'Other', color: '#BBBBBB' },
];
const floorLabel = id => (FLOOR_MATERIALS.find(f => f.id === id) || { label: id || '—' }).label;

const WALL_FINISH_DEFAULT = '#EDEBE6';

const DEFAULTS = {
  wallHeight: 2.6,
  storeyHeight: 2.85,
  extT: 0.3,
  intT: 0.1,
  doorW: 0.93, doorH: 2.31,
  winW: 1.2, winH: 1.3, winSill: 0.9,
};

function newStorey(name, level, elevation) {
  return { id: uid('st_'), name, level, elevation, height: DEFAULTS.storeyHeight, wallHeight: DEFAULTS.wallHeight };
}

function emptyPlan() { return { walls: [], openings: [], rooms: [], voids: [] }; }

/** holes in a room's floor: the floor openings (stairwells) of its storey, cut to the room */
function roomHoles(plan, room) {
  const out = [];
  // stairwells: the openings of the builder's model, and the opening above a stair drawn in the app
  const voids = (plan.voids || []).filter(v => v.storey === room.storey).concat((plan.stairs || []).filter(s => s.upper === room.storey).flatMap(s => stairHoles(s).map(poly => ({ storey: room.storey, poly }))));
  for (const v of voids) {
    if (v.storey !== room.storey || v.poly.length < 3) continue;
    const bb = bboxOfPoints(v.poly), rb = bboxOfPoints(room.poly);
    if (bb.minX > rb.maxX || bb.maxX < rb.minX || bb.minY > rb.maxY || bb.maxY < rb.minY) continue;
    // line the opening up with the room's edges when it is within a centimetre of them (no slivers)
    const xs = room.poly.map(q => q[0]), ys = room.poly.map(q => q[1]);
    const snap = (val, list) => { let best = val, d = 0.0101; for (const c of list) if (Math.abs(c - val) < d) { d = Math.abs(c - val); best = c; } return best; };
    const vp = v.poly.map(q => [snap(q[0], xs), snap(q[1], ys)]);
    // the part of the (rectangular) opening inside this room; cut to the room, so it never pokes out of the floor
    const part = clipToConvex(room.poly, vp);
    if (part.length >= 3 && Math.abs(polygonArea(part)) > 0.05) out.push(dedupeRing(part));
  }
  return out;
}
/** drop repeated and in-line points of a ring (they upset the floor triangulation) */
function dedupeRing(ring) {
  const pts = [];
  for (const q of ring) if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1e-4) pts.push(q);
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1e-4) pts.pop();
  return pts.filter((q, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], c = pts[(i + 1) % pts.length];
    return Math.abs((q[0] - a[0]) * (c[1] - q[1]) - (q[1] - a[1]) * (c[0] - q[0])) > 1e-7;
  });
}

/** the part of a polygon on one side of the line a→b (inside = left of a→b for a counter-clockwise ring) */
function clipHalfPlane(poly, a, b, inside) {
  const side = p => { const s = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return inside ? s : -s; };
  const out = [];
  for (let j = 0; j < poly.length; j++) {
    const P = poly[j], Q = poly[(j + 1) % poly.length], sp = side(P), sq = side(Q);
    if (sp >= -1e-12) out.push(P);
    if ((sp >= -1e-12) !== (sq >= -1e-12)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
/** a polygon minus a convex polygon, as pieces without holes (one piece per side of the convex one) */
function minusConvex(poly, C) {
  if (polygonArea(C) < 0) C = C.slice().reverse();
  const out = [];
  let rest = poly;
  for (let i = 0; i < C.length && rest.length >= 3; i++) {
    const a = C[i], b = C[(i + 1) % C.length];
    const outside = clipHalfPlane(rest, a, b, false);
    if (outside.length >= 3) out.push(outside);
    rest = clipHalfPlane(rest, a, b, true);
  }
  return out;
}
/** a room's floor or ceiling as THREE shapes. Openings on the room's edge (a stairwell along a wall) are cut out
    as pieces: as a hole that touches the outline they upset the triangulation (the Overloop's floor then covered
    part of the stair). Openings well inside the room stay holes. Slivers (under 10 cm²) are left out.
    toV2 turns a plan point into the shape's Vector2. */
function floorShapes(poly, holes, toV2) {
  if (!holes.length) return [new THREE.Shape(poly.map(toV2))];
  const onEdge = h => h.some(q => distToPolygonEdges(q, poly) < 0.005);
  let pieces = [poly];
  const inner = [];
  for (const h of holes) {
    if (onEdge(h)) pieces = pieces.flatMap(pc => minusConvex(pc, convexHull(h)));
    else inner.push(h);
  }
  pieces = pieces.map(dedupeRing).filter(pc => pc.length >= 3 && Math.abs(polygonArea(pc)) > 0.001);
  // openings inside: a hole of the piece they lie in (or cut out too when they straddle two pieces)
  for (const h of inner) {
    const home = pieces.find(pc => h.every(q => pointInPolygon(q, pc) && distToPolygonEdges(q, pc) > 0.002));
    if (home) (home.holes = home.holes || []).push(h);
    else pieces = pieces.flatMap(pc => minusConvex(pc, convexHull(h)).map(dedupeRing).filter(x => x.length >= 3 && Math.abs(polygonArea(x)) > 0.001));
  }
  return pieces.map(pc => {
    const sh = new THREE.Shape(pc.map(toV2));
    for (const h of pc.holes || []) sh.holes.push(new THREE.Path(h.map(toV2)));
    return sh;
  });
}

function newProject(name, storeyNames = ['Ground floor', 'First floor', 'Second floor']) {
  const storeys = storeyNames.map((n, i) => newStorey(n, i, +(i * DEFAULTS.storeyHeight).toFixed(3)));
  const original = {
    id: uid('v_'), name: 'Original', kind: 'original', locked: false, status: 'active',
    created: Date.now(), updated: Date.now(), note: 'The house as it is delivered.', plan: emptyPlan(),
  };
  return {
    app: 'house-planner', schema: SCHEMA,
    id: uid('p_'), name: name || 'Our house',
    created: Date.now(), updated: Date.now(),
    storeys, underlays: {},
    versions: [original],
    activeVersionId: original.id,
  };
}

function migrateProject(p) {
  p.app = 'house-planner';
  p.schema = p.schema || SCHEMA;
  p.storeys = p.storeys || [];
  p.underlays = p.underlays || {};
  p.versions = p.versions || [];
  for (const st of p.storeys) {
    if (st.wallHeight == null) st.wallHeight = DEFAULTS.wallHeight;
    if (st.height == null) st.height = DEFAULTS.storeyHeight;
    if (st.elevation == null) st.elevation = 0;
  }
  for (const v of p.versions) {
    v.plan = v.plan || emptyPlan();
    v.plan.walls = v.plan.walls || [];
    v.plan.openings = v.plan.openings || [];
    v.plan.rooms = v.plan.rooms || [];
    v.plan.points = v.plan.points || [];
    v.plan.stairs = v.plan.stairs || [];
    v.status = v.status || 'active';
    for (const r of v.plan.rooms) {
      r.floor = r.floor || { material: 'screed', color: '#B9B5AC' };
      r.items = r.items || [];
      if (r.notes == null) r.notes = '';
    }
  }
  // houses read from IFC before walls were joined: join them now, the same way in every version
  if (p.source && p.source.kind === 'ifc' && !p.wallsJoined) {
    for (const v of p.versions) joinWalls(v.plan);
    p.wallsJoined = true;
  }
  // furniture layouts, doors, notes, viewpoints, walking paths and people (all added later; older files get them empty)
  p.doorState = p.doorState || {};
  p.furniture = p.furniture || {};
  p.furniture.layouts = p.furniture.layouts || [];
  p.furniture.sets = p.furniture.sets || [];
  if (!p.furniture.layouts.length) p.furniture.layouts.push({ id: uid('l_'), name: 'Layout 1', items: [], created: Date.now() });
  for (const l of p.furniture.layouts) { l.items = l.items || []; for (const f of l.items) f.shop = f.shop || {}; }
  if (!p.furniture.layouts.find(l => l.id === p.furniture.activeLayoutId)) p.furniture.activeLayoutId = p.furniture.layouts[0].id;
  p.notes = p.notes || [];
  for (const n of p.notes) { n.photos = n.photos || []; n.status = n.status || 'open'; n.type = n.type || 'todo'; }
  p.viewpoints = p.viewpoints || [];
  p.walk = p.walk || {};
  p.walk.nodes = p.walk.nodes || [];
  p.walk.edges = p.walk.edges || [];
  p.walk.routes = p.walk.routes || [];
  p.people = p.people && p.people.length ? p.people : [{ id: 'pp_1', name: 'Person 1', eye: 1.65, speed: 1.3 }, { id: 'pp_2', name: 'Person 2', eye: 1.8, speed: 1.4 }];
  // the plot and the garden (the example gets its site plan)
  migrateSite(p);
  // your own imported 3D models (session 2): { id: { name, asset, size, o, u, fix, … } }
  p.models = p.models || {};
  // finishes per wall, tiles and wallpaper pictures (session 3)
  migrateFinishes(p);
  // what only the house built into the app has (its own kitchen, installations, documents …: HOUSE, house.js)
  if (HOUSE.migrate) HOUSE.migrate(p);
  if (!p.versions.find(v => v.kind === 'original') && p.versions[0]) p.versions[0].kind = 'original';
  if (!p.versions.find(v => v.id === p.activeVersionId)) p.activeVersionId = (p.versions.find(v => v.kind !== 'original') || p.versions[0] || {}).id;
  return p;
}

const getOriginal = p => p.versions.find(v => v.kind === 'original');
const getVersion = (p, id) => p.versions.find(v => v.id === id);
const getStorey = (p, id) => p.storeys.find(s => s.id === id);
const sortedStoreys = p => [...p.storeys].sort((a, b) => a.level - b.level);

function duplicateVersion(p, srcId, name) {
  const src = getVersion(p, srcId);
  const v = {
    id: uid('v_'), name: name || (src.name + ' (copy)'), kind: 'plan', locked: false, status: 'active',
    created: Date.now(), updated: Date.now(), note: '', basedOn: src.id, plan: clone(src.plan),
  };
  // baked light from Fresing Render: the copy shares it (the same files; parts changed later show live light)
  if (src.bake) v.bake = clone(src.bake);
  const idx = p.versions.indexOf(src);
  p.versions.splice(idx + 1, 0, v);
  return v;
}

/* ───────── walls ───────── */
const wallLen = w => V.dist(w.a, w.b);
const wallDir = w => V.norm(V.sub(w.b, w.a));
const wallNormal = w => V.perp(wallDir(w));
/** a wall's height: its own, or (walls under the roof) the highest point of its sloping top, or the storey's */
const wallHeight = (w, storey) => (w.h != null && w.h > 0) ? Math.max(w.h, wallTopMax(w)) : (w.top && w.top.length > 1 ? wallTopMax(w) : (storey ? storey.wallHeight : DEFAULTS.wallHeight));
const wallTopMax = w => (w.top && w.top.length ? Math.max(...w.top.map(q => q[1])) : 0);

function openingsOf(plan, wallId) { return plan.openings.filter(o => o.wall === wallId); }

/** Split a wall along its length into solid masonry parts and opening parts.
    Returns {L, solids:[[s,e]], holes:[{s,e,op}]} — s/e in metres from wall.a */
function wallParts(wall, openings) {
  const L = wallLen(wall);
  const holes = openings
    .map(op => ({ s: clamp(op.pos - op.w / 2, 0, L), e: clamp(op.pos + op.w / 2, 0, L), op }))
    .filter(h => h.e - h.s > 0.005)
    .sort((a, b) => a.s - b.s);
  const solids = [];
  let cur = 0;
  for (const hl of holes) {
    if (hl.s > cur + 0.001) solids.push([cur, hl.s]);
    cur = Math.max(cur, hl.e);
  }
  if (cur < L - 0.001) solids.push([cur, L]);
  return { L, solids, holes };
}

/** Polygon (4 points) for a piece of a wall from s to e; ends at the very start/end of a wall are
    stretched by half the thickness so corners close neatly. */
function wallPiecePoly(wall, s, e, L) {
  const d = wallDir(wall), n = V.perp(d), t2 = wall.t / 2;
  const ext0 = s <= 0.0005 ? t2 : 0;
  const ext1 = e >= L - 0.0005 ? t2 : 0;
  const p0 = V.add(wall.a, V.mul(d, s - ext0));
  const p1 = V.add(wall.a, V.mul(d, e + ext1));
  return [V.add(p0, V.mul(n, t2)), V.add(p1, V.mul(n, t2)), V.sub(p1, V.mul(n, t2)), V.sub(p0, V.mul(n, t2))];
}

function openingCenter(plan, op) {
  const w = plan.walls.find(x => x.id === op.wall);
  if (!w) return null;
  return V.add(w.a, V.mul(wallDir(w), op.pos));
}

/** Move a wall endpoint and drag every other wall end that sat on the same spot with it. */
function connectedEnds(plan, storeyId, point, exceptWallId, tol = 0.003) {
  const out = [];
  for (const w of plan.walls) {
    if (w.storey !== storeyId || w.id === exceptWallId) continue;
    if (V.eq(w.a, point, tol)) out.push({ wall: w, end: 'a' });
    if (V.eq(w.b, point, tol)) out.push({ wall: w, end: 'b' });
  }
  return out;
}

/** Walls whose end touches wall w anywhere (corners and T-junctions) — they stretch when w is moved. */
function attachedEnds(plan, w) {
  const out = [];
  for (const o of plan.walls) {
    if (o.storey !== w.storey || o.id === w.id) continue;
    for (const end of ['a', 'b']) {
      const pr = projectOnSegment(o[end], w.a, w.b);
      if (pr.d < 0.003) out.push({ wall: o, end });
    }
  }
  return out;
}

/** Connect walls that stop against each other without sharing a point (as imported from IFC, where each wall
    ends at the face of the next one): every such end is moved onto the other wall's centre line, so dragging a
    wall drags the walls attached to it and two walls forming a corner share their corner point. Brick, insulation
    and inner walls are only joined to walls of the same layer. Returns the number of ends moved. */
function joinWalls(plan, storeyId = null) {
  const layer = w => w.kind === 'insulation' ? 'ins' : w.leaf === 'outer' ? 'out' : 'in';
  let moved = 0;
  const storeys = storeyId ? [storeyId] : [...new Set(plan.walls.map(w => w.storey))];
  const len0 = new Map(plan.walls.map(w => [w.id, wallLen(w)]));
  const setEnd = (w, end, X, ws) => {
    const old = w[end];
    if (V.eq(old, X, 1e-6)) return;
    // other wall ends that sat on the same spot come along
    for (const o of ws) for (const e2 of ['a', 'b']) if (o !== w && V.eq(o[e2], old, 0.003)) moveEnd(o, e2, X);
    moveEnd(w, end, X);
    moved++;
  };
  const moveEnd = (w, end, X) => {
    if (end === 'a') {
      // openings and the sloped top are measured from a
      const shift = V.dot(V.sub(X, w.a), wallDir(w));
      for (const op of plan.openings) if (op.wall === w.id) op.pos = +(op.pos - shift).toFixed(4);
      if (w.top) w.top = w.top.map(([u, hgt]) => [+(u - shift).toFixed(4), hgt]);
    }
    w[end] = [round(X[0], 0.0001), round(X[1], 0.0001)];
  };
  for (const sid of storeys) {
    const ws = plan.walls.filter(w => w.storey === sid && wallLen(w) > 0.02);
    // 1. walls in line, end to end: meet halfway
    for (const A of ws) for (const B of ws) {
      if (A === B || layer(A) !== layer(B)) continue;
      const dA = wallDir(A), dB = wallDir(B);
      if (Math.abs(V.cross(dA, dB)) > 0.01 || Math.abs(V.cross(V.sub(B.a, A.a), dA)) > 0.01) continue;
      for (const ea of ['a', 'b']) for (const eb of ['a', 'b']) {
        const gap = V.dist(A[ea], B[eb]);
        if (gap < 0.001 || gap > (A.t + B.t) / 2 + 0.05) continue;
        // only when they point at each other (not overlapping)
        const outA = ea === 'b' ? dA : V.mul(dA, -1);
        if (V.dot(V.sub(B[eb], A[ea]), outA) <= 0) continue;
        const M = V.lerp(A[ea], B[eb], 0.5);
        setEnd(A, ea, M, ws); setEnd(B, eb, M, ws);
      }
    }
    // 2. an end that stops against another wall: onto that wall's centre line (a T), and if it is near that
    //    wall's end as well, both ends become one corner point
    for (const A of ws) for (const end of ['a', 'b']) {
      const E = A[end], dA = wallDir(A), out = end === 'b' ? dA : V.mul(dA, -1);
      if (ws.some(B => B !== A && layer(B) === layer(A) && projectOnSegment(E, B.a, B.b).d < 0.003)) continue;
      let best = null;
      for (const B of ws) {
        if (B === A || layer(B) !== layer(A)) continue;
        const dB = wallDir(B), cr = V.cross(out, dB);
        if (Math.abs(cr) < 0.2) continue;
        const s = V.cross(V.sub(B.a, E), dB) / cr;             // distance along A to B's centre line
        if (s > (A.t + B.t) / 2 + 0.06 || s < -(B.t / 2 + 0.02)) continue;
        const X = V.add(E, V.mul(out, s));
        const LB = wallLen(B), ub = V.dot(V.sub(X, B.a), dB);
        const reach = (A.t + B.t) / 2 + 0.06;
        if (ub < -reach || ub > LB + reach) continue;
        if (wallLen(A) + s < 0.1) continue;
        if (!best || Math.abs(s) < Math.abs(best.s)) best = { B, s, X, ub, LB, reach };
      }
      if (!best) continue;
      const { B, X, ub, LB, reach } = best;
      setEnd(A, end, X, ws);
      if (ub < reach) setEnd(B, 'a', X, ws);
      else if (ub > LB - reach) setEnd(B, 'b', X, ws);
    }
  }
  // short filler pieces squeezed between two joined walls end up with no length at all
  const gone = new Set(plan.walls.filter(w => (!storeyId || w.storey === storeyId) && wallLen(w) < 0.01 && len0.get(w.id) >= 0.01).map(w => w.id));
  if (gone.size) { plan.walls = plan.walls.filter(w => !gone.has(w.id)); plan.openings = plan.openings.filter(o => !gone.has(o.wall)); }
  return moved;
}

/** Split wall at distance `at` (m from a). The first half keeps the id. Openings follow their half. */
function splitWall(plan, wall, at) {
  const L = wallLen(wall);
  if (at < 0.05 || at > L - 0.05) return null;
  const mid = V.add(wall.a, V.mul(wallDir(wall), at));
  const w2 = { ...clone(wall), id: uid('w_'), a: [...mid], b: [...wall.b] };
  wall.b = [...mid];
  plan.walls.push(w2);
  for (const op of plan.openings) {
    if (op.wall !== wall.id) continue;
    if (op.pos > at) { op.wall = w2.id; op.pos -= at; }
  }
  return w2;
}

function roomArea(r) { return Math.abs(polygonArea(r.poly)); }

/* ───────── comparing two versions ─────────
   Walls are compared by geometry, not by id: any piece of masonry in B that is not in A is new ("nieuw", red),
   any piece in A that is gone in B is demolished ("sloop", yellow). A door cut into an existing wall therefore
   shows as demolished masonry plus a new door; a door that is filled in shows as new masonry. */

function solidSegments(plan, storeyId) {
  const out = [];
  for (const w of plan.walls) {
    if (storeyId && w.storey !== storeyId) continue;
    const parts = wallParts(w, openingsOf(plan, w.id));
    for (const [s, e] of parts.solids) out.push({ wall: w, s, e, L: parts.L });
  }
  return out;
}

function sameLine(w1, w2) {
  if (w1.storey !== w2.storey) return false;
  if (Math.abs(w1.t - w2.t) > 0.011) return false;
  const d1 = wallDir(w1), d2 = wallDir(w2);
  if (Math.abs(V.cross(d1, d2)) > 0.01) return false;
  // distance of w2.a to w1's infinite line
  const n = V.perp(d1);
  return Math.abs(V.dot(V.sub(w2.a, w1.a), n)) < 0.015;
}

function subtractIntervals(base, cuts) {
  let res = [base];
  for (const [cs, ce] of cuts) {
    const next = [];
    for (const [s, e] of res) {
      if (ce <= s || cs >= e) { next.push([s, e]); continue; }
      if (cs > s) next.push([s, cs]);
      if (ce < e) next.push([ce, e]);
    }
    res = next;
  }
  return res.filter(([s, e]) => e - s > 0.02);
}

/** For each solid segment of `plan`, which sub-intervals are not present in `other`. */
function uncoveredParts(plan, other, storeyId) {
  const mine = solidSegments(plan, storeyId);
  const theirs = solidSegments(other, storeyId);
  const result = [];
  for (const seg of mine) {
    const d = wallDir(seg.wall);
    const cuts = [];
    for (const o of theirs) {
      if (!sameLine(seg.wall, o.wall)) continue;
      const od = wallDir(o.wall);
      const p0 = V.add(o.wall.a, V.mul(od, o.s)), p1 = V.add(o.wall.a, V.mul(od, o.e));
      let u0 = V.dot(V.sub(p0, seg.wall.a), d), u1 = V.dot(V.sub(p1, seg.wall.a), d);
      if (u0 > u1) [u0, u1] = [u1, u0];
      // the original's corner extension counts as covered too
      if (o.s <= 0.0005 || o.e >= o.L - 0.0005) { u0 -= o.wall.t / 2 + 0.001; u1 += o.wall.t / 2 + 0.001; }
      cuts.push([u0 - 0.001, u1 + 0.001]);
    }
    const left = subtractIntervals([seg.s, seg.e], cuts);
    for (const [s, e] of left) result.push({ wall: seg.wall, s, e, L: seg.L });
  }
  return result;
}

function matchOpening(op, plan, others) {
  const c = openingCenter(plan, op);
  if (!c) return null;
  const w = plan.walls.find(x => x.id === op.wall);
  for (const o of others) {
    if (o.op.kind !== op.kind) continue;
    if (Math.abs(o.op.w - op.w) > 0.025) continue;
    if (!o.c || V.dist(o.c, c) > 0.06) continue;
    if (o.wall.storey !== w.storey) continue;
    return o;
  }
  return null;
}

function diffPlans(A, B, project) {
  const res = {
    newParts: uncoveredParts(B, A),        // pieces of B walls not in A
    demoParts: uncoveredParts(A, B),       // pieces of A walls not in B
    newOpenings: [], removedOpenings: [],
    rooms: { added: [], removed: [], changed: [] },
  };
  const listA = A.openings.map(op => ({ op, c: openingCenter(A, op), wall: A.walls.find(w => w.id === op.wall) })).filter(o => o.wall);
  const listB = B.openings.map(op => ({ op, c: openingCenter(B, op), wall: B.walls.find(w => w.id === op.wall) })).filter(o => o.wall);
  for (const o of listB) if (!matchOpening(o.op, B, listA)) res.newOpenings.push(o);
  for (const o of listA) if (!matchOpening(o.op, A, listB)) res.removedOpenings.push(o);

  const roomsA = new Map(A.rooms.map(r => [r.id, r]));
  const roomsB = new Map(B.rooms.map(r => [r.id, r]));
  for (const r of B.rooms) if (!roomsA.has(r.id)) res.rooms.added.push(r);
  for (const r of A.rooms) if (!roomsB.has(r.id)) res.rooms.removed.push(r);
  for (const rb of B.rooms) {
    const ra = roomsA.get(rb.id);
    if (!ra) continue;
    const ch = [];
    if (ra.name !== rb.name) ch.push({ field: 'Name', from: ra.name, to: rb.name });
    const aa = roomArea(ra), ab = roomArea(rb);
    if (Math.abs(aa - ab) > 0.05) ch.push({ field: 'Area', from: fmtArea(aa), to: fmtArea(ab) });
    if ((ra.floor.material || '') !== (rb.floor.material || '')) ch.push({ field: 'Floor', from: floorLabel(ra.floor.material), to: floorLabel(rb.floor.material) });
    else if (floorPatternLabel(ra.floor) !== floorPatternLabel(rb.floor) || floorSpec(ra.floor).dir !== floorSpec(rb.floor).dir) ch.push({ field: 'Floor pattern', from: floorPatternLabel(ra.floor) || '—', to: floorPatternLabel(rb.floor) || '—' });
    if ((ra.floor.color || '').toLowerCase() !== (rb.floor.color || '').toLowerCase()) ch.push({ field: 'Floor colour', from: ra.floor.color, to: rb.floor.color, swatch: true });
    if ((ra.wallColor || '').toLowerCase() !== (rb.wallColor || '').toLowerCase()) ch.push({ field: 'Wall colour', from: ra.wallColor || '—', to: rb.wallColor || '—', swatch: true });
    if ((ra.wallColorName || '') !== (rb.wallColorName || '')) ch.push({ field: 'Wall paint', from: ra.wallColorName || '—', to: rb.wallColorName || '—' });
    for (const c of finishChanges(ra, rb, A, B)) ch.push(c);
    for (const c of pointChanges(ra, rb, A, B)) ch.push(c);
    if ((ra.notes || '').trim() !== (rb.notes || '').trim()) ch.push({ field: 'Notes', from: ra.notes || '', to: rb.notes || '', long: true });
    const ia = (ra.items || []).map(i => i.text).join('\n'), ib = (rb.items || []).map(i => i.text).join('\n');
    if (ia !== ib) ch.push({ field: 'Items', from: ia, to: ib, long: true });
    if (ch.length) res.rooms.changed.push({ room: rb, before: ra, changes: ch });
  }
  // summary per storey
  res.byStorey = {};
  const bump = (sid, key, v = 1) => { (res.byStorey[sid] ||= { newLen: 0, demoLen: 0, newDoors: 0, removedDoors: 0, newWindows: 0, removedWindows: 0, rooms: 0 })[key] += v; };
  for (const p of res.newParts) bump(p.wall.storey, 'newLen', p.e - p.s);
  for (const p of res.demoParts) bump(p.wall.storey, 'demoLen', p.e - p.s);
  // the same opening in the insulation and the brick of an outside wall is not counted again
  for (const o of res.newOpenings) if (!o.op.leaf) bump(o.wall.storey, o.op.kind === 'window' ? 'newWindows' : 'newDoors');
  for (const o of res.removedOpenings) if (!o.op.leaf) bump(o.wall.storey, o.op.kind === 'window' ? 'removedWindows' : 'removedDoors');
  for (const r of [...res.rooms.added, ...res.rooms.removed]) bump(r.storey, 'rooms');
  for (const c of res.rooms.changed) bump(c.room.storey, 'rooms');
  res.count = res.newParts.length + res.demoParts.length + res.newOpenings.length + res.removedOpenings.length
    + res.rooms.added.length + res.rooms.removed.length + res.rooms.changed.length;
  res.changedRoomIds = new Set([...res.rooms.added.map(r => r.id), ...res.rooms.changed.map(c => c.room.id)]);
  return res;
}

/* ───────── room detection ─────────
   Rasterise the walls (openings closed, slightly thickened to close hairline gaps) at 2 cm, flood-fill,
   trace the outline, simplify and put each edge on the wall face it runs along. Pure JS, so the IFC import
   can use it outside the browser too. */
function rasterWalls(walls, res = 0.02, pad = 0.5, extend = 0) {
  const polys = walls.map(w => {
    const L = wallLen(w);
    if (L < 1e-4) return null;
    const g = { ...w, t: w.t + res };
    const d = wallDir(w);
    const e = res / 2 + extend;
    const a = V.sub(w.a, V.mul(d, e)), b = V.add(w.b, V.mul(d, e));
    return wallPiecePoly({ ...g, a, b }, 0, L + 2 * e, L + 2 * e);
  }).filter(Boolean);
  if (!polys.length) return null;
  const bb = bboxOfPoints(polys.flat());
  const ox = bb.minX - pad, oy = bb.minY - pad;
  const W = Math.ceil((bb.w + 2 * pad) / res), H = Math.ceil((bb.h + 2 * pad) / res);
  if (W * H > 16e6) return null;
  const solid = new Uint8Array(W * H);
  for (const poly of polys) {
    const pb = bboxOfPoints(poly);
    const x0 = Math.max(0, Math.floor((pb.minX - ox) / res)), x1 = Math.min(W - 1, Math.ceil((pb.maxX - ox) / res));
    const y0 = Math.max(0, Math.floor((pb.minY - oy) / res)), y1 = Math.min(H - 1, Math.ceil((pb.maxY - oy) / res));
    // convex quad test: point on the inner side of all four edges
    const sgn = polygonArea(poly) > 0 ? 1 : -1;
    for (let y = y0; y <= y1; y++) {
      const py = oy + (y + 0.5) * res;
      for (let x = x0; x <= x1; x++) {
        const px = ox + (x + 0.5) * res;
        let inside = true;
        for (let i = 0; i < 4 && inside; i++) {
          const a = poly[i], b = poly[(i + 1) % 4];
          if (sgn * ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) < 0) inside = false;
        }
        if (inside) solid[y * W + x] = 1;
      }
    }
  }
  return { solid, W, H, ox, oy, res };
}

/** flood-fill from one cell; returns {count, border} and writes `label` into lab[] */
function floodCells(R, lab, start, label) {
  const { solid, W, H } = R;
  const stack = [start];
  lab[start] = label;
  let count = 0, border = false;
  while (stack.length) {
    const i = stack.pop();
    count++;
    const x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
    if (x > 0 && !solid[i - 1] && !lab[i - 1]) { lab[i - 1] = label; stack.push(i - 1); }
    if (x < W - 1 && !solid[i + 1] && !lab[i + 1]) { lab[i + 1] = label; stack.push(i + 1); }
    if (y > 0 && !solid[i - W] && !lab[i - W]) { lab[i - W] = label; stack.push(i - W); }
    if (y < H - 1 && !solid[i + W] && !lab[i + W]) { lab[i + W] = label; stack.push(i + W); }
  }
  return { count, border };
}

function dilateSolid(R, k) {
  const { W, H } = R;
  let cur = R.solid;
  for (let it = 0; it < k; it++) {
    const nx = new Uint8Array(cur);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (cur[i]) continue;
      if (cur[i - 1] || cur[i + 1] || cur[i - W] || cur[i + W]) nx[i] = 1;
    }
    cur = nx;
  }
  R.solid = cur;
}

function traceLabel(R, lab, label, walls, opt = {}, count = 0) {
  const { W, H, ox, oy, res } = R;
  let start = -1;
  for (let i = 0; i < W * H; i++) if (lab[i] === label) { start = i; break; }
  if (start < 0) return null;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? lab[y * W + x] === label : false;
  let cx = start % W, cy = (start - cx) / W;
  const sxx = cx, syy = cy;
  let dir = 6;
  const ring = [];
  let guard = 0;
  do {
    ring.push([cx, cy]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (at(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break; }
    }
    if (!found) break;
    if (++guard > 600000) break;
  } while (!(cx === sxx && cy === syy));
  const pts = ring.map(([x, y]) => [ox + (x + 0.5) * res, oy + (y + 0.5) * res]);
  // first choice: put every stretch of the outline exactly on the wall face (or wall end) it runs along
  const exact = exactOutline(pts, walls, R, opt, count);
  if (exact) return exact;
  let poly = cleanPoly(simplifyRing(pts, res * 1.6));
  poly = cleanPoly(snapPolyToWalls(poly, walls, opt.fallback != null ? opt.fallback : res, opt.snapTol));
  if (poly.length < 3) return null;
  if (polygonArea(poly) < 0) poly.reverse();
  return poly;
}

function detectRoom(plan, storeyId, point) {
  const walls = plan.walls.filter(w => w.storey === storeyId);
  if (!walls.length) return { error: 'Draw the walls around the room first.' };
  const R = rasterWalls(walls);
  if (!R) return { error: 'This floor is too large to detect rooms automatically. Draw the corners instead.' };
  const sx = Math.floor((point[0] - R.ox) / R.res), sy = Math.floor((point[1] - R.oy) / R.res);
  if (sx < 0 || sy < 0 || sx >= R.W || sy >= R.H) return { error: 'That spot is outside the walls.' };
  const i0 = sy * R.W + sx;
  if (R.solid[i0]) return { error: 'Tap inside a room, not on a wall.' };
  const lab = new Int32Array(R.W * R.H);
  const f = floodCells(R, lab, i0, 1);
  if (f.border) return { error: 'This area is not closed off by walls. Close the gap, or draw the corners instead.' };
  if (f.count < 50) return { error: 'That area is too small for a room.' };
  const poly = traceLabel(R, lab, 1, walls, {}, f.count);
  if (!poly) return { error: 'Could not find the room outline. Draw the corners instead.' };
  return { poly };
}

/** every closed area on a storey → [{poly, area}] (used by the IFC import) */
function findAllRooms(walls, minArea = 0.6, mark = null, opt = {}) {
  const R = rasterWalls(walls, 0.02, 0.5, opt.extend || 0);
  if (!R) return [];
  if (mark) mark(R);
  if (opt.dilate) dilateSolid(R, opt.dilate);
  const lab = new Int32Array(R.W * R.H);
  const out = [];
  let label = 0;
  for (let i = 0; i < R.W * R.H; i++) {
    if (R.solid[i] || lab[i]) continue;
    label++;
    const f = floodCells(R, lab, i, label);
    if (f.border) continue;
    if (f.count * R.res * R.res < (opt.minRaster != null ? opt.minRaster : minArea * 0.4)) continue;
    const poly = traceLabel(R, lab, label, walls, opt, f.count);
    if (poly) out.push({ poly, area: Math.abs(polygonArea(poly)) });
  }
  return out;
}

/* Exact room outline. Each traced boundary cell is matched to the wall face (or wall end) it lies against;
   runs of cells on the same face become one edge exactly on that face, and the corners are where those faces
   meet. Stretches along no wall (under a sloping roof) are simplified as they are. Returns null when the
   result doesn't look right, so the caller can fall back to simplify-and-snap. */
function wallFaceLines(walls, res, extend) {
  const lines = [];
  for (const w of walls) {
    const L = wallLen(w);
    if (L < 1e-4) continue;
    const d = wallDir(w), n = V.perp(d), nd = V.mul(d, -1), nn = V.mul(n, -1);
    const c = V.dot(w.a, n), h = w.t / 2;
    // drawn walls reach half their thickness past their end points (see wallPiecePoly)
    const ua = V.dot(w.a, d) - h - extend, ub = V.dot(w.a, d) + L + h + extend;
    const m = res + 0.03;
    lines.push({ N: n, C: c + h, d, u0: ua - m, u1: ub + m });            // the two faces
    lines.push({ N: nn, C: -(c - h), d, u0: ua - m, u1: ub + m });
    lines.push({ N: nd, C: -ua, d: n, u0: c - h - 0.03, u1: c + h + 0.03 });   // the two ends
    lines.push({ N: d, C: ub, d: n, u0: c - h - 0.03, u1: c + h + 0.03 });
  }
  // the same face shared by several walls in line is one line
  const keys = [];
  for (const ln of lines) {
    let k = keys.find(q => V.dot(q.N, ln.N) > 0.99995 && Math.abs(q.C - ln.C) < 0.002);
    if (!k) { k = { N: ln.N, C: ln.C, d: ln.d, id: keys.length }; keys.push(k); }
    ln.key = k;
  }
  return lines;
}

function exactOutline(pts, walls, R, opt = {}, count = 0) {
  const res = R.res, n = pts.length;
  if (n < 8) return null;
  const lines = wallFaceLines(walls, res, opt.extend || 0);
  const tolA = res * 2.3;
  // 1. which face is each boundary cell against?
  const ids = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    let best = null, bs = Infinity;
    for (const ln of lines) {
      const sd = p[0] * ln.N[0] + p[1] * ln.N[1] - ln.C;
      if (sd < -0.004 || sd > tolA || sd >= bs) continue;
      const u = p[0] * ln.d[0] + p[1] * ln.d[1];
      if (u < ln.u0 || u > ln.u1) continue;
      best = ln.key; bs = sd;
    }
    ids[i] = best;
  }
  // 2. runs of the same face, starting at a change so no run wraps around the start
  let s0 = 0;
  while (s0 < n && ids[s0] === ids[(s0 - 1 + n) % n]) s0++;
  if (s0 === n) return null;
  let runs = [];
  for (let k = 0; k < n; k++) {
    const i = (s0 + k) % n;
    const last = runs[runs.length - 1];
    if (last && last.key === ids[i]) last.pts.push(pts[i]);
    else runs.push({ key: ids[i], pts: [pts[i]] });
  }
  // 3. drop noise: tiny runs (a cell or two at a corner or a junction) and short unmatched stretches
  const merge = () => {
    for (let changed = true; changed && runs.length > 1;) {
      changed = false;
      for (let i = 0; i < runs.length; i++) {
        const j = (i + 1) % runs.length;
        if (i === j || runs[i].key !== runs[j].key) continue;
        runs[i].pts = runs[i].pts.concat(runs[j].pts);
        runs.splice(j, 1);
        changed = true;
        break;
      }
    }
  };
  merge();
  for (let guard = 0; guard < 400 && runs.length > 3; guard++) {
    let wi = -1, wl = Infinity;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i], lim = r.key ? 3 : 4;
      if (r.pts.length < lim && r.pts.length < wl) { wl = r.pts.length; wi = i; }
    }
    if (wi < 0) break;
    runs.splice(wi, 1);
    merge();
  }
  if (runs.length < 3) return null;
  // 4. corners
  const proj = (p, k) => V.sub(p, V.mul(k.N, V.dot(p, k.N) - k.C));
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    const A = runs[i], B = runs[(i + 1) % runs.length];
    if (!A.key) out.push(...rdp(A.pts, res * 1.6));
    const pa = A.pts[A.pts.length - 1], pb = B.pts[0];
    if (A.key && B.key) {
      const det = V.cross(A.key.N, B.key.N);
      if (Math.abs(det) > 0.05) {
        const x = (A.key.C * B.key.N[1] - B.key.C * A.key.N[1]) / det;
        const y = (A.key.N[0] * B.key.C - B.key.N[0] * A.key.C) / det;
        if (V.dist([x, y], pa) < 0.3 && V.dist([x, y], pb) < 0.3) { out.push([x, y]); continue; }
      }
      if (Math.abs(det) <= 0.05) {
        // a step between two parallel faces: a square connector halfway between the two runs
        const qa = proj(V.lerp(pa, pb, 0.5), A.key);
        out.push(qa, proj(qa, B.key));
      } else out.push(proj(pa, A.key), proj(pb, B.key));
    } else if (A.key) out.push(proj(pa, A.key));
    else if (B.key) out.push(proj(pb, B.key));
  }
  let poly = cleanPoly(out.map(p => [round(p[0], 0.001), round(p[1], 0.001)]));
  if (poly.length < 3) return null;
  if (polygonArea(poly) < 0) poly.reverse();
  // 5. sanity: simple polygon, area close to the flood-filled area (cells stop half a cell short of each face)
  if (selfIntersects(poly)) return null;
  if (count) {
    const A = polygonArea(poly), Ar = count * res * res;
    let per = 0;
    for (let i = 0; i < poly.length; i++) per += V.dist(poly[i], poly[(i + 1) % poly.length]);
    if (A < Ar * 0.97 - 0.01 || A > Ar + per * res * 1.6 + 0.03 * Ar + 0.02) return null;
  }
  return poly;
}

function selfIntersects(poly) {
  const n = poly.length;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = poly[j], d = poly[(j + 1) % n];
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
    }
  }
  return false;
}

function snapPolyToWalls(poly, walls, fallback, tol = 0.045) {
  const n = poly.length;
  if (n < 3) return poly;
  const sign = polygonArea(poly) > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const d = V.norm(V.sub(b, a)), nn = V.perp(d);
    const mid = V.lerp(a, b, 0.5);
    const c = V.dot(mid, nn);
    const ea = V.dot(a, d), eb = V.dot(b, d);
    let best = null;
    for (const w of walls) {
      const wd = wallDir(w);
      if (Math.abs(V.cross(wd, d)) > 0.02) continue;
      const wa = V.dot(w.a, d), wb = V.dot(w.b, d);
      if (Math.max(wa, wb) < Math.min(ea, eb) - 0.3 || Math.min(wa, wb) > Math.max(ea, eb) + 0.3) continue;
      const cw = V.dot(w.a, nn);
      for (const f of [cw + w.t / 2, cw - w.t / 2]) {
        const dist = Math.abs(f - c);
        if (dist < tol && (!best || dist < best.dist)) best = { f, dist };
      }
    }
    lines.push({ nn, c: best ? best.f : c + (sign > 0 ? -fallback : fallback) });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    const det = L1.nn[0] * L2.nn[1] - L1.nn[1] * L2.nn[0];
    if (Math.abs(det) < 1e-6) { out.push(poly[i]); continue; }
    const x = (L1.c * L2.nn[1] - L2.c * L1.nn[1]) / det;
    const y = (L1.nn[0] * L2.c - L2.nn[0] * L1.c) / det;
    out.push([round(x, 0.001), round(y, 0.001)]);
  }
  return out;
}

function cleanPoly(poly) {
  let out = [];
  for (const p of poly) if (!out.length || !V.eq(out[out.length - 1], p, 0.005)) out.push(p);
  if (out.length > 1 && V.eq(out[0], out[out.length - 1], 0.005)) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      if (Math.abs(V.cross(V.sub(b, a), V.sub(c, b))) < 0.0004) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

/* ───────── example house ─────────
   build/example.json, packed into the app by build.py (the house built into the app brings its own: build.py --house):
   the original as delivered plus planned versions; the 3D façade/roof shell ships gzip-compressed. The public app's
   example is a made-up house (tools/testhouse/). Files of its documents: EXAMPLE_HOUSE.files (docs.js). */
async function buildExampleProject() {
  if (typeof EXAMPLE_HOUSE === 'undefined') throw new Error('The example house is not included in this build.');
  const p = migrateProject(EXAMPLE_HOUSE.project ? clone(EXAMPLE_HOUSE.project) : JSON.parse(await gunzipBase64(EXAMPLE_HOUSE.projectGz)));
  p.id = uid('p_');
  p.created = p.updated = Date.now();
  const json = await gunzipBase64(EXAMPLE_HOUSE.shellGz);
  const assetId = await Assets.putShell(json);
  p.shell = { assetId, source: 'IFC' };
  // the planned versions of the example start with an idea for the garden (unless the example brings its own)
  const og = (getOriginal(p) || {}).plan;
  for (const v of p.versions) if (v.kind !== 'original' && !v.plan.garden && HOUSE.gardenSample) v.plan.garden = HOUSE.gardenSample(p.site, og && og.garden);
  return p;
}
