/* ───────────── around.js — what is around the plot: the park across the canal (its channels, paths, trees and
   footbridge), reeds along the banks, the railings of the bridge and the houses across the streets ─────────────
   site.around (plan coordinates, metres): { water: [poly], paths: [{ pts, w }], bridges: [{ a, b, w }],
   quays: [pts] (quay walls along the canal, like this plot's), rails: [pts], trees: [[x, y, d, h, species]], reeds: [{ pts, w, ring }], houses: [{ box: [x0, y0, x1, y1],
   ridge: 'x' | 'y', h, pitch, brick: rgb, roof: rgb, gable: white upper gable, pv: panel columns }] }.
   A house built into the app brings its own (from its site plan: HOUSE.site, house.js). The houses are
   simple: brick walls with windows, a pitched roof of tiles, a white gable on some, solar panels on the side that
   faces the sun most. */

/** brick with two floors of windows, 6 × 6 m (a window every 3 m), for the walls of the houses around */
function aroundFacadeTex(rgb0) {
  // (to a few shades – steps of 0.06 – so neighbours share their façade picture: 17 pictures were 17 colours)
  const rgb = rgb0.map(v => clamp(Math.round(v / 0.06) * 0.06, 0, 1));
  const S = libLowMem() ? 256 : 512;
  const key = 'around-facade|' + rgb.map(v => v.toFixed(2)).join(',') + '|' + S;
  if (TEX.has(key)) return TEX.get(key);
  const ppm = S / 6, cv = makeCanvas(S, S), g = cv.getContext('2d');
  const rnd = vegRng(Math.round(rgb[0] * 1000 + rgb[1] * 100));
  const col = (f, k = rgb) => `rgb(${k.map(v => clamp(Math.round(v * 255 * f), 0, 255)).join(',')})`;
  g.fillStyle = 'rgb(176,170,160)'; g.fillRect(0, 0, S, S);
  // running bond: 210 × 50 mm bricks, 12 mm joints
  const ch = 0.0625 * ppm, cw = 0.222 * ppm;
  for (let r = 0; r * ch < S; r++) {
    const y = S - (r + 1) * ch, off = (r % 2) * cw / 2;
    const plinth = r * ch < 0.45 * ppm;
    for (let x = -cw; x < S + cw; x += cw) {
      g.fillStyle = col((plinth ? 0.62 : 1) * (0.86 + rnd() * 0.26));
      g.fillRect(x + off + 0.6, y + 0.6, cw - 1.2, ch - 1.2);
    }
  }
  // windows: ground floor 0.6–2.3 m, first floor 3.4–5.0 m, 1.3 m wide, in the middle of each 3 m
  const win = (cx, y0, y1, w) => {
    const X = cx * ppm - w * ppm / 2, Y = S - y1 * ppm, W = w * ppm, H = (y1 - y0) * ppm;
    // lintel: a row of bricks on end
    g.fillStyle = col(0.7); g.fillRect(X - 0.1 * ppm, Y - 0.2 * ppm, W + 0.2 * ppm, 0.2 * ppm);
    g.fillStyle = '#ece9e2'; g.fillRect(X, Y, W, H);
    const gl = g.createLinearGradient(X, Y, X + W, Y + H);
    gl.addColorStop(0, '#5b6d7c'); gl.addColorStop(0.45, '#2b3742'); gl.addColorStop(1, '#3c4a56');
    g.fillStyle = gl;
    const fr = 0.07 * ppm;
    g.fillRect(X + fr, Y + fr, W / 2 - fr * 1.5, H - fr * 2);
    g.fillRect(X + W / 2 + fr / 2, Y + fr, W / 2 - fr * 1.5, H - fr * 2);
    // the sill
    g.fillStyle = '#8f918f'; g.fillRect(X - 0.06 * ppm, Y + H, W + 0.12 * ppm, 0.06 * ppm);
  };
  for (const cx of [1.5, 4.5]) { win(cx, 0.6, 2.3, 1.3); win(cx, 3.4, 5.0, 1.3); }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 6, 1 / 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { strength: 1.6 };
  TEX.set(key, tex);
  return tex;
}
const aroundMat = (key, make) => mat('around|' + key, make);
const aroundFacadeMat = rgb => { const q = rgb.map(v => clamp(Math.round(v / 0.06) * 0.06, 0, 1)); return aroundMat('facade|' + q.map(v => v.toFixed(2)).join(',') + (libLowMem() ? '|s' : ''), () => new THREE.MeshStandardMaterial({ map: aroundFacadeTex(q), roughness: 0.9 })); };
// (the real pictures, texlib.js: a brick and a roof tile in the neighbours' own colours)
const aroundBrickMat = rgb => libBrickShared(rgb) || aroundMat('brick|' + rgb.join(','), () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: tintedBrickTexture(rgb), roughness: 0.92 }));
const aroundRoofMat = rgb => libMaterial('RoofingTiles013A', { tint: rgb, contrast: 1.6, side: THREE.DoubleSide }) || aroundMat('roof|' + rgb.join(','), () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofTileTexture(rgb), roughness: 0.75, side: THREE.DoubleSide }));
const aroundPvMat = () => aroundMat('pv', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: pvTexture(), roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide }));
const aroundRailMat = () => aroundMat('rail', () => new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.5, metalness: 0.4 }));

