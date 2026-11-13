"""Façade changes: a window or door put in an outside wall goes through all its layers (inner leaf, insulation,
brick); moved, widened, typed or deleted, the layers follow. In 3D the builder's brick is cut where a new or wider
opening is (reveals and a sill), an opening that was closed up is bricked up, the leaves of a removed outside door
go, and a new outside door gets leaves. The change list counts each opening once; the original stays as it was."""
from common import *

LAYERS = "(w) => window.__hp.app.shownVersion().plan.openings.filter(o => w.includes(o.wall)).map(o => ({ id: o.id, wall: o.wall, kind: o.kind, pos: o.pos, w: o.w, h: o.h, sill: o.sill, leaf: !!o.leaf, link: o.link || null }))"
# what a ray from outside hits first (see-through demolition ghosts and labels skipped)
RAY = """([o, d]) => { const T = window.__hp.THREE, v = window.__hp.app.panes[0].view; const rc = new T.Raycaster(new T.Vector3(...o), new T.Vector3(...d).normalize());
  const hits = rc.intersectObjects(v.group.children, true).filter(h => (h.object.visible || h.object.userData.merged) && h.object.material && !h.object.isSprite && !h.object.isLine);
  const out = hits.map(h => { const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
    return { d: h.distance, brick: !!m.map && !m.transparent, glass: !!m.transparent && m.color && ['a8c8d8', '9ebdcc'].includes(m.color.getHexString()), ghost: !!m.transparent && m.color && m.color.getHexString() === 'e2a400', col: m.color ? m.color.getHexString() : '' }; });
  return out.filter(x => !x.ghost)[0] || null; }"""
# brick triangles of the storey's façade with their middle inside a rectangle of a wall (u along, y up, |v| < 0.6)
COUNT = """([wid, u0, u1, y0, y1, key]) => { const H = window.__hp, a = H.app, sid = a.view.storeyId, plan = a.shownVersion().plan;
  const orig = a.project.versions.find(v => v.kind === 'original').plan;
  const fx = H.facadeDiff(orig, plan, sid), parts = H.facadeShellParts(a.shell, sid, plan, fx, false);
  const w = plan.walls.find(x => x.id === wid), L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], n = [-d[1], d[0]];
  let c = 0; for (const p of parts) { if (key && !p.key.startsWith(key)) continue; const m = a.shell.materials[p.key] || p.mat || {}; if (!key && !(m.kind === 'brick')) continue;
    const P = p.pos, I = p.idx; for (let t = 0; t < I.length; t += 3) { let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { const i = I[t + k] * 3; x += P[i] / 3; y += P[i + 1] / 3; z += P[i + 2] / 3; }
      const u = (x - w.a[0]) * d[0] + (z - w.a[1]) * d[1], v = (x - w.a[0]) * n[0] + (z - w.a[1]) * n[1];
      if (u > u0 && u < u1 && y > y0 && y < y1 && Math.abs(v) < 0.6) c++; } }
  return c; }"""
# per house: FRONT = a façade along x (outside: smaller y), EAST = one along y (outside: larger x), each as inner leaf,
# insulation, brick; where the new window goes (plan x on FRONT's line y, its place along the wall), the EAST window
# made wider and the one deleted (with their layers), the outside door taken out, where the rays start, the camera
GEO = {
  'test': dict(FRONT=['w_hx1c0tdlliu', 'w_hx1c0f19p8l', 'w_hx1c08dzff2'], fy=0.825, nx=3.675, nu=2.85,   # the garden side (y 0.825)
               EAST=['w_hx1c0p4gzai', 'w_hx1c05djuda', 'w_hx1c0wnm2mk'], ex=8.975, out_x=9.9, out_z=-0.3,   # x 8.975
               wide='o_hx1c0rqlk2w', wide_u=(6.85, 7.2), gone=['o_hx1c0355x0k', 'o_hx1c0nui3wc', 'o_hx1c07l8qt1'], gone_u=(1.9, 3.2), gone_at=2.575,
               door=['o_hx1c0t9vqad', 'o_hx1c04zj50y', 'o_hx1c0y8tj3j'], door_x=2.0, old_x=4.6, cam=[13.5, 3, 5.5]),
  'own': dict(FRONT=['w_yyrec6g7yog', 'w_yyrecki5jag', 'w_yyrecl28r5z'], fy=6.57, nx=4.2, nu=3.05,           # the front (y 6.57)
              EAST=['w_yyrecmu8nu7', 'w_yyrecqfcelf', 'w_yyrect3cmpl'], ex=13.26, out_x=17, out_z=3.0,         # x 13.26
              wide='o_yyren1hunqb', wide_u=(3.2, 3.5), gone=['o_yyrenava8a8', 'o_yyren9l694k', 'o_yyreq8j2vwk'], gone_u=(1.2, 2.4), gone_at=1.825,
              door=['o_yysh2wevflo', 'o_yysh2dbn67m', 'o_yysh2nx0u18'], door_x=7.2, old_x=5.3, cam=[22, 3, 9.5]),
}

