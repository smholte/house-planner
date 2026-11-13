"""Fifth round (29 Oct, evening): garden names that don't fit their area are left out and no two names lie over each
other; while walking with the view following the mouse a small circle shows the middle of the view. PC and phone,
light and dark. (The owner's front hedge, the paths to his gate and parking and the upgrade of his older copies:
house/tests/test_round5_own.py.)"""
from common import *

def labels_overlap(pg):
    return pg.evaluate("""() => { const R = [...document.querySelectorAll('text.g-label')].map(t => [t.textContent, t.getBoundingClientRect()]);
      const out = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push([R[i][0], R[j][0]]); }
      return { n: R.length, names: R.map(r => r[0]), overlaps: out }; }""")

with sync_playwright() as p:
    # ───────── PC, light ─────────
    b, pg = open_app(p)
    open_example(pg)
    # 2D: the garden's names not over each other (close up and zoomed out)
    C = by_house(pg, [4.5, 13.5], [7.0, 14.6])
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    pg.evaluate("() => window.__hp.app.setScope('storey', [...window.__hp.app.project.storeys].sort((x, y) => x.level - y.level)[0].id)"); pg.wait_for_timeout(1200)
    pg.evaluate("(c) => window.__hp.app.panes[0].view.setViewState({ kind: '2d', c, s: 55 })", C); pg.wait_for_timeout(800)
    lb = labels_overlap(pg)
    check('2D: the garden\'s areas are named, and no two names lie over each other', lb['n'] >= 2 and not lb['overlaps'], lb)
    pg.evaluate("(c) => window.__hp.app.panes[0].view.setViewState({ kind: '2d', c, s: 30 })", C); pg.wait_for_timeout(800)
    lb2 = labels_overlap(pg)
    check('2D, zoomed out: no names over each other', not lb2['overlaps'], lb2)
    pg.evaluate("(c) => window.__hp.app.panes[0].view.setViewState({ kind: '2d', c, s: 55 })", C); pg.wait_for_timeout(800)
    pg.screenshot(path=SHOTS + 'r5-front-2d.png')
    # walking with the view following the mouse: a small circle in the middle
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000); still(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    CROSS = """() => { const c = document.querySelector('.walk-cross'); if (!c) return null; const r = c.getBoundingClientRect(), cs = getComputedStyle(c), host = window.__hp.app.panes[0].view.host.getBoundingClientRect();
      return { shown: !c.hidden && cs.display !== 'none', w: r.width, h: r.height, round: cs.borderRadius, dx: (r.left + r.right) / 2 - (host.left + host.right) / 2, dy: (r.top + r.bottom) / 2 - (host.top + host.bottom) / 2 }; }"""
    c0 = pg.evaluate(CROSS)
    check('walking: no circle while the mouse is free', c0 is not None and not c0['shown'], c0)
    pg.mouse.move(500, 400)
    pg.keyboard.press('l'); pg.wait_for_timeout(700)
    real = pg.evaluate("() => !!document.pointerLockElement")
    if not real:
        # (the test browser may refuse to hold the pointer: tell the walker it is held, as the browser would)
        pg.evaluate("""() => { const el = window.__hp.app.panes[0].view.renderer.domElement; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el }); document.dispatchEvent(new Event('pointerlockchange')); }""")
        pg.wait_for_timeout(300)
    c1 = pg.evaluate(CROSS)
    check('walking, mouse look (L): a small circle in the middle of the view', c1 and c1['shown'] and 8 <= c1['w'] <= 16 and abs(c1['w'] - c1['h']) < 0.5 and c1['round'] == '50%' and abs(c1['dx']) < 1.5 and abs(c1['dy']) < 1.5, [real, c1])
    if real:
        pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    else:
        pg.evaluate("() => { delete document.pointerLockElement; document.dispatchEvent(new Event('pointerlockchange')); }"); pg.wait_for_timeout(300)
    c2 = pg.evaluate(CROSS)
    check('… and gone when the mouse is let go', c2 and not c2['shown'], c2)
    # (a picture of it: the test browser can't take one while it really holds the pointer)
    pg.evaluate("""() => { const el = window.__hp.app.panes[0].view.renderer.domElement; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el }); document.dispatchEvent(new Event('pointerlockchange')); }""")
    still(pg)
    pg.screenshot(path=SHOTS + 'r5-walk-circle.png')
    pg.evaluate("() => { delete document.pointerLockElement; document.dispatchEvent(new Event('pointerlockchange')); }"); pg.wait_for_timeout(300)
    # holding the right button: the circle too, without the hint
    pg.evaluate("""() => { const w = window.__hp.app.walker, el = window.__hp.app.panes[0].view.renderer.domElement; w.lockForDrag = true; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el }); document.dispatchEvent(new Event('pointerlockchange')); }""")
    pg.wait_for_timeout(300)
    c3 = pg.evaluate(CROSS)
    hint = pg.evaluate("() => { const e = document.querySelector('.walk-lock-hint'); return !!e && !e.hidden; }")
    check('holding the right mouse button: the circle as well (without the Esc hint)', c3 and c3['shown'] and not hint, [c3, hint])
    pg.evaluate("() => { const w = window.__hp.app.walker; w.lockForDrag = false; delete document.pointerLockElement; document.dispatchEvent(new Event('pointerlockchange')); }")
    # path walk has it too
    pg.click('.walkbar .seg button:has-text("Path")'); pg.wait_for_timeout(2500)
    pg.evaluate("""() => { const el = window.__hp.app.panes[0].view.renderer.domElement; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el }); document.dispatchEvent(new Event('pointerlockchange')); }""")
    pg.wait_for_timeout(300)
    c4 = pg.evaluate(CROSS)
    check('path walk: the circle while the view follows the mouse', c4 and c4['shown'], c4)
    pg.evaluate("() => { delete document.pointerLockElement; document.dispatchEvent(new Event('pointerlockchange')); }")
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(800)
    C = by_house(pg, [4.5, 13.5], [6.5, 14.6])
    pg.evaluate("(c) => window.__hp.app.panes[0].view.setViewState({ kind: '2d', c, s: 30 })", C); pg.wait_for_timeout(800)
    lb = labels_overlap(pg)
    check('phone: no names over each other', not lb['overlaps'], lb)
    pg.screenshot(path=SHOTS + 'r5-phone-dark.png')
    pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.tap('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    check('phone: walking has the sticks and no circle', pg.evaluate("() => !!document.querySelector('.joy-move') && !document.querySelector('.walk-cross')"))
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
