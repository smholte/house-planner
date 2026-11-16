/* ───────────── install.js — electrics and installations: sockets, switches, light points, data and TV, ventilation
   valves, smoke alarms, thermostats and the floor-heating manifold, as symbols on the plan with their height above the
   floor, counted per room, drawn in 3D (with their height when you come close or walk); floor heating per room ─────────────

   Per version: plan.points = [{ id, storey, kind, sub, n, x, y, h, wall, side, rot, label, note }]
   (h: metres above the floor; ceiling things have h = null and sit at the room's ceiling; rot: the direction the
   symbol faces, in degrees, for things on a wall). Floor heating: room.heat = { on, zone }. */

const PT_KINDS = {
  socket: { label: 'Socket', short: 'Socket', h: 0.3, wall: true, color: 'elec', subs: [['', 'Normal'], ['perilex', 'Perilex (cooker)'], ['group', 'Own group (washer, dishwasher…)'], ['waterproof', 'Waterproof']] },
  switch: { label: 'Switch', short: 'Switch', h: 1.05, wall: true, color: 'elec', subs: [['', 'Single'], ['double', 'Double (serie)'], ['twoway', 'Two-way (wissel)'], ['combo', 'Two-way + single'], ['dimmer', 'Dimmer'], ['vent', 'Ventilation (3 positions)']] },
  light: { label: 'Ceiling light point', short: 'Light', ceil: true, color: 'elec' },
  walllight: { label: 'Wall light point', short: 'Wall light', h: 1.8, wall: true, color: 'elec', subs: [['', 'Inside'], ['outside', 'Outside']] },
  data: { label: 'Data (UTP)', short: 'Data', h: 0.3, wall: true, color: 'data' },
  tv: { label: 'TV / coax', short: 'TV', h: 0.3, wall: true, color: 'data' },
  conduit: { label: 'Empty conduit (loze leiding)', short: 'Conduit', h: 0.3, wall: true, color: 'data' },
  connect: { label: 'Connection point (aansluitpunt, wired)', short: 'Connection', h: 0.3, wall: true, color: 'elec', subs: [['', 'For an appliance'], ['awning', 'Awning (sun screen)'], ['outdoor', 'Outdoor lighting cable'], ['ev', 'Electric car']] },
  vent: { label: 'Ventilation valve', short: 'Valve', ceil: true, color: 'vent', subs: [['extract', 'Extract (afvoer)'], ['supply', 'Supply (toevoer)']] },
  wallvent: { label: 'Ventilation valve on a wall', short: 'Wall valve', h: 2.2, wall: true, color: 'vent', subs: [['extract', 'Extract (afvoer)'], ['supply', 'Supply (toevoer)']] },
  smoke: { label: 'Smoke alarm', short: 'Smoke', ceil: true, color: 'safe' },
  thermostat: { label: 'Thermostat', short: 'Thermostat', h: 1.5, wall: true, color: 'heat' },
  manifold: { label: 'Floor heating manifold', short: 'Manifold', h: 0.5, wall: true, color: 'heat' },
  water: { label: 'Water point', short: 'Water', h: 0.55, wall: true, color: 'water', subs: [['hotcold', 'Hot and cold'], ['cold', 'Cold'], ['drain', 'Drain only'], ['outside', 'Outside tap (frost-free)']] },
  bell: { label: 'Doorbell', short: 'Bell', h: 1.2, wall: true, color: 'elec', subs: [['push', 'Bell push'], ['chime', 'Bell (chime)']] },
  unit: { label: 'Installation unit', short: 'Unit', unit: true, color: 'heat', subs: [['heatpump', 'Heat pump (WP)'], ['wtw', 'Ventilation unit (WTW)'], ['board', 'Meter cupboard board'], ['inverter', 'Solar inverter'], ['vessel', 'Expansion vessel'], ['heater', 'Electric heater (bathroom)'], ['hatch', 'Crawl space hatch (kruipluik)'], ['other', 'Other']] },
};
const PT_ORDER = ['socket', 'switch', 'light', 'walllight', 'data', 'tv', 'conduit', 'connect', 'vent', 'wallvent', 'smoke', 'thermostat', 'manifold', 'water', 'bell', 'unit'];
/** installation units: size [width, depth, height] (m) and the height of their underside above the floor */
const UNIT_SPEC = {
  heatpump: { size: [0.68, 0.64, 1.0], h: 0, tag: 'WP' }, wtw: { size: [0.725, 0.57, 0.81], h: 0.3, tag: 'WTW' },
  board: { size: [0.6, 0.12, 0.8], h: 1.0, tag: 'MK' }, inverter: { size: [0.35, 0.15, 0.45], h: 1.75, tag: 'PV' },
  vessel: { size: [0.3, 0.3, 0.45], h: 0.8, tag: 'EV' }, heater: { size: [0.4, 0.08, 0.8], h: 0.5, tag: 'RAD' },
  hatch: { size: [0.8, 0.5, 0.02], h: 0, tag: 'KL' }, other: { size: [0.4, 0.3, 0.4], h: 0, tag: '?' },
};
const unitSpec = pt => UNIT_SPEC[pt.sub] || UNIT_SPEC.other;
const unitSize = pt => (pt.size && pt.size.length === 3) ? pt.size : unitSpec(pt).size;
/** the four corners of a unit on the plan (pt.x/y is its middle, pt.rot turns its width) */
function unitCorners(pt) {
  const [w, d] = unitSize(pt), a = (pt.rot || 0) * Math.PI / 180;
  const u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [pt.x + u[0] * i * w / 2 + n[0] * j * d / 2, pt.y + u[1] * i * w / 2 + n[1] * j * d / 2]);
}
const ptKind = pt => PT_KINDS[pt.kind] || PT_KINDS.socket;
/** View → Ceiling: the things on the ceiling (ceiling lights, smoke alarms, ceiling valves) have their own switch;
    Electrics is everything else. Until Ceiling is switched once it follows Electrics (so Electrics off, as in older
    files, still hides everything). */
function ceilShown(s) { return s && s.ceilItems != null ? s.ceilItems !== false : !s || s.installs !== false; }
const ptHeight = (pt, plan, st) => pt.h != null ? pt.h : ptKind(pt).unit ? unitSpec(pt).h : roomCeilH(pointRoom(plan, pt), st);
function ptName(pt) {
  const K = ptKind(pt);
  const sub = K.subs && pt.sub ? (K.subs.find(s => s[0] === pt.sub) || [])[1] : '';
  if (K.unit) return t(sub || K.label);
  return (pt.kind === 'socket' && (pt.n || 1) > 1 ? t(pt.n === 2 ? 'Double socket' : 'Triple socket') : t(K.label)) + (sub && pt.sub ? ' · ' + t(sub) : '') + (ptDim(pt) && pt.sub !== 'dimmer' ? ' · ' + t('with dimmer') : '');
}
/** a switch with a dimmer (its own kind 'dimmer', or any switch with dim) */
const ptDim = pt => pt.kind === 'switch' && (pt.dim === true || pt.sub === 'dimmer');
/** the colour of the switches and sockets of a version (USM: the builder's upgrade of the switch range) */
const ELEC_COLORS = [['white', 'White', '#F4F3EF'], ['black', 'Matt black', '#232426'], ['anthracite', 'Anthracite', '#4A4D50'], ['alu', 'Aluminium', '#B9BCBE']];
const elecColor = plan => (ELEC_COLORS.find(c => c[0] === (plan && plan.elecColor)) || ELEC_COLORS[0]);

