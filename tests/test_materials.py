"""Better materials: a floor laid as planks, wide planks, herringbone or chevron (wood, laminate, PVC) or straight,
half bond, a third offset or herringbone (tiles, stone), with its size, direction, wood tone and grout colour; the
pattern in the plan and at true size in 3D; paint sheen (matt / satin / gloss) and renovlies in 3D; Changes and the
quantities (herringbone needs 5 % more); kept in the house file; phone."""
from common import *
import math

ROOM = "(n) => window.__hp.app.shownVersion().plan.rooms.find(r => r.name === n)"
def floor(pg, n): return pg.evaluate(f"(n) => ({ROOM})(n).floor", n)
def select_room(pg, name):
    pg.evaluate("(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n); a.selection = { type: 'room', id: r.id, storey: r.storey }; a.renderInspector(); a.refreshViews(false); }", name); pg.wait_for_timeout(500)
def type_mm(pg, sel, v):
    pg.fill(sel, str(v)); pg.press(sel, 'Enter'); pg.wait_for_timeout(500)
FLOOR3D = """(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n); let m = null;
  a.panes[0].view.scene.traverse(o => { if (o.isMesh && o.userData && o.userData.roomId === r.id && o.material && o.material.map) m = o; });
  return m ? { rot: m.material.map.rotation, rx: m.material.map.repeat.x, ry: m.material.map.repeat.y, w: m.material.map.image.width, rough: m.material.roughness } : null; }"""
