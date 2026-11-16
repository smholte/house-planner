"""Task 0039: the tiles in 3D lie where the wall views have them – the chosen start of every tiled wall and of a tiled
floor (centre, corners, centred on the door, a joint on a line, a shift, rows from a height or whole at the top). The
check reads the 3D meshes themselves: from each tiled face's UVs and its tile picture's repeat it works out where the
picture's joints fall and compares them with faceTileLayout() / floorTileLayout() (within 1 mm). Only UV set 0 moves:
no extra draw call, no extra texture, painted walls keep their UVs. PC (light) and phone (dark)."""
from common import *

ROOM = "(n) => { const a = window.__hp.app; return a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); }"
V3 = "window.__hp.app.panes[0].view"

# the largest distance (mm) between a joint of the 3D picture and the layout's, per tiled wall face and the floor
JOINTS = """(n) => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan, st = a.currentStorey(), r = (""" + ROOM + """)(n);
  const v = """ + V3 + """, meshes = [];
  v.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.uv) meshes.push(o); });
  const mod = (x, m) => ((x % m) + m) % m, wrap = (x, m) => { const q = mod(x, m); return Math.min(q, m - q); };
  const out = { walls: [], floor: null, paintOk: true };
  for (const f of H.roomFaces(pl, r)) {
    const lay = H.faceTileLayout(pl, f, st);
    if (!lay) continue;
    const w = f.wall, d = [(w.b[0] - w.a[0]), (w.b[1] - w.a[1])], L = Math.hypot(...d); d[0] /= L; d[1] /= L;
    const fr = H.faceFrame(f), T = lay.T, G = lay.G, rows = T.lay === 'half' ? 2 : 1;
    let worst = 0, n = 0;
    for (const m of meshes) {
      if (m.userData.wallId !== w.id || !Array.isArray(m.material)) continue;
      const g = m.geometry, gi = f.side > 0 ? 4 : 5, grp = g.groups[gi], mt = m.material[gi];
      if (!grp || !mt || !mt.map || !mt.map.userData || mt.map.repeat.x === 0) continue;
      const uc = (m.position.x - w.a[0]) * d[0] + (m.position.z - w.a[1]) * d[1];
      const P = g.attributes.position, U = g.attributes.uv;
      const xs = [], ss = [], es = [];
      for (let i = grp.start; i < grp.start + grp.count; i++) { const u = uc + P.getX(i); xs.push(fr.ex(u)); ss.push(U.getX(i)); es.push(U.getY(i) - P.getY(i)); }
      if (xs.length < 2 || !mt.map.image || mt.map.repeat.x > 100) continue;
      if (Math.abs(1 / mt.map.repeat.x - G.M) > 1e-6) continue;
      // s = slope · x + b along this side (slope ±1), t = y + e
      const i0 = xs.indexOf(Math.min(...xs)), i1 = xs.indexOf(Math.max(...xs));
      if (xs[i1] - xs[i0] < 0.05) continue;
      const slope = (ss[i1] - ss[i0]) / (xs[i1] - xs[i0]), b = ss[i0] - slope * xs[i0], e = es[0];
      const M = 1 / mt.map.repeat.x, MV = 1 / mt.map.repeat.y, j = T.joint || 0;
      const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(fr.L, Math.max(...xs));
      // every tile's left edge and bottom edge of the layout's rows on this piece
      for (let rr = 0; rr < 8; rr++) {
        const y0 = G.oy + rr * G.MH; if (y0 < 0 || y0 > lay.top) continue;
        const sh = G.offs[rr % G.offs.length];
        for (let k = -20; k < 20; k++) {
          const xe = G.ox + sh + k * G.M; if (xe < x0 || xe > x1) continue;
          const tm = y0 + T.h / 2 + e, rho = Math.floor(tm / G.MH), shT = rows === 2 && mod(rho, 2) === 0 ? G.M / 2 : 0;
          // the picture's tile edge that should be here: its left edge (or, mirrored, its right edge)
          const s = slope * xe + b, want = slope > 0 ? j / 2 + shT : j / 2 + shT + T.w;
          worst = Math.max(worst, wrap(s - want, M)); n++;
          worst = Math.max(worst, wrap(y0 + e - j / 2, G.MH)); n++;
        }
      }
    }
    out.walls.push({ letter: f.letter, worst: worst * 1000, n });
  }
  // the floor
  const fl = H.floorTileLayout(pl, r);
  if (fl) {
    let worst = 0, n = 0;
    for (const m of meshes) {
      if (m.userData.roomId !== r.id || !m.userData.walk || m.material.isMaterial !== true || !m.material.map) continue;
      const tex = m.material.map, pw = 1 / tex.repeat.x, ph = 1 / tex.repeat.y, c = Math.cos(tex.rotation), sn = Math.sin(tex.rotation);
      const F = fl.F, G = fl.G, j = 0.003, nrow = G.offs.length;
      const P = m.geometry.attributes.position, U = m.geometry.attributes.uv;
      // plan → picture (metres, y down) from three vertices
      const pts = [];
      for (let i = 0; i < P.count && pts.length < 400; i++) { const x = P.getX(i), y = -P.getY(i), s = U.getX(i), t = U.getY(i); pts.push([x, y, c * s + sn * t, -(-sn * s + c * t)]); }
      // least squares cx = A·(x, y, 1), cy = B·(x, y, 1)
      const solve = col => { const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], R = [0, 0, 0];
        for (const p of pts) { const q = [p[0], p[1], 1]; for (let i = 0; i < 3; i++) { R[i] += q[i] * p[col]; for (let k = 0; k < 3; k++) S[i][k] += q[i] * q[k]; } }
        const det = m3 => m3[0][0] * (m3[1][1] * m3[2][2] - m3[1][2] * m3[2][1]) - m3[0][1] * (m3[1][0] * m3[2][2] - m3[1][2] * m3[2][0]) + m3[0][2] * (m3[1][0] * m3[2][1] - m3[1][1] * m3[2][0]);
        const D = det(S); return [0, 1, 2].map(i => det(S.map((row, k) => row.map((v2, l) => (l === i ? R[k] : v2)))) / D); };
      const A = solve(2), B = solve(3);
      const bb = { x0: Math.min(...r.poly.map(p => p[0])), x1: Math.max(...r.poly.map(p => p[0])), y0: Math.min(...r.poly.map(p => p[1])), y1: Math.max(...r.poly.map(p => p[1])) };
      for (let rr = -30; rr < 30; rr++) for (let k = -30; k < 30; k++) {
        const sh = G.offs[mod(rr, nrow)], lu = G.ou + sh + k * G.MU - j / 2, lv = G.ov + rr * G.MV + G.tv / 2;
        const p = fl.toL([lu, lv]);
        if (p[0] < bb.x0 + 0.02 || p[0] > bb.x1 - 0.02 || p[1] < bb.y0 + 0.02 || p[1] > bb.y1 - 0.02) continue;
        const cx = A[0] * p[0] + A[1] * p[1] + A[2], cy = B[0] * p[0] + B[1] * p[1] + B[2];
        const rho = Math.floor(cy / F.w), o = mod(rho, nrow) * F.l / nrow;
        worst = Math.max(worst, wrap(cx - o, F.l) * G.MU / F.l); n++;
        // the joint under this row
        const q = fl.toL([lu + G.tu / 2, G.ov + rr * G.MV - j / 2]);
        const cy2 = B[0] * q[0] + B[1] * q[1] + B[2];
        worst = Math.max(worst, wrap(cy2, F.w) * G.MV / F.w); n++;
      }
    }
    out.floor = { worst: worst * 1000, n };
  }
  return out; }"""

