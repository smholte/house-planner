"""Eleventh round (30 Oct, evening): load-bearing walls from the builder's IFC (wall details, hatched on the plan,
a warning before deleting one or cutting an opening in one, the Changes list); the floor-heating check (the floor's
thermal resistance against ISSO 49, underlay, glued or nailed, a warning per storey; floor heating in the rooms of
your house); your own floor, wall tile or worktop from a photo of a sample at true size (2D and 3D); phones: one bar
above the drawing with short storey names and a menu for original / planned / changes, the bars step aside while you
pan; a menu button closes its own menu again (View, More); the speed check per device. PC and phone (dark).
(The owner's 26 load-bearing walls, the builder's name in the warnings and his IFC import: house/tests/test_round11_own.py.)"""
from common import *
import base64

FX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures') + os.sep
ADD = """async ([b64, name]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return await window.__hp.app.addPicture(new File([u], name, { type: 'image/jpeg' })); }"""
WALL = "(id) => { const w = window.__hp.app.shownVersion().plan.walls.find(x => x.id === id); return w ? { load: w.load ?? null, src: w.loadSrc || null } : null; }"
ROOM = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); return r && JSON.parse(JSON.stringify(r)); }"
SELROOM = "(n) => { const a = window.__hp.app; const r = a.shownVersion().plan.rooms.find(r => r.name === n && r.storey === a.view.storeyId); a.select({ type: 'room', id: r.id, storey: r.storey }); }"
SETFLOOR = "([n, patch]) => window.__hp.app.mutate(pl => { const r = pl.rooms.find(r => r.name === n && r.storey === window.__hp.app.view.storeyId); Object.assign(r.floor, patch); for (const k of Object.keys(patch)) if (patch[k] === null) delete r.floor[k]; })"
CAM = "([cx, cy, s]) => { const v = window.__hp.app.panes[0].view; const r = v.svg.getBoundingClientRect(); v.cam = { s, tx: r.width / 2 - cx * s, ty: r.height / 2 - cy * s }; v.applyCam(); }"
# a load-bearing wall from the IFC on the ground floor (the owner's: the 12 cm concrete wall along the stair)
LOADWALL = """() => { const a = window.__hp.app, st = [...a.project.storeys].sort((x, y) => x.level - y.level)[0].id;
  const ws = a.shownVersion().plan.walls.filter(w => w.storey === st && w.load === true && w.loadSrc === 'ifc' && w.kind === 'interior');
  ws.sort((x, y) => Math.hypot(y.b[0] - y.a[0], y.b[1] - y.a[1]) - Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1])); return ws.length ? ws[0].id : null; }"""
