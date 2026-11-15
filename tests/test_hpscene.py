"""Export → For Fresing Render… (task 0031): a house scene (.hpscene) of the house scene format, pinned at tag v1.0.1
(a copy of its checker and sample in tests/house-scene-format/).
1. The app's JavaScript ports of the light-map UV layout (hp-uv/1) and the surface hash (hp-hash/1) give the format's
   sample bit for bit: every UV of set 1, every map size, every hash and the scene hash.
2. The made-up house exported in the test browser passes the format's checker with no ERROR and no WARNING; a second
   export of the same version has the same ids and hashes; what the Show buttons leave out is not in it.
3. The dialog: PC light (Export menu → For Fresing Render…, the file is saved) and phone dark (390 px, nothing wider
   than the screen, the More fold)."""
from common import *
import io, struct, sys, zipfile

HSF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'house-scene-format')
sys.path.insert(0, HSF)
sys.path.insert(0, os.path.join(HSF, 'tools'))
from hsf.check import check as hsf_check  # noqa: E402
from hsf.glb import Glb  # noqa: E402
from hsf.package import Package  # noqa: E402
from hsf import surface as HS  # noqa: E402
import make_samples as MS  # noqa: E402

SAMPLE = os.path.join(HSF, 'samples', 'sample-house.hpscene')


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


def check_package(path, label):
    """the format's checker: no ERROR, no WARNING"""
    rep = hsf_check(path)
    errs, warns = rep.errors, rep.warnings
    check(f'{label}: the checker (v1.0.1) finds no error', not errs, errs[:6])
    check(f'{label}: … and no warning', not warns, warns[:6])
    return rep


def port_test(pg):
    pkg = Package.open(SAMPLE)
    glb = Glb.parse(pkg.files['house.glb'])
    nodes = glb.json['nodes']
    parts = MS.house_parts()
    # the layout: the sample maker's charts (as it gives them to hsf/uv1.py) through the app's hpLayout
    maps = [p for p in parts if p.bake == 'MAP']
    js_in = []
    for p in maps:
        charts = [[[list(c) for q in chart for c in q[0]], list(chart[0][1])] for chart in p.charts]
        js_in.append({'id': p.id, 'charts': charts, 'tpm': p.tpm or MS.TPM_BY_GROUP.get(p.group, MS.TPM)})
    js = pg.evaluate("""(parts) => parts.map(p => { const L = window.__hp.hpLayout(p.charts, p.tpm);
        return { id: p.id, size: L.size, uv: L.uvs.flat().map(([u, v]) => [Math.fround(u), Math.fround(v)]) }; })""", js_in)
    by_name = {n['name']: n for n in nodes}
    same_uv = same_px = 0
    first_bad = None
    for r in js:
        n = by_name[r['id']]
        prim = glb.json['meshes'][n['mesh']]['primitives'][0]
        want = glb.accessor(prim['attributes']['TEXCOORD_1'])
        if [list(t) for t in want] == r['uv']:
            same_uv += 1
        elif not first_bad:
            first_bad = (r['id'], want[:2], r['uv'][:2])
        if list(n['extras']['hp']['uv1_px']) == r['size']:
            same_px += 1
    check(f'hp-uv/1 in JavaScript: UV set 1 of all {len(maps)} light-map surfaces of the sample equal bit for bit', same_uv == len(maps), first_bad)
    check('hp-uv/1 in JavaScript: every map size (uv1_px) equal', same_px == len(maps), (same_px, len(maps)))
    # the hash: every surface of the sample (its stored float32 numbers), with the JS port's own UVs for light maps
    js_uv = {r['id']: r['uv'] for r in js}
    hin = []
    for n in nodes:
        if 'mesh' not in n:
            continue
        hp = n['extras']['hp']
        prims = []
        for prim in glb.json['meshes'][n['mesh']]['primitives']:
            a = prim['attributes']
            pos = [c for p in glb.accessor(a['POSITION']) for c in p]
            uv1 = [c for t in js_uv[hp['id']] for c in t] if hp['bake'] == 'MAP' else None
            prims.append({'pos': pos, 'uv1': uv1, 'idx': list(glb.accessor(prim['indices']))})
        hin.append({'id': hp['id'], 'prims': prims, 'px': hp.get('uv1_px') if hp['bake'] == 'MAP' else None, 'want': hp['hash']})
    got = pg.evaluate("""(list) => list.map(s => window.__hp.hpSurfaceHash(s.prims.map(p => ({ pos: Float32Array.from(p.pos), uv1: p.uv1 && Float32Array.from(p.uv1), idx: Uint32Array.from(p.idx) })), s.px))""", hin)
    same = sum(1 for s, g in zip(hin, got) if s['want'] == g)
    check(f'hp-hash/1 in JavaScript: all {len(hin)} surface hashes of the sample equal', same == len(hin), [(s['id'], s['want'], g) for s, g in zip(hin, got) if s['want'] != g][:3])
    sh = pg.evaluate("(pairs) => window.__hp.hpSceneHash(pairs)", {s['id']: s['want'] for s in hin})
    check('the scene hash equals the sample\'s', sh == pkg.doc['scene_hash'], (sh, pkg.doc['scene_hash']))
    # round half away from zero (not Math.round): -0.0005 m is -1 mm, as in Python
    edge = pg.evaluate("() => window.__hp.hpSurfaceHash([{ pos: Float32Array.from([-0.0005, 0.0005, 1.5]), uv1: null, idx: null }], null)")
    want = hashlib_hash([-0.0005, 0.0005, 1.5])
    check('halves round away from zero, as the reference does', edge == want, (edge, want))


