"""Ninth round (30 Oct): the kitchen builder, on the example's kitchen (a run along the wall and an island): a front
view to pick units, doors, hinges, the bowl of the sink, standard widths, adding a unit, the look for the whole
kitchen, a run round the corner, the island's back; drawn in 2D and 3D (parts merged per material). PC and phone.
(The owner's own kitchen – tall wall, oven tower, niche, his sizes – and its upgrade: house/tests/test_round9_own.py.)"""
from common import *

# the example's kitchen: the run along a wall (with a sink) and the island, on the ground floor of Layout 1
KITS = """() => { const a = window.__hp.app, L = a.activeLayout(); const st = [...a.project.storeys].sort((x, y) => x.level - y.level)[0].id;
  const its = L.items.filter(i => i.storey === st && (i.type === 'krun' || i.type === 'island'));
  const run = its.find(i => i.type === 'krun' && (i.units || []).some(u => u.k === 'sink')), isl = its.find(i => i.type === 'island');
  return { run: run && run.id, island: isl && isl.id, all: its.map(i => i.id) }; }"""
BBOX = """(id) => { const v = window.__hp.app.panes[0].view, THREE = window.__hp.THREE; const b = new THREE.Box3(); let n = 0, tri = 0;
  v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id) { b.expandByObject(o); n++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  return { n, tri, min: b.min.toArray().map(x => +x.toFixed(3)), max: b.max.toArray().map(x => +x.toFixed(3)) }; }"""
