/* ───────────── quantities.js — how much of everything: per room (floor, walls without doors and windows, ceiling,
   skirting, paint for two coats, sealant) and one table of materials for the whole house, as a spreadsheet ─────────────

   The rates are kept in the house file: project.qty = { wallCov, wallCoats, primerCov, preCov, ceilCov, ceilCoats,
   vliesRoll (m² per roll), vliesWaste (%), paperRollW, paperRollL (m), skirt (m per length), kitTube (m per tube),
   floorWaste: { material: % }, and the product names }. A room is left out with room.noQty = true (storage behind the
   knee walls is left out unless noQty is false). */

const QTY_DEFAULT = {
  wallPaint: 'Sigma Pearl Clean Matt', wallCov: 9, wallCoats: 2,
  primer: 'Sigma Wallprimer Plus', primerCov: 12,
  pre: 'Voorstrijk', preCov: 10,
  ceilPaint: 'Sigmacryl Plafond', ceilCov: 8, ceilCoats: 2,
  vliesRoll: 25, vliesWaste: 10,
  paperRollW: 0.53, paperRollL: 10.05,
  skirt: 2.4, kitTube: 12,
  floorWaste: { oak: 10, laminate: 7, pvc: 5, tiles: 10, stone: 10, cast: 0, carpet: 10, other: 10, screed: 0, casco: 0 },
};
function qtySettings(p) {
  const q = (p && p.qty) || {};
  return { ...QTY_DEFAULT, ...q, floorWaste: { ...QTY_DEFAULT.floorWaste, ...(q.floorWaste || {}) } };
}
const roomCounted = r => !(r.noQty ?? !!r.storage);
/** a floor bought as a named product (floor.product: { name, pack: m² a pack }) is counted by that product; its key in
 *  the quantities (a budget line can follow it) */
const floorProduct = fl => (fl && fl.product && (fl.product.name || '').trim() && fl.material !== 'screed' && fl.material !== 'casco' ? fl.product : null);
function floorProductKey(fl) { return 'floor|' + (fl.material || 'screed') + '|p:' + fl.product.name.trim(); }
const PAINTED_CEIL = new Set(['paint', 'plaster']);

/** the area of a room's ceiling (task 0024): flat at the ceiling height, but along the roof where the builder's roof
 *  comes lower (an attic room: the slopes are larger than the floor under them). The roof is the 3D view's height
 *  field of the inside of the roof (view3d.js, kept per shell and storey); without a shell the ceiling is the floor. */
function ceilingArea(r, st, floor) {
  const sh = app.shell;
  if (!(floor > 0) || !sh || !sh.storeys || !sh.storeys[r.storey] || typeof buildRoofCeiling !== 'function') return floor;
  let cache = ROOF_CEIL.get(sh);
  if (!cache) ROOF_CEIL.set(sh, cache = new Map());
  if (!cache.has(r.storey)) cache.set(r.storey, buildRoofCeiling(sh, r.storey));
  const F = cache.get(r.storey);
  if (!F) return floor;
  const ch = roomCeilH(r, st), c = 0.05, bb = bboxOfPoints(r.poly);
  const hAt = (x, y) => { const v = F.at(x, y); return v == null ? ch : Math.min(ch, v); };
  let n = 0, A = 0;
  for (let x = bb.minX + c / 2; x < bb.maxX; x += c) for (let y = bb.minY + c / 2; y < bb.maxY; y += c) {
    if (!pointInPolygon([x, y], r.poly)) continue;
    const gx = (hAt(x + c / 2, y) - hAt(x - c / 2, y)) / c, gy = (hAt(x, y + c / 2) - hAt(x, y - c / 2)) / c;
    A += Math.sqrt(1 + gx * gx + gy * gy); n++;
  }
  // the slope factor on the grid, times the floor's own area (without the holes)
  return n ? floor * Math.max(1, A / n) : floor;
}

