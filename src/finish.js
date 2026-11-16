/* ───────────── finish.js — finishes per wall (paint or an accent colour, renovlies, wallpaper from a picture,
   tiles to a height or full height, with a tile counter) and the ceiling of each room ─────────────

   A room has one finish for all its walls: wallColor + wallColorName (the paint), wallBase ('paint' | 'renovlies' |
   'paper'), wallPaper ({ img, w, h, fit: 'repeat' | 'fill', name }; w, h = one repeat in metres) and tiles
   ({ to, w, h, joint, color, grout, lay: 'stack' | 'half', waste (%), name }; to = 0: full height).
   One wall can have its own finish on the side of one room: wall.fin[roomId] = { any of color, name, base, paper,
   tiles } (tiles: null = no tiles on this wall, even when the room has them).
   Ceiling per room: ceilingColor, ceilingName, ceilingFinish, ceilingH (null: the storey's wall height).
   Pictures are kept once per house: project.images[id] = { name, asset (the JPEG in the assets store), w, h (pixels),
   avg (its average colour) }. */

const COVERINGS = [['paint', 'Paint'], ['renovlies', 'Renovlies + paint'], ['paper', 'Wallpaper']];
const CEIL_FINISHES = [['paint', 'Paint, matt'], ['spray', 'Spray plaster (spuitwerk)'], ['plaster', 'Smooth plaster (stucwerk)'], ['wood', 'Wood or panels'], ['system', 'Suspended ceiling']];
const CEIL_DEFAULT = '#F7F6F2';
const TILE_DEFAULT = { to: 1.2, w: 0.3, h: 0.6, joint: 0.003, color: '#E9E6DF', grout: '#C9C4BA', lay: 'stack', waste: 10, name: '' };
const FIN_KEYS = ['color', 'name', 'base', 'paper', 'tiles', 'sheen'];
const FACE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* ───────── what a wall looks like ───────── */
function roomFinish(r) {
  return { color: r.wallColor || WALL_FINISH_DEFAULT, name: r.wallColorName || '', base: r.wallBase || 'paint', paper: r.wallPaper || null, tiles: r.tiles || null, sheen: r.wallSheen || 'matt', own: false };
}
/** the finish of one wall on the side of room r: the room's finish, with what this wall has of its own */
function faceFinish(w, r) {
  const R = roomFinish(r);
  const f = w && w.fin && r ? w.fin[r.id] : null;
  if (!f) return R;
  const o = { ...R, own: true };
  for (const k of FIN_KEYS) if (k in f) o[k] = f[k];
  return o;
}
const roomCeilH = (r, st) => (r && r.ceilingH > 0 ? r.ceilingH : (st ? st.wallHeight : DEFAULTS.wallHeight)) || DEFAULTS.wallHeight;

/** where the rooms of a storey run along the sides of its walls → [{ wall, room, side, u0, u1, edge }]
 *  side +1 = the wall's left side (V.perp of its direction); u0..u1 in metres from the wall's start.
 *  A room edge counts when it runs parallel to a wall, on the wall's face (or its centre line). */
function wallFaces(plan, sid, onlyRooms, corners) {
  const rooms = (onlyRooms || plan.rooms).filter(r => r.storey === sid && r.poly && r.poly.length >= 3);
  const out = [];
  if (!rooms.length) return out;
  const geo = rooms.map(r => ({ r, sgn: Math.sign(polygonArea(r.poly)) || 1, bb: bboxOfPoints(r.poly) }));
  const ext = corners ? wallCornerExt(plan, sid) : null;
  for (const w of plan.walls) {
    if (w.storey !== sid || w.kind === 'insulation' || w.leaf === 'outer') continue;
    const L = wallLen(w);
    if (L < 0.05) continue;
    const [e0, e1] = ext ? ext.get(w.id) || [0, 0] : [0, 0];
    const d = wallDir(w), n = V.perp(d), reach = w.t / 2 + 0.06;
    const wx0 = Math.min(w.a[0], w.b[0]) - reach, wx1 = Math.max(w.a[0], w.b[0]) + reach, wy0 = Math.min(w.a[1], w.b[1]) - reach, wy1 = Math.max(w.a[1], w.b[1]) + reach;
    for (const { r, sgn, bb } of geo) {
      if (bb.minX > wx1 || bb.maxX < wx0 || bb.minY > wy1 || bb.maxY < wy0) continue;
      const P = r.poly, segs = [];
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        const e = V.sub(q, p), el = V.len(e);
        if (el < 0.05 || Math.abs(V.cross(e, d)) / el > 0.03) continue;
        const op = V.dot(V.sub(p, w.a), n), oq = V.dot(V.sub(q, w.a), n), off = (op + oq) / 2;
        if (Math.abs(op - oq) > 0.03 || Math.abs(off) > reach) continue;
        const inward = V.mul(V.perp(V.mul(e, 1 / el)), sgn);
        const side = V.dot(inward, n) > 0 ? 1 : -1;
        if (off * side < -w.t / 4) continue;
        let a = V.dot(V.sub(p, w.a), d), b = V.dot(V.sub(q, w.a), d);
        if (a > b) [a, b] = [b, a];
        a = Math.max(a, -e0); b = Math.min(b, L + e1);
        if (b - a > 0.05) segs.push({ u0: a, u1: b, side, edge: i });
      }
      segs.sort((x, y) => x.side - y.side || x.u0 - y.u0);
      const merged = [];
      for (const sg of segs) {
        const last = merged[merged.length - 1];
        if (last && last.side === sg.side && sg.u0 <= last.u1 + 0.01) last.u1 = Math.max(last.u1, sg.u1);
        else merged.push({ ...sg });
      }
      for (const sg of merged) out.push({ wall: w, room: r, ...sg });
    }
  }
  return out;
}
/** how far the faces of each wall reach past its end points round an outside corner (task 0024): a wall that ends
 *  on another wall (an L or the end of a T) is covered there by the other wall, so its face on the outside of the
 *  corner goes on for half the other wall's thickness → Map(wall id → [past a, past b]). The 3D view and the wall
 *  views keep the centre-line ends; the quantities count the whole face. */
function wallCornerExt(plan, sid) {
  const ws = plan.walls.filter(w => w.storey === sid && w.kind !== 'insulation' && w.leaf !== 'outer' && wallLen(w) >= 0.05);
  const out = new Map();
  for (const w of ws) {
    const d = wallDir(w), res = [0, 0];
    [w.a, w.b].forEach((P, k) => {
      for (const o of ws) {
        if (o === w || Math.abs(V.cross(d, wallDir(o))) < 0.3) continue;
        const od = wallDir(o), L = wallLen(o), u = clamp(V.dot(V.sub(P, o.a), od), 0, L);
        if (V.len(V.sub(P, V.add(o.a, V.mul(od, u)))) <= 0.02) res[k] = Math.max(res[k], o.t / 2);
      }
    });
    if (res[0] || res[1]) out.set(w.id, res);
  }
  return out;
}
/** the walls of one room, in order around the room, lettered A, B, C … (corners: the faces reach round outside
 *  corners, for the quantities) */
function roomFaces(plan, r, corners) {
  const list = wallFaces(plan, r.storey, [r], corners);
  // order around the room: by the edge, then along the edge's direction
  list.sort((a, b) => a.edge - b.edge || edgeAlong(r, a) - edgeAlong(r, b));
  list.forEach((f, i) => { f.letter = i < 26 ? FACE_LETTERS[i] : 'Z' + (i - 25); });
  return list;
}
function edgeAlong(r, f) {
  const p = r.poly[f.edge], q = r.poly[(f.edge + 1) % r.poly.length];
  const mid = V.add(f.wall.a, V.mul(wallDir(f.wall), (f.u0 + f.u1) / 2));
  return V.dot(V.sub(mid, p), V.norm(V.sub(q, p)));
}
/** wall area of one face between heights y0 and y1 (to the room's ceiling, under a sloped top), without the
 *  doors, windows and openings in it */
function faceArea(plan, f, st, y0 = 0, y1 = Infinity) {
  const w = f.wall, H = wallHeight(w, st), ch = roomCeilH(f.room, st);
  const len = f.u1 - f.u0;
  const n = Math.max(1, Math.ceil(len / 0.05)), du = len / n;
  let A = 0;
  for (let i = 0; i < n; i++) {
    const u = f.u0 + (i + 0.5) * du;
    A += Math.max(0, Math.min(wallTopAt(w, u, H), ch, y1) - y0) * du;
  }
  for (const op of faceOpenings(plan, f)) {
    const a = Math.max(op.pos - op.w / 2, f.u0), b = Math.min(op.pos + op.w / 2, f.u1);
    const s0 = op.kind === 'window' ? (op.sill || 0) : 0, s1 = s0 + op.h;
    A -= (b - a) * Math.max(0, Math.min(s1, y1, ch) - Math.max(s0, y0));
  }
  return Math.max(0, A);
}
function faceOpenings(plan, f) {
  return openingsOf(plan, f.wall.id).filter(op => Math.min(op.pos + op.w / 2, f.u1) - Math.max(op.pos - op.w / 2, f.u0) > 0.01);
}
function faceHeight(f, st) { return Math.min(roomCeilH(f.room, st), wallHeight(f.wall, st)); }

/* ───────── tiles ───────── */
/** tiles needed for an area of wall: the pieces of the real grid (or, without one, whole tiles for the area with the
 *  joints), plus the waste */
function tileCount(area, T, pieces) {
  if (!T || !(area > 0.0001)) return { area: 0, tiles: 0, m2: 0 };
  const j = T.joint || 0, mod = (T.w + j) * (T.h + j);
  // from the grid (task 0036): every whole tile and every cut piece is a tile, plus the extra for breakage
  const tiles = Math.ceil((pieces != null ? pieces : area / mod) * (1 + (T.waste || 0) / 100) - 1e-9);
  return { area, tiles, m2: tiles * T.w * T.h };
}
const tileSize = T => `${fmtMM(T.w)} × ${fmtMM(T.h)} mm`;
const tileLabel = T => (T.name ? T.name + ' · ' : '') + tileSize(T);
const tileKey = T => [fmtMM(T.w), fmtMM(T.h), T.name || '', (T.color || '').toLowerCase(), T.joint, T.waste].join('|');
function tilesSummary(T) {
  if (!T) return t('No tiles');
  return (T.to > 0 ? t('Tiles to {h}', { h: fmtM(T.to) }) : t('Tiles full height')) + ', ' + tileSize(T);
}
function finishSummary(fin) {
  const T = fin.tiles;
  if (T && !(T.to > 0)) return tilesSummary(T);
  const base = fin.base === 'paper' ? t('Wallpaper') + (fin.paper && fin.paper.name ? ': ' + fin.paper.name : '') : fin.base === 'renovlies' ? t('Renovlies') + (fin.name ? ', ' + fin.name : '') : (fin.name || t('Paint'));
  return (T ? tilesSummary(T) + ' · ' : '') + base;
}

