/* ───────────── finish.js — finishes per wall (paint or an accent colour, renovlies, wallpaper from a picture,
   tiles to a height or full height, with a tile counter) and the ceiling of each room ─────────────

   A room has one finish for all its walls: wallColor + wallColorName (the paint), wallBase ('paint' | 'renovlies' |
   'paper'), wallPaper ({ img, w, h, fit: 'repeat' | 'fill', name }; w, h = one repeat in metres) and tiles
   ({ to, w, h, joint, color, grout, lay: 'stack' | 'half', waste (%), name }; to = 0: full height).
   One wall can have its own finish on the side of one room: wall.fin[roomId] = { any of color, name, base, paper,
   tiles } (tiles: null = no tiles on this wall, even when the room has them).
   Ceiling per room: ceilingColor, ceilingName, ceilingFinish, ceilingH (null: the storey's wall height).
   Pictures are kept once per house: project.images[id] = { name, asset (the JPEG in the assets store), w, h (pixels),
   avg (its average colour) }. */

const COVERINGS = [['paint', 'Paint'], ['renovlies', 'Renovlies + paint'], ['paper', 'Wallpaper']];
const CEIL_FINISHES = [['paint', 'Paint, matt'], ['spray', 'Spray plaster (spuitwerk)'], ['plaster', 'Smooth plaster (stucwerk)'], ['wood', 'Wood or panels'], ['system', 'Suspended ceiling']];
const CEIL_DEFAULT = '#F7F6F2';
const TILE_DEFAULT = { to: 1.2, w: 0.3, h: 0.6, joint: 0.003, color: '#E9E6DF', grout: '#C9C4BA', lay: 'stack', waste: 10, name: '' };
const FIN_KEYS = ['color', 'name', 'base', 'paper', 'tiles', 'sheen'];
const FACE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* ───────── what a wall looks like ───────── */
function roomFinish(r) {
  return { color: r.wallColor || WALL_FINISH_DEFAULT, name: r.wallColorName || '', base: r.wallBase || 'paint', paper: r.wallPaper || null, tiles: r.tiles || null, sheen: r.wallSheen || 'matt', own: false };
}
/** the finish of one wall on the side of room r: the room's finish, with what this wall has of its own */
function faceFinish(w, r) {
  const R = roomFinish(r);
  const f = w && w.fin && r ? w.fin[r.id] : null;
  if (!f) return R;
  const o = { ...R, own: true };
  for (const k of FIN_KEYS) if (k in f) o[k] = f[k];
  return o;
}
const roomCeilH = (r, st) => (r && r.ceilingH > 0 ? r.ceilingH : (st ? st.wallHeight : DEFAULTS.wallHeight)) || DEFAULTS.wallHeight;

/** where the rooms of a storey run along the sides of its walls → [{ wall, room, side, u0, u1, edge }]
 *  side +1 = the wall's left side (V.perp of its direction); u0..u1 in metres from the wall's start.
 *  A room edge counts when it runs parallel to a wall, on the wall's face (or its centre line). */
function wallFaces(plan, sid, onlyRooms, corners) {
  const rooms = (onlyRooms || plan.rooms).filter(r => r.storey === sid && r.poly && r.poly.length >= 3);
  const out = [];
  if (!rooms.length) return out;
  const geo = rooms.map(r => ({ r, sgn: Math.sign(polygonArea(r.poly)) || 1, bb: bboxOfPoints(r.poly) }));
  const ext = corners ? wallCornerExt(plan, sid) : null;
  for (const w of plan.walls) {
    if (w.storey !== sid || w.kind === 'insulation' || w.leaf === 'outer') continue;
    const L = wallLen(w);
    if (L < 0.05) continue;
    const [e0, e1] = ext ? ext.get(w.id) || [0, 0] : [0, 0];
    const d = wallDir(w), n = V.perp(d), reach = w.t / 2 + 0.06;
    const wx0 = Math.min(w.a[0], w.b[0]) - reach, wx1 = Math.max(w.a[0], w.b[0]) + reach, wy0 = Math.min(w.a[1], w.b[1]) - reach, wy1 = Math.max(w.a[1], w.b[1]) + reach;
    for (const { r, sgn, bb } of geo) {
      if (bb.minX > wx1 || bb.maxX < wx0 || bb.minY > wy1 || bb.maxY < wy0) continue;
      const P = r.poly, segs = [];
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        const e = V.sub(q, p), el = V.len(e);
        if (el < 0.05 || Math.abs(V.cross(e, d)) / el > 0.03) continue;
        const op = V.dot(V.sub(p, w.a), n), oq = V.dot(V.sub(q, w.a), n), off = (op + oq) / 2;
        if (Math.abs(op - oq) > 0.03 || Math.abs(off) > reach) continue;
        const inward = V.mul(V.perp(V.mul(e, 1 / el)), sgn);
        const side = V.dot(inward, n) > 0 ? 1 : -1;
        if (off * side < -w.t / 4) continue;
        let a = V.dot(V.sub(p, w.a), d), b = V.dot(V.sub(q, w.a), d);
        if (a > b) [a, b] = [b, a];
        a = Math.max(a, -e0); b = Math.min(b, L + e1);
        if (b - a > 0.05) segs.push({ u0: a, u1: b, side, edge: i });
      }
      segs.sort((x, y) => x.side - y.side || x.u0 - y.u0);
      const merged = [];
      for (const sg of segs) {
        const last = merged[merged.length - 1];
        if (last && last.side === sg.side && sg.u0 <= last.u1 + 0.01) last.u1 = Math.max(last.u1, sg.u1);
        else merged.push({ ...sg });
      }
      for (const sg of merged) out.push({ wall: w, room: r, ...sg });
    }
  }
  return out;
}
/** how far the faces of each wall reach past its end points round an outside corner (task 0024): a wall that ends
 *  on another wall (an L or the end of a T) is covered there by the other wall, so its face on the outside of the
 *  corner goes on for half the other wall's thickness → Map(wall id → [past a, past b]). The 3D view and the wall
 *  views keep the centre-line ends; the quantities count the whole face. */
function wallCornerExt(plan, sid) {
  const ws = plan.walls.filter(w => w.storey === sid && w.kind !== 'insulation' && w.leaf !== 'outer' && wallLen(w) >= 0.05);
  const out = new Map();
  for (const w of ws) {
    const d = wallDir(w), res = [0, 0];
    [w.a, w.b].forEach((P, k) => {
      for (const o of ws) {
        if (o === w || Math.abs(V.cross(d, wallDir(o))) < 0.3) continue;
        const od = wallDir(o), L = wallLen(o), u = clamp(V.dot(V.sub(P, o.a), od), 0, L);
        if (V.len(V.sub(P, V.add(o.a, V.mul(od, u)))) <= 0.02) res[k] = Math.max(res[k], o.t / 2);
      }
    });
    if (res[0] || res[1]) out.set(w.id, res);
  }
  return out;
}
/** the walls of one room, in order around the room, lettered A, B, C … (corners: the faces reach round outside
 *  corners, for the quantities) */
