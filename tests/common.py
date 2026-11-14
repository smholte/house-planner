"""Shared helpers for the House Planner browser tests (Playwright for Python).

The built app is served on port 8765 automatically when nothing listens there (or serve it yourself:
                     cd dist/house-planner-app && python3 -m http.server 8765)
Then:                python3 tests/run_all.py            (or one file: python3 tests/test_furniture.py)
Screenshots go to tests/shots/ (not kept in the zip).
"""
import os, sys, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get('HP_URL', 'http://localhost:8765/index.html')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots') + os.sep
os.makedirs(SHOTS, exist_ok=True)
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# serve the built app when nothing is listening yet (stopped again when the test ends)
def _serve():
    import socket, subprocess, atexit, time
    from urllib.parse import urlparse
    u = urlparse(BASE)
    if u.hostname not in ('localhost', '127.0.0.1'):
        return
    port = u.port or 80
    with socket.socket() as sk:
        if sk.connect_ex(('127.0.0.1', port)) == 0:
            return
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'house-planner-app')
    pr = subprocess.Popen([sys.executable, '-m', 'http.server', str(port)], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atexit.register(pr.terminate)
    for _ in range(50):
        with socket.socket() as sk:
            if sk.connect_ex(('127.0.0.1', port)) == 0:
                return
        time.sleep(0.1)
_serve()

RESULTS = []
def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '   ' + str(detail)))
    return ok
def summary():
    bad = [n for n, ok in RESULTS if not ok]
    print(f'\n{len(RESULTS) - len(bad)}/{len(RESULTS)} passed' + (': failed ' + ', '.join(bad) if bad else ''))
    return 0 if not bad else 1

def open_app(p, phone=False, theme='light', ao=False, init=None):
    b = p.chromium.launch(args=GL)
    if phone:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, color_scheme=theme, accept_downloads=True)
    else:
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, color_scheme=theme, accept_downloads=True)
    pg = ctx.new_page()
    # the example is the real house (furniture, garden, trees): the software GPU of the test browser can be a minute behind
    pg.set_default_timeout(90000)
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    # scripts that run before the app (e.g. fixtures/fake-xr.js: a pretend AR phone)
    for f in (init or []): pg.add_init_script(path=f)
    pg.goto(BASE); pg.wait_for_timeout(800)
    # soft shadows in corners: off in the tests (the software GPU of the test browser is far too slow for them);
    # test_view3d.py switches them on to test them
    if not ao: pg.evaluate("() => window.__hp.Settings.set('ao', false)")
    # the automatic quality choice of a first 3D view: not in the tests (the test browser is always slow)
    pg.evaluate("() => window.__hp.Settings.set('autoQ', { test: true })")
    return b, pg

def open_example(pg):
    pg.click('#btn-example'); pg.wait_for_timeout(2500)

# the example's furniture as before round 38: without the Renato set and the layout "Layout 1 + Renato"
# (for tests that place and count furniture from a known start)
def without_renato(pg):
    pg.evaluate("""() => { const a = window.__hp.app, F = a.project.furniture;
      F.layouts = F.layouts.filter(l => !(window.__hp.ownId(l.id) && /renato/.test(l.id))); F.sets = F.sets.filter(s => s.id !== 'fs_renato_shop');
      a.setActiveLayout(F.layouts[0].id); }""")
    pg.wait_for_timeout(500)

# plan point → screen point of the main 2D view
S2 = """([x, y]) => { const v = window.__hp.app.panes[0].view; const r = v.svg.getBoundingClientRect(); const p = v.toScreen([x, y]); return [r.left + p[0], r.top + p[1]]; }"""
ITEMS = "() => window.__hp.app.activeLayout().items.map(f => ({id: f.id, type: f.type, x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d}))"
def drag(pg, a, b, steps=14):
    pg.mouse.move(a[0], a[1]); pg.mouse.down(); pg.mouse.move(b[0], b[1], steps=steps); pg.mouse.up(); pg.wait_for_timeout(350)
# wait until the 3D camera of the main view has stopped gliding (slow software GPUs need a while)
STILL = """() => new Promise(res => { const v = window.__hp.app.panes[0].view; let last = '', since = performance.now(); const t0 = performance.now();
  const f = () => { const k = v.camera.position.toArray().map(x => x.toFixed(3)).join(); if (k !== last) { last = k; since = performance.now(); }
    if (performance.now() - since > 700 || performance.now() - t0 > 25000) settled(); else setTimeout(f, 100); };
  // (and the automatic exposure settled – measured and glided there – so two pictures of one view compare alike)
  const ae = () => { if (!v || !v.renderer || !v.aeOn || !v.aeOn()) return true; const T = (v.evening ? 1.1 : 1) * (v._aeT || 1);
    return !v._aeLight && !v._aeDue && !v._aeWant && !v._aeRead && Math.abs(v.renderer.toneMappingExposure - T) < 2e-3; };
  // (and the material pictures the view asked for are in and it is built with them – task 0021: they load when 3D asks)
  const tx = () => { const T = window.__hp.TEXLIB; return !T || !T.known || T.ready; };
  let t1 = 0; const settled = () => { if (!t1) t1 = performance.now(); if ((ae() && tx()) || performance.now() - t1 > 30000) res(true); else setTimeout(settled, 100); };
  f(); })"""
