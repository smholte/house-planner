"""Export for viewing: a page (.html) with the house inside that opens in View only, the viewer adds notes (the
owner's notes stay read-only), the notes survive reopening the page, Send notes back makes a notes file, and the
owner imports it (notes merged, with the viewer's name; undo). Also the .house.json variant for app users."""
import shutil
from common import *

APPDIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'house-planner-app') + os.sep
NOTES = "() => window.__hp.app.project.notes.map(n => ({ id: n.id, text: n.text, by: n.by || null, mine: !!n.mine }))"

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    # the owner's own note
    pg.click('#toolrail button[data-tool="note"]'); pg.wait_for_timeout(300)
    pg.mouse.click(*room_screen(pg, 'Keuken', 0.4, 0.45)); pg.wait_for_timeout(600)
    pg.fill('#f-note-text', 'Kitchen: check the socket heights'); pg.wait_for_timeout(600)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    owner_note = pg.evaluate(NOTES)[0]
    pg.click('#btn-share'); pg.wait_for_timeout(600)
    pg.click('#btn-export-viewer'); pg.wait_for_selector('#ve-from'); pg.wait_for_timeout(800)
    pg.fill('#ve-from', 'Alex'); pg.wait_for_timeout(900)
    size = pg.evaluate("() => document.querySelector('.dialog .kv dd').textContent")
    check('export for viewing: the size is shown', 'MB' in size, size)
    pg.screenshot(path=SHOTS + 'viewer-export.png')
    with pg.expect_download() as dl:
        pg.click('.dlg-foot button:has-text("Save file")')
    name = dl.value.suggested_filename
    html = open(dl.value.path(), encoding='utf-8').read()
    check('a page with the house inside', name.endswith('.html') and 'id="hp-viewer-data"' in html and html.rstrip().endswith('</html>'), name)
    shutil.copy(dl.value.path(), APPDIR + 'viewer-test.html')
    # the person who gets it
    ctx2 = b.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
    v = ctx2.new_page(); v.errors = []; v.on('pageerror', lambda e: v.errors.append(str(e)))
    url = BASE.replace('index.html', 'viewer-test.html')
    v.goto(url); v.wait_for_timeout(4000)
    st = v.evaluate("() => ({ mode: window.__hp.app.mode, viewer: window.__hp.app.project.viewer, id: window.__hp.app.project.id, versions: window.__hp.app.project.versions.length })")
    check('the page opens the house in View', st['mode'] == 'view' and st['viewer']['from'] == 'Alex' and st['id'].startswith('v_') and st['versions'] == 2, st)
    check('Build and Furnish are not there', not v.is_visible('#mode-switch button[data-mode="build"]') and not v.is_visible('#mode-switch button[data-mode="furnish"]'))
    v.evaluate("() => window.__hp.app.setMode('build')"); v.wait_for_timeout(300)
    check('switching to Build is refused', v.evaluate("() => window.__hp.app.mode") == 'view')
    v.evaluate("(id) => window.__hp.app.selectNote(id)", owner_note['id']); v.wait_for_timeout(400)
    check("the owner's note can be read, not changed", v.is_disabled('#f-note-text') and v.input_value('#f-note-text') == 'Kitchen: check the socket heights')
    v.keyboard.press('Escape'); v.wait_for_timeout(200)
    v.click('#toolrail button[data-tool="note"]'); v.wait_for_timeout(300)
    v.mouse.click(*v.evaluate(S2, [4.0, 9.0])); v.wait_for_timeout(700)
    v.fill('#f-note-text', 'Can the sofa face the garden?'); v.wait_for_timeout(600)
    mine = [n for n in v.evaluate(NOTES) if n['mine']]
    check('the viewer adds a note of their own', len(mine) == 1 and not v.is_disabled('#f-note-text'), mine)
    v.screenshot(path=SHOTS + 'viewer-note.png')
    v.goto(url); v.wait_for_timeout(3500)
    check('opening the page again keeps their note', [n['text'] for n in v.evaluate(NOTES) if n['mine']] == ['Can the sofa face the garden?'])
    v.click('#btn-share'); v.wait_for_selector('#sn-name'); v.fill('#sn-name', 'Anna')
    with v.expect_download() as dl2:
        v.click('.dlg-foot button:has-text("Save file")')
    notes_file = SHOTS + 'notes-back.json'
    shutil.copy(dl2.value.path(), notes_file)
    data = json.load(open(notes_file))
    check('Send notes back: a small file with their note and name', data['format'] == 'house-planner-notes' and len(data['notes']) == 1 and data['from'] == 'Anna' and data['notes'][0]['by'] == 'Anna', data.get('from'))
    check('no page errors in the viewer', not v.errors, v.errors)
    ctx2.close()
    os.remove(APPDIR + 'viewer-test.html')
    # the owner reads the notes back
    with pg.expect_file_chooser() as fc:
        pg.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(notes_file); pg.wait_for_timeout(1200)
    check('import shows who sent what', pg.is_visible('.dialog h2:has-text("Notes from Anna")'))
    pg.click('.dialog button:has-text("Add to the house")'); pg.wait_for_timeout(1200)
    got = pg.evaluate(NOTES)
    check("the viewer's note is in the house, with their name", len(got) == 2 and any(n['text'] == 'Can the sofa face the garden?' and n['by'] == 'Anna' and not n['mine'] for n in got), got)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    check('undo takes them out again', len(pg.evaluate(NOTES)) == 1)
    # the house-file variant, for someone with the app
    pg.click('#btn-share'); pg.wait_for_timeout(500)
    pg.click('#btn-export-viewer'); pg.wait_for_selector('#ve-from'); pg.wait_for_timeout(500)
    pg.click('.dialog [data-fmt="json"]'); pg.wait_for_timeout(900)
    with pg.expect_download() as dl3:
        pg.click('.dlg-foot button:has-text("Save file")')
    jf = SHOTS + 'viewer.house.json'
    shutil.copy(dl3.value.path(), jf)
    d3 = json.load(open(jf))
    check('house-file variant carries the viewer mark', dl3.value.suggested_filename.endswith('.house.json') and d3['viewer']['from'] == 'Alex')
    ctx3 = b.new_context(viewport={'width': 1280, 'height': 800})
    w = ctx3.new_page(); w.errors = []; w.on('pageerror', lambda e: w.errors.append(str(e)))
    w.goto(BASE); w.wait_for_timeout(800)
    with w.expect_file_chooser() as fc:
        w.evaluate("() => { window.__hp.app.importFlow(); }")
    fc.value.set_files(jf); w.wait_for_timeout(3500)
    check('an app user opens it as a viewer copy', w.evaluate("() => [window.__hp.app.mode, !!window.__hp.app.project.viewer]") == ['view', True])
    check('no page errors (app user)', not w.errors, w.errors)
    ctx3.close()
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
