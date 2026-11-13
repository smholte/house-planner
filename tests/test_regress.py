"""Earlier features that must keep working: home view gestures (2D/3D, mouse and touch), tapping rooms, slices
(place, apply, edit + Esc, several, delete), side by side / compare keep the view, the compare slider,
ViewCube home view set / reset and kept through export + import. The IFC import runs when HP_IFC_DIR points at
a folder with the builder's .ifc files, else on the made-up house's IFC (tools/testhouse)."""
from common import *
import glob
CAM2 = "() => { const c = window.__hp.app.panes[0].view.cam; return [c.s, c.tx, c.ty].map(v => +v.toFixed(2)); }"
CAM3 = "() => { const v = window.__hp.app.panes[0].view; return [...v.camera.position.toArray(), ...v.controls.target.toArray()].map(x => +x.toFixed(2)); }"
def close(a, b, tol=0.05): return all(abs(x - y) <= tol * max(1, abs(y)) for x, y in zip(a, b))
PL = "() => { const v = window.__hp.app.panes[0].view; return { sl: v.sl ? (v.sl.n0 ? 'draft' : 'pick') : null, rows: v.slices().length, planes: v.clipPlanes.length }; }"
FINDHOUSE = """() => { const v = window.__hp.app.panes[0].view; const r = v.renderer.domElement.getBoundingClientRect();
  for (let y = r.top + r.height * 0.45; y < r.bottom - 20; y += 8) for (let x = r.left + r.width * 0.4; x < r.right - 20; x += 8) { const h = v.firstHit({ clientX: x, clientY: y }); if (h) return [x, y]; } return null; }"""
