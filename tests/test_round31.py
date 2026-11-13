"""Thirty-first round (2 Nov, evening): the app's version on the projects page. Under the footer: "App version 31 · 2 Nov
2026 · build …" – the number of the delivered round, its date and the build code (made from the app itself; the same code
the offline copy's cache carries, so after an update you can see which one this device runs). In Dutch "App-versie".
PC (light) and phone (dark, in Dutch)."""
from common import *
import re, os
from urllib.request import urlopen
import datetime
# the version this copy is (src/util.js): the number goes up with every delivered round
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_sp = os.path.join(_root, 'src', 'util.js')
# (a copy of the tests next to dist/ only: the one-file version has it too)
_src = open(_sp if os.path.exists(_sp) else os.path.join(_root, 'dist', 'house-planner.html'), encoding='utf-8').read()
_m = re.search(r"APP_VERSION = \{ n: (\d+), date: '(\d+)-(\d+)-(\d+)'", _src)
VN, VD = _m.group(1), datetime.date(int(_m.group(2)), int(_m.group(3)), int(_m.group(4)))
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][VD.month - 1]
MON_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][VD.month - 1]

VER = """() => { const e = document.querySelector('#app-version'), f = document.querySelector('.home-foot'); if (!e) return null; const r = e.getBoundingClientRect(), rf = f.getBoundingClientRect(), cs = getComputedStyle(e);
  return { text: e.textContent, title: e.title, top: Math.round(r.top), footBottom: Math.round(rf.bottom), left: Math.round(r.left), right: Math.round(r.right), w: innerWidth,
    size: parseFloat(cs.fontSize), visible: !!(e.offsetParent) && r.height > 0, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; }"""

def sw_code():
    txt = urlopen(BASE.replace('index.html', 'sw.js')).read().decode()
    m = re.search(r"'hp-([0-9a-f]{10})'", txt)
    return m.group(1) if m else None

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_selector('#app-version', timeout=60000); pg.wait_for_timeout(800)
    v = pg.evaluate(VER)
    code = sw_code()
    m = re.fullmatch(r'App version (\d+) · (.+) · build ([0-9a-f]{10})', (v or {}).get('text', ''))
    check('the projects page: "App version %s · %d %s %d · build …" under the footer' % (VN, VD.day, MON, VD.year), bool(m) and m.group(1) == VN and m.group(2) in ('%d %s %d' % (VD.day, MON, VD.year), '%s %d, %d' % (MON, VD.day, VD.year)), v)
    check('… the build is the code of this copy (the same as its offline cache: sw.js)', bool(m) and code and m.group(3) == code, (v and v['text'], code))
    check('… small and quiet, below the footer, not covering anything', v and v['visible'] and v['top'] >= v['footBottom'] and v['size'] <= 13 and not v['overflow'], v)
    check('… a tooltip says what it is for (after an update: close and open the app)', v and 'close the app' in v['title'], v and v['title'])
    # the single file carries the same build code
    single = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'house-planner.html')
    if os.path.exists(single):
        sc = re.search(r"APP_VERSION = \{ n: (\d+), date: '([\d-]+)', build: '([0-9a-f]{10})' \}", open(single, encoding='utf-8').read())
        check('the one-file version (house-planner.html) has the same version and build', bool(sc) and sc.group(1) == VN and sc.group(3) == code, sc and sc.groups())
    pg.screenshot(path=SHOTS + 'r31-home-pc.png')
    # opening a house and coming back: still there
    open_example(pg)
    pg.click('#btn-back'); pg.wait_for_timeout(1500)
    check('back on the projects page from a house: the version still shown', (pg.evaluate(VER) or {}).get('text') == v['text'])
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark, in Dutch) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.goto(BASE + '?lang=nl'); pg.wait_for_timeout(1500)
    pg.wait_for_selector('#app-version', timeout=60000); pg.wait_for_timeout(800)
    v = pg.evaluate(VER)
    check('phone, in Dutch: "App-versie %s · %d %s %d · build …"' % (VN, VD.day, MON_NL, VD.year), bool(re.fullmatch(r'App-versie %s · %d %s\.? %d · build [0-9a-f]{10}' % (VN, VD.day, MON_NL, VD.year), v['text'])), v)
    check('phone: it fits the screen (nothing sideways), readable', v['visible'] and v['left'] >= 0 and v['right'] <= v['w'] and not v['overflow'] and v['size'] >= 11, v)
    pg.screenshot(path=SHOTS + 'r31-home-phone.png', full_page=True)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