/** per room: its walls with their finishes and areas, and the tiles per kind of tile (counted from the real grid of
 *  each wall: whole tiles and cut pieces, task 0036) */
function roomFinishStats(plan, r, st) {
  const faces = roomFaces(plan, r, true);
  const tiles = new Map();
  let wall = 0, tiled = 0;
  const rows = faces.map(f => {
    const fin = faceFinish(f.wall, f.room);
    const area = faceArea(plan, f, st);
    const T = fin.tiles;
    const tArea = T ? faceArea(plan, f, st, 0, T.to > 0 ? T.to : Infinity) : 0;
    wall += area; tiled += tArea;
    // the grid as the wall view draws it (the face between the wall's ends, not round its outside corners)
    let lay = null;
    if (T && tArea > 0) {
      try { lay = faceTileLayout(plan, { ...f, u0: Math.max(f.u0, 0), u1: Math.min(f.u1, wallLen(f.wall)) }, st); } catch (e) { console.error(e); }
      const k = tileKey(T);
      if (!tiles.has(k)) tiles.set(k, { T, area: 0, whole: 0, cut: 0, grid: true });
      const x = tiles.get(k);
      x.area += tArea;
      if (lay) { x.whole += lay.count.whole; x.cut += lay.count.cut; } else x.grid = false;
    }
    return { f, fin, area, tArea, cover: Math.max(0, area - tArea), len: f.u1 - f.u0, ops: faceOpenings(plan, f), lay };
  });
  return { faces: rows, wall, tiled, cover: Math.max(0, wall - tiled), tiles: [...tiles.values()].map(x => ({ ...x, ...tileCount(x.area, x.T, x.grid ? x.whole + x.cut : null) })) };
}

/* ───────── where the tiles start, the cut pieces and slivers (task 0036) ─────────
   A wall's tiles lie in a straight grid: tile k of a row spans ox + k·M … + T.w (M = tile + joint), row r spans
   oy + r·MH … + T.h; half bond shifts every other row by M / 2. Where the grid starts, per wall face, is kept on the
   wall: wall.tileStart[roomId] = { x: 'centre' | 'left' | 'right' | 'at', at (m from the left corner), joint (a joint
   on that line instead of a tile centred on it), ref ('window' | 'door' | 'bath' … – only a name), dx (nudge, m),
   y: 'floor' | 'at' | 'top', yh (m), yref }. No start = centred, whole rows from the floor: the layout of before.
   A floor's start: r.floor.start = { at: 'centre' | 'nw' | 'ne' | 'sw' | 'se' | 'door', p, n (the door's line and
   the way into the room), dx, dy (nudges in the plan, m) }. A cut piece under a third of a tile is a sliver. */
const SLIVER = 1 / 3, CUT_EPS = 0.0015, FLOOR_JOINT = 0.003;
const FLOOR_GRID = new Set(['grid', 'half', 'third']);

/** the piece cut at a line of a grid (tiles o + k·M … + w): after = the piece lies after the line → its size, 0 = whole */
function gridCut(x, o, M, w, after) {
  let p = ((x - o) % M + M) % M;
  if (p > M - CUT_EPS) p = 0;
  if (p < CUT_EPS || p > w - CUT_EPS) return 0;
  return after ? w - p : p;
}
/** the smallest piece at a line over several row shifts (0 = whole in every row) */
function gridCutMin(x, o, offs, M, w, after) {
  let c = 0;
  for (const s0 of offs) { const v = gridCut(x, o + s0, M, w, after); if (v > 0 && (!c || v < c)) c = v; }
  return c;
}
/** polygon P clipped to the rectangle x0..x1 × y0..y1 (Sutherland–Hodgman) */
function clipToRect(P, x0, y0, x1, y1) {
  const side = (Q, inside, cross) => {
    const out = [];
    for (let i = 0; i < Q.length; i++) {
      const a = Q[(i + Q.length - 1) % Q.length], b = Q[i], ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cross(a, b)); out.push(b); } else if (ia) out.push(cross(a, b));
    }
    return out;
  };
  const atX = (a, b, x) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
  const atY = (a, b, y) => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y];
  let Q = P;
  Q = side(Q, p => p[0] >= x0, (a, b) => atX(a, b, x0)); if (!Q.length) return Q;
  Q = side(Q, p => p[0] <= x1, (a, b) => atX(a, b, x1)); if (!Q.length) return Q;
  Q = side(Q, p => p[1] >= y0, (a, b) => atY(a, b, y0)); if (!Q.length) return Q;
  return side(Q, p => p[1] <= y1, (a, b) => atY(a, b, y1));
}
/** count the tiles of a grid over a shape (polygon less holes, one frame): whole tiles and cut pieces.
 *  G = { ou, ov, MU, MV, tu, tv, offs (shift of row r along u: offs[r mod offs.length]) } */
function gridCount(poly, holes, G) {
  const bb = bboxOfPoints(poly), full = G.tu * G.tv;
  let whole = 0, cut = 0;
  const pieces = [];
  const r0 = Math.floor((bb.minY - G.ov) / G.MV) - 1, r1 = Math.ceil((bb.maxY - G.ov) / G.MV) + 1;
  if (r1 - r0 > 4000) return { whole: 0, cut: 0, pieces };
  for (let r = r0; r <= r1; r++) {
    const y0 = G.ov + r * G.MV, y1 = y0 + G.tv;
    if (y1 <= bb.minY || y0 >= bb.maxY) continue;
    const sh = G.offs[((r % G.offs.length) + G.offs.length) % G.offs.length];
    const k0 = Math.floor((bb.minX - G.ou - sh) / G.MU) - 1, k1 = Math.ceil((bb.maxX - G.ou - sh) / G.MU) + 1;
    if (k1 - k0 > 4000) continue;
    for (let k = k0; k <= k1; k++) {
      const x0 = G.ou + sh + k * G.MU, x1 = x0 + G.tu;
      if (x1 <= bb.minX || x0 >= bb.maxX) continue;
      const Q = clipToRect(poly, x0, y0, x1, y1);
      if (Q.length < 3) continue;
      let a = Math.abs(polygonArea(Q));
      for (const hl of holes) { const H = clipToRect(hl, x0, y0, x1, y1); if (H.length >= 3) a -= Math.abs(polygonArea(H)); }
      if (a < 1e-6) continue;
      const qb = bboxOfPoints(Q);
      if (qb.maxX - qb.minX < CUT_EPS || qb.maxY - qb.minY < CUT_EPS) continue;
      const isCut = a < full * 0.998;
      if (isCut) cut++; else whole++;
      pieces.push({ x0: Math.max(x0, qb.minX), x1: Math.min(x1, qb.maxX), y0: Math.max(y0, qb.minY), y1: Math.min(y1, qb.maxY), cut: isCut });
    }
  }
  return { whole, cut, pieces };
}

/** the start kept for one wall face (or null: centred, rows from the floor) */
function faceTileStart(w, r) {
  const S = w && w.tileStart && r ? w.tileStart[r.id] : null;
  return S && typeof S === 'object' ? S : null;
}
/** where the grid of a wall's tiles lies: x from the left corner, y up from the floor */
function tileOrigin(T, L, top, S) {
  const j = T.joint || 0, M = T.w + j, MH = T.h + j;
  S = S || {};
  let ox;
  if (S.x === 'left') ox = 0;
  else if (S.x === 'right') ox = L - T.w;
  else if (S.x === 'at' && isFinite(S.at)) ox = S.joint ? S.at + j / 2 : S.at - T.w / 2;
  else ox = tileFall(T, L, top).side;
  ox += +S.dx || 0;
  let oy = 0;
  if (S.y === 'at' && S.yh > 0) oy = S.yh;
  else if (S.y === 'top') oy = top - T.h;
  return { ox, oy, M, MH, j, offs: T.lay === 'half' ? [0, M / 2] : [0] };
}
/** the cuts of a wall's tiles: at both corners, the floor, the top row and round doors and windows
 *  → [{ k, op, c (m), size (the tile's side it cuts), sliver }] */
function wallTileCuts(T, G, L, top, flatTop, ops) {
  const out = [];
  const add = (k, c, size, op) => { if (c > 0) out.push({ k, c, size, op: op || null, sliver: c < size * SLIVER - 1e-6 }); };
  const xc = (x, after) => gridCutMin(x, G.ox, G.offs, G.M, T.w, after);
  const yc = (y, after) => gridCut(y, G.oy, G.MH, T.h, after);
  add('left', xc(0, true), T.w);
  add('right', xc(L, false), T.w);
  add('floor', yc(0, true), T.h);
  if (flatTop) add('top', yc(top, false), T.h);
  for (const o of ops || []) {
    if (o.y0 >= top - CUT_EPS || o.y1 <= CUT_EPS) continue;
    if (o.x0 > CUT_EPS) add(o.kind + '-l', xc(o.x0, false), T.w, o);
    if (o.x1 < L - CUT_EPS) add(o.kind + '-r', xc(o.x1, true), T.w, o);
    if (o.y0 > CUT_EPS) add(o.kind + '-b', yc(o.y0, false), T.h, o);
    if (o.y1 < top - CUT_EPS) add(o.kind + '-t', yc(o.y1, true), T.h, o);
  }
  return out;
}

/** a wall face's tiles laid out: the grid from its start, the pieces (whole / cut), the cuts and their slivers.
 *  f: a face (u0..u1 along the wall), S: a start to try instead of the kept one */