function roomFaces(plan, r, corners) {
  const list = wallFaces(plan, r.storey, [r], corners);
  // order around the room: by the edge, then along the edge's direction
  list.sort((a, b) => a.edge - b.edge || edgeAlong(r, a) - edgeAlong(r, b));
  list.forEach((f, i) => { f.letter = i < 26 ? FACE_LETTERS[i] : 'Z' + (i - 25); });
  return list;
}
function edgeAlong(r, f) {
  const p = r.poly[f.edge], q = r.poly[(f.edge + 1) % r.poly.length];
  const mid = V.add(f.wall.a, V.mul(wallDir(f.wall), (f.u0 + f.u1) / 2));
  return V.dot(V.sub(mid, p), V.norm(V.sub(q, p)));
}
/** wall area of one face between heights y0 and y1 (to the room's ceiling, under a sloped top), without the
 *  doors, windows and openings in it */
function faceArea(plan, f, st, y0 = 0, y1 = Infinity) {
  const w = f.wall, H = wallHeight(w, st), ch = roomCeilH(f.room, st);
  const len = f.u1 - f.u0;
  const n = Math.max(1, Math.ceil(len / 0.05)), du = len / n;
  let A = 0;
  for (let i = 0; i < n; i++) {
    const u = f.u0 + (i + 0.5) * du;
    A += Math.max(0, Math.min(wallTopAt(w, u, H), ch, y1) - y0) * du;
  }
  for (const op of faceOpenings(plan, f)) {
    const a = Math.max(op.pos - op.w / 2, f.u0), b = Math.min(op.pos + op.w / 2, f.u1);
    const s0 = op.kind === 'window' ? (op.sill || 0) : 0, s1 = s0 + op.h;
    A -= (b - a) * Math.max(0, Math.min(s1, y1, ch) - Math.max(s0, y0));
  }
  return Math.max(0, A);
}
function faceOpenings(plan, f) {
  return openingsOf(plan, f.wall.id).filter(op => Math.min(op.pos + op.w / 2, f.u1) - Math.max(op.pos - op.w / 2, f.u0) > 0.01);
}
function faceHeight(f, st) { return Math.min(roomCeilH(f.room, st), wallHeight(f.wall, st)); }

/* ───────── tiles ───────── */
/** tiles needed for an area of wall: whole tiles for the area (with the joints), plus the waste */
function tileCount(area, T) {
  if (!T || !(area > 0.0001)) return { area: 0, tiles: 0, m2: 0 };
  const j = T.joint || 0, mod = (T.w + j) * (T.h + j);
  const tiles = Math.ceil(area / mod * (1 + (T.waste || 0) / 100) - 1e-9);
  return { area, tiles, m2: tiles * T.w * T.h };
}
const tileSize = T => `${fmtMM(T.w)} × ${fmtMM(T.h)} mm`;
const tileLabel = T => (T.name ? T.name + ' · ' : '') + tileSize(T);
const tileKey = T => [fmtMM(T.w), fmtMM(T.h), T.name || '', (T.color || '').toLowerCase(), T.joint, T.waste].join('|');
function tilesSummary(T) {
  if (!T) return t('No tiles');
  return (T.to > 0 ? t('Tiles to {h}', { h: fmtM(T.to) }) : t('Tiles full height')) + ', ' + tileSize(T);
}
function finishSummary(fin) {
  const T = fin.tiles;
  if (T && !(T.to > 0)) return tilesSummary(T);
  const base = fin.base === 'paper' ? t('Wallpaper') + (fin.paper && fin.paper.name ? ': ' + fin.paper.name : '') : fin.base === 'renovlies' ? t('Renovlies') + (fin.name ? ', ' + fin.name : '') : (fin.name || t('Paint'));
  return (T ? tilesSummary(T) + ' · ' : '') + base;
}

/** per room: its walls with their finishes and areas, and the tiles per kind of tile */
function roomFinishStats(plan, r, st) {
  const faces = roomFaces(plan, r, true);
  const tiles = new Map();
  let wall = 0, tiled = 0;
  const rows = faces.map(f => {
    const fin = faceFinish(f.wall, f.room);
    const area = faceArea(plan, f, st);
    const T = fin.tiles;
    const tArea = T ? faceArea(plan, f, st, 0, T.to > 0 ? T.to : Infinity) : 0;
    wall += area; tiled += tArea;
    if (T && tArea > 0) {
      const k = tileKey(T);
      if (!tiles.has(k)) tiles.set(k, { T, area: 0 });
      tiles.get(k).area += tArea;
    }
    return { f, fin, area, tArea, cover: Math.max(0, area - tArea), len: f.u1 - f.u0, ops: faceOpenings(plan, f) };
  });
  return { faces: rows, wall, tiled, cover: Math.max(0, wall - tiled), tiles: [...tiles.values()].map(x => ({ ...x, ...tileCount(x.area, x.T) })) };
}

/* ───────── 3D: tiles, wallpaper ───────── */
/** the photo of one tile (a sample), once it is loaded; it goes in every tile */
const tilePhoto = T => (T && T.img ? imageEl(T.img) : null);
const tileTexKey = T => [T.w, T.h, T.joint, T.color, T.grout, T.lay, T.img && tilePhoto(T) ? T.img + ':' + tilePhoto(T).dataset.src : ''].join('|');
function tileTexture(T) {
  const key = 'tile|' + tileTexKey(T);
  if (TEX.has(key)) return TEX.get(key);
  const photo = tilePhoto(T);
  const j = T.joint || 0, mw = T.w + j, mh = T.h + j, rows = T.lay === 'half' ? 2 : 1;
  const W = photo ? 512 : 256, sc = W / mw, H = clamp(Math.round(mh * rows * sc), 8, 2048);
  const ky = H / (mh * rows);
  const cv = makeCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = T.grout || '#C9C4BA'; g.fillRect(0, 0, W, H);
  const jx = Math.max(1, j * sc), jy = Math.max(1, j * ky);
  // the real tile picture (texlib.js): the surface of one tile in each tile, over the chosen colour
  const det = !photo && libSet('Tiles107') ? libDetail('Tiles107', 0.8) : null;
  let seed = 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? W / 2 : 0;
    for (const x0 of [off - W, off, off + W]) {
      const x = x0 + jx / 2, y = r * mh * ky + jy / 2, tw = T.w * sc, th = T.h * ky;
      if (photo) { g.drawImage(photo, x, y, tw, th); continue; }
      const gr = g.createLinearGradient(x, y, x + tw, y + th);
      gr.addColorStop(0, shade(T.color, 1.04)); gr.addColorStop(1, shade(T.color, 0.97));
      g.fillStyle = gr; g.fillRect(x, y, tw, th);
      if (det) {
        const [px, py, pw, ph] = libPiece('Tiles107', rnd, T.w / T.h);
        g.globalCompositeOperation = 'soft-light'; g.drawImage(det, px, py, pw, ph, x, y, tw, th); g.globalCompositeOperation = 'source-over';
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / mw, 1 / (mh * rows));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.userData.hq = { relief: 0.003 };
  if (det) tex.userData.lib = 'Tiles107';
  TEX.set(key, tex);
  return tex;
}
const tileMat = T => mat('tilem|' + tileTexKey(T), () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: tileTexture(T), roughness: 0.32, metalness: 0 }));

