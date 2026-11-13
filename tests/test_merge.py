"""Merging two copies of one house: someone sends their copy (a file); "Merge" lists each difference (only in their
copy, different, only in yours), you tick what to take, and a save point of your copy is made first. Through the
⋯ menu and through Import when the house is already on this device. Compressed (gzip) house files can be read. PC and phone."""
from common import *
import gzip, tempfile

THEIRS = """async (RNAME) => {
  const A = window.__hp.app; const d = JSON.parse(await A.buildExport([A.project], false)); const p = d.projects[0].project;
  const now = Date.now() + 60000;
  const pv = p.versions.find(v => v.kind === 'plan');
  const nv = JSON.parse(JSON.stringify(pv)); nv.id = 'v_theirs1'; nv.name = 'Their colours'; p.versions.push(nv);
  const room = pv.plan.rooms.find(r => r.name === RNAME); room.floor = { material: 'pvc', color: '#777777' };
  const wall = pv.plan.walls.filter(w => w.kind !== 'exterior').pop(); pv.plan.walls = pv.plan.walls.filter(w => w.id !== wall.id);
  pv.updated = now;
  const st = p.storeys[0].id;
  p.furniture.layouts[0].items.push({ id: 'f_theirs1', type: 'sofa3', storey: st, x: 2, y: 3, rot: 0, w: 2.2, d: 0.9, h: 0.85, color: '#556677', shop: {} });
  p.notes = p.notes || []; p.notes.push({ id: 'n_theirs1', type: 'todo', status: 'open', text: 'Ask the builder about the meter cupboard', created: now, updated: now, photos: [], at: [1, 1], storey: st });
  const T = window.__hp.tasksOf(p); const rid = pv.plan.rooms[0].id;
  p.tasks = { phases: T.phases, cells: { [rid + '|' + T.phases[0].steps[0].id]: { s: 'done', date: '2026-10-20' } } };
  p.updated = now;
  return [JSON.stringify(d), wall.id, room.id, pv.id];
}"""

def menu(pg, label, phone=False):
    (pg.tap if phone else pg.click)('#btn-menu'); pg.wait_for_timeout(300)
    (pg.tap if phone else pg.click)(f'.menu button:has-text("{label}")')

def rows(pg):
    return pg.evaluate("() => [...document.querySelectorAll('.merge-row')].map(r => [r.querySelector('.merge-lab').textContent, r.querySelector('.tag').textContent, r.querySelector('input').checked])")

