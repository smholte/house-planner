/* ───────────── furniture.js — the furniture catalogue: pieces drawn by the app in any size ─────────────
   Every piece is a box-shaped footprint w × d (metres) turned by rot degrees, standing on the floor (or at
   height z, e.g. wall cabinets, a TV, lights). Local frame of a piece: x to the right, y towards the FRONT
   (the back stands against the wall), so the back edge is y = -d/2. The 2D symbol and the 3D model are both
   built from the same numbers, so a piece can be any size. */

const FURN_CATS = [
  ['living', 'Living'], ['dining', 'Dining'], ['bedroom', 'Bedroom'], ['office', 'Office'],
  ['bathroom', 'Bathroom'], ['kitchen', 'Kitchen'], ['lights', 'Lights'], ['outside', 'Outside'], ['other', 'Other'],
];

/* front: free space wanted in front of the piece (m) for "Check space"; sides: free space on the left and right
   (beds); tuck: may stand partly under a table; flat: lies on the floor (rugs) and never clashes; high: hangs
   above the floor (wall cabinets, lights), only checked against walls */
const FURN_TYPES = [
  // living
  { id: 'sofa3', cat: 'living', name: 'Sofa, 3 seats', kind: 'sofa', seats: 3, w: 2.2, d: 0.92, h: 0.84, color: '#7D8790' },
  { id: 'sofa2', cat: 'living', name: 'Sofa, 2 seats', kind: 'sofa', seats: 2, w: 1.7, d: 0.9, h: 0.84, color: '#7D8790' },
  { id: 'corner', cat: 'living', name: 'Corner sofa', kind: 'corner', w: 2.7, d: 1.65, h: 0.84, color: '#8B8378' },
  { id: 'armchair', cat: 'living', name: 'Armchair', kind: 'sofa', seats: 1, w: 0.85, d: 0.85, h: 0.9, color: '#A5845F' },
  { id: 'coffee', cat: 'living', name: 'Coffee table', kind: 'table', w: 1.1, d: 0.6, h: 0.42, color: '#B08A62', tuck: true },
  { id: 'sidetable', cat: 'living', name: 'Side table', kind: 'round', w: 0.45, d: 0.45, h: 0.5, color: '#3E3B38' },
  { id: 'tvunit', cat: 'living', name: 'TV unit', kind: 'cabinet', w: 1.8, d: 0.42, h: 0.45, color: '#5A4C40', front: 0.4 },
  { id: 'tv', cat: 'living', name: 'TV', kind: 'tv', w: 1.45, d: 0.25, h: 0.85, z: 0.5, color: '#1E1F21', high: true },
  { id: 'bookcase', cat: 'living', name: 'Bookcase', kind: 'bookcase', w: 0.9, d: 0.35, h: 2.0, color: '#E4DED2', front: 0.6 },
  { id: 'sideboard', cat: 'living', name: 'Sideboard', kind: 'cabinet', w: 1.6, d: 0.45, h: 0.8, color: '#8A6A4C', front: 0.6 },
  { id: 'rug', cat: 'living', name: 'Rug', kind: 'rug', w: 2.0, d: 1.4, h: 0.012, color: '#C9BFAE', flat: true },
  { id: 'plant', cat: 'living', name: 'Plant', kind: 'plant', w: 0.5, d: 0.5, h: 1.3, color: '#5E7B4D' },
  // dining
  { id: 'dtable', cat: 'dining', name: 'Dining table', kind: 'table', w: 1.8, d: 0.9, h: 0.75, color: '#B08A62' },
  { id: 'rtable', cat: 'dining', name: 'Round table', kind: 'round', w: 1.2, d: 1.2, h: 0.75, color: '#B08A62' },
  { id: 'chair', cat: 'dining', name: 'Dining chair', kind: 'chair', w: 0.46, d: 0.52, h: 0.85, color: '#4B4B4B', tuck: true },
  { id: 'bench', cat: 'dining', name: 'Bench', kind: 'bench', w: 1.6, d: 0.38, h: 0.46, color: '#B08A62', tuck: true },
  { id: 'stool', cat: 'dining', name: 'Bar stool', kind: 'stool', w: 0.4, d: 0.4, h: 0.65, color: '#3C3C3C', tuck: true },
  // bedroom
  { id: 'bed2', cat: 'bedroom', name: 'Double bed', kind: 'bed', pillows: 2, w: 1.8, d: 2.1, h: 1.0, color: '#D9D2C5', sides: 0.6 },
  { id: 'bed1', cat: 'bedroom', name: 'Single bed', kind: 'bed', pillows: 1, w: 0.9, d: 2.1, h: 0.9, color: '#D9D2C5', sides: 0.6, oneSide: true },
  { id: 'crib', cat: 'bedroom', name: 'Baby cot', kind: 'crib', w: 0.66, d: 1.26, h: 0.9, color: '#F1EEE8', front: 0.5 },
  { id: 'wardrobe', cat: 'bedroom', name: 'Wardrobe', kind: 'wardrobe', w: 2.0, d: 0.6, h: 2.2, color: '#ECE8E0', front: 0.7 },
  { id: 'nightstand', cat: 'bedroom', name: 'Bedside table', kind: 'cabinet', w: 0.45, d: 0.4, h: 0.5, color: '#8A6A4C' },
  { id: 'dresser', cat: 'bedroom', name: 'Chest of drawers', kind: 'cabinet', drawers: true, w: 1.0, d: 0.5, h: 0.85, color: '#ECE8E0', front: 0.7 },
  // office
  { id: 'desk', cat: 'office', name: 'Desk', kind: 'desk', w: 1.4, d: 0.7, h: 0.75, color: '#D8CFC0', front: 0.7 },
  { id: 'ochair', cat: 'office', name: 'Office chair', kind: 'ochair', w: 0.62, d: 0.62, h: 1.05, color: '#2F3437', tuck: true },
  { id: 'shelf', cat: 'office', name: 'Open shelves', kind: 'bookcase', w: 0.8, d: 0.4, h: 1.5, color: '#C9A77F', front: 0.6 },
  // bathroom
  { id: 'wc', cat: 'bathroom', name: 'Toilet, wall-hung', kind: 'toilet', w: 0.38, d: 0.55, h: 0.4, color: '#F7F7F5', front: 0.6 },
  { id: 'wc2', cat: 'bathroom', name: 'Toilet, standing', kind: 'toilet', cistern: true, w: 0.4, d: 0.68, h: 0.8, color: '#F7F7F5', front: 0.6 },
  { id: 'vanity', cat: 'bathroom', name: 'Washbasin unit', kind: 'vanity', basins: 1, w: 0.8, d: 0.46, h: 0.85, color: '#9C8670', front: 0.6 },
  { id: 'vanity2', cat: 'bathroom', name: 'Double washbasin', kind: 'vanity', basins: 2, w: 1.4, d: 0.46, h: 0.85, color: '#9C8670', front: 0.6 },
  { id: 'basin', cat: 'bathroom', name: 'Hand basin', kind: 'vanity', basins: 1, small: true, w: 0.4, d: 0.25, h: 0.85, color: '#F7F7F5', front: 0.5 },
  { id: 'shower', cat: 'bathroom', name: 'Walk-in shower', kind: 'shower', w: 1.2, d: 0.9, h: 2.0, color: '#D6D4CF', flat: true },
  { id: 'bath', cat: 'bathroom', name: 'Bath', kind: 'bath', w: 1.7, d: 0.75, h: 0.58, color: '#F7F7F5', front: 0.6 },
  { id: 'towelrad', cat: 'bathroom', name: 'Towel radiator', kind: 'towelrad', w: 0.6, d: 0.1, h: 1.2, z: 0.2, color: '#E8E6E1', high: true },
  { id: 'washer', cat: 'bathroom', name: 'Washing machine', kind: 'washer', w: 0.6, d: 0.6, h: 0.85, color: '#F2F2F0', front: 0.6 },
  { id: 'dryer', cat: 'bathroom', name: 'Dryer', kind: 'washer', w: 0.6, d: 0.6, h: 0.85, color: '#F2F2F0', front: 0.6 },
  // kitchen
  { id: 'krun', cat: 'kitchen', name: 'Kitchen run (along a wall)', kind: 'krun', w: 4.0, d: 0.6, h: 0.9, color: '#E9E6E0', top: '#4A4744', front: 0.9 },
  { id: 'kbase', cat: 'kitchen', name: 'Base unit', kind: 'kbase', w: 0.6, d: 0.6, h: 0.9, color: '#E9E6E0', top: '#4A4744', front: 0.9 },
  { id: 'ksink', cat: 'kitchen', name: 'Sink unit', kind: 'kbase', sink: true, w: 0.8, d: 0.6, h: 0.9, color: '#E9E6E0', top: '#4A4744', front: 0.9 },
  { id: 'khob', cat: 'kitchen', name: 'Hob unit', kind: 'kbase', hob: true, w: 0.8, d: 0.6, h: 0.9, color: '#E9E6E0', top: '#4A4744', front: 0.9 },
  { id: 'kdw', cat: 'kitchen', name: 'Dishwasher', kind: 'kbase', label: 'DW', w: 0.6, d: 0.6, h: 0.9, color: '#E9E6E0', top: '#4A4744', front: 0.9 },
  { id: 'ktall', cat: 'kitchen', name: 'Tall unit', kind: 'ktall', w: 0.6, d: 0.6, h: 2.1, color: '#E9E6E0', front: 0.9 },
  { id: 'kfridge', cat: 'kitchen', name: 'Fridge-freezer (built in)', kind: 'ktall', label: 'F', w: 0.6, d: 0.6, h: 2.1, color: '#E9E6E0', front: 0.9 },
  { id: 'koven', cat: 'kitchen', name: 'Oven tower', kind: 'ktall', oven: true, w: 0.6, d: 0.6, h: 2.1, color: '#E9E6E0', front: 0.9 },
  { id: 'kwall', cat: 'kitchen', name: 'Wall cabinet', kind: 'kwall', w: 0.6, d: 0.35, h: 0.7, z: 1.45, color: '#E9E6E0', high: true },
  { id: 'khood', cat: 'kitchen', name: 'Cooker hood', kind: 'khood', w: 0.9, d: 0.5, h: 0.5, z: 1.6, color: '#9A9DA0', high: true },
  { id: 'island', cat: 'kitchen', name: 'Kitchen island', kind: 'krun', island: true, w: 2.4, d: 1.0, h: 0.9, ov: 0.3, color: '#E9E6E0', top: '#4A4744', front: 0.9, back: 0.9 },
  { id: 'amfridge', cat: 'kitchen', name: 'American fridge', kind: 'ktall', label: 'F', w: 0.91, d: 0.72, h: 1.78, color: '#B9BCBF', front: 0.9 },
  // lights (they light the room in the evening)
  { id: 'ceilinglight', cat: 'lights', name: 'Ceiling light', kind: 'clight', w: 0.35, d: 0.35, h: 0.08, ceiling: true, light: true, high: true, color: '#F4F2EE' },
  { id: 'pendant', cat: 'lights', name: 'Pendant light', kind: 'pendant', w: 0.4, d: 0.4, h: 0.7, ceiling: true, light: true, high: true, color: '#2E2E2E' },
  { id: 'floorlamp', cat: 'lights', name: 'Floor lamp', kind: 'floorlamp', w: 0.4, d: 0.4, h: 1.6, light: true, color: '#2E2E2E' },
  // outside: cars for the parking place (the size of a real one; its front at the front of the piece). Outside the
  // house a piece stands on the garden and is not in the original (outdoorsAt)
  { id: 'car', cat: 'outside', name: 'Car', kind: 'car', style: 'saloon', w: 1.82, d: 4.6, h: 1.45, color: '#6B747B', noWall: true },
  { id: 'car_ioniq6', cat: 'outside', name: 'Car – Hyundai IONIQ 6 size', kind: 'car', style: 'fast', w: 1.88, d: 4.86, h: 1.5, color: '#3B4248', noWall: true },
  { id: 'car_208', cat: 'outside', name: 'Car – Peugeot 208 size', kind: 'car', style: 'hatch', w: 1.74, d: 3.96, h: 1.46, color: '#AEB3B7', noWall: true },
  // other
  { id: 'box', cat: 'other', name: 'Box (any size)', kind: 'box', w: 0.6, d: 0.6, h: 0.6, color: '#B7B2A8' },
  // a real 3D model (the built-in library or your own); see models.js. Not in the catalogue as such.
  { id: 'model', cat: 'other', name: '3D model', kind: 'model', hidden: true, w: 1, d: 1, h: 1, color: '#B7B2A8' },
];
const FURN = Object.fromEntries(FURN_TYPES.map(t => [t.id, t]));
const furnType = item => item.type === 'model' ? modelType(item) : (FURN[item.type] || FURN.box);
const furnName = item => item.name || t(furnType(item).name);

