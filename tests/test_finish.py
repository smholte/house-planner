"""Finishes per wall: each wall of a room lettered A, B, C … (list + letters on the plan), a wall with its own finish
(accent colour), tiles to a height or full height with the tile counter, wallpaper from a picture (repeated at its
real size, or over the whole wall), the ceiling (colour, finish, lowered height), all drawn in 3D; tapping a wall
in 3D opens it; changes between versions; undo; kept in the house file (also after export and import)."""
from common import *
from PIL import Image, ImageDraw
import math

def leaves(path):
    im = Image.new('RGB', (530, 530), (236, 230, 214)); d = ImageDraw.Draw(im)
    for i, (cx, cy) in enumerate([(130, 130), (400, 140), (260, 300), (120, 430), (420, 420)]):
        for k in range(5):
            a = k * math.pi * 2 / 5 + i; x = cx + math.cos(a) * 45; y = cy + math.sin(a) * 45
            d.ellipse([x - 38, y - 16, x + 38, y + 16], fill=(96, 128, 104))
        d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=(200, 150, 90))
    im.save(path)
def mural(path):
    im = Image.new('RGB', (1200, 600)); d = ImageDraw.Draw(im)
    for y in range(600): d.line([(0, y), (1200, y)], fill=(int(120 + y * 0.15), int(170 + y * 0.08), int(220 - y * 0.05)))
    d.polygon([(0, 600), (250, 250), (480, 520), (700, 200), (1000, 560), (1200, 380), (1200, 600)], fill=(70, 90, 96))
    im.save(path, quality=90)
LEAVES, MURAL = SHOTS + 'leaves.png', SHOTS + 'mural.jpg'
leaves(LEAVES); mural(MURAL)

ROOM = "(name) => window.__hp.app.shownVersion().plan.rooms.find(r => r.name === name && r.storey === window.__hp.app.view.storeyId)"
STATS = "(name) => { const a = window.__hp.app; const r = (" + ROOM + ")(name); const s = window.__hp.roomFinishStats(a.shownVersion().plan, r, a.currentStorey()); return { wall: s.wall, tiled: s.tiled, faces: s.faces.map(x => ({ wall: x.f.wall.id, letter: x.f.letter, len: x.len, area: x.area, tArea: x.tArea, own: x.fin.own, ops: x.ops.length })), tiles: s.tiles.map(x => ({ n: x.tiles, area: x.area, w: x.T.w, h: x.T.h, j: x.T.joint, waste: x.T.waste })) }; }"
FIN = "([wid, rid]) => { const w = window.__hp.app.shownVersion().plan.walls.find(x => x.id === wid); return w && w.fin ? w.fin[rid] || null : null; }"

def pick_room(pg, name, phone=False):
    """tap a room at the point where its name is written"""
    lp = pg.evaluate("(name) => { const r = (" + ROOM + ")(name); return window.__hp.labelPoint(r.poly, []); }", name)
    x, y = to_screen(pg, lp[0], lp[1] + 0.25)
    if phone: pg.touchscreen.tap(x, y)
    else: pg.mouse.click(x, y)
    pg.wait_for_timeout(700)
    return pg.evaluate("() => window.__hp.app.selectionTarget() && window.__hp.app.selectionTarget().name")

