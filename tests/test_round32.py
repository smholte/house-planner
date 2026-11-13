"""Thirty-second round (2 Nov, night): the site in parts you switch on and off. View → Show has Garden (your plot and what is
on it), Street (roads, pavements, street trees, the bridge's railings), Neighbours (the houses around) and Water & park (the
canals, quays, reeds and the park), next to Furniture, Notes, Electrics and Ceiling – four a row. Each switches only its
own part, in 3D and in 2D; the garden off leaves the plot as plain grass. A device or a file with Garden off (when it
switched everything) keeps all of it off until a part is switched. PC (light) and phone (dark)."""
from common import *

READY = "() => window.__hp && window.__hp.TEXLIB.ready"
V = "window.__hp.app.panes.find(p => p.kind === '3d').view"
# what the 3D view has of the site: per part a count of meshes (by what they are made of / tagged)
PARTS = """() => { const v = %s, G = v.group.children.find(c => c.userData.garden); if (!G) return null;
  const out = { meshes: 0, houses: 0, water: 0, streets: 0, gardenPicks: 0, plot: 0, trees: 0 };
  G.traverse(o => { if (!o.isMesh) return; out.meshes++; const u = o.userData || {}, m = o.material && !Array.isArray(o.material) ? o.material : null;
    if (u.around) out.houses++; if (u.water) out.water++; if (u.garea || u.gline || u.plant) out.gardenPicks++; if (u.plot) out.plot++;
    if (m && m.userData && (m.userData.lib === 'Asphalt033' || /^g\\|road|^g\\|path/.test(m.userData.key || ''))) out.streets++; });
  return out; }""" % V
SHOW = "() => [...document.querySelectorAll('.show-row .show-btn')].map(b => [b.id.replace('show-', ''), b.textContent.trim(), b.getAttribute('aria-pressed')])"

def open_view(pg):
    pg.click('#btn-viewopts'); pg.wait_for_selector('.show-row', timeout=10000); pg.wait_for_timeout(300)

