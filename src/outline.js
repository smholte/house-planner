/* ───────────── outline.js — the top view of a 3D model, for its 2D plan symbol ─────────────
   meshOutline(tris, w, d) takes triangles in the model's normalised box (x and z from -0.5 to 0.5, y from 0
   to 1; 9 numbers per triangle) and the real width and depth, and returns
     { o: [loops], u: [loops] }   o = the whole outline seen from above, u = the outline of the high parts
                                  (backrest, headboard, cistern …), drawn as inner lines; [] when it adds nothing
   Each loop is a flat list [x0, y0, x1, y1, …] in the same normalised box (plan x, plan y = model z).
   Pure functions: also used by tools/pack-models.mjs for the built-in model library. */

function meshOutline(tris, w, d, opts = {}) {
  const N = opts.cells || 84;
  const big = Math.max(w, d, 1e-6);
  const nx = Math.max(8, Math.round(N * w / big)), nz = Math.max(8, Math.round(N * d / big));
  const full = new Uint8Array(nx * nz);
  // three heights for "high parts": the first that marks out a clear part of the outline wins
  const levels = opts.upper ? [opts.upper] : [0.62, 0.78, 0.9];
  const ups = levels.map(() => new Uint8Array(nx * nz));
  const fill = (g, ax, az, bx, bz, cx, cz) => {
    // cells whose centre lies in the triangle, plus the cells along its edges (thin parts stay visible)
    const X = v => (v + 0.5) * nx, Z = v => (v + 0.5) * nz;
    const p = [X(ax), Z(az), X(bx), Z(bz), X(cx), Z(cz)];
    const i0 = Math.max(0, Math.floor(Math.min(p[0], p[2], p[4]))), i1 = Math.min(nx - 1, Math.floor(Math.max(p[0], p[2], p[4])));
    const j0 = Math.max(0, Math.floor(Math.min(p[1], p[3], p[5]))), j1 = Math.min(nz - 1, Math.floor(Math.max(p[1], p[3], p[5])));
    const area = (p[2] - p[0]) * (p[5] - p[1]) - (p[3] - p[1]) * (p[4] - p[0]);
    if (Math.abs(area) > 1e-9) {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = i + 0.5, pz = j + 0.5;
        const w0 = (p[2] - px) * (p[5] - pz) - (p[3] - pz) * (p[4] - px);
        const w1 = (p[4] - px) * (p[1] - pz) - (p[5] - pz) * (p[0] - px);
        const w2 = (p[0] - px) * (p[3] - pz) - (p[1] - pz) * (p[2] - px);
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) g[j * nx + i] = 1;
      }
    }
    for (let e = 0; e < 3; e++) {
      const x0 = p[e * 2], z0 = p[e * 2 + 1], x1 = p[((e + 1) % 3) * 2], z1 = p[((e + 1) % 3) * 2 + 1];
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2) + 1;
      for (let k = 0; k <= n; k++) {
        const i = Math.floor(x0 + (x1 - x0) * k / n), j = Math.floor(z0 + (z1 - z0) * k / n);
        if (i >= 0 && i < nx && j >= 0 && j < nz) g[j * nx + i] = 1;
      }
    }
  };
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2], bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5], cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    fill(full, ax, az, bx, bz, cx, cz);
    // faces looking up, high up: the tops of the high parts
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
    const len = Math.hypot(nX, nY, nZ);
    if (len > 1e-12 && Math.abs(nY) / len > 0.5) {
      const my = (ay + by + cy) / 3;
      levels.forEach((thr, k) => { if (my >= thr) fill(ups[k], ax, az, bx, bz, cx, cz); });
    }
  }
  const o = gridLoops(full, nx, nz);
  let nf = 0;
  for (let k = 0; k < full.length; k++) nf += full[k];
  // the high parts add something only when they cover a clear part of the outline, not (nearly) all of it
  for (const up of ups) {
    let nu = 0;
    for (let k = 0; k < up.length; k++) nu += up[k];
    if (nu > 6 && nu < nf * 0.9) return { o, u: gridLoops(up, nx, nz) };
  }
  return { o, u: [] };
}

/** binary grid → simplified closed loops (normalised coordinates) */
function gridLoops(g, nx, nz) {
  const at = (i, j) => (i >= 0 && i < nx && j >= 0 && j < nz) ? g[j * nx + i] : 0;
  const out = new Map(); // vertex key → outgoing edges [to]
  const add = (ax, az, bx, bz) => { const k = az * (nx + 1) + ax; if (!out.has(k)) out.set(k, []); out.get(k).push([ax, az, bx, bz]); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add(i, j, i + 1, j);
    if (!at(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!at(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!at(i - 1, j)) add(i, j + 1, i, j);
  }
  const loops = [];
  const key = (x, z) => z * (nx + 1) + x;
  for (;;) {
    let start = null;
    for (const [k, list] of out) { if (list.length) { start = list.pop(); if (!list.length) out.delete(k); break; } }
    if (!start) break;
    const pts = [[start[0], start[1]]];
    let cur = start, guard = 0;
    while (guard++ < 100000) {
      const k = key(cur[2], cur[3]);
      if (cur[2] === start[0] && cur[3] === start[1]) break;
      pts.push([cur[2], cur[3]]);
      const list = out.get(k);
      if (!list || !list.length) break;
      // at a pinch point take the sharpest turn, so touching corners stay separate loops
      let bi = 0;
      if (list.length > 1) {
        const dx = cur[2] - cur[0], dz = cur[3] - cur[1];
        let best = -Infinity;
        list.forEach((e, idx) => { const ex = e[2] - e[0], ez = e[3] - e[1]; const turn = dx * ez - dz * ex; if (turn > best) { best = turn; bi = idx; } });
      }
      const nxt = list.splice(bi, 1)[0];
      if (!list.length) out.delete(k);
      cur = nxt;
    }
    // area in cells: skip specks
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    if (Math.abs(a) / 2 < 3) continue;
    const s = simplifyLoop(pts, 0.85);
    if (s.length < 3) continue;
    const flat = [];
    for (const [x, z] of s) flat.push(+(x / nx - 0.5).toFixed(3), +(z / nz - 0.5).toFixed(3));
    loops.push(flat);
  }
  return loops;
}

/** Douglas–Peucker on a closed loop (tolerance in cells) */
function simplifyLoop(pts, eps) {
  if (pts.length <= 4) return pts;
  // split at the two points farthest apart
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  best = -1;
  for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - pts[b][0]) ** 2 + (pts[i][1] - pts[b][1]) ** 2; if (d > best) { best = d; a = i; } }
  if (a > b) [a, b] = [b, a];
  const dp = (seg) => {
    if (seg.length < 3) return seg;
    const p = seg[0], q = seg[seg.length - 1];
    const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
    let mi = 0, md = -1;
    for (let i = 1; i < seg.length - 1; i++) { const d = Math.abs((seg[i][0] - p[0]) * dz - (seg[i][1] - p[1]) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md <= eps) return [p, q];
    const l = dp(seg.slice(0, mi + 1)), r = dp(seg.slice(mi));
    return l.slice(0, -1).concat(r);
  };
  const s1 = dp(pts.slice(a, b + 1));
  const s2 = dp(pts.slice(b).concat(pts.slice(0, a + 1)));
  return s1.slice(0, -1).concat(s2.slice(0, -1));
}