with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#storey-tabs button:has-text("Begane grond")'); pg.wait_for_timeout(600)
    home2 = pg.evaluate(CAM2)
    pg.mouse.move(500, 450); pg.mouse.wheel(0, -600); pg.wait_for_timeout(300)
    pg.mouse.down(); pg.mouse.move(650, 520, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    moved2 = pg.evaluate(CAM2)
    pg.mouse.click(600, 450, button='middle'); pg.wait_for_timeout(600)
    check('2D: middle click goes home', close(pg.evaluate(CAM2), home2) and not close(moved2, home2))
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(1500)
    still(pg)
    home3 = pg.evaluate(CAM3)
    pg.mouse.move(600, 450); pg.mouse.down(); pg.mouse.move(800, 380, steps=8); pg.mouse.up(); pg.wait_for_timeout(500)
    still(pg)
    pg.mouse.click(600, 450, button='middle'); pg.wait_for_timeout(1000)
    still(pg)
    check('3D: middle click goes home', close(pg.evaluate(CAM3), home3))
    # slices on the whole house
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(300)
    pg.click('#storey-tabs button:has-text("Whole house")'); pg.wait_for_timeout(3500)
    pg.click('.slice-btn'); pg.wait_for_timeout(300)
    check('slice: pick mode', pg.evaluate(PL)['sl'] == 'pick')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('slice: Esc cancels picking', pg.evaluate(PL)['sl'] is None)
    pg.click('.slice-btn'); pg.wait_for_timeout(300)
    pt = pg.evaluate(FINDHOUSE); pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(1000)
    check('slice: placed', pg.evaluate(PL)['sl'] == 'draft')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(800)
    st = pg.evaluate(PL)
    check('slice: Enter applies (1 row, 1 plane)', st == {'sl': None, 'rows': 1, 'planes': 1}, st)
    pg.click('.slice-btn'); pg.wait_for_timeout(300)
    pt = pg.evaluate(FINDHOUSE); pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(800)
    pg.click('.sp-apply'); pg.wait_for_timeout(800)
    check('slice: a second one', pg.evaluate(PL)['rows'] == 2)
    pg.click('.sl-allbtn'); pg.wait_for_timeout(800)
    check('slice: delete all', pg.evaluate(PL) == {'sl': None, 'rows': 0, 'planes': 0})
    # side by side keeps the 3D view
    pg.mouse.move(600, 450); pg.mouse.down(); pg.mouse.move(700, 420, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    still(pg)
    before = pg.evaluate(CAM3)
    pg.click('#btn-compare'); pg.wait_for_timeout(3000)
    after = pg.evaluate(CAM3)
    # the same point looked at, from (about) the same distance (the turn may still glide a little)
    import math
    dist = lambda c: math.dist(c[:3], c[3:])
    check('side by side keeps the view', close(after[3:], before[3:], 0.02) and abs(dist(after) - dist(before)) < 0.05 * dist(before), (before, after))
    pg.click('#btn-compare'); pg.wait_for_timeout(2000)
    pg.click('#btn-swipe'); pg.wait_for_timeout(3000)
    check('compare slider: two panes and the bar', len(pg.evaluate("() => window.__hp.app.panes")) == 2 and pg.query_selector('.swipe-bar') is not None)
    pg.click('#btn-swipe'); pg.wait_for_timeout(2000)
    # ViewCube home view
    pg.click('.vc-menu'); pg.wait_for_timeout(300)
    pg.click('.menu .mi:has-text("Set current view as home")'); pg.wait_for_timeout(800)
    hv = pg.evaluate("() => window.__hp.app.project.homeViews")
    check('home view set in the house', hv and 'house' in hv)
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    check('home view in the exported file', 'house' in json.loads(text)['projects'][0]['project'].get('homeViews', {}))
    pg.click('.vc-menu'); pg.wait_for_timeout(300)
    pg.click('.menu .mi:has-text("Reset home view")'); pg.wait_for_timeout(800)
    check('home view reset', 'house' not in (pg.evaluate("() => window.__hp.app.project.homeViews") or {}))
    check('no page errors', not pg.errors, pg.errors)
    b.close()
    # touch: double tap goes home, a single tap selects a room
    b, pg = open_app(p, phone=True)
    open_example(pg)
    pg.click('#storey-tabs button:has-text("Begane grond")'); pg.wait_for_timeout(600)
    home2 = pg.evaluate(CAM2)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.cam.s *= 2.5; v.cam.tx -= 300; v.applyCam(); }")
    pg.touchscreen.tap(200, 500); pg.wait_for_timeout(120); pg.touchscreen.tap(202, 503); pg.wait_for_timeout(600)
    check('touch 2D: double tap goes home', close(pg.evaluate(CAM2), home2))
    # (since 30 Oct the phone has one bar above the plan: tap the middle of a room rather than a fixed spot)
    for _ in range(30):   # the 2D view glides home: wait till it stands still
        c1 = pg.evaluate(CAM2); pg.wait_for_timeout(250)
        if c1 == pg.evaluate(CAM2): break
    x0, y0, x1, y1 = rooms(pg)[by_house(pg, 'Keuken', 'Kamer')]
    pg.touchscreen.tap(*to_screen(pg, (x0 + x1) / 2, (y0 + y1) / 2 + 0.6)); pg.wait_for_timeout(700)
    check('touch: a tap selects a room', (pg.evaluate("() => window.__hp.app.selection") or {}).get('type') == 'room')
    check('touch: no page errors', not pg.errors, pg.errors)
    b.close()
    # (the builder's .ifc files of a house when HP_IFC_DIR is set; else the made-up house's IFC: tools/testhouse/testhouse.ifc)
    ifc_dir = os.environ.get('HP_IFC_DIR') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'testhouse')
    if ifc_dir and glob.glob(os.path.join(ifc_dir, '*.ifc')):
        b, pg = open_app(p)
        with pg.expect_file_chooser() as fc:
            pg.click('#btn-import')
        fc.value.set_files(sorted(glob.glob(os.path.join(ifc_dir, '*.ifc'))))
        pg.wait_for_function("() => window.__hp && window.__hp.app.project", timeout=90000); pg.wait_for_timeout(1500)
        got = pg.evaluate("() => { const p = window.__hp.app.project; return [p.storeys.length, p.versions[0].plan.walls.length, !!p.shell]; }")
        got[1] = got[1] > (50 if os.environ.get('HP_IFC_DIR') else 30)   # (the owner's IFC: over 50 walls; the made-up one: 43)
        check('IFC import', got == [3, True, True], got)
        b.close()
    else:
        print('(IFC import skipped: set HP_IFC_DIR to a folder with the .ifc files)')
sys.exit(summary())
