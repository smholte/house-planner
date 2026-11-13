"""Twenty-fifth round (1 Nov, night): the render window shows the 3D view itself, and you frame the photo in it. Its
picture is lent to the window's frame (the pane keeps a still copy): turn, zoom and move there as in the view; a tap
picks nothing. The frame's shape inside the preview (As the view, 16:9, 3:2, 4:3, 1:1, 4:5, 2:3, 9:16 – or drag its
edges for a shape of your own), the size in pixels underneath (HD, Full HD, 2K, 4K – a phone up to 2K), how, the
samples (with the time they take on this device, once it has rendered here), the light, then Start render (at the
bottom). When it is done: Save picture, Continue (as many samples again on the same picture), Back to the view, the
same view in another version. The settings are kept for next time. PC (light) and phone (dark)."""
from common import *
import json

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V = "window.__hp.app.panes.find(p => p.kind === '3d').view"
OPEN = "() => { window.__hp.app.renderSheet(); }"
LIVE = """() => { const v = %s, f = document.querySelector('#rn-frame'), r = f.getBoundingClientRect(), c = f.querySelector('canvas.gl');
  return { own: c === v.renderer.domElement, still: !!document.querySelector('.pane .gl-still'), rendering: !!v.rendering, img: !!document.querySelector('#rn-shot img'),
    fw: r.width, fh: r.height, aspect: v.camera.aspect, W: v.W, H: v.H, px: (document.querySelector('#rn-px') || {}).textContent, ratio: (document.querySelector('#rn-ratio') || {}).textContent,
    hint: document.querySelector('#rn-hint').hidden ? '' : document.querySelector('#rn-hint').textContent }; }""" % V
RES = "() => [...document.querySelectorAll('.rn-res button')].map(b => [b.dataset.k, b.querySelector('small').textContent, b.getAttribute('aria-pressed')])"
STATUS = "() => document.querySelector('#rn-status').textContent"
CAM = "() => %s.cameraState()" % V
# a small grey picture of what the frame shows now (drawn and copied at once), or of the picture shown
GRID_VIEW = """() => { const v = %s, r = v.renderer; r.render(v.scene, v.camera); const c = document.createElement('canvas'); c.width = 48; c.height = 27;
  const g = c.getContext('2d'); g.drawImage(r.domElement, 0, 0, 48, 27); const d = g.getImageData(0, 0, 48, 27).data, o = []; for (let i = 0; i < d.length; i += 4) o.push(d[i] + d[i + 1] + d[i + 2]); return o; }""" % V
GRID_SHOT = """() => new Promise(res => { const im = document.querySelector('#rn-shot img'), go = () => { const c = document.createElement('canvas'); c.width = 48; c.height = 27; const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 48, 27); const d = g.getImageData(0, 0, 48, 27).data, o = []; for (let i = 0; i < d.length; i += 4) o.push(d[i] + d[i + 1] + d[i + 2]); res([o, im.naturalWidth, im.naturalHeight]); };
  if (im.complete && im.naturalWidth) go(); else im.onload = go; })"""

def corr(a, b):
    n = len(a); ma = sum(a) / n; mb = sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b)); sa = sum((x - ma) ** 2 for x in a) ** 0.5; sb = sum((y - mb) ** 2 for y in b) ** 0.5
    return sab / (sa * sb) if sa and sb else 0

def wait_done(pg, secs=600):
    pg.wait_for_function("() => document.querySelector('#rn-start') && !document.querySelector('#rn-stop') && /in \\d+ s/.test(document.querySelector('#rn-status').textContent)", timeout=secs * 1000)
    pg.wait_for_timeout(400)
    return pg.evaluate(STATUS)

def drag(pg, sel, dx, dy=0):
    pg.locator(sel).scroll_into_view_if_needed()
    bx = pg.locator(sel).bounding_box()
    x, y = bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + dx, y + dy, steps=10); pg.mouse.up()