/** the room a point is in (wall things sit just inside their room) */
function pointRoom(plan, pt) {
  // a thing on a wall belongs to the room on its side of that wall, even when the wall was moved after it was placed
  // (it then sits in the wall or past it – task 0024)
  let q = [pt.x, pt.y];
  const w = pt.wall && pt.side ? plan.walls.find(x => x.id === pt.wall) : null;
  if (w) {
    const L = wallLen(w);
    if (L > 0.01) { const d = wallDir(w), u = clamp(V.dot(V.sub(q, w.a), d), 0, L); q = V.add(V.add(w.a, V.mul(d, u)), V.mul(V.perp(d), pt.side * (w.t / 2 + 0.05))); }
  }
  let best = null;
  for (const r of plan.rooms) if (r.storey === pt.storey && pointInPolygon(q, r.poly) && (!best || roomArea(r) < roomArea(best))) best = r;
  return best;
}
function pointsOfRoom(plan, r) { return (plan.points || []).filter(pt => pt.storey === r.storey && pointRoom(plan, pt) === r); }
/** counts per kind: sockets counted per outlet (a double socket is 2) and per box */
function pointCounts(list) {
  const m = new Map();
  for (const pt of list) {
    const dim = ptDim(pt) && pt.sub !== 'dimmer';
    const k = pt.kind + '|' + (pt.sub || '') + (dim ? '|dim' : '');
    if (!m.has(k)) m.set(k, { kind: pt.kind, sub: pt.sub || '', dim, boxes: 0, outlets: 0 });
    const e = m.get(k); e.boxes++; e.outlets += pt.kind === 'socket' ? (pt.n || 1) : 1;
  }
  return [...m.values()].sort((a, b) => PT_ORDER.indexOf(a.kind) - PT_ORDER.indexOf(b.kind) || a.sub.localeCompare(b.sub) || (a.dim ? 1 : 0) - (b.dim ? 1 : 0));
}
function countLabel(c) {
  const K = PT_KINDS[c.kind] || PT_KINDS.socket;
  const sub = K.subs && c.sub ? ' · ' + t((K.subs.find(s => s[0] === c.sub) || [, c.sub])[1]).toLowerCase() : '';
  if (c.kind === 'socket') return t('{n} sockets in {b} boxes', { n: c.outlets, b: c.boxes }) + sub;
  if (K.unit) return `${c.boxes} × ${t((K.subs.find(s => s[0] === c.sub) || [, K.label])[1])}`;
  return `${c.boxes} × ${t(K.short)}${sub}` + (c.dim ? ' · ' + t('with dimmer') : '');
}

/** the nearest face of a wall (the room side of an outer wall) within reach → where a wall thing goes */
function wallSnap(plan, sid, p, reach) {
  let best = null;
  for (const w of plan.walls) {
    if (w.storey !== sid || w.kind === 'insulation' || w.leaf === 'outer') continue;
    const L = wallLen(w);
    if (L < 0.1) continue;
    const d = wallDir(w), n = V.perp(d);
    const u = clamp(V.dot(V.sub(p, w.a), d), 0.05, L - 0.05);
    const off = V.dot(V.sub(p, w.a), n), side = off >= 0 ? 1 : -1;
    const dist = Math.abs(Math.abs(off) - w.t / 2);
    const along = V.dot(V.sub(p, w.a), d);
    if (along < -0.1 || along > L + 0.1 || dist > reach) continue;
    if (!best || dist < best.dist) {
      const pos = V.add(V.add(w.a, V.mul(d, u)), V.mul(n, side * (w.t / 2 + 0.02)));
      const nn = V.mul(n, side);
      best = { wall: w, side, u, dist, pos, rot: Math.round(Math.atan2(nn[1], nn[0]) * 180 / Math.PI) };
    }
  }
  return best;
}

