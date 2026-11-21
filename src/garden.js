/* ───────────── garden.js — the plot and the garden ─────────────
   project.site (fixed, from the site plan): plot outline, north, place (latitude / longitude), the level of the
   garden, the canal and its water level, the streets around it. plan.garden (per version, so garden ideas can be
   compared like the rooms): base (what covers the plot), areas (lawn, tiles, pavers …), lines (low brick wall,
   hedge, fence, quay wall, edging) and plants (trees, shrubs …). Drawn under the ground floor in 2D and around
   the house in 3D; the Garden tool (Build, key G) draws and changes it. Lengths in metres, levels relative to the
   ground floor (peil = 0). */

const G_AREAS = {
  lawn: { label: 'Lawn', color: '#93c06d', dark: '#6f9e4c' },
  soil: { label: 'Soil (bare)', color: '#b39878', dark: '#8a6f52' },
  tiles: { label: 'Garden tiles', color: '#bdbab3', dark: '#8f8b84', size: [0.6, 0.6] },
  pavers: { label: 'Pavers (klinkers)', color: '#9a7a66', dark: '#6e5244', size: [0.2, 0.1] },
  gravel: { label: 'Gravel', color: '#d6cdbd', dark: '#a39a8a' },
  decking: { label: 'Wooden decking', color: '#a7835e', dark: '#7a5d40', size: [0.145, 2.4] },
  planting: { label: 'Planting bed', color: '#6e7d4a', dark: '#4c5a2f' },
  bark: { label: 'Bark', color: '#76563f', dark: '#54392a' },
  water: { label: 'Pond', color: '#86b9d3', dark: '#4f87a5' },
};
const G_AREA_ORDER = ['lawn', 'tiles', 'pavers', 'gravel', 'decking', 'planting', 'bark', 'water', 'soil'];
const G_LINES = {
  wall: { label: 'Low brick wall', h: 0.45, t: 0.22, color: '#a35a42' },
  hedge: { label: 'Hedge', h: 2.0, t: 0.5, color: '#5b8a40' },
  fence: { label: 'Fence', h: 1.8, t: 0.05, color: '#4d4a46' },
  // (the gate's height: to the top of the gate; the railing beside it is about 30 cm lower)
  gate: { label: 'Gate (metal, with railing)', h: 1.8, t: 0.08, color: '#1f2224' },
  quay: { label: 'Quay wall (brick, stone below, down to the water)', h: 0.05, t: 0.3, color: '#7b6e66' },
  kerb: { label: 'Edging', h: 0.05, t: 0.08, color: '#8d8a84' },
};
const G_LINE_ORDER = ['wall', 'hedge', 'fence', 'gate', 'quay', 'kerb'];
const G_PLANTS = {
  tree: { label: 'Tree', d: 4.5, h: 7 },
  small: { label: 'Small tree', d: 2.6, h: 3.6 },
  shrub: { label: 'Shrub', d: 1.2, h: 1.2 },
  grass: { label: 'Grasses', d: 0.8, h: 0.9 },
  pot: { label: 'Plant pot', d: 0.6, h: 0.9 },
};
const G_PLANT_ORDER = ['tree', 'small', 'shrub', 'grass', 'pot'];
const TILE_SIZES = [[0.3, 0.3], [0.4, 0.4], [0.5, 0.5], [0.6, 0.6], [0.4, 0.6], [0.8, 0.8], [1.0, 1.0], [0.3, 0.6]];

/** the streets, street trees and houses of a neighbourhood traced from a site plan (a house built into the app brings
    one: HOUSE) into its site: they take the place of the first guesses; trees around that the plan doesn't have stay */
function hoodApply(site, H) {
  site.streets = clone(H.streets);
  site.trees = clone(H.trees);
  const A = site.around = site.around || {};
  A.houses = [];
  A.blds = clone(H.houses); A.flats = clone(H.flats);
  A.walls = clone(H.walls); A.screens = clone(H.screens); A.hedges = clone(H.hedges);
  A.lamps = clone(H.lamps); A.planters = clone(H.planters); A.drives = clone(H.drives || []);
  const drawn = H.parkTrees.map(([x, y, d]) => [x, y, d, round(d * 1.4, 0.1)]);
  A.trees = [...drawn, ...(A.trees || []).filter(q => !drawn.some(d => Math.hypot(d[0] - q[0], d[1] - q[1]) < 6))];
  // (the water, the reed and the paths of the neighbourhood take the place of those of an earlier one: brought in again
  // when it is newer)
  const mine = new Set((H.water || []).map(w => JSON.stringify(w.o || w)));
  A.water = [...(A.water || []).filter(w => !w.hood && !mine.has(JSON.stringify(w.o || w))), ...clone(H.water)];
  A.reeds = [...(A.reeds || []).filter(r => !r.hood), ...clone(H.reeds || [])];
  if (H.parkPaths && H.parkPaths.length) A.paths = clone(H.parkPaths);
  if (H.bridges && H.bridges.length) A.bridges = clone(H.bridges);
  A.play = H.play ? clone(H.play) : null;
  site.hood = H.v;
}

/** a point on the plot edge i (from vertex i to i+1) at plan x or y = v */
function plotEdgeAt(site, i, axis, v) {
  const P = site.plot, a = P[i], b = P[(i + 1) % P.length];
  const k = axis === 'x' ? 0 : 1;
  const t = (v - a[k]) / ((b[k] - a[k]) || 1e-9);
  return V.lerp(a, b, clamp(t, 0, 1));
}
/** a line along the plot edge, moved inwards by half its thickness (so it stands on the plot) */
function insetLine(site, pts, t) {
  const P = site.plot;
  const c = polyCentroid(P);
  // move each point towards the inside along the normal of the nearest plot edge
  const inward = (a, b) => { let n = V.perp(V.norm(V.sub(b, a))); if (V.dot(V.sub(c, V.lerp(a, b, 0.5)), n) < 0) n = V.mul(n, -1); return n; };
  return pts.map(p => {
    // the plot edges the point lies on (two at a corner: a mitred corner)
    const on = [];
    let best = null;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const pr = projectOnSegment(p, a, b); if (pr.d < 0.01) on.push(inward(a, b)); if (!best || pr.d < best.d) best = { d: pr.d, a, b }; }
    if (on.length >= 2) { const s2 = V.add(on[0], on[1]); return V.add(p, V.mul(s2, (t / 2) / (1 + V.dot(on[0], on[1])))); }
    return V.add(p, V.mul(inward(best.a, best.b), t / 2));
  }).map(p => [round(p[0], 0.005), round(p[1], 0.005)]);
}
function polyCentroid(P) { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; }

/** what differs in the garden between two versions, as short lines */
function gardenChanges(a, b) {
  if (!a && !b) return [];
  a = a || emptyGarden(); b = b || emptyGarden();
  const out = [];
  if (a.base !== b.base) out.push(t('{a} becomes {b}', { a: t(G_AREAS[a.base].label), b: t(G_AREAS[b.base].label) }));
  const A = new Map(a.areas.map(x => [x.id, x])), B = new Map(b.areas.map(x => [x.id, x]));
  const label = x => x.name || t(G_AREAS[x.kind].label);
  for (const x of b.areas) { const y = A.get(x.id); if (!y) out.push(t('New: {n} ({a})', { n: label(x), a: fmtArea(gAreaM2(x)) })); else if (JSON.stringify(y) !== JSON.stringify(x)) out.push(t('Changed: {n}', { n: label(x) })); }
  for (const y of a.areas) if (!B.has(y.id)) out.push(t('Gone: {n}', { n: label(y) }));
  const ll = l => t(G_LINES[l.kind].label.replace(/ \(.*\)$/, '')) + ' ' + fmtM(gLineLen(l));
  const LA = new Map(a.lines.map(x => [x.id, x])), LB = new Map(b.lines.map(x => [x.id, x]));
  for (const x of b.lines) { const y = LA.get(x.id); if (!y) out.push(t('New: {n}', { n: ll(x) })); else if (JSON.stringify(y) !== JSON.stringify(x)) out.push(t('Changed: {n}', { n: ll(x) })); }
  for (const y of a.lines) if (!LB.has(y.id)) out.push(t('Gone: {n}', { n: ll(y) }));
  const PA = new Set(a.plants.map(x => x.id)), PB = new Set(b.plants.map(x => x.id));
  const added = b.plants.filter(x => !PA.has(x.id)).length, gone = a.plants.filter(x => !PB.has(x.id)).length;
  if (added) out.push(t('{n} plants or trees added', { n: added }));
  if (gone) out.push(t('{n} plants or trees gone', { n: gone }));
  return out;
}
function emptyGarden() { return { base: 'lawn', areas: [], lines: [], plants: [] }; }

/** older files and the example: the example's plot (a house built into the app brings one: HOUSE.site) and a garden in
    every version */
function migrateSite(p) {
  if (!p.site && p.example && HOUSE.site) p.site = HOUSE.site();
  if (!p.site) return;
  // a version without a garden gets the original's (same ids), or the delivered one (the house's own) or an empty one
  const orig = (p.versions || []).find(v => v.kind === 'original');
  let first = orig && orig.plan.garden;
  for (const v of p.versions) {
    if (!v.plan.garden) v.plan.garden = first ? clone(first) : HOUSE.gardenDelivered ? HOUSE.gardenDelivered(p.site) : emptyGarden();
    if (!first) first = v.plan.garden;
    const g = v.plan.garden;
    g.areas = g.areas || []; g.lines = g.lines || []; g.plants = g.plants || []; g.base = g.base || 'lawn';
  }
  // the plot's upgrades, one step at a time (site.v 2 … 10). The plot of a house built into the app has its own
  // (HOUSE.siteStep: true when it was that plot). A plot from a site plan (site.from) of a house this build doesn't
  // have is left as it is, so an app with that house still brings it up to date.
  for (let n = 2; n <= 10; n++) {
    if ((p.site.v || 1) >= n) continue;
    if (HOUSE.siteStep && HOUSE.siteStep(p, n)) continue;
    if (p.site.from) break;
    if (n === 7) migrateGates(p);
    p.site.v = n;
  }
}
/** files from before the evening of 29 Oct (site v6): a gate's height is now the gate's own (to its top; it was the
    railing's, the gate stood about 30 cm higher) */
