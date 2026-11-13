"""The low brick wall and the parking place (27 Oct, evening): the wall is brick with a course of bricks on edge on
top (rollaag, no dark cap) and can go round a corner in a curve (radius on its centre line, editable); in the example's
plans the drive becomes a parking place of 50 × 50 cm tiles; garden parts keep the original's ids (Changes lists only
what changed). PC and phone. (The owner's street corner, his parking and the upgrade of his older files:
house/tests/test_garden_wall_own.py.)"""
from common import *

GARDEN = "() => { const g = window.__hp.app.shownVersion().plan.garden; return { areas: g.areas.map(a => ({ id: a.id, kind: a.kind, name: a.name, size: a.size, poly: a.poly })), lines: g.lines.map(l => ({ id: l.id, kind: l.kind, r: l.r, n: l.pts.length })) }; }"
MATS = "() => { const out = {}; window.__hp.app.panes[0].view.scene.traverse(o => { if (o.isMesh && o.userData && o.userData.gline) { const k = (o.material.map && o.material.map.image ? o.material.map.image.width + 'x' + o.material.map.image.height : 'plain') + ':' + o.material.color.getHexString(); out[k] = (out[k] || 0) + 1; } }); return out; }"

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    g = pg.evaluate(GARDEN)
    park = next((a for a in g['areas'] if a['name'] == 'Parking'), None)
    check('the plans have a parking place of 50 × 50 cm tiles', park and park['kind'] == 'tiles' and park['size'] == [0.5, 0.5], park)
    check('no separate drive or gravel path any more in the plans', not any(a['kind'] in ('pavers', 'gravel') for a in g['areas']), [a['kind'] for a in g['areas']])
    orig = pg.evaluate("() => { const a = window.__hp.app; const o = a.project.versions.find(v => v.kind === 'original').plan.garden; return { ids: [...o.areas, ...o.lines].map(x => x.id) }; }")
    shared = [x['id'] for x in g['areas'] + g['lines'] if x['id'] in orig['ids']]
    check('the plans share the ids of the delivered garden (walls, hedge, path, the drive that became the parking)', len(shared) == by_house(pg, 5, 7), len(shared))
    pg.click('#display-toggle button[data-mode="diff"]'); pg.wait_for_timeout(700)
    ch = pg.evaluate("() => { const e = document.querySelector('.ch-garden'); return e ? e.textContent : ''; }")
    check('Changes: the parking is a change, the walls are not listed as new', 'Parking' in ch and 'New: Low brick wall' not in ch, ch[:300])
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(500)
    # a low wall drawn round a corner (in a free part of the garden), then rounded in its details
    W = by_house(pg, [(-2.8, 2.5), (-2.8, 6.5), (-0.6, 6.5)], [(-5, 8), (-5, 11), (-2, 11)])
    pg.click('#toolrail button[data-tool="garden"]'); pg.wait_for_timeout(800)
    pg.click('.g-mode button[data-k="line"]'); pg.wait_for_timeout(150)
    pg.click('.toolopts .chip:text-is("Low brick wall")'); pg.wait_for_timeout(150)
    n0 = len(g['lines'])
    for xy in W + [W[-1]]:
        pg.mouse.click(*to_screen(pg, *xy)); pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
    lid = pg.evaluate("(n0) => { const L = window.__hp.app.shownVersion().plan.garden.lines; return L.length === n0 + 1 && L[L.length - 1].kind === 'wall' && L[L.length - 1].pts.length === 3 ? L[L.length - 1].id : null; }", n0)
    check('a low wall drawn round a corner (three points)', lid, pg.evaluate(GARDEN)['lines'])
    R = "(id) => window.__hp.app.shownVersion().plan.garden.lines.find(l => l.id === id).r"
    pg.click('#toolrail button[data-tool="select"]'); pg.wait_for_timeout(300)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'gline', id })", lid); pg.wait_for_timeout(400)
    check('the wall details offer the corner radius (0: a sharp corner)', pg.is_visible('#f-gline-r') and pg.input_value('#f-gline-r') == '0')
    pg.fill('#f-gline-r', '1500'); pg.press('#f-gline-r', 'Enter'); pg.wait_for_timeout(500)
    check('a radius can be typed (1500 mm)', abs((pg.evaluate(R, lid) or 0) - 1.5) < 1e-6, pg.evaluate(R, lid))
    curve = pg.evaluate("(id) => window.__hp.gLinePath(window.__hp.app.shownVersion().plan.garden.lines.find(l => l.id === id)).length", lid)
    check('2D: the curve is drawn with many points', curve > 10, curve)
    pg.fill('#f-gline-r', '2500'); pg.press('#f-gline-r', 'Enter'); pg.wait_for_timeout(500)
    r2 = pg.evaluate(R, lid)
    check('another radius (2500 mm)', abs(r2 - 2.5) < 1e-6, r2)
    pg.fill('#f-gline-r', '0'); pg.press('#f-gline-r', 'Enter'); pg.wait_for_timeout(500)
    check('radius 0: a sharp corner again', pg.evaluate(R, lid) is None)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    check('undo brings the 1.5 m radius back', abs((pg.evaluate(R, lid) or 0) - 1.5) < 1e-6)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # 3D: brick with bricks on edge on top, no dark cap
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3500)
    m = pg.evaluate(MATS)
    check('3D: the low walls are brick plus a course of bricks on edge (256×48 texture), no plain dark cap', any(k.startswith('256x48') for k in m) and not any(k.startswith('plain:5c6367') for k in m if True), m)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    pg.evaluate("() => { const a = window.__hp.app; const l = a.shownVersion().plan.garden.areas.find(x => x.name === 'Parking'); a.select({ type: 'garea', id: l.id }); a.toggleInspector && a.toggleInspector(true); }"); pg.wait_for_timeout(700)
    check('phone: the parking place shows 50 × 50 tiles in its details', pg.is_visible('.g-tile-size button[aria-pressed="true"]') and '50' in pg.inner_text('.g-tile-size button[aria-pressed="true"]'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'garden-parking-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
