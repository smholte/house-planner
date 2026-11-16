"""Tenth round (30 Oct): the electrics of the example – every point drawn in 2D and 3D; the Electrics tool places the
new kinds (a water point on a wall, an installation unit where you tap, turned and sized in its details, undo); on the
phone the list of things to place; in 3D and walking the height labels of the electrics only show when switched on
(View → "3D: heights of sockets and switches", off at first). PC and phone. (The owner's installation drawing –
his technical room and 164 points – and its upgrade: house/tests/test_round10_own.py.)"""
from common import *

GF = "() => [...window.__hp.app.project.storeys].sort((a, b) => a.level - b.level)[0].id"
NPTS = "(st) => (window.__hp.app.shownVersion().plan.points || []).filter(q => q.storey === st).length"
CAM = "([cx, cy, s]) => { const v = window.__hp.app.panes[0].view; const r = v.svg.getBoundingClientRect(); v.cam = { s, tx: r.width / 2 - cx * s, ty: r.height / 2 - cy * s }; v.applyCam(); }"

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(800)
    gf = pg.evaluate(GF); N = pg.evaluate(NPTS, gf)
    kinds = pg.evaluate("(st) => [...new Set(window.__hp.app.shownVersion().plan.points.filter(q => q.storey === st).map(q => q.kind))]", gf)
    n2 = pg.evaluate("() => [document.querySelectorAll('.pt2d').length, document.querySelectorAll('.pt2d.k-unit').length, document.querySelectorAll('.pt2d.k-water').length]")
    check(f'2D ground floor: all its {N} points drawn — units at their real size, water drops', N > 10 and n2[0] == N and n2[1] >= 1 and n2[2] >= 1 and 'unit' in kinds and 'water' in kinds, [n2, kinds])
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(5000)
    n3 = pg.evaluate("() => { const ids = new Set(); window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData.point) ids.add(o.userData.point); }); return ids.size; }")
    check(f'3D: all {N} points of the ground floor are drawn', n3 == N, n3)
    # a unit with a colour of its own (a black rubber block, task 0041) and a gravelled flat roof (project.flatRoof)
    uid_ = pg.evaluate("""(st) => { const a = window.__hp.app, u = a.shownVersion().plan.points.find(q => q.storey === st && q.kind === 'unit' && q.sub !== 'hatch'); a.mutate(pl => { pl.points.find(q => q.id === u.id).color = '#26282A'; }); return u.id; }""", gf)
    pg.wait_for_timeout(2500)
    ck = pg.evaluate("(id) => { const ks = []; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData.point === id && o.isMesh) ks.push(([].concat(o.material)[0].userData || {}).key); }); return ks; }", uid_)
    check('3D: a unit with its own colour (#26282A) is drawn in it', 'pt|u#26282A' in ck, ck)
    load_pictures(pg)
    gr = pg.evaluate("""() => { const H = window.__hp, m0 = { kind: 'flat', color: [0.2, 0.2, 0.21] }, lum = x => x.color.r + x.color.g + x.color.b;
      const plain = H.shellMaterial('flatroof|roof', m0, {}), grav = H.shellMaterial('flatroof|roof', m0, { flatRoof: 'gravel' }), other = H.shellMaterial('brick:0.5,0.3,0.2', { kind: 'flat', color: [0.2, 0.2, 0.21] }, { flatRoof: 'gravel' });
      return { same: plain === grav, lib: grav.userData.lib || null, plainLum: lum(plain), gravLum: lum(grav), roofKind: H.shellMaterial('roof|roof', { kind: 'roof', color: [0.3, 0.3, 0.3] }, { flatRoof: 'gravel' }) === H.shellMaterial('roof|roof', { kind: 'roof', color: [0.3, 0.3, 0.3] }, {}) }; }""")
    check('3D: a flat roof of a project with flatRoof = gravel gets the gravel (lighter than the dark roof), a project without it and sloping roofs stay', not gr['same'] and gr['gravLum'] > gr['plainLum'] * 1.5 and gr['roofKind'], gr)
    # ───────── the Electrics tool: the new kinds ─────────
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1000)
    bx = room_box(pg, 'Woonkamer')
    cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
    pg.evaluate(CAM, [cx, cy, 90]); pg.wait_for_timeout(700)
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(400)
    pg.evaluate("() => window.__hp.app.setTool('install')"); pg.wait_for_timeout(400)
    pg.click('.toolopts .chip:text-is("Water")'); pg.wait_for_timeout(200)
    pg.click('.toolopts .chip:text-is("Cold")'); pg.wait_for_timeout(200)
    before = len(pg.evaluate("() => window.__hp.app.shownVersion().plan.points"))
    # just inside the room, by its wall (clear of the points already there)
    wx, wy = bx[0] + 0.8 * (bx[2] - bx[0]), bx[1] + 0.08
    show_on_plan(pg, wx, wy)
    pg.mouse.click(*to_screen(pg, wx, wy)); pg.wait_for_timeout(500)
    new = pg.evaluate("() => { const l = window.__hp.app.shownVersion().plan.points; return l[l.length - 1]; }")
    check('the tool places a water point (cold) on a wall at 550 mm', len(pg.evaluate("() => window.__hp.app.shownVersion().plan.points")) == before + 1 and new['kind'] == 'water' and new['sub'] == 'cold' and new['h'] == 0.55 and new.get('wall'), new)
    pg.click('.toolopts .chip:text-is("Unit")'); pg.wait_for_timeout(200)
    pg.click('.toolopts .chip:text-is("Ventilation unit (WTW)")'); pg.wait_for_timeout(200)
    show_on_plan(pg, cx, cy)
    pg.mouse.click(*to_screen(pg, cx, cy)); pg.wait_for_timeout(500)
    u = pg.evaluate("() => { const l = window.__hp.app.shownVersion().plan.points; return l[l.length - 1]; }")
    check('… and a ventilation unit where you tap, at its usual size', u['kind'] == 'unit' and u['sub'] == 'wtw' and u['size'] == [0.725, 0.57, 0.81] and near(u['x'], cx, 0.06), u)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'point', id })", u['id']); pg.wait_for_timeout(600)
    pg.click('#f-pt-turn'); pg.wait_for_timeout(400)
    pg.fill('#f-pt-w', '800'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    u2 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.points.find(p => p.id === id)", u['id'])
    check('… turned 90° and made 80 cm wide in its details', u2['rot'] == 90 and near(u2['size'][0], 0.8, 0.001), u2)
    for _ in range(4): pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    check('undo takes them away again', len(pg.evaluate("() => window.__hp.app.shownVersion().plan.points")) == before)
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    N = pg.evaluate(NPTS, pg.evaluate(GF))
    n2 = pg.evaluate("() => document.querySelectorAll('.pt2d').length")
    check('phone: the ground floor\'s points are drawn', n2 == N, [n2, N])
    pg.evaluate("() => window.__hp.app.setTool('install')"); pg.wait_for_timeout(500)
    opts = pg.evaluate("() => [...document.querySelectorAll('#pt-kind-pick option')].map(o => o.value)")
    check('phone: the list of things to place has water points and units', 'water' in opts and 'unit' in opts and 'bell' in opts, opts)
    pg.select_option('#pt-kind-pick', 'unit'); pg.wait_for_timeout(400)
    check('phone: the kinds of unit to choose from', pg.locator('.toolopts .chip:text-is("Heat pump (WP)")').count() == 1)
    pg.screenshot(path=SHOTS + 'r10-phone.png')
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    # walking: no height labels of the electrics unless switched on in the View menu
    pg.evaluate("() => window.__hp.app.setTool('select')"); pg.wait_for_timeout(300)
    pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.tap('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)
    pg.evaluate("() => window.__hp.app.startWalk()"); pg.wait_for_timeout(4000)
    # in the room with the most wall points, looking at each wall in turn
    spot = by_house(pg, room_pt(pg, 'Woonkamer'), [10.4, 11.5])
    WALK = "([x, y, yaw]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.yaw = yaw; w.pitch = -0.2; w.feet = w.groundAt(w.x, w.y, w.feet + 1) ?? w.feet; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }"
    LABS = "() => [...document.querySelectorAll('.label3d.pt3d')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).length"
    def labels():
        n = 0
        for yaw in (1.5708, 0, 3.1416, -1.5708):
            pg.evaluate(WALK, [spot[0], spot[1], yaw]); pg.wait_for_timeout(1200); pg.evaluate(STILL)
            n = max(n, pg.evaluate(LABS))
            if n >= 2: break
        return n
    n0 = labels()
    check('phone, walking: no height labels of sockets and switches at first', pg.evaluate("() => !!window.__hp.app.walker") and n0 == 0, n0)
    pg.screenshot(path=SHOTS + 'r10-walk-phone.png')
    pg.tap('#btn-viewopts'); pg.wait_for_timeout(500); still(pg)
    pg.locator('#mi-pt-heights').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    check('phone: the View menu has “3D: heights of sockets and switches”, off', pg.get_attribute('#mi-pt-heights', 'aria-pressed') == 'false' and '3D: heights of sockets and switches' in pg.inner_text('.menu'))
    pg.locator('#mi-pt-heights').tap(); pg.wait_for_timeout(2500)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    check('… Esc closes the menu and the walk goes on', pg.evaluate("() => !!window.__hp.app.walker") and not pg.is_visible('#mi-pt-heights'))
    n1 = labels()
    check('… switched on: the heights show while walking', n1 >= 2 and pg.evaluate("() => window.__hp.app.settings.ptHeights") is True, n1)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
