"""Room details with a jump row (task 0035): chips Floor · Walls · Ceiling · Electrics · Heating · Quantities ·
Diary · Notes in the sticky head; each chip lands its section's heading just under the head, the marked chip follows
the scroll, a section folds by its heading (remembered on this device), the details of a room open at the section
last in view for that room (a new room at the top). PC light and phone dark (chips 44 px high, the row scrolls
sideways)."""
from common import *

KEYS = ['floor', 'walls', 'ceiling', 'electrics', 'heating', 'qty', 'diary', 'notes']
ROOM = "(name) => window.__hp.app.shownVersion().plan.rooms.find(r => r.name === name && r.storey === window.__hp.app.view.storeyId)"
# how far the section's top is from the bottom of the sticky head, and which chip is marked
WHERE = """(key) => { const el = document.querySelector('#inspector'), head = el.querySelector('.insp-head');
  const w = el.querySelector('.jump-sec[data-jump="' + key + '"]'); const on = el.querySelector('.jump-chip.on');
  return { off: w ? w.getBoundingClientRect().top - head.getBoundingClientRect().bottom : null, on: on ? on.dataset.jump : null, top: el.scrollTop }; }"""
LANDED = "(key) => { const r = (" + WHERE + ")(key); return r.off !== null && Math.abs(r.off) <= 2 && r.on === key; }"


def pick_room(pg, name, phone=False, by_code=False):
    if by_code:   # the sheet may cover the room on a phone: select it as a tap on the plan does
        pg.evaluate("(name) => { const a = window.__hp.app, r = (" + ROOM + ")(name); a.select({ type: 'room', id: r.id, storey: r.storey }); }", name)
        pg.wait_for_timeout(500)
        return
    lp = pg.evaluate("(name) => { const r = (" + ROOM + ")(name); return window.__hp.labelPoint(r.poly, []); }", name)
    x, y = to_screen(pg, lp[0], lp[1] + 0.25)
    if phone: pg.touchscreen.tap(x, y)
    else: pg.mouse.click(x, y)
    pg.wait_for_function("(n) => { const t = window.__hp.app.selectionTarget(); return t && t.name === n && document.querySelector('#inspector .jump-row'); }", arg=name)
    pg.wait_for_timeout(300)


