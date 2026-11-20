/* ───────────── view3d-x.js — the 3D view, part 2: ceilings and room lights, doors that swing, furniture,
   note pins, and what a tap hits ───────────── */

Object.assign(View3D.prototype, {
  extraSetup() {
    this.doorMap = new Map();      // opening id → [{grp, full, target}]
    this.doorAnim = new Set();
    this.lightPool = [];
    this.lightSpots = [];
    this.furnPick = [];
    this.roofCache = new Map();
  },
  clearExtra() {
    this.doorMap.clear();
    this.doorAnim.clear();
    this.lightSpots = [];
    this.furnPick = [];
    this.furnRing = null;
    this._lightKey = null;
  },

  /** called every frame: returns true when something moved and the picture needs drawing again */
  tick() {
    let changed = false;
    const now = performance.now(), dt = Math.min(0.1, (now - (this._lastTick || now)) / 1000);
    this._lastTick = now;
    // doors swinging
    for (const d of [...this.doorAnim]) {
      const cur = d.slide ? d.grp.position.x : d.grp.rotation.y;
      const diff = d.target - cur, sp = d.slide ? 1.6 : 4.2;
      const nv = Math.abs(diff) < 0.01 ? d.target : cur + Math.sign(diff) * Math.min(Math.abs(diff), dt * sp);
      if (d.slide) d.grp.position.x = nv; else d.grp.rotation.y = nv;
      if (nv === d.target) this.doorAnim.delete(d);
      changed = true;
      this.shadowDirty = true;
    }
    if (this.walker && this.walker.tick(dt)) changed = true;
    if (this.evening && this.lightPool.length && this.assignLights()) changed = true;
    return changed;
  },

  /* ───────── light ───────── */
  applyLight(evening) {
    this.evening = evening;
    this._aeLight = true;   // (the exposure measured again: autoexp.js)
    this._lightKey = null;
    if (evening) {
      this.hemi.color.set('#9fb0d0'); this.hemi.groundColor.set('#2b2724'); this.hemi.intensity = 0.42;
      this.sun.intensity = 0.06; this.sun.castShadow = false;
      if (!this.lightPool.length) {
        const n = this.fast ? 4 : 8;
        for (let i = 0; i < n; i++) { const L = new THREE.PointLight(0xffd2a0, 0, 0, 2); L.castShadow = false; this.scene.add(L); this.lightPool.push(L); }
      }
      this.renderer.toneMappingExposure = 1.1;
    } else {
      this.hemi.color.set(0xffffff); this.hemi.groundColor.set(0xcfcac2); this.hemi.intensity = 1.45;
      this.sun.intensity = 1.25; this.sun.castShadow = !this.fast;
      // the room lights only cost time while they are there
      for (const L of this.lightPool) this.scene.remove(L);
      this.lightPool = [];
      this.renderer.toneMappingExposure = 1.0;
    }
    this.hqLight();
  },
  /** the evening lights go to the rooms nearest to where you look (or where you stand when walking) */
  assignLights() {
    const ref = this.walker ? this.camera.position : this.controls.target;
    const key = [ref.x, ref.y, ref.z].map(v => Math.round(v * 2)).join(',') + '|' + this.lightSpots.length;
    if (key === this._lightKey) return false;
    this._lightKey = key;
    const spots = this.lightSpots.map(s => ({ s, d: (s.pos.x - ref.x) ** 2 + ((s.pos.y - ref.y) * 3) ** 2 + (s.pos.z - ref.z) ** 2 })).sort((a, b) => a.d - b.d);
    this.lightPool.forEach((L, i) => {
      const sp = spots[i];
      if (sp) { L.position.copy(sp.s.pos); L.intensity = sp.s.power; } else L.intensity = 0;
    });
    return true;
  },

  /** does the roof come lower than this height above the floor, inside this outline? (attic rooms have no flat ceiling) */
  roofBelow(sid, poly, hgt) {
    const shell = this.spec.shell;
    if (!shell || !shell.storeys[sid]) return false;
    const key = sid + '|' + poly.map(p => p.join(',')).join(';') + '|' + hgt;
    if (this.roofCache.has(key)) return this.roofCache.get(key);
    const bb = bboxOfPoints(poly);
    let low = false;
    for (const part of shell.storeys[sid]) {
      const m = shell.materials[part.key] || {};
      if (!m.roof) continue;
      const pos = part.pos;
      for (let i = 0; i < pos.length && !low; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (y < hgt - 0.05 && y > 0.3 && x > bb.minX + 0.2 && x < bb.maxX - 0.2 && z > bb.minY + 0.2 && z < bb.maxY - 0.2) low = true;
      }
      if (low) break;
    }
    // a roof slope drawn as one long plane has its corners only at the eaves, the ridge and the gables – none of them
    // inside the room – so also ask the roof's own height over the room (every 25 cm inside the outline, 20 cm in from
    // its edges); the attic's flat ceiling stuck out through the made-up house's slopes (task 0044)
    if (!low) {
      const F = this.roofCeiling(sid), step = 0.25;
      if (F) for (let x = bb.minX + 0.2; x <= bb.maxX - 0.2 && !low; x += step) for (let z = bb.minY + 0.2; z <= bb.maxY - 0.2 && !low; z += step) {
        if (!pointInPolygon([x, z], poly)) continue;
        const y = F.at(x, z);
        if (y != null && y > 0.3 && y < hgt - 0.05) low = true;
      }
    }
    this.roofCache.set(key, low);
    return low;
  },

  /** the inside of the roof over a storey (from the builder's model): a height grid (5 cm) of the lowest roof surface
   *  above the floor, with every ridge made a 20 cm wide flat (as the roof boarding is finished inside) */
  roofCeiling(sid) {
    const shell = this.spec.shell;
    if (!shell || !shell.storeys[sid]) return null;
    let cache = ROOF_CEIL.get(shell);
    if (!cache) ROOF_CEIL.set(shell, cache = new Map());
    if (cache.has(sid)) return cache.get(sid);
    const field = buildRoofCeiling(shell, sid);
    cache.set(sid, field);
    return field;
  },
  /** the 20 cm flats along the ridges, seen from inside (with the roof) */
  buildRoofFlats(g, en, cutH) {
    const spec = this.spec;
    if (cutH != null || spec.scope !== 'house' || spec.roof === false || spec.ceilings === false) return;
    const F = this.roofCeiling(en.storey.id);
    if (!F || !F.flats.length) return;
    // only over the rooms (the edges of the roof outside the house are left out)
    const rooms = en.plan.rooms.filter(r => r.storey === en.storey.id && r.poly.length >= 3);
    const inside = f => rooms.some(r => pointInPolygon([(f[0] + f[2]) / 2, (f[1] + f[3]) / 2], r.poly));
    const strips = mergeFlatRows(F.flats.filter(inside));
    if (!strips.length) return;
    const pos = [];
    for (const [x0, z0, x1, z1, y] of strips) pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const sm = F.key && this.spec.shell.materials[F.key];
    const m = new THREE.Mesh(geo, sm ? shellMaterial(F.key, sm) : mat('roofflat', () => new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.9, side: THREE.DoubleSide })));
    m.receiveShadow = true;
    m.userData.roofFlat = true;
    g.add(m);
  },

  buildCeilings(g, en, cutH) {
    const spec = this.spec, plan = en.plan, st = en.storey, sid = st.id;
    const H = st.wallHeight || DEFAULTS.wallHeight;
    const wantCeil = spec.ceilings !== false && cutH == null;
    const evening = spec.light === 'evening';
    const furn = en.furniture || [];
    const fix = mat('ceilfix|' + (evening ? 1 : 0), () => new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.6, emissive: new THREE.Color(evening ? '#ffd9a0' : '#000000'), emissiveIntensity: evening ? 1.5 : 0 }));
    // the light point: a small disc under the ceiling, facing down (from above it is not drawn)
    const fixGeo = this._fixGeo || (this._fixGeo = new THREE.CircleGeometry(0.11, 24).rotateX(Math.PI / 2));
    for (const r of plan.rooms) {
      if (r.storey !== sid || r.poly.length < 3) continue;
      const ch = r.ceilingH || H;
      const underRoof = this.roofBelow(sid, r.poly, ch);
      if (wantCeil && !underRoof) {
        // the stairwell to the storey above stays open
        const m = new THREE.Mesh(new THREE.ShapeGeometry(floorShapes(r.poly, ceilingHoles(plan, r, en.upperId), ([x, y]) => new THREE.Vector2(x, y))), wallMat(r.ceilingColor || '#F7F6F2'));
        m.rotation.x = Math.PI / 2;
        m.position.y = ch - 0.003;
        m.receiveShadow = true;
        m.userData.ceiling = r.id;
        g.add(m);
      }
      // a light in the middle of the room, unless a light from the furniture stands in it
      const own = furn.some(f => furnType(f).light && pointInPolygon([f.x, f.y], r.poly)) || (plan.points || []).some(pt => pt.storey === sid && pt.kind === 'light' && pointInPolygon([pt.x, pt.y], r.poly));
      if (own) continue;
      const lp = labelPoint(r.poly, roomHoles(plan, r));
      const lh = underRoof ? Math.min(ch, 2.3) : ch;
      const fitting = wantCeil && !underRoof && ceilShown(this.app && this.app.settings);
      if (fitting) {
        const disc = new THREE.Mesh(fixGeo, fix);
        disc.position.set(lp[0], lh - 0.012, lp[1]);
        disc.userData.keep = true;
        g.add(disc);
      }
      const area = roomArea(r);
      this.lightSpots.push({ pos: new THREE.Vector3(lp[0] + g.position.x, g.position.y + lh - 0.45, lp[1] + g.position.z), power: clamp(1.3 + area * 0.15, 1.5, 4.6), room: r.id, storey: sid, hidden: !fitting && wantCeil && !underRoof });
    }
  },

  /* ───────── doors ───────── */
  doorClosed(id) { return this.app.isDoorClosed ? this.app.isDoorClosed(id) : false; },
  registerDoor(id, grp, full, slide) {
    if (!this.doorMap.has(id)) this.doorMap.set(id, []);
    // a sliding door moves along the wall (position.x) instead of turning
    this.doorMap.get(id).push({ grp, full, slide: !!slide, target: slide ? grp.position.x : grp.rotation.y });
  },
  /** swing a door open or closed */
  swingDoor(id, closed) {
    for (const d of this.doorMap.get(id) || []) { d.target = closed ? 0 : d.full; this.doorAnim.add(d); }
    this.needs = true;
  },

  /* ───────── furniture ───────── */
  buildFurniture(g, en, cutH) {
    const list = en.furniture;
    if (!list || !list.length) return;
    const H = en.storey.wallHeight || DEFAULTS.wallHeight;
    const evening = this.spec.light === 'evening';
    const sel = this.spec.selection;
    const selIds = sel && sel.type === 'furn' ? new Set(sel.ids) : null;
    const accent = new THREE.Color(cssVar('--accent') || '#0e6f78');
    // a lowered ceiling in a room: lamps and tall cupboards there go up to that ceiling
    const lowered = en.plan ? en.plan.rooms.filter(r => r.storey === en.storey.id && r.ceilingH > 0) : [];
    const ceilAt = it => { if (!lowered.length) return H; let best = null; for (const r of lowered) if (pointInPolygon([it.x, it.y], r.poly) && (!best || roomArea(r) < roomArea(best))) best = r; return best ? best.ceilingH : H; };
    for (const it of list) {
      if (it.storey !== en.storey.id) continue;
      const T = furnType(it);
      const CH = ceilAt(it);
      const m = furnMesh(it, CH, evening);
      // outside the house (a car on the parking place): on the garden, not on the floor
      const site = this.app && this.app.project && this.app.project.site;
      const z = furnZ(it, CH) + (site && outdoorsAt(this.app.project, en.plan, en.storey.id, [it.x, it.y]) ? (site.level ?? -0.15) + 0.02 : 0);
      m.position.set(it.x, z, it.y);
      m.rotation.y = -(it.rot || 0) * Math.PI / 180;
      // mirrored pieces (corner sofa the other way round …)
      if (it.flip) m.scale.x = -1;
      m.traverse(o => {
        if (!o.isMesh) return;
        o.userData.furn = it.id;
        for (const mm of Array.isArray(o.material) ? o.material : [o.material]) if (mm) mm.userData.cutClip = cutH != null && !T.flat;
      });
      m.userData.furn = it.id;
      g.add(m);
      this.furnPick.push(m);
      if (selIds && selIds.size === 1 && selIds.has(it.id) && this.app.mode === 'furnish' && en.edit !== false && !this.opts.mini) this.buildFurnRing(g, it);
      if (selIds && selIds.has(it.id)) {
        const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(it.w + 0.04, Math.max(0.03, it.h) + 0.04, it.d + 0.04));
        const line = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: accent, depthTest: false, transparent: true }));
        line.position.set(0, Math.max(0.03, it.h) / 2, 0);
        line.renderOrder = 5;
        m.add(line);
      }
      if (T.light) {
        const ly = T.kind === 'floorlamp' || T.lamp === 'floor' ? z + it.h - 0.25 : T.kind === 'pendant' || T.lamp === 'ceiling' ? z + 0.05 : T.lamp === 'table' ? z + it.h * 0.7 : T.lamp === 'wall' ? z + it.h / 2 : z - 0.1;
        const p = furnToPlan(it, [0, 0]);
        this.lightSpots.push({ pos: new THREE.Vector3(p[0] + g.position.x, g.position.y + ly, p[1] + g.position.z), power: T.kind === 'floorlamp' || T.lamp === 'floor' ? 2.2 : T.lamp === 'table' || T.lamp === 'wall' ? 1.4 : 3.6, furn: it.id, storey: en.storey.id });
      }
    }
  },
  /** only the furniture changed (dragging in 2D): rebuild just that, the house stays */
  updateFurniture(itemsOf) {
    if (!this.ok || !this.spec) return;
    for (const g of this.group.children) {
      const en = g.userData.entry;
      if (!en) continue;
      for (const c of [...g.children]) if (c.userData.furn || c.userData.furnRing) { g.remove(c); c.traverse(o => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); }); }
      this.furnRing = null;
      this.furnPick = this.furnPick.filter(m => m.parent);
      this.lightSpots = this.lightSpots.filter(s => !s.furn || s.storey !== en.storey.id);
      if (itemsOf) en.furniture = itemsOf(en.storey.id);
      this.buildFurniture(g, en, this.spec.cut && this.spec.scope !== 'house' ? 1.15 : null);
    }
    this._lightKey = null;
    this.hqApply(this.group);
    // baked light: the pieces just built (a piece moved shows live light until the bake is matched again)
    if (this._hpbBound) this.hpbApply(this.group.children.filter(g => g.userData.entry), true);
    this.applyClip();
  },

  /* ───────── moving and turning furniture in 3D (Furnish) ───────── */
  furnDragSetup() {
    const host = this.host, el = this.renderer.domElement;
    let d = null;
    const floorPoint = (e, en, g) => {
      // where the pointer meets the floor of that storey
      const ray = this.rayFrom(e);
      const y0 = g.getWorldPosition(new THREE.Vector3()).y;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0);
      const q = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (!q || q.distanceTo(this.camera.position) > 80) return null;
      const loc = g.worldToLocal(q.clone());
      return [loc.x, loc.z];
    };
    host.addEventListener('pointerdown', e => {
      const app = this.app;
      if (!this.ok || app.mode !== 'furnish' || this.walker || this.sl || e.target !== el) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const ray = this.rayFrom(e);
      const ringHit = this.furnRing ? ray.intersectObject(this.furnRing, true).find(x => x.object.isMesh) : null;
      const hit = ringHit || ray.intersectObjects(this.furnPick, true).find(x => x.object.isMesh && x.object.visible && !this.isClipped(x.point));
      if (!hit) return;
      let o = hit.object;
      while (o && !(o.userData && (o.userData.furn || o.userData.furnRing))) o = o.parent;
      if (!o) return;
      let gObj = o;
      while (gObj && !(gObj.userData && gObj.userData.entry)) gObj = gObj.parent;
      const en = gObj && gObj.userData.entry;
      if (!en || en.edit === false || app.comparing) return;
      const p = floorPoint(e, en, gObj);
      if (!p) return;
      const id = o.userData.furn || o.userData.furnRing;
      const lay = app.activeLayout(), f = lay && lay.items.find(x => x.id === id);
      if (!f) return;
      // ours: the camera does not turn while a piece is held
      e.stopPropagation();
      d = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, started: false, en, g: gObj, start: p, id, ring: !!o.userData.furnRing, shift: e.shiftKey, f0: { x: f.x, y: f.y, rot: f.rot || 0 } };
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    }, true);
    host.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.pid) return;
      e.stopPropagation();
      const app = this.app;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.started = true;
        if (!d.ring) {
          const sel = app.selection, ids = sel && sel.type === 'furn' ? sel.ids : [];
          const move = ids.includes(d.id) ? ids : (d.shift || app.multiSel) ? [...ids, d.id] : [d.id];
          if (!(ids.length === move.length && move.every(x => ids.includes(x)))) app.select({ type: 'furn', ids: move });
          const lay = app.activeLayout();
          d.ids = move;
          d.orig = move.map(id => { const f = lay.items.find(x => x.id === id); return f ? { id, x: f.x, y: f.y, rot: f.rot || 0 } : null; }).filter(Boolean);
        }
        app.beginGesture();
        host.classList.add('furn-dragging');
      }
      const p = floorPoint(e, d.en, d.g);
      if (!p) return;
      // a frame at a time
      d.last = { p, e: { altKey: e.altKey, shiftKey: e.shiftKey } };
      if (d.raf) return;
      d.raf = requestAnimationFrame(() => {
        const dd = d;
        if (!dd || !dd.last) return;
        dd.raf = 0;
        if (dd.ring) app.dragFurnRot(dd, dd.last.p, dd.last.e);
        else app.dragFurnMove(dd, dd.last.p, 0.06, dd.last.e);
      });
    }, true);
    const end = e => {
      if (!d || e.pointerId !== d.pid) return;
      e.stopPropagation();
      const dd = d, app = this.app;
      d = null;
      if (dd.raf) cancelAnimationFrame(dd.raf);
      try { el.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
      host.classList.remove('furn-dragging');
      if (!dd.started) { if (!dd.ring) app.furnTapped(dd.id, e); return; }
      if (dd.last) { if (dd.ring) app.dragFurnRot(dd, dd.last.p, dd.last.e); else app.dragFurnMove(dd, dd.last.p, 0.06, dd.last.e); }
      app.endGesture();
      app.renderInspector();
    };
    host.addEventListener('pointerup', end, true);
    host.addEventListener('pointercancel', end, true);
  },
  /** the round handle on the floor around the selected piece: drag it to turn the piece */
  buildFurnRing(g, it) {
    const r = Math.max(it.w, it.d) / 2 + 0.22;
    const accent = new THREE.Color(cssVar('--accent') || '#0e6f78');
    const ringMat = mat('furnring', () => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.025, r + 0.025, 64).rotateX(-Math.PI / 2), ringMat);
    // a knob in front (the way the piece faces), easy to grab
    const a = -(it.rot || 0) * Math.PI / 180;
    const knob = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24).rotateX(-Math.PI / 2), ringMat);
    knob.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    // a wider invisible band so the ring is easy to hit
    const hitBand = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 48).rotateX(-Math.PI / 2), mat('furnringhit', () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })));
    for (const m of [ring, knob, hitBand]) { m.userData.furnRing = it.id; m.renderOrder = 6; grp.add(m); }
    grp.position.set(it.x, 0.02, it.y);
    grp.userData.furnRing = it.id;
    grp.userData.furn = undefined;
    g.add(grp);
    this.furnRing = grp;
  },

  /* ───────── note pins ───────── */
  buildPins(g, en) {
    for (const pin of en.pins || []) {
      if (pin.storey !== en.storey.id) continue;
      const el = h('button', { class: 'pin3d pin-' + pin.type + (pin.status === 'done' && !DIARY_TYPES.has(pin.type) ? ' done' : '') + (pin.sel ? ' sel' : ''), title: pin.title, 'aria-label': 'Note: ' + pin.title },
        icon(NOTE_ICON[pin.type] || 'note'));
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => { e.stopPropagation(); this.app.selectNote(pin.id); });
      this.labelLayer.appendChild(el);
      this.labels.push({ el, pos: new THREE.Vector3(pin.x + g.position.x, g.position.y + (pin.h != null ? pin.h : 1.2), pin.y + g.position.z), pin: true });
    }
  },

  /* ───────── what a tap hits ───────── */
  rayFrom(e) {
    const rc = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), this.camera);
    return ray;
  },
  /** the first solid thing under the pointer (glass and cut-away parts are skipped) */
  firstHit(e) {
    const ray = this.rayFrom(e);
    // (a piece drawn as part of a merged mesh is hidden itself, but it is what the ray should find – batch.js)
    return ray.intersectObjects(this.group.children, true).find(x => x.object.isMesh && (x.object.visible || x.object.userData.merged) && !(x.object.material && x.object.material.transparent && !x.object.userData.door) && !this.isClipped(x.point)) || null;
  },
  /** storey + plan position of a 3D point */
  planPoint(hit) {
    let o = hit.object;
    while (o && !(o.userData && o.userData.entry)) o = o.parent;
    if (!o) return null;
    const local = o.worldToLocal(hit.point.clone());
    return { storey: o.userData.storeyId, x: +local.x.toFixed(3), y: +local.z.toFixed(3), h: +local.y.toFixed(3), entry: o.userData.entry };
  },
  pick(e) {
    // (in the render window a tap only frames the picture)
    if (this.borrowed) return;
    if (this.walker && this.walker.onTap(e)) return;
    const app = this.app;
    const hit = this.firstHit(e);
    // measuring
    if (app.mode === 'view' && app.tool === 'measure') { this.measureTap(hit); return; }
    // placing a note
    if (app.mode === 'view' && app.tool === 'note') {
      const pp = hit && this.planPoint(hit);
      if (pp) app.addNoteAt(pp, true); else app.toast(t('Tap on the house to place the note.'));
      return;
    }
    if (hit && hit.object.userData.door) { app.doorTapped(hit.object.userData.door, e, '3d'); return; }
    if (hit && hit.object.userData.furn) { app.furnTapped(hit.object.userData.furn, e); return; }
    if (hit && hit.object.userData.stair && app.mode === 'build') { app.select({ type: 'stair', id: hit.object.userData.stair }); return; }
    if (hit && hit.object.userData.point) { app.select({ type: 'point', id: hit.object.userData.point, readOnly: app.mode !== 'build' }); return; }
    // Build: the inside of a wall opens that room with this wall (its own finish)
    if (hit && hit.object.userData.wallId && app.mode === 'build') {
      const fs = this.faceFromHit(hit);
      if (fs) { app.select(fs); return; }
    }
    // rooms: the floor under the pointer, also through a wall (as before)
    const ray = this.rayFrom(e);
    const hits = ray.intersectObjects(this.pickables, false).filter(x => !this.isClipped(x.point));
    if (hits.length) {
      const u = hits[0].object.userData;
      app.select({ type: 'room', id: u.roomId, storey: u.storeyId, versionId: u.versionId, readOnly: !u.edit });
    } else app.select(null);
  },
});

