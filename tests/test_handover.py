"""Handover list (opleverpunten): handover points as notes with a number on the pin, the steps found → reported →
fixed → checked with their dates, the list with filters, a spreadsheet (.csv) and a page to print or save as PDF."""
from common import *

SNAGS = "() => window.__hp.app.snags().map(n => ({ id: n.id, no: n.no, status: n.status, text: n.text, at: n.statusAt || {} }))"

def place(pg, room, text):
    pg.click('#toolrail button[data-tool="handover"]'); pg.wait_for_timeout(500)
    pg.click('.dlg-foot button:has-text("New handover point")'); pg.wait_for_timeout(300)
    pg.mouse.click(*room_screen(pg, room, 0.35, 0.45)); pg.wait_for_timeout(600)
    pg.fill('#f-note-text', text); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b, pg = open_app(p)
    open_example(pg)
    pg.click('#mode-switch button[data-mode="view"]'); pg.wait_for_timeout(800)
    place(pg, 'Woonkamer', 'Scratch in the window frame')
    place(pg, 'Keuken', 'Tile cracked near the sink\nSecond tile from the wall')
    S = pg.evaluate(SNAGS)
    check('two handover points, numbered 1 and 2', [s['no'] for s in S] == [1, 2] and all(s['status'] == 'open' for s in S), S)
    glyphs = pg.evaluate("() => [...document.querySelectorAll('.pin2d.pin-snag .pin-glyph')].map(t => t.textContent)")
    check('their pins show the numbers', sorted(glyphs) == ['1', '2'], glyphs)
    pg.click('.snag-status button[data-st="reported"]'); pg.wait_for_timeout(400)
    S = pg.evaluate(SNAGS)
    check('reported to the builder, with the date', S[1]['status'] == 'reported' and S[1]['at'].get('reported'), S[1])
    pg.screenshot(path=SHOTS + 'handover-point.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#toolrail button[data-tool="handover"]'); pg.wait_for_timeout(500)
    check('the list shows both', pg.evaluate("() => document.querySelectorAll('.snag-body .note-row').length") == 2)
    pg.click('.snag-body .seg button:has-text("Reported")'); pg.wait_for_timeout(300)
    rows = pg.evaluate("() => [...document.querySelectorAll('.snag-body .note-row .nr-title')].map(e => e.textContent)")
    check('filter: only the reported one', rows == ['#2 Tile cracked near the sink'], rows)
    pg.screenshot(path=SHOTS + 'handover-list.png')
    with pg.expect_download() as dl:
        pg.click('.dlg-foot button:has-text("Spreadsheet")')
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    lines = csv.strip().splitlines()
    check('spreadsheet with a line per point', len(lines) == 3 and 'Reported' in lines[2] and 'Scratch in the window frame' in lines[1], lines)
    html = pg.evaluate("() => window.__hp.app.handoverHtml()")
    check('a page to print with every point', 'Scratch in the window frame' in html and 'Second tile from the wall' in html and 'Handover list' in html)
    pg.evaluate("() => window.__hp.app.handoverPrint()"); pg.wait_for_timeout(800)
    check('print opens without errors', pg.evaluate("() => !!document.querySelector('iframe.print-frame')"))
    # numbers are never used twice
    first = pg.evaluate(SNAGS)[0]['id']
    pg.evaluate("(id) => window.__hp.app.deleteNote(id)", first); pg.wait_for_timeout(300)
    place(pg, 'Hal', 'Socket loose')
    check('a new point gets the next number', [s['no'] for s in pg.evaluate(SNAGS)] == [2, 3])
    text = pg.evaluate("async () => window.__hp.app.buildExport([window.__hp.app.project], false)")
    pr = json.loads(text)['projects'][0]['project']
    check('kept in the house file', sum(1 for n in pr['notes'] if n['type'] == 'snag') == 2 and pr.get('snagNo') == 3)
    check('no page errors', not pg.errors, pg.errors)
    b.close()
sys.exit(summary())
