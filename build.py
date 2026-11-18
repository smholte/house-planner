#!/usr/bin/env python3
"""Bundle House Planner into
   dist/house-planner.html            one self-contained file (open it on a PC, works offline)
   dist/house-planner-app/            the same app + manifest, service worker and icons (host it, then
                                      "Add to Home Screen" on a phone for a full-screen offline app)
   dist/web/                          the web version for the public address: the made-up example house, never a house built in

   python3 build.py                   with the house in house/ when that folder is there (the owner's app), else public
   python3 build.py --no-house        the public app: the made-up example house (build/example.json), no house built in
   python3 build.py --house DIR       with the house in DIR (DIR/house.json: its modules, texts and example)
"""
import base64, hashlib, json, os, re, shutil, sys, urllib.parse, zipfile
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
ARGS = sys.argv[1:]
# ── the house built into the app (task 0003): a folder with house.json – its own modules (src/), texts (i18n.json, and
#    "texts": public English → its own), its example house (example.json) and the words that must never be public
#    ("secret"). Without one the app is the public app with the made-up example house of build/example.json. ──
HOUSE_DIR = None
if '--no-house' in ARGS:
    ARGS.remove('--no-house'); HOUSE_DIR = ''
if '--house' in ARGS:
    _i = ARGS.index('--house'); HOUSE_DIR = os.path.abspath(ARGS[_i + 1]); del ARGS[_i:_i + 2]
if HOUSE_DIR is None:
    HOUSE_DIR = os.path.join(ROOT, 'house') if os.path.isfile(os.path.join(ROOT, 'house', 'house.json')) else ''
HOUSE_CFG = json.load(open(os.path.join(HOUSE_DIR, 'house.json'), encoding='utf-8')) if HOUSE_DIR else None
# three.js r187 (build/three.module.min.js: three.module.js + three.core.js bundled and minified with esbuild) and pdf.js 3.2.146 are kept in vendor/, so the app can be rebuilt from the source zip alone
THREE_DIR = ARGS[0] if ARGS else os.path.join(ROOT, 'vendor', 'three')
VENDOR = os.path.join(ROOT, 'vendor')

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

# ── three.js: wrap the ES module in a function and return its exports as an object ──
three = read(os.path.join(THREE_DIR, 'build/three.module.min.js'))
m = re.search(r'export\s*\{([^}]*)\};?\s*$', three)
assert m, 'three export block not found'
pairs = []
for item in m.group(1).split(','):
    item = item.strip()
    if not item:
        continue
    if ' as ' in item:
        local, name = [x.strip() for x in item.split(' as ')]
    else:
        local = name = item
    pairs.append(f'{name}:{local}')
three_body = three[:m.start()]
three_js = 'const THREE = (function(){\n' + three_body + '\nreturn {' + ','.join(pairs) + '};\n})();\n'

orbit = read(os.path.join(THREE_DIR, 'examples/jsm/controls/OrbitControls.js'))
im = re.search(r'import\s*\{([^}]*)\}\s*from\s*[\'"]three[\'"];', orbit)
assert im
orbit = orbit[:im.start()] + 'const {' + im.group(1) + '} = THREE;' + orbit[im.end():]
orbit = re.sub(r'export\s*\{\s*OrbitControls\s*\};?', '', orbit)
orbit_js = 'const OrbitControls = (function(){\n' + orbit + '\nreturn OrbitControls;\n})();\n'

# ── three.js add-ons (loaders for imported models, the model exporter, soft shadows): plain ES modules turned into
#    factories, packed (gzip + base64) and unpacked the first time one is needed: await addon('loaders/GLTFLoader.js') ──
ADDONS = ['utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js', 'loaders/GLTFLoader.js', 'loaders/MTLLoader.js', 'loaders/OBJLoader.js',
          'exporters/GLTFExporter.js', 'shaders/CopyShader.js', 'shaders/OutputShader.js', 'shaders/GTAOShader.js',
          'shaders/PoissonDenoiseShader.js', 'math/SimplexNoise.js', 'postprocessing/Pass.js', 'postprocessing/ShaderPass.js',
          'postprocessing/MaskPass.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
          'postprocessing/OutputPass.js', 'postprocessing/GTAOPass.js', 'csm/CSMFrustum.js', 'csm/CSMShader.js', 'csm/CSM.js',
          'loaders/HDRLoader.js', 'lights/SunLightShadow.js', 'lights/SunLight.js', 'gpu-pathtracer/pathtracer.js',
          # the asset library (task 0009): GPU-compressed pictures (KTX2; the basis transcoder itself is in the library) and
          # meshopt-packed models
          'utils/WorkerPool.js', 'libs/ktx-parse.module.js', 'libs/zstddec.module.js', 'math/ColorSpaces.js', 'loaders/KTX2Loader.js',
          'libs/meshopt_decoder.module.js']
