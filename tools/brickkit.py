"""The house brick: a Dutch facade wall in waalformaat (210 × 50 mm, 10 mm head joints, 12.5 mm bed joints – courses of
62.5 mm) laid in wildverband (stretchers and half-brick headers mixed in every course, alternate courses shifted a quarter
brick so head joints never line up, no more than 4 stretchers or 2 headers in a row, no staircases of joints).
Every brick face gets the surface of a real brick (cut from an ambientCG brick picture, CC0: its light and dark and its
relief, each brick a different one, sometimes mirrored).

    kit(source_folder) -> dict with
      size   [1.32, 1.25]  metres of one picture (12 header units across, 20 courses up – it repeats seamlessly)
      kit    PNG: R = joint (0 brick face … 255 joint, soft at the edges), G = which brick (1 … 255, a random number per
             brick; the joints carry the nearest brick's)
      detail JPEG grey: the brick's own light and dark around 128 (= that brick's average); in the joints the sand and
             the shadow along the bricks
      normal JPEG (OpenGL, green = up), rough JPEG
The colour is put together in the app (texlib.js) from a palette: the colours of the bricks (nuanced) and the joint. """
import io, base64, random
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

UNIT = 110.0          # mm: a header (100) + its head joint (10); a stretcher (210 + 10) is two
COURSE = 62.5         # mm: a brick (50) + its bed joint (12.5)
COLS, ROWS = 12, 20   # one picture: 1320 × 1250 mm
W, H = 1024, 960      # pixels (48 per course)
SS = 2                # drawn twice as large, then made smaller (soft edges)


def _course_layouts(rng):
    """for every course a list of (start in units, length in units: 2 stretcher, 1 header) covering COLS units"""
    rows = []
    for r in range(ROWS):
        for _ in range(500):
            seq, n, run_s, run_h = [], 0, 0, 0
            while n < COLS:
                left = COLS - n
                want_s = rng.random() < 0.68
                if run_s >= 4: want_s = False
                if run_h >= 2: want_s = True
                if left == 1: want_s = False
                L = 2 if want_s else 1
                seq.append((n, L)); n += L
                run_s, run_h = (run_s + 1, 0) if L == 2 else (0, run_h + 1)
            # wrapping round: the runs at the end and the start together
            if seq[-1][1] == 2 and seq[0][1] == 2 and sum(1 for s in seq[:5] if s[1] == 2) + sum(1 for s in seq[-5:] if s[1] == 2) > 6:
                continue
            joints = {s[0] for s in seq}
            if r > 0:
                # the course below is shifted half a unit: its joints sit between ours, so check staircases two courses down
                below2 = rows[r - 2] if r >= 2 else None
                if below2 is not None and len(joints & {s[0] for s in below2}) > COLS // 2:
                    continue
            if r == ROWS - 1 or r == ROWS - 2:
                # and with the first courses (the picture repeats)
                other = rows[(r + 2) % ROWS]
                if len(joints & {s[0] for s in other}) > COLS // 2:
                    continue
            rows.append(seq)
            break
        else:
            rows.append(seq)
    return rows


def _faces(src):
    """the faces of single bricks in the source picture: [(colour lum rel, height rel)]"""
    col = np.asarray(Image.open(src + '_Color.jpg').convert('RGB'), dtype=float)
    disp = np.asarray(Image.open(src + '_Displacement.jpg').convert('L'), dtype=float)
    lum = col @ [0.2126, 0.7152, 0.0722]
    diff = disp - ndi.median_filter(disp, size=(41, 41), mode='wrap')
    face = ndi.binary_opening(diff > -12, iterations=2)
    lab, n = ndi.label(face)
    out = []
    for sl in ndi.find_objects(lab):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        # single bricks only (two touching ones would bring their head joint along)
        if not (35 <= h <= 60 and 150 <= w <= 260) or sl[0].start == 0 or sl[1].start == 0 or sl[0].stop >= lum.shape[0] or sl[1].stop >= lum.shape[1]:
            continue
        y0, y1, x0, x1 = sl[0].start + 6, sl[0].stop - 6, sl[1].start + 14, sl[1].stop - 14
        L = lum[y0:y1, x0:x1]; D = disp[y0:y1, x0:x1]
        # light and dark of this brick only (its own average = 1): the fine grain as it is, the slow changes softened
        Ls = ndi.gaussian_filter(L, 10, mode='nearest')
        rel = np.clip((L / np.maximum(Ls, 1)) * (Ls / Ls.mean()) ** 0.5, 0.74, 1.2)
        out.append((rel, (D - D.mean()) / 255.0))
    return out


