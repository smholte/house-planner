"""Free realistic models from Poly Haven (CC0) in the public library (task 0051).
Without a browser: build/polyhaven.json and build/library agree, every model CC0 with its source, real sizes, outlines,
a catalogue picture, the size of the whole.
PC light and phone dark (by touch), on the app folder (the web version's way): Add furniture → Library opens with the
Poly Haven models by room (a chip per room, pictures from the library); a sofa placed at its real size and drawn in 3D; its
details name the source and the licence; the library's models are found by the search. The single file without a library:
a placed Poly Haven piece is a plain box and the details say where to load the library."""
import json, os, sys
from common import *

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import importlib.util
_s = importlib.util.spec_from_file_location('polyhaven', os.path.join(ROOT, 'tools', 'polyhaven.py'))
PH = importlib.util.module_from_spec(_s); _s.loader.exec_module(PH)
SINGLE = os.path.join(ROOT, 'dist', 'house-planner.html')
LIB = json.load(open(os.path.join(ROOT, 'build', 'library', 'library.json')))
LIST = json.load(open(os.path.join(ROOT, 'build', 'polyhaven.json')))
MODELS = [it for it in LIB['items'] if it['id'].startswith('l:ph-')]
ITEMS = "() => window.__hp.app.activeLayout().items.map(f => ({id: f.id, model: f.model, w: f.w, d: f.d, h: f.h}))"
MESHES = """(id) => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; let k = 0;
    v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id && o.userData.keep) k++; }); return k; }"""

# ───────── without a browser ─────────
check('the list and the library agree (tools/polyhaven.py --check)', PH.check() == [], PH.check()[:3])
check(f'{len(MODELS)} models, at least 80', len(MODELS) >= 80, len(MODELS))
check('every model: CC0, "Poly Haven" as its source, a real size in metres, a top-view outline, a picture, a file',
      all(it['licence'] == 'CC0' and it['source'].startswith('Poly Haven') and len(it['size']) == 3 and all(0.01 <= x <= 4 for x in it['size'])
          and it['o'] and any(f.get('thumb') for f in it['files']) and any(f['f'].endswith('.glb') for f in it['files']) for it in MODELS),
      [it['id'] for it in MODELS if not (it['licence'] == 'CC0' and it['o'] and any(f.get('thumb') for f in it['files']))][:5])
check('none of them private', not any(it.get('private') for it in MODELS))
rooms = {it['cat'] for it in MODELS}
check('grouped by room: living room, dining room, bedroom, lighting, decoration at least', {'living-room', 'dining', 'bedroom', 'lighting', 'decor'} <= rooms, rooms)
tot = sum(f['b'] for it in MODELS for f in it['files'])
print(f'     models in the library: {len(MODELS)}, {tot / 1e6:.1f} MB, the biggest {max(sum(f["b"] for f in it["files"]) for it in MODELS) / 1e6:.2f} MB')
check('each model is at most 4 MB packed (a phone holds one in memory while it is shown)', all(sum(f['b'] for f in it['files']) <= 4_000_000 for it in MODELS))
check('the list says what was left out and why', LIST['left_out'] and all(isinstance(v, str) and v for v in LIST['left_out'].values()))

SOFA = next(it for it in MODELS if it['id'] == 'l:ph-sofa_02')


