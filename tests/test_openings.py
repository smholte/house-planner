"""Door and window types: hinged, double, sliding, pocket, glass and folding doors; fixed, turn, tilt-turn, sliding
and top-hung windows. Picked in the tool bar or in the details, drawn in 2D and 3D; a sliding door slides open and
shut when tapped; old doors keep their look; kept in the house file."""
from common import *

OPS = "() => window.__hp.app.shownVersion().plan.openings.map(o => ({ id: o.id, kind: o.kind, style: o.style || null, leaves: o.leaves || null, w: o.w }))"

with sync_playwright() as p:
    b, pg = open_app(p)
    pg.click('#btn-new'); pg.wait_for_timeout(400); pg.click('.dialog .btn.primary'); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const a = window.__hp.app; const P = [[0,0],[12,0],[12,5],[0,5]]; for (let i = 0; i < 4; i++) a.addWall(P[i], P[(i+1)%4], 0.25, 'exterior'); a.addWall([0,2.5],[12,2.5],0.1,'interior'); }""")
    pg.wait_for_timeout(400)
    # doors from the tool bar
    pg.click('#toolrail button[data-tool="door"]'); pg.wait_for_timeout(300)
    for i, (lab, style) in enumerate([('Sliding', 'sliding'), ('Pocket', 'pocket'), ('Glass', 'glass'), ('Folding', 'folding'), ('Double', 'double')]):
        pg.click(f'.toolopts .chip:text-is("{lab}")'); pg.wait_for_timeout(150)
        pg.click('#toolrail button[data-tool="door"]') if not pg.evaluate("() => window.__hp.app.tool === 'door'") else None
        pg.mouse.click(*to_screen(pg, 1.5 + i * 2.1, 2.5)); pg.wait_for_timeout(400)
        pg.click('#toolrail button[data-tool="door"]'); pg.wait_for_timeout(200)
    O = pg.evaluate(OPS)
    check('five doors, each of its type', [o['style'] for o in O] == ['sliding', 'pocket', 'glass', 'folding', 'double'] and O[4]['leaves'] == 2, O)
    # windows: type in the details
    pg.click('#toolrail button[data-tool="window"]'); pg.wait_for_timeout(300)
    pg.click('.toolopts .chip:text-is("Tilt-turn")'); pg.wait_for_timeout(150)
    pg.mouse.click(*to_screen(pg, 3.0, 0)); pg.wait_for_timeout(500)
    win = pg.evaluate(OPS)[-1]
    check('a tilt-turn window from the tool bar', win['kind'] == 'window' and win['style'] == 'tilt', win)
    pg.click('.win-style button[data-k="sliding"]'); pg.wait_for_timeout(400)
    check('changed to sliding in its details', pg.evaluate(OPS)[-1]['style'] == 'sliding')
    pg.click('.win-style button[data-k="turn"]'); pg.wait_for_timeout(400)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # a door changed in its details
    pg.evaluate("(id) => window.__hp.app.select({ type: 'opening', id })", O[0]['id']); pg.wait_for_timeout(400)
    pg.click('.door-style button[data-k="hinged"]'); pg.wait_for_timeout(300)
    pg.click('.door-style button[data-k="sliding"]'); pg.wait_for_timeout(300)
    check('door type in the details', pg.evaluate(OPS)[0]['style'] == 'sliding')
    pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(300)
    # 2D: the sliding door's leaf moves when it is closed
    sym_open = pg.evaluate("(id) => document.querySelector(`.op[data-op=\"${id}\"] .op-sym`).getAttribute('d')", O[0]['id'])
    pg.evaluate("(id) => window.__hp.app.setDoorClosed(id, true)", O[0]['id']); pg.wait_for_timeout(500)
    sym_closed = pg.evaluate("(id) => document.querySelector(`.op[data-op=\"${id}\"] .op-sym`).getAttribute('d')", O[0]['id'])
    check('2D: a sliding door drawn open (beside the opening) and closed (across it)', sym_open != sym_closed and sym_open and sym_closed)
    check('2D: the window shows its sash', pg.evaluate("(id) => !!document.querySelector(`.op[data-op=\"${id}\"] .op-swing`)", win['id']))
    pg.screenshot(path=SHOTS + 'openings-2d.png')
    # 3D
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500); still(pg)
    info = pg.evaluate("(id) => { const v = window.__hp.app.panes[0].view; const e = (v.doorMap.get(id) || [])[0]; return e ? { slide: e.slide, x: e.grp.position.x, full: e.full } : null; }", O[0]['id'])
    check('3D: the sliding door is a slide, closed now', info and info['slide'] and abs(info['x']) < 0.01 and abs(info['full']) > 0.5, info)
    pg.evaluate("(id) => window.__hp.app.setDoorClosed(id, false)", O[0]['id']); pg.wait_for_timeout(2500); still(pg)
    x = pg.evaluate("(id) => window.__hp.app.panes[0].view.doorMap.get(id)[0].grp.position.x", O[0]['id'])
    check('3D: tapped open, it slides aside', abs(x - info['full']) < 0.02, (x, info['full']))
    frames = pg.evaluate("() => { let n = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === 'f4f3ef') n++; }); return n; }")
    check('3D: window frames', frames >= 4, frames)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.cut = true; a.refreshViews(false); }"); pg.wait_for_timeout(2000); still(pg)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.camera.position.set(6, 6.5, 9.5); v.controls.target.set(6, 0.4, 2.5); v.controls.update(); v.needs = true; }")
    pg.wait_for_timeout(1500); still(pg)
    pg.screenshot(path=SHOTS + 'openings-3d.png')
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    styles = [o.get('style') for o in json.loads(text)['projects'][0]['project']['versions'][0]['plan']['openings']]
    check('kept in the house file', styles.count('sliding') == 1 and 'turn' in styles, styles)
    check('no page errors', not pg.errors, pg.errors)
    b.close()
    # the example: doors of the builder keep their look (hinged, or double where the model has two leaves)
    b, pg = open_app(p)
    open_example(pg)
    st = pg.evaluate("() => { const pl = window.__hp.app.project.versions.find(v => v.kind === 'original').plan; return [pl.openings.filter(o => o.kind === 'door' && !o.style).length, pl.openings.filter(o => o.style).length]; }")
    check('the example: the delivered doors have no type set (they look as before)', st[0] > 5 and st[1] == 0, st)
    check('no page errors (example)', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
