"""Seventeenth round (31 Oct, afternoon): the automatic backup into a folder made easy to find and see – a chip in the
top bar with the time of the last copy (or Paused: click to continue; click for Back up now), the folder from the
Export window, ⋯ and Search – and the backup reminder's one tap: on a phone the copy goes to the share sheet (Proton
Drive, Files, mail …), on a computer it is downloaded. PC (light) and phone (dark)."""
from common import *
import gzip, re

OPFS = "async () => { window.__hp.app._dirPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('bk17', { create: true }); }"
TESTF = "window.__hpTestFolder = async () => ({ handle: await (await navigator.storage.getDirectory()).getDirectoryHandle('bk17', { create: true }) });"
LIST = "async () => { const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('bk17', { create: true }); const out = []; for await (const [n, hd] of root.entries()) if (hd.kind === 'file') out.push(n); return out.sort(); }"
TOASTS = "() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent)"
CHIP = "() => { const b = document.querySelector('#folder-status'); const r = b.getBoundingClientRect(); return { hidden: b.hidden || r.width === 0, state: b.dataset.state, text: b.textContent.trim(), title: b.title, w: Math.round(r.width) }; }"
SHARE = """() => { window.__shared = []; navigator.canShare = d => !!(d && d.files && d.files.length && (window.__shareTypes ? window.__shareTypes(d.files[0]) : true));
  navigator.share = async d => { for (const f of d.files) window.__shared.push([f.name, f.type, f.size, await f.text().then(x => x.slice(0, 2)).catch(() => '')]); }; }"""

def new_house(pg, name, phone=False):
    (pg.tap if phone else pg.click)('#btn-new'); pg.wait_for_timeout(400)
    pg.fill('.dialog input', name); (pg.tap if phone else pg.click)('.dialog .btn.primary'); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__hp.app.addWall([0, 0], [6, 0], 0.3, 'exterior')"); pg.wait_for_timeout(1200)

def reopen(pg):
    pg.reload(); pg.wait_for_function("() => window.__hp && window.__hp.app.project", timeout=30000); pg.wait_for_timeout(3500)

def age_backup(pg, days):
    pg.evaluate("""(days) => { const a = window.__hp.app; const id = a.project.id; a.settings.backups = { [id]: Date.now() - days * 864e5 }; a.settings.backupSnooze = {};
      a.project.updated = Date.now(); window.__hp.Settings.save(); }""", days)

