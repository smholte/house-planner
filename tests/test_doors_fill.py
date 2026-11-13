"""Doors, openings and the garden edge (28 Oct): the builder's door and window parts are solid (their boxes face
outwards; older shells are turned at load); outside doors get a threshold under them and their frame goes on to the
inner leaf (no open cavity beside, above or under them); inside doors have handles (both sides), outside doors a
lever on the inside too; the floor runs on through an opening between two rooms; a Garden button at the top of the View menu; a house opens on its planned version. PC and phone."""
from common import *

DOOR = """(id) => { const a = window.__hp.app, v = a.shownVersion(); const o = v.plan.openings.find(x => x.id === id); const w = v.plan.walls.find(x => x.id === o.wall);
  const d = [w.b[0]-w.a[0], w.b[1]-w.a[1]]; const L = Math.hypot(...d); return { c: [w.a[0]+d[0]/L*o.pos, w.a[1]+d[1]/L*o.pos], d: [d[0]/L, d[1]/L], kind: o.kind }; }"""
# the first thing a ray straight down meets (from 0.3 m above the floor), at plan point (u along the wall, v across)
DOWN = """([c, d, u, v]) => { const T = window.__hp.THREE, view = window.__hp.app.panes[0].view; view.group.updateMatrixWorld(true);
  const n = [-d[1], d[0]]; const x = c[0] + d[0] * u + n[0] * v, z = c[1] + d[1] * u + n[1] * v;
  const rc = new T.Raycaster(new T.Vector3(x, 0.3, z), new T.Vector3(0, -1, 0), 0, 3);
  const hit = rc.intersectObject(view.group, true).find(h => (h.object.visible || h.object.userData.merged) && h.object.material && !(h.object.userData && h.object.userData.handle));
  return hit ? { y: +hit.point.y.toFixed(3), ud: Object.keys(hit.object.userData || {}).join(',') } : null; }"""
IDS = { 'front': 'o_yysh293v76q', 'kitchen': 'o_yysh2wevflo', 'berging': 'o_yyrekxgbkje', 'doorbraak': 'o_yyreikhyeph', 'inside': 'o_yyrei7wxv2l' }

def find_ids(pg):
    # the example's ids come from its build: look them up by where they are, so the test keeps working
    return pg.evaluate("""() => { const v = window.__hp.app.shownVersion(), p = window.__hp.app.project; const gf = p.storeys.slice().sort((a, b) => a.elevation - b.elevation)[0].id;
      const at = (x, y, kind) => { let best = null, bd = 0.3; for (const o of v.plan.openings) { if (o.leaf || (kind && o.kind !== kind)) continue; const w = v.plan.walls.find(q => q.id === o.wall); if (!w || w.storey !== gf) continue;
        const d = [w.b[0]-w.a[0], w.b[1]-w.a[1]]; const L = Math.hypot(...d); const c = [w.a[0]+d[0]/L*o.pos, w.a[1]+d[1]/L*o.pos]; const dd = Math.hypot(c[0]-x, c[1]-y); if (dd < bd) { bd = dd; best = o.id; } } return best; };
      // the made-up house: front door, garden doors, the passage Woonkamer – Keuken, the door Hal – Keuken (no cavity wall inside)
      if ((p.name || '').startsWith('Testhuis')) return { front: at(3.95, 10.575, 'door'), kitchen: at(6.7, 0.825, 'door'), doorbraak: at(7.1, 6.05, 'opening'), inside: at(4.95, 9.985, 'door') };
      return { front: at(7.21, 13.73, 'door'), kitchen: at(7.21, 6.57, 'door'), berging: at(14.96, 5.23, 'door'), doorbraak: at(11.25, 6.57, 'opening'), inside: at(7.29, 9.73, 'door') }; }""")
