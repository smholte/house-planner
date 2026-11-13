/* ───────────── renato.js — the Renato modular sofa of Inhouse, element by element ─────────────
   From Inhouse's model sheet (Renato modeloverzicht, version 141024LV2V) and product page: depth 100 cm, seat height
   44, seat depth 60, back 85; arms 20 cm wide (3-seater 180 without arms, 200 with one, 220 with two); black metal
   legs, HR foam in the seat, a roll behind the back cushions; many fabrics and colours. Every element of the sheet is a
   furniture type (category 'Renato sofa (Inhouse)') that stands next to the others to make any arrangement; a ready set
   (the corner sofa the shop sells) is renatoShopSet(). The arm height (60) and the shapes of the round
   pieces are taken from the drawings of the sheet (not given as numbers).

   An element is described in its own frame (x right, y to the FRONT, the back at y = -d/2; 'left' as you look at the
   front of the sofa: -x) by plan shapes – the outline, the back and arm bands, the seat cushions, the back cushions,
   the rolls and the legs – and both the 2D symbol and the 3D model are made from them. */

const RN = { B: 0.2, A: 0.2, C: 0.2, legH: 0.12, base: 0.3, seat: 0.46, backTop: 0.66, armTop: 0.6, cushTop: 0.85, roll: 0.07 };
const RENATO_COLOR = '#868A72';      // the olive green of the sofa in your photo (as it shows in the app's light)

/* the elements: [id, name, w, d, shape, options] */
const RENATO_ELEMENTS = [
  ['3z', '3-seater without arms', 1.8, 1.0, 'straight', { n: 2 }],
  ['3zL', '3-seater, arm left', 2.0, 1.0, 'straight', { n: 2, armL: true }],
  ['3zR', '3-seater, arm right', 2.0, 1.0, 'straight', { n: 2, armR: true }],
  ['3zB', '3-seater sofa (two arms)', 2.2, 1.0, 'straight', { n: 2, armL: true, armR: true }],
  ['25z', '2.5-seater without arms', 1.6, 1.0, 'straight', { n: 2 }],
  ['25zL', '2.5-seater, arm left', 1.8, 1.0, 'straight', { n: 2, armL: true }],
  ['25zR', '2.5-seater, arm right', 1.8, 1.0, 'straight', { n: 2, armR: true }],
  ['25zB', '2.5-seater sofa (two arms)', 2.0, 1.0, 'straight', { n: 2, armL: true, armR: true }],
  ['2z', '2-seater without arms', 1.4, 1.0, 'straight', { n: 2 }],
  ['2zL', '2-seater, arm left', 1.6, 1.0, 'straight', { n: 2, armL: true }],
  ['2zR', '2-seater, arm right', 1.6, 1.0, 'straight', { n: 2, armR: true }],
  ['2zB', '2-seater sofa (two arms)', 1.8, 1.0, 'straight', { n: 2, armL: true, armR: true }],
  ['15z', '1.5-seater without arms', 0.8, 1.0, 'straight', { n: 1 }],
  ['15zL', '1.5-seater, arm left', 1.0, 1.0, 'straight', { n: 1, armL: true }],
  ['15zR', '1.5-seater, arm right', 1.0, 1.0, 'straight', { n: 1, armR: true }],
  ['love', 'Loveseat (1.5-seater, two arms)', 1.2, 1.0, 'straight', { n: 1, armL: true, armR: true }],
  ['1z', '1-seater', 0.7, 1.0, 'straight', { n: 1 }],
  ['corner', 'Corner element', 1.0, 1.0, 'corner', {}],
  ['cround', 'Round corner element', 1.11, 1.11, 'cround', {}],
  ['islL', 'Round island, left', 1.36, 1.28, 'island', {}],
  ['islR', 'Round island, right', 1.36, 1.28, 'island', { mirror: true }],
  ['lcrL', 'Corner + round island (longchair), left', 1.0, 2.3, 'longround', {}],
  ['lcrR', 'Corner + round island (longchair), right', 1.0, 2.3, 'longround', { mirror: true }],
  ['lcaL', 'Longchair with arm (divan), left', 1.13, 1.82, 'longarm', {}],
  ['lcaR', 'Longchair with arm (divan), right', 1.13, 1.82, 'longarm', { mirror: true }],
  ['ottL', '1-seater with island (ottoman), left', 1.0, 1.35, 'ottoman', {}],
  ['ottR', '1-seater with island (ottoman), right', 1.0, 1.35, 'ottoman', { mirror: true }],
  ['h80', 'Footstool 70 × 80', 0.7, 0.8, 'hocker', {}],
  ['h90', 'Footstool 70 × 90', 0.7, 0.9, 'hocker', {}],
  ['h100', 'Footstool 70 × 100', 0.7, 1.0, 'hocker', {}],
];
const RENATO_TYPES = RENATO_ELEMENTS.map(([id, name, w, d, shape, o]) => ({ id: 'renato_' + id, cat: 'renato', name: 'Renato – ' + name, kind: 'modsofa', shape, ...o, w, d, h: shape === 'hocker' ? 0.44 : RN.cushTop, color: RENATO_COLOR, front: shape === 'hocker' ? 0.3 : 0.6, brand: 'Inhouse' }));
FURN_CATS.push(['renato', 'Renato sofa (Inhouse)']);
for (const T of RENATO_TYPES) { FURN_TYPES.push(T); FURN[T.id] = T; }