/* ───────── 2D symbols ───────── */
Object.assign(PlanView.prototype, {
  installsOn() { if (this.spec.installs != null) return this.spec.installs; return this.app.settings.installs !== false || (this.spec.mode === 'build' && this.app.tool === 'install'); },
  /** the ceiling things (own switch: View → Ceiling); with the Electrics tool everything shows */
  ceilOn() { if (this.spec.installs != null) return this.spec.installs; return ceilShown(this.app.settings) || (this.spec.mode === 'build' && this.app.tool === 'install'); },
  ptOn(pt) { return ptKind(pt).ceil ? this.ceilOn() : this.installsOn(); },
  /** symbols in screen space: they keep their size when zooming (like on an installation drawing) */
  drawInstalls(g) {
    if ((!this.installsOn() && !this.ceilOn()) || this.cam.s < 10) return;
    const sel = this.spec.selection;
    const big = this.cam.s > 70;
    const sz = clamp(this.cam.s * 0.2, 4.5, 13);   // smaller when the whole house is in view (a full drawing has ~70 per storey)
    for (const en of this.spec.entries) {
      if (en.wallsOnly) continue;
      const pts = (en.plan.points || []).filter(pt => pt.storey === en.storey.id);
      const baseIds = en.diff && en.basePlan ? new Set((en.basePlan.points || []).map(x => x.id)) : null;
      const list = pts.map(pt => ({ pt, cls: baseIds && !baseIds.has(pt.id) ? ' pt-new' : '' }));
      if (baseIds) { const ids = new Set(pts.map(x => x.id)); for (const pt of en.basePlan.points || []) if (pt.storey === en.storey.id && !ids.has(pt.id)) list.push({ pt, cls: ' pt-gone' }); }
      for (const { pt, cls } of list) {
        const K = ptKind(pt);
        const isSel = sel && sel.type === 'point' && sel.id === pt.id && en.edit;
        if (!isSel && !this.ptOn(pt)) continue;
        const c = this.toScreen([pt.x + en.offset[0], pt.y + en.offset[1]]);
        if (K.unit) {
          // an installation unit (heat pump, WTW …): its outline at its real size, with a short name
          const gu = s('g', { class: `pt2d pt-${K.color} k-unit u-${pt.sub || 'other'}` + cls + (isSel ? ' sel' : ''), 'data-point': pt.id });
          const cs = unitCorners(pt).map(q => this.toScreen([q[0] + en.offset[0], q[1] + en.offset[1]]));
          gu.appendChild(s('polygon', { points: cs.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' '), class: 'pt-body' }));
          if (pt.sub === 'hatch') gu.appendChild(s('path', { d: `M${cs[0][0]} ${cs[0][1]}L${cs[2][0]} ${cs[2][1]}M${cs[1][0]} ${cs[1][1]}L${cs[3][0]} ${cs[3][1]}`, class: 'pt-mark' }));
          gu.appendChild(s('text', { x: c[0].toFixed(1), y: (c[1] + 3).toFixed(1), class: 'pt-txt' }, unitSpec(pt).tag));
          gu.appendChild(s('title', null, ptName(pt) + (pt.label ? ' · ' + pt.label : '')));
          g.appendChild(gu);
          continue;
        }
        const gg = s('g', { class: `pt2d pt-${K.color} k-${pt.kind}` + cls + (isSel ? ' sel' : ''), transform: `translate(${c[0].toFixed(1)} ${c[1].toFixed(1)}) rotate(${K.wall ? (pt.rot || 0) - 90 : 0})`, 'data-point': pt.id });
        this.ptSymbol(gg, pt, sz);
        g.appendChild(gg);
        if ((big || isSel) && K.wall) {
          const n = [Math.cos((pt.rot || 0) * Math.PI / 180), Math.sin((pt.rot || 0) * Math.PI / 180)];
          g.appendChild(s('text', { x: (c[0] + n[0] * (sz * 2.6)).toFixed(1), y: (c[1] + n[1] * (sz * 2.6) + 3.5).toFixed(1), class: 'pt-h' + (isSel ? ' sel' : '') }, fmtMM(pt.h ?? K.h)));
        }
      }
    }
  },
  /** one symbol, drawn facing +y (into the room) from the wall at 0,0 */
  ptSymbol(g, pt, r) {
    const K = ptKind(pt);
    const add = (tag, a) => g.appendChild(s(tag, a));
    if (K.wall) add('line', { x1: 0, y1: 0, x2: 0, y2: r * 0.45, class: 'pt-stem' });
    const cy = K.wall ? r * 1.15 : 0;
    switch (pt.kind) {
      case 'socket': {
        const n = pt.n || 1;
        add('path', { d: `M${-r} ${r * 0.45}A${r} ${r} 0 0 0 ${r} ${r * 0.45}Z`, class: 'pt-body' });
        for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * r * 0.55; add('line', { x1: x, y1: r * 0.45, x2: x, y2: r * 0.45 + r * 0.55, class: 'pt-mark' }); }
        if (pt.sub === 'perilex') add('text', { x: 0, y: r * 2.5, class: 'pt-txt' }, 'P');
        if (pt.sub === 'group') add('text', { x: 0, y: r * 2.5, class: 'pt-txt' }, 'G');
        if (pt.sub === 'waterproof') add('text', { x: 0, y: r * 2.5, class: 'pt-txt' }, 'IP');
        break;
      }
      case 'switch':
        add('circle', { cx: 0, cy, r: r * 0.62, class: 'pt-body' });
        add('line', { x1: 0, y1: cy, x2: r * 1.1, y2: cy + r * 1.0, class: 'pt-mark' });
        if (pt.sub === 'double') add('line', { x1: 0, y1: cy, x2: -r * 1.1, y2: cy + r * 1.0, class: 'pt-mark' });
        if (pt.sub === 'twoway') add('line', { x1: 0, y1: cy, x2: -r * 1.1, y2: cy - r * 1.0 + r * 2, class: 'pt-mark' });
        if (pt.sub === 'dimmer') add('text', { x: 0, y: cy + 3, class: 'pt-txt' }, 'd');
        if (pt.sub === 'combo') { add('line', { x1: 0, y1: cy, x2: -r * 1.1, y2: cy + r * 1.0, class: 'pt-mark' }); add('line', { x1: -r * 1.1, y1: cy + r * 1.0, x2: -r * 1.4, y2: cy + r * 0.6, class: 'pt-mark' }); }
        if (pt.sub === 'vent') add('text', { x: 0, y: cy + 3, class: 'pt-txt small' }, '3');
        // a dimmer: a filled wedge beside it (as on the builder's drawings)
        if (pt.dim === true && pt.sub !== 'dimmer') add('path', { d: `M${r * 0.75} ${cy - r * 0.2}L${r * 1.95} ${cy + r * 0.25}L${r * 0.75} ${cy + r * 0.25}Z`, class: 'pt-mark pt-dim', fill: 'currentColor' });
        break;
      case 'connect': {
        // a wired connection point: a dot with three strokes across its line (the builder's symbol), a letter for what
        add('line', { x1: 0, y1: r * 0.45, x2: 0, y2: r * 1.7, class: 'pt-mark' });
        for (const k of [0.75, 1.05, 1.35]) add('line', { x1: -r * 0.42, y1: r * (k + 0.22), x2: r * 0.42, y2: r * (k - 0.22), class: 'pt-mark' });
        add('circle', { cx: 0, cy: r * 1.85, r: r * 0.36, class: 'pt-mark', fill: 'currentColor' });
        const lab = { awning: 'Z', outdoor: 'K', ev: 'EV' }[pt.sub];
        if (lab) add('text', { x: r * 0.95, y: r * 1.3, class: 'pt-txt small' }, lab);
        break;
      }
      case 'light': case 'walllight':
        if (pt.sub === 'outside') add('line', { x1: -r * 0.9, y1: cy + r * 1.05, x2: r * 0.9, y2: cy + r * 1.05, class: 'pt-mark' });
        add('circle', { cx: 0, cy, r: r * 0.8, class: 'pt-body' });
        add('path', { d: `M${-r * 0.56} ${cy - r * 0.56}L${r * 0.56} ${cy + r * 0.56}M${r * 0.56} ${cy - r * 0.56}L${-r * 0.56} ${cy + r * 0.56}`, class: 'pt-mark' });
        break;
      case 'vent':
        add('circle', { cx: 0, cy, r: r * 0.85, class: 'pt-body' });
        add('circle', { cx: 0, cy, r: r * 0.42, class: 'pt-ring' });
        add('text', { x: 0, y: cy + 3, class: 'pt-txt small' }, pt.sub === 'supply' ? 'T' : 'A');
        break;
      case 'smoke':
        add('circle', { cx: 0, cy, r: r * 0.8, class: 'pt-body' });
        add('text', { x: 0, y: cy + 3.5, class: 'pt-txt' }, 'R');
        break;
      case 'wallvent':
        add('circle', { cx: 0, cy, r: r * 0.75, class: 'pt-body' });
        add('circle', { cx: 0, cy, r: r * 0.36, class: 'pt-ring' });
        add('text', { x: 0, y: cy + 3, class: 'pt-txt small' }, pt.sub === 'supply' ? 'T' : 'A');
        break;
      case 'water': {
        // a drop; W = hot and cold, K = cold, A = drain only, B = outside tap
        add('path', { d: `M0 ${cy - r * 1.05}C${r * 0.95} ${cy - r * 0.05} ${r * 0.75} ${cy + r * 0.8} 0 ${cy + r * 0.8}C${-r * 0.75} ${cy + r * 0.8} ${-r * 0.95} ${cy - r * 0.05} 0 ${cy - r * 1.05}Z`, class: 'pt-body' });
        add('text', { x: 0, y: cy + 3.5, class: 'pt-txt small' }, { cold: 'K', drain: 'A', outside: 'B' }[pt.sub] || 'W');
        break;
      }
      case 'bell':
        if (pt.sub === 'chime') { add('path', { d: `M${-r * 0.8} ${cy + r * 0.45}A${r * 0.8} ${r * 0.8} 0 0 1 ${r * 0.8} ${cy + r * 0.45}Z`, class: 'pt-body' }); add('line', { x1: -r * 0.5, y1: cy + r * 0.45, x2: -r * 0.5, y2: cy + r * 0.9, class: 'pt-mark' }); add('line', { x1: r * 0.5, y1: cy + r * 0.45, x2: r * 0.5, y2: cy + r * 0.9, class: 'pt-mark' }); }
        else { add('circle', { cx: 0, cy, r: r * 0.7, class: 'pt-body' }); add('circle', { cx: 0, cy, r: r * 0.32, class: 'pt-ring' }); }
        break;
      case 'conduit':
        add('circle', { cx: 0, cy: r * 0.75, r: r * 0.38, class: 'pt-mark', fill: 'currentColor' });
        add('text', { x: 0, y: r * 2.1, class: 'pt-txt small' }, 'L');
        break;
      default: {
        const lab = { data: 'D', tv: 'TV', thermostat: 'T', manifold: 'V' }[pt.kind] || '?';
        const w = pt.kind === 'manifold' ? r * 2.2 : pt.kind === 'tv' ? r * 1.8 : r * 1.3;
        add('rect', { x: -w / 2, y: cy - r * 0.65, width: w, height: r * 1.3, rx: 1.5, class: 'pt-body' });
        add('text', { x: 0, y: cy + 3, class: 'pt-txt' + (lab.length > 1 ? ' small' : '') }, lab);
      }
    }
    g.appendChild(s('title', null, ptName(pt) + (K.wall ? ' · ' + fmtMM(pt.h ?? K.h) + ' mm' : '')));
  },
  /** the point under a screen position (the edited storey) */
  pointAt(sp, en) {
    if (!en || (!this.installsOn() && !this.ceilOn())) return null;
    let best = null;
    // as far as the symbol reaches (a finger gets a little more): a tap next to a symbol in a small room picks the room
    const r0 = clamp(this.cam.s * 0.2, 4.5, 13), touch = this._ptype === 'touch' || this._ptype === 'pen';
    const pick = touch ? Math.max(11, r0 * 1.25) : Math.max(6, r0 * 0.85);
    for (const pt of en.plan.points || []) {
      if (pt.storey !== en.storey.id || !this.ptOn(pt)) continue;
      const K = ptKind(pt);
      let c = this.toScreen([pt.x + en.offset[0], pt.y + en.offset[1]]);
      if (K.unit) {
        const cs = unitCorners(pt).map(q => this.toScreen([q[0] + en.offset[0], q[1] + en.offset[1]]));
        const d = pointInPolygon(sp, cs) ? 0 : Math.min(V.dist(c, sp), distToPolygonEdges(sp, cs));
        if (d < (touch ? 9 : 3) && (!best || d < best.d)) best = { pt, d: d + 3 };
        continue;
      }
      if (K.wall) { const a = (pt.rot || 0) * Math.PI / 180; c = [c[0] + Math.cos(a) * r0 * 1.15, c[1] + Math.sin(a) * r0 * 1.15]; }
      const d = V.dist(c, sp);
      if (d < pick && (!best || d < best.d)) best = { pt, d };
    }
    return best && best.pt;
  },
  /** floor heating: a wave pattern in the rooms that have it */
  drawHeat(g, en) {
    if (!this.installsOn()) return;
    // the wave pattern only with the Electrics tool, or on the selected room (else the whole plan would be waves)
    const sel = this.spec.selection, all = this.spec.mode === 'build' && this.app.tool === 'install';
    const only = all ? null : sel && sel.type === 'room' ? sel.id : undefined;
    if (only === undefined) return;
    const rooms = en.plan.rooms.filter(r => r.storey === en.storey.id && r.heat && r.heat.on && (!only || r.id === only));
    if (!rooms.length) return;
    if (!this.svg.querySelector('#heat-pat')) {
      const defs = this.svg.querySelector('defs') || this.svg.insertBefore(s('defs'), this.svg.firstChild);
      const pat = s('pattern', { id: 'heat-pat', patternUnits: 'userSpaceOnUse', width: 0.4, height: 0.2 });
      pat.appendChild(s('path', { d: 'M0 0.1 Q0.1 0 0.2 0.1 T0.4 0.1', class: 'heat-wave' }));
      defs.appendChild(pat);
    }
    for (const r of rooms) g.appendChild(s('polygon', { points: r.poly.map(p => p.join(',')).join(' '), class: 'heat-fill', fill: 'url(#heat-pat)' }));
  },
});

