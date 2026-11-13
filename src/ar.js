/* ───────────── ar.js — the plan in the real room (AR: an Android phone with Chrome) ─────────────
   View → "AR: the plan in the real room". Stand in a room of the empty house: pick the room and two of its corners
   (A and B, the ends of its longest wall at first), start, point the dot on the floor at corner A of the real room
   and tap "Place A", then at corner B and "Place B". From those two spots the storey of the shown version is laid
   over the room at true size (1 : 1, turned and moved to fit; the floor is where you tapped): planned walls (see-
   through, solid or off), the new floors, the kitchen and furniture, sockets and switches, and "pipes and cables"
   from the building diary – where not to drill. "Changes" shows what the plan changes (new walls in red). The distance
   between your two taps is compared with the plan (a tape-measure check); turn and shift by 0.5° / 1 cm to fine-tune.
   Needs WebXR "immersive-ar" with hit testing: Chrome on an Android phone with Google Play Services for AR, the app
   opened from a secure (https) address – the web version once it is online. iPhones (Safari) can't do AR in a page.
   The transform: plan (x, y) → 3D (x, z) as everywhere in the app, then turned by -rot about the vertical and moved,
   so that the middle of A–B lands on the middle of the two taps (a difference in length is shared by both ends). */

const AR_NUDGE_DEG = 0.5, AR_NUDGE_M = 0.01;
const AR_WARN = 0.15;          // taps further than this from the plan's length: tap again?

/** is AR possible here? → { ok, why: 'insecure' | 'noxr' | 'noar' | 'error' | null } */
async function arSupport() {
  if (!window.isSecureContext) return { ok: false, why: 'insecure' };
  if (!navigator.xr || !navigator.xr.isSessionSupported) return { ok: false, why: 'noxr' };
  try { return (await navigator.xr.isSessionSupported('immersive-ar')) ? { ok: true, why: null } : { ok: false, why: 'noar' }; }
  catch (e) { return { ok: false, why: 'error' }; }
}
/** two plan corners and the two floor spots tapped in the room → how to lay the plan over the room */
function arFit(pa, pb, wa, wb) {
  const angP = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]), angW = Math.atan2(wb.z - wa.z, wb.x - wa.x);
  const rot = angW - angP;
  const lenP = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), lenW = Math.hypot(wb.x - wa.x, wb.z - wa.z);
  const mp = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], mw = { x: (wa.x + wb.x) / 2, z: (wa.z + wb.z) / 2 };
  const c = Math.cos(rot), s = Math.sin(rot);
  // a plan point p → c·p.x - s·p.y, s·p.x + c·p.y (turned by rot in the floor), then moved
  return { rot, tx: mw.x - (c * mp[0] - s * mp[1]), tz: mw.z - (s * mp[0] + c * mp[1]), y: (wa.y + wb.y) / 2, lenP, lenW, err: lenW - lenP };
}
/** where a plan point lands in the room */
function arPlace(fit, p) {
  const c = Math.cos(fit.rot), s = Math.sin(fit.rot);
  return { x: c * p[0] - s * p[1] + fit.tx, y: fit.y, z: s * p[0] + c * p[1] + fit.tz };
}
/** the room's corners in order, and the two to tap first: the ends of its longest side */
function arCorners(room) {
  const P = room.poly;
  let best = 0, bi = 0;
  for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length], d = Math.hypot(q[0] - P[i][0], q[1] - P[i][1]); if (d > best) { best = d; bi = i; } }
  return { pts: P, a: bi, b: (bi + 1) % P.length };
}

