/* ───────────── kitchen.js — the kitchen builder: runs along a wall, tall walls, corners and two-sided islands ─────────────
   A run is one furniture item (kind 'krun') with it.units = [{k, w, …}] from left to right (seen from the front). Each
   unit is a column: under the worktop (doors, drawers, sink, hob, dishwasher, oven, a blind corner unit, open shelves,
   free space), tall (tall cupboard, fridge, oven tower with your own stack of appliances, a niche for a free-standing
   fridge with cupboards above), standing on the worktop (a cupboard from the worktop up), or a filler / 19 mm side panel.
   Under the units: a plinth; over the low ones: the worktop (with the sink, tap, hob, downdraft); along a wall: wall
   cabinets and a hood; above the tall ones: a bulkhead up to the ceiling (with ventilation grilles above a niche).
   An island (it.island) has its main row facing −y and, when it.back is set, a second row facing +y (cupboards that
   open to the back or, at the ends, to the ends); the worktop covers the whole depth, the rest is the overhang (+y).
   The look of a run: fronts (colour, wood grain), handles (none = push to open, bar, knob, rail, profile; colour),
   cabinet colour, plinth (colour, height), worktop (material, colour, thickness, height), sink and tap colours.
   The fronts of each unit (unitFaces) are the same in 3D, in the front view of the builder and in the plan. */

const RUN_UNITS = {
  base:    { name: 'Doors', w: 0.6, zone: 'base' },
  drawers: { name: 'Drawers', w: 0.6, zone: 'base' },
  sink:    { name: 'Sink', w: 0.8, zone: 'base' },
  hob:     { name: 'Hob', w: 0.8, zone: 'base' },
  dw:      { name: 'Dishwasher', w: 0.6, zone: 'base' },
  oven:    { name: 'Oven', w: 0.6, zone: 'base' },
  corner:  { name: 'Corner unit (blind)', w: 1.15, zone: 'base' },
  open:    { name: 'Open shelves', w: 0.3, zone: 'base' },
  endbox:  { name: 'Cupboard opening to the end', w: 0.4, zone: 'base', island: true },
  gap:     { name: 'Free space', w: 0.6, gap: true, zone: 'base' },
  tall:    { name: 'Tall cupboard', w: 0.6, tall: true, zone: 'tall' },
  fridge:  { name: 'Fridge (tall)', w: 0.6, tall: true, zone: 'tall' },
  ovens:   { name: 'Oven tower', w: 0.6, tall: true, zone: 'tall' },
  niche:   { name: 'Niche for a free-standing fridge', w: 0.996, tall: true, zone: 'tall' },
  onbox:   { name: 'Cupboard on the worktop', w: 0.6, top: true, zone: 'top' },
  filler:  { name: 'Filler', w: 0.05, zone: 'fill' },
  panel:   { name: 'Side panel (19 mm)', w: 0.019, zone: 'fill' },
};
const KZONES = [['base', 'Under the worktop'], ['tall', 'Tall units'], ['top', 'On the worktop'], ['fill', 'Fillers and panels']];
const RUN_DEFAULT = [['fridge', 0.6], ['drawers', 0.6], ['sink', 0.8], ['dw', 0.6], ['hob', 0.8], ['drawers', 0.6]];
const ISLAND_DEFAULT = [['drawers', 0.6], ['base', 0.6], ['base', 0.6], ['drawers', 0.6]];
const K_WIDTHS = [0.15, 0.3, 0.4, 0.45, 0.5, 0.6, 0.8, 0.9, 1.0, 1.2];
/** the appliances of an oven tower, from the bottom (h in metres) */
const K_APPS = { drawer: { name: 'Drawer', h: 0.3 }, oven: { name: 'Oven', h: 0.6 }, combi: { name: 'Compact oven / combi', h: 0.455 }, micro: { name: 'Microwave', h: 0.38 }, coffee: { name: 'Coffee machine', h: 0.455 }, warm: { name: 'Warming drawer', h: 0.14 }, door: { name: 'Door', h: 0.5 } };
const OVENS_DEFAULT = [{ a: 'drawer', h: 0.3 }, { a: 'oven', h: 0.6 }, { a: 'combi', h: 0.455 }];
/** the look of a kitchen (the same for all its runs with “Use this look for the whole kitchen”) */
const K_LOOK_KEYS = ['color', 'grain', 'handles', 'handleC', 'carcass', 'plinthC', 'plinthH', 'top', 'topMat', 'topImg', 'topImgW', 'topT', 'h', 'sinkC', 'tapC'];
const K_HANDLES = [['none', 'None (push to open)'], ['bar', 'Bar'], ['knob', 'Knob'], ['rail', 'Long rail'], ['profile', 'Grip profile']];
const K_METALS = { steel: '#B4B8BB', black: '#1E1F21', gold: '#D9B24C', brass: '#C49A5C', white: '#EEEDEA' };
const K_TOPS = [['plain', 'Plain'], ['marble', 'Marble look'], ['stone', 'Stone'], ['wood', 'Wood'], ['photo', 'From a photo']];
const unitDef = u => RUN_UNITS[u.k] || RUN_UNITS.base;
const isTallK = k => !!(RUN_UNITS[k] && (RUN_UNITS[k].tall || RUN_UNITS[k].top));

/** the units of a run (older islands without units get them from their width) */
function runUnits(it) {
  if (it.units && it.units.length) return it.units;
  const def = it.island || furnType(it).island ? ISLAND_DEFAULT : RUN_DEFAULT;
  const total = def.reduce((s2, [, w]) => s2 + w, 0), k = it.w / total;
  return def.map(([kk, w]) => ({ k: kk, w: +(w * k).toFixed(3) }));
}
/** units with their place along the run: [{u, i, x0, x1, def}] (x from −w/2); the back row of an island is listed
    from left to right seen from the back, so it runs from +w/2 to −w/2 */
function runLayout(it, side = 'front') {
  const units = side === 'back' ? (it.back || []) : runUnits(it);
  const total = units.reduce((s2, u) => s2 + u.w, 0) || 1;
  const k = it.w / total;   // stretched to the width of the run if they differ
  let x = -it.w / 2;
  const out = units.map((u, i) => { const w = u.w * k, o = { u, i, x0: x, x1: x + w, def: unitDef(u) }; x += w; return o; });
  if (side === 'back') for (const o of out) { const a = -o.x1, b = -o.x0; o.x0 = a; o.x1 = b; }
  return out;
}
const isIsland = it => !!(it.island || furnType(it).island);
const hasBack = it => isIsland(it) && Array.isArray(it.back) && it.back.length > 0;
/** depth of the (main row of) cupboards; the rest of an island's depth is the back row and the overhang */
function runCabDepth(it) {
  if (!isIsland(it)) return it.d;
  if (it.cd) return Math.min(it.cd, it.d);
  return Math.max(0.3, it.d - Math.min(it.ov != null ? it.ov : (furnType(it).ov || 0), it.d - 0.3));
}
const runBackDepth = it => hasBack(it) ? Math.min(it.bd || 0.35, Math.max(0.1, it.d - runCabDepth(it))) : 0;
const runTallH = it => it.tallH || 2.15;
const runPlinth = it => it.plinthH != null ? it.plinthH : 0.1;
const runTopT = it => it.topT || 0.04;
const runTopOv = it => it.topOv != null ? it.topOv : 0.02;

/** the top of a column: worktop level, tall height; fillers and panels follow their tallest neighbour */
function colZone(lay, j) {
  const L = lay[j], z = L.def.zone;
  if (z !== 'fill') return z;
  if (L.u.tall === true) return 'tall';
  if (L.u.tall === false) return 'base';
  for (const d of [-1, 1]) for (let i = j + d; i >= 0 && i < lay.length; i += d) {
    const z2 = lay[i].def.zone;
    if (z2 === 'fill') continue;
    if (z2 === 'tall' || z2 === 'top') return 'tall';
    break;
  }
  return 'base';
}

/** the fronts of one column, in its own front plane: [{x0, x1, y0, y1, t, hinge}] (x along the run, y up).
    t: door, drawer, panel (fixed), dw (dishwasher front), open, oven, combi, micro, coffee, warm, niche, wall (a wall
    cabinet's door), bulk (bulkhead), grille */
