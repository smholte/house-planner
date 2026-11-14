"""Add furniture: the library's models by room and "Import a model" (task 0028).
PC light and phone dark (by touch), each: the public app has no Library tab (its library has no models); a library with
a model in it (made here: the CC0 stove of tests/fixtures + a picture) brings the Library tab with a chip per room, the
picture from the library, and places the model at its real size; Import a model – a .glb at a real width typed in,
kept with the house (an asset like a photo), placed, saved, placed again (the same model, not a second copy), renamed,
exported and opened in a fresh app with the model inside and in 3D; an .fbx says "not yet"; a too big file is refused."""
import base64, io, json, zipfile, hashlib
from common import *

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures') + os.sep
STOVE = open(FIX + 'stove.glb', 'rb').read()
# a 1 × 1 WebP (the picture of the library's model)
WEBP = base64.b64decode('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=')
ITEMS = "() => window.__hp.app.activeLayout().items.map(f => ({id: f.id, model: f.model, w: f.w, d: f.d, h: f.h}))"
MODELS = "() => Object.values(window.__hp.app.project.models || {}).map(m => ({id: m.id, name: m.name, size: m.size, asset: m.asset, unit: m.fix.unit}))"
MESHES = """(id) => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; let k = 0;
    v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id && o.userData.keep) k++; }); return k; }"""


def test_lib_zip():
    "a library zip with one model (the stove, as 'Test stove' in the kitchen) and its picture"
    def name(stem, ext, data): return f'models/{stem}.{hashlib.sha256(data).hexdigest()[:16]}.{ext}'
    g, w = name('test-stove', 'glb', STOVE), name('test-stove', 'webp', WEBP)
    man = {'kind': 'house-planner-library', 'v': 1, 'name': 'test-models', 'items': [
        {'id': 'l:test-stove', 'kind': 'model', 'name': 'Test stove', 'cat': 'kitchen', 'size': [0.6, 0.6, 0.85], 'licence': 'CC0',
         'files': [{'f': g, 'b': len(STOVE)}, {'f': w, 'b': len(WEBP), 'thumb': True}]}]}
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('library.json', json.dumps(man)); z.writestr(g, STOVE); z.writestr(w, WEBP)
    path = SHOTS + 'test-models-library.zip'
    open(path, 'wb').write(bio.getvalue())
    return path