/** everything for one room */
function roomQuantities(plan, r, st, S) {
  const stats = roomFinishStats(plan, r, st);
  const floor = Math.max(0, roomArea(r) - roomHoles(plan, r).reduce((a, hl) => a + Math.abs(polygonArea(hl)), 0));
  const mat = (r.floor && r.floor.material) || 'screed';
  const FS = floorSpec(r.floor);
  // a pattern (herringbone, chevron) needs more cutting: 5 % more
  const fw = mat === 'screed' || mat === 'casco' ? 0 : (S.floorWaste[mat] ?? 10) + (FS.pattern === 'herringbone' || FS.pattern === 'chevron' ? 5 : 0);
  const floorPat = FS.kind && r.floor && (r.floor.pattern || r.floor.l) ? floorPatternLabel(r.floor) : '';
  const byBase = { paint: 0, renovlies: 0, paper: 0 };
  const colours = new Map(), papers = new Map();
  let skirting = 0, joint = 0, frames = 0;
  for (const row of stats.faces) {
    const fin = row.fin, f = row.f;
    const base = fin.base === 'paper' && fin.paper && fin.paper.img ? 'paper' : fin.base === 'renovlies' ? 'renovlies' : 'paint';
    byBase[base] += row.cover;
    if (base !== 'paper' && row.cover > 0) {
      const k = (fin.color || '').toUpperCase() + '|' + (fin.name || '');
      if (!colours.has(k)) colours.set(k, { color: fin.color, name: fin.name, area: 0 });
      colours.get(k).area += row.cover;
    }
    if (base === 'paper' && row.cover > 0) {
      const P = fin.paper, fill = P.fit === 'fill';
      const tileTop = fin.tiles && fin.tiles.to > 0 ? fin.tiles.to : 0;
      const hh = Math.max(0, faceHeight(f, st) - tileTop);
      const k = P.img + '|' + (fill ? 'fill' : (P.w + '|' + P.h));
      if (!papers.has(k)) papers.set(k, { P, fill, area: 0, strips: 0, stripLen: 0, walls: [] });
      const e = papers.get(k);
      e.area += row.cover;
      if (fill) e.walls.push({ w: row.len, h: hh, room: r.name });
      else {
        // strips of a roll: one per roll width, each a wall high plus one pattern repeat to match the pattern
        e.strips += Math.ceil(row.len / S.paperRollW - 1e-6);
        e.stripLen = Math.max(e.stripLen, hh + (P.h || 0) + 0.05);
      }
    }
    // skirting where the wall is not tiled at the floor, less the doors and openings
    const T = fin.tiles;
    joint += row.len;
    let doors = 0;
    for (const op of row.ops) {
      const a = Math.max(op.pos - op.w / 2, f.u0), b = Math.min(op.pos + op.w / 2, f.u1), w = Math.max(0, b - a);
      const low = op.kind !== 'window' || (op.sill || 0) < 0.05;
      if (low) doors += w;
      if (op.kind === 'door') frames += 2 * op.h + w;
      else if (op.kind === 'window') frames += 2 * op.h + (low ? 1 : 2) * w;
    }
    if (!T) skirting += Math.max(0, row.len - doors);
  }
  const ch = r.ceilingFinish || 'paint';
  const ceiling = ceilingArea(r, st, floor);
  const ceilPainted = PAINTED_CEIL.has(ch) ? ceiling : 0;
  const painted = byBase.paint + byBase.renovlies;
  return {
    room: r, counted: roomCounted(r), stats,
    floor, floorMat: mat, floorColor: r.floor && r.floor.color, floorPat, floorWaste: fw, floorBuy: floor * (1 + fw / 100), floorProd: floorProduct(r.floor), floorKey: floorProduct(r.floor) ? floorProductKey(r.floor) : null,
    ceiling, ceilFinish: ch, ceilPainted, ceilColor: r.ceilingColor || CEIL_DEFAULT, ceilName: r.ceilingName || '',
    ceilPaintL: ceilPainted * S.ceilCoats / S.ceilCov,
    walls: stats.wall, tiled: stats.tiled, byBase, painted, colours: [...colours.values()], papers: [...papers.values()],
    paintL: painted * S.wallCoats / S.wallCov, primerL: painted / S.primerCov, preL: (byBase.renovlies + byBase.paper) / S.preCov,
    skirting, kit: joint + skirting + frames, tiles: stats.tiles,
  };
}