function unitFaces(it, lay, j, ctx) {
  const L = lay[j], u = L.u, k = u.k, x0 = L.x0, x1 = L.x1, w = x1 - x0;
  const { p, bt, H, tallH } = ctx;
  const out = [], f = (a, b, y0, y1, t, extra) => { if (b - a > 0.004 && y1 - y0 > 0.004) out.push({ x0: a, x1: b, y0, y1, t, ...(extra || {}) }); };
  const doors = (a, b, y0, y1, n, hinge, t = 'door') => {
    if (n <= 1) { f(a, b, y0, y1, t, { hinge: hinge || 'R' }); return; }
    const s = (b - a) / n;
    for (let i = 0; i < n; i++) f(a + s * i, a + s * (i + 1), y0, y1, t, { hinge: i < n / 2 ? 'L' : 'R' });
  };
  const stack = (y0, y1, n, t = 'drawer') => { const s = (y1 - y0) / n; for (let i = 0; i < n; i++) f(x0, x1, y0 + s * i, y0 + s * (i + 1), t); };
  const zone = colZone(lay, j);
  switch (k) {
    case 'drawers': stack(p, bt, u.n || 3); break;
    case 'hob': stack(p, bt, u.n || 2); break;
    case 'sink': if (u.n === 0) stack(p, bt, 1); else doors(x0, x1, p, bt, u.n || (w > 0.5 ? 2 : 1), u.hinge); break;
    case 'dw': f(x0, x1, p, bt, 'dw'); break;
    case 'oven': { const oh = Math.min(0.6, bt - p - 0.08); f(x0, x1, bt - oh, bt, 'oven'); f(x0, x1, p, bt - oh, 'drawer'); break; }
    case 'corner': {
      const dw = Math.min(w, u.door || 0.5);
      if ((u.blind || 'R') === 'R') { f(x0, x0 + dw, p, bt, 'door', { hinge: u.hinge || 'L' }); f(x0 + dw, x1, p, bt, 'panel'); }
      else { f(x0, x1 - dw, p, bt, 'panel'); f(x1 - dw, x1, p, bt, 'door', { hinge: u.hinge || 'R' }); }
      break;
    }
    case 'open': f(x0, x1, p, bt, 'open'); break;
    case 'gap': break;
    case 'endbox': f(x0, x1, p, bt, 'panel'); break;
    case 'tall': {
      const n = u.n || 2;
      if (n === 1) f(x0, x1, p, tallH, 'door', { hinge: u.hinge || 'R' });
      else { const s = p + (tallH - p) * (u.split || 0.45); f(x0, x1, p, s, 'door', { hinge: u.hinge || 'R' }); f(x0, x1, s, tallH, 'door', { hinge: u.hinge || 'R' }); }
      break;
    }
    case 'fridge': { const s = p + (tallH - p) * 0.45; f(x0, x1, p, s, 'door', { hinge: u.hinge || 'R' }); f(x0, x1, s, tallH, 'door', { hinge: u.hinge || 'R' }); break; }
    case 'ovens': {
      let y = p;
      for (const ap of (u.apps || OVENS_DEFAULT)) {
        const hh = Math.max(0.05, ap.h || (K_APPS[ap.a] || K_APPS.door).h);
        if (y + hh > tallH - 0.05) break;
        f(x0, x1, y, y + hh, ap.a === 'door' ? 'door' : ap.a, { hinge: u.hinge || 'R', nh: ap.nh });
        y += hh;
      }
      if (tallH - y > 0.05) f(x0, x1, y, tallH, 'door', { hinge: u.hinge || 'R' });
      break;
    }
    case 'niche': {
      const th = Math.min(u.topH != null ? u.topH : 0.45, tallH - 0.3), nt = tallH - th - 0.019;
      f(x0, x1, 0, nt, 'niche');
      f(x0, x1, nt, nt + 0.019, 'panel');
      if (th > 0.05) doors(x0, x1, nt + 0.019, tallH, u.n || 2, u.hinge);
      break;
    }
    case 'onbox': {
      if ((u.n ?? 1) === 0) f(x0, x1, H, tallH, 'panel'); else doors(x0, x1, H, tallH, u.n || 1, u.hinge);
      if (u.blind !== false) f(x0, x1, p, bt, 'panel');
      break;
    }
    case 'filler': case 'panel': f(x0, x1, k === 'panel' ? 0 : p, zone === 'tall' ? tallH : bt, 'panel'); break;
    default: doors(x0, x1, p, bt, u.n || (w > 0.5 ? 2 : 1), u.hinge);
  }
  // over the low units along a wall: wall cabinets (or the hood above the hob)
  if (ctx.wall && zone === 'base' && k !== 'gap' && k !== 'panel' && u.wall !== false) {
    if (k === 'hob') { if (it.hood !== false && !u.dd) f(x0 + 0.04, x1 - 0.04, ctx.wallZ + 0.05, ctx.wallZ + 0.13, 'hood'); }
    else if (k !== 'filler') doors(x0, x1, ctx.wallZ, ctx.wallZ + ctx.wallH, w > 0.5 ? 2 : 1, null, 'wall');
  }
  // the bulkhead from the tall units to the ceiling, with grilles above a niche
  if (ctx.bulk && (zone === 'tall' || zone === 'top') && ctx.ceilingH - tallH > 0.02) {
    f(x0, x1, tallH, ctx.ceilingH, 'bulk');
    if (k === 'niche' && u.grille !== false) for (const c of [0.27, 0.73]) { const gw = Math.min(0.37, w * 0.4); f(x0 + w * c - gw / 2, x0 + w * c + gw / 2, tallH + 0.012, tallH + 0.07, 'grille'); }
  }
  return out;
}
function runCtx(it, ceilingH) {
  const H = it.h, topT = runTopT(it), tallH = Math.min(runTallH(it), (ceilingH || 2.6) - 0.02);
  return { H, topT, bt: H - topT, p: runPlinth(it), tallH, ceilingH: ceilingH || 2.6, wall: !isIsland(it) && it.wallUnits !== false, wallZ: it.wallZ || 1.45, wallH: Math.min(it.wallH || 0.7, (ceilingH || 2.6) - (it.wallZ || 1.45) - 0.02), bulk: !!it.bulk };
}

/* ───────── 2D ───────── */
function runSymbol(it) {
  const out = [], o = (d, c = 'o') => out.push({ d, c });
  const X = it.w / 2, Y = it.d / 2, isl = isIsland(it), cd = runCabDepth(it), bd = runBackDepth(it);
  const ov = isl ? 0 : runTopOv(it), te = isl ? (it.topEnd || 0) : 0;
  const lay = runLayout(it);
  // the worktop outline (it can stick out at the front and the ends; corners can be trimmed)
  const [tl, tr] = it.topTrim || [0, 0];
  o(F2.rect(-X - te, -Y, X + te, Y + ov));
  if (tl > 0.001 || tr > 0.001) { if (tl > 0.001) o(F2.line(fx(-X + tl), -Y, fx(-X + tl), fx(Y + ov)), 'd'); if (tr > 0.001) o(F2.line(fx(X - tr), -Y, fx(X - tr), fx(Y + ov)), 'd'); }
  const rows = [{ lay, dir: isl ? -1 : 1, faceY: isl ? -Y : Y, depth: cd }];
  if (bd > 0) rows.push({ lay: runLayout(it, 'back'), dir: 1, faceY: -Y + cd + bd, depth: bd });
  for (const R of rows) {
    const back = R.faceY - R.dir * R.depth, frontLine = R.faceY - R.dir * 0.02;
    const y0 = Math.min(back, R.faceY), y1 = Math.max(back, R.faceY);
    if (isl) o(F2.line(-X, fx(back), X, fx(back)), 'l');
    o(F2.line(-X, fx(frontLine), X, fx(frontLine)), 'l');
    R.lay.forEach((L, j) => {
      const x0 = fx(L.x0), x1 = fx(L.x1), cx = fx((L.x0 + L.x1) / 2), w = L.x1 - L.x0, k = L.u.k, my = fx((y0 + y1) / 2);
      if (j > 0) o(F2.line(x0, fx(y0), x0, fx(y1)), 'l');
      if (k === 'sink') {
        const sw = Math.min(w - 0.1, L.u.sinkW || 0.55), sd = Math.min(R.depth - 0.16, L.u.sinkD || 0.43);
        const sy = R.faceY - R.dir * (0.06 + sd / 2) + (isl ? 0 : R.dir * ov);
        o(F2.rect(fx(cx - sw / 2), fx(sy - sd / 2), fx(cx + sw / 2), fx(sy + sd / 2), 0.04), 'l');
        o(F2.circle(cx, fx(sy - R.dir * (sd / 2 + 0.05)), 0.022), 'f');
      }
      if (k === 'hob') {
        const hw = Math.min(w - 0.02, L.u.hobW || Math.min(0.78, w - 0.06)), hd = L.u.hobD || 0.51;
        const hy = R.faceY - R.dir * (0.06 + hd / 2) + (isl ? 0 : R.dir * ov);
        o(F2.rect(fx(cx - hw / 2), fx(hy - hd / 2), fx(cx + hw / 2), fx(hy + hd / 2), 0.015), 'l');
        const bx = hw / 4.4, by = hd / 4.4;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) o(F2.circle(fx(cx + sx * bx), fx(hy + sy * by), fx(Math.min(bx, by) * 0.6)), 'l');
        if (L.u.dd) { const dy = hy - R.dir * (hd / 2 + 0.02 + 0.06); o(F2.rect(fx(cx - hw / 2), fx(dy - 0.06), fx(cx + hw / 2), fx(dy + 0.06)), 'f'); }
      }
      if (k === 'dw') out.push({ c: 't', x: cx, y: my, text: 'DW', size: 0.14 });
      if (k === 'oven') out.push({ c: 't', x: cx, y: my, text: 'OV', size: 0.14 });
      if (k === 'gap') o(F2.line(x0, fx(y0), x1, fx(y1)), 'd');
      if (k === 'corner') { const dw = Math.min(w, L.u.door || 0.5), bx0 = (L.u.blind || 'R') === 'R' ? L.x0 + dw : L.x0, bx1 = (L.u.blind || 'R') === 'R' ? L.x1 : L.x1 - dw; o(F2.line(fx(bx0), fx(y0), fx(bx1), fx(y1)), 'd'); }
      if (k === 'endbox') { const ex = L.x0 + L.x1 > 0 ? L.x1 : L.x0; o(F2.line(fx(ex), fx(y0), fx(ex - Math.sign(L.x0 + L.x1) * 0.04), fx(y1)), 'l'); }
      if (L.def.tall || k === 'onbox') {
        o(F2.line(x0, fx(y0), x1, fx(y1)) + F2.line(x1, fx(y0), x0, fx(y1)), 'l');
        if (k === 'fridge') out.push({ c: 't', x: cx, y: fx(my + R.depth * 0.28 * R.dir), text: 'F', size: 0.14 });
        if (k === 'ovens') out.push({ c: 't', x: cx, y: fx(my + R.depth * 0.28 * R.dir), text: 'OV', size: 0.12 });
      }
      if (k === 'niche') {
        const fw = Math.min(w - 0.02, L.u.fw || 0.9), fd = L.u.fd || 0.7, fyb = back + R.dir * 0.03;
        o(F2.rect(fx(cx - fw / 2), fx(Math.min(fyb, fyb + R.dir * fd)), fx(cx + fw / 2), fx(Math.max(fyb, fyb + R.dir * fd))), 'l');
        out.push({ c: 't', x: cx, y: fx(fyb + R.dir * fd / 2), text: 'F', size: 0.16 });
      }
    });
  }
  // wall cabinets and the hood: dashed (they hang above)
  if (!isl && it.wallUnits !== false) {
    const wd = Math.min(it.wallD || 0.35, it.d);
    lay.forEach((L, j) => {
      if (colZone(lay, j) !== 'base' || L.u.k === 'gap' || L.u.k === 'panel' || L.u.wall === false) return;
      if (L.u.k === 'hob') { if (it.hood !== false && !L.u.dd) o(`M${fx(L.x0 + 0.04)} ${-Y}L${fx(L.x0 + 0.1)} ${fx(-Y + 0.5)}L${fx(L.x1 - 0.1)} ${fx(-Y + 0.5)}L${fx(L.x1 - 0.04)} ${-Y}`, 'd'); return; }
      o(F2.rect(fx(L.x0 + 0.005), -Y, fx(L.x1 - 0.005), fx(-Y + wd)), 'd');
    });
  }
  return out;
}

