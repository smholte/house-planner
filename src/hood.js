/* ───────────── hood.js — the streets and the houses of the neighbourhood, as the site plan has them ─────────────
   site.streets: [{ kind, poly, est }] – 'road' (herringbone pavers, 10 cm below the pavement), 'park' (the parking
   strip: stretcher bond, at the road's level, with the trees' planters) and 'path' (the pavement: grey 30 × 30 tiles);
   kerbs where the road meets the pavement, a flat edge band where it meets the parking strip.
   site.around (besides the park, around.js):
     blds    [{ m: [x, y, length, width, ridge°] (the main roof as drawn, eaves and verges included), x: [[x, y, length,
             width]] (cross gables, their ridge square to the main one), pv: [[x, y, w, h, °]] (solar panels as drawn),
             o (the roof's outline, for 2D), b (brick), r (roof), g (white upper gable), lot, est (estimated: not on the
             drawing, from Google's pictures) }]
     flats   [{ o: outline, a: against a house (an annex; else a shed), h, est }]
     walls, screens, hedges: [pts] – the low brick walls (orange on the drawing), the green screens (ivy on mesh, lime)
             and hedges (green) along the plots
     lamps   [[x, y]] (street lamps, ☀ on the drawing), planters: [[x, y, length, width, °]] (around the street trees),
             drives: [[x, y, length, width, °]] (the neighbours' parking places, the triangles on the drawing)
   The closer to the house, the more there is to each house: far away walls with windows, a roof and its gables; nearer
   also the solar panels, the cross gables and the sheds; close by also the gutters, the boards along the roof's edges
   and the ridge. A neighbour can be this house mirrored (HOUSE.mirror: its lot), in a slightly darker brick. */

const HOOD_PITCH = 50, HOOD_OV = 0.35, HOOD_GO = 0.25;
/** street levels: the pavement at the street's level, the road and the parking strip 10 cm lower */
const HOOD_LEVEL = { road: -0.1, park: -0.1, path: 0 };

/* ───────── materials ───────── */
/** the road's pavers in herringbone (visgraat), 20 × 10 cm, warm grey-brown; the parking
 *  strip's in stretcher bond, grey */
function hoodPaverTex(kind) {
  const key = 'hood-' + kind + (libLowMem() ? '|s' : '');
  if (TEX.has(key)) return TEX.get(key);
  const N = libLowMem() ? 256 : 512, cv = makeCanvas(N, N), g = cv.getContext('2d');
  const rnd = vegRng(kind === 'road' ? 71 : 37);
  const base = kind === 'road' ? [152, 138, 125] : [136, 132, 127];
  const col = () => {
    const f = 0.88 + rnd() * 0.22, warm = kind === 'road' && rnd() < 0.15 ? [1.05, 0.96, 0.93] : [1, 1, 1], dark = rnd() < 0.07 ? 0.85 : 1;
    return `rgb(${base.map((v, i) => clamp(Math.round(v * f * warm[i] * dark), 0, 255)).join(',')})`;
  };
  g.fillStyle = kind === 'road' ? '#7a7169' : '#6e6c69'; g.fillRect(0, 0, N, N);
  const u = N / 8, jt = Math.max(1, N / 256);   // 10 cm; the joint
  const stone = (x, y, w, h) => {
    for (const dx of [0, -N, N]) for (const dy of [0, -N, N]) {
      const X = x + dx, Y = y + dy;
      if (X > N || Y > N || X + w < 0 || Y + h < 0) continue;
      g.fillRect(X + jt, Y + jt, w - 2 * jt, h - 2 * jt);
    }
  };
  if (kind === 'road') {
    for (let i = -2; i < 10; i++) for (let j = -2; j < 10; j++) {
      const x = (((i * 2 + j) * u) % N + N) % N, y = (((j * 2 - i) * u) % N + N) % N;
      g.fillStyle = col(); stone(x, y, 2 * u, u);
      g.fillStyle = col(); stone((x + u) % N, (y + u) % N, u, 2 * u);
    }
  } else {
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) { g.fillStyle = col(); stone((c * 2 + (r % 2)) * u, r * u, 2 * u, u); }
  }
  // a fine grain on the stones
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) { const v = (rnd() - 0.5) * 16; img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.8, 1 / 0.8);
  // (the herringbone at 45° to the street, as it is laid)
  if (kind === 'road') t.rotation = Math.PI / 4;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.userData.hq = { relief: 0.008, strength: 1.4 };
  TEX.set(key, t);
  return t;
}
function hoodStreetMat(kind) {
  if (kind === 'path') return gardenMaterial('path');
  return mat('hood|' + kind + (libLowMem() ? '|s' : ''), () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: hoodPaverTex(kind), roughness: 0.92 });
    m.userData.macro = 'hard'; m.onBeforeCompile = sh => macroPatch(sh, 'hard'); m.customProgramCacheKey = () => 'macro-hard';
    return m;
  });
}
/** kerbs and edge bands: light grey concrete */
const hoodKerbMat = () => libMaterial('Concrete014', { tint: '#BDBAB2', size: 1.6 }) || mat('hood|kerb', () => new THREE.MeshStandardMaterial({ color: 0xb4b1aa, roughness: 0.85 }));
const hoodDark = (key, c, rough = 0.6, metal = 0) => mat('hood|' + key, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
const hoodWhite = () => hoodDark('white', 0xe9e7e1, 0.7);
const hoodFlatRoof = () => hoodDark('flatroof', 0x3e3f42, 0.9);
const hoodShed = () => libMaterial('Wood012', { tint: '#4A4540', contrast: 1.4, rot: 90, size: [1.0, 0.5] }) || hoodDark('shed', 0x4a4540, 0.85);
const hoodScreenMat = () => gardenMaterial('hedge');
/** the park's paths: light grey-beige concrete, no joints (as on the picture) */
const hoodParkPathMat = () => libMaterial('Concrete014', { tint: '#C9C2B7', size: 2.4 }) || gardenMaterial('path');
const hoodRubber = c => mat('hood|rubber|' + c, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.95 }));

