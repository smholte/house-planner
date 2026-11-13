"""Drawings: the four façades and sections as flat 2D drawings (true sizes, a scale bar, floor levels and a title),
in colour or as lines; sections across and lengthwise at a place you choose, and from any slice made in 3D;
saved as a picture or printed to scale. Façade changes show in the drawings. PC and phone, light and dark."""
from common import *

STATS = """(sel) => { const c = document.querySelector(sel); if (!c) return null; const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
  let dark = 0, black = 0, red = 0, white = 0, hsh = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r + gg + b < 240) dark++; if (r + gg + b < 90) black++; if (r > 90 && r > gg * 1.35 && r > b * 1.45) red++; if (r > 245 && gg > 245 && b > 245) white++;
    if ((i >> 2) % 7 === 0) hsh = (hsh * 31 + r + gg * 7 + b * 13) % 1000000007; }
  return { w: c.width, h: c.height, dark, black, red, white, n: c.width * c.height, hash: hsh }; }"""
CANVAS = '.draw-canvas'
WAIT = "() => !document.querySelector('.draw-view.busy') && !!document.querySelector('.draw-canvas')"

def pick(pg, key):
    pg.click(f'.draw-tabs button[data-k="{key}"]')
    pg.wait_for_function(f"() => !document.querySelector('.draw-view.busy') && !!document.querySelector('.draw-canvas[data-key=\"{key}\"]')", timeout=60000)
    pg.wait_for_timeout(150)
    return pg.evaluate(STATS, CANVAS)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(600)
    # a slice in 3D (whole house): kept with the house, offered as a section
    # (a slice across the middle of the house: 3D x = plan x, z = plan y)
    pg.evaluate("""() => { const H = window.__hp, a = H.app; a.setScope('house'); const k = a.project.id + '|house|';
      const W = a.shownVersion().plan.walls.flatMap(w => [w.a, w.b]), cx = (Math.min(...W.map(p => p[0])) + Math.max(...W.map(p => p[0]))) / 2, cz = (Math.min(...W.map(p => p[1])) + Math.max(...W.map(p => p[1]))) / 2, c = [cx, 1.5, cz];
      H.SLICE.sets.set(k, [H.sliceFromJSON({ num: 1, angle: 0, size: 12, n: [0, 0, -1], n0: [0, 0, -1], q: c, p0: c, axis: [1, 0, 0], center: c })]); a.persistSlices(k, H.SLICE.sets.get(k)); }""")
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500); still(pg)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v._sliceSig = null; v.renderSliceList(); v.reclipAll(); }"); pg.wait_for_timeout(300)
    check('3D: the slice has a button for its section drawing', pg.is_visible('.slice-list .sl-draw'))
    # from the menu
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    pg.click('.menu button:has-text("Drawings")')
    pg.wait_for_function(WAIT, timeout=60000)
    check('the Drawings window opens on the front', pg.is_visible('.dialog .drawings') and pg.get_attribute('.draw-tabs button[aria-pressed="true"]', 'data-k') == 'front')
    tabs = pg.evaluate("() => [...document.querySelectorAll('.draw-tabs button')].map(b => b.textContent)")
    check('four façades, two sections and the slice', tabs[:6] == ['Front', 'Back', 'Left side', 'Right side', 'Section A–A', 'Section B–B'] and any('Slice 1' in x for x in tabs), tabs)
    S = {}
    S['front'] = pg.evaluate(STATS, CANVAS)
    for k in ['back', 'left', 'right']: S[k] = pick(pg, k)
    check('each façade is drawn (house, not an empty sheet)', all(s and s['dark'] > s['n'] * 0.05 for s in S.values()), {k: (v['dark'], v['n']) for k, v in S.items()})
    check('front and back differ, as do left and right', S['front']['hash'] != S['back']['hash'] and S['left']['hash'] != S['right']['hash'])
    check('the façades show the brick in colour', S['front']['red'] > S['front']['n'] * 0.01, S['front']['red'])
    # true sizes: the owner's house is 18.3 m wide and 14.3 m deep (front wider than the side); the made-up one 8.7 × 10.3 m
    D = pg.evaluate("""() => { const a = window.__hp.app; const L = a.drawingList(); const out = {}; for (const k of ['front', 'right', 'secA']) { const d = a.makeDrawing(L.find(x => x.key === k), { style: 'colour', pos: 0.5 }); out[k] = { ppm: d.ppm, w: d.widthM, h: d.heightM, levels: d.levels }; } return out; }""")
    WR = by_house(pg, dict(front=(8.5, 14), right=(10, 15)), dict(front=(18, 26), right=(14, D['front']['w'])))
    check('true sizes: one scale for the width and the height', all(WR[k][0] < D[k]['w'] < WR[k][1] for k in WR), (WR, D))
    lv = D['front']['levels']
    el = pg.evaluate("() => window.__hp.app.project.storeys.map(s => s.elevation)")
    check(f'floor levels: peil, the storeys ({el}) and the top', 0.0 in lv and all(any(abs(x - e) < 0.01 for x in lv) for e in el) and max(lv) > max(el) + 3, lv)
    pg.screenshot(path=SHOTS + 'drawings-right.png')
    # sections across, moved along the house
    s1 = pick(pg, 'secA')
    n1 = pg.evaluate("() => document.querySelector('.draw-canvas') && window.__hp.app._drawSt.pos.secA")
    check('section A–A: drawn with the cut parts filled dark', s1['black'] > 500, s1['black'])
    pg.evaluate("() => { const r = document.querySelector('.draw-pos input'); r.value = '25'; r.dispatchEvent(new Event('change')); }")
    pg.wait_for_function(WAIT, timeout=60000); pg.wait_for_timeout(200)
    s2 = pg.evaluate(STATS, CANVAS)
    check('moving the cut changes the section', s2['hash'] != s1['hash'] and abs(pg.evaluate("() => window.__hp.app._drawSt.pos.secA") - 0.25) < 0.001)
    sb = pick(pg, 'secB')
    check('section B–B (lengthwise)', sb['black'] > 500 and sb['hash'] != s2['hash'])
    # lines
    pg.click('.draw-style button[data-k="lines"]'); pg.wait_for_function(WAIT, timeout=60000); pg.wait_for_timeout(200)
    sl = pg.evaluate(STATS, CANVAS)
    check('as a line drawing: white with dark lines, no colour', sl['white'] > sl['n'] * 0.6 and sl['red'] < sl['n'] * 0.002 and sl['dark'] > 2000, (sl['white'] / sl['n'], sl['red'], sl['dark']))
    pg.screenshot(path=SHOTS + 'drawings-section-lines.png')
    # the slice
    key = pg.evaluate("() => [...document.querySelectorAll('.draw-tabs button')].find(b => /Slice 1/.test(b.textContent)).dataset.k")
    ss = pick(pg, key)
    check('the slice as a section drawing', ss and ss['dark'] > 2000 and ss['hash'] not in (sl['hash'], sb['hash']), ss and ss['dark'])
    pg.click('.draw-style button[data-k="colour"]'); pg.wait_for_function(WAIT, timeout=60000)
    # save and print
    with pg.expect_download() as dl:
        pg.click('#draw-save')
    check('saved as a picture (.png)', dl.value.suggested_filename.endswith('.png'), dl.value.suggested_filename)
    pg.click('#draw-print'); pg.wait_for_timeout(800)
    doc = pg.evaluate("() => { const f = [...document.querySelectorAll('iframe.print-frame')].pop(); return f ? f.srcdoc : ''; }")
    import re
    m = re.search(r'width: ([\d.]+)mm', doc)
    check('a page to print, to scale on A4', '<img' in doc and 'Scale 1:' in doc and m and 100 < float(m.group(1)) <= 277, (m and m.group(1)))
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(800)
    check('closed: the hidden view is gone', pg.evaluate("() => !document.querySelector('.drawing-host')"))
    still(pg)
    check('closed: the 3D view keeps its slice', pg.evaluate("() => (window.__hp.app.panes[0].view.clipPlanes || []).length") == 1)
    # the slice button in 3D opens the drawing of that slice
    pg.click('.slice-list .sl-draw'); pg.wait_for_function(WAIT, timeout=60000)
    check('from the slice: its section drawing', pg.get_attribute('.draw-tabs button[aria-pressed="true"]', 'data-k') == key)
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(600)
    # façade changes show: widen the east window and look at the right side again
    pg.evaluate("() => { const a = window.__hp.app; a.setScope('storey', a.project.storeys[0].id); }"); pg.wait_for_timeout(800)
    before = pg.evaluate("""() => { const a = window.__hp.app; const d = a.makeDrawing(a.drawingList().find(x => x.key === 'right'), { style: 'colour' }); a.dropDrawingView(); const g = d.canvas.getContext('2d'); return Array.from(g.getImageData(0, 0, d.canvas.width, d.canvas.height).data.filter((v, i) => i % 4 === 0)).reduce((s, v) => s + v, 0); }""")
    # (a window in the right side wall)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'opening', id })", by_house(pg, 'o_hx1c0rqlk2w', 'o_yyren1hunqb')); pg.wait_for_timeout(400)
    pg.fill('#f-op-w', '2600'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    after = pg.evaluate("""() => { const a = window.__hp.app; a._dvSig = null; const d = a.makeDrawing(a.drawingList().find(x => x.key === 'right'), { style: 'colour' }); a.dropDrawingView(); const g = d.canvas.getContext('2d'); return Array.from(g.getImageData(0, 0, d.canvas.width, d.canvas.height).data.filter((v, i) => i % 4 === 0)).reduce((s, v) => s + v, 0); }""")
    check('a wider window shows in the façade drawing', before != after, (before, after))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # phone, dark
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#btn-menu'); pg.wait_for_timeout(400)
    pg.tap('.menu button:has-text("Drawings")')
    pg.wait_for_function(WAIT, timeout=60000); pg.wait_for_timeout(300)
    check('phone: the drawings open from the menu', pg.is_visible('.draw-canvas'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('.draw-canvas').getBoundingClientRect().right]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1] and vw[2] <= vw[1] + 1, vw)
    pg.tap('.draw-canvas'); pg.wait_for_timeout(300)
    z = pg.evaluate("() => { const v = document.querySelector('.draw-view'), c = v.querySelector('canvas'); return [v.classList.contains('zoom'), c.getBoundingClientRect().width > v.clientWidth + 50, v.scrollWidth > v.clientWidth]; }")
    check('phone: tap the drawing to see it full size (scrolls)', all(z), z)
    pg.tap('.draw-tabs button[data-k="secA"]'); pg.wait_for_function(WAIT, timeout=60000); pg.wait_for_timeout(200)
    check('phone: a section', pg.get_attribute('.draw-canvas', 'data-key') == 'secA' and pg.is_visible('.draw-pos input'))
    pg.screenshot(path=SHOTS + 'drawings-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
