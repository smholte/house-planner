"""A bake (.hpbake) for a house scene the app exported (task 0032's tests): made-up light, written with the house scene
format's own package (tests/house-scene-format, pinned v1.0.1) – no Fresing Render needed. Each surface gets a light
factor F (L = F × the moment's reference) from F(id, moment); light maps are packed on pages, light per vertex in one
file a moment; winter gets a snow layer on the plot; the first open storey gets results of its own (F × 1.5)."""
import io, json, math, os, struct, sys, zipfile

HSF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'house-scene-format')
sys.path.insert(0, HSF)
from hsf.glb import Glb, GlbWriter  # noqa: E402
from hsf.images import png_rgb  # noqa: E402
from hsf import surface as HS  # noqa: E402

REF = {'day': [0.6, 0.62, 0.66], 'night': [0.004, 0.0036, 0.003]}


def encode(L, scale):
    return bytes(min(255, max(0, HS.round_half_away(255 * math.sqrt(max(0.0, c) / scale)))) for c in L)


def _world(m, p):
    x, y, z = p
    return (m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14])


def surfaces_of(scene_bytes):
    z = zipfile.ZipFile(io.BytesIO(scene_bytes))
    doc = json.loads(z.read('scene.json'))
    g = Glb.parse(z.read('house.glb'))
    W = g.world_matrices()
    out = []
    for ni, n in enumerate(g.json['nodes']):
        hp = (n.get('extras') or {}).get('hp')
        if not hp or 'mesh' not in n or hp['bake'] == 'NO':
            continue
        prims = g.json['meshes'][n['mesh']]['primitives']
        pts = [_world(W[ni], p) for pr in prims for p in g.accessor(pr['attributes']['POSITION'])]
        box = [round(min(w[k] for w in pts), 4) for k in range(3)] + [round(max(w[k] for w in pts), 4) for k in range(3)]
        m = W[ni]
        moved = any(abs(m[k] - (1.0 if k in (0, 5, 10, 15) else 0.0)) > 1e-9 for k in range(16))
        out.append({'id': hp['id'], 'hp': hp, 'box': box, 'nv': len(pts), 'matrix': list(m) if moved else None})
    return doc, out


def snow_glb(plot_box, y):
    """one snow layer on the plot: a 1 m square in its middle, 5 cm above it"""
    x0 = (plot_box[0] + plot_box[3]) / 2 - 0.5
    z0 = (plot_box[2] + plot_box[5]) / 2 - 0.5
    pos = [(x0, y, z0), (x0, y, z0 + 1), (x0 + 1, y, z0 + 1), (x0 + 1, y, z0)]
    for attempt in range(2):
        w = GlbWriter('test snow')
        acc_p = w.accessor(pos, 'VEC3', minmax=True)
        acc_n = w.accessor([(0.0, 1.0, 0.0)] * 4, 'VEC3')
        acc_i = w.accessor([0, 1, 2, 0, 2, 3], 'SCALAR', 5125, target=34963)
        w.doc['meshes'] = [{'name': 'snow:ground:plot', 'primitives': [{'attributes': {'POSITION': acc_p, 'NORMAL': acc_n}, 'indices': acc_i}]}]
        hp = {'id': 'snow:ground:plot', 'kind': 'snow', 'storey': None, 'group': 'garden', 'bake': 'VERTEX', 'on': 'ground:plot', 'hash': '0' * 32}
        if attempt:
            hp['hash'] = h
        w.doc['nodes'] = [{'name': 'snow:ground:plot', 'mesh': 0, 'extras': {'hp': hp}}]
        w.doc['scenes'] = [{'nodes': [0]}]
        w.doc['scene'] = 0
        data = w.to_bytes()
        h = HS.surface_hash(Glb.parse(data), 0)
    return data, 4