def run(p, phone=False, theme='light'):
    tag = ('phone' if phone else 'pc') + '-' + theme
    b, pg = open_app(p, phone=phone, theme=theme)
    open_example(pg)
    if phone:
        pg.click('#display-toggle button[data-mode="plan"]') if pg.is_visible('#display-toggle button[data-mode="plan"]') else pg.evaluate("() => window.__hp.app.setDisplay('plan')")
    else:
        pg.click('#display-toggle button[data-mode="plan"]')
    pg.wait_for_timeout(600)
    if phone:
        # the phone layout: the bathroom upstairs, worked on in the sheet
        pg.click('#storey-tabs button:has-text("1e verdieping")'); pg.wait_for_timeout(1200)
        got = pick_room(pg, 'Badkamer', phone=True)
        check(f'[{tag}] the bathroom opens', got == 'Badkamer', got)
        n = pg.evaluate("() => document.querySelectorAll('.face-row').length")
        check(f'[{tag}] its walls are listed', n >= 4, n)
        pg.tap('.face-row >> nth=1'); pg.wait_for_timeout(700)
        pg.tap('.face-mode button[data-k="own"]'); pg.wait_for_timeout(600)
        pg.tap('.face-edit .tile-seg button[data-k="to"]'); pg.wait_for_timeout(600)
        st = pg.evaluate(STATS, 'Badkamer')
        f1 = st['faces'][1]
        check(f'[{tag}] wall B tiled to 1.2 m only', f1['own'] and 0 < f1['tArea'] < f1['area'] - 0.3, f1)
        pg.evaluate("() => document.querySelector('.face-edit').scrollIntoView({ block: 'start' })"); pg.wait_for_timeout(300)
        pg.screenshot(path=SHOTS + f'finish-{tag}.png')
        vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('#inspector').scrollWidth <= document.querySelector('#inspector').clientWidth + 1]")
        check(f'[{tag}] nothing sticks out sideways', vw[0] <= vw[1] and vw[2], vw)
        check(f'[{tag}] no page errors', not pg.errors, pg.errors)
        b.close(); return

    # ── old style "Wall tiles … to 1.5 m" became real tiles ──
    t = pg.evaluate("(name) => { const r = (" + ROOM + ")(name); return [r.tiles, r.wallColorName]; }", 'Toilet')
    check('the example toilet has tiles to 1.5 m (from the IFC model)', t[0] and t[0]['to'] == 1.5 and near(t[0]['w'], 0.3, 0.001) and t[1] == '', t)

    # ── the toilet: four walls, letters, tile counter ──
    check('tap the toilet', pick_room(pg, 'Toilet') == 'Toilet')
    st = pg.evaluate(STATS, 'Toilet')
    check('four walls A–D', [f['letter'] for f in st['faces']] == ['A', 'B', 'C', 'D'], st['faces'])
    check('the letters are on the plan', pg.evaluate("() => [...document.querySelectorAll('.face-tag text')].map(e => e.textContent).sort().join('')") == 'ABCD')
    H = pg.evaluate("() => window.__hp.app.currentStorey().wallHeight")
    gross = sum(f['len'] for f in st['faces']) * H
    check('wall area: around the room × height, less the door and openings', st['wall'] < gross - 0.5 and st['wall'] > gross - 4, (st['wall'], gross))
    T = st['tiles'][0]
    expect = math.ceil(T['area'] / ((T['w'] + T['j']) * (T['h'] + T['j'])) * 1.1 - 1e-9)
    check('tile counter: tiles for the tiled area with 10 % extra', T['n'] == expect and T['n'] > 10, (T, expect))
    txt = pg.inner_text('.fin-totals')
    check('the counter is shown', f"{T['n']} tiles" in txt, txt)
    # a bigger tile: fewer tiles
    pg.fill('#f-tile-w', '600'); pg.press('#f-tile-w', 'Enter'); pg.wait_for_timeout(600)
    T2 = pg.evaluate(STATS, 'Toilet')['tiles'][0]
    check('tiles 600 × 600: about half as many', T2['n'] < T['n'] * 0.6 and near(T2['w'], 0.6, 0.001), (T2['n'], T['n']))
    # wall B: its own colour
    pg.click('.face-row >> nth=1'); pg.wait_for_timeout(500)
    check('wall B opens', pg.evaluate("() => window.__hp.app.selection.face") == st['faces'][1]['wall'] and pg.is_visible('.face-edit'))
    pg.click('.face-mode button[data-k="own"]'); pg.wait_for_timeout(500)
    pg.click('.face-edit .swatch >> nth=7'); pg.wait_for_timeout(500)
    rid = pg.evaluate("() => window.__hp.app.selection.id")
    fin = pg.evaluate(FIN, [st['faces'][1]['wall'], rid])
    check('wall B: its own colour (accent wall)', fin and fin.get('color', '').lower() == '#5e6b6b', fin)
    check('2D: the wall drawn in its own finish', pg.evaluate("() => document.querySelectorAll('.fin-band.own').length") >= 1)
    pg.screenshot(path=SHOTS + 'finish-toilet.png')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    check('undo: the colour goes back', (pg.evaluate(FIN, [st['faces'][1]['wall'], rid]) or {}).get('color', '').lower() != '#5e6b6b')
    pg.keyboard.press('Control+Shift+z'); pg.wait_for_timeout(500)
    check('redo', (pg.evaluate(FIN, [st['faces'][1]['wall'], rid]) or {}).get('color', '').lower() == '#5e6b6b')
    pg.click('.face-edit .tile-seg button[data-k="none"]'); pg.wait_for_timeout(500)
    st2 = pg.evaluate(STATS, 'Toilet')
    check('no tiles on wall B (the room has them): fewer tiles', st2['faces'][1]['tArea'] == 0 and st2['tiles'][0]['n'] < T2['n'], st2['tiles'])

    # ── the living room: wallpaper from a picture ──
    check('tap the living room', pick_room(pg, 'Woonkamer') == 'Woonkamer')
    wl = pg.evaluate(STATS, 'Woonkamer')
    longest = max(range(len(wl['faces'])), key=lambda i: wl['faces'][i]['len'] if wl['faces'][i]['ops'] == 0 else 0)
    fw = wl['faces'][longest]['wall']
    pg.click(f'.face-row[data-face="{fw}"]'); pg.wait_for_timeout(500)
    pg.click('.face-mode button[data-k="own"]'); pg.wait_for_timeout(500)
    pg.click('.face-edit .cover-seg button[data-k="paper"]'); pg.wait_for_timeout(500)
    check('choosing wallpaper asks for a picture', pg.is_visible('.dialog .pic-grid'))
    with pg.expect_file_chooser() as fc:
        pg.click('.dialog .btn.primary')
    fc.value.set_files(LEAVES)
    # making the picture smaller takes a few seconds in the test browser
    pg.wait_for_function("(fw) => { const a = window.__hp.app; const w = a.shownVersion().plan.walls.find(x => x.id === fw); return w && w.fin && Object.values(w.fin).some(f => f.base === 'paper'); }", arg=fw, timeout=20000); pg.wait_for_timeout(300)
    rid = pg.evaluate("() => window.__hp.app.selection.id")
    fin = pg.evaluate(FIN, [fw, rid])
    imgs = pg.evaluate("() => Object.entries(window.__hp.app.project.images).filter(([k]) => !window.__hp.ownId(k)).map(([k, i]) => [i.name, i.w, i.h, (window.__hp.Assets.get(i.asset) || { url: '' }).url.slice(0, 15), i.avg])")
    check('the picture is kept in the house (made smaller, as JPEG)', len(imgs) == 1 and imgs[0][3].startswith('data:image/jpe') and imgs[0][1] == 530, imgs)
    check('the wall has the wallpaper, 53 cm repeat', fin and fin.get('base') == 'paper' and fin['paper']['img'] and near(fin['paper']['w'], 0.53, 0.001), fin)
    pg.fill('#ff-paper-w', '70'); pg.press('#ff-paper-w', 'Enter'); pg.wait_for_timeout(500)
    fin = pg.evaluate(FIN, [fw, rid])
    check('repeat 70 cm: the height follows the picture', near(fin['paper']['w'], 0.7, 0.001) and near(fin['paper']['h'], 0.7, 0.002), fin['paper'])
    # another wall: photo wallpaper over the whole wall
    other = sorted([f for f in wl['faces'] if f['wall'] != fw], key=lambda f: -f['len'])
    if other:
        pg.click(f'.face-row[data-face="{other[0]["wall"]}"]'); pg.wait_for_timeout(500)
        pg.click('.face-mode button[data-k="own"]'); pg.wait_for_timeout(500)
        pg.click('.face-edit .cover-seg button[data-k="paper"]'); pg.wait_for_timeout(500)
        check('the first picture is offered again (beside the owner\'s floor picture on his build)', pg.evaluate("() => [...document.querySelectorAll('.pic-card')].filter(c => !Object.entries(window.__hp.app.project.images).some(([k, i]) => window.__hp.ownId(k) && i.name === c.title)).length") == 1)
        with pg.expect_file_chooser() as fc:
            pg.click('.dialog .btn.primary')
        fc.value.set_files(MURAL); pg.wait_for_timeout(1500)
        pg.click('.face-edit button:has-text("Over the whole wall")'); pg.wait_for_timeout(500)
        f2 = pg.evaluate(FIN, [other[0]['wall'], rid])
        check('photo wallpaper over the whole wall', f2['paper']['fit'] == 'fill' and len(pg.evaluate("() => Object.keys(window.__hp.app.project.images).filter(k => !window.__hp.ownId(k))")) == 2, f2)
    # ── the kitchen: tiles to a height for the whole room ──
    check('tap the kitchen', pick_room(pg, 'Keuken') == 'Keuken')
    pg.click('.walls-sec .tile-seg button[data-k="to"]'); pg.wait_for_timeout(500)
    pg.fill('#f-tile-to', '600'); pg.press('#f-tile-to', 'Enter'); pg.wait_for_timeout(500)
    kt = pg.evaluate("(name) => (" + ROOM + ")(name).tiles", 'Keuken')
    check('kitchen: tiles to 600 mm on all walls', kt and near(kt['to'], 0.6, 0.001), kt)
    # ── ceiling ──
    check('tap the living room again', pick_room(pg, 'Woonkamer') == 'Woonkamer')
    pg.click('.ceil-sec .swatch >> nth=0'); pg.wait_for_timeout(400)
    pg.select_option('#f-ceil-fin', 'spray'); pg.wait_for_timeout(400)
    pg.fill('#f-ceil-h', '2400'); pg.press('#f-ceil-h', 'Enter'); pg.wait_for_timeout(500)
    c = pg.evaluate("(name) => { const r = (" + ROOM + ")(name); return [r.ceilingColor, r.ceilingFinish, r.ceilingH]; }", 'Woonkamer')
    check('ceiling: white, spray plaster, lowered to 2400', c == ['#FFFFFF', 'spray', 2.4], c)
    wl2 = pg.evaluate(STATS, 'Woonkamer')
    check('lower ceiling: less wall to paint', wl2['wall'] < wl['wall'] - 1, (wl2['wall'], wl['wall']))
    pg.screenshot(path=SHOTS + 'finish-room.png')

    # ── 3D ──
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500); still(pg)
    pg.wait_for_timeout(800); still(pg)
    g3 = pg.evaluate("""([fw, rid]) => { const v = window.__hp.app.panes[0].view; const out = { paper: 0, tiles: 0, ceil: null };
      v.group.traverse(o => { if (!o.isMesh) return;
        if (o.userData.wallId === fw && Array.isArray(o.material) && o.material.some(m => m.map && m.map.image && m.map.image.tagName === 'IMG')) out.paper++;
        if (o.userData.wallId && Array.isArray(o.material) && o.material.some(m => m.map && m.map.image && m.map.image.tagName === 'CANVAS' && m.roughness < 0.4)) out.tiles++;
        if (o.userData.ceiling === rid) out.ceil = o.position.y; });
      return out; }""", [fw, rid])
    check('3D: the wallpaper on the wall', g3['paper'] > 0, g3)
    check('3D: tiles on the walls', g3['tiles'] > 0, g3)
    check('3D: the lowered ceiling', g3['ceil'] is not None and near(g3['ceil'], 2.397, 0.002), g3)
    # look at the wallpaper from inside the room
    pg.evaluate("""([fw, rid]) => { const a = window.__hp.app, v = a.panes[0].view; const pl = a.shownVersion().plan; const r = pl.rooms.find(x => x.id === rid);
      const f = window.__hp.wallFaces(pl, r.storey, [r]).find(x => x.wall.id === fw); const w = f.wall; const L = Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]); const d = [(w.b[0]-w.a[0])/L, (w.b[1]-w.a[1])/L];
      const u = (f.u0 + f.u1) / 2, m = [w.a[0] + d[0]*u, w.a[1] + d[1]*u], n = [-d[1]*f.side, d[0]*f.side];
      let grp = null; v.group.traverse(o => { if (!grp && o.userData.wallId === fw) grp = o.parent; }); const g = grp.getWorldPosition(new window.__hp.THREE.Vector3());
      v.controls.target.set(g.x + m[0], g.y + 1.2, g.z + m[1]); v.camera.position.set(g.x + m[0] + n[0]*4.2 + d[0]*1.2, g.y + 1.55, g.z + m[1] + n[1]*4.2 + d[1]*1.2); v.controls.update(); v.needs = true; }""", [fw, rid])
    pg.wait_for_timeout(1200); still(pg)
    pg.screenshot(path=SHOTS + 'finish-3d-paper.png')
    # tap a wall in 3D: that room opens with the wall
    hit = pg.evaluate("""() => { const v = window.__hp.app.panes[0].view; const r = v.renderer.domElement.getBoundingClientRect();
      for (let y = r.top + r.height * 0.3; y < r.bottom - 30; y += 12) for (let x = r.left + 30; x < r.right - 30; x += 12) { const h = v.firstHit({ clientX: x, clientY: y });
        if (h && h.object.userData.wallId) { const f = v.faceFromHit(h); if (f) return [x, y, f.id, f.face]; } } return null; }""")
    if hit:
        pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(300)
        pg.mouse.click(hit[0], hit[1]); pg.wait_for_timeout(1200)
        sel = pg.evaluate("() => window.__hp.app.selection")
        check('3D: tapping a wall opens its room with that wall', sel and sel.get('type') == 'room' and sel.get('id') == hit[2] and sel.get('face') == hit[3] and pg.is_visible('.face-edit'), (sel, hit))
    else:
        check('3D: a wall to tap', False, 'no wall found')
    # the toilet in 3D
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(900)

    # ── changes between versions ──
    pg.click('#display-toggle button[data-mode="diff"]'); pg.wait_for_timeout(1200)
    ch = pg.evaluate("() => { const d = window.__hp.app.currentDiff; return d ? d.rooms.changed.flatMap(c => c.changes.map(x => c.room.name + ':' + x.field)) : []; }")
    check('Changes: the own wall finishes, tiles and ceiling', 'Woonkamer:Walls with their own finish' in ch and 'Woonkamer:Ceiling height' in ch and 'Keuken:Wall tiles' in ch, ch)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    # colour rooms by walls: every wall in its finish
    pg.evaluate("() => { window.__hp.app.settings.colorBy = 'walls'; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(800)
    nb = pg.evaluate("() => [document.querySelectorAll('.fin-band').length, document.querySelectorAll('.fin-ticks').length]")
    check('"Colour rooms by walls": bands along the walls, tiles with joints', nb[0] > 20 and nb[1] >= 4, nb)
    pg.screenshot(path=SHOTS + 'finish-walls-2d.png')
    pg.evaluate("() => { window.__hp.app.settings.colorBy = 'floor'; window.__hp.Settings.save(); }")

    # ── kept in the house file ──
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    pr = json.loads(text)['projects'][0]['project']
    v = next(x for x in pr['versions'] if x['id'] == pg.evaluate("() => window.__hp.app.shownVersion().id"))
    check('in the house file: pictures, wall finishes, tiles, ceiling', pg.evaluate("ks => ks.filter(k => !window.__hp.ownId(k)).length", list(pr['images'])) == 2 and sum(1 for w in v['plan']['walls'] if w.get('fin')) >= 3 and any(r.get('ceilingH') == 2.4 for r in v['plan']['rooms']))
    pr['id'] = 'p_finish_copy'; pr['name'] = 'Finish copy'
    path = SHOTS + 'finish.house.json'
    open(path, 'w').write(json.dumps({**json.loads(text), 'projects': [{**json.loads(text)['projects'][0], 'project': pr}]}))
    with pg.expect_file_chooser() as fc:
        pg.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(path); pg.wait_for_timeout(5000)
    got = pg.evaluate("() => { const p = window.__hp.app.project; const v = p.versions.find(x => x.plan.walls.some(w => w.fin)); return [p.name, Object.keys(p.images || {}).filter(k => !window.__hp.ownId(k)).length, v ? v.plan.walls.filter(w => w.fin).length : 0]; }")
    check('after import: everything is back', got[0] == 'Finish copy' and got[1] == 2 and got[2] >= 3, got)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

with sync_playwright() as p:
    run(p)
    run(p, phone=True, theme='dark')
sys.exit(summary())
