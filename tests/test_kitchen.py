"""Kitchen runs and islands: units, snapping against a wall, Fill the wall, unit kinds and widths, the Width field,
island with bar stools and worktop down the ends, Check space, undo, 3D."""
from common import *

UNITS = "() => { const f = window.__hp.app.activeLayout().items.find(i => i.type === 'krun' && !i.island); return f ? f.units.map(u => [u.k, u.w]) : null; }"
def run_item(pg):
    return [f for f in pg.evaluate(ITEMS) if f['type'] == 'krun'][0]
def add(pg, search):
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(400)
    pg.fill('.cat-body input[type=search]', search); pg.wait_for_timeout(200)
    pg.click('.cat-card >> nth=0'); pg.wait_for_timeout(600)
    return pg.evaluate(ITEMS)[-1]

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    without_renato(pg)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1000)
    pg.evaluate("() => { window.__hp.app.settings.pip = false; window.__hp.app.updatePip(); }")
    # (the example has its own kitchen: test_round9.py; here a kitchen is made from scratch)
    pg.evaluate("() => window.__hp.app.furnMutate(l => { l.items = l.items.filter(i => !(window.__hp.ownId(i.id) && /kit/.test(i.id)) && i.type !== 'krun' && i.type !== 'island' && !i.island); })"); pg.wait_for_timeout(600)
    kk = rooms(pg)['Keuken']
    run = add(pg, 'kitchen run')
    u = pg.evaluate(UNITS)
    check('run added with units that add up to its width', run['type'] == 'krun' and len(u) >= 5 and near(sum(w for _, w in u), run['w'], 0.002), (run, u))
    drag(pg, to_screen(pg, run['x'], run['y']), to_screen(pg, kk[2] - 0.32, (kk[1] + kk[3]) / 2))
    run = run_item(pg)
    check('run snaps with its back to the wall', run['rot'] == 90 and near(run['x'], kk[2] - 0.3), run)
    pg.click('.inspector button:has-text("Fill the wall")'); pg.wait_for_timeout(600)
    run = run_item(pg); u = pg.evaluate(UNITS)
    toast = pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ')")
    check('Fill the wall: run fits between the obstacles', 'fills the wall' in toast and near(sum(w for _, w in u), run['w'], 0.002) and 0.3 < run['w'] < by_house(pg, kk[3] - kk[1] + 0.002, 4), (run, u, toast))   # (owner's kitchen wall: obstacles, under 4 m; made-up: the whole 4.4 m wall)
    pg.select_option('.run-row >> nth=1 >> select', 'oven'); pg.wait_for_timeout(400)
    check('a unit becomes an oven', pg.evaluate(UNITS)[1][0] == 'oven')
    pg.fill('.run-row >> nth=0 >> input', '45'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    run = run_item(pg); u = pg.evaluate(UNITS)
    check('unit width typed in cm; the run follows', near(u[0][1], 0.45, 0.001) and near(run['w'], sum(w for _, w in u), 0.002), (run, u))
    pg.fill('#f-furn-w', '120'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    run = run_item(pg); u = pg.evaluate(UNITS)
    check('Width field rescales the units', near(run['w'], 1.2, 0.003) and near(sum(w for _, w in u), 1.2, 0.003), (run, u))
    pg.click('.inspector .chip:has-text("Wall cabinets")'); pg.wait_for_timeout(300)
    check('wall cabinets can be switched off', pg.evaluate("() => window.__hp.app.activeLayout().items.find(i => i.type === 'krun').wallUnits") is False)
    # island with stools
    isl = add(pg, 'island')
    check('island is a run with units', pg.evaluate("() => { const f = window.__hp.app.activeLayout().items.at(-1); return f.island && f.units.length; }") >= 3)
    drag(pg, to_screen(pg, isl['x'], isl['y']), to_screen(pg, (kk[0] + kk[2]) / 2 - 0.3, (kk[1] + kk[3]) / 2))
    pg.click('.inspector button:has-text("Place bar stools")'); pg.wait_for_timeout(500)
    items = pg.evaluate(ITEMS)
    stools = [i for i in items if i['type'] == 'stool']
    isl = [i for i in items if i['id'] == isl['id']][0]
    check('four bar stools along the overhang', len(stools) == 4 and all(s['y'] > isl['y'] + 0.3 for s in stools), (isl, stools))
    pg.click('.inspector .chip:has-text("Worktop down the ends")'); pg.wait_for_timeout(300)
    wf = "() => !!window.__hp.app.activeLayout().items.find(i => i.island).waterfall"
    check('worktop down the ends', pg.evaluate(wf))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    check('undo takes it back', not pg.evaluate(wf))
    pg.click('#toolrail button[data-tool="space"]'); pg.wait_for_timeout(1500)
    res = pg.evaluate("() => window.__hp.app.spaceCheck.results.map(r => r.text)")
    check('Check space looks at the kitchen', any('Kitchen' in r for r in res), res)
    pg.click('#toolrail button[data-tool="select"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=SHOTS + 'kitchen-2d.png')
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)
    # (the parts of a kitchen are merged per material: few meshes, many triangles)
    n = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view, ids = new Set(window.__hp.app.activeLayout().items.filter(i => i.type === 'krun' || i.island).map(i => i.id)); let n = 0, tri = 0;
        v.scene.traverse(o => { if (o.isMesh && o.userData && ids.has(o.userData.furn)) { n++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return [n, tri]; }""")
    check('kitchen in 3D (many parts, merged per material)', n[0] >= 4 and n[1] > 300, n)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.controls.target.set(11.5, 0.8, 9.3); v.camera.position.set(8.5, 3.6, 12.5); v.controls.update(); v.needs = true; }"); pg.wait_for_timeout(2000)
    pg.screenshot(path=SHOTS + 'kitchen-3d.png')
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