/* ───────── a house ───────── */
/** a quad or triangle facing out (dir): corners turned round if they face the other way */
function hoodFace(B, P, U, out) {
  const nn = vNorm(vCross(vSub(P[1], P[0]), vSub(P[2], P[0])));
  if (vDot(nn, out) < 0) { P = [...P].reverse(); U = [...U].reverse(); }
  (P.length === 4 ? aroundQuad : aroundTri)(B, P, U);
}
/** a gable volume: centre c (plan), ridge along u, length L (eaves' overhang included), width W; its walls, gables and
 *  roof into the buffers; returns the roof's height function (plan point → height, or null outside) */
function hoodVolume(c, u, L, W, o) {
  const { y0, eave, ridgeMax, F, Gb, R, extra } = o;
  const n = [-u[1], u[0]];
  const p = HOOD_PITCH * Math.PI / 180;
  const aL = Math.max(0.5, L / 2 - HOOD_GO), aW = Math.max(0.5, W / 2 - HOOD_OV);
  const rise = Math.max(0.6, Math.min(aW * Math.tan(p), ridgeMax - eave));
  const ye = y0 + eave, yr = ye + rise, drop = HOOD_OV * rise / aW;
  const P = (s, t, y) => [c[0] + u[0] * s + n[0] * t, y, c[1] + u[1] * s + n[1] * t];
  const D3 = (s, t) => [u[0] * s + n[0] * t, 0, u[1] * s + n[1] * t];
  // walls: the two long ones (eaves) and the two gable ends
  for (const t of [-aW, aW]) hoodFace(F, [P(-aL, t, y0), P(aL, t, y0), P(aL, t, ye), P(-aL, t, ye)], [[0, 0], [2 * aL, 0], [2 * aL, eave], [0, eave]], D3(0, Math.sign(t)));
  for (const s of [-aL, aL]) {
    hoodFace(F, [P(s, -aW, y0), P(s, aW, y0), P(s, aW, ye), P(s, -aW, ye)], [[0, 0], [2 * aW, 0], [2 * aW, eave], [0, eave]], D3(Math.sign(s), 0));
    hoodFace(Gb, [P(s, -aW, ye), P(s, aW, ye), P(s, 0, yr)], [[0, eave], [2 * aW, eave], [aW, eave + rise]], D3(Math.sign(s), 0));
  }
  // the roof: two slopes to the eaves' overhang and the verges' overhang
  const sl = Math.hypot(W / 2, rise + drop);
  for (const t of [-1, 1]) hoodFace(R, [P(-L / 2, t * W / 2, ye - drop), P(L / 2, t * W / 2, ye - drop), P(L / 2, 0, yr), P(-L / 2, 0, yr)], [[0, 0], [L, 0], [L, sl], [0, sl]], vNorm([n[0] * t * rise, W / 2, n[1] * t * rise]));
  if (extra) {
    // close by: the gutters along the eaves, the boards along the verges and the eaves, and the ridge
    const { E, Gt } = extra;
    for (const t of [-1, 1]) {
      const yb = ye - drop;
      // the board along the eave (20 cm) and the gutter in front of it
      hoodFace(E, [P(-L / 2, t * W / 2, yb - 0.2), P(L / 2, t * W / 2, yb - 0.2), P(L / 2, t * W / 2, yb), P(-L / 2, t * W / 2, yb)], [[0, 0], [L, 0], [L, 0.2], [0, 0.2]], D3(0, t));
      const tg = t * (W / 2 + 0.07);
      hoodFace(Gt, [P(-L / 2, tg, yb - 0.17), P(L / 2, tg, yb - 0.17), P(L / 2, tg, yb - 0.04), P(-L / 2, tg, yb - 0.04)], [[0, 0], [L, 0], [L, 0.13], [0, 0.13]], D3(0, t));
      hoodFace(Gt, [P(-L / 2, tg, yb - 0.17), P(L / 2, tg, yb - 0.17), P(L / 2, t * W / 2, yb - 0.17), P(-L / 2, t * W / 2, yb - 0.17)], [[0, 0], [L, 0], [L, 0.07], [0, 0.07]], [0, -1, 0]);
      // the boards along the verges (gable ends): 20 cm deep, from the eave up to the ridge
      for (const s of [-L / 2, L / 2]) hoodFace(E, [P(s, t * W / 2, yb - 0.2), P(s, 0, yr - 0.2), P(s, 0, yr), P(s, t * W / 2, yb)], [[0, 0], [sl, 0], [sl, 0.2], [0, 0.2]], D3(Math.sign(s), 0));
    }
    // the ridge: a row of ridge tiles
    const rw = 0.16;
    for (const t of [-1, 1]) hoodFace(Gt, [P(-L / 2, t * rw, yr + 0.02), P(L / 2, t * rw, yr + 0.02), P(L / 2, 0, yr + 0.1), P(-L / 2, 0, yr + 0.1)], [[0, 0], [L, 0], [L, 0.2], [0, 0.2]], vNorm([n[0] * t, 1, n[1] * t]));
  }
  // the roof's height over a plan point
  return q => {
    const d = [q[0] - c[0], q[1] - c[1]], s = d[0] * u[0] + d[1] * u[1], t = d[0] * n[0] + d[1] * n[1];
    if (Math.abs(s) > L / 2 + 0.05 || Math.abs(t) > W / 2 + 0.05) return null;
    return yr - (Math.abs(t) / (W / 2)) * (rise + drop);
  };
}
/** one house of the neighbourhood into the buffers (by material); lod 0 far … 2 close by */
function hoodHouse(H, y0, bufs, lod) {
  const get = (k, make) => (bufs.get(k) || bufs.set(k, { B: new VegBuf(), make }).get(k)).B;
  const [cx, cy, L, W, ang] = H.m;
  const a = ang * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]];
  const brick = H.b || [0.55, 0.3, 0.22];
  const F = get('f|' + brick.join(','), () => aroundFacadeMat(brick));
  const gw = H.g ? [0.9, 0.89, 0.86] : brick;
  const Gb = get('g|' + gw.join(','), () => aroundBrickMat(gw));
  const roof = H.r || [0.17, 0.17, 0.18];
  const R = get('r|' + roof.join(','), () => aroundRoofMat(roof));
  const extra = lod >= 2 ? { E: get('e|' + (H.g ? 'w' : 'd'), () => (H.g ? hoodWhite() : hoodDark('board', 0x2f3133, 0.6))), Gt: get('gt', () => hoodDark('gutter', 0x3a3c3f, 0.5, 0.3)) } : null;
  // (a wide roof over one storey: the eaves low; else two storeys under the roof)
  const eave = W > 11.5 ? 3.4 : 5.7;
  const ridgeMax = 12;
  const heights = [hoodVolume([cx, cy], u, L, W, { y0, eave, ridgeMax, F, Gb, R, extra })];
  const mainRidge = y0 + eave + Math.min((W / 2 - HOOD_OV) * Math.tan(HOOD_PITCH * Math.PI / 180), ridgeMax - eave);
  if (lod >= 1) for (const [x2, y2, L2, W2] of H.x || []) {
    // a cross gable: its ridge square to the main one, on to the main ridge where it stands against the house
    const dn = (x2 - cx) * n[0] + (y2 - cy) * n[1], ds = (x2 - cx) * u[0] + (y2 - cy) * u[1];
    const sg = dn >= 0 ? 1 : -1, outer = dn + sg * L2 / 2;
    const inner = Math.abs(dn) - L2 / 2 < W / 2 ? 0 : dn - sg * L2 / 2;
    const len = Math.abs(outer - inner), mid = (outer + inner) / 2;
    if (len < 1) continue;
    const c2 = [cx + u[0] * ds + n[0] * mid, cy + u[1] * ds + n[1] * mid];
    heights.push(hoodVolume(c2, n, len, W2, { y0, eave: Math.min(eave, 5.7), ridgeMax: Math.min(ridgeMax, mainRidge - y0 - 0.15), F, Gb, R, extra }));
  }
  // solar panels on the roof, as drawn (a little above the tiles)
  if (lod >= 1 && H.pv && H.pv.length) {
    const PV = get('pv', () => aroundPvMat());
    const roofAt = q => { let best = null; for (const f of heights) { const v = f(q); if (v != null && (best == null || v > best)) best = v; } return best; };
    for (const [x, y, w, h, deg] of H.pv) {
      const r = deg * Math.PI / 180, a1 = [Math.cos(r) * w / 2, Math.sin(r) * w / 2], b1 = [-Math.sin(r) * h / 2, Math.cos(r) * h / 2];
      const C = [[x - a1[0] - b1[0], y - a1[1] - b1[1]], [x + a1[0] - b1[0], y + a1[1] - b1[1]], [x + a1[0] + b1[0], y + a1[1] + b1[1]], [x - a1[0] + b1[0], y - a1[1] + b1[1]]];
      const hs = C.map(roofAt);
      if (hs.some(v => v == null)) continue;
      // (inset 3 cm: the frame between panels)
      const P3 = C.map((q, k) => { const m = [x + (q[0] - x) * 0.94, y + (q[1] - y) * 0.94]; return [m[0], (roofAt(m) ?? hs[k]) + 0.07, m[1]]; });
      hoodFace(PV, P3, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
    }
  }
}
/** a flat-roofed annex or shed: walls along its outline, the roof, a coping close by */
function hoodFlat(Fl, y0, bufs, lod, brick) {
  const get = (k, make) => (bufs.get(k) || bufs.set(k, { B: new VegBuf(), make }).get(k)).B;
  let o = Fl.o;
  if (!o || o.length < 3) return;
  if (polygonArea(o) < 0) o = [...o].reverse();
  const h = Fl.h || (Fl.a ? 3.1 : 2.5);
  const W = Fl.est ? get('f|0.9,0.89,0.86', () => aroundFacadeMat([0.9, 0.89, 0.86])) : Fl.a ? get('g|' + brick.join(','), () => aroundBrickMat(brick)) : get('shed', () => hoodShed());
  const R = get('flatroof', () => hoodFlatRoof());
  const yt = y0 + h;
  for (let i = 0; i < o.length; i++) {
    const p = o[i], q = o[(i + 1) % o.length], Lw = V.dist(p, q);
    if (Lw < 0.05) continue;
    const d = V.norm(V.sub(q, p)), out = [d[1], 0, -d[0]];
    hoodFace(W, [[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], yt, q[1]], [p[0], yt, p[1]]], [[0, 0], [Lw, 0], [Lw, h], [0, h]], polygonArea(o) > 0 ? out : vMul(out, -1));
  }
  const tris = THREE.ShapeUtils.triangulateShape(o.map(q => new THREE.Vector2(q[0], q[1])), []);
  for (const [i, j, k] of tris) hoodFace(R, [[o[i][0], yt, o[i][1]], [o[j][0], yt, o[j][1]], [o[k][0], yt, o[k][1]]], [o[i], o[j], o[k]], [0, 1, 0]);
  if (lod >= 2) {
    // the coping (aluminium) round the roof's edge
    const C = get('coping', () => hoodDark('coping', 0x8d9093, 0.45, 0.4));
    for (let i = 0; i < o.length; i++) {
      const p = o[i], q = o[(i + 1) % o.length], Lw = V.dist(p, q);
      if (Lw < 0.05) continue;
      const d = V.norm(V.sub(q, p)), out = polygonArea(o) > 0 ? [d[1], 0, -d[0]] : [-d[1], 0, d[0]];
      const P = (r, y) => [r[0] + out[0] * 0.03, y, r[1] + out[2] * 0.03];
      hoodFace(C, [P(p, yt - 0.12), P(q, yt - 0.12), P(q, yt + 0.06), P(p, yt + 0.06)], [[0, 0], [Lw, 0], [Lw, 0.18], [0, 0.18]], out);
    }
  }
}