def hashlib_hash(pos):
    """the reference hash of one primitive without indices (positions as float32)"""
    import hashlib
    h = hashlib.sha256(b'hp-hash/1\0')
    p32 = [f32(c) for c in pos]
    mm = [HS.round_half_away(c * 1000.0) for c in p32]
    h.update(b'P' + struct.pack('<I', len(pos) // 3) + struct.pack(f'<{len(mm)}i', *mm) + b'N')
    n = len(pos) // 3
    h.update(struct.pack('<I', n) + struct.pack(f'<{n}I', *range(n)))
    return h.hexdigest()[:32]


EXPORT = """async (o) => { const a = window.__hp.app; const d = a.hpsceneDefaults(); Object.assign(d, o || {});
  const r = await a.hpsceneMake(d); const buf = new Uint8Array(await r.blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { name: r.name, b64: btoa(s), stats: r.stats, ids: r.ids, doc: r.doc }; }"""


def export(pg, opts=None):
    import base64
    r = pg.evaluate(EXPORT, opts or {})
    data = base64.b64decode(r['b64'])
    return r, data


def surfaces_of(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    g = Glb.parse(z.read('house.glb'))
    return {n['extras']['hp']['id']: n['extras']['hp'] for n in g.json['nodes'] if 'extras' in n}


with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    port_test(pg)

    # 2. the made-up house, everything in it
    pg.evaluate("() => window.__hp.app.setScope('house')"); pg.wait_for_timeout(1500)
    every = ['house', 'furniture', 'installs', 'ceilItems', 'garden', 'street', 'houses', 'park']
    all_seasons = {'summer': {'on': True, 'date': '2026-06-21'}, 'winter': {'on': True, 'date': '2026-01-15'}}
    r1, d1 = export(pg, {'groups': every, 'seasons': all_seasons, 'moments': ['morning', 'afternoon', 'evening', 'night'], 'preset': 'DRAFT'})
    out = os.path.join(SHOTS, 'made-up-house.hpscene')
    open(out, 'wb').write(d1)
    st = r1['stats']
    print('  made-up house:', r1['name'], json.dumps(st))
    check('the file is named .hpscene', r1['name'].endswith('.hpscene'), r1['name'])
    check_package(out, 'made-up house, everything')
    S1 = surfaces_of(d1)
    kinds = {}
    for hp in S1.values():
        kinds[hp['kind']] = kinds.get(hp['kind'], 0) + 1
    print('  kinds:', kinds)
    check('walls come as side a, side b and edge', any(i.endswith(':a') for i in S1) and any(i.endswith(':b') for i in S1) and any(i.endswith(':edge') and i.startswith('wall:') for i in S1), sorted(S1)[:8])
    check('rooms have their floors and ceilings', kinds.get('floor', 0) >= 5 and kinds.get('ceiling', 0) >= 5, kinds)
    check('furniture, doors and windows, glass, the plot and plants are in it', all(kinds.get(k) for k in ('furniture', 'opening', 'glass', 'ground', 'plant')), kinds)
    check('light maps, light per vertex and parts without a result', st['map'] > 20 and st['vertex'] > 20 and st['no'] >= 1, st)
    check('a moment fits in the light-map pages a phone can hold (≤ 4)', st['pages'] <= 4, st)
    z = zipfile.ZipFile(io.BytesIO(d1))
    doc = json.loads(z.read('scene.json'))
    rc = doc['recipe']
    check('four moments in two seasons; winter has snow and bare trees', len(rc['moments']) == 8 and [s['id'] for s in rc['seasons']] == ['summer', 'winter'] and rc['seasons'][1]['snow_cover'] > 0 and rc['seasons'][1]['foliage'] == 'bare', [m['id'] for m in rc['moments']])
    noon = next(m for m in rc['moments'] if m['id'] == 'summer-afternoon')
    check('a summer afternoon: the sun high in the south-west', 180 < noon['sun']['azimuth'] < 260 and noon['sun']['elevation'] > 40, noon['sun'])
    night = next(m for m in rc['moments'] if m['id'] == 'winter-night')
    check('a winter night: the sun below the horizon, the lamps on', night['sun']['elevation'] < 0 and night['lamps'] == 'all', night)
    check('each storey but the top one also open from above', rc['open_storeys'] == [s['id'] for s in doc['storeys']][:-1], rc['open_storeys'])
    check('JSON deflated, house.glb stored (FORMAT.md section 2)', z.getinfo('scene.json').compress_type == zipfile.ZIP_DEFLATED and z.getinfo('house.glb').compress_type == zipfile.ZIP_STORED)
    # the same version again: the same ids and hashes
    r2, d2 = export(pg, {'groups': every, 'seasons': all_seasons, 'moments': ['morning', 'afternoon', 'evening', 'night'], 'preset': 'DRAFT'})
    check('a second export of the same version: the same ids and hashes', r1['ids'] == r2['ids'] and len(r1['ids']) > 50, len(r1['ids']))
    check('… and the same scene hash, but its own export id', r1['doc']['scene_hash'] == r2['doc']['scene_hash'] and r1['doc']['id'] != r2['doc']['id'])
    # only the house and its furniture: no garden, no street, nothing of the neighbours
    r3, d3 = export(pg, {'groups': ['house', 'furniture'], 'preset': 'NORMAL', 'light': 'ALL'})
    out3 = os.path.join(SHOTS, 'made-up-house-only.hpscene')
    open(out3, 'wb').write(d3)
    check_package(out3, 'made-up house, house and furniture only, Normal, All')
    S3 = surfaces_of(d3)
    check('what the Show buttons leave out is not in it', S3 and all(hp['group'] in ('house', 'furniture') for hp in S3.values()), sorted({hp['group'] for hp in S3.values()}))
    check('… and the house\'s own surfaces keep their ids and hashes', all(S1.get(k, {}).get('hash') == v['hash'] for k, v in S3.items() if v['group'] == 'house' and v['bake'] != 'MAP'))
    check('no JavaScript errors', not pg.errors, pg.errors[:3])
    b.close()

    # 3. the dialog, PC light: Export menu → For Fresing Render…
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#btn-share'); pg.wait_for_timeout(600)
    check('the Export dialog offers For Fresing Render', pg.is_visible('#btn-export-hpscene'))
    pg.click('#btn-export-hpscene'); pg.wait_for_timeout(600)
    check('the dialog opens with Soft light, Draft and three moments', pg.is_visible('#hps-light') and pg.get_attribute('#hps-light [data-k="SOFT"]', 'aria-pressed') == 'true'
          and pg.get_attribute('#hps-quality [data-k="DRAFT"]', 'aria-pressed') == 'true' and pg.is_checked('#hps-m-afternoon') and not pg.is_checked('#hps-m-night'))
    pg.click('#hps-quality [data-k="NORMAL"]'); pg.click('#hps-m-night')
    pg.screenshot(path=SHOTS + 'hpscene-dialog-pc.png')
    with pg.expect_download(timeout=180000) as dl:
        pg.click('.dialog .btn.primary:has-text("Save file")')
    f = dl.value
    path = os.path.join(SHOTS, 'dialog-export.hpscene')
    f.save_as(path)
    check('Save file: the .hpscene is saved', f.suggested_filename.endswith('.hpscene'), f.suggested_filename)
    rep = check_package(path, 'the dialog\'s file')
    dz = json.loads(zipfile.ZipFile(path).read('scene.json'))
    check('the dialog\'s choices are in it: Normal, night moments', dz['recipe']['quality']['preset'] == 'NORMAL' and any(m['id'].endswith('-night') for m in dz['recipe']['moments']))
    check('no JavaScript errors (PC)', not pg.errors, pg.errors[:3])
    b.close()

    # the dialog on a phone, dark
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { window.__hp.app.hpsceneDialog(); }"); pg.wait_for_timeout(800)
    pg.click('#hps-more summary'); pg.wait_for_timeout(300)
    wide = pg.evaluate("() => { const d = document.querySelector('.dialog'); const r = d.getBoundingClientRect(); return [r.left, r.right, document.documentElement.scrollWidth, [...d.querySelectorAll('button, input, select, label')].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.right > innerWidth + 1 || q.left < -1); }).length]; }")
    check('phone: the dialog fits the 390 px screen', wide[0] >= 0 and wide[1] <= 391 and wide[2] <= 391 and wide[3] == 0, wide)
    check('phone: More shows what to include, open storeys, photos and the page size', all(pg.is_visible(s) for s in ('#hps-groups', '#hps-open', '#hps-cams', '#hps-page')))
    check('phone: the page size starts at 1024', pg.get_attribute('#hps-page [data-k="1024"]', 'aria-pressed') == 'true')
    pg.screenshot(path=SHOTS + 'hpscene-dialog-phone.png')
    check('no JavaScript errors (phone)', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
