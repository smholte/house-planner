"""The made-up example house as a show house (task 0044), and attic rooms under a sloping roof.

1. Attic rooms under the roof slopes get no flat ceiling in 3D, also when the slope is one long plane whose corners all
   lie outside the room (the made-up house's roof): the flat ceiling stuck out through the slopes before.
2. The version the example opens on (Plan – study) is furnished and planted: the living room, the study, the island's
   stools, a table and chairs on the terrace, a car on the parking place; planting in front of the house and along the
   back fence; an accent wall behind the TV.
PC light and phone dark.
"""
from common import *

CEILS = """() => { const v = window.__hp.app.panes[0].view, out = []; v.scene.traverse(o => { if (o.userData && o.userData.ceiling) out.push(o.userData.ceiling); });
  const a = window.__hp.app, plan = a.shownVersion().plan, top = a.project.storeys[a.project.storeys.length - 1].id;
  return { attic: plan.rooms.filter(r => r.storey === top && !r.storage).map(r => r.id), ceil: out }; }"""
# the lowest point of the roof's underside over each attic room vs. the room's ceiling height (the roof comes lower)
ROOF = """() => { const a = window.__hp.app, v = a.panes[0].view, plan = a.shownVersion().plan, top = a.project.storeys[a.project.storeys.length - 1];
  const F = v.roofCeiling(top.id); if (!F) return null;
  return plan.rooms.filter(r => r.storey === top.id && !r.storage).map(r => { const xs = r.poly.map(q => q[0]), zs = r.poly.map(q => q[1]), b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...zs), maxY: Math.max(...zs) }; let lo = Infinity;
    for (let x = b.minX + 0.2; x <= b.maxX - 0.2; x += 0.25) for (let z = b.minY + 0.2; z <= b.maxY - 0.2; z += 0.25) { const y = F.at(x, z); if (y != null && y > 0.3) lo = Math.min(lo, y); }
    return [r.name, +lo.toFixed(2), r.ceilingH || top.wallHeight]; }); }"""
SHOW = """() => { const a = window.__hp.app, p = a.project, v = a.shownVersion(), L = a.activeLayout(), g = v.plan.garden;
  const models = L.items.filter(f => f.model).map(f => f.model);
  const living = v.plan.rooms.find(r => r.name === 'Woonkamer');
  return { version: v.name, layout: L.name, n: L.items.length, models, types: L.items.map(f => f.type),
    beds: g.areas.filter(x => x.kind === 'planting').length, plants: g.plants.length, kinds: [...new Set(g.plants.map(x => x.kind))],
    accent: v.plan.walls.some(w => w.fin && w.fin[living.id] && w.fin[living.id].color) }; }"""


def to_3d(pg):
    pg.evaluate("() => { const a = window.__hp.app; a.setMode('view'); a.setDim('3d'); a.settings.light = 'day'; a.setScope('house'); a.refreshViews(false); }")
    pg.wait_for_timeout(5000); still(pg)


def checks(pg, tag):
    if not is_testhouse(pg):
        print('  (not the made-up house: skipped)'); return
    to_3d(pg)
    roof = pg.evaluate(ROOF)
    check(f'{tag}: the roof comes down below the ceiling height inside the attic rooms (the case of this test)', roof and all(lo < ch for _, lo, ch in roof), roof)
    c = pg.evaluate(CEILS)
    check(f'{tag}: no flat ceiling in the attic rooms under the slopes (it stuck out through the roof)', c['attic'] and not set(c['attic']) & set(c['ceil']), c)
    check(f'{tag}: the storeys below still have their ceilings', len(c['ceil']) >= 8, len(c['ceil']))
    s = pg.evaluate(SHOW)
    check(f'{tag}: the example opens on Plan – study with Layout 1', s['version'] == 'Plan – study' and s['layout'] == 'Layout 1', s)
    check(f'{tag}: the living room has a rug, a TV, a floor lamp, a sideboard and plants', all(t in s['types'] for t in ('rug', 'tv', 'floorlamp', 'sideboard', 'pendant', 'stool', 'car')) and 'k:pottedPlant' in s['models'], s['types'])
    check(f'{tag}: a table and four chairs on the terrace (library models)', s['models'].count('k:chairRounded') == 4 and 'k:tableRound' in s['models'], s['models'])
    check(f'{tag}: planting in front of the house and along the back fence, small trees and grasses', s['beds'] >= 4 and {'small', 'grass', 'shrub', 'pot', 'tree'} <= set(s['kinds']), s)
    check(f'{tag}: an accent wall behind the TV', s['accent'])
    check(f'{tag}: no JavaScript errors', not pg.errors, pg.errors[:3])


with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    checks(pg, 'PC')
    pg.screenshot(path=SHOTS + 'example-house-pc.png')
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    checks(pg, 'phone dark')
    pg.screenshot(path=SHOTS + 'example-house-phone.png')
    b.close()

sys.exit(summary())
