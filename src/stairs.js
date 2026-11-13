/* ───────────── stairs.js — the stair tool for houses drawn by hand: straight, L (a quarter turn with a landing) and
   U (a half turn with a landing); the number of risers follows the storey height; an opening in the floor above;
   a 2D symbol with the walking line; 3D steps you can walk up ─────────────

   plan.stairs = [{ id, storey, kind: 'straight' | 'L' | 'U', x, y (middle of the first step's front edge), rot (degrees:
   the way up), w (width), g (going: depth of a tread), n (risers), turn: 'left' | 'right', H (rise), upper (storey id
   above), hole (cut the floor above, default on) }] */

const STAIR_RISER = 0.185;
/** the storey above a storey (null at the top) */
function storeyAbove(p, sid) {
  const list = sortedStoreys(p), i = list.findIndex(s => s.id === sid);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
}
/** the rise of a stair: floor to floor */
function stairRise(p, sid) {
  const st = getStorey(p, sid), up = storeyAbove(p, sid);
  return up ? up.elevation - st.elevation : (st ? st.height || DEFAULTS.storeyHeight : DEFAULTS.storeyHeight);
}
/** treads (each a quad with its height), landing, the parts of the outline (convex), and the walking line */
function stairGeom(s) {
  const u = [Math.cos((s.rot || 0) * Math.PI / 180), Math.sin((s.rot || 0) * Math.PI / 180)];
  // seen from above (plan y runs down the screen), a left turn is towards −perp
  const v = V.mul(V.perp(u), s.turn === 'right' ? 1 : -1);
  const P0 = [s.x, s.y], w = s.w || 0.9, g = s.g || 0.22, n = Math.max(3, s.n || 16), R = (s.H || 2.9) / n;
  const nt = n - 1, treads = [], parts = [], walk = [];
  const quad = (o, a, b, len, wid) => [o, V.add(o, V.mul(a, len)), V.add(V.add(o, V.mul(a, len)), V.mul(b, wid)), V.add(o, V.mul(b, wid))];
  // a flight of k treads from point S (middle of its first edge) in direction d, starting at tread number i0
  const flight = (S, d, k, i0) => {
    const side = V.perp(d), o = V.sub(S, V.mul(side, w / 2));
    for (let j = 0; j < k; j++) {
      const q = quad(V.add(o, V.mul(d, j * g)), d, side, g, w);
      treads.push({ poly: q, h: (i0 + j + 1) * R });
      walk.push({ x: S[0] + d[0] * (j + 0.5) * g, y: S[1] + d[1] * (j + 0.5) * g, h: (i0 + j + 1) * R });
    }
    if (k) parts.push(quad(o, d, side, k * g, w));
  };
  let landing = null;
  if (s.kind === 'L' || s.kind === 'U') {
    const n1 = Math.max(1, Math.floor(nt / 2)), n2 = Math.max(0, nt - n1 - 1);
    flight(P0, u, n1, 0);
    const L0 = V.add(P0, V.mul(u, n1 * g));
    const lh = (n1 + 1) * R;
    if (s.kind === 'L') {
      // the landing is a square; the second flight leaves it to the side of the turn
      const lq = [V.sub(L0, V.mul(v, w / 2)), V.add(V.sub(L0, V.mul(v, w / 2)), V.mul(u, w)), V.add(V.add(L0, V.mul(v, w / 2)), V.mul(u, w)), V.add(L0, V.mul(v, w / 2))];
      landing = { poly: lq, h: lh };
      walk.push({ x: L0[0] + u[0] * w / 2, y: L0[1] + u[1] * w / 2, h: lh });
      flight(V.add(V.add(L0, V.mul(u, w / 2)), V.mul(v, w / 2)), v, n2, n1 + 1);
    } else {
      // a half turn: the landing spans both flights, the second comes back next to the first
      const gap = 0.06;
      const a0 = V.sub(L0, V.mul(v, w / 2));
      const lq = [a0, V.add(a0, V.mul(u, w)), V.add(V.add(a0, V.mul(u, w)), V.mul(v, 2 * w + gap)), V.add(a0, V.mul(v, 2 * w + gap))];
      landing = { poly: lq, h: lh };
      walk.push({ x: L0[0] + u[0] * w / 2 + v[0] * (w + gap) / 2, y: L0[1] + u[1] * w / 2 + v[1] * (w + gap) / 2, h: lh });
      flight(V.add(L0, V.mul(v, w + gap)), V.mul(u, -1), n2, n1 + 1);
    }
    parts.push(landing.poly);
  } else flight(P0, u, nt, 0);
  return { treads, landing, parts, walk, R, u, v, w, g, n };
}
/** the outline points of a stair (for boxes and selection) */
function stairOutline(s) { return stairGeom(s).parts.flat(); }
/** convex pieces of the stairwell opening in the floor above */
function stairHoles(s) { return s.hole === false ? [] : stairGeom(s).parts; }
function mirrorStair(s, axis, c) {
  // mirror the start point and the direction; a left turn becomes a right turn
  if (axis === 'x') { s.x = +(2 * c - s.x).toFixed(4); s.rot = ((180 - (s.rot || 0)) % 360 + 360) % 360; }
  else { s.y = +(2 * c - s.y).toFixed(4); s.rot = ((360 - (s.rot || 0)) % 360 + 360) % 360; }
  if (s.kind !== 'straight') s.turn = s.turn === 'right' ? 'left' : 'right';
}