/** the whole house (the version shown): every room, and the materials added up */
function houseQuantities(p, plan) {
  const S = qtySettings(p);
  const rooms = [];
  for (const st of sortedStoreys(p)) for (const r of plan.rooms) if (r.storey === st.id && r.poly.length >= 3) rooms.push({ ...roomQuantities(plan, r, st, S), storey: st });
  const use = rooms.filter(x => x.counted);
  const sum = k => use.reduce((a, x) => a + x[k], 0);
  const M = [];
  // wall paint per colour
  const wallCols = new Map();
  for (const x of use) for (const c of x.colours) { const k = (c.color || '').toUpperCase() + '|' + c.name; if (!wallCols.has(k)) wallCols.set(k, { ...c, area: 0, rooms: new Set() }); const g = wallCols.get(k); g.area += c.area; g.rooms.add(x.room.name); }
  for (const c of [...wallCols.values()].sort((a, b) => b.area - a.area)) {
    const L = c.area * S.wallCoats / S.wallCov;
    M.push({ key: 'paint|' + (c.color || '').toUpperCase() + '|' + c.name, group: 'paint', what: S.wallPaint + ' · ' + (c.name || c.color), color: c.color, detail: t('{a} of wall, {n} coats, {r} m² per litre', { a: fmtArea(c.area), n: S.wallCoats, r: S.wallCov }) + roomsOf(c.rooms), amount: L, unit: 'L', show: fmtL(L) });
  }
  const painted = sum('painted');
  if (painted > 0) M.push({ key: 'primer', group: 'paint', what: t('Wall primer') + ' · ' + S.primer, detail: t('{a} of wall, 1 coat, {r} m² per litre', { a: fmtArea(painted), r: S.primerCov }), amount: painted / S.primerCov, unit: 'L', show: fmtL(painted / S.primerCov) });
  const vlies = use.reduce((a, x) => a + x.byBase.renovlies, 0), paperA = use.reduce((a, x) => a + x.byBase.paper, 0);
  if (vlies + paperA > 0) M.push({ key: 'pre', group: 'paint', what: t('Primer before renovlies and wallpaper') + ' · ' + S.pre, detail: t('{a} of wall, {r} m² per litre', { a: fmtArea(vlies + paperA), r: S.preCov }), amount: (vlies + paperA) / S.preCov, unit: 'L', show: fmtL((vlies + paperA) / S.preCov) });
  if (vlies > 0) { const rolls = Math.ceil(vlies * (1 + S.vliesWaste / 100) / S.vliesRoll - 1e-9); M.push({ key: 'vlies', group: 'wall', what: t('Renovlies'), detail: t('{a} of wall + {w} %, rolls of {r} m²', { a: fmtArea(vlies), w: S.vliesWaste, r: S.vliesRoll }), amount: rolls, unit: t('rolls'), show: t('{n} rolls', { n: rolls }) }); }
  // wallpaper per pattern
  const pap = new Map();
  for (const x of use) for (const e of x.papers) {
    const k = e.P.img + '|' + (e.fill ? 'fill' : e.P.w + '|' + e.P.h);
    if (!pap.has(k)) pap.set(k, { P: e.P, fill: e.fill, area: 0, rolls: 0, walls: [] });
    const g = pap.get(k);
    g.area += e.area;
    if (e.fill) g.walls.push(...e.walls);
    else { const per = Math.max(1, Math.floor(S.paperRollL / Math.max(0.3, e.stripLen))); g.rolls += Math.ceil(e.strips / per); }
  }
  for (const g of pap.values()) {
    const name = g.P.name || (projectImage(g.P.img) || {}).name || t('Wallpaper');
    if (g.fill) for (const w of g.walls) M.push({ key: 'mural|' + g.P.img + '|' + w.room, group: 'wall', what: t('Photo wallpaper') + ' · ' + name, detail: w.room, amount: w.w * w.h, unit: 'm²', show: `${fmtM(w.w)} × ${fmtM(w.h)}` });
    else M.push({ key: 'paper|' + g.P.img + '|' + g.P.w + '|' + g.P.h, group: 'wall', what: t('Wallpaper') + ' · ' + name, detail: t('{a} of wall, rolls of {w} × {l} m, repeat {r} cm', { a: fmtArea(g.area), w: S.paperRollW, l: S.paperRollL, r: Math.round((g.P.h || 0) * 100) }), amount: g.rolls, unit: t('rolls'), show: t('{n} rolls', { n: g.rolls }) });
  }
  // tiles per kind
  const tl = new Map();
  for (const x of use) for (const k of x.tiles) { const key = tileKey(k.T); if (!tl.has(key)) tl.set(key, { T: k.T, area: 0, rooms: new Set() }); tl.get(key).area += k.area; tl.get(key).rooms.add(x.room.name); }
  for (const g of tl.values()) { const c = tileCount(g.area, g.T); M.push({ key: 'tiles|' + tileKey(g.T), group: 'wall', what: t('Wall tiles') + ' · ' + tileLabel(g.T), color: g.T.color, detail: t('{a} of wall + {w} %: {m} of tiles', { a: fmtArea(g.area), w: g.T.waste ?? 0, m: fmtArea(c.m2) }) + roomsOf(g.rooms), amount: c.tiles, unit: t('tiles'), show: t('{n} tiles', { n: c.tiles }) }); }
  // ceilings per colour
  const cc = new Map();
  for (const x of use) if (x.ceilPainted > 0) { const k = x.ceilColor.toUpperCase() + '|' + x.ceilName; if (!cc.has(k)) cc.set(k, { color: x.ceilColor, name: x.ceilName, area: 0, rooms: new Set() }); cc.get(k).area += x.ceilPainted; cc.get(k).rooms.add(x.room.name); }
  for (const c of cc.values()) { const L = c.area * S.ceilCoats / S.ceilCov; M.push({ key: 'ceil|' + c.color.toUpperCase() + '|' + c.name, group: 'ceil', what: S.ceilPaint + (c.name ? ' · ' + c.name : ''), color: c.color, detail: t('{a} of ceiling, {n} coats, {r} m² per litre', { a: fmtArea(c.area), n: S.ceilCoats, r: S.ceilCov }) + (cc.size > 1 ? roomsOf(c.rooms) : ''), amount: L, unit: 'L', show: fmtL(L) }); }
  // floors per material and colour
  const fl = new Map();
  for (const x of use) if (x.floorMat !== 'screed' && x.floorMat !== 'casco') { const k = x.floorKey || x.floorMat + '|' + (x.floorColor || '') + '|' + x.floorPat; if (!fl.has(k)) fl.set(k, { mat: x.floorMat, color: x.floorColor, pat: x.floorPat, prod: x.floorProd, key: x.floorKey, area: 0, buy: 0, waste: x.floorWaste, rooms: new Set() }); const g = fl.get(k); g.area += x.floor; g.buy += x.floorBuy; g.rooms.add(x.room.name); }
  for (const g of fl.values()) {
    if (g.prod) {
      // a product: bought in whole packs
      const pack = g.prod.pack > 0 ? g.prod.pack : 0, n = pack ? Math.ceil(g.buy / pack - 1e-9) : 0, buy = pack ? n * pack : g.buy;
      M.push({ key: g.key, group: 'floor', what: t('Floor') + ' · ' + g.prod.name.trim(), color: g.color, detail: t('{a} of floor + {w} %', { a: fmtArea(g.area), w: g.waste }) + (pack ? ' · ' + t('{n} packs of {p} m²', { n, p: String(+pack.toFixed(3)) }) : '') + (g.pat ? ' · ' + g.pat : '') + roomsOf(g.rooms), amount: buy, unit: 'm²', show: fmtArea(buy) + (pack ? ' · ' + t('{n} packs', { n }) : '') });
    } else M.push({ key: 'floor|' + g.mat + '|' + (g.color || '').toUpperCase() + (g.pat ? '|' + g.pat : ''), group: 'floor', what: t('Floor') + ' · ' + t(floorLabel(g.mat)) + (g.pat ? ' · ' + g.pat : ''), color: g.color, detail: t('{a} of floor + {w} %', { a: fmtArea(g.area), w: g.waste }) + roomsOf(g.rooms), amount: g.buy, unit: 'm²', show: fmtArea(g.buy) });
  }
  const skirt = sum('skirting');
  if (skirt > 0) { const n = Math.ceil(skirt * 1.05 / S.skirt - 1e-9); M.push({ key: 'skirt', group: 'floor', what: t('Skirting boards'), detail: t('{m} + 5 %, lengths of {l} m', { m: fmtM(skirt), l: S.skirt }), amount: n, unit: t('lengths'), show: t('{n} lengths', { n }) }); }
  if (app.settings.installs !== false || (plan.points || []).length) M.push(...installMaterials(plan, use.map(x => x.room)));
  const kit = sum('kit');
  if (kit > 0) { const n = Math.ceil(kit / S.kitTube - 1e-9); M.push({ key: 'kit', group: 'paint', what: t('Acrylic sealant (no silicone)'), detail: t('{m} of joints: wall–ceiling, skirting, frames; {l} m per tube', { m: fmtM(kit), l: S.kitTube }), amount: n, unit: t('tubes'), show: t('{n} tubes', { n }) }); }
  return { S, rooms, use, materials: M, totals: { floor: sum('floor'), walls: sum('walls'), ceiling: sum('ceiling'), painted, skirt, paintL: sum('paintL'), ceilPaintL: sum('ceilPaintL') } };
}
/** the rooms a material is for, in short */
function roomsOf(set) { const a = [...set]; return a.length ? ' · ' + (a.length > 4 ? a.slice(0, 4).join(', ') + ' ' + t('+{n} more', { n: a.length - 4 }) : a.join(', ')) : ''; }
const fmtL = L => (L < 10 ? fmtDec((Math.ceil(L * 10) / 10).toFixed(1)) : String(Math.ceil(L))) + ' L';

