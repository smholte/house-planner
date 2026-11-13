#!/usr/bin/env python3
"""The public asset library (task 0009): build/library/ – library.json and the files it lists.

    python3 tools/build-library.py --import build/textures.json     the picture sets and skies of a textures.json
                                                                     (tools/build-textures.py makes one) into the library
    python3 tools/build-library.py --gpu                              the KTX2 copies of the pictures (needs node and
                                                                     npm ci --prefix tools); only those not made yet
    python3 tools/build-library.py --check [DIR]                      the library is whole: every file listed, every
                                                                     hash right, no stray file, every licence public

The library (src/library.js reads it):
  library.json   { v, kind: 'house-planner-library', name, source, items: [ … ] }
  item           { id, kind, licence, source, base, meta, maps / gpu / files }
    kind 'tex'   a picture set (texlib.js): meta = its size in metres, average colour, the pieces to cut …;
                 maps = { color | normal | rough | metal | kit | detail: [ { px, f, b } ] } (px: width in pixels, f: the
                 file, b: its bytes); gpu = the same as KTX2 (only colour, relief, gloss, metal: the pictures used as they
                 are – the others are drawn on a canvas by the app)
    kind 'sky'   a sky (Radiance .hdr, flat RGBE, gzip): files = [ { px, f, b } ] at 1024 × 512 and 512 × 256
    (build.py adds when it builds: kind 'pack' – the Kenney models' geometry –, 'code' – the KTX2 reader – and, for the
     owner's app only, kind 'model' – his models, never in the public library)
  base: true     the built-in look: the single file has it inside (its smallest size; the skies at 512)
Files are named <id>.<map>.<px>.<hash>.<ext>: a new picture is a new name, so a device never keeps an old one.
"""
import base64, gzip, hashlib, io, json, os, re, subprocess, sys
# (Pillow and numpy only where pictures are made: the checks run where they are not installed – the precheck job)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, 'build', 'library')
PUBLIC_LICENCES = ('CC0', 'CC BY')
GPU_KINDS = ('color', 'normal', 'rough', 'metal')


def sha(b):
    return hashlib.sha256(b).hexdigest()[:12]