function migrateGates(p) {
  for (const v of p.versions) for (const l of ((v.plan.garden || {}).lines || [])) {
    // (gate.top: its height is already the gate's own – a gate made just now, by an older file's update)
    if (l.kind !== 'gate' || (l.gate && l.gate.top)) continue;
    l.gate = { w: 1.0, at: 0.5, side: 1, ...(l.gate || {}), top: true };
    const gw = l.gate.w || 1;
    l.h = round((l.h || 1.2) + Math.min(0.24, gw * 0.24) + 0.06, 0.01);
  }
}
/** a plot around a house that has none yet: its outline plus 6 m */
function siteAround(p) {
  const pts = [];
  for (const v of p.versions) for (const w of v.plan.walls) pts.push(w.a, w.b);
  const bb = bboxOfPoints(pts) || { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const m = 6;
  return { v: 4, plot: [[bb.minX - m, bb.minY - m], [bb.maxX + m, bb.minY - m], [bb.maxX + m, bb.maxY + m], [bb.minX - m, bb.maxY + m]], north: 0, lat: 52.1, lon: 5.1, level: -0.15, streetLevel: -0.2, water: null, streets: [], trees: [] };
}
const gardenOf = plan => plan.garden || (plan.garden = emptyGarden());
const lowestStorey = p => sortedStoreys(p)[0];
/** outside a rounded wall corner at a corner of the plot: the pavement goes up to the wall */
function gCornerFillers(site, gd) {
  return gCornerArcs(site, gd).map(c => [site.plot[c.k], ...c.arc]);
}
/** the rounded wall corners at plot corners: { k: index of the plot corner, arc: the wall's outer face around it
    (from the side of the previous plot corner to the side of the next) } */
function gCornerArcs(site, gd) {
  const out = [];
  const P = (site && site.plot) || [];
  if (!gd || P.length < 3) return out;
  for (const l of gd.lines) {
    if (l.kind !== 'wall' || !(l.r > 0) || l.pts.length < 3) continue;
    for (let i = 1; i < l.pts.length - 1; i++) {
      let k = -1, best = 0.6;
      P.forEach((q, j) => { const d = V.dist(q, l.pts[i]); if (d < best) { best = d; k = j; } });
      if (k < 0 || out.some(c => c.k === k)) continue;
      const A = P[k];
      const a1 = V.add(A, V.mul(V.norm(V.sub(P[(k + P.length - 1) % P.length], A)), 4));
      const a2 = V.add(A, V.mul(V.norm(V.sub(P[(k + 1) % P.length], A)), 4));
      const arc = filletPath([a1, A, a2], l.r + l.t / 2).slice(1, -1);
      if (arc.length >= 2) out.push({ k, arc });
    }
  }
  return out;
}
/** the plot as it lies in 3D: where the low wall rounds a corner of the plot, the plot follows the wall's outer
    face (outside the curve is pavement, at street level) */
function gPlotOutline(site, gd) {
  const arcs = gCornerArcs(site, gd);
  const out = [];
  site.plot.forEach((q, k) => { const c = arcs.find(x => x.k === k); if (c) out.push(...c.arc); else out.push(q); });
  return out;
}
/** an area's outline for 3D: corners lying on the plot's edge (a drive or a path reaching the street) are moved
    just past it, so the area's edge covers the plot's edge (no strip of lawn, no two faces in one place) */
function gAreaOutline(site, poly) {
  const P = site.plot;
  return poly.map(q => {
    let best = null;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], pr = projectOnSegment(q, a, b); if (!best || pr.d < best.d) best = { d: pr.d, a, b }; }
    if (!best || best.d > 0.03) return q;
    const c = polyCentroid(P);
    let n = V.perp(V.norm(V.sub(best.b, best.a)));
    if (V.dot(V.sub(c, V.lerp(best.a, best.b, 0.5)), n) > 0) n = V.mul(n, -1);   // outward
    return V.add(projectOnSegment(q, best.a, best.b).point, V.mul(n, 0.006));
  });
}
/** the line as drawn: its points, with the inner corners rounded when it has a radius (l.r, on the centre line) */
function gLinePath(l) { return l.r > 0 && l.pts.length > 2 ? filletPath(l.pts, l.r) : l.pts; }
function gLineLen(l) { const P = gLinePath(l); let s = 0; for (let i = 1; i < P.length; i++) s += V.dist(P[i - 1], P[i]); return s; }
/** a polyline with every inner corner replaced by an arc of radius r (smaller where the legs are short) */
function filletPath(pts, r) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], b = pts[i + 1];
    const d1 = V.norm(V.sub(p, a)), d2 = V.norm(V.sub(b, p));
    const turn = Math.acos(clamp(V.dot(d1, d2), -1, 1));   // how much the line turns here
    if (turn < 0.01 || turn > Math.PI - 0.01) { out.push(p); continue; }
    let tl = r * Math.tan(turn / 2);
    const lim = Math.min(V.dist(a, p) / (i === 1 ? 1 : 2), V.dist(p, b) / (i === pts.length - 2 ? 1 : 2));
    let rr = r;
    if (tl > lim) { tl = lim; rr = tl / Math.tan(turn / 2); }
    const t1 = V.sub(p, V.mul(d1, tl)), t2 = V.add(p, V.mul(d2, tl));
    const side = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : -1;
    const n1 = side > 0 ? [-d1[1], d1[0]] : [d1[1], -d1[0]];
    const c = V.add(t1, V.mul(n1, rr));
    const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    const seg = Math.max(3, Math.ceil(turn / (Math.PI / 24)));
    for (let k = 0; k <= seg; k++) { const ang = a0 + side * turn * (k / seg); out.push([c[0] + Math.cos(ang) * rr, c[1] + Math.sin(ang) * rr]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function gAreaM2(a) { return Math.abs(polygonArea(a.poly)); }
/** square metres of the base: the plot without the areas and without the house */
function gardenTotals(p, plan) {
  const site = p.site, g = plan.garden;
  const out = {};
  if (!site || !g) return out;
  const st = lowestStorey(p);
  let house = 0;
  for (const r of plan.rooms) if (r.storey === st.id) house += Math.abs(polygonArea(r.poly));
  // the walls of the ground floor (roughly): the area inside the outer walls is a bit more than the rooms
  house *= 1.12;
  let used = 0;
  for (const a of g.areas) { const m2 = gAreaM2(a); used += m2; out[a.kind] = (out[a.kind] || 0) + m2; }
  const plot = Math.abs(polygonArea(site.plot));
  out[g.base] = (out[g.base] || 0) + Math.max(0, plot - house - used);
  out.plot = plot;
  return out;
}

/* ───────── 2D ───────── */
Object.assign(PlanView.prototype, {
  gardenDefs() {
    let defs = this.svg.querySelector('defs');
    if (!defs) defs = this.svg.insertBefore(s('defs'), this.svg.firstChild);
    if (defs.querySelector('#gp-lawn')) return defs;
    const pat = (id, w, hgt, ...kids) => { const p = s('pattern', { id, patternUnits: 'userSpaceOnUse', width: w, height: hgt }); p.append(...kids); defs.appendChild(p); };
    const r = (x, y, w, hgt, fill) => s('rect', { x, y, width: w, height: hgt, fill });
    const ln = (d, stroke, sw) => s('path', { d, stroke, 'stroke-width': sw, fill: 'none' });
    pat('gp-lawn', 0.5, 0.5, r(0, 0, 0.5, 0.5, G_AREAS.lawn.color), ln('M0.08 0.12l0.03-0.06M0.3 0.36l0.03-0.06M0.4 0.1l0.02-0.05M0.15 0.42l0.02-0.05', G_AREAS.lawn.dark, 0.012));
    pat('gp-soil', 0.4, 0.4, r(0, 0, 0.4, 0.4, G_AREAS.soil.color), s('circle', { cx: 0.1, cy: 0.1, r: 0.012, fill: G_AREAS.soil.dark }), s('circle', { cx: 0.3, cy: 0.25, r: 0.01, fill: G_AREAS.soil.dark }));
    pat('gp-gravel', 0.2, 0.2, r(0, 0, 0.2, 0.2, G_AREAS.gravel.color), ...[[0.03, 0.05], [0.12, 0.03], [0.16, 0.13], [0.07, 0.15], [0.1, 0.09]].map(([x, y]) => s('circle', { cx: x, cy: y, r: 0.012, fill: G_AREAS.gravel.dark })));
    pat('gp-planting', 0.6, 0.6, r(0, 0, 0.6, 0.6, G_AREAS.planting.color), ...[[0.15, 0.15, 0.1], [0.42, 0.3, 0.12], [0.2, 0.45, 0.08]].map(([x, y, rr]) => s('circle', { cx: x, cy: y, r: rr, fill: '#7f9757', stroke: G_AREAS.planting.dark, 'stroke-width': 0.01 })));
    pat('gp-bark', 0.3, 0.3, r(0, 0, 0.3, 0.3, G_AREAS.bark.color), ln('M0.05 0.08l0.06 0.02M0.18 0.2l0.07-0.02M0.12 0.26l0.04 0.02', G_AREAS.bark.dark, 0.02));
    pat('gp-water', 1, 0.4, r(0, 0, 1, 0.4, G_AREAS.water.color), ln('M0 0.2q0.25-0.08 0.5 0t0.5 0', '#ffffff99', 0.015));
    pat('gp-decking', 1, 0.145, r(0, 0, 1, 0.145, G_AREAS.decking.color), ln('M0 0.144H1', G_AREAS.decking.dark, 0.008));
    // pavers in a herringbone-like stretcher bond (20 × 10 cm)
    pat('gp-pavers', 0.4, 0.2, r(0, 0, 0.4, 0.2, G_AREAS.pavers.color), ln('M0 0H0.4M0 0.1H0.4M0.2 0V0.1M0.1 0.1V0.2M0.3 0.1V0.2', G_AREAS.pavers.dark, 0.008));
    pat('gp-road', 1, 1, r(0, 0, 1, 1, '#cbbfb3'));
    pat('gp-park', 1, 1, r(0, 0, 1, 1, '#bdbab4'));
    pat('gp-path', 0.3, 0.3, r(0, 0, 0.3, 0.3, '#dcdad5'), ln('M0 0H0.3M0 0V0.3', '#bdbab3', 0.008));
    return defs;
  },
  tilePattern(size, kind) {
    const defs = this.gardenDefs();
    const [w, hh] = size || G_AREAS[kind].size;
    const id = `gp-${kind}-${Math.round(w * 100)}x${Math.round(hh * 100)}`;
    if (!defs.querySelector('#' + id)) {
      const p = s('pattern', { id, patternUnits: 'userSpaceOnUse', width: w, height: hh });
      p.append(s('rect', { x: 0, y: 0, width: w, height: hh, fill: G_AREAS[kind].color }), s('path', { d: `M0 0H${w}M0 0V${hh}`, stroke: G_AREAS[kind].dark, 'stroke-width': 0.01, fill: 'none' }));
      defs.appendChild(p);
    }
    return `url(#${id})`;
  },
  areaFill(a) {
    if (a.kind === 'tiles') return this.tilePattern(a.size, 'tiles');
    return `url(#gp-${a.kind})`;
  },

  /** the plot, the garden and what is around it (under the ground floor) */
  drawGarden(g, en) {
    const site = en.site, show = en.gshow || { garden: true, street: true, houses: true, park: true };
    const gd = show.garden ? en.plan.garden : null;
    if (!site) return;
    this.gardenDefs();
    const sel = this.spec.selection;
    const ring = pl => 'M' + pl.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L') + 'Z';
    const gg = s('g', { class: 'garden' });
    // around it: streets and the canal (each part as View → Show has it)
    if (show.street) for (const st of site.streets || []) gg.appendChild(s('path', { d: ring(st.poly), class: 'g-street g-' + st.kind, fill: `url(#gp-${st.kind === 'road' || st.kind === 'park' ? st.kind : 'path'})` }));
    if (show.park && site.water && site.water.poly) gg.appendChild(s('path', { d: ring(site.water.poly), class: 'g-canal' }));
    for (const el of aroundSvg(site, show)) gg.appendChild(el);
    if (show.street) for (const [x, y, d] of site.trees || []) gg.appendChild(s('circle', { cx: x, cy: y, r: (d || 5) / 2, class: 'g-ctree' }));
    // the plot and what covers it (the garden switched off: the plot plain)
    gg.appendChild(s('path', { d: ring(site.plot), fill: show.garden ? `url(#gp-${(gd && gd.base) || 'lawn'})` : 'none', class: 'g-plot' + (show.garden ? '' : ' g-plot-off') + (sel && sel.type === 'plot' ? ' sel' : ''), 'data-plot': '1' }));
    if (show.street) for (const f of gCornerFillers(site, en.plan.garden)) gg.appendChild(s('path', { d: ring(f), fill: 'url(#gp-path)', class: 'g-street g-corner' }));
    if (gd) {
      for (const a of gd.areas) {
        if (a.poly.length < 3) continue;
        gg.appendChild(s('path', { d: ring(a.poly), fill: this.areaFill(a), class: 'g-area g-' + a.kind + (sel && sel.type === 'garea' && sel.id === a.id ? ' sel' : ''), 'data-garea': a.id }));
      }
      for (const l of gd.lines) {
        const K = G_LINES[l.kind] || G_LINES.wall;
        const LP = gLinePath(l);
        const d = 'M' + LP.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L');
        const isSel = sel && sel.type === 'gline' && sel.id === l.id;
        if (l.kind === 'hedge') gg.appendChild(s('path', { d, class: 'g-line g-hedge' + (isSel ? ' sel' : ''), stroke: K.color, 'stroke-width': l.t, 'data-gline': l.id }));
        else if (l.kind === 'gate') for (const el of gateSvg(l, isSel)) gg.appendChild(el);
        else if (l.kind === 'fence') {
          gg.appendChild(s('path', { d, class: 'g-line g-fence' + (isSel ? ' sel' : ''), stroke: K.color, 'stroke-width': Math.max(l.t, 0.04), 'data-gline': l.id }));
          // posts
          let posts = '';
          for (let i = 1; i < LP.length; i++) { const a = LP[i - 1], b = LP[i], Lh = V.dist(a, b), n = Math.max(1, Math.round(Lh / 1.8)); for (let k = 0; k <= n; k++) { const q = V.lerp(a, b, k / n); posts += `M${(q[0] - 0.04).toFixed(3)} ${(q[1] - 0.04).toFixed(3)}h0.08v0.08h-0.08Z`; } }
          gg.appendChild(s('path', { d: posts, class: 'g-post', fill: K.color }));
        } else {
          gg.appendChild(s('path', { d, class: 'g-line g-' + l.kind + (isSel ? ' sel' : ''), stroke: K.color, 'stroke-width': l.t, 'data-gline': l.id }));
          gg.appendChild(s('path', { d, class: 'g-line-core', 'stroke-width': Math.max(0.01, l.t - 0.05) }));
        }
      }
      for (const pl of gd.plants) {
        const K = G_PLANTS[pl.kind] || G_PLANTS.shrub;
        const isSel = sel && sel.type === 'plant' && sel.id === pl.id;
        const r0 = (pl.d || K.d) / 2;
        const grp = s('g', { class: 'g-plant g-' + pl.kind + (isSel ? ' sel' : ''), 'data-plant': pl.id });
        if (pl.kind === 'pot') grp.append(s('circle', { cx: pl.x, cy: pl.y, r: r0, class: 'g-pot' }), s('circle', { cx: pl.x, cy: pl.y, r: r0 * 0.6, class: 'g-crown' }));
        else {
          // a crown with a scalloped edge
          const n = pl.kind === 'grass' ? 14 : 10;
          let d = '';
          for (let i = 0; i <= n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
            const a2 = ((i - 0.5) / n) * Math.PI * 2; const p = [pl.x + Math.cos(a0) * r0, pl.y + Math.sin(a0) * r0], c = [pl.x + Math.cos(a2) * r0 * 1.14, pl.y + Math.sin(a2) * r0 * 1.14];
            d += (i ? `Q${c[0].toFixed(3)} ${c[1].toFixed(3)} ` : 'M') + `${p[0].toFixed(3)} ${p[1].toFixed(3)}`;
          }
          grp.append(s('path', { d: d + 'Z', class: 'g-crown' }));
          if (pl.kind === 'tree' || pl.kind === 'small') grp.append(s('circle', { cx: pl.x, cy: pl.y, r: Math.max(0.08, r0 * 0.06), class: 'g-trunk' }));
        }
        gg.appendChild(grp);
      }
    }
    gg.appendChild(s('path', { d: ring(site.plot), class: 'g-plot-edge' }));
    g.appendChild(gg);
  },

  /** names and sizes of the garden areas (screen space) */
  drawGardenLabels(g, en, off) {
    const gd = en.plan.garden;
    if (!gd || !en.site) return;
    const sc = this.cam.s;
    if (sc < 6) return;
    for (const a of gd.areas) {
      if (a.poly.length < 3) continue;
      const bb = bboxOfPoints(a.poly);
      if (Math.min(bb.w, bb.h) * sc < 34) continue;
      // only where the name fits in the area (a narrow path's name would run over the next one's)
      const name = a.name || t(G_AREAS[a.kind].label);
      if (name.length * 6.2 > bb.w * sc + 6) continue;
      const lp = labelPoint(a.poly, []);
      const p = this.toScreen([lp[0] + off[0], lp[1] + off[1]]);
      const t2 = s('text', { x: p[0], y: p[1], class: 'g-label' });
      t2.appendChild(s('tspan', { x: p[0], dy: '-0.15em' }, name));
      t2.appendChild(s('tspan', { x: p[0], dy: '1.2em', class: 'g-label-m2' }, fmtArea(gAreaM2(a))));
      g.appendChild(t2);
    }
    // the plot's size when it is selected
    const sel = this.spec.selection;
    if (sel && sel.type === 'plot') {
      const lp = polyCentroid(en.site.plot);
      const p = this.toScreen([lp[0] + off[0], lp[1] + off[1] - 4]);
      g.appendChild(s('text', { x: p[0], y: p[1], class: 'g-label plot' }, t('Plot') + ' ' + fmtArea(Math.abs(polygonArea(en.site.plot)))));
    }
  },

  /** a north arrow in the corner when the house has a site */
  updateNorth() {
    const en = this.spec.entries && this.spec.entries.find(x => x.siteNorth != null);
    if (!en) { if (this.northEl) this.northEl.hidden = true; return; }
    if (!this.northEl) {
      this.northEl = h('div', { class: 'north-arrow', title: t('North'), 'aria-label': t('North') });
      this.northEl.innerHTML = '<svg viewBox="-20 -20 40 40" aria-hidden="true"><circle r="17" class="na-ring"/><path d="M0 -15L6 6L0 2L-6 6Z" class="na-needle"/><text y="-6" class="na-n" transform="translate(0 -10)">N</text></svg>';
      this.host.appendChild(this.northEl);
    }
    this.northEl.hidden = false;
    this.northEl.querySelector('svg').style.transform = `rotate(${en.siteNorth}deg)`;
  },

  /** what garden thing is at p (plants, lines, areas, then the plot) */
  gardenHit(p, en, noPlot) {
    const gd = en.plan.garden, site = en.site;
    if (!site || !gd) return null;
    const tol = 10 / this.cam.s;
    let best = null;
    for (const pl of gd.plants) {
      const r0 = Math.max((pl.d || 1) / 2 * 0.7, tol);
      const d = V.dist(p, [pl.x, pl.y]);
      if (d < r0 && (!best || d < best.d)) best = { type: 'plant', id: pl.id, d };
    }
    if (best) return { type: best.type, id: best.id };
    for (const l of gd.lines) { const LP = gLinePath(l); for (let i = 1; i < LP.length; i++) {
      const pr = projectOnSegment(p, LP[i - 1], LP[i]);
      if (pr.d < Math.max(l.t / 2 + 0.02, tol) && (!best || pr.d < best.d)) best = { type: 'gline', id: l.id, d: pr.d };
    } }
    if (best) return { type: best.type, id: best.id };
    let area = Infinity;
    for (const a of gd.areas) if (a.poly.length >= 3 && pointInPolygon(p, a.poly)) { const m2 = gAreaM2(a); if (m2 < area) { area = m2; best = { type: 'garea', id: a.id }; } }
    if (best) return best;
    if (!noPlot && pointInPolygon(p, site.plot)) return { type: 'plot', id: 'plot' };
    return null;
  },

  gardenHandles(sel, en) {
    const gd = en.plan.garden;
    if (sel.type === 'garea') { const a = gd && gd.areas.find(x => x.id === sel.id); return a ? a.poly.map((p, i) => ({ kind: 'garea-v', i, p, small: true })) : []; }
    if (sel.type === 'gline') { const l = gd && gd.lines.find(x => x.id === sel.id); return l ? l.pts.map((p, i) => ({ kind: 'gline-v', i, p, small: true })) : []; }
    if (sel.type === 'plot' && en.site) return en.site.plot.map((p, i) => ({ kind: 'plot-v', i, p, small: true }));
    return [];
  },

  /** snapping in the garden: corners of the plot, of areas and lines, the walls of the house, the plot edges */
  gardenSnap(p, opt = {}) {
    const en = this.editEntry;
    if (!en) return { p, kind: 'free' };
    const tol = 14 / this.cam.s;
    const gd = en.plan.garden, site = en.site;
    const pts = [];
    if (site) pts.push(...site.plot);
    if (gd) { for (const a of gd.areas) pts.push(...a.poly); for (const l of gd.lines) pts.push(...l.pts); }
    let best = null;
    for (const q of pts) { if (opt.skip && opt.skip.includes(q)) continue; const d = V.dist(p, q); if (d < tol && (!best || d < best.d)) best = { p: [...q], d, kind: 'end' }; }
    if (best) return best;
    const sn = this.snap(p, opt);
    if (sn.kind === 'end' || sn.kind === 'line') return sn;
    // onto the plot edge
    if (site) for (let i = 0; i < site.plot.length; i++) {
      const pr = projectOnSegment(p, site.plot[i], site.plot[(i + 1) % site.plot.length]);
      if (pr.d < tol * 0.8) return { p: pr.point, kind: 'line' };
    }
    return sn;
  },

  /** the Garden tool: draw an area or a line corner by corner, or put a plant */
  gardenTap(p, en, sp) {
    const o = this.app.toolOpts;
    const mode = o.gMode || 'area';
    if (!en.site) { this.app.toast(t('This house has no plot yet. Make one in the tool bar.')); return; }
    if (mode === 'plant') { this.app.addPlant(this.gardenSnap(p).p, o.gPlant || 'shrub'); return; }
    const type = mode === 'line' ? 'gline' : 'garea';
    const sn = this.gardenSnap(p, { from: this.chain && this.chain.pts.length ? this.chain.pts[this.chain.pts.length - 1] : null });
    if (!this.chain || this.chain.type !== type) this.chain = { type, pts: [sn.p], preview: null };
    else {
      const first = this.chain.pts[0], last = this.chain.pts[this.chain.pts.length - 1];
      if (type === 'garea' && this.chain.pts.length >= 3 && V.dist(this.toScreen(first), this.toScreen(sn.p)) < 18) { this.finishChain(); return; }
      if (type === 'gline' && this.chain.pts.length >= 2 && V.dist(this.toScreen(last), this.toScreen(sn.p)) < 14) { this.finishChain(); return; }
      this.chain.pts.push(sn.p);
    }
    this.snapMark = sn;
    this.drawOverlay();
    this.app.emit('chain');
  },

  /** fit the whole plot in the view */
  fitPlot(animate = true) {
    const en = this.spec.entries.find(x => x.site);
    if (!en) return;
    const bb = bboxOfPoints(en.site.plot.map(p => [p[0] + en.offset[0], p[1] + en.offset[1]]));
    const saved = this.spec.entries.map(x => x.bbox);
    for (const x of this.spec.entries) x.bbox = null;
    en.bbox = { ...bb };
    this.fit(24, animate);
    this.spec.entries.forEach((x, i) => { x.bbox = saved[i]; });
  },
});

/** which parts of the site are shown (View → Show, 2 Nov): the garden (the plot and what is on it), the street (roads,
 *  pavements, the street trees, the bridge's railings), the houses around, and water and park (the canals, quays, reeds,
 *  the park's paths, footbridges and trees). A part not switched yet follows the Garden switch, which used to switch all
 *  of it (a house file or a device with Garden off keeps everything off) */
const G_SHOW_KEYS = ['garden', 'street', 'houses', 'park'];
function gShow(s) {
  const g = s.garden !== false, f = k => (s[k] == null ? g : s[k] !== false);
  return { garden: g, street: f('street'), houses: f('houses'), park: f('park') };
}
const gShowAny = sh => G_SHOW_KEYS.some(k => sh[k]);

/* ───────── the app: tool, details, changes ───────── */
Object.assign(app, {
  /** the 3D views: the site and the garden of this version, around the lowest storey that is shown */
  garden3d(entries, v) {
    const p = this.project, gshow = gShow(this.settings);
    if (!p.site || !gShowAny(gshow) || this.view.scope === 'side' || this.walkingNoGarden) return {};
    const low = lowestStorey(p);
    const en = entries.find(e => e.storey.id === low.id);
    if (!en) return {};
    // (a neighbour that is this house mirrored – HOUSE.mirror, hood.js: its storeys at their levels above the lowest)
    const lot3 = gshow.houses && HOUSE.mirror && p.site.around && (p.site.around.blds || []).some(H => H.lot === HOUSE.mirror.lot) ? { storeys: sortedStoreys(p).map(st => ({ id: st.id, y: round((st.elevation || 0) - (low.elevation || 0), 0.001) })) } : null;
    return { site: p.site, garden: v.plan.garden || null, gardenAt: { offset: en.offset, y: en.y || 0 }, gshow, lot3 };
  },
  gardenEntryProps(st, v) {
    const p = this.project, gshow = gShow(this.settings);
    if (!p.site || !gShowAny(gshow)) return {};
    const low = lowestStorey(p);
    if (!low || st.id !== low.id) return { siteNorth: p.site.north };
    return { site: p.site, siteNorth: p.site.north, gshow };
  },

  gardenOptions(box, chip, view) {
    const o = this.toolOpts;
    const p = this.project;
    const chain = view && view.chain;
    if (!p.site) {
      box.appendChild(h('span', { class: 'hint' }, t('No plot yet.')));
      box.appendChild(h('button', { class: 'btn sm primary', id: 'g-make-plot', onclick: () => this.makePlot('around') }, icon('plus'), t('Plot around the house')));
      // (the plot of the house built into the app, from its site plan)
      if (HOUSE.plot) box.appendChild(h('button', { class: 'btn sm', id: HOUSE.plot.id, onclick: () => this.makePlot('house') }, t(HOUSE.plot.label)));
      return;
    }
    o.gMode = o.gMode || 'area';
    const seg = h('div', { class: 'seg g-mode' }, ...[['area', t('Area')], ['line', t('Line')], ['plant', t('Plant')]].map(([k, l]) => h('button', { 'data-k': k, 'aria-pressed': String(o.gMode === k), onclick: () => { o.gMode = k; view && view.cancelChain(); this.renderStageOverlays(); } }, l)));
    box.appendChild(seg);
    if (o.gMode === 'area') {
      o.gArea = o.gArea || 'tiles';
      for (const k of G_AREA_ORDER) box.appendChild(chip(t(G_AREAS[k].label), o.gArea === k, () => { o.gArea = k; }));
      box.appendChild(h('span', { class: 'hint' }, chain ? t('Tap each corner. Tap the first corner to close.') : t('Tap the corners of the area.')));
      if (chain) box.appendChild(h('button', { class: 'btn sm primary', disabled: chain.pts.length < 3, onclick: () => view.finishChain() }, icon('check'), t('Done')));
    } else if (o.gMode === 'line') {
      o.gLine = o.gLine || 'hedge';
      for (const k of G_LINE_ORDER) box.appendChild(chip(t(G_LINES[k].label.replace(/ \(.*\)$/, '')), o.gLine === k, () => { o.gLine = k; }));
      box.appendChild(h('span', { class: 'hint' }, chain ? t('Tap the next point. Tap the last point again to stop.') : t('Tap where it starts, then each corner.')));
      if (chain) box.appendChild(h('button', { class: 'btn sm primary', disabled: chain.pts.length < 2, onclick: () => view.finishChain() }, icon('check'), t('Done')));
    } else {
      o.gPlant = o.gPlant || 'shrub';
      for (const k of G_PLANT_ORDER) box.appendChild(chip(t(G_PLANTS[k].label), o.gPlant === k, () => { o.gPlant = k; }));
      box.appendChild(h('span', { class: 'hint' }, t('Tap where it goes.')));
    }
    box.appendChild(h('button', { class: 'btn sm ghost', id: 'g-fit', onclick: () => { for (const pn of this.panes) if (pn.view && pn.view.fitPlot) pn.view.fitPlot(); } }, icon('fit'), t('Whole plot')));
  },

  makePlot(kind) {
    if (!this.canEdit()) { this.lockedNotice(); return; }
    this.mutate(pr => {
      pr.site = (kind === 'house' && HOUSE.plot && HOUSE.plot.site()) || siteAround(pr);
      const g0 = kind === 'house' && HOUSE.plot ? HOUSE.plot.garden(pr.site) : emptyGarden();
      for (const v of pr.versions) v.plan.garden = clone(g0);
    }, { project: true });
    this.toast(kind === 'house' && HOUSE.plot ? t(HOUSE.plot.toast) : t('A plot 6 m around the house. Drag its corners to the real plot.'));
    this.renderStageOverlays();
    setTimeout(() => { for (const pn of this.panes) if (pn.view && pn.view.fitPlot) pn.view.fitPlot(false); }, 60);
  },

  addGardenArea(kind, poly) {
    const a = { id: uid('ga_'), kind, poly: cleanPoly(poly).map(p => [round(p[0], 0.001), round(p[1], 0.001)]) };
    if (kind === 'tiles') a.size = [0.6, 0.6];
    if (polygonArea(a.poly) < 0) a.poly.reverse();
    if (this.mutate(pl => { gardenOf(pl).areas.push(a); })) { this.select({ type: 'garea', id: a.id }); this.toast(t('{k} added ({a}).', { k: t(G_AREAS[kind].label), a: fmtArea(gAreaM2(a)) })); }
  },
  addGardenLine(kind, pts) {
    const K = G_LINES[kind];
    const l = { id: uid('gl_'), kind, pts: pts.map(p => [round(p[0], 0.001), round(p[1], 0.001)]), h: K.h, t: K.t };
    if (this.mutate(pl => { gardenOf(pl).lines.push(l); })) this.select({ type: 'gline', id: l.id });
  },
  addPlant(p, kind) {
    const K = G_PLANTS[kind];
    const pl = { id: uid('gp_'), kind, x: round(p[0], 0.01), y: round(p[1], 0.01), d: K.d, h: K.h };
    if (this.mutate(plan => { gardenOf(plan).plants.push(pl); })) this.select({ type: 'plant', id: pl.id });
  },

  /** the plot: its size, the levels, the water, north; and the garden in numbers */
  plotPanel(el) {
    const p = this.project, site = p.site, v = this.shownVersion(), gd = v.plan.garden;
    const ro = !this.canEdit();
    this.inspHead(el, t('Plot and garden'), site.from ? t('From the site plan') : '');
    const upd = (fn, opts = {}) => this.mutate(pr => { fn(pr.site); }, { project: true, keepInspector: true, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Plot')), h('b', null, fmtArea(Math.abs(polygonArea(site.plot))))));
    const levelMM = v2 => Math.round(-v2 * 1000);
    sec.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Garden below the floor'), 'f-site-level', levelMM(site.level ?? -0.15), 'mm', val => upd(s2 => { s2.level = -clamp(val, 0, 2000) / 1000; }, { keepInspector: false }), { dec: 0, disabled: ro }),
      site.water ? this.numField(t('Water below the floor'), 'f-water-level', levelMM(site.water.level), 'mm', val => upd(s2 => { s2.water.level = -clamp(val, 0, 4000) / 1000; }, { keepInspector: false }), { dec: 0, disabled: ro }) : h('div')));
    if (site.water) {
      // the water level: also a slider, it is nice to see it move in 3D
      const rg = h('input', { type: 'range', id: 'f-water-range', min: '0', max: '2500', step: '10', value: String(levelMM(site.water.level)), disabled: ro, 'aria-label': t('Water level') });
      rg.addEventListener('input', () => { this.mutate(pr => { pr.site.water.level = -(+rg.value) / 1000; }, { project: true, keepInspector: true, coalesce: 'water' }); const f = $('#f-water-level'); if (f) f.value = rg.value; });
      sec.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Water level')), rg));
      const gap = (site.level ?? -0.15) - site.water.level;
      sec.appendChild(h('p', { class: 'note-muted' }, t('The water is {n} mm below the garden; the quay wall shows that much brick above the water.', { n: Math.round(gap * 1000) })));
    }
    sec.appendChild(h('div', { class: 'field-row' }, this.numField(t('North (degrees)'), 'f-north', site.north || 0, '°', val => upd(s2 => { s2.north = ((val % 360) + 360) % 360; }, { keepInspector: false }), { dec: 1, disabled: ro, max: 360 }), h('div')));
    sec.appendChild(h('p', { class: 'note-muted' }, t('North is the direction of the arrow in the corner of the plan; 0° is up.')));
    if (site.from) sec.appendChild(h('p', { class: 'note-muted' }, site.from));
    el.appendChild(sec);
    el.appendChild(this.placeSection());
    // what covers the plot, and the garden in numbers
    if (gd) {
      const g2 = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('The garden in this version')));
      g2.appendChild(this.segRow(t('Everywhere else'), [['lawn', 'Lawn'], ['soil', 'Soil (bare)'], ['gravel', 'Gravel']], gd.base, k => this.mutate(pl => { gardenOf(pl).base = k; }, { keepInspector: true }), ro, 'g-base'));
      const T = gardenTotals(p, v.plan);
      const rows = Object.entries(T).filter(([k]) => G_AREAS[k]).sort((a, b) => b[1] - a[1]);
      for (const [k, m2] of rows) g2.appendChild(h('div', { class: 'kv' }, h('span', null, t(G_AREAS[k].label)), h('b', null, fmtArea(m2))));
      const len = kind => gd.lines.filter(l => l.kind === kind).reduce((s2, l) => s2 + gLineLen(l), 0);
      for (const k of G_LINE_ORDER) { const L = len(k); if (L > 0.05) g2.appendChild(h('div', { class: 'kv' }, h('span', null, t(G_LINES[k].label.replace(/ \(.*\)$/, ''))), h('b', null, fmtM(L)))); }
      const trees = gd.plants.filter(x => x.kind === 'tree' || x.kind === 'small').length, others = gd.plants.length - trees;
      if (gd.plants.length) g2.appendChild(h('div', { class: 'kv' }, h('span', null, t('Plants')), h('b', null, t('{a} trees, {b} other', { a: trees, b: others }))));
      if (!ro) g2.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => this.setTool('garden') }, icon('plant'), t('Garden tool'))));
      el.appendChild(g2);
    }
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('p', { class: 'note-muted' }, t('Drag the corners of the plot to change it. The plot, levels and north are the same in every version; the garden itself belongs to the version.')),
      h('div', { class: 'actions' }, h('button', { class: 'btn sm danger', onclick: async () => { const ok = await UI.dialog({ title: t('Remove the plot?'), body: t('The plot and the garden of every version go. Undo brings them back.'), actions: [{ label: t('Cancel'), value: false }, { label: t('Remove'), value: true, kind: 'danger primary' }] }); if (ok) { this.mutate(pr => { delete pr.site; for (const v2 of pr.versions) delete v2.plan.garden; }, { project: true }); this.select(null); } } }, icon('trash'), t('Remove the plot')))));
  },

  gardenAreaPanel(el, a) {
    const v = this.shownVersion();
    const ro = !this.canEdit() || this.mode !== 'build';
    const K = G_AREAS[a.kind] || G_AREAS.lawn;
    this.inspHead(el, a.name || t(K.label), fmtArea(gAreaM2(a)));
    const upd = (fn, opts = {}) => this.mutate(pl => { const x = gardenOf(pl).areas.find(y => y.id === a.id); if (x) fn(x); }, { keepInspector: true, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(this.segRow(t('What'), G_AREA_ORDER.map(k => [k, G_AREAS[k].label]), a.kind, k => upd(x => { x.kind = k; if (k === 'tiles' && !x.size) x.size = [0.6, 0.6]; }, { keepInspector: false }), ro, 'g-area-kind'));
    if (a.kind === 'tiles') {
      const cur = (a.size || [0.6, 0.6]).map(x => Math.round(x * 100)).join('×');
      sec.appendChild(this.segRow(t('Tile size (cm)'), TILE_SIZES.map(sz => [sz.map(x => Math.round(x * 100)).join('×'), sz.map(x => Math.round(x * 100)).join(' × ')]), cur, k => upd(x => { x.size = k.split('×').map(n => +n / 100); }, { keepInspector: false }), ro, 'g-tile-size'));
      const sz = a.size || [0.6, 0.6];
      const n = Math.ceil(gAreaM2(a) / (sz[0] * sz[1]) * 1.05);
      sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Tiles to buy (5 % extra)')), h('b', null, String(n))));
    }
    if (a.kind === 'pavers') sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Pavers (about 48 per m²)')), h('b', null, String(Math.ceil(gAreaM2(a) * 48 * 1.05)))));
    if (a.kind === 'gravel' || a.kind === 'bark') sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('At 5 cm thick')), h('b', null, fmtDec((gAreaM2(a) * 0.05).toFixed(2)) + ' m³')));
    if (a.kind === 'lawn') sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Grass seed (35 g/m²)')), h('b', null, Math.ceil(gAreaM2(a) * 0.035 * 10) / 10 + ' kg')));
    const name = h('input', { class: 'input', id: 'f-garea-name', value: a.name || '', placeholder: t('e.g. Terrace, Vegetable garden'), disabled: ro, autocomplete: 'off' });
    name.addEventListener('input', () => upd(x => { x.name = name.value; }, { coalesce: 'gan:' + a.id }));
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-garea-name' }, t('Name')), name));
    el.appendChild(sec);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => { const cp = { ...clone(a), id: uid('ga_'), poly: a.poly.map(q => [q[0] + 0.5, q[1] + 0.5]) }; this.mutate(pl => { gardenOf(pl).areas.push(cp); }); this.select({ type: 'garea', id: cp.id }); } }, icon('dup'), t('Duplicate')),
      h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete'))),
      h('p', { class: 'note-muted' }, t('Drag it to move it; drag a corner to change its shape.'))));
  },

  gardenLinePanel(el, l) {
    const ro = !this.canEdit() || this.mode !== 'build';
    const K = G_LINES[l.kind] || G_LINES.wall;
    this.inspHead(el, t(K.label.replace(/ \(.*\)$/, '')), fmtM(gLineLen(l)));
    const upd = (fn, opts = {}) => this.mutate(pl => { const x = gardenOf(pl).lines.find(y => y.id === l.id); if (x) fn(x); }, { keepInspector: true, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(this.segRow(t('What'), G_LINE_ORDER.map(k => [k, G_LINES[k].label.replace(/ \(.*\)$/, '')]), l.kind, k => upd(x => { x.kind = k; x.h = G_LINES[k].h; x.t = G_LINES[k].t; }, { keepInspector: false }), ro, 'g-line-kind'));
    sec.appendChild(h('div', { class: 'field-row' },
      l.kind === 'quay' ? h('div') : this.mmField(l.kind === 'gate' ? t('Height of the gate') : t('Height'), 'f-gline-h', l.h, val => upd(x => { x.h = clamp(val, 0.02, 4); }, { keepInspector: false }), { disabled: ro }),
      this.mmField(t('Thickness'), 'f-gline-t', l.t, val => upd(x => { x.t = clamp(val, 0.02, 2); }, { keepInspector: false }), { disabled: ro })));
    if (l.pts.length > 2) sec.appendChild(h('div', { class: 'field-row' },
      this.mmField(t('Rounded corners (radius)'), 'f-gline-r', l.r || 0, val => upd(x => { const r = clamp(val, 0, 20); if (r > 0.01) x.r = r; else delete x.r; }, { keepInspector: false }), { disabled: ro, allowZero: true }), h('div')));
    const L = gLineLen(l);
    if (l.kind === 'hedge') sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Hedge plants (4 per metre)')), h('b', null, String(Math.ceil(L * 4)))));
    if (l.kind === 'wall') sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Bricks (waalformaat, about 120 per m²)')), h('b', null, String(Math.ceil(L * l.h * 120 * 1.05)))));
    if (l.kind === 'fence') sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Panels of 1.80 m')), h('b', null, String(Math.ceil(L / 1.8)))));
    if (l.kind === 'gate') {
      // the gate leaf: its width, where it is along the line and which way it opens
      const G = l.gate || { w: 1.0, at: 0.5, side: 1 };
      const updG = (fn, opts) => upd(x => { x.gate = { w: 1.0, at: 0.5, side: 1, ...(x.gate || {}) }; fn(x.gate); }, opts);
      sec.appendChild(h('div', { class: 'field-row' },
        this.mmField(t('Gate width'), 'f-gate-w', G.w || 1.0, val => updG(g2 => { g2.w = clamp(val, 0.5, 4); }, { keepInspector: false }), { disabled: ro }), h('div')));
      const where = (G.at ?? 0.5) < 0.2 ? 'start' : (G.at ?? 0.5) > 0.8 ? 'end' : 'middle';
      sec.appendChild(this.segRow(t('Gate at'), [['start', t('Start')], ['middle', t('Middle')], ['end', t('End')]], where, k => updG(g2 => { g2.at = k === 'start' ? 0 : k === 'end' ? 1 : 0.5; }, { keepInspector: false }), ro, 'g-gate-at'));
      const shut = this.isDoorClosed(l.id);
      sec.appendChild(h('div', { class: 'actions' },
        // open or closed (kept with the house, like the doors; it is not a change to the plan)
        h('button', { class: 'btn sm', id: 'g-gate-open', onclick: () => this.setDoorClosed(l.id, !shut) }, icon('door'), shut ? t('Open the gate') : t('Close the gate')),
        ro ? null : h('button', { class: 'btn sm', id: 'g-gate-flip', onclick: () => updG(g2 => { g2.side = g2.side === -1 ? 1 : -1; }, { keepInspector: false }) }, icon('flip'), t('Open to the other side'))));
      sec.appendChild(h('p', { class: 'note-muted' }, t('Black steel: a gate with an arched top, spear tips and a scroll, and railing of the same bars to the ends of the line. The height is the gate\'s (to its top); the railing beside it is about 30 cm lower. Tap the gate in 3D to open or close it; walking into it opens it.')));
    }
    if (l.kind === 'quay') sec.appendChild(h('p', { class: 'note-muted' }, t('The quay wall runs from the garden down into the water; set the water level in the plot details.')));
    el.appendChild(sec);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' }, h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete'))),
      h('p', { class: 'note-muted' }, t('Drag a point to change it; drag the line to move it.'))));
  },

  plantPanel(el, pl) {
    const ro = !this.canEdit() || this.mode !== 'build';
    const K = G_PLANTS[pl.kind] || G_PLANTS.shrub;
    this.inspHead(el, pl.name || t(K.label), t(K.label));
    const upd = (fn, opts = {}) => this.mutate(plan => { const x = gardenOf(plan).plants.find(y => y.id === pl.id); if (x) fn(x); }, { keepInspector: true, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(this.segRow(t('What'), G_PLANT_ORDER.map(k => [k, G_PLANTS[k].label]), pl.kind, k => upd(x => { x.kind = k; x.d = G_PLANTS[k].d; x.h = G_PLANTS[k].h; }, { keepInspector: false }), ro, 'g-plant-kind'));
    sec.appendChild(h('div', { class: 'field-row' },
      this.mmField(t('Width (crown)'), 'f-plant-d', pl.d, val => upd(x => { x.d = clamp(val, 0.1, 20); }, { keepInspector: false }), { disabled: ro }),
      this.mmField(t('Height'), 'f-plant-h', pl.h, val => upd(x => { x.h = clamp(val, 0.1, 30); }, { keepInspector: false }), { disabled: ro })));
    const name = h('input', { class: 'input', id: 'f-plant-name', value: pl.name || '', placeholder: t('e.g. Amelanchier, Japanese maple'), disabled: ro, autocomplete: 'off' });
    name.addEventListener('input', () => upd(x => { x.name = name.value; }, { coalesce: 'gpn:' + pl.id }));
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-plant-name' }, t('Name')), name));
    el.appendChild(sec);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => { const cp = { ...clone(pl), id: uid('gp_'), x: pl.x + Math.max(0.6, pl.d), y: pl.y }; this.mutate(plan => { gardenOf(plan).plants.push(cp); }); this.select({ type: 'plant', id: cp.id }); } }, icon('dup'), t('Duplicate')),
      h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete'))),
      h('p', { class: 'note-muted' }, t('Drag it to move it.'))));
  },

  /** the garden section of the overview (ground floor) */
  gardenOverviewSection(el) {
    const p = this.project;
    const st = this.currentStorey(), low = lowestStorey(p);
    if (!st || !low || st.id !== low.id || this.view.scope !== 'storey') return;
    const sec = h('div', { class: 'insp-sec g-over' }, h('div', { class: 'eyebrow' }, t('Garden')));
    if (!p.site) {
      sec.appendChild(h('p', { class: 'note-muted' }, t('No plot yet. The Garden tool makes one.')));
      if (this.canEdit() && this.mode === 'build') sec.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: () => this.setTool('garden') }, icon('plant'), t('Garden tool'))));
    } else {
      sec.appendChild(h('div', { class: 'kv' }, h('span', null, t('Plot')), h('b', null, fmtArea(Math.abs(polygonArea(p.site.plot))))));
      sec.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm', id: 'g-plot-btn', onclick: () => this.select({ type: 'plot', id: 'plot' }) }, icon('map'), t('Plot, levels and water')),
        this.canEdit() && this.mode === 'build' ? h('button', { class: 'btn sm', onclick: () => this.setTool('garden') }, icon('plant'), t('Garden tool')) : null));
    }
    el.appendChild(sec);
  },
});