def run(p, phone):
    tag = 'phone' if phone else 'PC'
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
    def press(sel):
        try: (pg.tap if phone else pg.click)(sel, timeout=20000)
        except Exception:
            pg.screenshot(path=SHOTS + 'polyhaven-fail.png'); print('could not press', sel); raise
    open_example(pg)
    press('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => { window.__hp.app.settings.pip = false; window.__hp.app.updatePip(); }")
    press('#toolrail button[data-tool="add"]'); pg.wait_for_selector('.cat-tabs button[data-cat="lib"]')
    first = pg.evaluate("() => document.querySelector('.cat-tabs button').dataset.cat")
    chips = pg.evaluate("() => [...document.querySelectorAll('.lib-rooms .chip')].map(c => c.textContent)")
    check(f'{tag}: the public app has a Library tab, first and open, with All {len(MODELS)} and a chip per room', first == 'lib' and chips[0] == f'All {len(MODELS)}' and len(chips) >= 6, chips)
    press('.lib-rooms .chip[data-room="living-room"]'); pg.wait_for_timeout(500)
    pg.locator('.model-card[data-model="l:ph-sofa_02"]').scroll_into_view_if_needed()
    pg.wait_for_function("() => { const i = document.querySelector('.model-card[data-model=\"l:ph-sofa_02\"] img'); return i && i.src.startsWith('blob:'); }", timeout=60000)
    check(f'{tag}: Living room shows the sofa with its picture from the library', True)
    pg.screenshot(path=SHOTS + f'polyhaven-{tag.lower()}.png')
    press('.model-card[data-model="l:ph-sofa_02"]'); pg.wait_for_timeout(800)
    it = pg.evaluate(ITEMS)[-1]
    check(f'{tag}: … placed at its real size ({SOFA["size"][0] * 100:.0f} × {SOFA["size"][1] * 100:.0f} × {SOFA["size"][2] * 100:.0f})',
          it['model'] == 'l:ph-sofa_02' and near(it['w'], SOFA['size'][0], 0.011) and near(it['d'], SOFA['size'][1], 0.011) and near(it['h'], SOFA['size'][2], 0.011), (it, SOFA['size']))
    pg.evaluate("(id) => window.__hp.app.select({ type: 'furn', ids: [id] })", it['id']); pg.wait_for_timeout(500)
    txt = pg.evaluate("() => document.body.innerText")
    check(f'{tag}: … its details name the source and the licence', 'Model from Poly Haven, free to use (CC0).' in txt, txt[txt.find('Model from') - 20:][:80])
    pg.evaluate("() => window.__hp.app.setDim('3d')")
    pg.wait_for_function(f"() => {{ const p = window.__hp.app.panes.find(x => x.kind === '3d'); return p && p.view && p.view.ok && ({MESHES})('{it['id']}') > 0; }}", timeout=120000)
    check(f'{tag}: … drawn in 3D (its meshes are there)', True)
    # the search finds the library's models too
    pg.evaluate("() => window.__hp.app.setDim('2d')"); pg.wait_for_timeout(500)
    if phone: pg.evaluate("() => { const a = window.__hp.app; if (a.selection) a.select(null); a.toggleInspector(false); }"); pg.wait_for_timeout(400)
    press('#toolrail button[data-tool="add"]'); pg.wait_for_selector('.cat-tabs button')
    pg.fill('.cat-sheet input[type=search], input[type=search]', 'chandelier'); pg.wait_for_timeout(700)
    found = pg.evaluate("() => [...document.querySelectorAll('.model-card')].map(c => c.dataset.model)")
    check(f'{tag}: the search "chandelier" finds the library\'s chandeliers', any(k.startswith('l:ph-') and 'handelier' in k for k in found), found[:6])
    check(f'{tag}: no page errors', not pg.errors, pg.errors[:3])
    b.close()


def single(p):
    "the single file has no library: a Poly Haven piece is a plain box and the details say where to load it"
    b = p.chromium.launch(args=GL)
    pg = b.new_context(viewport={'width': 1280, 'height': 800}).new_page(); pg.set_default_timeout(90000)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + SINGLE); pg.wait_for_function("() => window.__hp && window.__hp.TEXLIB.ready", timeout=90000)
    pg.click('#btn-example'); pg.wait_for_timeout(2500)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => window.__hp.app.addModel('l:ph-sofa_02')"); pg.wait_for_timeout(800)
    it = pg.evaluate(ITEMS)[-1]
    pg.evaluate("(id) => window.__hp.app.select({ type: 'furn', ids: [id] })", it['id']); pg.wait_for_timeout(500)
    note = pg.evaluate("() => (document.querySelector('.lib-missing') || {}).textContent || ''")
    check('single file without the library: the piece is kept, the details say to load the library in Settings → Library', it['model'] == 'l:ph-sofa_02' and 'Load the library in Settings → Library' in note, (it, note))
    check('… no page errors', not errs, errs[:3])
    b.close()


with sync_playwright() as p:
    for phone in ([True] if os.environ.get('ONLY_PHONE') else [False, True]):
        run(p, phone=phone)
    single(p)

sys.exit(summary())