/* ───────── 2D ───────── */
Object.assign(PlanView.prototype, {
  /** stairs of this storey (treads, walking line with its arrow), and the ones from below as a dashed opening */
  drawStairs(g, en) {
    const list = en.plan.stairs || [];
    if (!list.length) return;
    const sel = this.spec.selection;
    for (const st of list) {
      const isHere = st.storey === en.storey.id, isAbove = st.upper === en.storey.id;
      if (!isHere && !isAbove) continue;
      const G = stairGeom(st);
      const path = polys => polys.map(q => 'M' + q.map(p => p[0].toFixed(4) + ' ' + p[1].toFixed(4)).join('L') + 'Z').join('');
      const isSel = sel && en.edit !== false && ((sel.type === 'stair' && sel.id === st.id));
      const grp = s('g', { class: 'stair2d' + (isAbove && !isHere ? ' above' : '') + (isSel ? ' sel' : ''), 'data-stair': st.id });
      grp.appendChild(s('path', { d: path(G.parts), class: 'stair-out' }));
      if (isHere) {
        grp.appendChild(s('path', { d: path(G.treads.map(t2 => t2.poly)), class: 'stair-tread' }));
        const pts = [[st.x, st.y], ...G.walk.map(q => [q.x, q.y])];
        const last = pts[pts.length - 1], prev = pts[pts.length - 2] || pts[0];
        const d = V.norm(V.sub(last, prev)), nn = V.perp(d), ah = Math.min(0.18, G.w * 0.25);
        const tip = V.add(last, V.mul(d, G.g * 0.5));
        grp.appendChild(s('path', { d: 'M' + pts.map(p => p[0].toFixed(4) + ' ' + p[1].toFixed(4)).join('L') + 'L' + tip[0].toFixed(4) + ' ' + tip[1].toFixed(4), class: 'stair-walk' }));
        const a1 = V.add(V.sub(tip, V.mul(d, ah)), V.mul(nn, ah * 0.5)), a2 = V.sub(V.sub(tip, V.mul(d, ah)), V.mul(nn, ah * 0.5));
        grp.appendChild(s('path', { d: `M${a1[0]} ${a1[1]}L${tip[0]} ${tip[1]}L${a2[0]} ${a2[1]}`, class: 'stair-walk' }));
        grp.appendChild(s('circle', { cx: st.x, cy: st.y, r: Math.min(0.06, G.w * 0.08), class: 'stair-start' }));
      }
      g.appendChild(grp);
    }
  },
  /** the stair under a plan point (this storey) */
  stairAt(p, en) {
    for (const st of en.plan.stairs || []) {
      if (st.storey !== en.storey.id) continue;
      if (stairGeom(st).parts.some(q => pointInPolygon(p, q))) return st;
    }
    return null;
  },
});