/* ───────── 3D ───────── */
/** the grass around (the neighbours' plots, the verges, the park) lies this far below the pavement: under the road,
 *  which is 10 cm lower than the pavement (hood.js) */
const G_GRASS = 0.12;
function gTex(key, size, draw) {
  if (TEX.has(key)) return TEX.get(key);
  const N = 256, cv = makeCanvas(N, N), g = cv.getContext('2d');
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  draw(g, N, rnd);
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(1 / size[0], 1 / size[1]);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = MAX_ANISO;
  tx.userData.hq = G_HQ[key.split('|')[0]] || {};
  TEX.set(key, tx);
  return tx;
}
/** High preset (hq.js): depth for each garden surface – joints sink in on tiles and pavers, stones on gravel */
const G_HQ = {
  'g-lawn': { strength: 3 }, 'g-soil': { strength: 2 }, 'g-gravel': { relief: 0.006, strength: 2.6 }, 'g-bark': { strength: 3 },
  'g-planting': { strength: 2.4 }, 'g-tiles': { relief: 0.006 }, 'g-pavers': { relief: 0.01 }, 'g-decking': { relief: 0.004 },
  'g-road': { strength: 1.2 }, 'g-path': { relief: 0.006 }, 'g-context': { strength: 2 }, 'g-slope': { strength: 2.4 }, 'g-hedge': { strength: 4 }, 'g-bank': { strength: 2 },
};
const noise = (g, N, rnd, base, amp) => {
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) { const v = (rnd() - 0.5) * amp; img.data[i] = clamp(img.data[i] + v, 0, 255); img.data[i + 1] = clamp(img.data[i + 1] + v, 0, 255); img.data[i + 2] = clamp(img.data[i + 2] + v, 0, 255); }
  g.putImageData(img, 0, 0);
};
/** the real pictures for a garden surface (texlib.js): { map, normalMap, roughnessMap } or null */
const LIB_GARDEN = { lawn: 'Grass005', context: 'Grass005', slope: 'Grass005', soil: 'Ground048', bark: 'Ground048', gravel: 'Ground062L', road: 'Asphalt033', decking: 'Planks026A', pavers: 'Tiles049', tiles: 'Tiles050', path: 'Concrete014' };
function gardenLib(kind, sz) {
  const id = LIB_GARDEN[kind];
  if (!id || !libSet(id)) return null;
  const fast = libFast();
  if (kind === 'tiles' || kind === 'path') {
    // garden tiles at their size (4 × 4 tiles per picture), each cut from a part of the picture without a joint;
    // the public pavements: grey concrete tiles of 30 × 30 cm
    const t = kind === 'path' ? libPieceTex(id, 'g-path', 4, 4, [0.3, 0.3], 0.004, '#B9B5AE') : libPieceTex(id, 'g-tiles|' + sz.join('x'), 4, 4, sz, 0.006);
    return t ? { map: t, rough: 0.85 } : null;
  }
  const big = kind === 'context' ? 3 : null;
  const o = { map: libTex(id, 'color', big) };
  if (!fast) { o.normalMap = libTex(id, 'normal', big); o.roughnessMap = libTex(id, 'rough', big); }
  // decking: the boards run along the area's length (its texture is turned like the drawn one)
  return o.map ? o : null;
}
function gardenMaterial(kind, size) {
  const sz = size || (G_AREAS[kind] && G_AREAS[kind].size) || [1, 1];
  const key = 'g|' + kind + '|' + sz.join('x') + (libOn() && libFast() ? '|f' : '');
  return mat(key, () => {
    let map, rough = 0.95;
    const L = gardenLib(kind, sz);
    if (L) {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: L.map, normalMap: L.normalMap || null, roughnessMap: L.roughnessMap || null, roughness: L.roughnessMap ? 1 : (L.rough || 0.9) });
      if (L.normalMap) m.normalScale = new THREE.Vector2(1, 1);
      m.userData.lib = LIB_GARDEN[kind];
      const macro = ['lawn', 'context', 'slope'].includes(kind) ? 'grass' : ['tiles', 'pavers', 'road', 'path', 'gravel', 'soil', 'decking'].includes(kind) ? 'hard' : null;
      if (macro) { m.userData.macro = macro; m.onBeforeCompile = sh => macroPatch(sh, macro); m.customProgramCacheKey = () => 'macro-' + macro; }
      return m;
    }
    if (kind === 'lawn') map = gTex('g-lawn', [1.5, 1.5], (g, N, rnd) => { noise(g, N, rnd, '#7fae58', 26); for (let i = 0; i < 900; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(60,100,40,0.35)' : 'rgba(170,210,120,0.3)'; g.beginPath(); const x = rnd() * N, y = rnd() * N; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4); g.stroke(); } });
    else if (kind === 'soil') map = gTex('g-soil', [1.2, 1.2], (g, N, rnd) => { noise(g, N, rnd, '#8e7457', 36); });
    else if (kind === 'gravel') map = gTex('g-gravel', [0.6, 0.6], (g, N, rnd) => { noise(g, N, rnd, '#cdc3b1', 20); for (let i = 0; i < 1400; i++) { const v = 150 + rnd() * 90; g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.beginPath(); g.arc(rnd() * N, rnd() * N, 1 + rnd() * 2.2, 0, 7); g.fill(); } });
    else if (kind === 'bark') map = gTex('g-bark', [0.8, 0.8], (g, N, rnd) => { noise(g, N, rnd, '#5e4130', 30); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${90 + rnd() * 40},${60 + rnd() * 25},${40 + rnd() * 15},0.9)`; g.save(); g.translate(rnd() * N, rnd() * N); g.rotate(rnd() * 3); g.fillRect(-5, -1.5, 10, 3); g.restore(); } });
    else if (kind === 'planting') map = gTex('g-planting', [1.2, 1.2], (g, N, rnd) => { noise(g, N, rnd, '#4b3f30', 30); for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(${60 + rnd() * 50},${110 + rnd() * 60},${50 + rnd() * 30},0.9)`; g.beginPath(); g.arc(rnd() * N, rnd() * N, 4 + rnd() * 10, 0, 7); g.fill(); } });
    else if (kind === 'water') { return skyReflect(new THREE.MeshStandardMaterial({ color: 0x4f8aa0, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.88 }), 0.6); }
    else if (kind === 'tiles') {
      map = gTex('g-tiles|' + sz.join('x'), [sz[0] * 2, sz[1] * 2], (g, N, rnd) => { g.fillStyle = '#8f8c86'; g.fillRect(0, 0, N, N); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 176 + rnd() * 14; g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(i * N / 2 + 2, j * N / 2 + 2, N / 2 - 4, N / 2 - 4); } const img = g.getImageData(0, 0, N, N); for (let k = 0; k < img.data.length; k += 4) { const v = (rnd() - 0.5) * 14; img.data[k] += v; img.data[k + 1] += v; img.data[k + 2] += v; } g.putImageData(img, 0, 0); });
      rough = 0.85;
    } else if (kind === 'pavers') {
      // herringbone of 20 × 10 cm stones
      map = gTex('g-pavers', [0.8, 0.8], (g, N, rnd) => {
        g.fillStyle = '#5d4a40'; g.fillRect(0, 0, N, N);
        const u = N / 8;   // 10 cm
        for (let i = -2; i < 10; i++) for (let j = -2; j < 10; j++) {
          const col = () => { const f = 0.85 + rnd() * 0.3; return `rgb(${Math.round(150 * f)},${Math.round(116 * f)},${Math.round(98 * f)})`; };
          const x = (i * 2 + j) * u, y = (j * 2 - i) * u;
          g.fillStyle = col(); g.fillRect(((x % N) + N) % N + 1, ((y % N) + N) % N + 1, 2 * u - 2, u - 2);
          g.fillStyle = col(); g.fillRect(((x + u) % N + N) % N + 1, ((y + u) % N + N) % N + 1, u - 2, 2 * u - 2);
        }
      });
    } else if (kind === 'decking') map = gTex('g-decking', [1.16, 2.4], (g, N, rnd) => { const n = 8; for (let i = 0; i < n; i++) { const f = 0.88 + rnd() * 0.2; g.fillStyle = `rgb(${Math.round(160 * f)},${Math.round(124 * f)},${Math.round(88 * f)})`; g.fillRect(i * N / n, 0, N / n - 2, N); g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(i * N / n + N / n - 2, 0, 2, N); } });
    else if (kind === 'road') map = gTex('g-road', [2, 2], (g, N, rnd) => { noise(g, N, rnd, '#5c5d60', 30); });
    else if (kind === 'path') map = gTex('g-path', [0.6, 0.6], (g, N, rnd) => { g.fillStyle = '#9a9893'; g.fillRect(0, 0, N, N); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 196 + rnd() * 12; g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(i * N / 2 + 2, j * N / 2 + 2, N / 2 - 4, N / 2 - 4); } });
    else if (kind === 'context') map = gTex('g-context', [3, 3], (g, N, rnd) => { noise(g, N, rnd, '#93ad6e', 22); for (let i = 0; i < 700; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(70,105,45,0.3)' : 'rgba(185,215,135,0.28)'; g.beginPath(); const x = rnd() * N, y = rnd() * N; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y - 2 - rnd() * 3); g.stroke(); } });
    else if (kind === 'slope') map = gTex('g-slope', [1.5, 1.5], (g, N, rnd) => { noise(g, N, rnd, '#7c8a52', 30); for (let i = 0; i < 600; i++) { g.strokeStyle = rnd() < 0.6 ? 'rgba(60,80,35,0.35)' : 'rgba(120,100,70,0.35)'; g.beginPath(); const x = rnd() * N, y = rnd() * N; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4); g.stroke(); } });
    else if (kind === 'hedge') map = gTex('g-hedge', [0.8, 0.8], (g, N, rnd) => { noise(g, N, rnd, '#3f6b2c', 30); for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${50 + rnd() * 60},${100 + rnd() * 70},${30 + rnd() * 30},0.8)`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 2 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, 7); g.fill(); } });
    else if (kind === 'bank') map = gTex('g-bank', [2, 1], (g, N, rnd) => { noise(g, N, rnd, '#6c6250', 30); });
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: rough });
    // big areas are not one pattern repeated: grass gets lighter and darker patches and a few drier ones, paving
    // and roads a faint unevenness, both laid over the area in metres (macroPatch)
    const macro = ['lawn', 'context', 'slope'].includes(kind) ? 'grass' : ['tiles', 'pavers', 'road', 'path', 'gravel', 'soil', 'decking'].includes(kind) ? 'hard' : null;
    if (macro) { m.userData.macro = macro; m.onBeforeCompile = sh => macroPatch(sh, macro); m.customProgramCacheKey = () => 'macro-' + macro; }
    return m;
  });
}
/** a soft, seamless noise (128 × 128, values 0 … 1), for colour that changes over metres */
function macroNoiseTex() {
  if (TEX.has('macro-noise')) return TEX.get('macro-noise');
  const N = 128, data = new Uint8Array(N * N * 4), vals = new Float32Array(N * N);
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // a few octaves of smoothly interpolated random grids that wrap around
  const oct = [[8, 0.5], [16, 0.3], [32, 0.2]].map(([n, w]) => ({ n, w, v: Array.from({ length: n * n }, rnd) }));
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const o of oct) {
      const fx = x / N * o.n, fy = y / N * o.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
      const at = (i, j) => o.v[((j + o.n) % o.n) * o.n + ((i + o.n) % o.n)];
      v += o.w * ((at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty);
    }
    vals[y * N + x] = v;
  }
  // stretched to the full 0 … 1, so the patches are as strong as asked
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < N * N; i++) { const k = i * 4; data[k] = data[k + 1] = data[k + 2] = Math.round((vals[i] - lo) / Math.max(1e-6, hi - lo) * 255); data[k + 3] = 255; }
  const t2 = new THREE.DataTexture(data, N, N);
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  t2.magFilter = THREE.LinearFilter; t2.minFilter = THREE.LinearMipmapLinearFilter; t2.generateMipmaps = true;
  t2.needsUpdate = true;
  TEX.set('macro-noise', t2);
  return t2;
}
/** the patches over an area: read where the surface is (in metres), not along its texture */
function macroPatch(sh, kind) {
  sh.uniforms.macroNoise = { value: macroNoiseTex() };
  sh.vertexShader = 'varying vec2 vMacroW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvMacroW = (modelMatrix * vec4(transformed, 1.0)).xz;');
  const grass = `
\tfloat mA = texture2D(macroNoise, vMacroW / 23.0).r, mB = texture2D(macroNoise, vMacroW / 6.7 + vec2(0.37, 0.11)).r;
\tfloat mN = mA * 0.65 + mB * 0.35;
\tdiffuseColor.rgb *= mix(vec3(0.82, 0.85, 0.80), vec3(1.07, 1.06, 0.97), mN);
\tfloat mDry = smoothstep(0.6, 0.85, texture2D(macroNoise, vMacroW / 47.0 + vec2(0.71, 0.29)).r);
\tdiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.02, 0.7), mDry * 0.4);`;
  const hard = `
\tfloat mN = texture2D(macroNoise, vMacroW / 13.0).r * 0.6 + texture2D(macroNoise, vMacroW / 3.1 + vec2(0.53, 0.17)).r * 0.4;
\tdiffuseColor.rgb *= mix(0.93, 1.04, mN);`;
  sh.fragmentShader = 'uniform sampler2D macroNoise;\nvarying vec2 vMacroW;\n' + sh.fragmentShader.replace('#include <color_fragment>', (kind === 'grass' ? grass : hard) + '\n#include <color_fragment>');
}
const gWallBrick = () => libBrick(null) || mat('g|wallbrick', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: tintedBrickTexture([0.55, 0.33, 0.25]), roughness: 0.95 }));
const gStone = () => mat('g|bluestone', () => new THREE.MeshStandardMaterial({ color: 0x5c6367, roughness: 0.7 }));
// the quay: old dark (purple-brown) brick, and rough basalt-like stones set in mortar below it
const gQuayBrick = () => libBrickShared([0.36, 0.25, 0.24]) || mat('g|quaybrick', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: tintedBrickTexture([0.36, 0.25, 0.24]), roughness: 0.95 }));
const gQuayRollaag = () => mat('g|quayrollaag', () => { const m = new THREE.MeshStandardMaterial({ color: 0x9c8077, map: rollaagTexture(), roughness: 0.95 }); return m; });
const gQuayStone = () => mat('g|quaystone', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: quayStoneTexture(), roughness: 0.9 }));
/** rough stones (breuksteen) in pale mortar: cells around random points, 1 × 1 m */
function quayStoneTexture() {
  if (TEX.has('quaystone')) return TEX.get('quaystone');
  const N = 256, cv = makeCanvas(N, N), g = cv.getContext('2d');
  let seed = 41;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pts = [];
  for (let i = 0; i < 46; i++) pts.push([rnd() * N, rnd() * N, 0.55 + rnd() * 0.45]);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, k = 0;
    for (let i = 0; i < pts.length; i++) {
      // wrapped, so the texture tiles
      let dx = Math.abs(x - pts[i][0]), dy = Math.abs(y - pts[i][1]);
      dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
      const d = dx * dx + dy * dy * 1.6;
      if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1), o = (y * N + x) * 4;
    const n = (rnd() - 0.5) * 18;
    if (edge < 2.6) { const v = 150 + n; img.data[o] = v; img.data[o + 1] = v - 4; img.data[o + 2] = v - 10; }
    else { const f = pts[k][2], sh = Math.min(1, edge / 9); const v = (48 + 40 * f) * (0.82 + 0.18 * sh) + n; img.data[o] = v; img.data[o + 1] = v + 2; img.data[o + 2] = v + 6; }
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { relief: 0.03, strength: 2.6 };
  TEX.set('quaystone', tex);
  return tex;
}
const gWood = () => mat('g|fence', () => new THREE.MeshStandardMaterial({ color: 0x4b4741, roughness: 0.8 }));
const gLeaf = c => mat('g|leaf|' + c, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.9, flatShading: true }));
const gTrunk = () => mat('g|trunk', () => new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 0.9 }));

/** a flat shape (plan polygon, holes) lying at height y */
function gFlat(poly, y, holes = []) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
}
/** a thin flat layer from y0 to y1 (a plan polygon), its top and edge in the same material */
function gSlab(poly, y0, y1) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.002, y1 - y0), bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
}
/** the bank of water along edge i of its polygon: from the edge at y0 down to y1, run metres into the water */
function gBankSlope(poly, i, y0, y1, run, away = false) {
  const a = poly[i], b = poly[(i + 1) % poly.length], d = V.norm(V.sub(b, a));
  let n = [-d[1], d[0]];
  // (towards the water: into the polygon – or, for an island in it, away from the island)
  if (pointInPolygon(V.add(V.lerp(a, b, 0.5), V.mul(n, 0.3)), poly) === away) n = V.mul(n, -1);
  // a little wider than the edge, so the banks of neighbouring edges meet at corners
  const a1 = V.sub(a, V.mul(d, 0.3)), b1 = V.add(b, V.mul(d, 0.3));
  const P = [[a1[0], y0, a1[1]], [b1[0], y0, b1[1]], [b1[0] + n[0] * run, y1, b1[1] + n[1] * run], [a1[0] + n[0] * run, y1, a1[1] + n[1] * run]];
  const L = V.dist(a1, b1), sl = Math.hypot(run, y0 - y1);
  const geo = new THREE.BufferGeometry();
  // facing up whichever way round the polygon goes
  const up = ((P[1][0] - P[0][0]) * (P[3][2] - P[0][2]) - (P[1][2] - P[0][2]) * (P[3][0] - P[0][0])) < 0;
  const idx = up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L, 0, L, sl, 0, sl], 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/** a box from a to b (plan), from y0 to y1, t thick */
function gBox(a, b, y0, y1, t, ext = 0) {
  const d = V.norm(V.sub(b, a)), L = V.dist(a, b) + ext * 2;
  const geo = new THREE.BoxGeometry(L, y1 - y0, t);
  // UVs in metres (brick and hedge textures keep their size)
  const uv = geo.attributes.uv, dims = [[t, y1 - y0], [t, y1 - y0], [L, t], [L, t], [L, y1 - y0], [L, y1 - y0]];
  for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  const m = V.lerp(a, b, 0.5);
  geo.rotateY(Math.atan2(-d[1], d[0]));
  geo.translate(m[0], (y0 + y1) / 2, m[1]);
  return geo;
}
/** a wall along a plan path (corners mitred, curves smooth), from y0 to y1, t thick; UVs in metres (sides: along
 *  and up; top: along and across), so brick textures keep their size */
function gRibbon(path, y0, y1, t) {
  const n = path.length;
  const nrm = d => [-d[1], d[0]];
  const Lp = [], Rp = [], M = [];
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const dp = i > 0 ? V.norm(V.sub(p, path[i - 1])) : null, dn = i < n - 1 ? V.norm(V.sub(path[i + 1], p)) : null;
    let m;
    if (!dp) m = nrm(dn);
    else if (!dn) m = nrm(dp);
    else {
      const a = nrm(dp), b = nrm(dn), sm = V.add(a, b), len = Math.hypot(sm[0], sm[1]);
      m = len < 1e-6 ? a : V.mul(sm, 1 / len);
      m = V.mul(m, 1 / Math.max(0.35, V.dot(m, a)));   // mitre, kept short at sharp corners
    }
    M.push(m);
    Lp.push(V.add(p, V.mul(m, t / 2))); Rp.push(V.sub(p, V.mul(m, t / 2)));
  }
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + V.dist(path[i - 1], path[i]));
  const pos = [], uv = [];
  const W3 = (q, y) => new THREE.Vector3(q[0], y, q[1]);
  const quad = (P, U, out) => {
    // four corners in order around the face; flipped when they face inwards
    const n3 = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0]));
    const o = n3.dot(out) < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
    for (const k of [o[0], o[1], o[2], o[0], o[2], o[3]]) { pos.push(P[k].x, P[k].y, P[k].z); uv.push(U[k][0], U[k][1]); }
  };
  const hh = y1 - y0;
  for (let i = 0; i < n - 1; i++) {
    const d = V.norm(V.sub(path[i + 1], path[i])), ln = nrm(d);
    quad([W3(Lp[i], y0), W3(Lp[i + 1], y0), W3(Lp[i + 1], y1), W3(Lp[i], y1)], [[s[i], 0], [s[i + 1], 0], [s[i + 1], hh], [s[i], hh]], new THREE.Vector3(ln[0], 0, ln[1]));
    quad([W3(Rp[i], y0), W3(Rp[i + 1], y0), W3(Rp[i + 1], y1), W3(Rp[i], y1)], [[s[i], 0], [s[i + 1], 0], [s[i + 1], hh], [s[i], hh]], new THREE.Vector3(-ln[0], 0, -ln[1]));
    quad([W3(Lp[i], y1), W3(Lp[i + 1], y1), W3(Rp[i + 1], y1), W3(Rp[i], y1)], [[s[i], 0], [s[i + 1], 0], [s[i + 1], t], [s[i], t]], new THREE.Vector3(0, 1, 0));
    quad([W3(Lp[i], y0), W3(Lp[i + 1], y0), W3(Rp[i + 1], y0), W3(Rp[i], y0)], [[s[i], 0], [s[i + 1], 0], [s[i + 1], t], [s[i], t]], new THREE.Vector3(0, -1, 0));
  }
  const d0 = V.norm(V.sub(path[1], path[0])), d1 = V.norm(V.sub(path[n - 1], path[n - 2]));
  quad([W3(Lp[0], y0), W3(Rp[0], y0), W3(Rp[0], y1), W3(Lp[0], y1)], [[0, 0], [t, 0], [t, hh], [0, hh]], new THREE.Vector3(-d0[0], 0, -d0[1]));
  quad([W3(Lp[n - 1], y0), W3(Rp[n - 1], y0), W3(Rp[n - 1], y1), W3(Lp[n - 1], y1)], [[0, 0], [t, 0], [t, hh], [0, hh]], new THREE.Vector3(d1[0], 0, d1[1]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
/** the point at distance d along a path */
function pathAt(P, d) {
  for (let i = 1; i < P.length; i++) { const L = V.dist(P[i - 1], P[i]); if (d <= L || i === P.length - 1) return V.lerp(P[i - 1], P[i], L > 0 ? clamp(d / L, 0, 1) : 0); d -= L; }
  return P[P.length - 1];
}
/** bricks on edge (rollaag): a brick's 5 cm side every 6 cm, a little darker and browner than the wall */
function rollaagTexture() {
  if (TEX.has('rollaag')) return TEX.get('rollaag');
  const N = 256, H = 48, cv = makeCanvas(N, H), g = cv.getContext('2d');
  let seed = 19;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = 'rgb(176,168,154)'; g.fillRect(0, 0, N, H);   // mortar
  const n = 10, bw = N / n;
  for (let i = 0; i < n; i++) {
    const f = 0.82 + rnd() * 0.3;
    g.fillStyle = `rgb(${Math.round(132 * f)},${Math.round(80 * f)},${Math.round(50 * f)})`;
    g.fillRect(i * bw + 2, 2, bw - 4, H - 4);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(i * bw + 2, H - 8, bw - 4, 6);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 0.6, 1 / 0.1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { relief: 0.01 };
  TEX.set('rollaag', tex);
  return tex;
}
const gRollaag = () => mat('g|rollaag', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: rollaagTexture(), roughness: 0.95 }));

/** a crown: an icosphere pushed in and out a little, so it looks less like a ball */
function gCrown(r, ry, seed) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  let sd = seed || 3;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(3)).join();
    if (!cache.has(key)) cache.set(key, 0.86 + rnd() * 0.24);
    const f = cache.get(key);
    pos.setXYZ(i, pos.getX(i) * r * f, pos.getY(i) * ry * f, pos.getZ(i) * r * f);
  }
  geo.computeVertexNormals();
  return geo;
}

Object.assign(View3D.prototype, {
  /** the plot, the garden, the streets and the canal around the lowest storey */
  buildGarden(spec, cutH) {
    const site = spec.site, show = spec.gshow || { garden: true, street: true, houses: true, park: true };
    const gd = show.garden ? spec.garden : null;
    if (!site) return;
    const at = spec.gardenAt || { offset: [0, 0], y: 0 };
    const G = new THREE.Group();
    G.position.set(at.offset[0], at.y || 0, at.offset[1]);
    G.userData.garden = true;
    // (trees and plants: one shape drawn many times where the view is merged – trees.js)
    if (this.vegInstBegin) this.vegInstBegin(G, cutH);
    const done = () => { if (this.vegInstEnd) this.vegInstEnd(G); this.group.add(G); };
    const add = (geo, material, opts = {}) => {
      const m = new THREE.Mesh(geo, material);
      m.receiveShadow = true; m.castShadow = !!opts.cast;
      if (opts.walk) m.userData.walk = true;
      if (opts.pick) Object.assign(m.userData, opts.pick);
      for (const mm of [].concat(material)) mm.userData.cutClip = cutH != null;
      G.add(m);
      return m;
    };
    const lv = site.level ?? -0.15, sl = site.streetLevel ?? -0.2;
    const W = site.water;
    // the world around: grass, with the canal cut out
    const c = polyCentroid(site.plot);
    // (walking by day the ground goes on to the horizon, where the haze takes it over)
    // (the neighbourhood of the site plan: on across the park to the houses on the other side)
    const R = spec.walk && this.scene.fog ? 1200 : site.hood ? 245 : site.around ? 130 : 90;
    const outer = [[c[0] - R, c[1] - R], [c[0] + R, c[1] - R], [c[0] + R, c[1] + R], [c[0] - R, c[1] + R]];
    // (water and park switched off: the ground without the canals)
    const holes = show.park ? [...(W && W.poly ? [W.poly] : []), ...((site.around && site.around.water) || []).map(w => w.o || w)] : [];
    add(gFlat(outer, sl - G_GRASS, holes.map(hl => (polygonArea(hl) > 0 ? hl : [...hl].reverse()))), gardenMaterial('context'), { walk: true });
    // the canal: water, its bed, the banks where there is no quay
    if (show.park && W && W.poly) {
      add(gFlat(W.poly, W.bed ?? -2.3), gardenMaterial('bank'));
      const wm = add(gFlat(W.poly, W.level), gardenMaterial('water'));
      wm.receiveShadow = true;
      wm.userData.water = true;
      const onLine = (a, b, P, closed) => P.some((p, i) => { if (!closed && i === P.length - 1) return false; const q = P[(i + 1) % P.length]; return projectOnSegment(a, p, q).d < 0.05 && projectOnSegment(b, p, q).d < 0.05; });
      const quays = (site.around && site.around.quays) || [];
      const banks = [];
      for (let i = 0; i < W.poly.length; i++) {
        const a = W.poly[i], b = W.poly[(i + 1) % W.poly.length];
        // the plot's own edge has the quay wall of the garden; the quays of the plots around are drawn with them
        if (onLine(a, b, site.plot, true) || quays.some(Q => onLine(a, b, Q, false))) continue;
        // elsewhere a grassy bank slopes down into the water
        banks.push(gBankSlope(W.poly, i, sl - G_GRASS, W.level - 0.4, 1.6));
      }
      if (banks.length) add(mergeBoxGeos(banks), gardenMaterial('slope'), { walk: true });
    }
    // streets: road, parking strip and pavement, kerbs, planters, lamps and the street trees (hood.js)
    if (show.street) this.buildStreets(G, site, sl, add, gPlotOutline(site, spec.garden || emptyGarden()));
    // what is around: the park across the canal, reeds, the houses of the neighbourhood (around.js, hood.js)
    if (site.around && this.buildAround) this.buildAround(G, site, sl, add, show);
    if (show.houses && site.around) this.buildHood(G, site, sl - G_GRASS, add, spec);
    // the plot and what covers it
    // the plot: a slab from below the street up to the garden level, so there is no gap under its edge
    // (outside a rounded wall corner the plot stops at the wall's curve; that corner is pavement at street level)
    const plotBottom = sl - G_GRASS - 0.04;
    {
      const shape = new THREE.Shape(gPlotOutline(site, spec.garden || emptyGarden()).map(([x, z]) => new THREE.Vector2(x, -z)));
      const depth = Math.max(0.05, lv - plotBottom);
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, lv - depth, 0);
      // (the garden switched off: the plot as plain grass, nothing on it)
      add(geo, [gardenMaterial(show.garden ? (gd && gd.base) || 'lawn' : 'context'), gardenMaterial(show.garden ? 'path' : 'context')], { walk: true, pick: { plot: true } });
    }
    if (show.street) for (const f of gCornerFillers(site, spec.garden || emptyGarden())) add(gSlab(f, plotBottom, sl - 0.001), gardenMaterial('path'), { walk: true });
    if (!gd) { done(); return; }
    gd.areas.forEach((a, i) => {
      if (a.poly.length < 3) return;
      const y = lv + 0.012 + (i % 5) * 0.002 + (a.kind === 'water' ? -0.25 : 0);
      if (a.kind === 'water') { add(gFlat(a.poly, lv - 0.6), gardenMaterial('bank')); }
      // a thin layer on the ground; where it reaches the plot's edge (a drive, a path to the street) it covers the
      // plot's edge down to below the street
      add(a.kind === 'water' ? gFlat(a.poly, y) : gSlab(gAreaOutline(site, a.poly), plotBottom + 0.01, y), gardenMaterial(a.kind, a.size), { walk: a.kind !== 'water', pick: { garea: a.id } });
    });
    for (const l of gd.lines) {
      const LP = gLinePath(l).filter((q, k, arr) => !k || V.dist(q, arr[k - 1]) > 0.005);
      if (LP.length < 2) continue;
      const pick = { gline: l.id };
      // walls are drawn 8 mm wider on each side: their faces then never lie in the same place as the plot's edge or
      // the edge of a paved area against them (no flicker along the wall)
      const tw = l.t + 0.016;
      if (l.kind === 'wall') {
        // brick in half bond, topped with a course of bricks on edge (rollaag), like the walls in the street
        const top = lv + l.h, rl = Math.min(0.1, l.h * 0.4);
        add(gRibbon(LP, plotBottom - 0.02, top - rl, tw), gWallBrick(), { cast: true, pick });
        add(gRibbon(LP, top - rl, top, tw), gRollaag(), { cast: true, pick });
      } else if (l.kind === 'hedge') {
        // a clipped hedge: the box a little inside, with leaves standing out of it (Beautiful and High)
        const leafy = !this.fast && this.vegHedge;
        add(gRibbon(LP, lv, lv + l.h - (leafy ? 0.04 : 0), leafy ? l.t - 0.08 : l.t), gardenMaterial('hedge'), { cast: true, pick });
        if (leafy) this.vegHedge(LP, lv, { h: l.h - 0.04, t: l.t - 0.08 }, add, pick);
      } else if (l.kind === 'gate') {
        // a metal gate with railing (gate.js)
        this.buildGate(l, lv, add, pick);
      } else if (l.kind === 'fence') {
        for (let i = 1; i < LP.length; i++) {
          const a = LP[i - 1], b = LP[i];
          add(gBox(a, b, lv, lv + l.h, Math.max(0.02, l.t * 0.4), 0), gWood(), { cast: true, pick });
        }
        const L = gLineLen(l), k = Math.max(1, Math.round(L / 1.8));
        for (let j2 = 0; j2 <= k; j2++) { const q = pathAt(LP, L * j2 / k); add(gBox(V.add(q, [-0.04, 0]), V.add(q, [0.04, 0]), lv, lv + l.h + 0.05, 0.08), gWood(), { cast: true }); }
      } else if (l.kind === 'quay') {
        // the top 500 mm in dark brick, ending in a course of bricks on edge; below it rough stone down into the water
        const bottom = (W ? W.level : lv - 1) - 0.7, top = lv + l.h, bk = Math.min(0.5, top - bottom - 0.1);
        add(gRibbon(LP, bottom, top - bk, tw + 0.02), gQuayStone(), { cast: true, pick });
        add(gRibbon(LP, top - bk, top - 0.1, tw), gQuayBrick(), { cast: true, pick });
        add(gRibbon(LP, top - 0.1, top, tw), gQuayRollaag(), { cast: true, pick });
      } else {
        add(gRibbon(LP, lv - 0.05, lv + l.h, l.t), gStone(), { pick });
      }
    }
    for (const pl of gd.plants) this.gTree(G, pl, lv, add);
    done();
  },

  gTree(G, pl, lv, add, opts) {
    // Beautiful and High grow the plant properly (trees.js); Fast keeps these simple shapes
    if (!this.fast && this.vegPlant) return this.vegPlant(G, pl, lv, add, opts);
    const K = G_PLANTS[pl.kind] || G_PLANTS.shrub;
    const d = pl.d || K.d, hh = pl.h || K.h;
    const seed = Math.floor(Math.abs(pl.x * 131 + pl.y * 17)) + 7;
    const pick = pl.id ? { plant: pl.id } : null;
    if (pl.kind === 'pot') {
      add(new THREE.CylinderGeometry(d * 0.42, d * 0.32, hh * 0.45, 16).translate(pl.x, lv + hh * 0.225, pl.y), mat('g|pot', () => new THREE.MeshStandardMaterial({ color: 0x8c5a3c, roughness: 0.8 })), { cast: true, pick });
      add(gCrown(d * 0.45, hh * 0.35, seed).translate(pl.x, lv + hh * 0.65, pl.y), gLeaf('#5f8f45'), { cast: true, pick });
      return;
    }
    if (pl.kind === 'tree' || pl.kind === 'small') {
      const trunkH = hh * (pl.kind === 'tree' ? 0.42 : 0.35);
      add(new THREE.CylinderGeometry(0.06 + d * 0.012, 0.09 + d * 0.018, trunkH + d * 0.2, 8).translate(pl.x, lv + (trunkH + d * 0.2) / 2, pl.y), gTrunk(), { cast: true, pick });
      const ry = (hh - trunkH) / 2;
      add(gCrown(d / 2, ry, seed).translate(pl.x, lv + trunkH + ry, pl.y), gLeaf(pl.kind === 'tree' ? '#58833c' : '#9a4b32'), { cast: true, pick });
      return;
    }
    if (pl.kind === 'grass') {
      add(new THREE.ConeGeometry(d / 2, hh, 9, 1, true).translate(pl.x, lv + hh / 2, pl.y), gLeaf('#a6a565'), { cast: true, pick });
      return;
    }
    add(gCrown(d / 2, hh / 2, seed).translate(pl.x, lv + hh / 2, pl.y), gLeaf('#4f7d3a'), { cast: true, pick });
  },
});
