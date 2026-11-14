"""The asset library (task 0009): pictures and models outside the app file.

PC light – the app folder (as the web version): the list lib/library.json (always asked again), the base pictures from
lib/ and kept on the device, a second visit from the device and offline; safe pictures win over larger sizes and KTX2;
KTX2 pictures on the graphics card (less memory); a model of a library that is not on the device (a plain box: 3D, 2D
plan, PDF plan, photo render – no error, the saved piece unchanged); Library → Remove leaves the houses alone.
Phone dark – the single file: today's pictures built in (skies at 512); Settings → Library → Load library… with the
library zip: the same pictures, the larger skies; a library with a set in two sizes and a model; a zip that isn't one.
And without a browser: build/library is whole and public, the house-word check finds a word in a library, no private
model in the web version's library.
"""
import hashlib, io, json, os, shutil, struct, sys, tempfile, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import importlib.util
_spec = importlib.util.spec_from_file_location('build_library', os.path.join(ROOT, 'tools', 'build-library.py'))
BL = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(BL)
READY = "() => window.__hp && window.__hp.TEXLIB.ready"
SINGLE = os.path.join(ROOT, 'dist', 'house-planner.html')
LIBZIP = os.path.join(ROOT, 'dist', 'house-planner-library.zip')
TMP = tempfile.mkdtemp(prefix='hp-lib-')