/* ───────── plan shapes ───────── */
const rnRect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rnArc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
/** a ring sector (r0 = 0: a pie slice) */
function rnSector(cx, cy, r0, r1, a0, a1) {
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 18)));
  const outer = rnArc(cx, cy, r1, a0, a1, n);
  return r0 > 0.005 ? outer.concat(rnArc(cx, cy, r0, a1, a0, n)) : outer.concat([[cx, cy]]);
}
/** the parts of an element at size w × d */
function renatoParts(T, w, d) {
  const X = w / 2, Y = d / 2, B = RN.B, A = Math.min(RN.A, w * 0.2), C = RN.C, P = { outline: null, backs: [], arms: [], seats: [], cush: [], rolls: [], legs: [] };
  const H = Math.PI;
  const corners = (x0, y0, x1, y1, i = 0.07) => [[x0 + i, y0 + i], [x1 - i, y0 + i], [x1 - i, y1 - i], [x0 + i, y1 - i]];
  switch (T.shape) {
    case 'straight': {
      const l = T.armL ? A : 0, r = T.armR ? A : 0, n = T.n || 1;
      P.outline = rnRect(-X, -Y, X, Y);
      P.backs.push(rnRect(-X, -Y, X, -Y + B));
      if (T.armL) P.arms.push(rnRect(-X, -Y + B, -X + A, Y));
      if (T.armR) P.arms.push(rnRect(X - A, -Y + B, X, Y));
      const x0 = -X + l, x1 = X - r, sw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) { P.seats.push(rnRect(x0 + sw * i, -Y + B, x0 + sw * (i + 1), Y)); P.cush.push(rnRect(x0 + sw * i, -Y + B, x0 + sw * (i + 1), -Y + B + C)); }
      P.rolls.push([[x0, -Y + B / 2], [x1, -Y + B / 2]]);
      P.legs = corners(-X, -Y, X, Y);
      if (w > 1.5) P.legs.push([0, -Y + 0.07], [0, Y - 0.07]);
      break;
    }
    case 'corner': {
      P.outline = rnRect(-X, -Y, X, Y);
      P.backs.push(rnRect(-X, -Y, X, -Y + B), rnRect(-X, -Y + B, -X + B, Y));
      P.seats.push(rnRect(-X + B, -Y + B, X, Y));
      P.cush.push(rnRect(-X + B, -Y + B, X, -Y + B + C), rnRect(-X + B, -Y + B + C, -X + B + C, Y));
      P.rolls.push([[-X + B / 2, Y], [-X + B / 2, -Y + B / 2], [X, -Y + B / 2]]);
      P.legs = corners(-X, -Y, X, Y);
      break;
    }
    case 'cround': {
      // a quarter ring round the front-right corner: its ends (front and right) meet straight elements
      const cx = X, cy = Y, R = Math.min(w, d), r0 = Math.max(0.02, R - 1.0);
      P.outline = rnSector(cx, cy, r0, R, H, 1.5 * H);
      P.backs.push(rnSector(cx, cy, R - B, R, H, 1.5 * H));
      P.seats.push(rnSector(cx, cy, r0, R - B, H, 1.25 * H), rnSector(cx, cy, r0, R - B, 1.25 * H, 1.5 * H));
      P.cush.push(rnSector(cx, cy, R - B - C, R - B, H, 1.25 * H), rnSector(cx, cy, R - B - C, R - B, 1.25 * H, 1.5 * H));
      P.rolls.push(rnArc(cx, cy, R - B / 2, H, 1.5 * H, 18));
      P.legs = [[cx - R + 0.07, cy - 0.07], [cx - r0 - 0.04, cy - 0.07], [cx - 0.07, cy - R + 0.07], [cx - 0.07, cy - r0 - 0.04], [cx + (R - 0.1) * Math.cos(1.25 * H), cy + (R - 0.1) * Math.sin(1.25 * H)]];
      break;
    }
    case 'island': {
      // flat at the right (meets a sofa), round at the left; the back runs along the top and round the left end
      const rr = Y, cx = -X + rr, cy = 0, aEnd = 0.67 * H;
      P.outline = rnRect(cx, -Y, X, Y).slice(1, 3).concat([[cx, Y]], rnArc(cx, cy, rr, 0.5 * H, 1.5 * H, 20).slice(1, -1), [[cx, -Y]]);
      P.backs.push(rnRect(cx, -Y, X, -Y + B), rnSector(cx, cy, rr - B, rr, aEnd, 1.5 * H));
      P.seats.push([[X, -Y + B], [X, Y], [cx, Y]].concat(rnArc(cx, cy, rr, 0.5 * H, aEnd, 4).slice(1), rnArc(cx, cy, rr - B, aEnd, 1.5 * H, 14)));
      P.cush.push(rnRect(cx, -Y + B, X, -Y + B + C), rnSector(cx, cy, rr - B - C, rr - B, 0.9 * H, 1.5 * H));
      P.rolls.push([[X, -Y + B / 2], [cx, -Y + B / 2]].concat(rnArc(cx, cy, rr - B / 2, 1.5 * H, aEnd, 14).slice(1)));
      P.legs = [[X - 0.07, -Y + 0.07], [X - 0.07, Y - 0.07], [cx, -Y + 0.07], [cx, Y - 0.07], [-X + 0.07, 0]];
      break;
    }
    case 'longround': {
      // a corner with a long island to the front: the back along the top and down the left, round at the top-left
      const rr = 0.5, cx = -X + rr, cy = -Y + rr, yb = -Y + 1.0, ye = Y - 0.45;
      P.outline = [[X, -Y], [X, Y], [-X, Y], [-X, cy]].concat(rnArc(cx, cy, rr, H, 1.5 * H, 10).slice(1));
      P.backs.push(rnRect(cx, -Y, X, -Y + B), rnSector(cx, cy, rr - B, rr, H, 1.5 * H), rnRect(-X, cy, -X + B, yb));
      P.arms.push(rnRect(-X, yb, -X + B, ye));
      P.seats.push([[X, -Y + B], [X, yb], [-X + B, yb], [-X + B, cy]].concat(rnArc(cx, cy, rr - B, H, 1.5 * H, 8).slice(1)), [[X, yb], [X, Y], [-X, Y], [-X, ye], [-X + B, ye], [-X + B, yb]]);
      P.cush.push(rnRect(cx, -Y + B, X, -Y + B + C), rnSector(cx, cy, Math.max(0.03, rr - B - C), rr - B, H, 1.5 * H), rnRect(-X + B, cy, -X + B + C, yb));
      P.rolls.push([[-X + B / 2, yb], [-X + B / 2, cy]].concat(rnArc(cx, cy, rr - B / 2, H, 1.5 * H, 10).slice(1), [[X, -Y + B / 2]]));
      P.legs = [[X - 0.07, -Y + 0.07], [X - 0.07, Y - 0.07], [-X + 0.07, Y - 0.07], [-X + 0.09, -Y + 0.15], [X - 0.07, 0], [-X + 0.07, 0.1]];
      break;
    }
    case 'longarm': {
      P.outline = rnRect(-X, -Y, X, Y);
      P.backs.push(rnRect(-X, -Y, X, -Y + B));
      P.arms.push(rnRect(-X, -Y + B, -X + A, Y));
      P.seats.push(rnRect(-X + A, -Y + B, X, Y));
      P.cush.push(rnRect(-X + A, -Y + B, X, -Y + B + C));
      P.rolls.push([[-X + A, -Y + B / 2], [X, -Y + B / 2]]);
      P.legs = corners(-X, -Y, X, Y).concat([[-X + 0.07, 0], [X - 0.07, 0]]);
      break;
    }
    case 'ottoman': {
      P.outline = rnRect(-X, -Y, X, Y);
      P.backs.push(rnRect(-X, -Y, X, -Y + B), rnRect(-X, -Y + B, -X + B, -Y + 0.65));
      P.seats.push(rnRect(-X, -Y + B, X, Y));
      P.cush.push(rnRect(-X + B, -Y + B, X, -Y + B + C));
      P.rolls.push([[-X + B / 2, -Y + 0.65], [-X + B / 2, -Y + B / 2], [X, -Y + B / 2]]);
      P.legs = corners(-X, -Y, X, Y);
      break;
    }
    default: {   // hocker
      P.outline = rnRect(-X, -Y, X, Y);
      P.seats.push(rnRect(-X, -Y, X, Y));
      P.legs = corners(-X, -Y, X, Y);
    }
  }
  if (T.mirror) {
    const m = poly => poly.map(([x, y]) => [-x, y]).reverse();
    for (const k of ['backs', 'arms', 'seats', 'cush']) P[k] = P[k].map(m);
    P.outline = m(P.outline);
    P.rolls = P.rolls.map(m);
    P.legs = P.legs.map(([x, y]) => [-x, y]);
  }
  return P;
}