const IMG_EL = new Map();
function projectImage(id) { const p = app.project; return p && p.images ? p.images[id] : null; }
/** the picture's data URL (null while it is still being read from the device) */
function imageSrc(rec) {
  if (!rec) return null;
  if (rec.src) return rec.src;
  const a = Assets.get(rec.asset);
  if (a) return a.url;
  if (!IMG_ASK.has(rec.asset)) { IMG_ASK.add(rec.asset); Assets.ensure([rec.asset]).then(() => { IMG_ASK.delete(rec.asset); if (app.project && Assets.get(rec.asset)) { app.refreshViews(false); app.renderInspector(); } }); }
  return null;
}
const IMG_ASK = new Set();
/** the picture, once it is decoded (the first time: null, and the views are redrawn when it is ready) */
function imageEl(id) {
  const rec = projectImage(id), src = imageSrc(rec);
  if (!src) return null;
  let im = IMG_EL.get(id);
  if (!im || im.dataset.src !== (rec.asset || String(src.length))) {
    im = new Image();
    im.dataset.src = rec.asset || String(src.length);
    im.onload = () => { if (app.project) app.refreshViews(false); };
    im.src = src;
    IMG_EL.set(id, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
function imageTex(id) {
  const im = imageEl(id);
  if (!im) return null;
  const key = 'img|' + id + '|' + im.dataset.src;
  if (TEX.has(key)) return TEX.get(key);
  const tex = new THREE.Texture(im);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  tex.needsUpdate = true;
  TEX.set(key, tex);
  return tex;
}
/** wallpaper: the picture repeated at its real size, or stretched over the whole wall (photo wallpaper) keeping
 *  its proportions (cut off at the sides or top) */
function paperMat(P, f, sign, H) {
  const base = imageTex(P.img);
  if (!base) return null;
  const fill = P.fit === 'fill';
  const key = 'paper|' + P.img + '|' + base.image.dataset.src + '|' + (fill ? ['fill', f.u0.toFixed(3), f.u1.toFixed(3), sign, H.toFixed(3)].join('|') : (P.w + '|' + P.h));
  return mat(key, () => {
    const tex = base.clone();
    if (fill) {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const len = Math.max(0.05, f.u1 - f.u0), aImg = base.image.naturalWidth / base.image.naturalHeight, aFace = len / H;
      const sx = aImg >= aFace ? aFace / aImg : 1, sy = aImg >= aFace ? 1 : aImg / aFace;
      const ox = (1 - sx) / 2, oy = (1 - sy) / 2;
      tex.repeat.set(sx / len, sy / H);
      tex.offset.set(sign > 0 ? ox - sx * f.u0 / len : ox + sx * f.u1 / len, oy);
    } else {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / Math.max(0.02, P.w || 0.53), 1 / Math.max(0.02, P.h || 0.53));
    }
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.9, metalness: 0 });
  });
}
/** the material of one side of a wall piece that starts at height yb */
function finishMat(fin, yb, f, sign, H) {
  const T = fin.tiles;
  if (T && (!(T.to > 0) || yb < T.to - 0.001)) return tileMat(T);
  if (fin.base === 'paper' && fin.paper && fin.paper.img) {
    const m = paperMat(fin.paper, f, sign, H);
    if (m) return m;
    const im = projectImage(fin.paper.img);
    return wallMat(im && im.avg || fin.color);
  }
  return paintMat(fin.color, fin.sheen, fin.base);
}

Object.assign(View3D.prototype, {
  /** a tap on the inside of a wall (Build): that room, with this wall opened in its details */
  faceFromHit(hit) {
    const u = hit.object.userData;
    if (!u.wallId || !hit.face) return null;
    const mi = hit.face.materialIndex, side = mi === 4 ? 1 : mi === 5 ? -1 : 0;
    if (!side) return null;
    const v = getVersion(this.app.project, u.versionId);
    const pp = this.planPoint(hit);
    if (!v || !pp) return null;
    const w = v.plan.walls.find(x => x.id === u.wallId);
    if (!w) return null;
    const along = V.dot(V.sub([pp.x, pp.y], w.a), wallDir(w));
    const f = wallFaces(v.plan, u.storeyId).find(x => x.wall.id === w.id && x.side === side && along >= x.u0 - 0.02 && along <= x.u1 + 0.02);
    return f ? { type: 'room', id: f.room.id, storey: u.storeyId, versionId: u.versionId, readOnly: !u.edit, face: w.id } : null;
  },
});

/* ───────── 2D: the finish along each wall ───────── */
Object.assign(PlanView.prototype, {
  /** "colour rooms by walls": a band along every wall in its finish (tiles with their joints); a selected room
   *  shows its walls with letters */
  drawFinishes(g, en) {
    const sel = this.spec.selection;
    const all = this.spec.colorBy === 'walls';
    const selRoom = sel && sel.type === 'room' && en.edit !== false && this.spec.mode === 'build' ? sel.id : null;
    if (!all && !selRoom) return;
    const faces = wallFaces(en.plan, en.storey.id, all ? null : en.plan.rooms.filter(r => r.id === selRoom));
    const bw = 0.1;
    for (const f of faces) {
      const fin = faceFinish(f.wall, f.room);
      const w = f.wall, d = wallDir(w), n = V.mul(V.perp(d), f.side);
      const at = (u, k) => V.add(V.add(w.a, V.mul(d, u)), V.mul(n, w.t / 2 + k));
      const pts = [at(f.u0, 0), at(f.u1, 0), at(f.u1, bw), at(f.u0, bw)];
      const T = fin.tiles;
      const im = fin.base === 'paper' && fin.paper && projectImage(fin.paper.img);
      const fill = T ? T.color : im ? (im.avg || fin.color) : fin.color;
      const isSel = selRoom === f.room.id && sel.face === w.id;
      g.appendChild(s('polygon', { points: pts.map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(' '), fill, class: 'fin-band' + (fin.own ? ' own' : '') + (im ? ' paper' : '') + (isSel ? ' sel' : ''), 'data-face': w.id }));
      if (T) {
        const a = at(f.u0, bw / 2), b = at(f.u1, bw / 2), step = Math.max(0.04, T.w + (T.joint || 0));
        g.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'fin-ticks', stroke: T.grout || '#C9C4BA', 'stroke-width': bw, 'stroke-dasharray': `0.012 ${(step - 0.012).toFixed(4)}` }));
      }
    }
  },
  /** letters A, B, C … on the walls of the selected room */
  drawFaceLabels(g) {
    const sel = this.spec.selection;
    if (!sel || sel.type !== 'room' || this.spec.mode !== 'build' || this.cam.s < 18) return;
    for (const en of this.spec.entries) {
      if (en.wallsOnly || en.edit === false) continue;
      const r = en.plan.rooms.find(x => x.id === sel.id && x.storey === en.storey.id);
      if (!r) continue;
      // small rooms on screen: smaller letters, closer to their wall
      const bb = bboxOfPoints(r.poly), px = Math.min(bb.w, bb.h) * this.cam.s;
      const rad = px < 70 ? 6.5 : 9, gap = clamp(px * 0.12 - 2, 0, 12);
      for (const f of roomFaces(en.plan, r)) {
        const w = f.wall, d = wallDir(w), n = V.mul(V.perp(d), f.side);
        const m = V.add(V.add(w.a, V.mul(d, (f.u0 + f.u1) / 2)), V.mul(n, w.t / 2 + 0.035));
        const p = this.toScreen([m[0] + en.offset[0], m[1] + en.offset[1]]);
        const q = [p[0] + n[0] * (gap + rad * 0.6), p[1] + n[1] * (gap + rad * 0.6)];
        const tg = s('g', { class: 'face-tag' + (sel.face === w.id ? ' sel' : '') + (rad < 9 ? ' small' : ''), transform: `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`, 'data-face': w.id });
        tg.appendChild(s('circle', { r: rad }));
        tg.appendChild(s('text', { y: rad < 9 ? 3 : 4 }, f.letter));
        g.appendChild(tg);
      }
    }
  },
});