# (the owner's door in the cavity wall Kamer – Berging, his street corner and parking: house/tests/test_doors_fill_own.py)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    check('the example opens on its planned version', pg.evaluate("() => window.__hp.app.display") == 'plan' and pg.get_attribute('#display-toggle button[data-mode="plan"]', 'aria-pressed') == 'true')
    ids = find_ids(pg)
    check('the doors and openings of the example are found', all(ids.values()), ids)
    # ── the builder's door and window parts: every box faces outwards ──
    res = pg.evaluate("""() => { const sh = window.__hp.app.shell; let parts = 0, bad = 0;
      for (const list of Object.values(sh.storeys)) for (const part of list) { if (!/odoor|win/.test(part.key)) continue; parts++; if (window.__hp.outwardBoxes(part.pos, part.idx) !== part.idx) bad++; }
      return { parts, bad }; }""")
    check('solid doors and windows: the boxes of all frame, leaf, glass and handle parts face outwards', res['parts'] > 20 and res['bad'] == 0, res)
    # an old shell (inside out) is turned round when it is read
    flip = pg.evaluate("""() => { const P = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1]);
      const f = [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]; const I = []; for (const q of f) I.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      const one = new Uint16Array(I), two = new Uint16Array(I.length); for (let t = 0; t < I.length; t += 3) { two[t] = I[t]; two[t + 1] = I[t + 2]; two[t + 2] = I[t + 1]; }
      const r1 = window.__hp.outwardBoxes(P, one), r2 = window.__hp.outwardBoxes(P, two);
      const kept = (r1 === one) + (r2 === two), same = Array.from(r1).join() === Array.from(r2).join(); return [kept === 1, same]; }""")
    check('a box that faces inwards is turned round, one that faces outwards is left', flip == [True, True], flip)

    # ── 3D of the ground floor ──
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(3500); still(pg)
    cnt = pg.evaluate("() => { const o = { reveal: 0, threshold: 0, floorStrip: 0, handle: 0 }; window.__hp.app.panes[0].view.group.traverse(m => { if (!m.isMesh) return; for (const k in o) if (m.userData[k]) o[k]++; }); return o; }")
    check('3D: cavity linings, thresholds, floor strips under doors and door handles are there', cnt['reveal'] >= 1 and cnt['threshold'] >= 1 and cnt['floorStrip'] >= 2 and 10 <= cnt['handle'] <= 60, cnt)
    # front door: under it, inside the wall, the threshold (top 2 cm above the floor), not the ground
    D = pg.evaluate(DOOR, ids['front'])
    hits = [pg.evaluate(DOWN, [D['c'], D['d'], 0, v]) for v in (0.0, 0.12, 0.2, 0.3)]
    check('front door: a threshold under it all through the wall (inner leaf, cavity, brick)', all(h and abs(h['y'] - 0.02) < 0.006 for h in hits), hits)
    D = pg.evaluate(DOOR, ids['kitchen'])
    hits = [pg.evaluate(DOWN, [D['c'], D['d'], u, 0.0]) for u in (-0.6, 0, 0.6)]
    check('garden doors: threshold under them too', all(h and abs(h['y'] - 0.02) < 0.006 for h in hits), hits)
    HANDLE = "(id) => { let n = 0, hd = 0, verts = 0; const T = window.__hp.THREE; const bb = new T.Box3(); window.__hp.app.panes[0].view.group.updateMatrixWorld(true); window.__hp.app.panes[0].view.group.traverse(m => { if (m.isMesh && m.userData.door === id) { n++; if (m.userData.handle) { hd++; verts += m.geometry.attributes.position.count; bb.expandByObject(m); } } }); const sz = bb.getSize(new T.Vector3()); return [n, hd, verts, +Math.max(sz.x, sz.z).toFixed(3)]; }"
    # an opening between two rooms (owner: Kamer – Keuken; made-up: Woonkamer – Keuken): the floor runs through it
    D = pg.evaluate(DOOR, ids['doorbraak'])
    hits = [pg.evaluate(DOWN, [D['c'], D['d'], u, v]) for u in (-0.8, 0, 0.8) for v in (-0.04, 0, 0.04)]
    check('an opening between two rooms: the floor runs on through it (no gap)', all(h and abs(h['y'] - 0.002) < 0.004 for h in hits), hits)
    # an inside door: handles on both sides, and the floor runs on under it
    D = pg.evaluate(DOOR, ids['inside'])
    hd = pg.evaluate(HANDLE, ids['inside'])
    check('an inside door has a handle on both sides (lever, rose, key plate), baked into one or two meshes', 1 <= hd[1] <= 4 and hd[2] >= 300 and hd[3] > 0.12, hd)
    h0 = pg.evaluate(DOWN, [D['c'], D['d'], 0, 0])
    check('the floor runs on under an inside door', h0 and abs(h0['y'] - 0.002) < 0.004 and 'floorStrip' in h0['ud'], h0)
    # pictures: the front door from inside (bottom), Kamer – Berging, Kamer – Keuken
    def look(did, side, ta, th, dist, ca, ch, name):
        D2 = pg.evaluate(DOOR, did); c, d = D2['c'], D2['d']; n = [-d[1], d[0]]
        t = [c[0] + d[0] * ta, th, c[1] + d[1] * ta]; cam = [c[0] + n[0] * dist * side + d[0] * ca, ch, c[1] + n[1] * dist * side + d[1] * ca]
        pg.evaluate("([t, c]) => { const v = window.__hp.app.panes[0].view; v.controls.target.set(...t); v.camera.position.set(...c); v.controls.update(); v.needs = true; }", [t, cam]); pg.wait_for_timeout(1500)
        pg.evaluate(GPU_SYNC); pg.screenshot(path=SHOTS + name, timeout=120000)
    look(ids['front'], -1, 0.0, 0.1, 0.85, 0.3, 1.0, 'doorfill-front-threshold.png')
    look(ids['doorbraak'], 1, 0.0, 0.3, 1.6, 0.6, 1.6, 'doorfill-kamer-keuken.png')
    look(ids['inside'], 1, 0.0, 1.0, 1.5, 0.5, 1.5, 'doorfill-handle.png')
    # the whole house: outside doors, solid, with their thresholds
    pg.evaluate("() => window.__hp.app.setScope('house')"); pg.wait_for_timeout(3500)
    look(ids['front'], 1, 0.0, 0.6, 2.4, 0.8, 1.3, 'doorfill-front-outside.png')
    D = pg.evaluate(DOOR, ids['front'])
    h1 = pg.evaluate(DOWN, [D['c'], D['d'], 0, 0.2])
    check('whole house: the threshold of the front door is there too', h1 and abs(h1['y'] - 0.02) < 0.006, h1)

    walls = pg.evaluate("() => { let n = 0; window.__hp.app.panes[0].view.group.traverse(m => { if (m.isMesh && m.userData.gline) n++; }); return n; }")
    check('the low walls and hedges (and the owner\'s quay) are drawn', walls >= by_house(pg, 3, 6), walls)

    # ── the View menu: Garden at the top ──
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    first = pg.evaluate("() => { const m = document.querySelector('.menu'); const b = m && m.querySelector('.show-btn'); return b ? [b.id, b.textContent, b.getAttribute('aria-pressed')] : null; }")
    check('View menu: a Garden button first at the top, switched on', first and first[0] == 'show-garden' and 'Garden' in first[1] and first[2] == 'true', first)
    check('View menu: Garden, Street, Neighbours, Water & park, Furniture, Notes, Electrics and Ceiling as buttons', pg.evaluate("() => [...document.querySelectorAll('.menu .show-btn')].map(b => b.id)") == ['show-garden', 'show-street', 'show-houses', 'show-park', 'show-furniture', 'show-notesOn', 'show-installs', 'show-ceilItems'])
    pg.click('#show-garden'); pg.wait_for_timeout(2500)
    # (since the thirty-second round Garden is the plot and what is on it; the street, the houses and the park stay)
    off = pg.evaluate("() => { let n = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData && (o.userData.garea || o.userData.gline || o.userData.plant)) n++; }); return [n, window.__hp.app.settings.garden, document.querySelector('#show-garden').getAttribute('aria-pressed')]; }")
    check('Garden off: nothing of the garden in 3D, the button shows off', off == [0, False, 'false'], off)
    pg.click('#show-garden'); pg.wait_for_timeout(2500)
    on = pg.evaluate("() => { let n = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData && o.userData.garden) n++; }); return [n, window.__hp.app.settings.garden]; }")
    check('Garden on again: back in 3D', on[0] >= 1 and on[1] is True, on)
    pg.screenshot(path=SHOTS + 'view-menu-garden.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # 2D: the garden switch hides the plot and the garden too
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__hp.app.setScope('storey')"); pg.wait_for_timeout(1200)
    g2 = pg.evaluate("() => document.querySelectorAll('.garden .g-area').length")
    # 2D: a plain sheet under the walls – the lawn doesn't show in the openings or in the cavities of the walls
    sheet = pg.evaluate("""() => { const el = document.querySelector('.wall-sheet'); if (!el) return null;
      const P = ([x, y]) => el.isPointInFill(new DOMPoint(x, y));
      if ((window.__hp.app.project.name || '').startsWith('Testhuis')) return { doorbraak: P([7.1, 6.05]), kitchen: P([6.7, 0.7]), front: P([3.95, 10.7]), gap: P([4.5, 0.61]), garden: P([5.0, -2.0]) };
      return { berging: P([14.81, 5.23]), gap: P([14.89, 4.0]), doorbraak: P([11.25, 6.57]), kitchen: P([7.21, 6.4]), front: P([7.21, 13.9]), garden: P([5.0, 0.0]) }; }""")
    check('2D: the sheet covers the door openings, the cavities and the opening between two rooms, not the garden', sheet and all(v for k, v in sheet.items() if k != 'garden') and not sheet['garden'], sheet)
    pg.screenshot(path=SHOTS + 'doorfill-2d.png')
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400); pg.click('#show-garden'); pg.wait_for_timeout(1200)
    g3 = pg.evaluate("() => document.querySelectorAll('.garden .g-area').length")
    pg.click('#show-garden'); pg.wait_for_timeout(800); pg.keyboard.press('Escape')
    check('2D: the Garden button hides and shows the garden', g2 >= 1 and g3 == 0, (g2, g3))
    # ── a house opens on its planned version, even after looking at the original ──
    pg.click('#display-toggle button[data-mode="original"]'); pg.wait_for_timeout(800)
    pid = pg.evaluate("() => window.__hp.app.project.id")
    pg.evaluate("async () => { await window.__hp.app.closeProject(); }"); pg.wait_for_timeout(800)
    pg.evaluate("(id) => { window.__hp.app.openProject(id); }", pid); pg.wait_for_timeout(3000)
    check('opened again (last seen: Original): it opens on Planned, in Build', pg.evaluate("() => [window.__hp.app.display, window.__hp.app.mode]") == ['plan', 'build'])
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500)
    check('3D in Build: Planned', pg.evaluate("() => window.__hp.app.display") == 'plan')
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # ── phone, dark ──
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    check('phone: opens on Planned', pg.evaluate("() => window.__hp.app.display") == 'plan')
    pg.tap('#btn-viewopts'); pg.wait_for_timeout(500)
    box = pg.evaluate("() => { const r = document.querySelector('.menu .show-row').getBoundingClientRect(); const bs = [...document.querySelectorAll('.menu .show-btn')].map(b => b.getBoundingClientRect()); return [r.left, r.right, window.innerWidth, Math.min(...bs.map(x => x.width)), new Set(bs.map(x => Math.round(x.top))).size]; }")
    check('phone: the buttons fit inside the screen, four a row', box[0] >= 0 and box[1] <= box[2] and box[3] >= 60 and box[4] == 2, box)
    pg.screenshot(path=SHOTS + 'view-menu-garden-phone.png')
    pg.tap('#show-garden'); pg.wait_for_timeout(1500)
    check('phone: tapping Garden switches it off', pg.evaluate("() => window.__hp.app.settings.garden") is False)
    pg.tap('#show-garden'); pg.wait_for_timeout(800)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.tap('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(4000)
    cnt = pg.evaluate("() => { const o = { threshold: 0, handle: 0 }; window.__hp.app.panes[0].view.group.traverse(m => { if (!m.isMesh) return; for (const k in o) if (m.userData[k]) o[k]++; }); return o; }")
    check('phone 3D: thresholds and handles', cnt['threshold'] >= 1 and cnt['handle'] >= 10, cnt)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
