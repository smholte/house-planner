/* ───────────── openings.js — door and window types ─────────────
   op.style for doors: 'hinged' (default) | 'double' (= op.leaves 2) | 'sliding' (a leaf on the wall that slides
   aside) | 'pocket' (slides into the wall) | 'glass' (a glass leaf in a frame) | 'folding' (two panels that fold);
   for windows: 'fixed' (default) | 'turn' | 'tilt' (tilt-turn, draaikiep) | 'sliding' | 'top' (top-hung, klepraam).
   Sliding and pocket doors slide towards their hinge side (op.hinge 'start' or 'end'), on the swing side (op.swing). */

const DOOR_STYLES = [['hinged', 'Hinged'], ['double', 'Double'], ['sliding', 'Sliding'], ['pocket', 'Pocket'], ['glass', 'Glass'], ['folding', 'Folding']];
const WINDOW_STYLES = [['fixed', 'Fixed'], ['turn', 'Turn'], ['tilt', 'Tilt-turn'], ['sliding', 'Sliding'], ['top', 'Top-hung']];
const doorStyle = op => op.style || (op.leaves === 2 ? 'double' : 'hinged');
const windowStyle = op => op.style || 'fixed';
function setOpeningStyle(op, style) {
  op.style = style;
  if (op.kind === 'door') { if (style === 'double') op.leaves = 2; else delete op.leaves; }
}