def _resize(a, w, h):
    return np.asarray(Image.fromarray(a.astype(np.float32), mode='F').resize((max(1, w), max(1, h)), Image.BILINEAR))


def kit(src, seed=7):
    rng = random.Random(seed)
    faces = _faces(src)
    rows = _course_layouts(rng)
    Wb, Hb = W * SS, H * SS
    pu = Wb / (COLS * UNIT)        # px per mm across
    pv = Hb / (ROWS * COURSE)      # px per mm up
    cover = np.zeros((Hb, Wb), np.float32)         # 1 on a brick face
    bid = np.zeros((Hb, Wb), np.uint8)
    det = np.ones((Hb, Wb), np.float32)
    hgt = np.zeros((Hb, Wb), np.float32)
    ids = list(range(1, 256)); rng.shuffle(ids)
    k = 0
    for r, seq in enumerate(rows):
        shift = 0.5 * UNIT if r % 2 else 0.0        # a quarter brick
        y0 = r * COURSE + 12.5 / 2                  # mm from the top (the bed joint split above and below)
        for (u, L) in seq:
            x0 = u * UNIT + shift + 5.0
            wmm = L * UNIT - 10.0
            px0, py0 = int(round(x0 * pu)), int(round(y0 * pv))
            pw, ph = int(round(wmm * pu)), int(round(50.0 * pv))
            f = faces[rng.randrange(len(faces))]
            Lr, Dr = f
            if L == 1:
                # a header: a part of a brick's face
                cw = max(8, int(Lr.shape[1] * 0.48)); c0 = rng.randrange(0, Lr.shape[1] - cw + 1)
                Lr, Dr = Lr[:, c0:c0 + cw], Dr[:, c0:c0 + cw]
            if rng.random() < 0.5: Lr, Dr = Lr[:, ::-1], Dr[:, ::-1]
            if rng.random() < 0.5: Lr, Dr = Lr[::-1, :], Dr[::-1, :]
            Lp, Dp = _resize(Lr, pw, ph), _resize(Dr, pw, ph)
            # the brick's edges: a little rounded (2 mm) and not quite straight
            yy, xx = np.mgrid[0:ph, 0:pw]
            e = np.minimum(np.minimum(xx + 0.5, pw - xx - 0.5) / pu, np.minimum(yy + 0.5, ph - yy - 0.5) / pv)   # mm to the edge
            bevel = np.clip(e / 2.2, 0, 1) ** 0.6
            Bh = bevel * (1.0 + 0.012 * rng.uniform(-1, 1)) + Dp * 1.6
            ident = ids[k % 255]; k += 1
            for dx in (0, -Wb, Wb):          # wrapping across the picture's edge
                for dy in (0, -Hb, Hb):
                    xa, ya = px0 + dx, py0 + dy
                    xs0, xs1 = max(0, xa), min(Wb, xa + pw)
                    ys0, ys1 = max(0, ya), min(Hb, ya + ph)
                    if xs0 >= xs1 or ys0 >= ys1: continue
                    sx, sy = slice(xs0 - xa, xs1 - xa), slice(ys0 - ya, ys1 - ya)
                    cover[ys0:ys1, xs0:xs1] = 1
                    bid[ys0:ys1, xs0:xs1] = ident
                    det[ys0:ys1, xs0:xs1] = Lp[sy, sx]
                    hgt[ys0:ys1, xs0:xs1] = Bh[sy, sx]
    # the joints: sand, and darker in the corner along the bricks
    mortar = cover < 0.5
    dist = ndi.distance_transform_edt(mortar)                                    # px to the nearest brick
    sand = 1 + 0.07 * ndi.gaussian_filter(np.asarray(np.random.default_rng(seed).normal(size=(Hb, Wb)), np.float32), 1.0)
    shadow = 0.88 + 0.12 * np.clip(dist / (3.5 * pv), 0, 1)
    det = np.where(mortar, sand * shadow, det)
    hgt = np.where(mortar, -0.35 + 0.02 * (sand - 1) * 5, hgt)
    # the joints carry the nearest brick's number
    _, (iy, ix) = ndi.distance_transform_edt(mortar, return_indices=True)
    bid = bid[iy, ix]
    # smaller (soft edges)
    def down(a):
        return a.reshape(H, SS, W, SS).mean(axis=(1, 3))
    cov = down(cover); detd = down(det); hd = down(hgt)
    bidd = bid[::SS, ::SS]
    joint = 1 - cov
    # relief → normal (OpenGL: x right, y up); one pixel ≈ 1.29 mm, the joint 4 mm deep
    hpx = hd * 4.0 / (1320.0 / W)          # height in pixels
    hx = (np.roll(hpx, -1, 1) - np.roll(hpx, 1, 1)) / 2
    hy = (np.roll(hpx, -1, 0) - np.roll(hpx, 1, 0)) / 2           # down the picture
    hx = ndi.gaussian_filter(hx, 0.6, mode='wrap'); hy = ndi.gaussian_filter(hy, 0.6, mode='wrap')
    nx, ny, nz = -hx, hy, np.ones_like(hx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1)
    nrm_img = np.clip((nrm + 1) * 127.5, 0, 255).astype(np.uint8)
    # gloss: bricks fairly rough, a little smoother where they stand out; the joints rough
    rough = np.clip(0.86 - 0.06 * (detd - 1) * 3 + 0.08 * joint, 0.55, 1.0)
    kit_img = np.zeros((H, W, 3), np.uint8)
    kit_img[..., 0] = np.clip(joint * 255, 0, 255).astype(np.uint8)
    kit_img[..., 1] = bidd
    det_img = np.clip(128 + (detd - 1) * 255, 0, 255).astype(np.uint8)
    return {'size': [COLS * UNIT / 1000, ROWS * COURSE / 1000],
            'kit': Image.fromarray(kit_img), 'detail': Image.fromarray(det_img, 'L'),
            'normal': Image.fromarray(nrm_img), 'rough': Image.fromarray((rough * 255).astype(np.uint8), 'L'),
            'courses': ROWS, 'units': COLS}


# the three house bricks of the builder's drawing as they look on the photo (for trying out here; the app has them too)
def compose(k, palette):
    """the colour picture for a palette: {'bricks': [(weight, (r, g, b)), …], 'mortar': (r, g, b), 'jitter': 0.05}"""
    kit_a = np.asarray(k['kit'], dtype=float); det = np.asarray(k['detail'], dtype=float) / 128.0
    joint = kit_a[..., 0:1] / 255.0; bid = kit_a[..., 1].astype(int)
    ws = np.array([w for w, _ in palette['bricks']], float); ws /= ws.sum(); cum = np.cumsum(ws)
    cols = np.array([c for _, c in palette['bricks']], float)
    rng = np.random.default_rng(3)
    hsh = rng.random(256); jit = 1 + palette.get('jitter', 0.05) * rng.uniform(-1, 1, 256)
    which = np.searchsorted(cum, hsh[bid])
    which = np.minimum(which, len(cols) - 1)
    bc = cols[which] * jit[bid][..., None]
    d = det[..., None]
    face = bc * (1 + (d - 1) * palette.get('contrast', 1.0))
    mort = np.array(palette['mortar'], float) * (1 + (d - 1) * 1.0)
    out = face * (1 - joint) + mort * joint
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