/* ───────── the street ───────── */
/** where a road's edge meets the pavement (a kerb) or the parking strip (a flat band): pieces of about 1 m along each
 *  edge of the road and the parking strip, by what is just outside them */
function hoodKerbs(streets, extra) {
  const low = streets.filter(s => HOOD_LEVEL[s.kind] < 0), high = [...streets.filter(s => HOOD_LEVEL[s.kind] >= 0).map(s => s.poly), ...extra];
  const kerbs = [], bands = [];
  for (const s of low) {
    const P = s.poly, ccw = polygonArea(P) > 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], Lg = V.dist(a, b);
      if (Lg < 0.02) continue;
      const d = V.norm(V.sub(b, a)), out = ccw ? [d[1], -d[0]] : [-d[1], d[0]];
      const k = Math.max(1, Math.round(Lg / 1.0));
      let cur = null, curKind = null;
      const flush = () => { if (cur && cur.length > 1) (curKind === 'kerb' ? kerbs : bands).push(cur); cur = null; curKind = null; };
      for (let j = 0; j < k; j++) {
        const m = V.lerp(a, b, (j + 0.5) / k), q = V.add(m, V.mul(out, 0.3));
        const inHigh = high.some(h => pointInPolygon(q, h));
        const inPark = s.kind === 'road' && streets.some(o => o !== s && o.kind === 'park' && pointInPolygon(q, o.poly));
        const inLow = streets.some(o => o !== s && HOOD_LEVEL[o.kind] < 0 && pointInPolygon(q, o.poly));
        const kind = inHigh ? 'kerb' : inPark ? 'band' : inLow ? null : 'kerb';
        if (kind !== curKind) { flush(); if (kind) { cur = [V.lerp(a, b, j / k)]; curKind = kind; } }
        if (cur) cur.push(V.lerp(a, b, (j + 1) / k));
      }
      flush();
    }
  }
  // (pieces along one edge, end to end, as one line)
  const simplify = L => L.map(l => [l[0], l[l.length - 1]]);
  return { kerbs: simplify(kerbs), bands: simplify(bands) };
}

