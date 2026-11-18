"""Task 0043: the plan's floor pattern follows the tile start. The pattern of a tiled floor in the 2D plan is laid on the
floor layout's grid (origin, period with the joint, turn): the plan's joint lines are read from the pattern's own SVG
matrix and compared with floorTileLayout() (within 1 mm) for centre, a corner, the door line and a shift; two rooms with
the same tiles keep their own start; planks keep the old pattern. Also: on a turned phone the handle folds the side by
side bars again. PC (light) and phone (dark)."""
from common import *

ROOM = "(n) => { const a = window.__hp.app; return a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); }"
# the largest distance (mm) between the plan pattern's joint lines and the layout grid's, and the pattern's fill
JOINTS = """(n) => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan, r = (""" + ROOM + """)(n);
  const lay = H.floorTileLayout(pl, r); if (!lay) return null;
  const poly = [...document.querySelectorAll('.plan-svg polygon, .plan-svg path')].find(e => e.getAttribute('data-room') === r.id && /url\\(#fp-/.test(e.getAttribute('fill') || ''));
  if (!poly) return { nofill: true };
  const id = poly.getAttribute('fill').match(/#([^)]+)/)[1], pat = document.getElementById(id);
  const M = pat.patternTransform.baseVal.consolidate().matrix, G = lay.G, F = lay.F;
  // the pattern's tile corners (k, m whole tiles) in the plan → the layout's frame → against the grid line positions
  const mod = (x, m) => ((x % m) + m) % m, wrap = (x, m) => { const q = mod(x, m); return Math.min(q, m - q); };
  let worst = 0;
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [3, 2], [-2, 5]]) {
    const px = M.a * i * F.l + M.c * j * F.w + M.e, py = M.b * i * F.l + M.d * j * F.w + M.f;
    const [lu, lv] = lay.toL([px, py]);
    worst = Math.max(worst, wrap(lu - (G.ou - 0.0015), G.MU), wrap(lv - (G.ov - 0.0015), G.MV));
  }
  return { id, worst: worst * 1000, fill: poly.getAttribute('fill') }; }"""
SET_FLOOR = "([n, S]) => { const a = window.__hp.app, rr = (" + ROOM + ")(n); a.mutate(pl => { const q = pl.rooms.find(x => x.id === rr.id); if (S) q.floor.start = S; else delete q.floor.start; }, { keepInspector: true }); return true; }"


def pc_phone(p, phone):
    tag = 'phone' if phone else 'pc'
    b, pg = open_app(p, phone=phone, theme='dark' if phone else 'light')
    open_example(pg)
    if not phone:
        pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(400)
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(600)
    # which room: the first tiled one that has a layout
    name = pg.evaluate("() => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan; const r = pl.rooms.find(r => r.storey === a.view.storeyId && r.floor && H.floorTileLayout(pl, r)); return r && r.name; }")
    check(f'{tag}: the example has a tiled floor on this storey', bool(name), name)
    for label, S in [('centre', None), ('corner top left', {'at': 'nw'}), ('corner bottom right', {'at': 'se'}),
                     ('shifted 100 / 37 mm', {'at': 'nw', 'dx': 0.1, 'dy': 0.037})] + ([] if phone else [('door line', 'door')]):
        if S == 'door':
            S = pg.evaluate("([n]) => { const H = window.__hp, a = H.app, pl = a.shownVersion().plan; const c = H.floorStartChoices(pl, (" + ROOM + ")(n)).find(x => x.S.at === 'door'); return c && c.S; }", [name])
            if not S: continue
        pg.evaluate(SET_FLOOR, [name, S]); pg.wait_for_timeout(500)
        r = pg.evaluate(JOINTS, name)
        check(f'{tag}: plan floor, {label}: the pattern joints lie on the layout grid (within 1 mm)', r and r.get('worst') is not None and r['worst'] < 1.0, r)
    # a floor that runs top–bottom (turned layout frame)
    pg.evaluate("([n]) => { const a = window.__hp.app, rr = (" + ROOM + ")(n); a.mutate(pl => { const q = pl.rooms.find(x => x.id === rr.id); q.floor.dir = 90; }, { keepInspector: true }); }", [name])
    for label, S in [('turned, centre', None), ('turned, corner bottom right', {'at': 'se'})]:
        pg.evaluate(SET_FLOOR, [name, S]); pg.wait_for_timeout(500)
        r = pg.evaluate(JOINTS, name)
        check(f'{tag}: plan floor, {label}: the pattern joints lie on the layout grid (within 1 mm)', r and r.get('worst') is not None and r['worst'] < 1.0, r)
    pg.evaluate("([n]) => { const a = window.__hp.app, rr = (" + ROOM + ")(n); a.mutate(pl => { const q = pl.rooms.find(x => x.id === rr.id); delete q.floor.dir; }, { keepInspector: true }); }", [name])
    pg.evaluate(SET_FLOOR, [name, None]); pg.wait_for_timeout(300)
    a0 = pg.evaluate(JOINTS, name)
    pg.evaluate(SET_FLOOR, [name, {'at': 'nw'}]); pg.wait_for_timeout(300)
    a1 = pg.evaluate(JOINTS, name)
    check(f'{tag}: a chosen start gives its own pattern', a0 and a1 and a0['id'] != a1['id'], (a0, a1))
    pg.evaluate(SET_FLOOR, [name, None])
    check(f'{tag}: no page errors', not pg.errors, pg.errors)
    b.close()


def bars(p):
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.tap('#btn-display'); pg.wait_for_selector('.menu .mi')
    pg.tap('.menu .mi:has-text("Side by side")'); pg.wait_for_selector('.pane-pick'); pg.wait_for_timeout(800)
    pg.set_viewport_size({'width': 844, 'height': 390}); pg.wait_for_timeout(1200)
    st = "() => { const c = document.querySelector('#editor').classList; return c.contains('bars-slim') ? 'slim' : c.contains('bars-slim-open') ? 'open' : 'other'; }"
    check('phone landscape: the bars start folded', pg.evaluate(st) == 'slim', pg.evaluate(st))
    pg.tap('#bars-pull'); pg.wait_for_timeout(500)
    check('phone landscape: the handle opens the bars', pg.evaluate(st) == 'open', pg.evaluate(st))
    vis = pg.evaluate("() => { const r = document.querySelector('#bars-pull').getBoundingClientRect(); return [r.width, r.height]; }")
    check('phone landscape: the handle stays visible and big enough to tap', vis[0] >= 40 and vis[1] >= 30, vis)
    pg.tap('#bars-pull'); pg.wait_for_timeout(500)
    check('phone landscape: tapping the handle again folds the bars', pg.evaluate(st) == 'slim', pg.evaluate(st))
    pg.tap('#bars-pull'); pg.wait_for_timeout(300); pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(800)
    check('phone turned upright: the bars are normal again', pg.evaluate(st) == 'other', pg.evaluate(st))
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()


with sync_playwright() as p:
    pc_phone(p, False)
    pc_phone(p, True)
    bars(p)
