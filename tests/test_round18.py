"""Eighteenth round (1 Nov, night): the graphics update – three.js r187 (from r170), real material pictures (ambientCG,
CC0) for all materials, real skies (Poly Haven, CC0) for the light and reflections, and while walking on a computer
the sun with two shadow maps that follow the view (sharper shadows close by); the photo render path traced on computers
(three-gpu-pathtracer). The house's three bricks
(dark plinth, normal, whiteish) by the brick colours of the builder's model, the roof tiles, floors cut plank by plank
and tile by tile from the pictures in the chosen colours, plaster relief under the paint, bathroom tiles, the
kitchen's marble worktop and wooden fronts, black metal for door handles and the sink, sofa fabric, grass, garden
tiles, gravel, asphalt, tree bark. The hosted versions load them from the asset library lib/ (task 0009); the single file has them inside.
PC (light) and phone (dark)."""
from common import *

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBS = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; const out = {}; v.scene.traverse(o => { if (!o.isMesh) return;
  for (const m of [].concat(o.material)) { if (!m) continue; const ids = [m.userData && m.userData.lib, m.map && m.map.userData && m.map.userData.lib, m.normalMap && m.normalMap.userData && m.normalMap.userData.lib];
    for (const id of ids) if (id) out[id] = (out[id] || 0) + 1; } }); return out; }"""
READY = "() => window.__hp && window.__hp.TEXLIB.ready"

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    logs = []
    pg.on('console', lambda m: logs.append(m.text[:200]) if m.type == 'error' else None)
    check('three.js r187', pg.evaluate("() => window.__hp.THREE.REVISION") == '187', pg.evaluate("() => window.__hp.THREE.REVISION"))
    pg.wait_for_function(READY, timeout=60000)
    info = pg.evaluate("() => { const T = window.__hp.TEXLIB; return [Object.keys(T.data.sets).length, Object.keys(T.sky), T.sky.day && T.sky.day.userData.avg, T.img.size]; }")
    check('the material pictures arrive (hosted: from lib/): 25 sets, decoded', info[0] == 25 and info[3] >= 25 * 3, info)
    check('… and the two skies (day, sunset), high dynamic range', sorted(info[1]) == ['day', 'sunset'] and info[2] > 0, info)
    open_example(pg)
    # (on the owner's build his floor is a photo of his own plank; here the library's oak, as the example had before)
    pg.evaluate("() => { const a = window.__hp.app; for (const r of a.shownVersion().plan.rooms) if (r.floor && r.floor.photo && window.__hp.ownId(r.floor.photo.img)) r.floor = { material: 'oak', color: '#C49A6C' }; }")
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    L = pg.evaluate(LIBS)
    check('the house: its bricks (since 1 Nov one waalformaat wall in wildverband, coloured three ways)', L.get('HouseBrick', 0) >= 3, L)
    check('… the roof tiles', L.get('RoofingTiles013A', 0) > 0, L)
    # (since round 33 the road is the street's herringbone pavers, drawn by the app; the pavements are Concrete014)
    check('… grass, garden tiles, the pavements\' concrete and tree bark in the garden', all(L.get(k, 0) > 0 for k in ['Grass005', 'Tiles050', 'Concrete014', 'Bark012']), L)
    check('… the floors: oak cut plank by plank, tiles tile by tile', L.get('WoodFloor051', 0) > 0 and L.get('Tiles052', 0) > 0, L)
    check('… plaster relief under the paint of the walls', L.get('Concrete034', 0) > 0, L)
    check('… the kitchen: marble worktop, black metal (sink, handles)', L.get('Marble021', 0) > 0 and L.get('Metal028', 0) > 0, L)
    pg.screenshot(path=SHOTS + 'r18-house.png')
    brick = pg.evaluate("() => [[0.31, 0.22, 0.16], [0.51, 0.31, 0.24], [1, 1, 1]].map(c => window.__hp.libBrickFor(c))")
    check('the builder\'s brick colours → the brown plinth, the red-orange brick, the white brick', brick == ['brown', 'red', 'white'], brick)
    # 1e verdieping: the bathroom tiles
    pg.evaluate("() => { const a = window.__hp.app; a.setScope('storey'); a.view.storeyId = a.project.storeys.find(s => s.name === '1e verdieping').id; a.renderEditorChrome(); a.setupPanes(true); }"); pg.wait_for_timeout(8000); still(pg)
    L1 = pg.evaluate(LIBS)
    check('1e verdieping: the bathroom wall tiles from the tile picture', L1.get('Tiles107', 0) > 0, L1)
    pg.screenshot(path=SHOTS + 'r18-first-floor.png')
    # a sofa in the fabric picture
    pg.evaluate("""() => { const a = window.__hp.app; const st = a.project.storeys.find(s => s.name === 'Begane grond'); a.view.storeyId = st.id; a.renderEditorChrome(); a.setupPanes(true);
      a.furnMutate(l => { l.items.push({ id: 'f_sofa_t', type: 'sofa3', storey: st.id, x: 3, y: 10.5, rot: 0, w: 2.2, d: 0.92, h: 0.84, color: '#7D8790', shop: {} }); }); }""")
    pg.wait_for_timeout(8000); still(pg)
    L2 = pg.evaluate(LIBS)
    check('a sofa in the fabric picture, in its own colour', L2.get('Fabric028', 0) > 0, L2)
    # High: the real sky for the light and the reflections, turned to the app's sun
    pg.evaluate("() => { window.__hp.app.setQuality('high'); }"); pg.wait_for_timeout(12000); still(pg)
    sk = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return [!!v.scene.environment, v.skyInfo && v.skyInfo.avg, v.scene.environmentIntensity, v.scene.environmentRotation.y]; }")
    check('High: the light and reflections from the real sky (scaled to the old brightness, turned to the sun)', sk[0] and sk[1] and 0.2 < sk[2] < 2 and sk[3] != 0, sk)
    pg.screenshot(path=SHOTS + 'r18-high.png')
    # Fast: colour only (no relief or gloss maps)
    pg.evaluate("() => { window.__hp.app.setQuality('fast'); }"); pg.wait_for_timeout(8000); still(pg)
    nm = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; let n = 0, lib = 0; v.scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && m.userData && m.userData.lib) { lib++; if (m.normalMap) n++; } }); return [lib, n]; }")
    check('Fast: the pictures stay, without relief maps (cheaper)', nm[0] > 0 and nm[1] == 0, nm)
    pg.evaluate("() => { window.__hp.app.setQuality('beautiful'); }"); pg.wait_for_timeout(4000)
    # walking on a computer: the sun with two shadow maps that follow the view (sharper close by)
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); }"); pg.wait_for_timeout(1500)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(5000)
    pg.evaluate("() => { const w = window.__hp.app.walker; w.x = 3.0; w.y = 10.5; w.yaw = 0.6; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }"); pg.wait_for_timeout(4000)
    cs = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return [!!v.csmSun && !!v.csmSun.isSunLight, v.sun.visible, v.csmSun && v.csmSun.shadow.mapSize.x, v.csmSun && +v.csmSun.intensity.toFixed(3) === +v.sun.intensity.toFixed(3)]; }")
    check('walking (computer): the sun with two shadow maps that follow you – sharper shadows close by; the usual sun off', cs[0] and cs[1] is False and cs[2] >= 1024 and cs[3], cs)
    pg.screenshot(path=SHOTS + 'r18-walk-near-sun.png')
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(3000)
    cs = pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return [!!v.csmSun, v.sun.visible]; }")
    check('… stop walking: the usual sun again', cs == [False, True], cs)
    # the photo render, path traced (three-gpu-pathtracer): tiny and short here – the test computer draws in software
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a._renderOpts = { q: 'quick', size: 'screen', method: 'pt', passes: 1, W: 96, H: 64 }; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.click('#rn-start')
    pg.wait_for_timeout(1500)
    how = pg.evaluate("() => [...document.querySelectorAll('.rn-method button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])")
    check('Photo render on a computer: “Path traced (most real)” or “Light passes (faster)”', len(how) == 2 and 'Path traced' in how[0][0] and how[0][1] == 'true', how)
    st = None
    for i in range(150):
        pg.wait_for_timeout(2000)
        st = pg.evaluate("() => { const e = document.querySelector('#rn-status'); return e ? e.textContent : null; }")
        if st and ('samples in' in st or 'stopped' in st): break
    check('… path traced: a picture after the samples (the light followed through the house)', st and '1 samples in' in st or (st and 'samples in' in st), st)
    # (since 1 Nov night the render stays open for Continue until the view is wanted back: Back to the view, or Close)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(1500)
    res = pg.evaluate("() => { const R = window.__hp.app.panes[0].view; return [R.borrowed, R.rendering]; }")
    check('… and the 3D view is back as it was', res == [None, False], res)
    check('no page errors, no shader errors (PC)', not pg.errors and not [l for l in logs if 'Shader' in l or 'WebGLProgram' in l], (pg.errors[:3], logs[:3]))
    b.close()

    # the single file has the pictures inside (no lib/ next to it)
    single = os.path.join(ROOT, 'dist', 'house-planner.html')
    if os.path.exists(single):
        b2 = p.chromium.launch(args=GL)
        pg2 = b2.new_page(viewport={'width': 1000, 'height': 700})
        errs = []
        pg2.on('pageerror', lambda e: errs.append(str(e)))
        pg2.goto('file://' + single); pg2.wait_for_function(READY, timeout=60000)
        check('the single file: the pictures are inside (works opened from the device, no library)', pg2.evaluate("() => Object.keys(window.__hp.TEXLIB.data.sets).length") == 25 and not errs, errs[:2])
        b2.close()
    web = os.path.join(ROOT, 'dist', 'web')
    if os.path.isdir(web):
        sw = open(os.path.join(web, 'sw.js')).read()
        check('the web version: the pictures in lib/ next to index.html (the app keeps them on the device), not inside the page', os.path.exists(os.path.join(web, 'lib', 'library.json')) and 'TEXLIB_DATA = null' in open(os.path.join(web, 'index.html')).read())

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; for (const r of a.shownVersion().plan.rooms) if (r.floor && r.floor.photo && window.__hp.ownId(r.floor.photo.img)) r.floor = { material: 'oak', color: '#C49A6C' }; }")
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); }"); pg.wait_for_timeout(9000); still(pg)
    L = pg.evaluate(LIBS)
    check('phone: the pictures in 3D too (bricks, floors, grass)', L.get('HouseBrick', 0) > 0 and L.get('WoodFloor051', 0) > 0 and L.get('Grass005', 0) > 0, L)
    pg.screenshot(path=SHOTS + 'r18-phone-dark.png')
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); }"); pg.wait_for_timeout(1500)
    pg.tap('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(5000)
    check('phone walking: the usual sun (one shadow map: cheaper)', pg.evaluate("() => { const v = window.__hp.app.panes[0].view; return !v.csmSun && v.sun.visible; }"))
    pg.tap('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const a = window.__hp.app; a._renderOpts = null; a.renderSheet(); }"); pg.wait_for_timeout(2000)
    check('phone: the photo render uses light passes (no path tracing on a phone)', pg.locator('.rn-method').count() == 0 and pg.evaluate("() => window.__hp.app._renderOpts.method") == 'passes')
    pg.evaluate("() => { const b = document.querySelector('#rn-stop'); if (b) b.click(); }"); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog .dlg-foot button'); if (d) d.click(); }"); pg.wait_for_timeout(1500)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