Object.assign(View3D.prototype, {
  /** the streets: road, parking strip and pavement at their levels, kerbs and bands, planters, lamps, street trees */
  buildStreets(G, site, sl, add, plotOutline) {
    const streets = site.streets || [];
    if (!streets.length) return;
    const A = site.around || {};
    const bins = new Map();
    const addB = (geo, m, o = {}) => { const k = m.uuid + '|' + (o.cast ? 1 : 0) + (o.walk ? 1 : 0); if (!bins.has(k)) bins.set(k, { m, o, geos: [] }); bins.get(k).geos.push(geo); };
    for (const st of streets) {
      const top = sl + (HOOD_LEVEL[st.kind] ?? 0);
      const shape = new THREE.Shape(st.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      // (a thick slab, so the bridge over the canal has a side)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: top - (sl - 0.45), bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, sl - 0.45, 0);
      add(geo, hoodStreetMat(HOOD_LEVEL[st.kind] == null ? 'path' : st.kind), { walk: true }).userData.street = st.kind;
    }
    // kerbs (12 cm, their top level with the pavement) and the flat bands between the road and the parking strip
    const planterPolys = (A.planters || []).map(hoodPlanterPoly);
    const { kerbs, bands } = hoodKerbs(streets, [plotOutline, ...planterPolys].filter(Boolean));
    for (const [a, b] of kerbs) {
      const d = V.norm(V.sub(b, a));
      addB(gBox(V.sub(a, V.mul(d, 0.06)), V.add(b, V.mul(d, 0.06)), sl - 0.25, sl + 0.004, 0.12), hoodKerbMat(), { walk: true });
    }
    for (const [a, b] of bands) addB(gBox(a, b, sl - 0.12, sl - 0.097, 0.1), hoodKerbMat(), { walk: true });
    // the planters round the street trees: a raised kerb, soil and low planting
    for (const P of planterPolys) {
      addB(gRibbon([...P, P[0]], sl - 0.2, sl + 0.08, 0.1), hoodKerbMat(), { cast: true });
      addB(gFlat(P, sl + 0.03), gardenMaterial('bark'));
    }
    // street lamps: a grey pole with a round lamp on top (as along the canal)
    for (const [x, y] of A.lamps || []) {
      addB(new THREE.CylinderGeometry(0.045, 0.065, 5.4, 8).translate(x, sl + 2.7, y), hoodDark('pole', 0x55585c, 0.5, 0.5), { cast: true });
      addB(new THREE.CylinderGeometry(0.24, 0.2, 0.18, 14).translate(x, sl + 5.45, y), hoodDark('lamp', 0x6b6e72, 0.4, 0.5), { cast: true });
      addB(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14).translate(x, sl + 5.35, y), hoodDark('lampglass', 0xeeeeea, 0.3));
    }
    for (const { m, o, geos } of bins.values()) add(mergeBoxGeos(geos), m, o).userData.street = 'detail';
    // street trees (young, in their planters), low planting in the planters close by
    const home = polyCentroid(site.plot);
    for (const t of site.trees || []) {
      const [x, z, d] = t, inPl = planterPolys.some(P => pointInPolygon([x, z], P));
      this.gTree(G, { x, y: z, d: d || 5, h: Math.max(6, (d || 5) * 1.35), kind: 'tree' }, sl + (inPl ? 0.03 : 0), add, { species: t[3] || 'broadleaf' });
    }
    if (!this.fast) for (const [x, y, L, W, deg] of A.planters || []) {
      if (V.dist([x, y], home) > 60) continue;
      const r = deg * Math.PI / 180, u = [Math.cos(r), Math.sin(r)];
      for (const s of [-1.1, 1.1]) this.gTree(G, { kind: 'shrub', x: x + u[0] * s, y: y + u[1] * s, d: 0.9, h: 0.55 }, sl + 0.03, add);
    }
  },

  /** the houses of the neighbourhood (site.around.blds, flats), their garden walls and screens */
  buildHood(G, site, ground, add, spec) {
    const A = site.around;
    if (!A || !(A.blds || A.flats)) return;
    const home = polyCentroid(site.plot);
    const lodOf = pts => { const d = Math.min(...pts.map(q => V.dist(q, home))); return d < 45 ? 2 : d < 100 ? 1 : 0; };
    const mirrored = spec && spec.shell && this.buildLot3 ? this.buildLot3(G, spec, ground) : false;
    const bufs = new Map();
    const blds = (A.blds || []).filter(H => !(mirrored && H.lot === 3));
    for (const H of blds) hoodHouse(H, ground, bufs, H.est ? Math.min(1, lodOf([H.m])) : lodOf(H.o || [H.m]));
    for (const Fl of A.flats || []) {
      if (mirrored && Fl.lot === 3) continue;
      const lod = lodOf(Fl.o);
      if (!Fl.a && !Fl.est && lod < 1) continue;
      // an annex in the brick of the house it stands against
      const c = polyCentroid(Fl.o);
      let best = null;
      for (const H of blds) { const d = V.dist(c, H.m); if (!best || d < best.d) best = { d, H }; }
      hoodFlat(Fl, ground, bufs, lod, (best && best.H.b) || [0.55, 0.3, 0.22]);
    }
    for (const { B, make } of bufs.values()) {
      const geo = B.geo();
      if (!geo) continue;
      add(geo, make(), { cast: true }).userData.around = true;
    }
    // along the plots: low brick walls with a course on edge, green screens, hedges
    const lv = site.level ?? -0.15, bins = new Map();
    const addB = (geo, m, o = {}) => { const k = m.uuid + (o.cast ? '|c' : ''); if (!bins.has(k)) bins.set(k, { m, o, geos: [] }); bins.get(k).geos.push(geo); };
    for (const l of A.walls || []) if (l.length > 1) {
      addB(gRibbon(l, ground - 0.05, lv + 0.35, 0.22), gWallBrick(), { cast: true });
      addB(gRibbon(l, lv + 0.35, lv + 0.45, 0.22), gRollaag(), { cast: true });
    }
    for (const l of A.screens || []) if (l.length > 1) addB(gRibbon(l, lv, lv + 1.8, 0.14), hoodScreenMat(), { cast: true });
    // the neighbours' drives (their parking places, paved like the parking strip), level with the pavement
    const sl = site.streetLevel ?? -0.2;
    for (const d of A.drives || []) addB(gSlab(hoodPlanterPoly(d), ground - 0.02, sl + 0.006), hoodStreetMat('park'), { walk: true });
    for (const l of A.hedges || []) if (l.length > 1) addB(gRibbon(l, lv, lv + 1.2, 0.5), hoodScreenMat(), { cast: true });
    for (const { m, o, geos } of bins.values()) add(mergeBoxGeos(geos), m, o).userData.around = true;
  },
});
/* ───────── a neighbour that is this house mirrored ─────────
   HOUSE.mirror (from the house built into the app): { lot, x, dy, brick } – the neighbour's building in the site's
   neighbourhood (around.blds with that lot) is this house mirrored: x' = x − plan x, y' = y + dy; its main brick a little
   darker (× brick). Built from the builder's model as it is delivered (the outside: brick, windows, doors, roof, plinth –
   not what is planned inside). */
