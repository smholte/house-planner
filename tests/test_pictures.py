"""Material pictures when needed (task 0021): nothing is decoded on the projects page or in 2D; a 3D view decodes only
the picture sets its surfaces use (and the sky it shows); a material changed loads its set then; while a set loads the
surfaces keep their drawn texture (never a picture that isn't there: no black or white flash); the photo render starts
its first pass only when the pictures are in. TEXLIB.ready = nothing loading and every 3D view built with what came.
PC light (the app folder, pictures from lib/) and phone dark (the single file, its built-in pictures)."""
from common import *

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SINGLE = os.path.join(ROOT, 'dist', 'house-planner.html')
READY = "() => window.__hp && window.__hp.TEXLIB.ready"
STATS = "() => window.__hp.TEXLIB.stats()"
# the picture sets the 3D view's materials use (their own, their maps' and the bricks')
USED = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, out = new Set(); v.scene.traverse(o => { if (!o.material) return;
  for (const m of [].concat(o.material)) { if (!m) continue; for (const id of [m.userData && m.userData.lib, ...['map', 'normalMap', 'roughnessMap', 'metalnessMap'].map(k => m[k] && m[k].userData && m[k].userData.lib)]) if (id) out.add(id); } });
  return [...out].sort(); }"""
# materials whose picture has no pixels (a picture used before it was decoded: drawn black or white)
EMPTY = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; let n = 0; v.scene.traverse(o => { if (!o.material) return;
  for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) { const t = m && m[k]; if (!t || t.isCompressedTexture || t.isDataTexture) continue;
    const im = t.image; if (!im || !(im.naturalWidth || im.width)) n++; } }); return n; }"""


def to_3d(pg, scope):
    pg.evaluate("(s) => { const a = window.__hp.app; a.setDim('3d'); a.setScope(s); }", scope)


def loading_then_ready(pg):
    """while the view's sets load: the drawn textures (counted); then wait until they are in and the view is built"""
    pg.wait_for_function("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d'); return v && v.view.spec; }", timeout=60000)
    busy = pg.evaluate("() => window.__hp.TEXLIB.loading > 0 || !window.__hp.TEXLIB.ready")
    empty = pg.evaluate(EMPTY)
    still(pg)
    pg.wait_for_function(READY, timeout=120000)
    return busy, empty