const NOTE_ICON = { question: 'question', todo: 'todo', decision: 'decision', idea: 'idea', problem: 'problem', snag: 'snag' };

/** holes in a room's ceiling: the stairwell openings of the storey above, inside this room */
function ceilingHoles(plan, room, upperId) {
  if (!upperId || !plan.voids || !plan.voids.length) return [];
  return roomHoles(plan, { ...room, storey: upperId });
}

/* ───────── soft shadows in corners (ambient occlusion), Beautiful quality only ─────────
   After the normal picture: a depth-only picture of the same view with the real materials (so cut walls and
   slices stay cut, glass stays out), GTAO at half size from that depth, smoothed, and multiplied over the
   picture. Settings: settings.ao = true / false; 'auto' (default) = on (phones and tablets at half size). */
let AO_SCALE = 1;
class AOEffect {
  constructor(view, mods) {
    this.v = view;
    const { GTAOPass } = mods;
    this.depthTex = new THREE.DepthTexture(1, 1);
    this.depthTex.type = THREE.FloatType;
    this.depthRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: this.depthTex, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    // drawn with the same shader programs as the screen (same tone mapping and colour space), so no material is
    // compiled twice; the colour of this pass is never used
    this.depthRT.isXRRenderTarget = true;
    this.depthRT.texture.colorSpace = view.renderer.outputColorSpace;
    this.pass = new GTAOPass(view.scene, view.camera, 1, 1);
    this.pass.setGBuffer(this.depthTex, undefined);
    this.pass.output = GTAOPass.OUTPUT.Off;
    // High: more samples, weighted to what is close (contact shadows in corners, seams and under things)
    if (view.high) this.pass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.6, thickness: 1.0, scale: 1.05, samples: 24, distanceFallOff: 1.0, screenSpaceRadius: false });
    else this.pass.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    // a wide smoothing: no grain on surfaces seen at a slant (window frames, reveals)
    this.pass.updatePdMaterial({ lumaPhi: 5, depthPhi: 2, normalPhi: 3, radius: 12, rings: 3, samples: 24 });
    this.resize();
  }
  resize() {
    const r = this.v.renderer, sz = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, Math.round(sz.x)), h2 = Math.max(2, Math.round(sz.y));
    this.depthRT.setSize(w, h2);
    // (phones and tablets: the shadows in corners at half size – soft anyway, a quarter of the work)
    const k = this.v.aoScale || AO_SCALE;
    this.pass.setSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h2 * k)));
  }
  render() {
    const v = this.v, r = v.renderer, cb = r.state.buffers.color;
    const au = r.shadowMap.autoUpdate;
    const bg = v.scene.background;
    // a tight far plane for this pass: much finer depth, so the occlusion is smooth
    const cam = v.camera, far0 = cam.far, near0 = cam.near;
    if (!this.box) this.box = new THREE.Box3().setFromObject(v.group);
    if (!this.box.isEmpty()) {
      const sph = this.box.getBoundingSphere(new THREE.Sphere());
      cam.far = Math.max(5, cam.position.distanceTo(sph.center) + sph.radius * 1.1);
      cam.near = Math.max(near0, Math.min(0.15, cam.far / 4000));
      cam.updateProjectionMatrix();
    }
    // depth only: the same scene and materials, no colour, no new shadow maps
    r.shadowMap.autoUpdate = false;
    v.scene.background = null;
    r.setRenderTarget(this.depthRT);
    r.clear(true, true, true);
    cb.setMask(false); cb.setLocked(true);
    r.render(v.scene, v.camera);
    cb.setLocked(false); cb.setMask(true);
    r.shadowMap.autoUpdate = au;
    v.scene.background = bg;
    // the occlusion (half size), smoothed
    this.pass.render(r, null, null);
    // multiplied over the picture on the screen
    const bm = this.pass.blendMaterial;
    bm.uniforms.intensity.value = (v.aoK || 1) * (v.spec && v.spec.light === 'evening' ? 0.75 : v.high ? 1.0 : 0.9);
    bm.uniforms.tDiffuse.value = this.pass.pdRenderTarget.texture;
    (this.pass._renderPass || this.pass.renderPass).call(this.pass, r, bm, null);   // (three r187: _renderPass)
    r.setRenderTarget(null);
    if (cam.far !== far0 || cam.near !== near0) { cam.far = far0; cam.near = near0; cam.updateProjectionMatrix(); }
  }
  dispose() { this.depthRT.dispose(); this.depthTex.dispose(); this.pass.dispose(); }
}
const AO_MODS = { p: null, mods: null };
Object.assign(View3D.prototype, {
  aoWanted() {
    if (this.fast || this.opts.mini || !this.ok || this.rec) return false;
    const s = app.settings || {};
    // High always has them (contact shadows are part of it); since 30 Oct also phones and tablets (Beautiful): at half
    // size, drawn once when the view stands still, so moving costs nothing more
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const on = this.high || s.ao !== false;
    if (!on) return false;
    this.aoScale = coarse && !this.high ? 0.5 : 1;
    if (this.ao) return true;
    if (!AO_MODS.p) AO_MODS.p = addon('postprocessing/GTAOPass.js').then(m => { AO_MODS.mods = m; }).catch(e => { console.warn('AO', e); AO_MODS.failed = true; });
    if (AO_MODS.mods && !AO_MODS.failed) { try { this.ao = new AOEffect(this, AO_MODS.mods); return true; } catch (e) { console.warn('AO', e); AO_MODS.failed = true; return false; } }
    if (!AO_MODS.failed) AO_MODS.p.then(() => { this.needs = true; });
    return false;
  },
  renderAO() { try { this.ao.render(); } catch (e) { console.warn('AO off', e); AO_MODS.failed = true; this.ao = null; } },
});