Object.assign(app, {
  /** quantities in a room's details */
  roomQtySection(el, r, ro, plan) {
    const st = getStorey(this.project, r.storey);
    const q = roomQuantities(plan, r, st, qtySettings(this.project));
    const box = h('div', { class: 'insp-sec qty-sec' }, h('div', { class: 'eyebrow' }, t('Quantities'), h('button', { class: 'btn ghost sm', onclick: () => this.quantitiesSheet() }, icon('table'), t('Whole house'))));
    const kv = h('dl', { class: 'kv' });
    const row = (a, b) => { kv.append(h('dt', null, a), h('dd', null, b)); };
    row(t('Floor'), q.floorMat === 'screed' || q.floorMat === 'casco' ? fmtArea(q.floor) : `${fmtArea(q.floor)} → ${fmtArea(q.floorBuy)}`);
    row(t('Walls'), fmtArea(q.walls));
    if (q.painted > 0) row(t('Wall paint, {n} coats', { n: qtySettings(this.project).wallCoats }), fmtL(q.paintL));
    row(t('Ceiling'), fmtArea(q.ceiling) + (q.ceilPaintL > 0 ? ' · ' + fmtL(q.ceilPaintL) : ''));
    row(t('Skirting'), fmtM(q.skirting));
    row(t('Sealant joints'), fmtM(q.kit));
    box.appendChild(kv);
    const cb = h('input', { type: 'checkbox', id: 'f-room-qty', checked: q.counted, disabled: ro });
    cb.addEventListener('change', () => this.mutate(pl => { const rr = pl.rooms.find(x => x.id === r.id); if (rr) rr.noQty = !cb.checked; }, { keepInspector: false }));
    box.appendChild(h('label', { class: 'check-row', for: 'f-room-qty' }, cb, h('span', null, t('Count this room in the materials for the house'))));
    el.appendChild(box);
  },

  /** quantities and materials for the whole house */
  async quantitiesSheet(tab) {
    const p = this.project;
    let cur = tab || this._qtyTab || 'materials', close = null;
    const body = h('div', { class: 'qty-body' });
    const paint = () => {
      const plan = this.shownVersion().plan;
      const Q = houseQuantities(p, plan);
      body.textContent = '';
      body.appendChild(h('p', { class: 'note-muted' }, t('Version “{v}”: {n} rooms counted. Walls without doors, windows and openings, up to the ceiling. Check the rates against the tins and rolls you buy.', { v: this.shownVersion().name, n: Q.use.length })));
      body.appendChild(h('div', { class: 'seg wrap qty-tabs' }, ...[['materials', t('Materials')], ['rooms', t('Per room')], ['rates', t('Rates')]].map(([k, lab]) => h('button', { 'aria-pressed': String(cur === k), 'data-k': k, onclick: () => { cur = this._qtyTab = k; paint(); } }, lab))));
      if (cur === 'materials') {
        const tb = h('table', { class: 'qty-table' }, h('thead', null, h('tr', null, h('th', null, t('Material')), h('th', { class: 'r' }, t('To buy')))));
        const tbody = h('tbody');
        const groups = [['floor', t('Floors')], ['wall', t('Walls')], ['paint', t('Paint and sealant')], ['ceil', t('Ceilings')], ['elec', t('Electrics and installations')]];
        for (const [g, lab] of groups) {
          const rows = Q.materials.filter(m => m.group === g);
          if (!rows.length) continue;
          tbody.appendChild(h('tr', { class: 'grp' }, h('td', { colspan: 2 }, lab)));
          for (const m of rows) tbody.appendChild(h('tr', { class: 'mat-row' }, h('td', null, h('div', { class: 'mat-what' }, m.color ? h('span', { class: 'mini-sw', style: { background: m.color } }) : null, m.what), h('div', { class: 'mat-detail' }, m.detail)), h('td', { class: 'r num' }, m.show)));
        }
        if (!Q.materials.length) tbody.appendChild(h('tr', null, h('td', { colspan: 2 }, t('Nothing to buy yet: give the rooms a floor, and the walls a finish.'))));
        tb.appendChild(tbody);
        body.appendChild(tb);
      } else if (cur === 'rooms') {
        const tb = h('table', { class: 'qty-table rooms' }, h('thead', null, h('tr', null, ...[t('Room'), t('Floor'), t('Walls'), t('Ceiling'), t('Skirting'), t('Paint')].map((x, i) => h('th', { class: i ? 'r' : '' }, x)))));
        const tbody = h('tbody');
        let last = null;
        for (const x of Q.rooms) {
          if (x.storey !== last) { last = x.storey; tbody.appendChild(h('tr', { class: 'grp' }, h('td', { colspan: 6 }, x.storey.name))); }
          tbody.appendChild(h('tr', { class: 'room-q' + (x.counted ? '' : ' off'), onclick: () => { close(null); this.select({ type: 'room', id: x.room.id, storey: x.room.storey }); } },
            h('td', null, x.room.name, x.counted ? null : h('span', { class: 'badge' }, t('not counted'))), h('td', { class: 'r num' }, fmtArea(x.floor)), h('td', { class: 'r num' }, fmtArea(x.walls)), h('td', { class: 'r num' }, fmtArea(x.ceiling)), h('td', { class: 'r num' }, fmtM(x.skirting)), h('td', { class: 'r num' }, fmtL(x.paintL + x.ceilPaintL))));
        }
        tbody.appendChild(h('tr', { class: 'tot' }, h('td', null, t('Counted')), h('td', { class: 'r num' }, fmtArea(Q.totals.floor)), h('td', { class: 'r num' }, fmtArea(Q.totals.walls)), h('td', { class: 'r num' }, fmtArea(Q.totals.ceiling)), h('td', { class: 'r num' }, fmtM(Q.totals.skirt)), h('td', { class: 'r num' }, fmtL(Q.totals.paintL + Q.totals.ceilPaintL))));
        tb.appendChild(tbody);
        body.appendChild(h('div', { class: 'qty-scroll' }, tb));
      } else body.appendChild(this.qtyRates(Q.S, paint));
    };
    paint();
    const v = await UI.dialog({ title: t('Quantities and materials'), body, wide: true, enterKey: false, onOpen: (d, c) => { close = c; }, actions: [
      { label: t('Spreadsheet (.csv)'), value: 'csv', icon: 'download' },
      { label: t('Print or save as PDF'), value: 'print', icon: 'print', kind: 'primary' },
    ] });
    if (v === 'csv') this.quantitiesCsv();
    if (v === 'print') this.printHtml(this.quantitiesHtml(), t('Quantities'));
  },

  qtyRates(S, repaint) {
    const box = h('div', { class: 'qty-rates' });
    const set = (patch) => { this.mutate(pr => { pr.qty = { ...(pr.qty || {}), ...patch }; }, { project: true, keepInspector: true }); repaint(); };
    const num = (k, label, unit, opts = {}) => this.numField(label, 'q-' + k, S[k], unit, v => set({ [k]: v }), { min: opts.min ?? 0.01, dec: opts.dec ?? 2 });
    const txt = (k, label) => { const i = h('input', { class: 'input', id: 'q-' + k, value: S[k], autocomplete: 'off' }); i.addEventListener('change', () => set({ [k]: i.value.trim() || QTY_DEFAULT[k] })); return h('div', { class: 'field' }, h('label', { for: 'q-' + k }, label), i); };
    box.append(
      h('div', { class: 'eyebrow' }, t('Wall paint')),
      txt('wallPaint', t('Product')),
      h('div', { class: 'field-row' }, num('wallCov', t('Covers'), 'm²/L'), num('wallCoats', t('Coats'), '×', { min: 1, dec: 0 })),
      h('div', { class: 'field-row' }, txt('primer', t('Wall primer')), num('primerCov', t('Covers'), 'm²/L')),
      h('div', { class: 'field-row' }, txt('pre', t('Primer before renovlies')), num('preCov', t('Covers'), 'm²/L')),
      h('div', { class: 'eyebrow' }, t('Ceiling paint')),
      txt('ceilPaint', t('Product')),
      h('div', { class: 'field-row' }, num('ceilCov', t('Covers'), 'm²/L'), num('ceilCoats', t('Coats'), '×', { min: 1, dec: 0 })),
      h('div', { class: 'eyebrow' }, t('Rolls and lengths')),
      h('div', { class: 'field-row' }, num('vliesRoll', t('Renovlies per roll'), 'm²'), num('vliesWaste', t('Renovlies extra'), '%', { min: 0, dec: 0 })),
      h('div', { class: 'field-row' }, num('paperRollW', t('Wallpaper roll width'), 'm'), num('paperRollL', t('Wallpaper roll length'), 'm')),
      h('div', { class: 'field-row' }, num('skirt', t('Skirting length'), 'm'), num('kitTube', t('Sealant per tube'), 'm')),
      h('div', { class: 'eyebrow' }, t('Extra floor for cutting')),
      h('div', { class: 'field-row three' }, ...FLOOR_MATERIALS.filter(f => f.id !== 'screed' && f.id !== 'casco').map(f => this.numField(t(f.label), 'q-fw-' + f.id, S.floorWaste[f.id] ?? 10, '%', v => set({ floorWaste: { ...S.floorWaste, [f.id]: v } }), { min: 0, dec: 0 }))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn sm', id: 'q-all-vlies', onclick: async () => {
          if (!this.canEdit()) { this.lockedNotice(); return; }
          const ok = await UI.confirm({ title: t('Renovlies on every wall?'), message: t('Every counted room that is now “Paint” gets “Renovlies + paint” (tiles and wallpaper stay). You can undo this.'), confirmLabel: t('Change the rooms') });
          if (!ok) return;
          this.mutate(pl => { for (const r of pl.rooms) if (roomCounted(r) && (r.wallBase || 'paint') === 'paint' && !(r.tiles && !(r.tiles.to > 0))) r.wallBase = 'renovlies'; }, { keepInspector: true });
          repaint();
        } }, icon('roller'), t('Renovlies + paint in every room')),
        h('button', { class: 'btn sm ghost', onclick: () => { this.mutate(pr => { delete pr.qty; }, { project: true, keepInspector: true }); repaint(); } }, icon('restore'), t('Default rates'))),
      h('p', { class: 'note-muted' }, t('Sigma Pearl Clean Matt: 8–10 m² per litre; Wall Primer Plus: about 12 m² per litre (technical sheets). The rates are kept with the house.')));
    return box;
  },

  quantitiesRows() {
    const Q = houseQuantities(this.project, this.shownVersion().plan);
    const rows = [[t('Material'), t('Details'), t('Amount'), t('Unit')]];
    for (const m of Q.materials) rows.push([m.what, m.detail, +(+m.amount).toFixed(2), m.unit]);
    rows.push([]);
    rows.push([t('Storey'), t('Room'), t('Counted'), t('Floor m²'), t('Floor material'), t('Floor to buy m²'), t('Walls m²'), t('Painted m²'), t('Renovlies m²'), t('Wallpaper m²'), t('Tiled m²'), t('Ceiling m²'), t('Skirting m'), t('Wall paint L'), t('Ceiling paint L'), t('Sealant m')]);
    const n = x => +(+x).toFixed(2);
    for (const x of Q.rooms) rows.push([x.storey.name, x.room.name, x.counted ? t('yes') : t('no'), n(x.floor), t(floorLabel(x.floorMat)), n(x.floorBuy), n(x.walls), n(x.painted), n(x.byBase.renovlies), n(x.byBase.paper), n(x.tiled), n(x.ceiling), n(x.skirting), n(x.paintL), n(x.ceilPaintL), n(x.kit)]);
    return rows;
  },
  quantitiesCsv() {
    const q = x => typeof x === 'number' ? String(x).replace('.', ',') : '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const text = this.quantitiesRows().map(r => r.map(q).join(';')).join('\r\n');
    this.downloadBlob(`${slugify(this.project.name)}_${t('materials')}_${todayStamp()}.csv`, new Blob(['﻿' + text], { type: 'text/csv' }));
  },
  quantitiesHtml() {
    const p = this.project, Q = houseQuantities(p, this.shownVersion().plan);
    const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mats = Q.materials.map(m => `<tr><td>${m.color ? `<i style="background:${esc(m.color)}"></i>` : ''}<b>${esc(m.what)}</b><div class="d">${esc(m.detail)}</div></td><td class="r">${esc(m.show)}</td><td class="tick"></td></tr>`).join('');
    const rooms = Q.rooms.map(x => `<tr${x.counted ? '' : ' class="off"'}><td>${esc(x.storey.name)}</td><td>${esc(x.room.name)}</td><td class="r">${fmtArea(x.floor)}</td><td class="r">${fmtArea(x.walls)}</td><td class="r">${fmtArea(x.ceiling)}</td><td class="r">${fmtM(x.skirting)}</td><td class="r">${fmtL(x.paintL + x.ceilPaintL)}</td></tr>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(t('Quantities and materials'))} · ${esc(p.name)}</title><style>
      body { font: 13px/1.4 system-ui, sans-serif; color: #1a2326; margin: 24px; } h1 { font-size: 20px; margin: 0 0 2px; } h2 { font-size: 15px; margin: 22px 0 6px; }
      .sub { color: #5b6669; margin-bottom: 10px; } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6669; border-bottom: 2px solid #1a2326; padding: 6px 8px; }
      td { vertical-align: top; border-bottom: 1px solid #d5dbdb; padding: 6px 8px; } .r { text-align: right; white-space: nowrap; } .d { color: #5b6669; font-size: 12px; } td.tick { width: 40px; }
      i { display: inline-block; width: 11px; height: 11px; border: 1px solid #0003; border-radius: 2px; margin-right: 6px; vertical-align: -1px; } tr.off { color: #8a9496; } tr { page-break-inside: avoid; }
      @media print { body { margin: 10mm; } }
    </style></head><body><h1>${esc(t('Quantities and materials'))} · ${esc(p.name)}</h1><div class="sub">${esc(this.shownVersion().name)} · ${esc(fmtDate(Date.now()))}</div>
    <h2>${esc(t('Materials'))}</h2><table><thead><tr><th>${esc(t('Material'))}</th><th class="r">${esc(t('To buy'))}</th><th>${esc(t('OK'))}</th></tr></thead><tbody>${mats}</tbody></table>
    <h2>${esc(t('Per room'))}</h2><table><thead><tr><th>${esc(t('Storey'))}</th><th>${esc(t('Room'))}</th><th class="r">${esc(t('Floor'))}</th><th class="r">${esc(t('Walls'))}</th><th class="r">${esc(t('Ceiling'))}</th><th class="r">${esc(t('Skirting'))}</th><th class="r">${esc(t('Paint'))}</th></tr></thead><tbody>${rooms}</tbody></table></body></html>`;
  },
  /** print a page (or save it as PDF); if the browser can't, the page is downloaded */
  printHtml(html, name) {
    const fr = h('iframe', { class: 'print-frame', title: name, style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
    fr.srcdoc = html;
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); if (document.activeElement === fr) fr.blur(); window.focus(); } catch (e) { this.downloadBlob(`${slugify(this.project.name)}_${slugify(name)}.html`, new Blob([html], { type: 'text/html' })); } setTimeout(() => fr.remove(), 60000); };
    document.body.appendChild(fr);
  },
});

Object.assign(app, {
  /** the overview's buttons for the fit-out: quantities, budget, task board */
  fitoutSection(el) {
    const b = (id, ic, label, fn) => h('button', { class: 'btn sm', id, onclick: fn }, icon(ic), label);
    const list = [b('btn-qty', 'table', t('Quantities'), () => this.quantitiesSheet())];
    if (this.budgetSheet) list.push(b('btn-budget', 'euro', t('Budget'), () => this.budgetSheet()));
    if (this.tasksSheet) list.push(b('btn-tasks', 'board', t('Task board'), () => this.tasksSheet()));
    if (this.documentsSheet) list.push(b('btn-docs', 'doc', t('Documents'), () => this.documentsSheet()));
    el.appendChild(h('div', { class: 'insp-sec fitout-sec' }, h('div', { class: 'eyebrow' }, t('Fit-out')), h('div', { class: 'actions' }, ...list)));
  },
});
