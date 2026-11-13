"""3D looks and what is kept with the house: evening light, Fast / Beautiful, slices and view settings kept in the
house file (also after reloading and export / import), measuring in 3D, saving a picture, the colour library,
and the built-in PDF reader (no internet)."""
from common import *
from PIL import Image, ImageDraw
pdf = SHOTS + 'plan.pdf'
im = Image.new('RGB', (1400, 1000), 'white'); d = ImageDraw.Draw(im); d.rectangle([100, 100, 1300, 900], outline='black', width=12); d.line([700, 100, 700, 900], fill='black', width=8); im.save(pdf)
FINDHOUSE = """() => { const v = window.__hp.app.panes[0].view; const r = v.renderer.domElement.getBoundingClientRect();
  for (let y = r.top + r.height * 0.4; y < r.bottom - 20; y += 8) for (let x = r.left + r.width * 0.35; x < r.right - 20; x += 8) { const h = v.firstHit({ clientX: x, clientY: y }); if (h) return [x, y]; } return null; }"""
with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(500)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500)
    pg.click('#btn-viewopts'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Evening")'); pg.wait_for_timeout(2500)
    pg.keyboard.press('Escape')
    check('evening: lights in the rooms', pg.evaluate("() => window.__hp.app.panes[0].view.lightPool.length") > 0 and pg.evaluate("() => window.__hp.app.panes[0].view.lightSpots.length") > 5)
    pg.screenshot(path=SHOTS + 'v3-evening.png')
    pg.click('#btn-viewopts'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Day")'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Fast")'); pg.wait_for_timeout(2500)
    pg.keyboard.press('Escape')
    check('Fast: no shadows, 1 pixel', pg.evaluate("() => [window.__hp.app.panes[0].view.renderer.getPixelRatio(), window.__hp.app.panes[0].view.renderer.shadowMap.enabled]") == [1, False])
    pg.click('#btn-viewopts'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Beautiful")'); pg.wait_for_timeout(2500)
    pg.keyboard.press('Escape')
    check('Beautiful: shadows', pg.evaluate("() => window.__hp.app.panes[0].view.renderer.shadowMap.enabled"))
    # soft shadows in corners (off in the other tests): drawn when the view stands still
    pg.evaluate("() => window.__hp.Settings.set('ao', 'auto')")
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.controls.target.set(5.0, 0.6, 9.5); v.camera.position.set(9.0, 4.6, 14.5); v.controls.update(); v.needs = true; }"); pg.wait_for_timeout(3000)
    check('soft shadows in corners are on (Beautiful, computer)', pg.evaluate("() => !!window.__hp.app.panes[0].view.ao"))
    pg.screenshot(path=SHOTS + 'v3-ao.png')
    pg.click('#btn-viewopts'); pg.wait_for_timeout(300)
    pg.click('#mi-ao'); pg.wait_for_timeout(300)
    pg.keyboard.press('Escape')
    check('the soft shadows switch goes off', pg.evaluate("() => window.__hp.app.settings.ao === false && !window.__hp.app.panes[0].view.aoWanted()"))
    # a slice and a view setting, kept with the house
    pg.evaluate("() => window.__hp.app.setScope('house')"); pg.wait_for_timeout(2500)
    pg.click('.slice-btn'); pg.wait_for_timeout(300)
    pt = pg.evaluate(FINDHOUSE)
    pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(600)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(800)
    pg.evaluate("() => { const a = window.__hp.app; a.settings.roof = false; window.__hp.Settings.save(); }"); pg.wait_for_timeout(800)
    check('slice and roof setting in the house', pg.evaluate("() => [Object.keys(window.__hp.app.project.slices || {}).length, window.__hp.app.project.viewSettings.roof]") == [1, False])
    pg.evaluate("() => window.__hp.Saver.flushNow()"); pg.wait_for_timeout(600)
    pg.evaluate("() => { window.__hp.app.settings.roof = true; }")
    pg.reload(); pg.wait_for_timeout(4000)
    check('after reloading: slice and roof setting are back', pg.evaluate("() => [window.__hp.app.panes[0].view.slices().length, window.__hp.app.settings.roof]") == [1, False])
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.deleteSlices(v.slices().map(s => s.id)); window.__hp.app.settings.roof = true; window.__hp.Settings.save(); }"); pg.wait_for_timeout(500)
    # measuring in 3D (View mode)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => window.__hp.app.setScope('storey', window.__hp.app.project.storeys[0].id)"); pg.wait_for_timeout(2500)
    pg.click('#toolrail button[data-tool="measure"]'); pg.wait_for_timeout(500)
    check('measure stays in 3D', pg.evaluate("() => window.__hp.app.view.dim") == '3d')
    pt = pg.evaluate(FINDHOUSE)
    pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(300)
    pg.mouse.click(pt[0] + 120, pt[1] + 40); pg.wait_for_timeout(500)
    lab = pg.inner_text('.m3-label') if pg.query_selector('.m3-label') else ''
    check('3D distance shown', 'mm' in lab, lab)
    pg.screenshot(path=SHOTS + 'v3-measure.png')
    # picture
    with pg.expect_download() as dl:
        pg.evaluate("() => window.__hp.app.savePicture()")
    path = dl.value.path()
    check('picture of the 3D view saved', dl.value.suggested_filename.endswith('.png') and os.path.getsize(path) > 20000, dl.value.suggested_filename)
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1200)
    with pg.expect_download() as dl:
        pg.evaluate("() => window.__hp.app.savePicture()")
    check('picture of the 2D plan saved', os.path.getsize(dl.value.path()) > 20000)
    dl.value.save_as(SHOTS + 'v3-picture-2d.png')
    # colour library
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(800)
    pg.mouse.click(*room_screen(pg, 'Woonkamer', 0.25, 0.25)); pg.wait_for_timeout(600)
    pg.click('.inspector button:has-text("Colour library: RAL")'); pg.wait_for_timeout(400)
    pg.fill('.col-body input[type=search]', '9010'); pg.wait_for_timeout(300)
    pg.click('.col-card >> nth=0'); pg.wait_for_timeout(500)
    got = pg.evaluate("() => { const r = window.__hp.app.selectionTarget(); return [r.wallColor, r.wallColorName]; }")
    check('RAL 9010 picked for the walls', got[0] == '#FFFFFF' and 'RAL 9010' in got[1], got)
    check('213 RAL colours', pg.evaluate("() => window.__hp.RAL.length") == 213)
    # the PDF reader: works without internet (the browser's network is cut off)
    pg.context.set_offline(True)
    st = pg.evaluate("() => window.__hp.app.view.storeyId")
    with pg.expect_file_chooser() as fc:
        pg.evaluate("(st) => { window.__hp.app.importDrawing(st); }", st)
    fc.value.set_files(pdf)
    try: pg.wait_for_function("(st) => !!window.__hp.app.project.underlays[st]", arg=st, timeout=60000)
    except Exception: pass
    pg.wait_for_timeout(500)
    check('PDF opened offline as a drawing', pg.evaluate("(st) => !!window.__hp.app.project.underlays[st]", st))
    pg.context.set_offline(False)
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