SET_WALLS = "([n, S]) => { const a = window.__hp.app, rr = (" + ROOM + ")(n); const faces = window.__hp.roomFaces(a.shownVersion().plan, rr); if (faces.every(f => JSON.stringify((f.wall.tileStart || {})[rr.id] || null) === JSON.stringify(S))) return false; a.mutate(pl => { for (const f of faces) { const w = pl.walls.find(x => x.id === f.wall.id); if (S) w.tileStart = { ...(w.tileStart || {}), [rr.id]: S }; else if (w.tileStart) delete w.tileStart[rr.id]; } }, { keepInspector: true }); return true; }"
SET_FLOOR = "([n, S]) => { const a = window.__hp.app, rr = (" + ROOM + ")(n); if (JSON.stringify(rr.floor.start || null) === JSON.stringify(S)) return false; a.mutate(pl => { const q = pl.rooms.find(x => x.id === rr.id); if (S) q.floor.start = S; else delete q.floor.start; }, { keepInspector: true }); return true; }"
STATS = "() => { const v = " + V3 + "; v.renderer.render(v.scene, v.camera); return { calls: v.renderer.info.render.calls, tex: v.renderer.info.memory.textures, geo: v.renderer.info.memory.geometries }; }"
MARK = "() => { const v = " + V3 + "; window.__t3old = new Set(v.group.children); }"
# the edited storey is built again (a new group; reuse.js keeps the others): build() is synchronous, so it is done
FRESH = "() => { const v = " + V3 + "; return v.group.children.some(c => !window.__t3old.has(c)); }"


def change(pg, js, args):
    pg.evaluate(MARK)
    if pg.evaluate(js, args):
        pg.wait_for_function(FRESH, timeout=30000); pg.wait_for_timeout(100)