def run(p, phone=False, theme='light'):
    tag = ('phone' if phone else 'pc') + '-' + theme
    b, pg = open_app(p, phone=phone, theme=theme)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(800)
    tap = pg.tap if phone else pg.click
    pick_room(pg, 'Woonkamer', phone)
    keys = pg.evaluate("() => [...document.querySelectorAll('#inspector .jump-chip')].map(c => c.dataset.jump)")
    check(f'[{tag}] the chip row lists the sections in order', keys == KEYS, keys)
    check(f'[{tag}] new texts in place', pg.inner_text('.jump-chip[data-jump="heating"]').strip().lower() == 'heating', pg.inner_text('.jump-chip[data-jump="heating"]'))
    check(f'[{tag}] a new room opens at the top, no chip marked', pg.evaluate(WHERE, 'floor')['top'] == 0 and pg.evaluate(WHERE, 'floor')['on'] is None, pg.evaluate(WHERE, 'floor'))
    if phone:
        hs = pg.evaluate("() => [...document.querySelectorAll('.jump-chip')].map(c => c.getBoundingClientRect().height)")
        check(f'[{tag}] chips at least 44 px high', min(hs) >= 44, hs)
        row = pg.evaluate("() => { const r = document.querySelector('.jump-row'); return [r.scrollWidth, r.clientWidth, document.documentElement.scrollWidth]; }")
        check(f'[{tag}] the row scrolls sideways, the page does not', row[0] > row[1] and row[2] <= 390, row)
    # every chip lands on its heading (smooth scroll), the chip is marked, the head stays on top
    for k in KEYS + ['walls']:
        tap(f'.jump-chip[data-jump="{k}"]')
        try:
            pg.wait_for_function(LANDED, arg=k, timeout=5000); ok = True
        except Exception:
            ok = False
        check(f'[{tag}] chip “{k}” lands on its heading and is marked', ok, pg.evaluate(WHERE, k))
        if phone and k == 'notes':
            vis = pg.evaluate("() => { const r = document.querySelector('.jump-row'), c = r.querySelector('.jump-chip.on'); const a = r.getBoundingClientRect(), d = c.getBoundingClientRect(); return d.left >= a.left - 1 && d.right <= a.right + 1; }")
            check(f'[{tag}] the marked chip is scrolled into the row', vis)
    head_vis = pg.evaluate("() => { const el = document.querySelector('#inspector'), hd = el.querySelector('.insp-head'); return Math.abs(hd.getBoundingClientRect().top - el.getBoundingClientRect().top) <= 1; }")
    check(f'[{tag}] the head with the chips stays at the top (sticky)', head_vis)
    # scrolling by hand: the marked chip follows
    pg.evaluate("() => { const el = document.querySelector('#inspector'), w = el.querySelector('.jump-sec[data-jump=\"ceiling\"]'), hd = el.querySelector('.insp-head'); el.scrollTop += w.getBoundingClientRect().top - hd.getBoundingClientRect().bottom + 40; }")
    try:
        pg.wait_for_function("() => { const c = document.querySelector('.jump-chip.on'); return c && c.dataset.jump === 'ceiling'; }", timeout=4000); ok = True
    except Exception:
        ok = False
    check(f'[{tag}] scrolling by hand marks the section in view', ok, pg.evaluate(WHERE, 'ceiling'))
    if phone:
        pg.screenshot(path=SHOTS + f'roomjump-{tag}.png', clip={'x': 0, 'y': 844 * 0.42 - 4, 'width': 390, 'height': 200})
    else:
        box = pg.evaluate("() => { const r = document.querySelector('#inspector').getBoundingClientRect(); return [r.x, r.y, r.width]; }")
        pg.screenshot(path=SHOTS + f'roomjump-{tag}.png', clip={'x': box[0], 'y': box[1], 'width': box[2], 'height': 260})
    # fold Walls by its heading: its contents go, the heading stays; remembered on this device
    tap('.jump-chip[data-jump="walls"]'); pg.wait_for_function(LANDED, arg='walls', timeout=5000)
    tap('.jump-sec[data-jump="walls"] .jump-fold'); pg.wait_for_timeout(300)
    st = pg.evaluate("() => { const w = document.querySelector('.jump-sec[data-jump=\"walls\"]'); return [w.classList.contains('folded'), !!w.querySelector('.face-list') && w.querySelector('.face-list').offsetParent === null, w.querySelector('.jump-fold').offsetParent !== null, w.querySelector('.jump-fold').getAttribute('aria-expanded'), JSON.parse(localStorage.getItem('house-planner.roomjump')).fold]; }")
    check(f'[{tag}] Walls folds: each wall hidden, the heading kept, remembered', st[0] and st[1] and st[2] and st[3] == 'false' and st[4].get('walls'), st)
    # the chips still land with a folded section above
    tap('.jump-chip[data-jump="electrics"]')
    try:
        pg.wait_for_function(LANDED, arg='electrics', timeout=5000); ok = True
    except Exception:
        ok = False
    check(f'[{tag}] with Walls folded, Electrics still lands', ok, pg.evaluate(WHERE, 'electrics'))
    # a change in the room re-draws the details: the place and the fold stay
    pg.evaluate("() => window.__hp.app.renderInspector()"); pg.wait_for_timeout(300)
    r = pg.evaluate(WHERE, 'electrics')
    check(f'[{tag}] re-drawn details stay at Electrics, Walls still folded', abs(r['off']) <= 2 and r['on'] == 'electrics' and pg.evaluate("() => document.querySelector('.jump-sec[data-jump=\"walls\"]').classList.contains('folded')"), r)
    # another room: new, so at the top; back to the living room: at Electrics, Walls folded
    pick_room(pg, 'Keuken', phone, by_code=True)
    check(f'[{tag}] another room opens at the top', pg.evaluate(WHERE, 'floor')['top'] == 0, pg.evaluate(WHERE, 'floor'))
    check(f'[{tag}] the fold is kept for every room', pg.evaluate("() => document.querySelector('.jump-sec[data-jump=\"walls\"]').classList.contains('folded')"))
    pick_room(pg, 'Woonkamer', phone, by_code=True)
    try:
        pg.wait_for_function(LANDED, arg='electrics', timeout=4000); ok = True
    except Exception:
        ok = False
    check(f'[{tag}] the living room reopens at the section last in view (Electrics)', ok, pg.evaluate(WHERE, 'electrics'))
    # unfold
    tap('.jump-sec[data-jump="walls"] .jump-fold'); pg.wait_for_timeout(300)
    check(f'[{tag}] Walls unfolds, no longer remembered as folded', pg.evaluate("() => !document.querySelector('.jump-sec[data-jump=\"walls\"]').classList.contains('folded') && !JSON.parse(localStorage.getItem('house-planner.roomjump')).fold.walls"))
    # after a reload: the fold and the place are still known
    tap('.jump-sec[data-jump="diary"] .jump-fold'); pg.wait_for_timeout(300)
    pg.reload()
    pg.wait_for_function("() => window.__hp && window.__hp.app.project && window.__hp.app.shownVersion()")   # the last house opens again
    pg.wait_for_timeout(1000)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(800)
    pick_room(pg, 'Woonkamer', phone)
    pg.wait_for_timeout(300)
    check(f'[{tag}] after a reload: Diary still folded', pg.evaluate("() => document.querySelector('.jump-sec[data-jump=\"diary\"]').classList.contains('folded')"))
    # Dutch
    pg.evaluate("async () => { await window.__hp.loadLangs(); window.__hp.setLang('nl'); window.__hp.app.renderInspector(); }"); pg.wait_for_timeout(500)
    nl = pg.evaluate("() => [...document.querySelectorAll('.jump-chip')].map(c => c.textContent)")
    check(f'[{tag}] in Dutch: Vloer · Wanden · … · Verwarming', nl[0] == 'Vloer' and 'Verwarming' in nl, nl)
    pg.evaluate("() => { window.__hp.setLang('en'); }")
    check(f'[{tag}] no page errors', not pg.errors, pg.errors)
    b.close()


with sync_playwright() as p:
    run(p)
    run(p, phone=True, theme='dark')
sys.exit(summary())
