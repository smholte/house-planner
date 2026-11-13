/* ───────────── ifc2house.js — turn IFC models into a House Planner project ─────────────
   - storeys from the IFC building storeys (the levels that actually carry walls)
   - plan walls from IFC walls cut at ~1 m above each floor: centre line, thickness, height, sloped tops
     (attic walls under the roof), wall kind (inner / outer leaf / insulation) and their openings
   - doors from IfcDoor, windows from the façade openings
   - rooms by flood-filling between the walls; names can be supplied by the caller
   - a "shell": everything else as triangle meshes (façade brick, roof, slabs, sills, gutters, PV panels,
     stairs …) plus generated window frames and glass, grouped per storey, for the 3D views
   Works in Node (for building the example) and in the browser (Import IFC). Needs IFC + model.js + util.js. */

const IfcHouse = (() => {
  const SKIP_NAME = /tegelwerk|stukadoor|behang|afwerk|plint|kantplank|klampsteen|orientatie|Model Text|Maaiveld|fundering|kruipluik|dekvloer|keukenkast|losse_inrichting|ventilatie_wand|ventilatie_toevoer|rockpanel_9mm/i;
  const OUTER = /metselwerk|baksteen|gevelsteen|brick|gevel/i;
  // façade parts that go with the brick: outside and inside window sills, string courses, lintels, wall vents,
  // down pipes
  const FACADE = /raamdorpel|vensterbank|spekband|latei_staal|l-ligger1|muurventilatierooster|hwa/i;
  const INSUL = /(^|[^a-z])iso[_ ]|isolatie|insulation|pir|eps|steenwol/i;
  const roundTo = (v, s) => Math.round(v / s) * s;

  function storeyName(n) {
    const s = String(n || '').replace(/^[-\d_ ]+/, '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(n);
  }

  /* ───────── pick the real floor levels ───────── */
  function findStoreys(models, wallInfos) {
    const cands = [];
    for (const m of models) for (const e of m.all('IFCBUILDINGSTOREY')) {
      const elev = (e.a[9] || 0) * m.lengthScale;
      cands.push({ name: e.a[2], type: e.a[4] || '', elev });
    }
    // unique by name (models share levels), keep the first
    const byName = new Map();
    for (const c of cands) if (!byName.has(c.name)) byName.set(c.name, c);
    const list = [...byName.values()].sort((a, b) => a.elev - b.elev);
    const covered = c => wallInfos.filter(w => !w.skip && w.zMin >= c.elev - 0.6 && w.zMin <= c.elev + 0.5 && w.zMax >= c.elev + 1.0).length;
    const ok = list.filter(c => covered(c) >= 3);
    // group levels that are within 1.2 m (structural / finish levels) and choose one per group
    const groups = [];
    for (const c of ok) { const g = groups[groups.length - 1]; if (g && c.elev - g[0].elev < 1.2) g.push(c); else groups.push([c]); }
    return groups.map(g => g.find(c => /basis|begane|verdieping|floor|ground|level|etage/i.test(c.type + ' ' + c.name) && !/OK_|BK_|ruwe|constructie/i.test(c.name)) || g[g.length - 1]);
  }

  /* ───────── wall analysis ───────── */
  function analyseWall(m, e, mi) {
    const name = e.a[2] || '';
    const info = { model: mi, id: e.id, name, skip: false };
    if (SKIP_NAME.test(name)) info.skip = true;
    // load-bearing or not (Pset_WallCommon.LoadBearing, when the model says so)
    try { const pr = m.props(e.id); if (typeof pr.LoadBearing === 'boolean') info.load = pr.LoadBearing; } catch (err) { /* no properties */ }
    let polys;
    try { polys = m.productPolys(e.id, { voids: false }).flatMap(g => g.polys); } catch (err) { info.skip = true; return info; }
    if (!polys.length) { info.skip = true; return info; }
    const verts = polys.flatMap(p => p.vs);
    const ax = m.axisLine(e.id);
    let d;
    if (ax && Math.hypot(ax[1][0] - ax[0][0], ax[1][1] - ax[0][1]) > 0.05) d = [ax[1][0] - ax[0][0], ax[1][1] - ax[0][1]];
    else {
      // longest horizontal edge of the body
      let best = 0;
      for (const p of polys) for (let i = 0; i < p.vs.length; i++) {
        const a = p.vs[i], b = p.vs[(i + 1) % p.vs.length];
        if (Math.abs(a[2] - b[2]) > 1e-3) continue;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > best) { best = L; d = [b[0] - a[0], b[1] - a[1]]; }
      }
      if (!d) { info.skip = true; return info; }
    }
    const L0 = Math.hypot(d[0], d[1]);
    d = [d[0] / L0, d[1] / L0];
    const nrm = [-d[1], d[0]];
    const o = ax ? ax[0] : verts[0];
    let uMin = Infinity, uMax = -Infinity, wMin = Infinity, wMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const uz = [];
    for (const v of verts) {
      const u = (v[0] - o[0]) * d[0] + (v[1] - o[1]) * d[1];
      const w = (v[0] - o[0]) * nrm[0] + (v[1] - o[1]) * nrm[1];
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); wMin = Math.min(wMin, w); wMax = Math.max(wMax, w);
      zMin = Math.min(zMin, v[2]); zMax = Math.max(zMax, v[2]);
      uz.push([u, v[2]]);
    }
    Object.assign(info, { d, nrm, o, uMin, uMax, wMin, wMax, zMin, zMax, t: wMax - wMin, len: uMax - uMin });
    if (info.t < 0.04 || info.t > 0.8 || info.len < 0.05) info.skip = true;
    info.kind = INSUL.test(name) ? 'insulation' : OUTER.test(name) ? 'outer' : 'inner';
    // top edge along the wall (upper hull of the body in u/z)
    uz.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const hull = [];
    for (const p of uz) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2], b = hull[hull.length - 1];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9) hull.pop(); else break;
      }
      hull.push(p);
    }
    info.top = hull.filter((p, i) => i === 0 || p[0] - hull[i - 1][0] > 0.005);
    info.flatTop = info.top.every(p => Math.abs(p[1] - zMax) < 0.03);
    return info;
  }

  /* ───────── main ───────── */
  function convert(models, opts = {}) {
    const log = opts.log || (() => {});
    // 1. walls
    const wallInfos = [];
    models.forEach((m, mi) => {
      for (const t of ['IFCWALLSTANDARDCASE', 'IFCWALL', 'IFCWALLELEMENTEDCASE']) for (const e of m.all(t)) wallInfos.push(analyseWall(m, e, mi));
    });
    log(`walls: ${wallInfos.length}, usable ${wallInfos.filter(w => !w.skip).length}`);
    // 2. storeys
    const lev = findStoreys(models, wallInfos);
    if (!lev.length) throw new Error('No floors with walls found in these IFC files.');
    const names = opts.storeyNames || [];
    const storeys = lev.map((c, i) => {
      const next = lev[i + 1];
      return { id: uid('st_'), name: names[i] || storeyName(c.name), level: i, elevation: +c.elev.toFixed(3), height: next ? +(next.elev - c.elev).toFixed(3) : 2.9, wallHeight: 2.6, ifcName: c.name };
    });
    log('storeys: ' + storeys.map(s => s.name + ' @' + s.elevation).join(', '));
    // origin: plan x = X − X0, plan y = Y0 − Y (so the drawing reads like the builder's plans)
    const used = wallInfos.filter(w => !w.skip && storeys.some(s => w.zMin <= s.elevation + 1.0 && w.zMax >= s.elevation + 1.0));
    let X0 = Infinity, Y1 = -Infinity;
    for (const w of used) for (const u of [w.uMin, w.uMax]) for (const off of [w.wMin, w.wMax]) {
      const X = w.o[0] + w.d[0] * u + w.nrm[0] * off, Y = w.o[1] + w.d[1] * u + w.nrm[1] * off;
      X0 = Math.min(X0, X); Y1 = Math.max(Y1, Y);
    }
    X0 = Math.floor(X0 * 10) / 10 - 0.5; Y1 = Math.ceil(Y1 * 10) / 10 + 0.5;
    const P = (X, Y) => [+(X - X0).toFixed(4), +(Y1 - Y).toFixed(4)];
    const origin = { X0, Y1 };
    const storeyByElev = z => { let best = storeys[0]; for (const s of storeys) if (s.elevation <= z + 0.35) best = s; return best; };

    // 3. plan walls per storey
    const plan = { walls: [], openings: [], rooms: [] };
    const wallMap = new Map();      // `${model}:${ifcId}:${storeyId}` → plan wall
    const mappedIfc = new Set();    // `${model}:${ifcId}` of walls drawn in 3D by the plan (not by the shell)
    for (const s of storeys) {
      const cut = s.elevation + 1.0;
      const nextElev = s.elevation + s.height;
      for (const w of wallInfos) {
        if (w.skip) continue;
        const atCut = w.zMin <= cut && w.zMax >= cut;
        const knee = !atCut && w.zMin >= s.elevation - 0.15 && w.zMin < s.elevation + 0.5 && w.zMax > s.elevation + 0.3 && w.zMax < cut && w.zMax - w.zMin < 1.2;
        if (!atCut && !knee) continue;
        // centre line, ends pulled in by t/2 because the plan draws walls with square ends
        const c = (w.wMin + w.wMax) / 2;
        const half = Math.min(w.t / 2, w.len / 2 - 0.001);
        const A = [w.o[0] + w.d[0] * (w.uMin + half) + w.nrm[0] * c, w.o[1] + w.d[1] * (w.uMin + half) + w.nrm[1] * c];
        const B = [w.o[0] + w.d[0] * (w.uMax - half) + w.nrm[0] * c, w.o[1] + w.d[1] * (w.uMax - half) + w.nrm[1] * c];
        const top = Math.min(w.zMax, nextElev + 6) - s.elevation;
        const pw = { id: uid('w_'), storey: s.id, a: P(A[0], A[1]), b: P(B[0], B[1]), t: +w.t.toFixed(3), kind: w.kind === 'inner' ? 'interior' : w.kind === 'insulation' ? 'insulation' : 'exterior', h: null, ifc: w.name.replace(/:\d+$/, '') };
        if (w.kind === 'outer') pw.leaf = 'outer';
        if (w.load != null) { pw.load = w.load; pw.loadSrc = 'ifc'; }
        pw._top = top;
        if (!w.flatTop) {
          const prof = w.top.map(([u, z]) => [+(u - w.uMin - half).toFixed(3), +(z - s.elevation).toFixed(3)]);
          pw.top = prof;
        }
        pw._info = w;
        plan.walls.push(pw);
        wallMap.set(`${w.model}:${w.id}:${s.id}`, pw);
      }
    }
    // inner leaves: structural walls running next to insulation / brick become 'exterior'
    for (const w of plan.walls) {
      if (w.kind !== 'interior') continue;
      const near = plan.walls.some(o => o !== w && o.storey === w.storey && (o.kind === 'insulation' || o.leaf === 'outer') && parallelNear(w, o, 0.25));
      if (near) { w.kind = 'exterior'; w.leaf = 'inner'; }
    }
    // wall heights per storey: the usual top of the interior walls
    for (const s of storeys) {
      const tops = plan.walls.filter(w => w.storey === s.id && w.kind === 'interior' && !w.top).map(w => w._top).sort((a, b) => a - b);
      if (tops.length) s.wallHeight = +tops[Math.floor(tops.length / 2)].toFixed(3);
      if (s.wallHeight > 3.0 || s.wallHeight < 2.0) s.wallHeight = 2.6;
      for (const w of plan.walls) if (w.storey === s.id && !w.top && Math.abs(w._top - s.wallHeight) > 0.05) w.h = +Math.max(0.2, w._top).toFixed(3);
    }
    for (const w of plan.walls) if (w.leaf !== 'outer' && w.kind !== 'insulation') mappedIfc.add(`${w._info.model}:${w._info.id}`);
    log(`plan walls: ${plan.walls.length}`);

    // 4. openings (doors + windows) from the IFC voids of each wall
    const doorOps = [];
    for (const pw of plan.walls) {
      const w = pw._info, m = models[w.model];
      const s = storeys.find(x => x.id === pw.storey);
      const inv = m.inverse();
      const L = wallLen(pw);
      const half = (w.len - L) / 2;
      for (const vid of inv.voids.get(w.id) || []) {
        let polys;
        try { polys = m.productPolys(vid, { voids: false }).flatMap(g => g.polys); } catch (err) { continue; }
        if (!polys.length) continue;
        let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of polys) for (const v of p.vs) {
          const u = (v[0] - w.o[0]) * w.d[0] + (v[1] - w.o[1]) * w.d[1];
          u0 = Math.min(u0, u); u1 = Math.max(u1, u); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]);
        }
        u0 = Math.max(u0, w.uMin); u1 = Math.min(u1, w.uMax);
        const bandTop = s.elevation + (pw.h || s.wallHeight) + 0.3;
        if (u1 - u0 < 0.1 || z1 < s.elevation + 0.05 || z0 > bandTop) continue;
        const filler = m.get(inv.filledBy.get(vid));
        if (filler && /kruipluik/i.test(filler.a[2] || '')) continue;
        const sill = Math.max(0, z0 - s.elevation);
        // an empty cut from the top of the wall down (where a roof or stair needs room) is not a window
        if (!filler && pw.kind === 'interior' && sill > 0.15 && z1 >= w.zMax - 0.05) continue;
        // a slot high up in the façade (above the door, for the brick surround) is above the plan cut
        if ((pw.leaf === 'outer' || pw.kind === 'insulation') && sill > 2.0) continue;
        let kind = filler && filler.t === 'IFCDOOR' ? 'door' : filler && filler.t === 'IFCWINDOW' ? 'window' : sill < 0.15 ? (u1 - u0 <= 1.25 ? 'door' : 'window') : 'window';
        const width = u1 - u0;
        let hgt = Math.min(z1, s.elevation + (pw.h || s.wallHeight)) - Math.max(z0, s.elevation);
        if (kind === 'door') hgt = Math.min(hgt, 2.315);
        const pos = (u0 + u1) / 2 - w.uMin - half;
        const op = { id: uid('o_'), wall: pw.id, kind, pos: +pos.toFixed(3), w: +width.toFixed(3), h: +hgt.toFixed(3), sill: kind === 'window' ? +sill.toFixed(3) : 0, hinge: 'start', swing: 'left' };
        if (pw.leaf === 'outer' || pw.kind === 'insulation') { op.leaf = true; if (op.kind === 'door') op.kind = 'opening'; }
        plan.openings.push(op);
        if (kind === 'door' && !op.leaf) doorOps.push({ op, pw, filler });
      }
    }
    // a door is cut through every layer of a façade; keep doors only in the inner leaf, windows in all layers
    log(`openings: ${plan.openings.length}`);
    // two IFC walls drawn as one plan wall can bring the same opening twice: keep one
    for (let i = plan.openings.length - 1; i >= 0; i--) {
      const o = plan.openings[i];
      const dup = plan.openings.find((q, j) => j < i && q.wall === o.wall && Math.abs(q.pos - o.pos) < 0.1 && Math.abs(q.w - o.w) < 0.15 && Math.abs(q.sill - o.sill) < 0.1);
      if (!dup) continue;
      if (o.w > dup.w) Object.assign(dup, { pos: o.pos, w: o.w, h: Math.max(o.h, dup.h) });
      plan.openings.splice(i, 1);
      const k = doorOps.findIndex(x => x.op === o);
      if (k >= 0) doorOps.splice(k, 1);
    }
    // a door through a cavity wall (two leaves, e.g. into an unheated storage room) is one door: keep the
    // leaf on the wall the IFC door sits in, the other leaf gets a plain opening
    for (const A of doorOps) for (const B of doorOps) {
      if (A === B || A.op.kind !== 'door' || B.op.kind !== 'door' || A.pw.storey !== B.pw.storey) continue;
      const dA = wallDir(A.pw);
      if (Math.abs(V.cross(dA, wallDir(B.pw))) > 0.02) continue;
      const cA = V.add(A.pw.a, V.mul(dA, A.op.pos)), cB = V.add(B.pw.a, V.mul(wallDir(B.pw), B.op.pos));
      if (Math.abs(V.dot(V.sub(cB, cA), dA)) > 0.15 || V.dist(cA, cB) > 0.6 || Math.abs(A.op.w - B.op.w) > 0.15) continue;
      (B.filler && !A.filler ? A : B).op.kind = 'opening';
    }

    // 4b. knee walls (knieschotten): often modelled as layers of the roof element — thin upright boards standing
    //     on the attic floor. They become plan walls (2D, the storey's 3D, room edges); the shell skips them.
    const kneeGroups = new Set();
    models.forEach((m, mi) => {
      for (const e of m.all('IFCROOF')) {
        let groups;
        try { groups = m.productPolys(e.id); } catch (err) { continue; }
        const info = groups.map((g, gi) => ({ g, gi, bb: IFC.bboxOf(g.polys) }));
        for (const b of info) {
          const dx = b.bb.mx[0] - b.bb.mn[0], dy = b.bb.mx[1] - b.bb.mn[1], dz = b.bb.mx[2] - b.bb.mn[2];
          if (Math.min(dx, dy) > 0.06 || Math.max(dx, dy) < 0.6 || dz < 0.8 || dz > 2.2) continue;
          const st = storeys.find(x => Math.abs(b.bb.mn[2] - x.elevation) < 0.15);
          if (!st || kneeGroups.has(`${mi}:${e.id}:${b.gi}`)) continue;
          const al = dx > dy ? 0 : 1, ac = 1 - al;
          // the board plus the studs and plates right behind it
          let lo = b.bb.mn[ac], hi = b.bb.mx[ac];
          for (const o of info) {
            const ob = o.bb;
            if (ob.mx[ac] - ob.mn[ac] > 0.12 || ob.mn[2] < b.bb.mn[2] - 0.06 || ob.mx[2] > b.bb.mx[2] + 0.06) continue;
            if (ob.mn[al] < b.bb.mn[al] - 0.05 || ob.mx[al] > b.bb.mx[al] + 0.05) continue;
            if (ob.mx[ac] < lo - 0.1 || ob.mn[ac] > hi + 0.1) continue;
            lo = Math.min(lo, ob.mn[ac]); hi = Math.max(hi, ob.mx[ac]);
            kneeGroups.add(`${mi}:${e.id}:${o.gi}`);
          }
          kneeGroups.add(`${mi}:${e.id}:${b.gi}`);
          const t = Math.max(0.05, Math.min(0.12, hi - lo)), c = (lo + hi) / 2;
          const A = al === 0 ? [b.bb.mn[0] + t / 2, c] : [c, b.bb.mn[1] + t / 2], B = al === 0 ? [b.bb.mx[0] - t / 2, c] : [c, b.bb.mx[1] - t / 2];
          const a = P(A[0], A[1]), bb2 = P(B[0], B[1]);
          // the same knee wall seen twice (boards on both faces)
          if (plan.walls.some(w => w.knee && w.storey === st.id && V.dist(w.a, a) < 0.15 && V.dist(w.b, bb2) < 0.15)) continue;
          plan.walls.push({ id: uid('w_'), storey: st.id, a, b: bb2, t: +t.toFixed(3), kind: 'interior', h: +(b.bb.mx[2] - st.elevation).toFixed(3), ifc: 'Knieschot (in het dak)', knee: true });
        }
      }
    });
    if (kneeGroups.size) log(`knee walls: ${plan.walls.filter(w => w.knee).length}`);
    // 4c. walls the caller adds (corrections to the model), in IFC coordinates
    for (const xw of opts.extraWalls || []) {
      const st = storeys.find(x => x.name === xw.storey);
      if (!st || !xw.from || !xw.to) continue;
      plan.walls.push({ id: uid('w_'), storey: st.id, a: P(xw.from[0], xw.from[1]), b: P(xw.to[0], xw.to[1]), t: xw.t || 0.1, kind: 'interior', h: xw.h || null, ifc: xw.label || 'Added wall', ...(xw.knee ? { knee: true } : {}) });
    }

    // 5. rooms — under a sloping roof the room ends where the roof meets the floor: cells where the roof
    //    solid occupies the height just above the floor count as solid (ray parity through the roof triangles)
    const roofTris = [];
    models.forEach(m => {
      for (const e of m.all('IFCROOF')) {
        let polys;
        try { polys = m.productPolys(e.id).flatMap(g => g.polys); } catch (err) { continue; }
        for (const p of polys) for (let i = 1; i < p.vs.length - 1; i++) {
          const t = [p.vs[0], p.vs[i], p.vs[i + 1]].map(v => { const q = P(v[0], v[1]); return [q[0], q[1], v[2], ]; });
          roofTris.push({ t, down: p.plane.n[2] < -0.05 });
        }
      }
    });
    const markRoof = z0 => R => { for (const dz of [0, 0.3, 0.6, 0.9]) markRoofAt(z0 + dz)(R); };
    const markRoofAt = zc => R => {
      const par = new Uint8Array(R.W * R.H);
      for (const { t } of roofTris) {
        const [a, b, c] = t;
        const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if (Math.abs(det) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - R.ox) / R.res)), x1 = Math.min(R.W - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - R.ox) / R.res));
        const y0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - R.oy) / R.res)), y1 = Math.min(R.H - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - R.oy) / R.res));
        for (let y = y0; y <= y1; y++) {
          const py = R.oy + (y + 0.5) * R.res;
          for (let x = x0; x <= x1; x++) {
            const px = R.ox + (x + 0.5) * R.res;
            const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
            const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
            const l3 = 1 - l1 - l2;
            if (l1 < 0 || l2 < 0 || l3 < 0) continue;
            const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
            if (z > zc) par[y * R.W + x] ^= 1;
          }
        }
      }
      for (let i = 0; i < par.length; i++) if (par[i]) R.solid[i] = 1;
    };
    const roofLine = z => {
      // the underside of the roof cut at height z → plan segments
      const segs = [];
      for (const { t, down } of roofTris) {
        if (!down) continue;
        const pts = [];
        for (let k = 0; k < 3; k++) {
          const a = t[k], b = t[(k + 1) % 3];
          if ((a[2] - z) * (b[2] - z) < 0) { const f = (z - a[2]) / (b[2] - a[2]); pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
        }
        if (pts.length === 2 && V.dist(pts[0], pts[1]) > 0.01) segs.push(pts);
      }
      return segs;
    };
    const roomNames = (opts.rooms || []).map(r => ({ ...r, p: r.at ? P(r.at[0], r.at[1]) : null }));
    const shafts = [];
    for (const s of storeys) {
      const walls = plan.walls.filter(w => w.storey === s.id);
      const wb = bboxOfPoints(walls.flatMap(w => [w.a, w.b]));
      if (opts.debugRaster) { const R = rasterWalls(walls); markRoof(s.elevation + 0.1)(R); opts.debugRaster(s.name, R); }
      // small gaps between IFC walls can let a room "leak"; try closing gaps of growing size and keep the
      // result that finds the most enclosed floor area
      // a closed area is a room when it is big enough, or when the drawings name it (a meterkast can be < 0.5 m²)
      const minA = opts.minRoomArea || 0.6;
      const namedHere = roomNames.filter(r => r.storey === s.name && r.p);
      const isNamed = f => namedHere.some(r => pointInPolygon(r.p, f.poly));
      // a small space with a door is a room too (meterkast, cupboard); without a door it is a shaft
      const doorsHere = plan.openings.filter(op => op.kind === 'door' && !op.leaf).map(op => {
        const w = plan.walls.find(x => x.id === op.wall);
        return w && w.storey === s.id ? { c: V.add(w.a, V.mul(wallDir(w), op.pos)), t: w.t } : null;
      }).filter(Boolean);
      const hasDoor = f => doorsHere.some(d => distToPolygonEdges(d.c, f.poly) < d.t / 2 + 0.04);
      const keep = f => {
        if (isNamed(f) || hasDoor(f)) return f.area >= 0.15;
        const bb = bboxOfPoints(f.poly);
        return f.area >= minA && Math.min(bb.w, bb.h) >= 0.45;     // skip slivers inside cavity walls
      };
      const inside = f => { const lp = labelPoint(f.poly); return wb && lp[0] > wb.minX && lp[0] < wb.maxX && lp[1] > wb.minY && lp[1] < wb.maxY; };
      let found = [], bestArea = -1, bestAll = [];
      for (const k of [0, 0.04, 0.08, 0.12]) {
        const all = findAllRooms(walls, 0.15, markRoof(s.elevation + 0.1), { extend: k, dilate: k ? 1 : 0, minRaster: 0.008 }).filter(inside);
        const list = all.filter(keep);
        // more separate rooms means fewer leaks; then prefer the larger total area
        const tot = list.length * 1000 + list.reduce((a, f) => a + f.area, 0);
        if (opts.log) opts.log(`  ${s.name} gap ${k}: ${list.length} rooms, ${list.reduce((a, f) => a + f.area, 0).toFixed(1)} m²`);
        if (tot > bestArea + 0.5) { bestArea = tot; found = list; bestAll = all; }
      }
      // small closed boxes that are not rooms are shafts (leidingschacht): drawn with the usual cross
      for (const f of bestAll) {
        if (found.includes(f)) continue;
        const bb = bboxOfPoints(f.poly);
        if (Math.min(bb.w, bb.h) < 0.06 || Math.max(bb.w, bb.h) > 1.6 || Math.max(bb.w, bb.h) / Math.min(bb.w, bb.h) > 8) continue;
        // only boxes inside the house: no side against insulation or the outer brick (that is the façade cavity)
        const nearest = q => { let best = null, bd = Infinity; for (const w of walls) { const d = projectOnSegment(q, w.a, w.b).d - w.t / 2; if (d < bd) { bd = d; best = w; } } return bd < 0.06 ? best : null; };
        let ok = true;
        for (let i = 0; i < f.poly.length && ok; i++) {
          const w = nearest(V.lerp(f.poly[i], f.poly[(i + 1) % f.poly.length], 0.5));
          if (!w || w.kind === 'insulation' || w.leaf === 'outer' || w.knee) ok = false;
        }
        if (ok) shafts.push({ sid: s.id, poly: f.poly });
      }
      let n = 0;
      for (const f of found) {
        const named = roomNames.filter(r => r.storey === s.name && r.p && pointInPolygon(r.p, f.poly));
        const room = { id: uid('r_'), storey: s.id, name: named[0] ? named[0].name : 'Room ' + (++n), poly: f.poly, floor: { material: 'screed', color: '#B9B5AC' }, wallColor: WALL_FINISH_DEFAULT, wallColorName: 'Wallpaper-ready (behangklaar)', notes: '', items: [] };
        if (named[0] && named[0].notes) room.notes = named[0].notes;
        if (named[0] && named[0].split) {
          // one open space that the drawings name as two rooms (e.g. living room + kitchen)
          const sp = named[0].split;
          const a = P(sp.line[0][0], sp.line[0][1]), b = P(sp.line[1][0], sp.line[1][1]);
          const parts = splitPolygonByLine(f.poly, a, b);
          for (const part of parts) {
            if (Math.abs(polygonArea(part)) < 0.5) continue;
            const nm = roomNames.find(r => r.storey === s.name && r.p && pointInPolygon(r.p, part));
            plan.rooms.push({ ...clone(room), id: uid('r_'), name: nm ? nm.name : room.name, poly: part, notes: nm && nm.notes || '' });
          }
          continue;
        }
        plan.rooms.push(room);
      }
      // the low storage behind a knee wall: from the knee wall to where the roof comes down to the floor, between
      // the knee wall's ends. Found with the roof marked only near the floor, then cut to the strip behind the wall.
      const knees = walls.filter(w => w.knee && wallLen(w) > 1.2);
      if (knees.length) {
        const low = R => { for (const dz of [0.03, 0.15]) markRoofAt(s.elevation + dz)(R); };
        const regions = findAllRooms(walls, 0.15, low, { minRaster: 0.2 }).filter(inside);
        let k = 0;
        for (const kw of knees) {
          const d = wallDir(kw), n = V.perp(d), mid = V.lerp(kw.a, kw.b, 0.5);
          const roomOn = sg => plan.rooms.some(r => r.storey === s.id && !r.storage && pointInPolygon(V.add(mid, V.mul(n, sg * (kw.t / 2 + 0.3))), r.poly));
          const sg = roomOn(1) && !roomOn(-1) ? -1 : roomOn(-1) && !roomOn(1) ? 1 : 0;
          if (!sg) continue;
          const out = V.mul(n, sg), probe = V.add(mid, V.mul(out, kw.t / 2 + 0.12));
          const f = regions.find(r => pointInPolygon(probe, r.poly));
          if (!f) continue;
          // how deep the space is behind the middle of the knee wall; deeper bits (into a dormer) are cut off
          let depth = 0;
          while (depth < 3 && pointInPolygon(V.add(probe, V.mul(out, depth + 0.02)), f.poly)) depth += 0.02;
          let poly = clipHalf(f.poly, V.add(mid, V.mul(out, kw.t / 2)), out);
          poly = clipHalf(poly, V.add(probe, V.mul(out, depth + 0.06)), V.mul(out, -1));
          poly = clipHalf(poly, V.sub(kw.a, V.mul(d, kw.t / 2)), d);
          poly = clipHalf(poly, V.add(kw.b, V.mul(d, kw.t / 2)), V.mul(d, -1));
          poly = cleanPoly(poly.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]));
          if (poly.length < 3) continue;
          const area = Math.abs(polygonArea(poly)), bb = bboxOfPoints(poly);
          if (area < 0.5 || Math.min(bb.w, bb.h) < 0.3) continue;
          if (polygonArea(poly) < 0) poly.reverse();
          const nm = namedHere.find(r => pointInPolygon(r.p, poly));
          plan.rooms.push({ id: uid('r_'), storey: s.id, name: nm ? nm.name : (opts.storageName || 'Storage behind knee wall'), poly, floor: { material: 'screed', color: '#B9B5AC' }, wallColor: WALL_FINISH_DEFAULT, wallColorName: '', notes: nm && nm.notes || '', items: [], storage: true });
          k++;
        }
        log(`  ${s.name}: ${k} storage spaces behind knee walls`);
      }
    }
    log(`rooms: ${plan.rooms.length}`);

    // 6. finishes from IFC coverings: floor tiles and wall tiles per room
    models.forEach((m, mi) => {
      for (const e of m.all('IFCCOVERING').concat(m.all('IFCWALLSTANDARDCASE'))) {
        const nm = e.a[2] || '';
        const isFloorTile = /vloertegel/i.test(nm), isWallTile = /tegelwerk|wandtegel/i.test(nm) && e.t === 'IFCWALLSTANDARDCASE';
        if (!isFloorTile && !isWallTile) continue;
        let polys;
        try { polys = m.productPolys(e.id, { voids: false }).flatMap(g => g.polys); } catch (err) { continue; }
        if (!polys.length) continue;
        const bb = IFC.bboxOf(polys);
        const s = storeyByElev(bb.mn[2] + 0.05);
        const c = P((bb.mn[0] + bb.mx[0]) / 2, (bb.mn[1] + bb.mx[1]) / 2);
        for (const r of plan.rooms) {
          if (r.storey !== s.id) continue;
          const inside = pointInPolygon(c, r.poly) || (isWallTile && distToPolygonEdges(c, r.poly) < 0.05 && nearInside(c, r.poly, 0.06));
          if (!inside) continue;
          if (isFloorTile) r.floor = { material: 'tiles', color: '#8D9192' };
          if (isWallTile) {
            const topRel = bb.mx[2] - s.elevation;
            r._tile = Math.max(r._tile || 0, topRel);
          }
        }
      }
    });
    for (const r of plan.rooms) if (r._tile) { r.tiles = { ...TILE_DEFAULT, to: r._tile > 2.3 ? 0 : Math.round(r._tile * 10) / 10 }; r.wallColorName = ''; delete r._tile; }

    // 6b. a full-height gap between two rooms is a passage, not a window
    for (const op of plan.openings) {
      if (op.kind !== 'window' || op.sill > 0.15 || op.leaf) continue;
      const pw = plan.walls.find(w => w.id === op.wall);
      const d = wallDir(pw), n = V.perp(d), c = V.add(pw.a, V.mul(d, op.pos)), off = pw.t / 2 + 0.25;
      const inRoom = p => plan.rooms.some(r => r.storey === pw.storey && pointInPolygon(p, r.poly));
      if (inRoom(V.add(c, V.mul(n, off))) && inRoom(V.sub(c, V.mul(n, off)))) op.kind = 'opening';
    }

    // 6c. doors in the façade at floor level. The façade model has the openings but no frames, so the kind of
    //     door is worked out here: into the entrance hall it is the front door with a narrow side light either
    //     side; with a window sill (vensterbank) inside the opening it is a door with a window beside it; a very
    //     wide opening is a double door with side lights, a wide one a double door, a narrow one a single door.
    const sills = [];
    models.forEach(m => {
      for (const e of m.all('IFCCOVERING')) {
        if (!/vensterbank/i.test(e.a[2] || '')) continue;
        let bb; try { bb = IFC.bboxOf(m.productPolys(e.id).flatMap(g => g.polys)); } catch (err) { continue; }
        sills.push({ pts: [P(bb.mn[0], bb.mn[1]), P(bb.mx[0], bb.mn[1]), P(bb.mx[0], bb.mx[1]), P(bb.mn[0], bb.mx[1])], z: bb.mx[2] });
      }
    });
    const Pi = (x, y) => [x + X0, Y1 - y];              // plan → IFC
    const doorSets = [];
    const ENTRY = /entree|entrance|\bhal\b|hall|gang/i;
    for (const op of [...plan.openings]) {
      if (op.leaf || (op.kind !== 'window' && op.kind !== 'door') || op.sill > 0.15 || op.w < 0.7) continue;
      const pw = plan.walls.find(w => w.id === op.wall);
      if (!pw || pw.kind !== 'exterior') continue;
      const st = storeys.find(x => x.id === pw.storey);
      const d = wallDir(pw), n = V.perp(d), c = V.add(pw.a, V.mul(d, op.pos)), off = pw.t / 2 + 0.3, W = op.w;
      const roomAtP = p => plan.rooms.find(r => r.storey === pw.storey && pointInPolygon(p, r.poly));
      const sides = [1, -1].map(sg => roomAtP(V.add(c, V.mul(n, sg * off))) || roomAtP(V.add(c, V.mul(n, sg * (off + 0.45)))));
      if (sides[0] && sides[1]) continue;              // a room on both sides: not in the façade
      const rIn = sides.find(Boolean);
      const sill = sills.find(sl => {
        const us = sl.pts.map(p => V.dot(V.sub(p, c), d)), vs = sl.pts.map(p => V.dot(V.sub(p, c), n));
        const um = (Math.min(...us) + Math.max(...us)) / 2, vm = (Math.min(...vs) + Math.max(...vs)) / 2, zr = sl.z - st.elevation;
        return Math.abs(um) < W / 2 && Math.abs(vm) < 0.6 && zr > 0.4 && zr < 1.6;
      });
      let parts, style;
      if (rIn && ENTRY.test(rIn.name) && W >= 1.4 && W <= 3.2) {
        const dw = Math.max(0.9, Math.min(1.1, W * 0.46));
        parts = [{ k: 'side', a: -W / 2, b: -dw / 2 }, { k: 'front', a: -dw / 2, b: dw / 2 }, { k: 'side', a: dw / 2, b: W / 2 }];
        style = 'front door with side lights';
      } else if (sill) {
        const us = sill.pts.map(p => V.dot(V.sub(p, c), d));
        let ua = Math.max(-W / 2, Math.min(...us)), ub = Math.min(W / 2, Math.max(...us));
        if (ua + W / 2 < 0.2) ua = -W / 2;
        if (W / 2 - ub < 0.2) ub = W / 2;
        const sz = +(sill.z - st.elevation).toFixed(3);
        parts = ua - (-W / 2) > W / 2 - ub
          ? [{ k: 'door', a: -W / 2, b: ua }, { k: 'window', a: ua, b: W / 2, sill: sz }]
          : [{ k: 'window', a: -W / 2, b: ub, sill: sz }, { k: 'door', a: ub, b: W / 2 }];
        style = 'door with a window beside it';
      } else if (W >= 3.0) {
        const sd = W * 0.2;
        parts = [{ k: 'side', a: -W / 2, b: -W / 2 + sd }, { k: 'double', a: -W / 2 + sd, b: W / 2 - sd }, { k: 'side', a: W / 2 - sd, b: W / 2 }];
        style = 'double door with side lights';
      } else if (W > 1.3) { parts = [{ k: 'double', a: -W / 2, b: W / 2 }]; style = 'double door'; }
      else { parts = [{ k: 'door', a: -W / 2, b: W / 2 }]; style = 'door'; }
      const isDoor = k => k === 'door' || k === 'double' || k === 'front';
      const split = (o, sgn, leafWall) => {
        const ops = parts.map(pt => {
          const q = { ...o, id: uid('o_'), pos: +(o.pos + sgn * (pt.a + pt.b) / 2).toFixed(3), w: +(pt.b - pt.a).toFixed(3) };
          if (isDoor(pt.k)) { q.kind = leafWall ? 'opening' : 'door'; q.sill = 0; if (pt.k === 'double' && !leafWall) q.leaves = 2; if (pt.k !== 'front' && !leafWall) q.outward = true; }
          else { q.kind = 'window'; q.sill = pt.sill || 0; q.h = +(o.h - (pt.sill || 0)).toFixed(3); }
          return q;
        });
        plan.openings.splice(plan.openings.indexOf(o), 1, ...ops);
        return ops;
      };
      split(op, 1, false).forEach((q, i) => { if (q.kind === 'door') { doorOps.push({ op: q, pw, filler: null }); parts[i].opId = q.id; } });
      // the same opening in the insulation and the outer brick
      for (const lo of plan.openings.filter(o => o.leaf)) {
        const lw = plan.walls.find(w => w.id === lo.wall);
        if (!lw || lw.storey !== pw.storey || Math.abs(V.cross(wallDir(lw), d)) > 0.02) continue;
        const lc = V.add(lw.a, V.mul(wallDir(lw), lo.pos));
        if (Math.abs(V.dot(V.sub(lc, c), d)) > 0.25 || Math.abs(V.dot(V.sub(lc, c), n)) > 0.7 || lo.sill > 0.15) continue;
        if (Math.abs(lo.w - W) <= 0.3) split(lo, V.dot(wallDir(lw), d) > 0 ? 1 : -1, true);
        else if (lo.w > W) lo.kind = 'opening';        // the wider opening in a brick surround: no glass there
      }
      // for the 3D frames: the parts in IFC coordinates
      doorSets.push({ c: Pi(c[0], c[1]), w: W, parts: parts.map(pt => ({ ...pt, pa: Pi(...V.add(c, V.mul(d, pt.a))), pb: Pi(...V.add(c, V.mul(d, pt.b))) })) });
      log(`façade door ${W.toFixed(2)} m on ${st.name}: ${style}`);
    }

    // 7. door swing + hinge side
    const circulation = /entree|hal|gang|overloop|landing|hall|trap|stair/i;
    const outward = /toilet|wc|meterkast|kast|trapkast/i;
    for (const { op, pw } of doorOps) {
      if (op.kind !== 'door') continue;
      const d = wallDir(pw), n = V.perp(d);
      const c = V.add(pw.a, V.mul(d, op.pos));
      const off = pw.t / 2 + 0.25;
      const rL = plan.rooms.find(r => r.storey === pw.storey && pointInPolygon(V.add(c, V.mul(n, off)), r.poly));
      const rR = plan.rooms.find(r => r.storey === pw.storey && pointInPolygon(V.sub(c, V.mul(n, off)), r.poly));
      let side = 'left';
      const cl = r => r && circulation.test(r.name), ou = r => r && outward.test(r.name);
      if (rL && rR) {
        if (ou(rL) && !ou(rR)) side = 'right';          // toilet / cupboard doors open out of the small room
        else if (ou(rR) && !ou(rL)) side = 'left';
        else if (cl(rL) && !cl(rR)) side = 'right';     // other doors open into the room, away from the hall
        else if (cl(rR) && !cl(rL)) side = 'left';
        else side = roomArea(rL) >= roomArea(rR) ? 'left' : 'right';
      } else side = (rL ? 'left' : 'right');
      if (op.outward && !(rL && rR)) side = rL ? 'right' : 'left';   // garden doors open outwards
      op.swing = side;
      // hinge on the jamb closest to a corner, so the door folds back against a wall
      const L = wallLen(pw);
      const junctions = [0, L];
      for (const o of plan.walls) {
        if (o === pw || o.storey !== pw.storey) continue;
        for (const e of [o.a, o.b]) { const pr = projectOnSegment(e, pw.a, pw.b); if (pr.d < pw.t / 2 + o.t / 2 + 0.05) junctions.push(pr.along); }
      }
      const j0 = op.pos - op.w / 2, j1 = op.pos + op.w / 2;
      const dist = x => Math.min(...junctions.map(j => Math.abs(j - x)));
      op.hinge = dist(j0) <= dist(j1) ? 'start' : 'end';
    }

    // 7b. floor openings: where a stair comes up through a floor, that floor has a hole (the stairwell) the size
    // of the stair below it
    plan.voids = [];
    // openings modelled in the floors themselves (screed / slab voids of at least 1 m²)
    const slabVoids = [];
    models.forEach(m => {
      const inv = m.inverse();
      for (const e of m.all('IFCSLAB')) for (const vid of inv.voids.get(e.id) || []) {
        let vp;
        try { vp = m.productPolys(vid, { voids: false }).flatMap(g => g.polys); } catch (err) { continue; }
        if (!vp.length) continue;
        const vb = IFC.bboxOf(vp);
        if ((vb.mx[0] - vb.mn[0]) * (vb.mx[1] - vb.mn[1]) < 1.0 || (vb.mx[0] - vb.mn[0]) * (vb.mx[1] - vb.mn[1]) > 30) continue;
        slabVoids.push({ z: vb.mx[2], rect: minAreaRect(vp.flatMap(p => p.vs.map(v => P(v[0], v[1])))) });
      }
    });
    // structural floor slabs (concrete), as plan rectangles with their top height
    const floorSlabs = [];
    models.forEach(m => {
      for (const e of m.all('IFCSLAB')) {
        if (!/vloer|floor|slab|plaat/i.test(e.a[2] || '') || /dekvloer|maaiveld|afwerk/i.test(e.a[2] || '')) continue;
        let ps;
        try { ps = m.productPolys(e.id, { voids: false }).flatMap(g => g.polys); } catch (err) { continue; }
        if (!ps.length) continue;
        const bb = IFC.bboxOf(ps), a = P(bb.mn[0], bb.mn[1]), b = P(bb.mx[0], bb.mx[1]);
        floorSlabs.push({ minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]), top: bb.mx[2] });
      }
    });
    models.forEach(m => {
      for (const e of m.all('IFCSTAIR')) {
        let polys;
        try { polys = m.productPolys(e.id, { voids: false }).flatMap(g => g.polys); } catch (err) { continue; }
        if (!polys.length) continue;
        const bb = IFC.bboxOf(polys);
        for (const st of storeys) {
          if (st.level === 0 || !(bb.mn[2] < st.elevation - 0.5 && bb.mx[2] > st.elevation - 0.15)) continue;
          const pts = [];
          for (const p of polys) for (const v of p.vs) if (v[2] <= st.elevation + 0.05) pts.push(P(v[0], v[1]));
          // the house is square: a rectangle along the plan axes, unless a turned one is clearly smaller
          const ab = bboxOfPoints(pts), turned = minAreaRect(pts);
          let hull = Math.abs(polygonArea(turned)) < 0.85 * ab.w * ab.h ? turned : [[ab.minX, ab.minY], [ab.maxX, ab.minY], [ab.maxX, ab.maxY], [ab.minX, ab.maxY]];
          // trimmed to the gap in the structural floor (the concrete slabs around the stair)
          if (hull === turned) { /* keep */ } else for (const sb of floorSlabs) {
            if (Math.abs(sb.top - st.elevation) > 0.4) continue;
            const r = { minX: hull[0][0], minY: hull[0][1], maxX: hull[2][0], maxY: hull[2][1] };
            const ox = Math.min(r.maxX, sb.maxX) - Math.max(r.minX, sb.minX), oy = Math.min(r.maxY, sb.maxY) - Math.max(r.minY, sb.minY);
            if (ox <= 0.005 || oy <= 0.005) continue;
            // a slab across the whole width (or length) of the opening trims it from that side
            if (sb.minY <= r.minY + 0.02 && sb.maxY >= r.maxY - 0.02 && ox < (r.maxX - r.minX) / 2) { if (sb.minX <= r.minX) r.minX = sb.maxX; else r.maxX = sb.minX; }
            else if (sb.minX <= r.minX + 0.02 && sb.maxX >= r.maxX - 0.02 && oy < (r.maxY - r.minY) / 2) { if (sb.minY <= r.minY) r.minY = sb.maxY; else r.maxY = sb.minY; }
            hull = [[r.minX, r.minY], [r.maxX, r.minY], [r.maxX, r.maxY], [r.minX, r.maxY]];
          }
          // the floor's own opening over this stair, if the model has one
          const own = slabVoids.find(sv => Math.abs(sv.z - st.elevation) < 0.4 && clipToConvex(sv.rect, hull).length >= 3 && Math.abs(polygonArea(clipToConvex(sv.rect, hull))) > 0.5 * Math.abs(polygonArea(sv.rect)));
          if (own) hull = own.rect;
          hull = hull.map(q => [+q[0].toFixed(3), +q[1].toFixed(3)]);
          if (hull.length < 3 || Math.abs(polygonArea(hull)) < 0.5) continue;
          const hb = bboxOfPoints(hull);
          if (plan.voids.some(v => v.storey === st.id && Math.abs(bboxOfPoints(v.poly).minX - hb.minX) < 0.05 && Math.abs(bboxOfPoints(v.poly).minY - hb.minY) < 0.05)) continue;
          plan.voids.push({ id: uid('fv_'), storey: st.id, kind: 'stair', poly: hull });
        }
      }
    });
    log(`floor openings: ${plan.voids.map(v => storeys.find(x => x.id === v.storey).name + ' ' + Math.abs(polygonArea(v.poly)).toFixed(2) + ' m²').join(', ') || 'none'}`);

    // 8. the shell: everything the plan doesn't draw itself
    const shell = buildShell(models, plan, storeys, P, mappedIfc, storeyByElev, { ...opts, doorSets, kneeGroups }, log);
    // where the roof is 1.5 m above the floor (the usual line on Dutch attic plans)
    for (const s of storeys) for (const [a, b] of roofLine(s.elevation + 1.5)) shell.fixtures2d[s.id].push({ k: 'roof', p: [a[0], a[1], b[0], b[1]].map(v => +v.toFixed(3)) });
    for (const sh of shafts) shell.fixtures2d[sh.sid].push({ k: 'shaft', p: sh.poly.flat().map(v => +v.toFixed(3)) });
    log(`shafts: ${shafts.length}`);

    for (const w of plan.walls) { delete w._info; delete w._top; }
    // walls that stop against each other share their end points, so they move together in the editor
    if (!opts.noJoin) log(`joined wall ends: ${joinWalls(plan)}`);
    return { storeys, plan, shell, origin };
  }

  /** keep the part of a polygon on the side of the line through p0 that normal nrm points to */
  function clipHalf(poly, p0, nrm) {
    const out = [], side = p => V.dot(V.sub(p, p0), nrm);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
      if (sa >= 0) out.push(a);
      if ((sa >= 0) !== (sb >= 0)) out.push(V.lerp(a, b, sa / (sa - sb)));
    }
    return out;
  }

  function nearInside(p, poly, step) {
    // a wall tile layer sits right on the room edge: test a point nudged towards the polygon's label point
    const lp = labelPoint(poly);
    const q = V.lerp(p, lp, Math.min(1, step / Math.max(0.01, V.dist(p, lp))));
    return pointInPolygon(q, poly);
  }

  function parallelNear(w, o, gap) {
    const d1 = wallDir(w), d2 = wallDir(o);
    if (Math.abs(V.cross(d1, d2)) > 0.02) return false;
    const n = V.perp(d1);
    const off = Math.abs(V.dot(V.sub(o.a, w.a), n));
    if (off > gap + (w.t + o.t) / 2) return false;
    // overlap along the wall
    const u0 = V.dot(V.sub(o.a, w.a), d1), u1 = V.dot(V.sub(o.b, w.a), d1);
    const L = wallLen(w);
    return Math.max(u0, u1) > 0.1 && Math.min(u0, u1) < L - 0.1;
  }

  function splitPolygonByLine(poly, a, b) {
    const d = V.norm(V.sub(b, a)), n = V.perp(d);
    const side = p => V.dot(V.sub(p, a), n);
    const clip = sign => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const sp = side(p) * sign, sq = side(q) * sign;
        if (sp >= 0) out.push(p);
        if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq); out.push(V.lerp(p, q, t)); }
      }
      return cleanPoly(out.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]));
    };
    return [clip(1), clip(-1)].filter(p => p.length >= 3);
  }

  /* ───────── shell meshes ───────── */
  const MAT = {
    brick: { kind: 'brick' }, roof: { kind: 'roof', color: [0.3, 0.31, 0.32] }, flatroof: { kind: 'flat', color: [0.2, 0.2, 0.21] },
    pv: { kind: 'pv', color: [0.08, 0.09, 0.12] }, frame: { kind: 'frame', color: [0.95, 0.95, 0.93] }, glass: { kind: 'glass', color: [0.62, 0.74, 0.8], alpha: 0.35 },
    door: { kind: 'frame', color: [0.2, 0.22, 0.24] }, white: { kind: 'plain', color: [0.93, 0.93, 0.91] }, wood: { kind: 'plain', color: [0.62, 0.5, 0.36] },
    leaf: { kind: 'frame', color: [0.7, 0.68, 0.64] }, groove: { kind: 'plain', color: [0.3, 0.29, 0.28] }, bead: { kind: 'plain', color: [0.72, 0.72, 0.71] },
    pipe: { kind: 'plain', color: [0.84, 0.85, 0.85] },
    concrete: { kind: 'plain', color: [0.72, 0.72, 0.7] }, metal: { kind: 'plain', color: [0.45, 0.46, 0.47] }, stair: { kind: 'plain', color: [0.94, 0.93, 0.9] },
    plaster: { kind: 'plain', color: [0.93, 0.92, 0.9] }, gutter: { kind: 'plain', color: [0.95, 0.95, 0.94] }, trim: { kind: 'plain', color: [0.05, 0.05, 0.055] },
  };
  function materialFor(e, name, style) {
    const t = e.t;
    const col = style ? style.rgb : null;
    if (t === 'IFCROOF' && /dak_|puntkap|pannen|tile/i.test(name) && !/aanbouw|plat/i.test(name)) {
      // the roof is one element with layers: dark grey = tiles; white = boards along the verges; the rest is timber
      const grey = !col || (Math.max(...col) < 0.5 && Math.max(...col) - Math.min(...col) < 0.06);
      if (grey) return { key: 'roof', ...MAT.roof };
      return { key: 'c:' + col.map(v => v.toFixed(2)).join(','), kind: 'plain', color: col };
    }
    if (t === 'IFCROOF' && /aanbouw|dakpakket|plat/i.test(name)) return { key: 'flatroof', ...MAT.flatroof };
    if (t === 'IFCENERGYCONVERSIONDEVICE' && /pv|zon|solar/i.test(name)) return { key: 'pv', ...MAT.pv };
    if (OUTER.test(name)) return { key: 'brick:' + (col ? col.map(v => v.toFixed(2)).join(',') : 'x'), kind: 'brick', color: col || [0.55, 0.32, 0.24] };
    if (/hwa|regenpijp/i.test(name)) return { key: 'pipe', ...MAT.pipe };
    if (/goot|klossen/i.test(name)) return { key: 'gutter', ...MAT.gutter };          // gutters and their blocks: white
    if (/rockpanel|vensterbank/i.test(name)) return { key: 'white', ...MAT.white };
    if (/muurplaat|daktrim/i.test(name)) return { key: 'trim', ...MAT.trim };   // flat-roof edge of the extension: black
    if (/boeiboord|windveer/i.test(name)) return { key: 'white', ...MAT.white };
    if (/hout/i.test(name)) return { key: 'wood', ...MAT.wood };
    if (/latei|ligger|staal/i.test(name)) return { key: 'metal', ...MAT.metal };
    if (t === 'IFCSTAIR' || t === 'IFCRAILING' || t === 'IFCSTAIRFLIGHT') return { key: 'stair', ...MAT.stair };
    if (t === 'IFCDOOR') return { key: 'door', ...MAT.door };
    if (/raamdorpel|spekband|beton|dycore|kanaalplaat|ribbenvloer|prefab/i.test(name)) return { key: 'concrete:' + (col ? col.map(v => v.toFixed(2)).join(',') : 'x'), kind: 'plain', color: col || MAT.concrete.color };
    return { key: 'c:' + (col ? col.map(v => v.toFixed(2)).join(',') : 'x'), kind: 'plain', color: col || [0.8, 0.8, 0.78], alpha: style && style.alpha < 0.99 ? style.alpha : undefined };
  }
  const SHELL_TYPES = ['IFCWALLSTANDARDCASE', 'IFCWALL', 'IFCSLAB', 'IFCROOF', 'IFCCOVERING', 'IFCBEAM', 'IFCCOLUMN', 'IFCMEMBER', 'IFCPLATE', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING', 'IFCFLOWTERMINAL', 'IFCFLOWSEGMENT', 'IFCENERGYCONVERSIONDEVICE', 'IFCDOOR', 'IFCWINDOW', 'IFCCURTAINWALL', 'IFCBUILDINGELEMENTPROXY'];

  function buildShell(models, plan, storeys, P, mappedIfc, storeyByElev, opts, log) {
    const out = { storeys: {}, materials: {}, roofKeys: [], fixtures2d: {} };
    for (const s of storeys) { out.storeys[s.id] = {}; out.fixtures2d[s.id] = []; }
    // tag: 'win' (window frames + glass), 'odoor' (outside doors), 'out' (the façade: brick, sills, lintels) or
    // 'floor' (floor slabs), so the viewer can hide them
    // door: { op, leaf } for a leaf of an outside door that can swing (a group of its own, turned in 3D)
    const add = (sid, mat, tris, roof, plinth, tag, door) => {
      if (!tris.length) return;
      const key = mat.key + (roof ? '|roof' : '') + (plinth ? '|plinth' : '') + (tag ? '|' + tag : '') + (door ? '|door:' + door.op + ':' + door.leaf : '');
      out.materials[key] = { kind: mat.kind, color: mat.color, alpha: mat.alpha, roof: !!roof };
      if (plinth) out.materials[key].plinth = true;
      if (door) { out.materials[key].door = door.op; out.materials[key].leaf = door.leaf; out.materials[key].part = mat.key; }
      for (const t of ['win', 'odoor', 'out', 'floor']) out.materials[key][t] = tag === t;
      const arr = out.storeys[sid][key] || (out.storeys[sid][key] = []);
      const s = storeys.find(x => x.id === sid);
      for (const v of tris) { const p = P(v[0], v[1]); arr.push(p[0], +(v[2] - s.elevation).toFixed(4), p[1]); }
    };
    let count = 0;
    // roof boxes: a floor slab right under a roof (the extension's roof deck) belongs to the roof
    const roofBoxes = [];
    for (const m of models) for (const e of m.all('IFCROOF')) {
      try { const ps = m.productPolys(e.id, { voids: false }).flatMap(g => g.polys); if (ps.length) roofBoxes.push(IFC.bboxOf(ps)); } catch (err) { /* skip */ }
    }
    const underRoof = bb => roofBoxes.some(r => {
      if (bb.mx[2] < r.mn[2] - 0.15 || bb.mx[2] > r.mn[2] + 0.05) return false;
      const ox = Math.min(bb.mx[0], r.mx[0]) - Math.max(bb.mn[0], r.mn[0]), oy = Math.min(bb.mx[1], r.mx[1]) - Math.max(bb.mn[1], r.mn[1]);
      const a = (bb.mx[0] - bb.mn[0]) * (bb.mx[1] - bb.mn[1]);
      return ox > 0 && oy > 0 && a > 0 && ox * oy > 0.5 * a;
    });
    models.forEach((m, mi) => {
      const inv = m.inverse();
      for (const t of SHELL_TYPES) for (const e of m.all(t)) {
        const name = e.a[2] || '';
        if (SKIP_NAME.test(name)) continue;
        if ((t === 'IFCWALLSTANDARDCASE' || t === 'IFCWALL') && mappedIfc.has(`${mi}:${e.id}`)) continue;
        if ((t === 'IFCWALLSTANDARDCASE' || t === 'IFCWALL') && INSUL.test(name)) continue;
        if (t === 'IFCDOOR' && inv.fills.has(e.id)) continue;  // doors in walls: the plan (inside) or the façade door sets draw them
        if (t === 'IFCSLAB' && /dekvloer/i.test(name)) continue;
        if (t === 'IFCFLOWTERMINAL' && /wasmachine|droger|toilet|closet|wastafel/i.test(name)) continue;
        if (t === 'IFCBUILDINGELEMENTPROXY') continue;
        let groups;
        try { groups = m.productPolys(e.id); } catch (err) { continue; }
        const polys = groups.flatMap(g => g.polys);
        if (!polys.length) continue;
        const bb = IFC.bboxOf(polys);
        const st = m.storeyOf(e.id);
        const stElev = st ? (st.a[9] || 0) * m.lengthScale : bb.mn[2];
        const s = st ? storeyByElev(stElev) : storeyByElev(bb.mn[2] + 0.1);
        const roof = t === 'IFCROOF' || t === 'IFCENERGYCONVERSIONDEVICE' || /goot|klossen|muurplaat|dakrand|boeideel|rockpanel|ventilatiepijp/i.test(name)
          || ((t === 'IFCWALLSTANDARDCASE' || t === 'IFCWALL') && bb.mx[2] < s.elevation + 0.6 && bb.mn[2] > s.elevation - 0.3)   // parapets, not the plinth
          || (t === 'IFCSLAB' && underRoof(bb));
        // the brick base (plinth) around the ground floor: a low façade wall that starts below the floor
        const plinth = !roof && (t === 'IFCWALLSTANDARDCASE' || t === 'IFCWALL') && OUTER.test(name) && bb.mn[2] < s.elevation - 0.1 && bb.mx[2] < s.elevation + 1.0;
        const facade = !roof && (((t === 'IFCWALLSTANDARDCASE' || t === 'IFCWALL') && OUTER.test(name)) || FACADE.test(name));
        groups.forEach((g, gi) => { if (!(opts.kneeGroups && opts.kneeGroups.has(`${mi}:${e.id}:${gi}`))) add(s.id, materialFor(e, name, g.style), IFC.polysToTris(g.polys), roof, plinth, facade ? 'out' : (t === 'IFCSLAB' && !roof ? 'floor' : null)); });
        count++;
        // 2D outlines of stairs: the tread tops below the cut plane
        if (t === 'IFCSTAIR' || t === 'IFCSTAIRFLIGHT') stairOutlines(polys, s, out, P);
      }
    });
    // window frames + glass in the façade openings (the façade model has openings but no window frames)
    frames(models, plan, storeys, P, out, add, opts.doorSets || []);
    log(`shell: ${count} elements`);
    return out;
  }

  function stairOutlines(polys, s, out, P) {
    for (const p of polys) {
      if (p.plane.n[2] < 0.95) continue;
      const z = p.vs[0][2];
      if (z < s.elevation + 0.05 || z > s.elevation + 1.1) continue;
      out.fixtures2d[s.id].push({ k: 'stair', p: p.vs.map(v => P(v[0], v[1])).flat().map(v => +v.toFixed(3)) });
    }
  }

  function frames(models, plan, storeys, P, out, add, doorSets = []) {
    // for each opening in an outer (brick) leaf: a frame ring + glass, set back behind the brick
    const seen = new Set(), placed = [];
    models.forEach((m, mi) => {
      const inv = m.inverse();
      const isoInfos = [];
      for (const t2 of ['IFCWALLSTANDARDCASE', 'IFCWALL']) for (const o of m.all(t2)) if (INSUL.test(o.a[2] || '')) { const oi = analyseWall(m, o, mi); if (oi.d) isoInfos.push(oi); }
      // every wall's voids: a brick leaf modelled as a plain solid (IFCWALL with the holes in its shape) has no voids
      // of its own, but the void of the insulation / inner leaf behind it runs through the brick too
      const allVoids = [];
      for (const t2 of ['IFCWALLSTANDARDCASE', 'IFCWALL']) for (const o of m.all(t2)) for (const vid of inv.voids.get(o.id) || []) {
        let polys;
        try { polys = m.productPolys(vid, { voids: false }).flatMap(g => g.polys); } catch (err) { continue; }
        if (polys.length) allVoids.push({ owner: o.id, polys });
      }
      const dirs = new Map();
      const ownerDir = id => { if (!dirs.has(id)) { const oi = analyseWall(m, m.get(id), mi); dirs.set(id, oi.skip ? null : oi.d); } return dirs.get(id); };
      const cands = [];
      for (const t of ['IFCWALLSTANDARDCASE', 'IFCWALL']) for (const e of m.all(t)) {
        const name = e.a[2] || '';
        if (!OUTER.test(name)) continue;
        const info = analyseWall(m, e, mi);
        if (info.skip) continue;
        // which side is outside: the insulation / inner leaf is inside
        let inSign = 0;
        const c = [(info.uMin + info.uMax) / 2, (info.wMin + info.wMax) / 2];
        const mid = [info.o[0] + info.d[0] * c[0] + info.nrm[0] * c[1], info.o[1] + info.d[1] * c[0] + info.nrm[1] * c[1]];
        for (const oi of isoInfos) {
          if (inSign) break;
          if (Math.abs(oi.d[0] * info.d[1] - oi.d[1] * info.d[0]) > 0.02) continue;
          const om = [oi.o[0] + oi.d[0] * (oi.uMin + oi.uMax) / 2 + oi.nrm[0] * (oi.wMin + oi.wMax) / 2, oi.o[1] + oi.d[1] * (oi.uMin + oi.uMax) / 2 + oi.nrm[1] * (oi.wMin + oi.wMax) / 2];
          const off = (om[0] - mid[0]) * info.nrm[0] + (om[1] - mid[1]) * info.nrm[1];
          const along = (om[0] - mid[0]) * info.d[0] + (om[1] - mid[1]) * info.d[1];
          if (Math.abs(off) < 0.35 && Math.abs(along) < (info.len + oi.len) / 2 && oi.zMin < info.zMax && oi.zMax > info.zMin) inSign = Math.sign(off);
        }
        if (!inSign) continue;
        const outerW = inSign > 0 ? info.wMin : info.wMax;      // outer face offset
        const voids = [];
        for (const av of allVoids) {
          let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity, w0 = Infinity, w1 = -Infinity;
          for (const p of av.polys) for (const v of p.vs) {
            const u = (v[0] - info.o[0]) * info.d[0] + (v[1] - info.o[1]) * info.d[1];
            const w = (v[0] - info.o[0]) * info.nrm[0] + (v[1] - info.o[1]) * info.nrm[1];
            u0 = Math.min(u0, u); u1 = Math.max(u1, u); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]);
            w0 = Math.min(w0, w); w1 = Math.max(w1, w);
          }
          if (av.owner === e.id) { voids.push({ u0: Math.max(u0, info.uMin), u1: Math.min(u1, info.uMax), z0, z1, own: true }); continue; }
          // someone else's void (insulation / inner leaf, running parallel): it has to cut right through this leaf,
          // in it or right next to it (a brick leaf laid in pieces around the window), at the same height
          const od = ownerDir(av.owner);
          if (!od || Math.abs(od[0] * info.d[1] - od[1] * info.d[0]) > 0.05) continue;
          const tw = info.wMax - info.wMin;
          if (Math.min(w1, info.wMax) - Math.max(w0, info.wMin) < 0.8 * tw) continue;
          if (u1 - u0 < 0.3 || u1 < info.uMin - 0.05 || u0 > info.uMax + 0.05) continue;
          if (Math.min(z1, info.zMax) - Math.max(z0, info.zMin) < 0.3) continue;
          voids.push({ u0, u1, z0, z1, own: false });
        }
        for (const vd of voids) cands.push({ info, inSign, outerW, vd, voids });
      }
      // the leaf's own openings first; a borrowed one only where no frame has been placed yet
      // (bigger first, so of two nested openings the outer one wins)
      const area = v => (v.u1 - v.u0) * (v.z1 - v.z0);
      cands.sort((a, b) => ((b.vd.own ? 1 : 0) - (a.vd.own ? 1 : 0)) || (area(b.vd) - area(a.vd)));
      for (const { info, inSign, outerW, vd, voids } of cands) {
        let { u0, u1, z0, z1 } = vd;
        {
          if (u1 - u0 < 0.15) continue;
          // a slot right next to a wider opening is a recess for the brick surround, not a window
          if (voids.some(o => o !== vd && o.u1 - o.u0 > u1 - u0 + 0.2 && (Math.abs(o.u0 - u1) < 0.06 || Math.abs(o.u1 - u0) < 0.06) && Math.min(o.z1, z1) - Math.max(o.z0, z0) > 0.8 * (z1 - z0))) continue;
          // one opening runs through the plinth and the brick above it: one frame from the floor up
          const s = (() => { let best = storeys[0]; for (const x of storeys) if (x.elevation <= Math.max(z0, storeys[0].elevation) + 0.35) best = x; return best; })();
          z0 = Math.max(z0, s.elevation);
          z1 = Math.min(z1, s.elevation + (s.height || 3) + 0.3);
          if (z1 - z0 < 0.15) continue;
          const cpt = [info.o[0] + info.d[0] * (u0 + u1) / 2, info.o[1] + info.d[1] * (u0 + u1) / 2];
          const key = [cpt[0], cpt[1], u1 - u0, z0, z1].map(v => (Math.round(v * 20) / 20).toFixed(2)).join('|') + '|' + info.d.map(v => Math.abs(v).toFixed(1)).join(',');
          if (seen.has(key)) continue;
          // the same opening seen from another piece of brick (or a void nested in a bigger one): one frame
          const ends = [[info.o[0] + info.d[0] * u0, info.o[1] + info.d[1] * u0], [info.o[0] + info.d[0] * u1, info.o[1] + info.d[1] * u1]];
          const dup = placed.find(q => {
            if (Math.abs(q.d[0] * info.d[1] - q.d[1] * info.d[0]) > 0.05) return false;
            const along = p => (p[0] - q.a[0]) * q.d[0] + (p[1] - q.a[1]) * q.d[1];
            const off = Math.abs((ends[0][0] - q.a[0]) * -q.d[1] + (ends[0][1] - q.a[1]) * q.d[0]);
            if (off > 0.4) return false;
            const a0 = Math.min(along(ends[0]), along(ends[1])), a1 = Math.max(along(ends[0]), along(ends[1]));
            const ou = Math.min(a1, q.L) - Math.max(a0, 0), oz = Math.min(z1, q.z1) - Math.max(z0, q.z0);
            return ou > 0.5 * Math.min(a1 - a0, q.L) && oz > 0.5 * Math.min(z1 - z0, q.z1 - q.z0);
          });
          if (dup) continue;
          seen.add(key);
          placed.push({ a: ends[0], d: info.d, L: u1 - u0, z0, z1 });
          // frame plane: just behind the brick (depth 0.10 … 0.21 from the outer face)
          const wf = w => outerW + inSign * w;
          const pt = (u, w, z) => [info.o[0] + info.d[0] * u + info.nrm[0] * w, info.o[1] + info.d[1] * u + info.nrm[1] * w, z];
          const box = (ua, ub, wa, wb, za, zb) => {
            const v = [pt(ua, wa, za), pt(ub, wa, za), pt(ub, wb, za), pt(ua, wb, za), pt(ua, wa, zb), pt(ub, wa, zb), pt(ub, wb, zb), pt(ua, wb, zb)];
            const f = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
            const c = [0, 1, 2].map(k => v.reduce((s, p) => s + p[k], 0) / 8);
            const tris = [];
            // every face turned outwards (whichever way the wall's axes run), so the box is drawn solid
            for (const q0 of f) {
              const [a, b, cc] = [v[q0[0]], v[q0[1]], v[q0[2]]];
              const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
              const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
              const fc = [0, 1, 2].map(k => q0.reduce((s, i) => s + v[i][k], 0) / 4);
              const q = nn[0] * (fc[0] - c[0]) + nn[1] * (fc[1] - c[1]) + nn[2] * (fc[2] - c[2]) < 0 ? [q0[0], q0[3], q0[2], q0[1]] : q0;
              tris.push(v[q[0]], v[q[1]], v[q[2]], v[q[0]], v[q[2]], v[q[3]]);
            }
            return tris;
          };
          const fw = 0.067, w0 = wf(0.09), w1 = wf(0.21);
          const wa = Math.min(w0, w1), wb = Math.max(w0, w1);
          const isDoor = z0 - s.elevation < 0.15 && u1 - u0 <= 1.25;
          // a door set worked out from the plan (front door, double doors, door + window): white frame, light grey
          // door leaves with glass, white side lights
          const ds = z0 - s.elevation < 0.15 && doorSets.find(f => Math.hypot(f.c[0] - cpt[0], f.c[1] - cpt[1]) < 0.9 && Math.abs(f.w - (u1 - u0)) < 0.45);
          if (ds) { doorSet(ds, { u0, u1, z0, z1, s, box, wa, wb, fw, info, inSign, add }); continue; }
          const tris = [
            ...box(u0, u1, wa, wb, z1 - fw, z1), ...box(u0, u1, wa, wb, z0, z0 + fw),
            ...box(u0, u0 + fw, wa, wb, z0, z1), ...box(u1 - fw, u1, wa, wb, z0, z1)];
          // a mullion in wide windows
          if (u1 - u0 > 1.6 && !isDoor) { const um = (u0 + u1) / 2; tris.push(...box(um - fw / 2, um + fw / 2, wa, wb, z0, z1)); }
          add(s.id, { key: 'frame', ...MAT.frame }, tris, false, false, isDoor ? 'odoor' : 'win');
          const gm = (wa + wb) / 2;
          const pane = box(u0 + fw, u1 - fw, gm - 0.012, gm + 0.012, z0 + fw, z1 - fw);
          if (isDoor) add(s.id, { key: 'door', ...MAT.door }, pane, false, false, 'odoor');
          else add(s.id, { key: 'glass', ...MAT.glass }, pane, false, false, 'win');
        }
      }
    });
  }

  function doorSet(ds, { u0, u1, z0, z1, s, box, wa, wb, fw, info, inSign, add }) {
    const uOf = p => (p[0] - info.o[0]) * info.d[0] + (p[1] - info.o[1]) * info.d[1];
    const parts = ds.parts.map(pt => { const a = uOf(pt.pa), b = uOf(pt.pb); return { ...pt, ua: Math.min(a, b), ub: Math.max(a, b) }; }).sort((p, q) => p.ua - q.ua);
    parts[0].ua = u0; parts[parts.length - 1].ub = u1;
    const gm = (wa + wb) / 2, LD = 0.028;
    // w-range from d0 to d1 measured outwards from the middle of the leaf
    const outW = (d0, d1) => { const a = gm - inSign * d0, b = gm - inSign * d1; return [Math.min(a, b), Math.max(a, b)]; };
    // seen from outside, which way along the wall is "right"
    const F = [info.nrm[0] * inSign, info.nrm[1] * inSign];
    const rightU = F[1] * info.d[0] - F[0] * info.d[1] > 0 ? 1 : -1;
    const frame = [], glass0 = [];
    // the moving parts of each door leaf go in a bucket of their own (opening id + leaf number)
    const buckets = new Map();
    const bucket = (opId, li) => { const k = opId ? opId + ':' + li : 'fixed'; if (!buckets.has(k)) buckets.set(k, { op: opId, leaf: li, leaf_: [], glass: [], metal: [], dark: [], bead: [] }); return buckets.get(k); };
    let B = bucket(null, 0);
    let leaf = B.leaf_, glass = B.glass, metal = B.metal, dark = B.dark, bead = B.bead;
    const use = b => { B = b; leaf = b.leaf_; glass = b.glass; metal = b.metal; dark = b.dark; bead = b.bead; };
    frame.push(...box(u0, u1, wa, wb, z1 - fw, z1), ...box(u0, u0 + fw, wa, wb, z0, z1), ...box(u1 - fw, u1, wa, wb, z0, z1));
    for (let i = 1; i < parts.length; i++) { const m = parts[i].ua; frame.push(...box(m - fw / 2, m + fw / 2, wa, wb, z0, z1)); }
    const lever = (u, z, towards) => {
      const [p0, p1] = outW(LD, LD + 0.012), [g0, g1] = outW(LD + 0.03, LD + 0.05), [s0, s1] = outW(LD + 0.012, LD + 0.05);
      metal.push(...box(u - 0.018, u + 0.018, p0, p1, z - 0.13, z + 0.13));
      metal.push(...box(u - 0.01, u + 0.01, s0, s1, z - 0.01, z + 0.01));
      const ue = u + towards * 0.13;
      metal.push(...box(Math.min(u, ue), Math.max(u, ue), g0, g1, z - 0.012, z + 0.012));
    };
    const glassLeaf = (la, lb, za, zb, handleU) => {
      const st = 0.1, rt = 0.1, rb = 0.13;
      leaf.push(...box(la, lb, gm - LD, gm + LD, zb - rt, zb), ...box(la, lb, gm - LD, gm + LD, za, za + rb),
        ...box(la, la + st, gm - LD, gm + LD, za + rb, zb - rt), ...box(lb - st, lb, gm - LD, gm + LD, za + rb, zb - rt));
      glass.push(...box(la + st, lb - st, gm - 0.008, gm + 0.008, za + rb, zb - rt));
      if (handleU != null) lever(handleU, za + 1.05, handleU > (la + lb) / 2 ? -1 : 1);
    };
    const frontLeaf = (la, lb, za, zb) => {
      // grey door with three small square windows above each other, two grooves, a letterbox, a long handle
      const Wd = lb - la, H = zb - za, cu = (la + lb) / 2, hw = 0.145 * Wd, wl = cu - hw, wr = cu + hw;
      const wins = [[0.645, 0.75], [0.39, 0.5], [0.13, 0.24]].map(([f0, f1]) => [zb - f1 * H, zb - f0 * H]).sort((a, b) => a[0] - b[0]);
      leaf.push(...box(la, wl, gm - LD, gm + LD, za, zb), ...box(wr, lb, gm - LD, gm + LD, za, zb));
      let zc = za;
      for (const [w0, w1] of wins) { leaf.push(...box(wl, wr, gm - LD, gm + LD, zc, w0)); zc = w1; }
      leaf.push(...box(wl, wr, gm - LD, gm + LD, zc, zb));
      const bw = 0.022, b0 = gm - LD - 0.006, b1 = gm + LD + 0.006;
      for (const [w0, w1] of wins) {
        glass.push(...box(wl, wr, gm - 0.008, gm + 0.008, w0, w1));
        bead.push(...box(wl - bw, wr + bw, b0, b1, w1, w1 + bw), ...box(wl - bw, wr + bw, b0, b1, w0 - bw, w0), ...box(wl - bw, wl, b0, b1, w0, w1), ...box(wr, wr + bw, b0, b1, w0, w1));
      }
      const [g0, g1] = outW(LD, LD + 0.004);
      for (const f of [0.235, 0.765]) { const gu = la + f * Wd; dark.push(...box(gu - 0.007, gu + 0.007, g0, g1, zb - 0.79 * H, zb - 0.1 * H)); }
      const [l0, l1] = outW(LD, LD + 0.014);
      metal.push(...box(cu - 0.2 * Wd, cu + 0.2 * Wd, l0, l1, zb - 0.585 * H, zb - 0.555 * H));
      const hu = rightU > 0 ? lb - 0.055 : la + 0.055;
      const [p0, p1] = outW(LD, LD + 0.012), [k0, k1] = outW(LD + 0.012, LD + 0.05);
      metal.push(...box(hu - 0.017, hu + 0.017, p0, p1, zb - 0.64 * H, zb - 0.53 * H));
      metal.push(...box(hu - 0.02, hu + 0.02, k0, k1, zb - 0.585 * H, zb - 0.545 * H));
    };
    parts.forEach((p, i) => {
      const pa = p.ua + (i === 0 ? fw : fw / 2), pb = p.ub - (i === parts.length - 1 ? fw : fw / 2), top = z1 - fw;
      if (p.k === 'side' || p.k === 'window') {
        const zb = z0 + (p.k === 'window' ? p.sill : 0), sw = 0.055;
        frame.push(...box(p.ua, p.ub, wa, wb, zb, zb + fw));
        frame.push(...box(pa, pb, gm - 0.035, gm + 0.035, top - sw, top), ...box(pa, pb, gm - 0.035, gm + 0.035, zb + fw, zb + fw + sw),
          ...box(pa, pa + sw, gm - 0.035, gm + 0.035, zb + fw + sw, top - sw), ...box(pb - sw, pb, gm - 0.035, gm + 0.035, zb + fw + sw, top - sw));
        glass0.push(...box(pa + sw, pb - sw, gm - 0.008, gm + 0.008, zb + fw + sw, top - sw));
        return;
      }
      frame.push(...box(p.ua, p.ub, wa, wb, z0, z0 + 0.02));        // threshold
      const za = z0 + 0.02;
      if (p.k === 'front') { use(bucket(p.opId, 0)); frontLeaf(pa, pb, za, top); }
      else if (p.k === 'double') {
        // the left leaf (seen from outside) has the handle, at the meeting stiles
        const mid = (pa + pb) / 2, leftLow = rightU > 0;
        use(bucket(p.opId, 0)); glassLeaf(pa, mid, za, top, leftLow ? mid - 0.05 : null);
        use(bucket(p.opId, 1)); glassLeaf(mid, pb, za, top, leftLow ? null : mid + 0.05);
      } else {
        // a single door: handle next to the window beside it, otherwise on the right seen from outside
        const win = parts.find(q => q.k === 'window');
        const atHigh = win ? win.ua >= p.ub - 0.01 : rightU > 0;
        use(bucket(p.opId, 0)); glassLeaf(pa, pb, za, top, atHigh ? pb - 0.05 : pa + 0.05);
      }
      use(bucket(null, 0));
    });
    add(s.id, { key: 'frame', ...MAT.frame }, frame, false, false, 'odoor');
    if (glass0.length) add(s.id, { key: 'glass', ...MAT.glass }, glass0, false, false, 'odoor');
    for (const b of buckets.values()) {
      const door = b.op ? { op: b.op, leaf: b.leaf } : null;
      if (b.leaf_.length) add(s.id, { key: 'leaf', ...MAT.leaf }, b.leaf_, false, false, 'odoor', door);
      if (b.glass.length) add(s.id, { key: 'glass', ...MAT.glass }, b.glass, false, false, 'odoor', door);
      if (b.metal.length) add(s.id, { key: 'metal', ...MAT.metal }, b.metal, false, false, 'odoor', door);
      if (b.dark.length) add(s.id, { key: 'groove', ...MAT.groove }, b.dark, false, false, 'odoor', door);
      if (b.bead.length) add(s.id, { key: 'bead', ...MAT.bead }, b.bead, false, false, 'odoor', door);
    }
  }

  /* ───────── packing the shell for storage: Int16 millimetres + gzip/base64 by the caller ───────── */
  function packShell(shell) {
    const pack = { v: 1, materials: shell.materials, storeys: {}, fixtures2d: shell.fixtures2d };
    for (const [sid, groups] of Object.entries(shell.storeys)) {
      pack.storeys[sid] = {};
      for (const [key, arr] of Object.entries(groups)) {
        // dedupe vertices, store positions in mm as Int32 (plenty for a house), indices as Uint32
        const map = new Map(), pos = [], idx = [];
        for (let i = 0; i < arr.length; i += 3) {
          const x = Math.round(arr[i] * 1000), y = Math.round(arr[i + 1] * 1000), z = Math.round(arr[i + 2] * 1000);
          const k = x + ',' + y + ',' + z;
          let j = map.get(k);
          if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(x, y, z); }
          idx.push(j);
        }
        // drop degenerate triangles
        const clean = [];
        for (let i = 0; i < idx.length; i += 3) if (idx[i] !== idx[i + 1] && idx[i + 1] !== idx[i + 2] && idx[i] !== idx[i + 2]) clean.push(idx[i], idx[i + 1], idx[i + 2]);
        pack.storeys[sid][key] = { p: b64(new Int32Array(pos).buffer), i: b64((pos.length / 3 < 65536 ? new Uint16Array(clean) : new Uint32Array(clean)).buffer), big: pos.length / 3 >= 65536 };
      }
    }
    return pack;
  }
  function b64(buf) {
    const bytes = new Uint8Array(buf);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  return { convert, packShell, findStoreys, analyseWall };
})();