/* ───────── 2D symbol ───────── */
function renatoSymbol(it) {
  const T = furnType(it), P = renatoParts(T, it.w, it.d);
  const path = (poly, close = true) => 'M' + poly.map(([x, y]) => fx(x) + ' ' + fx(y)).join('L') + (close ? 'Z' : '');
  const out = [{ d: path(P.outline), c: 'o' }];
  for (const q of P.backs) out.push({ d: path(q), c: 'l' });
  for (const q of P.arms) out.push({ d: path(q), c: 'l' });
  for (const q of P.seats) out.push({ d: path(q), c: 'l' });
  for (const q of P.cush) out.push({ d: path(q), c: 'd' });
  return out;
}

/* ───────── 3D ───────── */
/** the polygon moved inwards by r (its corners along their bisectors) */
function rnInset(poly, r) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const s = a > 0 ? 1 : -1, n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = V.norm(V.sub(p1, p0)), e2 = V.norm(V.sub(p2, p1));
    const n1 = [-e1[1] * s, e1[0] * s], n2 = [-e2[1] * s, e2[0] * s];
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(m[0], m[1]);
    if (ml < 1e-6) { out.push(p1); continue; }
    m = [m[0] / ml, m[1] / ml];
    const k = Math.min(3 * r, r / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]));
    out.push([p1[0] + m[0] * k, p1[1] + m[1] * k]);
  }
  return out;
}
/** a soft block: the plan shape from z0 to z1, its edges rounded by r */
function rnPrism(poly, z0, z1, r, mat) {
  const clean = poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  const ins = rnInset(clean, r);
  const shape = new THREE.Shape(ins.map(([x, y]) => new THREE.Vector2(x, -y)));
  const bt = Math.min(r, (z1 - z0) / 2 - 0.002);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.002, z1 - z0 - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: r, bevelSegments: 3, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, z0 + bt, 0);
  geo.computeVertexNormals();
  const me = new THREE.Mesh(geo, mat);
  me.castShadow = true; me.receiveShadow = true;
  return me;
}
/** a roll along a path (straight pieces), lying on the back */
function rnRoll(path, y, r, mat, g) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.01) continue;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L + (i > 1 ? r * 0.6 : 0), 16), mat);
    c.rotation.z = Math.PI / 2;
    c.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.rotation.order = 'YZX';
    c.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    c.castShadow = true; c.receiveShadow = true;
    g.add(c);
  }
}
function renatoMesh(it) {
  const T = furnType(it), P = renatoParts(T, it.w, it.d), col = it.color || T.color;
  const g = new THREE.Group();
  const sy = it.h > 0 && T.h > 0 ? it.h / T.h : 1;      // a piece made higher or lower: the heights scale with it
  const fab = libSet('Fabric028');
  const M = (f, c = col) => (fab ? libMaterial('Fabric028', { tint: tint(c, f), contrast: 0.9 }) : fmat(tint(c, f)));
  const frame = M(0.86), seat = M(1.02), back = M(1.0), roll = M(0.94);
  const legM = fmat('#1B1C1E', { rough: 0.45, metal: 0.5 });
  const Z = v => v * sy;
  for (const q of [P.outline]) g.add(rnPrism(q, Z(RN.legH), Z(RN.base), 0.025, frame));
  for (const q of P.backs) g.add(rnPrism(q, Z(RN.base - 0.02), Z(RN.backTop), 0.04, frame));
  for (const q of P.arms) g.add(rnPrism(q, Z(RN.base - 0.02), Z(RN.armTop), 0.045, frame));
  // loose cushions: a little apart, soft at every edge
  for (const q of P.seats) g.add(rnPrism(rnInset(q, 0.006), Z(RN.base - 0.01), Z(RN.seat), 0.055, seat));
  for (const q of P.cush) g.add(rnPrism(rnInset(q, 0.008), Z(RN.seat - 0.03), Z(RN.cushTop), 0.075, back));
  for (const path of P.rolls) rnRoll(path, Z(RN.backTop + RN.roll * 0.7), RN.roll, roll, g);
  // black metal legs: a slim post under a small plate
  for (const [x, y] of P.legs) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.025, Z(RN.legH) - 0.006, 0.025), legM);
    post.position.set(x, (Z(RN.legH) - 0.006) / 2, y); post.castShadow = true;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.05), legM);
    plate.position.set(x, Z(RN.legH) - 0.003, y);
    g.add(post, plate);
  }
  return rnMerge(g);
}
/** one mesh per material (and shadow setting): a piece is 20–60 parts, drawn in 4–5 goes instead of one go per part
 *  (the phone draws the corner sofa in 15 instead of 95; batchGeometry is batch.js's). userData.soft: the soft
 *  blocks (frame, backs, arms, cushions) in a mesh */