def addon_factory(rel):
    src = read(os.path.join(THREE_DIR, 'examples/jsm', rel))
    here = os.path.dirname(rel)
    def imp(m):
        names = re.sub(r'\s+as\s+', ': ', m.group(1))
        frm = m.group(2)
        if frm == 'three':
            return 'const {' + names + '} = THREE;'
        key = os.path.normpath(os.path.join(here, frm)).replace(os.sep, '/')
        assert key in ADDONS, f'{rel}: missing add-on {key}'
        return 'const {' + names + '} = req(' + json.dumps(key) + ');'
    src = re.sub(r'^import\s*\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"];?', imp, src, flags=re.M)
    exported = []
    def exp_block(m):
        for item in m.group(1).split(','):
            item = item.strip()
            if not item:
                continue
            if ' as ' in item:
                local, name = [x.strip() for x in item.split(' as ')]
                exported.append(f'{name}: {local}')
            else:
                exported.append(item)
        return ''
    src = re.sub(r'^export\s*\{([^}]*)\};?', exp_block, src, flags=re.M)
    # (a minified module: its export block at the end of a line)
    src = re.sub(r'export\s*\{([^}]*)\};?\s*$', exp_block, src)
    def exp_decl(m):
        exported.append(m.group(2))
        return m.group(1) + m.group(2)
    src = re.sub(r'^export\s+((?:async\s+)?(?:function\*?|class|const|let|var)\s+)([A-Za-z_$][\w$]*)', exp_decl, src, flags=re.M)
    # (KTX2Loader's default path of the transcoder: not used – the app gives it the library's copy)
    src = src.replace('import.meta.url', 'location.href')
    assert not re.search(r'^\s*(import|export)\s', src, re.M), rel + ': an import / export was left'
    return json.dumps(rel) + ': function (THREE, req) {\n' + src + '\nreturn {' + ', '.join(dict.fromkeys(exported)) + '};\n}'
addons_js = 'return {\n' + ',\n'.join(addon_factory(r) for r in ADDONS) + '\n};\n'

order = ['util.js', 'house.js', 'i18n.js', 'store.js', 'library.js', 'model.js', 'outline.js', 'furniture.js', 'renato.js', 'ifc.js', 'ifc2house.js', 'ui.js', 'plan2d.js', 'plan2d-x.js', 'view3d.js', 'view3d-x.js', 'texlib.js', 'sunnear.js', 'reuse.js', 'smooth.js', 'batch.js', 'app.js', 'history.js', 'search.js', 'help.js', 'panels.js', 'modes.js', 'furnish.js', 'kitchen.js', 'models.js', 'space.js', 'notes.js', 'diary.js', 'docs.js', 'share.js', 'walk.js', 'tour.js', 'ral.js', 'extras.js', 'edit.js', 'finish.js', 'materials.js', 'wallviews.js', 'quantities.js', 'install.js', 'budget.js', 'tasks.js', 'stairs.js', 'voids.js', 'openings.js', 'facade.js', 'drawings.js', 'garden.js', 'trees.js', 'around.js', 'hood.js', 'gate.js', 'sun.js', 'hq.js', 'glow.js', 'speed.js', 'autoq.js', 'autoexp.js', 'denoise.js', 'render.js', 'hphash.js', 'hpuv.js', 'hpscene.js', 'hpbake.js', 'toolbox-folder.js', 'toolbox.js', 'ar.js', 'pdfplans.js', 'merge.js', 'backup.js', 'feedback.js', 'fullscreen.js', 'main.js']
# the public app's modules; a house built in adds its own just before main.js (its big files between two marks, left
# out of copies for viewing: share.js viewerScript)
public_js = '\n'.join(read(os.path.join(SRC, f)) for f in order)
house_js = public_js
if HOUSE_CFG:
    bar = '─' * 9
    mods = []
    for f in HOUSE_CFG['modules']:
        code = read(os.path.join(HOUSE_DIR, 'src', f))
        if f in HOUSE_CFG.get('bigFiles', []):
            code = f'/* {bar} the big files of the house {bar} */\n' + code + f'\n/* {bar} end of the big files of the house {bar} */'
        mods.append(code)
    k = house_js.index('/* ───────────── main.js')
    house_js = house_js[:k] + '\n'.join(mods) + '\n' + house_js[k:]
    # the house's own words where the public app has general ones (e.g. the builder's name): whole texts in quotes
    for pub, own in HOUSE_CFG.get('texts', []):
        q = lambda x: "'" + x.replace("'", "\\'") + "'"
        n = house_js.count(q(pub))
        house_js = house_js.replace(q(pub), q(own))
        assert n or pub in read(os.path.join(SRC, 'index.html')), 'house text not found: ' + pub