Object.assign(app, {
  /** View → AR: explain what is needed, or set it up */
  async arStart() {
    if (!this.project) return;
    const sup = await arSupport();
    if (!sup.ok) { this.arNotHere(sup.why); return; }
    this.arSetup();
  },
  /** why AR can't start on this device, and how it can */
  arNotHere(why) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const lines = [];
    if (why === 'insecure') lines.push(t('AR needs the app opened from a secure web address (https://…): the web version once it is online. A file opened from your downloads can’t start AR.'));
    else if (ios) lines.push(t('iPhones and iPads (Safari) can’t show AR in a web page yet.'));
    else lines.push(t('This browser or device can’t start AR.'));
    lines.push(t('AR works on an Android phone in Chrome, with “Google Play Services for AR” installed (most phones from the last few years), with the app opened from its https address.'));
    UI.dialog({ title: t('AR: the plan in the real room'), body: h('div', { class: 'ar-why', id: 'ar-why' }, ...lines.map(x => h('p', null, x)),
      h('p', { class: 'note-muted' }, t('Then: stand in the empty room, tap two of its corners on the floor, and the planned walls, floors, kitchen, furniture, sockets and the pipes in the walls appear at true size.'))),
      actions: [{ label: t('Close'), value: null, kind: 'primary' }] });
  },
  /** choose the room and its two corners, then start */
  arSetup() {
    const p = this.project, plan = this.shownVersion().plan;
    let st = this.currentStorey() || sortedStoreys(p)[0];
    const sel = this.selection;
    const roomsOf = sid => plan.rooms.filter(r => r.storey === sid && r.poly.length >= 3).sort((a, b) => roomArea(b) - roomArea(a));
    let room = (sel && sel.type === 'room' && plan.rooms.find(r => r.id === sel.id)) || roomsOf(st.id)[0];
    if (room) st = getStorey(p, room.storey) || st;
    let cs = room ? arCorners(room) : null, pick = 0;
    const body = h('div', { class: 'ar-setup', id: 'ar-setup' });
    let close = null;
    const paint = () => {
      body.textContent = '';
      const ss = h('select', { class: 'select', id: 'ar-storey', 'aria-label': t('Storey') }, ...sortedStoreys(p).map(s2 => h('option', { value: s2.id, selected: s2.id === st.id }, s2.name)));
      ss.onchange = () => { st = getStorey(p, ss.value); room = roomsOf(st.id)[0]; cs = room ? arCorners(room) : null; pick = 0; paint(); };
      const rs = h('select', { class: 'select', id: 'ar-room', 'aria-label': t('Room') }, ...roomsOf(st.id).map(r => h('option', { value: r.id, selected: room && r.id === room.id }, r.name)));
      rs.onchange = () => { room = plan.rooms.find(r => r.id === rs.value); cs = arCorners(room); pick = 0; paint(); };
      body.append(h('div', { class: 'nf-row' }, ss, rs));
      if (!room) { body.appendChild(h('p', { class: 'note-muted' }, t('No rooms on this storey.'))); return; }
      body.appendChild(h('p', null, t('Stand in this room. You will tap two of its corners on the real floor, where the walls meet: A and B. Tap two other corners here to choose them.')));
      body.appendChild(this.arCornerSvg(room, cs, i => {
        // the first tap is A (B moves out of its way), the next one B
        if (pick === 0) { if (i === cs.b) cs.b = cs.a; cs.a = i; pick = 1; } else if (i !== cs.a) { cs.b = i; pick = 0; }
        paint();
      }));
      const A = cs.pts[cs.a], B = cs.pts[cs.b];
      body.appendChild(h('p', { class: 'note-muted', id: 'ar-ab' }, t('A to B in the plan: {d} mm – measure it in the room if you like: the app compares it with your taps.', { d: fmtMM(Math.hypot(B[0] - A[0], B[1] - A[1])) })));
    };
    paint();
    UI.dialog({ title: t('AR: the plan in the real room'), body, onOpen: (d, c) => { close = c; },
      actions: [{ label: t('Cancel'), value: null }, { label: t('Start AR'), value: 'go', kind: 'primary', icon: 'cube', validate: () => { if (!room) return false; this.arGo(st, room, cs); return true; } }] });
  },
  /** the room's outline with its corners to tap (A and B marked) */
  arCornerSvg(room, cs, onPick) {
    const P = room.poly, xs = P.map(q => q[0]), ys = P.map(q => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, hh = Math.max(...ys) - y0 || 1;
    const W = 300, H = 200, pad = 22, k = Math.min((W - 2 * pad) / w, (H - 2 * pad) / hh);
    const X = q => pad + (q[0] - x0) * k + ((W - 2 * pad) - w * k) / 2, Y = q => pad + (q[1] - y0) * k + ((H - 2 * pad) - hh * k) / 2;
    const svg = s('svg', { class: 'ar-corners', id: 'ar-corners', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('The room’s corners') });
    svg.appendChild(s('polygon', { points: P.map(q => X(q).toFixed(1) + ',' + Y(q).toFixed(1)).join(' '), class: 'ar-room' }));
    const A = P[cs.a], B = P[cs.b];
    svg.appendChild(s('line', { x1: X(A), y1: Y(A), x2: X(B), y2: Y(B), class: 'ar-ab-line' }));
    P.forEach((q, i) => {
      const lab = i === cs.a ? 'A' : i === cs.b ? 'B' : '';
      const g = s('g', { class: 'ar-c' + (lab ? ' on' : ''), 'data-i': i, transform: `translate(${X(q).toFixed(1)} ${Y(q).toFixed(1)})` });
      g.appendChild(s('circle', { r: lab ? 11 : 7 }));
      if (lab) g.appendChild(s('text', { y: 4, 'text-anchor': 'middle' }, lab));
      g.addEventListener('click', () => onPick(i));
      svg.appendChild(g);
    });
    return svg;
  },

  /** start the AR session: ask for it first (the tap must still count), build the storey meanwhile */
  async arGo(st, room, cs) {
    const p = this.project, ver = this.shownVersion();
    const overlay = h('div', { class: 'ar-overlay', id: 'ar-overlay' });
    document.body.appendChild(overlay);
    let session;
    const want = navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: overlay } });
    const host = h('div', { class: 'ar-host', 'aria-hidden': 'true', style: { position: 'fixed', left: '-12000px', top: '0', width: Math.max(320, innerWidth) + 'px', height: Math.max(320, innerHeight) + 'px', pointerEvents: 'none' } });
    document.body.appendChild(host);
    const v = new View3D(host, this, { mini: true, noBatch: true });
    const A = { st, room, cs, ver, v, host, overlay, session: null, hit: null, taps: [], fit: null, nudge: { rot: 0, along: 0, across: 0 },
      show: { walls: 'see', floors: true, furn: true, inst: true, pipes: true, changes: false }, clones: new Map(), ended: false };
    this._ar = A;
    try {
      session = await want;
    } catch (e) {
      console.warn('AR', e);
      this.arEnd();
      this.toast(t('AR could not start: {e}', { e: String(e && e.message || e) }));
      return;
    }
    A.session = session;
    if (!v.ok) { session.end(); return; }
    v.visible = false;                      // its own loop stays still: the AR loop draws
    v.camera.near = 0.03; v.camera.far = 200;
    this.arBuild();
    const r = v.renderer;
    r.setClearColor(0x000000, 0);
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local');
    await r.xr.setSession(session);
    // (after three.js's own handler: it puts the renderer back first)
    session.addEventListener('end', () => setTimeout(() => this.arEnd(), 0));
    // a tap on the screen (not on a button) places the corner too
    session.addEventListener('select', () => { if (this._ar && !this._ar.fit) this.arTap(); });
    A.space = r.xr.getReferenceSpace();
    try {
      A.viewer = await session.requestReferenceSpace('viewer');
      A.hitSource = await session.requestHitTestSource({ space: A.viewer });
    } catch (e) { console.warn('hit test', e); }
    // the dot on the floor
    A.reticle = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }));
    A.reticle.renderOrder = 10; A.reticle.visible = false;
    A.marks = new THREE.Group(); v.scene.add(A.reticle, A.marks);
    v.group.visible = false;
    this.arPaint();
    r.setAnimationLoop((time, frame) => this.arFrame(frame));
  },
  /** the storey as planned, built for AR: no ground, no ceilings, no batching (pieces are switched one by one) */
  arBuild() {
    const A = this._ar, p = this.project, v = A.v, st = A.st, ver = A.ver;
    const orig = getOriginal(p);
    const diff = A.show.changes && orig && orig.id !== ver.id ? diffPlans(orig.plan, ver.plan, p) : null;
    const ex = this.entryExtras(st, 'main', ver);
    const en = { storey: st, plan: ver.plan, offset: [0, 0], y: 0, diff, basePlan: orig ? orig.plan : ver.plan, versionId: ver.id, edit: false, bbox: this.storeyBBox([ver.plan], st, false), ...ex, pins: [], paths: null };
    v.build({ entries: [en], cut: false, ground: false, mode: 'view', light: 'day', ceilings: false, walk: false, plinth: false, windows: true, outside: true, roof: false, floors: true,
      shell: null, origPlan: orig ? orig.plan : null, scope: 'storey', sliceKey: '#ar', homeView: null, labels: false, selection: null, fitKey: 'ar' });
    v.scene.background = null;
    v.ground.visible = false;
    for (const L of v.labels || []) L.el.remove();
    v.labels = [];
    this.arPipes();
    this.arLook();
    if (A.fit) this.arApplyFit();
  },
  /** "pipes and cables" from the building diary on this storey: a coloured post with what runs there */
  arPipes() {
    const A = this._ar, v = A.v, st = A.st;
    const col = { water: '#2B7BD6', drain: '#6B5B4B', electric: '#E0A100', heating: '#D2372B', data: '#7A4FD0', vent: '#5FA8A0', gas: '#E8C400', other: '#888888' };
    const grp = new THREE.Group(); grp.userData.arPipes = true;
    for (const n of this.project.notes || []) {
      if (n.type !== 'hidden' || !n.at || n.at.storey !== st.id) continue;
      const c = col[(n.runs || [])[0] || 'other'] || col.other;
      const hgt = n.inside === 'ceiling' ? 2.5 : n.inside === 'floor' ? 0.02 : (n.at.h != null ? n.at.h : 1.0);
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthTest: false });
      const post = new THREE.Mesh(n.inside === 'floor' ? new THREE.CylinderGeometry(0.12, 0.12, 0.01, 24) : new THREE.SphereGeometry(0.05, 16, 12), m);
      post.position.set(n.at.x, hgt, n.at.y); post.renderOrder = 5; post.userData.arPipe = n.id;
      grp.add(post);
      const words = [(HIDDEN_IN.find(x => x[0] === n.inside) || HIDDEN_IN[0])[1], ...(n.runs || []).map(k => (HIDDEN_RUNS.find(x => x[0] === k) || ['', k])[1])].map(x => t(x)).join(' · ');
      const sp = arLabel(words || t('Pipes and cables'), c);
      sp.position.set(n.at.x, hgt + 0.16, n.at.y);
      grp.add(sp);
    }
    v.group.add(grp);
  },
  /** what shows, and how: see-through walls are copies of the materials (the views on the screen keep theirs) */
  arLook() {
    const A = this._ar, sh = A.show;
    // the outer leaf (brick) and the insulation of the outside walls: behind the real wall, not wanted in the room
    const behind = new Set(A.ver.plan.walls.filter(w => w.kind === 'insulation' || (w.kind === 'exterior' && w.leaf === 'outer')).map(w => w.id));
    A.v.group.traverse(o => {
      const u = o.userData || {};
      if (u.arPipes) { o.visible = sh.pipes; return; }
      if (!o.isMesh) return;
      if (u.furn != null) { o.visible = sh.furn; return; }
      if (u.point != null) { o.visible = sh.inst; return; }
      if (u.roomId != null && u.walk) { o.visible = sh.floors; return; }
      if (u.arPipe != null) return;
      // the concrete slab under the storey: the real floor is there already
      if (u.slab || (u.wallId && behind.has(u.wallId))) { o.visible = false; return; }
      // walls, doors, windows, stairs …
      o.visible = sh.walls !== 'off';
      const op = sh.walls === 'see' ? 0.45 : 1;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const out = list.map(m0 => {
        const base = m0.userData && m0.userData.arBase ? m0.userData.arBase : m0;
        let c = A.clones.get(base);
        if (!c) { c = base.clone(); c.userData = { ...(base.userData || {}), arBase: base }; A.clones.set(base, c); }
        c.transparent = op < 1 || base.transparent; c.opacity = op < 1 ? Math.min(base.opacity, op) : base.opacity; c.depthWrite = op >= 1 && base.depthWrite !== false;
        c.needsUpdate = true;
        return c;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
  },
  /** put the plan where the taps say (plus the fine-tuning) */
  arApplyFit() {
    const A = this._ar, f0 = A.fit, g = A.v.group, n = A.nudge;
    const rot = f0.rot + n.rot * Math.PI / 180;
    const pa = A.cs.pts[A.cs.a], pb = A.cs.pts[A.cs.b], mp = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    // the shift along A→B and across it, in the room
    const angW = f0.rot + Math.atan2(pb[1] - pa[1], pb[0] - pa[0]), ux = Math.cos(angW), uz = Math.sin(angW);
    // (turned about the middle of A–B, not about the plan's origin)
    const m0 = arPlace(f0, mp), c = Math.cos(rot), s2 = Math.sin(rot);
    const tx = m0.x - (c * mp[0] - s2 * mp[1]) + ux * n.along - uz * n.across, tz = m0.z - (s2 * mp[0] + c * mp[1]) + uz * n.along + ux * n.across;
    A.cur = { rot, tx, tz, y: f0.y };
    g.position.set(tx, f0.y, tz);
    g.rotation.set(0, -rot, 0);
    g.updateMatrixWorld(true);
    g.visible = true;
  },
  /** every AR frame: the dot follows the floor in the middle of the screen */
  arFrame(frame) {
    const A = this._ar;
    if (!A || A.ended) return;
    const v = A.v;
    if (A.hitSource && frame && A.space) {
      const res = frame.getHitTestResults(A.hitSource);
      if (res && res.length) {
        const pose = res[0].getPose(A.space);
        if (pose) {
          const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
          const pos = new THREE.Vector3().setFromMatrixPosition(m);
          A.hit = { x: pos.x, y: pos.y, z: pos.z };
          A.reticle.position.copy(pos); A.reticle.visible = A.taps.length < 2;
        }
      } else { A.hit = null; A.reticle.visible = false; }
    }
    const btn = A.overlay.querySelector('#ar-place');
    if (btn) btn.disabled = !A.hit;
    v.renderer.render(v.scene, v.camera);
  },
  /** "Place A" / "Place B" */
  arTap() {
    const A = this._ar;
    if (!A || !A.hit || A.taps.length >= 2) return;
    A.taps.push({ ...A.hit });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshBasicMaterial({ color: A.taps.length === 1 ? 0x0e6f78 : 0xd2372b, depthTest: false }));
    dot.position.set(A.hit.x, A.hit.y + 0.01, A.hit.z); dot.renderOrder = 11;
    A.marks.add(dot);
    if (A.taps.length === 2) {
      A.fit = arFit(A.cs.pts[A.cs.a], A.cs.pts[A.cs.b], A.taps[0], A.taps[1]);
      A.nudge = { rot: 0, along: 0, across: 0 };
      this.arApplyFit();
    }
    this.arPaint();
  },
  /** tap the corners again */
  arAgain() {
    const A = this._ar;
    A.taps = []; A.fit = null; A.cur = null; A.marks.clear(); A.v.group.visible = false;
    this.arPaint();
  },
  arNudge(kind, d) {
    const A = this._ar;
    if (!A.fit) return;
    A.nudge[kind] += d;
    this.arApplyFit();
    this.arPaint();
  },
  /** the buttons and words over the camera picture */
  arPaint() {
    const A = this._ar;
    if (!A) return;
    const o = A.overlay;
    o.textContent = '';
    const stop = e => { e.preventDefault(); };
    const bar = h('div', { class: 'ar-top' });
    const L = ['A', 'B'][A.taps.length];
    if (!A.fit) {
      bar.append(h('div', { class: 'ar-msg', id: 'ar-msg' }, t('{room}: point the dot at corner {c} on the floor, where the walls meet, and tap “Place {c}”.', { room: A.room.name, c: L })),
        this.arMiniMap(A.taps.length));
    } else {
      const e = A.fit.err, off = Math.abs(e) > AR_WARN;
      bar.append(h('div', { class: 'ar-msg' + (off ? ' warn' : ''), id: 'ar-msg' },
        t('Your taps are {w} mm apart, the plan says {p} mm ({d}).', { w: fmtMM(A.fit.lenW), p: fmtMM(A.fit.lenP), d: (Math.abs(e) < 0.0005 ? '±' : e >= 0 ? '+' : '−') + fmtMM(Math.abs(e)) + ' mm' }) + ' ' + (off ? t('That is a lot: tap the corners again?') : t('Walk around and look.'))));
    }
    o.appendChild(bar);
    const bottom = h('div', { class: 'ar-bottom' });
    if (!A.fit) {
      bottom.appendChild(h('button', { class: 'btn primary ar-big', id: 'ar-place', disabled: !A.hit, onclick: () => this.arTap() }, icon('target'), t('Place {c}', { c: L })));
    } else {
      const sh = A.show;
      const chip = (id, on, label, fn) => h('button', { class: 'chip ar-chip', id, 'aria-pressed': String(!!on), onclick: fn }, label);
      const wallsLab = { see: t('Walls: see-through'), solid: t('Walls: solid'), off: t('Walls: off') }[sh.walls];
      bottom.appendChild(h('div', { class: 'ar-chips' },
        chip('ar-walls', sh.walls !== 'off', wallsLab, () => { sh.walls = { see: 'solid', solid: 'off', off: 'see' }[sh.walls]; this.arLook(); this.arPaint(); }),
        chip('ar-floors', sh.floors, t('Floors'), () => { sh.floors = !sh.floors; this.arLook(); this.arPaint(); }),
        chip('ar-furn', sh.furn, t('Kitchen & furniture'), () => { sh.furn = !sh.furn; this.arLook(); this.arPaint(); }),
        chip('ar-inst', sh.inst, t('Electrics'), () => { sh.inst = !sh.inst; this.arLook(); this.arPaint(); }),
        chip('ar-pipes', sh.pipes, t('Pipes and cables'), () => { sh.pipes = !sh.pipes; this.arLook(); this.arPaint(); }),
        chip('ar-changes', sh.changes, t('Changes'), () => { sh.changes = !sh.changes; this.arBuild(); this.arPaint(); })));
      const n = A.nudge;
      bottom.appendChild(h('div', { class: 'ar-nudge', id: 'ar-nudge' },
        h('button', { class: 'btn sm', id: 'ar-rot-l', onclick: () => this.arNudge('rot', -AR_NUDGE_DEG), 'aria-label': t('Turn left') }, '⟲'),
        h('button', { class: 'btn sm', id: 'ar-rot-r', onclick: () => this.arNudge('rot', AR_NUDGE_DEG), 'aria-label': t('Turn right') }, '⟳'),
        h('button', { class: 'btn sm', id: 'ar-along-m', onclick: () => this.arNudge('along', -AR_NUDGE_M), 'aria-label': t('Towards A') }, '◀ A'),
        h('button', { class: 'btn sm', id: 'ar-along-p', onclick: () => this.arNudge('along', AR_NUDGE_M), 'aria-label': t('Towards B') }, 'B ▶'),
        h('button', { class: 'btn sm', id: 'ar-across-m', onclick: () => this.arNudge('across', -AR_NUDGE_M), 'aria-label': t('Shift one way') }, '▲'),
        h('button', { class: 'btn sm', id: 'ar-across-p', onclick: () => this.arNudge('across', AR_NUDGE_M), 'aria-label': t('Shift the other way') }, '▼'),
        h('span', { class: 'ar-nudge-v' }, `${fmtDec(n.rot.toFixed(1))}° · ${Math.round(n.along * 1000)} / ${Math.round(n.across * 1000)} mm`)));
    }
    bottom.appendChild(h('div', { class: 'ar-row' },
      A.taps.length ? h('button', { class: 'btn', id: 'ar-again', onclick: () => this.arAgain() }, icon('restore'), t('Tap the corners again')) : null,
      h('button', { class: 'btn', id: 'ar-exit', onclick: () => this.arExit() }, icon('close'), t('Stop AR'))));
    o.appendChild(bottom);
    // taps on the buttons are not taps in the room
    for (const b of o.querySelectorAll('button')) b.addEventListener('beforexrselect', stop);
  },
  /** the room seen from above, with the corner to tap now */
  arMiniMap(next) {
    const A = this._ar;
    const svg = this.arCornerSvg(A.room, A.cs, () => {});
    svg.classList.add('ar-mini');
    svg.removeAttribute('id');
    const cur = svg.querySelector(`.ar-c[data-i="${next === 0 ? A.cs.a : A.cs.b}"]`);
    if (cur) cur.classList.add('now');
    return svg;
  },
  arExit() {
    const A = this._ar;
    if (!A) return;
    if (A.session && !A.ended) { try { A.session.end(); } catch (e) { this.arEnd(); } } else this.arEnd();
  },
  /** after the session (Stop AR, the phone's back button, an error): everything away */
  arEnd() {
    const A = this._ar;
    if (!A || A.ended) return;
    A.ended = true;
    try { if (A.hitSource && A.hitSource.cancel) A.hitSource.cancel(); } catch (e) { /* gone */ }
    try { A.v.renderer && A.v.renderer.setAnimationLoop(null); } catch (e) { /* gone */ }
    for (const c of A.clones.values()) c.dispose();
    A.clones.clear();
    try { A.v.destroy(); } catch (e) { /* gone */ }
    A.host.remove(); A.overlay.remove();
    this._ar = null;
    this.lastAr = { fit: A.fit, cur: A.cur, taps: A.taps, room: A.room.id };
  },
});

/** a text label that always faces you (a canvas picture on a sprite) */
function arLabel(text, color) {
  const fs = 34, pad = 14;
  const cv = makeCanvas(8, 8), g = cv.getContext('2d');
  g.font = `600 ${fs}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2, hh = fs + pad * 1.4;
  cv.width = w; cv.height = hh;
  g.font = `600 ${fs}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(20,24,28,0.82)'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, hh, 14) : g.rect(0, 0, w, hh); g.fill();
  g.fillStyle = color; g.fillRect(0, 0, 10, hh);
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, pad + 6, hh / 2 + 1);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const k = 0.0016;
  sp.scale.set(w * k, hh * k, 1); sp.renderOrder = 6;
  return sp;
}
