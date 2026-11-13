"""Sixteenth round (31 Oct, midday): View → Ceiling – a fifth Show button next to Electrics that switches the things on
the ceiling (ceiling lights, smoke alarms, ceiling ventilation valves) on and off, in 2D and 3D, separately from the
rest of the electrics; and on phones a strip of the top bar always stays when the bars step aside: tap it or pull it
down to have them back. A finger whose lifting the drawing never saw no longer keeps the bars away. Computers always
show the bars. PC (light) and phone (dark)."""
from common import *

CEIL = ('light', 'smoke', 'vent')
# 2D symbols on the screen, per kind
SYM2D = "() => { const n = {}; for (const g of document.querySelectorAll('.pt2d')) { const k = [...g.classList].find(c => c.startsWith('k-')); if (k) n[k.slice(2)] = (n[k.slice(2)] || 0) + 1; } return n; }"
# 3D pieces of points, per kind of point
SYM3D = """() => { const a = window.__hp.app, v = a.panes.find(p => p.kind === '3d').view; const kinds = new Map(); for (const pt of a.shownVersion().plan.points || []) kinds.set(pt.id, pt.kind);
  const seen = new Set(), n = {}; v.group.traverse(o => { const id = o.userData && o.userData.point; if (id && !seen.has(id)) { seen.add(id); const k = kinds.get(id); n[k] = (n[k] || 0) + 1; } }); return n; }"""
ceil = lambda n: sum(n.get(k, 0) for k in CEIL)
wall = lambda n: sum(v for k, v in n.items() if k not in CEIL)
MENU = "() => !!document.querySelector('.menu')"

def view_menu(pg, phone=False):
    if not pg.evaluate(MENU):
        (pg.tap if phone else pg.click)('#btn-viewopts'); pg.wait_for_timeout(400)