/* ───────── 3D ───────── */
const ptMat = (key, color, opts = {}) => mat('pt|' + key, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: opts.rough ?? 0.5, metalness: 0, emissive: new THREE.Color(opts.emissive || '#000000'), emissiveIntensity: opts.emissive ? 1.2 : 0 }));
Object.assign(View3D.prototype, {
  buildInstalls(g, en, cutH) {
    const plan = en.plan, st = en.storey;
    const list = (plan.points || []).filter(pt => pt.storey === st.id);
    const S = this.app.settings || {}, elecOn = S.installs !== false, ceilOn = ceilShown(S);
    if (!list.length) return;
    const evening = this.spec.light === 'evening';
    const white = ptMat('white', '#F4F3EF'), dark = ptMat('dark', '#3A3F42'), grey = ptMat('grey', '#9A9DA0', { rough: 0.35 });
    // switches and sockets in the version's range colour (matt black: Future Linear); the rest stays white
    const EC = elecColor(plan), plate = EC[0] === 'white' ? white : ptMat('plate-' + EC[0], EC[2], { rough: EC[0] === 'alu' ? 0.4 : 0.7 });
    const hole = EC[0] === 'white' ? grey : ptMat('hole-' + EC[0], EC[0] === 'alu' ? '#55595C' : '#0F1011', { rough: 0.6 });
    const lamp = ptMat('lamp' + (evening ? 1 : 0), '#FFF8EA', { emissive: evening ? '#FFD9A0' : null });
    const near = this.spec.walk ? 6 : 4.5;
    for (const pt of list) {
      const K = ptKind(pt);
      const H = ptHeight(pt, plan, st);
      if (cutH != null && H > cutH && !K.ceil) continue;
      if (K.ceil && cutH != null) continue;
      if (!(K.ceil ? ceilOn : elecOn)) {
        // switched off (View → Electrics / Ceiling): not drawn, but a light of your own still lights its room in the evening
        if (pt.kind === 'light' || pt.kind === 'walllight') {
          g.updateWorldMatrix(true, false);
          const wp = new THREE.Vector3(pt.x, H - (pt.kind === 'light' ? 0.45 : 0), pt.y).applyMatrix4(g.matrixWorld);
          this.lightSpots.push({ pos: wp, power: pt.kind === 'light' ? 3.2 : 1.4, storey: st.id, point: pt.id, hidden: true });
        }
        continue;
      }
      const grp = new THREE.Group();
      const box = (w, hh, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(x, y, z); b.castShadow = false; b.userData.point = pt.id; grp.add(b); return b; };
      const disc = (r, hh, m, y = 0) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 28), m); c.position.y = y; c.userData.point = pt.id; grp.add(c); return c; };
      if (K.unit) {
        // an installation unit: a box at its real size (a crawl space hatch: a frame in the floor)
        const [w, d, hh] = unitSize(pt);
        if (pt.sub === 'hatch') {
          const fr = ptMat('hatch', '#8E9093', { rough: 0.6 });
          box(w, 0.006, 0.03, fr, 0, 0, -d / 2 + 0.015); box(w, 0.006, 0.03, fr, 0, 0, d / 2 - 0.015);
          box(0.03, 0.006, d, fr, -w / 2 + 0.015, 0, 0); box(0.03, 0.006, d, fr, w / 2 - 0.015, 0, 0);
          grp.position.set(pt.x, 0.008, pt.y);
        } else {
          const body = /^#[0-9a-f]{6}$/i.test(pt.color || '') ? ptMat('u' + pt.color, pt.color, { rough: 0.8 }) : pt.sub === 'inverter' ? ptMat('inv', '#D9DCDF') : pt.sub === 'vessel' ? ptMat('vessel', '#C8423A', { rough: 0.4 }) : white;
          if (pt.sub === 'vessel') { const c = disc(w / 2, hh, body, hh / 2); c.castShadow = true; }
          else { const b = box(w, hh, d, body, 0, hh / 2, 0); b.castShadow = true; }
          // a dark panel on the front (display, label)
          // the outdoor heat pump (wider than 90 cm, task 0041) looks like a Mitsubishi Ecodan: the fan behind a black grille
          // on the left two thirds of the front, a white panel with the maker's plate on the right, louvres on the side
          if (pt.sub === 'heatpump' && w > 0.9) {
            // (every part goes into one mesh per colour: this unit is 6 draw calls, not 80)
            // (one mesh, one material: the colour of each part is in its points)
            const blk = '#26282A', fin = '#101112', plate = '#5E6165', ring = '#0B0B0C', blade = '#3E4246', hubM = '#6A6E73', whiteC = '#F4F3EF', greyC = '#9A9DA0';
            const G = new Map(), put = (m, geo) => { if (!G.has(m)) G.set(m, []); G.get(m).push(geo); };
            const bx = (m, w2, h2, d2, x, y, z, rot) => { const geo = new THREE.BoxGeometry(w2, h2, d2); if (rot) geo.applyMatrix4(rot); geo.translate(x, y, z); put(m, geo); };
            const cyl = (m, r, h2, x, y, z) => { const geo = new THREE.CylinderGeometry(r, r, h2, 36); geo.rotateX(Math.PI / 2); geo.translate(x, y, z); put(m, geo); };
            const gw = w * 0.64, gx = -w / 2 + 0.03 + gw / 2, gh = hh - 0.1, fz = d / 2;
            bx(blk, gw, gh, 0.012, gx, hh / 2, fz + 0.002);
            for (let i = 1; i < 18; i++) bx(fin, gw, 0.007, 0.018, gx, 0.05 + gh * i / 18, fz + 0.006);
            for (const x of [-gw / 2, 0, gw / 2]) bx(fin, 0.008, gh, 0.018, gx + x, hh / 2, fz + 0.006);
            const r = Math.min(gw, gh) * 0.43, fy = hh / 2, fzz = fz + 0.011;
            cyl(ring, r, 0.004, gx, fy, fzz);
            for (let k = 0; k < 3; k++) { const a = k * 2.0944, m4 = new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(r * 0.52, 0, 0)).multiply(new THREE.Matrix4().makeRotationX(0.35)); bx(blade, r * 0.62, r * 0.34, 0.004, gx, fy, fzz + 0.003, m4); }
            cyl(hubM, r * 0.2, 0.012, gx, fy, fzz + 0.006);
            const rx = -w / 2 + 0.03 + gw + (w - gw - 0.03) / 2;
            bx(plate, Math.min(0.16, w * 0.13), 0.075, 0.006, rx, hh * 0.84, fz + 0.003);
            bx(whiteC, Math.min(0.1, w * 0.08), 0.012, 0.007, rx, hh * 0.84, fz + 0.004);
            bx(greyC, w - gw - 0.06, 0.004, 0.004, rx, hh * 0.22, fz + 0.002);
            for (let i = 0; i < 12; i++) for (const sx of [-1, 1]) bx(blk, 0.004, 0.012, d * 0.8, sx * (w / 2 + 0.002), hh * 0.12 + hh * 0.76 * i / 11, 0);
            let nv = 0, ni = 0; for (const geos of G.values()) for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
            const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3), I = new Uint32Array(ni);
            let vo = 0, io = 0;
            for (const [hex, geos] of G) {
              const c = new THREE.Color(hex);
              for (const g of geos) {
                const n = g.attributes.position.count;
                P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); U.set(g.attributes.uv.array, vo * 2);
                for (let i = 0; i < n; i++) { C[(vo + i) * 3] = c.r; C[(vo + i) * 3 + 1] = c.g; C[(vo + i) * 3 + 2] = c.b; }
                for (let i = 0; i < g.index.count; i++) I[io + i] = g.index.array[i] + vo;
                vo += n; io += g.index.count; g.dispose();
              }
            }
            const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(U, 2)); mg.setAttribute('color', new THREE.BufferAttribute(C, 3)); mg.setIndex(new THREE.BufferAttribute(I, 1));
            const o = new THREE.Mesh(mg, mat('pt|hp-detail', () => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0 })));
            o.castShadow = false; o.userData.point = pt.id; grp.add(o);
          } else
          if (pt.sub === 'heatpump' || pt.sub === 'wtw' || pt.sub === 'inverter') box(Math.min(0.2, w * 0.4), Math.min(0.08, hh * 0.2), 0.006, dark, 0, hh * 0.78, d / 2 + 0.003);
          if (pt.sub === 'heater') for (let i = 1; i < 8; i++) box(w * 0.96, 0.012, 0.012, grey, 0, hh * i / 8, d / 2 + 0.006);
          grp.position.set(pt.x, H, pt.y);
        }
        grp.rotation.y = -(pt.rot || 0) * Math.PI / 180;
      } else if (K.ceil) {
        if (pt.kind === 'light') disc(0.06, 0.03, lamp, -0.015);
        else if (pt.kind === 'vent') { disc(0.075, 0.012, white, -0.006); disc(0.045, 0.02, grey, -0.012); }
        else disc(0.055, 0.04, white, -0.02);
        grp.position.set(pt.x, H - 0.004, pt.y);
      } else {
        // on the wall: the plate faces into the room (local +z)
        const n = pt.kind === 'socket' ? (pt.n || 1) : 1;
        if (pt.kind === 'socket') { box(0.08 * n - 0.005 * (n - 1), 0.08, 0.012, plate, 0, 0, 0.006); for (let i = 0; i < n; i++) { const hl = disc(0.022, 0.006, hole, 0); hl.rotation.x = Math.PI / 2; hl.position.set((i - (n - 1) / 2) * 0.075, 0, 0.013); } }
        else if (pt.kind === 'switch') {
          const two = pt.sub === 'double' || pt.sub === 'combo';
          box(0.08, 0.08, 0.012, plate, 0, 0, 0.006); box(two ? 0.026 : 0.055, 0.055, 0.008, plate, two ? -0.014 : 0, 0, 0.016); if (two) box(0.026, 0.055, 0.008, plate, 0.014, 0, 0.016);
          // a dimmer: a small round knob on the rocker
          if (ptDim(pt)) { const kn = disc(0.011, 0.01, hole, 0); kn.rotation.x = Math.PI / 2; kn.position.set(two ? -0.014 : 0, -0.012, 0.022); }
        }
        else if (pt.kind === 'connect') { box(0.08, 0.08, 0.03, pt.sub === 'ev' || pt.sub === 'outdoor' || pt.sub === 'awning' ? grey : plate, 0, 0, 0.015); }
        else if (pt.kind === 'walllight') { box(0.1, 0.1, 0.02, white, 0, 0, 0.01); disc(0.05, 0.1, lamp, 0).rotation.x = Math.PI / 2; grp.children[grp.children.length - 1].position.z = 0.07; }
        else if (pt.kind === 'thermostat') { box(0.085, 0.12, 0.022, white, 0, 0, 0.011); box(0.05, 0.04, 0.004, dark, 0, 0.02, 0.023); }
        else if (pt.kind === 'manifold') box(0.6, 0.45, 0.11, white, 0, 0, 0.055);
        else if (pt.kind === 'water') {
          // a stop valve (or two) on a small plate; a drain only: a grey pipe end
          const chrome = ptMat('chrome', '#C9CCCF', { rough: 0.25 });
          if (pt.sub === 'drain') { const c = disc(0.025, 0.04, grey, 0); c.rotation.x = Math.PI / 2; c.position.z = 0.02; }
          else {
            box(pt.sub === 'hotcold' ? 0.14 : 0.07, 0.07, 0.008, white, 0, 0, 0.004);
            for (const x of pt.sub === 'hotcold' ? [-0.04, 0.04] : [0]) { const c = disc(0.012, 0.06, chrome, 0); c.rotation.x = Math.PI / 2; c.position.set(x, 0, 0.03); box(0.035, 0.012, 0.012, x < 0 ? ptMat('hot', '#C8423A') : ptMat('cold', '#2F7FD6'), x, 0.022, 0.05); }
          }
        }
        else if (pt.kind === 'wallvent') { const c = disc(0.07, 0.012, white, 0); c.rotation.x = Math.PI / 2; c.position.z = 0.006; const c2 = disc(0.04, 0.02, grey, 0); c2.rotation.x = Math.PI / 2; c2.position.z = 0.012; }
        else if (pt.kind === 'bell') { box(0.06, 0.09, 0.016, pt.sub === 'chime' ? white : grey, 0, 0, 0.008); if (pt.sub !== 'chime') { const c = disc(0.012, 0.01, white, 0); c.rotation.x = Math.PI / 2; c.position.z = 0.018; } }
        else if (pt.kind === 'conduit') box(0.08, 0.08, 0.01, plate, 0, 0, 0.005);
        else { box(0.08, 0.08, 0.012, pt.kind === 'data' || pt.kind === 'tv' ? plate : white, 0, 0, 0.006); box(0.03, 0.022, 0.004, dark, 0, 0, 0.013); }
        grp.position.set(pt.x, H, pt.y);
        // pt.x/y sit 2 cm in front of the wall: back to the face
        const a = (pt.rot || 0) * Math.PI / 180;
        grp.position.x -= Math.cos(a) * 0.02; grp.position.z -= Math.sin(a) * 0.02;
        grp.rotation.y = Math.PI / 2 - a;
      }
      grp.userData.point = pt.id;
      g.add(grp);
      if (this.spec.selection && this.spec.selection.type === 'point' && this.spec.selection.id === pt.id) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(K.ceil ? 0.11 : 0.09, 0.008, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--accent') || '#0e6f78'), depthTest: false }));
        ring.renderOrder = 6;
        if (K.ceil) ring.rotation.x = Math.PI / 2; else ring.position.z = 0.02;
        grp.add(ring);
      }
      // its height as a label (View → "3D: heights of sockets and switches", off at first); the selected one always
      if (K.wall && this.labelLayer && (this.app.settings.ptHeights === true || (this.spec.selection && this.spec.selection.type === 'point' && this.spec.selection.id === pt.id))) {
        const el = h('div', { class: 'label3d pt3d' }, fmtMM(H));
        el.title = ptName(pt) + ' · ' + fmtMM(H) + ' mm';
        this.labelLayer.appendChild(el);
        const wp = new THREE.Vector3(); grp.updateMatrixWorld(true); grp.getWorldPosition(wp);
        const a = (pt.rot || 0) * Math.PI / 180;
        this.labels.push({ el, pos: wp.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, 0.085, Math.sin(a) * 0.05)), near });
      }
      // a ceiling light of your own: the room's light comes from here (evening)
      if (pt.kind === 'light' || pt.kind === 'walllight') {
        const wp = new THREE.Vector3(); grp.getWorldPosition(wp);
        this.lightSpots.push({ pos: wp.clone().add(new THREE.Vector3(0, pt.kind === 'light' ? -0.45 : 0, 0)), power: pt.kind === 'light' ? 3.2 : 1.4, storey: st.id, point: pt.id });
      }
    }
  },
});

