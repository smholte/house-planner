/* ───────────── walk.js — walking through the house (View mode)
   Free walk: W A S D / arrow keys and dragging to look (PC), two joysticks (phone).
   Path walk: walking paths drawn in 2D (they may branch and go up the stairs); look around freely and move by
   tapping the next point or the arrows on the floor, like Street View.
   Walls (with closed doors) and furniture stop you; walking into a closed door opens it (outside doors too, so you can
   go out into the garden); floors and stair treads carry you up and down. ───────────── */

const WALK_R = 0.22;          // half the width of a person
const STEP_UP = 0.42;         // the highest step you take without noticing (a stair tread is ~0.19 m)

class Walker {
  constructor(view, app, init = {}) {
    this.view = view;
    this.app = app;
    this.keys = new Set();
    this.joy = { mx: 0, my: 0, lx: 0, ly: 0 };
    this.mode = app.walking.mode === 'path' ? 'path' : 'free';
    this.pitch = -0.06;
    this.yaw = 0;
    this.feet = 0;
    this.x = 0; this.y = 0;
    this.node = null;
    this.anim = null;
    this.collect();
    const cam = view.camera;
    this.saved = { fov: cam.fov, near: cam.near, far: cam.far };
    cam.fov = 72; cam.near = 0.05; cam.far = 400; cam.updateProjectionMatrix();
    cam.rotation.order = 'YXZ';
    view.controls.enabled = false;
    view.host.classList.add('walking');
    this.arrows = new THREE.Group();
    view.scene.add(this.arrows);
    this.bindLook();
    this.buildHud();
    if (init && init.x != null) { this.x = init.x; this.y = init.y; this.yaw = init.yaw || 0; this.pitch = init.pitch ?? -0.06; this.feet = init.feet ?? this.groundAt(init.x, init.y, (init.feet ?? 0) + 1) ?? 0; if (init.mode) this.mode = init.mode; }
    else this.placeAtStart();
    if (this.mode === 'path') this.enterPath();
    this.updateCamera();
  }

  get person() { const p = this.app.project; return p.people.find(x => x.id === this.app.walking.personId) || p.people[0]; }

  destroy() {
    const v = this.view;
    v.controls.enabled = true;
    const cam = v.camera;
    cam.fov = this.saved.fov; cam.near = this.saved.near; cam.far = this.saved.far; cam.rotation.order = 'XYZ'; cam.updateProjectionMatrix();
    v.host.classList.remove('walking');
    v.scene.remove(this.arrows);
    this.arrows.traverse(o => o.geometry && o.geometry.dispose());
    for (const [el, ev, fn, opt] of this.listeners) el.removeEventListener(ev, fn, opt);
    if (document.pointerLockElement) try { document.exitPointerLock(); } catch (_) { /* fine */ }
    if (this.hud) this.hud.remove();
    if (this.hudMid) this.hudMid.remove();
  }

  /* ───────── what the house is made of, for walking ───────── */
  collect() {
    const v = this.view, app = this.app, p = app.project;
    this.walkables = [];
    v.group.traverse(o => { if (o.isMesh && o.userData && o.userData.walk) this.walkables.push(o); });
    const plan = app.shownVersion().plan;
    const storeys = sortedStoreys(p);
    this.storeys = storeys;
    // wall pieces that block: solid parts, windows, and doors that are closed
    this.walls = [];
    for (const w of plan.walls) {
      const st = getStorey(p, w.storey);
      if (!st) continue;
      const L = wallLen(w);
      if (L < 0.02) continue;
      const blocks = [];
      const parts = wallParts(w, openingsOf(plan, w.id));
      for (const [a, b] of parts.solids) blocks.push([a, b]);
      for (const hl of parts.holes) {
        const op = hl.op;
        // windows stop you; a door lets you through when it is open – an outside door too (its layers – inner leaf,
        // insulation, brick – follow the door); an opening without a door lets you through
        if (op.kind === 'window') { blocks.push([hl.s, hl.e]); continue; }
        const door = this.doorOf(plan, w, op);
        if (!door) continue;
        if (!this.canOpen(plan, door) || app.isDoorClosed(door.id)) blocks.push([hl.s, hl.e, door.id]);
      }
      const d = wallDir(w), H = wallHeight(w, st);
      // (a closed outside door opens when you walk into it; a closed inside door stays shut – tap it to open it)
      for (const [a, b, door] of blocks) this.walls.push({ a: V.add(w.a, V.mul(d, a)), b: V.add(w.a, V.mul(d, b)), t: w.t, y0: st.elevation, y1: st.elevation + H, sid: st.id, door: door && w.kind !== 'interior' ? door : null, shut: door || null });
    }
    // the garden: low walls, hedges, fences, the quay and the gate stop you too (a closed gate opens when you walk
    // into it, like an outside door)
    if (p.site && plan.garden && app.settings.garden !== false) {
      for (const b of gardenBlocks(plan.garden, p.site, id => !app.isDoorClosed(id))) this.walls.push({ ...b, sid: null, door: b.door || null, shut: b.door || null, garden: true });
    }
    // furniture you would bump into
    this.furn = [];
    const lay = app.activeLayout();
    if (lay && app.settings.furniture !== false) for (const f of lay.items) {
      const T = furnType(f), st = getStorey(p, f.storey);
      if (!st || T.flat || T.high || f.h < 0.25 || T.light && T.kind !== 'floorlamp') continue;
      this.furn.push({ f, y0: st.elevation, y1: st.elevation + furnZ(f) + f.h });
    }
    this.ray = new THREE.Raycaster();
    this.ray.far = 4;
  }
  /** the door that closes this opening: itself, or the door of the outside wall it is a layer of */
  doorOf(plan, w, op) {
    if (op.kind === 'door' && !op.leaf) return op;
    if (w.kind === 'interior') return null;
    const asm = assemblyOpenings(plan, op);
    const own = asm.find(o => o.kind === 'door' && !o.leaf);
    if (own) return own;
    // a layer of an outside wall (brick, insulation) whose opening belongs to a door further along the layers
    for (const o of asm) { const more = assemblyOpenings(plan, o).find(x => x.kind === 'door' && !x.leaf); if (more) return more; }
    return null;
  }
  /** can it be opened: doors drawn by the app, and the builder's outside doors that swing */
  canOpen(plan, door) {
    const app = this.app, w = plan.walls.find(x => x.id === door.wall);
    if (!w || w.kind === 'interior' || !app.shell || !app.shell.storeys[w.storey]) return true;
    return app.isOuterDoor(door.id) || !isModelDoor(plan, w, door);
  }
  bothSidesInside(plan, w, op) {
    const c = V.add(w.a, V.mul(wallDir(w), op.pos)), n = V.perp(wallDir(w));
    const inRoom = q => plan.rooms.some(r => r.storey === w.storey && pointInPolygon(q, r.poly));
    return inRoom(V.add(c, V.mul(n, w.t / 2 + 0.5))) && inRoom(V.sub(c, V.mul(n, w.t / 2 + 0.5)));
  }
  elev(sid) { const st = getStorey(this.app.project, sid); return st ? st.elevation : 0; }
  /** the storey you stand on */
  storeyAt(feet) { let best = this.storeys[0]; for (const st of this.storeys) if (st.elevation <= feet + 0.35) best = st; return best; }

