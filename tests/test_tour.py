"""Routes with stops: stops added while walking (with a text), the route played from stop to stop along the
walking paths (the card shows the text, next / pause), and a walk recorded as a video."""
from common import *

ROUTES = "() => (window.__hp.app.project.walk.routes || []).map(r => ({ id: r.id, name: r.name, stops: r.stops.map(s => ({ x: s.x, y: s.y, text: s.text })) }))"
PUT = """([x, y, yaw]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.yaw = yaw; w.feet = w.groundAt(x, y, w.feet + 1) ?? w.feet; w.updateCamera(); }"""

def stop_here(pg, x, y, yaw, text):
    pg.evaluate(PUT, [x, y, yaw]); pg.wait_for_timeout(300)
    pg.click('#btn-stop-here'); pg.wait_for_selector('#dlg-input')
    pg.fill('#dlg-input', text); pg.click('.dialog .btn.primary'); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b, pg = open_app(p)
    # Fast quality (no shadows, 1 pixel): the software-drawn test browser records a video of the whole house too
    # slowly otherwise (on a real computer Beautiful is fine)
    pg.evaluate("() => window.__hp.Settings.set('quality', 'fast')")
    open_example(pg)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(3000)
    check('walking', pg.evaluate("() => !!window.__hp.app.walker"))
    stop_here(pg, 3.0, 10.5, 0.0, 'The living room: sofa against this wall')
    stop_here(pg, 11.0, 9.0, 1.57, 'Kitchen with the island')
    stop_here(pg, 12.4, 3.5, 3.14, 'Kamer, the new study')
    R = pg.evaluate(ROUTES)
    check('a route with three stops and their texts', len(R) == 1 and [s['text'] for s in R[0]['stops']] == ['The living room: sofa against this wall', 'Kitchen with the island', 'Kamer, the new study'], R)
    pg.click('.route-row button:has-text("Play")'); pg.wait_for_timeout(1500)
    st = pg.evaluate("() => { const T = window.__hp.app.walker.tour; return T && [T.i, T.phase]; }")
    check('playing starts at the first stop', st is not None and st[0] == 0, st)
    # the test browser draws 3D in software at a frame or two a second: walk the route in quick steps here
    # (and hold it there, so the slow test browser doesn't move on while it takes pictures)
    pg.evaluate("() => { const w = window.__hp.app.walker; for (let i = 0; i < 4000; i++) { const T = w.tour; if (!T || (T.i === 1 && T.phase === 'hold')) break; w.tick(0.05); } w.tour.playing = false; window.__hp.app.renderTourCard(); }")
    pg.wait_for_timeout(800)
    pos = pg.evaluate("() => [window.__hp.app.walker.x, window.__hp.app.walker.y, window.__hp.app.walker.yaw]")
    check('it walked to the second stop and looks where the stop looks', near(pos[0], 11.0, 0.05) and near(pos[1], 9.0, 0.05) and near(pos[2] % 6.2832, 1.57, 0.05), pos)
    card = pg.evaluate("() => document.querySelector('.tour-card') && document.querySelector('.tour-card').textContent")
    check('the card shows the stop and its text', card and 'Stop 2 of 3' in card and 'Kitchen with the island' in card, card)
    pg.evaluate(GPU_SYNC); pg.screenshot(path=SHOTS + 'tour-stop.png', timeout=180000)
    pg.click('.tour-card button[aria-label="Play"]'); pg.wait_for_timeout(200)
    on = pg.evaluate("() => window.__hp.app.walker.tour.playing")
    pg.click('.tour-card button[aria-label="Pause"]'); pg.wait_for_timeout(200)
    check('play and pause', on is True and pg.evaluate("() => window.__hp.app.walker.tour.playing") is False)
    pg.click('.tour-card button[aria-label="Next stop"]'); pg.wait_for_timeout(300)
    nx = pg.evaluate("() => [window.__hp.app.walker.tour.i, window.__hp.app.walker.tour.phase]")
    check('next: on the way to stop 3', nx[0] == 2 and nx[1] in ('move', 'turn'), nx)
    pg.click('.tour-card button[aria-label="Stop the route"]'); pg.wait_for_timeout(300)
    check('the route can be stopped', pg.evaluate("() => !window.__hp.app.walker.tour") and not pg.is_visible('.tour-card'))
    # a video of the walk
    if pg.evaluate("() => window.__hp.app.canRecord()"):
        pg.click('#btn-rec'); pg.wait_for_timeout(600)
        check('recording: the button shows the time', pg.is_visible('#btn-rec.rec-on'))
        pg.keyboard.down('w'); pg.wait_for_timeout(1800); pg.keyboard.up('w'); pg.wait_for_timeout(400)
        pg.evaluate(GPU_SYNC)
        # (the software-drawn test browser can take a while before its video encoder gives the first piece of video)
        try: pg.wait_for_function("() => { const r = window.__hp.app.recorder; return !!r && r.chunks.length > 0; }", timeout=120000)
        except Exception: pass
        rec = pg.evaluate("() => { const r = window.__hp.app.recorder; return r && { state: r.mr.state, chunks: r.chunks.length, type: r.type, error: r.error || null, secs: +r.seconds().toFixed(1) }; }")
        logs = []
        pg.on('console', lambda m: logs.append(m.text[:200]))
        # the software-drawn test browser finishes a video slowly (the whole house: minutes)
        try:
            with pg.expect_download(timeout=480000) as dl:
                pg.click('#btn-rec')
            size = os.path.getsize(dl.value.path())
            check('stop: the video is saved', size > 2000 and dl.value.suggested_filename.split('.')[-1] in ('webm', 'mp4'), (dl.value.suggested_filename, size))
        except Exception as e:
            toasts = pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent)")
            check('stop: the video is saved', False, [str(e)[:120], rec, toasts, logs[-5:]])
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    check('the route is kept in the house file', len(json.loads(text)['projects'][0]['project']['walk']['routes'][0]['stops']) == 3)
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