function faceTileLayout(plan, f, st, S, fin) {
  fin = fin || faceFinish(f.wall, f.room);
  const T = fin.tiles;
  if (!T) return null;
  const fr = faceFrame(f), w = f.wall, H = wallHeight(w, st), ch = roomCeilH(f.room, st), L = fr.L;
  const N = Math.max(2, Math.ceil(L / 0.1)), topL = [];
  for (let i = 0; i <= N; i++) { const u = f.u0 + L * i / N; topL.push([fr.ex(u), Math.min(wallTopAt(w, u, H), ch)]); }
  topL.sort((a, b) => a[0] - b[0]);
  const maxH = Math.max(...topL.map(q => q[1])), minH = Math.min(...topL.map(q => q[1]));
  const top = T.to > 0 ? Math.min(T.to, maxH) : maxH;
  const ops = faceOpenings(plan, f).map(op => {
    const a = fr.ex(Math.max(op.pos - op.w / 2, f.u0)), b = fr.ex(Math.min(op.pos + op.w / 2, f.u1));
    const y0 = op.kind === 'window' ? (op.sill || 0) : 0;
    return { kind: op.kind, x0: Math.min(a, b), x1: Math.max(a, b), y0, y1: y0 + op.h, id: op.id };
  }).sort((a, b) => a.x0 - b.x0);
  const start = S === undefined ? faceTileStart(w, f.room) : S;
  const G = tileOrigin(T, L, top, start);
  const flatTop = minH >= top - 0.001;
  const cuts = wallTileCuts(T, G, L, top, flatTop, ops);
  const shape = [[0, 0], ...topL.map(([x, y]) => [x, Math.min(y, top)]), [L, 0]];
  const holes = ops.map(o => [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]]);
  const count = gridCount(shape, holes, { ou: G.ox, ov: G.oy, MU: G.M, MV: G.MH, tu: T.w, tv: T.h, offs: G.offs });
  return { T, L, top, maxH, flatTop, ops, start: start || null, G, cuts, slivers: cuts.filter(c => c.sliver), count };
}

/** the choices of where a wall's tiles start: [{ key, label, S }] – across and up, from the wall's own things */
function tileStartChoices(lay, fixtures) {
  const T = lay.T, j = T.joint || 0;
  const xs = [{ key: 'centre', label: t('Centre of the wall'), S: { x: 'centre' } }, { key: 'left', label: t('Left corner'), S: { x: 'left' } }, { key: 'right', label: t('Right corner'), S: { x: 'right' } }];
  const n = { window: 0, door: 0, opening: 0 };
  for (const o of lay.ops) {
    n[o.kind] = (n[o.kind] || 0) + 1;
    const nm = (o.kind === 'window' ? t('window') : o.kind === 'door' ? t('door') : t('opening')) + (lay.ops.filter(q => q.kind === o.kind).length > 1 ? ' ' + n[o.kind] : '');
    xs.push({ key: 'op' + xs.length, label: t('Centre on: {what}', { what: nm }), S: { x: 'at', at: +((o.x0 + o.x1) / 2).toFixed(4), ref: o.kind } });
  }
  for (const F of fixtures || []) xs.push({ key: 'fx' + xs.length, label: t('Centre on: {what}', { what: F.name }), S: { x: 'at', at: +F.xc.toFixed(4), ref: F.kind } });
  const ys = [{ key: 'floor', label: t('Whole row at the floor'), S: { y: 'floor' } }];
  for (const F of fixtures || []) if (F.top > 0.05 && F.top < lay.top - 0.05) ys.push({ key: 'fy' + ys.length, label: t('Whole row on top of: {what} ({h} mm)', { what: F.name, h: fmtMM(F.top) }), S: { y: 'at', yh: +F.top.toFixed(4), yref: F.kind } });
  ys.push({ key: 'top', label: t('Whole row at the top (cut row at the floor)'), S: { y: 'top' } });
  return { xs, ys, j };
}
/** the start with the widest smallest cut: each choice across (and the joint or a tile on its line, and half a tile
 *  further), then each choice for the rows (and half a tile higher) */
function bestTileStart(plan, f, st, fixtures) {
  const lay = faceTileLayout(plan, f, st, null);
  if (!lay) return null;
  const { xs, ys } = tileStartChoices(lay, fixtures);
  const T = lay.T, M = lay.G.M, MH = lay.G.MH;
  const score = (S, dim) => { const L2 = faceTileLayout(plan, f, st, S); return L2.cuts.filter(c => (dim === 'x') === /^(left|right)$|-[lr]$/.test(c.k)).reduce((m, c) => Math.min(m, c.c / c.size), 1); };
  // the usual start (centred, rows from the floor) stays unless another makes the smallest cut a tenth of a tile wider
  const KEEP = 0.1, half = ' + ' + t('half a tile');
  let bx = null, bxs = -1;
  for (const X of xs) for (const jt of X.S.x === 'at' ? [false, true] : [false]) for (const dx of [0, M / 2]) {
    const S = { ...X.S, ...(jt ? { joint: true } : {}), ...(dx ? { dx: +dx.toFixed(4) } : {}), y: 'floor' };
    const v = score(S, 'x');
    if (v > bxs + (bx && bx.first ? KEEP : 1e-6)) { bxs = v; bx = { S, label: X.label + (dx ? half : ''), first: !bx }; }
  }
  let by = null, bys = -1;
  for (const Y of ys) for (const dy of [0, MH / 2]) {
    let S = { ...Y.S };
    if (dy) { if (S.y === 'floor') S = { y: 'at', yh: +dy.toFixed(4) }; else if (S.y === 'at') S = { ...S, yh: +(S.yh + dy).toFixed(4) }; else continue; }
    const v = score({ x: 'left', ...S }, 'y');
    if (v > bys + (by && by.first ? KEEP : 1e-6)) { bys = v; by = { S, label: Y.label + (dy ? half : ''), first: !by }; }
  }
  const S = { ...bx.S, ...by.S };
  if (S.y === 'floor') delete S.y;
  if (S.x === 'centre') delete S.x;
  return { S, labelX: bx.label, labelY: by.label, score: Math.min(bxs, bys) };
}
/** a start worth keeping: nothing for the default (centred, rows from the floor) */
function cleanTileStart(S) {
  if (!S) return null;
  const o = {};
  if (S.x && S.x !== 'centre') { o.x = S.x; if (S.x === 'at') { o.at = +(+S.at).toFixed(4); if (S.joint) o.joint = true; if (S.ref) o.ref = S.ref; } }
  if (+S.dx) o.dx = +(+S.dx).toFixed(4);
  if (S.y === 'top' || (S.y === 'at' && S.yh > 0)) { o.y = S.y; if (S.y === 'at') { o.yh = +(+S.yh).toFixed(4); if (S.yref) o.yref = S.yref; } }
  return Object.keys(o).length ? o : null;
}

/** what a cut is called, for the tiler */
function cutPlace(c) {
  const [k, e] = c.k.split('-');
  if (!e) return t({ left: 'left corner', right: 'right corner', floor: 'at the floor', top: 'top row' }[k]);
  const what = k === 'window' ? t('window') : k === 'door' ? t('door') : t('opening');
  return t({ l: 'left of the {what}', r: 'right of the {what}', b: 'under the {what}', t: 'above the {what}' }[e], { what });
}
/** the narrowest cut at each place (corners, floor, top, round each opening), in words */
function cutsSummary(cuts) {
  const by = new Map();
  for (const c of cuts) { const k = cutPlace(c); if (!by.has(k) || c.c < by.get(k).c) by.set(k, c); }
  return [...by.entries()].map(([k, c]) => ({ place: k, c: c.c, sliver: c.sliver, text: t('{where}: {c} mm', { where: k, c: fmtMM(c.c) }) }));
}

/* ───────── floor tiles: start, cuts, count ───────── */
/** a room's tiled floor laid out (straight, half bond or a third offset): the grid in the floor's own frame (u along
 *  the run, v across), the cut pieces, the cuts at each side of the room in the plan, and the count. null: no tiles
 *  or a herringbone floor */