# what the 3D view has on the graphics card: its pictures (one per source), bytes as uploaded (with mipmaps)
GPUMEM = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, seen = new Map();
  v.scene.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap']) {
    const t = m[k]; if (!t || !t.source || seen.has(t.source.uuid)) continue; let b = 0;
    if (t.isCompressedTexture) for (const mm of t.mipmaps) b += mm.data.byteLength;
    else if (t.isDataTexture) b = t.image.width * t.image.height * 4 * (t.type === 1016 ? 2 : 1);
    else { const im = t.image; b = (im.naturalWidth || im.width) * (im.naturalHeight || im.height) * 4 * 4 / 3; }
    seen.set(t.source.uuid, { b, ktx: !!t.isCompressedTexture, lib: !!(t.userData && t.userData.lib) }); } });
  const all = [...seen.values()];
  return { n: all.length, mb: all.reduce((a, x) => a + x.b, 0) / 1048576, lib: all.filter(x => x.lib).reduce((a, x) => a + x.b, 0) / 1048576, ktx: all.filter(x => x.ktx).length }; }"""
# the houses' database, read directly (not through the app)
HOUSES = """async () => { const db = await new Promise((res, rej) => { const r = indexedDB.open('house-planner'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise((res, rej) => { const tx = db.transaction('projects', 'readonly'); const q = tx.objectStore('projects').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  db.close(); return JSON.stringify(all.sort((a, b) => a.id < b.id ? -1 : 1)); }"""
LIBFILES = """async () => { const db = await new Promise(res => { const r = indexedDB.open('house-planner-lib'); r.onsuccess = () => res(r.result); });
  const n = await new Promise(res => { const q = db.transaction('files', 'readonly').objectStore('files').count(); q.onsuccess = () => res(q.result); }); db.close(); return n; }"""


def tiny_glb(rgb=(0.2, 0.5, 0.8)):
    """a box (1 × 0.5 × 0.8 m) as a .glb – a model for a test library"""
    sx, sy, sz = 0.5, 0.5, 0.4
    P = [(-sx, 0, -sz), (sx, 0, -sz), (sx, 2 * sy, -sz), (-sx, 2 * sy, -sz), (-sx, 0, sz), (sx, 0, sz), (sx, 2 * sy, sz), (-sx, 2 * sy, sz)]
    I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]
    pos = b''.join(struct.pack('<3f', *v) for v in P)
    idx = b''.join(struct.pack('<H', i) for i in I)
    idx += b'\0' * ((4 - len(idx) % 4) % 4)
    binb = pos + idx
    g = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
         'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'material': 0}]}],
         'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [*rgb, 1], 'metallicFactor': 0, 'roughnessFactor': 0.8}}],
         'buffers': [{'byteLength': len(binb)}],
         'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(pos)}, {'buffer': 0, 'byteOffset': len(pos), 'byteLength': len(I) * 2}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 8, 'type': 'VEC3', 'min': [-sx, 0, -sz], 'max': [sx, 2 * sy, sz]},
                       {'bufferView': 1, 'componentType': 5123, 'count': len(I), 'type': 'SCALAR'}]}
    js = json.dumps(g).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    body = struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\0') + binb
    return struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body


def png(w, rgb):
    from PIL import Image
    b = io.BytesIO()
    Image.new('RGB', (w, w), rgb).save(b, 'PNG')
    return b.getvalue()


def test_zip(path):
    """a small 'house' library: a picture set that is not in the base, at 256 and 1024 px, and a model"""
    files = {}
    def add(stem, ext, data):
        h = hashlib.sha256(data).hexdigest()[:12]
        f = f'{stem}.{h}.{ext}'
        files[f] = data
        return {'f': f, 'b': len(data)}
    items = [{'id': 'TestSet', 'kind': 'tex', 'licence': 'CC0', 'source': 'test', 'meta': {'size': 1.0, 'avg': [0.5, 0.5, 0.5], 'roughAvg': 0.8},
              'maps': {'color': [dict(px=256, **add('tex/TestSet.color.256', 'png', png(256, (200, 40, 40)))),
                                 dict(px=1024, **add('tex/TestSet.color.1024', 'png', png(1024, (40, 200, 40))))]}},
             {'id': 'l:test-box', 'kind': 'model', 'private': True, 'licence': 'test', 'source': 'test', 'name': 'Test box', 'cat': 'living-room',
              'size': [1.0, 0.8, 1.0], 'o': [], 'u': [], 'files': [add('models/test-box', 'glb', tiny_glb())]}]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:   # (deflated: the app reads both)
        z.writestr('library.json', json.dumps({'v': 1, 'kind': 'house-planner-library', 'name': 'house', 'items': items}))
        for f, d in files.items():
            z.writestr(f, d)
    return path


with sync_playwright() as p:
    # ───────── without a browser ─────────
    check('build/library is whole: every file listed, hashes right, no stray file, every licence CC0 / CC BY', BL.check() == [], BL.check()[:3])
    bad = os.path.join(TMP, 'badlib')
    shutil.copytree(os.path.join(ROOT, 'build', 'library'), bad)
    open(os.path.join(bad, 'tex', 'stray.jpg'), 'wb').write(b'x')
    m = json.load(open(os.path.join(bad, 'library.json')))
    m['items'][0]['licence'] = "maker's 3D data, for planning only"
    json.dump(m, open(os.path.join(bad, 'library.json'), 'w'))
    probs = BL.check(bad)
    check('… and the check finds a stray file and a licence that is not public (ci_precheck.py runs it)', any('stray.jpg' in x for x in probs) and any('licence' in x for x in probs), probs[:3])
    check('… no model file outside the public library in this repository', BL.stray_models(ROOT) == [], BL.stray_models(ROOT)[:3])
    weblib = os.path.join(ROOT, 'dist', 'web', 'lib')
    wm = json.load(open(os.path.join(weblib, 'library.json')))
    word = wm['items'][0]['maps']['color'][0]['f'].split('.')[-2]    # (a hash: only in the library's list)
    check('the house-word check looks into the library (build.py: a word in its list or files stops the build)',
          BL.words_in(weblib, [word]) and not BL.words_in(weblib, ['NotAWordOfAnyHouse']) and 'BL.words_in(os.path.join(web_dir' in open(os.path.join(ROOT, 'build.py')).read())
    check('the web version\'s library: public only – no model of the owner, every item CC0 / CC BY (or the KTX2 reader\'s code)',
          wm['name'] == 'public' and not [i for i in wm['items'] if i['kind'] == 'model' or i.get('private')] and
          all(i['kind'] == 'code' or i['licence'].startswith(('CC0', 'CC BY')) for i in wm['items']), [i['id'] for i in wm['items'] if i['kind'] == 'model'])
    sw = open(os.path.join(ROOT, 'dist', 'web', 'sw.js')).read()
    check('the service worker leaves lib/ alone (the app keeps it; an update does not download it again), no textures.json',
          "new URL('lib/', self.registration.scope)" in sw and 'textures.json' not in sw)

    # ───────── PC light: the app folder (as the web version) ─────────
    b, pg = open_app(p)
    ctx = pg.context
    lib_reqs = []
    pg.on('request', lambda r: lib_reqs.append((r.url, r)) if '/lib/' in r.url else None)
    pg.wait_for_function(READY, timeout=90000)
    # (task 0021: nothing is decoded at start; the base is kept on the device in the background, each set is loaded when
    # a 3D view asks for it – here these at once)
    pg.evaluate("() => window.__hp.TEXLIB.kept")
    load_pictures(pg, 'WoodFloor051', 'Tiles050', 'sky:day', 'sky:sunset')
    st = pg.evaluate("""() => { const T = window.__hp.TEXLIB, L = window.__hp.LIB;
      return { sets: Object.keys(T.data.sets).length, src: T.source, wood: T.px.get('WoodFloor051|color'), tiles: T.px.get('Tiles050|color'), sky: T.skyPx, fetched: L.fetched, items: L.items.size }; }""")
    check('hosted: the pictures come from lib/ – 25 sets, the base sizes (512; the garden tiles\' colour 1024), skies at 1024',
          st['sets'] == 25 and st['src'] == 'library' and st['wood'] == 512 and st['tiles'] == 1024 and st['sky'] == {'day': 1024, 'sunset': 1024}, st)
    pg.wait_for_timeout(1500)
    kept = pg.evaluate(LIBFILES)
    check('… what was fetched is kept on the device (database house-planner-lib)', kept >= st['fetched'] >= 78, (kept, st['fetched']))
    pg.evaluate("() => navigator.serviceWorker && navigator.serviceWorker.ready"); pg.wait_for_timeout(1000)
    pg.reload(); pg.wait_for_function(READY, timeout=90000)
    pg.evaluate("() => window.__hp.TEXLIB.kept"); load_pictures(pg)
    st2 = pg.evaluate("() => ({ fetched: window.__hp.LIB.fetched, stored: window.__hp.LIB.stored, sets: Object.keys(window.__hp.TEXLIB.data.sets).length })")
    check('second visit: the pictures from the device, none downloaded again', st2['fetched'] == 0 and st2['stored'] >= 78 and st2['sets'] == 25, st2)
    man_req = [r.all_headers() for u, r in lib_reqs if u.endswith('lib/library.json')]
    check('… the list lib/library.json is asked again on every visit (never kept for good: no-cache)', len(man_req) >= 1 and any(x in (man_req[-1].get('cache-control', '') + man_req[-1].get('pragma', '')) for x in ('no-cache', 'max-age=0')), man_req[-1:])
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_function(READY, timeout=90000)
    st3 = pg.evaluate("async () => { const H = window.__hp; await H.loadModelLib(); await H.TEXLIB.load(Object.keys(H.TEXLIB.data.sets).concat(['sky:day'])); return { sets: Object.keys(H.TEXLIB.data.sets).length, sky: H.TEXLIB.skyPx, models: !!H.MODELS.blob, fetched: H.LIB.fetched, pics: H.TEXLIB.stats().pictures }; }")
    check('offline (network cut): the app, its pictures, skies and the furniture models from the device', st3['sets'] == 25 and st3['pics'] >= 78 and st3['sky'].get('day') == 1024 and st3['models'] and not pg.errors, (st3, pg.errors[:2]))
    ctx.set_offline(False)

    # safe pictures (the Pixel's PowerVR) win over a larger size and KTX2 until 0010 has tried them on that phone
    sf = pg.evaluate("""() => { const H = window.__hp, S = H.Settings;
      S.values.texSize = 1024; S.values.texGpu = true; S.values.safeTex = true; const safe = [H.libWantPx(), H.libWantGpu()];
      S.values.safeTex = false; const not = [H.libWantPx(), H.libWantGpu()];
      S.values.safeTex = undefined; S.values.texSize = undefined; S.values.texGpu = undefined; const dflt = [H.libWantPx(), H.libWantGpu()];
      return { safe, not, dflt, pick: [H.libPick([{ px: 256 }, { px: 1024 }], 512).px, H.libPick([{ px: 1024 }], 512).px, H.libPick([{ px: 512 }, { px: 1024 }, { px: 2048 }], 1024).px] }; }""")
    check('safe pictures: at most 512 px and no KTX2, whatever is asked; otherwise as asked; default 512 without KTX2',
          sf['safe'] == [512, False] and sf['not'] == [1024, True] and sf['dflt'] == [512, False], sf)
    check('… the size picked: the largest up to the size asked, else the smallest there is', sf['pick'] == [256, 1024, 1024], sf['pick'])

    # KTX2 on the graphics card: the made-up house in 3D, before and after
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    m0 = pg.evaluate(GPUMEM)
    pg.evaluate("() => { const H = window.__hp; H.Settings.values.safeTex = false; H.Settings.values.texGpu = true; H.texlibSettingsChanged(); }")
    pg.wait_for_function("() => [...window.__hp.TEXLIB.gpu.values()].filter(t => t && t.isTexture).length >= 10", timeout=180000)
    pg.wait_for_timeout(4000); still(pg)
    m1 = pg.evaluate(GPUMEM)
    print(f'   GPU pictures of the made-up house in 3D: {m0["n"]} / {m0["mb"]:.1f} MB (material pictures {m0["lib"]:.1f} MB) → with KTX2 {m1["n"]} / {m1["mb"]:.1f} MB ({m1["lib"]:.1f} MB, {m1["ktx"]} compressed)')
    check('KTX2 (texGpu): the plain pictures compressed on the graphics card – less memory, no error', m1['ktx'] >= 10 and m1['lib'] < m0['lib'] * 0.85 and not pg.errors, (m0, m1, pg.errors[:2]))
    pg.screenshot(path=SHOTS + 'lib-ktx2-pc.png')
    pg.evaluate("() => { const H = window.__hp; H.Settings.values.texGpu = undefined; H.Settings.values.safeTex = undefined; H.texlibSettingsChanged(); }")
    pg.wait_for_timeout(3000)

    # a piece of a library model that is not on this device (as from a house made on the owner's PC)
    pg.evaluate("""() => { const a = window.__hp.app, st = a.currentStorey(), L = a.project.furniture.layouts.find(l => l.id === a.project.furniture.activeLayoutId) || a.project.furniture.layouts[0];
      a.mutate(p => { const l = p.furniture.layouts.find(x => x.id === L.id); const it = window.__hp.newModelPiece('l:not-on-this-device', st.id, 3, 3); Object.assign(it, { id: 'f_libtest', w: 0.9, d: 0.6, h: 0.75, color: '#8899AA' }); l.items.push(it); }, { project: true }); }""")
    pg.wait_for_timeout(6000); still(pg)
    box = pg.evaluate("() => { let n = 0; window.__hp.app.panes.find(p => p.kind === '3d').view.scene.traverse(o => { if (o.userData && o.userData.libMissing === 'l:not-on-this-device') n++; }); return n; }")
    check('a model of a library that is not on this device: a plain box in 3D, no error', box == 1 and not pg.errors, (box, pg.errors[:2]))
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('2d'); a.setMode('furnish'); a.select({ type: 'furn', ids: ['f_libtest'] }); if (a.toggleInspector) a.toggleInspector(true); }"); pg.wait_for_timeout(1500)
    note = pg.evaluate("() => { const e = document.querySelector('.lib-missing'); return e ? e.textContent : ''; }")
    check('… its panel says the library is not loaded (Settings → Library)', 'Library' in note, note)
    sym = pg.evaluate("() => !!document.querySelector('[data-id=\"f_libtest\"], [data-fid=\"f_libtest\"]') || document.querySelectorAll('svg path').length > 0")
    pdf = pg.evaluate("""async () => { const a = window.__hp.app, st = a.currentStorey(); try { const cv = await a.planPicture(st, 300, 200, 50, { dims: false }); return !!cv && cv.width > 0; } catch (e) { return 'ERR ' + e.message; } }""")
    check('… the 2D plan and the PDF plan draw it (its outline as a box) without an error', sym and pdf is True and not pg.errors, (sym, pdf, pg.errors[:2]))
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a._renderOpts = { q: 'quick', size: 'screen', method: 'pt', passes: 1, W: 64, H: 48 }; a.renderSheet(); }")
    pg.wait_for_selector('#rn-start', timeout=60000); pg.click('#rn-start')
    rs = None
    for i in range(120):
        pg.wait_for_timeout(2000)
        rs = pg.evaluate("() => { const e = document.querySelector('#rn-status'); return e ? e.textContent : null; }")
        if rs and ('samples in' in rs or 'stopped' in rs): break
    check('… the photo render (path traced) with the box, no error', rs and 'samples in' in rs and not pg.errors, (rs, pg.errors[:2]))
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(1000)
    pg.evaluate("() => window.__hp.Saver.flushNow()"); pg.wait_for_timeout(800)
    saved = pg.evaluate("() => window.__hp.DB.get('projects', window.__hp.app.project.id).then(p => p.furniture.layouts.flatMap(l => l.items).find(i => i.id === 'f_libtest'))")
    check('… the saved piece is as it was (its model, size and colour)', saved and saved['model'] == 'l:not-on-this-device' and [saved['w'], saved['d'], saved['h'], saved['color']] == [0.9, 0.6, 0.75, '#8899AA'], saved)

    # Library → Remove touches only the library's database
    before = pg.evaluate(HOUSES)
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }")
    pg.wait_for_selector('#set-library .lib-row', timeout=20000)
    pg.click('#set-library .lib-row button'); pg.wait_for_timeout(500)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Remove")'); pg.wait_for_timeout(2500)
    after = pg.evaluate(HOUSES)
    left = pg.evaluate("async () => (await window.__hp.libStatus()).length")
    check('Library → Remove: the library is gone, the houses (database house-planner) are exactly as before', left == 0 and before == after and len(before) > 10 and not pg.errors, (left, len(before), len(after)))
    b.close()

    # ───────── phone dark: the single file ─────────
    b = p.chromium.launch(args=GL)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, color_scheme='dark')
    pg = ctx.new_page(); pg.set_default_timeout(90000)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + SINGLE); pg.wait_for_function(READY, timeout=90000)
    load_pictures(pg)     # (task 0021: loaded when a 3D view asks – here all of them, from the built-in pictures)
    s1 = pg.evaluate("() => { const T = window.__hp.TEXLIB; return { sets: Object.keys(T.data.sets).length, src: T.source, sky: T.skyPx, wood: T.px.get('WoodFloor051|color'), items: window.__hp.LIB.items.size }; }")
    check('single file: today\'s pictures built in (25 sets at their base size), the skies at 512, no library yet',
          s1['sets'] == 25 and s1['src'] == 'built-in' and s1['sky'] == {'day': 512, 'sunset': 512} and s1['wood'] == 512 and s1['items'] == 0, s1)
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }")
    pg.wait_for_selector('#set-library .lib-status', timeout=20000)
    txt = pg.evaluate("() => document.querySelector('#set-library').textContent")
    check('Settings → Library: says only the built-in pictures are here, and has Load library…', 'Built-in pictures only' in txt and pg.is_visible('#lib-load'), txt[:120])
    pg.set_input_files('#lib-file', LIBZIP)
    pg.wait_for_selector('#set-library .lib-row', timeout=120000)
    pg.wait_for_function("() => window.__hp.TEXLIB.skyPx.day === 1024 && window.__hp.TEXLIB.skyPx.sunset === 1024", timeout=60000)
    txt = pg.evaluate("() => document.querySelector('#set-library').textContent")
    same = pg.evaluate("""async () => { const H = window.__hp, out = [];
      const hash = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map(x => x.toString(16).padStart(2, '0')).join('');
      for (const [id, k] of [['WoodFloor051', 'color'], ['HouseBrick', 'kit'], ['Tiles050', 'color'], ['Grass005', 'normal']]) {
        const shown = H.TEXLIB.data.sets[id][k], it = H.libItem(id), v = it.maps[k][0];
        const a = await hash(await (await fetch(shown)).arrayBuffer()), b2 = await hash(await (await H.libBlob(v.f)).arrayBuffer());
        out.push([id, k, shown.startsWith('data:'), a === b2]); }
      return out; }""")
    check('… Load library… (the zip): the library is on the device, its pictures are the same as the built-in ones, the skies now 1024',
          'Public library' in txt and all(x[2] and x[3] for x in same) and not errs, (txt[:160], same, errs[:2]))
    pg.evaluate("() => document.querySelector('#set-library').scrollIntoView()"); pg.wait_for_timeout(300)
    pg.screenshot(path=SHOTS + 'lib-settings-phone.png')
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('… no sideways scrolling on the phone', vw[0] <= vw[1], vw)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)

    # a library with a set in two sizes and a model (as the owner's library will be)
    test_zip(os.path.join(TMP, 'test-library.zip'))
    r = pg.evaluate("""async () => { const H = window.__hp; const resp = await fetch('data:application/zip;base64,' + ZIPB64); const f = new File([await resp.blob()], 'test-library.zip');
      return await H.libLoadZip(f); }""".replace('ZIPB64', json.dumps(__import__('base64').b64encode(open(os.path.join(TMP, 'test-library.zip'), 'rb').read()).decode())))
    pg.evaluate("() => window.__hp.libAfterLoad()")
    pg.wait_for_timeout(1000)
    pg.evaluate("() => window.__hp.libSet('TestSet')")
    pg.wait_for_function("() => window.__hp.TEXLIB.px.get('TestSet|color') > 0", timeout=30000)
    px1 = pg.evaluate("() => window.__hp.TEXLIB.px.get('TestSet|color')")
    pg.evaluate("() => { window.__hp.Settings.values.texSize = 1024; window.__hp.Settings.values.safeTex = false; }")
    n = pg.evaluate("() => window.__hp.libUpgrade()")
    px2 = pg.evaluate("() => window.__hp.TEXLIB.px.get('TestSet|color')")
    pg.evaluate("() => { window.__hp.Settings.values.safeTex = true; }")
    n3 = pg.evaluate("() => window.__hp.libUpgrade()")
    px3 = pg.evaluate("() => window.__hp.TEXLIB.px.get('TestSet|color')")
    pg.evaluate("() => { window.__hp.Settings.values.safeTex = undefined; window.__hp.Settings.values.texSize = undefined; }")
    check('a library zip (deflated) with a set not in the base: loaded when a material needs it, at the size asked (512 → its 256, 1024 → 1024; safe pictures → back to 256)',
          r['items'] == 2 and px1 == 256 and n >= 1 and px2 == 1024 and px3 == 256, (r, px1, n, px2, n3, px3))
    mdl = pg.evaluate("() => { const info = window.__hp.modelInfo('l:test-box'); return info && [info.name, info.size]; }")
    pg.click('#btn-example') if pg.is_visible('#btn-example') else None
    pg.wait_for_timeout(2500)
    pg.evaluate("""() => { const a = window.__hp.app, st = a.currentStorey(), L = a.activeLayout();
      a.mutate(p => { const l = p.furniture.layouts.find(x => x.id === L.id); l.items.push(Object.assign(window.__hp.newModelPiece('l:test-box', st.id, 3, 3), { id: 'f_libbox' })); }, { project: true });
      a.setDim('3d'); }""")
    pg.wait_for_function("() => { const e = window.__hp.MODELS.lib.get('l:test-box'); return e && e.state !== 'loading'; }", timeout=60000)
    pg.wait_for_timeout(4000)
    got = pg.evaluate("() => { const e = window.__hp.MODELS.lib.get('l:test-box'); let miss = 0; const v = window.__hp.app.panes.find(p => p.kind === '3d'); if (v) v.view.scene.traverse(o => { if (o.userData && o.userData.libMissing) miss++; }); return [e.state, miss]; }")
    check('… its model: known by name and size, shown in 3D from the library (not a box)', mdl == ['Test box', [1.0, 0.8, 1.0]] and got == ['ready', 0] and not errs, (mdl, got, errs[:2]))
    pg.screenshot(path=SHOTS + 'lib-model-phone.png')
    bad = os.path.join(TMP, 'not-a-library.zip')
    with zipfile.ZipFile(bad, 'w') as z: z.writestr('hello.txt', 'hi')
    msg = pg.evaluate("""async () => { try { await window.__hp.libLoadZip(new File([await (await fetch('data:application/zip;base64,' + B64)).blob()], 'x.zip')); return 'loaded'; } catch (e) { return e.message; } }""".replace('B64', json.dumps(__import__('base64').b64encode(open(bad, 'rb').read()).decode())))
    check('a zip that is not a library: a plain message, nothing loaded, no page error', 'not a House Planner library' in msg and not errs, (msg, errs[:2]))
    # a library whose list is broken (a picture set without its pictures) or whose file is not the size its list says
    broken = os.path.join(TMP, 'broken.zip')
    with zipfile.ZipFile(broken, 'w') as z: z.writestr('library.json', json.dumps({'v': 1, 'kind': 'house-planner-library', 'name': 'house', 'items': [{'id': 'X', 'kind': 'tex', 'meta': {}, 'maps': {'color': []}}]}))
    liar = os.path.join(TMP, 'liar.zip')
    with zipfile.ZipFile(liar, 'w') as z:
        z.writestr('library.json', json.dumps({'v': 1, 'kind': 'house-planner-library', 'name': 'house', 'items': [{'id': 'l:x', 'kind': 'model', 'name': 'x', 'size': [1, 1, 1], 'files': [{'f': 'models/x.glb', 'b': 10}]}]}))
        z.writestr('models/x.glb', b'x' * 5000)
    msgs = [pg.evaluate("""async () => { try { await window.__hp.libLoadZip(new File([await (await fetch('data:application/zip;base64,' + B64)).blob()], 'x.zip')); return 'loaded'; } catch (e) { return e.message; } }""".replace('B64', json.dumps(__import__('base64').b64encode(open(f, 'rb').read()).decode()))) for f in (broken, liar)]
    still_ok = pg.evaluate("async () => (await window.__hp.libStatus()).map(l => l.name).sort().join(',')")
    check('… a broken library list is refused, a file not the size its list says is "damaged"; the libraries loaded before stay', 'not a House Planner library' in msgs[0] and 'damaged' in msgs[1] and still_ok == 'house,public' and not errs, (msgs, still_ok, errs[:2]))
    b.close()

shutil.rmtree(TMP, ignore_errors=True)
sys.exit(summary())
