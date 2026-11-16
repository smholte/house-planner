"""Task 0036 (I26): tiles – choose where they start, warn on slivers. Per tiled wall (and tiled floor) the owner picks
where the tiles start (centre, a corner, centred on a window / door / the bath, a nudge in mm or by dragging the
tiles; rows from the floor, on top of the bath, from a height or whole at the top), sees the cut pieces and the
narrowest cut at each place in mm, gets a warning for a cut under ⅓ tile, and one tap "Best start" picks the start
with the widest smallest cut. The tile count comes from the real grid (whole tiles + cut pieces, + the extra %).
Old houses: no start = centred, whole rows from the floor (as before). PC (light) and phone (dark)."""
from common import *

SELROOM = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); a.select({ type: 'room', id: r.id, storey: r.storey }); }"
ROOM = "(n) => { const a = window.__hp.app; return a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); }"
# the start kept on a wall of the toilet (by letter) and the toilet's floor start
START = "([n, l]) => { const a = window.__hp.app, pl = a.shownVersion().plan, r = (" + ROOM + ")(n); const f = window.__hp.roomFaces(pl, r).find(f => f.letter === l); const w = pl.walls.find(w => w.id === f.wall.id); return JSON.parse(JSON.stringify((w.tileStart || {})[r.id] || null)); }"
FSTART = "(n) => { const r = (" + ROOM + ")(n); return JSON.parse(JSON.stringify(r.floor.start || null)); }"
CARD = "(l) => { const c = document.querySelector(`.wv-card[data-letter=\"${l}\"]`); if (!c) return null; return { tiles: c.querySelectorAll('.wv-tile').length, cut: c.querySelectorAll('.wv-tile.cut').length, sliver: c.querySelectorAll('.wv-tile.sliver').length, warn: [...c.querySelectorAll('.wv-warn')].map(e => e.textContent), note: (c.querySelector('.wv-tilenote-line') || {}).textContent || '', count: (c.querySelector('.wv-count') || {}).textContent || '', labels: [...c.querySelectorAll('.wv-cutt')].map(e => [e.textContent, e.classList.contains('warn')]), box: !!c.querySelector('.ts-box') }; }"


def open_views(pg, room='Toilet'):
    pg.evaluate(SELROOM, room); pg.wait_for_timeout(700)
    pg.locator('#f-wall-views').scroll_into_view_if_needed()
    pg.click('#f-wall-views')
    pg.wait_for_selector('.wv-card .ts-box', timeout=20000)


def close_dialog(pg):
    pg.click('.scrim:last-child .dialog button:has-text("Close")'); pg.wait_for_timeout(500)


