"""Twelfth round (30 Oct, night): wall views per room (every wall drawn flat as you stand in the room: length and height,
doors and windows with sizes, the tiles with where the cut tiles fall, the sockets / switches / water points at their
height and distance from the left corner, the kitchen standing against it, dimensions) with a PDF of a page per wall
for the tiler, the electrician and the kitchen supplier; and the building diary (dated entries with several photos per
room, "pipes and cables" pinned where they run before a wall or floor is closed, a timeline per room and for the whole
house). PC (light) and phone (dark)."""
from common import *
import re

FX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures') + os.sep
SELROOM = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); a.select({ type: 'room', id: r.id, storey: r.storey }); }"
LAST = "() => { const a = window.__hp.app, n = a.project.notes[a.project.notes.length - 1]; return n && JSON.parse(JSON.stringify(n)); }"
OPEN_NOTES = "() => window.__hp.app.project.notes.filter(n => n.status !== 'done').length"
CARDS = "() => [...document.querySelectorAll('.wv-card')].map(c => ({ l: c.dataset.letter, pts: c.querySelectorAll('.wv-pt').length, tiles: c.querySelectorAll('.wv-tile').length, cut: c.querySelectorAll('.wv-tile.cut').length, kit: c.querySelectorAll('.wv-kitchen').length, ops: c.querySelectorAll('.wv-op').length, rows: [...c.querySelectorAll('.wv-table tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)), note: (c.querySelector('.wv-tilenote-line') || {}).textContent || '' }))"

def wall_views(pg, room):
    pg.evaluate(SELROOM, room); pg.wait_for_timeout(700)
    pg.locator('#f-wall-views').scroll_into_view_if_needed()
    pg.click('#f-wall-views'); pg.wait_for_timeout(1500)
    return pg.evaluate(CARDS)