function floorTileLayout(plan, r, S) {
  const F = floorSpec(r.floor);
  if (F.kind !== 'tile' || !FLOOR_GRID.has(F.pattern) || !r.poly || r.poly.length < 3) return null;
  const turn = F.dir === 90, j = FLOOR_JOINT;
  const toL = p => (turn ? [p[1], p[0]] : [p[0], p[1]]);
  const poly = r.poly.map(toL), holes = (roomHoles(plan, r) || []).map(hl => hl.map(toL));
  const bb = bboxOfPoints(poly);
  const tu = F.l, tv = F.w, MU = tu + j, MV = tv + j;
  const offs = F.pattern === 'half' ? [0, MU / 2] : F.pattern === 'third' ? [0, MU / 3, 2 * MU / 3] : [0];
  S = S === undefined ? (r.floor.start || null) : S;
  const centre = (a, b, t0) => a + tileFall({ w: t0, h: 1, joint: j }, b - a, 1).side;
  let ou, ov;
  const at = S && S.at;
  if (at === 'nw' || at === 'ne' || at === 'sw' || at === 'se') {
    const px = at[1] === 'w' ? 'min' : 'max', py = at[0] === 'n' ? 'min' : 'max';
    const pu = turn ? py : px, pv = turn ? px : py;
    ou = pu === 'min' ? bb.minX : bb.maxX - tu;
    ov = pv === 'min' ? bb.minY : bb.maxY - tv;
  } else if (at === 'door' && S.p && S.n) {
    const p = toL(S.p), n = toL(S.n);
    if (Math.abs(n[0]) >= Math.abs(n[1])) { ou = n[0] > 0 ? p[0] : p[0] - tu; ov = p[1] - tv / 2; }
    else { ov = n[1] > 0 ? p[1] : p[1] - tv; ou = p[0] - tu / 2; }
  } else { ou = centre(bb.minX, bb.maxX, tu); ov = centre(bb.minY, bb.maxY, tv); }
  const d = toL([+(S && S.dx) || 0, +(S && S.dy) || 0]);
  ou += d[0]; ov += d[1];
  const G = { ou, ov, MU, MV, tu, tv, offs };
  // the cuts along each straight side of the room (and round holes in the floor), named by the side in the plan
  const cuts = [];
  const sgn = Math.sign(polygonArea(r.poly)) || 1;
  const sideOf = (P, hole) => {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], e = V.sub(b, a), el = V.len(e);
      if (el < 0.05) continue;
      // into the floor: into the room, or out of a hole in it
      const inward = V.mul(V.perp(V.mul(e, 1 / el)), hole ? -(Math.sign(polygonArea(P)) || 1) : sgn);
      let k = null;
      if (Math.abs(e[0]) < 0.01 * el) k = inward[0] > 0 ? 'left' : 'right';
      else if (Math.abs(e[1]) < 0.01 * el) k = inward[1] > 0 ? 'top' : 'bottom';
      if (!k) continue;
      const vertical = k === 'left' || k === 'right', after = k === 'left' || k === 'top';
      const line = vertical ? a[0] : a[1];
      // in the floor's frame: a line across u (cut along the run, every row's shift) or across v
      const alongU = vertical !== turn;
      const c = alongU ? gridCutMin(line, ou, offs, MU, tu, after) : gridCut(line, ov, MV, tv, after);
      if (c > 0) cuts.push({ k: hole ? 'hole' : k, c, size: alongU ? tu : tv, sliver: c < (alongU ? tu : tv) * SLIVER - 1e-6 });
    }
  };
  sideOf(r.poly, false);
  for (const hl of roomHoles(plan, r) || []) sideOf(hl, true);
  const count = gridCount(poly, holes, G);
  return { F, turn, G, cuts, slivers: cuts.filter(c => c.sliver), count, start: S || null, toL };
}
/** the doors of a room: where they meet its floor (the wall's face) and the way into the room */
function roomDoorLines(plan, r) {
  const out = [];
  for (const f of roomFaces(plan, r)) for (const op of faceOpenings(plan, f)) {
    if (op.kind !== 'door' && op.kind !== 'opening') continue;
    const w = f.wall, d = wallDir(w), n = V.perp(d);
    const p = V.add(V.add(w.a, V.mul(d, op.pos)), V.mul(n, f.side * w.t / 2));
    out.push({ p: [+p[0].toFixed(4), +p[1].toFixed(4)], n: V.mul(n, f.side).map(v => +v.toFixed(4)), letter: f.letter, kind: op.kind });
  }
  return out;
}
/** where a floor's tiles can start */
function floorStartChoices(plan, r) {
  const list = [['centre', t('Centre of the room')], ['nw', t('Corner top left')], ['ne', t('Corner top right')], ['sw', t('Corner bottom left')], ['se', t('Corner bottom right')]].map(([k, l]) => ({ key: k, label: l, S: { at: k } }));
  roomDoorLines(plan, r).forEach((D, i, all) => list.push({ key: 'door' + i, label: t('Door line (wall {l})', { l: D.letter }) + (all.length > 1 && all.filter(x => x.letter === D.letter).length > 1 ? ' ' + (i + 1) : ''), S: { at: 'door', p: D.p, n: D.n } }));
  return list;
}
function bestFloorStart(plan, r) {
  const L0 = floorTileLayout(plan, r, null);
  if (!L0) return null;
  const turn = L0.turn, hu = L0.G.MU / 2, hv = L0.G.MV / 2;
  let best = null, bs = -1;
  for (const C of floorStartChoices(plan, r)) for (const su of [0, hu]) for (const sv of [0, hv]) {
    const [dx, dy] = turn ? [sv, su] : [su, sv];
    const S = { ...C.S, ...(dx ? { dx: +dx.toFixed(4) } : {}), ...(dy ? { dy: +dy.toFixed(4) } : {}) };
    const lay = floorTileLayout(plan, r, S);
    const v = lay.cuts.reduce((m, c) => Math.min(m, c.c / c.size), 1);
    if (v > bs + (best && best.first ? 0.1 : 1e-6)) { bs = v; best = { S, label: C.label + (su || sv ? ' + ' + t('half a tile') : ''), score: v, first: !best }; }
  }
  if (best && best.S.at === 'centre' && !best.S.dx && !best.S.dy) best.S = null;
  return best;
}
const FLOOR_SIDES = { left: 'left side', right: 'right side', top: 'top side', bottom: 'bottom side', hole: 'round the opening in the floor' };
function floorCutsSummary(cuts) {
  const by = new Map();
  for (const c of cuts) if (!by.has(c.k) || c.c < by.get(c.k).c) by.set(c.k, c);
  return ['left', 'right', 'top', 'bottom', 'hole'].filter(k => by.has(k)).map(k => { const c = by.get(k); return { place: t(FLOOR_SIDES[k]), c: c.c, sliver: c.sliver, text: t('{where}: {c} mm', { where: t(FLOOR_SIDES[k]), c: fmtMM(c.c) }) }; });
}

/* ───────── 3D: tiles, wallpaper ───────── */
/** the photo of one tile (a sample), once it is loaded; it goes in every tile */
const tilePhoto = T => (T && T.img ? imageEl(T.img) : null);
const tileTexKey = T => [T.w, T.h, T.joint, T.color, T.grout, T.lay, T.img && tilePhoto(T) ? T.img + ':' + tilePhoto(T).dataset.src : ''].join('|');
function tileTexture(T) {
  const key = 'tile|' + tileTexKey(T);
  if (TEX.has(key)) return TEX.get(key);
  const photo = tilePhoto(T);
  const j = T.joint || 0, mw = T.w + j, mh = T.h + j, rows = T.lay === 'half' ? 2 : 1;
  const W = photo ? 512 : 256, sc = W / mw, H = clamp(Math.round(mh * rows * sc), 8, 2048);
  const ky = H / (mh * rows);
  const cv = makeCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = T.grout || '#C9C4BA'; g.fillRect(0, 0, W, H);
  const jx = Math.max(1, j * sc), jy = Math.max(1, j * ky);
  // the real tile picture (texlib.js): the surface of one tile in each tile, over the chosen colour
  const det = !photo && libSet('Tiles107') ? libDetail('Tiles107', 0.8) : null;
  let seed = 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? W / 2 : 0;
    for (const x0 of [off - W, off, off + W]) {
      const x = x0 + jx / 2, y = r * mh * ky + jy / 2, tw = T.w * sc, th = T.h * ky;
      if (photo) { g.drawImage(photo, x, y, tw, th); continue; }
      const gr = g.createLinearGradient(x, y, x + tw, y + th);
      gr.addColorStop(0, shade(T.color, 1.04)); gr.addColorStop(1, shade(T.color, 0.97));
      g.fillStyle = gr; g.fillRect(x, y, tw, th);
      if (det) {
        const [px, py, pw, ph] = libPiece('Tiles107', rnd, T.w / T.h);
        g.globalCompositeOperation = 'soft-light'; g.drawImage(det, px, py, pw, ph, x, y, tw, th); g.globalCompositeOperation = 'source-over';
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / mw, 1 / (mh * rows));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { relief: 0.003 };
  if (det) tex.userData.lib = 'Tiles107';
  TEX.set(key, tex);
  return tex;
}
const tileMat = T => mat('tilem|' + tileTexKey(T), () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: tileTexture(T), roughness: 0.32, metalness: 0 }));

const IMG_EL = new Map();
function projectImage(id) { const p = app.project; return p && p.images ? p.images[id] : null; }
/** the picture's data URL (null while it is still being read from the device) */
function imageSrc(rec) {
  if (!rec) return null;
  if (rec.src) return rec.src;
  const a = Assets.get(rec.asset);
  if (a) return a.url;
  if (!IMG_ASK.has(rec.asset)) { IMG_ASK.add(rec.asset); Assets.ensure([rec.asset]).then(() => { IMG_ASK.delete(rec.asset); if (app.project && Assets.get(rec.asset)) { app.refreshViews(false); app.renderInspector(); } }); }
  return null;
}
const IMG_ASK = new Set();
/** the picture, once it is decoded (the first time: null, and the views are redrawn when it is ready) */
function imageEl(id) {
  const rec = projectImage(id), src = imageSrc(rec);
  if (!src) return null;
  let im = IMG_EL.get(id);
  if (!im || im.dataset.src !== (rec.asset || String(src.length))) {
    im = new Image();
    im.dataset.src = rec.asset || String(src.length);
    im.onload = () => { if (app.project) app.refreshViews(false); };
    im.src = src;
    IMG_EL.set(id, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
function imageTex(id) {
  const im = imageEl(id);
  if (!im) return null;
  const key = 'img|' + id + '|' + im.dataset.src;
  if (TEX.has(key)) return TEX.get(key);
  const tex = new THREE.Texture(im);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.needsUpdate = true;
  TEX.set(key, tex);
  return tex;
}
/** wallpaper: the picture repeated at its real size, or stretched over the whole wall (photo wallpaper) keeping
 *  its proportions (cut off at the sides or top) */
function paperMat(P, f, sign, H) {
  const base = imageTex(P.img);
  if (!base) return null;
  const fill = P.fit === 'fill';
  const key = 'paper|' + P.img + '|' + base.image.dataset.src + '|' + (fill ? ['fill', f.u0.toFixed(3), f.u1.toFixed(3), sign, H.toFixed(3)].join('|') : (P.w + '|' + P.h));
  return mat(key, () => {
    const tex = base.clone();
    if (fill) {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const len = Math.max(0.05, f.u1 - f.u0), aImg = base.image.naturalWidth / base.image.naturalHeight, aFace = len / H;
      const sx = aImg >= aFace ? aFace / aImg : 1, sy = aImg >= aFace ? 1 : aImg / aFace;
      const ox = (1 - sx) / 2, oy = (1 - sy) / 2;
      tex.repeat.set(sx / len, sy / H);
      tex.offset.set(sign > 0 ? ox - sx * f.u0 / len : ox + sx * f.u1 / len, oy);
    } else {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / Math.max(0.02, P.w || 0.53), 1 / Math.max(0.02, P.h || 0.53));
    }
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.9, metalness: 0 });
  });
}
/** the material of one side of a wall piece that starts at height yb */
function finishMat(fin, yb, f, sign, H) {
  const T = fin.tiles;
  if (T && (!(T.to > 0) || yb < T.to - 0.001)) return tileMat(T);
  if (fin.base === 'paper' && fin.paper && fin.paper.img) {
    const m = paperMat(fin.paper, f, sign, H);
    if (m) return m;
    const im = projectImage(fin.paper.img);
    return wallMat(im && im.avg || fin.color);
  }
  return paintMat(fin.color, fin.sheen, fin.base);
}

Object.assign(View3D.prototype, {
  /** a tap on the inside of a wall (Build): that room, with this wall opened in its details */
  faceFromHit(hit) {
    const u = hit.object.userData;
    if (!u.wallId || !hit.face) return null;
    const mi = hit.face.materialIndex, side = mi === 4 ? 1 : mi === 5 ? -1 : 0;
    if (!side) return null;
    const v = getVersion(this.app.project, u.versionId);
    const pp = this.planPoint(hit);
    if (!v || !pp) return null;
    const w = v.plan.walls.find(x => x.id === u.wallId);
    if (!w) return null;
    const along = V.dot(V.sub([pp.x, pp.y], w.a), wallDir(w));
    const f = wallFaces(v.plan, u.storeyId).find(x => x.wall.id === w.id && x.side === side && along >= x.u0 - 0.02 && along <= x.u1 + 0.02);
    return f ? { type: 'room', id: f.room.id, storey: u.storeyId, versionId: u.versionId, readOnly: !u.edit, face: w.id } : null;
  },
});

