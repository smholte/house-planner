/* ───────────── view3d.js — dollhouse 3D of one storey, all storeys side by side, or the whole house ───────────── */

const TEX = new Map();
let MAX_ANISO = 4;
const MAT = new Map();

/** a canvas for a texture or a picture, drawn and read back in memory (not on the graphics card): reading its pixels
 *  (speckle, leaf colour, the High preset's depth maps) is then quick – on the card each read waits for it */
function makeCanvas(w, hgt) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  try { c.getContext('2d', { willReadFrequently: true }); } catch (_) { /* older browsers: the default */ }
  return c;
}
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const k = v => clamp(Math.round(v * f), 0, 255);
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

/** Floor textures, 1 texture = `size` metres. Uses a seeded random so it looks the same every time. */
function floorTexture(material, color) {
  const key = 'f|' + material + '|' + color;
  if (TEX.has(key)) return TEX.get(key);
  const N = 256;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = color; g.fillRect(0, 0, N, N);
  let size = 1.2;
  if (material === 'oak' || material === 'laminate' || material === 'pvc') {
    size = material === 'pvc' ? 1.2 : 1.44;
    const rows = 8, rh = N / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * N * 0.6;
      while (x < N) {
        const len = N * (0.5 + rnd() * 0.35);
        g.fillStyle = shade(color, 0.9 + rnd() * 0.18);
        g.fillRect(x, r * rh, len, rh);
        // grain
        g.strokeStyle = shade(color, 0.86);
        g.globalAlpha = 0.25;
        for (let k = 0; k < 3; k++) { g.beginPath(); const yy = r * rh + rh * (0.2 + rnd() * 0.6); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy + 2, x + len * 0.6, yy - 2, x + len, yy); g.stroke(); }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, r * rh, 1, rh);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, r * rh, N, 1);
    }
  } else if (material === 'tiles' || material === 'stone') {
    size = material === 'stone' ? 1.2 : 1.2;
    const n = material === 'stone' ? 3 : 2;
    const ts = N / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = shade(color, 0.985 + rnd() * 0.03);
      g.fillRect(i * ts, j * ts, ts, ts);
    }
    g.fillStyle = luminance(color) > 0.35 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * ts - 1, 0, 2, N); g.fillRect(0, i * ts - 1, N, 2); }
  } else {
    // screed / cast floor / carpet: soft speckle
    const img = g.getImageData(0, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rnd() - 0.5) * (material === 'carpet' ? 26 : 12);
      img.data[i] = clamp(img.data[i] + v, 0, 255); img.data[i + 1] = clamp(img.data[i + 1] + v, 0, 255); img.data[i + 2] = clamp(img.data[i + 2] + v, 0, 255);
    }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  // High preset: how the surface's depth is made from this pattern (hq.js)
  t.userData.hq = (material === 'oak' || material === 'laminate' || material === 'pvc') ? { relief: 0.0015, strength: 1.6 }
    : (material === 'tiles' || material === 'stone') ? { relief: 0.003 } : material === 'carpet' ? { strength: 3 } : { strength: 1 };
  TEX.set(key, t);
  return t;
}

function brickTexture() {
  if (TEX.has('brick')) return TEX.get('brick');
  const N = 256;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#C9C2B8'; g.fillRect(0, 0, N, N); // mortar
  const courses = 8, bw = N / 4, bh = N / courses;
  for (let r = 0; r < courses; r++) {
    const off = (r % 2) * bw / 2;
    for (let x = -bw; x < N + bw; x += bw) {
      const base = [158 + rnd() * 26, 92 + rnd() * 20, 72 + rnd() * 14];
      g.fillStyle = `rgb(${base.map(Math.round).join(',')})`;
      g.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.88, 1 / 0.5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.userData.hq = { relief: 0.012 };
  TEX.set('brick', t);
  return t;
}

function tintedBrickTexture(rgb) {
  const key = 'brick|' + rgb.map(v => v.toFixed(2)).join(',');
  if (TEX.has(key)) return TEX.get(key);
  const N = 256;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const mortar = lum > 0.6 ? [0.78, 0.77, 0.74] : [0.72, 0.7, 0.66];
  g.fillStyle = `rgb(${mortar.map(v => Math.round(v * 255)).join(',')})`;
  g.fillRect(0, 0, N, N);
  const courses = 8, bw = N / 4, bh = N / courses;
  for (let r = 0; r < courses; r++) {
    const off = (r % 2) * bw / 2;
    for (let x = -bw; x < N + bw; x += bw) {
      const f = 0.86 + rnd() * 0.26;
      g.fillStyle = `rgb(${rgb.map(v => clamp(Math.round(v * 255 * f), 0, 255)).join(',')})`;
      g.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.88, 1 / 0.5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.userData.hq = { relief: 0.012 };
  TEX.set(key, t);
  return t;
}
function roofTileTexture(rgb) {
  const key = 'tile|' + rgb.join(',');
  if (TEX.has(key)) return TEX.get(key);
  const N = 256;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rows = 3, cols = 4, rh = N / rows, cw = N / cols;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const f = 0.9 + rnd() * 0.2;
    const grad = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
    grad.addColorStop(0, `rgb(${rgb.map(v => Math.round(v * 255 * f * 1.12)).join(',')})`);
    grad.addColorStop(1, `rgb(${rgb.map(v => Math.round(v * 255 * f * 0.78)).join(',')})`);
    g.fillStyle = grad;
    g.fillRect(c * cw, r * rh, cw, rh);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(c * cw, r * rh, 2, rh);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let r = 0; r <= rows; r++) g.fillRect(0, r * rh - 2, N, 3);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 1.2, 1 / 1.05);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.userData.hq = { relief: 0.02, strength: 2.6 };
  TEX.set(key, t);
  return t;
}
function pvTexture() {
  if (TEX.has('pv')) return TEX.get('pv');
  const N = 192;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  g.fillStyle = '#141a26'; g.fillRect(0, 0, N, N);
  g.strokeStyle = 'rgba(160,180,210,0.35)'; g.lineWidth = 1.2;
  for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * N / 6, 0); g.lineTo(i * N / 6, N); g.stroke(); g.beginPath(); g.moveTo(0, i * N / 6); g.lineTo(N, i * N / 6); g.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.96, 1 / 0.96);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.hq = { strength: 1.2 };
  TEX.set('pv', t);
  return t;
}
// the outside doors' grey, from the builder's façade drawing (the front door, the back door and the garden
// doors all #6B665E, a warm grey; the drawing's colours are the model's own – its red brick is exactly the model's
// 130/79/61). In the 3D view a dark colour in the shade comes out darker and browner than its number (the screen colours'
// toe: Neutral tone mapping takes the darkest channel down), so the leaves get a lighter, less warm #7A7875: next to its
// white frame the door then looks as in the drawing in the normal daylight (measured at the front door: shade a little
// darker, full sun a little lighter, the warm grey kept). How strongly the wood's grain shows over it: ODOOR_CONTRAST.
const ODOOR_GREY = '#7A7875', ODOOR_CONTRAST = 1.5;
function shellMaterial(key, m) {
  // the real pictures (texlib.js): the house's own bricks and roof tiles
  if (m.kind === 'brick') { const b = libBrick(m.color); if (b) return b; }
  // the outside doors' leaves: grey quality fake wood (Wood012), the grain upright; their frames stay white. The grey is
  // the builder's façade drawing's (ODOOR_GREY above, 2 Nov), laid over the wood's own light and dark
  if (m.odoor && (m.part === 'leaf' || /^leaf(\||$)/.test(key)) && libSet('Wood012')) return libMaterial('Wood012', { rot: 90, tint: ODOOR_GREY, contrast: ODOOR_CONTRAST });
  if (m.kind === 'roof' && libSet('RoofingTiles013A')) return libMaterial('RoofingTiles013A', { side: THREE.DoubleSide });
  return mat('shell|' + key, () => {
    const col = new THREE.Color().setRGB(...(m.color || [0.8, 0.8, 0.78]), THREE.SRGBColorSpace);
    switch (m.kind) {
      case 'brick': return new THREE.MeshStandardMaterial({ color: 0xffffff, map: tintedBrickTexture(m.color || [0.55, 0.32, 0.24]), roughness: 0.95 });
      case 'roof': return new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofTileTexture(m.color || [0.23, 0.24, 0.25]), roughness: 0.75, side: THREE.DoubleSide });
      case 'pv': return new THREE.MeshStandardMaterial({ color: 0xffffff, map: pvTexture(), roughness: 0.3, metalness: 0.35 });
      case 'glass': return skyReflect(new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: m.alpha || 0.35, roughness: 0.08, metalness: 0.1, depthWrite: false }), 0.5);
      case 'frame': return new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
      case 'flat': return new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
      default: return new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, transparent: m.alpha != null && m.alpha < 0.99, opacity: m.alpha != null ? m.alpha : 1, side: THREE.DoubleSide });
    }
  });
}
/** geometry for one storey's shell group, built once and kept */
const SHELL_GEO = new WeakMap();
function shellGeometry(part) {
  if (SHELL_GEO.has(part)) return SHELL_GEO.get(part);
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
  geo.setIndex(new THREE.BufferAttribute(part.idx, 1));
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  // box-mapped UVs in metres so textures keep their real size
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    for (let k = 0; k < 3; k++) {
      const j = i + k, x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      if (ny >= nx && ny >= nz) { uv[j * 2] = x; uv[j * 2 + 1] = z; }
      else if (nx >= nz) { uv[j * 2] = z; uv[j * 2 + 1] = y; }
      else { uv[j * 2] = x; uv[j * 2 + 1] = y; }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  SHELL_GEO.set(part, geo);
  return geo;
}
/** a wall piece: len along x (centred), from yb up to a top that may slope (ytA at −x, ytB at +x), thickness t along z.
    Material groups like a box: 0 +x end, 1 −x end, 2 top, 3 bottom, 4 +z side, 5 −z side */
function wallPrism(len, yb, ytA, ytB, t, u0 = -len / 2, off = null) {
  const x0 = -len / 2, x1 = len / 2, z0 = -t / 2, z1 = t / 2;
  // each end can stop at another place on each side (mitred and butt joints where walls meet): off = { x0p, x0m,
  // x1p, x1m } moves the corners on the +z (p) and −z (m) side along the wall
  const o = off || {};
  const x0p = x0 + (o.x0p || 0), x0m = x0 + (o.x0m || 0), x1p = x1 + (o.x1p || 0), x1m = x1 + (o.x1m || 0);
  // the two sides: u in metres along the wall from its start (u0 at this piece's start), so a pattern runs on over
  // all pieces of a wall; on the right side (z0) it runs the other way, so it is not mirrored there
  const U = x => u0 + (x - x0);
  const P = [], UV = [];
  const quad = (a, b, c, d, uv) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); UV.push(...uv[0], ...uv[1], ...uv[2], ...uv[0], ...uv[2], ...uv[3]); };
  const groups = [];
  const face = (fn) => { const start = P.length / 3; fn(); groups.push([start, P.length / 3 - start]); };
  face(() => quad([x1p, yb, z1], [x1m, yb, z0], [x1m, ytB, z0], [x1p, ytB, z1], [[0, yb], [t, yb], [t, ytB], [0, ytB]]));
  face(() => quad([x0m, yb, z0], [x0p, yb, z1], [x0p, ytA, z1], [x0m, ytA, z0], [[0, yb], [t, yb], [t, ytA], [0, ytA]]));
  face(() => quad([x0p, ytA, z1], [x1p, ytB, z1], [x1m, ytB, z0], [x0m, ytA, z0], [[x0p, 0], [x1p, 0], [x1m, t], [x0m, t]]));
  face(() => quad([x0m, yb, z0], [x1m, yb, z0], [x1p, yb, z1], [x0p, yb, z1], [[x0m, 0], [x1m, 0], [x1p, t], [x0p, t]]));
  face(() => quad([x0p, yb, z1], [x1p, yb, z1], [x1p, ytB, z1], [x0p, ytA, z1], [[U(x0p), yb], [U(x1p), yb], [U(x1p), ytB], [U(x0p), ytA]]));
  face(() => quad([x1m, yb, z0], [x0m, yb, z0], [x0m, ytA, z0], [x1m, ytB, z0], [[-U(x1m), yb], [-U(x0m), yb], [-U(x0m), ytA], [-U(x1m), ytB]]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  groups.forEach(([s0, c], i) => geo.addGroup(s0, c, i));
  geo.computeVertexNormals();
  return geo;
}
/** how far each wall goes past its end points, on each side ([+n side, −n side], metres), so walls that meet don't
 *  overlap with faces in one place (that flickers): a free end goes on by half its thickness; a wall ending against
 *  another (T) stops at that wall's face (half a millimetre into it); two walls of the same height turning a corner
 *  (L) are mitred; at a corner of walls of different heights the taller one covers the corner and the other stops at
 *  its face; two walls in line meet end to end */
function wallEnds(plan, sid, skip, heightOf) {
  const W = plan.walls.filter(w => w.storey === sid && !(skip && skip(w)) && wallLen(w) >= 0.01);
  const info = W.map(w => { const d = wallDir(w); return { w, d, n: V.perp(d), L: wallLen(w) }; });
  const out = new Map();
  const height = w => (heightOf ? heightOf(w) : w.h || 0);
  const parallel = (A, B) => Math.abs(V.cross(A.d, B.d)) < 0.02;
  const collinear = (A, B) => parallel(A, B) && Math.abs(V.dot(V.sub(B.w.a, A.w.a), A.n)) < 0.006;
  // the stretch [lo, hi] along B's line (from B.a) that B and the walls in line with it cover without a break at x
  const coverAround = (B, x) => {
    let lo = 0, hi = B.L, grew = true;
    const spans = info.filter(C => C !== B && collinear(B, C)).map(C => { const p = V.dot(V.sub(C.w.a, B.w.a), B.d), q = V.dot(V.sub(C.w.b, B.w.a), B.d); return [Math.min(p, q), Math.max(p, q)]; });
    while (grew) { grew = false; for (const [p, q] of spans) if (p <= hi + 0.01 && q >= lo - 0.01 && (p < lo - 1e-6 || q > hi + 1e-6) && p <= x + 0.2 && q >= x - 0.2) { lo = Math.min(lo, p); hi = Math.max(hi, q); grew = true; } }
    return [lo, hi];
  };
  for (const A of info) {
    const w = A.w, hw = w.t / 2;
    const res = { a: [hw, hw], b: [hw, hw] };
    for (const end of ['a', 'b']) {
      const P = end === 'a' ? w.a : w.b, dir = end === 'a' ? V.mul(A.d, -1) : A.d;
      // in line with another wall, end to end: they just meet
      if (info.some(B => B !== A && collinear(A, B) && Math.abs(B.w.t - w.t) < 0.005 && (V.dist(P, B.w.a) < 0.01 || V.dist(P, B.w.b) < 0.01))) { res[end] = [0.0002, 0.0002]; continue; }
      let best = null;
      for (const B of info) {
        if (B === A || Math.abs(V.cross(A.d, B.d)) < 0.2) continue;
        const ho = B.w.t / 2;
        const off = V.dot(V.sub(P, B.w.a), B.n), along = V.dot(V.sub(P, B.w.a), B.d);
        if (Math.abs(off) > ho + 0.025 || along < -ho - 0.03 || along > B.L + ho + 0.03) continue;
        if (!best || Math.abs(off) < Math.abs(best.off)) best = { B, off, along };
      }
      if (!best) continue;
      const { B, along } = best, ho = B.w.t / 2;
      const dn = V.dot(dir, B.n);
      // where each side line of this wall crosses the two faces of the other: [near, far]
      const cross = s => {
        const S0 = V.add(P, V.mul(A.n, s * hw));
        const us = [ho, -ho].map(k => (k - V.dot(V.sub(S0, B.w.a), B.n)) / dn);
        return [Math.min(...us), Math.max(...us)];
      };
      const sides = [cross(1), cross(-1)];
      const [lo, hi] = coverAround(B, along);
      const through = along - lo > hw + 0.01 && hi - along > hw + 0.01;
      if (through) { res[end] = sides.map(([near]) => near + 0.0005); continue; }
      // a corner: the other wall goes on from P in direction e
      const e = along - lo < hi - along ? B.d : V.mul(B.d, -1);
      const hA = height(w), hB = height(B.w);
      if (Math.abs(hA - hB) < 0.02) {
        res[end] = [1, -1].map((s, i) => (V.dot(V.mul(A.n, s), e) > 0 ? sides[i][0] + 0.0005 : sides[i][1] + 0.0002));
      } else if (hA > hB) {
        res[end] = sides.map(([, far]) => far);             // the taller one covers the corner
      } else {
        res[end] = sides.map(([near]) => near + 0.0005);    // and the lower one stops at its face
      }
    }
    out.set(w.id, res);
  }
  return out;
}
/* ───────── the inside of the roof as a height field ───────── */
const ROOF_CEIL = new WeakMap();      // shell → Map(storey id → field)
const RC_CELL = 0.05;
/** the lowest roof surface above a storey's floor on a 5 cm grid (null where there is no roof), opened with a 20 cm
 *  disc so each ridge becomes a 20 cm flat; flats: [x0, z0, x1, z1, y] quads for the flats */
function buildRoofCeiling(shell, sid) {
  const parts = (shell.storeys[sid] || []).filter(p => { const m = shell.materials[p.key] || {}; return m.roof && !/^(pv|gutter|trim|flatroof|white|metal|pipe)/.test(p.key); });
  if (!parts.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) { const x = p.pos[i], z = p.pos[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const nx = Math.ceil((x1 - x0) / RC_CELL) + 1, nz = Math.ceil((z1 - z0) / RC_CELL) + 1;
  if (nx * nz > 2e6) return null;
  const H = new Float32Array(nx * nz).fill(Infinity);
  const MINY = 0.45;          // the roof over the room, not the edge of the floor at the eaves
  // rasterise every triangle: at each cell centre inside it, its height; keep the lowest above MINY
  for (const p of parts) {
    const P = p.pos, I = p.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
      if (Math.max(ay, by, cy) < MINY) continue;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) continue;     // vertical faces
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / RC_CELL)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / RC_CELL));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / RC_CELL)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / RC_CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + i * RC_CELL, z = z0 + j * RC_CELL;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const y = l1 * ay + l2 * by + l3 * cy;
        if (y < MINY) continue;
        const k = j * nx + i;
        if (y < H[k]) H[k] = y;
      }
    }
  }
  // opening (erosion, then dilation) with a disc of 10 cm: ridges become 20 cm flats, slopes stay
  const R = Math.round(0.1 / RC_CELL), offs = [];
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if (di * di + dj * dj <= R * R + 0.01) offs.push([di, dj]);
  const E = new Float32Array(nx * nz), O = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let m = Infinity;
    for (const [di, dj] of offs) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const v = H[jj * nx + ii]; if (v < m) m = v; }
    E[j * nx + i] = m;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (H[k] === Infinity) { O[k] = Infinity; continue; }
    let m = -Infinity;
    for (const [di, dj] of offs) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const v = E[jj * nx + ii]; if (v !== Infinity && v > m) m = v; }
    O[k] = m === -Infinity ? H[k] : Math.min(H[k], m);
  }
  // the flats: cells cut down by the opening (and one cell around them, hidden in the roof where not needed),
  // merged into strips along x
  const cut = new Uint8Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) if (H[k] !== Infinity && O[k] < H[k] - 0.012) cut[k] = 1;
  const flat = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (cut[k]) { flat[k] = O[k]; continue; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const kk = jj * nx + ii; if (cut[kk] && H[k] !== Infinity && H[k] > O[kk] - 0.03) { flat[k] = O[kk]; break; } }
  }
  const flats = [];
  for (let j = 0; j < nz; j++) {
    let i = 0;
    while (i < nx) {
      const k = j * nx + i;
      if (Number.isNaN(flat[k])) { i++; continue; }
      const y = flat[k];
      let e = i + 1;
      while (e < nx && !Number.isNaN(flat[j * nx + e]) && Math.abs(flat[j * nx + e] - y) < 0.004) e++;
      flats.push([x0 + (i - 0.5) * RC_CELL, z0 + (j - 0.5) * RC_CELL, x0 + (e - 0.5) * RC_CELL, z0 + (j + 0.5) * RC_CELL, y - 0.002]);
      i = e;
    }
  }
  // between the cell centres: blended (bilinear), so sloping wall tops are straight, not stepped
  const at = (x, z) => {
    const fx = (x - x0) / RC_CELL, fz = (z - z0) / RC_CELL;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    let sum = 0, wsum = 0, best = null, bw = -1;
    for (const [di, dj, wt] of [[0, 0, (1 - tx) * (1 - tz)], [1, 0, tx * (1 - tz)], [0, 1, (1 - tx) * tz], [1, 1, tx * tz]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const v = O[jj * nx + ii];
      if (v === Infinity) continue;
      sum += v * wt; wsum += wt;
      if (wt > bw) { bw = wt; best = v; }
    }
    if (wsum <= 1e-9) return null;
    return wsum > 0.999 ? sum : best;
  };
  // the material of the inside of the roof (for the flats)
  let key = null, most = 0;
  for (const p of parts) if (p.idx.length > most && !/^roof\|/.test(p.key)) { most = p.idx.length; key = p.key; }
  return { at, flats, x0, z0, nx, nz, key };
}
/** strips of the same width and height in the next row as one */
function mergeFlatRows(flats) {
  const list = flats.slice().sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[4] - b[4] || a[1] - b[1]);
  const merged = [];
  for (const f of list) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last[0] - f[0]) < 1e-6 && Math.abs(last[2] - f[2]) < 1e-6 && Math.abs(last[4] - f[4]) < 0.004 && Math.abs(last[3] - f[1]) < 1e-6) last[3] = f[3];
    else merged.push(f.slice());
  }
  return merged;
}
/** a wall's top along its length, following the inside of the roof where there is one (walls under the roof go up to
 *  it; lower walls such as knee walls keep their height, but never go through the roof): [[u, h], …] or null */
