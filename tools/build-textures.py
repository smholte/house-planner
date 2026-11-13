#!/usr/bin/env python3
"""Pack the real material textures (ambientCG, CC0) into build/textures.json for the app.

    python3 tools/build-textures.py <folder with one sub-folder per texture: ID/ID_1K-JPG_Color.jpg, _NormalGL, _Roughness …>
                                    [<sky-day.hdr> <sky-sunset.hdr>]

The bricks of the house: one waalformaat wall in wildverband made by tools/brickkit.py (relief, gloss, which part is joint and
which brick, the brick's own light and dark) – the app colours it (texlib.js). Each other set: the colour picture (512 px, JPEG; 1024 for the garden tiles), its relief (normal map, 512 px) and gloss (roughness, 256 px), for metals
also the metalness; its size in metres (how much of a wall, floor or garden one picture covers); for floors laid in
planks or tiles where one plank or tile may be cut from it ("pieces": rows of planks between their joints, the cells of a
tile grid, or squares without a joint). The skies (Poly Haven, CC0) are made smaller (1024 × 512, Radiance .hdr without run-length coding, gzip + base64).
The source pictures come from ambientcg.com (CC0) – the ids below – and are not kept in the source zip (≈ 200 MB).
Since task 0009 the result goes into the asset library (build/library/, tools/build-library.py); then make its KTX2
copies: python3 tools/build-library.py --gpu """
import base64, io, json, os, sys
import numpy as np
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'textures.json')   # (a copy; the library is what the app uses)

# id: size (m) of one picture, and what can be cut out of it
SETS = {
    # floors
    'WoodFloor051': dict(size=1.8, strips=True),            # oak planks (wood, laminate, PVC – tinted to the chosen tone)
    'Tiles052': dict(size=1.6, grid=8),                      # floor tiles (one cell = the surface of one tile)
    'Marble021': dict(size=1.2),                             # natural stone floor and the stone worktop
    'Concrete016': dict(size=2.4),                           # cast floor (gietvloer)
    'Concrete014': dict(size=2.4),                           # screed
    'Carpet003': dict(size=1.0, grid=8),                     # carpet
    # walls, bathroom, kitchen
    'Concrete034': dict(size=[2.0, 1.0]),                    # plaster under the paint (relief only; a 2 : 1 picture)
    'Tiles107': dict(size=1.6, grid=8),                      # bathroom wall tiles
    'Wood078': dict(size=1.4),                               # wooden worktop
    'Wood048': dict(size=1.0), 'Wood050': dict(size=1.0),   # wooden kitchen fronts
    'Wood012': dict(size=[1.0, 0.5]),                        # the outside doors: grey quality fake wood (2 : 1 picture)
    'Metal028': dict(size=0.5, metal=True),                  # black metal: door handles, sink
    'Metal048A': dict(size=0.5, metal=True),                 # brass
    # outside (the bricks: HouseBrick below, made by brickkit.py from Bricks092's bricks)
    'RoofingTiles013A': dict(size=3.2),                      # the roof's tiles twice the picture's own size (1 Nov)
    # garden
    # the garden and driveway tiles: 50 × 50 cm cut from the squares without a joint – only the plain dark slate ones
    # (2 Nov: the light pink riven ones looked streaky pink close up), the colour at 1024 px (sharper close up)
    'Grass005': dict(size=2.0), 'Tiles050': dict(size=4.2, clean=0.6, plain=0.06, px=1024), 'Tiles049': dict(size=2.0),
    'Ground062L': dict(size=1.5), 'Planks026A': dict(size=1.6), 'Ground048': dict(size=1.5),
    'Asphalt033': dict(size=2.5), 'Bark012': dict(size=0.8),
    # furniture
    'Fabric028': dict(size=0.6),
}

def find(folder, suffix):
    for f in os.listdir(folder):
        if f.endswith(suffix):
            return os.path.join(folder, f)
    return None