/* ───────── 2D: the finish along each wall ───────── */
Object.assign(PlanView.prototype, {
  /** "colour rooms by walls": a band along every wall in its finish (tiles with their joints); a selected room
   *  shows its walls with letters */
  drawFinishes(g, en) {
    const sel = this.spec.selection;
    const all = this.spec.colorBy === 'walls';
    const selRoom = sel && sel.type === 'room' && en.edit !== false && this.spec.mode === 'build' ? sel.id : null;
    if (!all && !selRoom) return;
    const faces = wallFaces(en.plan, en.storey.id, all ? null : en.plan.rooms.filter(r => r.id === selRoom));
    const bw = 0.1;
    for (const f of faces) {
      const fin = faceFinish(f.wall, f.room);
      const w = f.wall, d = wallDir(w), n = V.mul(V.perp(d), f.side);
      const at = (u, k) => V.add(V.add(w.a, V.mul(d, u)), V.mul(n, w.t / 2 + k));
      const pts = [at(f.u0, 0), at(f.u1, 0), at(f.u1, bw), at(f.u0, bw)];
      const T = fin.tiles;
      const im = fin.base === 'paper' && fin.paper && projectImage(fin.paper.img);
      const fill = T ? T.color : im ? (im.avg || fin.color) : fin.color;
      const isSel = selRoom === f.room.id && sel.face === w.id;
      g.appendChild(s('polygon', { points: pts.map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(' '), fill, class: 'fin-band' + (fin.own ? ' own' : '') + (im ? ' paper' : '') + (isSel ? ' sel' : ''), 'data-face': w.id }));
      if (T) {
        const a = at(f.u0, bw / 2), b = at(f.u1, bw / 2), step = Math.max(0.04, T.w + (T.joint || 0));
        g.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'fin-ticks', stroke: T.grout || '#C9C4BA', 'stroke-width': bw, 'stroke-dasharray': `0.012 ${(step - 0.012).toFixed(4)}` }));
      }
    }
  },
  /** letters A, B, C … on the walls of the selected room */
  drawFaceLabels(g) {
    const sel = this.spec.selection;
    if (!sel || sel.type !== 'room' || this.spec.mode !== 'build' || this.cam.s < 18) return;
    for (const en of this.spec.entries) {
      if (en.wallsOnly || en.edit === false) continue;
      const r = en.plan.rooms.find(x => x.id === sel.id && x.storey === en.storey.id);
      if (!r) continue;
      // small rooms on screen: smaller letters, closer to their wall
      const bb = bboxOfPoints(r.poly), px = Math.min(bb.w, bb.h) * this.cam.s;
      const rad = px < 70 ? 6.5 : 9, gap = clamp(px * 0.12 - 2, 0, 12);
      for (const f of roomFaces(en.plan, r)) {
        const w = f.wall, d = wallDir(w), n = V.mul(V.perp(d), f.side);
        const m = V.add(V.add(w.a, V.mul(d, (f.u0 + f.u1) / 2)), V.mul(n, w.t / 2 + 0.035));
        const p = this.toScreen([m[0] + en.offset[0], m[1] + en.offset[1]]);
        const q = [p[0] + n[0] * (gap + rad * 0.6), p[1] + n[1] * (gap + rad * 0.6)];
        const tg = s('g', { class: 'face-tag' + (sel.face === w.id ? ' sel' : '') + (rad < 9 ? ' small' : ''), transform: `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`, 'data-face': w.id });
        tg.appendChild(s('circle', { r: rad }));
        tg.appendChild(s('text', { y: rad < 9 ? 3 : 4 }, f.letter));
        g.appendChild(tg);
      }
    }
  },
});

