"""A house file from before furniture, notes and walking (the new parts taken out of a fresh export) still opens,
in all three modes, and gets an empty layout and the two default people."""
from common import *
with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    data = json.loads(text)
    pr = data['projects'][0]['project']
    for k in ('furniture', 'notes', 'viewpoints', 'walk', 'people', 'doorState', 'slices', 'viewSettings', 'colours', 'images', 'qty', 'budget', 'tasks', 'models'):
        pr.pop(k, None)
    # session 3: no points, no finishes per wall; tiles written in the paint name, as the IFC import did before
    for v in pr['versions']:
        v['plan'].pop('points', None)
        v['plan'].pop('stairs', None)   # session 4: no stairs drawn in the app, no door / window types, no façade links
        for o in v['plan']['openings']:
            for k in ('style', 'leaves', 'link'): o.pop(k, None)
        for w in v['plan']['walls']: w.pop('fin', None)
        for r in v['plan']['rooms']:
            for k in ('tiles', 'wallBase', 'wallPaper', 'ceilingColor', 'ceilingName', 'ceilingFinish', 'ceilingH', 'heat', 'noQty'): r.pop(k, None)
            if r['name'] == 'Toilet': r['wallColorName'] = 'Wall tiles 300 × 600 to 1.5 m'; r['wallColor'] = '#E9E6DF'
    pr['id'] = 'p_oldfile_test'; pr['name'] = 'Old file'
    open(SHOTS + 'old.house.json', 'w').write(json.dumps(data))
    with pg.expect_file_chooser() as fc:
        pg.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(SHOTS + 'old.house.json'); pg.wait_for_timeout(5000)
    got = pg.evaluate("() => { const p = window.__hp.app.project; return [p.name, p.furniture.layouts.length, p.notes.length, p.walk.nodes.length, p.people.length]; }")
    check('old file opens with the new parts empty', got == ['Old file', 1, 0, 0, 2], got)
    for m in ('furnish', 'view', 'build'):
        pg.click(f'#mode-switch button[data-mode="{m}"]'); pg.wait_for_timeout(800)
        pg.click('#dim-toggle button[data-dim="3d"]'); pg.wait_for_timeout(1800)
        pg.click('#dim-toggle button[data-dim="2d"]'); pg.wait_for_timeout(800)
    t = pg.evaluate("() => window.__hp.app.project.versions[0].plan.rooms.filter(r => r.name === 'Toilet').map(r => [r.tiles && r.tiles.to, r.wallColorName])")
    check('old tiles text becomes real tiles (1.5 m)', t and all(x == [1.5, ''] for x in t), t)
    pg.evaluate("() => { const a = window.__hp.app; a.quantitiesSheet(); }"); pg.wait_for_timeout(800)
    check('quantities work on the old file', pg.is_visible('.qty-table'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => { window.__hp.app.budgetSheet(); }"); pg.wait_for_timeout(600); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => { window.__hp.app.tasksSheet(); }"); pg.wait_for_timeout(600); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # session 4: stairs, dimension lines, a façade window, drawings
    st = pg.evaluate("() => { const a = window.__hp.app, pl = a.shownVersion().plan; return Array.isArray(pl.stairs); }")
    check('the old file gets an empty list of stairs', st)
    pg.evaluate("() => { const a = window.__hp.app; if (a.shownVersion().kind === 'original') a.setDisplay('plan'); }"); pg.wait_for_timeout(1200)
    # (an inner leaf of an outside wall on this storey, at a place with no opening near)
    n = pg.evaluate("""() => { const a = window.__hp.app, pl = a.shownVersion().plan, sid = a.view.storeyId;
      const len = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const free = (w, at) => !pl.openings.some(o => o.wall === w.id && Math.abs(o.pos - at) < o.w / 2 + 0.75);
      for (const w of pl.walls) { if (w.storey !== sid || w.kind !== 'exterior' || w.leaf !== 'inner' || len(w) < 2.5) continue;
        for (let at = 1.0; at < len(w) - 1.0; at += 0.1) if (free(w, at)) { a.addOpening(w.id, 'window', +at.toFixed(2), 1.2); return a.shownVersion().plan.openings.filter(o => o.link).length; } }
      return -1; }""")
    check('a window in an outside wall of the old file goes through its layers', n == 2, n)
    pg.evaluate("() => { window.__hp.app.drawingsSheet(); }")
    pg.wait_for_function("() => !!document.querySelector('.draw-canvas')", timeout=60000)
    check('drawings work on the old file', pg.is_visible('.draw-canvas'))
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]'); pg.wait_for_timeout(500)
    check('all modes work on the old file', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
