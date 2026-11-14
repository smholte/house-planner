"""Phone taps (task 0020): one touch tap = one pick (a tapped wall stays picked, also after the browser's own click),
a tap on a room still picks the room, and new furniture lands in the picked room on free floor, in view and big enough."""
from common import *

WALLS = """() => { const a = window.__hp.app, st = a.view.storeyId, pl = a.shownVersion().plan;
  return pl.walls.filter(w => w.storey === st).map(w => ({ id: w.id, a: w.a || w.p1 || w.start, b: w.b || w.p2 || w.end, raw: Object.keys(w) })); }"""
SEL = "() => { const s = window.__hp.app.selection; return s ? s.type : null; }"

def touch_tap(pg, cdp, x, y):
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    pg.wait_for_timeout(60)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

def run(phone, theme):
    tag = ('phone dark' if phone else 'PC light') + ': '
    with sync_playwright() as p:
        b, pg = open_app(p, phone=phone, theme=theme)
        open_example(pg)
        cdp = pg.context.new_cdp_session(pg)
        # a wall: find one whose middle hits a wall (not an opening) by what the app itself says
        pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(300)
        walls = pg.evaluate("""() => { const a = window.__hp.app, v = a.panes[0].view, en = v.editEntry, pl = en.plan, out = [];
          for (const w of pl.walls) { if (w.storey !== en.storey.id) continue;
            const A = w.a || w.p1 || w.start, B = w.b || w.p2 || w.end; if (!A || !B) continue;
            for (const f of [0.25, 0.75]) { const q = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; const h = v.hit(q, en);
              if (h && h.type === 'wall') out.push(q); } }
          return out.slice(0, 6); }""")
        check(tag + 'found walls to tap', len(walls) >= 3, walls)
        bad = []
        for q in walls[:6]:
            show_on_plan(pg, q[0], q[1], top=300, bottom=300)
            x, y = to_screen(pg, q[0], q[1])
            pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(200)
            touch_tap(pg, cdp, x, y)
            pg.wait_for_timeout(900)    # past the double-tap wait and the browser's own click
            t = pg.evaluate(SEL)
            if t not in ('wall', 'opening'): bad.append((q, t))
        check(tag + 'a tapped wall stays picked (never flips to the room)', not bad, bad)
        # a room still picks the room
        pt = room_pt(pg, 'Woonkamer')
        show_on_plan(pg, pt[0], pt[1], top=300, bottom=300)
        pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(200)
        x, y = to_screen(pg, pt[0], pt[1])
        touch_tap(pg, cdp, x, y); pg.wait_for_timeout(900)
        check(tag + 'a tap on a room picks the room', pg.evaluate(SEL) == 'room', pg.evaluate(SEL))
        # new furniture: in the picked room, on free floor, in view and big enough
        pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1200)
        pg.evaluate("() => window.__hp.app.select(null)")
        rid = pg.evaluate("""(n) => { const a = window.__hp.app, pl = a.shownVersion().plan, r = pl.rooms.find(r => r.storey === a.view.storeyId && r.name === n); a.select({ type: 'room', id: r.id }); return r.id; }""", 'Keuken' if False else room_name(pg))
        pg.evaluate("() => window.__hp.app.addFurniture('armchair')"); pg.wait_for_timeout(1500)
        r = pg.evaluate("""(rid) => { const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }; const a = window.__hp.app, v = a.panes[0].view, pl = a.shownVersion().plan, room = pl.rooms.find(r => r.id === rid);
          const lay = a.activeLayout(), it = lay.items[lay.items.length - 1], H = window.__hp;
          const sp = v.toScreen([it.x, it.y]), sz = v.toScreen([it.x + (it.w || 0.8), it.y])[0] - sp[0];
          const ins = v.insets || { top: 0, bottom: 0 };
          return { inRoom: inside([it.x, it.y], room.poly), sp, sz, W: v.W, H: v.H, ins, id: it.id, sel: a.selection && a.selection.type };
        }""", rid)
        check(tag + 'new furniture is in the picked room and stays selected', r['inRoom'] and r['sel'] == 'furn', r)
        check(tag + 'it is in view, in the open part, and at least 40 px wide', 0 < r['sp'][0] < r['W'] and r['ins']['top'] < r['sp'][1] < r['H'] - r['ins']['bottom'] and r['sz'] >= 40, r)
        ov = pg.evaluate("""(rid) => { const a = window.__hp.app, H = window.__hp, lay = a.activeLayout(), it = lay.items[lay.items.length - 1], room = a.shownVersion().plan.rooms.find(r => r.id === rid);
          const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A = poly[i], B = poly[j]; if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
          const box = c => [Math.min(...c.map(q => q[0])), Math.min(...c.map(q => q[1])), Math.max(...c.map(q => q[0])), Math.max(...c.map(q => q[1]))];
          const mine = H.furnCorners(it, 0), bm = box(mine);
          const outside = !mine.every(q => inside(q, room.poly));
          const hit = lay.items.some(f => { if (f === it || f.storey !== it.storey) return false; const t = H.FURN_TYPES.find(x => x.id === f.type) || {}; if (t.flat || t.high) return false; const o = box(H.furnCorners(f, 0)); return Math.min(o[2], bm[2]) - Math.max(o[0], bm[0]) > 0.02 && Math.min(o[3], bm[3]) - Math.max(o[1], bm[1]) > 0.02; });
          return outside || hit; }""", rid)
        check(tag + 'it stands clear of walls and other furniture', not ov)
        check(tag + 'no page errors', not pg.errors, pg.errors)
        b.close()

def room_name(pg): return 'Woonkamer'

run(False, 'light')
run(True, 'dark')
summary()