# the Dutch and Norwegian words (i18n/translations.json: { English: [Dutch, Norwegian] }), right after i18n.js
import gzip
tr_path = os.path.join(ROOT, 'i18n', 'translations.json')
def lang_block(js, extra=None):
    """the dictionary (with a house's own words), packed: unpacked at start only when Dutch or Norwegian is chosen"""
    if not os.path.exists(tr_path):
        return js
    tr = json.load(open(tr_path, encoding='utf-8'))
    tr.update(extra or {})
    nl = {k: v[0] for k, v in tr.items() if v and v[0]}
    no = {k: v[1] for k, v in tr.items() if v and v[1]}
    packed_tr = base64.b64encode(gzip.compress(json.dumps({'nl': nl, 'no': no}, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9, mtime=0)).decode()
    i = js.index('/* ───────────── store.js')
    return js[:i] + "const LANG_GZ = '" + packed_tr + "';\n" + js[i:]
# the PDF reader, packed (gzip + base64): unpacked only when a PDF is opened, and it works without internet
def packed(name):
    return base64.b64encode(gzip.compress(open(os.path.join(VENDOR, name), 'rb').read(), 9, mtime=0)).decode()
# the built-in model library (node tools/pack-models.mjs "<Kenney kit>/Models/GLTF format" → build/models.json)
models_path = os.path.join(ROOT, 'build', 'models.json')
def libs_block(js):
    js = "const PDFJS_GZ = { lib: '" + packed('pdf.min.js') + "', worker: '" + packed('pdf.worker.min.js') + "' };\n" + js
    js = "const ADDONS_GZ = '" + base64.b64encode(gzip.compress(addons_js.encode(), 9, mtime=0)).decode() + "';\n" + js
    # (the models' names, sizes and outlines; their geometry – the blob – is in the single file's base and in the library)
    return 'const MODEL_LIB = ' + (json.dumps(MODEL_META, separators=(',', ':')) if MODEL_META else 'null') + ';\n' + js
MODEL_SRC = json.loads(read(models_path)) if os.path.exists(models_path) else None
MODEL_META = {k: v for k, v in MODEL_SRC.items() if k != 'blob'} if MODEL_SRC else None
if MODEL_META:
    MODEL_META['pack'] = 'pack:kenney'
def example_block(path):
    """the example house packed (gzip + base64), unpacked only when the example is opened; with the files of its documents"""
    if not os.path.exists(path):
        return ''
    ex = json.loads(read(path))
    gz = base64.b64encode(gzip.compress(json.dumps(ex['project'], ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9, mtime=0)).decode()
    files = (', files: ' + json.dumps(ex['files'], separators=(',', ':'))) if ex.get('files') else ''
    return "const EXAMPLE_HOUSE = { projectGz: '" + gz + "', shellGz: '" + ex['shellGz'] + "'" + files + " };\n"
example_path = os.path.join(HOUSE_DIR, 'example.json') if HOUSE_CFG else os.path.join(ROOT, 'build', 'example.json')
house_tr = json.load(open(os.path.join(HOUSE_DIR, 'i18n.json'), encoding='utf-8')) if HOUSE_CFG and os.path.exists(os.path.join(HOUSE_DIR, 'i18n.json')) else None
app_js = example_block(example_path) + libs_block(lang_block(house_js, house_tr))
# the web version: the public app with the made-up example house only (task 0008) – never a house built in
made_up_path = os.path.join(ROOT, 'build', 'example.json')
app_js_web = example_block(made_up_path) + libs_block(lang_block(public_js))

# ── the asset library (task 0009, tools/build-library.py): build/library/ (pictures, skies, their KTX2 copies) + the
#    Kenney models' geometry + the KTX2 reader + – the owner's app only – his models (house/models/). The hosted versions
#    (app folder, web) have it in lib/ and load from it what they need; dist/house-planner-library.zip is the same for
#    the single file (Settings → Library → Load library…). The single file has the base inside: the picture sets at
#    their smallest size (today's look), the skies at 512 and the Kenney geometry. ──
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import importlib.util
_spec = importlib.util.spec_from_file_location('build_library', os.path.join(ROOT, 'tools', 'build-library.py'))
BL = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(BL)
LIB_SRC = os.path.join(ROOT, 'build', 'library')
LIB_MAN = BL.load(LIB_SRC) if os.path.exists(os.path.join(LIB_SRC, 'library.json')) else None
if LIB_MAN:
    # (the source copy in the app zip leaves the KTX2 copies out: an item's file that is not here is left out of the build)
    dropped = 0
    for it in LIB_MAN['items']:
        for k in list((it.get('gpu') or {}).keys()):
            if not os.path.exists(os.path.join(LIB_SRC, it['gpu'][k][0]['f'])):
                del it['gpu'][k]; dropped += 1
    if dropped:
        print(f'library    : {dropped} KTX2 pictures not here (python3 tools/build-library.py --gpu makes them) – left out')
def lib_bytes(f):
    return open(os.path.join(LIB_SRC, f), 'rb').read()
def base_block():
    """the single file's built-in base, in the shape texlib.js reads (TEXLIB_DATA): each base set with its smallest
    pictures as data URLs, the skies at their smallest size"""
    if not LIB_MAN:
        return None
    mime = {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}
    sets, skies = {}, {}
    for it in LIB_MAN['items']:
        if not it.get('base'):
            continue
        if it['kind'] == 'tex':
            e = dict(it['meta'])
            for k, files in it['maps'].items():
                v = min(files, key=lambda x: x['px'])
                e[k] = 'data:' + mime[v['f'].rsplit('.', 1)[1]] + ';base64,' + base64.b64encode(lib_bytes(v['f'])).decode()
            sets[it['id']] = e
        elif it['kind'] == 'sky':
            v = min(it['files'], key=lambda x: x['px'])
            skies[it['id'].split(':', 1)[1]] = {'hdr': base64.b64encode(lib_bytes(v['f'])).decode(), 'size': [v['px'], v['px'] // 2]}
    return json.dumps({'v': 1, 'base': True, 'source': LIB_MAN.get('source', ''), 'sets': sets, 'skies': skies}, separators=(',', ':'))
tex_json = base_block()

def house_models():
    """the owner's models (house/models: contents.csv + .glb) as library items, never public: packed for phones by
    node tools/glb-pack.mjs when it can run here (npm ci --prefix tools), else as they are; packed copies are kept in
    dist/.glbcache by the source file's hash"""
    if not HOUSE_CFG:
        return []
    mdir = os.path.join(HOUSE_DIR, 'models')
    csv_path = os.path.join(mdir, 'contents.csv')
    if not os.path.exists(csv_path):
        return []
    import csv
    rows = [r for r in csv.DictReader(open(csv_path, encoding='utf-8')) if r.get('file', '').endswith('.glb')]
    cache = os.path.join(DIST, '.glbcache')
    os.makedirs(cache, exist_ok=True)
    jobs, info = [], {}
    for r in rows:
        src = os.path.join(mdir, r['file'])
        h = hashlib.sha256(open(src, 'rb').read()).hexdigest()[:16]
        out = os.path.join(cache, h + '.glb')
        info[r['file']] = (h, out)
        if not os.path.exists(out + '.json'):
            jobs.append({'in': src, 'out': out})
    packer = os.path.join(ROOT, 'tools', 'node_modules', '@gltf-transform', 'core')
    if jobs and os.path.isdir(packer) and shutil.which('node'):
        import subprocess
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'glb-pack.mjs')], input=json.dumps(jobs), capture_output=True, text=True)
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                if line.startswith('{'):
                    d = json.loads(line)
                    open(d['out'] + '.json', 'w').write(json.dumps(d))
        else:
            print('house models: packing failed – kept as they are\n' + r.stderr[-800:])
    items, raw = [], 0
    for r in rows:
        h, out = info[r['file']]
        src = os.path.join(mdir, r['file'])
        packed = os.path.exists(out + '.json')
        d = json.load(open(out + '.json')) if packed else {}
        slug = os.path.splitext(os.path.basename(r['file']))[0]
        size = [round(float(r[k]) / 100, 4) for k in ('width cm', 'depth cm', 'height cm')]
        # its picture for Add furniture (task 0028): made once by tools/model-thumbs.py into house/models/thumbs/
        thumb = os.path.join(mdir, 'thumbs', slug + '.webp')
        items.append({'id': 'l:' + slug, 'kind': 'model', 'private': True, 'licence': r.get('licence', ''), 'source': r.get('source', ''),
                      'name': r['name'], 'cat': r.get('room', ''), 'size': size, 'o': d.get('o', []), 'u': d.get('u', []),
                      '_src': out if packed else src, '_name': f'models/{slug}', '_thumb': thumb if os.path.exists(thumb) else None})
        raw += os.path.getsize(src)
    if items:
        print(f"house models: {len(items)} ({raw / 1e6:.1f} MB as they are; " + ('packed' if all(os.path.exists(info[r['file']][1] + '.json') for r in rows) else 'NOT packed: npm ci --prefix tools') + '; '
              + (f"{sum(1 for i in items if i['_thumb'])} pictures" if all(i['_thumb'] for i in items) else f"{sum(1 for i in items if not i['_thumb'])} without a picture: python3 tools/model-thumbs.py") + ')')
    return items

def house_docs():
    """the house's documents (house/docs: docs.json + the PDFs and their thumbs, task 0022) as library items 'doc:<key>',
    never public: the app file no longer carries them – a document of the house names its item (doc.lib) and the app
    copies its files into the house the first time it opens where the library is"""
    if not HOUSE_CFG:
        return []
    ddir = os.path.join(HOUSE_DIR, 'docs')
    lst = os.path.join(ddir, 'docs.json')
    if not os.path.exists(lst):
        return []
    items = []
    for key, d in json.load(open(lst, encoding='utf-8')).items():
        items.append({'id': 'doc:' + key, 'kind': 'doc', 'private': True, 'licence': 'private (the house\'s own documents)', 'name': key,
                      '_files': [(f'docs/{key}', 'pdf', os.path.join(ddir, d['pdf']), {}),
                                 (f'docs/{key}', 'jpg', os.path.join(ddir, d['thumb']), {'thumb': True, 'w': d['tw'], 'h': d['th']})]})
    print(f"house docs : {len(items)} ({sum(os.path.getsize(f[2]) for i in items for f in i['_files']) / 1e6:.1f} MB) – into the library")
    return items

def make_lib(dst, extra=()):
    """a whole library folder at dst: build/library + the Kenney pack + the KTX2 reader + extra items; returns its manifest"""
    if not LIB_MAN:
        return None
    shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    man = json.loads(json.dumps(LIB_MAN))
    for f in BL.files_of(man):
        os.makedirs(os.path.dirname(os.path.join(dst, f['f'])), exist_ok=True)
        shutil.copyfile(os.path.join(LIB_SRC, f['f']), os.path.join(dst, f['f']))
    def put(stem, ext, data):
        return BL.put(dst, os.path.dirname(stem), os.path.basename(stem), ext, data)
    if MODEL_SRC:
        man['items'].append({'id': 'pack:kenney', 'kind': 'pack', 'licence': 'CC0', 'source': MODEL_SRC.get('source', 'Kenney'), 'base': True,
                             'files': [put('models/kenney', 'bin.gz', base64.b64decode(MODEL_SRC['blob']))]})
    basis = os.path.join(THREE_DIR, 'examples', 'jsm', 'libs', 'basis')
    man['items'].append({'id': 'code:basis', 'kind': 'code', 'licence': 'Apache-2.0 (code, not a picture or model)', 'source': 'Basis Universal transcoder (three.js r187)',
                         'files': [dict(name=n, **put('code/' + n.split('.')[0], n.split('.', 1)[1], open(os.path.join(basis, n), 'rb').read())) for n in ('basis_transcoder.js', 'basis_transcoder.wasm')]})
    for it in extra:
        it = dict(it)
        if '_files' in it:
            it['files'] = [dict(put(stem, ext, open(src, 'rb').read()), **more) for stem, ext, src, more in it.pop('_files')]
            man['items'].append(it)
            continue
        src, stem, thumb = it.pop('_src'), it.pop('_name'), it.pop('_thumb', None)
        it['files'] = [put(stem, 'glb', open(src, 'rb').read())]
        if thumb:
            it['files'].append(dict(put(stem, 'webp', open(thumb, 'rb').read()), thumb=True))
        man['items'].append(it)
    man['name'] = 'house' if any(it.get('private') for it in man['items']) else 'public'
    man['build'] = ver
    BL.save(man, dst)
    return man

HOUSE_MODELS = house_models()
HOUSE_DOCS = house_docs()

def wrap(body, inline_tex, house_models=0):
    pre = ('const TEXLIB_DATA = ' + tex_json + ';\n') if (inline_tex and tex_json) else 'const TEXLIB_DATA = null;\n'
    # (the owner's app knows how many models its library brings, so Add furniture can say where to get it; task 0028)
    pre += f'const LIB_HOUSE_MODELS = {int(house_models)};\n'
    pre += ("const MODEL_LIB_BLOB = '" + MODEL_SRC['blob'] + "';\n") if (inline_tex and MODEL_SRC) else 'const MODEL_LIB_BLOB = null;\n'
    # (the KTX2 transcoder is taken from the library only when it is exactly this app's copy)
    pre += 'const LIB_CODE_SHA = ' + json.dumps({n: hashlib.sha256(open(os.path.join(THREE_DIR, 'examples', 'jsm', 'libs', 'basis', n), 'rb').read()).hexdigest() for n in ('basis_transcoder.js', 'basis_transcoder.wasm')}) + ';\n'
    return ("(function(){\n'use strict';\n" + pre + three_js + orbit_js + body + '\n})();\n').replace('</script', '<\\/script')
js = wrap(app_js, True, len(HOUSE_MODELS))
js_hosted = wrap(app_js, False, len(HOUSE_MODELS))

css = read(os.path.join(SRC, 'styles.css'))
for w in ('Medium', 'SemiBold'):
    b64 = base64.b64encode(open(os.path.join(ROOT, f'barlow-{w}.woff'), 'rb').read()).decode()
    css = css.replace(f'__BARLOW_{w.upper()}__', b64)

favicon_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="1" y="1" width="46" height="46" rx="8" fill="#1A2326"/>'
               '<path d="M10 37V21L24 10l14 11v16" fill="none" stroke="#EEF2F1" stroke-width="3.4" stroke-linejoin="round"/>'
               '<path d="M10 37h28" stroke="#EEF2F1" stroke-width="3.4"/><path d="M24 37V27h7" fill="none" stroke="#D2372B" stroke-width="3.4"/>'
               '<path d="M17 27h4" stroke="#E2A400" stroke-width="3.4"/></svg>')

