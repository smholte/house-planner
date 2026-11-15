/* ───────────── hpuv.js — light-map UVs of the house scene format (hp-uv/1, task 0031) ─────────────
   hpProject / hpLayout: a port of hsf/uv1.py of smholte/house-scene-format (tag v1.0.1, FORMAT.md section 6), bit for
   bit (a public test lays out the format's sample with it). A surface is a list of charts – flat, connected pieces –
   each projected onto its plane in metres, made texels with texels_per_m and packed in rows (4 texels between charts,
   2 to the map's edge).
   The rest is House Planner's own (the format allows any layout that keeps its rules): hpChartsOf finds the charts of
   a triangle mesh, hpProjectAny also lays out sloping faces without stretching them (the reference projection is only
   true for level and upright faces), hpFolds finds triangles that lie over each other in the map (the checker's own
   test, so a surface that would fail it is laid out again). */
const HP_GAP = 4, HP_BORDER = 2;

/** 2D coordinates (metres) of points on a plane, as hsf/uv1.py project(): faces looking mostly up or down: (x, z);
 *  other faces: along the horizontal direction in the face, and down from the top */
function hpProject(points, normal) {
  const [nx, ny, nz] = normal;
  if (Math.abs(ny) >= 0.7) return points.map(p => [p[0], p[2]]);
  let hx = -nz, hz = nx;
  const ln = Math.hypot(hx, hz) || 1;
  hx /= ln; hz /= ln;
  return points.map(p => [p[0] * hx + p[2] * hz, -p[1]]);
}

/** hsf/uv1.py layout(): charts = [[points [[x, y, z] …], normal] …] → { uvs: [[[u, v] …] …], size: [W, H] } */
function hpLayout(charts, texelsPerM) {
  return hpPack(charts.map(([pts, n]) => hpProject(pts, n)), texelsPerM);
}

/** the packing half of the layout, for charts already flat (metres) */
function hpPack(flat, tpm) {
  const boxes = flat.map((f, i) => {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const p of f) { if (p[0] < u0) u0 = p[0]; if (p[1] < v0) v0 = p[1]; if (p[0] > u1) u1 = p[0]; if (p[1] > v1) v1 = p[1]; }
    return [i, u0, v0, Math.max(1, Math.ceil((u1 - u0) * tpm - 1e-6)), Math.max(1, Math.ceil((v1 - v0) * tpm - 1e-6))];
  });
  let total = 0, wmax = 0;
  for (const b of boxes) { total += (b[3] + HP_GAP) * (b[4] + HP_GAP); if (b[3] > wmax) wmax = b[3]; }
  const rowLimit = Math.max(wmax, Math.ceil(Math.sqrt(total)));
  const order = boxes.slice().sort((a, b) => (b[4] - a[4]) || (b[3] - a[3]) || (a[0] - b[0]));
  const place = new Array(boxes.length);
  let x = HP_BORDER, y = HP_BORDER, rowH = 0, width = 0;
  for (const [i, , , w, hh] of order) {
    if (x > HP_BORDER && x + w > HP_BORDER + rowLimit) { x = HP_BORDER; y += rowH + HP_GAP; rowH = 0; }
    place[i] = [x, y];
    width = Math.max(width, x + w);
    x += w + HP_GAP;
    rowH = Math.max(rowH, hh);
  }
  const W = width + HP_BORDER, H = y + rowH + HP_BORDER;
  const uvs = boxes.map(([i, u0, v0]) => {
    const [px, py] = place[i];
    return flat[i].map(p => [(px + (p[0] - u0) * tpm) / W, (py + (p[1] - v0) * tpm) / H]);
  });
  return { uvs, size: [W, H] };
}

/** like hpProject, but true for every flat face: level (nearly) and upright (nearly) faces exactly as the reference,
 *  sloping faces (a pitched roof, a ramp) along the slope – the reference's (x, z) or height would shrink them */
function hpProjectAny(points, normal) {
  const [nx, ny, nz] = normal;
  const a = Math.abs(ny);
  if (a >= 0.9999 || a <= 0.0001) return hpProject(points, normal);
  let hx = -nz, hz = nx;
  const ln = Math.hypot(hx, hz) || 1;
  hx /= ln; hz /= ln;
  // up the slope, in the face: h × n (its height grows)
  let dx = -hz * ny, dy = hz * nx - hx * nz, dz = hx * ny;
  if (dy < 0) { dx = -dx; dy = -dy; dz = -dz; }
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;
  return points.map(p => [p[0] * hx + p[2] * hz, -(p[0] * dx + p[1] * dy + p[2] * dz)]);
}