  /** the floor under a plan point, searching down from a height */
  groundAt(x, y, from) {
    this.ray.set(new THREE.Vector3(x, from, y), new THREE.Vector3(0, -1, 0));
    this.ray.far = 6;
    const hit = this.ray.intersectObjects(this.walkables, false).find(hh => !this.view.isClipped(hh.point));
    return hit ? hit.point.y : null;
  }

  /** stand inside the front door, looking into the house */
  placeAtStart() {
    const app = this.app, p = app.project, plan = app.shownVersion().plan;
    const st0 = this.storeys[0];
    const roomAt = (q, sid) => plan.rooms.filter(r => r.storey === sid && pointInPolygon(q, r.poly)).sort((a, b) => roomArea(a) - roomArea(b))[0] || null;
    const cands = [];
    for (const op of plan.openings) {
      if (op.kind !== 'door') continue;
      const w = plan.walls.find(x => x.id === op.wall);
      if (!w || w.storey !== st0.id || w.kind === 'interior') continue;
      const c = V.add(w.a, V.mul(wallDir(w), op.pos)), n = V.perp(wallDir(w));
      for (const sg of [1, -1]) {
        const q = V.add(c, V.mul(n, sg * (w.t / 2 + 0.55)));
        const r = roomAt(q, st0.id);
        if (r) cands.push({ q, dir: V.mul(n, sg), r, score: (/entree|entrée|hal\b|hall|entrance|gang/i.test(r.name) ? 0 : 1) });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    let q, dir;
    if (cands.length) { q = cands[0].q; dir = cands[0].dir; }
    else {
      const big = plan.rooms.filter(r => r.storey === st0.id).sort((a, b) => roomArea(b) - roomArea(a))[0];
      q = big ? labelPoint(big.poly, roomHoles(plan, big)) : [0, 0];
      dir = [0, -1];
    }
    this.x = q[0]; this.y = q[1];
    this.yaw = Math.atan2(-dir[0], -dir[1]);
    const g = this.groundAt(q[0], q[1], st0.elevation + 1.2);
    this.feet = g != null ? g : st0.elevation;
  }

  /* ───────── looking around ───────── */
  bindLook() {
    const el = this.view.renderer.domElement;
    this.listeners = [];
    this.look = { dx: 0, dy: 0 };            // mouse movement still to be applied (smoothed in tick)
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this.listeners.push([t, ev, fn, opt]); };
    const sens = () => clamp(+(this.app.settings.walkLook || 1), 0.3, 3);
    // turning the head: mouse to the right looks to the right (like a game); dragging on a touch screen moves the
    // world with the finger (like a photo)
    const addLook = (dx, dy, kind) => {
      const k = (kind === 'touch' ? 0.0055 : 0.0026 * sens()) * (this.view.camera.fov / 72);
      if (kind === 'touch') { this.look.dx += dx * k; this.look.dy += dy * k; }
      else { const inv = this.app.settings.walkInvert ? -1 : 1; this.look.dx -= dx * k; this.look.dy -= dy * k * inv; }
      this.view.needs = true;
      this.moved = true;
    };
    let drag = null;
    const locked = () => document.pointerLockElement === el;
    on(el, 'contextmenu', e => e.preventDefault());
    on(el, 'pointerdown', e => {
      if (locked()) return;
      if (e.pointerType === 'mouse' && e.button === 2) {
        // hold the right button: look around with the mouse (the pointer is hidden and held in place)
        this.lockForDrag = true;
        try { const r = el.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => el.requestPointerLock()); } catch (_) { try { el.requestPointerLock(); } catch (__) { /* no lock: drag instead */ } }
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: 'mouse' };
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: e.pointerType === 'mouse' ? 'mouse' : 'touch', sx: e.clientX, sy: e.clientY };
    });
    on(el, 'pointermove', e => {
      if (locked()) { addLook(e.movementX || 0, e.movementY || 0, 'mouse'); return; }
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      addLook(dx, dy, drag.kind);
    });
    const end = e => {
      if (drag && e.pointerId === drag.id) drag = null;
      if (this.lockForDrag && e.button === 2) { this.lockForDrag = false; if (locked()) document.exitPointerLock(); }
    };
    on(el, 'pointerup', end);
    on(el, 'pointercancel', end);
    on(document, 'mouseup', e => { if (this.lockForDrag && e.button === 2) { this.lockForDrag = false; if (locked()) document.exitPointerLock(); } });
    on(document, 'pointerlockchange', () => { this.lockedAt = performance.now(); if (!locked()) this.lockForDrag = false; this.renderLockHint(); });
    on(el, 'wheel', e => { e.preventDefault(); }, { passive: false });
  }
  /** mouse look until Esc (L, or the button in the walking bar) */
  toggleMouseLook() {
    const el = this.view.renderer.domElement;
    if (document.pointerLockElement === el) { document.exitPointerLock(); return; }
    this.lockForDrag = false;
    try { const r = el.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => el.requestPointerLock()); } catch (_) { try { el.requestPointerLock(); } catch (__) { /* not here */ } }
  }
  renderLockHint() {
    const el = this.view.renderer.domElement, locked = document.pointerLockElement === el;
    if (this.lockHint) this.lockHint.hidden = !(locked && !this.lockForDrag);
    // a small circle in the middle while the view follows the mouse (L, or holding the right button)
    if (this.crosshair) this.crosshair.hidden = !locked;
  }

  buildHud() {
    const host = this.view.host;
    const touch = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 860px)').matches;
    this.hud = h('div', { class: 'walk-hud' + (touch ? ' touch' : '') });
    if (touch && this.mode === 'free') {
      const stick = (cls, set) => {
        const knob = h('div', { class: 'joy-knob' });
        const pad = h('div', { class: 'joy ' + cls, 'aria-hidden': 'true' }, knob);
        let id = null, c = null;
        const move = e => {
          const R = 42;
          let dx = e.clientX - c[0], dy = e.clientY - c[1];
          const L = Math.hypot(dx, dy);
          if (L > R) { dx *= R / L; dy *= R / L; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          set(dx / R, dy / R);
        };
        pad.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); id = e.pointerId; const r = pad.getBoundingClientRect(); c = [r.left + r.width / 2, r.top + r.height / 2]; try { pad.setPointerCapture(id); } catch (_) { /* fine */ } move(e); });
        pad.addEventListener('pointermove', e => { if (e.pointerId === id) { e.stopPropagation(); move(e); } });
        const up = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; set(0, 0); };
        pad.addEventListener('pointerup', up);
        pad.addEventListener('pointercancel', up);
        return pad;
      };
      this.hud.append(
        stick('joy-move', (x, y) => { this.joy.mx = x; this.joy.my = y; }),
        stick('joy-look', (x, y) => { this.joy.lx = x; this.joy.ly = y; }));
    } else if (this.mode === 'free') {
      this.hud.append(h('div', { class: 'walk-help' }, t('W A S D or the arrow keys to walk, drag (or hold the right mouse button) to look around, L for mouse look, Shift to go faster, Esc to stop.')));
    } else {
      this.hud.append(h('div', { class: 'walk-help' }, t('Drag to look around. Tap an arrow on the floor or a ring further on to walk there.')));
    }
    host.appendChild(this.hud);
    if (!touch) {
      // over the whole view (the bar at the bottom has no height of its own): the circle in the middle, the hint
      this.lockHint = h('div', { class: 'walk-lock-hint', hidden: true }, t('Mouse look: move the mouse to look around · Esc to release the mouse'));
      this.crosshair = h('div', { class: 'walk-cross', hidden: true, 'aria-hidden': 'true' });
      this.hudMid = h('div', { class: 'walk-mid' }, this.lockHint, this.crosshair);
      host.appendChild(this.hudMid);
      this.renderLockHint();
    }
  }

  /* ───────── every frame ───────── */
  tick(dt) {
    // following a route (tour.js): it moves you; you can still look around at a stop
    if (this.tour) {
      let ch = this.tourTick(dt);
      if (this.look && (this.look.dx || this.look.dy)) { this.yaw += this.look.dx; this.pitch = clamp(this.pitch + this.look.dy, -1.45, 1.45); this.look.dx = this.look.dy = 0; this.moved = true; }
      if (this.moved) { this.moved = false; ch = true; this.updateCamera(); }
      return ch;
    }
    let changed = false;
    if (this.moved) { this.moved = false; changed = true; }
    // looking around with the mouse: eased over a few frames, the same at any frame rate
    if (this.look && (Math.abs(this.look.dx) > 1e-5 || Math.abs(this.look.dy) > 1e-5)) {
      const k = this.app.settings.walkSmooth === false ? 1 : 1 - Math.exp(-dt * 28);
      const ax = this.look.dx * k, ay = this.look.dy * k;
      this.look.dx -= ax; this.look.dy -= ay;
      this.yaw += ax; this.pitch = clamp(this.pitch + ay, -1.45, 1.45);
      changed = true;
    }
    const person = this.person;
    // turning with keys / the look stick
    const turn = (this.keys.has('ArrowLeft') || this.keys.has('q') ? 1 : 0) - (this.keys.has('ArrowRight') || this.keys.has('e') ? 1 : 0);
    if (turn) { this.yaw += turn * dt * 1.7; changed = true; }
    if (this.joy.lx || this.joy.ly) { this.yaw -= this.joy.lx * dt * 2.0; this.pitch = clamp(this.pitch - this.joy.ly * dt * 1.4, -1.35, 1.35); changed = true; }
    if (this.mode === 'free') {
      const fwd = (this.keys.has('w') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('s') || this.keys.has('ArrowDown') ? 1 : 0) - this.joy.my;
      const side = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0) + this.joy.mx;
      if (Math.abs(fwd) > 0.05 || Math.abs(side) > 0.05) {
        const sp = (person.speed || 1.3) * (this.keys.has('Shift') ? 2 : 1);
        const f = [-Math.sin(this.yaw), -Math.cos(this.yaw)], r = [Math.cos(this.yaw), -Math.sin(this.yaw)];
        let mv = V.add(V.mul(f, fwd), V.mul(r, side));
        const L = Math.hypot(mv[0], mv[1]);
        if (L > 1) mv = V.mul(mv, 1 / L);
        this.stepTo(this.x + mv[0] * sp * dt, this.y + mv[1] * sp * dt, dt);
        changed = true;
      }
    } else if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + (person.speed || 1.3) * dt / Math.max(0.2, a.len));
      const q = V.lerp(a.from, a.to, a.t);
      this.x = q[0]; this.y = q[1];
      const g = this.groundAt(q[0], q[1], this.feet + STEP_UP + 0.05);
      if (g != null) this.feet += (g - this.feet) * Math.min(1, dt * 14);
      if (a.t >= 1) {
        if (a.toFeet != null && Math.abs(a.toFeet - this.feet) > 0.5) this.feet = a.toFeet;
        const prev = this.node;
        this.node = a.toNode; this.anim = null;
        // points on a stair are passed without stopping
        const here = this.graph().nodes.find(n => n.id === this.node);
        const nb = this.neighbours(this.node);
        if (here && here.stair && nb.length === 2) { const next = nb.find(n => n.id !== prev); if (next) { this.goToNode(next); return true; } }
        this.showArrows();
        this.app.onWalkMoved();
      }
      changed = true;
    }
    if (changed) this.updateCamera();
    return changed;
  }

  /** move to x, y if nothing is in the way: slide along walls, climb stairs, don't fall into the stairwell */
  stepTo(nx, ny, dt) {
    const body0 = this.feet + 0.3, body1 = this.feet + (this.person.eye || 1.65);
    let p = [nx, ny];
    for (let it = 0; it < 3; it++) {
      for (const w of this.walls) {
        if (w.y1 < body0 || w.y0 > body1) continue;
        const pr = projectOnSegment(p, w.a, w.b);
        const need = WALK_R + w.t / 2;
        if (pr.d < need) {
          // walking into a closed outside door: it opens (once, then you walk on into the garden)
          if (w.door && !this._opening && pr.t > 0.02 && pr.t < 0.98) { this._opening = w.door; setTimeout(() => { this._opening = null; }, 600); this.app.setDoorClosed(w.door, false); }
          let n = V.sub(p, pr.point);
          const L = Math.hypot(n[0], n[1]);
          if (L < 1e-6) { const dd = V.norm(V.sub(w.b, w.a)); n = V.perp(dd); } else n = V.mul(n, 1 / L);
          p = V.add(pr.point, V.mul(n, need + 0.001));
        }
      }
      for (const o of this.furn) {
        if (o.y1 < body0 || o.y0 > body1) continue;
        const f = o.f, q = furnLocal(f, p);
        const cx = clamp(q[0], -f.w / 2, f.w / 2), cy = clamp(q[1], -f.d / 2, f.d / 2);
        const dx = q[0] - cx, dy = q[1] - cy, d = Math.hypot(dx, dy);
        if (d < WALK_R) {
          let lq;
          if (d < 1e-6) { const ex = f.w / 2 - Math.abs(q[0]), ey = f.d / 2 - Math.abs(q[1]); lq = ex < ey ? [Math.sign(q[0] || 1) * (f.w / 2 + WALK_R), q[1]] : [q[0], Math.sign(q[1] || 1) * (f.d / 2 + WALK_R)]; }
          else lq = [cx + dx / d * (WALK_R + 0.001), cy + dy / d * (WALK_R + 0.001)];
          p = furnToPlan(f, lq);
        }
      }
    }
    const g = this.groundAt(p[0], p[1], this.feet + STEP_UP);
    if (g == null || g < this.feet - 0.5) return false;
    this.x = p[0]; this.y = p[1];
    this.feet += (g - this.feet) * Math.min(1, dt * 14);
    if (Math.abs(g - this.feet) < 0.004) this.feet = g;
    return true;
  }

  updateCamera() {
    const cam = this.view.camera;
    cam.position.set(this.x, this.feet + (this.person.eye || 1.65), this.y);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    this.view.needs = true;
  }

  state() { return { x: +this.x.toFixed(3), y: +this.y.toFixed(3), feet: +this.feet.toFixed(3), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), mode: this.mode, storey: this.storeyAt(this.feet).id }; }

  /* ───────── path walk ───────── */
  graph() { return this.app.project.walk; }
  nodeFeet(n) { const e = this.elev(n.storey); const g = this.groundAt(n.x, n.y, e + 1.0); return g != null ? g : e; }
  enterPath() {
    const W = this.graph();
    if (!W.nodes.length) { this.app.toast(t('No walking paths yet. Make them in the details (or draw them in 2D with the Paths tool).'), { ms: 6000 }); this.showArrows(); return; }
    // the point nearest to where you stand (same storey first)
    const sid = this.storeyAt(this.feet).id;
    const near = W.nodes.slice().sort((a, b) => ((a.storey !== sid) - (b.storey !== sid)) || (V.dist([a.x, a.y], [this.x, this.y]) - V.dist([b.x, b.y], [this.x, this.y])))[0];
    this.goToNode(near, true);
  }
  neighbours(id) {
    const W = this.graph(), out = [];
    for (const [a, b] of W.edges) { if (a === id) out.push(b); else if (b === id) out.push(a); }
    return out.map(x => W.nodes.find(n => n.id === x)).filter(Boolean);
  }
  goToNode(n, jump) {
    if (!n) return;
    if (jump) { this.x = n.x; this.y = n.y; this.feet = this.nodeFeet(n); this.node = n.id; this.anim = null; this.showArrows(); this.updateCamera(); return; }
    const from = [this.x, this.y], to = [n.x, n.y];
    this.anim = { from, to, t: 0, len: Math.max(0.3, V.dist(from, to)), toNode: n.id, toFeet: this.nodeFeet(n) };
    this.arrows.clear();
    this.view.needs = true;
  }
  /** arrows on the floor towards each next point, and a ring on each next point */
  showArrows() {
    const g = this.arrows;
    g.traverse(o => o.geometry && o.geometry.dispose());
    g.clear();
    if (this.mode !== 'path' || !this.node) return;
    const mat0 = this._amat || (this._amat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, depthTest: false }));
    const ring0 = this._rmat || (this._rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--accent') || '#0B6E76'), transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    const shape = new THREE.Shape([new THREE.Vector2(0, 0.32), new THREE.Vector2(0.26, 0.02), new THREE.Vector2(0.12, 0.02), new THREE.Vector2(0.12, -0.24), new THREE.Vector2(-0.12, -0.24), new THREE.Vector2(-0.12, 0.02), new THREE.Vector2(-0.26, 0.02)]);
    for (const n of this.neighbours(this.node)) {
      const dir = V.norm(V.sub([n.x, n.y], [this.x, this.y]));
      if (!isFinite(dir[0])) continue;
      const ang = Math.atan2(dir[0], dir[1]);
      const a = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat0);
      a.rotation.set(-Math.PI / 2, 0, 0);
      const holder = new THREE.Group();
      holder.add(a);
      holder.position.set(this.x + dir[0] * 1.1, this.feet + 0.03, this.y + dir[1] * 1.1);
      // the arrow points along the path (plan +y is world +z)
      holder.rotation.y = ang + Math.PI;
      a.rotation.z = 0;
      holder.userData.goto = n.id;
      a.userData.goto = n.id;
      a.renderOrder = 10;
      g.add(holder);
      const nf = this.nodeFeet(n);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), ring0);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(n.x, nf + 0.03, n.y);
      ring.userData.goto = n.id;
      ring.renderOrder = 10;
      g.add(ring);
      // a big invisible target around the ring, easier to tap
      const hit = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ visible: false }));
      hit.rotation.x = -Math.PI / 2; hit.position.copy(ring.position); hit.userData.goto = n.id;
      g.add(hit);
    }
    this.view.needs = true;
  }
  onTap(e) {
    if (this.mode !== 'path') return false;
    const ray = this.view.rayFrom(e);
    const hit = ray.intersectObjects(this.arrows.children, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && !o.userData.goto) o = o.parent;
      const n = o && this.graph().nodes.find(x => x.id === o.userData.goto);
      if (n) { this.goToNode(n); return true; }
    }
    return false;
  }
  /** Up arrow / W in path walk: the next point most in the direction you look */
  stepForward(back) {
    if (!this.node || this.anim) return;
    const f = [-Math.sin(this.yaw), -Math.cos(this.yaw)];
    let best = null, bd = back ? 1 : -0.3;
    for (const n of this.neighbours(this.node)) {
      const dir = V.norm(V.sub([n.x, n.y], [this.x, this.y]));
      const dot = V.dot(dir, f);
      if (back ? dot < bd : dot > bd) { bd = dot; best = n; }
    }
    if (best) this.goToNode(best);
  }
}