def run(p, phone=False, theme='light'):
    tag = ' (phone)' if phone else ''
    b, pg = open_app(p, phone=phone, theme=theme)
    open_example(pg)
    G = GEO[by_house(pg, 'test', 'own')]
    FRONT, EAST, FY, NX = G['FRONT'], G['EAST'], G['fy'], G['nx']
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    had = {o['id'] for o in pg.evaluate(LAYERS, FRONT)}
    n_east = len(pg.evaluate(LAYERS, EAST))
    if not phone:
        # a new window in the front, with the tool
        pg.click('#toolrail button[data-tool="window"]'); pg.wait_for_timeout(300)
        show_on_plan(pg, NX, FY)
        pg.mouse.click(*to_screen(pg, NX, FY)); pg.wait_for_timeout(600)
    else:
        pg.evaluate("([w, u]) => { const a = window.__hp.app; a.addOpening(w, 'window', u, 1.2); }", [FRONT[0], G['nu']]); pg.wait_for_timeout(600)
    O = pg.evaluate(LAYERS, FRONT)
    new = [o for o in O if not o['leaf'] and o['id'] not in had]
    main = new[0] if new else None
    lay = [o for o in O if main and o['link'] == main['id']]
    check('a window in the inner leaf is made in the insulation and the brick too' + tag, main and len(lay) == 2 and {o['wall'] for o in lay} == set(FRONT[1:]) and all(o['leaf'] and o['kind'] == 'window' for o in lay), O)
    if not phone:
        check('the app says so', pg.evaluate("() => [...document.querySelectorAll('.toast')].some(t => /whole outside wall/.test(t.textContent))"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.evaluate("(id) => window.__hp.app.select({ type: 'opening', id })", main['id']); pg.wait_for_timeout(400)
        check('its details tell it goes through the whole wall', '2 more layers' in (pg.evaluate("() => (document.querySelector('.fx-note') || {}).textContent") or ''))
        # drag it 0.5 m along the wall: the layers come along
        drag(pg, to_screen(pg, NX, FY), to_screen(pg, NX + 0.5, FY))
        O2 = {o['id']: o for o in pg.evaluate(LAYERS, FRONT)}
        moved = O2[main['id']]['pos'] - main['pos']
        check('dragged along the wall, the layers follow', abs(moved - 0.5) < 0.03 and all(abs(O2[o['id']]['pos'] - o['pos'] - moved) < 0.002 for o in lay), (moved, [O2[o['id']]['pos'] - o['pos'] for o in lay]))
        # typed width (dimension line)
        pg.evaluate("([w, op]) => window.__hp.app.applyDim({ w, kind: 'op', op, len: 1.2 }, 1.4)", [FRONT[0], main['id']]); pg.wait_for_timeout(400)
        O3 = {o['id']: o for o in pg.evaluate(LAYERS, FRONT)}
        check('a typed width changes the layers too', all(abs(O3[o['id']]['w'] - 1.4) < 0.002 for o in lay) and abs(O3[main['id']]['w'] - 1.4) < 0.002, [O3[o['id']]['w'] for o in lay])
        pg.evaluate("([w, op]) => window.__hp.app.applyDim({ w, kind: 'op', op, len: 1.4 }, 1.2)", [FRONT[0], main['id']]); pg.wait_for_timeout(300)
        drag(pg, to_screen(pg, NX + 0.5, FY), to_screen(pg, NX, FY))
    # widen the east window in its details, delete the other one
    pg.evaluate("(id) => window.__hp.app.select({ type: 'opening', id })", G['wide']); pg.wait_for_timeout(400)
    pg.fill('#f-op-w', '2400'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    E = pg.evaluate(LAYERS, EAST)
    wide = [o for o in E if abs(o['w'] - 2.4) < 0.002]
    check('widened in its details: all three layers' + tag, len(wide) == 3, [(o['id'], o['w']) for o in E])
    pg.evaluate("(id) => window.__hp.app.select({ type: 'opening', id })", G['gone'][0]); pg.wait_for_timeout(300)
    pg.evaluate("() => window.__hp.app.deleteSelection()"); pg.wait_for_timeout(400)
    E2 = pg.evaluate(LAYERS, EAST)
    check('deleted: gone from all three layers' + tag, len(E2) == n_east - 3 and not any(o['id'] in G['gone'] for o in E2), [o['id'] for o in E2])
    if not phone:
        pg.evaluate("() => window.__hp.app.undo()"); pg.wait_for_timeout(400)
        check('undo brings back all three in one step', len(pg.evaluate(LAYERS, EAST)) == n_east)
        pg.evaluate("() => window.__hp.app.redo()"); pg.wait_for_timeout(400)
        # an opening in an inside wall stays on its own
        n0 = pg.evaluate("() => window.__hp.app.shownVersion().plan.openings.length")
        pg.evaluate("() => { const a = window.__hp.app, pl = a.shownVersion().plan; const w = pl.walls.find(x => x.storey === a.view.storeyId && x.kind === 'interior' && Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]) > ((a.project.name || '').startsWith('Testhuis') ? 2.0 : 2.5) && !pl.openings.some(o => o.wall === x.id)); a.addOpening(w.id, 'door', 1.2, 0.83); }"); pg.wait_for_timeout(400)
        check('a door in an inside wall: just the one', pg.evaluate("() => window.__hp.app.shownVersion().plan.openings.length") == n0 + 1)
        pg.evaluate("() => window.__hp.app.undo()"); pg.wait_for_timeout(300)
    # the model's brick: cut where the new and wider windows are, bricked up where one went
    sill = 0.45
    c_new = pg.evaluate(COUNT, [FRONT[0], G['nu'] - 0.4, G['nu'] + 0.4, 1.0, 2.0, None])
    c_wide = pg.evaluate(COUNT, [EAST[0], *G['wide_u'], 1.0, 2.0, None])
    c_gone = pg.evaluate(COUNT, [EAST[0], *G['gone_u'], 0.7, 2.3, None])
    check('3D model: no brick left in the new window' + tag, c_new == 0, c_new)
    check('3D model: no brick left where the window got wider' + tag, c_wide == 0, c_wide)
    check('3D model: the removed window is bricked up' + tag, c_gone >= 4, c_gone)
    check('3D model: new windows get a sill', pg.evaluate("() => { const H = window.__hp, a = H.app, sid = a.view.storeyId, plan = a.shownVersion().plan; const fx = H.facadeDiff(a.project.versions.find(v => v.kind === 'original').plan, plan, sid); return H.facadeShellParts(a.shell, sid, plan, fx, false).filter(p => p.key === 'fx:sill').length; }") >= 1)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
    ey0 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.walls.find(w => w.id === id).a[1]", EAST[0])   # (3D z = plan y)
    h_new = pg.evaluate(RAY, [[NX, 1.4, G['out_z']], [0, 0, 1]])
    h_old = pg.evaluate(RAY, [[G['old_x'], 1.4, G['out_z']], [0, 0, 1]])
    h_wide = pg.evaluate(RAY, [[G['out_x'], 1.4, ey0 + sum(G['wide_u']) / 2], [-1, 0, 0]])
    h_gone = pg.evaluate(RAY, [[G['out_x'], 1.4, ey0 + G['gone_at']], [-1, 0, 0]])
    check('3D: looking in at the new window you see its glass' + tag, h_new and h_new['glass'] and not h_new['brick'], h_new)
    check('3D: brick beside it is still brick' + tag, h_old and h_old['brick'], h_old)
    check('3D: the widened part is glass' + tag, h_wide and h_wide['glass'], h_wide)
    check('3D: the closed-up window is brick' + tag, h_gone and h_gone['brick'], h_gone)
    if not phone:
        pg.evaluate("([c, ex]) => { const v = window.__hp.app.panes[0].view; v.camera.position.set(...c); v.controls.target.set(ex + 0.25, 1.4, c[2]); v.controls.update(); v.needs = true; }", [G['cam'], G['ex']])
        pg.wait_for_timeout(1500); still(pg)
        pg.screenshot(path=SHOTS + 'facade-3d.png')
        # an outside door taken out: its leaves go, the hole is bricked up; a new outside door gets leaves
        pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(600)
        pg.evaluate("(id) => window.__hp.app.select({ type: 'opening', id })", G['door'][0]); pg.wait_for_timeout(300)
        pg.evaluate("() => window.__hp.app.deleteSelection()"); pg.wait_for_timeout(400)
        check('outside door deleted with its layers', not any(o['id'] in G['door'] for o in pg.evaluate(LAYERS, FRONT)))
        pg.evaluate("(w) => { const a = window.__hp.app; a.addOpening(w, 'door', 1.6, 1.0); }", EAST[0]); pg.wait_for_timeout(500)
        nd = pg.evaluate("() => window.__hp.app.selection && window.__hp.app.selection.id")
        pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
        leaves = pg.evaluate("(id) => { let n = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData && o.userData.door === id && o.isMesh) n++; }); return n; }", G['door'][0])
        check('3D: the removed outside door has no leaves left', leaves == 0, leaves)
        check('3D: the new outside door has a leaf', pg.evaluate("(id) => (window.__hp.app.panes[0].view.doorMap.get(id) || []).length", nd) >= 1)
        h_door = pg.evaluate(RAY, [[G['door_x'], 1.2, G['out_z']], [0, 0, 1]])
        check('3D: the old front door opening is brick now', h_door and h_door['brick'], h_door)
        # the change list counts each opening once
        pg.evaluate("() => { window.__hp.app.select(null); window.__hp.app.setDisplay('diff'); }"); pg.wait_for_timeout(1500); still(pg)
        txt = pg.evaluate("() => document.querySelector('#inspector') ? document.querySelector('#inspector').textContent : ''")
        import re
        m_add = re.search(r'(\d+) windows? added', txt); m_rem = re.search(r'(\d+) windows? removed', txt)
        check('the change list counts a façade window once', m_add and m_rem and int(m_add.group(1)) <= 3 and int(m_rem.group(1)) <= 3, (m_add and m_add.group(0), m_rem and m_rem.group(0)))
        pg.screenshot(path=SHOTS + 'facade-changes.png')
        # the original is untouched
        pg.evaluate("() => window.__hp.app.setDisplay('original')"); pg.wait_for_timeout(1500); still(pg)
        h_orig = pg.evaluate(RAY, [[NX, 1.4, G['out_z']], [0, 0, 1]])
        check('the original keeps its brick', h_orig and h_orig['brick'], h_orig)
        # kept in the house file
        text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
        vers = json.loads(text)['projects'][0]['project']['versions']
        links = sum(1 for v in vers for o in v['plan']['openings'] if o.get('link'))
        check('the layers are kept in the house file', links >= 2, links)
    else:
        pg.screenshot(path=SHOTS + f'facade-phone-{theme}.png')
    check('no page errors' + tag, not pg.errors, pg.errors)
    b.close()

with sync_playwright() as p:
    run(p)
    run(p, phone=True, theme='dark')
sys.exit(summary())