/* ───────── 3D: steps you can walk up ───────── */
Object.assign(View3D.prototype, {
  buildStairs(g, en, cutH) {
    const list = (en.plan.stairs || []).filter(st => st.storey === en.storey.id);
    if (!list.length) return;
    const wood = mat('stair-wood', () => new THREE.MeshStandardMaterial({ color: 0xC9A27A, roughness: 0.7 }));
    const white = mat('stair-white', () => new THREE.MeshStandardMaterial({ color: 0xF1EFEA, roughness: 0.8 }));
    const sel = this.spec.selection;
    for (const st of list) {
      const G = stairGeom(st);
      const slab = (q, top, thick, m, walk) => {
        const shape = new THREE.Shape(q.map(([x, y]) => new THREE.Vector2(x, -y)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.y = top - thick;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.stair = st.id;
        if (walk) mesh.userData.walk = true;
        g.add(mesh);
        return mesh;
      };
      for (const t2 of G.treads) {
        if (cutH != null && t2.h - G.R > cutH) continue;
        slab(t2.poly, t2.h, 0.045, wood, true);
        // the riser below the tread (closed stair)
        const q = t2.poly, d = V.norm(V.sub(q[1], q[0])), side = V.norm(V.sub(q[3], q[0]));
        const riser = [q[0], V.add(q[0], V.mul(d, 0.02)), V.add(V.add(q[0], V.mul(d, 0.02)), V.mul(side, G.w)), V.add(q[0], V.mul(side, G.w))];
        slab(riser, t2.h - 0.045, Math.max(0.01, G.R - 0.045), white, false);
      }
      if (G.landing && (cutH == null || G.landing.h - G.R <= cutH)) { slab(G.landing.poly, G.landing.h, 0.06, wood, true); slab(G.landing.poly, G.landing.h - 0.06, Math.max(0.05, G.landing.h - 0.06), white, false); }
      if (sel && sel.type === 'stair' && sel.id === st.id) {
        const pts = G.parts.flat();
        const bb = bboxOfPoints(pts);
        const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(bb.minX, 0, bb.minY), new THREE.Vector3(bb.maxX, st.H || 2.9, bb.maxY)), new THREE.Color(cssVar('--accent') || '#0e6f78'));
        g.add(box);
      }
    }
  },
});

