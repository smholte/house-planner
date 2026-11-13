"""Thirteenth round (31 Oct): the photo render of the 3D view (View → "Photo render of this view"): the view drawn again
and again with the camera a fraction of a pixel aside, the sun somewhere on its disc and part of the daylight from one
spot of the sky with its own shadows, averaged in linear light; a light meter for dark interiors; stop when you like it,
save it as a PNG, the same view in another version with the pictures side by side under a slider; afterwards the
3D view exactly as it was. PC (light) and phone (dark). Few passes here: the test browser draws on the processor."""
from common import *
import struct, base64

V3 = "() => window.__hp.app.panes.find(p => p.kind === '3d').view"
STATE = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; return { cam: v.cameraState(), pr: v.renderer.getPixelRatio(), cw: v.renderer.domElement.width, W: v.W, rendering: !!v.rendering, exp: v.renderer.toneMappingExposure, hemi: +v.hemi.intensity.toFixed(4), sun: v.sun.position.toArray().map(x => +x.toFixed(3)), lights: v.scene.children.filter(o => o.isDirectionalLight).length }; }"""
STATS = """(url) => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; n++; } const m = s / n; res([c.width, c.height, Math.round(m), Math.round(Math.sqrt(s2 / n - m * m))]); }; im.src = url; })"""

def png_size(path):
    b = open(path, 'rb').read(32)
    return b[:8] == b'\x89PNG\r\n\x1a\n', struct.unpack('>II', b[16:24])

def wait_done(pg, timeout=600000):
    pg.wait_for_function("() => document.querySelector('#rn-save') && !document.querySelector('#rn-stop')", timeout=timeout)
    pg.wait_for_timeout(300)

with sync_playwright() as p:
    b, pg = open_app(p)
    pg.set_viewport_size({'width': 980, 'height': 640})
    open_example(pg)
    # ───────── the pieces ─────────
    h = pg.evaluate("() => [window.__hp.halton(1, 2), window.__hp.halton(2, 2), window.__hp.halton(3, 2), window.__hp.halton(1, 3)]")
    check('passes spread evenly (Halton: ½, ¼, ¾ – ⅓)', [round(x, 4) for x in h] == [0.5, 0.25, 0.75, 0.3333], h)
    sk = pg.evaluate("() => { const d = [...Array(256).keys()].map(i => window.__hp.skyDir(i)); return [Math.min(...d.map(v => v.y)), Math.max(...d.map(v => Math.abs(v.length() - 1))), d.reduce((s, v) => s + v.y, 0) / d.length, d.reduce((s, v) => s + v.x, 0) / d.length, d.reduce((s, v) => s + v.z, 0) / d.length]; }")
    check('sky spots: all above the horizon, over the whole sky (as much from each part as it lights the ground)', sk[0] >= 0.119 and sk[1] < 1e-6 and 0.6 < sk[2] < 0.72 and abs(sk[3]) < 0.05 and abs(sk[4]) < 0.05, sk)
    pg.evaluate("() => { const a = window.__hp.app; a.setScope('house'); a.setDim('3d'); }"); pg.wait_for_timeout(5000)
    # (standing in the living room, looking across it: 3D x = plan x, z = plan y)
    cam = by_house(pg, [[8.0, 1.5, 5.2], [3.5, 1.1, 1.5]], [[6.0, 1.5, 7.2], [1.5, 1.1, 11.2]])
    pg.evaluate("([p, t]) => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; v.setViewState({ kind: '3d', pos: new window.__hp.THREE.Vector3(...p), target: new window.__hp.THREE.Vector3(...t) }); v.needs = true; }", cam)
    pg.wait_for_timeout(2500)
    sz = pg.evaluate("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; return [v.W, v.H, window.__hp.renderSize(v, 'screen'), window.__hp.renderSize(v, 'large')]; }")
    check('picture size: as the view (its shape), or large (2800 px on a computer)', abs(sz[2][0] / sz[2][1] - sz[0] / sz[1]) < 0.01 and max(sz[3]) == 2800 and abs(sz[3][0] / sz[3][1] - sz[0] / sz[1]) < 0.01, sz)
    # (a room selected: not tinted in the photo. The made-up house: the kitchen, out of sight – a tinted floor in sight
    #  would change the measured exposure, and the render ends with nothing selected)
    pg.evaluate("(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n); a.select({ type: 'room', id: r.id, storey: r.storey }); }", by_house(pg, 'Keuken', 'Woonkamer')); pg.wait_for_timeout(2500)
    # (the automatic exposure measured again and settled first: in a busy test browser its first measurement can be of a
    #  picture not fully drawn yet, kept until the camera moves – 1.35 instead of 1.0 – and the render ends with a fresh one)
    pg.evaluate("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; v._aeLight = true; v.needs = true; }")
    pg.wait_for_timeout(1500); still(pg)
    before = pg.evaluate(STATE)
    # ───────── the dialog ─────────
    pg.evaluate("() => { window.__hp.app._renderOpts = { q: 'quick', res: 'hd', passes: 6 }; }")
    # (since 1 Nov night the size is chosen in pixels: HD is 1280 on the long side, in the shape of the view)
    hd = pg.evaluate("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; return window.__hp.renderDims(1280, v.W / v.H); }")
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    check('View menu: “Photo render of this view”', pg.locator('#mi-render').count() == 1)
    pg.click('#mi-render')
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(1500)
    w0 = pg.evaluate("() => [!!document.querySelector('#rn-stop'), document.querySelectorAll('.rn-q button[disabled]').length, !!document.querySelector('#rn-frame canvas.gl'), document.querySelectorAll('#rn-strip .rn-th').length, !!document.querySelector('#rn-start')]")
    check('the dialog waits (since 1 Nov): no render yet, the options free to set, the view itself in the window, Start render', not w0[0] and w0[1] == 0 and w0[2] and w0[3] == 0 and w0[4], w0)
    # (what the dialog shows the moment the render starts – a short render may be done before a look afterwards)
    pg.evaluate("() => { window.__sawStop = null; const mo = new MutationObserver(() => { if (!window.__sawStop && document.querySelector('#rn-stop')) { window.__sawStop = [true, document.querySelector('#rn-status').textContent, document.querySelectorAll('.rn-q button[disabled]').length, document.querySelectorAll('.rn-q button').length]; mo.disconnect(); } }); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); }")
    pg.click('#rn-start')
    pg.wait_for_function("() => window.__sawStop", timeout=180000)
    st0 = pg.evaluate("() => window.__sawStop")
    check('Start render: pass n of m, a Stop button, the options locked', st0[0] and 'Pass' in st0[1] and st0[2] >= 3, st0)
    pg.wait_for_function("() => document.querySelector('#rn-shot img')", timeout=300000)
    check('… the picture shows while it grows', pg.locator('#rn-shot img').count() == 1)
    wait_done(pg)
    st = pg.inner_text('#rn-status')
    check('done: “6 passes in … s · W × H pixels” (HD in the shape of the view)', st.startswith('6 passes') and f"{hd[0]} × {hd[1]}" in st, (st, hd))
    check('a selected room is not tinted in the photo (no selection while rendering)', pg.evaluate("() => window.__hp.app.selection") is None)
    url = pg.get_attribute('#rn-shot img', 'src')
    stats = pg.evaluate(STATS, url)
    check('… a real picture (not empty or one colour)', stats[0] == hd[0] and 40 < stats[2] < 235 and stats[3] > 12, stats)
    with pg.expect_download(timeout=60000) as dl:
        pg.click('#rn-save')
    path = os.path.join(SHOTS, 'r13-render.png'); dl.value.save_as(path)
    ok, (w, hh) = png_size(path)
    check('Save picture: a PNG at full size, named after the house and the version', ok and (w, hh) == tuple(hd) and 'render' in dl.value.suggested_filename and by_house(pg, 'study', 'oak') in dl.value.suggested_filename, (dl.value.suggested_filename, w, hh))
    pg.screenshot(path=SHOTS + 'r13-render-dialog.png')
    # inside, the light meter opens up
    exp = pg.evaluate("async () => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; const r = await window.__hp.renderView3d(v, { passes: 1, size: 'screen' }); return r.exposure; }")
    check('the light meter: inside the living room the picture is opened up (at most 2×)', 1.05 < exp <= 2.0, exp)
    # stop early
    pg.evaluate("() => { window.__hp.app._renderOpts.passes = 400; }")
    pg.click('#rn-start'); pg.wait_for_timeout(300)
    pg.wait_for_function("() => /Pass [2-9]/.test(document.querySelector('#rn-status').textContent)", timeout=300000)
    mid = pg.evaluate(STATE)
    check('… while it renders the 3D view stands still (its own drawing paused), an extra light for the sky spots', mid['rendering'] and mid['lights'] == before['lights'] + 1, mid)
    pg.click('#rn-stop')
    wait_done(pg)
    st = pg.inner_text('#rn-status')
    n = int(st.split(' ')[0])
    check('Stop – keep this: the picture so far is kept', 2 <= n < 400 and pg.locator('#rn-strip .rn-th').count() == 2, st)
    # the same view in another version
    pg.evaluate("() => { window.__hp.app._renderOpts.passes = 3; }")
    pg.click('#rn-other'); pg.wait_for_timeout(400)
    names = pg.evaluate("() => [...document.querySelectorAll('.menu .mi span')].map(s => s.textContent)")
    pg.click('.menu .mi >> nth=0'); pg.wait_for_timeout(500)
    wait_done(pg)
    th = pg.evaluate("() => [...document.querySelectorAll('#rn-strip .rn-th span')].map(s => s.textContent)")
    check('Same view in another version: rendered too, a third picture with its name', len(th) == 3 and th[2] == names[0] and th[2] != th[0], (names, th))
    cam2 = pg.evaluate("() => window.__hp.app.panes.find(p => p.kind === '3d').view.cameraState()")
    check('… from the same spot', cam2 == before['cam'], (cam2, before['cam']))
    pg.click('#rn-compare'); pg.wait_for_timeout(500)
    check('Compare: the two pictures under a slider', pg.locator('#rn-cmp').count() == 1 and pg.locator('#rn-cmp img').count() == 2)
    pg.locator('#rn-cmp').scroll_into_view_if_needed()
    bx = pg.locator('#rn-cmp').bounding_box()
    check('… the picture fits in the dialog (no scrolling to see it)', bx['height'] <= 0.6 * 640 + 2, bx)
    pg.mouse.move(bx['x'] + bx['width'] * 0.25, bx['y'] + bx['height'] / 2); pg.mouse.down(); pg.mouse.move(bx['x'] + bx['width'] * 0.2, bx['y'] + bx['height'] / 2); pg.mouse.up()
    wl = pg.evaluate("() => parseFloat(document.querySelector('.rn-cmp-left').style.width)")
    check('… slide to see more of one or the other', 15 < wl < 25, wl)
    pg.locator('#rn-strip .rn-th').nth(0).click(); pg.wait_for_timeout(300)
    check('… tap a picture below to look at it', pg.get_attribute('#rn-strip .rn-th >> nth=0', 'aria-pressed') == 'true')
    pg.screenshot(path=SHOTS + 'r13-render-compare.png')
    pg.click('.scrim:last-child .dialog button:has-text("Close")')
    pg.wait_for_function("() => !document.querySelector('#rn-body')", timeout=60000)
    pg.wait_for_timeout(4000)
    back = pg.evaluate("() => window.__hp.app.shownVersion().name")
    cam3 = pg.evaluate("() => window.__hp.app.panes.find(p => p.kind === '3d').view.cameraState()")
    check('Close: back to the version you were looking at, from the same spot', back == th[0] and cam3 == before['cam'], (back, th[0], cam3))
    still(pg)
    after = pg.evaluate(STATE)
    check('the 3D view as it was: camera, sharpness, size, light, sun, no extra light, drawing again', after == before, (before, after))
    check('… and the room selected again', (pg.evaluate("() => window.__hp.app.selection") or {}).get('type') == 'room')
    # evening: no sky spots, still a picture
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'evening'; a.refreshViews(false); }"); pg.wait_for_timeout(3000)
    ev = pg.evaluate("async () => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; const n0 = v.scene.children.length; const r = await window.__hp.renderView3d(v, { passes: 2, W: 160, H: 100 }); return [r.n, r.exposure, v.scene.children.length === n0]; }")
    check('Evening light: rendered without the sky spots and the light meter', ev == [2, 1, True], ev)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.light = 'day'; a.refreshViews(false); }")
    check('no page errors (PC)', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a._renderOpts = { q: 'quick', res: 'hd', passes: 2 }; }"); pg.wait_for_timeout(4000)
    pg.evaluate("() => { window.__hp.app.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.tap('#rn-start')
    pg.wait_for_timeout(1000)
    wait_done(pg)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog'); const r = d.getBoundingClientRect(); const im = document.querySelector('#rn-shot img').getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth + 1, d.scrollWidth <= d.clientWidth + 1, im.width > 300 || im.height > 380, !/null/.test(document.querySelector('.rn-acts').textContent), Math.min(...[...document.querySelectorAll('.rn-acts .btn')].map(x => x.getBoundingClientRect().height))]; }")
    check('phone: the render fits the screen, the picture large, buttons big enough to tap', fit[0] and fit[1] and fit[2] and fit[3] and fit[4] >= 40, fit)
    st = pg.inner_text('#rn-status')
    check('phone: rendered (2 passes)', st.startswith('2 passes'), st)
    pg.screenshot(path=SHOTS + 'r13-phone-render.png')
    pg.tap('.scrim:last-child .dialog button:has-text("Close")'); pg.wait_for_timeout(1500)
    check('phone: the 3D view drawing again', pg.evaluate("() => !window.__hp.app.panes.find(p => p.kind === '3d').view.rendering"))
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