/* ───────── the details panel: walls and ceiling of a room, finish of a wall ───────── */
Object.assign(app, {
  /** number field in another unit (cm, mm, %): value shown as is */
  numField(label, id, value, unit, onChange, opts = {}) {
    const inp = h('input', { class: 'input', id, type: 'text', inputmode: 'decimal', value: value == null ? '' : String(+(+value).toFixed(opts.dec ?? 1)), placeholder: opts.placeholder || '', disabled: opts.disabled, autocomplete: 'off' });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.trim().replace(',', '.'));
      if (!isFinite(v) || v < (opts.min ?? 0) || (opts.max != null && v > opts.max)) { inp.value = value == null ? '' : String(value); return; }
      onChange(v);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, unit)));
  },
  segRow(label, items, cur, onPick, ro, cls = '') {
    return h('div', { class: 'field' }, h('span', { class: 'flabel' }, label),
      h('div', { class: 'seg wrap ' + cls }, ...items.map(([k, lab]) => h('button', { 'aria-pressed': String(cur === k), 'data-k': k, disabled: ro, onclick: () => onPick(k) }, t(lab)))));
  },

  /** colour, paint name, covering (paint, renovlies, wallpaper) and tiles; set(patch, opts) stores a change */
  finishControls(box, fin, set, ro, pre) {
    const wc = h('input', { type: 'color', id: pre + '-wall-col', value: fin.color, disabled: ro, 'aria-label': t('Wall colour') });
    wc.addEventListener('input', () => set({ color: wc.value }, { coalesce: pre + 'wc' }));
    const wn = h('input', { class: 'input', id: pre + '-wall-name', value: fin.name || '', placeholder: t('e.g. RAL 9010, Sigma Pearl Clean Matt'), disabled: ro, autocomplete: 'off' });
    wn.addEventListener('input', () => set({ name: wn.value }, { coalesce: pre + 'wn' }));
    const wallSw = ['#F4F2EC', '#F1EDE4', '#E9E6DF', '#D9D5CC', '#C9CFCB', '#B7C4C9', '#A3AE9C', '#5E6B6B'];
    box.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Colour')),
      h('div', { class: 'color-row' }, wc, h('div', { class: 'swatches' }, ...wallSw.map(c => h('button', { class: 'swatch', style: { background: c }, disabled: ro, 'aria-label': t('Wall colour') + ' ' + c, 'aria-pressed': String((fin.color || '').toLowerCase() === c.toLowerCase()), onclick: () => set({ color: c }, { keepInspector: false }) }))))));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: pre + '-wall-name' }, t('Paint / colour name')), wn));
    if (!ro) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { const c = await this.colourPicker({ value: fin.color, title: t('Wall colour') }); if (c) set({ color: c.hex, name: c.name }, { keepInspector: false }); } }, icon('eye'), t('Colour library: RAL and my colours'))));
    // covering
    box.appendChild(this.segRow(t('On the wall'), COVERINGS, fin.base || 'paint', k => {
      if (k === 'paper' && !(fin.paper && fin.paper.img)) { this.choosePaper(fin, set); return; }
      set({ base: k }, { keepInspector: false });
    }, ro, 'cover-seg'));
    if (fin.base === 'paper') box.appendChild(this.paperControls(fin, set, ro, pre));
    else box.appendChild(this.segRow(t('Sheen'), SHEENS, fin.sheen || 'matt', k => set({ sheen: k }, { keepInspector: false }), ro, 'sheen-seg'));
    // tiles
    const T = fin.tiles;
    box.appendChild(this.segRow(t('Tiles'), [['none', 'No tiles'], ['to', 'To a height'], ['full', 'Full height']], !T ? 'none' : T.to > 0 ? 'to' : 'full', k => {
      if (k === 'none') set({ tiles: null }, { keepInspector: false });
      else set({ tiles: { ...TILE_DEFAULT, ...(T || {}), to: k === 'full' ? 0 : (T && T.to > 0 ? T.to : TILE_DEFAULT.to) } }, { keepInspector: false });
    }, ro, 'tile-seg'));
    if (T) box.appendChild(this.tileControls(T, set, ro, pre));
  },

  tileControls(T, set, ro, pre) {
    const box = h('div', { class: 'sub-box tile-box' });
    const upT = (patch, opts = {}) => set({ tiles: { ...T, ...patch } }, { keepInspector: false, ...opts });
    if (T.to > 0) box.appendChild(h('div', { class: 'field-row' }, this.mmField(t('Tiles up to'), pre + '-tile-to', T.to, v => upT({ to: clamp(v, 0.1, 6) }), { disabled: ro }), h('div')));
    box.appendChild(h('div', { class: 'field-row' },
      this.mmField(t('Tile width'), pre + '-tile-w', T.w, v => upT({ w: clamp(v, 0.01, 3) }), { disabled: ro }),
      this.mmField(t('Tile height'), pre + '-tile-h', T.h, v => upT({ h: clamp(v, 0.01, 3) }), { disabled: ro })));
    box.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Joint'), pre + '-tile-j', (T.joint || 0) * 1000, 'mm', v => upT({ joint: clamp(v, 0, 20) / 1000 }), { disabled: ro, max: 20 }),
      this.numField(t('Extra for cutting and breakage'), pre + '-tile-waste', T.waste ?? 10, '%', v => upT({ waste: clamp(v, 0, 60) }), { disabled: ro, max: 60, dec: 0 })));
    box.appendChild(this.segRow(t('Laying'), [['stack', 'Straight'], ['half', 'Half bond']], T.lay || 'stack', k => upT({ lay: k }), ro));
    const tc = h('input', { type: 'color', id: pre + '-tile-col', value: T.color || TILE_DEFAULT.color, disabled: ro, 'aria-label': t('Tile colour') });
    tc.addEventListener('input', () => set({ tiles: { ...T, color: tc.value } }, { coalesce: pre + 'tc' }));
    const gc = h('input', { type: 'color', id: pre + '-tile-grout', value: T.grout || TILE_DEFAULT.grout, disabled: ro, 'aria-label': t('Joint colour') });
    gc.addEventListener('input', () => set({ tiles: { ...T, grout: gc.value } }, { coalesce: pre + 'gc' }));
    box.appendChild(h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Tile colour')), tc),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Joint colour')), gc)));
    const nm = h('input', { class: 'input', id: pre + '-tile-name', value: T.name || '', placeholder: t('e.g. Mosa 30 × 60 white matt'), disabled: ro, autocomplete: 'off' });
    nm.addEventListener('input', () => set({ tiles: { ...T, name: nm.value } }, { coalesce: pre + 'tn' }));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: pre + '-tile-name' }, t('Tile name')), nm));
    box.appendChild(this.photoSampleRow(T.img, ro, pre + '-tile', t('Photo of one tile'), async () => {
      const id = await this.pickPicture(T.img, { title: t('Photo of one tile'), empty: t('No pictures yet. Add a photo of one tile, straight from the front; it goes in every tile at the size above.') });
      if (id) upT({ img: id, ...(projectImage(id) && !T.img ? { color: projectImage(id).avg } : {}) });
    }, () => upT({ img: null })));
    return box;
  },
  /** a sample photo (thumbnail, name, choose / remove) */
  photoSampleRow(img, ro, pre, label, choose, remove) {
    const im = img ? projectImage(img) : null;
    return h('div', { class: 'field photo-sample' }, h('span', { class: 'flabel' }, label),
      h('div', { class: 'paper-row' },
        im && imageSrc(im) ? h('img', { class: 'paper-thumb', src: imageSrc(im), alt: '' }) : h('span', { class: 'paper-thumb empty' }),
        h('div', { class: 'paper-meta' }, h('strong', null, im ? im.name : t('None')),
          ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: pre + '-photo', onclick: choose }, icon('image'), im ? t('Change') : t('Choose a photo…')),
            im ? h('button', { class: 'btn sm ghost', id: pre + '-photo-off', onclick: remove }, icon('close'), t('Remove')) : null))));
  },

  paperControls(fin, set, ro, pre) {
    const P = fin.paper || {};
    const im = P.img && projectImage(P.img);
    const box = h('div', { class: 'sub-box paper-box' });
    const upP = patch => set({ paper: { ...P, ...patch } }, { keepInspector: false });
    box.appendChild(h('div', { class: 'paper-row' },
      im && imageSrc(im) ? h('img', { class: 'paper-thumb', src: imageSrc(im), alt: '' }) : h('span', { class: 'paper-thumb empty' }),
      h('div', { class: 'paper-meta' }, h('strong', null, P.name || (im && im.name) || t('No picture yet')),
        ro ? null : h('button', { class: 'btn sm', id: pre + '-paper-pick', onclick: () => this.choosePaper(fin, set) }, icon('image'), t('Choose picture')))));
    const nm = h('input', { class: 'input', id: pre + '-paper-name', value: P.name || '', placeholder: t('e.g. Eijffinger Lino 379000'), disabled: ro, autocomplete: 'off' });
    nm.addEventListener('input', () => set({ paper: { ...P, name: nm.value } }, { coalesce: pre + 'pn' }));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: pre + '-paper-name' }, t('Wallpaper name')), nm));
    box.appendChild(this.segRow(t('Picture'), [['repeat', 'Repeated'], ['fill', 'Over the whole wall']], P.fit || 'repeat', k => upP({ fit: k }), ro));
    // width and height keep the proportions of the picture
    const asp = im && im.w ? im.h / im.w : (P.h || 0.53) / (P.w || 0.53);
    if ((P.fit || 'repeat') === 'repeat') box.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Repeat width'), pre + '-paper-w', (P.w || 0.53) * 100, 'cm', v => { const w = clamp(v, 1, 1000) / 100; upP({ w, h: +(w * asp).toFixed(4) }); }, { disabled: ro, min: 1 }),
      this.numField(t('Repeat height'), pre + '-paper-h', (P.h || 0.53) * 100, 'cm', v => { const hh = clamp(v, 1, 1000) / 100; upP({ h: hh, w: +(hh / asp).toFixed(4) }); }, { disabled: ro, min: 1 })));
    box.appendChild(h('p', { class: 'note-muted' }, (P.fit || 'repeat') === 'repeat' ? t('The picture is one repeat of the pattern; width and height keep its proportions. A roll is usually 53 cm wide (some 70 or 100 cm).') : t('The picture covers the whole wall, like photo wallpaper (fotobehang).')));
    return box;
  },

  async choosePaper(fin, set) {
    const id = await this.pickPicture(fin.paper && fin.paper.img);
    if (!id) return;
    const im = projectImage(id);
    const P = fin.paper && fin.paper.img === id ? fin.paper : { img: id, fit: (fin.paper && fin.paper.fit) || 'repeat', w: 0.53, h: +(0.53 * (im ? im.h / im.w : 1)).toFixed(3), name: im ? im.name.replace(/\.[a-z0-9]+$/i, '') : '' };
    set({ base: 'paper', paper: { ...P, img: id } }, { keepInspector: false });
  },

  /** pick one of the house's pictures or add one → image id */
  async pickPicture(current, opts = {}) {
    const p = this.project;
    p.images = p.images || {};
    let close = null;
    const body = h('div', { class: 'pic-body' });
    const paint = () => {
      body.textContent = '';
      const grid = h('div', { class: 'pic-grid' });
      for (const [id, im] of Object.entries(p.images)) grid.appendChild(h('button', { class: 'pic-card' + (id === current ? ' on' : ''), title: im.name, onclick: () => close(id) }, h('img', { src: imageSrc(im) || '', alt: '' }), h('span', null, im.name)));
      if (!grid.children.length) grid.appendChild(h('p', { class: 'note-muted' }, opts.empty || t('No pictures yet. Add a photo or a scan of the wallpaper (or any picture); then set how big one repeat is.')));
      body.appendChild(grid);
    };
    paint();
    return UI.dialog({
      title: opts.title || t('Wallpaper picture'), body, wide: true, onOpen: (d, c) => { close = c; },
      actions: [{ label: t('Cancel'), value: null }, { label: t('Add a picture…'), icon: 'plus', kind: 'primary', validate: async () => {
        const file = await pickFile('image/*');
        if (!file) return false;
        const id = await this.addPicture(file);
        if (id) close(id);
        return false;
      } }],
    });
  },

  /** a picture made smaller (at most 1600 pixels) and kept in the house → its id */
  async addPicture(file) {
    try {
      const url = await readFileAs(file, 'dataURL');
      const img = await loadImage(url);
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = makeCanvas(W, H), g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.drawImage(img, 0, 0, W, H);
      const src = cv.toDataURL('image/jpeg', 0.86);
      const one = makeCanvas(1, 1), g1 = one.getContext('2d');
      g1.drawImage(cv, 0, 0, 1, 1);
      const px = g1.getImageData(0, 0, 1, 1).data;
      const avg = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const id = uid('img_');
      const asset = await Assets.put(src, W, H);
      this.mutate(pr => { (pr.images = pr.images || {})[id] = { name: file.name || 'Picture', asset, w: W, h: H, avg, added: Date.now() }; }, { project: true, keepInspector: true });
      return id;
    } catch (e) {
      console.error(e);
      this.toast(t('This picture could not be read.'));
      return null;
    }
  },

  /** the "Walls" part of a room's details: the room's finish, its tiles, and each wall (A, B, C …) */
  roomWallsSection(el, r, ro, upd, plan) {
    const st = getStorey(this.project, r.storey);
    const sel = this.selection;
    const fin = roomFinish(r);
    const setRoom = (patch, opts = {}) => upd(rr => {
      const map = { color: 'wallColor', name: 'wallColorName', base: 'wallBase', paper: 'wallPaper', tiles: 'tiles', sheen: 'wallSheen' };
      for (const [k, v] of Object.entries(patch)) rr[map[k]] = v;
    }, opts);
    const sec = h('div', { class: 'insp-sec walls-sec' }, h('div', { class: 'eyebrow' }, t('Walls')));
    this.finishControls(sec, fin, setRoom, ro, 'f');
    const stats = roomFinishStats(plan, r, st);
    sec.appendChild(this.finishTotals(stats));
    el.appendChild(sec);
    // each wall; a camera mark on walls with photos of the bare wall (0033), a warning mark on walls with slivers
    const list = h('div', { class: 'face-list' });
    const viewFaces = roomFaces(plan, r);
    const viewOf = f => viewFaces.find(g => g.wall.id === f.wall.id && g.side === f.side && Math.min(g.u1, f.u1) - Math.max(g.u0, f.u0) > 0.01) || f;
    let withPhotos = 0;
    for (const row of stats.faces) {
      const f = row.f, open = sel && sel.face === f.wall.id;
      const vf = viewOf(f), nPh = wallPhotosOf(this.project, vf).length;
      if (nPh) withPhotos++;
      const sliv = row.lay && row.lay.slivers.length;
      const sw = row.fin.tiles && !(row.fin.tiles.to > 0) ? row.fin.tiles.color : row.fin.base === 'paper' && row.fin.paper && projectImage(row.fin.paper.img) ? projectImage(row.fin.paper.img).avg : row.fin.color;
      const what = [];
      if (row.ops.length) what.push(row.ops.map(o => o.kind === 'window' ? t('window') : o.kind === 'door' ? t('door') : t('opening')).join(', '));
      list.appendChild(h('button', { class: 'face-row' + (open ? ' on' : '') + (row.fin.own ? ' own' : ''), 'data-face': f.wall.id, 'aria-expanded': String(!!open), onclick: () => this.select({ ...sel, face: open ? undefined : f.wall.id }) },
        h('span', { class: 'face-letter' }, f.letter),
        nPh ? h('span', { class: 'wp-mark', title: t('{n} photos of the bare wall', { n: nPh }), 'aria-label': t('{n} photos of the bare wall', { n: nPh }) }, icon('camera'), h('span', { class: 'num' }, String(nPh))) : null,
        h('span', { class: 'face-main' }, h('span', { class: 'face-l1' }, h('span', { class: 'num' }, fmtM(row.len)), ' · ', h('span', { class: 'num' }, fmtArea(row.area)), what.length ? ' · ' + what.join(', ') : ''),
          h('span', { class: 'face-l2' }, row.fin.own ? t('Own finish') + ': ' + finishSummary(row.fin) : t('As the room'))),
        sliv ? h('span', { class: 'ts-mark', title: t('A sliver of tile on this wall'), 'aria-label': t('A sliver of tile on this wall') }, icon('alert')) : null,
        h('span', { class: 'mini-sw big', style: { background: sw } })));
      if (open) {
        const ed = this.faceEditor(r, row, ro, st, plan);
        // the open wall: its photos under its editor
        ed.appendChild(this.wallPhotoStrip(vf, () => this.renderInspector()));
        list.appendChild(ed);
      }
    }
    if (!stats.faces.length) list.appendChild(h('p', { class: 'note-muted' }, t('No walls found along this room. Its corners should lie on the faces of the walls.')));
    if (stats.faces.length) list.appendChild(h('p', { class: 'note-muted wp-count-line', id: 'wp-count' }, icon('camera'), ' ', t('{k} of {n} walls have photos of the bare wall', { k: withPhotos, n: stats.faces.length })));
    if (stats.faces.length) list.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'f-wall-views', onclick: () => this.wallViewsSheet(r) }, icon('wall'), t('Wall views (tiles, sockets, kitchen)'))));
    el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Each wall'), h('span', { class: 'eyebrow-note' }, t('letters on the plan'))), list));
  },

  finishTotals(stats) {
    const box = h('div', { class: 'fin-totals' });
    box.appendChild(h('dl', { class: 'kv' },
      h('dt', null, t('Wall area')), h('dd', null, fmtArea(stats.wall)),
      stats.tiled > 0 ? h('dt', null, t('Tiled')) : null, stats.tiled > 0 ? h('dd', null, fmtArea(stats.tiled)) : null,
      stats.tiled > 0 ? h('dt', null, t('Paint or paper')) : null, stats.tiled > 0 ? h('dd', null, fmtArea(stats.cover)) : null));
    for (const x of stats.tiles) box.appendChild(h('div', { class: 'tile-count' }, icon('grid'),
      h('span', null, h('strong', null, t('{n} tiles', { n: x.tiles })), ' · ' + tileLabel(x.T), h('br'),
        h('small', null, t('{a} of wall, with {w} % extra: {m} of tiles', { a: fmtArea(x.area), w: x.T.waste ?? 0, m: fmtArea(x.m2) })),
        x.grid ? h('small', { class: 'tile-pieces' }, h('br'), t('From the grid of each wall: {w} whole and {c} cut pieces', { w: x.whole, c: x.cut })) : null)));
    box.appendChild(h('p', { class: 'note-muted' }, t('Without doors, windows and openings, up to the ceiling.')));
    return box;
  },

  /** one wall of a room, opened in the list: as the room, or a finish of its own */
  faceEditor(r, row, ro, st, plan) {
    const f = row.f, wid = f.wall.id;
    const box = h('div', { class: 'face-edit', 'data-face': wid });
    const setFace = (patch, opts = {}) => this.mutate(pl => {
      const ww = pl.walls.find(x => x.id === wid);
      if (!ww) return;
      ww.fin = ww.fin || {};
      ww.fin[r.id] = { ...(ww.fin[r.id] || {}), ...patch };
    }, { keepInspector: true, ...opts });
    const clear = () => this.mutate(pl => {
      const ww = pl.walls.find(x => x.id === wid);
      if (!ww || !ww.fin) return;
      delete ww.fin[r.id];
      if (!Object.keys(ww.fin).length) delete ww.fin;
    }, { keepInspector: false });
    box.appendChild(h('div', { class: 'face-head' }, h('strong', null, t('Wall {l}', { l: f.letter })), h('span', { class: 'note-muted' }, `${fmtM(row.len)} · ${fmtMM(f.wall.t)} mm ${f.wall.kind === 'exterior' ? t('outer wall') : t('wall')}`)));
    box.appendChild(this.segRow(t('Finish'), [['room', 'As the room'], ['own', 'Its own']], row.fin.own ? 'own' : 'room', k => {
      if (k === 'room') clear(); else setFace({ color: row.fin.color, name: row.fin.name }, { keepInspector: false });
    }, ro, 'face-mode'));
    if (row.fin.own) this.finishControls(box, row.fin, setFace, ro, 'ff');
    if (row.fin.tiles && row.tArea > 0) {
      const L0 = row.lay, c = tileCount(row.tArea, row.fin.tiles, L0 ? L0.count.whole + L0.count.cut : null);
      box.appendChild(h('div', { class: 'tile-count' }, icon('grid'), h('span', null, h('strong', null, t('{n} tiles', { n: c.tiles })), ' ' + t('on this wall'), h('br'),
        h('small', null, L0 ? t('{w} whole and {c} cut pieces, with {p} % extra', { w: L0.count.whole, c: L0.count.cut, p: row.fin.tiles.waste ?? 0 }) : t('{a} of wall, with {w} % extra: {m} of tiles', { a: fmtArea(row.tArea), w: row.fin.tiles.waste ?? 0, m: fmtArea(c.m2) })))));
      if (L0) {
        const list = cutsSummary(L0.cuts);
        box.appendChild(h('p', { class: 'note-muted ts-cuts' }, (L0.start ? t('Tiles start: chosen') : t('Tiles start: centred, whole rows from the floor')) + (list.length ? ' · ' + list.map(x => x.text).join(' · ') : '')));
        for (const x of list.filter(q => q.sliver)) box.appendChild(h('p', { class: 'wv-warn' }, icon('alert'), ' ', t('{where} {c} mm is a sliver (under ⅓ tile)', { where: x.place.charAt(0).toUpperCase() + x.place.slice(1), c: fmtMM(x.c) })));
        box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'ff-tile-start', onclick: () => this.wallViewsSheet(r, { focus: f.letter }) }, icon('grid'), t('Where the tiles start…'))));
      }
    }
    box.appendChild(h('p', { class: 'note-muted' }, t('Tip: in 3D (Build), tap a wall inside a room to open it here.')));
    return box;
  },

  /** the ceiling of a room */
  roomCeilingSection(el, r, ro, upd, plan) {
    const st = getStorey(this.project, r.storey);
    const cc = h('input', { type: 'color', id: 'f-ceil-col', value: r.ceilingColor || CEIL_DEFAULT, disabled: ro, 'aria-label': t('Ceiling colour') });
    cc.addEventListener('input', () => upd(rr => { rr.ceilingColor = cc.value; }, { coalesce: 'cc:' + r.id }));
    const cn = h('input', { class: 'input', id: 'f-ceil-name', value: r.ceilingName || '', placeholder: t('e.g. Sigmacryl Plafond, RAL 9010'), disabled: ro, autocomplete: 'off' });
    cn.addEventListener('input', () => upd(rr => { rr.ceilingName = cn.value; }, { coalesce: 'cn:' + r.id }));
    const sel = h('select', { class: 'select', id: 'f-ceil-fin', disabled: ro }, ...CEIL_FINISHES.map(([k, lab]) => h('option', { value: k, selected: (r.ceilingFinish || 'paint') === k }, t(lab))));
    sel.addEventListener('change', () => upd(rr => { rr.ceilingFinish = sel.value; }, { keepInspector: false }));
    const sw = ['#FFFFFF', '#F7F6F2', '#F4F2EC', '#EDEBE6', '#E4E1DA', '#D9D5CC'];
    const wh = st ? st.wallHeight : DEFAULTS.wallHeight;
    el.appendChild(h('div', { class: 'insp-sec ceil-sec' },
      h('div', { class: 'eyebrow' }, t('Ceiling')),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Colour')),
        h('div', { class: 'color-row' }, cc, h('div', { class: 'swatches' }, ...sw.map(c => h('button', { class: 'swatch', style: { background: c }, disabled: ro, 'aria-label': t('Ceiling colour') + ' ' + c, 'aria-pressed': String((r.ceilingColor || CEIL_DEFAULT).toLowerCase() === c.toLowerCase()), onclick: () => upd(rr => { rr.ceilingColor = c; }, { keepInspector: false }) }))))),
      h('div', { class: 'field' }, h('label', { for: 'f-ceil-name' }, t('Paint / colour name')), cn),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'f-ceil-fin' }, t('Finish')), sel),
        this.mmField(t('Height'), 'f-ceil-h', r.ceilingH || null, v => upd(rr => { rr.ceilingH = v == null ? null : clamp(v, 1.5, Math.max(wh, 1.5)); }, { keepInspector: false }), { allowEmpty: true, placeholder: fmtMM(wh), disabled: ro })),
      h('dl', { class: 'kv' }, h('dt', null, t('Ceiling area')), h('dd', null, fmtArea(roomArea(r) - roomHoles(plan || this.shownVersion().plan, r).reduce((a, hl) => a + Math.abs(polygonArea(hl)), 0)))),
      ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { const c = await this.colourPicker({ value: r.ceilingColor || CEIL_DEFAULT, title: t('Ceiling colour') }); if (c) upd(rr => { rr.ceilingColor = c.hex; rr.ceilingName = c.name; }, { keepInspector: false }); } }, icon('eye'), t('Colour library'))),
      h('p', { class: 'note-muted' }, t('Leave the height empty for a normal ceiling; fill it in for a lowered ceiling (verlaagd plafond).'))));
  },

  /** a wall's details: the rooms on its sides and their finish */
  wallFinishSection(el, w) {
    const v = this.shownVersion();
    const faces = wallFaces(v.plan, w.storey).filter(f => f.wall.id === w.id);
    if (!faces.length) return;
    const box = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Finish')));
    for (const f of faces) {
      const fin = faceFinish(w, f.room);
      const letter = (roomFaces(v.plan, f.room).find(x => x.wall.id === w.id && Math.abs(x.u0 - f.u0) < 0.01) || {}).letter || '';
      const vf = roomFaces(v.plan, f.room).find(x => x.wall.id === w.id && Math.abs(x.u0 - f.u0) < 0.01) || f;
      const nPh = wallPhotosOf(this.project, vf).length;
      box.appendChild(h('button', { class: 'face-row', 'data-room': f.room.id, onclick: () => this.select({ type: 'room', id: f.room.id, storey: w.storey, face: w.id }) },
        h('span', { class: 'face-letter' }, letter),
        nPh ? h('span', { class: 'wp-mark', 'aria-label': t('{n} photos of the bare wall', { n: nPh }) }, icon('camera'), h('span', { class: 'num' }, String(nPh))) : null,
        h('span', { class: 'face-main' }, h('span', { class: 'face-l1' }, t('Side of {r}', { r: f.room.name })), h('span', { class: 'face-l2' }, (fin.own ? t('Own finish') + ': ' : t('As the room') + ': ') + finishSummary(fin))),
        h('span', { class: 'mini-sw big', style: { background: fin.tiles && !(fin.tiles.to > 0) ? fin.tiles.color : fin.color } })));
    }
    el.appendChild(box);
  },
});