with sync_playwright() as p:
    # ───────── PC light: the app folder ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    pg.wait_for_timeout(1500)
    s0 = pg.evaluate(STATS)
    known = pg.evaluate("() => Object.keys(window.__hp.TEXLIB.data.sets).length")
    check('projects page: the picture sets are known (25), not one picture or sky decoded', known == 25 and s0['pictures'] == 0 and s0['skies'] == [], (known, s0))
    kept = pg.evaluate("() => window.__hp.TEXLIB.kept")
    check('… the base pictures are still kept on the device for offline use (not decoded)', kept is True and pg.evaluate(STATS)['pictures'] == 0, kept)
    open_example(pg); pg.wait_for_timeout(2500)
    s1 = pg.evaluate(STATS)
    check('2D plan: no material picture decoded', s1['pictures'] == 0 and s1['skies'] == [], s1)

    to_3d(pg, 'storey')
    busy, empty = loading_then_ready(pg)
    check('3D: the first picture is drawn while the pictures load, with the drawn textures (no picture without pixels)', busy and empty == 0, (busy, empty))
    s2, u2 = pg.evaluate(STATS), pg.evaluate(USED)
    check('3D one storey: only the sets its surfaces use are decoded (and some of the 25 not)', set(s2['sets']) <= set(u2) and 5 <= len(s2['sets']) < 25, (s2['sets'], u2))
    check('… and they are used: bricks, a floor, the plaster relief', all(k in s2['sets'] for k in ['HouseBrick', 'Concrete034']) and any(k in s2['sets'] for k in ['WoodFloor051', 'Tiles052', 'Concrete014', 'Concrete016']), s2['sets'])
    check('… no picture without pixels once they are in, no error', pg.evaluate(EMPTY) == 0 and not pg.errors, pg.errors[:2])
    print(f"   3D one storey: {len(s2['sets'])} of 25 sets, {s2['pictures']} pictures, {s2['bytes'] / 1048576:.1f} MB decoded, skies {s2['skies']}")

    to_3d(pg, 'house'); pg.wait_for_timeout(1500); still(pg); pg.wait_for_function(READY, timeout=120000)
    s3, u3 = pg.evaluate(STATS), pg.evaluate(USED)
    check('3D whole house: only the sets in view decoded', set(s3['sets']) <= set(u3) | set(s2['sets']) and len(s3['sets']) < 25, (s3['sets'], u3))
    print(f"   3D whole house: {len(s3['sets'])} of 25 sets, {s3['pictures']} pictures, {s3['bytes'] / 1048576:.1f} MB decoded")

    # a material changed: its set is loaded then (a room's floor to carpet – a set the made-up house doesn't use)
    car0 = 'Carpet003' in s3['sets']
    pg.evaluate("""() => { const a = window.__hp.app; a.setScope('storey'); const st = a.currentStorey();
      const r = a.shownVersion().plan.rooms.find(r => r.storey === st.id && r.floor); r.floor = { material: 'carpet', color: '#8A8F96' }; a.refreshViews(false); }""")
    pg.wait_for_timeout(1500); still(pg); pg.wait_for_function(READY, timeout=120000)
    s4, u4 = pg.evaluate(STATS), pg.evaluate(USED)
    check('a floor changed to carpet: the carpet set is loaded then and used', not car0 and 'Carpet003' in s4['sets'] and 'Carpet003' in u4 and not pg.errors, (car0, s4['sets'], pg.errors[:2]))
    b.close()

    # the photo render: its first pass only when the pictures are in (a fresh page, started at once after 2D → 3D)
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    r = pg.evaluate("""async () => { const H = window.__hp, a = H.app; a.setDim('3d'); a.setScope('storey');
      const pane = a.panes.find(p => p.kind === '3d'); const before = H.TEXLIB.ready;
      let first = null;
      await H.renderView3d(pane.view, { passes: 1, W: 64, H: 48, onPass: () => { if (first === null) first = [H.TEXLIB.ready, H.TEXLIB.stats().sets.length]; } });
      return { before, first }; }""")
    check('photo render started before the pictures were in: its first pass waits for them', r['before'] is False and r['first'] and r['first'][0] is True and r['first'][1] >= 5, r)
    check('… no error', not pg.errors, pg.errors[:2])
    b.close()

    # ───────── phone dark: the single file ─────────
    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, color_scheme='dark')
    pg = ctx.new_page(); pg.set_default_timeout(90000)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + SINGLE); pg.wait_for_function(READY, timeout=60000)
    pg.evaluate("() => { window.__hp.Settings.set('ao', false); window.__hp.Settings.set('autoQ', { test: true }); }")
    pg.wait_for_timeout(1000)
    t0 = pg.evaluate("() => ({ src: window.__hp.TEXLIB.source, n: Object.keys(window.__hp.TEXLIB.data.sets).length, s: window.__hp.TEXLIB.stats() })")
    check('single file (phone): the built-in pictures are known, none decoded on the projects page', t0['src'] == 'built-in' and t0['n'] == 25 and t0['s']['pictures'] == 0 and t0['s']['skies'] == [], t0)
    pg.click('#btn-example'); pg.wait_for_timeout(2500)
    check('… 2D plan: none decoded', pg.evaluate(STATS)['pictures'] == 0, pg.evaluate(STATS))
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('storey'); }")
    pg.wait_for_function("() => { const v = window.__hp.app.panes.find(p => p.kind === '3d'); return v && v.view.spec; }", timeout=60000)
    pg.wait_for_timeout(1500); pg.wait_for_function(READY, timeout=120000)
    s5, u5 = pg.evaluate(STATS), pg.evaluate(USED)
    px = pg.evaluate("() => window.__hp.TEXLIB.px.get('Concrete034|normal')")
    check('… 3D: the built-in pictures of the sets in view decoded (512), only those', set(s5['sets']) <= set(u5) and 5 <= len(s5['sets']) < 25 and px == 512 and not errs, (s5['sets'], u5, px, errs[:2]))
    pg.screenshot(path=SHOTS + 'pictures-phone-3d.png')
    b.close()

sys.exit(summary())