function rnMerge(g) {
  const buckets = new Map();
  for (const o of g.children) {
    if (!o.isMesh) continue;
    o.updateMatrix();
    const geo = o.geometry, names = ['position', 'normal', ...(geo.attributes.uv ? ['uv'] : [])];
    const key = o.material.uuid + '|' + names.join(',') + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { m: o.material, names, cast: o.castShadow, receive: o.receiveShadow, items: [], soft: 0 });
    b.items.push({ g: geo, M: o.matrix.clone(), start: 0, count: Infinity });
    if (geo.type === 'ExtrudeGeometry') b.soft++;
  }
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const geo = batchGeometry(b);
    if (!geo) continue;
    const me = new THREE.Mesh(geo, b.m);
    me.castShadow = b.cast; me.receiveShadow = b.receive; me.userData.soft = b.soft;
    out.add(me);
    for (const it of b.items) it.g.dispose();
  }
  return out;
}

/* ───────── the corner sofa the shop sells, as a set: round island left + 2-seater without arms + corner with
   round island right (376 × 230) ───────── */
function renatoShopSet() {
  const w1 = 1.36, w2 = 1.4, w3 = 1.0, W = w1 + w2 + w3, x0 = -W / 2;
  const it = (id, x, y, d) => { const T = FURN['renato_' + id]; return { type: T.id, rot: 0, w: T.w, d: T.d, h: T.h, color: RENATO_COLOR, shop: { store: 'Inhouse', note: 'Renato' }, dx: +x.toFixed(3), dy: +y.toFixed(3) }; };
  // the backs in one line (y = 0 is the back of the set's bounding box, 2.30 deep; its middle at 1.15)
  const top = -1.15;
  return { id: 'fs_renato_shop', name: 'Renato corner sofa (Inhouse, as in the shop)', created: Date.UTC(2026, 10, 4, 21), items: [
    it('islL', x0 + w1 / 2, top + 1.28 / 2),
    it('2z', x0 + w1 + w2 / 2, top + 0.5),
    it('lcrR', x0 + w1 + w2 + w3 / 2, top + 1.15),
  ] };
}
