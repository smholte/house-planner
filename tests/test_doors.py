"""Doors open and close: Build (2D pop-up, 3D pop-up, details button), View (2D and 3D tap)."""
from common import *
DOOR = """() => { const a = window.__hp.app, plan = a.shownVersion().plan; const op = plan.openings.find(o => { const w = plan.walls.find(x => x.id === o.wall); return o.kind === 'door' && w && w.storey === a.view.storeyId && w.kind === 'interior'; }); const w = plan.walls.find(x => x.id === op.wall); const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]]; const L = Math.hypot(...d); return { id: op.id, c: [w.a[0] + d[0] / L * op.pos, w.a[1] + d[1] / L * op.pos] }; }"""
STATE = "(id) => window.__hp.app.isDoorClosed(id)"
FIND = """(id) => { const v = window.__hp.app.panes[0].view; const r = v.renderer.domElement.getBoundingClientRect();
  for (let y = r.top + 10; y < r.bottom - 10; y += 6) for (let x = r.left + 10; x < r.right - 10; x += 6) { const h = v.firstHit({ clientX: x, clientY: y }); if (h && h.object.userData.door === id) return [x, y]; }
  return null; }"""
with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    d = pg.evaluate(DOOR)
    pg.mouse.click(*to_screen(pg, *d['c'])); pg.wait_for_timeout(400)
    check('Build 2D: tapping a door shows the pop-up', pg.query_selector('.door-pop') is not None)
    pg.click('.door-pop .btn.primary'); pg.wait_for_timeout(300)
    check('pop-up closes the door', pg.evaluate(STATE, d['id']) is True)
    pg.click('.inspector button:has-text("Open door")'); pg.wait_for_timeout(300)
    check('details button opens it', pg.evaluate(STATE, d['id']) is False)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.mouse.click(*to_screen(pg, *d['c'])); pg.wait_for_timeout(500)
    check('View 2D: a tap closes it straight away', pg.evaluate(STATE, d['id']) is True)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)
    pt = pg.evaluate(FIND, d['id'])
    check('door can be hit in 3D', pt is not None)
    if pt:
        pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(900)
        check('View 3D: a tap opens it', pg.evaluate(STATE, d['id']) is False)
        pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(800)
        pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500)
        pt = pg.evaluate(FIND, d['id'])
        pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(500)
        check('Build 3D: pop-up', pg.query_selector('.door-pop') is not None)
        pg.screenshot(path=SHOTS + 'doors-build3d.png')
        pg.click('.door-pop .btn.primary'); pg.wait_for_timeout(600)
        check('Build 3D: pop-up closes it', pg.evaluate(STATE, d['id']) is True)
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    check('door state in the exported file', json.loads(text)['projects'][0]['project']['doorState'].get(d['id']) == 'closed')
    # outside doors of the builder's model (session 2): closed at first, they swing like the plan shows
    outer = pg.evaluate("() => [...window.__hp.app.shell.doorOps]")
    check('outside doors can swing (garden doors, front door)', len(outer) >= 5, outer)
    front = pg.evaluate("""() => { const pl = window.__hp.app.shownVersion().plan; const o = pl.openings.find(x => window.__hp.app.shell.doorOps.has(x.id) && !x.outward); return o && o.id; }""")
    check('outside doors start closed', all(pg.evaluate(STATE, i) for i in outer))
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    # in front of the front door, 3.8 m out from the façade (the side of its wall with no room)
    pg.evaluate("""(id) => { const a = window.__hp.app, pl = a.shownVersion().plan, o = pl.openings.find(x => x.id === id), w = pl.walls.find(x => x.id === o.wall);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], c = [w.a[0] + d[0] * o.pos, w.a[1] + d[1] * o.pos];
      const inside = (q, P) => { let k = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > q[1]) !== (P[j][1] > q[1]) && q[0] < (P[j][0] - P[i][0]) * (q[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) k = !k; return k; };
      let n = [-d[1], d[0]]; const q = [c[0] + n[0] * 0.6, c[1] + n[1] * 0.6];
      if (pl.rooms.some(r => r.storey === w.storey && inside(q, r.poly))) n = [-n[0], -n[1]];
      const v = a.panes[0].view; v.controls.target.set(c[0] + n[0] * 0.1, 1.0, c[1] + n[1] * 0.1); v.camera.position.set(c[0] + n[0] * 3.8 + d[0] * 0.2, 1.6, c[1] + n[1] * 3.8 + d[1] * 0.2); v.controls.update(); v.needs = true; }""", front); pg.wait_for_timeout(1500)
    pg.evaluate(STILL)  # the camera glides; the test browser can be slow (more on the façade since the installations)
    pt = pg.evaluate(FIND, front)
    check('the front door can be hit in 3D', pt is not None)
    if pt:
        pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(1200)
        check('a tap opens the front door', pg.evaluate(STATE, front) is False and pg.evaluate("(id) => window.__hp.app.project.doorState[id]", front) == 'open')
        # the leaf swings over several frames; the test browser draws slowly, so wait for it (up to 20 s)
        try: pg.wait_for_function("(id) => window.__hp.app.panes[0].view.doorMap.get(id).every(d => Math.abs(d.grp.rotation.y) > 0.8)", arg=front, timeout=20000)
        except Exception: pass
        ang = pg.evaluate("(id) => window.__hp.app.panes[0].view.doorMap.get(id).map(d => [+d.grp.rotation.y.toFixed(2), +d.target.toFixed(2)])", front)
        check('its leaf turned', all(abs(t) > 1.2 and abs(a) > 0.8 for a, t in ang), ang)
        pg.screenshot(path=SHOTS + 'doors-front-open.png', timeout=120000)  # the first picture after the swing is slow in the test browser
        # (tap the leaf where it is now: open, it may no longer be under the first point)
        pt2 = pg.evaluate(FIND, front) or pt
        pg.mouse.click(pt2[0], pt2[1]); pg.wait_for_timeout(1200)
        check('a second tap closes it', pg.evaluate(STATE, front) is True, (pt, pt2))
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