/** the charts of a triangle mesh: pos = [x, y, z …] (the numbers as stored), tris = [a, b, c …] (indices). Triangles
 *  that share an edge and lie in one plane are one chart. Returns { charts: [{ tris: [triangle numbers], normal }],
 *  skipped: [triangles without an area] } */
function hpChartsOf(pos, tris) {
  const nT = tris.length / 3;
  const N = new Float64Array(nT * 3), area = new Float64Array(nT);
  const skipped = [];
  // the same point in two triangles (welded to 0.01 mm: pieces of one face often repeat their corners)
  const keyOf = new Map(), vid = new Int32Array(pos.length / 3);
  for (let i = 0; i < vid.length; i++) {
    const k = Math.round(pos[i * 3] * 1e5) + ',' + Math.round(pos[i * 3 + 1] * 1e5) + ',' + Math.round(pos[i * 3 + 2] * 1e5);
    let v = keyOf.get(k);
    if (v === undefined) { v = keyOf.size; keyOf.set(k, v); }
    vid[i] = v;
  }
  for (let t = 0; t < nT; t++) {
    const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const l = Math.hypot(cx, cy, cz);
    area[t] = l / 2;
    if (l < 2e-8) { skipped.push(t); continue; }
    N[t * 3] = cx / l; N[t * 3 + 1] = cy / l; N[t * 3 + 2] = cz / l;
  }
  const parent = new Int32Array(nT).map((_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const edges = new Map();
  const dead = new Set(skipped);
  for (let t = 0; t < nT; t++) {
    if (dead.has(t)) continue;
    for (let e = 0; e < 3; e++) {
      const p = vid[tris[t * 3 + e]], q = vid[tris[t * 3 + (e + 1) % 3]];
      if (p === q) continue;
      const k = p < q ? p + ':' + q : q + ':' + p;
      const other = edges.get(k);
      if (other === undefined) { edges.set(k, t); continue; }
      // one plane: the same normal, and the other triangle's corners on this one's plane
      const d = N[t * 3] * N[other * 3] + N[t * 3 + 1] * N[other * 3 + 1] + N[t * 3 + 2] * N[other * 3 + 2];
      if (d < 0.9999) continue;
      const a = tris[t * 3] * 3;
      let flat = true;
      for (let j = 0; j < 3 && flat; j++) {
        const b = tris[other * 3 + j] * 3;
        const off = (pos[b] - pos[a]) * N[t * 3] + (pos[b + 1] - pos[a + 1]) * N[t * 3 + 1] + (pos[b + 2] - pos[a + 2]) * N[t * 3 + 2];
        if (Math.abs(off) > 2e-4) flat = false;
      }
      if (flat) parent[find(t)] = find(other);
    }
  }
  const byRoot = new Map();
  for (let t = 0; t < nT; t++) {
    if (dead.has(t)) continue;
    const r = find(t);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(t);
  }
  const charts = [];
  for (const list of byRoot.values()) {
    let x = 0, y = 0, z = 0;
    for (const t of list) { x += N[t * 3] * area[t]; y += N[t * 3 + 1] * area[t]; z += N[t * 3 + 2] * area[t]; }
    const l = Math.hypot(x, y, z) || 1;
    // (a level or upright chart keeps an exact normal: the reference projection then applies)
    const n = [x / l, y / l, z / l].map(c => (Math.abs(c) < 1e-9 ? 0 : Math.abs(Math.abs(c) - 1) < 1e-9 ? Math.sign(c) : c));
    charts.push({ tris: list, normal: n });
  }
  return { charts, skipped };
}

/** the checker's test "no texel centre covered by two triangles" (hsf/check.py _covered_twice), on the stored UVs:
 *  tris = [[[x, y] × 3 in texels] …] in order; returns the numbers of the triangles that cover a texel already covered */
function hpFolds(tris, W, H) {
  const seen = new Uint8Array(W * H), bad = [];
  const ex = 1.3e-4, ey = 2.7e-4;
  tris.forEach(([a, b, c], ti) => {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-12) return;
    const sgn = area > 0 ? 1 : -1;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 0.5)), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0]) - 0.5));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 0.5)), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1]) - 0.5));
    let hit = false;
    const mine = [];
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 + ey;
      for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5 + ex;
        if (sgn * ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (qx - a[0])) < 0) continue;
        if (sgn * ((c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (qx - b[0])) < 0) continue;
        if (sgn * ((a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (qx - c[0])) < 0) continue;
        const k = y * W + x;
        if (seen[k]) hit = true; else mine.push(k);
      }
    }
    if (hit) bad.push(ti);
    else for (const k of mine) seen[k] = 1;
  });
  return bad;
}