/** a new piece of a type, at x, y on a storey */
function newFurniture(typeId, storey, x, y, rot = 0) {
  const T = FURN[typeId] || FURN.box;
  const it = { id: uid('f_'), type: T.id, storey, x: +x.toFixed(3), y: +y.toFixed(3), rot, w: T.w, d: T.d, h: T.h, color: T.color, shop: {} };
  if (T.ov != null) it.ov = T.ov;
  if (T.kind === 'krun') { if (T.island) it.island = true; it.units = runUnits(it).map(u => ({ ...u })); }
  return it;
}
/** height above the floor of the underside of a piece (wall cabinets, a TV, lights) */
function furnZ(item, ceilingH) {
  const T = furnType(item);
  if (item.z != null) return item.z;
  if (T.ceiling) return Math.max(0.5, (ceilingH || 2.6) - item.h);
  return T.z || 0;
}

/* ───────── geometry: corners, hit test ───────── */
function furnCorners(it, pad = 0) {
  const a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const hw = it.w / 2 + pad, hd = it.d / 2 + pad;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
}
/** plan point → the piece's own frame (x right, y to the front) */
function furnLocal(it, p) {
  const a = -(it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = p[0] - it.x, dy = p[1] - it.y;
  return [dx * c - dy * s, dx * s + dy * c];
}
function furnToPlan(it, q) {
  const a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [it.x + q[0] * c - q[1] * s, it.y + q[0] * s + q[1] * c];
}
function furnHit(it, p, pad = 0) { const q = furnLocal(it, p); return Math.abs(q[0]) <= it.w / 2 + pad && Math.abs(q[1]) <= it.d / 2 + pad; }

/* ───────── 2D architect symbols (local frame, metres) ───────── */
const F2 = {
  rect(x0, y0, x1, y1, r = 0) {
    if (r <= 0) return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    r = Math.min(r, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2);
    return `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
  },
  circle(cx, cy, r) { return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`; },
  ellipse(cx, cy, rx, ry) { return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`; },
  line(x0, y0, x1, y1) { return `M${x0} ${y0}L${x1} ${y1}`; },
};
const fx = v => +v.toFixed(4);

/** → [{d, c}] with c: 'o' outline (filled), 'l' detail line, 'd' dashed (above / hidden), 'f' dark fill, 't' text */
function furnSymbol(it) {
  const T = furnType(it), w = it.w, d = it.d, X = fx(w / 2), Y = fx(d / 2);
  if (T.kind === 'krun') return runSymbol(it);
  if (T.kind === 'model') return modelSymbol(it);
  if (T.kind === 'modsofa') return renatoSymbol(it);
  const out = [];
  const o = (dd, c = 'o') => out.push({ d: dd, c });
  const R = F2.rect;
  switch (T.kind) {
    case 'car': {
      // seen from above: the body, the glass of the cabin with the roof in it, the mirrors (the front at +Y)
      const P = carProfile(T.style), zf = P.cabFront * d, zr = P.cabRear * d, rf = P.roofFront * d, rr = P.roofRear * d, cw = w * 0.42;
      o(R(-X, -Y, X, Y, fx(Math.min(0.35, w * 0.2))));
      o(R(fx(-cw), fx(zr), fx(cw), fx(zf), 0.12), 'l');
      o(R(fx(-cw + 0.06), fx(rr), fx(cw - 0.06), fx(rf), 0.08), 'l');
      for (const sx of [-1, 1]) o(R(fx(sx > 0 ? X : -X - 0.09), fx(zf - 0.12), fx(sx > 0 ? X + 0.09 : -X), fx(zf - 0.02), 0.02), 'f');
      break;
    }
    case 'sofa': {
      const arm = Math.min(0.2, w * 0.14), back = Math.min(0.22, d * 0.26), n = T.seats || 1;
      o(R(-X, -Y, X, Y, 0.05));
      o(F2.line(-X, fx(-Y + back), X, fx(-Y + back)), 'l');
      o(R(-X, fx(-Y + back), fx(-X + arm), Y, 0.03), 'l');
      o(R(fx(X - arm), fx(-Y + back), X, Y, 0.03), 'l');
      const sw = (w - 2 * arm) / n;
      for (let i = 1; i < n; i++) o(F2.line(fx(-X + arm + sw * i), fx(-Y + back), fx(-X + arm + sw * i), fx(Y - 0.03)), 'l');
      break;
    }
    case 'corner': {
      const sd = Math.min(0.95, d * 0.6), cw = Math.min(0.95, w * 0.4), back = 0.22, arm = 0.2;
      o(`M${-X} ${-Y}H${X}V${Y}H${fx(X - cw)}V${fx(-Y + sd)}H${-X}Z`);
      o(`M${-X} ${fx(-Y + back)}H${fx(X - back)}V${Y}`, 'l');
      o(F2.line(fx(-X + arm), fx(-Y + back), fx(-X + arm), fx(-Y + sd)), 'l');
      o(F2.line(fx(X - cw), fx(-Y + back), fx(X - cw), fx(-Y + sd)), 'l');
      const mid = (-X + arm + X - cw) / 2;
      o(F2.line(fx(mid), fx(-Y + back), fx(mid), fx(-Y + sd)), 'l');
      break;
    }
    case 'table': case 'desk': case 'bench':
      o(R(-X, -Y, X, Y, T.kind === 'bench' ? 0.02 : 0.01));
      if (T.kind === 'desk') o(F2.line(-X, fx(-Y + 0.05), X, fx(-Y + 0.05)), 'l');
      break;
    case 'round': o(F2.ellipse(0, 0, X, Y)); break;
    case 'stool': o(F2.ellipse(0, 0, X, Y)); o(F2.ellipse(0, 0, fx(X * 0.55), fx(Y * 0.55)), 'l'); break;
    case 'chair': {
      o(R(-X, fx(-Y + 0.06), X, Y, 0.04));
      o(R(fx(-X + 0.02), -Y, fx(X - 0.02), fx(-Y + 0.06), 0.02), 'f');
      break;
    }
    case 'ochair': {
      o(F2.circle(0, fx(d * 0.08), fx(Math.min(w, d) * 0.4)));
      o(`M${fx(-X * 0.8)} ${fx(-Y * 0.55)}Q0 ${fx(-Y * 1.15)} ${fx(X * 0.8)} ${fx(-Y * 0.55)}`, 'l');
      break;
    }
    case 'bed': {
      o(R(-X, -Y, X, Y, 0.02));
      o(R(-X, -Y, X, fx(-Y + 0.06)), 'f');
      const n = T.pillows || 1, pw = (w - 0.2) / n;
      for (let i = 0; i < n; i++) o(R(fx(-X + 0.1 + pw * i + 0.03), fx(-Y + 0.12), fx(-X + 0.1 + pw * (i + 1) - 0.03), fx(-Y + 0.42), 0.06), 'l');
      o(F2.line(-X, fx(-Y + 0.55), X, fx(-Y + 0.55)), 'l');
      o(F2.line(fx(X - 0.45), fx(-Y + 0.55), X, fx(-Y + 1.0)), 'l');
      break;
    }
    case 'crib': {
      o(R(-X, -Y, X, Y));
      o(R(fx(-X + 0.04), fx(-Y + 0.04), fx(X - 0.04), fx(Y - 0.04)), 'l');
      break;
    }
    case 'wardrobe': {
      o(R(-X, -Y, X, Y));
      o(F2.line(-X, fx(Y - 0.03), X, fx(Y - 0.03)), 'l');
      const n = Math.max(1, Math.round(w / 0.5));
      for (let i = 1; i < n; i++) o(F2.line(fx(-X + w * i / n), fx(Y - 0.03), fx(-X + w * i / n), Y), 'l');
      o(F2.line(fx(-X + 0.05), 0, fx(X - 0.05), 0), 'd');
      break;
    }
    case 'cabinet': {
      o(R(-X, -Y, X, Y));
      o(F2.line(-X, fx(Y - 0.03), X, fx(Y - 0.03)), 'l');
      if (T.drawers) o(F2.line(0, fx(Y - 0.03), 0, Y), 'l');
      break;
    }
    case 'bookcase': {
      o(R(-X, -Y, X, Y));
      o(R(fx(-X + 0.02), fx(-Y + 0.02), fx(X - 0.02), fx(Y - 0.01)), 'l');
      const n = Math.max(1, Math.round(w / 0.8));
      for (let i = 1; i < n; i++) o(F2.line(fx(-X + w * i / n), -Y, fx(-X + w * i / n), Y), 'l');
      break;
    }
    case 'tv': o(R(-X, fx(-Y * 0.3), X, fx(Y * 0.3)), 'f'); o(R(fx(-X * 0.25), fx(-Y * 0.3), fx(X * 0.25), Y), 'd'); break;
    case 'rug': o(R(-X, -Y, X, Y), 'o'); o(R(fx(-X + 0.06), fx(-Y + 0.06), fx(X - 0.06), fx(Y - 0.06)), 'd'); break;
    case 'plant': {
      o(F2.circle(0, 0, fx(Math.min(X, Y) * 0.55)));
      let p = '';
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; p += F2.line(fx(Math.cos(a) * X * 0.3), fx(Math.sin(a) * Y * 0.3), fx(Math.cos(a) * X), fx(Math.sin(a) * Y)); }
      o(p, 'l');
      break;
    }
    case 'floorlamp': o(F2.ellipse(0, 0, X, Y), 'd'); o(F2.ellipse(0, 0, fx(X * 0.35), fx(Y * 0.35))); break;
    case 'clight': o(F2.ellipse(0, 0, X, Y), 'd'); o(F2.line(fx(-X * 0.7), fx(-Y * 0.7), fx(X * 0.7), fx(Y * 0.7)) + F2.line(fx(X * 0.7), fx(-Y * 0.7), fx(-X * 0.7), fx(Y * 0.7)), 'l'); break;
    case 'pendant': o(F2.ellipse(0, 0, X, Y), 'd'); o(F2.ellipse(0, 0, 0.03, 0.03), 'f'); break;
    case 'toilet': {
      const tank = T.cistern ? 0.18 : 0.08;
      o(R(fx(-X), -Y, fx(X), fx(-Y + tank), 0.02));
      o(F2.ellipse(0, fx((-Y + tank + Y) / 2), fx(X * 0.92), fx((d - tank) / 2)));
      o(F2.ellipse(0, fx((-Y + tank + Y) / 2 + 0.02), fx(X * 0.6), fx((d - tank) / 2 * 0.62)), 'l');
      break;
    }
    case 'vanity': {
      o(R(-X, -Y, X, Y, 0.02));
      const n = T.basins || 1, bw = w / n;
      for (let i = 0; i < n; i++) {
        const cx = fx(-X + bw * (i + 0.5));
        o(F2.ellipse(cx, fx(d * 0.06), fx(Math.min(bw * 0.32, 0.22)), fx(d * 0.3)), 'l');
        o(F2.circle(cx, fx(-Y + 0.06), 0.02), 'f');
      }
      break;
    }
    case 'shower': {
      o(R(-X, -Y, X, Y));
      o(F2.line(-X, -Y, X, Y) + F2.line(X, -Y, -X, Y), 'l');
      o(F2.circle(0, 0, 0.05), 'l');
      o(F2.line(fx(-X), fx(Y), fx(X * 0.1), fx(Y)), 'f');
      break;
    }
    case 'bath': {
      o(R(-X, -Y, X, Y, 0.03));
      o(R(fx(-X + 0.08), fx(-Y + 0.08), fx(X - 0.08), fx(Y - 0.08), Math.min(0.25, d * 0.3)), 'l');
      o(F2.circle(fx(-X + 0.22), 0, 0.03), 'l');
      break;
    }
    case 'towelrad': o(R(-X, -Y, X, Y), 'o'); o(F2.line(fx(-X + 0.03), 0, fx(X - 0.03), 0), 'l'); break;
    case 'washer': {
      o(R(-X, -Y, X, Y, 0.02));
      o(F2.line(fx(-X + 0.05), fx(Y - 0.02), fx(X - 0.05), fx(Y - 0.02)), 'l');
      o(F2.circle(0, fx(Y * 0.15), fx(Math.min(X, Y) * 0.6)), 'l');
      break;
    }
    case 'kbase': {
      o(R(-X, -Y, X, Y));
      o(F2.line(-X, fx(Y - 0.02), X, fx(Y - 0.02)), 'l');
      if (T.sink) { o(R(fx(-X + 0.08), fx(-Y + 0.1), fx(X - 0.08), fx(Y - 0.08), 0.05), 'l'); o(F2.circle(0, fx(-Y + 0.05), 0.025), 'f'); }
      if (T.hob) {
        const bx = Math.min(0.17, w / 4.4), by = Math.min(0.15, d / 4.4);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) o(F2.circle(fx(sx * bx), fx(sy * by), fx(Math.min(bx, by) * 0.6)), 'l');
      }
      if (T.label) out.push({ c: 't', x: 0, y: 0, text: T.label });
      break;
    }
    case 'ktall': {
      o(R(-X, -Y, X, Y));
      o(F2.line(-X, -Y, X, Y) + F2.line(X, -Y, -X, Y), 'l');
      if (T.label) out.push({ c: 't', x: 0, y: fx(Y * 0.55), text: T.label });
      break;
    }
    case 'kwall': o(R(-X, -Y, X, Y), 'd'); o(F2.line(-X, -Y, X, Y), 'd'); break;
    case 'khood': o(R(-X, -Y, X, Y), 'd'); o(R(fx(-X * 0.35), -Y, fx(X * 0.35), fx(-Y + d * 0.4)), 'd'); break;
    case 'island': {
      const ov = Math.min(it.ov != null ? it.ov : (T.ov || 0), d - 0.3);
      o(R(-X, -Y, X, Y, 0.01));
      if (ov > 0.01) o(F2.line(-X, fx(Y - ov), X, fx(Y - ov)), 'd');
      break;
    }
    default: o(R(-X, -Y, X, Y)); o(F2.line(-X, -Y, X, Y) + F2.line(X, -Y, -X, Y), 'd');
  }
  return out;
}

/* ───────── 3D models (local frame: x right, z to the front, y up; origin in the middle on the floor) ───────── */
const FMAT = new Map();
function fmat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = FMAT.get(key);
  if (!m) {
    const prm = { color: new THREE.Color(color), roughness: opts.rough ?? 0.78, metalness: opts.metal ?? 0, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, depthWrite: !opts.opacity, emissiveIntensity: opts.ei ?? 1 };
    if (opts.emissive) prm.emissive = new THREE.Color(opts.emissive);
    m = new THREE.MeshStandardMaterial(prm); FMAT.set(key, m);
  }
  return m;
}
const tint = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

/* ───────── cars (for the parking place) ───────── */
/** the shape of a car seen from the side: z along it (-0.5 the back, 0.5 the front, times the length), y up (times
 *  the height). body: the lower part up to the windows (the wheel arches are cut out when it is built); cab: the
 *  glass on top; the roof is the part of the glass above 0.95 */
function carProfile(style) {
  const S = {
    // a streamlined electric saloon: low nose, long sloping roof to a short tail
    fast: { belt: [0.6, 0.55], nose: 0.46, hood: 0.36, cab: [[-0.475, 0.6], [-0.33, 0.83], [-0.15, 0.975], [0.0, 1.0], [0.06, 0.995], [0.24, 0.6]], axle: [-0.305, 0.305], tail: 0.66 },
    // a small hatchback: the back almost upright
    hatch: { belt: [0.63, 0.6], nose: 0.5, hood: 0.33, cab: [[-0.465, 0.62], [-0.452, 0.9], [-0.42, 0.98], [-0.36, 1.0], [0.0, 1.0], [0.05, 0.99], [0.25, 0.62]], axle: [-0.315, 0.33], tail: 0.66 },
    // a saloon with a boot
    saloon: { belt: [0.61, 0.57], nose: 0.48, hood: 0.35, cab: [[-0.36, 0.61], [-0.27, 0.92], [-0.2, 0.985], [0.02, 0.99], [0.07, 0.975], [0.23, 0.61]], axle: [-0.3, 0.31], tail: 0.64 },
  };
  const C = S[style] || S.saloon;
  const xs = C.cab.map(q => q[0]), tops = C.cab.filter(q => q[1] > 0.95).map(q => q[0]);
  return { ...C, cabRear: Math.min(...xs), cabFront: Math.max(...xs), roofRear: Math.min(...tops), roofFront: Math.max(...tops) };
}
/** a car in 3D: the body in its colour with the wheel arches cut out, dark glass narrowing to the roof, the roof in
 *  the body colour, wheels with rims, mirrors and lights */
function carParts(g, style, w, d, hh, col) {
  const P = carProfile(style);
  const paint = fmat(col, { rough: 0.3, metal: 0.45 }), glassM = fmat('#1C252A', { rough: 0.06, metal: 0.3 }), tyre = fmat('#1B1C1D', { rough: 0.92 }), rim = fmat('#A3A9AD', { rough: 0.28, metal: 0.85 }), dark = fmat('#2A2D30', { rough: 0.7 });
  const L = d, c = 0.17, r = Math.min(0.36, Math.max(0.28, hh * 0.22)), ra = r + 0.04;
  const yb0 = P.belt[0] * hh, yb1 = P.belt[1] * hh, top = hh;
  // the side of the body, counter-clockwise from the back at the bottom; z in metres here
  const pts = [];
  const arch = zc => {
    const b = Math.asin(clamp((r - c) / ra, -1, 1));
    for (let k = 0; k <= 10; k++) { const th = Math.PI + b - (Math.PI + 2 * b) * k / 10; pts.push([zc + ra * Math.cos(th), r + ra * Math.sin(th)]); }
  };
  const zr = P.axle[0] * L, zf = P.axle[1] * L, zws = P.cabFront * L;
  pts.push([-L / 2 + 0.1, c + 0.02]);
  arch(zr);
  arch(zf);
  pts.push([L / 2 - 0.12, c + 0.02], [L / 2 - 0.03, c + 0.1], [L / 2, P.nose * hh * 0.62], [L / 2 - 0.015, P.nose * hh], [L / 2 - 0.08, P.nose * hh + 0.04],
    [L / 2 - P.hood * L * 0.5, yb1 - 0.03], [zws, yb1], [P.cabRear * L, yb0], [-L / 2 + 0.06, P.tail * hh], [-L / 2 + 0.01, P.tail * hh - 0.06], [-L / 2, c + 0.2], [-L / 2 + 0.03, c + 0.06]);
  // extrude across the car, then round it: narrower towards the ends (seen from above) and towards the top
  const extrude = (shapePts, width, m, shape) => {
    const sh = new THREE.Shape(shapePts.map(([z, y]) => new THREE.Vector2(z, y)));
    const bev = Math.min(0.06, width * 0.03);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.02, width - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 3, curveSegments: 6 });
    geo.rotateY(-Math.PI / 2).translate((width - 2 * bev) / 2, 0, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); pos.setX(i, x * shape(y, z)); }
    geo.computeVertexNormals();
    const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; g.add(me); return me;
  };
  const endRound = z => 1 - 0.13 * Math.pow(Math.min(1, Math.abs(z) / (L / 2)), 5);
  extrude(pts, w, paint, (y, z) => endRound(z) * (1 - 0.05 * clamp((y - yb1 + 0.12) / 0.2, 0, 1)));
  // the glass: in from the body's sides, narrowing to the roof (tumblehome)
  const cabPts = P.cab.map(([z, y]) => [z * L, y * hh]);
  const glassShape = (y, z) => endRound(z) * (1 - 0.2 * clamp((y - yb1) / (top - yb1), 0, 1));
  extrude(cabPts, w * 0.9, glassM, glassShape);
  // the roof: a band along the top of the glass, a little wider than the glass there
  const tp = cabPts.filter(q => q[1] > 0.93 * hh);
  if (tp.length >= 2) {
    const band = [...tp.map(([z, y]) => [z, y + 0.012]), ...[...tp].reverse().map(([z, y]) => [z + (z < 0 ? 0.04 : -0.04), y - 0.06])];
    extrude(band, w * 0.9 + 0.03, paint, glassShape);
  }
  // wheels with rims, just inside the body
  const tw = 0.23;
  for (const az of P.axle) for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - tw / 2 - 0.035);
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tw, 24).rotateZ(Math.PI / 2), tyre); t1.position.set(x, r, az * L); t1.castShadow = true; g.add(t1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, tw + 0.012, 20).rotateZ(Math.PI / 2), rim); t2.position.set(x, r, az * L); g.add(t2);
  }
  // under the car, between the wheels
  { const me = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.12, L * 0.84), dark); me.position.set(0, c + 0.06, 0); g.add(me); }
  // mirrors at the foot of the windscreen
  for (const sx of [-1, 1]) { const me = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), paint); me.position.set(sx * (w / 2 + 0.03), yb1 + 0.1, zws - 0.12); me.castShadow = true; g.add(me); }
  // lights: front (white), back (red; one band across the back of the streamlined car)
  const lamp = (lw, lh, z, y, color, x = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.03), fmat(color, { rough: 0.2, emissive: color, ei: 0.25 })); me.position.set(x, y, z); g.add(me); };
  for (const sx of [-1, 1]) lamp(w * 0.2, 0.05, L / 2 - 0.02, P.nose * hh - 0.03, '#F3F1E8', sx * w * 0.3);
  if (style === 'fast') lamp(w * 0.86, 0.035, -L / 2 + 0.035, P.tail * hh - 0.08, '#B3202A');
  else for (const sx of [-1, 1]) lamp(w * 0.18, 0.08, -L / 2 + 0.03, P.tail * hh - 0.1, '#B3202A', sx * w * 0.33);
}
/** is this point outside the house – on the lowest storey of a house with a plot, and not closed in by its outside
 *  walls (a line to each side meets one)? A piece of furniture there (a car on the parking place, garden chairs)
 *  stands on the garden, not on the floor, and is not shown in the original (as delivered). */
function outdoorsAt(p, plan, sid, pt) {
  if (!p || !p.site || !plan) return false;
  const low = sortedStoreys(p)[0];
  if (!low || low.id !== sid) return false;
  const walls = plan.walls.filter(w => w.storey === sid && w.kind !== 'interior');
  if (walls.length < 3) return false;
  const hits = d => walls.some(w => {
    // the line from pt in direction d meets the wall a–b?
    const e = V.sub(w.b, w.a), den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return false;
    const q = V.sub(w.a, pt), tt = (q[0] * e[1] - q[1] * e[0]) / den, u = (q[0] * d[1] - q[1] * d[0]) / den;
    return tt > 0 && u >= -0.001 && u <= 1.001;
  });
  return ![[1, 0], [-1, 0], [0, 1], [0, -1]].every(hits);
}
function furnMesh(it, ceilingH, evening) {
  const T = furnType(it), w = it.w, d = it.d, hh = it.h, col = it.color || T.color;
  if (T.kind === 'krun') return runMesh(it, ceilingH, evening);
  if (T.kind === 'model') return modelMesh(it, ceilingH, evening);
  if (T.kind === 'modsofa') return renatoMesh(it);
  const g = new THREE.Group();
  // sofas: the real fabric picture (texlib.js) in the sofa's colour, on boxes whose UVs are in metres
  const fab = (T.kind === 'sofa' || T.kind === 'corner') && libSet('Fabric028');
  const fabM = c => libMaterial('Fabric028', { tint: c, contrast: 0.9 });
  const M = fab ? fabM(col) : fmat(col), Mdark = fab ? fabM(tint(col, 0.72)) : fmat(tint(col, 0.72)), Mlight = fab ? fabM(tint(col, 1.08)) : fmat(tint(col, 1.08));
  const box = (bw, bh, bd, x, y, z, m = M) => { if (bw <= 0 || bh <= 0 || bd <= 0) return null; const me = new THREE.Mesh(fab ? meterBox(bw, bh, bd) : new THREE.BoxGeometry(bw, bh, bd), m); me.position.set(x, y + bh / 2, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
  const cyl = (rt, rb, ch, x, y, z, m = M, seg = 20) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, ch, seg), m); me.position.set(x, y + ch / 2, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
  const legs = (lw, ld, lh, inset, m) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(lw, lh, lw, sx * (w / 2 - inset - lw / 2), 0, sz * (ld / 2 - inset - lw / 2), m); };
  const metal = fmat('#7C7F82', { rough: 0.35, metal: 0.6 }), black = fmat('#202224', { rough: 0.4 }), white = fmat('#F5F4F1'), glass = fmat('#A9C7D6', { rough: 0.05, opacity: 0.28 });
  const Z = d / 2;
  switch (T.kind) {
    case 'car': carParts(g, T.style, w, d, hh, col); break;
    case 'sofa': {
      const arm = Math.min(0.2, w * 0.14), back = Math.min(0.22, d * 0.26), seatH = 0.44, n = T.seats || 1;
      box(w, 0.12, d, 0, 0.04, 0, Mdark);
      box(w - 2 * arm, seatH - 0.16, d - back, 0, 0.16, back / 2);
      box(w, hh - 0.04, back, 0, 0.04, -Z + back / 2);
      for (const sx of [-1, 1]) box(arm, 0.64 - 0.04, d - back, sx * (w / 2 - arm / 2), 0.04, back / 2);
      const sw = (w - 2 * arm) / n;
      for (let i = 0; i < n; i++) box(sw - 0.02, 0.12, d - back - 0.04, -w / 2 + arm + sw * (i + 0.5), seatH - 0.04, back / 2 + 0.01, Mlight);
      break;
    }
    case 'corner': {
      const sd = Math.min(0.95, d * 0.6), cw = Math.min(0.95, w * 0.4), back = 0.22, arm = 0.2, seatH = 0.44;
      box(w, seatH - 0.04, sd, 0, 0.04, -Z + sd / 2);
      box(cw, seatH - 0.04, d - sd, w / 2 - cw / 2, 0.04, -Z + sd + (d - sd) / 2);
      box(w, hh - 0.04, back, 0, 0.04, -Z + back / 2, Mdark);
      box(back, hh - 0.04, d - back, w / 2 - back / 2, 0.04, -Z + back + (d - back) / 2, Mdark);
      box(arm, 0.6, sd - back, -w / 2 + arm / 2, 0.04, -Z + back + (sd - back) / 2, Mdark);
      box(w - arm - back - 0.02, 0.1, sd - back - 0.02, -w / 2 + arm + (w - arm - back) / 2, seatH, -Z + back + (sd - back) / 2, Mlight);
      box(cw - back - 0.02, 0.1, d - sd - 0.02, w / 2 - back - (cw - back) / 2, seatH, -Z + sd + (d - sd) / 2, Mlight);
      break;
    }
    case 'table': case 'desk': {
      box(w, 0.035, d, 0, hh - 0.035, 0);
      legs(0.05, d, hh - 0.035, 0.05, T.kind === 'desk' ? metal : Mdark);
      break;
    }
    case 'bench': box(w, 0.04, d, 0, hh - 0.04, 0); for (const sx of [-1, 1]) box(0.04, hh - 0.04, d * 0.85, sx * (w / 2 - 0.1), 0, 0, Mdark); break;
    case 'round': {
      const top = cyl(w / 2, w / 2, 0.035, 0, hh - 0.035, 0, M, 40); top.scale.z = d / w;
      cyl(0.04, 0.04, hh - 0.035, 0, 0, 0, Mdark, 12);
      const base = cyl(Math.min(w, d) * 0.3, Math.min(w, d) * 0.3, 0.03, 0, 0, 0, Mdark, 24);
      base.scale.z = d / w;
      break;
    }
    case 'stool': cyl(w / 2, w / 2, 0.05, 0, hh - 0.05, 0, M, 24); cyl(0.025, 0.025, hh - 0.05, 0, 0, 0, metal, 10); cyl(w * 0.4, w * 0.4, 0.02, 0, 0, 0, metal, 20); break;
    case 'chair': {
      const seatH = 0.46;
      box(w, 0.04, d - 0.04, 0, seatH - 0.04, 0.02);
      legs(0.035, d - 0.04, seatH - 0.04, 0.02, Mdark);
      box(w - 0.04, hh - seatH, 0.04, 0, seatH, -Z + 0.04);
      break;
    }
    case 'ochair': {
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, leg = box(0.04, 0.03, w * 0.45, Math.sin(a) * w * 0.22, 0.04, Math.cos(a) * w * 0.22, black); leg.rotation.y = a; }
      cyl(0.025, 0.025, 0.4, 0, 0.06, 0, metal, 10);
      box(w * 0.78, 0.08, d * 0.72, 0, 0.45, 0.04);
      box(w * 0.7, hh - 0.6, 0.06, 0, 0.6, -Z * 0.72);
      break;
    }
    case 'bed': {
      const frameH = 0.3, mat = 0.22, n = T.pillows || 1;
      box(w, frameH, d, 0, 0, 0, Mdark);
      box(w - 0.04, mat, d - 0.06, 0, frameH, 0.02, white);
      box(w, hh, 0.07, 0, 0, -Z + 0.035, Mdark);
      const pw = (w - 0.2) / n;
      for (let i = 0; i < n; i++) box(pw - 0.06, 0.1, 0.3, -w / 2 + 0.1 + pw * (i + 0.5), frameH + mat, -Z + 0.27, white);
      box(w - 0.02, 0.06, d - 0.55, 0, frameH + mat - 0.02, -Z + 0.55 + (d - 0.55) / 2, M);
      break;
    }
    case 'crib': {
      box(w, 0.06, d, 0, 0.3, 0, white);
      for (const sx of [-1, 1]) box(0.03, hh, d, sx * (w / 2 - 0.015), 0, 0, M);
      for (const sz of [-1, 1]) box(w, hh, 0.03, 0, 0, sz * (d / 2 - 0.015), M);
      break;
    }
    case 'wardrobe': {
      box(w, hh, d, 0, 0, 0);
      const n = Math.max(1, Math.round(w / 0.5));
      for (let i = 1; i < n; i++) box(0.006, hh - 0.04, 0.005, -w / 2 + w * i / n, 0.02, Z + 0.002, Mdark);
      for (let i = 0; i < n; i++) box(0.02, 0.3, 0.025, -w / 2 + w * (i + 0.5) / n + (i % 2 ? -1 : 1) * (w / n / 2 - 0.06), hh * 0.45, Z + 0.012, metal);
      break;
    }
    case 'cabinet': {
      const foot = hh > 0.35 ? 0.08 : 0.02;
      box(w, hh - foot, d, 0, foot, 0);
      if (foot > 0.03) legs(0.035, d, foot, 0.04, Mdark);
      if (T.drawers) { const k = 3; for (let i = 1; i < k; i++) box(w - 0.02, 0.006, 0.005, 0, foot + (hh - foot) * i / k, Z + 0.002, Mdark); }
      else box(0.006, hh - foot - 0.04, 0.005, 0, foot + 0.02, Z + 0.002, Mdark);
      break;
    }
    case 'bookcase': {
      const t2 = 0.022, n = Math.max(1, Math.round(w / 0.8));
      for (let i = 0; i <= n; i++) box(t2, hh, d, -w / 2 + t2 / 2 + (w - t2) * i / n, 0, 0);
      const shelves = Math.max(2, Math.round(hh / 0.36));
      for (let i = 0; i <= shelves; i++) box(w, t2, d, 0, Math.min(hh - t2, i * (hh - t2) / shelves), 0);
      box(w, hh, 0.01, 0, 0, -Z + 0.005, Mdark);
      break;
    }
    case 'tv': {
      const z0 = 0; // panel (the height above the floor is set on the whole piece)
      box(w, hh * 0.92, 0.04, 0, hh * 0.08 + z0, -Z * 0.1, black);
      box(w * 0.3, 0.02, d * 0.9, 0, z0, 0, black);
      box(0.06, hh * 0.1, 0.03, 0, z0, -Z * 0.1, black);
      break;
    }
    case 'rug': box(w, Math.max(0.006, hh), d, 0, 0, 0); break;
    case 'plant': {
      cyl(Math.min(w, d) * 0.28, Math.min(w, d) * 0.22, hh * 0.3, 0, 0, 0, fmat('#B9A58C'), 20);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.5, 14, 10), M);
      leaves.scale.set(1, (hh * 0.75) / Math.min(w, d), d / w);
      leaves.position.y = hh * 0.3 + hh * 0.35;
      leaves.castShadow = true;
      g.add(leaves);
      break;
    }
    case 'floorlamp': {
      cyl(Math.min(w, d) * 0.35, Math.min(w, d) * 0.35, 0.03, 0, 0, 0, M, 24);
      cyl(0.012, 0.012, hh - 0.3, 0, 0.03, 0, M, 8);
      const shade = cyl(Math.min(w, d) * 0.3, Math.min(w, d) * 0.45, 0.3, 0, hh - 0.32, 0, fmat('#F2EBDD', { emissive: evening ? '#ffcf8a' : '#000000', ei: evening ? 0.9 : 0 }), 28);
      shade.castShadow = false;
      break;
    }
    case 'clight': {
      const disc = cyl(w / 2, w / 2, hh, 0, 0, 0, fmat(col, { emissive: evening ? '#ffd9a0' : '#000000', ei: evening ? 1.4 : 0 }), 28);
      disc.castShadow = false;
      break;
    }
    case 'pendant': {
      cyl(0.006, 0.006, hh * 0.65, 0, hh * 0.35, 0, black, 6);
      const shade = cyl(w * 0.15, w / 2, hh * 0.35, 0, 0, 0, M, 28);
      shade.castShadow = false;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), fmat('#fff6e0', { emissive: evening ? '#ffd9a0' : '#000000', ei: evening ? 2 : 0 }));
      bulb.position.y = 0.04;
      g.add(bulb);
      break;
    }
    case 'toilet': {
      const tank = T.cistern ? 0.18 : 0.08;
      if (T.cistern) box(w, hh, tank, 0, 0, -Z + tank / 2);
      else box(w * 0.5, 0.25, tank, 0, 0.3, -Z + tank / 2);
      // a wall-hung bowl floats: 5 cm above the floor up to the seat at 40 cm
      const y0 = T.cistern ? 0 : 0.12, bh = 0.39 - y0;
      const bowl = cyl(w / 2 * 0.95, w / 2 * 0.72, bh, 0, y0, -Z + tank + (d - tank) / 2, M, 28);
      bowl.scale.z = (d - tank) / w;
      const seat = cyl(w / 2 * 0.98, w / 2 * 0.98, 0.025, 0, 0.39, -Z + tank + (d - tank) / 2, white, 28);
      seat.scale.z = (d - tank) / w;
      break;
    }
    case 'vanity': {
      const top = 0.85, n = T.basins || 1;
      if (!T.small) box(w, 0.48, d, 0, top - 0.52, 0);
      box(w, 0.04, d, 0, top - 0.04, 0, white);
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const cx = -w / 2 + bw * (i + 0.5);
        const b = cyl(Math.min(bw * 0.32, 0.22), Math.min(bw * 0.28, 0.2), 0.012, cx, top + 0.001, d * 0.06, fmat('#D9DCDD', { rough: 0.2 }), 24); b.scale.z = d * 0.3 / Math.min(bw * 0.32, 0.22);
        cyl(0.012, 0.012, 0.22, cx, top, -Z + 0.06, metal, 8);
        box(0.02, 0.02, 0.12, cx, top + 0.2, -Z + 0.11, metal);
      }
      if (!T.small) box(Math.max(0.4, w - 0.1), 0.7, 0.02, 0, top + 0.3, -Z + 0.01, fmat('#C9D6DC', { rough: 0.05, metal: 0.4 }));
      break;
    }
    case 'shower': {
      box(w, 0.035, d, 0, 0, 0, fmat(col));
      const screen = box(0.01, Math.min(hh, 2.0), d * 0.9, -w / 2 + w * 0.55, 0.035, -Z + d * 0.45, glass);
      if (screen) screen.castShadow = false;
      cyl(0.012, 0.012, 1.15, -w / 2 + 0.08, 0.95, -Z + 0.06, metal, 8);
      cyl(0.11, 0.11, 0.015, -w / 2 + 0.24, 2.05, -Z + 0.14, metal, 20);
      break;
    }
    case 'bath': {
      const rim = 0.08;
      box(w, 0.06, d, 0, 0, 0, M);
      box(w, hh - 0.06, rim, 0, 0.06, -Z + rim / 2); box(w, hh - 0.06, rim, 0, 0.06, Z - rim / 2);
      box(rim, hh - 0.06, d - 2 * rim, -w / 2 + rim / 2, 0.06, 0); box(rim, hh - 0.06, d - 2 * rim, w / 2 - rim / 2, 0.06, 0);
      box(w - 2 * rim, 0.02, d - 2 * rim, 0, 0.12, 0, fmat('#E6EAEC', { rough: 0.15 }));
      break;
    }
    case 'towelrad': {
      for (const sx of [-1, 1]) box(0.03, hh, 0.03, sx * (w / 2 - 0.015), 0, 0, M);
      const n = Math.max(3, Math.round(hh / 0.12));
      for (let i = 0; i < n; i++) box(w, 0.022, 0.022, 0, i * (hh - 0.022) / (n - 1), 0, M);
      break;
    }
    case 'washer': {
      box(w, hh, d, 0, 0, 0);
      const door = cyl(Math.min(w, hh) * 0.3, Math.min(w, hh) * 0.3, 0.03, 0, 0, Z + 0.005, fmat('#3B4248', { rough: 0.15 }), 28);
      door.rotation.x = Math.PI / 2; door.position.y = hh * 0.45;
      box(w - 0.04, 0.08, 0.01, 0, hh - 0.11, Z + 0.004, fmat('#D4D4D0'));
      break;
    }
    case 'kbase': {
      const plinth = 0.1, wt = 0.04, topC = it.top || T.top || '#4A4744';
      box(w, plinth, d - 0.06, 0, 0, -0.03, black);
      box(w, hh - plinth - wt, d - 0.02, 0, plinth, -0.01);
      box(w, wt, d, 0, hh - wt, 0, fmat(topC, { rough: 0.45 }));
      if (!T.label) box(Math.min(0.3, w * 0.5), 0.012, 0.02, 0, hh - wt - 0.07, Z, metal);
      if (T.sink) { box(w - 0.18, 0.006, d - 0.24, 0, hh, 0.02, fmat('#C5C8CA', { rough: 0.25, metal: 0.5 })); cyl(0.015, 0.015, 0.28, 0, hh, -Z + 0.06, metal, 10); box(0.025, 0.025, 0.2, 0, hh + 0.26, -Z + 0.15, metal); }
      if (T.hob) box(Math.min(w - 0.08, 0.76), 0.006, d - 0.1, 0, hh, 0, fmat('#111214', { rough: 0.1 }));
      break;
    }
    case 'ktall': {
      box(w, 0.1, d - 0.06, 0, 0, -0.03, black);
      box(w, hh - 0.1, d, 0, 0.1, 0);
      box(w - 0.02, 0.006, 0.005, 0, 0.1 + (hh - 0.1) * (T.oven ? 0.33 : 0.42), Z + 0.002, Mdark);
      if (T.oven) box(w - 0.08, 0.45, 0.01, 0, 0.85, Z + 0.003, fmat('#16181A', { rough: 0.1 }));
      box(0.02, 0.35, 0.02, w / 2 - 0.05, 0.1 + (hh - 0.1) * 0.6, Z + 0.01, metal);
      break;
    }
    case 'kwall': box(w, hh, d, 0, 0, 0); box(w - 0.02, 0.006, 0.005, 0, hh * 0.5, Z + 0.002, Mdark); break;
    case 'khood': box(w, 0.08, d, 0, 0, 0, M); box(w * 0.32, hh - 0.08, d * 0.4, 0, 0.08, -Z + d * 0.2, M); break;
    case 'island': {
      const ov = Math.min(it.ov != null ? it.ov : (T.ov || 0), d - 0.3), wt = 0.04, topC = it.top || T.top || '#4A4744';
      box(w - 0.04, 0.1, d - ov - 0.1, 0, 0, -ov / 2, black);
      box(w - 0.02, hh - 0.1 - wt, d - ov - 0.02, 0, 0.1, -ov / 2);
      box(w, wt, d, 0, hh - wt, 0, fmat(topC, { rough: 0.45 }));
      break;
    }
    default: box(w, hh, d, 0, 0, 0);
  }
  return g;
}