with sync_playwright() as p:
    # ───────── PC (light) ─────────
    b, pg = open_app(p)
    new_house(pg, 'Folder test')
    pg.add_init_script(TESTF); pg.evaluate("() => { " + TESTF + " }")
    pg.evaluate(OPFS)
    check('no backup folder yet: no chip in the top bar', pg.evaluate(CHIP)['hidden'])
    # from the Export window
    pg.click('#btn-share'); pg.wait_for_timeout(900)
    ex = pg.evaluate("() => { const e = document.querySelector('#ex-folder'); return e ? e.textContent : null; }")
    check('Export window: “Automatic backup into a folder” with Choose folder…', ex and 'Automatic backup into a folder' in ex and 'Choose folder' in ex, ex)
    pg.click('#btn-export-folder'); pg.wait_for_timeout(700)
    check('… it opens the folder window (and closes Export)', pg.is_visible('#bk-choose') and not pg.query_selector('#ex-zip'))
    pg.click('#bk-choose'); pg.wait_for_timeout(2500)
    files = pg.evaluate(LIST)
    check('folder chosen: the house is copied there', any(f.startswith('folder-test_') and f.endswith('.house.gz') for f in files), files)
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(400)
    c = pg.evaluate(CHIP)
    check('the chip in the top bar: the time of the last copy', not c['hidden'] and c['state'] == 'ok' and re.match(r'^\d{1,2}[:.]\d\d', c['text']) and 'Last copy' in c['title'], c)
    pg.screenshot(path=SHOTS + 'r17-chip-pc.png', clip={'x': 600, 'y': 0, 'width': 680, 'height': 60})
    # after a change it follows
    l0 = pg.evaluate("() => window.__hp.app._folder.last")
    pg.evaluate("() => { window.__hp.app._backupDelay = 400; window.__hp.app.addWall([6, 0], [6, 4], 0.3, 'exterior'); }"); pg.wait_for_timeout(3500)
    l1 = pg.evaluate("() => window.__hp.app._folder.last")
    check('after a change: a new copy, the chip follows', l1 > l0 and pg.evaluate(CHIP)['state'] == 'ok', (l0, l1))
    # click: Back up now
    pg.click('#folder-status'); pg.wait_for_timeout(400)
    mi = pg.evaluate("() => [...document.querySelectorAll('.menu .mi, .menu .fs-head')].map(e => e.textContent.trim())")
    check('click the chip: where and when, Back up now, the folder window', any('Into “bk17”' in x for x in mi) and any('Back up now' in x for x in mi) and any('Automatic backup into a folder' in x for x in mi), mi)
    pg.click('.menu .mi:has-text("Back up now")'); pg.wait_for_timeout(1500)
    check('… Back up now copies at once', any('copied into the folder' in x for x in pg.evaluate(TOASTS)), pg.evaluate(TOASTS))
    # paused (after a restart the browser asks again): the chip says so, a click continues
    pg.evaluate("() => window.__hp.app.folderPaused()"); pg.wait_for_timeout(400)
    c = pg.evaluate(CHIP)
    check('paused: the chip says Paused, click to continue', c['state'] == 'paused' and c['text'] == 'Paused' and 'Click to continue' in c['title'], c)
    pg.click('#folder-status'); pg.wait_for_timeout(1500)
    check('… a click continues the backup', pg.evaluate(CHIP)['state'] == 'ok' and pg.evaluate("() => window.__hp.app._folder.ok"))
    # ⋯ and search
    pg.click('#btn-menu'); pg.wait_for_timeout(300)
    check('⋯ menu: Automatic backup into a folder…', pg.is_visible('#mi-folder'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if pg.query_selector('.menu'): pg.click('#btn-menu'); pg.wait_for_timeout(200)
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(400)
    pg.fill('#search-q', 'proton'); pg.wait_for_timeout(300)
    hits = pg.evaluate("() => [...document.querySelectorAll('#search-list .sr-label')].map(e => e.textContent)")
    check('Search “proton”: the folder backup and a copy now', any('Automatic backup into a folder' in x for x in hits) and any('Save a copy of this house now' in x for x in hits), hits)
    with pg.expect_download() as dl:
        pg.click('#search-list .search-row:has-text("Save a copy of this house now")')
    fn = dl.value.suggested_filename
    data = json.loads(gzip.decompress(open(dl.value.path(), 'rb').read()))
    check('… “Save a copy of this house now” on a computer: downloaded, a whole compressed house file', fn.endswith('.house.gz') and data['projects'][0]['project']['name'] == 'Folder test', fn)
    # help knows the chip
    pg.keyboard.press('?'); pg.wait_for_timeout(600)
    check('Help explains the chip', 'Automatic backup' in pg.inner_text('#help-list'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # narrower computer screen: just the icon
    pg.set_viewport_size({'width': 1000, 'height': 760}); pg.wait_for_timeout(500)
    c = pg.evaluate(CHIP)
    check('a narrower screen: the chip is just the folder icon', not c['hidden'] and c['w'] < 40, c)
    pg.set_viewport_size({'width': 1280, 'height': 800}); pg.wait_for_timeout(400)
    # remembered after a restart
    reopen(pg)
    c = pg.evaluate(CHIP)
    check('after a restart the chip is back (folder remembered)', not c['hidden'] and c['state'] in ('ok', 'paused'), c)
    # stop: the chip goes
    pg.evaluate(OPFS)
    pg.evaluate("() => window.__hp.app.folderDialog()"); pg.wait_for_timeout(600)
    pg.click('#bk-stop'); pg.wait_for_timeout(500)
    check('Stop: the chip is gone', pg.evaluate(CHIP)['hidden'] and pg.is_visible('#bk-choose'))
    pg.click('.scrim:last-child .dialog .dlg-foot button:has-text("Close")'); pg.wait_for_timeout(300)
    # the reminder on a computer: one tap downloads (and says where)
    age_backup(pg, 8)
    pg.evaluate("() => window.__hp.app.backupReminder()"); pg.wait_for_timeout(1500)
    ts = pg.evaluate(TOASTS)
    check('reminder (computer): “Save a copy”, and it points to the folder backup', any('8 days old' in x and 'Save a copy' in x and 'Automatic backup into a folder' in x for x in ts), ts)
    with pg.expect_download() as dl:
        pg.click('#toasts .toast:has-text("days old") button')
    check('… one tap: downloaded, the backup noted', dl.value.suggested_filename.endswith('.house.gz') and 0 <= pg.evaluate("() => Date.now() - window.__hp.app.lastBackupOf(window.__hp.app.project)") < 60000)
    check('PC: no page errors', not pg.errors, pg.errors[:3])
    b.close()

    # ───────── phone (dark) ─────────
    b, pg = open_app(p, phone=True, theme='dark')
    new_house(pg, 'Phone copy', True)
    pg.evaluate("() => { window.__hp.app.folderSupported = () => false; }")
    pg.evaluate(SHARE)
    check('phone: no folder chip', pg.evaluate(CHIP)['hidden'])
    age_backup(pg, 8)
    pg.evaluate("() => window.__hp.app.backupReminder()"); pg.wait_for_timeout(1500)
    ts = pg.evaluate(TOASTS)
    check('phone: the reminder says “Save a copy” (no folder talk on a phone)', any('8 days old' in x and 'Save a copy' in x and 'folder' not in x for x in ts), ts)
    pg.tap('#toasts .toast:has-text("days old") button'); pg.wait_for_timeout(1200)
    sh = pg.evaluate("() => window.__shared")
    check('… one tap: the compressed house file goes to the share sheet (Proton Drive, Files, mail …)', len(sh) == 1 and sh[0][0].endswith('.house.gz') and 'gzip' in sh[0][1] and sh[0][2] > 100, sh)
    check('… and the backup is noted', 0 <= pg.evaluate("() => Date.now() - window.__hp.app.lastBackupOf(window.__hp.app.project)") < 60000)
    # a phone that shares no compressed files: the plain house file
    pg.evaluate("() => { window.__shared = []; window.__shareTypes = f => !/gzip/.test(f.type); }")
    pg.evaluate("() => { window.__hp.app.quickBackup(window.__hp.app.project); }"); pg.wait_for_timeout(1500)
    sh = pg.evaluate("() => window.__shared")
    check('phone without compressed sharing: the plain .house.json is shared', len(sh) == 1 and sh[0][0].endswith('.house.json') and sh[0][3] == '{"', sh)
    # share sheet closed without choosing: nothing noted, no file downloaded
    pg.evaluate("() => { window.__hp.app.settings.backups = {}; navigator.share = async () => { throw new DOMException('cancelled', 'AbortError'); }; window.__shareTypes = null; }")
    r = pg.evaluate("() => window.__hp.app.quickBackup(window.__hp.app.project)")
    check('share sheet closed: nothing is noted as a backup', r is False and pg.evaluate("() => window.__hp.app.lastBackupOf(window.__hp.app.project)") == 0, r)
    vw = pg.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check('phone: nothing sticks out sideways', vw[0] <= vw[1], vw)
    check('phone: no page errors', not pg.errors, pg.errors[:3])
    b.close()
sys.exit(summary())