/** a quad into a buffer (corners in order, uvs per corner); its normal from the corners */
function aroundQuad(B, P, U) {
  const n = vNorm(vCross(vSub(P[1], P[0]), vSub(P[2], P[0])));
  const i0 = B.v, white = [1, 1, 1];
  P.forEach((p, k) => B.vert(p, n, U[k][0], U[k][1], white));
  B.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}
function aroundTri(B, P, U) {
  const n = vNorm(vCross(vSub(P[1], P[0]), vSub(P[2], P[0])));
  const i0 = B.v, white = [1, 1, 1];
  P.forEach((p, k) => B.vert(p, n, U[k][0], U[k][1], white));
  B.i.push(i0, i0 + 1, i0 + 2);
}
/** one house: walls (facade), gables, roof and solar panels into the buffers of their materials */
function aroundHouse(H, y0, bufs) {
  const [x0, z0, x1, z1] = H.box;
  const eaves = H.h || 6, pitch = (H.pitch || 48) * Math.PI / 180;
  const alongX = H.ridge !== 'y';
  const span = alongX ? z1 - z0 : x1 - x0;
  const rise = Math.min(span / 2 * Math.tan(pitch), 7.5);
  const ye = y0 + eaves, yr = ye + rise;
  const get = (k, make) => bufs.get(k) || bufs.set(k, { B: new VegBuf(), make }).get(k);
  const brick = H.brick || [0.55, 0.3, 0.22];
  const F = get('f|' + brick.join(','), () => aroundFacadeMat(brick)).B;
  const gableRgb = H.gable ? [0.9, 0.89, 0.86] : brick;
  const Gb = get('g|' + gableRgb.join(','), () => aroundBrickMat(gableRgb)).B;
  const roofRgb = H.roof || [0.23, 0.24, 0.25];
  const R = get('r|' + roofRgb.join(','), () => aroundRoofMat(roofRgb)).B;
  const P = get('pv', () => aroundPvMat()).B;
  // walls, outward; u along the wall (from a corner), v up
  const wall = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    aroundQuad(F, [[a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], ye, b[2]], [a[0], ye, a[2]]], [[0, 0], [L, 0], [L, eaves], [0, eaves]]);
  };
  // corners counter-clockwise seen from above (x right, z towards you): outward normals
  wall([x0, 0, z1], [x1, 0, z1]); wall([x1, 0, z1], [x1, 0, z0]); wall([x1, 0, z0], [x0, 0, z0]); wall([x0, 0, z0], [x0, 0, z1]);
  const ov = 0.35, go = 0.25, drop = ov * Math.tan(pitch);
  if (alongX) {
    const zm = (z0 + z1) / 2, sl = Math.hypot(span / 2 + ov, rise + drop);
    // gables at x0 and x1
    aroundTri(Gb, [[x0, ye, z0], [x0, ye, z1], [x0, yr, zm]], [[z0, eaves], [z1, eaves], [zm, eaves + rise]]);
    aroundTri(Gb, [[x1, ye, z1], [x1, ye, z0], [x1, yr, zm]], [[z1, eaves], [z0, eaves], [zm, eaves + rise]]);
    // slopes: the z0 side and the z1 side
    aroundQuad(R, [[x1 + go, ye - drop, z0 - ov], [x0 - go, ye - drop, z0 - ov], [x0 - go, yr, zm], [x1 + go, yr, zm]], [[0, 0], [x1 - x0 + 2 * go, 0], [x1 - x0 + 2 * go, sl], [0, sl]]);
    aroundQuad(R, [[x0 - go, ye - drop, z1 + ov], [x1 + go, ye - drop, z1 + ov], [x1 + go, yr, zm], [x0 - go, yr, zm]], [[0, 0], [x1 - x0 + 2 * go, 0], [x1 - x0 + 2 * go, sl], [0, sl]]);
    // solar panels on the side towards the sun (plan y negative is south-west here)
    if (H.pv) {
      const w = Math.min(x1 - x0 - 1.2, H.pv * 2.1), xc = (x0 + x1) / 2, t0 = 0.3, t1 = Math.min(0.85, t0 + 3.5 / sl);
      const zAt = t => z0 - ov + (zm - z0 + ov) * t, yAt = t => ye - drop + (rise + drop) * t, nz = -Math.sin(pitch) * 0.06, ny = Math.cos(pitch) * 0.06;
      aroundQuad(P, [[xc + w / 2, yAt(t0) + ny, zAt(t0) + nz], [xc - w / 2, yAt(t0) + ny, zAt(t0) + nz], [xc - w / 2, yAt(t1) + ny, zAt(t1) + nz], [xc + w / 2, yAt(t1) + ny, zAt(t1) + nz]], [[0, 0], [w, 0], [w, (t1 - t0) * sl], [0, (t1 - t0) * sl]]);
    }
  } else {
    const xm = (x0 + x1) / 2, sl = Math.hypot(span / 2 + ov, rise + drop);
    aroundTri(Gb, [[x1, ye, z0], [x0, ye, z0], [xm, yr, z0]], [[x1, eaves], [x0, eaves], [xm, eaves + rise]]);
    aroundTri(Gb, [[x0, ye, z1], [x1, ye, z1], [xm, yr, z1]], [[x0, eaves], [x1, eaves], [xm, eaves + rise]]);
    aroundQuad(R, [[x0 - ov, ye - drop, z0 - go], [x0 - ov, ye - drop, z1 + go], [xm, yr, z1 + go], [xm, yr, z0 - go]], [[0, 0], [z1 - z0 + 2 * go, 0], [z1 - z0 + 2 * go, sl], [0, sl]]);
    aroundQuad(R, [[x1 + ov, ye - drop, z1 + go], [x1 + ov, ye - drop, z0 - go], [xm, yr, z0 - go], [xm, yr, z1 + go]], [[0, 0], [z1 - z0 + 2 * go, 0], [z1 - z0 + 2 * go, sl], [0, sl]]);
    if (H.pv) {
      const w = Math.min(z1 - z0 - 1.2, H.pv * 2.1), zc = (z0 + z1) / 2, t0 = 0.3, t1 = Math.min(0.85, t0 + 3.5 / sl);
      const xAt = t => x0 - ov + (xm - x0 + ov) * t, yAt = t => ye - drop + (rise + drop) * t, nx = -Math.sin(pitch) * 0.06, ny = Math.cos(pitch) * 0.06;
      aroundQuad(P, [[xAt(t0) + nx, yAt(t0) + ny, zc - w / 2], [xAt(t0) + nx, yAt(t0) + ny, zc + w / 2], [xAt(t1) + nx, yAt(t1) + ny, zc + w / 2], [xAt(t1) + nx, yAt(t1) + ny, zc - w / 2]], [[0, 0], [w, 0], [w, (t1 - t0) * sl], [0, (t1 - t0) * sl]]);
    }
  }
}
/** a line moved sideways by d (positive: to the left of its direction in the plan) */
function aroundOffset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = V.norm(V.sub(b, a)), n = [-t[1], t[0]];
    return V.add(p, V.mul(n, d));
  });
}