/* ───────── room details: a jump row (task 0035) ─────────
   The room's details are long on a phone. Its sections (Floor, Walls …) are put in groups (div.jump-sec); a row of
   chips in the sticky head jumps to each, the chip of the group in view is marked, a group folds by its heading.
   Kept on this device (localStorage): which groups are folded, and per room the group last in view – the details
   of that room open there next time. */
const JUMP_STORE = 'house-planner.roomjump';
function jumpPrefs() {
  try { const p = JSON.parse(localStorage.getItem(JUMP_STORE) || '{}'); return p && typeof p === 'object' ? { fold: p.fold || {}, last: p.last || {} } : { fold: {}, last: {} }; } catch (e) { return { fold: {}, last: {} }; }
}
function jumpSave(p) {
  const keys = Object.keys(p.last);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete p.last[k];
  try { localStorage.setItem(JUMP_STORE, JSON.stringify(p)); } catch (e) { /* private window: not kept */ }
}

Object.assign(app, {
  /** start the groups of a room's details */
  jumpStart(el) { return { el, groups: [] }; },

  /** run fn (which adds sections to el) and put what it added in one group */
  jumpCall(J, key, label, fn) {
    const n = J.el.children.length;
    fn();
    this.jumpWrap(J, key, label, [...J.el.children].slice(n));
  },

  /** put these sections in one group: its heading (the first section's eyebrow) folds it */
  jumpWrap(J, key, label, nodes) {
    nodes = nodes.filter(Boolean);
    if (!nodes.length) return;
    const w = h('div', { class: 'jump-sec', 'data-jump': key });
    const first = nodes.find(n => n.parentNode === J.el);
    if (first) J.el.insertBefore(w, first); else J.el.appendChild(w);
    for (const n of nodes) w.appendChild(n);
    let eb = w.firstElementChild.querySelector(':scope > .eyebrow');
    if (!eb) { eb = h('div', { class: 'eyebrow' }, label); w.firstElementChild.prepend(eb); }
    const lead = eb.firstChild && eb.firstChild.nodeType === 3 ? eb.firstChild : document.createTextNode(label);
    const folded = !!jumpPrefs().fold[key];
    const btn = h('button', { class: 'jump-fold', type: 'button', 'aria-expanded': String(!folded), title: t('Fold or unfold') }, h('span', { class: 'jump-chev', 'aria-hidden': 'true' }), lead);
    eb.prepend(btn);
    btn.addEventListener('click', () => this.jumpFold(w, !w.classList.contains('folded')));
    if (folded) w.classList.add('folded');
    J.groups.push({ key, label, w });
  },

  jumpFold(w, fold) {
    w.classList.toggle('folded', fold);
    const b = w.querySelector('.jump-fold');
    if (b) b.setAttribute('aria-expanded', String(!fold));
    const p = jumpPrefs();
    if (fold) p.fold[w.dataset.jump] = true; else delete p.fold[w.dataset.jump];
    jumpSave(p);
    this.jumpMark();
  },

  /** the chip row in the sticky head; on a fresh open, the details go to the group last in view for this room */
  jumpFinish(J, r) {
    const el = J.el, head = el.querySelector('.insp-head');
    if (!head || J.groups.length < 2) return;
    const row = h('nav', { class: 'jump-row', 'aria-label': t('Jump to a section') },
      ...J.groups.map(g => h('button', { class: 'jump-chip', type: 'button', 'data-jump': g.key, onclick: () => this.jumpTo(g.key, true) }, g.label)));
    head.classList.add('has-jump');
    head.appendChild(row);
    if (this._inspFresh) this._jumpPad = 0;
    el.appendChild(h('div', { class: 'jump-pad', 'aria-hidden': 'true', style: { height: (this._jumpPad || 0) + 'px' } }));
    el.dataset.jumpRoom = r.id;
    if (!el._jumpScroll) {
      el._jumpScroll = true;
      let raf = 0;
      el.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.jumpMark(true); }); }, { passive: true });
    }
    const last = this._inspFresh ? (jumpPrefs().last[r.id] || null) : undefined;
    this._inspAfter = () => {
      if (last !== undefined) { if (last && el.querySelector(`.jump-sec[data-jump="${last}"]`)) this.jumpTo(last, false); else el.scrollTop = 0; }
      this.jumpMark();
    };
  },

  /** scroll the details so the group's heading sits just under the sticky head */
  jumpTo(key, smooth) {
    const el = $('#inspector');
    const w = el && el.querySelector(`.jump-sec[data-jump="${key}"]`);
    if (!w) return;
    const head = el.querySelector('.insp-head'), pad = el.querySelector('.jump-pad');
    const headH = head ? head.offsetHeight : 0;
    const top = el.scrollTop + w.getBoundingClientRect().top - el.getBoundingClientRect().top - headH;
    // room below the last groups, so their heading can reach the top too
    if (pad) {
      const need = top + el.clientHeight - (el.scrollHeight - pad.offsetHeight);
      this._jumpPad = Math.max(0, Math.ceil(need));
      pad.style.height = this._jumpPad + 'px';
    }
    const want = Math.min(Math.max(0, Math.round(top)), el.scrollHeight - el.clientHeight);
    this._jumpWant = smooth ? { key, top: want, t: performance.now() } : null;
    el.scrollTo({ top: want, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    this.jumpMark(true);
  },

  /** mark the chip of the group in view (the last whose heading has passed under the head); keep it per room */
  jumpMark(record) {
    const el = $('#inspector');
    const row = el && el.querySelector('.jump-row');
    if (!row) return;
    const head = el.querySelector('.insp-head');
    const line = (head ? head.getBoundingClientRect().bottom : el.getBoundingClientRect().top) + 12;
    let cur = null;
    for (const w of el.querySelectorAll('.jump-sec')) if (w.getBoundingClientRect().top <= line) cur = w.dataset.jump;
    // a smooth jump marks its chip at once, not the ones it passes on the way
    const want = this._jumpWant;
    if (want) {
      if (Math.abs(el.scrollTop - want.top) > 2 && performance.now() - want.t < 1500) cur = want.key;
      else this._jumpWant = null;
    }
    for (const c of row.querySelectorAll('.jump-chip')) {
      const on = c.dataset.jump === cur;
      c.classList.toggle('on', on);
      if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
      if (on) { const l = c.offsetLeft - row.offsetLeft, rr = l + c.offsetWidth; if (l < row.scrollLeft) row.scrollLeft = l - 8; else if (rr > row.scrollLeft + row.clientWidth) row.scrollLeft = rr - row.clientWidth + 8; }
    }
    if (record && el.dataset.jumpRoom) {
      const p = jumpPrefs(), id = el.dataset.jumpRoom;
      if ((p.last[id] || null) !== cur) { if (cur) { delete p.last[id]; p.last[id] = cur; } else delete p.last[id]; jumpSave(p); }
    }
  },
});

