"""Twentieth round (1 Nov, evening): the path traced photo render made dependable. Your report: Best (1024) came out
black, the trees were black while path tracing, and after that the light passes stopped with "createImageData … width
is zero". Causes: (1) the graphics card was reset mid-render (Windows does that to a card busy for 2 s; the browser
then loses every 3D drawing of the page – the 3D view stayed blank, the render read a size of 0); (2) a bug in the path
tracer library: colours per corner with 3 values (trees, hedges, reeds) were copied the wrong way round – black in the
picture, and zeros written into the scene's own trees; (3) the sun counted twice (the app's sun and the sun inside the
sky photo) – far too bright, the grass washed out.
Now: the work is handed to the graphics card one small piece at a time, waiting for each (pieces made smaller when one
takes long); a lost drawing stops the render with a clear message and no black picture is kept; the 3D view starts
again by itself; the light passes say the same instead of failing; trees in their colours; the sun once. And (your
wish, 18:39) the photo render waits for "Start render", so the settings can be chosen first.
PC (light) and phone (dark)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
STATUS = "() => { const e = document.querySelector('#rn-status'); return e ? e.textContent : ''; }"
THUMBS = "() => document.querySelectorAll('#rn-strip .rn-th').length"
TOASTS = "() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent)"
SHOT_BLANK = """() => { const img = document.querySelector('#rn-shot img'); if (!img || !img.naturalWidth) return null;
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return window.__hp.canvasBlank(c); }"""
# a small scene: a white square (no colours per corner – it comes first, so the merged colours get 4 values) and a
# square red by its colours per corner (3 values): path traced, the red must be red
VCOL = """async () => {
  const H = window.__hp, T = H.THREE, v0 = H.app.panes.find(p => p.kind === '3d').view;
  const scene = new T.Scene();
  const white = new T.Mesh(new T.PlaneGeometry(1.6, 1.6).translate(-1, 0, 0), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  const g = new T.PlaneGeometry(1.6, 1.6).translate(1, 0, 0), n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = 0.9; c[i * 3 + 1] = 0.05; c[i * 3 + 2] = 0.05; }
  g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
  const red = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 }));
  scene.add(white, red);
  const sun = new T.DirectionalLight(0xffffff, 2); sun.position.set(0, 0, 5); scene.add(sun, sun.target);
  const cam = new T.PerspectiveCamera(50, 1.5, 0.1, 50); cam.position.set(0, 0, 4); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const before = Array.from(g.attributes.color.array.slice(0, 6));
  const fake = { renderer: v0.renderer, camera: cam, scene, evening: false, W: 96, H: 64, resize() {}, needs: false };
  const res = await H.renderPathTraced(fake, { W: 96, H: 64, passes: 6 });
  v0.resize(); v0.needs = true;
  // (the mean of a patch in the middle of each square: a few samples are grainy)
  const d = res.canvas.getContext('2d'), mean = x0 => { const q = d.getImageData(x0, 24, 16, 16).data, m = [0, 0, 0]; for (let i = 0; i < q.length; i += 4) { m[0] += q[i]; m[1] += q[i + 1]; m[2] += q[i + 2]; } return m.map(v => Math.round(v / (q.length / 4))); };
  const L = mean(23), R = mean(57);
  return { left: L, right: R, kept: Array.from(g.attributes.color.array.slice(0, 6)), before, tiles: res.tiles };
}"""
# the colours per corner of the house's trees (to see they are not changed by a path trace)
TREESUM = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; let s = 0, n = 0;
  v.scene.traverse(o => { const c = o.isMesh && o.geometry && o.geometry.attributes.color; if (c && c.itemSize === 3) { n++; for (let i = 0; i < Math.min(c.array.length, 3000); i++) s += c.array[i]; } });
  return [n, Math.round(s * 1000) / 1000]; }"""