/* ───────── the details panel: walls and ceiling of a room, finish of a wall ───────── */
Object.assign(app, {
  /** number field in another unit (cm, mm, %): value shown as is */
  numField(label, id, value, unit, onChange, opts = {}) {
    const inp = h('input', { class: 'input', id, type: 'text', inputmode: 'decimal', value: value == null ? '' : String(+(+value).toFixed(opts.dec ?? 1)), placeholder: opts.placeholder || '', disabled: opts.disabled, autocomplete: 'off' });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.trim().replace(',', '.'));
      if (!isFinite(v) || v < (opts.min ?? 0) || (opts.max != null && v > opts.max)) { inp.value = value == null ? '' : String(value); return; }
      onChange(v);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    return h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, unit)));
  },
  segRow(label, items, cur, onPick, ro, cls = '') {
    return h('div', { class: 'field' }, h('span', { class: 'flabel' }, label),
      h('div', { class: 'seg wrap ' + cls }, ...items.map(([k, lab]) => h('button', { 'aria-pressed': String(cur === k), 'data-k': k, disabled: ro, onclick: () => onPick(k) }, t(lab)))));
  },

  /** colour, paint name, covering (paint, renovlies, wallpaper) and tiles; set(patch, opts) stores a change */
  finishControls(box, fin, set, ro, pre) {
    const wc = h('input', { type: 'color', id: pre + '-wall-col', value: fin.color, disabled: ro, 'aria-label': t('Wall colour') });
    wc.addEventListener('input', () => set({ color: wc.value }, { coalesce: pre + 'wc' }));
    const wn = h('input', { class: 'input', id: pre + '-wall-name', value: fin.name || '', placeholder: t('e.g. RAL 9010, Sigma Pearl Clean Matt'), disabled: ro, autocomplete: 'off' });
    wn.addEventListener('input', () => set({ name: wn.value }, { coalesce: pre + 'wn' }));
    const wallSw = ['#F4F2EC', '#F1EDE4', '#E9E6DF', '#D9D5CC', '#C9CFCB', '#B7C4C9', '#A3AE9C', '#5E6B6B'];
    box.appendChild(h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Colour')),
      h('div', { class: 'color-row' }, wc, h('div', { class: 'swatches' }, ...wallSw.map(c => h('button', { class: 'swatch', style: { background: c }, disabled: ro, 'aria-label': t('Wall colour') + ' ' + c, 'aria-pressed': String((fin.color || '').toLowerCase() === c.toLowerCase()), onclick: () => set({ color: c }, { keepInspector: false }) }))))));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: pre + '-wall-name' }, t('Paint / colour name')), wn));
    if (!ro) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { const c = await this.colourPicker({ value: fin.color, title: t('Wall colour') }); if (c) set({ color: c.hex, name: c.name }, { keepInspector: false }); } }, icon('eye'), t('Colour library: RAL and my colours'))));
    // covering
    box.appendChild(this.segRow(t('On the wall'), COVERINGS, fin.base || 'paint', k => {
      if (k === 'paper' && !(fin.paper && fin.paper.img)) { this.choosePaper(fin, set); return; }
      set({ base: k }, { keepInspector: false });
    }, ro, 'cover-seg'));
    if (fin.base === 'paper') box.appendChild(this.paperControls(fin, set, ro, pre));
    else box.appendChild(this.segRow(t('Sheen'), SHEENS, fin.sheen || 'matt', k => set({ sheen: k }, { keepInspector: false }), ro, 'sheen-seg'));
    // tiles
    const T = fin.tiles;
    box.appendChild(this.segRow(t('Tiles'), [['none', 'No tiles'], ['to', 'To a height'], ['full', 'Full height']], !T ? 'none' : T.to > 0 ? 'to' : 'full', k => {
      if (k === 'none') set({ tiles: null }, { keepInspector: false });
      else set({ tiles: { ...TILE_DEFAULT, ...(T || {}), to: k === 'full' ? 0 : (T && T.to > 0 ? T.to : TILE_DEFAULT.to) } }, { keepInspector: false });
    }, ro, 'tile-seg'));
    if (T) box.appendChild(this.tileControls(T, set, ro, pre));
  },

  tileControls(T, set, ro, pre) {
    const box = h('div', { class: 'sub-box tile-box' });
    const upT = (patch, opts = {}) => set({ tiles: { ...T, ...patch } }, { keepInspector: false, ...opts });
    if (T.to > 0) box.appendChild(h('div', { class: 'field-row' }, this.mmField(t('Tiles up to'), pre + '-tile-to', T.to, v => upT({ to: clamp(v, 0.1, 6) }), { disabled: ro }), h('div')));
    box.appendChild(h('div', { class: 'field-row' },
      this.mmField(t('Tile width'), pre + '-tile-w', T.w, v => upT({ w: clamp(v, 0.01, 3) }), { disabled: ro }),
      this.mmField(t('Tile height'), pre + '-tile-h', T.h, v => upT({ h: clamp(v, 0.01, 3) }), { disabled: ro })));
    box.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Joint'), pre + '-tile-j', (T.joint || 0) * 1000, 'mm', v => upT({ joint: clamp(v, 0, 20) / 1000 }), { disabled: ro, max: 20 }),
      this.numField(t('Extra for cutting and breakage'), pre + '-tile-waste', T.waste ?? 10, '%', v => upT({ waste: clamp(v, 0, 60) }), { disabled: ro, max: 60, dec: 0 })));
    box.appendChild(this.segRow(t('Laying'), [['stack', 'Straight'], ['half', 'Half bond']], T.lay || 'stack', k => upT({ lay: k }), ro));
    const tc = h('input', { type: 'color', id: pre + '-tile-col', value: T.color || TILE_DEFAULT.color, disabled: ro, 'aria-label': t('Tile colour') });
    tc.addEventListener('input', () => set({ tiles: { ...T, color: tc.value } }, { coalesce: pre + 'tc' }));
    const gc = h('input', { type: 'color', id: pre + '-tile-grout', value: T.grout || TILE_DEFAULT.grout, disabled: ro, 'aria-label': t('Joint colour') });
    gc.addEventListener('input', () => set({ tiles: { ...T, grout: gc.value } }, { coalesce: pre + 'gc' }));
    box.appendChild(h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Tile colour')), tc),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Joint colour')), gc)));
    const nm = h('input', { class: 'input', id: pre + '-tile-name', value: T.name || '', placeholder: t('e.g. Mosa 30 × 60 white matt'), disabled: ro, autocomplete: 'off' });
    nm.addEventListener('input', () => set({ tiles: { ...T, name: nm.value } }, { coalesce: pre + 'tn' }));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: pre + '-tile-name' }, t('Tile name')), nm));
    box.appendChild(this.photoSampleRow(T.img, ro, pre + '-tile', t('Photo of one tile'), async () => {
      const id = await this.pickPicture(T.img, { title: t('Photo of one tile'), empty: t('No pictures yet. Add a photo of one tile, straight from the front; it goes in every tile at the size above.') });
      if (id) upT({ img: id, ...(projectImage(id) && !T.img ? { color: projectImage(id).avg } : {}) });
    }, () => upT({ img: null })));
    return box;
  },
  /** a sample photo (thumbnail, name, choose / remove) */
  photoSampleRow(img, ro, pre, label, choose, remove) {
    const im = img ? projectImage(img) : null;
    return h('div', { class: 'field photo-sample' }, h('span', { class: 'flabel' }, label),
      h('div', { class: 'paper-row' },
        im && imageSrc(im) ? h('img', { class: 'paper-thumb', src: imageSrc(im), alt: '' }) : h('span', { class: 'paper-thumb empty' }),
        h('div', { class: 'paper-meta' }, h('strong', null, im ? im.name : t('None')),
          ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: pre + '-photo', onclick: choose }, icon('image'), im ? t('Change') : t('Choose a photo…')),
            im ? h('button', { class: 'btn sm ghost', id: pre + '-photo-off', onclick: remove }, icon('close'), t('Remove')) : null))));
  },

  paperControls(fin, set, ro, pre) {
    const P = fin.paper || {};
    const im = P.img && projectImage(P.img);
    const box = h('div', { class: 'sub-box paper-box' });
    const upP = patch => set({ paper: { ...P, ...patch } }, { keepInspector: false });
    box.appendChild(h('div', { class: 'paper-row' },
      im && imageSrc(im) ? h('img', { class: 'paper-thumb', src: imageSrc(im), alt: '' }) : h('span', { class: 'paper-thumb empty' }),
      h('div', { class: 'paper-meta' }, h('strong', null, P.name || (im && im.name) || t('No picture yet')),
        ro ? null : h('button', { class: 'btn sm', id: pre + '-paper-pick', onclick: () => this.choosePaper(fin, set) }, icon('image'), t('Choose picture')))));
    const nm = h('input', { class: 'input', id: pre + '-paper-name', value: P.name || '', placeholder: t('e.g. Eijffinger Lino 379000'), disabled: ro, autocomplete: 'off' });
    nm.addEventListener('input', () => set({ paper: { ...P, name: nm.value } }, { coalesce: pre + 'pn' }));
    box.appendChild(h('div', { class: 'field' }, h('label', { for: pre + '-paper-name' }, t('Wallpaper name')), nm));
    box.appendChild(this.segRow(t('Picture'), [['repeat', 'Repeated'], ['fill', 'Over the whole wall']], P.fit || 'repeat', k => upP({ fit: k }), ro));
    // width and height keep the proportions of the picture
    const asp = im && im.w ? im.h / im.w : (P.h || 0.53) / (P.w || 0.53);
    if ((P.fit || 'repeat') === 'repeat') box.appendChild(h('div', { class: 'field-row' },
      this.numField(t('Repeat width'), pre + '-paper-w', (P.w || 0.53) * 100, 'cm', v => { const w = clamp(v, 1, 1000) / 100; upP({ w, h: +(w * asp).toFixed(4) }); }, { disabled: ro, min: 1 }),
      this.numField(t('Repeat height'), pre + '-paper-h', (P.h || 0.53) * 100, 'cm', v => { const hh = clamp(v, 1, 1000) / 100; upP({ h: hh, w: +(hh / asp).toFixed(4) }); }, { disabled: ro, min: 1 })));
    box.appendChild(h('p', { class: 'note-muted' }, (P.fit || 'repeat') === 'repeat' ? t('The picture is one repeat of the pattern; width and height keep its proportions. A roll is usually 53 cm wide (some 70 or 100 cm).') : t('The picture covers the whole wall, like photo wallpaper (fotobehang).')));
    return box;
  },

  async choosePaper(fin, set) {
    const id = await this.pickPicture(fin.paper && fin.paper.img);
    if (!id) return;
    const im = projectImage(id);
    const P = fin.paper && fin.paper.img === id ? fin.paper : { img: id, fit: (fin.paper && fin.paper.fit) || 'repeat', w: 0.53, h: +(0.53 * (im ? im.h / im.w : 1)).toFixed(3), name: im ? im.name.replace(/\.[a-z0-9]+$/i, '') : '' };
    set({ base: 'paper', paper: { ...P, img: id } }, { keepInspector: false });
  },

  /** pick one of the house's pictures or add one → image id */
  async pickPicture(current, opts = {}) {
    const p = this.project;
    p.images = p.images || {};
    let close = null;
    const body = h('div', { class: 'pic-body' });
    const paint = () => {
      body.textContent = '';
      const grid = h('div', { class: 'pic-grid' });
      for (const [id, im] of Object.entries(p.images)) grid.appendChild(h('button', { class: 'pic-card' + (id === current ? ' on' : ''), title: im.name, onclick: () => close(id) }, h('img', { src: imageSrc(im) || '', alt: '' }), h('span', null, im.name)));
      if (!grid.children.length) grid.appendChild(h('p', { class: 'note-muted' }, opts.empty || t('No pictures yet. Add a photo or a scan of the wallpaper (or any picture); then set how big one repeat is.')));
      body.appendChild(grid);
    };
    paint();
    return UI.dialog({
      title: opts.title || t('Wallpaper picture'), body, wide: true, onOpen: (d, c) => { close = c; },
      actions: [{ label: t('Cancel'), value: null }, { label: t('Add a picture…'), icon: 'plus', kind: 'primary', validate: async () => {
        const file = await pickFile('image/*');
        if (!file) return false;
        const id = await this.addPicture(file);
        if (id) close(id);
        return false;
      } }],
    });
  },

  /** a picture made smaller (at most 1600 pixels) and kept in the house → its id */
  async addPicture(file) {
    try {
      const url = await readFileAs(file, 'dataURL');
      const img = await loadImage(url);
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = makeCanvas(W, H), g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.drawImage(img, 0, 0, W, H);
      const src = cv.toDataURL('image/jpeg', 0.86);
      const one = makeCanvas(1, 1), g1 = one.getContext('2d');
      g1.drawImage(cv, 0, 0, 1, 1);
      const px = g1.getImageData(0, 0, 1, 1).data;
      const avg = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const id = uid('img_');
      const asset = await Assets.put(src, W, H);
      this.mutate(pr => { (pr.images = pr.images || {})[id] = { name: file.name || 'Picture', asset, w: W, h: H, avg, added: Date.now() }; }, { project: true, keepInspector: true });
      return id;
    } catch (e) {
      console.error(e);
      this.toast(t('This picture could not be read.'));
      return null;
    }
  },

  /** the "Walls" part of a room's details: the room's finish, its tiles, and each wall (A, B, C …) */
  roomWallsSection(el, r, ro, upd, plan) {
    const st = getStorey(this.project, r.storey);
    const sel = this.selection;
    const fin = roomFinish(r);
    const setRoom = (patch, opts = {}) => upd(rr => {
      const map = { color: 'wallColor', name: 'wallColorName', base: 'wallBase', paper: 'wallPaper', tiles: 'tiles', sheen: 'wallSheen' };
      for (const [k, v] of Object.entries(patch)) rr[map[k]] = v;
    }, opts);
    const sec = h('div', { class: 'insp-sec walls-sec' }, h('div', { class: 'eyebrow' }, t('Walls')));
    this.finishControls(sec, fin, setRoom, ro, 'f');
    const stats = roomFinishStats(plan, r, st);
    sec.appendChild(this.finishTotals(stats));
    el.appendChild(sec);
    // each wall
    const list = h('div', { class: 'face-list' });
    for (const row of stats.faces) {
      const f = row.f, open = sel && sel.face === f.wall.id;
      const sw = row.fin.tiles && !(row.fin.tiles.to > 0) ? row.fin.tiles.color : row.fin.base === 'paper' && row.fin.paper && projectImage(row.fin.paper.img) ? projectImage(row.fin.paper.img).avg : row.fin.color;
      const what = [];
      if (row.ops.length) what.push(row.ops.map(o => o.kind === 'window' ? t('window') : o.kind === 'door' ? t('door') : t('opening')).join(', '));
      list.appendChild(h('button', { class: 'face-row' + (open ? ' on' : '') + (row.fin.own ? ' own' : ''), 'data-face': f.wall.id, 'aria-expanded': String(!!open), onclick: () => this.select({ ...sel, face: open ? undefined : f.wall.id }) },
        h('span', { class: 'face-letter' }, f.letter),
        h('span', { class: 'face-main' }, h('span', { class: 'face-l1' }, h('span', { class: 'num' }, fmtM(row.len)), ' · ', h('span', { class: 'num' }, fmtArea(row.area)), what.length ? ' · ' + what.join(', ') : ''),
          h('span', { class: 'face-l2' }, row.fin.own ? t('Own finish') + ': ' + finishSummary(row.fin) : t('As the room'))),
        h('span', { class: 'mini-sw big', style: { background: sw } })));
      if (open) list.appendChild(this.faceEditor(r, row, ro, st, plan));
    }
    if (!stats.faces.length) list.appendChild(h('p', { class: 'note-muted' }, t('No walls found along this room. Its corners should lie on the faces of the walls.')));
    if (stats.faces.length) list.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn sm', id: 'f-wall-views', onclick: () => this.wallViewsSheet(r) }, icon('wall'), t('Wall views (tiles, sockets, kitchen)'))));
    el.appendChild(h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Each wall'), h('span', { class: 'eyebrow-note' }, t('letters on the plan'))), list));
  },

  finishTotals(stats) {
    const box = h('div', { class: 'fin-totals' });
    box.appendChild(h('dl', { class: 'kv' },
      h('dt', null, t('Wall area')), h('dd', null, fmtArea(stats.wall)),
      stats.tiled > 0 ? h('dt', null, t('Tiled')) : null, stats.tiled > 0 ? h('dd', null, fmtArea(stats.tiled)) : null,
      stats.tiled > 0 ? h('dt', null, t('Paint or paper')) : null, stats.tiled > 0 ? h('dd', null, fmtArea(stats.cover)) : null));
    for (const x of stats.tiles) box.appendChild(h('div', { class: 'tile-count' }, icon('grid'),
      h('span', null, h('strong', null, t('{n} tiles', { n: x.tiles })), ' · ' + tileLabel(x.T), h('br'),
        h('small', null, t('{a} of wall, with {w} % extra: {m} of tiles', { a: fmtArea(x.area), w: x.T.waste ?? 0, m: fmtArea(x.m2) })))));
    box.appendChild(h('p', { class: 'note-muted' }, t('Without doors, windows and openings, up to the ceiling.')));
    return box;
  },

  /** one wall of a room, opened in the list: as the room, or a finish of its own */
  faceEditor(r, row, ro, st, plan) {
    const f = row.f, wid = f.wall.id;
    const box = h('div', { class: 'face-edit', 'data-face': wid });
    const setFace = (patch, opts = {}) => this.mutate(pl => {
      const ww = pl.walls.find(x => x.id === wid);
      if (!ww) return;
      ww.fin = ww.fin || {};
      ww.fin[r.id] = { ...(ww.fin[r.id] || {}), ...patch };
    }, { keepInspector: true, ...opts });
    const clear = () => this.mutate(pl => {
      const ww = pl.walls.find(x => x.id === wid);
      if (!ww || !ww.fin) return;
      delete ww.fin[r.id];
      if (!Object.keys(ww.fin).length) delete ww.fin;
    }, { keepInspector: false });
    box.appendChild(h('div', { class: 'face-head' }, h('strong', null, t('Wall {l}', { l: f.letter })), h('span', { class: 'note-muted' }, `${fmtM(row.len)} · ${fmtMM(f.wall.t)} mm ${f.wall.kind === 'exterior' ? t('outer wall') : t('wall')}`)));
    box.appendChild(this.segRow(t('Finish'), [['room', 'As the room'], ['own', 'Its own']], row.fin.own ? 'own' : 'room', k => {
      if (k === 'room') clear(); else setFace({ color: row.fin.color, name: row.fin.name }, { keepInspector: false });
    }, ro, 'face-mode'));
    if (row.fin.own) this.finishControls(box, row.fin, setFace, ro, 'ff');
    if (row.fin.tiles && row.tArea > 0) {
      const c = tileCount(row.tArea, row.fin.tiles);
      box.appendChild(h('div', { class: 'tile-count' }, icon('grid'), h('span', null, h('strong', null, t('{n} tiles', { n: c.tiles })), ' ' + t('on this wall'), h('br'), h('small', null, t('{a} of wall, with {w} % extra: {m} of tiles', { a: fmtArea(row.tArea), w: row.fin.tiles.waste ?? 0, m: fmtArea(c.m2) })))));
    }
    box.appendChild(h('p', { class: 'note-muted' }, t('Tip: in 3D (Build), tap a wall inside a room to open it here.')));
    return box;
  },

  /** the ceiling of a room */
  roomCeilingSection(el, r, ro, upd, plan) {
    const st = getStorey(this.project, r.storey);
    const cc = h('input', { type: 'color', id: 'f-ceil-col', value: r.ceilingColor || CEIL_DEFAULT, disabled: ro, 'aria-label': t('Ceiling colour') });
    cc.addEventListener('input', () => upd(rr => { rr.ceilingColor = cc.value; }, { coalesce: 'cc:' + r.id }));
    const cn = h('input', { class: 'input', id: 'f-ceil-name', value: r.ceilingName || '', placeholder: t('e.g. Sigmacryl Plafond, RAL 9010'), disabled: ro, autocomplete: 'off' });
    cn.addEventListener('input', () => upd(rr => { rr.ceilingName = cn.value; }, { coalesce: 'cn:' + r.id }));
    const sel = h('select', { class: 'select', id: 'f-ceil-fin', disabled: ro }, ...CEIL_FINISHES.map(([k, lab]) => h('option', { value: k, selected: (r.ceilingFinish || 'paint') === k }, t(lab))));
    sel.addEventListener('change', () => upd(rr => { rr.ceilingFinish = sel.value; }, { keepInspector: false }));
    const sw = ['#FFFFFF', '#F7F6F2', '#F4F2EC', '#EDEBE6', '#E4E1DA', '#D9D5CC'];
    const wh = st ? st.wallHeight : DEFAULTS.wallHeight;
    el.appendChild(h('div', { class: 'insp-sec ceil-sec' },
      h('div', { class: 'eyebrow' }, t('Ceiling')),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, t('Colour')),
        h('div', { class: 'color-row' }, cc, h('div', { class: 'swatches' }, ...sw.map(c => h('button', { class: 'swatch', style: { background: c }, disabled: ro, 'aria-label': t('Ceiling colour') + ' ' + c, 'aria-pressed': String((r.ceilingColor || CEIL_DEFAULT).toLowerCase() === c.toLowerCase()), onclick: () => upd(rr => { rr.ceilingColor = c; }, { keepInspector: false }) }))))),
      h('div', { class: 'field' }, h('label', { for: 'f-ceil-name' }, t('Paint / colour name')), cn),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'f-ceil-fin' }, t('Finish')), sel),
        this.mmField(t('Height'), 'f-ceil-h', r.ceilingH || null, v => upd(rr => { rr.ceilingH = v == null ? null : clamp(v, 1.5, Math.max(wh, 1.5)); }, { keepInspector: false }), { allowEmpty: true, placeholder: fmtMM(wh), disabled: ro })),
      h('dl', { class: 'kv' }, h('dt', null, t('Ceiling area')), h('dd', null, fmtArea(roomArea(r) - roomHoles(plan || this.shownVersion().plan, r).reduce((a, hl) => a + Math.abs(polygonArea(hl)), 0)))),
      ro ? null : h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { const c = await this.colourPicker({ value: r.ceilingColor || CEIL_DEFAULT, title: t('Ceiling colour') }); if (c) upd(rr => { rr.ceilingColor = c.hex; rr.ceilingName = c.name; }, { keepInspector: false }); } }, icon('eye'), t('Colour library'))),
      h('p', { class: 'note-muted' }, t('Leave the height empty for a normal ceiling; fill it in for a lowered ceiling (verlaagd plafond).'))));
  },

  /** a wall's details: the rooms on its sides and their finish */
  wallFinishSection(el, w) {
    const v = this.shownVersion();
    const faces = wallFaces(v.plan, w.storey).filter(f => f.wall.id === w.id);
    if (!faces.length) return;
    const box = h('div', { class: 'insp-sec' }, h('div', { class: 'eyebrow' }, t('Finish')));
    for (const f of faces) {
      const fin = faceFinish(w, f.room);
      const letter = (roomFaces(v.plan, f.room).find(x => x.wall.id === w.id && Math.abs(x.u0 - f.u0) < 0.01) || {}).letter || '';
      box.appendChild(h('button', { class: 'face-row', 'data-room': f.room.id, onclick: () => this.select({ type: 'room', id: f.room.id, storey: w.storey, face: w.id }) },
        h('span', { class: 'face-letter' }, letter),
        h('span', { class: 'face-main' }, h('span', { class: 'face-l1' }, t('Side of {r}', { r: f.room.name })), h('span', { class: 'face-l2' }, (fin.own ? t('Own finish') + ': ' : t('As the room') + ': ') + finishSummary(fin))),
        h('span', { class: 'mini-sw big', style: { background: fin.tiles && !(fin.tiles.to > 0) ? fin.tiles.color : fin.color } })));
    }
    el.appendChild(box);
  },
});

