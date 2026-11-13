"""Drawing and editing: rooms follow the walls (drag, thickness, typed dimensions; switch), dimension lines you can
type into (wall length, opening width, the gap before an opening), several things at once (Shift-click, "Several",
box), moving them together, copy and paste to another storey and another version, mirror, line up, delete + undo;
furniture copy / paste, mirror, align, spread; the stair tool (straight, L, U) with the opening above, 3D steps and
walking paths up it; on a phone too."""
from common import *

RP = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); return r && r.poly; }"
WALL = "(id) => { const w = window.__hp.app.shownVersion().plan.walls.find(x => x.id === id); return w && { a: w.a, b: w.b, t: w.t }; }"
DIMS = "() => [...document.querySelectorAll('[data-dimv]')].map(e => { const r = e.getBoundingClientRect(); return { txt: e.textContent, t: JSON.parse(e.getAttribute('data-dimv')), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })"
# the inside wall nearest a plan point on the shown storey
WALL_AT = """([x, y]) => { const a = window.__hp.app, pl = a.shownVersion().plan; let best = null, bd = 1e9;
  for (const w of pl.walls) { if (w.storey !== a.view.storeyId || w.kind !== 'interior') continue;
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L2));
    const d = Math.hypot(w.a[0] + t * dx - x, w.a[1] + t * dy - y); if (d < bd) { bd = d; best = w.id; } } return best; }"""
xs = lambda poly: sorted(set(round(q[0], 3) for q in poly))

