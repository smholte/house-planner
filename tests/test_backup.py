"""Backups: a reminder when a house changed and its last backup is older than a week (once a day; every week,
2 weeks or never); export as a compressed file (.house.gz, about three times smaller) or plain (.house.json);
on a computer: automatic copies into a chosen folder after each change, with one dated copy per day (the last
14 kept), remembered after a restart. PC and phone."""
from common import *
import gzip

OPFS = "async () => { window.__hp.app._dirPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('bk', { create: true }); }"
# the test browser can't keep a folder in its database, so the remembered folder is handed in by the test
TESTF = "window.__hpTestFolder = async () => ({ handle: await (await navigator.storage.getDirectory()).getDirectoryHandle('bk', { create: true }) });"
LIST = """async () => { const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('bk', { create: true });
  const out = []; for await (const [n, hd] of root.entries()) { if (hd.kind === 'file') out.push(n); else for await (const [m] of hd.entries()) out.push(n + '/' + m); } return out.sort(); }"""
READ = """async (name) => { let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bk');
  const parts = name.split('/'); for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  const f = await (await d.getFileHandle(parts.slice(-1)[0])).getFile();
  return JSON.parse(await new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text()); }"""
TOASTS = "() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent)"

def new_house(pg, name='Backup test'):
    pg.click('#btn-new'); pg.wait_for_timeout(400)
    pg.fill('.dialog input', name); pg.click('.dialog .btn.primary'); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__hp.app.addWall([0, 0], [6, 0], 0.3, 'exterior')"); pg.wait_for_timeout(1200)

def reopen(pg):
    pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app.project", timeout=30000); pg.wait_for_timeout(3200)

def age_backup(pg, days):
    pg.evaluate("""(days) => { const a = window.__hp.app; const id = a.project.id; a.settings.backups = { [id]: Date.now() - days * 864e5 };
      a.settings.backupSnooze = {}; window.__hp.Settings.save(); }""", days); pg.wait_for_timeout(700)