Object.assign(View3D.prototype, {
  startWalker(app, init) { this.stopWalker(); this.walker = new Walker(this, app, init); this.needs = true; return this.walker; },
  stopWalker() { if (this.walker) { this.walker.destroy(); this.walker = null; } },
});

/* ───────── the walking side of the app ───────── */
Object.assign(app, {
  startWalk(state) {
    const p = this.project;
    if (!p) return;
    if (this.mode !== 'view') { this.mode = 'view'; this.tool = 'select'; }
    if (this.comparing) { this.sideBySide = false; this.swipe = false; }
    const person = (p.people.find(x => x.id === (this.walking && this.walking.personId)) || p.people[0]);
    this.walking = { mode: state && state.mode ? state.mode : (this.settings.walkMode === 'path' ? 'path' : 'free'), personId: person.id };
    this._preWalk = this._preWalk || { dim: this.view.dim, scope: this.view.scope };
    this.view.dim = '3d'; this.view.scope = 'house';
    this.selection = null;
    this.renderEditorChrome();
    this.layoutKey = null;
    this.setupPanes(true);
    const pane = this.panes.find(x => x.kind === '3d');
    if (!pane || !pane.view.ok) { this.walking = null; this.toast(t('Walking needs 3D, which this device does not have.')); return; }
    this.walker = pane.view.startWalker(this, state && state.x != null ? state : null);
    this.renderToolrail();
    this.renderStageOverlays();
    this.renderInspector();
    if (window.matchMedia('(max-width: 860px)').matches) this.toggleInspector(false);
  },
  stopWalk(silent) {
    if (!this.walking) return;
    if (this.recorder) this.stopRecording();
    if (this.walker && this.walker.tour) { this.walker.tour = null; this.renderTourCard(); }
    for (const pane of this.panes) if (pane.view.stopWalker) pane.view.stopWalker();
    this.walker = null;
    this.walking = null;
    const pre = this._preWalk;
    this._preWalk = null;
    if (silent) return;
    if (pre) { this.view.dim = pre.dim; this.view.scope = pre.scope; if (this.view.scope === 'house' && this.view.dim === '2d') this.view.scope = 'side'; }
    this.layoutKey = null;
    this.renderEditorChrome();
    this.setupPanes(true);
    this.renderInspector();
  },
  /** keys while walking; returns true when used */
  walkKey(e, down) {
    const w = this.walker;
    if (!w) return false;
    if (!e) { w.keys.clear(); return true; }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (down && e.key === 'Escape') {
      // Esc first lets go of the mouse (the browser does that itself); a second Esc stops walking
      if (document.pointerLockElement || (w.lockedAt && performance.now() - w.lockedAt < 400)) { if (document.pointerLockElement) document.exitPointerLock(); return true; }
      this.stopWalk(); return true;
    }
    if (down && (e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && w.mode === 'free') { w.toggleMouseLook(); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const used = ['w', 'a', 's', 'd', 'q', 'e', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'];
    if (!used.includes(k)) return false;
    if (down) {
      w.keys.add(k);
      if (w.mode === 'path' && (k === 'w' || k === 'ArrowUp')) w.stepForward(false);
      if (w.mode === 'path' && (k === 's' || k === 'ArrowDown')) w.stepForward(true);
    } else w.keys.delete(k);
    if (k.startsWith('Arrow')) e.preventDefault();
    return true;
  },
  setWalkMode(m) {
    if (!this.walking || !this.walker) return;
    const st = this.walker.state();
    Settings.set('walkMode', m);
    this.walking.mode = m;
    const pane = this.panes.find(x => x.kind === '3d');
    this.walker = pane.view.startWalker(this, { ...st, mode: m });
    this.renderStageOverlays();
    this.renderInspector();
  },
  setWalkPerson(id) {
    if (!this.walking) return;
    this.walking.personId = id;
    if (this.walker) this.walker.updateCamera();
    this.renderStageOverlays();
    this.renderInspector();
  },
  onWalkMoved() { for (const pane of this.panes) if (pane.kind === '2d') pane.view.drawLabels(); },

  walkBar() {
    const p = this.project, w = this.walking;
    const seg = h('div', { class: 'seg' }, ...[['free', t('Free walk')], ['path', t('Path walk')]].map(([m, lab]) => h('button', { 'aria-pressed': String(w.mode === m), onclick: () => this.setWalkMode(m) }, icon(m === 'free' ? 'walk' : 'path'), h('span', { class: 'hide-xs' }, lab))));
    const who = h('select', { class: 'select sm', 'aria-label': t('Who is walking') }, ...p.people.map(pp => h('option', { value: pp.id, selected: pp.id === w.personId }, `${pp.name} · ${String(pp.eye).replace('.', ',')} m`)));
    who.onchange = () => this.setWalkPerson(who.value);
    const rec = this.recorder;
    return h('div', { class: 'modebar walkbar' }, icon('walk'), seg, who,
      // the real sun at a day and time (the sun bar shows under this bar); again: the normal day light
      h('button', { class: 'btn sm ghost icon', id: 'btn-walk-sun', 'aria-pressed': String(this.settings.light === 'sun'), title: t('Sun: choose a day and a time'), 'aria-label': t('Sun: choose a day and a time'),
        onclick: () => { Settings.set('light', this.settings.light === 'sun' ? 'day' : 'sun'); this.refreshViews(false); this.renderStageOverlays(); } }, icon('sun')),
      h('button', { class: 'btn sm ghost icon', title: t('Save this view'), 'aria-label': t('Save this view'), onclick: () => this.saveViewpoint() }, icon('bookmark')),
      h('button', { class: 'btn sm ghost icon', id: 'btn-stop-here', title: t('Add a stop here (route)'), 'aria-label': t('Add a stop here (route)'), onclick: () => this.addTourStop() }, icon('flag')),
      this.canRecord() ? (rec
        ? h('button', { class: 'btn sm rec-on', id: 'btn-rec', title: t('Stop recording and save the video'), onclick: () => this.stopRecording() }, icon('stop'), h('span', { class: 'rec-time num' }, '0:00'))
        : h('button', { class: 'btn sm ghost icon', id: 'btn-rec', title: t('Record a video of the walk'), 'aria-label': t('Record a video of the walk'), onclick: () => this.startRecording() }, icon('record', 'rec-ic'))) : null,
      h('button', { class: 'btn sm', title: t('Stop walking (Esc)'), onclick: () => this.stopWalk() }, icon('close'), h('span', { class: 'hide-xs' }, t('Exit'))));
  },
  walkPanel(el) {
    const p = this.project, w = this.walking;
    this.inspHead(el, t('Walking'), w.mode === 'path' ? t('Path walk') : t('Free walk'));
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('People')));
    p.people.forEach(pp => {
      const name = h('input', { class: 'input', value: pp.name, 'aria-label': t('Name') });
      name.onchange = () => { this.mutate(() => { pp.name = name.value.trim() || pp.name; }, { project: true, keepInspector: true }); this.renderStageOverlays(); };
      const num = (val, lab, fn, unit, step) => { const i = h('input', { class: 'input num', value: String(val).replace('.', ','), inputmode: 'decimal', 'aria-label': lab }); i.onchange = () => { const v = parseFloat(i.value.replace(',', '.')); if (isFinite(v)) { this.mutate(() => fn(v), { project: true, keepInspector: true }); if (this.walker) this.walker.updateCamera(); this.renderStageOverlays(); } }; return h('div', { class: 'field' }, h('span', { class: 'flabel' }, lab), h('div', { class: 'input-unit' }, i, h('span', { class: 'unit' }, unit))); };
      sec.appendChild(h('div', { class: 'person-row' + (pp.id === w.personId ? ' on' : '') },
        h('button', { class: 'btn sm' + (pp.id === w.personId ? ' primary' : ''), onclick: () => this.setWalkPerson(pp.id) }, icon('person')),
        name,
        num(pp.eye, t('Eyes at'), v => { pp.eye = clamp(v, 0.8, 2.2); }, 'm'),
        num(pp.speed, t('Speed'), v => { pp.speed = clamp(v, 0.3, 4); }, 'm/s')));
    });
    sec.appendChild(h('p', { class: 'note-muted' }, t('Eye height is about 12 cm less than how tall someone is.')));
    el.appendChild(sec);
    this.routesSection(el);
    this.pathsSection(el);
    el.appendChild(h('div', { class: 'insp-sec' }, h('p', { class: 'note-muted' }, w.mode === 'free'
      ? t('PC: W A S D or the arrow keys to walk, drag to look, Shift goes faster. Phone: the left stick walks, the right stick looks. Tap a door to open or close it.')
      : t('Drag to look around; tap an arrow on the floor or a ring to walk there. Up and down arrow keys walk to the next point.'))));
  },

  /* ───────── walking paths (drawn in 2D with the Paths tool) ───────── */
  pathsSection(el) {
    const W = this.project.walk;
    const sel = this.pathSel && W.nodes.find(n => n.id === this.pathSel);
    const sec = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Walking paths')),
      h('p', { class: 'note-muted' }, t('{n} points, {k} lines.', { n: W.nodes.length, k: W.edges.length }) + ' ' + t('Draw them in 2D with the Paths tool: tap to add points, they join up. A path can branch and go up the stairs.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn sm primary', onclick: () => this.autoPaths() }, icon('path'), t('Make paths from rooms and doors')),
        this.tool !== 'path' ? h('button', { class: 'btn sm', onclick: () => { if (this.walking) this.stopWalk(); this.setTool('path'); } }, icon('edit'), t('Draw paths')) : null,
        W.nodes.length ? h('button', { class: 'btn sm danger', onclick: () => { this.mutate(pr => { pr.walk.nodes = []; pr.walk.edges = []; }, { project: true }); this.pathSel = null; this.refreshViews(false); } }, icon('trash'), t('Delete all paths')) : null));
    if (sel && this.tool === 'path') {
      sec.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn sm', onclick: () => { this.pathSel = null; this.refreshViews(false); this.renderInspector(); } }, t('Start a new line')),
        h('button', { class: 'btn sm', onclick: () => { this._pathConnect = sel.id; this.toast(t('Tap the point to connect to. It may be on another storey: switch storey first.')); } }, icon('link'), t('Connect to a point')),
        h('button', { class: 'btn sm danger', onclick: () => this.deletePathNode(sel.id) }, icon('trash'), t('Delete point'))));
    }
    el.appendChild(sec);
  },
  pathTap(en, p, node, e) {
    const W = this.project.walk;
    if (e && (e.button === 2) && node) { this.deletePathNode(node.id); return; }
    if (node) {
      if (this._pathConnect && this._pathConnect !== node.id) {
        const a = this._pathConnect;
        this._pathConnect = null;
        if (!W.edges.some(([x, y]) => (x === a && y === node.id) || (y === a && x === node.id))) this.mutate(pr => { pr.walk.edges.push([a, node.id]); }, { project: true, keepInspector: true });
      }
      this.pathSel = node.id;
      this.refreshViews(false); this.renderInspector();
      return;
    }
    const n = { id: uid('wn_'), storey: en.storey.id, x: +p[0].toFixed(3), y: +p[1].toFixed(3) };
    const from = (this._pathConnect || this.pathSel) && W.nodes.find(x => x.id === (this._pathConnect || this.pathSel));
    this._pathConnect = null;
    this.mutate(pr => { pr.walk.nodes.push(n); if (from) pr.walk.edges.push([from.id, n.id]); }, { project: true, keepInspector: true });
    this.pathSel = n.id;
    this.renderInspector();
  },
  deletePathNode(id) {
    this.mutate(pr => { pr.walk.nodes = pr.walk.nodes.filter(n => n.id !== id); pr.walk.edges = pr.walk.edges.filter(([a, b]) => a !== id && b !== id); }, { project: true, keepInspector: true });
    if (this.pathSel === id) this.pathSel = null;
    this.renderInspector();
  },

  /** paths made from the plan: a point in every room, through every door, and up every stair */
  autoPaths() {
    const p = this.project, plan = this.shownVersion().plan;
    const storeys = sortedStoreys(p);
    const nodes = [], edges = [];
    const add = (sid, q, extra = {}) => { const n = { id: uid('wn_'), storey: sid, x: +q[0].toFixed(3), y: +q[1].toFixed(3), auto: true, ...extra }; nodes.push(n); return n; };
    const roomAt = (q, sid) => plan.rooms.filter(r => r.storey === sid && pointInPolygon(q, r.poly)).sort((a, b) => roomArea(a) - roomArea(b))[0] || null;
    const roomNode = new Map();
    const nodeOf = r => { if (!roomNode.has(r.id)) roomNode.set(r.id, add(r.storey, labelPoint(r.poly, roomHoles(plan, r)), { room: r.id })); return roomNode.get(r.id); };
    for (const st of storeys) {
      for (const op of plan.openings) {
        if (op.kind !== 'door' && op.kind !== 'opening') continue;
        const w = plan.walls.find(x => x.id === op.wall);
        if (!w || w.storey !== st.id) continue;
        const c = V.add(w.a, V.mul(wallDir(w), op.pos)), n = V.perp(wallDir(w));
        const qa = V.add(c, V.mul(n, w.t / 2 + 0.45)), qb = V.sub(c, V.mul(n, w.t / 2 + 0.45));
        const ra = roomAt(qa, st.id), rb = roomAt(qb, st.id);
        if (!ra || !rb || ra === rb) continue;
        const A = add(st.id, qa), B = add(st.id, qb);
        edges.push([nodeOf(ra).id, A.id], [A.id, B.id], [B.id, nodeOf(rb).id]);
      }
    }
    // stairs: up the treads of the builder's model
    let stairs = 0;
    const pane = this.panes.find(x => x.kind === '3d');
    const lines = [];
    for (let i = 0; i < storeys.length - 1; i++) {
      const line = stairLine(this.shell, storeys[i].id, storeys[i + 1].elevation - storeys[i].elevation);
      if (line && line.length >= 3) lines.push({ line, lo: storeys[i], hi: storeys[i + 1] });
    }
    // and the stairs drawn in the app: their walking line
    for (const st of plan.stairs || []) {
      const hi = st.upper && getStorey(p, st.upper), lo = getStorey(p, st.storey);
      if (!hi || !lo) continue;
      const line = [{ x: st.x, y: st.y, h: 0 }, ...stairGeom(st).walk];
      if (line.length >= 3) lines.push({ line, lo, hi });
    }
    for (const { line, lo, hi } of lines) {
      const first = line[0], last = line[line.length - 1], prev = line[line.length - 2];
      const dir = V.norm(V.sub([last.x, last.y], [prev.x, prev.y]));
      const top = [last.x + dir[0] * 0.55, last.y + dir[1] * 0.55];
      const startPt = [first.x, first.y];
      const bottomRoom = roomAt(startPt, lo.id), topRoom = roomAt(top, hi.id);
      let prevNode = add(lo.id, startPt, { stair: true });
      if (bottomRoom) edges.push([nodeOf(bottomRoom).id, prevNode.id]);
      // every tread: walking up follows the stair round its turns, without stopping on the way
      for (let k = 1; k < line.length; k++) { const nn = add(lo.id, [line[k].x, line[k].y], { stair: true }); edges.push([prevNode.id, nn.id]); prevNode = nn; }
      const topNode = add(hi.id, top, { stair: true });
      edges.push([prevNode.id, topNode.id]);
      if (topRoom) edges.push([topNode.id, nodeOf(topRoom).id]);
      stairs++;
    }
    void pane;
    this.mutate(pr => {
      // own points stay; earlier made-for-you points are replaced
      const keep = pr.walk.nodes.filter(n => !n.auto), keepIds = new Set(keep.map(n => n.id));
      pr.walk.edges = pr.walk.edges.filter(([a, b]) => keepIds.has(a) && keepIds.has(b)).concat(edges);
      pr.walk.nodes = keep.concat(nodes);
    }, { project: true });
    this.toast(t('Paths made: {n} points through {k} rooms', { n: nodes.length, k: roomNode.size }) + (stairs ? t(', and up {s} stairs.', { s: stairs }) : '.'));
    if (this.walker && this.walker.mode === 'path') this.walker.enterPath();
    this.renderInspector();
  },
});

