"""Twenty-eighth round (2 Nov, night): the driveway and garden tiles close up. Their 50 × 50 cm tiles are cut from the
squares without a joint in your Tiles050 picture – now only the plain dark slate ones (the light pink riven stones looked
streaky pink close up), a little in from the square's edge (no light line of the joint at a tile's edge), each turned a
quarter at random and maybe mirrored, never the same part of the picture next to each other; the picture twice as sharp
(1024 px). PC (light) and phone (dark)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
# the tile texture of the parking (50 × 50 cm): per tile its light, redness, how much lighter its edge is than its middle,
# and a small copy of it (to compare neighbours); the texture's own size
TILES = """(low) => { const H = window.__hp, k = [...H.TEX.keys()].find(k => k.startsWith('libp|g-tiles|0.5x0.5|Tiles050|') && k.endsWith('|s') === low);
  if (!k) return null;
  const cv = H.TEX.get(k).image, n = 4, W = cv.width, c = cv.getContext('2d'), d = c.getImageData(0, 0, W, cv.height).data, cw = W / n;
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const tiles = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let L = 0, red = 0, cnt = 0, eL = 0, ec = 0, iL = 0, ic = 0; const small = [];
    const x0 = Math.round(i * cw + 3), x1 = Math.round((i + 1) * cw - 3), y0 = Math.round(j * cw + 3), y1 = Math.round((j + 1) * cw - 3);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * W + x) * 4, l = 0.2126 * lin(d[p]) + 0.7152 * lin(d[p + 1]) + 0.0722 * lin(d[p + 2]);
      L += l; red += (d[p] - d[p + 1]) / 255; cnt++;
      const e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      if (e < 3) { eL += l; ec++; } else if (e > cw * 0.15) { iL += l; ic++; }
    }
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { const p = ((Math.round(y0 + (b + 0.5) * (y1 - y0) / 8)) * W + Math.round(x0 + (a + 0.5) * (x1 - x0) / 8)) * 4; small.push(d[p] + d[p + 1] + d[p + 2]); }
    tiles.push({ i, j, L: L / cnt, red: red / cnt, edge: eL / ec - iL / ic, small });
  }
  return { key: k, W, H: cv.height, tiles }; }"""
SET = "() => { const s = window.__hp.libSet('Tiles050'), im = [...window.__hp.TEXLIB.img.entries()].find(([k]) => k === 'Tiles050|color'); return { squares: s.squares.length, w: im ? im[1].naturalWidth : 0 }; }"

def neighbours_differ(t):
    n = 4
    at = {(x['i'], x['j']): x['small'] for x in t}
    same = []
    for i in range(n):
        for j in range(n):
            for di, dj in ((1, 0), (0, 1)):
                a, b = at[(i, j)], at[((i + di) % n, (j + dj) % n)]
                if sum(abs(p - q) for p, q in zip(a, b)) / len(a) < 6: same.append(((i, j), ((i + di) % n, (j + dj) % n)))
    return same

def checks(pg, low, who):
    t = pg.evaluate(TILES, low)
    check(f'{who}: the parking\'s tile texture made (4 × 4 tiles of 50 cm)', t and t['W'] == t['H'] and len(t['tiles']) == 16, t and {k: t[k] for k in ('key', 'W', 'H')})
    if not t: return
    Ls = [x['L'] for x in t['tiles']]
    check(f'{who}: no light pink riven stones – every tile dark slate (light < 0.13, as the plain squares; the pink ones were ≈ 0.2)', max(Ls) < 0.13, [round(v, 3) for v in Ls])
    check(f'{who}: … and not reddish (red – green below 0.03 on every tile)', max(x['red'] for x in t['tiles']) < 0.03, [round(x['red'], 3) for x in t['tiles']])
    check(f'{who}: no light line at a tile\'s edge (the edge at most a little lighter than the middle)', max(x['edge'] for x in t['tiles']) < 0.02, [round(x['edge'], 3) for x in t['tiles']])
    same = neighbours_differ(t['tiles'])
    check(f'{who}: never the same stone twice side by side (also where the pattern repeats)', not same, same)
    return t

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    s = pg.evaluate(SET)
    check('the picture: 11 plain squares without a joint to cut tiles from (13 before: the 2 pink ones left out), 1024 px wide', s == {'squares': 11, 'w': 1024}, s)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.setMode('view'); a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(9000)
    t = checks(pg, False, 'PC')
    check('PC: the texture sharp enough close up (640 px for 2 m: 160 px per tile)', t and t['W'] == 640, t and t['W'])
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(5000)
    pg.evaluate("""() => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan, gd = pl.garden || (pl.site && pl.site.garden), T5 = gd.areas.filter(x => x.kind === 'tiles' && x.size && x.size[0] === 0.5 && x.size[1] === 0.5),
        ar = T5.find(x => Math.abs(Math.min(...x.poly.map(p => p[0])) - 13.55) < 0.1) || T5[0];  // (the owner's parking at x 13.55; else the 50 × 50 area)
      const xs = ar.poly.map(p => p[0]), ys = ar.poly.map(p => p[1]), w = a.walker; w.x = (Math.min(...xs) + Math.max(...xs)) / 2; w.y = (Math.min(...ys) + Math.max(...ys)) / 2; w.yaw = 0.6; w.pitch = -0.75;
      w.feet = w.groundAt(w.x, w.y, w.feet + 1) ?? w.feet; w.updateCamera(); a.panes[0].view.needs = true; }""")
    pg.wait_for_timeout(8000); still(pg)
    pg.screenshot(path=SHOTS + 'r28-parking-pc.png')
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(9000)
    t = checks(pg, True, 'phone')
    check('phone: the smaller texture (less memory: 384 px for 2 m)', t and t['W'] == 384, t and t['W'])
    pg.screenshot(path=SHOTS + 'r28-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