/* ───────── 3D ───────── */
/** a box whose texture coordinates are in metres (so wood grain and stone keep their size on every part) */
function kbox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
/** wood with a vertical grain (fronts), 0.8 × 1.6 m per picture */
function kWoodTexture(color) {
  const key = 'kwood|' + color;
  if (TEX.has(key)) return TEX.get(key);
  const W = 256, Hh = 512, cv = makeCanvas(W, Hh), g = cv.getContext('2d');
  let seed = 19;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = color; g.fillRect(0, 0, W, Hh);
  // broad bands of lighter and darker wood, then fine wavy grain lines along the height
  for (let i = 0; i < 26; i++) { const x = rnd() * W, bw = 4 + rnd() * 26; g.fillStyle = shade(color, 0.93 + rnd() * 0.12); g.globalAlpha = 0.3; g.fillRect(x, 0, bw, Hh); g.fillRect(x - W, 0, bw, Hh); }
  g.globalAlpha = 1;
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W, a = 0.5 + rnd() * 2.2, ph = rnd() * 6.28, fr = 0.008 + rnd() * 0.02;
    g.strokeStyle = shade(color, rnd() < 0.6 ? 0.82 + rnd() * 0.1 : 1.06 + rnd() * 0.05); g.globalAlpha = 0.14 + rnd() * 0.22; g.lineWidth = 0.6 + rnd() * 1.1;
    g.beginPath();
    for (let y = 0; y <= Hh; y += 8) { const xx = x + Math.sin(y * fr + ph) * a; if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y); }
    g.stroke();
  }
  // a few knots and cathedral arcs (rough oak)
  for (let i = 0; i < 4; i++) {
    const cx = rnd() * W, cy = rnd() * Hh;
    g.strokeStyle = shade(color, 0.72); g.globalAlpha = 0.25;
    for (let r = 2; r < 14; r += 3) { g.beginPath(); g.ellipse(cx, cy, r * 0.6, r * 2.2, 0, 0, Math.PI * 2); g.stroke(); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.8, 1 / 1.6);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
  t.userData.hq = { relief: 0.0008, strength: 1.2 };
  TEX.set(key, t);
  return t;
}
/** a worktop: marble look (soft grey veins on white), stone (speckle) or wood; 1.2 m per picture */
function kTopTexture(kind, color) {
  const key = 'ktop|' + kind + '|' + color;
  if (TEX.has(key)) return TEX.get(key);
  const N = 512, cv = makeCanvas(N, N), g = cv.getContext('2d');
  let seed = kind === 'marble' ? 23 : 29;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = color; g.fillRect(0, 0, N, N);
  if (kind === 'marble') {
    // clouds, then veins that wander across (drawn three times shifted, so the picture tiles)
    for (let i = 0; i < 40; i++) { g.fillStyle = shade(color, 0.95 + rnd() * 0.06); g.globalAlpha = 0.2; g.beginPath(); g.arc(rnd() * N, rnd() * N, 20 + rnd() * 70, 0, 7); g.fill(); }
    for (let i = 0; i < 11; i++) {
      let x = rnd() * N, y = rnd() * N, a = rnd() * 6.28;
      const col = shade(color, 0.55 + rnd() * 0.25), lw = 0.4 + rnd() * (i < 3 ? 2.6 : 1.2);
      const pts = [];
      for (let s = 0; s < 70; s++) { a += (rnd() - 0.5) * 0.5; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
      const al = 0.22 + rnd() * 0.25;
      for (const [ox, oy] of [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N], [-N, -N], [N, N], [-N, N], [N, -N]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.globalAlpha = al;
        g.beginPath(); pts.forEach(([px, py], s2) => s2 ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke();
      }
    }
  } else if (kind === 'stone') {
    const img = g.getImageData(0, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) { const v = (rnd() - 0.5) * 34 * (rnd() < 0.08 ? 2.2 : 1); for (let c = 0; c < 3; c++) img.data[i + c] = clamp(img.data[i + c] + v, 0, 255); }
    g.putImageData(img, 0, 0);
  } else if (kind === 'wood') {
    for (let i = 0; i < 160; i++) { const y = rnd() * N; g.strokeStyle = shade(color, 0.78 + rnd() * 0.3); g.globalAlpha = 0.25; g.lineWidth = 0.6 + rnd(); g.beginPath(); for (let x = 0; x <= N; x += 8) { const yy = y + Math.sin(x * 0.01 + i) * 1.5; if (!x) g.moveTo(x, yy); else g.lineTo(x, yy); } g.stroke(); }
    g.globalAlpha = 0.4; g.fillStyle = shade(color, 0.7); for (let k = 1; k < 6; k++) g.fillRect(0, k * N / 6, N, 1);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.2, 1 / 1.2);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
  TEX.set(key, t);
  return t;
}
const KMAT = new Map();
function kmat(key, make) { let m = KMAT.get(key); if (!m) { m = make(); KMAT.set(key, m); } return m; }
function kFrontMat(it) {
  const c = it.color || '#E9E6E0';
  if (!it.grain) return fmat(c, { rough: 0.55 });
  // the real wood picture (texlib.js), its grain standing upright, in the chosen colour
  const lib = libSet('Wood048') && kmat('front|lib|' + c, () => {
    const cv0 = libTintCanvas('Wood048', c, 1.0);
    if (!cv0) return null;
    const cv = makeCanvas(cv0.height, cv0.width), g = cv.getContext('2d');
    g.translate(cv.width, 0); g.rotate(Math.PI / 2); g.drawImage(cv0, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.0, 1 / 1.0); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.62, metalness: 0 });
  });
  if (lib) return lib;
  return kmat('front|' + c, () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: kWoodTexture(c), roughness: 0.62, metalness: 0 }));
}
function kTopMat(it) {
  const c = it.top || furnType(it).top || '#4A4744', kind = it.topMat || 'plain';
  if (kind === 'photo') {
    // a photo of a sample of the worktop, repeated at its true size (the box's UVs are in metres)
    const base = it.topImg ? imageTex(it.topImg) : null;
    if (!base) return fmat(c, { rough: 0.45 });
    const im = projectImage(it.topImg), w = Math.max(0.05, it.topImgW || 0.6), hh = w * (im && im.w ? im.h / im.w : 1);
    return kmat('top|photo|' + it.topImg + '|' + base.image.dataset.src + '|' + w, () => {
      const tex = base.clone(); tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping; tex.repeat.set(1 / w, 1 / hh); tex.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.42, metalness: 0 });
    });
  }
  if (kind === 'plain') return fmat(c, { rough: 0.45 });
  // the real pictures (texlib.js): marble and wood worktops in their chosen colour
  const lib = kind === 'marble' ? libMaterial('Marble021', { tint: c, contrast: 1.4, rough: 0.5, normal: 0.4 }) : kind === 'wood' ? libMaterial('Wood078', { tint: c, contrast: 1.1, rough: 0.8 }) : null;
  if (lib) return lib;
  return kmat('top|' + kind + '|' + c, () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: kTopTexture(kind, c), roughness: kind === 'marble' ? 0.38 : kind === 'wood' ? 0.6 : 0.5, metalness: 0 }));
}
const kMetal = name => (name === 'black' && libMaterial('Metal028')) || ((name === 'gold' || name === 'brass') && libMaterial('Metal048A', { tint: K_METALS[name], contrast: 0.6 }))
  || fmat(K_METALS[name] || name || K_METALS.steel, { rough: 0.3, metal: name === 'black' || name === 'white' ? 0.1 : 0.45 });

/** merge the parts of a kitchen per material (a kitchen is hundreds of parts: one draw call per material) */
function kMerge(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const buckets = new Map(), keep = [];
  g.traverse(o => {
    if (!o.isMesh || o === g) return;
    const geo = o.geometry;
    if (!geo.attributes.uv || Array.isArray(o.material)) { keep.push(o); return; }
    const key = o.material.uuid + '|' + (o.castShadow ? 1 : 0);
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { m: o.material, names: ['position', 'normal', 'uv'], cast: o.castShadow, items: [] });
    b.items.push({ g: geo, M: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), start: 0, count: Infinity });
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const geo = batchGeometry(b);
    if (!geo) continue;
    const me = new THREE.Mesh(geo, b.m);
    me.castShadow = b.cast; me.receiveShadow = true;
    out.add(me);
  }
  for (const o of keep) { o.parent.remove(o); out.add(o); }
  g.traverse(o => { if (o.geometry && o.isMesh) o.geometry.dispose(); });
  return out;
}

