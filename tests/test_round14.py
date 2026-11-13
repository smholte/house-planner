"""Fourteenth round (31 Oct): AR – the plan in the real room. On an Android phone (Chrome, WebXR "immersive-ar" with hit
testing) you pick the room and two of its corners, tap those corners on the real floor, and the storey of the shown
version is laid over the room at true size: planned walls (see-through, solid or off; the brick and insulation of the
outside walls left out), the new floors, kitchen and furniture, sockets and switches, and the pipes and cables from the
building diary; Changes; the distance between the taps against the plan; turning and shifting by 0.5° / 1 cm; tapping
again; stopping. The test browser has no AR, so fixtures/fake-xr.js plays the phone: a viewer in a room with a flat
floor, and three.js drawing into the page's own canvas. PC (light) and phone (dark)."""
from common import *
import math

FX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'fake-xr.js')
SELROOM = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); a.select({ type: 'room', id: r.id, storey: r.storey }); }"
AR = "() => { const A = window.__hp.app._ar; return A ? { taps: A.taps.length, fit: A.fit, cur: A.cur, show: A.show, a: A.cs.a, b: A.cs.b, room: A.room.name, hit: !!A.hit } : null; }"
VIS = """() => { const A = window.__hp.app._ar, plan = A.ver.plan, out = { slab: [], brick: [], inner: [], floor: [], furn: [], point: [], pipe: [], wallOp: [] };
  const kind = id => { const w = plan.walls.find(x => x.id === id); return w && (w.kind === 'insulation' || (w.kind === 'exterior' && w.leaf === 'outer')) ? 'brick' : 'inner'; };
  A.v.group.traverse(o => { const u = o.userData || {};
    if (u.arPipe != null) { out.pipe.push(o.parent.visible); return; }
    if (!o.isMesh) return;
    let vis = o.visible; for (let p = o.parent; p && p !== A.v.group; p = p.parent) vis = vis && p.visible;
    if (u.slab) out.slab.push(vis); else if (u.furn != null) out.furn.push(vis); else if (u.point != null) out.point.push(vis); else if (u.roomId != null && u.walk) out.floor.push(vis);
    else if (u.wallId) { const k = kind(u.wallId); out[k].push(vis); if (k === 'inner') out.wallOp.push((Array.isArray(o.material) ? o.material[0] : o.material).opacity); } });
  const all = a => a.length && a.every(Boolean), none = a => a.length && !a.some(Boolean);
  return { slab: none(out.slab), brick: none(out.brick), inner: all(out.inner), floor: all(out.floor), furn: all(out.furn), point: all(out.point), pipe: out.pipe.length ? out.pipe.every(Boolean) : null,
    floorOff: none(out.floor), furnOff: none(out.furn), pointOff: none(out.point), innerOff: none(out.inner), pipeOff: out.pipe.length ? !out.pipe.some(Boolean) : null, op: [...new Set(out.wallOp.map(x => +x.toFixed(2)))], n: out.inner.length }; }"""
PLACE = "(q) => { const A = window.__hp.app._ar; return window.__hp.arPlace(A.cur, q); }"

def hit(pg, w): pg.evaluate("(h) => { window.__fakeXR.hitAt = h; }", w); pg.wait_for_timeout(300)

