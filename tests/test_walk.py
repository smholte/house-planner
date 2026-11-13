"""Walking: start inside the front door, walk with keys (simulated frames), stop at walls, go through open
doors only, climb the stair, path walk with paths made from the plan, evening light."""
from common import *
ST = "() => { const w = window.__hp.app.walker; return w ? w.state() : null; }"
SIM = """([keys, secs, yaw]) => { const w = window.__hp.app.walker; if (yaw != null) w.yaw = yaw; w.keys.clear(); for (const k of keys) w.keys.add(k); const n = Math.round(secs / 0.05); for (let i = 0; i < n; i++) w.tick(0.05); w.keys.clear(); return w.state(); }"""
with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    without_renato(pg)   # (the walls are tested where Layout 1 has no furniture; the Renato layout fills the living room's front corner – round 38)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(800)
    pg.click('#toolrail button[data-tool="walk"]'); pg.wait_for_timeout(4000)
    s0 = pg.evaluate(ST)
    TH = is_testhouse(pg)
    y0, y1 = (9.6, 10.45) if TH else (12.8, 13.6)   # just inside the front door (made-up house: its front at y 10.575; the owner's at 13.73)
    check('walking starts inside the front door', s0 and s0['mode'] == 'free' and y0 < s0['y'] < y1, s0)
    s1 = pg.evaluate(SIM, [['w'], 3, 0])
    check('W walks forward through the hall', s1['y'] < s0['y'] - 3, s1)
    # straight on is the garden door (owner's house): it opens when you walk into it, and you walk out into the garden.
    # (the made-up house's garden doors are not in line with its hall: start in front of the door with side lights, in the study)
    if TH: pg.evaluate("() => { const w = window.__hp.app.walker; w.x = 2.0; w.y = 2.3; w.feet = 0.004; }")
    s2 = pg.evaluate(SIM, [['w'], 10, 0])
    check('the garden door opens when you walk into it: out into the garden', s2['y'] < (-0.2 if TH else 5.0) and s2['feet'] < 0.05, s2)
    # a solid part of an outside wall stops you
    sw = pg.evaluate("""() => { const a = window.__hp.app, plan = a.shownVersion().plan; const st = [...a.project.storeys].sort((x, y) => x.level - y.level)[0];
      const ws = plan.walls.filter(w => w.storey === st.id && w.kind === 'exterior' && w.leaf === 'inner' && Math.abs(w.a[1] - w.b[1]) < 0.02).sort((p, q) => q.a[1] - p.a[1]);
      for (const w of ws) { const x0 = Math.min(w.a[0], w.b[0]) + 0.8, x1 = Math.max(w.a[0], w.b[0]) - 0.8; const d = Math.sign(w.b[0] - w.a[0]);
        for (let x = x0; x <= x1; x += 0.2) { if (plan.openings.some(o => o.wall === w.id && Math.abs(w.a[0] + d * o.pos - x) < o.w / 2 + ((a.project.name || '').startsWith('Testhuis') ? 0.4 : 0.6))) continue;
          if (!a.panes[0].view.roomAt(plan, st.id, [x, w.a[1] - 0.8])) continue;
          // (and no furniture in the way: the made-up toilet's basin stands against its front wall)
          if (a.activeLayout().items.some(f => f.storey === st.id && Math.abs(f.x - x) < f.w / 2 + 0.4 && Math.abs(f.y - (w.a[1] - 0.5)) < 0.8)) continue; return { x, y: w.a[1], t: w.t }; } }
      return null; }""")
    if sw:
        pg.evaluate("([x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.feet = 0.004; }", [sw['x'], sw['y'] - 0.9])
        s2b = pg.evaluate(SIM, [['w'], 4, 3.14159265])
        check('a wall stops you', s2b['y'] < sw['y'] - sw['t'] / 2 + 0.01 and s2b['y'] > sw['y'] - 0.6, [sw, s2b])
    else:
        check('a wall stops you', False, 'no solid outside wall found')
    # close the door between hall and living room: then you can't pass
    # (the door in the inside wall across the hall: owner's house at y 9.73, from x 7.2; made-up house at y 6.05)
    WY = 6.05 if TH else 9.73
    did = pg.evaluate("(wy) => { const a = window.__hp.app, plan = a.shownVersion().plan; const op = plan.openings.find(o => o.kind === 'door' && Math.abs(o.pos) > 0 && (() => { const w = plan.walls.find(x => x.id === o.wall); return w && w.storey === a.view.storeyId && w.kind === 'interior' && Math.abs(w.a[1] - wy) < 0.2 && Math.abs(w.b[1] - wy) < 0.2; })()); if (!op) return null; const w = plan.walls.find(x => x.id === op.wall); return [op.id, w.a[0] + Math.sign(w.b[0] - w.a[0]) * op.pos]; }", WY)
    if did:
        pg.evaluate("([id, x, y]) => { const w = window.__hp.app.walker; w.x = x; w.y = y; w.feet = 0.004; window.__hp.app.setDoorClosed(id, true); }", [did[0], did[1] if TH else 7.2, WY + 1.27])
        s3 = pg.evaluate(SIM, [['w'], 4, 0])
        check('a closed door stops you', s3['y'] > WY + 0.07, s3)
        pg.evaluate("(id) => window.__hp.app.setDoorClosed(id, false)", did[0])
    sl = pg.evaluate("""() => { const a = window.__hp.app, p = a.project; const ss = [...p.storeys].sort((x, y) => x.level - y.level); return window.__hp.stairLine(a.shell, ss[0].id, ss[1].elevation - ss[0].elevation); }""")
    check('stair line found in the builder\'s model', sl and len(sl) >= 10)
    res = pg.evaluate("""(line) => { const w = window.__hp.app.walker; w.x = line[0].x; w.y = line[0].y; w.feet = 0.004; for (let k = 1; k < line.length; k++) for (let i = 1; i <= 8; i++) { const t = i / 8; w.stepTo(line[k-1].x + (line[k].x - line[k-1].x) * t, line[k-1].y + (line[k].y - line[k-1].y) * t, 0.05); } return w.state(); }""", sl)
    check('walking the stair takes you up', res['feet'] > 2.5, res)
    pg.click('.inspector button:has-text("Make paths from rooms and doors")'); pg.wait_for_timeout(800)
    W = pg.evaluate("() => { const w = window.__hp.app.project.walk; return [w.nodes.length, w.edges.length, w.nodes.filter(n => n.stair).length]; }")
    check('paths made, with stairs', W[0] > 40 and W[2] > 20, W)
    pg.click('.walkbar .seg button:has-text("Path")'); pg.wait_for_timeout(2500)
    check('path walk: arrows on the floor', pg.evaluate("() => window.__hp.app.walker.arrows.children.length") > 0)
    r = pg.evaluate("() => { const w = window.__hp.app.walker; const n0 = w.node; const nb = w.neighbours(n0); w.goToNode(nb[0]); for (let i = 0; i < 400 && w.anim; i++) w.tick(0.05); return [n0 !== w.node, w.state()]; }")
    check('path walk moves to the next point', r[0], r)
    pg.evaluate(GPU_SYNC); pg.screenshot(path=SHOTS + 'walk-path.png', timeout=180000)
    pg.evaluate("() => { window.__hp.app.settings.light = 'evening'; window.__hp.app.refreshViews(false); }"); pg.wait_for_timeout(2000)
    check('evening: room lights', pg.evaluate("() => window.__hp.app.panes[0].view.lightPool.length") > 0)
    pg.evaluate(GPU_SYNC); pg.screenshot(path=SHOTS + 'walk-evening.png', timeout=180000)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(1500)
    check('Esc stops walking', pg.evaluate("() => !window.__hp.app.walking"))
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