def close_menu(pg):
    if pg.evaluate(MENU): pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#storey-tabs button:has-text("1e verdieping")'); pg.wait_for_timeout(1200)
    n0 = pg.evaluate(SYM2D)
    check('the example\'s 1e verdieping has ceiling lights, smoke alarms or valves and things on the walls (2D)', ceil(n0) >= 3 and wall(n0) >= 5, n0)
    view_menu(pg)
    btns = pg.evaluate("() => [...document.querySelectorAll('.menu .show-btn')].map(b => [b.id, b.textContent.trim(), b.getAttribute('aria-pressed'), !!b.querySelector('svg path')])")
    # (since the thirty-second round the site is four buttons – Garden, Street, Neighbours, Water & park – before these)
    check('View menu: the Show buttons – Garden, Street, Neighbours, Water & park, Furniture, Notes, Electrics, Ceiling', [x[0] for x in btns] == ['show-garden', 'show-street', 'show-houses', 'show-park', 'show-furniture', 'show-notesOn', 'show-installs', 'show-ceilItems'], btns)
    check('… Ceiling has its own icon and is on at first', btns[-1][1] == 'Ceiling' and btns[-1][2] == 'true' and btns[-1][3], btns[-1])
    row = pg.evaluate("() => [...document.querySelectorAll('.menu .show-btn')].map(b => Math.round(b.getBoundingClientRect().top))")
    check('… four a row', len(set(row)) == 2 and row[:4] == [row[0]] * 4 and row[4:] == [row[4]] * 4, row)
    pg.screenshot(path=SHOTS + 'r16-view-menu-pc.png')
    pg.click('#show-ceilItems'); pg.wait_for_timeout(1200)
    n1 = pg.evaluate(SYM2D)
    check('Ceiling off: no ceiling lights, smoke alarms or valves in 2D …', ceil(n1) == 0, n1)
    check('… the sockets, switches and the rest stay', wall(n1) == wall(n0), (n0, n1))
    check('… the button shows off, and it is a setting of its own', pg.get_attribute('#show-ceilItems', 'aria-pressed') == 'false' and pg.evaluate("() => window.__hp.app.settings.ceilItems") is False and pg.evaluate("() => window.__hp.app.settings.installs") is not False)
    pg.click('#show-installs'); pg.wait_for_timeout(1200)
    n2 = pg.evaluate(SYM2D)
    check('Electrics off too: nothing left', sum(n2.values()) == 0, n2)
    pg.click('#show-ceilItems'); pg.wait_for_timeout(1200)
    n3 = pg.evaluate(SYM2D)
    check('Electrics off, Ceiling on: only the ceiling things', ceil(n3) == ceil(n0) and wall(n3) == 0, n3)
    check('… the two buttons are separate (Electrics off, Ceiling on)', [pg.get_attribute('#show-installs', 'aria-pressed'), pg.get_attribute('#show-ceilItems', 'aria-pressed')] == ['false', 'true'])
    pg.click('#show-installs'); pg.wait_for_timeout(1200)
    close_menu(pg)
    check('both on: everything again', pg.evaluate(SYM2D) == n0, pg.evaluate(SYM2D))
    # older settings: Ceiling never switched → it follows Electrics (Electrics off hid everything before)
    pg.evaluate("() => { const s = window.__hp.app.settings; delete s.ceilItems; s.installs = false; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(1200)
    check('an older setting (Electrics off, Ceiling never touched): everything off, as before', sum(pg.evaluate(SYM2D).values()) == 0, pg.evaluate(SYM2D))
    view_menu(pg)
    check('… and the Ceiling button shows off then', pg.get_attribute('#show-ceilItems', 'aria-pressed') == 'false')
    pg.click('#show-installs'); pg.wait_for_timeout(1200)
    check('… Electrics on again: Ceiling stays as it was (off), from now on separate', [pg.get_attribute('#show-installs', 'aria-pressed'), pg.get_attribute('#show-ceilItems', 'aria-pressed')] == ['true', 'false'] and pg.evaluate("() => window.__hp.app.settings.ceilItems") is False)
    close_menu(pg)
    n4 = pg.evaluate(SYM2D)
    check('… so the sockets show and the ceiling things not', ceil(n4) == 0 and wall(n4) == wall(n0), n4)
    # a hidden smoke alarm can't be tapped: the room is picked instead
    sp = pg.evaluate("() => { const a = window.__hp.app, v = a.panes[0].view, st = a.currentStorey().id; const pt = a.shownVersion().plan.points.find(q => q.storey === st && q.kind === 'smoke') || a.shownVersion().plan.points.find(q => q.storey === st && q.kind === 'light'); const r = v.svg.getBoundingClientRect(), s = v.toScreen([pt.x, pt.y]); return [r.left + s[0], r.top + s[1], pt.id]; }")
    pg.mouse.click(sp[0], sp[1]); pg.wait_for_timeout(600)
    sel = pg.evaluate("() => window.__hp.app.selection")
    check('a tap where a hidden ceiling thing is picks the room, not the hidden thing', sel and sel.get('type') != 'point', sel)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # with the Electrics tool everything shows (to place and change them)
    pg.evaluate("() => window.__hp.app.setTool('install')"); pg.wait_for_timeout(900)
    n5 = pg.evaluate(SYM2D)
    check('with the Electrics tool the ceiling things show anyway (to place and change them)', ceil(n5) == ceil(n0), n5)
    pg.evaluate("() => window.__hp.app.setTool('select')"); pg.wait_for_timeout(700)
    # kept with the house's view settings
    pg.wait_for_timeout(600)
    vs = pg.evaluate("() => { window.__hp.app.syncViewSettings && window.__hp.app.syncViewSettings(); return (window.__hp.app.project.viewSettings || {}).ceilItems; }")
    check('Ceiling is kept with the house\'s view settings', vs is False, vs)

    # 3D, evening: the fittings go, the light stays
    pg.evaluate("() => { window.__hp.app.settings.light = 'evening'; window.__hp.Settings.save(); window.__hp.app.setDim('3d'); }"); pg.wait_for_timeout(4000); still(pg)
    m1 = pg.evaluate(SYM3D)
    hid = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return [v.lightSpots.filter(s => s.point && s.hidden).length, v.lightSpots.filter(s => s.room && s.hidden).length, v.glowGroup ? v.glowGroup.children.length : -1, v.lightSpots.filter(s => !s.hidden).length]; }")
    check('3D, Ceiling off: no ceiling lights, smoke alarms or valves; the sockets and switches are there', ceil(m1) == 0 and wall(m1) >= 5, m1)
    check('… the hidden ceiling lights still light their rooms in the evening (their light stays, no fitting, no glow)', hid[0] >= 1 and hid[2] == hid[3], hid)
    pg.screenshot(path=SHOTS + 'r16-ceiling-off-3d.png')
    view_menu(pg)
    pg.click('#show-ceilItems'); pg.wait_for_timeout(3000); still(pg)
    close_menu(pg)
    m2 = pg.evaluate(SYM3D)
    hid2 = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return [v.lightSpots.filter(s => s.hidden).length, v.glowGroup ? v.glowGroup.children.length : -1, v.lightSpots.length]; }")
    check('3D, Ceiling on: the ceiling things are back', ceil(m2) >= 3 and wall(m2) == wall(m1), m2)
    check('… and every lamp glows again', hid2[0] == 0 and hid2[1] == hid2[2], hid2)
    pg.screenshot(path=SHOTS + 'r16-ceiling-on-3d.png')
    pg.evaluate("() => { window.__hp.app.settings.light = 'day'; window.__hp.Settings.save(); window.__hp.app.setDim('2d'); }"); pg.wait_for_timeout(1500)
    # search: "rookmelder" finds the switch
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(500)
    pg.fill('#search-q', 'rookmelder'); pg.wait_for_timeout(300)
    hit = pg.evaluate("() => [...document.querySelectorAll('#search-list .sr-label')].map(e => e.textContent)")
    check('Search "rookmelder": the Ceiling switch', any('Ceiling' in x for x in hit), hit)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(1200)
    check('… Enter switches the ceiling things off', pg.evaluate("() => window.__hp.app.settings.ceilItems") is False and ceil(pg.evaluate(SYM2D)) == 0)
    pg.evaluate("() => { window.__hp.app.settings.ceilItems = true; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(800)
    # PC: the bars never step aside, and the strip is not there
    v0 = pg.evaluate("() => document.querySelector('#stage').getBoundingClientRect().top")
    c = pg.evaluate("() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    drag(pg, c, [c[0] + 120, c[1] + 80])
    pc = pg.evaluate("() => [document.querySelector('#editor').classList.contains('bars-away'), document.querySelector('#stage').getBoundingClientRect().top, getComputedStyle(document.querySelector('#bars-pull')).display]")
    check('PC: panning keeps the bars (always visible), no strip', pc[0] is False and pc[1] == v0 and pc[2] == 'none', (pc, v0))
    pg.evaluate("() => window.__hp.app.setBarsAway(true)"); pg.wait_for_timeout(300)
    pc2 = pg.evaluate("() => [document.querySelector('.topbar').getBoundingClientRect().height, document.querySelector('#btn-share').getBoundingClientRect().width]")
    check('PC: even if asked to step aside, the bars stay whole on a computer', pc2[0] > 40 and pc2[1] > 20, pc2)
    pg.evaluate("() => window.__hp.app.setBarsAway(false)")
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#storey-tabs button:has-text("1e")'); pg.wait_for_timeout(1200)
    view_menu(pg, True)
    fit = pg.evaluate("""() => { const m = document.querySelector('.menu').getBoundingClientRect(); return [...document.querySelectorAll('.menu .show-btn')].map(b => { const r = b.getBoundingClientRect(), s = b.querySelector('span'); return [Math.round(r.top), r.left >= m.left - 1 && r.right <= m.right + 1, s.scrollWidth <= s.clientWidth + 1, b.textContent.trim()]; }); }""")
    check('phone: the eight Show buttons four a row inside the menu, no name cut off', len(fit) == 8 and len(set(x[0] for x in fit)) == 2 and all(x[1] and x[2] for x in fit), fit)
    pg.screenshot(path=SHOTS + 'r16-view-menu-phone.png')
    pg.tap('#show-ceilItems'); pg.wait_for_timeout(1200)
    check('phone: Ceiling off works', ceil(pg.evaluate(SYM2D)) == 0 and wall(pg.evaluate(SYM2D)) >= 5, pg.evaluate(SYM2D))
    pg.tap('#show-ceilItems'); pg.wait_for_timeout(1200)
    close_menu(pg)
    if pg.evaluate(MENU): pg.touchscreen.tap(195, 700); pg.wait_for_timeout(400)

    pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(2500)
    cdp = pg.context.new_cdp_session(pg)
    def touch_drag(x, y, dx, dy, n=8, end=True):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for k in range(1, n + 1): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + k * dx / n, 'y': y + k * dy / n}]}); pg.wait_for_timeout(40)
        if end: cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    BARS = "() => [document.querySelector('#editor').classList.contains('bars-away'), Math.round(document.querySelector('#stage').getBoundingClientRect().top), document.querySelector('#bars-pull').getBoundingClientRect().height, getComputedStyle(document.querySelector('#bars-pull')).display]"
    WORLD = "([x, y]) => { const v = window.__hp.app.panes[0].view, r = v.svg.getBoundingClientRect(); return v.toWorld([x - r.left, y - r.top]); }"
    s0 = pg.evaluate("() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    touch_drag(s0[0], s0[1], 30, 40, end=False)
    away = pg.evaluate(BARS)
    check('phone: panning – the bars step aside, a strip of the top bar stays (about 22 px)', away[0] and 15 <= away[1] <= 30 and 15 <= away[2] <= 30 and away[3] == 'flex', away)
    pg.screenshot(path=SHOTS + 'r16-phone-strip.png')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(300)
    w0 = pg.evaluate(WORLD, [195, 500])
    # tap the strip: back at once, the drawing stays where it is
    pg.touchscreen.tap(195, 10); pg.wait_for_timeout(250)
    back = pg.evaluate(BARS)
    w1 = pg.evaluate(WORLD, [195, 500])
    check('phone: a tap on the strip brings the bars back at once', back[0] is False and back[1] > 60 and back[3] == 'none', back)
    check('… the drawing stays where it was on the screen', near(w0[0], w1[0], 0.05) and near(w0[1], w1[1], 0.05), (w0, w1))
    check('… and the tap did not go to the drawing (nothing selected, still View)', pg.evaluate("() => !window.__hp.app.selection && window.__hp.app.mode") == 'view')
    # pull it down
    touch_drag(s0[0], s0[1], -30, 30, end=False)
    check('phone: panning again – away', pg.evaluate(BARS)[0])
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(200)
    touch_drag(195, 8, 0, 60, n=6)
    pg.wait_for_timeout(250)
    check('phone: pulling the strip down brings the bars back', pg.evaluate(BARS)[0] is False)
    # still: they come back by themselves after you let go
    touch_drag(s0[0], s0[1], 20, -30)
    pg.wait_for_timeout(2200)
    check('phone: and they still come back by themselves after you let go', pg.evaluate(BARS)[0] is False)
    # a finger whose lifting the drawing never saw (the phone took the touch): it no longer keeps the bars away
    pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; v.pointers.set(987, { sp: [100, 300], start: [100, 300], t: performance.now() }); window.__hp.app.setBarsAway(true); }""")
    pg.wait_for_timeout(300)
    stuck = pg.evaluate("() => [document.querySelector('#editor').classList.contains('bars-away'), window.__hp.app.panes[0].view.pointers.size]")
    pg.touchscreen.tap(195, 520); pg.wait_for_timeout(2200)
    free = pg.evaluate("() => [document.querySelector('#editor').classList.contains('bars-away'), window.__hp.app.panes[0].view.pointers.size, window.__hp.app.panes[0].view.gesture ? window.__hp.app.panes[0].view.gesture.kind : null]")
    check('phone: a finger lost earlier – the next tap forgets it, the bars come back', stuck[0] and stuck[1] == 1 and free[0] is False and free[1] == 0 and free[2] != 'pinch', (stuck, free))
    # 3D: the strip works there too
    pg.evaluate("() => window.__hp.app.setBarsAway(true)"); pg.wait_for_timeout(300)
    pg.touchscreen.tap(60, 10); pg.wait_for_timeout(250)
    check('phone: the strip works anywhere along it (left side)', pg.evaluate(BARS)[0] is False)
    pg.tap('#btn-viewopts'); pg.wait_for_timeout(400)
    check('phone: after that the bar\'s buttons work (View menu opens)', pg.evaluate(MENU))
    close_menu(pg)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