with sync_playwright() as p:
    # ───────── no AR on this computer: what is needed ─────────
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    check('View menu: “AR: the plan in the real room”', pg.locator('#mi-ar').count() == 1)
    pg.click('#mi-ar'); pg.wait_for_timeout(1000)
    why = pg.inner_text('#ar-why') if pg.locator('#ar-why').count() else ''
    check('without AR: what it needs (an Android phone, Chrome, Google Play Services for AR, the https address)', 'Android' in why and 'Chrome' in why and 'https' in why, why[:200])
    pg.click('.scrim:last-child .dialog button:has-text("Close")'); pg.wait_for_timeout(300)
    # ───────── laying the plan over the room ─────────
    f = pg.evaluate("() => { const F = window.__hp.arFit([0, 0], [4, 0], { x: 1, y: 0, z: 2 }, { x: 1, y: 0, z: -2 }); return [F, window.__hp.arPlace(F, [2, 0]), window.__hp.arPlace(F, [0, 0]), window.__hp.arPlace(F, [4, 1])]; }")
    F, mid, a0, q = f
    check('two corners → the plan turned and moved onto them (A on A, the middle on the middle, true size)', near(F['rot'], -math.pi / 2, 1e-6) and near(mid['x'], 1, 1e-9) and near(mid['z'], 0, 1e-9) and near(a0['x'], 1, 1e-9) and near(a0['z'], 2, 1e-9) and near(F['err'], 0, 1e-9), f)
    check('… a point beside the line lands beside it (turned the right way, not mirrored)', near(q['x'], 2, 1e-9) and near(q['z'], -2, 1e-9), q)
    f2 = pg.evaluate("() => window.__hp.arFit([0, 0], [4, 0], { x: 0, y: -1.4, z: 0 }, { x: 4.02, y: -1.4, z: 0 })")
    check('… taps 2 cm further apart than the plan: the difference shared by both ends, the floor where you tapped', near(f2['err'], 0.02, 1e-9) and near(f2['tx'], 0.01, 1e-9) and near(f2['y'], -1.4, 1e-9), f2)
    c = pg.evaluate("() => { const r = window.__hp.app.shownVersion().plan.rooms.find(r => r.name === 'Woonkamer'); const C = window.__hp.arCorners(r); const P = C.pts; return [C.a, C.b, Math.hypot(P[C.b][0] - P[C.a][0], P[C.b][1] - P[C.a][1]), Math.max(...P.map((q, i) => Math.hypot(P[(i + 1) % P.length][0] - q[0], P[(i + 1) % P.length][1] - q[1])))]; }")
    check('the corners to tap at first: the ends of the room’s longest side', near(c[2], c[3], 1e-9) and (c[1] == (c[0] + 1) % 6 or c[1] != c[0]), c)
    check('no page errors (PC, no AR)', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── a pretend AR phone ─────────
    b, pg = open_app(p, init=[FX])
    open_example(pg)
    # a "pipes and cables" note in the living room, for the AR view
    pg.evaluate("""() => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === 'Woonkamer'); const lp = window.__hp.labelPoint(r.poly, []);
      a.mutate(p => { p.notes.push({ id: 'n_arpipe', type: 'hidden', status: 'done', diaryDone: true, text: 'Water pipe', created: Date.now(), updated: Date.now(), photos: [], room: null, storey: r.storey, at: { storey: r.storey, x: lp[0], y: lp[1], h: 0.5 }, date: '2026-10-31', runs: ['water'], inside: 'floor' }); }, { project: true }); }""")
    pg.evaluate(SELROOM, 'Woonkamer'); pg.wait_for_timeout(800)
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    pg.click('#mi-ar'); pg.wait_for_timeout(1200)
    check('with AR: first the room and its corners (the selected room; A and B on its longest side)', pg.locator('#ar-setup').count() == 1 and pg.input_value('#ar-room') != '' and pg.locator('#ar-corners .ar-c.on').count() == 2, pg.inner_text('#ar-setup')[:200])
    ab0 = pg.inner_text('#ar-ab')
    LAB = str(round(c[2] * 1000))   # A–B in the plan (owner's living room 7905 mm; made-up 5950 mm)
    check('… the length A–B in the plan, to check with a tape measure', LAB in ab0, (LAB, ab0))
    n = pg.locator('#ar-corners .ar-c').count()
    LINE = "() => { const l = document.querySelector('#ar-corners .ar-ab-line'); return ['x1', 'y1', 'x2', 'y2'].map(k => +l.getAttribute(k)); }"
    line0 = pg.evaluate(LINE)
    pg.locator('#ar-corners .ar-c').nth(n - 1).click(); pg.wait_for_timeout(200)
    pg.locator('#ar-corners .ar-c').nth(n - 2).click(); pg.wait_for_timeout(200)
    on = pg.evaluate("() => [...document.querySelectorAll('#ar-corners .ar-c.on')].map(g => +g.dataset.i).sort((a, b) => a - b)")
    check('… tap two other corners to use those (the first is A, the next B)', on == [n - 2, n - 1] and pg.evaluate(LINE) != line0, (on, pg.inner_text('#ar-ab')))
    pg.locator('#ar-corners .ar-c').nth(c[0]).click(); pg.wait_for_timeout(200)
    pg.locator('#ar-corners .ar-c').nth(c[1]).click(); pg.wait_for_timeout(200)
    pg.screenshot(path=SHOTS + 'r14-ar-setup.png')
    pg.click('.scrim:last-child .dialog button:has-text("Start AR")'); pg.wait_for_timeout(4000)
    init = pg.evaluate("() => window.__fakeXR.lastInit")
    check('Start AR: an immersive-ar session with hit testing, the buttons on top of the camera (dom-overlay)', init and init['mode'] == 'immersive-ar' and 'hit-test' in init['required'] and 'dom-overlay' in init['optional'] and init['overlay'], init)
    st = pg.evaluate(AR)
    check('… “Woonkamer: point the dot at corner A …”, the room shown small with the corner to tap', st and 'corner A' in pg.inner_text('#ar-msg') and pg.locator('#ar-overlay .ar-mini .ar-c.now').count() == 1, (st, pg.inner_text('#ar-msg')))
    check('… frames are drawn and the dot finds the floor', pg.evaluate("() => window.__fakeXR.frames") > 5 and st['hit'] and pg.is_enabled('#ar-place'))
    # the room as it "really" is: turned 30°, elsewhere, floor 1.40 m below where the phone started
    pa, pb = pg.evaluate("() => { const A = window.__hp.app._ar; return [A.cs.pts[A.cs.a], A.cs.pts[A.cs.b]]; }")
    rot = math.radians(30); co, si = math.cos(rot), math.sin(rot)
    W = lambda q, dx=0: {'x': co * q[0] - si * q[1] + 2.0 + dx, 'y': -1.4, 'z': si * q[0] + co * q[1] - 5.0}
    hit(pg, W(pa)); pg.click('#ar-place'); pg.wait_for_timeout(400)
    check('Place A: B next', 'corner B' in pg.inner_text('#ar-msg') and pg.evaluate(AR)['taps'] == 1)
    # (B tapped 1 cm off along x, away from A: the taps a little further apart than the plan says)
    DX = 0.01 if co * (pb[0] - pa[0]) - si * (pb[1] - pa[1]) >= 0 else -0.01
    hit(pg, W(pb, DX)); pg.click('#ar-place'); pg.wait_for_timeout(1200)
    st = pg.evaluate(AR)
    check('Place B: the plan laid over the room (turned 30°, the floor where you tapped)', st['fit'] and near((st['fit']['rot'] - rot + math.pi) % (2 * math.pi) - math.pi, 0, 0.003) and near(st['fit']['y'], -1.4, 1e-6), st['fit'])
    la, lb = pg.evaluate(PLACE, pa), pg.evaluate(PLACE, pb)
    wa, wb = W(pa), W(pb, DX)
    check('… corner A of the plan within a centimetre of your tap, and B too', math.hypot(la['x'] - wa['x'], la['z'] - wa['z']) < 0.01 and math.hypot(lb['x'] - wb['x'], lb['z'] - wb['z']) < 0.01, (la, wa, lb, wb))
    msg = pg.inner_text('#ar-msg')
    gap = round(math.hypot(wb['x'] - wa['x'], wb['z'] - wa['z']) * 1000) - int(LAB)
    check(f'… “Your taps are … mm apart, the plan says {LAB} mm (+{gap} mm)” (owner\'s house: 7914 / 7905 / +9)', gap > 0 and LAB in msg and f'+{gap} mm' in msg and pg.locator('.ar-msg.warn').count() == 0, msg)
    vis = pg.evaluate(VIS)
    check('in the room: the planned walls (see-through), floors, kitchen and furniture, electrics, the pipes; not the concrete slab, nor the brick and insulation behind the real walls',
          vis['inner'] and vis['floor'] and vis['furn'] and vis['point'] and vis['pipe'] and vis['slab'] and vis['brick'] and vis['op'] == [0.45], vis)
    shared = pg.evaluate("() => { const A = window.__hp.app._ar; const bases = [...A.clones.keys()]; return [bases.length, bases.every(m => m.opacity === 1 || m.transparent), [...A.clones.values()].every(c => c.userData.arBase)]; }")
    check('… see-through on copies of the materials: the 3D views on the screen keep theirs', shared[0] > 3 and shared[1] and shared[2], shared)
    pg.click('#ar-walls'); pg.wait_for_timeout(300)
    check('Walls: solid', pg.evaluate(VIS)['op'] == [1] and 'solid' in pg.inner_text('#ar-walls'))
    pg.click('#ar-walls'); pg.wait_for_timeout(300)
    check('Walls: off', pg.evaluate(VIS)['innerOff'])
    pg.click('#ar-walls'); pg.wait_for_timeout(300)
    for chip_id, key in (('#ar-floors', 'floorOff'), ('#ar-furn', 'furnOff'), ('#ar-inst', 'pointOff'), ('#ar-pipes', 'pipeOff')):
        pg.click(chip_id); pg.wait_for_timeout(300)
    vis = pg.evaluate(VIS)
    check('Floors, Kitchen & furniture, Electrics, Pipes and cables: each switches off (and the walls back to see-through)', vis['floorOff'] and vis['furnOff'] and vis['pointOff'] and vis['pipeOff'] and vis['op'] == [0.45], vis)
    for chip_id in ('#ar-floors', '#ar-furn', '#ar-inst', '#ar-pipes'):
        pg.click(chip_id); pg.wait_for_timeout(300)
    pg.click('#ar-changes'); pg.wait_for_timeout(2500)
    ch = pg.evaluate("() => { const A = window.__hp.app._ar; const en = A.v.spec.entries[0]; return [A.show.changes, !!en.diff, en.diff ? en.diff.newParts.length : 0, A.v.group.visible]; }")
    check('Changes: built again with what the plan changes, still in place', ch[0] and ch[1] and ch[3], ch)
    vis = pg.evaluate(VIS)
    check('… with the same rules (no slab, no brick, see-through)', vis['slab'] and vis['brick'] and vis['op'] == [0.45] and vis['pipe'], vis)
    cur0 = pg.evaluate(AR)['cur']
    pg.click('#ar-rot-r'); pg.wait_for_timeout(200)
    cur1 = pg.evaluate(AR)['cur']
    check('Fine-tune: turn by 0.5°', near(cur1['rot'] - cur0['rot'], math.radians(0.5), 1e-6), (cur0, cur1))
    pg.click('#ar-rot-l'); pg.click('#ar-along-p'); pg.wait_for_timeout(200)
    mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
    m0 = {'x': (wa['x'] + wb['x']) / 2, 'z': (wa['z'] + wb['z']) / 2}
    m1 = pg.evaluate(PLACE, mid)
    check('… shift 1 cm towards B (the middle of A–B moves 1 cm)', near(math.hypot(m1['x'] - m0['x'], m1['z'] - m0['z']), 0.01, 0.0005), (m0, m1))
    pg.click('#ar-across-p'); pg.wait_for_timeout(200)
    check('… and across', '0.0°' in pg.inner_text('#ar-nudge') or '0,0°' in pg.inner_text('#ar-nudge'), pg.inner_text('#ar-nudge'))
    pg.screenshot(path=SHOTS + 'r14-ar-placed.png')
    # tap again, and a bad tap
    pg.click('#ar-again'); pg.wait_for_timeout(400)
    st = pg.evaluate(AR)
    check('Tap the corners again: back to corner A, the plan hidden', st['taps'] == 0 and not st['fit'] and not pg.evaluate("() => window.__hp.app._ar.v.group.visible") and 'corner A' in pg.inner_text('#ar-msg'))
    hit(pg, W(pa)); pg.click('#ar-place'); pg.wait_for_timeout(300)
    hit(pg, W(pb, 0.3)); pg.click('#ar-place'); pg.wait_for_timeout(800)
    check('… taps 30 cm too far apart: a warning to tap again', pg.locator('.ar-msg.warn').count() == 1, pg.inner_text('#ar-msg'))
    # a tap on the screen (not on a button) places a corner too
    pg.click('#ar-again'); pg.wait_for_timeout(300)
    hit(pg, W(pa))
    pg.evaluate("() => { const A = window.__hp.app._ar; A.session.dispatchEvent(new Event('select')); }"); pg.wait_for_timeout(300)
    check('a tap on the camera picture places the corner as well', pg.evaluate(AR)['taps'] == 1)
    # stop
    pg.click('#ar-exit'); pg.wait_for_timeout(1500)
    gone = pg.evaluate("() => [window.__fakeXR.ended, !!window.__hp.app._ar, !!document.querySelector('#ar-overlay'), !!document.querySelector('.ar-host')]")
    check('Stop AR: the session ends, the buttons and the hidden 3D view are gone', gone == [1, False, False, False], gone)
    check('… the app as before (the plan on the screen)', pg.locator('#stage svg').count() > 0 and pg.evaluate("() => window.__hp.app.selection && window.__hp.app.selection.type") == 'room')
    # the phone ends it (back button)
    pg.evaluate("() => { window.__hp.app.arStart(); }"); pg.wait_for_timeout(800)
    pg.click('.scrim:last-child .dialog button:has-text("Start AR")'); pg.wait_for_timeout(3000)
    pg.evaluate("() => window.__hp.app._ar.session.end()"); pg.wait_for_timeout(1200)
    check('the phone’s back button ends AR: tidied up the same way', pg.evaluate("() => [!!window.__hp.app._ar, !!document.querySelector('#ar-overlay')]") == [False, False])
    check('no page errors (PC, pretend AR)', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone, dark ─────────
    b, pg = open_app(p, phone=True, theme='dark', init=[FX])
    open_example(pg)
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(800)
    pg.evaluate("() => { window.__hp.app.arStart(); }"); pg.wait_for_timeout(1200)
    fit = pg.evaluate("() => { const d = document.querySelector('.scrim:last-child .dialog'); const r = d.getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth + 1, d.scrollWidth <= d.clientWidth + 1, document.querySelector('#ar-corners').getBoundingClientRect().width > 250]; }")
    check('phone: the room and corners fit the screen', all(fit), fit)
    pg.tap('.scrim:last-child .dialog button:has-text("Start AR")'); pg.wait_for_timeout(4000)
    pa, pb = pg.evaluate("() => { const A = window.__hp.app._ar; return [A.cs.pts[A.cs.a], A.cs.pts[A.cs.b]]; }")
    hp = pg.evaluate("() => document.querySelector('#ar-place').getBoundingClientRect().height")
    check('phone: a big “Place A” button', hp >= 48, hp)
    hit(pg, {'x': pa[0], 'y': -1.3, 'z': pa[1]}); pg.tap('#ar-place'); pg.wait_for_timeout(300)
    hit(pg, {'x': pb[0], 'y': -1.3, 'z': pb[1]}); pg.tap('#ar-place'); pg.wait_for_timeout(1200)
    sz = pg.evaluate("() => [...document.querySelectorAll('#ar-overlay button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [r.height, r.left >= -1 && r.right <= innerWidth + 1]; })")
    check('phone: every button in AR at least 40 px high and on the screen', sz and all(x[0] >= 40 and x[1] for x in sz), sz)
    check('phone: the kitchen laid over the room', pg.evaluate(AR)['fit'] is not None and pg.evaluate(VIS)['furn'])
    pg.screenshot(path=SHOTS + 'r14-phone-ar.png')
    pg.tap('#ar-exit'); pg.wait_for_timeout(1500)
    check('phone: AR stopped and tidied up', pg.evaluate("() => !window.__hp.app._ar && !document.querySelector('#ar-overlay')"))
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