/* ───────── floor heating: is the floor on top of it not too insulating? (ISSO 49) ─────────
   The floor finish and the underlay together may have a thermal resistance of at most 0.15 m²K/W (ISSO 49); 0.10 or
   less is advised (with a heat pump the water is cooler, every bit counts). R = thickness / λ for the finish plus the
   underlay's own R (from its product sheet; typical values here). Parquet is glued, never nailed. */
const FH_MAX = 0.15, FH_GOOD = 0.10;
const FH_FINISH = {   // λ (W/m·K) and the usual thickness (mm)
  oak: { l: 0.16, t: 15 }, laminate: { l: 0.17, t: 8 }, pvc: { l: 0.25, t: 3 }, tiles: { l: 1.3, t: 10 }, stone: { l: 2.5, t: 20 },
  cast: { l: 0.4, t: 3 }, carpet: { l: 0.06, t: 8 }, other: { l: 0.2, t: 10 },
};
const FH_UNDER = [['none', 'None (glued down)', 0], ['fh', 'Thin underlay for floor heating', 0.01], ['foam', 'Foam underlay (2–3 mm)', 0.06], ['cork', 'Cork (3 mm)', 0.07],
  ['fibre', 'Wood fibre (5 mm)', 0.1], ['felt', 'Carpet underlay (felt / foam)', 0.1], ['own', 'Own value (product sheet)', null]];
