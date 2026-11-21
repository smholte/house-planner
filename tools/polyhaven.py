#!/usr/bin/env python3
"""Free realistic models from Poly Haven (CC0) for Add furniture → Library (task 0051).

    python3 tools/polyhaven.py list                  GitHub only: prints every Poly Haven model with its categories and tags
    python3 tools/polyhaven.py fetch  <work dir>    GitHub only (the chat machines cannot reach polyhaven.com): the list of
                                                     all models + the chosen ones' glTF files at 1K into <work dir>
    python3 tools/polyhaven.py import <work dir>    <work dir>'s models packed (node tools/glb-pack.mjs: meshopt, WebP ≤ 1024 px,
                                                     the top-view outline) into build/library as kind 'model' items 'l:ph-<id>'
                                                     (CC0, source Poly Haven); build/polyhaven.json = what was chosen and why
    python3 tools/polyhaven.py --check               the list and the library agree (the precheck's check)

Made once by .github/workflows/polyhaven.yml (by hand) and committed: the app never calls Poly Haven. Poly Haven's assets
are CC0; their API terms (github.com/Poly-Haven/Public-API) ask for a "Powered by Poly Haven" line when an app builds on
the live API – we fetch once at build time, but the credits say it anyway (src/panels.js about text, THIRD-PARTY list in
README-app.txt)."""
import json, os, re, subprocess, sys, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = os.path.join(ROOT, 'build', 'polyhaven.json')
API = 'https://api.polyhaven.com'
UA = {'User-Agent': 'house-planner-library-build (offline house planning app; one-off fetch)'}
MAX_TRIS, MAX_MODELS, MAX_SOURCE_KB = 100_000, 160, 12_000

# a model is taken when one of its categories / tags is in INCLUDE and none is in EXCLUDE (words, lower case)
INCLUDE = {'furniture', 'lighting', 'decorative', 'plants', 'plant', 'houseplant', 'potted', 'seating', 'tables', 'storage', 'lamp', 'sofa',
           'chair', 'bed', 'shelf', 'rug', 'vase', 'mirror', 'curtain', 'cabinet', 'household', 'appliance', 'kitchen', 'bathroom'}
EXCLUDE = {'weapon', 'weapons', 'vehicle', 'vehicles', 'car', 'military', 'gun', 'sci-fi', 'scifi', 'ruins', 'damaged', 'broken', 'industrial',
           'food', 'creature', 'character', 'skull', 'bone', 'rock', 'rocks', 'tree', 'trees', 'building', 'buildings', 'props-outdoor'}
# Add furniture → Library groups (src/models.js LIB_ROOMS): first word hit wins
ROOMS = [
    ('bathroom', {'bath', 'bathtub', 'toilet', 'sink', 'shower', 'towel', 'washbasin'}),
    ('kitchen', {'kitchen', 'fridge', 'stove', 'oven', 'kettle', 'toaster', 'pan', 'pot', 'cutlery', 'bar stool', 'barstool'}),
    ('bedroom', {'bed', 'nightstand', 'wardrobe', 'dresser', 'bedside', 'crib'}),
    ('office', {'office', 'desk', 'computer', 'monitor', 'laptop', 'typewriter'}),
    ('dining', {'dining', 'chair', 'stool', 'tableware', 'plate', 'bowl', 'glass', 'wine'}),
    ('outside', {'garden', 'outdoor', 'bench', 'parasol', 'bbq', 'planter', 'trashcan', 'fence'}),
]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def words(a):
    out = set()
    for key in ('categories', 'tags'):
        out |= {str(x).lower() for x in a.get(key, [])}
    out |= {w for w in re.split(r'[\s_\-]+', (a.get('name', '') or '').lower()) if w}
    return out


def room_of(aid, a):
    w = words(a) | set(aid.lower().split('_'))
    for room, keys in ROOMS:
        if w & keys:
            return room
    return 'living-room'


def choose(assets):
    """(chosen: [(id, asset)], left out: { id: reason })"""
    ok, out = [], {}
    for aid, a in assets.items():
        w = words(a)
        if not (w & INCLUDE):
            out[aid] = 'not a house model (' + ', '.join(sorted(a.get('categories', []))) + ')'
        elif w & EXCLUDE:
            out[aid] = 'left out: ' + ', '.join(sorted(w & EXCLUDE))
        else:
            ok.append((aid, a))
    ok.sort(key=lambda x: -x[1].get('download_count', 0))
    for aid, a in ok[MAX_MODELS:]:
        out[aid] = f'over the {MAX_MODELS} models limit (least downloaded)'
    return ok[:MAX_MODELS], out