def close_dialog(pg):
    pg.click('.scrim:last-child .dialog button:has-text("Close")'); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(800)
    # ───────── N4: how the tiles fall ─────────
    f = pg.evaluate("() => window.__hp.tileFall({ w: .3, h: .6, joint: .003 }, 1.33, 1.5)")
    check('tile layout centred on the wall: 1330 mm with 300 mm tiles → 3 whole, 209 mm cut at both ends (not a 58 mm sliver)', f['k'] == 3 and near(f['cut'], .209, .001), f)
    check('… whole rows from the floor: 2 rows of 600, the top row cut to 294 mm', f['rows'] == 2 and near(f['topCut'], .294, .001), f)
    f2 = pg.evaluate("() => window.__hp.tileFall({ w: .3, h: .6, joint: .003 }, 4 * .303 - .003, 1.2)")
    check('… a wall that fits exactly: 4 whole tiles, nothing cut', f2['k'] == 4 and f2['cut'] < .001, f2)
    # ───────── N4: the kitchen's walls ─────────
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(700)
    check('room details → Walls: a “Wall views” button', pg.locator('#f-wall-views').count() == 1)
    cards = wall_views(pg, 'Keuken')
    check('Keuken: a view per wall, A to D (as the letters on the plan)', [c['l'] for c in cards] == ['A', 'B', 'C', 'D'], [c['l'] for c in cards])
    A = cards[0]
    # per house: the points on wall A with their heights, the wall's length, the kitchen against each wall. The owner's
    # kitchen: 3 points, the tall cabinets against B, C only touched by an end; the made-up one: the run with 6 points
    # on A, the run's end against the wall to the living room, nothing against the others
    K = by_house(pg, dict(hs=['1200 mm', '1200 mm', '300 mm', '300 mm', '400 mm', '550 mm'], L=4400, kit=[1, 0, 0, 0], txt='a run against A only; the wall its end touches: no kitchen'),
                     dict(hs=['1200 mm', '2250 mm', '650 mm'], L=4105, kit=[1, 1, 0], txt='wall B: the tall cabinets against it; C: no kitchen (only its end touches)'))
    check(f'wall A: the window, the kitchen run in front of it, {len(K["hs"])} points on the wall', A['ops'] == 1 and A['kit'] == 1 and A['pts'] == len(K['hs']), A)
    hs = sorted(r[1] for r in A['rows'])
    check(f'… the list for the electrician: what, the height ({" / ".join(K["hs"])}) and from the left corner', len(A['rows']) == len(K['hs']) and hs == K['hs'] and all(r[2].endswith(' mm') for r in A['rows']), A['rows'])
    xs = [int(re.sub(r'\D', '', r[2])) for r in A['rows']]
    check(f'… the distances lie on the wall (0 to {K["L"]} mm)', all(0 <= x <= K['L'] for x in xs), xs)
    check(K['txt'], [c['kit'] for c in cards][:len(K['kit'])] == K['kit'], [c['kit'] for c in cards])
    check('no tiles in the kitchen: no tile drawing, no tile line', all(c['tiles'] == 0 and not c['note'] for c in cards))
    pg.screenshot(path=SHOTS + 'r12-wallviews-kitchen.png')
    close_dialog(pg)
    # ───────── N4: the toilet, tiled ─────────
    cards = wall_views(pg, 'Toilet')
    check('Toilet: 4 walls, tiled up to 1500 mm, with cut tiles drawn lighter', len(cards) == 4 and all(c['tiles'] > 0 and c['cut'] > 0 for c in cards), [(c['l'], c['tiles'], c['cut']) for c in cards])
    check('… for the tiler under each view: tile size, how high, the cut at both ends and the top row', 'tiles to 1500 mm' in cards[0]['note'] and by_house(pg, '219', '209') in cards[0]['note'] and '294' in cards[0]['note'] and '300 × 600' in cards[0]['note'], cards[0]['note'])
    check('… the water point of the hand basin on its wall with its height', any('Water point' in r[0] for c in cards for r in c['rows']), [c['rows'] for c in cards])
    svg = pg.evaluate("() => { const s = document.querySelector('.wv-card svg'); const vb = s.viewBox.baseVal; return [vb.x, vb.y, vb.width, vb.height, [...s.querySelectorAll('text')].every(t => { const b = t.getBBox(); return b.x >= vb.x - 0.01 && b.x + b.width <= vb.x + vb.width + 0.01; })]; }")
    check('… every text inside the drawing (nothing cut off at the sides)', svg[4], svg)
    pg.screenshot(path=SHOTS + 'r12-wallviews-toilet.png')
    with pg.expect_download(timeout=120000) as dl:
        pg.click('.scrim:last-child .dialog button:has-text("PDF for the tiler")')
    path = os.path.join(SHOTS, 'r12-wallviews.pdf'); dl.value.save_as(path)
    data = open(path, 'rb').read()
    pages = len(re.findall(rb'/Type\s*/Page[^s]', data))
    check('PDF for the tiler, electrician and kitchen supplier: one A4 page per wall', data[:5] == b'%PDF-' and pages == 4, (pages, len(data)))
    check('… with the drawing as a picture and the name of the file after the room', len(data) > 100000 and 'toilet' in dl.value.suggested_filename.lower(), dl.value.suggested_filename)
    close_dialog(pg)
    # ───────── N6: the building diary ─────────
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(700)
    before = pg.evaluate(OPEN_NOTES)
    check('room details: a “Building diary” section with “Add to the diary” and “Pipes or cables on a spot”', pg.locator('.diary-sec').count() == 1 and pg.locator('#diary-add').count() == 1 and pg.locator('#diary-pipes').count() == 1)
    pg.locator('#diary-add').scroll_into_view_if_needed(); pg.click('#diary-add'); pg.wait_for_timeout(600)
    n = pg.evaluate(LAST)
    check('Add to the diary: an entry of today for the room, a record (done), with a date field', n['type'] == 'diary' and n['status'] == 'done' and n['room'] and n['date'] == pg.evaluate("() => window.__hp.isoDay(Date.now())") and pg.locator('#f-note-date').count() == 1, n)
    check('… no Open / Done buttons for a diary entry', pg.locator('.inspector .badge:has-text("Open")').count() == 0)
    pg.fill('#f-note-text', 'Tegels in de keuken gezet\nAchterwand klaar'); pg.wait_for_timeout(300)
    with pg.expect_file_chooser() as fc:
        pg.click('#f-note-photos')
    check('“Add photos”: several at once', fc.value.is_multiple())
    fc.value.set_files([FX + 'sample-tile.jpg', FX + 'sample-plank.jpg']); pg.wait_for_timeout(1500)
    check('… both photos kept with the entry', len(pg.evaluate(LAST)['photos']) == 2)
    pg.fill('#f-note-date', '2026-10-12'); pg.dispatch_event('#f-note-date', 'change'); pg.wait_for_timeout(300)
    check('… the date can be changed (a photo from last week)', pg.evaluate(LAST)['date'] == '2026-10-12')
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(700)
    tl = pg.evaluate("() => [document.querySelectorAll('.diary-sec .dt-entry').length, document.querySelectorAll('.diary-sec .dt-th').length, [...document.querySelectorAll('.diary-sec .dt-day')].map(e => e.textContent)]")
    check('the room’s timeline: the day, the entry with its 2 photos', tl[0] == 1 and tl[1] == 2 and len(tl[2]) == 1 and '12' in tl[2][0], tl)
    check('… not again in the room’s notes list', pg.evaluate("() => [...document.querySelectorAll('.inspector .note-row')].filter(r => r.textContent.includes('Tegels')).length") == 0)
    pg.locator('.diary-sec .dt-th').first.click(); pg.wait_for_timeout(500)
    check('tap a photo: shown large', pg.locator('.scrim img').count() >= 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # pipes and cables on a spot
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(500)
    pg.locator('#diary-pipes').scroll_into_view_if_needed(); pg.click('#diary-pipes'); pg.wait_for_timeout(500)
    check('“Pipes or cables on a spot”: the Note tool in View mode', pg.evaluate("() => [window.__hp.app.mode, window.__hp.app.tool]") == ['view', 'note'])
    x0, y0, x1, y1 = rooms(pg)['Keuken']
    sx, sy = to_screen(pg, (x0 + x1) / 2, (y0 + y1) / 2)
    pg.mouse.click(sx, sy); pg.wait_for_timeout(800)
    n = pg.evaluate(LAST)
    check('… tap: a “Pipes and cables” note pinned there, in the wall by default', n['type'] == 'hidden' and n['at'] and n['inside'] == 'wall' and n['runs'] == [], n)
    pg.click('.hidden-runs .chip[data-k="water"]'); pg.wait_for_timeout(200)
    pg.click('.hidden-runs .chip[data-k="electric"]'); pg.wait_for_timeout(200)
    pg.click('.hidden-in button:has-text("In the floor")'); pg.wait_for_timeout(200)
    n = pg.evaluate(LAST)
    check('… what runs there (water, electric cable) and where (in the floor)', n['runs'] == ['water', 'electric'] and n['inside'] == 'floor', n)
    pin = pg.evaluate("(id) => { const g = document.querySelector(`.pin2d[data-note='${id}']`); return g ? [g.getAttribute('class'), g.querySelector('.pin-glyph').textContent] : null; }", n['id'])
    check('… its pin on the plan in its own colour and sign, not faded like a done task', pin and 'pin-hidden' in pin[0] and ' done' not in pin[0] and pin[1] == '≈', pin)
    check('diary entries are not open tasks: the number of open notes stays the same', pg.evaluate(OPEN_NOTES) == before, (before, pg.evaluate(OPEN_NOTES)))
    # the whole house
    pg.evaluate("() => { window.__hp.app.notesSheet(); }")
    pg.wait_for_timeout(600)
    pg.click('.scrim:last-child .dialog button:has-text("Building diary")'); pg.wait_for_timeout(700)
    sh = pg.evaluate("() => [document.querySelectorAll('#diary-body .dt-entry').length, document.querySelectorAll('#diary-body .dt-day').length, document.querySelector('#diary-body .note-muted').textContent, (document.querySelector('#diary-body .dt-entry.nt-hidden .dt-where') || {}).textContent]")
    check('Notes → Building diary: the whole house by day, newest first', sh[0] == 2 and sh[1] == 2 and '2 entries, 2 photos' in sh[2], sh)
    check('… pipes and cables with where and what (In the floor · Water · Electric cable)', sh[3] and 'In the floor' in sh[3] and 'Water' in sh[3] and 'Electric cable' in sh[3], sh[3])
    pg.screenshot(path=SHOTS + 'r12-diary.png')
    pg.click('#diary-kind button[data-k="hidden"]'); pg.wait_for_timeout(300)
    check('… filter: only pipes and cables', pg.locator('#diary-body .dt-entry').count() == 1)
    pg.click('#diary-body .dt-entry'); pg.wait_for_timeout(600)
    check('… tap an entry: its details', pg.locator('.scrim').count() == 0 and pg.locator('.hidden-runs').count() == 1)
    pg.click('.note-types button.nt-todo'); pg.wait_for_timeout(300)
    n = pg.evaluate(LAST)
    check('made a To do after all: open again (a task)', n['type'] == 'todo' and n['status'] == 'open' and 'diaryDone' not in n, n)
    pg.click('.note-types button.nt-hidden'); pg.wait_for_timeout(300)
    check('… and back: a record again, what runs there kept', pg.evaluate(LAST)['status'] == 'done' and pg.evaluate(LAST)['runs'] == ['water', 'electric'])
    # 3D: the pin
    pg.evaluate("() => window.__hp.app.setDim('3d')"); pg.wait_for_timeout(2500)
    check('3D: the pipes pin in its colour, not faded', pg.evaluate("() => { const e = document.querySelector('.pin3d.pin-hidden'); return !!e && !e.classList.contains('done'); }"))
    # an older entry without a date: the day it was made
    check('an entry without a date (older file): the day it was made', pg.evaluate("() => window.__hp.noteDay({ created: new Date(2026, 8, 3, 15).getTime() })") == '2026-09-03')
    check('no page errors (PC)', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate(SELROOM, 'Toilet'); pg.wait_for_timeout(800)
    pg.locator('#f-wall-views').scroll_into_view_if_needed()
    pg.tap('#f-wall-views'); pg.wait_for_timeout(1500)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog'); const r = d.getBoundingClientRect(); const s = d.querySelector('.wv-card svg').getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth + 1, s.width <= r.width, s.height > 150, document.documentElement.scrollWidth <= innerWidth + 1, d.scrollWidth <= d.clientWidth + 1]; }")
    check('phone: wall views fit the screen, the drawing large enough to read', all(fit), fit)
    pg.screenshot(path=SHOTS + 'r12-phone-wallviews.png')
    pg.tap('.scrim:last-child .dialog button:has-text("Close")'); pg.wait_for_timeout(500)
    pg.evaluate(SELROOM, 'Toilet'); pg.wait_for_timeout(600)
    pg.locator('#diary-add').scroll_into_view_if_needed()
    hb = pg.evaluate("() => ['#diary-add', '#diary-pipes'].map(s => document.querySelector(s).getBoundingClientRect().height)")
    check('phone: the diary buttons big enough to tap', all(x >= 36 for x in hb), hb)
    pg.tap('#diary-add'); pg.wait_for_timeout(700)
    check('phone: a diary entry with its date', pg.evaluate(LAST)['type'] == 'diary' and pg.locator('#f-note-date').count() == 1)
    pg.evaluate("() => { window.__hp.app.diarySheet(); }"); pg.wait_for_timeout(600)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog').getBoundingClientRect(); return [d.left >= 0, d.right <= innerWidth + 1, document.querySelectorAll('#diary-body .dt-entry').length]; }")
    check('phone: the building diary fits the screen', fit[0] and fit[1] and fit[2] == 1, fit)
    pg.screenshot(path=SHOTS + 'r12-phone-diary.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