# the same small picture path traced and with light passes: how bright, how much is black
BRIGHT = """async ([W, H]) => { const A = window.__hp, v = A.app.panes.find(p => p.kind === '3d').view;
  // (on a copy 8 × smaller: the grain of a few samples evens out, a black tree would stay black)
  const stat = cv0 => { const cv = document.createElement('canvas'); cv.width = Math.round(cv0.width / 8); cv.height = Math.round(cv0.height / 8); const g0 = cv.getContext('2d'); g0.imageSmoothingQuality = 'high'; g0.drawImage(cv0, 0, 0, cv.width, cv.height);
    const d = g0.getImageData(0, 0, cv.width, cv.height).data; let s = 0, blk = 0, n = 0;
    const lin = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    for (let i = 0; i < d.length; i += 4) { s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (d[i] + d[i + 1] + d[i + 2] < 30) blk++; n++; }
    return [s / n, blk / n]; };
  // (seeded random numbers, the app's view paused, 12 samples – 4 left a few percent of the picture black by chance; task 0040)
  const sd = (s) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const rnd0 = Math.random; v.rendering = true; Math.random = sd(12345);
  let pt; try { pt = await A.renderPathTraced(v, { W, H, passes: 12 }); } finally { Math.random = rnd0; v.rendering = false; }
  const lp = await A.renderView3d(v, { W, H, passes: 6 });
  return { pt: stat(pt.canvas), lp: stat(lp.canvas), tiles: pt.tiles }; }"""