def run(p, phone):
    tag = 'phone' if phone else 'PC'
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
    def press(sel):
        try: (pg.tap if phone else pg.click)(sel, timeout=20000)
        except Exception:
            pg.screenshot(path=SHOTS + 'furniture-lib-fail.png'); print('could not press', sel); raise
    def add_sheet():
        # (on the phone the details of the piece just placed cover the tool rail: close them as he would, with ×)
        if phone: pg.evaluate("() => { const a = window.__hp.app; if (a.selection) a.select(null); a.toggleInspector(false); }"); pg.wait_for_timeout(500)
        press('#toolrail button[data-tool="add"]'); pg.wait_for_selector('.cat-tabs button[data-cat="mine"]')
    open_example(pg)
    press('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => { window.__hp.app.settings.pip = false; window.__hp.app.updatePip(); }")
    press('#toolrail button[data-tool="add"]'); pg.wait_for_selector('.cat-tabs button')
    check(f'{tag}: the public app – no Library tab (no models in its library), no hint', not pg.locator('.cat-tabs button[data-cat="lib"]').count() and not pg.locator('.lib-hint').count())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)

    # a library with a model: the Library tab, by room, its picture from the library
    pg.evaluate("""async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
      await window.__hp.libLoadZip(new File([u], 'lib.zip')); window.__hp.libAfterLoad(); }""", base64.b64encode(open(test_lib_zip(), 'rb').read()).decode())
    press('#toolrail button[data-tool="add"]'); pg.wait_for_selector('.cat-tabs button[data-cat="lib"]')
    chips = pg.evaluate("() => [...document.querySelectorAll('.lib-rooms .chip')].map(c => c.textContent)")
    pg.wait_for_function("() => { const i = document.querySelector('.model-card[data-model=\"l:test-stove\"] img'); return i && i.src.startsWith('blob:'); }", timeout=30000)
    check(f'{tag}: a library with a model – Library tab first and open, chips All 1 · Kitchen 1, the picture from the library',
          pg.evaluate("() => document.querySelector('.cat-tabs button').dataset.cat") == 'lib' and chips == ['All 1', 'Kitchen 1'], chips)
    pg.screenshot(path=SHOTS + f'furniture-lib-{tag.lower()}.png')
    press('.model-card[data-model="l:test-stove"]'); pg.wait_for_timeout(800)
    it = pg.evaluate(ITEMS)[-1]
    check(f'{tag}: … placed at its real size (60 × 60 × 85)', it['model'] == 'l:test-stove' and near(it['w'], 0.6) and near(it['d'], 0.6) and near(it['h'], 0.85), it)

    # Import a model: the stove at a real width of 90 cm
    add_sheet()
    press('.cat-tabs button[data-cat="mine"]'); pg.wait_for_timeout(300)
    with pg.expect_file_chooser() as fc:
        press('.import-card')
    fc.value.set_files(FIX + 'stove.glb')
    pg.wait_for_selector('#md-width', timeout=30000); pg.wait_for_timeout(400)
    w0 = pg.input_value('#md-width')
    pg.fill('#md-width', '90'); pg.wait_for_timeout(400)
    sz = pg.evaluate("() => document.querySelector('.model-dlg .kv dd').textContent")
    unit = pg.evaluate("() => document.querySelector('#md-unit').selectedOptions[0].textContent")
    pg.fill('#md-name', 'My stove')
    check(f'{tag}: Import a model – the width from the file ({w0} cm), 90 typed in scales it (keeps its proportions)', w0 == '43' and sz.startswith('90 × ') and unit == 'as the width says', (w0, sz, unit))
    press('.dlg-foot button:has-text("Keep and place")'); pg.wait_for_timeout(1500)
    M = pg.evaluate(MODELS)
    it = pg.evaluate(ITEMS)[-1]
    check(f'{tag}: … kept with the house under its name and placed 90 cm wide', len(M) == 1 and M[0]['name'] == 'My stove' and M[0]['asset'] and it['model'] == 'u:' + M[0]['id'] and near(it['w'], 0.9), (M, it))
    pid = pg.evaluate("() => window.__hp.app.project.id")
    pg.wait_for_function("""async ([pid, aid]) => { const DB = window.__hp.DB; const pr = await DB.get('projects', pid), a = await DB.get('assets', aid);
      return !!(pr && pr.models && pr.models[Object.keys(pr.models)[0]] && a && a.kind === 'model' && a.dataUrl.startsWith('data:model/gltf-binary')); }""", arg=[pid, M[0]['asset']], timeout=30000)
    check(f'{tag}: … saved on this device: the house lists it, the model file is an asset (like a photo)', True)
    # placed again: the same model, no second copy
    add_sheet()
    press('.cat-tabs button[data-cat="mine"]'); pg.wait_for_timeout(300)
    press(f'.model-card[data-model="u:{M[0]["id"]}"]'); pg.wait_for_timeout(800)
    mine = [i for i in pg.evaluate(ITEMS) if i['model'] == 'u:' + M[0]['id']]
    check(f'{tag}: … placed again from My models: two pieces, still one model and one file', len(mine) == 2 and len(pg.evaluate(MODELS)) == 1, (mine, pg.evaluate(MODELS)))
    # renamed in its settings
    pg.evaluate("(id) => window.__hp.app.select({ type: 'furn', ids: [id] })", mine[-1]['id']); pg.wait_for_timeout(400)
    if phone: pg.evaluate("() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Model settings' && x.offsetParent); b && b.scrollIntoView(); }")
    press('button:has-text("Model settings") >> visible=true'); pg.wait_for_selector('#md-name')
    pg.fill('#md-name', 'Our stove'); press('.dlg-foot button:has-text("Save")'); pg.wait_for_timeout(600)
    check(f'{tag}: … renamed in Model settings', pg.evaluate(MODELS)[0]['name'] == 'Our stove')

    # not yet / too big
    pg.evaluate("() => { window.__hp.app.importModelFiles([new File([new Uint8Array(10)], 'chair.fbx')]); }")
    pg.wait_for_selector('.dialog:has-text("can\'t be read yet")', timeout=10000)
    txt = pg.evaluate("() => document.querySelector('.scrim:last-child .dialog').textContent")
    press('.scrim:last-child .dlg-foot button'); pg.wait_for_timeout(300)
    check(f'{tag}: an .fbx: "not yet", with how to make a .glb', 'chair.fbx' in txt and 'Blender' in txt, txt[:200])
    pg.evaluate("() => { window.__hp.app.importModelFiles([new File([new Uint8Array(26 * 1024 * 1024)], 'huge.glb')]); }")
    pg.wait_for_selector('.dialog:has-text("too big")', timeout=10000)
    txt = pg.evaluate("() => document.querySelector('.scrim:last-child .dialog').textContent")
    press('.scrim:last-child .dlg-foot button'); pg.wait_for_timeout(300)
    check(f'{tag}: a model over 25 MB is refused, saying why', '25' in txt and 'export' in txt and len(pg.evaluate(MODELS)) == 1, txt[:200])

    # export → a fresh app: the model inside, in 3D
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    data = json.loads(text)
    md = [k for k, a in data['assets'].items() if a.get('kind') == 'model']
    check(f'{tag}: the export holds the model file', md == [M[0]['asset']] and data['assets'][md[0]]['dataUrl'].startswith('data:model/gltf-binary;base64,'), md)
    path = SHOTS + f'furniture-lib-{tag.lower()}.house.json'
    open(path, 'w').write(text)
    errs = list(pg.errors)
    b.close()
    b, p2 = open_app(p, phone=phone, theme='dark' if phone else 'light')
    with p2.expect_file_chooser() as fc:
        p2.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(path)
    p2.wait_for_function("() => window.__hp.app.project && Object.keys(window.__hp.app.project.models || {}).length === 1", timeout=60000)
    M2 = p2.evaluate(MODELS)
    p2.evaluate("() => window.__hp.app.setMode('furnish')"); p2.wait_for_timeout(800)
    p2.evaluate("() => window.__hp.app.setDim('3d')")
    p2.wait_for_function(f"() => {{ const p = window.__hp.app.panes.find(x => x.kind === '3d'); return p && p.view && p.view.ok && ({MESHES})('{mine[0]['id']}') > 0; }}", timeout=90000)
    check(f'{tag}: … opened in a fresh app: "Our stove" is there, its pieces in 3D', M2 and M2[0]['name'] == 'Our stove', M2)
    check(f'{tag}: no page errors', not errs and not p2.errors, (errs, p2.errors)[:3])
    b.close()


with sync_playwright() as p:
    for phone in ([True] if os.environ.get('ONLY_PHONE') else [False, True]):
        run(p, phone=phone)

sys.exit(summary())
