"""Phone (390 × 844, touch), light and dark: the top bar fits, Furnish (catalogue, finger drag, a 3D model, a kitchen
run's units fit), View (note, handover list), walking with the joysticks (the walk bar fits, stops), a viewer copy."""
from common import *
TDRAG = """([a, b, el]) => { const t = document.querySelector(el); const ev = (type, x, y) => t.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  ev('pointerdown', a[0], a[1]); for (let i = 1; i <= 12; i++) ev('pointermove', a[0] + (b[0] - a[0]) * i / 12, a[1] + (b[1] - a[1]) * i / 12); ev('pointerup', b[0], b[1]); }"""
for theme in ('light', 'dark'):
    with sync_playwright() as p:
        b, pg = open_app(p, phone=True, theme=theme)
        open_example(pg)
        over = pg.evaluate("() => { const t = document.querySelector('.topbar'); return [...t.querySelectorAll('button')].filter(b => b.getBoundingClientRect().right > innerWidth + 1).length; }")
        check(f'{theme}: top bar fits', over == 0)
        pg.tap('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1500)
        pg.tap('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(600)
        ids0 = {x['id'] for x in pg.evaluate(ITEMS)}
        pg.tap('.cat-tabs button:has-text("Bedroom")'); pg.wait_for_timeout(300)
        pg.tap('.cat-card:has-text("Double bed")'); pg.wait_for_timeout(1000)
        it = [x for x in pg.evaluate(ITEMS) if x['id'] not in ids0][0]
        check(f'{theme}: bed added, details sheet open', it['type'] == 'bed2' and pg.evaluate("() => window.__hp.app.inspOpen"))
        pg.screenshot(path=SHOTS + f'phone-{theme}-added.png')
        pg.evaluate("() => window.__hp.app.toggleInspector(false)"); pg.wait_for_timeout(400)
        a = to_screen(pg, it['x'], it['y']); bb = to_screen(pg, it['x'] - 1.0, it['y'])
        pg.evaluate(TDRAG, [a, bb, '.plan-svg']); pg.wait_for_timeout(500)
        it2 = next(x for x in pg.evaluate(ITEMS) if x['id'] == it['id'])
        check(f'{theme}: finger drag moves the bed (and keeps its size)', it2['x'] < it['x'] - 0.5 and near(it2['w'], 1.8), it2)
        # a 3D model from the library, and a kitchen run whose units fit the details sheet
        pg.tap('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(600)
        ids0 = {x['id'] for x in pg.evaluate(ITEMS)}
        pg.fill('.cat-body input[type=search]', 'armchair'); pg.wait_for_timeout(400)
        pg.wait_for_function("() => document.querySelectorAll('.model-card img').length >= 1", timeout=30000)
        pg.screenshot(path=SHOTS + f'phone-{theme}-catalogue.png')
        pg.tap('.model-card >> nth=0'); pg.wait_for_timeout(1000)
        check(f'{theme}: 3D model added by tap', pg.evaluate(ITEMS)[-1]['type'] == 'model')
        pg.evaluate("() => window.__hp.app.toggleInspector(false)"); pg.wait_for_timeout(400)
        pg.tap('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(600)
        ids0 = {x['id'] for x in pg.evaluate(ITEMS)}
        pg.fill('.cat-body input[type=search]', 'kitchen run'); pg.wait_for_timeout(300)
        pg.tap('.cat-card >> nth=0'); pg.wait_for_timeout(1000)
        fit = pg.evaluate("() => [...document.querySelectorAll('.run-row')].every(r => r.scrollWidth <= r.clientWidth + 1 && r.getBoundingClientRect().right <= innerWidth + 1)")
        check(f'{theme}: kitchen units fit the sheet', fit and len(pg.query_selector_all('.run-row')) >= 5)
        pg.screenshot(path=SHOTS + f'phone-{theme}-kitchen.png')
        pg.evaluate("() => window.__hp.app.toggleInspector(false)"); pg.wait_for_timeout(400)
        pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(1200)
        pg.tap('#toolrail button[data-tool="note"]'); pg.wait_for_timeout(300)
        pg.evaluate("() => window.__hp.app.panes[0].view.fit(36, false)"); pg.wait_for_timeout(400)   # (adding the run zoomed in on it – task 0020)
        pt = room_screen(pg, 'Keuken', 0.4, 0.5); pg.touchscreen.tap(pt[0], pt[1]); pg.wait_for_timeout(800)
        check(f'{theme}: note by tap', pg.evaluate("() => window.__hp.app.project.notes.length") == 1)
        pg.evaluate("() => window.__hp.app.toggleInspector(false)"); pg.wait_for_timeout(300)
        pg.tap('#toolrail button[data-tool="handover"]'); pg.wait_for_timeout(600)
        check(f'{theme}: handover list opens', pg.is_visible('.snag-body'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.tap('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
        check(f'{theme}: two joysticks', len(pg.query_selector_all('.joy')) == 2)
        j = pg.evaluate("() => { const r = document.querySelector('.joy-move').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        s0 = pg.evaluate("() => window.__hp.app.walker.state()")
        pg.evaluate("""(j) => { const t = document.querySelector('.joy-move'); const ev = (type, x, y) => t.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, buttons: 1 })); ev('pointerdown', j[0], j[1]); ev('pointermove', j[0], j[1] - 40); }""", j)
        pg.evaluate("() => { const w = window.__hp.app.walker; for (let i = 0; i < 40; i++) w.tick(0.05); }")
        pg.evaluate("""(j) => document.querySelector('.joy-move').dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', clientX: j[0], clientY: j[1], bubbles: true }))""", j)
        s1 = pg.evaluate("() => window.__hp.app.walker.state()")
        check(f'{theme}: the stick walks', s1['y'] < s0['y'] - 1.5, (s0, s1))
        over = pg.evaluate("() => { const b = document.querySelector('.walkbar'); return b ? b.getBoundingClientRect().right - innerWidth : 99; }")
        check(f'{theme}: the walk bar fits, with stops and recording', over <= 1 and pg.is_visible('#btn-stop-here'), over)
        pg.screenshot(path=SHOTS + f'phone-{theme}-walk.png')
        if theme == 'light':
            # a viewer copy on the phone: View only, Send notes back in the top bar
            pg.evaluate("async () => { const a = window.__hp.app; a.stopWalk(); const d = await a.buildViewerData(a.project, { from: 'Alex', version: a.project.activeVersionId, layout: a.project.furniture.activeLayoutId, notes: true }); await a.openViewerData(d); }"); pg.wait_for_timeout(2500)
            over = pg.evaluate("() => { const t = document.querySelector('.topbar'); return [...t.querySelectorAll('button')].filter(b => b.offsetParent && b.getBoundingClientRect().right > innerWidth + 1).length; }")
            check('viewer copy on a phone: View only, top bar fits', pg.evaluate("() => [window.__hp.app.mode, !!window.__hp.app.project.viewer]") == ['view', True] and over == 0 and pg.is_visible('#btn-share'))
            pg.screenshot(path=SHOTS + 'phone-viewer.png')
        check(f'{theme}: no page errors', not pg.errors, pg.errors)
        b.close()
sys.exit(summary())
