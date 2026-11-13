"""Furnish mode: catalogue, snapping against walls and into corners, turning, sizing, undo, sets, layouts,
shopping list, Check space, side by side, 3D."""
from common import *

def add(pg, search):
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(400)
    pg.fill('.cat-body input[type=search]', search); pg.wait_for_timeout(200)
    pg.click('.cat-card >> nth=0'); pg.wait_for_timeout(600)
    return pg.evaluate(ITEMS)[-1]
def move(pg, it, x, y):
    drag(pg, to_screen(pg, it['x'], it['y']), to_screen(pg, x, y))
    return [f for f in pg.evaluate(ITEMS) if f['id'] == it['id']][0]

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    without_renato(pg)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1200)
    check('furnish mode on', pg.evaluate("() => window.__hp.app.mode") == 'furnish')
    check('catalogue has at least 40 pieces', pg.evaluate("() => window.__hp.FURN_TYPES.length") >= 40)
    # (from a known start: the ground floor of the layout empty – the snapping below is against walls and the new pieces)
    pg.evaluate("() => { const a = window.__hp.app, st = a.view.storeyId; a.furnMutate(l => { l.items = l.items.filter(i => i.storey !== st); }); }"); pg.wait_for_timeout(500)
    R = rooms(pg); wk, km, kk = R['Woonkamer'], R[by_house(pg, 'Werkkamer', 'Kamer')], R['Keuken']
    s = add(pg, 'sofa, 3')
    s = move(pg, s, wk[0] + 1.7, wk[1] + 0.47)
    check('sofa snaps with its back to the top wall', near(s['y'], wk[1] + 0.46) and s['rot'] == 0, s)
    s = move(pg, s, wk[0] + 1.0, wk[3] - 0.5)
    check('sofa turns its back to the bottom wall', near(s['y'], wk[3] - 0.46) and s['rot'] == 180, s)
    w = add(pg, 'wardrobe')
    w = move(pg, w, km[0] + 1.04, km[1] + 0.33)
    check('wardrobe snaps into the corner', near(w['x'], km[0] + 1.0) and near(w['y'], km[1] + 0.3), w)
    k1 = add(pg, 'base unit'); k1 = move(pg, k1, kk[2] - 0.32, kk[1] + 1.5)
    k2 = add(pg, 'base unit'); k2 = move(pg, k2, kk[2] - 0.32, kk[1] + 2.13)
    check('kitchen units line up against the wall and each other', near(k1['x'], kk[2] - 0.3) and near(k2['x'], kk[2] - 0.3) and near(k2['y'], k1['y'] + 0.6) and k1['rot'] == 90 and k2['rot'] == 90, (k1, k2))
    pg.click('.modebar .chip:has-text("Snap")'); pg.wait_for_timeout(200)
    s = move(pg, s, wk[0] + 1.2, wk[3] - 0.9)
    check('snap off: no sticking', near(s['y'], wk[3] - 0.9, 0.03), s)
    pg.click('.modebar .chip:has-text("Snap")'); pg.wait_for_timeout(200)
    pg.click('.rotseg button:has-text("15°")'); pg.wait_for_timeout(200)
    pg.mouse.click(*to_screen(pg, s['x'], s['y'])); pg.wait_for_timeout(300)
    pg.keyboard.press('r'); pg.wait_for_timeout(300)
    check('R turns by 15°', [f for f in pg.evaluate(ITEMS) if f['id'] == s['id']][0]['rot'] == 195)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    check('undo turns it back', [f for f in pg.evaluate(ITEMS) if f['id'] == s['id']][0]['rot'] == 180)
    pg.click('.rotseg button:has-text("90°")'); pg.wait_for_timeout(200)
    # size with the handle: the back edge stays
    hd = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; const en = v.furnEntry(); const sel = window.__hp.app.selection; const f = en.furniture.find(x => x.id === sel.ids[0]); const r = v.svg.getBoundingClientRect(); return v.furnHandles(en, f).map(h => [h.kind, r.left + h.p[0], r.top + h.p[1]]); }")
    sd = [h for h in hd if h[0] == 'size-d'][0]
    before = [f for f in pg.evaluate(ITEMS) if f['id'] == s['id']][0]
    drag(pg, [sd[1], sd[2]], [sd[1], sd[2] - 25])
    after = [f for f in pg.evaluate(ITEMS) if f['id'] == s['id']][0]
    check('depth handle changes the depth', abs(after['d'] - before['d']) > 0.1, (before, after))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    # set: three pieces, a new layout, place the set there
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    for it in [x for x in pg.evaluate(ITEMS) if x['id'] in (s['id'], w['id'], k1['id'])]:
        show_on_plan(pg, it['x'], it['y'], bottom=320)   # (clear of the tool bar and of the small 3D view at the bottom)
        pg.keyboard.down('Shift'); pg.mouse.click(*to_screen(pg, it['x'], it['y'])); pg.keyboard.up('Shift'); pg.wait_for_timeout(250)
    check('shift-click selects several', len(pg.evaluate("() => window.__hp.app.selection.ids")) == 3)
    pg.click('.inspector button:has-text("Save as set")'); pg.wait_for_timeout(400)
    pg.fill('#dlg-input', 'Seating area A'); pg.click('.dialog .btn.primary'); pg.wait_for_timeout(500)
    check('set saved', pg.evaluate("() => window.__hp.app.project.furniture.sets.map(s => [s.name, s.items.length])") == [['Seating area A', 3]])
    pg.click('.layout-pill'); pg.wait_for_timeout(300)
    pg.click('.menu .mi:has-text("New empty layout")'); pg.wait_for_timeout(300)
    pg.fill('#dlg-input', 'Layout B'); pg.click('.dialog .btn.primary'); pg.wait_for_timeout(500)
    check('new empty layout active', pg.evaluate("() => [window.__hp.app.activeLayout().name, window.__hp.app.activeLayout().items.length]") == ['Layout B', 0])
    pg.click('#toolrail button[data-tool="sets"]'); pg.wait_for_timeout(400)
    pg.click('.set-row .btn.primary'); pg.wait_for_timeout(600)
    check('set placed in the other layout', len(pg.evaluate(ITEMS)) == 3)
    # shopping list
    pg.mouse.click(*to_screen(pg, pg.evaluate(ITEMS)[0]['x'], pg.evaluate(ITEMS)[0]['y'])); pg.wait_for_timeout(500)
    pg.fill('#f-shop-price', '899'); pg.keyboard.press('Tab'); pg.wait_for_timeout(300)
    pg.click('#toolrail button[data-tool="shop"]'); pg.wait_for_timeout(500)
    pg.screenshot(path=SHOTS + 'furn-shopping.png')
    check('shopping list total', '899' in pg.inner_text('.shop-sum'))
    pg.click('.dialog .btn.primary:has-text("Done")'); pg.wait_for_timeout(400)
    # check space
    pg.click('#toolrail button[data-tool="space"]'); pg.wait_for_timeout(1500)
    res = pg.evaluate("() => window.__hp.app.spaceCheck.results.map(r => r.kind)")
    check('check space finds something', len(res) > 0, res)
    pg.screenshot(path=SHOTS + 'furn-space.png')
    # side by side: two layouts and the price difference
    pg.click('#btn-compare'); pg.wait_for_timeout(1500)
    check('compare bar with price difference', pg.query_selector('.fcbar') is not None and '+' in pg.inner_text('.fc-diff'))
    pg.screenshot(path=SHOTS + 'furn-side.png')
    pg.click('#btn-compare'); pg.wait_for_timeout(800)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)
    check('furniture in 3D', pg.evaluate("() => window.__hp.app.panes[0].view.furnPick.length") == 3)
    pg.screenshot(path=SHOTS + 'furn-3d.png')
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
