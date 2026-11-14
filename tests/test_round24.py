"""Twenty-fourth round (1 Nov, evening): the render's light properly set and controlled. Your renders from the garden
side looked flat and bluish, the sky flat white, with white specks, and Best (1024) hardly better than Quick (64): the
sky gave about twice the sun's light – in the sky photo the sun gives 2.4 × the sky's. Now the path tracer's sun has the
photo's own sun (its light measured from the picture, weaker when low, as the app's sun is), the real sky shows behind
the house, the exposure is measured from the picture like a camera's, and the sun's glints are blurred a little (no
white specks). The render window has the light: Exposure (Auto, lighter/darker), Sun, Sky, Warmth, the sky behind the
house on or off, Normal light – kept for next time, used by both ways of rendering. PC (light) and phone (dark)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
PT = """async ([W, H, N, light]) => { const A = window.__hp, v = A.app.panes.find(p => p.kind === '3d').view;
  const res = await A.renderPathTraced(v, { W, H, passes: N, light });
  const d = res.canvas.getContext('2d').getImageData(0, 0, W, H).data, top = [0, 0, 0], all = [0, 0, 0]; let nt = 0, na = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) all[k] += d[i + k]; na++; if (y < H * 0.12) { for (let k = 0; k < 3; k++) top[k] += d[i + k]; nt++; } }
  v.resize(); v.needs = true;
  return { exposure: res.exposure, sun: res.sun, sky: res.sky, top: top.map(x => Math.round(x / nt)), all: all.map(x => Math.round(x / na)),
    after: [v.sun.intensity, v.scene.environmentIntensity, v.scene.background === window.__bg0, v.renderer.toneMappingExposure] }; }"""
LP = """async ([W, H, N, light]) => { const A = window.__hp, v = A.app.panes.find(p => p.kind === '3d').view;
  const res = await A.renderView3d(v, { W, H, passes: N, light });
  const d = res.canvas.getContext('2d').getImageData(0, 0, W, H).data, top = [0, 0, 0], all = [0, 0, 0]; let nt = 0, na = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) all[k] += d[i + k]; na++; if (y < H * 0.12) { for (let k = 0; k < 3; k++) top[k] += d[i + k]; nt++; } }
  return { top: top.map(x => Math.round(x / nt)), all: all.map(x => Math.round(x / na)), after: [v.sun.intensity, v.scene.background === window.__bg0] }; }"""
WALK = """([x, y, yaw, pitch]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.yaw = yaw; w.pitch = pitch; w.feet = w.groundAt(w.x, w.y, w.feet + 1) ?? w.feet; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }"""
lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    load_pictures(pg, 'sky:day')         # (task 0021: loaded when a 3D view asks – here before one does)
    sk = pg.evaluate("() => { const s = window.__hp.TEXLIB.sky.day.userData; return [s.sunE, s.avg]; }")
    check('the sky photo\'s own sun measured: its light on a surface facing it (a few times the sky\'s)', sk[0] and 3 < sk[0] < 7, sk)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.setMode('view'); window.__hp.Settings.set('light', 'sun'); a.settings.sunDay = 206; a.settings.sunTime = 590; a.refreshViews(false); }"); pg.wait_for_timeout(8000)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(5000)
    pg.evaluate(WALK, [6, -22, 3.0, 0.02]); pg.wait_for_timeout(6000)
    keep = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; window.__bg0 = v.scene.background; return [v.sun.intensity, v.scene.environmentIntensity, v.renderer.toneMappingExposure]; }")
    # (16 samples: the exposure is measured again after 4 and 16, on a settled picture – after 1 or 2 it jumped
    #  by ± 25 % from one run to the next, as the path tracer's random numbers differ each time – 0008a)
    NPT = 16
    a = pg.evaluate(PT, [96, 60, NPT, {}])
    check('path traced: the sun with the photo\'s balance (several times the old 1.5), the sky as it is', 3 < a['sun'] < 7 and abs(a['sky'] - 1) < 1e-6, a)
    check('… the real sky behind the house (blue at the top, not the plain background)', a['top'][2] > a['top'][0] + 15, a)
    check('… the exposure measured from the picture (Auto)', a['exposure'] and 0.05 < a['exposure'] < 20, a)
    check('… afterwards the view\'s own light, background and exposure back', a['after'][0] == keep[0] and a['after'][2] is True and abs(a['after'][3] - keep[2]) < 1e-6, (a['after'], keep))
    b1 = pg.evaluate(PT, [96, 60, NPT, {'ev': 1}])
    check('Exposure +1: twice as light (about)', 1.5 < b1['exposure'] / a['exposure'] < 2.7, (a['exposure'], b1['exposure']))
    c = pg.evaluate(PT, [96, 60, NPT, {'skyBg': False}])
    check('Sky behind the house off: the view\'s own background (walking: its painted sky, lighter than the photo\'s)', lum(c['top']) > lum(a['top']) + 15, (a['top'], c['top']))
    w = pg.evaluate(PT, [96, 60, NPT, {'warm': 1}])
    check('Warmth +1: warmer (more red, less blue than neutral)', w['all'][0] - w['all'][2] > a['all'][0] - a['all'][2] + 4, (a['all'], w['all']))
    s0 = pg.evaluate(PT, [96, 60, NPT, {'sun': 0}])
    check('Sun × 0: only the sky\'s light – darker before the exposure, so the camera opens up', s0['sun'] == 0 and s0['exposure'] > a['exposure'] * 1.3, (a['exposure'], s0['exposure']))
    # the light passes too
    l0 = pg.evaluate(LP, [96, 60, 3, {}])
    l1 = pg.evaluate(LP, [96, 60, 3, {'ev': 1}])
    check('light passes: Exposure +1 lighter, the sky behind the house, the view\'s light back after', lum(l1['all']) > lum(l0['all']) + 8 and l0['top'][2] > l0['top'][0] + 15 and l0['after'][0] == keep[0] and l0['after'][1] is True, (l0, l1))
    lw = pg.evaluate(LP, [96, 60, 3, {'warm': -1}])
    check('light passes: Warmth −1 cooler', lw['all'][2] - lw['all'][0] > l0['all'][2] - l0['all'][0] + 4, (l0['all'], lw['all']))
    # the window: the light, kept for next time
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const a = window.__hp.app; a._renderOpts = { q: 'quick', size: 'screen', method: 'pt', passes: 1, W: 64, H: 40 }; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(600)
    rows = pg.evaluate("() => ['ev', 'sun', 'sky', 'warm'].map(k => [!!document.querySelector('#rl-' + k), (document.querySelector('#rl-' + k + '-val') || {}).textContent]).concat([[!!document.querySelector('#rl-skybg'), document.querySelector('#rl-skybg') && document.querySelector('#rl-skybg').getAttribute('aria-pressed')]])")
    check('the render window: Light – Exposure Auto, Sun × 1.0, Sky × 1.0, Warmth Neutral, Sky behind the house On', rows == [[True, 'Auto'], [True, '× 1.0'], [True, '× 1.0'], [True, 'Neutral'], [True, 'true']], rows)
    pg.evaluate("() => { const i = document.querySelector('#rl-ev'); i.value = '0.5'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); const s = document.querySelector('#rl-sun'); s.value = '1.4'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); }")
    pg.click('#rl-skybg'); pg.wait_for_timeout(300)
    st = pg.evaluate("() => [window.__hp.app.settings.renderLight, document.querySelector('#rl-ev-val').textContent, document.querySelector('#rl-skybg').getAttribute('aria-pressed'), window.__hp.renderLight()]")
    check('… a change is kept (and used by the next render)', st[0].get('ev') == 0.5 and st[0].get('sun') == 1.4 and st[0].get('skyBg') is False and st[1] == 'Auto +0.5' and st[2] == 'false' and st[3]['sun'] == 1.4, st)
    pg.click('#rl-reset'); pg.wait_for_timeout(300)
    check('… Normal light puts it all back', pg.evaluate("() => [JSON.stringify(window.__hp.app.settings.renderLight), document.querySelector('#rl-sun-val').textContent]") == ['{}', '× 1.0'])
    pg.screenshot(path=SHOTS + 'r24-light.png')
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(800)
    check('PC: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a._renderOpts = { q: 'quick', size: 'screen', method: 'passes', passes: 2, W: 80, H: 120 }; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(800)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog'), r = d.getBoundingClientRect(), s = document.querySelector('#rl-sun').getBoundingClientRect(); return [!!document.querySelector('#rl-ev'), r.left >= 0 && r.right <= innerWidth + 1, d.scrollWidth <= d.clientWidth + 1, Math.round(s.width)]; }")
    check('phone: the light in the render window too, fitting the screen', fit[0] and fit[1] and fit[2] and fit[3] > 60, fit)
    pg.screenshot(path=SHOTS + 'r24-phone-light.png')
    pg.tap('#rn-start')
    for i in range(60):
        pg.wait_for_timeout(2000)
        if 'passes in' in pg.evaluate("() => document.querySelector('#rn-status').textContent"): break
    check('phone: rendered with the light (light passes)', 'passes in' in pg.evaluate("() => document.querySelector('#rn-status').textContent"))
    pg.tap('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(800)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
