"""3D models: the built-in library (Kenney Furniture Kit, CC0) in the catalogue with pictures, a model piece in 2D
(outline) and 3D, snapping, keep proportions, colour; importing your own models (.glb, .obj + .mtl with Z up, IFC4),
model settings (turning the front), export with the model files and opening that file elsewhere, deleting a model."""
from common import *

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures') + os.sep
MODELS = "() => Object.values(window.__hp.app.project.models).map(m => ({id: m.id, name: m.name, size: m.size, fix: m.fix, o: m.o.length, rev: m.rev, asset: m.asset}))"
ITEMSM = "() => window.__hp.app.activeLayout().items.map(f => ({id: f.id, type: f.type, model: f.model, x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, h: f.h, color: f.color}))"
MESHES = """(id) => { const v = window.__hp.app.panes[0].view; let n = 0, keep = 0;
    v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id) { n++; if (o.userData.keep) keep++; } }); return [n, keep]; }"""

def import_model(pg, files, zup=False, action='Keep and place'):
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(400)
    pg.click('.cat-tabs button[data-cat="mine"]'); pg.wait_for_timeout(300)
    with pg.expect_file_chooser() as fc:
        pg.click('.import-card')
    fc.value.set_files([FIX + f for f in files])
    pg.wait_for_selector('.model-dlg', timeout=30000); pg.wait_for_timeout(600)
    if zup: pg.check('#md-zup'); pg.wait_for_timeout(400)
    size = pg.evaluate("() => document.querySelector('.model-dlg .kv dd').textContent")
    pg.click(f'.dlg-foot button:has-text("{action}")'); pg.wait_for_timeout(1500)
    return size

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1000)
    pg.evaluate("() => { window.__hp.app.settings.pip = false; window.__hp.app.updatePip(); }")
    check('model library has 100+ pieces', pg.evaluate("() => window.__hp.MLIB.size") >= 100)
    # catalogue: 3D models with pictures
    pg.click('#toolrail button[data-tool="add"]'); pg.wait_for_timeout(500)
    pg.fill('.cat-body input[type=search]', 'sofa'); pg.wait_for_timeout(400)
    n = pg.evaluate("() => document.querySelectorAll('.model-card').length")
    pg.wait_for_function("() => document.querySelectorAll('.model-card img').length >= 3", timeout=30000)
    check('catalogue shows 3D models with pictures', n >= 4, n)
    pg.screenshot(path=SHOTS + 'models-catalogue.png')
    pg.click('.model-card[data-model="k:loungeSofa"]'); pg.wait_for_timeout(800)
    s = pg.evaluate(ITEMSM)[-1]
    check('sofa model added at its real size', s['type'] == 'model' and s['model'] == 'k:loungeSofa' and near(s['w'], 2.0) and near(s['d'], 0.9) and near(s['h'], 0.85), s)
    pts = pg.evaluate("(id) => { const g = document.querySelector(`.furn[data-furn='${id}'] .furn-o`); return g ? (g.getAttribute('d').match(/[ML]/g) || []).length : 0; }", s['id'])
    check('2D symbol is the model outline', pts >= 4, pts)
    wk = rooms(pg)['Woonkamer']
    drag(pg, to_screen(pg, s['x'], s['y'] + 0.2), to_screen(pg, 2.6, wk[1] + 0.47 + 0.2))
    s = [i for i in pg.evaluate(ITEMSM) if i['id'] == s['id']][0]
    check('model turns its back to the wall', s['rot'] == 0 and near(s['y'], wk[1] + 0.45), s)
    pg.fill('#f-furn-w', '300'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    s = [i for i in pg.evaluate(ITEMSM) if i['id'] == s['id']][0]
    check('keep proportions: width 300 makes it 1.5 times bigger', near(s['w'], 3.0) and near(s['d'], 1.35) and near(s['h'], 1.275), s)
    pg.click('.inspector button:has-text("Model size")'); pg.wait_for_timeout(300)
    pg.click('.inspector .swatch[aria-label="Colour #5A4C40"]'); pg.wait_for_timeout(300)
    s = [i for i in pg.evaluate(ITEMSM) if i['id'] == s['id']][0]
    check('model size back, colour changed', near(s['w'], 2.0) and s['color'].lower() == '#5a4c40', s)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3000)
    pg.wait_for_function("(id) => { const v = window.__hp.app.panes[0].view; let k = 0; v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id && o.userData.keep) k++; }); return k > 0; }", arg=s['id'], timeout=20000)
    n, keep = pg.evaluate(MESHES, s['id'])
    col = pg.evaluate("""(id) => { const v = window.__hp.app.panes[0].view; const cs = new Set();
        v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id) cs.add('#' + o.material.color.getHexString()); }); return [...cs]; }""", s['id'])
    check('sofa model in 3D in its colour', n >= 2 and keep == n and '#5a4c40' in col, (n, keep, col))
    pg.evaluate("(it) => { const v = window.__hp.app.panes[0].view; v.controls.target.set(it.x, 0.4, it.y + 0.6); v.camera.position.set(it.x + 2.4, 2.4, it.y + 3.6); v.controls.update(); v.needs = true; }", s); pg.wait_for_timeout(1500)
    pg.screenshot(path=SHOTS + 'models-sofa-3d.png')
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1000)
    # your own models
    sz = import_model(pg, ['stove.glb'])
    check('.glb imported', '43 × 45 × 45' in sz, sz)
    sz = import_model(pg, ['table.obj', 'table.mtl'], zup=True)
    check('.obj + .mtl in cm with Z up: 120 × 70 × 76 cm', '120 × 70 × 76' in sz, sz)
    sz = import_model(pg, ['bath.ifc'])
    check('IFC4 bath: 170 × 75 × 60 cm', '170 × 75 × 60' in sz, sz)
    M = pg.evaluate(MODELS)
    check('three models kept with the house', len(M) == 3 and all(m['asset'] and m['o'] >= 1 for m in M), M)
    items = [i for i in pg.evaluate(ITEMSM) if (i['model'] or '').startswith('u:')]
    check('three pieces placed', len(items) == 3, items)
    table = [i for i in items if near(i['w'], 1.2)][0]
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500)
    pg.wait_for_function("(id) => { const v = window.__hp.app.panes[0].view; let k = 0; v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id && o.userData.keep) k++; }); return k > 0; }", arg=table['id'], timeout=20000)
    check('your models in 3D', all(pg.evaluate(MESHES, i['id'])[1] > 0 for i in items))
    pg.evaluate("(it) => { const v = window.__hp.app.panes[0].view; v.controls.target.set(it.x, 0.4, it.y); v.camera.position.set(it.x + 1.5, 4.5, it.y + 2.5); v.controls.update(); v.needs = true; }", table); pg.wait_for_timeout(1500)
    pg.screenshot(path=SHOTS + 'models-own-3d.png')
    # model settings: the front turned a quarter; the pieces turn along
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(800)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'furn', ids: [id] })", table['id']); pg.wait_for_timeout(400)
    pg.click('.inspector button:has-text("Model settings")'); pg.wait_for_selector('.model-dlg'); pg.wait_for_timeout(400)
    pg.click('.model-dlg button:has-text("Turn right")'); pg.wait_for_timeout(500)
    pg.click('.dlg-foot button:has-text("Save")'); pg.wait_for_timeout(800)
    t2 = [i for i in pg.evaluate(ITEMSM) if i['id'] == table['id']][0]
    mt = [m for m in pg.evaluate(MODELS) if m['name'] == 'table'][0]
    check('turning the model turns its pieces (width and depth swap)', near(t2['w'], 0.7) and near(t2['d'], 1.2) and mt['fix']['ry'] == 90 and mt['rev'] == 2, (t2, mt))
    # export: the model files go along; open the file in a fresh app
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    data = json.loads(text)
    md = [k for k, a in data['assets'].items() if a.get('kind') == 'model']
    check('export holds the three model files', len(md) == 3 and all(data['assets'][k]['dataUrl'].startswith('data:model/gltf-binary;base64,') for k in md), md)
    open(SHOTS + 'models.house.json', 'w').write(text)
    errs = list(pg.errors)
    ctx2 = b.new_context(viewport={'width': 1280, 'height': 800})
    p2 = ctx2.new_page(); p2.errors = []; p2.on('pageerror', lambda e: p2.errors.append(str(e)))
    p2.goto(BASE); p2.wait_for_timeout(800)
    with p2.expect_file_chooser() as fc:
        p2.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(SHOTS + 'models.house.json'); p2.wait_for_timeout(4000)
    p2.click('#mode-switch button[data-mode="furnish"]'); p2.wait_for_timeout(800)
    p2.click('#dim-toggle button[data-dim="3d"]'); p2.wait_for_timeout(2000)
    p2.wait_for_function("(id) => { const v = window.__hp.app.panes[0].view; let k = 0; v.scene.traverse(o => { if (o.isMesh && o.userData.furn === id && o.userData.keep) k++; }); return k > 0; }", arg=table['id'], timeout=30000)
    check('opened elsewhere: your models are there in 3D', len(p2.evaluate(MODELS)) == 3 and p2.evaluate(MESHES, table['id'])[1] > 0)
    check('no page errors in the second app', not p2.errors, p2.errors)
    ctx2.close()
    # delete a model: its pieces go too; undo brings both back
    stove = [m for m in pg.evaluate(MODELS) if m['name'] == 'stove'][0]
    pg.evaluate("(id) => { window.__hp.app.deleteModel(id); }", stove['id']); pg.wait_for_timeout(400)
    pg.click('.dialog button:has-text("Delete")'); pg.wait_for_timeout(600)
    left = pg.evaluate(ITEMSM)
    check('deleted model takes its piece along', len(pg.evaluate(MODELS)) == 2 and not any(i['model'] == 'u:' + stove['id'] for i in left))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    check('undo brings it back', len(pg.evaluate(MODELS)) == 3 and any(i['model'] == 'u:' + stove['id'] for i in pg.evaluate(ITEMSM)))
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