def add_pic(pg, name): return pg.evaluate(ADD, [base64.b64encode(open(FX + name, 'rb').read()).decode(), name])

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    without_renato(pg)   # (the kitchen keeps its own ids in Layout 1; the Renato layout is a copy – round 38)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(800)
    # ───────── U3: load-bearing walls ─────────
    WID = by_house(pg, pg.evaluate(LOADWALL), 'w_yyreby7ij75')
    lw = pg.evaluate("() => window.__hp.app.project.versions.map(v => [v.plan.walls.filter(w => w.load === true).length, v.plan.walls.filter(w => w.load === true && w.loadSrc === 'ifc').length])")
    check('load-bearing from the IFC: the same walls in every version', WID and lw[0][0] > 0 and all(x == lw[0] and x[0] == x[1] for x in lw) and pg.evaluate(WALL, WID) == {'load': True, 'src': 'ifc'}, [WID, lw])
    n = pg.evaluate("() => document.querySelectorAll('.wall-load-hatch').length")
    check('2D: load-bearing walls hatched', n == 1 and pg.evaluate("() => !!document.querySelector('#load-hatch')"), n)
    pg.evaluate("(id) => window.__hp.app.select({ type: 'wall', id })", WID); pg.wait_for_timeout(700)
    ins = pg.inner_text('.inspector')
    check('wall details: “Load-bearing: Yes”, a warning and where it comes from (Pset_WallCommon)', pg.get_attribute('.wall-load button[data-k="yes"]', 'aria-pressed') == 'true' and pg.is_visible('#wall-load-warn') and 'Pset_WallCommon' in ins, ins[:300])
    pg.screenshot(path=SHOTS + 'r11-load-wall.png')
    # delete: asked first
    pg.keyboard.press('Delete'); pg.wait_for_timeout(600)
    dlg = pg.inner_text('.scrim:last-child .dialog') if pg.query_selector('.scrim .dialog') else ''
    check('Delete a load-bearing wall: asked first (structural engineer, check with the builder)', 'load-bearing' in dlg.lower() and 'structural engineer' in dlg and 'check with' in dlg, dlg[:200])
    pg.click('.scrim:last-child .dialog button:has-text("Cancel")'); pg.wait_for_timeout(500)
    check('… Cancel: the wall stays', pg.evaluate(WALL, WID) is not None)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(600)
    pg.click('.scrim:last-child .dialog button:has-text("Delete anyway")'); pg.wait_for_timeout(800)
    check('… Delete anyway: gone (and undo brings it back)', pg.evaluate(WALL, WID) is None)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(700)
    check('… undo', pg.evaluate(WALL, WID) is not None)
    # a door in a load-bearing wall: a warning; in Changes a line for it
    # (the owner's at 2.3 m along the wall, the made-up house's in the middle of its wall)
    pg.evaluate("([id, at]) => { const w = window.__hp.app.shownVersion().plan.walls.find(x => x.id === id); window.__hp.app.addOpening(id, 'door', at || Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / 2, 0.9); }", [WID, by_house(pg, None, 2.3)]); pg.wait_for_timeout(700)
    toast = pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.textContent).join(' | ')")
    check('a door in a load-bearing wall: “an opening needs a lintel … check with the builder”', 'lintel' in toast and 'check with' in toast, toast)
    pg.evaluate("() => window.__hp.app.select(null)"); pg.wait_for_timeout(300)
    pg.click('#display-toggle button[data-mode="diff"]'); pg.wait_for_timeout(1200)
    st0 = pg.evaluate("() => [...window.__hp.app.project.storeys].sort((a, b) => a.level - b.level)[0].id")
    warn = pg.inner_text('#ch-load-' + st0) if pg.query_selector('#ch-load-' + st0) else ''
    check('Changes: “… of it in load-bearing walls – check with the builder”', 'load-bearing' in warn, warn)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(800)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(600)
    # set it yourself; the hatch follows; the View switch
    pg.evaluate("(id) => window.__hp.app.select({ type: 'wall', id })", WID); pg.wait_for_timeout(600)
    pg.click('.wall-load button[data-k="no"]'); pg.wait_for_timeout(600)
    check('set it yourself: No (the IFC source is dropped)', pg.evaluate(WALL, WID) == {'load': False, 'src': None})
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(600)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    pg.click('#mi-load'); pg.wait_for_timeout(800)
    off = pg.evaluate("() => document.querySelectorAll('.wall-load-hatch').length")
    pg.click('#mi-load'); pg.wait_for_timeout(800)
    on = pg.evaluate("() => document.querySelectorAll('.wall-load-hatch').length")
    check('View → “Load-bearing walls (hatched)” switches the hatch off and on', off == 0 and on == 1, (off, on))
    # #117: the View button closes its own menu
    check('the View menu stays open while you switch things in it', pg.is_visible('.menu'))
    pg.click('#btn-viewopts'); pg.wait_for_timeout(400)
    check('… (closed)', not pg.query_selector('.menu'))
    pg.click('#btn-menu'); pg.wait_for_timeout(400)
    m1 = bool(pg.query_selector('.menu'))
    pg.click('#btn-menu'); pg.wait_for_timeout(400)
    check('the More (⋯) button opens its menu and closes it again', m1 and not pg.query_selector('.menu'))
    # ───────── U4: floor heating ─────────
    heat = pg.evaluate("() => window.__hp.app.project.versions.map(v => v.plan.rooms.filter(r => r.heat && r.heat.on).length)")
    check('floor heating in the rooms of the ground and first floor, every version', all(n >= by_house(pg, 5, 12) for n in heat), heat)
    pg.evaluate(SETFLOOR, ['Woonkamer', {'material': 'oak', 'thick': None, 'under': None, 'fix': None}]); pg.wait_for_timeout(500)
    pg.evaluate(SELROOM, 'Woonkamer'); pg.wait_for_timeout(700)
    v0 = pg.get_attribute('#fh-verdict', 'class') or ''
    txt = pg.inner_text('#fh-check')
    check('parquet 15 mm glued: R 0.094 m²K/W, good (ISSO 49: max 0.15, advised ≤ 0.10)', 'fh-good' in v0 and '0.094' in txt and 'ISSO 49' in txt, (v0, txt[:200]))
    check('the Floor section says it too', 'R 0.094' in pg.inner_text('#fh-line'))
    pg.select_option('#f-fh-under', 'foam'); pg.wait_for_timeout(700)
    v1 = pg.get_attribute('#fh-verdict', 'class') or ''
    check('with a foam underlay: R 0.154 – too insulating', 'fh-bad' in v1 and '0.154' in pg.inner_text('#fh-verdict'), pg.inner_text('#fh-verdict'))
    pg.click('.fh-fix button[data-k="nailed"]'); pg.wait_for_timeout(600)
    check('nailed parquet: “must be glued, never nailed”', 'never nailed' in pg.inner_text('#fh-check'))
    pg.screenshot(path=SHOTS + 'r11-floorheat.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    wl = pg.inner_text('#fh-warn-list') if pg.query_selector('#fh-warn-list') else ''
    check('the storey: “Floor heating: the floor is too insulating in Woonkamer”', 'Woonkamer' in wl, wl)
    R = pg.evaluate("() => { const f = window.__hp.floorHeatR; return [f({ material: 'laminate' }).r, f({ material: 'tiles' }).verdict, f({ material: 'carpet', under: 'felt' }).verdict, f({ material: 'screed' }).verdict, f({ material: 'oak', under: 'own', underR: 0.02 }).r]; }")
    check('values: laminate 8 mm on a thin underlay 0.057, tiles good, carpet with underlay too warm, screed nothing, own underlay value',
          near(R[0], 0.057, 0.001) and R[1] == 'good' and R[2] == 'bad' and R[3] == 'none' and near(R[4], 0.114, 0.001), R)
    # ───────── N3: floor, tile and worktop from a photo ─────────
    ids = [add_pic(pg, n) for n in ('sample-plank.jpg', 'sample-tile.jpg', 'sample-worktop.jpg')]
    check('three sample photos added', all(ids), ids)
    pg.evaluate(SELROOM, 'Keuken'); pg.wait_for_timeout(700)
    pg.click('#f-floor-photo'); pg.wait_for_timeout(600)
    check('the floor: “Choose a photo…” opens the pictures', pg.locator('.scrim:last-child .pic-card').count() >= 3)
    # (the cards in the house's order: since round 38 the floor picture of your house comes first)
    pg.locator('.scrim:last-child .pic-card').nth(pg.evaluate("(id) => Object.keys(window.__hp.app.project.images).indexOf(id)", ids[1])).click(); pg.wait_for_timeout(900)
    kk = pg.evaluate(ROOM, 'Keuken')
    check('… the tile photo on the kitchen floor', kk['floor'].get('photo', {}).get('img') == ids[1], kk['floor'])
    pg.evaluate(SETFLOOR, ['Keuken', {'material': 'tiles', 'l': 0.2, 'w': 0.2, 'photo': {'img': ids[1], 'mode': 'piece'}}]); pg.wait_for_timeout(500)
    pg.evaluate(SETFLOOR, ['Woonkamer', {'under': None, 'fix': None, 'photo': {'img': ids[0], 'mode': 'piece'}}]); pg.wait_for_timeout(500)
    KAMER = by_house(pg, 'Werkkamer', 'Kamer')
    pg.evaluate(SETFLOOR, [KAMER, {'material': 'cast', 'photo': {'img': ids[2], 'w': 0.4, 'h': 0.3}}]); pg.wait_for_timeout(1500)
    pg.evaluate(CAM, [*by_house(pg, room_pt(pg, 'Keuken', 1.0, 0.5), [8.0, 8.0]), 110]); pg.wait_for_timeout(1200)
    uses = pg.evaluate("() => [document.querySelectorAll('pattern use').length, document.querySelectorAll('defs image').length]")
    check('2D: the photo in every tile and plank (one picture, used many times)', uses[0] > 30 and uses[1] >= 3, uses)
    pg.screenshot(path=SHOTS + 'r11-photo-floor-2d.png')
    blue = pg.evaluate("""() => { const a = window.__hp.app, r = a.shownVersion().plan.rooms.find(r => r.name === 'Keuken'); const m = window.__hp.floorMaterial(r.floor); const c = m.map && m.map.image;
      if (!c || !c.getContext) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 2] > d[i] + 25) n++; return n; }""")
    check('3D: the kitchen floor texture holds the tile photo (its blue pattern)', blue > 50, blue)
    pat = pg.evaluate("""(n) => { const r = window.__hp.app.shownVersion().plan.rooms.find(r => r.name === n); const m = window.__hp.floorMaterial(r.floor); return m.map ? [m.map.image && m.map.image.tagName, +(1 / m.map.repeat.x).toFixed(3), +(1 / m.map.repeat.y).toFixed(3)] : null; }""", KAMER)
    check('3D: a piece of floor repeated at its size (40 × 30 cm)', pat == ['IMG', 0.4, 0.3], pat)
    # wall tiles from a photo (the toilet)
    pg.evaluate("(img) => window.__hp.app.mutate(pl => { const r = pl.rooms.find(r => r.name === 'Toilet' && r.storey === window.__hp.app.view.storeyId); r.tiles = { ...r.tiles, img }; })", ids[1]); pg.wait_for_timeout(800)
    tb = pg.evaluate("""() => { const r = window.__hp.app.shownVersion().plan.rooms.find(r => r.name === 'Toilet' && r.storey === window.__hp.app.view.storeyId); const m = window.__hp.tileMat(r.tiles); const c = m.map.image; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 2] > d[i] + 25) n++; return n; }""")
    check('wall tiles from a photo of one tile: every tile shows it', tb > 50, tb)
    # a worktop from a photo (the run with the sink)
    KB = pg.evaluate("() => { const L = window.__hp.app.activeLayout(); const f = L.items.find(i => i.type === 'krun' && (i.units || []).some(u => u.k === 'sink')); return f && f.id; }")
    pg.evaluate("([img, id]) => window.__hp.app.furnMutate(l => { const it = l.items.find(i => i.id === id); it.topMat = 'photo'; it.topImg = img; it.topImgW = 0.3; })", [ids[2], KB]); pg.wait_for_timeout(600)
    wt = pg.evaluate("(id) => { const it = window.__hp.app.activeLayout().items.find(i => i.id === id); const m = window.__hp.kTopMat(it); return m.map ? [m.map.image.tagName, +(1 / m.map.repeat.x).toFixed(3)] : null; }", KB)
    check('a worktop from a photo of a sample, 30 cm wide in the photo', wt == ['IMG', 0.3], wt)
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(800)
    pg.evaluate("(id) => { const a = window.__hp.app; a.select({ type: 'furn', ids: [id] }); if (a.toggleInspector) a.toggleInspector(true); }", KB); pg.wait_for_timeout(1000)
    check('the kitchen look: “From a photo” with the photo and its width', pg.get_attribute('.kit-topmat button[data-k="photo"]', 'aria-pressed') == 'true' and pg.is_visible('#f-kit-top-photo') and pg.input_value('#f-kit-topimgw') == '30')
    pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(5000)
    pg.evaluate("() => { const v = window.__hp.app.panes[0].view; v.controls.target.set(10.6, 0.8, 11.0); v.camera.position.set(13.0, 3.6, 7.6); v.controls.update(); v.needs = true; }"); pg.wait_for_timeout(1800); pg.evaluate(STILL)
    pg.screenshot(path=SHOTS + 'r11-photo-3d.png')
    pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(1000)
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(600)
    # ───────── P1: speed check ─────────
    fs = pg.evaluate("() => [window.__hp.frameStats([16, 16, 17, 18, 100]), window.__hp.speedAdvice([{ q: 'fast', fps: 60, p95: 20 }, { q: 'beautiful', fps: 40, p95: 40 }, { q: 'high', fps: 20, p95: 90 }])]")
    check('speed: the middle frame time → pictures a second; the best smooth quality is suggested', fs[0]['fps'] == 58.8 and fs[1] == 'beautiful', fs)
    before = pg.evaluate("() => [window.__hp.app.view.dim, window.__hp.app.view.scope]")
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_timeout(800)
    pg.click('#set-speed'); pg.wait_for_timeout(1000)
    pg.wait_for_selector('#speed-use', timeout=180000)
    body = pg.inner_text('#speed-body')
    rows = pg.locator('#speed-table .speed-row').count()
    check('Settings → Speed check: the whole house turns in 3D and is measured (pictures a second, draw calls, the device)', rows >= 1 and 'per second' in body and 'draw calls' in body and 'Screen' in body, body[:300])
    pg.screenshot(path=SHOTS + 'r11-speed.png')
    pg.click('#speed-use'); pg.wait_for_timeout(2500)
    after = pg.evaluate("() => [window.__hp.app.view.dim, window.__hp.app.view.scope, window.__hp.app.settings.quality]")
    check('… “Use … on this device” sets it, and the view goes back to where it was', after[:2] == before and after[2] in ('fast', 'beautiful', 'high'), (before, after))
    check('no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark): one bar, short names, the bars step aside ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(900)
    bar = pg.evaluate("() => [document.querySelector('.viewbar').getBoundingClientRect().height, document.querySelector('#stage').getBoundingClientRect().top]")
    check('phone: one bar above the drawing (the drawing starts about 100 px from the top)', bar[0] < 56 and bar[1] < 110, bar)
    tabs = pg.evaluate("() => [...document.querySelectorAll('#storey-tabs .st-short')].filter(e => e.getBoundingClientRect().width > 0).map(e => e.textContent)")
    check('phone: short storey names (BG · 1e · …)', tabs[:3] == by_house(pg, ['BG', '1e', 'Zold'], ['BG', '1e', '2e']), tabs)
    check('phone: Original / Planned / Changes in one button', pg.is_visible('#btn-display') and not pg.is_visible('#display-toggle') and 'Planned' in pg.inner_text('#btn-display'))
    pg.tap('#btn-display'); pg.wait_for_timeout(500)
    items = pg.evaluate("() => [...document.querySelectorAll('.menu .mi')].map(e => e.textContent.trim())")
    check('… its menu: Original, Planned, Changes, Side by side, Compare, Home view', items == ['Original', 'Planned', 'Changes', 'Side by side', 'Compare', 'Home view'], items)
    pg.screenshot(path=SHOTS + 'r11-phone-display.png')
    pg.tap('.menu .mi:has-text("Changes")'); pg.wait_for_timeout(1200)
    check('… Changes chosen', pg.evaluate("() => window.__hp.app.display") == 'diff' and 'Changes' in pg.inner_text('#btn-display'))
    pg.tap('#btn-display'); pg.wait_for_timeout(400)
    pg.tap('#btn-display'); pg.wait_for_timeout(400)
    check('phone: the button again closes its menu', not pg.query_selector('.menu'))
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(800)
    # one finger pans (View: a drag never moves anything): the bars step aside, the drawing stays under the finger, they come back after
    pg.tap('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(3000)
    s0 = pg.evaluate("() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    w0 = pg.evaluate("([x, y]) => { const v = window.__hp.app.panes[0].view, r = v.svg.getBoundingClientRect(); return v.toWorld([x - r.left, y - r.top]); }", s0)
    cdp = pg.context.new_cdp_session(pg)
    x, y = s0
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for k in range(1, 9): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + k * 5, 'y': y + k * 7}]}); pg.wait_for_timeout(40)
    away = pg.evaluate("() => [document.querySelector('#editor').classList.contains('bars-away'), document.querySelector('#stage').getBoundingClientRect().top]")
    w1 = pg.evaluate("([x, y]) => { const v = window.__hp.app.panes[0].view, r = v.svg.getBoundingClientRect(); return v.toWorld([x - r.left, y - r.top]); }", [x + 40, y + 56])
    pg.screenshot(path=SHOTS + 'r11-phone-pan.png')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(2200)
    back = pg.evaluate("() => [document.querySelector('#editor').classList.contains('bars-away'), document.querySelector('#stage').getBoundingClientRect().top]")
    check('phone: while panning the bars step aside (the drawing gets almost the whole height: a strip of the top bar stays)', away[0] and away[1] < 30, away)
    check('… the drawing stays under the finger', near(w0[0], w1[0], 0.05) and near(w0[1], w1[1], 0.05), (w0, w1))
    check('… and the bars come back when you let go', back[0] is False and back[1] > 60, back)
    pg.tap('#btn-viewopts'); pg.wait_for_timeout(400)
    m = bool(pg.query_selector('.menu'))
    pg.tap('#btn-viewopts'); pg.wait_for_timeout(400)
    check('phone: the View button opens and closes its menu', m and not pg.query_selector('.menu'))
    # the wall details on a phone
    WID = by_house(pg, pg.evaluate(LOADWALL), 'w_yyreby7ij75')
    pg.evaluate("(id) => window.__hp.app.select({ type: 'wall', id })", WID); pg.wait_for_timeout(900)
    check('phone: the wall details show load-bearing', pg.is_visible('#wall-load-warn'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'r11-phone-wall.png')
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()

sys.exit(summary())