def flip(pg, key, phone=False):
    open_view(pg)
    (pg.tap if phone else pg.click)('#show-' + key); pg.wait_for_timeout(400)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(3500)
    if pg.evaluate("() => window.__hp.app.view.dim") == '3d': still(pg)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.setScope('house'); a.setMode('view'); a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(9000); still(pg)
    open_view(pg)
    row = pg.evaluate(SHOW)
    check('View → Show: Garden, Street, Neighbours, Water & park, then Furniture, Notes, Electrics, Ceiling – all on', [r[0] for r in row] == ['garden', 'street', 'houses', 'park', 'furniture', 'notesOn', 'installs', 'ceilItems'] and all(r[2] == 'true' for r in row), row)
    cols = pg.evaluate("() => getComputedStyle(document.querySelector('.show-row')).gridTemplateColumns.split(' ').length")
    check('… four a row', cols == 4, cols)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    a0 = pg.evaluate(PARTS)
    check('everything on: the houses around, the water, the garden, the plot', a0 and a0['houses'] > 0 and a0['water'] > 0 and a0['gardenPicks'] > 0 and a0['plot'] == 1, a0)
    pg.screenshot(path=SHOTS + 'r32-all.png')
    # Neighbours off: only the houses go
    flip(pg, 'houses')
    a1 = pg.evaluate(PARTS)
    check('Neighbours off: the houses around gone, the rest stays (water, garden)', a1 and a1['houses'] == 0 and a1['water'] == a0['water'] and a1['gardenPicks'] == a0['gardenPicks'], (a0, a1))
    # Water & park off
    flip(pg, 'park')
    a2 = pg.evaluate(PARTS)
    check('Water & park off: no water, the garden still there', a2 and a2['water'] == 0 and a2['gardenPicks'] == a0['gardenPicks'], a2)
    # Street off
    st0 = pg.evaluate("() => { let n = 0; const v = %s; v.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'ExtrudeGeometry' && !o.userData.plot) n++; }); return n; }" % V)
    flip(pg, 'street')
    st1 = pg.evaluate("() => { let n = 0; const v = %s; v.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'ExtrudeGeometry' && !o.userData.plot) n++; }); return n; }" % V)
    check('Street off: the roads and pavements gone (fewer street slabs)', st1 < st0, (st0, st1))
    pg.screenshot(path=SHOTS + 'r32-garden-only.png')
    # Garden off (the others already off): the site still shows the plot, as plain grass, nothing on it
    flip(pg, 'garden')
    a3 = pg.evaluate(PARTS)
    check('all four off: no site at all (the house on its own ground, as before)', a3 is None, a3)
    flip(pg, 'houses')
    a4 = pg.evaluate(PARTS)
    check('only Neighbours on: the houses around, the plot plain (nothing of the garden on it), no water', a4 and a4['houses'] > 0 and a4['gardenPicks'] == 0 and a4['plot'] == 1 and a4['water'] == 0, a4)
    pg.screenshot(path=SHOTS + 'r32-houses-only.png')
    # 2D: the same parts
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('2d'); a.setScope('storey', a.project.storeys.find(s => s.name === 'Begane grond').id); }"); pg.wait_for_timeout(2500)
    d2 = pg.evaluate("() => ({ houses: document.querySelectorAll('.garden .g-nbhouse').length, streets: document.querySelectorAll('.garden .g-street').length, canal: document.querySelectorAll('.garden .g-canal').length, areas: document.querySelectorAll('.garden .g-area').length, plotOff: !!document.querySelector('.garden .g-plot-off') })")
    check('2D likewise: the houses around drawn, no streets, no canal, the garden not drawn (the plot plain)', d2['houses'] > 0 and d2['streets'] == 0 and d2['canal'] == 0 and d2['areas'] == 0 and d2['plotOff'], d2)
    for k in ('garden', 'street', 'park'): flip(pg, k)
    d3 = pg.evaluate("() => ({ houses: document.querySelectorAll('.garden .g-nbhouse').length, streets: document.querySelectorAll('.garden .g-street').length, canal: document.querySelectorAll('.garden .g-canal').length, areas: document.querySelectorAll('.garden .g-area').length })")
    check('… all on again: everything drawn in 2D', d3['houses'] > 0 and d3['streets'] > 0 and d3['canal'] > 0 and d3['areas'] > 0, d3)
    st = pg.evaluate("() => ['garden', 'street', 'houses', 'park'].map(k => window.__hp.app.settings[k])")
    check('… kept as settings', st == [True, True, True, True], st)
    # an older setting: Garden off switched everything – the other parts follow it until one is switched
    pg.evaluate("() => { const S = window.__hp.Settings; S.set('garden', false); for (const k of ['street', 'houses', 'park']) S.set(k, null); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(1500)
    open_view(pg)
    row = pg.evaluate(SHOW)
    check('an older setting (Garden off, the parts not set): all four off', [r[2] for r in row[:4]] == ['false'] * 4, row[:4])
    pg.click('#show-street'); pg.wait_for_timeout(400)
    row = pg.evaluate(SHOW)
    check('… switching Street on: only the street on, the others stay off', [r[2] for r in row[:4]] == ['false', 'true', 'false', 'false'], row[:4])
    pg.keyboard.press('Escape')
    pg.evaluate("() => { const S = window.__hp.Settings; for (const k of ['garden', 'street', 'houses', 'park']) S.set(k, true); window.__hp.app.refreshViews(false); }")
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    pg.wait_for_function(READY, timeout=60000)
    open_example(pg)
    pg.evaluate("() => { const a = window.__hp.app; a.setDim('3d'); a.settings.light = 'day'; a.refreshViews(false); }"); pg.wait_for_timeout(9000); still(pg)
    open_view(pg)
    fit = pg.evaluate("() => { const r = document.querySelector('.show-row').getBoundingClientRect(), bs = [...document.querySelectorAll('.show-row .show-btn')].map(b => b.getBoundingClientRect()); return [r.left >= 0 && r.right <= innerWidth, Math.min(...bs.map(x => x.height)), Math.min(...bs.map(x => x.width)), [...document.querySelectorAll('.show-row .show-btn span')].every(s => s.scrollWidth <= s.clientWidth + 1)]; }")
    check('phone: the eight buttons fit, big enough to tap, the names not cut off', fit[0] and fit[1] >= 44 and fit[2] >= 60 and fit[3], fit)
    pg.screenshot(path=SHOTS + 'r32-phone-menu.png')
    pg.tap('#show-houses'); pg.wait_for_timeout(400); pg.keyboard.press('Escape'); pg.wait_for_timeout(3500); still(pg)
    ph = pg.evaluate(PARTS)
    check('phone: Neighbours off – the houses gone', ph and ph['houses'] == 0, ph)
    pg.evaluate("() => window.__hp.Settings.set('houses', true)")
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