tmp = tempfile.mkdtemp()
with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    RN = by_house(pg, 'Keuken', 'Kamer')   # the room whose floor they changed
    text, wall_id, room_id, pv_id = pg.evaluate(THEIRS, RN)
    f1 = os.path.join(tmp, 'house-from-partner.json'); open(f1, 'w').write(text)
    # through the ⋯ menu
    with pg.expect_file_chooser() as fc:
        menu(pg, 'Merge a copy of this house')
    fc.value.set_files(f1); pg.wait_for_timeout(900)
    r = rows(pg)
    lab = lambda s: next((x for x in r if s in x[0]), None)
    check('the merge window lists the differences', pg.is_visible('.merge-list') and len(r) >= 6, r)
    check('their new version: only theirs, ticked', lab('Their colours') and lab('Their colours')[1] == 'Only theirs' and lab('Their colours')[2], lab('Their colours'))
    check('the room they changed: different, ticked (theirs is newer)', lab(RN) and lab(RN)[1] == 'Different' and lab(RN)[2], [x for x in r if RN in x[0]])
    wl = [x for x in r if x[1] == 'Only yours']
    check('the wall they removed: only yours, not ticked (kept)', len(wl) == 1 and wl[0][0].startswith('Wall') and not wl[0][2], wl)
    check('the sofa, the note and the task board are listed', lab('Sofa') and lab('meter cupboard') and any('done' in x[0] for x in r), r)
    n0 = int(pg.inner_text('#merge-count'))
    # skip the note
    pg.click('.merge-row:has-text("meter cupboard") input'); pg.wait_for_timeout(100)
    check('the count follows the ticks', int(pg.inner_text('#merge-count')) == n0 - 1, (n0, pg.inner_text('#merge-count')))
    pg.screenshot(path=SHOTS + 'merge-pc.png')
    pg.click('.scrim:last-child .dialog .btn.primary'); pg.wait_for_timeout(1500)
    res = pg.evaluate("""([wid, rid, pvid]) => { const p = window.__hp.app.project; const pv = p.versions.find(v => v.id === pvid);
      return { versions: p.versions.map(v => v.name), floor: pv.plan.rooms.find(r => r.id === rid).floor, wall: pv.plan.walls.some(w => w.id === wid),
        sofa: p.furniture.layouts[0].items.some(f => f.id === 'f_theirs1'), note: (p.notes || []).some(n => n.id === 'n_theirs1'),
        cells: Object.values((p.tasks || {}).cells || {}).filter(c => c.s === 'done').length }; }""", [wall_id, room_id, pv_id])
    check('merged: their version, their floor, the sofa and the task are in', 'Their colours' in res['versions'] and res['floor']['material'] == 'pvc' and res['sofa'] and res['cells'] == 1, res)
    check('merged: the wall is kept and the skipped note is not taken', res['wall'] and not res['note'], res)
    sp = pg.evaluate("async () => (await window.__hp.Snapshots.list(window.__hp.app.project.id)).map(s => s.name)")
    check('a save point "Before merging a copy" was made', any('Before merging' in s for s in sp), sp)
    # it is stored, not just on screen
    pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app.project", timeout=30000); pg.wait_for_timeout(800)
    check('after reloading the merge is still there', pg.evaluate("() => window.__hp.app.project.versions.some(v => v.name === 'Their colours')"))

    # the same file again through Import: the house is already here → Merge…
    with pg.expect_file_chooser() as fc:
        menu(pg, 'Import a house file')
    fc.value.set_files(f1); pg.wait_for_timeout(700)
    check('import of a house you have offers Merge…', pg.is_visible('.scrim:last-child .dialog .btn:has-text("Merge")'))
    pg.click('.scrim:last-child .dialog .btn:has-text("Merge")'); pg.wait_for_timeout(900)
    r2 = rows(pg)
    check('only what is still different is listed (the note, the wall)', len(r2) == 2 and any('meter cupboard' in x[0] for x in r2) and any(x[1] == 'Only yours' for x in r2), r2)
    pg.click('.merge-row:has-text("Only yours") input'); pg.wait_for_timeout(100)
    pg.click('.scrim:last-child .dialog .btn.primary'); pg.wait_for_timeout(1500)
    res2 = pg.evaluate("([wid]) => { const p = window.__hp.app.project; return [p.versions.find(v => v.kind === 'plan').plan.walls.some(w => w.id === wid), (p.notes || []).some(n => n.id === 'n_theirs1')]; }", [wall_id])
    check('now the wall is removed (ticked) and the note taken', res2 == [False, True], res2)
    # a third time: nothing to merge
    with pg.expect_file_chooser() as fc:
        menu(pg, 'Merge a copy of this house')
    fc.value.set_files(f1); pg.wait_for_timeout(700)
    check('the same copy again: nothing to merge', not pg.is_visible('.merge-list') and 'nothing to merge' in pg.inner_text('#toasts'), pg.inner_text('#toasts'))
    # a file of another house can't be merged into this one
    other = json.loads(text); other['projects'][0]['project']['id'] = 'p_someother'
    f2 = os.path.join(tmp, 'other.json'); open(f2, 'w').write(json.dumps(other))
    with pg.expect_file_chooser() as fc:
        menu(pg, 'Merge a copy of this house')
    fc.value.set_files(f2); pg.wait_for_timeout(700)
    check('a file of another house: says so', 'not a copy of this house' in pg.inner_text('#toasts'))
    # a compressed house file is read too (Keep both)
    f3 = os.path.join(tmp, 'house.house'); open(f3, 'wb').write(gzip.compress(text.encode()))
    with pg.expect_file_chooser() as fc:
        menu(pg, 'Import a house file')
    fc.value.set_files(f3); pg.wait_for_timeout(700)
    pg.click('.scrim:last-child .dialog .btn:has-text("Keep both")'); pg.wait_for_timeout(2000)
    check('a compressed (.house) file imports', '(imported)' in pg.evaluate("() => window.__hp.app.project.name"))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # phone, dark
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    text, *_ = pg.evaluate(THEIRS, by_house(pg, "Keuken", "Kamer"))
    open(f1, 'w').write(text)
    with pg.expect_file_chooser() as fc:
        menu(pg, 'Merge a copy of this house', phone=True)
    fc.value.set_files(f1); pg.wait_for_timeout(900)
    check('phone: the merge window opens', pg.is_visible('.merge-list') and len(rows(pg)) >= 6)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('.scrim:last-child .dialog').getBoundingClientRect().right]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1] and vw[2] <= vw[1] + 1, vw)
    pg.screenshot(path=SHOTS + 'merge-phone-dark.png')
    pg.tap('.scrim:last-child .dialog .btn.primary'); pg.wait_for_timeout(1500)
    check('phone: merged', pg.evaluate("() => window.__hp.app.project.versions.some(v => v.name === 'Their colours')"))
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