# the test browser draws 3D in software and lets pictures pile up: wait until the GPU has drawn them all
GPU_SYNC = """() => { for (const pn of window.__hp.app.panes) { const v = pn.view; if (!v || !v.renderer) continue;
  const gl = v.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } return true; }"""
# every screenshot first waits for the pictures the software GPU still has to draw (a big house: seconds each)
from playwright.sync_api import Page as _Page
_page_shot = _Page.screenshot
def _screenshot(self, *a, **k):
    try: self.evaluate(GPU_SYNC)
    except Exception: pass
    k.setdefault('timeout', 180000)
    return _page_shot(self, *a, **k)
_Page.screenshot = _screenshot
def still(pg):
    pg.evaluate(STILL)
    pg.evaluate(GPU_SYNC)
# the material pictures load when a 3D view (a render, a walk …) asks for them (task 0021); a test that looks at pictures
# without a 3D view loads the sets it needs as a view would ('sky:day' for a sky; none named: all of them) and waits
def load_pictures(pg, *ids):
    pg.evaluate("(ids) => { const T = window.__hp.TEXLIB; return T.load(ids.length ? ids : [...Object.keys(T.data.sets), 'sky:day', 'sky:sunset']); }", list(ids))
    pg.wait_for_function("() => window.__hp.TEXLIB.ready", timeout=90000)
def to_screen(pg, x, y): return pg.evaluate(S2, [x, y])
def rooms(pg):
    return pg.evaluate("() => Object.fromEntries(window.__hp.app.shownVersion().plan.rooms.filter(r => r.storey === window.__hp.app.view.storeyId).map(r => [r.name, (()=>{const xs=r.poly.map(p=>p[0]), ys=r.poly.map(p=>p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]})()]))")
def near(a, b, tol=0.02): return abs(a - b) <= tol

# ── the two example houses (task 0007a) ──
# The public app's example is the made-up test house (tools/testhouse/), the owner's build has his house. Tests find
# rooms by name and points inside them, so the same test works on both; where a number differs, `pick` chooses.
TESTHOUSE_ID = 'p_example_testhouse'
# (opened from the projects page the example gets an id of its own; its name stays "Testhuis (made-up example)")
def is_testhouse(pg): return pg.evaluate("(id) => { const p = window.__hp.app.project; return !!p && (p.id === id || (p.name || '').startsWith('Testhuis')); }", TESTHOUSE_ID)
def by_house(pg, test, own):
    "the made-up house's value, or the owner's house's"
    return test if is_testhouse(pg) else own
# the box [x0, y0, x1, y1] of a room by name in the shown version (on the shown storey, or a storey given by name)
ROOM_BOX = """([name, storey]) => { const a = window.__hp.app, st = storey ? a.project.storeys.find(s => s.name === storey).id : a.view.storeyId;
  const r = a.shownVersion().plan.rooms.find(r => r.name === name && r.storey === st); if (!r) return null;
  const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }"""
def room_box(pg, name, storey=None): return pg.evaluate(ROOM_BOX, [name, storey])
def room_pt(pg, name, fx=0.5, fy=0.5, storey=None):
    "a plan point in a room: fx, fy from its box's low corner (0) to its high corner (1)"
    bx = room_box(pg, name, storey)
    assert bx, f'no room {name}'
    return [bx[0] + fx * (bx[2] - bx[0]), bx[1] + fy * (bx[3] - bx[1])]
def room_screen(pg, name, fx=0.5, fy=0.5, storey=None): return to_screen(pg, *room_pt(pg, name, fx, fy, storey))
# pan the main 2D view so a plan point is clear of the tool bar at the top (and of the bottom edge): the made-up
# house's garden side lies at the top of the plan, under the tool's options
def show_on_plan(pg, x, y, top=280, bottom=80):
    pg.evaluate("""([x, y, top, bottom]) => { const v = window.__hp.app.panes[0].view, r = v.svg.getBoundingClientRect(); const sy = r.top + v.toScreen([x, y])[1];
      const d = sy < top ? top - sy : (sy > r.bottom - bottom ? r.bottom - bottom - sy : 0); if (d) { v.cam.ty += d; v.applyCam(); } }""", [x, y, top, bottom])
    pg.wait_for_timeout(300)