/** the walking line of a stair: the middle of each tread, from the bottom up (from the builder's 3D model) */
function stairLine(shell, sid, storeyH) {
  if (!shell || !shell.storeys[sid]) return null;
  const groups = new Map();
  for (const part of shell.storeys[sid]) {
    if (!/^stair/.test(part.key)) continue;
    const pos = part.pos, idx = part.idx;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz);
      if (L < 1e-9 || Math.abs(ny) / L < 0.97) continue;
      const area = L / 2, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      // treads only: the floor at the top is reached from the last one
      if (y < 0.08 || y > storeyH - 0.08) continue;
      const k = Math.round(y / 0.03);
      const gr = groups.get(k) || { area: 0, x: 0, z: 0, y: 0 };
      gr.area += area; gr.x += (pos[a] + pos[b] + pos[c]) / 3 * area; gr.z += (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 * area; gr.y += y * area;
      groups.set(k, gr);
    }
  }
  // treads (not the narrow tops of the railings)
  const steps = [...groups.values()].filter(g => g.area > 0.1).map(g => ({ x: g.x / g.area, y: g.z / g.area, h: g.y / g.area })).sort((a, b) => a.h - b.h);
  // one tread per height (merge buckets that are the same step)
  const out = [];
  for (const s2 of steps) { const last = out[out.length - 1]; if (last && s2.h - last.h < 0.06) continue; out.push(s2); }
  return out.length >= 3 ? out : null;
}
