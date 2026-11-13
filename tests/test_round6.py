"""Sixth round (29 Oct, evening): the sun (day and time) while walking; the gate 1.8 m high and it opens and closes
(tap it); cars for the parking place (Outside: IONIQ 6 and 208 sizes) stand on the garden and are not in the original.
PC and phone, light and dark. (The owner's hedges, his garden tiles, walking into his gate and along his hedges and low
walls, and the upgrade of his older copies: house/tests/test_round6_own.py.)"""
from common import *
import math

ST = "() => { const w = window.__hp.app.walker; return w ? w.state() : null; }"
SIM = """([keys, secs, yaw]) => { const w = window.__hp.app.walker; if (yaw != null) { w.yaw = yaw; w.look.dx = 0; w.look.dy = 0; } w.keys.clear(); for (const k of keys) w.keys.add(k); const n = Math.round(secs / 0.05); for (let i = 0; i < n; i++) w.tick(0.05); w.keys.clear(); return w.state(); }"""
PUT = "([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.feet = -0.13; w.look.dx = 0; w.look.dy = 0; }"
GATE = "() => window.__hp.app.shownVersion().plan.garden.lines.find(l => l.kind === 'gate')"
LEAF = """() => { let a = null; window.__hp.app.panes[0].view.group.traverse(o => { if (o.isMesh && o.userData.gate && o.userData.door && o.parent) a = +o.parent.rotation.y.toFixed(3); }); return a; }"""
# a camera 4.4 m from the gate's middle, on the side away from the house, looking at it
GATE_CAM = """() => { const a = window.__hp.app, l = a.shownVersion().plan.garden.lines.find(l => l.kind === 'gate'); const st = [...a.project.storeys].sort((x, y) => x.level - y.level)[0];
  const P = a.shownVersion().plan.rooms.filter(r => r.storey === st.id).flatMap(r => r.poly); const hc = [P.reduce((s, q) => s + q[0], 0) / P.length, P.reduce((s, q) => s + q[1], 0) / P.length];
  const A = l.pts[0], B = l.pts[l.pts.length - 1], m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], L = Math.hypot(B[0] - A[0], B[1] - A[1]); let n = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L];
  if ((m[0] - hc[0]) * n[0] + (m[1] - hc[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const v = a.panes[0].view; v.controls.target.set(m[0], 0.9, m[1]); v.camera.position.set(m[0] + n[0] * 4.4, 2.4, m[1] + n[1] * 4.4); v.controls.update(); }"""

