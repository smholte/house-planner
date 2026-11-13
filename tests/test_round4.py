"""Fourth round (29 Oct): a black metal gate in the garden (2D: posts, leaf and swing; its details: width, where it is, which way it
opens; 3D: 1.8 m to its spear tips); hedges grow leaves. PC and phone, light and dark. (The owner's exported house, his
front path, hedge and gate, the window frames of his builder's model, the brick where his façade stands on the flat
roof and the upgrade of his older copies:
house/tests/test_round4_own.py.)"""
from common import *
import math

with sync_playwright() as p:
    # ───────── PC, light ─────────
    b, pg = open_app(p)
    open_example(pg)
    # 2D: the gate with its posts and swing; its details
    pg.evaluate("() => window.__hp.app.setScope('storey', [...window.__hp.app.project.storeys].sort((x, y) => x.level - y.level)[0].id)"); pg.wait_for_timeout(1500)
    g2 = pg.evaluate("() => ({ gate: document.querySelectorAll('.garden .g-gate').length, leaf: document.querySelectorAll('.garden .g-gate-leaf').length, swing: document.querySelectorAll('.garden .g-gate-swing').length, rails: document.querySelectorAll('.garden .g-rail').length })")
    check('2D: the gate, its railing, the leaf and its swing', g2['gate'] == 1 and g2['leaf'] == 1 and g2['swing'] == 1 and g2['rails'] >= 1, g2)
    gid = pg.evaluate("() => window.__hp.app.shownVersion().plan.garden.lines.find(l => l.kind === 'gate').id")
    pg.evaluate("(id) => window.__hp.app.select({ type: 'gline', id })", gid); pg.wait_for_timeout(700)
    check('the gate\'s details: width, where it is, which way it opens', pg.is_visible('#f-gate-w') and pg.is_visible('.g-gate-at') and pg.is_visible('#g-gate-flip'))
    pg.fill('#f-gate-w', '1200'); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    gw = pg.evaluate("(id) => { const l = window.__hp.app.shownVersion().plan.garden.lines.find(x => x.id === id); return [l.gate.w, window.__hp.gateLayout(l).gw]; }", gid)
    check('a wider gate leaf', abs(gw[0] - 1.2) < 1e-6 and abs(gw[1] - 1.2) < 1e-6, gw)
    pg.click('#g-gate-flip'); pg.wait_for_timeout(600)
    sd = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.garden.lines.find(x => x.id === id).gate.side", gid)
    check('it can open to the other side', sd == -1, sd)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400); pg.keyboard.press('Control+z'); pg.wait_for_timeout(600)
    g0 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.garden.lines.find(x => x.id === id).gate", gid)
    check('undo puts the gate back', abs(g0['w'] - 1.0) < 1e-6 and g0['side'] == 1, g0)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.screenshot(path=SHOTS + 'r4-front-2d.png')

    # 3D: gate, hedge, the roof junction, the windows
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500)
    pg.evaluate("() => window.__hp.app.setScope('house')"); pg.wait_for_timeout(3500)
    g3 = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view, THREE = window.__hp.THREE; let gate = null, hedgeCards = 0;
      v.group.traverse(o => { if (o.isMesh && o.userData.gate) { gate = gate || new THREE.Box3(); gate.expandByObject(o); } if (o.isMesh && o.userData.veg && o.userData.gline && o.material.alphaTest > 0) hedgeCards += o.geometry.index.count / 6; });
      return { gate: gate && [gate.min.y, gate.max.y, gate.max.x - gate.min.x, gate.max.z - gate.min.z].map(x => +x.toFixed(3)), hedgeCards }; }""")
    check('3D: the gate stands 1.8 m to its spear tips (since the evening of 29 Oct)', g3['gate'] and 1.74 < g3['gate'][1] - g3['gate'][0] < 1.86, g3)
    check('3D: the hedges grow leaves', g3['hedgeCards'] > 500, g3)
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.wait_for_timeout(1500)
    n = pg.evaluate("() => document.querySelectorAll('.garden .g-gate-leaf').length")
    check('phone: the gate is drawn in the plan', n == 1, n)
    pg.screenshot(path=SHOTS + 'r4-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
