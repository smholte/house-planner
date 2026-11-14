"""Nineteenth round (1 Nov): the bricks as they really are. One Dutch facade wall made for the app (tools/brickkit.py):
waalformaat (210 × 50 mm, 10 mm head joints, 12.5 mm bed joints) in wildverband, every brick the surface of a real
one, coloured in the app from a palette – the builder's three bricks (VK-3.020-C: oranje-rood, wit, bruin) as they are
on the photo of the house: red-orange with darker bricks among them and grey joints, cream-white, dark brown almost
black (plinth, round the front door). Other brick colours (another house, the neighbours, garden walls) around their own
colour. PC (light) and phone (dark). (The owner's house in its red, white and brown brick:
house/tests/test_round19_own.py.)"""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
BRICKS = """() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view, out = {}, seen = new Set();
  v.scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m) || !m.userData || m.userData.lib !== 'HouseBrick') continue; seen.add(m);
    out[m.userData.brick + (m.map.image.width < 1000 ? '|half' : '')] = { rep: [m.map.repeat.x, m.map.repeat.y], n: !!m.normalMap, r: !!m.roughnessMap, w: m.map.image.width }; } });
  return out; }"""
# the wall itself: bed joints per picture, the lengths of the bricks along a course (mm), the offset of head joints between courses
KIT = """() => { const im = window.__hp.TEXLIB.img.get('HouseBrick|kit'), s = window.__hp.TEXLIB.data.sets.HouseBrick;
  const W = im.naturalWidth, H = im.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, W, H).data, R = (x, y) => d[(y * W + x) * 4];
  // rows that are joint all along
  const allJ = y => { let j = 0; for (let x = 0; x < W; x += 4) j += R(x, y) > 128; return j > W / 4 * 0.97; };
  let beds = 0, prev = allJ(H - 1);
  for (let y = 0; y < H; y++) { let j = 0; for (let x = 0; x < W; x += 4) j += R(x, y) > 128; const all = j > W / 4 * 0.97; if (all && !prev) beds++; prev = all; }
  const mmX = s.size[0] * 1000 / W, perCourse = H / s.courses;
  const lens = [], joints = [];
  for (let c = 0; c < s.courses; c++) {
    const y = Math.round((c + 0.5) * perCourse), js = [];
    for (let x = 0; x < W; x++) if (R(x, y) > 128 && R((x + W - 1) % W, y) <= 128) js.push(x);
    joints.push(js);
    for (let i = 0; i < js.length; i++) { const a = js[i], b = js[(i + 1) % js.length] + (i + 1 === js.length ? W : 0); lens.push((b - a) * mmX); }
  }
  // head joints of a course and the one above: never closer than a quarter brick (≈ 55 mm)
  let near = 1e9;
  for (let c = 0; c < s.courses; c++) for (const a of joints[c]) for (const b of joints[(c + 1) % s.courses]) { const dx = Math.min(Math.abs(a - b), W - Math.abs(a - b)) * mmX; near = Math.min(near, dx); }
  return { W, H, beds, lens: lens.map(Math.round), near: Math.round(near), size: s.size, courses: s.courses }; }"""
AVG = """(name) => { const P = window.__hp.BRICK_PAL[name]; const cv = window.__hp.libBrickCanvas(P); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const kit = window.__hp.TEXLIB.img.get('HouseBrick|kit'), k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; const kg = k.getContext('2d'); kg.drawImage(kit, 0, 0); const K = kg.getImageData(0, 0, k.width, k.height).data;
  const b = [0, 0, 0], j = [0, 0, 0]; let nb = 0, nj = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { const t = K[i] > 200 ? j : K[i] < 30 ? b : null; if (!t) continue; t[0] += d[i]; t[1] += d[i + 1]; t[2] += d[i + 2]; if (t === b) nb++; else nj++; }
  return { brick: b.map(v => Math.round(v / nb)), joint: j.map(v => Math.round(v / nj)), jointShare: nj / (nb + nj) }; }"""