function runMesh(it, ceilingH, evening) {
  const g = new THREE.Group();
  const isl = isIsland(it), D = it.d, Z = D / 2, cd = runCabDepth(it), bd = runBackDepth(it);
  const ctx = runCtx(it, ceilingH), { H, topT, bt, p, tallH } = ctx;
  const Mf = kFrontMat(it), Mcar = fmat(it.carcass || tint(it.color || '#E9E6E0', 0.8), { rough: 0.6 }), Mpl = fmat(it.plinthC || '#1d1f21', { rough: 0.5 });
  const Mtop = kTopMat(it), Mh = kMetal(it.handleC || 'steel');
  const glassBlack = fmat('#141516', { rough: 0.12, metal: 0.2 }), panelDark = fmat('#232426', { rough: 0.4 }), steel = fmat('#DCDFE1', { rough: 0.36, metal: 0.2 });
  const box = (bw, bh, bdp, x, y, z, m, shadow = true) => { if (bw <= 0.001 || bh <= 0.001 || bdp <= 0.001) return null; const me = new THREE.Mesh(kbox(bw, bh, bdp), m); me.position.set(x, y + bh / 2, z); me.castShadow = shadow; me.receiveShadow = true; g.add(me); return me; };
  const cyl = (r, hh, x, y, z, m, seg = 20) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, seg), m); me.position.set(x, y + hh / 2, z); me.castShadow = true; g.add(me); return me; };
  const FT = 0.019, GAP = 0.003;
  const rows = [{ side: 'front', lay: runLayout(it), dir: isl ? -1 : 1, faceZ: isl ? -Z : Z, depth: cd }];
  if (bd > 0) rows.push({ side: 'back', lay: runLayout(it, 'back'), dir: 1, faceZ: -Z + cd + bd, depth: bd });
  for (const R of rows) {
    const { lay, dir, faceZ, depth } = R;
    const backZ = faceZ - dir * depth, carZ = (backZ + faceZ - dir * FT) / 2, carD = Math.max(0.02, depth - FT);
    // a front panel in this row's front plane (a few mm of gap all round), and its handle
    const handle = (F, horizontal) => {
      const hs = it.handles || 'bar';
      if (hs === 'none' || F.t === 'panel' || F.t === 'bulk' || F.t === 'grille' || F.t === 'niche' || F.t === 'open') return;
      const hz = faceZ + dir * 0.016, fw = F.x1 - F.x0, top = F.y1 - (F.t === 'wall' ? 0 : 0.05), wallUp = F.t === 'wall';
      if (hs === 'profile') { box(fw - 0.004, 0.012, 0.022, (F.x0 + F.x1) / 2, F.y1 - 0.012, faceZ + dir * 0.008, Mh); return; }
      if (hs === 'rail') { box(fw * 0.86, 0.014, 0.026, (F.x0 + F.x1) / 2, wallUp ? F.y0 + 0.03 : top - 0.014, hz, Mh); return; }
      if (hs === 'knob') { const kx = horizontal ? (F.x0 + F.x1) / 2 : (F.hinge === 'L' ? F.x1 - 0.05 : F.x0 + 0.05); const kn = cyl(0.015, 0.025, kx, wallUp ? F.y0 + 0.07 : top - 0.03, 0, Mh, 14); kn.rotation.x = Math.PI / 2; kn.position.z = faceZ + dir * 0.012; return; }
      if (horizontal) box(Math.min(0.3, fw * 0.5), 0.012, 0.02, (F.x0 + F.x1) / 2, top - 0.006, hz, Mh);
      else { const hx = F.hinge === 'L' ? F.x1 - 0.04 : F.x0 + 0.04; box(0.012, 0.16, 0.02, hx, wallUp ? F.y0 + 0.04 : top - 0.16, hz, Mh); }
    };
    const front = (F, m = Mf) => box(F.x1 - F.x0 - 2 * GAP, F.y1 - F.y0 - 2 * GAP, FT, (F.x0 + F.x1) / 2, F.y0 + GAP, faceZ - dir * FT / 2, m);
    const appliance = F => {
      const fw = F.x1 - F.x0, fh = F.y1 - F.y0, cx = (F.x0 + F.x1) / 2, z = faceZ - dir * FT / 2;
      box(fw - 2 * GAP, fh - 2 * GAP, FT, cx, F.y0 + GAP, z, glassBlack);
      // the control strip with a small display, and (most ovens) a slim handle
      const sh = Math.min(0.09, fh * 0.2);
      box(fw - 0.01, sh, 0.004, cx, F.y1 - sh - 0.004, faceZ + dir * 0.002, panelDark, false);
      box(Math.min(0.09, fw * 0.18), sh * 0.32, 0.004, cx, F.y1 - sh * 0.66 - 0.004, faceZ + dir * 0.0035, fmat('#3E6F80', { rough: 0.3, emissive: '#1E5A70', ei: evening ? 1.2 : 0.35 }), false);
      if (!F.nh && F.t !== 'warm') box(fw * 0.8, 0.014, 0.022, cx, F.y1 - sh - 0.04, faceZ + dir * 0.014, steel);
      if (F.t === 'coffee') { box(0.12, 0.08, 0.04, cx, F.y0 + fh * 0.3, faceZ + dir * 0.02, steel); }
    };
    lay.forEach((L, j) => {
      const u = L.u, k = u.k, w = L.x1 - L.x0, cx = (L.x0 + L.x1) / 2, zone = colZone(lay, j);
      if (k === 'gap') return;
      const faces = unitFaces(it, lay, j, { ...ctx, wall: ctx.wall && R.side === 'front', bulk: ctx.bulk });
      // the carcass behind the fronts, and the plinth under it (set back 5 cm)
      if (k === 'panel' || k === 'filler') {
        const F = faces.find(x => x.t === 'panel');
        if (F) { if (k === 'panel') box(w - GAP, F.y1 - F.y0, depth, cx, F.y0, faceZ - dir * depth / 2, Mf); else { box(w - GAP, F.y1 - F.y0, FT, cx, F.y0, faceZ - dir * FT / 2, Mf); box(w - GAP, p, depth - 0.07, cx, 0, faceZ - dir * (0.05 + (depth - 0.07) / 2), Mpl); } }
      } else if (k === 'niche') {
        const top = faces.find(x => x.t === 'panel');
        if (top) box(w - 0.002, tallH - top.y0, carD, cx, top.y0, carZ, Mcar);
        // the free-standing fridge (stainless, two doors over two drawers), standing out of the niche if it is deeper
        const fw = Math.min(w - 0.02, u.fw || 0.9), fh = Math.min(top ? top.y0 - 0.02 : 1.8, u.fh || 1.8), fd = u.fd || 0.7;
        const fz0 = backZ + dir * 0.03, fz = fz0 + dir * fd / 2, fzF = fz0 + dir * fd;
        const fc = u.fc === 'black' ? fmat('#2B2C2E', { rough: 0.35, metal: 0.4 }) : u.fc === 'white' ? fmat('#EEEDEA', { rough: 0.4 }) : steel;
        box(fw, fh - 0.03, fd - 0.02, cx, 0.03, fz - dir * 0.01, fc);
        cyl(0.02, 0.03, cx - fw / 2 + 0.06, 0, fzF - dir * 0.08, panelDark, 8); cyl(0.02, 0.03, cx + fw / 2 - 0.06, 0, fzF - dir * 0.08, panelDark, 8);
        const split = 0.03 + (fh - 0.03) * 0.58;
        box(0.006, fh - split - 0.01, 0.02, cx, split, fzF, panelDark, false);
        box(fw - 0.01, 0.006, 0.02, cx, split - 0.003, fzF, panelDark, false);
        box(fw - 0.01, 0.006, 0.02, cx, 0.03 + (split - 0.03) / 2, fzF, panelDark, false);
        for (const sx of [-1, 1]) box(0.018, Math.min(0.75, fh - split - 0.15), 0.035, cx + sx * 0.035, split + 0.08, fzF + dir * 0.018, steel);
        for (const yy of [0.03 + (split - 0.03) / 2 - 0.06, split - 0.06]) box(fw * 0.5, 0.016, 0.03, cx, yy, fzF + dir * 0.016, steel);
      } else if (zone === 'tall' || k === 'onbox') {
        const y0 = k === 'onbox' ? H : p;
        box(w - 0.002, tallH - y0, carD, cx, y0, carZ, Mcar);
        if (k !== 'onbox') box(w - GAP, p, depth - 0.07, cx, 0, faceZ - dir * (0.05 + (depth - 0.07) / 2), Mpl);
        else if (u.blind !== false) box(w - GAP, p, 0.05, cx, 0, faceZ - dir * 0.075, Mpl);
      } else {
        if (k !== 'open') box(w - 0.002, bt - p, carD, cx, p, carZ, Mcar);
        box(w - GAP, p, depth - 0.07, cx, 0, faceZ - dir * (0.05 + (depth - 0.07) / 2), Mpl);
      }
      // an island cupboard that opens to the end: its door on the end face
      if (k === 'endbox') {
        const ex = cx > 0 ? L.x1 : L.x0, es = Math.sign(cx) || 1, ez0 = Math.min(faceZ, backZ), ez1 = Math.max(faceZ, backZ);
        box(FT, bt - p - 2 * GAP, ez1 - ez0 - 2 * GAP, ex - es * FT / 2, p + GAP, (ez0 + ez1) / 2, Mf);
        if ((it.handles || 'bar') !== 'none') box(0.02, 0.16, 0.012, ex + es * 0.016, bt - 0.21, ez1 - 0.04, Mh);
      }
      for (const F of faces) {
        switch (F.t) {
          case 'door': case 'drawer': case 'dw': case 'panel':
            front(F); handle(F, F.t === 'drawer' || F.t === 'dw'); break;
          case 'wall': {
            const wd = Math.min(it.wallD || 0.35, D);
            box(F.x1 - F.x0 - 0.002, F.y1 - F.y0, wd - FT, (F.x0 + F.x1) / 2, F.y0, -Z + (wd - FT) / 2, Mcar);
            box(F.x1 - F.x0 - 2 * GAP, F.y1 - F.y0 - 2 * GAP, FT, (F.x0 + F.x1) / 2, F.y0 + GAP, -Z + wd - FT / 2, Mf);
            if ((it.handles || 'bar') !== 'none') box(Math.min(0.2, (F.x1 - F.x0) * 0.4), 0.012, 0.02, (F.x0 + F.x1) / 2, F.y0 + 0.05, -Z + wd + 0.012, Mh);
            break;
          }
          case 'hood': {
            const hm = fmat('#9A9DA0', { rough: 0.35, metal: 0.5 });
            box(F.x1 - F.x0, 0.08, 0.5, (F.x0 + F.x1) / 2, H + 0.65, -Z + 0.25, hm);
            box(Math.min(0.3, (F.x1 - F.x0) * 0.4), Math.max(0.1, ctx.ceilingH - H - 0.73), 0.26, (F.x0 + F.x1) / 2, H + 0.73, -Z + 0.13, hm);
            break;
          }
          case 'open': {
            for (const sx of [-1, 1]) box(0.018, F.y1 - F.y0, depth - 0.004, cx + sx * (w / 2 - 0.011), F.y0, faceZ - dir * depth / 2, Mf);
            for (const yy of [F.y0, F.y0 + (F.y1 - F.y0) / 2]) box(w - 0.04, 0.018, depth - 0.03, cx, yy, faceZ - dir * depth / 2, Mf);
            box(w - 0.004, F.y1 - F.y0, 0.02, cx, F.y0, backZ + dir * 0.01, Mf);
            break;
          }
          case 'bulk': box(F.x1 - F.x0, F.y1 - F.y0 - 0.002, depth, (F.x0 + F.x1) / 2, F.y0, faceZ - dir * depth / 2, Mf); break;
          case 'grille': {
            box(F.x1 - F.x0, F.y1 - F.y0, 0.004, (F.x0 + F.x1) / 2, F.y0, faceZ + dir * 0.002, panelDark, false);
            for (let s = 1; s < 4; s++) box(F.x1 - F.x0 - 0.02, 0.004, 0.003, (F.x0 + F.x1) / 2, F.y0 + (F.y1 - F.y0) * s / 4 - 0.002, faceZ + dir * 0.0045, steel, false);
            break;
          }
          case 'niche': break;
          case 'oven': case 'combi': case 'micro': case 'coffee': case 'warm': appliance(F); break;
          default: front(F);
        }
      }
    });
  }
  // the worktop: over the low units (a run: one piece between tall units, it sticks out at the front; an island: all of it)
  const lay = runLayout(it);
  if (isl) {
    const te = it.topEnd || 0;
    box(it.w + 2 * te, topT, D, 0, H - topT, 0, Mtop);
    if (it.waterfall) for (const sx of [-1, 1]) box(topT, H - topT, D, sx * (it.w / 2 + te - topT / 2), 0, 0, Mtop);
  } else {
    const ov = runTopOv(it), [tl, tr] = it.topTrim || [0, 0];
    const segs = [];
    let seg = null;
    lay.forEach((L, j) => {
      const z = colZone(lay, j);
      if (z === 'tall' && L.u.k !== 'onbox') { if (seg) segs.push(seg); seg = null; return; }
      if (!seg) seg = { x0: L.x0, x1: L.x1 }; else seg.x1 = L.x1;
    });
    if (seg) segs.push(seg);
    for (const sg of segs) {
      const x0 = sg.x0 + (Math.abs(sg.x0 + it.w / 2) < 1e-6 ? tl : 0), x1 = sg.x1 - (Math.abs(sg.x1 - it.w / 2) < 1e-6 ? tr : 0);
      if (x1 - x0 > 0.01) box(x1 - x0, topT, D + ov, (x0 + x1) / 2, H - topT, ov / 2, Mtop);
    }
  }
  // sink, tap, hob, downdraft and pop-up sockets in the worktop
  const rowsTop = [{ lay, dir: isl ? -1 : 1, edge: isl ? -Z : Z + runTopOv(it), depth: cd }];
  if (bd > 0) rowsTop.push({ lay: runLayout(it, 'back'), dir: 1, edge: Z, depth: bd });
  const sinkM = it.sinkC === 'steel' ? steel : (!it.sinkC || it.sinkC === 'black') && libMaterial('Metal028', { rough: 1.1 }) || fmat(it.sinkC && it.sinkC !== 'black' ? it.sinkC : '#1f2022', { rough: 0.55 });
  const tapM = kMetal(it.tapC || 'steel');
  for (const R of rowsTop) for (const L of R.lay) {
    const u = L.u, w = L.x1 - L.x0, cx = (L.x0 + L.x1) / 2;
    if (u.k === 'sink') {
      const sw = Math.min(w - 0.1, u.sinkW || 0.55), sd = Math.min(Math.max(0.3, R.depth - 0.16), u.sinkD || 0.43);
      const sz = R.edge - R.dir * (0.06 + sd / 2);
      box(sw, 0.004, sd, cx, H, sz, sinkM, false);
      box(sw - 0.05, 0.002, sd - 0.05, cx, H + 0.004, sz, fmat('#0d0e0f', { rough: 0.7 }), false);
      cyl(0.022, 0.003, cx, H + 0.006, sz + R.dir * (sd / 2 - 0.07), steel, 16);
      // the tap behind the bowl: a round spout (a Quooker-like boiling water tap when it.tapC is gold or black)
      const tz = sz - R.dir * (sd / 2 + 0.065);
      cyl(0.026, 0.05, cx, H, tz, tapM, 20);
      cyl(0.016, 0.26, cx, H + 0.05, tz, tapM, 16);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 10, 24, Math.PI), tapM);
      arc.position.set(cx, H + 0.31, tz + R.dir * 0.075); arc.rotation.y = R.dir > 0 ? Math.PI / 2 : -Math.PI / 2; arc.castShadow = true; g.add(arc);
      cyl(0.016, 0.06, cx, H + 0.25, tz + R.dir * 0.15, tapM, 16);
    }
    if (u.k === 'hob') {
      const hw = Math.min(w - 0.02, u.hobW || Math.min(0.78, w - 0.06)), hd = u.hobD || 0.51, hz = R.edge - R.dir * (0.06 + hd / 2);
      box(hw, 0.006, hd, cx, H - 0.002, hz, glassBlack, false);
      for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.08, 32), fmat('#3a3c3f', { rough: 0.3 })); ring.rotation.x = -Math.PI / 2; ring.position.set(cx + sx * hw / 4.2, H + 0.0045, hz + sz2 * hd / 4.6); g.add(ring); }
      if (u.dd) { const dz = hz - R.dir * (hd / 2 + 0.025 + 0.0615); box(Math.min(hw, 0.781), 0.006, 0.123, cx, H - 0.002, dz, fmat('#BFC2C5', { rough: 0.3, metal: 0.2 }), false); for (let s = 1; s < 12; s++) box(0.004, 0.0015, 0.1, cx - 0.36 + s * 0.06, H + 0.004, dz, fmat('#8E9194'), false); }
    }
  }
  // sockets: a pop-up in the worktop ([x, z]) or a socket strip on the back of an island ({x, back: true})
  for (const pp of (it.pops || [])) {
    if (Array.isArray(pp)) { cyl(0.03, 0.004, pp[0], H, pp[1], fmat('#1E1F21', { rough: 0.35 }), 24); continue; }
    const bz = bd > 0 ? -Z + cd + bd : (isl ? -Z + cd : Z);
    box(0.16, 0.05, 0.006, pp.x, bt - 0.07, bz + 0.003, fmat('#1E1F21', { rough: 0.35 }), false);
    for (const dx of [-0.045, 0, 0.045]) box(0.022, 0.012, 0.002, pp.x + dx, bt - 0.051, bz + 0.0065, fmat('#4A4C4F', { rough: 0.4 }), false);
  }
  return kMerge(g);
}