/* ───────── room details: a jump row (task 0035) ─────────
   The room's details are long on a phone. Its sections (Floor, Walls …) are put in groups (div.jump-sec); a row of
   chips in the sticky head jumps to each, the chip of the group in view is marked, a group folds by its heading.
   Kept on this device (localStorage): which groups are folded, and per room the group last in view – the details
   of that room open there next time. */
const JUMP_STORE = 'house-planner.roomjump';
function jumpPrefs() {
  try { const p = JSON.parse(localStorage.getItem(JUMP_STORE) || '{}'); return p && typeof p === 'object' ? { fold: p.fold || {}, last: p.last || {} } : { fold: {}, last: {} }; } catch (e) { return { fold: {}, last: {} }; }
}
function jumpSave(p) {
  const keys = Object.keys(p.last);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete p.last[k];
  try { localStorage.setItem(JUMP_STORE, JSON.stringify(p)); } catch (e) { /* private window: not kept */ }
}

Object.assign(app, {
  /** start the groups of a room's details */
  jumpStart(el) { return { el, groups: [] }; },

  /** run fn (which adds sections to el) and put what it added in one group */
  jumpCall(J, key, label, fn) {
    const n = J.el.children.length;
    fn();
    this.jumpWrap(J, key, label, [...J.el.children].slice(n));
  },

  /** put these sections in one group: its heading (the first section's eyebrow) folds it */
  jumpWrap(J, key, label, nodes) {
    nodes = nodes.filter(Boolean);
    if (!nodes.length) return;
    const w = h('div', { class: 'jump-sec', 'data-jump': key });
    const first = nodes.find(n => n.parentNode === J.el);
    if (first) J.el.insertBefore(w, first); else J.el.appendChild(w);
    for (const n of nodes) w.appendChild(n);
    let eb = w.firstElementChild.querySelector(':scope > .eyebrow');
    if (!eb) { eb = h('div', { class: 'eyebrow' }, label); w.firstElementChild.prepend(eb); }
    const lead = eb.firstChild && eb.firstChild.nodeType === 3 ? eb.firstChild : document.createTextNode(label);
    const folded = !!jumpPrefs().fold[key];
    const btn = h('button', { class: 'jump-fold', type: 'button', 'aria-expanded': String(!folded), title: t('Fold or unfold') }, h('span', { class: 'jump-chev', 'aria-hidden': 'true' }), lead);
    eb.prepend(btn);
    btn.addEventListener('click', () => this.jumpFold(w, !w.classList.contains('folded')));
    if (folded) w.classList.add('folded');
    J.groups.push({ key, label, w });
  },

  jumpFold(w, fold) {
    w.classList.toggle('folded', fold);
    const b = w.querySelector('.jump-fold');
    if (b) b.setAttribute('aria-expanded', String(!fold));
    const p = jumpPrefs();
    if (fold) p.fold[w.dataset.jump] = true; else delete p.fold[w.dataset.jump];
    jumpSave(p);
    this.jumpMark();
  },

  /** the chip row in the sticky head; on a fresh open, the details go to the group last in view for this room */
  jumpFinish(J, r) {
    const el = J.el, head = el.querySelector('.insp-head');
    if (!head || J.groups.length < 2) return;
    const row = h('nav', { class: 'jump-row', 'aria-label': t('Jump to a section') },
      ...J.groups.map(g => h('button', { class: 'jump-chip', type: 'button', 'data-jump': g.key, onclick: () => this.jumpTo(g.key, true) }, g.label)));
    head.classList.add('has-jump');
    head.appendChild(row);
    if (this._inspFresh) this._jumpPad = 0;
    el.appendChild(h('div', { class: 'jump-pad', 'aria-hidden': 'true', style: { height: (this._jumpPad || 0) + 'px' } }));
    el.dataset.jumpRoom = r.id;
    if (!el._jumpScroll) {
      el._jumpScroll = true;
      let raf = 0;
      el.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.jumpMark(true); }); }, { passive: true });
    }
    const last = this._inspFresh ? (jumpPrefs().last[r.id] || null) : undefined;
    this._inspAfter = () => {
      if (last !== undefined) { if (last && el.querySelector(`.jump-sec[data-jump="${last}"]`)) this.jumpTo(last, false); else el.scrollTop = 0; }
      this.jumpMark();
    };
  },

  /** scroll the details so the group's heading sits just under the sticky head */
  jumpTo(key, smooth) {
    const el = $('#inspector');
    const w = el && el.querySelector(`.jump-sec[data-jump="${key}"]`);
    if (!w) return;
    const head = el.querySelector('.insp-head'), pad = el.querySelector('.jump-pad');
    const headH = head ? head.offsetHeight : 0;
    const top = el.scrollTop + w.getBoundingClientRect().top - el.getBoundingClientRect().top - headH;
    // room below the last groups, so their heading can reach the top too
    if (pad) {
      const need = top + el.clientHeight - (el.scrollHeight - pad.offsetHeight);
      this._jumpPad = Math.max(0, Math.ceil(need));
      pad.style.height = this._jumpPad + 'px';
    }
    const want = Math.min(Math.max(0, Math.round(top)), el.scrollHeight - el.clientHeight);
    this._jumpWant = smooth ? { key, top: want, t: performance.now() } : null;
    el.scrollTo({ top: want, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    this.jumpMark(true);
  },

  /** mark the chip of the group in view (the last whose heading has passed under the head); keep it per room */
  jumpMark(record) {
    const el = $('#inspector');
    const row = el && el.querySelector('.jump-row');
    if (!row) return;
    const head = el.querySelector('.insp-head');
    const line = (head ? head.getBoundingClientRect().bottom : el.getBoundingClientRect().top) + 12;
    let cur = null;
    for (const w of el.querySelectorAll('.jump-sec')) if (w.getBoundingClientRect().top <= line) cur = w.dataset.jump;
    // a smooth jump marks its chip at once, not the ones it passes on the way
    const want = this._jumpWant;
    if (want) {
      if (Math.abs(el.scrollTop - want.top) > 2 && performance.now() - want.t < 1500) cur = want.key;
      else this._jumpWant = null;
    }
    for (const c of row.querySelectorAll('.jump-chip')) {
      const on = c.dataset.jump === cur;
      c.classList.toggle('on', on);
      if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
      if (on) { const l = c.offsetLeft - row.offsetLeft, rr = l + c.offsetWidth; if (l < row.scrollLeft) row.scrollLeft = l - 8; else if (rr > row.scrollLeft + row.clientWidth) row.scrollLeft = rr - row.clientWidth + 8; }
    }
    if (record && el.dataset.jumpRoom) {
      const p = jumpPrefs(), id = el.dataset.jumpRoom;
      if ((p.last[id] || null) !== cur) { if (cur) { delete p.last[id]; p.last[id] = cur; } else delete p.last[id]; jumpSave(p); }
    }
  },
});