function wallRoofProfile(w, field, H, inRoom) {
  if (!field) return null;
  const L = wallLen(w);
  if (L < 0.02) return null;
  const d = wallDir(w);
  const follow = !!(w.top && w.top.length > 1) || !(w.h > 0);
  const pts = [];
  let any = false;
  const n = Math.max(2, Math.ceil(L / RC_CELL) + 1);
  for (let k = 0; k < n; k++) {
    const u = (L * k) / (n - 1);
    // the roof just in front of each face that looks into a room; the higher of them (a wall along a slope then
    // reaches the roof on both sides; a gable reaches it on the inside)
    const q = V.add(w.a, V.mul(d, u)), nn = V.perp(d);
    const sides = [1, -1].map(sg => V.add(q, V.mul(nn, sg * (w.t / 2 + 0.06)))).filter(pt => !inRoom || inRoom(pt));
    const cs = (sides.length ? sides : [q]).map(pt => field.at(...pt)).filter(v => v != null);
    const c = cs.length ? Math.max(...cs) : null;
    const own = wallTopAt(w, u, H);
    let h = own;
    if (c != null) { any = true; h = follow ? c : Math.min(own, c); }
    pts.push([u, h]);
  }
  if (!any) return null;
  // keep only the corners (within 4 mm)
  const keep = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = keep[keep.length - 1], b = pts[k + 1], q = pts[k];
    const y = a[1] + (b[1] - a[1]) * (q[0] - a[0]) / Math.max(1e-6, b[0] - a[0]);
    if (Math.abs(y - q[1]) > 0.004) keep.push(q);
  }
  keep.push(pts[pts.length - 1]);
  return keep;
}

/** top height of a wall at distance u from its start (sloped attic walls carry a `top` profile) */
function wallTopAt(w, u, H) {
  const prof = w.top;
  if (!prof || prof.length < 2) return H;
  if (u <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    if (u <= prof[i][0]) { const a = prof[i - 1], b = prof[i]; return a[1] + (b[1] - a[1]) * (u - a[0]) / Math.max(1e-6, b[0] - a[0]); }
  }
  return prof[prof.length - 1][1];
}

function mat(key, make) {
  if (!MAT.has(key)) {
    const m = make();
    // (which one it is: for the tests and for finding it again)
    if (m && m.userData && m.userData.key == null) m.userData.key = key;
    MAT.set(key, m);
  }
  return MAT.get(key);
}
/* ───────── slice: clipping planes shared by all 3D panes of one view (materials are shared too) ─────────
   While slicing, solids are drawn double-sided and their back faces in a flat dark colour, so a cut wall
   reads as a filled section instead of a hollow shell. */
const SLICE = { onU: { value: 0 }, capU: { value: new THREE.Color('#3a3f41') }, sets: new Map(), views: new Set(), seq: 0 };
/** slices are kept in the house file as plain numbers */
const SLICE_VECS = ['p0', 'n0', 'n', 'axis', 'q', 'center'];
function sliceToJSON(s) { const o = { num: s.num, angle: +s.angle.toFixed(2), size: +s.size.toFixed(3) }; for (const k of SLICE_VECS) o[k] = s[k].toArray().map(v => +v.toFixed(4)); return o; }
function sliceFromJSON(o) {
  const t = { id: ++SLICE.seq, num: o.num || 1, angle: o.angle || 0, size: o.size || 10, plane: new THREE.Plane() };
  for (const k of SLICE_VECS) t[k] = new THREE.Vector3().fromArray(o[k] || [0, 0, 0]);
  t.plane.setFromNormalAndCoplanarPoint(t.n, t.q);
  return t;
}
const DOOR_OPEN = 1.48;   // an open door stands almost square to the wall (85°)
const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.15);
function capPatch(m, on) {
  if (m.transparent || !m.isMeshStandardMaterial || m.userData.noCap) return;
  if (!m.userData.capPatched) {
    m.userData.capPatched = true;
    m.userData.side0 = m.side;
    m.onBeforeCompile = sh => {
      // a colour over a light-and-dark picture first (texlib.js softPatch), then the High preset's relief, then the
      // garden's patches over an area (garden.js macroPatch)
      if (m.userData.soft) softPatch(sh);
      if (m.userData.hqPatch) m.userData.hqPatch(sh);
      if (m.userData.macro) macroPatch(sh, m.userData.macro);
      sh.uniforms.sliceOn = SLICE.onU;
      sh.uniforms.sliceCap = SLICE.capU;
      sh.fragmentShader = 'uniform float sliceOn;\nuniform vec3 sliceCap;\n' + sh.fragmentShader.replace(/}\s*$/, '\tif (sliceOn > 0.5 && !gl_FrontFacing) gl_FragColor = vec4(sliceCap, 1.0);\n}\n');
    };
    m.customProgramCacheKey = () => 'slicecap' + (m.userData.soft ? '|soft' : '') + (m.userData.hqPatch ? '|relief' : '') + (m.userData.macro ? '|macro-' + m.userData.macro : '');
    m.needsUpdate = true;
  }
  const side = on ? THREE.DoubleSide : m.userData.side0;
  if (m.side !== side) { m.side = side; m.needsUpdate = true; }
}

