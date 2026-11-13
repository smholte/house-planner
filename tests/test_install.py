"""Electrics and installations: the Electrics tool (E) places sockets, switches, light points, data, valves … on a wall
(at their height) or on the ceiling; tap one to change it (height, double/triple, name), drag it along the wall;
counts per room, floor heating per room, drawn in 3D with the height shown up close, the room's light from your own
light point, the changes between versions, the materials list, the layer switch, delete and undo; on a phone too."""
from common import *

PTS = "() => (window.__hp.app.shownVersion().plan.points || []).map(p => ({ id: p.id, kind: p.kind, sub: p.sub, n: p.n, x: p.x, y: p.y, h: p.h, wall: p.wall, rot: p.rot, label: p.label }))"
SYM = "(id) => { const e = document.querySelector(`.pt2d[data-point=\"${id}\"]`); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }"

def chip(pg, label):
    pg.click(f'.toolopts .chip:text-is("{label}")'); pg.wait_for_timeout(200)

INST = {
  'own': dict(room='Woonkamer', wall='w_yyreby7ij75', wx=5.345, t=0.12, ys=(10.2, 11.0, 12.0), sw=12.45, light=(3.2, 11.0), valve=(4.0, 10.3),
              data=(1.32, 11.5), drag=10.7, room_at=(2.5, 10.5), cam_t=(5.3, 0.7, 11.2), cam=(3.0, 1.5, 11.6), walk=(4.3, 11.2)),
  'test': dict(room='Hal', wall='w_hx1c0atvtay', wx=4.95, t=0.1, ys=(6.6, 7.4, 8.4), sw=9.2, light=(3.9, 8.0), valve=(3.9, 6.8),
               data=(3.02, 7.85), drag=7.0, room_at=(3.4, 9.6), cam_t=(4.9, 0.7, 7.6), cam=(3.05, 1.5, 7.9), walk=(3.9, 7.6)),
}

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    # the example has the installations of the drawing (test_round10.py) and floor heating (test_round11.py): this test starts from an empty house
    pg.evaluate("() => { for (const v of window.__hp.app.project.versions) { v.plan.points = []; for (const r of v.plan.rooms) delete r.heat; } window.__hp.app.refreshViews(); }"); pg.wait_for_timeout(600)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    pg.click('#toolrail button[data-tool="install"]') if pg.query_selector('#toolrail button[data-tool="install"]') else pg.keyboard.press('e')
    pg.wait_for_timeout(400)
    check('the Electrics tool is on', pg.evaluate("() => window.__hp.app.tool") == 'install')
    # an inside wall with the room on its left: owner's house – Woonkamer | Hal at x = 5.345 (12 cm); made-up – Hal | Keuken
    # at x = 4.95 (10 cm). Three sockets and a switch along it, a light and a valve in the room, data at its far wall
    I = INST[by_house(pg, 'test', 'own')]
    WX = I['wx'] - 0.095   # a click just beside the wall, in the room
    for y in I['ys']: pg.mouse.click(*to_screen(pg, WX, y)); pg.wait_for_timeout(350)
    chip(pg, 'Switch'); pg.mouse.click(*to_screen(pg, WX, I['sw'])); pg.wait_for_timeout(350)
    chip(pg, 'Light'); pg.mouse.click(*to_screen(pg, *I['light'])); pg.wait_for_timeout(350)
    chip(pg, 'Valve'); chip(pg, 'Supply (toevoer)'); pg.mouse.click(*to_screen(pg, *I['valve'])); pg.wait_for_timeout(350)
    chip(pg, 'Data'); pg.mouse.click(*to_screen(pg, *I['data'])); pg.wait_for_timeout(350)
    chip(pg, 'Socket'); pg.mouse.click(*to_screen(pg, *I['light'])); pg.wait_for_timeout(500)
    P = pg.evaluate(PTS)
    kinds = [x['kind'] for x in P]
    check('placed: 3 sockets, switch, light, valve, data (a socket in the middle of the room is refused)', kinds == ['socket'] * 3 + ['switch', 'light', 'vent', 'data'], kinds)
    s0 = P[0]
    check('a socket sits on the wall face, facing the room, at 300 mm, double', s0['wall'] == I['wall'] and near(s0['x'], I['wx'] - I['t'] / 2 - 0.02, 0.002) and abs(abs(s0['rot']) - 180) < 1 and s0['h'] == 0.3 and s0['n'] == 2, s0)
    check('switch at 1050 mm, light and valve on the ceiling', P[3]['h'] == 1.05 and P[4]['h'] is None and P[5]['h'] is None and P[5]['sub'] == 'supply', P[3:6])
    check('the symbols are drawn', pg.evaluate("() => document.querySelectorAll('.pt2d').length") == 7)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # tap a socket: its details
    pg.mouse.click(*pg.evaluate(SYM, s0['id'])); pg.wait_for_timeout(600)
    check('tap a socket: its details', pg.evaluate("() => window.__hp.app.selection && window.__hp.app.selection.type") == 'point' and pg.is_visible('#f-pt-h'))
    pg.click('.inspector .chip:has-text("Above worktop")'); pg.wait_for_timeout(400)
    pg.click('.pt-n button[data-k="3"]'); pg.wait_for_timeout(400)
    pg.fill('#f-pt-label', 'TV wall'); pg.wait_for_timeout(500)
    s0b = next(x for x in pg.evaluate(PTS) if x['id'] == s0['id'])
    check('height 1200, triple, a name', s0b['h'] == 1.2 and s0b['n'] == 3 and s0b['label'] == 'TV wall', s0b)
    pg.screenshot(path=SHOTS + 'install-2d.png')
    # drag it along the wall
    a = pg.evaluate(SYM, s0['id']); bpt = to_screen(pg, I['wx'] - 0.245, I['drag'])
    drag(pg, a, bpt)
    s0c = next(x for x in pg.evaluate(PTS) if x['id'] == s0['id'])
    check('dragged: it slides along the wall and stays on it', near(s0c['x'], s0['x'], 0.002) and near(s0c['y'], I['drag'], 0.06), s0c)
    # the room: counts and floor heating
    pg.mouse.click(*to_screen(pg, *I['room_at'])); pg.wait_for_timeout(600)
    chips = pg.evaluate("() => [...document.querySelectorAll('.pt-chip')].map(e => e.textContent)")
    check('the room counts them', '7 sockets in 3 boxes' in chips and '1 × Switch' in chips and '1 × Data' in chips, chips)
    pg.check('#f-heat'); pg.wait_for_timeout(500)
    pg.fill('#f-heat-zone', 'Group 1 downstairs'); pg.wait_for_timeout(500)
    h_ = pg.evaluate("(n) => window.__hp.app.shownVersion().plan.rooms.find(r => r.name === n).heat", I['room'])
    check('floor heating with its zone', h_ == {'on': True, 'zone': 'Group 1 downstairs'}, h_)
    check('2D: floor heating drawn', pg.evaluate("() => document.querySelectorAll('.heat-fill').length") == 1)
    # changes compared with the original
    pg.click('#display-toggle button[data-mode="diff"]'); pg.wait_for_timeout(1200)
    ch = pg.evaluate("(n) => window.__hp.app.currentDiff.rooms.changed.filter(c => c.room.name === n).flatMap(c => c.changes.map(x => x.field))", I['room'])
    check('Changes: installations and floor heating of the room', 'Installations' in ch and 'Floor heating' in ch, ch)
    check('Changes: the new points marked', pg.evaluate("() => document.querySelectorAll('.pt2d.pt-new').length") == 7)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    # materials list
    q = pg.evaluate("() => window.__hp.houseQuantities(window.__hp.app.project, window.__hp.app.shownVersion().plan).materials.filter(m => m.group === 'elec').map(m => [m.what, m.amount])")
    check('materials: the installation points per kind', ['Socket', 3] in q and ['Ventilation valve · Supply (toevoer)', 1] in q, q)
    # 3D
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500); still(pg)
    n3 = pg.evaluate("() => { const ids = new Set(); window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData.point) ids.add(o.userData.point); }); return ids.size; }")
    check('3D: all seven drawn', n3 == 7, n3)
    spot = pg.evaluate("() => window.__hp.app.panes[0].view.lightSpots.filter(s => s.point).length")
    check('3D: the room\'s light comes from its own light point', spot == 1, spot)
    pg.evaluate("([t, c]) => { const v = window.__hp.app.panes[0].view; v.controls.target.set(...t); v.camera.position.set(...c); v.controls.update(); v.needs = true; }", [I['cam_t'], I['cam']])
    pg.wait_for_timeout(1400); still(pg); pg.wait_for_timeout(300)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
    n0 = pg.evaluate("() => [...document.querySelectorAll('.label3d.pt3d')].filter(e => !e.hidden).length")
    check('3D: the height labels are off at first', n0 == 0 and pg.evaluate("() => window.__hp.app.settings.ptHeights") is not True, n0)
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    pg.click('#mi-pt-heights'); pg.wait_for_timeout(2500); still(pg); pg.wait_for_timeout(300)
    on = pg.get_attribute('#mi-pt-heights', 'aria-pressed') if pg.query_selector('#mi-pt-heights') else None
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    labs = pg.evaluate("() => [...document.querySelectorAll('.label3d.pt3d')].filter(e => !e.hidden).map(e => e.textContent)")
    check('3D up close, with View → “3D: heights of sockets and switches” on: the heights are shown', on == 'true' and '1200' in labs and '300' in labs, (on, labs))
    pg.screenshot(path=SHOTS + 'install-3d.png')
    # tap the switch in 3D
    sw = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; const r = v.renderer.domElement.getBoundingClientRect();
      for (let y = r.top + 20; y < r.bottom - 20; y += 6) for (let x = r.left + 20; x < r.right - 20; x += 6) { const h = v.firstHit({ clientX: x, clientY: y }); if (h && h.object.userData.point) return [x, y, h.object.userData.point]; } return null; }""")
    if sw:
        pg.mouse.click(sw[0], sw[1]); pg.wait_for_timeout(900)
        check('3D: tap a socket or switch to open it', pg.evaluate("() => window.__hp.app.selection") == {'type': 'point', 'id': sw[2], 'readOnly': False})
    else: check('3D: a point to tap', False)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.camera.position.set(-6, 14, 22); v.controls.update(); v.needs = true; }")
    pg.wait_for_timeout(1200); still(pg)
    labs = pg.evaluate("() => [...document.querySelectorAll('.label3d.pt3d')].filter(e => !e.hidden).length")
    check('3D from far away: no height labels', labs == 0, labs)
    # walking: the heights show when you come close
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(3000)
    pg.evaluate("([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.yaw = -1.5708; w.pitch = -0.35; w.feet = w.groundAt(w.x, w.y, w.feet + 1) ?? w.feet; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }", I['walk'])
    pg.wait_for_timeout(1500); still(pg); pg.wait_for_timeout(400)
    labs = pg.evaluate("() => [...document.querySelectorAll('.label3d.pt3d')].filter(e => !e.hidden).map(e => e.textContent)")
    check('walking: the heights of the sockets in front of you', '1200' in labs and len(labs) >= 2, labs)
    pg.screenshot(path=SHOTS + 'install-walk.png')
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(1500)
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(800)
    if pg.evaluate("() => window.__hp.app.view.dim") != '3d': pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2000)
    # layer off
    pg.evaluate("() => { window.__hp.app.settings.installs = false; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(2000); still(pg)
    n3 = pg.evaluate("() => { let n = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData.point) n++; }); return n; }")
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(900)
    check('the layer switched off: not in 3D, not in 2D', n3 == 0 and pg.evaluate("() => document.querySelectorAll('.pt2d').length") == 0)
    pg.evaluate("() => { window.__hp.app.settings.installs = true; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(800)
    # delete and undo
    pg.mouse.click(*pg.evaluate(SYM, P[6]['id'])); pg.wait_for_timeout(500)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(500)
    gone = len(pg.evaluate(PTS)) == 6
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    check('delete, and undo brings it back', gone and len(pg.evaluate(PTS)) == 7)
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    pr = json.loads(text)['projects'][0]['project']
    check('kept in the house file', any(len(v['plan'].get('points', [])) == 7 for v in pr['versions']))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # phone: place a socket with a tap
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { for (const v of window.__hp.app.project.versions) { v.plan.points = []; for (const r of v.plan.rooms) delete r.heat; } window.__hp.app.refreshViews(); }"); pg.wait_for_timeout(600)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    pg.tap('#toolrail button[data-tool="install"]') if pg.query_selector('#toolrail button[data-tool="install"]') else pg.evaluate("() => window.__hp.app.setTool('install')")
    pg.wait_for_timeout(500)
    I = INST[by_house(pg, 'test', 'own')]
    x, y = to_screen(pg, I['wx'] - 0.095, I['ys'][1])
    pg.touchscreen.tap(x, y); pg.wait_for_timeout(700)
    check('phone: a tap on a wall places a socket', len(pg.evaluate(PTS)) == 1)
    pg.screenshot(path=SHOTS + 'install-phone.png')
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