index_src = read(os.path.join(SRC, 'index.html'))
for pub, own in (HOUSE_CFG or {}).get('texts', []):
    index_src = index_src.replace(pub, own)
html_src = index_src.replace('__CSS__', css).replace('__FAVICON__', urllib.parse.quote(favicon_svg))
html = html_src.replace('__JS__', js)
html_hosted = html_src.replace('__JS__', js_hosted)
# the build code: made from the app itself (with the placeholder still in it), so the same app gives the same code; the
# app shows it at the bottom of the projects page (APP_VERSION in util.js) and the offline copy's cache carries it (sw.js)
ver = hashlib.sha1((html + json.dumps(LIB_MAN or {}, sort_keys=True)).encode()).hexdigest()[:10]
assert html.count("'__BUILD__'") == 1, 'APP_VERSION.build placeholder'
html = html.replace("'__BUILD__'", "'" + ver + "'")
html_hosted = html_hosted.replace("'__BUILD__'", "'" + ver + "'")

os.makedirs(DIST, exist_ok=True)
single = os.path.join(DIST, 'house-planner.html')
with open(single, 'w', encoding='utf-8') as f:
    f.write(html)

# ── installable bundle ──
app_dir = os.path.join(DIST, 'house-planner-app')
shutil.rmtree(app_dir, ignore_errors=True)
os.makedirs(app_dir)
with open(os.path.join(app_dir, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html_hosted)
app_lib = make_lib(os.path.join(app_dir, 'lib'), HOUSE_MODELS + HOUSE_DOCS)

def draw_icon(size, maskable=False):
    s = size / 48.0
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, size, size], fill='#1A2326')
        s2 = s * 0.72
        off = size * 0.14
    else:
        d.rounded_rectangle([1 * s, 1 * s, 47 * s, 47 * s], radius=8 * s, fill='#1A2326')
        s2, off = s, 0
    P = lambda x, y: (off + x * s2, off + y * s2)
    w = max(2, int(3.4 * s2))
    d.line([P(10, 37), P(10, 21), P(24, 10), P(38, 21), P(38, 37)], fill='#EEF2F1', width=w, joint='curve')
    d.line([P(10 - 1.7, 37), P(38 + 1.7, 37)], fill='#EEF2F1', width=w)
    d.line([P(24, 37), P(24, 27), P(31, 27)], fill='#D2372B', width=w, joint='curve')
    d.line([P(17, 27), P(21, 27)], fill='#E2A400', width=w)
    return img