const wallMat = color => mat('w|' + color + (libOn() && !libFast() ? '|lib' : ''), () => {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.92, metalness: 0 });
  m.userData.hq = { plaster: true };
  // the plaster under the paint (texlib.js): a faint relief, the colour stays the paint's
  const n = !libFast() && libTex('Concrete034', 'normal');
  if (n) { m.normalMap = n; m.normalScale = new THREE.Vector2(0.22, 0.22); }
  return m;
});
const LIB_FLOOR = { screed: ['Concrete014', 0.9], casco: ['Concrete016', 0.7], cast: ['Concrete016', 0.8], carpet: ['Carpet003', 0.9], other: ['Concrete016', 0.6], oak: ['WoodFloor051', 1], laminate: ['WoodFloor051', 0.8], pvc: ['WoodFloor051', 0.6], tiles: ['Tiles052', 0.7], stone: ['Marble021', 1] };
const floorMat = (m, color) => (LIB_FLOOR[m] && !WOODY.has(m) && !TILED.has(m) && libMaterial(LIB_FLOOR[m][0], { tint: color, contrast: LIB_FLOOR[m][1], rough: m === 'cast' ? 0.7 : 1 })) || mat('fl|' + m + '|' + color, () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTexture(m, color), roughness: m === 'tiles' || m === 'stone' ? 0.55 : 0.8, metalness: 0 }));
const brickMat = () => libBrick(null) || mat('brick', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: brickTexture(), roughness: 0.95 }));

/** BoxGeometry with UVs in metres so textures keep their real size on every wall piece */
function meterBox(L, H, T) {
  const geo = new THREE.BoxGeometry(L, H, T);
  const uv = geo.attributes.uv;
  const dims = [[T, H], [T, H], [L, T], [L, T], [L, H], [L, H]];
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return geo;
}

/* ───────── ViewCube (like Autodesk Inventor) ─────────
   A small cube in the corner that turns with the camera. Click a face, an edge or a corner to look from
   there; drag it to turn the view; the house above it goes to the home view. In a straight-on view, arrows
   around it step to the next face (and, from the top, turn the plan a quarter). The menu (or right-click)
   sets the current view as home or puts the default home back.
   Faces: FRONT = +z (the entrance side, the bottom of the 2D plan), RIGHT = +x, TOP = +y. */
const CUBE_FACES = [
  // name, normal, text-right, text-down (three.js world), CSS transform
  { name: 'Front', n: [0, 0, 1], r: [1, 0, 0], d: [0, -1, 0], css: 'rotateY(0deg)' },
  { name: 'Back', n: [0, 0, -1], r: [-1, 0, 0], d: [0, -1, 0], css: 'rotateY(180deg)' },
  { name: 'Right', n: [1, 0, 0], r: [0, 0, -1], d: [0, -1, 0], css: 'rotateY(90deg)' },
  { name: 'Left', n: [-1, 0, 0], r: [0, 0, 1], d: [0, -1, 0], css: 'rotateY(-90deg)' },
  { name: 'Top', n: [0, 1, 0], r: [1, 0, 0], d: [0, 0, 1], css: 'rotateX(90deg)' },
  { name: 'Bottom', n: [0, -1, 0], r: [1, 0, 0], d: [0, 0, -1], css: 'rotateX(-90deg)' },
];
function cubeDirName(v) {
  const parts = [];
  if (v[1] > 0) parts.push(t('top')); else if (v[1] < 0) parts.push(t('bottom'));
  if (v[2] > 0) parts.push(t('front')); else if (v[2] < 0) parts.push(t('back'));
  if (v[0] > 0) parts.push(t('right')); else if (v[0] < 0) parts.push(t('left'));
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

class ViewCube {
  constructor(view) {
    this.view = view;
    const host = view.host;
    this.cube = h('div', { class: 'vc-cube' });
    this.cells = [];
    for (const f of CUBE_FACES) {
      const face = h('div', { class: 'vc-face', style: { transform: `${f.css} translateZ(var(--vc-half))` } });
      face.appendChild(h('span', { class: 'vc-label', translate: 'no' }, t(f.name).toUpperCase()));
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const v = [0, 1, 2].map(i => f.n[i] + (col - 1) * f.r[i] + (row - 1) * f.d[i]);
        const key = v.join(',');
        const cell = h('div', { class: 'vc-cell' + (col === 1 && row === 1 ? ' mid' : ''), 'data-dir': key, title: cubeDirName(v) });
        cell.style.gridArea = `${row + 1} / ${col + 1}`;
        face.appendChild(cell);
        this.cells.push(cell);
      }
      f.el = face;
      this.cube.appendChild(face);
    }
    this.stage = h('div', { class: 'vc-stage' }, this.cube);
    const arrow = (cls, label, fn) => { const b = h('button', { class: 'vc-arrow ' + cls, 'aria-label': label, title: label, hidden: true, onclick: e => { e.stopPropagation(); fn(); } }); return b; };
    this.arrows = {
      up: arrow('up', 'Turn to the face above', () => this.step('up')),
      down: arrow('down', 'Turn to the face below', () => this.step('down')),
      left: arrow('left', 'Turn to the face on the left', () => this.step('left')),
      right: arrow('right', 'Turn to the face on the right', () => this.step('right')),
      ccw: arrow('ccw', 'Turn the plan a quarter to the left', () => this.roll(-1)),
      cw: arrow('cw', 'Turn the plan a quarter to the right', () => this.roll(1)),
    };
    this.homeBtn = h('button', { class: 'vc-home', 'aria-label': 'Home view', title: 'Home view', onclick: e => { e.stopPropagation(); view.home(); } }, icon('home'));
    this.menuBtn = h('button', { class: 'vc-menu', 'aria-label': 'View cube options', title: 'Home view options', onclick: e => { e.stopPropagation(); this.openMenu(this.menuBtn); } }, icon('chevron'));
    this.el = h('div', { class: 'viewcube' }, this.homeBtn, this.stage, this.menuBtn, ...Object.values(this.arrows));
    host.appendChild(this.el);
    // hover: an edge or a corner lights up on every face it touches
    this.stage.addEventListener('pointerover', e => { const c = e.target.closest('.vc-cell'); this.hover(c ? c.dataset.dir : null); });
    this.stage.addEventListener('pointerleave', () => this.hover(null));
    // click a cell, or drag anywhere on the cube to turn the view
    let drag = null;
    this.stage.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const c = e.target.closest('.vc-cell');
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, dir: c && c.dataset.dir };
      try { this.stage.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    });
    this.stage.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) { drag.moved = true; this.el.classList.add('dragging'); this.hover(null); }
      drag.x = e.clientX; drag.y = e.clientY;
      this.orbitBy(dx, dy);
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      this.el.classList.remove('dragging');
      if (!d.moved && d.dir) this.lookFrom(d.dir.split(',').map(Number));
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
    this.el.addEventListener('contextmenu', e => { e.preventDefault(); this.openMenu(this.menuBtn); });
    // the 3D view's own pointer handling must not see clicks on the cube
    for (const ev of ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel']) this.el.addEventListener(ev, e => e.stopPropagation());
    this.update();
  }

  hover(dir) {
    if (dir === this._hover) return;
    this._hover = dir;
    for (const c of this.cells) c.classList.toggle('hl', !!dir && c.dataset.dir === dir);
  }

  /** turn the cube with the camera, shade the faces, and show the step arrows in a straight-on view */
  update() {
    const v = this.view;
    if (!v.ok) return;
    v.camera.updateMatrixWorld();
    const e = v.camera.matrixWorldInverse.elements;     // column-major
    const R = (i, j) => e[j * 4 + i];
    const f = [1, -1, 1];
    // CSS (y down) = F · R · F · cube (y down)
    const m = [];
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) m.push(col < 3 && row < 3 ? f[row] * R(row, col) * f[col] : (col === 3 && row === 3 ? 1 : 0));
    const key = m.map(x => x.toFixed(4)).join(',');
    if (key !== this._key) {
      this._key = key;
      this.cube.style.transform = `matrix3d(${m.map(x => +x.toFixed(6)).join(',')})`;
      for (const fc of CUBE_FACES) {
        // camera-space z of the face normal: faces turned to the viewer are lighter
        const nz = R(2, 0) * fc.n[0] + R(2, 1) * fc.n[1] + R(2, 2) * fc.n[2];
        fc.el.style.setProperty('--vc-shade', Math.max(0, nz).toFixed(3));
      }
      this.updateArrows();
    }
  }

  /** the axis the camera looks straight along (as a face), or null */
  straightFace() {
    const v = this.view, off = v.camera.position.clone().sub(v.controls.target).normalize();
    for (const fc of CUBE_FACES) if (off.x * fc.n[0] + off.y * fc.n[1] + off.z * fc.n[2] > 0.9995) return fc;
    return null;
  }

  updateArrows() {
    const fc = this.straightFace();
    const show = (k, on) => { this.arrows[k].hidden = !on; };
    if (!fc) { for (const k of Object.keys(this.arrows)) show(k, false); return; }
    for (const k of ['up', 'down', 'left', 'right']) { const d = this.stepDir(k); show(k, !!d && d.y > -0.5); }
    show('ccw', fc.name === 'Top'); show('cw', fc.name === 'Top');
  }

  /** screen directions in the world (snapped to the axes) */
  screenAxes() {
    const c = this.view.camera;
    const snap = v => { const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)], i = a.indexOf(Math.max(...a)); const o = new THREE.Vector3(); o.setComponent(i, Math.sign(v.getComponent(i))); return o; };
    const right = snap(new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion));
    const up = snap(new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion));
    return { right, up };
  }
  stepDir(k) {
    const { right, up } = this.screenAxes();
    return k === 'left' ? right.clone().negate() : k === 'right' ? right : k === 'up' ? up : up.clone().negate();
  }
  step(k) { const d = this.stepDir(k); if (d && d.y > -0.5) this.lookFrom([d.x, d.y, d.z]); }

  /** in the top view: turn the plan a quarter */
  roll(sign) {
    const v = this.view, c = v.controls;
    const s = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(c.target));
    this.glide(new THREE.Spherical(s.radius, s.phi, s.theta + sign * Math.PI / 2), c.target.clone());
  }

  /** look at the target from direction d (a face, an edge or a corner); nothing below the ground */
  lookFrom(d) {
    const v = this.view, c = v.controls;
    d = d.slice();
    if (d[1] < 0) d[1] = 0;
    if (!d[0] && !d[1] && !d[2]) return;
    const cur = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(c.target));
    const dir = new THREE.Vector3(...d).normalize();
    let to;
    if (dir.y > 0.9999) {
      // straight down: keep the plan turned the way it was, squared to the nearest quarter
      to = new THREE.Spherical(cur.radius, 1e-4, Math.round(cur.theta / (Math.PI / 2)) * (Math.PI / 2));
    } else {
      to = new THREE.Spherical().setFromVector3(dir.multiplyScalar(cur.radius));
      to.phi = Math.min(to.phi, c.maxPolarAngle);
    }
    this.glide(to, c.target.clone());
  }

  glide(s1, target) {
    const v = this.view, c = v.controls;
    this.hover(null);
    if (c._sphericalDelta) c._sphericalDelta.set(0, 0, 0);
    if (c._panOffset) c._panOffset.set(0, 0, 0);
    const s0 = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(c.target));
    let dTheta = s1.theta - s0.theta;
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    v.anim = { s0, s1, dTheta, t0: c.target.clone(), t1: target, start: performance.now(), dur: 380 };
    v.needs = true;
  }

  /** drag on the cube: the house turns with the pointer, as when dragging the 3D view itself */
  orbitBy(dx, dy) {
    const v = this.view, c = v.controls;
    v.anim = null;
    const s = new THREE.Spherical().setFromVector3(v.camera.position.clone().sub(c.target));
    s.theta -= dx * 0.012;
    s.phi = Math.max(1e-4, Math.min(c.maxPolarAngle, s.phi - dy * 0.012));
    v.camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(s));
    v.camera.lookAt(c.target);
    v.needs = true;
    v.syncLinked();
  }

  openMenu(anchor) {
    const v = this.view, app = v.app, spec = v.spec || {};
    const where = spec.homeLabel || 'this view';
    UI.menu(anchor, [
      { label: 'Go to home view', icon: 'home', fn: () => v.home() },
      { label: `Set current view as home (${where})`, icon: 'check', fn: () => app.setHomeView(v.cameraState()) },
      { label: 'Reset home view to default', icon: 'undo', disabled: !spec.homeView, fn: () => app.resetHomeView() },
      '-',
      { label: 'Top view', fn: () => this.lookFrom([0, 1, 0]) },
      { label: 'Front view', fn: () => this.lookFrom([0, 0, 1]) },
    ]);
  }
}

/* ───────── pictures the graphics driver can take ─────────
   The Pixel 10's PowerVR chip (Tensor G5) with Chrome's OpenGL ES driver crashed at the material pictures (the 3D
   check, 4 Nov 2026; with its Vulkan driver everything ran). In safe mode no picture gets its smaller copies made by the
   chip (mipmaps) and none is sharpened at an angle (anisotropic filtering): the textures' own settings stay as they
   are and are only read so (accessors on THREE.Texture). On for that chip with that driver, or for good on a device
   whose PowerVR driver crashed once (settings.safeTex). */