with sync_playwright() as p:
    # ───────── PC, light ─────────
    b, pg = open_app(p)
    open_example(pg)
    gates = pg.evaluate("() => window.__hp.app.project.versions.filter(v => v.kind !== 'original').map(v => v.plan.garden.lines.filter(l => l.kind === 'gate').map(l => l.h))")
    check('the gate is 1.8 m high (in both plans)', all(g == [1.8] for g in gates), gates)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)

    # the gate in 3D: 1.8 m to its top; tap it to open, again to close (View)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
    g3 = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view, THREE = window.__hp.THREE; const b = new THREE.Box3(); v.group.traverse(o => { if (o.isMesh && o.userData.gate) b.expandByObject(o); }); return [b.min.y, b.max.y].map(x => +x.toFixed(3)); }""")
    check('3D: the gate stands 1.8 m from the garden to its top', abs((g3[1] - g3[0]) - 1.8) < 0.06, g3)
    pg.evaluate(GATE_CAM); pg.wait_for_timeout(1500); still(pg)
    gid = pg.evaluate("() => window.__hp.app.shownVersion().plan.garden.lines.find(l => l.kind === 'gate').id")
    SPOT = """() => { const v = window.__hp.app.panes[0].view, THREE = window.__hp.THREE; let leaf = null; v.group.traverse(o => { if (o.isMesh && o.userData.gate && o.userData.door) leaf = o; });
      const b = new THREE.Box3().setFromObject(leaf), c = b.getCenter(new THREE.Vector3()); c.y = b.min.y + 0.9; c.project(v.camera); const r = v.renderer.domElement.getBoundingClientRect();
      return [r.left + (c.x + 1) / 2 * r.width, r.top + (1 - c.y) / 2 * r.height]; }"""
    check('the gate is closed at first', pg.evaluate("(id) => window.__hp.app.isDoorClosed(id)", gid) and pg.evaluate(LEAF) == 0)
    pg.screenshot(path=SHOTS + 'r6-gate-closed.png')
    pt = pg.evaluate(SPOT)
    pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(2500); still(pg)
    a1 = pg.evaluate(LEAF)
    check('View: tap the gate – it swings open into the garden beside the house', not pg.evaluate("(id) => window.__hp.app.isDoorClosed(id)", gid) and a1 is not None and abs(abs(a1) - math.pi / 2) < 0.02 and pg.evaluate("(id) => window.__hp.app.project.doorState[id]", gid) == 'open', a1)
    pg.screenshot(path=SHOTS + 'r6-gate-open.png')
    pt2 = pg.evaluate(SPOT)
    pg.mouse.click(pt2[0], pt2[1]); pg.wait_for_timeout(2500); still(pg)
    check('tap it again: closed', pg.evaluate("(id) => window.__hp.app.isDoorClosed(id)", gid) and pg.evaluate(LEAF) == 0, pg.evaluate(LEAF))
    # Build: a small pop-up; its details have the button too
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(1500); still(pg)
    pt3 = pg.evaluate(SPOT)
    pg.mouse.click(pt3[0], pt3[1]); pg.wait_for_timeout(600)
    pop = pg.evaluate("() => { const e = document.querySelector('.door-pop'); return e && e.textContent; }")
    check('Build: tap the gate – "Open the gate"', pop and 'Open the gate' in pop, pop)
    pg.click('.door-pop .btn.primary'); pg.wait_for_timeout(1500)
    check('… it opens', not pg.evaluate("(id) => window.__hp.app.isDoorClosed(id)", gid))
    pg.evaluate("(id) => window.__hp.app.select({ type: 'gline', id })", gid); pg.wait_for_timeout(600)
    lab = pg.evaluate("() => { const e = document.querySelector('#g-gate-open'); return e && e.textContent; }")
    hlab = pg.evaluate("() => { const e = document.querySelector('#f-gline-h'); return e && e.closest('.field').textContent; }")
    check('the gate\'s details: "Close the gate", and its height is the gate\'s', lab and 'Close the gate' in lab and hlab and 'Height of the gate' in hlab and pg.input_value('#f-gline-h') == '1800', [lab, hlab])
    pg.click('#g-gate-open'); pg.wait_for_timeout(1200)
    check('… which closes it', pg.evaluate("(id) => window.__hp.app.isDoorClosed(id)", gid))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # walking (walking into his gate, his hedges and low walls: house/tests/test_round6_own.py)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)

    # the sun while walking: a button in the walking bar, the day and time under it
    check('walking: a sun button, off', pg.evaluate("() => { const b = document.querySelector('#btn-walk-sun'); return !!b && b.getAttribute('aria-pressed') === 'false'; }") and not pg.is_visible('.sun-bar'))
    pg.click('#btn-walk-sun'); pg.wait_for_timeout(2500)
    on = pg.evaluate("() => [window.__hp.app.settings.light, !!document.querySelector('.sun-bar'), document.querySelector('#btn-walk-sun').getAttribute('aria-pressed'), !!window.__hp.app.walker]")
    check('the sun while walking: the day and time bar under the walking bar, still walking', on == ['sun', True, 'true', True], on)
    pos = pg.evaluate("() => { const a = document.querySelector('.walkbar').getBoundingClientRect(), b = document.querySelector('.sun-bar').getBoundingClientRect(); return [a.bottom, b.top]; }")
    check('… the sun bar is under the walking bar', pos[1] >= pos[0] - 1, pos)
    pg.evaluate("() => { const t = document.querySelector('#sun-time'); t.value = '960'; t.dispatchEvent(new Event('input', { bubbles: true })); }"); pg.wait_for_timeout(1200)
    sun = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return v.sunInfo && [Math.round(v.sunInfo.el), Math.round(v.sunInfo.az)]; }")
    check('… moving the time moves the sun (16:00: low in the south-west)', sun and 0 < sun[0] < 20 and 200 < sun[1] < 280, sun)
    pg.evaluate("([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.feet = -0.13; w.yaw = 0; w.pitch = -0.1; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }", by_house(pg, room_pt(pg, 'Woonkamer'), [4.5, 3.5])); pg.wait_for_timeout(1500); still(pg)
    pg.screenshot(path=SHOTS + 'r6-walk-sun.png')
    pg.click('#btn-walk-sun'); pg.wait_for_timeout(2000)
    check('the sun button again: the normal day light, no sun bar', pg.evaluate("() => window.__hp.app.settings.light") == 'day' and not pg.is_visible('.sun-bar'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)

    # cars for the parking place
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1500)
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1200)
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(500)
    pg.click('.cat-tabs button:has-text("Outside")'); pg.wait_for_timeout(300)
    cards = pg.evaluate("() => [...document.querySelectorAll('.cat-card')].map(c => c.textContent)")
    check('the catalogue has Outside: a car, and cars of the IONIQ 6 and 208 sizes', any('IONIQ 6' in c for c in cards) and any('208' in c for c in cards) and any(c.startswith('Car') for c in cards), cards)
    ids0 = {x['id'] for x in pg.evaluate(ITEMS)}
    pg.click('.cat-card:has-text("IONIQ 6")'); pg.wait_for_timeout(900)
    car = [x for x in pg.evaluate(ITEMS) if x['id'] not in ids0][0]
    check('the IONIQ 6 car is its real size (4.86 × 1.88 × 1.50 m)', car['type'] == 'car_ioniq6' and near(car['d'], 4.86) and near(car['w'], 1.88), car)
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(500)
    ids1 = {x['id'] for x in pg.evaluate(ITEMS)}
    pg.click('.cat-tabs button:has-text("Outside")'); pg.wait_for_timeout(300)
    pg.click('.cat-card:has-text("208")'); pg.wait_for_timeout(900)
    car2 = [x for x in pg.evaluate(ITEMS) if x['id'] not in ids1][0]
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # on the parking place (the made-up house: one car on its drive, the other on the front lawn; the owner's: both on the
    # parking place beside his kitchen wall)
    C1, C2 = by_house(pg, ([10.9, 13.7], [-1.5, 13.0]), ([15.6, 10.6], [18.6, 10.6]))
    pg.evaluate("([a, b, p, q]) => { const app = window.__hp.app; app.updateFurn(a, f => { f.x = p[0]; f.y = p[1]; f.rot = 0; }); app.updateFurn(b, f => { f.x = q[0]; f.y = q[1]; f.rot = 0; }); }", [car['id'], car2['id'], C1, C2]); pg.wait_for_timeout(1200)
    pg.evaluate("(c) => window.__hp.app.panes[0].view.setViewState({ kind: '2d', c, s: 34 })", [C1[0] + 0.9, C1[1] - 0.6]); pg.wait_for_timeout(800)
    # a car does not turn its back to the house wall
    before = [x for x in pg.evaluate(ITEMS) if x['id'] == car['id']][0]
    drag(pg, to_screen(pg, *C1), to_screen(pg, C1[0] - 0.85, C1[1]))
    after = [x for x in pg.evaluate(ITEMS) if x['id'] == car['id']][0]
    check('dragged sideways (on the owner\'s parking: next to the kitchen wall) a car stays as it is (no turning its back to the wall)', after['rot'] == 0 and after['x'] < before['x'] - 0.5, (before, after))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    pg.screenshot(path=SHOTS + 'r6-cars-2d.png')
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
    zs = pg.evaluate("""(ids) => { const v = window.__hp.app.panes[0].view, THREE = window.__hp.THREE, out = {}; v.group.traverse(o => { if (o.userData && ids.includes(o.userData.furn) && o.type === 'Group' && !(o.userData.furn in out)) { const b = new THREE.Box3().setFromObject(o); out[o.userData.furn] = [+b.min.y.toFixed(3), +(b.max.y - b.min.y).toFixed(2), +(b.max.z - b.min.z).toFixed(2)]; } }); return out; }""", [car['id'], car2['id']])
    check('3D: the cars stand on the parking place (the garden is 15 cm below the floor), their real size', all(abs(v[0] + 0.13) < 0.02 and 1.4 < v[1] < 1.6 for v in zs.values()) and abs(zs[car['id']][2] - 4.86) < 0.15, zs)
    pg.evaluate("""(c) => { const v = window.__hp.app.panes[0].view; v.controls.target.set(c[0], 0.6, c[1]); v.camera.position.set(c[0] - 5.5, 3.4, c[1] + 4.9); v.controls.update(); }""", [C1[0] + 1.4, C1[1]]); pg.wait_for_timeout(1500); still(pg)
    pg.screenshot(path=SHOTS + 'r6-cars-3d.png')
    # not in the original (the garden as delivered)
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1200)
    inPlan = pg.evaluate("(ids) => window.__hp.app.panes[0].view.spec.entries.some(en => (en.furniture || []).some(f => ids.includes(f.id)))", [car['id'], car2['id']])
    pg.evaluate("() => window.__hp.app.setDisplay('original')"); pg.wait_for_timeout(1500)
    inOrig = pg.evaluate("(ids) => window.__hp.app.panes[0].view.spec.entries.some(en => (en.furniture || []).some(f => ids.includes(f.id)))", [car['id'], car2['id']])
    inside = pg.evaluate("() => { const a = window.__hp.app, p = a.project, o = p.versions.find(v => v.kind === 'original'); return p.storeys.reduce((n, st) => n + a.entryExtras(st, 'main', o).furniture.length, 0); }")
    check('the cars are in the plans, not in the original (furniture inside the house still is)', inPlan and not inOrig and inside > 0, [inPlan, inOrig, inside])
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(800)
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.tap('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    pg.tap('#btn-walk-sun'); pg.wait_for_timeout(2500)
    fit = pg.evaluate("() => [...document.querySelectorAll('.walkbar, .sun-bar')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth]; })")
    check('phone: walking with the sun – both bars fit on the screen', len(fit) == 2 and all(f[0] >= 0 and f[1] <= f[2] + 1 for f in fit), fit)
    pg.screenshot(path=SHOTS + 'r6-phone-walk-sun.png')
    pg.tap('#btn-walk-sun'); pg.wait_for_timeout(1500)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