def type_dim(pg, d, value):
    pg.mouse.click(d['x'], d['y']); pg.wait_for_selector('.dim-input')
    pg.fill('.dim-input', str(value)); pg.press('.dim-input', 'Enter'); pg.wait_for_timeout(600)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    # an inside wall between two rooms (left and right of it), a point on it, and a second wall to Shift-click
    E = by_house(pg, dict(L='Hal', R='Keuken', at=[4.95, 7.5], at2=[4.4, 6.05], xlim=5.4),       # made-up house: x = 4.95, 100 mm
                 dict(L='Woonkamer', R='Hal', at=[5.345, 11.3], at2=[5.9, 9.73], xlim=6))      # owner's house: x = 5.345, 120 mm
    AT, AT2, XL = E['at'], E['at2'], E['xlim']
    W = pg.evaluate(WALL_AT, AT)
    w0, wk0, hal0 = pg.evaluate(WALL, W), pg.evaluate(RP, E['L']), pg.evaluate(RP, E['R'])
    wx, wt = w0['a'][0], w0['t']
    wlen = round(((w0['b'][0] - w0['a'][0]) ** 2 + (w0['b'][1] - w0['a'][1]) ** 2) ** 0.5 * 1000)
    # ── rooms follow a dragged wall ──
    pg.mouse.click(*to_screen(pg, *AT)); pg.wait_for_timeout(400)
    drag(pg, to_screen(pg, *AT), to_screen(pg, AT[0] + 0.3, AT[1]))
    w1, wk1, hal1 = pg.evaluate(WALL, W), pg.evaluate(RP, E['L']), pg.evaluate(RP, E['R'])
    dx = w1['a'][0] - w0['a'][0]
    check('the wall moved about 300 mm', 0.25 < dx < 0.35, dx)
    check(f'the room on the left ({E["L"]}) follows (its edge on the wall face)', near(max(q[0] for q in wk1 if q[0] < XL), wx - wt / 2 + dx, 0.002), (xs(wk0), xs(wk1)))
    check(f'the room on the right ({E["R"]}) follows on the other side', near(min(q[0] for q in hal1), wx + wt / 2 + dx, 0.002), (xs(hal0), xs(hal1)))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    check('undo: wall and rooms back', pg.evaluate(RP, E['L']) == wk0 and pg.evaluate(WALL, W)['a'] == w0['a'])
    # ── thicker wall: both rooms shrink ──
    pg.mouse.click(*to_screen(pg, *AT)); pg.wait_for_timeout(400)
    pg.fill('#f-wall-t', '200'); pg.press('#f-wall-t', 'Enter'); pg.wait_for_timeout(600)
    wk2, hal2 = pg.evaluate(RP, E['L']), pg.evaluate(RP, E['R'])
    check(f'200 mm thick: the faces move {round((0.2 - wt) / 2 * 1000)} mm, the rooms with them', near(max(q[0] for q in wk2 if q[0] < XL), wx - 0.1, 0.001) and near(min(q[0] for q in hal2), wx + 0.1, 0.001), (xs(wk2), xs(hal2)))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    # ── the switch ──
    pg.evaluate("() => { window.__hp.Settings.set('roomFollow', false); }")
    pg.mouse.click(*to_screen(pg, *AT)); pg.wait_for_timeout(300)
    drag(pg, to_screen(pg, *AT), to_screen(pg, AT[0] + 0.3, AT[1]))
    check('"Rooms follow the walls" off: the rooms stay', pg.evaluate(RP, E['L']) == wk0)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    pg.evaluate("() => { window.__hp.Settings.set('roomFollow', true); }")

    # ── dimension lines ──
    pg.mouse.click(*to_screen(pg, *AT)); pg.wait_for_timeout(500)
    D = pg.evaluate(DIMS)
    check(f'the selected wall shows its dimension ({wlen})', any(d['txt'] == str(wlen) and d['t']['kind'] == 'len' for d in D), [d['txt'] for d in D])
    pg.screenshot(path=SHOTS + 'dims-wall.png')
    d = next(d for d in D if d['t']['kind'] == 'len')
    type_dim(pg, d, 2500)
    w3 = pg.evaluate(WALL, W)
    L3 = ((w3['b'][0] - w3['a'][0]) ** 2 + (w3['b'][1] - w3['a'][1]) ** 2) ** 0.5
    check('typed 2500: the wall is 2500 long', near(L3, 2.5, 0.001), L3)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    # a wall with a door: the chain has the door's width and the gaps
    door_wall = pg.evaluate("() => { const pl = window.__hp.app.shownVersion().plan; const st = window.__hp.app.view.storeyId; const op = pl.openings.find(o => o.kind === 'door' && pl.walls.find(w => w.id === o.wall && w.storey === st && w.kind === 'interior')); return { op: op.id, w: op.wall, width: op.w, pos: op.pos }; }")
    pg.evaluate("(id) => window.__hp.app.select({ type: 'wall', id })", door_wall['w']); pg.wait_for_timeout(500)
    D = pg.evaluate(DIMS)
    opd = next((d for d in D if d['t']['kind'] == 'op' and d['t']['op'] == door_wall['op']), None)
    gap = next((d for d in D if d['t']['kind'] == 'gap' and d['t']['next'] == door_wall['op']), None)
    check('a wall with a door: the chain shows the door and the gaps', opd is not None and gap is not None, [(d['txt'], d['t']['kind']) for d in D])
    type_dim(pg, opd, 1000)
    op1 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.openings.find(o => o.id === id)", door_wall['op'])
    check('typed 1000 in the door width: the door is 1000 wide', near(op1['w'], 1.0, 0.001), op1['w'])
    D = pg.evaluate(DIMS)
    gap = next(d for d in D if d['t']['kind'] == 'gap' and d['t']['next'] == door_wall['op'])
    g0 = gap['t']['len']
    type_dim(pg, gap, int(round(g0 * 1000)) + 100)
    op2 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.openings.find(o => o.id === id)", door_wall['op'])
    check('typed a gap 100 mm bigger: the door moved 100 mm', near(op2['pos'] - op1['pos'], 0.1, 0.002), (op1['pos'], op2['pos']))
    pg.evaluate("() => { window.__hp.app.settings.dims = true; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(700)
    n_all = pg.evaluate("() => document.querySelectorAll('.dimc').length")
    check('"Wall lengths" on: dimension lines along the walls', n_all > by_house(pg, 8, 15), n_all)   # (the made-up ground floor: 10)
    pg.screenshot(path=SHOTS + 'dims-all.png')
    pg.evaluate("() => { window.__hp.app.settings.dims = false; window.__hp.Settings.save(); window.__hp.app.refreshViews(false); }")

    # ── several at once ──
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.keyboard.down('Shift')
    pg.mouse.click(*to_screen(pg, *AT)); pg.wait_for_timeout(300)
    pg.mouse.click(*to_screen(pg, *AT2)); pg.wait_for_timeout(300)
    pg.keyboard.up('Shift')
    sel = pg.evaluate("() => window.__hp.app.selection")
    check('Shift-click: two walls selected', sel and sel['type'] == 'multi' and len(sel['items']) == 2, sel)
    check('the panel for several', pg.is_visible('#ms-copy') and pg.is_visible('#ms-mirror-x'))
    before = [pg.evaluate(WALL, it['id']) for it in sel['items']]
    drag(pg, to_screen(pg, *AT), to_screen(pg, AT[0], AT[1] + 0.5))
    after = [pg.evaluate(WALL, it['id']) for it in sel['items']]
    check('drag one: both move 500 mm', all(near(a['a'][1] - b0['a'][1], 0.5, 0.01) for a, b0 in zip(after, before)), (before, after))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    # box with "Several"
    pg.click('#btn-several'); pg.wait_for_timeout(300)
    bx = pg.evaluate(RP, 'Toilet')
    x0, x1 = min(q[0] for q in bx) - 0.15, max(q[0] for q in bx) + 0.15
    y0, y1 = min(q[1] for q in bx) - 0.15, max(q[1] for q in bx) + 0.15
    pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(200)
    drag(pg, to_screen(pg, x0, y0), to_screen(pg, x1, y1), steps=10)
    sel = pg.evaluate("() => window.__hp.app.selection")
    kinds = sorted(set(i['type'] for i in sel['items'])) if sel and sel.get('type') == 'multi' else sel
    check('"Several" + a box around the toilet: its walls and the room', kinds == ['room', 'wall'] or kinds == ['point', 'room', 'wall'], kinds)
    pg.screenshot(path=SHOTS + 'multi-box.png')
    pg.click('#btn-several'); pg.wait_for_timeout(200)
    nw = sum(1 for i in sel['items'] if i['type'] == 'wall')
    # copy, then paste on the storey above (same place)
    pg.keyboard.press('Control+c'); pg.wait_for_timeout(300)
    walls1e = pg.evaluate("() => { const a = window.__hp.app; const st = a.project.storeys.find(s => s.name === '1e verdieping'); return a.shownVersion().plan.walls.filter(w => w.storey === st.id).length; }")
    TOILETS = "() => window.__hp.app.shownVersion().plan.rooms.filter(r => r.name === 'Toilet' && r.storey === window.__hp.app.project.storeys.find(s => s.name === '1e verdieping').id).length"
    toilets1e = pg.evaluate(TOILETS)
    pg.click('#storey-tabs button:has-text("1e verdieping")'); pg.wait_for_timeout(900)
    pg.keyboard.press('Control+v'); pg.wait_for_timeout(700)
    got = pg.evaluate("() => { const a = window.__hp.app; const st = a.currentStorey(); const pl = a.shownVersion().plan; return [pl.walls.filter(w => w.storey === st.id).length, pl.rooms.filter(r => r.storey === st.id && r.name === 'Toilet').length]; }")
    check('pasted on 1e verdieping: the walls and a Toilet room', got[0] == walls1e + nw and got[1] == toilets1e + 1, (got, walls1e, nw, toilets1e))
    pasted = pg.evaluate("() => window.__hp.app.selection")
    check('the pasted things are selected, to move them', pasted['type'] == 'multi' and len(pasted['items']) == len(sel['items']), pasted)
    # mirror the pasted room
    rid = next(i['id'] for i in pasted['items'] if i['type'] == 'room')
    pg.evaluate("(id) => window.__hp.app.select({ type: 'room', id, storey: window.__hp.app.view.storeyId })", rid); pg.wait_for_timeout(300)
    pp0 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.rooms.find(r => r.id === id).poly", rid)
    pg.evaluate("() => window.__hp.app.select({ type: 'multi', items: [window.__hp.app.selection.type === 'room' ? { type: 'room', id: window.__hp.app.selection.id } : null].filter(Boolean) })")
    pg.evaluate("() => window.__hp.app.mirrorSelection('x')"); pg.wait_for_timeout(400)
    pp1 = pg.evaluate("(id) => window.__hp.app.shownVersion().plan.rooms.find(r => r.id === id).poly", rid)
    cx = (min(q[0] for q in pp0) + max(q[0] for q in pp0)) / 2
    check('mirror ↔: the room flips about its middle', sorted(round(2 * cx - q[0], 3) for q in pp0) == sorted(round(q[0], 3) for q in pp1), (pp0, pp1))
    # delete all pasted, undo
    pg.evaluate("(items) => window.__hp.app.select({ type: 'multi', items })", pasted['items']); pg.wait_for_timeout(300)
    pg.click('#ms-delete'); pg.wait_for_timeout(500)
    n_after = pg.evaluate("() => { const a = window.__hp.app; const st = a.currentStorey(); return a.shownVersion().plan.walls.filter(w => w.storey === st.id).length; }")
    check('delete all', n_after == walls1e, n_after)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    check('undo brings them back', pg.evaluate("() => { const a = window.__hp.app; const st = a.currentStorey(); return a.shownVersion().plan.walls.filter(w => w.storey === st.id).length; }") == walls1e + nw)
    # paste into another version
    other = pg.evaluate("() => window.__hp.app.project.versions.find(v => v.kind !== 'original' && v.id !== window.__hp.app.shownVersion().id).id")
    pg.evaluate("(id) => { window.__hp.app.switchVersion ? window.__hp.app.switchVersion(id) : window.__hp.app.setActiveVersion(id); }", other); pg.wait_for_timeout(1200)
    if pg.evaluate("() => window.__hp.app.shownVersion().id") == other:
        t0 = pg.evaluate(TOILETS)
        pg.keyboard.press('Control+v'); pg.wait_for_timeout(600)
        check('pasted in another version too', pg.evaluate(TOILETS) == t0 + 1, (t0, pg.evaluate(TOILETS)))
    else:
        check('switch to another version', False, 'no version switch function')
    check('no page errors (walls)', not pg.errors, pg.errors)

    # ── furniture: copy, mirror, align, spread ──
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.click('#storey-tabs button:has-text("Begane grond")'); pg.wait_for_timeout(800)
    ids = pg.evaluate("""() => { const a = window.__hp.app; const st = a.currentStorey().id; const made = [['armchair', 2.0, 10.4, 0], ['armchair', 3.2, 10.9, 90], ['corner', 3.0, 8.0, 0]].map(([type, x, y, rot]) => ({ id: 'f_t' + Math.random().toString(36).slice(2, 8), type, storey: st, x, y, rot, w: type === 'corner' ? 2.6 : 0.8, d: type === 'corner' ? 2.0 : 0.8, h: 0.85, color: '#8A8A8A', shop: {} }));
      a.furnMutate(l => { l.items.push(...made); }); a.select({ type: 'furn', ids: made.map(f => f.id) }); return made.map(f => f.id); }""")
    pg.wait_for_timeout(600)
    F = "(ids) => window.__hp.app.activeLayout().items.filter(f => ids.includes(f.id)).map(f => ({ x: f.x, y: f.y, rot: f.rot, flip: !!f.flip, type: f.type }))"
    f0 = pg.evaluate(F, ids)
    pg.click('.align-seg button[data-k="left"]'); pg.wait_for_timeout(400)
    boxes = pg.evaluate("(ids) => window.__hp.app.activeLayout().items.filter(f => ids.includes(f.id)).map(f => Math.min(...window.__hp.furnCorners(f).map(q => q[0])))", ids) if pg.evaluate("() => !!window.__hp.furnCorners") else None
    if boxes is not None: check('align left: the left sides in one line', max(boxes) - min(boxes) < 0.002, boxes)
    pg.click('#fe-mirror-x'); pg.wait_for_timeout(400)
    f1 = pg.evaluate(F, ids)
    check('mirror ↔: the corner sofa is drawn the other way round', next(f for f in f1 if f['type'] == 'corner')['flip'] is True)
    MIR = "() => [...document.querySelectorAll('.furn')].some(g => (g.getAttribute('transform') || '').includes('scale(-1 1)'))"
    try: pg.wait_for_function(MIR, timeout=3000)
    except Exception: pass
    check('2D: the mirrored piece is drawn mirrored', pg.evaluate(MIR))
    pg.click('#fe-spread-y'); pg.wait_for_timeout(400)
    pg.keyboard.press('Control+c'); pg.wait_for_timeout(200)
    pg.click('#storey-tabs button:has-text("1e verdieping")'); pg.wait_for_timeout(800)
    pg.keyboard.press('Control+v'); pg.wait_for_timeout(600)
    n1 = pg.evaluate("() => { const a = window.__hp.app; return a.activeLayout().items.filter(f => f.storey === a.currentStorey().id && f.id.startsWith('f_') && f.color === '#8A8A8A').length; }")
    check('furniture copied to the storey above', n1 == 3, n1)
    pg.screenshot(path=SHOTS + 'furn-mirror.png')
    check('no page errors (furniture)', not pg.errors, pg.errors)
    b.close()

    # ── the stair tool in a house drawn by hand ──
    b, pg = open_app(p)
    pg.click('#btn-new'); pg.wait_for_timeout(400)
    pg.click('.dialog .btn.primary'); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const a = window.__hp.app; const P = [[0,0],[6,0],[6,4],[0,4]]; for (let i = 0; i < 4; i++) a.addWall(P[i], P[(i+1)%4], 0.2, 'exterior'); }""")
    pg.wait_for_timeout(300)
    pg.click('#toolrail button[data-tool="room"]'); pg.mouse.click(*to_screen(pg, 3, 2)); pg.wait_for_timeout(400)
    pg.click('#toolrail button[data-tool="stair"]'); pg.wait_for_timeout(300)
    pg.click('.toolopts .chip:has-text("L (quarter turn)")'); pg.wait_for_timeout(200)
    pg.mouse.click(*to_screen(pg, 1.0, 3.45)); pg.wait_for_timeout(300)
    pg.mouse.click(*to_screen(pg, 3.0, 3.45)); pg.wait_for_timeout(700)
    S = pg.evaluate("() => window.__hp.app.shownVersion().plan.stairs")
    st = S[0] if S else {}
    check('an L stair: 16 risers for 2.85 m (178 mm), the opening above on', len(S) == 1 and st['kind'] == 'L' and st['n'] == 16 and st['hole'] is True and st['upper'], st)
    G = pg.evaluate("() => { const st = window.__hp.app.shownVersion().plan.stairs[0]; const g = window.__hp.stairGeom(st); return { treads: g.treads.length, landing: !!g.landing, maxY: Math.max(...g.parts.flat().map(q => q[1])), minY: Math.min(...g.parts.flat().map(q => q[1])), top: g.treads[g.treads.length - 1].h }; }")
    check('14 treads + a landing; it turns into the house (left)', G['treads'] == 14 and G['landing'] and G['maxY'] <= 3.9 + 0.01 and G['minY'] > 0.1, G)
    check('the details show the riser height and the step rule', '178 mm' in pg.inner_text('.inspector') and pg.is_visible('#f-st-hole'))
    pg.screenshot(path=SHOTS + 'stair-2d.png')
    # the storey above: a room over it gets the opening
    pg.click('#storey-tabs button >> nth=1'); pg.wait_for_timeout(800)
    pg.evaluate("""() => { const a = window.__hp.app; const P = [[0,0],[6,0],[6,4],[0,4]]; for (let i = 0; i < 4; i++) a.addWall(P[i], P[(i+1)%4], 0.2, 'exterior'); }""")
    pg.click('#toolrail button[data-tool="room"]'); pg.mouse.click(*to_screen(pg, 4.5, 1.0)); pg.wait_for_timeout(400)
    holes = pg.evaluate("() => { const a = window.__hp.app; const pl = a.shownVersion().plan; const r = pl.rooms.find(r => r.storey === a.currentStorey().id); return window.__hp.roomHoles(pl, r).length; }")
    check('the floor above has the stairwell opening', holes >= 2, holes)
    check('the stair shows dashed on the storey above', pg.evaluate("() => document.querySelectorAll('.stair2d.above').length") == 1)
    pg.click('#storey-tabs button >> nth=0'); pg.wait_for_timeout(800)
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(2500); still(pg)
    n3 = pg.evaluate("() => { let n = 0, w = 0; window.__hp.app.panes[0].view.group.traverse(o => { if (o.userData.stair) { n++; if (o.userData.walk) w++; } }); return [n, w]; }")
    check('3D: steps you can walk on', n3[0] >= 28 and n3[1] >= 15, n3)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.camera.position.set(-2.5, 4.2, 8.5); v.controls.target.set(2.4, 1.0, 2.6); v.controls.update(); v.needs = true; }")
    pg.wait_for_timeout(1200); still(pg)
    pg.screenshot(path=SHOTS + 'stair-3d.png')
    # walking paths go up it
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => window.__hp.app.autoPaths()"); pg.wait_for_timeout(600)
    sn = pg.evaluate("() => window.__hp.app.project.walk.nodes.filter(n => n.stair).length")
    check('"Make paths": up the stair', sn >= 15, sn)
    # copy a straight stair and turn it the other way
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(600)
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(800)
    pg.evaluate("() => window.__hp.app.select({ type: 'stair', id: window.__hp.app.shownVersion().plan.stairs[0].id })"); pg.wait_for_timeout(400)
    pg.click('.stair-kind button[data-k="straight"]'); pg.wait_for_timeout(400)
    x0 = pg.evaluate("() => window.__hp.app.shownVersion().plan.stairs[0].x")
    pg.click('.inspector button:has-text("Up the other way")'); pg.wait_for_timeout(400)
    s2 = pg.evaluate("() => window.__hp.app.shownVersion().plan.stairs[0]")
    check('straight, then up the other way: starts at the old top', near(s2['x'], x0 + 15 * 0.22, 0.01) and s2['rot'] == 180, s2)
    check('no page errors (stairs)', not pg.errors, pg.errors)
    b.close()

    # ── phone: several with the chip, a stair by taps ──
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(700)
    pg.tap('#btn-several'); pg.wait_for_timeout(300)
    pg.touchscreen.tap(*to_screen(pg, *AT)); pg.wait_for_timeout(500)
    pg.touchscreen.tap(*to_screen(pg, *AT2)); pg.wait_for_timeout(500)
    sel = pg.evaluate("() => window.__hp.app.selection")
    check('phone: "Several" + two taps = two walls', sel and sel.get('type') == 'multi' and len(sel['items']) == 2, sel)
    pg.screenshot(path=SHOTS + 'multi-phone.png')
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