let SAFE_TEX = false;
let GPU_INFO = '';
(function safeTextures() {
  const P = THREE.Texture.prototype;
  const near = new Set([THREE.NearestMipmapNearestFilter, THREE.NearestMipmapLinearFilter]), lin = new Set([THREE.LinearMipmapNearestFilter, THREE.LinearMipmapLinearFilter]);
  Object.defineProperty(P, 'generateMipmaps', { configurable: true, get() { return SAFE_TEX ? false : this._hpGenMip; }, set(v) { this._hpGenMip = v; } });
  Object.defineProperty(P, 'minFilter', { configurable: true, get() { const f = this._hpMinF; return SAFE_TEX ? (near.has(f) ? THREE.NearestFilter : lin.has(f) ? THREE.LinearFilter : f) : f; }, set(v) { this._hpMinF = v; } });
  Object.defineProperty(P, 'anisotropy', { configurable: true, get() { return SAFE_TEX ? 1 : this._hpAniso; }, set(v) { this._hpAniso = v; } });
})();
/** the graphics chip as the browser names it ('' when it doesn't say) */
function gpuName(r) {
  try { const gl = r.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return String(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || ''); } catch (e) { return ''; }
}
const isPowerVR = name => /powervr|imagination/i.test(name || '');
/** safe pictures for this chip and driver? (settings.safeTex: true always, false never, unset: by the chip) */
function needSafeTex(name, settings) {
  if (settings && settings.safeTex != null) return !!settings.safeTex;
  return isPowerVR(name) && !/vulkan/i.test(name);
}