draw_icon(192).save(os.path.join(app_dir, 'icon-192.png'))
draw_icon(512).save(os.path.join(app_dir, 'icon-512.png'))
draw_icon(512, maskable=True).save(os.path.join(app_dir, 'icon-maskable-512.png'))
apple = draw_icon(180, maskable=True)
apple.save(os.path.join(app_dir, 'apple-touch-icon.png'))

manifest = {
    'name': 'House Planner', 'short_name': 'House Planner',
    'description': 'Floor plans, versions and changes for your house. Works offline.',
    'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'any',
    'background_color': '#EEF2F1', 'theme_color': '#FBFCFC',
    'icons': [
        {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
        {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
        {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
    # .hpbake: a bake double-clicked opens in the installed app and goes to its house (task 0042: toolbox.js launchQueue)
    'file_handlers': [{'action': './', 'accept': {'application/json': ['.json']}}, {'action': './', 'accept': {'application/x-hpbake': ['.hpbake']}}],
}
with open(os.path.join(app_dir, 'manifest.webmanifest'), 'w') as f:
    json.dump(manifest, f, indent=2)

sw = read(os.path.join(SRC, 'sw.js')).replace('__VERSION__', ver)
with open(os.path.join(app_dir, 'sw.js'), 'w') as f:
    f.write(sw)
shutil.copy(os.path.join(ROOT, 'README-app.txt'), os.path.join(app_dir, 'README.txt'))
shutil.copy(os.path.join(ROOT, 'OFL-barlow.txt'), os.path.join(app_dir, 'LICENSE-font-barlow.txt'))
shutil.copy(os.path.join(VENDOR, 'LICENSE-pdfjs.txt'), os.path.join(app_dir, 'LICENSE-pdfjs.txt'))
shutil.copy(os.path.join(VENDOR, 'three', 'LICENSE'), os.path.join(app_dir, 'LICENSE-threejs.txt'))
shutil.copy(os.path.join(VENDOR, 'LICENSE-kenney.txt'), os.path.join(app_dir, 'LICENSE-kenney-models.txt'))
shutil.copy(os.path.join(VENDOR, 'LICENSE-pathtracer.txt'), os.path.join(app_dir, 'LICENSE-pathtracer.txt'))

zpath = os.path.join(DIST, 'house-planner-app.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    # (the library in lib/ too: stored, its pictures and models are packed already)
    for dirpath, dirs, files in os.walk(app_dir):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, app_dir).replace(os.sep, '/')
            z.write(full, arcname='house-planner/' + rel, compress_type=zipfile.ZIP_STORED if rel.startswith('lib/') else zipfile.ZIP_DEFLATED)
    # the source, so the app can be changed later
    for name in sorted(os.listdir(SRC)):
        z.write(os.path.join(SRC, name), arcname='house-planner-source/src/' + name)
    for name in ('build.py', 'DEVELOPING.md', 'DEPLOY.md', 'barlow-Medium.woff', 'barlow-SemiBold.woff', 'OFL-barlow.txt', 'README-app.txt'):
        z.write(os.path.join(ROOT, name), arcname='house-planner-source/' + name)
    # vendored libraries, the automatic tests, the tools (with the made-up example house) and the house built in
    subs = ['vendor', 'tests', 'i18n', 'tools'] + ([os.path.relpath(HOUSE_DIR, ROOT)] if HOUSE_CFG and os.path.abspath(HOUSE_DIR).startswith(ROOT + os.sep) else [])
    for sub in subs:
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        for dirpath, _, files in os.walk(base):
            for name in sorted(files):
                # (the house's furniture models and documents stay out: makers' licences, and they are in the library
                #  already – 0005, 0022)
                if (name.endswith('.png') and sub != 'tools') or '__pycache__' in dirpath or os.sep + 'shots' in dirpath or 'node_modules' in dirpath \
                        or (sub not in ('vendor', 'tests', 'i18n', 'tools') and os.path.relpath(dirpath, base).split(os.sep)[0] in ('models', 'docs')):
                    continue
                full = os.path.join(dirpath, name)
                z.write(full, arcname='house-planner-source/' + os.path.relpath(full, ROOT))
    # the packed example house and model library, so the app can be rebuilt without the IFC files or the kit
    for name in ('example.json', 'models.json'):
        full = os.path.join(ROOT, 'build', name)
        if os.path.exists(full):
            z.write(full, arcname='house-planner-source/build/' + name)
    # the library's sources (without the KTX2 copies: python3 tools/build-library.py --gpu makes them again)
    for f in (['library.json'] + [v['f'] for v in BL.files_of(LIB_MAN) if not v['f'].startswith('gpu/')] if LIB_MAN else []):
        z.write(os.path.join(LIB_SRC, f), arcname='house-planner-source/build/library/' + f, compress_type=zipfile.ZIP_STORED)

# the library as one zip, for the single file (Settings → Library → Load library…): the app folder's lib/ (the owner's
# app: with his models)
lzip = os.path.join(DIST, 'house-planner-library.zip')
if app_lib:
    with zipfile.ZipFile(lzip, 'w', zipfile.ZIP_STORED) as z:
        for f in ['library.json'] + [v['f'] for v in BL.files_of(app_lib)]:
            z.write(os.path.join(app_dir, 'lib', f), arcname=f)


# ── a web version for a fixed web address (GitHub Pages: the "Publish web version" workflow, task 0008) ──
# The public app with the made-up example house (build/example.json) – never a house built in. Your own houses are
# added by importing a file. This script only makes the files (dist/web and dist/house-planner-web.zip); it never puts
# anything online.
web_js = wrap('const WEB_BUILD = true;\n' + app_js_web, False)
web_html = read(os.path.join(SRC, 'index.html')).replace('__CSS__', css).replace('__FAVICON__', urllib.parse.quote(favicon_svg)).replace('__JS__', web_js).replace("'__BUILD__'", "'" + ver + "'")
assert 'HOUSE.migrate =' not in web_js and 'Object.assign(HOUSE' not in web_js, 'a house is built into the web version'
assert web_js.count('EXAMPLE_HOUSE = {') == (1 if os.path.exists(made_up_path) else 0), 'the web version has the made-up example only'
if os.path.exists(made_up_path):
    assert example_block(made_up_path) in web_js, 'the web version\'s example is not the made-up house'
# nothing of a house may be in the public app or the web version. Its words: house.json "secret" of the house built in,
# or of house/ when it is there (also for --no-house), and the lines of the environment variable HP_SECRET_WORDS (the
# public repository's GitHub secret HOUSE_WORDS, task 0008: the list itself is never public). The dictionary and the
# made-up example are checked unpacked.
def secret_words():
    cfg = HOUSE_CFG or (json.load(open(os.path.join(ROOT, 'house', 'house.json'), encoding='utf-8')) if os.path.isfile(os.path.join(ROOT, 'house', 'house.json')) else {})
    env = [w.strip() for w in os.environ.get('HP_SECRET_WORDS', '').splitlines() if w.strip()]
    return list(dict.fromkeys(cfg.get('secret', []) + env))
def unpacked_example(path):
    if not os.path.exists(path):
        return ''
    ex = json.loads(read(path))
    out = [read(path)]
    for k in ('projectGz', 'shellGz'):
        if ex.get(k):
            out.append(gzip.decompress(base64.b64decode(ex[k])).decode('utf-8', 'replace'))
    return '\n'.join(out)
_public_text = '\n'.join([public_js, web_html, read(os.path.join(ROOT, 'DEPLOY.md')), read(tr_path) if os.path.exists(tr_path) else '', unpacked_example(made_up_path)])
SECRET_WORDS = secret_words()
for w in SECRET_WORDS:
    assert w not in _public_text, 'the public app holds a word of the house: ' + w
web_dir = os.path.join(DIST, 'web')
shutil.rmtree(web_dir, ignore_errors=True)
shutil.copytree(app_dir, web_dir, ignore=shutil.ignore_patterns('lib'))
# the web version's library: the public one only – never the owner's models; every item CC0 / CC BY, no house word in
# its list or in any of its files
web_lib = make_lib(os.path.join(web_dir, 'lib'))
if web_lib:
    assert not any(it.get('private') or it['kind'] in ('model', 'doc') for it in web_lib['items']), 'a private model or document in the web version\'s library'
    assert not [p for p in BL.check(os.path.join(web_dir, 'lib'), public=False) if 'licence' not in p], BL.check(os.path.join(web_dir, 'lib'), public=False)
    for it in web_lib['items']:
        assert it['kind'] == 'code' or str(it.get('licence', '')).startswith(BL.PUBLIC_LICENCES), 'the web version\'s library: not CC0 / CC BY: ' + it['id']
    _found = BL.words_in(os.path.join(web_dir, 'lib'), SECRET_WORDS)
    assert not _found, 'the web version\'s library holds a word of the house: ' + str(_found[:3])
with open(os.path.join(web_dir, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(web_html)
shutil.copy(os.path.join(ROOT, 'DEPLOY.md'), os.path.join(web_dir, 'DEPLOY.md'))
if os.path.exists(os.path.join(web_dir, 'README.txt')):
    os.remove(os.path.join(web_dir, 'README.txt'))  # that one is about the version with the example house
wzip = os.path.join(DIST, 'house-planner-web.zip')
with zipfile.ZipFile(wzip, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirs, files in os.walk(web_dir):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, web_dir).replace(os.sep, '/')
            z.write(full, arcname=rel, compress_type=zipfile.ZIP_STORED if rel.startswith('lib/') else zipfile.ZIP_DEFLATED)
print('web version:', wzip, f'{os.path.getsize(wzip)/1024:.0f} KB')
print('single file:', single, f'{os.path.getsize(single)/1024:.0f} KB')
print('app zip    :', zpath, f'{os.path.getsize(zpath)/1024:.0f} KB', 'version', ver)
if app_lib:
    print('library    :', lzip, f'{os.path.getsize(lzip)/1024:.0f} KB', f"({len(app_lib['items'])} items, '{app_lib['name']}')")
print('house words:', f'{len(SECRET_WORDS)} checked against the public app and the web version' if SECRET_WORDS else 'none known here (no house/house.json, no HP_SECRET_WORDS) – not checked')
print('house      :', (HOUSE_CFG.get('name', '?') + ' (' + os.path.relpath(HOUSE_DIR, ROOT) + ')') if HOUSE_CFG else 'none – the public app, with the made-up example house')