with sync_playwright() as p:
    b, pg = open_app(p)
    new_house(pg)
    reopen(pg)
    check('a new house: no reminder yet', not any('backup' in x for x in pg.evaluate(TOASTS)), pg.evaluate(TOASTS))
    age_backup(pg, 8)
    reopen(pg)
    ts = pg.evaluate(TOASTS)
    check('changed, last backup 8 days ago: a reminder', any('8 days old' in x and 'Save a copy' in x for x in ts), ts)
    check('… on a computer it also points to the automatic backup into a folder', any('Automatic backup into a folder' in x for x in ts), ts)
    # one tap: the copy is saved at once (a computer: downloaded)
    with pg.expect_download() as dl:
        pg.click('#toasts .toast:has-text("days old") button')
    fn = dl.value.suggested_filename
    data = json.loads(gzip.decompress(open(dl.value.path(), 'rb').read()))
    check('a compressed file .house.gz with the house', fn.endswith('.house.gz') and data['format'] == 'house-planner' and data['projects'][0]['project']['name'] == 'Backup test', fn)
    last = pg.evaluate("() => { const a = window.__hp.app; return Date.now() - a.lastBackupOf(a.project); }")
    check('the backup is noted', 0 <= last < 60000, last)
    reopen(pg)
    check('after the backup: no reminder', not any('days old' in x for x in pg.evaluate(TOASTS)))
    # once a day
    age_backup(pg, 9)
    reopen(pg)
    first = any('9 days old' in x for x in pg.evaluate(TOASTS))
    reopen(pg)
    check('the reminder comes once a day, not on every start', first and not any('days old' in x for x in pg.evaluate(TOASTS)))
    # setting: never
    age_backup(pg, 9)
    pg.click('#btn-menu'); pg.wait_for_timeout(300); pg.click('.menu button:has-text("Settings")'); pg.wait_for_timeout(500)
    pg.click('#bk-remind button[data-k="0"]'); pg.wait_for_timeout(500)
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]')
    reopen(pg)
    check('“Never”: no reminder', not any('days old' in x for x in pg.evaluate(TOASTS)))
    # plain file
    pg.click('#btn-menu'); pg.wait_for_timeout(300); pg.click('.menu button:has-text("Export")'); pg.wait_for_timeout(600)
    pg.click('#ex-zip'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl:
        pg.click('.dlg-foot button:has-text("Save file")')
    check('compressed off: a plain .house.json', dl.value.suggested_filename.endswith('.house.json') and json.loads(open(dl.value.path()).read())['format'] == 'house-planner')
    pg.evaluate("() => window.__hp.Settings.set('exportZip', true)")

    # ── folder backup ──
    pg.evaluate("() => window.__hp.Settings.set('backupRemind', 7)")
    pg.add_init_script(TESTF); pg.evaluate("() => { " + TESTF + " }")
    pg.evaluate(OPFS)
    pg.click('#btn-menu'); pg.wait_for_timeout(300); pg.click('.menu button:has-text("Settings")'); pg.wait_for_timeout(500)
    pg.click('#bk-choose'); pg.wait_for_timeout(2500)
    st = pg.inner_text('#bk-folder-status')
    files = pg.evaluate(LIST)
    pid = pg.evaluate("() => window.__hp.app.project.id")
    check('folder chosen: a copy of the house and a dated copy in “older”', any(f.startswith('backup-test_') and f.endswith('.house.gz') for f in files) and any(f.startswith('older/backup-test_') for f in files), files)
    check('the status says where and when', 'bk' in st and 'Last copy' in st, st)
    pg.screenshot(path=SHOTS + 'backup-settings-pc.png')
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]')
    main = next(f for f in files if f.startswith('backup-test_'))
    d0 = pg.evaluate(READ, main)
    check('the copy is a whole house file', d0['projects'][0]['project']['id'] == pid and len(d0['projects'][0]['project']['versions'][0]['plan']['walls']) >= 1)
    # after a change the copy follows
    pg.evaluate("() => { window.__hp.app._backupDelay = 400; window.__hp.app.addWall([6, 0], [6, 4], 0.3, 'exterior'); }")
    pg.wait_for_timeout(3500)
    d1 = pg.evaluate(READ, main)
    nw = lambda d: sum(len(v['plan']['walls']) for v in d['projects'][0]['project']['versions'])
    check('after a change the folder copy is updated', nw(d1) == nw(d0) + 1, (nw(d0), nw(d1)))
    # the example house is not copied
    check('no reminder while the folder backup runs', not pg.evaluate("() => window.__hp.app.backupDue(window.__hp.app.project, Date.now() + 30 * 864e5)"))
    # the newest 14 dated copies are kept
    base = main.split('.house')[0]
    pg.evaluate("""async (base) => { const o = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bk')).getDirectoryHandle('older');
      for (let i = 1; i <= 16; i++) { const d = new Date(2026, 8, i); const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const w = await (await o.getFileHandle(base + '_' + s + '.house.gz', { create: true })).createWritable(); await w.write('x'); await w.close(); } }""", base)
    pg.evaluate("() => window.__hp.app.folderBackupNow(true)"); pg.wait_for_timeout(1500)
    older = [f for f in pg.evaluate(LIST) if f.startswith('older/' + base + '_')]
    check('only the newest 14 dated copies are kept', len(older) == 14 and not any('2026-09-01' in f or '2026-09-03' in f for f in older), older[:3])
    # remembered after a restart
    reopen(pg)
    ok = pg.evaluate("() => !!(window.__hp.app._folder && window.__hp.app._folder.ok)")
    supported = pg.evaluate("() => 'showDirectoryPicker' in window")
    check('after a restart the folder backup continues', ok or not supported, (ok, supported))
    # stop
    pg.evaluate(OPFS)
    pg.click('#btn-menu'); pg.wait_for_timeout(300); pg.click('.menu button:has-text("Settings")'); pg.wait_for_timeout(500)
    if pg.is_visible('#bk-stop'):
        pg.click('#bk-stop'); pg.wait_for_timeout(500)
    check('stop: the choose button is back', pg.is_visible('#bk-choose') and not pg.evaluate("() => localStorage.getItem('house-planner.folder')"))
    pg.click('.scrim:last-child .dialog .dlg-head button[aria-label="Close"]')
    # if opening the folder ever failed half-way, the app forgets it and says so (and starts normally)
    pg.evaluate("() => { localStorage.setItem('house-planner.folder', '{}'); localStorage.setItem('house-planner.folder-reading', '1'); }")
    reopen(pg)
    check('a half-finished folder read: forgotten, with a message', any('could not be opened again' in x for x in pg.evaluate(TOASTS)) and not pg.evaluate("() => localStorage.getItem('house-planner.folder')"), pg.evaluate(TOASTS))
    check('no page errors', not pg.errors, pg.errors)
    b.close()

    b, pg = open_app(p, phone=True, theme='dark')
    open_example(pg)
    pg.evaluate("() => { window.__hp.app.folderSupported = () => false; }")
    pg.tap('#btn-menu'); pg.wait_for_timeout(400); pg.tap('.menu button:has-text("Settings")'); pg.wait_for_timeout(600)
    check('phone: reminder choice, and the folder backup is explained as a computer thing', pg.is_visible('#bk-remind') and 'computer' in pg.inner_text('.bk-folder'))
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    pg.screenshot(path=SHOTS + 'backup-settings-phone-dark.png')
    check('phone: no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
