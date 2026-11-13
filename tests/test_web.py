"""The web version (dist/web, for a fixed web address): the app with the made-up example house only (task 0008) and
without the owner's house or plot, so nothing about his house is in it; installable (manifest, service worker); a house exported from
the normal app imports into it with everything. Served here on a second port, like a web host would."""
from common import *
import socket, subprocess, atexit, time, tempfile, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'dist', 'web')
PORT = 8766
pr = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=WEB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(pr.terminate)
for _ in range(50):
    with socket.socket() as sk:
        if sk.connect_ex(('127.0.0.1', PORT)) == 0: break
    time.sleep(0.1)
WURL = f'http://localhost:{PORT}/'

html = open(os.path.join(WEB, 'index.html'), encoding='utf-8').read()
files = sorted(os.listdir(WEB))
check('the web folder has the app, manifest, service worker, icons and the instructions', all(f in files for f in ['index.html', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'DEPLOY.md']), files)
# (the words that name the owner's house or its place: below, from house/house.json – not written in this public file)
check('nothing of a house built in (a house fills in the HOUSE hooks of the app)', not re.search(r'Object\.assign\(HOUSE\b|HOUSE\.\w+\s*=[^=]', html))
import gzip, base64
m = re.search(r"EXAMPLE_HOUSE = \{ projectGz: '([^']+)'", html)
ex_p = json.loads(gzip.decompress(base64.b64decode(m.group(1)))) if m else {}
check('exactly one example house in it, the made-up one', html.count('EXAMPLE_HOUSE = {') == 1 and ex_p.get('id') == 'p_example_testhouse' and ex_p.get('name') == 'Testhuis (made-up example)', [html.count('EXAMPLE_HOUSE = {'), ex_p.get('name')])
check('the web zip is there', os.path.exists(os.path.join(ROOT, 'dist', 'house-planner-web.zip')))
# the words of the owner's house: house/house.json "secret" (only in the private repository) and the lines of
# HP_SECRET_WORDS (on GitHub: the public repository's secret HOUSE_WORDS) – the list itself is never written in a public file
hj = os.path.join(ROOT, 'house', 'house.json')
secret = json.load(open(hj, encoding='utf-8')).get('secret', []) if os.path.exists(hj) else []
secret += [w.strip() for w in os.environ.get('HP_SECRET_WORDS', '').splitlines() if w.strip()]
if secret:
    web_all = html + open(os.path.join(WEB, 'DEPLOY.md'), encoding='utf-8').read() + open(os.path.join(WEB, 'sw.js'), encoding='utf-8').read()
    check('none of the house\'s own words in the web version', not [w for w in secret if w in web_all], [w for w in secret if w in web_all])
else:
    print('NOTE the house\'s own words are not known here (no house/house.json, no HP_SECRET_WORDS): that check is skipped')

tmp = tempfile.mkdtemp()
with sync_playwright() as p:
    # a house file from the normal app
    b, pg = open_app(p)
    open_example(pg)
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], true)")
    name = pg.evaluate("() => window.__hp.app.project.name")
    b.close()
    f1 = os.path.join(tmp, 'house.house.json'); open(f1, 'w').write(text)

    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, accept_downloads=True)
    pg = ctx.new_page(); pg.errors = []; pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.goto(WURL); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__hp.Settings.set('ao', false)")
    check('the web version starts on the home screen with the example button and the words about the made-up house', pg.is_visible('#btn-new') and pg.is_visible('#btn-example') and 'made-up house' in pg.inner_text('#intro-example'))
    sw = pg.evaluate("async () => { try { const r = await navigator.serviceWorker.ready; return !!r.active; } catch (e) { return String(e); } }")
    check('it can be installed and works offline (service worker active)', sw is True, sw)
    check('no plot of the owner\'s house inside', pg.evaluate("() => { try { return document.documentElement.innerHTML.includes('134.3') ? 'north' : 'ok'; } catch (e) { return 'err'; } }") == 'ok')
    # the Example button opens the made-up house (owner, 12 Nov), as the owner's app opens his
    pg.tap('#btn-example')
    pg.wait_for_function("() => window.__hp.app.project && /made-up/.test(window.__hp.app.project.name)", timeout=60000)
    ex = pg.evaluate("() => { const p = window.__hp.app.project; return [p.name, p.versions.length]; }")
    check('the web version\'s example is the made-up house', ex[0] == 'Testhuis (made-up example)' and ex[1] >= 2, ex)
    pg.screenshot(path=SHOTS + 'web-phone-example.png')
    pg.evaluate("() => window.__hp.app.showHome()"); pg.wait_for_timeout(1500)
    pg.wait_for_selector('#btn-import', state='visible')
    with pg.expect_file_chooser() as fc:
        pg.tap('#btn-import')
    fc.value.set_files(f1); pg.wait_for_timeout(6000)
    got = pg.evaluate("() => { const p = window.__hp.app.project; return p && [p.name, p.versions.length, !!p.site, !!window.__hp.app.shell]; }")
    check('a house file from the normal app opens in the web version, with its plot and 3D shell', got and got[0] == name and got[1] >= 3 and got[2] and got[3], got)
    pg.screenshot(path=SHOTS + 'web-phone.png')
    # the garden tool offers only "a plot around the house" here
    pg.evaluate("() => { const a = window.__hp.app; a.mutate(p => { p.site = null; }, { project: true }); a.setTool('garden'); }"); pg.wait_for_timeout(800)
    check('the garden tool has no “Plot of …” button of a built-in house', not pg.evaluate("() => [...document.querySelectorAll('button')].some(b => /^Plot of /.test(b.textContent.trim()))") and pg.is_visible('#g-make-plot'))
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