SEL = "(id) => { const a = window.__hp.app; a.select({ type: 'furn', ids: [id] }); if (a.toggleInspector) a.toggleInspector(true); }"
ITEM = "(id) => JSON.parse(JSON.stringify(window.__hp.app.activeLayout().items.find(i => i.id === id)))"
UNITS = "(id) => window.__hp.app.activeLayout().items.find(i => i.id === id).units.map(u => ({ ...u }))"

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    without_renato(pg)
    K = pg.evaluate(KITS)
    check('the example has a kitchen: a run with a sink and an island', K['run'] and K['island'], K)
    RUN, ISL = K['run'], K['island']
    units0 = pg.evaluate(UNITS, RUN)
    SINK = next(i for i, u in enumerate(units0) if u['k'] == 'sink')
    # 3D
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(400)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => { window.__hp.app.settings.pip = false; window.__hp.app.updatePip && window.__hp.app.updatePip(); }")
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(5000)
    r3, i3 = pg.evaluate(BBOX, RUN), pg.evaluate(BBOX, ISL)
    run = pg.evaluate(ITEM, RUN); isl = pg.evaluate(ITEM, ISL)
    check('3D: the run and the island are built, the worktop at their height', r3['n'] > 0 and i3['n'] > 0 and r3['max'][1] >= run['h'] - 0.01 and near(i3['max'][1], isl['h'], 0.06), [r3, i3])
    check('the parts are merged per material (few draw calls, many triangles)', all(x['n'] <= 30 and x['tri'] > by_house(pg, 300, 500) for x in (r3, i3)), [r3['n'], i3['n'], r3['tri'], i3['tri']])
    pg.screenshot(path=SHOTS + 'r9-kitchen-3d.png')
    # the builder: pick a unit in the front view
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1200)
    pg.evaluate(SEL, RUN); pg.wait_for_timeout(1000)
    check(f'the builder shows a front view with the {len(units0)} units', pg.locator('.inspector .kit-elev .ke-unit').count() == len(units0), pg.locator('.inspector .kit-elev .ke-unit').count())
    pg.locator('.inspector .kit-elev .ke-unit').nth(SINK).click(); pg.wait_for_timeout(700)
    head = pg.inner_text('.inspector .kit-unit .eyebrow').lower()
    check(f'tapping unit {SINK + 1} in the front view picks the sink', f'unit {SINK + 1}' in head and 'sink' in head, head)
    pg.fill('#f-kit-sw', '50'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    check('the bowl width is typed in cm', near(pg.evaluate(UNITS, RUN)[SINK].get('sinkW', 0), 0.5, 0.001), pg.evaluate(UNITS, RUN)[SINK])
    pg.click('.inspector .kit-n button[data-k="1"]'); pg.wait_for_timeout(600)
    check('one door: the hinge side can be chosen', pg.is_visible('.inspector .kit-hinge'))
    pg.click('.inspector .kit-hinge button[data-k="L"]'); pg.wait_for_timeout(500)
    u = pg.evaluate(UNITS, RUN)[SINK]
    check('… left', u.get('n') == 1 and u.get('hinge') == 'L', u)
    w0 = pg.evaluate(ITEM, RUN)['w']
    pg.click('.inspector .kit-unit .chips-row button:has-text("90")'); pg.wait_for_timeout(600)
    w1 = pg.evaluate(ITEM, RUN)['w']
    check('a standard width with one tap (90 cm); the run grows with it', near(pg.evaluate(UNITS, RUN)[SINK]['w'], 0.9, 0.001) and near(w1 - w0, 0.9 - units0[SINK]['w'], 0.002), [w0, w1])
    for _ in range(4): pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    check('undo puts the sink back as drawn', pg.evaluate(UNITS, RUN)[SINK] == units0[SINK], pg.evaluate(UNITS, RUN)[SINK])
    # add a unit after the picked one, by zone
    pg.evaluate(SEL, RUN); pg.wait_for_timeout(600)
    n0 = len(pg.evaluate(UNITS, RUN))
    pg.select_option('.inspector .run-sec .actions select', 'open'); pg.wait_for_timeout(600)
    us = pg.evaluate(UNITS, RUN)
    check('“+ Add a unit” puts open shelves in the run', len(us) == n0 + 1 and any(u['k'] == 'open' for u in us), [u['k'] for u in us])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    # the look for the whole kitchen
    H0 = [pg.evaluate(ITEM, i).get('handles') for i in K['all']]
    pg.evaluate(SEL, RUN); pg.wait_for_timeout(600)
    pg.click('.inspector .kit-handles button[data-k="none"]'); pg.wait_for_timeout(500)
    pg.click('#f-kit-lookall'); pg.wait_for_timeout(600)
    H1 = [pg.evaluate(ITEM, i).get('handles') for i in K['all']]
    check('“Use this look for the whole kitchen”: no handles (push to open) on all of it', all(h == 'none' for h in H1), H1)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    check('… undo: the handles as they were', [pg.evaluate(ITEM, i).get('handles') for i in K['all']] == H0, H0)
    # a run round the corner (at the left end of the run)
    n1 = pg.evaluate("() => window.__hp.app.activeLayout().items.length")
    pg.evaluate(SEL, RUN); pg.wait_for_timeout(600)
    pg.click('.inspector button:has-text("Run around the corner, left")'); pg.wait_for_timeout(700)
    nr = pg.evaluate("() => { const L = window.__hp.app.activeLayout(); const f = L.items[L.items.length - 1]; return { n: L.items.length, type: f.type, rot: f.rot, top: f.top, color: f.color }; }")
    check('a run round the corner: a new run at right angles, with the same look', nr['n'] == n1 + 1 and nr['type'] == 'krun' and (nr['rot'] - run['rot']) % 180 == 90 and nr['top'] == run.get('top') and nr['color'] == run['color'], [nr, run['rot']])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    # the island: front and back side
    pg.evaluate(SEL, ISL); pg.wait_for_timeout(600)
    back0 = len(isl.get('back') or [])
    BACKVIEW = "() => { const b = document.querySelector('.inspector .kit-side button[data-k=back]'); if (!b) return null; b.click(); return true; }"
    if back0:
        pg.evaluate(BACKVIEW); pg.wait_for_timeout(500)
        nb = pg.locator('.inspector .kit-elev .ke-unit').count()
    pg.click('#f-kit-back'); pg.wait_for_timeout(500)
    back1 = len(pg.evaluate(ITEM, ISL).get('back') or [])
    if not back0:
        pg.evaluate(BACKVIEW); pg.wait_for_timeout(500)
        nb = pg.locator('.inspector .kit-elev .ke-unit').count()
    check('the island: its back side in the front view', nb == (back0 or back1), [nb, back0, back1])
    check('… “Cupboards on the back too” switches the back on or off', (back1 > 0) != (back0 > 0), [back0, back1])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    check('… undo: as it was', len(pg.evaluate(ITEM, ISL).get('back') or []) == back0)
    pg.screenshot(path=SHOTS + 'r9-builder-pc.png')
    # 2D: the kitchen on the plan
    n2 = pg.evaluate("(ids) => ids.filter(id => document.querySelector(`.pane svg [data-furn=\"${id}\"]`)).length", [RUN, ISL])
    check('the kitchen is drawn on the plan', n2 == 2, n2)
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone: the builder on a small screen ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    without_renato(pg)
    K = pg.evaluate(KITS)
    # the unit with the hob (in the run or in the island)
    HOB = pg.evaluate("(ids) => { for (const id of ids) { const f = window.__hp.app.activeLayout().items.find(i => i.id === id); const i = (f.units || []).findIndex(u => u.k === 'hob'); if (i >= 0) return [id, i]; } return null; }", [K['run'], K['island']])
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(400)
    pg.tap('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.evaluate(SEL, HOB[0]); pg.wait_for_timeout(1200)
    pg.locator('.inspector .kit-elev').scroll_into_view_if_needed(); pg.wait_for_timeout(400)
    el = pg.locator('.inspector .kit-elev .ke-unit').nth(HOB[1])
    bb = el.bounding_box()
    pg.touchscreen.tap(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] * 0.75); pg.wait_for_timeout(700)
    head = pg.inner_text('.inspector .kit-unit .eyebrow').lower()
    check('phone: tapping the hob in the front view picks it', f'unit {HOB[1] + 1}' in head and 'hob' in head, head)
    check('phone: the hob offers a downdraft extractor', pg.is_visible('#f-kit-dd'))
    ov = pg.evaluate("() => { const e = document.querySelector('.inspector'); return [...e.querySelectorAll('*')].filter(x => x.getBoundingClientRect().right > window.innerWidth + 1).map(x => x.className).slice(0, 5); }")
    check('phone: nothing sticks out of the screen', not ov, ov)
    pg.screenshot(path=SHOTS + 'r9-builder-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