def load(lib=LIB):
    p = os.path.join(lib, 'library.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))
    return {'v': 1, 'kind': 'house-planner-library', 'name': 'public', 'source': '', 'items': []}


def save(man, lib=LIB):
    os.makedirs(lib, exist_ok=True)
    with open(os.path.join(lib, 'library.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
        f.write('\n')


def put(lib, sub, stem, ext, data):
    """a file into the library, named by its content; returns { f, b }"""
    name = f'{sub}/{stem}.{sha(data)}.{ext}'
    full = os.path.join(lib, name)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if not os.path.exists(full):
        open(full, 'wb').write(data)
    return {'f': name, 'b': len(data)}


def data_url(s):
    m = re.match(r'data:image/(\w+);base64,(.*)$', s, re.S)
    return ({'jpeg': 'jpg'}.get(m.group(1), m.group(1)), base64.b64decode(m.group(2)))


def rgbe_half(raw):
    """a flat RGBE .hdr at half its size (averaged in linear light)"""
    import numpy as np
    end = raw.index(b'\n\n') + 2
    le = raw.index(b'\n', end)
    res = raw[end:le].decode().split()
    H, W = int(res[1]), int(res[3])
    img = np.frombuffer(raw[le + 1:le + 1 + W * H * 4], dtype=np.uint8).reshape(H, W, 4)
    e = img[:, :, 3].astype(np.float64)
    f = np.where(e[..., None] > 0, img[:, :, :3].astype(np.float64) * np.ldexp(1.0, (e - 136).astype(np.int32))[..., None], 0)
    f = f.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
    h2, w2 = f.shape[:2]
    m = f.max(axis=2)
    ex = np.where(m > 1e-32, np.floor(np.log2(np.maximum(m, 1e-32))) + 1, 0)
    sc = np.where(m > 1e-32, 256.0 / np.power(2.0, ex), 0)
    rgbe = np.zeros((h2, w2, 4), dtype=np.uint8)
    rgbe[:, :, :3] = np.clip(f * sc[..., None], 0, 255).astype(np.uint8)
    rgbe[:, :, 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    return b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h2} +X {w2}\n'.encode() + rgbe.tobytes()


def import_textures(tex, lib=LIB):
    """the sets and skies of a textures.json (dict) into the library: replaces the items of the same ids"""
    from PIL import Image
    man = load(lib)
    man['source'] = tex.get('source', man.get('source', ''))
    items = {it['id']: it for it in man['items']}
    for sid, s in tex['sets'].items():
        meta, maps = {}, {}
        for k, v in s.items():
            if isinstance(v, str) and v.startswith('data:'):
                ext, b = data_url(v)
                px = Image.open(io.BytesIO(b)).size[0]
                maps[k] = [dict(px=px, **put(lib, 'tex', f'{sid}.{k}.{px}', ext, b))]
            else:
                meta[k] = v
        old = items.get(sid, {})
        items[sid] = {'id': sid, 'kind': 'tex', 'licence': 'CC0',
                      'source': 'ambientCG (ambientcg.com)' + (', laid as waalformaat by tools/brickkit.py' if sid == 'HouseBrick' else ''),
                      'base': True, 'meta': meta, 'maps': maps, 'gpu': {k: v for k, v in old.get('gpu', {}).items() if k in maps}}
    for which, sk in (tex.get('skies') or {}).items():
        raw = gzip.decompress(base64.b64decode(sk['hdr']))
        half = rgbe_half(raw)
        w = sk['size'][0]
        items['sky:' + which] = {'id': 'sky:' + which, 'kind': 'sky', 'licence': 'CC0', 'source': 'Poly Haven (polyhaven.com)', 'base': True,
                                 'files': [dict(px=w, **put(lib, 'sky', f'{which}.{w}', 'hdr.gz', gzip.compress(raw, 9, mtime=0))),
                                           dict(px=w // 2, **put(lib, 'sky', f'{which}.{w // 2}', 'hdr.gz', gzip.compress(half, 9, mtime=0)))]}
    man['items'] = sorted(items.values(), key=lambda it: (it['kind'] != 'tex', it['id']))
    save(man, lib)
    prune(lib)
    return man


def make_gpu(lib=LIB):
    """KTX2 copies of the pictures used as they are (node tools/lib-ktx2.mjs), each made from the largest picture of
    its map; one already made from the same picture is kept"""
    man = load(lib)
    jobs, todo = [], []
    tmp = os.path.join(ROOT, 'dist', 'ktx2-tmp')
    os.makedirs(tmp, exist_ok=True)
    for it in man['items']:
        if it['kind'] != 'tex':
            continue
        it.setdefault('gpu', {})
        for k in GPU_KINDS:
            if k not in it['maps']:
                continue
            src = max(it['maps'][k], key=lambda v: v['px'])
            have = it['gpu'].get(k)
            if have and have[0].get('from') == src['f'] and os.path.exists(os.path.join(lib, have[0]['f'])):
                continue
            out = os.path.join(tmp, f"{it['id']}.{k}.ktx2")
            jobs.append({'in': os.path.join(lib, src['f']), 'out': out, 'kind': k})
            todo.append((it, k, src, out))
    if jobs:
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'lib-ktx2.mjs')], input=json.dumps(jobs), text=True, cwd=ROOT)
        assert r.returncode == 0, 'lib-ktx2.mjs failed (npm ci --prefix tools?)'
        for it, k, src, out in todo:
            b = open(out, 'rb').read()
            it['gpu'][k] = [dict(px=src['px'], **put(lib, 'gpu', f"{it['id']}.{k}.{src['px']}", 'ktx2', b), **{'from': src['f']})]
    save(man, lib)
    prune(lib)
    print(f'KTX2: {len(jobs)} made, {sum(len(it.get("gpu", {})) for it in man["items"])} in the library')


def files_of(man):
    out = []
    for it in man['items']:
        for group in ('maps', 'gpu'):
            for v in (it.get(group) or {}).values():
                out += v
        out += it.get('files') or []
        if it.get('f'):
            out.append(it)
    return out


def prune(lib=LIB):
    """files no item lists any more go"""
    keep = {f['f'] for f in files_of(load(lib))} | {'library.json'}
    for dp, _, fs in os.walk(lib):
        for n in fs:
            rel = os.path.relpath(os.path.join(dp, n), lib).replace(os.sep, '/')
            if rel not in keep:
                os.remove(os.path.join(dp, n))


def check(lib=LIB, public=True):
    """what is wrong with a library folder (empty: nothing)"""
    bad = []
    if not os.path.exists(os.path.join(lib, 'library.json')):
        return [f'{lib}: no library.json']
    man = load(lib)
    if man.get('kind') != 'house-planner-library':
        bad.append('library.json: not a House Planner library')
    listed = set()
    for it in man['items']:
        if public and not str(it.get('licence', '')).startswith(PUBLIC_LICENCES):
            bad.append(f"{it['id']}: licence {it.get('licence')!r} is not CC0 / CC BY – it can't be in the public library")
    for f in files_of(man):
        listed.add(f['f'])
        full = os.path.join(lib, f['f'])
        if not os.path.exists(full):
            bad.append(f"{f['f']}: listed but missing")
            continue
        b = open(full, 'rb').read()
        if len(b) != f['b'] or (re.search(r'\.([0-9a-f]{12})\.', f['f']) or [None, None])[1] not in (sha(b), None):
            bad.append(f"{f['f']}: its bytes or hash don't match")
    for dp, _, fs in os.walk(lib):
        for n in fs:
            rel = os.path.relpath(os.path.join(dp, n), lib).replace(os.sep, '/')
            if rel != 'library.json' and rel not in listed:
                bad.append(f'{rel}: not listed in library.json')
    return bad


def words_in(lib, words):
    """the house words found in a library folder: [(word, file)] – its list and every file's bytes (UTF-8 and UTF-16)"""
    found = []
    for dp, _, fs in os.walk(lib):
        for n in fs:
            blob = open(os.path.join(dp, n), 'rb').read()
            for w in words:
                if w.encode('utf-8') in blob or w.encode('utf-16-le') in blob:
                    found.append((w, os.path.relpath(os.path.join(dp, n), lib)))
    return found


def stray_models(root=ROOT):
    """model files (.glb / .gltf) of a public repository outside the public library – none may be there (the owner's
    models live only in the private repository)"""
    out = []
    for dp, ds, fs in os.walk(root):
        ds[:] = [d for d in ds if d not in ('.git', 'node_modules', 'dist') and os.path.relpath(os.path.join(dp, d), root).replace(os.sep, '/') != 'build/library']
        out += [os.path.relpath(os.path.join(dp, n), root) for n in fs if n.lower().endswith(('.glb', '.gltf'))]
    # (the tests' own made-up fixtures may be: tests/fixtures)
    return [x for x in out if not x.replace(os.sep, '/').startswith('tests/fixtures/')]


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--import']:
        m = import_textures(json.load(open(a[1], encoding='utf-8')))
        print(f"{len(m['items'])} items in {os.path.relpath(LIB, ROOT)}")
    elif a[:1] == ['--gpu']:
        make_gpu()
    elif a[:1] == ['--check']:
        problems = check(a[1] if len(a) > 1 else LIB)
        print('\n'.join(problems) or 'library whole')
        sys.exit(1 if problems else 0)
    else:
        print(__doc__)