WALLMATS = """(hex) => { const out = []; const c = hex.toLowerCase(); window.__hp.app.panes[0].view.scene.traverse(o => { if (!o.isMesh) return;
  for (const m of [].concat(o.material)) if (m && m.color && '#' + m.color.getHexString() === c) out.push([m.roughness, !!m.map]); }); return out; }"""

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    KM = by_house(pg, 'Woonkamer', 'Kamer')   # the room whose wood floor is changed
    # (since round 38 your PVC floor lies in every room: here the oak and tiles the example had before, to change)
    pg.evaluate("""() => { const a = window.__hp.app; for (const r of a.shownVersion().plan.rooms) {
      if (r.name === '""" + KM + """') r.floor = { material: 'oak', color: '#C49A6C' }; if (r.name === 'Keuken') r.floor = { material: 'tiles', color: '#9A9488' }; } a.refreshViews(false); }""")
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(500)
    select_room(pg, KM)
    check('a wood floor offers planks, wide planks, herringbone and chevron', pg.evaluate("() => [...document.querySelectorAll('.floor-pat button')].map(b => b.dataset.k)") == ['plank', 'wide', 'herringbone', 'chevron'])
    pg.click('.floor-pat button[data-k="herringbone"]'); pg.wait_for_timeout(600)
    f = floor(pg, KM)
    check('herringbone chosen, with its plank size 600 × 100', f.get('pattern') == 'herringbone' and pg.input_value('#f-floor-l') == '600' and pg.input_value('#f-floor-w') == '100', f)
    fill = pg.evaluate("(n) => { const r = (" + ROOM + ")(n); const el = document.querySelector(`.room[data-room='${r.id}']`); const id = el.getAttribute('fill').slice(5, -1); const pat = document.getElementById(id); return [el.getAttribute('fill'), pat && pat.getAttribute('patternTransform'), pat && pat.querySelector('path').getAttribute('d').length]; }", KM)
    check('the plan shows the herringbone pattern (turned 45°)', fill[0].startswith('url(#fp-') and fill[1] == 'rotate(45)' and fill[2] > 200, fill)
    type_mm(pg, '#f-floor-l', 700); type_mm(pg, '#f-floor-w', 140)
    f = floor(pg, KM)
    check('plank size typed (700 × 140)', abs(f.get('l', 0) - 0.7) < 1e-6 and abs(f.get('w', 0) - 0.14) < 1e-6, f)
    pg.click('.floor-dir button[data-k="90"]'); pg.wait_for_timeout(500)
    f = floor(pg, KM)
    check('direction top–bottom', f.get('dir') == 90 and 'rotate(135)' in pg.evaluate("(n) => { const r = (" + ROOM + ")(n); const id = document.querySelector(`.room[data-room='${r.id}']`).getAttribute('fill').slice(5, -1); return document.getElementById(id).getAttribute('patternTransform'); }", KM))
    pg.click('.wood-tones button:has-text("Walnut")'); pg.wait_for_timeout(500)
    check('a wood tone sets the colour (walnut)', floor(pg, KM)['color'].lower() == '#6b4a35')
    # tiles
    select_room(pg, 'Keuken')
    check('a tiled floor offers straight, half bond, third offset and herringbone', pg.evaluate("() => [...document.querySelectorAll('.floor-pat button')].map(b => b.dataset.k)") == ['grid', 'half', 'third', 'herringbone'])
    pg.click('.floor-pat button[data-k="half"]'); pg.wait_for_timeout(400)
    pg.click('.floor-sizes button[data-k="600x300"]'); pg.wait_for_timeout(400)
    pg.evaluate("() => { const g = document.querySelector('#f-floor-grout'); g.value = '#333333'; g.dispatchEvent(new Event('input', { bubbles: true })); }"); pg.wait_for_timeout(500)
    f = floor(pg, 'Keuken')
    check('tiles in half bond, 600 × 300, dark grout', f.get('pattern') == 'half' and abs(f['l'] - 0.6) < 1e-6 and abs(f['w'] - 0.3) < 1e-6 and f.get('grout') == '#333333', f)
    # sheen and renovlies
    wall = pg.evaluate("(n) => { const r = (" + ROOM + ")(n); return r.wallColor || '#EDEBE6'; }", 'Keuken')
    pg.click('.sheen-seg button[data-k="satin"]'); pg.wait_for_timeout(500)
    check('paint sheen: satin', pg.evaluate("(n) => (" + ROOM + ")(n).wallSheen", 'Keuken') == 'satin')
    pg.screenshot(path=SHOTS + 'materials-pc.png')
    # 3D
    pg.click('button:has-text("3D")'); pg.wait_for_timeout(3500)
    m = pg.evaluate(FLOOR3D, KM)
    lay = pg.evaluate("() => window.__hp.floorLayout(window.__hp.floorSpec({ material: 'oak', pattern: 'herringbone', l: 0.7, w: 0.14 }))")
    check('3D: the herringbone floor as a texture at true size, turned (45° + 90°)', m and abs(m['rx'] - 1 / lay['pw']) < 1e-6 and abs(abs(m['rot']) - math.radians(135)) < 1e-6, (m, lay['pw']))
    k = pg.evaluate(FLOOR3D, 'Keuken')
    check('3D: half-bond tiles, one period 600 × 600 mm', k and abs(k['rx'] - 1 / 0.6) < 1e-6 and abs(k['ry'] - 1 / 0.6) < 1e-6, k)
    wm = pg.evaluate(WALLMATS, wall)
    check('3D: satin walls are shinier (roughness 0.5)', any(abs(r - 0.5) < 1e-6 for r, _ in wm), wm[:4])
    pg.click('button:has-text("2D")'); pg.wait_for_timeout(800)
    select_room(pg, 'Keuken')
    pg.click('.cover-seg button[data-k="renovlies"]'); pg.wait_for_timeout(500)
    pg.click('button:has-text("3D")'); pg.wait_for_timeout(3500)
    wm = pg.evaluate(WALLMATS, wall)
    check('3D: renovlies has its woven texture', any(has_map for _, has_map in wm), wm[:4])
    pg.screenshot(path=SHOTS + 'materials-3d.png')
    pg.click('button:has-text("2D")'); pg.wait_for_timeout(800)
    # Changes: the same material, another pattern
    ch = pg.evaluate("""() => { const H = window.__hp, a = H.app, v = a.shownVersion(); const A = JSON.parse(JSON.stringify(v.plan)), B = JSON.parse(JSON.stringify(v.plan));
      const r = A.rooms.find(r => r.name === '""" + KM + """'); r.floor.pattern = 'plank'; delete r.floor.l; delete r.floor.w; delete r.floor.dir;
      const d = H.diffPlans(A, B); const c = d.rooms.changed.find(c => c.room.name === '""" + KM + """'); return c ? c.changes.map(x => [x.field, x.from, x.to]) : []; }""")
    check('Changes: “Floor pattern” planks → herringbone', any(x[0] == 'Floor pattern' and 'Planks' in x[1] and 'Herringbone' in x[2] for x in ch), ch)
    q = pg.evaluate("() => { const a = window.__hp.app; const Q = window.__hp.houseQuantities(a.project, a.shownVersion().plan); return Q.materials ? Q.materials.filter(m => m.group === 'floor').map(m => [m.what, m.detail]) : null; }")
    check('quantities: the herringbone floor on its own line, 5 % more cutting', q and any('Herringbone' in w and '15 %' in d for w, d in q), q)
    # kept in the house file
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    d = json.loads(text); pr = d['projects'][0]['project']
    v = next(x for x in pr['versions'] if any(r['name'] == KM and r['floor'].get('pattern') == 'herringbone' for r in x['plan']['rooms']))
    kr = next(r for r in v['plan']['rooms'] if r['name'] == 'Keuken')
    check('in the house file: pattern, size, direction, grout and sheen', kr['floor'].get('pattern') == 'half' and kr.get('wallSheen') == 'satin' and kr.get('wallBase') == 'renovlies')
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(500)
    lp = pg.evaluate("(n) => { const r = (" + ROOM + ")(n); return window.__hp.labelPoint(r.poly, []); }", 'Woonkamer')
    x, y = to_screen(pg, lp[0], lp[1] + 0.25)
    pg.touchscreen.tap(x, y); pg.wait_for_timeout(800)
    pg.evaluate("() => { const el = document.querySelector('.floor-pat'); el && el.scrollIntoView({ block: 'center' }); }"); pg.wait_for_timeout(400)
    pg.tap('.floor-pat button[data-k="chevron"]'); pg.wait_for_timeout(600)
    check('phone: chevron chosen by touch', floor(pg, 'Woonkamer').get('pattern') == 'chevron')
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'materials-phone.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