/* ───────── the tool and the details ───────── */
Object.assign(app, {
  /** first tap: where the stair starts (the bottom step); second tap: the way up */
  stairTap(p, en, view) {
    const o = this.toolOpts;
    if (!view.stairStart) { view.stairStart = [...p]; view.drawOverlay(); this.renderStageOverlays(); return; }
    const a = view.stairStart, d = V.sub(p, a);
    view.stairStart = null;
    if (V.len(d) < 0.15) { view.drawOverlay(); this.renderStageOverlays(); return; }
    const H = stairRise(this.project, en.storey.id), up = storeyAbove(this.project, en.storey.id);
    const n = Math.max(3, Math.ceil(H / STAIR_RISER - 1e-6));
    const rot = Math.round(Math.atan2(d[1], d[0]) * 180 / Math.PI / 15) * 15;
    const st = { id: uid('sr_'), storey: en.storey.id, kind: o.stairKind || 'straight', x: +a[0].toFixed(3), y: +a[1].toFixed(3), rot, w: o.stairW || 0.9, g: 0.22, n, turn: o.stairTurn || 'left', H: +H.toFixed(3), upper: up ? up.id : null, hole: true };
    this.mutate(plan => { (plan.stairs = plan.stairs || []).push(st); });
    this.setTool('select');
    this.select({ type: 'stair', id: st.id });
    view.drawOverlay();
  },
  stairOptions(box, chip, view) {
    const o = this.toolOpts;
    box.appendChild(h('span', { class: 'lbl' }, t('Stair')));
    for (const [k, lab] of [['straight', 'Straight'], ['L', 'L (quarter turn)'], ['U', 'U (half turn)']]) box.appendChild(chip(t(lab), (o.stairKind || 'straight') === k, () => { o.stairKind = k; }));
    if ((o.stairKind || 'straight') !== 'straight') for (const [k, lab] of [['left', 'Turns left'], ['right', 'Turns right']]) box.appendChild(chip(t(lab), (o.stairTurn || 'left') === k, () => { o.stairTurn = k; }));
    box.appendChild(h('span', { class: 'lbl' }, t('Width')));
    for (const mm of [800, 900, 1000]) box.appendChild(chip(String(mm), Math.abs((o.stairW || 0.9) - mm / 1000) < 1e-6, () => { o.stairW = mm / 1000; }));
    box.appendChild(h('span', { class: 'hint' }, view && view.stairStart ? t('Now tap the way up.') : t('Tap where the bottom step starts, then the way up.')));
  },
  stairPanel(el, st) {
    const v = this.shownVersion();
    const ro = !this.canEdit() || this.mode !== 'build';
    const G = stairGeom(st), store = getStorey(this.project, st.storey), up = st.upper && getStorey(this.project, st.upper);
    this.inspHead(el, t({ straight: 'Straight stair', L: 'L stair (quarter turn)', U: 'U stair (half turn)' }[st.kind] || 'Stair'), (store ? store.name : '') + (up ? ' → ' + up.name : ''));
    const upd = (fn, opts = {}) => this.mutate(pl => { const x = (pl.stairs || []).find(y => y.id === st.id); if (x) fn(x); }, { keepInspector: false, ...opts });
    const sec = h('div', { class: 'insp-sec' });
    sec.appendChild(this.segRow(t('Shape'), [['straight', 'Straight'], ['L', 'L'], ['U', 'U']], st.kind, k => upd(x => { x.kind = k; }), ro, 'stair-kind'));
    if (st.kind !== 'straight') sec.appendChild(this.segRow(t('Turns'), [['left', 'Left'], ['right', 'Right']], st.turn || 'left', k => upd(x => { x.turn = k; }), ro, 'stair-turn'));
    sec.appendChild(h('div', { class: 'field-row' },
      this.mmField(t('Width'), 'f-st-w', st.w, val => upd(x => { x.w = clamp(val, 0.5, 2); }), { disabled: ro }),
      this.mmField(t('Going (tread depth)'), 'f-st-g', st.g, val => upd(x => { x.g = clamp(val, 0.15, 0.4); }), { disabled: ro })));
    sec.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Risers'), 'f-st-n', st.n, '×', val => upd(x => { x.n = Math.round(clamp(val, 3, 30)); }), { disabled: ro, dec: 0, min: 3, max: 30 }),
      this.mmField(t('Rise, floor to floor'), 'f-st-H', st.H, val => upd(x => { x.H = clamp(val, 0.5, 6); }), { disabled: ro })));
    sec.appendChild(h('dl', { class: 'kv' },
      h('dt', null, t('Riser height')), h('dd', null, fmtMM(G.R) + ' mm'),
      h('dt', null, t('Steps on the way up')), h('dd', null, String(G.treads.length) + (G.landing ? ' + ' + t('landing') : '')),
      h('dt', null, t('Pitch')), h('dd', null, Math.round(Math.atan2(G.R, G.g) * 180 / Math.PI) + '°'),
      h('dt', null, t('Step rule (2 × riser + going)')), h('dd', null, fmtMM(2 * G.R + G.g) + ' mm')));
    const rule = 2 * G.R + G.g;
    if (rule < 0.57 || rule > 0.65 || G.R > 0.188) sec.appendChild(h('p', { class: 'note-warn' }, icon('problem'), t('Check this stair: NL rules ask for a riser of at most 188 mm and a going of at least 220 mm; 2 × riser + going comfortable between 570 and 650 mm.')));
    const cb = h('input', { type: 'checkbox', id: 'f-st-hole', checked: st.hole !== false, disabled: ro || !up });
    cb.addEventListener('change', () => upd(x => { x.hole = cb.checked; }));
    sec.appendChild(h('label', { class: 'check-row', for: 'f-st-hole' }, cb, h('span', null, up ? t('Opening in the floor of {s}', { s: up.name }) : t('No storey above'))));
    el.appendChild(sec);
    if (!ro) el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => upd(x => { x.rot = ((x.rot || 0) + 90) % 360; }) }, icon('rotate'), t('Turn 90°')),
      st.kind === 'straight' ? h('button', { class: 'btn sm', onclick: () => upd(x => { const G2 = stairGeom(x); x.x = +(x.x + G2.u[0] * G2.treads.length * G2.g).toFixed(4); x.y = +(x.y + G2.u[1] * G2.treads.length * G2.g).toFixed(4); x.rot = ((x.rot || 0) + 180) % 360; }) }, icon('flip'), t('Up the other way')) : null,
      h('button', { class: 'btn sm danger', onclick: () => this.deleteSelection() }, icon('trash'), t('Delete stair'))),
      h('p', { class: 'note-muted' }, t('Drag it to move it. The dot is the bottom step; the arrow points up.'))));
    void v;
  },
});