def png(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

def jpeg(im, q):
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=q, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

def strips(normal_path):
    """rows of planks between their joints (narrow rows only), as [x0, y0, x1, y1] fractions"""
    n = np.asarray(Image.open(normal_path).convert('RGB'), dtype=float)
    H, W = n.shape[:2]
    gy = np.abs(np.diff(n[:, :, 1], axis=0)).mean(axis=1)
    thr = gy.mean() + 1.5 * gy.std()
    cand = [i for i in range(1, len(gy) - 1) if gy[i] > thr and gy[i] >= gy[i - 1] and gy[i] >= gy[i + 1]]
    seams = []
    for c in cand:
        if not seams or c - seams[-1] > 10: seams.append(c)
    seams = [0] + seams + [H]
    out = []
    for a, b in zip(seams[:-1], seams[1:]):
        y0, y1 = a + 3, b - 3
        if y1 - y0 < 20: continue
        band = n[y0:y1, :, 0]
        gx = np.abs(np.diff(band, axis=1)).mean(axis=0)
        t2 = gx.mean() + 4 * gx.std()
        js = []
        for i in range(1, len(gx) - 1):
            if gx[i] > t2 and gx[i] >= gx[i - 1] and gx[i] >= gx[i + 1] and (not js or i - js[-1] > 12): js.append(i)
        xs = [0] + js + [W]
        for x0, x1 in zip(xs[:-1], xs[1:]):
            if x1 - x0 >= 140 and (y1 - y0) <= 60:
                out.append([round((x0 + 4) / W, 4), round(y0 / H, 4), round((x1 - 4) / W, 4), round(y1 / H, 4)])
    return out

def clean_squares(disp_path, frac):
    """squares of side frac (of the picture) with no joint in them"""
    d = np.asarray(Image.open(disp_path).convert('L'), dtype=float)
    H, W = d.shape
    s = int(round(frac * W))
    low = d < 16                            # the joints: the lowest, thin black lines of the height map
    ii = low.cumsum(0).cumsum(1)
    def count(y, x):
        y1, x1 = y + s - 1, x + s - 1
        tot = ii[y1, x1]
        if y > 0: tot -= ii[y - 1, x1]
        if x > 0: tot -= ii[y1, x - 1]
        if y > 0 and x > 0: tot += ii[y - 1, x - 1]
        return tot
    out = []
    taken = np.zeros_like(low)
    for y in range(0, H - s, 8):
        for x in range(0, W - s, 8):
            if count(y, x) <= s * s * 0.002 and not taken[y:y + s, x:x + s].any():
                out.append([round(x / W, 4), round(y / H, 4), round((x + s) / W, 4), round((y + s) / H, 4)])
                taken[y + s // 3:y + 2 * s // 3, x + s // 3:x + 2 * s // 3] = True
    return out

def hdr_small(path, w=1024):
    """a Radiance .hdr made smaller (RGBE, flat – no run-length coding), base64"""
    raw = open(path, 'rb').read()
    # header
    end = raw.index(b'\n\n') + 2
    head = raw[:end].decode('latin-1')
    line_end = raw.index(b'\n', end)
    res = raw[end:line_end].decode().split()
    H0, W0 = int(res[1]), int(res[3])
    data = raw[line_end + 1:]
    # decode new-style RLE scanlines
    img = np.zeros((H0, W0, 4), dtype=np.uint8)
    p = 0
    for y in range(H0):
        if data[p] == 2 and data[p + 1] == 2:
            p += 4
            for c in range(4):
                x = 0
                while x < W0:
                    n = data[p]; p += 1
                    if n > 128:
                        n -= 128; img[y, x:x + n, c] = data[p]; p += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(data[p:p + n], dtype=np.uint8); p += n
                    x += n
        else:
            img[y] = np.frombuffer(data[p:p + W0 * 4], dtype=np.uint8).reshape(W0, 4); p += W0 * 4
    # to float, box-downscale, back to RGBE
    e = img[:, :, 3].astype(np.float32)
    f = np.where(e[..., None] > 0, img[:, :, :3].astype(np.float32) * np.ldexp(1.0, (e - 136).astype(np.int32))[..., None], 0)
    k = W0 // w
    f = f.reshape(H0 // k, k, W0 // k, k, 3).mean(axis=(1, 3))
    h2, w2 = f.shape[:2]
    m = f.max(axis=2)
    ex = np.where(m > 1e-32, np.floor(np.log2(np.maximum(m, 1e-32))) + 1, 0)
    sc = np.where(m > 1e-32, 256.0 / np.power(2.0, ex), 0)
    rgbe = np.zeros((h2, w2, 4), dtype=np.uint8)
    rgbe[:, :, :3] = np.clip(f * sc[..., None], 0, 255).astype(np.uint8)
    rgbe[:, :, 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    out = b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h2} +X {w2}\n'.encode() + rgbe.tobytes()
    import gzip
    return base64.b64encode(gzip.compress(out, 9, mtime=0)).decode(), [w2, h2]

sets = {}
for sid, cfg in SETS.items():
    folder = os.path.join(SRC, sid)
    col = Image.open(find(folder, '_Color.jpg')).convert('RGB')
    nor = Image.open(find(folder, '_NormalGL.jpg')).convert('RGB')
    rou = Image.open(find(folder, '_Roughness.jpg')).convert('L')
    # (a picture that isn't square keeps its shape: 512 wide; its size in metres is then [w, h])
    hh = round(512 * col.size[1] / col.size[0])
    cw = cfg.get('px', 512)   # (the colour picture larger where tiles are cut from it and seen close up)
    e = {'size': cfg['size'],
         'color': jpeg(col.resize((cw, round(cw * col.size[1] / col.size[0])), Image.LANCZOS), 82),
         'normal': jpeg(nor.resize((512, hh), Image.LANCZOS), 88),
         'rough': jpeg(rou.resize((256, hh // 2), Image.LANCZOS), 80),
         'avg': [round(v / 255, 3) for v in np.asarray(col, dtype=float).reshape(-1, 3).mean(0)],
         'roughAvg': round(float(np.asarray(rou, dtype=float).mean() / 255), 3)}
    if cfg.get('metal'):
        mp = find(folder, '_Metalness.jpg')
        if mp: e['metal'] = jpeg(Image.open(mp).convert('L').resize((256, 256), Image.LANCZOS), 80)
    if cfg.get('strips'): e['strips'] = strips(find(folder, '_NormalGL.jpg'))
    if cfg.get('grid'): e['grid'] = cfg['grid']
    if cfg.get('clean'):
        e['squares'] = clean_squares(find(folder, '_Displacement.jpg'), cfg['clean'] / cfg['size'])
        if cfg.get('plain'):
            # only the plain ones: a square much lighter than the usual one (the light, streaky riven stones) is left out
            c = np.asarray(col, dtype=float) / 255
            lum = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
            Hc, Wc = lum.shape
            L = [float(lum[int(y0 * Hc):int(y1 * Hc), int(x0 * Wc):int(x1 * Wc)].mean()) for x0, y0, x1, y1 in e['squares']]
            mid = float(np.median(L))
            e['squares'] = [q for q, l in zip(e['squares'], L) if l <= mid + cfg['plain']]
    sets[sid] = e
    print(f"{sid:18s} {sum(len(v) for k, v in e.items() if isinstance(v, str)) / 1024:7.0f} KB" + (f"  strips {len(e['strips'])}" if 'strips' in e else '') + (f"  squares {len(e['squares'])}" if 'squares' in e else ''))

# the house brick: waalformaat in wildverband, coloured in the app from a palette (texlib.js libBrick)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brickkit
k = brickkit.kit(os.path.join(SRC, 'Bricks092', 'Bricks092_1K-JPG'))
rough = np.asarray(k['rough'], dtype=float)
sets['HouseBrick'] = {'size': k['size'], 'brick': True, 'courses': k['courses'], 'units': k['units'],
                      'kit': png(k['kit']), 'detail': jpeg(k['detail'], 85),
                      'normal': jpeg(k['normal'], 88), 'rough': jpeg(k['rough'].resize((512, 480), Image.LANCZOS), 80),
                      'roughAvg': round(float(rough.mean() / 255), 3)}
print(f"{'HouseBrick':18s} {sum(len(v) for v in sets['HouseBrick'].values() if isinstance(v, str)) / 1024:7.0f} KB")

skies = {}
if len(sys.argv) >= 4:
    for key, path in (('day', sys.argv[2]), ('sunset', sys.argv[3])):
        b64, size = hdr_small(path)
        skies[key] = {'hdr': b64, 'size': size}
        print(f"sky {key}: {size} {len(b64) / 1024:.0f} KB")

out = {'v': 1, 'source': 'ambientCG (CC0): ambientcg.com; skies: Poly Haven (CC0): polyhaven.com', 'sets': sets, 'skies': skies}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('written', OUT, f'{os.path.getsize(OUT) / 1024 / 1024:.1f} MB')
import importlib.util
_spec = importlib.util.spec_from_file_location('build_library', os.path.join(ROOT, 'tools', 'build-library.py'))
BL = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(BL)
BL.import_textures(out)
print('into the library: build/library (now: python3 tools/build-library.py --gpu)')