/** 2D: the symbol of a door or window of one of the types (null: the plain drawing) */
function styledOpeningPath(op, w, p0, p1, d, n, t2, closed, f) {
  const side = op.swing === 'right' ? V.mul(n, -1) : n;
  if (op.kind === 'door') {
    const st = doorStyle(op);
    const toStart = op.hinge !== 'end';                 // sliding doors go towards their hinge side
    const dd = toStart ? V.mul(d, -1) : d;              // the way the leaf goes when it opens
    const arrow = (at, dir, k) => { const tip = V.add(at, V.mul(dir, k)), q = V.perp(dir); return `M${f(at)}L${f(tip)}M${f(V.add(V.sub(tip, V.mul(dir, k * 0.4)), V.mul(q, k * 0.3)))}L${f(tip)}L${f(V.sub(V.sub(tip, V.mul(dir, k * 0.4)), V.mul(q, k * 0.3)))}`; };
    if (st === 'sliding' || st === 'pocket') {
      const off = st === 'sliding' ? V.mul(side, t2 + 0.03) : [0, 0];
      const shift = closed ? [0, 0] : V.mul(dd, op.w * 0.92);
      const a = V.add(V.add(p0, off), shift), b = V.add(V.add(p1, off), shift);
      const th = V.mul(st === 'sliding' ? side : n, 0.02);
      const leaf = `M${f(V.sub(a, th))}L${f(V.sub(b, th))}L${f(V.add(b, th))}L${f(V.add(a, th))}Z`;
      const mid = V.lerp(p0, p1, 0.5);
      const arr = arrow(V.add(V.add(mid, off), V.mul(st === 'sliding' ? side : n, st === 'sliding' ? 0.12 : t2 + 0.1)), dd, Math.min(0.35, op.w * 0.35));
      return { sym: (st === 'pocket' && !closed ? '' : leaf) + arr, dash: st === 'pocket' && !closed ? leaf : '', glass: null };
    }
    if (st === 'folding') {
      const hinge = op.hinge === 'end' ? p1 : p0, other = op.hinge === 'end' ? p0 : p1;
      const hd = V.norm(V.sub(other, hinge));
      const hf = V.add(hinge, V.mul(side, t2)), of = V.add(other, V.mul(side, t2));
      if (closed) { const m = V.add(V.lerp(hf, of, 0.5), V.mul(side, 0.08)); return { sym: `M${f(hf)}L${f(m)}L${f(of)}`, dash: '', glass: null }; }
      const k = op.w / 2;
      const a = V.add(V.add(hf, V.mul(side, k * 0.94)), V.mul(hd, k * 0.33)), b = V.add(hf, V.mul(hd, k * 0.66));
      return { sym: `M${f(hf)}L${f(a)}L${f(b)}`, dash: `M${f(b)}L${f(of)}`, glass: null };
    }
    if (st === 'glass' && !closed) {
      const hinge = op.hinge === 'end' ? p1 : p0, other = op.hinge === 'end' ? p0 : p1;
      const hf = V.add(hinge, V.mul(side, t2)), of = V.add(other, V.mul(side, t2)), leaf = V.add(hf, V.mul(side, op.w));
      const cross = V.cross(V.sub(leaf, hf), V.sub(of, hf));
      const hd = V.norm(V.sub(other, hinge)), k = 0.025;
      return { sym: `M${f(hf)}L${f(leaf)}A${op.w} ${op.w} 0 0 ${cross > 0 ? 1 : 0} ${f(of)}M${f(V.add(hf, V.mul(hd, k)))}L${f(V.add(leaf, V.mul(hd, k)))}`, dash: '', glass: null };
    }
    return null;
  }
  if (op.kind === 'window') {
    const st = windowStyle(op);
    if (st === 'fixed') return null;
    const k = t2 * 0.35;
    const glassLines = `M${f(V.add(p0, V.mul(n, k)))}L${f(V.add(p1, V.mul(n, k)))}M${f(V.sub(p0, V.mul(n, k)))}L${f(V.sub(p1, V.mul(n, k)))}`;
    const glass = [V.add(p0, V.mul(n, t2)), V.add(p1, V.mul(n, t2)), V.sub(p1, V.mul(n, t2)), V.sub(p0, V.mul(n, t2))];
    const inside = V.add(V.mul(side, t2), [0, 0]);
    if (st === 'turn' || st === 'tilt') {
      // the sash swings into the room: one from the hinge side, or two from both jambs when wide
      const two = op.w > 1.1;
      const parts = two ? [[p0, V.lerp(p0, p1, 0.5)], [p1, V.lerp(p0, p1, 0.5)]] : [[op.hinge === 'end' ? p1 : p0, op.hinge === 'end' ? p0 : p1]];
      let dash = '';
      for (const [hg, o] of parts) {
        const r = V.dist(hg, o), hf = V.add(hg, inside), of = V.add(o, inside), leaf = V.add(hf, V.mul(side, r));
        const cross = V.cross(V.sub(leaf, hf), V.sub(of, hf));
        dash += `M${f(hf)}L${f(leaf)}A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${f(of)}`;
      }
      if (st === 'tilt') { const m = V.lerp(p0, p1, 0.5); dash += `M${f(V.add(V.add(p0, inside), V.mul(side, 0.12)))}L${f(V.add(V.add(m, inside), V.mul(side, 0.02)))}L${f(V.add(V.add(p1, inside), V.mul(side, 0.12)))}`; }
      return { sym: glassLines, dash, glass };
    }
    if (st === 'sliding') {
      const m = V.lerp(p0, p1, 0.5), dd = V.norm(V.sub(p1, p0)), o = 0.06;
      return { sym: `M${f(V.add(p0, V.mul(n, k)))}L${f(V.add(V.add(m, V.mul(dd, o)), V.mul(n, k)))}M${f(V.sub(V.sub(m, V.mul(dd, o)), V.mul(n, k)))}L${f(V.sub(p1, V.mul(n, k)))}`, dash: '', glass };
    }
    if (st === 'top') return { sym: glassLines, dash: `M${f(V.add(V.add(p0, inside), V.mul(side, 0.1)))}L${f(V.add(V.add(p1, inside), V.mul(side, 0.1)))}`, glass };
  }
  return null;
}

/* ───────── 3D ───────── */
/** box geometries (same attributes) as one geometry */
/** where the model's window in this opening is (in the wall's frame: u along, v across, y up): its frame, glass
 *  and the window board inside (the builder's 'white' part just above the frame's bottom); kept per shell */