/* ───────── the front view of a run (the builder) ───────── */
/** an SVG front view of one side of a run; tap a unit to pick it */
function runElevation(it, side, ceilingH, selIndex, onPick) {
  const lay = runLayout(it, side), ctx = runCtx(it, ceilingH);
  const isBack = side === 'back';
  // (seen from the back the units run from +w/2 to −w/2: draw them mirrored so the first is on the left)
  const X = x => isBack ? -x : x;
  // (up to the ceiling when something reaches it, otherwise just above the worktop and the tap)
  let top = ctx.H + (lay.some(L => L.u.k === 'sink') ? 0.42 : 0.12);
  lay.forEach((L, j) => { for (const F of unitFaces(it, lay, j, { ...ctx, wall: ctx.wall && !isBack })) top = Math.max(top, F.y1); });
  const W = it.w, H = Math.min(ctx.ceilingH, top + 0.04), pad = 0.06;
  const svg = s('svg', { class: 'kit-elev', viewBox: `${fx(-W / 2 - pad)} ${fx(-H - pad)} ${fx(W + 2 * pad)} ${fx(H + 2 * pad + 0.12)}`, preserveAspectRatio: 'xMidYMax meet', role: 'img', 'aria-label': t('Front view of the kitchen') });
  const y = v => fx(-v);
  svg.appendChild(s('line', { x1: fx(-W / 2 - pad), y1: 0, x2: fx(W / 2 + pad), y2: 0, class: 'ke-floor' }));
  if (top + 0.05 >= ctx.ceilingH) svg.appendChild(s('line', { x1: fx(-W / 2 - pad), y1: y(ctx.ceilingH), x2: fx(W / 2 + pad), y2: y(ctx.ceilingH), class: 'ke-ceil' }));
  // the worktop
  lay.forEach((L, j) => {
    const zone = colZone(lay, j);
    if ((zone === 'base' || L.u.k === 'onbox') && L.u.k !== 'gap') svg.appendChild(s('rect', { x: fx(Math.min(X(L.x0), X(L.x1))), y: y(ctx.H), width: fx(L.x1 - L.x0), height: fx(ctx.topT), class: 'ke-top' }));
  });
  lay.forEach((L, j) => {
    const g = s('g', { class: 'ke-unit' + (j === selIndex ? ' sel' : ''), 'data-i': j });
    const x0 = Math.min(X(L.x0), X(L.x1)), x1 = Math.max(X(L.x0), X(L.x1));
    const faces = unitFaces(it, lay, j, { ...ctx, wall: ctx.wall && !isBack });
    const top = Math.max(ctx.H, ...faces.map(F => F.y1));
    g.appendChild(s('rect', { x: fx(x0), y: y(top), width: fx(Math.max(0.01, x1 - x0)), height: fx(top), class: 'ke-hit' }));
    const zone = colZone(lay, j);
    if (L.u.k !== 'gap' && L.u.k !== 'niche' && zone !== 'fill') g.appendChild(s('rect', { x: fx(x0), y: y(ctx.p), width: fx(x1 - x0), height: fx(ctx.p), class: 'ke-plinth' }));
    for (const F of faces) {
      const a = Math.min(X(F.x0), X(F.x1)), b = Math.max(X(F.x0), X(F.x1));
      const r = s('rect', { x: fx(a + 0.002), y: y(F.y1 - 0.002), width: fx(Math.max(0.001, b - a - 0.004)), height: fx(Math.max(0.001, F.y1 - F.y0 - 0.004)), class: 'ke-f ke-' + F.t });
      g.appendChild(r);
      // doors: the architect's “arrow” to the hinge side
      if (F.t === 'door' || F.t === 'wall') {
        const hl = (F.hinge === 'L') !== isBack;
        const hx = hl ? a : b, ox = hl ? b : a;
        g.appendChild(s('path', { d: `M${fx(ox)} ${y(F.y1)}L${fx(hx)} ${y((F.y0 + F.y1) / 2)}L${fx(ox)} ${y(F.y0)}`, class: 'ke-hinge' }));
      }
      if (F.t === 'drawer' || F.t === 'dw') g.appendChild(s('line', { x1: fx(a + (b - a) * 0.3), y1: y(F.y1 - 0.05), x2: fx(b - (b - a) * 0.3), y2: y(F.y1 - 0.05), class: 'ke-hd' }));
    }
    if (L.u.k === 'niche') {
      const fw = Math.min(L.x1 - L.x0 - 0.02, L.u.fw || 0.9), fh = Math.min(L.u.fh || 1.8, ctx.tallH - (L.u.topH ?? 0.45) - 0.05), cx = (x0 + x1) / 2;
      g.appendChild(s('rect', { x: fx(cx - fw / 2), y: y(fh), width: fx(fw), height: fx(fh - 0.02), class: 'ke-fridge' }));
      g.appendChild(s('line', { x1: fx(cx), y1: y(fh), x2: fx(cx), y2: y(fh * 0.58), class: 'ke-hinge' }));
    }
    if (L.u.k === 'sink' || L.u.k === 'hob') {
      const cx = (x0 + x1) / 2;
      if (L.u.k === 'sink') g.appendChild(s('path', { d: `M${fx(cx)} ${y(ctx.H)}V${y(ctx.H + 0.3)}Q${fx(cx)} ${y(ctx.H + 0.38)} ${fx(cx + 0.08)} ${y(ctx.H + 0.38)}V${y(ctx.H + 0.3)}`, class: 'ke-tap' }));
      else g.appendChild(s('rect', { x: fx(cx - 0.3), y: y(ctx.H + 0.01), width: 0.6, height: 0.01, class: 'ke-hob' }));
    }
    g.appendChild(s('title', null, (j + 1) + '. ' + t(unitDef(L.u).name) + ' · ' + Math.round((L.x1 - L.x0) * 1000) / 10 + ' cm'));
    g.addEventListener('click', () => onPick && onPick(j));
    svg.appendChild(g);
    // numbers under the units
    svg.appendChild(s('text', { x: fx((x0 + x1) / 2), y: fx(0.1), class: 'ke-n' + (j === selIndex ? ' sel' : '') }, String(j + 1)));
  });
  return svg;
}

