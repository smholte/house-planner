"""Task board: the phases of the work schedule (wall preparation … final finishing) × the rooms; ticking off
(to do → busy → done), who does a step, details per box (who, date, note, not here), a whole phase at once, editing
the phases and steps, the progress per room in its details and coloured on the plan, the spreadsheet; on a phone."""
from common import *

PROG = "() => { const a = window.__hp.app; const P = window.__hp.boardProgress(a.project, a.shownVersion().plan); return { pct: P.pct, phases: P.phase.map(x => [x.ph.name, x.n, x.done]), rooms: P.rooms.length }; }"
CELL = "(k) => { const T = window.__hp.tasksOf(window.__hp.app.project); return T.cells[k] || null; }"

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    pg.click('#btn-tasks'); pg.wait_for_timeout(700)
    names = pg.evaluate("() => [...document.querySelectorAll('.tb-phases button')].map(b => b.textContent)")
    check('the five phases of the work schedule', len(names) == 6 and names[1].startswith('1. Wall preparation') and names[5].startswith('5. Final finishing'), names)
    P = pg.evaluate(PROG)
    steps = pg.evaluate("() => [...document.querySelectorAll('.tb-table thead .tb-step-name')].map(e => e.textContent)")
    check('phase 1 shows its steps as columns, a row per room', steps == ['Cleaning: brush and vacuum', 'Filling and sanding', 'Priming (voorstrijk)'] and pg.evaluate("() => document.querySelectorAll('.tb-table tbody tr[data-room]').length") == P['rooms'], steps)
    rid = pg.evaluate("() => window.__hp.app.shownVersion().plan.rooms.find(r => r.name === 'Woonkamer').id")
    box = f'.tb-box[data-cell="{rid}|ph1s1"]'
    pg.click(box); pg.wait_for_timeout(300)
    s1 = (pg.evaluate(CELL, f'{rid}|ph1s1') or {}).get('s')
    pg.click(box); pg.wait_for_timeout(300)
    c = pg.evaluate(CELL, f'{rid}|ph1s1')
    check('tick off: busy, then done (with the date)', s1 == 'doing' and c['s'] == 'done' and len(c.get('date', '')) >= 8, (s1, c))
    # who does a step
    pg.click('.tb-step[data-step="ph1s2"]'); pg.wait_for_selector('#dlg-input')
    pg.fill('#dlg-input', 'Alex'); pg.click('.scrim:last-child .btn.primary'); pg.wait_for_timeout(500)
    check('who does a step', pg.evaluate("() => window.__hp.tasksOf(window.__hp.app.project).phases[0].steps[1].who") == 'Alex' and 'Alex' in pg.inner_text('.tb-step[data-step="ph1s2"]'))
    # details of one box: not here
    pg.click('#tb-mode button[data-k="details"]'); pg.wait_for_timeout(300)
    bid = pg.evaluate("() => window.__hp.app.shownVersion().plan.rooms.find(r => r.name === 'Toilet').id")
    pg.click(f'.tb-box[data-cell="{bid}|ph1s3"]'); pg.wait_for_selector('#tc-who')
    pg.click('#tc-state button[data-k="skip"]'); pg.fill('#tc-who', 'Painter'); pg.fill('#tc-note', 'Tiled to 1.5 m, only above')
    pg.click('.scrim:last-child .btn.primary:has-text("Save")'); pg.wait_for_timeout(500)
    c = pg.evaluate(CELL, f'{bid}|ph1s3')
    check('details: not here, who and a note', c['s'] == 'skip' and c['who'] == 'Painter' and 'Tiled' in c['note'], c)
    # a whole phase at once
    pg.click('#tb-mode button[data-k="tick"]'); pg.wait_for_timeout(200)
    pg.click('#tb-all-done'); pg.wait_for_timeout(600)
    P = pg.evaluate(PROG)
    ph1 = P['phases'][0]
    check('whole phase 1 done (the box that is "not here" stays out)', ph1[1] == ph1[2] and ph1[1] == P['rooms'] * 3 - 1, ph1)
    check('overall: one of five phases', 0.15 < P['pct'] < 0.35, P['pct'])
    pg.screenshot(path=SHOTS + 'tasks-board.png')
    # all phases at a glance
    pg.click('.tb-phases button[data-ph="all"]'); pg.wait_for_timeout(400)
    check('all phases: a column per phase', pg.evaluate("() => document.querySelectorAll('.tb-table thead .tb-step').length") == 5)
    # edit phases: add a kitchen phase
    pg.click('#tb-edit'); pg.wait_for_selector('.tp-body')
    pg.click('#tp-add-phase'); pg.wait_for_timeout(200)
    pg.fill('.tp-phase >> nth=5', 'Kitchen'); pg.click('.scrim:last-child .btn.primary:has-text("Save")'); pg.wait_for_timeout(600)
    ph = pg.evaluate("() => window.__hp.tasksOf(window.__hp.app.project).phases.map(x => x.name)")
    check('a phase of your own: Kitchen', ph[-1] == 'Kitchen' and len(ph) == 6, ph)
    with pg.expect_download() as dl:
        pg.click('.dlg-foot button:has-text("Spreadsheet")')
    csv = open(dl.value.path(), encoding='utf-8-sig').read().splitlines()
    check('spreadsheet: a line per room and step', len(csv) == 1 + P['rooms'] * 13 and any('Painter' in l and 'Not here' in l for l in csv), len(csv))
    # progress on the plan
    pg.click('#btn-tasks'); pg.wait_for_timeout(600)
    pg.click('.dlg-foot button:has-text("Show on the plan")'); pg.wait_for_timeout(900)
    fills = pg.evaluate("() => [...document.querySelectorAll('.room')].map(e => e.getAttribute('fill')).filter(f => f && f !== 'none')")
    labs = pg.evaluate("() => [...document.querySelectorAll('.rl-prog')].map(e => e.textContent)")
    check('the plan: rooms coloured by progress, with the %', len(fills) > 3 and any(l.endswith('%') for l in labs), (fills[:3], labs[:3]))
    pg.screenshot(path=SHOTS + 'tasks-plan.png')
    pg.mouse.click(*room_screen(pg, 'Woonkamer', 0.2, 0.7)); pg.wait_for_timeout(600)
    check('a room\'s details: its progress and what is next', 'Next:' in pg.inner_text('.inspector'))
    pg.evaluate("() => { window.__hp.Settings.set('colorBy', 'floor'); }")
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    check('kept in the house file', len(json.loads(text)['projects'][0]['project']['tasks']['cells']) > 20)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.tap('#toolrail button[data-tool="tasks"]'); pg.wait_for_timeout(800)
    check('phone: the board opens from View', pg.is_visible('.tb-table'))
    first = pg.evaluate("() => document.querySelector('.tb-box').dataset.cell")
    pg.tap('.tb-box >> nth=0'); pg.wait_for_timeout(400)
    check('phone: tap a box', (pg.evaluate(CELL, first) or {}).get('s') == 'doing')
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways (the board scrolls inside)', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'tasks-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