def pick_ratio(pg, k):
    pg.click('#rn-ratio'); pg.wait_for_timeout(300)
    pg.click('#rn-ratio-' + k.replace(':', '-')); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.settings.light = 'day'; }"); pg.wait_for_timeout(9000); still(pg)
    before = pg.evaluate("() => { const v = %s; return { W: v.W, H: v.H, aspect: v.camera.aspect, cam: v.cameraState() }; }" % V)
    pg.evaluate(OPEN)
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(2500)
    s = pg.evaluate(LIVE)
    check('the window shows the 3D view itself (its own picture, lent to the frame; a still copy stays in the pane)', s['own'] and s['still'] and not s['rendering'] and not s['img'], s)
    r0 = before['W'] / before['H']
    check('… framed "As the view": the frame and the camera in the view\'s shape', s['ratio'].strip().startswith('As the view') and abs(s['fw'] / s['fh'] - r0) < 0.02 and abs(s['aspect'] - s['fw'] / s['fh']) < 0.01, (s, r0))
    dims = pg.evaluate("(r) => window.__hp.renderDims(1920, r)", r0)
    check('… the size it will be, in pixels (Full HD on a computer, in that shape)', s['px'] == f"{dims[0]} × {dims[1]} pixels", (s['px'], dims))
    check('… how to move it, in the frame', 'Drag to turn' in s['hint'] and 'scroll to zoom' in s['hint'], s['hint'])
    pg.screenshot(path=SHOTS + 'r25-live.png')
    # moving in the frame
    c0 = pg.evaluate(CAM)
    drag(pg, '#rn-frame', 140); pg.wait_for_timeout(2000)
    c1 = pg.evaluate(CAM)
    check('drag in the frame: the view turns (the camera moved)', c1 != c0 and c1['target'] == c0['target'], (c0, c1))
    bx = pg.locator('#rn-frame').bounding_box()
    pg.mouse.click(bx['x'] + bx['width'] * 0.5, bx['y'] + bx['height'] * 0.6); pg.wait_for_timeout(1500)
    check('… a tap picks nothing (no room selected, the window stays)', pg.evaluate("() => window.__hp.app.selection") is None and pg.locator('#rn-frame').count() == 1 and pg.evaluate(LIVE)['hint'] == '')
    # the shape
    pg.click('#rn-ratio'); pg.wait_for_timeout(300)
    menu = pg.evaluate("() => [...document.querySelectorAll('.menu .mi')].map(e => e.id)")
    check('the shape, in the preview: As the view, 16:9, 3:2, 4:3, 1:1, 4:5, 2:3, 9:16', menu == ['rn-ratio-view', 'rn-ratio-16-9', 'rn-ratio-3-2', 'rn-ratio-4-3', 'rn-ratio-1-1', 'rn-ratio-4-5', 'rn-ratio-2-3', 'rn-ratio-9-16'], menu)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pick_ratio(pg, '16:9')
    s = pg.evaluate(LIVE)
    check('16:9: the frame and the camera wide, 1920 × 1080', abs(s['fw'] / s['fh'] - 16 / 9) < 0.02 and abs(s['aspect'] - 16 / 9) < 0.02 and s['px'] == '1920 × 1080 pixels' and s['ratio'].strip().startswith('16:9'), s)
    res = pg.evaluate(RES)
    check('the size underneath: HD, Full HD, 2K, 4K with their pixels in this shape', [x[:2] for x in res] == [['hd', '1280 × 720'], ['fhd', '1920 × 1080'], ['2k', '2560 × 1440'], ['4k', '3840 × 2160']] and res[1][2] == 'true', res)
    pick_ratio(pg, '9:16')
    s = pg.evaluate(LIVE)
    check('9:16: upright (1080 × 1920)', s['fh'] > s['fw'] * 1.7 and s['px'] == '1080 × 1920 pixels' and abs(s['aspect'] - 9 / 16) < 0.02, s)
    pick_ratio(pg, '16:9')
    w0 = pg.evaluate(LIVE)['fw']
    # an edge dragged: a shape of your own
    g = pg.locator('.rn-grip.r').bounding_box()
    pg.mouse.move(g['x'] + g['width'] / 2, g['y'] + g['height'] / 2); pg.mouse.down(); pg.mouse.move(g['x'] - 60, g['y'] + g['height'] / 2, steps=6); pg.mouse.up(); pg.wait_for_timeout(1200)
    s = pg.evaluate(LIVE)
    own = pg.evaluate("() => window.__hp.app.settings.renderOpts.ratio")
    pw, ph = [int(x) for x in s['px'].replace(' pixels', '').split(' × ')]
    check('drag an edge of the frame: narrower, a shape of your own (kept), the pixels follow', s['fw'] < w0 - 80 and isinstance(own, (int, float)) and s['ratio'].strip().startswith('Own shape') and abs(pw / ph - s['fw'] / s['fh']) < 0.03 and abs(s['aspect'] - s['fw'] / s['fh']) < 0.02, (s, own, w0))
    pick_ratio(pg, '16:9')
    # a render: HD, light passes, a few passes
    pg.click('.rn-res button[data-k="hd"]'); pg.wait_for_timeout(200)
    pg.click('.rn-method button[data-k="passes"]'); pg.wait_for_timeout(200)
    pg.evaluate("() => { window.__hp.app._renderOpts.passes = 2; }")
    gv = pg.evaluate(GRID_VIEW)
    pg.evaluate("() => { window.__sawStop = null; const mo = new MutationObserver(() => { if (!window.__sawStop && document.querySelector('#rn-stop')) { window.__sawStop = [document.querySelector('#rn-stop').closest('.dlg-foot') !== null, document.querySelectorAll('.rn-res button[disabled]').length]; mo.disconnect(); } }); mo.observe(document.body, { subtree: true, childList: true }); }")
    pg.locator('#rn-start').click()
    pg.wait_for_function("() => window.__sawStop", timeout=120000)
    sw = pg.evaluate("() => window.__sawStop")
    check('Start render (at the bottom): Stop there while it runs, the options locked', sw[0] and sw[1] >= 3, sw)
    st = wait_done(pg)
    check('done: HD in 16:9 – 1280 × 720 pixels', st.startswith('2 passes in') and '1280 × 720' in st, st)
    gs = pg.evaluate(GRID_SHOT)
    cc = corr(gv, gs[0])
    check('… the picture is what the frame showed (the same framing)', gs[1:] == [1280, 720] and cc > 0.6, (gs[1:], round(cc, 3)))
    acts = pg.evaluate("() => ['#rn-save', '#rn-more', '#rn-back', '#rn-other'].map(s => document.querySelector(s) ? document.querySelector(s).textContent.trim() : null)")
    check('when it is done: Save picture, Continue (+2 passes), Back to the view, Same view in another version', acts[0] == 'Save picture' and acts[1] == 'Continue (+2 passes)' and acts[2] == 'Back to the view' and acts[3] == 'Same view in another version', acts)
    pg.screenshot(path=SHOTS + 'r25-done.png')
    # Continue: more passes on the same picture
    pg.click('#rn-more')
    st = wait_done(pg)
    th = pg.evaluate("() => document.querySelectorAll('#rn-strip .rn-th').length")
    check('Continue: on with the same picture (4 passes, still one picture)', st.startswith('4 passes in') and '1280 × 720' in st and th == 1, (st, th))
    sp = pg.evaluate("() => window.__hp.app.settings.renderSpeed")
    q = pg.evaluate("() => [...document.querySelectorAll('.rn-q button small')].map(e => e.textContent)")
    check('time per quality: measured here, shown under Quick, Good, Best', sp and sp.get('passes', 0) > 0 and len(q) == 3 and all(x.startswith('≈ ') for x in q), (sp, q))
    pg.click('#rn-back'); pg.wait_for_timeout(1500)
    s = pg.evaluate(LIVE)
    check('Back to the view: the view live in the frame again (the render put away)', s['own'] and not s['rendering'] and pg.evaluate("() => document.querySelector('#rn-view').hidden") and not s['img'] and pg.locator('#rn-more').count() == 0, s)
    # path traced, continued
    pg.click('.rn-method button[data-k="pt"]'); pg.wait_for_timeout(200)
    pg.evaluate("() => { const o = window.__hp.app._renderOpts; o.passes = 1; o.W = 96; o.H = 54; }")
    pg.click('#rn-start')
    st = wait_done(pg, 400)
    held = pg.evaluate("() => %s.rendering" % V)
    pg.click('#rn-more')
    st2 = wait_done(pg, 400)
    check('path traced: Continue (+1 sample) → 2 samples on the same picture (the path tracer kept meanwhile)', st.startswith('1 samples in') and st2.startswith('2 samples in') and held, (st, st2, held))
    pg.evaluate("() => { const o = window.__hp.app._renderOpts; delete o.W; delete o.H; delete o.passes; }")
    cam_framed = pg.evaluate(CAM)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")')
    pg.wait_for_function("() => !document.querySelector('#rn-body')", timeout=60000); pg.wait_for_timeout(2500)
    a = pg.evaluate("() => { const v = %s; return { home: v.renderer.domElement.parentNode === v.host, still: !!document.querySelector('.gl-still'), W: v.W, H: v.H, aspect: v.camera.aspect, rendering: !!v.rendering, cam: v.cameraState() }; }" % V)
    check('Close: the picture back in its pane, its size and shape again, drawing', a['home'] and not a['still'] and a['W'] == before['W'] and a['H'] == before['H'] and abs(a['aspect'] - before['aspect']) < 1e-6 and not a['rendering'], (a, before))
    check('… looking where you framed the photo', a['cam'] == cam_framed and a['cam'] != before['cam'], (a['cam'], cam_framed))
    # kept for next time
    pg.evaluate(OPEN)
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(2000)
    k = pg.evaluate("() => [document.querySelector('#rn-ratio').textContent.trim(), document.querySelector('.rn-res button[aria-pressed=\"true\"]').dataset.k, document.querySelector('.rn-method button[aria-pressed=\"true\"]').dataset.k, JSON.stringify(window.__hp.app.settings.renderOpts)]")
    check('the shape, the size and the way kept for next time', k[0].startswith('16:9') and k[1] == 'hd' and k[2] == 'pt', k)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(1500)
    tr = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'i18n', 'translations.json'), encoding='utf-8'))
    words = ['Back to the view', 'Size of the picture', 'Own shape', 'Continue (+{n} samples)', 'Continue (+{n} passes)', 'Drag to turn · scroll to zoom · right-drag to move', 'Drag to turn · pinch to zoom · two fingers to move', 'about {t} left', 'upright', 'square', 'wide']
    check('in Dutch and Norwegian too', all(w in tr and len(tr[w]) == 2 and all(tr[w]) for w in words), [w for w in words if w not in tr])
    check('PC: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); }"); pg.wait_for_timeout(9000); still(pg)
    pg.evaluate(OPEN)
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(2500)
    s = pg.evaluate(LIVE)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog'), r = d.getBoundingClientRect(), st = document.querySelector('#rn-start').getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth + 1, d.scrollWidth <= d.clientWidth + 1, Math.round(st.height)]; }")
    check('phone: the view itself in the window, fitting the screen, the frame large, Start big enough to tap', s['own'] and fit[0] and fit[1] and fit[2] >= 44 and s['fh'] > 300, (s, fit))
    check('phone: pinch and two fingers in the hint', 'pinch' in s['hint'], s['hint'])
    res = pg.evaluate(RES)
    check('phone: HD, Full HD, 2K (no 4K: it would not fit in a phone\'s memory), HD to start with', [x[0] for x in res] == ['hd', 'fhd', '2k'] and res[0][2] == 'true', res)
    c0 = pg.evaluate(CAM)
    drag(pg, '#rn-frame', 90); pg.wait_for_timeout(2500)
    check('phone: dragging in the frame turns the view', pg.evaluate(CAM) != c0)
    pg.screenshot(path=SHOTS + 'r25-phone-live.png')
    pg.evaluate("() => { const o = window.__hp.app._renderOpts; o.passes = 2; o.W = 72; o.H = 128; }")
    pg.tap('#rn-start')
    st = wait_done(pg, 300)
    pg.tap('#rn-more')
    st2 = wait_done(pg, 300)
    check('phone: rendered (light passes) and continued: 2 → 4 passes', st.startswith('2 passes in') and st2.startswith('4 passes in'), (st, st2))
    pg.screenshot(path=SHOTS + 'r25-phone-done.png')
    pg.tap('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(2000)
    a = pg.evaluate("() => { const v = %s; return [v.renderer.domElement.parentNode === v.host, !!v.rendering, !!document.querySelector('.gl-still')]; }" % V)
    check('phone: Close – the view back in its pane, drawing', a == [True, False, False], a)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