/* ───────── app: the builder in the details, filling a wall, corners, stools ───────── */
Object.assign(app, {
  updateRun(id, fn, coalesce) {
    this.updateFurn(id, f => { f.units = runUnits(f).map(u => ({ ...u })); fn(f); f.w = +f.units.reduce((s2, u) => s2 + u.w, 0).toFixed(3); }, coalesce);
  },
  /** change the units of one side (front: it.units, back: it.back) */
  updateSide(id, side, fn) {
    if (side === 'back') this.updateFurn(id, f => { f.back = (f.back || []).map(u => ({ ...u })); fn(f.back, f); });
    else this.updateRun(id, f => fn(f.units, f));
  },
  runSection(el, f, ro) {
    const isl = isIsland(f);
    const ks = this.kitSel && this.kitSel.id === f.id ? this.kitSel : (this.kitSel = { id: f.id, side: 'front', i: 0 });
    if (ks.side === 'back' && !hasBack(f)) ks.side = 'front';
    const side = ks.side, units = side === 'back' ? f.back : runUnits(f);
    if (ks.i >= units.length) ks.i = units.length - 1;
    const st = getStorey(this.project, f.storey), CH = st ? (st.wallHeight || DEFAULTS.wallHeight) : 2.6;
    const pick = i => { this.kitSel = { id: f.id, side, i }; this.renderInspector(); };
    const sec = h('div', { class: 'insp-sec run-sec' }, h('div', { class: 'eyebrow' }, t('Kitchen builder'), h('span', { class: 'num', style: { fontSize: '12px', letterSpacing: 0 } }, Math.round(f.w * 1000) / 10 + ' cm')));
    if (hasBack(f) || isl) {
      const sides = [['front', isl ? 'Cupboard side' : 'Front']];
      if (hasBack(f)) sides.push(['back', 'Back side']);
      if (sides.length > 1) sec.appendChild(this.segRow(t('Show'), sides, side, k => { this.kitSel = { id: f.id, side: k, i: 0 }; this.renderInspector(); }, false, 'kit-side'));
    }
    sec.appendChild(h('div', { class: 'kit-elev-wrap' }, runElevation(f, side, CH, ks.i, pick)));
    sec.appendChild(h('p', { class: 'note-muted' }, t('Tap a unit in the drawing (or its number below) to change it.')));
    // the units, left to right (a compact list)
    units.forEach((u, i) => {
      const sel = h('select', { class: 'select sm', disabled: ro, 'aria-label': t('Kind of unit') }, ...this.kitKindOptions(isl, side, u.k));
      sel.onchange = () => this.updateSide(f.id, side, list => { list[i] = { k: sel.value, w: u.w === unitDef(u).w ? RUN_UNITS[sel.value].w : u.w }; });
      const wIn = h('input', { class: 'input sm num', value: String(Math.round(u.w * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro, 'aria-label': t('Width in cm') });
      wIn.onchange = () => { const v = parseFloat(wIn.value.replace(',', '.')); if (isFinite(v) && v >= 1) this.updateSide(f.id, side, list => { list[i].w = +(v / 100).toFixed(4); }); else wIn.value = String(Math.round(u.w * 1000) / 10); };
      const mv = d => this.updateSide(f.id, side, list => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; this.kitSel.i = j; });
      sec.appendChild(h('div', { class: 'run-row' + (i === ks.i ? ' sel' : '') }, h('button', { class: 'run-n num', title: t('Change this unit'), onclick: () => pick(i) }, String(i + 1)), sel, h('div', { class: 'input-unit run-w' }, wIn, h('span', { class: 'unit' }, 'cm')),
        ro ? null : h('button', { class: 'btn ghost icon sm', 'aria-label': t('Move left'), title: t('Move left'), disabled: i === 0, onclick: () => mv(-1) }, icon('chevron', 'rot90')),
        ro ? null : h('button', { class: 'btn ghost icon sm', 'aria-label': t('Move right'), title: t('Move right'), disabled: i === units.length - 1, onclick: () => mv(1) }, icon('chevron', 'rotm90')),
        ro ? null : h('button', { class: 'btn ghost icon sm', 'aria-label': t('Remove unit'), title: t('Remove'), disabled: units.length < 2, onclick: () => this.updateSide(f.id, side, list => { list.splice(i, 1); }) }, icon('close'))));
    });
    if (!ro) {
      const addSel = h('select', { class: 'select sm', 'aria-label': t('Add a unit') }, h('option', { value: '' }, t('+ Add a unit …')), ...this.kitKindOptions(isl, side, null));
      addSel.onchange = () => { const k = addSel.value; if (k) this.updateSide(f.id, side, list => { list.splice(ks.i + 1, 0, { k, w: RUN_UNITS[k].w }); this.kitSel.i = ks.i + 1; }); };
      sec.appendChild(h('div', { class: 'actions' }, addSel, isl ? null : h('button', { class: 'btn sm', onclick: () => this.fitRunToWall(f.id) }, icon('space'), t('Fill the wall'))));
    }
    el.appendChild(sec);
    // the picked unit
    const u = units[ks.i];
    if (u) el.appendChild(this.kitUnitSection(f, side, ks.i, u, ro));
    el.appendChild(this.kitRunSection(f, ro, CH));
    el.appendChild(this.kitLookSection(f, ro));
  },
  kitKindOptions(isl, side, cur) {
    const out = [];
    for (const [z, zname] of KZONES) {
      if (isl && z === 'tall' && cur == null) continue;
      const kinds = Object.entries(RUN_UNITS).filter(([k, d]) => d.zone === z && !(isl && (d.tall || d.top) && k !== cur) && !(d.island && !isl) && !(side === 'back' && k === 'corner' && k !== cur));
      if (!kinds.length) continue;
      out.push(h('optgroup', { label: t(zname) }, ...kinds.map(([k, d]) => h('option', { value: k, selected: cur === k }, t(d.name)))));
    }
    return out;
  },
  /** the options of one unit: width, doors or drawers, hinge, appliances … */
  kitUnitSection(f, side, i, u, ro) {
    const def = unitDef(u), up = fn => this.updateSide(f.id, side, list => fn(list[i]));
    const sec = h('div', { class: 'insp-sec kit-unit' }, h('div', { class: 'eyebrow' }, t('Unit {n}', { n: i + 1 }) + ' · ' + t(def.name)));
    const ki = h('select', { class: 'select', id: 'f-kit-kind', disabled: ro }, ...this.kitKindOptions(isIsland(f), side, u.k));
    ki.onchange = () => up(x => { const keepW = x.w !== unitDef(x).w; for (const key of Object.keys(x)) if (key !== 'w') delete x[key]; x.k = ki.value; if (!keepW) x.w = RUN_UNITS[ki.value].w; });
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-kit-kind' }, t('Kind')), ki));
    const wIn = h('input', { class: 'input num', id: 'f-kit-w', value: String(Math.round(u.w * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro });
    wIn.onchange = () => { const v = parseFloat(wIn.value.replace(',', '.')); if (isFinite(v) && v >= 1) up(x => { x.w = +(v / 100).toFixed(4); }); };
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-kit-w' }, t('Width')), h('div', { class: 'input-unit' }, wIn, h('span', { class: 'unit' }, 'cm'))));
    if (!['panel', 'filler'].includes(u.k)) sec.appendChild(h('div', { class: 'chips-row' }, ...K_WIDTHS.map(w => h('button', { class: 'chip', disabled: ro, 'aria-pressed': String(Math.abs(u.w - w) < 0.0005), onclick: () => up(x => { x.w = w; }) }, String(Math.round(w * 100))))));
    const seg = (label, items, cur, fn, cls) => sec.appendChild(this.segRow(label, items, cur, fn, ro, cls));
    const n = u.n;
    if (['base', 'sink', 'onbox'].includes(u.k)) seg(t('Doors'), (u.k === 'onbox' ? [['0', 'None (panel)']] : []).concat([['1', '1'], ['2', '2']]).concat(u.k === 'sink' ? [['drawer', 'Drawer']] : []), u.k === 'sink' && n === 0 ? 'drawer' : String(n ?? (u.k === 'onbox' ? 1 : u.w > 0.5 ? 2 : 1)), k => up(x => { x.n = k === 'drawer' ? 0 : +k; }), 'kit-n');
    if (['drawers', 'hob'].includes(u.k)) seg(t('Drawers'), [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], String(n || (u.k === 'hob' ? 2 : 3)), k => up(x => { x.n = +k; }), 'kit-n');
    if (u.k === 'tall') seg(t('Doors'), [['1', 'One door'], ['2', 'Two doors']], String(n || 2), k => up(x => { x.n = +k; }), 'kit-n');
    if (u.k === 'niche') seg(t('Doors above'), [['1', '1'], ['2', '2']], String(n || 2), k => up(x => { x.n = +k; }), 'kit-n');
    const single = (['base', 'sink', 'onbox'].includes(u.k) && (n ?? (u.k === 'onbox' ? 1 : u.w > 0.5 ? 2 : 1)) === 1) || ['tall', 'fridge', 'ovens', 'corner'].includes(u.k);
    if (single) seg(t('Hinges'), [['L', 'Left'], ['R', 'Right']], u.hinge || (u.k === 'corner' ? ((u.blind || 'R') === 'R' ? 'L' : 'R') : 'R'), k => up(x => { x.hinge = k; }), 'kit-hinge');
    const cmF = (label, id, val, fn, lo, hi) => {
      const i2 = h('input', { class: 'input num', id, value: String(Math.round(val * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro });
      i2.onchange = () => { const v = parseFloat(i2.value.replace(',', '.')); if (isFinite(v)) up(x => fn(x, clamp(v / 100, lo, hi))); };
      return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, i2, h('span', { class: 'unit' }, 'cm')));
    };
    if (u.k === 'corner') {
      seg(t('Blind side'), [['L', 'Left'], ['R', 'Right']], u.blind || 'R', k => up(x => { x.blind = k; }), 'kit-blind');
      sec.appendChild(h('div', { class: 'field-row' }, cmF(t('Door width'), 'f-kit-door', u.door || 0.5, (x, v) => { x.door = v; }, 0.2, 1)));
    }
    if (u.k === 'sink') sec.appendChild(h('div', { class: 'field-row' }, cmF(t('Bowl width'), 'f-kit-sw', u.sinkW || 0.55, (x, v) => { x.sinkW = v; }, 0.2, 1.2), cmF(t('Bowl depth'), 'f-kit-sd', u.sinkD || 0.43, (x, v) => { x.sinkD = v; }, 0.25, 0.6)));
    if (u.k === 'hob') {
      sec.appendChild(h('div', { class: 'field-row' }, cmF(t('Hob width'), 'f-kit-hw', u.hobW || 0.78, (x, v) => { x.hobW = v; }, 0.3, 1.2), cmF(t('Hob depth'), 'f-kit-hd', u.hobD || 0.51, (x, v) => { x.hobD = v; }, 0.3, 0.6)));
      sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'chip', id: 'f-kit-dd', 'aria-pressed': String(!!u.dd), disabled: ro, onclick: () => up(x => { x.dd = !x.dd || undefined; }) }, t('Downdraft extractor in the worktop'))));
    }
    if (u.k === 'niche') {
      sec.appendChild(h('div', { class: 'field-row three' },
        cmF(t('Fridge width'), 'f-kit-fw', u.fw || 0.9, (x, v) => { x.fw = v; }, 0.4, 1.5),
        cmF(t('Fridge height'), 'f-kit-fh', u.fh || 1.8, (x, v) => { x.fh = v; }, 0.5, 2.4),
        cmF(t('Fridge depth'), 'f-kit-fd', u.fd || 0.7, (x, v) => { x.fd = v; }, 0.3, 1.0)));
      sec.appendChild(h('div', { class: 'field-row' }, cmF(t('Cupboards above, height'), 'f-kit-th', u.topH ?? 0.45, (x, v) => { x.topH = v; }, 0, 1.2)));
      seg(t('Fridge colour'), [['steel', 'Stainless steel'], ['black', 'Black'], ['white', 'White']], u.fc || 'steel', k => up(x => { x.fc = k; }), 'kit-fc');
      sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'chip', 'aria-pressed': String(u.grille !== false), disabled: ro, onclick: () => up(x => { x.grille = x.grille === false ? undefined : false; }) }, t('Ventilation grilles above'))));
    }
    if (u.k === 'onbox') sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'chip', 'aria-pressed': String(u.blind !== false), disabled: ro, onclick: () => up(x => { x.blind = x.blind === false ? undefined : false; }) }, t('Close off under the worktop'))));
    if (u.k === 'filler' || u.k === 'panel') seg(t('Height'), [['auto', 'Like its neighbours'], ['base', 'Up to the worktop'], ['tall', 'Up to the tall units']], u.tall === true ? 'tall' : u.tall === false ? 'base' : 'auto', k => up(x => { if (k === 'auto') delete x.tall; else x.tall = k === 'tall'; }), 'kit-ph');
    if (u.k === 'ovens') {
      const apps = (u.apps || OVENS_DEFAULT).map(a => ({ ...a }));
      const box2 = h('div', { class: 'kit-apps' }, h('span', { class: 'flabel' }, t('From the bottom up')));
      apps.forEach((a, j) => {
        const s2 = h('select', { class: 'select sm', disabled: ro, 'aria-label': t('Appliance') }, ...Object.entries(K_APPS).map(([k, d]) => h('option', { value: k, selected: a.a === k }, t(d.name))));
        s2.onchange = () => up(x => { const L2 = (x.apps || OVENS_DEFAULT).map(q => ({ ...q })); L2[j] = { a: s2.value, h: K_APPS[s2.value].h }; x.apps = L2; });
        const hIn = h('input', { class: 'input sm num', value: String(Math.round(a.h * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro, 'aria-label': t('Height in cm') });
        hIn.onchange = () => { const v = parseFloat(hIn.value.replace(',', '.')); if (isFinite(v) && v > 2) up(x => { const L2 = (x.apps || OVENS_DEFAULT).map(q => ({ ...q })); L2[j].h = +(v / 100).toFixed(4); x.apps = L2; }); };
        box2.appendChild(h('div', { class: 'run-row' }, h('span', { class: 'run-n num' }, String(j + 1)), s2, h('div', { class: 'input-unit run-w' }, hIn, h('span', { class: 'unit' }, 'cm')),
          ro ? null : h('button', { class: 'btn ghost icon sm', 'aria-label': t('Remove'), title: t('Remove'), onclick: () => up(x => { const L2 = (x.apps || OVENS_DEFAULT).map(q => ({ ...q })); L2.splice(j, 1); x.apps = L2; }) }, icon('close'))));
      });
      if (!ro) box2.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => up(x => { x.apps = [...(x.apps || OVENS_DEFAULT).map(q => ({ ...q })), { a: 'oven', h: 0.6 }]; }) }, icon('plus'), t('Add an appliance'))));
      box2.appendChild(h('p', { class: 'note-muted' }, t('Above the last one: a door up to the top.')));
      sec.appendChild(box2);
    }
    if (side === 'front' && !isIsland(f) && colZone(runLayout(f), i) === 'base' && u.k !== 'gap') sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'chip', 'aria-pressed': String(u.wall !== false && f.wallUnits !== false), disabled: ro || f.wallUnits === false, onclick: () => up(x => { x.wall = x.wall === false ? undefined : false; }) }, t('Wall cabinet above'))));
    if (!ro) sec.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => this.updateSide(f.id, side, list => { list.splice(i + 1, 0, { ...clone(u) }); this.kitSel.i = i + 1; }) }, icon('dup'), t('Duplicate')),
      h('button', { class: 'btn sm', onclick: () => this.updateSide(f.id, side, list => { const half = +(u.w / 2).toFixed(4); list.splice(i, 1, { ...clone(u), w: half }, { ...clone(u), w: +(u.w - half).toFixed(4) }); }) }, icon('split'), t('Split in two')),
      h('button', { class: 'btn sm danger', disabled: (side === 'back' ? f.back : runUnits(f)).length < 2, onclick: () => this.updateSide(f.id, side, list => { list.splice(i, 1); this.kitSel.i = Math.max(0, i - 1); }) }, icon('trash'), t('Remove'))));
    return sec;
  },
  /** the run: wall cabinets, hood, bulkhead, sizes, corner, island back row and stools */
  kitRunSection(f, ro, CH) {
    const isl = isIsland(f);
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, isl ? t('The island') : t('The run')));
    const chip = (label, on, fn, id) => h('button', { class: 'chip', id, 'aria-pressed': String(!!on), disabled: ro, onclick: fn }, label);
    const opts = h('div', { class: 'actions' });
    if (!isl) {
      opts.appendChild(chip(t('Wall cabinets'), f.wallUnits !== false, () => this.updateFurn(f.id, x => { x.wallUnits = x.wallUnits === false; })));
      opts.appendChild(chip(t('Hood over the hob'), f.hood !== false, () => this.updateFurn(f.id, x => { x.hood = x.hood === false; })));
      opts.appendChild(chip(t('Bulkhead up to the ceiling'), !!f.bulk, () => this.updateFurn(f.id, x => { x.bulk = !x.bulk || undefined; }), 'f-kit-bulk'));
    } else {
      opts.appendChild(chip(t('Worktop down the ends'), !!f.waterfall, () => this.updateFurn(f.id, x => { x.waterfall = !x.waterfall; })));
      opts.appendChild(chip(t('Cupboards on the back too'), hasBack(f), () => this.updateFurn(f.id, x => { if (hasBack(x)) { delete x.back; delete x.bd; delete x.cd; } else { x.cd = Math.min(0.6, x.d - 0.3); x.bd = Math.min(0.35, x.d - x.cd); x.back = [{ k: 'base', w: x.w }]; } }), 'f-kit-back'));
      if (!ro) opts.appendChild(h('button', { class: 'btn sm', onclick: () => this.placeStools(f.id) }, icon('plus'), t('Place bar stools')));
    }
    sec.appendChild(opts);
    const cmIn = (label, id, val, fn) => { const i2 = h('input', { class: 'input num', id, value: String(Math.round(val * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro }); i2.onchange = () => { const v = parseFloat(i2.value.replace(',', '.')); if (isFinite(v)) fn(v / 100); }; return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, i2, h('span', { class: 'unit' }, 'cm'))); };
    const rows = [];
    rows.push(cmIn(t('Worktop height'), 'f-kit-h', f.h, v => this.updateFurn(f.id, x => { x.h = clamp(v, 0.6, 1.2); })));
    if (!isl) {
      rows.push(cmIn(t('Worktop sticks out'), 'f-kit-ov', runTopOv(f), v => this.updateFurn(f.id, x => { x.topOv = clamp(v, 0, 0.4); })));
      rows.push(cmIn(t('Tall units'), 'f-kit-tall', runTallH(f), v => this.updateFurn(f.id, x => { x.tallH = clamp(v, 1.2, 2.8); })));
      rows.push(cmIn(t('Wall cabinets from'), 'f-kit-wz', f.wallZ || 1.45, v => this.updateFurn(f.id, x => { x.wallZ = clamp(v, 1.1, 2.2); })));
      rows.push(cmIn(t('Wall cabinet height'), 'f-kit-wh', f.wallH || 0.7, v => this.updateFurn(f.id, x => { x.wallH = clamp(v, 0.2, 1.2); })));
      const [tl, tr] = f.topTrim || [0, 0];
      rows.push(cmIn(t('Worktop shorter, left'), 'f-kit-tl', tl, v => this.updateFurn(f.id, x => { x.topTrim = [clamp(v, 0, x.w), (x.topTrim || [0, 0])[1]]; })));
      rows.push(cmIn(t('Worktop shorter, right'), 'f-kit-tr', tr, v => this.updateFurn(f.id, x => { x.topTrim = [(x.topTrim || [0, 0])[0], clamp(v, 0, x.w)]; })));
    } else {
      rows.push(cmIn(t('Cupboard depth'), 'f-kit-cd', runCabDepth(f), v => this.updateFurn(f.id, x => { x.cd = clamp(v, 0.2, x.d - (hasBack(x) ? 0.1 : 0)); })));
      if (hasBack(f)) rows.push(cmIn(t('Back cupboard depth'), 'f-kit-bd', runBackDepth(f), v => this.updateFurn(f.id, x => { x.bd = clamp(v, 0.1, x.d - runCabDepth(x)); })));
      rows.push(cmIn(t('Worktop past the ends'), 'f-kit-te', f.topEnd || 0, v => this.updateFurn(f.id, x => { x.topEnd = clamp(v, 0, 0.6); })));
    }
    for (let i = 0; i < rows.length; i += 2) sec.appendChild(h('div', { class: 'field-row' }, rows[i], rows[i + 1] || h('div')));
    if (!isl && !ro) sec.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => this.addCornerRun(f.id, 'L') }, icon('plus'), t('Run around the corner, left')),
      h('button', { class: 'btn sm', onclick: () => this.addCornerRun(f.id, 'R') }, icon('plus'), t('Run around the corner, right'))));
    void CH;
    return sec;
  },
  /** the look: fronts, handles, cabinets, plinth, worktop, sink and tap */
  kitLookSection(f, ro) {
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('The look')));
    const up = fn => this.updateFurn(f.id, fn);
    const colorField = (label, id, val, fn, sw) => {
      const c = h('input', { type: 'color', id, value: val, disabled: ro, 'aria-label': label });
      c.addEventListener('input', () => this.updateFurn(f.id, x => fn(x, c.value), 'kc-' + id));
      return h('div', { class: 'field' }, h('span', { class: 'flabel' }, label), h('div', { class: 'color-row' }, c, h('div', { class: 'swatches' }, ...sw.map(cc => h('button', { class: 'swatch', style: { background: cc }, disabled: ro, 'aria-label': label + ' ' + cc, 'aria-pressed': String((val || '').toLowerCase() === cc.toLowerCase()), onclick: () => up(x => fn(x, cc)) })))));
    };
    sec.appendChild(colorField(t('Fronts'), 'f-kit-front', f.color || '#E9E6E0', (x, v) => { x.color = v; }, ['#F2F0EC', '#E9E6E0', '#C9C4BA', '#8C8780', '#3C3E40', '#1E1F21', '#A88A6A', '#B08A62', '#6E5440', '#5E6B5A']));
    sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'chip', id: 'f-kit-grain', 'aria-pressed': String(!!f.grain), disabled: ro, onclick: () => up(x => { x.grain = !x.grain || undefined; }) }, t('Wood grain'))));
    sec.appendChild(this.segRow(t('Handles'), K_HANDLES, f.handles || 'bar', k => up(x => { x.handles = k; }), ro, 'kit-handles'));
    if ((f.handles || 'bar') !== 'none') sec.appendChild(this.segRow(t('Handle colour'), [['steel', 'Steel'], ['black', 'Black'], ['gold', 'Gold'], ['brass', 'Brass'], ['white', 'White']], f.handleC || 'steel', k => up(x => { x.handleC = k; }), ro, 'kit-hc'));
    sec.appendChild(colorField(t('Cabinets (inside, sides)'), 'f-kit-car', f.carcass || tint(f.color || '#E9E6E0', 0.8), (x, v) => { x.carcass = v; }, ['#F2F0EC', '#B9B5AC', '#5A5B5D', '#3A3B3D']));
    sec.appendChild(colorField(t('Plinth'), 'f-kit-pl', f.plinthC || '#1d1f21', (x, v) => { x.plinthC = v; }, ['#1d1f21', '#3A3B3D', '#8C8780', '#E9E6E0']));
    sec.appendChild(this.segRow(t('Worktop'), K_TOPS, f.topMat || 'plain', async k => {
      if (k === 'photo' && !f.topImg) { const id = await this.pickPicture(null, { title: t('Photo of the worktop'), empty: t('No pictures yet. Add a photo of a sample of the worktop, straight from above; then set how wide the piece in the photo is.') }); if (!id) return; up(x => { x.topMat = 'photo'; x.topImg = id; x.topImgW = x.topImgW || 0.3; const im = projectImage(id); if (im) x.top = im.avg; }); return; }
      up(x => { x.topMat = k; });
    }, ro, 'kit-topmat'));
    if ((f.topMat || 'plain') === 'photo') {
      sec.appendChild(this.photoSampleRow(f.topImg, ro, 'f-kit-top', t('Photo of the worktop'), async () => { const id = await this.pickPicture(f.topImg, { title: t('Photo of the worktop') }); if (id) up(x => { x.topImg = id; const im = projectImage(id); if (im) x.top = im.avg; }); }, () => up(x => { x.topMat = 'plain'; delete x.topImg; })));
      const wIn = h('input', { class: 'input num', id: 'f-kit-topimgw', value: String(Math.round((f.topImgW || 0.3) * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro });
      wIn.onchange = () => { const v = parseFloat(wIn.value.replace(',', '.')); if (isFinite(v) && v > 0) up(x => { x.topImgW = clamp(v / 100, 0.02, 4); }); };
      sec.appendChild(h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', { for: 'f-kit-topimgw' }, t('Width of the piece in the photo')), h('div', { class: 'input-unit' }, wIn, h('span', { class: 'unit' }, 'cm'))), h('div')));
    }
    sec.appendChild(colorField(t('Worktop colour'), 'f-kit-top', f.top || furnType(f).top || '#4A4744', (x, v) => { x.top = v; }, ['#F4F3F0', '#E8E4DC', '#4A4744', '#2B2B2B', '#B08A62', '#8C8780', '#6E6A64']));
    const cmIn = (label, id, val, fn) => { const i2 = h('input', { class: 'input num', id, value: String(Math.round(val * 1000) / 10).replace('.', ','), inputmode: 'decimal', disabled: ro }); i2.onchange = () => { const v = parseFloat(i2.value.replace(',', '.')); if (isFinite(v)) up(x => fn(x, v / 100)); }; return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, i2, h('span', { class: 'unit' }, 'cm'))); };
    sec.appendChild(h('div', { class: 'field-row' }, cmIn(t('Worktop thickness'), 'f-kit-tt', runTopT(f), (x, v) => { x.topT = clamp(v, 0.008, 0.12); }), cmIn(t('Plinth height'), 'f-kit-ph', runPlinth(f), (x, v) => { x.plinthH = clamp(v, 0, 0.25); })));
    if (runUnits(f).some(u => u.k === 'sink') || (f.back || []).some(u => u.k === 'sink')) {
      sec.appendChild(this.segRow(t('Sink'), [['black', 'Black'], ['steel', 'Stainless steel'], ['#E9E6E0', 'White']], f.sinkC || 'black', k => up(x => { x.sinkC = k; }), ro, 'kit-sink'));
      sec.appendChild(this.segRow(t('Tap'), [['steel', 'Steel'], ['black', 'Black'], ['gold', 'Gold'], ['brass', 'Brass']], f.tapC || 'steel', k => up(x => { x.tapC = k; }), ro, 'kit-tap'));
    }
    if (!ro) sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'f-kit-lookall', onclick: () => this.kitLookToAll(f.id) }, icon('copy'), t('Use this look for the whole kitchen'))));
    return sec;
  },
  /** the look of this run for every kitchen run and island in the layout */
  kitLookToAll(id) {
    const f = this.furnItems([id])[0];
    if (!f) return;
    let n = 0;
    this.furnMutate(l => { for (const x of l.items) if (x.id !== id && furnType(x).kind === 'krun' && x.storey === f.storey) { for (const k of K_LOOK_KEYS) { if (f[k] === undefined) delete x[k]; else x[k] = clone(f[k]); } n++; } });
    this.toast(t('The same look for {n} other kitchen parts.', { n }));
  },
  /** a second run at one end of this one, round the corner, its back against the other wall */
  addCornerRun(id, end) {
    const f = this.furnItems([id])[0];
    if (!f) return;
    const s = end === 'R' ? 1 : -1;
    // the inner corner at the back of this end, and the run's own direction
    const along = [Math.cos((f.rot || 0) * Math.PI / 180), Math.sin((f.rot || 0) * Math.PI / 180)];
    const C = furnToPlan(f, [s * f.w / 2, -f.d / 2]);
    const rot = ((f.rot || 0) + (s > 0 ? 90 : -90) + 360) % 360;
    const nf = newFurniture('krun', f.storey, 0, 0, rot);
    nf.units = [{ k: 'base', w: 0.6 }, { k: 'drawers', w: 0.6 }];
    nf.w = 1.2; nf.d = f.d;
    for (const k of K_LOOK_KEYS) if (f[k] !== undefined) nf[k] = clone(f[k]);
    // it starts after the corner (this run's worktop covers the corner square)
    const start = f.d + runTopOv(f), dirN = furnToPlan({ x: 0, y: 0, rot }, [s > 0 ? 1 : -1, 0]);
    const a = V.add(C, V.mul(dirN, start)), mid = V.add(a, V.mul(dirN, nf.w / 2));
    const back = furnToPlan({ x: 0, y: 0, rot }, [0, -1]);
    const c = V.sub(mid, V.mul(back, nf.d / 2));
    nf.x = +c[0].toFixed(3); nf.y = +c[1].toFixed(3);
    void along;
    this.furnMutate(l => { l.items.push(nf); });
    this.select({ type: 'furn', ids: [nf.id] });
    this.toast(t('A run round the corner: change its units in its details.'));
  },

  /** stretch a run along the wall it stands against, from corner to corner (or to a door) */
  fitRunToWall(id) {
    const f = this.furnItems([id])[0];
    if (!f) return;
    const plan = this.shownVersion().plan;
    const back = furnToPlan(f, [0, -f.d / 2]), nBack = V.norm(V.sub(back, [f.x, f.y]));
    let best = null;
    for (const w of plan.walls) {
      if (w.storey !== f.storey) continue;
      const d = wallDir(w), n = V.perp(d);
      for (const sg of [1, -1]) {
        const nn = V.mul(n, sg), a = V.add(w.a, V.mul(nn, w.t / 2));
        if (V.dot(nn, nBack) > -0.99) continue;              // the face looks at the back of the run
        const dist = Math.abs(V.dot(V.sub(back, a), nn));
        if (dist > 0.05) continue;
        const u = V.dot(V.sub(back, a), d);
        if (u < -0.05 || u > wallLen(w) + 0.05) continue;
        if (!best || dist < best.dist) best = { w, d, nn, a, u, dist };
      }
    }
    if (!best) { this.toast(t('Put the run with its back against a wall first (snap on).')); return; }
    // the free stretch of this face around the run: up to the corners (other walls) and the doors in it
    const { w, d, a, u } = best;
    let lo = 0, hi = wallLen(w);
    for (const op of openingsOf(plan, w.id)) {
      if (op.kind === 'window' && op.sill >= f.h) continue;
      const s0 = op.pos - op.w / 2, s1 = op.pos + op.w / 2;
      if (s1 <= u) lo = Math.max(lo, s1); else if (s0 >= u) hi = Math.min(hi, s0);
    }
    // walls that meet this face (their face is the end of the run)
    for (const o of plan.walls) {
      if (o === w || o.storey !== w.storey) continue;
      const od = wallDir(o);
      if (Math.abs(V.dot(od, d)) > 0.2) continue;
      for (const sg of [1, -1]) {
        const on = V.mul(V.perp(od), sg), oa = V.add(o.a, V.mul(on, o.t / 2));
        // where the other wall's face crosses this face's line
        const den = V.dot(d, on);
        if (Math.abs(den) < 1e-6) continue;
        const s2 = V.dot(V.sub(oa, a), on) / den;
        // only walls that reach this face
        const pr = projectOnSegment(V.add(a, V.mul(d, s2)), o.a, o.b);
        if (pr.d > o.t / 2 + 0.05) continue;
        if (s2 <= u && s2 > lo) lo = s2; else if (s2 >= u && s2 < hi) hi = s2;
      }
    }
    const len = hi - lo;
    if (len < 0.3) { this.toast(t('There is no room along this wall.')); return; }
    const mid = V.add(a, V.mul(d, (lo + hi) / 2)), c = V.add(mid, V.mul(best.nn, f.d / 2));
    this.updateRun(id, x => {
      const cur = x.units.reduce((s2, uu) => s2 + uu.w, 0);
      let diff = +(len - 0.002 - cur).toFixed(3);
      if (diff > 0) {
        // more room: standard 60 cm cupboards, then the rest as one narrower cupboard, open shelves or a filler
        while (diff >= 0.6 - 1e-6) { x.units.push({ k: 'base', w: 0.6 }); diff = +(diff - 0.6).toFixed(3); }
        if (diff >= 0.3) x.units.push({ k: 'base', w: diff });
        else if (diff >= 0.15) x.units.push({ k: 'open', w: diff });
        else if (diff > 0.001) x.units.push({ k: 'filler', w: diff });
      } else while (diff < -0.001 && x.units.length) {
        const last = x.units[x.units.length - 1];
        if (last.w + diff >= 0.15) { last.w = +(last.w + diff).toFixed(3); diff = 0; }
        else { diff += last.w; x.units.pop(); }
      }
      x.x = +c[0].toFixed(3); x.y = +c[1].toFixed(3);
    });
    this.toast(t('The run now fills the wall: {n} cm.', { n: Math.round(len * 100) }));
  },

  /** bar stools along the overhang of an island, one per 60 cm */
  placeStools(id) {
    const f = this.furnItems([id])[0];
    if (!f) return;
    const n = Math.max(1, Math.floor(f.w / 0.6));
    const stools = [];
    for (let i = 0; i < n; i++) {
      const lx = -f.w / 2 + f.w * (i + 0.5) / n, p = furnToPlan(f, [lx, f.d / 2 + 0.05]);
      const s2 = newFurniture('stool', f.storey, p[0], p[1], f.rot || 0);
      stools.push(s2);
    }
    this.furnMutate(l => { l.items.push(...stools); });
    this.toast(t('{n} bar stools placed.', { n }));
  },
});