const MODEL_WIN = new WeakMap();
function modelWindowInfo(shell, sid, w, op) {
  if (!shell || !shell.storeys || !shell.storeys[sid]) return null;
  let cache = MODEL_WIN.get(shell);
  if (!cache) MODEL_WIN.set(shell, cache = new Map());
  const key = [sid, w.a, w.b, op.pos, op.w, op.sill, op.h].join('|');
  if (cache.has(key)) return cache.get(key);
  const d = wallDir(w), n = V.perp(d), s = op.pos - op.w / 2, e = op.pos + op.w / 2;
  const res = { frame: null, glass: null, board: null, frameKey: null };
  const grow = (k, u, v, y) => {
    const r = res[k];
    if (!r) { res[k] = { u0: u, u1: u, v0: v, v1: v, y0: y, y1: y }; return; }
    if (u < r.u0) r.u0 = u; if (u > r.u1) r.u1 = u; if (v < r.v0) r.v0 = v; if (v > r.v1) r.v1 = v; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
  };
  const sill = op.sill || 0;
  for (const part of shell.storeys[sid]) {
    const k = part.key || '';
    const kind = /^frame\|win/.test(k) ? 'frame' : /^glass\|win/.test(k) ? 'glass' : /^white\|out/.test(k) ? 'board' : null;
    if (!kind) continue;
    if (kind === 'frame' && !res.frameKey) res.frameKey = k;
    const pos = part.pos;
    for (let i = 0; i < pos.length; i += 3) {
      const rx = pos[i] - w.a[0], rz = pos[i + 2] - w.a[1], y = pos[i + 1];
      const u = rx * d[0] + rz * d[1], v = rx * n[0] + rz * n[1];
      if (u < s - 0.12 || u > e + 0.12 || Math.abs(v) > 0.5) continue;
      if (kind === 'board' ? (y < sill - 0.1 || y > sill + 0.4) : (y < sill - 0.3 || y > sill + op.h + 0.3)) continue;
      grow(kind, u, v, y);
    }
  }
  cache.set(key, res);
  return res;
}
function mergeBoxGeos(geos) {
  if (geos.length === 1) return geos[0];
  const flat = geos.map(g0 => (g0.index ? g0.toNonIndexed() : g0));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = flat[0].attributes[name].itemSize;
    const arr = new Float32Array(flat.reduce((n, g0) => n + g0.attributes[name].array.length, 0));
    let o = 0;
    for (const g0 of flat) { arr.set(g0.attributes[name].array, o); o += g0.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g0 of geos) g0.dispose();
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
const handleMat = () => libMaterial('Metal028') || mat('handle', () => new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.32, metalness: 0.75 }));
/** the small parts of a handle, baked into one mesh per material (many doors × many parts would be slow to draw) */
function handleBake() {
  const bins = new Map();
  return {
    put(geo, m, o3) { o3.updateMatrix(); geo.applyMatrix4(o3.matrix); if (!bins.has(m)) bins.set(m, []); bins.get(m).push(geo); },
    into(grp, ud) {
      // (too small to cast a shadow worth drawing)
      for (const [m, geos] of bins) { const me = new THREE.Mesh(mergeBoxGeos(geos), m); Object.assign(me.userData, ud); grp.add(me); }
    },
  };
}
Object.assign(View3D.prototype, {
  /** a lever handle on one face of a leaf: at plan point p (on the face), the face looking along `out`, the lever
   *  pointing along d·towards; added to group `grp` whose origin is at plan point `origin` */
  leverHandle(grp, p, d, out, towards, opId, origin = [0, 0]) {
    const HY = 1.05, bake = handleBake();
    const at = (k, dy) => { const q = V.add(p, V.mul(out, k)); return [q[0] - origin[0], HY + (dy || 0), q[1] - origin[1]]; };
    const axis = new THREE.Vector3(out[0], 0, out[1]), up = new THREE.Vector3(0, 1, 0);
    const add = (geo, pos, alongOut) => {
      const o3 = new THREE.Object3D();
      if (alongOut) o3.quaternion.setFromUnitVectors(up, axis);
      else o3.rotation.y = Math.atan2(-d[1], d[0]);
      o3.position.set(...pos);
      bake.put(geo, handleMat(), o3);
    };
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 20), at(0.004), true);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 12), at(0.028), true);
    const lv = at(0.052); const off = V.mul(d, towards * 0.058);
    add(new THREE.BoxGeometry(0.135, 0.019, 0.02), [lv[0] + off[0], lv[1], lv[2] + off[1]], false);
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 16), at(0.003, -0.072), true);
    bake.into(grp, { door: opId, handle: true });
  },
  /** where a door or opening goes through a wall the floor runs on under it (split where the rooms meet, each half
   *  in its room's floor), or a threshold when one side is outside; in an outside wall made of layers (inner leaf,
   *  insulation, brick) the cavity is closed around every opening: the frame goes on to the inner leaf (façade
   *  doors and windows) or the reveal is plastered (a cavity wall between two rooms) */
  buildOpeningFills(g, en, o) {
    const { hasShell, fromModel, cutH, endM } = o;
    const plan = en.plan, sid = en.storey.id;
    const floorsOn = this.spec.floors !== false, outsideOn = this.spec.outside !== false;
    const frameM = shellMaterial('frame|odoor', { kind: 'frame', color: [0.95, 0.95, 0.93] });
    const stoneM = mat('threshold', () => new THREE.MeshStandardMaterial({ color: 0x8f918f, roughness: 0.7 }));
    const yCut = y => (cutH != null ? Math.min(y, cutH) : y);
    const done = new Set();
    // boxes are gathered per material and drawn as one mesh each (a house has many openings)
    const bins = new Map();
    const addBox = (geo, m, tag) => { const k = m.uuid + '|' + tag; if (!bins.has(k)) bins.set(k, { m, tag, geos: [] }); bins.get(k).geos.push(geo); };
    for (const op of plan.openings) {
      if (op.leaf || done.has(op.id)) continue;
      const w = plan.walls.find(x => x.id === op.wall);
      if (!w || w.storey !== sid || (hasShell && isShellLayerWall(w))) continue;
      if (wallLen(w) < 0.05 || !(op.w > 0.05)) continue;
      const d = wallDir(w), n = V.perp(d), rot = Math.atan2(-d[1], d[0]);
      const s = op.pos - op.w / 2, e = op.pos + op.w / 2;
      const sill = op.sill || 0, top = sill + op.h;
      // a door, an opening or a window down to the floor: the floor (or a threshold) goes on under it
      const low = sill < 0.05;
      const asm = w.kind !== 'interior' ? assemblyOpenings(plan, op) : [];
      for (const a of asm) done.add(a.id);
      const frame = { o: w.a, d, n };
      // the wall's layers: those with this opening in them, and those running past it (an opening of the brick
      // that wasn't matched to this one still has the brick beside it)
      const cOp = V.add(w.a, V.mul(d, op.pos));
      const layers = [w, ...asm.map(a => plan.walls.find(x => x.id === a.wall)).filter(Boolean)];
      if (w.kind !== 'interior') for (const w2 of assemblyWalls(plan, w)) {
        if (layers.includes(w2)) continue;
        const t2 = V.dot(V.sub(cOp, w2.a), wallDir(w2));
        if (t2 > 0.02 && t2 < wallLen(w2) - 0.02) layers.push(w2);
      }
      const faces = layers.map(x => ({ w: x, v: fxWallV(frame, x) }));
      const V0 = Math.min(...faces.map(f => f.v[0])), V1 = Math.max(...faces.map(f => f.v[1]));
      // the widest opening of the layers (the brick's can be a little wider than the inner leaf's)
      let us = s, ue = e;
      for (const a of asm) { const wa = plan.walls.find(x => x.id === a.wall); if (!wa) continue; const r = fxRebase(fxBox(wa, a), frame); us = Math.min(us, r.u0); ue = Math.max(ue, r.u1); }
      const shellFrame = hasShell && fromModel(w, op);
      const at = (u, v) => V.add(w.a, V.add(V.mul(d, u), V.mul(n, v)));
      const box = (u0, u1, v0, v1, y0, y1, m, tag) => {
        y1 = yCut(y1);
        if (u1 - u0 < 0.002 || v1 - v0 < 0.002 || y1 - y0 < 0.002) return;
        const geo = new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0).rotateY(rot);
        const c = at((u0 + u1) / 2, (v0 + v1) / 2);
        addBox(geo.translate(c[0], (y0 + y1) / 2, c[1]), m, tag);
      };
      // 1. the cavity: where no layer is drawn (the insulation is not drawn when the model brings the façade)
      if (layers.length > 1 && outsideOn) {
        // (the model's brick can sit a centimetre off the plan's line: reach a little further into it)
        const drawn = faces.filter(f => !(hasShell && f.w.kind === 'insulation')).map(f => ({ v: f.v, tol: hasShell && f.w.leaf === 'outer' ? 0.015 : 0.003 })).sort((a, b) => a.v[0] - b.v[0]);
        const gaps = [];
        let cur = V0, curTol = 0.003;
        for (const { v: [a, b], tol } of drawn) { if (a > cur + 0.005) gaps.push([cur - curTol, a + tol]); if (b > cur) { cur = b; curTol = tol; } }
        const lm = shellFrame ? frameM : endM;
        const yb = low ? -0.08 : sill;
        // the linings reach 10 cm into the wall beside the opening, less where the next opening is closer
        let kl = 0.1, kr = 0.1;
        for (const o2 of openingsOf(plan, w.id)) {
          if (o2.id === op.id) continue;
          const s2 = o2.pos - o2.w / 2, e2 = o2.pos + o2.w / 2;
          if (e2 <= s + 0.001) kl = Math.min(kl, Math.max(0, (s - e2) / 2));
          if (s2 >= e - 0.001) kr = Math.min(kr, Math.max(0, (s2 - e) / 2));
        }
        for (const [ga, gb] of gaps) {
          // (1 mm proud of the leaves' reveals: their faces never lie in one plane, and the edges of the leaves'
          // cavity faces stay hidden)
          box(s - kl, s + 0.001, ga, gb, yb, top, lm, 'reveal');
          box(e - 0.001, e + kr, ga, gb, yb, top, lm, 'reveal');
          if (cutH == null || top < cutH) box(s - kl, e + kr, ga, gb, top - 0.001, top + 0.1, lm, 'reveal');
          if (!low) box(s - kl, e + kr, ga, gb, sill - 0.1, sill + 0.001, lm, 'reveal');
        }
      }
      // 1b. a window of the model: the frame's bottom rail goes up to just above the window board (the glass starts
      //     there), and under the board the frame closes the space down to the inner wall – no gap to look through
      if (op.kind === 'window' && !low && shellFrame && outsideOn) {
        const mw = modelWindowInfo(this.spec.shell, sid, w, op);
        if (mw && mw.frame && mw.glass) {
          const fM = mw.frameKey ? shellMaterial(mw.frameKey, this.spec.shell.materials[mw.frameKey] || { kind: 'frame', color: [0.95, 0.95, 0.93] }) : frameM;
          const fb = mw.frame.y0;
          const board = mw.board && mw.board.y0 < fb + 0.35 && mw.board.y0 > fb - 0.05 ? mw.board : null;
          const top = Math.min((board ? board.y1 : mw.glass.y0 + 0.06) + 0.02, mw.glass.y1 - 0.2);
          if (top > fb + 0.005) box(mw.frame.u0, mw.frame.u1, mw.frame.v0 - 0.001, mw.frame.v1 + 0.001, fb, top, fM, 'winRail');
          if (board) {
            // the inside: from the frame to the room side of the inner leaf, from the top of the wall up to the board
            const inSide = Math.sign((board.v0 + board.v1) / 2 - (mw.frame.v0 + mw.frame.v1) / 2) || 1;
            const vFrame = inSide > 0 ? mw.frame.v1 : mw.frame.v0, vRoom = inSide * (w.t / 2 + 0.001);
            if (board.y0 > sill + 0.005) box(Math.max(s, mw.frame.u0), Math.min(e, mw.frame.u1), Math.min(vFrame, vRoom), Math.max(vFrame, vRoom), sill - 0.001, board.y0, fM, 'winRail');
          }
        }
      }
      // 2. under a door or an opening: the floor of the rooms on both sides, or a threshold to the outside
      if (!low || !floorsOn) continue;
      const side = sign => {
        // walk out from the wall until a room is reached (where its floor starts), at three places along the opening
        let best = null;
        for (const u of [op.pos, s + Math.min(0.08, op.w / 3), e - Math.min(0.08, op.w / 3)]) {
          for (let v = sign > 0 ? V1 : V0, k = 0; k < 60; k++, v += sign * 0.01) {
            const r = this.roomAt(plan, sid, at(u, v + sign * 0.005));
            if (r) { if (!best || sign * v > sign * best.v) best = { room: r, v }; break; }
          }
        }
        return best;
      };
      const A = side(-1), B = side(1);
      if (A && B) {
        const vA = A.v - 0.012, vB = B.v + 0.012, vm = (V0 + V1) / 2;
        for (const [v0, v1, r] of [[vA, vm, A.room], [vm, vB, B.room]]) {
          if (v1 - v0 < 0.002) continue;
          const pts = [at(s, v0), at(e, v0), at(e, v1), at(s, v1)];
          const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
          // (gathered per floor material with the boxes: one mesh per floor)
          // (its tiles on the room's grid, task 0039)
          addBox(floorTileUVs(new THREE.ShapeGeometry(shape), plan, r).rotateX(-Math.PI / 2).translate(0, 0.002, 0), floorMaterial(r.floor), 'floorStrip');
        }
      } else if (A || B) {
        // to the outside: a threshold from the room's floor to just past the outside face (as wide as this
        // opening through the wall itself, as wide as the widest layer's opening outside it)
        const inner = A || B, out = A ? 1 : -1;
        const vIn = inner.v - out * 0.012, vOut = out > 0 ? V1 + 0.025 : V0 - 0.025;
        const vMid = out * w.t / 2;
        const ty = shellFrame ? 0.02 : 0.008, tm = shellFrame ? frameM : stoneM;
        box(s, e, Math.min(vIn, vMid), Math.max(vIn, vMid), -0.08, ty, tm, 'threshold');
        // (the model's opening in the brick can be a little wider than the plan's: the ends go into the brick)
        const wide = shellFrame ? 0.035 : 0;
        box(us - wide, ue + wide, Math.min(vMid, vOut), Math.max(vMid, vOut), -0.2, ty, tm, 'threshold');
      }
    }
    for (const { m, tag, geos } of bins.values()) {
      const mesh = new THREE.Mesh(mergeBoxGeos(geos), m);
      mesh.castShadow = tag !== 'floorStrip'; mesh.receiveShadow = true;
      mesh.userData[tag] = true;
      if (tag === 'threshold' || tag === 'floorStrip') mesh.userData.walk = true;
      g.add(mesh);
    }
  },

  /** the leaves of a door (any type) in an opening hl (s..e along the wall) */
  buildDoorLeaves(g, w, op, hl, d, n, cutH, en, matNew) {
    const st = doorStyle(op);
    const side = op.swing === 'right' ? -1 : 1;
    const isNew = en.diff && en.diff.newOpenings.some(o => o.op.id === op.id);
    const leafMat = isNew ? matNew : mat('door', () => new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.6 }));
    const frameMat = isNew ? matNew : mat('doorframe-dark', () => new THREE.MeshStandardMaterial({ color: 0x3a3f42, roughness: 0.4, metalness: 0.3 }));
    const glassMat = mat('glass', () => skyReflect(new THREE.MeshStandardMaterial({ color: 0xa8c8d8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1, depthWrite: false }), 0.5));
    const leafH = Math.min(op.h - 0.02, cutH != null ? cutH : 99);
    const metalM = isNew ? matNew : handleMat();
    const HY = 1.05;   // handle height
    /** a handle on both faces of a leaf (local x along the leaf from its hinge, faces at z = ±0.02) */
    const handle = (grp, x, kind, dir) => {
      if (HY > leafH - 0.1) return;
      const bake = handleBake();
      const part = (geo, m, px, py, pz, turn) => { const o3 = new THREE.Object3D(); if (turn) o3.rotation.x = Math.PI / 2; o3.position.set(px, py, pz); bake.put(geo, m, o3); };
      for (const zs of [1, -1]) {
        const f = zs * 0.02;
        if (kind === 'lever') {
          // a rose, a neck and a lever pointing back towards the hinge; a small key rose below
          part(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 20), metalM, x, HY, f + zs * 0.004, true);
          part(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 12), metalM, x, HY, f + zs * 0.028, true);
          part(new THREE.BoxGeometry(0.135, 0.019, 0.02), metalM, x + dir * 0.058, HY, f + zs * 0.052);
          part(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 16), metalM, x, HY - 0.072, f + zs * 0.003, true);
        } else if (kind === 'bar') {
          // a bar pull on a sliding leaf
          part(new THREE.BoxGeometry(0.02, 0.34, 0.02), metalM, x, HY, f + zs * 0.042);
          for (const dy of [-0.15, 0.15]) part(new THREE.CylinderGeometry(0.007, 0.007, 0.032, 10), metalM, x, HY + dy, f + zs * 0.017, true);
        } else if (kind === 'flush') {
          // a recessed pull in a pocket door
          part(new THREE.BoxGeometry(0.03, 0.16, 0.004), metalM, x, HY, f + zs * 0.0015);
        } else {
          part(new THREE.SphereGeometry(0.022, 14, 10), metalM, x, HY, f + zs * 0.035);
          part(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), metalM, x, HY, f + zs * 0.012, true);
        }
      }
      bake.into(grp, { door: op.id, handle: true });
    };
    const leafMesh = (lw, glass, hd) => {
      const grp = new THREE.Group();
      if (hd) handle(grp, hd.x, hd.kind, hd.dir || -1);
      if (glass) {
        const fr = 0.05;
        for (const [bw, bh, x, y] of [[lw, fr, lw / 2, leafH - fr / 2], [lw, fr, lw / 2, fr / 2], [fr, leafH, fr / 2, leafH / 2], [fr, leafH, lw - fr / 2, leafH / 2]]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.04), frameMat); b.position.set(x, y, 0); b.userData.door = op.id; b.castShadow = true; grp.add(b);
        }
        const gl = new THREE.Mesh(new THREE.BoxGeometry(lw - 2 * fr, leafH - 2 * fr, 0.01), glassMat); gl.position.set(lw / 2, leafH / 2, 0); gl.userData.door = op.id; grp.add(gl);
      } else {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, leafH, 0.04), leafMat);
        leaf.position.set(lw / 2, leafH / 2, 0); leaf.castShadow = true; leaf.userData.door = op.id; grp.add(leaf);
        if (st === 'folding') { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, leafH, 0.045), frameMat); seam.position.set(lw / 2, leafH / 2, 0); grp.add(seam); }
      }
      return grp;
    };
    if (st === 'sliding' || st === 'pocket') {
      const lw = Math.max(0.1, hl.e - hl.s + (st === 'sliding' ? 0.06 : 0));
      const c = V.add(V.add(w.a, V.mul(d, (hl.s + hl.e) / 2)), V.mul(n, st === 'sliding' ? side * (w.t / 2 + 0.03) : 0));
      const base = new THREE.Group();
      base.position.set(c[0], 0, c[1]);
      base.rotation.y = Math.atan2(-d[1], d[0]);
      const slide = new THREE.Group();
      // the pull on the edge that stays in reach when it slides open
      const trailing = op.hinge === 'end' ? 0.07 : lw - 0.07;
      const leaf = leafMesh(lw, false, { x: trailing, kind: st === 'pocket' ? 'flush' : 'bar' });
      leaf.position.x = -lw / 2;
      slide.add(leaf);
      // it slides towards its hinge side: along −x (the wall's start) or +x
      const full = (op.hinge === 'end' ? 1 : -1) * (hl.e - hl.s) * 0.92;
      slide.position.x = this.doorClosed(op.id) ? 0 : full;
      this.registerDoor(op.id, slide, full, true);
      base.add(slide);
      g.add(base);
      return;
    }
    const parts = st === 'double' ? [[hl.s, (hl.s + hl.e) / 2, 'start'], [(hl.s + hl.e) / 2, hl.e, 'end']] : [[hl.s, hl.e, op.hinge]];
    for (const [hs, he, hinge] of parts) {
      const hingeAt = hinge === 'end' ? he : hs;
      const dirSign = hinge === 'end' ? -1 : 1;
      const leafW = Math.max(0.1, he - hs - 0.03);
      const pivot = new THREE.Group();
      const hp = V.add(V.add(w.a, V.mul(d, hingeAt)), V.mul(n, side * (w.t / 2)));
      pivot.position.set(hp[0], 0, hp[1]);
      pivot.rotation.y = Math.atan2(-d[1] * dirSign, d[0] * dirSign);
      const open = new THREE.Group();
      // the handle near the free edge (on a glass door: on its stile)
      open.add(leafMesh(leafW, st === 'glass', { x: leafW - (st === 'glass' ? 0.025 : 0.065), kind: st === 'folding' ? 'knob' : 'lever', dir: -1 }));
      // open (almost square to the wall) or closed, towards the swing side; tapping the door swings it
      const full = -side * dirSign * (st === 'folding' ? DOOR_OPEN * 0.6 : DOOR_OPEN);
      open.rotation.y = this.doorClosed(op.id) ? 0 : full;
      this.registerDoor(op.id, open, full);
      pivot.add(open);
      g.add(pivot);
    }
  },
  /** a window's frame and sashes (windows drawn by the app; the builder's model brings its own) */
  buildWindowFrame(g, w, op, hl, d, n, y0, y1) {
    if (y1 - y0 < 0.05) return;
    const st = windowStyle(op);
    const white = mat('winframe', () => new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.5 }));
    const dark = mat('winhandle', () => new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.3, metalness: 0.6 }));
    const L = hl.e - hl.s, H = y1 - y0, fr = 0.055, dep = Math.min(0.09, w.t * 0.6);
    const grp = new THREE.Group();
    const c = V.add(w.a, V.mul(d, (hl.s + hl.e) / 2));
    grp.position.set(c[0], y0, c[1]);
    grp.rotation.y = Math.atan2(-d[1], d[0]);
    const box = (bw, bh, bd, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); b.position.set(x, y, z); b.castShadow = true; grp.add(b); return b; };
    box(L, fr, dep, 0, H - fr / 2, 0, white); box(L, fr, dep, 0, fr / 2, 0, white);
    box(fr, H, dep, -L / 2 + fr / 2, H / 2, 0, white); box(fr, H, dep, L / 2 - fr / 2, H / 2, 0, white);
    const side = op.swing === 'right' ? -1 : 1, zin = side * dep / 2;
    if (st === 'turn' || st === 'tilt') {
      if (L > 1.1) box(fr, H, dep, 0, H / 2, 0, white);
      const hx = L > 1.1 ? fr * 1.2 : (op.hinge === 'end' ? -1 : 1) * (L / 2 - fr * 1.6);
      box(0.025, 0.12, 0.03, hx, H / 2, zin + side * 0.015, dark);
    } else if (st === 'sliding') {
      box(fr, H, dep, 0, H / 2, 0, white);
      box(L / 2, 0.02, dep * 0.4, -L / 4, H / 2, zin * 0.5, white);
    } else if (st === 'top') {
      box(L, fr, dep, 0, H * 0.72, 0, white);
      box(0.12, 0.025, 0.03, 0, fr * 1.5, zin + side * 0.015, dark);
    }
    g.add(grp);
  },
});

/* ───────── the details and the tool ───────── */
Object.assign(app, {
  openingTypeRow(op, ro, upd) {
    if (op.kind === 'door') return this.segRow(t('Door type'), DOOR_STYLES, doorStyle(op), k => upd(o => setOpeningStyle(o, k)), ro, 'door-style');
    if (op.kind === 'window') return this.segRow(t('Window type'), WINDOW_STYLES, windowStyle(op), k => upd(o => setOpeningStyle(o, k)), ro, 'win-style');
    return null;
  },
  openingTypeChips(box, chip, kind) {
    const o = this.toolOpts;
    if (kind === 'door') { box.appendChild(h('span', { class: 'lbl' }, t('Type'))); for (const [k, lab] of DOOR_STYLES) box.appendChild(chip(t(lab), (o.doorStyle || 'hinged') === k, () => { o.doorStyle = k; })); }
    if (kind === 'window') { box.appendChild(h('span', { class: 'lbl' }, t('Type'))); for (const [k, lab] of WINDOW_STYLES) box.appendChild(chip(t(lab), (o.winStyle || 'fixed') === k, () => { o.winStyle = k; })); }
  },
});
