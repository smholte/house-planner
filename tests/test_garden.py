"""Garden and plot: the example's site (its plot, streets and water), a garden per version (delivered: bare soil, a
drive and a path; the example's plans: lawn, terrace, trees). The Garden tool draws areas, lines and plants; the details change them; the water level moves
the water in 3D; undo; versions keep their own garden; kept in the house file; a house without a plot gets one."""
from common import *

G = "() => { const a = window.__hp.app; const g = a.shownVersion().plan.garden; return g ? { base: g.base, areas: g.areas.map(x => [x.id, x.kind, x.name || '']), lines: g.lines.map(x => [x.id, x.kind]), plants: g.plants.map(x => [x.id, x.kind, x.x, x.y]) } : null; }"
WATER_Y = "() => { let y = null; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData && o.userData.water) { o.geometry.computeBoundingBox(); y = o.geometry.boundingBox.max.y + o.parent.position.y; } }); return y; }"

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    site = pg.evaluate("() => { const s = window.__hp.app.project.site; return s && { plot: s.plot, north: s.north, water: s.water.level, n: s.streets.length }; }")
    # (the owner's plot, its quay wall and canal: house/tests/test_garden_own.py)
    NORTH = round(site['north']) if site else None
    check('the example has a plot with its north and streets', site and len(site['plot']) == 4 and site['north'] and site['n'] >= 2, site)
    orig = pg.evaluate("() => { const a = window.__hp.app; const v = a.project.versions.find(x => x.kind === 'original'); const g = v.plan.garden; return { base: g.base, lines: g.lines.map(l => l.kind).sort(), areas: g.areas.map(x => x.kind).sort() }; }")
    check('as delivered: bare soil, a drive and a path, a low wall and a hedge', orig['base'] == 'soil' and orig['areas'] == ['pavers', 'tiles'] and 'wall' in orig['lines'] and 'hedge' in orig['lines'], orig)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    g0 = pg.evaluate(G)
    check('the planned version starts with lawn, a terrace and trees', g0['base'] == 'lawn' and any(a[2] == 'Terrace' for a in g0['areas']) and any(x[1] == 'tree' for x in g0['plants']), g0)
    # 2D: drawn on the ground floor, with the north arrow
    check('2D: plot, areas, walls, hedge and plants are drawn', pg.evaluate("() => { const q = s => document.querySelectorAll(s).length; return q('.garden .g-plot') === 1 && q('.garden .g-area') >= 3 && q('.garden .g-wall') >= 1 && q('.garden .g-hedge') >= 1 && q('.garden .g-plant') >= 5; }"))
    check(f'2D: the north arrow points north ({NORTH}°)', pg.evaluate("(n) => { const e = document.querySelector('.north-arrow'); return e && !e.hidden && new RegExp('rotate\\\\(' + n).test(e.querySelector('svg').style.transform); }", NORTH))
    # the Garden tool: fits the plot, draws an area, a hedge and puts a tree
    pg.click('#toolrail button[data-tool="garden"]'); pg.wait_for_timeout(900)
    scale = pg.evaluate("() => window.__hp.app.panes[0].view.cam.s")
    check('the Garden tool shows the whole plot', scale < 26, scale)
    pg.click('.toolopts .chip:text-is("Wooden decking")'); pg.wait_for_timeout(150)
    # (a free spot of the garden, clear of the lines a corner snaps to: the front garden)
    DX, DY = by_house(pg, (-2.5, 12.3), (-5, 8))
    for xy in [(DX, DY), (DX + 4, DY), (DX + 4, DY + 3), (DX, DY + 3), (DX, DY)]:
        pg.mouse.click(*to_screen(pg, *xy)); pg.wait_for_timeout(180)
    pg.wait_for_timeout(400)
    g1 = pg.evaluate(G)
    deck = [a for a in g1['areas'] if a[1] == 'decking']
    check('an area drawn corner by corner: wooden decking', len(deck) == 1, g1['areas'])
    m2 = pg.evaluate("() => { const a = window.__hp.app.selectionTarget(); return a && Math.abs(window.__hp.app.selectionTarget().poly.reduce((s, p, i, P) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) / 2); }")
    check('its size is 12 m² and it is selected', m2 and abs(m2 - 12) < 0.3, m2)
    pg.click('.g-mode button[data-k="line"]'); pg.wait_for_timeout(150)
    pg.click('.toolopts .chip:text-is("Hedge")'); pg.wait_for_timeout(150)
    for xy in [(3, -4), (8, -4), (8, -4)]:
        pg.mouse.click(*to_screen(pg, *xy)); pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
    g2 = pg.evaluate(G)
    check('a hedge drawn point to point', len([l for l in g2['lines'] if l[1] == 'hedge']) == len([l for l in g1['lines'] if l[1] == 'hedge']) + 1, g2['lines'])
    pg.click('.g-mode button[data-k="plant"]'); pg.wait_for_timeout(150)
    pg.click('.toolopts .chip:text-is("Tree")'); pg.wait_for_timeout(150)
    pg.mouse.click(*to_screen(pg, 12, -6)); pg.wait_for_timeout(400)
    g3 = pg.evaluate(G)
    check('a tree put with one tap', len([x for x in g3['plants'] if x[1] == 'tree']) == 2, g3['plants'])
    # details: the tree's size, the decking becomes tiles 40 × 40
    pg.fill('#f-plant-d', '6000'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check('the tree is 6 m wide', abs(pg.evaluate("() => window.__hp.app.selectionTarget().d") - 6) < 0.001)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'garea', id })", deck[0][0]); pg.wait_for_timeout(300)
    pg.click('.g-area-kind button[data-k="tiles"]'); pg.wait_for_timeout(300)
    pg.click('.g-tile-size button[data-k="40×40"]'); pg.wait_for_timeout(300)
    t = pg.evaluate("() => { const a = window.__hp.app.selectionTarget(); return [a.kind, a.size]; }")
    check('changed to garden tiles of 40 × 40 in the details', t[0] == 'tiles' and abs(t[1][0] - 0.4) < 1e-6, t)
    txt = pg.inner_text('#inspector')
    import math
    want = math.ceil(m2 / 0.16 * 1.05)
    check(f'the details count the tiles ({m2:.1f} m² → {want} tiles)', str(want) in txt, txt[:300])
    # drag the area 1 m to the right
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'garea', id })", deck[0][0]); pg.wait_for_timeout(300)
    drag(pg, to_screen(pg, DX + 0.5, DY + 0.5), to_screen(pg, DX + 1.5, DY + 0.5))
    x0 = pg.evaluate("(id) => Math.min(...window.__hp.app.shownVersion().plan.garden.areas.find(a => a.id === id).poly.map(p => p[0]))", deck[0][0])
    check('dragged 1 m to the right', abs(x0 - (DX + 1)) < 0.15, x0)
    pg.screenshot(path=SHOTS + 'garden-2d.png')
    # Changes: the garden compared with the original
    pg.evaluate("() => { const a = window.__hp.app; a.select(null); a.setDisplay('diff'); }"); pg.wait_for_timeout(800)
    gtxt = pg.evaluate("() => (document.querySelector('.ch-garden') || {}).textContent || ''")
    check('Changes: the garden differences are listed', 'Soil (bare) becomes Lawn' in gtxt and 'New: Terrace' in gtxt and 'plants or trees added' in gtxt, gtxt[:200])
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    # the plot: levels, water, north
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("() => window.__hp.app.select({ type: 'plot', id: 'plot' })"); pg.wait_for_timeout(400)
    PLOT = by_house(pg, '477', '627')
    check(f'the plot details: {PLOT} m², garden 150 mm and water 1000 mm below the floor', PLOT in pg.inner_text('#inspector') and pg.input_value('#f-site-level') == '150' and pg.input_value('#f-water-level') == '1000')
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
    y1 = pg.evaluate(WATER_Y)
    pg.fill('#f-water-level', '600'); pg.keyboard.press('Enter'); pg.wait_for_timeout(2500); still(pg)
    y2 = pg.evaluate(WATER_Y)
    check('3D: the water rises when its level is set higher', y1 is not None and abs(y1 - (-1.0)) < 0.01 and abs(y2 - (-0.6)) < 0.01, (y1, y2))
    n3 = pg.evaluate("() => { let n = 0, trees = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData && o.userData.plant) trees++; if (o.userData && o.userData.garea) n++; }); return [n, trees]; }")
    check('3D: the garden areas and plants are built', n3[0] >= 4 and n3[1] >= by_house(pg, 5, 8), n3)
    pg.evaluate("() => { const a = window.__hp.app; a.select(null); a.setScope('house'); }"); pg.wait_for_timeout(3500); still(pg)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.camera.position.set(-20, 20, -26); v.controls.target.set(6, 0, 4); /* (the whole plot from above) */ v.controls.update(); v.needs = true; }"); pg.wait_for_timeout(1500); still(pg)
    pg.screenshot(path=SHOTS + 'garden-3d.png')
    # the garden switch hides it
    pg.evaluate("() => { const a = window.__hp.app; a.settings.garden = false; a.refreshViews(false); }"); pg.wait_for_timeout(2500)
    check('"Garden and surroundings" off: no garden in 3D', pg.evaluate("() => { let n = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData && o.userData.garden) n++; }); return n; }") == 0)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.garden = true; a.refreshViews(false); }"); pg.wait_for_timeout(1500)
    # versions keep their own garden; undo
    other = pg.evaluate("() => { const a = window.__hp.app; const v = a.project.versions.find(x => x.kind !== 'original' && x.id !== a.shownVersion().id); return v.plan.garden.areas.filter(x => x.kind === 'tiles').length; }")
    mine = pg.evaluate("() => window.__hp.app.shownVersion().plan.garden.areas.filter(x => x.kind === 'tiles').length")
    check('the other version keeps its own garden', mine == other + 1, (mine, other))
    pg.evaluate("() => window.__hp.app.undo()"); pg.wait_for_timeout(300)
    check('undo: the water level back', abs(pg.evaluate("() => window.__hp.app.project.site.water.level") + 1.0) < 1e-6)
    # kept in the house file
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    pr = json.loads(text)['projects'][0]['project']
    check('kept in the house file (site + garden per version)', pr.get('site') and all('garden' in v['plan'] for v in pr['versions']))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # a new house: no plot until the Garden tool makes one around it
    b, pg = open_app(p, phone=True, theme='dark')
    pg.tap('#btn-new'); pg.wait_for_timeout(400); pg.tap('.dialog .btn.primary'); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const a = window.__hp.app; const P = [[0,0],[9,0],[9,7],[0,7]]; for (let i = 0; i < 4; i++) a.addWall(P[i], P[(i+1)%4], 0.3, 'exterior'); }""")
    pg.wait_for_timeout(400)
    check('phone: a new house has no plot', pg.evaluate("() => !window.__hp.app.project.site"))
    pg.evaluate("() => window.__hp.app.setTool('garden')"); pg.wait_for_timeout(600)
    pg.tap('#g-make-plot'); pg.wait_for_timeout(800)
    plot = pg.evaluate("() => window.__hp.app.project.site && window.__hp.app.project.site.plot")
    check('phone: "Plot around the house" makes one 6 m around it', plot and abs(plot[0][0] + 6) < 0.01 and abs(plot[2][0] - 15) < 0.01, plot)
    pg.tap('.g-mode button[data-k="plant"]'); pg.wait_for_timeout(200)
    pg.tap('.toolopts .chip:text-is("Shrub")'); pg.wait_for_timeout(200)
    sp = to_screen(pg, -3, 3)
    pg.mouse.click(*sp); pg.wait_for_timeout(500)
    check('phone: a shrub put in the garden', pg.evaluate("() => window.__hp.app.shownVersion().plan.garden.plants.length") == 1)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'garden-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