def make_bake(scene_bytes, F=None, moments=None, snow=True, open_storeys=True, page=1024, problems=(), light=None, version='1.0'):
    """the .hpbake bytes; F(id, moment id) → light factor (default 0.8 for light maps, 0.7 per vertex)"""
    doc, surfs = surfaces_of(scene_bytes)
    F = F or (lambda sid, mid: None)
    recipe = doc['recipe']
    moms = [m for m in recipe['moments'] if moments is None or m['id'] in moments]
    open_st = recipe.get('open_storeys', [])[:1] if open_storeys else []
    files, pages, vfiles, out_moments = {}, [], [], []
    plot = next((s for s in surfs if s['id'] == 'ground:plot'), None)
    snow_data = snow_nv = None
    if snow and plot:
        snow_data, snow_nv = snow_glb(plot['box'], plot['box'][4] + 0.05)
        files['snow/winter.glb'] = snow_data
    for mi, m in enumerate(moms):
        night = m['sun']['elevation'] < 0
        ref = REF['night' if night else 'day']
        winter = m['season'] == 'winter'

        def lval(sid, kind, extra=1.0):
            f = F(sid, m['id'])
            if f is None:
                f = 0.8 if kind == 'MAP' else 0.7
            return [f * extra * c for c in ref]
        maps_items = []   # (variant, surface, L)
        for s in surfs:
            if s['hp']['bake'] == 'MAP':
                maps_items.append(('', s, lval(s['id'], 'MAP')))
                if s['hp']['storey'] in open_st:
                    maps_items.append((s['hp']['storey'], s, lval(s['id'], 'MAP', 1.5)))
        vert_items = [('', s, lval(s['id'], 'VERTEX')) for s in surfs if s['hp']['bake'] == 'VERTEX']
        vert_items += [(s['hp']['storey'], s, lval(s['id'], 'VERTEX', 1.5)) for s in surfs if s['hp']['bake'] == 'VERTEX' and s['hp']['storey'] in open_st]
        snow_L = lval('snow:ground:plot', 'VERTEX') if (snow_data and winter) else None
        allv = [c for _, _, L in maps_items + vert_items for c in L] + (snow_L or [])
        scale = max(allv) * 1.02
        entries = {'': {}}
        for st in open_st:
            entries[st] = {}
        # shelf-pack the light maps on pages of `page` px (2 texels between rectangles)
        order = sorted(maps_items, key=lambda t: (-t[1]['hp']['uv1_px'][1], t[1]['id'], t[0]))
        pi, x, y, row = 0, 0, 0, 0
        imgs = [[bytearray(page * 3) for _ in range(page)]]
        for variant, s, L in order:
            Wd, Hd = s['hp']['uv1_px']
            if x + Wd > page:
                x, y, row = 0, y + row + 2, 0
            if y + Hd > page:
                pi += 1
                imgs.append([bytearray(page * 3) for _ in range(page)])
                x, y, row = 0, 0, 0
            px = encode(L, scale)
            for yy in range(Hd):
                imgs[pi][y + yy][x * 3:(x + Wd) * 3] = px * Wd
            entries[variant][s['id']] = {'page': f'm{mi}p{pi}', 'rect': [x, y, Wd, Hd]}
            x += Wd + 2
            row = max(row, Hd)
        for k, img in enumerate(imgs):
            name = f'light/m{mi}p{k}.png'
            files[name] = png_rgb(page, page, [bytes(r) for r in img])
            pages.append({'id': f'm{mi}p{k}', 'file': name, 'size': [page, page]})
        blob = bytearray()
        for variant, s, L in vert_items:
            entries[variant][s['id']] = {'vertex': f'm{mi}v', 'offset': len(blob) // 3, 'count': s['nv']}
            blob += encode(L, scale) * s['nv']
        if snow_L:
            entries['']['snow:ground:plot'] = {'vertex': f'm{mi}v', 'offset': len(blob) // 3, 'count': snow_nv}
            blob += encode(snow_L, scale) * snow_nv
        files[f'light/m{mi}v.bin'] = bytes(blob)
        vfiles.append({'id': f'm{mi}v', 'file': f'light/m{mi}v.bin'})
        mo = {'id': m['id'], 'encoding': {'curve': 2.0, 'scale': round(scale, 9), 'reference': ref, 'exposure': 2.0 if night else 0.0},
              'sun_light': None if night or (light or recipe['light']) != 'SOFT' else [2.0 * c for c in ref], 'maps': dict(sorted(entries[''].items()))}
        if open_st:
            mo['open'] = {st: dict(sorted(entries[st].items())) for st in open_st}
        out_moments.append(mo)
    bake = {
        'format': 'house-bake', 'version': version, 'generator': {'app': 'Test baker', 'version': '0.0.1'}, 'id': 'test-bake',
        'created': '2026-11-16T10:00:00Z', 'scene': {'id': doc['id'], 'scene_hash': doc['scene_hash']},
        'light': light or recipe['light'], 'uv1': 'hp-uv/1', 'quality': {'texels_per_m': recipe['quality']['texels_per_m'], 'samples': 1, 'denoised': False},
        'surfaces': {s['id']: {'hash': s['hp']['hash'], 'box': s['box'], **({'matrix': s['matrix']} if s['matrix'] else {})} for s in sorted(surfs, key=lambda s: s['id'])},
        'pages': pages, 'vertex_files': vfiles, 'moments': out_moments,
        'snow': [{'season': 'winter', 'file': 'snow/winter.glb'}] if snow_data else [], 'photos': [], 'videos': [], 'problems': list(problems),
    }
    files['bake.json'] = json.dumps(bake, separators=(',', ':')).encode('utf-8')
    return zip_bytes(files)


def zip_bytes(files, deflate_json=True):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for name, data in files.items():
            z.writestr(zipfile.ZipInfo(name, (2026, 11, 16, 0, 0, 0)), data, zipfile.ZIP_DEFLATED if (deflate_json and name.endswith(('.json', '.bin'))) else zipfile.ZIP_STORED)
    return buf.getvalue()


def files_of(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    return {i.filename: z.read(i.filename) for i in z.infolist()}
