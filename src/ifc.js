/* ───────────── ifc.js — a small IFC (STEP) reader for building geometry ─────────────
   Reads IFC2x3 / IFC4 files as exported by Revit: entities, placements, extrusions, faceted breps,
   clipping (half spaces, also polygon-bounded), mapped items, openings cut out of walls and slabs (CSG),
   and surface colours. Output is triangles in metres in the IFC frame (Z up).
   Needs THREE (only for ShapeUtils.triangulateShape). Works in the browser and in Node. */

const IFC = (() => {
  class Ref { constructor(id) { this.id = id; } }
  class Enum { constructor(v) { this.v = v; } }
  class Typed { constructor(t, v) { this.t = t; this.v = v; } }

  function decodeString(s) {
    if (s.indexOf('\\') < 0) return s;
    s = s.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
      let out = '';
      for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
      return out;
    });
    s = s.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    s = s.replace(/\\S\\(.)/g, (m, c) => String.fromCharCode(c.charCodeAt(0) + 128));
    return s.replace(/\\\\/g, '\\');
  }

  /* ───────── STEP parser ───────── */
  function parse(text) {
    const ents = new Map();
    let i = text.indexOf('DATA;');
    if (i < 0) throw new Error('This is not an IFC file.');
    i += 5;
    const n = text.length;
    const ws = () => { while (i < n) { const c = text.charCodeAt(i); if (c === 32 || c === 10 || c === 13 || c === 9) i++; else if (c === 47 && text.charCodeAt(i + 1) === 42) { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; } else break; } };
    const value = () => {
      ws();
      const c = text[i];
      if (c === '(') {
        i++;
        const list = [];
        ws();
        if (text[i] === ')') { i++; return list; }
        for (;;) {
          list.push(value());
          ws();
          if (text[i] === ',') { i++; continue; }
          if (text[i] === ')') { i++; return list; }
          throw new Error('IFC parse error near ' + i);
        }
      }
      if (c === "'") {
        let s = '';
        i++;
        for (;;) {
          const j = text.indexOf("'", i);
          if (j < 0) throw new Error('Unterminated string');
          s += text.slice(i, j);
          if (text[j + 1] === "'") { s += "'"; i = j + 2; continue; }
          i = j + 1;
          break;
        }
        return decodeString(s);
      }
      if (c === '#') {
        i++;
        let j = i;
        while (j < n && text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) j++;
        const id = parseInt(text.slice(i, j), 10);
        i = j;
        return new Ref(id);
      }
      if (c === '$') { i++; return null; }
      if (c === '*') { i++; return '*'; }
      if (c === '.') {
        const j = text.indexOf('.', i + 1);
        const v = text.slice(i + 1, j);
        i = j + 1;
        if (v === 'T') return true;
        if (v === 'F') return false;
        if (v === 'U') return null;
        return new Enum(v);
      }
      if (c === '"') { const j = text.indexOf('"', i + 1); i = j + 1; return null; }
      if ((c >= '0' && c <= '9') || c === '-' || c === '+') {
        let j = i + 1;
        while (j < n) { const d = text[j]; if ((d >= '0' && d <= '9') || d === '.' || d === 'E' || d === 'e' || d === '-' || d === '+') j++; else break; }
        const v = parseFloat(text.slice(i, j));
        i = j;
        return v;
      }
      // typed value, e.g. IFCLABEL('x')
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
      const t = text.slice(i, j).toUpperCase();
      i = j;
      ws();
      if (text[i] === '(') { const list = value(); return new Typed(t, list.length === 1 ? list[0] : list); }
      return new Enum(t);
    };
    for (;;) {
      ws();
      if (i >= n) break;
      if (text[i] !== '#') {
        if (text.startsWith('ENDSEC', i)) break;
        const j = text.indexOf(';', i);
        if (j < 0) break;
        i = j + 1;
        continue;
      }
      i++;
      let j = i;
      while (text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) j++;
      const id = parseInt(text.slice(i, j), 10);
      i = j;
      ws();
      i++; // '='
      ws();
      j = i;
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
      const type = text.slice(i, j).toUpperCase();
      i = j;
      const args = value();
      ws();
      if (text[i] === ';') i++;
      ents.set(id, { id, t: type, a: args });
    }
    return new Model(ents);
  }

  /* ───────── small 3D math: matrices as {x,y,z,t} basis + translation ───────── */
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vlen = a => Math.hypot(a[0], a[1], a[2]);
  const vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const IDENT = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], t: [0, 0, 0] };
  const mApply = (m, p) => [
    m.x[0] * p[0] + m.y[0] * p[1] + m.z[0] * p[2] + m.t[0],
    m.x[1] * p[0] + m.y[1] * p[1] + m.z[1] * p[2] + m.t[1],
    m.x[2] * p[0] + m.y[2] * p[1] + m.z[2] * p[2] + m.t[2]];
  const mRot = (m, v) => [
    m.x[0] * v[0] + m.y[0] * v[1] + m.z[0] * v[2],
    m.x[1] * v[0] + m.y[1] * v[1] + m.z[1] * v[2],
    m.x[2] * v[0] + m.y[2] * v[1] + m.z[2] * v[2]];
  const mMul = (a, b) => ({ x: mRot(a, b.x), y: mRot(a, b.y), z: mRot(a, b.z), t: mApply(a, b.t) });
  function mInv(m) {
    // general 3x3 inverse (also works for scaled / non-orthogonal operators)
    const [a, b, c] = [m.x, m.y, m.z];
    const det = vdot(a, vcross(b, c)) || 1e-12;
    const r0 = vmul(vcross(b, c), 1 / det), r1 = vmul(vcross(c, a), 1 / det), r2 = vmul(vcross(a, b), 1 / det);
    // rows r0,r1,r2 of the inverse; convert to column basis
    const inv = { x: [r0[0], r1[0], r2[0]], y: [r0[1], r1[1], r2[1]], z: [r0[2], r1[2], r2[2]], t: [0, 0, 0] };
    const t = mRot(inv, m.t);
    inv.t = [-t[0], -t[1], -t[2]];
    return inv;
  }

  /* ───────── CSG on polygon soups (BSP trees, after Evan Wallace's csg.js) ───────── */
  const EPS = 1e-5;
  function planeFrom(a, b, c) { const n = vnorm(vcross(vsub(b, a), vsub(c, a))); return { n, w: vdot(n, a) }; }
  function polyPlane(vs) {
    // Newell normal: robust for slightly non-planar input
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const n = vnorm([nx, ny, nz]);
    if (!isFinite(n[0]) || (n[0] === 0 && n[1] === 0 && n[2] === 0)) return null;
    return { n, w: vdot(n, vs[0]) };
  }
  function makePoly(vs, shared) { const plane = polyPlane(vs); return plane ? { vs, plane, shared } : null; }
  function flipPoly(p) { return { vs: p.vs.slice().reverse(), plane: { n: vmul(p.plane.n, -1), w: -p.plane.w }, shared: p.shared }; }
  function splitPoly(plane, poly, cf, cb, f, b) {
    const COP = 0, FR = 1, BK = 2, SP = 3;
    let type = 0;
    const types = [];
    for (const v of poly.vs) {
      const t = vdot(plane.n, v) - plane.w;
      const ty = t < -EPS ? BK : t > EPS ? FR : COP;
      type |= ty; types.push(ty);
    }
    if (type === COP) (vdot(plane.n, poly.plane.n) > 0 ? cf : cb).push(poly);
    else if (type === FR) f.push(poly);
    else if (type === BK) b.push(poly);
    else {
      const fv = [], bv = [];
      for (let i = 0; i < poly.vs.length; i++) {
        const j = (i + 1) % poly.vs.length;
        const ti = types[i], tj = types[j], vi = poly.vs[i], vj = poly.vs[j];
        if (ti !== BK) fv.push(vi);
        if (ti !== FR) bv.push(vi);
        if ((ti | tj) === SP) {
          const t = (plane.w - vdot(plane.n, vi)) / vdot(plane.n, vsub(vj, vi));
          const v = vlerp(vi, vj, t);
          fv.push(v); bv.push(v);
        }
      }
      if (fv.length >= 3) f.push({ vs: fv, plane: poly.plane, shared: poly.shared });
      if (bv.length >= 3) b.push({ vs: bv, plane: poly.plane, shared: poly.shared });
    }
  }
  class BSP {
    constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polys = []; if (polys) this.build(polys); }
    invert() {
      const stack = [this];
      while (stack.length) {
        const nd = stack.pop();
        nd.polys = nd.polys.map(flipPoly);
        if (nd.plane) nd.plane = { n: vmul(nd.plane.n, -1), w: -nd.plane.w };
        const t = nd.front; nd.front = nd.back; nd.back = t;
        if (nd.front) stack.push(nd.front);
        if (nd.back) stack.push(nd.back);
      }
    }
    clipPolygons(polys) {
      if (!this.plane) return polys.slice();
      let f = [], b = [];
      for (const p of polys) splitPoly(this.plane, p, f, b, f, b);
      if (this.front) f = this.front.clipPolygons(f);
      b = this.back ? this.back.clipPolygons(b) : [];
      return f.concat(b);
    }
    clipTo(bsp) {
      const stack = [this];
      while (stack.length) {
        const nd = stack.pop();
        nd.polys = bsp.clipPolygons(nd.polys);
        if (nd.front) stack.push(nd.front);
        if (nd.back) stack.push(nd.back);
      }
    }
    allPolygons() {
      const out = [], stack = [this];
      while (stack.length) { const nd = stack.pop(); for (const p of nd.polys) out.push(p); if (nd.front) stack.push(nd.front); if (nd.back) stack.push(nd.back); }
      return out;
    }
    build(polys) {
      if (!polys.length) return;
      if (!this.plane) this.plane = polys[0].plane;
      const f = [], b = [];
      for (const p of polys) splitPoly(this.plane, p, this.polys, this.polys, f, b);
      if (f.length) { if (!this.front) this.front = new BSP(); this.front.build(f); }
      if (b.length) { if (!this.back) this.back = new BSP(); this.back.build(b); }
    }
  }
  function csgSubtract(A, B) {
    const a = new BSP(A), b = new BSP(B);
    a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.allPolygons()); a.invert();
    return a.allPolygons();
  }
  function csgIntersect(A, B) {
    const a = new BSP(A), b = new BSP(B);
    a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a); a.build(b.allPolygons()); a.invert();
    return a.allPolygons();
  }
  function bboxOf(polys) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of polys) for (const v of p.vs) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
    return { mn, mx };
  }
  const bboxHit = (a, b, tol = 1e-4) => a.mn[0] <= b.mx[0] + tol && a.mx[0] >= b.mn[0] - tol && a.mn[1] <= b.mx[1] + tol && a.mx[1] >= b.mn[1] - tol && a.mn[2] <= b.mx[2] + tol && a.mx[2] >= b.mn[2] - tol;

  /* triangulate a planar 3D polygon (with optional holes) → array of triangles [a,b,c] oriented like `normal` */
  function triangulate3D(outer, holes, normal) {
    if (outer.length === 3 && !holes.length) return [outer];
    const n = normal || (polyPlane(outer) || { n: [0, 0, 1] }).n;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const [i0, i1] = az >= ax && az >= ay ? [0, 1] : ax >= ay ? [1, 2] : [2, 0];
    const to2 = p => new THREE.Vector2(p[i0], p[i1]);
    const pts = outer.concat(...holes);
    const faces = THREE.ShapeUtils.triangulateShape(outer.map(to2), holes.map(h => h.map(to2)));
    const out = [];
    for (const [a, b, c] of faces) {
      const tri = [pts[a], pts[b], pts[c]];
      const tn = vcross(vsub(tri[1], tri[0]), vsub(tri[2], tri[0]));
      if (vdot(tn, n) < 0) tri.reverse();
      out.push(tri);
    }
    return out;
  }
  function dedupe(loop) {
    const out = [];
    for (const p of loop) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs((q[2] || 0) - (p[2] || 0)) > 1e-7) out.push(p); }
    if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs((a[2] || 0) - (b[2] || 0)) < 1e-7) out.pop(); }
    return out;
  }
  const area2 = loop => { let s = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

  /* ───────── the model ───────── */
  class Model {
    constructor(ents) {
      this.ents = ents;
      this.byType = new Map();
      for (const e of ents.values()) { if (!this.byType.has(e.t)) this.byType.set(e.t, []); this.byType.get(e.t).push(e.id); }
      this._place = new Map();
      this._style = null;
      this._inv = null;
      this.lengthScale = 1;
      this.angleScale = 1;
      this.readUnits();
    }
    get(r) { if (r == null) return null; const id = r instanceof Ref ? r.id : r; return this.ents.get(id) || null; }
    all(type) { return (this.byType.get(type) || []).map(id => this.ents.get(id)); }
    readUnits() {
      for (const ua of this.all('IFCUNITASSIGNMENT')) {
        for (const r of ua.a[0]) {
          const u = this.get(r);
          if (!u) continue;
          if (u.t === 'IFCSIUNIT' && u.a[1] && u.a[1].v === 'LENGTHUNIT') {
            const pre = u.a[2] && u.a[2].v;
            this.lengthScale = pre === 'MILLI' ? 0.001 : pre === 'CENTI' ? 0.01 : pre === 'DECI' ? 0.1 : 1;
          }
          if (u.t === 'IFCCONVERSIONBASEDUNIT' && u.a[1] && u.a[1].v === 'LENGTHUNIT') {
            const mw = this.get(u.a[3]);
            if (mw && mw.a[0] instanceof Typed) this.lengthScale = mw.a[0].v;
          }
          if (u.t === 'IFCCONVERSIONBASEDUNIT' && u.a[1] && u.a[1].v === 'PLANEANGLEUNIT') {
            const mw = this.get(u.a[3]);
            if (mw && mw.a[0] instanceof Typed) this.angleScale = mw.a[0].v;
          }
        }
      }
    }
    /* inverse relations */
    inverse() {
      if (this._inv) return this._inv;
      const inv = { container: new Map(), voids: new Map(), fills: new Map(), filledBy: new Map(), material: new Map(), psets: new Map(), type: new Map(), aggregates: new Map() };
      for (const r of this.all('IFCRELCONTAINEDINSPATIALSTRUCTURE')) for (const el of r.a[4] || []) inv.container.set(el.id, r.a[5].id);
      for (const r of this.all('IFCRELVOIDSELEMENT')) { const h = r.a[4].id; if (!inv.voids.has(h)) inv.voids.set(h, []); inv.voids.get(h).push(r.a[5].id); }
      for (const r of this.all('IFCRELFILLSELEMENT')) { inv.fills.set(r.a[5].id, r.a[4].id); inv.filledBy.set(r.a[4].id, r.a[5].id); }
      for (const r of this.all('IFCRELASSOCIATESMATERIAL')) for (const el of r.a[4] || []) inv.material.set(el.id, r.a[5].id);
      for (const r of this.all('IFCRELDEFINESBYPROPERTIES')) for (const el of r.a[4] || []) { if (!inv.psets.has(el.id)) inv.psets.set(el.id, []); inv.psets.get(el.id).push(r.a[5].id); }
      for (const r of this.all('IFCRELDEFINESBYTYPE')) for (const el of r.a[4] || []) inv.type.set(el.id, r.a[5].id);
      for (const r of this.all('IFCRELAGGREGATES')) for (const el of r.a[5] || []) inv.aggregates.set(el.id, r.a[4].id);
      return (this._inv = inv);
    }
    storeyOf(id) {
      const inv = this.inverse();
      let cur = id;
      for (let k = 0; k < 6 && cur; k++) {
        const c = inv.container.get(cur);
        if (c) { const e = this.get(c); if (e && e.t === 'IFCBUILDINGSTOREY') return e; return null; }
        cur = inv.aggregates.get(cur);
      }
      return null;
    }
    props(id) {
      const out = {};
      for (const pid of this.inverse().psets.get(id) || []) {
        const ps = this.get(pid);
        if (!ps || ps.t !== 'IFCPROPERTYSET') continue;
        for (const r of ps.a[4] || []) {
          const p = this.get(r);
          if (p && p.t === 'IFCPROPERTYSINGLEVALUE') out[p.a[0]] = p.a[2] instanceof Typed ? p.a[2].v : p.a[2];
        }
      }
      return out;
    }
    materialNames(id) {
      const m = this.get(this.inverse().material.get(id));
      if (!m) return [];
      const names = [];
      const visit = e => {
        if (!e) return;
        if (e.t === 'IFCMATERIAL') names.push(e.a[0]);
        else if (e.t === 'IFCMATERIALLAYERSETUSAGE') visit(this.get(e.a[0]));
        else if (e.t === 'IFCMATERIALLAYERSET') for (const l of e.a[0]) visit(this.get(l));
        else if (e.t === 'IFCMATERIALLAYER') visit(this.get(e.a[0]));
        else if (e.t === 'IFCMATERIALLIST') for (const l of e.a[0]) visit(this.get(l));
      };
      visit(m);
      return names;
    }

    /* ───────── placements ───────── */
    pt(r) { const p = this.get(r).a[0]; const s = this.lengthScale; return [p[0] * s, p[1] * s, (p[2] || 0) * s]; }
    dir(r) { const d = this.get(r).a[0]; return vnorm([d[0], d[1], d[2] || 0]); }
    axis3(r) {
      const e = this.get(r);
      if (!e) return IDENT;
      if (e.t === 'IFCAXIS2PLACEMENT2D') {
        const t = this.pt(e.a[0]);
        const x = e.a[1] ? this.dir(e.a[1]) : [1, 0, 0];
        return { x, y: [-x[1], x[0], 0], z: [0, 0, 1], t };
      }
      const t = this.pt(e.a[0]);
      const z = e.a[1] ? this.dir(e.a[1]) : [0, 0, 1];
      let x = e.a[2] ? this.dir(e.a[2]) : (Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]);
      x = vnorm(vsub(x, vmul(z, vdot(x, z))));
      const y = vcross(z, x);
      return { x, y, z, t };
    }
    placement(r) {
      const e = this.get(r);
      if (!e) return IDENT;
      if (this._place.has(e.id)) return this._place.get(e.id);
      let m = IDENT;
      if (e.t === 'IFCLOCALPLACEMENT') {
        const rel = e.a[1] ? this.axis3(e.a[1]) : IDENT;
        m = e.a[0] ? mMul(this.placement(e.a[0]), rel) : rel;
      }
      this._place.set(e.id, m);
      return m;
    }
    transformOperator(r) {
      const e = this.get(r);
      if (!e) return IDENT;
      const s = this.lengthScale;
      const scale = e.a[3] == null ? 1 : e.a[3];
      const org = e.a[2] ? this.pt(e.a[2]) : [0, 0, 0];
      let z = e.a[4] ? this.dir(e.a[4]) : [0, 0, 1];
      let x = e.a[0] ? this.dir(e.a[0]) : [1, 0, 0];
      x = vnorm(vsub(x, vmul(z, vdot(x, z))));
      let y = e.a[1] ? this.dir(e.a[1]) : vcross(z, x);
      y = vnorm(vsub(vsub(y, vmul(z, vdot(y, z))), vmul(x, vdot(y, x))));
      const sy = e.t.endsWith('NONUNIFORM') && e.a[5] != null ? e.a[5] : scale;
      const sz = e.t.endsWith('NONUNIFORM') && e.a[6] != null ? e.a[6] : scale;
      void s;
      return { x: vmul(x, scale), y: vmul(y, sy), z: vmul(z, sz), t: org };
    }

    /* ───────── colours ───────── */
    styles() {
      if (this._style) return this._style;
      const map = new Map();
      const colorOf = st => {
        // IfcPresentationStyleAssignment / IfcSurfaceStyle → rendering colour
        const visit = (e, depth = 0) => {
          if (!e || depth > 5) return null;
          if (e.t === 'IFCPRESENTATIONSTYLEASSIGNMENT') { for (const s of e.a[0]) { const c = visit(this.get(s), depth + 1); if (c) return c; } }
          if (e.t === 'IFCSURFACESTYLE') { for (const s of e.a[2]) { const c = visit(this.get(s), depth + 1); if (c) return c; } }
          if (e.t === 'IFCSURFACESTYLERENDERING' || e.t === 'IFCSURFACESTYLESHADING') {
            const col = this.get(e.a[0]);
            if (!col) return null;
            const tr = e.t === 'IFCSURFACESTYLERENDERING' && typeof e.a[1] === 'number' ? e.a[1] : 0;
            return { rgb: [col.a[1], col.a[2], col.a[3]], alpha: 1 - (tr || 0) };
          }
          return null;
        };
        return visit(st);
      };
      for (const si of this.all('IFCSTYLEDITEM')) {
        if (!si.a[0]) continue;
        for (const s of si.a[1] || []) { const c = colorOf(this.get(s)); if (c) { map.set(si.a[0].id, c); break; } }
      }
      // material colours (IfcMaterialDefinitionRepresentation → styled items)
      this._matColor = new Map();
      for (const mdr of this.all('IFCMATERIALDEFINITIONREPRESENTATION')) {
        const mat = mdr.a[3];
        for (const r of mdr.a[2] || []) {
          const rep = this.get(r);
          for (const it of (rep && rep.a[3]) || []) { const st = this.get(it); if (st && st.t === 'IFCSTYLEDITEM') for (const s of st.a[1] || []) { const c = colorOf(this.get(s)); if (c && mat) this._matColor.set(mat.id, c); } }
        }
      }
      return (this._style = map);
    }
    materialColor(elId) {
      this.styles();
      const m = this.get(this.inverse().material.get(elId));
      if (!m) return null;
      const find = e => {
        if (!e) return null;
        if (e.t === 'IFCMATERIAL') return this._matColor.get(e.id) || null;
        if (e.t === 'IFCMATERIALLAYERSETUSAGE') return find(this.get(e.a[0]));
        if (e.t === 'IFCMATERIALLAYERSET') { for (const l of e.a[0]) { const c = find(this.get(l)); if (c) return c; } }
        if (e.t === 'IFCMATERIALLAYER') return find(this.get(e.a[0]));
        if (e.t === 'IFCMATERIALLIST') { for (const l of e.a[0]) { const c = find(this.get(l)); if (c) return c; } }
        return null;
      };
      return find(m);
    }

    /* ───────── curves + profiles (2D, metres) ───────── */
    pt2(r) { const p = this.get(r).a[0]; const s = this.lengthScale; return [p[0] * s, p[1] * s]; }
    curve(r) {
      const e = this.get(r);
      if (!e) return [];
      if (e.t === 'IFCPOLYLINE') return e.a[0].map(p => this.pt2(p));
      if (e.t === 'IFCINDEXEDPOLYCURVE') { const pl = this.get(e.a[0]); const s = this.lengthScale; return pl.a[0].map(p => [p[0] * s, p[1] * s]); }
      if (e.t === 'IFCCOMPOSITECURVE') {
        let out = [];
        for (const sr of e.a[0]) {
          const seg = this.get(sr);
          let pts = this.curve(seg.a[2]);
          if (seg.a[1] === false) pts = pts.slice().reverse();
          if (out.length && pts.length && Math.hypot(out[out.length - 1][0] - pts[0][0], out[out.length - 1][1] - pts[0][1]) < 1e-6) pts = pts.slice(1);
          out = out.concat(pts);
        }
        return out;
      }
      if (e.t === 'IFCTRIMMEDCURVE') {
        const basis = this.get(e.a[0]);
        const sense = e.a[3] !== false;
        if (basis.t === 'IFCCIRCLE' || basis.t === 'IFCELLIPSE') {
          const pl = this.axis3(basis.a[0]);
          const rx = basis.a[1] * this.lengthScale, ry = (basis.t === 'IFCELLIPSE' ? basis.a[2] : basis.a[1]) * this.lengthScale;
          const ang = trim => {
            let par = null, cart = null;
            for (const t of trim) { if (t instanceof Typed && t.t === 'IFCPARAMETERVALUE') par = t.v; else if (t instanceof Ref) cart = t; }
            if (cart && (e.a[4] && e.a[4].v === 'CARTESIAN' || par == null)) {
              const p = this.pt2(cart);
              const lx = (p[0] - pl.t[0]) * pl.x[0] + (p[1] - pl.t[1]) * pl.x[1];
              const ly = (p[0] - pl.t[0]) * pl.y[0] + (p[1] - pl.t[1]) * pl.y[1];
              return Math.atan2(ly / ry, lx / rx);
            }
            return (par || 0) * this.angleScale;
          };
          let a0 = ang(e.a[1]), a1 = ang(e.a[2]);
          if (sense) { while (a1 <= a0 + 1e-9) a1 += Math.PI * 2; } else { while (a1 >= a0 - 1e-9) a1 -= Math.PI * 2; }
          const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 18)));
          const pts = [];
          for (let k = 0; k <= steps; k++) {
            const a = a0 + (a1 - a0) * k / steps;
            const lx = Math.cos(a) * rx, ly = Math.sin(a) * ry;
            pts.push([pl.t[0] + pl.x[0] * lx + pl.y[0] * ly, pl.t[1] + pl.x[1] * lx + pl.y[1] * ly]);
          }
          return pts;
        }
        if (basis.t === 'IFCLINE') {
          const ends = [e.a[1], e.a[2]].map(trim => { const c = trim.find(t => t instanceof Ref); return c ? this.pt2(c) : null; }).filter(Boolean);
          return sense ? ends : ends.reverse();
        }
      }
      if (e.t === 'IFCCIRCLE') {
        const pl = this.axis3(e.a[0]);
        const r0 = e.a[1] * this.lengthScale;
        const pts = [];
        for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; pts.push([pl.t[0] + pl.x[0] * Math.cos(a) * r0 + pl.y[0] * Math.sin(a) * r0, pl.t[1] + pl.x[1] * Math.cos(a) * r0 + pl.y[1] * Math.sin(a) * r0]); }
        return pts;
      }
      return [];
    }
    /** profile → {outer:[[x,y]], holes:[[[x,y]]]} in profile coordinates */
    profile(r) {
      const e = this.get(r);
      const s = this.lengthScale;
      const place = loop => {
        const pos = e.a[2] && (e.t === 'IFCRECTANGLEPROFILEDEF' || e.t === 'IFCCIRCLEPROFILEDEF' || e.t === 'IFCRECTANGLEHOLLOWPROFILEDEF' || e.t === 'IFCCIRCLEHOLLOWPROFILEDEF' || e.t === 'IFCISHAPEPROFILEDEF' || e.t === 'IFCLSHAPEPROFILEDEF' || e.t === 'IFCUSHAPEPROFILEDEF' || e.t === 'IFCTSHAPEPROFILEDEF' || e.t === 'IFCCSHAPEPROFILEDEF' || e.t === 'IFCZSHAPEPROFILEDEF') ? this.axis3(e.a[2]) : null;
        if (!pos) return loop;
        return loop.map(p => [pos.t[0] + pos.x[0] * p[0] + pos.y[0] * p[1], pos.t[1] + pos.x[1] * p[0] + pos.y[1] * p[1]]);
      };
      if (e.t === 'IFCRECTANGLEPROFILEDEF') {
        const x = e.a[3] * s / 2, y = e.a[4] * s / 2;
        return { outer: place([[-x, -y], [x, -y], [x, y], [-x, y]]), holes: [] };
      }
      if (e.t === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
        const x = e.a[3] * s / 2, y = e.a[4] * s / 2, w = e.a[5] * s;
        return { outer: place([[-x, -y], [x, -y], [x, y], [-x, y]]), holes: [place([[-x + w, -y + w], [-x + w, y - w], [x - w, y - w], [x - w, -y + w]])] };
      }
      if (e.t === 'IFCCIRCLEPROFILEDEF' || e.t === 'IFCCIRCLEHOLLOWPROFILEDEF') {
        const r0 = e.a[3] * s;
        const loop = [];
        for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; loop.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
        const holes = [];
        if (e.t === 'IFCCIRCLEHOLLOWPROFILEDEF') { const ri = r0 - e.a[4] * s; const h = []; for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; h.push([Math.cos(a) * ri, Math.sin(a) * ri]); } holes.push(place(h.reverse())); }
        return { outer: place(loop), holes };
      }
      if (e.t === 'IFCARBITRARYCLOSEDPROFILEDEF') return { outer: dedupe(this.curve(e.a[2])), holes: [] };
      if (e.t === 'IFCARBITRARYPROFILEDEFWITHVOIDS') return { outer: dedupe(this.curve(e.a[2])), holes: (e.a[3] || []).map(c => dedupe(this.curve(c))) };
      if (e.t === 'IFCDERIVEDPROFILEDEF') {
        const base = this.profile(e.a[2]);
        const op = this.transformOperator(e.a[3]);
        const tf = loop => loop.map(p => { const q = mApply(op, [p[0], p[1], 0]); return [q[0], q[1]]; });
        return { outer: tf(base.outer), holes: base.holes.map(tf) };
      }
      return null;
    }

    /* ───────── solids as polygon lists (in the item's coordinate system) ───────── */
    extruded(e) {
      const prof = this.profile(e.a[0]);
      if (!prof || prof.outer.length < 3) return [];
      const pos = e.a[1] ? this.axis3(e.a[1]) : IDENT;
      const d = this.dir(e.a[2]);
      const depth = e.a[3] * this.lengthScale;
      let outer = prof.outer.slice();
      if (area2(outer) < 0) outer.reverse();
      const holes = prof.holes.filter(hh => hh.length >= 3).map(hh => area2(hh) > 0 ? hh.slice().reverse() : hh.slice());
      const ext = vmul(d, depth);
      const flip = ext[2] < 0;
      const P = (p, top) => mApply(pos, top ? [p[0] + ext[0], p[1] + ext[1], ext[2]] : [p[0], p[1], 0]);
      const polys = [];
      const add = (vs) => { const p = makePoly(vs, null); if (p) polys.push(flip ? flipPoly(p) : p); };
      const tris = THREE.ShapeUtils.triangulateShape(outer.map(p => new THREE.Vector2(p[0], p[1])), holes.map(hh => hh.map(p => new THREE.Vector2(p[0], p[1]))));
      const all = outer.concat(...holes);
      for (const [a, b, c] of tris) {
        // orient the triangle CCW in profile space first
        let t = [all[a], all[b], all[c]];
        if (area2(t) < 0) t = [t[0], t[2], t[1]];
        add([P(t[0], true), P(t[1], true), P(t[2], true)]);
        add([P(t[2], false), P(t[1], false), P(t[0], false)]);
      }
      for (const loop of [outer, ...holes]) {
        for (let i = 0; i < loop.length; i++) {
          const p = loop[i], q = loop[(i + 1) % loop.length];
          add([P(p, false), P(q, false), P(q, true), P(p, true)]);
        }
      }
      return polys;
    }
    brep(e) {
      const shells = e.t === 'IFCFACETEDBREP' || e.t === 'IFCFACETEDBREPWITHVOIDS' || e.t === 'IFCADVANCEDBREP' ? [e.a[0]] : (e.a[0] || []);
      const polys = [];
      const s = this.lengthScale;
      for (const sr of shells) {
        const sh = this.get(sr);
        if (!sh) continue;
        for (const fr of sh.a[0]) {
          const f = this.get(fr);
          if (!f) continue;
          let outer = null;
          const holes = [];
          for (const br of f.a[0]) {
            const b = this.get(br);
            const loopE = this.get(b.a[0]);
            if (!loopE || loopE.t !== 'IFCPOLYLOOP') continue;
            let loop = dedupe(loopE.a[0].map(pr => { const p = this.get(pr).a[0]; return [p[0] * s, p[1] * s, (p[2] || 0) * s]; }));
            if (b.a[1] === false) loop = loop.reverse();
            if (loop.length < 3) continue;
            if (b.t === 'IFCFACEOUTERBOUND' && !outer) outer = loop; else holes.push(loop);
          }
          if (!outer && holes.length) outer = holes.shift();
          if (!outer) continue;
          const plane = polyPlane(outer);
          if (!plane) continue;
          if (!holes.length && outer.length <= 4 && isConvex(outer, plane.n)) { const p = makePoly(outer, null); if (p) polys.push(p); continue; }
          for (const tri of triangulate3D(outer, holes, plane.n)) { const p = makePoly(tri, null); if (p) polys.push(p); }
        }
      }
      return polys;
    }
    /** IFC4 tessellated geometry: IfcTriangulatedFaceSet / IfcPolygonalFaceSet (indexed points, 1-based) */
    faceSet(e) {
      const s = this.lengthScale;
      const plist = this.get(e.a[0]);
      if (!plist) return [];
      const pts = (plist.a[0] || []).map(p => [p[0] * s, p[1] * s, (p[2] || 0) * s]);
      const tri = e.t === 'IFCTRIANGULATEDFACESET';
      const pn = tri ? e.a[4] : e.a[3];
      const P = i => pts[(pn && pn.length ? pn[i - 1] : i) - 1];
      const polys = [];
      if (tri) {
        for (const ix of e.a[3] || []) { const vs = ix.map(P); if (vs.every(Boolean)) { const p = makePoly(vs, null); if (p) polys.push(p); } }
        return polys;
      }
      for (const fr of e.a[2] || []) {
        const f = this.get(fr);
        if (!f) continue;
        const outer = dedupe((f.a[0] || []).map(P).filter(Boolean));
        const holes = f.t === 'IFCINDEXEDPOLYGONALFACEWITHVOIDS' ? (f.a[1] || []).map(l => dedupe(l.map(P).filter(Boolean))).filter(l => l.length >= 3) : [];
        if (outer.length < 3) continue;
        const plane = polyPlane(outer);
        if (!plane) continue;
        if (!holes.length && outer.length <= 4 && isConvex(outer, plane.n)) { const p = makePoly(outer, null); if (p) polys.push(p); continue; }
        for (const t3 of triangulate3D(outer, holes, plane.n)) { const p = makePoly(t3, null); if (p) polys.push(p); }
      }
      return polys;
    }
    halfSpacePolys(e) {
      // a big block standing in for the half space; for polygon-bounded ones intersected with the boundary prism
      const S = 300;
      const plane = this.axis3(this.get(e.a[0]).a[0]);
      const agree = e.a[1] !== false;
      const z0 = agree ? -S : 0, z1 = agree ? 0 : S;
      const box = [];
      const corners = (zA, zB) => [[-S, -S, zA], [S, -S, zA], [S, S, zA], [-S, S, zA], [-S, -S, zB], [S, -S, zB], [S, S, zB], [-S, S, zB]].map(p => mApply(plane, p));
      const c = corners(z0, z1);
      const quad = (a, b, cc, d) => { const p = makePoly([c[a], c[b], c[cc], c[d]], null); if (p) box.push(p); };
      quad(0, 3, 2, 1); quad(4, 5, 6, 7); quad(0, 1, 5, 4); quad(1, 2, 6, 5); quad(2, 3, 7, 6); quad(3, 0, 4, 7);
      if (e.t !== 'IFCPOLYGONALBOUNDEDHALFSPACE') return box;
      const pos = this.axis3(e.a[2]);
      let loop = dedupe(this.curve(e.a[3]));
      if (loop.length < 3) return box;
      if (area2(loop) < 0) loop.reverse();
      const prism = [];
      const P = (p, z) => mApply(pos, [p[0], p[1], z]);
      const tris = THREE.ShapeUtils.triangulateShape(loop.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const [a, b, cc] of tris) {
        let t = [loop[a], loop[b], loop[cc]];
        if (area2(t) < 0) t = [t[0], t[2], t[1]];
        const top = makePoly([P(t[0], S), P(t[1], S), P(t[2], S)], null); if (top) prism.push(top);
        const bot = makePoly([P(t[2], -S), P(t[1], -S), P(t[0], -S)], null); if (bot) prism.push(bot);
      }
      for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; const sd = makePoly([P(p, -S), P(q, -S), P(q, S), P(p, S)], null); if (sd) prism.push(sd); }
      return csgIntersect(box, prism);
    }
    /** representation item → [{polys, style}] in the item's coordinate system */
    item(r, depth = 0) {
      const e = this.get(r);
      if (!e || depth > 8) return [];
      const style = this.styles().get(e.id) || null;
      switch (e.t) {
        case 'IFCEXTRUDEDAREASOLID': return [{ polys: this.extruded(e), style }];
        case 'IFCFACETEDBREP': case 'IFCFACETEDBREPWITHVOIDS': case 'IFCSHELLBASEDSURFACEMODEL': case 'IFCFACEBASEDSURFACEMODEL':
          return [{ polys: this.brep(e), style }];
        case 'IFCTRIANGULATEDFACESET': case 'IFCPOLYGONALFACESET':
          return [{ polys: this.faceSet(e), style }];
        case 'IFCBOOLEANCLIPPINGRESULT': case 'IFCBOOLEANRESULT': {
          const first = this.item(e.a[1], depth + 1);
          const second = this.get(e.a[2]);
          let cut;
          if (second && (second.t === 'IFCHALFSPACESOLID' || second.t === 'IFCPOLYGONALBOUNDEDHALFSPACE' || second.t === 'IFCBOXEDHALFSPACE')) cut = this.halfSpacePolys(second);
          else cut = this.item(e.a[2], depth + 1).flatMap(x => x.polys);
          const op = e.a[0] && e.a[0].v;
          return first.map(f => {
            if (!f.polys.length || !cut.length) return f;
            if (op === 'DIFFERENCE') { if (!bboxHit(bboxOf(f.polys), bboxOf(cut))) return f; return { polys: csgSubtract(f.polys, cut), style: f.style || style }; }
            if (op === 'INTERSECTION') return { polys: csgIntersect(f.polys, cut), style: f.style || style };
            return { polys: f.polys.concat(cut), style: f.style || style };
          });
        }
        case 'IFCMAPPEDITEM': {
          const src = this.get(e.a[0]);
          const origin = this.axis3(src.a[0]);
          const target = this.transformOperator(e.a[1]);
          const m = mMul(target, origin);
          const rep = this.get(src.a[1]);
          const out = [];
          for (const it of rep.a[3] || []) for (const g of this.item(it, depth + 1)) out.push({ polys: transformPolys(g.polys, m), style: g.style || style });
          return out;
        }
        default: return [];
      }
    }
    /** product → {meshes:[{tris: Float32Array, style}], placement} in world (IFC frame, metres) */
    productPolys(id, opts = {}) {
      const el = this.get(id);
      if (!el || !el.a[6]) return [];
      const M = this.placement(el.a[5]);
      const pds = this.get(el.a[6]);
      const reps = (pds.a[2] || []).map(r => this.get(r)).filter(Boolean);
      const body = reps.find(r => r.a[1] === 'Body') || reps.find(r => r.a[1] === 'Facetation') || null;
      if (!body) return [];
      let groups = [];
      for (const it of body.a[3] || []) for (const g of this.item(it)) groups.push({ polys: transformPolys(g.polys, M), style: g.style });
      if (opts.voids !== false) {
        const vids = this.inverse().voids.get(id) || [];
        if (vids.length) {
          const cuts = vids.map(v => this.productPolys(v, { voids: false }).flatMap(g => g.polys)).filter(p => p.length);
          groups = groups.map(g => {
            let polys = g.polys;
            for (const c of cuts) {
              if (!polys.length) break;
              if (!bboxHit(bboxOf(polys), bboxOf(c))) continue;
              try { polys = csgSubtract(polys, c); } catch (err) { /* keep uncut */ }
            }
            return { polys, style: g.style };
          });
        }
      }
      const fallback = this.materialColor(id);
      return groups.map(g => ({ polys: g.polys, style: g.style || fallback }));
    }
    /** representation 'Axis' of a wall, in world coordinates */
    axisLine(id) {
      const el = this.get(id);
      const pds = el && this.get(el.a[6]);
      if (!pds) return null;
      const M = this.placement(el.a[5]);
      for (const r of pds.a[2] || []) {
        const rep = this.get(r);
        if (!rep || rep.a[1] !== 'Axis') continue;
        const c = this.get(rep.a[3][0]);
        const pts = this.curve(c.id);
        if (pts.length >= 2) return [mApply(M, [pts[0][0], pts[0][1], 0]), mApply(M, [pts[pts.length - 1][0], pts[pts.length - 1][1], 0])];
      }
      return null;
    }
  }
  function isConvex(loop, n) {
    let sign = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], c = loop[(i + 2) % loop.length];
      const d = vdot(vcross(vsub(b, a), vsub(c, b)), n);
      if (Math.abs(d) < 1e-12) continue;
      if (!sign) sign = Math.sign(d); else if (Math.sign(d) !== sign) return false;
    }
    return true;
  }
  function transformPolys(polys, m) {
    return polys.map(p => { const vs = p.vs.map(v => mApply(m, v)); const pl = polyPlane(vs); return pl ? { vs, plane: pl, shared: p.shared } : null; }).filter(Boolean);
  }
  function polysToTris(polys) {
    const out = [];
    for (const p of polys) for (let i = 1; i < p.vs.length - 1; i++) out.push(p.vs[0], p.vs[i], p.vs[i + 1]);
    return out;
  }
  return { parse, Model, Ref, Enum, Typed, polysToTris, csgSubtract, csgIntersect, bboxOf, mApply, vsub, vcross, vdot, vnorm };
})();