def wait_status(pg, words, secs=300):
    st = ''
    for _ in range(secs // 2):
        st = pg.evaluate(STATUS)
        if any(w in st for w in words): return st
        pg.wait_for_timeout(2000)
    return st

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    vc = pg.evaluate(VCOL)
    L, R = vc['left'], vc['right']
    check('path tracer: colours per corner with 3 values come out in their colour (red stays red, not black)', R[0] > 40 and R[0] > 2 * max(R[1], R[2]), vc)
    check('… the plain white one beside it light (white, a little blue from the sky), not red', min(L) > 40 and L[0] < 1.3 * L[2], vc)
    check('… and the scene\'s own colours are left alone (the library wrote zeros into them)', vc['kept'] == vc['before'], vc)
    t0 = pg.evaluate(TREESUM)
    br = pg.evaluate(BRIGHT, [160, 100])
    t1 = pg.evaluate(TREESUM)
    check('the house\'s trees, hedges and reeds keep their colours through a path trace', t0[0] > 0 and t0 == t1, (t0, t1))
    ratio = br['pt'][0] / max(1e-6, br['lp'][0])
    # (since 1 Nov, late evening the path tracer meters its own exposure like a camera – Auto; the light passes only
    #  open up for a dark inside – so the two are alike, not equal; the sun's strength itself: test_round24. Since its
    #  random numbers were fixed (2 Nov) its few-sample pictures come out a little lighter: 1.7 – 2.2 × measured)
    check('path traced about as bright as the light passes (its own exposure, Auto): 0.6 – 3 ×, a normal picture', 0.6 < ratio < 3.0 and 0.06 < br['pt'][0] < 0.5, (round(ratio, 2), br))
    check('… and no black trees: hardly more black than in the light passes', br['pt'][1] < br['lp'][1] + 0.03, br)
    check('… the work in pieces (as many as the picture\'s size allows)', br['tiles'] >= 2, br['tiles'])
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.resize(); v.needs = true; }"); pg.wait_for_timeout(1500)
    # the graphics card stops in the middle of a path traced render
    pg.evaluate("() => { const a = window.__hp.app; a._renderOpts = { q: 'quick', size: 'screen', method: 'pt', passes: 400, W: 120, H: 80 }; window.__oldView = a.panes[0].view; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.click('#rn-start')
    # (sample 1 or later under way: a fast machine is past the first few before a look every few seconds – 0008a)
    pg.wait_for_function("() => /Sample [1-9][0-9]* of /.test((document.querySelector('#rn-status') || {}).textContent || '')", timeout=400000)
    st = pg.evaluate(STATUS)
    check('(a path traced render under way)', 'Sample' in st and 'samples in' not in st, st)
    pg.evaluate("() => window.__oldView.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()")
    st = wait_status(pg, ['graphics card stopped', 'render stopped'], 60)
    check('graphics card stops mid-render: a clear message (not a black picture "finished")', 'graphics card stopped' in st and 'samples in' not in st, st)
    check('… no picture kept (no black thumbnail)', pg.evaluate(THUMBS) == 0 and not pg.query_selector('#rn-shot img'), pg.evaluate(THUMBS))
    check('… the app says the 3D view starts again', any('3D view is started again' in x for x in pg.evaluate(TOASTS)), pg.evaluate(TOASTS))
    pg.wait_for_timeout(6000)
    nv = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return { fresh: v !== window.__oldView, ok: v.ok, lost: !!v.lost, gl: !v.renderer.getContext().isContextLost(), parts: v.group ? v.group.children.length : 0 }; }")
    check('… and it does: a new 3D view, drawing, with the house in it', nv['fresh'] and nv['ok'] and not nv['lost'] and nv['gl'] and nv['parts'] > 0, nv)
    pg.evaluate("() => { const o = window.__hp.app._renderOpts; o.passes = 2; o.W = 96; o.H = 64; }")
    # (nothing rendered yet in this dialog: it offers Start render again)
    pg.click('#rn-start')
    st = wait_status(pg, ['samples in', 'stopped'], 400)
    check('Render again works on the new view: a picture, not black', 'samples in' in st and pg.evaluate(THUMBS) == 1 and pg.evaluate(SHOT_BLANK) is False, (st, pg.evaluate(SHOT_BLANK)))
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(2000)
    # the light passes on a lost view: the same clear message (it said "createImageData … width is zero")
    lp = pg.evaluate("""async () => { const A = window.__hp, v = A.app.panes[0].view; v.lost = true;
      try { await A.renderView3d(v, { W: 64, H: 48, passes: 1 }); return 'no error'; } catch (e) { return [!!e.lost, e.message]; } finally { v.lost = false; v.needs = true; } }""")
    check('light passes on a lost 3D view: the same clear message, no "createImageData" error', isinstance(lp, list) and lp[0] and 'graphics card stopped' in lp[1], lp)
    check('the message in Dutch too', pg.evaluate("() => window.__hp.trText ? true : true") and 'De grafische kaart is gestopt' in open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'i18n', 'translations.json'), encoding='utf-8').read())
    blank = pg.evaluate("() => { const H = window.__hp, c = document.createElement('canvas'); c.width = 40; c.height = 30; const e = H.canvasBlank(c); const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 40, 30); const k = H.canvasBlank(c); g.fillStyle = '#7a5'; g.fillRect(5, 5, 10, 10); return [e, k, H.canvasBlank(c)]; }")
    check('a black or empty picture is recognised (never kept as a result)', blank == [True, True, False], blank)
    load_pictures(pg, 'sky:day')
    sky = pg.evaluate("() => { const H = window.__hp, s = H.libSkyNoSun('day'), o = H.TEXLIB.sky.day; const F = H.THREE.DataUtils.fromHalfFloat; let mx = 0, mo = 0; for (let i = 0; i < s.image.data.length; i += 4) { mx = Math.max(mx, F(s.image.data[i + 1])); mo = Math.max(mo, F(o.image.data[i + 1])); } return [mx, mo]; }")
    check('the path tracer\'s sky has no sun of its own (the app\'s sun is the sun)', sky[0] < 10 and sky[1] > 50, sky)
    check('PC: no page errors, no shader errors', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); }"); pg.wait_for_timeout(9000); still(pg)
    pg.evaluate("() => { window.__oldView = window.__hp.app.panes[0].view; window.__oldView.renderer.getContext().getExtension('WEBGL_lose_context').loseContext(); }")
    pg.wait_for_timeout(7000)
    nv = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return { fresh: v !== window.__oldView, ok: v.ok, gl: !v.renderer.getContext().isContextLost() }; }")
    check('phone: after the graphics stopped, the 3D view starts again by itself', nv['fresh'] and nv['ok'] and nv['gl'], nv)
    pg.evaluate("() => { const a = window.__hp.app; a._renderOpts = { q: 'quick', size: 'screen', method: 'passes', passes: 2, W: 80, H: 120 }; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.wait_for_timeout(800)
    w = pg.evaluate("() => [!!document.querySelector('#rn-stop'), Math.round(document.querySelector('#rn-start').getBoundingClientRect().height), document.querySelectorAll('#rn-strip .rn-th').length]")
    check('phone: the photo render waits for Start render (big enough to tap)', not w[0] and w[1] >= 40 and w[2] == 0, w)
    pg.tap('#rn-start')
    st = wait_status(pg, ['passes in', 'stopped'], 200)
    check('phone: the photo render (light passes) works on the new view', 'passes in' in st and pg.evaluate(SHOT_BLANK) is False, st)
    pg.tap('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(1500)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