def fetch(work):
    os.makedirs(work, exist_ok=True)
    assets = json.loads(get(API + '/assets?t=models'))
    json.dump(assets, open(os.path.join(work, 'assets.json'), 'w'), indent=1)
    chosen, out = choose(assets)
    print(f'{len(assets)} models at Poly Haven, {len(chosen)} chosen')
    got = {}
    for aid, a in chosen:
        try:
            files = json.loads(get(f'{API}/files/{aid}'))['gltf']['1k']['gltf']
        except Exception as e:
            out[aid] = f'no glTF at 1K ({e})'
            continue
        kb = (files.get('size', 0) + sum(v.get('size', 0) for v in files.get('include', {}).values())) / 1000
        if kb > MAX_SOURCE_KB:
            out[aid] = f'source {kb / 1000:.1f} MB at 1K – too big'
            continue
        d = os.path.join(work, 'src', aid)
        os.makedirs(d, exist_ok=True)
        todo = {aid + '.gltf': files['url'], **{k: v['url'] for k, v in files.get('include', {}).items()}}
        for rel, url in todo.items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'wb').write(get(url))
        got[aid] = {'name': a.get('name', aid), 'categories': a.get('categories', []), 'tags': a.get('tags', []),
                    'authors': sorted((a.get('authors') or {}).keys()), 'room': room_of(aid, a), 'source_kb': round(kb)}
        print(f'  {aid}: {kb:.0f} kB')
    json.dump({'got': got, 'out': out}, open(os.path.join(work, 'chosen.json'), 'w'), indent=1)


def do_import(work):
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('build_library', os.path.join(ROOT, 'tools', 'build-library.py'))
    BL = importlib.util.module_from_spec(spec); spec.loader.exec_module(BL)
    ch = json.load(open(os.path.join(work, 'chosen.json')))
    jobs, tmp = [], os.path.join(work, 'packed')
    os.makedirs(tmp, exist_ok=True)
    for aid in ch['got']:
        jobs.append({'in': os.path.join(work, 'src', aid, aid + '.gltf'), 'out': os.path.join(tmp, aid + '.glb')})
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'glb-pack.mjs')], input=json.dumps(jobs), capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 0, r.stderr[-1500:]
    packed = {}
    for line in r.stdout.splitlines():
        if line.startswith('{'):
            d = json.loads(line)
            packed[os.path.basename(d['out'])[:-4]] = d
    man = BL.load()
    man['items'] = [it for it in man['items'] if not it['id'].startswith('l:ph-')]
    listing = {}
    for aid, g in ch['got'].items():
        d = packed.get(aid)
        if not d:
            ch['out'][aid] = 'not packed'
            continue
        if d['tris'] > MAX_TRIS:
            ch['out'][aid] = f"{d['tris']} triangles – over {MAX_TRIS}"
            continue
        if max(d['size']) > 4 or min(d['size']) < 0.01:
            ch['out'][aid] = f"odd size {d['size']} m"
            continue
        f = BL.put(BL.LIB, 'models', 'ph-' + aid, 'glb', open(d['out'], 'rb').read())
        man['items'].append({'id': 'l:ph-' + aid, 'kind': 'model', 'licence': 'CC0', 'source': 'Poly Haven (polyhaven.com/a/' + aid + ')',
                             'name': g['name'], 'cat': g['room'], 'size': d['size'], 'o': d['o'], 'u': d['u'], 'files': [f]})
        listing[aid] = {**g, 'tris': round(d['tris']), 'size': d['size'], 'bytes': f['b']}
    man['items'].sort(key=lambda it: (it['kind'] != 'tex', it['kind'] != 'sky', it['id']))
    BL.save(man)
    BL.prune()
    json.dump({'source': 'Poly Haven (polyhaven.com), CC0', 'limits': {'triangles': MAX_TRIS, 'models': MAX_MODELS, 'source_kb': MAX_SOURCE_KB},
               'models': listing, 'left_out': dict(sorted(ch['out'].items()))}, open(LIST, 'w'), indent=1, ensure_ascii=False)
    print(f"{len(listing)} models in the library ({sum(v['bytes'] for v in listing.values()) / 1e6:.1f} MB), {len(ch['out'])} left out → build/polyhaven.json")


def check():
    """the list names exactly the library's Poly Haven models, each CC0"""
    if not os.path.exists(LIST):
        return []
    L = json.load(open(LIST))
    lib = json.load(open(os.path.join(ROOT, 'build', 'library', 'library.json')))
    have = {it['id'][5:]: it for it in lib['items'] if it['id'].startswith('l:ph-')}
    bad = [f'build/polyhaven.json: {k} is not in the library' for k in L['models'] if k not in have]
    bad += [f'library: l:ph-{k} is not in build/polyhaven.json' for k in have if k not in L['models']]
    bad += [f'library: l:ph-{k}: licence {v.get("licence")!r} – Poly Haven models are CC0' for k, v in have.items() if v.get('licence') != 'CC0']
    return bad


def list_all():
    assets = json.loads(get(API + '/assets?t=models'))
    for aid, a in sorted(assets.items()):
        print(f"{aid} | {a.get('name')} | {','.join(a.get('categories', []))} | {','.join(a.get('tags', []))} | dl {a.get('download_count')} | "
              f"{a.get('dimensions')} | {a.get('polycount')}")
    print(len(assets), 'models')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['list']:
        list_all()
    elif a[:1] == ['fetch'] and len(a) == 2:
        fetch(a[1])
    elif a[:1] == ['import'] and len(a) == 2:
        do_import(a[1])
    elif a[:1] == ['--check']:
        p = check()
        print('\n'.join(p) or 'Poly Haven list and library agree')
        sys.exit(1 if p else 0)
    else:
        print(__doc__)
