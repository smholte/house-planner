"""Twenty-sixth round (2 Nov, night): path traced pictures that get cleaner with more samples, and the grain cleaned up.
The path tracer read its random numbers from a texture too narrow for our number of bounces: which way a bounce went
(diffuse or glossy) was the same for every sample of a pixel, so the grain stayed past a few dozen samples – Best was
hardly better than Quick, with white dots. Fixed (vendor patch). And "Clean up the grain": the same view drawn once more,
plainly, gives each pixel its surface colour and its distance; the light (picture ÷ surface colour) is smoothed over
neighbours in the same plane, facing the same way, of a like surface colour and a light that differs no more than its
grain – five passes, 1 … 16 pixels apart – and multiplied by the surface colours again, so patterns, edges and shadows
stay. On by default in the render window (path traced), also switched on and off afterwards on the picture shown.
Checked on a small chequered scene against 256 samples, and on the house. PC (light) and phone (dark: no path tracing
there, so no switch)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V = "window.__hp.app.panes.find(p => p.kind === '3d').view"
# a small scene: a chequered floor (sharp edges between its squares), a box with its shadow, the sky's light
SCENE = """window.__dnScene = () => {
  const H = window.__hp, T = H.THREE, v0 = %s;
  const scene = new T.Scene();
  const d = new Uint8Array(8 * 8 * 4); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = (x + y) %% 2 ? 205 : 70, i = (y * 8 + x) * 4; d[i] = k; d[i + 1] = k; d[i + 2] = k; d[i + 3] = 255; }
  const tex = new T.DataTexture(d, 8, 8); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.colorSpace = T.SRGBColorSpace; tex.needsUpdate = true;
  const floor = new T.Mesh(new T.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: tex, roughness: 1 }));
  const box = new T.Mesh(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new T.MeshStandardMaterial({ color: 0xb05a3c, roughness: 0.9 }));
  scene.add(floor, box);
  const sun = new T.DirectionalLight(0xffffff, 2); sun.position.set(3, 5, 2); scene.add(sun, sun.target);
  const cam = new T.PerspectiveCamera(45, 1.6, 0.1, 50); cam.position.set(0, 4.2, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  return { renderer: v0.renderer, camera: cam, scene, sun, evening: false, W: 128, H: 80, resize() {}, needs: false };
};""" % V
# a picture as grey values (linear-ish 0…255 per pixel)
GREY = "(cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, o = []; for (let i = 0; i < d.length; i += 4) o.push((d[i] + d[i + 1] + d[i + 2]) / 3); return o; }"
# (the app's own 3D view shares the renderer: paused meanwhile, as a real render pauses it – else its automatic
#  exposure changes the renderer's exposure between samples, and the pictures differ by the machine's speed – 0008a)
# (and the path tracer's random numbers from one seeded sequence, carried on from render to render: the same pictures on
#  every run and machine – it draws new ones each time, and a picture of 8 or 64 samples varied so much that a check
#  passed or failed by chance)
SEED = int(os.environ.get('HP_R26_SEED', '1'))
HOLD = "const v0 = %s; v0.rendering = true; f.renderer.toneMappingExposure = 1; const rnd0 = Math.random; Math.random = window.__dnRnd;" % V
FREE = "Math.random = rnd0; v0.rendering = false; v0.resize(); v0.needs = true;"
RUN = """async ([n, dn, W, H]) => { const A = window.__hp, f = window.__dnScene(); const tex0 = f.renderer.info.memory.textures; %s
  // (one fixed exposure for all: the pictures compared as they are)
  let res; try { res = await A.renderPathTraced(f, { W, H, passes: n, denoise: dn, meter: false }); } finally { %s }
  window.__dnShots = window.__dnShots || {}; window.__dnShots[n + (dn ? 'dn' : '')] = res.canvas.toDataURL();
  return { g: (%s)(res.canvas), denoised: !!res.denoised, n: res.n, texDiff: f.renderer.info.memory.textures - tex0 }; }""" % (HOLD, FREE, GREY)
# the same samples taken twice: as they are, then cleaned (the render kept open, its picture taken again)
PAIR = """async ([n, W, H]) => { const A = window.__hp, f = window.__dnScene(); const tex0 = f.renderer.info.memory.textures; %s
  let raw, dn, denoised, res;
  try {
    res = await A.renderPathTraced(f, { W, H, passes: n, denoise: false, meter: false, keep: true });
    raw = (%s)(res.canvas); res.redraw(true); dn = (%s)(res.canvas); denoised = !!res.denoised;
    window.__dnShots = window.__dnShots || {}; window.__dnShots[n + 'dn'] = res.canvas.toDataURL();
    res.end();
  } finally { %s }
  return { raw, dn, denoised, n: res.n, texDiff: f.renderer.info.memory.textures - tex0 }; }""" % (HOLD, GREY, GREY, FREE)

lin = lambda v: (v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4

def stats(a, b):
    n = len(a); ma = sum(a) / n; mb = sum(b) / n
    rmse = (sum((x - y) ** 2 for x, y in zip(a, b)) / n) ** 0.5
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b)); sa = sum((x - ma) ** 2 for x in a) ** 0.5; sb = sum((y - mb) ** 2 for y in b) ** 0.5
    return rmse, (sab / (sa * sb) if sa and sb else 0), ma, mb

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    pg.evaluate("() => { " + SCENE + " }")
    pg.evaluate("(s) => { let a = s >>> 0; window.__dnRnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }", SEED)
    pair = pg.evaluate(PAIR, [8, 96, 60])
    r64 = pg.evaluate(RUN, [64, False, 96, 60])
    ref = pg.evaluate(RUN, [256, False, 96, 60])
    check('the small scene: path traced with 8 samples (as they are, then cleaned), 64 and 256 samples', pair['n'] == 8 and pair['denoised'] and r64['n'] == 64 and ref['n'] == 256, (pair['n'], pair['denoised'], r64['n'], ref['n']))
    L = {'raw': [lin(x) for x in pair['raw']], 'dn': [lin(x) for x in pair['dn']], 'r64': [lin(x) for x in r64['g']], 'ref': [lin(x) for x in ref['g']]}
    e8, c8, m8, _ = stats(L['raw'], L['ref'])
    e64, _, _, _ = stats(L['r64'], L['ref'])
    check('path traced pictures get cleaner with more samples now (the path tracer\'s random numbers fixed): 64 samples much nearer 256 than 8', e64 < 0.6 * e8, (round(e8, 4), round(e64, 4)))
    # grain: how much a pixel of the floor differs from the one beside it (the squares' edges count a little too)
    W0 = 96
    rough = lambda g: sum(abs(g[y * W0 + x] - g[y * W0 + x + 1]) for y in range(30, 58) for x in range(8, 87)) / (28 * 79)
    check('cleaned: the same 8 samples much smoother (less than 0.6 × the grain)', rough(L['dn']) < 0.6 * rough(L['raw']), (round(rough(L['raw']), 4), round(rough(L['dn']), 4), round(rough(L['ref']), 4)))
    _, cdn, mdn, _ = stats(L['dn'], L['ref'])
    check('… the chequered floor, the box and its shadow kept (alike the 256-sample picture)', cdn > 0.95 and cdn >= c8 - 0.005, (round(c8, 4), round(cdn, 4)))
    check('… as light as the same samples not cleaned (only the grain went)', abs(mdn / m8 - 1) < 0.08, (round(m8, 4), round(mdn, 4)))
    # the box's shadow on the floor: the darkest patch of the 256-sample picture
    best = None
    for y in range(26, 56, 2):
        for x in range(10, 86, 2):
            m = sum(L['ref'][(y + j) * W0 + x + i] for j in range(4) for i in range(4)) / 16
            if best is None or m < best[0]: best = (m, y, x)
    _, sy, sx = best
    patch = lambda g: sum(g[(sy + j) * W0 + sx + i] for j in range(4) for i in range(4)) / 16
    floor = sum(L['ref'][y * W0 + x] for y in range(30, 58) for x in range(8, 88)) / (28 * 80)
    check('… the shadow stays a shadow (darker than a seventh of the floor)', patch(L['dn']) < 0.15 * floor, (round(patch(L['ref']), 4), round(patch(L['raw']), 4), round(patch(L['dn']), 4), round(floor, 4)))
    # the clean-up's own pictures on the graphics chip: made, used and given back
    # (once first: the scene's own picture – the chequers – goes onto the chip with its first plain drawing, and stays)
    tx = pg.evaluate("""() => { const H = window.__hp, f = window.__dnScene(), r = f.renderer;
      f.camera.aspect = 96 / 60; f.camera.updateProjectionMatrix();
      const once = () => { const dn = H.makeDenoiser(r, f.scene, f.camera, 96, 60), n = r.info.memory.textures; dn.run(dn.alb.texture, 8); dn.dispose(); r.setRenderTarget(null); return n; };
      once(); const n0 = r.info.memory.textures, n1 = once(); return [n0, n1, r.info.memory.textures]; }""")
    check('… and nothing left behind on the graphics chip', tx[1] > tx[0] and tx[2] == tx[0], tx)
    import base64
    for k, u in pg.evaluate("() => window.__dnShots").items():
        open(SHOTS + f'r26-small-{k}.png', 'wb').write(base64.b64decode(u.split(',')[1]))
    # the house: the switch in the render window, also afterwards on the picture shown
    pg.evaluate("() => { const a = window.__hp.app; a._renderOpts = { q: 'quick', method: 'pt', passes: 2, W: 120, H: 68 }; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(1500)
    row = pg.evaluate("() => [...document.querySelectorAll('.rn-dn button')].map(b => [b.dataset.k, b.getAttribute('aria-pressed')])")
    check('path traced: "Clean up the grain" – On to start with', row == [['on', 'true'], ['off', 'false']], row)
    pg.click('#rn-start')
    pg.wait_for_function("() => document.querySelector('#rn-save') && !document.querySelector('#rn-stop')", timeout=600000); pg.wait_for_timeout(500)
    u_on = pg.get_attribute('#rn-shot img', 'src')
    pg.click('.rn-dn button[data-k="off"]'); pg.wait_for_timeout(1500)
    u_off = pg.get_attribute('#rn-shot img', 'src')
    g_on = pg.evaluate("(u) => new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); r((%s)(c)); }; im.src = u; })" % GREY, u_on)
    g_off = pg.evaluate("(u) => new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); r((%s)(c)); }; im.src = u; })" % GREY, u_off)
    # grain: how much a pixel differs from the one beside it
    rough = lambda g: sum(abs(g[i] - g[i + 1]) for i in range(len(g) - 1) if (i + 1) % 120) / len(g)
    check('Off afterwards: the same render without the clean-up (grainier), at once', u_off != u_on and rough(g_off) > rough(g_on) * 1.15, (round(rough(g_on), 2), round(rough(g_off), 2)))
    pg.click('.rn-dn button[data-k="on"]'); pg.wait_for_timeout(1500)
    check('… On again: cleaned again', pg.get_attribute('#rn-shot img', 'src') != u_off and pg.evaluate("() => window.__hp.app.settings.renderOpts.dn") is True)
    pg.click('#rn-more')
    pg.wait_for_function("() => document.querySelector('#rn-save') && !document.querySelector('#rn-stop') && /^4 samples in/.test(document.querySelector('#rn-status').textContent)", timeout=600000)
    check('Continue with the clean-up: 4 samples, cleaned', pg.evaluate("() => /^4 samples in/.test(document.querySelector('#rn-status').textContent)"))
    pg.screenshot(path=SHOTS + 'r26-denoise.png')
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(2000)
    check('Close: the view drawing again', pg.evaluate("() => !%s.rendering && !%s.borrowed" % (V, V)))
    check('PC: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(1500)
    check('phone: light passes only, so no grain switch', pg.locator('.rn-dn').count() == 0 and pg.locator('.rn-method').count() == 0)
    pg.tap('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(1500)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