lum = lambda c: (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    load_pictures(pg, 'HouseBrick')      # (task 0021: loaded when a 3D view asks – here before one does)
    sets = pg.evaluate("() => { const S = window.__hp.TEXLIB.data.sets; return { ids: Object.keys(S), hb: S.HouseBrick && Object.keys(S.HouseBrick).sort(), size: S.HouseBrick && S.HouseBrick.size }; }")
    check('textures: one brick set, the house brick (kit, detail, relief, gloss), 1.32 × 1.25 m', sets['hb'] and all(k in sets['hb'] for k in ['kit', 'detail', 'normal', 'rough']) and sets['size'] == [1.32, 1.25], sets['hb'])
    check('… the three loose brick pictures are gone (wrong colours, wrong sizes)', not any(i.startswith('Bricks') for i in sets['ids']), sets['ids'])
    k = pg.evaluate(KIT)
    check('the wall: 20 courses of 62.5 mm in one picture (waalformaat: 50 mm brick + 12.5 mm bed joint)', k['beds'] == 20 and k['courses'] == 20 and abs(k['size'][1] * 1000 / 20 - 62.5) < 0.01, k['beds'])
    L = k['lens']
    stretch = [x for x in L if 205 <= x <= 235]; head = [x for x in L if 95 <= x <= 125]
    check('wildverband: stretchers (210 mm + joint) and headers (100 mm + joint) mixed in the courses', len(stretch) + len(head) >= len(L) * 0.97 and 0.15 < len(head) / len(L) < 0.6, (len(stretch), len(head), len(L), sorted(set(L))[:12]))
    check('… head joints of one course and the next never line up (at least a quarter brick apart)', k['near'] >= 50, k['near'])
    # the palettes: from the builder's colours to the bricks on the photo
    names = pg.evaluate("() => [[0.51, 0.31, 0.24], [1, 1, 1], [0.31, 0.22, 0.16], [0.31, 0.196, 0.157], [0.6, 0.45, 0.2]].map(c => window.__hp.brickPalette(c).name)")
    check('the builder\'s colours (model and drawing) → red, white, brown; another colour its own palette', names[:4] == ['red', 'white', 'brown', 'brown'] and names[4].startswith('c'), names)
    red, white, brown = (pg.evaluate(AVG, n) for n in ('red', 'white', 'brown'))
    check('red: red-orange (red > green > blue), medium – as on the photo, not the bright orange of before', red['brick'][0] > red['brick'][1] + 25 > red['brick'][2] + 25 and 0.3 < lum(red['brick']) < 0.55 and (red['brick'][0] - red['brick'][2]) / red['brick'][0] < 0.5, red)
    check('… its joints grey (not yellow), lighter than the bricks', abs(red['joint'][0] - red['joint'][2]) < 16 and lum(red['joint']) > lum(red['brick']), red)
    check('white: cream-white, hardly any yellow', lum(white['brick']) > 0.72 and white['brick'][0] - white['brick'][2] < 20, white)
    check('brown: dark brown, almost black, dark grey joints', lum(brown['brick']) < 0.24 and lum(brown['joint']) < 0.4 and lum(brown['joint']) < lum(red['joint']), brown)
    check('… the joints about a fifth of the wall', 0.14 < red['jointShare'] < 0.3, red['jointShare'])
    # the example house in 3D
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    br = pg.evaluate(BRICKS)
    check('the house in 3D: its brick (each colour of the model its palette; the garden walls in the red)', 'red' in br and len([k for k in br if not k.endswith('|half')]) >= 2, list(br))
    r = br.get('red', {})
    check('… at their true size, with relief and gloss', abs(r.get('rep', [0])[0] - 1 / 1.32) < 1e-6 and abs(r['rep'][1] - 1 / 1.25) < 1e-6 and r['n'] and r['r'], r)
    roof = pg.evaluate("""() => { const v = window.__hp.app.panes.find(p => p.kind === '3d').view; let rep = null;
      v.scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.userData && m.userData.lib === 'RoofingTiles013A' && m.map && !rep) rep = [m.map.repeat.x, m.map.repeat.y]; }); return rep; }""")
    check('the roof tiles twice as large (one picture: 3.2 m, was 1.6)', roof and abs(roof[0] - 1 / 3.2) < 1e-6 and abs(roof[1] - 1 / 3.2) < 1e-6, roof)
    pg.screenshot(path=SHOTS + 'r19-house.png', clip={'x': 56, 'y': 104, 'width': 884, 'height': 696})
    # walking in front of it (the photo's view): the neighbours' bricks too, at half size
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); }"); pg.wait_for_timeout(1500)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(5000)
    pg.evaluate("([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.yaw = 0.05; w.pitch = 0.3; w.feet = w.groundAt(w.x, w.y, w.feet + 1) ?? w.feet; w.updateCamera(); window.__hp.app.panes[0].view.needs = true; }", [7.5, 20.0])
    pg.wait_for_timeout(7000)
    pg.screenshot(path=SHOTS + 'r19-front.png', clip={'x': 56, 'y': 104, 'width': 884, 'height': 696})
    br = pg.evaluate(BRICKS)
    check('walking: the neighbours\' houses in their own brick colours (the same wall, half the size in memory)', any(k.endswith('|half') for k in br), list(br))
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(2500)
    # Fast: colour only
    pg.evaluate("() => { const a = window.__hp.app; a.settings.quality = 'fast'; window.__hp.Settings.save(); a.refreshViews(false); }"); pg.wait_for_timeout(8000)
    q = pg.evaluate("() => window.__hp.quality3d(window.__hp.app.settings)")
    br = pg.evaluate(BRICKS)
    check('Fast: the bricks in colour only (no relief maps)', q != 'fast' or (br and not any(v['n'] for v in br.values())), (q, br))
    pg.evaluate("() => { const a = window.__hp.app; delete a.settings.quality; window.__hp.Settings.save(); a.refreshViews(false); }"); pg.wait_for_timeout(4000)
    # without the pictures: the drawn bricks, as before
    pg.evaluate("() => { const a = window.__hp.app; a.settings.realTex = false; window.__hp.TEXLIB.gen++; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(8000)
    check('pictures off: the drawn bricks again', not pg.evaluate(BRICKS))
    pg.evaluate("() => { const a = window.__hp.app; delete a.settings.realTex; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(3000)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); }"); pg.wait_for_timeout(9000); still(pg)
    br = pg.evaluate(BRICKS)
    # (on a phone the house's brick colours are half size since the twenty-third round: 'red|half' …)
    check('phone (whole house): the brick of the house and of the garden walls', ('red' in br or 'red|half' in br) and len(br) >= 2, list(br))
    pg.screenshot(path=SHOTS + 'r19-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