const FH_FIX = [['glued', 'Glued'], ['floating', 'Floating (click)'], ['nailed', 'Nailed / screwed']];
const fhWood = m => m === 'oak' || m === 'laminate' || m === 'pvc';
/** the floor's build-up on floor heating: { r, finishR, underR, verdict 'good' | 'ok' | 'bad' | 'none', notes [] } */
function floorHeatR(floor) {
  const m = (floor && floor.material) || 'screed', F = FH_FINISH[m];
  if (!F) return { r: 0, finishR: 0, underR: 0, verdict: 'none', notes: [], t: 0 };
  const t = floor.thick > 0 ? floor.thick : F.t;
  const under = floor.under || (m === 'laminate' ? 'fh' : 'none');
  const U = FH_UNDER.find(u => u[0] === under) || FH_UNDER[0];
  const underR = under === 'own' ? Math.max(0, +floor.underR || 0) : U[2];
  const finishR = t / 1000 / F.l, r = finishR + underR;
  const notes = [];
  const fix = floor.fix || (m === 'laminate' ? 'floating' : 'glued');
  if (m === 'oak' && fix === 'nailed') notes.push({ bad: true, text: 'Parquet on floor heating must be glued, never nailed.' });
  if (m === 'oak' && fix === 'floating') notes.push({ text: 'Floating parquet works less well on floor heating; glued is better.' });
  if (m === 'carpet' && under !== 'none') notes.push({ bad: true, text: 'No carpet underlay on floor heating.' });
  if (m === 'oak' && t > 15) notes.push({ text: 'Thicker than 15 mm: check with the supplier that it suits floor heating.' });
  return { r, finishR, underR, t, under, fix, verdict: r <= FH_GOOD + 1e-9 ? 'good' : r <= FH_MAX + 1e-9 ? 'ok' : 'bad', notes };
}
const fmtR = r => fmtDec((Math.round(r * 1000) / 1000).toFixed(3).replace(/(\.\d\d\d*?)0$/, '$1'));

