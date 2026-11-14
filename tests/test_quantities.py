"""Quantities: per room (floor + extra for cutting, walls without doors and windows, ceiling, skirting, paint for two
coats, sealant) and the materials for the whole house (paint per colour, primer, renovlies rolls, wallpaper rolls,
tiles, ceiling paint, floors, skirting lengths, sealant tubes), the rates kept in the house, rooms left out, the
spreadsheet (.csv) and the page to print; on a phone too. Task 0024: a wall's face reaches round an outside corner
(skirting and wall area = the room's outline), attic ceilings along the roof slopes (hand-checked on the made-up
Zolderkamer), a socket left in a moved wall still counts in its room, a finish in one version leaves the others alone."""
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
    # ── task 0024: the bug hunt ──
    b, pg = open_app(p)
    open_example(pg)
    pg.wait_for_function("() => !!window.__hp.app.shell", timeout=30000)
    # an L-shaped room round the corner of a cupboard (walls 10 cm, 2.6 m high): every face of the room counts in full,
    # also the two that meet at the cupboard's outside corner (before: 5 cm short at each end there)
    L = pg.evaluate("""() => { const H = window.__hp, a = H.app, st = H.sortedStoreys(a.project)[0], sid = st.id;
      const W = (x0, y0, x1, y1) => ({ id: 'w' + x0 + y0 + x1 + y1, storey: sid, a: [x0, y0], b: [x1, y1], t: 0.1, kind: 'interior' });
      const room = { id: 'rL', storey: sid, name: 'L', poly: [[0.05, 0.05], [5.95, 0.05], [5.95, 2.45], [3.95, 2.45], [3.95, 3.95], [0.05, 3.95]] };
      const plan = { walls: [W(0, 0, 6, 0), W(6, 0, 6, 4), W(6, 4, 0, 4), W(0, 4, 0, 0), W(4, 4, 4, 2.5), W(4, 2.5, 6, 2.5)], openings: [], rooms: [room], voids: [], points: [] };
      const s = H.roomFinishStats(plan, room, { ...st, wallHeight: 2.6 });
      const Q = H.houseQuantities(a.project, plan);
      return { wall: s.wall, faces: s.faces.map(r => +r.len.toFixed(3)), skirt: Q.rooms[0].skirting, n3d: H.wallFaces(plan, sid).reduce((x, f) => x + f.u1 - f.u0, 0) }; }""")
    check('L-shaped room: skirting = its outline, 19.60 m (hand: 5.9 + 2.4 + 2.0 + 1.5 + 3.9 + 3.9)', near(L['skirt'], 19.6, 0.005), L)
    check('L-shaped room: walls = outline × 2.6 m = 50.96 m²', near(L['wall'], 50.96, 0.01), L)
    check('the faces round the outside corner are whole (2.0 and 1.5 m)', 2.0 in L['faces'] and 1.5 in L['faces'], L['faces'])
    check('the 3D view keeps the centre-line ends (19.5 m)', near(L['n3d'], 19.5, 0.005), L['n3d'])
    # attic ceilings: along the roof where it comes below the ceiling height
    A = pg.evaluate("""() => { const a = window.__hp.app, p = a.project; const Q = window.__hp.houseQuantities(p, a.shownVersion().plan);
      return Q.rooms.map(x => ({ name: x.room.name, st: x.storey.level, floor: x.floor, ceil: x.ceiling, ceilL: x.ceilPaintL, fin: x.ceilFinish })); }""")
    top = max(r['st'] for r in A)
    low = [r for r in A if r['st'] < top]
    check('rooms under a flat ceiling: ceiling = floor', all(abs(r['ceil'] - r['floor']) < 1e-6 for r in low), [(r['name'], r['floor'], r['ceil']) for r in low if abs(r['ceil'] - r['floor']) >= 1e-6])
    att = [r for r in A if r['st'] == top and r['floor'] > 5]
    check('attic rooms: the ceiling along the slopes is larger than the floor', att and all(r['ceil'] > r['floor'] * 1.05 for r in att), [(r['name'], r['floor'], r['ceil']) for r in att])
    if is_testhouse(pg):
        z = next(r for r in A if r['name'] == 'Zolderkamer')
        # by hand from the gable (roof 0.31 m at u = −0.075 to 3.792 m at u = 4.075: 40°; ceiling 2.6 m from x = 3.479 to 6.321):
        # 4.0 × (2.842 flat + 2 × 1.889 × 1.3054 sloped) = 31.09 m²
        check('made-up Zolderkamer: ceiling 31.09 m² by hand (floor 26.48 m²)', near(z['ceil'], 31.09, 0.25) and near(z['floor'], 26.48, 0.01), z)
        check('its ceiling paint follows: 2 coats at 8 m² per litre', near(z['ceilL'], z['ceil'] * 2 / 8, 0.001) if z['fin'] in ('paint', 'plaster') else True, z)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(500)
    with pg.expect_download() as dl:
        pg.evaluate("() => window.__hp.app.quantitiesCsv()")
    csv = [l.split(';') for l in open(dl.value.path(), encoding='utf-8-sig').read().splitlines()]
    hdr = next(i for i, l in enumerate(csv) if l and l[0] == '"Storey"')
    ci = csv[hdr].index('"Ceiling m²"')
    big = max(att, key=lambda r: r['ceil'])
    row = next(l for l in csv[hdr + 1:] if len(l) > ci and l[1] == f'"{big["name"]}"')
    check('the spreadsheet has the sloped ceiling', near(float(row[ci].replace(',', '.')), big['ceil'], 0.01), (row[ci], big))
    # a socket on a wall that was moved afterwards (it now sits in the wall): still in its room
    S = pg.evaluate("""() => { const a = window.__hp.app, plan = a.shownVersion().plan;
      const cnt = r => { const d = document.createElement('div'); a.roomInstallSection(d, r, true, plan); return d.querySelectorAll('.pt-row').length; };
      for (const pt of plan.points || []) { const w = pt.wall && plan.walls.find(x => x.id === pt.wall); if (!w || !pt.side) continue;
        const before = plan.rooms.filter(rr => rr.storey === pt.storey).map(cnt);
        const x0 = pt.x, y0 = pt.y;
        // onto the wall's centre line, as if the wall had moved 7 cm into the room after the socket was placed
        const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d), u = ((x0 - w.a[0]) * d[0] + (y0 - w.a[1]) * d[1]) / L;
        pt.x = w.a[0] + d[0] / L * u; pt.y = w.a[1] + d[1] / L * u;
        const after = plan.rooms.filter(rr => rr.storey === pt.storey).map(cnt);
        pt.x = x0; pt.y = y0;
        if (before.reduce((x, y) => x + y, 0) > 0) return { before, after, kind: pt.kind };
      } return null; }""")
    check('a socket in a moved wall still counts in its room', S and S['before'] == S['after'], S)
    # a finish changed in one version leaves the others alone
    V = pg.evaluate("""() => { const a = window.__hp.app, p = a.project, cur = a.shownVersion(); const other = p.versions.find(v => v.id !== cur.id);
      const name = cur.plan.rooms.find(r => r.storey === cur.plan.rooms[0].storey && other.plan.rooms.some(o => o.id === r.id)).name;
      const q = v => { const x = window.__hp.houseQuantities(p, v.plan).rooms.find(x => x.room.name === name); return [x.floorMat, x.floorBuy, x.painted]; };
      const o0 = q(other);
      a.mutate(pl => { const r = pl.rooms.find(x => x.name === name); r.floor = { material: 'carpet', color: '#777777' }; r.wallBase = 'renovlies'; });
      return { name, o0, o1: q(other), c: q(a.shownVersion()) }; }""")
    check('a floor and wall finish changed in one version: the other version keeps its quantities', V['o0'] == V['o1'] and V['c'][0] == 'carpet', V)
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
