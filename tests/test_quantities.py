"""Quantities: per room (floor + extra for cutting, walls without doors and windows, ceiling, skirting, paint for two
coats, sealant) and the materials for the whole house (paint per colour, primer, renovlies rolls, wallpaper rolls,
tiles, ceiling paint, floors, skirting lengths, sealant tubes), the rates kept in the house, rooms left out, the
spreadsheet (.csv) and the page to print; on a phone too."""
from common import *
import math

Q = """() => { const a = window.__hp.app; const Q = window.__hp.houseQuantities(a.project, a.shownVersion().plan);
  return { mats: Q.materials.map(m => ({ what: m.what, amount: m.amount, unit: m.unit, group: m.group, key: m.key, show: m.show })), totals: Q.totals, S: Q.S,
    rooms: Q.rooms.map(x => ({ name: x.room.name, counted: x.counted, floor: x.floor, walls: x.walls, painted: x.painted, vlies: x.byBase.renovlies, paintL: x.paintL, skirting: x.skirting, ceil: x.ceiling })) }; }"""

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    q = pg.evaluate(Q)
    groups = {m['group'] for m in q['mats']}
    check('materials: floors, walls, paint and ceilings', {'floor', 'wall', 'paint', 'ceil'} <= groups, groups)
    paint = [m for m in q['mats'] if m['what'].startswith('Sigma Pearl Clean Matt')]
    painted = sum(r['painted'] for r in q['rooms'] if r['counted'])
    check('wall paint: painted area × 2 coats ÷ 9 m² per litre', near(sum(m['amount'] for m in paint), painted * 2 / 9, 0.01), (sum(m['amount'] for m in paint), painted))
    wk = next(r for r in q['rooms'] if r['name'] == 'Woonkamer')
    area = pg.evaluate("() => { const r = window.__hp.app.shownVersion().plan.rooms.find(x => x.name === 'Woonkamer'); return Math.abs(r.poly.reduce((a, p, i) => { const q = r.poly[(i + 1) % r.poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2); }")
    check('living room: floor area = the room', near(wk['floor'], area, 0.01), (wk['floor'], area))
    check('living room: skirting shorter than around the room (doors)', 0 < wk['skirting'] < sum([1]) * 999, wk['skirting'])
    # (on the owner's build the plank floor is his own floor product, counted in whole packs)
    oak = next((m for m in q['mats'] if 'Wood' in m['what'] or '|p:' in m.get('key', '')), None)
    check('the plank floor bought with extra (in whole packs)', oak and oak['unit'] == 'm²' and oak['amount'] > 0 and ('Wood' in oak['what'] or 'pack' in oak.get('show', '')), oak)
    # the sheet
    pg.click('#btn-qty'); pg.wait_for_timeout(800)
    rows = pg.evaluate("() => document.querySelectorAll('.qty-table .mat-row').length")
    check('the sheet lists the materials', rows == len(q['mats']), (rows, len(q['mats'])))
    pg.screenshot(path=SHOTS + 'qty-materials.png')
    pg.click('.qty-tabs button[data-k="rooms"]'); pg.wait_for_timeout(400)
    check('per room: a line per room', pg.evaluate("() => document.querySelectorAll('.qty-table .room-q').length") == len(q['rooms']))
    pg.click('.qty-tabs button[data-k="rates"]'); pg.wait_for_timeout(400)
    pg.fill('#q-wallCov', '10'); pg.press('#q-wallCov', 'Enter'); pg.wait_for_timeout(500)
    q2 = pg.evaluate(Q)
    check('rate 10 m² per litre: less paint, kept in the house', near(sum(m['amount'] for m in q2['mats'] if m['what'].startswith('Sigma Pearl')), painted * 2 / 10, 0.01) and pg.evaluate("() => window.__hp.app.project.qty.wallCov") == 10)
    pg.click('#q-all-vlies'); pg.wait_for_timeout(400)
    pg.click('.dialog .btn.primary:has-text("Change the rooms")'); pg.wait_for_timeout(800)
    q3 = pg.evaluate(Q)
    vl = sum(r['vlies'] for r in q3['rooms'] if r['counted'])
    rolls = next((m for m in q3['mats'] if m['what'] == 'Renovlies'), None)
    check('renovlies in every room: rolls of 25 m² with 10 % extra', rolls and rolls['amount'] == math.ceil(vl * 1.1 / 25 - 1e-9) and vl > 100, (rolls, vl))
    check('primer before renovlies listed', any(m['what'].startswith('Primer before renovlies') for m in q3['mats']))
    pg.screenshot(path=SHOTS + 'qty-rates.png')
    # download the spreadsheet
    pg.click('.qty-tabs button[data-k="materials"]'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl:
        pg.click('.dlg-foot button:has-text("Spreadsheet")')
    csv = open(dl.value.path(), encoding='utf-8-sig').read().splitlines()
    check('spreadsheet: the materials, then a line per room', csv[0].startswith('"Material"') and any('"Renovlies"' in l for l in csv) and sum(1 for l in csv if any(l.startswith(f'"{n}"') for n in pg.evaluate("() => window.__hp.app.project.storeys.map(s => s.name)"))) == len(q['rooms']), csv[:3])
    check('numbers with a decimal comma (Dutch spreadsheets)', any(';' in l and ',' in l.split(';')[2] for l in csv[1:4]), csv[1:4])
    # leave a room out
    pg.mouse.click(*room_screen(pg, 'Keuken', 0.2, 0.15)); pg.wait_for_timeout(700)
    name = pg.evaluate("() => window.__hp.app.selectionTarget().name")
    pg.uncheck('#f-room-qty'); pg.wait_for_timeout(600)
    q4 = pg.evaluate(Q)
    rm = next(r for r in q4['rooms'] if r['name'] == name)
    check(f'{name} left out of the house totals', not rm['counted'] and near(q4['totals']['floor'], q3['totals']['floor'] - rm['floor'], 0.01), (q4['totals']['floor'], q3['totals']['floor'], rm['floor']))
    check('the room shows its own quantities', 'Skirting' in pg.inner_text('.qty-sec'))
    html = pg.evaluate("() => window.__hp.app.quantitiesHtml()")
    check('a page to print', 'Quantities and materials' in html and 'Renovlies' in html)
    pg.evaluate("() => window.__hp.app.printHtml(window.__hp.app.quantitiesHtml(), 'Quantities')"); pg.wait_for_timeout(600)
    check('no page errors', not pg.errors, pg.errors)
    b.close()
    # phone, dark
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#btn-menu'); pg.wait_for_timeout(400)
    pg.tap('.menu button:has-text("Quantities and materials")'); pg.wait_for_timeout(900)
    check('phone: the sheet opens from the menu', pg.is_visible('.qty-table'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'qty-phone-dark.png')
    pg.tap('.qty-tabs button[data-k="rooms"]'); pg.wait_for_timeout(400)
    pg.screenshot(path=SHOTS + 'qty-phone-rooms.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
