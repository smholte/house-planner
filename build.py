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
          'loaders/HDRLoader.js', 'lights/SunLightShadow.js', 'lights/SunLight.js', 'gpu-pathtracer/pathtracer.js']
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
    def exp_decl(m):
        exported.append(m.group(2))
        return m.group(1) + m.group(2)
    src = re.sub(r'^export\s+((?:async\s+)?(?:function\*?|class|const|let|var)\s+)([A-Za-z_$][\w$]*)', exp_decl, src, flags=re.M)
    assert not re.search(r'^\s*(import|export)\s', src, re.M), rel + ': an import / export was left'
    return json.dumps(rel) + ': function (THREE, req) {\n' + src + '\nreturn {' + ', '.join(dict.fromkeys(exported)) + '};\n}'
addons_js = 'return {\n' + ',\n'.join(addon_factory(r) for r in ADDONS) + '\n};\n'

order = ['util.js', 'house.js', 'i18n.js', 'store.js', 'model.js', 'outline.js', 'furniture.js', 'renato.js', 'ifc.js', 'ifc2house.js', 'ui.js', 'plan2d.js', 'plan2d-x.js', 'view3d.js', 'view3d-x.js', 'texlib.js', 'sunnear.js', 'reuse.js', 'smooth.js', 'batch.js', 'app.js', 'history.js', 'search.js', 'help.js', 'panels.js', 'modes.js', 'furnish.js', 'kitchen.js', 'models.js', 'space.js', 'notes.js', 'diary.js', 'docs.js', 'share.js', 'walk.js', 'tour.js', 'ral.js', 'extras.js', 'edit.js', 'finish.js', 'materials.js', 'wallviews.js', 'quantities.js', 'install.js', 'budget.js', 'tasks.js', 'stairs.js', 'voids.js', 'openings.js', 'facade.js', 'drawings.js', 'garden.js', 'trees.js', 'around.js', 'hood.js', 'gate.js', 'sun.js', 'hq.js', 'glow.js', 'speed.js', 'autoq.js', 'autoexp.js', 'denoise.js', 'render.js', 'ar.js', 'pdfplans.js', 'merge.js', 'backup.js', 'fullscreen.js', 'main.js']
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
    return 'const MODEL_LIB = ' + (read(models_path) if os.path.exists(models_path) else 'null') + ';\n' + js
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

# the material pictures (tools/build-textures.py → build/textures.json): inside the single file; the hosted versions
# (app folder, web) load textures.json next to index.html
tex_path = os.path.join(ROOT, 'build', 'textures.json')
tex_json = read(tex_path) if os.path.exists(tex_path) else None
def wrap(body, inline_tex):
    pre = ('const TEXLIB_DATA = ' + tex_json + ';\n') if (inline_tex and tex_json) else 'const TEXLIB_DATA = null;\n'
    return ("(function(){\n'use strict';\n" + pre + three_js + orbit_js + body + '\n})();\n').replace('</script', '<\\/script')
js = wrap(app_js, True)
js_hosted = wrap(app_js, False)

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
ver = hashlib.sha1((html + (tex_json or '')).encode()).hexdigest()[:10]
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
if tex_json:
    with open(os.path.join(app_dir, 'textures.json'), 'w', encoding='utf-8') as f:
        f.write(tex_json)

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
    'file_handlers': [{'action': './', 'accept': {'application/json': ['.json']}}],
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
    for name in sorted(os.listdir(app_dir)):
        z.write(os.path.join(app_dir, name), arcname='house-planner/' + name)
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
                if (name.endswith('.png') and sub != 'tools') or '__pycache__' in dirpath or os.sep + 'shots' in dirpath:
                    continue
                full = os.path.join(dirpath, name)
                z.write(full, arcname='house-planner-source/' + os.path.relpath(full, ROOT))
    # the packed example house and model library, so the app can be rebuilt without the IFC files or the kit
    for name in ('example.json', 'models.json', 'textures.json'):
        full = os.path.join(ROOT, 'build', name)
        if os.path.exists(full):
            z.write(full, arcname='house-planner-source/build/' + name)


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
shutil.copytree(app_dir, web_dir)
with open(os.path.join(web_dir, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(web_html)
shutil.copy(os.path.join(ROOT, 'DEPLOY.md'), os.path.join(web_dir, 'DEPLOY.md'))
if os.path.exists(os.path.join(web_dir, 'README.txt')):
    os.remove(os.path.join(web_dir, 'README.txt'))  # that one is about the version with the example house
wzip = os.path.join(DIST, 'house-planner-web.zip')
with zipfile.ZipFile(wzip, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(web_dir)):
        z.write(os.path.join(web_dir, name), arcname=name)
print('web version:', wzip, f'{os.path.getsize(wzip)/1024:.0f} KB')
print('single file:', single, f'{os.path.getsize(single)/1024:.0f} KB')
print('app zip    :', zpath, f'{os.path.getsize(zpath)/1024:.0f} KB', 'version', ver)
print('house words:', f'{len(SECRET_WORDS)} checked against the public app and the web version' if SECRET_WORDS else 'none known here (no house/house.json, no HP_SECRET_WORDS) – not checked')
print('house      :', (HOUSE_CFG.get('name', '?') + ' (' + os.path.relpath(HOUSE_DIR, ROOT) + ')') if HOUSE_CFG else 'none – the public app, with the made-up example house')
