"""Twenty-ninth round (2 Nov, midday): a lock for the view in the render window. "Lock view" next to the picture's shape
locks the framed view: dragging, scrolling, right-dragging, double clicks, pinching – nothing moves it (a glide still
going stops at once); on a phone a drag on the locked preview scrolls the window instead. A tap on it says how to move it
again. The shape and the size can still be changed; the lock stays through a render and Back to the view; "View locked"
again unlocks it. PC (light) and phone (dark, in Dutch)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V = "window.__hp.app.panes.find(p => p.kind === '3d').view"
OPEN = "() => { window.__hp.app.renderSheet(); }"
CAM = "() => %s.cameraState()" % V
LOCK = """() => { const b = document.querySelector('#rn-lock'), s = document.querySelector('#rn-shield'), hn = document.querySelector('#rn-hint'), f = document.querySelector('#rn-frame');
  return b ? { label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), disabled: b.disabled, shield: !!s && !s.hidden, mark: !!(s && s.querySelector('.rn-lockmark svg')),
    hint: hn.hidden ? '' : hn.textContent, nudge: b.classList.contains('rn-nudge'), framed: f.classList.contains('locked'), fw: Math.round(f.getBoundingClientRect().width), fh: Math.round(f.getBoundingClientRect().height),
    own: f.querySelector('canvas.gl') === %s.renderer.domElement } : null; }""" % V

def wait_done(pg, secs=600):
    pg.wait_for_function("() => document.querySelector('#rn-start') && !document.querySelector('#rn-stop') && /in \\d+ s/.test(document.querySelector('#rn-status').textContent)", timeout=secs * 1000)
    pg.wait_for_timeout(400)

def centre(pg, sel):
    pg.locator(sel).scroll_into_view_if_needed()
    bx = pg.locator(sel).bounding_box()
    return bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2

def drag(pg, sel, dx, dy=0, button='left'):
    x, y = centre(pg, sel)
    pg.mouse.move(x, y); pg.mouse.down(button=button); pg.mouse.move(x + dx, y + dy, steps=10); pg.mouse.up(button=button)

def pick_ratio(pg, k):
    pg.click('#rn-ratio'); pg.wait_for_timeout(300)
    pg.click('#rn-ratio-' + k.replace(':', '-')); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.settings.light = 'day'; }"); pg.wait_for_timeout(9000); still(pg)
    pg.evaluate(OPEN)
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(2500)
    s = pg.evaluate(LOCK)
    check('the render window: "Lock view" next to the picture\'s shape, off to start with, the view itself in the frame', s and s['label'] == 'Lock view' and s['pressed'] == 'false' and not s['shield'] and s['own'], s)
    c0 = pg.evaluate(CAM)
    drag(pg, '#rn-frame', 120); pg.wait_for_timeout(2000)
    c1 = pg.evaluate(CAM)
    check('unlocked: dragging in the frame turns the view (as before)', c1 != c0)
    # lock while it is still gliding: it stops where it is
    x, y = centre(pg, '#rn-frame')
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 160, y, steps=4); pg.mouse.up()
    pg.click('#rn-lock'); pg.wait_for_timeout(150)
    cL = pg.evaluate(CAM); pg.wait_for_timeout(2500)
    s = pg.evaluate(LOCK)
    check('Lock view: pressed, "View locked", the lock shown on the view', s['label'] == 'View locked' and s['pressed'] == 'true' and s['shield'] and s['mark'] and s['framed'], s)
    check('… a glide that was still going stops at once', pg.evaluate(CAM) == cL, (cL, pg.evaluate(CAM)))
    pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    pg.screenshot(path=SHOTS + 'r29-locked-pc.png')
    c2 = pg.evaluate(CAM)
    drag(pg, '#rn-frame', 150, 40); pg.wait_for_timeout(1500)
    check('locked: dragging does not turn it', pg.evaluate(CAM) == c2)
    x, y = centre(pg, '#rn-frame')
    pg.mouse.move(x, y); pg.mouse.wheel(0, -600); pg.wait_for_timeout(1500)
    check('… scrolling does not zoom it', pg.evaluate(CAM) == c2)
    drag(pg, '#rn-frame', 100, 30, button='right'); pg.wait_for_timeout(1500)
    check('… right-dragging does not move it', pg.evaluate(CAM) == c2)
    pg.mouse.dblclick(x, y); pg.wait_for_timeout(2500)
    check('… a double click does not reset it (no home view)', pg.evaluate(CAM) == c2)
    pg.mouse.click(x, y); pg.wait_for_timeout(300)
    s = pg.evaluate(LOCK)
    check('… a click on it says how to move it again, the lock button shows itself', 'locked' in s['hint'] and 'View locked' in s['hint'] and s['nudge'], s)
    pg.wait_for_timeout(2600)
    check('… the message goes again by itself', pg.evaluate(LOCK)['hint'] == '')
    # the shape and the size still change; the view stays
    pick_ratio(pg, '1:1')
    s = pg.evaluate(LOCK)
    check('locked: the shape can still be changed (1:1: a square frame), still locked', abs(s['fw'] - s['fh']) <= 2 and s['pressed'] == 'true' and s['shield'], s)
    cs = pg.evaluate(CAM)
    check('… the camera itself not moved (the same place and target)', cs == c2, (c2, cs))
    pg.click('.rn-res button[data-k="hd"]'); pg.wait_for_timeout(500)
    check('… and the size (HD: 1280 × 1280 at 1:1)', '1280 × 1280' in pg.inner_text('#rn-px'), pg.inner_text('#rn-px'))
    # a render while locked, then Back to the view: still locked, the same view
    pg.click('.rn-method button[data-k="passes"]'); pg.wait_for_timeout(200)
    pg.evaluate("() => { const o = window.__hp.app._renderOpts; o.passes = 2; o.W = 96; o.H = 96; }")
    c3 = pg.evaluate(CAM)
    pg.locator('#rn-start').click()
    wait_done(pg, 400)
    pg.click('#rn-back'); pg.wait_for_timeout(1500)
    s = pg.evaluate(LOCK)
    check('a render while locked, Back to the view: still locked, the same view', s['pressed'] == 'true' and s['shield'] and pg.evaluate(CAM) == c3, s)
    pg.evaluate("() => { const o = window.__hp.app._renderOpts; delete o.W; delete o.H; delete o.passes; }")
    # unlock: it moves again
    pg.click('#rn-lock'); pg.wait_for_timeout(300)
    s = pg.evaluate(LOCK)
    check('"View locked" again: unlocked ("Lock view"), the cover gone', s['label'] == 'Lock view' and s['pressed'] == 'false' and not s['shield'] and not s['framed'], s)
    drag(pg, '#rn-frame', -120); pg.wait_for_timeout(2000)
    check('… dragging turns the view again', pg.evaluate(CAM) != c3)
    pick_ratio(pg, 'view')
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(2000)
    pg.evaluate(OPEN); pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(2000)
    check('opened again: unlocked to start with', pg.evaluate(LOCK)['pressed'] == 'false')
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(2000)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    # (in Dutch: the address chooses the language for this visit)
    b, pg = open_app(p, phone=True, theme='dark')
    pg.goto(BASE + '?lang=nl'); pg.wait_for_timeout(800)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); }"); pg.wait_for_timeout(9000); still(pg)
    pg.evaluate(OPEN)
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(2500)
    bar = pg.evaluate("() => { const r = document.querySelector('#rn-lock').getBoundingClientRect(), s = document.querySelector('.rn-sbar'); return [Math.round(r.height), r.right <= innerWidth, s.scrollWidth <= s.clientWidth + 1]; }")
    check('phone: the lock button in the bar above the preview, big enough to tap, nothing sticks out', bar[0] >= 36 and bar[1] and bar[2], bar)
    nl0 = pg.evaluate(LOCK)['label']
    pg.tap('#rn-lock'); pg.wait_for_timeout(400)
    s = pg.evaluate(LOCK)
    check('phone, in Dutch: "Beeld vergrendelen", tapped – locked: "Beeld vergrendeld"', nl0 == 'Beeld vergrendelen' and s['pressed'] == 'true' and s['label'] == 'Beeld vergrendeld', (nl0, s))
    pg.screenshot(path=SHOTS + 'r29-phone-bar.png')
    cdp = pg.context.new_cdp_session(pg)
    x, y = centre(pg, '#rn-frame')
    c0 = pg.evaluate(CAM)
    SCROLL = "() => { let e = document.querySelector('#rn-frame'), s = 0; while (e) { s += e.scrollTop || 0; e = e.parentElement; } return s; }"
    sc0 = pg.evaluate(SCROLL)
    # a sideways drag, then a pinch: nothing moves
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for k in range(1, 9): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + k * 12, 'y': y}]}); pg.wait_for_timeout(40)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(1500)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x - 30, 'y': y, 'id': 1}, {'x': x + 30, 'y': y, 'id': 2}]})
    for k in range(1, 9): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x - 30 - k * 8, 'y': y, 'id': 1}, {'x': x + 30 + k * 8, 'y': y, 'id': 2}]}); pg.wait_for_timeout(40)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(1500)
    check('phone, locked: dragging and pinching do not move it', pg.evaluate(CAM) == c0)
    # an upward drag scrolls the window to the settings below
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y + 60}]})
    for k in range(1, 11): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y + 60 - k * 18}]}); pg.wait_for_timeout(40)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(1200)
    sc1 = pg.evaluate(SCROLL)
    check('phone, locked: a drag up on the preview scrolls the window (to the settings), the view stays', sc1 > sc0 + 40 and pg.evaluate(CAM) == c0, (sc0, sc1))
    pg.screenshot(path=SHOTS + 'r29-locked-phone.png')
    pg.evaluate("() => { const e = document.querySelector('#rn-lock'); e.scrollIntoView({ block: 'center' }); }"); pg.wait_for_timeout(400)
    pg.tap('#rn-lock'); pg.wait_for_timeout(400)
    x, y = centre(pg, '#rn-frame')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for k in range(1, 9): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + k * 12, 'y': y}]}); pg.wait_for_timeout(40)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(2000)
    check('phone: unlocked – dragging turns it again', pg.evaluate(LOCK)['pressed'] == 'false' and pg.evaluate(CAM) != c0)
    pg.tap('.scrim:last-child .dialog .dlg-foot > button'); pg.wait_for_timeout(2000)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