/* ───────── placing, the details, counts ───────── */
Object.assign(app, {
  /** the tool: tap a wall (sockets, switches …) or inside a room (lights, valves …) */
  placePoint(p, en) {
    const o = this.toolOpts;
    const kind = o.ptKind || 'socket', K = PT_KINDS[kind];
    const sub = !K.subs ? '' : (kind === 'vent' || kind === 'wallvent') ? (o.ptVent || 'extract') : kind === 'unit' ? (o.ptUnit || 'heatpump') : kind === 'water' ? (o.ptWater || 'hotcold') : kind === 'connect' ? (o.ptConn || '') : K.subs[0][0];
    const pt = { id: uid('pt_'), storey: en.storey.id, kind, sub, h: K.wall ? (o.ptH && o.ptH[kind] != null ? o.ptH[kind] : K.h) : null };
    if (kind === 'socket') pt.n = o.ptN || 2;
    if (K.unit) { const U = unitSpec(pt); pt.size = U.size.slice(); pt.h = U.h; pt.rot = 0; }
    if (K.wall) {
      const sn = wallSnap(en.plan, en.storey.id, p, Math.max(0.35, 18 / (this.panes[0] && this.panes[0].view.cam ? this.panes[0].view.cam.s : 50)));
      if (!sn) { this.toast(t('Tap close to a wall to place a {k} there.', { k: t(K.short).toLowerCase() })); return; }
      Object.assign(pt, { x: +sn.pos[0].toFixed(3), y: +sn.pos[1].toFixed(3), wall: sn.wall.id, side: sn.side, rot: sn.rot });
    } else {
      const g = this.settings.grid || 0;
      Object.assign(pt, { x: g ? round(p[0], g) : +p[0].toFixed(3), y: g ? round(p[1], g) : +p[1].toFixed(3) });
    }
    this.mutate(plan => { (plan.points = plan.points || []).push(pt); });
  },
  /** dragging a point: along the walls (wall things) or freely */
  movePoint(plan, id, p, sid) {
    const pt = (plan.points || []).find(x => x.id === id);
    if (!pt) return;
    const K = ptKind(pt);
    if (K.wall) {
      const sn = wallSnap(plan, sid, p, 0.6);
      if (!sn) return;
      Object.assign(pt, { x: +sn.pos[0].toFixed(3), y: +sn.pos[1].toFixed(3), wall: sn.wall.id, side: sn.side, rot: sn.rot });
    } else {
      const g = this.settings.grid || 0;
      pt.x = g ? round(p[0], g) : +p[0].toFixed(3); pt.y = g ? round(p[1], g) : +p[1].toFixed(3);
    }
  },

  installOptions(box, chip) {
    const o = this.toolOpts;
    o.ptKind = o.ptKind || 'socket';
    box.appendChild(h('span', { class: 'lbl' }, t('Place')));
    if (window.matchMedia('(max-width: 600px)').matches) {
      // phones: one list instead of ten chips
      const sel = h('select', { class: 'select sm', id: 'pt-kind-pick', 'aria-label': t('What to place') }, ...PT_ORDER.map(k => h('option', { value: k, selected: o.ptKind === k }, t(PT_KINDS[k].short))));
      sel.addEventListener('change', () => { o.ptKind = sel.value; this.renderStageOverlays(); });
      box.appendChild(sel);
    } else for (const k of PT_ORDER) box.appendChild(chip(t(PT_KINDS[k].short), o.ptKind === k, () => { o.ptKind = k; }));
    if (o.ptKind === 'socket') { box.appendChild(h('span', { class: 'lbl' }, '×')); for (const n of [1, 2, 3]) box.appendChild(chip(String(n), (o.ptN || 2) === n, () => { o.ptN = n; })); }
    if (o.ptKind === 'vent' || o.ptKind === 'wallvent') for (const [k, lab] of PT_KINDS.vent.subs) box.appendChild(chip(t(lab), (o.ptVent || 'extract') === k, () => { o.ptVent = k; }));
    if (o.ptKind === 'water') for (const [k, lab] of PT_KINDS.water.subs) box.appendChild(chip(t(lab), (o.ptWater || 'hotcold') === k, () => { o.ptWater = k; }));
    if (o.ptKind === 'unit') for (const [k, lab] of PT_KINDS.unit.subs) box.appendChild(chip(t(lab), (o.ptUnit || 'heatpump') === k, () => { o.ptUnit = k; }));
    if (o.ptKind === 'connect') for (const [k, lab] of PT_KINDS.connect.subs) box.appendChild(chip(t(lab), (o.ptConn || '') === k, () => { o.ptConn = k; }));
    const K = PT_KINDS[o.ptKind];
    box.appendChild(h('span', { class: 'hint' }, K.wall ? t('Tap a wall: {k} at {h} mm.', { k: t(K.short).toLowerCase(), h: fmtMM((o.ptH && o.ptH[o.ptKind]) ?? K.h) }) : K.unit ? t('Tap where it stands; drag it to move it, turn it in its details.') : t('Tap inside a room: on the ceiling.')));
  },

  pointPanel(el, pt) {
    const sel = this.selection;
    const v = this.shownVersion(), plan = v.plan;
    const ro = sel.readOnly || v.locked || this.comparing || this.mode !== 'build' || !this.canEdit();
    const K = ptKind(pt), st = getStorey(this.project, pt.storey);
    const room = pointRoom(plan, pt);
    this.inspHead(el, ptName(pt), (room ? room.name + ' · ' : '') + (st ? st.name : ''));
    const upd = (fn, opts = {}) => this.mutate(pl => { const x = (pl.points || []).find(y => y.id === pt.id); if (x) fn(x); }, { keepInspector: true, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    const kindSel = h('select', { class: 'select', id: 'f-pt-kind', disabled: ro }, ...PT_ORDER.map(k => h('option', { value: k, selected: pt.kind === k }, t(PT_KINDS[k].label))));
    kindSel.addEventListener('change', () => {
      const nk = PT_KINDS[kindSel.value];
      upd(x => { x.kind = kindSel.value; x.sub = nk.subs ? nk.subs[0][0] : ''; if (nk.wall && x.h == null) x.h = nk.h; if (nk.ceil) x.h = null; if (x.kind === 'socket' && !x.n) x.n = 1; }, { keepInspector: false });
    });
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-pt-kind' }, t('What')), kindSel));
    if (K.subs) sec.appendChild(this.segRow(t('Kind'), K.subs, pt.sub || K.subs[0][0], k => upd(x => { x.sub = k; }, { keepInspector: false }), ro, 'pt-sub'));
    if (pt.kind === 'socket') sec.appendChild(this.segRow(t('Outlets in the box'), [['1', 'Single'], ['2', 'Double'], ['3', 'Triple']], String(pt.n || 1), k => upd(x => { x.n = +k; }, { keepInspector: false }), ro, 'pt-n'));
    if (pt.kind === 'switch' && pt.sub !== 'dimmer' && pt.sub !== 'vent') {
      const cb = h('input', { type: 'checkbox', id: 'f-pt-dim', checked: pt.dim === true, disabled: ro });
      cb.addEventListener('change', () => upd(x => { if (cb.checked) x.dim = true; else delete x.dim; }, { keepInspector: false }));
      sec.appendChild(h('label', { class: 'check-row', for: 'f-pt-dim' }, cb, h('span', null, t('With dimmer'))));
    }
    if (['socket', 'switch', 'data', 'tv', 'conduit', 'connect'].includes(pt.kind)) {
      const EC = elecColor(plan);
      const cs = h('select', { class: 'select', id: 'f-elec-color', disabled: ro }, ...ELEC_COLORS.map(([k, lab]) => h('option', { value: k, selected: EC[0] === k }, t(lab))));
      cs.addEventListener('change', () => this.mutate(pl => { pl.elecColor = cs.value; }, { keepInspector: true }));
      sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-elec-color' }, t('Switches and sockets in this version')), cs));
      if (plan.elecRange) sec.appendChild(h('p', { class: 'note-muted', id: 'f-elec-range' }, plan.elecRange));
    }
    if (K.unit) {
      const [w, d, hh] = unitSize(pt);
      const setSize = (i, val) => upd(x => { const s = unitSize(x).slice(); s[i] = clamp(val, 0.02, 3); x.size = s; }, { keepInspector: false });
      sec.appendChild(h('div', { class: 'field-row' }, this.mmField(t('Width'), 'f-pt-w', w, val => setSize(0, val), { disabled: ro }), this.mmField(t('Depth'), 'f-pt-d', d, val => setSize(1, val), { disabled: ro })));
      sec.appendChild(h('div', { class: 'field-row' }, this.mmField(t('Height'), 'f-pt-hh', hh, val => setSize(2, val), { disabled: ro }), this.mmField(t('Underside above the floor'), 'f-pt-h', pt.h ?? unitSpec(pt).h, val => upd(x => { x.h = clamp(val, 0, 3); }, { keepInspector: false }), { disabled: ro })));
      sec.appendChild(h('div', { class: 'chips-row' }, h('button', { class: 'chip', id: 'f-pt-turn', disabled: ro, onclick: () => upd(x => { x.rot = ((x.rot || 0) + 90) % 360; }, { keepInspector: false }) }, icon('rotate'), t('Turn 90°'))));
    } else if (K.wall) {
      sec.appendChild(h('div', { class: 'field-row' }, this.mmField(t('Height above the floor'), 'f-pt-h', pt.h ?? K.h, val => upd(x => { x.h = clamp(val, 0.05, 3); }, { keepInspector: false }), { disabled: ro }), h('div')));
      sec.appendChild(h('div', { class: 'chips-row' }, ...[[0.3, t('Low (300)')], [1.05, t('Switch (1050)')], [1.2, t('Above worktop (1200)')], [1.5, '1500'], [1.8, '1800'], [2.2, '2200']].map(([hh, lab]) => h('button', { class: 'chip', disabled: ro, 'aria-pressed': String(Math.abs((pt.h ?? K.h) - hh) < 0.001), onclick: () => upd(x => { x.h = hh; }, { keepInspector: false }) }, lab))));
    } else sec.appendChild(h('p', { class: 'note-muted' }, t('On the ceiling ({h} mm).', { h: fmtMM(ptHeight(pt, plan, st)) })));
    const lab = h('input', { class: 'input', id: 'f-pt-label', value: pt.label || '', placeholder: t('e.g. TV wall, bed left, kitchen island'), disabled: ro, autocomplete: 'off' });
    lab.addEventListener('input', () => upd(x => { x.label = lab.value; }, { coalesce: 'ptl:' + pt.id }));
    const note = h('textarea', { class: 'textarea', id: 'f-pt-note', disabled: ro, placeholder: t('For the electrician: group, height, type, switched by …') });
    note.value = pt.note || '';
    note.addEventListener('input', () => upd(x => { x.note = note.value; }, { coalesce: 'ptn:' + pt.id }));
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-pt-label' }, t('Name')), lab));
    sec.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-pt-note' }, t('Note')), note));
    el.appendChild(sec);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => { const cp = { ...clone(pt), id: uid('pt_') }; const L = 0.12; const a = ((pt.rot || 0) + 90) * Math.PI / 180; if (K.wall) { cp.x = +(pt.x + Math.cos(a) * L).toFixed(3); cp.y = +(pt.y + Math.sin(a) * L).toFixed(3); } else { cp.x += 0.5; } this.mutate(pl => { pl.points.push(cp); }); this.select({ type: 'point', id: cp.id }); } }, icon('dup'), t('Duplicate')),
      h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete'))),
      h('p', { class: 'note-muted' }, K.wall ? t('Drag it along the wall to move it.') : t('Drag it to move it.'))));
  },

  /** one line in the Floor section: what the floor does on floor heating */
  floorHeatLine(r) {
    const R = floorHeatR(r.floor || {});
    if (R.verdict === 'none') return h('p', { class: 'note-muted fh-line' }, t('Floor heating: the screed as it is.'));
    const bad = R.verdict === 'bad' || R.notes.some(n => n.bad);
    return h('p', { class: 'fh-line ' + (bad ? 'warn-line' : 'note-muted'), id: 'fh-line' }, bad ? icon('alert') : null,
      h('span', null, t('On floor heating: R {r} m²K/W', { r: fmtR(R.r) }) + ' · ' + (bad ? t('see Electrics and installations') : R.verdict === 'good' ? t('good') : t('acceptable'))));
  },
  /** floor heating: the floor's build-up and whether it lets the heat through (ISSO 49) */
  floorHeatCheck(r, ro) {
    const fl = r.floor || {}, m = fl.material || 'screed';
    const box = h('div', { class: 'fh-check', id: 'fh-check' });
    const upd = fn => this.mutate(pl => { const rr = pl.rooms.find(x => x.id === r.id); if (rr) { rr.floor = rr.floor || {}; fn(rr.floor); } }, { keepInspector: false });
    if (!FH_FINISH[m]) { box.appendChild(h('p', { class: 'note-muted' }, t('Floor on floor heating: the screed as it is – nothing in the way.'))); return box; }
    const R = floorHeatR(fl);
    const lab = { good: t('Good for floor heating'), ok: t('Acceptable – lower is better with a heat pump'), bad: t('Too insulating for floor heating') }[R.verdict];
    const pct = Math.min(100, R.r / 0.2 * 100);
    box.appendChild(h('div', { class: 'eyebrow' }, t('Floor on floor heating')));
    box.appendChild(h('div', { class: 'fh-verdict fh-' + R.verdict, id: 'fh-verdict' }, R.verdict === 'bad' ? icon('alert') : icon('check'),
      h('span', null, h('b', null, 'R = ' + fmtR(R.r) + ' m²K/W'), ' · ' + lab)));
    box.appendChild(h('div', { class: 'fh-bar', 'aria-hidden': 'true' }, h('i', { class: 'fh-fill fh-' + R.verdict, style: { width: pct.toFixed(1) + '%' } }),
      h('span', { class: 'fh-mark', style: { left: (FH_GOOD / 0.2 * 100) + '%' }, title: t('advised') }), h('span', { class: 'fh-mark max', style: { left: (FH_MAX / 0.2 * 100) + '%' }, title: 'ISSO 49' })));
    box.appendChild(h('p', { class: 'note-muted' }, t('{f} {t} mm: R {a} + underlay {b}. ISSO 49: at most 0.15 m²K/W, advised 0.10 or less.', { f: t(floorLabel(m)), t: R.t, a: fmtR(R.finishR), b: fmtR(R.underR) })));
    for (const n of R.notes) box.appendChild(h('p', { class: n.bad ? 'warn-line' : 'note-muted' }, n.bad ? icon('alert') : null, h('span', null, t(n.text))));
    box.appendChild(h('div', { class: 'field-row' }, this.numField(t('Thickness of the floor'), 'f-fh-t', R.t, 'mm', v => upd(f => { f.thick = clamp(v, 1, 60); }), { disabled: ro, min: 1, max: 60 }), h('div')));
    const us = h('select', { class: 'select', id: 'f-fh-under', disabled: ro }, ...FH_UNDER.map(([k, l, rv]) => h('option', { value: k, selected: R.under === k }, t(l) + (rv != null ? ' · R ' + fmtR(rv) : ''))));
    us.addEventListener('change', () => upd(f => { f.under = us.value; }));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-fh-under' }, t('Underlay')), us));
    if (R.under === 'own') box.appendChild(h('div', { class: 'field-row' }, this.numField(t('R of the underlay'), 'f-fh-ur', fl.underR || 0, 'm²K/W', v => upd(f => { f.underR = clamp(v, 0, 1); }), { disabled: ro, dec: 3, max: 1 }), h('div')));
    if (fhWood(m)) box.appendChild(this.segRow(t('Laid'), FH_FIX, R.fix, k => upd(f => { f.fix = k; }), ro, 'fh-fix'));
    return box;
  },
  /** the installations in a room's details: counts, the list, floor heating */
  roomInstallSection(el, r, ro, plan) {
    const pts = pointsOfRoom(plan, r);
    const sec = h('div', { class: 'insp-sec inst-sec' }, h('div', { class: 'eyebrow' }, t('Electrics and installations'),
      ro || this.mode !== 'build' ? null : h('button', { class: 'btn ghost sm', onclick: () => this.setTool('install') }, icon('plus'), t('Place'))));
    if (pts.length) {
      sec.appendChild(h('div', { class: 'pt-counts' }, ...pointCounts(pts).map(c => h('span', { class: 'pt-chip pt-' + (PT_KINDS[c.kind] || {}).color }, countLabel(c)))));
      const list = h('div', { class: 'pt-list' });
      for (const pt of pts) list.appendChild(h('button', { class: 'pt-row', onclick: () => this.select({ type: 'point', id: pt.id }) },
        h('span', { class: 'pt-dot pt-' + ptKind(pt).color }), h('span', null, ptName(pt) + (pt.label ? ' · ' + pt.label : '')), h('span', { class: 'num' }, ptKind(pt).wall ? fmtMM(pt.h ?? ptKind(pt).h) : t('ceiling'))));
      sec.appendChild(list);
    } else sec.appendChild(h('p', { class: 'note-muted' }, t('No sockets, switches or light points yet. Use the Electrics tool (E) on the plan.')));
    const heat = r.heat || {};
    const cb = h('input', { type: 'checkbox', id: 'f-heat', checked: !!heat.on, disabled: ro });
    cb.addEventListener('change', () => this.mutate(pl => { const rr = pl.rooms.find(x => x.id === r.id); if (rr) rr.heat = { ...(rr.heat || {}), on: cb.checked }; }, { keepInspector: false }));
    el.appendChild(sec);
    // floor heating: its own section, so the room's jump row can reach it (task 0035)
    const hs = h('div', { class: 'insp-sec heat-sec' }, h('div', { class: 'eyebrow' }, t('Floor heating')));
    hs.appendChild(h('label', { class: 'check-row', for: 'f-heat' }, cb, h('span', null, t('Floor heating in this room'))));
    if (heat.on) {
      const z = h('input', { class: 'input', id: 'f-heat-zone', value: heat.zone || '', placeholder: t('e.g. group 3 on the manifold upstairs'), disabled: ro, autocomplete: 'off' });
      z.addEventListener('input', () => this.mutate(pl => { const rr = pl.rooms.find(x => x.id === r.id); if (rr) rr.heat = { ...(rr.heat || {}), zone: z.value }; }, { keepInspector: true, coalesce: 'hz:' + r.id }));
      hs.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-heat-zone' }, t('Heating zone')), z));
      hs.appendChild(this.floorHeatCheck(r, ro));
    }
    el.appendChild(hs);
  },
});