Object.assign(View3D.prototype, {
  buildLot3(G, spec) {
    const sh = spec.shell, L3 = spec.lot3, M = HOUSE.mirror;
    if (!sh || !L3 || !L3.storeys || !sh.storeys || !M) return false;
    const grp = new THREE.Group();
    grp.scale.x = -1;
    grp.position.set(M.x, 0, M.dy);
    grp.userData.lot3 = true;
    let n = 0;
    for (const st of L3.storeys) {
      for (const part of sh.storeys[st.id] || []) {
        const m = sh.materials[part.key] || part.mat || { kind: 'plain' };
        const isWin = m.win || (m.win === undefined && !m.roof && /^(frame|glass)(\||$)/.test(part.key));
        const isDoor = m.odoor || (m.odoor === undefined && /^(leaf|metal|groove|bead|door)$/.test(part.key));
        const isOut = m.out || (m.out === undefined && /^brick:/.test(part.key));
        if (m.floor || /^stair/.test(part.key) || !(isWin || isDoor || isOut || m.roof || m.plinth)) continue;
        const mesh = new THREE.Mesh(shellGeometry(part), lot3Material(part.key, m));
        mesh.position.y = st.y;
        mesh.castShadow = m.kind !== 'glass';
        mesh.receiveShadow = true;
        mesh.userData.around = true;
        grp.add(mesh);
        n++;
      }
    }
    if (!n) return false;
    G.add(grp);
    return true;
  },
});
/** the house's own material for the mirrored neighbour: its own copy (never cut by the view's cutting plane), the main brick darker */
function lot3Material(key, m) {
  // (per quality and with or without the pictures, as the house's own: Fast has no relief maps)
  return mat('lot3|' + key + '|' + (libOn() ? 'p' : '') + (libFast() ? 'f' : '') + (libLowMem() ? 's' : ''), () => {
    const src = shellMaterial(key, m);
    const c = src.clone();
    if (m.kind === 'brick' && !m.plinth && brickPalette(m.color).name === 'red') c.color.multiplyScalar(HOUSE.mirror.brick);
    c.userData = Object.assign({}, src.userData, { cutClip: false });
    if (src.onBeforeCompile) { c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey; }
    return c;
  });
}
/* ───────── the playground in the park ───────── */
Object.assign(View3D.prototype, {
  /** play: { o: outline (rubber ground), items: [[kind, x, y, °]] – round (a roundabout), slide, beam } */
  buildPlay(play, ground, addB) {
    if (!play || !play.o) return;
    addB(gSlab(play.o, ground - 0.02, ground + 0.04), hoodRubber('#3f7a5c'), { walk: true });
    const red = hoodRubber('#b7412f'), steel = hoodDark('playsteel', 0x8c9196, 0.4, 0.6), wood = gWood();
    const y0 = ground + 0.04;
    for (const [kind, x, y, deg] of play.items || []) {
      const r = (deg || 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], at = (s, t = 0) => [x + u[0] * s - u[1] * t, y + u[1] * s + u[0] * t];
      if (kind === 'round') {
        addB(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 24).translate(x, y0 + 0.25, y), red, { cast: true });
        addB(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8).translate(x, y0 + 0.5, y), steel, { cast: true });
        addB(new THREE.TorusGeometry(0.55, 0.035, 6, 20).rotateX(Math.PI / 2).translate(x, y0 + 0.95, y), steel);
      } else if (kind === 'slide') {
        // a small tower (four posts, a deck at 1.2 m, a roof) and the slide down from it
        for (const [s2, t2] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) { const q = at(s2, t2); addB(gBox(V.add(q, [-0.05, 0]), V.add(q, [0.05, 0]), y0, y0 + 2.4, 0.1), wood, { cast: true }); }
        addB(gBox(at(-0.65), at(0.65), y0 + 1.15, y0 + 1.22, 1.3), wood, { cast: true });
        addB(gBox(at(-0.75), at(0.75), y0 + 2.35, y0 + 2.45, 1.5), red, { cast: true });
        const a0 = at(0.65), a1 = at(3.4), d = V.norm(V.sub(a1, a0)), L = V.dist(a0, a1), geo = new THREE.BoxGeometry(L, 0.05, 0.55);
        const m = V.lerp(a0, a1, 0.5);
        geo.rotateZ(-Math.atan2(1.05, L)); geo.rotateY(Math.atan2(-d[1], d[0])); geo.translate(m[0], y0 + 0.68, m[1]);
        addB(geo, red, { cast: true });
      } else if (kind === 'beam') {
        addB(gBox(at(-1.5), at(1.5), y0 + 0.32, y0 + 0.44, 0.14), wood, { cast: true });
        for (const s2 of [-1.3, 1.3]) { const q = at(s2); addB(gBox(V.add(q, [-0.06, 0]), V.add(q, [0.06, 0]), y0, y0 + 0.36, 0.12), wood); }
      }
    }
  },
});
/** a planter's outline (plan) */
function hoodPlanterPoly([x, y, L, W, deg]) {
  const r = deg * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], n = [-u[1], u[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [x + u[0] * s * L / 2 + n[0] * t * W / 2, y + u[1] * s * L / 2 + n[1] * t * W / 2]);
}

/** 2D: the neighbours' roofs (their outline as drawn), annexes and sheds */
function hoodSvg(site, show) {
  const A = site && site.around, out = [];
  if (!A || !show.houses) return out;
  const ring = pl => 'M' + pl.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
  for (const Fl of A.flats || []) if (Fl.o && Fl.o.length > 2) out.push(s('path', { d: ring(Fl.o), class: 'g-nbhouse g-nbflat' }));
  for (const H of A.blds || []) {
    let o = H.o;
    if (!o) o = hoodPlanterPoly(H.m);
    out.push(s('path', { d: ring(o), class: 'g-nbhouse' }));
    // the ridge
    const [x, y, L, , ang] = H.m, r = ang * Math.PI / 180, u = [Math.cos(r) * L / 2, Math.sin(r) * L / 2];
    out.push(s('path', { d: `M${(x - u[0]).toFixed(2)} ${(y - u[1]).toFixed(2)}L${(x + u[0]).toFixed(2)} ${(y + u[1]).toFixed(2)}`, class: 'g-nbridge' }));
  }
  return out;
}