/** old house files: "Wall tiles 300 × 600 to 1.2 m" written in the paint name (IFC import) becomes real tiles */
function migrateFinishes(p) {
  const re = /^Wall tiles (\d+) × (\d+)(?:, full height| to ([\d.]+) m)$/;
  for (const v of p.versions || []) for (const r of (v.plan && v.plan.rooms) || []) {
    if (r.tiles || !r.wallColorName) continue;
    const m = re.exec(r.wallColorName.trim());
    if (!m) continue;
    r.tiles = { ...TILE_DEFAULT, w: +m[1] / 1000, h: +m[2] / 1000, to: m[3] ? +m[3] : 0 };
    r.wallColorName = '';
    if ((r.wallColor || '').toUpperCase() === '#E9E6DF') r.wallColor = WALL_FINISH_DEFAULT;
  }
  p.images = p.images || {};
}

/** what changed in the finish of a room between two versions (for "Changes") */
function finishChanges(ra, rb, A, B) {
  const ch = [];
  const lab = (list, k) => t((list.find(c => c[0] === k) || [k, k])[1]);
  const paperLabel = P => P ? (P.name || (projectImage(P.img) || {}).name || t('picture')) : '—';
  if ((ra.wallBase || 'paint') !== (rb.wallBase || 'paint')) ch.push({ field: 'Wall covering', from: lab(COVERINGS, ra.wallBase || 'paint'), to: lab(COVERINGS, rb.wallBase || 'paint') });
  if ((ra.wallSheen || 'matt') !== (rb.wallSheen || 'matt')) ch.push({ field: 'Wall sheen', from: lab(SHEENS, ra.wallSheen || 'matt'), to: lab(SHEENS, rb.wallSheen || 'matt') });
  if ((ra.wallBase === 'paper' || rb.wallBase === 'paper') && JSON.stringify(ra.wallPaper || null) !== JSON.stringify(rb.wallPaper || null)) ch.push({ field: 'Wallpaper', from: paperLabel(ra.wallPaper), to: paperLabel(rb.wallPaper) });
  if (JSON.stringify(ra.tiles || null) !== JSON.stringify(rb.tiles || null)) ch.push({ field: 'Wall tiles', from: tilesSummary(ra.tiles), to: tilesSummary(rb.tiles) });
  const own = (P, r) => P.walls.filter(w => w.fin && w.fin[r.id]).map(w => w.id + ':' + JSON.stringify(w.fin[r.id])).sort();
  const starts = (P, r) => P.walls.filter(w => w.tileStart && w.tileStart[r.id]).map(w => w.id + ':' + JSON.stringify(w.tileStart[r.id])).sort().join('|');
  if (starts(A, ra) !== starts(B, rb)) ch.push({ field: 'Where the wall tiles start', from: '', to: t('changed') });
  if (JSON.stringify((ra.floor && ra.floor.start) || null) !== JSON.stringify((rb.floor && rb.floor.start) || null)) ch.push({ field: 'Where the floor tiles start', from: '', to: t('changed') });
  const oa = own(A, ra), ob = own(B, rb);
  if (oa.join('|') !== ob.join('|')) ch.push({ field: 'Walls with their own finish', from: String(oa.length), to: String(ob.length) + (oa.length === ob.length ? ' (' + t('changed') + ')' : '') });
  if ((ra.ceilingColor || CEIL_DEFAULT).toLowerCase() !== (rb.ceilingColor || CEIL_DEFAULT).toLowerCase()) ch.push({ field: 'Ceiling colour', from: ra.ceilingColor || CEIL_DEFAULT, to: rb.ceilingColor || CEIL_DEFAULT, swatch: true });
  if ((ra.ceilingName || '') !== (rb.ceilingName || '')) ch.push({ field: 'Ceiling paint', from: ra.ceilingName || '—', to: rb.ceilingName || '—' });
  if ((ra.ceilingFinish || 'paint') !== (rb.ceilingFinish || 'paint')) ch.push({ field: 'Ceiling finish', from: lab(CEIL_FINISHES, ra.ceilingFinish || 'paint'), to: lab(CEIL_FINISHES, rb.ceilingFinish || 'paint') });
  if ((ra.ceilingH || 0) !== (rb.ceilingH || 0)) ch.push({ field: 'Ceiling height', from: ra.ceilingH ? fmtMM(ra.ceilingH) + ' mm' : t('normal'), to: rb.ceilingH ? fmtMM(rb.ceilingH) + ' mm' : t('normal') });
  return ch;
}