class View3D extends Emitter {
  /** opts.mini: a small live preview (furnish mode) without the slice buttons and the ViewCube */
  constructor(host, app, opts = {}) {
    super();
    this.host = host;
    this.app = app;
    this.opts = opts;
    this.ok = false;
    this.linked = [];
    // Fast: no smoothing of edges, one pixel per screen pixel, no shadows (phones, older computers);
    // High (computers only, hq.js): depth in the surfaces, contact shadows on every frame, sky light
    const q = quality3d(app.settings || {});
    this.fast = q === 'fast';
    this.high = q === 'high' && !opts.mini;
    // the browser's own reason when it won't start 3D (it tells it to the canvas); once more without smooth edges
    let why = '';
    for (const attrs of [{ antialias: !this.fast, powerPreference: 'high-performance' }, { antialias: false }]) {
      const cv = document.createElement('canvas');
      cv.addEventListener('webglcontextcreationerror', e => { why = e.statusMessage || why; }, false);
      try { this.renderer = new THREE.WebGLRenderer({ canvas: cv, ...attrs, preserveDrawingBuffer: false }); break; }
      catch (e) { this.renderer = null; why = why || (e && e.message) || ''; }
    }
    if (!this.renderer) {
      host.appendChild(h('div', { class: 'no3d' }, h('strong', null, t('3D is not available on this device.')),
        h('p', null, t('The browser could not start WebGL. The 2D plans still work.')),
        why ? h('p', { class: 'no3d-why' }, t('The browser says: “{w}”', { w: why })) : null,
        h('p', null, t('Often the browser blocks 3D for a while after its graphics driver crashed. Close the browser completely (swipe it away), open the app again and tap Try again.')),
        h('button', { class: 'btn sm', id: 'btn-3d-retry', onclick: () => { app.layoutKey = null; app.setupPanes(false); } }, icon('rotate'), t('Try again'))));
      return;
    }
    this.ok = true;
    const r = this.renderer;
    GPU_INFO = gpuName(r);
    if (!SAFE_TEX && needSafeTex(GPU_INFO, app.settings)) { SAFE_TEX = true; if (TEXLIB.ready) texlibSettingsChanged(); }
    // the graphics card was reset (Windows resets a card that is busy for 2 s with one piece of work; the browser then
    // loses every 3D picture of the page): this view is started again, looking where it looked (app.view3dLost)
    r.domElement.addEventListener('webglcontextlost', () => { if (this.destroyed) return; this.lost = true; app.view3dLost(this); });
    r.domElement.addEventListener('webglcontextrestored', () => { if (this.destroyed) return; app.view3dLost(this, true); });
    r.setPixelRatio(this.fast ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.smoothSetup();
    r.shadowMap.enabled = !this.fast;
    // (three r187: PCFSoftShadowMap is gone; PCF with a radius gives the same soft edge)
    r.shadowMap.type = THREE.PCFShadowMap;
    // the sun's shadows are drawn again only when something in the scene changed (loop): moving the camera or
    // walking keeps them – they lie on the house and the garden, not on the camera – and that halves the work then
    r.shadowMap.autoUpdate = false;
    this.shadowDirty = true;
    r.localClippingEnabled = true;
    this.cutPlane = CUT_PLANE;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    this.maxAniso = r.capabilities.getMaxAnisotropy ? r.capabilities.getMaxAnisotropy() : 4;
    MAX_ANISO = Math.min(8, this.maxAniso || 4);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 800);
    this.camera.position.set(-8, 14, -10);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 300;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xcfcac2, 1.45);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff6ea, 1.25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);
    // High: light from the whole sky (indoors it would light up the rooms too much without its contact shadows)
    if (this.high) { this.skySetup(); this.hqSetup(); }
    this.groundShadow = new THREE.ShadowMaterial({ opacity: 0.16 });
    this.groundSolid = new THREE.MeshStandardMaterial({ color: 0xdedfdb, roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundShadow);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.extraSetup();
    this.labelLayer = h('div', { class: 'labels3d' });
    host.append(r.domElement, this.labelLayer);
    r.domElement.classList.add('gl');
    this.labels = [];
    this.pickables = [];
    this.needs = true;
    this.fitKey = null;
    this.visible = true;
    this.controls.addEventListener('change', () => { this.camMoved = true; this.syncLinked(); });
    this.controls.addEventListener('start', () => { this.anim = null; });
    // tap to pick a room; double tap (touch) or middle click (mouse) goes back to the home view
    let down = null, pending = null;
    r.domElement.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    r.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, type: e.pointerType }; });
    r.domElement.addEventListener('pointerup', e => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6 || performance.now() - d.t >= 500) return;
      if (d.button === 1) { this.home(); return; }
      if (this.sl && this.sl.mode === 'pick') { if (d.button === 0) this.pickSlice(e); return; }
      if (d.type !== 'mouse') {
        // touch: wait a moment before picking, so a double tap doesn't open the room details first
        const now = performance.now(), prev = pending, ev = { clientX: e.clientX, clientY: e.clientY };
        if (prev) { clearTimeout(prev.timer); pending = null; }
        if (prev && now - prev.t < 320 && Math.hypot(ev.clientX - prev.ev.clientX, ev.clientY - prev.ev.clientY) < 40) { this.home(); return; }
        if (prev) this.pick(prev.ev);
        pending = { t: now, ev, timer: setTimeout(() => { pending = null; if (this.ok && this.visible !== false) this.pick(ev); }, 300) };
        return;
      }
      this.pick(e);
    });
    if (!opts.mini) {
      this.furnDragSetup();
      this.sliceSetup();
      this.cube = new ViewCube(this);
      host.classList.add('has-cube');
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    if (!this.ok) { this.host.innerHTML = ''; return; }
    clearTimeout(this._resT); this._low = false;
    if (this.csmSun) this.nearSunEnd();
    if (this.ao) this.ao.dispose();
    if (this.aeDispose) this.aeDispose();
    if (this.sl) this.endDraft();
    SLICE.views.delete(this);
    if (this._sliceKey) document.removeEventListener('keydown', this._sliceKey, true);
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    // (lent to the render window: the picture leaves the window too)
    if (this.borrowed) { const b = this.borrowed; this.borrowed = null; this.renderer.domElement.remove(); if (b.still) b.still.remove(); }
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    this.host.innerHTML = '';
  }

  resize() {
    if (!this.ok) return;
    // (a photo render has the picture at its own size meanwhile: it calls this when it is done)
    if (this.rendering) return;
    // (the picture lent to the render window: the size of its frame there – render.js)
    const rc = (this.borrowed ? this.borrowed.box : this.host).getBoundingClientRect();
    if (!rc.width || !rc.height) return;
    this.renderer.setSize(rc.width, rc.height);
    this.camera.aspect = rc.width / rc.height;
    this.camera.updateProjectionMatrix();
    this.W = rc.width; this.H = rc.height;
    this.applyViewOffset();
    this.W = rc.width; this.H = rc.height;
    if (this.ao) this.ao.resize();
    this.needs = true;
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || this.rendering) return;
    // asked for since the last picture by anything but the camera (the scene, the sun, a switch): new shadows
    if (this.needs) this.shadowDirty = true;
    // doors swinging, room lights following the camera, walking
    const ticked = this.tick();
    if (ticked) this.needs = true;
    if (this.anim) {
      // glide to the home view: interpolate around the target, not through the house
      const a = this.anim;
      let k = Math.min(1, (performance.now() - a.start) / a.dur);
      k = 1 - Math.pow(1 - k, 3);
      const sp = new THREE.Spherical(a.s0.radius + (a.s1.radius - a.s0.radius) * k, a.s0.phi + (a.s1.phi - a.s0.phi) * k, a.s0.theta + a.dTheta * k);
      this.controls.target.lerpVectors(a.t0, a.t1, k);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sp));
      if (k >= 1) this.anim = null;
    }
    if (this.vo && this.vo.cur !== this.vo.target) {
      const d = this.vo.target - this.vo.cur;
      this.vo.cur = Math.abs(d) < 1 ? this.vo.target : this.vo.cur + d * 0.25;
      this.applyViewOffset();
      this.needs = true;
    }
    // the glide after letting go lasts as long on a slow device as on a fast one (damping per frame time)
    const nowT = performance.now(), fdt = Math.min(250, nowT - (this._lastLoop || nowT));
    this._lastLoop = nowT;
    if (fdt > 0) this.controls.dampingFactor = clamp(1 - Math.pow(0.88, fdt / 16.7), 0.12, 0.85);
    const moved = (this.walker ? false : this.controls.update()) || this.camMoved;
    this.camMoved = false;
    // phones: a little less sharp while moving (smooth.js)
    this.smoothStep(moved || (!!this.walker && ticked) || !!this.anim);
    // the shaders of a new house are still being prepared: keep the picture there is
    if (this._warming) return;
    // the exposure following what you look at (autoexp.js): measured when the camera stops, then a smooth glide
    if (this.aeStep && this.aeStep(moved || !!this.anim || (!!this.walker && ticked))) this.needs = true;
    // soft shadows in corners (Beautiful) are drawn once things stand still: moving stays smooth
    let draw = false, withAO = false;
    if (moved || this.needs) {
      // the plain picture now; the soft shadows a moment after the last change (dragging, gliding, doors …)
      draw = true;
      // High (computers): on every frame, also while moving
      if (this.aoWanted()) { if (this.high) { withAO = true; this.aoDue = 0; } else this.aoDue = performance.now() + (moved || ticked || this.anim ? 240 : 140); }
    } else if (this.aoDue && performance.now() >= this.aoDue) { this.aoDue = 0; draw = true; withAO = this.aoWanted(); }
    if (draw) {
      this.needs = false;
      // walking on a computer: the sun with two shadow maps that follow the view (sunnear.js)
      this.nearSunStep();
      if (this.csmSun && moved) this.shadowDirty = true;
      if (this.shadowDirty) { this.shadowDirty = false; this.renderer.shadowMap.needsUpdate = true; }
      this.renderer.render(this.scene, this.camera);
      if (withAO) this.renderAO();
      // the exposure measured from this picture when it was due (autoexp.js)
      if (this._aeWant && this.aeTake) this.aeTake();
      if ((this.sl && this.sl.n0) || this.slPreview) {
        // the slice handles (and previews of applied slices) on top of everything
        this.gizmo.visible = !!(this.sl && this.sl.n0);
        this.updateGizmo();
        this.updatePreview();
        const r = this.renderer;
        r.autoClear = false;
        r.clearDepth();
        r.render(this.overlay, this.camera);
        r.autoClear = true;
      }
      this.updateLabels();
      if (this.m3Label) this.placeMeasureLabel();
      if (this.cube) this.cube.update();
      // recording a video of the walk (tour.js)
      if (this.rec) this.rec.frame();
    }
  }

  link(other) { if (!this.linked.includes(other)) this.linked.push(other); }
  syncLinked() {
    if (this._syncing) return;
    for (const o of this.linked) {
      if (!o.ok) continue;
      o._syncing = true;
      o.camera.position.copy(this.camera.position);
      o.controls.target.copy(this.controls.target);
      o.camera.updateMatrixWorld();
      o.camMoved = true;
      o._syncing = false;
    }
  }

  clear() {
    this.group.traverse(o => { if (o.geometry && !(o.userData && o.userData.keep)) o.geometry.dispose(); });
    this.group.clear();
    if (this.ao) this.ao.box = null;
    this.pickables = [];
    this.labels = [];
    this.labelLayer.textContent = '';
    this.clearExtra();
  }

  /* spec: {entries:[{storey, plan, basePlan, diff, offset:[x,z], y, label}], cut, labels, selection, fitKey, theme} */
  build(spec) {
    if (!this.ok) return;
    // after an edit (spec.reuse) the storeys that did not change are kept as they are (built, merged, with their
    // doors, pick pieces and lamps): only what changed is built again (reuse.js)
    const R = this.reusePlan(spec);
    if (R) this.clearKeep(R.keep); else this.clear();
    this.spec = spec;
    const evening = spec.light === 'evening';
    const bg = evening ? '#1d242b' : (cssVar('--paper') || '#f2f2f2');
    this.scene.background = new THREE.Color(bg);
    // walking by day (Beautiful and High): the sky over you, and a light haze that makes the far streets and the park
    // fade a little into it (only far away: inside the house and the garden nothing changes)
    this.scene.fog = null;
    if (spec.walk && !evening && !this.fast) {
      this.scene.background = walkSkyTexture();
      this.scene.fog = new THREE.Fog(0xdde5ec, 80, 400);   // (fully hazed where walking's view ends: no seam)
    }
    this.applyLight(evening);
    const cutH = spec.cut && spec.scope !== 'house' && !spec.walk ? 1.15 : null;
    const ink = cssVar('--ink') || '#222';
    const boxAll = new THREE.Box3();
    this.cutPlane.constant = 1.15;
    const fresh = [];
    spec.entries.forEach((en, i) => {
      const kept = R && R.byEntry[i];
      if (kept) {
        // unchanged since the last picture: put it back as it was
        kept.userData.entry = en;
        this.group.add(kept);
        this.regRestore(kept);
        boxAll.union(kept.userData.box);
        this.buildPins(kept, en);
        return;
      }
      const snap = this.regSnap();
      const g = new THREE.Group();
      g.position.set(en.offset[0], en.y || 0, en.offset[1]);
      g.userData.storeyId = en.storey.id;
      g.userData.entry = en;
      this.buildStorey(g, en, cutH, ink);
      if (spec.shell) { this.buildShell(g, en, spec, cutH); this.buildRoofFlats(g, en, cutH); }
      this.group.add(g);
      g.updateMatrixWorld(true);
      // furniture is not part of the house's size (a piece dragged far away should not move the view)
      const gb = new THREE.Box3().expandByObject(g);
      boxAll.union(gb);
      this.buildFurniture(g, en, cutH);
      this.buildInstalls(g, en, cutH);
      this.buildStairs(g, en, cutH);
      g.userData.box = gb;
      g.userData.rsig = R ? R.sigs[i] : this.entrySig(spec, en);
      g.userData.reg = this.regSince(snap);
      fresh.push(g);
      this.buildPins(g, en);
    });
    // labels
    if (spec.labels) {
      for (const en of spec.entries) {
        for (const r of en.plan.rooms) {
          if (r.storey !== en.storey.id) continue;
          const lp = labelPoint(r.poly, roomHoles(en.plan, r));
          const el = h('div', { class: 'label3d' }, r.name);
          this.labelLayer.appendChild(el);
          this.labels.push({ el, pos: new THREE.Vector3(lp[0] + en.offset[0], (en.y || 0) + 0.15, lp[1] + en.offset[1]) });
        }
        if (spec.entries.length > 1 && en.bbox) {
          const el = h('div', { class: 'label3d sheet' }, en.label || en.storey.name);
          this.labelLayer.appendChild(el);
          this.labels.push({ el, pos: new THREE.Vector3((en.bbox.minX + en.bbox.maxX) / 2 + en.offset[0], (en.y || 0) + (en.storey.wallHeight || 2.6) + 0.6, en.bbox.minY + en.offset[1] - 0.4) });
        }
      }
    }
    if (boxAll.isEmpty()) boxAll.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    const center = boxAll.getCenter(new THREE.Vector3());
    const size = boxAll.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, size.y) * 0.75 + 2;
    this.ground.scale.set(radius * 8, radius * 8, 1);
    this.ground.visible = spec.ground !== false;
    if (spec.shell) {
      // a real site: an opaque ground just below the ground floor hides foundations and slab edges
      const paper = new THREE.Color(bg);
      this.groundSolid.color.copy(paper).offsetHSL(0, 0, -0.06);
      this.ground.material = this.groundSolid;
      const lowest = Math.min(...spec.entries.map(en => en.y || 0));
      this.ground.position.set(center.x, lowest - 0.05, center.z);
    } else {
      this.ground.material = this.groundShadow;
      this.ground.position.set(center.x, boxAll.min.y - 0.21, center.z);
    }
    this.sun.position.set(center.x - radius * 0.8, center.y + radius * 1.7, center.z + radius * 0.6);
    this.sun.target.position.copy(center);
    this._sunC = center.clone(); this._sunR = radius;
    const sc = this.sun.shadow.camera;
    sc.left = -radius * 1.3; sc.right = radius * 1.3; sc.top = radius * 1.3; sc.bottom = -radius * 1.3;
    sc.near = 0.5; sc.far = radius * 5;
    sc.updateProjectionMatrix();
    if (spec.fitKey !== this.fitKey) {
      this.fitKey = spec.fitKey;
      this.homeBox = boxAll.clone();
      this.fit(boxAll);
    }
    this.homeBox = boxAll.clone();
    // the plot and the garden around the lowest storey (not part of the house's size)
    if (spec.site) {
      this.ground.visible = false;
      const gs = this.gardenSig(spec, cutH);
      const kept = R && R.garden && R.garden.userData.rsig === gs ? R.garden : null;
      if (kept) { this.group.add(kept); this.regRestore(kept); }
      else {
        const snap = this.regSnap();
        const n0 = this.group.children.length;
        this.buildGarden(spec, cutH);
        const G = this.group.children[n0];
        if (G) { G.userData.rsig = gs; G.userData.reg = this.regSince(snap); fresh.push(G); }
      }
    }
    // slices belong to this view (project + storey / all storeys / whole house)
    const key = spec.sliceKey || '';
    if (key !== this.sliceKey) {
      if (this.sl) { this.sl = null; this.gzDrag = null; this.host.classList.remove('slice-picking', 'slice-hover', 'slice-dragging'); this.renderSlicePanel(); }
      this.sliceKey = key;
      this.slPreview = null;
    }
    // (a kept storey has its High materials already)
    for (const r of fresh) this.hqApply(r);
    this.applyClip();
    // fewer draw calls: what never moves, one mesh per material (batch.js)
    this.batchAll();
    this.renderSliceList();
    // walking: the house was rebuilt, so the floors and walls to walk on are new
    if (this.walker) { this.walker.collect(); this.walker.updateCamera(); }
    // the real sun for a date and time
    if (spec.sun) this.applySun(spec.sun);
    this.needs = true;
    // Evening: the lamps glow (glow.js)
    this.buildGlow();
    this.prewarm();
    // the first house in 3D on this device: is this quality right for it? (autoq.js)
    if (this.app && this.app.autoQualityOnce && !this.opts.mini && this.app.panes && this.app.panes.some(pn => pn.view === this)) this.app.autoQualityOnce(this);
  }

  home() { if (this.ok && !this.walker) this.fit(null, true); }

  /** On phones a menu (top) or the details sheet (bottom) can cover part of the view: slide the picture into the
   *  open part (the camera itself stays where it is) */
  setInsets(top, bottom) {
    this.vo = this.vo || { cur: 0, target: 0 };
    this.vo.target = Math.round((bottom - top) / 2);
    this.needs = true;
  }
  applyViewOffset() {
    const vo = this.vo;
    if (!vo || !this.W) return;
    if (Math.abs(vo.cur) < 0.5 && !vo.target) { if (this.camera.view && this.camera.view.enabled) { this.camera.clearViewOffset(); } return; }
    this.camera.setViewOffset(this.W, this.H, 0, vo.cur, this.W, this.H);
  }

  /** the camera, to carry over to a new pane (side by side / compare on or off) */
  viewState() { return this.ok ? { kind: '3d', pos: this.camera.position.clone(), target: this.controls.target.clone() } : null; }
  /** the camera as plain numbers, for saving in the project */
  cameraState() { return { pos: this.camera.position.toArray().map(v => +v.toFixed(3)), target: this.controls.target.toArray().map(v => +v.toFixed(3)) }; }
  setViewState(st) {
    if (!this.ok || !st || st.kind !== '3d') return;
    this.anim = null;
    this.camera.position.copy(st.pos);
    this.controls.target.copy(st.target);
    this.controls.update();
    this.needs = true;
    this.syncLinked();
  }

  fit(box, animate = false) {
    box = box || this.homeBox || new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = 0.5 * Math.hypot(size.x, size.y * 0.8, size.z);
    const vfov = this.camera.fov * Math.PI / 180;
    const aspect = this.camera.aspect || 1;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const house = this.spec && this.spec.scope === 'house';
    let dist = r / Math.sin(Math.min(vfov, hfov) / 2) * (aspect < 1 ? (house ? 1.0 : 0.82) : 0.95);
    // storeys: from above, so left-right matches the 2D drawing; the whole house: lower, from the front right,
    // so the front, the side gable and the extension are all in view
    const dir = (this.spec && this.spec.scope === 'house' ? new THREE.Vector3(0.58, 0.56, 0.8) : new THREE.Vector3(-0.32, 1.05, 0.85)).normalize();
    let pos = center.clone().addScaledVector(dir, dist);
    // a home view the user set for this view (kept in the project)
    const hv = this.spec && this.spec.homeView;
    if (hv && hv.pos && hv.target) {
      pos = new THREE.Vector3(...hv.pos);
      center.set(...hv.target);
      dist = pos.distanceTo(center);
    }
    this.camera.near = Math.max(0.05, dist / 200);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    // stop any leftover spin from the last drag
    const c = this.controls;
    if (c._sphericalDelta) c._sphericalDelta.set(0, 0, 0);
    if (c._panOffset) c._panOffset.set(0, 0, 0);
    if ('_scale' in c) c._scale = 1;
    if (animate) {
      const s0 = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(c.target));
      const s1 = new THREE.Spherical().setFromVector3(pos.clone().sub(center));
      let dTheta = s1.theta - s0.theta;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      this.anim = { s0, s1, dTheta, t0: c.target.clone(), t1: center.clone(), start: performance.now(), dur: 420 };
      this.needs = true;
      return;
    }
    this.anim = null;
    this.controls.target.copy(center);
    this.camera.position.copy(pos);
    this.controls.update();
    this.needs = true;
    this.syncLinked();
  }

  buildShell(g, en, spec, cutH) {
    let parts = spec.shell.storeys[en.storey.id];
    if (!parts) return;
    // windows and doors added, changed or closed up in the outside walls: the brick is cut or bricked up
    const fx = spec.origPlan ? facadeInfo(spec, en) : null;
    if (fx) parts = facadeShellParts(spec.shell, en.storey.id, en.plan, fx, !!en.diff);
    const origOps = spec.origPlan ? new Set(spec.origPlan.openings.map(o => o.id)) : null;
    const leaves = new Map();   // 'opening:leaf' → the meshes of one swinging leaf of an outside door
    for (const part of parts) {
      const m = spec.shell.materials[part.key] || part.mat || { kind: 'plain' };
      // the leaves of an outside door that was taken out or changed (the app draws a changed one itself)
      if (m.door && fx && (fx.fresh.has(m.door) || (origOps && origOps.has(m.door) && !en.plan.openings.some(o => o.id === m.door)))) continue;
      if (m.roof && (spec.scope !== 'house' || spec.roof === false)) continue;
      if (m.plinth && spec.plinth === false) continue;
      // projects imported before the tags existed: frames/glass are windows, door parts are doors, brick is façade
      const isWin = m.win || (m.win === undefined && !m.roof && /^(frame|glass)(\||$)/.test(part.key));
      const isDoor = m.odoor || (m.odoor === undefined && /^(leaf|metal|groove|bead|door)$/.test(part.key));
      const isOut = m.out || (m.out === undefined && /^brick:/.test(part.key));
      if ((isWin || isDoor) && spec.windows === false) continue;
      if ((isOut || m.plinth) && spec.outside === false) continue;
      if (m.floor && spec.floors === false) continue;
      const material = shellMaterial(part.key, m);
      material.userData.cutClip = cutH != null;
      const mesh = new THREE.Mesh(shellGeometry(part), material);
      mesh.userData.keep = true;
      // stair treads and floor slabs carry you when walking
      if (/^stair/.test(part.key) || m.floor) mesh.userData.walk = true;
      mesh.castShadow = m.kind !== 'glass';
      mesh.receiveShadow = true;
      if (m.door) {
        mesh.userData.door = m.door;
        const k = m.door + ':' + (m.leaf || 0);
        if (!leaves.has(k)) leaves.set(k, { op: m.door, leaf: m.leaf || 0, meshes: [] });
        leaves.get(k).meshes.push({ mesh, part: m.part || part.key.split('|')[0] });
        continue;
      }
      g.add(mesh);
    }
    if (leaves.size) this.shellDoors(g, en, leaves);
  }

  /** outside doors of the builder's model: each leaf turns about its hinge, the way the plan's door swings */
  shellDoors(g, en, leaves) {
    const plan = en.plan;
    const byOp = new Map();
    for (const L of leaves.values()) { if (!byOp.has(L.op)) byOp.set(L.op, []); byOp.get(L.op).push(L); }
    for (const [opId, list] of byOp) {
      const op = plan.openings.find(o => o.id === opId);
      const w = op && plan.walls.find(x => x.id === op.wall);
      if (!op || !w || op.kind !== 'door') { for (const L of list) for (const { mesh } of L.meshes) g.add(mesh); continue; }
      const d = wallDir(w), n = V.perp(d);
      // the leaves along the wall, from its start
      const boxOf = L => {
        const main = L.meshes.filter(x => x.part === 'leaf');
        const bb = new THREE.Box3();
        for (const { mesh } of (main.length ? main : L.meshes)) { mesh.geometry.computeBoundingBox(); bb.union(mesh.geometry.boundingBox); }
        const corners = [[bb.min.x, bb.min.z], [bb.max.x, bb.min.z], [bb.min.x, bb.max.z], [bb.max.x, bb.max.z]];
        const us = corners.map(c => V.dot(c, d)), vs = corners.map(c => V.dot(c, n));
        return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
      };
      list.forEach(L => { L.box = boxOf(L); });
      list.sort((a, b) => a.box.u0 - b.box.u0);
      const side = op.swing === 'right' ? -1 : 1;
      list.forEach((L, i) => {
        const hinge = list.length === 2 ? (i === 0 ? 'start' : 'end') : (op.hinge || 'start');
        const dirSign = hinge === 'end' ? -1 : 1;
        const hu = hinge === 'end' ? L.box.u1 : L.box.u0, hv = side > 0 ? L.box.v1 : L.box.v0;
        const hp = V.add(V.mul(d, hu), V.mul(n, hv));
        const pivot = new THREE.Group();
        pivot.position.set(hp[0], 0, hp[1]);
        const open = new THREE.Group();
        for (const { mesh } of L.meshes) { mesh.position.set(-hp[0], 0, -hp[1]); open.add(mesh); }
        // the model has the handle on the outside only: a lever on the inside too, at the free edge
        if (L.meshes.some(x => x.part === 'metal')) {
          const c0 = V.add(w.a, V.mul(d, op.pos));
          const inPlus = !!this.roomAt(plan, en.storey.id, V.add(c0, V.mul(n, w.t / 2 + 0.3)));
          const towards = hinge === 'end' ? 1 : -1;   // the lever points back towards the hinge
          const fu = hinge === 'end' ? L.box.u0 + 0.065 : L.box.u1 - 0.065;
          const fv = inPlus ? L.box.v1 : L.box.v0;
          this.leverHandle(open, V.add(V.mul(d, fu), V.mul(n, fv)), d, V.mul(n, inPlus ? 1 : -1), towards, opId, hp);
        }
        const full = -side * dirSign * DOOR_OPEN * 0.92;
        open.rotation.y = this.doorClosed(opId) ? 0 : full;
        this.registerDoor(opId, open, full);
        pivot.add(open);
        g.add(pivot);
      });
    }
  }

  roomAt(plan, sid, p) {
    let best = null, area = Infinity;
    for (const r of plan.rooms) {
      if (r.storey !== sid) continue;
      if (pointInPolygon(p, r.poly)) { const a = roomArea(r); if (a < area) { area = a; best = r; } }
    }
    return best;
  }

  buildStorey(g, en, cutH, ink) {
    const plan = en.plan, st = en.storey, sid = st.id;
    const sel = this.spec.selection;
    // slab under the storey
    const pts = plan.walls.filter(w => w.storey === sid).flatMap(w => [w.a, w.b]);
    const roomPts = plan.rooms.filter(r => r.storey === sid).flatMap(r => r.poly);
    const bb = bboxOfPoints(pts.length ? pts : roomPts);
    const hasShell = !!(this.spec.shell && this.spec.shell.storeys[sid]);
    // façade openings that are new or changed: the model has no frame for them, so the app draws it
    const fresh = hasShell && this.spec.origPlan ? facadeInfo(this.spec, en).fresh : null;
    // the model brings frames, glass and door leaves for the openings of the façade; a door through a cavity wall
    // between two rooms (two inner leaves with insulation between, e.g. into the berging) is drawn by the app
    const fromModel = (w, op) => hasShell && w.kind !== 'interior' && !(fresh && fresh.has(op.id) && !op.leaf) && isModelDoor(plan, w, op);
    const floorsOn = this.spec.floors !== false;
    if (bb && !hasShell && floorsOn) {
      const ext = 0.15;
      // stairwells (of stairs drawn in the app, and voids) stay open in the slab
      const holes = (plan.stairs || []).filter(st2 => st2.upper === sid).flatMap(stairHoles).concat((plan.voids || []).filter(v => v.storey === sid).map(v => v.poly));
      let slabGeo;
      if (holes.length) {
        const shape = new THREE.Shape([[bb.minX - ext, bb.minY - ext], [bb.maxX + ext, bb.minY - ext], [bb.maxX + ext, bb.maxY + ext], [bb.minX - ext, bb.maxY + ext]].map(([x, y]) => new THREE.Vector2(x, -y)));
        for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, -y))));
        slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.2, 0);
      } else slabGeo = new THREE.BoxGeometry(bb.w + ext * 2, 0.2, bb.h + ext * 2);
      const slab = new THREE.Mesh(slabGeo, mat('slab', () => new THREE.MeshStandardMaterial({ color: 0xcfcbc4, roughness: 1 })));
      if (!holes.length) slab.position.set(bb.minX + bb.w / 2, -0.1, bb.minY + bb.h / 2);
      slab.receiveShadow = true; slab.castShadow = true;
      slab.userData.walk = true; slab.userData.slab = true;
      g.add(slab);
    }
    // floors
    for (const r of plan.rooms) {
      if (r.storey !== sid || r.poly.length < 3 || !floorsOn) continue;
      // the stairwell stays open
      const geo = new THREE.ShapeGeometry(floorShapes(r.poly, roomHoles(plan, r), ([x, y]) => new THREE.Vector2(x, -y)));
      const m = new THREE.Mesh(geo, floorMaterial(r.floor));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.004;
      m.receiveShadow = true;
      m.userData = { roomId: r.id, storeyId: sid, versionId: en.versionId, edit: en.edit, walk: true };
      g.add(m);
      this.pickables.push(m);
      if (sel && sel.type === 'room' && sel.id === r.id) {
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(r.poly.map(([x, y]) => new THREE.Vector3(x, 0.03, y))), new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--accent') || '#0e6f78') }));
        g.add(line);
      }
    }
    // ceilings and a light point in every room (seen from inside; from above they are not drawn)
    this.buildCeilings(g, en, cutH);
    // walls
    const newByWall = new Map();
    if (en.diff) for (const p of en.diff.newParts) if (p.wall.storey === sid) { if (!newByWall.has(p.wall.id)) newByWall.set(p.wall.id, []); newByWall.get(p.wall.id).push([p.s, p.e]); }
    const matNew = mat('new', () => new THREE.MeshStandardMaterial({ color: new THREE.Color(cssVar('--new') || '#d2372b'), roughness: 0.8 }));
    const matCut = mat('cut|' + ink, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(ink), roughness: 1 }));
    // the inside of the roof over this storey (walls under it follow it)
    const roofField = hasShell ? this.roofCeiling(sid) : null;
    const roomsHere = plan.rooms.filter(r => r.storey === sid && r.poly.length >= 3);
    const inRoomHere = pt => roomsHere.some(r => pointInPolygon(pt, r.poly));
    // how the walls meet (so no two faces lie in one place); walls the model draws itself are left out
    const ends = wallEnds(plan, sid, w => (hasShell && isShellLayerWall(w)) || (this.spec.outside === false && (w.kind === 'exterior' || w.kind === 'insulation')), w => wallHeight(w, st));
    const facesByWall = new Map();
    for (const f of wallFaces(plan, sid)) { if (!facesByWall.has(f.wall.id)) facesByWall.set(f.wall.id, []); facesByWall.get(f.wall.id).push(f); }
    // low walls in the façade of an upper storey, standing on a lower roof (the builder's upstands of aerated
    // concrete): drawn in the façade's brick, a hair proud of the model's faces, and their corners closed
    const upstands = hasShell ? facadeUpstands(plan, st, (this.app && this.app.project && this.app.project.storeys) || []) : new Set();
    const upBrick = upstands.size ? facadeBrickMat(this.spec.shell) : null;
    if (upstands.size && this.spec.outside !== false) this.buildUpstandCorners(g, plan, upstands, upBrick, st, cutH);
    for (const w of plan.walls) {
      if (w.storey !== sid) continue;
      // outside walls switched off: every layer of the façade (inner leaf, insulation, brick)
      if (this.spec.outside === false && (w.kind === 'exterior' || w.kind === 'insulation')) continue;
      // under the roof: the wall's top follows the inside of the roof
      const prof = roofField && !(hasShell && isShellLayerWall(w)) ? wallRoofProfile(w, roofField, wallHeight(w, st), inRoomHere) : null;
      const H = prof ? Math.max(...prof.map(q => q[1])) : wallHeight(w, st);
      const topAt = prof ? (u => wallTopAt({ top: prof }, u, H)) : (u => wallTopAt(w, u, H));
      const parts = wallParts(w, openingsOf(plan, w.id));
      const L = parts.L;
      if (L < 0.01) continue;
      const d = wallDir(w), n = V.perp(d);
      const mid = V.lerp(w.a, w.b, 0.5);
      // each side in the finish of the room it faces (a wall can face two rooms on one side: cut where they meet)
      const faces = facesByWall.get(w.id) || [];
      const fallback = {};
      const sideColor = sign => {
        if (fallback[sign]) return fallback[sign];
        const p = V.add(mid, V.mul(n, sign * (w.t / 2 + 0.08)));
        const r = this.roomAt(plan, sid, p);
        // (an inner leaf's side in the cavity is plain, not brick)
        return (fallback[sign] = r ? wallMat(r.wallColor || WALL_FINISH_DEFAULT) : w.kind === 'exterior' && w.leaf !== 'inner' ? brickMat() : w.leaf === 'inner' ? wallMat('#d9d6cf') : wallMat(WALL_FINISH_DEFAULT));
      };
      const faceAt = (sign, u) => faces.find(f => f.side === sign && u >= f.u0 - 0.001 && u <= f.u1 + 0.001) || null;
      const sideMat = (sign, u, yb) => {
        const f = faceAt(sign, u);
        if (!f) return sideColor(sign);
        return finishMat(faceFinish(w, f.room), yb, f, sign, roomCeilH(f.room, st));
      };
      const endM = wallMat('#d9d6cf');
      const news = newByWall.get(w.id) || [];
      let tagDoor = null;
      // the façade's brick and insulation come from the IFC shell; only new pieces of them are drawn here
      const shellLayer = hasShell && (w.leaf === 'outer' || w.kind === 'insulation');
      const piece = (s0, s1, y0, y1, isNew) => {
        if (shellLayer && !isNew) return;
        if (s1 - s0 < 0.003) return;
        // at the wall's ends: as far as the joint with the walls it meets says (per side)
        const E = ends.get(w.id) || { a: [w.t / 2, w.t / 2], b: [w.t / 2, w.t / 2] };
        const ext0 = s0 <= 0.0005 ? Math.max(...E.a) : 0, ext1 = s1 >= L - 0.0005 ? Math.max(...E.b) : 0;
        const a = s0 - ext0, b = s1 + ext1;
        // split where a sloped top changes direction
        const cuts = [a, b];
        for (const [u] of (prof || w.top || [])) if (u > a + 0.002 && u < b - 0.002) cuts.push(u);
        if (!isNew) for (const f of faces) for (const u of [f.u0, f.u1]) if (u > a + 0.002 && u < b - 0.002) cuts.push(u);
        cuts.sort((x, y) => x - y);
        for (let i = 0; i < cuts.length - 1; i++) {
          const ua = cuts[i], ub = cuts[i + 1];
          if (ub - ua < 0.0005) continue;
          // where tiles stop on either side, the piece is cut in two heights
          const um = (ua + ub) / 2, ys = [y0];
          if (!isNew) for (const sign of [1, -1]) {
            const f = faceAt(sign, um), T = f && faceFinish(w, f.room).tiles;
            if (T && T.to > y0 + 0.01 && T.to < y1 - 0.01 && !ys.includes(T.to)) ys.push(T.to);
          }
          ys.sort((x, y) => x - y); ys.push(y1);
          for (let k = 0; k < ys.length - 1; k++) {
            const yb = ys[k], yt = ys[k + 1];
            let ta = Math.min(yt, topAt(ua)), tb = Math.min(yt, topAt(ub));
            if (cutH != null) { ta = Math.min(ta, cutH); tb = Math.min(tb, cutH); }
            if (ta - yb < 0.005 && tb - yb < 0.005) continue;
            ta = Math.max(ta, yb + 0.001); tb = Math.max(tb, yb + 0.001);
            const off = {};
            if (ext0 && ua === a) { off.x0p = ext0 - E.a[0]; off.x0m = ext0 - E.a[1]; }
            if (ext1 && ub === b) { off.x1p = E.b[0] - ext1; off.x1m = E.b[1] - ext1; }
            const up = upBrick && upstands.has(w.id);
            const geo = wallPrism(ub - ua, yb, ta, tb, w.t + (up ? 0.006 : 0), ua, off);
            const isCut = cutH != null && Math.max(ta, tb) >= cutH - 1e-6;
            const top = isCut ? matCut : (isNew ? matNew : endM);
            const mats = isNew ? [matNew, matNew, top, matNew, matNew, matNew] : up ? [upBrick, upBrick, isCut ? matCut : upBrick, upBrick, upBrick, upBrick] : [endM, endM, top, endM, sideMat(1, um, yb), sideMat(-1, um, yb)];
            const mesh = new THREE.Mesh(geo, mats);
            // the wall above a door: tapping it swings the door (a closed leaf is hard to hit from above)
            if (tagDoor) mesh.userData.door = tagDoor;
            mesh.userData.wallId = w.id; mesh.userData.storeyId = sid; mesh.userData.versionId = en.versionId; mesh.userData.edit = en.edit;
            const c = V.add(w.a, V.mul(d, (ua + ub) / 2));
            mesh.position.set(c[0], 0, c[1]);
            mesh.rotation.y = Math.atan2(-d[1], d[0]);
            mesh.castShadow = true; mesh.receiveShadow = true;
            g.add(mesh);
          }
        }
      };
      const solidPiece = (s0, s1, y0, y1) => {
        // split a solid piece into new/unchanged intervals for the comparison view
        if (!news.length) { piece(s0, s1, y0, y1, false); return; }
        let cur = s0;
        const inside = news.map(([x, y]) => [Math.max(x, s0), Math.min(y, s1)]).filter(([x, y]) => y - x > 0.001).sort((p, q) => p[0] - q[0]);
        for (const [x, y] of inside) {
          if (x > cur + 0.001) piece(cur, x, y0, y1, false);
          piece(x, y, y0, y1, true);
          cur = y;
        }
        if (cur < s1 - 0.001) piece(cur, s1, y0, y1, false);
      };
      for (const [s0, s1] of parts.solids) solidPiece(s0, s1, 0, H);
      for (const hl of parts.holes) {
        const op = hl.op;
        if (op.kind === 'window') {
          if (op.sill > 0.01) solidPiece(hl.s, hl.e, 0, op.sill);
          solidPiece(hl.s, hl.e, op.sill + op.h, H);
          // glass (façade windows get their frame and glass from the shell)
          const gy0 = op.sill, gy1 = Math.min(op.sill + op.h, cutH != null ? cutH : 99);
          if (gy1 > gy0 && !fromModel(w, op) && !op.leaf && this.spec.windows !== false) {
            const glass = new THREE.Mesh(new THREE.BoxGeometry(hl.e - hl.s, gy1 - gy0, 0.02), mat('glass', () => skyReflect(new THREE.MeshStandardMaterial({ color: 0xa8c8d8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1, depthWrite: false }), 0.5)));
            const c = V.add(w.a, V.mul(d, (hl.s + hl.e) / 2));
            glass.position.set(c[0], (gy0 + gy1) / 2, c[1]);
            glass.rotation.y = Math.atan2(-d[1], d[0]);
            g.add(glass);
            this.buildWindowFrame(g, w, op, hl, d, n, gy0, gy1);
          }
        } else {
          tagDoor = op.kind === 'door' ? op.id : null;
          solidPiece(hl.s, hl.e, Math.min(op.h, H), H);
          tagDoor = null;
          // façade doors come with the shell (frame + leaves); the plan draws the doors inside the house
          if (op.kind === 'door' && !fromModel(w, op) && !op.leaf && !(w.kind !== 'interior' && this.spec.windows === false)) this.buildDoorLeaves(g, w, op, hl, d, n, cutH, en, matNew);
        }
      }
    }
    // the floor goes on under doors and openings (a threshold to the outside), and outside walls are closed
    // around their openings (the cavity between the layers)
    this.buildOpeningFills(g, en, { hasShell, fromModel, cutH, endM: wallMat('#d9d6cf') });
    // demolished walls (comparison): yellow ghosts
    if (en.diff) {
      const ghost = mat('demo', () => new THREE.MeshStandardMaterial({ color: new THREE.Color(cssVar('--demo') || '#e0a800'), transparent: true, opacity: 0.45, depthWrite: false, roughness: 0.9 }));
      for (const p of en.diff.demoParts) {
        if (p.wall.storey !== sid) continue;
        const w = p.wall, d = wallDir(w);
        const H = Math.min(wallHeight(w, st), cutH != null ? cutH : 99);
        const ext0 = p.s <= 0.0005 ? w.t / 2 : 0, ext1 = p.e >= p.L - 0.0005 ? w.t / 2 : 0;
        const a = p.s - ext0, b = p.e + ext1;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(b - a, H, w.t * 0.98), ghost);
        const c = V.add(w.a, V.mul(d, (a + b) / 2));
        mesh.position.set(c[0], H / 2, c[1]);
        mesh.rotation.y = Math.atan2(-d[1], d[0]);
        g.add(mesh);
      }
    }
  }

  updateLabels() {
    if (!this.labels.length) return;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      if (this.clipPlanes && this.clipPlanes.some(p => p.distanceToPoint(l.pos) < 0)) { l.el.hidden = true; continue; }
      if (l.near && this.camera.position.distanceTo(l.pos) > l.near) { l.el.hidden = true; continue; }
      v.copy(l.pos).project(this.camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      l.el.hidden = !vis;
      if (vis) l.el.style.transform = `translate(${((v.x + 1) / 2 * this.W).toFixed(1)}px, ${((1 - v.y) / 2 * this.H).toFixed(1)}px) translate(-50%, ${l.pin ? '-100%' : '-50%'})`;
    }
  }

  /* ───────── slice ─────────
     Slices are kept per view (project + storey / all storeys / whole house) and stay on while you work.
     this.sl is the slice being placed or edited in this pane (with handles); applied slices only show their
     plane while their delete (or edit) button is hovered. */
  slices() {
    const k = this.sliceKey || '';
    let l = SLICE.sets.get(k);
    if (!l) SLICE.sets.set(k, l = []);
    return l;
  }
  /** the panes that show the same slices (compare side by side) */
  peers() { return [...SLICE.views].filter(v => v.ok && (v.sliceKey || '') === (this.sliceKey || '')); }

  activePlanes() {
    const own = this.peers().map(v => v.sl).find(s => s && s.n0);
    const list = this.slices().filter(s => !(own && own.editId === s.id)).map(s => s.plane);
    if (own) list.push(own.plane);
    return list;
  }

  isClipped(p) { return (this.clipPlanes || []).some(pl => pl.distanceToPoint(p) < -0.005); }

  applyClip() {
    // walking through the house: no slices
    const planes = this.spec && this.spec.walk ? [] : this.activePlanes();
    this.clipPlanes = planes;
    SLICE.onU.value = planes.length ? 1 : 0;
    const seen = new Set();
    this.group.traverse(o => {
      if (!o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (seen.has(m)) continue;
        seen.add(m);
        const want = (m.userData.cutClip ? [CUT_PLANE] : []).concat(planes);
        const cur = m.clippingPlanes || [];
        if (cur.length !== want.length || cur.some((p, i) => p !== want[i])) { m.clippingPlanes = want.length ? want : null; m.clipShadows = true; m.needsUpdate = true; }
        capPatch(m, planes.length > 0);
      }
    });
    this.needs = true;
  }
  reclipAll() { for (const v of this.peers()) v.applyClip(); }

  sliceSetup() {
    const host = this.host;
    SLICE.views.add(this);
    this.sliceBtn = h('button', { class: 'btn sm slice-btn', title: 'Slice through the house', 'aria-pressed': 'false', onclick: () => this.toggleSlice() }, icon('scissors'), h('span', null, 'Slice'));
    this.sliceList = h('div', { class: 'slice-list' });
    this.sliceDock = h('div', { class: 'slice-dock' }, this.sliceBtn, this.sliceList);
    this.slicePanel = h('div', { class: 'slice-panel', hidden: true });
    host.append(this.sliceDock, this.slicePanel);
    // handles: an arrow to push the plane in or out, a ring to turn it
    this.overlay = new THREE.Scene();
    const accent = new THREE.Color(cssVar('--accent') || '#0e6f78');
    const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, ...extra });
    this.gizmo = new THREE.Group();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic(accent, { opacity: 0.07, side: THREE.DoubleSide }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.7, depthTest: false }));
    this.gzPlane = new THREE.Group();
    this.gzPlane.add(quad, edge);
    const am = basic(accent, { opacity: 0.95 });
    const arrow = new THREE.Group();
    for (const sg of [1, -1]) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), am);
      shaft.position.y = sg * 0.45;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 18), am);
      head.position.y = sg * 1.02;
      if (sg < 0) head.rotation.x = Math.PI;
      arrow.add(shaft, head);
    }
    arrow.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), am));
    this.gzArrowHit = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    arrow.add(this.gzArrowHit);
    this.gzArrow = arrow;
    const ring = new THREE.Group();
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 72), basic(new THREE.Color('#E2A400'), { opacity: 0.95 })));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), basic(new THREE.Color('#E2A400'), { opacity: 0.95 }));
    knob.position.set(1, 0, 0);
    ring.add(knob);
    this.gzRingHit = new THREE.Mesh(new THREE.TorusGeometry(1, 0.14, 6, 48), new THREE.MeshBasicMaterial({ visible: false }));
    ring.add(this.gzRingHit);
    this.gzRing = ring;
    this.gizmo.add(this.gzPlane, this.gzArrow, this.gzRing);
    this.overlay.add(this.gizmo);
    // previews of applied slices (hovering their delete or edit button)
    this.pvGroup = new THREE.Group();
    this.overlay.add(this.pvGroup);
    this.pvMats = {
      delete: [basic(new THREE.Color(cssVar('--new') || '#d2372b'), { opacity: 0.16, side: THREE.DoubleSide }), new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--new') || '#d2372b'), transparent: true, opacity: 0.95, depthTest: false })],
      edit: [basic(accent, { opacity: 0.1, side: THREE.DoubleSide }), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.85, depthTest: false })],
    };
    this.pvGeo = [new THREE.PlaneGeometry(1, 1), new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1))];
    // dragging a handle; capture phase so the camera controls never see these pointers
    const ray = new THREE.Raycaster();
    const rayAt = e => {
      const rc = this.renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), this.camera);
      return ray.ray;
    };
    const handleAt = e => {
      if (!this.sl || !this.sl.n0) return null;
      if (e.target !== this.renderer.domElement) return null;
      this.updateGizmo();
      this.gizmo.updateMatrixWorld(true);
      rayAt(e);
      const hit = ray.intersectObjects([this.gzArrowHit, this.gzRingHit], false)[0];
      return hit ? (hit.object === this.gzArrowHit ? 'depth' : 'angle') : null;
    };
    const param = (kind, e) => {
      const r = rayAt(e), g = this.gzDrag;
      if (kind === 'depth') {
        // closest point on the line q + n·t to the pointer ray
        const w0 = r.origin.clone().sub(g.q), b = r.direction.dot(g.n), den = 1 - b * b;
        if (den < 1e-4) return null;
        return (g.n.dot(w0) - b * r.direction.dot(w0)) / den;
      }
      const hit = r.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.sl.axis, g.q), new THREE.Vector3());
      if (!hit) return null;
      const v = hit.sub(g.q);
      return THREE.MathUtils.radToDeg(Math.atan2(v.dot(g.e2), v.dot(g.e1)));
    };
    host.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const kind = handleAt(e);
      if (!kind) return;
      e.stopPropagation(); e.preventDefault();
      if (document.activeElement && this.slicePanel.contains(document.activeElement)) document.activeElement.blur();
      try { host.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      const { n, q } = this.sliceGeom();
      const e1 = new THREE.Vector3().crossVectors(this.sl.axis, Math.abs(this.sl.axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const e2 = new THREE.Vector3().crossVectors(this.sl.axis, e1);
      this.gzDrag = { kind, id: e.pointerId, n, q, e1, e2, depth0: this.sliceDepth(), angle0: this.sl.angle };
      const v = param(kind, e);
      this.gzDrag.start = v == null ? 0 : v;
      this.gzDrag.last = this.gzDrag.start;
      this.gzDrag.acc = 0;
      host.classList.add('slice-dragging');
    }, true);
    host.addEventListener('pointermove', e => {
      const g = this.gzDrag;
      if (!g) {
        if (e.pointerType === 'mouse' && this.sl && this.sl.n0 && !e.buttons) host.classList.toggle('slice-hover', !!handleAt(e));
        return;
      }
      if (e.pointerId !== g.id) return;
      e.stopPropagation();
      const v = param(g.kind, e);
      if (v == null) return;
      if (g.kind === 'depth') this.setSlice({ depth: g.depth0 + (v - g.start) });
      else {
        let dv = v - g.last;
        while (dv > 180) dv -= 360;
        while (dv < -180) dv += 360;
        g.acc += dv; g.last = v;
        this.setSlice({ angle: g.angle0 + g.acc });
      }
    }, true);
    const end = e => { if (this.gzDrag && e.pointerId === this.gzDrag.id) { e.stopPropagation(); this.gzDrag = null; host.classList.remove('slice-dragging'); this.setSlice({}, true); } };
    host.addEventListener('pointerup', end, true);
    host.addEventListener('pointercancel', end, true);
    // tapping the 3D view disarms a "tap again to delete"
    host.addEventListener('pointerdown', e => { if (this.armed && !this.sliceDock.contains(e.target)) this.disarm(); }, true);
    // Esc cancels the slice being placed or edited, Enter applies it (a typed value is taken first)
    this._sliceKey = e => {
      if (!this.sl || (e.key !== 'Escape' && e.key !== 'Enter') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.menu') || document.querySelector('#sheet-root > *')) return;
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && !this.slicePanel.contains(ae)) return;
      if (e.key === 'Enter' && !this.sl.n0) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { this.endDraft(); return; }
      if (ae && this.slicePanel.contains(ae) && ae.tagName === 'INPUT') { ae.dispatchEvent(new Event('change')); ae.blur(); }
      this.applySlice();
    };
    document.addEventListener('keydown', this._sliceKey, true);
    this.renderSliceList();
  }

  /** the Slice button: start a new slice (tap the house to place it), or cancel the one being placed */
  toggleSlice() {
    if (this.sl) { this.endDraft(); return; }
    for (const v of this.peers()) if (v !== this && v.sl) v.endDraft();
    this.disarm();
    this.sl = { mode: 'pick' };
    this.host.classList.add('slice-picking');
    this.renderSlicePanel();
    this.renderSliceList();
  }

  pickSlice(e) {
    const rc = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), this.camera);
    // skip what other slices have cut away
    const hit = ray.intersectObjects(this.group.children, true).find(x => x.face && !(x.object.material && x.object.material.transparent) && !this.isClipped(x.point));
    if (!hit) { this.app.toast('Tap on the house to place the slice.'); return; }
    const nf = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    if (nf.dot(ray.ray.direction) > 0) nf.negate();
    // walls and floors are square to the axes: snap a nearly straight normal
    for (const k of ['x', 'y', 'z']) if (Math.abs(nf[k]) > 0.97) { const sg = Math.sign(nf[k]); nf.set(0, 0, 0); nf[k] = sg; break; }
    const n0 = nf.clone().negate().normalize();
    if (n0.lengthSq() < 0.5) return;
    // turning: around the vertical for a wall, around the horizontal (seen from here) for a floor or ceiling
    let axis = new THREE.Vector3(0, 1, 0);
    if (Math.abs(n0.y) > 0.7) {
      const fwd = this.controls.target.clone().sub(this.camera.position).setY(0);
      axis = fwd.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : fwd.normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
    }
    const box = this.homeBox || new THREE.Box3().setFromObject(this.group);
    const size = box.getSize(new THREE.Vector3()).length();
    // the slice turns around its middle: the point of the plane closest to the middle of the house
    this.sl = { editId: null, p0: hit.point.clone(), n0, n: n0.clone(), axis, angle: 0, size: Math.max(4, size * 0.75),
      center: box.getCenter(new THREE.Vector3()), q: hit.point.clone().addScaledVector(n0, -0.01), plane: new THREE.Plane() };
    this.centerSlice();
    this.host.classList.remove('slice-picking');
    this.updateSlicePlane();
    this.reclipAll();
    this.renderSlicePanel();
    this.renderSliceList();
  }

  /** keep the slice: it stays on (without its plane and handles) while you carry on working */
  applySlice() {
    const s = this.sl;
    if (!s || !s.n0) return;
    const list = this.slices();
    let t = s.editId && list.find(x => x.id === s.editId);
    if (!t) { t = { id: ++SLICE.seq, num: list.reduce((m, x) => Math.max(m, x.num), 0) + 1, plane: new THREE.Plane() }; list.push(t); }
    for (const k of ['p0', 'n0', 'n', 'axis', 'q', 'center']) t[k] = s[k].clone();
    t.angle = s.angle; t.size = s.size;
    t.plane.copy(s.plane);
    this.endDraft();
    this.app.persistSlices(this.sliceKey, list);
  }

  /** stop placing / editing; an edited slice keeps its last applied position */
  endDraft() {
    this.sl = null;
    this.gzDrag = null;
    this.host.classList.remove('slice-picking', 'slice-hover', 'slice-dragging');
    this.reclipAll();
    this.renderSlicePanel();
    for (const v of this.peers()) v.renderSliceList();
    this.needs = true;
  }

  editSlice(id) {
    const t = this.slices().find(x => x.id === id);
    if (!t) return;
    if (this.sl && this.sl.editId === id) return;
    for (const v of this.peers()) if (v.sl) { v.sl = null; v.gzDrag = null; v.host.classList.remove('slice-picking', 'slice-hover', 'slice-dragging'); v.renderSlicePanel(); }
    this.disarm();
    this.sl = { editId: id, num: t.num, angle: t.angle, size: t.size, plane: t.plane.clone() };
    for (const k of ['p0', 'n0', 'n', 'axis', 'q', 'center']) this.sl[k] = t[k].clone();
    this.setPreview(null);
    this.reclipAll();
    this.renderSlicePanel();
    for (const v of this.peers()) v.renderSliceList();
  }

  deleteSlices(ids) {
    const list = this.slices();
    for (const id of ids) { const i = list.findIndex(x => x.id === id); if (i >= 0) list.splice(i, 1); }
    for (const v of this.peers()) {
      v.setPreview(null);
      v.armed = null;
      if (v.sl && v.sl.editId && ids.includes(v.sl.editId)) { v.sl = null; v.gzDrag = null; v.renderSlicePanel(); }
    }
    this.reclipAll();
    for (const v of this.peers()) v.renderSliceList();
    this.app.persistSlices(this.sliceKey, list);
  }

  /** show the planes of applied slices for a moment (hovering delete or edit) */
  setPreview(ids, kind = 'delete') {
    const want = ids && ids.length ? { ids, kind } : null;
    if (JSON.stringify(want) === JSON.stringify(this.slPreview || null)) return;
    this.slPreview = want;
    this.needs = true;
  }

  updatePreview() {
    const g = this.pvGroup;
    const pv = this.slPreview;
    const show = pv ? this.slices().filter(s => pv.ids.includes(s.id)) : [];
    while (g.children.length < show.length * 2) g.add(new THREE.Mesh(this.pvGeo[0]), new THREE.LineSegments(this.pvGeo[1]));
    const Z = new THREE.Vector3(0, 0, 1);
    g.children.forEach((o, i) => {
      const s = show[i >> 1];
      o.visible = !!s;
      if (!s) return;
      o.material = this.pvMats[pv.kind][i & 1];
      o.position.copy(s.q);
      o.quaternion.setFromUnitVectors(Z, s.n);
      o.scale.setScalar(s.size);
    });
  }

  disarm() {
    if (!this.armed) return;
    const b = this.armed;
    this.armed = null;
    clearTimeout(b._t);
    b.classList.remove('armed');
    b.dataset.tip = b.dataset.tip0;
    this.setPreview(null);
  }

  renderSliceList() {
    if (!this.sliceList) return;
    const list = this.slices();
    const sig = list.map(s => s.id).join(',') + '|' + (this.sl ? (this.sl.editId || (this.sl.n0 ? 'new' : 'pick')) : '');
    if (sig === this._sliceSig) return;
    this._sliceSig = sig;
    this.armed = null;
    const box = this.sliceList;
    box.textContent = '';
    this.sliceBtn.setAttribute('aria-pressed', String(!!(this.sl && !this.sl.editId)));
    this.sliceBtn.lastChild.textContent = list.length ? 'Add slice' : 'Slice';
    this.sliceBtn.title = list.length ? 'Add another slice' : 'Slice through the house';
    // a delete button: hover (mouse) previews the plane, click deletes; on touch the first tap previews, the second deletes
    const delBtn = (ids, cls, tip, label, ...kids) => {
      let ptype = 'mouse';
      const b = h('button', { class: cls, 'data-tip': tip, 'aria-label': label }, ...kids);
      b.dataset.tip0 = tip;
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.setPreview(ids, 'delete'); });
      b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.armed !== b) this.setPreview(null); });
      b.addEventListener('pointerdown', e => { ptype = e.pointerType; });
      b.addEventListener('click', () => {
        if (ptype !== 'mouse' && this.armed !== b) {
          this.disarm();
          this.armed = b;
          b.classList.add('armed');
          b.dataset.tip = 'Tap again to delete';
          this.setPreview(ids, 'delete');
          b._t = setTimeout(() => { if (this.armed === b) this.disarm(); }, 4000);
          return;
        }
        this.deleteSlices(ids);
      });
      return b;
    };
    for (const s of list) {
      const editing = !!(this.sl && this.sl.editId === s.id);
      const ed = h('button', { class: 'sl-ic', 'data-tip': editing ? 'Editing slice ' + s.num : 'Edit slice ' + s.num, 'aria-label': 'Edit slice ' + s.num, onclick: () => this.editSlice(s.id) }, icon('edit'));
      ed.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !editing) this.setPreview([s.id], 'edit'); });
      ed.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.armed) this.setPreview(null); });
      const del = delBtn([s.id], 'sl-ic del', 'Delete slice ' + s.num, 'Delete slice ' + s.num, icon('trash'));
      // a flat section drawing of it (not for the storeys side by side)
      const scope = (this.sliceKey || '').split('|')[1];
      const drw = this.app && this.app.drawingsSheet && scope !== 'side' && !this.opts.mini ? h('button', { class: 'sl-ic sl-draw', 'data-tip': t('Section drawing'), 'aria-label': t('Section drawing of slice') + ' ' + s.num, onclick: () => this.app.drawingsSheet({ slice: s }) }, icon('ruler')) : null;
      box.append(h('div', { class: 'sl-row' + (editing ? ' editing' : '') }, ed, h('span', { class: 'sl-name' }, 'Slice ' + s.num), drw, del));
    }
    if (list.length > 1) box.append(h('div', { class: 'sl-row sl-all' }, delBtn(list.map(s => s.id), 'btn sm ghost sl-allbtn', 'Delete all slices', 'Delete all slices', icon('trash'), h('span', null, 'Delete all'))));
  }

  sliceGeom() { return { n: this.sl.n.clone(), q: this.sl.q.clone() }; }
  /** depth: how far the plane is from where it was tapped, measured along its normal */
  sliceDepth() { return this.sl.q.clone().sub(this.sl.p0).dot(this.sl.n); }
  /** move the handle point within the plane to the middle of the house (the plane itself stays) */
  centerSlice() {
    const s = this.sl;
    s.q = s.center.clone().addScaledVector(s.n, -s.center.clone().sub(s.q).dot(s.n));
  }

  depthRange() {
    const box = this.homeBox, s = this.sl;
    if (!box || !s || !s.n0) return [-1, 20];
    const { n } = this.sliceGeom();
    let lo = Infinity, hi = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const t = new THREE.Vector3(x, y, z).sub(s.p0).dot(n);
      lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    return [Math.floor((lo - 0.3) * 10) / 10, Math.ceil((hi + 0.3) * 10) / 10];
  }

  setSlice(patch, commit = false) {
    const s = this.sl;
    if (!s || !s.n0) return;
    if (patch.angle != null && isFinite(patch.angle)) {
      // turn around the middle point of the slice; the plane keeps passing through it
      const a = Math.max(-180, Math.min(180, patch.angle)), da = a - s.angle;
      if (da) { s.n.applyAxisAngle(s.axis, THREE.MathUtils.degToRad(da)).normalize(); s.angle = a; }
    }
    if (patch.depth != null && isFinite(patch.depth)) {
      const [lo, hi] = this.depthRange();
      s.q.addScaledVector(s.n, Math.max(lo, Math.min(hi, patch.depth)) - this.sliceDepth());
    }
    if (commit) this.centerSlice();
    this.updateSlicePlane();
    this.syncSliceInputs();
  }

  updateSlicePlane() {
    const { n, q } = this.sliceGeom();
    this.sl.plane.setFromNormalAndCoplanarPoint(n, q);
    for (const v of this.peers()) v.needs = true;
    this.needs = true;
  }

  updateGizmo() {
    if (!this.sl || !this.sl.n0) return;
    const { n, q } = this.sliceGeom();
    const k = this.camera.position.distanceTo(q) * 0.075;
    const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    this.gzArrow.position.copy(q);
    this.gzArrow.quaternion.setFromUnitVectors(Y, n);
    this.gzArrow.scale.setScalar(k);
    this.gzRing.position.copy(q);
    this.gzRing.quaternion.setFromUnitVectors(Z, this.sl.axis);
    this.gzRing.scale.setScalar(k * 1.5);
    this.gzPlane.position.copy(q);
    this.gzPlane.quaternion.setFromUnitVectors(Z, n);
    this.gzPlane.scale.setScalar(this.sl.size);
  }

  flipSlice() {
    if (!this.sl || !this.sl.n0) return;
    this.sl.n.negate();
    this.updateSlicePlane();
    this.syncSliceInputs();
  }

  renderSlicePanel() {
    const box = this.slicePanel;
    box.textContent = '';
    this.sliceInputs = null;
    box.hidden = !this.sl;
    this.host.classList.toggle('slicing', !!this.sl);
    if (!this.sl) return;
    if (this.sl.mode === 'pick') {
      box.append(h('div', { class: 'sp-row' }, icon('scissors'), h('span', { class: 'sp-hint' }, 'Tap a wall, floor or roof where the slice should start (Esc cancels).'),
        h('button', { class: 'btn sm ghost', onclick: () => this.endDraft() }, 'Cancel')));
      return;
    }
    const [lo, hi] = this.depthRange();
    const num = (value, step, onv) => { const i = h('input', { type: 'number', class: 'sp-num', step, value, inputmode: 'decimal' }); i.addEventListener('change', () => onv(parseFloat(String(i.value).replace(',', '.')), true)); return i; };
    const range = (min, max, step, value, onv) => { const i = h('input', { type: 'range', class: 'sp-range', min, max, step, value }); i.addEventListener('input', () => onv(parseFloat(i.value), false)); i.addEventListener('change', () => onv(parseFloat(i.value), true)); return i; };
    const depth = this.sliceDepth();
    const dNum = num(depth.toFixed(2), 0.05, (v, c) => this.setSlice({ depth: v }, c));
    const dRange = range(lo, hi, 0.01, depth, (v, c) => this.setSlice({ depth: v }, c));
    const aNum = num(Math.round(this.sl.angle), 1, (v, c) => this.setSlice({ angle: v }, c));
    const aRange = range(-180, 180, 1, this.sl.angle, (v, c) => this.setSlice({ angle: v }, c));
    this.sliceInputs = { dNum, dRange, aNum, aRange };
    const title = this.sl.editId ? 'Slice ' + this.sl.num : 'New slice';
    box.append(
      h('div', { class: 'sp-row sp-head' }, icon('scissors'), h('b', null, title), h('span', { class: 'sp-hint' }, 'Drag the arrow or the ring, or type a value. Enter applies, Esc cancels.'),
        h('button', { class: 'btn sm ghost icon', 'aria-label': 'Cut away the other side', title: 'Cut away the other side', onclick: () => this.flipSlice() }, icon('flip')),
        h('button', { class: 'btn sm ghost', title: (this.sl.editId ? 'Keep the slice as it was' : 'Throw this slice away') + ' (Esc)', onclick: () => this.endDraft() }, 'Cancel'),
        h('button', { class: 'btn sm primary sp-apply', title: 'Keep this slice on while you work (Enter)', onclick: () => this.applySlice() }, icon('check'), 'Apply')),
      h('label', { class: 'sp-row' }, h('span', { class: 'sp-lbl' }, 'Depth'), dNum, h('span', { class: 'sp-unit' }, 'm'), dRange),
      h('label', { class: 'sp-row' }, h('span', { class: 'sp-lbl' }, 'Angle'), aNum, h('span', { class: 'sp-unit' }, '°'), aRange));
  }

  syncSliceInputs() {
    const s = this.sliceInputs;
    if (!s || !this.sl) return;
    const depth = this.sliceDepth(), [lo, hi] = this.depthRange();
    s.dRange.min = String(lo); s.dRange.max = String(hi);
    if (document.activeElement !== s.dNum) s.dNum.value = depth.toFixed(2);
    if (document.activeElement !== s.aNum) s.aNum.value = String(Math.round(this.sl.angle));
    s.dRange.value = String(depth);
    s.aRange.value = String(this.sl.angle);
  }

}
