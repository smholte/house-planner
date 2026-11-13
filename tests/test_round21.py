"""Twenty-first round (1 Nov, evening): a button for full screen at the top right (like F11) – the app fills the whole
screen, without tabs, address bar or the app window's edge; the button again (or Esc) leaves it. On phones and narrow
windows the top bar is full: ⋯ → Full screen. Search "full screen" / "volledig scherm"; Help knows it; hidden where the
browser can't do it. PC (light) and phone (dark)."""
from common import *

BTN = """() => { const b = document.querySelector('#btn-fullscreen'); const r = b.getBoundingClientRect(), m = document.querySelector('#btn-menu').getBoundingClientRect();
  return { hidden: b.hidden || r.width === 0, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), svg: !!b.querySelector('svg'), right: Math.round(r.right), menuRight: Math.round(m.right), top: Math.round(r.top), w: innerWidth }; }"""
FSEL = "() => [document.fullscreenElement === document.documentElement, document.documentElement.classList.contains('is-fullscreen')]"
MENU = "() => [...document.querySelectorAll('.menu .mi')].map(e => [e.id, e.textContent.trim()])"

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    open_example(pg)
    pg.wait_for_timeout(1500)
    s = pg.evaluate(BTN)
    check('the full-screen button: at the right end of the top bar', not s['hidden'] and s['svg'] and s['right'] > s['menuRight'] and s['w'] - s['right'] < 40 and s['top'] < 30, s)
    check('… it says what it does', s['label'] == 'Full screen' and s['pressed'] == 'false', s)
    pg.click('#btn-fullscreen'); pg.wait_for_timeout(800)
    check('click: the app fills the whole screen', pg.evaluate(FSEL) == [True, True], pg.evaluate(FSEL))
    s = pg.evaluate(BTN)
    check('… the button turns into "Leave full screen"', s['label'] == 'Leave full screen' and s['pressed'] == 'true', s)
    pg.screenshot(path=SHOTS + 'r21-fullscreen.png')
    pg.click('#btn-fullscreen'); pg.wait_for_timeout(800)
    check('click again: back to the window', pg.evaluate(FSEL) == [False, False] and pg.evaluate(BTN)['label'] == 'Full screen', pg.evaluate(FSEL))
    # left another way (Esc does this in a browser): the button follows
    pg.click('#btn-fullscreen'); pg.wait_for_timeout(600)
    pg.evaluate("() => document.exitFullscreen()"); pg.wait_for_timeout(600)
    check('left another way (Esc): the button follows', pg.evaluate(BTN)['label'] == 'Full screen' and pg.evaluate(FSEL) == [False, False], pg.evaluate(BTN))
    # ⋯
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    mi = pg.evaluate(MENU)
    check('⋯ menu: Full screen', ['mi-fullscreen', 'Full screen'] in mi, mi)
    pg.click('#mi-fullscreen'); pg.wait_for_timeout(800)
    check('… it switches it on', pg.evaluate(FSEL)[0])
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    mi = pg.evaluate(MENU)
    check('… and then offers Leave full screen', ['mi-fullscreen', 'Leave full screen'] in mi, mi)
    pg.click('#mi-fullscreen'); pg.wait_for_timeout(800)
    check('… which leaves it', not pg.evaluate(FSEL)[0])
    # Search and Help
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(400)
    pg.fill('#search-q', 'volledig scherm'); pg.wait_for_timeout(300)
    hits = pg.evaluate("() => [...document.querySelectorAll('#search-list .sr-label')].map(e => e.textContent)")
    check('Search "volledig scherm": the action Full screen', 'Full screen' in hits, hits)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.keyboard.press('?'); pg.wait_for_timeout(600)
    check('Help explains the button', 'Full screen' in pg.inner_text('#help-list'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # in Dutch
    # a browser that can't (iPhone Safari): no button, no menu line
    pg.evaluate("() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(document, k, { configurable: true, get: () => false }); window.__hp.app.renderFullscreenBtn(); }")
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    mi = pg.evaluate(MENU)
    check('a browser that can\'t: no button and no menu line', pg.evaluate(BTN)['hidden'] and not any(x[0] == 'mi-fullscreen' for x in mi), mi)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # in Dutch (the app opened in Dutch)
    pg.goto(BASE + '?lang=nl'); pg.wait_for_timeout(3000)
    if pg.is_visible('#btn-example'): open_example(pg)
    pg.wait_for_selector('#btn-fullscreen', state='attached'); pg.wait_for_timeout(1500)
    nl = pg.evaluate(BTN)['label']
    check('in Dutch: "Volledig scherm"', nl == 'Volledig scherm', nl)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.wait_for_timeout(1500)
    check('phone: no button in the full top bar', pg.evaluate(BTN)['hidden'])
    pg.tap('#btn-menu'); pg.wait_for_timeout(400)
    mi = pg.evaluate(MENU)
    check('phone: ⋯ → Full screen', ['mi-fullscreen', 'Full screen'] in mi, mi)
    pg.tap('#mi-fullscreen'); pg.wait_for_timeout(800)
    check('… the app fills the phone\'s screen', pg.evaluate(FSEL)[0])
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'r21-phone-fullscreen.png')
    pg.evaluate("() => document.exitFullscreen()"); pg.wait_for_timeout(500)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