/** old house files: "Wall tiles 300 × 600 to 1.2 m" written in the paint name (IFC import) becomes real tiles */
function migrateFinishes(p) {
  const re = /^Wall tiles (\d+) × (\d+)(?:, full height| to ([\d.]+) m)$/;
  for (const v of p.versions || []) for (const r of (v.plan && v.plan.rooms) || []) {
    if (r.tiles || !r.wallColorName) continue;
    const m = re.exec(r.wallColorName.trim());
    if (!m) continue;
    r.tiles = { ...TILE_DEFAULT, w: +m[1] / 1000, h: +m[2] / 1000, to: m[3] ? +m[3] : 0 };
    r.wallColorName = '';
    if ((r.wallColor || '').toUpperCase() === '#E9E6DF') r.wallColor = WALL_FINISH_DEFAULT;
  }
  p.images = p.images || {};
}

/** what changed in the finish of a room between two versions (for "Changes") */
function finishChanges(ra, rb, A, B) {
  const ch = [];
  const lab = (list, k) => t((list.find(c => c[0] === k) || [k, k])[1]);
  const paperLabel = P => P ? (P.name || (projectImage(P.img) || {}).name || t('picture')) : '—';
  if ((ra.wallBase || 'paint') !== (rb.wallBase || 'paint')) ch.push({ field: 'Wall covering', from: lab(COVERINGS, ra.wallBase || 'paint'), to: lab(COVERINGS, rb.wallBase || 'paint') });
  if ((ra.wallSheen || 'matt') !== (rb.wallSheen || 'matt')) ch.push({ field: 'Wall sheen', from: lab(SHEENS, ra.wallSheen || 'matt'), to: lab(SHEENS, rb.wallSheen || 'matt') });
  if ((ra.wallBase === 'paper' || rb.wallBase === 'paper') && JSON.stringify(ra.wallPaper || null) !== JSON.stringify(rb.wallPaper || null)) ch.push({ field: 'Wallpaper', from: paperLabel(ra.wallPaper), to: paperLabel(rb.wallPaper) });
  if (JSON.stringify(ra.tiles || null) !== JSON.stringify(rb.tiles || null)) ch.push({ field: 'Wall tiles', from: tilesSummary(ra.tiles), to: tilesSummary(rb.tiles) });
  const own = (P, r) => P.walls.filter(w => w.fin && w.fin[r.id]).map(w => w.id + ':' + JSON.stringify(w.fin[r.id])).sort();
  const oa = own(A, ra), ob = own(B, rb);
  if (oa.join('|') !== ob.join('|')) ch.push({ field: 'Walls with their own finish', from: String(oa.length), to: String(ob.length) + (oa.length === ob.length ? ' (' + t('changed') + ')' : '') });
  if ((ra.ceilingColor || CEIL_DEFAULT).toLowerCase() !== (rb.ceilingColor || CEIL_DEFAULT).toLowerCase()) ch.push({ field: 'Ceiling colour', from: ra.ceilingColor || CEIL_DEFAULT, to: rb.ceilingColor || CEIL_DEFAULT, swatch: true });
  if ((ra.ceilingName || '') !== (rb.ceilingName || '')) ch.push({ field: 'Ceiling paint', from: ra.ceilingName || '—', to: rb.ceilingName || '—' });
  if ((ra.ceilingFinish || 'paint') !== (rb.ceilingFinish || 'paint')) ch.push({ field: 'Ceiling finish', from: lab(CEIL_FINISHES, ra.ceilingFinish || 'paint'), to: lab(CEIL_FINISHES, rb.ceilingFinish || 'paint') });
  if ((ra.ceilingH || 0) !== (rb.ceilingH || 0)) ch.push({ field: 'Ceiling height', from: ra.ceilingH ? fmtMM(ra.ceilingH) + ' mm' : t('normal'), to: rb.ceilingH ? fmtMM(rb.ceilingH) + ' mm' : t('normal') });
  return ch;
}
