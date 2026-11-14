"""Safety 1 (task 0026): a changed example house is backed up like any house (reminder, folder, chip says what was
written); a file from a newer version is refused with a message; a broken house in a file is named and skipped while the
others come in; a file that is too big gets a message; "Replace my copy" asks again when my copy is newer and the copy kept
before replacing stays 30 days; a merge brings drawings, people and section cuts. PC light, phone dark."""
from common import *
import tempfile

TOASTS = "() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent)"
OPFS = "async () => { window.__hp.app._dirPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('bk2', { create: true }); }"
LIST = """async () => { const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('bk2', { create: true });
  const out = []; for await (const [n, hd] of root.entries()) { if (hd.kind === 'file') out.push(n); } return out.sort(); }"""
EXPORT = "async () => JSON.parse(await window.__hp.app.buildExport([window.__hp.app.project], false))"
tmp = tempfile.mkdtemp()

def write(name, d):
    f = os.path.join(tmp, name); open(f, 'w').write(json.dumps(d)); return f

def do_import(pg, f, phone=False):
    with pg.expect_file_chooser() as fc:
        pg.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(f); pg.wait_for_timeout(1200)

def n_projects(pg): return pg.evaluate("async () => (await window.__hp.DB.all('projects')).length")

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    # ── finding 1: the example house
    due = "(dt) => { const a = window.__hp.app, q = { ...a.project }; q.created = Date.now() - 20 * 864e5; q.updated = q.created + dt; a.settings.backupSnooze = {}; a.settings.backups = {}; a._folder = null; return a.backupDue(q, Date.now()); }"
    check('the untouched example: no reminder', not pg.evaluate(due, 1000))
    check('an example that was changed: a reminder', pg.evaluate(due, 3600e3))
    pg.evaluate(OPFS)
    pg.evaluate("async () => { await window.__hp.app.chooseBackupFolder(); }"); pg.wait_for_timeout(1500)
    st = pg.evaluate("() => ({ files: 0, last: window.__hp.app._folder.last, text: window.__hp.app.folderStatusText() })")
    check('untouched example: nothing written, no time shown', pg.evaluate(LIST) == [] and st['last'] == 0 and 'Nothing written' in st['text'], (pg.evaluate(LIST), st))
    n0 = pg.evaluate("async () => await window.__hp.app.folderBackupNow(true)")
    check('Back up now with nothing to write returns 0', n0 == 0, n0)
    pg.evaluate("() => { const a = window.__hp.app; a.project.created -= 3600e3; a.addWall([6, 0], [6, 4], 0.3, 'exterior'); }"); pg.wait_for_timeout(1500)
    n1 = pg.evaluate("async () => await window.__hp.app.folderBackupNow(true)")
    files = pg.evaluate(LIST)
    check('the changed example is written to the folder', n1 == 1 and any(f.endswith('.house.gz') for f in files), (n1, files))
    st = pg.evaluate("() => ({ last: window.__hp.app._folder.last, text: window.__hp.app.folderStatusText() })")
    check('the chip says how many houses were written', st['last'] > 0 and '1 houses written' in st['text'], st)
    check('the changed example is reminded of when no folder is used', pg.evaluate("() => { const a = window.__hp.app; a._folder = null; a.settings.backupSnooze = {}; return a.backupDue({ ...a.project, updated: Date.now() }, Date.now() + 30 * 864e5); }"))

    # ── finding 3: files from a newer version, broken houses
    ex = pg.evaluate(EXPORT)
    base = n_projects(pg)
    newer = json.loads(json.dumps(ex)); newer['formatVersion'] = 7; newer['appVersion'] = 99
    do_import(pg, write('newer.json', newer))
    ts = pg.evaluate(TOASTS)
    check('a file from a newer version is refused with the version numbers', any('version 99' in x and 'Update the app' in x for x in ts) and n_projects(pg) == base, (ts, n_projects(pg), base))
    newer2 = json.loads(json.dumps(ex)); newer2['projects'][0]['project']['schema'] = 9; newer2.pop('appVersion', None)
    do_import(pg, write('newer2.json', newer2))
    check('a house with a newer schema is refused too', any('newer version' in x for x in pg.evaluate(TOASTS)) and n_projects(pg) == base, pg.evaluate(TOASTS))
    good = json.loads(json.dumps(ex)); good['projects'][0]['project']['id'] = 'p_goodnew'; good['projects'][0]['project']['name'] = 'Good house'
    for sp in good['projects'][0]['savePoints']: sp['projectId'] = 'p_goodnew'
    mixed = {**ex, 'projects': [{'project': {'id': 'p_bad1', 'name': 'Broken house'}, 'savePoints': []}, {'project': {'id': 'p_bad2', 'name': 'Odd house', 'versions': 5, 'storeys': []}}, good['projects'][0]]}
    do_import(pg, write('mixed.json', mixed))
    ts = pg.evaluate(TOASTS)
    names = pg.evaluate("async () => (await window.__hp.DB.all('projects')).map(p => p.name)")
    check('a file with two broken houses and one good: the good one is in, the others are named', 'Good house' in names and not any('Broken' in n or 'Odd' in n for n in names) and any('Broken house' in x and 'Odd house' in x and 'skipped' in x for x in ts), (names, ts))
    check('… and the good house opens', pg.evaluate("() => window.__hp.app.project && window.__hp.app.project.id") == 'p_goodnew', pg.evaluate("() => window.__hp.app.project && window.__hp.app.project.id"))
    only_bad = {**ex, 'projects': [{'project': {'id': 'p_bad3', 'name': 'Only broken'}}]}
    before = n_projects(pg)
    do_import(pg, write('bad.json', only_bad))
    check('only broken houses: nothing stored, a message', n_projects(pg) == before and any('Only broken' in x for x in pg.evaluate(TOASTS)), pg.evaluate(TOASTS))
    # ── finding 8: too big (the size is checked before anything is read)
    big = os.path.join(tmp, 'big.house.json')
    with open(big, 'wb') as fh: fh.truncate(160 * 1024 * 1024)
    do_import(pg, big)
    check('a file over the limit gets a message and nothing is stored', any('Files over' in x for x in pg.evaluate(TOASTS)) and n_projects(pg) == before, pg.evaluate(TOASTS))
    os.remove(big)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # ── finding 5: Replace asks when mine is newer; the copy kept stays; finding 6: merge brings drawings, people, cuts
    b, pg = open_app(p)
    open_example(pg)
    pid = pg.evaluate("() => window.__hp.app.project.id")
    pg.evaluate("() => { window.__hp.app.project.created -= 3600e3; }")
    f_old = write('old.json', pg.evaluate(EXPORT))
    pg.evaluate("() => window.__hp.app.addWall([7, 0], [7, 5], 0.3, 'exterior')"); pg.wait_for_timeout(1500)
    nw = "() => window.__hp.app.project.versions.reduce((n, v) => n + v.plan.walls.length, 0)"
    w1 = pg.evaluate(nw)
    do_import(pg, f_old)
    check('my copy is newer: the red note is shown', 'newer than the file' in pg.inner_text('.dialog'))
    pg.click('.dialog .btn:has-text("Replace my copy")'); pg.wait_for_timeout(500)
    txt = pg.inner_text('.dialog')
    check('Replace asks once more, with both times in words', 'Replace your newer copy?' in txt and 'today' in txt and 'Your copy:' in txt, txt)
    pg.screenshot(path=SHOTS + 'safety1-replace-pc.png')
    pg.click('.dialog .btn:has-text("Keep my copy")'); pg.wait_for_timeout(800)
    check('Keep my copy: nothing changed', pg.evaluate(nw) == w1 and pg.evaluate("async () => (await window.__hp.Snapshots.list(window.__hp.app.project.id)).every(s => !/Before importing/.test(s.name))"))
    do_import(pg, f_old)
    pg.click('.dialog .btn:has-text("Replace my copy")'); pg.wait_for_timeout(400)
    pg.click('.dialog .btn:has-text("Replace it")'); pg.wait_for_timeout(2500)
    check('Replace it: my copy is replaced', pg.evaluate(nw) == w1 - 1, (pg.evaluate(nw), w1))
    pg.evaluate("""async () => { const a = window.__hp.app, S = window.__hp.Snapshots; for (let i = 0; i < 12; i++) await S.create(a.project, 'backup', 'Automatic ' + i); }""")
    sn = pg.evaluate("async () => (await window.__hp.Snapshots.list(window.__hp.app.project.id)).filter(s => s.kind === 'backup').map(s => s.name)")
    check('the copy kept before the import is still there after 12 more automatic backups', any('Before importing' in s for s in sn) and len(sn) == 11, sn)

    THEIRS = """() => { const A = window.__hp.app; return A.buildExport([A.project], false).then(t => { const d = JSON.parse(t), p = d.projects[0].project, st = p.storeys[0].id;
      p.updated = Date.now() + 60000; p.people.push({ id: 'pp_theirs', name: 'Their person', eye: 1.7, speed: 1.2 });
      p.underlays = { [st]: { assetId: 'a_theirs', x: 0, y: 0, mPerPx: 0.01, opacity: 0.5, visible: true, calibrated: false, w: 100 } };
      p.slices = { ['storey|' + st]: [{ num: 1, angle: 0, size: 10, p0: [0, 0, 0], n0: [0, 1, 0], n: [0, 1, 0], axis: [1, 0, 0], q: [0, 1.2, 0], center: [0, 1.2, 0] }] };
      return JSON.stringify(d); }); }"""
    f_m = os.path.join(tmp, 'theirs.json'); open(f_m, 'w').write(pg.evaluate(THEIRS))
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    with pg.expect_file_chooser() as fc:
        pg.click('.menu button:has-text("Merge a copy of this house")')
    fc.value.set_files(f_m); pg.wait_for_timeout(900)
    r = pg.evaluate("() => [...document.querySelectorAll('.merge-row')].map(r => [r.querySelector('.merge-lab').textContent, r.querySelector('.tag').textContent, r.querySelector('input').checked])")
    check('the merge lists the drawing, the person and the section cuts, ticked', any('Drawing under' in x[0] and x[2] for x in r) and any('Their person' in x[0] and x[2] for x in r) and any('Section cuts' in x[0] and x[2] for x in r), r)
    pg.click('.scrim:last-child .dialog .btn.primary'); pg.wait_for_timeout(2500)
    res = pg.evaluate("() => { const p = window.__hp.app.project; return { u: Object.values(p.underlays).map(u => u.assetId), people: p.people.map(x => x.id), cuts: Object.keys(p.slices || {}) }; }")
    check('merged: the drawing, the person and the cuts are in the house', 'a_theirs' in res['u'] and 'pp_theirs' in res['people'] and len(res['cuts']) == 1, res)
    sn = pg.evaluate("async () => (await window.__hp.Snapshots.list(window.__hp.app.project.id)).filter(s => /Before merging/.test(s.name)).map(s => !!s.keepUntil)")
    check('the copy kept before the merge is marked for 30 days', sn == [True], sn)
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    # ── phone, dark: the refusal and the second question
    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { window.__hp.app.project.created -= 3600e3; }")
    f_old = write('old2.json', pg.evaluate(EXPORT))
    newer = json.loads(open(f_old).read()); newer['formatVersion'] = 7; newer['appVersion'] = 99
    do_import(pg, write('newer3.json', newer))
    check('phone: newer file refused with a message', any('version 99' in x for x in pg.evaluate(TOASTS)), pg.evaluate(TOASTS))
    pg.screenshot(path=SHOTS + 'safety1-newer-phone-dark.png')
    pg.evaluate("() => window.__hp.app.addWall([7, 0], [7, 5], 0.3, 'exterior')"); pg.wait_for_timeout(1500)
    do_import(pg, f_old)
    pg.tap('.dialog .btn:has-text("Replace my copy")'); pg.wait_for_timeout(500)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: the second question shows both times and fits', 'Your copy:' in pg.inner_text('.dialog') and vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'safety1-replace-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