/** installations that changed in a room between two versions (for "Changes") */
function pointChanges(ra, rb, A, B) {
  const ca = pointCounts(pointsOfRoom(A, ra)), cb = pointCounts(pointsOfRoom(B, rb));
  const ch = [];
  const fmt = l => l.map(countLabel).join(', ') || '—';
  const key = l => JSON.stringify(l.map(c => [c.kind, c.sub, c.boxes, c.outlets]));
  if (key(ca) !== key(cb)) ch.push({ field: 'Installations', from: fmt(ca), to: fmt(cb), long: true });
  const ha = ra.heat && ra.heat.on, hb = rb.heat && rb.heat.on;
  if (!!ha !== !!hb || (ha && (ra.heat.zone || '') !== (rb.heat.zone || ''))) ch.push({ field: 'Floor heating', from: ha ? (ra.heat.zone || t('yes')) : t('no'), to: hb ? (rb.heat.zone || t('yes')) : t('no') });
  return ch;
}

/** the installation points for the materials list: per kind, the whole house */
function installMaterials(plan, rooms) {
  const ids = new Set(rooms.map(r => r.id));
  const pts = (plan.points || []).filter(pt => { const r = pointRoom(plan, pt); return !r || ids.has(r.id); });
  return pointCounts(pts).map(c => ({ key: 'pt|' + c.kind + '|' + c.sub + (c.dim ? '|dim' : ''), group: 'elec', what: t((PT_KINDS[c.kind] || PT_KINDS.socket).label) + (c.sub ? ' · ' + t(((PT_KINDS[c.kind].subs || []).find(s => s[0] === c.sub) || [, c.sub])[1]) : '') + (c.dim ? ' · ' + t('with dimmer') : ''), detail: c.kind === 'socket' ? t('{n} outlets', { n: c.outlets }) : '', amount: c.boxes, unit: t('pieces'), show: c.kind === 'socket' ? t('{b} boxes', { b: c.boxes }) : String(c.boxes) }));
}