def run(p, phone):
    tag = 'phone' if phone else 'pc'
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
    open_example(pg)
    if not phone:
        pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(400)
    pg.click('#dim-toggle button[data-dim="3d"]')
    pg.wait_for_function("() => " + V3 + " && " + V3 + ".group && " + V3 + ".group.children.length > 0", timeout=30000); pg.wait_for_timeout(1500)
    door = pg.evaluate("(n) => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan, r = (" + ROOM + ")(n); for (const f of H.roomFaces(pl, r)) { const L = H.faceTileLayout(pl, f, a.currentStorey()); if (L && L.ops.length) return +((L.ops[0].x0 + L.ops[0].x1) / 2).toFixed(4); } return 0.4; }", 'Toilet')
    walls = [('centre (nothing kept)', None), ('left corner', {'x': 'left'}), ('right corner', {'x': 'right'}),
             ('centred on a tile at 0.4 m', {'x': 'at', 'at': door}), ('a joint on that line', {'x': 'at', 'at': door, 'joint': True}),
             ('shifted 137 mm', {'dx': 0.137}), ('rows from 0.55 m (on the bath)', {'y': 'at', 'yh': 0.55}),
             ('whole row at the top, from the left', {'x': 'left', 'y': 'top'})]
    if phone: walls = walls[:1] + walls[3:4] + walls[-1:]
    for name, S in walls:
        change(pg, SET_WALLS, ['Toilet', S])
        r = pg.evaluate(JOINTS, 'Toilet')
        worst = max(x['worst'] for x in r['walls']); n = sum(x['n'] for x in r['walls'])
        check(f'{tag}: walls, {name}: the 3D tile joints lie where the wall view has them (within 1 mm)', len(r['walls']) >= 3 and n > 20 and worst < 1.0, r['walls'])
    floors = [('centre (nothing kept)', None), ('corner top left', {'at': 'nw'}), ('corner bottom right', {'at': 'se'}), ('top left + 100 / 37 mm', {'at': 'nw', 'dx': 0.1, 'dy': 0.037})]
    if phone: floors = floors[:1] + floors[-1:]
    for name, S in floors:
        change(pg, SET_FLOOR, ['Toilet', S])
        r = pg.evaluate(JOINTS, 'Toilet')
        check(f'{tag}: floor, {name}: the 3D tile joints lie where the floor layout has them (within 1 mm)', r['floor'] and r['floor']['n'] > 4 and r['floor']['worst'] < 1.0, r['floor'])
    # with a start on the walls and the floor, then with none: the same draw calls, textures and geometries
    change(pg, SET_WALLS, ['Toilet', {'x': 'left', 'dx': 0.05}]); change(pg, SET_FLOOR, ['Toilet', {'at': 'se'}]); pg.wait_for_timeout(1500)
    with_start = pg.evaluate(STATS)
    change(pg, SET_WALLS, ['Toilet', None]); change(pg, SET_FLOOR, ['Toilet', None]); pg.wait_for_timeout(1500)
    without = pg.evaluate(STATS)
    check(f'{tag}: a chosen start costs nothing: the same draw calls, textures and geometries as without', with_start == without, (with_start, without))
    # painted walls keep their UVs: metres along the wall from its start (+ side) or the other way (− side)
    paint = pg.evaluate("""() => { const v = """ + V3 + """, a = window.__hp.app, pl = a.shownVersion().plan; let bad = 0, n = 0;
      v.group.traverse(m => { if (!m.isMesh || !m.userData.wallId || !Array.isArray(m.material)) return; const w = pl.walls.find(x => x.id === m.userData.wallId); if (!w) return;
        const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d), uc = ((m.position.x - w.a[0]) * d[0] + (m.position.z - w.a[1]) * d[1]) / L, g = m.geometry;
        for (const gi of [4, 5]) { const mt = m.material[gi], grp = g.groups[gi]; if (!grp || (mt.map && Math.abs(mt.map.repeat.x - 1) > 1e-9 && mt.map.repeat.x > 1.4)) continue;
          for (let i = grp.start; i < grp.start + grp.count; i++) { const s = g.attributes.uv.getX(i), u = uc + g.attributes.position.getX(i); n++; if (Math.abs(s - (gi === 4 ? u : -u)) > 1e-4) bad++; } } });
      return [bad, n]; }""")
    check(f'{tag}: painted walls keep their UVs (metres along the wall)', paint[1] > 100 and paint[0] == 0, paint)
    if not phone:
        # a picture of the toilet from inside with a start chosen (corner, rows whole at the top) for the report
        change(pg, SET_WALLS, ['Toilet', {'x': 'left', 'y': 'top'}])
        pg.evaluate("(n) => { const v = " + V3 + ", r = (" + ROOM + ")(n); const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), ax = w >= h; v.controls.target.set(ax ? Math.min(...xs) : cx, 1.1, ax ? cy : Math.min(...ys)); v.camera.position.set(ax ? Math.max(...xs) - 0.1 : cx + 0.2, 1.9, ax ? cy + 0.2 : Math.max(...ys) - 0.1); v.controls.update(); v.requestRender && v.requestRender(); }", 'Toilet')
        pg.wait_for_timeout(1500)
        pg.screenshot(path=SHOTS + 'tiles3d-pc-toilet.png')
    check(f'{tag}: no errors on the page', not pg.errors, pg.errors)
    b.close()


with sync_playwright() as p:
    run(p, False)
    run(p, True)
sys.exit(summary())