Object.assign(View3D.prototype, {
  /** the park, the channels, reeds, footbridges, railings and the houses around (site.around) */
  buildAround(G, site, sl, add, show = { street: true, houses: true, park: true }) {
    const A0 = site.around;
    if (!A0) return;
    // (View → Show: the bridge's railings go with the street, the houses on their own, the rest is water and park)
    const A = { houses: show.houses ? A0.houses : null, rails: show.street ? A0.rails : null,
      ...(show.park ? { water: A0.water, quays: A0.quays, paths: A0.paths, bridges: A0.bridges, trees: A0.trees, reeds: A0.reeds } : {}) };
    const W = site.water;
    const wl = W ? W.level : sl - 0.8, bed = W && W.bed != null ? W.bed : wl - 1.3;
    const ground = sl - G_GRASS;
    const waters = show.park ? [W && W.poly, ...(A.water || [])].filter(Boolean) : [];
    // (a canal round an island: its outline and the islands in it)
    const inWater = q => waters.some(w => (w.o ? pointInPolygon(q, w.o) && !(w.h || []).some(hl => pointInPolygon(q, hl)) : pointInPolygon(q, w)));
    // small parts (banks, posts, rails, decks) are gathered per material and drawn as one mesh each
    const bins = new Map();
    const addB = (geo, m, o = {}) => { const k = m.uuid + '|' + (o.cast ? 1 : 0) + (o.walk ? 1 : 0); if (!bins.has(k)) bins.set(k, { m, o, geos: [] }); bins.get(k).geos.push(geo); };
    const flush = () => { for (const { m, o, geos } of bins.values()) add(mergeBoxGeos(geos), m, o); bins.clear(); };
    // channels in the park: water, bed and banks
    for (const w of A.water || []) {
      const poly = w.o || w, isles = w.h || [];
      addB(gFlat(poly, bed, isles), gardenMaterial('bank'));
      const wm = add(gFlat(poly, wl, isles), gardenMaterial('water'));
      wm.userData.water = true;
      for (let i = 0; i < poly.length; i++) addB(gBankSlope(poly, i, ground, wl - 0.4, 1.6), gardenMaterial('slope'), { walk: true });
      // an island: its grass, and its banks down into the water round it
      for (const hl of isles) {
        addB(gFlat(hl, ground), gardenMaterial('context'), { walk: true });
        for (let i = 0; i < hl.length; i++) addB(gBankSlope(hl, i, ground, wl - 0.4, 1.6, true), gardenMaterial('slope'), { walk: true });
      }
    }
    // the quay walls of the plots around (like the one of this plot: brick on top, stone below)
    for (const Q of A.quays || []) {
      if (Q.length < 2) continue;
      const top = ground + 0.05, bottom = wl - 0.7, bk = Math.min(0.5, top - bottom - 0.1);
      addB(gRibbon(Q, bottom, top - bk, 0.34), gQuayStone(), { cast: true });
      addB(gRibbon(Q, top - bk, top - 0.1, 0.32), gQuayBrick(), { cast: true });
      addB(gRibbon(Q, top - 0.1, top, 0.32), gQuayRollaag(), { cast: true });
    }
    // paths through the park (a little above the grass; where one crosses water it is the deck of a footbridge)
    for (const p of A.paths || []) if (p.pts.length > 1) addB(gRibbon(p.pts, ground - 0.04, ground + 0.03, p.w || 2), hoodParkPathMat(), { walk: true });
    // the playground in the park: rubber ground, a roundabout, slides, balance beams (hood.js)
    if (A0.play && show.park && this.buildPlay) this.buildPlay(A0.play, ground, addB);
    for (const b of A.bridges || []) {
      const w = b.w || 2.4, d = V.norm(V.sub(b.b, b.a)), n = [-d[1], d[0]];
      addB(gBox(b.a, b.b, ground - 0.25, ground + 0.035, w + 0.2, 0.8), gWood(), { cast: true, walk: true });
      for (const s of [-1, 1]) {
        const a2 = V.add(b.a, V.mul(n, s * (w / 2 + 0.05))), b2 = V.add(b.b, V.mul(n, s * (w / 2 + 0.05)));
        addB(gBox(a2, b2, ground + 0.95, ground + 1.0, 0.06, 0.6), gWood(), { cast: true });
        const L = V.dist(a2, b2), k = Math.max(2, Math.round(L / 1.5));
        for (let j = 0; j <= k; j++) { const q = V.lerp(V.sub(a2, V.mul(d, 0.6)), V.add(b2, V.mul(d, 0.6)), j / k); addB(gBox(V.sub(q, V.mul(d, 0.04)), V.add(q, V.mul(d, 0.04)), ground, ground + 1.0, 0.08), gWood(), { cast: true }); }
      }
    }
    // the railings of the bridge over the canal
    for (const r of A.rails || []) {
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i], d = V.norm(V.sub(b, a));
        addB(gBox(a, b, sl + 1.0, sl + 1.06, 0.06), aroundRailMat(), { cast: true });
        addB(gBox(a, b, sl + 0.45, sl + 0.49, 0.03), aroundRailMat());
        const L = V.dist(a, b), k = Math.max(2, Math.round(L / 1.6));
        for (let j = 0; j <= k; j++) { const q = V.lerp(a, b, j / k); addB(gBox(V.sub(q, V.mul(d, 0.03)), V.add(q, V.mul(d, 0.03)), sl - 0.05, sl + 1.06, 0.06), aroundRailMat(), { cast: true }); }
      }
    }
    flush();
    // the houses across the streets, one mesh per material
    const bufs = new Map();
    for (const H of A.houses || []) aroundHouse(H, ground, bufs);
    for (const { B, make } of bufs.values()) {
      const geo = B.geo();
      if (!geo) continue;
      const m = add(geo, make(), { cast: true });
      m.userData.around = true;
    }
    // trees in the park (Fast: simple shapes; Beautiful / High: grown, a little lighter far away)
    for (const [x, y, d, h, sp] of A.trees || []) this.gTree(G, { kind: 'tree', x, y, d: d || 6, h: h || (d || 6) * 1.4 }, ground, add, { species: sp || 'broadleaf', far: true });
    // reeds in the water along the banks
    if (this.vegReeds) for (const r of A.reeds || []) {
      const pts = r.ring ? [...r.pts, r.pts[0]] : r.pts;
      if (pts.length < 2) continue;
      // which side is the water: try a point a metre to the left of the first segment
      const t0 = V.norm(V.sub(pts[1], pts[0])), mid = V.lerp(pts[0], pts[1], 0.5);
      const left = V.add(mid, [-t0[1], t0[0]]);
      const s = inWater(left) ? 1 : -1;
      const w = r.w || 1.6;
      this.vegReeds(aroundOffset(pts, s * (w / 2 + 0.2)), wl, w, r.h || 2.1, add);
    }
  },
});

/** 2D: the park's channels and paths, the houses around and their trees (drawn under the plot) */
function aroundSvg(site, show = { houses: true, park: true }) {
  const A = site && site.around;
  const out = [];
  if (!A) return out;
  const ring = pl => 'M' + pl.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
  if (show.park) for (const w of A.water || []) out.push(s('path', { d: ring(w.o || w) + (w.h || []).map(ring).join(''), class: 'g-canal', 'fill-rule': 'evenodd' }));
  if (show.park && A.play && A.play.o) out.push(s('path', { d: ring(A.play.o), class: 'g-play' }));
  if (show.park) for (const p of A.paths || []) out.push(s('path', { d: 'M' + p.pts.map(q => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L'), class: 'g-apath', 'stroke-width': p.w || 2, fill: 'none' }));
  if (show.houses) for (const H of A.houses || []) { const [x0, y0, x1, y1] = H.box; out.push(s('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: 'g-nbhouse' })); }
  out.push(...hoodSvg(site, show));
  if (show.park) for (const [x, y, d] of A.trees || []) out.push(s('circle', { cx: x, cy: y, r: (d || 6) / 2, class: 'g-ctree' }));
  return out;
}
