"""Floor openings as zones (stairwell, vide): drawn on the plan (dashed, with a cross and its name and size, in
the original too), selected with a tap in Build, moved, resized by a corner (stays a rectangle) or by typing,
made the same in every version (the original included), deleted here or everywhere (undo); the Floor opening tool
(H) draws a new one with two taps, in every version or only this one; the room's floor stops there. And the small
live 3D view next to the plan in Build (off at first) and Furnish (on at first), switched with the 3D chip and set
in Settings. PC and phone."""
from common import *

VOIDS = "() => { const a = window.__hp.app; const st = a.currentStorey(); return (a.shownVersion().plan.voids || []).filter(v => v.storey === st.id); }"
ALLV = "(id) => window.__hp.app.project.versions.map(v => { const x = (v.plan.voids || []).find(y => y.id === id); return x ? JSON.stringify(x.poly) : null; })"
HOLES = "(n) => { const a = window.__hp.app; const pl = a.shownVersion().plan; const st = a.currentStorey(); const r = pl.rooms.find(x => x.name === n && x.storey === st.id); return window.__hp.roomHoles(pl, r).length; }"

def bb(poly):
    xs = [q[0] for q in poly]; ys = [q[1] for q in poly]
    return min(xs), min(ys), max(xs), max(ys)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(400)
    pg.click('#storey-tabs button:has-text("1e verdieping")'); pg.wait_for_timeout(900)
    v = pg.evaluate(VOIDS)
    check('1e verdieping has the stairwell opening from the builder', len(v) == 1 and v[0]['kind'] == 'stair', v)
    vid = v[0]['id']
    check('it is drawn as a zone with a cross, its name and size', pg.evaluate("() => document.querySelectorAll('.void-zone').length === 1 && document.querySelectorAll('.void-cross').length === 1") and 'Stairwell' in pg.evaluate("() => [...document.querySelectorAll('.void-label')].map(e => e.textContent).join(' ')"))
    x0, y0, x1, y1 = bb(v[0]['poly'])
    pg.mouse.click(*to_screen(pg, (x0 + x1) / 2, y0 + 0.4)); pg.wait_for_timeout(500)
    check('a tap in Build selects it', pg.evaluate("() => window.__hp.app.selection && window.__hp.app.selection.type") == 'void')
    ins = pg.inner_text('.inspector')
    check(f'its details: stairwell, size ({round((x1 - x0) * 1000)} wide; the owner\'s 1201), area; the same in every version', 'Stairwell' in ins and str(round((x1 - x0) * 1000)) in pg.input_value('#f-void-w') and 'the original too' in ins, ins[:200])
    check('the Overloop has no floor there', pg.evaluate(HOLES, 'Overloop') == 1)
    # drag a corner: stays a rectangle
    c = to_screen(pg, x0, y0)
    pg.mouse.move(*c); pg.mouse.down(); pg.mouse.move(c[0] + 20, c[1] - 20, steps=6); pg.mouse.move(*to_screen(pg, x0 - 0.2, y0 - 0.3), steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    v2 = pg.evaluate(VOIDS)[0]['poly']
    nx0, ny0, nx1, ny1 = bb(v2)
    rect = all(abs(q[0] - nx0) < 1e-6 or abs(q[0] - nx1) < 1e-6 for q in v2) and all(abs(q[1] - ny0) < 1e-6 or abs(q[1] - ny1) < 1e-6 for q in v2)
    check('dragging a corner makes it bigger and it stays a rectangle', rect and nx0 < x0 - 0.03 and ny0 < y0 - 0.1 and abs(nx1 - x1) < 1e-6, (v2, (x0, y0, x1, y1)))
    pg.fill('#f-void-w', '1000'); pg.press('#f-void-w', 'Enter'); pg.wait_for_timeout(500)
    v3 = pg.evaluate(VOIDS)[0]['poly']
    check('typing the width (1000 mm)', abs((bb(v3)[2] - bb(v3)[0]) - 1.0) < 1e-6, bb(v3))
    allv = pg.evaluate(ALLV, vid)
    check('changed in this version only (the others keep theirs)', len(set(allv)) == 2, allv)
    check('“Same in all versions” is offered', pg.is_visible('#void-all'))
    pg.click('#void-all'); pg.wait_for_timeout(500)
    allv = pg.evaluate(ALLV, vid)
    check('now the same in every version, the locked original too', len(set(allv)) == 1 and allv[0] is not None, allv)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    check('undo: the other versions as they were', len(set(pg.evaluate(ALLV, vid))) == 2)
    pg.keyboard.press('Control+y'); pg.wait_for_timeout(400)
    # the original shows the zone too
    pg.click('#display-toggle button[data-mode="original"]'); pg.wait_for_timeout(600)
    check('the original shows the zone too', pg.evaluate("() => document.querySelectorAll('.void-zone').length") == 1)
    pg.click('#display-toggle button[data-mode="plan"]'); pg.wait_for_timeout(600)
    # delete here, undo
    pg.mouse.click(*to_screen(pg, (bb(v3)[0] + bb(v3)[2]) / 2, bb(v3)[1] + 0.4)); pg.wait_for_timeout(400)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(500)
    check('deleted in this version: the Overloop gets its floor back there', not pg.evaluate(VOIDS) and pg.evaluate(HOLES, 'Overloop') == 0 and pg.evaluate(ALLV, vid)[0] is not None)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
    check('undo brings it back', len(pg.evaluate(VOIDS)) == 1)
    # the tool: a new opening (a vide) in a bedroom, in every version
    pg.keyboard.press('h'); pg.wait_for_timeout(300)
    check('H picks the Floor opening tool', pg.evaluate("() => window.__hp.app.tool") == 'void' and pg.is_visible('#void-all-chip'))
    BED = by_house(pg, 'Slaapkamer 3', 'Slaapkamer 2 (groot)')   # a bedroom over 3 m wide
    r = pg.evaluate("(n) => { const a = window.__hp.app; const st = a.currentStorey(); const r = a.shownVersion().plan.rooms.find(x => x.name === n && x.storey === st.id); const xs = r.poly.map(q => q[0]), ys = r.poly.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }", BED)
    a1 = (r[0] + 1.0, r[1] + 1.0); a2 = (r[0] + 3.0, r[1] + 2.5)
    pg.mouse.click(*to_screen(pg, *a1)); pg.wait_for_timeout(300)
    pg.mouse.move(*to_screen(pg, *a2)); pg.wait_for_timeout(200)
    check('the rectangle shows while drawing', pg.evaluate("() => !!document.querySelector('.chain-void')"))
    pg.mouse.click(*to_screen(pg, *a2)); pg.wait_for_timeout(600)
    sel = pg.evaluate("() => window.__hp.app.selection")
    nv = sel and sel['type'] == 'void' and pg.evaluate("(id) => (window.__hp.app.shownVersion().plan.voids || []).find(v => v.id === id)", sel['id'])
    check('two taps make a floor opening of 2000 × 1500, selected', nv and abs(bb(nv['poly'])[2] - bb(nv['poly'])[0] - 2.0) < 0.06 and abs(bb(nv['poly'])[3] - bb(nv['poly'])[1] - 1.5) < 0.06, nv)
    check('it is in every version, the original too', all(x is not None for x in pg.evaluate(ALLV, sel['id'])))
    check('the bedroom floor stops there', pg.evaluate(HOLES, BED) == 1)
    pg.click('.void-kind button[data-k="vide"]'); pg.wait_for_timeout(400)
    check('it can be a vide', pg.evaluate("(id) => window.__hp.app.shownVersion().plan.voids.find(v => v.id === id).kind", sel['id']) == 'vide')
    pg.click('#void-del-all'); pg.wait_for_timeout(500)
    check('“Delete in all versions”', all(x is None for x in pg.evaluate(ALLV, sel['id'])))
    # only this version
    pg.keyboard.press('h'); pg.wait_for_timeout(300)
    pg.click('#void-all-chip'); pg.wait_for_timeout(200)
    pg.mouse.click(*to_screen(pg, *a1)); pg.wait_for_timeout(250); pg.mouse.click(*to_screen(pg, *a2)); pg.wait_for_timeout(600)
    sel = pg.evaluate("() => window.__hp.app.selection")
    av = pg.evaluate(ALLV, sel['id'])
    check('“All versions” off: only in this version', sum(1 for x in av if x) == 1, av)
    pg.screenshot(path=SHOTS + 'voids-pc.png')
    # 3D: the slab of the floor has the opening (the planned floor is open over the stair)
    check('no page errors', not pg.errors, pg.errors)

    # ── the small live 3D view ──
    pg.keyboard.press('Escape'); pg.evaluate("() => window.__hp.app.setTool('select')"); pg.wait_for_timeout(300)
    check('Build: the 3D chip is there and the small view starts off', pg.is_visible('#pip-chip') and pg.get_attribute('#pip-chip', 'aria-pressed') == 'false' and not pg.evaluate("() => !!window.__hp.app.pip"))
    pg.click('#pip-chip'); pg.wait_for_timeout(2500)
    check('the chip switches it on in Build', pg.evaluate("() => !!(window.__hp.app.pip && window.__hp.app.pipEl && window.__hp.app.pipEl.isConnected)"))
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(2000)
    check('Furnish: on at first', pg.get_attribute('#pip-chip', 'aria-pressed') == 'true' and pg.evaluate("() => !!window.__hp.app.pip"))
    pg.click('#pip-chip'); pg.wait_for_timeout(600)
    check('the chip switches it off in Furnish', not pg.evaluate("() => !!window.__hp.app.pip"))
    pg.click('#mode-switch button[data-mode="build"]'); pg.wait_for_timeout(1500)
    check('back in Build it is still on (each mode remembers)', pg.evaluate("() => !!window.__hp.app.pip"))
    # Settings: Build on, Furnish off at the start
    pg.evaluate("() => { window.__hp.app.settingsSheet(); }"); pg.wait_for_timeout(500)
    check('Settings: Build off, Furnish on', pg.get_attribute('#set-pip-build button[data-k="false"]', 'aria-pressed') == 'true' and pg.get_attribute('#set-pip-furnish button[data-k="true"]', 'aria-pressed') == 'true')
    pg.click('#set-pip-build button[data-k="true"]'); pg.click('#set-pip-furnish button[data-k="false"]'); pg.wait_for_timeout(600)
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app.project", timeout=30000); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const a = window.__hp.app; if (a.mode !== 'build') a.setMode('build'); if (a.view.dim !== '2d') a.setDim('2d'); }"); pg.wait_for_timeout(1500)
    check('after a restart: on in Build', pg.evaluate("() => !!window.__hp.app.pip"))
    pg.click('#mode-switch button[data-mode="furnish"]'); pg.wait_for_timeout(1500)
    check('… and off in Furnish', not pg.evaluate("() => !!window.__hp.app.pip") and pg.get_attribute('#pip-chip', 'aria-pressed') == 'false')
    check('no page errors (small 3D view)', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => window.__hp.app.setDisplay('plan')"); pg.wait_for_timeout(400)
    pg.evaluate("() => { const a = window.__hp.app; a.view.storeyId = a.project.storeys.find(s => s.name === '1e verdieping').id; a.renderEditorChrome(); a.setupPanes(true); }"); pg.wait_for_timeout(1200)
    v = pg.evaluate(VOIDS)[0]
    x0, y0, x1, y1 = bb(v['poly'])
    # (wait until the plan has stopped gliding to its new storey, or the tap lands somewhere else)
    pg.evaluate("""() => new Promise(res => { const v = window.__hp.app.panes[0].view; let last = '', since = performance.now(); const t0 = performance.now();
      const f = () => { const k = [v.cam.s, v.cam.tx, v.cam.ty].map(x => x.toFixed(2)).join(); if (k !== last) { last = k; since = performance.now(); }
        if (performance.now() - since > 600 || performance.now() - t0 > 20000) res(true); else setTimeout(f, 100); }; f(); })""")
    pg.touchscreen.tap(*to_screen(pg, (x0 + x1) / 2, y0 + 0.4)); pg.wait_for_timeout(800)
    try: pg.wait_for_function("() => window.__hp.app.selection && window.__hp.app.selection.type === 'void' && document.querySelector('.void-kind')", timeout=15000)
    except Exception: pass
    check('phone: a tap selects the stairwell and shows its details', pg.evaluate("() => window.__hp.app.selection && window.__hp.app.selection.type") == 'void' and pg.is_visible('.void-kind'))
    check('phone: no small 3D view (no room for it)', not pg.is_visible('#pip-chip') and not pg.evaluate("() => !!window.__hp.app.pip"))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'voids-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
