"""Quick wins (task 0019): I4 the storage line (protected or not, asked again when a house is opened), I5 "Exported …"
on the project cards (kept apart from the house), I6 the update bar (two builds: version N → N+1, Restart reloads once,
the open house intact), I7 the feedback button (two files), U1 the phone top bar (the open version's name readable at
360 and 390 px, Build / Furnish / View named, every button named), U5 small fixes (⋯ with headings and Photo render,
nothing left in English in Dutch and Norwegian, one date formatter, the last house opens at start). PC light and phone dark."""
from common import *
import os, re, shutil, tempfile, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(os.path.dirname(HERE), 'dist', 'house-planner-app')

# the browser's storage promise, by hand: protected or not, and how often the app asked
PERSIST_JS = os.path.join(tempfile.mkdtemp(), 'persist.js')
open(PERSIST_JS, 'w').write("""window.__persisted = false; window.__persistCalls = 0;
Object.defineProperty(navigator.storage, 'persisted', { value: async () => window.__persisted, configurable: true });
Object.defineProperty(navigator.storage, 'persist', { value: async () => { window.__persistCalls++; return window.__persisted; }, configurable: true });""")

def home_text(pg): return pg.evaluate("() => document.body.innerText")
def to_home(pg):
    pg.click('#btn-back'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_function("() => !window.__hp.app.project && document.querySelectorAll('.pcard').length >= 1"); pg.wait_for_timeout(300)
def menu(pg, item=None):
    if pg.locator('.menu').count(): pg.click('#btn-menu'); pg.wait_for_timeout(300)      # still open from before: pressing ⋯ again closes it
    pg.click('#btn-menu')
    try: pg.wait_for_selector('.menu .mi', timeout=8000)
    except Exception:
        pg.screenshot(path=SHOTS + 'quickwins_menu_fail.png'); print('menu state', pg.evaluate("() => [document.querySelectorAll('.menu').length, !!window.__hp.app.project, document.querySelectorAll('.scrim,.dialog').length, document.getElementById('btn-menu').getAttribute('aria-expanded')]")); raise
    if item: pg.click(item)
def reopen(pg):
    pg.wait_for_timeout(700)    # the settings are saved a moment after a change
    pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app", timeout=30000); pg.wait_for_timeout(2500)
def has_project(pg): return pg.evaluate("() => !!window.__hp.app.project")

def run(phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    b, pg = open_app(p, phone=phone, theme=theme, init=[PERSIST_JS])
    # ───── I4 the storage line ─────
    pg.wait_for_function("() => document.querySelector('#storage-note .txt').textContent.length > 12"); pg.wait_for_timeout(300)
    note = pg.inner_text('#storage-note')
    check(f'[{tag}] storage not granted: “Not protected – export a copy now and then” with an Export button', 'Not protected' in note and 'export a copy' in note and pg.locator('#storage-note .sn-export').count() == 1, note)
    pg.click('#btn-new'); pg.wait_for_timeout(400)
    pg.fill('.dialog input', 'Quick test'); pg.click('.dialog .btn.primary'); pg.wait_for_function("() => window.__hp.app.project", timeout=30000); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__hp.app.addWall([0, 0], [6, 0], 0.3, 'exterior')"); pg.wait_for_timeout(900)
    calls = pg.evaluate("() => window.__persistCalls")
    check(f'[{tag}] the app asks the browser to keep the storage when a house is opened', calls >= 1, calls)
    pg.evaluate("() => { window.__persisted = true; }")
    to_home(pg)
    note = pg.inner_text('#storage-note')
    check(f'[{tag}] storage granted: “Protected on this device”, no Export button', 'Protected on this device' in note and 'Not protected' not in note and pg.locator('#storage-note .sn-export').count() == 0, note)
    pg.evaluate("() => { window.__persisted = false; }"); pg.evaluate("() => window.__hp.app.renderStorageNote()"); pg.wait_for_timeout(400)

    # ───── I5 Exported … ─────
    card = pg.inner_text('.pcard')
    check(f'[{tag}] a house never exported: “Never exported” on its card', 'Never exported' in card, card)
    before = pg.evaluate("""async () => { const a = window.__hp.app; const ps = await window.__hp.DB.all('projects'); return JSON.parse(await a.buildExport([ps[0]], true)).projects; }""")
    pg.click('.pcard .pcard-actions .btn:not(.primary):not(.icon)'); pg.wait_for_selector('.dialog'); pg.wait_for_timeout(500)
    with pg.expect_download() as dl:
        pg.click('.dialog .dlg-foot .btn:has-text("Save file")')
    pg.wait_for_timeout(1200)
    card = pg.inner_text('.pcard')
    check(f'[{tag}] after Save file: “Exported just now”', re.search(r'Exported (just now|\d+ s ago|\d+ min ago)', card) is not None, card)
    after = pg.evaluate("""async () => { const a = window.__hp.app; const ps = await window.__hp.DB.all('projects'); return JSON.parse(await a.buildExport([ps[0]], true)).projects; }""")
    check(f'[{tag}] the exported house is the same as before the note (nothing about it in the house)', json.dumps(before, sort_keys=True) == json.dumps(after, sort_keys=True))
    pg.evaluate("""() => { const a = window.__hp.app; a.settings.exported = { [a.settings.lastProject]: Date.now() - 12 * 864e5 }; window.__hp.Settings.save(); }""")
    reopen(pg)
    to_home(pg)
    card = pg.inner_text('.pcard')
    check(f'[{tag}] “Exported 12 days ago”, kept after a restart', 'Exported 12 days ago' in card, card)
    check(f'[{tag}] “Changed …” on the card', re.search(r'Changed (just now|\d+ (s|min|h) ago)', card) is not None, card)
    pg.screenshot(path=SHOTS + f'quickwins_home_{"phone" if phone else "pc"}.png')

    # ───── U5 the last house opens at start; Back reaches the projects page; a Settings switch ─────
    pg.click('.pcard .pcard-actions .btn.primary'); pg.wait_for_function("() => window.__hp.app.project"); pg.wait_for_timeout(1200)
    to_home(pg)
    reopen(pg)
    check(f'[{tag}] after Back and a restart the last house opens by itself', has_project(pg) and pg.evaluate("() => window.__hp.app.project.name") == 'Quick test')
    to_home(pg)
    check(f'[{tag}] Back reaches the projects page', pg.locator('.pcard').count() >= 1 and not has_project(pg), (pg.locator('.pcard').count(), has_project(pg)))
    pg.click('.pcard .pcard-actions .btn.primary'); pg.wait_for_function("() => window.__hp.app.project"); pg.wait_for_timeout(800)
    menu(pg, '.menu .mi:has-text("Settings")'); pg.wait_for_selector('#set-openlast')
    check(f'[{tag}] Settings: “Open the last house” is on by default', pg.is_checked('#set-openlast'))
    st = pg.inner_text('#set-storage-text')
    check(f'[{tag}] Settings: the storage paragraph says not protected', 'Not protected' in st, st)
    pg.uncheck('#set-openlast'); pg.click('.dialog .dlg-foot .btn.primary'); pg.wait_for_timeout(400)
    to_home(pg)
    reopen(pg)
    check(f'[{tag}] switched off: the app starts on the projects page', not has_project(pg) and pg.is_visible('#home'))
    pg.evaluate("() => window.__hp.Settings.set('openLast', true)")
    pg.click('.pcard .pcard-actions .btn.primary'); pg.wait_for_function("() => window.__hp.app.project"); pg.wait_for_timeout(1000)

    # ───── U5 ⋯ with headings, Photo render in it ─────
    pg.click('#btn-menu'); pg.wait_for_selector('.menu .mi')
    heads = pg.evaluate("() => [...document.querySelectorAll('.menu .mhead')].map(e => e.textContent)")
    check(f'[{tag}] ⋯ has headings: This version · Save and share · Lists · House · App', heads == ['This version', 'Save and share', 'Lists', 'House', 'App'], heads)
    items = pg.evaluate("() => [...document.querySelectorAll('.menu .mi, .menu .mhead')].map(e => e.textContent.trim())")
    check(f'[{tag}] ⋯: Photo render… and Export this house… under “Save and share”, Send feedback… under “App”',
          'Photo render…' in items and items.index('Save and share') < items.index('Export this house…') < items.index('Lists') and items.index('Send feedback…') > items.index('App'), items)
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    check(f'[{tag}] ⋯ closes when pressed again', pg.locator('.menu').count() == 0)

    # ───── I7 feedback ─────
    pg.evaluate("() => setTimeout(() => { throw new Error('boom-test-error'); }, 0)"); pg.wait_for_timeout(300)
    pg.errors = [e for e in pg.errors if 'boom-test-error' not in e]
    got = []
    pg.on('download', lambda d: got.append(d))
    menu(pg, '#mi-feedback'); pg.wait_for_selector('#fb-text')
    check(f'[{tag}] the feedback sheet: a text field and “Add a picture of the view” (on)', pg.is_checked('#fb-pic'))
    pg.fill('#fb-text', 'The wall tool is hard to hit on my phone.')
    pg.click('.dialog .dlg-foot .btn.primary')
    pg.wait_for_function("() => window.__hp.app._lastFeedback", timeout=30000); pg.wait_for_timeout(1500)
    names = sorted(d.suggested_filename for d in got)
    check(f'[{tag}] two files: feedback-<date-time>.png and .txt', len(names) == 2 and re.fullmatch(r'feedback-\d{8}-\d{6}\.png', names[0]) and re.fullmatch(r'feedback-\d{8}-\d{6}\.txt', names[1]), names)
    txt = next(open(d.path(), encoding='utf-8').read() for d in got if d.suggested_filename.endswith('.txt'))
    png = next(open(d.path(), 'rb').read() for d in got if d.suggested_filename.endswith('.png'))
    for what, ok in [('his words', 'hard to hit on my phone' in txt), ('the app version', re.search(r'app: version \d+ \(\d{4}-\d\d-\d\d\)', txt) is not None),
                     ('the device', 'device: Mozilla' in txt and 'touch ' in txt), ('language and theme', 'language: en' in txt and 'theme:' in txt),
                     ('mode, storey and version', 'mode: build' in txt and 'storey:' in txt and 'version open:' in txt), ('the view', 'view: 2D' in txt),
                     ('the page errors', 'boom-test-error' in txt)]:
        check(f'[{tag}] the text holds {what}', ok, txt)
    check(f'[{tag}] the text holds no house data (no walls, no project name)', 'Quick test' not in txt and '"walls"' not in txt)
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(png)); ext = im.convert('L').getextrema()
    check(f'[{tag}] the picture is a real picture of the view (not empty)', png[:8] == b'\x89PNG\r\n\x1a\n' and im.width > 200 and im.height > 100 and ext[0] != ext[1], (im.size, ext))
    # in Help too
    pg.keyboard.press('?'); pg.wait_for_timeout(500)
    if pg.locator('#help-feedback').count() == 0:
        pg.click('#btn-menu'); pg.click('.menu .mi:has-text("Help")'); pg.wait_for_timeout(500)
    check(f'[{tag}] Help has a Send feedback button', pg.locator('#help-feedback').count() == 1)
    pg.click('#help-close'); pg.wait_for_timeout(300)

    # ───── U1 the top bar ─────
    pg.evaluate("() => { const a = window.__hp.app; a.createVersionFrom(a.project.versions[0].id, 'Plan – Bigger kitchen'); }"); pg.wait_for_timeout(800)
    if phone:
        for w in (360, 390):
            pg.set_viewport_size({'width': w, 'height': 780}); pg.wait_for_timeout(600)
            r = pg.evaluate("""() => { const q = s => document.querySelector(s), R = e => e.getBoundingClientRect();
              const pill = q('#btn-version'), nm = q('#btn-version .vp-name'), ms = q('#mode-switch');
              const cut = nm.scrollHeight > nm.clientHeight + 1 || nm.scrollWidth > nm.clientWidth + 1;
              const top = [...document.querySelectorAll('.topbar button')].filter(b => R(b).width > 0 && getComputedStyle(b).visibility !== 'hidden').map(b => ({ id: b.id, name: b.getAttribute('aria-label') || b.title || b.textContent.trim(), r: R(b) }));
              const hscroll = document.documentElement.scrollWidth > innerWidth + 1;
              return { cut, pillW: R(pill).width, nameW: R(nm).width, nameText: nm.textContent, pillRight: R(pill).right, msLeft: R(ms).left, shareVisible: R(q('#btn-share')).width > 0,
                modes: [...ms.querySelectorAll('button')].map(b => [b.textContent.trim(), R(b.querySelector('span')).width > 8]), unnamed: top.filter(x => !x.name).map(x => x.id), hscroll, right: Math.max(...top.map(x => x.r.right)) }; }""")
            check(f'[{tag}] {w} px: the open version’s name “{r["nameText"]}” is shown whole ({r["nameW"]:.0f} px wide, three lines at most)', not r['cut'] and r['nameW'] >= 70 and r['nameText'] == 'Plan – Bigger kitchen' and r['pillRight'] <= r['msLeft'] + 1 and len(r['nameText']) > 2, r)
            check(f'[{tag}] {w} px: Build, Furnish and View show their names', all(ok for _, ok in r['modes']) and [n for n, _ in r['modes']] == ['Build', 'Furnish', 'View'], r['modes'])
            check(f'[{tag}] {w} px: every top-bar button has a name, nothing sticks out', not r['unnamed'] and r['right'] <= w + 1 and not r['hscroll'], r)
            check(f'[{tag}] {w} px: Export is in ⋯, not in the bar', not r['shareVisible'])
            pg.screenshot(path=SHOTS + f'quickwins_topbar_{w}.png', clip={'x': 0, 'y': 0, 'width': w, 'height': 120})
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(400)
    else:
        r = pg.evaluate("() => { const q = document.querySelector('#btn-share'); return [q.getBoundingClientRect().width > 0, q.getAttribute('aria-label'), q.textContent.trim()]; }")
        check(f'[{tag}] PC: the Export button stays in the bar, with its name', r[0] and r[1] == 'Export' and 'Export' in r[2], r)

    # ───── Dutch and Norwegian: nothing left in English ─────
    pg.evaluate("""() => { const a = window.__hp.app; a.settings.exported = { [a.project.id]: Date.now() - 12 * 864e5 }; window.__hp.Settings.save(); }""")
    for lang, words, heads in [('nl', ['Gewijzigd', 'Geëxporteerd 12 dagen geleden', 'Niet beschermd'], ['Deze versie', 'Bewaren en delen', 'Lijsten', 'Huis', 'App']),
                               ('no', ['Endret', 'Eksportert 12 dager siden', 'Ikke beskyttet'], ['Denne versjonen', 'Lagre og dele', 'Lister', 'Hus', 'App'])]:
        pg.evaluate("(l) => window.__hp.Settings.set('lang', l)", lang); reopen(pg)
        pg.wait_for_timeout(500)
        # the version card in the details, the Versions list, the ⋯ menu
        pg.evaluate("() => { const a = window.__hp.app; a.selection = null; a.renderInspector(); }"); pg.wait_for_timeout(500)
        insp = pg.evaluate("() => document.body.innerText")
        check(f'[{tag}] {lang}: the version card in the details: “Changed …” translated ({words[0]})', words[0] in insp and not re.search(r'\bChanged\b', insp), re.findall(r'.{20}Chang.{20}', insp)[:3])
        pg.click('#btn-menu'); pg.wait_for_selector('.menu .mhead')
        hs = pg.evaluate("() => [...document.querySelectorAll('.menu .mhead')].map(e => e.textContent)")
        mt = pg.evaluate("() => document.querySelector('.menu').innerText")
        check(f'[{tag}] {lang}: ⋯ headings {heads}', hs == heads, hs)
        check(f'[{tag}] {lang}: ⋯ has nothing from the new texts left in English', not re.search(r'Send feedback|Export this house|Photo render…|Save and share', mt), mt)
        pg.keyboard.press('Escape')
        pg.click('#btn-version'); pg.wait_for_selector('.dialog, .sheet, .lr-sub'); pg.wait_for_timeout(500)
        vt = pg.evaluate("() => document.body.innerText")
        check(f'[{tag}] {lang}: the Versions list: “Changed …” translated', words[0] in vt and not re.search(r'\bChanged\b', vt), re.findall(r'.{20}Chang.{20}', vt)[:3])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        if pg.locator('.dialog').count(): pg.click('.dialog .dlg-foot .btn >> nth=-1'); pg.wait_for_timeout(300)
        to_home(pg)
        ht = home_text(pg)
        check(f'[{tag}] {lang}: the projects page: “{words[1]}”, “{words[2]}”, “Changed …”, no English left of the new lines',
              words[1] in ht and words[2] in ht and words[0] in ht and not re.search(r'\bChanged\b|Exported|Never exported|Protected|Export a copy|\bused\b', ht), ht)
        pg.click('.pcard .pcard-actions .btn.primary'); pg.wait_for_function("() => window.__hp.app.project"); pg.wait_for_timeout(800)
        menu(pg, '.menu .mi >> nth=-2'); pg.wait_for_selector('#set-openlast')
        sett = pg.evaluate("() => document.querySelector('.dialog').innerText")
        check(f'[{tag}] {lang}: Settings: the storage and start texts are translated', not re.search(r'Not protected|Protected on|Open the last house|Using |Ask to protect|The list of houses', sett), sett[:400])
        pg.click('.dialog .dlg-foot .btn.primary'); pg.wait_for_timeout(300)
        menu(pg, '#mi-feedback'); pg.wait_for_selector('#fb-text')
        fb = pg.evaluate("() => document.querySelector('.dialog').innerText + ' ' + document.querySelector('#fb-text').placeholder")
        check(f'[{tag}] {lang}: the feedback sheet is translated', not re.search(r'Your feedback|Add a picture|Two files|What went wrong|Send feedback', fb), fb)
        pg.click('.dialog .dlg-foot .btn >> nth=0'); pg.wait_for_timeout(300)
        pg.keyboard.press('?'); pg.wait_for_timeout(500)
        ht2 = pg.evaluate("() => (document.querySelector('#help-list') || document.body).innerText")
        check(f'[{tag}] {lang}: the Help line of the View-options button is translated', 'What to show' not in ht2 and 'photo render' not in ht2, ht2[:300])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => window.__hp.Settings.set('lang', 'en')"); reopen(pg)

    # ───── one date formatter per language ─────
    r = pg.evaluate("""() => { const f = window.__hp.fmtDate, ts = Date.UTC(2026, 2, 3, 12), A = f(ts, false); window.__hp.setLang('nl'); const B = f(ts, false); window.__hp.setLang('en'); return [A, B, f(ts, false), f(ts, true)]; }""")
    check(f'[{tag}] dates follow the language and come from one formatter: {r}', r[0] != r[1] and r[0] == r[2] and ':' in r[3], r)
    check(f'[{tag}] no page error', not pg.errors, pg.errors)
    b.close()

# ───── I6 the update bar: two builds of the app, N then N+1 ─────
def update_bar(phone, theme):
    tag = 'phone dark' if phone else 'PC light'
    base = tempfile.mkdtemp()
    A = os.path.join(base, 'a'); B = os.path.join(base, 'b')
    shutil.copytree(DIST, A, symlinks=True)
    os.makedirs(B)
    for n in os.listdir(A):
        if n not in ('index.html', 'sw.js'): os.symlink(os.path.join(A, n), os.path.join(B, n))
    html = open(os.path.join(A, 'index.html'), encoding='utf-8').read()
    m = re.search(r"APP_VERSION = \{ n: (\d+),", html); n0 = int(m.group(1))
    open(os.path.join(B, 'index.html'), 'w', encoding='utf-8').write(html.replace(m.group(0), f'APP_VERSION = {{ n: {n0 + 1},', 1))
    sw = open(os.path.join(A, 'sw.js'), encoding='utf-8').read()
    open(os.path.join(B, 'sw.js'), 'w', encoding='utf-8').write(re.sub(r"const CACHE = 'hp-([^']*)'", r"const CACHE = 'hp-\1-next'", sw))
    root = [A]
    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=root[0], **k)
        def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
        def log_message(self, *a): pass
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        b = p.chromium.launch(args=GL)
        ctx = b.new_context(**({'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True} if phone else {'viewport': {'width': 1280, 'height': 800}}), color_scheme=theme)
        pg = ctx.new_page(); pg.set_default_timeout(90000); pg.errors = []
        pg.on('pageerror', lambda e: pg.errors.append(str(e)))
        loads = []
        pg.on('load', lambda: loads.append(1))
        pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_function("() => window.__hp && window.__hp.app", timeout=30000)
        pg.wait_for_function("() => navigator.serviceWorker.controller", timeout=30000)
        pg.evaluate("() => window.__hp.Settings.set('ao', false)")
        pg.click('#btn-new'); pg.wait_for_timeout(400)
        pg.fill('.dialog input', 'Update test'); pg.click('.dialog .btn.primary'); pg.wait_for_function("() => window.__hp.app.project", timeout=30000); pg.wait_for_timeout(1200)
        pg.evaluate("() => window.__hp.app.addWall([0, 0], [5, 0], 0.3, 'exterior')"); pg.wait_for_timeout(500)
        check(f'[{tag}] update: no bar while the version is the newest', pg.locator('#update-bar').count() == 0)
        ver = lambda: pg.evaluate("() => fetch('index.html').then(r => r.text()).then(t => +/APP_VERSION = \\{ n: (\\d+)/.exec(t)[1])")
        check(f'[{tag}] update: the open build is version {n0}', ver() == n0, ver())
        root[0] = B      # version N+1 is put online
        pg.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))"); pg.evaluate("() => navigator.serviceWorker.getRegistration().then(r => r.update())")
        pg.wait_for_selector('#update-bar', timeout=30000)
        check(f'[{tag}] update: “A new version is ready – Restart” appears (the open version keeps running: still {n0})', 'new version is ready' in pg.inner_text('#update-bar') and pg.locator('#update-restart').count() == 1, pg.inner_text('#update-bar'))
        check(f'[{tag}] update: the new version waits (not taken over by itself)', pg.evaluate("() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting)"))
        pg.evaluate("() => window.__hp.app.addWall([0, 2], [5, 2], 0.3, 'exterior')")     # an edit that is not saved yet
        n_walls = pg.evaluate("() => window.__hp.app.project.versions[0].plan.walls.length")
        loads.clear()
        pg.click('#update-restart')
        pg.wait_for_function("() => navigator.serviceWorker.controller && !document.getElementById('update-bar')", timeout=30000)
        pg.wait_for_function("() => window.__hp && window.__hp.app && window.__hp.app.project", timeout=30000); pg.wait_for_timeout(2500)
        check(f'[{tag}] update: Restart reloads once', len(loads) == 1, len(loads))
        pg.evaluate("() => document.getElementById('update-bar')")
        got = pg.evaluate("() => fetch('index.html').then(r => r.text()).then(t => +/APP_VERSION = \\{ n: (\\d+)/.exec(t)[1])")
        running = pg.evaluate("() => caches.keys()")
        check(f'[{tag}] update: after Restart the page runs version {n0 + 1} (caches {running})', got == n0 + 1 and any(k.endswith('-next') for k in running) and not any(not k.endswith('-next') for k in running), (got, running))
        check(f'[{tag}] update: the open house is intact – the unsaved edit too ({n_walls} walls)',
              pg.evaluate("() => window.__hp.app.project.name") == 'Update test' and pg.evaluate("() => window.__hp.app.project.versions[0].plan.walls.length") == n_walls, n_walls)
        pg.click('#btn-back'); pg.wait_for_selector('#home:not([hidden])'); pg.wait_for_timeout(500)
        check(f'[{tag}] update: the projects page shows “App version {n0 + 1}”', f'App version {n0 + 1}' in pg.inner_text('#app-version'), pg.inner_text('#app-version'))
        keys = pg.evaluate("() => caches.keys().then(async ks => { const c = await caches.open(ks[0]); return (await c.keys()).map(r => new URL(r.url).pathname); })")
        check(f'[{tag}] the page is cached once (./ and ./index.html were two copies)', keys.count('/') == 0 and keys.count('/index.html') == 1, keys)
        check(f'[{tag}] update: no page error', not pg.errors, pg.errors)
        b.close()
    finally:
        srv.shutdown(); shutil.rmtree(base, ignore_errors=True)

with sync_playwright() as p:
    run(False, 'light')
    run(True, 'dark')
    update_bar(False, 'light')
    update_bar(True, 'dark')
sys.exit(summary())