def run(p, phone):
    tag = 'phone' if phone else 'pc'
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
    open_example(pg)
    if not phone:
        # ───────── the numbers, checked by hand ─────────
        r = pg.evaluate("""() => { const H = window.__hp, T = { w: .6, h: .6, joint: .003 };
          const cuts = S => H.wallTileCuts(T, H.tileOrigin(T, 1.8, 1.2, S), 1.8, 1.2, true, []).map(c => [c.k, Math.round(c.c * 10000) / 10]);
          return { centre: cuts(null), left: cuts({ x: 'left' }), nudged: cuts({ dx: -0.27 }) }; }""")
        # 1800 = 295.5 + 3 + 600 + 3 + 600 + 3 + 295.5: centred, two cuts of 295.5 mm; 2 rows of 600 + 3 → top row 597 mm
        check('hand-checked: a 1,800 mm wall, 600 mm tiles, 3 mm joints, centred → two cuts of 295.5 mm (top row 597 mm to 1,200)', r['centre'] == [['left', 295.5], ['right', 295.5], ['top', 597.0]], r['centre'])
        # from the left corner: 0, 603, 1206 → the last tile cut to 1800 − 1206 = 594 mm
        check('… from the left corner: a whole tile at the left, 594 mm cut at the right', r['left'] == [['right', 594.0], ['top', 597.0]], r['left'])
        # 270 mm to the left: left piece 295.5 − 270 = 25.5 mm (a sliver), right piece 295.5 + 270 = 565.5 mm
        check('… nudged 270 mm to the left: 25.5 mm at the left, 565.5 mm at the right', r['nudged'][:2] == [['left', 25.5], ['right', 565.5]], r['nudged'])
        f = pg.evaluate("() => window.__hp.tileFall({ w: .3, h: .6, joint: .003 }, 1.33, 1.5)")
        check('the old centred layout is kept (1,330 mm, 300 mm tiles → 209 mm at both ends)', near(f['cut'], .209, .001), f)
    # ───────── the toilet's walls: the cuts, the count, no warnings ─────────
    open_views(pg)
    A = pg.evaluate(CARD, 'A'); B = pg.evaluate(CARD, 'B')
    check(f'{tag}: wall views of the toilet – each tiled wall has “Tiles start across”, a shift, the rows and Best start', A and A['box'] and B['box'] and pg.locator('.wv-card .ts-best').count() >= 4, A)
    check(f'{tag}: … the narrowest cut at each corner in mm above the tiles, the note with the cuts and the count', len(B['labels']) == 2 and 'cut at both ends' in B['note'] and 'whole tiles' in B['count'], B)
    check(f'{tag}: … no sliver in the example’s toilet: no warning', not A['warn'] and not B['warn'] and B['sliver'] == 0, (A['warn'], B['warn']))
    pg.screenshot(path=SHOTS + f'tilestart-{tag}-1.png')
    # ───────── a sliver: shift the tiles of wall B by 200 mm to the left ─────────
    card = pg.locator('.wv-card[data-letter="B"]')
    card.scroll_into_view_if_needed()
    card.locator('.ts-dx').fill('-200'); card.locator('.ts-dx').press('Enter'); pg.wait_for_timeout(600)
    B = pg.evaluate(CARD, 'B')
    check(f'{tag}: shift −200 mm: kept on the wall (dx −0.2)', pg.evaluate(START, ['Toilet', 'B']) == {'dx': -0.2}, pg.evaluate(START, ['Toilet', 'B']))
    check(f'{tag}: … Enter in the field does not press the PDF button', pg.evaluate("() => !window.__hp.app.lastWallViewsPdf") and pg.locator('.wv-card').count() >= 4)
    check(f'{tag}: … a sliver at the left corner (16 mm): a warning line, the piece and its number in the warning colour', any('Left corner 16 mm is a sliver' in w for w in B['warn']) and B['sliver'] > 0 and ['16', True] in B['labels'], B)
    check(f'{tag}: … the warning says what to try', any('try' in w for w in B['warn']), B['warn'])
    pg.screenshot(path=SHOTS + f'tilestart-{tag}-sliver.png')
    # the ◀ ▶ buttons: 10 mm a tap
    card.locator('.ts-step[data-d="10"]').click(); pg.wait_for_timeout(500)
    check(f'{tag}: ▶ moves the tiles 10 mm to the right (−190 mm)', near(pg.evaluate(START, ['Toilet', 'B'])['dx'], -0.19, 1e-6), pg.evaluate(START, ['Toilet', 'B']))
    # Best start: back to centred (the widest smallest cut), nothing kept, no warning
    card.locator('.ts-best').click(); pg.wait_for_timeout(700)
    B = pg.evaluate(CARD, 'B')
    check(f'{tag}: Best start: centred again (nothing kept on the wall), the warning gone', pg.evaluate(START, ['Toilet', 'B']) is None and not B['warn'] and B['sliver'] == 0, (pg.evaluate(START, ['Toilet', 'B']), B))
    # ───────── centre on the door, rows whole at the top ─────────
    card = pg.locator('.wv-card[data-letter="A"]')
    card.scroll_into_view_if_needed()
    opts = card.locator('.ts-x option').all_text_contents()
    check(f'{tag}: wall A (with the door): the choices across', opts[:3] == ['Centre of the wall', 'Left corner', 'Right corner'] and any('door' in o for o in opts), opts)
    door = [o for o in opts if 'door' in o][0]
    card.locator('.ts-x').select_option(label=door); pg.wait_for_timeout(600)
    S = pg.evaluate(START, ['Toilet', 'A'])
    check(f'{tag}: Centre on the door: kept as a line on the door’s centre', S and S['x'] == 'at' and S.get('ref') == 'door' and S['at'] > 0, S)
    card.locator('.ts-y').select_option('top'); pg.wait_for_timeout(600)
    S = pg.evaluate(START, ['Toilet', 'A']); A = pg.evaluate(CARD, 'A')
    check(f'{tag}: rows “whole at the top”: kept, the cut row is now at the floor', S['y'] == 'top' and S['x'] == 'at' and 'at the floor' in A['note'] and 'top row' not in A['note'], (S, A['note']))
    if not phone:
        # drag the tiles of wall C sideways (the drawing is about 100 px a metre here) with the mouse: a live preview, kept when let go
        card = pg.locator('.wv-card[data-letter="C"]')
        card.scroll_into_view_if_needed()
        box = card.locator('.wv-draw svg').bounding_box()
        k = pg.evaluate("() => document.querySelector('.wv-card[data-letter=\"C\"] .wv-draw svg').getScreenCTM().a")
        x0, y0 = box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.6
        pg.mouse.move(x0, y0); pg.mouse.down()
        for i in range(1, 11): pg.mouse.move(x0 + 0.2 * k * i / 10, y0)
        pg.mouse.up(); pg.wait_for_timeout(600)
        S = pg.evaluate(START, ['Toilet', 'C'])
        check('PC: drag the tiles 200 mm to the right in the drawing: kept as a shift of about +200 mm', S and near(S.get('dx', 0), 0.2, 0.012), S)
    close_dialog(pg)
    # ───────── the room's details: count from the grid, the cuts of the open wall, its button ─────────
    st = pg.evaluate("(n) => { const a = window.__hp.app; const s = window.__hp.roomFinishStats(a.shownVersion().plan, (" + ROOM + ")(n), a.currentStorey()); return s.tiles.map(x => ({ n: x.tiles, whole: x.whole, cut: x.cut, area: x.area, w: x.T.w, h: x.T.h, j: x.T.joint })); }", 'Toilet')[0]
    import math
    check(f'{tag}: the tile count is the grid’s whole tiles and cut pieces + 10 %', st['n'] == math.ceil((st['whole'] + st['cut']) * 1.1 - 1e-9) and st['cut'] > 0 and st['whole'] + st['cut'] >= st['area'] / ((st['w'] + st['j']) * (st['h'] + st['j'])), st)
    check(f'{tag}: … room details say so', 'whole and' in pg.inner_text('.fin-totals'), pg.inner_text('.fin-totals'))
    fa = pg.evaluate("(n) => window.__hp.roomFaces(window.__hp.app.shownVersion().plan, (" + ROOM + ")(n))[0].wall.id", 'Toilet')
    pg.evaluate("([n, w]) => { const a = window.__hp.app, r = (" + ROOM + ")(n); a.select({ type: 'room', id: r.id, storey: r.storey, face: w }); }", ['Toilet', fa]); pg.wait_for_timeout(700)
    txt = pg.inner_text('.face-edit .ts-cuts')
    check(f'{tag}: the open wall A: where its tiles start and its cuts', 'Tiles start: chosen' in txt and 'at the floor' in txt, txt)
    pg.locator('#ff-tile-start').scroll_into_view_if_needed(); pg.click('#ff-tile-start')
    pg.wait_for_selector('.wv-card .ts-box', timeout=20000)
    check(f'{tag}: … “Where the tiles start…” opens the wall views', pg.locator('.wv-card[data-letter="A"] .ts-box').count() == 1)
    close_dialog(pg)
    # ───────── a sliver shows in the list of walls ─────────
    pg.evaluate("([n, l]) => { const a = window.__hp.app, rr = (" + ROOM + ")(n), f = window.__hp.roomFaces(a.shownVersion().plan, rr).find(f => f.letter === l); a.mutate(pl => { const w = pl.walls.find(x => x.id === f.wall.id); w.tileStart = { ...(w.tileStart || {}), [rr.id]: { dx: -0.2 } }; }, { keepInspector: true }); }", ['Toilet', 'D'])
    pg.evaluate(SELROOM, 'Toilet'); pg.wait_for_timeout(700)
    marks = pg.evaluate("() => [...document.querySelectorAll('.face-list .face-row')].map(r => [r.querySelector('.face-letter').textContent, !!r.querySelector('.ts-mark')])")
    check(f'{tag}: the list of walls: a warning mark on wall D (a sliver), none on the others', ['D', True] in marks and ['B', False] in marks, marks)
    # ───────── the floor ─────────
    pg.locator('#f-floor-start').scroll_into_view_if_needed()
    check(f'{tag}: tiled floor: its cuts in the floor section', 'whole and' in pg.inner_text('.fs-cuts'), pg.inner_text('.fs-cuts'))
    pg.click('#f-floor-start')
    pg.wait_for_selector('.wv-floor .ts-box', timeout=20000)
    fc = pg.locator('.wv-floor')
    check(f'{tag}: … the floor in the wall views: the tiles, the cut pieces, the count', fc.locator('.wv-tile').count() > 4 and fc.locator('.wv-tile.cut').count() > 0 and 'floor tiles' in fc.locator('.wv-count').inner_text(), fc.locator('.wv-count').inner_text())
    fc.locator('.fs-at').select_option('nw'); pg.wait_for_timeout(600)
    check(f'{tag}: … start in the corner top left: kept on the floor', pg.evaluate(FSTART, 'Toilet') == {'at': 'nw'}, pg.evaluate(FSTART, 'Toilet'))
    doors = [o for o in fc.locator('.fs-at option').all_text_contents() if 'Door line' in o]
    check(f'{tag}: … the door line is a choice', len(doors) >= 1, fc.locator('.fs-at option').all_text_contents())
    fc.locator('.fs-dx').fill('100'); fc.locator('.fs-dx').press('Enter'); pg.wait_for_timeout(600)
    check(f'{tag}: … shifted 100 mm to the right: a sliver warning', pg.evaluate(FSTART, 'Toilet') == {'at': 'nw', 'dx': 0.1} and fc.locator('.wv-warn').count() > 0, (pg.evaluate(FSTART, 'Toilet'), fc.locator('.wv-warn').all_text_contents()))
    pg.screenshot(path=SHOTS + f'tilestart-{tag}-floor.png')
    fc.locator('.ts-best').click(); pg.wait_for_timeout(600)
    check(f'{tag}: … Best start: no sliver', fc.locator('.wv-warn').count() == 0, (pg.evaluate(FSTART, 'Toilet'), fc.locator('.wv-warn').all_text_contents()))
    if phone:
        fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog'), r = d.getBoundingClientRect(); const bs = [...d.querySelectorAll('.ts-step, .ts-best')].map(b => b.getBoundingClientRect().height); return [r.left >= 0 && r.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth + 1, Math.min(...bs)]; }")
        check('phone: the wall views fit 390 px, no sideways scrolling; the ◀ ▶ and Best start buttons are big enough to tap', fit[0] and fit[1] and fit[2] >= 32, fit)
    close_dialog(pg)
    # ───────── quantities and old data ─────────
    q = pg.evaluate("() => { const a = window.__hp.app; const Q = window.__hp.houseQuantities(a.project, a.shownVersion().plan); return Q.materials.filter(m => m.group === 'floor' || /tiles/.test(m.key)).map(m => [m.key, m.detail, m.amount]); }")
    check(f'{tag}: house quantities: wall tiles and the tiled floors counted from the grid (whole and cut pieces)', any(k.startswith('tiles|') and 'cut pieces' in d for k, d, _ in q) and any(k.startswith('floor|tiles') and 'cut pieces' in d for k, d, _ in q), q)
    check(f'{tag}: no errors on the page', not pg.errors, pg.errors)
    b.close()


with sync_playwright() as p:
    run(p, False)
    run(p, True)
sys.exit(summary())
